/** Browser-safe transport for canonical compact packet goldens stored as deterministic gzip+base64. */

import { canonicalJsonIdentityStreaming } from './canonical-json.ts';
import { Sha256 } from './seeded-rng.ts';

export const COMPRESSED_GOLDEN_ARTIFACT_SCHEMA = 'media-test/golden-packets-columnar-gzip@1' as const;
export const COMPRESSED_GOLDEN_ARTIFACT_VERSION = 'gzip-base64@1' as const;
export const MAX_COMPRESSED_GOLDEN_WRAPPER_BYTES = 100_000_000;
export const MAX_COMPRESSED_GOLDEN_DECODED_BYTES = 512 * 1024 * 1024;

const SHA256 = /^[0-9a-f]{64}$/;
const WRAPPER_KEYS = ['decodedSha256', 'decodedSizeBytes', 'payload', 'schema', 'schemaVersion'];
const BASE64_CHARS_PER_CHUNK = 64 * 1024;
const DETERMINISTIC_GZIP_HEADER = new Uint8Array([
  0x1f, 0x8b, 0x08, 0x00, // magic, method, flags
  0x00, 0x00, 0x00, 0x00, // mtime = 0
  0x02, 0xff, // level-9 extra flags, normalized OS
]);

export interface CompressedGoldenArtifact {
  decodedSha256: string;
  decodedSizeBytes: number;
  payload: string;
  schema: typeof COMPRESSED_GOLDEN_ARTIFACT_SCHEMA;
  schemaVersion: typeof COMPRESSED_GOLDEN_ARTIFACT_VERSION;
}

export interface CompressedGoldenArtifactIdentity {
  sha256: string;
  sizeBytes: number;
}

export interface CompressedGoldenArtifactValidation {
  wrapper: CompressedGoldenArtifact;
  wrapperIdentity: CompressedGoldenArtifactIdentity;
  gzipSizeBytes: number;
}

export interface DecodeCompressedGoldenArtifactOptions {
  maxDecodedSizeBytes?: number;
  maxWrapperSizeBytes?: number;
}

export interface DecodedCompressedGoldenArtifact<T = unknown> {
  value: T;
  wrapperIdentity: CompressedGoldenArtifactIdentity;
  decodedIdentity: CompressedGoldenArtifactIdentity;
  gzipSizeBytes: number;
}

/** Strictly validate the parsed wrapper without allocating its decoded gzip bytes. */
export function validateCompressedGoldenArtifact(
  value: unknown,
  options: DecodeCompressedGoldenArtifactOptions = {},
): CompressedGoldenArtifactValidation {
  const maxDecodedSizeBytes = positiveSafeLimit(
    options.maxDecodedSizeBytes ?? MAX_COMPRESSED_GOLDEN_DECODED_BYTES,
    'maxDecodedSizeBytes',
  );
  const maxWrapperSizeBytes = positiveSafeLimit(
    options.maxWrapperSizeBytes ?? MAX_COMPRESSED_GOLDEN_WRAPPER_BYTES,
    'maxWrapperSizeBytes',
  );
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('compressed golden wrapper must be a plain JSON object');
  }
  const actualKeys = Object.keys(value).sort(compareCodepoint);
  if (actualKeys.length !== WRAPPER_KEYS.length ||
      actualKeys.some((key, index) => key !== WRAPPER_KEYS[index])) {
    throw new TypeError('compressed golden wrapper has missing or unknown keys');
  }
  if (value.schema !== COMPRESSED_GOLDEN_ARTIFACT_SCHEMA ||
      value.schemaVersion !== COMPRESSED_GOLDEN_ARTIFACT_VERSION) {
    throw new TypeError('compressed golden wrapper schema/version is unsupported');
  }
  if (!SHA256.test(value.decodedSha256 as string ?? '')) {
    throw new TypeError('compressed golden decodedSha256 is invalid');
  }
  if (!Number.isSafeInteger(value.decodedSizeBytes) || (value.decodedSizeBytes as number) < 0) {
    throw new TypeError('compressed golden decodedSizeBytes is invalid');
  }
  if ((value.decodedSizeBytes as number) > maxDecodedSizeBytes) {
    throw new TypeError('compressed golden decoded size exceeds the configured ceiling');
  }
  if (typeof value.payload !== 'string') throw new TypeError('compressed golden payload must be base64 text');
  const gzipSizeBytes = validateCanonicalBase64(value.payload);
  if (gzipSizeBytes < 18) throw new TypeError('compressed golden gzip payload is truncated');
  assertDeterministicGzipHeader(decodeBase64Range(value.payload, 0, Math.min(16, value.payload.length)));

  const wrapperIdentity = canonicalJsonIdentityStreaming(value);
  if (wrapperIdentity.sizeBytes >= maxWrapperSizeBytes) {
    throw new TypeError('compressed golden wrapper exceeds the configured physical-size ceiling');
  }
  return {
    wrapper: value as unknown as CompressedGoldenArtifact,
    wrapperIdentity,
    gzipSizeBytes,
  };
}

/**
 * Decode, authenticate, parse, and canonicality-check one compressed packet-golden payload.
 * Base64 and gzip input are streamed in bounded chunks; only the required decoded JSON value is
 * retained. The declared decoded size is enforced while inflating, before a zip bomb can expand.
 */
export async function decodeCompressedGoldenArtifact<T = unknown>(
  value: unknown,
  options: DecodeCompressedGoldenArtifactOptions = {},
): Promise<DecodedCompressedGoldenArtifact<T>> {
  const validated = validateCompressedGoldenArtifact(value, options);
  const { wrapper } = validated;
  if (typeof globalThis.DecompressionStream !== 'function') {
    throw new TypeError('gzip DecompressionStream is unavailable in this browser/runtime');
  }

  const compressed = canonicalBase64Stream(wrapper.payload);
  let decompressed: ReadableStream<Uint8Array>;
  try {
    // DOM and WebWorker declarations disagree on whether the compression writable accepts the
    // broader BufferSource union. Uint8Array is valid in both realms; normalize that type boundary.
    const gzip = new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>;
    decompressed = compressed.pipeThrough(gzip);
  } catch (error) {
    throw new TypeError(`compressed golden gzip decoder could not start (${errorMessage(error)})`);
  }

  const hash = new Sha256();
  const textDecoder = new TextDecoder('utf-8', { fatal: true });
  // Incremental concatenation lets engines retain a string rope until JSON.parse needs the text.
  // No decompressed byte collection or second full-size byte copy crosses this loop boundary.
  let decodedText = '';
  const reader = decompressed.getReader();
  let decodedSizeBytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      decodedSizeBytes += chunk.byteLength;
      if (decodedSizeBytes > wrapper.decodedSizeBytes) {
        const error = new TypeError('compressed golden expanded beyond its declared decoded size');
        await reader.cancel(error).catch(() => undefined);
        throw error;
      }
      hash.update(chunk);
      try {
        const text = textDecoder.decode(chunk, { stream: true });
        if (text) decodedText += text;
      } catch (error) {
        const failure = new DecodedUtf8Error(errorMessage(error));
        await reader.cancel(failure).catch(() => undefined);
        throw failure;
      }
    }
  } catch (error) {
    if (error instanceof TypeError && /expanded beyond/.test(error.message)) throw error;
    if (error instanceof DecodedUtf8Error) {
      throw new TypeError(`compressed golden decoded artifact is not valid UTF-8 (${error.message})`);
    }
    throw new TypeError(`compressed golden gzip payload is corrupt or truncated (${errorMessage(error)})`);
  } finally {
    reader.releaseLock();
  }

  const decodedSha256 = hash.hex();
  if (decodedSizeBytes !== wrapper.decodedSizeBytes) {
    throw new TypeError('compressed golden decoded size does not match its declaration');
  }
  if (decodedSha256 !== wrapper.decodedSha256) {
    throw new TypeError('compressed golden decoded digest does not match its declaration');
  }

  try {
    const tail = textDecoder.decode();
    if (tail) decodedText += tail;
  } catch (error) {
    throw new TypeError(`compressed golden decoded artifact is not valid UTF-8 (${errorMessage(error)})`);
  }
  let decodedValue: unknown;
  try {
    decodedValue = JSON.parse(decodedText) as unknown;
  } catch (error) {
    throw new TypeError(`compressed golden decoded artifact is not valid JSON (${errorMessage(error)})`);
  }
  const canonicalIdentity = canonicalJsonIdentityStreaming(decodedValue);
  if (canonicalIdentity.sha256 !== decodedSha256 || canonicalIdentity.sizeBytes !== decodedSizeBytes) {
    throw new TypeError('compressed golden decoded artifact is not canonical JSON');
  }
  return {
    value: decodedValue as T,
    wrapperIdentity: validated.wrapperIdentity,
    decodedIdentity: { sha256: decodedSha256, sizeBytes: decodedSizeBytes },
    gzipSizeBytes: validated.gzipSizeBytes,
  };
}

function canonicalBase64Stream(value: string): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === value.length) {
        controller.close();
        return;
      }
      const end = Math.min(value.length, offset + BASE64_CHARS_PER_CHUNK);
      controller.enqueue(decodeBase64Range(value, offset, end));
      offset = end;
    },
  });
}

/** Return the exact decoded byte length after enforcing canonical RFC 4648 base64. */
function validateCanonicalBase64(value: string): number {
  if (value.length === 0 || value.length % 4 !== 0) {
    throw new TypeError('compressed golden payload is not canonical base64');
  }
  let padding = 0;
  if (value.endsWith('==')) padding = 2;
  else if (value.endsWith('=')) padding = 1;
  const dataEnd = value.length - padding;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (index >= dataEnd) {
      if (code !== 0x3d) throw new TypeError('compressed golden payload has invalid base64 padding');
    } else if (base64Value(code) < 0) {
      throw new TypeError('compressed golden payload contains a non-base64 character');
    }
  }
  if (padding === 2 && (base64Value(value.charCodeAt(value.length - 3)) & 0x0f) !== 0) {
    throw new TypeError('compressed golden payload has non-canonical base64 tail bits');
  }
  if (padding === 1 && (base64Value(value.charCodeAt(value.length - 2)) & 0x03) !== 0) {
    throw new TypeError('compressed golden payload has non-canonical base64 tail bits');
  }
  return (value.length / 4) * 3 - padding;
}

/** Decode a quartet-aligned range. Validation is performed separately before this is called. */
function decodeBase64Range(value: string, start: number, end: number): Uint8Array {
  if (start % 4 !== 0 || end % 4 !== 0) throw new TypeError('base64 decoder range is not quartet-aligned');
  const final = end === value.length;
  const padding = final ? (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) : 0;
  const out = new Uint8Array(((end - start) / 4) * 3 - padding);
  let output = 0;
  for (let index = start; index < end; index += 4) {
    const a = base64Value(value.charCodeAt(index));
    const b = base64Value(value.charCodeAt(index + 1));
    const cCode = value.charCodeAt(index + 2);
    const dCode = value.charCodeAt(index + 3);
    const c = cCode === 0x3d ? 0 : base64Value(cCode);
    const d = dCode === 0x3d ? 0 : base64Value(dCode);
    out[output++] = (a << 2) | (b >> 4);
    if (output < out.length) out[output++] = ((b & 0x0f) << 4) | (c >> 2);
    if (output < out.length) out[output++] = ((c & 0x03) << 6) | d;
  }
  return out;
}

function assertDeterministicGzipHeader(bytes: Uint8Array): void {
  if (bytes.byteLength < DETERMINISTIC_GZIP_HEADER.byteLength ||
      DETERMINISTIC_GZIP_HEADER.some((byte, index) => bytes[index] !== byte)) {
    throw new TypeError('compressed golden gzip header is not the deterministic level-9 contract');
  }
}

function base64Value(code: number): number {
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61 + 26;
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 52;
  if (code === 0x2b) return 62;
  if (code === 0x2f) return 63;
  return -1;
}

function positiveSafeLimit(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive safe integer`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compareCodepoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class DecodedUtf8Error extends Error {}
