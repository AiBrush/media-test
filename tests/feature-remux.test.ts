import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { MediaBytes, MediaInput } from '../src/core/engine.ts';
import type { OracleOutcome } from '../src/core/scenario.ts';
import {
  REMUX_ROUND_TRIP_LEG_ROLE,
  auditRemuxAvailabilityAssertions,
  auditRemuxScenarioAvailability,
  classifyRejectedPartialRemux,
  classifyTimedOutPartialRemux,
  compareStrictRemuxPrograms,
  evaluateStrictStreamCopy,
  executeRemuxRoundTrip,
  readNeutralRemuxProgram,
  remuxFixtureAvailability,
  remuxRoundTripContractFromOptions,
  validateReturnedPartialRemux,
  type RemuxFixtureManifest,
  type RemuxProgramEvidence,
  type RemuxSampleEvidence,
  type RemuxTrackEvidence,
} from '../src/features/remux/index.ts';
import { remuxScenarios } from '../src/scenarios/remux/index.ts';

function bytesAt(path: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../${path}`, import.meta.url)));
}

function textAt(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function manifest(): RemuxFixtureManifest {
  return JSON.parse(textAt('fixtures/manifest.json')) as RemuxFixtureManifest;
}

function oracleVerdict(outcome: OracleOutcome): string {
  return outcome.state === 'VERDICT' ? outcome.verdict : outcome.state;
}

function lengthPrefixed(...nals: Uint8Array[]): Uint8Array {
  const length = nals.reduce((sum, nal) => sum + 4 + nal.byteLength, 0);
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const nal of nals) {
    view.setUint32(at, nal.byteLength); at += 4;
    out.set(nal, at); at += nal.byteLength;
  }
  return out;
}

function annexB(...nals: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(nals.reduce((sum, nal) => sum + 4 + nal.byteLength, 0));
  let at = 0;
  for (const nal of nals) {
    out.set([0, 0, 0, 1], at); at += 4;
    out.set(nal, at); at += nal.byteLength;
  }
  return out;
}

function avcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const out = new Uint8Array(11 + sps.byteLength + pps.byteLength);
  out.set([1, 0x42, 0, 0x1e, 0xff, 0xe1], 0);
  const view = new DataView(out.buffer);
  view.setUint16(6, sps.byteLength);
  out.set(sps, 8);
  const ppsCount = 8 + sps.byteLength;
  out[ppsCount] = 1;
  view.setUint16(ppsCount + 1, pps.byteLength);
  out.set(pps, ppsCount + 3);
  return out;
}

function sample(payload: Uint8Array, ptsUs: number, dtsUs: number, framing: RemuxSampleEvidence['framing']): RemuxSampleEvidence {
  return { payload, ptsUs, dtsUs, durationUs: 33_367, keyframe: true, framing };
}

function program(container: string, tracks: RemuxTrackEvidence[]): RemuxProgramEvidence {
  const times = tracks.flatMap((track) => track.samples.map((entry) => (entry.ptsUs ?? 0) + (entry.durationUs ?? 0)));
  return {
    schema: 'media-test/remux-program@1', container, byteLength: 1_000,
    ...(times.length ? { durationUs: Math.max(...times) } : {}),
    tracks, representation: {},
  };
}

function audioTrack(id: string, language: string, marker: number): RemuxTrackEvidence {
  return {
    id, type: 'audio', codec: 'aac', language, sampleRate: 48_000, channels: 2,
    samples: [sample(new Uint8Array([marker, 1, 2]), 0, 0, 'raw')],
  };
}

function adtsFrame(payload: Uint8Array, rateIndex = 4, channels = 2): Uint8Array {
  const length = 7 + payload.byteLength;
  const out = new Uint8Array(length);
  out[0] = 0xff; out[1] = 0xf1;
  out[2] = (1 << 6) | (rateIndex << 2) | ((channels >> 2) & 1);
  out[3] = ((channels & 3) << 6) | ((length >> 11) & 3);
  out[4] = (length >> 3) & 0xff;
  out[5] = ((length & 7) << 5) | 0x1f;
  out[6] = 0xfc;
  out.set(payload, 7);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.byteLength; }
  return out;
}

function inputFromBytes(id: string, bytes: Uint8Array): MediaInput {
  return {
    id, url: `memory:${id}`, mime: 'audio/aac', sizeBytes: bytes.byteLength,
    async arrayBuffer(): Promise<ArrayBuffer> { return bytes.slice().buffer as ArrayBuffer; },
    async blob(): Promise<Blob> { return new Blob([bytes.slice().buffer], { type: 'audio/aac' }); },
  };
}

describe('REQ-FEAT-07 strict stream-copy semantic oracle', () => {
  test('Annex-B/AVCC and parameter-set placement are DIFF, while a changed slice is FAIL', () => {
    const sps = new Uint8Array([0x67, 0x42, 0, 0x1e, 0xaa]);
    const pps = new Uint8Array([0x68, 0xce, 0x06]);
    const slice = new Uint8Array([0x65, 0x88, 0x84]);
    const source = program('mp4', [{
      id: 'isobmff:1', type: 'video', codec: 'avc1', width: 640, height: 360,
      codecPrivate: avcC(sps, pps),
      samples: [sample(lengthPrefixed(slice), 0, 0, 'length-prefixed')],
    }]);
    const output = program('ts', [{
      id: 'ts:1:256', type: 'video', codec: 'h264', width: 640, height: 360,
      samples: [sample(annexB(sps, pps, new Uint8Array([9, 0xf0]), slice), 0, 0, 'annexb')],
    }]);
    const lawful = compareStrictRemuxPrograms(source, output, { expectedTargetContainer: 'ts' });
    expect(oracleVerdict(lawful.outcome)).toBe('PASS');
    expect(lawful.outcome.reasonCode).toBe('REMUX_VALID_REPRESENTATION_DIFFERENCE');
    expect(lawful.representationDifferences.join(' ')).toContain('framing');

    const changed = structuredClone(output) as RemuxProgramEvidence;
    const changedPayload = changed.tracks[0]!.samples[0]!.payload.slice();
    changedPayload[changedPayload.length - 1] ^= 1;
    (changed.tracks[0]!.samples[0] as { payload: Uint8Array }).payload = changedPayload;
    expect(oracleVerdict(compareStrictRemuxPrograms(source, changed).outcome)).toBe('FAIL');
  });

  test('matches same-codec tracks by content/language rather than ordinal and rejects a drop', () => {
    const source = program('mp4', [audioTrack('source-1', 'eng', 0x11), audioTrack('source-2', 'fra', 0x22)]);
    const swapped = program('mkv', [audioTrack('target-7', 'fra', 0x22), audioTrack('target-3', 'eng', 0x11)]);
    const result = compareStrictRemuxPrograms(source, swapped);
    expect(oracleVerdict(result.outcome)).toBe('PASS');
    expect(result.outcome.reasonCode).toBe('REMUX_VALID_REPRESENTATION_DIFFERENCE');
    expect(new Set(result.matchedTracks.map((pair) => `${pair.sourceId}:${pair.outputId}`))).toEqual(
      new Set(['source-1:target-3', 'source-2:target-7']),
    );
    expect(oracleVerdict(compareStrictRemuxPrograms(source, program('mkv', [swapped.tracks[0]!])).outcome)).toBe('FAIL');
  });

  test('NTSC/B-frame tick rounding is diagnostic; an actual presentation remap fails', () => {
    const payloads = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    const make = (id: string, pts: number[], dts: number[]): RemuxTrackEvidence => ({
      id, type: 'video', codec: 'vp9', width: 640, height: 360,
      samples: payloads.map((payload, index) => sample(payload, pts[index]!, dts[index]!, 'raw')),
    });
    const source = program('webm', [make('a', [0, 66_733, 33_367], [0, 33_367, 66_733])]);
    const rounded = program('mkv', [make('b', [0, 67_000, 33_000], [0, 33_000, 67_000])]);
    const roundedResult = compareStrictRemuxPrograms(source, rounded, { tolerance: { timestampUs: 500 } });
    expect(oracleVerdict(roundedResult.outcome)).toBe('PASS');
    expect(roundedResult.outcome.reasonCode).toBe('REMUX_VALID_REPRESENTATION_DIFFERENCE');
    const remapped = program('mkv', [make('b', [0, 33_000, 67_000], [0, 33_000, 67_000])]);
    expect(oracleVerdict(compareStrictRemuxPrograms(source, remapped, { tolerance: { timestampUs: 500 } }).outcome)).toBe('FAIL');
  });
});

describe('REQ-FEAT-08 payload-bearing neutral readers and typed boundaries', () => {
  test('reads every declared ordinary remux source format plus fragmented/live structures', () => {
    const cases = [
      ['micro_h264_1frame.mp4', 'mp4', 'h264'],
      ['h264_1080p_5s.mov', 'mov', 'h264'],
      ['h264_in_mkv.mkv', 'mkv', 'h264'],
      ['tiny_vp9_360p_2s.webm', 'webm', 'vp9'],
      ['h264_ts.ts', 'ts', 'h264'],
      ['aac_adts.aac', 'adts', 'aac'],
      ['mp3_xing.mp3', 'mp3', 'mp3'],
      ['opus.ogg', 'ogg', 'opus'],
      ['flac_seektable.flac', 'flac', 'flac'],
      ['fragmented_cmaf.mp4', 'mp4', 'h264'],
      ['recorder_headerless.webm', 'webm', 'vp8'],
    ] as const;
    for (const [file, container, codec] of cases) {
      const result = readNeutralRemuxProgram(bytesAt(`fixtures/media/${file}`), container);
      expect(result.state, file).toBe('OK');
      if (result.state !== 'OK') continue;
      expect(result.value.tracks.some((track) => track.codec === codec && track.samples.length > 0), file).toBe(true);
      expect(result.evidence.parsedSamples, file).toBeGreaterThan(0);
    }
  });

  test('malformed candidate is FAIL; a reader implementation gap is ERROR, never NA_ASSET', () => {
    const source = bytesAt('fixtures/media/micro_h264_1frame.mp4');
    const truncated = source.subarray(0, source.byteLength - 1);
    const invalid = evaluateStrictStreamCopy(source, 'mp4', truncated, 'mp4');
    expect(oracleVerdict(invalid.outcome)).toBe('FAIL');
    expect(invalid.outcome.reasonCode).toBe('REMUX_OUTPUT_INVALID');

    const unsupported = evaluateStrictStreamCopy(source, 'mp4', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'avi');
    expect(unsupported.outcome.state).toBe('ERROR');
    expect(unsupported.outcome.reasonCode).toBe('REMUX_NEUTRAL_FORMAT_UNSUPPORTED');
  });

  test('real fixtures are self-identical and payload corruption is never a representation DIFF', () => {
    for (const [file, container] of [
      ['h264_ts.ts', 'ts'], ['aac_adts.aac', 'adts'], ['mp3_xing.mp3', 'mp3'],
      ['opus.ogg', 'ogg'], ['flac_seektable.flac', 'flac'],
    ] as const) {
      const bytes = bytesAt(`fixtures/media/${file}`);
      expect(oracleVerdict(evaluateStrictStreamCopy(bytes, container, bytes, container, { surfaceRepresentationDifferences: false }).outcome), file).toBe('PASS');
    }
    const aac = bytesAt('fixtures/media/aac_adts.aac');
    const changed = aac.slice();
    changed[20] ^= 1;
    expect(oracleVerdict(evaluateStrictStreamCopy(aac, 'adts', changed, 'adts').outcome)).toBe('FAIL');
  });
});

describe('REQ-FEAT-09 executable two-leg round trip', () => {
  test('observes exactly outbound and return calls and retains first-leg evidence', async () => {
    const source = concat(adtsFrame(new Uint8Array([1, 2, 3])), adtsFrame(new Uint8Array([4, 5, 6])));
    const input = inputFromBytes('roundtrip.aac', source);
    const contract = remuxRoundTripContractFromOptions({ container: 'mkv', roundTrip: ['mkv', 'adts'] })!;
    const calls: Array<{ leg: string; container: string; bytes: Uint8Array }> = [];
    const final = await executeRemuxRoundTrip(input, contract, async (legInput, options, leg): Promise<MediaBytes> => {
      const delivered = new Uint8Array(await legInput.arrayBuffer());
      calls.push({ leg, container: options.container, bytes: delivered });
      return {
        bytes: delivered.slice(),
        mime: leg === 'outbound' ? 'video/x-matroska' : 'audio/aac',
        container: options.container,
      };
    });
    expect(calls.map((call) => [call.leg, call.container])).toEqual([['outbound', 'mkv'], ['return', 'adts']]);
    expect(calls[1]!.bytes).toEqual(source);
    expect(final.intermediates?.[0]).toMatchObject({ role: REMUX_ROUND_TRIP_LEG_ROLE, container: 'mkv' });
    expect(oracleVerdict(evaluateStrictStreamCopy(source, 'adts', final.bytes, 'adts', { surfaceRepresentationDifferences: false }).outcome)).toBe('PASS');
  });

  test('a fault injected only on the return leg fails the final property', async () => {
    const source = concat(adtsFrame(new Uint8Array([1, 2, 3])), adtsFrame(new Uint8Array([4, 5, 6])));
    const input = inputFromBytes('roundtrip-fault.aac', source);
    const contract = remuxRoundTripContractFromOptions({ container: 'mkv', roundTrip: ['mkv', 'adts'] })!;
    const final = await executeRemuxRoundTrip(input, contract, async (legInput, options, leg) => {
      const delivered = new Uint8Array(await legInput.arrayBuffer());
      const output = delivered.slice();
      if (leg === 'return') output[10] ^= 1;
      return { bytes: output, mime: 'audio/aac', container: options.container };
    });
    expect(oracleVerdict(evaluateStrictStreamCopy(source, 'adts', final.bytes, 'adts').outcome)).toBe('FAIL');
  });

  test('the registered round-trip row negotiates both wrappers and requires both oracles', () => {
    const scenario = remuxScenarios.find((item) => item.id === 'remux/prop_roundtrip_mp4_mkv_mp4')!;
    expect(scenario.requires.containersOut).toEqual(['mkv', 'mp4']);
    expect(scenario.oracles).toEqual(['property-invariant', 'reference-reimport']);
    expect((scenario.options as Record<string, unknown>).roundTrip).toEqual(['mkv', 'mp4']);
  });
});

describe('REQ-FEAT-10 safe partial remux classifications', () => {
  test('distinguishes clean rejection, valid complete prefix, invalid output, and timeout', async () => {
    expect(classifyRejectedPartialRemux().disposition).toBe('rejected');
    expect(oracleVerdict(classifyRejectedPartialRemux().outcome)).toBe('PASS');
    expect(classifyTimedOutPartialRemux().disposition).toBe('timeout');
    expect(oracleVerdict(classifyTimedOutPartialRemux().outcome)).toBe('FAIL');

    const complete = concat(adtsFrame(new Uint8Array([1, 2, 3])), adtsFrame(new Uint8Array([4, 5, 6])));
    const valid = await validateReturnedPartialRemux({
      outputBytes: complete, outputContainer: 'adts', sourceByteLength: 1_000,
    });
    expect(valid.disposition).toBe('valid-partial');
    expect(oracleVerdict(valid.outcome)).toBe('PASS');
    expect(valid.outcome.reasonCode).toBe('REMUX_PARTIAL_VALID_COMPLETE_PREFIX');

    const incomplete = await validateReturnedPartialRemux({
      outputBytes: complete.subarray(0, complete.byteLength - 1), outputContainer: 'adts', sourceByteLength: 1_000,
    });
    expect(incomplete.disposition).toBe('invalid-output');
    expect(oracleVerdict(incomplete.outcome)).toBe('FAIL');

    const unbounded = await validateReturnedPartialRemux({
      outputBytes: complete, outputContainer: 'adts', sourceByteLength: 1, maxExpansionRatio: 2,
    });
    expect(unbounded.outcome.reasonCode).toBe('REMUX_PARTIAL_OUTPUT_UNBOUNDED');
  });

  test('requires a terminal probe to reach every retained track/sample when supplied', async () => {
    const complete = concat(adtsFrame(new Uint8Array([1, 2, 3])), adtsFrame(new Uint8Array([4, 5, 6])));
    const stoppedEarly = await validateReturnedPartialRemux({
      outputBytes: complete, outputContainer: 'adts', sourceByteLength: 1_000,
      terminalProbe: {
        state: 'PASS', validatedTrackIds: ['adts:0'], decodedThroughPtsUs: 0,
        detail: 'seeded early stop',
      },
    });
    expect(stoppedEarly.disposition).toBe('invalid-output');
    expect(stoppedEarly.outcome.reasonCode).toBe('REMUX_PARTIAL_TERMINAL_SAMPLE_UNREACHED');

    const noReader = await validateReturnedPartialRemux({
      outputBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), outputContainer: 'avi', sourceByteLength: 100,
    });
    expect(noReader.outcome.state).toBe('ERROR');
    expect(noReader.outcome.reasonCode).toBe('REMUX_NEUTRAL_FORMAT_UNSUPPORTED');
  });

  test('the truncated scenario no longer grants unconditional output presence a PASS', () => {
    const scenario = remuxScenarios.find((item) => item.id === 'remux/neg_truncated_mp4_to_mkv')!;
    const options = scenario.options as Record<string, unknown>;
    expect(options.gracefulAllowOutput).toBeUndefined();
    expect(options.invariant).toBe('safe-partial-output');
    expect(scenario.oracles).toEqual(['graceful-failure', 'property-invariant']);
    expect(options.robustness).toMatchObject({
      schema: 'media-test/robustness-contract@1', inputClass: 'negative', returnedOutputCheck: 'media-structure',
    });
  });
});

describe('REQ-FEAT-11 manifest-derived size-ladder availability', () => {
  test('every one of the 49 remux rows resolves to a concrete manifest identity', () => {
    const source = manifest();
    expect(remuxScenarios).toHaveLength(49);
    expect(auditRemuxScenarioAvailability(remuxScenarios, source)).toEqual([]);
    for (const id of [
      'large_h264_1080p_120s.mp4', 'large_vp9_1080p_120s.webm',
      'huge_h264_1080p_600s.mov', 'massive_h264_1080p_2h.mp4',
    ]) {
      expect(remuxFixtureAvailability(id, source)).toMatchObject({ state: 'BAKED', reasonCode: 'REMUX_MANIFEST_IDENTITY_BAKED' });
    }
  });

  test('a stale null-hash assertion or manifest drift fails the audit', () => {
    const source = manifest();
    expect(auditRemuxAvailabilityAssertions(source, [{
      assetId: 'large_h264_1080p_120s.mp4', expectedState: 'PENDING',
    }])).toMatchObject([{ reasonCode: 'REMUX_AVAILABILITY_ASSERTION_STALE' }]);

    const drifted = structuredClone(source) as { assets: Array<Record<string, unknown>> };
    const target = drifted.assets.find((asset) => asset.id === 'large_h264_1080p_120s.mp4')!;
    target.sha256 = null;
    target.sizeBytes = null;
    expect(auditRemuxScenarioAvailability(remuxScenarios, drifted as unknown as RemuxFixtureManifest)).toContainEqual(
      expect.objectContaining({ assetId: 'large_h264_1080p_120s.mp4', reasonCode: 'REMUX_MANIFEST_IDENTITY_PENDING' }),
    );
    expect(textAt('src/scenarios/remux/size-ladder.ts')).not.toContain('sha256/sizeBytes still null');
  });
});
