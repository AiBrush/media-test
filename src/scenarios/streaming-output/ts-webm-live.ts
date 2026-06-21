/**
 * src/scenarios/streaming-output/ts-webm-live.ts — MPEG-TS continuity/repetition under tiny writes,
 * and the headerless/"live" Matroska(WebM) streaming profile. (§A.16)
 *
 * The legacy ts_tiny_writes case covered small-WRITE GRANULARITY only; it asserted nothing about TS
 * CONTINUITY-COUNTER correctness across many tiny writes, nor PAT/PMT repetition for a mid-stream join.
 * And webm_streaming_target covered only the NORMAL (Segment-Duration) WebM — there was no headerless
 * unknown-duration cluster-streaming profile (the §A.16 headerless-MediaRecorder neighbor) whose
 * streamed output must still be parseable as an append-only WebM without a SeekHead or Segment
 * Duration.
 *
 * ── HONEST GATES TODAY ──────────────────────────────────────────────────────────────────────────
 *   - TS cases: reference-reimport (mediabunny reads MPEG_TS, dossier §A.2). If the continuity_counter
 *     were non-monotonic, or PAT/PMT were missing/not repeated, the reference demuxer's re-parse would
 *     drop/misorder packets → packet-count / keyframe divergence vs golden → FAIL. This is a genuine,
 *     observable correctness gate on TS streaming integrity. A probe-duration invariant additionally
 *     gates that the streamed TS yields a sane duration (TS is estimate-only → loose band in oracles.ts).
 *     NOT gated by playback-smoke (raw TS is not reliably plain-<video>-playable cross-browser).
 *   - Headerless/live WebM: reference-reimport (mediabunny computeDuration reads headerless WebM,
 *     dossier §A.16), a WebM-live layout oracle (unknown-size Segment, no SeekHead, no Segment
 *     Duration), and a probe-duration invariant (loose recorder-webm band). NOT playback-smoke (a
 *     live-style WebM may not play in a plain <video src=blob> → false-FAIL risk). The genuine MSE
 *     appendability proof (feed the segments through SourceBuffer.appendBuffer) needs an MSE playback
 *     oracle that does not exist in oracles.ts (out of this writer's scope).
 *
 * ── NEEDS NEW MACHINERY (documented, not faked) ─────────────────────────────────────────────────
 *   - 188-byte WRITE-GRANULARITY invariant (§A.16): assert targetWrites is MANY (≈ bytesOut/188) and
 *     each write is 188-byte-aligned. Requires the runner to thread a CountingTarget through the remux
 *     op (measure.ts has CountingTarget; runOne's bench ctx never instantiates it). Until then
 *     targetWrites is blank and no write-count/alignment assertion is possible.
 *   - TS PTS/DTS 33-bit WRAPAROUND mid-stream (§A.16): stream a TS whose clock wraps in tiny writes and
 *     assert continuity counters stay monotonic and the re-import handles the wrap without a duration
 *     blow-up. Needs a corpus asset that actually wraps the clock (none in the manifest) AND the tiny-
 *     write path forwarded to the adapter. Deferred with this dependency rather than faked.
 */

import type { Scenario } from '../../core/scenario.ts';
import {
  buildStreamAll,
  buildStreamPropertyAll,
  type StreamCase,
  type StreamPropertyCase,
} from './_shared.ts';

const SHAPE_CASES: StreamCase[] = [
  {
    id: 'ts_continuity_many_writes',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'ts', target: 'stream', writeChunkBytes: 188 },
    // reference-reimport ONLY (raw TS not reliably plain-<video>-playable; duration estimate-only).
    oracles: ['reference-reimport'],
    notes:
      'MPEG-TS continuity across many tiny 188-byte writes: reference-reimport re-parses the streamed TS, ' +
      'so a non-monotonic continuity_counter or missing/un-repeated PAT/PMT shows up as dropped/misordered ' +
      'packets vs golden. Gates TS-streaming integrity; the explicit per-write 188-byte-alignment count ' +
      'needs CountingTarget wiring (see file header).',
  },
  {
    id: 'webm_headerless_live_stream',
    asset: 'recorder_headerless.webm',
    from: 'webm',
    to: 'webm',
    videoCodecs: ['vp8'],
    audioCodecs: ['opus'],
    shape: { container: 'webm', target: 'stream', appendOnly: true },
    features: ['headerless'],
    // reference-reimport ONLY (a headerless/live WebM may not plain-<video>-play; MSE-appendability
    // proof needs an MSE oracle that does not exist — see file header).
    oracles: ['reference-reimport'],
    notes:
      'Headerless / "live" Matroska(WebM) streaming output (append-only unknown-size Segment, no ' +
      'SeekHead or Segment Duration): the streamed output must still be parseable. reference-reimport ' +
      'and webm-live-layout gate it.',
  },
];

const PROPERTY_CASES: StreamPropertyCase[] = [
  {
    id: 'prop_ts_stream_duration_materialized',
    invariant: 'probe-duration',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'ts', target: 'stream', writeChunkBytes: 188 },
    tolerances: { durationToleranceSec: 0.125 },
    notes:
      'probe(remux_ts_stream(x)).dur≈probe(x).dur: a TS streamed in tiny writes must still yield a sane ' +
      'duration on re-probe. MPEG-TS has no global duration (estimate-only → loose band in oracles.ts), ' +
      'so this gates that the tiny-write TS output is not duration-corrupt.',
  },
  {
    id: 'prop_webm_headerless_duration_materialized',
    invariant: 'probe-duration',
    asset: 'recorder_headerless.webm',
    from: 'webm',
    to: 'webm',
    videoCodecs: ['vp8'],
    audioCodecs: ['opus'],
    shape: { container: 'webm', target: 'stream', appendOnly: true },
    features: ['headerless'],
    notes:
      'probe(remux_headerless_stream(x)).dur≈probe(x).dur: a headerless/live WebM streamed output must ' +
      'probe to a sane duration despite having no Segment Duration (loose recorder-webm band in ' +
      'oracles.ts). The duration-side gate for the live profile.',
  },
];

export const streamingTsWebmLiveScenarios: Scenario[] = [
  ...buildStreamAll(SHAPE_CASES),
  ...buildStreamPropertyAll(PROPERTY_CASES),
];

export default streamingTsWebmLiveScenarios;
