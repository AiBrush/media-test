import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { FrameDigest, SeekResult } from '../src/core/engine.ts';
import type { BenchSummary } from '../src/core/scenario.ts';
import {
  buildSelectionManifest,
  findScenarioPool,
  parseBakedCorpusManifest,
  parseScenarioSourceCatalog,
} from '../src/core/media-selection.ts';
import {
  scenarioDefinitionProjection,
  validateScenarioDefinitionV2,
} from '../src/core/scenario.ts';
import {
  leadingPresentationFramePrefix,
  presentationDecodeWindows,
  presentationSampleTimesUs,
  seekToPresentedVideoFrame,
} from '../src/engines/platform/decode.ts';
import {
  ALPHA_DIGEST_ALGORITHM,
  ALPHA_EVIDENCE_SCHEMA,
  DECODE_PROVENANCE_CATALOG,
  DECODE_TRACK_SELECTOR_SCHEMA,
  DISPLAY_EVIDENCE_SCHEMA,
  FirstFrameBoundaryRecorder,
  alphaFrameEvidence,
  assessAlphaEvidence,
  assessDecodeTrackSelection,
  assessDisplaySpaceEvidence,
  assessObservedSeekLanding,
  assessSeekSequence,
  decodeScenarioProvenanceForAsset,
  defineDecodeTrackSelector,
  defineDisplayTransform,
  displayFrameEvidence,
  executeSeekSequence,
  imageDecoderContract,
  materializeDecodeResultProvenance,
  parseAlphaEvidenceArtifact,
  probeImageDecoder,
  seekSequenceContractFromOptions,
  transformRgbaToDisplaySpace,
  validateFirstFrameSummary,
  type AlphaFrameEvidence,
  type DisplayFrameEvidence,
  type ImageDecoderSupportApi,
  type SeekTimelinePoint,
  type SelectedDecodeTrackEvidence,
} from '../src/features/decode-seek/index.ts';
import { decodeSeekScenarios } from '../src/scenarios/decode-seek/index.ts';

type PresentedFrameCallback = (
  now: number,
  metadata: { readonly mediaTime?: number },
) => void;

class FakeVideoPresenter {
  currentTime = 0;
  readonly cancelledCallbacks: number[] = [];
  readonly #listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  readonly #frameCallbacks = new Map<number, PresentedFrameCallback>();
  #nextCallback = 1;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.#listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.#listeners.get(type)?.delete(listener);
  }

  requestVideoFrameCallback(callback: PresentedFrameCallback): number {
    const handle = this.#nextCallback++;
    this.#frameCallbacks.set(handle, callback);
    return handle;
  }

  cancelVideoFrameCallback(handle: number): void {
    this.cancelledCallbacks.push(handle);
    this.#frameCallbacks.delete(handle);
  }

  dispatch(type: 'seeked' | 'error'): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) {
      if (typeof listener === 'function') listener(new Event(type));
      else listener.handleEvent(new Event(type));
    }
  }

  present(mediaTime: number): void {
    const callback = this.#frameCallbacks.entries().next().value as
      | [number, PresentedFrameCallback]
      | undefined;
    if (callback === undefined) throw new Error('no pending video-frame callback');
    this.#frameCallbacks.delete(callback[0]);
    callback[1](0, { mediaTime });
  }

  get pendingFrameCallbacks(): number {
    return this.#frameCallbacks.size;
  }
}

function jsonAt(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as unknown;
}

function textAt(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function scenario(id: string) {
  return decodeSeekScenarios.find((entry) => entry.id === id)!;
}

const DECODE_CANDIDATE_ENVELOPE_CASES = [
  {
    id: 'decode-seek/decode_h264_4k', input: 'h264_4k_10s.mp4',
    envelope: { minWidth: 3_840, maxWidth: 3_840, minHeight: 2_160, maxHeight: 2_160 },
    eligibleReal: ['01.mp4', '02.mp4', '03.mp4'], mismatchedReal: [],
  },
  {
    id: 'decode-seek/decode_size_micro_h264_1frame', input: 'micro_h264_1frame.mp4',
    envelope: {
      minWidth: 320, maxWidth: 320, minHeight: 240, maxHeight: 240,
      minDurationSec: 0.9, maxDurationSec: 1.1,
    },
    eligibleReal: [], mismatchedReal: [],
  },
  {
    id: 'decode-seek/decode_size_tiny_h264_360p', input: 'tiny_h264_360p_2s.mp4',
    envelope: {
      minWidth: 640, maxWidth: 640, minHeight: 360, maxHeight: 360,
      minDurationSec: 1.8, maxDurationSec: 2.2,
    },
    eligibleReal: ['03.mp4'], mismatchedReal: ['01.mp4', '02.mp4'],
  },
  {
    id: 'decode-seek/decode_size_tiny_vp9_360p', input: 'tiny_vp9_360p_2s.webm',
    envelope: {
      minWidth: 640, maxWidth: 640, minHeight: 360, maxHeight: 360,
      minDurationSec: 1.8, maxDurationSec: 2.2,
    },
    eligibleReal: [], mismatchedReal: ['01.webm', '02.webm', '03.webm'],
  },
  {
    id: 'decode-seek/decode_size_large_h264_120s', input: 'large_h264_1080p_120s.mp4',
    envelope: {
      minWidth: 1_920, maxWidth: 1_920, minHeight: 1_080, maxHeight: 1_080,
      minDurationSec: 108, maxDurationSec: 132,
    },
    eligibleReal: ['01.mp4'], mismatchedReal: ['02.mp4', '03.mp4'],
  },
  {
    id: 'decode-seek/decode_size_large_vp9_120s', input: 'large_vp9_1080p_120s.webm',
    envelope: {
      minWidth: 1_920, maxWidth: 1_920, minHeight: 1_080, maxHeight: 1_080,
      minDurationSec: 108, maxDurationSec: 132,
    },
    eligibleReal: [], mismatchedReal: ['01.webm', '02.webm', '03.webm'],
  },
  {
    id: 'decode-seek/decode_size_huge_h264_600s', input: 'huge_h264_1080p_600s.mov',
    envelope: {
      minWidth: 1_920, maxWidth: 1_920, minHeight: 1_080, maxHeight: 1_080,
      minDurationSec: 540, maxDurationSec: 660,
    },
    eligibleReal: ['02.mov'], mismatchedReal: ['01.mov', '03.mov'],
  },
] as const;

function digest(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function frame(ptsUs: number, sha256 = digest(String(Math.abs(ptsUs) % 10))): FrameDigest {
  return { index: 0, ptsUs, sha256, width: 16, height: 16 };
}

function seek(ptsUs: number, sha256 = digest(String(Math.abs(ptsUs) % 10))): SeekResult {
  return { landedPtsUs: ptsUs, frame: frame(ptsUs, sha256) };
}

function timeline(): SeekTimelinePoint[] {
  return [
    { ptsUs: 0, keyframe: true, frameSha256: digest('0') },
    { ptsUs: 2_000_000, keyframe: true, frameSha256: digest('2') },
    { ptsUs: 4_000_000, keyframe: true, frameSha256: digest('4') },
    { ptsUs: 4_200_000, keyframe: false, frameSha256: digest('a') },
    { ptsUs: 4_433_333, keyframe: false, frameSha256: digest('b') },
    { ptsUs: 8_000_000, keyframe: true, frameSha256: digest('8') },
  ];
}

describe('REQ-FEAT-40 bounded platform decode presentation prefix', () => {
  test('reorder look-ahead is sorted before maxFrames truncation', () => {
    const decodeOrder = [
      0, 33_333, 66_667, 133_333, 100_000, 166_667,
      266_667, 233_333, 433_333, 333_333, 366_667, 533_333, 466_667,
    ].map((ptsUs) => ({ ptsUs }));
    expect(leadingPresentationFramePrefix(decodeOrder, 12).map((entry) => entry.ptsUs)).toEqual([
      0, 33_333, 66_667, 100_000, 133_333, 166_667,
      233_333, 266_667, 333_333, 366_667, 433_333, 466_667,
    ]);
  });

  test('uniform sampling derives a whole-program window from demux PTS without container duration', () => {
    const headerlessTimeline = Array.from({ length: 50 }, (_, index) => ({ ptsUs: 80_000 + index * 40_000 }));
    expect(presentationSampleTimesUs(headerlessTimeline, { maxFrames: 4, sampling: 'uniform' })).toEqual([
      0,
      500_000,
      1_000_000,
      1_500_000,
    ]);
  });

  test('paired explicit instants are bounded, sanitized and relative to the first video PTS', () => {
    const timeline = [{ ptsUs: 2_000_000 }, { ptsUs: 2_040_000 }, { ptsUs: 2_080_000 }];
    expect(presentationSampleTimesUs(timeline, {
      maxFrames: 3,
      sampling: 'uniform',
      sampleTimesSec: [0.08, Number.NaN, -1, 0, 0.04, 9],
    })).toEqual([0, 40_000, 80_000]);
  });

  test('explicit requests are not truncated before repeated short-clip samples are de-duplicated', () => {
    const timeline = [{ ptsUs: 0 }, { ptsUs: 33_333 }, { ptsUs: 66_667 }];
    expect(presentationSampleTimesUs(timeline, {
      maxFrames: 4,
      sampling: 'uniform',
      sampleTimesSec: [0, 0.016_666, 0.05, 0.075],
    })).toEqual([0, 16_666, 50_000, 75_000]);
  });

  test('sparse-keyframe whole-program samples share one decode instead of replaying the prefix', () => {
    const samples = Array.from({ length: 3_600 }, (_, index) => ({
      ptsUs: index * 33_333,
      keyframe: index === 0,
    }));
    const times = presentationSampleTimesUs(samples, { maxFrames: 8, sampling: 'uniform' });
    const windows = presentationDecodeWindows(samples, times);
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ startIndex: 0 });
    expect(windows[0]!.targetPtsUs).toHaveLength(8);
    expect(windows[0]!.endIndex).toBeLessThanOrEqual(samples.length);
  });
});

describe('platform video-element presentation barriers', () => {
  test('a no-op zero seek resolves from fresh exact compositor evidence and returns its media time', async () => {
    const video = new FakeVideoPresenter();
    const seek = seekToPresentedVideoFrame(
      video as unknown as HTMLVideoElement,
      0,
      1_000,
      0.001,
    );

    video.present(0.0004);
    await expect(seek).resolves.toBe(0.0004);
    expect(video.pendingFrameCallbacks).toBe(0);
  });

  test('re-arms after a stale compositor callback and proves the exact authored anchor', async () => {
    const video = new FakeVideoPresenter();
    let settled = false;
    const seek = seekToPresentedVideoFrame(
      video as unknown as HTMLVideoElement,
      0.8,
      1_000,
      0.001,
    ).then(() => {
      settled = true;
    });

    // A callback may race ahead of `seeked`; mediaTime, not callback order, identifies its surface.
    video.present(0.6);
    video.dispatch('seeked');
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(video.pendingFrameCallbacks).toBe(1);

    video.present(0.8);
    await seek;
    expect(settled).toBe(true);
  });

  test('requires rVFC evidence for exact anchors but retains seeked fallback otherwise', async () => {
    const withoutRvfc = {
      currentTime: 0,
      addEventListener(type: string, listener: EventListener): void {
        if (type === 'seeked') queueMicrotask(() => listener(new Event(type)));
      },
      removeEventListener(): void {},
    } as unknown as HTMLVideoElement;

    await expect(
      seekToPresentedVideoFrame(withoutRvfc, 0.8, 1_000, 0.001),
    ).rejects.toThrow('requires requestVideoFrameCallback mediaTime evidence');
    await expect(seekToPresentedVideoFrame(withoutRvfc, 0.8, 1_000)).resolves.toBeUndefined();
  });

  test('cancels an armed presentation callback when the media element errors', async () => {
    const video = new FakeVideoPresenter();
    const seek = seekToPresentedVideoFrame(
      video as unknown as HTMLVideoElement,
      0.8,
      1_000,
      0.001,
    );
    video.dispatch('error');

    await expect(seek).rejects.toThrow('<video> error during seek');
    expect(video.cancelledCallbacks).toEqual([1]);
    expect(video.pendingFrameCallbacks).toBe(0);
  });
});

describe('REQ-FEAT-44 adapters return observed seek landing PTS', () => {
  test('a between-frame target must identify one real demux-table PTS', () => {
    const observed = {
      targetUs: 4_250_000,
      landedPtsUs: 4_200_000,
      frame: frame(4_200_000, digest('a')),
    };
    expect(assessObservedSeekLanding(observed, timeline(), false)).toMatchObject({
      verdict: 'PASS',
      reasonCode: 'SEEK_OBSERVED_SAMPLE_MATCH',
    });
  });

  test('copying the requested VFR time is a FAIL even when it is close to a real point', () => {
    const copied = {
      targetUs: 4_250_000,
      landedPtsUs: 4_250_000,
      frame: frame(4_250_000),
    };
    expect(assessObservedSeekLanding(copied, timeline(), false)).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'SEEK_REQUEST_TIME_COPIED',
    });
  });

  test('frame identity and landed PTS must describe the same observed sample', () => {
    expect(assessObservedSeekLanding({
      targetUs: 4_250_000,
      landedPtsUs: 4_200_000,
      frame: frame(4_433_333, digest('b')),
    }, timeline(), false)).toMatchObject({ verdict: 'FAIL', reasonCode: 'SEEK_FRAME_PTS_DISAGREES' });

    expect(assessObservedSeekLanding({
      targetUs: 4_250_000,
      landedPtsUs: 4_200_000,
      frame: frame(4_200_000, digest('f')),
    }, timeline(), false)).toMatchObject({ verdict: 'FAIL', reasonCode: 'SEEK_FRAME_IDENTITY_MISMATCH' });
  });
});

describe('REQ-FEAT-45 stateful repeated and backward seek', () => {
  test('repeated seek executes twice on one invoker and retains per-step latency', async () => {
    const contract = seekSequenceContractFromOptions({
      tUs: 4_000_000,
      expectKeyframe: true,
      seekEdge: 'repeated',
    })!;
    const calls: number[] = [];
    const clock = [10, 12, 20, 23][Symbol.iterator]();
    const observation = await executeSeekSequence(async (target) => {
      calls.push(target);
      return seek(4_000_000, digest('4'));
    }, contract, () => clock.next().value!);

    expect(calls).toEqual([4_000_000, 4_000_000]);
    expect(observation.steps.map((entry) => entry.latencyMs)).toEqual([2, 3]);
    expect(assessSeekSequence(contract, observation, timeline())).toMatchObject({
      verdict: 'PASS',
      reasonCode: 'SEEK_STATEFUL_SEQUENCE_PASS',
    });
  });

  test('returning the previous result object fails the repeated row', async () => {
    const contract = seekSequenceContractFromOptions({
      tUs: 4_000_000,
      expectKeyframe: true,
      seekEdge: 'repeated',
    })!;
    const stale = seek(4_000_000, digest('4'));
    let time = 0;
    const observation = await executeSeekSequence(async () => stale, contract, () => time++);
    expect(assessSeekSequence(contract, observation, timeline())).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'SEEK_STALE_RESULT_REUSED',
    });
  });

  test('backward seek executes 8s then 2s and rejects stale forward state', async () => {
    const contract = seekSequenceContractFromOptions({
      tUs: 2_000_000,
      priorSeekUs: 8_000_000,
      expectKeyframe: true,
      seekEdge: 'backward',
    })!;
    let time = 0;
    const correct = await executeSeekSequence(async (target) =>
      target === 8_000_000 ? seek(target, digest('8')) : seek(target, digest('2')),
    contract, () => time++);
    expect(correct.steps.map((entry) => entry.targetUs)).toEqual([8_000_000, 2_000_000]);
    expect(assessSeekSequence(contract, correct, timeline())).toMatchObject({ verdict: 'PASS' });

    time = 0;
    const first = seek(8_000_000, digest('8'));
    let calls = 0;
    const stale = await executeSeekSequence(async () => calls++ === 0 ? first : {
      landedPtsUs: first.landedPtsUs,
      frame: { ...first.frame },
    }, contract, () => time++);
    expect(assessSeekSequence(contract, stale, timeline())).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'SEEK_WRONG_REAL_SAMPLE',
    });
  });

  test('the registered edge rows declaratively resolve to two-step contracts', () => {
    for (const id of ['decode-seek/seek_repeated_same_target', 'decode-seek/seek_backward_then_forward']) {
      const scenario = decodeSeekScenarios.find((entry) => entry.id === id)!;
      expect(seekSequenceContractFromOptions(scenario.options)?.steps).toHaveLength(2);
    }
  });
});

describe('REQ-FEAT-46 timeToFirstFrame at the frame-sink boundary', () => {
  test('the first sink delivery is immutable while cardinality keeps advancing', () => {
    const recorder = new FirstFrameBoundaryRecorder(100);
    recorder.delivered(112.5);
    recorder.delivered(140);
    expect(recorder.evidence()).toEqual({
      schema: 'media-test/first-frame-boundary@1',
      firstFrameMs: 12.5,
      deliveredFrames: 2,
    });
  });

  test('every measured iteration needs one finite sample and n=0 is unavailable', () => {
    const summary: BenchSummary = {
      n: 2,
      warmup: 0,
      metric: 'timeToFirstFrame',
      median: 8,
      p95: 9,
      mad: 1,
      unit: 'ms',
      samples: [7, 9],
    };
    expect(validateFirstFrameSummary(summary, 2)).toMatchObject({ state: 'AVAILABLE' });
    expect(validateFirstFrameSummary({ ...summary, n: 0, samples: [] }, 2)).toMatchObject({
      state: 'ERROR', reasonCode: 'FIRST_FRAME_SAMPLE_MISSING',
    });
    expect(validateFirstFrameSummary({ ...summary, n: 1, samples: [7] }, 2)).toMatchObject({
      state: 'ERROR', reasonCode: 'FIRST_FRAME_SAMPLE_COUNT_MISMATCH',
    });
    expect(validateFirstFrameSummary({ ...summary, samples: [7, Number.NaN] }, 2)).toMatchObject({
      state: 'ERROR', reasonCode: 'FIRST_FRAME_SAMPLE_INVALID',
    });
  });
});

describe('REQ-FEAT-47 normalized decode track selection', () => {
  const requested = defineDecodeTrackSelector({
    type: 'video',
    trackIndex: 1,
    typeOrdinal: 1,
    trackId: 'alternate-video',
    firstFrameSha256: digest('b'),
  });
  const alternateEvidence: SelectedDecodeTrackEvidence = {
    schema: DECODE_TRACK_SELECTOR_SCHEMA,
    type: 'video',
    trackIndex: 1,
    typeOrdinal: 1,
    trackId: 'alternate-video',
    codec: 'h264',
    width: 16,
    height: 16,
  };

  test('the requested non-first video track and its content identity pass', () => {
    expect(assessDecodeTrackSelection(requested, alternateEvidence, [frame(0, digest('b'))])).toMatchObject({
      verdict: 'PASS',
      reasonCode: 'DECODE_TRACK_SELECTION_MATCH',
    });
  });

  test('an adapter hard-coded to the first video track fails', () => {
    const hardCodedFirst: SelectedDecodeTrackEvidence = {
      ...alternateEvidence,
      trackIndex: 0,
      typeOrdinal: 0,
      trackId: 'first-video',
    };
    expect(assessDecodeTrackSelection(requested, hardCodedFirst, [frame(0, digest('a'))])).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'DECODE_TRACK_SELECTION_MISMATCH',
    });
    expect(assessDecodeTrackSelection(requested, undefined, [frame(0, digest('b'))])).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'DECODE_TRACK_SELECTION_EVIDENCE_MISSING',
    });
  });
});

describe('REQ-FEAT-48 display-space rotation evidence', () => {
  const contract = defineDisplayTransform({
    codedWidth: 3,
    codedHeight: 2,
    displayWidth: 2,
    displayHeight: 3,
    rotationDegrees: 90,
    flipX: false,
    flipY: false,
  });
  const coded = new Uint8Array([
    1, 0, 0, 255,
    2, 0, 0, 255,
    3, 0, 0, 255,
    4, 0, 0, 255,
    5, 0, 0, 255,
    6, 0, 0, 255,
  ]);
  const displayed = transformRgbaToDisplaySpace({ width: 3, height: 2, data: coded }, contract);
  const reference = [displayFrameEvidence(0, displayed)];

  test('rotation changes both display dimensions and RGBA placement', () => {
    expect(displayed).toMatchObject({ width: 2, height: 3 });
    expect([...displayed.data]).toEqual([
      4, 0, 0, 255,
      1, 0, 0, 255,
      5, 0, 0, 255,
      2, 0, 0, 255,
      6, 0, 0, 255,
      3, 0, 0, 255,
    ]);
    expect(assessDisplaySpaceEvidence(reference, reference, contract)).toMatchObject({
      verdict: 'PASS', reasonCode: 'DISPLAY_SPACE_EVIDENCE_MATCH',
    });
  });

  test('metadata-only size swapping and coded dimensions cannot pass', () => {
    const dimensionOnly: DisplayFrameEvidence[] = [{
      ptsUs: 0,
      width: 2,
      height: 3,
      rgbaSha256: displayFrameEvidence(0, { width: 3, height: 2, data: coded }).rgbaSha256,
    }];
    expect(assessDisplaySpaceEvidence(dimensionOnly, reference, contract)).toMatchObject({
      verdict: 'FAIL', reasonCode: 'DISPLAY_PIXEL_TRANSFORM_MISMATCH',
    });

    const codedDimensions = [{ ...reference[0]!, width: 3, height: 2 }];
    expect(assessDisplaySpaceEvidence(codedDimensions, reference, contract)).toMatchObject({
      verdict: 'FAIL', reasonCode: 'DISPLAY_DIMENSIONS_NOT_PRESENTED',
    });
  });

  test('the family catalog exposes rotated display resolution, not a name-derived guess', () => {
    expect(decodeScenarioProvenanceForAsset('h264_rotated90.mp4').resolution).toEqual({
      width: 720,
      height: 1280,
    });
  });
});

describe('REQ-FEAT-49 timestamp-keyed alpha evidence', () => {
  const rgba = (alphas: number[]): Uint8Array => new Uint8Array(alphas.flatMap((alpha) => [8, 16, 32, alpha]));
  const reference: AlphaFrameEvidence[] = [
    alphaFrameEvidence(0, 2, 1, rgba([0, 64])),
    alphaFrameEvidence(33_333, 2, 1, rgba([128, 254])),
  ];

  test('the committed alpha artifact is typed and digest-bound to its source', () => {
    const artifact = parseAlphaEvidenceArtifact(jsonAt('fixtures/golden/vp9_alpha.webm.alpha.json'));
    expect(artifact).toMatchObject({
      schema: ALPHA_EVIDENCE_SCHEMA,
      assetId: 'vp9_alpha.webm',
      sourceSha256: '3f130b8eadd0dc36b3992124e37a879938a89730487e48a9e8a5c41202d5c4c3',
      algorithm: ALPHA_DIGEST_ALGORITHM,
    });
    expect(artifact?.frames).toHaveLength(12);
    expect(artifact?.frames.every((entry) => entry.nonOpaquePixels > 0)).toBe(true);
  });

  test('exact timestamp-keyed alpha passes; one value mutation fails', () => {
    expect(assessAlphaEvidence(reference, reference)).toMatchObject({
      verdict: 'PASS', reasonCode: 'ALPHA_TIMESTAMP_EVIDENCE_MATCH',
    });
    const mutated = [...reference];
    mutated[1] = alphaFrameEvidence(33_333, 2, 1, rgba([129, 254]));
    expect(assessAlphaEvidence(mutated, reference)).toMatchObject({
      verdict: 'FAIL', reasonCode: 'ALPHA_PLANE_DIGEST_MISMATCH',
    });
  });

  test('shifting the alpha stream by one frame and opaque output both fail', () => {
    const shifted = [
      { ...reference[0]!, alphaSha256: reference[1]!.alphaSha256 },
      { ...reference[1]!, alphaSha256: reference[0]!.alphaSha256 },
    ];
    expect(assessAlphaEvidence(shifted, reference)).toMatchObject({
      verdict: 'FAIL', reasonCode: 'ALPHA_PLANE_DIGEST_MISMATCH',
    });
    const opaque = reference.map((entry) => ({ ...entry, nonOpaquePixels: 0 }));
    expect(assessAlphaEvidence(opaque, reference)).toMatchObject({
      verdict: 'FAIL', reasonCode: 'ALPHA_OUTPUT_OPAQUE',
    });
  });

  test('schema or digest corruption cannot be interpreted as evidence', () => {
    const artifact = jsonAt('fixtures/golden/vp9_alpha.webm.alpha.json') as Record<string, unknown>;
    expect(parseAlphaEvidenceArtifact({ ...artifact, algorithm: 'presence-only' })).toBeUndefined();
    const frames = artifact.frames as Array<Record<string, unknown>>;
    expect(parseAlphaEvidenceArtifact({
      ...artifact,
      frames: [{ ...frames[0], alphaSha256: 'not-a-digest' }],
    })).toBeUndefined();
  });
});

describe('REQ-FEAT-50 structured size and provenance fields', () => {
  test('every registered decode input has structured bucket/resolution/codec/heavy-bake facts', () => {
    const decodeAssets = decodeSeekScenarios
      .filter((scenario) => scenario.op === 'decodeFrames')
      .map((scenario) => Array.isArray(scenario.input) ? scenario.input[0]! : scenario.input);
    expect(decodeAssets.length).toBeGreaterThan(20);
    expect(decodeAssets.every((asset) => DECODE_PROVENANCE_CATALOG[asset] !== undefined)).toBe(true);
    for (const asset of decodeAssets) {
      const value = decodeScenarioProvenanceForAsset(asset);
      expect(value.assetId).toBe(asset);
      expect(value.resolution.width).toBeGreaterThan(0);
      expect(value.resolution.height).toBeGreaterThan(0);
      expect(value.codec.length).toBeGreaterThan(0);
    }
  });

  test('actual bytes and digest come from the selected verified input, not the scenario id', () => {
    const declared = decodeScenarioProvenanceForAsset('tiny_h264_360p_2s.mp4');
    expect(materializeDecodeResultProvenance(declared, {
      id: 'catalog/non-name-derived-candidate.mp4',
      sizeBytes: 777_777,
      sha256: digest('a'),
    })).toMatchObject({
      state: 'AVAILABLE',
      value: {
        sizeBucket: 'tiny',
        resolution: { width: 640, height: 360 },
        codec: 'h264',
        heavyBake: false,
        selectedAssetId: 'catalog/non-name-derived-candidate.mp4',
        actualInputBytes: 777_777,
      },
    });
    expect(materializeDecodeResultProvenance(declared, { id: 'missing-size.mp4' })).toMatchObject({
      state: 'ERROR', reasonCode: 'DECODE_PROVENANCE_INPUT_BYTES_MISSING',
    });
  });

  test('long size-rungs retain heavy-bake provenance explicitly', () => {
    for (const asset of [
      'large_h264_1080p_120s.mp4',
      'large_vp9_1080p_120s.webm',
      'huge_h264_1080p_600s.mov',
    ]) {
      expect(decodeScenarioProvenanceForAsset(asset).heavyBake).toBe(true);
    }
    expect(decodeScenarioProvenanceForAsset('micro_h264_1frame.mp4').heavyBake).toBe(false);
  });
});

describe('REQ-FEAT-51 ImageDecoder applicability is separate', () => {
  test('JPEG/PNG/WebP map to exact ImageDecoder MIME contracts', () => {
    expect(imageDecoderContract('jpeg').mime).toBe('image/jpeg');
    expect(imageDecoderContract('png').mime).toBe('image/png');
    expect(imageDecoderContract('webp').mime).toBe('image/webp');
    expect(() => imageDecoderContract('mp4')).toThrow();
  });

  test('only ImageDecoder.isTypeSupported is consulted', async () => {
    const calls: string[] = [];
    const api: ImageDecoderSupportApi = {
      isTypeSupported(type) {
        calls.push(type);
        return true;
      },
    };
    expect(await probeImageDecoder(imageDecoderContract('png'), api)).toMatchObject({ state: 'SUPPORTED' });
    expect(calls).toEqual(['image/png']);
  });

  test('API absence and unsupported MIME are NA_BROWSER; invalid probe input is ERROR', async () => {
    const contract = imageDecoderContract('webp');
    expect(await probeImageDecoder(contract, undefined)).toMatchObject({
      state: 'UNAVAILABLE', status: 'NA_BROWSER', reasonCode: 'IMAGE_DECODER_API_UNAVAILABLE',
    });
    expect(await probeImageDecoder(contract, { isTypeSupported: () => false })).toMatchObject({
      state: 'UNAVAILABLE', status: 'NA_BROWSER', reasonCode: 'IMAGE_DECODER_TYPE_UNSUPPORTED',
    });
    expect(await probeImageDecoder(contract, {
      isTypeSupported: () => { throw new TypeError('bad config'); },
    })).toMatchObject({ state: 'ERROR', reasonCode: 'IMAGE_DECODER_CONFIG_INVALID' });
    expect(await probeImageDecoder(contract, {
      isTypeSupported: () => { throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' }); },
    })).toMatchObject({
      state: 'UNAVAILABLE', status: 'NA_BROWSER', reasonCode: 'IMAGE_DECODER_TYPE_UNSUPPORTED',
    });
  });
});

describe('decode workload candidate envelopes', () => {
  test('the exact seven size/geometry rows publish revisioned, schema-valid envelopes', () => {
    expect(decodeSeekScenarios
      .filter((entry) => entry.candidateEnvelope !== undefined)
      .map((entry) => entry.id)
      .sort()).toEqual(DECODE_CANDIDATE_ENVELOPE_CASES.map((entry) => entry.id).sort());

    for (const expected of DECODE_CANDIDATE_ENVELOPE_CASES) {
      const item = scenario(expected.id);
      expect(item.revision, expected.id).toBe(2);
      expect(item.input, expected.id).toBe(expected.input);
      expect(item.candidateEnvelope, expected.id).toEqual(expected.envelope);
      expect(Object.isFrozen(item.candidateEnvelope), expected.id).toBeTrue();
      expect(validateScenarioDefinitionV2(scenarioDefinitionProjection(item)), expected.id).toEqual([]);
    }
  });

  test('production selection retains only real assets inside the authored workload geometry', () => {
    const catalogResult = parseScenarioSourceCatalog(
      textAt('fixtures/media/scenarios/_sources.ndjson'),
    );
    if (catalogResult.state !== 'VALID') {
      throw new Error(catalogResult.issues.map((issue) => issue.detail).join('; '));
    }
    const bakedResult = parseBakedCorpusManifest(jsonAt('fixtures/manifest.json'));
    if (bakedResult.state !== 'VALID') {
      throw new Error(bakedResult.issues.map((issue) => issue.detail).join('; '));
    }
    const manifest = buildSelectionManifest({
      scenarios: DECODE_CANDIDATE_ENVELOPE_CASES.map((entry) => scenario(entry.id)),
      catalog: catalogResult.catalog,
      bakedManifest: bakedResult.manifest,
    });

    for (const expected of DECODE_CANDIDATE_ENVELOPE_CASES) {
      const pool = findScenarioPool(manifest, expected.id);
      if (!pool) throw new Error(`missing candidate pool '${expected.id}'`);
      expect(pool.candidates
        .filter((candidate) => candidate.kind === 'baked')
        .map((candidate) => candidate.selectedFile), expected.id).toEqual([expected.input]);
      expect(pool.candidates
        .filter((candidate) => candidate.kind === 'real')
        .map((candidate) => candidate.selectedFile)
        .sort(), expected.id).toEqual([...expected.eligibleReal].sort());
      expect(pool.rejections
        .filter((rejection) => rejection.reasonCode === 'CANDIDATE_INPUT_CONTRACT_MISMATCH')
        .map((rejection) => rejection.selectedFile)
        .sort(), expected.id).toEqual([...expected.mismatchedReal].sort());
      expect(pool.rejections.length, expected.id).toBe(expected.mismatchedReal.length);
    }
  });
});
