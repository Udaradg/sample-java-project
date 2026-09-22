/**
 * Story / Impact Analyst — shared path resolution and read-only access.
 *
 * docs/agent_output/00-jira-stories/ is read-only input here, read through
 * 00-jira-story-register. The Architect's artifacts.json and context/descriptions.json are also
 * read-only — this skill never writes to the knowledge graph or its source files.
 * The only files this skill writes are under .github/.pipeline-context/analysis/ and
 * docs/agent_output/02-story-analysis/.
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
  WORK_DIR: path.join(DATA_DIR, 'analysis'),
  STORIES_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '00-jira-stories'),
  ARTIFACTS_FILE: path.join(DATA_DIR, 'artifacts.json'),
  DESCRIPTIONS_FILE: path.join(DATA_DIR, 'context', 'descriptions.json'),
  OUT_DIR: path.join(REPO_ROOT, 'docs', 'agent_output', '02-story-analysis'),
  OUT_README: path.join(REPO_ROOT, 'docs', 'agent_output', '02-story-analysis', 'README.md'),
};

function rel(target) {
  return path.relative(REPO_ROOT, target).replace(/\\/g, '/');
}

function readJsonIfPresent(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listStories() {
  return register.listStories(PATHS.STORIES_DIR, rel);
}

function resolveStory(id) {
  return register.resolveStory(PATHS.STORIES_DIR, id, rel);
}

/** Reads a rendered plan's Status field, or null if no plan has been rendered yet. */
function currentPlanStatus(id) {
  const file = planReportPathFor(id);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const m = /\|\s*\*\*Status\*\*\s*\|\s*([^|]+)\|/.exec(text);
  return m ? m[1].trim() : null;
}

/**
 * Every symbol whose name, file path, or evidence text mentions any of the given keywords.
 * Deliberately simple substring matching — this is a starting point for the agent's own
 * reading, not a claim of completeness. Matches against `artifacts.types` (classes/interfaces,
 * as produced by Code Cartographer) and each type's own `methods` array, since artifacts.json has
 * no separate top-level classes/methods/endpoints arrays.
 */
function findRelatedArtifacts(artifacts, keywords) {
  if (!artifacts || !keywords.length) return [];
  const needles = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  const matches = [];
  for (const type of artifacts.types || []) {
    const typeHaystack = `${type.id || ''} ${type.name || ''} ${type.file || ''}`.toLowerCase();
    if (needles.some((n) => typeHaystack.includes(n))) {
      matches.push({ kind: type.kind || 'type', id: type.id || type.name, name: type.name, file: type.file || null });
    }
    for (const method of type.methods || []) {
      const restAnnotations = (method.annotations || []).filter((a) => /Mapping$/.test(a.name || ''));
      const methodHaystack = `${type.name || ''}.${method.name || ''}`.toLowerCase();
      if (needles.some((n) => methodHaystack.includes(n))) {
        matches.push({
          kind: restAnnotations.length ? 'endpoint' : 'method',
          id: `${type.name}.${method.name}`,
          name: restAnnotations.length ? `${restAnnotations[0].name} ${type.name}.${method.name}` : `${type.name}.${method.name}`,
          file: type.file || null,
        });
      }
    }
  }
  return matches;
}

function findRelatedContext(descriptions, keywords) {
  if (!descriptions || !keywords.length) return [];
  const needles = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  const entries = Array.isArray(descriptions) ? descriptions : Object.values(descriptions || {});
  return entries.filter((entry) => {
    const haystack = JSON.stringify(entry).toLowerCase();
    return needles.some((n) => haystack.includes(n));
  });
}

const factsPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.facts.json`);
const briefingPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.facts.md`);
const planPathFor = (id) => path.join(PATHS.WORK_DIR, `${id}.plan.json`);
const planReportPathFor = (id) => path.join(PATHS.OUT_DIR, `plan_${id}.md`);

module.exports = {
  ...PATHS,
  rel,
  readJsonIfPresent,
  listStories,
  resolveStory,
  currentPlanStatus,
  findRelatedArtifacts,
  findRelatedContext,
  factsPathFor,
  briefingPathFor,
  planPathFor,
  planReportPathFor,
};
