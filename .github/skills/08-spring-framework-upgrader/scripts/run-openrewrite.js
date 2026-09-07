#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  REPO_ROOT, DATA_DIR, SERVICES, readManifest, ensureDataDir, run,
} = require('./lib/common');

const serviceArgIndex = process.argv.indexOf('--service');
const service = serviceArgIndex >= 0 ? process.argv[serviceArgIndex + 1] : null;
if (!service || !SERVICES.includes(service)) {
  console.error(`Usage: node scripts/run-openrewrite.js --service <service>\nServices: ${SERVICES.join(', ')}`);
  process.exitCode = 1;
  return;
}

const manifest = readManifest();
const target = manifest.target || {};
const rewrite = manifest.openRewrite || {};
if (!target.springBoot || !target.springCloud || !rewrite.recipeVersion || !rewrite.recipe) {
  console.error('Refusing rewrite: validate-target.js must pass with an explicit target and pinned recipe.');
  process.exitCode = 1;
  return;
}

ensureDataDir();
const serviceDataDir = path.join(DATA_DIR, service);
fs.mkdirSync(serviceDataDir, { recursive: true });
const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-upgrade-'));
const git = process.platform === 'win32' ? 'git.exe' : 'git';
const result = {
  startedAt: new Date().toISOString(),
  service,
  worktree,
  recipe: rewrite.recipe,
  status: 'failed',
};
try {
  let command = run(git, ['worktree', 'add', '--detach', worktree, 'HEAD']);
  if (command.status !== 0) throw new Error(command.stderr || command.error || 'git worktree add failed');
  const args = [
    `org.openrewrite.maven:rewrite-maven-plugin:${rewrite.pluginVersion}:run`,
    `-Drewrite.recipeArtifactCoordinates=${rewrite.recipeArtifact}:${rewrite.recipeVersion}`,
    `-Drewrite.activeRecipes=${rewrite.recipe}`,
    '-Drewrite.exportDatatables=true',
  ];
  const wrapper = process.platform === 'win32' ? 'mvnw.cmd' : './mvnw';
  const executable = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : wrapper;
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/c', wrapper, ...args]
    : args;
  command = run(executable, commandArgs, {
    cwd: path.join(worktree, service),
  });
  result.command = `${executable} ${commandArgs.join(' ')}`;
  result.stdout = command.stdout;
  result.stderr = command.stderr;
  result.status = command.status === 0 ? 'completed' : 'failed';
  if (command.status === 0) {
    const diff = run(git, ['diff', '--binary', 'HEAD', '--'], { cwd: worktree });
    fs.writeFileSync(path.join(serviceDataDir, 'openrewrite.patch.diff'), diff.stdout);
    result.patch = path.relative(REPO_ROOT, path.join(serviceDataDir, 'openrewrite.patch.diff'));
  }
} finally {
  run(git, ['worktree', 'remove', '--force', worktree]);
  fs.writeFileSync(path.join(serviceDataDir, 'openrewrite-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(`OpenRewrite ${service}: ${result.status}.`);
if (result.status !== 'completed') process.exitCode = 1;
