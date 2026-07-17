import { trimVerdict, type TrimDecision } from './types.ts';

export interface SemanticTrimSample {
  readonly ptsUs: number;
  readonly durationUs: number;
  readonly contentDigest: string;
}

export interface SemanticTrimTrack {
  /** Source-derived role/identity; never a transient output array index. */
  readonly identity: string;
  readonly type: 'video' | 'audio' | 'subtitle' | 'other';
  readonly codecCanonical: string;
  readonly language?: string | null;
  readonly rotationDegrees?: number;
  readonly alphaMode?: 'present' | 'opaque' | 'absent';
  readonly samples: readonly SemanticTrimSample[];
}

export interface TrimSemanticPresentation {
  readonly tracks: readonly SemanticTrimTrack[];
  readonly durationUs: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface TrimNoopIdentityInput {
  readonly source: TrimSemanticPresentation;
  readonly candidate: TrimSemanticPresentation;
  readonly timestampToleranceUs: number;
  readonly durationToleranceUs: number;
  /** Legal packet/container form changes established by semantic packet diagnostics. */
  readonly representationDifferences?: readonly string[];
}

/** Full-range trim identity is decoded timeline/content identity, not equal duration or packet layout. */
export function assessTrimNoopIdentity(input: TrimNoopIdentityInput): TrimDecision {
  const failures: string[] = [];
  const matched = matchSemanticTracks(input.source.tracks, input.candidate.tracks);
  failures.push(...matched.failures);
  for (const match of matched.matches) {
    compareTrack(match.source, match.candidate, input.timestampToleranceUs, failures);
  }
  if (Math.abs(input.source.durationUs - input.candidate.durationUs) > input.durationToleranceUs) {
    failures.push(`presentation duration ${input.candidate.durationUs}us vs source ${input.source.durationUs}us`);
  }
  compareMetadata(input.source.metadata, input.candidate.metadata, failures);
  const measurements = {
    sourceTracks: input.source.tracks.length,
    candidateTracks: input.candidate.tracks.length,
    matchedTracks: matched.matches.length,
    sourceSamples: input.source.tracks.reduce((sum, track) => sum + track.samples.length, 0),
    candidateSamples: input.candidate.tracks.reduce((sum, track) => sum + track.samples.length, 0),
    durationDeltaUs: Math.abs(input.source.durationUs - input.candidate.durationUs),
  };
  if (failures.length > 0) {
    return trimVerdict('FAIL', 'TRIM_NOOP_SEMANTIC_IDENTITY_MISMATCH', failures.join('; '), measurements);
  }
  const representationDifferences = [...new Set(input.representationDifferences ?? [])].sort();
  if (representationDifferences.length > 0) {
    return trimVerdict(
      'PASS',
      'TRIM_NOOP_REPRESENTATION_DIFFERENCE',
      `full presentation is identical; ${representationDifferences.join(', ')}`,
      measurements,
      { representationDifferences },
    );
  }
  return trimVerdict(
    'PASS',
    'TRIM_NOOP_SEMANTIC_IDENTITY_MATCH',
    `${matched.matches.length} required track(s) retain their complete decoded presentation`,
    measurements,
  );
}

export function matchSemanticTracks(
  source: readonly SemanticTrimTrack[],
  candidate: readonly SemanticTrimTrack[],
): {
  matches: Array<{ source: SemanticTrimTrack; candidate: SemanticTrimTrack }>;
  failures: string[];
} {
  const failures: string[] = [];
  const candidateByIdentity = new Map<string, SemanticTrimTrack>();
  for (const track of candidate) {
    const key = `${track.type}:${track.identity}`;
    if (candidateByIdentity.has(key)) failures.push(`duplicate candidate track identity '${key}'`);
    candidateByIdentity.set(key, track);
  }
  const matches: Array<{ source: SemanticTrimTrack; candidate: SemanticTrimTrack }> = [];
  for (const track of source) {
    const key = `${track.type}:${track.identity}`;
    const counterpart = candidateByIdentity.get(key);
    if (!counterpart) {
      failures.push(`required track '${key}' is missing`);
      continue;
    }
    matches.push({ source: track, candidate: counterpart });
    candidateByIdentity.delete(key);
  }
  for (const extra of candidateByIdentity.keys()) failures.push(`unexpected candidate track '${extra}'`);
  return { matches, failures };
}

function compareTrack(
  source: SemanticTrimTrack,
  candidate: SemanticTrimTrack,
  timestampToleranceUs: number,
  failures: string[],
): void {
  const label = `${source.type}:${source.identity}`;
  if (source.codecCanonical !== candidate.codecCanonical) {
    failures.push(`${label} codec ${candidate.codecCanonical} vs ${source.codecCanonical}`);
  }
  if (normalizeNullable(source.language) !== normalizeNullable(candidate.language)) {
    failures.push(`${label} language ${candidate.language ?? '<none>'} vs ${source.language ?? '<none>'}`);
  }
  if (source.rotationDegrees !== candidate.rotationDegrees) {
    failures.push(`${label} rotation ${candidate.rotationDegrees ?? '<unknown>'} vs ${source.rotationDegrees ?? '<unknown>'}`);
  }
  if (source.alphaMode !== candidate.alphaMode) {
    failures.push(`${label} alpha ${candidate.alphaMode ?? '<unknown>'} vs ${source.alphaMode ?? '<unknown>'}`);
  }
  if (source.samples.length !== candidate.samples.length) {
    failures.push(`${label} sample count ${candidate.samples.length} vs ${source.samples.length}`);
  }
  const count = Math.min(source.samples.length, candidate.samples.length);
  for (let index = 0; index < count; index++) {
    const want = source.samples[index]!;
    const got = candidate.samples[index]!;
    if (normalizeDigest(want.contentDigest) !== normalizeDigest(got.contentDigest)) {
      failures.push(`${label} sample ${index} content differs`);
      break;
    }
    if (Math.abs(want.ptsUs - got.ptsUs) > timestampToleranceUs ||
        Math.abs(want.durationUs - got.durationUs) > timestampToleranceUs) {
      failures.push(
        `${label} sample ${index} interval [${got.ptsUs},${got.ptsUs + got.durationUs}) vs ` +
        `[${want.ptsUs},${want.ptsUs + want.durationUs})`,
      );
      break;
    }
  }
}

function compareMetadata(
  source: Readonly<Record<string, string>> | undefined,
  candidate: Readonly<Record<string, string>> | undefined,
  failures: string[],
): void {
  for (const [key, value] of Object.entries(source ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (candidate?.[key] !== value) failures.push(`metadata '${key}' is '${candidate?.[key] ?? '<missing>'}' vs '${value}'`);
  }
}

function normalizeDigest(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeNullable(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}
