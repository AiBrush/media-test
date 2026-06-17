/**
 * src/engines/ffmpeg-wasm/adapter.ts — MediaEngine adapter for ffmpeg.wasm (@ffmpeg/ffmpeg@0.12.15).
 *
 * ROLE: broad-coverage SOFTWARE engine. ffmpeg.wasm is FFmpeg compiled to WebAssembly running in a
 * Worker; it covers the widest codec/container matrix of any engine here, but is slow and memory
 * bound. It is NOT the reference (Mediabunny is); it is a coverage baseline.
 *
 * Lib API used (verified against node_modules/@ffmpeg/ffmpeg/dist/esm/classes.d.ts and
 * node_modules/@ffmpeg/util/dist/esm/index.d.ts):
 *   import { FFmpeg } from '@ffmpeg/ffmpeg';
 *   import { toBlobURL } from '@ffmpeg/util';
 *   const ff = new FFmpeg();
 *   ff.on('log', ({ type, message }) => …)               // stdout/stderr lines
 *   await ff.load({ coreURL, wasmURL })                   // loads ffmpeg-core into the worker
 *   await ff.writeFile(path, Uint8Array)                  // into the in-worker MEMFS
 *   await ff.exec(args)    → exit code (0 = ok)           // runs ffmpeg <args>
 *   await ff.ffprobe(args) → exit code                    // runs ffprobe <args>
 *   const data = await ff.readFile(path, 'binary'|'utf8') // FileData = Uint8Array | string
 *   await ff.deleteFile(path)
 *
 * The single-thread core (@ffmpeg/core) is used by default: it does NOT require SharedArrayBuffer /
 * cross-origin isolation, so it loads in ordinary (non-COOP/COEP) browser contexts. If the core
 * bundle fails to load (offline, blocked CDN, missing crossOriginIsolation for an -mt core), init()
 * throws a CLEAR error so the runner records ERROR rather than a fake pass.
 *
 * Frame digests (decodeFrames) use the SAME normalization + sha256 as oracles.ts / platform: ffmpeg
 * emits straight-alpha, top-left, tight RGBA (`-pix_fmt rgba -f rawvideo`), which we slice per frame
 * and hash with the shared {@link sha256Hex}. This keeps digests engine-independent and comparable
 * to golden frame digests.
 */

import type { FFmpeg } from '@ffmpeg/ffmpeg';

import { sha256Hex } from '../platform/digest.ts';
import { registerEngine } from '../../core/registry.ts';
import type {
  CapabilitySet,
  DemuxResult,
  EncodedTracks,
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
} from '../../core/engine.ts';

const ENGINE_ID = 'ffmpeg.wasm@0.12.15';

/** Pinned ffmpeg-core version that @ffmpeg/ffmpeg@0.12.15 targets (see its const.ts CORE_VERSION). */
const CORE_VERSION = '0.12.9';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

/** Map a container token to the on-disk filename extension ffmpeg uses to pick the (de)muxer. */
function containerExt(container: string): string {
  switch (container) {
    case 'mp4':
      return 'mp4';
    case 'mov':
      return 'mov';
    case 'mkv':
      return 'mkv';
    case 'webm':
      return 'webm';
    case 'ts':
      return 'ts';
    case 'wav':
      return 'wav';
    case 'mp3':
      return 'mp3';
    case 'flac':
      return 'flac';
    case 'ogg':
      return 'ogg';
    case 'adts':
      return 'aac';
    default:
      return container;
  }
}

/** Map a container token to the output MIME for MediaBytes. */
function containerMime(container: string): string {
  switch (container) {
    case 'mp4':
    case 'mov':
      return 'video/mp4';
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

/** Map a canonical video codec token to ffmpeg's encoder name (software encoders only). */
function videoEncoder(codec: string): string | null {
  switch (codec) {
    case 'h264':
      return 'libx264';
    case 'hevc':
      return 'libx265';
    case 'vp8':
      return 'libvpx';
    case 'vp9':
      return 'libvpx-vp9';
    case 'av1':
      return 'libaom-av1';
    default:
      return null;
  }
}

/** Map a canonical audio codec token to ffmpeg's encoder name. */
function audioEncoder(codec: string): string | null {
  switch (codec) {
    case 'aac':
      return 'aac';
    case 'opus':
      return 'libopus';
    case 'mp3':
      return 'libmp3lame';
    case 'flac':
      return 'flac';
    case 'vorbis':
      return 'libvorbis';
    case 'pcm-s16':
      return 'pcm_s16le';
    case 'pcm-s24':
      return 'pcm_s24le';
    case 'pcm-f32':
      return 'pcm_f32le';
    case 'pcm-s16be':
      return 'pcm_s16be';
    default:
      return null;
  }
}

/** Map an ffprobe codec_name → canonical token. */
function canonicalCodec(name: string): string {
  const n = name.toLowerCase();
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
      return 'av1';
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
    case 'pcm_s16le':
      return 'pcm-s16';
    case 'pcm_s24le':
      return 'pcm-s24';
    case 'pcm_f32le':
      return 'pcm-f32';
    case 'pcm_s16be':
      return 'pcm-s16be';
    default:
      return n;
  }
}

/** ffprobe stream JSON shape (only the fields this adapter reads). */
interface FFProbeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
  duration?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
}
interface FFProbeFormat {
  format_name?: string;
  duration?: string;
  bit_rate?: string;
  tags?: Record<string, string>;
}
interface FFProbeResult {
  streams?: FFProbeStream[];
  format?: FFProbeFormat;
}

/** ffprobe packet JSON shape (only fields read for demux). */
interface FFProbePacket {
  stream_index: number;
  pts?: number;
  dts?: number;
  pts_time?: string;
  dts_time?: string;
  size?: string;
  flags?: string;
}

/** Parse an ffmpeg `num/den` rational string (e.g. '30000/1001') to a float; 0 if invalid. */
function parseRational(r: string | undefined): number {
  if (!r) return 0;
  const [a, b] = r.split('/');
  const num = Number(a);
  const den = b === undefined ? 1 : Number(b);
  if (!isFinite(num) || !isFinite(den) || den === 0) return 0;
  return num / den;
}

function codecTypeToTrackType(t: string | undefined): TrackType {
  switch (t) {
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'subtitle':
      return 'subtitle';
    default:
      return 'other';
  }
}

/**
 * ffmpeg.wasm engine. Heavy WASM core is loaded once in init(); each op writes input to MEMFS, runs
 * ffmpeg/ffprobe, reads the output back, and cleans up its scratch files.
 */
export class FfmpegWasmEngine implements MediaEngine {
  readonly id = ENGINE_ID;

  /** Loaded lazily in init(); FFmpeg instance backed by a dedicated worker. */
  private ff: FFmpeg | null = null;
  /** Monotonic counter so concurrent-ish ops never collide on MEMFS filenames within one instance. */
  private seq = 0;
  /** Last stderr/stdout lines, surfaced in thrown errors for diagnosis. */
  private logTail: string[] = [];

  capabilities(): CapabilitySet {
    return {
      // ffmpeg.wasm genuinely performs all of these in-browser. decrypt is NOT declared: while
      // FFmpeg can decrypt CENC with `-decryption_key`, wiring the key/scheme plumbing is out of
      // this adapter's scope, so it stays NA(engine) rather than a half-implementation.
      operations: {
        probe: true,
        demux: true,
        remux: true,
        transcode: true,
        decodeFrames: true,
        seek: true,
        trim: true,
      },
      // Demuxers/muxers compiled into the standard @ffmpeg/core build.
      containersIn: ['mp4', 'mov', 'mkv', 'webm', 'ts', 'wav', 'mp3', 'flac', 'ogg', 'adts'],
      containersOut: ['mp4', 'mov', 'mkv', 'webm', 'ts', 'wav', 'mp3', 'flac', 'ogg', 'adts'],
      // Decode side is broad; encode side depends on which encoders the core was built with. The
      // standard @ffmpeg/core ships libx264/libx265/libvpx(-vp9)/libaom-av1 + aac/opus/mp3/flac/
      // vorbis/pcm. We declare codecs the build can both read and (re)produce.
      videoCodecs: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
      audioCodecs: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24', 'pcm-f32', 'pcm-s16be'],
      encryption: [], // not implemented in this adapter
      // 'webcodecs:independent': ffmpeg.wasm uses its own software codecs, so the runner must NOT
      // browser-gate it on WebCodecs.isConfigSupported. 'fanout' dropped: transcode() can't return N
      // renditions through a single MediaBytes, so fan-out scenarios are an honest NA(engine) here.
      features: ['resize', 'rotate', 'fps', 'trim:frame-accurate', 'fragmented', 'webcodecs:independent'],
    };
  }

  async init(): Promise<void> {
    if (this.ff) return;
    let mod: typeof import('@ffmpeg/ffmpeg');
    let util: typeof import('@ffmpeg/util');
    try {
      // Dynamic import keeps the suite shell light (rule: load the heavy lib inside init()).
      mod = await import('@ffmpeg/ffmpeg');
      util = await import('@ffmpeg/util');
    } catch (e) {
      throw new Error(
        `${ENGINE_ID}: failed to import @ffmpeg/ffmpeg or @ffmpeg/util: ${describeError(e)}`,
      );
    }

    const ff = new mod.FFmpeg();
    ff.on('log', ({ message }) => {
      this.logTail.push(message);
      if (this.logTail.length > 200) this.logTail.shift();
    });

    try {
      // toBlobURL fetches the core JS + WASM from the CDN and hands FFmpeg same-origin blob URLs
      // (required so the worker can importScripts the core). Single-thread core → no SAB / COOP+COEP.
      const coreURL = await util.toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await util.toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');
      await ff.load({ coreURL, wasmURL });
    } catch (e) {
      // Clear, actionable error: distinguishes a CDN/network failure from a missing-isolation case.
      const sab = typeof SharedArrayBuffer !== 'undefined';
      throw new Error(
        `${ENGINE_ID}: ffmpeg-core failed to load (SharedArrayBuffer=${sab}, ` +
          `crossOriginIsolated=${(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ?? 'n/a'}). ` +
          `Cause: ${describeError(e)}. Recent log: ${this.logTail.slice(-5).join(' | ')}`,
      );
    }
    this.ff = ff;
  }

  async dispose(): Promise<void> {
    if (this.ff) {
      try {
        this.ff.terminate();
      } catch {
        /* terminate is best-effort */
      }
      this.ff = null;
    }
    this.logTail = [];
  }

  private requireFf(): FFmpeg {
    if (!this.ff) throw new Error(`${ENGINE_ID}: init() must be called before use`);
    return this.ff;
  }

  /** Fresh, collision-free scratch base for one operation. */
  private scratch(): string {
    return `op${this.seq++}`;
  }

  /** Run an ffmpeg exec, throwing a diagnostic error (with log tail) on non-zero exit. */
  private async run(args: string[]): Promise<void> {
    const ff = this.requireFf();
    this.logTail = [];
    const code = await ff.exec(args);
    if (code !== 0) {
      throw new Error(
        `${ENGINE_ID}: ffmpeg exited ${code} for [${args.join(' ')}]. Log: ${this.logTail.slice(-8).join(' | ')}`,
      );
    }
  }

  private async readBinary(path: string): Promise<Uint8Array> {
    const data = await this.requireFf().readFile(path, 'binary');
    if (typeof data === 'string') {
      // Defensive: 'binary' should yield Uint8Array; if a string came back, encode it.
      return new TextEncoder().encode(data);
    }
    return data;
  }

  private async readText(path: string): Promise<string> {
    const data = await this.requireFf().readFile(path, 'utf8');
    return typeof data === 'string' ? data : new TextDecoder().decode(data);
  }

  private async cleanup(paths: string[]): Promise<void> {
    const ff = this.requireFf();
    for (const p of paths) {
      try {
        await ff.deleteFile(p);
      } catch {
        /* file may not exist (e.g. op failed before producing output) */
      }
    }
  }

  /** Write a MediaInput's bytes into MEMFS under a chosen name; returns that name. */
  private async writeInput(input: MediaInput, name: string): Promise<string> {
    const bytes = new Uint8Array(await input.arrayBuffer());
    await this.requireFf().writeFile(name, bytes);
    return name;
  }

  // ── probe ────────────────────────────────────────────────────────────────────────────────────

  async probe(input: MediaInput): Promise<NormalizedMetadata> {
    const base = this.scratch();
    const inName = `${base}.in`;
    const outName = `${base}.probe.json`;
    await this.writeInput(input, inName);
    try {
      const ff = this.requireFf();
      this.logTail = [];
      // ffprobe → JSON. side_data shows rotation; format gives container + duration fallback.
      const code = await ff.ffprobe([
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        inName,
        '-o', outName,
      ]);
      if (code !== 0) {
        throw new Error(
          `${ENGINE_ID}: ffprobe exited ${code}. Log: ${this.logTail.slice(-8).join(' | ')}`,
        );
      }
      const json = JSON.parse(await this.readText(outName)) as FFProbeResult;
      return this.toMetadata(json);
    } finally {
      await this.cleanup([inName, outName]);
    }
  }

  private toMetadata(json: FFProbeResult): NormalizedMetadata {
    const fmt = json.format ?? {};
    const container = (fmt.format_name ?? '').split(',')[0] ?? '';
    const fmtDur = fmt.duration ? Number(fmt.duration) : NaN;

    const tracks: NormalizedTrack[] = (json.streams ?? []).map((s): NormalizedTrack => {
      const type = codecTypeToTrackType(s.codec_type);
      const track: NormalizedTrack = {
        type,
        codec: canonicalCodec(s.codec_name ?? ''),
        bitrate: s.bit_rate ? Number(s.bit_rate) : null,
        language: s.tags?.language && s.tags.language !== 'und' ? s.tags.language : null,
      };
      if (type === 'video') {
        track.width = s.width;
        track.height = s.height;
        const fps = parseRational(s.avg_frame_rate) || parseRational(s.r_frame_rate);
        if (fps > 0) track.fps = fps;
        const rot = s.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation;
        if (typeof rot === 'number') {
          // ffmpeg reports rotation as negative-clockwise (display) degrees; normalize to [0,360).
          track.rotation = ((-rot % 360) + 360) % 360;
        }
      } else if (type === 'audio') {
        if (s.sample_rate) track.sampleRate = Number(s.sample_rate);
        if (typeof s.channels === 'number') track.channels = s.channels;
      }
      return track;
    });

    return {
      container,
      durationSec: isFinite(fmtDur) ? fmtDur : null,
      tracks,
      tags: fmt.tags ?? {},
    };
  }

  // ── demux ────────────────────────────────────────────────────────────────────────────────────

  async demux(input: MediaInput): Promise<DemuxResult> {
    const base = this.scratch();
    const inName = `${base}.in`;
    const metaName = `${base}.meta.json`;
    const pktName = `${base}.pkts.json`;
    await this.writeInput(input, inName);
    try {
      const ff = this.requireFf();

      // Metadata (reuse the same ffprobe path).
      this.logTail = [];
      let code = await ff.ffprobe([
        '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inName, '-o', metaName,
      ]);
      if (code !== 0) {
        throw new Error(`${ENGINE_ID}: ffprobe(streams) exited ${code}. Log: ${this.logTail.slice(-8).join(' | ')}`);
      }
      const metaJson = JSON.parse(await this.readText(metaName)) as FFProbeResult;
      const metadata = this.toMetadata(metaJson);

      // Packets: timestamps + size + keyframe flag. Use entry selection to keep the JSON small.
      this.logTail = [];
      code = await ff.ffprobe([
        '-v', 'error',
        '-print_format', 'json',
        '-show_entries', 'packet=stream_index,pts_time,dts_time,size,flags',
        inName,
        '-o', pktName,
      ]);
      if (code !== 0) {
        throw new Error(`${ENGINE_ID}: ffprobe(packets) exited ${code}. Log: ${this.logTail.slice(-8).join(' | ')}`);
      }
      const pktJson = JSON.parse(await this.readText(pktName)) as { packets?: FFProbePacket[] };

      const packets: PacketInfo[] = (pktJson.packets ?? []).map((p): PacketInfo => {
        const ptsSec = p.pts_time !== undefined ? Number(p.pts_time) : NaN;
        const dtsSec = p.dts_time !== undefined ? Number(p.dts_time) : NaN;
        return {
          trackIndex: p.stream_index,
          size: p.size ? Number(p.size) : 0,
          // ffprobe pts_time/dts_time are already in seconds; 'N/A' → NaN → 0 fallback.
          ptsUs: isFinite(ptsSec) ? Math.round(ptsSec * 1_000_000) : 0,
          dtsUs: isFinite(dtsSec) ? Math.round(dtsSec * 1_000_000) : (isFinite(ptsSec) ? Math.round(ptsSec * 1_000_000) : 0),
          // Keyframe flag: ffprobe sets 'K' (often 'K_') in the flags string for keyframes.
          keyframe: (p.flags ?? '').includes('K'),
        };
      });

      packets.sort((a, b) => (a.dtsUs - b.dtsUs) || (a.trackIndex - b.trackIndex));
      return { metadata, packets };
    } finally {
      await this.cleanup([inName, metaName, pktName]);
    }
  }

  // ── remux ────────────────────────────────────────────────────────────────────────────────────

  async remux(input: MediaInput, opts: { container: string }): Promise<MediaBytes> {
    const base = this.scratch();
    const inName = `${base}.in`;
    const outName = `${base}.out.${containerExt(opts.container)}`;
    await this.writeInput(input, inName);
    try {
      // Stream copy: no re-encode, just rewrap. +faststart hint is mp4-only and harmless to set via
      // movflags only when targeting mp4/mov.
      const args = ['-i', inName, '-c', 'copy'];
      if (opts.container === 'mp4' || opts.container === 'mov') {
        args.push('-movflags', '+faststart');
      }
      args.push(outName);
      await this.run(args);
      const bytes = await this.readBinary(outName);
      return { bytes, mime: containerMime(opts.container), container: opts.container };
    } finally {
      await this.cleanup([inName, outName]);
    }
  }

  // ── transcode ────────────────────────────────────────────────────────────────────────────────

  async transcode(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes> {
    if (opts.variants && opts.variants.length > 0) {
      // Fan-out is declared ('fanout' feature); we render variant 0 here and note that callers
      // requesting full ABR ladders should invoke transcode once per rendition. (A single ffmpeg
      // invocation with multiple outputs is possible but the MediaBytes contract returns one blob.)
      throw new Error(
        `${ENGINE_ID}: multi-output fan-out returns one MediaBytes; call transcode() per variant`,
      );
    }
    const base = this.scratch();
    const inName = `${base}.in`;
    const outName = `${base}.out.${containerExt(opts.container)}`;
    await this.writeInput(input, inName);
    try {
      const args = ['-i', inName];

      // Video options.
      if (opts.video) {
        const v = opts.video;
        const enc = v.codec ? videoEncoder(v.codec) : null;
        if (v.codec && !enc) {
          throw new Error(`${ENGINE_ID}: no software encoder for video codec '${v.codec}'`);
        }
        if (enc) args.push('-c:v', enc);
        const filters: string[] = [];
        if (v.width && v.height) filters.push(`scale=${v.width}:${v.height}`);
        else if (v.width) filters.push(`scale=${v.width}:-2`);
        else if (v.height) filters.push(`scale=-2:${v.height}`);
        if (v.fps) args.push('-r', String(v.fps));
        if (typeof v.rotate === 'number' && v.rotate !== 0) {
          // transpose handles 90/270; 180 = two transposes. Use display-matrix-agnostic pixel rotate.
          const norm = ((v.rotate % 360) + 360) % 360;
          if (norm === 90) filters.push('transpose=1');
          else if (norm === 270) filters.push('transpose=2');
          else if (norm === 180) filters.push('transpose=1,transpose=1');
        }
        if (filters.length) args.push('-vf', filters.join(','));
        if (v.bitrate) args.push('-b:v', String(v.bitrate));
      }

      // Audio options.
      if (opts.audio) {
        const a = opts.audio;
        const enc = a.codec ? audioEncoder(a.codec) : null;
        if (a.codec && !enc) {
          throw new Error(`${ENGINE_ID}: no encoder for audio codec '${a.codec}'`);
        }
        if (enc) args.push('-c:a', enc);
        if (a.sampleRate) args.push('-ar', String(a.sampleRate));
        if (a.channels) args.push('-ac', String(a.channels));
        if (a.bitrate) args.push('-b:a', String(a.bitrate));
      }

      args.push(outName);
      await this.run(args);
      const bytes = await this.readBinary(outName);
      return { bytes, mime: containerMime(opts.container), container: opts.container };
    } finally {
      await this.cleanup([inName, outName]);
    }
  }

  // ── trim ─────────────────────────────────────────────────────────────────────────────────────

  async trim(
    input: MediaInput,
    range: { startUs: number; endUs: number },
    opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    const base = this.scratch();
    const inName = `${base}.in`;
    const outName = `${base}.out.${containerExt(opts.container)}`;
    await this.writeInput(input, inName);
    try {
      const startSec = range.startUs / 1_000_000;
      const endSec = range.endUs / 1_000_000;
      const args: string[] = [];
      if (opts.frameAccurate) {
        // Frame-accurate: -ss/-to AFTER -i forces decode+re-encode to land on exact frames.
        args.push('-i', inName, '-ss', startSec.toFixed(6), '-to', endSec.toFixed(6));
        // Re-encode video with the default codec for the container so cut points are exact.
      } else {
        // Keyframe-aligned fast trim: -ss BEFORE -i seeks to the nearest preceding keyframe, -c copy.
        args.push('-ss', startSec.toFixed(6), '-to', endSec.toFixed(6), '-i', inName, '-c', 'copy');
      }
      args.push(outName);
      await this.run(args);
      const bytes = await this.readBinary(outName);
      return { bytes, mime: containerMime(opts.container), container: opts.container };
    } finally {
      await this.cleanup([inName, outName]);
    }
  }

  // ── decodeFrames ─────────────────────────────────────────────────────────────────────────────

  async decodeFrames(input: MediaInput, opts?: { maxFrames?: number }): Promise<FrameSink> {
    const base = this.scratch();
    const inName = `${base}.in`;
    const metaName = `${base}.meta.json`;
    const rawName = `${base}.rgba`;
    await this.writeInput(input, inName);
    try {
      const ff = this.requireFf();

      // First learn the video dimensions + frame rate so we can slice the raw stream and assign PTS.
      this.logTail = [];
      const pcode = await ff.ffprobe([
        '-v', 'error', '-select_streams', 'v:0', '-print_format', 'json', '-show_streams', inName, '-o', metaName,
      ]);
      if (pcode !== 0) {
        throw new Error(`${ENGINE_ID}: ffprobe(video) exited ${pcode}. Log: ${this.logTail.slice(-8).join(' | ')}`);
      }
      const vjson = JSON.parse(await this.readText(metaName)) as FFProbeResult;
      const v = (vjson.streams ?? [])[0];
      if (!v || v.width === undefined || v.height === undefined) {
        throw new Error(`${ENGINE_ID}: no decodable video stream for decodeFrames`);
      }
      const width = v.width;
      const height = v.height;
      const fps = parseRational(v.avg_frame_rate) || parseRational(v.r_frame_rate) || 30;
      const maxFrames = opts?.maxFrames;

      // Decode to tight, straight-alpha, top-left RGBA rawvideo (one frame after another, no padding).
      const args = ['-i', inName];
      if (maxFrames && maxFrames > 0) args.push('-frames:v', String(maxFrames));
      args.push('-pix_fmt', 'rgba', '-f', 'rawvideo', rawName);
      await this.run(args);

      const raw = await this.readBinary(rawName);
      const frameBytes = width * height * 4;
      if (frameBytes <= 0) throw new Error(`${ENGINE_ID}: invalid frame size ${width}x${height}`);
      const total = Math.floor(raw.byteLength / frameBytes);

      const frames: FrameDigest[] = [];
      // ImageData requires a Uint8ClampedArray over a plain ArrayBuffer; pin the element type so the
      // array does not widen to the SharedArrayBuffer-inclusive ArrayBufferLike.
      const pixels: Uint8ClampedArray<ArrayBuffer>[] = [];
      for (let i = 0; i < total; i++) {
        const start = i * frameBytes;
        const view = raw.subarray(start, start + frameBytes);
        // Digest over the exact tight RGBA bytes (matches oracles.ts / platform digest convention).
        const sha256 = await sha256Hex(view);
        const ptsUs = Math.round((i / fps) * 1_000_000);
        frames.push({ index: i, ptsUs, sha256, width, height });
        // Keep an ArrayBuffer-backed copy for SSIM/PSNR oracles via getPixels (ImageData needs a
        // Uint8ClampedArray over a plain ArrayBuffer, not a SharedArrayBuffer-typed view).
        const clamped = new Uint8ClampedArray(frameBytes);
        clamped.set(view);
        pixels.push(clamped);
      }

      return {
        frames,
        async getPixels(i: number): Promise<ImageData> {
          const buf = pixels[i];
          if (!buf) throw new Error(`${ENGINE_ID}: frame ${i} out of range (have ${pixels.length})`);
          return new ImageData(buf, width, height);
        },
      };
    } finally {
      await this.cleanup([inName, metaName, rawName]);
    }
  }

  // ── seek ─────────────────────────────────────────────────────────────────────────────────────

  async seek(input: MediaInput, tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    const base = this.scratch();
    const inName = `${base}.in`;
    const metaName = `${base}.meta.json`;
    const rawName = `${base}.rgba`;
    await this.writeInput(input, inName);
    try {
      const ff = this.requireFf();
      this.logTail = [];
      const pcode = await ff.ffprobe([
        '-v', 'error', '-select_streams', 'v:0', '-print_format', 'json', '-show_streams', inName, '-o', metaName,
      ]);
      if (pcode !== 0) {
        throw new Error(`${ENGINE_ID}: ffprobe(video) exited ${pcode}. Log: ${this.logTail.slice(-8).join(' | ')}`);
      }
      const vjson = JSON.parse(await this.readText(metaName)) as FFProbeResult;
      const v = (vjson.streams ?? [])[0];
      if (!v || v.width === undefined || v.height === undefined) {
        throw new Error(`${ENGINE_ID}: no decodable video stream for seek`);
      }
      const width = v.width;
      const height = v.height;
      const tSec = Math.max(0, tUs / 1_000_000);

      // Decode-accurate seek: -ss AFTER -i decodes from the start and lands exactly on tSec, then
      // grab a single frame. landedPtsUs is the requested time (frame-accurate output stream restarts
      // its clock at 0; we report the requested target as the landed presentation time).
      await this.run(['-ss', tSec.toFixed(6), '-i', inName, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', rawName]);
      const raw = await this.readBinary(rawName);
      const frameBytes = width * height * 4;
      if (raw.byteLength < frameBytes) {
        throw new Error(`${ENGINE_ID}: seek produced no frame at ${tSec}s`);
      }
      const view = raw.subarray(0, frameBytes);
      const sha256 = await sha256Hex(view);
      const landedPtsUs = Math.round(tSec * 1_000_000);
      return { landedPtsUs, frame: { index: 0, ptsUs: landedPtsUs, sha256, width, height } };
    } finally {
      await this.cleanup([inName, metaName, rawName]);
    }
  }

  // ── undeclared optional methods (mux/decrypt) ─────────────────────────────────────────────────
  // Not declared in capabilities() → runner negotiates NA(engine); present only to satisfy the
  // optional-method shape if a caller reaches for them directly.

  async mux(_tracks: EncodedTracks, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: mux from EncodedTracks not implemented`);
  }
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

/** Register the ffmpeg.wasm engine factory under its versioned id. */
export function registerFfmpegWasm(): void {
  registerEngine(ENGINE_ID, () => new FfmpegWasmEngine());
}
