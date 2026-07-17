/**
 * src/engines/remotion-webcodecs/codecs.ts — token mapping between the suite's canonical
 * codec/container vocabulary (engine.ts CANONICAL_*) and @remotion/webcodecs' OWN tokens.
 *
 * @remotion/webcodecs' tokens differ from the suite canon in two places that MUST be translated:
 *   - HEVC is spelled `h265` by remotion-webcodecs but `hevc` in the suite canon.
 *   - The WAV/PCM audio codec is spelled `wav` by remotion-webcodecs but `pcm-s16` in the suite
 *     canon (a WAV container written by this package carries 16-bit PCM).
 *
 * Authoritative source for the remotion token sets (verified against the installed 4.0.479 .d.ts):
 *   - dist/get-available-video-codecs.d.ts: video union ['vp8','vp9','h264','h265'];
 *       mp4 -> ['h264','h265'], webm -> ['vp8','vp9'], wav -> [].
 *   - dist/get-available-audio-codecs.d.ts: audio union ['opus','aac','wav'];
 *       mp4 -> ['aac'], webm -> ['opus'], wav -> ['wav'].
 *   - dist/convert-media.d.ts: container is exactly 'mp4' | 'wav' | 'webm'.
 */

/** Remotion-webcodecs container token (the only three it can WRITE). */
export type RemotionContainer = 'mp4' | 'webm' | 'wav';
/** Remotion-webcodecs video codec token (encode side). */
export type RemotionVideoCodec = 'h264' | 'h265' | 'vp8' | 'vp9';
/** Remotion-webcodecs audio codec token (encode side). */
export type RemotionAudioCodec = 'aac' | 'opus' | 'wav';

/** Canonical container tokens this engine can WRITE (remux/transcode output). */
export const CONTAINERS_OUT = ['mp4', 'webm', 'wav'] as const;

/**
 * Canonical input containers this engine can READ, via @remotion/media-parser. Media-parser's
 * MediaParserContainer = 'mp4'|'webm'|'avi'|'transport-stream'|'mp3'|'aac'|'flac'|'m3u8'|'wav'; the
 * docs also list mov/mkv/m4a as readable (mov is ISOBMFF read as mp4; mkv via the matroska/webm
 * path). We declare the canonical tokens the suite recognizes.
 */
export const CONTAINERS_IN = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'ts',
  'hls',
  'wav',
  'mp3',
  'flac',
  'adts',
] as const;

/** Map a suite canonical container token to a remotion-webcodecs output container, or null. */
export function canonicalToRemotionContainer(container: string): RemotionContainer | null {
  switch (container) {
    case 'mp4':
      return 'mp4';
    case 'webm':
      return 'webm';
    case 'wav':
      return 'wav';
    default:
      return null;
  }
}

/** Map a suite canonical video codec token to a remotion-webcodecs encode codec, or null. */
export function canonicalToRemotionVideo(codec: string): RemotionVideoCodec | null {
  switch (codec) {
    case 'h264':
      return 'h264';
    case 'hevc':
      return 'h265';
    case 'vp8':
      return 'vp8';
    case 'vp9':
      return 'vp9';
    default:
      return null; // av1 has no encode path
  }
}

/** Map a suite canonical audio codec token to a remotion-webcodecs encode codec, or null. */
export function canonicalToRemotionAudio(codec: string): RemotionAudioCodec | null {
  switch (codec) {
    case 'aac':
      return 'aac';
    case 'opus':
      return 'opus';
    // remotion writes exactly 16-bit PCM into a WAV container under the token 'wav'.
    case 'pcm-s16':
      return 'wav';
    default:
      return null; // mp3/flac/vorbis have no encode path
  }
}

/**
 * Map a media-parser codec enum / codec string to a suite canonical VIDEO codec token (for probe).
 * MediaParserVideoCodec = 'vp8'|'vp9'|'h264'|'av1'|'h265'|'prores'.
 */
export function parserToCanonicalVideo(codec: string): string {
  const c = codec.toLowerCase();
  if (c === 'h265' || c === 'hevc' || c.startsWith('hev1') || c.startsWith('hvc1')) return 'hevc';
  if (c === 'h264' || c.startsWith('avc1') || c.startsWith('avc3')) return 'h264';
  if (c === 'vp8') return 'vp8';
  if (c === 'vp9' || c.startsWith('vp09')) return 'vp9';
  if (c === 'av1' || c.startsWith('av01')) return 'av1';
  if (c === 'prores') return 'prores';
  return c;
}

/**
 * Map a media-parser codec enum / codec string to a suite canonical AUDIO codec token (for probe).
 * MediaParserAudioCodec = 'opus'|'aac'|'mp3'|'ac3'|'vorbis'|'pcm-u8'|'pcm-s16'|'pcm-s24'|'pcm-s32'|
 * 'pcm-f32'|'flac'|'aiff'.
 */
export function parserToCanonicalAudio(codec: string): string {
  const c = codec.toLowerCase();
  if (c === 'aac' || c.startsWith('mp4a')) return 'aac';
  if (c === 'opus') return 'opus';
  if (c === 'mp3') return 'mp3';
  if (c === 'flac') return 'flac';
  if (c === 'vorbis') return 'vorbis';
  if (c === 'pcm-s16') return 'pcm-s16';
  if (c === 'pcm-s24') return 'pcm-s24';
  if (c === 'pcm-f32') return 'pcm-f32';
  return c;
}

/** Map a media-parser MediaParserContainer name to a suite canonical container token. */
export function parserContainerToCanonical(name: string): string {
  const n = name.toLowerCase();
  if (n === 'mp4') return 'mp4';
  if (n === 'webm') return 'webm';
  if (n === 'transport-stream') return 'ts';
  if (n === 'm3u8') return 'hls';
  if (n === 'wav') return 'wav';
  if (n === 'mp3') return 'mp3';
  if (n === 'flac') return 'flac';
  if (n === 'aac') return 'adts';
  if (n === 'avi') return 'avi';
  return n;
}

/** MIME type for a written container (used in MediaBytes.mime). */
export function mimeForContainer(container: string): string {
  switch (container) {
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}

/** Default encode video codec per output container (matches getDefaultVideoCodec semantics). */
export function defaultVideoCodecFor(container: RemotionContainer): RemotionVideoCodec | null {
  switch (container) {
    case 'mp4':
      return 'h264';
    case 'webm':
      return 'vp8';
    case 'wav':
      return null; // audio-only
    default:
      return null;
  }
}

/** Default encode audio codec per output container (matches getDefaultAudioCodec semantics). */
export function defaultAudioCodecFor(container: RemotionContainer): RemotionAudioCodec | null {
  switch (container) {
    case 'mp4':
      return 'aac';
    case 'webm':
      return 'opus';
    case 'wav':
      return 'wav';
    default:
      return null;
  }
}
