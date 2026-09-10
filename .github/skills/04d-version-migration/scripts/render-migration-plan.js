#!/usr/bin/env node
/**
 * Version Migration — the migration plan, and the human checkpoint in front of it.
 *
 * Merges what the scripts know (baseline.json — what the project runs on today; graph-context.json
 * — how it is coupled to the framework; round-0 — that it is green right now) with the agent's
 * proposal (plan.json, validated against templates/plan.schema.json) into one document written for
 * the person who has to say yes:
 *
 *   docs/agent_output/04-remediation/migration_plan_<slug>.md
 *
 * It is deliberately a different document from the report. The report explains a migration that
 * has happened; this one asks for permission for one that has not, so it leads with what will
 * change, what it could break, and what it will not touch — and ends in a decision the reviewer
 * makes by editing one cell.
 *
 * Re-rendering is safe and is how the feedback loop works. A Status a human has set is preserved,
 * never reset to Proposed, and anything they wrote in the feedback block is carried forward into
 * the review history along with the revision that answered it.
 *
 * Usage:
 *   node scripts/render-migration-plan.js --slug <slug>
 *   node scripts/render-migration-plan.js --all
 */
const fs = require('fs');
const {
  OUT_DIR, sessionPaths, listRounds, readJson, rel,
} = require('./lib/migration');
const {
  statusMeta, FEEDBACK_START, FEEDBACK_END, FEEDBACK_PLACEHOLDER, HISTORY_START, HISTORY_END,
  readRenderedPlan, rewriteIndex, listPlannedSessions,
} = require('./lib/plan');
const { resolveReferencePack } = require('./lib/references');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slug' || a === '-s') args.slug = argv[++i];
    else if (a === '--all' || a === '-a') args.all = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Version Migration — Plan renderer

  node scripts/render-migration-plan.js --slug <slug>
  node scripts/render-migration-plan.js --all

Options:
  --slug, -s   Render one session's plan
  --all, -a    Render every session that has a plan.json
  --help, -h   Show this message

The rendered plan starts at Status: Proposed. Only a human editing that cell approves it, and
no version is changed until they do.`);
}

// ---------------------------------------------------------------------------
// Validation of the agent's proposal
// ---------------------------------------------------------------------------

const REQUIRED = [
  ['slug', (p) => typeof p.slug === 'string' && p.slug.trim()],
  ['title', (p) => typeof p.title === 'string' && p.title.trim()],
  ['summary', (p) => typeof p.summary === 'string' && p.summary.trim().length > 60],
  ['target.reference_pack', (p) => p.target && typeof p.target.reference_pack === 'string'],
  ['target.language.from/to', (p) => p.target && p.target.language && p.target.language.from && p.target.language.to],
  ['target.platform.name/from/to', (p) => p.target && p.target.platform && p.target.platform.name && p.target.platform.from && p.target.platform.to],
  ['phases (at least one)', (p) => Array.isArray(p.phases) && p.phases.length > 0],
  ['predicted_changes (at least one)', (p) => Array.isArray(p.predicted_changes) && p.predicted_changes.length > 0],
  ['risks (at least one)', (p) => Array.isArray(p.risks) && p.risks.length > 0],
];

function validate(plan) {
  const missing = REQUIRED.filter(([, check]) => !check(plan)).map(([key]) => key);
  if (missing.length) {
    throw new Error(`plan.json is missing required field(s):\n  - ${missing.join('\n  - ')}\nSee templates/plan.schema.json for the expected shape.`);
  }
  // "Latest" is not a target: which release it is decides every managed version underneath it,
  // and a reviewer cannot approve a version nobody has named.
  if (/^(latest|newest|current)$/i.test(String(plan.target.platform.to).trim())) {
    throw new Error(`target.platform.to is "${plan.target.platform.to}". Pin the exact release — the managed versions underneath depend on which one it is, and a reviewer cannot approve an unnamed version.`);
  }
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

const CLASS_DEFS = [
  'classDef before fill:#e7f5ff,stroke:#1c7ed6,stroke-width:2px,color:#1a1a1a',
  'classDef after fill:#f3f0ff,stroke:#7048e8,stroke-width:2px,color:#1a1a1a',
  'classDef work fill:#fff3bf,stroke:#e8590c,stroke-width:2px,color:#1a1a1a',
  'classDef gate fill:#ffe3e3,stroke:#c92a2a,stroke-width:2px,color:#1a1a1a',
  'classDef ok fill:#e6fcf5,stroke:#2f9e44,stroke-width:2px,color:#1a1a1a',
  'classDef neutral fill:#f1f3f5,stroke:#868e96,stroke-width:1px,color:#1a1a1a',
];

const RATING = {
  high: { emoji: '🔴', colour: 'C92A2A' },
  medium: { emoji: '🟠', colour: 'E8590C' },
  low: { emoji: '🟢', colour: '3DA35B' },
  critical: { emoji: '🔴', colour: 'C92A2A' },
};

const rate = (value) => RATING[String(value || '').toLowerCase()] || { emoji: '⚪', colour: '868E96' };

const CONFIDENCE = { high: '🟢 high', medium: '🟠 medium', low: '🔴 low' };

function badgeText(text) {
  return String(text).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_');
}

function badge(label, message, colour) {
  return `![${label}](https://img.shields.io/badge/${badgeText(label)}-${badgeText(message)}-${colour}?style=for-the-badge)`;
}

const esc = (text) => String(text === null || text === undefined ? '' : text)
  .replace(/\|/g, '\\|')
  .replace(/\r?\n/g, ' ');

const code = (text) => (text ? `\`${String(text).replace(/`/g, '')}\`` : '—');

const mermaidLabel = (text) => String(text === null || text === undefined ? '' : text)
  .replace(/["`]/g, "'")
  .replace(/[()[\]{}]/g, '')
  .replace(/[<>]/g, '')
  .replace(/\r?\n/g, ' ')
  .trim();

const shorten = (text, max = 44) => {
  const t = mermaidLabel(text);
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

function bullets(items, empty = '_none recorded_') {
  const list = (items || []).filter(Boolean);
  return list.length ? list.map((i) => `- ${i}`).join('\n') : empty;
}

/** Overall risk: the worst single risk, by likelihood x impact. Shown as one badge. */
function overallRisk(risks) {
  const weight = { high: 3, medium: 2, low: 1 };
  const worst = (risks || []).reduce((max, r) => Math.max(max, (weight[r.likelihood] || 1) * (weight[r.impact] || 1)), 0);
  if (worst >= 9) return { label: 'High', colour: 'C92A2A' };
  if (worst >= 4) return { label: 'Moderate', colour: 'E8590C' };
  return { label: 'Low', colour: '3DA35B' };
}

// ---------------------------------------------------------------------------
// Diagrams and charts
// ---------------------------------------------------------------------------

/**
 * Before and after. The "today" label states what round 0 actually found rather than assuming it
 * was green — a plan drawn on top of a red baseline should say so in the first picture the
 * reviewer looks at, not only in a table cell further down.
 */
function stackDiagram(baseline, plan, round0) {
  const parent = baseline.platform && baseline.platform.parent;
  const todayLabel = !round0
    ? 'Today — round 0 not recorded yet'
    : (round0.outcome === 'passed' ? 'Today — green, verified by round 0' : `Today — round 0 came back ${mermaidLabel(round0.outcome)}`);
  const lines = ['```mermaid', 'flowchart LR'];
  lines.push(`  subgraph TODAY["${todayLabel}"]`);
  lines.push('    direction TB');
  lines.push(`    B1["${mermaidLabel(plan.target.platform.name)} ${mermaidLabel(plan.target.platform.from)}"]`);
  lines.push(`    B2["Java ${mermaidLabel(plan.target.language.from)}"]`);
  if (parent) lines.push(`    B3["${mermaidLabel(parent.artifactId)} ${mermaidLabel(parent.version)}"]`);
  lines.push('  end');
  lines.push('  subgraph TARGET["Proposed — after this migration"]');
  lines.push('    direction TB');
  lines.push(`    A1["${mermaidLabel(plan.target.platform.name)} ${mermaidLabel(plan.target.platform.to)}"]`);
  lines.push(`    A2["Java ${mermaidLabel(plan.target.language.to)}"]`);
  if (parent) lines.push(`    A3["${mermaidLabel(parent.artifactId)} ${mermaidLabel(plan.target.platform.to)}"]`);
  lines.push('  end');
  lines.push(`  TODAY -->|"${(plan.predicted_changes || []).length} file(s) predicted to change"| TARGET`);
  lines.push('  class B1,B2,B3 before');
  lines.push('  class A1,A2,A3 after');
  lines.push(...CLASS_DEFS.map((d) => `  ${d}`));
  lines.push('```');
  return lines.join('\n');
}

/** Where the predicted work lands, by area. A reviewer reads this before any table. */
function areaPie(changes) {
  const byArea = new Map();
  for (const c of changes || []) {
    const area = c.area || 'Unclassified';
    byArea.set(area, (byArea.get(area) || 0) + 1);
  }
  if (!byArea.size) return null;
  const lines = ['```mermaid', `pie showData title Predicted changes by area (${(changes || []).length} file(s))`];
  for (const [area, count] of [...byArea.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`  "${mermaidLabel(area)}" : ${count}`);
  }
  lines.push('```');
  return lines.join('\n');
}

/** The plan as a flow: green start, the phases, the gates that end it. */
function phaseDiagram(plan, round0) {
  const phases = plan.phases || [];
  const lines = ['```mermaid', 'flowchart TD'];
  // The starting node is drawn as the gate it is: green only when round 0 actually passed,
  // red when it did not, because in that case the migration cannot legally begin at all.
  if (!round0) {
    lines.push('  R0["Round 0 — not recorded yet<br/>must run before any of this"]:::gate');
  } else if (round0.outcome === 'passed') {
    lines.push('  R0["Round 0 — green today<br/>build + tests pass"]:::ok');
  } else {
    lines.push(`  R0["Round 0 — ${mermaidLabel(round0.outcome)}<br/>BLOCKED: the migration cannot start"]:::gate`);
  }
  let previous = 'R0';
  phases.forEach((phase, i) => {
    const id = `P${i + 1}`;
    const rounds = phase.estimated_rounds ? `~${phase.estimated_rounds} round(s)` : 'rounds as needed';
    lines.push(`  ${id}["${i + 1}. ${shorten(phase.name, 38)}<br/>${shorten(phase.goal, 52)}<br/>${rounds}${phase.build_intent ? ` · ${phase.build_intent}` : ''}"]:::work`);
    const label = i === 0 ? 'versions changed' : shorten((phases[i - 1].expected_failures || [])[0] || 'next failure', 34);
    lines.push(`  ${previous} -->|"${label}"| ${id}`);
    previous = id;
  });
  lines.push('  GREEN["Build green on the new version"]:::ok');
  lines.push(`  ${previous} --> GREEN`);
  lines.push('  PROBE["Probes replayed — behaviour compared request by request"]:::gate');
  lines.push('  GREEN --> PROBE');
  lines.push('  APPLY["Written into the project and built there"]:::gate');
  lines.push('  PROBE --> APPLY');
  lines.push('  DONE["Project on the new version, green"]:::ok');
  lines.push('  APPLY --> DONE');
  lines.push(...CLASS_DEFS.map((d) => `  ${d}`));
  lines.push('```');
  return lines.join('\n');
}

/** Coupling the graph found, drawn as the thing that will actually break. */
function couplingDiagram(graph) {
  const touchpoints = ((graph && graph.sections && graph.sections.framework_touchpoints) || []).slice(0, 8);
  if (!touchpoints.length) return null;
  const lines = ['```mermaid', 'flowchart LR'];
  touchpoints.forEach((row, i) => {
    const ext = `X${i}`;
    lines.push(`  ${ext}(["${shorten(row.external, 32)}"]):::gate`);
    (row.types || []).slice(0, 4).forEach((t, j) => {
      const id = `T${i}_${j}`;
      lines.push(`  ${id}["${shorten(t.type, 30)}"]:::neutral`);
      lines.push(`  ${id} -->|"${row.relation === 'EXTENDS' ? 'extends' : 'implements'}"| ${ext}`);
    });
    if ((row.types || []).length > 4) {
      lines.push(`  M${i}["+ ${row.types.length - 4} more"]:::neutral`);
      lines.push(`  M${i} --> ${ext}`);
    }
  });
  lines.push(...CLASS_DEFS.map((d) => `  ${d}`));
  lines.push('```');
  return lines.join('\n');
}

/** Risk, laid out as a likelihood x impact grid so severity is visible without reading rows. */
function riskGrid(risks) {
  const levels = ['high', 'medium', 'low'];
  const cell = (likelihood, impact) => (risks || [])
    .filter((r) => String(r.likelihood).toLowerCase() === likelihood && String(r.impact).toLowerCase() === impact)
    .length;
  const out = ['| Likelihood ⧵ Impact | High | Medium | Low |', '|---|---|---|---|'];
  for (const likelihood of levels) {
    const cells = levels.map((impact) => {
      const n = cell(likelihood, impact);
      if (!n) return '·';
      const severity = likelihood === 'high' && impact === 'high' ? '🔴' : (likelihood === 'low' && impact === 'low' ? '🟢' : '🟠');
      return `${severity} **${n}**`;
    });
    out.push(`| **${likelihood[0].toUpperCase()}${likelihood.slice(1)}** | ${cells.join(' | ')} |`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function atAGlance(plan, baseline, graph, round0, status, revision, previous) {
  const meta = statusMeta(status);
  const rows = [
    // Deliberately just the word. This is the one cell a human edits by hand, so nothing else
    // goes in it — the explanation lives in the row below, where it cannot get in the way.
    ['Status', `${meta.emoji} ${status}`],
    ['What that means', meta.note],
    ['Revision', String(revision)],
    ['Project', code(baseline.project.relative_to_repo)],
    ['Platform', `${plan.target.platform.name} ${plan.target.platform.from} → **${plan.target.platform.to}**`],
    ['Language', `Java ${plan.target.language.from} → **${plan.target.language.to}**`],
    ['Reference pack', code(plan.target.reference_pack)],
    ['Starting point', round0
      ? (round0.outcome === 'passed'
        ? `🟢 verified green — round 0 ran \`${(round0.build && round0.build.intent) || 'package'}\` on JDK ${(round0.jdk && round0.jdk.major) || baseline.language.declared} and passed`
        : `🔴 **not green** — round 0 came back \`${round0.outcome}\`. The migration cannot start until this is fixed`)
      : '⚪ not yet recorded — run round 0 before approving this plan'],
    ['Files predicted to change', String((plan.predicted_changes || []).length)],
    ['Phases', String((plan.phases || []).length)],
    ['Estimated rounds', plan.effort && plan.effort.estimated_rounds ? String(plan.effort.estimated_rounds) : '—'],
    ['Estimated duration', plan.effort && plan.effort.estimated_duration ? plan.effort.estimated_duration : '—'],
    ['Overall risk', `${overallRisk(plan.risks).label} — ${(plan.risks || []).length} risk(s) identified`],
    ['Architecture evidence', graph
      ? (graph.source === 'neo4j'
        ? `🟢 live code graph — ${graph.counts.types ?? '?'} type(s), ${graph.counts.framework_touchpoints} framework touchpoint(s), ${graph.counts.endpoints} endpoint(s)`
        : `🟠 static artifacts only (\`${graph.artifacts_file}\`) — the live graph was unreachable`)
      : '🔴 none — no graph context collected, so nothing below is backed by coupling evidence'],
    ['Reviewer', previous && previous.reviewer ? previous.reviewer : '_unset — fill in when you decide_'],
    ['Decision date', previous && previous.decided_on ? previous.decided_on : '_unset — fill in when you decide_'],
  ];
  return ['| | |', '|---|---|', ...rows.map(([k, v]) => `| **${k}** | ${v} |`)].join('\n');
}

function graphSection(graph, plan) {
  if (!graph) {
    return '> **No architecture graph was available when this plan was written.** Everything predicted below comes from the reference pack applied to the build file, not from measured coupling. Build the graph (`01a-code-cartographer` → `01b-context-weaver` → `01c-graph-forge`) and re-render for a plan with evidence behind it.';
  }
  const out = [];
  out.push(graph.source === 'neo4j'
    ? `Read live from the Neo4j code knowledge graph (\`${graph.host}\`, database \`${graph.database}\`) on ${String(graph.collected_at).slice(0, 10)}. Full briefing: \`${rel(sessionPaths(plan.slug).graphBriefing)}\`.`
    : `⚠️ The live graph was unreachable, so this came from \`${graph.artifacts_file}\` — the static artifacts the graph is built from. Structure is there; traversal and the semantic layer are not.${graph.live_attempt_failed ? ` (${graph.live_attempt_failed})` : ''}`);
  out.push('');

  if (plan.architecture_reading && plan.architecture_reading.summary) {
    out.push(`> ${plan.architecture_reading.summary}`);
    out.push('');
  }

  const counts = graph.counts || {};
  out.push('| What the graph holds | |');
  out.push('|---|---|');
  out.push(`| Modules | ${counts.modules ?? '—'} |`);
  out.push(`| Types | ${counts.types ?? '—'} |`);
  out.push(`| Declared dependencies | ${counts.dependencies ?? '—'} |`);
  out.push(`| Framework touchpoints | ${counts.framework_touchpoints ?? 0} external base type(s), held by ${counts.externally_coupled_types ?? 0} type(s) |`);
  out.push(`| REST endpoints | ${counts.endpoints ?? 0} |`);
  out.push(`| Critical / high areas | ${counts.critical_nodes ?? 0} |`);
  if (counts.stale_descriptions) out.push(`| ⚠️ Stale descriptions | ${counts.stale_descriptions} — the semantic layer has drifted; re-run \`01b-context-weaver\` |`);
  out.push('');

  const diagram = couplingDiagram(graph);
  if (diagram) {
    out.push('**Where this application touches the framework.** These are the types that extend or implement something defined outside the repository — the exact points a generation jump breaks first.');
    out.push('');
    out.push(diagram);
    out.push('');
  }

  const exposure = (graph.framework_exposure || []).slice(0, 10);
  if (exposure.length) {
    out.push('**The most exposed files**, ranked by framework coupling combined with how many other types depend on them. This ranks where to look; it does not predict that a file will change — that is the next section.');
    out.push('');
    out.push('| File | Exposure | Coupled to | Dependents | Criticality |');
    out.push('|---|---|---|---|---|');
    for (const row of exposure) {
      const coupling = [...(row.external_types || []), ...(row.annotations || [])].slice(0, 3).join(', ');
      out.push(`| ${code(row.file)} | ${row.exposure_score} | ${esc(coupling) || '—'} | ${row.dependents} | ${row.criticality || '—'} |`);
    }
    out.push('');
  }

  if (plan.architecture_reading) {
    if ((plan.architecture_reading.framework_coupling || []).length) {
      out.push('**What that means for this jump**');
      out.push('');
      out.push(bullets(plan.architecture_reading.framework_coupling));
      out.push('');
    }
    if ((plan.architecture_reading.blind_spots || []).length) {
      out.push('**What the graph could not tell us** — carried into the risks below rather than assumed away.');
      out.push('');
      out.push(bullets(plan.architecture_reading.blind_spots));
      out.push('');
    }
  }
  return out.join('\n');
}

function phasesSection(plan, round0) {
  const out = [];
  out.push(phaseDiagram(plan, round0));
  out.push('');
  out.push('Each phase is a loop, not a step: change what the last failure pointed at, build, read the next failure. The round counts below are a forecast — the compiler decides the real number, and the final report compares the two.');
  out.push('');
  out.push('| # | Phase | Goal | Build goal | Est. rounds | What we expect to break |');
  out.push('|---|---|---|---|---|---|');
  (plan.phases || []).forEach((phase, i) => {
    const failures = (phase.expected_failures || []).map((f) => esc(f)).join('<br>') || '—';
    out.push(`| ${i + 1} | **${esc(phase.name)}** | ${esc(phase.goal)} | ${code(phase.build_intent)} | ${phase.estimated_rounds || '—'} | ${failures} |`);
  });
  out.push('');
  const withEvidence = (plan.phases || []).filter((p) => (p.graph_evidence || []).length);
  if (withEvidence.length) {
    out.push('<details><summary>What the graph says each phase is for</summary>');
    out.push('');
    for (const phase of withEvidence) {
      out.push(`**${esc(phase.name)}**`);
      out.push('');
      out.push(bullets(phase.graph_evidence));
      out.push('');
    }
    out.push('</details>');
    out.push('');
  }
  return out.join('\n');
}

function changesSection(plan) {
  const out = [];
  const pie = areaPie(plan.predicted_changes);
  if (pie) {
    out.push(pie);
    out.push('');
  }
  out.push('Every file expected to change, why, and what in the graph says so. A prediction that turns out to be wrong is recorded as such in the final report — this table is a forecast, and it is meant to be checked against what actually happened.');
  out.push('');
  out.push('| File | Area | What changes | Why | Confidence | Evidence |');
  out.push('|---|---|---|---|---|---|');
  const byArea = new Map();
  for (const c of plan.predicted_changes || []) {
    const area = c.area || 'Unclassified';
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push(c);
  }
  for (const [area, changes] of [...byArea.entries()].sort((a, b) => b[1].length - a[1].length)) {
    for (const c of changes) {
      const confidence = CONFIDENCE[String(c.confidence || '').toLowerCase()] || '—';
      const evidence = [c.graph_evidence, c.reference_rule ? `rule: ${c.reference_rule}` : null].filter(Boolean).join('<br>') || '—';
      out.push(`| ${code(c.file)} | ${esc(area)} | ${esc(c.what)} | ${esc(c.why)} | ${confidence} | ${esc(evidence)} |`);
    }
  }
  out.push('');

  if ((plan.dependency_plan || []).length) {
    out.push('### Declared versions to be changed first');
    out.push('');
    out.push('These go in before the first build round. Nothing in the source is touched until a build has failed on it.');
    out.push('');
    out.push('| Coordinate | From | To | Kind | Why |');
    out.push('|---|---|---|---|---|');
    for (const d of plan.dependency_plan) {
      out.push(`| ${code(d.coordinate)} | ${code(d.from)} | ${code(d.to)} | ${d.kind || 'version'} | ${esc(d.reason)} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

function risksSection(plan) {
  const out = [];
  const overall = overallRisk(plan.risks);
  out.push(`**Overall: ${overall.label}.** ${(plan.risks || []).length} risk(s) identified, laid out by how likely they are against how much damage they would do.`);
  out.push('');
  out.push(riskGrid(plan.risks));
  out.push('');
  out.push('| Risk | Likelihood | Impact | What the migration does about it | Why it applies here |');
  out.push('|---|---|---|---|---|');
  const weight = { high: 3, medium: 2, low: 1 };
  const sorted = [...(plan.risks || [])].sort((a, b) => (weight[b.likelihood] || 1) * (weight[b.impact] || 1) - (weight[a.likelihood] || 1) * (weight[a.impact] || 1));
  for (const r of sorted) {
    out.push(`| ${esc(r.risk)} | ${rate(r.likelihood).emoji} ${r.likelihood} | ${rate(r.impact).emoji} ${r.impact} | ${esc(r.mitigation)} | ${esc(r.graph_evidence) || '—'} |`);
  }
  return out.join('\n');
}

function behaviourSection(plan, graph) {
  const out = [];
  const bp = plan.behaviour_plan || {};
  out.push(bp.summary || 'The application is exercised on the current runtime before anything changes, and on the new one once the build is green. The two runs are compared request by request.');
  out.push('');
  const probes = bp.probes || [];
  const candidates = (graph && graph.probe_candidates) || [];
  if (probes.length) {
    out.push('| Probe | Expect | Why it is in the list | Criticality |');
    out.push('|---|---|---|---|');
    for (const p of probes) {
      out.push(`| ${code(p.name)} | ${p.expect_status ? `\`${p.expect_status}\`` : '—'} | ${esc(p.why)} | ${p.criticality ? `${rate(p.criticality).emoji} ${p.criticality}` : '—'} |`);
    }
    out.push('');
    // A probe names a concrete request (`GET /api/v1/employees/1`); the graph names the route
    // template (`GET /api/v1/employees/{id}`). Matching them literally reports a covered endpoint
    // as uncovered, so a `{...}` segment is matched against whatever the probe put there.
    const routeMatcher = (method, routePath) => {
      const pattern = String(routePath)
        .split('/')
        .map((segment) => (/^\{.*\}$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('/');
      return new RegExp(`^${method}\\s+${pattern}\\b`, 'i');
    };
    const uncovered = candidates.filter((c) => {
      const matcher = routeMatcher(c.method, c.path);
      return !probes.some((p) => matcher.test(String(p.name).trim()));
    });
    if (uncovered.length) {
      out.push(`> **${uncovered.length} endpoint(s) in the graph are not in the probe list:** ${uncovered.slice(0, 8).map((c) => `\`${c.method} ${c.path}\``).join(', ')}${uncovered.length > 8 ? ', …' : ''}. That may be deliberate — say so in your feedback if it is not.`);
      out.push('');
    }
  } else if (candidates.length) {
    out.push('The plan names no probes yet. The graph found these endpoints, which is what the probe list should be built from:');
    out.push('');
    out.push(candidates.slice(0, 20).map((c) => `- \`${c.method} ${c.path}\`${c.why ? ` — ${c.why}` : ''}`).join('\n'));
    out.push('');
  } else {
    out.push('_No probes named and no endpoints in the graph. A migration with no behavioural evidence proves only that the code compiles._');
    out.push('');
  }
  if ((bp.not_covered || []).length) {
    out.push('**What the probes will not check.** Stated up front so nobody reads "behaviour unchanged" as broader than it is.');
    out.push('');
    out.push(bullets(bp.not_covered));
    out.push('');
  }
  return out.join('\n');
}

function decisionSection(plan, previous, status) {
  const meta = statusMeta(status);
  const out = [];
  out.push(`> ${meta.emoji} **This plan currently reads \`${status}\`.** ${meta.note}`);
  out.push('');
  out.push('**To decide, edit two cells in the _At a glance_ table at the top of this file** — this file, by hand. Nothing else approves a migration, and no script will ever set these for you.');
  out.push('');
  out.push('| Set **Status** to | What happens next |');
  out.push('|---|---|');
  out.push('| `Approved` | The migration proceeds: versions are changed in the sandbox, build rounds run on the target JDK, and the result is written into the project at the end. |');
  out.push('| `Changes requested` | Nothing runs. Write what you want changed in the feedback box below; the plan is revised and comes back to you as a new revision. |');
  out.push('| `Rejected` | Nothing runs, and nothing further is proposed for this migration. |');
  out.push('');
  out.push('Fill in **Reviewer** and **Decision date** in the same table while you are there — they become part of the migration\'s audit trail.');
  out.push('');

  if ((plan.open_questions || []).length) {
    out.push('### Questions for you');
    out.push('');
    out.push('These are the things the plan could not settle on its own. Answers go in the feedback box.');
    out.push('');
    out.push((plan.open_questions || []).map((q, i) => `${i + 1}. ${q}`).join('\n'));
    out.push('');
  }

  out.push('### Your feedback');
  out.push('');
  out.push('Anything you write between the markers is preserved when the plan is re-rendered, and is carried into the review history below and into the final migration record.');
  out.push('');
  out.push(FEEDBACK_START);
  out.push('');
  out.push(previous && previous.feedback ? previous.feedback : FEEDBACK_PLACEHOLDER);
  out.push('');
  out.push(FEEDBACK_END);
  out.push('');
  return out.join('\n');
}

/**
 * The review history: every previous revision's feedback, and what the revision after it did about
 * it. Appended to, never rewritten — a plan that changed because someone objected should still show
 * the objection.
 */
function historySection(plan, previous, status) {
  const entries = [];
  if (previous && previous.history) entries.push(previous.history);

  if (previous) {
    const parts = [`**Revision ${previous.revision} → ${previous.revision + 1}** · re-rendered ${new Date().toISOString().slice(0, 10)} · previous status: ${statusMeta(previous.status).emoji} ${previous.status}`];
    if (previous.feedback) {
      parts.push('');
      parts.push('_The reviewer wrote:_');
      parts.push('');
      parts.push(previous.feedback.split(/\r?\n/).map((l) => `> ${l}`).join('\n'));
    }
    if (plan.revision_note) {
      parts.push('');
      parts.push(`_What changed in response:_ ${plan.revision_note}`);
    } else if (previous.feedback) {
      parts.push('');
      parts.push('_What changed in response:_ ⚠️ not recorded — the revised plan gave no `revision_note`.');
    }
    entries.push(parts.join('\n'));
  }

  const out = [HISTORY_START, ''];
  out.push(entries.length ? entries.join('\n\n---\n\n') : '_First revision — nothing to show yet._');
  out.push('');
  out.push(HISTORY_END);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

function renderPlan(ctx) {
  const { plan, baseline, graph, round0, previous, status, revision, pack } = ctx;
  const out = [];

  out.push(`# Migration Plan — ${plan.title}`);
  out.push('');
  out.push(`## ${baseline.project.name}`);
  out.push('');
  out.push([
    badge('Status', statusMeta(status).label, statusMeta(status).colour),
    badge(plan.target.platform.name, `${plan.target.platform.from} → ${plan.target.platform.to}`, '2E5FD9'),
    badge('Java', `${plan.target.language.from} → ${plan.target.language.to}`, '6E86E8'),
    badge('Files', `${(plan.predicted_changes || []).length} predicted`, 'A0399B'),
    badge('Risk', overallRisk(plan.risks).label, overallRisk(plan.risks).colour),
    badge('Graph', graph ? (graph.source === 'neo4j' ? 'live' : 'static') : 'none', graph ? (graph.source === 'neo4j' ? '3DA35B' : 'E8590C') : 'C92A2A'),
  ].join(' '));
  out.push('');
  out.push(`> ${plan.summary}`);
  out.push('');
  out.push(`_Written by the Version Migration skill on ${new Date().toISOString().slice(0, 10)}, **before** anything was changed. Nothing in this document has happened yet — it is a proposal, and it is waiting on your decision at the end._`);
  out.push('');

  out.push('## At a glance');
  out.push('');
  out.push(atAGlance(plan, baseline, graph, round0, status, revision, previous));
  out.push('');

  if ((plan.drivers || []).length) {
    out.push('## Why do this at all');
    out.push('');
    out.push(bullets(plan.drivers));
    out.push('');
  }

  out.push('## 1. What would move');
  out.push('');
  out.push(stackDiagram(baseline, plan, round0));
  out.push('');
  out.push('| | Today | Proposed |');
  out.push('|---|---|---|');
  out.push(`| ${plan.target.platform.name} | ${code(plan.target.platform.from)} | ${code(plan.target.platform.to)} |`);
  out.push(`| Java | ${code(plan.target.language.from)} | ${code(plan.target.language.to)} |`);
  if (baseline.platform && baseline.platform.parent) {
    out.push(`| Parent | ${code(`${baseline.platform.parent.groupId}:${baseline.platform.parent.artifactId}:${baseline.platform.parent.version}`)} | ${code(`${baseline.platform.parent.groupId}:${baseline.platform.parent.artifactId}:${plan.target.platform.to}`)} |`);
  }
  out.push(`| Build tool | ${code(`${baseline.build_tool.tool} (${baseline.build_tool.kind})`)} | unchanged |`);
  out.push(`| Reference pack | — | ${code(plan.target.reference_pack)}${pack ? ` — ${esc(pack.title)}` : ''} |`);
  out.push('');

  out.push('## 2. What the code graph says about this application');
  out.push('');
  out.push(graphSection(graph, plan));
  out.push('');

  out.push('## 3. How the migration would run');
  out.push('');
  out.push(phasesSection(plan, round0));
  out.push('');

  out.push('## 4. What is expected to change');
  out.push('');
  out.push(changesSection(plan));
  out.push('');

  out.push('## 5. What could go wrong');
  out.push('');
  out.push(risksSection(plan));
  out.push('');

  out.push('## 6. How we would know it still works');
  out.push('');
  out.push(behaviourSection(plan, graph));
  out.push('');

  out.push('## 7. What this migration would not do');
  out.push('');
  out.push('Stated before the work so it can be checked afterwards. Anything here that turns out to be necessary comes back to you as a new revision rather than being folded in quietly.');
  out.push('');
  out.push(bullets(plan.out_of_scope, '_Nothing declared out of scope. That is unusual — a migration normally has boundaries worth naming._'));
  out.push('');

  out.push('## 8. Getting back if it goes wrong');
  out.push('');
  out.push('Every round happens in a sandbox copy under `.github/.pipeline-context/version-migration/`; the project is written once, at the very end, and only from a green sandbox. That write backs up every file it overwrites first.');
  out.push('');
  out.push(plan.rollback || `Revert with \`node scripts/apply-migration.js --slug ${plan.slug} --revert\`, which restores the project from \`${rel(sessionPaths(plan.slug).appliedBackup)}\`.`);
  out.push('');

  out.push('## 9. Your decision');
  out.push('');
  out.push(decisionSection(plan, previous, status));
  out.push('');

  out.push('## 10. Review history');
  out.push('');
  out.push(historySection(plan, previous, status));
  out.push('');

  out.push('---');
  out.push('');
  out.push('<details><summary>Appendix — what this plan was built from</summary>');
  out.push('');
  out.push('| Input | Source |');
  out.push('|---|---|');
  out.push(`| Current versions, toolchain, dependencies | ${code(rel(sessionPaths(plan.slug).baseline))} |`);
  out.push(`| Architecture and coupling | ${graph ? code(rel(sessionPaths(plan.slug).graphContext)) : '_not collected_'}${graph ? ` (${graph.source === 'neo4j' ? 'live Neo4j graph' : 'static artifacts'})` : ''} |`);
  out.push(`| Architecture briefing | ${graph ? code(rel(sessionPaths(plan.slug).graphBriefing)) : '—'} |`);
  out.push(`| Framework rules | ${code(plan.target.reference_pack)} |`);
  out.push(`| Green starting point | ${round0 ? `round 0 — \`${round0.outcome}\`` : '_not yet recorded_'} |`);
  out.push(`| The proposal itself | ${code(rel(sessionPaths(plan.slug).plan))} |`);
  out.push('');
  out.push('</details>');
  out.push('');

  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function renderOne(slug) {
  const paths = sessionPaths(slug);
  const baseline = readJson(paths.baseline);
  const plan = readJson(paths.plan);
  if (!baseline) throw new Error(`No baseline.json for "${slug}" — run detect-baseline.js.`);
  if (!plan) throw new Error(`No plan.json for "${slug}" at ${rel(paths.plan)} — write it per templates/plan.schema.json before rendering.`);
  validate(plan);

  const graph = readJson(paths.graphContext);
  const rounds = listRounds(slug);
  const round0 = rounds.find((r) => r.baseline) || rounds.find((r) => r.round === 0) || null;

  const previous = readRenderedPlan(slug);
  // A decision a human made is never reset by a re-render. `Changes requested` goes back to
  // Proposed because the plan in front of them is a different one now — that is the loop closing.
  const status = previous
    ? (previous.status === 'Approved' || previous.status === 'Rejected' ? previous.status : 'Proposed')
    : 'Proposed';
  const revision = previous ? previous.revision + 1 : 1;

  const pack = resolveReferencePack(String(plan.target.reference_pack).replace(/^references\//, '').replace(/\.md$/, ''));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(paths.planMd, renderPlan({ plan, baseline, graph, round0, previous, status, revision, pack }));

  return {
    slug,
    file: rel(paths.planMd),
    status,
    revision,
    graph: graph ? graph.source : null,
    round0: round0 ? round0.outcome : null,
    carriedFeedback: Boolean(previous && previous.feedback),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const slugs = args.all ? listPlannedSessions() : (args.slug ? [args.slug] : []);
  if (!slugs.length) {
    console.error(args.all
      ? 'No session has a plan.json yet — write the proposal first.'
      : 'Pass --slug <slug> or --all.');
    process.exitCode = 1;
    return;
  }

  let failures = 0;
  for (const slug of slugs) {
    try {
      const result = renderOne(slug);
      const meta = statusMeta(result.status);
      console.log(`\n${meta.emoji} ${slug} — plan revision ${result.revision}, Status: ${result.status}`);
      console.log(`   ${result.file}`);
      console.log(`   architecture evidence: ${result.graph === 'neo4j' ? 'live code graph' : result.graph === 'artifacts.json' ? 'static artifacts (graph unreachable)' : 'NONE — run collect-graph-context.js'}`);
      console.log(`   starting point:        ${result.round0 === 'passed' ? 'round 0 green' : result.round0 ? `round 0 ${result.round0} — fix before approving` : 'round 0 not recorded yet'}`);
      if (result.carriedFeedback) console.log('   reviewer feedback from the previous revision was carried into the review history');
      if (result.status !== 'Approved') {
        console.log(`\n   Show this file to the reviewer. Nothing changes a version until its Status cell reads Approved.`);
      }
    } catch (error) {
      failures += 1;
      console.error(`✗ ${slug} — ${error.message}`);
    }
  }
  const readme = rewriteIndex();
  console.log(`\nIndex: ${rel(readme)}\n`);
  if (failures) process.exitCode = 1;
}

main();
