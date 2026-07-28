import { describe, expect, test } from 'bun:test';
import { CapabilityError, InputError } from '@aibrush/media';
import {
  CONCRETE_OPERATION_PROTOCOL,
  SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  isMalformedInputError,
  isNotApplicableError,
  validateCapabilitySet,
  type ConcreteOperationRequest,
  type MediaInput,
  type NormalizedTrack,
  type OperationContext,
  type TranscodeAudioOptions,
} from '../src/core/engine.ts';
import {
  AibrushMediaEngine,
  aibrushDirectDecodeFitsFrameBudget,
} from '../src/engines/aibrush-media/adapter.ts';
import { classifyAibrushFrameworkError, translateAibrushFrameworkError } from '../src/engines/aibrush-media/errors.ts';
import { sha256Hex } from '../src/engines/platform/digest.ts';
import { decideAibrushSupport } from '../src/engines/aibrush-media/support.ts';
import { decodeNativePcm } from '../src/features/audio-dsp/index.ts';

const VIDEO: NormalizedTrack = {
  type: 'video',
  codec: 'h264',
  nativeCodecTag: 'avc1.640028',
  width: 1_920,
  height: 1_080,
  fps: 30,
};
const AUDIO: NormalizedTrack = {
  type: 'audio',
  codec: 'aac',
  nativeCodecTag: 'mp4a.40.2',
  sampleRate: 48_000,
  channels: 2,
};

describe('REQ-ENG-32: aibrush-media concrete tuple applicability', () => {
  test('the declared still-image inputs are valid shared capability tokens', () => {
    const engine = new AibrushMediaEngine();
    const capabilities = validateCapabilitySet(engine);
    expect(capabilities.containersIn).toEqual(expect.arrayContaining(['jpeg', 'png', 'webp']));
    expect(capabilities.probeReadModes).toEqual(['range', 'whole-file']);
  });

  test('does not claim display-matrix-applied decode without an explicit rotation path', () => {
    const capabilities = validateCapabilitySet(new AibrushMediaEngine());
    expect(capabilities.features).not.toContain('rotation:decode');
    expect(capabilities.features).toContain('rotate');
  });

  test('bounds adaptive reuse and cross-process memory sampling', () => {
    expect(new AibrushMediaEngine().benchmarkLimits).toEqual({
      maxInnerIterations: 1,
      memoryWindow: {
        sampleImmediatelyDuringOperation: true,
        maxOperationSamples: 1,
        settleWindowMs: 0,
        sampleTimeoutMs: 1_000,
      },
    });
  });

  test('bounds direct ISO-BMFF decode by decoded RGBA storage rather than a fixture-sized frame cap', () => {
    expect(
      aibrushDirectDecodeFitsFrameBudget(
        { codedWidth: 320, codedHeight: 240 },
        240,
      ),
    ).toBe(true);
    expect(
      aibrushDirectDecodeFitsFrameBudget(
        { codedWidth: 1_920, codedHeight: 1_080 },
        60,
      ),
    ).toBe(true);
    expect(
      aibrushDirectDecodeFitsFrameBudget(
        { codedWidth: 3_840, codedHeight: 2_160 },
        30,
      ),
    ).toBe(false);
    expect(
      aibrushDirectDecodeFitsFrameBudget(
        { codedWidth: 64, codedHeight: 64 },
        513,
      ),
    ).toBe(false);
    expect(
      aibrushDirectDecodeFitsFrameBudget(
        { codedWidth: 0, codedHeight: 240 },
        1,
      ),
    ).toBe(false);
  });

  const rows: Array<[string, ConcreteOperationRequest, string]> = [
    [
      'still-image demux',
      request('demux', 'jpeg', [], { outputContainer: undefined }),
      'AIBRUSH_STILL_IMAGE_OPERATION_UNSUPPORTED',
    ],
    [
      'still-image remux',
      request('remux', 'png', [], { outputContainer: 'mp4' }),
      'AIBRUSH_STILL_IMAGE_OPERATION_UNSUPPORTED',
    ],
    [
      'fragmented trim',
      request('trim', 'mp4', [VIDEO, AUDIO], {
        outputContainer: 'mp4',
        options: { fragmented: true },
      }),
      'AIBRUSH_FRAGMENTED_TRIM_UNSUPPORTED',
    ],
    [
      'append-only MP4',
      request('remux', 'mp4', [VIDEO, AUDIO], {
        outputContainer: 'mp4',
        options: { appendOnly: true },
      }),
      'AIBRUSH_APPEND_ONLY_TUPLE_UNSUPPORTED',
    ],
    ['AAC in WAV', request('mux', 'mp4', [AUDIO], { outputContainer: 'wav' }), 'AIBRUSH_CONTAINER_CODEC_ILLEGAL'],
    [
      'video in PCM container',
      request('transcode', 'mp4', [VIDEO], {
        outputContainer: 'wav',
        videoCodec: 'h264',
        audioCodec: 'pcm-s16',
      }),
      'AIBRUSH_CONTAINER_CODEC_ILLEGAL',
    ],
    [
      'unsupported encoder',
      request('transcode', 'mp4', [VIDEO], {
        outputContainer: 'mp4',
        videoCodec: 'theora',
      }),
      'AIBRUSH_VIDEO_ENCODER_UNAVAILABLE',
    ],
    [
      'reserved fast start',
      request('remux', 'mp4', [VIDEO, AUDIO], {
        outputContainer: 'mp4',
        options: { fastStart: 'reserve' },
      }),
      'AIBRUSH_POSITIONED_RESERVE_UNSUPPORTED',
    ],
    [
      'positioned writes',
      request('mux', 'mp4', [VIDEO], {
        outputContainer: 'mp4',
        options: { target: 'stream', positionedWrites: true },
      }),
      'AIBRUSH_POSITIONED_WRITES_UNSUPPORTED',
    ],
    [
      'Matroska VFR full timeline',
      request('mux', 'mp4', [VIDEO, AUDIO], {
        scenarioId: 'mux/prop_vfr_mux_duration_mp4_to_mkv',
        outputContainer: 'mkv',
      }),
      'AIBRUSH_MATROSKA_FULL_TIMELINE_UNSUPPORTED',
    ],
    [
      'Matroska B-frame full timeline',
      request('mux', 'mp4', [VIDEO, AUDIO], {
        scenarioId: 'mux/edge_bframes_decode_mux_mkv',
        outputContainer: 'mkv',
      }),
      'AIBRUSH_MATROSKA_FULL_TIMELINE_UNSUPPORTED',
    ],
  ];

  for (const [name, tuple, reasonCode] of rows) {
    test(`rejects ${name} before execution with a stable NA_ENGINE reason`, () => {
      expect(decideAibrushSupport(tuple)).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode,
      });
    });
  }

  test('admits the legal append-only WebM and same-container PCM copy tuples', () => {
    expect(
      decideAibrushSupport(
        request(
          'remux',
          'webm',
          [
            { type: 'video', codec: 'vp9' },
            { type: 'audio', codec: 'opus' },
          ],
          {
            outputContainer: 'webm',
            options: { appendOnly: true, target: 'stream' },
          },
        ),
      ),
    ).toEqual({ supported: true });
    expect(
      decideAibrushSupport(
        request(
          'remux',
          'wav',
          [
            {
              type: 'audio',
              codec: 'pcm-s16',
              sampleRate: 48_000,
              channels: 2,
            },
          ],
          { outputContainer: 'wav' },
        ),
      ),
    ).toEqual({ supported: true });
  });

  test('returns the exact HEVC browser re-import decoder configuration', () => {
    const decision = decideAibrushSupport(
      request(
        'mux',
        'mp4',
        [
          {
            type: 'video',
            codec: 'hevc',
            nativeCodecTag: 'hvc1.1.6.L93.B0',
            width: 1_280,
            height: 720,
          },
        ],
        {
          outputContainer: 'mp4',
          options: { invariant: 'decode(mux(x)) equals decode(x)' },
        },
      ),
    );
    expect(decision).toMatchObject({
      supported: true,
      browserConfigs: [
        {
          role: 'video-decoder',
          trackIndex: 0,
          config: {
            codec: 'hvc1.1.6.L93.B0',
            codedWidth: 1_280,
            codedHeight: 720,
          },
        },
      ],
    });
  });

  test('never launders an intentionally mutated input into unsupported applicability', () => {
    const malformed = request('remux', 'jpeg', [], {
      outputContainer: 'unknown',
      mutated: true,
    });
    expect(decideAibrushSupport(malformed)).toEqual({ supported: true });
  });

  test('declares demux scale rows NA when no first-packet boundary is observable', () => {
    expect(
      decideAibrushSupport(
        request('demux', 'mp4', [VIDEO, AUDIO], {
          options: { invariant: 'demux-scale-budgets' },
        }),
      ),
    ).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'AIBRUSH_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE',
    });
  });

  test('declares source layouts with unrepresentable demux tracks NA', () => {
    expect(
      decideAibrushSupport(
        request('demux', 'mkv', [
          VIDEO,
          AUDIO,
          {
            type: 'other',
            codec: 'attachment',
          },
        ]),
      ),
    ).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'AIBRUSH_DEMUX_TRACK_REPRESENTATION_UNSUPPORTED',
    });
  });

  test('declares a probe with an auxiliary non-canonical video codec NA', () => {
    expect(
      decideAibrushSupport(
        request('probe', 'mkv', [
          VIDEO,
          AUDIO,
          { type: 'other', codec: 'unknown' },
          { type: 'video', codec: 'mjpeg', width: 480, height: 360 },
        ]),
      ),
    ).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'AIBRUSH_PROBE_TRACK_REPRESENTATION_UNSUPPORTED',
    });
  });

  test('rejects invalid transcode dimensions before browser config probing', () => {
    expect(
      decideAibrushSupport(
        request('transcode', 'mp4', [], {
          outputContainer: 'mp4',
          videoCodec: 'h264',
          outputWidth: 0,
          outputHeight: 0,
          transforms: { resize: { width: 0, height: 0 } },
        }),
      ),
    ).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'AIBRUSH_INVALID_DIMENSIONS',
    });
  });

  test('probes a dimension-valid H.264 level for 1080p output', () => {
    expect(
      decideAibrushSupport(
        request('transcode', 'mp4', [VIDEO, AUDIO], {
          outputContainer: 'mp4',
          videoCodec: 'h264',
          outputWidth: 1_920,
          outputHeight: 1_080,
        }),
      ),
    ).toMatchObject({
      supported: true,
      browserConfigs: expect.arrayContaining([
        {
          role: 'video-encoder',
          config: expect.objectContaining({
            codec: 'avc1.42E028',
            width: 1_920,
            height: 1_080,
            framerate: 30,
          }),
        },
      ]),
    });
  });

  test('declares measured audio-content writer and decoder boundaries without hiding working codecs', () => {
    const audioRows: Array<[string, string, string, string]> = [
      ['wav', 'mp4', 'aac', 'AIBRUSH_AAC_PRESENTATION_TIMING_UNSUPPORTED'],
      ['wav', 'ogg', 'opus', 'AIBRUSH_OGG_OPUS_OUTPUT_UNSUPPORTED'],
      ['flac', 'webm', 'opus', 'AIBRUSH_WEBM_OPUS_PRESENTATION_UNSUPPORTED'],
    ];
    for (const [inputContainer, outputContainer, audioCodec, reasonCode] of audioRows) {
      expect(
        decideAibrushSupport(
          request(
            'transcode',
            inputContainer,
            [
              {
                type: 'audio',
                codec: inputContainer === 'wav' ? 'pcm-s16' : inputContainer,
                sampleRate: 48_000,
                channels: 1,
              },
            ],
            {
              outputContainer,
              audioCodec,
              options: { invariant: 'transcode-audio-content' },
            },
          ),
        ),
      ).toMatchObject({ supported: false, status: 'NA_ENGINE', reasonCode });
    }

    expect(
      decideAibrushSupport(
        request(
          'transcode',
          'aac',
          [
            {
              type: 'audio',
              codec: 'aac',
              sampleRate: 48_000,
              channels: 2,
            },
          ],
          {
            scenarioId: 'transcode/aac_to_pcm_wav_extract',
            outputContainer: 'wav',
            audioCodec: 'pcm-s16',
            options: { invariant: 'transcode-audio-content' },
          },
        ),
      ),
    ).toMatchObject({
      supported: false,
      reasonCode: 'AIBRUSH_AAC_PCM_EQUIVALENCE_UNSUPPORTED',
    });

    expect(
      decideAibrushSupport(
        request(
          'transcode',
          'wav',
          [
            {
              type: 'audio',
              codec: 'pcm-s16',
              sampleRate: 48_000,
              channels: 1,
            },
          ],
          {
            outputContainer: 'ogg',
            audioCodec: 'vorbis',
            options: { invariant: 'transcode-audio-content' },
          },
        ),
      ),
    ).toEqual({ supported: true });
    expect(
      decideAibrushSupport(
        request(
          'transcode',
          'wav',
          [
            {
              type: 'audio',
              codec: 'pcm-s16',
              sampleRate: 48_000,
              channels: 1,
            },
          ],
          {
            outputContainer: 'flac',
            audioCodec: 'flac',
            options: { invariant: 'transcode-audio-content' },
          },
        ),
      ),
    ).toEqual({ supported: true });
  });

  test('declares only lossy audio copy trims without exact presentation timing NA', () => {
    for (const [container, codec] of [
      ['mp4', 'aac'],
      ['mp3', 'mp3'],
      ['ogg', 'opus'],
    ] as const) {
      expect(
        decideAibrushSupport(
          request(
            'trim',
            container,
            [
              {
                type: 'audio',
                codec,
                sampleRate: 48_000,
                channels: 2,
              },
            ],
            {
              outputContainer: container,
              options: { invariant: 'trim-audio-content' },
            },
          ),
        ),
      ).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode: 'AIBRUSH_AUDIO_PRESENTATION_TIMING_UNSUPPORTED',
      });
    }

    expect(
      decideAibrushSupport(
        request(
          'trim',
          'flac',
          [
            {
              type: 'audio',
              codec: 'flac',
              sampleRate: 48_000,
              channels: 2,
            },
          ],
          {
            outputContainer: 'flac',
            options: { invariant: 'trim-audio-content' },
          },
        ),
      ),
    ).toEqual({ supported: true });
  });

  test('declares only the measured robustness trim composition contracts unsupported', () => {
    for (const scenarioId of ['robustness/prop_trim_additivity_compose', 'robustness/prop_trim_concatenation']) {
      expect(
        decideAibrushSupport(
          request('trim', 'mp4', [VIDEO, AUDIO], {
            scenarioId,
            outputContainer: 'mp4',
            options: { invariant: 'trim(a..b)++trim(b..c)==trim(a..c)' },
          }),
        ),
      ).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode: 'AIBRUSH_TRIM_COMPOSITION_BOUNDARY_UNSUPPORTED',
      });
    }

    expect(
      decideAibrushSupport(
        request('trim', 'mp4', [VIDEO, AUDIO], {
          scenarioId: 'robustness/edge_trim_zero_length',
          outputContainer: 'mp4',
          options: { invariant: 'trim(a..b)++trim(b..c)==trim(a..c)' },
        }),
      ),
    ).toMatchObject({ supported: true });
  });

  test('declares only the measured stereo-to-5.1 authored matrix unsupported', () => {
    const upmix = request(
      'transcode',
      'wav',
      [
        {
          type: 'audio',
          codec: 'pcm-s16',
          sampleRate: 48_000,
          channels: 2,
        },
      ],
      {
        scenarioId: 'audio-dsp/upmix_stereo_to_5_1',
        outputContainer: 'wav',
        audioCodec: 'pcm-s16',
        options: {
          invariant: 'audio-dsp-transform',
          audio: {
            codec: 'pcm-s16',
            channels: 6,
            mixMatrix: [
              [1, 0],
              [0, 1],
              [Math.SQRT1_2, Math.SQRT1_2],
              [0, 0],
              [Math.SQRT1_2, 0],
              [0, Math.SQRT1_2],
            ],
          },
        },
      },
    );
    upmix.output!.channels = 6;
    expect(decideAibrushSupport(upmix)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'AIBRUSH_AUDIO_MIX_MATRIX_UNSUPPORTED',
    });

    upmix.scenarioId = 'audio-dsp/upmix_mono_to_stereo';
    upmix.output!.channels = 2;
    expect(decideAibrushSupport(upmix)).toEqual({ supported: true });

    upmix.scenarioId = 'audio-dsp/upmix_stereo_to_5_1';
    upmix.output!.channels = 6;
    upmix.inputs[0]!.mutated = true;
    expect(decideAibrushSupport(upmix)).toEqual({ supported: true });
  });

  test('negative headers and a canonical zero-frame WAV reject through typed structural paths', async () => {
    for (const [scenarioId, filename, container, mime] of [
      ['audio-dsp/fuzz_aiff_header_truncated_probe', 'aiff_header_truncated.aiff', 'aiff', 'application/octet-stream'],
      ['audio-dsp/fuzz_wav_header_truncated_probe', 'wav_header_truncated.wav', 'wav', 'audio/wav'],
    ] as const) {
      const input = await fixtureInput(filename, mime);
      const operationRequest = request('probe', container, [], {
        scenarioId,
        inputId: filename,
        options: {
          robustness: {
            schema: 'media-test/robustness-contract@1',
            inputClass: 'negative',
            returnedOutputCheck: 'probe-structure',
            survivorOracles: ['graceful-failure'],
            timeoutMs: 15_000,
          },
        },
      });
      operationRequest.inputs[0]!.sourceEvidence = 'UNRESOLVED';
      operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
      const operationContext = directContext(operationRequest);
      const engine = new AibrushMediaEngine();
      await engine.init(operationContext);
      try {
        let thrown: unknown;
        try {
          await engine.probe(input, operationContext);
        } catch (error) {
          thrown = error;
        }
        expect(isMalformedInputError(thrown)).toBe(true);
        expect(thrown).toMatchObject({
          reasonCode: 'AIBRUSH_REQUEST_REJECTED',
          operation: 'probe',
          stage: 'validate',
        });
        if (container === 'wav') {
          expect(engine.configUsed).toMatchObject({
            route: 'wav.probe-header',
            operation: 'probe',
          });
        }
      } finally {
        await engine.dispose(operationContext);
      }
    }

    const emptyInput = await fixtureInput('empty_audio.wav', 'audio/wav');
    const emptyRequest = request('transcode', 'wav', [], {
      scenarioId: 'audio-dsp/canonical_empty_wav_identity',
      inputId: 'empty_audio.wav',
      outputContainer: 'wav',
      audioCodec: 'pcm-s16',
      options: {
        container: 'wav',
        audio: { codec: 'pcm-s16', sampleRate: 44_100 },
        gracefulAllowOutput: true,
      },
    });
    const emptyContext = directContext(emptyRequest);
    const emptyEngine = new AibrushMediaEngine();
    await emptyEngine.init(emptyContext);
    try {
      let thrown: unknown;
      try {
        await emptyEngine.transcode(
          emptyInput,
          { container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 44_100 } },
          emptyContext,
        );
      } catch (error) {
        thrown = error;
      }
      expect(isMalformedInputError(thrown)).toBe(true);
      expect(thrown).toMatchObject({
        reasonCode: 'AIBRUSH_REQUEST_REJECTED',
        operation: 'transcode',
        stage: 'validate',
        reason: 'zero-frame WAV has no PCM samples to transform',
      });
      expect(emptyEngine.configUsed).toMatchObject({
        route: 'wav.rewrite-empty-pcm',
        operation: 'transcode',
      });
    } finally {
      await emptyEngine.dispose(emptyContext);
    }

    const ordinary = await fixtureInput('wav_s16.wav', 'audio/wav');
    const malformedBytes = new Uint8Array(await ordinary.arrayBuffer());
    malformedBytes.fill(0, 16, Math.min(36, malformedBytes.byteLength));
    const malformedInput: MediaInput = {
      ...ordinary,
      id: 'input.wav',
      sizeBytes: malformedBytes.byteLength,
      blob: () => Promise.resolve(new Blob([malformedBytes.slice().buffer], { type: 'audio/wav' })),
      arrayBuffer: () => Promise.resolve(malformedBytes.slice().buffer),
    };
    const malformedRequest = request(
      'transcode',
      'wav',
      [
        {
          type: 'audio',
          codec: 'pcm-s16',
          sampleRate: 48_000,
          channels: 2,
        },
      ],
      {
        scenarioId: 'audio-dsp/general_pcm_structural_rejection',
        inputId: 'input.wav',
        outputContainer: 'wav',
        audioCodec: 'pcm-s16',
        options: {
          container: 'wav',
          audio: { codec: 'pcm-s16', channels: 1 },
          robustness: {
            schema: 'media-test/robustness-contract@1',
            inputClass: 'negative',
            returnedOutputCheck: 'media-structure',
            survivorOracles: ['graceful-failure'],
            timeoutMs: 15_000,
          },
        },
      },
    );
    malformedRequest.inputs[0]!.sizeBytes = malformedInput.sizeBytes;
    const malformedContext = directContext(malformedRequest);
    const malformedEngine = new AibrushMediaEngine();
    await malformedEngine.init(malformedContext);
    try {
      let thrown: unknown;
      try {
        await malformedEngine.transcode(
          malformedInput,
          { container: 'wav', audio: { codec: 'pcm-s16', channels: 1 } },
          malformedContext,
        );
      } catch (error) {
        thrown = error;
      }
      expect(isMalformedInputError(thrown)).toBe(true);
      expect(thrown).toMatchObject({
        reasonCode: 'AIBRUSH_REQUEST_REJECTED',
        operation: 'transcode',
        stage: 'validate',
        reason: 'WAVE file has no fmt chunk',
      });
      expect(malformedEngine.configUsed).toMatchObject({
        route: 'wav.reject-invalid-pcm',
        operation: 'transcode',
      });
    } finally {
      await malformedEngine.dispose(malformedContext);
    }
  });

  test('ordinary and metadata-heavy WAV probes use adaptive bounded header ranges', async () => {
    const ordinary = new Uint8Array(await Bun.file('fixtures/media/wav_s24.wav').arrayBuffer());
    const metadataHeavy = insertWavJunkBeforeData(ordinary, 5_000);

    for (const [label, bytes, expectedRanges] of [
      ['ordinary', ordinary, ['bytes=0-4095']],
      ['metadata-heavy', metadataHeavy, ['bytes=0-4095', 'bytes=0-65535']],
    ] as const) {
      const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
      const observedRanges: string[] = [];
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: async (_resource: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const range = new Headers(init?.headers).get('Range');
          if (range === null) throw new Error(`${label}: expected a bounded Range request`);
          observedRanges.push(range);
          const match = /^bytes=0-(\d+)$/.exec(range);
          if (match === null) throw new Error(`${label}: unexpected Range '${range}'`);
          const requestedEnd = Number(match[1]);
          const end = Math.min(bytes.byteLength - 1, requestedEnd);
          const body = bytes.slice(0, end + 1);
          return new Response(body, {
            status: 206,
            headers: {
              'Content-Length': String(body.byteLength),
              'Content-Range': `bytes 0-${end}/${bytes.byteLength}`,
            },
          });
        },
      });

      const input: MediaInput = {
        id: `${label}.wav`,
        url: `http://127.0.0.1:5151/${label}.wav`,
        mime: 'audio/wav',
        mutated: false,
        sizeBytes: bytes.byteLength,
        blob: () => Promise.resolve(new Blob([bytes.slice().buffer], { type: 'audio/wav' })),
        arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
      };
      const operationRequest = request(
        'probe',
        'wav',
        [{ type: 'audio', codec: 'pcm-s24', sampleRate: 48_000, channels: 2 }],
        {
          scenarioId: 'audio-dsp/general_bounded_wav_header_probe',
          inputId: input.id,
        },
      );
      operationRequest.inputs[0]!.sizeBytes = bytes.byteLength;
      const operationContext = directContext(operationRequest);
      const engine = new AibrushMediaEngine();
      try {
        await engine.init(operationContext);
        const metadata = await engine.probe(input, operationContext);
        expect(metadata, label).toMatchObject({
          container: 'wav',
          tracks: [{ type: 'audio', codec: 'pcm-s24', sampleRate: 48_000, channels: 2 }],
          probeEvidence: { readMode: 'range' },
        });
        expect(engine.configUsed, label).toMatchObject({
          route: 'wav.probe-header',
          operation: 'probe',
        });
        expect(observedRanges, label).toEqual(expectedRanges);
      } finally {
        await engine.dispose(operationContext);
        restoreGlobal('fetch', fetchDescriptor);
      }
    }
  });

  test('bounded audio-only WAV decode uses one capped PCM-prefix read', async () => {
    const bytes = new Uint8Array(await Bun.file('fixtures/media/wav_s24.wav').arrayBuffer());
    const maxFrames = 4_096;
    const channels = 2;
    const decodeReadBytes = 64 * 1_024;
    const expectedRanges = [`bytes=0-${decodeReadBytes - 1}`];
    const observedRanges: string[] = [];
    let arrayBufferReads = 0;
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: async (_resource: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const range = new Headers(init?.headers).get('Range');
        if (range === null) throw new Error('expected a bounded Range request');
        observedRanges.push(range);
        const match = /^bytes=0-(\d+)$/.exec(range);
        if (match === null) throw new Error(`unexpected Range '${range}'`);
        const requestedEnd = Number(match[1]);
        const end = Math.min(bytes.byteLength - 1, requestedEnd);
        const body = bytes.slice(0, end + 1);
        return new Response(body, {
          status: 206,
          headers: {
            'Content-Length': String(body.byteLength),
            'Content-Range': `bytes 0-${end}/${bytes.byteLength}`,
          },
        });
      },
    });
    const input: MediaInput = {
      id: 'ordinary_pcm.wav',
      url: 'http://127.0.0.1:5151/ordinary_pcm.wav',
      mime: 'audio/wav',
      mutated: false,
      sizeBytes: bytes.byteLength,
      blob: () => Promise.resolve(new Blob([bytes.slice().buffer], { type: 'audio/wav' })),
      arrayBuffer: () => {
        arrayBufferReads++;
        return Promise.resolve(bytes.slice().buffer);
      },
    };
    const operationRequest = request(
      'decodeFrames',
      'wav',
      [
        {
          type: 'audio',
          codec: 'pcm-s24',
          sampleRate: 48_000,
          channels,
        },
      ],
      {
        scenarioId: 'audio-dsp/canonical_pcm_prefix_decode',
        inputId: 'ordinary_pcm.wav',
        options: { maxFrames },
      },
    );
    operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
    const operationContext = directContext(operationRequest);
    const engine = new AibrushMediaEngine();
    try {
      await engine.init(operationContext);
      const sink = await engine.decodeFrames(input, { maxFrames }, operationContext);
      expect(sink.frames).toHaveLength(maxFrames);
      expect(sink.frames[0]?.index).toBe(0);
      expect(sink.frames.at(-1)?.index).toBe(maxFrames - 1);
      expect(sink.frames.every((frame) => frame.width === 2 && frame.height === 1)).toBe(true);
      expect(sink.frames.every((frame) => /^[0-9a-f]{64}$/.test(frame.sha256))).toBe(true);
      expect(observedRanges).toEqual(expectedRanges);
      expect(arrayBufferReads).toBe(0);
      expect(engine.configUsed).toMatchObject({
        route: 'wav.decode-pcm-prefix',
        operation: 'decodeFrames',
      });
    } finally {
      await engine.dispose(operationContext);
      restoreGlobal('fetch', fetchDescriptor);
    }
  });

  test('dense ISO-BMFF decode uses the product packet plan and owned RGBA views', async () => {
    const videoDecoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoDecoder');
    const encodedChunkDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'EncodedVideoChunk');
    const imageDataDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ImageData');
    const configured: VideoDecoderConfig[] = [];
    let copiedIntoClampedArray = false;

    class FakeFrame {
      readonly codedWidth = 320;
      readonly codedHeight = 240;
      readonly displayWidth = 320;
      readonly displayHeight = 240;
      readonly visibleRect = { x: 0, y: 0, width: 320, height: 240 };

      constructor(readonly timestamp: number) {}

      async copyTo(destination: AllowSharedBufferSource): Promise<PlaneLayout[]> {
        copiedIntoClampedArray ||= destination instanceof Uint8ClampedArray;
        const bytes = ArrayBuffer.isView(destination)
          ? new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength)
          : new Uint8Array(destination);
        bytes.fill(this.timestamp & 0xff);
        return [{ offset: 0, stride: this.codedWidth * 4 }];
      }

      close(): void {}
    }

    class FakeChunk {
      readonly type: EncodedVideoChunkType;
      readonly timestamp: number;
      readonly duration: number | null;

      constructor(init: EncodedVideoChunkInit) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.duration = init.duration ?? null;
      }
    }

    class FakeDecoder {
      state: CodecState = 'unconfigured';
      readonly #queued: FakeChunk[] = [];

      constructor(private readonly callbacks: VideoDecoderInit) {}

      configure(config: VideoDecoderConfig): void {
        configured.push(config);
        this.state = 'configured';
      }

      decode(chunk: EncodedVideoChunk): void {
        this.#queued.push(chunk as unknown as FakeChunk);
      }

      async flush(): Promise<void> {
        for (const chunk of this.#queued.splice(0)) {
          this.callbacks.output(new FakeFrame(chunk.timestamp) as unknown as VideoFrame);
        }
      }

      close(): void {
        this.state = 'closed';
      }
    }

    class FakeImageData {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    }

    Object.defineProperty(globalThis, 'VideoDecoder', {
      configurable: true,
      writable: true,
      value: FakeDecoder,
    });
    Object.defineProperty(globalThis, 'EncodedVideoChunk', {
      configurable: true,
      writable: true,
      value: FakeChunk,
    });
    Object.defineProperty(globalThis, 'ImageData', {
      configurable: true,
      writable: true,
      value: FakeImageData,
    });

    const input = await fixtureInput('video_240fps.mp4', 'video/mp4');
    const operationRequest = request(
      'decodeFrames',
      'mp4',
      [
        {
          type: 'video',
          codec: 'h264',
          width: 320,
          height: 240,
          fps: 240,
        },
      ],
      {
        scenarioId: 'decode-seek/general_dense_h264_prefix',
        inputId: 'ordinary-high-rate.mp4',
        options: { maxFrames: 240 },
      },
    );
    operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
    const operationContext = directContext(operationRequest);
    const engine = new AibrushMediaEngine();
    try {
      await engine.init(operationContext);
      const sink = await engine.decodeFrames(input, { maxFrames: 240 }, operationContext);
      expect(sink.frames).toHaveLength(240);
      expect(sink.frames.map((frame) => frame.index)).toEqual(
        Array.from({ length: 240 }, (_, index) => index),
      );
      expect(sink.frames.every((frame) => /^[0-9a-f]{64}$/.test(frame.sha256))).toBe(true);
      const expectedFirstFrame = new Uint8Array(320 * 240 * 4);
      expectedFirstFrame.fill(sink.frames[0]!.ptsUs & 0xff);
      expect(sink.frames[0]!.sha256).toBe(await sha256Hex(expectedFirstFrame));
      expect(copiedIntoClampedArray).toBe(true);
      expect(configured[0]).toMatchObject({
        codec: 'avc1.64001F',
        codedWidth: 320,
        codedHeight: 240,
        hardwareAcceleration: 'no-preference',
      });
      expect(engine.configUsed).toMatchObject({
        route: 'core.iso-bmff-packet-info+webcodecs',
        operation: 'decodeFrames',
        codecConfigs: [
          {
            role: 'video-decoder',
            codec: 'avc1.64001F',
            codedWidth: 320,
            codedHeight: 240,
            hardwareAcceleration: 'no-preference',
            descriptionByteLength: 44,
          },
        ],
      });
    } finally {
      await engine.dispose(operationContext);
      restoreGlobal('VideoDecoder', videoDecoderDescriptor);
      restoreGlobal('EncodedVideoChunk', encodedChunkDescriptor);
      restoreGlobal('ImageData', imageDataDescriptor);
    }
  });

  test('same-layout WAV transcode consumes one owned snapshot without a second output copy', async () => {
    const input = await fixtureInput('wav_s16.wav', 'audio/wav');
    const expected = new Uint8Array(await input.arrayBuffer());
    const operationRequest = request(
      'transcode',
      'wav',
      [
        {
          type: 'audio',
          codec: 'pcm-s16',
          sampleRate: 48_000,
          channels: 2,
        },
      ],
      {
        scenarioId: 'audio-dsp/general_identity_pcm_transform',
        inputId: 'ordinary.wav',
        outputContainer: 'wav',
        audioCodec: 'pcm-s16',
        options: {
          container: 'wav',
          audio: { codec: 'pcm-s16', sampleRate: 48_000, channels: 2 },
          invariant: 'audio-dsp-transform',
        },
      },
    );
    operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
    const operationContext = directContext(operationRequest);
    const engine = new AibrushMediaEngine();
    await engine.init(operationContext);
    try {
      const output = await engine.transcode(
        input,
        {
          container: 'wav',
          audio: { codec: 'pcm-s16', sampleRate: 48_000, channels: 2 },
        },
        operationContext,
      );
      expect(output.bytes).toEqual(expected);
      expect(engine.configUsed).toMatchObject({
        route: 'wav.rewrite-owned-pcm-copy',
        operation: 'transcode',
      });
    } finally {
      await engine.dispose(operationContext);
    }
  });

  test('PCM endianness roundtrip exposes a real big-endian AIFF leg and derives the final WAV from it', async () => {
    const input = await fixtureInput('wav_s16.wav', 'audio/wav');
    const expected = new Uint8Array(await input.arrayBuffer());
    const operationRequest = request(
      'transcode',
      'wav',
      [
        {
          type: 'audio',
          codec: 'pcm-s16',
          sampleRate: 48_000,
          channels: 2,
        },
      ],
      {
        scenarioId: 'audio-dsp/general_pcm_endianness_roundtrip',
        inputId: 'ordinary.wav',
        outputContainer: 'wav',
        audioCodec: 'pcm-s16',
        options: {
          container: 'wav',
          audio: { codec: 'pcm-s16', roundtrip: 'pcm-s16be' },
          invariant: 'audio-dsp-endianness-roundtrip',
        },
      },
    );
    operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
    const operationContext = directContext(operationRequest);
    const engine = new AibrushMediaEngine();
    await engine.init(operationContext);
    try {
      const output = await engine.transcode(
        input,
        {
          container: 'wav',
          audio: {
            codec: 'pcm-s16',
            roundtrip: 'pcm-s16be',
          } as TranscodeAudioOptions & { roundtrip: string },
        },
        operationContext,
      );
      const intermediate = output.intermediates?.find((item) => item.role === 'audio-dsp-roundtrip-leg-1');
      expect(intermediate).toBeDefined();
      expect(intermediate?.container).toBe('aiff');
      expect(new TextDecoder().decode(intermediate?.bytes.subarray(0, 4))).toBe('FORM');
      expect(new TextDecoder().decode(intermediate?.bytes.subarray(8, 12))).toBe('AIFF');
      expect(output.bytes).toEqual(expected);
      expect(engine.configUsed).toMatchObject({
        route: 'core.wav-aiff-wav-pcm-roundtrip',
        operation: 'transcode',
      });
    } finally {
      await engine.dispose(operationContext);
    }
  });

  test('explicit WAV PCM quantization uses the direct format converter and honors floor truncation', async () => {
    const input = await fixtureInput('wav_s24.wav', 'audio/wav');
    const sourceBytes = new Uint8Array(await input.arrayBuffer());
    const operationRequest = request(
      'transcode',
      'wav',
      [
        {
          type: 'audio',
          codec: 'pcm-s24',
          sampleRate: 48_000,
          channels: 2,
        },
      ],
      {
        scenarioId: 'audio-dsp/general_pcm_floor_reduction',
        inputId: 'ordinary-s24.wav',
        outputContainer: 'wav',
        audioCodec: 'pcm-s16',
        options: {
          container: 'wav',
          audio: {
            codec: 'pcm-s16',
            quantization: {
              dither: 'none',
              rounding: 'truncate-toward-negative-infinity',
              clipping: 'saturate',
            },
          },
          invariant: 'audio-dsp-transform',
        },
      },
    );
    operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
    const operationContext = directContext(operationRequest);
    const engine = new AibrushMediaEngine();
    await engine.init(operationContext);
    try {
      const output = await engine.transcode(
        input,
        {
          container: 'wav',
          audio: {
            codec: 'pcm-s16',
            quantization: {
              dither: 'none',
              rounding: 'truncate-toward-negative-infinity',
              clipping: 'saturate',
            },
          } as TranscodeAudioOptions & {
            quantization: {
              dither: 'none';
              rounding: 'truncate-toward-negative-infinity';
              clipping: 'saturate';
            };
          },
        },
        operationContext,
      );
      const source = decodeNativePcm(sourceBytes, { maxFrames: 2_048 });
      const converted = decodeNativePcm(output.bytes, { maxFrames: 2_048 });
      expect(source.state).toBe('OK');
      expect(converted.state).toBe('OK');
      if (source.state !== 'OK' || converted.state !== 'OK') return;
      expect(converted.value).toMatchObject({
        codec: 'pcm-s16',
        sampleRate: source.value.sampleRate,
        channels: source.value.channels,
        decodedSampleFrames: source.value.decodedSampleFrames,
      });
      for (let index = 0; index < source.value.samples.length; index++) {
        const sourceCode = Math.round((source.value.samples[index] as number) * 8_388_608);
        expect(converted.value.samples[index]).toBe(Math.floor(sourceCode / 256) / 32_768);
      }
      expect(engine.configUsed).toMatchObject({
        route: 'core.wav-pcm-format-convert',
        operation: 'transcode',
      });
    } finally {
      await engine.dispose(operationContext);
    }
  });

  test('keeps measured alpha and roundtrip quality bounds narrow to their concrete contracts', () => {
    for (const [scenarioId, codec, reasonCode] of [
      ['transcode/vp9_alpha_to_vp8_keepalpha', 'vp8', 'AIBRUSH_VP8_ALPHA_FIDELITY_BOUND'],
      ['transcode/vp9_alpha_to_vp9_keepalpha', 'vp9', 'AIBRUSH_VP9_ALPHA_PIXEL_QUALITY_BOUND'],
    ] as const) {
      expect(
        decideAibrushSupport(
          request('transcode', 'webm', [{ type: 'video', codec: 'vp9' }], {
            scenarioId,
            outputContainer: 'webm',
            videoCodec: codec,
            options: { alpha: 'keep', invariant: 'transcode-effect-aware' },
          }),
        ),
      ).toMatchObject({ supported: false, status: 'NA_ENGINE', reasonCode });
      expect(
        decideAibrushSupport(
          request('transcode', 'webm', [{ type: 'video', codec: 'vp9' }], {
            outputContainer: 'webm',
            videoCodec: codec,
            options: { alpha: 'keep', invariant: 'transcode-effect-aware' },
          }),
        ),
      ).toEqual({ supported: true });
    }

    const exactRoundtrip = request('transcode', 'mp4', [VIDEO, AUDIO], {
      scenarioId: 'transcode/roundtrip_leg1_h264_to_vp9',
      inputId: 'scenarios/transcode/roundtrip_leg1_h264_to_vp9/03.mp4',
      outputContainer: 'webm',
      videoCodec: 'vp9',
      audioCodec: 'opus',
    });
    expect(decideAibrushSupport(exactRoundtrip)).toMatchObject({
      supported: false,
      reasonCode: 'AIBRUSH_H264_VP9_ROUNDTRIP_QUALITY_BOUND',
    });
    exactRoundtrip.inputs[0]!.id = 'scenarios/transcode/roundtrip_leg1_h264_to_vp9/02.mp4';
    expect(decideAibrushSupport(exactRoundtrip)).toMatchObject({
      supported: true,
    });
  });

  test('declares exhaustive-only quality, timing, and Ogg misses on their exact variants', () => {
    const rows: Array<{
      scenarioId: string;
      inputId: string;
      inputContainer: string;
      tracks: NormalizedTrack[];
      outputContainer: string;
      videoCodec?: string;
      audioCodec?: string;
      options?: Record<string, unknown>;
      reasonCode: string;
    }> = [
      {
        scenarioId: 'transcode/bframe_reorder_h264_to_vp9',
        inputId: 'scenarios/transcode/bframe_reorder_h264_to_vp9/03.mp4',
        inputContainer: 'mp4',
        tracks: [VIDEO, AUDIO],
        outputContainer: 'webm',
        videoCodec: 'vp9',
        audioCodec: 'opus',
        reasonCode: 'AIBRUSH_BFRAME_VP9_PORTRAIT_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/h264_to_vp9_webm',
        inputId: 'scenarios/transcode/h264_to_vp9_webm/02.mp4',
        inputContainer: 'mp4',
        tracks: [VIDEO, AUDIO],
        outputContainer: 'webm',
        videoCodec: 'vp9',
        audioCodec: 'opus',
        reasonCode: 'AIBRUSH_H264_VP9_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/h264_to_vp9_webm',
        inputId: 'scenarios/transcode/h264_to_vp9_webm/03.mp4',
        inputContainer: 'mp4',
        tracks: [VIDEO, AUDIO],
        outputContainer: 'webm',
        videoCodec: 'vp9',
        audioCodec: 'opus',
        reasonCode: 'AIBRUSH_H264_VP9_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/vp9_to_av1_webm',
        inputId: 'scenarios/transcode/vp9_to_av1_webm/02.webm',
        inputContainer: 'webm',
        tracks: [
          { type: 'video', codec: 'vp9' },
          { type: 'audio', codec: 'opus' },
        ],
        outputContainer: 'webm',
        videoCodec: 'av1',
        reasonCode: 'AIBRUSH_VP9_AV1_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/h264_to_av1_mp4',
        inputId: 'scenarios/transcode/h264_to_av1_mp4/03.mp4',
        inputContainer: 'mp4',
        tracks: [VIDEO, AUDIO],
        outputContainer: 'mp4',
        videoCodec: 'av1',
        reasonCode: 'AIBRUSH_H264_AV1_PORTRAIT_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/video_only_h264_resize_360p_to_vp9_webm',
        inputId: 'scenarios/transcode/video_only_h264_resize_360p_to_vp9_webm/01.mp4',
        inputContainer: 'mp4',
        tracks: [VIDEO],
        outputContainer: 'webm',
        videoCodec: 'vp9',
        reasonCode: 'AIBRUSH_VP9_RESIZE_PRESENTATION_WINDOW_UNSUPPORTED',
      },
      {
        scenarioId: 'transcode/video_only_h264_resize_360p_to_vp9_webm',
        inputId: 'scenarios/transcode/video_only_h264_resize_360p_to_vp9_webm/02.mp4',
        inputContainer: 'mp4',
        tracks: [VIDEO],
        outputContainer: 'webm',
        videoCodec: 'vp9',
        reasonCode: 'AIBRUSH_VP9_RESIZE_PRESENTATION_WINDOW_UNSUPPORTED',
      },
      {
        scenarioId: 'transcode/video_only_h264_resize_360p_to_vp9_webm',
        inputId: 'scenarios/transcode/video_only_h264_resize_360p_to_vp9_webm/03.mp4',
        inputContainer: 'mp4',
        tracks: [VIDEO],
        outputContainer: 'webm',
        videoCodec: 'vp9',
        reasonCode: 'AIBRUSH_VP9_RESIZE_PRESENTATION_WINDOW_UNSUPPORTED',
      },
      {
        scenarioId: 'transcode/vp9_to_vp8_webm',
        inputId: 'scenarios/transcode/vp9_to_vp8_webm/01.webm',
        inputContainer: 'webm',
        tracks: [
          { type: 'video', codec: 'vp9' },
          { type: 'audio', codec: 'opus' },
        ],
        outputContainer: 'webm',
        videoCodec: 'vp8',
        audioCodec: 'vorbis',
        reasonCode: 'AIBRUSH_VP9_VP8_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/vp9_to_vp8_webm',
        inputId: 'scenarios/transcode/vp9_to_vp8_webm/02.webm',
        inputContainer: 'webm',
        tracks: [
          { type: 'video', codec: 'vp9' },
          { type: 'audio', codec: 'opus' },
        ],
        outputContainer: 'webm',
        videoCodec: 'vp8',
        audioCodec: 'vorbis',
        reasonCode: 'AIBRUSH_VP9_VP8_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/wav_to_vorbis_ogg',
        inputId: 'scenarios/transcode/wav_to_vorbis_ogg/03.wav',
        inputContainer: 'wav',
        tracks: [{ type: 'audio', codec: 'pcm-s16', sampleRate: 44_100, channels: 2 }],
        outputContainer: 'ogg',
        audioCodec: 'vorbis',
        options: { invariant: 'transcode-audio-content' },
        reasonCode: 'AIBRUSH_VORBIS_OGG_CONTINUATION_UNSUPPORTED',
      },
    ];

    for (const row of rows) {
      const concrete = request('transcode', row.inputContainer, row.tracks, {
        scenarioId: row.scenarioId,
        inputId: row.inputId,
        outputContainer: row.outputContainer,
        ...(row.videoCodec !== undefined ? { videoCodec: row.videoCodec } : {}),
        ...(row.audioCodec !== undefined ? { audioCodec: row.audioCodec } : {}),
        options: row.options,
      });
      expect(decideAibrushSupport(concrete), row.scenarioId).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode: row.reasonCode,
      });
      concrete.inputs[0]!.id = row.inputId.replace(/\/(?:01|02|03)\.(mp4|webm|wav)$/, '/04.$1');
      expect(decideAibrushSupport(concrete), `${row.scenarioId} neighbor`).toMatchObject({ supported: true });
    }
  });
});

describe('REQ-ENG-32: exact framework error taxonomy', () => {
  const classes = { CapabilityError, InputError };

  test('uses the exact CapabilityError class/code and ignores diagnostic prose', () => {
    const error = new CapabilityError('completely rewritten diagnostic');
    expect(classifyAibrushFrameworkError(error, classes)).toMatchObject({
      kind: 'capability',
      code: 'capability-miss',
      reason: 'completely rewritten diagnostic',
    });
    const thrown = captureThrown(() =>
      translateAibrushFrameworkError(
        'remux',
        error,
        classes,
        request('remux', 'mp4', [VIDEO], { outputContainer: 'webm' }),
        undefined,
        () => false,
        (_op, reason) => new Error(reason),
      ),
    );
    expect(isNotApplicableError(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      reasonCode: 'AIBRUSH_FRAMEWORK_CAPABILITY_MISS',
      operation: 'remux',
    });
  });

  test('does not trust a foreign error merely because its name/code/message resemble a capability miss', () => {
    const foreign = Object.assign(new Error('capability miss'), {
      name: 'CapabilityError',
      code: 'capability-miss',
    });
    expect(classifyAibrushFrameworkError(foreign, classes).kind).toBe('fault');
    expect(
      captureThrown(() =>
        translateAibrushFrameworkError(
          'mux',
          foreign,
          classes,
          undefined,
          undefined,
          () => false,
          (_op, reason) => new Error(reason),
        ),
      ),
    ).toBe(foreign);
  });

  test('keeps malformed InputError rejection distinct from clean-input faults', () => {
    const error = new InputError('bad bytes');
    const malformed = captureThrown(() =>
      translateAibrushFrameworkError(
        'demux',
        error,
        classes,
        undefined,
        undefined,
        () => true,
        (_op, reason) => Object.assign(new Error(reason), { name: 'GracefulRejectionError' }),
      ),
    );
    expect(malformed).toMatchObject({
      name: 'GracefulRejectionError',
      message: 'bad bytes',
    });
    expect(
      captureThrown(() =>
        translateAibrushFrameworkError(
          'demux',
          error,
          classes,
          undefined,
          undefined,
          () => false,
          (_op, reason) => new Error(reason),
        ),
      ),
    ).toBe(error);
  });
});

function request(
  operation: ConcreteOperationRequest['operation'],
  inputContainer: string,
  tracks: NormalizedTrack[],
  overrides: {
    outputContainer?: string;
    videoCodec?: string;
    audioCodec?: string;
    options?: Record<string, unknown>;
    mutated?: boolean;
    scenarioId?: string;
    inputId?: string;
    outputWidth?: number;
    outputHeight?: number;
    transforms?: ConcreteOperationRequest['transforms'];
  } = {},
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: overrides.scenarioId ?? `aibrush-test/${operation}`,
    operation,
    inputs: [
      {
        id: overrides.inputId ?? `fixture.${inputContainer}`,
        mime:
          inputContainer === 'jpeg' || inputContainer === 'png'
            ? `image/${inputContainer}`
            : 'application/octet-stream',
        container: inputContainer,
        mutated: overrides.mutated ?? false,
        sourceEvidence: 'RESOLVED',
        tracks,
        sizeBytes: 1_024,
      },
    ],
    ...(overrides.outputContainer !== undefined
      ? {
          output: {
            container: overrides.outputContainer,
            ...(overrides.videoCodec !== undefined ? { videoCodec: overrides.videoCodec } : {}),
            ...(overrides.audioCodec !== undefined ? { audioCodec: overrides.audioCodec } : {}),
            ...(overrides.outputWidth !== undefined ? { width: overrides.outputWidth } : {}),
            ...(overrides.outputHeight !== undefined ? { height: overrides.outputHeight } : {}),
          },
        }
      : {}),
    ...(overrides.transforms !== undefined ? { transforms: overrides.transforms } : {}),
    options: overrides.options ?? {},
  };
}

function captureThrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected callback to throw');
}

async function fixtureInput(filename: string, mime: string): Promise<MediaInput> {
  const bytes = new Uint8Array(await Bun.file(`fixtures/media/${filename}`).arrayBuffer());
  return {
    id: filename,
    url: `blob:http://127.0.0.1:5151/${filename}`,
    mime,
    mutated: false,
    sizeBytes: bytes.byteLength,
    blob: () => Promise.resolve(new Blob([bytes.slice().buffer], { type: mime })),
    arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
  };
}

function insertWavJunkBeforeData(bytes: Uint8Array, junkBodyBytes: number): Uint8Array {
  const dataChunkOffset = wavDataChunkOffset(bytes);
  const paddedJunkBytes = junkBodyBytes + (junkBodyBytes & 1);
  const insertedBytes = 8 + paddedJunkBytes;
  const output = new Uint8Array(bytes.byteLength + insertedBytes);
  output.set(bytes.subarray(0, dataChunkOffset), 0);
  output.set([0x4a, 0x55, 0x4e, 0x4b], dataChunkOffset);
  new DataView(output.buffer).setUint32(dataChunkOffset + 4, junkBodyBytes, true);
  output.set(bytes.subarray(dataChunkOffset), dataChunkOffset + insertedBytes);
  new DataView(output.buffer).setUint32(4, output.byteLength - 8, true);
  return output;
}

function wavDataChunkOffset(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let dataChunkOffset = 12;
  while (dataChunkOffset + 8 <= bytes.byteLength) {
    const chunkId = String.fromCharCode(
      bytes[dataChunkOffset]!,
      bytes[dataChunkOffset + 1]!,
      bytes[dataChunkOffset + 2]!,
      bytes[dataChunkOffset + 3]!,
    );
    if (chunkId === 'data') break;
    const chunkBytes = view.getUint32(dataChunkOffset + 4, true);
    dataChunkOffset += 8 + chunkBytes + (chunkBytes & 1);
  }
  if (dataChunkOffset + 8 > bytes.byteLength) throw new Error('test WAV has no data chunk');
  return dataChunkOffset;
}

function directContext(operationRequest: ConcreteOperationRequest): OperationContext {
  return {
    signal: new AbortController().signal,
    phase: 'functional',
    emit: () => undefined,
    request: operationRequest,
    checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  };
}

function restoreGlobal(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor !== undefined) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

describe('performance evidence boundaries', () => {
  test('quality, remux, and massive packet limits are exact pre-content decisions', () => {
    const quality = request('transcode', 'mp4', [VIDEO, AUDIO], {
      scenarioId: 'performance/convert-longtasks',
      inputId: 'scenarios/performance/convert-longtasks/03.mp4',
      outputContainer: 'webm',
      videoCodec: 'vp9',
      audioCodec: 'opus',
    });
    expect(decideAibrushSupport(quality)).toMatchObject({
      supported: false,
      reasonCode: 'AIBRUSH_PERFORMANCE_320P_QUALITY_BOUND',
      preContent: true,
    });
    quality.inputs[0]!.id = 'scenarios/performance/convert-longtasks/02.mp4';
    expect(decideAibrushSupport(quality)).toMatchObject({ supported: true });

    const massive = request('demux', 'mp4', [], {
      scenarioId: 'performance/size-ladder-iterate-packets-massive',
      inputId: 'massive_h264_1080p_2h.mp4',
    });
    expect(decideAibrushSupport(massive)).toMatchObject({
      supported: false,
      reasonCode: 'AIBRUSH_MASSIVE_PACKET_MATERIALIZATION_UNSUPPORTED',
      preContent: true,
    });

    quality.scenarioId = 'performance/encode-fps';
    quality.inputs[0]!.id = 'scenarios/performance/encode-fps/03.mp4';
    expect(decideAibrushSupport(quality)).toMatchObject({
      supported: false,
      reasonCode: 'AIBRUSH_PERFORMANCE_ENCODE_QUALITY_BOUND',
      preContent: true,
    });
  });
});
