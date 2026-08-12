import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { CONCRETE_OPERATION_PROTOCOL, type ConcreteOperationRequest, type LifecycleContext } from '../src/core/engine.ts';
import { AibrushMediaEngine } from '../src/engines/aibrush-media/adapter.ts';
import { AibrushCallbackAccumulator } from '../src/engines/aibrush-media/output-target.ts';
import { parseIsoBmffTopLevelBoxes, verifyAibrushOutputShape } from '../src/engines/aibrush-media/output-shape.ts';
import { takeFirstOwned } from '../src/engines/aibrush-media/ownership.ts';
import {
  AIBRUSH_VENDOR_PROVENANCE,
  AibrushConfigEvidence,
  AibrushProvenanceError,
  type AibrushVendorProvenance,
  bindRuntimeAibrushWasmArtifacts,
  UNLABELED_AIBRUSH_PROVENANCE,
} from '../src/engines/aibrush-media/provenance.ts';

describe('REQ-ENG-34: exact output-shape forwarding evidence', () => {
  test('recognizes front-loaded, tail-moov, and fragment-bearing ISO layouts from bytes', () => {
    const front = join(box('ftyp'), box('moov'), box('mdat'));
    const tail = join(box('ftyp'), box('mdat'), box('moov'));
    const fragmented = join(box('ftyp'), box('moov'), box('moof'), box('mdat'), box('moof'), box('mdat'));
    expect(verifyAibrushOutputShape(front, { container: 'mp4', fragmented: false, fastStart: true })?.kind)
      .toBe('progressive-faststart');
    expect(verifyAibrushOutputShape(tail, { container: 'mov', fragmented: false, fastStart: false })?.kind)
      .toBe('progressive-tail-moov');
    expect(verifyAibrushOutputShape(fragmented, { container: 'mp4', fragmented: true, fastStart: true }))
      .toMatchObject({ kind: 'fragmented', fragmentCount: 2 });
    expect(parseIsoBmffTopLevelBoxes(fragmented).map((entry) => entry.type))
      .toEqual(['ftyp', 'moov', 'moof', 'mdat', 'moof', 'mdat']);
  });

  test('rejects claims contradicted by the produced box structure', () => {
    const progressive = join(box('ftyp'), box('moov'), box('mdat'));
    expect(() => verifyAibrushOutputShape(progressive, { container: 'mp4', fragmented: true, fastStart: true }))
      .toThrow('contains no moof+mdat');
    expect(() => verifyAibrushOutputShape(progressive, { container: 'mp4', fragmented: false, fastStart: false }))
      .toThrow('does not place mdat before moov');
    expect(() => parseIsoBmffTopLevelBoxes(new Uint8Array([0, 0, 0, 20, 109, 100, 97, 116])))
      .toThrow('invalid ISO BMFF box');
  });
});

describe('REQ-ENG-35: cell cancellation and exactly-once ownership', () => {
  test('requires the identical runner AbortSignal across support/init/operation lifecycle', () => {
    const engine = new AibrushMediaEngine();
    const first = new AbortController();
    const second = new AbortController();
    const context = lifecycle(first.signal);
    expect(engine.supports(tuple(), context)).toEqual({ supported: true });
    expect(engine.supports(tuple(), context)).toEqual({ supported: true });
    expect(() => engine.supports(tuple(), lifecycle(second.signal))).toThrow('different cell AbortSignal');
  });

  test('transfers a frame out of cleanup ownership before either side closes', () => {
    const closeCounts = [0, 0, 0];
    const owned = closeCounts.map((_count, index) => ({ close: () => { closeCounts[index]!++; } }));
    const first = takeFirstOwned(owned);
    first?.close();
    for (const resource of owned) resource.close();
    expect(closeCounts).toEqual([1, 1, 1]);
  });

  test('contains no adapter-owned timeout or process-global rejection suppression', async () => {
    const source = await readFile(new URL('../src/engines/aibrush-media/adapter.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/globalThis\.addEventListener\(['"](?:unhandledrejection|error)['"]/);
    expect(source).not.toContain('OP_TIMEOUT_MS');
    expect(source).not.toContain('setTimeout(');
    expect(source).not.toContain('edge_empty_audio_transcode');
    expect(source).not.toContain('fuzz_wav_bitflip_decode');
    expect(source).not.toContain('fuzz_wav_fmt_corrupt_transcode');
    expect(source).not.toContain('fuzz_wav_header_truncated_probe');
    expect(source).not.toContain('meta_idempotent_resample_same_rate');
    expect(source).not.toContain('meta_roundtrip_endianness_s16');
  });
});

describe('REQ-ENG-36: factual route, write, retention, and provenance evidence', () => {
  test('callback count and retention include sparse positioned reconstruction', () => {
    const target = new AibrushCallbackAccumulator();
    target.write(new Uint8Array([1, 2]), 0);
    target.write(new Uint8Array([3]), 2);
    target.write(new Uint8Array([4]), 5);
    const bytes = target.materialize();
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 0, 0, 4]));
    expect(target.evidence).toEqual({ callbackWriteCount: 3, bytesWritten: 6, peakRetainedBytes: 10 });
  });

  test('two public routes produce distinct immutable config evidence and buffer writes stay zero', () => {
    const evidence = new AibrushConfigEvidence(UNLABELED_AIBRUSH_PROVENANCE);
    evidence.record({
      operation: 'probe', route: 'framework.probe', internalDriver: 'framework-router-unexposed',
      readerMode: 'framework-source', writerMode: 'none', targetMode: 'framework-default',
      peakRetainedBytes: 0, callbackWriteCount: 0,
    });
    const probe = evidence.snapshot();
    evidence.record({
      operation: 'remux', route: 'framework.remux', internalDriver: 'framework-router-unexposed',
      readerMode: 'framework-source', writerMode: 'framework-readable-stream+full-materialization',
      targetMode: 'buffer-materialized', peakRetainedBytes: 4_096, callbackWriteCount: 0,
    });
    const remux = evidence.snapshot();
    expect(probe.route).toBe('framework.probe');
    expect(remux.route).toBe('framework.remux');
    expect(remux.targetMode).toBe('buffer-materialized');
    expect(remux.callbackWriteCount).toBe(0);
    expect(remux.peakRetainedBytes).toBe(4_096);
    expect(Object.isFrozen(remux)).toBe(true);
    expect(remux.provenance).toMatchObject({
      dependency: 'file:../media', packageVersion: '0.0.0', sourceRevision: 'UNLABELED_LOCAL_SOURCE',
      dirtyState: 'unknown', sourceMode: 'unlabeled-dev',
    });
  });

  test('same revision and artifacts produce an order-independent identical provenance tuple', () => {
    const first = cleanProvenance({
      bundledWasmArtifacts: [
        { path: 'dist/vorbis_wasm_bg.wasm', sha256: 'b'.repeat(64) },
        { path: 'dist/aac_wasm_bg.wasm', sha256: 'a'.repeat(64) },
      ],
    });
    const second = cleanProvenance({
      bundledWasmArtifacts: [...first.bundledWasmArtifacts].reverse(),
    });
    const left = new AibrushConfigEvidence(first);
    const right = new AibrushConfigEvidence(second);
    left.setLoadedWasmArtifacts([
      { resource: 'https://suite.invalid/assets/vorbis_wasm_bg-Z9.wasm', sha256: 'b'.repeat(64) },
      { resource: 'https://suite.invalid/assets/aac_wasm_bg-A1.wasm', sha256: 'a'.repeat(64) },
    ]);
    right.setLoadedWasmArtifacts([
      { resource: 'aac_wasm_bg-A1.wasm', sha256: 'a'.repeat(64) },
      { resource: 'vorbis_wasm_bg-Z9.wasm', sha256: 'b'.repeat(64) },
    ]);
    expect(left.snapshot().provenance).toEqual(right.snapshot().provenance);
  });

  test('generated report metadata contains stable relative source and bundled-WASM identities only', () => {
    const snapshot = new AibrushConfigEvidence().snapshot();
    const serialized = JSON.stringify(snapshot.provenance);
    expect(snapshot.provenance).toMatchObject({
      formatVersion: 1,
      dependency: 'file:../media',
      packageVersion: AIBRUSH_VENDOR_PROVENANCE.packageVersion,
      sourceRevision: AIBRUSH_VENDOR_PROVENANCE.sourceRevision,
      sourceTreeDigest: AIBRUSH_VENDOR_PROVENANCE.sourceTreeDigest,
    });
    expect(serialized).not.toMatch(/\/Users\/|file:\/\/|[A-Za-z]:\\/);
    expect(serialized).not.toContain('token=');
    expect(AIBRUSH_VENDOR_PROVENANCE.bundledWasmArtifacts.length).toBeGreaterThan(0);
    for (const artifact of AIBRUSH_VENDOR_PROVENANCE.bundledWasmArtifacts) {
      expect(artifact.path).toMatch(/^dist\/[A-Za-z0-9._/-]+\.wasm$/);
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test('fails closed with exact codes for unlabeled, dirty, and incomplete reproducible inputs', () => {
    expect(() => new AibrushConfigEvidence(cleanProvenance()).assertReproducible()).not.toThrow();
    expectProvenanceCode(
      () => new AibrushConfigEvidence(UNLABELED_AIBRUSH_PROVENANCE).assertReproducible(),
      'AIBRUSH_PROVENANCE_UNLABELED',
    );
    expectProvenanceCode(
      () => new AibrushConfigEvidence(cleanProvenance({ dirtyState: 'dirty' })).assertReproducible(),
      'AIBRUSH_PROVENANCE_DIRTY',
    );
    expectProvenanceCode(
      () => new AibrushConfigEvidence(cleanProvenance({ buildFlags: [] })).assertReproducible(),
      'AIBRUSH_PROVENANCE_INCOMPLETE',
    );
    expectProvenanceCode(
      () => new AibrushConfigEvidence(cleanProvenance({ bundledWasmArtifacts: [] })).assertReproducible(),
      'AIBRUSH_WASM_PROVENANCE_INCOMPLETE',
    );
  });

  test('binds an emitted runtime WASM name to its persisted digest and strips URL secrets', () => {
    const persisted = [{ path: 'dist/aac_wasm_bg.wasm', sha256: 'a'.repeat(64) }];
    expect(bindRuntimeAibrushWasmArtifacts(persisted, [{
      resource: 'https://suite.invalid/assets/aac_wasm_bg-I1Egrqbw.wasm?token=secret#fragment',
      sha256: 'a'.repeat(64),
    }])).toEqual([{
      resource: 'aac_wasm_bg.wasm',
      bundledPath: 'dist/aac_wasm_bg.wasm',
      sha256: 'a'.repeat(64),
    }]);
    expectProvenanceCode(
      () => bindRuntimeAibrushWasmArtifacts(persisted, [{
        resource: 'aac_wasm_bg-I1Egrqbw.wasm', sha256: 'b'.repeat(64),
      }]),
      'AIBRUSH_WASM_RUNTIME_DIGEST_MISMATCH',
    );
    expectProvenanceCode(
      () => bindRuntimeAibrushWasmArtifacts(persisted, [{
        resource: 'mp3_wasm_bg-other.wasm', sha256: 'a'.repeat(64),
      }]),
      'AIBRUSH_WASM_RUNTIME_UNKNOWN',
    );
  });

  test('rejects an installed framework version that differs from the generated artifact', () => {
    const evidence = new AibrushConfigEvidence(cleanProvenance());
    evidence.assertPackageVersion('0.0.0');
    expectProvenanceCode(
      () => evidence.assertPackageVersion('9.9.9'),
      'AIBRUSH_PACKAGE_VERSION_MISMATCH',
    );
  });

  test('sync generation is atomic, deterministic, and refuses dirty CI provenance before build', async () => {
    const source = await readFile(new URL('../scripts/sync-aibrush-vendor.sh', import.meta.url), 'utf8');
    expect(source).toContain('mktemp');
    expect(source).toContain('mv -f "$temp" "$PROVENANCE_OUT"');
    expect(source).toContain('LC_ALL=C sort');
    expect(source).toContain('--reproducible');
    expect(source).toContain('${CI:-}');
    expect(source.indexOf('reproducible/CI sync requires'))
      .toBeLessThan(source.indexOf('( cd "$MEDIA" && bun run build'));
    expect(source).toContain('--registry=http://127.0.0.1:9');
    expect(source).not.toMatch(/generatedAt|date \+/);
  });
});

function cleanProvenance(
  overrides: Partial<AibrushVendorProvenance> = {},
): AibrushVendorProvenance {
  return {
    formatVersion: 1,
    dependency: 'file:../media',
    packageVersion: '0.0.0',
    sourceRevision: '1'.repeat(40),
    sourceTreeDigest: '2'.repeat(64),
    dirtyState: 'clean',
    buildFlags: ['bun run build', 'bun run vendor-wasm'],
    bundledWasmArtifacts: [{ path: 'dist/aac_wasm_bg.wasm', sha256: 'a'.repeat(64) }],
    ...overrides,
  };
}

function expectProvenanceCode(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AibrushProvenanceError);
    expect(error).toMatchObject({ code });
  }
}

function box(type: string, payload = new Uint8Array()): Uint8Array {
  const bytes = new Uint8Array(8 + payload.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.byteLength);
  for (let index = 0; index < 4; index++) bytes[4 + index] = type.charCodeAt(index);
  bytes.set(payload, 8);
  return bytes;
}

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function lifecycle(signal: AbortSignal): LifecycleContext {
  return { signal, phase: 'support', emit: () => undefined };
}

function tuple(): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: 'aibrush-test/probe',
    operation: 'probe',
    inputs: [{ id: 'fixture.mp4', mime: 'video/mp4', container: 'mp4', mutated: false, tracks: [] }],
    options: {},
  };
}
