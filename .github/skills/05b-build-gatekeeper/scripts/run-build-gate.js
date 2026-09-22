#!/usr/bin/env node
/**
 * Build Gatekeeper — Deterministic Build + Dependency Gate
 *
 * Everything in this script is mechanical: apply the change's diff inside a throwaway git
 * worktree, run `mvn verify` (stronger than the Developer's own `compile`/`test-compile`
 * pre-gate), and diff `mvn dependency:tree` output captured before and after the change to flag
 * any dependency version change the plan didn't call for. No agent writes a judgment file
 * anywhere in this skill — render-build-report.js turns this script's own JSON straight into the
 * report.
 *
 * Usage:
 *   node scripts/run-build-gate.js --story JIRA-001 [--keep]
 *   node scripts/run-build-gate.js --all [--keep]
 */
const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT, WORK_DIR, WORKTREES_DIR,
  rel, resolveChange, listStep2Changes, run, runMaven, removeWorktreeIfPresent,
  diffDependencyTrees, tail, resultPathFor,
} = require('./lib/gate');

function parseArgs(argv) {
  const args = { keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' || a === '-s') args.story = argv[++i];
    else if (a === '--all' || a === '-a') args.all = true;
    else if (a === '--keep') args.keep = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Build Gatekeeper — Deterministic Build + Dependency Gate

  node scripts/run-build-gate.js --story <ID> [--keep]
  node scripts/run-build-gate.js --all [--keep]

Runs against any change with a captured diff (Compiled or Compile Failed) — this gate compiles the
project itself, independently of the Developer's own compile check. Refuses only a "Refused"
change.`);
}

function runOne(change, args) {
  if (change.status === 'Refused') {
    return { id: change.id, refused: true, reason: 'Development report Status is "Refused" — the Developer never captured a diff to build.' };
  }
  const diffAbs = path.join(REPO_ROOT, change.diffFile || '');
  if (!change.diffFile || !fs.existsSync(diffAbs)) throw new Error(`Change diff not found (looked for ${change.diffFile || 'none'}).`);

  const worktreeDir = path.join(WORKTREES_DIR, change.id);
  const record = { generatedAt: new Date().toISOString(), id: change.id, worktree: rel(worktreeDir) };

  fs.mkdirSync(WORKTREES_DIR, { recursive: true });
  removeWorktreeIfPresent(worktreeDir);

  try {
    const add = run('git', ['worktree', 'add', '--detach', worktreeDir, 'HEAD']);
    if (add.status !== 0) { record.passed = false; record.stage = 'worktree-create'; record.output = tail(add.stdout + add.stderr); return record; }

    // Baseline dependency tree, before the change is applied.
    const treeBefore = runMaven(['-q', 'dependency:tree'], { cwd: worktreeDir });
    const baselineTree = treeBefore.stdout;

    const check = run('git', ['apply', '--check', diffAbs], { cwd: worktreeDir });
    if (check.status !== 0) { record.passed = false; record.stage = 'patch-apply-check'; record.output = tail(check.stdout + check.stderr); return record; }
    const apply = run('git', ['apply', diffAbs], { cwd: worktreeDir });
    if (apply.status !== 0) { record.passed = false; record.stage = 'patch-apply'; record.output = tail(apply.stdout + apply.stderr); return record; }

    const verify = runMaven(['-q', 'verify'], { cwd: worktreeDir });
    record.steps = [{
      command: 'mvn verify', exitCode: verify.status,
      output: tail(verify.stdout + verify.stderr + (verify.error ? `\n[spawn error] ${verify.error}` : '')),
    }];

    const treeAfter = runMaven(['-q', 'dependency:tree'], { cwd: worktreeDir });
    record.dependencyCheck = diffDependencyTrees(baselineTree, treeAfter.stdout);

    record.passed = verify.status === 0;
    record.stage = 'complete';
    return record;
  } finally {
    if (!args.keep) removeWorktreeIfPresent(worktreeDir);
    else record.kept = rel(worktreeDir);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  let targets;
  if (args.all) {
    targets = listStep2Changes();
    if (!targets.length) { console.log('No changes with a captured diff found. Nothing to build.'); return; }
    console.log(`Build Gatekeeper — running ${targets.length} gate(s): ${targets.map((t) => t.id).join(', ')}`);
  } else {
    if (!args.story) throw new Error('Missing --story or --all.');
    targets = [resolveChange(args.story)];
  }

  const failed = [];
  for (const change of targets) {
    const record = runOne(change, args);
    fs.mkdirSync(WORK_DIR, { recursive: true });
    fs.writeFileSync(resultPathFor(change.id), JSON.stringify(record, null, 2));
    if (record.refused) {
      console.log(`\n${record.id} — REFUSED: ${record.reason}`);
    } else {
      console.log(`\n${record.id} — ${record.passed ? 'PASS' : 'FAIL'} (${record.stage})`);
      const dep = record.dependencyCheck;
      if (dep && (dep.added.length || dep.removed.length)) console.log('  dependency changes detected');
      if (record.kept) console.log(`  worktree kept at ${record.kept}`);
    }
    if (record.refused || !record.passed) failed.push(record.id);
  }
  console.log(`\nNext: node scripts/render-build-report.js --all`);
  if (failed.length) process.exitCode = 1;
}

try { main(); } catch (err) { console.error('Build gate failed:', err.message); process.exit(1); }
