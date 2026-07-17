import type { FrameDigest } from '../../core/engine.ts';
import type { OracleVerdict } from '../../core/scenario.ts';
import type { EncryptionPatternContract } from './contracts.ts';

export interface IsoEncryptionTrackEvidence {
  readonly trackIndex: number;
  readonly trackId?: number;
  readonly type: 'video' | 'audio' | 'other';
  readonly sampleEntry: string | null;
  readonly originalFormat?: string;
  readonly scheme?: string;
  readonly protected: boolean;
  readonly defaultKid?: string;
  readonly ivSize?: number;
  /** Zero denotes a tenc constant-IV track; ivSize remains the effective IV width. */
  readonly perSampleIvSize?: number;
  readonly constantIvHex?: string;
  readonly cryptByteBlock?: number;
  readonly skipByteBlock?: number;
}

export interface IsoEncryptionEvidence {
  readonly state: 'OK';
  readonly tracks: readonly IsoEncryptionTrackEvidence[];
  readonly psshCount: number;
  readonly auxiliaryProtectionBoxes: readonly string[];
  readonly sampleEncryptionBoxes: number;
  readonly encryptionSampleGroups: number;
}

export type IsoEncryptionReadResult =
  | IsoEncryptionEvidence
  | { readonly state: 'MALFORMED'; readonly reasonCode: string; readonly detail: string };

export interface EncryptionEvidenceVerdict {
  readonly state: 'VERDICT';
  readonly verdict: OracleVerdict;
  readonly reasonCode: string;
  readonly detail: string;
  readonly measurements?: Readonly<Record<string, number>>;
}

interface Box {
  type: string;
  start: number;
  bodyStart: number;
  end: number;
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'moof', 'traf', 'mvex', 'mfra', 'sinf', 'schi']);
const AUXILIARY_PROTECTION = new Set(['saiz', 'saio']);
const ENCRYPTION_AUX_TYPES = new Set(['cenc', 'cens', 'cbc1', 'cbcs']);

/** Strict, no-engine ISO BMFF CENC reader. It never emits partial evidence for malformed boxes. */
export function inspectIsoBmffEncryption(bytes: Uint8Array): IsoEncryptionReadResult {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 8) {
      return malformed('ENCRYPTION_ISOBMFF_INPUT_INCOMPLETE', 'input is shorter than one ISO BMFF box');
    }
    const top = readBoxes(bytes, 0, bytes.byteLength);
    if (!top.some((box) => box.type === 'moov')) {
      return malformed('ENCRYPTION_ISOBMFF_MOOV_MISSING', 'ISO BMFF output has no moov box');
    }
    const tracks: IsoEncryptionTrackEvidence[] = [];
    let psshCount = 0;
    let sampleEncryptionBoxes = 0;
    let encryptionSampleGroups = 0;
    const auxiliary = new Set<string>();

    const walk = (box: Box, inheritedProtection = false): void => {
      let protectionContext = inheritedProtection;
      if (box.type === 'pssh') psshCount++;
      if (box.type === 'senc') sampleEncryptionBoxes++;
      if (AUXILIARY_PROTECTION.has(box.type) &&
          (protectionContext || ENCRYPTION_AUX_TYPES.has(auxiliaryInfoType(bytes, box) ?? ''))) {
        auxiliary.add(box.type);
      }
      if ((box.type === 'sgpd' || box.type === 'sbgp') && groupingType(bytes, box) === 'seig') {
        encryptionSampleGroups++;
      }
      if (box.type === 'trak') {
        const track = parseTrack(bytes, box, tracks.length);
        tracks.push(track);
        protectionContext ||= track.protected;
      }
      if (!CONTAINERS.has(box.type)) return;
      const children = readBoxes(bytes, childBodyStart(box), box.end);
      if (box.type === 'traf' && children.some((child) =>
        child.type === 'senc' ||
        ((child.type === 'sgpd' || child.type === 'sbgp') && groupingType(bytes, child) === 'seig'))) {
        protectionContext = true;
      }
      for (const child of children) walk(child, protectionContext);
    };
    for (const box of top) walk(box);

    return Object.freeze({
      state: 'OK',
      tracks: Object.freeze(tracks),
      psshCount,
      auxiliaryProtectionBoxes: Object.freeze([...auxiliary].sort()),
      sampleEncryptionBoxes,
      encryptionSampleGroups,
    });
  } catch (error) {
    return malformed('ENCRYPTION_ISOBMFF_MALFORMED', errorMessage(error));
  }
}

/**
 * Decrypt reference-reimport policy: active protection or lost tracks is FAIL; an otherwise-clear
 * file retaining only inert pssh is DIFF; a normal clear structure is PASS.
 */
export function assessClearDecryptStructure(
  bytes: Uint8Array,
  expectedTrackTypes: readonly ('video' | 'audio' | 'other')[],
): EncryptionEvidenceVerdict {
  const read = inspectIsoBmffEncryption(bytes);
  if (read.state !== 'OK') {
    return verdict('FAIL', read.reasonCode, read.detail);
  }
  const actualTypes = read.tracks.map((track) => track.type);
  const expectedCounts = typeCounts(expectedTrackTypes);
  const actualCounts = typeCounts(actualTypes);
  for (const type of ['video', 'audio', 'other'] as const) {
    if (actualCounts[type] !== expectedCounts[type]) {
      return verdict(
        'FAIL',
        'DECRYPT_TRACK_CARDINALITY_MISMATCH',
        `${type} track count ${actualCounts[type]} does not equal expected ${expectedCounts[type]}`,
        { expectedTracks: expectedTrackTypes.length, actualTracks: actualTypes.length },
      );
    }
  }

  const activeTracks = read.tracks.filter((track) => track.protected);
  const activeAux = read.sampleEncryptionBoxes + read.encryptionSampleGroups + read.auxiliaryProtectionBoxes.length;
  if (activeTracks.length > 0 || activeAux > 0) {
    const details = activeTracks.map((track) =>
      `track ${track.trackIndex} ${track.sampleEntry ?? '?'} scheme=${track.scheme ?? '?'} tenc=${track.protected}`);
    if (read.sampleEncryptionBoxes) details.push(`${read.sampleEncryptionBoxes} senc box(es)`);
    if (read.encryptionSampleGroups) details.push(`${read.encryptionSampleGroups} seig sample group(s)`);
    if (read.auxiliaryProtectionBoxes.length) {
      details.push(`auxiliary protection boxes: ${read.auxiliaryProtectionBoxes.join(', ')}`);
    }
    return verdict(
      'FAIL',
      'DECRYPT_ACTIVE_PROTECTION_REMAINS',
      details.join('; '),
      {
        activeProtectedTracks: activeTracks.length,
        sampleEncryptionBoxes: read.sampleEncryptionBoxes,
        encryptionSampleGroups: read.encryptionSampleGroups,
        auxiliaryProtectionBoxes: read.auxiliaryProtectionBoxes.length,
      },
    );
  }
  if (read.psshCount > 0) {
    return verdict(
      'PASS',
      'DECRYPT_INERT_PSSH_RETAINED',
      `clear output retains ${read.psshCount} inert pssh box(es)`,
      { psshCount: read.psshCount, tracks: read.tracks.length },
    );
  }
  return verdict(
    'PASS',
    'DECRYPT_CLEAR_STRUCTURE_VALID',
    `clear output has ${read.tracks.length} expected track(s) and no active protection`,
    { tracks: read.tracks.length },
  );
}

/** Pattern ground truth is checked independently from decoded pixels so wrong algorithms localize. */
export function assessPatternGroundTruth(
  bytes: Uint8Array,
  expected: EncryptionPatternContract,
): EncryptionEvidenceVerdict {
  const read = inspectIsoBmffEncryption(bytes);
  if (read.state !== 'OK') return verdict('FAIL', read.reasonCode, read.detail);
  const track = read.tracks.find((candidate) => candidate.protected && candidate.type === 'video');
  if (!track) return verdict('FAIL', 'PATTERN_PROTECTED_VIDEO_MISSING', 'fixture has no protected video track');
  const expectedScheme = expected.scheme === 'cenc-cens' ? 'cens' : 'cbcs';
  if (track.scheme !== expectedScheme) {
    return verdict(
      'FAIL',
      'PATTERN_SCHEME_MISMATCH',
      `${expected.boundaryVectorId}: scheme ${track.scheme ?? '?'} != ${expectedScheme}`,
    );
  }
  if (track.cryptByteBlock !== expected.cryptByteBlock) {
    return verdict(
      'FAIL',
      'PATTERN_BLOCK_PATTERN_MISMATCH',
      `${expected.boundaryVectorId}: crypt ${track.cryptByteBlock ?? '?'} != ${expected.cryptByteBlock}`,
    );
  }
  if (track.skipByteBlock !== expected.skipByteBlock) {
    return verdict(
      'FAIL',
      'PATTERN_BLOCK_PATTERN_MISMATCH',
      `${expected.boundaryVectorId}: skip ${track.skipByteBlock ?? '?'} != ${expected.skipByteBlock}`,
    );
  }
  if (track.ivSize !== expected.ivSize) {
    return verdict(
      'FAIL',
      'PATTERN_IV_RULE_MISMATCH',
      `${expected.boundaryVectorId}: IV size ${track.ivSize ?? '?'} != ${expected.ivSize}`,
    );
  }
  if (expected.ivRule === 'constant' && !track.constantIvHex) {
    return verdict(
      'FAIL',
      'PATTERN_IV_RULE_MISMATCH',
      `${expected.boundaryVectorId}: constant IV is missing`,
    );
  }
  if (expected.ivRule === 'per-sample' && track.constantIvHex) {
    return verdict(
      'FAIL',
      'PATTERN_IV_RULE_MISMATCH',
      `${expected.boundaryVectorId}: unexpected constant IV`,
    );
  }

  const boundary = inspectPatternBoundaryEvidence(bytes, expected);
  if (boundary.state !== 'OK') {
    return verdict('FAIL', boundary.reasonCode, `${expected.boundaryVectorId}: ${boundary.detail}`);
  }
  if (boundary.scheme !== expected.scheme) {
    return verdict(
      'FAIL',
      'PATTERN_SCHEME_MISMATCH',
      `${expected.boundaryVectorId}: sample map scheme ${boundary.scheme} != ${expected.scheme}`,
    );
  }
  if (boundary.explicitSubsampleCount === 0 && boundary.implicitWholeSampleCount === 0) {
    return verdict(
      'FAIL',
      'PATTERN_SAMPLE_MAP_EMPTY',
      `${expected.boundaryVectorId}: no explicit or implicit sample protection map`,
    );
  }
  if (expected.fixtureBoundaryVectors && !expected.fixtureBoundaryVectors.some((vector) =>
    vector.sampleCount === boundary.sampleCount &&
    sameSubsampleSpans(vector.firstBoundarySubsamples, boundary.firstBoundarySubsamples))) {
    return verdict(
      'FAIL',
      'PATTERN_BOUNDARY_VECTOR_MISMATCH',
      `${expected.boundaryVectorId}: sample count ${boundary.sampleCount}, first boundary ` +
      `${formatSubsampleSpans(boundary.firstBoundarySubsamples)} is not a committed corpus vector`,
    );
  }
  if (boundary.encryptedBlocks === 0 || boundary.clearPatternBlocks === 0 ||
      boundary.encryptedToClearTransitions === 0 || boundary.clearToEncryptedTransitions === 0) {
    return verdict(
      'FAIL',
      'PATTERN_BOUNDARY_TRANSITION_MISSING',
      `${expected.boundaryVectorId}: encrypted blocks=${boundary.encryptedBlocks}, ` +
      `clear pattern blocks=${boundary.clearPatternBlocks}, encrypted→clear=` +
      `${boundary.encryptedToClearTransitions}, clear→encrypted=${boundary.clearToEncryptedTransitions}`,
    );
  }
  return verdict(
    'PASS',
    'PATTERN_GROUND_TRUTH_MATCH',
    `${expected.boundaryVectorId}: ${expectedScheme} ${expected.cryptByteBlock}:${expected.skipByteBlock}, ` +
    `IV ${expected.ivSize}; ${boundary.sampleCount} sample(s), ` +
    `${boundary.encryptedToClearTransitions} encrypted→clear and ` +
    `${boundary.clearToEncryptedTransitions} clear→encrypted transition(s)`,
    {
      samples: boundary.sampleCount,
      explicitSubsamples: boundary.explicitSubsampleCount,
      implicitWholeSamples: boundary.implicitWholeSampleCount,
      clearBytes: boundary.clearBytes,
      protectedBytes: boundary.protectedBytes,
      encryptedBlocks: boundary.encryptedBlocks,
      clearPatternBlocks: boundary.clearPatternBlocks,
      encryptedToClearTransitions: boundary.encryptedToClearTransitions,
      clearToEncryptedTransitions: boundary.clearToEncryptedTransitions,
    },
  );
}

export interface PatternBoundaryObservation {
  readonly scheme: 'cenc-cens' | 'cenc-cbcs';
  readonly cryptByteBlock: number;
  readonly skipByteBlock: number;
  readonly ivSize: number;
  readonly subsamples: readonly Readonly<{ clearBytes: number; protectedBytes: number }>[];
}

export interface PatternBoundaryEvidence {
  readonly state: 'OK';
  readonly scheme: 'cenc-cens' | 'cenc-cbcs';
  readonly trackIndex: number;
  readonly trackId?: number;
  readonly sampleCount: number;
  readonly explicitSubsampleCount: number;
  readonly implicitWholeSampleCount: number;
  readonly clearBytes: number;
  readonly protectedBytes: number;
  readonly encryptedBlocks: number;
  readonly clearPatternBlocks: number;
  readonly encryptedToClearTransitions: number;
  readonly clearToEncryptedTransitions: number;
  readonly firstBoundarySubsamples: readonly Readonly<{
    clearBytes: number;
    protectedBytes: number;
  }>[];
}

export type PatternBoundaryReadResult =
  | PatternBoundaryEvidence
  | {
      readonly state: 'MISSING' | 'MALFORMED';
      readonly reasonCode: string;
      readonly detail: string;
    };

interface PatternSampleEvidence {
  readonly sampleSize: number;
  readonly subsamples: readonly Readonly<{ clearBytes: number; protectedBytes: number }>[];
  readonly explicitSubsamples: boolean;
}

/**
 * Read the actual CENS/CBCS protection map used by the encrypted fixture. Fragmented inputs are
 * joined by track_ID across moov/trak and moof/traf, then every senc clear+protected span is checked
 * against its trun sample size. A non-fragmented constant-IV CBCS file may omit senc; in that form
 * tenc applies the pattern to each complete stsz sample and the whole-sample map is explicit by
 * construction. No engine or authored observation participates in this evidence.
 */
export function inspectPatternBoundaryEvidence(
  bytes: Uint8Array,
  expected: EncryptionPatternContract,
): PatternBoundaryReadResult {
  try {
    const top = readBoxes(bytes, 0, bytes.byteLength);
    const moov = top.find((box) => box.type === 'moov');
    if (!moov) return patternMissing('PATTERN_MOOV_MISSING', 'pattern fixture has no moov box');
    const details = readPatternTrackDetails(bytes, moov);
    if (!details) {
      return patternMissing(
        'PATTERN_PROTECTED_VIDEO_MISSING',
        'fixture has no protected video track with tenc evidence',
      );
    }

    const scheme = details.track.scheme === 'cens'
      ? 'cenc-cens'
      : details.track.scheme === 'cbcs'
        ? 'cenc-cbcs'
        : undefined;
    if (!scheme) {
      return patternMissing(
        'PATTERN_SCHEME_UNSUPPORTED',
        `protected video scheme '${details.track.scheme ?? '?'}' is not CENS or CBCS`,
      );
    }

    const samples: PatternSampleEvidence[] = [];
    const moofs = top.filter((box) => box.type === 'moof');
    for (const moof of moofs) {
      for (const traf of readBoxes(bytes, moof.bodyStart, moof.end).filter((box) => box.type === 'traf')) {
        const tfhd = child(bytes, traf, 'tfhd');
        if (!tfhd) throw patternError('PATTERN_TFHD_MISSING', 'fragment traf has no tfhd box');
        const fragmentTrackId = parseTfhdTrackId(bytes, tfhd);
        if (details.track.trackId !== undefined && fragmentTrackId !== details.track.trackId) continue;
        const sampleSizes = parseFragmentSampleSizes(bytes, traf, tfhd);
        const senc = child(bytes, traf, 'senc');
        if (!senc) {
          throw patternError(
            'PATTERN_SAMPLE_ENCRYPTION_METADATA_MISSING',
            `protected fragment for track ${fragmentTrackId} has no senc box`,
          );
        }
        samples.push(...parseSencSamples(bytes, senc, sampleSizes, details.perSampleIvSize));
      }
    }

    if (moofs.length === 0) {
      const sampleSizes = parseSampleSizes(bytes, details.stbl);
      const senc = child(bytes, details.stbl, 'senc');
      if (senc) {
        samples.push(...parseSencSamples(bytes, senc, sampleSizes, details.perSampleIvSize));
      } else if (details.perSampleIvSize === 0 && details.track.constantIvHex) {
        for (const sampleSize of sampleSizes) {
          samples.push({
            sampleSize,
            subsamples: Object.freeze([{ clearBytes: 0, protectedBytes: sampleSize }]),
            explicitSubsamples: false,
          });
        }
      } else {
        throw patternError(
          'PATTERN_SAMPLE_ENCRYPTION_METADATA_MISSING',
          'per-sample-IV pattern track has neither senc records nor a valid implicit constant-IV map',
        );
      }
    }

    if (samples.length === 0) {
      return patternMissing('PATTERN_SAMPLE_MAP_EMPTY', 'pattern fixture contains no protected video samples');
    }
    const crypt = details.track.cryptByteBlock ?? 0;
    const skip = details.track.skipByteBlock ?? 0;
    let explicitSubsampleCount = 0;
    let implicitWholeSampleCount = 0;
    let clearBytes = 0;
    let protectedBytes = 0;
    let encryptedBlocks = 0;
    let clearPatternBlocks = 0;
    let encryptedToClearTransitions = 0;
    let clearToEncryptedTransitions = 0;
    let firstBoundarySubsamples: PatternBoundaryEvidence['firstBoundarySubsamples'] = Object.freeze([]);
    for (const sample of samples) {
      if (sample.explicitSubsamples) explicitSubsampleCount += sample.subsamples.length;
      else implicitWholeSampleCount++;
      let hasBoundary = false;
      for (const span of sample.subsamples) {
        clearBytes += span.clearBytes;
        protectedBytes += span.protectedBytes;
        const block = patternBlockTransitions(span.protectedBytes, crypt, skip);
        encryptedBlocks += block.encryptedBlocks;
        clearPatternBlocks += block.clearBlocks;
        encryptedToClearTransitions += block.encryptedToClear;
        clearToEncryptedTransitions += block.clearToEncrypted;
        hasBoundary ||= block.encryptedToClear > 0 || block.clearToEncrypted > 0;
      }
      if (firstBoundarySubsamples.length === 0 && hasBoundary) {
        firstBoundarySubsamples = Object.freeze(sample.subsamples.map((span) => Object.freeze({ ...span })));
      }
    }

    return Object.freeze({
      state: 'OK',
      scheme,
      trackIndex: details.track.trackIndex,
      ...(details.track.trackId !== undefined ? { trackId: details.track.trackId } : {}),
      sampleCount: samples.length,
      explicitSubsampleCount,
      implicitWholeSampleCount,
      clearBytes,
      protectedBytes,
      encryptedBlocks,
      clearPatternBlocks,
      encryptedToClearTransitions,
      clearToEncryptedTransitions,
      firstBoundarySubsamples,
    });
  } catch (error) {
    if (error instanceof PatternEvidenceError) {
      return Object.freeze({
        state: 'MALFORMED',
        reasonCode: error.reasonCode,
        detail: error.message,
      });
    }
    return Object.freeze({
      state: 'MALFORMED',
      reasonCode: 'PATTERN_BOUNDARY_EVIDENCE_MALFORMED',
      detail: errorMessage(error),
    });
  }
}

/** Deterministic decrypt-vector assertion used to localize pattern and subsample boundary mutations. */
export function assessPatternBoundaryObservation(
  expected: EncryptionPatternContract,
  observed: PatternBoundaryObservation,
): EncryptionEvidenceVerdict {
  const mismatches: string[] = [];
  if (observed.scheme !== expected.scheme) mismatches.push(`scheme ${observed.scheme} != ${expected.scheme}`);
  if (observed.cryptByteBlock !== expected.cryptByteBlock) {
    mismatches.push(`crypt ${observed.cryptByteBlock} != ${expected.cryptByteBlock}`);
  }
  if (observed.skipByteBlock !== expected.skipByteBlock) {
    mismatches.push(`skip ${observed.skipByteBlock} != ${expected.skipByteBlock}`);
  }
  if (observed.ivSize !== expected.ivSize) mismatches.push(`IV size ${observed.ivSize} != ${expected.ivSize}`);
  if (observed.subsamples.length !== expected.boundarySubsamples.length) {
    mismatches.push(`subsample count ${observed.subsamples.length} != ${expected.boundarySubsamples.length}`);
  } else {
    for (let index = 0; index < expected.boundarySubsamples.length; index++) {
      const got = observed.subsamples[index]!;
      const want = expected.boundarySubsamples[index]!;
      if (got.clearBytes !== want.clearBytes || got.protectedBytes !== want.protectedBytes) {
        mismatches.push(
          `subsample ${index} clear:protected ${got.clearBytes}:${got.protectedBytes} != ` +
          `${want.clearBytes}:${want.protectedBytes}`,
        );
      }
    }
  }
  return mismatches.length > 0
    ? verdict('FAIL', 'PATTERN_BOUNDARY_VECTOR_MISMATCH', `${expected.boundaryVectorId}: ${mismatches.join('; ')}`)
    : verdict('PASS', 'PATTERN_BOUNDARY_VECTOR_MATCH', `${expected.boundaryVectorId}: exact pattern/subsample vector`);
}

export interface PresentationComparisonOptions {
  readonly timestampToleranceUs?: number;
  readonly partialPrefix?: {
    readonly minimumFrames: number;
  };
}

/** Complete frame cardinality + timeline comparison; it never caps candidate decode to reference N. */
export function compareCompleteDecryptPresentation(
  candidate: readonly FrameDigest[],
  reference: readonly FrameDigest[],
  options: PresentationComparisonOptions = {},
): EncryptionEvidenceVerdict {
  const toleranceUs = options.timestampToleranceUs ?? 21_000;
  if (!Number.isFinite(toleranceUs) || toleranceUs < 0) {
    throw new TypeError('timestampToleranceUs must be finite and non-negative');
  }
  const partial = options.partialPrefix;
  if (partial && (!Number.isSafeInteger(partial.minimumFrames) || partial.minimumFrames <= 0)) {
    throw new TypeError('partialPrefix.minimumFrames must be a positive safe integer');
  }
  if (candidate.length === 0 || reference.length === 0) {
    return verdict(
      'FAIL',
      'DECRYPT_PRESENTATION_EMPTY',
      `candidate/reference frame counts are ${candidate.length}/${reference.length}`,
      { candidateFrames: candidate.length, referenceFrames: reference.length },
    );
  }
  if (hasDuplicateIndexes(candidate) || hasDuplicateIndexes(reference)) {
    return verdict('FAIL', 'DECRYPT_FRAME_INDEX_DUPLICATE', 'candidate or reference contains duplicate frame indexes');
  }
  if (!partial && candidate.length !== reference.length) {
    return verdict(
      'FAIL',
      'DECRYPT_FRAME_CARDINALITY_MISMATCH',
      `candidate emitted ${candidate.length} frame(s), reference has ${reference.length}`,
      { candidateFrames: candidate.length, referenceFrames: reference.length },
    );
  }
  if (partial && (candidate.length < partial.minimumFrames || candidate.length > reference.length)) {
    return verdict(
      'FAIL',
      'DECRYPT_PARTIAL_CARDINALITY_INVALID',
      `partial candidate count ${candidate.length} is outside ${partial.minimumFrames}..${reference.length}`,
    );
  }

  const compareCount = partial ? candidate.length : reference.length;
  let maxResidualUs = 0;
  for (let index = 0; index < compareCount; index++) {
    const got = candidate[index]!;
    const want = reference[index]!;
    if (got.index !== want.index) {
      return verdict('FAIL', 'DECRYPT_FRAME_ORDER_MISMATCH', `position ${index}: frame index ${got.index} != ${want.index}`);
    }
    const residualUs = Math.abs(got.ptsUs - want.ptsUs);
    maxResidualUs = Math.max(maxResidualUs, residualUs);
    if (residualUs > toleranceUs) {
      return verdict(
        'FAIL',
        'DECRYPT_FRAME_TIMELINE_MISMATCH',
        `frame ${got.index}: timestamp residual ${residualUs}us exceeds ${toleranceUs}us`,
      );
    }
    if (normalizeHex(got.sha256) !== normalizeHex(want.sha256)) {
      return verdict(
        'FAIL',
        'DECRYPT_FRAME_DIGEST_MISMATCH',
        `frame ${got.index}: decoded digest differs`,
      );
    }
  }
  return verdict(
    'PASS',
    partial ? 'DECRYPT_SAFE_PARTIAL_PREFIX_VALID' : 'DECRYPT_COMPLETE_PRESENTATION_VALID',
    `${compareCount} presentation-ordered frame(s) match; max timestamp residual ${maxResidualUs}us`,
    { candidateFrames: candidate.length, referenceFrames: reference.length, maxTimestampResidualUs: maxResidualUs },
  );
}

interface PatternTrackDetails {
  readonly track: IsoEncryptionTrackEvidence;
  readonly stbl: Box;
  readonly perSampleIvSize: number;
}

class PatternEvidenceError extends Error {
  constructor(
    readonly reasonCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'PatternEvidenceError';
  }
}

function patternError(reasonCode: string, detail: string): PatternEvidenceError {
  return new PatternEvidenceError(reasonCode, detail);
}

function patternMissing(
  reasonCode: string,
  detail: string,
): { readonly state: 'MISSING'; readonly reasonCode: string; readonly detail: string } {
  return Object.freeze({ state: 'MISSING', reasonCode, detail });
}

function readPatternTrackDetails(bytes: Uint8Array, moov: Box): PatternTrackDetails | undefined {
  const traks = readBoxes(bytes, moov.bodyStart, moov.end).filter((box) => box.type === 'trak');
  for (let trackIndex = 0; trackIndex < traks.length; trackIndex++) {
    const trak = traks[trackIndex]!;
    const track = parseTrack(bytes, trak, trackIndex);
    if (!track.protected || track.type !== 'video') continue;
    const mdia = child(bytes, trak, 'mdia');
    const stbl = mdia ? path(bytes, mdia, ['minf', 'stbl']) : undefined;
    if (!stbl) throw patternError('PATTERN_SAMPLE_TABLE_MISSING', 'protected video track has no stbl box');
    return {
      track,
      stbl,
      perSampleIvSize: track.perSampleIvSize ?? track.ivSize ?? 0,
    };
  }
  return undefined;
}

function parseTkhdTrackId(bytes: Uint8Array, box: Box): number {
  if (box.bodyStart + 4 > box.end) throw new Error('truncated tkhd full-box header');
  const version = bytes[box.bodyStart]!;
  const offset = box.bodyStart + (version === 1 ? 20 : version === 0 ? 12 : -1);
  if (offset < box.bodyStart || offset + 4 > box.end) throw new Error(`unsupported or truncated tkhd version ${version}`);
  return u32(bytes, offset);
}

function parseTfhdTrackId(bytes: Uint8Array, box: Box): number {
  if (box.bodyStart + 8 > box.end) throw patternError('PATTERN_TFHD_TRUNCATED', 'truncated tfhd track ID');
  return u32(bytes, box.bodyStart + 4);
}

function parseFragmentSampleSizes(bytes: Uint8Array, traf: Box, tfhd: Box): number[] {
  const defaultSampleSize = parseTfhdDefaultSampleSize(bytes, tfhd);
  const truns = readBoxes(bytes, traf.bodyStart, traf.end).filter((box) => box.type === 'trun');
  if (truns.length === 0) throw patternError('PATTERN_TRUN_MISSING', 'protected fragment has no trun box');
  return truns.flatMap((trun) => parseTrunSampleSizes(bytes, trun, defaultSampleSize));
}

function parseTfhdDefaultSampleSize(bytes: Uint8Array, box: Box): number | undefined {
  const flags = fullBoxFlags(bytes, box);
  let offset = box.bodyStart + 8; // full-box header + track_ID
  if (flags & 0x000001) offset += 8; // base_data_offset
  if (flags & 0x000002) offset += 4; // sample_description_index
  if (flags & 0x000008) offset += 4; // default_sample_duration
  let value: number | undefined;
  if (flags & 0x000010) {
    requireBytes(offset, 4, box.end, 'tfhd default_sample_size');
    value = u32(bytes, offset);
    offset += 4;
  }
  if (flags & 0x000020) offset += 4; // default_sample_flags
  if (offset > box.end) throw patternError('PATTERN_TFHD_TRUNCATED', 'truncated tfhd optional fields');
  return value;
}

function parseTrunSampleSizes(bytes: Uint8Array, box: Box, defaultSampleSize?: number): number[] {
  const flags = fullBoxFlags(bytes, box);
  requireBytes(box.bodyStart + 4, 4, box.end, 'trun sample_count');
  const count = u32(bytes, box.bodyStart + 4);
  if (count > 1_000_000) throw patternError('PATTERN_SAMPLE_COUNT_EXCESSIVE', `trun sample count ${count} is unsafe`);
  let offset = box.bodyStart + 8;
  if (flags & 0x000001) offset += 4; // data_offset
  if (flags & 0x000004) offset += 4; // first_sample_flags
  const sizes: number[] = [];
  for (let index = 0; index < count; index++) {
    if (flags & 0x000100) offset += 4; // sample_duration
    let sampleSize = defaultSampleSize;
    if (flags & 0x000200) {
      requireBytes(offset, 4, box.end, `trun sample ${index} size`);
      sampleSize = u32(bytes, offset);
      offset += 4;
    }
    if (flags & 0x000400) offset += 4; // sample_flags
    if (flags & 0x000800) offset += 4; // sample_composition_time_offset
    if (offset > box.end) throw patternError('PATTERN_TRUN_TRUNCATED', `truncated trun sample ${index}`);
    if (sampleSize === undefined || sampleSize <= 0) {
      throw patternError('PATTERN_SAMPLE_SIZE_MISSING', `trun sample ${index} has no positive sample size`);
    }
    sizes.push(sampleSize);
  }
  if (offset !== box.end) {
    throw patternError('PATTERN_TRUN_TRAILING_BYTES', `trun has ${box.end - offset} unparsed byte(s)`);
  }
  return sizes;
}

function parseSampleSizes(bytes: Uint8Array, stbl: Box): number[] {
  const stsz = child(bytes, stbl, 'stsz');
  if (!stsz) throw patternError('PATTERN_STSZ_MISSING', 'non-fragmented protected video track has no stsz box');
  requireBytes(stsz.bodyStart + 4, 8, stsz.end, 'stsz header');
  const uniformSize = u32(bytes, stsz.bodyStart + 4);
  const count = u32(bytes, stsz.bodyStart + 8);
  if (count > 1_000_000) throw patternError('PATTERN_SAMPLE_COUNT_EXCESSIVE', `stsz sample count ${count} is unsafe`);
  if (uniformSize > 0) return Array.from({ length: count }, () => uniformSize);
  requireBytes(stsz.bodyStart + 12, count * 4, stsz.end, 'stsz sample sizes');
  const sizes: number[] = [];
  for (let index = 0; index < count; index++) {
    const value = u32(bytes, stsz.bodyStart + 12 + index * 4);
    if (value <= 0) throw patternError('PATTERN_SAMPLE_SIZE_MISSING', `stsz sample ${index} has zero size`);
    sizes.push(value);
  }
  return sizes;
}

function parseSencSamples(
  bytes: Uint8Array,
  box: Box,
  sampleSizes: readonly number[],
  defaultIvSize: number,
): PatternSampleEvidence[] {
  const flags = fullBoxFlags(bytes, box);
  let offset = box.bodyStart + 4;
  let ivSize = defaultIvSize;
  if (flags & 0x000001) {
    requireBytes(offset, 20, box.end, 'senc override parameters');
    ivSize = bytes[offset + 3]!;
    offset += 20;
  }
  requireBytes(offset, 4, box.end, 'senc sample_count');
  const count = u32(bytes, offset);
  offset += 4;
  if (count !== sampleSizes.length) {
    throw patternError(
      'PATTERN_SAMPLE_COUNT_MISMATCH',
      `senc declares ${count} sample(s), trun/stsz declares ${sampleSizes.length}`,
    );
  }
  const samples: PatternSampleEvidence[] = [];
  for (let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
    requireBytes(offset, ivSize, box.end, `senc sample ${sampleIndex} IV`);
    offset += ivSize;
    const sampleSize = sampleSizes[sampleIndex]!;
    let subsamples: Array<{ clearBytes: number; protectedBytes: number }>;
    const explicitSubsamples = (flags & 0x000002) !== 0;
    if (explicitSubsamples) {
      requireBytes(offset, 2, box.end, `senc sample ${sampleIndex} subsample_count`);
      const subsampleCount = u16(bytes, offset);
      offset += 2;
      if (subsampleCount > 16_384) {
        throw patternError(
          'PATTERN_SUBSAMPLE_COUNT_EXCESSIVE',
          `senc sample ${sampleIndex} subsample count ${subsampleCount} is unsafe`,
        );
      }
      subsamples = [];
      for (let subsampleIndex = 0; subsampleIndex < subsampleCount; subsampleIndex++) {
        requireBytes(offset, 6, box.end, `senc sample ${sampleIndex} subsample ${subsampleIndex}`);
        subsamples.push({ clearBytes: u16(bytes, offset), protectedBytes: u32(bytes, offset + 2) });
        offset += 6;
      }
      if (subsamples.length === 0) subsamples.push({ clearBytes: 0, protectedBytes: sampleSize });
    } else {
      subsamples = [{ clearBytes: 0, protectedBytes: sampleSize }];
    }
    const describedSize = subsamples.reduce((sum, span) => sum + span.clearBytes + span.protectedBytes, 0);
    if (describedSize !== sampleSize) {
      throw patternError(
        'PATTERN_SAMPLE_SPAN_SIZE_MISMATCH',
        `sample ${sampleIndex} clear+protected span ${describedSize} does not equal sample size ${sampleSize}`,
      );
    }
    samples.push({
      sampleSize,
      subsamples: Object.freeze(subsamples.map((span) => Object.freeze(span))),
      explicitSubsamples,
    });
  }
  if (offset !== box.end) {
    throw patternError('PATTERN_SENC_TRAILING_BYTES', `senc has ${box.end - offset} unparsed byte(s)`);
  }
  return samples;
}

function patternBlockTransitions(
  protectedBytes: number,
  cryptByteBlock: number,
  skipByteBlock: number,
): {
  encryptedBlocks: number;
  clearBlocks: number;
  encryptedToClear: number;
  clearToEncrypted: number;
} {
  const fullBlocks = Math.floor(protectedBytes / 16);
  const cycle = cryptByteBlock + skipByteBlock;
  if (fullBlocks <= 0 || cryptByteBlock <= 0 || skipByteBlock <= 0 || cycle <= 0) {
    return { encryptedBlocks: 0, clearBlocks: 0, encryptedToClear: 0, clearToEncrypted: 0 };
  }
  const cycles = Math.floor(fullBlocks / cycle);
  const remainder = fullBlocks % cycle;
  const encryptedBlocks = cycles * cryptByteBlock + Math.min(remainder, cryptByteBlock);
  const clearBlocks = cycles * skipByteBlock + Math.max(0, remainder - cryptByteBlock);
  const encryptedToClear = fullBlocks > cryptByteBlock
    ? Math.floor((fullBlocks - 1 - cryptByteBlock) / cycle) + 1
    : 0;
  const clearToEncrypted = fullBlocks > cycle ? Math.floor((fullBlocks - 1) / cycle) : 0;
  return { encryptedBlocks, clearBlocks, encryptedToClear, clearToEncrypted };
}

function sameSubsampleSpans(
  left: readonly Readonly<{ clearBytes: number; protectedBytes: number }>[],
  right: readonly Readonly<{ clearBytes: number; protectedBytes: number }>[],
): boolean {
  return left.length === right.length && left.every((span, index) =>
    span.clearBytes === right[index]?.clearBytes && span.protectedBytes === right[index]?.protectedBytes);
}

function formatSubsampleSpans(
  spans: readonly Readonly<{ clearBytes: number; protectedBytes: number }>[],
): string {
  return spans.map((span) => `${span.clearBytes}:${span.protectedBytes}`).join(',') || '<none>';
}

function fullBoxFlags(bytes: Uint8Array, box: Box): number {
  requireBytes(box.bodyStart, 4, box.end, `${box.type} full-box header`);
  return ((bytes[box.bodyStart + 1] ?? 0) << 16) |
    ((bytes[box.bodyStart + 2] ?? 0) << 8) |
    (bytes[box.bodyStart + 3] ?? 0);
}

function requireBytes(offset: number, length: number, end: number, label: string): void {
  if (!Number.isSafeInteger(length) || length < 0 || offset < 0 || offset + length > end) {
    throw patternError('PATTERN_BOUNDARY_EVIDENCE_TRUNCATED', `truncated ${label}`);
  }
}

function parseTrack(bytes: Uint8Array, trak: Box, trackIndex: number): IsoEncryptionTrackEvidence {
  const tkhd = child(bytes, trak, 'tkhd');
  const trackId = tkhd ? parseTkhdTrackId(bytes, tkhd) : undefined;
  const mdia = child(bytes, trak, 'mdia');
  const hdlr = mdia ? child(bytes, mdia, 'hdlr') : undefined;
  const handler = hdlr && hdlr.bodyStart + 12 <= hdlr.end ? ascii(bytes, hdlr.bodyStart + 8, 4) : '';
  const type = handler === 'vide' ? 'video' : handler === 'soun' ? 'audio' : 'other';
  const stsd = mdia ? path(bytes, mdia, ['minf', 'stbl', 'stsd']) : undefined;
  const entries = stsd ? sampleEntries(bytes, stsd) : [];
  const entry = entries.find((candidate) =>
    candidate.type === 'encv' || candidate.type === 'enca' || candidate.type === 'encs') ?? entries[0];
  if (!entry) {
    return Object.freeze({
      trackIndex,
      ...(trackId !== undefined ? { trackId } : {}),
      type,
      sampleEntry: null,
      protected: false,
    });
  }

  const protectedEntry = entries.some((candidate) =>
    candidate.type === 'encv' || candidate.type === 'enca' || candidate.type === 'encs');
  const sinf = findEmbeddedBox(bytes, entry, 'sinf');
  const frma = sinf ? child(bytes, sinf, 'frma') : undefined;
  const schm = sinf ? child(bytes, sinf, 'schm') : undefined;
  const schi = sinf ? child(bytes, sinf, 'schi') : undefined;
  const tenc = schi ? child(bytes, schi, 'tenc') : undefined;
  const parsedTenc = tenc ? parseTenc(bytes, tenc) : undefined;
  const scheme = schm && schm.bodyStart + 8 <= schm.end ? ascii(bytes, schm.bodyStart + 4, 4) : undefined;
  const originalFormat = frma && frma.bodyStart + 4 <= frma.end ? ascii(bytes, frma.bodyStart, 4) : undefined;
  return Object.freeze({
    trackIndex,
    ...(trackId !== undefined ? { trackId } : {}),
    type,
    sampleEntry: entry.type,
    ...(originalFormat ? { originalFormat } : {}),
    ...(scheme ? { scheme } : {}),
    protected: protectedEntry || parsedTenc?.protected === true,
    ...(parsedTenc?.kid ? { defaultKid: parsedTenc.kid } : {}),
    ...(parsedTenc?.ivSize !== undefined ? { ivSize: parsedTenc.ivSize } : {}),
    ...(parsedTenc?.perSampleIvSize !== undefined ? { perSampleIvSize: parsedTenc.perSampleIvSize } : {}),
    ...(parsedTenc?.constantIvHex ? { constantIvHex: parsedTenc.constantIvHex } : {}),
    ...(parsedTenc?.cryptByteBlock !== undefined ? { cryptByteBlock: parsedTenc.cryptByteBlock } : {}),
    ...(parsedTenc?.skipByteBlock !== undefined ? { skipByteBlock: parsedTenc.skipByteBlock } : {}),
  });
}

function parseTenc(bytes: Uint8Array, box: Box): {
  protected: boolean;
  ivSize: number;
  perSampleIvSize: number;
  kid: string;
  cryptByteBlock: number;
  skipByteBlock: number;
  constantIvHex?: string;
} {
  if (box.end - box.bodyStart < 24) throw new Error('truncated tenc box');
  const version = bytes[box.bodyStart]!;
  if (version > 1) throw new Error(`unsupported tenc version ${version}`);
  const pattern = bytes[box.bodyStart + 5]!;
  const protectedValue = bytes[box.bodyStart + 6]!;
  const ivSize = bytes[box.bodyStart + 7]!;
  const kid = hex(bytes.subarray(box.bodyStart + 8, box.bodyStart + 24));
  let constantIvHex: string | undefined;
  if (protectedValue === 1 && ivSize === 0) {
    if (box.bodyStart + 25 > box.end) throw new Error('truncated tenc constant-IV size');
    const size = bytes[box.bodyStart + 24]!;
    if (box.bodyStart + 25 + size > box.end) throw new Error('truncated tenc constant IV');
    constantIvHex = hex(bytes.subarray(box.bodyStart + 25, box.bodyStart + 25 + size));
  }
  return {
    protected: protectedValue === 1,
    ivSize: ivSize === 0 && constantIvHex ? constantIvHex.length / 2 : ivSize,
    perSampleIvSize: ivSize,
    kid,
    cryptByteBlock: version === 1 ? pattern >> 4 : 0,
    skipByteBlock: version === 1 ? pattern & 0x0f : 0,
    ...(constantIvHex ? { constantIvHex } : {}),
  };
}

function sampleEntries(bytes: Uint8Array, stsd: Box): Box[] {
  if (stsd.bodyStart + 8 > stsd.end) throw new Error('truncated stsd header');
  const count = u32(bytes, stsd.bodyStart + 4);
  const entries = readBoxes(bytes, stsd.bodyStart + 8, stsd.end);
  if (entries.length !== count) throw new Error(`stsd declares ${count} entries but contains ${entries.length}`);
  return entries;
}

function findEmbeddedBox(bytes: Uint8Array, parent: Box, type: string): Box | undefined {
  for (let offset = parent.bodyStart; offset + 8 <= parent.end; offset++) {
    if (ascii(bytes, offset + 4, 4) !== type) continue;
    const size = u32(bytes, offset);
    if (size >= 8 && offset + size <= parent.end) {
      return { type, start: offset, bodyStart: offset + 8, end: offset + size };
    }
  }
  return undefined;
}

function child(bytes: Uint8Array, parent: Box, type: string): Box | undefined {
  return readBoxes(bytes, childBodyStart(parent), parent.end).find((box) => box.type === type);
}

function path(bytes: Uint8Array, root: Box, names: readonly string[]): Box | undefined {
  let current: Box | undefined = root;
  for (const name of names) {
    if (!current) return undefined;
    current = child(bytes, current, name);
  }
  return current;
}

function childBodyStart(box: Box): number {
  return box.type === 'meta' ? box.bodyStart + 4 : box.bodyStart;
}

function readBoxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  let guard = 0;
  while (offset < end) {
    if (offset + 8 > end) throw new Error(`truncated ISO box header at ${offset}`);
    if (guard++ > 100_000) throw new Error('ISO box count exceeds safety limit');
    const size32 = u32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > end) throw new Error(`truncated large ISO box at ${offset}`);
      size = u64(bytes, offset + 8);
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (size < headerSize || !Number.isSafeInteger(size) || offset + size > end) {
      throw new Error(`invalid ${JSON.stringify(type)} box size ${size} at ${offset}`);
    }
    boxes.push({ type, start: offset, bodyStart: offset + headerSize, end: offset + size });
    offset += size;
  }
  return boxes;
}

function groupingType(bytes: Uint8Array, box: Box): string | undefined {
  return box.bodyStart + 8 <= box.end ? ascii(bytes, box.bodyStart + 4, 4) : undefined;
}

function auxiliaryInfoType(bytes: Uint8Array, box: Box): string | undefined {
  if (box.bodyStart + 4 > box.end) throw new Error(`truncated ${box.type} full-box header`);
  const flags = ((bytes[box.bodyStart + 1] ?? 0) << 16) |
    ((bytes[box.bodyStart + 2] ?? 0) << 8) |
    (bytes[box.bodyStart + 3] ?? 0);
  if ((flags & 1) === 0) return undefined;
  if (box.bodyStart + 12 > box.end) throw new Error(`truncated ${box.type} auxiliary-info type`);
  return ascii(bytes, box.bodyStart + 4, 4);
}

function typeCounts(types: readonly ('video' | 'audio' | 'other')[]): Record<'video' | 'audio' | 'other', number> {
  const out = { video: 0, audio: 0, other: 0 };
  for (const type of types) out[type]++;
  return out;
}

function hasDuplicateIndexes(frames: readonly FrameDigest[]): boolean {
  return new Set(frames.map((frame) => frame.index)).size !== frames.length;
}

function verdict(
  value: OracleVerdict,
  reasonCode: string,
  detail: string,
  measurements?: Record<string, number>,
): EncryptionEvidenceVerdict {
  return Object.freeze({
    state: 'VERDICT',
    verdict: value,
    reasonCode,
    detail,
    ...(measurements ? { measurements: Object.freeze({ ...measurements }) } : {}),
  });
}

function malformed(reasonCode: string, detail: string): Extract<IsoEncryptionReadResult, { state: 'MALFORMED' }> {
  return Object.freeze({ state: 'MALFORMED', reasonCode, detail });
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let index = 0; index < length; index++) out += String.fromCharCode(bytes[offset + index] ?? 0);
  return out;
}

function u32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) * 0x1000000) +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0);
}

function u16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) + (bytes[offset + 1] ?? 0);
}

function u64(bytes: Uint8Array, offset: number): number {
  return u32(bytes, offset) * 0x1_0000_0000 + u32(bytes, offset + 4);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
