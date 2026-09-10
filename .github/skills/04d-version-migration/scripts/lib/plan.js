/**
 * Version Migration — the approval checkpoint.
 *
 * A migration changes every layer of a project at once, so the decision to start one is a human
 * decision. This module owns the mechanics of that: reading an already-rendered plan back to find
 * what the reviewer decided and what they wrote, so a re-render never overwrites a human's answer
 * and so the round scripts can refuse to change a version before one exists.
 *
 * The status lives in a table cell (`| **Status** | Approved |`) rather than in front matter, for
 * the same reason 04a-fix-strategist puts it there: the person approving reads the rendered
 * document, and the cell they have to edit is visible in the document they are already reading.
 *
 * The feedback block is delimited by HTML comments. Everything between them is the reviewer's,
 * and a re-render copies it forward verbatim into the review history — a plan revised in response
 * to feedback keeps the feedback that caused the revision, or the audit trail has a hole in it.
 */
const fs = require('fs');
const path = require('path');
const { OUT_DIR, sessionPaths, listSessions, readJson, rel } = require('./migration');

// The vocabulary. `Changes requested` is the one that makes the loop a loop rather than a gate
// with two ends: the reviewer says what is wrong, the agent revises, the plan is re-rendered.
const STATUSES = ['Proposed', 'Approved', 'Changes requested', 'Rejected'];

const STATUS_META = {
  Proposed: { emoji: '🟡', colour: 'E8A317', label: 'Proposed', blocks: true, note: 'Waiting on a human decision. No version will be changed while it reads this.' },
  Approved: { emoji: '🟢', colour: '3DA35B', label: 'Approved', blocks: false, note: 'The migration may proceed.' },
  'Changes requested': { emoji: '🟠', colour: 'E8590C', label: 'Changes requested', blocks: true, note: 'The reviewer asked for the plan to change. Revise it, re-render, and ask again.' },
  Rejected: { emoji: '🔴', colour: 'C92A2A', label: 'Rejected', blocks: true, note: 'This migration is not happening. Nothing further runs.' },
};

const statusMeta = (status) => STATUS_META[status] || { emoji: '⚪', colour: '868E96', label: status || 'unknown', blocks: true, note: 'Unrecognised status — treated as blocking.' };

const FEEDBACK_START = '<!-- REVIEWER FEEDBACK — write below this line; it is preserved across re-renders -->';
const FEEDBACK_END = '<!-- END REVIEWER FEEDBACK -->';
const HISTORY_START = '<!-- REVIEW HISTORY — appended by the renderer, do not hand-edit -->';
const HISTORY_END = '<!-- END REVIEW HISTORY -->';

const FEEDBACK_PLACEHOLDER = '_Nothing yet. Write here what you want changed, what you want to know, or what you are agreeing to — plain sentences are fine. Anything you write is carried into the migration record._';

// ---------------------------------------------------------------------------
// Reading a rendered plan back
// ---------------------------------------------------------------------------

/**
 * The Status cell is edited by hand, so read it forgivingly: match the status word wherever it sits
 * in the cell and in whatever case, so `approved`, `🟢 Approved` and `Approved — fine by me` all
 * mean the same thing. Longest name first, so "Changes requested" is never read as something
 * shorter. Anything unrecognised comes back verbatim and is treated as blocking — a cell nobody can
 * parse is not permission.
 */
function normaliseStatus(raw) {
  const text = String(raw === null || raw === undefined ? '' : raw).replace(/[*_`]/g, '').trim();
  const found = [...STATUSES]
    .sort((a, b) => b.length - a.length)
    .find((s) => new RegExp(`(^|[^a-z])${s.replace(/ /g, '\\s+')}([^a-z]|$)`, 'i').test(text));
  return found || text || 'unknown';
}

function between(text, start, end) {
  const from = text.indexOf(start);
  if (from === -1) return null;
  const to = text.indexOf(end, from + start.length);
  if (to === -1) return null;
  return text.slice(from + start.length, to).trim();
}

/**
 * Everything a script needs to know about a plan that is already on disk. `null` when no plan has
 * been rendered for this slug yet — which is itself the answer to "may the migration proceed".
 */
function readRenderedPlan(slug) {
  const file = sessionPaths(slug).planMd;
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');

  const statusCell = /\|\s*\*\*Status\*\*\s*\|\s*([^|]+)\|/.exec(text);
  const status = normaliseStatus(statusCell && statusCell[1]);

  const reviewer = (/\|\s*\*\*Reviewer\*\*\s*\|\s*([^|]+)\|/.exec(text) || [, ''])[1].trim();
  const decidedOn = (/\|\s*\*\*Decision date\*\*\s*\|\s*([^|]+)\|/.exec(text) || [, ''])[1].trim();
  const feedback = between(text, FEEDBACK_START, FEEDBACK_END);
  const history = between(text, HISTORY_START, HISTORY_END);
  const revision = Number((/\|\s*\*\*Revision\*\*\s*\|\s*([0-9]+)/.exec(text) || [, '1'])[1]);

  const meaningful = feedback && feedback !== FEEDBACK_PLACEHOLDER ? feedback : null;

  return {
    slug,
    file,
    status: status || 'unknown',
    approved: status === 'Approved',
    blocks: statusMeta(status).blocks,
    reviewer: reviewer && !/^_/.test(reviewer) ? reviewer : null,
    decided_on: decidedOn && !/^_/.test(decidedOn) ? decidedOn : null,
    feedback: meaningful,
    history,
    revision: Number.isFinite(revision) ? revision : 1,
  };
}

/**
 * The gate itself, in one call, so every script that must not run before approval refuses in
 * exactly the same words. `ok` is true only for a plan that exists and reads Approved.
 */
function approvalGate(slug) {
  const plan = readRenderedPlan(slug);
  const planFile = sessionPaths(slug).planMd;
  if (!plan) {
    return {
      ok: false,
      status: 'not written',
      reason: `No migration plan has been rendered for "${slug}".`,
      remedy: [
        'A migration is not started until a human has approved the plan for it.',
        `  1. node scripts/collect-graph-context.js --slug ${slug}`,
        `  2. write ${rel(sessionPaths(slug).plan)} per templates/plan.schema.json`,
        `  3. node scripts/render-migration-plan.js --slug ${slug}`,
        '  4. ask the reviewer to set the Status cell in the rendered plan to Approved',
      ].join('\n'),
    };
  }
  if (plan.approved) return { ok: true, status: plan.status, plan };
  return {
    ok: false,
    status: plan.status,
    plan,
    reason: `The migration plan for "${slug}" reads Status: ${plan.status}.`,
    remedy: plan.status === 'Changes requested'
      ? `The reviewer asked for changes. Read the feedback in ${rel(planFile)}, revise ${rel(sessionPaths(slug).plan)}, re-render, and ask again.`
      : plan.status === 'Rejected'
        ? `This migration was rejected. Nothing further runs. See ${rel(planFile)}.`
        : `Waiting on a human. They approve it by editing the Status cell in ${rel(planFile)} to Approved.`,
  };
}

/** Prints the standard refusal and sets a non-zero exit code. Used by every gated script. */
function refuse(gate, action) {
  console.error(`\n✗ Refusing to ${action}.`);
  console.error(`  ${gate.reason}`);
  console.error(`  ${gate.remedy.split('\n').join('\n  ')}`);
  if (gate.plan && gate.plan.feedback) {
    console.error('\n  The reviewer wrote:');
    for (const line of gate.plan.feedback.split(/\r?\n/)) console.error(`    ${line}`);
  }
  console.error('');
}

// ---------------------------------------------------------------------------
// The shared index block
//
// docs/agent_output/04-remediation/README.md is written by three renderers. The migration block
// belongs to this skill and holds both the plans and the reports, so it lives here rather than in
// either renderer — whichever one runs last regenerates the same block from the same scan.
// ---------------------------------------------------------------------------

const BLOCK_START = '<!-- AUTO-GENERATED MIGRATIONS — regenerated by 04_fix-generator (version migration), do not hand-edit between these markers -->';
const BLOCK_END = '<!-- END AUTO-GENERATED MIGRATIONS -->';
const FIX_INDEX_MARKER = '<!-- AUTO-GENERATED TABLE — regenerated by 04_fix-generator (plan + fix), do not hand-edit below this line -->';

function defaultReadmeContract() {
  return `# Remediation

Everything the **Fix Generator** agent (\`04_fix-generator\`) produces lives here.

`;
}

const cellFrom = (text, label, fallback) => (new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|\\s*([^|]+)\\|`).exec(text) || [, fallback])[1].trim();

/**
 * Every migration slug that has a plan, a report, or both.
 *
 * The report filename pattern is `migration_<slug>.md` and the plan's is
 * `migration_plan_<slug>.md`, so the report scan has to exclude the plan prefix explicitly —
 * otherwise a plan for `foo` is read as a report for `plan_foo`.
 */
function migrationRows() {
  const files = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR) : [];
  const rows = new Map();
  const rowFor = (slug) => {
    if (!rows.has(slug)) rows.set(slug, { slug, title: slug, plan: null, report: null });
    return rows.get(slug);
  };

  for (const name of files) {
    const planMatch = /^migration_plan_(.+)\.md$/.exec(name);
    if (planMatch) {
      const text = fs.readFileSync(path.join(OUT_DIR, name), 'utf8');
      const row = rowFor(planMatch[1]);
      row.plan = {
        status: normaliseStatus(cellFrom(text, 'Status', 'unknown')),
        revision: cellFrom(text, 'Revision', '1'),
        title: (/^# Migration Plan — (.+)$/m.exec(text) || [, null])[1],
      };
      if (row.plan.title) row.title = row.plan.title;
      continue;
    }
    const reportMatch = /^migration_(?!plan_)(.+)\.md$/.exec(name);
    if (!reportMatch) continue;
    const text = fs.readFileSync(path.join(OUT_DIR, name), 'utf8');
    const row = rowFor(reportMatch[1]);
    row.report = {
      result: cellFrom(text, 'Result', 'unknown'),
      rounds: cellFrom(text, 'Build rounds', '—'),
      files: cellFrom(text, 'Files changed', '—'),
      behaviour: cellFrom(text, 'Runtime behaviour', '_not probed_'),
      project: cellFrom(text, 'Project state', '_not applied_'),
      title: (/^# Migration Report — (.+)$/m.exec(text) || [, null])[1],
    };
    if (row.report.title) row.title = row.report.title;
  }

  return [...rows.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function migrationBlock() {
  const rows = migrationRows();
  const block = [BLOCK_START, '', '## Version migrations', ''];
  block.push('Framework-generation and language-level upgrades, written by the');
  block.push('[`04d-version-migration`](../../.github/skills/04d-version-migration/) skill. Each one is two');
  block.push('documents: a **plan**, written from the code graph before anything changes and gated on a human');
  block.push('approving it, and a **report** of how the migration actually went. A migration runs in a sandbox');
  block.push('copy of the project under `.github/.pipeline-context/version-migration/`, and finishes by writing');
  block.push('the result into the project and building it there. The **Project** column is that last step: a');
  block.push('migration that has not reached the project is not a finished migration.');
  block.push('');
  if (!rows.length) {
    block.push('_No migrations planned or rendered yet._', '');
  } else {
    block.push('| Migration | Plan | Result | Rounds | Files changed | Runtime behaviour | Project | Documents |', '|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      const planCell = r.plan ? `${statusMeta(r.plan.status).emoji} ${r.plan.status}${Number(r.plan.revision) > 1 ? ` (rev ${r.plan.revision})` : ''}` : '_none_';
      const links = [
        r.plan ? `[plan](./migration_plan_${r.slug}.md)` : null,
        r.report ? `[report](./migration_${r.slug}.md)` : null,
        r.report && fs.existsSync(path.join(OUT_DIR, `migration_${r.slug}.diff`)) ? `[patch](./migration_${r.slug}.diff)` : null,
      ].filter(Boolean).join(' · ') || '—';
      block.push(`| ${r.title} | ${planCell} | ${r.report ? r.report.result : '_not run_'} | ${r.report ? r.report.rounds : '—'} | ${r.report ? r.report.files : '—'} | ${r.report ? r.report.behaviour : '—'} | ${r.report ? r.report.project : '_not applied_'} | ${links} |`);
    }
    block.push('');
  }
  block.push(BLOCK_END);
  return block.join('\n');
}

/**
 * Rewrites only this skill's block in the shared README. 04a/04b keep everything before their own
 * marker and replace everything after it, so the migration block is always written above it and
 * survives their rewrites untouched.
 */
function rewriteIndex() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const readme = path.join(OUT_DIR, 'README.md');
  const existing = fs.existsSync(readme) ? fs.readFileSync(readme, 'utf8') : defaultReadmeContract();
  const block = migrationBlock();

  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  let next;
  if (start !== -1 && end !== -1 && end > start) {
    next = existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length);
  } else {
    const fixMarker = existing.indexOf(FIX_INDEX_MARKER);
    next = fixMarker !== -1
      ? `${existing.slice(0, fixMarker).trimEnd()}\n\n${block}\n\n${existing.slice(fixMarker)}`
      : `${existing.trimEnd()}\n\n${block}\n`;
  }
  fs.writeFileSync(readme, next);
  return readme;
}

/** Every session that has a plan.json written for it. */
function listPlannedSessions() {
  return listSessions().filter((slug) => readJson(sessionPaths(slug).plan));
}

module.exports = {
  STATUSES,
  STATUS_META,
  statusMeta,
  normaliseStatus,
  FEEDBACK_START,
  FEEDBACK_END,
  FEEDBACK_PLACEHOLDER,
  HISTORY_START,
  HISTORY_END,
  readRenderedPlan,
  approvalGate,
  refuse,
  migrationRows,
  migrationBlock,
  rewriteIndex,
  listPlannedSessions,
};
