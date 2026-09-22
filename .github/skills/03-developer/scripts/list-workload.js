#!/usr/bin/env node
/**
 * Every plan and its current development status.
 *
 *   node scripts/list-workload.js
 */
const { listPlans, currentDevStatus } = require('./lib/developer');

function pad(s, n) {
  const v = String(s === null || s === undefined ? '' : s);
  return v.length > n ? `${v.slice(0, n - 1)}…` : v.padEnd(n);
}

function main() {
  const plans = listPlans();
  if (!plans.length) { console.log('No plans found. Run 02_story-analyst first.'); return; }

  console.log(`${pad('STORY', 11)}${pad('PLAN STATUS', 12)}${pad('DEV STATUS', 16)}TITLE`);
  console.log(`${'-'.repeat(10)} ${'-'.repeat(11)} ${'-'.repeat(15)} ${'-'.repeat(50)}`);
  for (const p of plans) {
    const dev = currentDevStatus(p.id) || (p.status === 'Approved' ? 'not started' : 'awaiting approval');
    console.log(`${pad(p.id, 11)}${pad(p.status, 12)}${pad(dev, 16)}${pad(p.title, 50)}`);
  }
}

main();
