/**
 * src/engines/aibrush-media/adapter.ts — PLACEHOLDER adapter for the future `aibrush/media` library.
 *
 * This is the drop-in slot for the candidate library the whole suite exists to evaluate (the
 * "optimize / adopt / skip" decision). It is intentionally a stub: `aibrush/media` does not exist as
 * a browser engine yet, so every operation is undeclared and every method throws. When the real
 * library lands, implement this adapter against its API exactly like any other engine (the
 * `_template` adapter documents the full checklist), flip the honest capabilities on, and the entire
 * existing scenario battery + report machinery measures it with zero scenario changes.
 *
 * Until then: `capabilities()` declares NOTHING, so the runner negotiates NA(engine) for every
 * scenario — the placeholder shows up in the matrix as a real, not-yet-capable engine rather than a
 * silent gap. `registerAibrushMedia()` is provided but is NOT called automatically; nothing wires
 * this engine into a run until someone opts in (so the placeholder never pollutes a comparison).
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

/** Pre-release id. Bump to a pinned version (e.g. 'aibrush-media@0.1.0') once the library ships. */
const ENGINE_ID = 'aibrush-media@dev';

/** Single message so the matrix/report show a consistent, unmistakable placeholder reason. */
const NOT_IMPLEMENTED = `${ENGINE_ID}: aibrush-media not yet implemented (placeholder adapter)`;

/**
 * Placeholder engine for `aibrush/media`. All capabilities are stubbed off (NA for now) and every
 * method throws. Replace this with the real implementation when the library is available.
 */
export class AibrushMediaEngine implements MediaEngine {
  readonly id = ENGINE_ID;

  /**
   * STUB capability set — everything empty/false on purpose. Nothing is declared, so the runner
   * records NA(engine) for every scenario and never invokes the throwing methods below. Fill this in
   * (honestly, with canonical tokens) only as real, oracle-validated functionality is implemented.
   */
  capabilities(): CapabilitySet {
    return {
      operations: {}, // none declared yet → NA(engine) everywhere
      containersIn: [],
      containersOut: [],
      videoCodecs: [],
      audioCodecs: [],
      encryption: [],
      features: [],
    };
  }

  // No init()/dispose() yet — there is nothing to load. Add them when the real library needs setup.

  async probe(_input: MediaInput): Promise<NormalizedMetadata> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async demux(_input: MediaInput): Promise<DemuxResult> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async remux(_input: MediaInput, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async transcode(_input: MediaInput, _opts: TranscodeOptions): Promise<MediaBytes> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async decodeFrames(_input: MediaInput, _opts?: { maxFrames?: number }): Promise<FrameSink> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async seek(_input: MediaInput, _tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async trim(
    _input: MediaInput,
    _range: { startUs: number; endUs: number },
    _opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async mux(_tracks: EncodedTracks, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async decrypt(
    _input: MediaInput,
    _key: DecryptKey,
    _opts: { scheme: EncryptionScheme },
  ): Promise<MediaBytes> {
    throw new Error(NOT_IMPLEMENTED);
  }
}

/**
 * Register the aibrush-media placeholder. Present so it CAN be added to a run on demand, but NOT
 * called from any module's import side effects — the placeholder stays out of comparisons until
 * someone explicitly opts in (e.g. when starting to bring up the real implementation).
 */
export function registerAibrushMedia(): void {
  registerEngine(ENGINE_ID, () => new AibrushMediaEngine());
}
