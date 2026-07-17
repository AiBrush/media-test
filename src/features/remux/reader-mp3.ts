import { MAX_REMUX_SAMPLES } from './binary.ts';
import type { RemuxProgramEvidence, RemuxReadResult, RemuxSampleEvidence } from './types.ts';

const V1_BITRATES: Record<number, readonly number[]> = {
  1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
};
const V2_BITRATES: Record<number, readonly number[]> = {
  1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

function synchsafe(bytes: Uint8Array, offset: number): number | undefined {
  const fields = [bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]];
  if (fields.some((value) => value === undefined || value > 0x7f)) return undefined;
  return (fields[0]! << 21) | (fields[1]! << 14) | (fields[2]! << 7) | fields[3]!;
}

function firstAudioOffset(bytes: Uint8Array): number | undefined {
  if (bytes.byteLength >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = synchsafe(bytes, 6);
    if (size === undefined) return undefined;
    return 10 + size + ((bytes[5]! & 0x10) !== 0 ? 10 : 0);
  }
  return 0;
}

export function readMp3Program(bytes: Uint8Array): RemuxReadResult {
  const evidence = { reader: 'mp3', byteLength: bytes?.byteLength ?? 0, detectedContainer: 'mp3' } as const;
  try {
    if (!bytes || bytes.byteLength < 4) return { state: 'INCOMPLETE', reasonCode: 'REMUX_MP3_INPUT_INCOMPLETE', evidence };
    const first = firstAudioOffset(bytes);
    if (first === undefined || first > bytes.byteLength) return { state: 'MALFORMED', reasonCode: 'REMUX_MP3_ID3_INVALID', evidence };
    let end = bytes.byteLength;
    if (end >= 128 && bytes[end - 128] === 0x54 && bytes[end - 127] === 0x41 && bytes[end - 126] === 0x47) end -= 128;
    let offset = first;
    let canonicalRate = 0;
    let canonicalChannels = 0;
    let elapsedFrames = 0;
    const samples: RemuxSampleEvidence[] = [];
    while (offset < end) {
      if (samples.length >= MAX_REMUX_SAMPLES) return { state: 'MALFORMED', reasonCode: 'REMUX_MP3_FRAME_COUNT_EXCESSIVE', evidence };
      if (offset + 4 > end) return { state: 'INCOMPLETE', reasonCode: 'REMUX_MP3_HEADER_INCOMPLETE', evidence };
      const header = ((bytes[offset]! * 0x1000000) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!) >>> 0;
      if (((header & 0xffe00000) >>> 0) !== 0xffe00000) return { state: 'MALFORMED', reasonCode: 'REMUX_MP3_SYNC_INVALID', evidence };
      const versionBits = (header >>> 19) & 3;
      const layerBits = (header >>> 17) & 3;
      const bitrateIndex = (header >>> 12) & 0xf;
      const rateIndex = (header >>> 10) & 3;
      if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
        return { state: 'MALFORMED', reasonCode: 'REMUX_MP3_HEADER_INVALID', evidence };
      }
      const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
      const layer = 4 - layerBits;
      const baseRates = [44_100, 48_000, 32_000] as const;
      const sampleRate = Math.round(baseRates[rateIndex]! / (version === 1 ? 1 : version === 2 ? 2 : 4));
      const bitrateTable = version === 1 ? V1_BITRATES[layer] : V2_BITRATES[layer];
      const bitrate = bitrateTable?.[bitrateIndex];
      if (!bitrate) return { state: 'MALFORMED', reasonCode: 'REMUX_MP3_BITRATE_INVALID', evidence };
      const padding = (header >>> 9) & 1;
      const frameLength = layer === 1
        ? (Math.floor((12 * bitrate * 1000) / sampleRate) + padding) * 4
        : Math.floor((((layer === 3 && version !== 1) ? 72 : 144) * bitrate * 1000) / sampleRate) + padding;
      const frameSamples = layer === 1 ? 384 : layer === 2 ? 1152 : version === 1 ? 1152 : 576;
      if (frameLength < 4) return { state: 'MALFORMED', reasonCode: 'REMUX_MP3_FRAME_LENGTH_INVALID', evidence };
      if (offset + frameLength > end) return { state: 'INCOMPLETE', reasonCode: 'REMUX_MP3_FRAME_INCOMPLETE', evidence };
      const channels = ((header >>> 6) & 3) === 3 ? 1 : 2;
      if ((canonicalRate && canonicalRate !== sampleRate) || (canonicalChannels && canonicalChannels !== channels)) {
        return { state: 'MALFORMED', reasonCode: 'REMUX_MP3_CONFIG_CHANGED_MIDSTREAM', evidence };
      }
      canonicalRate = sampleRate;
      canonicalChannels = channels;
      const ptsUs = Math.round((elapsedFrames / sampleRate) * 1_000_000);
      const durationUs = Math.round((frameSamples / sampleRate) * 1_000_000);
      samples.push({
        payload: bytes.subarray(offset, offset + frameLength), ptsUs, dtsUs: ptsUs, durationUs,
        keyframe: true, fileOffset: offset, framing: 'mpeg-audio-frame',
      });
      elapsedFrames += frameSamples;
      offset += frameLength;
    }
    if (samples.length === 0) return { state: 'MALFORMED', reasonCode: 'REMUX_MP3_NO_FRAMES', evidence };
    const value: RemuxProgramEvidence = {
      schema: 'media-test/remux-program@1', container: 'mp3', byteLength: bytes.byteLength,
      durationUs: Math.round((elapsedFrames / canonicalRate) * 1_000_000),
      tracks: [{
        id: 'mp3:0', type: 'audio', codec: 'mp3', sampleRate: canonicalRate,
        channels: canonicalChannels, timescale: canonicalRate, samples,
      }],
      representation: {},
    };
    return { state: 'OK', value, evidence: { ...evidence, parsedTracks: 1, parsedSamples: samples.length } };
  } catch {
    return { state: 'MALFORMED', reasonCode: 'REMUX_MP3_PARSE_GUARD', evidence };
  }
}
