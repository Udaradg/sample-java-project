/**
 * Scribe — shared path resolution and read-only access to the entire chain of custody. Every
 * docs/ folder this skill reads from is read-only input; only .github/.pipeline-context/scribe/ and
 * docs/agent_output/06-ship/{pr,audit}_<id>.md are written here. Scribe never touches git or
 * GitHub — its output is content for a human to act on, always written, regardless of the merge
 * arbiter's decision.
 */
const fs = require('fs');
const path = require('path');
const register = require('../../../00-jira-story-register/scripts/lib/register');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const DATA_DIR = process.env.PIPELINE_CONTEXT_DATA_DIR
  ? path.resolve(process.env.PIPELINE_CONTEXT_DATA_DIR)
  : path.join(REPO_ROOT, '.github', '.pipeline-context');

const PATHS = {
  SKILL_DIR,
  REPO_ROOT,
  DATA_DIR,
  WORK_DIR: path.join(DATA_DIR, 'scribe'),
  STORIES_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '00-jira-stories'),
  PLANS_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '02-story-analysis'),
  CHANGES_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '03-development'),
  VERIFY_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '04-verify'),
  QA_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '05-test-gate'),
  BUILD_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '05-test-gate'),
  SHIP_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '06-ship'),
  OUT_README: path.join(REPO_ROOT, 'docs', 'agent_output', '06-ship', 'README.md'),
};

function rel(target) {
  return path.relative(REPO_ROOT, target).replace(/\\/g, '/');
}

function readIfPresent(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function extractField(text, label) {
  if (!text) return null;
  const re = new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|\\s*([^|]+)\\|`);
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

function titleOf(text) {
  if (!text) return null;
  const m = /^##\s+(?!\d)(.+)$/m.exec(text);
  return m ? m[1].trim() : null;
}

/** Every story that has a rendered merge-arbiter verdict — that defines the scribe's workload. */
function listArbitratedChanges() {
  if (!fs.existsSync(PATHS.SHIP_DIR)) return [];
  return fs
    .readdirSync(PATHS.SHIP_DIR)
    .filter((f) => /^verdict_.+\.md$/i.test(f))
    .map((name) => {
      const id = name.replace(/^verdict_/i, '').replace(/\.md$/i, '');
      const file = path.join(PATHS.SHIP_DIR, name);
      const text = fs.readFileSync(file, 'utf8');
      return {
        id,
        verdictFile: file,
        relativeVerdictFile: rel(file),
        title: titleOf(text) || id,
        decision: extractField(text, 'Decision'),
        score: extractField(text, 'Score'),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function resolveChange(idOrPath) {
  if (!idOrPath) throw new Error('Missing --story. Pass a story id (JIRA-001) or --all for every change with a rendered merge-arbiter verdict.');
  const all = listArbitratedChanges();
  const byId = all.find((c) => c.id.toLowerCase() === String(idOrPath).toLowerCase());
  if (byId) return byId;
  throw new Error(`No ship verdict for "${idOrPath}". Available: ${all.map((c) => c.id).join(', ') || 'none — run the merge-arbiter agent first'}`);
}

/** Gathers everything the Scribe needs to read, across the entire pipeline, all read-only. */
function chainOfCustodyFor(id) {
  const story = register.readStory(PATHS.STORIES_DIR, id, rel);

  return {
    story: story ? { file: story.relativeFile, text: story.body } : null,
    plan: fileIfExists(path.join(PATHS.PLANS_DIR, `plan_${id}.md`)),
    dev: fileIfExists(path.join(PATHS.CHANGES_DIR, `dev_${id}.md`)),
    devDiff: fileIfExists(path.join(PATHS.CHANGES_DIR, `dev_${id}.diff`)),
    acceptance: fileIfExists(path.join(PATHS.VERIFY_DIR, `acceptance_${id}.md`)),
    edgecase: fileIfExists(path.join(PATHS.VERIFY_DIR, `edgecase_${id}.md`)),
    behavior: fileIfExists(path.join(PATHS.VERIFY_DIR, `behavior_${id}.md`)),
    qa: fileIfExists(path.join(PATHS.QA_DIR, `qa_${id}.md`)),
    build: fileIfExists(path.join(PATHS.BUILD_DIR, `build_${id}.md`)),
    verdict: fileIfExists(path.join(PATHS.SHIP_DIR, `verdict_${id}.md`)),
  };
}

function fileIfExists(abs) {
  if (!fs.existsSync(abs)) return null;
  return { file: rel(abs), text: fs.readFileSync(abs, 'utf8') };
}

const factsPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.chain.facts.md`);
const contentPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.content.json`);
const verdictPathFor = (id) => path.join(PATHS.SHIP_DIR, `verdict_${id}.md`);
const prPathFor = (id) => path.join(PATHS.SHIP_DIR, `pr_${id}.md`);
const auditPathFor = (id) => path.join(PATHS.SHIP_DIR, `audit_${id}.md`);

module.exports = {
  ...PATHS,
  rel,
  readIfPresent,
  extractField,
  titleOf,
  listArbitratedChanges,
  resolveChange,
  chainOfCustodyFor,
  factsPathFor,
  contentPathFor,
  verdictPathFor,
  prPathFor,
  auditPathFor,
};
