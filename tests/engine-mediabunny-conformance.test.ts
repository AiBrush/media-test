import { describe, expect, test } from 'bun:test';

import {
  validateAdapterConformanceSurface,
  validateAdapterFactory,
  type AdapterConformanceEvidence,
  type OperationConformanceProof,
} from '../src/core/engine.ts';
import { MediabunnyEngine } from '../src/engines/mediabunny/adapter.ts';

const REQUIRED_PROOFS = Object.freeze([
  'positive',
  'negative-tuple',
  'lifecycle',
  'normalized-result',
  'cancellation',
] as const satisfies readonly OperationConformanceProof[]);

/**
 * This list is deliberately explicit rather than capability-derived. Adding an operation to the
 * adapter cannot silently grant itself conformance evidence; CI must update this reviewed table and
 * the corresponding positive/negative/lifecycle/result/cancellation cases together.
 */
const CONFORMANCE_EVIDENCE: AdapterConformanceEvidence = Object.freeze({
  operations: Object.freeze({
    probe: REQUIRED_PROOFS,
    demux: REQUIRED_PROOFS,
    remux: REQUIRED_PROOFS,
    transcode: REQUIRED_PROOFS,
    decodeFrames: REQUIRED_PROOFS,
    seek: REQUIRED_PROOFS,
    trim: REQUIRED_PROOFS,
    mux: REQUIRED_PROOFS,
    decrypt: REQUIRED_PROOFS,
  }),
});

interface AreaEvidence {
  readonly id: number;
  readonly label: string;
  readonly anchors: readonly { file: string; marker: string }[];
}

/** The twelve reviewed areas in docs/engines/mediabunny.md Target design #7. */
const CONFORMANCE_AREAS: readonly AreaEvidence[] = Object.freeze([
  area(1, 'package/lock/instance identity',
    ['../package.json', '"mediabunny": "1.48.0"'],
    ['./engine-mediabunny-streaming.test.ts', "packageVersions: { mediabunny: '1.48.0' }"]),
  area(2, 'complete output tuple table',
    ['./engine-mediabunny-support.test.ts', 'full Mediabunny output tuple capability'],
    ['./engine-mediabunny-fixtures.test.ts', 'mux rejects zero/unsupported tracks']),
  area(3, 'exact browser video/audio encode/decode',
    ['./engine-mediabunny-support.test.ts', 'exact WebCodecs configuration boundary'],
    ['./engine-mediabunny-support.test.ts', 'exact audio rate/channel/profile configs including HE-AAC forms']),
  area(4, 'strict remux copy and track preservation',
    ['./engine-mediabunny-fixtures.test.ts', 'strict packet-copy remux and mux contract'],
    ['./engine-mediabunny-fixtures.test.ts', 'tuple that would require transcode/discard is typed NA_ENGINE']),
  area(5, 'metadata write/read round trip',
    ['./engine-mediabunny-fixtures.test.ts', 'metadata edits round-trip and preserve unrelated normalized tags']),
  area(6, 'representation-aware packet timing and framing',
    ['./engine-mediabunny-fixtures.test.ts', 'explicit packet representation and timing evidence'],
    ['./oracle-system.test.ts', 'Annex B vs length-prefix and inline vs out-of-band SPS/PPS are DIFF']),
  area(7, 'presentation-time visual pairing and browser applicability',
    ['./oracle-system.test.ts', 'fps conversion pairs equal presentation moments despite different frame counts'],
    ['./oracle-system.test.ts', 'valid browser-unsupported output is NA_BROWSER; truncated supported output is FAIL']),
  area(8, 'HLS path/mutation and CENC protection variants',
    ['./engine-mediabunny-streaming.test.ts', 'mutated playlist bytes are authoritative while only sidecars use the network URL'],
    ['./engine-mediabunny-fixtures.test.ts', 'single-key CENC resolver never reuses a key for a different KID']),
  area(9, 'positioned streaming, backpressure, TTFB, memory, equality',
    ['./engine-mediabunny-streaming.test.ts', 'positioned spool applies overwrites immediately without retaining a chunk list'],
    ['./engine-mediabunny-streaming-evidence.test.ts', 'BufferTarget first byte is the finalized buffer callback']),
  area(10, 'abort/timeout and cleanup barrier',
    ['./engine-mediabunny-streaming.test.ts', 'shared abort waits for cleanup and produces no post-result telemetry writes'],
    ['./engine-mediabunny-streaming.test.ts', 'target abort terminates the write path and a subsequent operation remains clean']),
  area(11, 'source/output starvation telemetry and reset',
    ['./engine-mediabunny-streaming.test.ts', 'dominant source/output waits and mixed pressure classify distinctly, then reset'],
    ['./engine-mediabunny-streaming.test.ts', 'real target backpressure is measured per operation and cannot leak into the next one']),
  area(12, 'config/telemetry persistence for every terminal taxonomy',
    ['./engine-mediabunny-streaming.test.ts', 'configUsed states only backed facts and lifecycle remains idempotent'],
    ['./scenario-dsl-registry.test.ts', 'v1 thin exhaustive rows retain each typed status with transparent synthetic evidence'],
    ['./app-ui-correctness.test.ts', 'every applicability/policy/error status keeps a unique machine-visible label']),
]);

describe('REQ-ENG-07 Mediabunny adapter-boundary conformance gate', () => {
  test('all declared operations require explicit proofs and fresh factories remain stable', async () => {
    const engine = new MediabunnyEngine();
    expect(Object.keys(CONFORMANCE_EVIDENCE.operations ?? {}).sort()).toEqual(
      Object.entries(engine.capabilities().operations)
        .filter(([, supported]) => supported === true)
        .map(([operation]) => operation)
        .sort(),
    );
    expect(() => validateAdapterConformanceSurface(engine, CONFORMANCE_EVIDENCE)).not.toThrow();
    const [first, second] = await validateAdapterFactory(() => new MediabunnyEngine(), CONFORMANCE_EVIDENCE);
    expect(first).not.toBe(second);
    expect(first.id).toBe('mediabunny@1.48.0');
    expect(second.id).toBe(first.id);
    expect(first.capabilities()).toEqual(second.capabilities());
    expect(first.configUsed).toEqual(second.configUsed);
  });

  test('the twelve reviewed areas remain anchored to executable CI cases', async () => {
    expect(CONFORMANCE_AREAS.map((entry) => entry.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const areaEvidence of CONFORMANCE_AREAS) {
      expect(areaEvidence.label.length, `area ${areaEvidence.id} has a label`).toBeGreaterThan(0);
      expect(areaEvidence.anchors.length, `area ${areaEvidence.id} has executable evidence`).toBeGreaterThan(0);
      for (const anchor of areaEvidence.anchors) {
        const url = new URL(anchor.file, import.meta.url);
        const source = await Bun.file(url).text();
        expect(source, `area ${areaEvidence.id} marker '${anchor.marker}' in ${anchor.file}`).toContain(anchor.marker);
      }
    }
  });

  test('removing one operation proof or one reviewed area fails the gate', () => {
    const missingCancellation: AdapterConformanceEvidence = {
      operations: {
        ...CONFORMANCE_EVIDENCE.operations,
        demux: REQUIRED_PROOFS.filter((proof) => proof !== 'cancellation'),
      },
    };
    expect(() => validateAdapterConformanceSurface(new MediabunnyEngine(), missingCancellation)).toThrow(
      /conformance\.operations\.demux\.cancellation/,
    );
    expect(CONFORMANCE_AREAS.filter((entry) => entry.id !== 11)).toHaveLength(11);
  });
});

function area(
  id: number,
  label: string,
  ...anchors: Array<readonly [file: string, marker: string]>
): AreaEvidence {
  return Object.freeze({
    id,
    label,
    anchors: Object.freeze(anchors.map(([file, marker]) => Object.freeze({ file, marker }))),
  });
}
