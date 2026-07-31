import type { MediaInput, MediaInputContentAttestation } from './engine.ts';
import { CorpusDeliveryIntegrityError } from './selection-integrity.ts';
import { sha256Hex as sha256HexSync } from './seeded-rng.ts';

export interface AuthenticatedMediaInputRangeTrace {
  bytesRead: number;
  rangeRequests: number;
  blockRequests: number;
}

export interface AuthenticatedMediaInputReader {
  readonly size: number;
  readonly trace: AuthenticatedMediaInputRangeTrace;
  range(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array>;
}

function deliveryError(
  attestation: MediaInputContentAttestation,
  reasonCode: string,
  detail: string,
): CorpusDeliveryIntegrityError {
  return new CorpusDeliveryIntegrityError(reasonCode, attestation.logicalPath, detail);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (
    typeof crypto !== 'undefined' &&
    crypto.subtle !== undefined &&
    bytes.buffer instanceof ArrayBuffer
  ) {
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      ),
    );
    let result = '';
    for (const byte of digest) result += byte.toString(16).padStart(2, '0');
    return result;
  }
  return sha256HexSync(bytes);
}

/**
 * Harness-owned authenticated reader for post-operation neutral oracles. The engine never receives
 * this object; it independently re-fetches fixed blocks and proves them against admission evidence.
 */
export function createAuthenticatedMediaInputReader(
  input: MediaInput,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): AuthenticatedMediaInputReader {
  const attestation = input.contentAttestation;
  if (attestation === undefined) {
    throw new Error('authenticated media reader requires MediaInput.contentAttestation');
  }
  const expectedBlocks = Math.ceil(attestation.sizeBytes / attestation.chunkSizeBytes);
  if (
    attestation.schema !== 'media-test/url-content-attestation@1' ||
    !Number.isSafeInteger(attestation.sizeBytes) ||
    attestation.sizeBytes < 0 ||
    !Number.isSafeInteger(attestation.chunkSizeBytes) ||
    attestation.chunkSizeBytes <= 0 ||
    attestation.chunkSha256.length !== expectedBlocks ||
    (input.sizeBytes !== undefined && input.sizeBytes !== attestation.sizeBytes)
  ) {
    throw deliveryError(
      attestation,
      'CORPUS_AUTHENTICATED_RANGE_ATTESTATION_INVALID',
      `'${attestation.logicalPath}' has an invalid authenticated range contract`,
    );
  }

  const trace: AuthenticatedMediaInputRangeTrace = {
    bytesRead: 0,
    rangeRequests: 0,
    blockRequests: 0,
  };
  const cache = new Map<number, Uint8Array>();
  const inFlight = new Map<number, Promise<Uint8Array>>();

  const loadBlock = (blockIndex: number, signal?: AbortSignal): Promise<Uint8Array> => {
    signal?.throwIfAborted();
    const cached = cache.get(blockIndex);
    if (cached !== undefined) {
      cache.delete(blockIndex);
      cache.set(blockIndex, cached);
      return Promise.resolve(cached);
    }
    const pending = inFlight.get(blockIndex);
    if (pending !== undefined) return pending;
    const request = (async (): Promise<Uint8Array> => {
      const blockStart = blockIndex * attestation.chunkSizeBytes;
      const blockEndExclusive = Math.min(
        attestation.sizeBytes,
        blockStart + attestation.chunkSizeBytes,
      );
      const blockEnd = blockEndExclusive - 1;
      const response = await fetchImpl(input.url, {
        cache: 'no-store',
        headers: { Range: `bytes=${blockStart}-${blockEnd}` },
        ...(signal === undefined ? {} : { signal }),
      });
      if (response.status !== 206) {
        response.body?.cancel().catch(() => undefined);
        throw deliveryError(
          attestation,
          'CORPUS_AUTHENTICATED_RANGE_UNAVAILABLE',
          `'${attestation.logicalPath}' returned HTTP ${response.status} for authenticated range ${blockStart}-${blockEnd}`,
        );
      }
      const contentRange = response.headers.get('Content-Range');
      const expectedContentRange = `bytes ${blockStart}-${blockEnd}/${attestation.sizeBytes}`;
      if (contentRange !== expectedContentRange) {
        response.body?.cancel().catch(() => undefined);
        throw deliveryError(
          attestation,
          'CORPUS_AUTHENTICATED_RANGE_SHAPE_MISMATCH',
          `'${attestation.logicalPath}' returned Content-Range '${contentRange ?? 'missing'}', expected '${expectedContentRange}'`,
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      trace.blockRequests += 1;
      trace.bytesRead += bytes.byteLength;
      const expectedSize = blockEndExclusive - blockStart;
      if (bytes.byteLength !== expectedSize) {
        throw deliveryError(
          attestation,
          'CORPUS_AUTHENTICATED_RANGE_SIZE_MISMATCH',
          `'${attestation.logicalPath}' block ${blockIndex} has ${bytes.byteLength} bytes, expected ${expectedSize}`,
        );
      }
      const expectedSha256 = attestation.chunkSha256[blockIndex];
      if (expectedSha256 === undefined || (await sha256Hex(bytes)) !== expectedSha256) {
        throw deliveryError(
          attestation,
          'CORPUS_AUTHENTICATED_RANGE_DIGEST_MISMATCH',
          `'${attestation.logicalPath}' block ${blockIndex} no longer matches the admitted content snapshot`,
        );
      }
      cache.set(blockIndex, bytes);
      while (cache.size > 16) {
        const oldest = cache.keys().next().value as number | undefined;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
      return bytes;
    })().finally(() => {
      inFlight.delete(blockIndex);
    });
    inFlight.set(blockIndex, request);
    return request;
  };

  return {
    size: attestation.sizeBytes,
    trace,
    async range(start, end, signal) {
      signal?.throwIfAborted();
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        throw deliveryError(
          attestation,
          'CORPUS_AUTHENTICATED_RANGE_REQUEST_INVALID',
          `'${attestation.logicalPath}' received a non-integer range [${start}, ${end})`,
        );
      }
      const boundedStart = Math.max(0, Math.min(start, attestation.sizeBytes));
      const boundedEnd = Math.max(boundedStart, Math.min(end, attestation.sizeBytes));
      const output = new Uint8Array(boundedEnd - boundedStart);
      if (output.byteLength === 0) return output;
      trace.rangeRequests += 1;
      const firstBlock = Math.floor(boundedStart / attestation.chunkSizeBytes);
      const lastBlock = Math.floor((boundedEnd - 1) / attestation.chunkSizeBytes);
      for (let batchStart = firstBlock; batchStart <= lastBlock; batchStart += 4) {
        const batchEnd = Math.min(lastBlock + 1, batchStart + 4);
        const indices = Array.from(
          { length: batchEnd - batchStart },
          (_, index) => batchStart + index,
        );
        const blocks = await Promise.all(indices.map((index) => loadBlock(index, signal)));
        for (let index = 0; index < blocks.length; index++) {
          const blockIndex = indices[index]!;
          const bytes = blocks[index]!;
          const blockStart = blockIndex * attestation.chunkSizeBytes;
          const copyStart = Math.max(boundedStart, blockStart);
          const copyEnd = Math.min(boundedEnd, blockStart + bytes.byteLength);
          output.set(
            bytes.subarray(copyStart - blockStart, copyEnd - blockStart),
            copyStart - boundedStart,
          );
        }
      }
      signal?.throwIfAborted();
      return output;
    },
  };
}
