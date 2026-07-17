import type { DemuxResult, NormalizedMetadata, NormalizedTrack, PacketInfo } from '../../core/engine.ts';
import type { OracleOutcome } from '../../core/scenario.ts';
import { canonicalDemuxCodec, demuxVerdict } from './types.ts';

export interface DemuxDtsEvidence {
  readonly schema: 'media-test/demux-dts-evidence@1';
  readonly declaredByAdapter: boolean;
  readonly measuredPackets: number;
  readonly unavailablePackets: number;
  readonly comparedPackets: number;
  readonly maximumResidualUs: number;
  readonly outcome: OracleOutcome;
}

export interface AssessDemuxDtsInput {
  readonly measured: DemuxResult;
  readonly goldenPackets: readonly PacketInfo[];
  readonly goldenMetadata?: NormalizedMetadata;
  /** Whether the adapter advertises the `packets:dts` observation capability. */
  readonly declaresDts: boolean;
  readonly toleranceUs?: number;
}

interface TrackPair {
  measuredIndex: number;
  goldenIndex: number;
}

/**
 * Judge the DTS axis without inventing `DTS = PTS`. Adapters that do not expose DTS remain eligible
 * on packet identity and presentation time; the missing decode-time observation is retained as
 * explicit coverage. An adapter that advertises DTS must provide and preserve it for every packet.
 */
export function assessDemuxDts(input: AssessDemuxDtsInput): DemuxDtsEvidence {
  const toleranceUs = input.toleranceUs ?? 1_000;
  if (!Number.isFinite(toleranceUs) || toleranceUs < 0) {
    throw new TypeError('DTS tolerance must be finite and non-negative');
  }

  const measuredPackets = input.measured.packets.filter(hasDts).length;
  const unavailablePackets = input.measured.packets.length - measuredPackets;
  const baseMeasurements = {
    dtsMeasuredPackets: measuredPackets,
    dtsUnavailablePackets: unavailablePackets,
    dtsTotalPackets: input.measured.packets.length,
    dtsCoverage: input.measured.packets.length === 0 ? 1 : measuredPackets / input.measured.packets.length,
    dtsToleranceUs: toleranceUs,
  };

  if (input.declaresDts && unavailablePackets > 0) {
    return evidence(input, measuredPackets, unavailablePackets, 0, 0, demuxVerdict(
      'FAIL',
      'DEMUX_DTS_DECLARED_BUT_MISSING',
      `adapter declares packets:dts but omitted decode time on ${unavailablePackets}/${input.measured.packets.length} packet(s)`,
      baseMeasurements,
    ));
  }

  if (measuredPackets === 0) {
    return evidence(input, 0, unavailablePackets, 0, 0, demuxVerdict(
      'PASS',
      'DEMUX_DTS_UNAVAILABLE_NOT_REQUIRED',
      'decode timestamps are explicitly unavailable; packet semantics and presentation time remain judged',
      baseMeasurements,
    ));
  }

  const pairs = matchTracks(input.measured.metadata, input.goldenMetadata, input.measured.packets, input.goldenPackets);
  let comparedPackets = 0;
  let maximumResidualUs = 0;
  for (const pair of pairs) {
    const measured = forTrack(input.measured.packets, pair.measuredIndex).filter(hasDts).sort(byDts);
    const golden = forTrack(input.goldenPackets, pair.goldenIndex).filter(hasDts).sort(byDts);
    if (golden.length === 0) continue;
    if (input.declaresDts && measured.length !== golden.length) {
      return evidence(input, measuredPackets, unavailablePackets, comparedPackets, maximumResidualUs, demuxVerdict(
        'FAIL',
        'DEMUX_DTS_PACKET_COVERAGE_MISMATCH',
        `logical track ${pair.measuredIndex} exposes ${measured.length} DTS row(s), golden track ${pair.goldenIndex} has ${golden.length}`,
        { ...baseMeasurements, dtsComparedPackets: comparedPackets, dtsMaximumResidualUs: maximumResidualUs },
      ));
    }
    const length = Math.min(measured.length, golden.length);
    if (length === 0) continue;
    const origin = measured[0]!.dtsUs! - golden[0]!.dtsUs!;
    for (let index = 0; index < length; index++) {
      const residual = Math.abs(measured[index]!.dtsUs! - golden[index]!.dtsUs! - origin);
      maximumResidualUs = Math.max(maximumResidualUs, residual);
      comparedPackets++;
      if (residual > toleranceUs) {
        return evidence(input, measuredPackets, unavailablePackets, comparedPackets, maximumResidualUs, demuxVerdict(
          'FAIL',
          'DEMUX_DTS_TIMELINE_MISMATCH',
          `logical track ${pair.measuredIndex} decode-time residual ${residual}us exceeds ${toleranceUs}us`,
          { ...baseMeasurements, dtsComparedPackets: comparedPackets, dtsMaximumResidualUs: maximumResidualUs },
        ));
      }
    }
  }

  const measurements = {
    ...baseMeasurements,
    dtsComparedPackets: comparedPackets,
    dtsMaximumResidualUs: maximumResidualUs,
  };
  if (comparedPackets === 0) {
    return evidence(input, measuredPackets, unavailablePackets, 0, maximumResidualUs, {
      state: 'UNAVAILABLE',
      oracle: 'golden-packets',
      status: 'NA_ASSET',
      reasonCode: 'DEMUX_GOLDEN_DTS_UNAVAILABLE',
      detail: 'candidate exposed DTS but the committed packet evidence has no comparable decode timeline',
      measurements,
    });
  }
  return evidence(input, measuredPackets, unavailablePackets, comparedPackets, maximumResidualUs, demuxVerdict(
    'PASS',
    unavailablePackets > 0 ? 'DEMUX_DTS_PARTIAL_COVERAGE' : 'DEMUX_DTS_TIMELINE_MATCH',
    unavailablePackets > 0
      ? `compared ${comparedPackets} observed DTS row(s); ${unavailablePackets} packet(s) explicitly lack DTS`
      : `all ${comparedPackets} comparable decode timestamps match after one track-local origin shift`,
    measurements,
  ));
}

function evidence(
  _input: AssessDemuxDtsInput,
  measuredPackets: number,
  unavailablePackets: number,
  comparedPackets: number,
  maximumResidualUs: number,
  outcome: OracleOutcome,
): DemuxDtsEvidence {
  return Object.freeze({
    schema: 'media-test/demux-dts-evidence@1' as const,
    declaredByAdapter: _input.declaresDts,
    measuredPackets,
    unavailablePackets,
    comparedPackets,
    maximumResidualUs,
    outcome,
  });
}

function hasDts(packet: PacketInfo): packet is PacketInfo & { dtsUs: number } {
  return typeof packet.dtsUs === 'number' && Number.isFinite(packet.dtsUs);
}

function byDts(left: PacketInfo & { dtsUs: number }, right: PacketInfo & { dtsUs: number }): number {
  return left.dtsUs - right.dtsUs || left.ptsUs - right.ptsUs;
}

function forTrack(packets: readonly PacketInfo[], trackIndex: number): PacketInfo[] {
  return packets.filter((packet) => packet.trackIndex === trackIndex);
}

function matchTracks(
  measuredMetadata: NormalizedMetadata,
  goldenMetadata: NormalizedMetadata | undefined,
  measuredPackets: readonly PacketInfo[],
  goldenPackets: readonly PacketInfo[],
): TrackPair[] {
  const measuredIndices = packetTrackIndices(measuredPackets);
  const goldenIndices = packetTrackIndices(goldenPackets);
  if (!goldenMetadata || measuredMetadata.tracks.length === 0 || goldenMetadata.tracks.length === 0) {
    return measuredIndices.slice(0, goldenIndices.length).map((measuredIndex, index) => ({
      measuredIndex,
      goldenIndex: goldenIndices[index]!,
    }));
  }

  const remaining = new Set(goldenIndices);
  const result: TrackPair[] = [];
  for (const measuredIndex of measuredIndices) {
    const measured = measuredMetadata.tracks[measuredIndex];
    if (!measured) continue;
    let best: { index: number; cost: number } | undefined;
    for (const goldenIndex of remaining) {
      const golden = goldenMetadata.tracks[goldenIndex];
      if (!golden || measured.type !== golden.type) continue;
      const cost = trackCost(measured, golden);
      if (!best || cost < best.cost || (cost === best.cost && goldenIndex < best.index)) {
        best = { index: goldenIndex, cost };
      }
    }
    if (best) {
      remaining.delete(best.index);
      result.push({ measuredIndex, goldenIndex: best.index });
    }
  }
  return result;
}

function trackCost(left: NormalizedTrack, right: NormalizedTrack): number {
  let cost = canonicalDemuxCodec(left.codec) === canonicalDemuxCodec(right.codec) ? 0 : 10_000;
  for (const field of ['width', 'height', 'sampleRate', 'channels'] as const) {
    const a = left[field];
    const b = right[field];
    if (a !== undefined && b !== undefined && a !== b) cost += 100;
  }
  if (left.language && right.language && left.language !== right.language) cost += 10;
  return cost;
}

function packetTrackIndices(packets: readonly PacketInfo[]): number[] {
  return [...new Set(packets.map((packet) => packet.trackIndex))].sort((left, right) => left - right);
}
