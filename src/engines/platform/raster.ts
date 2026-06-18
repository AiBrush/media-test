/**
 * src/engines/platform/raster.ts — turn a decoded VideoFrame / ImageBitmap / video element into a
 * normalized ImageData (tight RGBA, top-left origin, straight alpha) suitable for digesting.
 *
 * Realm-aware: for WebCodecs VideoFrame we prefer copyTo(RGBA), which avoids browser canvas
 * fingerprinting perturbations and is available in Worker + page. Canvas remains the fallback for
 * rotation/crop cases, ImageBitmap, and <video> element grabs.
 */

/** Source we can draw to a 2D canvas. VideoFrame/ImageBitmap are CanvasImageSource in WebCodecs realms. */
type Drawable = CanvasImageSource;

interface Canvas2D {
  width: number;
  height: number;
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  getImageData(): ImageData;
}

/** True when OffscreenCanvas with a 2D context is usable in this realm (page or Worker). */
function hasOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas === 'function';
}

/** True when a DOM <canvas> is constructible (page main thread only). */
function hasDomCanvas(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/**
 * Create a 2D canvas of the given size. `willReadFrequently` hints the implementation to keep a
 * CPU-side buffer (we always getImageData). `alpha:true` so straight alpha survives.
 */
function makeCanvas2D(width: number, height: number): Canvas2D {
  if (hasOffscreenCanvas()) {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d', { alpha: true, willReadFrequently: true }) as
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
    return {
      width,
      height,
      ctx,
      getImageData: () => ctx.getImageData(0, 0, width, height),
    };
  }
  if (hasDomCanvas()) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d', { alpha: true, willReadFrequently: true }) as CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    return {
      width,
      height,
      ctx,
      getImageData: () => ctx.getImageData(0, 0, width, height),
    };
  }
  throw new Error('No canvas implementation available in this realm (need OffscreenCanvas or DOM <canvas>)');
}

/** Dimensions of a VideoFrame, accounting for visible (display) vs coded size. */
function videoFrameDisplaySize(frame: VideoFrame): { width: number; height: number } {
  // displayWidth/Height honor aspect-ratio + crop (visibleRect). Fall back to codedWidth/Height.
  const width = frame.displayWidth || frame.codedWidth || (frame.visibleRect?.width ?? 0);
  const height = frame.displayHeight || frame.codedHeight || (frame.visibleRect?.height ?? 0);
  return { width, height };
}

/**
 * Convert a VideoFrame to normalized RGBA. Prefer direct WebCodecs copyTo(RGBA) for uncropped,
 * unrotated frames: it avoids canvas readback perturbations in privacy-hardened browsers. Fall back
 * to canvas so rotation/crop metadata is still honored where drawImage is the correct presenter.
 */
export async function imageDataFromVideoFrame(frame: VideoFrame): Promise<ImageData> {
  const { width, height } = videoFrameDisplaySize(frame);
  if (width <= 0 || height <= 0) throw new Error('VideoFrame has zero display size');

  const copied = await imageDataViaCopyTo(frame, width, height);
  if (copied) return copied;

  const canvas = makeCanvas2D(width, height);
  canvas.ctx.clearRect(0, 0, width, height);
  // VideoFrame is a CanvasImageSource; drawImage scales the visible rect into the canvas.
  canvas.ctx.drawImage(frame as unknown as Drawable, 0, 0, width, height);
  return canvas.getImageData();
}

async function imageDataViaCopyTo(frame: VideoFrame, width: number, height: number): Promise<ImageData | null> {
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
    await f.copyTo(rgba, { format: 'RGBA' });
    return new ImageData(new Uint8ClampedArray(rgba), width, height);
  } catch {
    return null;
  }
}

/** Draw an ImageBitmap (e.g. from createImageBitmap on a <video>) to a canvas and read RGBA. */
export function imageDataFromBitmap(bitmap: ImageBitmap): ImageData {
  const width = bitmap.width;
  const height = bitmap.height;
  if (width <= 0 || height <= 0) throw new Error('ImageBitmap has zero size');
  const canvas = makeCanvas2D(width, height);
  canvas.ctx.clearRect(0, 0, width, height);
  canvas.ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.getImageData();
}

/**
 * Draw an HTMLVideoElement's current frame to a canvas and read RGBA. Page-only (a <video> element
 * requires the DOM). Uses videoWidth/videoHeight (intrinsic decoded size).
 */
export function imageDataFromVideoElement(video: HTMLVideoElement): ImageData {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) throw new Error('<video> has zero intrinsic size (not enough data decoded)');
  const canvas = makeCanvas2D(width, height);
  canvas.ctx.clearRect(0, 0, width, height);
  canvas.ctx.drawImage(video, 0, 0, width, height);
  return canvas.getImageData();
}
