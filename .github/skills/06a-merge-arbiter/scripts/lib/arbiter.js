/**
 * Merge Arbiter — shared path resolution and read-only access to every Phase C upstream report.
 * docs/agent_output/03-development/, docs/agent_output/04-verify/, docs/agent_output/05-test-gate/
 * and docs/agent_output/00-jira-stories/ are all READ-ONLY input here. Only
 * .github/.pipeline-context/merge/ and docs/agent_output/06-ship/ are written by this skill.
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
  WORK_DIR: path.join(DATA_DIR, 'merge'),
  CHANGES_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '03-development'),
  VERIFY_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '04-verify'),
  QA_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '05-test-gate'),
  BUILD_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '05-test-gate'),
  STORIES_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '00-jira-stories'),
  OUT_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '06-ship'),
  OUT_README: path.join(REPO_ROOT, 'docs', 'agent_output', '06-ship', 'README.md'),
  SCORING_FILE: path.join(SKILL_DIR, 'scoring.json'),
};

function rel(target) {
  return path.relative(REPO_ROOT, target).replace(/\\/g, '/');
}

function readIfPresent(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function parseDevReport(text) {
  const title = /^##\s+\S+\s*—\s*(.+)$/m.exec(text);
  const status = /\|\s*\*\*Status\*\*\s*\|\s*([^|]+)\|/.exec(text);
  return {
    title: title ? title[1].trim() : '(untitled)',
    status: status ? status[1].trim() : 'unknown',
  };
}

// Merge arbiter never compiles anything itself — it only aggregates upstream reports. A change
// captured by the Developer as either Compiled or Compile Failed is eligible; only a Refused
// change (no diff captured at all) has nothing to aggregate.
const STEP3_ELIGIBLE_STATUSES = ['Compiled', 'Compile Failed'];

function listStep3Changes() {
  if (!fs.existsSync(PATHS.CHANGES_DIR)) return [];
  return fs
    .readdirSync(PATHS.CHANGES_DIR)
    .filter((f) => /^dev_.+\.md$/i.test(f))
    .map((name) => {
      const file = path.join(PATHS.CHANGES_DIR, name);
      const id = name.replace(/^dev_/i, '').replace(/\.md$/i, '');
      return { id, relativeDevReportFile: rel(file), ...parseDevReport(fs.readFileSync(file, 'utf8')) };
    })
    .filter((c) => STEP3_ELIGIBLE_STATUSES.includes(c.status))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Generic "At a glance" verdict/status extractor shared by every upstream report shape. */
function extractField(text, label) {
  const re = new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|\\s*([^|]+)\\|`);
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

function readUpstream(id) {
  const files = {
    acceptance: path.join(PATHS.VERIFY_DIR, `acceptance_${id}.md`),
    edgecase: path.join(PATHS.VERIFY_DIR, `edgecase_${id}.md`),
    behavior: path.join(PATHS.VERIFY_DIR, `behavior_${id}.md`),
    qa: path.join(PATHS.QA_DIR, `qa_${id}.md`),
    build: path.join(PATHS.BUILD_DIR, `build_${id}.md`),
  };
  const out = {};
  for (const [name, file] of Object.entries(files)) {
    const text = readIfPresent(file);
    out[name] = {
      present: Boolean(text),
      file: rel(file),
      verdict: text ? (extractField(text, 'Verdict') || extractField(text, 'Status')) : null,
    };
  }
  return out;
}

function readStoryPriority(id) {
  const story = register.readStory(PATHS.STORIES_DIR, id, rel);
  return story ? story.priority : null;
}

function loadScoring() {
  return JSON.parse(fs.readFileSync(PATHS.SCORING_FILE, 'utf8'));
}

const scorePathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.score.json`);
const arbitrationPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.arbitration.json`);
const verdictPathFor = (id) => path.join(PATHS.OUT_DIR, `verdict_${id}.md`);

module.exports = {
  ...PATHS,
  rel,
  readIfPresent,
  parseDevReport,
  STEP3_ELIGIBLE_STATUSES,
  listStep3Changes,
  readUpstream,
  readStoryPriority,
  loadScoring,
  scorePathFor,
  arbitrationPathFor,
  verdictPathFor,
};
