/** Request-scoped lifecycle shared by the browser control surface and Playwright launcher. */

export const LAUNCHER_RUN_HANDSHAKE_SCHEMA = 'media-test/launcher-run-handshake@1' as const;

export interface LauncherRunHandshake {
  schema: typeof LAUNCHER_RUN_HANDSHAKE_SCHEMA;
  requestId: string;
  state: 'started' | 'done';
  artifactRunId?: string;
  error?: string;
}

export function startLauncherRunHandshake(requestId: string): LauncherRunHandshake {
  const normalized = requestId.trim();
  if (!normalized) throw new Error('launcher run request id must be non-empty');
  return {
    schema: LAUNCHER_RUN_HANDSHAKE_SCHEMA,
    requestId: normalized,
    state: 'started',
  };
}

export function finishLauncherRunHandshake(
  started: LauncherRunHandshake,
  artifactRunId?: string,
  error?: string,
): LauncherRunHandshake {
  if (started.schema !== LAUNCHER_RUN_HANDSHAKE_SCHEMA || started.state !== 'started') {
    throw new Error('only a started launcher run handshake can be finished');
  }
  return {
    schema: LAUNCHER_RUN_HANDSHAKE_SCHEMA,
    requestId: started.requestId,
    state: 'done',
    ...(artifactRunId ? { artifactRunId } : {}),
    ...(error ? { error } : {}),
  };
}

export function isLauncherRunDone(value: unknown, requestId: string): value is LauncherRunHandshake {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LauncherRunHandshake>;
  return candidate.schema === LAUNCHER_RUN_HANDSHAKE_SCHEMA
    && candidate.requestId === requestId
    && candidate.state === 'done';
}

export function isLauncherRunPending(value: unknown, requestId: string): value is LauncherRunHandshake {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LauncherRunHandshake>;
  return candidate.schema === LAUNCHER_RUN_HANDSHAKE_SCHEMA
    && candidate.requestId === requestId
    && candidate.state === 'started';
}

/** A launcher checkpoint is useful only after the live run has produced another completed row. */
export function hasUnsavedLauncherResults(savedCount: number, observedCount: number): boolean {
  return Number.isSafeInteger(savedCount)
    && Number.isSafeInteger(observedCount)
    && savedCount >= 0
    && observedCount > savedCount;
}
