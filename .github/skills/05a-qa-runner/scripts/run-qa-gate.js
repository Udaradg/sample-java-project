#!/usr/bin/env node
/**
 * QA Runner — Deterministic Test Gate
 *
 * The agentic part of this skill stops at drafting a test (see SKILL.md). This script is the
 * deterministic part: it applies the change's own diff AND the agent's new-test diff together
 * inside a throwaway git worktree, runs the new test (and, if named, one existing test scoped to
 * the change), and records the real exit code. Nothing here is open to interpretation — a FAIL is
 * a FAIL, a test needing a live dependency this sandbox doesn't have is SKIPPED, never silently
 * passed. The agent that reads this result does not get to override it.
 *
 * Usage:
 *   node scripts/run-qa-gate.js --story JIRA-001 [--existing-test SomeExistingTestClass] [--keep]
 *   node scripts/run-qa-gate.js --all [--keep]   # every change with a drafted test ready
 */
const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT, WORK_DIR, WORKTREES_DIR,
  rel, resolveChange, listStep2Changes, run, runMaven, removeWorktreeIfPresent,
  changedFilesFromPatch, tail,
  testPlanPathFor, testDiffPathFor, resultPathFor,
} = require('./lib/qa');

const LIVE_DEPENDENCY_MARKERS = ['@DataJpaTest', '@SpringBootTest', '@Testcontainers', '@AutoConfigureMockMvc'];

function parseArgs(argv) {
  const args = { keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' || a === '-s') args.story = argv[++i];
    else if (a === '--all' || a === '-a') args.all = true;
    else if (a === '--existing-test' || a === '-e') args.existingTest = argv[++i];
    else if (a === '--keep') args.keep = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`QA Runner — Deterministic Test Gate

  node scripts/run-qa-gate.js --story <ID> [--existing-test <ClassName>] [--keep]
  node scripts/run-qa-gate.js --all [--keep]

Requires .github/.pipeline-context/qa/<id>.test-plan.json and <id>.new-test.diff to already exist
(the agent's job). Runs against any change with a captured diff (Compiled or Compile Failed) —
this gate compiles independently of the Developer's own compile check. Refuses only a "Refused"
change.`);
}

function findTestFileInWorktree(worktreeDir, className) {
  const testRoot = path.join(worktreeDir, 'src', 'test', 'java');
  if (!fs.existsSync(testRoot)) return null;
  const stack = [testRoot];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === `${className}.java`) return full;
    }
  }
  return null;
}

function runOne(change, args) {
  if (change.status === 'Refused') {
    return { id: change.id, refused: true, reason: 'Development report Status is "Refused" — the Developer never captured a diff to gate.' };
  }
  const planFile = testPlanPathFor(change.id);
  const testDiffFile = testDiffPathFor(change.id);
  if (!fs.existsSync(planFile) || !fs.existsSync(testDiffFile)) {
    throw new Error(`Missing ${rel(planFile)} and/or ${rel(testDiffFile)}. Draft the regression test and its plan first (the agent's job), then re-run.`);
  }
  const testPlan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const className = path.basename(testPlan.test_file || '', '.java');
  if (!className) throw new Error(`${rel(planFile)} has no usable "test_file" field.`);

  const changeDiffAbs = path.join(REPO_ROOT, change.diffFile || '');
  if (!change.diffFile || !fs.existsSync(changeDiffAbs)) throw new Error(`Change diff not found (looked for ${change.diffFile || 'none'}).`);

  const worktreeDir = path.join(WORKTREES_DIR, change.id);
  const record = { generatedAt: new Date().toISOString(), id: change.id, testFile: testPlan.test_file, className, worktree: rel(worktreeDir) };

  fs.mkdirSync(WORKTREES_DIR, { recursive: true });
  removeWorktreeIfPresent(worktreeDir);

  try {
    const add = run('git', ['worktree', 'add', '--detach', worktreeDir, 'HEAD']);
    if (add.status !== 0) { record.passed = false; record.stage = 'worktree-create'; record.output = tail(add.stdout + add.stderr); return record; }

    for (const [label, patchAbs] of [['change', changeDiffAbs], ['test', path.resolve(testDiffFile)]]) {
      const check = run('git', ['apply', '--check', patchAbs], { cwd: worktreeDir });
      if (check.status !== 0) { record.passed = false; record.stage = `${label}-apply-check`; record.output = tail(check.stdout + check.stderr); return record; }
      const apply = run('git', ['apply', patchAbs], { cwd: worktreeDir });
      if (apply.status !== 0) { record.passed = false; record.stage = `${label}-apply`; record.output = tail(apply.stdout + apply.stderr); return record; }
    }

    const changeText = fs.readFileSync(changeDiffAbs, 'utf8');
    const testText = fs.readFileSync(testDiffFile, 'utf8');
    record.changedFiles = [...new Set([...changedFilesFromPatch(changeText), ...changedFilesFromPatch(testText)])];

    record.steps = [];
    let allDecided = true; // false only on a real FAIL; SKIPPED does not fail the gate
    const newTest = runMaven(['-q', 'test', `-Dtest=${className}`], { cwd: worktreeDir });
    record.steps.push({
      test: className, status: newTest.status === 0 ? 'PASS' : 'FAIL', exitCode: newTest.status,
      output: tail(newTest.stdout + newTest.stderr + (newTest.error ? `\n[spawn error] ${newTest.error}` : '')),
    });
    if (newTest.status !== 0) allDecided = false;

    if (args.existingTest) {
      const existingFile = findTestFileInWorktree(worktreeDir, args.existingTest);
      if (!existingFile) {
        record.steps.push({ test: args.existingTest, status: 'SKIPPED', exitCode: null, output: 'Test class not found in this repo.' });
      } else {
        const source = fs.readFileSync(existingFile, 'utf8');
        const marker = LIVE_DEPENDENCY_MARKERS.find((m) => source.includes(m));
        if (marker) {
          record.steps.push({ test: args.existingTest, status: 'SKIPPED', exitCode: null, output: `Uses ${marker}, which needs infrastructure unavailable in this isolated sandbox. Not run — reported SKIPPED, not a fabricated pass.` });
        } else {
          const existing = runMaven(['-q', 'test', `-Dtest=${args.existingTest}`], { cwd: worktreeDir });
          record.steps.push({
            test: args.existingTest, status: existing.status === 0 ? 'PASS' : 'FAIL', exitCode: existing.status,
            output: tail(existing.stdout + existing.stderr),
          });
          if (existing.status !== 0) allDecided = false;
        }
      }
    }

    record.passed = allDecided;
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
    targets = listStep2Changes().filter((c) => fs.existsSync(testPlanPathFor(c.id)) && fs.existsSync(testDiffPathFor(c.id)));
    if (!targets.length) { console.log('No changes with a drafted test ready. Nothing to run.'); return; }
    console.log(`QA Runner — running ${targets.length} gate(s): ${targets.map((t) => t.id).join(', ')}`);
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
      (record.steps || []).forEach((s) => console.log(`  ${s.test.padEnd(30)} ${s.status}`));
      if (record.kept) console.log(`  worktree kept at ${record.kept}`);
    }
    if (record.refused || !record.passed) failed.push(record.id);
  }
  console.log(`\nNext: node scripts/render-qa-report.js --all`);
  if (failed.length) process.exitCode = 1;
}

try { main(); } catch (err) { console.error('QA gate failed:', err.message); process.exit(1); }
