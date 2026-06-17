/**
 * src/engines/mediabunny/adapter.ts — the REFERENCE engine adapter (mediabunny@1.48.0).
 *
 * Implements `MediaEngine` (src/core/engine.ts) entirely against the real mediabunny API. This is
 * the comparison baseline, so it is the most complete adapter and judges only observable behavior
 * (bytes/metadata/frames in → out). All timestamps are converted to MICROSECONDS via mediabunny's
 * `EncodedPacket.microsecondTimestamp` / `microsecondDuration` (and seconds*1e6 where mediabunny
 * only gives seconds). Frame digests use the shared normalization (digest.ts) so they line up with
 * golden data and other engines.
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
 */

import {
  Input,
  BlobSource,
  ALL_FORMATS,
  EncodedPacketSink,
  EncodedPacket,
  CanvasSink,
  VideoSampleSink,
  Conversion,
  Output,
  BufferTarget,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
  QUALITY_HIGH,
  type InputFormat,
  type InputTrack,
  type InputVideoTrack,
  type InputAudioTrack,
  type ConversionOptions,
  type ConversionVideoOptions,
  type ConversionAudioOptions,
  type VideoCodec,
  type AudioCodec,
  type Rotation,
} from 'mediabunny';

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

/** seconds → integer microseconds (mediabunny exposes most times in seconds). */
function secToUs(sec: number): number {
  return Math.round(sec * 1e6);
}

/** Build a mediabunny Input from a corpus asset. Restricts formats to the asset's container when
 *  known (faster, deterministic), else accepts ALL_FORMATS. */
async function openInput(input: MediaInput, container?: string): Promise<Input> {
  const blob = await input.blob();
  const formats: InputFormat[] = [];
  if (container) {
    const f = inputFormatForContainer(container);
    if (f) formats.push(f);
  }
  return new Input({
    source: new BlobSource(blob),
    formats: formats.length ? formats : ALL_FORMATS,
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

  // Prefer precise duration; fall back to metadata duration; else null.
  let durationSec: number | null = null;
  try {
    const d = await input.computeDuration();
    durationSec = Number.isFinite(d) ? d : null;
  } catch {
    try {
      durationSec = await input.getDurationFromMetadata();
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

/** Build mediabunny ConversionVideoOptions from a TranscodeVideoOptions block. */
function buildVideoOptions(v: TranscodeVideoOptions): ConversionVideoOptions {
  const opts: ConversionVideoOptions = {};
  if (v.codec) {
    const mb = canonicalToMediabunnyVideo(v.codec);
    if (mb) opts.codec = mb;
  }
  if (typeof v.width === 'number') opts.width = v.width;
  if (typeof v.height === 'number') opts.height = v.height;
  if (typeof v.fps === 'number') opts.frameRate = v.fps;
  if (typeof v.bitrate === 'number') opts.bitrate = v.bitrate;
  else if (v.codec) opts.bitrate = QUALITY_HIGH; // sensible default when re-encoding
  if (typeof v.rotate === 'number') opts.rotate = (((v.rotate % 360) + 360) % 360) as Rotation;
  return opts;
}

/** Build mediabunny ConversionAudioOptions from a TranscodeOptions.audio block. */
function buildAudioOptions(a: NonNullable<TranscodeOptions['audio']>): ConversionAudioOptions {
  const opts: ConversionAudioOptions = {};
  if (a.codec) {
    const mb = canonicalToMediabunnyAudio(a.codec);
    if (mb) opts.codec = mb;
  }
  if (typeof a.sampleRate === 'number') opts.sampleRate = a.sampleRate;
  if (typeof a.channels === 'number') opts.numberOfChannels = a.channels;
  if (typeof a.bitrate === 'number') opts.bitrate = a.bitrate;
  else if (a.codec) opts.bitrate = QUALITY_HIGH;
  return opts;
}

/** Run a Conversion to completion and return the resulting bytes. */
async function runConversion(opts: ConversionOptions, container: string): Promise<MediaBytes> {
  const conversion = await Conversion.init(opts);
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

  constructor(id = 'mediabunny@1.48.0') {
    this.id = id;
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
      // Read side: every container mediabunny can demux/probe.
      containersIn: ['mp4', 'mov', 'mkv', 'webm', 'ts', 'wav', 'mp3', 'flac', 'ogg', 'adts'],
      // Write side: every container mediabunny can mux. (HLS is multi-file/pathed → excluded here.)
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
        'rotate', // Conversion video rotate + rotation metadata
        'alpha', // VP9 alpha (WebM/MKV) via alpha:'keep'
        'fanout', // Conversion video/audio fan-out (1→N renditions)
      ],
    };
  }

  async init(): Promise<void> {
    // mediabunny is statically imported (reference engine); nothing heavy to load.
  }

  async dispose(): Promise<void> {
    // No global resources held between operations.
  }

  // ── probe ──────────────────────────────────────────────────────────────────────────────────
  async probe(input: MediaInput): Promise<NormalizedMetadata> {
    const mb = await openInput(input);
    try {
      return await metadataFromInput(mb);
    } finally {
      mb.dispose();
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
    const mb = await openInput(input);
    try {
      const metadata = await metadataFromInput(mb);
      const tracks = await mb.getTracks();
      const packets: PacketInfo[] = [];

      for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
        const track = tracks[trackIndex];
        if (!track) continue;
        const sink = new EncodedPacketSink(track);
        // metadataOnly avoids loading sample bytes; verifyKeyPackets gives accurate key flags.
        for await (const pkt of sink.packets(undefined, undefined, {
          metadataOnly: true,
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
      mb.dispose();
    }
  }

  // ── remux ──────────────────────────────────────────────────────────────────────────────────
  /** Lossless container change: Conversion with no codec/transform options copies encoded samples. */
  async remux(input: MediaInput, opts: { container: string }): Promise<MediaBytes> {
    const format = makeOutputFormat(opts.container);
    if (!format) throw new Error(`mediabunny cannot mux container '${opts.container}'`);
    const mb = await openInput(input);
    try {
      const output = new Output({ format, target: new BufferTarget() });
      return await runConversion({ input: mb, output }, opts.container);
    } finally {
      mb.dispose();
    }
  }

  // ── transcode ──────────────────────────────────────────────────────────────────────────────
  /**
   * Codec / resolution / fps / bitrate / rotate transcode via Conversion. When `opts.variants` is
   * set this is a FAN-OUT (1→N renditions): mediabunny supports it natively by returning an array
   * of ConversionVideoOptions from the per-track callback. For the suite's single-bytes contract we
   * produce the FIRST variant's bytes; mediabunny would write all N renditions into one output if
   * the format allows. (Multi-rendition delivery is HLS/ABR territory — see notes in the summary.)
   */
  async transcode(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes> {
    const format = makeOutputFormat(opts.container);
    if (!format) throw new Error(`mediabunny cannot mux container '${opts.container}'`);

    const mb = await openInput(input);
    try {
      const output = new Output({ format, target: new BufferTarget() });
      const convOpts: ConversionOptions = { input: mb, output };

      const videoSpec = opts.variants && opts.variants.length ? opts.variants[0] : opts.video;
      if (videoSpec) convOpts.video = buildVideoOptions(videoSpec);
      if (opts.audio) convOpts.audio = buildAudioOptions(opts.audio);

      return await runConversion(convOpts, opts.container);
    } finally {
      mb.dispose();
    }
  }

  // ── decodeFrames ───────────────────────────────────────────────────────────────────────────
  /**
   * Decode the primary video track to normalized RGBA frame digests. CanvasSink bakes in rotation
   * metadata and yields a 2D-canvas-backed frame (straight alpha, top-left), which getImageData
   * reads back tight — exactly the normalization the digest rule requires.
   */
  async decodeFrames(input: MediaInput, opts?: { maxFrames?: number }): Promise<FrameSink> {
    const mb = await openInput(input);
    try {
      const videoTrack = await mb.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error('mediabunny decodeFrames: no video track in input');

      const sink = new CanvasSink(videoTrack, { alpha: await videoTrack.canBeTransparent() });
      const out = new CapturedFrameSink();
      const max = opts?.maxFrames ?? Infinity;

      let index = 0;
      for await (const wrapped of sink.canvases()) {
        if (index >= max) break;
        const img = imageDataFromCanvas(wrapped.canvas);
        const digest = await digestImageData(img, index, secToUs(wrapped.timestamp));
        out.push(img, digest);
        index++;
      }
      return out;
    } finally {
      mb.dispose();
    }
  }

  // ── seek ───────────────────────────────────────────────────────────────────────────────────
  /** Seek to tUs and return the landed frame's pts + digest. VideoSampleSink.getSample returns the
   *  last frame with start ≤ t (presentation order), i.e. the frame visible at that timestamp. */
  async seek(input: MediaInput, tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    const mb = await openInput(input);
    try {
      const videoTrack = await mb.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error('mediabunny seek: no video track in input');

      const sink = new VideoSampleSink(videoTrack);
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
      mb.dispose();
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

    const mb = await openInput(input);
    try {
      const output = new Output({ format, target: new BufferTarget() });
      const convOpts: ConversionOptions = {
        input: mb,
        output,
        trim: { start: range.startUs / 1e6, end: range.endUs / 1e6 },
      };
      // Frame-accurate boundaries force a transcode of the boundary region; ask for it explicitly
      // so the requested start/end are honored exactly rather than snapped to key frames.
      if (opts.frameAccurate) {
        convOpts.video = { forceTranscode: true };
      }
      return await runConversion(convOpts, opts.container);
    } finally {
      mb.dispose();
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

    const output = new Output({ format, target: new BufferTarget() });

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
        const source = new EncodedVideoPacketSource(mbCodec);
        output.addVideoTrack(source);
        pendings.push({ add: (p, m) => source.add(p, m as EncodedVideoChunkMetadata), track: t, isVideo: true });
      } else if (t.type === 'audio') {
        const mbCodec = canonicalToMediabunnyAudio(t.codec) as AudioCodec | null;
        if (!mbCodec) throw new Error(`mediabunny mux: unsupported audio codec '${t.codec}'`);
        const source = new EncodedAudioPacketSource(mbCodec);
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
        const pkt = new EncodedPacket(
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
    const keyBytes = hexToBytes(key.keyHex);
    const blob = await input.blob();
    const mb = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
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
      const output = new Output({ format, target: new BufferTarget() });
      // No transform: copy decrypted (plaintext) samples straight through.
      return await runConversion({ input: mb, output }, 'mp4');
    } finally {
      mb.dispose();
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
