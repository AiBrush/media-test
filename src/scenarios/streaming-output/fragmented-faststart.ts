/**
 * src/scenarios/streaming-output/fragmented-faststart.ts — the MP4 output-shape variants the legacy
 * battery missed: fastStart progressive (moov-first), the fastStart:false control (moov-last), and a
 * fragmented-vs-non-fragmented decode-equality metamorphic. (§A.3 / §A.10 / §A.16)
 *
 * mediabunny exposes FOUR distinct ISOBMFF output shapes (dossier mediabunny.md §5 / §A.3,
 * IsobmffOutputFormatOptions.fastStart): false | 'in-memory' (moov-first, buffered second pass) |
 * 'reserve' (reserve forward moov + patch in place, needs maximumPacketCount) | 'fragmented' (fMP4).
 * The legacy battery cased ONLY 'reserve' and 'fragmented'. This file adds the two missing shapes plus
 * the cross-shape metamorphic, and documents the STRUCTURE assertions that need a new oracle.
 *
 * ── WHAT IS HONESTLY GATED TODAY ────────────────────────────────────────────────────────────────
 *   - faststart_in_memory (moov-first progressive) and faststart_none (moov-last default) are both
 *     structurally gated by mp4-box-layout plus reference-reimport; a probe-duration invariant gates
 *     that relocating/placing the moov did not change reported duration.
 *   - frag_vs_nonfrag_decode_equality uses 'decode(remux(x))==decode(x)' — BUT the platform inline mp4
 *     demux is progressive-only (cannot parse moof), so this metamorphic is authored against the
 *     NON-FRAGMENTED (buffer) shape so it actually runs today; it proves the lossless-sample-copy
 *     premise the fragmented case shares. (When a fragmented-aware decode path exists, flip its shape.)
 *
 * ── WHAT STILL NEEDS DEEPER ORACLE WORK (OUT OF THIS WRITER'S SCOPE) ────────────────────────────
 * These are documented here, NOT emitted as fake-passing cases (§0.1: a placeholder that silently
 * passes is worse than an honest gap):
 *   - FULL fragmented/CMAF split semantics (§A.16): mp4-box-layout now asserts top-level moov +
 *     moof/mdat presence/order, but does not yet prove each fragment is independently parseable or
 *     MSE SourceBuffer.appendBuffer-playable. That needs an MSE append oracle.
 *   - fastStart:'reserve' LARGE FORWARD SEEK (§A.16, the promised-but-unimplemented one): drive the
 *     remux through a positioned/sparse target so the engine reserves a forward moov, writes mdat, then
 *     seeks BACK to patch the reserved region; assert the reserved region was written exactly once at a
 *     forward position and the final moov precedes mdat. CountingTarget (measure.ts) supports positioned
 *     writes but nothing threads it into the remux op or inspects the seek.
 *   - reserve OVERFLOW / UNDERFLOW (§A.16): overflow (maximumPacketCount < actual) must fail GRACEFULLY
 *     (graceful-failure) or transparently fall back, never produce a truncated moov; underflow (huge
 *     reservation) must still re-import + play with no orphaned bytes. Both require the runner to
 *     FORWARD a deliberately too-small maximumPacketCount to the adapter and assert the outcome. The
 *     runner now forwards the option bag; the missing piece is the targeted overflow/underflow oracle
 *     and fixture case rather than a placeholder that would silently pass.
 */

import type { Scenario } from '../../core/scenario.ts';
import {
  buildStreamAll,
  buildStreamPropertyAll,
  type StreamCase,
  type StreamPropertyCase,
} from './_shared.ts';

// ── Output-shape cases (progressive mp4 variants — structurally gated today) ─────────────────────
const SHAPE_CASES: StreamCase[] = [
  {
    id: 'mp4_faststart_in_memory',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', fastStart: 'in-memory', target: 'buffer' },
    features: ['fastStart:in-memory'],
    notes:
      'fastStart PROGRESSIVE (moov-first): mediabunny fastStart:"in-memory" relocates moov to the front ' +
      'after a buffered second pass (progressive-download friendly) — a DISTINCT mode from in-place ' +
      '"reserve". reference-reimport gates that the relocated-moov output re-imports. The moov-BEFORE-' +
      'mdat position check needs a box-offset oracle (see file header).',
  },
  {
    id: 'mp4_faststart_none_control',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', fastStart: false, target: 'buffer' },
    notes:
      'fastStart:false CONTROL (moov-LAST, mdat-first): the default placement. The negative contrast ' +
      'proving fastStart/reserve actually MOVED/reserved the moov — without this control there is no ' +
      'baseline for the moov-first cases. reference-reimport gates that the default output is valid; ' +
      'the moov-AFTER-mdat position check needs a box-offset oracle (see file header).',
  },
];

// ── Cross-shape metamorphic: the lossless-sample-copy premise the fragmented case depends on ──────
// Authored against the NON-FRAGMENTED (buffer) shape because the platform inline mp4 demux is
// progressive-only; this proves decode(remux(x))==decode(x) for the mp4 output the fragmented variant
// shares samples with. The fragmented-shape decode equality is blocked on a fragmented-aware decode
// path (see file header) and is NOT faked here.
const PROPERTY_CASES: StreamPropertyCase[] = [
  {
    id: 'prop_frag_premise_decode_equality_mp4',
    invariant: 'decode(remux(x))==decode(x)',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'buffer' },
    features: ['streaming:decode-equality'],
    notes:
      'Lossless-sample-copy premise for the fragmented/CMAF path: decode(remux(x))==decode(x) proves a ' +
      'plain mp4 remux preserves every decoded frame. The fragmented output copies the SAME coded ' +
      'samples, so its decoded frames must match identically — once a moof-aware decode path lets the ' +
      'oracle decode fMP4 directly, re-point this case at shape.fragmented=true. (Needs baked ' +
      'h264_1080p_30s.mp4.frames.json; a pending golden ⇒ clean golden-absent FAIL, never a crash.)',
  },
  {
    id: 'prop_faststart_in_memory_duration_invariant',
    invariant: 'probe-duration',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', fastStart: 'in-memory', target: 'buffer' },
    features: ['fastStart:in-memory'],
    tolerances: { durationToleranceSec: 0.125 },
    notes:
      'probe(remux_faststart(x)).dur≈probe(x).dur: relocating the moov to the front (progressive ' +
      'fastStart) must not change the reported duration. Works for the moov-first shape today (probe ' +
      'reads the container header, which a relocated moov still carries).',
  },
  {
    id: 'prop_faststart_reserve_duration_invariant',
    invariant: 'probe-duration',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', fastStart: 'reserve', target: 'stream', maximumPacketCount: 4096 },
    features: ['fastStart:reserve'],
    tolerances: { durationToleranceSec: 0.125 },
    notes:
      'probe(remux_reserve(x)).dur≈probe(x).dur: a reserved-forward-moov output (fastStart:"reserve", ' +
      'maximumPacketCount per track) must report the same duration as the source. The duration-side gate ' +
      'for reserve; the forward-seek/patch STRUCTURE and overflow/underflow edges need new machinery ' +
      '(see file header).',
  },
];

export const streamingFragmentedFastStartScenarios: Scenario[] = [
  ...buildStreamAll(SHAPE_CASES),
  ...buildStreamPropertyAll(PROPERTY_CASES),
];

export default streamingFragmentedFastStartScenarios;
