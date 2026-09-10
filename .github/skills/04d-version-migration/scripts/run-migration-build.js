#!/usr/bin/env node
/**
 * Version Migration — Step 3 (repeated): one build round.
 *
 * Builds the sandbox workspace on a chosen JDK, then turns the log into facts: an outcome,
 * every compiler/resolver error with its file and line, a category for each error, and what
 * the workspace declares and has changed at that moment. One JSON record per round, so the
 * final report can show the migration as the sequence of rounds it actually was.
 *
 * Round 0 (--baseline) is gated: it must run the test suite and it must pass. Everything the
 * migration later claims is a comparison against that round, and a comparison against a broken
 * starting point proves nothing — so a red baseline ends the run instead of being carried forward.
 *
 * Every round after round 0 is gated the other way: it refuses unless a human has approved the
 * migration plan for this session. Round 0 measures the project as it stands and needs no
 * permission; from round 1 on the versions have been changed, and that is a decision somebody
 * has to have made deliberately.
 *
 * The category assigned to an error describes the *shape* of the breakage (a package that no
 * longer exists, a signature that changed, an artifact that cannot be resolved). It never
 * says which library caused it and never proposes a fix — that judgement comes from the
 * agent reading the reference pack.
 *
 * Usage:
 *   node scripts/run-migration-build.js --slug <slug> --baseline --jdk 17
 *   node scripts/run-migration-build.js --slug <slug> --jdk 21 --intent test-compile --label "swapped starters"
 *   node scripts/run-migration-build.js --slug <slug> --jdk 21 --intent package
 */
const fs = require('fs');
const path = require('path');
const {
  sessionPaths, readJson, writeJson, rel, runTool, run, tail,
  resolveJdk, envForJdk, resolveBuildTool, buildArgs, TEST_INTENTS,
  inventoryProject, parseBuildErrors, summariseErrors, buildOutcome, nextRoundNumber, stripRootFromText,
} = require('./lib/migration');
const { approvalGate, refuse } = require('./lib/plan');

const INTENTS = ['compile', 'test-compile', 'test', 'package', 'verify', 'package-skip-tests'];
const MAX_RECORDED_ERRORS = 200;

function parseArgs(argv) {
  const args = { intent: 'package' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slug' || a === '-s') args.slug = argv[++i];
    else if (a === '--jdk' || a === '-j') args.jdk = argv[++i];
    else if (a === '--intent' || a === '-i') args.intent = argv[++i];
    else if (a === '--label' || a === '-l') args.label = argv[++i];
    else if (a === '--round') args.round = Number(argv[++i]);
    else if (a === '--baseline' || a === '-b') args.baseline = true;
    else if (a === '--timeout') args.timeout = Number(argv[++i]) * 1000;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Version Migration — Build round

  node scripts/run-migration-build.js --slug <slug> --jdk <major> [--intent <intent>] [--label "<what changed>"]

Options:
  --slug, -s      Session name
  --jdk, -j       JDK major version to build on, e.g. 17 or 21
  --intent, -i    ${INTENTS.join(' | ')}   (default: package)
  --label, -l     One line describing what was changed before this round — shown in the report
  --baseline, -b  Record this as round 0, the pre-migration reference build. Must use a goal
                  that runs the tests, and must come back green — a red baseline stops the run
  --round         Force a round number (rarely needed; rounds auto-increment)
  --timeout       Seconds before the build is abandoned (default 900)
  --help, -h      Show this message`);
}

function workspaceState(workspace, baselineCommit) {
  const git = (...a) => run('git', ['-C', workspace, ...a]);
  git('add', '-A');
  const status = git('diff', '--cached', '--name-status', baselineCommit).stdout.trim();
  const stat = git('diff', '--cached', '--shortstat', baselineCommit).stdout.trim();
  const files = status
    ? status.split(/\r?\n/).map((line) => {
      const [state, ...rest] = line.split(/\t/);
      return { state, file: rest.join(' -> ').split(path.sep).join('/') };
    })
    : [];
  return { changed_files: files, diff_stat: stat || 'no changes yet' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  if (!args.slug) {
    console.error('--slug is required.');
    process.exitCode = 1;
    return;
  }
  if (!INTENTS.includes(args.intent)) {
    console.error(`Unknown --intent "${args.intent}". One of: ${INTENTS.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  // Round 0 is the reference the whole migration is judged against, so it has to be a goal that
  // compiles everything and runs every test. Anything cheaper produces a baseline that cannot be
  // compared with a later round and cannot show a green starting point.
  if (args.baseline && !TEST_INTENTS.includes(args.intent)) {
    console.error(`Round 0 must run the test suite — --intent "${args.intent}" does not.`);
    console.error(`  Use one of: ${TEST_INTENTS.join(', ')}  (default: package).`);
    process.exitCode = 1;
    return;
  }

  const paths = sessionPaths(args.slug);
  const baseline = readJson(paths.baseline);
  const meta = readJson(paths.workspaceMeta);
  if (!baseline || !meta) {
    console.error(`Session "${args.slug}" is not set up — run detect-baseline.js then prepare-workspace.js.`);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(paths.workspace)) {
    console.error(`Workspace missing at ${rel(paths.workspace)} — run prepare-workspace.js.`);
    process.exitCode = 1;
    return;
  }

  // The approval gate. Round 0 is exempt and must be: it is the measurement of the project as it
  // stands today, it changes nothing, and its result is one of the things the reviewer is shown
  // when they decide. Every round after it builds a project whose versions have been changed, so
  // from round 1 on there must be a plan a human has approved.
  if (!args.baseline) {
    const gate = approvalGate(args.slug);
    if (!gate.ok) {
      refuse(gate, `run round ${nextRoundNumber(args.slug)} of "${args.slug}"`);
      console.error('  Round 0 needs no approval — it measures the project as it is. Everything after it');
      console.error('  changes a version, and that is the reviewer\'s decision to make.');
      console.error('');
      process.exitCode = 1;
      return;
    }
  }

  const jdkMajor = args.jdk || baseline.language.declared;
  const jdk = resolveJdk(jdkMajor);
  if (!jdk) {
    console.error(`No JDK ${jdkMajor} found on this machine.`);
    console.error(`  Install it, or point MIGRATION_JDK_${jdkMajor} at an existing install.`);
    console.error(`  Detected: ${(baseline.toolchain.installed_jdks || []).map((j) => j.major).join(', ') || 'none'}`);
    process.exitCode = 1;
    return;
  }

  const tool = resolveBuildTool(paths.workspace);
  if (!tool.command) {
    console.error(`No ${tool.tool} build tool found for the workspace.`);
    console.error('  Install it, or set MIGRATION_MVN to an absolute path.');
    process.exitCode = 1;
    return;
  }

  const round = args.baseline ? 0 : (args.round !== undefined ? args.round : nextRoundNumber(args.slug));
  const mvnArgs = buildArgs(tool.tool, args.intent);
  const started = Date.now();
  console.log(`\nRound ${round} — ${tool.tool} ${mvnArgs.join(' ')} on JDK ${jdk.major} (${jdk.version})`);
  console.log(`  workspace ${rel(paths.workspace)}`);
  if (args.label) console.log(`  change    ${args.label}`);
  console.log('  building…');

  const result = runTool(tool.command, mvnArgs, {
    cwd: paths.workspace,
    env: envForJdk(jdk, { MAVEN_OPTS: process.env.MAVEN_OPTS || '' }),
    timeout: args.timeout || 900000,
  });
  const durationMs = Date.now() - started;
  const log = `${result.stdout}\n${result.stderr}`;
  const errors = parseBuildErrors(log, paths.workspace);
  const summary = summariseErrors(errors);
  const outcome = result.error && /ETIMEDOUT|timed out/i.test(result.error)
    ? 'timed-out'
    : buildOutcome(result, errors);

  const declared = inventoryProject(paths.workspace);
  const state = workspaceState(paths.workspace, meta.baseline_commit);

  const isBaseline = Boolean(args.baseline) || round === 0;
  const record = {
    round,
    label: args.label || (round === 0 ? 'Pre-migration reference build' : null),
    baseline: isBaseline,
    gate: isBaseline
      ? { name: 'baseline-build-green', required: true, met: outcome === 'passed', intent: args.intent }
      : null,
    started_at: new Date(started).toISOString(),
    duration_ms: durationMs,
    jdk: { major: jdk.major, version: jdk.version, home: jdk.home, source: jdk.source },
    build: {
      tool: tool.tool,
      kind: tool.kind,
      command: `${tool.display || tool.command} ${mvnArgs.join(' ')}`,
      intent: args.intent,
      exit_code: result.status,
      spawn_error: result.error,
    },
    outcome,
    declared: {
      java: declared.javaVersion,
      parent: declared.parent,
      dependency_count: (declared.dependencies || []).length,
    },
    workspace: state,
    error_summary: summary,
    errors: errors.slice(0, MAX_RECORDED_ERRORS),
    errors_truncated: Math.max(0, errors.length - MAX_RECORDED_ERRORS),
    log_tail: tail(stripRootFromText(log, paths.workspace), 8000),
  };

  const file = writeJson(path.join(paths.roundsDir, `round-${String(round).padStart(2, '0')}.json`), record);
  fs.writeFileSync(path.join(paths.roundsDir, `round-${String(round).padStart(2, '0')}.log`), log);

  const mark = outcome === 'passed' ? 'PASSED' : outcome.toUpperCase();
  console.log(`\n  Outcome     ${mark}  (exit ${result.status}, ${(durationMs / 1000).toFixed(1)}s)`);
  console.log(`  Declared    Java ${declared.javaVersion || '?'}${declared.parent ? ` · ${declared.parent.artifactId} ${declared.parent.version}` : ''}`);
  console.log(`  Workspace   ${state.diff_stat}`);
  if (summary.total) {
    console.log(`\n  ${summary.total} error line(s) by category:`);
    for (const c of summary.byCategory) {
      console.log(`    ${String(c.count).padStart(4)}  ${c.label}`);
      console.log(`          ${c.hint}`);
    }
    if (summary.byFile.length) {
      console.log(`\n  Files with the most errors:`);
      for (const f of summary.byFile.slice(0, 10)) console.log(`    ${String(f.count).padStart(4)}  ${f.file}`);
    }
    console.log(`\n  Distinct messages (first 12):`);
    const distinct = [...new Set(errors.map((e) => e.message))].slice(0, 12);
    for (const m of distinct) console.log(`    - ${m.length > 150 ? `${m.slice(0, 150)}…` : m}`);
  }
  console.log(`\n  Round record ${rel(file)}`);
  console.log(`  Full log     ${rel(file).replace(/\.json$/, '.log')}`);
  if (isBaseline && outcome !== 'passed') {
    // The baseline gate. A migration measures itself against round 0, so round 0 has to be a
    // state worth measuring against: everything compiles and every test passes. A red baseline
    // makes every later failure ambiguous — nobody can tell the migration's damage from what was
    // already broken — so the run stops here rather than carrying the ambiguity forward.
    console.error(`  BASELINE GATE FAILED — round 0 ended "${outcome}", not "passed".`);
    console.error('');
    console.error('  The migration does not start from a red baseline. Get the project green on its');
    console.error(`  current JDK ${jdk.major} first — build, tests and all — then re-run round 0:`);
    console.error('');
    console.error('    - a test that fails on the environment (no Docker daemon, a missing service)');
    console.error('      is fixed by providing the environment or by making the test skip itself');
    console.error('      cleanly, not by lowering the goal;');
    console.error('    - a test that fails on the code is a pre-existing defect and belongs to a');
    console.error('      separate change, made and merged before the migration begins.');
    console.error('');
    console.error('  Fix it in the project, then re-run prepare-workspace.js and this round so the');
    console.error('  sandbox and the baseline both reflect the green starting point.');
    console.error('');
    process.exitCode = 1;
    return;
  }
  if (outcome === 'passed') {
    console.log(isBaseline
      ? `\n  Baseline is green on JDK ${jdk.major} — build and tests. Next: probe the runtime on the same JDK.`
      : `\n  Build is green on JDK ${jdk.major}. Next: probe the runtime, then render the report.`);
  } else {
    console.log(`\n  Read the errors above against the reference pack, edit the sandbox, then run the next round.`);
  }
  console.log('');
}

main();
