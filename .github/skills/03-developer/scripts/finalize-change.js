#!/usr/bin/env node
/**
 * Captures the real diff from the worktree the agent just edited, compiles it, writes the
 * deterministic result, and removes the worktree. This script decides Compiled vs. Compile
 * Failed — never the agent.
 *
 *   node scripts/finalize-change.js --story JIRA-001 [--keep]
 */
const fs = require('fs');
const path = require('path');
const {
  WORK_DIR, OUT_DIR, rel, resolvePlan, run, runMaven, removeWorktreeIfPresent, worktreeDirFor,
  tail, resultPathFor, diffPathFor,
} = require('./lib/developer');

function parseArgs(argv) {
  const args = { keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' || a === '-s') args.story = argv[++i];
    else if (a === '--keep') args.keep = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log('Finalize an implemented story: diff + compile + cleanup.\n\n  node scripts/finalize-change.js --story <ID> [--keep]');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  const plan = resolvePlan(args.story);
  const worktreeDir = worktreeDirFor(plan.id);

  if (!fs.existsSync(worktreeDir)) {
    throw new Error(`No worktree at ${worktreeDir}. Run create-worktree.js --story ${plan.id} and edit the code there first.`);
  }

  const record = { generatedAt: new Date().toISOString(), id: plan.id, worktree: rel(worktreeDir) };

  try {
    const diff = run('git', ['diff', '--no-color', 'HEAD'], { cwd: worktreeDir });
    const diffText = diff.stdout || '';
    record.hasChanges = diffText.trim().length > 0;

    if (!record.hasChanges) {
      record.compiled = false;
      record.stage = 'no-changes';
      record.output = 'git diff produced no changes — nothing was edited in the worktree.';
    } else {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(diffPathFor(plan.id), diffText);
      record.diffFile = rel(diffPathFor(plan.id));
      record.changedFiles = [...diffText.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);

      const compile = runMaven(['-q', 'compile'], { cwd: worktreeDir });
      const testCompile = compile.status === 0 ? runMaven(['-q', 'test-compile'], { cwd: worktreeDir }) : null;

      record.steps = [
        { command: 'mvn -q compile', exitCode: compile.status, output: tail(compile.stdout + compile.stderr + (compile.error ? `\n[spawn error] ${compile.error}` : '')) },
      ];
      if (testCompile) {
        record.steps.push({ command: 'mvn -q test-compile', exitCode: testCompile.status, output: tail(testCompile.stdout + testCompile.stderr) });
      }

      record.compiled = compile.status === 0 && (!testCompile || testCompile.status === 0);
      record.stage = 'complete';
    }
  } finally {
    if (!args.keep) removeWorktreeIfPresent(worktreeDir);
    else record.kept = rel(worktreeDir);
  }

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(resultPathFor(plan.id), JSON.stringify(record, null, 2));

  console.log(`${plan.id} — ${record.hasChanges ? (record.compiled ? 'COMPILED' : 'COMPILE FAILED') : 'NO CHANGES'} (${record.stage})`);
  if (record.diffFile) console.log(`  diff: ${record.diffFile}`);
  if (record.kept) console.log(`  worktree kept at ${record.kept}`);
  console.log('\nNext: write .dev-notes.json, then node scripts/render-dev-report.js');
  if (!record.compiled) process.exitCode = 1;
}

try { main(); } catch (err) { console.error('Finalize failed:', err.message); process.exit(1); }
