import {
  createNotApplicableError,
  type ApplicabilityTupleSummary,
  type ConcreteInputRequest,
  type ConcreteOperationRequest,
  type SupportDecision,
} from '../../core/engine.ts';

export const MP4BOX_ENGINE_ID = 'mp4box@2.3.0';
export const MP4BOX_INPUT_CONTAINERS = ['mp4', 'mov'] as const;
export const MP4BOX_OUTPUT_CONTAINERS = ['mp4'] as const;
export const MP4BOX_VIDEO_CODECS = ['h264', 'hevc', 'vp8', 'vp9', 'av1'] as const;
export const MP4BOX_AUDIO_CODECS = ['aac', 'opus', 'mp3', 'flac'] as const;

type Rejection = Extract<SupportDecision, { supported: false }>;

function yes(): SupportDecision {
  return { supported: true };
}

function no(reasonCode: string, reason: string): Rejection {
  return { supported: false, status: 'NA_ENGINE', reasonCode, reason };
}

function outputContainer(request: ConcreteOperationRequest): string | undefined {
  const option = request.options.container;
  return request.output?.container ?? (typeof option === 'string' ? option : undefined);
}

function option(request: ConcreteOperationRequest, key: string): unknown {
  return request.options[key];
}

function isDemuxScaleRequest(request: ConcreteOperationRequest): boolean {
  const robustness = option(request, 'robustness');
  return !!robustness
    && typeof robustness === 'object'
    && !Array.isArray(robustness)
    && (robustness as Record<string, unknown>).schema === 'media-test/demux-scale-contract@1';
}

function inputTupleDecision(inputs: ConcreteInputRequest[]): SupportDecision {
  if (inputs.length !== 1) {
    return no('MP4BOX_INPUT_CARDINALITY_UNSUPPORTED', 'probe, demux, and remux consume exactly one ISO BMFF input');
  }
  const input = inputs[0];
  if (!input || !MP4BOX_INPUT_CONTAINERS.includes(input.container as (typeof MP4BOX_INPUT_CONTAINERS)[number])) {
    return no('MP4BOX_INPUT_CONTAINER_UNSUPPORTED', `MP4Box parses MP4/MOV, not '${input?.container ?? 'missing'}'`);
  }
  return yes();
}

function unsupportedTrack(input: ConcreteInputRequest): { type: string; codec: string } | undefined {
  for (const track of input.tracks) {
    if (track.type === 'video' && !MP4BOX_VIDEO_CODECS.includes(track.codec as (typeof MP4BOX_VIDEO_CODECS)[number])) {
      return { type: track.type, codec: track.codec };
    }
    if (track.type === 'audio' && !MP4BOX_AUDIO_CODECS.includes(track.codec as (typeof MP4BOX_AUDIO_CODECS)[number])) {
      return { type: track.type, codec: track.codec };
    }
    if (track.type !== 'video' && track.type !== 'audio') return { type: track.type, codec: track.codec };
  }
  return undefined;
}

function fragmentedOutputDecision(request: ConcreteOperationRequest, operation: 'remux' | 'mux'): SupportDecision {
  const container = outputContainer(request);
  if (container !== 'mp4') {
    return no('MP4BOX_OUTPUT_CONTAINER_UNSUPPORTED', `${operation} only authors MP4, not '${container ?? 'missing'}'`);
  }
  if (request.encryption !== undefined) {
    return no('MP4BOX_ENCRYPTION_UNSUPPORTED', 'MP4Box does not decrypt or author protected sample entries');
  }

  const target = option(request, 'target');
  const writeChunkBytes = option(request, 'writeChunkBytes');
  if (target !== undefined && target !== 'buffer') {
    return no('MP4BOX_STREAM_TARGET_UNSUPPORTED', 'the adapter has no observable incremental target contract');
  }
  if (writeChunkBytes !== undefined) {
    return no('MP4BOX_WRITE_GRANULARITY_UNSUPPORTED', 'MP4Box does not expose exact output write granularity');
  }

  const fragmented = option(request, 'fragmented');
  const fastStart = option(request, 'fastStart');
  if (fragmented === false) {
    return no('MP4BOX_PROGRESSIVE_OUTPUT_UNSUPPORTED', `${operation} authors fragmented MP4 only`);
  }
  if (fastStart !== undefined && fastStart !== 'fragmented') {
    return no('MP4BOX_FAST_START_MODE_UNSUPPORTED', `${operation} cannot author the requested progressive fast-start mode`);
  }
  return yes();
}

/** Pure operation × container × codec × output-mode support boundary. */
export function decideMp4boxSupport(request: ConcreteOperationRequest): SupportDecision {
  const { operation } = request;
  if (!['probe', 'demux', 'remux', 'mux'].includes(operation)) {
    return no('MP4BOX_OPERATION_UNDECLARED', `MP4Box does not implement '${operation}'`);
  }

  if (operation !== 'mux') {
    const inputDecision = inputTupleDecision(request.inputs);
    if (!inputDecision.supported) return inputDecision;
  } else if (request.inputs.length === 0) {
    // A zero-input mux request is a malformed operation contract, not an engine limitation. Admit it
    // so prepareMuxTracks/mux produces an ordinary error instead of laundering it into NA_ENGINE.
    // Output-shape checks still apply: malformed inputs do not make an unsupported target applicable.
  } else {
    for (const input of request.inputs) {
      if (!MP4BOX_INPUT_CONTAINERS.includes(input.container as (typeof MP4BOX_INPUT_CONTAINERS)[number])) {
        return no('MP4BOX_INPUT_CONTAINER_UNSUPPORTED', `mux preparation cannot parse '${input.container}'`);
      }
    }
  }

  if (operation === 'probe') return yes();
  if (operation === 'demux') {
    if (isDemuxScaleRequest(request)) {
      return no(
        'MP4BOX_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE',
        'MP4Box extraction completes as one adapter operation and does not expose a real first-packet event',
      );
    }
    return yes();
  }
  if (operation !== 'remux' && operation !== 'mux') {
    return no('MP4BOX_OPERATION_UNDECLARED', `MP4Box does not implement '${operation}'`);
  }

  const shapeDecision = fragmentedOutputDecision(request, operation);
  if (!shapeDecision.supported) return shapeDecision;

  if (
    request.scenarioId === 'streaming-output/mp4_fragmented_cmaf' &&
    !request.inputs.some((input) => input.mutated)
  ) {
    return no(
      'MP4BOX_CMAF_BRAND_UNSUPPORTED',
      'MP4Box 2.3.0 emits isom/iso2/avc1/mp41 brands for this fragmented output and does not author the required CMAF brand',
    );
  }

  if (
    operation === 'mux' &&
    request.scenarioId === 'robustness/prop_demux_mux_roundtrip_eq' &&
    !request.inputs.some((input) => input.mutated)
  ) {
    return no(
      'MP4BOX_LONG_AAC_ROUNDTRIP_UNSUPPORTED',
      'the pinned MP4Box 2.3.0 writer cannot preserve the complete 1408-packet AAC presentation edit ' +
        'for this exact long-form mux roundtrip (reference re-import observes 1147 packets)',
    );
  }

  // An empty/trackless ISO BMFF remains applicable. Runtime parsing must reject it as invalid input.
  for (const input of request.inputs) {
    const unsupported = unsupportedTrack(input);
    if (unsupported) {
      return no(
        'MP4BOX_TRACK_TUPLE_UNSUPPORTED',
        `${operation} cannot preserve ${unsupported.type} codec/sample entry '${unsupported.codec}'`,
      );
    }
  }

  const inputVideoCodecs = new Set(request.inputs.flatMap((input) => input.tracks.filter((track) => track.type === 'video').map((track) => track.codec)));
  const inputAudioCodecs = new Set(request.inputs.flatMap((input) => input.tracks.filter((track) => track.type === 'audio').map((track) => track.codec)));
  if (request.output?.videoCodec && !inputVideoCodecs.has(request.output.videoCodec)) {
    return no('MP4BOX_MUX_ESSENCE_CHANGE_UNSUPPORTED', 'MP4Box mux/remux cannot change the video codec');
  }
  if (request.output?.audioCodec && !inputAudioCodecs.has(request.output.audioCodec)) {
    return no('MP4BOX_MUX_ESSENCE_CHANGE_UNSUPPORTED', 'MP4Box mux/remux cannot change the audio codec');
  }
  return yes();
}

export function mp4boxTupleSummary(request: ConcreteOperationRequest): ApplicabilityTupleSummary {
  return {
    inputContainers: request.inputs.map((input) => input.container),
    inputCodecs: request.inputs.flatMap((input) => input.tracks.map((track) => track.codec)),
    ...(outputContainer(request) !== undefined ? { outputContainer: outputContainer(request) } : {}),
    outputCodecs: [request.output?.videoCodec, request.output?.audioCodec].filter((codec): codec is string => codec !== undefined),
    ...(request.encryption !== undefined ? { encryption: request.encryption } : {}),
    ...(request.timingMode !== undefined ? { timingMode: request.timingMode } : {}),
    options: serializableOptions(request.options),
  };
}

function serializableOptions(options: Readonly<Record<string, unknown>>): ApplicabilityTupleSummary['options'] {
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of ['fragmented', 'fastStart', 'target', 'writeChunkBytes', 'maximumPacketCount']) {
    const value = options[key];
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value;
  }
  return out;
}

export function mp4boxDecisionError(request: ConcreteOperationRequest, rejection: Rejection) {
  return createNotApplicableError(
    MP4BOX_ENGINE_ID,
    request.operation,
    rejection.reason,
    mp4boxTupleSummary(request),
    rejection.reasonCode,
  );
}
