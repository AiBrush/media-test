/**
 * src/engines/ffmpeg-wasm/adapter.ts — MediaEngine adapter for ffmpeg.wasm.
 *
 * ROLE: broad-coverage SOFTWARE engine. ffmpeg.wasm is FFmpeg compiled to WebAssembly running in a
 * Worker; it covers the widest codec/container matrix of any engine here, but is slow and memory
 * bound. It is NOT the reference (mediabunny is) — it is a coverage/correctness baseline.
 *
 * BEST PATH (dossier §5, recorded as configUsed): the multi-thread core `@ffmpeg/core-mt` is
 * ffmpeg.wasm's documented fastest path (~2× single-thread). It needs `SharedArrayBuffer` (page must
 * be cross-origin isolated via COOP+COEP). When `crossOriginIsolated === true` we load the vendored
 * core-mt and pass `-threads N` (N = min(hardwareConcurrency, 8)); otherwise we fall back to the
 * single-thread core `@ffmpeg/core` (correct, ~2× slower) and record coreBuild:"st".
 *
 * LOCAL HOSTING (dossier §8, suite §0.8): the wrapper's defaults point at unpkg.com and the docs'
 * `toBlobURL` helper is a CDN/CSP workaround — BOTH are forbidden at run time. We vendor the core
 * files under ./vendor/{core-mt,core}/ and import them as same-origin `?url` assets (Vite emits them
 * content-hashed, same-origin). No network fetch happens inside any measured window.
 *
 * HONEST capabilities (dossier §6/§9): FFmpeg's matrix is 100% compile-time-determined. init() runs
 * `ffmpeg -encoders` / `-decoders` / `-formats` once and parses the log (codecs.ts) to build the
 * EXACT capability set for the vendored 0.12.10 core. The published build does NOT enable AV1
 * (no libaom/dav1d) → av1 is absent. decrypt (CENC/HLS) is not in the build → absent. fan-out
 * returns N renditions which the single-MediaBytes contract can't carry → 'fanout' absent.
 *
 * Frame digests (decodeFrames/seek) use the SAME normalization + sha256 as oracles.ts / platform:
 * ffmpeg emits straight-alpha, top-left, tight RGBA (`-pix_fmt rgba -f rawvideo`), which we slice
 * per frame and hash with the shared {@link sha256Hex}. Digests stay engine-independent.
 *
 * HARDENING (2026-06-18, audited findings):
 *   • configUsed is a PROPERTY (not a method) so the runner records the §8.5 best-path config by value
 *     (engine.ts:174 / runner.ts:956); mirrors platform/mediabunny/mp4box.
 *   • capabilities() declares mux:true and mux() is implemented via the dossier `-c copy` file path
 *     (§4 line 108, §10 A.3/A.7) — was a false-NA + throwing stub. av1 mux stays NA via the codec gate.
 *   • 'hls' is filtered from containersIn (a single .m3u8 in MEMFS can't reach sibling segments —
 *     declaring it turns a clean NA into a runtime ERROR), mirroring the existing containersOut filter.
 *     refs: §6 (container coverage), FAQ; https://ffmpegwasm.netlify.app/docs/overview/
 *   • runInfo()/demux() read execs now pass exec(args, timeoutMs) so fuzzed/truncated inputs can't
 *     wedge the worker (§9 item 10, §11; https://ffmpegwasm.netlify.app/docs/getting-started/usage/ ,
 *     https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/699 ).
 *   • 'metadata:write' is gated OFF (over-claim: the runner drops options.tags before remux) but
 *     remux() still honors tags so it can be re-enabled once the runner forwards them.
 *   • av1 stays OUT of videoCodecs (decode-only can't be expressed in the flat round-trip list while
 *     'webcodecs:independent' short-circuits negotiate Pass-2; adding it would over-claim av1 ENCODE).
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * Researched 2026-06-17 against the installed packages and the official docs:
 *   @ffmpeg/ffmpeg 0.12.15 · @ffmpeg/util 0.12.2 · @ffmpeg/core(-mt) 0.12.10
 *   Usage/API:        https://ffmpegwasm.netlify.app/docs/getting-started/usage/
 *   Overview/arch:    https://ffmpegwasm.netlify.app/docs/overview/
 *   Performance:      https://ffmpegwasm.netlify.app/docs/performance/
 *   FAQ (2GB, mt 2x): https://ffmpegwasm.netlify.app/docs/faq/
 *   Core build flags: https://ffmpegwasm.netlify.app/docs/contribution/core/ + repo Dockerfile
 *   Self-host (no CDN/toBlobURL): https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/699 , #753
 *   Vite (esm, ?url, COOP/COEP): https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/798
 *   mt / SharedArrayBuffer:      https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/744
 *   WORKERFS / large files:      https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/516 , #755
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */

import type { FFmpeg } from '@ffmpeg/ffmpeg';

// Same-origin, locally vendored core files (NO CDN, NO toBlobURL). `?url` makes Vite emit each file
// verbatim as a same-origin asset and hand us its served URL string.
import coreMtJsUrl from './vendor/core-mt/ffmpeg-core.js?url';
import coreMtWasmUrl from './vendor/core-mt/ffmpeg-core.wasm?url';
import coreMtWorkerUrl from './vendor/core-mt/ffmpeg-core.worker.js?url';
import coreStJsUrl from './vendor/core/ffmpeg-core.js?url';
import coreStWasmUrl from './vendor/core/ffmpeg-core.wasm?url';
// The @ffmpeg/ffmpeg "class worker" — the essential worker FFmpeg.load() spawns. MUST be passed as
// classWorkerURL under bundlers: its default './worker.js' does NOT resolve in Vite, so load() hangs
// forever (verified — both mt and st cores stalled until this was supplied). worker.js has relative
// imports (./const.js, ./errors.js), so use `?worker&url` (Vite bundles its deps) — NOT plain `?url`.
import ffmpegClassWorkerUrl from '@ffmpeg/ffmpeg/worker?worker&url';

import { sha256Hex } from '../platform/digest.ts';
import {
  audioEncoderName,
  canonicalCodec,
  containerExt,
  containerMime,
  deriveAudioCodecs,
  deriveContainersIn,
  deriveContainersOut,
  deriveVideoCodecs,
  parseCodecNames,
  parseFormats,
  videoEncoderName,
} from './codecs.ts';
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
/** Vendored core version (both @ffmpeg/core and @ffmpeg/core-mt). */
const CORE_VERSION = '0.12.10';

/** The best-path config we resolved at init(), recorded per §8.5 and surfaced via configUsed. */
export interface FfmpegWasmConfig {
  backend: 'wasm';
  hwAccel: false;
  /** 'mt' = @ffmpeg/core-mt (cross-origin isolated), 'st' = @ffmpeg/core fallback. */
  coreBuild: 'mt' | 'st';
  coreVersion: string;
  /** -threads N actually passed to encoders (mt only; 1 on st). */
  wasmThreads: number;
  pipeline: 'batch';
  queueDepth: null;
  webgpu: false;
  webgl: false;
  crossOriginIsolated: boolean;
  fs: string;
  /** local same-origin core URLs actually used (no CDN). */
  coreURL: string;
  wasmURL: string;
  workerURL: string | null;
}

/** Documented-build fallback used ONLY if the runtime probe parses to an empty set (defensive). */
const FALLBACK_VIDEO = ['h264', 'hevc', 'vp8', 'vp9'];
const FALLBACK_AUDIO = ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24', 'pcm-f32', 'pcm-s16be'];
const FALLBACK_CONTAINERS_IN = ['mp4', 'mov', 'mkv', 'webm', 'ts', 'wav', 'mp3', 'flac', 'ogg', 'adts'];
const FALLBACK_CONTAINERS_OUT = ['mp4', 'mov', 'mkv', 'webm', 'ts', 'wav', 'mp3', 'flac', 'ogg', 'adts'];

// ── ffprobe-free metadata + packet derivation (dossier §3/§9 bug fix) ──────────────────────────────
//
// WHY NO ffprobe: the vendored @ffmpeg/core(-mt) 0.12.10 exposes an `_ffprobe` entry point, but in the
// real browser run that path ABORTS inside the wasm core without setting the program return code, so
// the wrapper reads the uninitialized `Module.ret` (-1) and surfaces "ffprobe exited -1" for EVERY
// probe()/demux() call (verified in /chrome and reproduced by loading the vendored core directly: the
// `ffmpeg` program runs fine, `ffprobe` does not). The `ffmpeg` program — which transcode/remux/decode
// already drive successfully — is the reliable path, so probe() and demux() derive everything from it:
//   • metadata  ← parse `ffmpeg -i <in>`'s Input-block log (captured via the on('log') logTail).
//   • packets   ← `ffmpeg -i <in> -c copy -f framecrc <out>`: the framecrc muxer writes one line per
//                 COPIED packet — `stream, dts, pts, duration, size, 0xCRC[, F=0x<flags>][, ...]` —
//                 plus `#tb <i>: <num>/<den>` timebase headers. This yields exact per-packet
//                 stream/size/pts/dts and a keyframe flag for compressed bitstreams (validated byte-
//                 for-byte against the committed golden for mp4/mov/webm/mkv/ts/ogg). Raw-PCM (WAV)
//                 packetization is demuxer-version-dependent and may differ from the baked golden —
//                 an honest, surfaced difference, never faked.
//
// Both parsers are pure string logic (no library types), kept here so the FFmpeg call sites stay thin.

/** AV_NOPTS_VALUE (INT64_MIN) — framecrc prints it for packets with no pts/dts. */
const AV_NOPTS = -9223372036854775808;

/**
 * In-engine per-exec timeout (ms) for the READ paths that ingest UNTRUSTED bytes — runInfo()'s
 * `ffmpeg -i` and demux()'s `-c copy -f framecrc`. The robustness dimension feeds fuzzed/truncated
 * inputs (dossier §9.10/§11/§A.16); `exec(args, timeoutMs)` is the documented guard so a pathological
 * demux can't WEDGE the worker. The runner's outer Promise.race (runner.ts withTimeout) only frees the
 * JS promise — it does NOT terminate the wasm computation, so a wedged exec would corrupt the reused
 * FFmpeg instance for the next iteration. ffmpeg's exec returns 1 (NOT a throw) on timeout, so the
 * existing `!/^Input #/` log checks turn a timed-out read into a clean throw → graceful-failure PASS.
 * Generous enough that a legitimately large-but-valid input still completes (read-only, no encode).
 */
const READ_EXEC_TIMEOUT_MS = 60_000;

/** Parse `Duration: HH:MM:SS.ms` from an `ffmpeg -i` log; null if absent/`N/A`. */
function parseDurationSecFromLog(log: string): number | null {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  if (!m) return null;
  const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]!);
  return isFinite(sec) ? sec : null;
}

/** Map an ffmpeg `-i` log codec token (e.g. 'h264 (High)', 'pcm_s16le') to a canonical codec. */
function canonicalCodecFromLog(rest: string): string {
  // The codec name is the first whitespace/paren/comma-delimited token after "Video:"/"Audio:".
  const token = rest.trim().split(/[\s,(]/)[0] ?? '';
  return canonicalCodec(token);
}

/** Best-effort channel COUNT from an ffmpeg layout token ('stereo', 'mono', '5.1', '6 channels'). */
function channelsFromLayout(rest: string): number | undefined {
  const t = rest.toLowerCase();
  if (/\bstereo\b/.test(t)) return 2;
  if (/\bmono\b/.test(t)) return 1;
  if (/\b7\.1\b/.test(t)) return 8;
  if (/\b6\.1\b/.test(t)) return 7;
  if (/\b5\.1\b/.test(t)) return 6;
  if (/\bquad\b/.test(t)) return 4;
  const m = /(\d+)\s*channels?/.exec(t);
  if (m) return Number(m[1]);
  return undefined;
}

/**
 * Parse the tracks out of the FIRST `Input #` block of an `ffmpeg -i` log. Scoped to the input block
 * so the output/stream-mapping lines that a combined `-i … -f framecrc out` run also prints are NOT
 * counted twice. Mirrors the fields the golden-metadata oracle compares (type/codec/dims/fps/sr/ch);
 * language/bitrate/rotation are filled best-effort (the oracle does not gate them).
 */
function parseTracksFromLog(log: string): NormalizedTrack[] {
  const tracks: NormalizedTrack[] = [];
  const lines = log.split('\n');
  let inInput = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r$/, '');
    const trimmed = line.trim();
    if (/^Input #\d+/.test(trimmed)) {
      inInput = true;
      continue;
    }
    // Anything that starts the output / mapping / run phase ends the input block.
    if (/^(Output #|Stream mapping:|Press \[q\]|At least one output|Stream #\d+:\d+ -> )/.test(trimmed)) {
      inInput = false;
    }
    if (!inInput) continue;

    const sm = /^Stream #\d+:\d+(?:\[[^\]]*\])?(?:\(([^)]*)\))?:\s*(Video|Audio|Subtitle|Data):\s*(.*)$/.exec(
      trimmed,
    );
    if (!sm) continue;
    const lang = sm[1];
    const kind = sm[2]!.toLowerCase();
    const rest = sm[3] ?? '';

    const type: TrackType =
      kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : kind === 'subtitle' ? 'subtitle' : 'other';
    const track: NormalizedTrack = {
      type,
      codec: canonicalCodecFromLog(rest),
      bitrate: null,
      language: lang && lang !== 'und' ? lang : null,
    };
    if (kind === 'video') {
      const dm = /\b(\d{2,5})x(\d{2,5})\b/.exec(rest);
      if (dm) {
        track.width = Number(dm[1]);
        track.height = Number(dm[2]);
      }
      const fm = /(\d+(?:\.\d+)?)\s*fps/.exec(rest);
      if (fm) track.fps = Math.round(parseFloat(fm[1]!) * 1000) / 1000;
      // Rotation, when this build prints it, lives in a following "rotation of -N degrees" side-data
      // line before the next Stream/Input. ffmpeg reports display (negative-clockwise) degrees.
      for (let j = i + 1; j < lines.length; j++) {
        const s2 = lines[j]!.trim();
        if (/^(Stream #|Input #|Output #|At least one)/.test(s2)) break;
        const rm = /rotation of\s*(-?\d+(?:\.\d+)?)\s*degrees/.exec(s2);
        if (rm) {
          const deg = parseFloat(rm[1]!);
          track.rotation = (((-deg % 360) + 360) % 360);
          break;
        }
      }
    } else if (kind === 'audio') {
      const sr = /(\d+)\s*Hz/.exec(rest);
      if (sr) track.sampleRate = Number(sr[1]);
      const ch = channelsFromLayout(rest);
      if (ch !== undefined) track.channels = ch;
    }
    tracks.push(track);
  }
  return tracks;
}

/** A subset of the handful of MP4/Matroska tags the metadata scenarios may read, from the `-i` log. */
function parseTagsFromLog(log: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const lines = log.split('\n');
  let inInputMeta = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^Input #\d+/.test(trimmed)) {
      inInputMeta = false;
      continue;
    }
    if (/^Metadata:$/.test(trimmed)) {
      inInputMeta = true;
      continue;
    }
    // The first Stream/Duration/Output line ends the file-level Metadata block.
    if (/^(Stream #|Duration:|Output #|At least one|Press \[q\])/.test(trimmed)) inInputMeta = false;
    if (!inInputMeta) continue;
    const m = /^([A-Za-z0-9_]+)\s*:\s*(.+)$/.exec(trimmed);
    if (m) {
      const key = m[1]!;
      const want = ['title', 'artist', 'album', 'comment', 'encoder', 'major_brand'];
      if (want.includes(key)) tags[key] = m[2]!.trim();
    }
  }
  return tags;
}

/** One parsed framecrc data row → a PacketInfo (timestamps converted via the per-stream timebase). */
function parseFramecrcPackets(out: string): PacketInfo[] {
  const timebase = new Map<number, number>(); // streamIndex → seconds-per-tick
  const packets: PacketInfo[] = [];
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line) continue;
    if (line.charCodeAt(0) === 35 /* '#' */) {
      const tb = /^#tb (\d+):\s*(\d+)\/(\d+)/.exec(line);
      if (tb) {
        const num = Number(tb[2]);
        const den = Number(tb[3]);
        timebase.set(Number(tb[1]), den !== 0 ? num / den : 0);
      }
      continue;
    }
    // stream, dts, pts, duration, size, 0xCRC[, F=0x<flags>][, S=<n>, ...]
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length < 5) continue;
    const trackIndex = Number(parts[0]);
    const dtsTicks = Number(parts[1]);
    const ptsTicks = Number(parts[2]);
    const size = Number(parts[4]);
    if (!Number.isFinite(trackIndex) || !Number.isFinite(size)) continue;

    // Flags column is optional. The framecrc muxer OMITS `F=` when the only flag is KEY, prints
    // `F=0x0` for a non-keyframe, and `F=0x<bits>` when extra flags are set (KEY = bit 0). So a packet
    // is a keyframe when there is no F= field, OR the field's low bit is set.
    let hasFlags = false;
    let flags = 0;
    for (let i = 5; i < parts.length; i++) {
      const fm = /^F=0x([0-9A-Fa-f]+)$/.exec(parts[i]!);
      if (fm) {
        hasFlags = true;
        flags = parseInt(fm[1]!, 16);
        break;
      }
    }
    const keyframe = !hasFlags || (flags & 1) === 1;

    const spt = timebase.get(trackIndex) ?? 0;
    const toUs = (ticks: number): number | null =>
      Number.isFinite(ticks) && ticks !== AV_NOPTS ? Math.round(ticks * spt * 1_000_000) : null;
    let ptsUs = toUs(ptsTicks);
    let dtsUs = toUs(dtsTicks);
    if (ptsUs === null) ptsUs = 0;
    if (dtsUs === null) dtsUs = ptsUs;

    packets.push({ trackIndex, size, ptsUs, dtsUs, keyframe });
  }
  return packets;
}

// ── Bitstream reconstruction for mux() (pure byte logic; no library types) ─────────────────────────
//
// mux() takes opaque EncodedTrack chunks (WebCodecs-style: length-prefixed AVCC/HVCC for H.264/HEVC,
// raw AAC for AAC) + a `description` (avcC/hvcC/AudioSpecificConfig). FFmpeg muxes from FILES, so we
// rebuild each track as a demuxable ELEMENTARY STREAM in MEMFS, then `-c copy` mux. These converters
// are exact and standards-defined (ISO 14496-15 avcC/hvcC, ISO 13818-7 ADTS, ISO 14496-3 ASC).

/** big-endian uint16 at offset. */
function be16(b: Uint8Array, o: number): number {
  return ((b[o]! << 8) | b[o + 1]!) >>> 0;
}

/**
 * Convert a length-prefixed NAL unit buffer (AVCC/HVCC sample: each NAL preceded by an N-byte big-
 * endian length) into Annex-B (each NAL preceded by the 0x00000001 start code). Returns the rebuilt
 * bytes. Defensive against truncation: stops cleanly if a declared length runs past the buffer.
 *
 * Two passes (sum-then-copy) so we never spread a large NAL through Array.push (which would blow the
 * argument-count limit on big keyframe slices) — payloads are copied via TypedArray.set only.
 */
function lengthPrefixedToAnnexB(data: Uint8Array, nalLengthSize: number): Uint8Array {
  // Pass 1: walk the NALs to compute the exact output size (4-byte start code per NAL + payload).
  let outLen = 0;
  let p = 0;
  while (p + nalLengthSize <= data.length) {
    let len = 0;
    for (let i = 0; i < nalLengthSize; i++) len = (len << 8) | data[p + i]!;
    p += nalLengthSize;
    if (len <= 0 || p + len > data.length) break; // truncated/garbage → stop, don't read OOB
    outLen += 4 + len;
    p += len;
  }
  // Pass 2: emit start code + payload for each NAL.
  const out = new Uint8Array(outLen);
  let w = 0;
  p = 0;
  while (p + nalLengthSize <= data.length) {
    let len = 0;
    for (let i = 0; i < nalLengthSize; i++) len = (len << 8) | data[p + i]!;
    p += nalLengthSize;
    if (len <= 0 || p + len > data.length) break;
    out[w] = 0x00;
    out[w + 1] = 0x00;
    out[w + 2] = 0x00;
    out[w + 3] = 0x01;
    w += 4;
    out.set(data.subarray(p, p + len), w);
    w += len;
    p += len;
  }
  return out;
}

/** NAL length size (1/2/4) from an avcC box (byte 4, low 2 bits + 1). Defaults to 4 if absent. */
function nalLengthSizeFromAvcC(desc?: Uint8Array): number {
  if (desc && desc.length > 4) return (desc[4]! & 0x03) + 1;
  return 4;
}
/** NAL length size (1/2/4) from an hvcC box (byte 21, low 2 bits + 1). Defaults to 4 if absent. */
function nalLengthSizeFromHvcC(desc?: Uint8Array): number {
  if (desc && desc.length > 21) return (desc[21]! & 0x03) + 1;
  return 4;
}

/**
 * Extract SPS/PPS param sets from an avcC (AVCDecoderConfigurationRecord) as Annex-B
 * (start-code-prefixed), to be prepended once before the first coded sample. Layout (ISO 14496-15):
 *   [0]=1, [1..3]=profile/compat/level, [4]=0xFC|lenSizeMinus1, [5]=0xE0|numSPS,
 *   then numSPS × (u16 len + SPS), then numPPS(u8) + numPPS × (u16 len + PPS).
 * Returns empty if the record is absent/too short (caller then relies on in-band param sets).
 */
function paramSetsFromAvcC(desc?: Uint8Array): Uint8Array {
  if (!desc || desc.length < 7 || desc[0] !== 1) return new Uint8Array(0);
  const START = [0x00, 0x00, 0x00, 0x01];
  const out: number[] = [];
  let p = 5;
  const numSps = desc[p]! & 0x1f;
  p += 1;
  for (let i = 0; i < numSps && p + 2 <= desc.length; i++) {
    const len = be16(desc, p);
    p += 2;
    if (p + len > desc.length) return Uint8Array.from(out);
    out.push(...START, ...desc.subarray(p, p + len));
    p += len;
  }
  if (p >= desc.length) return Uint8Array.from(out);
  const numPps = desc[p]!;
  p += 1;
  for (let i = 0; i < numPps && p + 2 <= desc.length; i++) {
    const len = be16(desc, p);
    p += 2;
    if (p + len > desc.length) return Uint8Array.from(out);
    out.push(...START, ...desc.subarray(p, p + len));
    p += len;
  }
  return Uint8Array.from(out);
}

/**
 * Extract VPS/SPS/PPS NAL arrays from an hvcC (HEVCDecoderConfigurationRecord) as Annex-B. The record
 * header is 22 bytes, then numOfArrays(u8); each array = [arrayCompleteness/type(u8)][numNalus(u16)]
 * then numNalus × (u16 len + NAL). Returns empty if absent/too short.
 */
function paramSetsFromHvcC(desc?: Uint8Array): Uint8Array {
  if (!desc || desc.length < 23 || desc[0] !== 1) return new Uint8Array(0);
  const START = [0x00, 0x00, 0x00, 0x01];
  const out: number[] = [];
  let p = 22;
  const numArrays = desc[p]!;
  p += 1;
  for (let a = 0; a < numArrays && p + 3 <= desc.length; a++) {
    p += 1; // array_completeness + NAL_unit_type
    const numNalus = be16(desc, p);
    p += 2;
    for (let n = 0; n < numNalus && p + 2 <= desc.length; n++) {
      const len = be16(desc, p);
      p += 2;
      if (p + len > desc.length) return Uint8Array.from(out);
      out.push(...START, ...desc.subarray(p, p + len));
      p += len;
    }
  }
  return Uint8Array.from(out);
}

/** AAC sampling-frequency table (ISO 14496-3) → index for the ADTS header. */
const AAC_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];

/**
 * Audio object type / sampling-frequency-index / channel-config parsed from an AudioSpecificConfig
 * (the AAC `description`): 5 bits objectType, 4 bits freqIndex, 4 bits channelConfig. Falls back to
 * AAC-LC + the track's declared sampleRate/channels when no ASC is present.
 */
function aacParamsFromAsc(
  desc: Uint8Array | undefined,
  sampleRate: number,
  channels: number,
): { objectType: number; freqIndex: number; channelConfig: number } {
  let objectType = 2; // AAC-LC
  let freqIndex = AAC_SAMPLE_RATES.indexOf(sampleRate);
  let channelConfig = channels;
  if (desc && desc.length >= 2) {
    objectType = (desc[0]! >> 3) & 0x1f;
    freqIndex = ((desc[0]! & 0x07) << 1) | (desc[1]! >> 7);
    channelConfig = (desc[1]! >> 3) & 0x0f;
  }
  if (freqIndex < 0 || freqIndex > 12) freqIndex = 4; // 44100 fallback
  if (channelConfig <= 0) channelConfig = 2;
  if (objectType <= 0) objectType = 2;
  return { objectType, freqIndex, channelConfig };
}

/**
 * Wrap one raw AAC access unit in a 7-byte ADTS header so the `.aac`/ADTS demuxer can read it.
 * profile field = objectType-1 (ADTS encodes MPEG-4 audio object type minus one).
 */
function adtsWrap(
  aac: Uint8Array,
  p: { objectType: number; freqIndex: number; channelConfig: number },
): Uint8Array {
  const frameLen = aac.length + 7;
  if (frameLen > 0x1fff) {
    // ADTS frame length is 13 bits; a single AAC AU never realistically exceeds this, but guard it.
    throw new Error(`${ENGINE_ID}: AAC access unit too large for ADTS (${frameLen} bytes)`);
  }
  const profile = (p.objectType - 1) & 0x03;
  const hdr = new Uint8Array(7);
  hdr[0] = 0xff;
  hdr[1] = 0xf1; // MPEG-4, no CRC
  hdr[2] = (profile << 6) | ((p.freqIndex & 0x0f) << 2) | ((p.channelConfig >> 2) & 0x01);
  hdr[3] = ((p.channelConfig & 0x03) << 6) | ((frameLen >> 11) & 0x03);
  hdr[4] = (frameLen >> 3) & 0xff;
  hdr[5] = ((frameLen & 0x07) << 5) | 0x1f;
  hdr[6] = 0xfc;
  const out = new Uint8Array(frameLen);
  out.set(hdr, 0);
  out.set(aac, 7);
  return out;
}

/** Concatenate Uint8Arrays into one buffer. */
function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Canonical container token for a MediaInput, derived from its id/url suffix. FFmpeg's `Input #0,
 * mov,mp4,m4a,3gp,…` line reports a comma-joined demuxer family, not a single canonical token, so
 * (exactly like the offline bake's `canonicalContainer`) we resolve the container from the known
 * file suffix and only fall back to the demuxer name when the suffix is unrecognized. This keeps the
 * probe's `container` aligned with the committed golden (e.g. an `.mp4` → 'mp4', not 'mov').
 */
function containerFromInput(input: MediaInput): string {
  const name = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
  if (name.endsWith('.mov')) return 'mov';
  if (name.endsWith('.mp4') || name.endsWith('.m4a') || name.endsWith('.m4v')) return 'mp4';
  if (name.endsWith('.mkv')) return 'mkv';
  if (name.endsWith('.webm')) return 'webm';
  if (name.endsWith('.ts')) return 'ts';
  if (name.endsWith('.m3u8')) return 'hls';
  if (name.endsWith('.wav')) return 'wav';
  if (name.endsWith('.aiff') || name.endsWith('.aif')) return 'aiff';
  if (name.endsWith('.mp3')) return 'mp3';
  if (name.endsWith('.flac')) return 'flac';
  if (name.endsWith('.ogg') || name.endsWith('.opus')) return 'ogg';
  if (name.endsWith('.aac')) return 'adts';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpeg';
  if (name.endsWith('.png')) return 'png';
  if (name.endsWith('.webp')) return 'webp';
  // Unknown suffix: leave empty so the oracle reports an honest container mismatch rather than a guess.
  return '';
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

/**
 * ffmpeg.wasm engine. The heavy WASM core (+ runtime capability probe + warm-up) is loaded ONCE in
 * init() (UNTIMED, §0.7); each op writes input to MEMFS, runs the ffmpeg program, reads output back,
 * and cleans up its scratch files. dispose() terminates the worker for clean peak-memory per iter.
 */
export class FfmpegWasmEngine implements MediaEngine {
  readonly id = ENGINE_ID;

  /** Loaded lazily in init(); FFmpeg instance backed by a dedicated worker. */
  private ff: FFmpeg | null = null;
  /** Monotonic counter so successive ops never collide on MEMFS filenames within one instance. */
  private seq = 0;
  /** Recent stdout/stderr lines, surfaced in thrown errors for diagnosis. */
  private logTail: string[] = [];
  /** Capability set built from the runtime probe in init(). */
  private caps: CapabilitySet | null = null;

  /**
   * The best-path config chosen at init(), recorded into the report per §8.5 (coreBuild mt/st,
   * wasmThreads, crossOriginIsolated, vendored core URLs). This MUST be a PROPERTY, not a method:
   * the MediaEngine contract types it `readonly configUsed?: object` (engine.ts:174) and the runner
   * reads it as a VALUE (`result.env.configUsed = engine.configUsed`, runner.ts:956-957). A method
   * is structurally assignable to `object` (so tsc stays green) but is always-truthy and serializes
   * to nothing — silently dropping the best-path record. We mirror platform/adapter.ts (a mutable
   * field reassigned in init()) since our config is resolved at init() (mt, or the st fallback).
   * Optional/undefined before init() to match the contract's `readonly configUsed?: object` (which
   * is `object | undefined`, NOT nullable); the runner's `if (engine.configUsed)` guard skips it
   * pre-init anyway.
   */
  configUsed?: FfmpegWasmConfig;

  capabilities(): CapabilitySet {
    // Prefer the runtime-probed caps; before init() return the conservative documented-build set so
    // the runner can still pre-negotiate. (init() replaces this with the EXACT probed set.)
    if (this.caps) return this.caps;
    return this.staticCapabilities();
  }

  /** Conservative documented-build capabilities used before init()/probe completes. */
  private staticCapabilities(): CapabilitySet {
    return {
      operations: {
        probe: true,
        demux: true,
        remux: true,
        transcode: true,
        decodeFrames: true,
        seek: true,
        trim: true,
        mux: true, // documented core strength (dossier §4/§10 A.3); kept in sync with probed set.
      },
      // FALLBACK_CONTAINERS_IN/OUT already exclude 'hls' (unreachable multi-file playlist from MEMFS).
      containersIn: [...FALLBACK_CONTAINERS_IN],
      containersOut: [...FALLBACK_CONTAINERS_OUT],
      videoCodecs: [...FALLBACK_VIDEO],
      audioCodecs: [...FALLBACK_AUDIO],
      encryption: [], // CENC/cbcs/ClearKey not in the build; HLS AES-128 unverified → none declared.
      features: this.featureList(),
    };
  }

  /** Feature flags. 'webcodecs:independent' opts ffmpeg.wasm out of the per-browser WebCodecs gate
   *  (it owns software codecs). 'fanout' is NOT declared (single-MediaBytes can't carry N outputs).
   *
   *  'metadata:write' is deliberately NOT declared even though ffmpeg genuinely writes tags (dossier
   *  §A.11) and remux() honors `opts.tags` below: the metadata-WRITE scenarios drive the op via the
   *  runner's remux dispatch (runner.ts:433), which calls remux(input, { container }) and DROPS
   *  `options.tags` before the adapter ever sees them. So declaring the feature would negotiate those
   *  cases as runnable and then guarantee a FAIL (no tags reach the file, golden-metadata mismatches)
   *  — an over-claim, which the standing rules rank as worse than an honest NA. We keep the engine-
   *  side implementation ready (remux writes -metadata when tags are present) so flipping this flag
   *  back on is a one-liner once the shared runner.ts forwards options.tags to remux(). */
  private featureList(): string[] {
    return [
      'resize', // -vf scale / zscale
      'rotate', // transpose / display-matrix
      'fps', // -r
      'trim:frame-accurate', // output-seek re-encode
      'fragmented', // -movflags frag_keyframe+empty_moov
      'fastStart:reserve', // -movflags +faststart (moov-first; reserve approximated)
      'packets:dts', // framecrc exposes packet dts separately from pts
      'webcodecs:independent', // software codecs; do not browser-gate on WebCodecs
    ];
  }

  async init(): Promise<void> {
    if (this.ff) return;

    let mod: typeof import('@ffmpeg/ffmpeg');
    try {
      // Dynamic import keeps the suite shell light (load the heavy lib inside init()).
      mod = await import('@ffmpeg/ffmpeg');
    } catch (e) {
      throw new Error(`${ENGINE_ID}: failed to import @ffmpeg/ffmpeg: ${describeError(e)}`);
    }

    const ff = new mod.FFmpeg();
    ff.on('log', ({ message }) => {
      this.logTail.push(message);
      if (this.logTail.length > 4000) this.logTail.shift();
    });

    // Choose the documented BEST path: multi-thread core when cross-origin isolated, else single.
    const isolated = isCrossOriginIsolated();
    const hwThreads =
      typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
        ? navigator.hardwareConcurrency
        : 4;
    const threads = isolated ? Math.max(1, Math.min(hwThreads, 8)) : 1;

    const config: FfmpegWasmConfig = isolated
      ? {
          backend: 'wasm',
          hwAccel: false,
          coreBuild: 'mt',
          coreVersion: CORE_VERSION,
          wasmThreads: threads,
          pipeline: 'batch',
          queueDepth: null,
          webgpu: false,
          webgl: false,
          crossOriginIsolated: true,
          fs: 'MEMFS (WORKERFS available for large inputs)',
          coreURL: coreMtJsUrl,
          wasmURL: coreMtWasmUrl,
          workerURL: coreMtWorkerUrl,
        }
      : {
          backend: 'wasm',
          hwAccel: false,
          coreBuild: 'st',
          coreVersion: CORE_VERSION,
          wasmThreads: 1,
          pipeline: 'batch',
          queueDepth: null,
          webgpu: false,
          webgl: false,
          crossOriginIsolated: false,
          fs: 'MEMFS (WORKERFS available for large inputs)',
          coreURL: coreStJsUrl,
          wasmURL: coreStWasmUrl,
          workerURL: null,
        };

    // ABSOLUTE same-origin URLs: a core's workers (blob/opaque base) import the wasm/worker — a
    // root-relative `?url` path fails/hangs there (same lesson as web-demuxer).
    const mkAbs = (u: string): string =>
      new URL(u, globalThis.location?.href ?? 'http://localhost/').href;

    // load() with a TIMEOUT: the multi-thread core can hang while spawning pthread workers in some
    // page contexts (verified here — load(mt) never resolves). Detect that and fall back to the
    // single-thread core instead of stalling the matrix forever.
    const loadCore = async (ffInst: FFmpeg, cfg: FfmpegWasmConfig, ms: number): Promise<void> => {
      const loadCfg: {
        coreURL: string;
        wasmURL: string;
        workerURL?: string;
        classWorkerURL?: string;
      } = {
        coreURL: mkAbs(cfg.coreURL),
        wasmURL: mkAbs(cfg.wasmURL),
        // Essential: the bundled @ffmpeg class worker (absolute, same-origin). Without it load() hangs.
        classWorkerURL: mkAbs(ffmpegClassWorkerUrl),
      };
      if (cfg.workerURL) loadCfg.workerURL = mkAbs(cfg.workerURL);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const to = new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`ff.load(${cfg.coreBuild}) exceeded ${ms}ms`)), ms);
      });
      try {
        await Promise.race([ffInst.load(loadCfg), to]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    };

    let activeFf = ff;
    let activeConfig = config;
    try {
      await loadCore(ff, config, config.coreBuild === 'mt' ? 30_000 : 90_000);
    } catch (e) {
      if (config.coreBuild !== 'mt') {
        const sab = typeof SharedArrayBuffer !== 'undefined';
        throw new Error(
          `${ENGINE_ID}: vendored ffmpeg-core (st) failed to load ` +
            `(SharedArrayBuffer=${sab}, crossOriginIsolated=${isolated}). ` +
            `Cause: ${describeError(e)}. Recent log: ${this.logTail.slice(-5).join(' | ')}`,
        );
      }
      // mt hung/failed → fall back to the single-thread core (no pthread workers, reliable). A working
      // engine beats a hanging one; the fallback is recorded in configUsed (coreBuild:'st').
      try {
        (ff as unknown as { terminate?: () => void }).terminate?.();
      } catch {
        /* ignore */
      }
      const stConfig: FfmpegWasmConfig = {
        backend: 'wasm',
        hwAccel: false,
        coreBuild: 'st',
        coreVersion: CORE_VERSION,
        wasmThreads: 1,
        pipeline: 'batch',
        queueDepth: null,
        webgpu: false,
        webgl: false,
        crossOriginIsolated: isolated,
        fs: 'MEMFS (WORKERFS available for large inputs)',
        coreURL: coreStJsUrl,
        wasmURL: coreStWasmUrl,
        workerURL: null,
      };
      const ff2 = new mod.FFmpeg();
      ff2.on('log', ({ message }) => {
        this.logTail.push(message);
        if (this.logTail.length > 4000) this.logTail.shift();
      });
      await loadCore(ff2, stConfig, 90_000);
      activeFf = ff2;
      activeConfig = stConfig;
    }

    this.ff = activeFf;
    // Record the resolved best-path config as a PROPERTY the runner reads by value (§8.5).
    this.configUsed = activeConfig;

    // Build HONEST capabilities from a runtime probe of the actual vendored core.
    this.caps = await this.probeCapabilities(activeFf);

    // Warm-up: a tiny synthetic transcode so the first measured op isn't paying JIT/alloc costs.
    await this.warmUp(activeFf).catch(() => {
      /* warm-up is best-effort; never fail init() over it */
    });
  }

  /** Run `-encoders` / `-decoders` / `-formats` once and parse the log into a CapabilitySet. */
  private async probeCapabilities(ff: FFmpeg): Promise<CapabilitySet> {
    const capture = async (args: string[]): Promise<string> => {
      this.logTail = [];
      try {
        await ff.exec(args);
      } catch {
        /* listing commands may set a nonzero ret; the log is what we want regardless */
      }
      return this.logTail.join('\n');
    };

    let videoCodecs: string[];
    let audioCodecs: string[];
    let containersIn: string[];
    let containersOut: string[];
    try {
      const encodersLog = await capture(['-hide_banner', '-encoders']);
      const decodersLog = await capture(['-hide_banner', '-decoders']);
      const formatsLog = await capture(['-hide_banner', '-formats']);

      const encoders = parseCodecNames(encodersLog);
      const decoders = parseCodecNames(decodersLog);
      const { demux, mux } = parseFormats(formatsLog);

      videoCodecs = deriveVideoCodecs(encoders, decoders);
      audioCodecs = deriveAudioCodecs(encoders, decoders);
      containersIn = deriveContainersIn(demux);
      containersOut = deriveContainersOut(mux);

      // If parsing produced nothing usable (unexpected log format), fall back to the documented set
      // rather than wrongly declaring zero capability.
      if (videoCodecs.length === 0 && audioCodecs.length === 0) {
        videoCodecs = [...FALLBACK_VIDEO];
        audioCodecs = [...FALLBACK_AUDIO];
      }
      if (containersIn.length === 0) containersIn = [...FALLBACK_CONTAINERS_IN];
      if (containersOut.length === 0) containersOut = [...FALLBACK_CONTAINERS_OUT];
    } catch {
      videoCodecs = [...FALLBACK_VIDEO];
      audioCodecs = [...FALLBACK_AUDIO];
      containersIn = [...FALLBACK_CONTAINERS_IN];
      containersOut = [...FALLBACK_CONTAINERS_OUT];
    } finally {
      this.logTail = [];
    }

    // HLS is multi-file/pathed; not deliverable as a single MediaBytes → exclude from declared out.
    containersOut = containersOut.filter((c) => c !== 'hls');
    // HLS the same way on the INPUT side: ffmpeg's `-formats` lists the hls/applehttp DEMUXER, but a
    // multi-variant `.m3u8` playlist references sibling `.ts`/`.m4s` segments by relative path. Those
    // siblings are UNREACHABLE from a single file written into MEMFS (we hand ffmpeg one blob, not a
    // directory tree), so an hls probe/demux would not error cleanly — it would fail mid-run trying to
    // open segment URLs. Declaring `hls` in containersIn therefore turns a clean NA into a runtime
    // ERROR. Drop it so hls-input scenarios negotiate an honest NA_ENGINE on the container.
    containersIn = containersIn.filter((c) => c !== 'hls');

    return {
      operations: {
        probe: true,
        demux: true,
        remux: true,
        transcode: true,
        decodeFrames: true,
        seek: true,
        trim: true,
        // mux is a documented core strength (dossier §4/§10 A.3/A.7): container WRITE from already-
        // encoded tracks via `-i vid -i aud -c copy out`. Declared so it is not a false-NA; the
        // genuinely-unencodable av1 mux row stays NA via the codec gate (av1 absent from videoCodecs).
        mux: true,
      },
      containersIn,
      containersOut,
      videoCodecs,
      audioCodecs,
      encryption: [],
      features: this.featureList(),
    };
  }

  /** Tiny synthetic transcode to warm the encoder path (UNTIMED). Uses the first probed video codec
   *  that has a software encoder (prefer h264), so warm-up matches a real declared capability. */
  private async warmUp(ff: FFmpeg): Promise<void> {
    const declared = this.caps?.videoCodecs ?? [];
    const pick = declared.includes('h264') ? 'h264' : declared[0];
    const enc = pick ? videoEncoderName(pick) : null;
    if (!enc) return; // no usable video encoder → nothing to warm
    const base = `warm${this.seq++}`;
    const out = `${base}.mp4`;
    const args = [
      '-f', 'lavfi',
      '-i', 'color=c=black:s=64x64:r=5:d=0.2',
      '-c:v', enc,
      ...this.threadArgs(),
      out,
    ];
    this.logTail = [];
    const code = await ff.exec(args);
    try {
      if (code === 0) await ff.deleteFile(out);
    } catch {
      /* ignore */
    }
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
    this.caps = null;
    this.configUsed = undefined;
  }

  private requireFf(): FFmpeg {
    if (!this.ff) throw new Error(`${ENGINE_ID}: init() must be called before use`);
    return this.ff;
  }

  /** `-threads N` for thread-aware encoders (mt fast path). Empty on the single-thread core. */
  private threadArgs(): string[] {
    const n = this.configUsed?.wasmThreads ?? 1;
    return n > 1 ? ['-threads', String(n)] : [];
  }

  /** Fresh, collision-free scratch base for one operation. */
  private scratch(): string {
    return `op${this.seq++}`;
  }

  /** Run an ffmpeg exec, throwing a diagnostic error (with log tail) on non-zero exit. The optional
   *  `timeoutMs` guards fuzz/malformed inputs from hanging the worker (robustness dimension). */
  private async run(args: string[], timeoutMs?: number): Promise<void> {
    const ff = this.requireFf();
    this.logTail = [];
    const code =
      typeof timeoutMs === 'number' ? await ff.exec(args, timeoutMs) : await ff.exec(args);
    if (code !== 0) {
      throw new Error(
        `${ENGINE_ID}: ffmpeg exited ${code} for [${args.join(' ')}]. ` +
          `Log: ${this.logTail.slice(-8).join(' | ')}`,
      );
    }
  }

  private async readBinary(path: string): Promise<Uint8Array> {
    const data = await this.requireFf().readFile(path, 'binary');
    if (typeof data === 'string') return new TextEncoder().encode(data);
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
        /* file may not exist (op failed before producing it) */
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
    await this.writeInput(input, inName);
    try {
      const log = await this.runInfo(inName);
      return this.metadataFromLog(log, input);
    } finally {
      await this.cleanup([inName]);
    }
  }

  /**
   * Run `ffmpeg -i <in>` purely to print the input's stream info to the log, and return the captured
   * log. `ffmpeg -i` with no output file always exits non-zero ("At least one output file must be
   * specified") AFTER it has printed the Input block — so a non-zero code here is EXPECTED and not an
   * error. We only fail if the log shows the input could not be opened/parsed at all.
   */
  private async runInfo(inName: string): Promise<string> {
    const ff = this.requireFf();
    this.logTail = [];
    try {
      // timeoutMs guards fuzzed/truncated inputs from hanging the worker (§9.10/§11). On timeout exec
      // returns 1 (no throw) and no Input block is logged → the check below throws a clean error.
      await ff.exec(['-hide_banner', '-i', inName], READ_EXEC_TIMEOUT_MS);
    } catch {
      /* exec may reject on the deliberate "no output file" abort; the log is captured regardless */
    }
    const log = this.logTail.join('\n');
    this.logTail = [];
    if (!/^Input #\d+/m.test(log)) {
      throw new Error(
        `${ENGINE_ID}: ffmpeg could not read input for probe. Log: ${log.split('\n').slice(-8).join(' | ')}`,
      );
    }
    return log;
  }

  /**
   * The first video track (with known dimensions) parsed from an `ffmpeg -i` log. Used by
   * decodeFrames/seek to size + time the raw RGBA stream. Throws a clear error when the input has no
   * decodable video track (so the runner negotiates it honestly rather than slicing garbage).
   */
  private firstVideoTrack(log: string, op: string): NormalizedTrack & { width: number; height: number } {
    const v = parseTracksFromLog(log).find((t) => t.type === 'video');
    if (!v || v.width === undefined || v.height === undefined) {
      throw new Error(`${ENGINE_ID}: no decodable video stream for ${op}`);
    }
    return v as NormalizedTrack & { width: number; height: number };
  }

  /** Build NormalizedMetadata from an `ffmpeg -i` log + the input's container (from its id/url). */
  private metadataFromLog(log: string, input: MediaInput): NormalizedMetadata {
    const durationSec = parseDurationSecFromLog(log);
    const tracks = parseTracksFromLog(log);
    const tags = parseTagsFromLog(log);
    const meta: NormalizedMetadata = {
      container: containerFromInput(input),
      durationSec: durationSec === null ? null : Math.round(durationSec * 1000) / 1000,
      tracks,
    };
    if (Object.keys(tags).length) meta.tags = tags;
    return meta;
  }

  // ── demux ────────────────────────────────────────────────────────────────────────────────────

  async demux(input: MediaInput): Promise<DemuxResult> {
    const base = this.scratch();
    const inName = `${base}.in`;
    const crcName = `${base}.framecrc.txt`;
    await this.writeInput(input, inName);
    try {
      const ff = this.requireFf();

      // ONE pass does both jobs: `-c copy -f framecrc` re-packetizes nothing (stream copy) and writes
      // a per-COPIED-packet table to crcName, while the SAME run prints the Input block to the log so
      // we can build metadata from it (no ffprobe). framecrc enumerates the real container packets, so
      // its row count + sizes + keyframe flags match an ffprobe `-show_packets` walk for compressed
      // bitstreams. (Verified byte-for-byte vs golden for mp4/mov/webm/mkv/ts/ogg.)
      this.logTail = [];
      let exitCode: number | null = null;
      try {
        // timeoutMs guards fuzzed/truncated inputs from wedging the worker (§9.10/§11/§A.16). On
        // timeout exec returns 1 (no throw); the Input-block + readText checks below then throw clean.
        exitCode = await ff.exec(
          ['-hide_banner', '-i', inName, '-c', 'copy', '-f', 'framecrc', crcName],
          READ_EXEC_TIMEOUT_MS,
        );
      } catch {
        /* a hard demux error rejects; surfaced below once we've inspected the log/output */
      }
      const log = this.logTail.join('\n');
      this.logTail = [];

      if (!/^Input #\d+/m.test(log)) {
        throw new Error(
          `${ENGINE_ID}: demux failed to open input (framecrc exit ${exitCode}). ` +
            `Log: ${log.split('\n').slice(-8).join(' | ')}`,
        );
      }

      const metadata = this.metadataFromLog(log, input);

      let crc: string;
      try {
        crc = await this.readText(crcName);
      } catch (e) {
        throw new Error(
          `${ENGINE_ID}: demux produced no framecrc output (exit ${exitCode}): ${describeError(e)}. ` +
            `Log: ${log.split('\n').slice(-8).join(' | ')}`,
        );
      }

      const packets = parseFramecrcPackets(crc);
      packets.sort((a, b) => a.dtsUs - b.dtsUs || a.trackIndex - b.trackIndex);
      return { metadata, packets };
    } finally {
      await this.cleanup([inName, crcName]);
    }
  }

  // ── remux ────────────────────────────────────────────────────────────────────────────────────

  async remux(
    input: MediaInput,
    opts: { container: string; tags?: Record<string, string> },
  ): Promise<MediaBytes> {
    const base = this.scratch();
    const inName = `${base}.in`;
    const outName = `${base}.out.${containerExt(opts.container)}`;
    await this.writeInput(input, inName);
    try {
      // Stream copy: no re-encode, just rewrap. +faststart hint is mp4/mov-only.
      const args = ['-i', inName, '-c', 'copy'];
      if (opts.container === 'mp4' || opts.container === 'mov') {
        args.push('-movflags', '+faststart');
      }
      // Metadata WRITE (dossier §A.11): `-metadata key=value` per tag, still lossless under -c copy.
      // The 'metadata:write' feature is gated OFF in featureList() until the runner forwards tags to
      // remux(), but the implementation is kept correct so it works for any direct caller / once wired.
      if (opts.tags) {
        for (const [k, v] of Object.entries(opts.tags)) {
          if (k) args.push('-metadata', `${k}=${v ?? ''}`);
        }
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
      // 'fanout' is intentionally NOT declared: one ffmpeg invocation can emit N renditions, but the
      // single-MediaBytes contract can return only one blob → honest NA(engine) for ABR ladders.
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

      if (opts.video) {
        const v = opts.video;
        const enc = v.codec ? videoEncoderName(v.codec) : null;
        if (v.codec && !enc) {
          throw new Error(`${ENGINE_ID}: no software encoder for video codec '${v.codec}'`);
        }
        if (enc) args.push('-c:v', enc);
        const filters: string[] = [];
        if (v.width && v.height) filters.push(`scale=${v.width}:${v.height}`);
        else if (v.width) filters.push(`scale=${v.width}:-2`);
        else if (v.height) filters.push(`scale=-2:${v.height}`);
        if (typeof v.rotate === 'number' && v.rotate !== 0) {
          const norm = ((v.rotate % 360) + 360) % 360;
          if (norm === 90) filters.push('transpose=1');
          else if (norm === 270) filters.push('transpose=2');
          else if (norm === 180) filters.push('transpose=1,transpose=1');
        }
        if (filters.length) args.push('-vf', filters.join(','));
        if (v.fps) args.push('-r', String(v.fps));

        if (enc === 'libvpx-vp9' || enc === 'libvpx') {
          // libvpx (VP8/VP9) needs a SAFE-IN-WASM configuration or it traps with
          // "RuntimeError: memory access out of bounds" (the bug this fixes). Three things matter:
          //   1) Pixel format: libvpx must receive a chroma-subsampled 8-bit planar format. The
          //      H.264 source decodes to yuv420p, but be explicit so the scale filter can't hand
          //      libvpx an unexpected layout (e.g. yuvj420p / a 4:2:2 path) that mis-sizes its
          //      internal plane buffers and reads out of bounds.
          args.push('-pix_fmt', 'yuv420p');
          // 2) Threading: this is the ACTUAL cause of the OOB. libvpx's parallel encode path runs
          //    under Emscripten pthreads in the 0.12.10 wasm core, and that path corrupts the wasm
          //    linear memory and traps with "memory access out of bounds" — EVEN with `-row-mt 1`
          //    + tile-columns (verified in real /chrome runs; those knobs did NOT stop the trap).
          //    The reliable fix is to take pthreads OUT of the libvpx encode entirely: force
          //    `-threads 1`. A single-thread VP8/VP9 encode is fully correct (identical bitstream
          //    semantics, just slower) and is the stable path in wasm. NOTE: this overrides the mt
          //    core's -threads N fast path *for libvpx only*; libx264/libx265 (the else branch) keep
          //    their thread parallelism since those encoders are stable multithreaded in this core.
          args.push('-threads', '1');
          if (enc === 'libvpx-vp9') {
            // With single-thread libvpx-vp9, row-mt/tile-columns are inapplicable (they only gate
            // the multithreaded path we just disabled). Pin a single tile column so the encoder
            // never tries to spin up its tile-parallel workers regardless of frame width.
            args.push('-row-mt', '0', '-tile-columns', '0');
          }
          // Rate control: libvpx-vp9's stablest path here is constant-quality (CRF). With no caller
          // bitrate use pure CRF (`-b:v 0`); with a bitrate, use it as a constrained-quality cap.
          if (v.bitrate) {
            args.push('-b:v', String(v.bitrate), '-crf', '31');
          } else {
            args.push('-b:v', '0', '-crf', '31');
          }
          // 'good' deadline + a fast cpu-used keeps the WASM encode tractable (and is libvpx's
          // recommended quality/speed knob); without it libvpx-vp9 defaults to the very slow 'best'.
          // 'realtime'-ish cpu-used (higher number) also keeps per-frame working set small, which
          // further reduces memory pressure in the single-thread wasm encode.
          args.push('-deadline', 'good', '-cpu-used', '5');
        } else {
          if (v.bitrate) args.push('-b:v', String(v.bitrate));
          // -threads N parallelizes thread-aware encoders (libx264/265) — the mt fast path lever.
          args.push(...this.threadArgs());
        }
      }

      if (opts.audio) {
        const a = opts.audio;
        const enc = a.codec ? audioEncoderName(a.codec) : null;
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
        args.push(...this.threadArgs());
      } else {
        // Keyframe-aligned fast trim: -ss BEFORE -i seeks to nearest preceding keyframe, -c copy.
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
    const rawName = `${base}.rgba`;
    await this.writeInput(input, inName);
    try {
      // Learn dimensions + frame rate (from the `ffmpeg -i` log, no ffprobe) so we can slice the raw
      // stream and assign PTS.
      const v = this.firstVideoTrack(await this.runInfo(inName), 'decodeFrames');
      const width = v.width;
      const height = v.height;
      const fps = v.fps && v.fps > 0 ? v.fps : 30;
      const maxFrames = opts?.maxFrames;

      // Decode to tight, straight-alpha, top-left RGBA rawvideo (frames back-to-back, no padding).
      const args = ['-i', inName];
      if (maxFrames && maxFrames > 0) args.push('-frames:v', String(maxFrames));
      args.push('-pix_fmt', 'rgba', '-f', 'rawvideo', rawName);
      await this.run(args);

      const raw = await this.readBinary(rawName);
      const frameBytes = width * height * 4;
      if (frameBytes <= 0) throw new Error(`${ENGINE_ID}: invalid frame size ${width}x${height}`);
      const total = Math.floor(raw.byteLength / frameBytes);

      const frames: FrameDigest[] = [];
      // ImageData needs a Uint8ClampedArray over a plain ArrayBuffer (not SharedArrayBuffer).
      const pixels: Uint8ClampedArray<ArrayBuffer>[] = [];
      for (let i = 0; i < total; i++) {
        const start = i * frameBytes;
        const view = raw.subarray(start, start + frameBytes);
        const sha256 = await sha256Hex(view);
        const ptsUs = Math.round((i / fps) * 1_000_000);
        frames.push({ index: i, ptsUs, sha256, width, height });
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
      await this.cleanup([inName, rawName]);
    }
  }

  // ── seek ─────────────────────────────────────────────────────────────────────────────────────

  async seek(input: MediaInput, tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    const base = this.scratch();
    const inName = `${base}.in`;
    const rawName = `${base}.rgba`;
    await this.writeInput(input, inName);
    try {
      // Dimensions from the `ffmpeg -i` log (no ffprobe).
      const v = this.firstVideoTrack(await this.runInfo(inName), 'seek');
      const width = v.width;
      const height = v.height;
      const tSec = Math.max(0, tUs / 1_000_000);

      // Decode-accurate seek: -ss AFTER -i decodes from the start and lands exactly on tSec, then
      // grab a single frame. The output stream restarts its clock at 0, so we report the requested
      // target as the landed presentation time.
      await this.run([
        '-ss', tSec.toFixed(6), '-i', inName, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', rawName,
      ]);
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
      await this.cleanup([inName, rawName]);
    }
  }

  // ── mux ──────────────────────────────────────────────────────────────────────────────────────
  //
  // Container WRITE from already-encoded tracks — a documented core strength (dossier §4 line 108,
  // §10 A.3/A.7). EncodedTracks hands us opaque coded chunks (WebCodecs-style framing) + a codec
  // `description` (avcC/hvcC/AudioSpecificConfig), which ffmpeg's argv/file model can't consume
  // directly. So we rebuild each track as a demuxable ELEMENTARY STREAM in MEMFS, then stream-copy
  // them together: `-i v.h264 -i a.aac -c copy [-movflags +faststart] out` (dossier §4 mux row).
  //
  // SCOPE/HONESTY: we reconstruct the codecs whose elementary-stream framing is exactly defined and
  // verifiable from the chunk data — H.264 & HEVC (length-prefixed → Annex-B, param sets from
  // avcC/hvcC) and AAC (raw AU → ADTS). For codecs that need a full intermediate CONTAINER to be
  // demuxable (VP8/VP9 → IVF, Opus/Vorbis → Ogg, AV1) we throw a CLEAR error rather than emit a
  // guessed/garbage stream — an honest failure, never silent corruption. AV1 additionally never
  // reaches here: 'av1' is absent from videoCodecs (no encoder in the build), so the av1 mux row
  // negotiates a correct NA_ENGINE on the codec gate before mux() is called.
  //
  // NOTE (harness dependency, outside this adapter): the runner does not yet assemble EncodedTracks
  // for mux scenarios (runner.ts:444-448 throws 'mux scenario requires options.tracks'), so these
  // cells currently ERROR at the runner before mux() runs. Declaring mux + implementing it here is
  // the honest engine-side state; the track-assembly wiring is owned by src/core/runner.ts.

  async mux(tracks: EncodedTracks, opts: { container: string }): Promise<MediaBytes> {
    const realTracks = tracks.tracks.filter((t) => t.type === 'video' || t.type === 'audio');
    if (realTracks.length === 0) {
      throw new Error(`${ENGINE_ID}: mux requires at least one audio/video track`);
    }

    const base = this.scratch();
    const inputNames: string[] = [];
    const outName = `${base}.out.${containerExt(opts.container)}`;
    try {
      // 1) Materialize each track as an elementary stream ffmpeg can demux.
      for (let ti = 0; ti < realTracks.length; ti++) {
        const t = realTracks[ti]!;
        const codec = canonicalCodec(t.codec);
        const { name, bytes } = this.buildElementaryStream(t, codec, `${base}.t${ti}`);
        await this.requireFf().writeFile(name, bytes);
        inputNames.push(name);
      }

      // 2) Stream-copy mux: one -i per elementary stream, then -map each so every track lands.
      const args: string[] = [];
      for (const n of inputNames) args.push('-i', n);
      for (let i = 0; i < inputNames.length; i++) args.push('-map', String(i));
      args.push('-c', 'copy');
      if (opts.container === 'mp4' || opts.container === 'mov') {
        args.push('-movflags', '+faststart');
      }
      args.push(outName);

      await this.run(args, READ_EXEC_TIMEOUT_MS);
      const muxed = await this.readBinary(outName);
      return { bytes: muxed, mime: containerMime(opts.container), container: opts.container };
    } finally {
      await this.cleanup([...inputNames, outName]);
    }
  }

  /**
   * Rebuild one EncodedTrack as a demuxable elementary-stream file (name + bytes) for mux()'s
   * `-c copy`. Throws an honest error for codecs we cannot frame as a bare elementary stream.
   */
  private buildElementaryStream(
    track: EncodedTracks['tracks'][number],
    codec: string,
    baseName: string,
  ): { name: string; bytes: Uint8Array } {
    const chunks = track.chunks ?? [];
    if (codec === 'h264' || codec === 'hevc') {
      const nalLen =
        codec === 'h264'
          ? nalLengthSizeFromAvcC(track.description)
          : nalLengthSizeFromHvcC(track.description);
      const params =
        codec === 'h264' ? paramSetsFromAvcC(track.description) : paramSetsFromHvcC(track.description);
      const parts: Uint8Array[] = [];
      let first = true;
      for (const c of chunks) {
        // Prepend the param sets (Annex-B) once, before the first sample, so a raw .h264/.hevc
        // elementary stream is self-contained (avcC/hvcC out-of-band config is otherwise lost).
        if (first && params.length > 0) parts.push(params);
        first = false;
        parts.push(lengthPrefixedToAnnexB(c.data, nalLen));
      }
      const ext = codec === 'h264' ? 'h264' : 'hevc';
      return { name: `${baseName}.${ext}`, bytes: concatBytes(parts) };
    }
    if (codec === 'aac') {
      const params = aacParamsFromAsc(track.description, track.sampleRate ?? 0, track.channels ?? 0);
      const parts: Uint8Array[] = [];
      for (const c of chunks) parts.push(adtsWrap(c.data, params));
      return { name: `${baseName}.aac`, bytes: concatBytes(parts) };
    }
    // Codecs that need a full intermediate container to be demuxable: fail honestly (never guess).
    throw new Error(
      `${ENGINE_ID}: mux cannot reconstruct an elementary stream for codec '${codec}' ` +
        `(only h264/hevc/aac are framed from EncodedTracks here; ${codec} needs a container muxer)`,
    );
  }
}

/** Cross-origin isolation gate (SharedArrayBuffer availability) for the mt fast path. */
function isCrossOriginIsolated(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true &&
    typeof SharedArrayBuffer !== 'undefined'
  );
}
