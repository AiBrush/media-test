/**
 * src/engines/ffmpeg-wasm/vendor-url.d.ts — ambient typing for Vite's `?url` asset imports of the
 * LOCALLY vendored @ffmpeg/core(-mt) files.
 *
 * The project tsconfig does not pull in `vite/client`, so the `import coreUrl from
 * './vendor/core-mt/ffmpeg-core.js?url'` (and `.wasm?url` / `.worker.js?url`) used by the adapter to
 * load the core from the SAME ORIGIN (dossier §8, no CDN / no run-time toBlobURL) has no declared
 * type. These module declarations give each a `string` type so the engine dir type-checks in
 * isolation. Vite resolves every `?url` import to a content-hashed, SAME-ORIGIN asset URL at
 * build/dev time (satisfies §0.8); the value is just a string at runtime.
 *
 * `?url` forces Vite to emit the file verbatim as a static asset (no transform/bundle): the
 * Emscripten core `.js` is loaded at run time via the ffmpeg class-worker's `await import(coreURL)`,
 * the `.wasm` + pthread `.worker.js` are fetched by the core's own `locateFile`.
 */
declare module '*.js?url' {
  const url: string;
  export default url;
}
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
// The @ffmpeg/ffmpeg class worker imported via Vite's `?worker&url` (bundles its deps → a URL string).
declare module '@ffmpeg/ffmpeg/worker?worker&url' {
  const url: string;
  export default url;
}
