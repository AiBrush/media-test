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

const DISABLED_CELLS: DisabledCell[] = [
  {
    engineId: 'remotion-media-parser@4.0.479',
    scenarioId: 'demux/size_huge_huge_h264_1080p_600s',
    reason: 'disabled: it takes so much time',
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
    engineId: 'remotion-webcodecs@4.0.479',
    scenarioId: 'decode-seek/decode_size_huge_h264_600s',
    reason:
      'decode of the 600s huge h264 fixture exceeds the 120s op budget: remotion-webcodecs parses via ' +
      '@remotion/media-parser, whose full-file scan on this 600s asset is the same slowness already ' +
      'tracked as disabled for remotion-media-parser demux/size_huge_huge_h264_1080p_600s. platform and ' +
      'mediabunny decode it within budget; ffmpeg.wasm honestly NAs it — this is a per-engine scale limit.',
  },
  {
    engineId: 'remotion-webcodecs@4.0.479',
    scenarioId: 'streaming-output/buffer_massive_h264_mp4',
    reason:
      'real Chromium no-reuse run on 2026-06-22 timed out after the 120s op budget while buffering the ' +
      '2h massive H.264 MP4 fixture through remotion-webcodecs bufferWriter. The paired massive stream ' +
      'row is already NA because this adapter does not declare target:writes, so this exact buffer rung ' +
      'is a tracked per-engine scale limit rather than a conformance path to rerun in every full matrix.',
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
