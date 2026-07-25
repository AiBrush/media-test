import { describe, expect, test } from 'bun:test';

import { isNotApplicableError } from '../src/core/engine.ts';
import {
  BoundedStreamingSink,
  IncrementalLiveWebmParser,
  assessFragmentedMp4,
  assessInMemoryFastStartTrace,
  assessLiveWebm,
  assessMpegTsStructure,
  assessReserveWriteTrace,
  assessStreamingComparability,
  assessTimeToFirstByte,
  assessWriteChunkGranularity,
  assertStreamingTupleSupported,
  decideStreamingTupleSupport,
  evaluateStreamingCorrectness,
  inspectFragmentedMp4,
  inspectLiveWebm,
  inspectMpegTs,
  probeFragmentedMp4Append,
  probeLiveWebmAppend,
  readTimeToFirstByteSample,
  streamingError,
  streamingOutputContractFromOptions,
  streamingUnavailable,
  streamingVerdict,
  validateSinkTrace,
  type SinkTrace,
  type StreamingTupleCapabilities,
  type StreamingTupleRequest,
  type StreamingWorkIdentity,
} from '../src/features/streaming-output/index.ts';
import { streamingOutputScenarios } from '../src/scenarios/streaming-output/index.ts';

const encoder = new TextEncoder();

describe('REQ-FEAT-80 four independent correctness layers', () => {
  test('reduces applicability separately and preserves FAIL > DIFF > PASS downstream', () => {
    const pass = streamingVerdict('PASS', 'LAYER_PASS', 'valid');
    // A legal alternate representation is a PASS that still records its representation-difference reasonCode.
    const diff = streamingVerdict('PASS', 'LEGAL_REPRESENTATION_DIFF', 'legal alternate representation');
    const fail = streamingVerdict('FAIL', 'SINK_CONTRACT_VIOLATION', 'wrong sink behavior');
    expect(evaluateStreamingCorrectness({
      applicability: pass,
      sinkTrace: pass,
      containerValidity: diff,
      mediaSemantics: pass,
    })).toMatchObject({
      status: 'PASS',
      reasonCode: 'STREAMING_CORRECTNESS_VALID',
      layers: { 'container-validity': { reasonCode: 'LEGAL_REPRESENTATION_DIFF' } },
    });
    expect(evaluateStreamingCorrectness({
      applicability: pass,
      sinkTrace: fail,
      containerValidity: diff,
      mediaSemantics: pass,
    })).toMatchObject({ status: 'FAIL', reasonCode: 'SINK_CONTRACT_VIOLATION' });

    const na = evaluateStreamingCorrectness({
      applicability: streamingUnavailable('NA_ENGINE', 'STREAMING_TARGET_OBSERVER_UNSUPPORTED', 'no observer'),
      sinkTrace: streamingError('NOT_EXECUTED', 'not executed'),
      containerValidity: streamingError('NOT_EXECUTED', 'not executed'),
      mediaSemantics: streamingError('NOT_EXECUTED', 'not executed'),
    });
    expect(na.status).toBe('NA_ENGINE');
    expect(Object.keys(na.layers).sort()).toEqual([
      'applicability', 'container-validity', 'media-semantics', 'sink-trace',
    ]);
  });

  test('parses every authored output shape into an explicit representation contract', () => {
    for (const scenario of streamingOutputScenarios) {
      const contract = streamingOutputContractFromOptions(scenario.options);
      expect(contract.container.length).toBeGreaterThan(0);
      expect(contract.representation).not.toBe('other');
      if (contract.target === 'stream' && (contract.container === 'mp4' || contract.container === 'mov')) {
        const options = scenario.options as Record<string, unknown>;
        expect(options.fragmented !== undefined || options.fastStart !== undefined).toBe(true);
      }
    }
  });
});

describe('REQ-FEAT-86 runner-origin TTFB and real first-write semantics', () => {
  test('stream first byte precedes finalize while buffer first byte equals finalize', async () => {
    let now = 101;
    const stream = new BoundedStreamingSink({ operationStartMs: 100, now: () => now });
    await stream.write(new Uint8Array([1, 2, 3]));
    now = 110;
    const streamTrace = await stream.finalize();
    expect(assessTimeToFirstByte(streamTrace)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', measurements: { timeToFirstByteMs: 1, wallMs: 10 },
    });

    now = 201;
    const buffer = new BoundedStreamingSink({ target: 'buffer', operationStartMs: 200, now: () => now });
    await buffer.write(new Uint8Array([1, 2, 3]));
    now = 215;
    const bufferTrace = await buffer.finalize();
    expect(assessTimeToFirstByte(bufferTrace)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', measurements: { timeToFirstByteMs: 15, wallMs: 15 },
    });
    expect(validateSinkTrace(bufferTrace, { target: 'buffer' })).toMatchObject({ verdict: 'PASS' });
  });

  test('missing non-empty telemetry is n=0/unavailable to ranking, never a synthetic zero', async () => {
    expect(readTimeToFirstByteSample(undefined)).toEqual({
      available: false,
      sampleCount: 0,
      reasonCode: 'TTFB_TELEMETRY_UNAVAILABLE',
      detail: 'no sink trace was supplied',
    });
    let now = 0;
    const sink = new BoundedStreamingSink({ operationStartMs: 0, now: () => now });
    now = 5;
    const trace = await sink.finalize();
    const decision = assessTimeToFirstByte(trace);
    expect(decision).toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TTFB_FIRST_BYTE_MISSING' });
    if (decision.state === 'VERDICT') expect(decision.measurements?.timeToFirstByteMs).toBeUndefined();
    expect(readTimeToFirstByteSample(trace)).toMatchObject({
      available: false, sampleCount: 0, reasonCode: 'TTFB_FIRST_BYTE_MISSING',
    });
  });
});

describe('REQ-FEAT-82/84 reserve algorithm and exact write granularity', () => {
  test('distinguishes reserve exact-fit, under-fill, overflow, and in-memory traces', () => {
    const exact = reserveTrace(false);
    expect(assessReserveWriteTrace(exact, {
      maximumPacketCount: 10, observedPacketCount: 10, completion: 'COMPLETED',
    })).toMatchObject({ verdict: 'PASS', reasonCode: 'RESERVE_EXACT_FIT_VALID' });
    expect(assessReserveWriteTrace(exact, {
      maximumPacketCount: 10, observedPacketCount: 7, completion: 'COMPLETED',
    })).toMatchObject({ verdict: 'PASS', reasonCode: 'RESERVE_UNDERFILL_VALID' });
    expect(assessReserveWriteTrace(reserveTrace(true), {
      maximumPacketCount: 10,
      observedPacketCount: 11,
      completion: 'OVERFLOW_REJECTED',
      overflowReasonCode: 'RESERVED_HEADER_OVERFLOW',
    })).toMatchObject({ verdict: 'PASS', reasonCode: 'RESERVE_OVERFLOW_REJECTED' });
    expect(assessReserveWriteTrace(exact, {
      maximumPacketCount: 10, observedPacketCount: 11, completion: 'COMPLETED',
    })).toMatchObject({ verdict: 'FAIL', reasonCode: 'RESERVE_OVERFLOW_NOT_BOUNDED' });
    expect(assessInMemoryFastStartTrace(exact)).toMatchObject({
      verdict: 'FAIL', reasonCode: 'IN_MEMORY_FASTSTART_RESERVE_TRACE',
    });
  });

  test('a valid transport emitted in a larger chunk is a behavioral FAIL', () => {
    const trace = simpleTrace([188, 188, 188]);
    expect(assessWriteChunkGranularity(trace, 188)).toMatchObject({ verdict: 'PASS' });
    expect(assessWriteChunkGranularity(simpleTrace([376, 188]), 188)).toMatchObject({
      verdict: 'FAIL', reasonCode: 'SINK_WRITE_GRANULARITY_MISMATCH',
    });
  });
});

describe('REQ-FEAT-87 bounded non-retaining sink and backpressure', () => {
  test('retained validation material is bounded independently of total output', async () => {
    let now = 1;
    const sink = new BoundedStreamingSink({
      operationStartMs: 0,
      now: () => now++,
      prefixBytes: 64,
      tailBytes: 64,
    });
    for (let index = 0; index < 100; index++) await sink.write(new Uint8Array(1024).fill(index));
    const trace = await sink.finalize();
    expect(trace.totalUniqueBytes).toBe(102_400);
    expect(trace.retainedOutputBytes).toBe(128);
    expect(trace.maximumQueuedBytes).toBe(1024);
    expect(trace.maximumOutstandingWritePromises).toBe(1);
    expect(validateSinkTrace(trace, {
      target: 'stream',
      appendOnly: true,
      requireAwaitedBackpressure: true,
      maximumQueuedBytes: 1024,
      maximumRetainedOutputBytes: 128,
    })).toMatchObject({ verdict: 'PASS', reasonCode: 'SINK_TRACE_CONTRACT_MATCH' });
  });

  test('overlapping write promises expose ignored backpressure', async () => {
    let now = 1;
    const sink = new BoundedStreamingSink({ operationStartMs: 0, now: () => now++ });
    const first = sink.write(new Uint8Array(64));
    const second = sink.write(new Uint8Array(64));
    await Promise.all([first, second]);
    const trace = await sink.finalize();
    expect(trace.maximumOutstandingWritePromises).toBe(2);
    expect(validateSinkTrace(trace, {
      target: 'stream', appendOnly: true, requireAwaitedBackpressure: true,
    })).toMatchObject({ verdict: 'FAIL', reasonCode: 'SINK_BACKPRESSURE_NOT_AWAITED' });
  });
});

describe('REQ-FEAT-83 MPEG-TS structural and continuity reader', () => {
  test('accepts PAT/PMT/PCR/PES, duplicate rules, adaptation-only exception, CC and PTS wrap', () => {
    const result = inspectMpegTs(validTs());
    expect(result).toMatchObject({
      state: 'OK',
      programNumber: 1,
      pmtPid: 100,
      pcrPid: 256,
      continuityWraps: 1,
      duplicatePackets: 1,
      streams: [{ pid: 256, ptsRolloverCount: 1 }],
    });
    expect(inspectMpegTs(dtsRolloverTs())).toMatchObject({
      state: 'OK',
      streams: [{ pid: 256, ptsRolloverCount: 1, dtsRolloverCount: 1 }],
    });
    expect(assessMpegTsStructure(validTs())).toMatchObject({ verdict: 'PASS', reasonCode: 'TS_STRUCTURE_CONTINUITY_VALID' });
    expect(inspectMpegTs(discontinuityTs())).toMatchObject({ state: 'OK', discontinuities: 1 });
  });

  test('one-fact mutations deterministically reject without partial evidence', () => {
    const valid = validTs();
    expect(inspectMpegTs(valid.slice(0, -1))).toMatchObject({ reasonCode: 'TS_PACKET_ALIGNMENT_INVALID' });
    expect(inspectMpegTs(mutate(valid, 0, 0))).toMatchObject({ state: 'UNSUPPORTED', reasonCode: 'TS_SYNC_PREFIX_MISSING' });
    expect(inspectMpegTs(setPacketByte(valid, 3, 1, valid[3 * 188 + 1]! | 0x80))).toMatchObject({
      reasonCode: 'TS_TRANSPORT_ERROR_INDICATOR_SET',
    });
    expect(inspectMpegTs(setPacketByte(valid, 6, 3, (valid[6 * 188 + 3]! & 0xf0) | 2))).toMatchObject({
      reasonCode: 'TS_CONTINUITY_COUNTER_MISMATCH',
    });
    expect(inspectMpegTs(setPacketByte(valid, 4, 187, valid[4 * 188 + 187]! ^ 1))).toMatchObject({
      reasonCode: 'TS_CONTINUITY_DUPLICATE_PAYLOAD_CHANGED',
    });
    expect(inspectMpegTs(concatPackets([patPacket(), pmtPacket(), pesPacket(256, 0, 0)]))).toMatchObject({
      reasonCode: 'TS_PCR_NOT_BEFORE_MEDIA',
    });
    expect(inspectMpegTs(concatPackets([patPacket(), pcrPacket(256, 0)]))).toMatchObject({
      reasonCode: 'TS_PMT_MISSING',
    });
    const noPts = setPacketByte(valid, 3, 11, 0x00);
    expect(inspectMpegTs(noPts)).toMatchObject({ reasonCode: 'TS_PES_PTS_MISSING' });
    const pat = patSection();
    const crcOffset = 4 + pat.byteLength;
    expect(inspectMpegTs(setPacketByte(valid, 0, crcOffset, valid[crcOffset]! ^ 1))).toMatchObject({
      reasonCode: 'TS_PSI_CRC_MISMATCH',
    });
  });
});

describe('REQ-FEAT-81 fragmented MP4/CMAF structure and append', () => {
  test('validates complete init/fragments/addressing/timeline/parameter sets', () => {
    const bytes = fragmentedMp4();
    expect(inspectFragmentedMp4(bytes, { cmaf: true })).toMatchObject({
      state: 'OK',
      cmafCompatible: true,
      totalSamples: 1,
      segments: [{ sequenceNumber: 1, sampleBytes: 4, mdatPayloadBytes: 4 }],
      tracks: [{ trackId: 1, codec: 'h264', parameterSetsAvailable: true }],
    });
    expect(assessFragmentedMp4(bytes, { cmaf: true })).toMatchObject({
      verdict: 'PASS', reasonCode: 'CMAF_FRAGMENT_STRUCTURE_VALID',
    });
  });

  test('W3C append-condition mutations each fail with a structural reason', () => {
    expect(inspectFragmentedMp4(fragmentedMp4({ mvex: false }))).toMatchObject({ reasonCode: 'FMP4_MVEX_MISSING' });
    expect(inspectFragmentedMp4(fragmentedMp4({ traf: false }))).toMatchObject({ reasonCode: 'FMP4_TRAF_MISSING' });
    expect(inspectFragmentedMp4(fragmentedMp4({ tfdt: false }))).toMatchObject({ reasonCode: 'FMP4_TFDT_MISSING' });
    expect(inspectFragmentedMp4(fragmentedMp4({ dataOffsetDelta: 8 }))).toMatchObject({ reasonCode: 'FMP4_TRUN_OUTSIDE_MDAT' });
    expect(inspectFragmentedMp4(fragmentedMp4({ parameterSets: false }))).toMatchObject({ reasonCode: 'FMP4_PARAMETER_SETS_MISSING' });
    expect(inspectFragmentedMp4(fragmentedMp4({ defaultBaseIsMoof: false }))).toMatchObject({
      reasonCode: 'FMP4_ADDRESSING_NOT_MOOF_RELATIVE',
    });
    expect(inspectFragmentedMp4(fragmentedMp4({ sync: false }))).toMatchObject({ reasonCode: 'FMP4_RANDOM_ACCESS_START_MISSING' });
    expect(inspectFragmentedMp4(fragmentedMp4({ media: false }))).toMatchObject({ reasonCode: 'FMP4_MEDIA_SEGMENT_MISSING' });
    expect(inspectFragmentedMp4(fragmentedMp4({ cmafBrand: false }), { cmaf: true })).toMatchObject({ reasonCode: 'CMAF_BRAND_MISSING' });
  });

  test('MSE append is sequential, browser absence is NA_BROWSER, append rejection is FAIL', async () => {
    const calls: string[] = [];
    const pass = await probeFragmentedMp4Append(fragmentedMp4(), 'video/mp4; codecs="avc1.640028"', {
      isTypeSupported: () => true,
      async appendInitialization() { calls.push('init'); },
      async appendMediaSegment(_bytes, index) { calls.push(`media-${index}`); },
      async finalize() { calls.push('finalize'); },
    }, { cmaf: true });
    expect(pass).toMatchObject({ verdict: 'PASS', reasonCode: 'FMP4_MSE_APPEND_VALID' });
    expect(calls).toEqual(['init', 'media-0', 'finalize']);
    expect(await probeFragmentedMp4Append(fragmentedMp4(), 'video/mp4', {
      isTypeSupported: () => false,
      async appendInitialization() {}, async appendMediaSegment() {}, async finalize() {},
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_BROWSER' });
    expect(await probeFragmentedMp4Append(fragmentedMp4(), 'video/mp4', {
      isTypeSupported: () => true,
      async appendInitialization() {},
      async appendMediaSegment() { throw new Error('append error'); },
      async finalize() {},
    })).toMatchObject({ verdict: 'FAIL', reasonCode: 'FMP4_MSE_APPEND_FAILED' });
  });
});

describe('REQ-FEAT-85 continuous live WebM and incremental consumption', () => {
  test('accepts unknown Segment, no index/duration, ordered Clusters through tiny feeds', async () => {
    const bytes = liveWebm();
    expect(await inspectLiveWebm(bytes, 2)).toMatchObject({
      state: 'OK', clusterCount: 2, clusterTimecodes: [0, 1000], incrementallyConsumed: true,
    });
    expect(await assessLiveWebm(bytes, 3)).toMatchObject({ verdict: 'PASS', reasonCode: 'WEBM_LIVE_INCREMENTAL_VALID' });
    const eightByteUnknownSegment = concatBytes(
      bytes.subarray(0, 9),
      new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
      bytes.subarray(10),
    );
    expect(await inspectLiveWebm(eightByteUnknownSegment, 2)).toMatchObject({
      state: 'OK', clusterCount: 2, clusterTimecodes: [0, 1000], incrementallyConsumed: true,
    });
    expect(await inspectLiveWebm(liveWebm({ unknownClusters: true }), 1)).toMatchObject({
      state: 'OK', clusterCount: 2, clusterTimecodes: [0, 1000], incrementallyConsumed: true,
    });

    const order: string[] = [];
    const parser = new IncrementalLiveWebmParser({
      consumer: {
        async onInitialization() { order.push('init'); },
        async onCluster(_bytes, index) { order.push(`cluster-${index}`); },
      },
    });
    for (const byte of bytes) await parser.feed(new Uint8Array([byte]));
    await parser.finish();
    expect(order).toEqual(['init', 'cluster-0', 'cluster-1']);
  });

  test('Cues/SeekHead/Duration/known Segment/reordered Cluster mutations fail', async () => {
    expect(await inspectLiveWebm(liveWebm({ cues: true }))).toMatchObject({ reasonCode: 'WEBM_LIVE_CUES_FORBIDDEN' });
    expect(await inspectLiveWebm(liveWebm({ seekHead: true }))).toMatchObject({ reasonCode: 'WEBM_LIVE_SEEKHEAD_FORBIDDEN' });
    expect(await inspectLiveWebm(liveWebm({ duration: true }))).toMatchObject({ reasonCode: 'WEBM_LIVE_DURATION_FORBIDDEN' });
    expect(await inspectLiveWebm(liveWebm({ knownSegment: true }))).toMatchObject({ reasonCode: 'WEBM_LIVE_SEGMENT_SIZE_KNOWN' });
    expect(await inspectLiveWebm(liveWebm({ reverseClusters: true }))).toMatchObject({
      reasonCode: 'WEBM_CLUSTER_TIMECODE_NON_MONOTONIC',
    });
    const truncated = liveWebm().slice(0, -1);
    expect(await inspectLiveWebm(truncated)).toMatchObject({ reasonCode: 'WEBM_INCREMENTAL_ELEMENT_INCOMPLETE' });
  });

  test('MSE consumes initialization then each Cluster or returns typed browser absence', async () => {
    const calls: string[] = [];
    expect(await probeLiveWebmAppend(liveWebm(), 'video/webm; codecs="vp8,opus"', {
      isTypeSupported: () => true,
      async appendInitialization() { calls.push('init'); },
      async appendCluster(_bytes, index) { calls.push(`cluster-${index}`); },
      async finalize() { calls.push('finalize'); },
    }, 2)).toMatchObject({ verdict: 'PASS', reasonCode: 'WEBM_MSE_APPEND_VALID' });
    expect(calls).toEqual(['init', 'cluster-0', 'cluster-1', 'finalize']);
    expect(await probeLiveWebmAppend(liveWebm(), 'video/webm', {
      isTypeSupported: () => false,
      async appendInitialization() {}, async appendCluster() {}, async finalize() {},
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_BROWSER' });
  });
});

describe('REQ-FEAT-88 tuple-aware applicability with stable reason codes', () => {
  const capabilities: StreamingTupleCapabilities = {
    containersIn: ['mp4'],
    containersOut: ['mp4', 'ts', 'webm'],
    inputCodecs: ['h264', 'aac'],
    outputCodecs: ['h264', 'aac'],
    streamObserver: true,
    positionedWrites: false,
    fragmentedMp4: true,
    fastStartInMemory: true,
    fastStartReserve: false,
    appendOnlyWebm: true,
    exactWriteChunkBytes: [188],
    maximumStreamInputBytes: 1024,
    maximumBufferInputBytes: 512,
  };

  test('token-complete unsupported combinations become typed NA_ENGINE before execution', () => {
    const reserve = tuple({ container: 'mp4', target: 'stream', fastStart: 'reserve', maximumPacketCount: 10 });
    expect(decideStreamingTupleSupport(reserve, capabilities)).toMatchObject({
      supported: false, status: 'NA_ENGINE', reasonCode: 'STREAMING_POSITIONED_WRITES_UNSUPPORTED',
    });
    try {
      assertStreamingTupleSupported(reserve, capabilities);
      throw new Error('expected applicability error');
    } catch (error) {
      expect(isNotApplicableError(error)).toBe(true);
      if (isNotApplicableError(error)) expect(error.reasonCode).toBe('STREAMING_POSITIONED_WRITES_UNSUPPORTED');
    }
    expect(decideStreamingTupleSupport(tuple({
      container: 'mp4', target: 'stream', fragmented: true,
    }, 2048), capabilities)).toMatchObject({ reasonCode: 'STREAMING_VERIFIED_SCALE_CAP' });
  });

  test('honored combinations pass; malformed option values do not get laundered into NA', () => {
    expect(decideStreamingTupleSupport(tuple({
      container: 'ts', target: 'stream', writeChunkBytes: 188,
    }), capabilities)).toEqual({ supported: true, reasonCode: 'STREAMING_TUPLE_SUPPORTED' });
    expect(() => streamingOutputContractFromOptions({ container: 'ts', target: 'stream', writeChunkBytes: 0 })).toThrow(TypeError);
    expect(() => streamingOutputContractFromOptions({ container: 'mp4', fastStart: 'reserve' })).toThrow(TypeError);
  });
});

describe('REQ-FEAT-89 equivalent-work isolation', () => {
  test('refuses winners for representation, retention, fixture, or measurement drift', () => {
    const first = workIdentity('engine-a@1');
    const second = workIdentity('engine-b@1');
    expect(assessStreamingComparability([first, second])).toMatchObject({
      comparable: true, status: 'COMPARABLE', reasonCode: 'STREAMING_WORK_COMPARABLE', mismatchedFields: [],
    });
    for (const [field, value] of [
      ['representation', 'progressive-mp4'],
      ['retainedOutputPolicy', 'full-buffer'],
      ['fixtureSha256', 'b'.repeat(64)],
      ['measurementContract', 'streaming-measure@2'],
    ] as const) {
      const changed = { ...second, [field]: value };
      const result = assessStreamingComparability([first, changed]);
      expect(result.comparable).toBe(false);
      expect(result.status).toBe('REFUSED');
      expect(result.mismatchedFields).toContain(field);
      expect(result.reasonCode).toBe('STREAMING_WORK_NOT_COMPARABLE');
    }
  });

  test('TTFB pair and scale rows declare like-for-like resolved representations', () => {
    const byId = new Map(streamingOutputScenarios.map((scenario) => [scenario.id, scenario]));
    const buffer = streamingOutputContractFromOptions(byId.get('streaming-output/mp4_ttfb_buffer_target')!.options);
    const stream = streamingOutputContractFromOptions(byId.get('streaming-output/mp4_ttfb_streaming_target')!.options);
    expect(buffer.representation).toBe('fragmented-mp4');
    expect(stream.representation).toBe(buffer.representation);
    for (const id of [
      'streaming-output/stream_large_h264_mp4',
      'streaming-output/stream_huge_h264_mov_to_mp4',
      'streaming-output/stream_massive_h264_mp4',
    ]) {
      expect(streamingOutputContractFromOptions(byId.get(id)!.options).representation).toBe('fragmented-mp4');
    }
    const massiveStream = streamingOutputContractFromOptions(byId.get('streaming-output/stream_massive_h264_mp4')!.options);
    const massiveBuffer = streamingOutputContractFromOptions(byId.get('streaming-output/buffer_massive_h264_mp4')!.options);
    expect(massiveBuffer.representation).toBe(massiveStream.representation);
    expect(massiveBuffer.target).not.toBe(massiveStream.target);
  });
});

function tuple(options: Record<string, unknown>, inputSizeBytes = 512): StreamingTupleRequest {
  return {
    engineId: 'fake@1',
    inputContainer: 'mp4',
    inputCodecs: ['h264', 'aac'],
    outputCodecs: ['h264', 'aac'],
    inputSizeBytes,
    contract: streamingOutputContractFromOptions(options),
  };
}

function workIdentity(engineId: string): StreamingWorkIdentity {
  return {
    engineId,
    browser: 'chromium-140',
    fixtureSha256: 'a'.repeat(64),
    representation: 'fragmented-mp4',
    observerPolicy: 'slow-hash-sink@1',
    retainedOutputPolicy: 'prefix-tail-4k',
    measurementContract: 'streaming-measure@1',
    warmup: 1,
    iterations: 5,
    metric: 'peakMemory',
    unit: 'bytes',
  };
}

function reserveTrace(overflow: boolean): SinkTrace {
  const events: SinkTrace['events'] = overflow
    ? [
        { type: 'operation-start', sequence: 0, atMs: 0 },
        { type: 'reservation', sequence: 1, atMs: 1, position: 0, length: 100, maximumPacketCount: 10 },
        { type: 'abort', sequence: 2, atMs: 2, reasonCode: 'RESERVED_HEADER_OVERFLOW' },
      ]
    : [
        { type: 'operation-start', sequence: 0, atMs: 0 },
        { type: 'reservation', sequence: 1, atMs: 1, position: 0, length: 100, maximumPacketCount: 10 },
        { type: 'write', sequence: 2, atMs: 2, position: 100, length: 10, cumulativeUniqueBytes: 10, outstandingWritePromises: 1 },
        { type: 'write', sequence: 3, atMs: 3, position: 0, length: 20, cumulativeUniqueBytes: 30, outstandingWritePromises: 1 },
        { type: 'finalize-start', sequence: 4, atMs: 4 },
        { type: 'finalize-complete', sequence: 5, atMs: 5 },
        { type: 'close', sequence: 6, atMs: 5 },
      ];
  return {
    schema: 'media-test/sink-trace@1',
    target: 'stream',
    events,
    totalUniqueBytes: overflow ? 0 : 30,
    nativeWriteBytes: overflow ? 0 : 30,
    maximumOutstandingWritePromises: overflow ? 0 : 1,
    maximumQueuedBytes: overflow ? 0 : 20,
    retainedOutputBytes: 0,
    rollingHash: '0000000000000000',
    rollingHashAlgorithm: 'fnv1a64',
    validationPrefix: new Uint8Array(0),
    validationTail: new Uint8Array(0),
  };
}

function simpleTrace(lengths: readonly number[]): SinkTrace {
  let position = 0;
  const events: SinkTrace['events'][number][] = [{ type: 'operation-start', sequence: 0, atMs: 0 }];
  for (const length of lengths) {
    position += length;
    events.push({
      type: 'write', sequence: events.length, atMs: events.length, position: position - length,
      length, cumulativeUniqueBytes: position, outstandingWritePromises: 1,
    });
  }
  events.push({ type: 'finalize-start', sequence: events.length, atMs: events.length });
  events.push({ type: 'finalize-complete', sequence: events.length, atMs: events.length });
  events.push({ type: 'close', sequence: events.length, atMs: events.at(-1)!.atMs });
  return {
    schema: 'media-test/sink-trace@1', target: 'stream', events,
    totalUniqueBytes: position, nativeWriteBytes: position,
    maximumOutstandingWritePromises: 1, maximumQueuedBytes: Math.max(...lengths), retainedOutputBytes: 0,
    rollingHash: '0000000000000000', rollingHashAlgorithm: 'fnv1a64',
    validationPrefix: new Uint8Array(0), validationTail: new Uint8Array(0),
  };
}

function validTs(): Uint8Array {
  const first = pesPacket(256, 15, 2 ** 33 - 90_000);
  return concatPackets([
    patPacket(), pmtPacket(), pcrPacket(256, 7), first, first.slice(),
    adaptationOnlyPacket(256, 4), pesPacket(256, 0, 1000),
  ]);
}

function discontinuityTs(): Uint8Array {
  return concatPackets([
    patPacket(), pmtPacket(), pcrPacket(256, 0),
    pesPacket(256, 5, 0),
    pesPacket(256, 12, 1000, { discontinuity: true }),
    pesPacket(256, 13, 2000),
  ]);
}

function dtsRolloverTs(): Uint8Array {
  return concatPackets([
    patPacket(), pmtPacket(), pcrPacket(256, 0),
    pesPacket(256, 0, 2 ** 33 - 45_000, { dts: 2 ** 33 - 90_000 }),
    pesPacket(256, 1, 90_000, { dts: 0 }),
  ]);
}

function patPacket(): Uint8Array { return psiPacket(0, 0, patSection()); }
function pmtPacket(): Uint8Array { return psiPacket(100, 0, pmtSection()); }

function patSection(): Uint8Array {
  return withPsiCrc(new Uint8Array([
    0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00,
    0x00, 0x01, 0xe0, 0x64,
  ]));
}

function pmtSection(): Uint8Array {
  return withPsiCrc(new Uint8Array([
    0x02, 0xb0, 0x12, 0x00, 0x01, 0xc1, 0x00, 0x00,
    0xe1, 0x00, 0xf0, 0x00,
    0x1b, 0xe1, 0x00, 0xf0, 0x00,
  ]));
}

function withPsiCrc(body: Uint8Array): Uint8Array {
  const crc = mpegCrc32(body);
  return concatBytes(body, new Uint8Array([crc >>> 24, crc >>> 16, crc >>> 8, crc]));
}

function mpegCrc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000_0000) !== 0 ? ((crc << 1) ^ 0x04c1_1db7) >>> 0 : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

function psiPacket(pid: number, cc: number, section: Uint8Array): Uint8Array {
  return payloadPacket(pid, cc, concatBytes(new Uint8Array([0]), section), { pusi: true });
}

function pcrPacket(pid: number, cc: number): Uint8Array {
  const packet = new Uint8Array(188).fill(0xff);
  packet[0] = 0x47;
  packet[1] = (pid >> 8) & 0x1f;
  packet[2] = pid & 0xff;
  packet[3] = 0x20 | cc;
  packet[4] = 183;
  packet[5] = 0x10;
  packet.set([0, 0, 0, 0, 0x7e, 0], 6);
  return packet;
}

function adaptationOnlyPacket(pid: number, cc: number): Uint8Array {
  const packet = new Uint8Array(188).fill(0xff);
  packet[0] = 0x47;
  packet[1] = (pid >> 8) & 0x1f;
  packet[2] = pid & 0xff;
  packet[3] = 0x20 | cc;
  packet[4] = 183;
  packet[5] = 0;
  return packet;
}

function pesPacket(
  pid: number,
  cc: number,
  pts: number,
  options: { discontinuity?: boolean; dts?: number } = {},
): Uint8Array {
  const hasDts = options.dts !== undefined;
  const header = concatBytes(
    new Uint8Array([0, 0, 1, 0xe0, 0, 0, 0x80, hasDts ? 0xc0 : 0x80, hasDts ? 10 : 5]),
    ptsBytes(pts, hasDts ? 3 : 2),
    ...(hasDts ? [ptsBytes(options.dts!, 1)] : []),
    new Uint8Array([1, 2, 3, 4]),
  );
  return payloadPacket(pid, cc, header, { pusi: true, discontinuity: options.discontinuity });
}

function ptsBytes(value: number, prefix: number): Uint8Array {
  const pts = value % 2 ** 33;
  return new Uint8Array([
    (prefix << 4) | (Math.floor(pts / 2 ** 30) << 1) | 1,
    Math.floor(pts / 2 ** 22) & 0xff,
    ((Math.floor(pts / 2 ** 15) & 0x7f) << 1) | 1,
    Math.floor(pts / 2 ** 7) & 0xff,
    ((pts & 0x7f) << 1) | 1,
  ]);
}

function payloadPacket(
  pid: number,
  cc: number,
  payload: Uint8Array,
  options: { pusi?: boolean; discontinuity?: boolean } = {},
): Uint8Array {
  const packet = new Uint8Array(188).fill(0xff);
  packet[0] = 0x47;
  packet[1] = (options.pusi ? 0x40 : 0) | ((pid >> 8) & 0x1f);
  packet[2] = pid & 0xff;
  let offset = 4;
  if (options.discontinuity) {
    packet[3] = 0x30 | cc;
    packet[4] = 1;
    packet[5] = 0x80;
    offset = 6;
  } else packet[3] = 0x10 | cc;
  if (payload.byteLength > 188 - offset) throw new RangeError('payload too large');
  packet.set(payload, offset);
  return packet;
}

function concatPackets(packets: readonly Uint8Array[]): Uint8Array { return concatenate(packets); }

function setPacketByte(bytes: Uint8Array, packet: number, offset: number, value: number): Uint8Array {
  return mutate(bytes, packet * 188 + offset, value);
}

function mutate(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const out = bytes.slice();
  out[offset] = value;
  return out;
}

interface FragmentOptions {
  mvex?: boolean;
  traf?: boolean;
  tfdt?: boolean;
  parameterSets?: boolean;
  defaultBaseIsMoof?: boolean;
  sync?: boolean;
  media?: boolean;
  cmafBrand?: boolean;
  dataOffsetDelta?: number;
}

function fragmentedMp4(options: FragmentOptions = {}): Uint8Array {
  const enabled = <K extends keyof FragmentOptions>(key: K): boolean => options[key] !== false;
  const ftyp = box('ftyp', ascii(enabled('cmafBrand') ? 'cmfc' : 'isom'), u32(0), ascii('iso6'), ascii(enabled('cmafBrand') ? 'cmfc' : 'isom'));
  const tkhd = fullBox('tkhd', 0, 0, u32(0), u32(0), u32(1), u32(0));
  const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(1000), u32(0));
  const hdlr = fullBox('hdlr', 0, 0, u32(0), ascii('vide'));
  const avcEntry = box('avc1', enabled('parameterSets') ? box('avcC', new Uint8Array([1, 100, 0, 40])) : new Uint8Array(0));
  const stsd = fullBox('stsd', 0, 0, u32(1), avcEntry);
  const mdia = box('mdia', mdhd, hdlr, box('minf', box('stbl', stsd)));
  const trak = box('trak', tkhd, mdia);
  const trex = fullBox('trex', 0, 0, u32(1), u32(1), u32(1000), u32(4), u32(enabled('sync') ? 0 : 0x0001_0000));
  const moov = box('moov', trak, enabled('mvex') ? box('mvex', trex) : new Uint8Array(0));
  if (!enabled('media')) return concatBytes(ftyp, moov);

  const mfhd = fullBox('mfhd', 0, 0, u32(1));
  const tfhdFlags = enabled('defaultBaseIsMoof') ? 0x020000 : 0;
  const tfhd = fullBox('tfhd', 0, tfhdFlags, u32(1));
  const tfdt = fullBox('tfdt', 0, 0, u32(0));
  let trun = fullBox('trun', 0, 0x000001, u32(1), i32(0));
  let traf = box('traf', tfhd, enabled('tfdt') ? tfdt : new Uint8Array(0), trun);
  let moof = box('moof', mfhd, enabled('traf') ? traf : new Uint8Array(0));
  const dataOffset = moof.byteLength + 8 + (options.dataOffsetDelta ?? 0);
  trun = fullBox('trun', 0, 0x000001, u32(1), i32(dataOffset));
  traf = box('traf', tfhd, enabled('tfdt') ? tfdt : new Uint8Array(0), trun);
  moof = box('moof', mfhd, enabled('traf') ? traf : new Uint8Array(0));
  return concatBytes(ftyp, moov, box('styp', ascii('cmfs'), u32(0), ascii('cmfs')), moof, box('mdat', new Uint8Array([1, 2, 3, 4])));
}

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const body = concatenate(parts);
  return concatBytes(u32(8 + body.byteLength), ascii(type), body);
}

function fullBox(type: string, version: number, flags: number, ...parts: Uint8Array[]): Uint8Array {
  return box(type, new Uint8Array([version, flags >>> 16, flags >>> 8, flags]), ...parts);
}

interface WebmOptions {
  cues?: boolean;
  seekHead?: boolean;
  duration?: boolean;
  knownSegment?: boolean;
  reverseClusters?: boolean;
  unknownClusters?: boolean;
}

function liveWebm(options: WebmOptions = {}): Uint8Array {
  const ebml = ebmlElement([0x1a, 0x45, 0xdf, 0xa3], new Uint8Array(0));
  const info = ebmlElement(
    [0x15, 0x49, 0xa9, 0x66],
    options.duration ? ebmlElement([0x44, 0x89], new Uint8Array([0, 0, 0, 0])) : new Uint8Array(0),
  );
  const tracks = ebmlElement([0x16, 0x54, 0xae, 0x6b], new Uint8Array(0));
  const first = webmCluster(options.reverseClusters ? 1000 : 0, options.unknownClusters);
  const second = webmCluster(options.reverseClusters ? 0 : 1000, options.unknownClusters);
  const body = concatBytes(
    options.seekHead ? ebmlElement([0x11, 0x4d, 0x9b, 0x74], new Uint8Array(0)) : new Uint8Array(0),
    info,
    tracks,
    first,
    options.cues ? ebmlElement([0x1c, 0x53, 0xbb, 0x6b], new Uint8Array(0)) : new Uint8Array(0),
    second,
  );
  const segmentSize = options.knownSegment ? ebmlSize(body.byteLength) : new Uint8Array([0xff]);
  return concatBytes(ebml, new Uint8Array([0x18, 0x53, 0x80, 0x67]), segmentSize, body);
}

function webmCluster(timecode: number, unknownSize = false): Uint8Array {
  const value = timecode <= 0xff
    ? new Uint8Array([timecode])
    : new Uint8Array([timecode >>> 8, timecode]);
  const body = concatBytes(
    ebmlElement([0xe7], value),
    // A level-one byte pattern inside a finite child must not be mistaken for a sibling boundary.
    ebmlElement([0xa3], new Uint8Array([0x1f, 0x43, 0xb6, 0x75])),
  );
  return unknownSize
    ? concatBytes(new Uint8Array([0x1f, 0x43, 0xb6, 0x75, 0xff]), body)
    : ebmlElement([0x1f, 0x43, 0xb6, 0x75], body);
}

function ebmlElement(id: number[], body: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array(id), ebmlSize(body.byteLength), body);
}

function ebmlSize(size: number): Uint8Array {
  if (size < 0x7f) return new Uint8Array([0x80 | size]);
  if (size < 0x3fff) return new Uint8Array([0x40 | (size >>> 8), size]);
  throw new RangeError('test EBML element too large');
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0);
  return out;
}

function i32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setInt32(0, value);
  return out;
}

function ascii(value: string): Uint8Array { return encoder.encode(value); }

function concatBytes(...parts: Uint8Array[]): Uint8Array { return concatenate(parts); }

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}
