#!/usr/bin/env node
/**
 * Every change with a captured diff and its acceptance/edge-case/behavior report status.
 *
 *   node scripts/list-workload.js
 */
const fs = require('fs');
const path = require('path');
const { OUT_DIR, listStep1Changes } = require('./lib/verify');

function statusFor(prefix, id) {
  const file = path.join(OUT_DIR, `${prefix}_${id}.md`);
  return fs.existsSync(file) ? 'report written' : 'pending';
}

function pad(s, n) {
  const v = String(s === null || s === undefined ? '' : s);
  return v.length > n ? `${v.slice(0, n - 1)}…` : v.padEnd(n);
}

function main() {
  const changes = listStep1Changes();
  if (!changes.length) { console.log('No changes with a captured diff (Compiled or Compile Failed). Run 03_developer first.'); return; }

  console.log(`${pad('STORY', 11)}${pad('DEV STATUS', 15)}${pad('ACCEPTANCE', 16)}${pad('EDGE-CASE', 16)}BEHAVIOR`);
  console.log(`${'-'.repeat(10)} ${'-'.repeat(14)} ${'-'.repeat(15)} ${'-'.repeat(15)} ${'-'.repeat(15)}`);
  for (const c of changes) {
    console.log(`${pad(c.id, 11)}${pad(c.status, 15)}${pad(statusFor('acceptance', c.id), 16)}${pad(statusFor('edgecase', c.id), 16)}${statusFor('behavior', c.id)}`);
  }
}

main();
