#!/usr/bin/env node
/**
 * Edge-case Review — Fact Collector
 *
 * Answers "does the change survive boundary/error conditions and inputs the plan didn't
 * explicitly cover?" — gathers the patched source (materialized by applying the change's diff
 * in a throwaway worktree), the diff itself, and the plan's stated approach and risk notes. The
 * adversarial reasoning — enumerating edge cases against the new code — is the agent's job; this
 * script only assembles what it needs to do that without inventing anything.
 *
 * Usage:
 *   node scripts/collect-edgecase.js --all
 *   node scripts/collect-edgecase.js --story JIRA-001
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
  console.log(`Edge-case Review — Fact Collector

  node scripts/collect-edgecase.js --all
  node scripts/collect-edgecase.js --story <ID>`);
}

function renderBriefing(facts) {
  const out = [];
  out.push(`# Edge-case Review Facts — ${facts.id}`);
  out.push('');
  out.push(`_Collected ${facts.generatedAt}. Materials only — the adversarial reasoning is yours._`);
  out.push('');
  out.push(`**Story:** ${facts.title}`);
  out.push('');

  out.push('## 1. The plan\'s own claim');
  out.push('');
  out.push(facts.planApproach || '_Plan approach not available._');
  out.push('');
  if (facts.planRiskNotes.length) {
    out.push('**Risks the plan already flagged:**');
    out.push('');
    facts.planRiskNotes.forEach((r) => out.push(`- ${r}`));
    out.push('');
  }

  out.push('## 2. Story\'s out-of-scope list (a gap here is expected, not a finding)');
  out.push('');
  if (facts.outOfScope.length) facts.outOfScope.forEach((o) => out.push(`- ${o}`));
  else out.push('_None declared._');
  out.push('');

  out.push('## 3. The diff');
  out.push('');
  out.push(facts.diffText ? ['```diff', facts.diffText.trim(), '```'].join('\n') : '_Diff not available._');
  out.push('');

  out.push('## 4. Patched source (isolated worktree, never the real tree)');
  out.push('');
  if (!facts.worktree.applied) {
    out.push(`_Could not materialize the change: ${facts.worktree.error}_`);
  } else {
    for (const [file, content] of Object.entries(facts.patchedFiles)) {
      out.push(`### \`${file}\``);
      out.push('');
      out.push(content === null ? '_Not found._' : ['```java', content, '```'].join('\n'));
      out.push('');
    }
  }

  out.push('## 5. What to write next');
  out.push('');
  out.push(`Read this briefing, then write \`${rel(path.join(WORK_DIR, `${facts.id}.edgecase.verdict.json`))}\` `
    + `following \`templates/edgecase.schema.json\`. Enumerate concrete edge cases against the *new* `
    + `code — a boundary value, a null/empty input, an unexpected combination of parameters — that the `
    + `plan didn't explicitly account for. A gap the story explicitly put out of scope is not a finding.`);
  out.push('');

  return out.join('\n');
}

function collectForChange(change) {
  const chain = upstreamChainFor(change);

  const diffAbs = path.join(REPO_ROOT, change.diffFile || '');
  const diffText = change.diffFile && fs.existsSync(diffAbs) ? fs.readFileSync(diffAbs, 'utf8') : null;
  const worktree = diffText
    ? materializePatchedFiles(change.id, diffAbs, change.filesChanged)
    : { applied: false, files: {}, error: `No diff file resolved from development report (looked for ${change.diffFile || 'none'}).` };

  const facts = {
    generatedAt: new Date().toISOString(),
    id: change.id,
    title: change.title,
    planApproach: chain.plan ? chain.plan.approach : null,
    planRiskNotes: chain.plan ? chain.plan.riskNotes : [],
    outOfScope: chain.story ? chain.story.outOfScope : [],
    diffText,
    worktree: { applied: worktree.applied, error: worktree.error },
    patchedFiles: worktree.files,
    sources: { devReport: change.relativeDevReportFile },
  };

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(factsPathFor(change.id, 'edgecase'), JSON.stringify(facts, null, 2));
  fs.writeFileSync(briefingPathFor(change.id, 'edgecase'), renderBriefing(facts));

  return { id: change.id, worktreeOk: worktree.applied, briefing: rel(briefingPathFor(change.id, 'edgecase')) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  let targets;
  if (args.all) {
    targets = listStep1Changes();
    if (!targets.length) throw new Error('No changes found with a captured diff. Nothing to review.');
    console.log(`Edge-case Review — ${targets.length} change(s): ${targets.map((t) => t.id).join(', ')}`);
  } else {
    if (!args.story) throw new Error('Missing --story. Pass a story id (--story JIRA-001) or --all.');
    targets = [resolveChange(args.story)];
    if (targets[0].status === 'Refused') throw new Error(`${targets[0].id}'s development report Status is "Refused" — nothing to review.`);
  }

  const done = []; const failed = [];
  for (const change of targets) {
    try {
      const s = collectForChange(change);
      done.push(s);
      console.log(`\n${s.id} — facts collected`);
      console.log(`  worktree      : ${s.worktreeOk ? 'applied ok' : 'FAILED'}`);
      console.log(`  briefing      : ${s.briefing}`);
    } catch (err) {
      if (targets.length === 1) throw err;
      failed.push({ id: change.id, message: err.message });
      console.error(`\n${change.id} — FAILED: ${err.message}`);
    }
  }
  if (targets.length > 1) console.log(`\nCollected ${done.length}/${targets.length}.`);
  console.log(`\nNext: read each briefing, then write <id>.edgecase.verdict.json alongside it.`);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error('Edge-case review collection failed:', err.message);
  process.exit(1);
}
