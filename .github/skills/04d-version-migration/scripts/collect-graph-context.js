#!/usr/bin/env node
/**
 * Version Migration — Step 2: read the architecture out of the code knowledge graph.
 *
 * A framework-generation jump does not break code at random. It breaks it at the points where the
 * application touches the framework — the base types it extends, the annotations it is wired by,
 * the starters it declares — and the damage spreads from there along the dependency edges. The
 * graph built by 01a-code-cartographer -> 01b-context-weaver -> 01c-graph-forge holds precisely
 * those two things, so this script reads it and writes an architecture briefing the migration
 * agent reads *before* proposing anything.
 *
 * What that buys the migration, concretely:
 *   - the predicted change list is derived from real coupling, not from guessing which files
 *     a reference pack's rules might land in;
 *   - every predicted change carries a blast radius (how many types depend on it, how critical
 *     the graph says it is), so the plan can be ranked instead of listed;
 *   - the REST surface comes out of the graph, so the runtime probe list covers the real
 *     contract rather than whatever endpoints were remembered.
 *
 * Reads the live Neo4j graph when it is reachable and falls back to
 * `.github/.pipeline-context/artifacts.json` when it is not. Which one was used is recorded and
 * printed — a static read is a weaker source and is never presented as "the graph said".
 *
 * Writes `<session>/graph-context.json` (machine-readable) and `<session>/graph-context.md`
 * (the briefing to read). Touches nothing in the project and writes nothing to Neo4j.
 *
 * Usage:
 *   node scripts/collect-graph-context.js --slug <slug>
 *   node scripts/collect-graph-context.js --slug <slug> --static   # skip Neo4j, use artifacts.json
 */
const fs = require('fs');
const path = require('path');
const { sessionPaths, readJson, writeJson, rel } = require('./lib/migration');
const { collectGraph } = require('./lib/graph');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slug' || a === '-s') args.slug = argv[++i];
    else if (a === '--static') args.static = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Version Migration — Graph context

  node scripts/collect-graph-context.js --slug <slug> [--static]

Options:
  --slug, -s   Session name used by detect-baseline.js
  --static     Do not contact Neo4j; derive the same briefing from artifacts.json
  --json       Print the collected context as JSON instead of a summary
  --help, -h   Show this message`);
}

// ---------------------------------------------------------------------------
// Migration-specific reading of the graph
//
// The graph is generic; a migration cares about a particular slice of it. These helpers turn
// raw rows into the two things a migration plan is built out of: where the framework is touched,
// and how far a change there reaches.
// ---------------------------------------------------------------------------

/**
 * Files ranked by how exposed they are to a framework change.
 *
 * Exposure is coupling to something the migration is moving: an external base type, a framework
 * annotation, an exposed endpoint. The score orders the plan's predicted-change list; it is a
 * ranking device, not a measurement, and the report says so wherever it is shown.
 */
function frameworkExposure(sections) {
  const files = new Map();
  const touch = (file, kind, detail) => {
    if (!file) return;
    const entry = files.get(file) || { file, external_types: [], annotations: [], endpoints: [], types: new Set(), score: 0 };
    if (kind === 'external' && !entry.external_types.includes(detail)) entry.external_types.push(detail);
    if (kind === 'annotation' && !entry.annotations.includes(detail)) entry.annotations.push(detail);
    if (kind === 'endpoint' && !entry.endpoints.includes(detail)) entry.endpoints.push(detail);
    files.set(file, entry);
  };

  for (const row of sections.framework_touchpoints || []) {
    for (const t of row.types || []) {
      touch(t.file, 'external', `${row.relation === 'EXTENDS' ? 'extends' : 'implements'} ${row.external}`);
      const entry = files.get(t.file);
      if (entry) entry.types.add(t.type);
    }
  }
  for (const row of sections.annotations || []) {
    for (const file of row.files || []) touch(file, 'annotation', `@${row.annotation}`);
  }
  for (const row of sections.endpoints || []) {
    touch(row.file, 'endpoint', `${row.method} ${row.path}`);
  }

  const dependentsByFile = new Map();
  const criticalityByFile = new Map();
  for (const row of sections.hotspots || []) {
    if (!row.file) continue;
    dependentsByFile.set(row.file, Math.max(dependentsByFile.get(row.file) || 0, row.dependents || 0));
    if (row.criticality) criticalityByFile.set(row.file, row.criticality);
  }

  return [...files.values()]
    .map((entry) => {
      const dependents = dependentsByFile.get(entry.file) || 0;
      const criticality = criticalityByFile.get(entry.file) || null;
      const score = entry.external_types.length * 3
        + entry.annotations.length
        + entry.endpoints.length * 2
        + dependents * 2
        + ({ critical: 6, high: 4, medium: 2 }[criticality] || 0);
      return {
        file: entry.file,
        types: [...entry.types],
        external_types: entry.external_types,
        annotations: entry.annotations,
        endpoints: entry.endpoints,
        dependents,
        criticality,
        exposure_score: score,
      };
    })
    .sort((a, b) => b.exposure_score - a.exposure_score || a.file.localeCompare(b.file));
}

/**
 * Endpoints, shaped as probe candidates.
 *
 * Deliberately not a finished probes.json: the graph knows the routes but not the credentials,
 * not which id exists in the seed data, and not which status each route is supposed to return.
 * Those are the parts that make a probe prove something, and they are the agent's to fill in.
 */
function probeCandidates(sections) {
  return (sections.endpoints || []).map((e) => ({
    name: `${e.method.toLowerCase()} ${e.path}`,
    method: e.method,
    path: e.path,
    controller: e.controller,
    criticality: e.criticality || null,
    why: e.summary || null,
    test_hints: e.test_hints || null,
  }));
}

function summarise(graph) {
  const s = graph.sections || {};
  return {
    modules: (s.modules || []).length,
    types: (s.node_counts || []).find((r) => r.label === 'Type')?.count || null,
    dependencies: (s.dependencies || []).length,
    framework_touchpoints: (s.framework_touchpoints || []).length,
    externally_coupled_types: (s.framework_touchpoints || []).reduce((n, r) => n + (r.type_count || 0), 0),
    endpoints: (s.endpoints || []).length,
    critical_nodes: (s.critical_nodes || []).length,
    stale_descriptions: (s.staleness || []).reduce((n, r) => n + (r.stale || 0), 0),
  };
}

// ---------------------------------------------------------------------------
// The briefing
// ---------------------------------------------------------------------------

const esc = (text) => String(text === null || text === undefined ? '' : text)
  .replace(/\|/g, '\\|')
  .replace(/\r?\n/g, ' ');

function briefing(slug, baseline, graph, exposure, probes) {
  const s = graph.sections || {};
  const counts = summarise(graph);
  const out = [];

  out.push(`# Architecture briefing — ${slug}`);
  out.push('');
  out.push(graph.source === 'neo4j'
    ? `Read live from the Neo4j code knowledge graph at \`${graph.host}\` (database \`${graph.database}\`) on ${graph.read_at.slice(0, 19).replace('T', ' ')}.`
    : `**The live graph was not available** — this briefing is derived from \`${graph.artifacts_file || 'artifacts.json'}\`, the static AST artifacts the graph is built from. It carries structure but no traversal and no semantic layer. ${graph.live_attempt_failed ? `Neo4j: ${graph.live_attempt_failed}` : ''}`);
  out.push('');
  out.push('| | |');
  out.push('|---|---|');
  out.push(`| **Modules** | ${counts.modules} |`);
  out.push(`| **Types** | ${counts.types ?? '—'} |`);
  out.push(`| **Declared dependencies** | ${counts.dependencies} |`);
  out.push(`| **Framework touchpoints** | ${counts.framework_touchpoints} external base types, held by ${counts.externally_coupled_types} type(s) |`);
  out.push(`| **REST endpoints** | ${counts.endpoints} |`);
  out.push(`| **Critical/high areas** | ${counts.critical_nodes} |`);
  if (counts.stale_descriptions) out.push(`| **Stale descriptions** | ${counts.stale_descriptions} — re-run 01b-context-weaver before trusting the semantic layer |`);
  out.push('');

  out.push('## 1. Where this application touches the framework');
  out.push('');
  out.push('These are the types that extend or implement something defined outside this repository. In a framework-generation jump they are where the compiler fails first — a relocated package or a changed signature lands here before it lands anywhere else.');
  out.push('');
  if (!(s.framework_touchpoints || []).length) {
    out.push('_None recorded. Either the application touches no framework base types, or the graph has not been built._');
  } else {
    out.push('| External type | Relation | Types | Files |');
    out.push('|---|---|---|---|');
    for (const row of s.framework_touchpoints) {
      const files = (row.types || []).map((t) => `\`${t.file}\``).join('<br>');
      out.push(`| \`${esc(row.external)}\` | ${row.relation} | ${row.type_count} | ${files || '—'} |`);
    }
  }
  out.push('');

  out.push('## 2. How it is wired');
  out.push('');
  out.push('Annotations name the framework contract each type is bound by. A generation jump renames, relocates or retires some of them — check every one of these against the reference pack.');
  out.push('');
  if (!(s.annotations || []).length) {
    out.push('_No annotations recorded._');
  } else {
    out.push('| Annotation | Types | Files |');
    out.push('|---|---|---|');
    for (const row of s.annotations) {
      out.push(`| \`@${esc(row.annotation)}\` | ${row.type_count} | ${(row.files || []).map((f) => `\`${f}\``).join(', ') || '—'} |`);
    }
  }
  out.push('');

  out.push('## 3. Files ranked by exposure');
  out.push('');
  out.push('Exposure combines framework coupling (external base types, annotations, exposed endpoints) with reach (how many types depend on this one, and how critical the graph says it is). It ranks where to look; it does not predict that a file will change.');
  out.push('');
  if (!exposure.length) {
    out.push('_Nothing to rank — no coupling recorded._');
  } else {
    out.push('| Rank | File | Exposure | Framework coupling | Dependents | Criticality |');
    out.push('|---|---|---|---|---|---|');
    exposure.slice(0, 25).forEach((row, i) => {
      const coupling = [...row.external_types, ...row.annotations].slice(0, 4).join(', ') || '—';
      out.push(`| ${i + 1} | \`${row.file}\` | ${row.exposure_score} | ${esc(coupling)} | ${row.dependents} | ${row.criticality || '—'} |`);
    });
  }
  out.push('');

  out.push('## 4. The contract that must survive');
  out.push('');
  out.push('Every REST endpoint in the graph. The migration must leave each of these answering exactly as it does today — these rows are the source of the runtime probe list.');
  out.push('');
  if (!probes.length) {
    out.push('_No endpoints recorded._');
  } else {
    out.push('| Method | Path | Controller | Criticality | What it is for |');
    out.push('|---|---|---|---|---|');
    for (const p of probes) {
      out.push(`| \`${p.method}\` | \`${p.path}\` | ${esc(p.controller)} | ${p.criticality || '—'} | ${esc(p.why) || '—'} |`);
    }
    out.push('');
    out.push('> Turn these into `probes.json` by adding what the graph cannot know: the credentials, an id that exists in the seed data, and the status each route is supposed to return. A probe with no `expect_status` proves only that something answered.');
  }
  out.push('');

  out.push('## 5. Where a regression would hurt most');
  out.push('');
  if (!(s.critical_nodes || []).length) {
    out.push('_No semantic layer in the graph — run 01b-context-weaver to add criticality and failure modes._');
  } else {
    out.push('| Node | Kind | Criticality | Role | How it fails |');
    out.push('|---|---|---|---|---|');
    for (const row of s.critical_nodes) {
      const modes = Array.isArray(row.failure_modes) ? row.failure_modes.slice(0, 2).join('; ') : (row.failure_modes || '');
      out.push(`| \`${esc(row.id)}\`${row.stale ? ' ⚠️ stale' : ''} | ${row.kind} | ${row.criticality} | ${esc(row.role) || '—'} | ${esc(modes) || '—'} |`);
    }
  }
  out.push('');

  if ((s.context_notes || []).length) {
    out.push('## 6. Couplings with no code edge');
    out.push('');
    out.push('No build round will ever surface these — a shared datastore or an external service does not appear in a compiler error. The plan has to carry them itself.');
    out.push('');
    out.push('| Topic | What it is | Concerns | Confidence |');
    out.push('|---|---|---|---|');
    for (const row of s.context_notes) {
      out.push(`| ${esc(row.topic)} | ${esc(row.summary)} | ${(row.about || []).join(', ')} | ${row.confidence || '—'} |`);
    }
    out.push('');
  }

  out.push('## Appendix — how this was read');
  out.push('');
  out.push(`- Source: **${graph.source === 'neo4j' ? 'Neo4j (live)' : 'artifacts.json (static fallback)'}**`);
  if (graph.env_file) out.push(`- Connection details: \`${graph.env_file}\` (credentials never printed)`);
  if (baseline) out.push(`- Project: \`${baseline.project.relative_to_repo}\` — ${baseline.project.sources.main} main / ${baseline.project.sources.test} test sources`);
  out.push('');
  out.push('| Query | Rows | Why it was asked |');
  out.push('|---|---|---|');
  for (const q of graph.queries || []) {
    out.push(`| ${esc(q.title)} | ${q.rows}${q.error ? ' ⚠️' : ''} | ${esc(q.why)} |`);
  }
  out.push('');

  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  if (!args.slug) {
    console.error('--slug is required. Run detect-baseline.js first; it prints the slug it used.');
    process.exitCode = 1;
    return;
  }

  const paths = sessionPaths(args.slug);
  const baseline = readJson(paths.baseline);
  if (!baseline) {
    console.error(`No baseline for "${args.slug}" at ${rel(paths.baseline)} — run detect-baseline.js first.`);
    process.exitCode = 1;
    return;
  }

  const graph = await collectGraph({ preferStatic: args.static });
  if (!graph.source) {
    console.error(`\nNo architecture graph available.\n  ${graph.reason}`);
    console.error('\n  A migration can still run without it, but the plan will have no coupling evidence behind');
    console.error('  its predicted changes. Build the graph first (01a -> 01b -> 01c) if you can.');
    process.exitCode = 1;
    return;
  }

  const exposure = frameworkExposure(graph.sections);
  const probes = probeCandidates(graph.sections);
  const context = {
    slug: args.slug,
    collected_at: new Date().toISOString(),
    source: graph.source,
    live: Boolean(graph.live),
    host: graph.host || null,
    database: graph.database || null,
    env_file: graph.env_file || null,
    artifacts_file: graph.artifacts_file || null,
    artifacts_generated_at: graph.artifacts_generated_at || null,
    live_attempt_failed: graph.live_attempt_failed || null,
    counts: summarise(graph),
    sections: graph.sections,
    queries: graph.queries,
    framework_exposure: exposure,
    probe_candidates: probes,
  };

  const jsonFile = writeJson(paths.graphContext, context);
  fs.mkdirSync(path.dirname(paths.graphBriefing), { recursive: true });
  fs.writeFileSync(paths.graphBriefing, briefing(args.slug, baseline, graph, exposure, probes));

  if (args.json) {
    console.log(JSON.stringify(context, null, 2));
    return;
  }

  const line = (label, value) => console.log(`  ${label.padEnd(24)} ${value}`);
  console.log(`\nGraph context — ${args.slug}`);
  console.log(`  ${'-'.repeat(60)}`);
  line('Source', graph.source === 'neo4j' ? `Neo4j (live) — ${graph.host}` : `${graph.artifacts_file} (static fallback)`);
  if (graph.live_attempt_failed) line('', `Neo4j not used: ${graph.live_attempt_failed}`);
  line('Modules', context.counts.modules);
  line('Types', context.counts.types ?? '—');
  line('Dependencies', context.counts.dependencies);
  line('Framework touchpoints', `${context.counts.framework_touchpoints} external base type(s), ${context.counts.externally_coupled_types} coupled type(s)`);
  line('REST endpoints', context.counts.endpoints);
  line('Critical/high areas', context.counts.critical_nodes);
  if (context.counts.stale_descriptions) line('Stale descriptions', `${context.counts.stale_descriptions} — refresh 01b-context-weaver`);

  if (exposure.length) {
    console.log(`\n  Most exposed files (read these before predicting any change):`);
    for (const row of exposure.slice(0, 8)) {
      console.log(`    ${String(row.exposure_score).padStart(3)}  ${row.file}`);
      const coupling = [...row.external_types, ...row.annotations].slice(0, 3).join(', ');
      if (coupling) console.log(`         ${coupling}`);
    }
  }

  console.log(`\n  Written: ${rel(jsonFile)}`);
  console.log(`           ${rel(paths.graphBriefing)}   <- read this end to end before writing the plan`);
  console.log(`\n  Next:    write ${rel(paths.plan)} per templates/plan.schema.json, then`);
  console.log(`           node scripts/render-migration-plan.js --slug ${args.slug}\n`);
}

main().catch((error) => {
  console.error(`collect-graph-context failed: ${error.message}`);
  process.exitCode = 1;
});
