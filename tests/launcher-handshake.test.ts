import { describe, expect, test } from 'bun:test';
import {
  finishLauncherRunHandshake,
  hasUnsavedLauncherResults,
  isLauncherRunDone,
  isLauncherRunPending,
  LAUNCHER_RUN_HANDSHAKE_SCHEMA,
  startLauncherRunHandshake,
} from '../src/app/launcher-handshake.ts';

describe('launcher run handshake', () => {
  test('only the matching completed request can satisfy launcher polling', () => {
    const started = startLauncherRunHandshake('request-current');
    const stale = finishLauncherRunHandshake(startLauncherRunHandshake('request-stale'), 'run-stale');

    expect(isLauncherRunDone(stale, started.requestId)).toBe(false);
    expect(isLauncherRunDone(started, started.requestId)).toBe(false);
    expect(isLauncherRunPending(started, started.requestId)).toBe(true);
    expect(isLauncherRunPending(stale, started.requestId)).toBe(false);

    const done = finishLauncherRunHandshake(started, 'run-current');
    expect(isLauncherRunDone(done, started.requestId)).toBe(true);
    expect(isLauncherRunPending(done, started.requestId)).toBe(false);
    expect(done).toEqual({
      schema: LAUNCHER_RUN_HANDSHAKE_SCHEMA,
      requestId: 'request-current',
      state: 'done',
      artifactRunId: 'run-current',
    });
  });

  test('rejects empty request ids and finishing a non-started handshake', () => {
    expect(() => startLauncherRunHandshake('   ')).toThrow(/non-empty/);
    const done = finishLauncherRunHandshake(startLauncherRunHandshake('request'), undefined, 'failed');
    expect(() => finishLauncherRunHandshake(done)).toThrow(/started/);
    expect(done.error).toBe('failed');
  });

  test('checkpoints only when completed result count advances', () => {
    expect(hasUnsavedLauncherResults(0, 0)).toBe(false);
    expect(hasUnsavedLauncherResults(0, 1)).toBe(true);
    expect(hasUnsavedLauncherResults(3, 3)).toBe(false);
    expect(hasUnsavedLauncherResults(3, 2)).toBe(false);
  });
});
