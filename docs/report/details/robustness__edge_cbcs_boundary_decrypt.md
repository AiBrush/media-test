# robustness/edge_cbcs_boundary_decrypt

- family: robustness
- fixture asset: `cenc_cbcs.mp4` (2.2 MB, real CENC/cbcs-protected H.264+AAC MP4)
- primaryMetric: (none reported in shard; decrypt op gated solely on correctness oracle `decrypt-bitexact`)
- passCount: 1 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested? **No — uncontested.** Exactly one engine reached `status=PASS`; the other six are `NA_ENGINE` (operation/scheme not declared).
- Decisive factor: mediabunny is the **only** engine that declares the `decrypt` operation AND the `cenc-cbcs` encryption scheme, and it actually decrypts the cbcs-protected samples (via `resolveKeyId` at ISOBMFF read time) producing output that decodes **12/12 frames bit-exact** vs golden (`mismatchedFrames: 0`).
- Margin over runner-up: not applicable (no second PASS). The nearest competitor that even attempts CENC is ffmpeg.wasm, which is `NA_ENGINE` for not declaring the `cenc-cbcs` scheme.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | decrypt-bitexact:true | — (no bench in shard; durationMs=244) | — | — | — | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare encryption scheme 'cenc-cbcs' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

Note: the shard carries no `bench{}` block for any engine on this scenario; the only timing is mediabunny's `durationMs: 244` (and `cached: true`). The decrypt op is gated purely on the bit-exact correctness oracle, not on a performance metric.

## Why the winner wins (deep technical)

The scenario is `op: 'decrypt'` over `cenc_cbcs.mp4`: an H.264-in-MP4 elementary stream (with AAC audio) protected under the **CENC `cbcs`** scheme. `cbcs` is the AES-CBC pattern-encryption variant of Common Encryption: rather than encrypting the whole NAL payload, it applies a *crypt/skip pattern* (e.g. 1 encrypted block : 9 clear blocks) of 16-byte AES-CBC blocks per subsample, with the residual bytes after the last whole 16-byte block left in the clear. The scenario notes call out exactly this hazard: "cbcs crypt/skip pattern-block boundaries — the classic off-by-one decrypt edge" (`src/scenarios/robustness/index.ts:152`). A decryptor that miscounts the pattern stride, mishandles the per-subsample BytesOfClearData/BytesOfProtectedData split, or AES-CBC-decrypts the trailing partial block will corrupt pixels at exactly those boundaries — which a bit-exact frame comparison surfaces immediately.

mediabunny is the only engine that both *declares* and *implements* this path. Its capability table declares `encryption: ['cenc-ctr', 'cenc-cbcs', 'hls-aes128']` (`src/engines/mediabunny/adapter.ts:1045`) and the `decrypt` operation. The implementation (`src/engines/mediabunny/adapter.ts:1608-1652`) opens the protected MP4 through mediabunny's `Input` with `formatOptions.isobmff.resolveKeyId: () => keyBytes` (`adapter.ts:1639`), where `keyBytes = hexToBytes(key.keyHex)` from the scenario's supplied key. mediabunny then decrypts each protected subsample transparently *during read* (honoring the `tenc`/`senc`/`saio`/`saiz` boxes and the cbcs pattern), and `runConversion(... 'mp4')` re-muxes the now-plaintext samples straight through with **no transform** (`adapter.ts:1647-1648`). The output is a clean, decodable MP4 of cleartext H.264.

The gating oracle `decrypt-bitexact` (`src/core/oracles.ts:2537-2560`) takes that decrypted MP4 (`ctx.output`), re-decodes it with the **platform WebCodecs** decoder (`ctx.decodeWithPlatform(ctx.output, { maxFrames: want.length })`, `oracles.ts:2552`), and compares each decoded RGBA frame's sha256 digest against the golden frame digests in `fixtures/golden/cenc_cbcs.mp4.frames.json`. The shard records `measuredFrames: 12, goldenFrames: 12, comparedFrames: 12, mismatchedFrames: 0` — i.e. every one of the 12 baked golden frames matched bit-for-bit. This is the strongest oracle tier (crypto/bit-exact), so the PASS is fully load-bearing: it proves mediabunny got the cbcs pattern-block boundaries right end-to-end, not merely that it produced *some* output.

The backend (`env.configUsed`) is `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `wasmThreads: 0`, `coopCoep: not-required`, `sharedArrayBuffer: false` — the decode-side verification ran on hardware H.264 on the Apple M1 Max (ANGLE Metal), with no COOP/COEP isolation requirement. The decryption itself happens in mediabunny's pure-TS ISOBMFF reader (`coreBuild: pure-ts-esm`), so no wasm threading was needed.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — `NA_ENGINE`: "engine does not declare encryption scheme 'cenc-cbcs'". This is the most interesting NA. ffmpeg *can* in principle handle CENC with `-decryption_key`, but this adapter only declares schemes it has verified working in-browser; per the mediabunny adapter's own audit comment, ffmpeg.wasm decrypts `cenc-ctr` but the suite did not declare it for `cbcs`. The NA looks **honest** (a conservative non-declaration) rather than a fabricated pass — it correctly stays out of a scheme it doesn't vouch for.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'decrypt'". Correct: Chrome's EME/Media-Source decrypt path is for protected *playback* (CDM-mediated), not a file-to-cleartext `decrypt()` transform the harness can capture; declaring it would be dishonest. Honest NA.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare operation 'decrypt'". mp4box.js parses CENC boxes (`tenc`/`schm`/`senc`) but performs no AES decryption; it cannot produce cleartext samples. Honest NA.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'decrypt'". A demuxer only; no decryption capability. Honest NA.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'decrypt'". A metadata/parse engine; no decrypt. Honest NA.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'decrypt'". A WebCodecs transcode wrapper with no CENC key path. Honest NA.

All six NAs are at the declaration layer (`oracleOutcomes: []`, no attempt made), and each is consistent with the real capabilities of the underlying library. None looks like an under-declared capability being dodged to avoid a hard test.

## Anti-cheat validation

- Scenario definition: `src/scenarios/robustness/index.ts:143-153` — `id: 'edge_cbcs_boundary_decrypt'`, `op: 'decrypt'`, `asset: 'cenc_cbcs.mp4'`, `encryption: ['cenc-cbcs']`, `options.scheme: 'cenc-cbcs'`, key supplied inline, `oracles: ['decrypt-bitexact']`.
- Fixture exists and is real: `fixtures/media/cenc_cbcs.mp4` = **2.2 MB** real protected MP4 (not synthetic/empty/mock). Golden ground truth present: `fixtures/golden/cenc_cbcs.mp4.frames.json` (pending=false, **12 frames, all 12 sha256 digests populated and unique**, e.g. `f3b50c8e…`, `1262557b…`, `866cbe26…`), plus `.keys.json`, `.meta.json`, `.packets.json`, `.ssim.json`.
- Winner adapter is genuine: `src/engines/mediabunny/adapter.ts:1608-1652`. It calls the real mediabunny `Input` with `resolveKeyId: () => keyBytes` (line 1639) and `runConversion` (line 1648). It does **not** return canned bytes, does **not** copy input→output (the input is ciphertext; copying it would fail the decode/digest), and does **not** short-circuit to the golden frames file. Errors are thrown, not swallowed (lines 1618, 1626, 1645).
- Oracle is meaningful: `src/core/oracles.ts:2537-2560`. It re-decodes `ctx.output` with the platform WebCodecs decoder and does a **sha256 digest comparison** against baked golden frames; it FAILS if `ctx.output` is missing (line 2539), if golden digests are absent (lines 2542-2549), if platform decode throws (line 2554), or on any digest mismatch (via `compareDigests`). This is a tight crypto-grade gate, not a loose tolerance or smoke-only check. Measurements (12/12 frames, 0 mismatches) are physically plausible for a short real H.264 clip.
- One key caveat worth flagging: the scenario `options.key` is `keyHex: 000102030405060708090a0b0c0d0e0f` / `kid: 00112233445566778899aabbccddeeff`, whereas `fixtures/golden/cenc_cbcs.mp4.keys.json` records `keyHex: 0123456789abcdef0123456789abcdef` / `kid: abcdef00112233445566778899aabbcc`. These disagree. The oracle never reads `.keys.json` (it only uses `.frames.json`), and the adapter feeds whatever key the scenario passes via `resolveKeyId`. Since the bit-exact frame comparison passed (0 mismatches), the *scenario* key is the one that actually decrypts the fixture; `.keys.json` appears to be a stale/placeholder note ("baked offline") and is NOT used by the gate. This does not invalidate the PASS, but the keys.json/scenario divergence should be reconciled in the fixtures.
- Cached note: mediabunny's result is `cached: true` ("cached previous PASS result"), `durationMs: 244`. The PASS evidence (12/12 bit-exact) was reused, not re-run in this pass — mild staleness risk, but the fixture, golden, adapter, and oracle were all verified by reading current source and the golden digests are real and populated.
- **Verdict: REAL.** Real 2.2 MB CENC/cbcs fixture + real `resolveKeyId`-based decrypt implementation + tight bit-exact frame-digest oracle that decoded 12/12 frames with zero mismatches.

## Confidence & caveats

- Confidence: **high** that mediabunny is the correct and only winner, and that the gate is genuine bit-exact crypto verification.
- Caveats: (1) result is cached, so the numbers were not regenerated this run; (2) the scenario-key vs `.keys.json` key mismatch is a fixture inconsistency to reconcile (the gate uses the scenario key, which works); (3) no `bench{}` data exists for this scenario, so there is no performance dimension to compare — the decision is purely correctness/capability; (4) the six NAs are all honest non-declarations consistent with the libraries' real CENC capabilities, so there is no hidden contender being suppressed.
