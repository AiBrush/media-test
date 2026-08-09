import { describe, expect, test } from 'bun:test';

import {
  CONCRETE_OPERATION_PROTOCOL,
  isMalformedInputError,
  type ConcreteOperationRequest,
  type EncryptionScheme,
  type MediaInput,
  type NormalizedTrack,
} from '../src/core/engine.ts';
import {
  AibrushMediaEngine,
  assertAibrushHlsDecryptRequest,
} from '../src/engines/aibrush-media/adapter.ts';
import { decideAibrushSupport } from '../src/engines/aibrush-media/support.ts';

const VIDEO: NormalizedTrack = {
  type: 'video',
  codec: 'h264',
  nativeCodecTag: 'avc1.640028',
  width: 1_920,
  height: 1_080,
  fps: 30,
};

const EXPLICIT_IV = '00112233445566778899aabbccddeeff';
const WRONG_IV = 'ffeeddccbbaa99887766554433221100';

function playlist(method: 'AES-128' | 'SAMPLE-AES', ivHex = EXPLICIT_IV): string {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-MEDIA-SEQUENCE:0',
    `#EXT-X-KEY:METHOD=${method},URI="key.bin",IV=0x${ivHex}`,
    '#EXTINF:1,',
    'segment.ts',
    '#EXT-X-ENDLIST',
  ].join('\n');
}

function request(
  container: string,
  optionScheme: EncryptionScheme,
  declaredScheme?: EncryptionScheme,
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: `encryption/test-${optionScheme}`,
    operation: 'decrypt',
    inputs: [{
      id: `fixture.${container}`,
      mime: 'application/octet-stream',
      container,
      mutated: false,
      sourceEvidence: 'RESOLVED',
      tracks: [VIDEO],
      sizeBytes: 1_024,
    }],
    ...(declaredScheme === undefined ? {} : { encryption: declaredScheme }),
    options: { scheme: optionScheme },
  };
}

describe('aibrush-media decrypt applicability', () => {
  test('uses the requested option scheme when negative rows intentionally omit requires.encryption', () => {
    expect(decideAibrushSupport(request('hls', 'hls-aes128'))).toMatchObject({ supported: true });
    expect(decideAibrushSupport(request('mp4', 'hls-sample-aes'))).toMatchObject({
      supported: false,
      reasonCode: 'AIBRUSH_HLS_INPUT_REQUIRED',
    });
    expect(decideAibrushSupport(request('hls', 'cenc-ctr'))).toMatchObject({
      supported: false,
      reasonCode: 'AIBRUSH_CENC_INPUT_REQUIRED',
    });
  });

  test('lets an undeclared ClearKey negative reach runtime while retaining declared capability routing', () => {
    expect(decideAibrushSupport(request('mp4', 'clearkey'))).toMatchObject({ supported: true });
    expect(decideAibrushSupport(request('mp4', 'clearkey', 'clearkey'))).toMatchObject({
      supported: false,
      reasonCode: 'AIBRUSH_DECRYPT_SCHEME_UNSUPPORTED',
    });
  });

  test('runtime ClearKey remains an immediate typed graceful rejection', async () => {
    const bytes = new Uint8Array();
    const input: MediaInput = {
      id: 'clearkey.mp4',
      url: 'blob:http://127.0.0.1/clearkey.mp4',
      mime: 'video/mp4',
      mutated: false,
      sizeBytes: 0,
      blob: () => Promise.resolve(new Blob([bytes])),
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    };
    const error = await captureRejected(() =>
      new AibrushMediaEngine().decrypt(input, { keyHex: '' }, { scheme: 'clearkey' }));
    expect(isMalformedInputError(error)).toBe(true);
    if (!isMalformedInputError(error)) throw new Error('expected typed malformed-input rejection');
    expect(error.reason).toContain('unsupported scheme clearkey');
  });
});

describe('aibrush-media HLS decrypt pre-publication validation', () => {
  test('accepts the requested method and METHOD=NONE transition', () => {
    const withClearTail = playlist('AES-128').replace(
      '#EXT-X-ENDLIST',
      '#EXT-X-KEY:METHOD=NONE\n#EXTINF:1,\nclear.ts\n#EXT-X-ENDLIST',
    );
    expect(() => assertAibrushHlsDecryptRequest(withClearTail, 'hls-aes128', EXPLICIT_IV)).not.toThrow();
  });

  test('rejects AES-128/SAMPLE-AES cross-routing as a typed graceful failure', () => {
    for (const [text, requested] of [
      [playlist('AES-128'), 'hls-sample-aes'],
      [playlist('SAMPLE-AES'), 'hls-aes128'],
    ] as const) {
      const error = captureThrown(() => assertAibrushHlsDecryptRequest(text, requested, EXPLICIT_IV));
      expect(isMalformedInputError(error)).toBe(true);
      if (!isMalformedInputError(error)) throw new Error('expected typed malformed-input rejection');
      expect(error.reason).toContain('HLS_METHOD_MISMATCH');
    }
  });

  test('rejects a wrong or malformed explicit IV before an output can be published', () => {
    for (const ivHex of [WRONG_IV, 'abcd']) {
      let publicationReached = false;
      const error = captureThrown(() => {
        assertAibrushHlsDecryptRequest(playlist('AES-128'), 'hls-aes128', ivHex);
        publicationReached = true;
      });
      expect(publicationReached).toBe(false);
      expect(isMalformedInputError(error)).toBe(true);
      if (!isMalformedInputError(error)) throw new Error('expected typed malformed-input rejection');
      expect(error.reason).toMatch(/IV/);
    }
  });
});

function captureThrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected callback to throw');
}

async function captureRejected(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected promise to reject');
}
