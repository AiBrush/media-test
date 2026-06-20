/**
 * src/scenarios/mux/write-targets.ts — the MISSING mux WRITE-target containers (spec §A.3).
 *
 * §A.3 enumerates the writeable container set {mp4(progressive·fastStart·in-place-reserve·
 * fragmented/CMAF·streaming), mov, mkv, webm, wav, mp3, ogg, adts, ts}. The legacy mux family only
 * ever WROTE mp4 / mkv / ts / webm. This file adds the WRITE paths the family was missing, each a
 * distinct muxer authoring path the spec lists:
 *
 *   - mov   : no legacy mux case wrote QuickTime. H.264/AAC → mov (ISO-BMFF sibling of mp4, but a
 *             distinct ftyp/wide-atom layout). reference-reimport is FAITHFUL here (mp4→mov keeps the
 *             AVCC framing + sample model, so the source golden packet table matches).
 *   - ogg   : Opus/Vorbis → ogg is the canonical OGG WRITE path (page/granulepos authoring). Sourced
 *             from opus.ogg (Opus) and vp8_720p_10s.webm's Vorbis track.
 *   - wav   : the ONLY writeable PCM container — PCM → wav (RIFF/data-chunk authoring). Sourced from
 *             the wav_s16/s24/f32 PCM assets (re-mux PCM samples into a fresh WAV).
 *   - adts  : ADTS is present in the legacy family only as a SOURCE. Here AAC → adts is the WRITE path:
 *             mux video-less AAC chunks into a raw ADTS elementary stream (re-emit ADTS frame headers).
 *   - mp3   : mux MP3 frames → an elementary/ID3 MP3 stream (mp3_xing.mp3 → mp3). The MP3 WRITE path.
 *
 * Plus the AUDIO HALF of the WRITE matrix beyond AAC→MP4 (the legacy family had only
 * audio_only_aac_to_mp4): opus→ogg/webm, flac→mkv, mp3→mp4, PCM→wav. The corpus HAS opus.ogg,
 * flac_seektable.flac, mp3_xing.mp3, wav_s16/s24/f32 to source these tracks (manifest.json).
 *
 * ORACLES (see _shared.ts header for the full rationale):
 *   - playback-smoke is not a default mux-family gate. The raw Brave run showed mux-authored outputs
 *     that re-import and duration-probe correctly can still fail to advance in a plain `<video>`, and
 *     audio-only outputs do not satisfy that oracle's premise.
 *   - reference-reimport is attached ONLY for faithful targets (mp4/mov of an ISO-BMFF source); a
 *     reframing target (mkv/webm/ts/ogg/wav/adts/mp3) is gated by probe-duration instead of a
 *     packet-count check keyed on a source golden that does not describe the reframed output.
 *   - probe-duration (property-invariant) is ALWAYS attached — the container-agnostic structural gate
 *     that a correct mux materializes the right output duration. (buildMux adds it by default.)
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildMuxAll, type MuxCase } from './_shared.ts';

const WRITE_TARGET_CASES: MuxCase[] = [
  // ── mov: QuickTime WRITE path (no legacy mux case wrote mov). FAITHFUL reimport (mp4→mov). ──
  {
    id: 'h264_aac_to_mov',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'WRITE TARGET mov (§A.3): demux H.264+AAC, mux into QuickTime. Distinct ftyp/atom layout from ' +
      'mp4; AVCC framing + sample model are preserved so reference-reimport (source golden) is faithful.',
  },

  // ── ogg: Opus/Vorbis WRITE path (page + granulepos authoring). ──
  {
    id: 'opus_to_ogg',
    input: 'opus.ogg',
    containersIn: ['ogg'],
    to: 'ogg',
    audioCodecs: ['opus'],
    notes:
      'WRITE TARGET ogg (§A.3): demux Opus from OGG, re-mux into OGG (re-author pages + granulepos). ' +
      'Reframing target → gated by probe-duration, not a source-keyed packet count.',
  },
  {
    id: 'vorbis_to_ogg',
    input: 'vp8_720p_10s.webm',
    containersIn: ['webm'],
    to: 'ogg',
    audioCodecs: ['vorbis'],
    extraOptions: { trackSelect: ['audio:0'] },
    notes:
      'WRITE TARGET ogg (§A.3): demux the Vorbis audio track out of a WebM and mux it into OGG ' +
      '(Vorbis is the other native OGG payload). Audio-only OGG authoring.',
  },

  // ── wav: PCM WRITE path — the ONLY writeable PCM container (RIFF/data-chunk authoring). ──
  {
    id: 'pcm_s16_to_wav',
    input: 'wav_s16.wav',
    containersIn: ['wav'],
    to: 'wav',
    audioCodecs: ['pcm-s16'],
    notes:
      'WRITE TARGET wav (§A.3): demux 16-bit PCM and mux into a fresh WAV (RIFF header + data chunk). ' +
      'wav is the only writeable PCM container; probe-duration gates the materialized sample count.',
  },
  {
    id: 'pcm_s24_to_wav',
    input: 'wav_s24.wav',
    containersIn: ['wav'],
    to: 'wav',
    audioCodecs: ['pcm-s24'],
    notes:
      'WRITE TARGET wav (§A.3): 24-bit PCM → WAV. Exercises non-16-bit sample-size authoring in the ' +
      'RIFF fmt chunk (bits-per-sample / block-align must be written correctly).',
  },
  {
    id: 'pcm_f32_to_wav',
    input: 'wav_f32.wav',
    containersIn: ['wav'],
    to: 'wav',
    audioCodecs: ['pcm-f32'],
    notes:
      'WRITE TARGET wav (§A.3): 32-bit float PCM → WAV (WAVE_FORMAT_IEEE_FLOAT). Float-format fmt-chunk ' +
      'authoring distinct from integer PCM.',
  },

  // ── adts: AAC elementary-stream WRITE path (ADTS was only a SOURCE in the legacy family). ──
  {
    id: 'aac_to_adts',
    input: 'aac_adts.aac',
    containersIn: ['adts'],
    to: 'adts',
    audioCodecs: ['aac'],
    notes:
      'WRITE TARGET adts (§A.3): mux video-less AAC chunks into a raw ADTS elementary stream (re-emit ' +
      'per-frame ADTS headers). adts as a TARGET, not a source. NOT <video>-playable → no playback-smoke.',
  },

  // ── mp3: MP3 elementary/ID3 WRITE path. ──
  {
    id: 'mp3_to_mp3',
    input: 'mp3_xing.mp3',
    containersIn: ['mp3'],
    to: 'mp3',
    audioCodecs: ['mp3'],
    notes:
      'WRITE TARGET mp3 (§A.3): mux MP3 frames into an elementary/ID3 MP3 stream. mp3 as a TARGET. ' +
      'Raw frame stream → not reliably <video>-playable → gated by probe-duration only.',
  },

  // ── AUDIO HALF of the WRITE matrix beyond AAC→MP4 (legacy had only audio_only_aac_to_mp4) ──
  {
    id: 'opus_to_webm_audio',
    input: 'opus.ogg',
    containersIn: ['ogg'],
    to: 'webm',
    audioCodecs: ['opus'],
    notes:
      'AUDIO WRITE matrix: Opus (from OGG) → WebM audio-only (Matroska/WebM audio track authoring). ' +
      'Complements the video WebM writes; probe-duration gates the authored audio-only WebM duration.',
  },
  {
    id: 'flac_to_mkv_audio',
    input: 'flac_seektable.flac',
    containersIn: ['flac'],
    to: 'mkv',
    audioCodecs: ['flac'],
    notes:
      'AUDIO WRITE matrix: FLAC → MKV audio-only. FLAC is legal in Matroska; exercises lossless-audio ' +
      'codec-private (STREAMINFO) authoring into a Matroska track.',
  },
  {
    id: 'mp3_to_mp4_audio',
    input: 'mp3_xing.mp3',
    containersIn: ['mp3'],
    to: 'mp4',
    audioCodecs: ['mp3'],
    notes:
      'AUDIO WRITE matrix: MP3 → MP4(.m4a). MP3 is legal in MP4; mux MP3 frames into an ISO-BMFF sample ' +
      'table (mp4a/.mp3 sample entry). Reframing into a sample table → probe-duration gate.',
  },
  // (PCM→WAV rung of the audio write matrix is already covered by pcm_s16/s24/f32_to_wav above; not
  //  duplicated here — wav is the only writeable PCM container.)
];

export const muxWriteTargetScenarios: Scenario[] = buildMuxAll(WRITE_TARGET_CASES);

export default muxWriteTargetScenarios;
