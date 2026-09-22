#!/usr/bin/env node
/**
 * Acceptance-check — Fact Collector
 *
 * Answers "does every acceptance criterion the story listed actually hold in the patched code?"
 * Gathers the story's acceptance criteria and the patched source, materialized by applying the
 * change's own diff inside a throwaway git worktree (never the real working tree).
 *
 * This script does not decide whether a criterion is met — that judgment belongs to the agent,
 * written to <id>.acceptance.verdict.json after reading the briefing this script produces.
 *
 * Usage:
 *   node scripts/collect-acceptance.js --all
 *   node scripts/collect-acceptance.js --story JIRA-001
 */
const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT, WORK_DIR, rel, listStep1Changes, resolveChange, upstreamChainFor,
  materializePatchedFiles, factsPathFor, briefingPathFor,
} = require('./lib/verify');

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
  console.log(`Acceptance-check — Fact Collector

  node scripts/collect-acceptance.js --all
  node scripts/collect-acceptance.js --story <ID>`);
}

function renderBriefing(facts) {
  const out = [];
  out.push(`# Acceptance-check Facts — ${facts.id}`);
  out.push('');
  out.push(`_Collected ${facts.generatedAt}. Materials only — no verdict._`);
  out.push('');
  out.push(`**Story:** ${facts.title}`);
  out.push(`**Development report:** \`${facts.sources.devReport}\``);
  out.push('');

  out.push('## 1. Acceptance criteria to check');
  out.push('');
  if (!facts.criteria.length) out.push('_The story lists no acceptance criteria — reason from its Description instead._');
  else facts.criteria.forEach((c, i) => out.push(`${i + 1}. ${c}`));
  out.push('');

  out.push('## 2. Plan\'s own claim per criterion');
  out.push('');
  out.push(facts.planCriteriaText || '_Not available._');
  out.push('');

  out.push('## 3. Patched source (materialized by applying the diff in an isolated worktree)');
  out.push('');
  if (!facts.worktree.applied) {
    out.push(`_Could not materialize the change: ${facts.worktree.error}_`);
  } else {
    for (const [file, content] of Object.entries(facts.patchedFiles)) {
      out.push(`### \`${file}\``);
      out.push('');
      out.push(content === null ? '_File not found in the patched worktree._' : ['```java', content, '```'].join('\n'));
      out.push('');
    }
  }

  out.push('## 4. What to write next');
  out.push('');
  out.push(`Read this briefing, then write \`${rel(path.join(WORK_DIR, `${facts.id}.acceptance.verdict.json`))}\` `
    + `following \`templates/acceptance.schema.json\`. Check each criterion against the *patched source `
    + `itself*, not the developer's own narrative — an unmet criterion here is exactly what this check `
    + `exists to catch before it ships.`);
  out.push('');

  return out.join('\n');
}

function collectForChange(change) {
  const chain = upstreamChainFor(change);
  const story = chain.story;
  const criteria = story ? story.acceptanceCriteria : [];

  const diffAbs = path.join(REPO_ROOT, change.diffFile || '');
  const worktree = change.diffFile && fs.existsSync(diffAbs)
    ? materializePatchedFiles(change.id, diffAbs, change.filesChanged)
    : { applied: false, files: {}, error: `No diff file resolved from development report (looked for ${change.diffFile || 'none'}).` };

  const facts = {
    generatedAt: new Date().toISOString(),
    id: change.id,
    title: change.title,
    criteria,
    planCriteriaText: chain.plan ? chain.plan.criteriaPlanText : null,
    worktree: { applied: worktree.applied, error: worktree.error },
    patchedFiles: worktree.files,
    sources: { devReport: change.relativeDevReportFile, story: story ? story.relativeFile : null },
  };

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(factsPathFor(change.id, 'acceptance'), JSON.stringify(facts, null, 2));
  fs.writeFileSync(briefingPathFor(change.id, 'acceptance'), renderBriefing(facts));

  return {
    id: change.id,
    criteriaCount: criteria.length,
    worktreeOk: worktree.applied,
    briefing: rel(briefingPathFor(change.id, 'acceptance')),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  let targets;
  if (args.all) {
    targets = listStep1Changes();
    if (!targets.length) throw new Error('No changes found with a captured diff (Compiled or Compile Failed). Nothing to check.');
    console.log(`Acceptance-check — ${targets.length} change(s): ${targets.map((t) => t.id).join(', ')}`);
  } else {
    if (!args.story) throw new Error('Missing --story. Pass a story id (--story JIRA-001) or --all.');
    targets = [resolveChange(args.story)];
    if (targets[0].status === 'Refused') throw new Error(`${targets[0].id}'s development report Status is "Refused" — the Developer never captured a diff to check.`);
  }

  const done = []; const failed = [];
  for (const change of targets) {
    try {
      const s = collectForChange(change);
      done.push(s);
      console.log(`\n${s.id} — facts collected`);
      console.log(`  criteria      : ${s.criteriaCount}`);
      console.log(`  worktree      : ${s.worktreeOk ? 'applied ok' : 'FAILED'}`);
      console.log(`  briefing      : ${s.briefing}`);
    } catch (err) {
      if (targets.length === 1) throw err;
      failed.push({ id: change.id, message: err.message });
      console.error(`\n${change.id} — FAILED: ${err.message}`);
    }
  }
  if (targets.length > 1) console.log(`\nCollected ${done.length}/${targets.length}.`);
  console.log(`\nNext: read each briefing, then write <id>.acceptance.verdict.json alongside it.`);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error('Acceptance-check collection failed:', err.message);
  process.exit(1);
}
