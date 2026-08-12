import { Sha256, type Sha256Snapshot } from './seeded-rng.ts';
import type { ContentIdentity } from './selection-integrity.ts';

interface VerificationRequest {
  readonly kind: 'verify-stream-content-batch';
  readonly url: string;
  readonly identity: ContentIdentity;
  readonly chunkSizeBytes: number;
  readonly deliveryRangeBytes: number;
  readonly start: number;
  readonly endExclusive: number;
  readonly overallSnapshot?: Sha256Snapshot;
  readonly chunkSnapshot?: Sha256Snapshot;
  readonly chunkBytes: number;
}

interface VerificationProgress {
  readonly kind: 'verification-progress';
  readonly endExclusive: number;
  readonly overallSnapshot: Sha256Snapshot;
  readonly chunkSnapshot: Sha256Snapshot;
  readonly chunkBytes: number;
  readonly chunkSha256: readonly string[];
}

interface VerificationComplete {
  readonly kind: 'verification-complete';
  readonly endExclusive: number;
  readonly actualSha256: string;
  readonly chunkSha256: readonly string[];
}

interface VerificationFailure {
  readonly kind: 'verification-failed';
  readonly message: string;
}

type VerificationResponse = VerificationProgress | VerificationComplete | VerificationFailure;

async function verify(request: VerificationRequest): Promise<VerificationProgress | VerificationComplete> {
  if (
    !Number.isSafeInteger(request.start) ||
    !Number.isSafeInteger(request.endExclusive) ||
    request.start < 0 ||
    request.endExclusive <= request.start ||
    request.endExclusive > request.identity.sizeBytes ||
    !Number.isSafeInteger(request.chunkBytes) ||
    request.chunkBytes < 0 ||
    request.chunkBytes >= request.chunkSizeBytes
  ) {
    throw new Error('authenticated admission worker received an invalid batch contract');
  }
  const overall = request.overallSnapshot === undefined
    ? new Sha256()
    : Sha256.fromSnapshot(request.overallSnapshot);
  let chunk = request.chunkSnapshot === undefined
    ? new Sha256()
    : Sha256.fromSnapshot(request.chunkSnapshot);
  let chunkBytes = request.chunkBytes;
  if (overall.snapshot().totalBytes !== request.start || chunk.snapshot().totalBytes !== chunkBytes) {
    throw new Error('authenticated admission worker received inconsistent hash state');
  }
  let actualSizeBytes = request.start;
  const chunkSha256: string[] = [];

  while (actualSizeBytes < request.endExclusive) {
    const start = actualSizeBytes;
    const endExclusive = Math.min(
      request.endExclusive,
      start + request.deliveryRangeBytes,
    );
    const endInclusive = endExclusive - 1;
    const response = await fetch(request.url, {
      cache: 'no-store',
      headers: { Range: `bytes=${start}-${endInclusive}` },
    });
    const expectedContentRange = `bytes ${start}-${endInclusive}/${request.identity.sizeBytes}`;
    if (response.status !== 206) {
      response.body?.cancel().catch(() => undefined);
      throw new Error(
        `authenticated admission range ${start}-${endInclusive} returned HTTP ${response.status}`,
      );
    }
    const contentRange = response.headers.get('Content-Range');
    if (contentRange !== expectedContentRange) {
      response.body?.cancel().catch(() => undefined);
      throw new Error(
        `authenticated admission range returned Content-Range '${contentRange ?? 'missing'}', expected '${expectedContentRange}'`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== endExclusive - start) {
      throw new Error(
        `authenticated admission range ${start}-${endInclusive} returned ${bytes.byteLength} bytes`,
      );
    }
    overall.update(bytes);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const take = Math.min(
        request.chunkSizeBytes - chunkBytes,
        bytes.byteLength - offset,
      );
      chunk.update(bytes.subarray(offset, offset + take));
      chunkBytes += take;
      offset += take;
      if (chunkBytes === request.chunkSizeBytes) {
        chunkSha256.push(chunk.hex());
        chunk = new Sha256();
        chunkBytes = 0;
      }
    }
    actualSizeBytes = endExclusive;
  }
  if (actualSizeBytes !== request.endExclusive) {
    throw new Error(`authenticated admission worker stopped at ${actualSizeBytes}, expected ${request.endExclusive}`);
  }
  if (actualSizeBytes === request.identity.sizeBytes) {
    if (chunkBytes > 0) chunkSha256.push(chunk.hex());
    const actualSha256 = overall.hex();
    if (actualSha256 !== request.identity.sha256) {
      throw new Error(
        `digest mismatch for '${request.identity.logicalPath}': expected ${request.identity.sha256}, got ${actualSha256}`,
      );
    }
    return {
      kind: 'verification-complete',
      endExclusive: actualSizeBytes,
      actualSha256,
      chunkSha256,
    };
  }
  return {
    kind: 'verification-progress',
    endExclusive: actualSizeBytes,
    overallSnapshot: overall.snapshot(),
    chunkSnapshot: chunk.snapshot(),
    chunkBytes,
    chunkSha256,
  };
}

self.addEventListener('message', (event: MessageEvent<VerificationRequest>) => {
  const request = event.data;
  if (request?.kind !== 'verify-stream-content-batch') return;
  void verify(request).then(
    (response) => {
      self.postMessage(response satisfies VerificationResponse);
      self.close();
    },
    (error: unknown) => {
      const response: VerificationResponse = {
        kind: 'verification-failed',
        message: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
      self.close();
    },
  );
});
