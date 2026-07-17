import {
  AUDIO_SIGNAL_SCHEMA,
  AUDIO_STRUCTURE_SCHEMA,
  type AudioReaderEvidence,
  type AudioReaderResult,
  type DecodedPcmEvidence,
  type PcmContainer,
  type PcmDataSpan,
  type PcmEndianness,
  type PcmSampleKind,
  type PcmStructureEvidence,
} from './types.ts';

const WAVE_FORMAT_PCM = 0x0001;
const WAVE_FORMAT_IEEE_FLOAT = 0x0003;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;
const MAX_SAFE_AUDIO_FRAMES = 0x7fff_ffff;

const WAVE_SPEAKERS = [
  'FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'FLC', 'FRC', 'BC', 'SL', 'SR',
  'TC', 'TFL', 'TFC', 'TFR', 'TBL', 'TBC', 'TBR',
] as const;

export function readPcmStructure(bytes: Uint8Array, containerHint?: string): AudioReaderResult<PcmStructureEvidence> {
  const evidence = baseEvidence('audio-structure', bytes);
  try {
    if (!(bytes instanceof Uint8Array)) {
      return failure('MALFORMED', 'AUDIO_BYTES_TYPE', 'audio input must be Uint8Array', evidence);
    }
    const detected = detectContainer(bytes);
    if (!detected) {
      return failure(
        'UNSUPPORTED_FORMAT',
        'AUDIO_CONTAINER_UNSUPPORTED',
        `unsupported audio container${containerHint ? ` (hint '${containerHint}')` : ''}`,
        evidence,
      );
    }
    evidence.detectedFormat = detected;
    evidence.markers.push(detected);
    const parsed = detected === 'wav'
      ? parseWav(bytes)
      : detected === 'caf'
        ? parseCaf(bytes)
        : parseAiff(bytes, detected);
    return parsed.state === 'OK'
      ? { state: 'OK', value: parsed.value, evidence: { ...evidence, markers: parsed.markers } }
      : { ...parsed, evidence: { ...evidence, markers: parsed.markers } };
  } catch (error) {
    return failure('MALFORMED', 'AUDIO_READER_THROW', `audio reader failed: ${errorText(error)}`, evidence);
  }
}

export function decodeNativePcm(
  bytes: Uint8Array,
  opts: { containerHint?: string; maxFrames?: number; startFrame?: number } = {},
): AudioReaderResult<DecodedPcmEvidence> {
  const structure = readPcmStructure(bytes, opts.containerHint);
  const evidence: AudioReaderEvidence = {
    ...structure.evidence,
    reader: 'audio-signal',
    markers: [...structure.evidence.markers],
  };
  if (structure.state !== 'OK') return { ...structure, evidence };

  try {
    const value = structure.value;
    const requestedStart = Math.max(0, Math.trunc(opts.startFrame ?? 0));
    if (requestedStart >= value.sampleFrames && value.sampleFrames !== 0) {
      return failure('INCOMPLETE', 'AUDIO_DECODE_START_OOB', 'decode start frame is outside the stream', evidence);
    }
    const remaining = Math.max(0, value.sampleFrames - requestedStart);
    const requestedMax = opts.maxFrames == null
      ? remaining
      : Math.max(0, Math.min(remaining, Math.trunc(opts.maxFrames)));
    if (!Number.isSafeInteger(requestedMax)) {
      return failure('UNSUPPORTED_STRUCTURE', 'AUDIO_DECODE_TOO_LARGE', 'decoded sample count exceeds safe bounds', evidence);
    }
    const sampleCount = requestedMax * value.channels;
    if (!Number.isSafeInteger(sampleCount)) {
      return failure('UNSUPPORTED_STRUCTURE', 'AUDIO_DECODE_TOO_LARGE', 'decoded scalar sample count exceeds safe bounds', evidence);
    }

    const samples = new Float64Array(sampleCount);
    let outputIndex = 0;
    for (let frame = 0; frame < requestedMax; frame++) {
      const absoluteFrame = requestedStart + frame;
      for (let channel = 0; channel < value.channels; channel++) {
        const byteOffset = byteOffsetForScalarSample(value.dataSpans, value.blockAlign, absoluteFrame, channel,
          value.storageBitsPerSample / 8);
        if (byteOffset == null) {
          return failure('INCOMPLETE', 'AUDIO_SAMPLE_DATA_TRUNCATED', 'PCM data ended before declared sample frames', evidence);
        }
        samples[outputIndex++] = readNormalizedSample(bytes, byteOffset, value);
      }
    }
    evidence.markers.push(`native-rate:${value.sampleRate}`, `sample-frames:${value.sampleFrames}`);
    return {
      state: 'OK',
      value: {
        ...value,
        signalSchema: AUDIO_SIGNAL_SCHEMA,
        evidenceSource: 'container-pcm-reader',
        decodedSampleFrames: requestedMax,
        samples,
        truncated: requestedStart > 0 || requestedMax < value.sampleFrames,
      },
      evidence,
    };
  } catch (error) {
    return failure('MALFORMED', 'AUDIO_PCM_DECODE_THROW', `PCM decode failed: ${errorText(error)}`, evidence);
  }
}

function detectContainer(bytes: Uint8Array): PcmContainer | undefined {
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'wav';
  if (ascii(bytes, 0, 4) === 'FORM') {
    const form = ascii(bytes, 8, 4);
    if (form === 'AIFF') return 'aiff';
    if (form === 'AIFC') return 'aifc';
  }
  if (ascii(bytes, 0, 4) === 'caff') return 'caf';
  return undefined;
}

type Parsed =
  | { state: 'OK'; value: PcmStructureEvidence; markers: string[] }
  | {
      state: 'UNSUPPORTED_STRUCTURE' | 'MALFORMED' | 'INCOMPLETE';
      reasonCode: string;
      detail: string;
      markers: string[];
    };

function parseWav(bytes: Uint8Array): Parsed {
  const markers = ['RIFF', 'WAVE'];
  if (bytes.byteLength < 12) return parsedFailure('INCOMPLETE', 'WAV_HEADER_TRUNCATED', 'RIFF/WAVE header is truncated', markers);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmt: {
    sampleKind: PcmSampleKind;
    channels: number;
    sampleRate: number;
    blockAlign: number;
    storageBits: number;
    validBits: number;
    channelMask?: number;
  } | undefined;
  const dataSpans: PcmDataSpan[] = [];

  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (size > bytes.byteLength - body) {
      return parsedFailure('INCOMPLETE', 'WAV_CHUNK_TRUNCATED', `WAV chunk '${id}' exceeds the byte buffer`, [...markers, id]);
    }
    if (id === 'fmt ') {
      markers.push('fmt ');
      if (size < 16) return parsedFailure('MALFORMED', 'WAV_FMT_TOO_SMALL', 'WAV fmt chunk is smaller than 16 bytes', markers);
      const formatTag = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const sampleRate = view.getUint32(body + 4, true);
      const blockAlign = view.getUint16(body + 12, true);
      const storageBits = view.getUint16(body + 14, true);
      let resolvedTag = formatTag;
      let validBits = storageBits;
      let channelMask: number | undefined;
      if (formatTag === WAVE_FORMAT_EXTENSIBLE) {
        markers.push('WAVEFORMATEXTENSIBLE');
        if (size < 40 || view.getUint16(body + 16, true) < 22) {
          return parsedFailure('MALFORMED', 'WAV_EXTENSIBLE_TRUNCATED', 'WAVEFORMATEXTENSIBLE payload is incomplete', markers);
        }
        validBits = view.getUint16(body + 18, true) || storageBits;
        channelMask = view.getUint32(body + 20, true);
        if (!isWaveSubtypeGuid(bytes, body + 24)) {
          return parsedFailure('UNSUPPORTED_STRUCTURE', 'WAV_EXTENSIBLE_GUID_UNSUPPORTED', 'unknown WAVEFORMATEXTENSIBLE subformat GUID', markers);
        }
        resolvedTag = view.getUint16(body + 24, true);
      }
      const sampleKind: PcmSampleKind | undefined = resolvedTag === WAVE_FORMAT_PCM
        ? (storageBits === 8 ? 'unsigned-integer' : 'signed-integer')
        : resolvedTag === WAVE_FORMAT_IEEE_FLOAT
          ? 'float'
          : undefined;
      if (!sampleKind) {
        return parsedFailure('UNSUPPORTED_STRUCTURE', 'WAV_CODEC_UNSUPPORTED', `WAV format tag ${resolvedTag} is not PCM`, markers);
      }
      const commonError = validatePcmFormat(channels, sampleRate, blockAlign, storageBits, validBits, sampleKind);
      if (commonError) return parsedFailure('MALFORMED', commonError.code, commonError.detail, markers);
      const expectedAlign = channels * (storageBits / 8);
      if (blockAlign !== expectedAlign) {
        return parsedFailure('MALFORMED', 'WAV_BLOCK_ALIGN_MISMATCH', `WAV blockAlign ${blockAlign} != ${expectedAlign}`, markers);
      }
      fmt = { sampleKind, channels, sampleRate, blockAlign, storageBits, validBits, ...(channelMask != null ? { channelMask } : {}) };
    } else if (id === 'data') {
      markers.push('data');
      dataSpans.push({ offset: body, byteLength: size });
    }
    const next = body + size + (size & 1);
    if (next <= offset) return parsedFailure('MALFORMED', 'WAV_CHUNK_OVERFLOW', 'WAV chunk offset overflow', markers);
    offset = next;
  }
  if (!fmt) return parsedFailure('INCOMPLETE', 'WAV_FMT_MISSING', 'WAV fmt chunk is missing', markers);
  if (dataSpans.length === 0) return parsedFailure('INCOMPLETE', 'WAV_DATA_MISSING', 'WAV data chunk is missing', markers);
  const dataBytes = sumSpanBytes(dataSpans);
  if (dataBytes % fmt.blockAlign !== 0) {
    return parsedFailure('MALFORMED', 'WAV_PARTIAL_SAMPLE_FRAME', 'WAV data length is not a whole number of sample frames', markers);
  }
  const sampleFrames = dataBytes / fmt.blockAlign;
  const layout = layoutFromWaveMask(fmt.channelMask, fmt.channels);
  return {
    state: 'OK',
    value: structure({
      container: 'wav',
      sampleKind: fmt.sampleKind,
      endianness: 'little',
      storageBits: fmt.storageBits,
      validBits: fmt.validBits,
      sampleRate: fmt.sampleRate,
      channels: fmt.channels,
      sampleFrames,
      blockAlign: fmt.blockAlign,
      dataSpans,
      channelLayout: layout.labels,
      channelLayoutSource: layout.source,
      ...(fmt.channelMask != null ? { channelMask: fmt.channelMask } : {}),
    }),
    markers,
  };
}

function parseAiff(bytes: Uint8Array, container: 'aiff' | 'aifc'): Parsed {
  const markers = ['FORM', container === 'aiff' ? 'AIFF' : 'AIFC'];
  if (bytes.byteLength < 12) return parsedFailure('INCOMPLETE', 'AIFF_HEADER_TRUNCATED', 'AIFF header is truncated', markers);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let comm: {
    channels: number;
    declaredFrames: number;
    storageBits: number;
    sampleRate: number;
    sampleKind: PcmSampleKind;
    endianness: PcmEndianness;
  } | undefined;
  let dataSpan: PcmDataSpan | undefined;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, false);
    const body = offset + 8;
    if (size > bytes.byteLength - body) {
      return parsedFailure('INCOMPLETE', 'AIFF_CHUNK_TRUNCATED', `AIFF chunk '${id}' exceeds the byte buffer`, [...markers, id]);
    }
    if (id === 'COMM') {
      markers.push('COMM');
      if (size < 18) return parsedFailure('MALFORMED', 'AIFF_COMM_TOO_SMALL', 'AIFF COMM chunk is smaller than 18 bytes', markers);
      const channels = view.getUint16(body, false);
      const declaredFrames = view.getUint32(body + 2, false);
      const storageBits = view.getUint16(body + 6, false);
      const sampleRate = readExtended80(view, body + 8);
      const compression = container === 'aifc' && size >= 22 ? ascii(bytes, body + 18, 4) : 'NONE';
      const encoding = aiffEncoding(compression, storageBits);
      if (!encoding) {
        return parsedFailure('UNSUPPORTED_STRUCTURE', 'AIFF_CODEC_UNSUPPORTED', `AIFF compression '${compression}' is not supported PCM`, markers);
      }
      const blockAlign = channels * (storageBits / 8);
      const commonError = validatePcmFormat(channels, sampleRate, blockAlign, storageBits, storageBits, encoding.kind);
      if (commonError) return parsedFailure('MALFORMED', commonError.code, commonError.detail, markers);
      comm = { channels, declaredFrames, storageBits, sampleRate, sampleKind: encoding.kind, endianness: encoding.endianness };
    } else if (id === 'SSND') {
      markers.push('SSND');
      if (size < 8) return parsedFailure('MALFORMED', 'AIFF_SSND_TOO_SMALL', 'AIFF SSND chunk is smaller than 8 bytes', markers);
      const soundOffset = view.getUint32(body, false);
      const start = body + 8 + soundOffset;
      const end = body + size;
      if (start > end) return parsedFailure('MALFORMED', 'AIFF_SSND_OFFSET_OOB', 'AIFF SSND offset exceeds the chunk', markers);
      dataSpan = { offset: start, byteLength: end - start };
    }
    const next = body + size + (size & 1);
    if (next <= offset) return parsedFailure('MALFORMED', 'AIFF_CHUNK_OVERFLOW', 'AIFF chunk offset overflow', markers);
    offset = next;
  }
  if (!comm) return parsedFailure('INCOMPLETE', 'AIFF_COMM_MISSING', 'AIFF COMM chunk is missing', markers);
  if (!dataSpan) return parsedFailure('INCOMPLETE', 'AIFF_SSND_MISSING', 'AIFF SSND chunk is missing', markers);
  const blockAlign = comm.channels * (comm.storageBits / 8);
  if (dataSpan.byteLength % blockAlign !== 0) {
    return parsedFailure('MALFORMED', 'AIFF_PARTIAL_SAMPLE_FRAME', 'AIFF sound data is not a whole number of sample frames', markers);
  }
  const dataFrames = dataSpan.byteLength / blockAlign;
  if (comm.declaredFrames !== dataFrames) {
    return parsedFailure(
      'MALFORMED',
      'AIFF_SAMPLE_COUNT_MISMATCH',
      `AIFF COMM declares ${comm.declaredFrames} frame(s), SSND stores ${dataFrames}`,
      markers,
    );
  }
  const layout = inferredLayout(comm.channels);
  return {
    state: 'OK',
    value: structure({
      container,
      sampleKind: comm.sampleKind,
      endianness: comm.endianness,
      storageBits: comm.storageBits,
      validBits: comm.storageBits,
      sampleRate: comm.sampleRate,
      channels: comm.channels,
      sampleFrames: dataFrames,
      blockAlign,
      dataSpans: [dataSpan],
      channelLayout: layout.labels,
      channelLayoutSource: layout.source,
    }),
    markers,
  };
}

function parseCaf(bytes: Uint8Array): Parsed {
  const markers = ['caff'];
  if (bytes.byteLength < 8) return parsedFailure('INCOMPLETE', 'CAF_HEADER_TRUNCATED', 'CAF header is truncated', markers);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, false);
  if (version !== 1) return parsedFailure('UNSUPPORTED_STRUCTURE', 'CAF_VERSION_UNSUPPORTED', `CAF version ${version} is unsupported`, markers);
  let desc: {
    sampleRate: number;
    sampleKind: PcmSampleKind;
    endianness: PcmEndianness;
    bytesPerPacket: number;
    framesPerPacket: number;
    channels: number;
    storageBits: number;
    nonInterleaved: boolean;
  } | undefined;
  let dataSpan: PcmDataSpan | undefined;
  let channelLayoutTag: number | undefined;
  let channelBitmap: number | undefined;

  for (let offset = 8; offset + 12 <= bytes.byteLength;) {
    const id = ascii(bytes, offset, 4);
    const rawSize = view.getBigInt64(offset + 4, false);
    const body = offset + 12;
    const size = rawSize === -1n ? bytes.byteLength - body : Number(rawSize);
    if (rawSize < -1n || !Number.isSafeInteger(size) || size < 0 || size > bytes.byteLength - body) {
      return parsedFailure('INCOMPLETE', 'CAF_CHUNK_TRUNCATED', `CAF chunk '${id}' exceeds the byte buffer`, [...markers, id]);
    }
    if (id === 'desc') {
      markers.push('desc');
      if (size < 32) return parsedFailure('MALFORMED', 'CAF_DESC_TOO_SMALL', 'CAF desc chunk is smaller than 32 bytes', markers);
      const sampleRate = view.getFloat64(body, false);
      const formatId = ascii(bytes, body + 8, 4);
      const flags = view.getUint32(body + 12, false);
      const bytesPerPacket = view.getUint32(body + 16, false);
      const framesPerPacket = view.getUint32(body + 20, false);
      const channels = view.getUint32(body + 24, false);
      const storageBits = view.getUint32(body + 28, false);
      if (formatId !== 'lpcm') {
        return parsedFailure('UNSUPPORTED_STRUCTURE', 'CAF_CODEC_UNSUPPORTED', `CAF format '${formatId}' is not linear PCM`, markers);
      }
      // CAF's Linear PCM flags use bit 0 for float and bit 1 for little-endian.
      const sampleKind: PcmSampleKind = (flags & 1) !== 0 ? 'float' : 'signed-integer';
      const endianness: PcmEndianness = (flags & 2) !== 0 ? 'little' : 'big';
      const nonInterleaved = (flags & 32) !== 0;
      if (nonInterleaved) {
        return parsedFailure('UNSUPPORTED_STRUCTURE', 'CAF_NONINTERLEAVED_UNSUPPORTED', 'non-interleaved CAF PCM is unsupported', markers);
      }
      const blockAlign = bytesPerPacket / Math.max(1, framesPerPacket);
      const commonError = validatePcmFormat(channels, sampleRate, blockAlign, storageBits, storageBits, sampleKind);
      if (commonError) return parsedFailure('MALFORMED', commonError.code, commonError.detail, markers);
      if (framesPerPacket === 0 || bytesPerPacket === 0 || bytesPerPacket % framesPerPacket !== 0) {
        return parsedFailure('MALFORMED', 'CAF_PACKET_GEOMETRY_INVALID', 'CAF packet geometry cannot yield sample frames', markers);
      }
      if (blockAlign !== channels * (storageBits / 8)) {
        return parsedFailure('MALFORMED', 'CAF_BLOCK_ALIGN_MISMATCH', 'CAF packet bytes do not match channel/sample geometry', markers);
      }
      desc = { sampleRate, sampleKind, endianness, bytesPerPacket, framesPerPacket, channels, storageBits, nonInterleaved };
    } else if (id === 'chan') {
      markers.push('chan');
      if (size >= 12) {
        channelLayoutTag = view.getUint32(body, false);
        channelBitmap = view.getUint32(body + 4, false);
      }
    } else if (id === 'data') {
      markers.push('data');
      if (size < 4) return parsedFailure('MALFORMED', 'CAF_DATA_TOO_SMALL', 'CAF data chunk lacks edit count', markers);
      dataSpan = { offset: body + 4, byteLength: size - 4 };
    }
    const next = body + size;
    if (next <= offset) return parsedFailure('MALFORMED', 'CAF_CHUNK_OVERFLOW', 'CAF chunk offset overflow', markers);
    offset = next;
  }
  if (!desc) return parsedFailure('INCOMPLETE', 'CAF_DESC_MISSING', 'CAF desc chunk is missing', markers);
  if (!dataSpan) return parsedFailure('INCOMPLETE', 'CAF_DATA_MISSING', 'CAF data chunk is missing', markers);
  const blockAlign = desc.bytesPerPacket / desc.framesPerPacket;
  if (dataSpan.byteLength % blockAlign !== 0) {
    return parsedFailure('MALFORMED', 'CAF_PARTIAL_SAMPLE_FRAME', 'CAF data is not a whole number of sample frames', markers);
  }
  const sampleFrames = dataSpan.byteLength / blockAlign;
  const explicit = layoutFromCaf(channelLayoutTag, channelBitmap, desc.channels);
  return {
    state: 'OK',
    value: structure({
      container: 'caf',
      sampleKind: desc.sampleKind,
      endianness: desc.endianness,
      storageBits: desc.storageBits,
      validBits: desc.storageBits,
      sampleRate: desc.sampleRate,
      channels: desc.channels,
      sampleFrames,
      blockAlign,
      dataSpans: [dataSpan],
      channelLayout: explicit.labels,
      channelLayoutSource: explicit.source,
      ...(channelLayoutTag != null ? { channelLayoutTag } : {}),
      ...(channelBitmap != null && channelBitmap !== 0 ? { channelMask: channelBitmap } : {}),
    }),
    markers,
  };
}

function structure(input: {
  container: PcmContainer;
  sampleKind: PcmSampleKind;
  endianness: PcmEndianness;
  storageBits: number;
  validBits: number;
  sampleRate: number;
  channels: number;
  sampleFrames: number;
  blockAlign: number;
  dataSpans: PcmDataSpan[];
  channelLayout: string[];
  channelLayoutSource: PcmStructureEvidence['channelLayoutSource'];
  channelMask?: number;
  channelLayoutTag?: number;
}): PcmStructureEvidence {
  return {
    schema: AUDIO_STRUCTURE_SCHEMA,
    source: 'container-pcm-reader',
    container: input.container,
    codec: codecToken(input.sampleKind, input.storageBits, input.endianness),
    sampleKind: input.sampleKind,
    endianness: input.endianness,
    storageBitsPerSample: input.storageBits,
    validBitsPerSample: input.validBits,
    sampleRate: input.sampleRate,
    channels: input.channels,
    sampleFrames: input.sampleFrames,
    durationSec: input.sampleFrames / input.sampleRate,
    blockAlign: input.blockAlign,
    channelLayout: input.channelLayout,
    channelLayoutSource: input.channelLayoutSource,
    dataSpans: input.dataSpans,
    ...(input.channelMask != null ? { channelMask: input.channelMask } : {}),
    ...(input.channelLayoutTag != null ? { channelLayoutTag: input.channelLayoutTag } : {}),
  };
}

function codecToken(kind: PcmSampleKind, bits: number, endianness: PcmEndianness): string {
  if (kind === 'float') return `pcm-f${bits}${endianness === 'big' ? 'be' : ''}`;
  const base = `pcm-${kind === 'unsigned-integer' ? 'u' : 's'}${bits}`;
  return endianness === 'big' && bits > 8 ? `${base}be` : base;
}

function validatePcmFormat(
  channels: number,
  sampleRate: number,
  blockAlign: number,
  storageBits: number,
  validBits: number,
  kind: PcmSampleKind,
): { code: string; detail: string } | undefined {
  if (!Number.isInteger(channels) || channels <= 0 || channels > 64) return { code: 'AUDIO_CHANNELS_INVALID', detail: `invalid channel count ${channels}` };
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate > 768_000) return { code: 'AUDIO_SAMPLE_RATE_INVALID', detail: `invalid sample rate ${sampleRate}` };
  if (!Number.isInteger(storageBits) || ![8, 16, 24, 32, 64].includes(storageBits)) return { code: 'AUDIO_SAMPLE_WIDTH_UNSUPPORTED', detail: `unsupported ${storageBits}-bit PCM` };
  if (kind === 'float' && storageBits !== 32 && storageBits !== 64) return { code: 'AUDIO_FLOAT_WIDTH_INVALID', detail: `float PCM cannot use ${storageBits} bits` };
  if (!Number.isInteger(validBits) || validBits <= 0 || validBits > storageBits) return { code: 'AUDIO_VALID_BITS_INVALID', detail: `valid bits ${validBits} outside storage width ${storageBits}` };
  if (!Number.isInteger(blockAlign) || blockAlign <= 0) return { code: 'AUDIO_BLOCK_ALIGN_INVALID', detail: `invalid block alignment ${blockAlign}` };
  return undefined;
}

function isWaveSubtypeGuid(bytes: Uint8Array, offset: number): boolean {
  if (offset + 16 > bytes.byteLength) return false;
  const tail = [0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71];
  for (let i = 0; i < tail.length; i++) if (bytes[offset + 4 + i] !== tail[i]) return false;
  return true;
}

function aiffEncoding(compression: string, bits: number): { kind: PcmSampleKind; endianness: PcmEndianness } | undefined {
  switch (compression) {
    case 'NONE':
    case 'twos':
    case 'in24':
    case 'in32':
      return { kind: 'signed-integer', endianness: 'big' };
    case 'sowt':
      return { kind: 'signed-integer', endianness: 'little' };
    case 'fl32':
    case 'FL32':
      return bits === 32 ? { kind: 'float', endianness: 'big' } : undefined;
    case 'fl64':
    case 'FL64':
      return bits === 64 ? { kind: 'float', endianness: 'big' } : undefined;
    default:
      return undefined;
  }
}

function layoutFromWaveMask(mask: number | undefined, channels: number): { labels: string[]; source: PcmStructureEvidence['channelLayoutSource'] } {
  if (mask != null && mask !== 0) {
    const labels = WAVE_SPEAKERS.filter((_, bit) => (mask & (1 << bit)) !== 0);
    if (labels.length === channels) return { labels: [...labels], source: 'explicit-mask' };
  }
  return inferredLayout(channels);
}

function layoutFromCaf(tag: number | undefined, bitmap: number | undefined, channels: number): { labels: string[]; source: PcmStructureEvidence['channelLayoutSource'] } {
  if (bitmap != null && bitmap !== 0) {
    const fromMask = layoutFromWaveMask(bitmap, channels);
    if (fromMask.source === 'explicit-mask') return { labels: fromMask.labels, source: 'container-tag' };
  }
  // Core Audio layout tags encode the channel count in the low 16 bits. The common mono/stereo
  // tags still carry useful explicit container evidence even when no bitmap is present.
  if (tag != null && (tag & 0xffff) === channels && (channels === 1 || channels === 2)) {
    return { labels: channels === 1 ? ['FC'] : ['FL', 'FR'], source: 'container-tag' };
  }
  return inferredLayout(channels);
}

function inferredLayout(channels: number): { labels: string[]; source: PcmStructureEvidence['channelLayoutSource'] } {
  if (channels === 1) return { labels: ['FC'], source: 'inferred-count' };
  if (channels === 2) return { labels: ['FL', 'FR'], source: 'inferred-count' };
  if (channels === 6) return { labels: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'], source: 'inferred-count' };
  return { labels: Array.from({ length: channels }, (_, i) => `CH${i + 1}`), source: 'unknown' };
}

function readNormalizedSample(bytes: Uint8Array, offset: number, format: PcmStructureEvidence): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = format.endianness === 'little';
  const bits = format.storageBitsPerSample;
  if (format.sampleKind === 'float') {
    return bits === 32 ? view.getFloat32(offset, little) : view.getFloat64(offset, little);
  }
  if (format.sampleKind === 'unsigned-integer') return (bytes[offset]! - 128) / 128;
  let signed: number;
  if (bits === 8) signed = view.getInt8(offset);
  else if (bits === 16) signed = view.getInt16(offset, little);
  else if (bits === 24) signed = readInt24(bytes, offset, little);
  else if (bits === 32) signed = view.getInt32(offset, little);
  else throw new Error(`unsupported signed PCM width ${bits}`);
  const shift = bits - format.validBitsPerSample;
  if (shift > 0) signed = Math.trunc(signed / 2 ** shift);
  return signed / 2 ** (format.validBitsPerSample - 1);
}

function readInt24(bytes: Uint8Array, offset: number, little: boolean): number {
  const raw = little
    ? bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
    : (bytes[offset]! << 16) | (bytes[offset + 1]! << 8) | bytes[offset + 2]!;
  return (raw & 0x80_0000) !== 0 ? raw - 0x100_0000 : raw;
}

function byteOffsetForScalarSample(
  spans: PcmDataSpan[],
  blockAlign: number,
  frame: number,
  channel: number,
  bytesPerSample: number,
): number | undefined {
  let relative = frame * blockAlign + channel * bytesPerSample;
  for (const span of spans) {
    if (relative + bytesPerSample <= span.byteLength) return span.offset + relative;
    relative -= span.byteLength;
  }
  return undefined;
}

function readExtended80(view: DataView, offset: number): number {
  const exponentWord = view.getUint16(offset, false);
  const sign = (exponentWord & 0x8000) !== 0 ? -1 : 1;
  const exponent = exponentWord & 0x7fff;
  const high = view.getUint32(offset + 2, false);
  const low = view.getUint32(offset + 6, false);
  if (exponent === 0 && high === 0 && low === 0) return 0;
  if (exponent === 0x7fff) return Number.NaN;
  const mantissa = high * 2 ** 32 + low;
  return sign * mantissa * 2 ** (exponent - 16383 - 63);
}

function sumSpanBytes(spans: PcmDataSpan[]): number {
  let total = 0;
  for (const span of spans) {
    total += span.byteLength;
    if (!Number.isSafeInteger(total) || total > MAX_SAFE_AUDIO_FRAMES * 256) throw new Error('PCM data length overflow');
  }
  return total;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) return '';
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]!);
  return out;
}

function baseEvidence(reader: AudioReaderEvidence['reader'], bytes: Uint8Array): AudioReaderEvidence {
  return { reader, byteLength: bytes instanceof Uint8Array ? bytes.byteLength : 0, markers: [] };
}

function parsedFailure(
  state: 'UNSUPPORTED_STRUCTURE' | 'MALFORMED' | 'INCOMPLETE',
  reasonCode: string,
  detail: string,
  markers: string[],
): Parsed {
  return { state, reasonCode, detail, markers };
}

function failure<T>(
  state: Exclude<import('./types.ts').AudioReaderState, 'OK'>,
  reasonCode: string,
  detail: string,
  evidence: AudioReaderEvidence,
): AudioReaderResult<T> {
  return { state, reasonCode, detail, evidence };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
