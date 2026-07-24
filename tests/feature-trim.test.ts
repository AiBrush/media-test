import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { isNotApplicableError, type ConcreteWebCodecsConfig } from '../src/core/engine.ts';
import {
  TRIM_BOUNDARY_EVIDENCE_SCHEMA,
  assessAudioTrimEvidence,
  assessFeatureLabelledTrim,
  assessFragmentedTrimOutput,
  assessTrimBoundaryEvidence,
  assessTrimComposition,
  assessTrimNoopIdentity,
  buildTrimThroughputEvidence,
  executeTrimComposition,
  inspectTrimAudioContainer,
  preflightTrimTuple,
  readIsoBmffPresentationTimeline,
  resolveEffectiveTrimInterval,
  selectIsoBmffTrimWindows,
  trimBoundaryEvidenceKey,
  trimContractForScenario,
  trimContractFromOptions,
  type AudioContainerEvidence,
  type AudioTrimReferenceEvidence,
  type CandidateTrimBoundaryEvidence,
  type SemanticTrimSample,
  type SemanticTrimTrack,
  type TrimBoundaryEvidenceArtifact,
  type TrimCompositionContract,
  type TrimSemanticPresentation,
} from '../src/features/trim/index.ts';
import { trimScenarios } from '../src/scenarios/trim/index.ts';

const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/golden/trim/acceptance-vectors.json', import.meta.url),
  'utf8',
)) as {
  boundary: Omit<TrimBoundaryEvidenceArtifact, 'schema' | 'key' | 'expectedLandedInterval' | 'provenance' | 'outputOriginUs'> & {
    configurationDigest: string;
    landedInterval: { startUs: number; endUs: number };
  };
  audio: AudioTrimReferenceEvidence;
};

function media(name: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(readFileSync(new URL(`../fixtures/media/${name}`, import.meta.url)));
}

function boundaryArtifact(): TrimBoundaryEvidenceArtifact {
  const value = fixture.boundary;
  const provenance = {
    decoder: 'platform-webcodecs',
    configurationDigest: value.configurationDigest,
  };
  return {
    schema: TRIM_BOUNDARY_EVIDENCE_SCHEMA,
    assetId: value.assetId,
    range: value.range,
    mode: value.mode,
    representationClass: value.representationClass,
    expectedLandedInterval: value.landedInterval,
    outputOriginUs: 0,
    timestampToleranceUs: value.timestampToleranceUs,
    frames: value.frames,
    provenance,
    key: trimBoundaryEvidenceKey({
      assetId: value.assetId,
      range: value.range,
      mode: value.mode,
      representationClass: value.representationClass,
      configurationDigest: value.configurationDigest,
    }),
  };
}

function exactBoundaryCandidate(): CandidateTrimBoundaryEvidence {
  const artifact = boundaryArtifact();
  return {
    outputOriginUs: 0,
    landedSourceInterval: artifact.expectedLandedInterval,
    decodeComplete: true,
    // Deliberately omit the non-required middle VFR observation: pairing is by time window, not index.
    frames: artifact.frames.filter((frame) => frame.required !== false),
  };
}

describe('REQ-FEAT-25 presentation-time-windowed boundary evidence', () => {
  test('same-duration wrong interval fails while a changed-count VFR boundary match passes', () => {
    const artifact = boundaryArtifact();
    const base = {
      assetId: artifact.assetId,
      range: artifact.range,
      mode: artifact.mode,
      representationClass: artifact.representationClass,
      reference: { state: 'READY' as const, artifact },
    };
    expect(assessTrimBoundaryEvidence({ ...base, candidate: exactBoundaryCandidate() })).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRIM_BOUNDARY_PRESENTATION_MATCH',
      measurements: { referenceBoundaryFrames: 2, candidateBoundaryFrames: 2, pairedBoundaryFrames: 2 },
    });
    expect(assessTrimBoundaryEvidence({
      ...base,
      candidate: {
        ...exactBoundaryCandidate(),
        landedSourceInterval: { startUs: 3_100_000, endUs: 3_500_000 },
      },
    })).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRIM_WRONG_SOURCE_INTERVAL',
    });
  });

  test('Annex-B/AVCC is a named DIFF, not FAIL', () => {
    const artifact = boundaryArtifact();
    expect(assessTrimBoundaryEvidence({
      assetId: artifact.assetId,
      range: artifact.range,
      mode: artifact.mode,
      representationClass: artifact.representationClass,
      reference: { state: 'READY', artifact },
      candidate: {
        ...exactBoundaryCandidate(),
        representationDifferences: ['AVCC vs Annex-B', 'out-of-band vs inline SPS/PPS'],
      },
    })).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRIM_LEGAL_REPRESENTATION_DIFFERENCE',
    });
  });

  test('perceptual boundary matches require a declared re-encode and must meet the artifact gate', () => {
    const artifact = { ...boundaryArtifact(), minimumContentSimilarity: 0.98 };
    const perceptualCandidate = (similarity: number, declareDifference: boolean) => ({
      ...exactBoundaryCandidate(),
      frames: exactBoundaryCandidate().frames.map((frame) => ({
        ...frame,
        contentDigest: 'ff'.repeat(32),
        contentSimilarity: similarity,
      })),
      ...(declareDifference ? { representationDifferences: ['lossy boundary re-encode'] } : {}),
    });
    const base = {
      assetId: artifact.assetId,
      range: artifact.range,
      mode: artifact.mode,
      representationClass: artifact.representationClass,
      reference: { state: 'READY' as const, artifact },
    };

    expect(assessTrimBoundaryEvidence({ ...base, candidate: perceptualCandidate(1, false) }))
      .toMatchObject({ verdict: 'FAIL', reasonCode: 'TRIM_BOUNDARY_CONTENT_MISMATCH' });
    expect(assessTrimBoundaryEvidence({ ...base, candidate: perceptualCandidate(0.9799, true) }))
      .toMatchObject({ verdict: 'FAIL', reasonCode: 'TRIM_BOUNDARY_CONTENT_MISMATCH' });
    expect(assessTrimBoundaryEvidence({ ...base, candidate: perceptualCandidate(0.98, true) }))
      .toMatchObject({ verdict: 'PASS', reasonCode: 'TRIM_LEGAL_REPRESENTATION_DIFFERENCE' });

    const aggregateArtifact = {
      ...artifact,
      minimumContentSimilarity: 0.94,
      minimumMeanContentSimilarity: 0.98,
    };
    const aggregateBase = { ...base, reference: { state: 'READY' as const, artifact: aggregateArtifact } };
    const mixed = perceptualCandidate(0.99, true);
    mixed.frames[0] = { ...mixed.frames[0]!, contentSimilarity: 0.94 };
    expect(assessTrimBoundaryEvidence({ ...aggregateBase, candidate: mixed }))
      .toMatchObject({ verdict: 'FAIL', reasonCode: 'TRIM_BOUNDARY_CONTENT_MISMATCH' });
    mixed.frames[1] = { ...mixed.frames[1]!, contentSimilarity: 1 };
    expect(assessTrimBoundaryEvidence({ ...aggregateBase, candidate: mixed }))
      .toMatchObject({ verdict: 'FAIL', reasonCode: 'TRIM_BOUNDARY_CONTENT_MISMATCH' });
    mixed.frames[0] = { ...mixed.frames[0]!, contentSimilarity: 0.96 };
    expect(assessTrimBoundaryEvidence({ ...aggregateBase, candidate: mixed }))
      .toMatchObject({ verdict: 'PASS', reasonCode: 'TRIM_LEGAL_REPRESENTATION_DIFFERENCE' });
  });

  test('range evidence and neutral decoder absence remain distinct NA states', () => {
    const artifact = boundaryArtifact();
    const common = {
      assetId: artifact.assetId,
      range: artifact.range,
      mode: artifact.mode,
      representationClass: artifact.representationClass,
      candidate: exactBoundaryCandidate(),
    };
    expect(assessTrimBoundaryEvidence({
      ...common,
      reference: { state: 'MISSING', reasonCode: 'TRIM_RANGE_GOLDEN_MISSING', detail: 'not baked' },
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_ASSET' });
    expect(assessTrimBoundaryEvidence({
      ...common,
      reference: { state: 'BROWSER_UNAVAILABLE', reasonCode: 'H264_DECODER_UNSUPPORTED', detail: 'unsupported config' },
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_BROWSER' });
  });
});

describe('REQ-FEAT-26 reachable decoded-audio/content oracles', () => {
  test('neutral readers reach every registered audio container with native sample-time facts', () => {
    const cases = [
      ['mp3_xing.mp3', 'mp3'],
      ['opus.ogg', 'ogg'],
      ['aac_adts.aac', 'adts'],
      ['flac_seektable.flac', 'flac'],
      ['flac_noseektable.flac', 'flac'],
      ['wav_s16.wav', 'wav'],
      ['pcm_s16be.aiff', 'aiff'],
    ] as const;
    for (const [name, container] of cases) {
      const result = inspectTrimAudioContainer(media(name), container);
      expect(result.state).toBe('OK');
      if (result.state === 'OK') {
        expect(result.value.presentationSampleFrames).toBeGreaterThan(0);
        expect(result.value.sampleRate).toBeGreaterThan(0);
      }
    }
    const seek = inspectTrimAudioContainer(media('flac_seektable.flac'), 'flac');
    const noSeek = inspectTrimAudioContainer(media('flac_noseektable.flac'), 'flac');
    expect(seek).toMatchObject({ state: 'OK', value: { seekTablePresent: true, presentationSampleFrames: 480000 } });
    expect(noSeek).toMatchObject({ state: 'OK', value: { seekTablePresent: false, presentationSampleFrames: 480000 } });
  });

  test('one-sample deletion and duplicated boundary PCM each fail', () => {
    const read = inspectTrimAudioContainer(media('opus.ogg'), 'ogg');
    expect(read.state).toBe('OK');
    expect(read).toMatchObject({
      state: 'OK',
      value: {
        codedSampleFrames: 480_960,
        presentationSampleFrames: 480_000,
        primingSampleFrames: 312,
        endTrimSampleFrames: 648,
      },
    });
    const reference = fixture.audio;
    const candidate = {
      sampleRate: reference.sampleRate,
      channels: reference.channels,
      sampleFrames: reference.sampleFrames,
      firstWindowDigest: reference.firstWindowDigest,
      lastWindowDigest: reference.lastWindowDigest,
    };
    const container: AudioContainerEvidence = {
      container: 'ogg', codec: 'opus', sampleRate: 48_000, channels: 2,
      codedSampleFrames: 240_960, presentationSampleFrames: 240_000,
      primingSampleFrames: 312, endTrimSampleFrames: 648, precision: 'exact', packetOrFrameCount: 251,
      metadataTotalSampleFrames: 240_000, endOfStreamPresent: true,
    };
    expect(assessAudioTrimEvidence({ reference, candidate, container: { state: 'OK', value: container } })).toMatchObject({
      verdict: 'PASS',
    });
    expect(assessAudioTrimEvidence({
      reference,
      candidate: { ...candidate, sampleFrames: candidate.sampleFrames - 1 },
      container: { state: 'OK', value: { ...container, presentationSampleFrames: 239_999, metadataTotalSampleFrames: 239_999 } },
    })).toMatchObject({ verdict: 'FAIL', reasonCode: 'TRIM_AUDIO_PROGRAM_CONTENT_MISMATCH' });
    expect(assessAudioTrimEvidence({
      reference,
      candidate: { ...candidate, firstWindowDigest: 'duplicated-edge' },
      container: { state: 'OK', value: container },
    })).toMatchObject({ verdict: 'FAIL' });
  });

  test('wrong Opus pre-skip and stale FLAC total-samples metadata fail against decoded PCM', () => {
    const ogg = media('opus.ogg');
    const head = findAscii(ogg, 'OpusHead');
    expect(head).toBeGreaterThanOrEqual(0);
    const wrongPreSkip = ogg.slice();
    const preSkip = wrongPreSkip[head + 10]! | (wrongPreSkip[head + 11]! << 8);
    const changed = preSkip + 1;
    wrongPreSkip[head + 10] = changed & 0xff;
    wrongPreSkip[head + 11] = changed >>> 8;
    const oggRead = inspectTrimAudioContainer(wrongPreSkip, 'ogg');
    expect(oggRead).toMatchObject({ state: 'OK', value: { primingSampleFrames: 313, presentationSampleFrames: 479999 } });
    const oggReference: AudioTrimReferenceEvidence = {
      sampleRate: 48_000, channels: 2, sampleFrames: 480_000,
      sourceStartSampleFrame: 0, sourceEndSampleFrame: 480_000,
      firstWindowDigest: 'a', lastWindowDigest: 'b',
    };
    expect(assessAudioTrimEvidence({
      reference: oggReference,
      candidate: { ...oggReference },
      container: oggRead,
    })).toMatchObject({ verdict: 'FAIL' });

    const flac = media('flac_seektable.flac');
    const stale = rewriteFlacTotalSamples(flac, 479_999);
    const flacRead = inspectTrimAudioContainer(stale, 'flac');
    expect(flacRead).toMatchObject({ state: 'OK', value: { metadataTotalSampleFrames: 479999 } });
    const flacReference: AudioTrimReferenceEvidence = {
      sampleRate: 48_000, channels: 2, sampleFrames: 480_000,
      sourceStartSampleFrame: 0, sourceEndSampleFrame: 480_000,
      firstWindowDigest: 'c', lastWindowDigest: 'd',
    };
    expect(assessAudioTrimEvidence({
      reference: flacReference,
      candidate: { ...flacReference },
      container: flacRead,
    })).toMatchObject({ verdict: 'FAIL' });
  });
});

describe('REQ-FEAT-27 ISO BMFF edit-list presentation timeline', () => {
  test('resolves empty edits, non-zero media time, priming, and distinct timescales from real fixtures', () => {
    const emptyEdit = readIsoBmffPresentationTimeline(media('hls_aes128_clear.mp4'));
    expect(emptyEdit.state).toBe('OK');
    if (emptyEdit.state === 'OK') {
      const video = emptyEdit.tracks.find((track) => track.type === 'video')!;
      expect(emptyEdit.movieTimescale).toBe(1000);
      expect(video.mediaTimescale).toBe(90_000);
      expect(video.emptyLeadingEditUs).toBe(21_000);
      expect(video.presentationStartUs).toBe(21_000);
    }

    const gapless = readIsoBmffPresentationTimeline(media('gapless_aac.m4a'));
    expect(gapless.state).toBe('OK');
    if (gapless.state === 'OK') {
      const audio = gapless.tracks[0]!;
      expect(gapless.movieTimescale).toBe(1000);
      expect(audio.mediaTimescale).toBe(44_100);
      expect(audio.firstMediaTimeTicks).toBe(1024);
      expect(audio.samples[0]).toMatchObject({ sampleIndex: 1, presentationStartUs: 0 });
      expect(gapless.presentationDurationUs).toBe(1_012_993);
    }
  });

  test('trim sample selection is made on mapped presentation time, not mvhd/raw media time', () => {
    const read = readIsoBmffPresentationTimeline(media('h264_1080p_30s.mp4'));
    expect(read.state).toBe('OK');
    if (read.state !== 'OK') return;
    const accurate = selectIsoBmffTrimWindows(read, { startUs: 2_034_000, endUs: 2_100_000 }, 'frame-accurate');
    const copy = selectIsoBmffTrimWindows(read, { startUs: 2_034_000, endUs: 2_100_000 }, 'copy');
    const videoAccurate = accurate.find((entry) => entry.type === 'video')!;
    const videoCopy = copy.find((entry) => entry.type === 'video')!;
    expect(videoAccurate.landedStartUs).toBeLessThanOrEqual(2_034_000);
    expect(videoAccurate.landedEndUs).toBeGreaterThan(2_034_000);
    expect(videoCopy.landedStartUs).toBeLessThan(videoAccurate.landedStartUs);
    const audio = accurate.find((entry) => entry.type === 'audio')!;
    expect(audio.firstSampleIndex).toBeGreaterThan(0); // priming sample was removed by the edit list.
  });
});

describe('REQ-FEAT-28 feature-labelled trim properties', () => {
  test('alpha and rotation are independent decoded/display evidence', () => {
    const alpha = {
      state: 'AVAILABLE' as const, alphaDigest: 'alpha', transparentPixels: 10, translucentPixels: 5, opaquePixels: 85,
    };
    expect(assessFeatureLabelledTrim({ alpha: { reference: alpha, candidate: alpha } })).toMatchObject({ verdict: 'PASS' });
    expect(assessFeatureLabelledTrim({
      alpha: { reference: alpha, candidate: { ...alpha, alphaDigest: 'opaque', transparentPixels: 0 } },
    })).toMatchObject({ verdict: 'FAIL' });

    const display = {
      state: 'AVAILABLE' as const, rotationDegrees: 90, displayWidth: 720, displayHeight: 1280, displayDigest: 'upright',
    };
    expect(assessFeatureLabelledTrim({ display: { reference: display, candidate: display } })).toMatchObject({ verdict: 'PASS' });
    expect(assessFeatureLabelledTrim({
      display: { reference: display, candidate: { ...display, rotationDegrees: 0, displayWidth: 1280, displayHeight: 720 } },
    })).toMatchObject({ verdict: 'FAIL' });
    expect(assessFeatureLabelledTrim({
      display: {
        reference: { state: 'MISSING_ASSET', reasonCode: 'ROTATION_GROUND_TRUTH_MISSING' },
        candidate: display,
      },
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_ASSET' });
  });

  test('multitrack identity/alignment, open-GOP first frame, and subframe policy reject one-fact mutations', () => {
    const sourceTracks = [
      semanticTrack('main-video', 'video', [sample(0, 1_000_000, 'v0'), sample(1_000_000, 1_000_000, 'v1')]),
      semanticTrack('main-audio', 'audio', [sample(0, 1_000_000, 'a0'), sample(1_000_000, 1_000_000, 'a1')]),
      semanticTrack('commentary', 'audio', [sample(0, 1_000_000, 'c0'), sample(1_000_000, 1_000_000, 'c1')]),
    ];
    expect(assessFeatureLabelledTrim({
      tracks: { source: sourceTracks, candidate: sourceTracks, startAlignmentToleranceUs: 1, endAlignmentToleranceUs: 1 },
    })).toMatchObject({ verdict: 'PASS' });
    expect(assessFeatureLabelledTrim({
      tracks: { source: sourceTracks, candidate: sourceTracks.slice(0, 2), startAlignmentToleranceUs: 1, endAlignmentToleranceUs: 1 },
    })).toMatchObject({ verdict: 'FAIL' });
    const shiftedAudio = sourceTracks.map((track) => track.identity === 'main-audio'
      ? { ...track, samples: track.samples.map((entry) => ({ ...entry, ptsUs: entry.ptsUs + 10_000 })) }
      : track);
    expect(assessFeatureLabelledTrim({
      tracks: { source: sourceTracks, candidate: shiftedAudio, startAlignmentToleranceUs: 1, endAlignmentToleranceUs: 1 },
    })).toMatchObject({ verdict: 'FAIL' });

    const first = { sourcePtsUs: 2_700_000, contentDigest: 'first', decodeSucceeded: true, missingReferenceCount: 0 };
    expect(assessFeatureLabelledTrim({ openGop: { reference: first, candidate: first } })).toMatchObject({ verdict: 'PASS' });
    expect(assessFeatureLabelledTrim({
      openGop: { reference: first, candidate: { ...first, decodeSucceeded: false, missingReferenceCount: 1 } },
    })).toMatchObject({ verdict: 'FAIL' });

    const enclosing = { sourcePtsUs: 6_000_000, outputPtsUs: 0, durationUs: 33_333, contentDigest: 'one-frame' };
    expect(assessFeatureLabelledTrim({
      shortRange: {
        range: { startUs: 6_000_000, endUs: 6_010_000 }, expected: [enclosing], candidate: [enclosing], timestampToleranceUs: 1,
      },
    })).toMatchObject({ verdict: 'PASS' });
    expect(assessFeatureLabelledTrim({
      shortRange: {
        range: { startUs: 6_000_000, endUs: 6_010_000 }, expected: [enclosing], candidate: [], timestampToleranceUs: 1,
      },
    })).toMatchObject({ verdict: 'FAIL' });
  });
});

describe('REQ-FEAT-29 semantic no-op identity', () => {
  test('legal packet regrouping is DIFF; content/track/timing loss is FAIL', () => {
    const source = semanticPresentation();
    expect(assessTrimNoopIdentity({
      source,
      candidate: source,
      timestampToleranceUs: 0,
      durationToleranceUs: 0,
      representationDifferences: ['AVCC access units regrouped without decoded change'],
    })).toMatchObject({ verdict: 'PASS', reasonCode: 'TRIM_NOOP_REPRESENTATION_DIFFERENCE' });

    const dropped = clonePresentation(source);
    dropped.tracks[0]!.samples = dropped.tracks[0]!.samples.slice(0, -1);
    expect(assessTrimNoopIdentity({ source, candidate: dropped, timestampToleranceUs: 0, durationToleranceUs: 0 })).toMatchObject({ verdict: 'FAIL' });

    const shifted = clonePresentation(source);
    shifted.tracks[1]!.samples[0]!.ptsUs += 1000;
    expect(assessTrimNoopIdentity({ source, candidate: shifted, timestampToleranceUs: 0, durationToleranceUs: 0 })).toMatchObject({ verdict: 'FAIL' });

    const lost = clonePresentation(source);
    lost.tracks.pop();
    expect(assessTrimNoopIdentity({ source, candidate: lost, timestampToleranceUs: 0, durationToleranceUs: 0 })).toMatchObject({ verdict: 'FAIL' });
  });
});

describe('REQ-FEAT-30 mode-aware preflight and runtime tuple NA', () => {
  test('packet-copy runs without browser codec support', () => {
    const contract = trimContractFromOptions({
      container: 'mp4', frameAccurate: false, range: { startUs: 2_000_000, endUs: 8_000_000 },
    });
    const result = preflightTrimTuple({
      engineId: 'test@1', inputContainer: 'mp4', outputContainer: 'mp4', contract,
      copyPath: 'packet-copy', tracks: [{ identity: 'v', type: 'video', codec: 'h264' }],
    }, { supported: true }, [
      { trackIdentity: 'v', role: 'video-decoder', state: 'UNSUPPORTED' },
    ]);
    expect(result.decision).toMatchObject({ verdict: 'PASS', reasonCode: 'TRIM_COPY_CODEC_PROBE_NOT_REQUIRED' });
    expect(result.exactConfigs).toEqual([]);
  });

  test('frame-accurate missing encoder is NA_BROWSER; engine-owned miss throws shared NA', () => {
    const contract = trimContractFromOptions({
      container: 'mp4', frameAccurate: true, range: { startUs: 2_033_000, endUs: 7_966_000 },
    });
    const decoder = videoConfig('video-decoder');
    const encoder = videoConfig('video-encoder');
    const request = {
      engineId: 'test@1', inputContainer: 'mp4', outputContainer: 'mp4', contract,
      copyPath: 'browser-codec' as const,
      tracks: [{ identity: 'v', type: 'video' as const, codec: 'h264', decoderConfig: decoder, encoderConfig: encoder }],
    };
    expect(preflightTrimTuple(request, { supported: true }, [
      { trackIdentity: 'v', role: 'video-decoder', state: 'SUPPORTED' },
      { trackIdentity: 'v', role: 'video-encoder', state: 'UNSUPPORTED', reasonCode: 'H264_ENCODER_UNSUPPORTED' },
    ]).decision).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_BROWSER', reasonCode: 'H264_ENCODER_UNSUPPORTED' });

    let thrown: unknown;
    try {
      preflightTrimTuple(request, {
        supported: false, reasonCode: 'ENGINE_FRAME_ACCURATE_HEVC_UNSUPPORTED', reason: 'no HEVC boundary encoder',
      }, []);
    } catch (error) {
      thrown = error;
    }
    expect(isNotApplicableError(thrown)).toBe(true);
    if (isNotApplicableError(thrown)) expect(thrown.reasonCode).toBe('ENGINE_FRAME_ACCURATE_HEVC_UNSUPPORTED');
    expect(() => trimContractFromOptions({
      container: 'mp4', frameAccurate: false, range: { startUs: -1, endUs: 10 },
    })).toThrow(); // malformed range remains a rejection, never NotApplicableError.
  });
});

describe('REQ-FEAT-31 effective trim throughput numerator', () => {
  test('six-second and sixty-second ladders use only the effective interval and retain read amplification', () => {
    const six = buildTrimThroughputEvidence({
      requestedRange: { startUs: 60_000_000, endUs: 66_000_000 }, presentedDurationUs: 120_000_000,
      wallMs: 500, sourceBytesRead: 12_000_000, bytesNeededForRetainedSamples: 3_000_000, outputDurationUs: 6_000_000,
    });
    expect(six).toMatchObject({ mediaSecondsProcessed: 6, throughputRealtime: 12, readAmplification: 4, sourceBytesRead: 12_000_000 });
    const sixty = buildTrimThroughputEvidence({
      requestedRange: { startUs: 3_600_000_000, endUs: 3_660_000_000 }, presentedDurationUs: 7_200_000_000,
      wallMs: 30_000, sourceBytesRead: 20_000_000, outputDurationUs: 60_000_000,
    });
    expect(sixty.mediaSecondsProcessed).toBe(60);
    expect(sixty.throughputRealtime).toBe(2);
    expect(resolveEffectiveTrimInterval({ startUs: 27_000_000, endUs: 99_000_000 }, 30_000_000)).toMatchObject({
      effectiveDurationUs: 3_000_000, clampedAtEnd: true,
    });
  });
});

describe('REQ-FEAT-32 real fragmented trim scenario and structural evidence', () => {
  test('registered scenario selects the actual fragmented fixture and requests fragmented output', () => {
    const scenario = trimScenarios.find((entry) => entry.id === 'trim/fmp4_fragment_boundary_copy')!;
    expect(scenario.input).toBe('fragmented_cmaf.mp4');
    expect(scenario.options).toMatchObject({ range: { startUs: 2_021_354, endUs: 4_021_354 } });
    expect(trimContractForScenario(scenario).fragmentedOutput).toBe(true);
  });

  test('real init/moof/mdat/tfdt passes; progressive/missing/non-rebased tfdt fail', () => {
    const fragmented = media('fragmented_cmaf.mp4');
    expect(assessFragmentedTrimOutput(fragmented, { requiredTrackTypes: ['video', 'audio'] })).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRIM_FRAGMENT_STRUCTURE_VALID',
      measurements: { fragments: 2, tracks: 2 },
    });
    expect(assessFragmentedTrimOutput(media('tiny_h264_360p_2s.mp4'), { requiredTrackTypes: ['video', 'audio'] })).toMatchObject({
      verdict: 'FAIL',
    });
    const missing = fragmented.slice();
    const tfdt = findAscii(missing, 'tfdt');
    expect(tfdt).toBeGreaterThan(0);
    missing.set(new TextEncoder().encode('free'), tfdt);
    expect(assessFragmentedTrimOutput(missing, { requiredTrackTypes: ['video', 'audio'] })).toMatchObject({
      verdict: 'FAIL', reasonCode: 'FMP4_TFDT_MISSING',
    });
    const nonRebased = fragmented.slice();
    const tfdt2 = findAscii(nonRebased, 'tfdt');
    const version = nonRebased[tfdt2 + 4]!;
    nonRebased[tfdt2 + (version === 1 ? 15 : 11)] = 1;
    expect(assessFragmentedTrimOutput(nonRebased, { requiredTrackTypes: ['video', 'audio'] })).toMatchObject({
      verdict: 'FAIL',
    });
  });
});

describe('REQ-FEAT-33 trim-concat composition metamorphic', () => {
  const contract: TrimCompositionContract = {
    aUs: 0, bUs: 2_000_000, cUs: 4_000_000, container: 'mp4', frameAccurate: true,
  };

  test('registered feature scenario has a real a<b<c compose request', () => {
    const scenario = trimScenarios.find((entry) => entry.id === 'trim/h264_adjacent_concat_equivalence')!;
    expect(scenario.requires.features).toContain('trim:compose');
    expect(scenario.options).toMatchObject({ a: 2_000_000, b: 5_000_000, c: 9_000_000 });
    expect(scenario.oracles).toContain('property-invariant');
  });

  test('adjacent composition passes, representation changes DIFF, overlap and hole fail', () => {
    const direct = compositionPresentation();
    expect(assessTrimComposition({ contract, direct, concatenated: direct, timestampToleranceUs: 0 })).toMatchObject({
      verdict: 'PASS', reasonCode: 'TRIM_COMPOSITION_SEMANTIC_MATCH',
    });
    expect(assessTrimComposition({
      contract, direct, concatenated: direct, timestampToleranceUs: 0,
      representationDifferences: ['legal NAL grouping'],
    })).toMatchObject({ verdict: 'PASS', reasonCode: 'TRIM_COMPOSITION_REPRESENTATION_DIFFERENCE' });
    const overlap = clonePresentation(direct);
    overlap.tracks[0]!.samples[2]!.ptsUs = 1_500_000;
    expect(assessTrimComposition({ contract, direct, concatenated: overlap, timestampToleranceUs: 0 })).toMatchObject({ verdict: 'FAIL' });
    const hole = clonePresentation(direct);
    hole.tracks[0]!.samples[2]!.ptsUs = 2_500_000;
    expect(assessTrimComposition({ contract, direct, concatenated: hole, timestampToleranceUs: 0 })).toMatchObject({ verdict: 'FAIL' });
  });

  test('harness executes three trims serially, concatenates, and observes both sides', async () => {
    const calls: string[] = [];
    const observation = await executeTrimComposition({
      source: 'source', contract,
      async trim(_source, range) {
        calls.push(`trim:${range.startUs}-${range.endUs}`);
        return `${range.startUs}-${range.endUs}`;
      },
      async concat(segments) {
        calls.push(`concat:${segments.join('+')}`);
        return 'concat';
      },
      async observe(segment) {
        calls.push(`observe:${segment}`);
        return compositionPresentation();
      },
    });
    expect(observation.concatenated).toBe('concat');
    expect(calls.slice(0, 4)).toEqual([
      'trim:0-2000000', 'trim:2000000-4000000', 'trim:0-4000000',
      'concat:0-2000000+2000000-4000000',
    ]);
  });
});

function semanticTrack(
  identity: string,
  type: SemanticTrimTrack['type'],
  samples: SemanticTrimSample[],
): SemanticTrimTrack {
  return { identity, type, codecCanonical: type === 'video' ? 'h264' : 'aac', samples };
}

function sample(ptsUs: number, durationUs: number, contentDigest: string): SemanticTrimSample {
  return { ptsUs, durationUs, contentDigest };
}

function semanticPresentation(): TrimSemanticPresentation {
  return {
    durationUs: 2_000_000,
    tracks: [
      semanticTrack('main-video', 'video', [sample(0, 1_000_000, 'v0'), sample(1_000_000, 1_000_000, 'v1')]),
      semanticTrack('main-audio', 'audio', [sample(0, 1_000_000, 'a0'), sample(1_000_000, 1_000_000, 'a1')]),
      semanticTrack('commentary', 'audio', [sample(0, 1_000_000, 'c0'), sample(1_000_000, 1_000_000, 'c1')]),
    ],
    metadata: { title: 'identity source' },
  };
}

function compositionPresentation(): TrimSemanticPresentation {
  const frames = ['0', '1', '2', '3'].map((digest, index) => sample(index * 1_000_000, 1_000_000, digest));
  return { durationUs: 4_000_000, tracks: [semanticTrack('main-video', 'video', frames)] };
}

function clonePresentation(value: TrimSemanticPresentation): {
  durationUs: number;
  tracks: Array<{
    identity: string;
    type: SemanticTrimTrack['type'];
    codecCanonical: string;
    samples: Array<{ ptsUs: number; durationUs: number; contentDigest: string }>;
  }>;
  metadata?: Record<string, string>;
} {
  return structuredClone(value) as ReturnType<typeof clonePresentation>;
}

function videoConfig(role: 'video-decoder' | 'video-encoder'): ConcreteWebCodecsConfig {
  return role === 'video-decoder'
    ? { role, config: { codec: 'avc1.640028', codedWidth: 1920, codedHeight: 1080 } }
    : { role, config: { codec: 'avc1.640028', width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 } };
}

function findAscii(bytes: Uint8Array, value: string): number {
  const needle = new TextEncoder().encode(value);
  outer: for (let offset = 0; offset + needle.byteLength <= bytes.byteLength; offset++) {
    for (let index = 0; index < needle.byteLength; index++) {
      if (bytes[offset + index] !== needle[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

function rewriteFlacTotalSamples(bytes: Uint8Array<ArrayBuffer>, totalSamples: number): Uint8Array<ArrayBuffer> {
  const copy = bytes.slice();
  // fLaC(4) + STREAMINFO header(4) + STREAMINFO packed timing starts after 10 body bytes.
  const offset = 18;
  let packed = 0n;
  for (let index = 0; index < 8; index++) packed = (packed << 8n) | BigInt(copy[offset + index]!);
  packed = (packed & ~0xfffffffffn) | BigInt(totalSamples);
  for (let index = 7; index >= 0; index--) {
    copy[offset + index] = Number(packed & 0xffn);
    packed >>= 8n;
  }
  return copy;
}
