/**
 * src/engines/ffmpeg-wasm/register.ts — register the ffmpeg.wasm engine with the suite registry.
 *
 * Registers a FACTORY (not an instance) so the runner can build a fresh engine per Worker/iteration
 * (clean peak-memory accounting; the WASM core + worker are torn down in dispose()). This is a
 * non-reference, broad-coverage software engine — never registered as the comparison reference.
 *
 * NOTE: Phase D wires this into the central registry; this file only exposes the helper.
 */

import { registerEngine } from '../../core/registry.ts';
import { FFMPEG_WASM_ENGINE_ID, FfmpegWasmEngine } from './adapter.ts';

export interface RegisterFfmpegWasmOptions {
  /** Override the registry KEY (used by run filters). Defaults to 'ffmpeg-wasm'. */
  id?: string;
}

/** Register the ffmpeg.wasm engine factory under its registry key. */
export function registerFfmpegWasm(opts?: RegisterFfmpegWasmOptions): void {
  const id = opts?.id ?? 'ffmpeg-wasm';
  registerEngine(id, () => new FfmpegWasmEngine(), { resultId: FFMPEG_WASM_ENGINE_ID });
}
