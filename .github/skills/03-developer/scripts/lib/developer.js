/**
 * Developer — shared path resolution, plan access, and the isolated worktree/Maven helpers.
 *
 * docs/agent_output/02-story-analysis/ is read-only input here. The only files this skill writes
 * are under .github/.pipeline-context/development/ and docs/agent_output/03-development/ — and,
 * transiently, the throwaway worktree itself, which is never the real working tree.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const DATA_DIR = process.env.PIPELINE_CONTEXT_DATA_DIR
  ? path.resolve(process.env.PIPELINE_CONTEXT_DATA_DIR)
  : path.join(REPO_ROOT, '.github', '.pipeline-context');

const PATHS = {
  SKILL_DIR,
  REPO_ROOT,
  DATA_DIR,
  WORK_DIR: path.join(DATA_DIR, 'development'),
  WORKTREES_DIR: path.join(DATA_DIR, 'development', 'worktrees'),
  PLANS_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '02-story-analysis'),
  OUT_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '03-development'),
  OUT_README: path.join(REPO_ROOT, 'docs', 'agent_output', '03-development', 'README.md'),
};

function rel(target) {
  return path.relative(REPO_ROOT, target).replace(/\\/g, '/');
}

function readJsonIfPresent(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parsePlanReport(text) {
  const title = /^##\s+\S+\s*—\s*(.+)$/m.exec(text);
  const status = /\|\s*\*\*Status\*\*\s*\|\s*([^|]+)\|/.exec(text);
  return {
    title: title ? title[1].trim() : '(untitled)',
    status: status ? status[1].trim() : 'unknown',
  };
}

/** Every plan report under PLANS_DIR, regardless of Status — callers filter for Approved. */
function listPlans() {
  if (!fs.existsSync(PATHS.PLANS_DIR)) return [];
  return fs
    .readdirSync(PATHS.PLANS_DIR)
    .filter((f) => /^plan_.+\.md$/i.test(f))
    .map((name) => {
      const file = path.join(PATHS.PLANS_DIR, name);
      const id = name.replace(/^plan_/i, '').replace(/\.md$/i, '');
      const parsed = parsePlanReport(fs.readFileSync(file, 'utf8'));
      return { id, planFile: file, relativePlanFile: rel(file), ...parsed };
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function resolvePlan(id) {
  if (!id) throw new Error('Missing --story. Pass a story id (JIRA-001) or --all for every Approved plan.');
  const all = listPlans();
  const match = all.find((p) => p.id.toLowerCase() === String(id).toLowerCase());
  if (!match) {
    throw new Error(`No plan for "${id}" in ${rel(PATHS.PLANS_DIR)}. Available: ${all.map((p) => p.id).join(', ') || 'none — run 02_story-analyst first'}`);
  }
  return match;
}

function listApprovedPlansWithoutReport() {
  return listPlans().filter((p) => p.status === 'Approved' && !fs.existsSync(devReportPathFor(p.id)));
}

/** Reads a rendered dev report's Status field, or null if none rendered yet. */
function currentDevStatus(id) {
  const file = devReportPathFor(id);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const m = /\|\s*\*\*Status\*\*\s*\|\s*([^|]+)\|/.exec(text);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Isolated worktree + Maven (no wrapper is committed in this repo — use `mvn` on PATH)
// ---------------------------------------------------------------------------

function run(cmd, args, options) {
  const result = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8', shell: false, ...options });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error ? result.error.message : null };
}

function removeWorktreeIfPresent(worktreeDir) {
  if (!fs.existsSync(worktreeDir)) return;
  const result = run('git', ['worktree', 'remove', '--force', worktreeDir]);
  if (result.status !== 0) {
    run('git', ['worktree', 'prune']);
    fs.rmSync(worktreeDir, { recursive: true, force: true });
  }
}

function worktreeDirFor(id) {
  return path.join(PATHS.WORKTREES_DIR, id);
}

/**
 * Runs Maven against `cwd`. This repo ships no `mvnw` wrapper, so `mvn` must be on PATH.
 * On Windows, `mvn.cmd` cannot be exec'd directly, so it goes through the shell.
 */
function runMaven(mvnArgs, options) {
  if (process.platform === 'win32') {
    return run('mvn.cmd', mvnArgs, { ...options, shell: true });
  }
  return run('mvn', mvnArgs, options);
}

const TAIL_CHARS = 4000;
function tail(text, n = TAIL_CHARS) {
  if (!text) return '';
  return text.length > n ? `…(truncated)…\n${text.slice(-n)}` : text;
}

const resultPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.result.json`);
const devNotesPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.dev-notes.json`);
const diffPathFor = (id) => path.join(PATHS.OUT_DIR, `dev_${id}.diff`);
const devReportPathFor = (id) => path.join(PATHS.OUT_DIR, `dev_${id}.md`);

module.exports = {
  ...PATHS,
  rel,
  readJsonIfPresent,
  parsePlanReport,
  listPlans,
  resolvePlan,
  listApprovedPlansWithoutReport,
  currentDevStatus,
  run,
  removeWorktreeIfPresent,
  worktreeDirFor,
  runMaven,
  tail,
  resultPathFor,
  devNotesPathFor,
  diffPathFor,
  devReportPathFor,
};
