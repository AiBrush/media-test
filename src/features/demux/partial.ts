import type {
  DemuxResult,
  DemuxTrackRepresentation,
  NormalizedTrack,
  PacketInfo,
} from '../../core/engine.ts';
import type { OracleOutcome } from '../../core/scenario.ts';
import { demuxError, demuxVerdict } from './types.ts';

export type DemuxAccessUnitProbeResult =
  | Readonly<{ state: 'PASS'; detail?: string }>
  | Readonly<{ state: 'FAIL'; reasonCode: string; detail: string }>
  | Readonly<{ state: 'UNAVAILABLE'; reasonCode: string; detail: string }>
  | Readonly<{ state: 'ERROR'; reasonCode: string; detail: string }>;

export interface DemuxAccessUnitProbeInput {
  readonly packet: PacketInfo;
  readonly track: NormalizedTrack;
  readonly representation?: DemuxTrackRepresentation;
  readonly packetIndex: number;
}

export type DemuxAccessUnitProbe = (
  input: DemuxAccessUnitProbeInput,
) => DemuxAccessUnitProbeResult | Promise<DemuxAccessUnitProbeResult>;

export interface ValidateTruncatedDemuxPartialInput {
  readonly result: DemuxResult;
  /** Neutral decode/parser probe. It must consume every complete access unit, including the terminal one. */
  readonly probeAccessUnit?: DemuxAccessUnitProbe;
  readonly minimumCompleteAccessUnits?: number;
}

export interface TruncatedDemuxPartialAssessment {
  readonly disposition: 'valid-complete-prefix' | 'invalid-partial' | 'evidence-unavailable';
  readonly checkedAccessUnits: number;
  readonly outcome: OracleOutcome;
}

/**
 * Neutral browser instrument for the concrete truncated-H.264 row. The exact config returned by
 * `isConfigSupported()` is the config passed to VideoDecoder; all output frames are closed at the
 * boundary, and every reported access unit must produce one decoded picture by terminal flush.
 */
export async function validateTruncatedH264WithWebCodecs(
  result: DemuxResult,
): Promise<TruncatedDemuxPartialAssessment> {
  if (typeof VideoDecoder !== 'function' || typeof EncodedVideoChunk !== 'function') {
    return assessment('evidence-unavailable', 0, {
      state: 'UNAVAILABLE', oracle: 'graceful-failure', status: 'NA_BROWSER',
      reasonCode: 'DEMUX_PARTIAL_VIDEO_DECODER_UNAVAILABLE',
      detail: 'VideoDecoder/EncodedVideoChunk is unavailable for neutral access-unit validation',
    });
  }
  const videoTracks = result.metadata.tracks
    .map((track, trackIndex) => ({ track, trackIndex }))
    .filter(({ track }) => track.type === 'video' && (track.codec === 'h264' || /^avc[13](?:\.|$)/i.test(track.codec)));
  if (videoTracks.length !== 1) {
    return fail(0, 'DEMUX_PARTIAL_H264_TRACK_CARDINALITY',
      `neutral H.264 validation requires exactly one video track, observed ${videoTracks.length}`);
  }
  const selected = videoTracks[0]!;
  const representation = result.representations?.find((entry) => entry.trackIndex === selected.trackIndex);
  const firstPacket = result.packets.find((packet) => packet.trackIndex === selected.trackIndex);
  const description = representation?.description ?? firstPacket?.decoderConfig;
  if ((representation?.framing === 'avc' || representation?.framing === 'hevc') && !description?.byteLength) {
    return assessment('evidence-unavailable', 0, demuxError(
      'DEMUX_PARTIAL_DECODER_DESCRIPTION_MISSING',
      'length-prefixed H.264 partial output lacks the decoder configuration required by the neutral probe',
      'graceful-failure',
    ));
  }
  const native = representation?.nativeCodecTag;
  const codec = native && /^avc[13]\./i.test(native) ? native : 'avc1.42E01E';
  const config: VideoDecoderConfig = {
    codec,
    ...(description?.byteLength ? { description: description.slice() } : {}),
    ...(selected.track.width ? { codedWidth: selected.track.width } : {}),
    ...(selected.track.height ? { codedHeight: selected.track.height } : {}),
  };
  let supported: VideoDecoderSupport;
  try {
    supported = await VideoDecoder.isConfigSupported(config);
  } catch (error) {
    return assessment('evidence-unavailable', 0, demuxError(
      'DEMUX_PARTIAL_DECODER_CONFIG_INVALID',
      `neutral VideoDecoder config probe threw: ${message(error)}`,
      'graceful-failure',
    ));
  }
  if (!supported.supported) {
    return assessment('evidence-unavailable', 0, {
      state: 'UNAVAILABLE', oracle: 'graceful-failure', status: 'NA_BROWSER',
      reasonCode: 'DEMUX_PARTIAL_DECODER_CONFIG_UNSUPPORTED',
      detail: `browser does not support the exact neutral H.264 config '${codec}'`,
    });
  }
  if (!supported.config) {
    return assessment('evidence-unavailable', 0, demuxError(
      'DEMUX_PARTIAL_DECODER_CONFIG_RESULT_MISSING',
      'VideoDecoder support probe returned supported=true without the concrete config used for decode',
      'graceful-failure',
    ));
  }

  let decoderError: DOMException | null = null;
  let decodedFrames = 0;
  const decoder = new VideoDecoder({
    output(frame) {
      decodedFrames++;
      frame.close();
    },
    error(error) {
      decoderError = error;
    },
  });
  try {
    decoder.configure(supported.config);
    const structural = await validateTruncatedDemuxPartial({
      result,
      probeAccessUnit({ packet, track }) {
        if (track.type !== 'video') {
          return { state: 'PASS', detail: 'non-video packet retained for structural validation' };
        }
        try {
          decoder.decode(new EncodedVideoChunk({
            type: packet.keyframe ? 'key' : 'delta',
            timestamp: packet.ptsUs,
            ...(packet.durationUs !== undefined ? { duration: packet.durationUs } : {}),
            data: packet.payload!,
          }));
          return { state: 'PASS' };
        } catch (error) {
          return {
            state: 'FAIL', reasonCode: 'DEMUX_PARTIAL_ACCESS_UNIT_REJECTED',
            detail: `neutral VideoDecoder rejected a reported access unit: ${message(error)}`,
          };
        }
      },
    });
    if (structural.outcome.state !== 'VERDICT' || structural.outcome.verdict !== 'PASS') return structural;
    try {
      await decoder.flush();
    } catch (error) {
      return fail(structural.checkedAccessUnits, 'DEMUX_PARTIAL_TERMINAL_DECODE_FAILED',
        `neutral decoder could not flush the complete reported prefix: ${message(error)}`);
    }
    if (decoderError) {
      return fail(structural.checkedAccessUnits, 'DEMUX_PARTIAL_ACCESS_UNIT_DECODE_ERROR',
        `neutral decoder reported ${message(decoderError)}`);
    }
    const videoPackets = result.packets.filter((packet) => packet.trackIndex === selected.trackIndex).length;
    if (decodedFrames !== videoPackets) {
      return fail(structural.checkedAccessUnits, 'DEMUX_PARTIAL_DECODE_COVERAGE_MISMATCH',
        `neutral decoder produced ${decodedFrames} picture(s) for ${videoPackets} reported H.264 access unit(s)`);
    }
    return assessment('valid-complete-prefix', structural.checkedAccessUnits, demuxVerdict(
      'PASS', 'DEMUX_PARTIAL_COMPLETE_ACCESS_UNIT_PREFIX',
      `neutral VideoDecoder accepted and emitted all ${decodedFrames} reported H.264 picture(s)`,
      { completeAccessUnits: structural.checkedAccessUnits, decodedPictures: decodedFrames },
      'graceful-failure',
    ));
  } finally {
    if (decoder.state !== 'closed') decoder.close();
  }
}

/** Clean rejection is always an allowed disposition for a truncated/boundary input. */
export function classifyRejectedTruncatedDemux(): TruncatedDemuxPartialAssessment {
  return {
    disposition: 'valid-complete-prefix',
    checkedAccessUnits: 0,
    outcome: demuxVerdict(
      'PASS',
      'DEMUX_TRUNCATED_CLEAN_REJECT',
      'truncated H.264 input was cleanly rejected within its deadline',
      undefined,
      'graceful-failure',
    ),
  };
}

/**
 * A returned partial is not self-authenticating. Validate every packet reference/timeline/payload,
 * then require the neutral probe to reach every reported complete access unit. An AU cut at EOF must
 * be rejected by the probe; a complete prefix ending between AUs passes.
 */
export async function validateTruncatedDemuxPartial(
  input: ValidateTruncatedDemuxPartialInput,
): Promise<TruncatedDemuxPartialAssessment> {
  const minimum = input.minimumCompleteAccessUnits ?? 1;
  if (!Number.isSafeInteger(minimum) || minimum < 1) {
    return assessment('invalid-partial', 0, demuxError(
      'DEMUX_PARTIAL_POLICY_INVALID',
      'minimumCompleteAccessUnits must be a positive safe integer',
      'graceful-failure',
    ));
  }
  const result = input.result;
  if (result.packets.length < minimum) {
    return fail(0, 'DEMUX_PARTIAL_PACKET_PREFIX_EMPTY',
      `returned partial has ${result.packets.length} packet(s), minimum complete prefix is ${minimum}`);
  }
  if (!input.probeAccessUnit) {
    return assessment('evidence-unavailable', 0, demuxError(
      'DEMUX_PARTIAL_NEUTRAL_PROBE_MISSING',
      'returned partial cannot pass without a neutral complete-access-unit probe',
      'graceful-failure',
    ));
  }

  const representations = new Map((result.representations ?? []).map((entry) => [entry.trackIndex, entry]));
  const seenAccessUnits = new Set<string>();
  const lastClockByTrack = new Map<number, number>();
  let checked = 0;
  for (let packetIndex = 0; packetIndex < result.packets.length; packetIndex++) {
    const packet = result.packets[packetIndex]!;
    if (!Number.isSafeInteger(packet.trackIndex) || packet.trackIndex < 0 || packet.trackIndex >= result.metadata.tracks.length) {
      return fail(checked, 'DEMUX_PARTIAL_TRACK_REFERENCE_INVALID',
        `packet ${packetIndex} references absent track ${packet.trackIndex}`);
    }
    const track = result.metadata.tracks[packet.trackIndex]!;
    if (!Number.isSafeInteger(packet.size) || packet.size <= 0 || !Number.isFinite(packet.ptsUs) ||
        (packet.dtsUs !== undefined && !Number.isFinite(packet.dtsUs)) ||
        (packet.durationUs !== undefined && (!Number.isFinite(packet.durationUs) || packet.durationUs <= 0))) {
      return fail(checked, 'DEMUX_PARTIAL_PACKET_SHAPE_INVALID',
        `packet ${packetIndex} has an invalid size or timeline value`);
    }
    if (!(packet.payload instanceof Uint8Array) || packet.payload.byteLength === 0) {
      return fail(checked, 'DEMUX_PARTIAL_ACCESS_UNIT_BYTES_MISSING',
        `packet ${packetIndex} has no bounded access-unit payload for neutral validation`);
    }
    if (packet.payload.byteLength !== packet.size) {
      return fail(checked, 'DEMUX_PARTIAL_ACCESS_UNIT_SIZE_MISMATCH',
        `packet ${packetIndex} declares ${packet.size} byte(s) but retains ${packet.payload.byteLength}`);
    }
    if (packet.accessUnitId) {
      const key = `${packet.trackIndex}:${packet.accessUnitId}`;
      if (seenAccessUnits.has(key)) {
        return fail(checked, 'DEMUX_PARTIAL_ACCESS_UNIT_DUPLICATE',
          `packet ${packetIndex} repeats access-unit identity '${packet.accessUnitId}'`);
      }
      seenAccessUnits.add(key);
    }
    const clock = result.packetOrdering === 'presentation' ? packet.ptsUs : packet.dtsUs;
    if (clock !== undefined) {
      const prior = lastClockByTrack.get(packet.trackIndex);
      if (prior !== undefined && clock < prior) {
        return fail(checked, 'DEMUX_PARTIAL_TIMELINE_REGRESSION',
          `track ${packet.trackIndex} ${result.packetOrdering === 'presentation' ? 'PTS' : 'DTS'} regresses at packet ${packetIndex}`);
      }
      lastClockByTrack.set(packet.trackIndex, clock);
    }

    let probe: DemuxAccessUnitProbeResult;
    try {
      probe = await input.probeAccessUnit({
        packet,
        track,
        representation: representations.get(packet.trackIndex),
        packetIndex,
      });
    } catch (error) {
      return assessment('evidence-unavailable', checked, demuxError(
        'DEMUX_PARTIAL_NEUTRAL_PROBE_THROW',
        `neutral access-unit probe threw at packet ${packetIndex}: ${message(error)}`,
        'graceful-failure',
      ));
    }
    if (probe.state === 'FAIL') return fail(checked, probe.reasonCode, probe.detail);
    if (probe.state === 'ERROR') {
      return assessment('evidence-unavailable', checked, demuxError(
        probe.reasonCode,
        probe.detail,
        'graceful-failure',
      ));
    }
    if (probe.state === 'UNAVAILABLE') {
      return assessment('evidence-unavailable', checked, {
        state: 'UNAVAILABLE',
        oracle: 'graceful-failure',
        status: 'NA_BROWSER',
        reasonCode: probe.reasonCode,
        detail: probe.detail,
      });
    }
    checked++;
  }

  return assessment('valid-complete-prefix', checked, demuxVerdict(
    'PASS',
    'DEMUX_PARTIAL_COMPLETE_ACCESS_UNIT_PREFIX',
    `neutral probe accepted all ${checked} complete access unit(s), including the terminal packet`,
    { completeAccessUnits: checked, mediaTracks: result.metadata.tracks.length },
    'graceful-failure',
  ));
}

function fail(checked: number, reasonCode: string, detail: string): TruncatedDemuxPartialAssessment {
  return assessment('invalid-partial', checked, demuxVerdict(
    'FAIL', reasonCode, detail, { checkedAccessUnits: checked }, 'graceful-failure',
  ));
}

function assessment(
  disposition: TruncatedDemuxPartialAssessment['disposition'],
  checkedAccessUnits: number,
  outcome: OracleOutcome,
): TruncatedDemuxPartialAssessment {
  return Object.freeze({ disposition, checkedAccessUnits, outcome });
}

function message(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
