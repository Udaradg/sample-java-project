/**
 * Version Migration — reading the code knowledge graph.
 *
 * A migration is a change to *everything at once*, so the question that decides how risky it is
 * is not "what does this file do" but "what is coupled to the framework, and what depends on
 * that". The graph built by 01a-code-cartographer -> 01b-context-weaver -> 01c-graph-forge answers
 * exactly that question, so this module reads it and hands the migration agent an architecture
 * briefing before a single version is changed.
 *
 * Two sources, in order of preference:
 *
 *   1. **Neo4j, live** — the real graph, including the `ctx*` semantic layer (what a node is for,
 *      how it fails, how critical it is). Credentials come from `01c-graph-forge/.env`, the same
 *      file 02 and 03 read, with an optional local `.env` in this skill folder overriding it.
 *   2. **`.github/.pipeline-context/artifacts.json`** — the static AST artifacts the graph was
 *      built from, plus `context/descriptions.json` if present. Same shape of answer, no traversal.
 *
 * This skill stays zero-dependency: `neo4j-driver` is *borrowed* from whichever sibling skill has
 * it installed rather than declared here, and the `.env` reader is a dozen lines rather than a
 * dotenv dependency. If the graph pipeline was never run, neither is available and the caller is
 * told plainly — a migration without the graph is still a valid migration, just a less informed one.
 *
 * Nothing here writes to the project, to Neo4j, or to any other skill's folder.
 */
const fs = require('fs');
const path = require('path');
const { SKILL_DIR, DATA_DIR, rel } = require('./migration');

const SKILLS_DIR = path.resolve(SKILL_DIR, '..');
const ARTIFACTS_FILE = path.join(DATA_DIR, 'artifacts.json');
const DESCRIPTIONS_FILE = path.join(DATA_DIR, 'context', 'descriptions.json');

// Where a Neo4j connection may be described, most specific first. This skill has no .env of its
// own by default: the graph belongs to 01c-graph-forge and the credentials live with it, so there
// is exactly one copy to rotate.
const ENV_CANDIDATES = [
  path.join(SKILL_DIR, '.env'),
  path.join(SKILLS_DIR, '01c-graph-forge', '.env'),
  path.join(SKILLS_DIR, '02-root-cause-analyst', '.env'),
  path.join(SKILLS_DIR, '03-blast-radius-analyst', '.env'),
];

// Skills that declare neo4j-driver. Whichever one has been `npm install`ed lends us its copy.
const DRIVER_CANDIDATES = ['01c-graph-forge', '02-root-cause-analyst', '03-blast-radius-analyst']
  .map((skill) => path.join(SKILLS_DIR, skill));

// ---------------------------------------------------------------------------
// Connection details
// ---------------------------------------------------------------------------

/** `KEY=value` lines, `#` comments, optional surrounding quotes. No dependency, no side effects. */
function parseEnvFile(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Connection details from the first .env that carries a URI, or from the ambient environment.
 * The password is read but never returned to a caller that renders — see `redactUri`.
 */
function readConnection() {
  for (const file of ENV_CANDIDATES) {
    if (!fs.existsSync(file)) continue;
    const env = parseEnvFile(file);
    if (env.NEO4J_URI && env.NEO4J_USERNAME && env.NEO4J_PASSWORD) {
      return {
        uri: env.NEO4J_URI,
        username: env.NEO4J_USERNAME,
        password: env.NEO4J_PASSWORD,
        database: env.NEO4J_DATABASE || 'neo4j',
        envFile: rel(file),
      };
    }
  }
  if (process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD) {
    return {
      uri: process.env.NEO4J_URI,
      username: process.env.NEO4J_USERNAME,
      password: process.env.NEO4J_PASSWORD,
      database: process.env.NEO4J_DATABASE || 'neo4j',
      envFile: 'process environment',
    };
  }
  return null;
}

/** Host only — never the credentials. Safe to print and to write into a report. */
const redactUri = (uri) => String(uri || '').replace(/\/\/[^@]*@/, '//');

function loadDriver() {
  try {
    return { module: require(require.resolve('neo4j-driver', { paths: DRIVER_CANDIDATES })) };
  } catch (error) {
    return {
      module: null,
      reason: 'neo4j-driver is not installed in any sibling skill — run `npm install` in '
        + '.github/skills/01c-graph-forge (this skill borrows the driver rather than declaring it).',
    };
  }
}

// ---------------------------------------------------------------------------
// The queries
//
// Every one of these is chosen for what it tells a *migration*, not for what it tells a reader
// generally. A framework-generation jump breaks code at exactly the points where the application
// touches the framework: base types it extends, annotations it is wired by, starters it depends
// on. Those points, and what depends on them, are the whole risk model.
// ---------------------------------------------------------------------------

const QUERIES = [
  {
    key: 'node_counts',
    title: 'What the graph holds',
    why: 'Confirms the graph is real and current before anything is read out of it.',
    cypher: 'MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY count DESC',
  },
  {
    key: 'modules',
    title: 'Modules',
    why: 'The units a version change is declared in — one build descriptor each.',
    cypher: `MATCH (m:Module)
      OPTIONAL MATCH (m)-[:CONTAINS]->(t:Type)
      RETURN m.name AS module, count(DISTINCT t) AS types, m.ctxSummary AS summary
      ORDER BY types DESC`,
  },
  {
    key: 'dependencies',
    title: 'Declared dependencies',
    why: 'Every coordinate whose version, name or module may move in the jump.',
    cypher: `MATCH (m:Module)-[:DEPENDS_ON]->(d:MavenDependency)
      RETURN m.name AS module, d.ga AS coordinate, d.version AS version
      ORDER BY coordinate`,
  },
  {
    key: 'framework_touchpoints',
    title: 'Framework touchpoints',
    why: 'Types extending or implementing something defined outside this repo. In a generation '
      + 'jump these break first — a moved package or a changed signature lands here before anywhere else.',
    cypher: `MATCH (t:Type)-[r:EXTENDS|IMPLEMENTS]->(x:ExternalType)
      RETURN x.name AS external, type(r) AS relation,
             collect(DISTINCT {type: t.name, file: t.file, module: t.module}) AS types,
             count(DISTINCT t) AS type_count
      ORDER BY type_count DESC, external`,
  },
  {
    key: 'annotations',
    title: 'Framework wiring by annotation',
    why: 'Annotations are the other coupling surface: they name the framework contract each type '
      + 'is wired by, and a generation jump renames, relocates or retires some of them.',
    cypher: `MATCH (t:Type)
      WHERE t.annotations IS NOT NULL AND size(t.annotations) > 0
      UNWIND t.annotations AS annotation
      RETURN annotation,
             count(DISTINCT t) AS type_count,
             collect(DISTINCT t.file)[0..12] AS files
      ORDER BY type_count DESC, annotation`,
  },
  {
    key: 'endpoints',
    title: 'REST surface',
    why: 'The contract the migration must preserve — and the source of the runtime probe list.',
    cypher: `MATCH (t:Type)-[:EXPOSES]->(e:Endpoint)
      RETURN e.method AS method, e.path AS path, t.name AS controller, t.file AS file,
             e.ctxSummary AS summary, e.ctxCriticality AS criticality, e.ctxTestHints AS test_hints
      ORDER BY path, method`,
  },
  {
    key: 'hotspots',
    title: 'Change hotspots',
    why: 'Types the rest of the code leans on. A migration edit here reaches furthest, so these '
      + 'rank the blast radius of each predicted change.',
    cypher: `MATCH (t:Type)<-[:USES]-(other:Type)
      RETURN t.name AS type, t.file AS file, t.module AS module,
             count(DISTINCT other) AS dependents, t.ctxCriticality AS criticality, t.ctxRole AS role
      ORDER BY dependents DESC LIMIT 25`,
  },
  {
    key: 'critical_nodes',
    title: 'Critical areas (semantic layer)',
    why: 'Where a regression would do the most damage, as judged when the graph was described. '
      + 'Drives what the behaviour probes must cover.',
    cypher: `MATCH (n)
      WHERE n.ctxCriticality IN ['critical', 'high'] AND n.ctxSummary IS NOT NULL
      RETURN labels(n)[0] AS kind, coalesce(n.name, n.id) AS id, n.ctxCriticality AS criticality,
             n.ctxRole AS role, n.ctxSummary AS summary, n.ctxFailureModes AS failure_modes,
             n.ctxStale AS stale
      ORDER BY CASE n.ctxCriticality WHEN 'critical' THEN 0 ELSE 1 END, id LIMIT 40`,
  },
  {
    key: 'context_notes',
    title: 'Cross-cutting facts',
    why: 'Couplings with no code edge — a shared datastore, an external service. Nothing in a '
      + 'build round will surface these, so the plan has to carry them.',
    cypher: `MATCH (c:ContextNote)-[:ABOUT]->(n)
      RETURN c.topic AS topic, c.ctxSummary AS summary, c.ctxConfidence AS confidence,
             collect(DISTINCT coalesce(n.name, n.id)) AS about`,
  },
  {
    key: 'staleness',
    title: 'Graph freshness',
    why: 'A description written for an older shape of the code is not evidence. Anything stale is '
      + 'reported as such rather than quietly used.',
    cypher: `MATCH (n) WHERE n.ctxSummary IS NOT NULL
      RETURN labels(n)[0] AS kind, count(*) AS described,
             sum(CASE WHEN n.ctxStale THEN 1 ELSE 0 END) AS stale
      ORDER BY described DESC`,
  },
];

// ---------------------------------------------------------------------------
// Live read
// ---------------------------------------------------------------------------

/** Neo4j integers are {low, high}; dates and nested maps come back as plain objects. */
function plain(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    if (typeof value.low === 'number' && typeof value.high === 'number') {
      return value.high === 0 ? value.low : Number(`${value.high}${value.low}`);
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = plain(v);
    return out;
  }
  return value;
}

async function readLiveGraph() {
  const connection = readConnection();
  if (!connection) {
    return { live: false, reason: `No Neo4j credentials found (looked in ${ENV_CANDIDATES.map((f) => rel(f)).join(', ')}).` };
  }
  const { module: neo4j, reason } = loadDriver();
  if (!neo4j) return { live: false, reason, envFile: connection.envFile };

  const driver = neo4j.driver(connection.uri, neo4j.auth.basic(connection.username, connection.password));
  const result = {
    live: true,
    source: 'neo4j',
    host: redactUri(connection.uri),
    database: connection.database,
    env_file: connection.envFile,
    read_at: new Date().toISOString(),
    sections: {},
    queries: [],
  };

  let session;
  try {
    await driver.verifyConnectivity();
    session = driver.session({ database: connection.database });
    for (const query of QUERIES) {
      try {
        const res = await session.run(query.cypher);
        result.sections[query.key] = res.records.map((r) => plain(r.toObject()));
        result.queries.push({ key: query.key, title: query.title, why: query.why, cypher: query.cypher.replace(/\s+/g, ' ').trim(), rows: res.records.length });
      } catch (error) {
        result.sections[query.key] = [];
        result.queries.push({ key: query.key, title: query.title, why: query.why, cypher: query.cypher.replace(/\s+/g, ' ').trim(), rows: 0, error: error.message });
      }
    }
  } catch (error) {
    return { live: false, reason: `Neo4j unreachable (${error.message}).`, envFile: connection.envFile, host: redactUri(connection.uri) };
  } finally {
    if (session) await session.close();
    await driver.close();
  }
  return result;
}

// ---------------------------------------------------------------------------
// Static fallback — the same answers, derived from artifacts.json
// ---------------------------------------------------------------------------

const MAPPING_ANNOTATIONS = {
  GetMapping: 'GET', PostMapping: 'POST', PutMapping: 'PUT', DeleteMapping: 'DELETE', PatchMapping: 'PATCH',
};

const simpleName = (text) => String(text || '').split('<')[0].trim().split('.').pop();

function annotationValue(annotation) {
  const raw = annotation && (annotation.value || annotation.path || '');
  const m = /["']([^"']+)["']/.exec(String(raw));
  return m ? m[1] : '';
}

function readStaticGraph() {
  if (!fs.existsSync(ARTIFACTS_FILE)) {
    return {
      live: false,
      source: null,
      reason: `No graph and no ${rel(ARTIFACTS_FILE)} — run the 01a-code-cartographer scan (and 01c-graph-forge) to build one.`,
    };
  }
  const artifacts = JSON.parse(fs.readFileSync(ARTIFACTS_FILE, 'utf8'));
  const descriptions = fs.existsSync(DESCRIPTIONS_FILE)
    ? JSON.parse(fs.readFileSync(DESCRIPTIONS_FILE, 'utf8'))
    : null;
  const types = artifacts.types || [];
  const byId = new Map(types.map((t) => [t.id, t]));
  const descById = new Map();
  for (const d of (descriptions && (descriptions.descriptions || descriptions.nodes || [])) || []) {
    if (d && d.id) descById.set(d.id, d);
  }

  const sections = {};

  sections.node_counts = [
    { label: 'Type', count: types.length },
    { label: 'Module', count: (artifacts.modules || []).length },
    { label: 'Method', count: types.reduce((n, t) => n + (t.methods || []).length, 0) },
  ];

  sections.modules = (artifacts.modules || []).map((m) => ({
    module: m.name,
    types: types.filter((t) => t.module === m.name).length,
    summary: null,
  })).sort((a, b) => b.types - a.types);

  sections.dependencies = [];
  for (const m of artifacts.modules || []) {
    for (const d of m.dependencies || []) {
      sections.dependencies.push({
        module: m.name,
        coordinate: `${d.groupId}:${d.artifactId}`,
        version: d.version || null,
      });
    }
  }

  const external = new Map();
  for (const t of types) {
    for (const [raw, relation] of [
      ...(t.extends || []).map((x) => [x, 'EXTENDS']),
      ...(t.implements || []).map((x) => [x, t.kind === 'interface' ? 'EXTENDS' : 'IMPLEMENTS']),
    ]) {
      const name = simpleName(raw);
      // Anything resolvable inside the repo is not a framework touchpoint.
      if (types.some((other) => other.name === name)) continue;
      const key = `${name}|${relation}`;
      const entry = external.get(key) || { external: name, relation, types: [], type_count: 0 };
      entry.types.push({ type: t.name, file: t.file, module: t.module });
      entry.type_count += 1;
      external.set(key, entry);
    }
  }
  sections.framework_touchpoints = [...external.values()].sort((a, b) => b.type_count - a.type_count);

  const annotations = new Map();
  for (const t of types) {
    for (const a of t.annotations || []) {
      const entry = annotations.get(a.name) || { annotation: a.name, type_count: 0, files: [] };
      entry.type_count += 1;
      if (entry.files.length < 12 && !entry.files.includes(t.file)) entry.files.push(t.file);
      annotations.set(a.name, entry);
    }
  }
  sections.annotations = [...annotations.values()].sort((a, b) => b.type_count - a.type_count);

  sections.endpoints = [];
  for (const t of types) {
    const classMapping = (t.annotations || []).find((a) => a.name === 'RequestMapping');
    const base = classMapping ? annotationValue(classMapping) : '';
    for (const meth of t.methods || []) {
      const mapping = (meth.annotations || []).find((a) => MAPPING_ANNOTATIONS[a.name]);
      if (!mapping) continue;
      const suffix = annotationValue(mapping);
      const full = `${base}${suffix}`.replace(/\/{2,}/g, '/') || '/';
      sections.endpoints.push({
        method: MAPPING_ANNOTATIONS[mapping.name],
        path: full,
        controller: t.name,
        file: t.file,
        summary: null,
        criticality: null,
        test_hints: null,
      });
    }
  }
  sections.endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  const dependents = new Map();
  for (const t of types) {
    for (const f of t.fields || []) {
      const target = types.find((other) => other.name === simpleName(f.type));
      if (!target || target.id === t.id) continue;
      const entry = dependents.get(target.id) || new Set();
      entry.add(t.id);
      dependents.set(target.id, entry);
    }
  }
  sections.hotspots = [...dependents.entries()]
    .map(([id, set]) => {
      const t = byId.get(id);
      const d = descById.get(id) || {};
      return {
        type: t ? t.name : id,
        file: t ? t.file : null,
        module: t ? t.module : null,
        dependents: set.size,
        criticality: d.criticality || null,
        role: d.role || null,
      };
    })
    .sort((a, b) => b.dependents - a.dependents)
    .slice(0, 25);

  sections.critical_nodes = [...descById.values()]
    .filter((d) => ['critical', 'high'].includes(d.criticality))
    .slice(0, 40)
    .map((d) => ({
      kind: d.kind || 'Type',
      id: d.id,
      criticality: d.criticality,
      role: d.role || null,
      summary: d.summary || null,
      failure_modes: d.failureModes || d.failure_modes || null,
      stale: null,
    }));

  sections.context_notes = [];
  sections.staleness = [];

  return {
    live: false,
    source: 'artifacts.json',
    read_at: new Date().toISOString(),
    artifacts_file: rel(ARTIFACTS_FILE),
    artifacts_generated_at: artifacts.generatedAt || null,
    descriptions_file: descriptions ? rel(DESCRIPTIONS_FILE) : null,
    sections,
    queries: QUERIES.map((q) => ({ key: q.key, title: q.title, why: q.why, cypher: null, rows: (sections[q.key] || []).length })),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Live graph if it is reachable, static artifacts otherwise, and an honest `source` either way.
 * A caller must never present artifacts.json output as "the graph said" — the `source` field is
 * carried into the plan report for exactly that reason.
 */
async function collectGraph({ preferStatic = false } = {}) {
  if (!preferStatic) {
    const live = await readLiveGraph();
    if (live.live) return live;
    const staticGraph = readStaticGraph();
    return { ...staticGraph, live_attempt_failed: live.reason || null, env_file: live.envFile || null };
  }
  return readStaticGraph();
}

module.exports = {
  ARTIFACTS_FILE,
  DESCRIPTIONS_FILE,
  ENV_CANDIDATES,
  QUERIES,
  parseEnvFile,
  readConnection,
  redactUri,
  collectGraph,
  readLiveGraph,
  readStaticGraph,
};
