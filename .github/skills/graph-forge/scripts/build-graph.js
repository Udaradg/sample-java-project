#!/usr/bin/env node
/**
 * Graph Forge
 * Loads the artifacts.json produced by Code Cartographer into an existing
 * Neo4j instance, modeling modules, packages, types, methods and their
 * connections (inheritance, containment, REST endpoints, field-based usage).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const neo4j = require('neo4j-driver');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DATA_DIR = process.env.ARCHITECT_DATA_DIR
  ? path.resolve(process.env.ARCHITECT_DATA_DIR)
  : path.join(REPO_ROOT, '.architect');
const ARTIFACTS_FILE = path.join(DATA_DIR, 'artifacts.json');

const MAPPING_ANNOTATIONS = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  DeleteMapping: 'DELETE',
  PatchMapping: 'PATCH',
  RequestMapping: 'ANY',
};

function simpleName(typeText) {
  if (!typeText) return null;
  return typeText.split('<')[0].trim();
}

function joinPath(base, extra) {
  const b = (base || '').replace(/^\/|\/$/g, '');
  const e = (extra || '').replace(/^\/|\/$/g, '');
  return '/' + [b, e].filter(Boolean).join('/');
}

async function main() {
  if (!fs.existsSync(ARTIFACTS_FILE)) {
    throw new Error(`No artifacts found at ${ARTIFACTS_FILE}. Run the Code Cartographer scan first.`);
  }
  const { modules, types } = JSON.parse(fs.readFileSync(ARTIFACTS_FILE, 'utf8'));

  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;
  if (!uri || !user || !password) {
    throw new Error('Missing NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD. Copy .env.example to .env and fill in your instance details.');
  }
  const database = process.env.NEO4J_DATABASE || 'neo4j';

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  await driver.verifyConnectivity();
  const session = driver.session({ database });

  const nameToId = new Map();
  for (const t of types) {
    if (!nameToId.has(t.name)) nameToId.set(t.name, t.id);
  }

  try {
    await session.executeWrite((tx) => tx.run(`
      CREATE CONSTRAINT module_name IF NOT EXISTS FOR (m:Module) REQUIRE m.name IS UNIQUE;
    `));
    await session.executeWrite((tx) => tx.run(`
      CREATE CONSTRAINT type_id IF NOT EXISTS FOR (t:Type) REQUIRE t.id IS UNIQUE;
    `));
    await session.executeWrite((tx) => tx.run(`
      CREATE CONSTRAINT external_type_name IF NOT EXISTS FOR (x:ExternalType) REQUIRE x.name IS UNIQUE;
    `));
    await session.executeWrite((tx) => tx.run(`
      CREATE CONSTRAINT package_name IF NOT EXISTS FOR (p:Package) REQUIRE p.name IS UNIQUE;
    `));
    await session.executeWrite((tx) => tx.run(`
      CREATE CONSTRAINT dependency_ga IF NOT EXISTS FOR (d:MavenDependency) REQUIRE d.ga IS UNIQUE;
    `));
    await session.executeWrite((tx) => tx.run(`
      CREATE CONSTRAINT endpoint_id IF NOT EXISTS FOR (e:Endpoint) REQUIRE e.id IS UNIQUE;
    `));

    // Modules + their Maven dependencies.
    await session.executeWrite((tx) => tx.run(
      `
      UNWIND $modules AS mod
      MERGE (m:Module {name: mod.name})
      SET m.path = mod.path, m.groupId = mod.groupId, m.version = mod.version, m.packaging = mod.packaging
      WITH m, mod
      UNWIND mod.dependencies AS dep
      MERGE (d:MavenDependency {ga: dep.groupId + ':' + dep.artifactId})
      SET d.groupId = dep.groupId, d.artifactId = dep.artifactId
      MERGE (m)-[:DEPENDS_ON]->(d)
      `,
      { modules }
    ));

    // Packages + Types (+ containment).
    await session.executeWrite((tx) => tx.run(
      `
      UNWIND $types AS t
      MERGE (p:Package {name: t.package})
      MERGE (ty:Type {id: t.id})
      SET ty.name = t.name, ty.kind = t.kind, ty.module = t.module, ty.package = t.package, ty.file = t.file,
          ty.annotations = [a IN t.annotations | a.name]
      MERGE (m:Module {name: t.module})
      MERGE (m)-[:CONTAINS]->(p)
      MERGE (p)-[:CONTAINS]->(ty)
      MERGE (m)-[:CONTAINS]->(ty)
      `,
      { types: types.map((t) => ({ id: t.id, name: t.name, kind: t.kind, module: t.module, package: t.package, file: t.file, annotations: t.annotations })) }
    ));

    // Inheritance: extends -> EXTENDS, implements -> EXTENDS (interface) or IMPLEMENTS (class).
    const inheritanceRows = [];
    for (const t of types) {
      for (const raw of t.extends || []) {
        inheritanceRows.push({ fromId: t.id, targetName: simpleName(raw), relType: 'EXTENDS' });
      }
      for (const raw of t.implements || []) {
        inheritanceRows.push({ fromId: t.id, targetName: simpleName(raw), relType: t.kind === 'interface' ? 'EXTENDS' : 'IMPLEMENTS' });
      }
    }
    for (const relType of ['EXTENDS', 'IMPLEMENTS']) {
      const rows = inheritanceRows
        .filter((r) => r.relType === relType)
        .map((r) => ({ fromId: r.fromId, targetId: nameToId.get(r.targetName) || null, targetName: r.targetName }));
      await session.executeWrite((tx) => tx.run(
        `
        UNWIND $rows AS r
        MATCH (from:Type {id: r.fromId})
        FOREACH (_ IN CASE WHEN r.targetId IS NOT NULL THEN [1] ELSE [] END |
          MERGE (to:Type {id: r.targetId})
          MERGE (from)-[:${relType}]->(to)
        )
        FOREACH (_ IN CASE WHEN r.targetId IS NULL THEN [1] ELSE [] END |
          MERGE (to:ExternalType {name: r.targetName})
          MERGE (from)-[:${relType}]->(to)
        )
        `,
        { rows }
      ));
    }

    // Methods, per type (method id includes a param signature to disambiguate overloads).
    const methodRows = [];
    for (const t of types) {
      for (const meth of t.methods) {
        const paramSig = (meth.params || []).map((p) => p.type).join(',');
        methodRows.push({ typeId: t.id, methodId: `${t.id}#${meth.name}(${paramSig})`, name: meth.name, returnType: meth.returnType });
      }
    }
    await session.executeWrite((tx) => tx.run(
      `
      UNWIND $rows AS r
      MATCH (ty:Type {id: r.typeId})
      MERGE (me:Method {id: r.methodId})
      SET me.name = r.name, me.returnType = r.returnType
      MERGE (ty)-[:HAS_METHOD]->(me)
      `,
      { rows: methodRows }
    ));

    // REST endpoints derived from method + class-level mapping annotations.
    const endpointRows = [];
    for (const t of types) {
      const classMapping = (t.annotations || []).find((a) => a.name === 'RequestMapping');
      const basePath = classMapping ? classMapping.args.value || '' : '';
      for (const meth of t.methods) {
        const mapping = (meth.annotations || []).find((a) => MAPPING_ANNOTATIONS[a.name]);
        if (!mapping) continue;
        const httpMethod = MAPPING_ANNOTATIONS[mapping.name];
        const fullPath = joinPath(basePath, mapping.args.value || mapping.args.path || '');
        endpointRows.push({
          id: `${httpMethod} ${fullPath}`,
          method: httpMethod,
          path: fullPath,
          typeId: t.id,
          methodName: meth.name,
        });
      }
    }
    await session.executeWrite((tx) => tx.run(
      `
      UNWIND $rows AS r
      MERGE (e:Endpoint {id: r.id})
      SET e.method = r.method, e.path = r.path
      WITH e, r
      MATCH (ty:Type {id: r.typeId})
      MERGE (ty)-[:EXPOSES]->(e)
      `,
      { rows: endpointRows }
    ));

    // Field-based USES edges between known types (best-effort dependency signal).
    const usesRows = [];
    for (const t of types) {
      for (const f of t.fields || []) {
        const targetName = simpleName(f.type);
        const targetId = nameToId.get(targetName);
        if (targetId && targetId !== t.id) usesRows.push({ fromId: t.id, toId: targetId });
      }
    }
    await session.executeWrite((tx) => tx.run(
      `
      UNWIND $rows AS r
      MATCH (from:Type {id: r.fromId})
      MATCH (to:Type {id: r.toId})
      MERGE (from)-[:USES]->(to)
      `,
      { rows: usesRows }
    ));

    console.log(`Graph Forge: loaded ${modules.length} module(s), ${types.length} type(s), ${inheritanceRows.length} inheritance edge(s), ${endpointRows.length} endpoint(s), ${usesRows.length} uses edge(s) into Neo4j.`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('Graph Forge failed:', err.message);
  process.exit(1);
});
