/**
 * Build Gatekeeper — shared path resolution, development-report access, and the isolated build
 * sandbox. docs/agent_output/03-development/ is read-only input. Only .github/.pipeline-context/build/
 * and docs/agent_output/05-test-gate/ are written here.
 *
 * This skill has no agent-authored judgment file anywhere in its pipeline — every fact in its
 * report comes straight from a script. This repo is a single Maven module with no committed
 * `mvnw` wrapper, so `mvn` must be on PATH and every command runs at the worktree root.
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
  WORK_DIR: path.join(DATA_DIR, 'build'),
  WORKTREES_DIR: path.join(DATA_DIR, 'build', 'worktrees'),
  CHANGES_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '03-development'),
  OUT_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '05-test-gate'),
  OUT_README: path.join(REPO_ROOT, 'docs', 'agent_output', '05-test-gate', 'README.md'),
};

function rel(target) {
  return path.relative(REPO_ROOT, target).replace(/\\/g, '/');
}

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

// The build gate compiles independently, in its own isolated worktree, of the Developer's own
// compile check — it does not need that check to have already passed to be worth running. Only
// "Refused" (no diff captured at all) is excluded.
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

/** No `mvnw` is committed in this repo — `mvn` must be on PATH. See 03-developer/scripts/lib/developer.js. */
function runMaven(mvnArgs, options) {
  if (process.platform === 'win32') {
    // cmd.exe's /S quote-stripping only preserves a single outer quote pair; per-token quoting here
    // produces two+ pairs, so /S falls back to stripping just the outermost pair and mis-parses the
    // rest as one unrecognized token. A single unquoted, space-joined command avoids that.
    const command = ['mvn.cmd', ...mvnArgs].join(' ');
    return run('cmd.exe', ['/d', '/s', '/c', `"${command}"`], { ...options, windowsVerbatimArguments: true });
  }
  return run('mvn', mvnArgs, options);
}

/** Diffs two dependency:tree text blobs line by line — additions/removals only, order-insensitive. */
function diffDependencyTrees(before, after) {
  const clean = (t) => (t || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('+-') || l.startsWith('\\-') || /^[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+:/.test(l));
  const b = new Set(clean(before));
  const a = new Set(clean(after));
  return {
    added: [...a].filter((l) => !b.has(l)),
    removed: [...b].filter((l) => !a.has(l)),
  };
}

const TAIL_CHARS = 4000;
function tail(text, n = TAIL_CHARS) {
  if (!text) return '';
  return text.length > n ? `…(truncated)…\n${text.slice(-n)}` : text;
}

const resultPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.result.json`);
const reportPathFor = (id) => path.join(PATHS.OUT_DIR, `build_${id}.md`);

module.exports = {
  ...PATHS,
  rel,
  parseDevReport,
  listStep2Changes,
  resolveChange,
  run,
  removeWorktreeIfPresent,
  runMaven,
  diffDependencyTrees,
  tail,
  resultPathFor,
  reportPathFor,
};
