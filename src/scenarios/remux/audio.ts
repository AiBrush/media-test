/**
 * src/scenarios/remux/audio.ts — audio-only lossless remux reverses + expansion (spec §A.3).
 *
 * The legacy family had only FORWARD audio cases (adts->mp4, mp3->mp4, flac->mkv, opus.ogg->webm).
 * This file adds the REVERSE directions and the other legal pairs the corpus + reference engine
 * support. Spec §A.3 lists ADTS/AAC, MPEG-TS, WAV, Ogg as write targets; mediabunny WRITE confirms
 * ADTS (AdtsOutputFormat), Ogg, MPEG-TS (MpegTsOutputFormat), MKV, WebM, MP4 (dossier §A.3). It does
 * NOT support the AIFF/CAF/WAVE-as-remux-target *container* for compressed audio, and PCM remux into
 * those is not a coded-stream copy — so WAV/AIFF/CAF are deliberately NOT used as remux targets here
 * (adding them would be a guaranteed NA(engine)/over-claim, the §0.8 anti-pattern).
 *
 * ORACLE HONESTY (the gap this file closes): the legacy audio cases declared
 * `decoded-frames-bitexact`, whose golden is video-RGBA frame digests — there is NO PCM/decoded-audio
 * oracle in oracles.ts, and the audio golden ships only meta+packets (no frames). So that oracle
 * returns "no golden frame digests ... absent/empty" UNCONDITIONALLY → every audio remux case was a
 * guaranteed FAIL that gated nothing. Worse, `golden-metadata` is ALSO inapplicable to a remux op:
 * the runner only runs engine.remux and never probes the output into ctx.metadata, so golden-metadata
 * would FAIL with "no probe metadata on ctx.metadata".
 *
 * The oracles that actually OBSERVE a remux output are `reference-reimport` (re-parse ctx.output with
 * the reference engine; diff packet count/keyframes vs golden) and `playback-smoke` (<video> plays
 * ctx.output). Those are attached here as the real structural gate. The SAMPLE-fidelity gate for
 * audio (duration materialized from the re-wrapped coded stream) lives in metamorphic.ts as a
 * property-invariant 'probe-duration' case — the closest honest analogue of decode-remux for audio
 * until a dedicated decoded-PCM oracle exists.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildRemuxAll, type RemuxCase } from './_shared.ts';

const AUDIO_CASES: RemuxCase[] = [
  // ── Reverse of adts->mp4: MP4(AAC) -> ADTS. The corpus AAC-in-MP4 source is micro_audio_short.m4a.
  //    Wrapping raw AAC access units back into ADTS frames (re-adding ADTS headers) is lossless. ──
  {
    asset: 'micro_audio_short.m4a',
    from: 'mp4',
    to: 'adts',
    audioCodecs: ['aac'],
    notes:
      'MP4(AAC)->ADTS: reverse of adts->mp4. Re-emit ADTS frame headers around the raw AAC access ' +
      'units; coded samples identical. (mediabunny AdtsOutputFormat.)',
  },

  // ── Opus OGG -> MKV (the legacy forward target was webm; MKV is the superset Matroska target). ──
  {
    asset: 'opus.ogg',
    from: 'ogg',
    to: 'mkv',
    audioCodecs: ['opus'],
    notes: 'Opus OGG->MKV: lossless audio re-wrap into full Matroska (vs the WebM-restricted profile).',
  },

  // ── FLAC -> OGG: FLAC is a legal Ogg-mapped codec (Ogg FLAC). Reverse-ish of the flac->mkv cell,
  //    onto a different container family. mediabunny Ogg WRITE + FLAC codec → lossless re-wrap. ──
  {
    asset: 'flac_seektable.flac',
    from: 'flac',
    to: 'ogg',
    audioCodecs: ['flac'],
    notes: 'FLAC->OGG (Ogg-mapped FLAC): lossless re-wrap; SEEKTABLE/native-frame layout changes, samples identical.',
  },

  // ── AAC ADTS -> MPEG-TS audio: §A.3 lists MPEG-TS as a write target; an ADTS AAC elementary stream
  //    re-wrapped into a single-PID TS is lossless. Exercises the TS-audio remux target (none of the
  //    legacy audio cases targeted TS). ──
  {
    asset: 'aac_adts.aac',
    from: 'adts',
    to: 'ts',
    audioCodecs: ['aac'],
    notes:
      'ADTS AAC->MPEG-TS: wrap the AAC elementary stream into a single-program TS (MpegTsOutputFormat). ' +
      'Lossless; covers the §A.3 MPEG-TS audio write target the legacy battery never used.',
  },

  // ── MP3 -> MKV: MP3 is a legal Matroska audio codec; complements the legacy mp3->mp4 with a second
  //    legal target so the MP3 source is not single-target. ──
  {
    asset: 'mp3_xing.mp3',
    from: 'mp3',
    to: 'mkv',
    audioCodecs: ['mp3'],
    notes: 'MP3->MKV: MP3 is legal in Matroska; lossless audio re-wrap (Xing TOC dropped, frames identical).',
  },
];

export const remuxAudioScenarios: Scenario[] = buildRemuxAll(AUDIO_CASES);

export default remuxAudioScenarios;
