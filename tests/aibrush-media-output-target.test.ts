import { describe, expect, it } from 'bun:test';
import { AibrushSinkTraceRecorder } from '../src/engines/aibrush-media/output-target.ts';

function hashChunks(chunks: readonly Uint8Array[]): string {
  let tick = 0;
  const recorder = new AibrushSinkTraceRecorder({
    operationStartMs: 0,
    now: () => ++tick,
  });
  let position = 0;
  for (const chunk of chunks) {
    recorder.write(chunk, position);
    position += chunk.byteLength;
  }
  const trace = recorder.complete('buffer', position);
  if (trace === undefined) throw new Error('expected an enabled sink trace');
  return trace.rollingHash;
}

describe('AibrushSinkTraceRecorder rolling hash', () => {
  it('matches the canonical FNV-1a 64-bit vectors', () => {
    const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
    expect(hashChunks([])).toBe('cbf29ce484222325');
    expect(hashChunks([encode('a')])).toBe('af63dc4c8601ec8c');
    expect(hashChunks([encode('foobar')])).toBe('85944171f73967e8');
  });

  it('is invariant to framework output chunk boundaries', () => {
    const bytes = new TextEncoder().encode('the same output split at arbitrary boundaries');
    expect(hashChunks([bytes])).toBe(
      hashChunks([bytes.subarray(0, 3), bytes.subarray(3, 17), bytes.subarray(17)]),
    );
  });
});
