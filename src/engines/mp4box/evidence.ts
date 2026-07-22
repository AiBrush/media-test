import type { FrameRateProvenance } from '../../core/engine.ts';

const AAC_SAMPLE_RATES = [
  96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050,
  16_000, 12_000, 11_025, 8_000, 7_350,
] as const;
const AAC_CHANNELS = [undefined, 1, 2, 3, 4, 5, 6, 8] as const;

export interface AacConfigEvidence {
  raw: Uint8Array;
  audioObjectType: number;
  coreAudioObjectType: number;
  codedSampleRate?: number;
  presentationSampleRate?: number;
  codedChannels?: number;
  presentationChannels?: number;
  sbrPresent: boolean;
  psPresent: boolean;
}

class BitReader {
  private bit = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get position(): number {
    return this.bit;
  }

  get remaining(): number {
    return this.bytes.byteLength * 8 - this.bit;
  }

  seek(bit: number): void {
    this.bit = Math.max(0, Math.min(bit, this.bytes.byteLength * 8));
  }

  read(count: number): number | undefined {
    if (count < 0 || count > 31 || this.remaining < count) return undefined;
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = this.bytes[this.bit >> 3];
      if (byte === undefined) return undefined;
      value = value * 2 + ((byte >> (7 - (this.bit & 7))) & 1);
      this.bit++;
    }
    return value;
  }
}

function readAudioObjectType(bits: BitReader): number | undefined {
  const value = bits.read(5);
  if (value === undefined) return undefined;
  if (value !== 31) return value;
  const extension = bits.read(6);
  return extension === undefined ? undefined : 32 + extension;
}

function readSampleRate(bits: BitReader): number | undefined {
  const index = bits.read(4);
  if (index === undefined) return undefined;
  if (index === 15) return bits.read(24);
  return AAC_SAMPLE_RATES[index];
}

function channelCount(configuration: number | undefined): number | undefined {
  return configuration === undefined ? undefined : AAC_CHANNELS[configuration];
}

/** Parse explicit HE-AAC plus sync-extension SBR/PS without collapsing coded and presentation views. */
export function parseAacAudioSpecificConfig(data: Uint8Array | undefined): AacConfigEvidence | undefined {
  if (!data || data.byteLength < 2) return undefined;
  const bits = new BitReader(data);
  const declaredObjectType = readAudioObjectType(bits);
  const declaredRate = readSampleRate(bits);
  const channelConfiguration = bits.read(4);
  if (declaredObjectType === undefined) return undefined;

  let coreAudioObjectType = declaredObjectType;
  let codedSampleRate = declaredRate;
  let presentationSampleRate = declaredRate;
  let codedChannels = channelCount(channelConfiguration);
  let presentationChannels = codedChannels;
  let sbrPresent = false;
  let psPresent = false;

  if (declaredObjectType === 5 || declaredObjectType === 29) {
    sbrPresent = true;
    psPresent = declaredObjectType === 29;
    const extensionRate = readSampleRate(bits);
    const extensionObjectType = readAudioObjectType(bits);
    coreAudioObjectType = extensionObjectType ?? coreAudioObjectType;
    presentationSampleRate = extensionRate ?? declaredRate;
    // In explicit HE-AAC the first rate is the coded AAC core and the extension rate is output.
    codedSampleRate = declaredRate;
    if (psPresent && codedChannels === 1) presentationChannels = 2;
  } else {
    // GASpecificConfig is variable length. Scan all remaining bit positions for the normative
    // 11-bit sync extension rather than pretending the two-byte prefix is the complete ASC.
    const scanStart = bits.position;
    for (let position = scanStart; position + 17 <= data.byteLength * 8; position++) {
      bits.seek(position);
      if (bits.read(11) !== 0x2b7) continue;
      const extensionObjectType = readAudioObjectType(bits);
      if (extensionObjectType !== 5) continue;
      const present = bits.read(1);
      if (present !== 1) break;
      sbrPresent = true;
      const extensionRate = readSampleRate(bits);
      if (extensionRate !== undefined) presentationSampleRate = extensionRate;
      // PS may follow as syncExtensionType 0x548 + psPresentFlag.
      if (bits.remaining >= 12 && bits.read(11) === 0x548 && bits.read(1) === 1) {
        psPresent = true;
        if (codedChannels === 1) presentationChannels = 2;
      }
      break;
    }
  }

  return {
    raw: data.slice(),
    audioObjectType: declaredObjectType,
    coreAudioObjectType,
    ...(codedSampleRate !== undefined ? { codedSampleRate } : {}),
    ...(presentationSampleRate !== undefined ? { presentationSampleRate } : {}),
    ...(codedChannels !== undefined ? { codedChannels } : {}),
    ...(presentationChannels !== undefined ? { presentationChannels } : {}),
    sbrPresent,
    psPresent,
  };
}

export interface Mp4TimingSample {
  cts: number;
  duration: number;
  timescale: number;
}

export interface FpsEvidence {
  fps: number;
  provenance: FrameRateProvenance;
}

/** Derive cadence from presentation ticks, retaining exact rational evidence for CFR/NTSC media. */
export function fpsEvidenceFromSamples(samples: readonly Mp4TimingSample[]): FpsEvidence | undefined {
  if (samples.length === 0) return undefined;
  const timescale = samples.find((sample) => sample.timescale > 0)?.timescale;
  if (!timescale) return undefined;
  const ordered = [...samples].sort((a, b) => a.cts - b.cts);
  const deltas: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const delta = ordered[i]!.cts - ordered[i - 1]!.cts;
    if (delta > 0) deltas.push(delta);
  }
  const lastDuration = ordered[ordered.length - 1]?.duration ?? 0;
  const spanTicks = ordered.length === 1
    ? lastDuration
    : ordered[ordered.length - 1]!.cts + Math.max(0, lastDuration) - ordered[0]!.cts;
  if (!(spanTicks > 0)) return undefined;

  const fps = (ordered.length * timescale) / spanTicks;
  const minDelta = deltas.length ? Math.min(...deltas) : lastDuration;
  const maxDelta = deltas.length ? Math.max(...deltas) : lastDuration;
  const cadence = deltas.length === 0
    ? 'UNKNOWN' as const
    : maxDelta - minDelta <= 1
      ? 'CFR' as const
      : 'VFR' as const;
  const observedIntervalUs = (spanTicks * 1_000_000) / timescale;
  const rational = cadence === 'CFR' && minDelta > 0
    ? reduceRational(timescale, Math.round((minDelta + maxDelta) / 2))
    : undefined;
  const envelope = minDelta > 0 && maxDelta > 0
    ? { minFps: timescale / maxDelta, maxFps: timescale / minDelta }
    : undefined;
  return {
    fps,
    provenance: {
      source: 'observed',
      cadence,
      sampleCount: ordered.length,
      observedIntervalUs,
      ...(rational ? { rational } : {}),
      ...(envelope ? { envelope } : {}),
    },
  };
}

function reduceRational(numerator: number, denominator: number): { numerator: number; denominator: number } {
  let a = Math.abs(Math.trunc(numerator));
  let b = Math.abs(Math.trunc(denominator));
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  const divisor = a || 1;
  return { numerator: Math.trunc(numerator / divisor), denominator: Math.trunc(denominator / divisor) };
}

interface IsoBox {
  type: string;
  start: number;
  end: number;
  payloadStart: number;
}

export interface FragmentValidation {
  valid: boolean;
  reasonCode: string;
  detail: string;
  mediaSegments: number;
  sampleCount: number;
  mdatPayloadBytes: number;
}

function invalid(reasonCode: string, detail: string, mediaSegments = 0, sampleCount = 0, mdatPayloadBytes = 0): FragmentValidation {
  return { valid: false, reasonCode, detail, mediaSegments, sampleCount, mdatPayloadBytes };
}

function readBoxes(bytes: Uint8Array, start = 0, end = bytes.byteLength): IsoBox[] | undefined {
  const boxes: IsoBox[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) return undefined;
    const size32 = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    let header = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > end) return undefined;
      size = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
      header = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) return undefined;
    boxes.push({ type, start: offset, end: offset + size, payloadStart: offset + header });
    offset += size;
  }
  return boxes;
}

function directChildren(bytes: Uint8Array, box: IsoBox): IsoBox[] | undefined {
  return readBoxes(bytes, box.payloadStart, box.end);
}

/**
 * mp4box.js 2.3.0 leaves generated `trun` boxes at version 0 even when a source sample has a
 * negative composition offset. The payload bytes are already the correct two's-complement int32;
 * changing only the FullBox version makes readers interpret them as signed, as ISO BMFF requires.
 * The adapter calls this only for a fragment whose exact source sample range proves a negative
 * `cts - dts`, so a legitimate large unsigned version-0 offset is never guessed to be negative.
 */
export function markFragmentSignedCompositionOffsets(bytes: Uint8Array): number {
  const top = readBoxes(bytes);
  if (!top) return 0;
  let marked = 0;
  for (const moof of top.filter((box) => box.type === 'moof')) {
    const moofChildren = directChildren(bytes, moof);
    for (const traf of moofChildren?.filter((box) => box.type === 'traf') ?? []) {
      const trafChildren = directChildren(bytes, traf);
      for (const trun of trafChildren?.filter((box) => box.type === 'trun') ?? []) {
        if (trun.payloadStart + 4 > trun.end) continue;
        const flags = ((bytes[trun.payloadStart + 1] ?? 0) << 16)
          | ((bytes[trun.payloadStart + 2] ?? 0) << 8)
          | (bytes[trun.payloadStart + 3] ?? 0);
        if (!(flags & 0x000800)) continue;
        const version = bytes[trun.payloadStart];
        if (version !== 0 && version !== 1) continue;
        bytes[trun.payloadStart] = 1;
        marked++;
      }
    }
  }
  return marked;
}

function trunEvidence(bytes: Uint8Array, box: IsoBox): { sampleCount: number; sampleBytes: number } | undefined {
  if (box.payloadStart + 8 > box.end) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = ((bytes[box.payloadStart + 1] ?? 0) << 16)
    | ((bytes[box.payloadStart + 2] ?? 0) << 8)
    | (bytes[box.payloadStart + 3] ?? 0);
  const sampleCount = view.getUint32(box.payloadStart + 4);
  let offset = box.payloadStart + 8;
  if (flags & 0x000001) offset += 4;
  if (flags & 0x000004) offset += 4;
  const fieldsPerSample = Number(Boolean(flags & 0x000100))
    + Number(Boolean(flags & 0x000200))
    + Number(Boolean(flags & 0x000400))
    + Number(Boolean(flags & 0x000800));
  if (fieldsPerSample === 0 || offset + sampleCount * fieldsPerSample * 4 > box.end) return undefined;
  let sampleBytes = 0;
  for (let sample = 0; sample < sampleCount; sample++) {
    if (flags & 0x000100) offset += 4;
    if (flags & 0x000200) {
      sampleBytes += view.getUint32(offset);
      offset += 4;
    }
    if (flags & 0x000400) offset += 4;
    if (flags & 0x000800) offset += 4;
  }
  // Without per-sample sizes this validator cannot prove referenced payload completeness.
  if (!(flags & 0x000200)) return undefined;
  return { sampleCount, sampleBytes };
}

/** Validate the exact init + media graph MP4Box's fragment writer is required to return. */
export function validateFragmentedMp4(bytes: Uint8Array, expectedSamples?: number): FragmentValidation {
  const top = readBoxes(bytes);
  if (!top) return invalid('MP4BOX_FRAGMENT_BOX_TRUNCATED', 'top-level ISO box graph is truncated');
  const ftyp = top.find((box) => box.type === 'ftyp');
  const moov = top.find((box) => box.type === 'moov');
  if (!ftyp || !moov || ftyp.start > moov.start) {
    return invalid('MP4BOX_FRAGMENT_INIT_MISSING', 'fragmented output requires ftyp followed by moov');
  }
  const moovChildren = directChildren(bytes, moov);
  if (!moovChildren?.some((box) => box.type === 'mvex')) {
    return invalid('MP4BOX_FRAGMENT_MVEX_MISSING', 'fragmented initialization segment has no mvex');
  }

  const moofs = top.filter((box) => box.type === 'moof');
  if (moofs.length === 0) return invalid('MP4BOX_FRAGMENT_MEDIA_MISSING', 'initialization-only output has no media segment');
  let sampleCount = 0;
  let mdatPayloadBytes = 0;
  for (const box of top) {
    if (box.type === 'mdat') mdatPayloadBytes += box.end - box.payloadStart;
  }
  for (const moof of moofs) {
    const topIndex = top.indexOf(moof);
    let segmentMdatPayloadBytes = 0;
    for (let index = topIndex + 1; index < top.length; index++) {
      const sibling = top[index]!;
      if (sibling.type === 'moof' || sibling.type === 'styp') break;
      if (sibling.type === 'mdat') segmentMdatPayloadBytes += sibling.end - sibling.payloadStart;
    }
    if (segmentMdatPayloadBytes === 0) {
      return invalid(
        'MP4BOX_FRAGMENT_MDAT_MISSING',
        'each moof must be followed by at least one non-empty mdat before the next media segment',
        moofs.length,
        sampleCount,
        mdatPayloadBytes,
      );
    }
    let segmentReferencedBytes = 0;
    const moofChildren = directChildren(bytes, moof);
    const trafs = moofChildren?.filter((box) => box.type === 'traf') ?? [];
    if (trafs.length === 0) return invalid('MP4BOX_FRAGMENT_TRAF_MISSING', 'media fragment has no traf', moofs.length, sampleCount, mdatPayloadBytes);
    for (const traf of trafs) {
      const trafChildren = directChildren(bytes, traf);
      if (!trafChildren?.some((box) => box.type === 'tfdt')) {
        return invalid('MP4BOX_FRAGMENT_TFDT_MISSING', 'every traf must carry tfdt', moofs.length, sampleCount, mdatPayloadBytes);
      }
      const truns = trafChildren.filter((box) => box.type === 'trun');
      if (truns.length === 0) return invalid('MP4BOX_FRAGMENT_TRUN_MISSING', 'traf has no trun', moofs.length, sampleCount, mdatPayloadBytes);
      for (const trun of truns) {
        const evidence = trunEvidence(bytes, trun);
        if (!evidence || evidence.sampleCount === 0) {
          return invalid('MP4BOX_FRAGMENT_TRUN_INVALID', 'trun has no provable referenced samples', moofs.length, sampleCount, mdatPayloadBytes);
        }
        sampleCount += evidence.sampleCount;
        segmentReferencedBytes += evidence.sampleBytes;
      }
    }
    if (segmentMdatPayloadBytes < segmentReferencedBytes) {
      return invalid(
        'MP4BOX_FRAGMENT_MDAT_INCOMPLETE',
        `media segment mdat payload ${segmentMdatPayloadBytes} < referenced sample bytes ${segmentReferencedBytes}`,
        moofs.length,
        sampleCount,
        mdatPayloadBytes,
      );
    }
  }
  if (expectedSamples !== undefined && sampleCount !== expectedSamples) {
    return invalid('MP4BOX_FRAGMENT_SAMPLE_COUNT_MISMATCH', `fragment graph carries ${sampleCount}/${expectedSamples} samples`, moofs.length, sampleCount, mdatPayloadBytes);
  }
  return {
    valid: true,
    reasonCode: 'MP4BOX_FRAGMENT_COMPLETE',
    detail: `${moofs.length} complete media fragment(s), ${sampleCount} referenced sample(s)`,
    mediaSegments: moofs.length,
    sampleCount,
    mdatPayloadBytes,
  };
}
