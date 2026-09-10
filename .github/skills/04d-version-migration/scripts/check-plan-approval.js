#!/usr/bin/env node
/**
 * Version Migration — the approval gate, on its own.
 *
 * Prints where a migration plan stands and what the reviewer wrote, and exits non-zero unless the
 * plan reads `Approved`. Every script that must not run before a human has said yes calls the same
 * check internally (`lib/plan.js`), so this exists for the agent and the user to ask the question
 * directly: *may this migration proceed, and if not, what is the reviewer waiting for?*
 *
 * Reads only. It can never change a status — that is the whole point of the checkpoint.
 *
 * Usage:
 *   node scripts/check-plan-approval.js --slug <slug>
 *   node scripts/check-plan-approval.js --all
 *   node scripts/check-plan-approval.js --slug <slug> --json
 */
const { listSessions, sessionPaths, rel } = require('./lib/migration');
const { readRenderedPlan, statusMeta, approvalGate } = require('./lib/plan');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slug' || a === '-s') args.slug = argv[++i];
    else if (a === '--all' || a === '-a') args.all = true;
    else if (a === '--json') args.json = true;
    else if (a === '--quiet' || a === '-q') args.quiet = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Version Migration — Plan approval check

  node scripts/check-plan-approval.js --slug <slug>
  node scripts/check-plan-approval.js --all

Options:
  --slug, -s   Check one session
  --all, -a    Check every session
  --json       Machine-readable output
  --quiet, -q  Exit code only, no output
  --help, -h   Show this message

Exit code 0 only when the plan reads Status: Approved. This script never changes a status.`);
}

function describe(slug) {
  const plan = readRenderedPlan(slug);
  const gate = approvalGate(slug);
  return { slug, plan, gate };
}

function report({ slug, plan, gate }) {
  if (!plan) {
    console.log(`\n⚪ ${slug} — no plan rendered`);
    console.log(`   ${gate.remedy.split('\n').join('\n   ')}`);
    return;
  }
  const meta = statusMeta(plan.status);
  console.log(`\n${meta.emoji} ${slug} — Status: ${plan.status} (revision ${plan.revision})`);
  console.log(`   ${rel(plan.file)}`);
  console.log(`   ${meta.note}`);
  if (plan.reviewer || plan.decided_on) {
    console.log(`   reviewer: ${plan.reviewer || 'unnamed'}${plan.decided_on ? ` · ${plan.decided_on}` : ''}`);
  }
  if (plan.feedback) {
    console.log('\n   Reviewer feedback — read this before doing anything else:');
    for (const line of plan.feedback.split(/\r?\n/)) console.log(`     ${line}`);
    if (!plan.approved) {
      console.log(`\n   Answer it by revising ${rel(sessionPaths(slug).plan)} and re-rendering the plan.`);
    }
  } else if (!plan.approved) {
    console.log('   No feedback written yet.');
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const slugs = args.all ? listSessions() : (args.slug ? [args.slug] : []);
  if (!slugs.length) {
    console.error('Pass --slug <slug> or --all.');
    process.exitCode = 1;
    return;
  }

  const results = slugs.map(describe);
  if (args.json) {
    console.log(JSON.stringify(results.map((r) => ({
      slug: r.slug,
      approved: Boolean(r.plan && r.plan.approved),
      status: r.plan ? r.plan.status : 'not written',
      revision: r.plan ? r.plan.revision : null,
      reviewer: r.plan ? r.plan.reviewer : null,
      decided_on: r.plan ? r.plan.decided_on : null,
      feedback: r.plan ? r.plan.feedback : null,
      file: r.plan ? rel(r.plan.file) : null,
    })), null, 2));
  } else if (!args.quiet) {
    for (const result of results) report(result);
    console.log('');
  }

  if (!results.every((r) => r.plan && r.plan.approved)) process.exitCode = 1;
}

main();
