const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const MANIFEST_FILE = path.join(REPO_ROOT, '.github', 'spring-upgrade', 'upgrade-manifest.json');
const DATA_DIR = process.env.PIPELINE_CONTEXT_DATA_DIR
  ? path.resolve(process.env.PIPELINE_CONTEXT_DATA_DIR)
  : path.join(REPO_ROOT, '.github', '.pipeline-context', 'spring-upgrade');
const SERVICES = [
  'configuaration-server',
  'discovery-service',
  'department-service',
  'employee-service',
  'report-service',
  'sheduler-service',
];

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    ...options,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : null,
  };
}

function extractTag(xml, tag) {
  const match = new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(xml);
  return match ? match[1].trim() : null;
}

function versionParts(version) {
  return String(version || '').split(/[.-]/).map((part) => Number.parseInt(part, 10)).map((part) => Number.isNaN(part) ? 0 : part);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  }
  return 0;
}

module.exports = {
  REPO_ROOT,
  MANIFEST_FILE,
  DATA_DIR,
  SERVICES,
  readManifest,
  ensureDataDir,
  run,
  extractTag,
  compareVersions,
};
