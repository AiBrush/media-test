/**
 * src/engines/web-demuxer/raster.ts — turn a decoded WebCodecs VideoFrame into a normalized
 * ImageData (tight RGBA, top-left origin, straight alpha) suitable for digesting.
 *
 * BYTE-FOR-BYTE equivalent to the relevant parts of src/engines/platform/raster.ts; kept
 * self-contained under the web-demuxer dir (this agent's writes are scoped here). Prefer
 * VideoFrame.copyTo(RGBA) for untransformed frames so decode-frame digests match the platform/golden
 * path and avoid canvas readback/color-conversion perturbations. Canvas remains the fallback for
 * rotation/crop cases where drawImage is the correct presenter.
 *
 * Realm-aware: prefers OffscreenCanvas (works in Worker + page), falls back to a DOM <canvas>.
 */

interface Canvas2D {
  width: number;
  height: number;
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  getImageData(): ImageData;
}

function hasOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas === 'function';
}

function hasDomCanvas(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

export function hasRasterSurface(): boolean {
  const framePrototype = (globalThis as Record<string, unknown>).VideoFrame as
    | { prototype?: { copyTo?: unknown } }
    | undefined;
  return typeof framePrototype?.prototype?.copyTo === 'function' || hasOffscreenCanvas() || hasDomCanvas();
}

function makeCanvas2D(width: number, height: number): Canvas2D {
  if (hasOffscreenCanvas()) {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d', { alpha: true, willReadFrequently: true }) as
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
    return { width, height, ctx, getImageData: () => ctx.getImageData(0, 0, width, height) };
  }
  if (hasDomCanvas()) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d', { alpha: true, willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    return { width, height, ctx, getImageData: () => ctx.getImageData(0, 0, width, height) };
  }
  throw new Error('No canvas implementation available in this realm (need OffscreenCanvas or DOM <canvas>)');
}

/** Dimensions of a VideoFrame, accounting for visible (display) vs coded size. */
function videoFrameDisplaySize(frame: VideoFrame): { width: number; height: number } {
  const width = frame.displayWidth || frame.codedWidth || (frame.visibleRect?.width ?? 0);
  const height = frame.displayHeight || frame.codedHeight || (frame.visibleRect?.height ?? 0);
  return { width, height };
}

/**
 * Draw a VideoFrame to a 2D canvas and read back normalized RGBA. drawImage applies any rotation /
 * crop the frame carries and produces straight-alpha top-left pixels at display size.
 */
export async function imageDataFromVideoFrame(frame: VideoFrame, signal?: AbortSignal): Promise<ImageData> {
  throwIfAborted(signal);
  const { width, height } = videoFrameDisplaySize(frame);
  if (width <= 0 || height <= 0) throw new Error('VideoFrame has zero display size');

  const copied = await imageDataViaCopyTo(frame, width, height, signal);
  if (copied) return copied;

  throwIfAborted(signal);
  const canvas = makeCanvas2D(width, height);
  canvas.ctx.clearRect(0, 0, width, height);
  canvas.ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, width, height);
  throwIfAborted(signal);
  return canvas.getImageData();
}

async function imageDataViaCopyTo(
  frame: VideoFrame,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<ImageData | null> {
  const f = frame as unknown as {
    codedWidth?: number;
    codedHeight?: number;
    visibleRect?: { x?: number; y?: number; width?: number; height?: number };
    copyTo?: (destination: BufferSource, options?: { format?: string }) => Promise<unknown>;
  };
  const rect = f.visibleRect;
  const untransformed =
    (f.codedWidth ?? width) === width &&
    (f.codedHeight ?? height) === height &&
    (!rect ||
      ((rect.x ?? 0) === 0 &&
        (rect.y ?? 0) === 0 &&
        (rect.width ?? width) === width &&
        (rect.height ?? height) === height));
  if (!untransformed || typeof f.copyTo !== 'function') return null;

  try {
    const rgba = new Uint8Array(width * height * 4);
    await raceAbort(f.copyTo(rgba, { format: 'RGBA' }), signal);
    throwIfAborted(signal);
    return new ImageData(new Uint8ClampedArray(rgba), width, height);
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException('operation aborted', 'AbortError');
}

function raceAbort<T>(promise: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(promise);
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = (): void => finish(() => {
      try {
        throwIfAborted(signal);
      } catch (error) {
        reject(error);
      }
    });
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}
