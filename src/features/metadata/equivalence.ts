import { canonicalCodecToken } from '../../core/box-readers.ts';
import type { OracleOutcome } from '../../core/scenario.ts';
import { metadataError, metadataVerdict } from './outcome.ts';
import { validateExtendedMetadata } from './schema.ts';
import {
  METADATA_EQUIVALENCE_MATRIX_SCHEMA,
  type ExtendedNormalizedMetadata,
  type ExtendedNormalizedTrack,
  type MetadataEquivalenceCase,
  type MetadataEquivalenceMatrix,
} from './types.ts';

export const REQUIRED_METADATA_EQUIVALENCE_RULES: readonly MetadataEquivalenceCase['rule'][] = Object.freeze([
  'codec-alias',
  'track-reorder',
  'he-aac-sbr',
  'he-aac-ps',
  'ntsc-rational',
  'vfr-cadence',
  'presentation-duration',
  'rotation-normalization',
]);

export const REQUIRED_EXTENDED_METADATA_FIELDS: readonly string[] = Object.freeze([
  'track.rawCodec',
  'track.canonicalCodec',
  'track.trackId',
  'track.defaultDisposition',
  'track.rawWidth',
  'track.rawHeight',
  'track.presentationWidth',
  'track.presentationHeight',
  'track.rateRational',
  'track.cadence',
  'track.sourceTimebase',
  'track.movieTimebase',
  'track.mediaTimebase',
  'track.rawMediaSpanSec',
  'track.presentationDurationSec',
  'track.editList',
  'track.primingSamples',
  'track.paddingSamples',
  'track.rotationMatrix',
  'track.scopedTags',
  'metadata.scopedTags',
  'metadata.chapters',
  'metadata.coverArt',
  'metadata.timecodes',
]);

export interface MetadataEquivalenceMatrixAudit {
  readonly state: 'PASS' | 'FAIL';
  readonly reasonCode: string;
  readonly detail: string;
  readonly outcomes: readonly Readonly<{ id: string; expected: string; actual: string; outcome: OracleOutcome }>[];
}

export function parseMetadataEquivalenceMatrix(value: unknown): MetadataEquivalenceMatrix | undefined {
  const root = record(value);
  if (!root || root.schema !== METADATA_EQUIVALENCE_MATRIX_SCHEMA || typeof root.source !== 'string' ||
    !Array.isArray(root.cases) || !Array.isArray(root.modeledFields) ||
    !root.modeledFields.every((field) => typeof field === 'string')) return undefined;
  const ids = new Set<string>();
  const cases: MetadataEquivalenceCase[] = [];
  for (const raw of root.cases) {
    const item = record(raw);
    if (!item || typeof item.id !== 'string' || ids.has(item.id) ||
      !REQUIRED_METADATA_EQUIVALENCE_RULES.includes(item.rule as MetadataEquivalenceCase['rule']) ||
      !['PASS', 'FAIL'].includes(String(item.expectedVerdict)) ||
      !['positive', 'negative'].includes(String(item.neighbor))) return undefined;
    if (validateExtendedMetadata(item.reference).state !== 'OK' || validateExtendedMetadata(item.candidate).state !== 'OK') return undefined;
    ids.add(item.id);
    cases.push(item as unknown as MetadataEquivalenceCase);
  }
  return {
    schema: METADATA_EQUIVALENCE_MATRIX_SCHEMA,
    source: root.source,
    cases,
    modeledFields: [...new Set(root.modeledFields as string[])],
  };
}

/**
 * Semantic comparison used by the committed acceptance matrix. Named lossless normalizations and an
 * explicitly raw-media duration view are both PASS (the raw-view difference is recorded in the
 * reasonCode/detail); only a neighboring semantic mutation is FAIL.
 */
export function assessMetadataEquivalence(
  reference: ExtendedNormalizedMetadata,
  candidate: ExtendedNormalizedMetadata,
): OracleOutcome {
  const referenceValidation = validateExtendedMetadata(reference);
  const candidateValidation = validateExtendedMetadata(candidate);
  if (referenceValidation.state !== 'OK') {
    return metadataError(
      'METADATA_EQUIVALENCE_EVIDENCE_INVALID',
      `${referenceValidation.path}: ${referenceValidation.detail}`,
    );
  }
  if (candidateValidation.state !== 'OK') {
    return metadataError(
      'METADATA_EQUIVALENCE_EVIDENCE_INVALID',
      `${candidateValidation.path}: ${candidateValidation.detail}`,
    );
  }
  const failures: string[] = [];
  const differences: string[] = [];
  const matches = matchTracks(reference.tracks, candidate.tracks);
  failures.push(...matches.failures);
  for (const match of matches.matches) compareTrack(match.reference, match.candidate, match.label, failures);

  const duration = compareDuration(reference, candidate);
  if (duration.state === 'FAIL') failures.push(duration.detail);
  if (duration.state === 'DIFF') differences.push(duration.detail);

  if (failures.length) {
    return metadataVerdict(
      'FAIL',
      'METADATA_EQUIVALENCE_SEMANTIC_MISMATCH',
      failures.join('; '),
      { matchedTracks: matches.matches.length },
    );
  }
  if (differences.length) {
    return metadataVerdict(
      'DIFF',
      'METADATA_EQUIVALENCE_RAW_PRESENTATION_DIFFERENCE',
      differences.join('; '),
      { matchedTracks: matches.matches.length },
    );
  }
  return metadataVerdict(
    'PASS',
    'METADATA_EQUIVALENCE_NORMALIZED_MATCH',
    `metadata agrees after named lossless normalization (${matches.matches.length} logical track(s))`,
    { matchedTracks: matches.matches.length },
  );
}

export function auditMetadataEquivalenceMatrix(matrix: MetadataEquivalenceMatrix): MetadataEquivalenceMatrixAudit {
  if (matrix.schema !== METADATA_EQUIVALENCE_MATRIX_SCHEMA) {
    return { state: 'FAIL', reasonCode: 'METADATA_EQUIVALENCE_MATRIX_SCHEMA_INVALID', detail: 'matrix schema is unsupported', outcomes: [] };
  }
  const gaps: string[] = [];
  for (const rule of REQUIRED_METADATA_EQUIVALENCE_RULES) {
    const cases = matrix.cases.filter((item) => item.rule === rule);
    if (!cases.some((item) => item.neighbor === 'positive')) gaps.push(`${rule}:positive`);
    if (!cases.some((item) => item.neighbor === 'negative')) gaps.push(`${rule}:negative`);
  }
  for (const field of REQUIRED_EXTENDED_METADATA_FIELDS) {
    if (!matrix.modeledFields.includes(field)) gaps.push(`field-declaration:${field}`);
    else if (!matrixContainsField(matrix, field)) gaps.push(`field-fixture:${field}`);
  }
  const outcomes = matrix.cases.map((item) => {
    const outcome = assessMetadataEquivalence(item.reference, item.candidate);
    const actual = outcome.state === 'VERDICT' ? outcome.verdict : outcome.state;
    return { id: item.id, expected: item.expectedVerdict, actual, outcome };
  });
  const mismatches = outcomes.filter((item) => item.actual !== item.expected);
  if (gaps.length || mismatches.length) {
    return {
      state: 'FAIL',
      reasonCode: 'METADATA_EQUIVALENCE_MATRIX_INCOMPLETE',
      detail: [
        ...(gaps.length ? [`coverage gaps: ${gaps.join(', ')}`] : []),
        ...(mismatches.length ? [`verdict mismatches: ${mismatches.map((item) => `${item.id}:${item.actual}!=${item.expected}`).join(', ')}`] : []),
      ].join('; '),
      outcomes,
    };
  }
  return {
    state: 'PASS',
    reasonCode: 'METADATA_EQUIVALENCE_MATRIX_COMPLETE',
    detail: `${matrix.cases.length} positive/negative equivalence cases cover ${REQUIRED_METADATA_EQUIVALENCE_RULES.length} rules and every modeled field`,
    outcomes,
  };
}

function matrixContainsField(matrix: MetadataEquivalenceMatrix, path: string): boolean {
  const [scope, field] = path.split('.');
  if (!field) return false;
  for (const item of matrix.cases) {
    for (const observation of [item.reference, item.candidate]) {
      if (scope === 'metadata' && Object.hasOwn(observation, field)) return true;
      if (scope === 'track' && observation.tracks.some((track) => Object.hasOwn(track, field))) return true;
    }
  }
  return false;
}

function compareTrack(
  reference: ExtendedNormalizedTrack,
  candidate: ExtendedNormalizedTrack,
  label: string,
  failures: string[],
): void {
  const referenceCodec = canonicalCodec(reference);
  const candidateCodec = canonicalCodec(candidate);
  if (referenceCodec !== candidateCodec) failures.push(`${label} codec ${candidateCodec} vs ${referenceCodec}`);
  for (const key of ['width', 'height', 'presentationWidth', 'presentationHeight'] as const) {
    if (reference[key] !== undefined && candidate[key] !== reference[key]) failures.push(`${label} ${key} ${String(candidate[key])} vs ${reference[key]}`);
  }
  if (reference.language != null && candidate.language != null && normalizeLanguage(reference.language) !== normalizeLanguage(candidate.language)) {
    failures.push(`${label} language ${candidate.language} vs ${reference.language}`);
  }
  if (reference.defaultDisposition !== undefined && candidate.defaultDisposition !== undefined &&
    reference.defaultDisposition !== candidate.defaultDisposition) failures.push(`${label} default disposition changed`);
  compareAudioView(reference, candidate, label, failures);
  compareCadence(reference, candidate, label, failures);
  if (reference.rotation !== undefined && candidate.rotation !== undefined &&
    canonicalRotation(reference.rotation) !== canonicalRotation(candidate.rotation)) {
    failures.push(`${label} rotation ${candidate.rotation} vs ${reference.rotation}`);
  }
}

function compareAudioView(
  reference: ExtendedNormalizedTrack,
  candidate: ExtendedNormalizedTrack,
  label: string,
  failures: string[],
): void {
  if (reference.sampleRate !== undefined && candidate.sampleRate !== reference.sampleRate) {
    const rates = [reference.sampleRate, candidate.sampleRate ?? 0].sort((a, b) => a - b);
    const sbr = canonicalCodec(reference) === 'aac' && (explicitSbr(reference) || explicitSbr(candidate));
    if (!sbr || rates[0]! <= 0 || rates[1] !== rates[0]! * 2) {
      failures.push(`${label} sampleRate ${String(candidate.sampleRate)} vs ${reference.sampleRate}${sbr ? ' (not exact SBR 2x)' : ' (SBR absent)'}`);
    }
  }
  if (reference.channels !== undefined && candidate.channels !== reference.channels) {
    const channels = [reference.channels, candidate.channels ?? 0].sort((a, b) => a - b);
    const ps = canonicalCodec(reference) === 'aac' && (explicitPs(reference) || explicitPs(candidate));
    if (!ps || channels[0] !== 1 || channels[1] !== 2) {
      failures.push(`${label} channels ${String(candidate.channels)} vs ${reference.channels}${ps ? '' : ' (PS absent)'}`);
    }
  }
}

function compareCadence(
  reference: ExtendedNormalizedTrack,
  candidate: ExtendedNormalizedTrack,
  label: string,
  failures: string[],
): void {
  if (reference.type !== 'video') return;
  const referenceMode = cadenceMode(reference);
  const candidateMode = cadenceMode(candidate);
  if (referenceMode === 'VFR' || candidateMode === 'VFR') {
    const a = timestampSummary(reference.frameTimestampsUs);
    const b = timestampSummary(candidate.frameTimestampsUs);
    if (!a || !b) {
      failures.push(`${label} VFR timestamp evidence is missing`);
      return;
    }
    const toleranceUs = Math.max(1, timebaseTickUs(reference), timebaseTickUs(candidate));
    if (a.count !== b.count || Math.abs(a.first - b.first) > toleranceUs ||
      Math.abs(a.last - b.last) > toleranceUs || Math.abs(a.medianDelta - b.medianDelta) > toleranceUs) {
      failures.push(`${label} VFR cadence count/span/median differs`);
    }
    return;
  }
  const a = canonicalFrameRate(reference);
  const b = canonicalFrameRate(candidate);
  if (a !== undefined && (b === undefined || Math.abs(a - b) > 0.001)) {
    failures.push(`${label} CFR ${String(b)} vs ${a}`);
  }
}

function compareDuration(
  reference: ExtendedNormalizedMetadata,
  candidate: ExtendedNormalizedMetadata,
): { state: 'PASS' | 'DIFF' | 'FAIL'; detail: string } {
  const presentation = reference.presentationDurationSec ?? reference.durationSec;
  const candidatePresentation = candidate.presentationDurationSec ?? candidate.durationSec;
  if (presentation == null) return { state: candidatePresentation == null ? 'PASS' : 'FAIL', detail: 'candidate invented a finite presentation duration' };
  if (candidatePresentation == null) return { state: 'FAIL', detail: 'candidate presentation duration is absent' };
  const tolerance = Math.max(1e-6, timebaseTickUsFromMetadata(reference) / 1e6, timebaseTickUsFromMetadata(candidate) / 1e6);
  if (Math.abs(candidatePresentation - presentation) <= tolerance) return { state: 'PASS', detail: 'presentation duration matches' };
  const raw = reference.rawMediaSpanSec ?? maximumRawSpan(reference);
  if (raw !== undefined && Math.abs(candidatePresentation - raw) <= tolerance) {
    return { state: 'DIFF', detail: `candidate reports raw media span ${candidatePresentation}s instead of presentation ${presentation}s` };
  }
  return { state: 'FAIL', detail: `duration ${candidatePresentation}s matches neither presentation ${presentation}s nor evidenced raw span ${String(raw)}` };
}

function matchTracks(
  reference: readonly ExtendedNormalizedTrack[],
  candidate: readonly ExtendedNormalizedTrack[],
): {
  failures: string[];
  matches: Array<{ reference: ExtendedNormalizedTrack; candidate: ExtendedNormalizedTrack; label: string }>;
} {
  const failures: string[] = [];
  const matches: Array<{ reference: ExtendedNormalizedTrack; candidate: ExtendedNormalizedTrack; label: string }> = [];
  const types = new Set([...reference.map((track) => track.type), ...candidate.map((track) => track.type)]);
  for (const type of types) {
    const wanted = reference.map((track, index) => ({ track, index })).filter((entry) => entry.track.type === type);
    const got = candidate.map((track, index) => ({ track, index })).filter((entry) => entry.track.type === type);
    if (wanted.length !== got.length) {
      failures.push(`${type} track count ${got.length} vs ${wanted.length}`);
      continue;
    }
    const unused = new Set(got.map((_, index) => index));
    for (const expected of wanted) {
      const selected = [...unused]
        .map((index) => ({ index, cost: matchCost(expected.track, got[index]!.track) }))
        .sort((a, b) => a.cost - b.cost || a.index - b.index)[0];
      if (!selected) continue;
      unused.delete(selected.index);
      const actual = got[selected.index]!;
      matches.push({
        reference: expected.track,
        candidate: actual.track,
        label: `${type} reference[${expected.index}]↔candidate[${actual.index}]`,
      });
    }
  }
  return { failures, matches };
}

function matchCost(reference: ExtendedNormalizedTrack, candidate: ExtendedNormalizedTrack): number {
  if (reference.type !== candidate.type) return 1e12;
  let cost = canonicalCodec(reference) === canonicalCodec(candidate) ? 0 : 1e9;
  if (reference.trackId !== undefined && candidate.trackId !== undefined && reference.trackId !== candidate.trackId) cost += 1e6;
  if (reference.language != null && candidate.language != null && normalizeLanguage(reference.language) !== normalizeLanguage(candidate.language)) cost += 1e5;
  if (reference.defaultDisposition !== undefined && candidate.defaultDisposition !== undefined && reference.defaultDisposition !== candidate.defaultDisposition) cost += 1e4;
  for (const key of ['width', 'height', 'sampleRate', 'channels'] as const) {
    if (reference[key] !== undefined && candidate[key] !== undefined) cost += Math.abs(reference[key]! - candidate[key]!);
  }
  return cost;
}

function canonicalCodec(track: ExtendedNormalizedTrack): string {
  const raw = track.canonicalCodec ?? track.codecCanonical ?? track.rawCodec ?? track.codecRaw ?? track.nativeCodecTag ?? track.codec;
  return canonicalCodecToken(raw) ?? raw.trim().toLowerCase();
}

function explicitSbr(track: ExtendedNormalizedTrack): boolean {
  return track.sbrPresent === true || track.audioObjectType === 5 || track.audioObjectType === 29 || /mp4a\.40\.(?:5|29)(?:\.|$)/i.test(track.rawCodec ?? track.codecRaw ?? track.codec);
}

function explicitPs(track: ExtendedNormalizedTrack): boolean {
  return track.psPresent === true || track.audioObjectType === 29 || /mp4a\.40\.29(?:\.|$)/i.test(track.rawCodec ?? track.codecRaw ?? track.codec);
}

function cadenceMode(track: ExtendedNormalizedTrack): string {
  return (track.cadence ?? track.fpsProvenance?.cadence ?? 'CFR').toUpperCase();
}

function canonicalFrameRate(track: ExtendedNormalizedTrack): number | undefined {
  const rational = track.rateRational ?? track.fpsProvenance?.rational;
  const value = rational && rational.denominator > 0 ? rational.numerator / rational.denominator : track.fps;
  if (value === undefined) return undefined;
  for (const rate of [24_000 / 1_001, 30_000 / 1_001, 60_000 / 1_001]) {
    if (Math.abs(value - rate) < 0.001 || Math.abs(value - Number(rate.toFixed(3))) < 0.001) return rate;
  }
  return value;
}

function timestampSummary(values: readonly number[] | undefined): { count: number; first: number; last: number; medianDelta: number } | undefined {
  if (!values || values.length < 2) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const deltas = sorted.slice(1).map((value, index) => value - sorted[index]!).sort((a, b) => a - b);
  const middle = Math.floor(deltas.length / 2);
  const medianDelta = deltas.length % 2 ? deltas[middle]! : (deltas[middle - 1]! + deltas[middle]!) / 2;
  return { count: sorted.length, first: sorted[0]!, last: sorted.at(-1)!, medianDelta };
}

function normalizeLanguage(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  const aliases: Record<string, string> = { eng: 'en', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de', jpn: 'ja', und: 'und' };
  return aliases[normalized] ?? normalized;
}

function canonicalRotation(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function timebaseTickUs(track: ExtendedNormalizedTrack): number {
  const value = track.sourceTimebase ?? track.mediaTimebase ?? track.movieTimebase;
  return value ? (value.numerator / value.denominator) * 1e6 : 0;
}

function timebaseTickUsFromMetadata(metadata: ExtendedNormalizedMetadata): number {
  const values = [
    metadata.sourceTimebase ? (metadata.sourceTimebase.numerator / metadata.sourceTimebase.denominator) * 1e6 : 0,
    ...metadata.tracks.map(timebaseTickUs),
  ].filter((value) => value > 0);
  return values.length ? Math.max(...values) : 0;
}

function maximumRawSpan(metadata: ExtendedNormalizedMetadata): number | undefined {
  const values = metadata.tracks.map((track) => track.rawMediaSpanSec).filter((value): value is number => value !== undefined);
  return values.length ? Math.max(...values) : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
