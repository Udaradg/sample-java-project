/**
 * Verification Layer — shared path resolution and read-only access, used by all three Step 1
 * checks (acceptance-check, edge-case review, behavior guard). They share this one skill folder
 * because they read the exact same inputs; each still writes its own facts/verdict/report under
 * its own name so the three stay independently runnable and auditable.
 *
 * docs/agent_output/03-development/, docs/agent_output/02-story-analysis/ and
 * docs/agent_output/00-jira-stories/ are all READ-ONLY input here. The only files this skill
 * writes are under .github/.pipeline-context/verify/ and docs/agent_output/04-verify/.
 */
const fs = require('fs');
const path = require('path');
const register = require('../../../00-jira-story-register/scripts/lib/register');
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
  WORK_DIR: path.join(DATA_DIR, 'verify'),
  WORKTREES_DIR: path.join(DATA_DIR, 'verify', 'worktrees'),
  CHANGES_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '03-development'),
  PLANS_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '02-story-analysis'),
  STORIES_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '00-jira-stories'),
  OUT_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '04-verify'),
  OUT_README: path.join(REPO_ROOT, 'docs', 'agent_output', '04-verify', 'README.md'),
};

function rel(target) {
  return path.relative(REPO_ROOT, target).replace(/\\/g, '/');
}

function readIfPresent(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
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

// ---------------------------------------------------------------------------
// docs/agent_output/03-development/dev_<id>.md — the workload
// ---------------------------------------------------------------------------

function parseDevReport(text) {
  const title = /^##\s+\S+\s*—\s*(.+)$/m.exec(text);
  const status = /\|\s*\*\*Status\*\*\s*\|\s*([^|]+)\|/.exec(text);
  const planLink = /\|\s*\*\*Plan\*\*\s*\|\s*\[[^\]]*\]\((?:\.\.\/)+([^)]+)\)/.exec(text);
  const diffLink = /\|\s*\*\*Diff\*\*\s*\|\s*\[[^\]]*\]\((?:\.\.\/)+([^)]+)\)/.exec(text);
  const whatChanged = sectionBody(text, 'What changed');

  return {
    title: title ? title[1].trim() : '(untitled)',
    status: status ? status[1].trim() : 'unknown',
    planFile: planLink ? planLink[1].trim() : null,
    diffFile: diffLink ? diffLink[1].trim() : null,
    filesChanged: linkedPaths(whatChanged),
  };
}

// Step 1 (acceptance-check/edge-case-review/behavior-guard) is diff-and-source static analysis —
// it never invokes a compiler, so it does not need the Developer's own compile check to have
// passed. A Compile Failed change still has a real diff and real patched source to reason about,
// and is still real, reviewable evidence. "Refused" is excluded: the Developer never captured a
// diff at all, so there is nothing here to analyze.
const STEP1_ELIGIBLE_STATUSES = ['Compiled', 'Compile Failed'];

function listStep1Changes() {
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
    .filter((c) => STEP1_ELIGIBLE_STATUSES.includes(c.status))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function resolveChange(idOrPath) {
  if (!idOrPath) {
    throw new Error('Missing --story. Pass a story id (JIRA-001) or --all for every change in docs/agent_output/03-development/ that the Developer actually captured a diff for (Status: Compiled or Compile Failed).');
  }
  const all = listStep1Changes();
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
  throw new Error(
    `No development report for "${idOrPath}" in ${rel(PATHS.CHANGES_DIR)}. `
    + `Available (Compiled or Compile Failed): ${all.map((c) => c.id).join(', ') || 'none — run the Developer agent first'}`
  );
}

// ---------------------------------------------------------------------------
// Upstream chain: change -> plan -> story (all read-only)
// ---------------------------------------------------------------------------

function parsePlanReport(text) {
  const approach = sectionBody(text, 'Approach');
  const risks = sectionBody(text, 'Risks to watch');
  const criteriaPlan = sectionBody(text, 'Acceptance criteria plan');
  return {
    approach,
    riskNotes: risks ? risks.split(/\r?\n/).filter((l) => l.trim().startsWith('-') && !l.trim().startsWith('  -')).map((l) => l.replace(/^-\s*/, '').trim()) : [],
    criteriaPlanText: criteriaPlan,
  };
}

function readStoryForChange(id) {
  const story = register.readStory(PATHS.STORIES_DIR, id, rel);
  if (!story) return null;
  return {
    file: story.file,
    relativeFile: story.relativeFile,
    title: story.title,
    acceptanceCriteria: story.acceptanceCriteria,
    outOfScope: story.outOfScope,
    body: story.body,
  };
}

/** Walks change -> plan -> story, returning whatever resolves (never throws on a missing hop). */
function upstreamChainFor(change) {
  const chain = { plan: null, story: null };
  if (change.planFile) {
    const planPath = path.join(REPO_ROOT, change.planFile);
    const planText = readIfPresent(planPath);
    if (planText) chain.plan = { file: change.planFile, ...parsePlanReport(planText) };
  }
  chain.story = readStoryForChange(change.id);
  return chain;
}

// ---------------------------------------------------------------------------
// Isolated worktree — materialize the patched file content, read-only otherwise.
// ---------------------------------------------------------------------------

function run(cmd, args, options) {
  const result = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8', shell: false, ...options });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
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
 * Applies the change's diff inside a throwaway worktree, reads the given repo-relative files
 * from the result, then removes the worktree — always, even on failure. Never touches the real
 * tree. Returns { applied: boolean, files: { [path]: string|null }, error: string|null }.
 */
function materializePatchedFiles(id, diffFile, filePaths) {
  const worktreeDir = path.join(PATHS.WORKTREES_DIR, id);
  fs.mkdirSync(PATHS.WORKTREES_DIR, { recursive: true });
  removeWorktreeIfPresent(worktreeDir);

  try {
    const add = run('git', ['worktree', 'add', '--detach', worktreeDir, 'HEAD']);
    if (add.status !== 0) return { applied: false, files: {}, error: `worktree add failed: ${add.stderr || add.stdout}` };

    const apply = run('git', ['apply', path.resolve(diffFile)], { cwd: worktreeDir });
    if (apply.status !== 0) return { applied: false, files: {}, error: `git apply failed: ${apply.stderr || apply.stdout}` };

    const files = {};
    for (const p of filePaths) {
      const abs = path.join(worktreeDir, p);
      files[p] = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    }
    return { applied: true, files, error: null };
  } finally {
    removeWorktreeIfPresent(worktreeDir);
  }
}

// ---------------------------------------------------------------------------
// Path helpers for this skill's own intermediate/output files
// ---------------------------------------------------------------------------

const factsPathFor = (id, name) => path.join(PATHS.WORK_DIR, `${id}.${name}.facts.json`);
const briefingPathFor = (id, name) => path.join(PATHS.WORK_DIR, `${id}.${name}.facts.md`);
const verdictPathFor = (id, name) => path.join(PATHS.WORK_DIR, `${id}.${name}.verdict.json`);
const reportPathFor = (id, prefix) => path.join(PATHS.OUT_DIR, `${prefix}_${id}.md`);

// ---------------------------------------------------------------------------
// docs/agent_output/04-verify/README.md — one combined index shared by all three renderers.
// ---------------------------------------------------------------------------

const VERIFY_INDEX_MARKER = '<!-- AUTO-GENERATED TABLE — regenerated by 04_existing-app-test-agent, do not hand-edit below this line -->';

function verifyReadmeContract() {
  return `# Step 04 — Multi-layer Verification

Three parallel, static/reasoning-based checks run against every change in
[\`docs/agent_output/03-development/\`](../03-development/) that the Developer actually captured a diff
for (\`Status: Compiled\` **or** \`Compile Failed\` — a failed compile doesn't stop this stage, since
none of these three checks invoke a compiler): **acceptance-check** (does every acceptance
criterion the story listed actually hold in the patched code?), **edge-case review** (does the
change survive boundary/error conditions and inputs the plan didn't explicitly cover?), and
**behavior guard** (did real behavior change beyond what the plan intended?) — all run by
\`04_existing-app-test-agent\`.

None of them run a live database or a deployed instance — this repo has no embedded-database
test dependency, so all three reason over the diff, the pre-change source, and the patched source
materialized inside a throwaway \`git worktree\`.

Reports land here as \`acceptance_<id>.md\`, \`edgecase_<id>.md\`, \`behavior_<id>.md\`. The **merge
arbiter** (Phase C step 3) reads all three; none of them alone decides whether a change ships.

`;
}

function readVerdict(prefix, id) {
  const file = path.join(PATHS.OUT_DIR, `${prefix}_${id}.md`);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const m = /\|\s*\*\*Verdict\*\*\s*\|\s*([^|]+)\|/.exec(text);
  return m ? m[1].trim() : 'unknown';
}

/** Combines acceptance/edgecase/behavior results for every change into one table. */
function rewriteVerifyIndex() {
  if (!fs.existsSync(PATHS.OUT_DIR)) return;
  const ids = new Set();
  for (const f of fs.readdirSync(PATHS.OUT_DIR)) {
    const m = /^(?:acceptance|edgecase|behavior)_(.+)\.md$/i.exec(f);
    if (m) ids.add(m[1]);
  }
  const rows = [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((id) => {
    const anyFile = ['acceptance', 'edgecase', 'behavior']
      .map((p) => path.join(PATHS.OUT_DIR, `${p}_${id}.md`))
      .find((f) => fs.existsSync(f));
    const title = anyFile ? (/^##\s+(.+)$/m.exec(fs.readFileSync(anyFile, 'utf8')) || [])[1] : null;
    return {
      id,
      title: (title || '(untitled)').trim(),
      acceptance: readVerdict('acceptance', id) || '_pending_',
      edgecase: readVerdict('edgecase', id) || '_pending_',
      behavior: readVerdict('behavior', id) || '_pending_',
    };
  });

  const existing = fs.existsSync(PATHS.OUT_README) ? fs.readFileSync(PATHS.OUT_README, 'utf8') : verifyReadmeContract();
  const contract = existing.includes(VERIFY_INDEX_MARKER) ? existing.slice(0, existing.indexOf(VERIFY_INDEX_MARKER)) : existing.trimEnd() + '\n\n';
  const table = [VERIFY_INDEX_MARKER, ''];
  if (!rows.length) table.push('_No Step 1 reports yet._', '');
  else {
    table.push('| Story | Title | Acceptance | Edge-case | Behavior |', '|---|---|---|---|---|');
    for (const r of rows) table.push(`| ${r.id} | ${r.title} | ${r.acceptance} | ${r.edgecase} | ${r.behavior} |`);
    table.push('');
  }
  fs.mkdirSync(PATHS.OUT_DIR, { recursive: true });
  fs.writeFileSync(PATHS.OUT_README, contract.trimEnd() + '\n\n' + table.join('\n'));
}

module.exports = {
  ...PATHS,
  rel,
  readIfPresent,
  sectionBody,
  linkedPaths,
  parseDevReport,
  listStep1Changes,
  resolveChange,
  upstreamChainFor,
  materializePatchedFiles,
  factsPathFor,
  briefingPathFor,
  verdictPathFor,
  reportPathFor,
  rewriteVerifyIndex,
};
