/**
 * src/scenarios/remux/index.ts — Pillar 1, family "remux".
 *
 * Lossless container conversion: the coded bitstream is copied, only the wrapper changes. Because
 * pixels never re-encode, the strongest oracle is `decoded-frames-bitexact` (decode the output and
 * compare frame digests to golden), backed by `reference-reimport` (re-parse the output with the
 * reference engine and diff the packet table) and a `playback-smoke` (<video> can play it).
 *
 * Coverage is a cross-container matrix restricted to *lossless* pairs — a codec must be legal in
 * both source and target container. This index holds the BASE matrix; the symmetric-mesh completion
 * (§6), audio reverses/expansion (§A.3), the size axis (§5.3), the metamorphic invariants (§7/§A.16)
 * and the remux-targeted negatives are split into sibling files and concatenated below. All sub-
 * batteries emit identical scenario shapes via ./_shared.ts and stay one exported `remuxScenarios`.
 *
 * ORACLE NOTE (see ./_shared.ts header for the full rationale): for an op:'remux' scenario the runner
 * only runs engine.remux and exposes the result as ctx.output — it never probes/demuxes the output
 * into ctx.metadata/ctx.demux. So `golden-metadata`/`golden-packets` are NOT valid remux gates (they
 * read ctx.metadata/ctx.demux and always fail "absent"). AUDIO remux additionally cannot use
 * `decoded-frames-bitexact` (it digests RGBA video frames; there is no PCM oracle), so audio cases
 * gate on `reference-reimport` + `playback-smoke` and get their sample-fidelity proxy from a
 * property-invariant 'probe-duration' case in metamorphic.ts.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildRemuxAll, type RemuxCase } from './_shared.ts';
import { remuxAudioScenarios } from './audio.ts';
import { remuxMatrixScenarios } from './matrix.ts';
import { remuxMetamorphicScenarios } from './metamorphic.ts';
import { remuxNegativeScenarios } from './negative.ts';
import { remuxSizeLadderScenarios } from './size-ladder.ts';

/**
 * Base lossless cross-container matrix (the legacy battery). Each entry is a (source asset, target
 * container) pair where every track's codec is representable in the target without re-encoding. The
 * symmetric-mesh REVERSE/ROUND-TRIP cells and the previously-zero <->WebM video arm are added in
 * ./matrix.ts; the audio reverses/expansion in ./audio.ts.
 */
const REMUX_CASES: RemuxCase[] = [
  // ── H.264(+AAC) is portable across mp4 / mov / mkv / ts ──
  { asset: 'h264_1080p_30s.mp4', from: 'mp4', to: 'mov', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'h264_1080p_30s.mp4', from: 'mp4', to: 'mkv', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'h264_1080p_30s.mp4', from: 'mp4', to: 'ts', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'h264_1080p_5s.mov', from: 'mov', to: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'h264_in_mkv.mkv', from: 'mkv', to: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  {
    asset: 'h264_ts.ts',
    from: 'ts',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'TS->MP4: Annex-B -> AVCC bitstream conversion is still lossless (same coded samples).',
  },
  {
    asset: 'h264_bframes_1080p.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'B-frame reorder must survive the wrapper change: dts/pts spread preserved.',
  },
  {
    asset: 'h264_rotated90.mp4',
    from: 'mp4',
    to: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Rotation metadata (display matrix) must carry across to the new container.',
  },
  {
    asset: 'h264_multitrack.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'All tracks must survive remux; reference-reimport checks track count + per-track packets.',
  },
  {
    asset: 'hevc_1080p_10s.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['hevc'],
    audioCodecs: ['aac'],
    notes: 'HEVC is legal in mp4 and mkv (not in webm).',
  },

  // ── VP9 / VP8 / AV1 with Opus/Vorbis are portable across webm / mkv ──
  { asset: 'vp9_1080p_10s.webm', from: 'webm', to: 'mkv', videoCodecs: ['vp9'], audioCodecs: ['opus'] },
  { asset: 'vp8_720p_10s.webm', from: 'webm', to: 'mkv', videoCodecs: ['vp8'], audioCodecs: ['vorbis'] },
  { asset: 'av1_720p_5s.webm', from: 'webm', to: 'mkv', videoCodecs: ['av1'], audioCodecs: ['opus'] },
  {
    asset: 'av1_720p_5s.webm',
    from: 'webm',
    to: 'mp4',
    videoCodecs: ['av1'],
    audioCodecs: ['opus'],
    features: ['remux:av1-opus-in-mp4'],
    notes: 'AV1 + Opus are both legal in mp4 — lossless remux out of webm.',
  },

  // ── Audio-only lossless remux (codec must be legal in target). ──
  // ORACLE FIX: these are AUDIO remuxes. `decoded-frames-bitexact` decodes to RGBA video frames and
  // the audio golden ships no frames.json, so it FAILed unconditionally and gated nothing; and a
  // remux op never populates ctx.metadata so `golden-metadata` is inapplicable too. The honest gate
  // is reference-reimport + playback-smoke (set as the default audio oracle set in _shared.ts), with
  // the sample-fidelity proxy provided by the metamorphic 'probe-duration' cases (metamorphic.ts).
  {
    asset: 'aac_adts.aac',
    from: 'adts',
    to: 'mp4',
    audioCodecs: ['aac'],
    notes: 'ADTS AAC -> MP4(.m4a): strip ADTS headers, wrap raw AAC — lossless.',
  },
  {
    asset: 'mp3_xing.mp3',
    from: 'mp3',
    to: 'mp4',
    audioCodecs: ['mp3'],
    features: ['remux:mp3-in-mp4'],
    notes: 'MP3 is legal in MP4 — lossless audio remux.',
  },
  {
    asset: 'flac_seektable.flac',
    from: 'flac',
    to: 'mkv',
    audioCodecs: ['flac'],
    notes: 'FLAC -> MKV: lossless audio re-wrap; SEEKTABLE dropped, samples identical.',
  },
  {
    asset: 'opus.ogg',
    from: 'ogg',
    to: 'webm',
    audioCodecs: ['opus'],
    notes: 'Opus OGG -> WebM: lossless audio re-wrap into Matroska/WebM.',
  },
];

const baseRemuxScenarios: Scenario[] = buildRemuxAll(REMUX_CASES);

/** The whole remux family: base matrix + mesh completion + audio + size axis + metamorphic + negatives. */
export const remuxScenarios: Scenario[] = [
  ...baseRemuxScenarios,
  ...remuxMatrixScenarios,
  ...remuxAudioScenarios,
  ...remuxSizeLadderScenarios,
  ...remuxMetamorphicScenarios,
  ...remuxNegativeScenarios,
];

export default remuxScenarios;
