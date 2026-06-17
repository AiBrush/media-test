/**
 * src/engines/mp4box/adapter.ts — MediaEngine adapter for mp4box.js@0.5.4.
 *
 * ROLE: DEMUX / PROBE specialist for the ISO-BMFF family (MP4 / MOV, including fragmented). mp4box.js
 * is a pure-JS box parser + sample-table walker: it reads the `moov` (probe) and walks the sample
 * tables to hand back encoded samples (demux). It does NOT decode, encode, transcode, remux, mux,
 * trim, or decrypt — so `capabilities()` declares ONLY `probe` and `demux`. Everything else is left
 * undeclared, which the runner records as NA(engine) (never a fabricated pass).
 *
 * Lib API used (verified against node_modules/mp4box/dist/mp4box.all.js — there are no shipped
 * typings, so a local ambient module lives in ./mp4box.d.ts):
 *   - MP4Box.createFile() → ISOFile
 *   - isoFile.onReady = (info) => …       // fired once `moov` is parsed; info = getInfo() shape
 *   - isoFile.onError = (msg) => …
 *   - isoFile.appendBuffer(ab)            // ab.fileStart REQUIRED (0 for a whole-file append)
 *   - isoFile.flush()                     // signal end of input
 *   - isoFile.setExtractionOptions(id, user, { nbSamples })  // mark a track for extraction
 *   - isoFile.onSamples = (id, user, samples[]) => …         // demuxed samples (cts/dts/size/is_sync/data)
 *   - isoFile.start() / stop()
 *
 * Timestamps from mp4box are in each track's `timescale` ticks; we convert to microseconds for the
 * normalized PacketInfo/metadata contracts in engine.ts.
 */

import MP4Box from 'mp4box';
import type { ISOFile, MP4ArrayBuffer, MP4Info, MP4Sample, MP4Track } from 'mp4box';

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

const ENGINE_ID = 'mp4box.js@0.5.4';

/** Wrap an ArrayBuffer with the `fileStart` mp4box requires for `appendBuffer`. */
function asMP4ArrayBuffer(buf: ArrayBuffer, fileStart = 0): MP4ArrayBuffer {
  const ab = buf as MP4ArrayBuffer;
  ab.fileStart = fileStart;
  return ab;
}

/** Map mp4box's handler-derived track `type` string to our canonical TrackType. */
function trackType(t: MP4Track): TrackType {
  switch (t.type) {
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'subtitles':
    case 'subtitle':
      return 'subtitle';
    default:
      // Distinguish by which media-header sub-object mp4box populated, as a fallback.
      if (t.video) return 'video';
      if (t.audio) return 'audio';
      return 'other';
  }
}

/**
 * Map an MP4 MIME codecs token (e.g. 'avc1.640028', 'hev1.1.6.L93.B0', 'mp4a.40.2') to our canonical
 * lowercase codec token. Returns the raw token lowercased if unrecognized (honest: we surface what
 * the file declares rather than guessing a canonical id that may be wrong).
 */
function canonicalCodec(codec: string): string {
  const c = codec.toLowerCase();
  // Video
  if (c.startsWith('avc1') || c.startsWith('avc3')) return 'h264';
  if (c.startsWith('hev1') || c.startsWith('hvc1')) return 'hevc';
  if (c.startsWith('vp08') || c === 'vp8') return 'vp8';
  if (c.startsWith('vp09') || c === 'vp9') return 'vp9';
  if (c.startsWith('av01')) return 'av1';
  // Audio
  if (c.startsWith('mp4a.40') || c.startsWith('mp4a.67')) return 'aac';
  if (c.startsWith('opus')) return 'opus';
  if (c.startsWith('mp4a.6b') || c.startsWith('mp4a.69') || c === 'mp3' || c === '.mp3') return 'mp3';
  if (c.startsWith('flac') || c.startsWith('fla')) return 'flac';
  if (c.startsWith('alac')) return 'alac';
  if (c.startsWith('ec-3')) return 'eac3';
  if (c.startsWith('ac-3')) return 'ac3';
  return c;
}

/**
 * Derive clockwise rotation degrees from the tkhd transform matrix, if present. mp4box exposes the
 * 9-element fixed-point matrix [a,b,u, c,d,v, x,y,w]; a/b/c/d are 16.16 fixed-point. We classify the
 * four canonical orientations (0/90/180/270) which cover every rotated-video fixture; non-orthogonal
 * matrices are reported as 0 (we do not fabricate an angle we cannot trust).
 */
function rotationFromMatrix(matrix: Int32Array | number[] | undefined): number | undefined {
  if (!matrix || matrix.length < 9) return undefined;
  const a = Number(matrix[0]) / 65536;
  const b = Number(matrix[1]) / 65536;
  const c = Number(matrix[3]) / 65536;
  const d = Number(matrix[4]) / 65536;
  const eq = (x: number, y: number) => Math.abs(x - y) < 0.01;
  if (eq(a, 1) && eq(b, 0) && eq(c, 0) && eq(d, 1)) return 0;
  if (eq(a, 0) && eq(b, 1) && eq(c, -1) && eq(d, 0)) return 90;
  if (eq(a, -1) && eq(b, 0) && eq(c, 0) && eq(d, -1)) return 180;
  if (eq(a, 0) && eq(b, -1) && eq(c, 1) && eq(d, 0)) return 270;
  return undefined;
}

/** Build the normalized metadata from an mp4box `MP4Info`. */
function toNormalizedMetadata(info: MP4Info): NormalizedMetadata {
  const durationSec =
    info.timescale > 0 && info.duration > 0
      ? info.duration / info.timescale
      : null;

  const tracks: NormalizedTrack[] = info.tracks.map((t): NormalizedTrack => {
    const type = trackType(t);
    const trackDurSec = t.timescale > 0 ? t.duration / t.timescale : 0;
    const track: NormalizedTrack = {
      type,
      codec: canonicalCodec(t.codec),
      bitrate: typeof t.bitrate === 'number' && isFinite(t.bitrate) ? Math.round(t.bitrate) : null,
      language: t.language && t.language !== 'und' ? t.language : null,
    };
    if (type === 'video') {
      track.width = t.video?.width ?? t.track_width;
      track.height = t.video?.height ?? t.track_height;
      // fps from sample count over track duration (averaged; VFR tracks report an average fps).
      if (trackDurSec > 0 && t.nb_samples > 0) {
        track.fps = t.nb_samples / trackDurSec;
      }
      const rot = rotationFromMatrix(t.matrix);
      if (rot !== undefined) track.rotation = rot;
    } else if (type === 'audio') {
      track.sampleRate = t.audio?.sample_rate;
      track.channels = t.audio?.channel_count;
    }
    return track;
  });

  return {
    // mp4box parses the ISO-BMFF family; we report 'mp4' (MOV shares the same box structure and is
    // not separately distinguishable from the parsed moov alone). Fragmentation is a `tags` flag.
    container: 'mp4',
    durationSec,
    tracks,
    tags: {
      brands: info.brands.join(','),
      ...(info.isFragmented ? { fragmented: 'true' } : {}),
    },
  };
}

/**
 * Drive an ISOFile to the `onReady`/`onError` resolution by appending the whole file. mp4box parses
 * progressively but a single whole-file append + flush is the simplest correct path for the test
 * corpus (assets fit comfortably in memory; CountingSource accounting is handled by the runner).
 */
function parseToInfo(bytes: ArrayBuffer): Promise<{ file: ISOFile; info: MP4Info }> {
  return new Promise((resolve, reject) => {
    const file = MP4Box.createFile();
    let settled = false;
    file.onError = (msg: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(`mp4box parse error: ${msg}`));
    };
    file.onReady = (info: MP4Info) => {
      if (settled) return;
      settled = true;
      resolve({ file, info });
    };
    try {
      file.appendBuffer(asMP4ArrayBuffer(bytes, 0));
      file.flush();
    } catch (e) {
      if (!settled) {
        settled = true;
        reject(e instanceof Error ? e : new Error(String(e)));
      }
      return;
    }
    // If neither onReady nor onError fired, the moov was never parsed (truncated / not ISO-BMFF).
    if (!settled) {
      settled = true;
      reject(new Error('mp4box: moov not found (not an ISO-BMFF/MP4 file or moov truncated)'));
    }
  });
}

/**
 * mp4box.js engine: probe + demux for ISO-BMFF (MP4/MOV, incl. fragmented). Pure-JS, no WASM, no
 * WebCodecs — so it has no init()/dispose() and never decodes pixels (no decodeFrames/seek).
 */
export class Mp4boxEngine implements MediaEngine {
  readonly id = ENGINE_ID;

  capabilities(): CapabilitySet {
    return {
      // HONEST: mp4box only reads boxes and walks sample tables. It produces metadata (probe) and
      // encoded samples (demux). It never produces bytes (remux/transcode/trim/mux/decrypt) or
      // pixels (decodeFrames/seek), so those operations are deliberately omitted (→ NA(engine)).
      operations: {
        probe: true,
        demux: true,
      },
      // ISO-BMFF only. 'mov' shares the box structure mp4box parses. Fragmented MP4 is supported and
      // surfaced via the 'fragmented' feature, not a separate container token.
      containersIn: ['mp4', 'mov'],
      containersOut: [], // produces no container bytes
      // Codecs mp4box can identify/demux from an MP4 sample table. It does not decode them; it walks
      // the table and forwards encoded samples regardless, but we declare the ones we map to a
      // canonical token and that appear in the MP4 corpus.
      videoCodecs: ['h264', 'hevc', 'vp9', 'av1'],
      audioCodecs: ['aac', 'opus', 'flac', 'mp3'],
      encryption: [], // mp4box can parse `pssh`/`senc` but this adapter does not decrypt
      // 'webcodecs:independent': mp4box is pure-JS demux/probe and never touches WebCodecs, so the
      // runner must not browser-gate its (declared) codecs on WebCodecs.isConfigSupported.
      features: ['fragmented', 'webcodecs:independent'],
    };
  }

  async probe(input: MediaInput): Promise<NormalizedMetadata> {
    const bytes = await input.arrayBuffer();
    const { info } = await parseToInfo(bytes);
    return toNormalizedMetadata(info);
  }

  async demux(input: MediaInput): Promise<DemuxResult> {
    const bytes = await input.arrayBuffer();
    const { file, info } = await parseToInfo(bytes);
    const metadata = toNormalizedMetadata(info);

    // Map mp4box track id → index in info.tracks, so PacketInfo.trackIndex matches metadata.tracks
    // ordering (the contract: trackIndex indexes into NormalizedMetadata.tracks).
    const idToIndex = new Map<number, number>();
    info.tracks.forEach((t, i) => idToIndex.set(t.id, i));

    const packets: PacketInfo[] = [];

    file.onSamples = (id: number, _user: unknown, samples: MP4Sample[]) => {
      const trackIndex = idToIndex.get(id) ?? -1;
      for (const s of samples) {
        const ts = s.timescale > 0 ? s.timescale : 1;
        packets.push({
          trackIndex,
          size: s.size,
          ptsUs: Math.round((s.cts / ts) * 1_000_000),
          dtsUs: Math.round((s.dts / ts) * 1_000_000),
          keyframe: !!s.is_sync,
        });
      }
      // Free sample memory as we go; we have already copied the scalar fields we need.
      const lastNumber = samples.length ? samples[samples.length - 1]!.number + 1 : 0;
      if (lastNumber > 0) file.releaseUsedSamples(id, lastNumber);
    };

    // Extract every track. Large nbSamples keeps callback overhead low; mp4box still chunks at EOF.
    for (const t of info.tracks) {
      file.setExtractionOptions(t.id, null, { nbSamples: 100_000 });
    }
    file.start();
    file.flush(); // synchronous: flush drives processSamples to completion for in-memory data
    file.stop();

    // mp4box delivers samples in per-track order; sort to global decode order (dts then trackIndex)
    // for a stable, engine-independent packet table the golden-packets oracle can compare against.
    packets.sort((a, b) => (a.dtsUs - b.dtsUs) || (a.trackIndex - b.trackIndex));

    return { metadata, packets };
  }

  // ── Undeclared operations: mp4box does none of these. They throw so a mis-wired runner fails
  //    loudly; capabilities() does NOT declare them, so the runner negotiates NA(engine) and never
  //    calls them in practice. ──────────────────────────────────────────────────────────────────

  async remux(_input: MediaInput, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: remux not supported (probe/demux specialist)`);
  }

  async transcode(_input: MediaInput, _opts: TranscodeOptions): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: transcode not supported (no encoder/decoder)`);
  }

  async decodeFrames(_input: MediaInput, _opts?: { maxFrames?: number }): Promise<FrameSink> {
    throw new Error(`${ENGINE_ID}: decodeFrames not supported (no decoder)`);
  }

  async seek(_input: MediaInput, _tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    throw new Error(`${ENGINE_ID}: seek-to-frame not supported (no decoder)`);
  }

  async trim(
    _input: MediaInput,
    _range: { startUs: number; endUs: number },
    _opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: trim not supported (no writer)`);
  }

  // mux/decrypt are optional on MediaEngine and intentionally not implemented here.
  async mux(_tracks: EncodedTracks, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: mux not supported`);
  }
}

/** Register the mp4box engine factory under its versioned id. */
export function registerMp4box(): void {
  registerEngine(ENGINE_ID, () => new Mp4boxEngine());
}
