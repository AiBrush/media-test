import { MAX_REMUX_SAMPLES } from './binary.ts';
import type { RemuxProgramEvidence, RemuxReadResult, RemuxSampleEvidence } from './types.ts';

const SAMPLE_RATES = [96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350] as const;

function id3v2Size(bytes: Uint8Array): number | undefined {
  if (bytes.byteLength < 10 || String.fromCharCode(...bytes.subarray(0, 3)) !== 'ID3') return 0;
  if ([bytes[6], bytes[7], bytes[8], bytes[9]].some((value) => value! > 0x7f)) return undefined;
  const size = (bytes[6]! << 21) | (bytes[7]! << 14) | (bytes[8]! << 7) | bytes[9]!;
  const footer = (bytes[5]! & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

export function readAdtsProgram(bytes: Uint8Array): RemuxReadResult {
  const evidence = { reader: 'adts', byteLength: bytes?.byteLength ?? 0, detectedContainer: 'adts' } as const;
  try {
    if (!bytes || bytes.byteLength < 7) return { state: 'INCOMPLETE', reasonCode: 'REMUX_ADTS_INPUT_INCOMPLETE', evidence };
    const start = id3v2Size(bytes);
    if (start === undefined || start > bytes.byteLength) {
      return { state: 'MALFORMED', reasonCode: 'REMUX_ADTS_ID3_INVALID', evidence };
    }
    let offset = start;
    let sampleRate = 0;
    let channels = 0;
    let sampleFrames = 0;
    const samples: RemuxSampleEvidence[] = [];
    while (offset < bytes.byteLength) {
      if (samples.length >= MAX_REMUX_SAMPLES) {
        return { state: 'MALFORMED', reasonCode: 'REMUX_ADTS_FRAME_COUNT_EXCESSIVE', evidence };
      }
      if (offset + 7 > bytes.byteLength) return { state: 'INCOMPLETE', reasonCode: 'REMUX_ADTS_HEADER_INCOMPLETE', evidence };
      const b1 = bytes[offset + 1]!;
      if (bytes[offset] !== 0xff || (b1 & 0xf6) !== 0xf0) {
        return { state: 'MALFORMED', reasonCode: 'REMUX_ADTS_SYNC_INVALID', evidence };
      }
      const sampleRateIndex = (bytes[offset + 2]! >> 2) & 0x0f;
      const rate = SAMPLE_RATES[sampleRateIndex];
      if (!rate) return { state: 'MALFORMED', reasonCode: 'REMUX_ADTS_SAMPLE_RATE_INVALID', evidence };
      const channelConfig = ((bytes[offset + 2]! & 1) << 2) | (bytes[offset + 3]! >> 6);
      if (channelConfig === 0 || channelConfig > 7) {
        return { state: 'UNSUPPORTED_STRUCTURE', reasonCode: 'REMUX_ADTS_PCE_CHANNEL_CONFIG_UNSUPPORTED', evidence };
      }
      if ((sampleRate && sampleRate !== rate) || (channels && channels !== channelConfig)) {
        return { state: 'MALFORMED', reasonCode: 'REMUX_ADTS_CONFIG_CHANGED_MIDSTREAM', evidence };
      }
      sampleRate = rate;
      channels = channelConfig;
      const frameLength = ((bytes[offset + 3]! & 3) << 11) | (bytes[offset + 4]! << 3) | (bytes[offset + 5]! >> 5);
      const headerLength = (b1 & 1) !== 0 ? 7 : 9;
      if (frameLength < headerLength) return { state: 'MALFORMED', reasonCode: 'REMUX_ADTS_FRAME_LENGTH_INVALID', evidence };
      if (offset + frameLength > bytes.byteLength) {
        return { state: 'INCOMPLETE', reasonCode: 'REMUX_ADTS_FRAME_INCOMPLETE', evidence };
      }
      const blocks = (bytes[offset + 6]! & 3) + 1;
      const frames = 1024 * blocks;
      const ptsUs = Math.round((sampleFrames / sampleRate) * 1_000_000);
      const durationUs = Math.round((frames / sampleRate) * 1_000_000);
      samples.push({
        payload: bytes.subarray(offset + headerLength, offset + frameLength),
        ptsUs,
        dtsUs: ptsUs,
        durationUs,
        keyframe: true,
        fileOffset: offset,
        framing: 'adts',
      });
      sampleFrames += frames;
      offset += frameLength;
    }
    if (samples.length === 0) return { state: 'MALFORMED', reasonCode: 'REMUX_ADTS_NO_FRAMES', evidence };
    const value: RemuxProgramEvidence = {
      schema: 'media-test/remux-program@1',
      container: 'adts',
      byteLength: bytes.byteLength,
      durationUs: Math.round((sampleFrames / sampleRate) * 1_000_000),
      tracks: [{
        id: 'adts:0', type: 'audio', codec: 'aac', sampleRate, channels,
        timescale: sampleRate, samples,
      }],
      representation: {},
    };
    return {
      state: 'OK', value,
      evidence: { ...evidence, parsedTracks: 1, parsedSamples: samples.length },
    };
  } catch {
    return { state: 'MALFORMED', reasonCode: 'REMUX_ADTS_PARSE_GUARD', evidence };
  }
}
