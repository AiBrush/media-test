/**
 * src/core/media-selection.ts — per-scenario media-file rotation (scenario-media-test-update-instructions).
 *
 * WHY: today each scenario is judged against ONE baked fixture with committed goldens — overfit. Each
 * scenario dir now also holds real independent internet files of the same input shape. This module
 * picks, per run, ONE input per scenario (seeded, reproducible) from {baked fixture} ∪ {real files},
 * so correctness/perf reflect real inputs. It NEVER mutates a file, NEVER softens an oracle, and NEVER
 * routes a real defect into an NA bucket (hard rules R1/R2/R3). The runner consumes the returned
 * `ScenarioSelection` map; oracles/scoring are untouched.
 *
 * THREE THINGS THIS MODULE OWNS (keep them honest):
 *  - Determinism (§6.2/§10): seeded pick keyed on `${runSeed}|${scenarioId}` via the shared RNG, so
 *    every engine in a run sees the identical file and the run replays from (runSeed, corpus).
 *  - Shape gate (§6.3): a picked real file MUST match the scenario's required INPUT shape (container +
 *    input-side codecs). A non-matching real file is a CORPUS bug → drop it + warn; never an engine NA.
 *  - id/url decoupling (§6.4): `ResolvedInput.id` drives golden lookup + identity; `urlAssetPath` is the
 *    bytes actually fetched. Baked ⇒ id = flat asset id (its golden resolves) but url points into the
 *    scenario dir; real ⇒ id = the scenario-dir path (its golden 404s → golden-keyed oracles NA_ASSET).
 */

import type { OracleId, Scenario } from './scenario.ts';
import { hashSeed, mulberry32 } from './seeded-rng.ts';

// ── _sources.ndjson row/file schema (read-only catalog; one row per scenario) ──

/** One real (or DERIVED) download listed for a scenario. Extra provenance keys are tolerated. */
export interface SourceFileRecord {
  /** on-disk name inside the scenario dir, always 'NN.ext' (never the baked fixture). */
  file: string;
  container: string;
  videoCodecs: string[];
  audioCodecs: string[];
  sha256: string;
  sizeBytes: number;
  /** source duration (seconds) probed at download time; used by the §6.3 duration gate for trim/seek. */
  durationSec?: number | null;
  /** DERIVED (encryption) only: fresh key material recorded at bake time (§5d). */
  keys?: { keyHex: string; kid?: string; ivHex?: string; keyUri?: string; scheme: string };
  /** DERIVED only: the retained real cleartext base this file was encrypted from. poolPath is
   *  '_derived_cleartext/<sha>.mp4' (served at 'scenarios/_derived_cleartext/<sha>.mp4'). */
  cleartextBase?: { poolPath: string; sha256: string; [k: string]: unknown };
  /** DERIVED only: the exact local encryption command (provenance). */
  derivation?: string;
  /** DERIVED HLS only: member files of the rendition ('NN.m3u8','NN.key','NN_000.ts', …). */
  hlsFiles?: string[];
  [k: string]: unknown;
}

export type SourceClass = 'REAL' | 'SYNTHETIC' | 'STREAMING' | 'DERIVED';

/** One _sources.ndjson row. `requires` is a FLATTENED input-shape descriptor (NOT scenario.requires). */
export interface ScenarioSourceRow {
  scenarioId: string;
  requires: {
    container: string;
    video: boolean;
    videoCodecs: string[];
    audioCodecs: string[];
    encryption?: string[] | null;
  };
  class: SourceClass;
  files: SourceFileRecord[];
  reason?: string;
  note?: string;
}

// ── Selection outputs (consumed by runner.ts) ──

/**
 * One concrete input the runner will fetch. `id` and `urlAssetPath` are DECOUPLED (§6.4):
 *  - `id` is what MediaInput.id becomes → drives golden lookup + reporting/winner attribution.
 *  - `urlAssetPath` is the path under `/fixtures/media/` actually fetched (buildMediaInput's url override).
 */
export interface ResolvedInput {
  /** golden/identity key. Baked: the flat asset id (e.g. 'aac_adts.aac'). Real: 'scenarios/<id>/NN.ext'. */
  id: string;
  /** path under /fixtures/media/ to fetch, e.g. 'scenarios/probe/aac_adts/aac_adts.aac' or '…/01.aac'. */
  urlAssetPath: string;
  sha256?: string;
  sizeBytes?: number;
}

/** The full per-scenario decision for one run. */
export interface ScenarioSelection {
  scenarioId: string;
  /** true ⇒ golden-backed baked fixture (full oracle set); false ⇒ rotated real file (survivor oracles). */
  isBaked: boolean;
  /** on-disk name of the selected file: baked flat asset id, or a real 'NN.ext'. */
  selectedFile: string;
  selectedSha256?: string;
  /** inputs the runner feeds the engine (length 1 for single-input; N for multi-input baked). */
  resolvedInputs: ResolvedInput[];
  /**
   * A shallow clone of the scenario with `input` repointed to the pick and, for a rotated DERIVED
   * (encryption) file, `options` (key material + cleartextBaseAsset + invariant) and `oracles`
   * (append 'property-invariant') injected so the golden-free decrypt oracle runs. requires/id/family
   * are UNCHANGED so negotiate()/disabled-cells/scoring behave identically.
   */
  effectiveScenario: Scenario;
  /** baked + shape-passing real files considered this run (for reporting / exhaustive audits). */
  candidateCount: number;
  /** §6.3 corpus-bug surfacing: real files dropped for failing the input-shape gate. NEVER an engine NA. */
  shapeWarnings: string[];
}

/** URL of the read-only selection catalog. */
export const SOURCES_NDJSON_PATH = '/fixtures/media/scenarios/_sources.ndjson';
/** Path segment (under /fixtures/media/) that the whole per-scenario corpus lives under. */
export const SCENARIOS_URL_PREFIX = 'scenarios';
/**
 * property-invariant sub-kind for the golden-free DERIVED decrypt oracle (§7.3):
 *   decode(decrypt(encrypted)) == decode(cleartextBase), both via the platform WebCodecs decoder.
 * The selection sets scenario.options.invariant to this and options.cleartextBaseAsset to the base's
 * served path; oracles.ts implements the matching handler.
 */
export const DECRYPT_METAMORPHIC_INVARIANT = 'decrypt-eq-cleartext-decode';

// ── API (implemented in this file; signatures are FIXED — callers depend on them) ──

/**
 * Fetch + parse `_sources.ndjson` into a `scenarioId → row` map. Tolerant of blank lines. On fetch
 * failure returns an empty map (the runner then falls back to baked-only — the suite stays runnable).
 */
export async function loadScenarioSources(url: string = SOURCES_NDJSON_PATH): Promise<Map<string, ScenarioSourceRow>> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`media-selection.loadScenarioSources: ${url} → HTTP ${res.status}; falling back to baked-only`);
      return new Map();
    }
    const text = await res.text();
    const map = new Map<string, ScenarioSourceRow>();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue; // tolerate blank lines
      const row = JSON.parse(trimmed) as ScenarioSourceRow;
      if (row && typeof row.scenarioId === 'string') map.set(row.scenarioId, row);
    }
    return map;
  } catch (err) {
    console.warn(
      `media-selection.loadScenarioSources: could not load/parse ${url} (${(err as Error)?.message ?? String(err)}); falling back to baked-only`,
    );
    return new Map();
  }
}

export interface SelectOptions {
  /** false ⇒ force the baked fixture for every scenario (debug / baked-canonical audit). Default true. */
  rotate?: boolean;
}

// ── Internal selection machinery (not exported; the public API above is the contract) ──

/** One candidate the seeded draw chooses among: the baked fixture (index 0) or a real download. */
type SelectionCandidate = { kind: 'baked' } | { kind: 'real'; file: SourceFileRecord };

/** DERIVED schemes that rotate in v1: CENC-in-MP4 only (HLS-scheme DERIVED stays baked, §6.5). */
const CENC_MP4_SCHEMES = new Set(['cenc-ctr', 'cenc-cbcs', 'cenc-cens']);

/** The scenario's baked input asset id(s): a single flat id or the multi-input list, always ≥1. */
function inputNames(scenario: Scenario): string[] {
  return Array.isArray(scenario.input) ? scenario.input : [scenario.input];
}

/**
 * §6.3 INPUT-SHAPE GATE. Returns undefined when `file` matches the scenario's required input shape,
 * or a specific human-readable reason when it does NOT (so the caller can surface a CORPUS bug as a
 * shapeWarning — NEVER an engine NA). Keep iff ALL hold: container matches (case-insensitively);
 * every required video/audio codec is present on the file; an audio-only scenario's file carries no
 * video; and an encryption requirement is met by the file's own key scheme.
 */
function shapeGateReason(
  file: SourceFileRecord,
  requires: ScenarioSourceRow['requires'],
  minDurationSec = 0,
): string | undefined {
  const fileContainer = (file.container ?? '').toLowerCase();
  const reqContainer = (requires.container ?? '').toLowerCase();
  if (fileContainer !== reqContainer) {
    return `container '${file.container}' != required '${requires.container}'`;
  }
  const fileVideo = file.videoCodecs ?? [];
  const fileAudio = file.audioCodecs ?? [];
  for (const codec of requires.videoCodecs ?? []) {
    if (!fileVideo.includes(codec)) return `missing video codec '${codec}' (file has [${fileVideo.join(', ')}])`;
  }
  for (const codec of requires.audioCodecs ?? []) {
    if (!fileAudio.includes(codec)) return `missing audio codec '${codec}' (file has [${fileAudio.join(', ')}])`;
  }
  if (requires.video === false && (requires.audioCodecs?.length ?? 0) > 0 && fileVideo.length > 0) {
    return `audio-only scenario but file carries video codecs [${fileVideo.join(', ')}]`;
  }
  const enc = requires.encryption;
  if (Array.isArray(enc) && enc.length > 0) {
    const scheme = file.keys?.scheme;
    if (!scheme || !enc.includes(scheme)) {
      return `encryption scheme '${scheme ?? '∅'}' not in required [${enc.join(', ')}]`;
    }
  }
  // §6.3 duration dimension: a range-based op (trim/seek) has a fixed time target; a file too SHORT to
  // contain it does not fit the scenario. Dropping it (→ baked/longer-file fallback) prevents the engine
  // erroring on an out-of-range trim/seek — noise, not an honest engine defect (R3).
  if (minDurationSec > 0) {
    const dur = typeof file.durationSec === 'number' && Number.isFinite(file.durationSec) ? file.durationSec : undefined;
    if (dur === undefined || dur < minDurationSec + 0.02) {
      return `duration ${dur ?? '∅'}s too short for op time target ${minDurationSec.toFixed(3)}s`;
    }
  }
  return undefined;
}

/**
 * §6.3 duration target for range-based ops. trim/seek carry a fixed time position in options; a rotated
 * real file must be at least that long to fit. Mirrors runner.ts `asTrimRange` (options.range.{startUs,
 * endUs} or top-level) and seek's `asNumberOpt(options,'tUs')`. Returns 0 for ops with no time target.
 */
function requiredMinDurationSec(scenario: Scenario): number {
  const o = (scenario.options ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  if (scenario.op === 'trim') {
    const range = (o.range ?? {}) as Record<string, unknown>;
    const startUs = num(range.startUs) ?? num(o.startUs) ?? 0;
    const endUs = num(range.endUs) ?? num(o.endUs) ?? 0;
    return Math.max(startUs, endUs) / 1e6;
  }
  if (scenario.op === 'seek') {
    return Math.max(0, num(o.tUs) ?? 0) / 1e6;
  }
  return 0;
}

/** DERIVED rows rotate only when CENC-in-MP4 (v1); HLS-scheme DERIVED rows stay baked. */
function isRotatableCencMp4(row: ScenarioSourceRow): boolean {
  if ((row.requires.container ?? '').toLowerCase() !== 'mp4') return false;
  const scheme = row.files[0]?.keys?.scheme ?? row.requires.encryption?.[0];
  return typeof scheme === 'string' && CENC_MP4_SCHEMES.has(scheme);
}

/**
 * DERIVED (CENC-MP4) real pick: clone the scenario with `input` repointed to the real file AND rewrite
 * `options`/`oracles` so the golden-free metamorphic decrypt oracle runs against THIS file's own key.
 *  - options.key/scheme ← the picked file's recorded key material (asDecryptKey/asEncryptionScheme read
 *    options.key/options.scheme in runner.ts), NOT the baked key (which would decrypt this file to garbage).
 *  - options.invariant ← DECRYPT_METAMORPHIC_INVARIANT; options.cleartextBaseAsset ← the retained real
 *    cleartext base's served path (the new oracle decodes decrypt(x) and compares to decode(base)).
 *  - DELETE cleartextAsset/cleartextAssetId/goldenAsset/goldenAssetId: they point at the BAKED twin's
 *    committed golden; left in place, decrypt-bitexact would compare this real file's output to the WRONG
 *    golden and FAIL a correct engine (R2/R3). Removed ⇒ the golden 404s ⇒ that oracle is NA_ASSET (honest).
 *  - ORACLES: drop 'decrypt-bitexact' (golden-less here ⇒ NA_ASSET anyway) and ensure 'property-invariant'
 *    is present (the real bit-exact signal); 'reference-reimport'/'playback-smoke' survive golden-free.
 */
function deriveEffective(scenario: Scenario, id: string, file: SourceFileRecord): Scenario {
  const keys = file.keys;
  const base = file.cleartextBase;
  // Defensive: a DERIVED file missing key/base metadata can't be re-keyed honestly → plain real repoint.
  if (!keys || !base) return { ...scenario, input: id };

  const options: Record<string, unknown> = {
    ...((scenario.options ?? {}) as Record<string, unknown>),
    scheme: keys.scheme,
    key: {
      keyHex: keys.keyHex,
      ...(keys.kid ? { kid: keys.kid } : {}),
      ...(keys.ivHex ? { ivHex: keys.ivHex } : {}),
    },
    invariant: DECRYPT_METAMORPHIC_INVARIANT,
    cleartextBaseAsset: `${SCENARIOS_URL_PREFIX}/${base.poolPath}`,
  };
  // Sever every pointer to the baked twin's golden so no oracle scores against the wrong ground truth.
  delete options.cleartextAsset;
  delete options.cleartextAssetId;
  delete options.goldenAsset;
  delete options.goldenAssetId;

  let oracles: OracleId[] = scenario.oracles.filter((o) => o !== 'decrypt-bitexact');
  if (!oracles.includes('property-invariant')) oracles = [...oracles, 'property-invariant'];

  return { ...scenario, input: id, options, oracles };
}

/** Turn a chosen candidate into the full per-scenario decision (id/url decoupling lives here, §6.4). */
function makeSelection(
  scenario: Scenario,
  row: ScenarioSourceRow | undefined,
  pick: SelectionCandidate,
  candidateCount: number,
  shapeWarnings: string[],
): ScenarioSelection {
  if (pick.kind === 'baked') {
    // Baked: id = flat asset id (its golden resolves); url points into the (populated) scenario dir.
    const names = inputNames(scenario);
    const resolvedInputs: ResolvedInput[] = names.map((name) => ({
      id: name,
      urlAssetPath: `${SCENARIOS_URL_PREFIX}/${scenario.id}/${name}`,
    }));
    return {
      scenarioId: scenario.id,
      isBaked: true,
      selectedFile: names.length === 1 ? (names[0] ?? '') : names.join('+'),
      resolvedInputs,
      effectiveScenario: { ...scenario },
      candidateCount,
      shapeWarnings,
    };
  }

  // Real: id = the scenario-dir path (its golden 404s → golden-keyed oracles NA_ASSET); url == id.
  const file = pick.file;
  const id = `${SCENARIOS_URL_PREFIX}/${scenario.id}/${file.file}`;
  const resolvedInputs: ResolvedInput[] = [
    { id, urlAssetPath: id, sha256: file.sha256, sizeBytes: file.sizeBytes },
  ];
  const effectiveScenario =
    row?.class === 'DERIVED' ? deriveEffective(scenario, id, file) : { ...scenario, input: id };
  return {
    scenarioId: scenario.id,
    isBaked: false,
    selectedFile: file.file,
    selectedSha256: file.sha256,
    resolvedInputs,
    effectiveScenario,
    candidateCount,
    shapeWarnings,
  };
}

/**
 * Build the per-run selection map. Called ONCE per run (in runMatrix), so all engines share the picks.
 *
 * Per scenario:
 *  1. Baked candidate ALWAYS exists (§6.4): resolvedInputs point at `scenarios/<id>/<bakedName>` while
 *     ids stay the flat asset id(s) from `scenario.input`. Multi-input ⇒ one ResolvedInput per input.
 *  2. Rotatable? Baked-ONLY (no draw) when ANY: opts.rotate === false; row missing; row.class ∈
 *     {SYNTHETIC, STREAMING}; row.files empty; family === 'robustness'; family === 'streaming-output';
 *     Array.isArray(scenario.input) (multi-input, §6.5 v1). Otherwise candidates = [baked, …realFiles].
 *  3. Shape gate (§6.3) each real file, keep iff ALL: lower(file.container)===lower(requires.container);
 *     requires.videoCodecs ⊆ file.videoCodecs; requires.audioCodecs ⊆ file.audioCodecs; audio-only
 *     scenario (requires.video===false) ⇒ file.videoCodecs empty; requires.encryption non-empty ⇒
 *     file.keys.scheme ∈ requires.encryption. Dropped files → shapeWarnings; if ALL dropped ⇒ [baked].
 *  4. Seeded pick (§6.2): mulberry32(hashSeed(`${runSeed}|${scenarioId}`)); index = floor(r()*len).
 *     Candidate order is STABLE: [0]=baked, then real files in ndjson order — same seed ⇒ same pick.
 *  5. DERIVED real pick ⇒ inject key material + cleartextBaseAsset + invariant into options and append
 *     'property-invariant' to oracles (mirror the option shape used by src/scenarios/encryption/_shared.ts
 *     so engine.decrypt reads the picked file's key, not the baked key).
 */
/**
 * Gather the ORDERED candidate list for one scenario (shared by seeded-single and exhaustive modes).
 * Order is the reproducibility + fairness contract: baked at index 0, then shape/duration-passing real
 * files in ndjson order — identical for every engine in a run. See selectForRun doc for the policy.
 */
function gatherCandidates(
  scenario: Scenario,
  row: ScenarioSourceRow | undefined,
  opts?: SelectOptions,
): { candidates: SelectionCandidate[]; shapeWarnings: string[] } {
  // Baked-ONLY policy (no rotation): forced, missing catalog row, non-rotating class, empty files, the
  // two baked-canonical families, multi-input (§6.5 v1), op=seek (§8 "Caution"), or a non-CENC-mp4 DERIVED.
  const bakedOnly =
    opts?.rotate === false ||
    !row ||
    row.class === 'SYNTHETIC' ||
    row.class === 'STREAMING' ||
    row.files.length === 0 ||
    scenario.family === 'robustness' ||
    scenario.family === 'streaming-output' ||
    Array.isArray(scenario.input) ||
    // §8 "seek: Caution" — seek scenarios seek to a FIXED timestamp calibrated for the baked fixture; on a
    // real file that target is arbitrary, so the sole oracle (golden-keyed seek-accuracy) is NA_ASSET (no
    // signal) while the op itself spuriously ERRORs on an invalid landing. Rotating seek is pure downside.
    scenario.op === 'seek' ||
    (row.class === 'DERIVED' && !isRotatableCencMp4(row));

  const shapeWarnings: string[] = [];
  let candidates: SelectionCandidate[] = [{ kind: 'baked' }];
  if (!bakedOnly && row) {
    const minDurationSec = requiredMinDurationSec(scenario);
    const reals: SelectionCandidate[] = [];
    for (const file of row.files) {
      const reason = shapeGateReason(file, row.requires, minDurationSec);
      if (reason) {
        shapeWarnings.push(`${scenario.id}: dropped ${file.file} (input-shape/duration mismatch: ${reason})`);
      } else {
        reals.push({ kind: 'real', file });
      }
    }
    if (reals.length > 0) candidates = [{ kind: 'baked' }, ...reals];
  }
  return { candidates, shapeWarnings };
}

/**
 * Build the per-run selection map (SEEDED-SINGLE mode, §6.2 default). Called ONCE per run so all engines
 * share the picks. Draws ONE candidate per scenario via the shared RNG keyed on (runSeed, scenarioId).
 * See gatherCandidates for the candidate policy; makeSelection for the id/url decoupling + DERIVED injection.
 */
export function selectForRun(
  scenarios: Scenario[],
  runSeed: string,
  sources: Map<string, ScenarioSourceRow>,
  opts?: SelectOptions,
): Map<string, ScenarioSelection> {
  const out = new Map<string, ScenarioSelection>();
  for (const scenario of scenarios) {
    const row = sources.get(scenario.id);
    const { candidates, shapeWarnings } = gatherCandidates(scenario, row, opts);
    // Seeded, reproducible pick keyed on (runSeed, scenarioId). For a lone baked candidate floor(r()*1)===0.
    const rng = mulberry32(hashSeed(`${runSeed}|${scenario.id}`));
    const idx = Math.floor(rng() * candidates.length);
    const pick = candidates[idx] ?? candidates[0] ?? { kind: 'baked' };
    out.set(scenario.id, makeSelection(scenario, row, pick, candidates.length, shapeWarnings));
  }
  return out;
}

/**
 * EXHAUSTIVE mode (§6.2): return EVERY candidate per scenario (baked + all shape/duration-passing real
 * files), in the stable shared order, so the runner can run each file as its own sub-case for every
 * engine and aggregate. No RNG — order is deterministic and identical across engines (fairness).
 */
export function candidatesForRun(
  scenarios: Scenario[],
  sources: Map<string, ScenarioSourceRow>,
  opts?: SelectOptions,
): Map<string, ScenarioSelection[]> {
  const out = new Map<string, ScenarioSelection[]>();
  for (const scenario of scenarios) {
    const row = sources.get(scenario.id);
    const { candidates, shapeWarnings } = gatherCandidates(scenario, row, opts);
    out.set(
      scenario.id,
      candidates.map((c) => makeSelection(scenario, row, c, candidates.length, shapeWarnings)),
    );
  }
  return out;
}

/** Stable tag for the result-reuse cache key so a run that picked a DIFFERENT file never reuses a stale
 *  PASS. 'baked' for the baked fixture, else the sha256 prefix (or 'real:<file>' when sha unknown). */
export function selectionCacheTag(sel: ScenarioSelection): string {
  if (sel.isBaked) return 'baked';
  return sel.selectedSha256 ? sel.selectedSha256.slice(0, 12) : `real:${sel.selectedFile}`;
}

/** Stable digest over the run's actually-selected (scenarioId, file, sha256) triples → RunEnv.corpusChecksum,
 *  so a changed corpus/selection is visible in the report (§10). Order-independent. */
export function computeCorpusChecksum(selections: Iterable<ScenarioSelection>): string {
  const rows: string[] = [];
  for (const s of selections) {
    rows.push(`${s.scenarioId}|${s.selectedFile}|${s.selectedSha256 ?? ''}`);
  }
  rows.sort(); // order-independent: sort the per-scenario triples before digesting
  return hashSeed(rows.join('\n')).toString(16);
}
