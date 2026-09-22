#!/usr/bin/env node
/**
 * Every story and its current plan status.
 *
 *   node scripts/list-workload.js
 */
const { listStories, currentPlanStatus } = require('./lib/analysis');

function pad(s, n) {
  const v = String(s === null || s === undefined ? '' : s);
  return v.length > n ? `${v.slice(0, n - 1)}…` : v.padEnd(n);
}

function main() {
  const stories = listStories();
  if (!stories.length) { console.log('No stories in the register.'); return; }

  console.log(`${pad('STORY', 11)}${pad('PLAN STATUS', 16)}TITLE`);
  console.log(`${'-'.repeat(10)} ${'-'.repeat(15)} ${'-'.repeat(50)}`);
  for (const s of stories) {
    const status = currentPlanStatus(s.id) || 'no plan yet';
    console.log(`${pad(s.id, 11)}${pad(status, 16)}${pad(s.title, 50)}`);
  }
}

main();
