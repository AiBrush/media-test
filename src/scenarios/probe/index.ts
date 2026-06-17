/**
 * src/scenarios/probe/index.ts — Pillar 1, family "probe".
 *
 * Probe every container in the corpus and assert normalized metadata (container/duration/codecs/
 * dims/fps/channels/tags) against committed independent golden via the `golden-metadata` oracle.
 * Probe is the cheapest op and must succeed for essentially every engine on every container, so it
 * is the broadest family. Each scenario declares only `operations: ['probe']` plus the container it
 * reads; codecs are declared so an engine that cannot even parse the bitstream negotiates NA
 * honestly rather than FAILing.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

/** One probe scenario per asset. `containersIn` + codec hints make NA-negotiation honest. */
interface ProbeCase {
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes?: string;
}

const PROBE_CASES: ProbeCase[] = [
  // ── Video MP4 / MOV ──
  { asset: 'h264_1080p_30s.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'h264_4k_10s.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'hevc_1080p_10s.mp4', container: 'mp4', videoCodecs: ['hevc'], audioCodecs: ['aac'] },
  {
    asset: 'h264_bframes_1080p.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'B-frames: probe must still report duration/dims from the moov, not the GOP order.',
  },
  {
    asset: 'h264_vfr.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Variable frame rate — fps is nominal/average; oracle tolerates ±1 frame on duration.',
  },
  {
    asset: 'h264_rotated90.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Rotation must surface as track.rotation (display matrix), not by swapping w/h.',
  },
  {
    asset: 'h264_multitrack.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Multiple tracks: golden lists every track; order/language must match.',
  },
  { asset: 'h264_1080p_5s.mov', container: 'mov', videoCodecs: ['h264'], audioCodecs: ['aac'] },

  // ── WebM / MKV ──
  { asset: 'vp9_1080p_10s.webm', container: 'webm', videoCodecs: ['vp9'], audioCodecs: ['opus'] },
  { asset: 'vp8_720p_10s.webm', container: 'webm', videoCodecs: ['vp8'], audioCodecs: ['vorbis'] },
  { asset: 'av1_720p_5s.webm', container: 'webm', videoCodecs: ['av1'], audioCodecs: ['opus'] },
  {
    asset: 'vp9_alpha.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes: 'Alpha track present; probe reports the video track normally (alpha is decode-time).',
  },
  { asset: 'h264_in_mkv.mkv', container: 'mkv', videoCodecs: ['h264'], audioCodecs: ['aac'] },

  // ── TS / HLS ──
  { asset: 'h264_ts.ts', container: 'ts', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  {
    asset: 'hls_vod.m3u8',
    container: 'hls',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Playlist probe: duration aggregated across segments; engines lacking HLS negotiate NA.',
  },

  // ── Encrypted MP4 (probe of the encrypted container, no key needed) ──
  {
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'CENC ctr: probe reports container/track/encryption scheme without decrypting.',
  },
  {
    asset: 'cenc_cbcs.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'CENC cbcs: same — metadata only, no decrypt.',
  },

  // ── Audio ──
  { asset: 'wav_s16.wav', container: 'wav', audioCodecs: ['pcm-s16'] },
  { asset: 'wav_s24.wav', container: 'wav', audioCodecs: ['pcm-s24'] },
  { asset: 'wav_f32.wav', container: 'wav', audioCodecs: ['pcm-f32'] },
  {
    asset: 'wav_s16be.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16be'],
    notes: 'Big-endian PCM (RIFX/AIFF-style sample order) — codec token must reflect endianness.',
  },
  { asset: 'mp3_xing.mp3', container: 'mp3', audioCodecs: ['mp3'], notes: 'Xing/Info header → accurate duration.' },
  {
    asset: 'mp3_cbr_notoc.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    notes: 'CBR, no Xing TOC — duration estimated from bitrate × size; oracle tolerance applies.',
  },
  { asset: 'flac_seektable.flac', container: 'flac', audioCodecs: ['flac'] },
  {
    asset: 'flac_noseektable.flac',
    container: 'flac',
    audioCodecs: ['flac'],
    notes: 'No SEEKTABLE — duration from STREAMINFO total samples.',
  },
  { asset: 'aac_adts.aac', container: 'adts', audioCodecs: ['aac'] },
  { asset: 'opus.ogg', container: 'ogg', audioCodecs: ['opus'] },

  // ── Recorder-origin / stress that still probe ──
  {
    asset: 'recorder_headerless.webm',
    container: 'webm',
    videoCodecs: ['vp8'],
    audioCodecs: ['opus'],
    notes: 'MediaRecorder WebM with no/sparse Cues + unknown duration; probe duration may be null.',
  },
  {
    asset: 'longform_1h_audio.m4a',
    container: 'mp4',
    audioCodecs: ['aac'],
    notes: 'Multi-hour audio in MP4(.m4a): probe must report ~1h duration cheaply, not by scanning all.',
  },
];

export const probeScenarios: Scenario[] = PROBE_CASES.map((c) =>
  defineScenario({
    id: `probe/${c.asset.replace(/\.[^.]+$/, '')}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['golden-metadata'],
    metrics: ['wall'],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

export default probeScenarios;
