import { describe, expect, test } from 'bun:test';
import {
  classifyHlsDecryptApplicability,
  classifyIsoDecryptApplicability,
  inspectHlsProtection,
  inspectIsoBmffProtection,
} from '../src/engines/ffmpeg-wasm/protection.ts';

describe('REQ-ENG-19: syntax-first CENC applicability', () => {
  test('admits the implemented nonfragmented CENC-CTR representation', () => {
    const inspection = inspectIsoBmffProtection(protectedMp4({ scheme: 'cenc' }));
    expect(inspection).toEqual({ protectedTracks: 1, scheme: 'cenc' });
    expect(classifyIsoDecryptApplicability(inspection, 'cenc-ctr')).toEqual({ supported: true });
  });

  const unsupportedRows: Array<{
    name: string;
    options: ProtectedOptions;
    reasonCode: string;
  }> = [
    { name: 'CBCS', options: { scheme: 'cbcs' }, reasonCode: 'FFMPEG_CENC_CBCS_UNSUPPORTED' },
    { name: 'pattern encryption', options: { scheme: 'cenc', pattern: [1, 9] }, reasonCode: 'FFMPEG_CENC_PATTERN_UNSUPPORTED' },
    { name: 'constant IV', options: { scheme: 'cenc', constantIv: true }, reasonCode: 'FFMPEG_CENC_IV_FORM_UNSUPPORTED' },
    { name: 'override parameters', options: { scheme: 'cenc', sencOverride: true }, reasonCode: 'FFMPEG_CENC_OVERRIDE_UNSUPPORTED' },
    { name: 'auxiliary info tables', options: { scheme: 'cenc', auxiliaryInfo: true }, reasonCode: 'FFMPEG_CENC_AUX_INFO_UNSUPPORTED' },
    { name: 'fragmented CENC', options: { scheme: 'cenc', fragmented: true }, reasonCode: 'FFMPEG_CENC_FRAGMENTED_UNSUPPORTED' },
  ];

  for (const row of unsupportedRows) {
    test(`returns reason-coded NA_ENGINE evidence for valid ${row.name}`, () => {
      const inspection = inspectIsoBmffProtection(protectedMp4(row.options));
      expect(inspection.unsupported?.reasonCode).toBe(row.reasonCode);
      expect(classifyIsoDecryptApplicability(inspection, 'cenc-ctr')).toMatchObject({
        supported: false,
        reasonCode: row.reasonCode,
      });
    });
  }

  test('reports mixed valid protection schemes distinctly', () => {
    const inspection = inspectIsoBmffProtection(protectedMp4({
      scheme: 'cenc',
      secondTrackScheme: 'cbcs',
    }));
    expect(inspection.protectedTracks).toBe(2);
    expect(inspection.unsupported?.reasonCode).toBe('FFMPEG_CENC_MIXED_SCHEMES_UNSUPPORTED');
  });

  test('classifies a valid but unimplemented requested scheme even on clear ISO BMFF', () => {
    const clear = box('moov', new Uint8Array());
    const inspection = inspectIsoBmffProtection(clear);
    expect(inspection.protectedTracks).toBe(0);
    expect(classifyIsoDecryptApplicability(inspection, 'clearkey')).toMatchObject({
      supported: false,
      reasonCode: 'FFMPEG_DECRYPT_SCHEME_UNSUPPORTED',
    });
  });

  test('damaged top-level boxes remain ordinary errors, never applicability', () => {
    const valid = protectedMp4({ scheme: 'cbcs' });
    const truncated = valid.slice(0, valid.byteLength - 1);
    expect(() => inspectIsoBmffProtection(truncated)).toThrow(/invalid root|truncated root/);
  });

  test('a truncated tenc remains an error even when the scheme itself is unsupported', () => {
    expect(() => inspectIsoBmffProtection(protectedMp4({ scheme: 'cbcs', truncateTenc: true })))
      .toThrow('truncated tenc');
  });

  test('truncated ciphertext metadata remains an error instead of a pattern/CBCS NA', () => {
    expect(() => inspectIsoBmffProtection(protectedMp4({
      scheme: 'cenc',
      pattern: [1, 9],
      truncatedSenc: true,
    }))).toThrow('truncated senc IV');
  });

  test('half-present auxiliary info is damaged input, not a supported variant', () => {
    expect(() => inspectIsoBmffProtection(protectedMp4({ scheme: 'cenc', onlySaiz: true })))
      .toThrow('requires both saiz and saio');
  });
});

describe('REQ-ENG-19: syntax-first HLS protection applicability', () => {
  test('admits AES-128 and classifies SAMPLE-AES with a stable reason code', () => {
    const aes = inspectHlsProtection(utf8([
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:6',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x00000000000000000000000000000001',
      '#EXTINF:6,',
      'seg0.ts',
      '#EXT-X-ENDLIST',
    ].join('\n')));
    expect(aes.methods).toEqual(['AES-128']);
    expect(classifyHlsDecryptApplicability(aes, 'hls-aes128')).toEqual({ supported: true });

    const sampleAes = inspectHlsProtection(utf8([
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key.bin"',
      '#EXTINF:6,',
      'seg0.ts',
    ].join('\n')));
    expect(classifyHlsDecryptApplicability(sampleAes, 'hls-aes128')).toMatchObject({
      supported: false,
      reasonCode: 'FFMPEG_HLS_SAMPLE_AES_UNSUPPORTED',
    });
    expect(classifyHlsDecryptApplicability(sampleAes, 'hls-sample-aes')).toMatchObject({
      supported: false,
      reasonCode: 'FFMPEG_HLS_SAMPLE_AES_UNSUPPORTED',
    });
  });

  test('malformed playlists and key attributes remain ordinary parse errors', () => {
    expect(() => inspectHlsProtection(utf8('#EXT-X-KEY:METHOD=AES-128\nseg.ts'))).toThrow('#EXTM3U');
    expect(() => inspectHlsProtection(utf8('#EXTM3U\n#EXT-X-KEY:URI="key"\nseg.ts'))).toThrow('without METHOD');
    expect(() => inspectHlsProtection(utf8('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128\nseg.ts'))).toThrow('without URI');
    expect(() => inspectHlsProtection(utf8('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key",IV=bad\nseg.ts')))
      .toThrow('malformed EXT-X-KEY IV');
    expect(() => inspectHlsProtection(Uint8Array.of(0xff, 0xfe))).toThrow('valid UTF-8');
  });
});

interface ProtectedOptions {
  scheme: string;
  secondTrackScheme?: string;
  pattern?: [number, number];
  constantIv?: boolean;
  sencOverride?: boolean;
  auxiliaryInfo?: boolean;
  onlySaiz?: boolean;
  fragmented?: boolean;
  truncateTenc?: boolean;
  truncatedSenc?: boolean;
}

function protectedMp4(options: ProtectedOptions): Uint8Array {
  const tracks = [protectedTrack(options)];
  if (options.secondTrackScheme) tracks.push(protectedTrack({ ...options, scheme: options.secondTrackScheme }));
  const moovChildren = [...tracks];
  if (options.fragmented) moovChildren.push(box('mvex', box('trex', new Uint8Array())));
  const roots = [box('ftyp', concat(utf8('isom'), u32(0), utf8('isom'))), box('moov', concat(...moovChildren))];
  if (options.fragmented) {
    const fragmentSenc = senc({});
    const traf = box('traf', concat(
      box('tfhd', Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 1)),
      box('trun', Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0)),
      fragmentSenc,
    ));
    roots.push(box('moof', traf));
  }
  return concat(...roots);
}

function protectedTrack(options: ProtectedOptions): Uint8Array {
  const tencBody = new Uint8Array(options.constantIv ? 33 : 24);
  tencBody[0] = options.pattern ? 1 : 0;
  if (options.pattern) tencBody[5] = ((options.pattern[0] & 0x0f) << 4) | (options.pattern[1] & 0x0f);
  tencBody[6] = 1;
  tencBody[7] = options.constantIv ? 0 : 8;
  for (let index = 0; index < 16; index++) tencBody[8 + index] = index;
  if (options.constantIv) {
    tencBody[24] = 8;
    tencBody.fill(0xa5, 25);
  }
  const tencBytes = options.truncateTenc ? tencBody.slice(0, 12) : tencBody;
  const sinf = box('sinf', concat(
    box('frma', utf8('avc1')),
    box('schm', concat(Uint8Array.of(0, 0, 0, 0), utf8(options.scheme), u32(0x00010000))),
    box('schi', box('tenc', tencBytes)),
  ));
  const entry = box('encv', concat(new Uint8Array(78), sinf));
  const stsd = box('stsd', concat(Uint8Array.of(0, 0, 0, 0), u32(1), entry));
  const aux: Uint8Array[] = [];
  if (!options.fragmented) {
    if (options.auxiliaryInfo || options.onlySaiz) aux.push(saiz());
    if (options.auxiliaryInfo) aux.push(saio());
    if (!options.auxiliaryInfo && !options.onlySaiz) {
      aux.push(senc({ override: options.sencOverride, truncated: options.truncatedSenc }));
    }
  }
  const stbl = box('stbl', concat(stsd, ...aux));
  return box('trak', box('mdia', box('minf', stbl)));
}

function senc(options: { override?: boolean; truncated?: boolean }): Uint8Array {
  const flags = options.override ? 1 : 0;
  const prefix = Uint8Array.of(0, 0, 0, flags);
  if (options.override) {
    const override = new Uint8Array(20);
    override[3] = 8;
    return box('senc', concat(prefix, override, u32(0)));
  }
  if (options.truncated) return box('senc', concat(prefix, u32(1), Uint8Array.of(1, 2, 3)));
  return box('senc', concat(prefix, u32(0)));
}

function saiz(): Uint8Array {
  return box('saiz', concat(Uint8Array.of(0, 0, 0, 0, 8), u32(0)));
}

function saio(): Uint8Array {
  return box('saio', concat(Uint8Array.of(0, 0, 0, 0), u32(1), u32(1234)));
}

function box(type: string, body: Uint8Array): Uint8Array {
  if (type.length !== 4) throw new Error(`box type must be four bytes: ${type}`);
  return concat(u32(body.byteLength + 8), utf8(type), body);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
