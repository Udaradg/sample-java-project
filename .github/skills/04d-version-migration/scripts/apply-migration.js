#!/usr/bin/env node
/**
 * Version Migration — the final step: put the migrated code into the real project.
 *
 * Everything before this point happens in a sandbox. This is the one script that writes to the
 * project directory, and it is how a migration finishes: a migration that only ever existed in
 * `.github/.pipeline-context/` has not migrated anything. It runs when the sandbox is green, and
 * it refuses otherwise.
 *
 * What it does, in order:
 *
 *   1. Backs up every project file it is about to overwrite or delete into the session's
 *      `pre-apply-backup/`, with a manifest — so `--revert` can put the project back exactly.
 *   2. Copies the changed files out of the sandbox. It copies files rather than applying a patch,
 *      so it cannot fail halfway on a context mismatch: the sandbox holds the exact tree that was
 *      built and probed.
 *   3. Builds the project itself on the target JDK, with a goal that runs the tests. The sandbox
 *      being green is evidence about the sandbox; this is the same claim about the project, which
 *      is the thing anyone will actually use.
 *
 * A failed verification leaves the project as applied and says so — reverting on the user's behalf
 * would destroy the evidence needed to diagnose it. `--revert` is one command away.
 *
 * Usage:
 *   node scripts/apply-migration.js --slug <slug>                          # dry run, prints the plan
 *   node scripts/apply-migration.js --slug <slug> --to-project             # apply, then verify
 *   node scripts/apply-migration.js --slug <slug> --to-project --no-verify # apply only
 *   node scripts/apply-migration.js --slug <slug> --revert                 # undo the last apply
 */
const fs = require('fs');
const path = require('path');
const {
  sessionPaths, readJson, writeJson, listRounds, rel, run, runTool, tail,
  resolveJdk, envForJdk, resolveBuildTool, buildArgs, TEST_INTENTS,
  parseBuildErrors, summariseErrors, buildOutcome, stripRootFromText,
} = require('./lib/migration');
const { approvalGate, refuse } = require('./lib/plan');

function parseArgs(argv) {
  const args = { verify: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slug' || a === '-s') args.slug = argv[++i];
    else if (a === '--to-project') args.toProject = true;
    else if (a === '--no-verify') args.verify = false;
    else if (a === '--revert') args.revert = true;
    else if (a === '--jdk' || a === '-j') args.jdk = argv[++i];
    else if (a === '--intent' || a === '-i') args.intent = argv[++i];
    else if (a === '--timeout') args.timeout = Number(argv[++i]) * 1000;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Version Migration — Apply

  node scripts/apply-migration.js --slug <slug> [--to-project] [--no-verify]
  node scripts/apply-migration.js --slug <slug> --revert

Options:
  --slug, -s      Session name
  --to-project    Copy the migrated files into the project directory, backing up what they
                  replace, then build the project to prove the migration landed.
                  Refused unless the last recorded round passed.
  --no-verify     Skip the post-apply build. The migration is then applied but unproven
  --revert        Restore the project from the backup the last apply wrote
  --jdk, -j       JDK for the verification build (default: the JDK the final round used)
  --intent, -i    Build goal for the verification (default: the final round's, or verify)
  --timeout       Seconds before the verification build is abandoned (default 900)
  --help, -h      Show this message`);
}

function listWorkspaceChanges(workspace, baselineCommit) {
  const git = (...a) => run('git', ['-C', workspace, ...a]);
  git('add', '-A');
  const status = git('diff', '--cached', '--name-status', baselineCommit).stdout.trim();
  if (!status) return [];
  return status.split(/\r?\n/).map((line) => {
    const [state, ...rest] = line.split(/\t/);
    return { state: state.trim(), file: rest.join('\t').split(path.sep).join('/') };
  });
}

// Copy the project's current content of everything about to change, so an apply is undoable.
function backupProject(changes, projectDir, backupDir) {
  fs.rmSync(backupDir, { recursive: true, force: true });
  const entries = [];
  for (const change of changes) {
    const target = path.join(projectDir, change.file);
    const existed = fs.existsSync(target);
    if (existed) {
      const stored = path.join(backupDir, change.file);
      fs.mkdirSync(path.dirname(stored), { recursive: true });
      fs.copyFileSync(target, stored);
    }
    entries.push({ file: change.file, state: change.state, existed_before: existed });
  }
  return entries;
}

function revert(paths, projectDir) {
  const applied = readJson(paths.applied);
  if (!applied || !applied.backup) {
    console.error('No recorded apply to revert — pre-apply-backup/ has no manifest.');
    return 1;
  }
  let restored = 0;
  let deleted = 0;
  for (const entry of applied.backup.entries) {
    const target = path.join(projectDir, entry.file);
    if (entry.existed_before) {
      const stored = path.join(paths.appliedBackup, entry.file);
      if (!fs.existsSync(stored)) {
        console.error(`  missing backup for ${entry.file} — leaving it as it is`);
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(stored, target);
      restored += 1;
    } else if (fs.existsSync(target)) {
      // The migration created this file; the project had no such file before.
      fs.rmSync(target);
      deleted += 1;
    }
  }
  writeJson(paths.applied, { ...applied, status: 'reverted', reverted_at: new Date().toISOString() });
  console.log(`\n  Reverted: ${restored} file(s) restored, ${deleted} removed, in ${rel(projectDir)}`);
  console.log('  The sandbox and every round record are untouched — the migration can be re-applied.\n');
  return 0;
}

// The project's own build, on the target runtime. Same shape of evidence as a round, taken from
// the project rather than the sandbox.
function verifyProject(projectDir, jdkMajor, intent, timeout) {
  const jdk = resolveJdk(jdkMajor);
  if (!jdk) return { ran: false, reason: `No JDK ${jdkMajor} on this machine.` };
  const tool = resolveBuildTool(projectDir);
  if (!tool.command) return { ran: false, reason: `No ${tool.tool} build tool found for the project.` };

  const mvnArgs = buildArgs(tool.tool, intent);
  console.log(`\n  Verifying the project — ${tool.tool} ${mvnArgs.join(' ')} on JDK ${jdk.major} (${jdk.version})`);
  console.log('  building…');
  const started = Date.now();
  const result = runTool(tool.command, mvnArgs, {
    cwd: projectDir, env: envForJdk(jdk, { MAVEN_OPTS: process.env.MAVEN_OPTS || '' }), timeout: timeout || 900000,
  });
  const durationMs = Date.now() - started;
  const log = `${result.stdout}\n${result.stderr}`;
  const errors = parseBuildErrors(log, projectDir);
  const outcome = result.error && /ETIMEDOUT|timed out/i.test(result.error)
    ? 'timed-out'
    : buildOutcome(result, errors);
  return {
    ran: true,
    command: `${tool.display || tool.command} ${mvnArgs.join(' ')}`,
    intent,
    jdk: { major: jdk.major, version: jdk.version },
    exit_code: result.status,
    duration_ms: durationMs,
    outcome,
    error_summary: summariseErrors(errors),
    errors: errors.slice(0, 50),
    log_tail: tail(stripRootFromText(log, projectDir), 6000),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  if (!args.slug) {
    console.error('--slug is required.');
    process.exitCode = 1;
    return;
  }

  const paths = sessionPaths(args.slug);
  const baseline = readJson(paths.baseline);
  const meta = readJson(paths.workspaceMeta);
  if (!baseline || !meta) {
    console.error(`Session "${args.slug}" is not set up.`);
    process.exitCode = 1;
    return;
  }
  const projectDir = path.resolve(baseline.project.dir);

  if (args.revert) {
    process.exitCode = revert(paths, projectDir);
    return;
  }

  const rounds = listRounds(args.slug);
  const last = rounds[rounds.length - 1];
  if (!last) {
    console.error('No build rounds recorded — nothing has been verified.');
    process.exitCode = 1;
    return;
  }

  const changes = listWorkspaceChanges(paths.workspace, meta.baseline_commit);

  console.log(`\nMigration "${args.slug}"`);
  console.log(`  Last round     ${last.round} — ${last.outcome} on JDK ${last.jdk.major}`);
  console.log(`  Project        ${rel(projectDir)}`);
  console.log(`  Sandbox        ${rel(paths.workspace)}`);
  console.log(`  Files changed  ${changes.length}`);
  for (const c of changes) console.log(`    ${c.state.padEnd(3)} ${c.file}`);

  if (!args.toProject) {
    console.log('\n  Dry run — nothing written. Pass --to-project to complete the migration in the project.');
    console.log(`  The same changes are also in docs/agent_output/04-remediation/migration_${args.slug}.diff once the report is rendered.\n`);
    return;
  }

  // The last gate before the project is written. The approved plan is what authorised this
  // migration in the first place; a revoked or still-pending approval means nobody has agreed to
  // the change now being copied into the working tree.
  const gate = approvalGate(args.slug);
  if (!gate.ok) {
    refuse(gate, `write the migration into ${rel(projectDir)}`);
    process.exitCode = 1;
    return;
  }

  if (last.outcome !== 'passed') {
    console.error(`\n  REFUSED: the last round ended "${last.outcome}", not "passed".`);
    console.error('  A migration is only applied to the project once its build is green. Fix the');
    console.error('  remaining errors in the sandbox and run another round.\n');
    process.exitCode = 1;
    return;
  }
  if (!changes.length) {
    console.error('\n  REFUSED: the sandbox is identical to the project — there is nothing to apply.\n');
    process.exitCode = 1;
    return;
  }

  const backupEntries = backupProject(changes, projectDir, paths.appliedBackup);

  let applied = 0;
  let removed = 0;
  for (const change of changes) {
    const source = path.join(paths.workspace, change.file);
    const target = path.join(projectDir, change.file);
    if (change.state.startsWith('D')) {
      if (fs.existsSync(target)) { fs.rmSync(target); removed += 1; }
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    applied += 1;
  }

  console.log(`\n  Applied: ${applied} file(s) written, ${removed} removed, in ${rel(projectDir)}`);
  console.log(`  Backup:  ${rel(paths.appliedBackup)}  (undo with --revert)`);

  // The verification goal has to run the tests: a project that compiles on the new runtime but
  // fails its suite is not migrated, it is broken in a quieter way.
  const intent = args.intent
    || (TEST_INTENTS.includes(last.build && last.build.intent) ? last.build.intent : 'verify');
  const jdkMajor = args.jdk || last.jdk.major;
  const verification = args.verify
    ? verifyProject(projectDir, jdkMajor, intent, args.timeout)
    : { ran: false, reason: '--no-verify was passed' };

  const status = !verification.ran
    ? 'applied-unverified'
    : (verification.outcome === 'passed' ? 'applied-verified' : 'applied-verification-failed');

  const record = writeJson(paths.applied, {
    slug: args.slug,
    status,
    applied_at: new Date().toISOString(),
    project_dir: rel(projectDir),
    source_round: { round: last.round, outcome: last.outcome, jdk: last.jdk.major, intent: last.build && last.build.intent },
    files: changes,
    written: applied,
    removed,
    backup: { dir: rel(paths.appliedBackup), entries: backupEntries },
    verification,
  });

  if (verification.ran) {
    console.log(`\n  Verification   ${verification.outcome.toUpperCase()}  (exit ${verification.exit_code}, ${(verification.duration_ms / 1000).toFixed(1)}s)`);
    if (verification.error_summary && verification.error_summary.total) {
      console.log(`  ${verification.error_summary.total} error line(s) by category:`);
      for (const c of verification.error_summary.byCategory) console.log(`    ${String(c.count).padStart(4)}  ${c.label}`);
    }
  } else {
    console.log(`\n  Verification   NOT RUN — ${verification.reason}`);
  }
  console.log(`  Record         ${rel(record)}`);

  if (status === 'applied-verified') {
    console.log('\n  The project is migrated: the files are in place and the project builds green on');
    console.log(`  JDK ${jdkMajor} with its own tests. Probe the running project, then re-render the report:`);
    console.log(`    node scripts/probe-runtime.js --slug ${args.slug} --phase applied --target project --jdk ${jdkMajor} --probes <session>/probes.json`);
    console.log(`    node scripts/render-migration-report.js --slug ${args.slug}`);
    console.log(`  Review with: git -C "${projectDir}" diff   (if the project is version-controlled)\n`);
    return;
  }
  if (status === 'applied-verification-failed') {
    console.error('\n  APPLIED BUT NOT GREEN — the files are in the project, its own build is not passing.');
    console.error('  The sandbox and the project differ in something the sandbox copy did not carry:');
    console.error('  local configuration, a stale target/, or a file the migration never touched.');
    console.error(`  Read ${rel(paths.applied)}, or put the project back with:`);
    console.error(`    node scripts/apply-migration.js --slug ${args.slug} --revert\n`);
    process.exitCode = 1;
    return;
  }
  console.log('\n  Applied without verification — the migration is unproven in the project itself.');
  console.log('  --to-project was used with --no-verify; run a verification before calling this done.\n');
}

main();
