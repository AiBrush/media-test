/**
 * src/engines/mediabunny/adapter.ts — the REFERENCE engine adapter (mediabunny@1.48.0).
 *
 * Dossier: research/dossiers/mediabunny.md (researched 2026-06-17, installed 1.48.0).
 * Primary docs cited:
 *   - https://mediabunny.dev/guide/introduction          (WebCodecs orchestrator, zero-WASM core)
 *   - https://mediabunny.dev/guide/installation           (local ESM from node_modules; no CDN — §0.8)
 *   - https://mediabunny.dev/guide/reading-media-files     (Input/sources, dispose/using)
 *   - https://mediabunny.dev/guide/packets-and-samples     (EncodedPacketSink / *SampleSink / CanvasSink)
 *   - https://mediabunny.dev/guide/writing-media-files      (Output / *PacketSource / BufferTarget)
 *   - https://mediabunny.dev/guide/converting-media-files   (Conversion best path: streaming-lockstep)
 *   - https://mediabunny.dev/guide/supported-formats-and-codecs (HLS read + per-container codec matrix)
 *   - https://mediabunny.dev/api/                            (Input/Conversion/OutputFormat reference)
 * Local ground truth: node_modules/mediabunny/dist/modules/src/{conversion,encode,decode,media-sink,
 *   input,input-track,codec,input-format}.d.ts.
 *
 * HARDENING (2026-06-18, this revision; all changes confined to this adapter):
 *   - capabilities().containersIn now includes 'hls'. mediabunny reads HLS (dossier §5/§A.2;
 *     ALL_FORMATS includes HlsInputFormat — input-format.js) and probe()/demux() open with no
 *     container hint, so the read genuinely succeeds. Omitting it was a FALSE NA on the reference
 *     engine. (HLS stays OUT of containersOut: HlsOutputFormat needs a PathedTarget, not BufferTarget.)
 *   - buildVideoOptions bakes rotation into pixels (allowRotationMetadata:false) when the caller
 *     requests an explicit `rotate`, matching the "normalize/bake rotation" intent. Without it,
 *     mediabunny keeps the angle as ISOBMFF rotation METADATA (conversion.js canUseRotationMetadata)
 *     and pixels stay rotated. Cite: conversion.d.ts ConversionVideoOptions.allowRotationMetadata.
 *   - buildAudioOptions no longer pins bitrate=QUALITY_HIGH for same-codec audio: that defeated
 *     mediabunny's lossless audio COPY fast-path (conversion.js requires `!trackOptions.bitrate`).
 *     mediabunny supplies QUALITY_HIGH itself only inside its re-encode branch, so leaving bitrate
 *     unset is the dossier's "copy whenever possible" path and lossless for unchanged audio.
 *   - 'fanout' removed from capabilities().features: the suite's single-blob MediaBytes contract
 *     can carry only ONE rendition, so transcode() emits variants[0] and cannot deliver a true
 *     1→N ABR ladder. Declaring it let the ladder scenario score green on a single 1080p rung
 *     (over-claim). Removing it makes that scenario negotiate NA_ENGINE honestly. (mediabunny CAN
 *     fan out natively via ConversionVideoOptions[] — conversion.d.ts:45 — but the contract can't
 *     surface N outputs, so the honest move is to drop the claim, not fake the green.)
 *   - metadataFromInput reads duration via the cheap getDurationFromMetadata() FIRST and only falls
 *     back to computeDuration() when metadata yields null (dossier §4.1 cheap path; longform/edge
 *     probes require duration without a full sample scan / OOM). computeDuration walks all fragments
 *     on fragmented/CMAF inputs; the metadata-first order avoids that wall-time/peak-memory inflation.
 *
 * Implements `MediaEngine` (src/core/engine.ts) entirely against the real mediabunny API. This is
 * the comparison baseline, so it is the most complete adapter and judges only observable behavior
 * (bytes/metadata/frames in → out). All timestamps are converted to MICROSECONDS via mediabunny's
 * `EncodedPacket.microsecondTimestamp` / `microsecondDuration` (and seconds*1e6 where mediabunny
 * only gives seconds). Frame digests use the shared normalization (digest.ts) so they line up with
 * golden data and other engines.
 *
 * BEST PATH (dossier §6, recorded as `configUsed`): hardware-accelerated WebCodecs for all coded
 * video/audio (no WASM, no CPU codec); `hardwareAcceleration: 'prefer-hardware'` on every decoder
 * sink and on every Conversion video block; a `CanvasSink` ring-buffer (`poolSize`) keeps VRAM
 * constant during repeated frame extraction; the Conversion API runs read→decode→encode→mux in
 * streaming lockstep with automatic backpressure (queue depth auto-managed — no manual
 * encode/decodeQueueSize tuning). No SharedArrayBuffer / COOP+COEP required by mediabunny itself.
 *
 * LOAD/INIT (dossier §3, rule §0.7 — UNTIMED): the mediabunny module is DYNAMICALLY IMPORTED inside
 * init() (so module parse/instantiate is excluded from the measured window) and the WebCodecs
 * feature-detection caches are WARMED there (getDecodable + getEncodable codec probes build memoized
 * maps and configure throw-away codecs) so the first measured op pays no isConfigSupported / codec
 * warm-up cost. dispose() drops the namespace handle for clean peak-memory accounting.
 *
 * mediabunny surface used (verified against installed 1.48.0 .d.ts):
 *   Input, BlobSource, ALL_FORMATS, <format singletons>  — reading/probing/demuxing
 *   InputVideoTrack/InputAudioTrack getters               — normalized metadata
 *   EncodedPacketSink (.packets / .getKeyPacket / .getPacket / .getNextPacket) — packet tables/trim
 *   CanvasSink (.canvases / .getCanvas)                   — decode → RGBA (honors rotation metadata)
 *   VideoSampleSink (.getSample)                          — seek to a precise frame
 *   Conversion (.init/.execute, video/audio/trim/fan-out) — remux/transcode/trim
 *   Output + <OutputFormat> + BufferTarget + Encoded*PacketSource — mux from encoded tracks
 *   IsobmffInputFormatOptions.resolveKeyId                — CENC decrypt at read time
 *   getDecodable + getEncodable codec probes              — init() WebCodecs warm-up (untimed)
 */

import type {
  Input,
  EncodedPacket,
  InputFormat,
  InputTrack,
  InputVideoTrack,
  InputAudioTrack,
  ConversionOptions,
  ConversionVideoOptions,
  ConversionAudioOptions,
  VideoCodec,
  AudioCodec,
  Rotation,
  BufferTarget,
} from 'mediabunny';

/** The mediabunny module namespace, loaded lazily in init() (rule §0.7 — untimed). */
type MB = typeof import('mediabunny');

import type {
  CapabilitySet,
  DecryptKey,
  DemuxResult,
  EncodedTracks,
  EncryptionScheme,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  NormalizedTrack,
  PacketInfo,
  TrackType,
  TranscodeOptions,
  TranscodeVideoOptions,
} from '../../core/engine.ts';

import {
  canonicalToMediabunnyAudio,
  canonicalToMediabunnyVideo,
  inputFormatForContainer,
  makeOutputFormat,
  mediabunnyToCanonicalAudio,
  mediabunnyToCanonicalVideo,
  mimeForContainer,
} from './codecs.ts';
import { digestImageData } from './digest.ts';

/**
 * The dossier best-path config (§6), recorded verbatim as `configUsed`. Static, deterministic, and
 * exposed via {@link MediabunnyEngine.configUsed} so the runner can record it per §8.5.
 */
export const MEDIABUNNY_CONFIG = {
  backend: 'webcodecs',
  pixelBackend: 'webgl2/canvas',
  hwAccel: 'prefer-hardware',
  wasmThreads: 0,
  pipeline: 'streaming-lockstep',
  queueDepth: 'auto',
  coreBuild: 'pure-ts-esm',
  sharedArrayBuffer: false,
  coopCoep: 'not-required',
  canvasPoolSize: 4,
} as const;

/** WebCodecs hardware-acceleration hint forced to the GPU engine (dossier §6). */
const HW_ACCEL = MEDIABUNNY_CONFIG.hwAccel;
/** CanvasSink ring-buffer size keeping VRAM constant during repeated frame extraction (dossier §6). */
const CANVAS_POOL_SIZE = MEDIABUNNY_CONFIG.canvasPoolSize;

/** seconds → integer microseconds (mediabunny exposes most times in seconds). */
function secToUs(sec: number): number {
  return Math.round(sec * 1e6);
}

/** True when the asset is an HLS playlist (explicit container hint or an .m3u8/.m3u URL). */
function isHlsAsset(input: MediaInput, container?: string): boolean {
  if (container === 'hls') return true;
  const u = input.url.split(/[?#]/, 1)[0] ?? '';
  return /\.m3u8?$/i.test(u);
}

/** Build a mediabunny Input from a corpus asset. Restricts formats to the asset's container when
 *  known (faster, deterministic), else accepts ALL_FORMATS.
 *
 *  SOURCE CHOICE: normal single-file assets use a buffered BlobSource (the dossier best path — the
 *  whole asset is already in memory, so reads are local with zero network round-trips). HLS is the
 *  exception: mediabunny's HlsInputFormat REQUIRES a PathedSource (input-format.js `_canReadInput`
 *  throws "HLS inputs require InputOptions.source to be a PathedSource" otherwise) because it must
 *  resolve the playlist's relative segment URIs against a base path — a flat BlobSource has none. We
 *  therefore back HLS with a UrlSource(input.url) (UrlSource extends PathedSource), which fetches the
 *  m3u8 and its sibling segments over Range. This is what makes the declared containersIn:'hls'
 *  honest rather than a runtime throw. Cite: source.d.ts UrlSource/PathedSource; input-format.js. */
async function openInput(mb: MB, input: MediaInput, container?: string): Promise<Input> {
  if (isHlsAsset(input, container)) {
    // PathedSource (UrlSource) is mandatory for HLS segment resolution; restrict to HLS format so the
    // playlist is parsed as HLS (and the source's _usedForHls flag is set).
    return new mb.Input({
      source: new mb.UrlSource(input.url),
      formats: [mb.HLS],
    });
  }
  const blob = await input.blob();
  const formats: InputFormat[] = [];
  if (container) {
    const f = inputFormatForContainer(container);
    if (f) formats.push(f);
  }
  return new mb.Input({
    source: new mb.BlobSource(blob),
    formats: formats.length ? formats : mb.ALL_FORMATS,
  });
}

/** Map a mediabunny InputFormat name to a canonical container token for NormalizedMetadata. */
function canonicalContainerFromFormat(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('quicktime') || n === 'qtff' || n.includes('mov')) return 'mov';
  if (n.includes('webm')) return 'webm';
  if (n.includes('matroska') || n.includes('mkv')) return 'mkv';
  if (n.includes('mp4') || n.includes('isobmff')) return 'mp4';
  if (n.includes('mpeg-ts') || n.includes('transport')) return 'ts';
  if (n.includes('wave') || n === 'wav') return 'wav';
  if (n.includes('mp3')) return 'mp3';
  if (n.includes('flac')) return 'flac';
  if (n.includes('ogg')) return 'ogg';
  if (n.includes('adts') || n.includes('aac')) return 'adts';
  if (n.includes('hls')) return 'hls';
  return n;
}

/** Normalize a single input track to the suite's NormalizedTrack shape. */
async function normalizeTrack(track: InputTrack): Promise<NormalizedTrack> {
  const language = await track.getLanguageCode().catch(() => 'und');
  const bitrate = await track.getBitrate().catch(() => null);

  if (track.isVideoTrack()) {
    const v = track as InputVideoTrack;
    const mbCodec = await v.getCodec().catch(() => null);
    const [width, height, rotation] = await Promise.all([
      v.getDisplayWidth().catch(() => 0),
      v.getDisplayHeight().catch(() => 0),
      v.getRotation().catch(() => 0 as Rotation),
    ]);
    // FPS: estimate from a prefix of packets (averagePacketRate == frame rate for video).
    let fps: number | undefined;
    try {
      const stats = await v.computePacketStats(120);
      if (Number.isFinite(stats.averagePacketRate) && stats.averagePacketRate > 0) {
        fps = stats.averagePacketRate;
      }
    } catch {
      fps = undefined;
    }
    const out: NormalizedTrack = {
      type: 'video',
      codec: mediabunnyToCanonicalVideo(mbCodec) ?? mbCodec ?? 'unknown',
      width: width || undefined,
      height: height || undefined,
      rotation: rotation || 0,
      bitrate: bitrate ?? null,
      language: language === 'und' ? null : language,
    };
    if (fps !== undefined) out.fps = fps;
    return out;
  }

  if (track.isAudioTrack()) {
    const a = track as InputAudioTrack;
    const mbCodec = await a.getCodec().catch(() => null);
    const [sampleRate, channels] = await Promise.all([
      a.getSampleRate().catch(() => 0),
      a.getNumberOfChannels().catch(() => 0),
    ]);
    return {
      type: 'audio',
      codec: mediabunnyToCanonicalAudio(mbCodec) ?? mbCodec ?? 'unknown',
      sampleRate: sampleRate || undefined,
      channels: channels || undefined,
      bitrate: bitrate ?? null,
      language: language === 'und' ? null : language,
    };
  }

  // subtitle / other
  return {
    type: (track.type as TrackType) ?? 'other',
    codec: 'unknown',
    bitrate: bitrate ?? null,
    language: language === 'und' ? null : language,
  };
}

/** Probe an already-opened Input into NormalizedMetadata. */
async function metadataFromInput(input: Input): Promise<NormalizedMetadata> {
  const format = await input.getFormat();
  const container = canonicalContainerFromFormat(format.name);

  // Duration via the CHEAP metadata path first (dossier §4.1): getDurationFromMetadata() reads the
  // container's declared duration (mvhd/Segment-duration/etc.) WITHOUT scanning samples, so longform
  // and fragmented/CMAF inputs don't pay a full-fragment walk (computeDuration(Infinity) must walk
  // every moof to find the last packet → wall-time + peak-memory inflation; the longform/edge probes
  // explicitly require duration "cheaply, not by scanning every sample, no OOM"). Only when metadata
  // yields null/non-finite do we fall back to the precise computeDuration() scan.
  let durationSec: number | null = null;
  try {
    const meta = await input.getDurationFromMetadata();
    durationSec = meta != null && Number.isFinite(meta) ? meta : null;
  } catch {
    durationSec = null;
  }
  if (durationSec === null) {
    try {
      const d = await input.computeDuration();
      durationSec = Number.isFinite(d) ? d : null;
    } catch {
      durationSec = null;
    }
  }

  const tracks = await input.getTracks();
  const normalized: NormalizedTrack[] = [];
  for (const t of tracks) {
    normalized.push(await normalizeTrack(t));
  }

  const meta: NormalizedMetadata = {
    container,
    durationSec,
    tracks: normalized,
  };

  // Descriptive tags (best-effort): flatten the common normalized fields into string map.
  try {
    const tags = await input.getMetadataTags();
    const flat: Record<string, string> = {};
    if (tags.title) flat.title = tags.title;
    if (tags.artist) flat.artist = tags.artist;
    if (tags.album) flat.album = tags.album;
    if (tags.albumArtist) flat.albumArtist = tags.albumArtist;
    if (tags.genre) flat.genre = tags.genre;
    if (tags.comment) flat.comment = tags.comment;
    if (tags.description) flat.description = tags.description;
    if (tags.date instanceof Date) flat.date = tags.date.toISOString();
    if (typeof tags.trackNumber === 'number') flat.trackNumber = String(tags.trackNumber);
    if (Object.keys(flat).length) meta.tags = flat;
  } catch {
    // tags unsupported for this container — leave undefined.
  }

  return meta;
}

/**
 * Codecs whose WebCodecs encoders are routinely WGPU/hardware-poor and pixel-format/bitrate-picky:
 * VP9 and VP8 hardware encoders are scarce, and (when present) commonly REJECT small frames at a low
 * target bitrate. Forcing `hardwareAcceleration:'prefer-hardware'` on these is what made
 * convert-webm-resize-320x180 ERROR ("This specific encoder configuration (vp09.00.11.08, 120000
 * bps, 320x180, hardware...) is not supported"). For these codecs we DON'T force hardware — we let
 * the encodability probe below pick the working acceleration mode (software is the reliable path).
 */
const SOFTWARE_PREFERRED_ENCODE: ReadonlySet<VideoCodec> = new Set<VideoCodec>(['vp9', 'vp8']);

/**
 * A sensible default video bitrate (bits/sec) for a re-encode when the caller didn't pin one.
 * mediabunny's QUALITY_* presets scale bitrate by pixel count × codec-efficiency, so at small output
 * sizes the VP9 QUALITY_HIGH target collapses to ~120 kbps for 320×180 — a rate hardware VP9
 * encoders reject (the exact bug here). We therefore use a numeric, resolution-aware target with an
 * absolute floor so small renditions never get a starvation bitrate, and we DON'T hand WebCodecs a
 * `Quality` whose resolved value is unknowably low. Reference (the QUALITY_HIGH→120 kbps collapse):
 * node_modules/mediabunny .../encode.js `Quality._toVideoBitrate` (3 Mbps @1080p × (px/ref)^0.95 ×
 * codecEff × factor). For 320×180 our floor gives a healthy 300 kbps instead of the rejected 120 kbps.
 */
function defaultVideoBitrate(codec: VideoCodec | undefined, width?: number, height?: number): number {
  // Resolution-aware target (per-pixel coefficient × pixel count × codec efficiency) with an
  // absolute floor so even tiny frames clear WebCodecs encoder minimums. The floor (300 kbps) sits
  // far above the VP9 hardware-reject point (~120 kbps for 320×180) that caused the bug; the
  // coefficient scales the rate cleanly upward for larger boxes (≈4.4 Mbps for VP9 720p, ≈10 Mbps
  // for 1080p), and codec efficiency trims it for the more efficient codecs.
  const MIN_BITRATE = 300_000;
  const PER_PIXEL = 6; // bits/sec per output pixel (≈ 30fps × 0.2 bpp reference)
  const px = (width && width > 0 ? width : 1280) * (height && height > 0 ? height : 720);
  const efficiency: Record<string, number> = { avc: 1.0, hevc: 0.7, vp9: 0.8, av1: 0.6, vp8: 1.1 };
  const eff = (codec && efficiency[codec]) || 1.0;
  const target = Math.round(px * PER_PIXEL * eff);
  return Math.max(MIN_BITRATE, target);
}

/**
 * Build mediabunny ConversionVideoOptions from a TranscodeVideoOptions block.
 *
 * Best path (dossier §6): for codecs with solid hardware encoders (H.264/HEVC/AV1) we still PREFER
 * the GPU engine. But the encode config is PROBED with `canEncodeVideo` (WebCodecs
 * isConfigSupported) before committing, so we never hand the Conversion a config the browser will
 * reject mid-transcode (which surfaces as a hard ERROR). For VP9/VP8 — whose hardware encoders are
 * scarce and reject small-frame/low-bitrate configs — we don't force hardware and let the probe
 * choose the working acceleration mode (software). We also use a sane numeric bitrate instead of the
 * QUALITY_HIGH preset (which collapses to ~120 kbps for VP9 @320×180 and gets rejected).
 *
 * If NO acceleration mode can encode the requested codec/size at all, we throw a clear
 * browser-limitation error. (In practice the runner's pre-flight NA(browser) gate — which probes
 * `VideoEncoder.isConfigSupported` for the codec — fires first, so a genuinely unencodable codec is
 * reported as NA(browser), not ERROR.)
 */
async function buildVideoOptions(mb: MB, v: TranscodeVideoOptions): Promise<ConversionVideoOptions> {
  const opts: ConversionVideoOptions = {};
  let codec: VideoCodec | undefined;
  if (v.codec) {
    const c = canonicalToMediabunnyVideo(v.codec);
    if (c) {
      codec = c;
      opts.codec = c;
    }
  }
  if (typeof v.width === 'number') opts.width = v.width;
  if (typeof v.height === 'number') opts.height = v.height;
  // mediabunny's Conversion requires a `fit` algorithm whenever BOTH width and height are set
  // (it rejects width+height with no fit: "When both options.video.width and options.video.height
  // are provided, ..."). The suite's resize cases (e.g. convert-webm-resize-320x180) ask for an
  // exact output box, so use 'fill' (stretch to the exact WxH) — matching the dossier's
  // "resize 320×180" benchmark. (When only one dimension is given mediabunny derives the other
  // from the aspect ratio and no fit is needed.) Cite: conversion.d.ts ConversionVideoOptions.fit;
  // dossier §4.6/§A.8.
  if (typeof v.width === 'number' && typeof v.height === 'number') opts.fit = 'fill';
  if (typeof v.fps === 'number') opts.frameRate = v.fps;
  if (typeof v.rotate === 'number') {
    opts.rotate = (((v.rotate % 360) + 360) % 360) as Rotation;
    // The rotate cases are NORMALIZE-rotation cases (e.g. h264_rotate_normalize: bake a rotated
    // source's 90° display rotation into upright pixels). By default mediabunny keeps the resulting
    // angle as ISOBMFF rotation METADATA whenever the output container supports it
    // (conversion.js canUseRotationMetadata), so the coded pixels stay rotated and only the
    // container flag changes. Forcing allowRotationMetadata:false bakes the total rotation
    // (innate + requested) into the frames, which is the intended "normalized" output.
    // Cite: conversion.d.ts ConversionVideoOptions.allowRotationMetadata; dossier §4.6.
    opts.allowRotationMetadata = false;
  }

  // No codec requested → this may end up a lossless copy (no encode); keep the best-path hint and
  // return (the Conversion only applies hardwareAcceleration when it actually transcodes).
  if (!codec) {
    opts.hardwareAcceleration = HW_ACCEL;
    return opts;
  }

  // Choose the encode bitrate: honor an explicit caller bitrate, else a sane resolution-aware target
  // (NOT the QUALITY_HIGH preset, which collapses to a hardware-rejected ~120 kbps for VP9@320×180).
  const bitrate: number =
    typeof v.bitrate === 'number' && v.bitrate > 0
      ? v.bitrate
      : defaultVideoBitrate(codec, v.width, v.height);
  opts.bitrate = bitrate;

  // Decide the acceleration mode by PROBING actual encodability (isConfigSupported), in preference
  // order. For VP9/VP8 software is the reliable path (hardware is scarce + picky); for the others we
  // try hardware first (best-path), then fall back so a missing hardware encoder still succeeds.
  const probeW = v.width && v.width > 0 ? v.width : undefined;
  const probeH = v.height && v.height > 0 ? v.height : undefined;
  const modes: NonNullable<ConversionVideoOptions['hardwareAcceleration']>[] =
    SOFTWARE_PREFERRED_ENCODE.has(codec)
      ? ['prefer-software', 'no-preference']
      : [HW_ACCEL, 'no-preference', 'prefer-software'];

  let chosen: NonNullable<ConversionVideoOptions['hardwareAcceleration']> | null = null;
  for (const mode of modes) {
    const ok = await mb
      .canEncodeVideo(codec, {
        ...(probeW !== undefined ? { width: probeW } : {}),
        ...(probeH !== undefined ? { height: probeH } : {}),
        bitrate,
        hardwareAcceleration: mode,
      })
      .catch(() => false);
    if (ok) {
      chosen = mode;
      break;
    }
  }

  if (!chosen) {
    // Genuinely unencodable in this browser. Surface a clear browser-limitation message; the runner
    // normally short-circuits this codec to NA(browser) in pre-flight before we reach here.
    throw new Error(
      `mediabunny transcode: browser cannot encode ${codec} at ` +
        `${probeW ?? '?'}x${probeH ?? '?'} @ ${bitrate} bps with any acceleration mode ` +
        `(WebCodecs VideoEncoder.isConfigSupported=false) — NA(browser)`,
    );
  }

  opts.hardwareAcceleration = chosen;
  return opts;
}

/**
 * Build mediabunny ConversionAudioOptions from a TranscodeOptions.audio block.
 *
 * IMPORTANT: leave `bitrate` UNSET unless the caller pinned a numeric one. mediabunny's lossless
 * audio COPY fast-path requires `!trackOptions.bitrate` (node_modules/mediabunny .../conversion.js
 * the same-codec/same-params copy condition), and mediabunny itself defaults to QUALITY_HIGH only
 * INSIDE its re-encode branch (`trackOptions.bitrate ?? QUALITY_HIGH`). Eagerly pinning QUALITY_HIGH
 * here would force a needless lossy re-encode for any same-codec/same-param audio (slower + fidelity
 * loss); not setting it preserves the dossier's "copy whenever possible" path while still getting a
 * sensible bitrate when a re-encode is genuinely required.
 */
function buildAudioOptions(
  _mb: MB,
  a: NonNullable<TranscodeOptions['audio']>,
): ConversionAudioOptions {
  const opts: ConversionAudioOptions = {};
  if (a.codec) {
    const codec = canonicalToMediabunnyAudio(a.codec);
    if (codec) opts.codec = codec;
  }
  if (typeof a.sampleRate === 'number') opts.sampleRate = a.sampleRate;
  if (typeof a.channels === 'number') opts.numberOfChannels = a.channels;
  if (typeof a.bitrate === 'number') opts.bitrate = a.bitrate;
  return opts;
}

/** Run a Conversion to completion and return the resulting bytes. */
async function runConversion(mb: MB, opts: ConversionOptions, container: string): Promise<MediaBytes> {
  const conversion = await mb.Conversion.init(opts);
  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((d) => d.reason).join(', ');
    throw new Error(
      `mediabunny Conversion invalid (no usable output tracks)${reasons ? `: ${reasons}` : ''}`,
    );
  }
  await conversion.execute();
  const target = opts.output.target as BufferTarget;
  const buffer = target.buffer;
  if (!buffer) throw new Error('mediabunny Conversion produced no output buffer');
  return {
    bytes: new Uint8Array(buffer),
    mime: mimeForContainer(container),
    container,
  };
}

/** A FrameSink backed by digests + cached ImageData for SSIM/PSNR pixel access. */
class CapturedFrameSink implements FrameSink {
  frames: FrameDigest[] = [];
  private pixels: ImageData[] = [];

  push(img: ImageData, digest: FrameDigest): void {
    this.frames.push(digest);
    this.pixels.push(img);
  }

  getPixels = async (i: number): Promise<ImageData> => {
    const img = this.pixels[i];
    if (!img) throw new Error(`No pixels captured for frame ${i}`);
    return img;
  };
}

/**
 * The reference engine.
 */
export class MediabunnyEngine implements MediaEngine {
  readonly id: string;

  /** The dossier best-path config (§6), recorded by the runner per §8.5 / returned as configUsed. */
  readonly configUsed = MEDIABUNNY_CONFIG;

  /** mediabunny namespace, loaded in init() (rule §0.7 — untimed). null until init() runs. */
  private mb: MB | null = null;

  constructor(id = 'mediabunny@1.48.0') {
    this.id = id;
  }

  /** Return the loaded namespace or throw if init() was skipped (loud failure, no fake pass). */
  private get lib(): MB {
    if (!this.mb) {
      throw new Error(`${this.id}: init() must be awaited before any operation (mediabunny not loaded)`);
    }
    return this.mb;
  }

  capabilities(): CapabilitySet {
    return {
      operations: {
        probe: true,
        demux: true,
        remux: true,
        transcode: true,
        decodeFrames: true,
        seek: true,
        trim: true,
        mux: true,
        decrypt: true,
      },
      // Read side: every container mediabunny can demux/probe. HLS is dossier-confirmed readable
      // (§5/§A.2) and is in ALL_FORMATS, so probe()/demux() (which open with no container hint)
      // genuinely parse it — omitting it was a false NA on the reference engine.
      containersIn: ['mp4', 'mov', 'mkv', 'webm', 'ts', 'hls', 'wav', 'mp3', 'flac', 'ogg', 'adts'],
      // Write side: every container mediabunny can mux. (HLS is multi-file/pathed — HlsOutputFormat
      // needs a PathedTarget, incompatible with BufferTarget → excluded from the write side.)
      containersOut: ['mp4', 'mov', 'mkv', 'webm', 'ts', 'wav', 'mp3', 'flac', 'ogg', 'adts'],
      videoCodecs: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
      audioCodecs: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24', 'pcm-f32', 'pcm-s16be'],
      // CENC (ctr/cbcs) decryption at read time via resolveKeyId; HLS AES-128 not exposed as a
      // decrypt primitive in 1.48.0 → not declared.
      encryption: ['cenc-ctr', 'cenc-cbcs'],
      features: [
        'fragmented', // fastStart: 'fragmented' (fMP4 / CMAF)
        'fastStart:reserve', // fastStart: 'reserve'
        'trim:frame-accurate', // Conversion trim is frame-accurate
        'metadata:write', // Output.setMetadataTags / Conversion tags
        'resize', // Conversion video width/height
        'rotate', // Conversion video rotate, baked into pixels (allowRotationMetadata:false)
        'alpha', // VP9 alpha (WebM/MKV) via alpha:'keep'
        // NOTE: 'fanout' is intentionally NOT declared. mediabunny natively fans out via a
        // ConversionVideoOptions[] array (conversion.d.ts:45), but the suite's MediaBytes contract
        // returns a SINGLE blob, so transcode() can only deliver variants[0] — it cannot surface the
        // N separate renditions an ABR ladder needs. Declaring 'fanout' would let the ladder scenario
        // score green on one rung (over-claim); dropping it makes that scenario negotiate NA_ENGINE
        // honestly until the contract can carry multiple outputs.
      ],
    };
  }

  /**
   * Load mediabunny + WARM WebCodecs (dossier §3, rule §0.7 — UNTIMED). Doing the dynamic import
   * here keeps module parse/instantiate out of the measured window; the getDecodable + getEncodable
   * codec probes build mediabunny's memoized capability maps (canDecode/canEncode memos) and
   * configure throw-away codecs, so the first measured op pays no isConfigSupported warm-up.
   * Failures (e.g. WebCodecs absent) propagate so the runner records ERROR rather than a fake pass.
   */
  async init(): Promise<void> {
    const mb = await import('mediabunny');
    this.mb = mb;

    // Warm WebCodecs feature-detection caches (best-effort; never block init on probe failures).
    const VIDEO: VideoCodec[] = ['avc', 'hevc', 'vp9', 'av1', 'vp8'];
    const AUDIO: AudioCodec[] = ['aac', 'opus', 'mp3', 'vorbis', 'flac'];
    await Promise.allSettled([
      mb.getDecodableVideoCodecs(VIDEO),
      mb.getDecodableAudioCodecs(AUDIO),
      mb.getEncodableVideoCodecs(VIDEO, { width: 1280, height: 720, bitrate: mb.QUALITY_HIGH }),
      mb.getEncodableAudioCodecs(AUDIO),
    ]);
  }

  async dispose(): Promise<void> {
    // Drop the namespace handle so a fresh per-Worker/per-iter engine starts from a clean slate.
    // mediabunny holds no global state (no WASM, no worker) — per-op Inputs/Outputs already dispose.
    this.mb = null;
  }

  // ── probe ──────────────────────────────────────────────────────────────────────────────────
  async probe(input: MediaInput): Promise<NormalizedMetadata> {
    const mbInput = await openInput(this.lib, input);
    try {
      return await metadataFromInput(mbInput);
    } finally {
      mbInput.dispose();
    }
  }

  // ── demux ──────────────────────────────────────────────────────────────────────────────────
  /**
   * Emit a packet table. `EncodedPacketSink.packets()` yields packets in DECODE order; each
   * `EncodedPacket` carries only its PRESENTATION timestamp (`microsecondTimestamp`) — mediabunny
   * intentionally abstracts DTS away. We therefore emit a decode-ordered table with `ptsUs` from
   * mediabunny and report `dtsUs === ptsUs` (we do not fabricate a decode timeline mediabunny does
   * not expose). B-frame reordering remains observable through the decode-order sequence vs the
   * non-monotonic ptsUs values. `keyframe` uses the packet's bitstream-verified type.
   */
  async demux(input: MediaInput): Promise<DemuxResult> {
    const mbInput = await openInput(this.lib, input);
    try {
      const metadata = await metadataFromInput(mbInput);
      const tracks = await mbInput.getTracks();
      const packets: PacketInfo[] = [];

      for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
        const track = tracks[trackIndex];
        if (!track) continue;
        const sink = new this.lib.EncodedPacketSink(track);
        // verifyKeyPackets gives accurate keyframe flags. NOTE: mediabunny rejects metadataOnly +
        // verifyKeyPackets together, and the packet table needs byteLength, so we load full packets.
        for await (const pkt of sink.packets(undefined, undefined, {
          verifyKeyPackets: true,
        })) {
          const ptsUs = pkt.microsecondTimestamp;
          packets.push({
            trackIndex,
            size: pkt.byteLength,
            ptsUs,
            dtsUs: ptsUs,
            keyframe: pkt.type === 'key',
          });
        }
      }

      return { metadata, packets };
    } finally {
      mbInput.dispose();
    }
  }

  // ── remux ──────────────────────────────────────────────────────────────────────────────────
  /** Lossless container change: Conversion with no codec/transform options copies encoded samples. */
  async remux(input: MediaInput, opts: { container: string }): Promise<MediaBytes> {
    const format = makeOutputFormat(opts.container);
    if (!format) throw new Error(`mediabunny cannot mux container '${opts.container}'`);
    const mbInput = await openInput(this.lib, input);
    try {
      const output = new this.lib.Output({ format, target: new this.lib.BufferTarget() });
      return await runConversion(this.lib, { input: mbInput, output }, opts.container);
    } finally {
      mbInput.dispose();
    }
  }

  // ── transcode ──────────────────────────────────────────────────────────────────────────────
  /**
   * Codec / resolution / fps / bitrate / rotate transcode via Conversion.
   *
   * NOTE on `opts.variants` (ABR ladder): mediabunny natively fans out (ConversionVideoOptions[]),
   * but the suite's MediaBytes contract returns a SINGLE blob, so we cannot deliver N separate
   * renditions. We therefore DO NOT declare the 'fanout' feature (capabilities()), which makes the
   * ladder scenario negotiate NA_ENGINE rather than scoring on one rung. If a caller still passes
   * `variants` we transcode the FIRST rung only (a defined, non-crashing fallback) — but no green
   * number is claimed for the ladder because the capability is undeclared.
   */
  async transcode(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes> {
    const format = makeOutputFormat(opts.container);
    if (!format) throw new Error(`mediabunny cannot mux container '${opts.container}'`);

    const mbInput = await openInput(this.lib, input);
    try {
      const output = new this.lib.Output({ format, target: new this.lib.BufferTarget() });
      const convOpts: ConversionOptions = { input: mbInput, output };

      const videoSpec = opts.variants && opts.variants.length ? opts.variants[0] : opts.video;
      if (videoSpec) convOpts.video = await buildVideoOptions(this.lib, videoSpec);
      if (opts.audio) convOpts.audio = buildAudioOptions(this.lib, opts.audio);

      return await runConversion(this.lib, convOpts, opts.container);
    } finally {
      mbInput.dispose();
    }
  }

  // ── decodeFrames ───────────────────────────────────────────────────────────────────────────
  /**
   * Decode the primary video track to normalized RGBA frame digests. CanvasSink bakes in rotation
   * metadata and yields a 2D-canvas-backed frame (straight alpha, top-left), which getImageData
   * reads back tight — exactly the normalization the digest rule requires.
   */
  async decodeFrames(input: MediaInput, opts?: { maxFrames?: number }): Promise<FrameSink> {
    const mbInput = await openInput(this.lib, input);
    try {
      const videoTrack = await mbInput.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error('mediabunny decodeFrames: no video track in input');

      // Best path (dossier §6): hardware-accelerated WebCodecs decode into a pooled canvas ring
      // buffer (constant VRAM). CanvasSink bakes in rotation metadata and yields straight-alpha
      // top-left pixels — exactly the normalization the digest rule requires.
      const sink = new this.lib.CanvasSink(videoTrack, {
        alpha: await videoTrack.canBeTransparent(),
        poolSize: CANVAS_POOL_SIZE,
        decoderOptions: { hardwareAcceleration: HW_ACCEL },
      });
      const out = new CapturedFrameSink();
      const max = opts?.maxFrames ?? Infinity;

      let index = 0;
      for await (const wrapped of sink.canvases()) {
        if (index >= max) break;
        // Copy out of the pooled canvas immediately (the ring buffer will reuse it).
        const img = imageDataFromCanvas(wrapped.canvas);
        const digest = await digestImageData(img, index, secToUs(wrapped.timestamp));
        out.push(img, digest);
        index++;
      }
      return out;
    } finally {
      mbInput.dispose();
    }
  }

  // ── seek ───────────────────────────────────────────────────────────────────────────────────
  /** Seek to tUs and return the landed frame's pts + digest. VideoSampleSink.getSample returns the
   *  last frame with start ≤ t (presentation order), i.e. the frame visible at that timestamp. */
  async seek(input: MediaInput, tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    const mbInput = await openInput(this.lib, input);
    try {
      const videoTrack = await mbInput.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error('mediabunny seek: no video track in input');

      const sink = new this.lib.VideoSampleSink(videoTrack, { hardwareAcceleration: HW_ACCEL });
      const sample = await sink.getSample(tUs / 1e6);
      if (!sample) throw new Error(`mediabunny seek: no frame at ${tUs}us`);
      try {
        const landedPtsUs = sample.microsecondTimestamp;
        const img = imageDataFromVideoSample(sample);
        const frame = await digestImageData(img, 0, landedPtsUs);
        return { landedPtsUs, frame };
      } finally {
        sample.close();
      }
    } finally {
      mbInput.dispose();
    }
  }

  // ── trim ───────────────────────────────────────────────────────────────────────────────────
  /**
   * Trim to [startUs, endUs). mediabunny's Conversion `trim` is frame-accurate (it re-times and, if
   * needed, re-encodes the boundary GOP), so `frameAccurate` is honored. When frameAccurate is
   * false we still pass the exact range — mediabunny will keep it lossless where the boundaries fall
   * on key frames.
   */
  async trim(
    input: MediaInput,
    range: { startUs: number; endUs: number },
    opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    const format = makeOutputFormat(opts.container);
    if (!format) throw new Error(`mediabunny cannot mux container '${opts.container}'`);

    const mbInput = await openInput(this.lib, input);
    try {
      const output = new this.lib.Output({ format, target: new this.lib.BufferTarget() });
      const convOpts: ConversionOptions = {
        input: mbInput,
        output,
        trim: { start: range.startUs / 1e6, end: range.endUs / 1e6 },
      };
      // Frame-accurate boundaries force a transcode of the boundary region; ask for it explicitly
      // so the requested start/end are honored exactly rather than snapped to key frames. Carry the
      // best-path hardware-acceleration hint (dossier §6) into that re-encode.
      if (opts.frameAccurate) {
        convOpts.video = { forceTranscode: true, hardwareAcceleration: HW_ACCEL };
      }
      return await runConversion(this.lib, convOpts, opts.container);
    } finally {
      mbInput.dispose();
    }
  }

  // ── mux ────────────────────────────────────────────────────────────────────────────────────
  /**
   * Mux pre-encoded tracks back into a container via Output + Encoded*PacketSource. Each chunk
   * becomes an EncodedPacket (decode order; pts from ptsUs). The first packet of each track carries
   * a decoder config built from the track description so the muxer can write codec-private data.
   */
  async mux(tracks: EncodedTracks, opts: { container: string }): Promise<MediaBytes> {
    const format = makeOutputFormat(opts.container);
    if (!format) throw new Error(`mediabunny cannot mux container '${opts.container}'`);

    const mb = this.lib;
    const output = new mb.Output({ format, target: new mb.BufferTarget() });

    interface Pending {
      add: (pkt: EncodedPacket, meta?: EncodedVideoChunkMetadata | EncodedAudioChunkMetadata) => Promise<void>;
      track: EncodedTracks['tracks'][number];
      isVideo: boolean;
    }
    const pendings: Pending[] = [];

    for (const t of tracks.tracks) {
      if (t.type === 'video') {
        const mbCodec = canonicalToMediabunnyVideo(t.codec) as VideoCodec | null;
        if (!mbCodec) throw new Error(`mediabunny mux: unsupported video codec '${t.codec}'`);
        const source = new mb.EncodedVideoPacketSource(mbCodec);
        output.addVideoTrack(source);
        pendings.push({ add: (p, m) => source.add(p, m as EncodedVideoChunkMetadata), track: t, isVideo: true });
      } else if (t.type === 'audio') {
        const mbCodec = canonicalToMediabunnyAudio(t.codec) as AudioCodec | null;
        if (!mbCodec) throw new Error(`mediabunny mux: unsupported audio codec '${t.codec}'`);
        const source = new mb.EncodedAudioPacketSource(mbCodec);
        output.addAudioTrack(source);
        pendings.push({ add: (p, m) => source.add(p, m as EncodedAudioChunkMetadata), track: t, isVideo: false });
      } else {
        // subtitle/other not handled by the encoded-packet mux path.
        continue;
      }
    }

    await output.start();

    for (const p of pendings) {
      const { track, isVideo, add } = p;
      const description = track.description ? bufferOf(track.description) : undefined;
      for (let i = 0; i < track.chunks.length; i++) {
        const c = track.chunks[i];
        if (!c) continue;
        const pkt = new mb.EncodedPacket(
          c.data,
          c.keyframe ? 'key' : 'delta',
          c.ptsUs / 1e6,
          c.durationUs / 1e6,
          // sequenceNumber: use decode index for stable ordering.
          i,
        );
        // First packet carries the decoder config so the muxer can emit codec-private boxes.
        const meta =
          i === 0
            ? isVideo
              ? ({
                  decoderConfig: {
                    codec: codecParamForTrack(track, true),
                    codedWidth: track.width ?? 0,
                    codedHeight: track.height ?? 0,
                    description,
                  },
                } as EncodedVideoChunkMetadata)
              : ({
                  decoderConfig: {
                    codec: codecParamForTrack(track, false),
                    sampleRate: track.sampleRate ?? 48000,
                    numberOfChannels: track.channels ?? 2,
                    description,
                  },
                } as EncodedAudioChunkMetadata)
            : undefined;
        await add(pkt, meta);
      }
    }

    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error('mediabunny mux produced no output buffer');
    return {
      bytes: new Uint8Array(buffer),
      mime: mimeForContainer(opts.container),
      container: opts.container,
    };
  }

  // ── decrypt ────────────────────────────────────────────────────────────────────────────────
  /**
   * Decrypt CENC (ctr/cbcs) protected ISOBMFF by supplying the key through mediabunny's
   * `resolveKeyId` callback at read time, then re-muxing the now-decoded content into a clean MP4.
   * mediabunny decrypts samples transparently during read; the conversion writes plaintext samples.
   */
  async decrypt(
    input: MediaInput,
    key: DecryptKey,
    opts: { scheme: EncryptionScheme },
  ): Promise<MediaBytes> {
    if (opts.scheme !== 'cenc-ctr' && opts.scheme !== 'cenc-cbcs') {
      throw new Error(`mediabunny decrypt: unsupported scheme '${opts.scheme}'`);
    }
    const mb = this.lib;
    const keyBytes = hexToBytes(key.keyHex);
    const blob = await input.blob();
    const mbInput = new mb.Input({
      source: new mb.BlobSource(blob),
      formats: mb.ALL_FORMATS,
      formatOptions: {
        isobmff: {
          // Resolve every requested key id to the supplied key. Fixtures here are single-key; if a
          // kid is provided we still answer with the same key (a mismatch would mean the wrong key
          // was passed, which mediabunny will surface as a decode failure downstream).
          resolveKeyId: () => keyBytes,
        },
      },
    });
    try {
      const format = makeOutputFormat('mp4');
      if (!format) throw new Error('mediabunny decrypt: mp4 output unavailable');
      const output = new mb.Output({ format, target: new mb.BufferTarget() });
      // No transform: copy decrypted (plaintext) samples straight through.
      return await runConversion(mb, { input: mbInput, output }, 'mp4');
    } finally {
      mbInput.dispose();
    }
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

/** Get an ArrayBuffer view of a Uint8Array's exact bytes (for WebCodecs descriptions). */
function bufferOf(u8: Uint8Array): ArrayBuffer {
  return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
    ? (u8.buffer as ArrayBuffer)
    : (u8.slice().buffer as ArrayBuffer);
}

/** Best-effort WebCodecs codec string for a mux track when only the canonical codec is known. */
function codecParamForTrack(track: EncodedTracks['tracks'][number], isVideo: boolean): string {
  if (isVideo) {
    switch (track.codec) {
      case 'h264':
        return 'avc1.640028';
      case 'hevc':
        return 'hev1.1.6.L93.B0';
      case 'vp8':
        return 'vp8';
      case 'vp9':
        return 'vp09.00.10.08';
      case 'av1':
        return 'av01.0.04M.08';
      default:
        return track.codec;
    }
  }
  switch (track.codec) {
    case 'aac':
      return 'mp4a.40.2';
    case 'opus':
      return 'opus';
    case 'mp3':
      return 'mp3';
    case 'flac':
      return 'flac';
    default:
      return track.codec;
  }
}

/** Read a 2D-canvas-backed frame into tight top-left straight-alpha ImageData. */
function imageDataFromCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('mediabunny decode: 2D context unavailable on sink canvas');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Render a VideoSample to a fresh 2D canvas (honoring rotation) and read RGBA back. */
function imageDataFromVideoSample(sample: import('mediabunny').VideoSample): ImageData {
  const width = sample.displayWidth || sample.codedWidth;
  const height = sample.displayHeight || sample.codedHeight;
  if (width <= 0 || height <= 0) throw new Error('VideoSample has zero display size');
  const { canvas, ctx } = make2dCanvas(width, height);
  // VideoSample.draw applies rotation metadata and writes straight-alpha pixels top-left.
  sample.draw(ctx, 0, 0, width, height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function make2dCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
    return { canvas, ctx };
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    return { canvas, ctx };
  }
  throw new Error('No canvas implementation available in this realm');
}

/** hex string → bytes (for decryption keys / ivs). */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}
