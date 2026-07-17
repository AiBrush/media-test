import { trimError, trimVerdict, type TrimDecision } from './types.ts';

export type TrimAudioContainer = 'mp3' | 'ogg' | 'adts' | 'flac' | 'wav' | 'aiff';

export interface AudioContainerEvidence {
  readonly container: TrimAudioContainer;
  readonly codec: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly codedSampleFrames: number;
  readonly presentationSampleFrames: number;
  readonly primingSampleFrames: number;
  readonly endTrimSampleFrames: number;
  readonly precision: 'exact' | 'coded-frame-estimate';
  readonly packetOrFrameCount: number;
  readonly metadataTotalSampleFrames?: number;
  readonly seekTablePresent?: boolean;
  readonly endOfStreamPresent?: boolean;
}

export type AudioContainerReadResult =
  | { readonly state: 'OK'; readonly value: AudioContainerEvidence }
  | {
      readonly state: 'UNSUPPORTED_FORMAT' | 'MALFORMED' | 'INCOMPLETE';
      readonly reasonCode: string;
      readonly detail: string;
      readonly offset?: number;
    };

export interface DecodedAudioBoundaryEvidence {
  readonly sampleRate: number;
  readonly channels: number;
  /** Interleaved-channel-independent sample-frame count. */
  readonly sampleFrames: number;
  readonly firstWindowDigest: string;
  readonly lastWindowDigest: string;
}

export interface AudioTrimReferenceEvidence extends DecodedAudioBoundaryEvidence {
  readonly sourceStartSampleFrame: number;
  readonly sourceEndSampleFrame: number;
}

export interface AudioTrimAssessmentInput {
  readonly reference: AudioTrimReferenceEvidence;
  readonly candidate: DecodedAudioBoundaryEvidence;
  readonly container: AudioContainerReadResult;
  /** Decoded PCM is exact; this separate band is only for a container's coded-frame estimate. */
  readonly containerSampleFrameTolerance?: number;
  readonly sampleFrameTolerance?: number;
  readonly representationDifferences?: readonly string[];
}

export function inspectTrimAudioContainer(
  bytes: Uint8Array,
  container: string,
): AudioContainerReadResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return problem('INCOMPLETE', 'TRIM_AUDIO_INPUT_EMPTY', 'audio output is empty');
  }
  switch (container.trim().toLowerCase()) {
    case 'mp3': return inspectMp3(bytes);
    case 'ogg':
    case 'opus': return inspectOggOpus(bytes);
    case 'adts':
    case 'aac': return inspectAdts(bytes);
    case 'flac': return inspectFlac(bytes);
    case 'wav': return inspectWav(bytes);
    case 'aiff':
    case 'aif':
    case 'aifc': return inspectAiff(bytes);
    default:
      return problem('UNSUPPORTED_FORMAT', 'TRIM_AUDIO_FORMAT_UNSUPPORTED', `no trim audio reader for '${container}'`);
  }
}

/** Decoded program samples are the gate; container counters must describe that same presentation. */
export function assessAudioTrimEvidence(input: AudioTrimAssessmentInput): TrimDecision {
  if (input.container.state !== 'OK') {
    if (input.container.state === 'UNSUPPORTED_FORMAT') {
      return trimError(input.container.reasonCode, input.container.detail);
    }
    return trimVerdict('FAIL', input.container.reasonCode, input.container.detail);
  }
  const native = input.container.value;
  const tolerance = input.sampleFrameTolerance ?? 0;
  const containerTolerance = input.containerSampleFrameTolerance ?? tolerance;
  if (!Number.isSafeInteger(tolerance) || tolerance < 0) {
    return trimError('TRIM_AUDIO_TOLERANCE_INVALID', 'sample-frame tolerance must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(containerTolerance) || containerTolerance < 0) {
    return trimError(
      'TRIM_AUDIO_CONTAINER_TOLERANCE_INVALID',
      'container sample-frame tolerance must be a non-negative safe integer',
    );
  }
  const failures: string[] = [];
  const reference = input.reference;
  const candidate = input.candidate;
  if (candidate.sampleRate !== reference.sampleRate) {
    failures.push(`decoded sample rate ${candidate.sampleRate} vs ${reference.sampleRate}`);
  }
  if (candidate.channels !== reference.channels) {
    failures.push(`decoded channels ${candidate.channels} vs ${reference.channels}`);
  }
  if (native.sampleRate !== candidate.sampleRate) {
    failures.push(`container sample rate ${native.sampleRate} vs decoded ${candidate.sampleRate}`);
  }
  if (native.channels !== candidate.channels) {
    failures.push(`container channels ${native.channels} vs decoded ${candidate.channels}`);
  }
  if (Math.abs(candidate.sampleFrames - reference.sampleFrames) > tolerance) {
    failures.push(`decoded sample frames ${candidate.sampleFrames} vs expected ${reference.sampleFrames}`);
  }
  if (Math.abs(native.presentationSampleFrames - candidate.sampleFrames) > containerTolerance) {
    failures.push(
      `container presentation frames ${native.presentationSampleFrames} vs decoded ${candidate.sampleFrames}`,
    );
  }
  if (native.metadataTotalSampleFrames !== undefined &&
      Math.abs(native.metadataTotalSampleFrames - candidate.sampleFrames) > containerTolerance) {
    failures.push(
      `container total-samples metadata ${native.metadataTotalSampleFrames} vs decoded ${candidate.sampleFrames}`,
    );
  }
  if (normalizeDigest(candidate.firstWindowDigest) !== normalizeDigest(reference.firstWindowDigest)) {
    failures.push('decoded first PCM window differs from the requested source boundary');
  }
  if (normalizeDigest(candidate.lastWindowDigest) !== normalizeDigest(reference.lastWindowDigest)) {
    failures.push('decoded last PCM window differs from the requested source boundary');
  }

  const measurements = {
    expectedSampleFrames: reference.sampleFrames,
    decodedSampleFrames: candidate.sampleFrames,
    containerPresentationSampleFrames: native.presentationSampleFrames,
    codedSampleFrames: native.codedSampleFrames,
    primingSampleFrames: native.primingSampleFrames,
    endTrimSampleFrames: native.endTrimSampleFrames,
    sampleRate: native.sampleRate,
    channels: native.channels,
    sourceStartSampleFrame: reference.sourceStartSampleFrame,
    sourceEndSampleFrame: reference.sourceEndSampleFrame,
    decodedSampleFrameTolerance: tolerance,
    containerSampleFrameTolerance: containerTolerance,
  };
  if (failures.length > 0) {
    return trimVerdict('FAIL', 'TRIM_AUDIO_PROGRAM_CONTENT_MISMATCH', failures.join('; '), measurements);
  }
  const representationDifferences = [...new Set(input.representationDifferences ?? [])].sort();
  if (representationDifferences.length > 0) {
    return trimVerdict(
      'PASS',
      'TRIM_AUDIO_REPRESENTATION_DIFFERENCE',
      `decoded PCM and sample time match; ${representationDifferences.join(', ')}`,
      measurements,
      { representationDifferences },
    );
  }
  return trimVerdict(
    'PASS',
    'TRIM_AUDIO_PROGRAM_CONTENT_MATCH',
    `${candidate.sampleFrames} decoded sample frame(s) and both PCM boundaries match`,
    measurements,
  );
}

function inspectAdts(bytes: Uint8Array): AudioContainerReadResult {
  const rates = [96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350];
  let offset = 0;
  let sampleRate = 0;
  let channels = 0;
  let sampleFrames = 0;
  let frameCount = 0;
  while (offset < bytes.byteLength) {
    if (offset + 7 > bytes.byteLength) return problem('INCOMPLETE', 'ADTS_HEADER_TRUNCATED', 'ADTS frame header is truncated', offset);
    const b0 = bytes[offset]!;
    const b1 = bytes[offset + 1]!;
    if (b0 !== 0xff || (b1 & 0xf6) !== 0xf0) {
      return problem('MALFORMED', 'ADTS_SYNC_INVALID', 'ADTS syncword/layer is invalid', offset);
    }
    const frequencyIndex = (bytes[offset + 2]! >> 2) & 0x0f;
    const rate = rates[frequencyIndex];
    if (!rate) return problem('MALFORMED', 'ADTS_SAMPLE_RATE_INVALID', `reserved ADTS frequency index ${frequencyIndex}`, offset);
    const channelConfig = ((bytes[offset + 2]! & 1) << 2) | (bytes[offset + 3]! >> 6);
    if (channelConfig <= 0) return problem('UNSUPPORTED_FORMAT', 'ADTS_PCE_CHANNEL_CONFIG_UNSUPPORTED', 'ADTS program-config-element channel layout is not implemented', offset);
    const frameLength = ((bytes[offset + 3]! & 3) << 11) | (bytes[offset + 4]! << 3) | (bytes[offset + 5]! >> 5);
    const headerLength = (b1 & 1) === 1 ? 7 : 9;
    if (frameLength < headerLength) return problem('MALFORMED', 'ADTS_FRAME_LENGTH_INVALID', `ADTS frame length ${frameLength} is invalid`, offset);
    if (offset + frameLength > bytes.byteLength) return problem('INCOMPLETE', 'ADTS_FRAME_TRUNCATED', 'ADTS frame payload is truncated', offset);
    if (frameCount > 0 && (rate !== sampleRate || channelConfig !== channels)) {
      return problem('MALFORMED', 'ADTS_CONFIG_CHANGED', 'ADTS sample rate/channel configuration changes midstream', offset);
    }
    sampleRate = rate;
    channels = channelConfig;
    sampleFrames += 1024 * ((bytes[offset + 6]! & 3) + 1);
    frameCount++;
    offset += frameLength;
  }
  if (frameCount === 0) return problem('INCOMPLETE', 'ADTS_FRAMES_MISSING', 'ADTS output contains no complete frames');
  return ok({
    container: 'adts', codec: 'aac', sampleRate, channels,
    codedSampleFrames: sampleFrames, presentationSampleFrames: sampleFrames,
    primingSampleFrames: 0, endTrimSampleFrames: 0,
    precision: 'exact', packetOrFrameCount: frameCount,
  });
}

function inspectOggOpus(bytes: Uint8Array): AudioContainerReadResult {
  let offset = 0;
  let serial: number | undefined;
  let expectedSequence: number | undefined;
  let packet = new Uint8Array(0);
  const packets: Uint8Array[] = [];
  let pages = 0;
  let finalGranule: number | undefined;
  let eos = false;
  while (offset < bytes.byteLength) {
    if (offset + 27 > bytes.byteLength) return problem('INCOMPLETE', 'OGG_PAGE_HEADER_TRUNCATED', 'Ogg page header is truncated', offset);
    if (ascii(bytes, offset, 4) !== 'OggS' || bytes[offset + 4] !== 0) {
      return problem('MALFORMED', 'OGG_CAPTURE_PATTERN_INVALID', 'Ogg capture pattern/version is invalid', offset);
    }
    const pageSegments = bytes[offset + 26]!;
    const tableStart = offset + 27;
    if (tableStart + pageSegments > bytes.byteLength) return problem('INCOMPLETE', 'OGG_LACING_TRUNCATED', 'Ogg lacing table is truncated', offset);
    let payloadLength = 0;
    for (let index = 0; index < pageSegments; index++) payloadLength += bytes[tableStart + index]!;
    const payloadStart = tableStart + pageSegments;
    const pageEnd = payloadStart + payloadLength;
    if (pageEnd > bytes.byteLength) return problem('INCOMPLETE', 'OGG_PAGE_PAYLOAD_TRUNCATED', 'Ogg page payload is truncated', offset);
    const pageSerial = u32le(bytes, offset + 14);
    const sequence = u32le(bytes, offset + 18);
    if (serial !== undefined && pageSerial !== serial) {
      return problem('UNSUPPORTED_FORMAT', 'OGG_MULTIPLE_STREAMS_UNSUPPORTED', 'multiple Ogg logical streams are not supported', offset);
    }
    if (expectedSequence !== undefined && sequence !== expectedSequence) {
      return problem('MALFORMED', 'OGG_PAGE_SEQUENCE_GAP', `Ogg page sequence ${sequence} follows ${expectedSequence - 1}`, offset);
    }
    serial = pageSerial;
    expectedSequence = sequence + 1;
    const headerType = bytes[offset + 5]!;
    const continued = (headerType & 1) !== 0;
    if (continued !== (packet.byteLength > 0)) {
      return problem('MALFORMED', 'OGG_PACKET_CONTINUATION_INVALID', 'Ogg continued-packet flag disagrees with lacing state', offset);
    }
    let payloadOffset = payloadStart;
    for (let index = 0; index < pageSegments; index++) {
      const length = bytes[tableStart + index]!;
      packet = appendBytes(packet, bytes.subarray(payloadOffset, payloadOffset + length));
      payloadOffset += length;
      if (length < 255) {
        packets.push(packet);
        packet = new Uint8Array(0);
      }
    }
    const granule = u64le(bytes, offset + 6);
    if (granule !== 0xffff_ffff_ffff_ffffn) {
      const value = Number(granule);
      if (!Number.isSafeInteger(value)) return problem('UNSUPPORTED_FORMAT', 'OGG_GRANULE_TOO_LARGE', 'Ogg granule exceeds safe integer range', offset);
      finalGranule = value;
    }
    if ((headerType & 4) !== 0) eos = true;
    pages++;
    offset = pageEnd;
  }
  if (packet.byteLength > 0) return problem('INCOMPLETE', 'OGG_PACKET_TRUNCATED', 'final Ogg packet is incomplete');
  const head = packets[0];
  if (!head || ascii(head, 0, 8) !== 'OpusHead' || head.byteLength < 19) {
    return problem('UNSUPPORTED_FORMAT', 'OGG_OPUS_HEAD_MISSING', 'Ogg stream does not begin with a complete OpusHead packet');
  }
  const channels = head[9]!;
  const preSkip = u16le(head, 10);
  if (channels <= 0 || finalGranule === undefined || finalGranule < preSkip) {
    return problem('MALFORMED', 'OGG_OPUS_GRANULE_INVALID', 'Opus channels/pre-skip/final granule are inconsistent');
  }
  if (!eos) return problem('INCOMPLETE', 'OGG_EOS_MISSING', 'Ogg Opus output has no EOS page');
  const presentation = finalGranule - preSkip;
  return ok({
    container: 'ogg', codec: 'opus', sampleRate: 48_000, channels,
    codedSampleFrames: finalGranule,
    presentationSampleFrames: presentation,
    primingSampleFrames: preSkip,
    endTrimSampleFrames: 0,
    precision: 'exact', packetOrFrameCount: Math.max(0, packets.length - 2),
    metadataTotalSampleFrames: presentation,
    endOfStreamPresent: true,
  });
}

function inspectFlac(bytes: Uint8Array): AudioContainerReadResult {
  if (bytes.byteLength < 8 || ascii(bytes, 0, 4) !== 'fLaC') {
    return problem('UNSUPPORTED_FORMAT', 'FLAC_MARKER_MISSING', 'FLAC stream marker is absent');
  }
  let offset = 4;
  let streamInfo: Uint8Array | undefined;
  let seekTablePresent = false;
  let blocks = 0;
  let last = false;
  while (!last) {
    if (offset + 4 > bytes.byteLength) return problem('INCOMPLETE', 'FLAC_METADATA_HEADER_TRUNCATED', 'FLAC metadata header is truncated', offset);
    const first = bytes[offset]!;
    last = (first & 0x80) !== 0;
    const type = first & 0x7f;
    const length = (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const body = offset + 4;
    if (body + length > bytes.byteLength) return problem('INCOMPLETE', 'FLAC_METADATA_BLOCK_TRUNCATED', 'FLAC metadata block is truncated', offset);
    if (type === 0) {
      if (streamInfo || length !== 34) return problem('MALFORMED', 'FLAC_STREAMINFO_INVALID', 'FLAC must contain one 34-byte STREAMINFO first', offset);
      streamInfo = bytes.subarray(body, body + length);
    }
    if (type === 3) seekTablePresent = true;
    blocks++;
    offset = body + length;
    if (blocks > 128) return problem('MALFORMED', 'FLAC_METADATA_BLOCK_LIMIT', 'FLAC metadata block count exceeds safety limit');
  }
  if (!streamInfo) return problem('MALFORMED', 'FLAC_STREAMINFO_MISSING', 'FLAC STREAMINFO is missing');
  const packed = u64be(streamInfo, 10);
  const sampleRate = Number((packed >> 44n) & 0xfffffn);
  const channels = Number((packed >> 41n) & 0x7n) + 1;
  const totalSamples = Number(packed & 0xfffffffffn);
  if (sampleRate <= 0 || channels <= 0 || !Number.isSafeInteger(totalSamples) || totalSamples <= 0) {
    return problem('MALFORMED', 'FLAC_STREAMINFO_TIMING_INVALID', 'FLAC STREAMINFO sample rate/total samples are invalid');
  }
  if (offset >= bytes.byteLength) return problem('INCOMPLETE', 'FLAC_AUDIO_FRAMES_MISSING', 'FLAC contains metadata but no audio frames');
  return ok({
    container: 'flac', codec: 'flac', sampleRate, channels,
    codedSampleFrames: totalSamples, presentationSampleFrames: totalSamples,
    primingSampleFrames: 0, endTrimSampleFrames: 0,
    precision: 'exact', packetOrFrameCount: 1,
    metadataTotalSampleFrames: totalSamples,
    seekTablePresent,
  });
}

function inspectMp3(bytes: Uint8Array): AudioContainerReadResult {
  let offset = skipId3v2(bytes);
  let frames = 0;
  let sampleRate = 0;
  let channels = 0;
  let samplesPerFrame = 0;
  let delay = 0;
  let padding = 0;
  while (offset + 4 <= bytes.byteLength) {
    if (isTrailingMp3Tag(bytes, offset)) break;
    const parsed = mp3FrameHeader(bytes, offset);
    if (!parsed) {
      if (frames === 0 && offset < Math.min(bytes.byteLength, 64 * 1024)) {
        offset++;
        continue;
      }
      return problem('MALFORMED', 'MP3_FRAME_HEADER_INVALID', 'MP3 frame header is invalid', offset);
    }
    if (offset + parsed.frameBytes > bytes.byteLength) return problem('INCOMPLETE', 'MP3_FRAME_TRUNCATED', 'MP3 frame payload is truncated', offset);
    if (frames > 0 && (parsed.sampleRate !== sampleRate || parsed.channels !== channels || parsed.samples !== samplesPerFrame)) {
      return problem('MALFORMED', 'MP3_CONFIG_CHANGED', 'MP3 version/rate/channel configuration changes midstream', offset);
    }
    if (frames === 0) {
      sampleRate = parsed.sampleRate;
      channels = parsed.channels;
      samplesPerFrame = parsed.samples;
      const gapless = readMp3LameGapless(bytes.subarray(offset, offset + parsed.frameBytes), parsed);
      delay = gapless.delay;
      padding = gapless.padding;
    }
    frames++;
    offset += parsed.frameBytes;
  }
  if (frames === 0) return problem('UNSUPPORTED_FORMAT', 'MP3_FRAMES_MISSING', 'no MPEG audio frames were found');
  const coded = frames * samplesPerFrame;
  if (delay + padding >= coded) return problem('MALFORMED', 'MP3_GAPLESS_VALUES_INVALID', 'MP3 delay/padding consume the complete coded stream');
  return ok({
    container: 'mp3', codec: 'mp3', sampleRate, channels,
    codedSampleFrames: coded,
    presentationSampleFrames: coded - delay - padding,
    primingSampleFrames: delay,
    endTrimSampleFrames: padding,
    precision: delay || padding ? 'exact' : 'coded-frame-estimate',
    packetOrFrameCount: frames,
  });
}

function inspectWav(bytes: Uint8Array): AudioContainerReadResult {
  if (bytes.byteLength < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
    return problem('UNSUPPORTED_FORMAT', 'WAV_HEADER_MISSING', 'RIFF/WAVE header is absent');
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let blockAlign = 0;
  let dataBytes: number | undefined;
  while (offset + 8 <= bytes.byteLength) {
    const type = ascii(bytes, offset, 4);
    const size = u32le(bytes, offset + 4);
    const body = offset + 8;
    if (body + size > bytes.byteLength) return problem('INCOMPLETE', 'WAV_CHUNK_TRUNCATED', `${type} chunk is truncated`, offset);
    if (type === 'fmt ' && size >= 16) {
      channels = u16le(bytes, body + 2);
      sampleRate = u32le(bytes, body + 4);
      blockAlign = u16le(bytes, body + 12);
    } else if (type === 'data') dataBytes = size;
    offset = body + size + (size & 1);
  }
  if (!sampleRate || !channels || !blockAlign || dataBytes === undefined || dataBytes % blockAlign !== 0) {
    return problem('MALFORMED', 'WAV_TIMING_FIELDS_INVALID', 'WAV fmt/data fields do not form complete sample frames');
  }
  const frames = dataBytes / blockAlign;
  return ok({
    container: 'wav', codec: 'pcm', sampleRate, channels,
    codedSampleFrames: frames, presentationSampleFrames: frames,
    primingSampleFrames: 0, endTrimSampleFrames: 0,
    precision: 'exact', packetOrFrameCount: 1, metadataTotalSampleFrames: frames,
  });
}

function inspectAiff(bytes: Uint8Array): AudioContainerReadResult {
  if (bytes.byteLength < 12 || ascii(bytes, 0, 4) !== 'FORM' || !['AIFF', 'AIFC'].includes(ascii(bytes, 8, 4))) {
    return problem('UNSUPPORTED_FORMAT', 'AIFF_HEADER_MISSING', 'FORM/AIFF header is absent');
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let sampleFrames = 0;
  let hasSound = false;
  while (offset + 8 <= bytes.byteLength) {
    const type = ascii(bytes, offset, 4);
    const size = u32be(bytes, offset + 4);
    const body = offset + 8;
    if (body + size > bytes.byteLength) return problem('INCOMPLETE', 'AIFF_CHUNK_TRUNCATED', `${type} chunk is truncated`, offset);
    if (type === 'COMM' && size >= 18) {
      channels = u16be(bytes, body);
      sampleFrames = u32be(bytes, body + 2);
      sampleRate = readExtended80(bytes, body + 8);
    } else if (type === 'SSND') hasSound = size >= 8;
    offset = body + size + (size & 1);
  }
  if (!sampleRate || !channels || !sampleFrames || !hasSound) {
    return problem('MALFORMED', 'AIFF_TIMING_FIELDS_INVALID', 'AIFF COMM/SSND fields are incomplete');
  }
  return ok({
    container: 'aiff', codec: 'pcm', sampleRate, channels,
    codedSampleFrames: sampleFrames, presentationSampleFrames: sampleFrames,
    primingSampleFrames: 0, endTrimSampleFrames: 0,
    precision: 'exact', packetOrFrameCount: 1, metadataTotalSampleFrames: sampleFrames,
  });
}

interface Mp3Header {
  frameBytes: number;
  sampleRate: number;
  channels: number;
  samples: number;
  version: 1 | 2 | 2.5;
  layer: 1 | 2 | 3;
  crc: boolean;
}

function mp3FrameHeader(bytes: Uint8Array, offset: number): Mp3Header | undefined {
  const word = u32be(bytes, offset);
  if (word >>> 21 !== 0x7ff) return undefined;
  const versionBits = (word >>> 19) & 3;
  const layerBits = (word >>> 17) & 3;
  const bitrateIndex = (word >>> 12) & 0x0f;
  const rateIndex = (word >>> 10) & 3;
  if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return undefined;
  const version: Mp3Header['version'] = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const layer: Mp3Header['layer'] = layerBits === 3 ? 1 : layerBits === 2 ? 2 : 3;
  const rateBase = [44_100, 48_000, 32_000][rateIndex]!;
  const sampleRate = version === 1 ? rateBase : version === 2 ? rateBase / 2 : rateBase / 4;
  const mpeg1Rates = {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  } as const;
  const lowRates = {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  } as const;
  const bitrateKbps = (version === 1 ? mpeg1Rates : lowRates)[layer][bitrateIndex]!;
  const bitrate = bitrateKbps * 1000;
  const padding = (word >>> 9) & 1;
  const samples = layer === 1 ? 384 : layer === 2 ? 1152 : version === 1 ? 1152 : 576;
  const frameBytes = layer === 1
    ? Math.floor(12 * bitrate / sampleRate + padding) * 4
    : Math.floor((layer === 3 && version !== 1 ? 72 : 144) * bitrate / sampleRate + padding);
  if (frameBytes < 4) return undefined;
  return {
    frameBytes, sampleRate, channels: ((word >>> 6) & 3) === 3 ? 1 : 2,
    samples, version, layer, crc: ((word >>> 16) & 1) === 0,
  };
}

function readMp3LameGapless(frame: Uint8Array, header: Mp3Header): { delay: number; padding: number } {
  if (header.layer !== 3) return { delay: 0, padding: 0 };
  const sideInfo = header.version === 1
    ? (header.channels === 1 ? 17 : 32)
    : (header.channels === 1 ? 9 : 17);
  const xing = 4 + (header.crc ? 2 : 0) + sideInfo;
  if (!['Xing', 'Info'].includes(ascii(frame, xing, 4)) || xing + 8 > frame.byteLength) return { delay: 0, padding: 0 };
  const flags = u32be(frame, xing + 4);
  let cursor = xing + 8;
  if (flags & 1) cursor += 4;
  if (flags & 2) cursor += 4;
  if (flags & 4) cursor += 100;
  if (flags & 8) cursor += 4;
  if (cursor + 24 > frame.byteLength || !/^(LAME|Lavc|Lavf)/.test(ascii(frame, cursor, 4))) return { delay: 0, padding: 0 };
  const a = frame[cursor + 21]!;
  const b = frame[cursor + 22]!;
  const c = frame[cursor + 23]!;
  return { delay: (a << 4) | (b >> 4), padding: ((b & 0x0f) << 8) | c };
}

function skipId3v2(bytes: Uint8Array): number {
  if (bytes.byteLength < 10 || ascii(bytes, 0, 3) !== 'ID3') return 0;
  const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) |
    ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f);
  return Math.min(bytes.byteLength, 10 + size + ((bytes[5]! & 0x10) !== 0 ? 10 : 0));
}

function isTrailingMp3Tag(bytes: Uint8Array, offset: number): boolean {
  return ascii(bytes, offset, 3) === 'TAG' || ascii(bytes, offset, 8) === 'APETAGEX';
}

function ok(value: AudioContainerEvidence): AudioContainerReadResult {
  return Object.freeze({ state: 'OK' as const, value: Object.freeze(value) });
}

function problem(
  state: Exclude<AudioContainerReadResult['state'], 'OK'>,
  reasonCode: string,
  detail: string,
  offset?: number,
): AudioContainerReadResult {
  return Object.freeze({ state, reasonCode, detail, ...(offset !== undefined ? { offset } : {}) });
}

function appendBytes(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a);
  out.set(b, a.byteLength);
  return out;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let result = '';
  for (let index = 0; index < length && offset + index < bytes.byteLength; index++) {
    result += String.fromCharCode(bytes[offset + index]!);
  }
  return result;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function u32le(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) << 24)) >>> 0;
}

function u32be(bytes: Uint8Array, offset: number): number {
  return ((((bytes[offset] ?? 0) << 24) >>> 0) | ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0;
}

function u64le(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 7; index >= 0; index--) value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
  return value;
}

function u64be(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index++) value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
  return value;
}

function readExtended80(bytes: Uint8Array, offset: number): number {
  if (offset + 10 > bytes.byteLength) return 0;
  const signExp = u16be(bytes, offset);
  const sign = signExp & 0x8000 ? -1 : 1;
  const exponent = signExp & 0x7fff;
  if (exponent === 0 || exponent === 0x7fff) return 0;
  const mantissa = u32be(bytes, offset + 2) * 2 ** 32 + u32be(bytes, offset + 6);
  return Math.round(sign * mantissa * 2 ** (exponent - 16383 - 63));
}

function normalizeDigest(value: string): string {
  return value.trim().toLowerCase();
}
