#!/usr/bin/env node
/**
 * Version Migration — Final step: the migration report.
 *
 * Merges the facts collected by the other scripts (baseline.json, rounds/round-NN.json,
 * runtime/baseline.json, runtime/final.json) with the agent's judgement (migration.json,
 * validated against templates/migration.schema.json) into one report a non-engineer can read:
 *
 *   docs/agent_output/04-remediation/migration_<slug>.md    — the report
 *   docs/agent_output/04-remediation/migration_<slug>.diff  — the cumulative patch, git apply-able
 *   docs/agent_output/04-remediation/README.md              — its migration block, regenerated
 *
 * The output folder is shared with 04a-fix-strategist and 04b-fixer. Migration reports use the
 * migration_ prefix, which their index scan ignores, and the README's migration block sits above
 * their marker so neither rewrite can clobber the other.
 *
 * Outcomes are rendered exactly as recorded. A migration that ended on a red round renders as
 * red — this script never upgrades a failed round into a success.
 *
 * Usage:
 *   node scripts/render-migration-report.js --slug <slug>
 *   node scripts/render-migration-report.js --all
 */
const fs = require('fs');
const path = require('path');
const {
  OUT_DIR, sessionPaths, listSessions, listRounds, readJson, rel, run,
  categoryMeta, classifyMessage, summariseErrors, isLogNoise,
} = require('./lib/migration');
const { rewriteIndex, readRenderedPlan, statusMeta } = require('./lib/plan');

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
  console.log(`Version Migration — Report renderer

  node scripts/render-migration-report.js --slug <slug>
  node scripts/render-migration-report.js --all

Options:
  --slug, -s   Render one session
  --all, -a    Render every session that has a migration.json
  --help, -h   Show this message`);
}

// ---------------------------------------------------------------------------
// Validation of the agent's judgement file
// ---------------------------------------------------------------------------

const REQUIRED = [
  ['slug', (m) => typeof m.slug === 'string' && m.slug.trim()],
  ['title', (m) => typeof m.title === 'string' && m.title.trim()],
  ['summary', (m) => typeof m.summary === 'string' && m.summary.trim().length > 40],
  ['migration.reference_pack', (m) => m.migration && typeof m.migration.reference_pack === 'string'],
  ['migration.language.from/to', (m) => m.migration && m.migration.language && m.migration.language.from && m.migration.language.to],
  ['migration.platform.name/from/to', (m) => m.migration && m.migration.platform && m.migration.platform.name && m.migration.platform.from && m.migration.platform.to],
  ['round_notes (one per recorded round)', (m) => Array.isArray(m.round_notes) && m.round_notes.length > 0],
];

function validate(migration, rounds) {
  const missing = REQUIRED.filter(([, check]) => !check(migration)).map(([key]) => key);
  if (missing.length) {
    throw new Error(`migration.json is missing required field(s):\n  - ${missing.join('\n  - ')}\nSee templates/migration.schema.json for the expected shape.`);
  }
  const noted = new Set(migration.round_notes.map((n) => n.round));
  const unnoted = rounds.map((r) => r.round).filter((r) => !noted.has(r));
  if (unnoted.length) {
    throw new Error(`migration.json has no round_notes entry for recorded round(s): ${unnoted.join(', ')}.\nEvery round that ran must be explained, including the ones that failed.`);
  }
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const OUTCOME = {
  passed: { emoji: '🟢', label: 'Passed', colour: '3DA35B', className: 'ok' },
  'compile-failed': { emoji: '🔴', label: 'Compile failed', colour: 'C92A2A', className: 'broken' },
  'dependency-failed': { emoji: '🔴', label: 'Dependencies unresolved', colour: 'C92A2A', className: 'broken' },
  'tests-failed': { emoji: '🟠', label: 'Tests failed', colour: 'E8590C', className: 'degraded' },
  'timed-out': { emoji: '🟠', label: 'Timed out', colour: 'E8590C', className: 'degraded' },
};

const outcomeOf = (id) => OUTCOME[id] || { emoji: '⚪', label: id || 'unknown', colour: '868E96', className: 'neutral' };

const CLASS_DEFS = [
  'classDef broken fill:#ffe3e3,stroke:#c92a2a,stroke-width:2px,color:#1a1a1a',
  'classDef degraded fill:#fff3bf,stroke:#e8590c,stroke-width:2px,color:#1a1a1a',
  'classDef ok fill:#e6fcf5,stroke:#2f9e44,stroke-width:2px,color:#1a1a1a',
  'classDef before fill:#e7f5ff,stroke:#1c7ed6,stroke-width:2px,color:#1a1a1a',
  'classDef after fill:#f3f0ff,stroke:#7048e8,stroke-width:2px,color:#1a1a1a',
  'classDef neutral fill:#f1f3f5,stroke:#868e96,stroke-width:1px,color:#1a1a1a',
];

function badgeText(text) {
  return String(text).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_');
}

function badge(label, message, colour) {
  return `![${label}](https://img.shields.io/badge/${badgeText(label)}-${badgeText(message)}-${colour}?style=for-the-badge)`;
}

const esc = (text) => String(text === null || text === undefined ? '' : text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\|/g, '\\|')
  .replace(/\r?\n/g, ' ');
const code = (text) => (text ? `\`${String(text).replace(/`/g, '')}\`` : '—');
// Mermaid renders label text as HTML and treats several characters as syntax, and these labels
// carry real build output — `expected:<200>`, `3.5.0 -> 4.1.1`, `Health(Builder)`. Everything
// risky is folded to a lookalike so the diagram never breaks on its own content; <br/> is added
// by the caller, after this.
const mermaidLabel = (text) => String(text === null || text === undefined ? '' : text)
  .replace(/\r?\n/g, ' ')
  .replace(/-{1,2}>/g, '→')
  .replace(/</g, '‹')
  .replace(/>/g, '›')
  .replace(/"/g, "'")
  .replace(/[[\]{}()]/g, '')
  .replace(/[;|`]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const mermaidText = (...parts) => parts
  .filter((p) => p !== null && p !== undefined && p !== '')
  .map(mermaidLabel)
  .join('<br/>');

function bullets(items, empty = '_none recorded_') {
  if (!items || !items.length) return [empty];
  return items.map((i) => `- ${esc(i)}`);
}

function durationText(ms) {
  if (!ms && ms !== 0) return '—';
  return ms >= 60000 ? `${(ms / 60000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// What actually failed — derived from the round records, never from prose
// ---------------------------------------------------------------------------

/** What each build goal actually proves, in words a non-engineer can read. */
const INTENT_GOAL = {
  compile: 'main sources compile',
  'test-compile': 'main + test sources compile',
  test: 'the test suite runs',
  package: 'the test suite runs and the jar builds',
  'package-skip-tests': 'the jar builds, tests skipped',
  verify: 'the full verify lifecycle passes',
  install: 'the artifact builds and installs locally',
};
const intentGoal = (intent) => INTENT_GOAL[intent] || `${intent} completes`;

const baseName = (file) => String(file || '').split('/').pop();

const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;

/** "3, 4, 5" for a handful of lines, "3-142 (13 lines)" once a list stops being readable. */
function lineRange(lines) {
  if (!lines || !lines.length) return '—';
  if (lines.length <= 6) return lines.join(', ');
  return `${lines[0]}–${lines[lines.length - 1]} (${lines.length} lines)`;
}

function firstSentences(text, count = 2) {
  const sentences = String(text || '').split(/(?<=\.)\s+/).filter(Boolean);
  return sentences.slice(0, count).join(' ');
}

function shorten(text, max = 46) {
  const clean = String(text || '').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trim()}…`;
}

/**
 * javac and Maven report the same problem twice — once as `[ERROR] File.java:[22,12] cannot find
 * symbol` and again in javac's enriched form with the symbol name attached. Both are real error
 * lines, and both stay counted as such, but they are one problem; a report that says "27 errors"
 * where 13 things are wrong teaches the reader to distrust its own numbers. Everything that
 * describes *what broke* counts distinct problems, and the raw line count is always printed beside
 * it so the two reconcile. Only errors carrying a file are folded — a build-level message has no
 * coordinates to fold on.
 */
function distinctErrors(round) {
  const buckets = new Map();
  const out = [];
  for (const e of round.errors || []) {
    if (!e.file) { out.push({ ...e }); continue; }
    const key = `${e.file}|${e.line || ''}`;
    const bucket = buckets.get(key) || [];
    const overlap = bucket.find((p) => p.message.startsWith(e.message) || e.message.startsWith(p.message));
    if (overlap) {
      if (e.message.length > overlap.message.length) {
        overlap.message = e.message;
        if ((e.detail || []).length) overlap.detail = e.detail;
        overlap.column = overlap.column || e.column;
      }
      continue;
    }
    const copy = { ...e };
    bucket.push(copy);
    buckets.set(key, bucket);
    out.push(copy);
  }
  return out;
}

/** One entry per file the compiler named: how many problems, which lines, which messages. */
function fileDigest(round) {
  const byFile = new Map();
  for (const e of distinctErrors(round)) {
    if (!e.file) continue;
    let entry = byFile.get(e.file);
    if (!entry) {
      entry = { file: e.file, count: 0, lines: [], problems: new Map(), categories: new Map() };
      byFile.set(e.file, entry);
    }
    entry.count += 1;
    if (e.line) entry.lines.push(Number(e.line));
    const label = shorten(e.message, 120);
    entry.problems.set(label, (entry.problems.get(label) || 0) + 1);
    entry.categories.set(e.category, (entry.categories.get(e.category) || 0) + 1);
  }
  return [...byFile.values()]
    .map((entry) => ({
      ...entry,
      lines: [...new Set(entry.lines)].sort((a, b) => a - b),
      problems: [...entry.problems.entries()].sort((a, b) => b[1] - a[1]),
      topCategory: [...entry.categories.entries()].sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort((a, b) => b.count - a.count);
}

/** Build-level errors — a resolver or plugin failure has no file to hang off. */
function buildLevelMessages(round) {
  const seen = new Set();
  const out = [];
  for (const e of distinctErrors(round)) {
    if (e.file) continue;
    if (/^Tests run:/i.test(e.message)) continue;
    if (seen.has(e.message)) continue;
    seen.add(e.message);
    out.push(e);
  }
  return out;
}

// Surefire prints each failing test twice: once as it happens, with the fully-qualified name, and
// once in the closing "Results:" block, with the assertion and the line number. The first pass
// supplies the package, the second the reason; the two are joined on the simple class name.
const TEST_TIME_LINE = /^([\w.$]+)\.([\w$]+)\s+--\s+Time elapsed:.*<<<\s*(FAILURE|ERROR)!/i;
const RESULT_LINE = /^([A-Z][\w$]*)(?:\.([\w$]+))?(?::(\d+))?\s*(?:[^\w\s]+\s*)?(.*)$/;

function parseTestFailures(round) {
  const lines = String(round.log_tail || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\[(?:ERROR|WARNING|INFO)\]\s?/, '').trim());

  const fqcnBySimple = new Map();
  for (const line of lines) {
    const m = TEST_TIME_LINE.exec(line);
    if (!m) continue;
    const fqcn = /^[A-Z]/.test(m[2]) ? `${m[1]}.${m[2]}` : m[1];
    if (fqcn.includes('.')) fqcnBySimple.set(fqcn.split('.').pop(), fqcn);
  }

  const found = new Map();
  const record = (simple, method, line, reason, kind) => {
    const key = method ? `${simple}.${method}` : simple;
    if (found.has(key) || !reason) return;
    found.set(key, {
      key,
      simple,
      method,
      fqcn: fqcnBySimple.get(simple) || simple,
      line: line ? Number(line) : null,
      reason: shorten(reason, 160),
      kind,
      category: classifyMessage(reason),
    });
  };

  let mode = null;
  for (const line of lines) {
    if (/^Failures:\s*$/i.test(line)) { mode = 'failure'; continue; }
    if (/^Errors:\s*$/i.test(line)) { mode = 'error'; continue; }
    if (!mode) continue;
    if (!line || /^(Tests run:|BUILD|Results|Skipped:|-{3,})/i.test(line)) { mode = null; continue; }
    const m = RESULT_LINE.exec(line);
    if (!m) continue;
    const method = m[2] && !/^[A-Z]/.test(m[2]) ? m[2] : null;
    record(m[1], method, m[3], (m[4] || '').trim(), mode);
  }

  // The results block sits at the very end of the log, so a tail that was cut short can lose it.
  // Fall back to the recorded error lines, which carry the same two shapes.
  if (!found.size) {
    for (const e of round.errors || []) {
      const assertion = /^([A-Z][\w$]*)\.([a-z][\w$]*):(\d+)\s+(.+)$/.exec(e.message);
      if (assertion) { record(assertion[1], assertion[2], assertion[3], assertion[4], 'failure'); continue; }
      const thrown = /^([A-Z][\w$]*)(?:\.([a-z][\w$]*))?\s+[^\w\s]+\s+(.+)$/.exec(e.message);
      if (thrown) record(thrown[1], thrown[2] || null, null, thrown[3], 'error');
    }
  }
  return [...found.values()];
}

const SOURCE_ROOTS = ['src/test/java', 'src/main/java', 'src/test/kotlin', 'src/main/kotlin'];
const SOURCE_INDEX = new WeakMap();

/** Every source file in the sandbox, indexed by its simple type name. Walked once per report. */
function sourceIndex(ctx) {
  if (!ctx) return new Map();
  if (SOURCE_INDEX.has(ctx)) return SOURCE_INDEX.get(ctx);
  const index = new Map();
  const root = ctx.meta && ctx.meta.workspace;
  const walk = (dir, prefix, depth) => {
    if (depth > 12) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (error) { return; }
    for (const entry of entries) {
      const child = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), child, depth + 1);
      else if (/\.(java|kt)$/.test(entry.name)) {
        const simple = entry.name.replace(/\.(java|kt)$/, '');
        if (!index.has(simple)) index.set(simple, child);
      }
    }
  };
  if (root) {
    for (const dir of SOURCE_ROOTS) {
      const abs = path.join(root, ...dir.split('/'));
      if (fs.existsSync(abs)) walk(abs, dir, 0);
    }
  }
  SOURCE_INDEX.set(ctx, index);
  return index;
}

/**
 * The test's own source file, confirmed to exist in the sandbox — never a guessed path. Surefire
 * only prints the package on the line where the test ran, which a truncated log tail can lose, so
 * a class that arrives with no package is resolved by simple name against the indexed sources.
 */
function sourcePathFor(fqcn, ctx) {
  const root = ctx && ctx.meta && ctx.meta.workspace;
  if (!root || !fqcn) return null;
  const parts = fqcn.replace(/\$.*$/, '').split('.');
  const simple = parts[parts.length - 1];
  if (parts.length > 1) {
    for (const dir of SOURCE_ROOTS) {
      const relPath = `${dir}/${parts.join('/')}.java`;
      if (fs.existsSync(path.join(root, ...relPath.split('/')))) return relPath;
    }
  }
  return sourceIndex(ctx).get(simple) || null;
}

/** Every test already failing in the pre-migration round, so later rounds can be read against it. */
function baselineTestFailures(rounds) {
  const baselineRound = rounds.find((r) => r.baseline);
  return new Set(baselineRound ? parseTestFailures(baselineRound).map((t) => t.key) : []);
}

/**
 * The shape of a round's breakage in one line. For a round that ran tests this counts *tests*, not
 * error lines — surefire prints several lines per failing test, and "Test failure ×8" printed beside
 * "2 failed" makes the report argue with itself.
 */
function failureShape(round) {
  const tests = parseTestFailures(round);
  if (tests.length) {
    const asserted = tests.filter((t) => t.kind !== 'error').length;
    const errored = tests.length - asserted;
    const environmental = tests.filter((t) => t.category === 'environment').length;
    const parts = [];
    if (asserted) parts.push(`${asserted} test${asserted === 1 ? '' : 's'} failed an assertion`);
    if (errored) parts.push(`${errored} test${errored === 1 ? '' : 's'} errored before asserting`);
    if (environmental) parts.push(`${environmental} of them environmental, not code`);
    return parts.join(' · ');
  }
  const counts = new Map();
  for (const e of distinctErrors(round)) counts.set(e.category, (counts.get(e.category) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const meaningful = ranked.filter(([id]) => id !== 'other' && id !== 'plugin-failure');
  return (meaningful.length ? meaningful : ranked)
    .slice(0, 3)
    .map(([id, count]) => `${categoryMeta(id).label} ×${count}`)
    .join(' · ');
}

/** Where a round broke, named: the files if the compiler named files, otherwise the tests. */
function failureLocations(round, limit = 3) {
  const files = fileDigest(round);
  if (files.length) {
    return {
      kind: 'files',
      total: files.length,
      items: files.slice(0, limit).map((f) => `${code(baseName(f.file))} (${f.count} problem${f.count === 1 ? '' : 's'})`),
      short: files.slice(0, limit).map((f) => `${baseName(f.file)} ×${f.count}`),
    };
  }
  const tests = parseTestFailures(round);
  if (tests.length) {
    return {
      kind: 'tests',
      total: tests.length,
      items: tests.slice(0, limit).map((t) => code(t.method ? `${t.simple}.${t.method}` : t.simple)),
      short: tests.slice(0, limit).map((t) => (t.method ? `${t.simple}.${t.method}` : t.simple)),
    };
  }
  return { kind: 'none', total: 0, items: [], short: [] };
}

// ---------------------------------------------------------------------------
// Diagrams
// ---------------------------------------------------------------------------

function stackDiagram(baseline, migration, finalRound, patchFiles) {
  const lang = migration.migration.language;
  const platform = migration.migration.platform;
  const green = finalRound && finalRound.outcome === 'passed';
  const lines = ['```mermaid', 'flowchart LR', ...CLASS_DEFS.map((d) => `  ${d}`)];
  lines.push('  subgraph BEFORE["Before"]', '    direction TB');
  lines.push(`    B1["${mermaidLabel(lang.name)} ${mermaidLabel(lang.from)}"]:::before`);
  lines.push(`    B2["${mermaidLabel(platform.name)} ${mermaidLabel(platform.from)}"]:::before`);
  lines.push(`    B3["${mermaidText(baseline.project.name, `${baseline.project.sources.main} main + ${baseline.project.sources.test} test sources`)}"]:::before`);
  lines.push('    B1 --- B2 --- B3');
  lines.push('  end');
  lines.push('  subgraph AFTER["After"]', '    direction TB');
  lines.push(`    A1["${mermaidLabel(lang.name)} ${mermaidLabel(lang.to)}"]:::after`);
  lines.push(`    A2["${mermaidLabel(platform.name)} ${mermaidLabel(platform.to)}"]:::after`);
  const changedFiles = patchFiles.length;
  lines.push(`    A3["${mermaidText(baseline.project.name, `${changedFiles} file${changedFiles === 1 ? '' : 's'} changed`)}"]:::${green ? 'ok' : 'degraded'}`);
  lines.push('    A1 --- A2 --- A3');
  lines.push('  end');
  const migrationRounds = Math.max((migration.round_notes || []).length - 1, 0);
  lines.push(`  BEFORE ==>|"${mermaidLabel(`${migrationRounds} migration round${migrationRounds === 1 ? '' : 's'}`)}"| AFTER`);
  lines.push('```');
  return lines.join('\n');
}

/**
 * Consecutive rounds that ran the same goal on the same JDK were chasing the same question, so the
 * diagram groups them into one phase. Derived from the records alone — no judgement needed, and a
 * migration with a different shape produces a differently shaped diagram.
 */
function roundPhases(rounds) {
  const phases = [];
  for (const r of rounds) {
    const key = r.baseline ? 'baseline' : `${r.build.intent}@${r.jdk.major}`;
    const last = phases[phases.length - 1];
    if (last && last.key === key) last.rounds.push(r);
    else phases.push({ key, rounds: [r], baseline: !!r.baseline, intent: r.build.intent, jdk: r.jdk.major });
  }
  return phases;
}

function phaseTitle(phase, index) {
  const count = phase.rounds.length;
  const rounds = count === 1 ? `round ${phase.rounds[0].round}` : `rounds ${phase.rounds[0].round}-${phase.rounds[count - 1].round}`;
  const what = phase.baseline
    ? `Reference build, before anything changed`
    : `Prove ${intentGoal(phase.intent)}`;
  return `Phase ${index} · ${what} · JDK ${phase.jdk} · ${rounds}`;
}

/** A round as a diagram node: outcome, what it ran, how it failed, and where. */
function roundNode(round) {
  const meta = outcomeOf(round.outcome);
  const totals = testTotals(round);
  const where = failureLocations(round, 2);
  const lines = [
    `${meta.emoji} Round ${round.round}${round.baseline ? ' · baseline' : ''} — ${meta.label}`,
    `${round.build.tool} ${round.build.intent} · JDK ${round.jdk.major} · ${durationText(round.duration_ms)}`,
  ];
  if (round.error_summary.total) {
    const distinct = distinctErrors(round).filter((e) => e.file).length;
    lines.push(`${plural(round.error_summary.total, 'error line')}${distinct ? ` · ${plural(distinct, 'distinct problem')}` : ''}`);
  } else {
    lines.push('no errors');
  }
  if (totals) {
    lines.push(`tests: ${totals.run} run · ${totals.failures} failed · ${totals.errors} errored`);
    const environmental = parseTestFailures(round).filter((t) => t.category === 'environment').length;
    if (environmental) lines.push(`${environmental} of them environmental, not code`);
  } else {
    const shape = failureShape(round);
    if (shape) lines.push(shape);
  }
  if (where.short.length) {
    const named = where.short.join(' · ');
    lines.push(`${named}${where.total > where.short.length ? ` +${where.total - where.short.length} more` : ''}`);
  }
  return `${roundId(round)}["${mermaidText(...lines)}"]:::${meta.className}`;
}

const roundId = (round) => `R${round.round}`;

/** What was changed between two rounds — the reason the next round exists. */
function edgeLabel(round, previous, notes) {
  const note = (notes || []).find((n) => n.round === round.round);
  const changes = (note && note.changes) || (round.label ? [round.label] : []);
  if (changes.length) {
    const head = shorten(changes[0], 52);
    return changes.length === 1 ? head : `${head} +${changes.length - 1} more`;
  }
  if (previous && previous.build.intent !== round.build.intent) {
    return `same code, next gate: ${round.build.tool} ${round.build.intent}`;
  }
  if (previous && previous.jdk.major !== round.jdk.major) return `same code, JDK ${previous.jdk.major} → ${round.jdk.major}`;
  return 'nothing changed — re-run';
}

/**
 * The migration as it actually ran: every round, grouped into the phase it belonged to, with the
 * change that provoked the next round written on the arrow between them. Top-down because the edge
 * labels carry real text — a left-to-right chain of eight rounds pushes them off the page.
 */
function roundsDiagram(rounds, notes) {
  const lines = ['```mermaid', 'flowchart TD', ...CLASS_DEFS.map((d) => `  ${d}`)];
  const styles = [];
  roundPhases(rounds).forEach((phase, index) => {
    const id = `P${index}`;
    lines.push(`  subgraph ${id}["${mermaidLabel(phaseTitle(phase, index))}"]`);
    lines.push('    direction TB');
    for (const round of phase.rounds) lines.push(`    ${roundNode(round)}`);
    lines.push('  end');
    styles.push(`  style ${id} fill:#f8f9fa,stroke:#ced4da,stroke-width:1px,color:#495057`);
  });
  for (let i = 1; i < rounds.length; i += 1) {
    const label = mermaidLabel(edgeLabel(rounds[i], rounds[i - 1], notes));
    lines.push(`  ${roundId(rounds[i - 1])} -->|"${label}"| ${roundId(rounds[i])}`);
  }
  lines.push(...styles);
  lines.push('```');
  return lines.join('\n');
}

function errorPie(round) {
  if (!round || !round.error_summary.total) return null;
  const lines = ['```mermaid', `pie showData title Round ${round.round} — ${round.error_summary.total} error lines by kind`];
  for (const c of round.error_summary.byCategory.slice(0, 8)) {
    lines.push(`  "${mermaidLabel(c.label)}" : ${c.count}`);
  }
  lines.push('```');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const TEST_INTENTS = ['test', 'package', 'verify'];

/** Pulls Maven's final "Tests run: …" summary out of a round that actually ran tests. */
function testTotals(round) {
  if (!round || !TEST_INTENTS.includes(round.build.intent)) return null;
  const matches = [...String(round.log_tail || '').matchAll(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)(?:,\s*Skipped:\s*(\d+))?/g)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  return {
    round: round.round,
    run: Number(last[1]),
    failures: Number(last[2]),
    errors: Number(last[3]),
    skipped: Number(last[4] || 0),
  };
}

/**
 * Compares the test suite before and after. A migration that leaves the same tests failing for the
 * same pre-existing reasons is a different thing from one that breaks tests, and the report has to
 * be able to tell them apart without the reader taking anyone's word for it.
 */
function testComparison(rounds) {
  const before = testTotals(rounds.find((r) => r.baseline)) || testTotals(rounds.find((r) => TEST_INTENTS.includes(r.build.intent)));
  const after = [...rounds].reverse().map(testTotals).find((t) => t && (!before || t.round !== before.round));
  if (!before && !after) return null;
  if (!before || !after) {
    return { before, after, verdict: '⚠️ only one side ran the test suite', worse: false };
  }
  const badBefore = before.failures + before.errors;
  const badAfter = after.failures + after.errors;
  const worse = badAfter > badBefore;
  const verdict = badAfter === badBefore
    ? (badBefore === 0 ? '🟢 all green, before and after' : `🟡 the same ${plural(badBefore, 'pre-existing failure')} — none introduced`)
    : (worse ? `🔴 ${plural(badAfter - badBefore, 'new failure')} introduced` : `🟢 ${plural(badBefore - badAfter, 'fewer failure')} than before`);
  return { before, after, verdict, worse };
}

const APPLY_STATUS = {
  'applied-verified': { emoji: '🟢', label: 'Applied to the project and green there', colour: '2E7D32' },
  'applied-verification-failed': { emoji: '🔴', label: 'Applied to the project, its build is not green', colour: 'C62828' },
  'applied-unverified': { emoji: '🟡', label: 'Applied to the project, not verified there', colour: 'B26A00' },
  reverted: { emoji: '↩️', label: 'Applied, then reverted', colour: '868E96' },
};

const applyStatusOf = (applied) => (applied && APPLY_STATUS[applied.status])
  || { emoji: '⚪', label: 'Not applied — sandbox only', colour: '868E96' };

function atAGlance(baseline, migration, rounds, finalRound, runtime, patchFiles, applied) {
  const lang = migration.migration.language;
  const platform = migration.migration.platform;
  const meta = outcomeOf(finalRound && finalRound.outcome);
  const failed = rounds.filter((r) => r.outcome !== 'passed' && !r.baseline).length;
  const rows = [
    ['**Result**', `${meta.emoji} **${meta.label}** on the final build`],
    ['**Platform**', `${esc(platform.name)} \`${esc(platform.from)}\` → \`${esc(platform.to)}\``],
    ['**Language**', `${esc(lang.name)} \`${esc(lang.from)}\` → \`${esc(lang.to)}\``],
    ['**Build rounds**', `${rounds.length} recorded — 1 pre-migration baseline, ${failed} that failed and were read for what to change next, ${rounds.filter((r) => r.outcome === 'passed').length} green`],
    ['**Files changed**', patchFiles.length ? `${patchFiles.length} — ${patchFiles.map((f) => `\`${f.file}\``).join(', ')}` : 'none'],
    ['**Dependency changes**', `${(migration.dependency_changes || []).length}`],
    ['**Source changes forced by the upgrade**', `${(migration.code_changes || []).length}`],
  ];
  const tests = testComparison(rounds);
  if (tests) {
    const fmt = (t) => (t ? `${t.run} run, ${t.failures} failed, ${plural(t.errors, 'error')}` : 'not run');
    rows.push(['**Test suite**', `before: ${fmt(tests.before)} → after: ${fmt(tests.after)} — ${tests.verdict}`]);
  }
  if (runtime.baseline || runtime.final) {
    const compared = compareProbes(runtime);
    rows.push(['**Runtime behaviour**', compared.verdictText]);
  }
  const round0 = rounds.find((r) => r.baseline);
  if (round0) {
    const gate = round0.gate || {};
    const probe = runtime.baseline && runtime.baseline.gate;
    const parts = [`build ${round0.outcome === 'passed' ? '🟢 green' : `🔴 ${round0.outcome}`} on JDK ${esc(round0.jdk.major)} via \`${esc(round0.build.intent)}\``];
    if (probe) parts.push(`runtime ${probe.met ? '🟢 clean' : '🔴 not clean'}`);
    rows.push(['**Starting point**', `${parts.join(', ')} — the migration only begins from a green baseline`]);
  }
  const applyMeta = applyStatusOf(applied);
  rows.push(['**Project state**', applied && applied.verification && applied.verification.ran
    ? `${applyMeta.emoji} ${applyMeta.label} — \`${esc(applied.verification.command)}\` on JDK ${esc(applied.verification.jdk.major)}, ${applied.verification.outcome}`
    : `${applyMeta.emoji} ${applyMeta.label}`]);
  rows.push(['**Reference followed**', code(migration.migration.reference_pack)]);
  rows.push(['**Build tool**', `${esc(baseline.build_tool.tool)}${baseline.build_tool.version ? ` — ${esc(baseline.build_tool.version)}` : ''}`]);
  // Who authorised this. A migration reached the project because somebody approved a plan, and
  // the report is where that authorisation has to be findable afterwards.
  const plan = readRenderedPlan(migration.slug);
  rows.push(['**Authorised by**', plan
    ? `${statusMeta(plan.status).emoji} plan ${plan.status.toLowerCase()}${plan.reviewer ? ` by ${esc(plan.reviewer)}` : ''}${plan.decided_on ? ` on ${esc(plan.decided_on)}` : ''} — [migration plan](./migration_plan_${migration.slug}.md) (revision ${plan.revision})`
    : '⚪ no migration plan on record for this session']);
  return ['| | |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n');
}

function versionMatrix(baseline, migration) {
  const rows = [];
  rows.push({
    what: `${migration.migration.language.name} (language level)`,
    from: migration.migration.language.from,
    to: migration.migration.language.to,
    why: 'Runtime baseline required by the new platform version.',
  });
  rows.push({
    what: `${migration.migration.platform.name} (platform)`,
    from: migration.migration.platform.from,
    to: migration.migration.platform.to,
    why: 'The version jump this migration is about.',
  });
  for (const d of migration.dependency_changes || []) {
    rows.push({ what: d.coordinate, from: d.from, to: d.to, why: d.reason, kind: d.kind });
  }
  const lines = ['| | What | Before | After | Why it moved |', '|---|---|---|---|---|'];
  for (const r of rows) {
    const mark = r.to === 'removed' ? '🗑️' : (r.kind === 'added' ? '➕' : (r.kind === 'rename' ? '🔀' : '⬆️'));
    lines.push(`| ${mark} | ${code(r.what)} | ${code(r.from)} | ${code(r.to)} | ${esc(r.why)} |`);
  }
  return lines.join('\n');
}

/** One paragraph framing the rounds before the reader meets the table. */
function roundsOverview(rounds) {
  const failed = rounds.filter((r) => r.outcome !== 'passed').length;
  const baselineRound = rounds.find((r) => r.baseline);
  const last = rounds[rounds.length - 1];
  const meta = outcomeOf(last.outcome);
  const totalMs = rounds.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
  const reference = baselineRound
    ? `Round ${baselineRound.round} is the pre-migration reference build on JDK ${baselineRound.jdk.major}; every later round ran on JDK ${last.jdk.major}. `
    : '**No pre-migration reference build was recorded**, so nothing below can be compared against how the project behaved before the upgrade. ';
  return `**${plural(rounds.length, 'build round')}**, ${durationText(totalMs)} of build time in total. ${reference}`
    + `${failed} of them came back with errors, ${rounds.length - failed} came back clean. `
    + 'A red round is not a setback here — it is the output the migration is driven by: each one names the exact files or tests the next change has to touch, '
    + `and nothing was edited that a build had not first complained about. The migration ends on round ${last.round}, ${meta.emoji} **${meta.label}**.`;
}

/** The "What it told us" cell: what broke, where it broke, and the opening of the diagnosis. */
function toldUsCell(round, note) {
  const parts = [];
  if (round.outcome === 'passed') {
    parts.push(`**Nothing failed** — ${intentGoal(round.build.intent)} on JDK ${round.jdk.major}.`);
  } else {
    const shape = failureShape(round);
    if (shape) parts.push(`**${esc(shape)}**`);
    const where = failureLocations(round, 3);
    if (where.items.length) {
      const more = where.total > where.items.length ? ` +${where.total - where.items.length} more` : '';
      parts.push(`${where.kind === 'files' ? 'in' : 'failing tests:'} ${where.items.join(' · ')}${more}`);
    }
  }
  if (note && note.diagnosis) parts.push(esc(firstSentences(note.diagnosis, 2)));
  return parts.join('<br/>') || '—';
}

function roundsTable(rounds, notes) {
  const lines = ['| Round | Ran on | Goal | Outcome | Errors | Took | What it told us |', '|---|---|---|---|---|---|---|'];
  for (const r of rounds) {
    const meta = outcomeOf(r.outcome);
    const note = (notes || []).find((n) => n.round === r.round);
    const distinct = distinctErrors(r).filter((e) => e.file).length;
    const errorCell = r.error_summary.total
      ? `${r.error_summary.total}${distinct && distinct !== r.error_summary.total ? `<br/>_${distinct} distinct_` : ''}`
      : '—';
    lines.push(`| **${r.round}**${r.baseline ? '<br/>_(baseline)_' : ''} | JDK ${r.jdk.major} | ${code(r.build.intent)}<br/>_${esc(intentGoal(r.build.intent))}_ | ${meta.emoji} ${meta.label} | ${errorCell} | ${durationText(r.duration_ms)} | ${toldUsCell(r, note)} |`);
  }
  return lines.join('\n');
}

/**
 * The part of the report that answers "what is failing, in which file, and why" without the reader
 * having to open a build log. Everything in the tables is read off the round record; only the
 * "Why it failed" paragraph is the agent's, and it is labelled as such.
 */
function failureDetail(rounds, notes, ctx) {
  const failing = rounds.filter((r) => r.outcome !== 'passed');
  if (!failing.length) return '_Every round came back green — there is nothing to explain here._';
  const alreadyFailing = baselineTestFailures(rounds);
  const noteFor = (round) => (round ? (notes || []).find((n) => n.round === round.round) : null);
  const out = [];

  for (const round of failing) {
    const meta = outcomeOf(round.outcome);
    const note = noteFor(round);
    const nextRound = rounds[rounds.indexOf(round) + 1];
    const response = noteFor(nextRound);
    const files = fileDigest(round);
    const tests = parseTestFailures(round);
    const totals = testTotals(round);

    out.push(`#### Round ${round.round} — ${meta.emoji} ${meta.label}${round.baseline ? ' _(pre-migration reference, not migration damage)_' : ''}`);
    out.push('');
    const facts = [
      `${code(`${round.build.tool} ${round.build.intent}`)} on JDK ${round.jdk.major}`,
      plural(round.error_summary.total, 'error line'),
    ];
    if (files.length) facts.push(`${plural(files.reduce((n, f) => n + f.count, 0), 'distinct problem')} across ${plural(files.length, 'file')}`);
    if (totals) facts.push(`${totals.run} tests run · ${totals.failures} failed · ${totals.errors} errored`);
    out.push(facts.join(' · '));
    out.push('');

    if (files.length) {
      out.push('**Which files failed**');
      out.push('');
      out.push('| File | Problems | At line(s) | What the build said about it | Why this kind of error happens |', '|---|---|---|---|---|');
      for (const f of files) {
        const said = f.problems.slice(0, 4)
          .map(([message, count]) => `${esc(message)}${count > 1 ? ` _(×${count})_` : ''}`)
          .join('<br/>');
        const more = f.problems.length > 4 ? `<br/>_…and ${f.problems.length - 4} more_` : '';
        out.push(`| ${code(f.file)} | ${f.count} | ${lineRange(f.lines)} | ${said}${more} | ${esc(categoryMeta(f.topCategory).hint)} |`);
      }
      out.push('');
    }

    if (tests.length) {
      out.push('**Which tests failed**');
      out.push('');
      out.push('| Test | Source file | Why it failed | What kind of problem | Was it already failing? |', '|---|---|---|---|---|');
      for (const t of tests) {
        const source = sourcePathFor(t.fqcn, ctx);
        const where = source ? `${code(source)}${t.line ? `<br/>line ${t.line}` : ''}` : `${code(t.fqcn)}${t.line ? `<br/>line ${t.line}` : ''}`;
        const history = round.baseline
          ? '_this is the baseline_'
          : (alreadyFailing.has(t.key) ? '⚪ yes — already failing in the reference build' : '🔴 no — new since the reference build');
        out.push(`| ${code(t.method ? `${t.simple}.${t.method}` : t.simple)}${t.kind === 'error' ? '<br/>_(errored, not asserted)_' : ''} | ${where} | ${esc(t.reason)} | ${esc(categoryMeta(t.category).label)} — ${esc(categoryMeta(t.category).hint)} | ${history} |`);
      }
      out.push('');
    }

    if (!files.length && !tests.length) {
      const messages = buildLevelMessages(round);
      if (messages.length) {
        out.push('**What the build reported** — no file was named, so this failed before or after compilation:');
        out.push('');
        out.push('| Message | Kind |', '|---|---|');
        for (const m of messages.slice(0, 8)) out.push(`| ${esc(shorten(m.message, 200))} | ${esc(categoryMeta(m.category).label)} |`);
        out.push('');
      }
    }

    if (note && note.diagnosis) {
      out.push('**Why it failed**');
      out.push('');
      out.push(esc(note.diagnosis));
      out.push('');
    }

    if (response && (response.changes || []).length) {
      out.push(`**What was changed in response** — then re-run as round ${nextRound.round}`);
      out.push('');
      out.push(...response.changes.map((c) => `- ${esc(c)}`));
      if ((response.reference_rules || []).length) {
        out.push('');
        out.push(`Reference rule(s) applied: ${response.reference_rules.map((r) => code(r)).join(' · ')}`);
      }
      out.push('');
    } else if (!nextRound) {
      out.push('⚠️ **This was the last round recorded, and it was not green.** Nothing was changed after it.');
      out.push('');
    } else {
      out.push(`**No source change was needed** — round ${nextRound.round} re-ran ${code(`${nextRound.build.tool} ${nextRound.build.intent}`)} on the same code.`);
      out.push('');
    }

    out.push(`_Every error line, the exact command and the full build log for this round are in **section 3, Round ${round.round}**._`);
    out.push('');
  }
  return out.join('\n');
}

function roundDetail(round, note, ctx) {
  const meta = outcomeOf(round.outcome);
  const out = [];
  out.push(`### Round ${round.round} — ${meta.emoji} ${meta.label}${round.baseline ? ' _(pre-migration reference)_' : ''}`);
  out.push('');
  if (round.baseline) {
    out.push('> **Nothing had been changed yet.** This is the reference every later round is read against.');
    out.push('');
  } else if (note && note.changes && note.changes.length) {
    out.push(`> **Changed before this round:** ${esc(note.changes.join(' · '))}`);
    out.push('');
  } else if (round.label) {
    out.push(`> **Changed before this round:** ${esc(round.label)}`);
    out.push('');
  }
  out.push('| | |', '|---|---|');
  out.push(`| **Command** | ${code(round.build.command)} |`);
  out.push(`| **JDK** | ${round.jdk.major} (${esc(round.jdk.version)}) |`);
  out.push(`| **Declared in the build** | Java ${code(round.declared.java)}${round.declared.parent ? ` · ${code(`${round.declared.parent.artifactId} ${round.declared.parent.version}`)}` : ''} |`);
  out.push(`| **Exit code** | ${round.build.exit_code === null ? '—' : round.build.exit_code} |`);
  out.push(`| **Duration** | ${durationText(round.duration_ms)} |`);
  out.push(`| **Workspace at this point** | ${esc(round.workspace.diff_stat)} |`);
  out.push('');

  if (note) {
    out.push('**What the result meant**');
    out.push('');
    out.push(esc(note.diagnosis));
    out.push('');
  }

  if (round.error_summary.total) {
    out.push('**Errors by kind**');
    out.push('');
    out.push('| Count | Kind | What this kind of error means |', '|---|---|---|');
    for (const c of round.error_summary.byCategory) {
      const m = categoryMeta(c.id);
      out.push(`| ${c.count} | ${esc(c.label)} | ${esc(m.hint)} |`);
    }
    out.push('');
    const files = fileDigest(round);
    if (files.length) {
      out.push('**Which files, and what was wrong with each**');
      out.push('');
      out.push('| File | Problems | At line(s) | Dominant kind |', '|---|---|---|---|');
      for (const f of files) {
        out.push(`| ${code(f.file)} | ${f.count} | ${lineRange(f.lines)} | ${esc(categoryMeta(f.topCategory).label)} |`);
      }
      out.push('');
    }
    const failedTests = parseTestFailures(round);
    if (failedTests.length) {
      out.push('**Which tests failed**');
      out.push('');
      out.push('| Test | Source file | Line | Why it failed |', '|---|---|---|---|');
      for (const t of failedTests) {
        const source = sourcePathFor(t.fqcn, ctx);
        out.push(`| ${code(t.method ? `${t.simple}.${t.method}` : t.simple)} | ${source ? code(source) : code(t.fqcn)} | ${t.line || '—'} | ${esc(t.reason)} |`);
      }
      out.push('');
    }
    const distinct = [...new Set(round.errors.map((e) => e.message))];
    out.push('**Distinct messages**');
    out.push('');
    out.push('```text');
    for (const m of distinct.slice(0, 25)) out.push(m.length > 220 ? `${m.slice(0, 220)}…` : m);
    if (distinct.length > 25) out.push(`… and ${distinct.length - 25} more`);
    out.push('```');
    out.push('');
    out.push(...allErrorsTable(round));
  }

  if (note && note.reference_rules && note.reference_rules.length) {
    out.push(`**Reference rules applied:** ${note.reference_rules.map((r) => code(r)).join(' · ')}`);
    out.push('');
  }

  out.push('<details>');
  out.push('<summary>Build log tail</summary>');
  out.push('');
  out.push('```text');
  const logLines = String(round.log_tail || '(no output captured)').split(/\r?\n/);
  if (logLines.length > 60) out.push(`… first ${logLines.length - 60} line(s) omitted — the complete log is at rounds/round-${String(round.round).padStart(2, '0')}.log`);
  out.push(...logLines.slice(-60));
  out.push('```');
  out.push('');
  out.push('</details>');
  out.push('');
  return out.join('\n');
}

function codeChanges(migration) {
  const changes = migration.code_changes || [];
  if (!changes.length) return '_No source file needed changing — the upgrade was dependency-only._';
  const byCategory = new Map();
  for (const c of changes) {
    const key = c.category || 'Other';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(c);
  }
  const out = [];
  out.push('| Category | Files | Forced by |', '|---|---|---|');
  for (const [category, items] of byCategory) {
    out.push(`| **${esc(category)}** | ${items.length} | ${esc(items[0].why)} |`);
  }
  out.push('');
  for (const [category, items] of byCategory) {
    out.push(`### ${category}`);
    out.push('');
    for (const c of items) {
      out.push(`**${code(c.file)}**${c.found_in_round !== undefined ? ` — surfaced by round ${c.found_in_round}` : ''}`);
      out.push('');
      out.push(`${esc(c.what)} ${esc(c.why)}`);
      out.push('');
      if (c.reference_rule) out.push(`_Reference rule: ${esc(c.reference_rule)}_`);
      if (c.before || c.after) {
        out.push('');
        out.push('```diff');
        for (const line of String(c.before || '').split(/\r?\n/)) if (line.trim()) out.push(`- ${line}`);
        for (const line of String(c.after || '').split(/\r?\n/)) if (line.trim()) out.push(`+ ${line}`);
        out.push('```');
      }
      out.push('');
    }
  }
  return out.join('\n');
}

/**
 * Splits the cumulative patch into one entry per file, with line counts. Everything the report
 * says about "what changed" is derived from this — the actual patch — so a file cannot be left
 * out of the report by being left out of the agent's judgement file.
 */
function splitPatchByFile(patchText) {
  if (!patchText) return [];
  return patchText
    .split(/^diff --git /m)
    .filter((part) => part.trim())
    .map((part) => {
      const chunk = `diff --git ${part.replace(/\s+$/, '')}`;
      const header = /^diff --git a\/(.+?) b\/(.+)$/m.exec(chunk);
      const file = header ? header[2].trim() : '(unknown)';
      const added = (chunk.match(/^\+(?!\+\+ )/gm) || []).length;
      const removed = (chunk.match(/^-(?!-- )/gm) || []).length;
      const status = /^new file mode/m.test(chunk) ? 'added'
        : (/^deleted file mode/m.test(chunk) ? 'deleted'
          : (/^rename from/m.test(chunk) ? 'renamed' : 'modified'));
      return { file, chunk, added, removed, status, binary: /^Binary files /m.test(chunk) };
    });
}

const STATUS_MARK = { added: '➕', deleted: '🗑️', renamed: '🔀', modified: '✏️' };

/**
 * Section 5: every file in the patch, with its own diff. The per-file note is matched from the
 * agent's judgement; a file with no note is called out rather than quietly listed, because an
 * unexplained change in a migration is exactly what a reviewer needs to see.
 */
function everyFileChanged(migration, patchFiles) {
  if (!patchFiles.length) return '_The patch is empty — nothing was changed._';
  const noteFor = (file) => {
    const code = (migration.code_changes || []).find((c) => c.file && file.endsWith(c.file.replace(/^\.\//, '')));
    if (code) return { text: `${code.what}`, explained: true };
    const isDescriptor = /(^|\/)(pom\.xml|build\.gradle(\.kts)?|gradle\.properties)$/.test(file);
    if (isDescriptor && (migration.dependency_changes || []).length) {
      return { text: `Version and coordinate changes — see §1 (${migration.dependency_changes.length} entries).`, explained: true };
    }
    const ancillary = /Dockerfile|docker-compose|\.ya?ml$|\.tool-versions|\.sdkmanrc|workflows\//.test(file);
    if (ancillary) return { text: 'Runtime/CI version change.', explained: false };
    return { text: '_not explained in the migration record_', explained: false };
  };

  const out = [];
  out.push(`All **${patchFiles.length}** file(s) below differ from the project as it stood before round 0. Line counts are from the patch itself.`);
  out.push('');
  out.push('| | File | + | − | What changed |', '|---|---|---|---|---|');
  for (const f of patchFiles) {
    const note = noteFor(f.file);
    out.push(`| ${STATUS_MARK[f.status]} | ${code(f.file)} | ${f.binary ? '—' : `+${f.added}`} | ${f.binary ? '—' : `−${f.removed}`} | ${esc(note.text)} |`);
  }
  out.push('');

  const unexplained = patchFiles.filter((f) => !noteFor(f.file).explained && !f.binary);
  if (unexplained.length) {
    out.push(`> ⚠️ **${unexplained.length} changed file(s) carry no entry in the migration record**: ${unexplained.map((f) => code(f.file)).join(', ')}.`);
    out.push('> Read their diffs below and confirm each one is genuinely required by the upgrade.');
    out.push('');
  }

  out.push('### Every change, file by file');
  out.push('');
  for (const f of patchFiles) {
    out.push('<details>');
    out.push(`<summary><b>${f.file}</b> — ${f.status}${f.binary ? ', binary' : ` (+${f.added} −${f.removed})`}</summary>`);
    out.push('');
    const note = noteFor(f.file);
    out.push(esc(note.text));
    out.push('');
    out.push('```diff');
    const lines = f.chunk.split(/\r?\n/);
    out.push(...(lines.length > 400
      ? [...lines.slice(0, 400), `… ${lines.length - 400} more line(s) — see the full patch file`]
      : lines));
    out.push('```');
    out.push('');
    out.push('</details>');
    out.push('');
  }
  return out.join('\n');
}

/**
 * The plan's forecast against what actually happened.
 *
 * The plan predicted a set of files and a number of rounds before any of it ran. Showing the two
 * side by side is the only way anyone learns whether the planning was worth anything — and an
 * unforeseen file is the interesting column, because it is where the plan was blind.
 */
function planComparison(slug, patchFiles) {
  const plan = readJson(sessionPaths(slug).plan);
  if (!plan || !Array.isArray(plan.predicted_changes) || !plan.predicted_changes.length) return null;

  const normalise = (file) => String(file || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  const actual = new Set(patchFiles.map((f) => normalise(f.file)));
  const predicted = plan.predicted_changes.map((c) => ({ ...c, key: normalise(c.file) }));
  const predictedKeys = new Set(predicted.map((c) => c.key));

  const hit = predicted.filter((c) => actual.has(c.key));
  const miss = predicted.filter((c) => !actual.has(c.key));
  const unforeseen = patchFiles.filter((f) => !predictedKeys.has(normalise(f.file)));

  const rounds = listRounds(slug);
  const forecastRounds = plan.effort && plan.effort.estimated_rounds;

  const out = [];
  out.push('What the plan said would happen, measured against what did. The plan was written before any version changed, so a wrong prediction here is information, not a failure.');
  out.push('');
  out.push('| | Forecast | Actual |');
  out.push('|---|---|---|');
  out.push(`| Files changed | ${predicted.length} | ${patchFiles.length} |`);
  out.push(`| Predicted and did change | — | ${hit.length} of ${predicted.length} |`);
  out.push(`| Predicted but did not change | — | ${miss.length} |`);
  out.push(`| Changed but not predicted | — | ${unforeseen.length} |`);
  if (forecastRounds) out.push(`| Build rounds | ~${forecastRounds} | ${rounds.length} |`);
  out.push('');

  if (miss.length) {
    out.push('**Predicted but untouched** — the plan expected these to change and the build never asked for it.');
    out.push('');
    out.push('| File | What was expected | Confidence at the time |', '|---|---|---|');
    for (const c of miss) out.push(`| ${code(c.file)} | ${esc(c.what)} | ${esc(c.confidence) || '—'} |`);
    out.push('');
  }
  if (unforeseen.length) {
    out.push('**Changed without being predicted** — the plan did not see these coming. Each is explained in its own row in section 5 above.');
    out.push('');
    for (const f of unforeseen) out.push(`- ${code(f.file)}`);
    out.push('');
  }
  if (!miss.length && !unforeseen.length) {
    out.push('The plan named exactly the files that changed.');
    out.push('');
  }
  return out.join('\n');
}

function allErrorsTable(round) {
  if (!round.error_summary.total) return [];
  const out = ['<details>'];
  out.push(`<summary>Every error line recorded in this round (${round.errors.length}${round.errors_truncated ? ` of ${round.error_summary.total}` : ''})</summary>`);
  out.push('');
  out.push('| # | File | Line | Kind | Message |', '|---|---|---|---|---|');
  round.errors.forEach((e, i) => {
    out.push(`| ${i + 1} | ${e.file ? code(e.file) : '_build_'} | ${e.line || '—'} | ${esc(categoryMeta(e.category).label)} | ${esc(e.message)} |`);
  });
  if (round.errors_truncated) out.push(`\n_${round.errors_truncated} further error line(s) were not recorded; the full log is below._`);
  out.push('');
  out.push('</details>');
  out.push('');
  return out;
}

function compareProbes(runtime) {
  const before = runtime.baseline;
  const after = runtime.final;
  if (!before || !after) {
    return {
      verdictText: before || after ? '⚠️ Only one side was probed — no comparison possible' : '⚠️ Not probed',
      rows: [],
      matched: 0,
      total: 0,
    };
  }
  const rows = [];
  for (const b of before.probes || []) {
    const a = (after.probes || []).find((p) => p.name === b.name);
    const same = a && a.status === b.status && a.body_hash === b.body_hash;
    // A changed status is a different kind of finding from a changed body at the same status:
    // the first is a contract break, the second is usually an envelope, a timestamp or an
    // ordering. The report says which, and leaves the judgement to the reader.
    const statusSame = a && a.status === b.status && a.ok === b.ok;
    rows.push({
      name: b.name,
      request: `${b.method} ${b.path}`,
      beforeStatus: b.ok ? b.status : 'error',
      afterStatus: a ? (a.ok ? a.status : 'error') : 'not run',
      beforeHash: b.body_hash,
      afterHash: a ? a.body_hash : null,
      same: Boolean(same),
      verdict: same ? 'identical' : (statusSame ? 'body-differs' : 'status-differs'),
    });
  }
  const matched = rows.filter((r) => r.same).length;
  const bodyOnly = rows.filter((r) => r.verdict === 'body-differs').length;
  const statusChanged = rows.filter((r) => r.verdict === 'status-differs').length;
  let verdictText = '⚠️ No probes were defined';
  if (rows.length) {
    if (matched === rows.length) verdictText = `🟢 identical on all ${rows.length} probe(s)`;
    else if (!statusChanged) verdictText = `🟡 same status on all ${rows.length}, body differs on ${bodyOnly}`;
    else verdictText = `🔴 ${statusChanged} of ${rows.length} probe(s) changed status`;
  }
  return { rows, matched, bodyOnly, statusChanged, total: rows.length, verdictText };
}

function behaviourSection(runtime, migration, ctxRounds) {
  const compared = compareProbes(runtime);
  const out = [];
  const before = runtime.baseline;
  const after = runtime.final;

  if (!before && !after) {
    out.push('> ⚠️ **The application was never exercised.** Neither runtime probe ran, so nothing in');
    out.push('> this report says the migrated application still behaves as it did. A green build is');
    out.push('> not evidence of preserved behaviour.');
    out.push('');
    if (migration.behaviour) {
      out.push(`**Verdict:** ${esc(migration.behaviour.verdict)}${migration.behaviour.notes ? ` — ${esc(migration.behaviour.notes)}` : ''}`);
      out.push('');
    }
    return out.join('\n');
  }

  out.push('| | Before | After |', '|---|---|---|');
  out.push(`| **Ran on** | ${before ? `JDK ${before.jdk.major} (${esc(before.jdk.version)})` : '—'} | ${after ? `JDK ${after.jdk.major} (${esc(after.jdk.version)})` : '—'} |`);
  out.push(`| **Application started** | ${before ? (before.started ? '🟢 yes' : '🔴 no') : '—'} | ${after ? (after.started ? '🟢 yes' : '🔴 no') : '—'} |`);
  out.push(`| **Startup time** | ${before && before.startup_seconds ? `${before.startup_seconds}s` : '—'} | ${after && after.startup_seconds ? `${after.startup_seconds}s` : '—'} |`);
  out.push(`| **Probes replayed** | ${before ? (before.probes || []).length : '—'} | ${after ? (after.probes || []).length : '—'} |`);
  out.push('');

  if (!before || !after) {
    out.push(`> ⚠️ **Only the ${before ? 'before' : 'after'} side was probed**, so there is no comparison —`);
    out.push('> nothing here shows whether behaviour was preserved.');
    out.push('');
  }

  if (compared.rows.length) {
    out.push('| | Request | Before | After | Same response? |', '|---|---|---|---|---|');
    const MARK = { identical: ['🟢', 'identical'], 'body-differs': ['🟡', 'same status, **body differs**'], 'status-differs': ['🔴', '**status changed**'] };
    for (const r of compared.rows) {
      const [mark, label] = MARK[r.verdict] || ['⚪', 'not run'];
      out.push(`| ${mark} | ${esc(r.name)}<br/>${code(r.request)} | \`${r.beforeStatus}\` · \`${r.beforeHash || '—'}\` | \`${r.afterStatus}\` · \`${r.afterHash || '—'}\` | ${label} |`);
    }
    out.push('');
    out.push(`🟢 ${compared.matched} identical · 🟡 ${compared.bodyOnly} same status with a different body · 🔴 ${compared.statusChanged} changed status`);
    out.push('');
    out.push('_Responses are compared by HTTP status and a hash of the whitespace-normalised body. A body that embeds a timestamp or an unordered collection can differ between two runs of the same build — check such a row against the excerpts in the runtime records before treating it as a migration effect._');
    out.push('');
  }

  if (migration.behaviour) {
    out.push(`**Verdict:** ${esc(migration.behaviour.verdict)}${migration.behaviour.notes ? ` — ${esc(migration.behaviour.notes)}` : ''}`);
    out.push('');
  }

  const tests = testComparison(ctxRounds);
  if (tests) {
    out.push('### The test suite, before and after');
    out.push('');
    out.push('| | Round | Tests run | Failures | Errors | Skipped |', '|---|---|---|---|---|---|');
    for (const [label, totals] of [['Before', tests.before], ['After', tests.after]]) {
      if (!totals) {
        out.push(`| **${label}** | — | not run | — | — | — |`);
        continue;
      }
      const mark = totals.failures + totals.errors === 0 ? '🟢' : '🔴';
      out.push(`| **${label}** ${mark} | ${totals.round} | ${totals.run} | ${totals.failures} | ${totals.errors} | ${totals.skipped} |`);
    }
    out.push('');
    out.push(`**${tests.verdict}**`);
    out.push('');
    out.push('_Both rows come from the same build goal on the same suite, so the counts are directly comparable. A failure present on both sides was already failing before the migration started._');
    out.push('');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Cumulative patch
// ---------------------------------------------------------------------------

// The section that says whether any of this reached the project. Everything in it is read from
// applied.json, which apply-migration.js writes — nothing here is the agent's word for it.
function appliedSection(applied, runtime, slug) {
  const out = [];
  if (!applied) {
    out.push('_The migration has **not** been applied to the project._ Everything above happened in the');
    out.push('sandbox copy, and the project directory still holds the pre-migration code. A migration is');
    out.push('not finished until it is in the project:');
    out.push('');
    out.push('```powershell');
    out.push(`node scripts/apply-migration.js --slug ${slug} --to-project`);
    out.push('```');
    return out.join('\n');
  }

  const meta = applyStatusOf(applied);
  const v = applied.verification || {};
  out.push(`**${meta.emoji} ${meta.label}** — ${esc(applied.written)} file(s) written and ${esc(applied.removed)} removed in \`${esc(applied.project_dir)}\` on ${esc(String(applied.applied_at).slice(0, 19).replace('T', ' '))} UTC.`);
  out.push('');
  out.push('| | |', '|---|---|');
  out.push(`| **Applied from** | round ${esc(applied.source_round.round)}, which ended \`${esc(applied.source_round.outcome)}\` on JDK ${esc(applied.source_round.jdk)} |`);
  out.push(`| **Files written** | ${esc(applied.written)} |`);
  out.push(`| **Files removed** | ${esc(applied.removed)} |`);
  out.push(`| **Backup** | ${code(applied.backup && applied.backup.dir)} — \`apply-migration.js --slug ${slug} --revert\` restores it |`);
  if (v.ran) {
    out.push(`| **The project's own build** | \`${esc(v.command)}\` on JDK ${esc(v.jdk.major)} (${esc(v.jdk.version)}) |`);
    out.push(`| **Result** | ${v.outcome === 'passed' ? '🟢' : '🔴'} \`${esc(v.outcome)}\` — exit ${esc(v.exit_code)}, ${durationText(v.duration_ms)} |`);
    if (v.error_summary && v.error_summary.total) {
      out.push(`| **Errors** | ${esc(v.error_summary.total)} line(s): ${v.error_summary.byCategory.map((c) => `${esc(c.count)} ${esc(c.label)}`).join(', ')} |`);
    }
  } else {
    out.push(`| **The project's own build** | not run — ${esc(v.reason || 'no reason recorded')} |`);
  }
  const appliedProbe = runtime.applied;
  if (appliedProbe) {
    const gate = appliedProbe.gate || {};
    out.push(`| **The project running** | ${gate.met ? '🟢' : '🔴'} ${appliedProbe.started ? 'started' : 'did not start'} on JDK ${esc(appliedProbe.jdk.major)}, ${esc((appliedProbe.probes || []).length)} probe(s) replayed |`);
  }
  out.push('');

  if (v.ran && v.outcome !== 'passed') {
    out.push('The files are in the project but the project does not build green. That gap is between the');
    out.push('sandbox and the project — local configuration, a stale build directory, or a file the');
    out.push('sandbox copy never carried — and it has to be closed before the migration is done.');
    out.push('');
    out.push('```text');
    out.push(String(v.log_tail || '').split(/\r?\n/).slice(-25).join('\n'));
    out.push('```');
    out.push('');
  }

  if (appliedProbe && (appliedProbe.probes || []).length) {
    out.push('**The migrated project, answering:**');
    out.push('');
    out.push('| Probe | Method | Path | Status | Expected |', '|---|---|---|---|---|');
    for (const p of appliedProbe.probes) {
      const expected = p.expected_status === null || p.expected_status === undefined
        ? '—'
        : `${esc(p.expected_status)} ${p.meets_expectation ? '✅' : '❌'}`;
      out.push(`| ${esc(p.name)} | ${code(p.method)} | ${code(p.path)} | ${p.ok ? esc(p.status) : '**no response**'} | ${expected} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

function exportDiff(paths, meta) {
  if (!meta || !fs.existsSync(paths.workspace)) return { text: null, stat: null };
  const git = (...a) => run('git', ['-C', paths.workspace, ...a]);
  git('add', '-A');
  const diff = git('diff', '--cached', '--binary', meta.baseline_commit);
  const stat = git('diff', '--cached', '--stat', meta.baseline_commit).stdout.trim();
  return { text: diff.stdout || '', stat };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function renderReport(ctx) {
  const {
    slug, baseline, migration, rounds, runtime, finalRound, patchStat, meta, applied,
  } = ctx;
  const outcome = outcomeOf(finalRound && finalRound.outcome);
  const failingRound = rounds
    .filter((r) => r.error_summary.total > 0)
    .sort((a, b) => b.error_summary.total - a.error_summary.total || a.round - b.round)[0];
  const out = [];

  out.push(`# Migration Report — ${migration.title}`);
  out.push('');
  out.push(`## ${baseline.project.name}`);
  out.push('');
  out.push([
    badge('Result', outcome.label, outcome.colour),
    badge(migration.migration.platform.name, `${migration.migration.platform.from} → ${migration.migration.platform.to}`, '2E5FD9'),
    badge('Java', `${migration.migration.language.from} → ${migration.migration.language.to}`, '6E86E8'),
    badge('Rounds', String(rounds.length), '1F3864'),
    badge('Files changed', String(ctx.patchFiles.length), 'A0399B'),
    badge('Project', applyStatusOf(applied).label, applyStatusOf(applied).colour),
  ].join(' '));
  out.push('');
  out.push(`> ${migration.summary}`);
  out.push('');
  out.push(`_Generated by the Version Migration skill on ${new Date().toISOString().slice(0, 10)}. Every version, error count and response below is read from a recorded run, not from memory._`);
  out.push('');

  out.push('## At a glance');
  out.push('');
  out.push(atAGlance(baseline, migration, rounds, finalRound, runtime, ctx.patchFiles, applied));
  out.push('');

  out.push('## 1. What moved');
  out.push('');
  out.push(stackDiagram(baseline, migration, finalRound, ctx.patchFiles));
  out.push('');
  out.push(versionMatrix(baseline, migration));
  out.push('');

  out.push('## 2. How the migration went');
  out.push('');
  out.push(roundsOverview(rounds));
  out.push('');
  out.push(roundsDiagram(rounds, migration.round_notes));
  out.push('');
  out.push('### 2.1 The round ledger');
  out.push('');
  out.push(roundsTable(rounds, migration.round_notes));
  out.push('');
  out.push('### 2.2 Exactly what failed, and why');
  out.push('');
  out.push('One block per round that did not come back green: the files or the tests the build named, the message it printed against each one, and what that meant. Paths are as the compiler reported them, relative to the project root, and the line numbers are the lines it pointed at. Everything in the tables is read out of the recorded build; only the **Why it failed** paragraph is the agent\'s reading of it.');
  out.push('');
  out.push(failureDetail(rounds, migration.round_notes, ctx));
  out.push('');
  const pie = errorPie(failingRound);
  if (pie) {
    out.push('### 2.3 The mix of breakage in the worst round');
    out.push('');
    out.push(`Round ${failingRound.round} carried more error lines than any other — ${failingRound.error_summary.total} of them, in these proportions:`);
    out.push('');
    out.push(pie);
    out.push('');
  }

  out.push('## 3. Round by round');
  out.push('');
  for (const round of rounds) {
    out.push(roundDetail(round, migration.round_notes.find((n) => n.round === round.round), ctx));
  }

  out.push('## 4. Source changes the upgrade forced');
  out.push('');
  out.push(codeChanges(migration));
  out.push('');

  out.push('## 5. Every file that changed');
  out.push('');
  out.push(everyFileChanged(migration, ctx.patchFiles));
  out.push('');
  const forecast = planComparison(slug, ctx.patchFiles);
  if (forecast) {
    out.push('### 5.1 Against the plan');
    out.push('');
    out.push(forecast);
    out.push('');
  }

  out.push('## 6. Does it still behave the same?');
  out.push('');
  out.push(behaviourSection(runtime, migration, rounds));

  out.push('## 7. Changes that were *not* caused by the upgrade');
  out.push('');
  if ((migration.out_of_scope_changes || []).length) {
    out.push('Made or noticed along the way, and listed separately so the migration record stays honest — none of them is required by the version jump, and each should be reviewed on its own merits.');
    out.push('');
    out.push('| Change | Why it is separate |', '|---|---|');
    for (const c of migration.out_of_scope_changes) out.push(`| ${esc(c.change)} | ${esc(c.why_separate)} |`);
  } else {
    out.push('_None — everything in the patch traces to the version jump._');
  }
  out.push('');

  out.push('## 8. Landing it in the project');
  out.push('');
  out.push('A migration is finished when the project itself is on the new version and green there — not');
  out.push('when the sandbox is. This is that step, and its result:');
  out.push('');
  out.push(appliedSection(applied, runtime, slug));
  out.push('');

  out.push('## 9. What still needs a human');
  out.push('');
  const reviewer = readRenderedPlan(slug);
  if (reviewer && reviewer.feedback) {
    out.push('**What the reviewer asked for when they approved this**');
    out.push('');
    out.push('Carried from the migration plan verbatim, so the migration can be read against what was actually agreed to.');
    out.push('');
    out.push(reviewer.feedback.split(/\r?\n/).map((l) => `> ${l}`).join('\n'));
    out.push('');
  }
  out.push('**Follow-ups**');
  out.push('');
  out.push(...bullets(migration.manual_follow_ups, '_none recorded_'));
  out.push('');
  out.push('**Residual risk**');
  out.push('');
  out.push(...bullets(migration.residual_risk, '_none recorded_'));
  out.push('');

  out.push('## 10. The patch');
  out.push('');
  out.push(`The whole migration is one cumulative patch against the project as it stood before round 0. Every round was built inside a sandbox copy; the project directory is written only by the apply step in section 8${applied ? ', which has run' : ', which has not run yet'}.`);
  out.push('');
  if (patchStat) {
    out.push('```text');
    out.push(patchStat);
    out.push('```');
    out.push('');
  }
  out.push(`Patch file: [\`migration_${slug}.diff\`](./migration_${slug}.diff)`);
  out.push('');
  const diffPath = sessionPaths(slug).reportDiff.split(path.sep).join('/');
  out.push('Applying it, from `.github/skills/04d-version-migration/`. This copies the migrated files');
  out.push('out of the sandbox, works whether or not the project is version-controlled, refuses unless');
  out.push('the final round was green, and builds the project afterwards to prove it landed:');
  out.push('');
  out.push('```powershell');
  out.push(`node scripts/apply-migration.js --slug ${slug}                # dry run: lists what would change`);
  out.push(`node scripts/apply-migration.js --slug ${slug} --to-project   # writes the project, then verifies it`);
  out.push(`node scripts/apply-migration.js --slug ${slug} --revert       # puts the project back`);
  out.push('```');
  out.push('');
  out.push('Or, if the project is a git repository and you would rather apply the patch itself:');
  out.push('');
  out.push('```powershell');
  out.push(`cd "${baseline.project.dir}"`);
  out.push(`git apply --check "${diffPath}"   # dry run first`);
  out.push(`git apply "${diffPath}"`);
  out.push('```');
  out.push('');

  out.push('---');
  out.push('');
  out.push('<details>');
  out.push('<summary>Where each fact in this report came from</summary>');
  out.push('');
  out.push('| Fact | Source | Produced by |', '|---|---|---|');
  out.push(`| Declared versions, dependency list, JDKs available | ${code(rel(sessionPaths(slug).baseline))} | \`detect-baseline.js\` |`);
  out.push(`| Sandbox and baseline commit | ${code(rel(sessionPaths(slug).workspaceMeta))} | \`prepare-workspace.js\` |`);
  out.push(`| Every round's outcome, errors and timings | ${code(`${rel(sessionPaths(slug).roundsDir)}/round-NN.json`)} | \`run-migration-build.js\` |`);
  out.push(`| Before/after runtime responses | ${code(`${rel(sessionPaths(slug).runtimeDir)}/{baseline,final,applied}.json`)} | \`probe-runtime.js\` |`);
  out.push(`| What was written into the project, and how it built there | ${code(rel(sessionPaths(slug).applied))} | \`apply-migration.js\` |`);
  out.push(`| Diagnoses, reasons, risks, follow-ups | ${code(rel(sessionPaths(slug).migration))} | the agent |`);
  out.push('');
  out.push(`Sandbox: ${code(meta ? rel(path.resolve(meta.workspace)) : 'not recorded')} · baseline commit ${code(meta ? meta.baseline_commit.slice(0, 10) : '—')}`);
  out.push('');
  out.push('</details>');
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

// docs/agent_output/04-remediation/README.md is shared with 04a-fix-strategist and 04b-fixer, and
// the migration block in it covers both the plan and the report for each migration. That block is
// therefore built in lib/plan.js rather than here, so whichever of the two renderers runs last
// regenerates exactly the same thing from the same scan of the folder.

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function renderOne(slug) {
  const paths = sessionPaths(slug);
  const baseline = readJson(paths.baseline);
  const migration = readJson(paths.migration);
  const meta = readJson(paths.workspaceMeta);
  if (!baseline) throw new Error(`No baseline.json for "${slug}" — run detect-baseline.js.`);
  if (!migration) throw new Error(`No migration.json for "${slug}" — write it per templates/migration.schema.json before rendering.`);
  const rounds = listRounds(slug).map((round) => {
    if (round.errors_truncated) return round;
    const errors = round.errors
      .filter((e) => !isLogNoise(e.message))
      .map((e) => ({ ...e, category: classifyMessage(`${e.message} ${(e.detail || []).join(' ')}`) }));
    return { ...round, errors, error_summary: summariseErrors(errors) };
  });
  if (!rounds.length) throw new Error(`No build rounds recorded for "${slug}" — run run-migration-build.js at least once.`);
  validate(migration, rounds);

  const runtime = {
    baseline: readJson(path.join(paths.runtimeDir, 'baseline.json')),
    final: readJson(path.join(paths.runtimeDir, 'final.json')),
    applied: readJson(path.join(paths.runtimeDir, 'applied.json')),
  };
  const applied = readJson(paths.applied);
  const finalRound = rounds[rounds.length - 1];
  const patch = exportDiff(paths, meta);
  const patchFiles = splitPatchByFile(patch.text);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = renderReport({
    slug, baseline, migration, rounds, runtime, finalRound, patchStat: patch.stat, patchFiles, meta, applied,
  });
  fs.writeFileSync(paths.reportMd, report);
  if (patch.text !== null) fs.writeFileSync(paths.reportDiff, patch.text);

  return {
    slug,
    report: rel(paths.reportMd),
    diff: patch.text !== null ? rel(paths.reportDiff) : null,
    outcome: finalRound.outcome,
    rounds: rounds.length,
    applied: applied ? applied.status : null,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const slugs = args.all
    ? listSessions().filter((s) => fs.existsSync(sessionPaths(s).migration))
    : (args.slug ? [args.slug] : []);
  if (!slugs.length) {
    // Still refresh the index: a report removed by hand should disappear from it.
    if (args.all) rewriteIndex();
    console.error(args.all
      ? 'No session has a migration.json yet — write the judgement file first.'
      : 'Pass --slug <slug> or --all.');
    process.exitCode = 1;
    return;
  }

  let failures = 0;
  for (const slug of slugs) {
    try {
      const result = renderOne(slug);
      const meta = outcomeOf(result.outcome);
      console.log(`${meta.emoji} ${slug} — ${meta.label} after ${result.rounds} round(s)`);
      console.log(`   report ${result.report}`);
      if (result.diff) console.log(`   patch  ${result.diff}`);
      console.log(`   project ${result.applied ? result.applied : 'not applied — the migration has not reached the project yet'}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${slug} — ${error.message}`);
    }
  }
  const readme = rewriteIndex();
  console.log(`\nIndex: ${rel(readme)}`);
  if (failures) process.exitCode = 1;
}

main();
