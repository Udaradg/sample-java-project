#!/usr/bin/env node
/**
 * Dumps the JIRA story register exactly as the pipeline parses it.
 *
 * Use this to confirm a newly added or edited story file is picked up, and that its
 * metadata table and sections parse the way you meant, before running the agents.
 *
 *   node scripts/list-register.js
 *   node scripts/list-register.js --story JIRA-001
 *   node scripts/list-register.js --full
 */
const path = require('path');
const { listStories } = require('./lib/register');

const SKILL_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const STORIES_DIR = path.join(REPO_ROOT, 'docs', 'agent_output', '00-jira-stories');

const rel = (t) => path.relative(REPO_ROOT, t).replace(/\\/g, '/');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--full' || a === '-f') args.full = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--story' || a === '-s') args.story = argv[++i];
  }
  return args;
}

function usage() {
  console.log(`Dump the JIRA story register as the pipeline parses it.

  --story, -s <ID>   Only this story (e.g. JIRA-001)
  --full,  -f        Also print the full story body
  --help,  -h        This message

Register: ${rel(STORIES_DIR)}`);
}

function pad(s, n) {
  const v = String(s === null || s === undefined ? '' : s);
  return v.length > n ? `${v.slice(0, n - 1)}…` : v.padEnd(n);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  let stories = listStories(STORIES_DIR, rel);

  if (args.story) {
    stories = stories.filter((s) => s.id.toLowerCase() === String(args.story).toLowerCase());
    if (!stories.length) {
      console.error(`No story "${args.story}" in ${rel(STORIES_DIR)}.`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(`JIRA story register: ${rel(STORIES_DIR)} (${stories.length} stor${stories.length === 1 ? 'y' : 'ies'})\n`);
  if (!stories.length) {
    console.log('The register is empty — add a jira-story-<NNN>.md file and re-run.');
    return;
  }

  console.log(`${pad('ID', 11)}${pad('TYPE', 12)}${pad('PRIORITY', 10)}${pad('STATUS', 22)}TITLE`);
  console.log(`${'-'.repeat(10)} ${'-'.repeat(11)} ${'-'.repeat(9)} ${'-'.repeat(21)} ${'-'.repeat(50)}`);
  for (const s of stories) {
    console.log(`${pad(s.id, 11)}${pad(s.type, 12)}${pad(s.priority, 10)}${pad(s.status, 22)}${pad(s.title, 50)}`);
  }

  console.log('\nParsed detail:');
  for (const s of stories) {
    console.log(`\n  ${s.id} — ${s.title}`);
    console.log(`    component          : ${s.component || '(none)'}`);
    console.log(`    acceptance criteria: ${s.acceptanceCriteria.length} item(s)`);
    console.log(`    out of scope       : ${s.outOfScope.length} item(s)`);
    console.log(`    file               : ${s.relativeFile}`);
  }

  if (args.full) {
    for (const s of stories) {
      console.log(`\n${'='.repeat(78)}\n${s.id} — full story body\n${'='.repeat(78)}\n`);
      console.log(s.body);
    }
  }

  console.log('\nThis register is read-only input. Edit the markdown file directly; nothing in the pipeline writes to it.');
}

try {
  main();
} catch (err) {
  console.error(`Listing failed: ${err.message}`);
  process.exitCode = 1;
}
