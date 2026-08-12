// Generated atomically by scripts/sync-aibrush-vendor.sh. Do not edit by hand.
// Stable inputs only: deliberately no timestamp, origin URL, or absolute host path.
export const GENERATED_AIBRUSH_VENDOR_PROVENANCE = {
  formatVersion: 1,
  dependency: 'file:../media',
  packageVersion: '0.0.0',
  sourceRevision: '2944b1c4a4cb6e9ccd9803a9c9c2edfd67595c87',
  sourceTreeDigest: '576ded255b8bbf366462cb5467b69c84ca626839101c21be7fbe6bfa77f93a5c',
  dirtyState: 'dirty',
  buildFlags: [
    'bun run build',
    'bun run vendor-wasm',
  ],
  bundledWasmArtifacts: [
    { path: 'dist/aac_wasm_bg.wasm', sha256: 'd31dcbbfb9b733b6f3256b040d85e862d3c00d8ee4d4a69a017f69155814219c' },
    { path: 'dist/dav1d_wasm_bg.wasm', sha256: 'db43216c275e6eb82662125a0aec794fd4a30153a1e60915558fe53113365487' },
    { path: 'dist/mp3_wasm_bg.wasm', sha256: 'b56264c129fdadeb347f31c9d7da3ef2ff77a48830bac181add4614aa7fba032' },
    { path: 'dist/vorbis_wasm_bg.wasm', sha256: '602175754176d500e2530baa96ca9a8ac8fbcc4d33a559c6cc7a44eba0390d22' },
  ],
} as const;
