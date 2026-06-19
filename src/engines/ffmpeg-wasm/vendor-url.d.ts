/**
 * src/engines/ffmpeg-wasm/vendor-url.d.ts — ambient typing for the @ffmpeg/ffmpeg class worker
 * imported via Vite's `?worker&url` query. The locally vendored Emscripten core files are deliberately
 * NOT imported with `?url`; vite.config.mjs serves them raw at /vendor/ffmpeg-wasm/** so classic
 * pthread workers are not parsed as transformed ESM.
 */
declare module '@ffmpeg/ffmpeg/worker?worker&url' {
  const url: string;
  export default url;
}
