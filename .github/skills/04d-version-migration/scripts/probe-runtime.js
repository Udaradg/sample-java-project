#!/usr/bin/env node
/**
 * Version Migration — runtime probe (run twice: before and after).
 *
 * A migration that compiles is not a migration that works. This script packages the sandbox
 * workspace on a chosen JDK, starts the application, waits for it to answer, replays a fixed
 * list of HTTP requests, records exactly what came back, and stops the process again.
 *
 * Run it once on the source JDK before touching anything (`--phase baseline`) and once on the
 * target JDK when the build is green (`--phase final`). The report compares the two request by
 * request — that comparison is the only evidence in this skill that behaviour was preserved.
 * A third phase, `applied`, re-runs the same probes against the real project once the migration
 * has been written into it, so "the project is migrated" is a measured claim and not an inference
 * from the sandbox.
 *
 * Two phases are gated — they must come back clean or the run stops:
 *   - `baseline`, because a migration cannot be measured against an application that was already
 *     failing before anything changed;
 *   - `applied`, because the project is only finished when the migrated project itself answers.
 * `final` is never gated: it is evidence to be compared, and a difference there is a finding for
 * the report to explain rather than a reason to abort.
 *
 * Probes are supplied by the agent, which reads the application's own routes first. The
 * default set is a bare liveness check and is not a substitute for real endpoints. A probe may
 * carry an `expect_status`, which the gated phases check.
 *
 * Usage:
 *   node scripts/probe-runtime.js --slug <slug> --phase baseline --jdk 17 --probes probes.json
 *   node scripts/probe-runtime.js --slug <slug> --phase final --jdk 21 --probes probes.json
 *   node scripts/probe-runtime.js --slug <slug> --phase applied --jdk 21 --target project --probes probes.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const {
  sessionPaths, readJson, writeJson, rel, runTool, run, tail, IS_WIN,
  resolveJdk, envForJdk, resolveBuildTool, buildArgs, stripRootFromText,
} = require('./lib/migration');

const DEFAULT_PROBES = {
  base_url: 'http://localhost:8080',
  readiness: { path: '/actuator/health', timeout_seconds: 120 },
  requests: [{ name: 'liveness', method: 'GET', path: '/actuator/health' }],
};

// Phases whose result is a gate rather than a measurement: they have to come back clean.
const GATED_PHASES = ['baseline', 'applied'];
const PHASES = ['baseline', 'final', 'applied'];
const TARGETS = ['workspace', 'project'];

function parseArgs(argv) {
  const args = { phase: 'baseline', port: 8080, appArgs: [], target: 'workspace' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slug' || a === '-s') args.slug = argv[++i];
    else if (a === '--phase') args.phase = argv[++i];
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--jdk' || a === '-j') args.jdk = argv[++i];
    else if (a === '--probes' || a === '-p') args.probes = argv[++i];
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--no-port-arg') args.noPortArg = true;
    else if (a === '--arg') args.appArgs.push(argv[++i]);
    else if (a === '--rebuild') args.rebuild = true;
    else if (a === '--timeout') args.timeout = Number(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Version Migration — Runtime probe

  node scripts/probe-runtime.js --slug <slug> --phase <baseline|final|applied> --jdk <major> [--probes <file>]

Options:
  --slug, -s      Session name
  --phase         baseline (before migrating), final (after the build is green), or applied
                  (against the real project once the migration has been written into it).
                  baseline and applied are gates: every probe must answer as expected
  --target        workspace (the sandbox, default) or project (the real project directory)
  --jdk, -j       JDK major version to run the application on
  --probes, -p    JSON file of requests to replay. Default: a single liveness check
  --port          Port to run and probe on (default 8080)
  --no-port-arg   Do not pass --server.port to the application
  --arg           Extra application argument, repeatable
  --rebuild       Repackage even if a jar already exists
  --timeout       Seconds to wait for the app to answer (default from probes, else 120)
  --help, -h      Show this message

Probe file shape:
  {
    "base_url": "http://localhost:8080",
    "auth": { "type": "basic", "username": "demo", "password": "demo123" },
    "readiness": { "path": "/actuator/health", "timeout_seconds": 120 },
    "requests": [
      { "name": "list employees", "method": "GET", "path": "/api/v1/employees", "expect_status": 200 },
      { "name": "unauthenticated is rejected", "method": "GET", "path": "/api/v1/employees", "no_auth": true, "expect_status": 401 },
      { "name": "create employee", "method": "POST", "path": "/api/v1/employees",
        "headers": { "Content-Type": "application/json" }, "body": { "firstName": "A" } }
    ]
  }`);
}

function findArtifact(workspace, tool) {
  const dirs = tool === 'gradle'
    ? [path.join(workspace, 'build', 'libs')]
    : [path.join(workspace, 'target')];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const jars = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.jar') && !/(\.original|-sources|-javadoc|-plain)\.jar$/.test(f))
      .map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
    if (jars.length) return jars[0];
  }
  return null;
}

function hashBody(text) {
  return crypto.createHash('sha256').update(String(text || '').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
}

function authHeader(auth) {
  if (!auth || auth.type !== 'basic') return {};
  const token = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function attempt(url, options) {
  try {
    const response = await fetch(url, options);
    const body = await response.text();
    return {
      ok: true,
      status: response.status,
      content_type: response.headers.get('content-type'),
      body_length: body.length,
      body_hash: hashBody(body),
      body_excerpt: body.length > 1500 ? `${body.slice(0, 1500)}…` : body,
    };
  } catch (error) {
    return { ok: false, status: null, error: error.message };
  }
}

function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  if (IS_WIN) run('taskkill', ['/PID', String(child.pid), '/T', '/F']);
  else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  if (!args.slug) {
    console.error('--slug is required.');
    process.exitCode = 1;
    return;
  }
  if (!PHASES.includes(args.phase)) {
    console.error(`--phase must be one of: ${PHASES.join(', ')}.`);
    process.exitCode = 1;
    return;
  }
  if (!TARGETS.includes(args.target)) {
    console.error(`--target must be one of: ${TARGETS.join(', ')}.`);
    process.exitCode = 1;
    return;
  }
  // The `applied` phase exists to answer "is the project migrated?". Pointed at the sandbox it
  // would answer a different question under the same name, which is the one thing the record
  // must never do.
  if (args.phase === 'applied' && args.target !== 'project') {
    console.error('--phase applied probes the project, so it requires --target project.');
    console.error('  Use --phase final to probe the sandbox after the last round.');
    process.exitCode = 1;
    return;
  }

  const paths = sessionPaths(args.slug);
  const baseline = readJson(paths.baseline);
  if (!baseline || !fs.existsSync(paths.workspace)) {
    console.error(`Session "${args.slug}" is not set up — run detect-baseline.js then prepare-workspace.js.`);
    process.exitCode = 1;
    return;
  }

  const runDir = args.target === 'project' ? path.resolve(baseline.project.dir) : paths.workspace;
  if (!fs.existsSync(runDir)) {
    console.error(`Nothing to run at ${rel(runDir)}.`);
    process.exitCode = 1;
    return;
  }

  const jdkMajor = args.jdk || (args.phase === 'baseline' ? baseline.language.declared : baseline.language.target);
  const jdk = resolveJdk(jdkMajor);
  if (!jdk) {
    console.error(`No JDK ${jdkMajor} found on this machine.`);
    process.exitCode = 1;
    return;
  }

  let probes = DEFAULT_PROBES;
  if (args.probes) {
    const probeFile = path.resolve(args.probes);
    if (!fs.existsSync(probeFile)) {
      // Falling back to the liveness default here would silently produce a comparison that
      // proves nothing, which is worse than stopping.
      console.error(`Probe file not found: ${probeFile}`);
      process.exitCode = 1;
      return;
    }
    probes = readJson(probeFile);
  }
  const baseUrl = (probes.base_url || `http://localhost:${args.port}`).replace(/\/$/, '');
  const readiness = probes.readiness || DEFAULT_PROBES.readiness;
  const readyTimeout = (args.timeout || readiness.timeout_seconds || 120) * 1000;

  const tool = resolveBuildTool(runDir);
  if (!tool.command) {
    console.error(`No ${tool.tool} build tool found for the workspace.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nRuntime probe — phase ${args.phase} on JDK ${jdk.major} (${jdk.version})`);
  console.log(`  ${args.target === 'project' ? 'project  ' : 'workspace'} ${rel(runDir)}`);
  if (GATED_PHASES.includes(args.phase)) console.log('  gated     every probe must answer, none may 5xx, expectations must hold');

  let artifact = findArtifact(runDir, tool.tool);
  const packaging = { ran: false, exit_code: null, log_tail: null };
  if (!artifact || args.rebuild) {
    console.log('  packaging (tests skipped)…');
    const pkg = runTool(tool.command, buildArgs(tool.tool, 'package-skip-tests'), {
      cwd: runDir, env: envForJdk(jdk), timeout: 900000,
    });
    packaging.ran = true;
    packaging.exit_code = pkg.status;
    packaging.log_tail = tail(`${pkg.stdout}\n${pkg.stderr}`, 4000);
    if (pkg.status !== 0) {
      const record = {
        slug: args.slug, phase: args.phase, generated_at: new Date().toISOString(),
        jdk: { major: jdk.major, version: jdk.version },
        started: false, failure: 'packaging failed', packaging, probes: [],
      };
      writeJson(path.join(paths.runtimeDir, `${args.phase}.json`), record);
      console.error('\n  Packaging failed — the application was never started. Record written anyway.');
      process.exitCode = 1;
      return;
    }
    artifact = findArtifact(runDir, tool.tool);
  }
  if (!artifact) {
    console.error('  No runnable jar was produced — cannot start the application.');
    process.exitCode = 1;
    return;
  }
  console.log(`  artifact  ${rel(artifact, runDir)}`);

  const appArgs = [...args.appArgs];
  if (!args.noPortArg) appArgs.push(`--server.port=${args.port}`);

  const startedAt = Date.now();
  const child = spawn(path.join(jdk.home, 'bin', IS_WIN ? 'java.exe' : 'java'), ['-jar', artifact, ...appArgs], {
    cwd: runDir, env: envForJdk(jdk), detached: !IS_WIN, windowsHide: true,
  });
  let appLog = '';
  child.stdout.on('data', (d) => { appLog += d.toString(); });
  child.stderr.on('data', (d) => { appLog += d.toString(); });

  let ready = false;
  let readyAfterMs = null;
  let readinessStatus = null;
  console.log(`  starting  ${baseUrl}${readiness.path} (up to ${readyTimeout / 1000}s)…`);
  while (Date.now() - startedAt < readyTimeout) {
    if (child.exitCode !== null) break;
    // Any HTTP answer proves the server is up — 401 from a secured endpoint counts.
    const probe = await attempt(`${baseUrl}${readiness.path}`, { method: 'GET', headers: authHeader(probes.auth) });
    if (probe.ok) {
      ready = true;
      readyAfterMs = Date.now() - startedAt;
      readinessStatus = probe.status;
      break;
    }
    await sleep(1000);
  }

  const results = [];
  if (ready) {
    for (const request of probes.requests || DEFAULT_PROBES.requests) {
      const headers = {
        ...(request.no_auth ? {} : authHeader(probes.auth)),
        ...(request.body ? { 'Content-Type': 'application/json' } : {}),
        ...(request.headers || {}),
      };
      const init = { method: request.method || 'GET', headers };
      if (request.body !== undefined) init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      const at = Date.now();
      const outcome = await attempt(`${baseUrl}${request.path}`, init);
      const expected = request.expect_status === undefined ? null : request.expect_status;
      results.push({
        name: request.name || `${request.method || 'GET'} ${request.path}`,
        method: request.method || 'GET',
        path: request.path,
        authenticated: !request.no_auth && Boolean(probes.auth),
        duration_ms: Date.now() - at,
        expected_status: expected,
        meets_expectation: expected === null ? null : outcome.status === expected,
        ...outcome,
      });
    }
  }

  stopProcess(child);
  await sleep(500);

  const startupLine = (/Started [\w$.]+ in ([\d.]+) seconds/.exec(appLog) || [, null])[1];

  // What "runs without error" means, concretely: the application answered, every probe reached
  // it, nothing came back 5xx, and every probe that declared an expected status got it. A 401 or
  // a 404 the probe asked for is a pass — the check is against what the endpoint is supposed to
  // do, not against 200.
  const unreachable = results.filter((r) => !r.ok);
  const serverErrors = results.filter((r) => r.ok && r.status >= 500);
  const unmetExpectations = results.filter((r) => r.meets_expectation === false);
  const clean = ready && !unreachable.length && !serverErrors.length && !unmetExpectations.length;
  const gated = GATED_PHASES.includes(args.phase);

  const record = {
    slug: args.slug,
    phase: args.phase,
    target: args.target,
    generated_at: new Date().toISOString(),
    jdk: { major: jdk.major, version: jdk.version, home: jdk.home },
    artifact: rel(artifact, runDir),
    base_url: baseUrl,
    packaging,
    started: ready,
    gate: {
      name: `${args.phase}-runtime-clean`,
      required: gated,
      met: clean,
      unreachable: unreachable.map((r) => r.name),
      server_errors: serverErrors.map((r) => `${r.name} → ${r.status}`),
      unmet_expectations: unmetExpectations.map((r) => `${r.name}: expected ${r.expected_status}, got ${r.status}`),
    },
    startup_seconds: startupLine ? Number(startupLine) : (readyAfterMs ? readyAfterMs / 1000 : null),
    readiness: { path: readiness.path, status: readinessStatus, ready_after_ms: readyAfterMs },
    probes: results,
    app_log_tail: tail(stripRootFromText(appLog, runDir), 6000),
  };
  const file = writeJson(path.join(paths.runtimeDir, `${args.phase}.json`), record);

  console.log(`\n  Started     ${ready ? `yes (${record.startup_seconds ?? '?'}s, readiness ${readinessStatus})` : 'NO — did not answer in time'}`);
  if (results.length) {
    console.log(`\n  ${'Probe'.padEnd(38)} ${'Status'.padEnd(8)} ${'Bytes'.padEnd(8)} Expected`);
    for (const r of results) {
      const verdict = r.meets_expectation === null ? '—' : (r.meets_expectation ? `${r.expected_status} ✓` : `${r.expected_status} ✗`);
      console.log(`  ${r.name.slice(0, 37).padEnd(38)} ${String(r.ok ? r.status : 'ERR').padEnd(8)} ${String(r.body_length ?? '-').padEnd(8)} ${verdict}`);
    }
  }
  if (!ready) console.log(`\n  Last log lines:\n${record.app_log_tail.split(/\r?\n/).slice(-15).map((l) => `    ${l}`).join('\n')}`);
  console.log(`\n  Written ${rel(file)}\n`);

  if (gated && !clean) {
    const where = args.target === 'project' ? 'the project' : 'the sandbox';
    console.error(`  ${args.phase.toUpperCase()} RUNTIME GATE FAILED — ${where} did not run cleanly.`);
    if (!ready) console.error('    - the application never answered its readiness path');
    for (const r of record.gate.unreachable) console.error(`    - no response: ${r}`);
    for (const r of record.gate.server_errors) console.error(`    - server error: ${r}`);
    for (const r of record.gate.unmet_expectations) console.error(`    - wrong status: ${r}`);
    console.error('');
    console.error(args.phase === 'baseline'
      ? '  The migration does not start from an application that is already failing: every later\n  difference would be unattributable. Get it running cleanly first, then re-record round 0.'
      : '  The migrated project itself must run before the migration counts as done. Read the log\n  tail above; apply-migration.js --revert puts the project back as it was.');
    console.error('');
    process.exitCode = 1;
    return;
  }
  if (!ready) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
