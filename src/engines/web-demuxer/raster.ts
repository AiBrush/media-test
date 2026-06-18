/**
 * src/engines/web-demuxer/raster.ts — turn a decoded WebCodecs VideoFrame into a normalized
 * ImageData (tight RGBA, top-left origin, straight alpha) suitable for digesting.
 *
 * BYTE-FOR-BYTE equivalent to the relevant parts of src/engines/platform/raster.ts; kept
 * self-contained under the web-demuxer dir (this agent's writes are scoped here). A 2D canvas always
 * yields straight-alpha, top-left RGBA via getImageData, so canvas rasterization IS the
 * normalization step. drawImage applies any rotation/crop the frame carries.
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
export function imageDataFromVideoFrame(frame: VideoFrame): ImageData {
  const { width, height } = videoFrameDisplaySize(frame);
  if (width <= 0 || height <= 0) throw new Error('VideoFrame has zero display size');
  const canvas = makeCanvas2D(width, height);
  canvas.ctx.clearRect(0, 0, width, height);
  canvas.ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, width, height);
  return canvas.getImageData();
}
