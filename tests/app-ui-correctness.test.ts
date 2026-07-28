import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { PassThrough } from 'node:stream';

import {
  RUN_OPTION_DEFINITIONS,
  RUN_OPTION_LIMITS,
  RunOptionValidationError,
  freezeRunConfiguration,
} from '../src/app/options.ts';
import {
  buildAppReportArtifacts,
  createCanonicalRunArtifact,
  createRunManifest,
  finalizeRunManifest,
  strictResultsEnvelope,
  validateCanonicalRunArtifact,
  withLauncherProvenance,
} from '../src/app/run-artifact.ts';
import type { CacheManifestSnapshot, RunCompletionState } from '../src/app/run-artifact.ts';
import {
  CACHE_EXPORT_SCHEMA,
  CACHE_VALIDATION_EPOCH,
  createResultCache,
  latestCachedRunView,
  unavailableCacheSnapshot,
  validateCacheExportBundle,
} from '../src/app/result-cache.ts';
import type { CachedResultRow } from '../src/app/result-cache.ts';
import {
  appendBrowserRunEvidence,
  beginBrowserRunEvidence,
  cancellationPresentation,
  correctnessRate,
  failBrowserRunEvidence,
  formatStatusLabel,
  reconcileBrowserRunEvidence,
  resultDisplay,
  runContinuationAction,
  unresolvedMatrixState,
} from '../src/app/ui.ts';
import type { FrozenRunConfiguration } from '../src/app/options.ts';
import type { RegistrationReport } from '../src/app/register.ts';
import type { EnvInfo, CodecSupport } from '../src/core/feature-detect.ts';
import { canonicalContentHash, parseRawRunArtifact } from '../src/core/report.ts';
import { readResultsEnvelope, RESULTS_V2_SCHEMA_ID } from '../src/core/result-schema.ts';
import type { ScenarioResultV2 } from '../src/core/result-schema.ts';
import type { ResultStatus, Scenario, ScenarioResult } from '../src/core/scenario.ts';
import viteConfig, {
  SAVE_ENDPOINT_MAX_BYTES,
  createSaveEndpointHandler,
  inspectSaveRequest,
  staticContentType,
} from '../vite.config.mjs';

const ROOT = resolve(import.meta.dir, '..');
const SHA_A = 'a'.repeat(64);
const ENV: EnvInfo = {
  browser: 'chromium', version: '126.0.0', userAgent: 'ui-acceptance-agent', gpu: 'test-gpu',
};
const SUPPORT: CodecSupport = {
  webcodecs: false,
  videoDecode: {}, videoEncode: {}, audioDecode: {}, audioEncode: {},
  alpha: false,
  strictRgbaPixels: false, strictGoldenRgba: false, strictSourceRgba: false,
  webgpu: false, measureMemory: false,
};
const REGISTRATION: RegistrationReport = {
  engines: [{ id: 'engine', ok: true }, { id: 'platform', ok: true }],
  scenarioFamilies: [{ family: 'probe', count: 1, ok: true }],
  engineCount: 2,
  scenarioCount: 1,
};
const CACHE: CacheManifestSnapshot = {
  schema: 'media-test/browser-cache-policy@2',
  origin: 'http://127.0.0.1:5173',
  available: true,
  persistence: 'origin-scoped-best-effort',
  validationEpoch: CACHE_VALIDATION_EPOCH,
  expiry: { PASS: 'until validation epoch changes' },
  forcedFresh: false,
  entryCount: 0,
  invalidatedCount: 0,
  hits: [],
};

describe('REQ-UI-01/02/06/07/19: honest presentation model', () => {
  test('PASS and FAIL remain distinct and DIFF is no longer a status', () => {
    const pass = resultDisplay(displayResult('PASS', 'exact evidence'));
    const fail = resultDisplay(displayResult('FAIL', 'decoded samples changed'));

    expect([pass.kind, fail.kind]).toEqual(['PASS', 'FAIL']);
    expect(pass.label).toBe('PASS');
    expect(pass.accessibleLabel).not.toMatch(/FAIL/i);
    expect(fail.label).toContain('FAIL');
    expect(fail.accessibleLabel).toContain('True semantic or structural violation');

    // DIFF is a correct-with-representation-difference PASS now, not its own status.
    const statuses: ResultStatus[] = ['PASS', 'FAIL', 'NA_ENGINE', 'NA_BROWSER', 'NA_ASSET', 'SKIPPED', 'ERROR'];
    expect(statuses.map(formatStatusLabel)).not.toContain('DIFF');
  });

  test('a 1/3 cell is an exclusive partial grade and names both failing files without ERROR', () => {
    const partial = resultDisplay({
      ...displayResult('FAIL', 'two variants violated the oracle'),
      exhaustive: [
        { file: '01.mp4', isBaked: false, status: 'PASS', oracleOutcomes: [], executed: true },
        { file: '02.mp4', isBaked: false, status: 'FAIL', reason: 'packet payload changed', oracleOutcomes: [], executed: true },
        { file: '03.mp4', isBaked: false, status: 'FAIL', reason: 'track missing', oracleOutcomes: [], executed: true },
      ],
      coverage: {
        passed: 1, admissible: 3, total: 3, valid: 1, grade: 'partial',
        counts: { pass: 1, fail: 2, error: 0, naEngine: 0, naBrowser: 0, naAsset: 0, skipped: 0, total: 3 },
      },
    } as ScenarioResult);
    expect(partial.kind).toBe('PARTIAL');
    expect(partial.label).toBe('Partial 1/3');
    expect(partial.accessibleLabel).not.toContain('ERROR');
    expect(partial.partialFailures).toEqual([
      '02.mp4: FAIL — packet payload changed',
      '03.mp4: FAIL — track missing',
    ]);
    expect(correctnessRate([{
      ...displayResult('FAIL', 'partial'),
      coverage: {
        passed: 1, admissible: 3, total: 3, valid: 1, grade: 'partial',
        counts: { pass: 1, fail: 2, error: 0, naEngine: 0, naBrowser: 0, naAsset: 0, skipped: 0, total: 3 },
      },
    }])).toEqual({ numerator: 1, denominator: 3 });
  });

  test('executed PASS, FAIL, ERROR, and partial cells retain their measured elapsed time', () => {
    expect(resultDisplay({ ...displayResult('PASS', 'ok'), durationMs: 12.34 }).label)
      .toBe('PASS (12.34 ms)');
    expect(resultDisplay({ ...displayResult('FAIL', 'semantic mismatch'), durationMs: 1_250 }).label)
      .toBe('FAIL (1.25 s)');
    expect(resultDisplay({ ...displayResult('ERROR', 'adapter failed'), durationMs: 800 }).label)
      .toBe('ERROR (800 ms)');
    const partial = resultDisplay({
      ...displayResult('FAIL', 'mixed exhaustive coverage'),
      durationMs: 3_210,
      exhaustive: [
        { file: '01.wav', isBaked: true, status: 'PASS', oracleOutcomes: [], executed: true },
        { file: '02.wav', isBaked: false, status: 'FAIL', oracleOutcomes: [], executed: true },
      ],
      coverage: {
        passed: 1, admissible: 2, total: 2, valid: 1, grade: 'partial',
        counts: { pass: 1, fail: 1, error: 0, naEngine: 0, naBrowser: 0, naAsset: 0, skipped: 0, total: 2 },
      },
    } as ScenarioResult);
    expect(partial.label).toBe('Partial 1/2 (3.21 s)');
  });

  test('every applicability/policy/error status keeps a unique machine-visible label', () => {
    const statuses: ResultStatus[] = [
      'PASS', 'FAIL', 'NA_ENGINE', 'NA_BROWSER', 'NA_ASSET', 'SKIPPED', 'ERROR',
    ];
    const labels = statuses.map(formatStatusLabel);
    expect(new Set(labels).size).toBe(statuses.length);
    expect(labels).toEqual(statuses);
  });

  test('unfinished terminal snapshots keep unresolved cells pending instead of marking them not run', () => {
    expect(unresolvedMatrixState('completed')).toBe('not-run');
    for (const state of ['idle', 'validating', 'running', 'stopping', 'completed-partial', 'failed'] as const) {
      expect(unresolvedMatrixState(state)).toBe('pending');
    }
  });

});

describe('REQ-UI-04/05/08/15/17: frozen configuration and canonical artifacts', () => {
  test('warmup zero round-trips, source mutations cannot change the frozen snapshot, and bad bounds reject', () => {
    const engines = ['engine'];
    const scenarios = ['probe/example'];
    const frozen = freezeRunConfiguration({
      browser: 'chromium', engineIds: engines, scenarioIds: scenarios, featureIds: ['probe'],
      operations: ['probe'], pillar: 'functional', warmup: 0, iters: 50, timeoutMs: 1_000,
      reuseData: false, randomizeOrder: true, randomSeed: 'replay-me', exhaustiveMedia: true,
    }, {
      browser: 'chromium', engineIds: [], featureIds: [], scenarioIds: [], operations: [],
    });
    engines.push('mutated');
    scenarios[0] = 'probe/mutated';
    expect(frozen.warmup).toBe(0);
    expect(frozen.engineIds).toEqual(['engine']);
    expect(frozen.scenarioIds).toEqual(['probe/example']);
    expect(frozen.mediaMode).toBe('exhaustive');
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.engineIds)).toBe(true);
    expect(() => freezeRunConfiguration({
      browser: 'chromium', engineIds: [], scenarioIds: ['probe/example'], randomSeed: 'seed',
    }, { browser: 'chromium', engineIds: [], featureIds: [], scenarioIds: [] }))
      .toThrow(RunOptionValidationError);
    expect(() => freezeRunConfiguration({
      browser: 'chromium', engineIds: ['engine'], scenarioIds: ['probe/example'], warmup: 21, randomSeed: 'seed',
    }, { browser: 'chromium', engineIds: [], featureIds: [], scenarioIds: [] }))
      .toThrow(/Warmup must be an integer from 0 to 20/);
  });

  test('manual and launcher artifacts validate identically and differ only by launcher provenance', () => {
    const artifact = completedArtifact();
    const parsed = parseRawRunArtifact(artifact);
    const strict = readResultsEnvelope({
      schema: RESULTS_V2_SCHEMA_ID,
      generatedAtIso: artifact.generatedAtIso,
      env: artifact.env,
      support: artifact.support,
      results: artifact.results,
    });
    expect(parsed.runId).toBe(artifact.runId);
    expect(strict.results).toHaveLength(1);
    expect(JSON.stringify(artifact).match(/"results":/g)).toHaveLength(1);
    expect((artifact as unknown as Record<string, unknown>).resultsEnvelope).toBeUndefined();

    const launched = withLauncherProvenance(artifact, {
      playwrightBrowser: 'chromium', playwrightVersion: '126.0.0', savedAtIso: artifact.generatedAtIso,
    });
    const { launcher, ...launcherIndependent } = launched;
    expect(launcher).toBeDefined();
    expect(launcherIndependent).toEqual(artifact);
    expect(launched.contentHash).toBe(artifact.contentHash);
    expect(validateCanonicalRunArtifact(JSON.parse(JSON.stringify(launched))).runId).toBe(artifact.runId);
    expect(() => validateCanonicalRunArtifact({
      ...artifact,
      manifest: { ...artifact.manifest, suiteVersion: 'tampered-suite' },
    })).toThrow(/run manifest digest mismatch/);

    const report = buildAppReportArtifacts(artifact);
    expect(report.json.run).toMatchObject({
      runId: artifact.runId, completionState: 'completed', resultCount: 1,
    });
    expect(report.markdown).toContain(`Run id: \`${artifact.runId}\``);
    expect(report.markdown).toContain('Completion: **completed**');
    expect(report.markdown).toContain('Cells: 1');
  });

  test('typed live rows are identity-enveloped without losing cache-reuse provenance', () => {
    const live: ScenarioResult = {
      ...displayResult('PASS', 'live typed verdict'),
      cacheReuse: {
        schema: 'media-test/cache-reuse@1',
        sourceKey: 'source-row',
        sourceObservationHash: 'b'.repeat(64),
        sourceRunId: 'prior-run',
        createdAtIso: '2026-07-16T11:00:00.000Z',
        originalOrigin: 'http://127.0.0.1:5173',
        validationEpoch: CACHE_VALIDATION_EPOCH,
        validBecause: 'fingerprint revalidated',
      },
    };
    expect(() => strictResultsEnvelope(
      [live],
      '2026-07-16T12:00:00.000Z',
      ENV,
      SUPPORT,
    )).toThrow(/scenario identity is unavailable/);
    const envelope = strictResultsEnvelope(
      [live],
      '2026-07-16T12:00:00.000Z',
      ENV,
      SUPPORT,
      () => ({ revision: 1, definitionHash: SHA_A }),
    );
    expect(envelope.results[0]).toMatchObject({
      schemaVersion: 2,
      scenarioRevision: 1,
      definitionHash: SHA_A,
      instance: { scenarioId: 'probe/example', inputVariantId: 'selected:baked', inputSha256: null },
      cacheReuse: { sourceRunId: 'prior-run', sourceKey: 'source-row' },
    });

    const missingReasonCode = {
      ...displayResult('PASS', 'malformed live producer'),
      oracleOutcomes: [{ state: 'VERDICT', oracle: 'golden-metadata', verdict: 'PASS' }],
    } as unknown as ScenarioResult;
    expect(() => strictResultsEnvelope(
      [missingReasonCode],
      '2026-07-16T12:00:00.000Z',
      ENV,
      SUPPORT,
      () => ({ revision: 1, definitionHash: SHA_A }),
    )).toThrow(/reasonCode/);
  });

  test('failed terminal state preserves streamed rows and completed state rejects stale partial reasons', () => {
    const completed = completedArtifact();
    const failedManifest = finalizeRunManifest(
      completed.manifest,
      completed.results,
      'failed',
      '2026-07-16T12:01:00.000Z',
      CACHE,
      'adapter threw after the streamed cell',
    );
    const failed = createCanonicalRunArtifact({
      manifest: failedManifest,
      registration: REGISTRATION,
      env: ENV,
      support: SUPPORT,
      results: completed.results,
    });
    expect(failed.completionState).toBe('failed');
    expect(failed.partialReason).toContain('adapter threw');
    expect(failed.results).toHaveLength(1);
    expect(() => validateCanonicalRunArtifact({ ...completed, partialReason: 'stale prior error' }))
      .toThrow(/completed run cannot carry a stale partial reason/);
  });
});

describe('REQ-UI-03: streamed evidence survives failure and each run starts clean', () => {
  test('a top-level exception preserves every immutable streamed row in a failed export', () => {
    const rows = ['engine-a@1', 'engine-b@1', 'engine-c@1'].map((engineId) => ({
      ...strictResult(),
      engineId,
      env: { ...strictResult().env!, engineId },
    }));
    let evidence = beginBrowserRunEvidence();
    for (const row of rows) evidence = appendBrowserRunEvidence(evidence, row);
    const beforeFailure = evidence.results;
    evidence = failBrowserRunEvidence(evidence, 'adapter threw after three streamed cells');

    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.results)).toBe(true);
    expect(evidence.results).toEqual(beforeFailure);
    expect(evidence.terminalError).toContain('adapter threw');

    const failed = artifactFromRows(
      evidence.results,
      'failed',
      evidence.terminalError,
    );
    expect(failed.completionState).toBe('failed');
    expect(failed.results.map((row) => row.engineId)).toEqual(['engine-a@1', 'engine-b@1', 'engine-c@1']);
    expect(failed.partialReason).toBe(evidence.terminalError);

    const nextRun = appendBrowserRunEvidence(beginBrowserRunEvidence(), rows[0]!);
    const reconciled = reconcileBrowserRunEvidence(nextRun, [rows[0]!]);
    expect(reconciled.results).toHaveLength(1);
    expect(reconciled.terminalError).toBeUndefined();
    expect(completedArtifact().partialReason).toBeUndefined();
  });
});

describe('REQ-UI-13: stop messaging reflects the active cancellation boundary and inner progress', () => {
  test('ordinary short, long, cached, and undeclared-hard-cancel work wait at a safe boundary', () => {
    for (const currentCell of [
      'probe/short / engine@1',
      'transcode/long / engine@1',
      'probe/cached-cache-validation / engine@1',
      'mux/non-preemptible / engine@1',
    ]) {
      const presentation = cancellationPresentation({
        lastCompletedCell: 'probe/already-complete / engine@1',
        currentCell,
        cancellationBoundary: 'safe-boundary-only',
      });
      expect(presentation.state).toBe('waiting-safe-boundary');
      expect(presentation.buttonLabel).toBe('Stopping at safe boundary…');
      expect(presentation.status).toContain('treated as non-preemptible');
      expect(presentation.currentWork).toContain(currentCell);
      expect(presentation.currentWork).toContain('Last completed cell');
    }
  });

  test('a ten-file exhaustive cell reports its exact file position while stopping', () => {
    const presentation = cancellationPresentation({
      lastCompletedCell: 'probe/previous / engine@1',
      currentCell: 'robustness/exhaustive / engine@1',
      currentFile: {
        label: 'robustness/exhaustive / engine@1 / corrupt-04.mp4',
        completed: 4,
        total: 10,
      },
      cancellationBoundary: 'safe-boundary-only',
    });
    expect(presentation.state).toBe('waiting-safe-boundary');
    expect(presentation.currentWork).toContain('corrupt-04.mp4');
    expect(presentation.currentWork).toContain('4 of 10 inputs resolved');
    expect(presentation.currentWork).toContain('non-preemptible safe boundary');
  });

  test('only a proven terminable Worker is announced as actively cancelling', () => {
    const presentation = cancellationPresentation({
      currentCell: 'robustness/worker-isolated / engine@1',
      cancellationBoundary: 'terminable-worker',
    });
    expect(presentation.state).toBe('cancelling');
    expect(presentation.buttonLabel).toBe('Cancelling current work…');
    expect(presentation.status).toContain('terminable Worker is cancelling now');

    const noInFlight = cancellationPresentation({ cancellationBoundary: 'safe-boundary-only' });
    expect(noInFlight.state).toBe('waiting-safe-boundary');
    expect(noInFlight.status).toContain('no cell is in flight');
  });

  test('a stopping snapshot retains all completed rows and a coherent partial reason', () => {
    const row = strictResult();
    const partial = artifactFromRows([row], 'stopping', 'operator stop requested at a safe boundary');
    expect(partial.completionState).toBe('stopping');
    expect(partial.results).toHaveLength(1);
    expect(partial.partialReason).toContain('safe boundary');
    expect(partial.manifest.observedCellCount).toBe(1);
    expect(partial.manifest.expectedCellCount).toBe(1);
  });
});

describe('REQ-UI-14: Resume is reserved for an exact validated checkpoint', () => {
  test('new-run wording is the default and every checkpoint identity must match for Resume', () => {
    expect(runContinuationAction()).toEqual({
      resumable: false,
      label: 'Start new run',
      reason: 'No validated checkpoint is restored.',
    });
    const exact = {
      runId: 'run-checkpoint',
      checkpointRunId: 'run-checkpoint',
      manifestDigest: 'b'.repeat(64),
      checkpointManifestDigest: 'b'.repeat(64),
      cacheValidated: true,
      completedCellSetRestored: true,
      selectedInputHashes: [SHA_A],
      checkpointInputHashes: [SHA_A],
    } as const;
    expect(runContinuationAction(exact)).toMatchObject({
      resumable: true,
      label: 'Resume validated run',
    });
    for (const invalid of [
      { ...exact, checkpointRunId: 'another-run' },
      { ...exact, checkpointManifestDigest: 'c'.repeat(64) },
      { ...exact, cacheValidated: false },
      { ...exact, completedCellSetRestored: false },
      { ...exact, checkpointInputHashes: ['d'.repeat(64)] },
      { ...exact, selectedInputHashes: [] },
    ]) {
      expect(runContinuationAction(invalid)).toMatchObject({
        resumable: false,
        label: 'Start new run',
      });
    }
  });
});

describe('REQ-UI-09/18: cache validation and non-fatal failure evidence', () => {
  test('cache exports are content-addressed and tampering is rejected', () => {
    const substantive = {
      schema: CACHE_EXPORT_SCHEMA,
      generatedAtIso: '2026-07-16T12:00:00.000Z',
      sourceOrigin: 'http://127.0.0.1:5173',
      validationEpoch: CACHE_VALIDATION_EPOCH,
      entries: [],
    };
    const bundle = { ...substantive, contentHash: canonicalContentHash(substantive) };
    expect(validateCacheExportBundle(bundle)).toEqual(bundle);
    expect(() => validateCacheExportBundle({ ...bundle, sourceOrigin: 'http://127.0.0.1:5174' }))
      .toThrow(/contentHash mismatch/);
  });

  test('an IndexedDB open failure is announced in a total cache snapshot', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    const warnings: string[] = [];
    try {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: { open: () => { throw new Error('injected open failure'); } },
      });
      const cache = createResultCache({ onWarning: (warning) => warnings.push(warning), origin: 'http://127.0.0.1:5173' });
      expect(cache).toBeDefined();
      await expect(cache!.get('engine@1', 'probe/example', 'chromium')).rejects.toThrow('injected open failure');
      const snapshot = await cache!.snapshot();
      expect(snapshot.available).toBe(false);
      expect(snapshot.lastError).toContain('injected open failure');
      expect(snapshot.expiry).toMatchObject({
        FAIL: 'until validation epoch changes',
        ERROR: '15 minutes or validation epoch change',
        NA_BROWSER: '24 hours or validation epoch change',
      });
      expect(warnings.join(' ')).toContain('cache unavailable');

      const oldSubstantive = {
        schema: CACHE_EXPORT_SCHEMA,
        generatedAtIso: '2026-07-16T12:00:00.000Z',
        sourceOrigin: 'http://127.0.0.1:5174',
        validationEpoch: 'old-validation-epoch',
        entries: [],
      };
      await expect(cache!.importBundle({
        ...oldSubstantive,
        contentHash: canonicalContentHash(oldSubstantive),
      })).rejects.toThrow(/does not match/);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
      else delete (globalThis as { indexedDB?: unknown }).indexedDB;
    }
    expect(unavailableCacheSnapshot('no storage').lastError).toBe('no storage');
  });

  test('an injected quota write failure is visible and cannot mutate the live verdict', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    const warnings: string[] = [];
    try {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: {
          open: () => {
            const request: Record<string, unknown> = {
              result: {
                transaction: () => { throw new DOMException('injected quota failure', 'QuotaExceededError'); },
              },
            };
            queueMicrotask(() => (request.onsuccess as (() => void) | undefined)?.());
            return request;
          },
        },
      });
      const cache = createResultCache({ onWarning: (warning) => warnings.push(warning) });
      const live = displayResult('PASS', 'representation remains valid');
      const before = JSON.stringify(live);
      await expect(cache!.put(live)).rejects.toThrow('injected quota failure');
      expect(JSON.stringify(live)).toBe(before);
      expect(live.status).toBe('PASS');
      expect(warnings.join(' ')).toContain('cache unavailable (quota exceeded)');
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
      else delete (globalThis as { indexedDB?: unknown }).indexedDB;
    }
  });
});

describe('reload view uses the existing result cache', () => {
  test('selects one latest source run, normalizes cache-tagged scenario ids, and never mixes browsers', () => {
    const row = (
      key: string,
      runId: string,
      updatedAtIso: string,
      result: ScenarioResult,
      overrides: Partial<CachedResultRow> = {},
    ): CachedResultRow => ({
      key,
      createdAtIso: updatedAtIso,
      updatedAtIso,
      sourceRunId: runId,
      originalOrigin: 'http://127.0.0.1:5151',
      validationEpoch: CACHE_VALIDATION_EPOCH,
      result,
      invalidated: false,
      ...overrides,
    });
    const entries = [
      row('old', 'run-old', '2026-07-17T10:00:00.000Z', displayResult('FAIL', 'old result')),
      row('newer-duplicate', 'run-new', '2026-07-18T10:01:00.000Z', {
        ...displayResult('PASS', 'new result'),
        scenarioId: `probe/example#selection-sha256:${SHA_A}`,
      }),
      row('older-duplicate', 'run-new', '2026-07-18T10:00:00.000Z', {
        ...displayResult('FAIL', 'superseded physical cache row'),
        scenarioId: `probe/example#selection-sha256:${'b'.repeat(64)}`,
      }),
      row('new-second-cell', 'run-new', '2026-07-18T10:02:00.000Z', {
        ...displayResult('ERROR', 'diagnostic remains visible but is not reusable'),
        engineId: 'engine@2',
        scenarioId: 'probe/other',
      }, { invalidated: true, invalidationReason: 'missing full execution-manifest fingerprint' }),
      row('other-browser', 'run-other-browser', '2026-07-18T11:00:00.000Z', {
        ...displayResult('PASS', 'firefox result'),
        browser: 'firefox',
      }),
      row('old-epoch', 'run-old-epoch', '2026-07-18T12:00:00.000Z', displayResult('PASS', 'stale epoch'), {
        validationEpoch: 'previous-epoch',
      }),
    ];

    const view = latestCachedRunView(entries, 'chromium', ['probe/example', 'probe/other']);
    expect(view?.sourceRunId).toBe('run-new');
    expect(view?.updatedAtIso).toBe('2026-07-18T10:02:00.000Z');
    expect(view?.results.map((result) => [result.engineId, result.scenarioId, result.status])).toEqual([
      ['engine@1', 'probe/example', 'PASS'],
      ['engine@2', 'probe/other', 'ERROR'],
    ]);
  });
});

describe('REQ-UI-16: loopback and opt-in save boundary', () => {
  const token = 'non-guessable-test-token-0123456789abcdef';
  const headers = {
    host: '127.0.0.1:5173',
    origin: 'http://127.0.0.1:5173',
    'content-type': 'application/json',
    'x-media-test-save-token': token,
  };

  test('disabled, unauthenticated, traversal, sibling, cross-origin, non-JSON, and oversized requests reject', () => {
    const base = { enabled: true, token, method: 'POST', url: '/__save?path=results/raw/run.json', headers, cwd: ROOT };
    expect(inspectSaveRequest({ ...base, enabled: false }).status).toBe(404);
    expect(inspectSaveRequest({ ...base, headers: { ...headers, 'x-media-test-save-token': '' } }).status).toBe(401);
    expect(inspectSaveRequest({ ...base, url: '/__save?path=results/../outside.json' }).status).toBe(403);
    expect(inspectSaveRequest({ ...base, url: '/__save?path=results-sibling/evil.json' }).status).toBe(403);
    expect(inspectSaveRequest({ ...base, headers: { ...headers, origin: 'https://evil.example' } }).status).toBe(403);
    expect(inspectSaveRequest({ ...base, headers: { ...headers, 'content-type': 'text/plain' } }).status).toBe(415);
    expect(inspectSaveRequest({ ...base, headers: { ...headers, 'content-length': String(SAVE_ENDPOINT_MAX_BYTES + 1) } }).status).toBe(413);
    expect(inspectSaveRequest({ ...base, url: '/__save?path=results/raw/run.txt' }).status).toBe(415);

    const cwd = mkdtempSync(join(tmpdir(), 'media-test-save-link-'));
    try {
      mkdirSync(join(cwd, 'results'));
      mkdirSync(join(cwd, 'outside'));
      symlinkSync('../outside', join(cwd, 'results/link'));
      expect(inspectSaveRequest({ ...base, cwd, url: '/__save?path=results/link/escape.json' }).status).toBe(403);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('the explicit local handler writes one bounded JSON descendant and emits no wildcard CORS header', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'media-test-save-'));
    try {
      const response = await invokeSave({
        enabled: true,
        token,
        cwd,
        url: '/__save?path=results/raw/run.json',
        headers,
        body: JSON.stringify({ runId: 'accepted' }),
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(JSON.parse(readFileSync(join(cwd, 'results/raw/run.json'), 'utf8'))).toEqual({ runId: 'accepted' });
      expect(relative(resolve(cwd, 'results'), resolve(cwd, 'results/raw/run.json')).startsWith('..')).toBe(false);

      const oversized = await invokeSave({
        enabled: true,
        token,
        cwd,
        maxBytes: 16,
        url: '/__save?path=results/raw/too-large.json',
        headers,
        body: JSON.stringify({ payload: 'x'.repeat(32) }),
      });
      expect(oversized.statusCode).toBe(413);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('Vite keeps ES-module workers and defaults both servers to loopback port 5151', () => {
    expect(viteConfig.worker).toEqual({ format: 'es' });
    expect(viteConfig.server).toEqual({ host: '127.0.0.1', port: 5151, strictPort: true });
    expect(viteConfig.preview).toEqual({ host: '127.0.0.1', port: 5151, strictPort: true });
    expect(viteConfig.plugins.map((plugin: { name: string }) => plugin.name)).toEqual([
      'cross-origin-isolation', 'ffmpeg-vendor-static', 'save-results', 'fixtures-static',
    ]);
    expect(staticContentType(join(ROOT, 'fixtures/lib/lossless-json-columnar-validator.mjs')))
      .toBe('text/javascript; charset=utf-8');
    expect(staticContentType(join(ROOT, 'fixtures/media/h264_ts.ts'))).toBe('video/mp2t');
    expect(staticContentType(join(ROOT, 'fixtures/media/hls_aes128/enc.key'))).toBe('application/octet-stream');
  });
});

describe('REQ-UI-10/11/12/14/20/21: static accessibility and CLI contracts', () => {
  test('the launcher-ready boundary follows asynchronous cached-run restoration', () => {
    const app = readFileSync(join(ROOT, 'src/app/main.ts'), 'utf8');
    const launcher = readFileSync(join(ROOT, 'scripts/launch.mjs'), 'utf8');
    const restoreIndex = app.indexOf('const restored = await restoreLatestCachedRun();');
    const publishIndex = app.indexOf('window.__SUITE__ = {');
    const readyIndex = app.indexOf('ready: true', publishIndex);
    const restoreFunctionIndex = app.indexOf('async function restoreLatestCachedRun()');
    const restoreFunctionEnd = app.indexOf('\nfunction startRunFromFilter(', restoreFunctionIndex);
    const snapshotStart = app.indexOf('async function snapshotRun(');
    const snapshotEnd = app.indexOf('\nfunction scenarioIdentity(', snapshotStart);

    expect(launcher).toContain('window.__SUITE__?.ready === true');
    expect(restoreIndex).toBeGreaterThan(-1);
    expect(publishIndex).toBeGreaterThan(restoreIndex);
    expect(readyIndex).toBeGreaterThan(publishIndex);
    const restoreBody = app.slice(restoreFunctionIndex, restoreFunctionEnd);
    expect(restoreBody).not.toContain('window.__RUN_DONE__ = true');
    expect(launcher).toContain('window.__SUITE__.start(requestId, filter)');
    expect(launcher).toContain('isLauncherRunDone(handshake, launchRequestId)');
    expect(launcher).toContain('let lastLog = started');
    expect(launcher).toContain('isLauncherRunPending(pageDiagnostic.handshake, launchRequestId)');
    expect(launcher).toContain('info.handshakeSchema !== LAUNCHER_RUN_HANDSHAKE_SCHEMA');
    const snapshotBody = app.slice(snapshotStart, snapshotEnd);
    expect(snapshotBody).toContain('const run = activeRun;');
    expect(snapshotBody.indexOf('const run = activeRun;')).toBeLessThan(snapshotBody.indexOf('await cacheSnapshot'));
    expect(snapshotBody.slice(snapshotBody.indexOf('await cacheSnapshot'))).not.toContain('activeRun.');
  });

  test('the document exposes native progress/status controls, every legend state, and honest reference copy', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/<progress id="run-progress"[^>]*min="0"[^>]*max="1"/);
    expect(html).toMatch(/<progress id="file-progress"[^>]*min="0"[^>]*max="1"/);
    expect(html).toContain('id="live-status" role="status" aria-live="polite"');
    expect(html).toMatch(/id="randomize-order" type="checkbox" \/>/);
    expect(html).toMatch(/id="exhaustive-media" type="checkbox" checked \/>/);
    expect(html).not.toContain('Run configuration &amp; provenance');
    expect(html).not.toContain('id="run-config-section"');
    expect(html).toContain('Jump to current cell');
    for (const status of ['PASS', 'FAIL', 'NA_ENGINE', 'NA_BROWSER', 'NA_ASSET', 'SKIPPED', 'ERROR']) {
      expect(html).toContain(`<option value="${status}">${status}</option>`);
    }
    expect(html).not.toMatch(/reference engine/i);
    expect(html).not.toMatch(/>Resume<|>Continue run</i);
  });

  test('canonical launcher and wrapper help are generated from one option list with accurate browser copy', () => {
    const launcher = spawnText(['bun', 'scripts/launch.mjs', '--help']);
    const wrapper = spawnText(['bash', 'scripts/run.sh', '--help']);
    const server = spawnText(['bash', 'scripts/serve.sh', '--help']);
    for (const definition of RUN_OPTION_DEFINITIONS) {
      expect(countOccurrences(launcher, definition.cli)).toBe(1);
      expect(countOccurrences(wrapper, definition.cli)).toBe(1);
    }
    expect(`${launcher}\n${wrapper}\n${server}`).not.toMatch(/headless|headed/i);
    expect(launcher).toContain('visible browser window');
    expect(wrapper).toContain('visible window');
    expect(server).toContain('loopback by default');
    expect(RUN_OPTION_LIMITS.timeoutMs.default).toBe(86_400_000);
    expect(wrapper).toContain('Default run deadline: 86400000 ms (24 hours).');
  });

  test('run.sh accepts and forwards every canonical value exactly once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-test-cli-'));
    try {
      const fakeBun = join(dir, 'bun');
      writeFileSync(fakeBun, '#!/usr/bin/env bash\nprintf "ARG=%s\\n" "$@"\n');
      chmodSync(fakeBun, 0o755);
      const child = Bun.spawnSync([
        'bash', 'scripts/run.sh',
        '--no-serve', '--base-url', 'http://127.0.0.1:5173',
        '--browser', 'chromium', '--engine', 'engine', '--feature', 'probe',
        '--operation', 'probe', '--scenario', 'probe/example', '--pillar', 'functional',
        '--warmup', '0', '--iters', '2', '--timeout-ms', '1000', '--random-seed', 'seed-1',
        '--exhaustive', '--no-reuse',
      ], {
        cwd: ROOT,
        env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const output = child.stdout.toString();
      expect(child.exitCode).toBe(0);
      for (const definition of RUN_OPTION_DEFINITIONS) {
        expect(countOccurrences(output, `ARG=${definition.cli}\n`)).toBe(1);
      }
      expect(output).not.toMatch(/ARG=--headed|ARG=--headless/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function displayResult(status: ResultStatus, reason: string): ScenarioResult {
  return {
    engineId: 'engine@1', browser: 'chromium', scenarioId: 'probe/example', family: 'probe', status, reason,
    oracleOutcomes: status === 'PASS' || status === 'FAIL'
      ? [{ state: 'VERDICT', oracle: 'golden-metadata', verdict: status, reasonCode: `TEST_${status}`, detail: reason }]
      : [],
  };
}

function frozenConfiguration(): FrozenRunConfiguration {
  return freezeRunConfiguration({
    browser: 'chromium', engineIds: ['engine'], featureIds: ['probe'], scenarioIds: ['probe/example'],
    operations: ['probe'], pillar: 'functional', warmup: 0, iters: 1, timeoutMs: 1_000,
    reuseData: true, randomizeOrder: true, randomSeed: 'artifact-seed', exhaustiveMedia: false,
  }, { browser: 'chromium', engineIds: [], featureIds: [], scenarioIds: [] });
}

function strictResult(): ScenarioResultV2 {
  return {
    schemaVersion: 2,
    engineId: 'engine@1',
    engineVersion: '1',
    browser: 'chromium',
    scenarioId: 'probe/example',
    scenarioRevision: 1,
    definitionHash: SHA_A,
    instance: {
      scenarioId: 'probe/example', scenarioRevision: 1, definitionHash: SHA_A,
      inputVariantId: 'baked', inputSha256: null,
    },
    inputVariantId: 'baked',
    family: 'probe',
    status: 'PASS',
    oracleOutcomes: [{
      state: 'VERDICT', oracle: 'golden-metadata', verdict: 'PASS', reasonCode: 'METADATA_MATCH',
    }],
    env: {
      suiteVersion: 'test-suite', engineId: 'engine@1', browser: 'chromium',
      browserVersion: '126.0.0', userAgent: ENV.userAgent, gpu: ENV.gpu,
      corpusChecksum: 'fixture-corpus', acPower: true, configUsed: { mode: 'test' },
    },
    startedAtIso: '2026-07-16T12:00:00.000Z',
    durationMs: 12,
  };
}

function artifactFromRows(
  results: readonly ScenarioResult[],
  completionState: RunCompletionState,
  partialReason?: string,
) {
  const engineIds = results.map((result) => result.engineId);
  const configuration = freezeRunConfiguration({
    browser: 'chromium',
    engineIds,
    featureIds: ['probe'],
    scenarioIds: ['probe/example'],
    operations: ['probe'],
    pillar: 'functional',
    warmup: 0,
    iters: 1,
    timeoutMs: 1_000,
    reuseData: true,
    randomizeOrder: false,
    randomSeed: 'terminal-evidence-seed',
    exhaustiveMedia: false,
  }, { browser: 'chromium', engineIds: [], featureIds: [], scenarioIds: [] });
  const scenario = {
    id: 'probe/example', revision: 1, definitionHash: SHA_A,
    oracles: ['golden-metadata'], tolerances: {},
  } as unknown as Scenario;
  const base = createRunManifest({
    runId: `run-${completionState}-acceptance`,
    startedAtIso: '2026-07-16T12:00:00.000Z',
    completionState: 'running',
    suiteVersion: 'test-suite',
    buildRevision: 'test-build',
    env: ENV,
    support: SUPPORT,
    configuration,
    engineInstanceIds: engineIds,
    scenarios: [scenario],
    executionOrder: results.map((result) => ({
      engineId: result.engineId,
      scenarioId: result.scenarioId,
    })),
    cache: CACHE,
    registration: REGISTRATION,
  });
  const manifest = finalizeRunManifest(
    base,
    results,
    completionState,
    '2026-07-16T12:01:00.000Z',
    CACHE,
    partialReason,
  );
  return createCanonicalRunArtifact({
    manifest,
    registration: REGISTRATION,
    env: ENV,
    support: SUPPORT,
    results,
  });
}

function completedArtifact() {
  const configuration = frozenConfiguration();
  const scenario = {
    id: 'probe/example', revision: 1, definitionHash: SHA_A,
    oracles: ['golden-metadata'], tolerances: {},
  } as unknown as Scenario;
  const base = createRunManifest({
    runId: 'run-ui-acceptance',
    startedAtIso: '2026-07-16T12:00:00.000Z',
    completionState: 'running',
    suiteVersion: 'test-suite',
    buildRevision: 'test-build',
    env: ENV,
    support: SUPPORT,
    configuration,
    engineInstanceIds: ['engine@1'],
    scenarios: [scenario],
    executionOrder: [{ engineId: 'engine@1', scenarioId: 'probe/example' }],
    cache: CACHE,
    registration: REGISTRATION,
  });
  const result = strictResult();
  const manifest = finalizeRunManifest(
    base, [result], 'completed', '2026-07-16T12:00:12.000Z', CACHE,
  );
  return createCanonicalRunArtifact({
    manifest, registration: REGISTRATION, env: ENV, support: SUPPORT, results: [result],
  });
}

interface SaveInvocation {
  enabled: boolean;
  token: string;
  cwd: string;
  url: string;
  headers: Record<string, string>;
  body: string | Buffer;
  maxBytes?: number;
}

async function invokeSave(input: SaveInvocation): Promise<{
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}> {
  const request = new PassThrough() as PassThrough & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  request.method = 'POST';
  request.url = input.url;
  request.headers = input.headers;
  let responseBody = '';
  let finish!: () => void;
  const finished = new Promise<void>((resolvePromise) => { finish = resolvePromise; });
  const response = {
    statusCode: 200,
    writableEnded: false,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = String(value);
    },
    end(value?: unknown) {
      if (this.writableEnded) return;
      this.writableEnded = true;
      responseBody = value === undefined ? '' : String(value);
      finish();
    },
  };
  let nextCalled = false;
  const handler = createSaveEndpointHandler({
    enabled: input.enabled, token: input.token, cwd: input.cwd, maxBytes: input.maxBytes,
  });
  handler(request, response, () => { nextCalled = true; finish(); });
  request.end(input.body);
  await finished;
  expect(nextCalled).toBe(false);
  return { statusCode: response.statusCode, body: responseBody, headers: response.headers };
}

function spawnText(command: string[]): string {
  const child = Bun.spawnSync(command, { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString();
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}
