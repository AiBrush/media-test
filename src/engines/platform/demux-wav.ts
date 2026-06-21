import type { DemuxResult, NormalizedMetadata, PacketInfo } from '../../core/engine.ts';

const WAV_PACKET_TARGET_BYTES = 16_384;

interface WavInfo {
  codec: 'pcm-s16' | 'pcm-s24' | 'pcm-f32';
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  byteRate: number;
  dataOffset: number;
  dataSize: number;
}

export class UnsupportedWavError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedWavError';
  }
}

export function looksLikeWav(bytes: Uint8Array): boolean {
  return fourcc(bytes, 0) === 'RIFF' && fourcc(bytes, 8) === 'WAVE';
}

export function probeWavMetadata(bytes: Uint8Array): NormalizedMetadata {
  const info = parseWavInfo(bytes);
  const durationSec = info.byteRate > 0 && info.dataSize > 0 ? info.dataSize / info.byteRate : null;
  return {
    container: 'wav',
    durationSec,
    tracks: [
      {
        type: 'audio',
        codec: info.codec,
        sampleRate: info.sampleRate,
        channels: info.channels,
        bitrate: info.byteRate * 8,
        language: null,
      },
    ],
  };
}

export function demuxWav(bytes: Uint8Array): DemuxResult {
  const info = parseWavInfo(bytes);
  const metadata = probeWavMetadata(bytes);
  const packets: PacketInfo[] = [];
  const dataEnd = Math.min(bytes.length, info.dataOffset + info.dataSize);
  const target = alignPacketSize(WAV_PACKET_TARGET_BYTES, info.blockAlign);
  for (let offset = info.dataOffset; offset < dataEnd; offset += target) {
    const size = Math.min(target, dataEnd - offset);
    packets.push({
      trackIndex: 0,
      size,
      ptsUs: Math.round(((offset - info.dataOffset) * 1_000_000) / info.byteRate),
      dtsUs: Math.round(((offset - info.dataOffset) * 1_000_000) / info.byteRate),
      keyframe: true,
    });
  }
  return { metadata, packets };
}

function parseWavInfo(bytes: Uint8Array): WavInfo {
  if (!looksLikeWav(bytes)) throw new UnsupportedWavError('not a RIFF/WAVE file');

  let offset = 12;
  let fmt:
    | {
        audioFormat: number;
        channels: number;
        sampleRate: number;
        byteRate: number;
        blockAlign: number;
        bitsPerSample: number;
        subFormat?: number;
      }
    | undefined;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const id = fourcc(bytes, offset);
    const size = le32(bytes, offset + 4);
    const body = offset + 8;
    const next = body + size + (size % 2);
    if (next > bytes.length + 1) break;

    if (id === 'fmt ' && size >= 16) {
      fmt = {
        audioFormat: le16(bytes, body),
        channels: le16(bytes, body + 2),
        sampleRate: le32(bytes, body + 4),
        byteRate: le32(bytes, body + 8),
        blockAlign: le16(bytes, body + 12),
        bitsPerSample: le16(bytes, body + 14),
      };
      if (fmt.audioFormat === 0xfffe && size >= 40) {
        fmt.subFormat = le16(bytes, body + 24);
      }
    } else if (id === 'data') {
      dataOffset = body;
      dataSize = Math.min(size, Math.max(0, bytes.length - body));
      break;
    }

    offset = next;
  }

  if (!fmt) throw new UnsupportedWavError('WAV missing fmt chunk');
  if (dataOffset < 0) throw new UnsupportedWavError('WAV missing data chunk');
  if (fmt.channels <= 0 || fmt.sampleRate <= 0 || fmt.byteRate <= 0 || fmt.blockAlign <= 0) {
    throw new UnsupportedWavError('WAV fmt chunk has invalid audio geometry');
  }

  const codec = wavCodec(fmt.subFormat ?? fmt.audioFormat, fmt.bitsPerSample);
  return {
    codec,
    channels: fmt.channels,
    sampleRate: fmt.sampleRate,
    bitsPerSample: fmt.bitsPerSample,
    blockAlign: fmt.blockAlign,
    byteRate: fmt.byteRate,
    dataOffset,
    dataSize,
  };
}

function wavCodec(audioFormat: number, bitsPerSample: number): WavInfo['codec'] {
  if (audioFormat === 1 && bitsPerSample === 16) return 'pcm-s16';
  if (audioFormat === 1 && bitsPerSample === 24) return 'pcm-s24';
  if (audioFormat === 3 && bitsPerSample === 32) return 'pcm-f32';
  throw new UnsupportedWavError(`unsupported WAV codec format=${audioFormat} bits=${bitsPerSample}`);
}

function alignPacketSize(target: number, blockAlign: number): number {
  const blocks = Math.max(1, Math.floor(target / blockAlign));
  return blocks * blockAlign;
}

function fourcc(bytes: Uint8Array, offset: number): string {
  if (offset + 4 > bytes.length) return '';
  return String.fromCharCode(
    bytes[offset] as number,
    bytes[offset + 1] as number,
    bytes[offset + 2] as number,
    bytes[offset + 3] as number,
  );
}

function le16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] as number) | ((bytes[offset + 1] as number) << 8)) >>> 0;
}

function le32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] as number) |
      ((bytes[offset + 1] as number) << 8) |
      ((bytes[offset + 2] as number) << 16) |
      ((bytes[offset + 3] as number) << 24)) >>>
    0
  );
}
