/**
 * src/scenarios/streaming-output/metamorphic.ts — the cross-output-shape metamorphic invariants
 * (§A.16: "decode(remux(x))==decode(x)" and "probe(remux(x)).dur≈probe(x).dur").
 *
 * THE BUG THIS WOULD HAVE CAUGHT: every streaming-output shape (buffer / stream / fragmented / faststart)
 * is a lossless sample COPY, so all must decode to BIT-IDENTICAL frames and probe to the SAME duration —
 * only their CONTAINER STRUCTURE may differ. Because the runner currently drops the shape knobs, all
 * shapes presently produce the SAME bytes; these invariants assert the decode/duration equality that
 * holds regardless, and become the gate that catches a shape variant that silently corrupts samples or
 * duration once the shapes truly diverge.
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
    shape: { container: 'mp4', target: 'buffer' },
    notes:
      'decode(remux_buffer(x))==decode(x): the BufferTarget output must decode to frames bit-identical ' +
      'to the source decode (lossless re-wrap). The reference point for the stream-shape equality.',
  },
  {
    id: 'prop_decode_equals_stream_shape',
    invariant: DECODE_REMUX,
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'stream' },
    notes:
      'decode(remux_stream(x))==decode(x): the StreamTarget output must decode IDENTICALLY to the buffer ' +
      'output and the source — proving the streaming write path is the same lossless sample copy, only the ' +
      'bytes leave incrementally. Directly gates §A.16 decode-equality across output shapes; would flag a ' +
      'stream path that drops/reorders samples once the shape knobs are actually honored.',
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
    shape: { container: 'mp4', target: 'buffer' },
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
    shape: { container: 'mp4', target: 'stream' },
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
    shape: { container: 'mp4', fragmented: true, target: 'stream' },
    features: ['fragmented'],
    notes:
      'probe(remux_fragmented(x)).dur≈probe(x).dur: a fragmented/CMAF (moof/mdat) output legitimately ' +
      'grows (per-fragment moof overhead) but must report the SAME duration as the source. The duration ' +
      'invariant is the part of the fragmented contract observable WITHOUT a moof-structure oracle ' +
      '(reference engine probes fMP4, dossier §A.2); the structural init+media split is in ' +
      './fragmented-faststart.ts.',
  },
];

export const streamingMetamorphicScenarios: Scenario[] = buildStreamPropertyAll(PROPERTY_CASES);

export default streamingMetamorphicScenarios;
