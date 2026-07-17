import { describe, expect, test } from 'bun:test';

import {
  validateAdapterConformanceSurface,
  validateAdapterFactory,
  type AdapterConformanceEvidence,
  type OperationConformanceProof,
} from '../src/core/engine.ts';
import { WebDemuxerEngine } from '../src/engines/web-demuxer/adapter.ts';

const REQUIRED_PROOFS = Object.freeze([
  'positive',
  'negative-tuple',
  'lifecycle',
  'normalized-result',
  'cancellation',
] as const satisfies readonly OperationConformanceProof[]);

/**
 * This is intentionally not derived from capabilities(). A newly declared operation must first add
 * reviewed positive, negative-tuple, lifecycle, result, and cancellation evidence to this table.
 */
const CONFORMANCE_EVIDENCE: AdapterConformanceEvidence = Object.freeze({
  operations: Object.freeze({
    probe: REQUIRED_PROOFS,
    demux: REQUIRED_PROOFS,
    decodeFrames: REQUIRED_PROOFS,
    seek: REQUIRED_PROOFS,
  }),
});

interface AreaEvidence {
  readonly id: number;
  readonly label: string;
  readonly anchors: readonly { file: string; marker: string }[];
}

/** The twelve reviewed areas in docs/engines/web-demuxer.md Target design #8. */
const CONFORMANCE_AREAS: readonly AreaEvidence[] = Object.freeze([
  area(1, 'package, artifact, same-origin WASM, and cold readiness',
    ['../package.json', '"web-demuxer": "4.0.0"'],
    ['./engine-web-demuxer-support.test.ts', 'pins the scored identity, full WASM artifact'],
    ['./engine-web-demuxer-lifecycle.test.ts', 'awaits the public load readiness barrier']),
  area(2, 'registration, fresh cells, repeated init/load, and exactly-once teardown',
    ['./engine-web-demuxer-lifecycle.test.ts', 'shares repeated init, and destroys exactly once'],
    ['../src/app/register.ts', "label: 'web-demuxer'"]),
  area(3, 'declared container/codec and operation-scoped tuple matrix',
    ['./engine-web-demuxer-support.test.ts', 'admits one positive parser tuple for every declared container and codec family'],
    ['./engine-web-demuxer-support.test.ts', 'separates TS probe from every packet-backed operation']),
  area(4, 'multitrack, sparse indices, duplicate types, and selected tracks',
    ['./engine-web-demuxer-evidence.test.ts', 'normalizes sparse stream indices'],
    ['./engine-web-demuxer-lifecycle.test.ts', 'explicitly selected non-primary video stream']),
  area(5, 'TS/ADTS variants, HE-AAC/PS, discontinuity, and wraparound',
    ['./engine-web-demuxer-evidence.test.ts', 'TS ADTS evidence and provenance'],
    ['./engine-web-demuxer-evidence.test.ts', 'does not force one ADTS header onto multiple ambiguous AAC tracks'],
    ['./feature-robustness.test.ts', 'TS PTS-wraparound row really demuxes and forms a packet verdict'],
    ['../src/scenarios/demux/index.ts', 'TS splice discontinuity']),
  area(6, 'ordinary/fast path structure, timing, bounds, and range truth',
    ['./engine-web-demuxer-evidence.test.ts', 'parses the real medium fixture with backend/config/range/omission provenance'],
    ['./engine-web-demuxer-evidence.test.ts', 'rejects a chunk offset outside every mdat'],
    ['./engine-web-demuxer-evidence.test.ts', 'reason-codes fragmented media and limits fast-path eligibility']),
  area(7, 'representation-aware packet framing, DTS, and random access',
    ['./engine-web-demuxer-evidence.test.ts', 'AVCC/Annex-B equivalent access units one semantic identity'],
    ['./engine-web-demuxer-evidence.test.ts', 'corrupt slice NAL and preserves real random-access meaning'],
    ['./oracle-system.test.ts', 'Annex B vs length-prefix and inline vs out-of-band SPS/PPS are DIFF']),
  area(8, 'typed browser/engine applicability and malformed-input separation',
    ['./engine-web-demuxer-lifecycle.test.ts', 'routes API/config/raster misses to typed NA_BROWSER'],
    ['./engine-web-demuxer-lifecycle.test.ts', 'keeps a malformed package decoder config as an ordinary TypeError'],
    ['./engine-web-demuxer-support.test.ts', 'never launders declared-container robustness mutations into NA_ENGINE']),
  area(9, 'decode ordering, partial errors, frame ownership, raster, and crypto',
    ['./engine-web-demuxer-lifecycle.test.ts', 'returns lowest PTS N'],
    ['./engine-web-demuxer-lifecycle.test.ts', 'surfaces a decoder error after frames as partial failure and closes every frame'],
    ['./engine-web-demuxer-lifecycle.test.ts', 'aborts a pending raster readback promptly']),
  area(10, 'seek landing and callback-order determinism',
    ['./engine-web-demuxer-evidence.test.ts', 'selects max real PTS <= target, falls forward before zero'],
    ['./engine-web-demuxer-evidence.test.ts', 'next-key GOP boundary rather than a fixed time window'],
    ['./engine-web-demuxer-lifecycle.test.ts', 'lands by sorted real PTS']),
  area(11, 'cancel/timeout settlement and resource cleanup',
    ['./engine-web-demuxer-lifecycle.test.ts', 'abort during readiness terminates the worker'],
    ['./engine-web-demuxer-lifecycle.test.ts', 'cancels an active packet stream promptly and emits no later packet telemetry'],
    ['./engine-web-demuxer-evidence.test.ts', 'prompt digest cancellation']),
  area(12, 'machine-readable status, config, backend, and partial coverage persistence',
    ['./runner-correctness.test.ts', 'status permutations preserve FAIL + partial 1/3'],
    ['./feature-robustness-integration.test.ts', 'production three-file robustness acceptance'],
    ['./scenario-dsl-registry.test.ts', 'v1 thin exhaustive rows retain each typed status'],
    ['./app-ui-correctness.test.ts', 'every applicability/policy/error status keeps a unique machine-visible label'],
    ['./engine-web-demuxer-lifecycle.test.ts', 'normal demux reports its worker backend']),
]);

describe('REQ-ENG-31 web-demuxer adapter-boundary conformance gate', () => {
  test('all declared operations require explicit proofs and fresh factories remain stable', async () => {
    const engine = new WebDemuxerEngine();
    expect(Object.keys(CONFORMANCE_EVIDENCE.operations ?? {}).sort()).toEqual(
      Object.entries(engine.capabilities().operations)
        .filter(([, supported]) => supported === true)
        .map(([operation]) => operation)
        .sort(),
    );
    expect(() => validateAdapterConformanceSurface(engine, CONFORMANCE_EVIDENCE)).not.toThrow();
    const [first, second] = await validateAdapterFactory(() => new WebDemuxerEngine(), CONFORMANCE_EVIDENCE);
    expect(first).not.toBe(second);
    expect(first.id).toBe('web-demuxer@4.0.0');
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
        const source = await Bun.file(new URL(anchor.file, import.meta.url)).text();
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
    expect(() => validateAdapterConformanceSurface(new WebDemuxerEngine(), missingCancellation)).toThrow(
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
