/**
 * src/engines/aibrush-media/frame-digest-pool.ts — off-thread raster + digest for the fused decode
 * pipeline.
 *
 * The suite environment (visible window) measures 4K `copyTo(RGBA)` at ~21 ms/frame and SHA-256 of
 * a 33 MB frame at ~12 ms/frame, and a realm's `crypto.subtle` does NOT overlap concurrent digests
 * (measured: Promise.all == sequential). Both costs sit on the MAIN thread today. Workers remove
 * them: `VideoFrame` is structured-cloneable in Chromium (clone + postMessage-transfer costs the
 * main thread microseconds), and each worker realm gets its own crypto thread — so raster + hash
 * for several frames run genuinely in parallel with the decoder and with each other. Measured on
 * the 4K corpus shape: main-thread fused 1000 ms → 3-worker pool 410 ms per 30 frames, with
 * byte-identical digests.
 *
 * Byte-identity contract: the worker performs EXACTLY the main path's direct-copy normalization —
 * full-visible untight `copyTo(RGBA)` into a tightly-sized buffer, SHA-256 over those exact bytes
 * (the golden rule) — then posts the pixels back TRANSFERRED (zero-copy); the main thread adopts
 * the buffer into an `ImageData` without copying. Frames the main path would rasterize differently
 * (RGBA sidecar, display≠coded, visibleRect crop) never enter the pool. On any protocol failure
 * the pool disables itself and the caller keeps the still-open frame for main-thread fallback —
 * semantics (digest values, ownership, exactly-once close) are identical either way.
 */

/** Minimal DedicatedWorker surface (tests inject a deterministic fake). */
interface PoolWorker {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface FrameDigestPoolOptions {
  /** Worker spawn override; defaults to the embedded same-origin blob worker. Tests inject fakes. */
  createWorker?: () => PoolWorker;
  /** Concurrent workers (clamped to 1..8). Default 3 — measured plateau for 4K-class frames. */
  poolSize?: number;
  /**
   * ImageData factory applied to adopted pixel buffers. Defaults to the realm's `ImageData`
   * constructor; node-side tests inject a stand-in (the normalization contract is byte-identity,
   * which the fake preserves).
   */
  createImageData?: (pixels: Uint8ClampedArray, width: number, height: number) => ImageData;
}

/** The pool's per-frame result: same shape the main-thread fused transform produces. */
export interface PooledFrameDigest {
  readonly img: ImageData;
  readonly ptsUs: number;
  readonly sha256: string;
}

/**
 * True when a frame may take the off-thread path — the same predicate as
 * `imageDataFromAibrushFrame`'s direct-copy branch (display == coded == full visibleRect), plus the
 * realm capabilities the protocol needs (VideoFrame transfer + workers). Sidecar-owned frames
 * (alpha-merged RGBA whose exact pixels live in a main-realm WeakMap) must NOT enter the pool: a
 * transferred clone rasterizes the native surface, not the sidecar.
 */
export function frameIsPoolEligible(frame: VideoFrame, hasSidecar: boolean): boolean {
  if (hasSidecar) return false;
  if (typeof Worker !== 'function') return false;
  if (typeof VideoFrame !== 'function') return false;
  if (typeof (frame as { clone?: unknown }).clone !== 'function') return false;
  const width = frame.displayWidth || frame.codedWidth || 0;
  const height = frame.displayHeight || frame.codedHeight || 0;
  if (width <= 0 || height <= 0) return false;
  if (frame.codedWidth < width || frame.codedHeight < height) return false;
  const rect = frame.visibleRect;
  if (
    rect !== undefined &&
    rect !== null &&
    (rect.x !== 0 || rect.y !== 0 || rect.width !== width || rect.height !== height)
  ) {
    return false;
  }
  return true;
}

/** Worker realm source — self-contained (no imports), embedded via same-origin blob URL. */
const POOL_WORKER_SOURCE = `
self.onmessage = async (e) => {
  const { frame, tag } = e.data;
  const width = e.data.width, height = e.data.height;
  try {
    const rgba = new Uint8ClampedArray(width * height * 4);
    const layouts = await frame.copyTo(rgba, { format: 'RGBA' });
    const tight =
      Array.isArray(layouts) && layouts.length === 1 && (layouts[0]?.stride ?? 0) >= width * 4;
    if (!tight) {
      self.postMessage({ tag, error: 'pool-raster-layout' });
      return;
    }
    const hash = await crypto.subtle.digest('SHA-256', rgba);
    const bytes = new Uint8Array(hash);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    self.postMessage({ tag, hex, pixels: rgba }, [rgba.buffer]);
  } catch (err) {
    self.postMessage({ tag, error: String((err && err.message) || err) });
  } finally {
    try { frame.close(); } catch {}
  }
};
`;

function defaultCreateWorker(): PoolWorker {
  const url = URL.createObjectURL(new Blob([POOL_WORKER_SOURCE], { type: 'text/javascript' }));
  return new Worker(url) as unknown as PoolWorker;
}

interface PoolJob {
  readonly tag: number;
  readonly frame: VideoFrame; // the pool's private clone — pool owns and must close exactly once
  readonly ptsUs: number;
  readonly width: number;
  readonly height: number;
  readonly signal?: AbortSignal;
  readonly resolve: (value: PooledFrameDigest) => void;
  readonly reject: (reason: unknown) => void;
  settled: boolean;
}

/**
 * Bounded pool of digest workers. `digest(frame)` clones `frame` internally and transfers the clone
 * to a free worker; on success the worker closes it; on failure the ORIGINAL stays open (the pool
 * closes only its own clone) so the caller can fall back to main-thread rasterization unchanged.
 */
export class FrameDigestPool {
  readonly #workers: PoolWorker[] = [];
  readonly #ready: PoolJob[] = [];
  readonly #idle: number[] = [];
  readonly #createWorker: () => PoolWorker;
  readonly #createImageData: (pixels: Uint8ClampedArray, width: number, height: number) => ImageData;
  /** The single job each worker may answer (one post ↔ one reply protocol). */
  readonly #owned = new Map<number, PoolJob>();
  #nextTag = 0;
  #disabled = false;
  #disposed = false;

  constructor(options: FrameDigestPoolOptions = {}) {
    this.#createWorker = options.createWorker ?? defaultCreateWorker;
    this.#createImageData =
      options.createImageData ??
      ((pixels, width, height) => new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height));
    const raw = options.poolSize ?? 3;
    const size = Number.isFinite(raw) ? Math.max(1, Math.min(8, Math.floor(raw))) : 3;
    try {
      for (let i = 0; i < size; i++) this.#spawn(i);
    } catch {
      this.#disabled = true;
    }
  }

  /** False once construction failed or a worker poisoned the protocol; callers keep main-thread raster. */
  get available(): boolean {
    return !this.#disabled && !this.#disposed && this.#workers.length > 0;
  }

  /** In-flight + queued job count (for bounded-memory assertions/tests). */
  get pending(): number {
    return this.#owned.size + this.#ready.length;
  }

  digest(
    frame: VideoFrame,
    opts: { ptsUs: number; width: number; height: number; signal?: AbortSignal },
  ): Promise<PooledFrameDigest> {
    if (!this.available) return Promise.reject(new Error('frame-digest-pool-unavailable'));
    let clone: VideoFrame;
    try {
      clone = frame.clone();
    } catch (error) {
      return Promise.reject(error ?? new Error('frame-digest-pool-clone-failed'));
    }
    return new Promise<PooledFrameDigest>((resolve, reject) => {
      const job: PoolJob = {
        tag: this.#nextTag++,
        frame: clone,
        ptsUs: opts.ptsUs,
        width: opts.width,
        height: opts.height,
        signal: opts.signal,
        resolve,
        reject,
        settled: false,
      };
      this.#ready.push(job);
      this.#drain();
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#failAll(new Error('frame-digest-pool-disposed'));
    for (const worker of this.#workers) {
      try {
        worker.terminate();
      } catch {
        /* */
      }
    }
    this.#workers.length = 0;
    this.#idle.length = 0;
  }

  #spawn(index: number): void {
    const worker = this.#createWorker();
    worker.onmessage = (event: MessageEvent) => {
      this.#onMessage(index, event);
    };
    worker.onerror = () => {
      this.#disable();
    };
    this.#workers.push(worker);
    this.#idle.push(index);
  }

  #onMessage(index: number, event: MessageEvent): void {
    const reply = (event.data ?? {}) as {
      tag?: number;
      hex?: string;
      pixels?: Uint8ClampedArray;
      error?: string;
    };
    const job = this.#owned.get(index);
    if (job === undefined) {
      // Unsolicited/duplicate reply from an idle worker: unattributable — the one job it was owed
      // has already settled. Ignoring it can never strand work (nothing is owed to this worker).
      return;
    }
    if (reply.tag !== job.tag) {
      // Protocol breach: this worker owes exactly `job`; a missing or foreign tag means the reply
      // cannot certify that job's raster → fail the owed job and retire the pool to main-thread.
      this.#failOwned(index, `unexpected reply${reply.tag === undefined ? '' : ` for tag ${reply.tag}`}`);
      return;
    }
    if (reply.error !== undefined || reply.hex === undefined || reply.pixels === undefined) {
      this.#failOwned(index, reply.error ?? 'malformed reply');
      return;
    }
    this.#owned.delete(index);
    try {
      const img = this.#createImageData(reply.pixels, job.width, job.height);
      this.#settle(job, () =>
        job.resolve({ img, ptsUs: job.ptsUs, sha256: reply.hex as string }),
      );
    } catch (error) {
      this.#settle(job, () => job.reject(error));
      this.#disable();
      return;
    }
    this.#releaseWorker(index);
  }

  #failOwned(index: number, reason: string): void {
    const job = this.#owned.get(index);
    if (job === undefined) return;
    this.#owned.delete(index);
    this.#settle(job, () => job.reject(new Error(`frame-digest-pool: ${reason}`)));
    this.#disable();
  }

  #releaseWorker(index: number): void {
    if (this.#disposed || this.#disabled) return;
    if (!this.#idle.includes(index)) {
      this.#idle.push(index);
      this.#drain();
    }
  }

  #drain(): void {
    while (!this.#disabled && !this.#disposed && this.#idle.length > 0 && this.#ready.length > 0) {
      const workerIndex = this.#idle.shift();
      const job = this.#ready.shift();
      if (workerIndex === undefined || job === undefined) break;
      const worker = this.#workers[workerIndex];
      if (worker === undefined) continue;
      if (job.settled) continue; // aborted via #failAll while still queued
      if (job.signal?.aborted === true) {
        this.#settle(job, () => job.reject(job.signal?.reason ?? new Error('aborted')));
        this.#idle.push(workerIndex);
        continue;
      }
      const frame = job.frame;
      try {
        worker.postMessage(
          { frame, tag: job.tag, width: job.width, height: job.height },
          [frame as unknown as Transferable],
        );
        this.#owned.set(workerIndex, job);
      } catch (error) {
        this.#settle(job, () => job.reject(error));
        this.#disabled = true; // transfer semantics broken in this realm → stop using the pool
        this.#idle.push(workerIndex);
        break;
      }
    }
  }

  /** Settles exactly once, closing the pool's clone (never the caller's original). */
  #settle(job: PoolJob, action: () => void): void {
    if (job.settled) return;
    job.settled = true;
    try {
      job.frame.close();
    } catch {
      /* worker already closed it on success */
    }
    action();
  }

  #failAll(reason: unknown): void {
    for (const [index, job] of [...this.#owned.entries()]) {
      this.#owned.delete(index);
      this.#settle(job, () => job.reject(reason));
    }
    for (const job of this.#ready.splice(0)) {
      this.#settle(job, () => job.reject(reason));
    }
  }

  #disable(): void {
    if (this.#disabled) return;
    this.#disabled = true;
    this.#failAll(new Error('frame-digest-pool-disabled'));
  }
}
