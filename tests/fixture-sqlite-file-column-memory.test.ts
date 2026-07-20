import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SMALL_ROWS = 10_000;
const LARGE_ROWS = 100_001;
const MAX_ENCODER_RSS_GROWTH_BYTES = 128 * 1024 * 1024;
const MAX_POST_GC_RETAINED_GROWTH_BYTES = 16 * 1024 * 1024;
const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('isolated SQLite file-column encoder memory proof', () => {
  test('100,001 generator rows remain bounded through descriptor and compact validation', () => {
    const small = runChild('encode', SMALL_ROWS);
    const large = runChild('e2e', LARGE_ROWS);

    expect(small).toMatchObject({
      mode: 'encode',
      rowCount: SMALL_ROWS,
      reads: { packets: 1, decodedUnits: 1 },
      privateDirectoryMode: 0o700,
      privateDirectoriesAfterCleanup: 0,
    });
    expect(large).toMatchObject({
      mode: 'e2e',
      rowCount: LARGE_ROWS,
      reads: { packets: 1, decodedUnits: 1 },
      inspection: {
        packetRowCount: LARGE_ROWS,
        semanticAccessUnitCount: LARGE_ROWS,
        decodedUnitCount: LARGE_ROWS,
      },
      validation: {
        packetRowCount: LARGE_ROWS,
        semanticAccessUnitCount: LARGE_ROWS,
        decodedUnitCount: LARGE_ROWS,
      },
      privateDirectoryMode: 0o700,
      privateDirectoriesAfterCleanup: 0,
    });
    expect(large.marker.payloadSha256).toBe(large.payloadIdentity.sha256);
    expect(large.marker.payloadSizeBytes).toBe(large.payloadIdentity.sizeBytes);
    expect(large.artifactSizeBytes).toBe(large.marker.artifactSizeBytes);

    const encoderRssGrowth = Math.max(0, large.encoderMaxRssBytes - small.encoderMaxRssBytes);
    // Fresh children share the same Bun/import baseline. The SQLite cache is fixed at 2 MiB and all
    // source/column traversals are generator-driven, so row-count growth should not retain a timeline.
    // 128 MiB leaves substantial allocator/OS-page-cache headroom while still ruling out retaining
    // the three rich multi-field packet, decoded, and semantic timeline graphs for 90,001 extra rows.
    expect(encoderRssGrowth).toBeLessThanOrEqual(MAX_ENCODER_RSS_GROWTH_BYTES);
    const retainedHeapGrowth = Math.max(
      0,
      large.postGcEncoderMemoryUsage.heapUsed - small.postGcEncoderMemoryUsage.heapUsed,
    );
    const retainedExternalGrowth = Math.max(
      0,
      large.postGcEncoderMemoryUsage.external - small.postGcEncoderMemoryUsage.external,
    );
    expect(retainedHeapGrowth).toBeLessThanOrEqual(MAX_POST_GC_RETAINED_GROWTH_BYTES);
    expect(retainedExternalGrowth).toBeLessThanOrEqual(MAX_POST_GC_RETAINED_GROWTH_BYTES);
    expect(large.postGcEncoderMemoryUsage.arrayBuffers).toBeGreaterThanOrEqual(0);
  }, 300_000);
});

function runChild(mode: 'encode' | 'e2e', rowCount: number): any {
  const root = mkdtempSync(join(tmpdir(), `media-test-sqlite-memory-${mode}-`));
  roots.push(root);
  const result = spawnSync(
    process.execPath,
    ['--smol', 'tests/fixture-sqlite-encoder-memory-child.mjs', mode, String(rowCount), root],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 280_000,
      env: { ...process.env, LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const output = result.stdout.trim();
  expect(output).not.toBe('');
  const report = JSON.parse(output);
  expect(readdirSync(root)).toEqual([]);
  return report;
}
