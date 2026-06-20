/**
 * src/scenarios/mux/negative.ts — illegal / degenerate mux inputs (graceful-failure, §A.16 §7).
 *
 * The mux family declared NO negative oracle and NO illegal-mux inputs (those lived only in robustness/
 * for PARSE ops, never for the mux WRITE op). §A.16 expects illegal-mux handling:
 *   - mux a codec into a container that CANNOT hold it (H.264 → wav, H.264 → ogg, VP9 → adts) must
 *     fail CLEANLY — not emit a garbage file that later "round-trips".
 *   - mux with ZERO tracks / empty EncodedTracks must reject, not emit a 0-byte/garbage container.
 *
 * HOW THESE GATE (oracles.ts gracefulFailure + runner.ts runRobustness):
 *   The `graceful-failure` oracle routes each case through runner.runRobustness, which expects the op
 *   to throw/reject within `timeoutMs`. It PASSes iff NO output was produced (a clean throw/reject),
 *   FAILs on a crash/hang/timeout or on output emitted from a clearly-illegal mux.
 *
 * NEGOTIATION NOTE (why these reach the mux at all): negotiate() checks declared containerOut and
 * codec SEPARATELY — it does NOT model codec-in-container legality. An engine that declares BOTH `wav`
 * output and `h264` video passes negotiation, then its mux() must itself reject H.264-into-WAV. An
 * engine that does NOT declare `wav` (or the codec) cleanly NA's — also a correct outcome (it never
 * claims the illegal combo). Either way no false PASS: the only way to PASS is a clean rejection.
 *
 * The illegal-target containers below are deliberately ones at least one engine DOES declare as a
 * write target (mediabunny containersOut includes wav/ogg/adts) so the case actually exercises the
 * muxer's codec/container guard rather than resolving to NA for everyone.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildMuxNegativeAll, type MuxNegativeCase } from './_shared.ts';

const MUX_NEG_TIMEOUT_MS = 15_000;

const NEGATIVE_CASES: MuxNegativeCase[] = [
  // ── Illegal codec → container: H.264 video into audio-only / PCM containers ──
  {
    id: 'neg_h264_into_wav_illegal',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'wav',
    videoCodecs: ['h264'],
    notes:
      'ILLEGAL mux H.264 → wav (§A.16 mismatched container/codec): WAV is PCM-audio-only and cannot ' +
      'carry an H.264 video track. The muxer must reject cleanly (throw/reject) within the timeout — ' +
      'never emit a garbage WAV that later "round-trips".',
  },
  {
    id: 'neg_h264_into_ogg_illegal',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'ogg',
    videoCodecs: ['h264'],
    notes:
      'ILLEGAL mux H.264 → ogg (§A.16): OGG carries Opus/Vorbis/FLAC/Theora, not H.264/AVC. The mux ' +
      'must reject the unrepresentable codec cleanly rather than write an invalid OGG.',
  },
  {
    id: 'neg_vp9_into_adts_illegal',
    input: 'vp9_1080p_10s.webm',
    containersIn: ['webm'],
    to: 'adts',
    videoCodecs: ['vp9'],
    notes:
      'ILLEGAL mux VP9 → adts (§A.16): ADTS is a raw AAC elementary stream — it cannot hold a VP9 video ' +
      'track. The muxer must reject cleanly (no video payload is representable in ADTS).',
  },

  // ── Zero / empty tracks: a valid-but-empty source whose demux yields no codable samples ──
  {
    id: 'neg_zero_tracks_empty_audio_to_mp4',
    input: 'empty_audio.wav',
    containersIn: ['wav'],
    to: 'mp4',
    audioCodecs: ['pcm-s16'],
    notes:
      'ZERO-TRACK / EMPTY mux (§A.16 no-tracks / zero-length): empty_audio.wav is a valid WAV with an ' +
      'EMPTY data chunk → its demux yields a track with no samples. Muxing zero/empty EncodedTracks must ' +
      'reject (or emit nothing) cleanly, not produce a 0-byte/garbage mp4 that later "round-trips".',
  },
];

export const muxNegativeScenarios: Scenario[] = buildMuxNegativeAll(NEGATIVE_CASES);

export default muxNegativeScenarios;
