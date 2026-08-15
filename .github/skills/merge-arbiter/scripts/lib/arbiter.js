/**
 * Merge Arbiter — shared path resolution and read-only access to every Phase C upstream report.
 * docs/fixes/, docs/verify/, docs/qa/, docs/build/ and docs/issues/ are all READ-ONLY input here.
 * Only .architect/merge/ and docs/ship/ are written by this skill.
 */
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const DATA_DIR = process.env.ARCHITECT_DATA_DIR
  ? path.resolve(process.env.ARCHITECT_DATA_DIR)
  : path.join(REPO_ROOT, '.architect');

const PATHS = {
  SKILL_DIR,
  REPO_ROOT,
  DATA_DIR,
  WORK_DIR: path.join(DATA_DIR, 'merge'),
  FIXES_DIR: path.join(REPO_ROOT, 'docs', 'fixes'),
  VERIFY_DIR: path.join(REPO_ROOT, 'docs', 'verify'),
  QA_DIR: path.join(REPO_ROOT, 'docs', 'qa'),
  BUILD_DIR: path.join(REPO_ROOT, 'docs', 'build'),
  ISSUES_DIR: path.join(REPO_ROOT, 'docs', 'issues'),
  OUT_DIR: path.join(REPO_ROOT, 'docs', 'ship'),
  OUT_README: path.join(REPO_ROOT, 'docs', 'ship', 'README.md'),
  SCORING_FILE: path.join(SKILL_DIR, 'scoring.json'),
};

function rel(target) {
  return path.relative(REPO_ROOT, target).replace(/\\/g, '/');
}

function readIfPresent(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function parseFixReport(text) {
  const title = /^##\s+(?!\d)(.+)$/m.exec(text);
  const status = /\|\s*\*\*Status\*\*\s*\|\s*([^|]+)\|/.exec(text);
  const cwe = /\|\s*\*\*CWE\*\*\s*\|\s*`([^`]+)`/.exec(text);
  return {
    title: title ? title[1].trim() : '(untitled)',
    status: status ? status[1].trim() : 'unknown',
    cwe: cwe ? cwe[1].trim() : null,
  };
}

// Merge arbiter never compiles anything itself — it only aggregates upstream reports. A fix drafted
// by Fixer as either Compiled or Compile Failed is eligible; only a Refused fix (no diff drafted at
// all) has nothing to aggregate. Whether an individual Compile-Failed fix can actually clear the
// merge bar is decided by the score/gate math against Step 1/2's real evidence, not by this filter.
const STEP3_ELIGIBLE_STATUSES = ['Compiled', 'Compile Failed'];

function listStep3Fixes() {
  if (!fs.existsSync(PATHS.FIXES_DIR)) return [];
  return fs
    .readdirSync(PATHS.FIXES_DIR)
    .filter((f) => /^fix_.+\.md$/i.test(f))
    .map((name) => {
      const file = path.join(PATHS.FIXES_DIR, name);
      const id = name.replace(/^fix_/i, '').replace(/\.md$/i, '');
      return { id, relativeFixReportFile: rel(file), ...parseFixReport(fs.readFileSync(file, 'utf8')) };
    })
    .filter((f) => STEP3_ELIGIBLE_STATUSES.includes(f.status))
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
    rescan: path.join(PATHS.VERIFY_DIR, `rescan_${id}.md`),
    redteam: path.join(PATHS.VERIFY_DIR, `redteam_${id}.md`),
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

function readIssueSeverity(id) {
  if (!fs.existsSync(PATHS.ISSUES_DIR)) return null;
  for (const name of fs.readdirSync(PATHS.ISSUES_DIR).filter((f) => f.toLowerCase().endsWith('.md'))) {
    const text = fs.readFileSync(path.join(PATHS.ISSUES_DIR, name), 'utf8');
    const idMatch = /^issue_id:\s*(.+)$/m.exec(text);
    if (!idMatch || idMatch[1].trim().toLowerCase() !== id.toLowerCase()) continue;
    const sev = /^severity:\s*(.+)$/m.exec(text);
    return sev ? sev[1].trim() : null;
  }
  return null;
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
  parseFixReport,
  STEP3_ELIGIBLE_STATUSES,
  listStep3Fixes,
  readUpstream,
  readIssueSeverity,
  loadScoring,
  scorePathFor,
  arbitrationPathFor,
  verdictPathFor,
};
