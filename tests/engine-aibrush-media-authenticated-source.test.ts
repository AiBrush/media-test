import { describe, expect, test } from 'bun:test';

import type { MediaInput, MediaInputContentAttestation } from '../src/core/engine.ts';
import {
  isCorpusDeliveryIntegrityError,
  sha256Hex,
} from '../src/core/media-selection.ts';
import {
  createAibrushAuthenticatedSource,
  type AibrushAuthenticatedRangeTrace,
} from '../src/engines/aibrush-media/adapter.ts';

function attestationFor(
  bytes: Uint8Array,
  chunkSizeBytes: number,
): MediaInputContentAttestation {
  return {
    schema: 'media-test/url-content-attestation@1',
    logicalPath: 'large-input.mp4',
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
    chunkSizeBytes,
    chunkSha256: Array.from(
      { length: Math.ceil(bytes.byteLength / chunkSizeBytes) },
      (_, index) => sha256Hex(bytes.subarray(index * chunkSizeBytes, (index + 1) * chunkSizeBytes)),
    ),
  };
}

function inputFor(
  bytes: Uint8Array,
  attestation: MediaInputContentAttestation,
  wholeFileCalls: { count: number },
): MediaInput {
  return {
    id: 'large-input.mp4',
    url: 'https://fixtures.test/large-input.mp4',
    mime: 'video/mp4',
    sizeBytes: bytes.byteLength,
    contentAttestation: attestation,
    async arrayBuffer() {
      wholeFileCalls.count += 1;
      throw new Error('whole-file byte access is forbidden');
    },
    async blob() {
      wholeFileCalls.count += 1;
      throw new Error('whole-file blob access is forbidden');
    },
  };
}

function rangeServer(
  body: () => Uint8Array,
  physicalRanges: Array<{ start: number; end: number }>,
): typeof fetch {
  return (async (_resource: RequestInfo | URL, init?: RequestInit) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range') ?? '');
    if (!match) return new Response(null, { status: 400 });
    const start = Number(match[1]);
    const end = Number(match[2]);
    physicalRanges.push({ start, end });
    const bytes = body();
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}` },
    });
  }) as typeof fetch;
}

describe('AIBrush authenticated range Source', () => {
  test('verifies fixed blocks before returning a cross-block range without whole-file access', async () => {
    const bytes = new TextEncoder().encode('authenticated-aibrush-range-body');
    const chunkSizeBytes = 5;
    const attestation = attestationFor(bytes, chunkSizeBytes);
    const wholeFileCalls = { count: 0 };
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const trace: AibrushAuthenticatedRangeTrace = {
      bytesRead: 0,
      rangeRequests: 0,
      blockRequests: 0,
    };
    const source = createAibrushAuthenticatedSource(
      inputFor(bytes, attestation, wholeFileCalls),
      rangeServer(() => bytes, physicalRanges),
      trace,
    );

    const result = await source.range(3, 19);
    expect(result).toEqual(bytes.slice(3, 19));
    expect(trace).toEqual({
      bytesRead: 20,
      rangeRequests: 1,
      blockRequests: 4,
    });
    expect(physicalRanges).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
      { start: 10, end: 14 },
      { start: 15, end: 19 },
    ]);
    expect(physicalRanges.every(({ start, end }) => end - start + 1 <= chunkSizeBytes)).toBe(true);
    expect(wholeFileCalls.count).toBe(0);
    source.releaseRange?.(result);
    expect(result.byteLength).toBe(0);
    source.releaseRange?.(result);
  });

  test('quarantines post-admission digest drift', async () => {
    const admitted = new TextEncoder().encode('authenticated-aibrush-range-body');
    const served = admitted.slice();
    served[7] ^= 0xff;
    const attestation = attestationFor(admitted, 5);
    const source = createAibrushAuthenticatedSource(
      inputFor(admitted, attestation, { count: 0 }),
      rangeServer(() => served, []),
    );

    let thrown: unknown;
    try {
      await source.range(5, 10);
    } catch (error) {
      thrown = error;
    }
    expect(isCorpusDeliveryIntegrityError(thrown)).toBe(true);
    if (isCorpusDeliveryIntegrityError(thrown)) {
      expect(thrown.reasonCode).toBe('CORPUS_AUTHENTICATED_RANGE_DIGEST_MISMATCH');
    }
  });

  test('requires exact partial-content status and Content-Range shape', async () => {
    const bytes = new TextEncoder().encode('range-shape');
    const attestation = attestationFor(bytes, bytes.byteLength);
    const input = inputFor(bytes, attestation, { count: 0 });

    const wrongStatus = createAibrushAuthenticatedSource(
      input,
      (async () => new Response(bytes, { status: 200 })) as typeof fetch,
    );
    await expect(wrongStatus.range(0, bytes.byteLength)).rejects.toMatchObject({
      reasonCode: 'CORPUS_AUTHENTICATED_RANGE_UNAVAILABLE',
    });

    const wrongShape = createAibrushAuthenticatedSource(
      input,
      (async () => new Response(bytes, {
        status: 206,
        headers: { 'Content-Range': `bytes 1-${bytes.byteLength}/${bytes.byteLength}` },
      })) as typeof fetch,
    );
    await expect(wrongShape.range(0, bytes.byteLength)).rejects.toMatchObject({
      reasonCode: 'CORPUS_AUTHENTICATED_RANGE_SHAPE_MISMATCH',
    });
  });
});
