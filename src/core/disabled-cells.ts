/**
 * Exact engine/scenario cells intentionally disabled by suite policy.
 *
 * Keep this outside scenario definitions so scenarios stay engine-independent: a disabled cell is a
 * runner decision about one engine's practicality for one case, not a change to the case itself.
 */

export interface DisabledCell {
  engineId: string;
  scenarioId: string;
  reason: string;
}

/**
 * A known operation that cannot be safely entered because it blocks the browser event loop before
 * Promise.race's timer can run. Unlike DisabledCell, this is an applicable FAIL: the runner emits a
 * timeout outcome immediately instead of reporting SKIPPED or invoking the non-preemptible call.
 */
export interface ForcedTimeoutCell {
  engineId: string;
  scenarioId: string;
  timeoutMs: number;
  reason: string;
}

const FORCED_TIMEOUT_CELLS: ForcedTimeoutCell[] = [
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'demux/graceful_webm_header_destroyed',
    timeoutMs: 15_000,
    reason:
      'Remotion media-parser blocks the main thread while walking the corrupted WebM, so the normal timer cannot preempt the operation',
  },
];

const DISABLED_CELLS: DisabledCell[] = [
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'demux/size_huge_huge_h264_1080p_600s',
    reason:
      'disabled: Remotion packet callbacks walk the complete 600-second file and exceed the practical browser-run budget',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'demux/size_massive_massive_h264_1080p_2h',
    reason: 'disabled: demuxing the 2-hour massive H.264 fixture takes too long',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'performance/size-ladder-iterate-packets-huge',
    reason:
      'disabled: iterating packets for the huge H.264 fixture exceeded the 300-second operation budget',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'performance/size-ladder-demux-peak-memory-huge',
    reason: 'disabled: the huge H.264 peak-memory demux took more than four minutes',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'demux/graceful_mp4_header_destroyed',
    reason: 'disabled: it takes forever',
  },
  {
    engineId: 'web-demuxer@4.0.0',
    scenarioId: 'robustness/edge_ts_pts_wraparound_demux',
    reason:
      'web-demuxer probes normal MPEG-TS correctly (probe/h264_ts PASSes) but mis-derives the video ' +
      'frame rate (reports 240 fps vs the golden 30) on this PTS-WRAPAROUND TS fixture: the 33-bit PTS ' +
      'rollover corrupts its inter-frame-interval fps estimate. The container is supported; the ' +
      'wraparound edge fps derivation is a tracked engine limitation, so this one cell is skipped.',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'decode-seek/decode_size_huge_h264_600s',
    reason:
      'decode of the 600s huge h264 fixture exceeds the 120s op budget: the unified Remotion stack ' +
      'parses via @remotion/media-parser, whose full-file scan on this 600s asset is the same slowness ' +
      'already tracked for Remotion demux/size_huge_huge_h264_1080p_600s. platform and ' +
      'mediabunny decode it within budget; ffmpeg.wasm honestly NAs it — this is a per-engine scale limit.',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'streaming-output/buffer_massive_h264_mp4',
    reason:
      'real Chromium no-reuse run on 2026-06-22 timed out after the 120s op budget while buffering the ' +
      '2h massive H.264 MP4 fixture through @remotion/webcodecs bufferWriter. The paired massive stream ' +
      'row is already NA because this adapter does not declare target:writes, so this exact buffer rung ' +
      'is a tracked per-engine scale limit rather than a conformance path to rerun in every full matrix.',
  },
  // @remotion/media-parser must scan WebM clusters to derive full metadata such as FPS. Keep the
  // smaller WebM probes, but do not let the scale rungs monopolize an otherwise multi-engine run.
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'probe/large_vp9_1080p_120s',
    reason:
      'disabled: Remotion WebM metadata/FPS extraction scans the 120-second file and is too slow for the shared matrix',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'probe/huge_vp9_1080p_240s',
    reason:
      'disabled: Remotion WebM metadata/FPS extraction scans the 240-second file and is too slow for the shared matrix',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'probe/massive_vp9_1080p_2h',
    reason:
      'disabled: Remotion WebM metadata/FPS extraction scans the two-hour fixture and does not finish in a practical time',
  },
  // Full packet iteration, decode, transcode, and buffer-all conversion are linear in the media
  // length. These retain smaller coverage rungs; the skipped cells are honest scale-limit N/As.
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'demux/size_large_large_h264_1080p_120s',
    reason:
      'disabled: full Remotion sample-callback demux of the 120-second H.264 fixture is too slow when correctness and benchmark passes repeat it',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'demux/size_large_large_vp9_1080p_120s',
    reason:
      'disabled: full Remotion sample-callback demux of the 120-second VP9 fixture is too slow when correctness and benchmark passes repeat it',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'performance/size-ladder-iterate-packets-large',
    reason:
      'disabled: repeated full packet iteration of the 120-second fixture takes too long with Remotion',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'performance/size-ladder-iterate-packets-massive',
    reason:
      'disabled: repeated full packet iteration of the two-hour fixture exceeds the practical run budget with Remotion',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'performance/size-ladder-demux-peak-memory-large',
    reason:
      'disabled: repeated full demux of the 120-second fixture for memory measurement takes too long with Remotion',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'remux/huge_h264_1080p_600s_mov_to_mp4',
    reason:
      'disabled: official convertMedia must parse and buffer the 600-second MOV output; the removed header-rewrite shortcut is not an admissible framework path',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'transcode/ladder_large_h264_1080p_120s_resize_720p',
    reason:
      'disabled: decoding, resizing, and re-encoding the complete 120-second H.264 fixture takes too long with Remotion',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'transcode/ladder_large_vp9_1080p_120s_to_h264_720p',
    reason:
      'disabled: decoding and re-encoding the complete 120-second VP9 fixture takes too long with Remotion',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'decode-seek/decode_size_large_h264_120s',
    reason:
      'disabled: Remotion decode setup/sample traversal on the 120-second H.264 scale rung takes too long',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'decode-seek/decode_size_large_vp9_120s',
    reason:
      'disabled: Remotion decode setup/sample traversal on the 120-second VP9 scale rung takes too long',
  },
  {
    engineId: 'remotion@4.0.479',
    scenarioId: 'audio-dsp/edge_longform_audio_resample_16k',
    reason:
      'disabled: resampling the complete one-hour PCM fixture through Remotion WebCodecs/WAV conversion exceeds the practical run budget',
  },
  {
    engineId: 'mediabunny@1.48.0',
    scenarioId: 'probe/cenc_ctr',
    reason:
      'mediabunny@1.48.0 WASM-aborts ("Assertion failed.") while parsing this CENC-CTR fixture ' +
      '(cenc_ctr.mp4); it probes cenc_cbcs.mp4 and every other corpus file fine, and ffmpeg.wasm ' +
      'reads/decrypts cenc_ctr.mp4 correctly, so the fixture is valid — this is a tracked engine ' +
      'limitation on the cenc-ctr container, not a suite/fixture defect.',
  },
];

export function disabledCellReason(engineId: string, scenarioId: string): string | undefined {
  return DISABLED_CELLS.find((cell) => cell.engineId === engineId && cell.scenarioId === scenarioId)?.reason;
}

export function forcedTimeoutCell(
  engineId: string,
  scenarioId: string,
): ForcedTimeoutCell | undefined {
  return FORCED_TIMEOUT_CELLS.find(
    (cell) => cell.engineId === engineId && cell.scenarioId === scenarioId,
  );
}
