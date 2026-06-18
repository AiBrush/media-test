/**
 * src/engines/ffmpeg-wasm/codecs.ts — translation between the suite's canonical vocabulary
 * (engine.ts CANONICAL_*) and FFmpeg's own encoder / decoder / muxer names, plus parsers for the
 * runtime `-encoders` / `-decoders` / `-formats` probe that drives honest capabilities().
 *
 * Why a runtime probe (dossier §6): FFmpeg capabilities are 100% compile-time-determined by the
 * core's `./configure` flags. Rather than trust a static table, init() runs `ffmpeg -encoders` /
 * `-decoders` / `-formats` once and parses the log to build the EXACT capability set for the actual
 * vendored 0.12.10 core. The published build enables libx264/libx265/libvpx/libmp3lame/libtheora/
 * libvorbis/libopus and native aac/flac/alac/pcm; it does NOT enable AV1 (no libaom/dav1d) — so AV1
 * must be ABSENT from capabilities() unless the probe proves otherwise.
 *
 * No FFmpeg classes are imported here (the heavy lib is dynamically imported in the adapter); this
 * module is pure string/token logic so it stays cheap to load and easy to test.
 */

import type {
  CanonicalAudioCodec,
  CanonicalContainer,
  CanonicalVideoCodec,
} from '../../core/engine.ts';

// ── Canonical → FFmpeg ENCODER name (software encoders the published build ships) ─────────────────
// Only codecs whose encoder the runtime probe confirms become declared videoCodecs/audioCodecs.

export const VIDEO_ENCODER: Record<string, string> = {
  h264: 'libx264',
  hevc: 'libx265',
  vp8: 'libvpx',
  vp9: 'libvpx-vp9',
  // av1: 'libaom-av1'  — deliberately omitted: not in the published core build (dossier §6).
};

export const AUDIO_ENCODER: Record<string, string> = {
  aac: 'aac', // FFmpeg native AAC (no fdk-aac in the build — see dossier §9 caveat)
  opus: 'libopus',
  mp3: 'libmp3lame',
  flac: 'flac', // native
  vorbis: 'libvorbis',
  'pcm-s16': 'pcm_s16le',
  'pcm-s24': 'pcm_s24le',
  'pcm-f32': 'pcm_f32le',
  'pcm-s16be': 'pcm_s16be',
};

/** Canonical video codec → the FFmpeg *decoder* name(s) we accept as proof the codec decodes. */
const VIDEO_DECODER_ALIASES: Record<CanonicalVideoCodec, string[]> = {
  h264: ['h264'],
  hevc: ['hevc'],
  vp8: ['vp8'],
  vp9: ['vp9'],
  av1: ['av1', 'libdav1d', 'libaom-av1'],
};

/** Canonical audio codec → the FFmpeg *decoder* name(s) we accept as proof the codec decodes. */
const AUDIO_DECODER_ALIASES: Record<CanonicalAudioCodec, string[]> = {
  aac: ['aac', 'aac_fixed'],
  opus: ['opus', 'libopus'],
  mp3: ['mp3', 'mp3float'],
  flac: ['flac'],
  vorbis: ['vorbis', 'libvorbis'],
  'pcm-s16': ['pcm_s16le'],
  'pcm-s24': ['pcm_s24le'],
  'pcm-f32': ['pcm_f32le'],
  'pcm-s16be': ['pcm_s16be'],
};

/** Canonical container → FFmpeg demuxer/muxer name fragments to look for in `-formats`. */
const CONTAINER_DEMUX_NAMES: Record<CanonicalContainer, string[]> = {
  mp4: ['mov,mp4,m4a,3gp,3g2,mj2', 'mp4'],
  mov: ['mov,mp4,m4a,3gp,3g2,mj2', 'mov'],
  mkv: ['matroska,webm', 'matroska'],
  webm: ['matroska,webm', 'webm'],
  ts: ['mpegts'],
  hls: ['hls', 'applehttp'],
  wav: ['wav'],
  mp3: ['mp3'],
  flac: ['flac'],
  ogg: ['ogg'],
  adts: ['aac'],
};

const CONTAINER_MUX_NAMES: Record<CanonicalContainer, string[]> = {
  mp4: ['mp4'],
  mov: ['mov'],
  mkv: ['matroska'],
  webm: ['webm'],
  ts: ['mpegts'],
  hls: ['hls'], // multi-file/pathed; usually present but excluded from declared output (see adapter)
  wav: ['wav'],
  mp3: ['mp3'],
  flac: ['flac'],
  ogg: ['ogg'],
  adts: ['adts'],
};

// ── On-disk filename extension / output MIME per container ─────────────────────────────────────

/** Map a container token to the on-disk filename extension ffmpeg uses to pick the (de)muxer. */
export function containerExt(container: string): string {
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
export function containerMime(container: string): string {
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

/** Map an ffprobe `codec_name` to a canonical token (for NormalizedMetadata.tracks[].codec). */
export function canonicalCodec(name: string): string {
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

// ── Runtime probe parsing ────────────────────────────────────────────────────────────────────

/**
 * The flag column in `ffmpeg -encoders` / `-decoders` is followed by the codec NAME then a
 * description, e.g.:
 *   ` V....D libx264              libx264 H.264 / AVC ...`
 *   ` A....D aac                  AAC (Advanced Audio Coding)`
 * We collect the set of names (2nd column) that appear after the ` ------ ` separator line.
 */
export function parseCodecNames(log: string): Set<string> {
  const names = new Set<string>();
  let started = false;
  for (const rawLine of log.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!started) {
      // The header block ends with a line of dashes (e.g. " ------").
      if (/^\s*-{3,}\s*$/.test(line)) started = true;
      continue;
    }
    // A codec row begins with one leading space, then a 6-char flag field whose first char is the
    // media-type letter (V/A/S/D/T) or a dot, then whitespace, then the codec name.
    const m = /^ [VASDT.][A-Z0-9.]{5} +(\S+)/.exec(line);
    if (m && m[1]) names.add(m[1]);
  }
  return names;
}

/**
 * `ffmpeg -formats` rows look like:
 *   ` DE mp4             MP4 (MPEG-4 Part 14)`
 *   `  E adts            ADTS AAC (Advanced Audio Coding)`
 *   ` D  hls             ...`
 * The 2nd column is a (possibly comma-joined) demuxer/muxer name. Returns demux + mux name sets.
 */
export function parseFormats(log: string): { demux: Set<string>; mux: Set<string> } {
  const demux = new Set<string>();
  const mux = new Set<string>();
  let started = false;
  for (const rawLine of log.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!started) {
      // The `-formats` header separator is just `--` (2 dashes), unlike the codec lists' `------`.
      if (/^\s*-{2,}\s*$/.test(line)) started = true;
      continue;
    }
    // FFmpeg `-formats` uses a FIXED 2-char flag field after exactly one leading space:
    //   ` D  3dostr ...`  `  E adts ...`  ` DE mp4 ...`  (col0 = D|space, col1 = E|space).
    // A plain `\s*` would greedily eat the space-flag columns, so anchor on the single leading
    // space and read the next two characters as the flag field.
    const m = /^ ([D ])([E ]) +(\S+)/.exec(line);
    if (!m) continue;
    const canDemux = m[1] === 'D';
    const canMux = m[2] === 'E';
    const name = m[3];
    if (!name) continue;
    if (canDemux) demux.add(name);
    if (canMux) mux.add(name);
  }
  return { demux, mux };
}

// ── Capability derivation from probe sets ────────────────────────────────────────────────────

/**
 * Video codecs we can both DECODE (decoders set) and ENCODE (encoders set, software encoder name).
 *
 * WHY round-trip-gated (decode ∧ encode), not decode-only — and the AV1 read-side caveat:
 * The suite's `CapabilitySet.videoCodecs` is a SINGLE flat list that the runner uses to negotiate
 * EVERY op. Critically, ffmpeg.wasm declares the `webcodecs:independent` feature, so the runner's
 * negotiate() SHORT-CIRCUITS its Pass-2 (browser/encode) codec gate (runner.ts:148-150) and treats
 * anything in this list as fully round-trippable for encode-producing ops too. So if we added a
 * decode-only codec (e.g. av1, which this build genuinely DEMUXES and could `-c copy`/decode) to this
 * list purely to un-NA the read-side cases (demux/remux-copy), the encode-producing cases that share
 * the token — transcode→av1 (`videoEncoderName('av1')===null`) and any av1 mux — would FALSELY
 * negotiate OK and then THROW at runtime → an ERROR over-claim, which the suite ranks as strictly
 * WORSE than the honest read-side NA it would cure. The read-side vs encode-side distinction simply
 * cannot be expressed through this one flat list while `webcodecs:independent` is declared.
 *
 * Therefore we keep the conservative round-trip gate here (AV1 fails the encode test → absent). The
 * honest cure for the read-side false-NA on av1 (demux/remux of av1-in-webm, which this engine truly
 * performs via stream copy) is OUTSIDE this adapter's scope: either drop the videoCodecs requirement
 * from the read-only scenarios (src/scenarios/{demux,remux}) so they gate on the container alone, or
 * split a decode-only set into core (src/core/engine.ts CapabilitySet + runner.ts negotiate()). The
 * golden-packets / reference-reimport oracles remain the full correctness gate either way.
 */
export function deriveVideoCodecs(
  encoders: Set<string>,
  decoders: Set<string>,
): CanonicalVideoCodec[] {
  const out: CanonicalVideoCodec[] = [];
  for (const canonical of Object.keys(VIDEO_DECODER_ALIASES) as CanonicalVideoCodec[]) {
    const decodes = VIDEO_DECODER_ALIASES[canonical].some((d) => decoders.has(d));
    const enc = VIDEO_ENCODER[canonical];
    const encodes = enc !== undefined && encoders.has(enc);
    // Declare a codec only when BOTH decode and encode are present (the suite treats a videoCodec
    // token as round-trippable; see the round-trip-gate rationale above). AV1 fails encode → absent.
    if (decodes && encodes) out.push(canonical);
  }
  return out;
}

export function deriveAudioCodecs(
  encoders: Set<string>,
  decoders: Set<string>,
): CanonicalAudioCodec[] {
  const out: CanonicalAudioCodec[] = [];
  for (const canonical of Object.keys(AUDIO_DECODER_ALIASES) as CanonicalAudioCodec[]) {
    const decodes = AUDIO_DECODER_ALIASES[canonical].some((d) => decoders.has(d));
    const enc = AUDIO_ENCODER[canonical];
    const encodes = enc !== undefined && encoders.has(enc);
    if (decodes && encodes) out.push(canonical);
  }
  return out;
}

export function deriveContainersIn(demux: Set<string>): CanonicalContainer[] {
  const out: CanonicalContainer[] = [];
  for (const canonical of Object.keys(CONTAINER_DEMUX_NAMES) as CanonicalContainer[]) {
    if (CONTAINER_DEMUX_NAMES[canonical].some((n) => demux.has(n))) out.push(canonical);
  }
  return out;
}

export function deriveContainersOut(mux: Set<string>): CanonicalContainer[] {
  const out: CanonicalContainer[] = [];
  for (const canonical of Object.keys(CONTAINER_MUX_NAMES) as CanonicalContainer[]) {
    if (CONTAINER_MUX_NAMES[canonical].some((n) => mux.has(n))) out.push(canonical);
  }
  return out;
}

/** Resolve a canonical video codec to its software encoder name (null if not encodable here). */
export function videoEncoderName(codec: string): string | null {
  return VIDEO_ENCODER[codec] ?? null;
}

/** Resolve a canonical audio codec to its software encoder name (null if not encodable here). */
export function audioEncoderName(codec: string): string | null {
  return AUDIO_ENCODER[codec] ?? null;
}
