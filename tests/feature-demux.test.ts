import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import type {
  CapabilitySet,
  DemuxResult,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  PacketInfo,
} from '../src/core/engine.ts';
import type { CodecSupport } from '../src/core/feature-detect.ts';
import type { ResolvedInput, VerifiedContent } from '../src/core/media-selection.ts';
import { runOne } from '../src/core/runner.ts';
import {
  assessDemuxDts,
  assessDemuxScale,
  auditDemuxCoverage,
  compareFlacFixturePair,
  compareFlacSeektableDemux,
  defineDemuxScaleContract,
  demuxScaleContractFromOptions,
  executeFlacSeektableInvariant,
  validateTruncatedH264WithWebCodecs,
  validateTruncatedDemuxPartial,
} from '../src/features/demux/index.ts';
import { demuxScenarios } from '../src/scenarios/demux/index.ts';

function verdict(outcome: { state: string; verdict?: string }): string {
  return outcome.state === 'VERDICT' ? outcome.verdict! : outcome.state;
}

const videoMetadata: NormalizedMetadata = {
  container: 'mp4', durationSec: 0.1,
  tracks: [{ type: 'video', codec: 'h264', width: 640, height: 360, fps: 30 }],
};

function packet(
  index: number,
  ptsUs: number,
  dtsUs: number | undefined,
  payload = new Uint8Array([0x65, index + 1, 0x80]),
): PacketInfo {
  return {
    trackIndex: 0,
    size: payload.byteLength,
    ptsUs,
    ...(dtsUs !== undefined ? { dtsUs } : {}),
    durationUs: 33_333,
    keyframe: index === 0,
    trackType: 'video',
    codec: 'h264',
    payload,
    accessUnitId: `au-${index}`,
  };
}

function demux(packets: PacketInfo[], metadata = videoMetadata): DemuxResult {
  return {
    metadata,
    packets,
    packetOrdering: 'decode',
    representations: [{
      trackIndex: 0,
      packetOrdering: 'decode',
      framing: 'annexb',
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: 'in-band',
    }],
  };
}

describe('REQ-FEAT-01 DTS value plus explicit unavailability', () => {
  const golden = [packet(0, 0, 0), packet(1, 66_666, 33_333), packet(2, 33_333, 66_666)];

  test('non-DTS adapters surface coverage instead of fabricating DTS=PTS', () => {
    const measured = golden.map((entry, index) => packet(index, entry.ptsUs, undefined));
    const evidence = assessDemuxDts({
      measured: demux(measured), goldenPackets: golden, goldenMetadata: videoMetadata, declaresDts: false,
    });
    expect(verdict(evidence.outcome)).toBe('PASS');
    expect(evidence.outcome.reasonCode).toBe('DEMUX_DTS_UNAVAILABLE_NOT_REQUIRED');
    expect(evidence).toMatchObject({ measuredPackets: 0, unavailablePackets: 3, comparedPackets: 0 });
  });

  test('declared DTS is measured after a track-local origin shift and real drift fails', () => {
    const shifted = golden.map((entry, index) => packet(index, entry.ptsUs + 10_000, entry.dtsUs! + 10_000));
    const good = assessDemuxDts({
      measured: demux(shifted), goldenPackets: golden, goldenMetadata: videoMetadata, declaresDts: true,
    });
    expect(verdict(good.outcome)).toBe('PASS');
    expect(good.comparedPackets).toBe(3);

    shifted[2]!.dtsUs! += 5_000;
    const bad = assessDemuxDts({
      measured: demux(shifted), goldenPackets: golden, goldenMetadata: videoMetadata,
      declaresDts: true, toleranceUs: 1_000,
    });
    expect(verdict(bad.outcome)).toBe('FAIL');
    expect(bad.outcome.reasonCode).toBe('DEMUX_DTS_TIMELINE_MISMATCH');
  });

  test('advertising packets:dts while omitting one observation fails the capability claim', () => {
    const incomplete = golden.map((entry) => ({ ...entry }));
    delete incomplete[1]!.dtsUs;
    const evidence = assessDemuxDts({
      measured: demux(incomplete), goldenPackets: golden, goldenMetadata: videoMetadata, declaresDts: true,
    });
    expect(verdict(evidence.outcome)).toBe('FAIL');
    expect(evidence.outcome.reasonCode).toBe('DEMUX_DTS_DECLARED_BUT_MISSING');
  });
});

describe('REQ-FEAT-02 semantic metadata is decisive for demux', () => {
  test('every ordinary/scale/empty demux row declares the shared metadata comparator', () => {
    const substantive = demuxScenarios.filter((scenario) =>
      !scenario.id.startsWith('demux/graceful_') &&
      scenario.id !== 'demux/metamorphic_flac_seektable_invariance');
    expect(substantive.length).toBeGreaterThan(0);
    for (const scenario of substantive) {
      expect(scenario.oracles, scenario.id).toContain('golden-packets');
      expect(scenario.oracles, scenario.id).toContain('golden-metadata');
    }
  });

  test('B-frame/VFR rows no longer require DTS capability and can expose unavailable coverage', () => {
    for (const id of ['demux/h264_bframes_1080p', 'demux/h264_vfr', 'demux/realworld_mdn_flower_mp4']) {
      const scenario = demuxScenarios.find((entry) => entry.id === id);
      expect(scenario, id).toBeDefined();
      expect(scenario?.requires.features ?? []).not.toContain('packets:dts');
    }
  });
});

describe('REQ-FEAT-03 truncated H.264 returned-output contract', () => {
  test('accepts a clean complete prefix and probes the terminal access unit', async () => {
    const seen: number[] = [];
    const result = await validateTruncatedDemuxPartial({
      result: demux([packet(0, 0, 0), packet(1, 33_333, 33_333)]),
      probeAccessUnit({ packetIndex, packet: observed }) {
        seen.push(packetIndex);
        return observed.payload?.at(-1) === 0x80
          ? { state: 'PASS' as const }
          : { state: 'FAIL' as const, reasonCode: 'H264_AU_INCOMPLETE', detail: 'slice RBSP is truncated' };
      },
    });
    expect(verdict(result.outcome)).toBe('PASS');
    expect(result.disposition).toBe('valid-complete-prefix');
    expect(seen).toEqual([0, 1]);
    expect(result.checkedAccessUnits).toBe(2);
  });

  test('a reported access unit cut inside its payload is FAIL, not safe partial output', async () => {
    const cut = packet(1, 33_333, 33_333, new Uint8Array([0x65, 0x88]));
    const result = await validateTruncatedDemuxPartial({
      result: demux([packet(0, 0, 0), cut]),
      probeAccessUnit({ packet: observed }) {
        return observed.payload?.at(-1) === 0x80
          ? { state: 'PASS' as const }
          : { state: 'FAIL' as const, reasonCode: 'H264_AU_INCOMPLETE', detail: 'terminal access unit ends inside a coded slice' };
      },
    });
    expect(verdict(result.outcome)).toBe('FAIL');
    expect(result.outcome.reasonCode).toBe('H264_AU_INCOMPLETE');
    expect(result.checkedAccessUnits).toBe(1);
  });

  test('missing payload/probe and invalid track references can never pass', async () => {
    const noPayload = { ...packet(0, 0, 0) };
    delete noPayload.payload;
    expect(verdict((await validateTruncatedDemuxPartial({
      result: demux([noPayload]), probeAccessUnit: () => ({ state: 'PASS' }),
    })).outcome)).toBe('FAIL');

    const badTrack = { ...packet(0, 0, 0), trackIndex: 9 };
    const bad = await validateTruncatedDemuxPartial({
      result: demux([badTrack]), probeAccessUnit: () => ({ state: 'PASS' }),
    });
    expect(bad.outcome.reasonCode).toBe('DEMUX_PARTIAL_TRACK_REFERENCE_INVALID');
    expect(verdict(bad.outcome)).toBe('FAIL');

    const noProbe = await validateTruncatedDemuxPartial({ result: demux([packet(0, 0, 0)]) });
    expect(noProbe.outcome.state).toBe('ERROR');
    expect(noProbe.outcome.reasonCode).toBe('DEMUX_PARTIAL_NEUTRAL_PROBE_MISSING');
  });

  test('neutral WebCodecs path configures exactly the probed config and emits every AU', async () => {
    const videoDecoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoDecoder');
    const chunkDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'EncodedVideoChunk');
    const configured: VideoDecoderConfig[] = [];
    const supportConfig = { codec: 'avc1.42E01E', codedWidth: 640, codedHeight: 360 } as VideoDecoderConfig;
    class FakeChunk {
      constructor(readonly init: EncodedVideoChunkInit) {}
    }
    class FakeDecoder {
      static async isConfigSupported(_config: VideoDecoderConfig): Promise<VideoDecoderSupport> {
        return { supported: true, config: supportConfig };
      }
      state: CodecState = 'unconfigured';
      constructor(private readonly init: VideoDecoderInit) {}
      configure(config: VideoDecoderConfig): void { configured.push(config); this.state = 'configured'; }
      decode(_chunk: EncodedVideoChunk): void {
        this.init.output({ close() {} } as VideoFrame);
      }
      async flush(): Promise<void> {}
      close(): void { this.state = 'closed'; }
    }
    Object.defineProperty(globalThis, 'VideoDecoder', { configurable: true, value: FakeDecoder });
    Object.defineProperty(globalThis, 'EncodedVideoChunk', { configurable: true, value: FakeChunk });
    try {
      const result = await validateTruncatedH264WithWebCodecs(demux([
        packet(0, 0, 0), packet(1, 33_333, 33_333),
      ]));
      expect(verdict(result.outcome)).toBe('PASS');
      expect(result.checkedAccessUnits).toBe(2);
      expect(configured).toEqual([supportConfig]);
    } finally {
      restoreGlobal('VideoDecoder', videoDecoderDescriptor);
      restoreGlobal('EncodedVideoChunk', chunkDescriptor);
    }
  });
});

function restoreGlobal(key: 'VideoDecoder' | 'EncodedVideoChunk', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else Reflect.deleteProperty(globalThis, key);
}

describe('REQ-FEAT-04 enforceable demux scale budgets', () => {
  test('contracts round-trip from options and expose every threshold', () => {
    for (const bucket of ['large', 'huge', 'massive'] as const) {
      const contract = defineDemuxScaleContract(bucket);
      expect(demuxScaleContractFromOptions({ robustness: contract })).toEqual(contract);
      expect(Object.values(contract.limits).every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(contract.readPolicy).toBe('full-scan-permitted-observed');
    }
  });

  test('complete observations pass within limits and any exceeded budget fails', () => {
    const contract = defineDemuxScaleContract('large');
    const base = {
      schema: 'media-test/demux-scale-observation@1' as const,
      assetBytes: 100_000_000,
      peakMemoryDeltaBytes: 120_000_000,
      sourceReadCalls: 2_000,
      sourceBytesRead: 110_000_000,
      longestLongTaskMs: 80,
      totalLongTaskMs: 900,
      firstPacketMs: 400,
      lastPacketMs: 80_000,
    };
    expect(assessDemuxScale(contract, base).state).toBe('PASS');
    const failed = assessDemuxScale(contract, { ...base, sourceBytesRead: 200_000_000 });
    expect(failed.state).toBe('FAIL');
    expect(failed.reasonCode).toBe('DEMUX_SCALE_BUDGET_EXCEEDED');
  });

  test('unwired adapter/browser evidence is unavailable rather than a fabricated zero', () => {
    const result = assessDemuxScale(defineDemuxScaleContract('huge'), {
      schema: 'media-test/demux-scale-observation@1', assetBytes: 700_000_000,
    });
    expect(result.state).toBe('UNAVAILABLE');
    if (result.state === 'UNAVAILABLE') {
      expect(result.status).toBe('NA_ENGINE');
      expect(result.missingFields).toContain('sourceBytesRead');
      expect(result.missingFields).toContain('firstPacketMs');
    }
  });

  test('registered scale contract is enforced by the functional runner/oracle path', async () => {
    const scenario = demuxScenarios.find((entry) => entry.id === 'demux/size_large_large_h264_1080p_120s')!;
    expect(scenario.oracles).toContain('property-invariant');
    expect(scenario.options).toMatchObject({ invariant: 'demux-scale-budgets' });

    const inputBytes = new Uint8Array([1, 2, 3, 4]);
    const inputSha = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';
    const resolvedInputs: ResolvedInput[] = [{
      id: String(scenario.input), urlAssetPath: String(scenario.input), sha256: inputSha,
      sizeBytes: inputBytes.byteLength, integrity: 'VERIFIED',
    }];
    const verifiedContents: VerifiedContent[] = [{
      state: 'VERIFIED',
      identity: { logicalPath: String(scenario.input), sha256: inputSha, sizeBytes: inputBytes.byteLength },
      bytes: inputBytes,
      actualSha256: inputSha,
      actualSizeBytes: inputBytes.byteLength,
    }];
    const goldenPackets = [packet(0, 0, 0), packet(1, 33_333, 33_333), packet(2, 66_666, 66_666)]
      .map(({ trackIndex, size, ptsUs, dtsUs, durationUs, keyframe }) => ({
        trackIndex, size, ptsUs, dtsUs, durationUs, keyframe,
      }));
    const priorFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`${scenario.input}.meta.json`)) return Response.json(videoMetadata);
      if (url.endsWith(`${scenario.input}.packets.json`)) return Response.json(goldenPackets);
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;

    const codecSupport: CodecSupport = {
      webcodecs: false, videoDecode: {}, videoEncode: {}, audioDecode: {}, audioEncode: {},
      alpha: false, strictRgbaPixels: false, strictGoldenRgba: false, strictSourceRgba: false,
      webgpu: false, measureMemory: true,
    };
    const capabilities: CapabilitySet = {
      operations: { demux: true }, containersIn: ['mp4'], containersOut: [],
      videoCodecs: ['h264'], audioCodecs: ['aac'], encryption: [], features: [],
    };
    const run = (bytesRead: number, eventCount = goldenPackets.length) => runOne({
      id: 'demux-scale-test@1.0.0',
      capabilities: () => capabilities,
      supports: async () => ({ supported: true }),
      async demux(_input, context) {
        for (let index = 0; index < eventCount; index++) {
          context?.emit({
            type: 'bytes-read', atMs: index + 1,
            bytes: index === eventCount - 1 ? bytesRead : Math.floor(bytesRead * (index + 1) / eventCount),
          });
        }
        return {
          ...demux([packet(0, 0, 0), packet(1, 33_333, 33_333), packet(2, 66_666, 66_666)]),
          telemetry: { bytesRead, packetCount: goldenPackets.length },
        };
      },
    } as MediaEngine, scenario, 'chromium', codecSupport, {
      pillar: 'functional',
      pixelBehavior: { state: 'SUPPORTED', reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK', detail: 'test' },
      resolvedInputs,
      verifiedContents,
      probeMemorySampler: {
        state: 'AVAILABLE',
        value: { api: 'measureUserAgentSpecificMemory', sample: async () => 100 },
      },
      probeMemoryWindowOptions: { sampleIntervalMs: 1, settleWindowMs: 0 },
      demuxScaleLongTaskEnvironment: {
        supportedEntryTypes: ['longtask'],
        create: () => ({ observe() {}, takeRecords: () => [], disconnect() {} }),
      },
    });

    try {
      const passing = await run(4);
      expect(passing.status).toBe('PASS');
      expect(passing.oracleOutcomes.find((outcome) => outcome.oracle === 'property-invariant')).toMatchObject({
        state: 'VERDICT', verdict: 'PASS', reasonCode: 'DEMUX_SCALE_BUDGETS_MET',
        measurements: {
          sourceReadCalls: 3, sourceBytesRead: 4, firstPacketMs: 1, lastPacketMs: 3,
          longestLongTaskMs: 0, totalLongTaskMs: 0,
          memoryBaselineBytes: 100, memoryMaximumBytes: 100,
          memoryAfterOperationBytes: 100, memorySampleCount: 2,
        },
      });

      const exceeded = await run(8);
      expect(exceeded.status).toBe('FAIL');
      expect(exceeded.oracleOutcomes.find((outcome) => outcome.oracle === 'property-invariant')).toMatchObject({
        state: 'VERDICT', verdict: 'FAIL', reasonCode: 'DEMUX_SCALE_BUDGET_EXCEEDED',
      });

      const missingPacketBoundaryTrace = await run(4, 1);
      expect(missingPacketBoundaryTrace.status).toBe('NA_ENGINE');
      expect(missingPacketBoundaryTrace.reason).toContain('DEMUX_SCALE_ADAPTER_TRACE_UNAVAILABLE');
    } finally {
      globalThis.fetch = priorFetch;
    }
  });
});

const flacMetadata: NormalizedMetadata = {
  container: 'flac', durationSec: 2,
  tracks: [{ type: 'audio', codec: 'flac', sampleRate: 48_000, channels: 2 }],
};

function flacDemux(marker = 1): DemuxResult {
  return {
    metadata: flacMetadata,
    packetOrdering: 'presentation',
    packets: [
      { trackIndex: 0, size: 3, ptsUs: 0, durationUs: 1_000_000, keyframe: true, payload: new Uint8Array([marker, 2, 3]) },
      { trackIndex: 0, size: 3, ptsUs: 1_000_000, durationUs: 1_000_000, keyframe: true, payload: new Uint8Array([4, 5, 6]) },
    ],
  };
}

function mediaInput(id: string): MediaInput {
  return {
    id, url: `memory:${id}`, mime: 'audio/flac', sizeBytes: 1,
    async arrayBuffer() { return new Uint8Array([0]).buffer; },
    async blob() { return new Blob([new Uint8Array([0])], { type: 'audio/flac' }); },
  };
}

describe('REQ-FEAT-05 real two-input FLAC SEEKTABLE property', () => {
  test('executes each input exactly once on the candidate and compares frame inventories directly', async () => {
    const calls: string[] = [];
    const inputs = [mediaInput('flac_noseektable.flac'), mediaInput('flac_seektable.flac')];
    const result = await executeFlacSeektableInvariant(inputs, async (input) => {
      calls.push(input.id);
      return flacDemux();
    });
    expect(new Set(calls)).toEqual(new Set(inputs.map((input) => input.id)));
    expect(calls).toHaveLength(2);
    expect(verdict(result.outcome)).toBe('PASS');
  });

  test('removing or changing an audio frame is FAIL', () => {
    const removed = flacDemux();
    removed.packets.pop();
    expect(compareFlacSeektableDemux(flacDemux(), removed).reasonCode).toBe('DEMUX_FLAC_FRAME_COUNT_MISMATCH');
    expect(verdict(compareFlacSeektableDemux(flacDemux(), flacDemux(9)))).toBe('FAIL');
  });

  test('committed pair has identical STREAMINFO/audio frames and differs by SEEKTABLE presence', () => {
    const root = new URL('../fixtures/media/', import.meta.url);
    const withSeektable = new Uint8Array(readFileSync(new URL('flac_seektable.flac', root)));
    const withoutSeektable = new Uint8Array(readFileSync(new URL('flac_noseektable.flac', root)));
    const outcome = compareFlacFixturePair(withSeektable, withoutSeektable);
    expect(verdict(outcome)).toBe('PASS');
  });
});

describe('REQ-FEAT-06 demux coverage fixtures are committed', () => {
  test('prioritized omitted axes have digest-bound assets and metadata+packet goldens', () => {
    const manifest = JSON.parse(readFileSync(new URL('../fixtures/manifest.json', import.meta.url), 'utf8')) as {
      assets: Array<{ id: string; sha256?: string; sizeBytes?: number }>;
    };
    for (const assetId of [
      'fragmented_cmaf.mp4', 'mislabeled_h264.webm', 'gapless_aac.m4a', 'ts_discontinuity.ts', 'pcm_s16.caf',
      'aac_audio_only.m4a',
    ]) {
      const asset = manifest.assets.find((entry) => entry.id === assetId);
      expect(asset, assetId).toBeDefined();
      expect(asset?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset?.sizeBytes).toBeGreaterThan(0);
      expect(existsSync(new URL(`../fixtures/golden/${assetId}.meta.json`, import.meta.url)), `${assetId} meta`).toBe(true);
      expect(existsSync(new URL(`../fixtures/golden/${assetId}.packets.json`, import.meta.url)), `${assetId} packets`).toBe(true);
    }
    const mislabeled = manifest.assets.find((entry) => entry.id === 'mislabeled_h264.webm') as
      | { container?: string; declaredExtension?: string }
      | undefined;
    expect(mislabeled).toMatchObject({ container: 'mp4', declaredExtension: 'webm' });
  });

  test('coverage audit binds each row to both evidence kinds and fixture provenance', () => {
    const manifest = JSON.parse(readFileSync(new URL('../fixtures/manifest.json', import.meta.url), 'utf8')) as {
      assets: Array<{ id: string; sha256?: string; sizeBytes?: number }>;
    };
    const audit = auditDemuxCoverage(
      demuxScenarios,
      manifest.assets,
      (assetId, kind) => existsSync(new URL(`../fixtures/golden/${assetId}.${kind}.json`, import.meta.url)),
    );
    expect(audit).toEqual({
      ok: true,
      missingScenarioIds: [],
      missingAssetIds: [],
      missingGoldenEvidence: [],
      provenanceFailures: [],
    });
  });

  test('the FLAC row is a two-input executable property and scale rows publish their thresholds', () => {
    const flac = demuxScenarios.find((scenario) => scenario.id === 'demux/metamorphic_flac_seektable_invariance');
    expect(flac?.input).toEqual(['flac_seektable.flac', 'flac_noseektable.flac']);
    expect(flac?.oracles).toEqual(['property-invariant']);
    expect(flac?.options).toMatchObject({ invariant: 'demux-flac-index-invariance' });

    const scale = demuxScenarios.filter((scenario) => scenario.id.startsWith('demux/size_') &&
      ['large', 'huge', 'massive'].some((bucket) => scenario.id.includes(`size_${bucket}_`)));
    expect(scale).toHaveLength(4);
    for (const scenario of scale) {
      expect(scenario.metrics).toEqual(['wall', 'peakMemory', 'sourceReads', 'longtasks']);
      const contract = demuxScaleContractFromOptions(scenario.options);
      expect(contract).toBeDefined();
      expect(Object.keys(contract?.limits ?? {})).toEqual([
        'peakMemoryDeltaBytes', 'sourceReadCalls', 'sourceReadAmplification', 'longestLongTaskMs',
        'totalLongTaskMs', 'firstPacketMs', 'lastPacketMs',
      ]);
    }
  });

  test('all size rows publish revisioned exact workload envelopes', () => {
    const expected = new Map<string, object>([
      ['demux/size_micro_micro_h264_1frame', {
        minWidth: 320, maxWidth: 320, minHeight: 240, maxHeight: 240,
        minDurationSec: 0.9, maxDurationSec: 1.1,
      }],
      ['demux/size_micro_micro_audio_short', { minDurationSec: 0, maxDurationSec: 0.25 }],
      ['demux/size_tiny_tiny_h264_360p_2s', {
        minWidth: 640, maxWidth: 640, minHeight: 360, maxHeight: 360,
        minDurationSec: 1.8, maxDurationSec: 2.2,
      }],
      ['demux/size_tiny_tiny_vp9_360p_2s', {
        minWidth: 640, maxWidth: 640, minHeight: 360, maxHeight: 360,
        minDurationSec: 1.8, maxDurationSec: 2.2,
      }],
      ['demux/size_large_large_h264_1080p_120s', {
        minWidth: 1920, maxWidth: 1920, minHeight: 1080, maxHeight: 1080,
        minDurationSec: 108, maxDurationSec: 132,
      }],
      ['demux/size_large_large_vp9_1080p_120s', {
        minWidth: 1920, maxWidth: 1920, minHeight: 1080, maxHeight: 1080,
        minDurationSec: 108, maxDurationSec: 132,
      }],
      ['demux/size_huge_huge_h264_1080p_600s', {
        minWidth: 1920, maxWidth: 1920, minHeight: 1080, maxHeight: 1080,
        minDurationSec: 540, maxDurationSec: 660,
      }],
      ['demux/size_massive_massive_h264_1080p_2h', {
        minWidth: 1920, maxWidth: 1920, minHeight: 1080, maxHeight: 1080,
        minDurationSec: 6480, maxDurationSec: 7920,
      }],
    ]);

    const sizeRows = demuxScenarios.filter((scenario) => scenario.id.startsWith('demux/size_'));
    expect(sizeRows).toHaveLength(expected.size);
    for (const scenario of sizeRows) {
      expect(scenario.revision).toBe(2);
      expect(scenario.candidateEnvelope).toEqual(expected.get(scenario.id));
    }
  });
});
