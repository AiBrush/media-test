import type { EncodedTrack, EncodedTracks } from '../../core/engine.ts';

export class TimedMp4UnsupportedError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string, message: string) {
    super(message);
    this.name = 'TimedMp4UnsupportedError';
    this.reasonCode = reasonCode;
  }
}

interface PreparedSample {
  data: Uint8Array;
  dts: number;
  cts: number;
  duration: number;
  keyframe: boolean;
}

interface PreparedTrack {
  type: 'video' | 'audio';
  codec: 'h264' | 'aac';
  timescale: number;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  decoderConfig: Uint8Array;
  samples: PreparedSample[];
  chunkOffset: number;
}

/** True when the staging writer can carry the coded representation without conversion/re-encode. */
export function canBuildTimedMp4(tracks: EncodedTracks['tracks']): boolean {
  return tracks.length > 0 && tracks.every((track) =>
    (track.type === 'video' && track.codec === 'h264') ||
    (track.type === 'audio' && track.codec === 'aac'));
}

/**
 * Build a minimal progressive MP4 whose sample tables retain every supplied decode/presentation
 * timestamp. FFmpeg then stream-copies this staging file to the requested muxer, avoiding the raw
 * elementary demuxers' synthetic-CFR clocks.
 */
export function buildTimedMp4(sourceTracks: EncodedTracks['tracks']): Uint8Array {
  if (!canBuildTimedMp4(sourceTracks)) {
    throw new TimedMp4UnsupportedError(
      'FFMPEG_TIMED_STAGING_CODEC_UNSUPPORTED',
      'timestamped staging currently supports H.264 and AAC tracks only',
    );
  }
  const tracks = sourceTracks.map(prepareTrack);
  let globalDtsOriginUs = Number.POSITIVE_INFINITY;
  for (const track of sourceTracks) {
    let inferredDtsUs = 0;
    for (const chunk of track.chunks) {
      const dtsUs = chunk.dtsUs ?? inferredDtsUs;
      globalDtsOriginUs = Math.min(globalDtsOriginUs, dtsUs);
      inferredDtsUs = dtsUs + chunk.durationUs;
    }
  }
  if (!Number.isFinite(globalDtsOriginUs)) globalDtsOriginUs = 0;
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const source = sourceTracks[trackIndex]!;
    const prepared = tracks[trackIndex]!;
    let inferredDtsUs = 0;
    prepared.samples = prepared.samples.map((sample, sampleIndex) => {
      const chunk = source.chunks[sampleIndex]!;
      const dtsUs = chunk.dtsUs ?? inferredDtsUs;
      inferredDtsUs = dtsUs + chunk.durationUs;
      return {
        ...sample,
        dts: usToTicks(dtsUs - globalDtsOriginUs, prepared.timescale),
        cts: usToTicks(chunk.ptsUs - globalDtsOriginUs, prepared.timescale),
        duration: Math.max(1, usToTicks(chunk.durationUs, prepared.timescale)),
      };
    });
  }

  const ftyp = box('ftyp', concat(ascii('isom'), u32(0x200), ascii('isom'), ascii('iso6'), ascii('mp41')));
  const samplePayloads: Uint8Array[] = [];
  let mdatCursor = ftyp.byteLength + 8;
  for (const track of tracks) {
    track.chunkOffset = mdatCursor;
    for (const sample of track.samples) {
      samplePayloads.push(sample.data);
      mdatCursor += sample.data.byteLength;
    }
  }
  const mdat = box('mdat', concat(...samplePayloads));
  const movieTimescale = 1_000_000;
  const movieDuration = tracks.reduce((max, track) => Math.max(max, trackDurationInMovieTicks(track, movieTimescale)), 0);
  assertU32(movieDuration, 'movie duration');
  const moov = box('moov', concat(
    mvhd(movieTimescale, movieDuration, tracks.length + 1),
    ...tracks.map((track, index) => trak(track, index + 1, movieTimescale)),
  ));
  return concat(ftyp, mdat, moov);
}

function prepareTrack(track: EncodedTrack): PreparedTrack {
  if (track.chunks.length === 0) {
    throw new TimedMp4UnsupportedError('FFMPEG_TIMED_STAGING_EMPTY_TRACK', `${track.codec} track has no chunks`);
  }
  if (track.packetOrdering !== undefined && track.packetOrdering !== 'decode') {
    throw new TimedMp4UnsupportedError(
      'FFMPEG_TIMED_STAGING_ORDER_UNSUPPORTED',
      `${track.codec} staging requires decode-ordered chunks`,
    );
  }
  const timescale = checkedTimescale(track.timescale);
  if (track.type === 'video' && track.codec === 'h264') {
    if (!track.width || !track.height) {
      throw new TimedMp4UnsupportedError('FFMPEG_TIMED_STAGING_DIMENSIONS_REQUIRED', 'H.264 staging requires dimensions');
    }
    const converted = prepareAvcSamples(track);
    return {
      type: 'video',
      codec: 'h264',
      timescale,
      width: track.width,
      height: track.height,
      decoderConfig: converted.avcC,
      samples: converted.samples.map((data, index) => ({
        data,
        dts: 0,
        cts: 0,
        duration: 0,
        keyframe: track.chunks[index]!.keyframe,
      })),
      chunkOffset: 0,
    };
  }
  if (track.type === 'audio' && track.codec === 'aac') {
    if (!track.sampleRate || !track.channels) {
      throw new TimedMp4UnsupportedError('FFMPEG_TIMED_STAGING_AUDIO_CONFIG_REQUIRED', 'AAC staging requires sample rate/channels');
    }
    const converted = prepareAacSamples(track);
    return {
      type: 'audio',
      codec: 'aac',
      timescale,
      sampleRate: track.sampleRate,
      channels: track.channels,
      decoderConfig: converted.asc,
      samples: converted.samples.map((data, index) => ({
        data,
        dts: 0,
        cts: 0,
        duration: 0,
        keyframe: track.chunks[index]!.keyframe,
      })),
      chunkOffset: 0,
    };
  }
  throw new TimedMp4UnsupportedError(
    'FFMPEG_TIMED_STAGING_CODEC_UNSUPPORTED',
    `cannot stage ${track.type}/${track.codec} in ISO BMFF`,
  );
}

function prepareAvcSamples(track: EncodedTrack): { avcC: Uint8Array; samples: Uint8Array[] } {
  if (track.framing === 'avc') {
    if (!track.description || track.descriptionRecord !== 'avc-decoder-configuration-record') {
      throw new TimedMp4UnsupportedError(
        'FFMPEG_TIMED_STAGING_AVCC_REQUIRED',
        'length-prefixed H.264 staging requires an AVCDecoderConfigurationRecord',
      );
    }
    return { avcC: new Uint8Array(track.description), samples: track.chunks.map((chunk) => new Uint8Array(chunk.data)) };
  }
  if (track.framing !== 'annexb') {
    throw new TimedMp4UnsupportedError(
      'FFMPEG_TIMED_STAGING_FRAMING_UNSUPPORTED',
      `H.264 staging cannot consume '${track.framing ?? 'missing'}' framing`,
    );
  }
  let sps: Uint8Array | undefined;
  let pps: Uint8Array | undefined;
  const samples = track.chunks.map((chunk) => {
    const nals = annexBNals(chunk.data);
    for (const nal of nals) {
      const type = nal[0]! & 0x1f;
      if (type === 7 && !sps) sps = new Uint8Array(nal);
      if (type === 8 && !pps) pps = new Uint8Array(nal);
    }
    const mediaNals = nals.filter((nal) => {
      const type = nal[0]! & 0x1f;
      return type !== 7 && type !== 8;
    });
    if (mediaNals.length === 0) {
      throw new TimedMp4UnsupportedError(
        'FFMPEG_TIMED_STAGING_ACCESS_UNIT_INVALID',
        'Annex-B chunk contains no coded H.264 access unit after parameter sets',
      );
    }
    return concat(...mediaNals.map((nal) => concat(u32(nal.byteLength), nal)));
  });
  if (!sps || sps.byteLength < 4 || !pps) {
    throw new TimedMp4UnsupportedError(
      'FFMPEG_TIMED_STAGING_PARAMETER_SETS_REQUIRED',
      'Annex-B H.264 staging requires in-band SPS and PPS',
    );
  }
  const avcC = concat(
    Uint8Array.of(1, sps[1]!, sps[2]!, sps[3]!, 0xff, 0xe1),
    u16(sps.byteLength),
    sps,
    Uint8Array.of(1),
    u16(pps.byteLength),
    pps,
  );
  return { avcC, samples };
}

function prepareAacSamples(track: EncodedTrack): { asc: Uint8Array; samples: Uint8Array[] } {
  if (track.framing === 'raw') {
    if (!track.description || track.descriptionRecord !== 'audio-specific-config') {
      throw new TimedMp4UnsupportedError(
        'FFMPEG_TIMED_STAGING_ASC_REQUIRED',
        'raw AAC staging requires an AudioSpecificConfig',
      );
    }
    return { asc: new Uint8Array(track.description), samples: track.chunks.map((chunk) => new Uint8Array(chunk.data)) };
  }
  if (track.framing !== 'adts') {
    throw new TimedMp4UnsupportedError(
      'FFMPEG_TIMED_STAGING_FRAMING_UNSUPPORTED',
      `AAC staging cannot consume '${track.framing ?? 'missing'}' framing`,
    );
  }
  let asc: Uint8Array | undefined;
  const samples = track.chunks.map((chunk) => {
    const parsed = parseSingleAdtsFrame(chunk.data);
    asc ??= parsed.asc;
    if (!equalBytes(asc, parsed.asc)) {
      throw new TimedMp4UnsupportedError(
        'FFMPEG_TIMED_STAGING_CONFIG_CHANGE_UNSUPPORTED',
        'AAC configuration changes between chunks',
      );
    }
    return parsed.payload;
  });
  return { asc: asc!, samples };
}

function annexBNals(bytes: Uint8Array): Uint8Array[] {
  const starts: Array<{ offset: number; payload: number }> = [];
  for (let index = 0; index + 3 <= bytes.length;) {
    if (bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 1) {
      starts.push({ offset: index, payload: index + 3 });
      index += 3;
    } else if (
      index + 4 <= bytes.length &&
      bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 0 && bytes[index + 3] === 1
    ) {
      starts.push({ offset: index, payload: index + 4 });
      index += 4;
    } else {
      index++;
    }
  }
  if (starts.length === 0) {
    throw new TimedMp4UnsupportedError('FFMPEG_TIMED_STAGING_ANNEXB_INVALID', 'H.264 chunk lacks Annex-B start codes');
  }
  return starts.flatMap((start, index) => {
    let end = starts[index + 1]?.offset ?? bytes.length;
    while (end > start.payload && bytes[end - 1] === 0) end--;
    return end > start.payload ? [bytes.slice(start.payload, end)] : [];
  });
}

function parseSingleAdtsFrame(bytes: Uint8Array): { asc: Uint8Array; payload: Uint8Array } {
  if (bytes.length < 7 || bytes[0] !== 0xff || (bytes[1]! & 0xf6) !== 0xf0) {
    throw new TimedMp4UnsupportedError('FFMPEG_TIMED_STAGING_ADTS_INVALID', 'AAC chunk lacks a valid ADTS header');
  }
  const protectionAbsent = (bytes[1]! & 1) === 1;
  const headerLength = protectionAbsent ? 7 : 9;
  const frameLength = ((bytes[3]! & 0x03) << 11) | (bytes[4]! << 3) | (bytes[5]! >> 5);
  if (frameLength !== bytes.length || frameLength <= headerLength) {
    throw new TimedMp4UnsupportedError(
      'FFMPEG_TIMED_STAGING_ADTS_GROUPING_UNSUPPORTED',
      'AAC staging requires exactly one complete ADTS frame per chunk',
    );
  }
  const objectType = ((bytes[2]! >> 6) & 0x03) + 1;
  const frequencyIndex = (bytes[2]! >> 2) & 0x0f;
  const channelConfig = ((bytes[2]! & 1) << 2) | (bytes[3]! >> 6);
  const asc = Uint8Array.of(
    (objectType << 3) | (frequencyIndex >> 1),
    ((frequencyIndex & 1) << 7) | (channelConfig << 3),
  );
  return { asc, payload: bytes.slice(headerLength) };
}

function trak(track: PreparedTrack, trackId: number, movieTimescale: number): Uint8Array {
  const mediaDuration = track.samples.reduce((max, sample) => Math.max(max, sample.dts + sample.duration), 0);
  const movieDuration = trackDurationInMovieTicks(track, movieTimescale);
  assertU32(mediaDuration, 'track media duration');
  assertU32(movieDuration, 'track movie duration');
  return box('trak', concat(
    tkhd(track, trackId, movieDuration),
    box('mdia', concat(
      mdhd(track.timescale, mediaDuration),
      hdlr(track.type),
      box('minf', concat(
        track.type === 'video' ? vmhd() : smhd(),
        dinf(),
        stbl(track),
      )),
    )),
  ));
}

function stbl(track: PreparedTrack): Uint8Array {
  return box('stbl', concat(
    stsd(track),
    stts(track.samples),
    ctts(track.samples),
    stsc(track.samples.length),
    stsz(track.samples),
    box('stco', concat(fullBoxHeader(0, 0), u32(1), u32(track.chunkOffset))),
    ...(track.type === 'video' ? [stss(track.samples)] : []),
  ));
}

function stsd(track: PreparedTrack): Uint8Array {
  const entry = track.type === 'video' ? avc1(track) : mp4a(track);
  return box('stsd', concat(fullBoxHeader(0, 0), u32(1), entry));
}

function avc1(track: PreparedTrack): Uint8Array {
  const compressor = new Uint8Array(32);
  const label = ascii('ffmpeg.wasm timed staging');
  compressor[0] = Math.min(31, label.length);
  compressor.set(label.subarray(0, 31), 1);
  const visualHeader = concat(
    new Uint8Array(6), u16(1),
    new Uint8Array(16),
    u16(track.width!), u16(track.height!),
    u32(0x00480000), u32(0x00480000), u32(0),
    u16(1), compressor, u16(0x18), u16(0xffff),
  );
  return box('avc1', concat(visualHeader, box('avcC', track.decoderConfig)));
}

function mp4a(track: PreparedTrack): Uint8Array {
  const sampleRate = track.sampleRate!;
  if (sampleRate > 0xffff) {
    throw new TimedMp4UnsupportedError('FFMPEG_TIMED_STAGING_SAMPLE_RATE_UNSUPPORTED', `sample rate ${sampleRate} exceeds v0 mp4a`);
  }
  const audioHeader = concat(
    new Uint8Array(6), u16(1),
    new Uint8Array(8),
    u16(track.channels!), u16(16), u16(0), u16(0), u32(sampleRate * 0x10000),
  );
  return box('mp4a', concat(audioHeader, esds(track.decoderConfig)));
}

function esds(asc: Uint8Array): Uint8Array {
  const decoderSpecific = descriptor(0x05, asc);
  const decoderConfig = descriptor(0x04, concat(
    Uint8Array.of(0x40, 0x15, 0, 0, 0),
    u32(0), u32(0),
    decoderSpecific,
  ));
  const slConfig = descriptor(0x06, Uint8Array.of(2));
  const esDescriptor = descriptor(0x03, concat(u16(1), Uint8Array.of(0), decoderConfig, slConfig));
  return box('esds', concat(fullBoxHeader(0, 0), esDescriptor));
}

function descriptor(tag: number, payload: Uint8Array): Uint8Array {
  if (payload.length >= 0x80) {
    throw new TimedMp4UnsupportedError('FFMPEG_TIMED_STAGING_DESCRIPTOR_TOO_LARGE', 'ES descriptor exceeds compact encoding');
  }
  return concat(Uint8Array.of(tag, payload.length), payload);
}

function stts(samples: PreparedSample[]): Uint8Array {
  const runs = runsOf(samples.map((sample) => sample.duration));
  return box('stts', concat(
    fullBoxHeader(0, 0),
    u32(runs.length),
    ...runs.map((run) => concat(u32(run.count), u32(run.value))),
  ));
}

function ctts(samples: PreparedSample[]): Uint8Array {
  const offsets = samples.map((sample) => sample.cts - sample.dts);
  const runs = runsOf(offsets);
  const signed = offsets.some((offset) => offset < 0);
  return box('ctts', concat(
    fullBoxHeader(signed ? 1 : 0, 0),
    u32(runs.length),
    ...runs.map((run) => concat(u32(run.count), signed ? i32(run.value) : u32(run.value))),
  ));
}

function stsc(sampleCount: number): Uint8Array {
  return box('stsc', concat(fullBoxHeader(0, 0), u32(1), u32(1), u32(sampleCount), u32(1)));
}

function stsz(samples: PreparedSample[]): Uint8Array {
  return box('stsz', concat(
    fullBoxHeader(0, 0), u32(0), u32(samples.length), ...samples.map((sample) => u32(sample.data.byteLength)),
  ));
}

function stss(samples: PreparedSample[]): Uint8Array {
  const keys = samples.flatMap((sample, index) => sample.keyframe ? [index + 1] : []);
  return box('stss', concat(fullBoxHeader(0, 0), u32(keys.length), ...keys.map(u32)));
}

function mvhd(timescale: number, duration: number, nextTrackId: number): Uint8Array {
  return box('mvhd', concat(
    fullBoxHeader(0, 0), u32(0), u32(0), u32(timescale), u32(duration),
    u32(0x00010000), u16(0x0100), new Uint8Array(10), matrix(), new Uint8Array(24), u32(nextTrackId),
  ));
}

function tkhd(track: PreparedTrack, trackId: number, duration: number): Uint8Array {
  return box('tkhd', concat(
    fullBoxHeader(0, 7), u32(0), u32(0), u32(trackId), u32(0), u32(duration),
    new Uint8Array(8), u16(0), u16(0), u16(track.type === 'audio' ? 0x0100 : 0), u16(0),
    matrix(), u32((track.width ?? 0) * 0x10000), u32((track.height ?? 0) * 0x10000),
  ));
}

function mdhd(timescale: number, duration: number): Uint8Array {
  return box('mdhd', concat(
    fullBoxHeader(0, 0), u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0),
  ));
}

function hdlr(type: PreparedTrack['type']): Uint8Array {
  return box('hdlr', concat(
    fullBoxHeader(0, 0), u32(0), ascii(type === 'video' ? 'vide' : 'soun'), new Uint8Array(12),
    ascii(type === 'video' ? 'VideoHandler\0' : 'SoundHandler\0'),
  ));
}

function vmhd(): Uint8Array {
  return box('vmhd', concat(fullBoxHeader(0, 1), u16(0), u16(0), u16(0), u16(0)));
}

function smhd(): Uint8Array {
  return box('smhd', concat(fullBoxHeader(0, 0), u16(0), u16(0)));
}

function dinf(): Uint8Array {
  const url = box('url ', fullBoxHeader(0, 1));
  return box('dinf', box('dref', concat(fullBoxHeader(0, 0), u32(1), url)));
}

function matrix(): Uint8Array {
  return concat(
    u32(0x00010000), u32(0), u32(0),
    u32(0), u32(0x00010000), u32(0),
    u32(0), u32(0), u32(0x40000000),
  );
}

function trackDurationInMovieTicks(track: PreparedTrack, movieTimescale: number): number {
  const end = track.samples.reduce((max, sample) => Math.max(max, sample.cts + sample.duration, sample.dts + sample.duration), 0);
  return Math.max(0, Math.ceil(end * movieTimescale / track.timescale));
}

function runsOf(values: number[]): Array<{ count: number; value: number }> {
  const runs: Array<{ count: number; value: number }> = [];
  for (const value of values) {
    assertI32(value, 'sample table value');
    const last = runs.at(-1);
    if (last?.value === value) last.count++;
    else runs.push({ count: 1, value });
  }
  return runs;
}

function checkedTimescale(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0x7fffffff) {
    throw new TimedMp4UnsupportedError('FFMPEG_TIMED_STAGING_TIMESCALE_INVALID', `invalid timescale ${value}`);
  }
  return value;
}

function usToTicks(value: number, timescale: number): number {
  const ticks = Math.round(value * timescale / 1_000_000);
  assertI32(ticks, 'sample timestamp');
  return ticks;
}

function fullBoxHeader(version: number, flags: number): Uint8Array {
  return Uint8Array.of(version & 0xff, (flags >>> 16) & 0xff, (flags >>> 8) & 0xff, flags & 0xff);
}

function box(type: string, payload: Uint8Array): Uint8Array {
  if (type.length !== 4) throw new TypeError(`ISO box type must be four characters: ${type}`);
  const size = payload.byteLength + 8;
  assertU32(size, `${type} box size`);
  return concat(u32(size), ascii(type), payload);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function u16(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`uint16 out of range: ${value}`);
  return Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
}

function u32(value: number): Uint8Array {
  assertU32(value, 'uint32');
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function i32(value: number): Uint8Array {
  assertI32(value, 'int32');
  return u32(value >>> 0);
}

function assertU32(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new TimedMp4UnsupportedError('FFMPEG_TIMED_STAGING_RANGE_UNSUPPORTED', `${label} exceeds uint32: ${value}`);
  }
}

function assertI32(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
    throw new TimedMp4UnsupportedError('FFMPEG_TIMED_STAGING_RANGE_UNSUPPORTED', `${label} exceeds int32: ${value}`);
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
