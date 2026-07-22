import type { OracleOutcome } from '../../core/scenario.ts';
import { bytesEqual, canonicalCodec, canonicalContainer } from './binary.ts';
import { aacAudioSpecificConfigFromEsds } from './reader-isobmff.ts';
import { readNeutralRemuxProgram } from './readers.ts';
import type {
  RemuxProgramEvidence,
  RemuxReadResult,
  RemuxSampleEvidence,
  RemuxTrackEvidence,
  StrictRemuxComparison,
  StrictRemuxOptions,
  StrictRemuxTolerance,
} from './types.ts';

interface SemanticUnit {
  payload: Uint8Array;
  ptsUs?: number;
  dtsUs?: number;
  durationUs?: number;
  keyframe?: boolean;
  sourceSample: number;
  kind?: number;
}

interface NormalizedTrack {
  units: SemanticUnit[];
  parameterSets: Uint8Array[];
  framing: Set<string>;
  grouping: number[];
}

const DEFAULT_TOLERANCE: StrictRemuxTolerance = { timestampUs: 2_000, durationUs: 50_000 };

function verdict(verdict: 'PASS' | 'FAIL', reasonCode: string, detail: string, measurements?: Record<string, number>): OracleOutcome {
  return {
    state: 'VERDICT', oracle: 'reference-reimport', verdict, reasonCode, detail,
    ...(measurements ? { measurements } : {}),
  };
}

function error(reasonCode: string, detail: string): OracleOutcome {
  return { state: 'ERROR', oracle: 'reference-reimport', reasonCode, detail };
}

function findStartCodes(bytes: Uint8Array): Array<{ start: number; payload: number }> {
  const out: Array<{ start: number; payload: number }> = [];
  for (let i = 0; i + 3 <= bytes.byteLength;) {
    if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) {
      out.push({ start: i, payload: i + 3 }); i += 3; continue;
    }
    if (i + 4 <= bytes.byteLength && bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1) {
      out.push({ start: i, payload: i + 4 }); i += 4; continue;
    }
    i++;
  }
  return out;
}

function annexBNals(bytes: Uint8Array): Uint8Array[] | undefined {
  const starts = findStartCodes(bytes);
  if (starts.length === 0) return undefined;
  const out: Uint8Array[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!.payload;
    let end = starts[i + 1]?.start ?? bytes.byteLength;
    while (end > start && bytes[end - 1] === 0) end--;
    if (end > start) out.push(bytes.subarray(start, end));
  }
  return out.length ? out : undefined;
}

function uintN(bytes: Uint8Array, offset: number, width: number): number {
  let value = 0;
  for (let i = 0; i < width; i++) value = value * 256 + bytes[offset + i]!;
  return value;
}

function lengthPrefixedNals(bytes: Uint8Array, widths: readonly number[]): { nals: Uint8Array[]; width: number } | undefined {
  for (const width of widths) {
    if (width < 1 || width > 4) continue;
    const nals: Uint8Array[] = [];
    let offset = 0;
    while (offset < bytes.byteLength) {
      if (offset + width > bytes.byteLength) { nals.length = 0; break; }
      const length = uintN(bytes, offset, width);
      offset += width;
      if (length <= 0 || offset + length > bytes.byteLength) { nals.length = 0; break; }
      nals.push(bytes.subarray(offset, offset + length));
      offset += length;
    }
    if (nals.length && offset === bytes.byteLength) return { nals, width };
  }
  return undefined;
}

function avcLengthSize(privateBytes: Uint8Array | undefined): number | undefined {
  return privateBytes && privateBytes.byteLength >= 5 && privateBytes[0] === 1 ? (privateBytes[4]! & 3) + 1 : undefined;
}

function hevcLengthSize(privateBytes: Uint8Array | undefined): number | undefined {
  return privateBytes && privateBytes.byteLength >= 22 && privateBytes[0] === 1 ? (privateBytes[21]! & 3) + 1 : undefined;
}

function parameterSetsFromPrivate(codec: string, bytes: Uint8Array | undefined): Uint8Array[] {
  if (!bytes) return [];
  const out: Uint8Array[] = [];
  if (codec === 'h264' && bytes.byteLength >= 7 && bytes[0] === 1) {
    let at = 5;
    const sps = bytes[at++]! & 0x1f;
    for (let i = 0; i < sps; i++) {
      if (at + 2 > bytes.byteLength) return [];
      const length = uintN(bytes, at, 2); at += 2;
      if (at + length > bytes.byteLength) return [];
      out.push(bytes.subarray(at, at + length)); at += length;
    }
    if (at >= bytes.byteLength) return out;
    const pps = bytes[at++]!;
    for (let i = 0; i < pps; i++) {
      if (at + 2 > bytes.byteLength) return [];
      const length = uintN(bytes, at, 2); at += 2;
      if (at + length > bytes.byteLength) return [];
      out.push(bytes.subarray(at, at + length)); at += length;
    }
  } else if (codec === 'hevc' && bytes.byteLength >= 23 && bytes[0] === 1) {
    let at = 23;
    const arrays = bytes[22]!;
    for (let i = 0; i < arrays; i++) {
      if (at + 3 > bytes.byteLength) return [];
      const kind = bytes[at++]! & 0x3f;
      const count = uintN(bytes, at, 2); at += 2;
      for (let n = 0; n < count; n++) {
        if (at + 2 > bytes.byteLength) return [];
        const length = uintN(bytes, at, 2); at += 2;
        if (at + length > bytes.byteLength) return [];
        if (kind >= 32 && kind <= 34) out.push(bytes.subarray(at, at + length));
        at += length;
      }
    }
  }
  return out;
}

function nalKind(codec: string, nal: Uint8Array): number | undefined {
  if (nal.byteLength === 0) return undefined;
  return codec === 'h264' ? nal[0]! & 0x1f : codec === 'hevc' ? (nal[0]! >> 1) & 0x3f : undefined;
}

function parameterKind(codec: string, kind: number): boolean {
  return codec === 'h264' ? kind === 7 || kind === 8 : kind >= 32 && kind <= 34;
}

function representationOnlyNal(codec: string, kind: number): boolean {
  return parameterKind(codec, kind) || (codec === 'h264' ? kind === 9 || kind === 12 : kind === 35 || kind === 38);
}

function nalRandomAccess(codec: string, kind: number): boolean {
  return codec === 'h264' ? kind === 5 : kind >= 16 && kind <= 23;
}

function normalizeTrack(track: RemuxTrackEvidence): NormalizedTrack | undefined {
  const codec = canonicalCodec(track.codec);
  const parameterSets = parameterSetsFromPrivate(codec, track.codecPrivate);
  const units: SemanticUnit[] = [];
  const framing = new Set<string>();
  const grouping: number[] = [];
  for (let sampleIndex = 0; sampleIndex < track.samples.length; sampleIndex++) {
    const sample = track.samples[sampleIndex]!;
    framing.add(sample.framing);
    if (codec !== 'h264' && codec !== 'hevc') {
      // Xing/Info is a seek/gapless metadata carrier in a synthetic first MPEG audio frame. A
      // container may lawfully materialize that metadata elsewhere and omit this non-program frame.
      if (
        codec === 'mp3' &&
        sampleIndex === 0 &&
        (containsAscii(sample.payload, 'Xing', 256) || containsAscii(sample.payload, 'Info', 256))
      ) {
        grouping.push(0);
        continue;
      }
      units.push({ ...sample, sourceSample: sampleIndex });
      grouping.push(1);
      continue;
    }
    const preferred = codec === 'h264' ? avcLengthSize(track.codecPrivate) : hevcLengthSize(track.codecPrivate);
    const parsed = sample.framing === 'annexb'
      ? annexBNals(sample.payload)
      : lengthPrefixedNals(sample.payload, preferred ? [preferred] : [4, 2, 1])?.nals;
    if (!parsed) return undefined;
    let semanticInSample = 0;
    for (const nal of parsed) {
      const kind = nalKind(codec, nal);
      if (kind === undefined) return undefined;
      if (parameterKind(codec, kind)) parameterSets.push(nal);
      if (representationOnlyNal(codec, kind)) continue;
      units.push({
        payload: nal, ptsUs: sample.ptsUs, dtsUs: sample.dtsUs, durationUs: sample.durationUs,
        keyframe: nalRandomAccess(codec, kind), sourceSample: sampleIndex, kind,
      });
      semanticInSample++;
    }
    grouping.push(semanticInSample);
  }
  return { units, parameterSets, framing, grouping };
}

function containsAscii(bytes: Uint8Array, token: string, limit: number): boolean {
  const end = Math.min(bytes.byteLength, limit);
  outer: for (let i = 0; i + token.length <= end; i++) {
    for (let n = 0; n < token.length; n++) {
      if (bytes[i + n] !== token.charCodeAt(n)) continue outer;
    }
    return true;
  }
  return false;
}

function chunkStreamEqual(a: readonly Uint8Array[], b: readonly Uint8Array[]): boolean {
  const totalA = a.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const totalB = b.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (totalA !== totalB) return false;
  let ai = 0; let bi = 0; let ao = 0; let bo = 0;
  while (ai < a.length && bi < b.length) {
    const ac = a[ai]!; const bc = b[bi]!;
    const take = Math.min(ac.byteLength - ao, bc.byteLength - bo);
    for (let i = 0; i < take; i++) if (ac[ao + i] !== bc[bo + i]) return false;
    ao += take; bo += take;
    if (ao === ac.byteLength) { ai++; ao = 0; }
    if (bo === bc.byteLength) { bi++; bo = 0; }
  }
  return ai === a.length && bi === b.length;
}

function normalizedContentEqual(source: RemuxTrackEvidence, output: RemuxTrackEvidence): boolean {
  const a = normalizeTrack(source); const b = normalizeTrack(output);
  if (!a || !b) return false;
  if (canonicalCodec(source.codec) === 'flac') {
    return chunkStreamEqual(a.units.map((unit) => unit.payload), b.units.map((unit) => unit.payload));
  }
  return a.units.length === b.units.length && a.units.every((unit, index) => bytesEqual(unit.payload, b.units[index]!.payload));
}

function pairScore(source: RemuxTrackEvidence, output: RemuxTrackEvidence): number {
  let score = normalizedContentEqual(source, output) ? 100_000 : 0;
  if (source.language && output.language && source.language === output.language) score += 1_000;
  if (source.role && output.role && source.role === output.role) score += 500;
  if (source.sampleRate && output.sampleRate && source.sampleRate === output.sampleRate) score += 100;
  if (source.channels && output.channels && source.channels === output.channels) score += 100;
  if (source.width && output.width && source.width === output.width) score += 100;
  if (source.height && output.height && source.height === output.height) score += 100;
  return score;
}

function bestPairs(source: readonly RemuxTrackEvidence[], output: readonly RemuxTrackEvidence[]): Array<[RemuxTrackEvidence, RemuxTrackEvidence]> | undefined {
  if (source.length !== output.length) return undefined;
  if (source.length === 0) return [];
  if (source.length > 8) {
    const remaining = [...output];
    const pairs: Array<[RemuxTrackEvidence, RemuxTrackEvidence]> = [];
    for (const item of source) {
      let best = -1; let score = -1;
      for (let i = 0; i < remaining.length; i++) {
        const candidateScore = pairScore(item, remaining[i]!);
        if (candidateScore > score) { score = candidateScore; best = i; }
      }
      if (best < 0) return undefined;
      pairs.push([item, remaining.splice(best, 1)[0]!]);
    }
    return pairs;
  }
  let bestScore = -Infinity;
  let best: Array<[RemuxTrackEvidence, RemuxTrackEvidence]> | undefined;
  const visit = (index: number, remaining: RemuxTrackEvidence[], pairs: Array<[RemuxTrackEvidence, RemuxTrackEvidence]>, score: number): void => {
    if (index === source.length) {
      if (score > bestScore) { bestScore = score; best = [...pairs]; }
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const next = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
      visit(index + 1, next, [...pairs, [source[index]!, candidate]], score + pairScore(source[index]!, candidate));
    }
  };
  visit(0, [...output], [], 0);
  return best;
}

function matchTracks(source: RemuxProgramEvidence, output: RemuxProgramEvidence): { pairs?: Array<[RemuxTrackEvidence, RemuxTrackEvidence]>; failure?: string } {
  const media = (program: RemuxProgramEvidence): RemuxTrackEvidence[] => program.tracks.filter((track) => track.type === 'video' || track.type === 'audio');
  const sourceMedia = media(source); const outputMedia = media(output);
  if (sourceMedia.length !== outputMedia.length) return { failure: `required media-track count changed: ${sourceMedia.length} -> ${outputMedia.length}` };
  const keys = new Set(sourceMedia.map((track) => `${track.type}:${canonicalCodec(track.codec)}`));
  for (const key of outputMedia.map((track) => `${track.type}:${canonicalCodec(track.codec)}`)) keys.add(key);
  const pairs: Array<[RemuxTrackEvidence, RemuxTrackEvidence]> = [];
  for (const key of keys) {
    const [type, codec] = key.split(':');
    const a = sourceMedia.filter((track) => track.type === type && canonicalCodec(track.codec) === codec);
    const b = outputMedia.filter((track) => track.type === type && canonicalCodec(track.codec) === codec);
    if (a.length !== b.length) return { failure: `track membership '${key}' changed: ${a.length} -> ${b.length}` };
    const group = bestPairs(a, b);
    if (!group) return { failure: `could not match '${key}' tracks semantically` };
    pairs.push(...group);
  }
  return { pairs };
}

function setOfUniqueBytes(values: readonly Uint8Array[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const value of values) if (!out.some((entry) => bytesEqual(entry, value))) out.push(value);
  return out;
}

function sameByteSet(a: readonly Uint8Array[], b: readonly Uint8Array[]): boolean {
  const ua = setOfUniqueBytes(a); const ub = setOfUniqueBytes(b);
  return ua.length === ub.length && ua.every((value) => ub.some((entry) => bytesEqual(value, entry)));
}

function trackFacts(
  source: RemuxTrackEvidence,
  output: RemuxTrackEvidence,
  representationDifferences: string[],
  label: string,
  aacSbrRateRepresentation: boolean,
): string[] {
  const failures: string[] = [];
  for (const key of ['language', 'role', 'disposition'] as const) {
    if (source[key] !== undefined && output[key] !== undefined && source[key] !== output[key]) {
      failures.push(`${key} changed '${source[key]}' -> '${output[key]}'`);
    } else if (source[key] !== undefined && output[key] === undefined) {
      representationDifferences.push(`${label} ${key} evidence is unavailable in the target reader`);
    }
  }
  for (const key of ['sampleRate', 'channels', 'width', 'height'] as const) {
    if (source[key] !== undefined && output[key] !== undefined && source[key] !== output[key]) {
      if (key === 'sampleRate' && aacSbrRateRepresentation) {
        representationDifferences.push(
          `${label} HE-AAC SBR presentation/core rates are represented differently across ADTS (${source.sampleRate}Hz -> ${output.sampleRate}Hz)`,
        );
      } else {
        failures.push(`${key} changed ${source[key]} -> ${output[key]}`);
      }
    } else if (source[key] !== undefined && output[key] === undefined) {
      representationDifferences.push(`${label} ${key} evidence is unavailable in the target reader`);
    }
  }
  return failures;
}

function explicitAacSbrAdtsRateRepresentation(
  sourceProgram: RemuxProgramEvidence,
  outputProgram: RemuxProgramEvidence,
  sourceTrack: RemuxTrackEvidence,
  outputTrack: RemuxTrackEvidence,
): boolean {
  if (canonicalCodec(sourceTrack.codec) !== 'aac') return false;
  const sourceIsAdts = canonicalContainer(sourceProgram.container) === 'adts';
  const outputIsAdts = canonicalContainer(outputProgram.container) === 'adts';
  if (sourceIsAdts === outputIsAdts) return false;
  const adtsTrack = sourceIsAdts ? sourceTrack : outputTrack;
  const configuredTrack = sourceIsAdts ? outputTrack : sourceTrack;
  if (!adtsTrack.sampleRate || !configuredTrack.sampleRate || !configuredTrack.codecPrivate) return false;
  const config = aacAudioSpecificConfigFromEsds(configuredTrack.codecPrivate);
  return config?.sbrPresent === true &&
    config.coreSampleRate === adtsTrack.sampleRate &&
    config.presentationSampleRate === configuredTrack.sampleRate;
}

function relativeAxisAligned(
  source: Array<number | undefined>,
  output: Array<number | undefined>,
  toleranceUs: number,
): boolean {
  if (source.length !== output.length || source.some((value) => value === undefined) || output.some((value) => value === undefined)) {
    return false;
  }
  const a = source as number[];
  const b = output as number[];
  let originA = Number.POSITIVE_INFINITY;
  let originB = Number.POSITIVE_INFINITY;
  for (let index = 0; index < a.length; index++) {
    originA = Math.min(originA, a[index]!);
    originB = Math.min(originB, b[index]!);
  }
  return a.every((value, index) => Math.abs((value - originA) - (b[index]! - originB)) <= toleranceUs);
}

function presentationSpan(track: NormalizedTrack): number | undefined {
  if (track.units.length === 0 || track.units.some((unit) => unit.ptsUs === undefined || unit.durationUs === undefined)) {
    return undefined;
  }
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const unit of track.units) {
    start = Math.min(start, unit.ptsUs!);
    end = Math.max(end, unit.ptsUs! + unit.durationUs!);
  }
  return end > start ? end - start : undefined;
}

function compareTimeline(
  source: NormalizedTrack,
  output: NormalizedTrack,
  tolerance: StrictRemuxTolerance,
  failures: string[],
  differences: string[],
  label: string,
  allowEbmlDurationRematerialization: boolean,
): void {
  if (source.units.length !== output.units.length) return;
  const sourcePts = source.units.map((unit) => unit.ptsUs);
  const outputPts = output.units.map((unit) => unit.ptsUs);
  const sourceDts = source.units.map((unit) => unit.dtsUs);
  const outputDts = output.units.map((unit) => unit.dtsUs);
  const compareAxis = (name: string, a: Array<number | undefined>, b: Array<number | undefined>): void => {
    if (a.every((value) => value === undefined) && b.every((value) => value === undefined)) return;
    if (a.some((value) => value === undefined) || b.some((value) => value === undefined)) {
      differences.push(`${label} ${name} provenance differs`); return;
    }
    const aa = a as number[]; const bb = b as number[];
    const originA = aa.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY);
    const originB = bb.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY);
    if (
      label === 'audio/opus' &&
      aa.length > 1 &&
      Math.abs((aa[1]! - originA) - (bb[1]! - originB)) > tolerance.timestampUs
    ) {
      const anchorA = aa[1]!;
      const anchorB = bb[1]!;
      const tailMatches = aa.slice(1).every((value, index) =>
        Math.abs((value - anchorA) - (bb[index + 1]! - anchorB)) <= tolerance.timestampUs);
      if (tailMatches) {
        differences.push(`${label} ${name} initial Opus pre-skip/discard representation differs`);
        return;
      }
    }
    for (let i = 0; i < aa.length; i++) {
      const delta = Math.abs((aa[i]! - originA) - (bb[i]! - originB));
      if (delta > tolerance.timestampUs) {
        failures.push(`${label} ${name}[${i}] drift ${delta}us > ${tolerance.timestampUs}us`); return;
      }
      if (delta > 0) differences.push(`${label} ${name} rounded within tolerance`);
    }
  };
  compareAxis('PTS', sourcePts, outputPts);
  compareAxis('DTS', sourceDts, outputDts);
  const sourceHasDts = source.units.every((unit) => unit.dtsUs !== undefined);
  const outputHasDts = output.units.every((unit) => unit.dtsUs !== undefined);
  const completeDurations = sourceHasDts === outputHasDts &&
    source.units.every((unit) => unit.durationUs !== undefined) &&
    output.units.every((unit) => unit.durationUs !== undefined);
  if (sourceHasDts !== outputHasDts) {
    differences.push(`${label} coded-duration provenance differs with DTS availability`);
  }
  const durationA = completeDurations ? source.units.reduce((sum, unit) => sum + unit.durationUs!, 0) : 0;
  const durationB = completeDurations ? output.units.reduce((sum, unit) => sum + unit.durationUs!, 0) : 0;
  if (completeDurations && durationA > 0 && durationB > 0) {
    const delta = Math.abs(durationA - durationB);
    if (delta > tolerance.durationUs) {
      const sourceSpan = presentationSpan(source);
      const outputSpan = presentationSpan(output);
      const timestampSpanPreserved = sourceSpan !== undefined && outputSpan !== undefined &&
        Math.abs(sourceSpan - outputSpan) <= tolerance.durationUs &&
        relativeAxisAligned(sourcePts, outputPts, tolerance.timestampUs);
      if (allowEbmlDurationRematerialization && timestampSpanPreserved) {
        differences.push(`${label} EBML per-sample duration metadata was rematerialized while the coded timestamp span stayed preserved`);
      } else {
        failures.push(`${label} coded duration drift ${delta}us > ${tolerance.durationUs}us`);
      }
    } else if (delta > 0) differences.push(`${label} duration rounded within tolerance`);
  }
}

export function compareStrictRemuxPrograms(
  source: RemuxProgramEvidence,
  output: RemuxProgramEvidence,
  options: StrictRemuxOptions = {},
): StrictRemuxComparison {
  const tolerance = { ...DEFAULT_TOLERANCE, ...(options.tolerance ?? {}) };
  const failures: string[] = [];
  const differences: string[] = [];
  let semanticOriginDifferenceBand = 0;
  if (options.expectedTargetContainer && canonicalContainer(output.container) !== canonicalContainer(options.expectedTargetContainer)) {
    failures.push(`returned container '${output.container}', expected '${options.expectedTargetContainer}'`);
  }
  const matched = matchTracks(source, output);
  if (matched.failure) failures.push(matched.failure);
  const pairs = matched.pairs ?? [];
  for (const [sourceTrack, outputTrack] of pairs) {
    const label = `${sourceTrack.type}/${canonicalCodec(sourceTrack.codec)}`;
    const aacSbrRateRepresentation = explicitAacSbrAdtsRateRepresentation(
      source,
      output,
      sourceTrack,
      outputTrack,
    );
    failures.push(...trackFacts(
      sourceTrack,
      outputTrack,
      differences,
      label,
      aacSbrRateRepresentation,
    ).map((detail) => `${label} ${detail}`));
    const normalizedSource = normalizeTrack(sourceTrack);
    const normalizedOutput = normalizeTrack(outputTrack);
    if (!normalizedSource || !normalizedOutput) {
      failures.push(`${label} coded framing is malformed or ambiguous`); continue;
    }
    const codec = canonicalCodec(sourceTrack.codec);
    const contentEqual = codec === 'flac'
      ? chunkStreamEqual(normalizedSource.units.map((unit) => unit.payload), normalizedOutput.units.map((unit) => unit.payload))
      : normalizedSource.units.length === normalizedOutput.units.length && normalizedSource.units.every((unit, index) => bytesEqual(unit.payload, normalizedOutput.units[index]!.payload));
    if (!contentEqual) {
      failures.push(`${label} normalized coded access-unit content changed`); continue;
    }
    if (!sameByteSet(normalizedSource.parameterSets, normalizedOutput.parameterSets)) {
      failures.push(`${label} codec parameter-set content changed`);
    }
    const semanticOrigin = (track: NormalizedTrack): number | undefined => {
      let minimum = Number.POSITIVE_INFINITY;
      for (const unit of track.units) {
        if (unit.ptsUs !== undefined) minimum = Math.min(minimum, unit.ptsUs);
      }
      return Number.isFinite(minimum) ? minimum : undefined;
    };
    const sourceOrigin = semanticOrigin(normalizedSource);
    const outputOrigin = semanticOrigin(normalizedOutput);
    if (sourceOrigin !== undefined && outputOrigin !== undefined) {
      const originDelta = Math.abs(sourceOrigin - outputOrigin);
      semanticOriginDifferenceBand = Math.max(semanticOriginDifferenceBand, originDelta);
      if (originDelta > tolerance.timestampUs) {
        differences.push(`${label} presentation origin/priming representation differs by ${originDelta}us`);
      }
    }
    const ebmlContainers = new Set(['webm', 'mkv']);
    const allowEbmlDurationRematerialization = ebmlContainers.has(canonicalContainer(source.container)) &&
      ebmlContainers.has(canonicalContainer(output.container));
    compareTimeline(
      normalizedSource,
      normalizedOutput,
      tolerance,
      failures,
      differences,
      label,
      allowEbmlDurationRematerialization,
    );
    if ([...normalizedSource.framing].join(',') !== [...normalizedOutput.framing].join(',')) differences.push(`${label} framing changed`);
    if (normalizedSource.grouping.join(',') !== normalizedOutput.grouping.join(',')) differences.push(`${label} legal access-unit grouping changed`);
    const sourceFlags = sourceTrack.samples.map((sample) => sample.keyframe);
    const outputFlags = outputTrack.samples.map((sample) => sample.keyframe);
    if (sourceFlags.length === outputFlags.length && sourceFlags.some((value, index) => value !== outputFlags[index])) {
      differences.push(`${label} container keyframe flags differ while coded random-access units match`);
    }
    if (sourceTrack.id !== outputTrack.id) differences.push(`${label} container track identity/order differs`);
    if (sourceTrack.codecPrivate && outputTrack.codecPrivate && !bytesEqual(sourceTrack.codecPrivate, outputTrack.codecPrivate)) {
      differences.push(`${label} codec configuration placement/representation differs`);
    }
  }
  if (source.durationUs !== undefined && output.durationUs !== undefined) {
    const durationDelta = Math.abs(source.durationUs - output.durationUs);
    if (durationDelta > tolerance.durationUs) {
      const terminalDurationEvidence = pairs.flatMap(([sourceTrack, outputTrack]) => {
        const sourceDuration = sourceTrack.samples.at(-1)?.durationUs;
        const outputDuration = outputTrack.samples.at(-1)?.durationUs;
        return sourceDuration === undefined || outputDuration === undefined
          ? [sourceDuration, outputDuration].filter((value): value is number => value !== undefined)
          : [];
      });
      const terminalEvidenceBand = terminalDurationEvidence.reduce(
        (maximum, value) => Math.max(maximum, value),
        0,
      );
      const representationBand = terminalEvidenceBand + semanticOriginDifferenceBand;
      if (representationBand > 0 && durationDelta <= representationBand + tolerance.timestampUs) {
        differences.push(
          'program duration differs only by evidenced origin/priming normalization and one unavailable terminal sample duration',
        );
      } else {
        failures.push(`program duration drift ${durationDelta}us > ${tolerance.durationUs}us`);
      }
    } else if (durationDelta > 0) {
      differences.push('program duration differs only within declared container/edit-list tolerance');
    }
  }
  if (canonicalContainer(source.container) !== canonicalContainer(output.container)) differences.push(`wrapper changed ${source.container} -> ${output.container}`);
  const measurements = {
    sourceTracks: source.tracks.length,
    outputTracks: output.tracks.length,
    matchedTracks: pairs.length,
    sourceSamples: source.tracks.reduce((sum, track) => sum + track.samples.length, 0),
    outputSamples: output.tracks.reduce((sum, track) => sum + track.samples.length, 0),
    representationDifferences: new Set(differences).size,
  };
  const uniqueDifferences = [...new Set(differences)];
  const outcome = failures.length
    ? verdict('FAIL', 'REMUX_STRICT_COPY_VIOLATION', failures.join('; '), measurements)
    : uniqueDifferences.length && options.surfaceRepresentationDifferences !== false
      ? verdict('PASS', 'REMUX_VALID_REPRESENTATION_DIFFERENCE', uniqueDifferences.join('; '), measurements)
      : verdict('PASS', 'REMUX_STRICT_COPY_PRESERVED', uniqueDifferences.join('; ') || 'all required coded tracks, content and timelines are preserved', measurements);
  return {
    outcome,
    matchedTracks: pairs.map(([a, b]) => ({ sourceId: a.id, outputId: b.id })),
    representationDifferences: uniqueDifferences,
  };
}

function readFailure(role: 'source' | 'output', read: Exclude<RemuxReadResult, { state: 'OK' }>): OracleOutcome {
  const detail = `${role} neutral remux reader ${read.state} [${read.reasonCode}]`;
  if (role === 'output' && (read.state === 'MALFORMED' || read.state === 'INCOMPLETE')) {
    return verdict('FAIL', 'REMUX_OUTPUT_INVALID', detail);
  }
  return error(role === 'source' ? 'REMUX_SOURCE_EVIDENCE_INVALID' : read.reasonCode, detail);
}

export function evaluateStrictStreamCopy(
  sourceBytes: Uint8Array,
  sourceContainer: string,
  outputBytes: Uint8Array,
  outputContainer: string,
  options: StrictRemuxOptions = {},
): StrictRemuxComparison {
  const source = readNeutralRemuxProgram(sourceBytes, sourceContainer);
  if (source.state !== 'OK') return { outcome: readFailure('source', source), matchedTracks: [], representationDifferences: [] };
  const output = readNeutralRemuxProgram(outputBytes, outputContainer);
  if (output.state !== 'OK') return { outcome: readFailure('output', output), matchedTracks: [], representationDifferences: [] };
  return compareStrictRemuxPrograms(source.value, output.value, options);
}

/** Exposed for codec-alias/Annex-B acceptance fixtures without manufacturing a container. */
export function normalizeRemuxTrackForTest(track: RemuxTrackEvidence): Readonly<{
  payloads: readonly Uint8Array[];
  parameterSets: readonly Uint8Array[];
  grouping: readonly number[];
}> | undefined {
  const normalized = normalizeTrack(track);
  return normalized && {
    payloads: normalized.units.map((unit) => unit.payload),
    parameterSets: setOfUniqueBytes(normalized.parameterSets),
    grouping: normalized.grouping,
  };
}
