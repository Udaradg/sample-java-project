#!/usr/bin/env node
/**
 * Behavior Guard — Fact Collector
 *
 * Answers "did real behavior change beyond what the plan intended?" — gathers the pre-change
 * source (read straight off the real working tree — always safe, read-only), the patched source
 * (materialized via a throwaway worktree), the diff, and the plan's stated scope. Also
 * mechanically extracts Java method signature lines from both versions as a cheap structural aid
 * — not authoritative, just something to check against. The judgment of what's in-scope vs an
 * unintended side effect is the agent's.
 *
 * Usage:
 *   node scripts/collect-behavior.js --all
 *   node scripts/collect-behavior.js --story JIRA-001
 */
const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT, WORK_DIR, readIfPresent, rel, listStep1Changes, resolveChange, upstreamChainFor,
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
  console.log(`Behavior Guard — Fact Collector

  node scripts/collect-behavior.js --all
  node scripts/collect-behavior.js --story <ID>`);
}

/** Cheap, non-authoritative structural aid — not a real Java parser. */
function extractSignatures(source) {
  if (!source) return [];
  const re = /^\s*(?:@\w+(?:\([^)]*\))?\s*)*(public|private|protected)\s+(?:static\s+)?[\w<>\[\],.?\s]+?\s(\w+)\s*\(([^)]*)\)/gm;
  const out = [];
  let m;
  while ((m = re.exec(source))) out.push(`${m[1]} ${m[2]}(${m[3].trim()})`);
  return [...new Set(out)];
}

function diffSignatures(before, after) {
  const b = new Set(extractSignatures(before));
  const a = new Set(extractSignatures(after));
  return {
    unchanged: [...a].filter((s) => b.has(s)),
    added: [...a].filter((s) => !b.has(s)),
    removed: [...b].filter((s) => !a.has(s)),
  };
}

function renderBriefing(facts) {
  const out = [];
  out.push(`# Behavior Guard Facts — ${facts.id}`);
  out.push('');
  out.push(`_Collected ${facts.generatedAt}. Materials and a mechanical signature diff only — the in-scope/out-of-scope judgment is yours._`);
  out.push('');
  out.push(`**Story:** ${facts.title}`);
  out.push('');

  out.push('## 1. The plan\'s stated scope');
  out.push('');
  out.push(facts.planApproach || '_Not available._');
  out.push('');
  if (facts.plannedFiles.length) {
    out.push('Planned changes:');
    out.push('');
    facts.plannedFiles.forEach((f) => out.push(`- \`${f}\``));
    out.push('');
  }

  out.push('## 2. Method signature diff (mechanical, not authoritative)');
  out.push('');
  for (const [file, sig] of Object.entries(facts.signatureDiffs)) {
    out.push(`### \`${file}\``);
    out.push('');
    out.push(`- Unchanged: ${sig.unchanged.length ? sig.unchanged.map((s) => `\`${s}\``).join(', ') : '_none_'}`);
    out.push(`- Added: ${sig.added.length ? sig.added.map((s) => `\`${s}\``).join(', ') : '_none_'}`);
    out.push(`- Removed: ${sig.removed.length ? sig.removed.map((s) => `\`${s}\``).join(', ') : '_none_'}`);
    out.push('');
  }

  out.push('## 3. The diff');
  out.push('');
  out.push(facts.diffText ? ['```diff', facts.diffText.trim(), '```'].join('\n') : '_Not available._');
  out.push('');

  out.push('## 4. Pre-change vs patched source, side by side');
  out.push('');
  if (!facts.worktree.applied) {
    out.push(`_Could not materialize the change: ${facts.worktree.error}_`);
  } else {
    for (const file of Object.keys(facts.patchedFiles)) {
      out.push(`### \`${file}\``);
      out.push('');
      out.push('<details><summary>Pre-change</summary>\n');
      out.push('```java');
      out.push(facts.prePatchFiles[file] || '_not found_');
      out.push('```');
      out.push('\n</details>');
      out.push('');
      out.push('<details><summary>Patched</summary>\n');
      out.push('```java');
      out.push(facts.patchedFiles[file] || '_not found_');
      out.push('```');
      out.push('\n</details>');
      out.push('');
    }
  }

  out.push('## 5. What to write next');
  out.push('');
  out.push(`Read this briefing, then write \`${rel(path.join(WORK_DIR, `${facts.id}.behavior.verdict.json`))}\` `
    + `following \`templates/behavior.schema.json\`. Separate changes the plan explains from `
    + `anything it does not (log format changes, a different exception type, a changed return value, `
    + `field visibility) — the latter is what this check exists to catch.`);
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

  const prePatchFiles = {};
  for (const f of change.filesChanged || []) {
    const abs = path.join(REPO_ROOT, f);
    prePatchFiles[f] = readIfPresent(abs);
  }

  const signatureDiffs = {};
  for (const f of change.filesChanged || []) {
    signatureDiffs[f] = diffSignatures(prePatchFiles[f], worktree.files[f]);
  }

  const facts = {
    generatedAt: new Date().toISOString(),
    id: change.id,
    title: change.title,
    planApproach: chain.plan ? chain.plan.approach : null,
    plannedFiles: change.filesChanged || [],
    signatureDiffs,
    diffText,
    worktree: { applied: worktree.applied, error: worktree.error },
    prePatchFiles,
    patchedFiles: worktree.files,
    sources: { devReport: change.relativeDevReportFile },
  };

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(factsPathFor(change.id, 'behavior'), JSON.stringify(facts, null, 2));
  fs.writeFileSync(briefingPathFor(change.id, 'behavior'), renderBriefing(facts));

  return { id: change.id, worktreeOk: worktree.applied, briefing: rel(briefingPathFor(change.id, 'behavior')) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  let targets;
  if (args.all) {
    targets = listStep1Changes();
    if (!targets.length) throw new Error('No changes found with a captured diff. Nothing to check.');
    console.log(`Behavior Guard — ${targets.length} change(s): ${targets.map((t) => t.id).join(', ')}`);
  } else {
    if (!args.story) throw new Error('Missing --story. Pass a story id (--story JIRA-001) or --all.');
    targets = [resolveChange(args.story)];
    if (targets[0].status === 'Refused') throw new Error(`${targets[0].id}'s development report Status is "Refused" — nothing to check.`);
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
  console.log(`\nNext: read each briefing, then write <id>.behavior.verdict.json alongside it.`);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error('Behavior guard collection failed:', err.message);
  process.exit(1);
}
