#!/usr/bin/env node
/**
 * Merge Arbiter — Deterministic Score Computation
 *
 * Reads all five Phase C upstream reports plus scoring.json and computes a 0-100 confidence
 * score, entirely mechanically. Two hard gates (acceptance-check NOT_SATISFIED, build-gatekeeper
 * Failed) block regardless of score — no weight rescues either. This script decides the score
 * and the gate outcome; the agent may only contest the result afterward, explicitly and visibly
 * (see .github/.pipeline-context/merge/<id>.arbitration.json), never by editing this file.
 *
 * Usage:
 *   node scripts/compute-score.js --all
 *   node scripts/compute-score.js --story JIRA-001
 */
const fs = require('fs');
const path = require('path');
const {
  WORK_DIR, listStep3Changes, readUpstream, readStoryPriority, loadScoring,
} = require('./lib/arbiter');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' || a === '-s') args.story = argv[++i];
    else if (a === '--all' || a === '-a') args.all = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Merge Arbiter — Deterministic Score Computation

  node scripts/compute-score.js --all
  node scripts/compute-score.js --story <ID>`);
}

function scoreOne(change, scoring) {
  const upstream = readUpstream(change.id);
  const missing = Object.entries(upstream).filter(([, v]) => !v.present).map(([k]) => k);
  if (missing.length) {
    throw new Error(`${change.id} is missing upstream report(s): ${missing.join(', ')}. Run the remaining Phase C checks first.`);
  }

  const gates = [];
  if (scoring.hard_gates.acceptance_not_satisfied_blocks && upstream.acceptance.verdict === 'NOT_SATISFIED') {
    gates.push({ gate: 'acceptance-check', reason: 'Acceptance-check verdict is NOT_SATISFIED — at least one acceptance criterion does not hold in the patched code.' });
  }
  if (scoring.hard_gates.build_failed_blocks && upstream.build.verdict === 'Failed') {
    gates.push({ gate: 'build-gatekeeper', reason: 'Build gate Status is Failed — the change does not build cleanly.' });
  }

  const edgecasePoints = scoring.weights.edgecase[upstream.edgecase.verdict] ?? 0;
  const behaviorPoints = scoring.weights.behavior[upstream.behavior.verdict] ?? 0;
  const qaPoints = scoring.weights.qa[upstream.qa.verdict] ?? 0;
  const totalScore = edgecasePoints + behaviorPoints + qaPoints;

  const priority = readStoryPriority(change.id);
  const threshold = (priority && scoring.priority_thresholds[priority]) || scoring.default_threshold;

  const gateBlocked = gates.length > 0;
  const scoreCleared = totalScore >= threshold;

  return {
    generatedAt: new Date().toISOString(),
    id: change.id,
    title: change.title,
    priority,
    threshold,
    upstream,
    breakdown: {
      edgecase: { verdict: upstream.edgecase.verdict, points: edgecasePoints, max: 30 },
      behavior: { verdict: upstream.behavior.verdict, points: behaviorPoints, max: 30 },
      qa: { verdict: upstream.qa.verdict, points: qaPoints, max: 40 },
    },
    score: totalScore,
    gates,
    gateBlocked,
    scoreCleared,
    computedDecision: gateBlocked ? 'Blocked' : (scoreCleared ? 'Cleared' : 'Blocked'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const scoring = loadScoring();

  let targets;
  if (args.all) {
    targets = listStep3Changes();
    if (!targets.length) { console.log('No Compiled or Compile Failed changes found.'); return; }
  } else {
    if (!args.story) throw new Error('Missing --story or --all.');
    targets = listStep3Changes().filter((c) => c.id.toLowerCase() === args.story.toLowerCase());
    if (!targets.length) throw new Error(`${args.story} has no captured change (Compiled or Compile Failed) to score.`);
  }

  const done = []; const failed = [];
  for (const change of targets) {
    try {
      const record = scoreOne(change, scoring);
      fs.mkdirSync(WORK_DIR, { recursive: true });
      fs.writeFileSync(path.join(WORK_DIR, `${change.id}.score.json`), JSON.stringify(record, null, 2));
      done.push(record);
      console.log(`\n${record.id} — score ${record.score}/100 (threshold ${record.threshold}) -> ${record.computedDecision}`);
      if (record.gates.length) record.gates.forEach((g) => console.log(`  HARD GATE: ${g.gate} — ${g.reason}`));
      console.log(`  edge-case: ${record.breakdown.edgecase.verdict} (${record.breakdown.edgecase.points}/30)  behavior: ${record.breakdown.behavior.verdict} (${record.breakdown.behavior.points}/30)  qa: ${record.breakdown.qa.verdict} (${record.breakdown.qa.points}/40)`);
    } catch (err) {
      if (targets.length === 1) throw err;
      failed.push({ id: change.id, message: err.message });
      console.error(`\n${change.id} — SKIPPED: ${err.message}`);
    }
  }
  console.log(`\nNext: read each .github/.pipeline-context/merge/<id>.score.json, then write <id>.arbitration.json.`);
  if (failed.length) process.exitCode = 1;
}

try { main(); } catch (err) { console.error('Score computation failed:', err.message); process.exit(1); }
