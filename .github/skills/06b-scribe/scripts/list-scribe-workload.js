#!/usr/bin/env node
/**
 * Scribe — Workload Listing
 *
 * Workload = every change with a rendered merge-arbiter verdict (docs/agent_output/06-ship/verdict_<id>.md),
 * regardless of Cleared/Blocked — the Scribe always writes both output files either way.
 *
 * Usage:
 *   node scripts/list-scribe-workload.js
 */
const fs = require('fs');
const {
  SHIP_DIR, rel, listArbitratedChanges, contentPathFor, prPathFor, auditPathFor,
} = require('./lib/scribe');

function stateOf(change) {
  const content = fs.existsSync(contentPathFor(change.id));
  const pr = fs.existsSync(prPathFor(change.id));
  const audit = fs.existsSync(auditPathFor(change.id));
  if (pr && audit) return 'pr + audit written';
  if (content) return 'content written — render pending';
  return 'not started';
}

function main() {
  const asJson = process.argv.includes('--json');
  const items = listArbitratedChanges().map((c) => ({ ...c, stage: stateOf(c) }));

  if (asJson) { console.log(JSON.stringify(items, null, 2)); return; }
  if (!items.length) { console.log(`No ship verdicts found in ${rel(SHIP_DIR)}. Run the merge-arbiter agent first.`); return; }

  const rows = items.map((c) => [c.id, c.decision || '-', c.score || '-', c.stage, c.title]);
  const headers = ['STORY', 'DECISION', 'SCORE', 'PIPELINE STATE', 'TITLE'];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd();

  console.log(`Scribe workload: ${rel(SHIP_DIR)} (${items.length} verdict${items.length === 1 ? '' : 's'})\n`);
  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(line(r)));
  console.log('\nNext: node scripts/collect-chain.js --all, then write <id>.content.json for each, then node scripts/render-scribe.js --all');
}

try { main(); } catch (err) { console.error('Listing failed:', err.message); process.exit(1); }
