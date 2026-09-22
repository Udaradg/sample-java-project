#!/usr/bin/env node
/**
 * Merge Arbiter — Workload Listing
 *
 * A change is ready for arbitration once all five upstream reports exist: acceptance-check,
 * edge-case review, behavior guard, QA and build.
 *
 * Usage:
 *   node scripts/list-merge-workload.js
 */
const fs = require('fs');
const {
  CHANGES_DIR, rel, listStep3Changes, readUpstream, scorePathFor, arbitrationPathFor, verdictPathFor,
} = require('./lib/arbiter');

function stateOf(change) {
  const upstream = readUpstream(change.id);
  const missing = Object.entries(upstream).filter(([, v]) => !v.present).map(([k]) => k);
  const score = fs.existsSync(scorePathFor(change.id));
  const arbitration = fs.existsSync(arbitrationPathFor(change.id));
  const verdict = fs.existsSync(verdictPathFor(change.id));

  let stage = 'not started';
  if (missing.length) stage = `waiting on: ${missing.join(', ')}`;
  else if (verdict) stage = 'verdict rendered';
  else if (arbitration) stage = 'arbitration written — render pending';
  else if (score) stage = 'score computed — arbitration pending';
  else stage = 'ready — score pending';

  return { upstream, missing, stage };
}

function main() {
  const asJson = process.argv.includes('--json');
  const items = listStep3Changes().map((c) => ({ ...c, ...stateOf(c) }));

  if (asJson) { console.log(JSON.stringify(items, null, 2)); return; }
  if (!items.length) { console.log(`No drafted changes (Compiled or Compile Failed) found in ${rel(CHANGES_DIR)}.`); return; }

  const rows = items.map((c) => [c.id, c.stage, c.title]);
  const headers = ['STORY', 'PIPELINE STATE', 'TITLE'];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd();

  console.log(`Merge workload: ${rel(CHANGES_DIR)} (${items.length} change(s))\n`);
  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(line(r)));
  console.log('\nNext: node scripts/compute-score.js --story <ID>   (only once all five upstream reports exist)');
}

try { main(); } catch (err) { console.error('Listing failed:', err.message); process.exit(1); }
