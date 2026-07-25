import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as MP4Box from 'mp4box';

import {
  CONCRETE_OPERATION_PROTOCOL,
  isMalformedInputError,
  isNotApplicableError,
  validateAdapterConformanceSurface,
  validateAdapterFactory,
  type ConcreteOperationRequest,
  type EncodedTrack,
  type LifecycleContext,
  type MediaInput,
  type NormalizedTrack,
  type Operation,
  type OperationContext,
  type PacketInfo,
} from '../src/core/engine.ts';
import { readOutputStructure } from '../src/core/box-readers.ts';
import {
  Mp4boxEngine,
  isMp4boxMalformedDemuxFailure,
  mp4boxSampleEvidence,
} from '../src/engines/mp4box/adapter.ts';
import {
  fpsEvidenceFromSamples,
  parseAacAudioSpecificConfig,
  validateFragmentedMp4,
} from '../src/engines/mp4box/evidence.ts';
import { decideMp4boxSupport } from '../src/engines/mp4box/support.ts';
import { readNeutralRemuxProgram } from '../src/features/remux/readers.ts';

const VIDEO: NormalizedTrack = { type: 'video', codec: 'h264', width: 320, height: 240, fps: 30 };
const AUDIO: NormalizedTrack = { type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 };

interface RequestSpec {
  operation: Operation;
  inputContainer?: string;
  tracks?: NormalizedTrack[];
  outputContainer?: string;
  outputVideoCodec?: string;
  outputAudioCodec?: string;
  options?: Record<string, unknown>;
  inputs?: ConcreteOperationRequest['inputs'];
}

function request({
  operation,
  inputContainer = 'mp4',
  tracks = [VIDEO, AUDIO],
  outputContainer,
  outputVideoCodec,
  outputAudioCodec,
  options = {},
  inputs,
}: RequestSpec): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: `mp4box-test/${operation}`,
    operation,
    inputs: inputs ?? [{
      id: 'source',
      mime: inputContainer === 'mov' ? 'video/quicktime' : 'video/mp4',
      container: inputContainer,
      mutated: false,
      tracks,
    }],
    ...(outputContainer !== undefined ? {
      output: {
        container: outputContainer,
        ...(outputVideoCodec ? { videoCodec: outputVideoCodec } : {}),
        ...(outputAudioCodec ? { audioCodec: outputAudioCodec } : {}),
      },
    } : {}),
    options,
  };
}

function operationContext(value: ConcreteOperationRequest, signal = new AbortController().signal): OperationContext {
  return { signal, phase: 'functional', emit: () => undefined, request: value };
}

function lifecycleContext(signal: AbortSignal, phase: LifecycleContext['phase']): LifecycleContext {
  return { signal, phase, emit: () => undefined };
}

async function fixtureInput(name: string, mime?: string): Promise<MediaInput> {
  const bytes = new Uint8Array(await Bun.file(`fixtures/media/${name}`).arrayBuffer());
  return bytesInput(name, bytes, mime ?? (name.endsWith('.m4a') ? 'audio/mp4' : 'video/mp4'));
}

function bytesInput(id: string, bytes: Uint8Array, mime = 'video/mp4'): MediaInput {
  return {
    id,
    url: `blob:mp4box-test/${id}`,
    mime,
    sizeBytes: bytes.byteLength,
    blob: async () => new Blob([bytes.slice()], { type: mime }),
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

async function withEngine<T>(run: (engine: Mp4boxEngine) => Promise<T>): Promise<T> {
  const engine = new Mp4boxEngine();
  await engine.init();
  try {
    return await run(engine);
  } finally {
    await engine.dispose();
  }
}

function bits(value: number, width: number): string {
  return value.toString(2).padStart(width, '0');
}

function packBits(source: string): Uint8Array {
  const padded = source.padEnd(Math.ceil(source.length / 8) * 8, '0');
  const out = new Uint8Array(padded.length / 8);
  for (let index = 0; index < out.length; index++) {
    out[index] = Number.parseInt(padded.slice(index * 8, index * 8 + 8), 2);
  }
  return out;
}

function packetPayloadHash(packets: readonly PacketInfo[]): string {
  const hash = createHash('sha256');
  for (const packet of packets) {
    hash.update(`${packet.trackIndex}:${packet.size}:${packet.keyframe ? 1 : 0}:`);
    if (packet.payload) hash.update(packet.payload);
  }
  return hash.digest('hex');
}

interface TopBox {
  type: string;
  start: number;
  end: number;
}

function topBoxes(bytes: Uint8Array): TopBox[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: TopBox[] = [];
  let offset = 0;
  while (offset + 8 <= bytes.byteLength) {
    const size = view.getUint32(offset);
    if (size < 8 || offset + size > bytes.byteLength) break;
    boxes.push({
      type: String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!),
      start: offset,
      end: offset + size,
    });
    offset += size;
  }
  return boxes;
}

function replaceFourcc(bytes: Uint8Array, fourcc: string, replacement: string): Uint8Array {
  const out = bytes.slice();
  const needle = new TextEncoder().encode(fourcc);
  for (let offset = 4; offset + 4 <= out.length; offset++) {
    if (needle.every((byte, index) => out[offset + index] === byte)) {
      out.set(new TextEncoder().encode(replacement), offset);
      return out;
    }
  }
  throw new Error(`box ${fourcc} not found`);
}

function emptyIsoBmff(withTrack: boolean): Uint8Array {
  const file = MP4Box.createFile(true);
  file.init({ brands: ['isom', 'iso6'], timescale: 1_000, duration: 0 });
  if (withTrack) {
    file.addTrack({
      id: 1,
      type: 'mp4a',
      hdlr: 'soun',
      timescale: 48_000,
      duration: 0,
      media_duration: 0,
      samplerate: 48_000 * 65_536,
      channel_count: 2,
    });
  }
  const stream = file.getBuffer();
  return new Uint8Array(stream.buffer.slice(0, stream.byteLength));
}

function inspectFirstTrack(bytes: Uint8Array): { descriptionCount: number; descriptionIndex: number } {
  const file = MP4Box.createFile(true);
  let info: import('mp4box').Movie | undefined;
  let parseError: Error | undefined;
  file.onReady = (value) => { info = value; };
  file.onError = (module, message) => { parseError = new Error(`${module}: ${message}`); };
  file.appendBuffer(MP4Box.MP4BoxBuffer.fromArrayBuffer(bytes.slice().buffer, 0), true);
  file.flush();
  if (parseError) throw parseError;
  const track = info?.tracks[0];
  if (!track) throw new Error('output has no track');
  const native = file.getTrackById(track.id);
  const sample = file.getTrackSamplesInfo(track.id)[0];
  if (!native || !sample) throw new Error('output has no sample');
  return {
    descriptionCount: native.mdia.minf.stbl.stsd.entries.length,
    descriptionIndex: sample.description_index,
  };
}

const ALL_PROOFS = ['positive', 'negative-tuple', 'lifecycle', 'normalized-result', 'cancellation'] as const;
const CONFORMANCE_EVIDENCE = {
  operations: {
    probe: ALL_PROOFS,
    demux: ALL_PROOFS,
    remux: ALL_PROOFS,
    mux: ALL_PROOFS,
  },
} as const;

describe('REQ-ENG-20: MP4Box tuple negotiation and precise runtime applicability', () => {
  test('recognizes only the pinned malformed demux parser/extraction signatures', () => {
    expect(isMp4boxMalformedDemuxFailure(new Error(
      "mp4box parse/processing error [ISOFile]: Invalid data found while parsing box of type '\\0\\0\\0\\0' at position 0. Aborting parsing.",
    ))).toBe(true);
    expect(isMp4boxMalformedDemuxFailure(new Error(
      'mp4box@2.3.0: incomplete extraction for track 1: 480/900',
    ))).toBe(true);
    expect(isMp4boxMalformedDemuxFailure(new Error('mp4box parser failed'))).toBe(false);
  });

  test('maps an early negative-row parser callback failure into typed malformed input', async () => {
    const signal = new AbortController().signal;
    const engine = new Mp4boxEngine();
    await engine.init(lifecycleContext(signal, 'support'));
    try {
      const bytes = new Uint8Array(await Bun.file(
        'fixtures/media/scenarios/robustness/fuzz_mp4_header_truncated_demux/01.mp4',
      ).arrayBuffer());
      const concrete = request({
        operation: 'demux',
        options: {
          robustness: {
            schema: 'media-test/robustness-contract@1',
            inputClass: 'negative',
          },
        },
      });
      let error: unknown;
      try {
        await engine.demux(bytesInput('01.mp4', bytes), operationContext(concrete, signal));
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        name: 'MalformedInputError',
        reasonCode: 'MP4BOX_DEMUX_MALFORMED_INPUT_REJECTED',
        operation: 'demux',
        stage: 'parse',
      });
    } finally {
      await engine.dispose(lifecycleContext(signal, 'cleanup'));
    }
  });

  test('classifies only the measured long AAC mux roundtrip contract', () => {
    const measured = request({ operation: 'mux', outputContainer: 'mp4' });
    measured.scenarioId = 'robustness/prop_demux_mux_roundtrip_eq';
    expect(decideMp4boxSupport(measured)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'MP4BOX_LONG_AAC_ROUNDTRIP_UNSUPPORTED',
    });

    const sibling = request({ operation: 'mux', outputContainer: 'mp4' });
    sibling.scenarioId = 'robustness/prop_double_mux_stable';
    expect(decideMp4boxSupport(sibling)).toEqual({ supported: true });
  });

  for (const operation of ['probe', 'demux'] as const) {
    for (const container of ['mp4', 'mov'] as const) {
      test(`${operation} admits ${container}`, () => {
        expect(decideMp4boxSupport(request({ operation, inputContainer: container }))).toEqual({ supported: true });
      });
    }
  }

  for (const operation of ['remux', 'mux'] as const) {
    for (const options of [
      {},
      { fragmented: true },
      { fastStart: 'fragmented' },
      { target: 'buffer' },
      { fragmented: true, fastStart: 'fragmented', target: 'buffer' },
    ]) {
      test(`${operation} admits its exact fragmented buffer shape ${JSON.stringify(options)}`, () => {
        expect(decideMp4boxSupport(request({ operation, outputContainer: 'mp4', options }))).toEqual({ supported: true });
      });
    }

    for (const row of [
      { name: 'non-MP4 output', output: 'mov', options: {}, reasonCode: 'MP4BOX_OUTPUT_CONTAINER_UNSUPPORTED' },
      { name: 'progressive output', output: 'mp4', options: { fragmented: false }, reasonCode: 'MP4BOX_PROGRESSIVE_OUTPUT_UNSUPPORTED' },
      { name: 'non-fragment fast start', output: 'mp4', options: { fastStart: 'in-memory' }, reasonCode: 'MP4BOX_FAST_START_MODE_UNSUPPORTED' },
      { name: 'stream target', output: 'mp4', options: { target: 'stream' }, reasonCode: 'MP4BOX_STREAM_TARGET_UNSUPPORTED' },
      { name: 'requested write granularity', output: 'mp4', options: { writeChunkBytes: 4_096 }, reasonCode: 'MP4BOX_WRITE_GRANULARITY_UNSUPPORTED' },
    ] as const) {
      test(`${operation} classifies ${row.name} as reason-coded NA_ENGINE`, () => {
        expect(decideMp4boxSupport(request({
          operation,
          outputContainer: row.output,
          options: row.options,
        }))).toMatchObject({ supported: false, status: 'NA_ENGINE', reasonCode: row.reasonCode });
      });
    }
  }

  test('classifies the exact CMAF brand contract without hiding fragmented siblings', () => {
    const cmaf = request({
      operation: 'remux',
      outputContainer: 'mp4',
      options: { fragmented: true, target: 'buffer' },
    });
    cmaf.scenarioId = 'streaming-output/mp4_fragmented_cmaf';
    expect(decideMp4boxSupport(cmaf)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'MP4BOX_CMAF_BRAND_UNSUPPORTED',
    });

    const sibling = request({
      operation: 'remux',
      outputContainer: 'mp4',
      options: { fragmented: true, target: 'buffer' },
    });
    sibling.scenarioId = 'streaming-output/prop_probe_dur_fragmented_shape';
    expect(decideMp4boxSupport(sibling)).toEqual({ supported: true });

    cmaf.inputs[0]!.mutated = true;
    expect(decideMp4boxSupport(cmaf)).toEqual({ supported: true });
  });

  test('rejects unsupported track/codec and copy-changing tuples before execution', () => {
    expect(decideMp4boxSupport(request({
      operation: 'remux',
      outputContainer: 'mp4',
      tracks: [{ type: 'subtitle', codec: 'webvtt' }],
    }))).toMatchObject({ supported: false, reasonCode: 'MP4BOX_TRACK_TUPLE_UNSUPPORTED' });
    expect(decideMp4boxSupport(request({
      operation: 'mux',
      outputContainer: 'mp4',
      tracks: [VIDEO],
      outputVideoCodec: 'hevc',
    }))).toMatchObject({ supported: false, reasonCode: 'MP4BOX_MUX_ESSENCE_CHANGE_UNSUPPORTED' });
  });

  test('declares demux scale contracts unavailable when first-packet timing is unobservable', () => {
    expect(decideMp4boxSupport(request({
      operation: 'demux',
      options: {
        robustness: {
          schema: 'media-test/demux-scale-contract@1',
          bucket: 'large',
          limits: { firstPacketMs: 15_000, lastPacketMs: 600_000 },
        },
      },
    }))).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'MP4BOX_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE',
    });
  });

  test('runtime unsupported shape is structured NA while corrupt supported input is structured malformed media', async () => {
    await withEngine(async (engine) => {
      const input = await fixtureInput('micro_h264_1frame.mp4');
      let unsupported: unknown;
      try {
        await engine.remux(input, { container: 'mov' });
      } catch (error) {
        unsupported = error;
      }
      expect(isNotApplicableError(unsupported)).toBe(true);
      expect(unsupported).toMatchObject({
        reasonCode: 'MP4BOX_OUTPUT_CONTAINER_UNSUPPORTED',
        operation: 'remux',
        engineId: 'mp4box@2.3.0',
      });

      let corrupt: unknown;
      try {
        await engine.probe(bytesInput('corrupt.mp4', new Uint8Array([0, 0, 0, 12, 102, 116, 121, 112, 0, 0])));
      } catch (error) {
        corrupt = error;
      }
      expect(corrupt).toBeDefined();
      expect(isMalformedInputError(corrupt)).toBe(true);
      expect(corrupt).toMatchObject({
        reasonCode: 'MP4BOX_MOOV_NOT_FOUND',
        operation: 'probe',
        stage: 'parse',
        engineId: 'mp4box@2.3.0',
        inputId: 'corrupt.mp4',
      });
      expect(isNotApplicableError(corrupt)).toBe(false);
    });
  });

  test('trackless applicable MP4 and empty mux tracks remain malformed-input errors', async () => {
    await withEngine(async (engine) => {
      const trackless = bytesInput('trackless.mp4', emptyIsoBmff(false));
      let remuxError: unknown;
      try {
        await engine.remux(trackless, { container: 'mp4', fragmented: true });
      } catch (error) {
        remuxError = error;
      }
      expect(remuxError).toBeDefined();
      expect(isNotApplicableError(remuxError)).toBe(false);

      let muxError: unknown;
      try {
        await engine.mux({ tracks: [] }, { container: 'mp4', fragmented: true });
      } catch (error) {
        muxError = error;
      }
      expect(muxError).toBeDefined();
      expect(isNotApplicableError(muxError)).toBe(false);
    });
  });
});

describe('performance evidence boundaries', () => {
  test('the baked massive disposition miss is an exact pre-content decision', () => {
    const value = request({ operation: 'probe' });
    value.scenarioId = 'performance/size-ladder-extract-metadata-massive';
    value.inputs[0]!.id = 'massive_h264_1080p_2h.mp4';
    expect(decideMp4boxSupport(value)).toMatchObject({
      supported: false,
      reasonCode: 'MP4BOX_MASSIVE_DEFAULT_DISPOSITION_UNSUPPORTED',
      preContent: true,
    });
    value.inputs[0]!.id = 'scenarios/performance/size-ladder-extract-metadata-massive/01.mp4';
    expect(decideMp4boxSupport(value)).toEqual({ supported: true });

    const massivePackets = request({ operation: 'demux' });
    massivePackets.scenarioId = 'performance/size-ladder-iterate-packets-massive';
    expect(decideMp4boxSupport(massivePackets)).toMatchObject({
      supported: false,
      reasonCode: 'MP4BOX_MASSIVE_PACKET_ARRAYBUFFER_BOUND',
      preContent: true,
    });
    massivePackets.scenarioId = 'performance/size-ladder-iterate-packets-medium';
    expect(decideMp4boxSupport(massivePackets)).toEqual({ supported: true });
  });
});

describe('REQ-ENG-21/22: representation packets, AAC views, and cadence evidence', () => {
  test('normalizes real probe header evidence into the suite presentation view', async () => {
    await withEngine(async (engine) => {
      const tiny = await engine.probe(await fixtureInput(
        'scenarios/probe/tiny_h264_360p_2s/02.mp4',
      ));
      expect(tiny.tracks.find((track) => track.type === 'audio')).toMatchObject({
        sampleRate: 48_000,
        channels: 2,
        codedSampleRate: 24_000,
        presentationSampleRate: 48_000,
        codedChannels: 1,
        sbrPresent: true,
        psPresent: false,
      });
      expect(tiny.tracks.find((track) => track.type === 'audio')).not.toHaveProperty(
        'presentationChannels',
      );

      const legacyMov = await engine.probe(await fixtureInput(
        'scenarios/probe/h264_1080p_5s/02.mov',
        'video/quicktime',
      ));
      expect(legacyMov.tracks.map((track) => track.language)).toEqual(['eng', 'eng']);

      const tagged = await engine.probe(await fixtureInput(
        'scenarios/probe/h264_1080p_30s/01.mp4',
      ));
      expect(tagged.tags?.major_brand).toBe('mp42');

      const rotated = await engine.probe(await fixtureInput('h264_rotated90.mp4'));
      expect(rotated.tracks.find((track) => track.type === 'video')?.rotation).toBe(90);

      const vfr = await engine.probe(await fixtureInput(
        'scenarios/probe/h264_vfr/02.mp4',
      ));
      expect(vfr.presentationDurationSec).toBeCloseTo(200.973, 3);
      expect(vfr.tracks.map((track) => track.language)).toEqual(['eng', 'eng']);
    });
  });

  test('parses AAC-LC, explicit HE-AAC v1, explicit HE-AAC v2/PS, and implicit SBR views', () => {
    expect(parseAacAudioSpecificConfig(new Uint8Array([0x12, 0x10]))).toMatchObject({
      audioObjectType: 2,
      coreAudioObjectType: 2,
      codedSampleRate: 44_100,
      presentationSampleRate: 44_100,
      codedChannels: 2,
      presentationChannels: 2,
      sbrPresent: false,
      psPresent: false,
    });

    const heV1 = packBits(bits(5, 5) + bits(7, 4) + bits(2, 4) + bits(4, 4) + bits(2, 5));
    expect(parseAacAudioSpecificConfig(heV1)).toMatchObject({
      audioObjectType: 5,
      coreAudioObjectType: 2,
      codedSampleRate: 22_050,
      presentationSampleRate: 44_100,
      codedChannels: 2,
      presentationChannels: 2,
      sbrPresent: true,
      psPresent: false,
    });

    const heV2 = packBits(bits(29, 5) + bits(7, 4) + bits(1, 4) + bits(4, 4) + bits(2, 5));
    expect(parseAacAudioSpecificConfig(heV2)).toMatchObject({
      audioObjectType: 29,
      coreAudioObjectType: 2,
      codedSampleRate: 22_050,
      presentationSampleRate: 44_100,
      codedChannels: 1,
      presentationChannels: 2,
      sbrPresent: true,
      psPresent: true,
    });

    const implicit = packBits(
      bits(2, 5) + bits(6, 4) + bits(1, 4) + '0' + bits(0x2b7, 11) + bits(5, 5) + '1' + bits(3, 4),
    );
    expect(parseAacAudioSpecificConfig(implicit)).toMatchObject({
      audioObjectType: 2,
      codedSampleRate: 24_000,
      presentationSampleRate: 48_000,
      sbrPresent: true,
    });

    expect(parseAacAudioSpecificConfig(new Uint8Array([0x13, 0x08, 0x56, 0xe5, 0x98]))).toMatchObject({
      audioObjectType: 2,
      codedSampleRate: 24_000,
      presentationSampleRate: 48_000,
      codedChannels: 1,
      presentationChannels: 1,
      sbrPresent: true,
      psPresent: false,
    });
  });

  test('retains exact 30000/1001 CFR and a bounded VFR cadence envelope', () => {
    const ntsc = fpsEvidenceFromSamples([
      { cts: 0, duration: 1_001, timescale: 30_000 },
      { cts: 1_001, duration: 1_001, timescale: 30_000 },
      { cts: 2_002, duration: 1_001, timescale: 30_000 },
    ]);
    expect(ntsc?.fps).toBeCloseTo(30_000 / 1_001, 12);
    expect(ntsc?.provenance).toMatchObject({
      source: 'observed',
      cadence: 'CFR',
      rational: { numerator: 30_000, denominator: 1_001 },
    });

    const vfr = fpsEvidenceFromSamples([
      { cts: 0, duration: 1_000, timescale: 1_000 },
      { cts: 1_000, duration: 2_000, timescale: 1_000 },
      { cts: 3_000, duration: 1_000, timescale: 1_000 },
    ]);
    expect(vfr?.provenance).toMatchObject({
      source: 'observed',
      cadence: 'VFR',
      envelope: { minFps: 0.5, maxFps: 1 },
    });
  });

  test('sample evidence carries raw access-unit bytes, decoder config, and unsynthesized DTS', () => {
    const packet = mp4boxSampleEvidence({
      size: 4,
      data: new Uint8Array([0, 0, 0, 1]),
      cts: 3_003,
      dts: 2_002,
      duration: 1_001,
      timescale: 30_000,
      is_sync: true,
    } as unknown as import('mp4box').Sample, 0, 'video', 'h264', {
      nativeCodecTag: 'avc1',
      framing: 'avc',
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: 'description',
      nalLengthSize: 4,
      description: new Uint8Array([1, 100, 0, 31]),
      descriptionRecord: 'avc-decoder-configuration-record',
    } as never);
    expect(packet).toMatchObject({
      trackIndex: 0,
      codec: 'h264',
      size: 4,
      dtsUs: 2_002 * 1_000_000 / 30_000,
      ptsUs: 3_003 * 1_000_000 / 30_000,
      durationUs: 1_001 * 1_000_000 / 30_000,
      framing: 'avc',
      nalLengthSize: 4,
      randomAccessKind: 'sync-sample',
    });
    expect(packet.payload).toEqual(new Uint8Array([0, 0, 0, 1]));
    expect(packet.decoderConfig).toEqual(new Uint8Array([1, 100, 0, 31]));
  });

  test('auxiliary packet evidence does not publish a noncanonical AV codec token', () => {
    const packet = mp4boxSampleEvidence({
      size: 4,
      data: new Uint8Array([0, 0, 0, 0]),
      cts: 0,
      dts: 0,
      duration: 1,
      timescale: 30,
      is_sync: true,
    } as unknown as import('mp4box').Sample, 1, 'other', 'tmcd', {
      nativeCodecTag: 'tmcd',
      framing: 'raw',
      accessUnitGrouping: 'one-frame-per-chunk',
      parameterSetLocation: 'not-applicable',
    } as never);
    expect(packet.trackType).toBe('other');
    expect(packet).not.toHaveProperty('codec');
  });

  test('real demux is decode-ordered and auditable; the unobservable WebCodecs token is removed', async () => {
    await withEngine(async (engine) => {
      expect(engine.capabilities().features).not.toContain('webcodecs:demux-feed');
      const result = await engine.demux(await fixtureInput('micro_h264_1frame.mp4'));
      expect(result.packetOrdering).toBe('decode');
      expect(result.packets).toHaveLength(1);
      expect(result.packets[0]?.payload?.byteLength).toBe(result.packets[0]?.size);
      expect(result.packets[0]?.dtsUs).toBeDefined();
      expect(result.representations?.[0]).toMatchObject({
        packetOrdering: 'decode',
        framing: 'avc',
        accessUnitGrouping: 'one-access-unit-per-chunk',
        parameterSetLocation: 'description',
        descriptionRecord: 'avc-decoder-configuration-record',
      });
      expect(result.representations?.[0]?.description?.byteLength).toBeGreaterThan(0);
      expect(result.metadata.tracks[0]).toMatchObject({
        codec: 'h264',
        nativeCodecTag: expect.stringContaining('avc1'),
      });
    });
  });

  test('real demux omits only the short trailing AAC suffix excluded by a MOV edit', async () => {
    await withEngine(async (engine) => {
      const result = await engine.demux(await fixtureInput(
        'scenarios/demux/h264_1080p_5s/01.mov',
        'video/quicktime',
      ));
      const videoTrack = result.metadata.tracks.findIndex((track) => track.type === 'video');
      const audioTrack = result.metadata.tracks.findIndex((track) => track.type === 'audio');
      expect(result.packets.filter((packet) => packet.trackIndex === videoTrack)).toHaveLength(194);
      expect(result.packets.filter((packet) => packet.trackIndex === audioTrack)).toHaveLength(278);
      expect(engine.configUsed).toMatchObject({ presentationEditFilteredSamples: 2 });
    });
  });
});

describe('REQ-ENG-23: sample-entry configuration and presentation timeline preservation', () => {
  for (const name of ['gapless_aac.m4a', 'h264_bframes_1080p.mp4'] as const) {
    test(`round-trips payload and exact PTS/DTS semantics for ${name}`, async () => {
      await withEngine(async (engine) => {
        const source = await fixtureInput(name);
        const before = await engine.demux(source);
        const prepared = await engine.prepareMuxTracks([source], { container: 'mp4', fragmented: true });
        expect(prepared.tracks.length).toBeGreaterThan(0);
        for (const track of prepared.tracks) {
          expect(track.packetOrdering).toBe('decode');
          expect(track.timebase?.denominator).toBe(track.timescale);
          expect(track.chunks.every((chunk, index) => chunk.dtsUs !== undefined && chunk.decodeIndex === index)).toBe(true);
          if (track.codec === 'h264') {
            expect(track.framing).toBe('avc');
            expect(track.descriptionRecord).toBe('avc-decoder-configuration-record');
          }
        }
        const privateTracks = prepared.tracks as Array<EncodedTrack & {
          mp4boxMux?: { edits: unknown[]; sampleEntries: unknown[]; presentationOffsetUs: number };
        }>;
        expect(privateTracks.every((track) => (track.mp4boxMux?.sampleEntries.length ?? 0) > 0)).toBe(true);
        if (name === 'h264_bframes_1080p.mp4') {
          expect(privateTracks.some((track) => (track.mp4boxMux?.edits.length ?? 0) > 0)).toBe(true);
        }

        const muxed = await engine.mux(prepared, { container: 'mp4', fragmented: true });
        const after = await engine.demux(bytesInput(`muxed-${name}`, muxed.bytes, muxed.mime));
        expect(after.packets).toHaveLength(before.packets.length);
        expect(packetPayloadHash(after.packets)).toBe(packetPayloadHash(before.packets));
        for (let index = 0; index < before.packets.length; index++) {
          const left = before.packets[index]!;
          const right = after.packets[index]!;
          expect(right.trackIndex).toBe(left.trackIndex);
          expect(right.ptsUs).toBe(left.ptsUs);
          expect(right.dtsUs).toBe(left.dtsUs);
          expect(right.durationUs).toBe(left.durationUs);
          expect(right.size).toBe(left.size);
          expect(right.keyframe).toBe(left.keyframe);
        }
      });
    });
  }

  test('copies the terminal stts delta and keeps edit-list presentation duration decisive', async () => {
    await withEngine(async (engine) => {
      const vfrSource = await fixtureInput('scenarios/mux/prop_vfr_mux_duration_mp4_to_mp4/01.mp4');
      const vfrBytes = new Uint8Array(await vfrSource.arrayBuffer());
      const sourceProgram = readNeutralRemuxProgram(vfrBytes, 'mp4');
      const prepared = await engine.prepareMuxTracks([vfrSource], { container: 'mp4', fragmented: true });
      const muxed = await engine.mux(prepared, { container: 'mp4', fragmented: true });
      const outputProgram = readNeutralRemuxProgram(muxed.bytes, 'mp4');
      expect(sourceProgram.state).toBe('OK');
      expect(outputProgram.state).toBe('OK');
      if (sourceProgram.state === 'OK' && outputProgram.state === 'OK') {
        const sourceAudio = sourceProgram.value.tracks.find((track) => track.type === 'audio');
        const outputAudio = outputProgram.value.tracks.find((track) => track.type === 'audio');
        expect(outputAudio?.samples.at(-1)?.durationUs).toBe(sourceAudio?.samples.at(-1)?.durationUs);
      }

      const editedPath = 'scenarios/mux/h264_aac_to_mp4/01.mp4';
      const editedBytes = new Uint8Array(await Bun.file(`fixtures/media/${editedPath}`).arrayBuffer());
      const editedInput = bytesInput(editedPath, editedBytes);
      const editedPrepared = await engine.prepareMuxTracks([editedInput], { container: 'mp4', fragmented: true });
      const editedMuxed = await engine.mux(editedPrepared, { container: 'mp4', fragmented: true });
      const sourceStructure = readOutputStructure(editedBytes, 'mp4');
      const outputStructure = readOutputStructure(editedMuxed.bytes, 'mp4');
      expect(Math.abs((outputStructure?.durationSec ?? 0) - (sourceStructure?.durationSec ?? 0))).toBeLessThanOrEqual(0.001);
    });
  });

  test('marks fragmented trun offsets signed when a MOV carries negative video composition offsets', async () => {
    await withEngine(async (engine) => {
      const source = await fixtureInput(
        'scenarios/remux/h264_1080p_5s_mov_to_mp4/03.mov',
        'video/quicktime',
      );
      const before = await engine.demux(source);
      const output = await engine.remux(source, { container: 'mp4', fragmented: true });
      expect(engine.configUsed).toMatchObject({ signedTrunVersionPatches: expect.any(Number) });
      expect((engine.configUsed as { signedTrunVersionPatches: number }).signedTrunVersionPatches).toBeGreaterThan(0);
      const after = await engine.demux(bytesInput('signed-trun.mp4', output.bytes));
      const videoBefore = before.packets.filter((packet) => before.metadata.tracks[packet.trackIndex]?.type === 'video');
      const videoAfter = after.packets.filter((packet) => after.metadata.tracks[packet.trackIndex]?.type === 'video');
      expect(videoAfter.map((packet) => [packet.ptsUs, packet.dtsUs])).toEqual(
        videoBefore.map((packet) => [packet.ptsUs, packet.dtsUs]),
      );
    });
  });

  test('preserves a uniform non-default description index and reason-codes an actual switch', async () => {
    await withEngine(async (engine) => {
      const source = await fixtureInput('micro_h264_1frame.mp4');
      const prepared = await engine.prepareMuxTracks([source], { container: 'mp4', fragmented: true });
      const track = prepared.tracks[0] as EncodedTrack & {
        chunks: Array<EncodedTrack['chunks'][number] & {
          sampleDescriptionIndex?: number;
          mp4boxTiming?: { cts: number; dts: number; duration: number };
        }>;
        mp4boxMux: { sampleEntries: unknown[] };
      };
      track.mp4boxMux.sampleEntries.push(track.mp4boxMux.sampleEntries[0]);
      track.chunks[0]!.sampleDescriptionIndex = 1;
      const uniform = await engine.mux(prepared, { container: 'mp4', fragmented: true });
      expect(inspectFirstTrack(uniform.bytes)).toEqual({ descriptionCount: 2, descriptionIndex: 1 });

      const first = track.chunks[0]!;
      track.chunks.push({
        ...first,
        data: first.data.slice(),
        ptsUs: first.ptsUs + first.durationUs,
        ...(first.dtsUs !== undefined ? { dtsUs: first.dtsUs + first.durationUs } : {}),
        decodeIndex: 1,
        sampleDescriptionIndex: 0,
        ...(first.mp4boxTiming ? {
          mp4boxTiming: {
            cts: first.mp4boxTiming.cts + first.mp4boxTiming.duration,
            dts: first.mp4boxTiming.dts + first.mp4boxTiming.duration,
            duration: first.mp4boxTiming.duration,
          },
        } : {}),
      });
      let switched: unknown;
      try {
        await engine.mux(prepared, { container: 'mp4', fragmented: true });
      } catch (error) {
        switched = error;
      }
      expect(isNotApplicableError(switched)).toBe(true);
      expect(switched).toMatchObject({ reasonCode: 'MP4BOX_SAMPLE_DESCRIPTION_SWITCH_UNSUPPORTED' });
    });
  });
});

describe('REQ-ENG-24: fragment and writer completion proof', () => {
  test('validates exact init/media structure and rejects init-only, missing tfdt/mdat, truncation, and count mismatch', async () => {
    await withEngine(async (engine) => {
      const source = await fixtureInput('micro_h264_1frame.mp4');
      const output = await engine.remux(source, { container: 'mp4', fragmented: true });
      expect(validateFragmentedMp4(output.bytes, 1)).toMatchObject({
        valid: true,
        reasonCode: 'MP4BOX_FRAGMENT_COMPLETE',
        sampleCount: 1,
      });

      const moof = topBoxes(output.bytes).find((box) => box.type === 'moof');
      expect(moof).toBeDefined();
      expect(validateFragmentedMp4(output.bytes.slice(0, moof!.start))).toMatchObject({
        valid: false,
        reasonCode: 'MP4BOX_FRAGMENT_MEDIA_MISSING',
      });
      expect(validateFragmentedMp4(replaceFourcc(output.bytes, 'tfdt', 'free'))).toMatchObject({
        valid: false,
        reasonCode: 'MP4BOX_FRAGMENT_TFDT_MISSING',
      });
      expect(validateFragmentedMp4(replaceFourcc(output.bytes, 'mdat', 'free'))).toMatchObject({
        valid: false,
        reasonCode: 'MP4BOX_FRAGMENT_MDAT_MISSING',
      });
      expect(validateFragmentedMp4(output.bytes.slice(0, -1))).toMatchObject({
        valid: false,
        reasonCode: 'MP4BOX_FRAGMENT_BOX_TRUNCATED',
      });
      expect(validateFragmentedMp4(output.bytes, 2)).toMatchObject({
        valid: false,
        reasonCode: 'MP4BOX_FRAGMENT_SAMPLE_COUNT_MISMATCH',
      });

      let incompleteInput: unknown;
      try {
        await engine.demux(bytesInput('truncated-fragment.mp4', output.bytes.slice(0, -32)));
      } catch (error) {
        incompleteInput = error;
      }
      expect(incompleteInput).toBeDefined();
      expect(isNotApplicableError(incompleteInput)).toBe(false);
    });
  });

  test('zero-sample media tracks never become plausible output', async () => {
    await withEngine(async (engine) => {
      let error: unknown;
      try {
        await engine.remux(bytesInput('zero-sample.mp4', emptyIsoBmff(true), 'audio/mp4'), {
          container: 'mp4',
          fragmented: true,
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeDefined();
      expect(isNotApplicableError(error)).toBe(false);
      expect(engine.configUsed).toMatchObject({ cleanupComplete: true, activeFiles: 0 });
    });
  });
});

describe('REQ-ENG-25: bounded progressive memory and deterministic cancellation/cleanup', () => {
  test('falls back to the verified buffer when Chromium cannot read a Blob slice', async () => {
    await withEngine(async (engine) => {
      const source = await fixtureInput('micro_h264_1frame.mp4');
      const bytes = new Uint8Array(await source.arrayBuffer());
      const unreadableBlob = {
        size: bytes.byteLength,
        slice: () => ({
          arrayBuffer: async () => {
            throw new DOMException('fixture-backed Blob is unavailable', 'NotReadableError');
          },
        }),
      } as unknown as Blob;
      const input: MediaInput = {
        ...source,
        blob: async () => unreadableBlob,
        arrayBuffer: async () => bytes.buffer,
      };
      const output = await engine.remux(input, { container: 'mp4', fragmented: true });
      expect(validateFragmentedMp4(output.bytes, 1)).toMatchObject({ valid: true });
      expect(engine.configUsed).toMatchObject({
        readerMode: 'blob-progressive-slices+verified-array-buffer-fallback',
        arrayBufferReadFallbacks: 1,
      });
    });
  });

  test('large input uses progressive slices, bounded batches, immediate release, and one progressive target buffer', async () => {
    await withEngine(async (engine) => {
      const source = await fixtureInput('h264_bframes_1080p.mp4');
      const probed = await engine.probe(source);
      expect(probed.telemetry?.bytesRead).toBeLessThan(source.sizeBytes!);

      const demuxed = await engine.demux(source);
      const demuxConfig = engine.configUsed as Record<string, unknown>;
      expect(demuxConfig.readChunkBytes).toBe(1_048_576);
      expect(demuxConfig.processBatchSamples).toBe(16);
      expect(demuxConfig.appendCount).toBeGreaterThan(1);
      expect(demuxConfig.releasedSamples).toBe(demuxed.packets.length);
      expect(demuxConfig.peakParserSampleBytes as number).toBeLessThanOrEqual(2 * 1_048_576);
      expect(demuxConfig.cleanupComplete).toBe(true);
      expect(demuxConfig.activeFiles).toBe(0);

      const remuxed = await engine.remux(source, { container: 'mp4', fragmented: true });
      const remuxConfig = engine.configUsed as Record<string, unknown>;
      expect(remuxed.targetWrites).toBeGreaterThan(1);
      expect(remuxConfig.releasedSamples).toBe(demuxed.packets.length);
      expect(remuxConfig.peakParserSampleBytes as number).toBeLessThanOrEqual(2 * 1_048_576);
      expect(remuxConfig.peakOutputTargetBytes as number).toBeLessThanOrEqual(remuxed.bytes.byteLength * 3);
      expect(remuxConfig.fragmentValidation).toMatchObject({ valid: true });
      expect(remuxConfig.stopCalled).toBe(true);
      expect(remuxConfig.cleanupComplete).toBe(true);
      expect(remuxConfig.activeFiles).toBe(0);
    });
  });

  test('an onError after onReady stays authoritative and cleanup does not mask it', async () => {
    const engine = new Mp4boxEngine();
    await engine.init();
    let stops = 0;
    const fakeFile = {
      samplesDataSize: 0,
      onReady: undefined as ((info: import('mp4box').Movie) => void) | undefined,
      onError: undefined as ((module: string, message: string) => void) | undefined,
      onSamples: undefined,
      onSegment: undefined,
      appendBuffer(buffer: ArrayBuffer) {
        this.onReady?.({ tracks: [], brands: ['isom'], duration: 0, timescale: 1_000 } as import('mp4box').Movie);
        this.onError?.('late-parser', 'failure after ready');
        return buffer.byteLength;
      },
      flush() {},
      stop() { stops++; },
    };
    const fakeModule = {
      createFile: () => fakeFile,
      MP4BoxBuffer: {
        fromArrayBuffer: (buffer: ArrayBuffer) => buffer,
      },
    };
    (engine as unknown as { mp4box: unknown }).mp4box = fakeModule;
    let error: unknown;
    try {
      await engine.probe(bytesInput('late-error.mp4', new Uint8Array(16)));
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).toContain('failure after ready');
    expect(isNotApplicableError(error)).toBe(false);
    expect(stops).toBe(1);
    expect(engine.configUsed).toMatchObject({
      lateErrorObserved: true,
      stopCalled: true,
      cleanupComplete: true,
      activeFiles: 0,
    });
    await engine.dispose();
  });

  test('abort races a stalled range read, stops parser work promptly, and preserves AbortError', async () => {
    const abort = new AbortController();
    const engine = new Mp4boxEngine();
    await engine.init(lifecycleContext(abort.signal, 'support'));
    const never = new Promise<ArrayBuffer>(() => undefined);
    const stalledBlob = {
      size: 1_048_576,
      slice: () => ({ arrayBuffer: () => never }),
    } as unknown as Blob;
    const input: MediaInput = {
      id: 'stalled.mp4',
      url: 'blob:mp4box-test/stalled',
      mime: 'video/mp4',
      sizeBytes: 1_048_576,
      blob: async () => stalledBlob,
      arrayBuffer: async () => never,
    };
    const concrete = request({ operation: 'probe' });
    const started = performance.now();
    const pending = engine.probe(input, operationContext(concrete, abort.signal));
    queueMicrotask(() => abort.abort(new DOMException('test abort', 'AbortError')));
    let error: unknown;
    try {
      await Promise.race([
        pending,
        new Promise((_, reject) => setTimeout(() => reject(new Error('abort deadline exceeded')), 250)),
      ]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toHaveProperty('name', 'AbortError');
    expect(performance.now() - started).toBeLessThan(250);
    expect(engine.configUsed).toMatchObject({ stopCalled: true, cleanupComplete: true, activeFiles: 0 });
    await engine.dispose(lifecycleContext(abort.signal, 'cleanup'));
  });

  test('adapter profile, lifecycle surface, fresh factory, and declared operation proofs conform', async () => {
    const engine = new Mp4boxEngine();
    expect(() => validateAdapterConformanceSurface(engine, CONFORMANCE_EVIDENCE)).not.toThrow();
    const [first, second] = await validateAdapterFactory(() => new Mp4boxEngine(), CONFORMANCE_EVIDENCE);
    expect(first).not.toBe(second);
    expect(first.id).toBe(second.id);
    expect(Object.isFrozen(engine.configUsed)).toBe(true);
    expect(engine.benchmarkLimits).toEqual({
      maxInnerIterations: 1,
      memoryWindow: {
        sampleImmediatelyDuringOperation: true,
        maxOperationSamples: 1,
        settleWindowMs: 0,
        sampleTimeoutMs: 1_000,
      },
    });
  });
});
