#!/usr/bin/env bun
/**
 * Read-only goal analysis over the canonical reporting pipeline.
 *
 * This command deliberately contains no metric selection, coverage reduction, alias shortening,
 * noise band, or winner implementation. Raw runs are validated and normalized through buildReport;
 * an existing report is validated at its boundary and its recorded ranking decisions are rendered.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildReport,
  parseRawRunArtifact,
  stablePrettyJson,
  validateReportArtifact,
} from '../src/core/report.ts';

const options = parseArgs(process.argv.slice(2));
const input = JSON.parse(readFileSync(resolve(options.file), 'utf8'));
const report = isReportArtifact(input) ? validatedReport(input) : reportFromRaw(input, options.latest);
const only = options.only
  ? new Set(readFileSync(resolve(options.only), 'utf8').split(/\r?\n/).map((value) => value.trim()).filter(Boolean))
  : undefined;
const rows = report.cohorts
  .flatMap((cohort) => cohort.rankings.map((ranking) => {
    const ai = ranking.contenders.find((contender) => isAibrushEngine(contender.engineId));
    const aiCell = cohort.cells.find((cell) => cell.scenarioId === ranking.scenarioId && ai && cell.engineId === ai.engineId);
    const winners = ranking.winner ? [ranking.winner] : ranking.coWinners;
    return {
      scenarioId: ranking.scenarioId,
      browser: ranking.browser,
      cohortId: ranking.cohortId,
      comparable: ranking.comparable,
      metric: ranking.primaryMetric,
      aggregation: ranking.aggregation,
      unit: ranking.unit,
      flag: ranking.flag,
      winner: ranking.winner,
      winnerValue: ranking.winnerValue,
      coWinners: ranking.coWinners,
      aibrushEngineId: ai?.engineId ?? null,
      aibrushGrade: aiCell?.grade ?? 'ABSENT',
      aibrushEligibility: ai?.eligibility ?? 'ABSENT',
      aibrushValue: ai?.observation?.state === 'AVAILABLE' ? ai.observation.rankedValue : null,
      aibrushWins: ai ? winners.includes(ai.engineId) : false,
      reasons: ranking.reasons,
    };
  }))
  .filter((row) => !only || only.has(row.scenarioId))
  .sort((a, b) =>
    a.scenarioId.localeCompare(b.scenarioId)
    || a.browser.localeCompare(b.browser)
    || a.cohortId.localeCompare(b.cohortId));

if (options.json) {
  process.stdout.write(stablePrettyJson({
    schema: 'media-test/goal-analysis@1',
    reportContentHash: report.contentHash,
    rows,
  }));
} else {
  printTable(rows, report.contentHash);
}

function reportFromRaw(value, latest) {
  const run = parseRawRunArtifact(value);
  return buildReport({
    results: run.results,
    suiteVersion: run.suiteVersion,
    generatedAtIso: run.generatedAtIso,
    ...(run.expected ? { expected: run.expected } : {}),
    contextForResult: () => ({ runId: run.runId, observedAtIso: run.generatedAtIso }),
    dedupePolicy: latest ? 'latest' : 'strict',
  }).json;
}

function validatedReport(value) {
  validateReportArtifact(value);
  return value;
}

function isReportArtifact(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.schemaId === 'string'
    && value.schemaId.includes('/report/');
}

function isAibrushEngine(engineId) {
  return engineId === 'aibrush-media' || engineId.startsWith('aibrush-media@');
}

function printTable(rows, contentHash) {
  console.log(`report ${contentHash}`);
  console.log('WIN?  scenario                                      browser    metric               winner                          aibrush                         status');
  let losses = 0;
  for (const row of rows) {
    if (!row.aibrushWins) losses += 1;
    const metric = row.metric
      ? `${row.metric}/${row.aggregation ?? '—'}`
      : '—';
    const winner = row.winner ?? (row.coWinners.length > 0 ? `tie:${row.coWinners.join(',')}` : `(${row.flag})`);
    console.log(
      `${row.aibrushWins ? ' ✓ ' : ' ✗ '}  ${row.scenarioId.padEnd(45)} ${row.browser.padEnd(10)} `
      + `${metric.padEnd(20)} ${winner.padEnd(31)} ${(row.aibrushEngineId ?? 'ABSENT').padEnd(31)} `
      + `${row.aibrushGrade}/${row.aibrushEligibility}`,
    );
  }
  console.log(`\naibrush not selected ${losses}/${rows.length}`);
  for (const row of rows) {
    if (!row.aibrushWins) console.log(`  ${row.scenarioId} [${row.browser}] ${row.reasons.join('; ') || 'no ranking reason'}`);
  }
}

function parseArgs(argv) {
  const options = { file: undefined, only: undefined, latest: false, json: false };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--only') options.only = requiredArg(argv, ++index, value);
    else if (value === '--latest') options.latest = true;
    else if (value === '--json') options.json = true;
    else if (value === '-h' || value === '--help') {
      console.log('bun scripts/goal26-analyze.mjs <raw-run-or-report.json> [scenario-ids.txt|--only file] [--latest] [--json]');
      process.exit(0);
    } else if (!options.file) options.file = value;
    else if (!options.only) options.only = value;
    else fail(`unexpected argument '${value}'`, 2);
  }
  if (!options.file) fail('a validated raw-run or report JSON path is required', 2);
  return options;
}

function requiredArg(values, index, flag) {
  const value = values[index];
  if (!value) fail(`${flag} requires a value`, 2);
  return value;
}

function fail(message, code = 1) {
  console.error(`goal26-analyze.mjs: ${message}`);
  process.exit(code);
}
