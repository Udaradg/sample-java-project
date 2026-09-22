#!/usr/bin/env node
/**
 * QA Runner — Workload Listing
 *
 * Usage:
 *   node scripts/list-qa-workload.js
 *   node scripts/list-qa-workload.js --json
 */
const fs = require('fs');
const {
  CHANGES_DIR, rel, listStep2Changes, testPlanPathFor, testDiffPathFor, resultPathFor, reportPathFor,
} = require('./lib/qa');

function stateOf(change) {
  const plan = fs.existsSync(testPlanPathFor(change.id));
  const diff = fs.existsSync(testDiffPathFor(change.id));
  const result = fs.existsSync(resultPathFor(change.id));
  const report = fs.existsSync(reportPathFor(change.id));
  if (report) return 'report written';
  if (result) return 'gate run — render pending';
  if (plan && diff) return 'test drafted — gate pending';
  if (plan || diff) return 'partially drafted';
  return 'not started';
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const items = listStep2Changes().map((c) => ({ ...c, stage: stateOf(c) }));

  if (asJson) { console.log(JSON.stringify(items, null, 2)); return; }
  if (!items.length) { console.log(`No changes with a captured diff found in ${rel(CHANGES_DIR)}. Run the Developer agent first.`); return; }

  const rows = items.map((c) => [c.id, c.status, c.stage, c.title]);
  const headers = ['STORY', 'DEV STATUS', 'QA STATE', 'TITLE'];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd();

  console.log(`QA workload: ${rel(CHANGES_DIR)} (${items.length} change(s))\n`);
  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(line(r)));
  console.log('\nNext (per story): write <id>.test-plan.json + <id>.new-test.diff, then node scripts/run-qa-gate.js --story <ID>');
}

try { main(); } catch (err) { console.error('Listing failed:', err.message); process.exit(1); }
