#!/usr/bin/env node
/**
 * Creates the throwaway git worktree for one Approved plan and prints its path.
 * Refuses outright if the plan's Status is anything other than exactly Approved.
 *
 *   node scripts/create-worktree.js --story JIRA-001
 */
const fs = require('fs');
const path = require('path');
const {
  WORKTREES_DIR, rel, resolvePlan, run, removeWorktreeIfPresent, worktreeDirFor,
} = require('./lib/developer');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' || a === '-s') args.story = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log('Create the throwaway worktree for an Approved plan.\n\n  node scripts/create-worktree.js --story <ID>');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  const plan = resolvePlan(args.story);

  if (plan.status !== 'Approved') {
    console.error(`${plan.id} — REFUSED: plan Status is "${plan.status}", not "Approved". A human must approve ${rel(plan.planFile)} before implementation can start.`);
    process.exitCode = 1;
    return;
  }

  const worktreeDir = worktreeDirFor(plan.id);
  fs.mkdirSync(WORKTREES_DIR, { recursive: true });
  removeWorktreeIfPresent(worktreeDir);

  const add = run('git', ['worktree', 'add', '--detach', worktreeDir, 'HEAD']);
  if (add.status !== 0) {
    console.error(`Failed to create worktree: ${add.stderr || add.stdout}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${plan.id} — worktree ready at: ${worktreeDir}`);
  console.log('Edit source files inside that path (not the real repository), then run:');
  console.log(`  node scripts/finalize-change.js --story ${plan.id}`);
}

try { main(); } catch (err) { console.error('Worktree creation failed:', err.message); process.exit(1); }
