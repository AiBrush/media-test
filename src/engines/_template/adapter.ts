/**
 * src/engines/_template/adapter.ts — SCAFFOLD copied by `scripts/add-engine.sh <id>` when adding a
 * new media library to the suite. It is a fully-commented skeleton implementing `MediaEngine`.
 *
 * ─── HOW TO USE THIS TEMPLATE ──────────────────────────────────────────────────────────────────
 *   1. `scripts/add-engine.sh mylib` copies this file to `src/engines/mylib/adapter.ts`.
 *   2. Replace `TemplateEngine` with `MyLibEngine`, set `ENGINE_ID` to a stable, VERSIONED id
 *      (e.g. 'mylib@1.2.3') — the version pins the comparison so deltas are reproducible.
 *   3. Dynamically import the heavy library inside `init()` (keeps the suite shell light); free it
 *      in `dispose()`.
 *   4. Implement ONLY the methods your library really performs. For everything else, LEAVE THE
 *      THROW IN PLACE and DO NOT declare the operation in `capabilities()`. The runner negotiates
 *      declared-caps ∧ browser-feature-detect vs the scenario's requirements; an undeclared op is
 *      recorded as NA(engine) and its method is never called. A capability you declare but cannot
 *      back with a correct implementation produces a CONFORMANCE FAILURE, not a free pass.
 *   5. Make `capabilities()` HONEST: list only the operations/containers/codecs/features the library
 *      actually supports, using the canonical lowercase tokens from `engine.ts` (CANONICAL_*).
 *   6. Frames produced by `decodeFrames`/`seek` MUST be digested as sha256 of NORMALIZED RGBA
 *      (tight, top-left origin, straight/un-premultiplied alpha) so digests are engine-independent
 *      and comparable to golden frame digests. Reuse `../platform/digest.ts` (`sha256Hex`,
 *      `digestImageData`) to stay byte-compatible with the oracle.
 *   7. Register the engine (see `registerTemplate()` at the bottom) and wire it where the app builds
 *      its engine list. The reference engine is `mediabunny@1.48.0`; do not mark a new engine as the
 *      reference unless that is the explicit intent.
 *
 * Honesty rules (BUILD_INSTRUCTIONS §15): never declare a capability you don't implement; never edit
 * scenarios to favor an engine; "not implemented" must surface as NA(engine), never a fake number.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */

import { registerEngine } from '../../core/registry.ts';
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
  TranscodeOptions,
} from '../../core/engine.ts';

/** TODO: replace with your library's stable, versioned id, e.g. 'mylib@1.2.3'. */
const ENGINE_ID = 'template@0.0.0';

/**
 * TODO: rename to <MyLib>Engine. Implement `MediaEngine` for your library. Every method below
 * currently throws so a mis-wired runner fails LOUDLY; replace the body of each operation you
 * actually support and declare it in `capabilities()`.
 */
export class TemplateEngine implements MediaEngine {
  readonly id = ENGINE_ID;

  // TODO: hold your library handle / worker here, created in init(), released in dispose().
  // private lib: import('mylib').MyLib | null = null;

  /**
   * Declared capabilities. THIS SCAFFOLD DECLARES NOTHING (all operations false/absent, all lists
   * empty) so a freshly-copied template negotiates NA(engine) for every scenario until you fill it
   * in. Flip an operation to `true` and add the relevant tokens ONLY once the corresponding method
   * is correctly implemented.
   */
  capabilities(): CapabilitySet {
    return {
      operations: {
        // TODO: set the operations your library supports to `true`. Examples:
        // probe: true,
        // demux: true,
        // remux: true,
        // transcode: true,
        // decodeFrames: true,
        // seek: true,
        // trim: true,
        // mux: true,        // also implement the optional mux() method
        // decrypt: true,    // also implement the optional decrypt() method
      },
      // TODO: canonical container tokens you can READ (demux/probe/transcode source). See
      // CANONICAL_CONTAINERS in engine.ts: 'mp4','mov','mkv','webm','ts','hls','wav','mp3','flac',
      // 'ogg','adts'.
      containersIn: [],
      // TODO: canonical container tokens you can WRITE (remux/transcode/trim/mux output).
      containersOut: [],
      // TODO: canonical video codec tokens: 'h264','hevc','vp8','vp9','av1'.
      videoCodecs: [],
      // TODO: canonical audio codec tokens: 'aac','opus','mp3','flac','vorbis','pcm-s16','pcm-s24',
      // 'pcm-f32','pcm-s16be'.
      audioCodecs: [],
      // TODO: encryption schemes you can decrypt: 'cenc-ctr','cenc-cbcs','hls-aes128'.
      encryption: [],
      // TODO: free-form feature flags scenarios may require, e.g. 'fragmented','fastStart:reserve',
      // 'trim:frame-accurate','metadata:write','alpha','resize','rotate','fanout'.
      features: [],
    };
  }

  /**
   * TODO (optional): load the heavy library here (dynamic import + WASM load / Worker spawn). The
   * runner brackets init()/dispose() so this setup is EXCLUDED from measured timing. If load fails,
   * THROW a clear error (don't swallow it) so the runner records ERROR rather than a fake pass.
   */
  async init(): Promise<void> {
    // this.lib = (await import('mylib')).create();
  }

  /** TODO (optional): release the library / terminate workers so each Worker/iter starts clean. */
  async dispose(): Promise<void> {
    // await this.lib?.close();
    // this.lib = null;
  }

  // ── Operations. Implement what your library does; leave the rest throwing AND undeclared. ──────

  async probe(_input: MediaInput): Promise<NormalizedMetadata> {
    throw new Error(`TODO: implement probe for ${ENGINE_ID}`);
  }

  async demux(_input: MediaInput): Promise<DemuxResult> {
    throw new Error(`TODO: implement demux for ${ENGINE_ID}`);
  }

  async remux(_input: MediaInput, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(`TODO: implement remux for ${ENGINE_ID}`);
  }

  async transcode(_input: MediaInput, _opts: TranscodeOptions): Promise<MediaBytes> {
    throw new Error(`TODO: implement transcode for ${ENGINE_ID}`);
  }

  async decodeFrames(_input: MediaInput, _opts?: { maxFrames?: number }): Promise<FrameSink> {
    // When implemented: digest each decoded frame as sha256 of normalized RGBA (use
    // ../platform/digest.ts) so digests match golden/other engines.
    throw new Error(`TODO: implement decodeFrames for ${ENGINE_ID}`);
  }

  async seek(_input: MediaInput, _tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    throw new Error(`TODO: implement seek for ${ENGINE_ID}`);
  }

  async trim(
    _input: MediaInput,
    _range: { startUs: number; endUs: number },
    _opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    throw new Error(`TODO: implement trim for ${ENGINE_ID}`);
  }

  // ── Optional methods (only present if your library supports them; declare in capabilities too). ─

  async mux(_tracks: EncodedTracks, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(`TODO: implement mux for ${ENGINE_ID}`);
  }

  async decrypt(
    _input: MediaInput,
    _key: DecryptKey,
    _opts: { scheme: EncryptionScheme },
  ): Promise<MediaBytes> {
    throw new Error(`TODO: implement decrypt for ${ENGINE_ID}`);
  }
}

/**
 * Registration example. Uncomment and adapt after copying this template, then call it where the app
 * assembles its engine registry. Registering a FACTORY (not an instance) lets the runner build a
 * fresh engine per Worker/iteration for clean memory accounting.
 *
 * ```ts
 * export function registerTemplate(): void {
 *   registerEngine(ENGINE_ID, () => new TemplateEngine());
 * }
 * ```
 */
// export function registerTemplate(): void {
//   registerEngine(ENGINE_ID, () => new TemplateEngine());
// }

// `registerEngine` is imported so the example above type-checks once uncommented; reference it here
// to keep the scaffold free of unused-import errors under strict settings until you wire it up.
void registerEngine;
