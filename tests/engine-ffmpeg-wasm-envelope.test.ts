import { describe, expect, test } from 'bun:test';
import {
  ConfigUsedSnapshots,
  captureConfigUsedSnapshot,
} from '../src/core/engine.ts';
import {
  FFMPEG_BATCH_LAYOUT_FEATURES,
  FFMPEG_FASTSTART_MOVFLAGS,
  FFMPEG_FRAGMENT_MOVFLAGS,
  redactFfmpegCommand,
} from '../src/engines/ffmpeg-wasm/provenance.ts';

const ENGINE_ID = 'ffmpeg.wasm@0.12.15';

describe('REQ-ENG-18: honest layout tokens and reproducible envelope', () => {
  test('advertises only actual batch-file layouts with exact fragment flags', () => {
    expect(FFMPEG_BATCH_LAYOUT_FEATURES).toEqual([
      'fragmented', 'fastStart:in-memory', 'fastStart:none',
    ]);
    expect(FFMPEG_BATCH_LAYOUT_FEATURES).not.toContain('target:writes');
    expect(FFMPEG_BATCH_LAYOUT_FEATURES).not.toContain('fastStart:reserve');
    expect(FFMPEG_FRAGMENT_MOVFLAGS).toBe('frag_keyframe+empty_moov+default_base_moof');
    expect(FFMPEG_FASTSTART_MOVFLAGS).toBe('+faststart');
  });

  test('redacts scratch generations and user paths while retaining exact command semantics', () => {
    expect(redactFfmpegCommand([
      '-i', '/op17.workerfs/input.mov', '-metadata', 'comment=/Users/alice/My Private/file.mov',
      '-movflags', FFMPEG_FRAGMENT_MOVFLAGS, 'op18.output.mp4',
    ])).toEqual([
      '-i', '<scratch>/input.mov', '-metadata', 'comment=<redacted-path>',
      '-movflags', FFMPEG_FRAGMENT_MOVFLAGS, '<scratch>',
    ]);
    expect(redactFfmpegCommand(['-vf', 'scale=1280:720', '-c:v', 'libx264']))
      .toEqual(['-vf', 'scale=1280:720', '-c:v', 'libx264']);
  });

  test('captures an immutable, complete profile before source mutation/disposal', () => {
    const source = configFixture();
    const snapshot = captureConfigUsedSnapshot(ENGINE_ID, source, { requireProfile: true });
    source.commands[0]![0] = 'mutated';
    source.policyReasonCodes.push('MUTATED_AFTER_CAPTURE');
    expect(snapshot.commands).toEqual([['-i', '<scratch>', '-c', 'copy', '<scratch>']]);
    expect(snapshot.policyReasonCodes).toEqual(['FFMPEG_FASTSTART_RESERVE_UNSUPPORTED']);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.commands)).toBe(true);
  });

  test('produces repeatable snapshots and retains one for every terminal status', () => {
    const first = captureConfigUsedSnapshot(ENGINE_ID, configFixture(), { requireProfile: true });
    const second = captureConfigUsedSnapshot(ENGINE_ID, configFixture(), { requireProfile: true });
    expect(second).toEqual(first);

    for (const status of ['PASS', 'FAIL', 'NA_ENGINE', 'ERROR', 'CANCELLED', 'TIMEOUT']) {
      const snapshots = new ConfigUsedSnapshots(ENGINE_ID);
      const value = configFixture();
      value.terminalStatus = status;
      snapshots.capture('functional', value, true);
      expect(snapshots.toJSON().functional?.terminalStatus, status).toBe(status);
    }
  });

  test('phase evidence identifies the interrupted phase and mandatory worker termination', () => {
    const config = configFixture();
    config.phaseTelemetry.push({
      phase: 'execute',
      atMs: 12,
      bytesIn: 1024,
      bytesOut: 0,
      memfsBytes: 0,
      workerFsBytes: 1024,
      wrapperHeapBytes: 33_554_432,
      estimatedPeakBytes: 33_556_480,
      workerTerminated: true,
      reasonCode: 'FFMPEG_WORKER_TIMEOUT',
    });
    const snapshot = captureConfigUsedSnapshot(ENGINE_ID, config, { requireProfile: true });
    expect(snapshot.phaseTelemetry).toContainEqual(expect.objectContaining({
      phase: 'execute', workerTerminated: true, reasonCode: 'FFMPEG_WORKER_TIMEOUT',
    }));
  });
});

function configFixture(): ReturnType<typeof makeConfig> {
  return makeConfig();
}

function makeConfig() {
  return {
    framework: 'ffmpeg.wasm',
    packageVersions: {
      '@ffmpeg/ffmpeg': '0.12.15',
      '@ffmpeg/core': '0.12.10',
      '@ffmpeg/util': '0.12.2',
    },
    backend: 'wasm',
    hardwareAcceleration: 'none',
    workerCount: 1,
    threadCount: 1,
    readerMode: 'WORKERFS-or-MEMFS',
    writerMode: 'MEMFS-batch',
    targetMode: 'batch-buffer',
    codecConfigs: [{ trackIndex: 0, bytes: 4, sha256: 'ab'.repeat(32) }],
    coreBuild: 'st',
    coreVersion: '0.12.10',
    coreURL: '/vendor/ffmpeg-wasm/core/ffmpeg-core.js',
    wasmURL: '/vendor/ffmpeg-wasm/core/ffmpeg-core.wasm',
    coreAssetIntegrity: { '@ffmpeg/core': 'sha512-pinned' },
    capabilitySource: 'runtime-probed',
    runtimeProbeDigest: 'cd'.repeat(32),
    ffmpegBanner: 'ffmpeg version 7.0',
    ffmpegBuildConfiguration: '--enable-gpl --enable-libx264',
    commands: [['-i', '<scratch>', '-c', 'copy', '<scratch>']],
    phaseTelemetry: [{
      phase: 'materialize',
      atMs: 0,
      bytesIn: 1024,
      bytesOut: 0,
      memfsBytes: 0,
      workerFsBytes: 1024,
      wrapperHeapBytes: 33_554_432,
      estimatedPeakBytes: 33_555_456,
    }],
    memory: {
      memfsBytes: 0,
      workerFsBytes: 0,
      jsCopyBytes: 0,
      wrapperHeapBytes: 33_554_432,
      workingBytes: 0,
      estimatedPeakBytes: 33_556_480,
      livePaths: [],
    },
    workerTimeoutMs: 60_000,
    crossOriginIsolated: true,
    userAgent: 'test-browser',
    hardwareConcurrency: 8,
    policyReasonCodes: ['FFMPEG_FASTSTART_RESERVE_UNSUPPORTED'],
    terminalStatus: 'PASS',
    encoderNondeterministic: true,
  };
}
