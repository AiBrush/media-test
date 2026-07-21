/**
 * src/engines/web-demuxer/adapter.ts — MediaEngine adapter for web-demuxer@4.0.0.
 *
 * ROLE: FFmpeg-in-WASM probe/demux specialist with browser-backed decode and seek. Parser operations
 * are independent of the browser codec table. Pixel operations load the selected package stream,
 * generate the exact standard VideoDecoderConfig they will configure, and route an unavailable API,
 * rejected config, raster surface, or Web Crypto through the typed NA_BROWSER channel. Package and
 * adapter tuple misses use the shared realm-safe NotApplicableError; malformed bytes remain errors.
 *
 * Raw package packets expose PTS but no DTS, so the ordinary backend leaves DTS absent. It records
 * semantic access-unit identity and explicit framing/config evidence. The three declared large-file
 * cells use a separately reported ISO-BMFF sample-table backend which derives real DTS, validates
 * stsc/stco/co64 sample placement inside mdat ranges, and explicitly does not claim payload reads.
 *
 * Dossier (authoritative): research/dossiers/web-demuxer.md (researched 2026-06-17).
 *   Doc URLs cited there and used here:
 *     - Repo + README:        https://github.com/bilibili/web-demuxer
 *     - TS declarations:      https://cdn.jsdelivr.net/npm/web-demuxer@4.0.0/dist/web-demuxer.d.ts
 *     - Releases/changelog:   https://github.com/bilibili/web-demuxer/releases  (v4.0.0)
 *     - WebCodecs context:    https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
 *   Version researched: web-demuxer@4.0.0 (published 2025-12-20).
 *
 * Lib API used (verified against node_modules/web-demuxer/dist/web-demuxer.d.ts + .js, v4.0.0):
 *   import { WebDemuxer } from 'web-demuxer';
 *   const d = new WebDemuxer({ wasmFilePath });   // worker is bundled in web-demuxer.js (v4)
 *   await d.load(file);                            // File | URL string
 *   await d.getMediaInfo();                        // WebMediaInfo { format_name, duration, streams[] }
 *   await d.getAVStreams();                        // WebAVStream[]
 *   d.readAVPacket(0,endSec,avMediaType,stream.index) // ReadableStream<WebAVPacket> (low-level demux, multi-track)
 *   await d.getDecoderConfig('video'|'audio')      // VideoDecoderConfig | AudioDecoderConfig
 *   await d.seek('video', tSec)                    // EncodedVideoChunk (BACKWARD = nearest keyframe)
 *   d.read('video', start?, end?)                  // ReadableStream<EncodedVideoChunk>
 *   d.destroy();                                   // terminate worker, free WASM heap
 *
 * Timestamp units (verified from the v4 bundle, const p = 1e6):
 *   - Raw WebAVPacket.timestamp / .duration are in SECONDS  → demux maps ptsUs = round(ts * 1e6).
 *   - WebCodecs chunks from seek()/read() carry timestamps already in MICROSECONDS (genEncodedChunk
 *     multiplies the packet's seconds by 1e6) → used directly as the decoded frame's ptsUs.
 *   - WebAVPacket carries ONLY a presentation timestamp (no DTS field); ordinary demux omits dtsUs.
 *
 * Frame digests (seek / decodeFrames) use the SAME normalization + sha256 as oracles.ts / platform:
 * a decoded VideoFrame is drawn to a 2D canvas (straight-alpha, top-left, tight RGBA) and hashed via
 * the shared {@link digestImageData}, so digests are engine-independent and comparable to golden.
 *
 * Vendoring (§0.8 — NO CDN at run time): the JS bundle (with the worker inlined) comes from the
 * installed package via the static `import { WebDemuxer } from 'web-demuxer'`. The .wasm is imported
 * with Vite's `?url` suffix (dossier §7, Option A), which emits a content-hashed SAME-ORIGIN asset
 * and yields a local URL — the library's default jsDelivr `wasmFilePath` is NEVER used.
 */

// Use the package's declared "./wasm" export subpath — Vite honors package `exports`, so the raw
// `web-demuxer/dist/wasm-files/web-demuxer.wasm` deep path is BLOCKED ("Missing specifier"). The
// `?url` suffix still emits a content-hashed SAME-ORIGIN asset (no CDN at run time, §0.8).
import wasmUrl from 'web-demuxer/wasm?url';

import { registerEngine } from '../../core/registry.ts';
import type {
  CapabilitySet,
  ConcreteOperationRequest,
  DecryptKey,
  DecodeOptions,
  DemuxResult,
  EncodedTracks,
  EncryptionScheme,
  FrameDigest,
  FrameSink,
  LifecycleContext,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  NormalizedTrack,
  OperationContext,
  PacketInfo,
  SeekResult,
  SupportDecision,
  TrackType,
  TranscodeOptions,
} from '../../core/engine.ts';
import {
  DECODE_TRACK_SELECTOR_SCHEMA,
  createBrowserNotSupportedError,
  createMalformedInputError,
  createNotApplicableError,
  isBrowserNotSupportedError,
  isMalformedInputError,
  isNotApplicableError,
} from '../../core/engine.ts';

import { digestImageData, hasWebCryptoDigest } from './digest.ts';
import {
  demuxProgressiveMp4SampleTable,
  parseProgressiveMp4SampleTableBytes,
  shouldUseProgressiveMp4SampleTableFastPath,
} from './mp4-sample-table.ts';
import {
  applyFrameRateEvidence,
  createTrackEvidenceAccumulator,
  finishTrackRepresentation,
  mergeNormalizedStreams,
  packetEvidenceFromWebPacket,
  streamIndexToTrackIndex,
} from './packet-evidence.ts';
import { hasRasterSurface, imageDataFromVideoFrame } from './raster.ts';
import {
  decideWebDemuxerSupport,
  selectedVideoTrack,
  WEB_DEMUXER_AUDIO_CODECS,
  WEB_DEMUXER_INPUT_CONTAINERS,
  WEB_DEMUXER_REASON,
  WEB_DEMUXER_VIDEO_CODECS,
  webDemuxerTupleSummary,
} from './support.ts';
import {
  closeAll,
  retainLowestPts,
  seekGopProgressSatisfied,
  selectSeekLanding,
  sortByPresentationTime,
  WebDemuxerPartialDecodeError,
  type TimedClosable,
} from './temporal.ts';
import { parseAacAudioSpecificConfig } from '../mp4box/evidence.ts';

// Type-only import of the library's public surface (avoids pulling the runtime into the suite shell;
// the real module is dynamically imported inside init()). AVMediaType is an enum used both as a type
// (here) and as a runtime value (captured from the dynamic import in init()).
import type {
  WebDemuxer as WebDemuxerType,
  WebAVStream,
  WebAVPacket,
  WebMediaInfo,
  AVMediaType,
  AVSeekFlag,
} from 'web-demuxer';

/** AVMediaType numeric values (sync with FFmpeg libavutil/avutil.h; verified vs web-demuxer .d.ts).
 *  Used to address streams in readAVPacket without importing the enum as a runtime value. */
const AV_MEDIA_VIDEO = 0 as AVMediaType; // AVMEDIA_TYPE_VIDEO
const AV_MEDIA_AUDIO = 1 as AVMediaType; // AVMEDIA_TYPE_AUDIO
const AV_MEDIA_SUBTITLE = 3 as AVMediaType; // AVMEDIA_TYPE_SUBTITLE
const AV_SEEK_FLAG_BACKWARD = 1 as AVSeekFlag; // AVSEEK_FLAG_BACKWARD

const ENGINE_ID = 'web-demuxer@4.0.0';
const AAC_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];
const AAC_CHANNELS_BY_CONFIG = [undefined, 1, 2, 3, 4, 5, 6, 8];
const MAX_PACKET_ROWS = 2_000_000;
const MAX_DECODE_FRAMES = 512;
const MAX_RETAINED_PIXEL_BYTES = 1_500 * 1024 * 1024;
const MAX_SEEK_CHUNKS = 100_000;

type PacketizedTrackType = Extract<TrackType, 'video' | 'audio' | 'subtitle'>;
type AacAudioConfig = { sampleRate: number; channels: number };

/** Map an FFmpeg codec_name (WebAVStream.codec_name) → canonical lowercase token. Falls back to the
 *  raw name lowercased when unrecognized (honest: surface what the file declares). */
function canonicalCodec(name: string | undefined): string {
  const n = (name ?? '').toLowerCase();
  switch (n) {
    case 'h264':
      return 'h264';
    case 'hevc':
    case 'h265':
      return 'hevc';
    case 'vp8':
      return 'vp8';
    case 'vp9':
      return 'vp9';
    case 'av1':
    case 'libdav1d':
    case 'libaom-av1':
      return 'av1';
    case 'aac':
      return 'aac';
    case 'opus':
      return 'opus';
    case 'mp3':
    case 'mp3float':
      return 'mp3';
    case 'flac':
      return 'flac';
    case 'vorbis':
      return 'vorbis';
    default:
      return n;
  }
}

function isoBmffContainerFromInput(input: MediaInput): 'mp4' | 'mov' | undefined {
  const name = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
  if (name.endsWith('.mov')) return 'mov';
  if (name.endsWith('.mp4') || name.endsWith('.m4a') || name.endsWith('.m4v')) return 'mp4';
  return undefined;
}

function matroskaContainerFromInput(input: MediaInput): 'mkv' | 'webm' | undefined {
  const name = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
  if (name.endsWith('.mkv')) return 'mkv';
  if (name.endsWith('.webm')) return 'webm';
  return undefined;
}

/** Map an FFmpeg format_name list (e.g. 'mov,mp4,m4a,3gp,3g2,mj2') → a canonical container token. */
function canonicalContainer(formatName: string | undefined, input: MediaInput): string {
  const names = (formatName ?? '').toLowerCase().split(',').map((s) => s.trim());
  const has = (t: string) => names.some((n) => n === t || n.includes(t));
  // FFmpeg exposes Matroska and WebM through one demuxer family. Use the corpus input suffix to
  // break that tie; otherwise any .mkv reported as "matroska,webm" would be mislabeled as WebM.
  const isMatroskaFamily = has('matroska') && has('webm');
  if (isMatroskaFamily) {
    const hinted = matroskaContainerFromInput(input);
    if (hinted) return hinted;
  }

  if (has('webm')) return 'webm';
  if (has('matroska') || has('mkv')) return 'mkv';

  // FFmpeg exposes MOV/MP4/M4A/M4V through one demuxer family name. Use the corpus input suffix only
  // to break that specific tie; otherwise the first MP4 token would mislabel real .mov inputs.
  const isIsoBmffFamily = has('mov') && (has('mp4') || has('m4a') || has('m4v'));
  if (isIsoBmffFamily) {
    const hinted = isoBmffContainerFromInput(input);
    if (hinted) return hinted;
  }

  if (has('mp4') || has('m4a') || has('m4v')) return 'mp4';
  if (has('mov') || has('quicktime') || has('qt')) return 'mov';
  if (has('mpegts') || has('mpeg-ts') || has('mpegtsraw') || names.includes('ts')) return 'ts';
  if (has('avi')) return 'avi';
  if (has('flv')) return 'flv';
  if (has('asf') || has('wmv')) return 'asf';
  if (has('flac')) return 'flac';
  if (has('mp3')) return 'mp3';
  if (has('ogg')) return 'ogg';
  if (has('wav')) return 'wav';
  // Fall back to the first listed format name (FFmpeg lists the most-specific first).
  return names[0] ?? '';
}

/** Map an AVMediaType / codec_type_string to the suite's TrackType. */
function trackTypeOf(stream: WebAVStream): TrackType {
  const t = (stream.codec_type_string ?? '').toLowerCase();
  if (t === 'video') return 'video';
  if (t === 'audio') return 'audio';
  if (t === 'subtitle') return 'subtitle';
  // Fall back to the numeric AVMediaType (0 video, 1 audio, 3 subtitle).
  switch (stream.codec_type as number) {
    case 0:
      return 'video';
    case 1:
      return 'audio';
    case 3:
      return 'subtitle';
    default:
      return 'other';
  }
}

/** Type guard for streams the low-level packet API can address by media type + stream index. */
function isPacketizedTrackType(type: TrackType): type is PacketizedTrackType {
  return type === 'video' || type === 'audio' || type === 'subtitle';
}

/** Map a packetized suite TrackType to web-demuxer's numeric AVMediaType for readAVPacket's `streamType` arg. */
function avMediaTypeOf(type: PacketizedTrackType): AVMediaType {
  switch (type) {
    case 'video':
      return AV_MEDIA_VIDEO;
    case 'audio':
      return AV_MEDIA_AUDIO;
    case 'subtitle':
      return AV_MEDIA_SUBTITLE;
  }
}

/** Best-effort bitrate (WebAVStream.bit_rate is a decimal string; '0'/'' → null). */
function bitrateOf(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Best-effort language from the stream tags map ('und'/missing → null). */
function languageOf(tags: Record<string, string> | undefined): string | null {
  const lang = tags?.language ?? tags?.lang;
  return lang && lang !== 'und' ? lang : null;
}

export function aacAudioConfigFromAdts(data: Uint8Array): AacAudioConfig | null {
  for (let i = 0; i + 6 < data.byteLength; i++) {
    const b0 = data[i]!;
    const b1 = data[i + 1]!;
    if (b0 !== 0xff || (b1 & 0xf0) !== 0xf0 || (b1 & 0x06) !== 0) continue;

    const b2 = data[i + 2]!;
    const b3 = data[i + 3]!;
    const frequencyIndex = (b2 >> 2) & 0x0f;
    const sampleRate = AAC_SAMPLE_RATES[frequencyIndex];
    const channelConfig = ((b2 & 0x01) << 2) | ((b3 >> 6) & 0x03);
    const channels = AAC_CHANNELS_BY_CONFIG[channelConfig];
    if (sampleRate && channels) return { sampleRate, channels };
  }
  return null;
}

function syncOffset(bytes: Uint8Array): number | null {
  for (let offset = 0; offset < 188; offset++) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if (bytes[offset + i * 188] !== 0x47) {
        ok = false;
        break;
      }
    }
    if (ok) return offset;
  }
  return null;
}

function sectionStart(bytes: Uint8Array, payloadOffset: number, packetEnd: number): number | null {
  if (payloadOffset >= packetEnd) return null;
  const pointer = bytes[payloadOffset] ?? 0;
  const start = payloadOffset + 1 + pointer;
  return start + 3 <= packetEnd ? start : null;
}

function sectionLength(bytes: Uint8Array, start: number): number {
  return ((bytes[start + 1]! & 0x0f) << 8) | bytes[start + 2]!;
}

function parsePatPmtPid(bytes: Uint8Array, start: number, packetEnd: number): number | null {
  if (bytes[start] !== 0x00) return null;
  const end = Math.min(start + 3 + sectionLength(bytes, start) - 4, packetEnd);
  for (let pos = start + 8; pos + 4 <= end; pos += 4) {
    const programNumber = (bytes[pos]! << 8) | bytes[pos + 1]!;
    if (programNumber === 0) continue;
    return ((bytes[pos + 2]! & 0x1f) << 8) | bytes[pos + 3]!;
  }
  return null;
}

function parsePmtAacPid(bytes: Uint8Array, start: number, packetEnd: number): number | null {
  if (bytes[start] !== 0x02) return null;
  const end = Math.min(start + 3 + sectionLength(bytes, start) - 4, packetEnd);
  const programInfoLength = ((bytes[start + 10]! & 0x0f) << 8) | bytes[start + 11]!;
  for (let pos = start + 12 + programInfoLength; pos + 5 <= end;) {
    const streamType = bytes[pos]!;
    const elementaryPid = ((bytes[pos + 1]! & 0x1f) << 8) | bytes[pos + 2]!;
    const esInfoLength = ((bytes[pos + 3]! & 0x0f) << 8) | bytes[pos + 4]!;
    if (streamType === 0x0f) return elementaryPid; // ISO/IEC 13818-7 ADTS AAC
    pos += 5 + esInfoLength;
  }
  return null;
}

function parsePmtVideoPid(bytes: Uint8Array, start: number, packetEnd: number): number | null {
  if (bytes[start] !== 0x02) return null;
  const end = Math.min(start + 3 + sectionLength(bytes, start) - 4, packetEnd);
  const programInfoLength = ((bytes[start + 10]! & 0x0f) << 8) | bytes[start + 11]!;
  for (let pos = start + 12 + programInfoLength; pos + 5 <= end;) {
    const streamType = bytes[pos]!;
    const elementaryPid = ((bytes[pos + 1]! & 0x1f) << 8) | bytes[pos + 2]!;
    const esInfoLength = ((bytes[pos + 3]! & 0x0f) << 8) | bytes[pos + 4]!;
    // AVC, HEVC, MPEG-2 video, and MPEG-1 video.
    if (streamType === 0x1b || streamType === 0x24 || streamType === 0x02 || streamType === 0x01) {
      return elementaryPid;
    }
    pos += 5 + esInfoLength;
  }
  return null;
}

function payloadOffset(bytes: Uint8Array, packetStart: number): number | null {
  const adaptationControl = (bytes[packetStart + 3]! >> 4) & 0x03;
  if (adaptationControl !== 1 && adaptationControl !== 3) return null;
  let offset = packetStart + 4;
  if (adaptationControl === 3) offset += 1 + (bytes[offset] ?? 0);
  const packetEnd = packetStart + 188;
  return offset < packetEnd ? offset : null;
}

function stripPesHeader(payload: Uint8Array): Uint8Array {
  if (
    payload.byteLength >= 9 &&
    payload[0] === 0x00 &&
    payload[1] === 0x00 &&
    payload[2] === 0x01
  ) {
    const headerLength = 9 + (payload[8] ?? 0);
    return headerLength < payload.byteLength ? payload.subarray(headerLength) : new Uint8Array();
  }
  return payload;
}

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function aacAudioConfigFromMpegTs(bytes: Uint8Array): AacAudioConfig | null {
  const startOffset = syncOffset(bytes);
  if (startOffset == null) return null;

  let pmtPid: number | null = null;
  let aacPid: number | null = null;
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (let packetStart = startOffset; packetStart + 188 <= bytes.byteLength; packetStart += 188) {
    if (bytes[packetStart] !== 0x47) continue;
    const payloadUnitStart = (bytes[packetStart + 1]! & 0x40) !== 0;
    const pid = ((bytes[packetStart + 1]! & 0x1f) << 8) | bytes[packetStart + 2]!;
    const offset = payloadOffset(bytes, packetStart);
    if (offset == null) continue;
    const packetEnd = packetStart + 188;

    if (payloadUnitStart && pid === 0) {
      const start = sectionStart(bytes, offset, packetEnd);
      if (start != null) pmtPid = parsePatPmtPid(bytes, start, packetEnd) ?? pmtPid;
      continue;
    }

    if (payloadUnitStart && pmtPid != null && pid === pmtPid) {
      const start = sectionStart(bytes, offset, packetEnd);
      if (start != null) aacPid = parsePmtAacPid(bytes, start, packetEnd) ?? aacPid;
      continue;
    }

    if (aacPid == null || pid !== aacPid) continue;
    const payload = stripPesHeader(bytes.subarray(offset, packetEnd));
    if (!payload.byteLength) continue;
    chunks.push(payload);
    totalLength += payload.byteLength;
    if (totalLength >= 64 * 1024) break;
  }

  return chunks.length ? aacAudioConfigFromAdts(concatChunks(chunks, totalLength)) : null;
}

function pesPts90Khz(payload: Uint8Array): number | null {
  if (
    payload.byteLength < 14 ||
    payload[0] !== 0x00 ||
    payload[1] !== 0x00 ||
    payload[2] !== 0x01
  ) {
    return null;
  }
  const ptsDtsFlags = (payload[7]! >> 6) & 0x03;
  if (ptsDtsFlags !== 2 && ptsDtsFlags !== 3) return null;
  const p0 = payload[9]!;
  const p1 = payload[10]!;
  const p2 = payload[11]!;
  const p3 = payload[12]!;
  const p4 = payload[13]!;
  if ((p0 & 1) !== 1 || (p2 & 1) !== 1 || (p4 & 1) !== 1) return null;
  return (
    (p0 & 0x0e) * 2 ** 29 +
    p1 * 2 ** 22 +
    (p2 & 0xfe) * 2 ** 14 +
    p3 * 2 ** 7 +
    (p4 & 0xfe) / 2
  );
}

export function tsVideoFrameRateFromMpegTs(
  bytes: Uint8Array,
): { fps: number; sampleCount: number; observedIntervalUs: number; cadence: 'CFR' | 'VFR' } | null {
  const startOffset = syncOffset(bytes);
  if (startOffset == null) return null;
  let pmtPid: number | null = null;
  let videoPid: number | null = null;
  const pts: number[] = [];

  for (let packetStart = startOffset; packetStart + 188 <= bytes.byteLength; packetStart += 188) {
    if (bytes[packetStart] !== 0x47) continue;
    const payloadUnitStart = (bytes[packetStart + 1]! & 0x40) !== 0;
    const pid = ((bytes[packetStart + 1]! & 0x1f) << 8) | bytes[packetStart + 2]!;
    const offset = payloadOffset(bytes, packetStart);
    if (offset == null) continue;
    const packetEnd = packetStart + 188;

    if (payloadUnitStart && pid === 0) {
      const start = sectionStart(bytes, offset, packetEnd);
      if (start != null) pmtPid = parsePatPmtPid(bytes, start, packetEnd) ?? pmtPid;
      continue;
    }
    if (payloadUnitStart && pmtPid != null && pid === pmtPid) {
      const start = sectionStart(bytes, offset, packetEnd);
      if (start != null) videoPid = parsePmtVideoPid(bytes, start, packetEnd) ?? videoPid;
      continue;
    }
    if (!payloadUnitStart || videoPid == null || pid !== videoPid) continue;
    const value = pesPts90Khz(bytes.subarray(offset, packetEnd));
    if (value != null) pts.push(value);
  }

  if (pts.length < 3) return null;
  const deltas: number[] = [];
  for (let index = 1; index < pts.length; index++) {
    let delta = pts[index]! - pts[index - 1]!;
    if (delta < -(2 ** 32)) delta += 2 ** 33;
    // Discontinuities and timestamp resets are excluded; frame intervals longer than one second do
    // not provide useful cadence evidence for the suite's video corpus.
    if (delta > 0 && delta <= 90_000) deltas.push(delta);
  }
  if (deltas.length < 2) return null;
  const ordered = [...deltas].sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)]!;
  const inliers = deltas.filter((delta) => Math.abs(delta - median) <= Math.max(2, median * 0.25));
  if (inliers.length < 2) return null;
  const ticks = inliers.reduce((sum, delta) => sum + delta, 0);
  const fps = (inliers.length * 90_000) / ticks;
  const cadence = Math.max(...inliers) - Math.min(...inliers) <= Math.max(2, median * 0.001)
    ? 'CFR'
    : 'VFR';
  return {
    fps,
    sampleCount: inliers.length,
    observedIntervalUs: (ticks * 1_000_000) / 90_000,
    cadence,
  };
}

function withTsAacMetadataFromBytes(
  metadata: NormalizedMetadata,
  bytes: Uint8Array,
): NormalizedMetadata {
  if (metadata.container !== 'ts') return metadata;
  const tracks = [...metadata.tracks];
  const missingAacTracks: number[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]!;
    if (
      track.type === 'audio' &&
      track.codec === 'aac' &&
      (track.sampleRate == null || track.channels == null)
    ) {
      missingAacTracks.push(i);
    }
  }
  if (missingAacTracks.length !== 1) return metadata;
  const config = aacAudioConfigFromMpegTs(bytes);
  if (!config) return metadata;
  const trackIndex = missingAacTracks[0]!;
  const track = tracks[trackIndex]!;
  tracks[trackIndex] = {
    ...track,
    sampleRate: track.sampleRate ?? config.sampleRate,
    channels: track.channels ?? config.channels,
  };
  return {
    ...metadata,
    tracks,
    tags: {
      ...(metadata.tags ?? {}),
      [`webDemuxer.audioConfig.${trackIndex}`]: 'adts-core',
    },
  };
}

export async function withTsAacMetadataFromInput(
  input: MediaInput,
  metadata: NormalizedMetadata,
  signal?: AbortSignal,
): Promise<NormalizedMetadata> {
  throwIfAborted(signal);
  if (metadata.container !== 'ts') return metadata;
  const bytes = new Uint8Array(await raceAbort(input.arrayBuffer(), signal));
  return withTsAacMetadataFromBytes(metadata, bytes);
}

/** Normalize one WebAVStream to a NormalizedTrack. */
export function normalizeWebDemuxerStream(stream: WebAVStream): NormalizedTrack {
  const type = trackTypeOf(stream);
  const bitrate = bitrateOf(stream.bit_rate);
  const language = languageOf(stream.tags);

  if (type === 'video') {
    const track: NormalizedTrack = {
      type: 'video',
      codec: canonicalCodec(stream.codec_name),
      ...(stream.codec_string ? { nativeCodecTag: stream.codec_string } : {}),
      width: stream.width || undefined,
      height: stream.height || undefined,
      rotation: normalizeWebDemuxerRotation(stream.rotation || 0),
      bitrate,
      language,
    };
    return applyFrameRateEvidence(track, stream);
  }

  if (type === 'audio') {
    const codec = canonicalCodec(stream.codec_name);
    const aac = codec === 'aac' ? parseAacAudioSpecificConfig(stream.extradata) : undefined;
    return {
      type: 'audio',
      codec,
      ...(stream.codec_string ? { nativeCodecTag: stream.codec_string } : {}),
      sampleRate: aac?.presentationSampleRate ?? (stream.sample_rate || undefined),
      channels: aac?.presentationChannels ?? (stream.channels || undefined),
      ...(aac?.codedSampleRate !== undefined ? { codedSampleRate: aac.codedSampleRate } : {}),
      ...(aac?.presentationSampleRate !== undefined
        ? { presentationSampleRate: aac.presentationSampleRate }
        : {}),
      ...(aac?.codedChannels !== undefined ? { codedChannels: aac.codedChannels } : {}),
      ...(aac?.presentationChannels !== undefined
        ? { presentationChannels: aac.presentationChannels }
        : {}),
      ...(aac ? { sbrPresent: aac.sbrPresent, psPresent: aac.psPresent } : {}),
      bitrate,
      language,
    };
  }

  return {
    type,
    codec: canonicalCodec(stream.codec_name) || 'unknown',
    bitrate,
    language,
  };
}

/** web-demuxer/FFmpeg reports the counter-clockwise matrix angle; the suite contract is clockwise. */
export function normalizeWebDemuxerRotation(rotation: number): number {
  const counterClockwise = ((rotation % 360) + 360) % 360;
  return counterClockwise === 0 ? 0 : 360 - counterClockwise;
}

interface EbmlElement {
  id: number;
  bodyStart: number;
  bodyEnd: number;
}

function readEbmlVint(
  bytes: Uint8Array,
  offset: number,
  keepMarker: boolean,
): { value: number; length: number; unknown: boolean } | null {
  const first = bytes[offset];
  if (first == null || first === 0) return null;
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && (first & marker) === 0) {
    length++;
    marker >>= 1;
  }
  if (length > 8 || offset + length > bytes.byteLength) return null;
  let value = keepMarker ? first : first & (marker - 1);
  let unknown = !keepMarker && (first & (marker - 1)) === marker - 1;
  for (let index = 1; index < length; index++) {
    const next = bytes[offset + index]!;
    value = value * 256 + next;
    unknown &&= next === 0xff;
  }
  if (!Number.isSafeInteger(value) && !unknown) return null;
  return { value, length, unknown };
}

function ebmlChildren(bytes: Uint8Array, start: number, end: number): EbmlElement[] {
  const children: EbmlElement[] = [];
  let offset = start;
  while (offset < end) {
    const id = readEbmlVint(bytes, offset, true);
    if (!id) break;
    const size = readEbmlVint(bytes, offset + id.length, false);
    if (!size) break;
    const bodyStart = offset + id.length + size.length;
    const bodyEnd = size.unknown ? end : bodyStart + size.value;
    if (bodyStart > end || bodyEnd > end || bodyEnd < bodyStart) break;
    children.push({ id: id.value, bodyStart, bodyEnd });
    if (size.unknown) break;
    offset = bodyEnd;
  }
  return children;
}

function matroskaDefaultDispositions(bytes: Uint8Array): boolean[] | null {
  const segment = ebmlChildren(bytes, 0, bytes.byteLength).find((element) => element.id === 0x18538067);
  if (!segment) return null;
  const tracks = ebmlChildren(bytes, segment.bodyStart, segment.bodyEnd)
    .find((element) => element.id === 0x1654ae6b);
  if (!tracks) return null;
  const dispositions: boolean[] = [];
  for (const entry of ebmlChildren(bytes, tracks.bodyStart, tracks.bodyEnd)) {
    if (entry.id !== 0xae) continue;
    const flag = ebmlChildren(bytes, entry.bodyStart, entry.bodyEnd)
      .find((element) => element.id === 0x88);
    // Matroska FlagDefault defaults to 1 when the element is absent.
    if (!flag) {
      dispositions.push(true);
      continue;
    }
    let value = 0;
    for (let offset = flag.bodyStart; offset < flag.bodyEnd; offset++) {
      value = value * 256 + bytes[offset]!;
    }
    dispositions.push(value !== 0);
  }
  return dispositions.length ? dispositions : null;
}

function isoBmffMajorBrand(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 16) return null;
  const type = String.fromCharCode(...bytes.subarray(4, 8));
  if (type !== 'ftyp') return null;
  return String.fromCharCode(...bytes.subarray(8, 12));
}

interface IsoBoxHeader {
  offset: number;
  headerSize: number;
  end: number;
  type: string;
}

function readIsoBoxHeader(bytes: Uint8Array, offset: number, limit: number): IsoBoxHeader | null {
  if (offset < 0 || offset + 8 > limit || limit > bytes.byteLength) return null;
  let size = (
    (bytes[offset]! * 0x1000000) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
  const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    const high = (
      (bytes[offset + 8]! * 0x1000000) +
      (bytes[offset + 9]! << 16) +
      (bytes[offset + 10]! << 8) +
      bytes[offset + 11]!
    );
    const low = (
      (bytes[offset + 12]! * 0x1000000) +
      (bytes[offset + 13]! << 16) +
      (bytes[offset + 14]! << 8) +
      bytes[offset + 15]!
    );
    size = high * 2 ** 32 + low;
    headerSize = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (!Number.isSafeInteger(size) || size < headerSize || offset + size > limit) return null;
  return { offset, headerSize, end: offset + size, type };
}

function findIsoChild(
  bytes: Uint8Array,
  start: number,
  end: number,
  type: string,
): IsoBoxHeader | null {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readIsoBoxHeader(bytes, offset, end);
    if (!box) return null;
    if (box.type === type) return box;
    offset = box.end;
  }
  return null;
}

function isoAudioSampleEntryChannels(bytes: Uint8Array): number[] {
  const moov = findIsoChild(bytes, 0, bytes.byteLength, 'moov');
  if (!moov) return [];
  const channels: number[] = [];
  let offset = moov.offset + moov.headerSize;
  while (offset + 8 <= moov.end) {
    const trak = readIsoBoxHeader(bytes, offset, moov.end);
    if (!trak) break;
    offset = trak.end;
    if (trak.type !== 'trak') continue;
    const mdia = findIsoChild(bytes, trak.offset + trak.headerSize, trak.end, 'mdia');
    const minf = mdia ? findIsoChild(bytes, mdia.offset + mdia.headerSize, mdia.end, 'minf') : null;
    const stbl = minf ? findIsoChild(bytes, minf.offset + minf.headerSize, minf.end, 'stbl') : null;
    const stsd = stbl ? findIsoChild(bytes, stbl.offset + stbl.headerSize, stbl.end, 'stsd') : null;
    if (!stsd) continue;
    const entryOffset = stsd.offset + stsd.headerSize + 8;
    const entry = readIsoBoxHeader(bytes, entryOffset, stsd.end);
    if (!entry || !['mp4a', 'enca', 'ac-3', 'ec-3', 'Opus', 'fLaC', 'alac'].includes(entry.type)) continue;
    const channelOffset = entry.offset + entry.headerSize + 16;
    if (channelOffset + 2 > entry.end) continue;
    const count = (bytes[channelOffset]! << 8) | bytes[channelOffset + 1]!;
    if (count > 0) channels.push(count);
  }
  return channels;
}

export function probeMetadataWithByteEvidence(
  metadata: NormalizedMetadata,
  bytes: Uint8Array,
): NormalizedMetadata {
  let enriched = withTsAacMetadataFromBytes(metadata, bytes);

  if (enriched.container === 'mp4' || enriched.container === 'mov') {
    const majorBrand = isoBmffMajorBrand(bytes);
    const audioChannels = isoAudioSampleEntryChannels(bytes);
    let audioIndex = 0;
    const tracks = enriched.tracks.map((track) => {
      if (track.type !== 'audio') return track;
      const channelCount = audioChannels[audioIndex++];
      return channelCount == null
        ? track
        : { ...track, channels: channelCount, presentationChannels: channelCount };
    });
    enriched = { ...enriched, tracks };
    if (majorBrand) {
      enriched = { ...enriched, tags: { ...(enriched.tags ?? {}), major_brand: majorBrand } };
    }
  }

  if (enriched.container === 'webm' || enriched.container === 'mkv') {
    const dispositions = matroskaDefaultDispositions(bytes);
    if (dispositions) {
      enriched = {
        ...enriched,
        tracks: enriched.tracks.map((track, index) =>
          dispositions[index] === undefined
            ? track
            : { ...track, defaultDisposition: dispositions[index] },
        ),
      };
    }
  }

  if (enriched.container === 'ts') {
    const evidence = tsVideoFrameRateFromMpegTs(bytes);
    const videoIndices = enriched.tracks
      .map((track, index) => track.type === 'video' ? index : -1)
      .filter((index) => index >= 0);
    if (evidence && videoIndices.length === 1) {
      const trackIndex = videoIndices[0]!;
      const track = enriched.tracks[trackIndex]!;
      if (track.fps == null || (
        track.fps > 120 &&
        Math.abs(track.fps - evidence.fps) > Math.max(0.01, evidence.fps * 0.001)
      )) {
        const tracks = [...enriched.tracks];
        tracks[trackIndex] = {
          ...track,
          fps: evidence.fps,
          fpsProvenance: {
            source: 'observed',
            cadence: evidence.cadence,
            sampleCount: evidence.sampleCount,
            observedIntervalUs: evidence.observedIntervalUs,
          },
        };
        enriched = { ...enriched, tracks };
      }
    }
  }

  return enriched;
}

/** Build NormalizedMetadata from a WebMediaInfo (+ optional stream details from getAVStreams). */
function toNormalizedMetadata(
  info: WebMediaInfo,
  input: MediaInput,
  supplementalStreams?: WebAVStream[],
): NormalizedMetadata {
  const container = canonicalContainer(info.format_name, input);
  const durationSec =
    Number.isFinite(info.duration) && info.duration > 0 ? info.duration : null;
  const streams = mergeNormalizedStreams(info.streams ?? [], supplementalStreams ?? []);
  const tracks = streams.map(normalizeWebDemuxerStream);

  const meta: NormalizedMetadata = { container, durationSec, tracks };

  // Surface chapter count + any container-level flags as descriptive tags (best-effort).
  const tags: Record<string, string> = {};
  if (typeof info.nb_chapters === 'number' && info.nb_chapters > 0) {
    tags.nb_chapters = String(info.nb_chapters);
  }
  // Hoist common per-stream tags (title/artist/…) from the first stream that carries them, since
  // FFmpeg attaches container-level metadata to streams in WebMediaInfo's shape.
  for (const s of streams) {
    for (const [k, v] of Object.entries(s.tags ?? {})) {
      const key = k.toLowerCase();
      if (
        (key === 'title' ||
          key === 'artist' ||
          key === 'album' ||
          key === 'comment' ||
          key === 'encoder' ||
          key === 'date') &&
        !(key in tags) &&
        v
      ) {
        tags[key] = v;
      }
    }
  }
  if (Object.keys(tags).length) meta.tags = tags;

  return meta;
}

/** A FrameSink backed by digests + retained ImageData for SSIM/PSNR pixel access. */
class RetainingFrameSink implements FrameSink {
  frames: FrameDigest[] = [];
  selectedTrack?: FrameSink['selectedTrack'];
  telemetry?: FrameSink['telemetry'];
  private pixels: ImageData[] = [];

  add(digest: FrameDigest, img: ImageData): void {
    this.frames.push(digest);
    this.pixels.push(img);
  }

  getPixels = async (i: number): Promise<ImageData> => {
    const img = this.pixels[i];
    if (!img) throw new Error(`${ENGINE_ID}: no pixels retained for frame ${i}`);
    return img;
  };
}

function hasVideoDecoder(): boolean {
  return (
    typeof (globalThis as Record<string, unknown>).VideoDecoder === 'function' &&
    typeof (globalThis as Record<string, unknown>).EncodedVideoChunk === 'function'
  );
}

export interface WebDemuxerConfigUsed {
  framework: 'web-demuxer';
  packageVersions: { 'web-demuxer': '4.0.0' };
  backend: 'worker-ffmpeg-wasm';
  hardwareAcceleration: 'browser-default-unexposed';
  workerCount: 1;
  threadCount: 0;
  readerMode: 'package-stream-or-bounded-iso-bmff-range';
  writerMode: 'none';
  targetMode: 'none';
  codecConfigs: VideoDecoderConfig[];
  package: 'web-demuxer@4.0.0';
  lockIntegrity: string;
  wasmExport: 'web-demuxer/wasm';
  wasmFlavor: 'full';
  wasmUrlPolicy: 'same-origin';
  wasmTransport: 'same-origin-url' | 'same-origin-materialized-data-url';
  readinessBoundary: 'init-load-barrier';
  cleanupBoundary: 'cancel-readers-close-frames-destroy-worker';
  parserBackend: 'worker-ffmpeg-wasm';
  limits: {
    packetRows: number;
    decodedFrames: number;
    retainedPixelBytes: number;
    seekChunks: number;
  };
  lastDemuxBackend?: 'worker-ffmpeg-wasm' | 'iso-bmff-sample-table';
  lastDecoderConfig?: VideoDecoderConfig;
  lifecycle: {
    initAttempts: number;
    readyCount: number;
    loadCount: number;
    destroyCount: number;
    readinessMs?: number;
  };
}

export interface WebDemuxerEngineDependencies {
  importModule?: () => Promise<Pick<typeof import('web-demuxer'), 'WebDemuxer'>>;
  wasmAssetUrl?: string;
  locationHref?: string;
  now?: () => number;
  workerRealm?: boolean;
  fetchWasm?: (url: string, signal?: AbortSignal) => Promise<Uint8Array>;
}

/**
 * web-demuxer engine: probe + demux + seek (lossless, browser-codec-independent) and optional
 * decodeFrames (browser-codec-gated WebCodecs decode). The heavy WASM is compiled once in init()
 * inside the bundled worker; dispose() terminates it for clean peak-memory.
 */
export class WebDemuxerEngine implements MediaEngine {
  readonly id = ENGINE_ID;
  readonly configUsed: WebDemuxerConfigUsed = {
    framework: 'web-demuxer',
    packageVersions: { 'web-demuxer': '4.0.0' },
    backend: 'worker-ffmpeg-wasm',
    hardwareAcceleration: 'browser-default-unexposed',
    workerCount: 1,
    threadCount: 0,
    readerMode: 'package-stream-or-bounded-iso-bmff-range',
    writerMode: 'none',
    targetMode: 'none',
    codecConfigs: [],
    package: 'web-demuxer@4.0.0',
    lockIntegrity: 'sha512-QFsKe8SNjP6MDtAw2lWfyVmX2wXIpDUT+9p2KHXJb5OPWdhVbjBHcV06tDMXzuU1T6Y1P9TRm9bkeVXEwy0dVw==',
    wasmExport: 'web-demuxer/wasm',
    wasmFlavor: 'full',
    wasmUrlPolicy: 'same-origin',
    wasmTransport: 'same-origin-url',
    readinessBoundary: 'init-load-barrier',
    cleanupBoundary: 'cancel-readers-close-frames-destroy-worker',
    parserBackend: 'worker-ffmpeg-wasm',
    limits: {
      packetRows: MAX_PACKET_ROWS,
      decodedFrames: MAX_DECODE_FRAMES,
      retainedPixelBytes: MAX_RETAINED_PIXEL_BYTES,
      seekChunks: MAX_SEEK_CHUNKS,
    },
    lifecycle: { initAttempts: 0, readyCount: 0, loadCount: 0, destroyCount: 0 },
  };

  /** Library constructor, captured in init() (dynamic import keeps the suite shell light). */
  private WebDemuxerCtor: typeof WebDemuxerType | null = null;
  /** Reused demuxer instance so the WASM compiles ONCE; each op load()s its own input. */
  private demuxer: WebDemuxerType | null = null;
  private lifecycleState: 'new' | 'initializing' | 'ready' | 'disposing' | 'disposed' = 'new';
  private initPromise: Promise<void> | null = null;
  private disposePromise: Promise<void> | null = null;
  private readonly dependencies: Required<Pick<WebDemuxerEngineDependencies, 'importModule' | 'now'>> &
    Omit<WebDemuxerEngineDependencies, 'importModule' | 'now'>;

  constructor(dependencies: WebDemuxerEngineDependencies = {}) {
    this.dependencies = {
      importModule: dependencies.importModule ?? (() => import('web-demuxer')),
      now: dependencies.now ?? nowMs,
      ...(dependencies.wasmAssetUrl !== undefined ? { wasmAssetUrl: dependencies.wasmAssetUrl } : {}),
      ...(dependencies.locationHref !== undefined ? { locationHref: dependencies.locationHref } : {}),
      ...(dependencies.workerRealm !== undefined ? { workerRealm: dependencies.workerRealm } : {}),
      ...(dependencies.fetchWasm !== undefined ? { fetchWasm: dependencies.fetchWasm } : {}),
    };
  }

  capabilities(): CapabilitySet {
    return {
      // The support(request) hook narrows these flat discovery facts by complete operation tuple.
      // decodeFrames/seek additionally probe the exact browser decoder config immediately before use.
      operations: {
        probe: true,
        demux: true,
        seek: true,
        decodeFrames: true,
      },
      // TS remains declared because parser-only probe is valid; packet/decode/seek tuples self-NA.
      containersIn: [...WEB_DEMUXER_INPUT_CONTAINERS],
      // Demuxer writes nothing.
      containersOut: [],
      // Codecs web-demuxer can identify + packetize from these containers. Pixel decode (decodeFrames
      // / seek) routes through the browser's WebCodecs and self-gates via isConfigSupported().
      videoCodecs: [...WEB_DEMUXER_VIDEO_CODECS],
      audioCodecs: [...WEB_DEMUXER_AUDIO_CODECS],
      encryption: [],
      // 'metadata:read' : probe reads container/duration/dims/fps/rotation/language/tags.
      // 'multitrack'    : demux reads EVERY stream (incl. 2nd+ same-type tracks) via each stream's
      //                   absolute WebAVStream.index and labels each packet with that same index.
      // 'metadata:protected-tracks' : probe reports encrypted MP4 track metadata without decrypting.
      // 'rotation:read' : surfaces WebAVStream.rotation in NormalizedTrack.rotation.
      // 'seek:keyframe' : seek() lands on the preceding keyframe (AVSEEK_FLAG_BACKWARD).
      features: [
        'metadata:read',
        'metadata:protected-tracks',
        'multitrack',
        'rotation:read',
        'seek:keyframe',
        'decode:golden-rgba',
      ],
      probeReadModes: ['whole-file'],
    };
  }

  supports(request: ConcreteOperationRequest): SupportDecision {
    return decideWebDemuxerSupport(request);
  }

  async init(context?: LifecycleContext): Promise<void> {
    if (this.lifecycleState === 'ready') return;
    if (this.lifecycleState === 'disposed' || this.lifecycleState === 'disposing') {
      throw new Error(`${ENGINE_ID}: init() cannot follow dispose()`);
    }
    if (this.initPromise) return this.initPromise;
    this.lifecycleState = 'initializing';
    this.configUsed.lifecycle.initAttempts++;
    this.initPromise = this.initialize(context);
    try {
      await this.initPromise;
      this.lifecycleState = 'ready';
      this.configUsed.lifecycle.readyCount++;
    } catch (error) {
      this.lifecycleState = 'new';
      throw error;
    } finally {
      this.initPromise = null;
    }
  }

  private async initialize(context?: LifecycleContext): Promise<void> {
    const startedAt = this.dependencies.now();
    throwIfAborted(context?.signal);
    let mod: Pick<typeof import('web-demuxer'), 'WebDemuxer'>;
    try {
      mod = await raceAbort(this.dependencies.importModule(), context?.signal);
    } catch (error) {
      if (isNamedError(error, 'AbortError')) throw error;
      throw new Error(`${ENGINE_ID}: failed to import web-demuxer: ${describeError(error)}`, { cause: error });
    }
    this.WebDemuxerCtor = mod.WebDemuxer;
    const baseHref = this.dependencies.locationHref ?? globalThis.location?.href ?? 'http://localhost/';
    const absWasmUrl = new URL(this.dependencies.wasmAssetUrl ?? wasmUrl, baseHref).href;
    const base = new URL(baseHref);
    const resolved = new URL(absWasmUrl);
    if ((base.protocol === 'http:' || base.protocol === 'https:') && resolved.origin !== base.origin) {
      throw new Error(`${ENGINE_ID}: refusing cross-origin WASM URL ${absWasmUrl}`);
    }
    const workerRealm = this.dependencies.workerRealm ?? (
      typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope
    );
    let packageWasmUrl = absWasmUrl;
    if (workerRealm) {
      const bytes = this.dependencies.fetchWasm
        ? await raceAbort(this.dependencies.fetchWasm(absWasmUrl, context?.signal), context?.signal)
        : await fetchSameOriginWasm(absWasmUrl, context?.signal);
      packageWasmUrl = wasmDataUrlFromBytes(bytes);
      this.configUsed.wasmTransport = 'same-origin-materialized-data-url';
    }
    try {
      const demuxer = new this.WebDemuxerCtor({ wasmFilePath: packageWasmUrl });
      this.demuxer = demuxer;
      // load() first awaits the package's private worker/WASM readiness promise and only then stores
      // the source. A zero-byte sentinel therefore provides a public readiness barrier without parse.
      await raceAbort(
        demuxer.load('data:application/octet-stream;base64,'),
        context?.signal,
        () => this.destroyDemuxer(),
      );
      this.configUsed.lifecycle.readinessMs = this.dependencies.now() - startedAt;
    } catch (error) {
      try {
        this.destroyDemuxer();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], `${ENGINE_ID}: readiness and cleanup both failed`);
      }
      if (isNamedError(error, 'AbortError')) throw error;
      throw new Error(
        `${ENGINE_ID}: failed to construct/ready WebDemuxer (wasmFilePath=${absWasmUrl}): ${describeError(error)}`,
        { cause: error },
      );
    }
  }

  async dispose(context?: LifecycleContext): Promise<void> {
    if (this.lifecycleState === 'disposed') return;
    if (this.disposePromise) return this.disposePromise;
    this.lifecycleState = 'disposing';
    this.disposePromise = (async () => {
      if (this.initPromise) {
        try {
          await this.initPromise;
        } catch {
          // Initialization failure is reported by init(); disposal still completes owned cleanup.
        }
      }
      // Disposal is mandatory cleanup. An already-aborted cell signal must not skip worker teardown.
      void context;
      this.destroyDemuxer();
      this.WebDemuxerCtor = null;
      this.lifecycleState = 'disposed';
    })();
    try {
      await this.disposePromise;
    } finally {
      this.disposePromise = null;
    }
  }

  private destroyDemuxer(): void {
    const demuxer = this.demuxer;
    if (!demuxer) return;
    this.demuxer = null;
    demuxer.destroy();
    this.configUsed.lifecycle.destroyCount++;
  }

  private requireDemuxer(): WebDemuxerType {
    if (!this.demuxer) throw new Error(`${ENGINE_ID}: init() must be called before use`);
    return this.demuxer;
  }

  /** Load a MediaInput into the demuxer worker. web-demuxer's load() takes a File|URL string. Normal
   *  HTTP corpus assets use their same-origin URL so huge probes do not materialize multi-GB Blobs.
   *  Object URLs are realm-local and cannot be fetched by the package worker, so runner-created
   *  blob inputs (as well as mutated inputs) must cross the boundary as a File. */
  private async loadInput(input: MediaInput, context?: OperationContext): Promise<WebDemuxerType> {
    const d = this.requireDemuxer();
    throwIfAborted(context?.signal);
    this.configUsed.lifecycle.loadCount++;
    if (!input.mutated && !/^blob:/i.test(input.url)) {
      await raceAbort(d.load(input.url), context?.signal, () => this.destroyDemuxer());
      return d;
    }
    const blob = await raceAbort(input.blob(), context?.signal, () => this.destroyDemuxer());
    const name = input.id || 'input';
    // File extends Blob; the worker reads from it via FFmpeg's IO shim. Type set from the blob.
    const file = new File([blob], name, { type: blob.type || input.mime || 'application/octet-stream' });
    await raceAbort(d.load(file), context?.signal, () => this.destroyDemuxer());
    return d;
  }

  // ── probe ────────────────────────────────────────────────────────────────────────────────────

  async probe(input: MediaInput, context?: OperationContext): Promise<NormalizedMetadata> {
    try {
      const d = await this.loadInput(input, context);
      const info = await raceAbort(d.getMediaInfo(), context?.signal, () => this.destroyDemuxer());
      const streams = await raceAbort(d.getAVStreams(), context?.signal, () => this.destroyDemuxer());
      const metadata = toNormalizedMetadata(info, input, streams);
      const bytes = new Uint8Array(await raceAbort(input.arrayBuffer(), context?.signal, () => this.destroyDemuxer()));
      const normalized = probeMetadataWithByteEvidence(metadata, bytes);
      normalized.probeEvidence = { readMode: 'whole-file' };
      return normalized;
    } catch (error) {
      if (
        isGracefulNegativeContext(context) &&
        !isMalformedInputError(error) &&
        !mustPreserveError(error)
      ) {
        throw createMalformedInputError(
          ENGINE_ID,
          'probe',
          'parse',
          describeError(error),
          'WEB_DEMUXER_PROBE_MALFORMED_INPUT_REJECTED',
          input.id,
          error,
        );
      }
      if (mustPreserveError(error) || error instanceof Error) throw error;
      throw new Error(`${ENGINE_ID}: probe failed: ${describeError(error)}`);
    }
  }

  // ── demux ────────────────────────────────────────────────────────────────────────────────────

  /**
   * Emit a packet table covering EVERY stream (including 2nd+ tracks of the same media type). We drain
   * the low-level `readAVPacket(start, end, streamType, streamIndex)` ReadableStream PER STREAM (the v4
   * non-ASYNCIFY read path, dossier §3/§6) with a getReader() loop — the documented streaming fast
   * path that the v4 "refactor read_av_packet to non-ASYNCIFY" release made work cross-browser.
   *
   * Stream addressing (verified against node_modules/web-demuxer/dist/web-demuxer.{d.ts,js}):
   *   - `readAVPacket(start, end, streamType, streamIndex, seekFlag)` passes `streamIndex` through to
   *     web-demuxer's AVPacketReader as the media stream's absolute WebAVStream.index. `streamIndex`
   *     defaults to -1 = best stream.
   *   - The convenience `readMediaPacket(type, …)` hardwires that streamIndex to undefined → -1, so it
   *     can read ONLY the best stream of each type and SILENTLY DROPS additional same-type tracks. We
   *     therefore call readAVPacket directly with each stream's absolute index so multi-track inputs
   *     (e.g. video + 2 audio) are read in full. (`read('video')`, used by decodeFrames below, is this
   *     very readAVPacket path — there is no "AVPacketReader.create failed" limitation in v4.)
   *   - trackIndex is set to the same absolute WebAVStream.index so it lines up with the
   *     NormalizedMetadata.tracks ordering (getMediaInfo().streams / getAVStreams() are index-aligned).
   *
   * Each WebAVPacket carries only a presentation timestamp (SECONDS) and a 0|1 keyframe flag. DTS is
   * absent rather than fabricated. Packet payloads are inspected for semantic framing/random-access
   * evidence but are not retained in the normalized row.
   */
  async demux(input: MediaInput, context?: OperationContext): Promise<DemuxResult> {
    try {
      return await this.demuxUnchecked(input, context);
    } catch (error) {
      if (
        isGracefulNegativeContext(context) &&
        !isMalformedInputError(error) &&
        !mustPreserveError(error)
      ) {
        throw createMalformedInputError(
          ENGINE_ID,
          'demux',
          'parse',
          describeError(error),
          'WEB_DEMUXER_DEMUX_MALFORMED_INPUT_REJECTED',
          input.id,
          error,
        );
      }
      throw error;
    }
  }

  private async demuxUnchecked(input: MediaInput, context?: OperationContext): Promise<DemuxResult> {
    if (shouldUseProgressiveMp4SampleTableFastPath(input)) {
      this.configUsed.lastDemuxBackend = 'iso-bmff-sample-table';
      return demuxProgressiveMp4SampleTable(input, {
        signal: context?.signal,
        emit: context?.emit,
      });
    }

    this.configUsed.lastDemuxBackend = 'worker-ffmpeg-wasm';
    const startedAt = this.dependencies.now();
    const d = await this.loadInput(input, context);
    const info = await raceAbort(d.getMediaInfo(), context?.signal, () => this.destroyDemuxer());
    const supplementalStreams = await raceAbort(d.getAVStreams(), context?.signal, () => this.destroyDemuxer());
    const streams = mergeNormalizedStreams(info.streams ?? [], supplementalStreams);
    let metadata = toNormalizedMetadata({ ...info, streams }, input);
    const indexMap = streamIndexToTrackIndex(streams);

    // web-demuxer occasionally omits ISO codec extradata from both stream views even though the
    // source sample entry carries it. Recover only that owned configuration-record evidence from
    // the bounded ISO sample-table reader; packet payload/timing remains package-produced below.
    let isoRepresentations: DemuxResult['representations'];
    let isoPackets: PacketInfo[] | undefined;
    if (!input.mutated && (metadata.container === 'mp4' || metadata.container === 'mov')) {
      try {
        const bytes = new Uint8Array(await raceAbort(
          input.arrayBuffer(),
          context?.signal,
          () => this.destroyDemuxer(),
        ));
        const isoEvidence = parseProgressiveMp4SampleTableBytes(bytes);
        isoRepresentations = isoEvidence.representations;
        isoPackets = isoEvidence.packets;
        metadata = probeMetadataWithByteEvidence(metadata, bytes);
      } catch (error) {
        if (isNamedError(error, 'AbortError')) throw error;
        // Fragmented and unusual valid ISO layouts can be outside the bounded supplemental reader;
        // the package packet path remains independently usable without that optional evidence.
      }
    }

    // readAVPacket bounds are SECONDS of media time; an end past the duration drains to EOF.
    const endSec = Number.isFinite(info.duration) && info.duration > 0 ? info.duration + 1 : 1e9;

    // MPEG-TS probe is valid, but the pinned package's packet-stream constructor is not. Decide this
    // from the concrete container before reading; never infer applicability from worker message text.
    const isTsInput = metadata.container === 'ts';
    if (isTsInput && !input.mutated) {
      throw createNotApplicableError(
        ENGINE_ID,
        'demux',
        'web-demuxer v4.0.0 cannot construct an AVPacketReader for MPEG-TS packet streams',
        { inputContainers: ['ts'], inputCodecs: [], outputCodecs: [] },
        WEB_DEMUXER_REASON.TS_PACKETS,
      );
    }

    if (streams.some((stream) => trackTypeOf(stream) === 'other') && !input.mutated) {
      throw createNotApplicableError(
        ENGINE_ID,
        'demux',
        'web-demuxer does not expose packet reads for data/attachment tracks',
        context ? webDemuxerTupleSummary(context.request) : { inputContainers: [metadata.container] },
        WEB_DEMUXER_REASON.TRACK_TYPE,
      );
    }

    const packets: PacketInfo[] = [];
    const representations: NonNullable<DemuxResult['representations']> = [];
    let packetBytes = 0;
    for (const stream of streams) {
      throwIfAborted(context?.signal);
      const type = trackTypeOf(stream);
      if (!isPacketizedTrackType(type)) continue; // skip data/attachment streams we don't packetize
      const avType = avMediaTypeOf(type);
      const trackIndex = indexMap.get(stream.index);
      if (trackIndex === undefined) throw new Error(`${ENGINE_ID}: stream ${stream.index} has no normalized track mapping`);
      const codec = metadata.tracks[trackIndex]?.codec;
      if (!codec) throw new Error(`${ENGINE_ID}: normalized track ${trackIndex} has no codec`);
      const isoRepresentation = isoRepresentations?.find((item) => item.trackIndex === trackIndex);
      const evidenceStream = !stream.extradata?.byteLength && isoRepresentation?.description?.byteLength
        ? { ...stream, extradata: isoRepresentation.description.slice() }
        : stream;
      const accumulator = createTrackEvidenceAccumulator(trackIndex, type, codec, evidenceStream);
      const reader = d.readAVPacket(0, endSec, avType, stream.index).getReader();
      let completed = false;
      let primaryError: unknown;
      try {
        for (;;) {
          const { done, value } = await raceAbort(reader.read(), context?.signal, () => {
            void reader.cancel(context?.signal.reason).catch(() => undefined);
          });
          if (done) {
            completed = true;
            break;
          }
          const pkt = value as WebAVPacket;
          if (packets.length >= MAX_PACKET_ROWS) {
            throw createNotApplicableError(
              ENGINE_ID,
              'demux',
              `packet row budget ${MAX_PACKET_ROWS} exceeded`,
              context ? webDemuxerTupleSummary(context.request) : { inputContainers: [metadata.container] },
              WEB_DEMUXER_REASON.MEMORY_BUDGET,
            );
          }
          packets.push(await packetEvidenceFromWebPacket(pkt, accumulator, context?.signal));
          packetBytes += pkt.data.byteLength;
          context?.emit({ type: 'bytes-read', atMs: this.dependencies.now() - startedAt, bytes: packetBytes });
        }
      } catch (err) {
        primaryError = err;
        throw err; // malformed/corrupt/worker failures remain ordinary ERROR/FAIL evidence
      } finally {
        await settleReader(reader, completed, primaryError);
      }
      const representation = finishTrackRepresentation(accumulator);
      if (representation) representations.push(representation);
    }

    // Stable presentation ordering. The package exposes no DTS; absence remains explicit. For ISO,
    // stss is the source-authoritative sync flag. Apply it only after every package row binds uniquely
    // to one sample-table row by track, PTS, and physical size.
    const normalizedPackets = normalizeIsoPacketKeyframes(packets, isoPackets);
    normalizedPackets.sort((a, b) => a.ptsUs - b.ptsUs || a.trackIndex - b.trackIndex);
    const telemetry = { bytesRead: packetBytes, packetCount: packets.length };
    metadata.telemetry = telemetry;
    return {
      metadata,
      packets: normalizedPackets,
      packetOrdering: 'presentation',
      representations,
      telemetry,
      backendEvidence: {
        backend: 'worker-ffmpeg-wasm',
        package: ENGINE_ID,
        packetCount: packets.length,
        payloadBytesObserved: packetBytes,
        payloadEvidence: 'semantic-access-unit-id+raw-payload-sha256-when-webcrypto-present',
        dtsEvidence: 'absent',
        peakRetainedBytesEstimate:
          packetBytes
          + packets.length * 256
          + representations.reduce((sum, item) => sum + (item.description?.byteLength ?? 0), 0),
        trackIndexMap: Object.fromEntries([...indexMap.entries()].map(([source, normalized]) => [String(source), normalized])),
      },
    } as DemuxResult;
  }

  // ── decodeFrames ─────────────────────────────────────────────────────────────────────────────

  /**
   * Decode the selected package video stream with one exact, pre-probed VideoDecoderConfig. Callback
   * order is not trusted: a bounded selector retains the lowest real PTS values and sorts them before
   * raster/digest. Any later reader/decoder failure invalidates the surviving partial frames.
   */
  async decodeFrames(
    input: MediaInput,
    opts?: DecodeOptions,
    context?: OperationContext,
  ): Promise<FrameSink> {
    const startedAt = this.dependencies.now();
    const prepared = await this.prepareVideoRuntime(input, 'decodeFrames', context, opts?.track);
    const maxFrames = resolveDecodeFrameLimit(
      opts?.maxFrames,
      prepared.stream,
      prepared.config,
      context,
    );
    const sink = new RetainingFrameSink();
    if (maxFrames === 0) {
      sink.telemetry = { decodedFrames: 0 };
      return sink;
    }

    const collected: TimedClosable<VideoFrame>[] = [];
    const exhaustive = opts?.maxFrames === undefined;
    const decodeTuple = context ? webDemuxerTupleSummary(context.request) : {};
    let callbackCount = 0;
    let firstFrameMs: number | undefined;
    let callbackError: unknown;
    let primaryError: unknown;
    let arrivalIndex = 0;
    const decoder = new VideoDecoder({
      output: (frame) => {
        callbackCount++;
        const atMs = this.dependencies.now() - startedAt;
        if (callbackCount === 1) {
          firstFrameMs = atMs;
          context?.emit({ type: 'first-frame', atMs });
        }
        context?.emit({ type: 'decoded-frame-count', atMs, count: callbackCount });
        if (exhaustive && callbackCount > maxFrames) {
          frame.close();
          callbackError ??= createNotApplicableError(
            ENGINE_ID,
            'decodeFrames',
            `unbounded decode exceeds retained frame budget ${maxFrames}`,
            decodeTuple,
            WEB_DEMUXER_REASON.MEMORY_BUDGET,
          );
          return;
        }
        retainLowestPts(
          collected,
          { ptsUs: Math.round(frame.timestamp), value: frame, arrivalIndex: arrivalIndex++ },
          maxFrames,
        );
      },
      error: (error) => {
        callbackError = error;
      },
    });

    const endSec = prepared.durationSec == null ? 1e9 : prepared.durationSec + 1;
    const reader = prepared.demuxer
      .readAVPacket(0, endSec, AV_MEDIA_VIDEO, prepared.stream.index)
      .getReader();
    let completed = false;
    let submittedChunks = 0;
    try {
      decoder.configure(prepared.config);
      for (;;) {
        throwIfAborted(context?.signal);
        if (callbackError !== undefined) {
          primaryError = callbackError;
          break;
        }
        const { done, value } = await raceAbort(reader.read(), context?.signal, () =>
          reader.cancel(context?.signal.reason),
        );
        if (done) {
          completed = true;
          break;
        }
        if (submittedChunks >= MAX_PACKET_ROWS) {
          primaryError = createNotApplicableError(
            ENGINE_ID,
            'decodeFrames',
            `decode exceeds encoded-chunk budget ${MAX_PACKET_ROWS}`,
            decodeTuple,
            WEB_DEMUXER_REASON.MEMORY_BUDGET,
          );
          break;
        }
        decoder.decode(prepared.demuxer.genEncodedChunk('video', value as WebAVPacket));
        submittedChunks++;
        if (decoder.decodeQueueSize >= 64) {
          await raceAbort(decoder.flush(), context?.signal, () => closeDecoder(decoder));
        }
      }
      if (primaryError === undefined) {
        await raceAbort(decoder.flush(), context?.signal, () => closeDecoder(decoder));
        if (callbackError !== undefined) primaryError = callbackError;
      }
    } catch (error) {
      primaryError = callbackError === undefined
        ? error
        : combineErrors(callbackError, error, 'web-demuxer decode callback and operation both failed');
    } finally {
      try {
        await settleReader(reader, completed);
      } catch (cleanupError) {
        primaryError = combineErrors(primaryError, cleanupError, 'web-demuxer decode reader cleanup failed');
      }
      try {
        closeDecoder(decoder);
      } catch (cleanupError) {
        primaryError = combineErrors(primaryError, cleanupError, 'web-demuxer decoder cleanup failed');
      }
    }

    if (primaryError !== undefined) {
      const emittedFrames = callbackCount;
      primaryError = closeFrameSet(collected, primaryError);
      if (emittedFrames > 0 && !mustPreserveError(primaryError)) {
        throw new WebDemuxerPartialDecodeError('decode', emittedFrames, primaryError);
      }
      throw primaryError;
    }

    sortByPresentationTime(collected);
    let outputError: unknown;
    try {
      for (let index = 0; index < collected.length; index++) {
        const { ptsUs, value: frame } = collected[index]!;
        const image = await imageDataFromVideoFrame(frame, context?.signal);
        sink.add(await digestImageData(image, index, ptsUs, context?.signal), image);
        if (index === 0) opts?.onFirstFrame?.(this.dependencies.now());
      }
    } catch (error) {
      outputError = error;
    }
    outputError = closeFrameSet(collected, outputError);
    if (outputError !== undefined) throw outputError;
    sink.telemetry = {
      decodedFrames: callbackCount,
      ...(firstFrameMs !== undefined ? { firstFrameMs } : {}),
    };
    sink.selectedTrack = {
      schema: DECODE_TRACK_SELECTOR_SCHEMA,
      type: 'video',
      trackIndex: prepared.trackIndex,
      typeOrdinal: prepared.typeOrdinal,
      codec: prepared.normalizedTrack.codec,
      ...(prepared.normalizedTrack.width !== undefined ? { width: prepared.normalizedTrack.width } : {}),
      ...(prepared.normalizedTrack.height !== undefined ? { height: prepared.normalizedTrack.height } : {}),
    };
    return sink;
  }

  // ── seek ─────────────────────────────────────────────────────────────────────────────────────

  /**
   * Seek backward with the selected low-level stream and decode until a real next-GOP boundary, not a
   * fixed time window. Sort callbacks by PTS and choose max PTS <= target (or earliest following), then
   * prove that timestamp came from submitted demux timing before returning pixels.
   */
  async seek(input: MediaInput, tUs: number, context?: OperationContext): Promise<SeekResult> {
    if (!Number.isFinite(tUs)) throw new TypeError(`${ENGINE_ID}: seek target must be finite`);
    const startedAt = this.dependencies.now();
    const prepared = await this.prepareVideoRuntime(input, 'seek', context);
    let targetSec = Math.max(0, tUs / 1_000_000);
    if (prepared.durationSec != null) {
      targetSec = Math.min(targetSec, Math.max(0, prepared.durationSec - 0.000001));
    }
    const targetUs = Math.round(targetSec * 1_000_000);
    const endSec = prepared.durationSec == null ? 1e9 : prepared.durationSec + 1;
    const decoded: TimedClosable<VideoFrame>[] = [];
    const submittedPtsUs: number[] = [];
    let callbackCount = 0;
    let firstFrameMs: number | undefined;
    let arrivalIndex = 0;
    let callbackError: unknown;
    let primaryError: unknown;
    const retainedFrameBudget = Math.max(
      1,
      Math.min(
        MAX_SEEK_CHUNKS,
        Math.floor(MAX_RETAINED_PIXEL_BYTES / Math.max(1, decoderPixelBytes(prepared.config))),
      ),
    );
    const tuple = context ? webDemuxerTupleSummary(context.request) : {};
    const decoder = new VideoDecoder({
      output: (frame) => {
        callbackCount++;
        const atMs = this.dependencies.now() - startedAt;
        if (callbackCount === 1) {
          firstFrameMs = atMs;
          context?.emit({ type: 'first-frame', atMs });
        }
        context?.emit({ type: 'decoded-frame-count', atMs, count: callbackCount });
        if (decoded.length >= retainedFrameBudget) {
          frame.close();
          callbackError ??= createNotApplicableError(
            ENGINE_ID,
            'seek',
            `seek GOP exceeds retained frame budget ${retainedFrameBudget}`,
            tuple,
            WEB_DEMUXER_REASON.MEMORY_BUDGET,
          );
          return;
        }
        decoded.push({ ptsUs: Math.round(frame.timestamp), value: frame, arrivalIndex: arrivalIndex++ });
      },
      error: (error) => {
        callbackError = error;
      },
    });

    const reader = prepared.demuxer
      .readAVPacket(targetSec, endSec, AV_MEDIA_VIDEO, prepared.stream.index, AV_SEEK_FLAG_BACKWARD)
      .getReader();
    let completed = false;
    let sawAtOrBeforeTarget = false;
    let keysAfterTarget = 0;
    try {
      decoder.configure(prepared.config);
      for (;;) {
        throwIfAborted(context?.signal);
        if (callbackError !== undefined) {
          primaryError = callbackError;
          break;
        }
        const { done, value } = await raceAbort(reader.read(), context?.signal, () =>
          reader.cancel(context?.signal.reason),
        );
        if (done) {
          completed = true;
          break;
        }
        if (submittedPtsUs.length >= MAX_SEEK_CHUNKS) {
          primaryError = createNotApplicableError(
            ENGINE_ID,
            'seek',
            `seek GOP exceeds packet budget ${MAX_SEEK_CHUNKS}`,
            tuple,
            WEB_DEMUXER_REASON.MEMORY_BUDGET,
          );
          break;
        }
        const chunk = prepared.demuxer.genEncodedChunk('video', value as WebAVPacket);
        const priorAtOrBefore = sawAtOrBeforeTarget;
        sawAtOrBeforeTarget ||= chunk.timestamp <= targetUs;
        if (chunk.type === 'key' && chunk.timestamp > targetUs) keysAfterTarget++;
        submittedPtsUs.push(Math.round(chunk.timestamp));
        decoder.decode(chunk);
        const reachedBoundary = seekGopProgressSatisfied(chunk, targetUs, priorAtOrBefore)
          || (!sawAtOrBeforeTarget && keysAfterTarget >= 2);
        if (decoder.decodeQueueSize >= 64 || reachedBoundary) {
          await raceAbort(decoder.flush(), context?.signal, () => closeDecoder(decoder));
        }
        if (reachedBoundary) break;
      }
      if (primaryError === undefined) {
        await raceAbort(decoder.flush(), context?.signal, () => closeDecoder(decoder));
        if (callbackError !== undefined) primaryError = callbackError;
      }
    } catch (error) {
      primaryError = callbackError === undefined
        ? error
        : combineErrors(callbackError, error, 'web-demuxer seek callback and operation both failed');
    } finally {
      try {
        await settleReader(reader, completed);
      } catch (cleanupError) {
        primaryError = combineErrors(primaryError, cleanupError, 'web-demuxer seek reader cleanup failed');
      }
      try {
        closeDecoder(decoder);
      } catch (cleanupError) {
        primaryError = combineErrors(primaryError, cleanupError, 'web-demuxer seek decoder cleanup failed');
      }
    }

    if (primaryError !== undefined) {
      const emittedFrames = callbackCount;
      primaryError = closeFrameSet(decoded, primaryError);
      if (emittedFrames > 0 && !mustPreserveError(primaryError)) {
        throw new WebDemuxerPartialDecodeError('seek', emittedFrames, primaryError);
      }
      throw primaryError;
    }

    sortByPresentationTime(decoded);
    let landed: TimedClosable<VideoFrame> | undefined;
    try {
      landed = selectSeekLanding(decoded, targetUs, submittedPtsUs);
    } catch (error) {
      throw closeFrameSet(decoded, error);
    }
    if (!landed) {
      throw closeFrameSet(decoded, new Error(`${ENGINE_ID}: seek produced no decoded frame at ${tUs}us`));
    }
    let result: SeekResult | undefined;
    let outputError: unknown;
    try {
      const image = await imageDataFromVideoFrame(landed.value, context?.signal);
      const frame = await digestImageData(image, 0, landed.ptsUs, context?.signal);
      result = {
        landedPtsUs: landed.ptsUs,
        frame,
        telemetry: {
          decodedFrames: callbackCount,
          ...(firstFrameMs !== undefined ? { firstFrameMs } : {}),
        },
      };
    } catch (error) {
      outputError = error;
    }
    outputError = closeFrameSet(decoded, outputError);
    if (outputError !== undefined) throw outputError;
    return result!;
  }

  private async prepareVideoRuntime(
    input: MediaInput,
    operation: 'decodeFrames' | 'seek',
    context?: OperationContext,
    selector?: DecodeOptions['track'],
  ): Promise<PreparedVideoRuntime> {
    const demuxer = await this.loadInput(input, context);
    const info = await raceAbort(demuxer.getMediaInfo(), context?.signal, () => this.destroyDemuxer());
    const supplemental = await raceAbort(demuxer.getAVStreams(), context?.signal, () => this.destroyDemuxer());
    const streams = mergeNormalizedStreams(info.streams ?? [], supplemental);
    const runtimeTracks = streams.map(normalizeWebDemuxerStream);
    const declaredTracks = context?.request.inputs[0]?.tracks;
    const requestTracks = declaredTracks?.length ? declaredTracks : runtimeTracks;
    const selected = selectedVideoTrack(
      requestTracks,
      selector
        ? { ...(context?.request.options ?? {}), decodeTrackSelector: selector }
        : context?.request.options ?? {},
    );
    const tuple = context
      ? webDemuxerTupleSummary(context.request)
      : {
          inputContainers: [canonicalContainer(info.format_name, input)],
          inputCodecs: runtimeTracks.map((track) => track.codec),
        };
    if ('reason' in selected) {
      throw createNotApplicableError(
        ENGINE_ID,
        operation,
        selected.reason,
        tuple,
        WEB_DEMUXER_REASON.TRACK_SELECTION,
      );
    }
    if (selected.trackIndex === undefined) {
      throw createNotApplicableError(
        ENGINE_ID,
        operation,
        `${operation} requires a video track`,
        tuple,
        WEB_DEMUXER_REASON.VIDEO_REQUIRED,
      );
    }
    const stream = streams[selected.trackIndex];
    if (!stream || trackTypeOf(stream) !== 'video') {
      throw new Error(
        `${ENGINE_ID}: selected normalized video track ${selected.trackIndex} does not map to a package video stream`,
      );
    }

    const exact = cloneVideoDecoderConfig(demuxer.genDecoderConfig('video', stream));
    if (typeof exact.codec !== 'string' || exact.codec.trim().length === 0) {
      throw new TypeError(`${ENGINE_ID}: package generated a malformed empty VideoDecoderConfig.codec`);
    }
    const browserConfig = {
      role: 'video-decoder' as const,
      trackIndex: selected.trackIndex,
      config: exact,
    };
    if (!hasVideoDecoder() || typeof VideoDecoder.isConfigSupported !== 'function') {
      throw createBrowserNotSupportedError(
        ENGINE_ID,
        operation,
        'VideoDecoder, EncodedVideoChunk, or VideoDecoder.isConfigSupported is unavailable',
        tuple,
        WEB_DEMUXER_REASON.BROWSER_API,
        browserConfig,
      );
    }
    let support: VideoDecoderSupport;
    try {
      support = await raceAbort(VideoDecoder.isConfigSupported(exact), context?.signal);
    } catch (error) {
      if (error instanceof TypeError) throw error;
      if (isNamedError(error, 'NotSupportedError')) {
        throw createBrowserNotSupportedError(
          ENGINE_ID,
          operation,
          `the browser rejected decoder config '${exact.codec}'`,
          tuple,
          WEB_DEMUXER_REASON.BROWSER_CONFIG,
          browserConfig,
          error,
        );
      }
      throw error;
    }
    if (!support.supported) {
      throw createBrowserNotSupportedError(
        ENGINE_ID,
        operation,
        `the browser does not support decoder config '${exact.codec}'`,
        tuple,
        WEB_DEMUXER_REASON.BROWSER_CONFIG,
        browserConfig,
      );
    }
    if (!hasRasterSurface()) {
      throw createBrowserNotSupportedError(
        ENGINE_ID,
        operation,
        'no VideoFrame RGBA readback surface is available in this browser realm',
        tuple,
        WEB_DEMUXER_REASON.BROWSER_RASTER,
        browserConfig,
      );
    }
    if (!hasWebCryptoDigest()) {
      throw createBrowserNotSupportedError(
        ENGINE_ID,
        operation,
        'Web Crypto SHA-256 is unavailable in this browser realm',
        tuple,
        WEB_DEMUXER_REASON.BROWSER_CRYPTO,
        browserConfig,
      );
    }
    this.configUsed.lastDecoderConfig = cloneVideoDecoderConfig(exact);
    this.configUsed.codecConfigs = [cloneVideoDecoderConfig(exact)];
    return {
      demuxer,
      config: exact,
      stream,
      trackIndex: selected.trackIndex,
      typeOrdinal: selected.typeOrdinal ?? 0,
      normalizedTrack: runtimeTracks[selected.trackIndex]!,
      durationSec: Number.isFinite(info.duration) && info.duration > 0 ? info.duration : null,
    };
  }

  // ── Undeclared operations: web-demuxer does none of these. They throw so a mis-wired runner fails
  //    loudly; capabilities() does NOT declare them, so the runner negotiates NA(engine) and never
  //    calls them in practice. ──────────────────────────────────────────────────────────────────

  async remux(_input: MediaInput, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: remux not supported (demuxer/parser only — no muxer)`);
  }

  async transcode(_input: MediaInput, _opts: TranscodeOptions): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: transcode not supported (no encoder/muxer)`);
  }

  async trim(
    _input: MediaInput,
    _range: { startUs: number; endUs: number },
    _opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: trim not supported (produces no output container)`);
  }

  // mux/decrypt are optional on MediaEngine and intentionally not implemented here (not declared).
  async mux(_tracks: EncodedTracks, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: mux not supported (no muxer)`);
  }

  async decrypt(
    _input: MediaInput,
    _key: DecryptKey,
    _opts: { scheme: EncryptionScheme },
  ): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: decrypt not supported (no decryption surface)`);
  }
}

export function normalizeIsoPacketKeyframes(
  packets: readonly PacketInfo[],
  sourcePackets: readonly PacketInfo[] | undefined,
): PacketInfo[] {
  if (!sourcePackets || packets.length !== sourcePackets.length) return [...packets];
  const sourceByIdentity = new Map<string, PacketInfo[]>();
  for (const packet of sourcePackets) {
    const key = `${packet.trackIndex}:${packet.size}`;
    const bucket = sourceByIdentity.get(key) ?? [];
    bucket.push(packet);
    sourceByIdentity.set(key, bucket);
  }
  const matched: PacketInfo[] = [];
  for (const packet of packets) {
    const key = `${packet.trackIndex}:${packet.size}`;
    const bucket = sourceByIdentity.get(key);
    const candidates = bucket?.flatMap((source, index) =>
      Math.abs(source.ptsUs - packet.ptsUs) <= 1 ? [{ source, index }] : []
    ) ?? [];
    if (candidates.length !== 1) return [...packets];
    const { source, index } = candidates[0]!;
    bucket!.splice(index, 1);
    matched.push({
      ...packet,
      keyframe: source.keyframe,
      randomAccessKind: source.keyframe ? 'sample-table-sync' : 'non-sync',
    });
  }
  if ([...sourceByIdentity.values()].some((bucket) => bucket.length > 0)) return [...packets];
  return matched;
}

async function fetchSameOriginWasm(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await raceAbort(fetch(url, { credentials: 'same-origin', signal }), signal);
  if (!response.ok) throw new Error(`failed to materialize web-demuxer WASM: HTTP ${response.status}`);
  return new Uint8Array(await raceAbort(response.arrayBuffer(), signal));
}

export function wasmDataUrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:application/wasm;base64,${btoa(binary)}`;
}

// ── helpers ───────────────────────────────────────────────────────────────────────────────────

interface PreparedVideoRuntime {
  demuxer: WebDemuxerType;
  config: VideoDecoderConfig;
  stream: WebAVStream;
  trackIndex: number;
  typeOrdinal: number;
  normalizedTrack: NormalizedTrack;
  durationSec: number | null;
}

function cloneVideoDecoderConfig(config: VideoDecoderConfig): VideoDecoderConfig {
  const extended = config as VideoDecoderConfig & { rotation?: unknown; flip?: unknown };
  const { rotation: _rotation, flip: _flip, ...standard } = extended;
  const description = standard.description;
  const copiedDescription = description === undefined
    ? undefined
    : ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength).slice()
      : new Uint8Array(description as ArrayBuffer).slice();
  return {
    ...standard,
    ...(copiedDescription ? { description: copiedDescription } : {}),
    ...(standard.colorSpace ? { colorSpace: { ...standard.colorSpace } } : {}),
  };
}

function resolveDecodeFrameLimit(
  requested: number | undefined,
  _stream: WebAVStream,
  config: VideoDecoderConfig,
  context?: OperationContext,
): number {
  const limit = requested ?? MAX_DECODE_FRAMES;
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new TypeError(`${ENGINE_ID}: maxFrames must be a non-negative safe integer`);
  }
  const tuple = context ? webDemuxerTupleSummary(context.request) : {};
  if (limit > MAX_DECODE_FRAMES) {
    throw createNotApplicableError(
      ENGINE_ID,
      'decodeFrames',
      `requested maxFrames ${limit} exceeds retained frame budget ${MAX_DECODE_FRAMES}`,
      tuple,
      WEB_DEMUXER_REASON.MEMORY_BUDGET,
    );
  }
  const retainedBytes = decoderPixelBytes(config) * limit;
  if (!Number.isSafeInteger(retainedBytes) || retainedBytes > MAX_RETAINED_PIXEL_BYTES) {
    throw createNotApplicableError(
      ENGINE_ID,
      'decodeFrames',
      `requested decoded pixels require ${retainedBytes} bytes, exceeding ${MAX_RETAINED_PIXEL_BYTES}`,
      tuple,
      WEB_DEMUXER_REASON.MEMORY_BUDGET,
    );
  }
  return limit;
}

function decoderPixelBytes(config: VideoDecoderConfig): number {
  const width = Math.max(1, Math.trunc(config.displayAspectWidth ?? config.codedWidth ?? 1));
  const height = Math.max(1, Math.trunc(config.displayAspectHeight ?? config.codedHeight ?? 1));
  return width * height * 4;
}

async function raceAbort<T>(
  promise: PromiseLike<T>,
  signal?: AbortSignal,
  onAbort?: () => void | PromiseLike<unknown>,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    let cleanupError: unknown;
    try {
      await onAbort?.();
    } catch (error) {
      cleanupError = error;
    }
    const reason = abortReason(signal);
    if (cleanupError !== undefined) throw new AggregateError([reason, cleanupError], 'abort cleanup failed');
    throw reason;
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = (): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      const reason = abortReason(signal);
      Promise.resolve()
        .then(() => onAbort?.())
        .then(
          () => reject(reason),
          (cleanupError) => reject(new AggregateError([reason, cleanupError], 'abort cleanup failed')),
        );
    };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

async function settleReader<T>(
  reader: ReadableStreamDefaultReader<T>,
  completed: boolean,
  primaryError?: unknown,
): Promise<void> {
  let cleanupError: unknown;
  if (!completed) {
    try {
      await reader.cancel();
    } catch (error) {
      cleanupError = error;
    }
  }
  try {
    reader.releaseLock();
  } catch (error) {
    cleanupError = combineErrors(cleanupError, error, 'reader release failed');
  }
  if (cleanupError !== undefined) {
    throw combineErrors(primaryError, cleanupError, 'reader operation and cleanup both failed');
  }
}

function closeDecoder(decoder: VideoDecoder): void {
  if (decoder.state !== 'closed') decoder.close();
}

function combineErrors(primary: unknown, cleanup: unknown, message: string): unknown {
  return primary === undefined ? cleanup : new AggregateError([primary, cleanup], message);
}

function closeFrameSet<T extends { close(): void }>(
  frames: readonly TimedClosable<T>[],
  primaryError?: unknown,
): unknown {
  try {
    closeAll(frames);
    return primaryError;
  } catch (cleanupError) {
    return combineErrors(primaryError, cleanupError, 'web-demuxer frame cleanup failed');
  }
}

function mustPreserveError(error: unknown): boolean {
  if (isNotApplicableError(error) || isBrowserNotSupportedError(error) || isNamedError(error, 'AbortError')) {
    return true;
  }
  return error instanceof AggregateError && error.errors.some((item) => mustPreserveError(item));
}

function isGracefulNegativeContext(context?: OperationContext): boolean {
  if (context?.request.options.gracefulAllowOutput === true) return true;
  const robustness = context?.request.options.robustness;
  return typeof robustness === 'object'
    && robustness !== null
    && (robustness as { inputClass?: unknown }).inputClass === 'negative';
}

function isNamedError(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === name;
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  if (typeof DOMException === 'function') return new DOMException('operation aborted', 'AbortError');
  const error = new Error('operation aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

/** Best-effort human description of an unknown thrown value. */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return String(e);
  } catch {
    return 'unknown error';
  }
}

/** Register the web-demuxer engine factory under its versioned id. */
export function registerWebDemuxer(): void {
  registerEngine(ENGINE_ID, () => new WebDemuxerEngine());
}
