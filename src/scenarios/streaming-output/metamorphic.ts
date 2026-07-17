/**
 * src/scenarios/streaming-output/metamorphic.ts — the cross-output-shape metamorphic invariants
 * (§A.16: "decode(remux(x))==decode(x)" and "probe(remux(x)).dur≈probe(x).dur").
 *
 * THE BUG THIS WOULD HAVE CAUGHT: every streaming-output shape (buffer / stream / fragmented / faststart)
 * is a lossless sample COPY, so all must decode to BIT-IDENTICAL frames and probe to the SAME duration —
 * only their CONTAINER STRUCTURE may differ. The runner forwards the shape knobs, so these invariants
 * assert the decode/duration equality across genuinely requested output modes and catch a shape variant
 * that silently corrupts samples or duration.
 *
 * ORACLE ROUTING (substring match in oracles.ts `propertyInvariant`, see remux/metamorphic.ts header):
 *   - DECODE token must contain "decode"/"remux" → routes to the decode-frames branch (VIDEO-only,
 *     needs baked <asset>.frames.json; a pending golden ⇒ clean golden-absent FAIL, never a crash).
 *     Used ONLY for progressive-mp4 shapes the platform inline demux can parse (buffer / stream) — NOT
 *     fragmented (the inline mp4 demux is progressive-only; fragmented decode equality is handled, and
 *     its blocker documented, in ./fragmented-faststart.ts).
 *   - DURATION token must contain "duration"/"probe" and NEITHER "decode" NOR "remux" → routes to the
 *     probe-duration branch (video AND audio; reference-probes ctx.output duration vs golden). Used
 *     across buffer / stream / faststart shapes — works for every shape today.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildStreamPropertyAll, type StreamPropertyCase } from './_shared.ts';

// Token that routes to the DECODE branch (contains 'decode').
const DECODE_REMUX = 'decode(remux(x))==decode(x)';
// Token that routes to the PROBE-DURATION branch (contains 'duration', not 'decode'/'remux'); the
// human phrasing 'probe(remux_*(x)).dur≈probe(x).dur' lives in notes.
const PROBE_DUR = 'probe-duration';

const PROPERTY_CASES: StreamPropertyCase[] = [
  // ── decode(remux_SHAPE(x)) == decode(x): lossless sample copy across the two progressive shapes ──
  {
    id: 'prop_decode_equals_buffer_shape',
    invariant: DECODE_REMUX,
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['streaming:decode-equality'],
    shape: { container: 'mp4', fastStart: false, target: 'buffer' },
    notes:
      'decode(remux_buffer(x))==decode(x): the progressive BufferTarget output must decode to frames ' +
      'bit-identical to the source decode (lossless re-wrap). The reference point for the stream-shape equality.',
  },
  {
    id: 'prop_decode_equals_stream_shape',
    invariant: DECODE_REMUX,
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['streaming:decode-equality'],
    shape: { container: 'mp4', target: 'stream', fragmented: false, fastStart: false },
    notes:
      'decode(remux_stream(x))==decode(x): the StreamTarget output must decode IDENTICALLY to the buffer ' +
      'output and the source — proving the streaming write path is the same lossless sample copy, only the ' +
      'bytes leave incrementally. Directly gates §A.16 decode-equality across output shapes; would flag a ' +
      'stream path that drops/reorders samples while honoring the requested shape knobs.',
  },

  // ── probe(remux_SHAPE(x)).dur ≈ probe(x).dur across buffer / stream / faststart shapes ────────────
  {
    id: 'prop_probe_dur_buffer_shape',
    invariant: PROBE_DUR,
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', fastStart: false, target: 'buffer' },
    tolerances: { durationToleranceSec: 0.125 },
    notes: 'probe(remux_buffer(x)).dur≈probe(x).dur: the buffered output must report the source duration.',
  },
  {
    id: 'prop_probe_dur_stream_shape',
    invariant: PROBE_DUR,
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'stream', fragmented: false, fastStart: false },
    tolerances: { durationToleranceSec: 0.125 },
    notes:
      'probe(remux_stream(x)).dur≈probe(x).dur: streaming the output incrementally must not change the ' +
      'reported duration vs the buffered/source duration. The duration-side cross-shape invariant.',
  },
  {
    id: 'prop_probe_dur_fragmented_shape',
    invariant: PROBE_DUR,
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', fragmented: true, target: 'buffer' },
    features: ['fragmented'],
    tolerances: { durationToleranceSec: 0.125 },
    notes:
      'probe(remux_fragmented(x)).dur≈probe(x).dur: a fragmented/CMAF (moof/mdat) output legitimately ' +
      'grows (per-fragment moof overhead) but must report the SAME duration as the source. The duration ' +
      'invariant is paired with mp4-box-layout for top-level moov/moof/mdat structure. Deeper MSE ' +
      'appendability remains a separate oracle gap (reference engine probes fMP4, dossier §A.2).',
  },
];

export const streamingMetamorphicScenarios: Scenario[] = buildStreamPropertyAll(PROPERTY_CASES);

export default streamingMetamorphicScenarios;
