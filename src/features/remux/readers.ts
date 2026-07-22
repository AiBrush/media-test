import { ascii, canonicalContainer } from './binary.ts';
import { readAdtsProgram } from './reader-adts.ts';
import { readEbmlProgram } from './reader-ebml.ts';
import { readFlacProgram } from './reader-flac.ts';
import { readIsoBmffProgram } from './reader-isobmff.ts';
export {
  aacAudioSpecificConfigFromEsds,
  aacLcChannelsFromEsds,
  parseIsoAudioSampleEntryHeader,
  parseIsoVisualSampleEntryHeader,
} from './reader-isobmff.ts';
import { readMp3Program } from './reader-mp3.ts';
export { mp3FrameAudioConfig } from './reader-mp3.ts';
import { readOggProgram } from './reader-ogg.ts';
import { readTsProgram } from './reader-ts.ts';
import type { RemuxReadResult } from './types.ts';

function looksTs(bytes: Uint8Array): boolean {
  for (const stride of [188, 192, 204]) {
    for (let offset = 0; offset < Math.min(stride, bytes.byteLength); offset++) {
      if (bytes[offset] === 0x47 && bytes[offset + stride] === 0x47 && bytes[offset + stride * 2] === 0x47) return true;
    }
  }
  return false;
}

function looksMp3(bytes: Uint8Array): boolean {
  if (ascii(bytes, 0, 3) === 'ID3') return true;
  return bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 0x06) !== 0;
}

function looksAdts(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xf6) === 0xf0;
}

function detectedContainer(bytes: Uint8Array): string | undefined {
  if (!bytes || bytes.byteLength < 2) return undefined;
  if (bytes.byteLength >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  if (ascii(bytes, 0, 4) === 'OggS') return 'ogg';
  if (ascii(bytes, 0, 4) === 'fLaC') return 'flac';
  if (looksTs(bytes)) return 'ts';
  if (looksAdts(bytes)) return 'adts';
  if (looksMp3(bytes)) return 'mp3';
  if (bytes.byteLength >= 8 && ['ftyp', 'moov', 'mdat', 'free', 'wide'].includes(ascii(bytes, 4, 4))) return 'mp4';
  return undefined;
}

/**
 * Payload-bearing neutral reader for every container advertised by the remux family. It never
 * throws and it never returns a partial program as OK. Unsupported reader coverage is a typed
 * harness limitation; malformed candidate bytes stay distinguishable from that limitation.
 */
export function readNeutralRemuxProgram(bytes: Uint8Array, containerHint?: string): RemuxReadResult {
  const hint = canonicalContainer(containerHint);
  const detected = detectedContainer(bytes);
  const container = detected ?? hint;
  try {
    switch (container) {
      case 'mp4':
      case 'mov':
        return readIsoBmffProgram(bytes, hint === 'mov' ? 'mov' : container);
      case 'mkv':
      case 'webm':
        return readEbmlProgram(bytes, hint === 'mkv' ? 'mkv' : container);
      case 'ts':
        return readTsProgram(bytes);
      case 'adts':
        return readAdtsProgram(bytes);
      case 'mp3':
        return readMp3Program(bytes);
      case 'ogg':
        return readOggProgram(bytes);
      case 'flac':
        return readFlacProgram(bytes);
      default:
        return {
          state: 'UNSUPPORTED_FORMAT',
          reasonCode: 'REMUX_NEUTRAL_FORMAT_UNSUPPORTED',
          evidence: {
            reader: 'remux-dispatch', byteLength: bytes?.byteLength ?? 0,
            ...(containerHint ? { containerHint } : {}),
          },
        };
    }
  } catch {
    return {
      state: 'MALFORMED', reasonCode: 'REMUX_NEUTRAL_READER_GUARD',
      evidence: {
        reader: 'remux-dispatch', byteLength: bytes?.byteLength ?? 0,
        ...(containerHint ? { containerHint } : {}), ...(container ? { detectedContainer: container } : {}),
      },
    };
  }
}
