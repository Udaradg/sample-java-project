/**
 * Root Cause Analyst — shared issue-register access.
 *
 * The issue register (docs/issues/) is READ-ONLY input, supplied by whoever reports
 * the issue. Nothing in this skill writes to it. These helpers locate and parse those
 * files, and resolve the paths of everything the pipeline reads and writes.
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
  ARTIFACTS_FILE: path.join(DATA_DIR, 'artifacts.json'),
  RCA_DIR: path.join(DATA_DIR, 'rca'),
  ISSUES_DIR: path.join(REPO_ROOT, 'docs', 'issues'),
  ARCHITECTURE_MD: path.join(REPO_ROOT, 'docs', 'architecture.md'),
  FUNCTION_REFERENCE_MD: path.join(REPO_ROOT, 'docs', 'function-reference.md'),
  OUT_DIR: path.join(REPO_ROOT, 'docs', 'root-cause'),
};

/** Repo-relative, forward-slashed — for display and for markdown links. */
function rel(target) {
  return path.relative(REPO_ROOT, target).replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Front matter — supported subset: scalars, inline arrays, block sequences of scalars
// ---------------------------------------------------------------------------

function stripQuotes(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };

  const data = {};
  let currentKey = null;
  for (const rawLine of match[1].split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;

    const item = /^\s*-\s+(.*)$/.exec(rawLine);
    if (item && currentKey) {
      data[currentKey].push(stripQuotes(item[1]));
      continue;
    }

    const pair = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(rawLine);
    if (!pair) continue;
    const [, key, rawValue] = pair;
    const value = rawValue.trim();

    if (value === '') {
      data[key] = [];
      currentKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value.slice(1, -1).split(',').map((v) => stripQuotes(v)).filter(Boolean);
      currentKey = null;
    } else {
      data[key] = stripQuotes(value);
      currentKey = null;
    }
  }
  return { data, body: match[2] };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

/**
 * Every issue in docs/issues/, sorted by id. Markdown files without an `issue_id`
 * front-matter key (README.md, templates, notes) are not issues and are skipped.
 */
function listIssues() {
  if (!fs.existsSync(PATHS.ISSUES_DIR)) return [];
  return fs
    .readdirSync(PATHS.ISSUES_DIR)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .map((f) => {
      const file = path.join(PATHS.ISSUES_DIR, f);
      const { data } = parseFrontMatter(fs.readFileSync(file, 'utf8'));
      if (!data.issue_id) return null;
      return {
        id: data.issue_id,
        title: data.title || '(untitled)',
        type: data.type || null,
        severity: data.severity || null,
        status: data.status || null,
        services: asArray(data.affected_services),
        file,
        relativeFile: rel(file),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Accepts an issue id (ISSUE-001) or a path to an issue markdown file. */
function resolveIssueFile(issueArg) {
  if (!issueArg) {
    throw new Error('Missing --issue. Pass an issue id (ISSUE-001), a path to an issue file, or --all for every issue in docs/issues/.');
  }

  const asPath = path.isAbsolute(issueArg) ? issueArg : path.join(REPO_ROOT, issueArg);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) return asPath;

  const issues = listIssues();
  const match = issues.find((i) => i.id.toLowerCase() === issueArg.toLowerCase());
  if (match) return match.file;

  throw new Error(
    `No issue with issue_id "${issueArg}" in ${rel(PATHS.ISSUES_DIR)}. ` +
    `Available: ${issues.map((i) => i.id).join(', ') || 'none — the register is empty'}`
  );
}

function evidencePathFor(issueId) {
  return path.join(PATHS.RCA_DIR, `${issueId}.evidence.json`);
}

function analysisPathFor(issueId) {
  return path.join(PATHS.RCA_DIR, `${issueId}.analysis.json`);
}

function reportPathFor(issueId) {
  return path.join(PATHS.OUT_DIR, `root_cause_${issueId}.md`);
}

module.exports = {
  ...PATHS,
  rel,
  parseFrontMatter,
  asArray,
  listIssues,
  resolveIssueFile,
  evidencePathFor,
  analysisPathFor,
  reportPathFor,
};
