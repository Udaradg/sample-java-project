#!/usr/bin/env node
/**
 * Scribe — Chain of Custody Collector
 *
 * Gathers links and headline facts from every stage of the pipeline for one story — the story
 * itself, its implementation plan, the development report, all three Step 1 checks, the QA + build
 * gates, and the merge arbiter's verdict — into one briefing. Facts only; the Scribe's own writing
 * (the PR content and the audit trail prose) is the agent's job, done after reading this.
 *
 * Usage:
 *   node scripts/collect-chain.js --all
 *   node scripts/collect-chain.js --story JIRA-001
 */
const fs = require('fs');
const path = require('path');
const {
  WORK_DIR, rel, listArbitratedChanges, resolveChange, chainOfCustodyFor, extractField, titleOf,
  factsPathFor,
} = require('./lib/scribe');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' || a === '-s') args.story = argv[++i];
    else if (a === '--all' || a === '-a') args.all = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Scribe — Chain of Custody Collector

  node scripts/collect-chain.js --all
  node scripts/collect-chain.js --story <ID>`);
}

/** Always stores the extracted field under one consistent 'status' key, whatever label it came from. */
function summarize(entry, extraLabel) {
  if (!entry) return { present: false };
  return {
    present: true,
    file: entry.file,
    title: titleOf(entry.text),
    status: extractField(entry.text, extraLabel || 'Status') || extractField(entry.text, 'Verdict'),
  };
}

function renderBriefing(id, chain, jsonSummary) {
  const out = [];
  out.push(`# Chain of Custody — ${id}`);
  out.push('');
  out.push('_Facts and links only — write the narrative and PR content yourself._');
  out.push('');

  const rows = [
    ['Story', jsonSummary.story],
    ['Implementation plan', jsonSummary.plan],
    ['Development (Compiled)', jsonSummary.dev],
    ['Acceptance-check', jsonSummary.acceptance],
    ['Edge-case review', jsonSummary.edgecase],
    ['Behavior guard', jsonSummary.behavior],
    ['QA gate', jsonSummary.qa],
    ['Build gate', jsonSummary.build],
    ['Merge verdict', jsonSummary.verdict],
  ];
  out.push('| Stage | Status/Verdict | File |');
  out.push('|---|---|---|');
  for (const [label, summary] of rows) {
    if (!summary || !summary.present) { out.push(`| ${label} | _not available_ | — |`); continue; }
    out.push(`| ${label} | ${summary.status || '-'} | \`${summary.file}\` |`);
  }
  out.push('');

  out.push('## Full text of each stage');
  out.push('');
  for (const [label, entry] of Object.entries(chain)) {
    if (!entry || label === 'devDiff') continue;
    out.push(`<details><summary>${label}${entry.file ? ` — \`${entry.file}\`` : ''}</summary>`);
    out.push('');
    out.push(entry.text || '_not available_');
    out.push('');
    out.push('</details>');
    out.push('');
  }

  if (chain.devDiff) {
    out.push('## The diff');
    out.push('');
    out.push('```diff');
    out.push(chain.devDiff.text.trim());
    out.push('```');
    out.push('');
  }

  out.push('## What to write next');
  out.push('');
  out.push(`Write \`${rel(path.join(WORK_DIR, `${id}.content.json`))}\` following `
    + `\`templates/content.schema.json\`: the audit trail's narrative prose and the PR's title/`
    + `summary/checklist. You do not decide or restate Cleared/Blocked — the render script pulls `
    + `that straight from the merge verdict and applies the Blocked banner automatically.`);
  out.push('');

  return out.join('\n');
}

function collectForChange(change) {
  const chain = chainOfCustodyFor(change.id);
  const jsonSummary = {
    story: chain.story ? { present: true, file: chain.story.file } : { present: false },
    plan: summarize(chain.plan),
    dev: summarize(chain.dev),
    acceptance: summarize(chain.acceptance, 'Verdict'),
    edgecase: summarize(chain.edgecase, 'Verdict'),
    behavior: summarize(chain.behavior, 'Verdict'),
    qa: summarize(chain.qa),
    build: summarize(chain.build),
    verdict: summarize(chain.verdict, 'Decision'),
    devDiffFile: chain.devDiff ? chain.devDiff.file : null,
  };

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, `${change.id}.chain.facts.json`), JSON.stringify(jsonSummary, null, 2));
  fs.writeFileSync(factsPathFor(change.id), renderBriefing(change.id, chain, jsonSummary));

  return { id: change.id, briefing: rel(factsPathFor(change.id)) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  let targets;
  if (args.all) {
    targets = listArbitratedChanges();
    if (!targets.length) throw new Error('No ship verdicts found. Run the merge-arbiter agent first.');
    console.log(`Scribe — ${targets.length} change(s): ${targets.map((t) => t.id).join(', ')}`);
  } else {
    if (!args.story) throw new Error('Missing --story or --all.');
    targets = [resolveChange(args.story)];
  }

  for (const change of targets) {
    const s = collectForChange(change);
    console.log(`\n${s.id} — chain collected`);
    console.log(`  briefing : ${s.briefing}`);
  }
  console.log(`\nNext: write <id>.content.json for each, then node scripts/render-scribe.js --all`);
}

try { main(); } catch (err) { console.error('Chain collection failed:', err.message); process.exit(1); }
