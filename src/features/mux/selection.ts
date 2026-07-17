import { muxVerdict, type MuxDecision } from './types.ts';

export const MUX_TRACK_SELECTOR_SCHEMA = 'media-test/mux-track-selector@1' as const;
export const MUX_TRACK_SELECTION_SCHEMA = 'media-test/mux-track-selection@1' as const;

export type MuxSelectableTrackType = 'video' | 'audio';

export interface ParsedMuxTrackSelector {
  readonly schema: typeof MUX_TRACK_SELECTOR_SCHEMA;
  readonly type: MuxSelectableTrackType;
  readonly typeOrdinal: number;
  readonly sourceIndex?: number;
  readonly canonical: string;
}

export type MuxContentIdentity = Readonly<{
  kind: 'payload-digest' | 'tone-frequency' | 'frame-watermark';
  value: string;
}>;

export interface MuxSourceTrackEvidence {
  readonly sourceIndex: number;
  readonly sourceAssetId: string;
  readonly sourceTrackIndex: number;
  readonly type: MuxSelectableTrackType;
  readonly typeOrdinal: number;
  readonly codec: string;
  readonly identities: readonly MuxContentIdentity[];
}

export interface MuxTrackSelectionPlan {
  readonly schema: typeof MUX_TRACK_SELECTION_SCHEMA;
  readonly selectors: readonly ParsedMuxTrackSelector[];
  readonly tracks: readonly MuxSourceTrackEvidence[];
}

export interface MuxCandidateTrackEvidence {
  /** Output-local id/order is diagnostic only and never used as semantic identity. */
  readonly outputTrackId: string;
  readonly type: MuxSelectableTrackType;
  readonly codec: string;
  readonly identities: readonly MuxContentIdentity[];
}

export function parseMuxTrackSelector(value: string): ParsedMuxTrackSelector {
  const match = /^(video|audio):(0|[1-9][0-9]*)(?:@(0|[1-9][0-9]*))?$/.exec(value);
  if (!match) {
    throw new TypeError(`invalid mux track selector ${JSON.stringify(value)}; expected video:N[@SOURCE] or audio:N[@SOURCE]`);
  }
  const type = match[1] as MuxSelectableTrackType;
  const typeOrdinal = Number(match[2]);
  const sourceIndex = match[3] === undefined ? undefined : Number(match[3]);
  if (!Number.isSafeInteger(typeOrdinal) || (sourceIndex !== undefined && !Number.isSafeInteger(sourceIndex))) {
    throw new TypeError(`mux track selector exceeds safe integer range: ${JSON.stringify(value)}`);
  }
  return Object.freeze({
    schema: MUX_TRACK_SELECTOR_SCHEMA,
    type,
    typeOrdinal,
    ...(sourceIndex !== undefined ? { sourceIndex } : {}),
    canonical: `${type}:${typeOrdinal}${sourceIndex !== undefined ? `@${sourceIndex}` : ''}`,
  });
}

/** Resolve selectors once before adapter dispatch. Ambiguous multi-source selectors are rejected. */
export function normalizeMuxTrackSelection(
  sourceTracks: readonly MuxSourceTrackEvidence[],
  selectorValues: readonly string[],
): MuxTrackSelectionPlan {
  validateSourceTracks(sourceTracks);
  const selectors = selectorValues.map(parseMuxTrackSelector);
  if (selectors.length === 0) throw new TypeError('mux track selection requires at least one explicit selector');
  const sourceCount = new Set(sourceTracks.map((track) => track.sourceIndex)).size;
  const selected: MuxSourceTrackEvidence[] = [];
  const seen = new Set<string>();
  for (const selector of selectors) {
    if (sourceCount > 1 && selector.sourceIndex === undefined) {
      throw new TypeError(`multi-source selector '${selector.canonical}' must include @SOURCE`);
    }
    const matches = sourceTracks.filter((track) =>
      track.type === selector.type &&
      track.typeOrdinal === selector.typeOrdinal &&
      (selector.sourceIndex === undefined || track.sourceIndex === selector.sourceIndex));
    if (matches.length !== 1) {
      throw new TypeError(
        `selector '${selector.canonical}' resolved to ${matches.length} tracks; exactly one is required`,
      );
    }
    const track = matches[0]!;
    const key = sourceTrackKey(track);
    if (seen.has(key)) throw new TypeError(`selector '${selector.canonical}' duplicates a selected source track`);
    seen.add(key);
    selected.push(track);
  }
  return deepFreeze({
    schema: MUX_TRACK_SELECTION_SCHEMA,
    selectors: [...selectors],
    tracks: [...selected],
  });
}

/**
 * Track order and output ids are normalized away. Type, codec family, cardinality, and independent
 * content identities (tone/watermark/payload digest) remain decisive.
 */
export function assessMuxTrackSelection(
  plan: MuxTrackSelectionPlan,
  candidates: readonly MuxCandidateTrackEvidence[],
): MuxDecision {
  const measurements = {
    requestedTracks: plan.tracks.length,
    candidateTracks: candidates.length,
    matchedTracks: 0,
  };
  if (plan.schema !== MUX_TRACK_SELECTION_SCHEMA) {
    return muxVerdict('FAIL', 'MUX_SELECTION_SCHEMA_INVALID', 'track selection plan schema is invalid', measurements);
  }
  try {
    validateSourceTracks(plan.tracks);
  } catch (error) {
    return muxVerdict(
      'FAIL',
      'MUX_SELECTION_PLAN_INVALID',
      error instanceof Error ? error.message : String(error),
      measurements,
    );
  }
  if (candidates.length !== plan.tracks.length) {
    return muxVerdict(
      'FAIL',
      'MUX_SELECTION_CARDINALITY_MISMATCH',
      `candidate has ${candidates.length} track(s); selection requires ${plan.tracks.length}`,
      measurements,
    );
  }
  try {
    for (const candidate of candidates) {
      if (!candidate.outputTrackId.trim() || !candidate.codec.trim() ||
          (candidate.type !== 'video' && candidate.type !== 'audio') || candidate.identities.length === 0) {
        throw new TypeError('candidate track identity is incomplete');
      }
      for (const identity of candidate.identities) validateIdentity(identity);
    }
  } catch (error) {
    return muxVerdict(
      'FAIL',
      'MUX_CANDIDATE_TRACK_EVIDENCE_INVALID',
      error instanceof Error ? error.message : String(error),
      measurements,
    );
  }

  const unused = new Set(candidates.map((_, index) => index));
  for (const expected of plan.tracks) {
    const matches = [...unused].filter((index) => candidateMatches(expected, candidates[index]!));
    if (matches.length !== 1) {
      const candidatesOfType = [...unused]
        .map((index) => candidates[index]!)
        .filter((track) => track.type === expected.type)
        .map((track) => `${track.outputTrackId}:${canonicalCodec(track.codec)}`)
        .join(', ');
      return muxVerdict(
        'FAIL',
        matches.length === 0 ? 'MUX_SELECTED_TRACK_IDENTITY_MISSING' : 'MUX_SELECTED_TRACK_IDENTITY_AMBIGUOUS',
        `selected ${sourceTrackKey(expected)} (${canonicalCodec(expected.codec)}) matched ${matches.length}; ` +
          `remaining ${expected.type} outputs: ${candidatesOfType || 'none'}`,
        measurements,
      );
    }
    unused.delete(matches[0]!);
    measurements.matchedTracks++;
  }
  if (unused.size > 0) {
    return muxVerdict('FAIL', 'MUX_UNSELECTED_TRACK_PRESENT', `${unused.size} unselected output track(s) remain`, measurements);
  }
  return muxVerdict(
    'PASS',
    'MUX_SEMANTIC_TRACK_SELECTION_MATCH',
    `${measurements.matchedTracks} requested track(s) match by type, codec, and content identity; output order ignored`,
    measurements,
  );
}

function candidateMatches(expected: MuxSourceTrackEvidence, candidate: MuxCandidateTrackEvidence): boolean {
  if (expected.type !== candidate.type || canonicalCodec(expected.codec) !== canonicalCodec(candidate.codec)) return false;
  const got = new Set(candidate.identities.map(identityKey));
  return expected.identities.length > 0 && expected.identities.every((identity) => got.has(identityKey(identity)));
}

function validateSourceTracks(tracks: readonly MuxSourceTrackEvidence[]): void {
  const seen = new Set<string>();
  for (const track of tracks) {
    if (!Number.isSafeInteger(track.sourceIndex) || track.sourceIndex < 0 ||
        !Number.isSafeInteger(track.sourceTrackIndex) || track.sourceTrackIndex < 0 ||
        !Number.isSafeInteger(track.typeOrdinal) || track.typeOrdinal < 0) {
      throw new TypeError('mux source track indices must be non-negative safe integers');
    }
    if (!track.sourceAssetId.trim() || !track.codec.trim()) throw new TypeError('mux source track identity is incomplete');
    if (track.identities.length === 0) throw new TypeError(`mux source track ${sourceTrackKey(track)} has no content identity`);
    for (const identity of track.identities) validateIdentity(identity);
    const key = sourceTrackKey(track);
    if (seen.has(key)) throw new TypeError(`duplicate mux source track ${key}`);
    seen.add(key);
  }
}

function validateIdentity(identity: MuxContentIdentity): void {
  if (!identity.value.trim()) throw new TypeError(`mux ${identity.kind} identity is empty`);
  if (identity.kind === 'tone-frequency') {
    const frequency = Number(identity.value);
    if (!Number.isFinite(frequency) || frequency <= 0) throw new TypeError('tone-frequency identity must be positive Hz');
  }
}

function identityKey(identity: MuxContentIdentity): string {
  validateIdentity(identity);
  return `${identity.kind}:${identity.value.trim().toLowerCase()}`;
}

function sourceTrackKey(track: MuxSourceTrackEvidence): string {
  return `${track.sourceAssetId}#${track.sourceIndex}/${track.type}:${track.typeOrdinal}`;
}

function canonicalCodec(value: string): string {
  const codec = value.trim().toLowerCase();
  if (/^(avc1|avc3)(\.|$)/.test(codec)) return 'h264';
  if (/^(hvc1|hev1)(\.|$)/.test(codec)) return 'hevc';
  if (/^mp4a\.40(?:\.|$)/.test(codec)) return 'aac';
  if (codec === 'mpeg3' || codec === 'mp3float') return 'mp3';
  return codec;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
