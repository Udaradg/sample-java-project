/**
 * JIRA story register — the pipeline's single input, read straight from the markdown
 * story files under docs/agent_output/00-jira-stories/.
 *
 * Unlike the vulnerability pipeline's Excel issue register, a brownfield story is
 * already a human-authored markdown document (`jira-story-<NNN>.md`) — there is no
 * spreadsheet round-trip needed, so this module just parses the one fixed shape every
 * story file follows: an H1 title line, a `| Field | Value |` metadata table, and a
 * fixed set of `## Section` headings.
 *
 * The register is READ-ONLY input. Whoever files the story owns that file; nothing in
 * this pipeline writes to `docs/agent_output/00-jira-stories/jira-story-*.md`.
 */
const fs = require('fs');
const path = require('path');

const FILE_PATTERN = /^jira-story-(.+)\.md$/i;

/** Metadata table label -> story field. Matched case-insensitively, bold markers stripped. */
const METADATA_FIELDS = {
  type: 'type',
  priority: 'priority',
  status: 'status',
  component: 'component',
  'reported by': 'reportedBy',
  'reported on': 'reportedOn',
  labels: 'labels',
};

const SECTIONS = [
  ['summary', 'Summary'],
  ['description', 'Description'],
  ['acceptanceCriteria', 'Acceptance Criteria'],
  ['outOfScope', 'Out of Scope'],
  ['risks', 'Risks / Notes for Implementation'],
];

/** Pulls `# JIRA-001 — Title` into { id, title }. Falls back to the filename stem. */
function parseTitleLine(text, fallbackId) {
  const m = /^#\s+(\S+)\s*(?:[—-]\s*(.+))?$/m.exec(text);
  if (!m) return { id: fallbackId, title: '(untitled)' };
  return { id: m[1].trim(), title: (m[2] || '(untitled)').trim() };
}

/** Parses the `| Field | Value |` metadata table into a flat object. */
function parseMetadataTable(text) {
  const out = {};
  const re = /^\|\s*\*\*([^*|]+)\*\*\s*\|\s*(.+?)\s*\|\s*$/gm;
  let m;
  while ((m = re.exec(text))) {
    const label = m[1].trim().toLowerCase();
    const field = METADATA_FIELDS[label];
    if (field) out[field] = m[2].trim();
  }
  return out;
}

function sectionBody(text, heading) {
  const re = new RegExp(`##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s|$)`);
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

/**
 * Numbered (`1.`) or bulleted (`-`) list items from a section body, including any wrapped
 * continuation lines (indented or not) that belong to the same item — a plain markdown list
 * item does not have to fit on one line.
 */
function listItems(sectionText) {
  if (!sectionText) return [];
  const out = [];
  const lines = sectionText.split(/\r?\n/);
  const itemStart = /^\s*(?:\d+\.|[-*])\s+(.+)$/;
  let current = null;
  for (const line of lines) {
    const m = itemStart.exec(line);
    if (m) {
      if (current !== null) out.push(current.trim());
      current = m[1];
    } else if (current !== null && line.trim()) {
      current += ` ${line.trim()}`;
    } else if (current !== null && !line.trim()) {
      out.push(current.trim());
      current = null;
    }
  }
  if (current !== null) out.push(current.trim());
  return out;
}

function splitList(cell) {
  if (!cell) return [];
  return String(cell)
    .split(/\r?\n|,/)
    .map((v) => v.trim().replace(/^[-*•]\s*/, ''))
    .filter(Boolean);
}

function toStory(file, relFile, text) {
  const fallbackId = path.basename(file).replace(/\.md$/i, '');
  const { id, title } = parseTitleLine(text, fallbackId);
  const meta = parseMetadataTable(text);

  const sections = {};
  for (const [field, heading] of SECTIONS) sections[field] = sectionBody(text, heading);

  return {
    id,
    title,
    type: meta.type || null,
    priority: meta.priority || null,
    status: meta.status || null,
    component: meta.component || null,
    reportedBy: meta.reportedBy || null,
    reportedOn: meta.reportedOn || null,
    labels: splitList(meta.labels),
    summary: sections.summary,
    description: sections.description,
    acceptanceCriteria: listItems(sections.acceptanceCriteria),
    outOfScope: listItems(sections.outOfScope),
    risks: sections.risks,
    body: text,
    file,
    relativeFile: relFile,
  };
}

/** Every story under `storiesDir`, sorted by id. `README.md` is not a story and is skipped. */
function listStories(storiesDir, relFn) {
  if (!fs.existsSync(storiesDir)) return [];
  return fs
    .readdirSync(storiesDir)
    .filter((f) => FILE_PATTERN.test(f))
    .map((name) => {
      const file = path.join(storiesDir, name);
      const relFile = relFn ? relFn(file) : file;
      const text = fs.readFileSync(file, 'utf8');
      if (!text.trim()) return null;
      return toStory(file, relFile, text);
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** One story by id (e.g. `JIRA-001`) or by filename stem (`jira-story-001`), or null. */
function readStory(storiesDir, storyId, relFn) {
  if (!storyId) return null;
  const stories = listStories(storiesDir, relFn);
  const needle = String(storyId).toLowerCase();
  return (
    stories.find((s) => s.id.toLowerCase() === needle)
    || stories.find((s) => path.basename(s.file).toLowerCase() === `jira-story-${needle.replace(/^jira-/, '')}.md`)
    || null
  );
}

/** Like readStory, but throws a message naming what is actually available. */
function resolveStory(storiesDir, storyId, relFn) {
  if (!storyId) {
    throw new Error('Missing --story. Pass a story id (JIRA-001) or --all for every story in the register.');
  }
  const story = readStory(storiesDir, storyId, relFn);
  if (story) return story;
  const stories = listStories(storiesDir, relFn);
  throw new Error(
    `No story "${storyId}" in ${storiesDir}. `
    + `Available: ${stories.map((s) => s.id).join(', ') || 'none — the register is empty'}`
  );
}

module.exports = {
  FILE_PATTERN,
  METADATA_FIELDS,
  SECTIONS,
  listStories,
  readStory,
  resolveStory,
};
