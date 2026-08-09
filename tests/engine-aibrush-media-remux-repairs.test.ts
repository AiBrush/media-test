import { describe, expect, test } from 'bun:test';

import {
  AIBRUSH_BROWSER_CANVAS_HDR_TONEMAP_BITRATE_BPS,
  AIBRUSH_BROWSER_CANVAS_HDR_TONEMAP_MAX_FRAMES,
  AIBRUSH_BROWSER_CANVAS_HDR_TONEMAP_MAX_RETAINED_PIXEL_BYTES,
  aibrushBrowserCanvasHdrChebyshevLumaDelta,
  aibrushBrowserCanvasHdrEncoderConfig,
  aibrushBrowserCanvasHdrFeedbackLumaCode,
  aibrushBrowserCanvasVideoTimeline,
  aibrushBrowserCanvasHdrTimelineFitsBudget,
  aibrushBrowserCanvasHdrTonemapRequestEligible,
  aibrushBrowserCanvasHdrTonemapSourceEligible,
  assertAibrushBrowserCanvasHdrFeedbackCardinality,
  assertAibrushBrowserCanvasHdrPacketCardinality,
  executeAibrushBrowserCanvasHdrFeedbackPass,
  materializeFiniteAibrushWebmClusters,
  materializeAibrushAbrOutput,
  muxAibrushBrowserCanvasHdrTonemap,
  prepareAibrushBrowserCanvasHdrTonemapFrames,
  prependAibrushMpegTsH264Aud,
  repairAibrushOggContinuationFlags,
  rewriteAibrushMatroskaTags,
  selectAibrushCopyTrimSampleIndices,
} from '../src/engines/aibrush-media/adapter.ts';
import {
  type MediaInput,
  type TranscodeOptions,
  validateMediaBytes,
} from '../src/core/engine.ts';
import {
  TRANSCODE_ABR_RENDITION_SET_ROLE,
  transcodeAbrSwitchRole,
} from '../src/features/transcode/abr.ts';
import { readNeutralMetadataTags } from '../src/features/metadata/neutral-reader.ts';
import { canonicalizeSemanticTags } from '../src/features/metadata/tags.ts';
import { readNeutralRemuxProgram } from '../src/features/remux/readers.ts';
import { compareStrictRemuxPrograms } from '../src/features/remux/strict-copy.ts';

function oggCrc(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0;
  for (let index = start; index < end; index++) {
    const byte = index >= start + 22 && index < start + 26 ? 0 : bytes[index]!;
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc << 1) ^ ((crc & 0x8000_0000) !== 0 ? 0x04c1_1db7 : 0)) >>> 0;
    }
  }
  return crc >>> 0;
}

function writeU32le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function withSpuriousOggContinuation(source: Uint8Array): Uint8Array {
  const bytes = source.slice();
  const pendingBySerial = new Map<number, boolean>();
  let offset = 0;
  while (offset < bytes.byteLength) {
    const segmentCount = bytes[offset + 26]!;
    const headerEnd = offset + 27 + segmentCount;
    let bodyBytes = 0;
    for (let index = 0; index < segmentCount; index++) bodyBytes += bytes[offset + 27 + index]!;
    const pageEnd = headerEnd + bodyBytes;
    const serial = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset + 14, true);
    const pending = pendingBySerial.get(serial) ?? false;
    if (offset > 0 && !pending && (bytes[offset + 5]! & 1) === 0) {
      bytes[offset + 5] = bytes[offset + 5]! | 1;
      writeU32le(bytes, offset + 22, oggCrc(bytes, offset, pageEnd));
      return bytes;
    }
    pendingBySerial.set(
      serial,
      segmentCount === 0 ? pending : bytes[offset + 27 + segmentCount - 1] === 255,
    );
    offset = pageEnd;
  }
  throw new Error('fixture has no fresh Ogg page to corrupt');
}

describe('aibrush-media strict-copy remux boundary repairs', () => {
  test('admits only the exact browser-canvas HDR request shape', () => {
    expect(AIBRUSH_BROWSER_CANVAS_HDR_TONEMAP_BITRATE_BPS).toBe(2_000_000);
    expect(aibrushBrowserCanvasHdrEncoderConfig(128, 72, 5)).toEqual({
      codec: 'avc1.42E01E',
      width: 128,
      height: 72,
      bitrate: 2_000_000,
      framerate: 5,
      latencyMode: 'quality',
    });
    const input = {
      id: 'hdr.mp4',
      url: 'blob:hdr',
      mime: 'video/mp4',
      sizeBytes: 26_435,
      blob: () => Promise.resolve(new Blob()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } satisfies MediaInput;
    const eligible = {
      container: 'mp4',
      video: { codec: 'h264' },
      tonemap: { from: 'pq', to: 'sdr' },
      invariant: 'transcode-effect-aware',
    } as unknown as TranscodeOptions;
    expect(aibrushBrowserCanvasHdrTonemapRequestEligible(input, eligible)).toBe(true);

    const declined: unknown[] = [
      { ...eligible, video: { codec: 'h264', bitrate: 80_000 } },
      { ...eligible, video: { codec: 'h264', crf: 23 } },
      { ...eligible, video: { codec: 'h264', passes: 2 } },
      { ...eligible, video: { codec: 'h264', bitDepth: 8 } },
      { ...eligible, alpha: 'keep' },
      { ...eligible, flip: 'h' },
      { ...eligible, crop: { x: 0, y: 0, width: 64, height: 36 } },
      { ...eligible, pad: { width: 192, height: 108, color: 'black' } },
      { ...eligible, colorspace: { to: 'bt2020' } },
      { ...eligible, fragmented: true },
      { ...eligible, fastStart: false },
      { ...eligible, tonemap: { from: 'pq', to: 'sdr', operator: 'reinhard' } },
    ];
    for (const opts of declined) {
      expect(
        aibrushBrowserCanvasHdrTonemapRequestEligible(
          input,
          opts as TranscodeOptions,
        ),
      ).toBe(false);
    }
  });

  test('declines source tracks the browser-canvas HDR shortcut would discard', () => {
    const video = { id: 0, mediaType: 'video' as const, codec: 'hevc' };
    const audio = { id: 1, mediaType: 'audio' as const, codec: 'aac' };
    expect(aibrushBrowserCanvasHdrTonemapSourceEligible({ tracks: [video] })).toBe(true);
    expect(aibrushBrowserCanvasHdrTonemapSourceEligible({ tracks: [video, audio] })).toBe(false);
    expect(aibrushBrowserCanvasHdrTonemapSourceEligible({ tracks: [video, { ...video, id: 2 }] })).toBe(false);
  });

  test('bounds retained browser-canvas HDR frames and decoded pixel memory', () => {
    const sample = { timestampUs: 0, durationUs: 200_000 };
    expect(
      aibrushBrowserCanvasHdrTimelineFitsBudget(
        { samples: Array.from({ length: 10 }, () => sample) },
        128,
        72,
      ),
    ).toBe(true);
    expect(
      aibrushBrowserCanvasHdrTimelineFitsBudget(
        {
          samples: Array.from(
            { length: AIBRUSH_BROWSER_CANVAS_HDR_TONEMAP_MAX_FRAMES + 1 },
            () => sample,
          ),
        },
        128,
        72,
      ),
    ).toBe(false);
    expect(
      aibrushBrowserCanvasHdrTimelineFitsBudget(
        { samples: [sample] },
        AIBRUSH_BROWSER_CANVAS_HDR_TONEMAP_MAX_RETAINED_PIXEL_BYTES / 4 + 1,
        1,
      ),
    ).toBe(false);
  });

  test('uses the product BT.709 destination-frame seam with close-once ownership', async () => {
    class OwnedFrame {
      closeCount = 0;
      close(): void {
        this.closeCount++;
        if (this.closeCount > 1) throw new Error('frame closed twice');
      }
    }
    const inputs = [new OwnedFrame(), new OwnedFrame()];
    const outputs = [new OwnedFrame(), new OwnedFrame()];
    let outputIndex = 0;
    let observedIntent: unknown;
    let observedPreserveAlpha: unknown = 'not-called';
    const core = {
      destinationColorI420FrameStream(
        intent: unknown,
        preserveAlpha?: boolean,
        onInputOwned?: (frame: VideoFrame) => void,
      ) {
        observedIntent = intent;
        observedPreserveAlpha = preserveAlpha;
        return new TransformStream<VideoFrame, VideoFrame>({
          transform(frame, controller): void {
            onInputOwned?.(frame);
            (frame as unknown as OwnedFrame).close();
            controller.enqueue(outputs[outputIndex++] as unknown as VideoFrame);
          },
        });
      },
    } as unknown as Parameters<typeof prepareAibrushBrowserCanvasHdrTonemapFrames>[0];

    const result = await prepareAibrushBrowserCanvasHdrTonemapFrames(
      core,
      inputs as unknown as VideoFrame[],
      new AbortController().signal,
    );

    expect(observedIntent).toEqual({ kind: 'bt709-sdr', transform: 'tonemap' });
    expect(observedPreserveAlpha).toBeUndefined();
    expect(inputs.map((frame) => frame.closeCount)).toEqual([1, 1]);
    expect(result).toEqual(outputs);
    expect(outputs.map((frame) => frame.closeCount)).toEqual([0, 0]);
    for (const frame of outputs) frame.close();
  });

  test('closes adapter-owned HDR inputs once when cancellation happens before transform entry', async () => {
    class OwnedFrame {
      closeCount = 0;
      close(): void {
        this.closeCount++;
        if (this.closeCount > 1) throw new Error('frame closed twice');
      }
    }
    const frame = new OwnedFrame();
    let transformCreated = false;
    const core = {
      destinationColorI420FrameStream() {
        transformCreated = true;
        return new TransformStream<VideoFrame, VideoFrame>();
      },
    } as unknown as Parameters<typeof prepareAibrushBrowserCanvasHdrTonemapFrames>[0];
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled before entry', 'AbortError'));

    await expect(
      prepareAibrushBrowserCanvasHdrTonemapFrames(
        core,
        [frame as unknown as VideoFrame],
        controller.signal,
      ),
    ).rejects.toThrow('cancelled before entry');
    expect(transformCreated).toBe(false);
    expect(frame.closeCount).toBe(1);
  });

  test('does not reclaim an HDR input after the product transform owns and rejects it', async () => {
    class OwnedFrame {
      closeCount = 0;
      close(): void {
        this.closeCount++;
        if (this.closeCount > 1) throw new Error('frame closed twice');
      }
    }
    const frame = new OwnedFrame();
    let ownershipCount = 0;
    const conversionError = new Error('destination conversion failed after entry');
    const core = {
      destinationColorI420FrameStream(
        _intent: unknown,
        _preserveAlpha?: boolean,
        onInputOwned?: (value: VideoFrame) => void,
      ) {
        return new TransformStream<VideoFrame, VideoFrame>({
          transform(value): void {
            onInputOwned?.(value);
            ownershipCount++;
            try {
              throw conversionError;
            } finally {
              (value as unknown as OwnedFrame).close();
            }
          },
        });
      },
    } as unknown as Parameters<typeof prepareAibrushBrowserCanvasHdrTonemapFrames>[0];

    await expect(
      prepareAibrushBrowserCanvasHdrTonemapFrames(
        core,
        [frame as unknown as VideoFrame],
        new AbortController().signal,
      ),
    ).rejects.toBe(conversionError);
    expect(ownershipCount).toBe(1);
    expect(frame.closeCount).toBe(1);
  });

  test('rejects encoder output that changes the HDR timeline cardinality', () => {
    expect(() => assertAibrushBrowserCanvasHdrPacketCardinality([], 0)).not.toThrow();
    expect(() => assertAibrushBrowserCanvasHdrPacketCardinality([], 10)).toThrow(
      'encoded 0 packets for 10 input frames',
    );
  });

  test('keeps flat/no-op presentation feedback exactly neutral', () => {
    for (const sample of [0, 16, 64, 128, 235, 255]) {
      expect(
        aibrushBrowserCanvasHdrFeedbackLumaCode(
          121,
          [sample, sample, sample],
          [sample, sample, sample],
        ),
      ).toBe(121);
    }
  });

  test('uses the Chebyshev-optimal common RGB residual for luma feedback', () => {
    // Residuals are +0.3, +0.1, and -0.2. The midpoint of their extrema is +0.05;
    // no other common scalar can make the largest absolute post-adjustment residual smaller.
    expect(
      aibrushBrowserCanvasHdrChebyshevLumaDelta(
        [0.8, 0.4, 0.2],
        [0.5, 0.3, 0.4],
      ),
    ).toBeCloseTo(0.05, 12);
    expect(aibrushBrowserCanvasHdrFeedbackLumaCode(220, [255, 255, 255], [0, 0, 0])).toBe(
      235,
    );
    expect(aibrushBrowserCanvasHdrFeedbackLumaCode(20, [0, 0, 0], [255, 255, 255])).toBe(
      16,
    );
  });

  test('rejects feedback-stage cardinality drift before publishing a final encode', async () => {
    let privateReleaseCount = 0;
    let adjustmentStarted = false;
    await expect(
      executeAibrushBrowserCanvasHdrFeedbackPass(10, new AbortController().signal, {
        async encodePrivate() {
          return {
            value: 'private',
            frameCount: 9,
            release(): void {
              privateReleaseCount++;
            },
          };
        },
        async adjust() {
          adjustmentStarted = true;
          return { value: 'adjusted', frameCount: 10, release(): void {} };
        },
        async encodeFinal() {
          return 'published';
        },
      }),
    ).rejects.toThrow(
      'browser-canvas HDR feedback private encode produced 9 frames for 10 authored samples',
    );
    expect(adjustmentStarted).toBe(false);
    expect(privateReleaseCount).toBe(1);
    expect(() =>
      assertAibrushBrowserCanvasHdrFeedbackCardinality('adjustment', 8, 10),
    ).toThrow('adjustment produced 8 frames for 10 authored samples');
  });

  test('makes cancellation terminal and releases the private feedback output', async () => {
    const controller = new AbortController();
    let privateReleaseCount = 0;
    let adjustmentStarted = false;
    const result = executeAibrushBrowserCanvasHdrFeedbackPass(2, controller.signal, {
      async encodePrivate() {
        controller.abort(new DOMException('feedback cancelled', 'AbortError'));
        return {
          value: new Uint8Array([1, 2, 3]),
          frameCount: 2,
          release(): void {
            privateReleaseCount++;
          },
        };
      },
      async adjust() {
        adjustmentStarted = true;
        return { value: [], frameCount: 2, release(): void {} };
      },
      async encodeFinal() {
        return new Uint8Array([9]);
      },
    });

    await expect(result).rejects.toThrow('feedback cancelled');
    expect(adjustmentStarted).toBe(false);
    expect(privateReleaseCount).toBe(1);
  });

  test('publishes only the final feedback encode and releases the private measurement', async () => {
    const privateOutput = { kind: 'private' } as const;
    const adjusted = { kind: 'adjusted' } as const;
    const published = { kind: 'published' } as const;
    let privateReleaseCount = 0;
    let adjustedReleaseCount = 0;
    const result = await executeAibrushBrowserCanvasHdrFeedbackPass(
      2,
      new AbortController().signal,
      {
        async encodePrivate() {
          return {
            value: privateOutput,
            frameCount: 2,
            release(): void {
              privateReleaseCount++;
            },
          };
        },
        async adjust(value) {
          expect(value).toBe(privateOutput);
          return {
            value: adjusted,
            frameCount: 2,
            release(): void {
              adjustedReleaseCount++;
            },
          };
        },
        async encodeFinal(value) {
          expect(value).toBe(adjusted);
          return published;
        },
      },
    );

    expect(result).toBe(published);
    expect(result).not.toBe(privateOutput);
    expect(privateReleaseCount).toBe(1);
    // Ownership transferred to the final encoder, so the pipeline must not close it a second time.
    expect(adjustedReleaseCount).toBe(0);
  });

  test('keeps every browser-canvas HDR frame in exact presentation order and duration', () => {
    const timeline = aibrushBrowserCanvasVideoTimeline({
      tracks: [
        { id: 0, mediaType: 'audio', codec: 'aac', durationSec: 0.6 },
        { id: 1, mediaType: 'video', codec: 'hevc', durationSec: 0.6, fps: 5 },
      ],
      // Packet-info order may be decode order and may interleave audio. The canvas path must still
      // submit every video sample in presentation order without manufacturing timestamps.
      packets: [
        { trackIndex: 1, ptsUs: 400_000, durationUs: 200_000, keyframe: false },
        { trackIndex: 0, ptsUs: 0, durationUs: 21_333, keyframe: true },
        { trackIndex: 1, ptsUs: 0, durationUs: 200_000, keyframe: true },
        { trackIndex: 1, ptsUs: 200_000, durationUs: 200_000, keyframe: false },
      ],
    });

    expect(timeline).toEqual({
      samples: [
        { timestampUs: 0, durationUs: 200_000 },
        { timestampUs: 200_000, durationUs: 200_000 },
        { timestampUs: 400_000, durationUs: 200_000 },
      ],
      durationSec: 0.6,
      fps: 5,
    });
  });

  test('declines an ambiguous browser-canvas HDR timeline instead of dropping duplicate frames', () => {
    expect(
      aibrushBrowserCanvasVideoTimeline({
        tracks: [{ id: 0, mediaType: 'video', codec: 'hevc', durationSec: 0.4 }],
        packets: [
          { trackIndex: 0, ptsUs: 0, durationUs: 200_000, keyframe: true },
          { trackIndex: 0, ptsUs: 0, durationUs: 200_000, keyframe: false },
        ],
      }),
    ).toBeUndefined();
  });

  test('routes browser-canvas HDR tonemap output through the core color-aware TrackInfo bridge', () => {
    const config: VideoDecoderConfig = {
      codec: 'avc1.42E01E',
      codedWidth: 16,
      codedHeight: 16,
      description: new Uint8Array([1, 100, 0, 31]),
      colorSpace: {
        fullRange: false,
        matrix: 'bt709',
        primaries: 'bt709',
        transfer: 'bt709',
      },
    };
    const packets = [] as const;
    const track = {
      id: 0,
      mediaType: 'video' as const,
      codec: config.codec,
      durationSec: 2.25,
      config,
      color: {
        matrixCoefficients: 1,
        range: 1,
        transferCharacteristics: 1,
        primaries: 1,
      },
    };
    const output = new Uint8Array([0, 0, 0, 8, 0x6d, 0x64, 0x61, 0x74]);
    let observedConfig: unknown;
    let observedFps: unknown = 'not-called';
    let observedDuration: unknown;
    let observedRotation: unknown = 'not-called';
    let observedColorIntent: unknown;
    let observedMuxInput: unknown;
    const core = {
      videoTrackInfoFromDecoderConfig(
        value: VideoDecoderConfig,
        fps: number | undefined,
        durationSec: number | undefined,
        rotation: number | undefined,
        colorIntent: unknown,
      ) {
        observedConfig = value;
        observedFps = fps;
        observedDuration = durationSec;
        observedRotation = rotation;
        observedColorIntent = colorIntent;
        return track;
      },
      muxPreparedMp4PacketTrack(input: unknown) {
        observedMuxInput = input;
        return output;
      },
    } as unknown as Parameters<typeof muxAibrushBrowserCanvasHdrTonemap>[0];

    const result = muxAibrushBrowserCanvasHdrTonemap(core, { config, packets }, 2.25, 5);

    expect(observedConfig).toBe(config);
    expect(observedFps).toBe(5);
    expect(observedDuration).toBe(2.25);
    expect(observedRotation).toBeUndefined();
    expect(observedColorIntent).toEqual({ kind: 'bt709-sdr', transform: 'tonemap' });
    expect(observedMuxInput).toEqual({
      track,
      packets,
      container: 'mp4',
      faststart: true,
      fragmented: false,
    });
    expect(result).toBe(output);
  });

  test('materializes independently owned ABR output plus requested switching evidence', () => {
    const variants = [
      { bytes: new Uint8Array([1, 2, 3]), mime: 'video/mp4', container: 'mp4' },
      { bytes: new Uint8Array([4, 5]), mime: 'video/mp4', container: 'mp4' },
    ];
    const output = materializeAibrushAbrOutput(variants, {
      id: 'two-rung-test',
      renditionIds: ['high', 'low'],
      switchPointsUs: [0],
      segmentMode: 'random-access',
    });

    expect(output.bytes).toEqual(variants[0]!.bytes);
    expect(output.bytes).not.toBe(variants[0]!.bytes);
    expect(output.variants).toEqual(variants);
    const description = output.intermediates?.find((entry) => entry.role === TRANSCODE_ABR_RENDITION_SET_ROLE);
    expect(JSON.parse(new TextDecoder().decode(description?.bytes))).toEqual({
      kind: 'explicit',
      id: 'two-rung-test',
      renditionIds: ['high', 'low'],
      switchPointsUs: [0],
      segmentMode: 'random-access',
    });
    expect(output.intermediates?.find((entry) => entry.role === transcodeAbrSwitchRole('high', 'low', 0))?.bytes)
      .toEqual(variants[1]!.bytes);
    expect(output.intermediates?.find((entry) => entry.role === transcodeAbrSwitchRole('low', 'high', 0))?.bytes)
      .toEqual(variants[0]!.bytes);
    expect(validateMediaBytes('aibrush-media@test', output)).toBe(output);
  });

  test('writes Matroska tags without changing any coded access unit', async () => {
    const requested = {
      title: 'Conformance 🎬 字幕 Clip',
      artist: 'aibrűsh-media-tëst',
      album: 'Suite Vol. 1',
      comment: 'metadata:write roundtrip — '.repeat(12),
      date: '2026-06-18',
      genre: 'Test',
      trackNumber: '7',
    };
    for (const file of ['01.mkv', '02.mkv', '03.mkv', 'h264_in_mkv.mkv']) {
      const source = new Uint8Array(
        await Bun.file(`fixtures/media/scenarios/metadata/write_mkv_tags/${file}`).arrayBuffer(),
      );
      const rewritten = rewriteAibrushMatroskaTags(source, requested);
      expect(rewritten, file).toBeDefined();
      expect(rewritten!.byteLength, file).toBeGreaterThan(source.byteLength);

      const before = readNeutralRemuxProgram(source, 'mkv');
      const after = readNeutralRemuxProgram(rewritten!, 'mkv');
      expect(before.state, file).toBe('OK');
      expect(after.state, file).toBe('OK');
      if (before.state !== 'OK' || after.state !== 'OK') continue;
      expect(compareStrictRemuxPrograms(before.value, after.value).outcome, file).toMatchObject({
        state: 'VERDICT',
        verdict: 'PASS',
      });

      const observation = readNeutralMetadataTags(rewritten!, 'mkv');
      expect(observation.state, file).toBe('OK');
      if (observation.state !== 'OK') continue;
      const canonical = canonicalizeSemanticTags(
        observation.value.carrier,
        observation.value.tags,
        observation.value.scopedTags,
      );
      expect(canonical.conflicts, file).toEqual([]);
      expect(canonical.semantic, file).toEqual(requested);
    }
  });

  test('selects a half-open presentation window and backs video up to its prior keyframe', () => {
    const track = {
      id: 'video:0',
      type: 'video' as const,
      codec: 'h264',
      samples: [
        { payload: new Uint8Array([0]), ptsUs: 1_000_000, dtsUs: 900_000, durationUs: 1_000_000, keyframe: true, framing: 'length-prefixed' as const },
        { payload: new Uint8Array([1]), ptsUs: 2_000_000, dtsUs: 1_900_000, durationUs: 1_000_000, keyframe: false, framing: 'length-prefixed' as const },
        { payload: new Uint8Array([2]), ptsUs: 3_000_000, dtsUs: 2_900_000, durationUs: 1_000_000, keyframe: false, framing: 'length-prefixed' as const },
        { payload: new Uint8Array([3]), ptsUs: 4_000_000, dtsUs: 3_900_000, durationUs: 1_000_000, keyframe: true, framing: 'length-prefixed' as const },
        { payload: new Uint8Array([4]), ptsUs: 5_000_000, dtsUs: 4_900_000, durationUs: 1_000_000, keyframe: false, framing: 'length-prefixed' as const },
      ],
    };

    expect(selectAibrushCopyTrimSampleIndices(track, { startUs: 1_500_000, endUs: 3_500_000 }))
      .toEqual([0, 1, 2, 3]);
    expect(selectAibrushCopyTrimSampleIndices(track, { startUs: 4_000_000, endUs: 4_000_000 }))
      .toEqual([]);

    expect(selectAibrushCopyTrimSampleIndices({
      ...track,
      id: 'audio:0',
      type: 'audio',
      codec: 'opus',
      samples: track.samples.map(({ durationUs: _durationUs, ...sample }) => sample),
    }, { startUs: 1_500_000, endUs: 3_500_000 })).toEqual([1, 2, 3]);
  });

  test('materializes sibling unknown-size WebM clusters without changing coded media', async () => {
    const source = new Uint8Array(
      await Bun.file('fixtures/media/recorder_headerless.webm').arrayBuffer(),
    );
    const repaired = materializeFiniteAibrushWebmClusters(source);

    expect(repaired).toBeDefined();
    expect(repaired).not.toBe(source);
    expect(repaired?.byteLength).toBe(source.byteLength);

    const before = readNeutralRemuxProgram(source, 'webm');
    const after = readNeutralRemuxProgram(repaired!, 'webm');
    expect(before.state).toBe('OK');
    expect(after.state).toBe('OK');
    if (before.state !== 'OK' || after.state !== 'OK') return;

    expect(before.value.durationUs).toBe(2_980_000);
    expect(after.value.durationUs).toBe(before.value.durationUs);
    expect(after.value.tracks.map((track) => track.samples.length)).toEqual([180]);
    expect(after.value.tracks.map((track) => ({
      type: track.type,
      codec: track.codec,
      samples: track.samples.map((sample) => ({
        payload: sample.payload,
        ptsUs: sample.ptsUs,
        dtsUs: sample.dtsUs,
        durationUs: sample.durationUs,
        keyframe: sample.keyframe,
      })),
    }))).toEqual(before.value.tracks.map((track) => ({
      type: track.type,
      codec: track.codec,
      samples: track.samples.map((sample) => ({
        payload: sample.payload,
        ptsUs: sample.ptsUs,
        dtsUs: sample.dtsUs,
        durationUs: sample.durationUs,
        keyframe: sample.keyframe,
      })),
    })));
  });

  test('prefixes a representation-only AVC AUD using the avcC length size', () => {
    const description = new Uint8Array([1, 100, 0, 40, 0xff]);
    const sample = new Uint8Array([0, 0, 0, 3, 0x65, 0x88, 0x84]);

    expect(prependAibrushMpegTsH264Aud(sample, description)).toEqual(
      new Uint8Array([0, 0, 0, 2, 0x09, 0xf0, ...sample]),
    );
    expect(prependAibrushMpegTsH264Aud(sample, new Uint8Array([0, 0, 0, 0, 0xff])))
      .toBeUndefined();
  });

  test('clears only a spurious Ogg continuation flag and restores the page CRC', async () => {
    const source = new Uint8Array(await Bun.file('fixtures/media/opus.ogg').arrayBuffer());
    const broken = withSpuriousOggContinuation(source);
    const before = readNeutralRemuxProgram(broken, 'ogg');
    expect(before.state).toBe('INCOMPLETE');
    if (before.state === 'OK') return;
    expect(before.reasonCode).toBe('REMUX_OGG_CONTINUATION_INVALID');

    const repaired = repairAibrushOggContinuationFlags(broken);
    expect(repaired).toEqual(source);
    expect(readNeutralRemuxProgram(repaired!, 'ogg').state).toBe('OK');
  });
});
