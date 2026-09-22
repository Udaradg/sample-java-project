/**
 * QA Runner — shared path resolution, development-report access, and the isolated
 * test-execution sandbox. docs/agent_output/03-development/ is read-only input. The only files
 * this skill writes are under .github/.pipeline-context/qa/ and docs/agent_output/05-test-gate/.
 *
 * This repo is a single Maven module with no committed `mvnw` wrapper, so `mvn` must be on PATH
 * and every command runs at the worktree root — there is no per-module subdirectory to resolve.
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
  WORK_DIR: path.join(DATA_DIR, 'qa'),
  WORKTREES_DIR: path.join(DATA_DIR, 'qa', 'worktrees'),
  CHANGES_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '03-development'),
  OUT_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '05-test-gate'),
  OUT_README: path.join(REPO_ROOT, 'docs', 'agent_output', '05-test-gate', 'README.md'),
};

function rel(target) {
  return path.relative(REPO_ROOT, target).replace(/\\/g, '/');
}

function readIfPresent(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

// ---------------------------------------------------------------------------
// docs/agent_output/03-development/dev_<id>.md — same parser pattern as 04-verify, duplicated
// ---------------------------------------------------------------------------

function sectionBody(text, headingPattern) {
  const re = new RegExp(`##\\s+\\d*\\.?\\s*${headingPattern}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s|$)`);
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

function linkedPaths(sectionText) {
  if (!sectionText) return [];
  const out = [];
  const re = /\]\((?:\.\.\/)+([^)]+)\)/g;
  let m;
  while ((m = re.exec(sectionText))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

function parseDevReport(text) {
  const title = /^##\s+\S+\s*—\s*(.+)$/m.exec(text);
  const status = /\|\s*\*\*Status\*\*\s*\|\s*([^|]+)\|/.exec(text);
  const diffLink = /\|\s*\*\*Diff\*\*\s*\|\s*\[[^\]]*\]\((?:\.\.\/)+([^)]+)\)/.exec(text);
  const whatChanged = sectionBody(text, 'What changed');
  return {
    title: title ? title[1].trim() : '(untitled)',
    status: status ? status[1].trim() : 'unknown',
    diffFile: diffLink ? diffLink[1].trim() : null,
    filesChanged: linkedPaths(whatChanged),
  };
}

// The QA gate runs its own independent test attempt in its own isolated worktree, separate from
// the Developer's own compile check — it does not need that check to have already passed, and a
// Compile Failed change still has a real diff to draft a real test against. Only "Refused" (no
// diff captured at all) is excluded.
const STEP2_ELIGIBLE_STATUSES = ['Compiled', 'Compile Failed'];

function listStep2Changes() {
  if (!fs.existsSync(PATHS.CHANGES_DIR)) return [];
  return fs
    .readdirSync(PATHS.CHANGES_DIR)
    .filter((f) => /^dev_.+\.md$/i.test(f))
    .map((name) => {
      const file = path.join(PATHS.CHANGES_DIR, name);
      const id = name.replace(/^dev_/i, '').replace(/\.md$/i, '');
      const parsed = parseDevReport(fs.readFileSync(file, 'utf8'));
      return { id, devReportFile: file, relativeDevReportFile: rel(file), ...parsed };
    })
    .filter((c) => STEP2_ELIGIBLE_STATUSES.includes(c.status))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function resolveChange(idOrPath) {
  if (!idOrPath) throw new Error('Missing --story. Pass a story id (JIRA-001) or --all for every change with a captured diff (Compiled or Compile Failed).');
  const all = listStep2Changes();
  const byId = all.find((c) => c.id.toLowerCase() === String(idOrPath).toLowerCase());
  if (byId) return byId;
  if (fs.existsSync(PATHS.CHANGES_DIR)) {
    const name = fs.readdirSync(PATHS.CHANGES_DIR).find((f) => f.toLowerCase() === `dev_${String(idOrPath).toLowerCase()}.md`);
    if (name) {
      const file = path.join(PATHS.CHANGES_DIR, name);
      const parsed = parseDevReport(fs.readFileSync(file, 'utf8'));
      return { id: idOrPath, devReportFile: file, relativeDevReportFile: rel(file), ...parsed };
    }
  }
  throw new Error(`No development report for "${idOrPath}". Available (Compiled or Compile Failed): ${all.map((c) => c.id).join(', ') || 'none — run the Developer agent first'}`);
}

// ---------------------------------------------------------------------------
// git / maven — no mvnw wrapper is committed in this repo, so `mvn` must be on PATH.
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

/**
 * Runs Maven against `cwd`. On Windows, `mvn.cmd` cannot be exec'd directly, so it goes through
 * `cmd.exe /d /s /c` with every argument individually quoted (see 03-developer/scripts/lib/developer.js
 * for the same fix, and why it's needed for repo paths containing spaces).
 */
function runMaven(mvnArgs, options) {
  if (process.platform === 'win32') {
    const command = ['mvn.cmd', ...mvnArgs].map((a) => `"${a}"`).join(' ');
    return run('cmd.exe', ['/d', '/s', '/c', `"${command}"`], { ...options, windowsVerbatimArguments: true });
  }
  return run('mvn', mvnArgs, options);
}

function changedFilesFromPatch(patchText) {
  const files = new Set();
  const re = /^(?:\+\+\+|---)\s+(?:(?:a|b)\/)?(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(patchText))) {
    const p = m[1].trim();
    if (p && p !== '/dev/null') files.add(p.replace(/\\/g, '/'));
  }
  return [...files];
}

const TAIL_CHARS = 4000;
function tail(text, n = TAIL_CHARS) {
  if (!text) return '';
  return text.length > n ? `…(truncated)…\n${text.slice(-n)}` : text;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const testPlanPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.test-plan.json`);
const testDiffPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.new-test.diff`);
const resultPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.result.json`);
const reportPathFor = (id) => path.join(PATHS.OUT_DIR, `qa_${id}.md`);

module.exports = {
  ...PATHS,
  rel,
  readIfPresent,
  parseDevReport,
  listStep2Changes,
  resolveChange,
  run,
  removeWorktreeIfPresent,
  runMaven,
  changedFilesFromPatch,
  tail,
  testPlanPathFor,
  testDiffPathFor,
  resultPathFor,
  reportPathFor,
};
