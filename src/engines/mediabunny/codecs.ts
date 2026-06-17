/**
 * src/engines/mediabunny/codecs.ts — translation between the suite's canonical vocabulary
 * (engine.ts CANONICAL_*) and mediabunny's own codec / container tokens.
 *
 * Mediabunny uses `'avc'` for H.264 (every other video token matches the canonical one) and a
 * richer audio codec set (it also knows `ac3`/`eac3` and a wider PCM family than the suite's
 * canonical list). Containers map to mediabunny Input format singletons (demux/probe) and Output
 * format classes (mux/remux/transcode/trim). This module is the single place those mappings live.
 */

import {
  // input format singletons
  MP4,
  QTFF,
  MATROSKA,
  WEBM,
  MPEG_TS,
  WAVE,
  MP3 as MP3_FORMAT,
  FLAC as FLAC_FORMAT,
  OGG,
  ADTS as ADTS_FORMAT,
  // output format classes
  Mp4OutputFormat,
  MovOutputFormat,
  MkvOutputFormat,
  WebMOutputFormat,
  MpegTsOutputFormat,
  WavOutputFormat,
  Mp3OutputFormat,
  FlacOutputFormat,
  OggOutputFormat,
  AdtsOutputFormat,
  type InputFormat,
  type OutputFormat,
  type IsobmffOutputFormatOptions,
  type VideoCodec,
  type AudioCodec,
} from 'mediabunny';

// ── Video codec mapping ─────────────────────────────────────────────────────────────────────────

/** canonical video token → mediabunny VideoCodec. Only h264↔avc differs. */
const CANONICAL_TO_MB_VIDEO: Record<string, VideoCodec> = {
  h264: 'avc',
  hevc: 'hevc',
  vp8: 'vp8',
  vp9: 'vp9',
  av1: 'av1',
};

/** mediabunny VideoCodec → canonical video token. */
const MB_TO_CANONICAL_VIDEO: Record<string, string> = {
  avc: 'h264',
  hevc: 'hevc',
  vp8: 'vp8',
  vp9: 'vp9',
  av1: 'av1',
};

export function canonicalToMediabunnyVideo(token: string): VideoCodec | null {
  return CANONICAL_TO_MB_VIDEO[token] ?? null;
}

export function mediabunnyToCanonicalVideo(codec: VideoCodec | string | null): string | null {
  if (codec == null) return null;
  return MB_TO_CANONICAL_VIDEO[codec] ?? null;
}

// ── Audio codec mapping ─────────────────────────────────────────────────────────────────────────

/** canonical audio token → mediabunny AudioCodec. The PCM names line up 1:1. */
const CANONICAL_TO_MB_AUDIO: Record<string, AudioCodec> = {
  aac: 'aac',
  opus: 'opus',
  mp3: 'mp3',
  flac: 'flac',
  vorbis: 'vorbis',
  'pcm-s16': 'pcm-s16',
  'pcm-s24': 'pcm-s24',
  'pcm-f32': 'pcm-f32',
  'pcm-s16be': 'pcm-s16be',
};

/**
 * mediabunny AudioCodec → canonical audio token. mediabunny knows more codecs than the canonical
 * set (ac3/eac3, more PCM endian/width variants); the ones outside the canonical vocabulary are
 * mapped to the closest canonical token when reading metadata, else returned verbatim so probe
 * never silently drops a track's codec.
 */
const MB_TO_CANONICAL_AUDIO: Record<string, string> = {
  aac: 'aac',
  opus: 'opus',
  mp3: 'mp3',
  flac: 'flac',
  vorbis: 'vorbis',
  'pcm-s16': 'pcm-s16',
  'pcm-s16be': 'pcm-s16be',
  'pcm-s24': 'pcm-s24',
  'pcm-s24be': 'pcm-s24be',
  'pcm-s32': 'pcm-s32',
  'pcm-s32be': 'pcm-s32be',
  'pcm-f32': 'pcm-f32',
  'pcm-f32be': 'pcm-f32be',
  'pcm-f64': 'pcm-f64',
  'pcm-f64be': 'pcm-f64be',
  'pcm-u8': 'pcm-u8',
  'pcm-s8': 'pcm-s8',
  ulaw: 'ulaw',
  alaw: 'alaw',
  ac3: 'ac3',
  eac3: 'eac3',
};

export function canonicalToMediabunnyAudio(token: string): AudioCodec | null {
  return CANONICAL_TO_MB_AUDIO[token] ?? null;
}

export function mediabunnyToCanonicalAudio(codec: AudioCodec | string | null): string | null {
  if (codec == null) return null;
  return MB_TO_CANONICAL_AUDIO[codec] ?? codec;
}

// ── Container mapping ───────────────────────────────────────────────────────────────────────────

/** canonical container token → mediabunny Input format singleton (for demux/probe). */
const CANONICAL_TO_INPUT_FORMAT: Record<string, InputFormat> = {
  mp4: MP4,
  mov: QTFF,
  mkv: MATROSKA,
  webm: WEBM,
  ts: MPEG_TS,
  wav: WAVE,
  mp3: MP3_FORMAT,
  flac: FLAC_FORMAT,
  ogg: OGG,
  adts: ADTS_FORMAT,
};

export function inputFormatForContainer(token: string): InputFormat | null {
  return CANONICAL_TO_INPUT_FORMAT[token] ?? null;
}

/** Options that fold the suite's streaming features into an ISOBMFF output config. */
export interface OutputFormatOptions {
  /** ISOBMFF fastStart mode (false | 'in-memory' | 'reserve' | 'fragmented'). */
  fastStart?: IsobmffOutputFormatOptions['fastStart'];
}

/**
 * Construct a fresh mediabunny Output format for a canonical container token. ISOBMFF formats accept
 * the fastStart option ('reserve' / 'fragmented') that backs the suite's streaming-output features.
 * Returns null for tokens mediabunny cannot mux (e.g. 'hls' is multi-file / pathed-only here).
 */
export function makeOutputFormat(token: string, opts?: OutputFormatOptions): OutputFormat | null {
  const isobmff: IsobmffOutputFormatOptions | undefined =
    opts?.fastStart !== undefined ? { fastStart: opts.fastStart } : undefined;
  switch (token) {
    case 'mp4':
      return new Mp4OutputFormat(isobmff);
    case 'mov':
      return new MovOutputFormat(isobmff);
    case 'mkv':
      return new MkvOutputFormat();
    case 'webm':
      return new WebMOutputFormat();
    case 'ts':
      return new MpegTsOutputFormat();
    case 'wav':
      return new WavOutputFormat();
    case 'mp3':
      return new Mp3OutputFormat();
    case 'flac':
      return new FlacOutputFormat();
    case 'ogg':
      return new OggOutputFormat();
    case 'adts':
      return new AdtsOutputFormat();
    default:
      return null;
  }
}

/** MIME type the suite reports for a produced container (coarse base type; codecs not appended). */
export function mimeForContainer(token: string): string {
  switch (token) {
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'webm':
      return 'video/webm';
    case 'ts':
      return 'video/mp2t';
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'flac':
      return 'audio/flac';
    case 'ogg':
      return 'audio/ogg';
    case 'adts':
      return 'audio/aac';
    default:
      return 'application/octet-stream';
  }
}
