export type FfmpegLifecycleState = 'idle' | 'loading' | 'ready' | 'operating' | 'broken' | 'disposing' | 'disposed';

/** Distinct adapter fault for a terminated/hung worker, never an applicability result. */
export class FfmpegWorkerStateError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FfmpegWorkerStateError';
    this.reasonCode = reasonCode;
  }
}

/** Single-flight loading plus whole-operation serialization for one worker/virtual FS. */
export class FfmpegLifecycleGate {
  private current: FfmpegLifecycleState = 'idle';
  private loadPromise: Promise<void> | undefined;
  private loadAbort: AbortController | undefined;
  private tail: Promise<void> = Promise.resolve();
  private terminateWorker: (() => void) | undefined;
  private terminated = false;
  private brokenReason: FfmpegWorkerStateError | undefined;

  get state(): FfmpegLifecycleState {
    return this.current;
  }

  get reason(): FfmpegWorkerStateError | undefined {
    return this.brokenReason;
  }

  setTerminator(terminate: (() => void) | undefined): void {
    this.terminateWorker = terminate;
    this.terminated = false;
  }

  async init(signal: AbortSignal, load: (signal: AbortSignal) => Promise<void>): Promise<void> {
    throwIfAborted(signal);
    if (this.current === 'ready' || this.current === 'operating') return;
    if (this.current === 'disposing' || this.current === 'disposed') {
      throw new FfmpegWorkerStateError('FFMPEG_INSTANCE_DISPOSED', 'ffmpeg instance has been disposed');
    }
    if (this.loadPromise) return abortable(this.loadPromise, signal);

    // A terminated/broken worker may be recovered only by a fresh load call.
    this.brokenReason = undefined;
    this.current = 'loading';
    const controller = new AbortController();
    this.loadAbort = controller;
    const relayAbort = (): void => controller.abort(signal.reason);
    signal.addEventListener('abort', relayAbort, { once: true });

    const shared = Promise.resolve()
      .then(() => load(controller.signal))
      .then(() => {
        if (this.current === 'disposing' || this.current === 'disposed' || controller.signal.aborted) {
          throw controller.signal.reason ?? new DOMException('ffmpeg load aborted', 'AbortError');
        }
        this.current = 'ready';
      })
      .catch((error) => {
        if (this.current !== 'disposing' && this.current !== 'disposed' && this.current !== 'broken') {
          this.current = 'idle';
        }
        throw error;
      })
      .finally(() => {
        signal.removeEventListener('abort', relayAbort);
        if (this.loadPromise === shared) this.loadPromise = undefined;
        if (this.loadAbort === controller) this.loadAbort = undefined;
      });
    this.loadPromise = shared;
    return abortable(shared, signal);
  }

  async operation<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    throwIfAborted(signal);
    let release!: () => void;
    const slot = new Promise<void>((resolve) => { release = resolve; });
    const prior = this.tail;
    this.tail = prior.catch(() => undefined).then(() => slot);
    try {
      await abortable(prior, signal);
      if (this.current === 'broken') throw this.brokenReason;
      if (this.current !== 'ready') {
        throw new FfmpegWorkerStateError(
          'FFMPEG_INSTANCE_NOT_READY',
          `ffmpeg operation requires a loaded worker (state=${this.current})`,
        );
      }
      this.current = 'operating';
      const onAbort = (): void => {
        this.breakWorker(
          'FFMPEG_WORKER_CANCELLED',
          'ffmpeg worker was terminated to cancel the active operation',
          signal.reason,
        );
      };
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        try {
          const result = await run();
          throwIfAborted(signal);
          return result;
        } catch (error) {
          if (signal.aborted && this.brokenReason) {
            throw this.brokenReason;
          }
          throw error;
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
        if (this.current === 'operating') this.current = 'ready';
      }
    } finally {
      release();
    }
  }

  breakWorker(reasonCode: string, message: string, cause?: unknown): FfmpegWorkerStateError {
    const error = new FfmpegWorkerStateError(reasonCode, message, cause !== undefined ? { cause } : undefined);
    this.brokenReason = error;
    this.current = 'broken';
    this.loadAbort?.abort(error);
    this.terminateOnce();
    return error;
  }

  async dispose(reason?: unknown): Promise<void> {
    if (this.current === 'disposed') return;
    this.current = 'disposing';
    const abortReason = reason ?? new FfmpegWorkerStateError('FFMPEG_INSTANCE_DISPOSED', 'ffmpeg instance disposed');
    this.loadAbort?.abort(abortReason);
    this.terminateOnce();
    await this.loadPromise?.catch(() => undefined);
    await this.tail.catch(() => undefined);
    this.current = 'disposed';
  }

  private terminateOnce(): void {
    if (this.terminated) return;
    this.terminated = true;
    try {
      this.terminateWorker?.();
    } catch {
      // The state transition remains decisive; terminate implementations are best-effort.
    }
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason ?? new DOMException('Operation aborted', 'AbortError');
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Operation aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason ?? new DOMException('Operation aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
