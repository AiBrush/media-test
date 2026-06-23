# encryption/cenc_cbcs_decrypt

family: encryption | fixture asset: `cenc_cbcs.mp4` (2.2 MB, H.264 1280x720@30fps + AAC 48kHz stereo, ~5s, CENC `cbcs` subsample AES-CBC pattern encryption) | primaryMetric: wall | passCount: 1/7

## Verdict

Best framework: **mediabunny@1.48.0**. UNCONTESTED — it is the only engine of the seven that declares the `decrypt` operation AND the `cenc-cbcs` encryption scheme, and the only one that produced a PASS. Decisive factor: capability coverage. The other six engines never ran (NA): five do not declare the `decrypt` operation at all, and ffmpeg.wasm declares `decrypt` but not the `cenc-cbcs` scheme. There is no runner-up margin to report because no second engine executed.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | decrypt-bitexact:true, reference-reimport:true, playback-smoke:true | 51.425 ms | 97.229 x-realtime | 33,740,860 B (32.2 MiB) | 263 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare encryption scheme 'cenc-cbcs' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

## Why the winner wins (deep technical)

The operation is decryption of a CENC `cbcs` protected fragmented/progressive ISOBMFF (MP4). `cbcs` differs from `cenc` (AES-CTR): it uses AES-CBC over subsamples with a crypt:skip block pattern (typically 1:9) and a constant per-sample IV, so a naive whole-sample AES-CTR decryptor cannot clear it — the pattern-block boundary and CBC chaining within each protected block must be honored. This is exactly why scheme declaration (not just "supports decrypt") is the gating capability.

mediabunny is the only engine declaring both the `decrypt` op and the `cenc-cbcs` scheme. The declaration is at `src/engines/mediabunny/adapter.ts:1045` (`encryption: ['cenc-ctr', 'cenc-cbcs', 'hls-aes128']`). The concrete decrypt code path is `src/engines/mediabunny/adapter.ts:1608-1652`: for `cenc-ctr`/`cenc-cbcs` it opens the input with `formatOptions.isobmff.resolveKeyId: () => keyBytes` (adapter.ts:1635-1640), feeding the real 16-byte key (`hexToBytes(key.keyHex)`, adapter.ts:1629) from the golden ground truth `fixtures/golden/cenc_cbcs.mp4.keys.json` (`keyHex: 0123...cdef`, `kid: abcdef00...bbcc`). mediabunny decrypts samples transparently at ISOBMFF read time honoring the cbcs subsample pattern, then `runConversion(...,'mp4')` (adapter.ts:1648) re-muxes the now-plaintext samples into a clean MP4 with no transform (a copy of decrypted samples, adapter.ts:1647). This is a real library decrypt-and-remux, not a copy of the ciphertext nor a short-circuit to a golden.

The oracle evidence is bit-exact and strong. `decrypt-bitexact` (`src/core/oracles.ts:2537-2560`) does NOT trust the engine's container; it takes the engine's decrypted output bytes, decodes them through the platform decoder (`ctx.decodeWithPlatform`, oracles.ts:2552), digests each decoded RGBA frame, and compares the sha256 digests against the cleartext golden `fixtures/golden/cenc_cbcs.mp4.frames.json`. The shard reports measuredFrames=12, goldenFrames=12, comparedFrames=12, mismatchedFrames=0 — every decoded pixel buffer matches the independently-baked plaintext digests. The golden has `pending:false` with 12 distinct sha256 values (verified), so this is the crypto/bit-exact rung of the correctness ladder, the strongest available. `reference-reimport` (oracles.ts:1226+) confirms the output is a genuinely de-protected, re-parseable container: a reference engine re-imported it and found 388 packets / 241 keyframes (plausible for ~5s of 30fps H.264 with frequent IDRs). `playback-smoke` confirms a `<video>` element played frames of the output. Three oracles, anchored by a true bit-exact crypto gate.

Backend: `env.configUsed.backend = webcodecs`, `hwAccel = prefer-hardware` on Apple M1 Max (ANGLE Metal), `wasmThreads:0`, `coopCoep: not-required`, `sharedArrayBuffer:false`. The decrypt itself is pure-TS in mediabunny's ISOBMFF reader (`coreBuild: pure-ts-esm`); the platform WebCodecs path is only used by the oracle to decode and verify. Performance is incidental here (no contest): wall median 51.4 ms, 97.2x realtime, 32.2 MiB peak, 263 ms long-tasks — all single-sample (n=1), so they are point estimates only.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare encryption scheme 'cenc-cbcs'". Honest NA. ffmpeg.wasm's adapter declares decrypt for other schemes (e.g. cenc-ctr / hls-aes128 per its dossier) but not the cbcs subsample-pattern path; it correctly routes NA rather than attempting and silently mis-decrypting.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA; MP4Box.js parses the `pssh`/`tenc`/`senc` boxes but does not perform sample decryption, so it does not claim the op.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA; it is a demuxer, no decrypt capability.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA; the bare platform adapter (WebCodecs/MSE) does not expose a standalone file-decrypt op (EME/CDM clear-key decrypt is not wired as a decrypt() operation here).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA; a parser, not a decryptor.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA; it transcodes/decodes cleartext, no CENC decrypt path.

None of the NAs look like under-declared capability for cbcs: cbcs requires AES-CBC subsample-pattern handling plus key resolution at read time, which none of these libraries implement.

## Anti-cheat validation

- Scenario definition: `src/scenarios/encryption/index.ts:78-94` (`id: 'cenc_cbcs_decrypt'`, `asset: 'cenc_cbcs.mp4'`, `scheme: 'cenc-cbcs'`, video h264 / audio aac). NOTE: the scenario `notes` (index.ts:86-93) are STALE — they claim the asset is "source:provided → NA(asset-missing) until baked". That is no longer true.
- Fixture: `fixtures/media/cenc_cbcs.mp4` EXISTS, 2.2 MB (real media, not synthetic/empty). Goldens exist and are baked: `fixtures/golden/cenc_cbcs.mp4.frames.json` (`pending:false`, 12 unique real sha256 RGBA digests), `.keys.json` (real keyHex/kid), `.meta.json` (h264 1280x720@30 + aac 48k stereo, 5s). The asset has since been baked, so the run executed for real rather than routing NA(asset-missing).
- Winner adapter: `src/engines/mediabunny/adapter.ts:1608-1652` — genuine decrypt via `resolveKeyId` + real key bytes + library remux. No canned output, no input->output copy, no golden short-circuit, no swallowed errors (a wrong key surfaces as a downstream decode failure per the comment at adapter.ts:1636-1640).
- Gating oracle: `src/core/oracles.ts:2537-2560` (decrypt-bitexact) decodes the engine output through the platform and compares per-frame sha256 against the cleartext golden — a real, non-trivial bit-exact comparison; it FAILs hard if golden frames are absent/pending (oracles.ts:2542-2549). Measurements (12/12 frames, 0 mismatches; 388 packets / 241 keyframes) are physically plausible for this clip.
- cached note: mediabunny's result is `cached==true` ("cached previous PASS result"). Staleness risk: the PASS was reused, not re-executed in this run; the adapter (adapter.ts) was modified 55 minutes ago, so there is a small chance the cache predates the latest adapter edit. The evidence (real fixture, baked golden, real adapter, strong oracle) still supports REAL.
- Verdict: **REAL** — real 2.2 MB fixture, genuine library decrypt-and-remux, bit-exact crypto oracle with 12/12 matching frames.

## Confidence & caveats

Confidence: high. The single PASS is gated by a true bit-exact crypto oracle (decrypt-bitexact, 0 mismatched frames) plus a structural re-import and a playback smoke — the strongest correctness rung. Caveats: (1) result is `cached==true`, so it reflects a prior run; the mediabunny adapter was edited ~55 min ago and a fresh re-run is advisable to retire staleness risk. (2) Performance metrics are n==1 point estimates and are not load-bearing (uncontested). (3) The scenario `notes` still describe the asset as missing/NA — documentation drift, not a correctness issue; the fixture and goldens are present and baked. (4) Per the scenario notes (index.ts:92-93), there is no cbcs-SPECIFIC oracle asserting the crypt/skip block boundary was honored beyond whole-frame digests; bit-exact frame digests strongly imply correct pattern handling (any pattern error would corrupt pixels), but a pattern-targeted oracle remains a recorded core-level gap.
