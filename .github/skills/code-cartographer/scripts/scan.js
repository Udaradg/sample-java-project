#!/usr/bin/env node
/**
 * Code Cartographer
 * Walks every Maven module in the workspace, parses pom.xml + *.java sources
 * into an AST (tree-sitter), and emits a normalized artifacts.json describing
 * modules, packages, types (classes/interfaces/enums/records), fields, methods
 * and annotations. Consumed by the Graph Forge and Blueprint Scribe skills.
 */
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { XMLParser } = require('fast-xml-parser');
const Parser = require('web-tree-sitter');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DATA_DIR = process.env.ARCHITECT_DATA_DIR
  ? path.resolve(process.env.ARCHITECT_DATA_DIR)
  : path.join(REPO_ROOT, '.architect');
const OUT_FILE = path.join(DATA_DIR, 'artifacts.json');

const IGNORE_GLOBS = ['**/target/**', '**/node_modules/**', '**/.git/**', '**/.architect/**'];

function findWasm() {
  const pkgJson = require.resolve('tree-sitter-wasms/package.json');
  return path.join(path.dirname(pkgJson), 'out', 'tree-sitter-java.wasm');
}

async function loadParser() {
  await Parser.init();
  const parser = new Parser();
  const Java = await Parser.Language.load(findWasm());
  parser.setLanguage(Java);
  return parser;
}

async function findModules() {
  const pomFiles = await glob('**/pom.xml', { cwd: REPO_ROOT, ignore: IGNORE_GLOBS, absolute: true });
  const xmlParser = new XMLParser({ ignoreAttributes: false });
  const modules = [];
  for (const pomPath of pomFiles) {
    const modDir = path.dirname(pomPath);
    const xml = xmlParser.parse(fs.readFileSync(pomPath, 'utf8'));
    const project = xml.project || {};
    const groupId = project.groupId || project.parent?.groupId || '';
    const version = project.version || project.parent?.version || '';
    const dependencies = []
      .concat(project.dependencies?.dependency || [])
      .filter(Boolean)
      .map((d) => ({
        groupId: String(d.groupId ?? ''),
        artifactId: String(d.artifactId ?? ''),
        version: d.version !== undefined ? String(d.version) : null,
      }));
    modules.push({
      name: String(project.artifactId || path.basename(modDir)),
      path: path.relative(REPO_ROOT, modDir).replace(/\\/g, '/'),
      groupId: String(groupId),
      version: String(version),
      packaging: String(project.packaging || 'jar'),
      dependencies,
    });
  }
  return modules;
}

function textOf(node) {
  return node ? node.text : null;
}

// package_declaration / import_declaration have no named field for the identifier,
// so pull the scoped_identifier/identifier child directly.
function nameChild(node) {
  const child = node.children.find((c) => c.type === 'identifier' || c.type === 'scoped_identifier');
  return child ? child.text : null;
}

function collectAnnotations(modifiersNode) {
  if (!modifiersNode) return [];
  const annotations = [];
  for (const child of modifiersNode.children) {
    if (child.type === 'marker_annotation') {
      const nameNode = child.childForFieldName('name');
      annotations.push({ name: nameNode ? nameNode.text : child.text, args: {} });
    } else if (child.type === 'annotation') {
      const nameNode = child.childForFieldName('name');
      const argsNode = child.childForFieldName('arguments');
      const args = {};
      if (argsNode) {
        const pairs = argsNode.children.filter((c) => c.type === 'element_value_pair');
        if (pairs.length) {
          for (const pair of pairs) {
            const key = pair.childForFieldName('key');
            const value = pair.childForFieldName('value');
            args[key ? key.text : '?'] = value ? value.text.replace(/^"|"$/g, '') : null;
          }
        } else {
          // single element_value, e.g. @RequestMapping("/api")
          const valueNode = argsNode.children.find((c) => c.type !== '(' && c.type !== ')');
          if (valueNode) args.value = valueNode.text.replace(/^"|"$/g, '');
        }
      }
      annotations.push({ name: nameNode ? nameNode.text : child.text, args });
    }
  }
  return annotations;
}

function modifiersOf(node) {
  return node.children.find((c) => c.type === 'modifiers') || null;
}

function typeTextOf(fieldNode) {
  // superclass/interfaces wrap `extends`/`implements` keyword + type(s); strip the keyword.
  if (!fieldNode) return [];
  const types = fieldNode.children.filter((c) => c.type !== 'extends' && c.type !== 'implements' && c.type !== 'type_list');
  const typeList = fieldNode.children.find((c) => c.type === 'type_list');
  if (typeList) return typeList.children.filter((c) => c.type.endsWith('type_identifier') || c.type === 'generic_type' || c.type === 'scoped_type_identifier').map((c) => c.text);
  return types.filter((c) => c.type.endsWith('type_identifier') || c.type === 'generic_type' || c.type === 'scoped_type_identifier').map((c) => c.text);
}

function parseMethod(node) {
  const nameNode = node.childForFieldName('name');
  const typeNode = node.childForFieldName('type');
  const paramsNode = node.childForFieldName('parameters');
  const params = paramsNode
    ? paramsNode.children
        .filter((c) => c.type === 'formal_parameter' || c.type === 'spread_parameter')
        .map((p) => ({
          type: textOf(p.childForFieldName('type')),
          name: (() => {
            const idNode = p.children.find((c) => c.type === 'identifier');
            return idNode ? idNode.text : null;
          })(),
        }))
    : [];
  return {
    name: nameNode ? nameNode.text : null,
    returnType: textOf(typeNode),
    params,
    annotations: collectAnnotations(modifiersOf(node)),
  };
}

function parseField(node) {
  const typeNode = node.childForFieldName('type');
  const declarators = node.children.filter((c) => c.type === 'variable_declarator');
  const annotations = collectAnnotations(modifiersOf(node));
  return declarators.map((d) => {
    const nameNode = d.childForFieldName('name');
    return { name: nameNode ? nameNode.text : null, type: textOf(typeNode), annotations };
  });
}

function parseType(node, kind, ctx) {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? nameNode.text : null;
  const modifiers = modifiersOf(node);
  const annotations = collectAnnotations(modifiers);
  const superclassField = node.childForFieldName('superclass');
  const interfacesField = node.childForFieldName('interfaces');
  const extendsInterfaces = node.children.find((c) => c.type === 'extends_interfaces');

  const methods = [];
  const fields = [];
  const bodyNode = node.childForFieldName('body');
  if (bodyNode) {
    for (const child of bodyNode.children) {
      if (child.type === 'method_declaration' || child.type === 'constructor_declaration') {
        methods.push(parseMethod(child));
      } else if (child.type === 'field_declaration' || child.type === 'constant_declaration') {
        fields.push(...parseField(child));
      }
    }
  }

  return {
    id: ctx.packageName ? `${ctx.packageName}.${name}` : name,
    name,
    kind,
    module: ctx.moduleName,
    package: ctx.packageName,
    file: ctx.relFile,
    annotations,
    extends: typeTextOf(superclassField),
    implements: [...typeTextOf(interfacesField), ...typeTextOf(extendsInterfaces)],
    fields,
    methods,
  };
}

async function parseJavaFile(parser, absFile, moduleName) {
  const source = fs.readFileSync(absFile, 'utf8');
  const tree = parser.parse(source);
  const relFile = path.relative(REPO_ROOT, absFile).replace(/\\/g, '/');

  let packageName = null;
  const imports = [];
  const types = [];

  for (const node of tree.rootNode.children) {
    if (node.type === 'package_declaration') {
      packageName = nameChild(node);
    } else if (node.type === 'import_declaration') {
      const n = nameChild(node);
      if (n) imports.push(n);
    } else if (['class_declaration', 'record_declaration'].includes(node.type)) {
      types.push(parseType(node, node.type === 'record_declaration' ? 'record' : 'class', { packageName, moduleName, relFile }));
    } else if (node.type === 'interface_declaration') {
      types.push(parseType(node, 'interface', { packageName, moduleName, relFile }));
    } else if (node.type === 'enum_declaration') {
      types.push(parseType(node, 'enum', { packageName, moduleName, relFile }));
    }
  }

  return { file: relFile, module: moduleName, package: packageName, imports, types };
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const modules = await findModules();
  const parser = await loadParser();

  const files = [];
  const types = [];

  for (const mod of modules) {
    const modAbsPath = path.join(REPO_ROOT, mod.path);
    const javaFiles = await glob('src/main/java/**/*.java', { cwd: modAbsPath, ignore: IGNORE_GLOBS, absolute: true });
    for (const javaFile of javaFiles) {
      const parsed = await parseJavaFile(parser, javaFile, mod.name);
      files.push({ file: parsed.file, module: parsed.module, package: parsed.package, imports: parsed.imports });
      types.push(...parsed.types);
    }
  }

  const artifacts = {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    modules,
    files,
    types,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(artifacts, null, 2));
  console.log(`Code Cartographer: scanned ${modules.length} module(s), ${files.length} file(s), ${types.length} type(s).`);
  console.log(`Artifacts written to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('Code Cartographer failed:', err);
  process.exit(1);
});
