#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  REPO_ROOT, DATA_DIR, SERVICES, ensureDataDir, run,
} = require('./lib/common');

const serviceArgIndex = process.argv.indexOf('--service');
const requestedService = serviceArgIndex >= 0 ? process.argv[serviceArgIndex + 1] : null;
const services = requestedService ? [requestedService] : SERVICES;
if (services.some((service) => !SERVICES.includes(service))) {
  console.error(`Unknown service. Choose one of: ${SERVICES.join(', ')}`);
  process.exitCode = 1;
  return;
}

ensureDataDir();
const results = services.map((service) => {
  const wrapper = process.platform === 'win32' ? 'mvnw.cmd' : './mvnw';
  const git = process.platform === 'win32' ? 'git.exe' : 'git';
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), `spring-verify-${service}-`));
  let command;
  let patchApplied = false;
  try {
    const worktreeResult = run(git, ['worktree', 'add', '--detach', worktree, 'HEAD']);
    if (worktreeResult.status !== 0) {
      command = worktreeResult;
    } else {
      const patch = path.join(DATA_DIR, service, 'openrewrite.patch.diff');
      const patchResult = fs.existsSync(patch)
        ? run(git, ['apply', '--binary', patch], { cwd: worktree })
        : { status: 1, stdout: '', stderr: `Missing OpenRewrite patch: ${patch}`, error: null };
      patchApplied = patchResult.status === 0;
      command = patchApplied
        ? run(process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : wrapper,
          process.platform === 'win32' ? ['/d', '/c', wrapper, '-B', 'verify'] : ['-B', 'verify'],
          { cwd: path.join(worktree, service) })
        : patchResult;
    }
  } finally {
    run(git, ['worktree', 'remove', '--force', worktree]);
  }
  return {
    service,
    command: `${wrapper} -B verify`,
    patchApplied,
    status: command.status === 0 ? 'passed' : 'failed',
    exitCode: command.status,
    error: command.error,
    stdout: command.stdout,
    stderr: command.stderr,
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  passed: results.filter((item) => item.status === 'passed').length,
  failed: results.filter((item) => item.status === 'failed').length,
  services: results,
};
fs.writeFileSync(path.join(DATA_DIR, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(DATA_DIR, 'verification.md'), [
  '# Spring Upgrade Verification',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '| Service | Status | Exit code |',
  '|---|---|---|',
  ...results.map((item) => `| ${item.service} | ${item.status} | ${item.exitCode === null ? 'not started' : item.exitCode} |`),
  '',
].join('\n'));
console.log(`Verified ${services.length} service(s): ${report.passed} passed, ${report.failed} failed.`);
if (report.failed) process.exitCode = 1;
