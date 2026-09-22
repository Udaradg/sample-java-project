#!/usr/bin/env node
/**
 * Gathers a story's own text plus every matching artifact/context node into one
 * briefing the agent reads before writing a plan.
 *
 *   node scripts/collect-analysis.js --story JIRA-001
 *   node scripts/collect-analysis.js --all
 */
const fs = require('fs');
const path = require('path');
const {
  WORK_DIR, REPO_ROOT, ARTIFACTS_FILE, DESCRIPTIONS_FILE,
  rel, readJsonIfPresent, listStories, resolveStory,
  findRelatedArtifacts, findRelatedContext, factsPathFor, briefingPathFor,
} = require('./lib/analysis');

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
  console.log(`Collect Story / Impact Analyst facts.

  node scripts/collect-analysis.js --story <ID>
  node scripts/collect-analysis.js --all`);
}

function keywordsFor(story) {
  const words = new Set();
  if (story.component) {
    for (const part of story.component.split(/[^A-Za-z0-9]+/)) {
      if (part && part.length > 2) words.add(part);
    }
  }
  for (const label of story.labels) words.add(label);
  return [...words];
}

function collectOne(story) {
  const artifacts = readJsonIfPresent(ARTIFACTS_FILE);
  const descriptions = readJsonIfPresent(DESCRIPTIONS_FILE);
  const keywords = keywordsFor(story);

  const relatedArtifacts = findRelatedArtifacts(artifacts, keywords);
  const relatedContext = findRelatedContext(descriptions, keywords);

  const facts = {
    generatedAt: new Date().toISOString(),
    id: story.id,
    title: story.title,
    storyFile: story.relativeFile,
    keywords,
    artifactsAvailable: Boolean(artifacts),
    contextAvailable: Boolean(descriptions),
    relatedArtifacts,
    relatedContext,
    acceptanceCriteria: story.acceptanceCriteria,
    outOfScope: story.outOfScope,
  };

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(factsPathFor(story.id), JSON.stringify(facts, null, 2));

  const lines = [];
  lines.push(`# ${story.id} — analysis briefing`, '');
  if (!artifacts) lines.push('> **Warning:** `.github/.pipeline-context/artifacts.json` not found — run `01_architect` first.', '');
  lines.push('## Story', '', `**${story.title}**`, '');
  if (story.summary) lines.push(story.summary, '');
  lines.push('## Acceptance Criteria', '');
  for (const [i, c] of story.acceptanceCriteria.entries()) lines.push(`${i + 1}. ${c}`);
  lines.push('');
  if (story.outOfScope.length) {
    lines.push('## Out of Scope', '');
    for (const o of story.outOfScope) lines.push(`- ${o}`);
    lines.push('');
  }
  lines.push('## Related artifacts (keyword match — verify before relying on it)', '');
  if (!relatedArtifacts.length) lines.push('_None matched — the analyst should search the codebase directly._', '');
  else for (const a of relatedArtifacts) lines.push(`- \`${a.kind}\` ${a.name}${a.file ? ` — ${a.file}` : ''}`);
  lines.push('');
  lines.push('## Related context (Architect\'s semantic layer)', '');
  if (!relatedContext.length) lines.push('_None matched._', '');
  else for (const c of relatedContext) lines.push(`- ${c.id || '(unnamed)'}: ${c.summary || '(no summary)'}`);
  lines.push('');

  fs.writeFileSync(briefingPathFor(story.id), lines.join('\n'));
  return facts;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  let targets;
  if (args.all) {
    targets = listStories();
    if (!targets.length) { console.log('No stories in the register. Nothing to collect.'); return; }
  } else {
    if (!args.story) throw new Error('Missing --story or --all.');
    targets = [resolveStory(args.story)];
  }

  for (const story of targets) {
    const facts = collectOne(story);
    console.log(`${story.id}: ${facts.relatedArtifacts.length} artifact match(es), ${facts.relatedContext.length} context match(es) -> ${rel(briefingPathFor(story.id))}`);
  }
  console.log(`\nNext: read the briefing, write .plan.json, then node scripts/render-plan.js`);
}

try { main(); } catch (err) { console.error('Collection failed:', err.message); process.exit(1); }
