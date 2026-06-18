/**
 * src/engines/ffmpeg-wasm/index.ts — barrel for the ffmpeg.wasm engine adapter.
 */

export { FfmpegWasmEngine, type FfmpegWasmConfig } from './adapter.ts';
export { registerFfmpegWasm, type RegisterFfmpegWasmOptions } from './register.ts';
