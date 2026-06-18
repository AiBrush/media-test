/**
 * src/engines/aibrush-media/adapter.ts — PLACEHOLDER / STUB adapter for the future `aibrush-media`
 * library (the internal candidate the whole suite exists to evaluate: the "optimize / adopt / skip"
 * decision).
 *
 * This is the drop-in slot for that candidate. It is intentionally a stub: `aibrush-media` does NOT
 * exist as a published browser engine today — there is no npm package, no GitHub repo, and no
 * documentation for a browser media library named `aibrush-media`, `@aibrush/media`, or
 * `aibrush/media` (verified 2026-06-17; see dossier Research log). Therefore the only honest research
 * output is "it supports nothing": every operation is undeclared and every method throws. When the
 * real library lands, implement this adapter against its API exactly like any other engine (the
 * `_template` adapter documents the full checklist), flip the honest capabilities on, vendor its
 * runtime artifacts locally, and the entire existing scenario battery + report machinery measures it
 * with zero scenario changes.
 *
 * Until then: `capabilities()` declares NOTHING, so the runner negotiates NA(engine) for every
 * scenario — the placeholder shows up in the matrix as a real, not-yet-capable engine rather than a
 * silent gap. NOTE: `registerAibrushMedia()` IS wired into the live matrix — `src/app/register.ts`
 * (ENGINE_WIRINGS) calls it from `registerAll()`, which `src/app/main.ts` runs unconditionally at
 * startup, so this engine is registered on EVERY run by design. That is harmless precisely BECAUSE
 * `capabilities()` is empty: the runner's Pass-1 negotiation (src/core/runner.ts, `negotiate()`)
 * resolves the first declared `requires.operations` token to NA(engine) and short-circuits, so every
 * scenario renders `-` and none of the throwing method bodies below is ever reached. The placeholder
 * therefore contributes only honest NA(engine) columns — it never benches, never wins a case, and
 * never invokes a stub method. (It is harmless because caps are empty, NOT because it is unregistered.)
 *
 * No run-time bytes of any kind: no package to vendor, no WASM/Worker, no CDN/unpkg/toBlobURL — the
 * adapter is pure local TypeScript and is already fully hermetic and offline (§0.8).
 *
 * ─── SOURCES (research-first; cite dossier doc URLs + version researched) ───────────────────────
 *   Dossier:        research/dossiers/aibrush-media.md  (this repo; status: PLACEHOLDER / stub)
 *   Engine id:      aibrush-media@dev  (unpublished — no semver to pin)
 *   Researched on:  2026-06-17
 *   Contract:       src/core/engine.ts (MediaEngine + CapabilitySet + CANONICAL_* tokens)
 *   Reference docs (context only; NONE describe a usable browser engine API):
 *     - AiBrush Studio product docs (NOT a library):  https://docs.aibrush.co/
 *     - MDN WebCodecs (what a future real engine would build on):
 *         https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
 *     - Mediabunny (the suite's reference engine, for dossier-shape comparison):  https://mediabunny.dev/
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

  /**
   * No-op. The §0.7 heavy-load window (dynamic import, WASM instantiate, Worker spawn, encoder
   * warmup) lives here for real engines and is excluded from measured timing — but this placeholder
   * has NOTHING to load, so init() does nothing. Replace with the real one-time setup when the
   * library ships (and keep all heavy work inside it).
   */
  async init(): Promise<void> {
    // intentionally empty — nothing to load.
  }

  /**
   * No-op. Tears down whatever init() set up so peak memory is clean per Worker/iteration. The
   * placeholder holds no resources, so there is nothing to release.
   */
  async dispose(): Promise<void> {
    // intentionally empty — nothing to release.
  }

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
 * Register the aibrush-media placeholder into the engine registry.
 *
 * WIRING (current truth): this IS invoked on every run — `src/app/register.ts` lists `aibrush-media`
 * in ENGINE_WIRINGS and `registerAll()` calls it; `src/app/main.ts` runs `registerAll()`
 * unconditionally at startup. So the placeholder is auto-registered and enters the live matrix by
 * design, where its empty `capabilities()` make every scenario negotiate to NA(engine) → `-` (the
 * intended visible, honest gap of §0). It stays harmless because caps are empty — not because it is
 * unregistered. To take it OUT of runs, remove the `aibrush-media` entry from `ENGINE_WIRINGS` in
 * `src/app/register.ts` (that file owns the wiring; this adapter only owns the honest empty engine).
 *
 * Idempotency: `registerEngine` throws on a duplicate id (`registry.ts`), but `registerAll()` wraps
 * each wiring in try/catch, so a re-entry (HMR / double init) surfaces as `engines[].ok=false` in the
 * RegistrationReport rather than a thrown crash.
 */
export function registerAibrushMedia(): void {
  registerEngine(ENGINE_ID, () => new AibrushMediaEngine());
}
