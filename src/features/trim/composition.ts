import type { TrimRange } from './contracts.ts';
import { assessTrimNoopIdentity, type TrimSemanticPresentation } from './identity.ts';
import { trimError, trimVerdict, type TrimDecision } from './types.ts';

export interface TrimCompositionContract {
  readonly aUs: number;
  readonly bUs: number;
  readonly cUs: number;
  readonly container: string;
  readonly frameAccurate: boolean;
}

export interface TrimCompositionObservation<TSegment> {
  readonly left: TSegment;
  readonly right: TSegment;
  readonly direct: TSegment;
  readonly concatenated: TSegment;
  readonly directPresentation: TrimSemanticPresentation;
  readonly concatenatedPresentation: TrimSemanticPresentation;
}

export async function executeTrimComposition<TSource, TSegment>(input: {
  source: TSource;
  contract: TrimCompositionContract;
  trim(source: TSource, range: TrimRange, options: { container: string; frameAccurate: boolean }): Promise<TSegment>;
  concat(segments: readonly TSegment[], options: { container: string }): Promise<TSegment>;
  observe(segment: TSegment): Promise<TrimSemanticPresentation>;
}): Promise<TrimCompositionObservation<TSegment>> {
  assertCompositionContract(input.contract);
  const options = { container: input.contract.container, frameAccurate: input.contract.frameAccurate };
  // Adapter instances are generally single-operation state machines; execute legs serially.
  const left = await input.trim(input.source, { startUs: input.contract.aUs, endUs: input.contract.bUs }, options);
  const right = await input.trim(input.source, { startUs: input.contract.bUs, endUs: input.contract.cUs }, options);
  const direct = await input.trim(input.source, { startUs: input.contract.aUs, endUs: input.contract.cUs }, options);
  const concatenated = await input.concat([left, right], { container: input.contract.container });
  const [directPresentation, concatenatedPresentation] = await Promise.all([
    input.observe(direct),
    input.observe(concatenated),
  ]);
  return Object.freeze({ left, right, direct, concatenated, directPresentation, concatenatedPresentation });
}

export function assessTrimComposition(input: {
  contract: TrimCompositionContract;
  direct: TrimSemanticPresentation;
  concatenated: TrimSemanticPresentation;
  timestampToleranceUs: number;
  representationDifferences?: readonly string[];
}): TrimDecision {
  try {
    assertCompositionContract(input.contract);
  } catch (error) {
    return trimError('TRIM_COMPOSITION_CONTRACT_INVALID', error instanceof Error ? error.message : String(error));
  }
  const expectedDurationUs = input.contract.cUs - input.contract.aUs;
  const semantic = assessTrimNoopIdentity({
    source: input.direct,
    candidate: input.concatenated,
    timestampToleranceUs: input.timestampToleranceUs,
    durationToleranceUs: input.timestampToleranceUs,
    representationDifferences: input.representationDifferences,
  });
  if (semantic.state !== 'VERDICT') return semantic;
  if (semantic.verdict === 'FAIL') {
    return trimVerdict(
      'FAIL',
      'TRIM_COMPOSITION_CONTENT_MISMATCH',
      `adjacent composition differs from direct trim: ${semantic.detail}`,
      semantic.measurements,
    );
  }
  const seamUs = input.contract.bUs - input.contract.aUs;
  const seamFailures: string[] = [];
  for (const track of input.concatenated.tracks) {
    const ordered = [...track.samples].sort((a, b) => a.ptsUs - b.ptsUs);
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      const priorEnd = previous.ptsUs + previous.durationUs;
      if (current.ptsUs < priorEnd - input.timestampToleranceUs) {
        seamFailures.push(`${track.type}:${track.identity} overlaps by ${priorEnd - current.ptsUs}us near sample ${index}`);
      }
      if (current.ptsUs > priorEnd + input.timestampToleranceUs) {
        seamFailures.push(`${track.type}:${track.identity} has a ${current.ptsUs - priorEnd}us hole near sample ${index}`);
      }
    }
    const before = ordered.filter((sample) => sample.ptsUs < seamUs).at(-1);
    const after = ordered.find((sample) => sample.ptsUs + sample.durationUs > seamUs);
    if (!before || !after || before.ptsUs + before.durationUs < seamUs - input.timestampToleranceUs ||
        after.ptsUs > seamUs + input.timestampToleranceUs) {
      seamFailures.push(`${track.type}:${track.identity} does not continuously cover seam ${seamUs}us`);
    }
  }
  if (Math.abs(input.concatenated.durationUs - expectedDurationUs) > input.timestampToleranceUs) {
    seamFailures.push(`composed duration ${input.concatenated.durationUs}us vs expected ${expectedDurationUs}us`);
  }
  if (seamFailures.length > 0) {
    return trimVerdict('FAIL', 'TRIM_COMPOSITION_SEAM_DISCONTINUITY', seamFailures.join('; '), {
      seamUs,
      expectedDurationUs,
      actualDurationUs: input.concatenated.durationUs,
    });
  }
  return trimVerdict(
    'PASS',
    semantic.reasonCode === 'TRIM_NOOP_REPRESENTATION_DIFFERENCE'
      ? 'TRIM_COMPOSITION_REPRESENTATION_DIFFERENCE'
      : 'TRIM_COMPOSITION_SEMANTIC_MATCH',
    `trim(a..b) ++ trim(b..c) matches trim(a..c); seam ${seamUs}us is continuous`,
    { seamUs, expectedDurationUs, tracks: input.concatenated.tracks.length },
    semantic.diagnostics,
  );
}

function assertCompositionContract(contract: TrimCompositionContract): void {
  if (![contract.aUs, contract.bUs, contract.cUs].every(Number.isSafeInteger) ||
      !(contract.aUs >= 0 && contract.aUs < contract.bUs && contract.bUs < contract.cUs)) {
    throw new RangeError('trim composition requires safe-integer 0 <= a < b < c');
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(contract.container)) throw new TypeError('trim composition container is invalid');
}
