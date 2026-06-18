/**
 * src/engines/web-demuxer/wasm-url.d.ts — ambient typing for Vite's `?url` asset import.
 *
 * The project tsconfig does not pull in `vite/client`, so the `import wasmUrl from
 * 'web-demuxer/dist/wasm-files/web-demuxer.wasm?url'` used by the adapter (dossier §7, Option A) has
 * no declared type. This module declaration gives it a `string` type so the engine dir type-checks
 * in isolation. Vite resolves the import to a content-hashed, SAME-ORIGIN asset URL at build/dev
 * time (no CDN, satisfies §0.8); the value is just a string at runtime.
 */
declare module '*.wasm?url' {
  const url: string;
  export default url;
}

// The adapter imports the wasm via the package's declared "./wasm" export subpath
// ('web-demuxer/wasm?url') — Vite blocks the raw deep dist path. That specifier does not end in
// '.wasm?url', so the wildcard above does not match it; declare it explicitly.
declare module 'web-demuxer/wasm?url' {
  const url: string;
  export default url;
}
