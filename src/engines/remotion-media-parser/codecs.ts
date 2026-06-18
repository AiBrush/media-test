/**
 * src/engines/remotion-media-parser/codecs.ts — token mappers between @remotion/media-parser's
 * codec/container enums and the suite's canonical lowercase tokens (engine.ts CANONICAL_*).
 *
 * @remotion/media-parser@4.0.479 — researched 2026-06-17.
 *  - MediaParserVideoCodec = 'vp8'|'vp9'|'h264'|'av1'|'h265'|'prores'           (dist/get-tracks.d.ts)
 *  - MediaParserAudioCodec = 'opus'|'aac'|'mp3'|'ac3'|'vorbis'|'pcm-u8'|'pcm-s16'|
 *                            'pcm-s24'|'pcm-s32'|'pcm-f32'|'flac'|'aiff'         (dist/get-tracks.d.ts)
 *  - MediaParserContainer  = 'mp4'|'webm'|'avi'|'transport-stream'|'mp3'|'aac'|
 *                            'flac'|'m3u8'|'wav'                                  (dist/options.d.ts)
 * Docs: https://www.remotion.dev/docs/media-parser/types
 */

import type {
  MediaParserAudioCodec,
  MediaParserContainer,
  MediaParserVideoCodec,
} from '@remotion/media-parser';

/**
 * Map a media-parser video codec enum to a canonical suite token (CANONICAL_VIDEO_CODECS:
 * h264/hevc/vp8/vp9/av1). Media-parser uses 'h265' where the suite uses 'hevc'. 'prores' has no
 * canonical token in this suite, so it is surfaced verbatim (honest: report what the file declares).
 */
export function mpVideoToCanonical(codec: MediaParserVideoCodec | string | null): string {
  switch (codec) {
    case 'h264':
      return 'h264';
    case 'h265':
      return 'hevc';
    case 'vp8':
      return 'vp8';
    case 'vp9':
      return 'vp9';
    case 'av1':
      return 'av1';
    case 'prores':
      return 'prores';
    default:
      return codec ?? 'unknown';
  }
}

/**
 * Map a media-parser audio codec enum to a canonical suite token. Media-parser's PCM family
 * (pcm-u8/pcm-s16/pcm-s24/pcm-s32/pcm-f32) overlaps the suite's PCM tokens; pcm-u8 / pcm-s32 have no
 * canonical equivalent, so they pass through verbatim. 'ac3' / 'aiff' likewise pass through (no
 * canonical token) so we never fabricate a wrong canonical id.
 */
export function mpAudioToCanonical(codec: MediaParserAudioCodec | string | null): string {
  switch (codec) {
    case 'aac':
      return 'aac';
    case 'opus':
      return 'opus';
    case 'mp3':
      return 'mp3';
    case 'flac':
      return 'flac';
    case 'vorbis':
      return 'vorbis';
    case 'pcm-s16':
      return 'pcm-s16';
    case 'pcm-s24':
      return 'pcm-s24';
    case 'pcm-f32':
      return 'pcm-f32';
    // No canonical token — surface verbatim rather than mislabel.
    case 'pcm-u8':
    case 'pcm-s32':
    case 'ac3':
    case 'aiff':
      return codec;
    default:
      return codec ?? 'unknown';
  }
}

/**
 * Map a media-parser container enum to a canonical suite container token (CANONICAL_CONTAINERS:
 * mp4/mov/mkv/webm/ts/hls/wav/mp3/flac/ogg/adts).
 *
 * media-parser collapses families: it reports 'mp4' for the whole ISO-BMFF family (mp4/mov/m4a),
 * 'webm' for the Matroska family (webm/mkv), 'aac' for raw ADTS, 'transport-stream' for MPEG-TS,
 * and 'm3u8' for HLS. We map onto the single canonical token media-parser actually emits — we do NOT
 * guess mov/mkv/m4a since media-parser does not distinguish them at the container level.
 */
export function mpContainerToCanonical(container: MediaParserContainer | string | null): string {
  switch (container) {
    case 'mp4':
      return 'mp4';
    case 'webm':
      return 'webm';
    case 'avi':
      return 'avi'; // not in CANONICAL_CONTAINERS, but it is what media-parser detected — be honest
    case 'transport-stream':
      return 'ts';
    case 'm3u8':
      return 'hls';
    case 'wav':
      return 'wav';
    case 'mp3':
      return 'mp3';
    case 'aac':
      return 'adts'; // raw AAC/ADTS elementary stream
    case 'flac':
      return 'flac';
    default:
      return container ?? 'unknown';
  }
}

/** Best-effort MIME for a canonical container (probe output only; this engine never writes bytes). */
export function mimeForCanonicalContainer(container: string): string {
  switch (container) {
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
    case 'mov':
      return 'video/quicktime';
    case 'ts':
      return 'video/mp2t';
    case 'hls':
      return 'application/vnd.apple.mpegurl';
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'flac':
      return 'audio/flac';
    case 'adts':
    case 'aac':
      return 'audio/aac';
    case 'avi':
      return 'video/x-msvideo';
    default:
      return 'application/octet-stream';
  }
}
