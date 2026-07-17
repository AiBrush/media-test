/**
 * src/scenarios/metadata/_shared.ts — shared types + builders for the "metadata" family.
 *
 * Split out so the family's sub-batteries (read, write-roundtrip, rotation, track-selection,
 * negatives, metamorphic) each live in their own file while emitting IDENTICAL scenario shapes. The
 * family stays a single exported `metadataScenarios` array (index.ts concatenates them); nothing here
 * is registered on its own.
 *
 * Correctness is deliberately split into independent observations:
 *   - golden-metadata judges semantic structural evidence;
 *   - metadata tag contracts ask the neutral carrier reader to re-probe authored bytes;
 *   - reference-reimport / decoded properties prove that a successful tag write did not corrupt
 *     media; and
 *   - metadata recovery contracts validate any returned malformed-region recovery before the
 *     graceful oracle may count it as safe.
 * A tag match can therefore never hide corrupt media, and intact media can never hide a lost tag.
 */

import type { OracleId, OracleTolerances, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import {
  defineMetadataRecoveryContract,
  defineMetadataTagContract,
  type MetadataCarrier,
  type MetadataRecoveryContract,
  type MetadataTagContract,
  type SemanticTagKey,
} from '../../features/metadata/index.ts';

// Property-invariant tokens are bare/routing-safe; human phrasing belongs in notes.
export const DECODE_REMUX = 'decode(remux(x))==decode(x)'; // routes to decode-remux (contains 'decode')
export const PROBE_DUR = 'probe-duration'; // routes to probe-duration (contains 'probe', no 'decode'/'remux')

// ── READ tags / structural metadata ──────────────────────────────────────────────────────────────

export interface TagReadCase {
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes?: string;
}

/** Build a READ scenario: probe the asset, gate STRUCTURAL metadata via golden-metadata (ORACLE §1). */
export function buildRead(c: TagReadCase): Scenario {
  return defineScenario({
    id: `metadata/read_${c.asset.replace(/\.[^.]+$/, '')}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['golden-metadata'],
    metrics: ['wall'],
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

// ── WRITE tags then re-observe the output (honest gate per ORACLE §2) ─────────────────────────────

export interface TagWriteCase {
  /** unique id suffix (namespaced under metadata/) */
  id: string;
  asset: string;
  container: MetadataCarrier;
  videoCodecs?: string[];
  audioCodecs?: string[];
  /**
   * Tags to set on the output. The runner forwards these to remux implementations. The case gates
   * that the tag-bearing rewrite is a valid container that did NOT corrupt media; tag-content
   * readback still needs a dedicated oracle that re-probes ctx.output and compares tags.
   */
  tags: Record<string, string>;
  /**
   * Invariant for the "must not corrupt media" gate: DECODE_REMUX for video assets (decoded pixels
   * unchanged by a tag-only rewrite), PROBE_DUR for audio-only assets (no PCM oracle exists, so
   * duration materialized from the re-wrapped stream is the honest sample-fidelity proxy).
   */
  invariant: typeof DECODE_REMUX | typeof PROBE_DUR;
  /** Optional per-case oracle tolerances for container-estimation edges. */
  tolerances?: OracleTolerances;
  notes?: string;
}

/**
 * Build a WRITE-tags scenario. op:'remux' (the runner produces ctx.output). The oracles are the ones
 * that ACTUALLY observe a remux output (ORACLE §2):
 *   - reference-reimport : the tag-bearing output is a real, parseable container the reference reads.
 *   - property-invariant : the tag rewrite must not corrupt media (decode/duration invariant).
 * NOTE: `golden-metadata` is intentionally NOT attached (it always FAILs on a remux op for a
 * plumbing reason and cannot see tag content). `metadata:write` is required so only engines that
 * declare the feature run it; everyone else gets a clean NA_ENGINE.
 */
export function buildWrite(c: TagWriteCase): Scenario {
  const tagContract = defineMetadataTagContract({
    mode: 'write-reprobe',
    carrier: c.container,
    requested: c.tags as Partial<Record<SemanticTagKey, string>>,
  });
  return defineScenario({
    id: `metadata/${c.id}`,
    revision: 2,
    op: 'remux',
    input: c.asset,
    options: {
      container: c.container,
      tags: c.tags,
      invariant: c.invariant,
      robustness: { metadataTags: tagContract },
    },
    requires: {
      operations: ['remux', 'probe'],
      containersIn: [c.container],
      containersOut: [c.container],
      features: ['metadata:write'],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['reference-reimport', 'property-invariant'],
    metrics: ['wall', 'targetWrites'],
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

// ── Metamorphic / property-invariant metadata cases (rotation survival, cross-container, etc.) ────

export interface MetaPropertyCase {
  /** unique id suffix (namespaced under metadata/) */
  id: string;
  revision?: number;
  /** invariant token the property-invariant oracle interprets (use DECODE_REMUX / PROBE_DUR) */
  invariant: typeof DECODE_REMUX | typeof PROBE_DUR;
  input: string;
  from: string;
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  /** Optional semantic tags written by this remux property. */
  tags?: Record<string, string>;
  /** Neutral tag re-probe contract, composed independently from the media-preservation invariant. */
  metadataTagContract?: MetadataTagContract;
  /** Optional per-case oracle tolerances for container-estimation edges. */
  tolerances?: OracleTolerances;
  /** override the default ['property-invariant'] oracle set (e.g. add reference-reimport) */
  oracles?: OracleId[];
  timeoutMs?: number;
  notes?: string;
}

/** Build a metamorphic metadata Scenario (op:'remux' → ctx.output; property-invariant gates it). */
export function buildProperty(c: MetaPropertyCase): Scenario {
  return defineScenario({
    id: `metadata/${c.id}`,
    ...(c.revision ? { revision: c.revision } : {}),
    op: 'remux',
    input: c.input,
    options: {
      container: c.to,
      invariant: c.invariant,
      ...(c.tags ? { tags: c.tags } : {}),
      ...(c.metadataTagContract ? { robustness: { metadataTags: c.metadataTagContract } } : {}),
    },
    requires: {
      operations: ['remux'],
      containersIn: [c.from],
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: c.oracles ?? ['property-invariant'],
    metrics: ['wall', 'peakMemory', 'longtasks'],
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

// ── Direct decode-read cases (read a property by its OBSERVABLE decoded effect) ───────────────────

export interface DecodeReadCase {
  /** unique id suffix (namespaced under metadata/) */
  id: string;
  asset: string;
  container: string;
  videoCodecs?: string[];
  /** Optional feature tokens for decoded-presentation properties (for example rotation:decode). */
  features?: string[];
  /** how many frames to decode + digest-compare against golden */
  maxFrames: number;
  timeoutMs?: number;
  notes?: string;
}

/**
 * Build a decodeFrames scenario gated by `decoded-frames-bitexact`. Used to read a metadata property
 * by the pixels it produces (e.g. rotation: golden frames are baked rotation-applied by the reference
 * decoder, so a demuxer that drops the display matrix — or bakes it into width/height — yields a
 * different decoded image → digest mismatch). VIDEO-ONLY; needs a baked `<asset>.frames.json`.
 */
export function buildDecodeRead(c: DecodeReadCase): Scenario {
  return defineScenario({
    id: `metadata/${c.id}`,
    op: 'decodeFrames',
    input: c.asset,
    options: { maxFrames: c.maxFrames },
    requires: {
      operations: ['decodeFrames'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: ['decoded-frames-bitexact'],
    metrics: ['wall'],
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

// ── Negative / malformed tag-region cases (graceful-failure) ──────────────────────────────────────

export interface MetaNegativeCase {
  /** unique id suffix (namespaced under metadata/) */
  id: string;
  /** malformed asset to probe */
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  /**
   * Some parsers safely recover from malformed tag regions by ignoring the corrupt tag and returning
   * structural stream metadata. For those cases the robustness property is "no fault", not
   * "mandatory reject".
   */
  gracefulAllowOutput?: boolean;
  /** Semantic policy for any returned recovery; rejection remains independently valid. */
  recovery?: MetadataRecoveryContract;
  timeoutMs?: number;
  notes: string;
}

/**
 * Build a negative metadata Scenario. `graceful-failure` routes through the robustness path and
 * PASSes when the engine either rejects the malformed fixture cleanly or, for allowed cases, reports
 * safe structural metadata.
 */
export function buildNegative(c: MetaNegativeCase): Scenario {
  return defineScenario({
    id: `metadata/${c.id}`,
    ...(c.recovery ? { revision: 2 } : {}),
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: c.recovery ? ['graceful-failure', 'property-invariant'] : ['graceful-failure'],
    metrics: ['wall', 'peakMemory'],
    ...(c.gracefulAllowOutput || c.recovery
      ? {
          options: {
            ...(c.gracefulAllowOutput ? { gracefulAllowOutput: true } : {}),
            ...(c.recovery
              ? {
                  invariant: 'metadata-safe-recovery',
                  robustness: { metadataRecovery: defineMetadataRecoveryContract(c.recovery) },
                }
              : {}),
          },
        }
      : {}),
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    notes: c.notes,
  });
}
