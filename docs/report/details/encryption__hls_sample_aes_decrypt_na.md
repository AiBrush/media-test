# encryption/hls_sample_aes_decrypt_na

family: encryption | fixture asset: `hls_aes128.m3u8` (+ `hls_aes128.key`, `hls_aes128_000..004.ts`) | primaryMetric: wall | passCount: 2

## Verdict

Best framework: **mediabunny@1.48.0** (CONTESTED — 2 of 7 engines PASS).

This is a capability-finding / negative scenario: the input is a full-segment HLS **AES-128** playlist, but the requested `scheme` is **`hls-sample-aes`** (partial, per-sample AES — a different scheme with no fixture/golden in the corpus). The single gate is `graceful-failure` (notes embed `signal:rejected`), so the "correct" behavior is a clean rejection of the unsupported scheme, NOT producing decrypted output. Both PASS engines satisfy the identical oracle with identical strictness, so correctness is a tie. The decisive factor is therefore **performance (wall)**: mediabunny rejected in `durationMs=7` vs ffmpeg-wasm's `durationMs=144` — a **~20.6x faster** clean rejection. Margin over runner-up: 144/7 ≈ 20.6x lower wall.

Caveat: both PASS results are `cached==true`, and neither carries a `bench{}` block (only `durationMs`), so the wall figures are single observations, not medianed distributions — the performance margin is directional, not statistically robust.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | n/a (durationMs=7) | n/a | n/a | n/a | cached: graceful: mediabunny decrypt: unsupported scheme 'hls-sample-aes' |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | n/a (durationMs=144) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: unsupported decrypt scheme 'hls-sample-aes' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

No engine reports a `bench{}` block for this scenario; the only timing signal is `durationMs`. `throughputRealtime`, `peakMemory`, and `longtasks` are absent from the shard for every entry.

## Why the winner wins (deep technical)

The operation under test is `decrypt` with `options.scheme = 'hls-sample-aes'` (see `src/scenarios/encryption/capability-findings.ts:52-62` and the scenario factory at `:65-81`). SAMPLE-AES is the Apple HLS variant that encrypts only the elementary-stream payload of each NAL/ADTS frame (leaving start codes / sync layers in the clear), as opposed to full-segment AES-128-CBC which encrypts the entire `.ts` segment. The fixture playlist declares the latter: `#EXT-X-KEY:METHOD=AES-128,...` (full-segment) — so SAMPLE-AES is genuinely not what this asset is, and a decrypt-capable engine must refuse rather than silently run its AES-128 segment path and emit output (which would "conflate two paths," per the scenario notes).

mediabunny declares an encryption capability set of `['cenc-ctr','cenc-cbcs','hls-aes128']` (`src/engines/mediabunny/adapter.ts:1045`). Its `decrypt()` (`src/engines/mediabunny/adapter.ts:1608`) routes `hls-aes128` into the segmented HLS reader (`:1613-1623`) and `cenc-ctr`/`cenc-cbcs` into the ISOBMFF `resolveKeyId` path (`:1625-1651`). Crucially, the very first non-matching branch is an explicit guard: `if (opts.scheme !== 'cenc-ctr' && opts.scheme !== 'cenc-cbcs') throw new Error(\`mediabunny decrypt: unsupported scheme '${opts.scheme}'\`)` (`src/engines/mediabunny/adapter.ts:1625-1626`). For `hls-sample-aes` neither the `hls-aes128` branch nor the CENC branch matches, so the function throws **before opening or buffering any segment** — no `.ts` is fetched, no AES block runs. That is why its `durationMs` is just **7 ms**: it is a pure synchronous scheme-dispatch rejection, with no I/O on the ~4.6 MB of `.ts` data.

The runner catches that throw and, because the scenario notes carry `signal:rejected`, the `graceful-failure` oracle maps the `rejected` token (in its `goodTokens` list) to PASS: `gracefulFailure()` at `src/core/oracles.ts:2586`, specifically the marker branch `:2590-2599` returning `pass(oracle, "malformed input handled gracefully (signal: 'rejected')")`. The shard's `oracleOutcomes[0].detail` ("malformed input handled gracefully (signal: 'rejected')") matches this code path exactly. No output object was produced (`ctx.output` empty), so even the fallback inference branch (`:2607-2617`) would also have passed — the rejection is unambiguous.

ffmpeg-wasm is correct too but slower. Its `decrypt()` (`src/engines/ffmpeg-wasm/adapter.ts:2073`) declares encryption `['cenc-ctr','hls-aes128']` (`:1475`, `:1757`) and has an explicit comment that `clearkey / cenc-cens / hls-sample-aes / cenc-cbcs` are deliberately absent (`:2110-2112`), throwing a plain `Error(\`${ENGINE_ID}: unsupported decrypt scheme '${opts.scheme}'\`)` at `:2113`. Functionally identical refusal — but it reaches that throw only after `opts.scheme === 'hls-aes128'` check at `:2077` and the `cenc-ctr` check at `:2109`, and the larger `durationMs=144` reflects the heavier ffmpeg.wasm module/runtime overhead around the call (single-thread wasm engine init costs) rather than any real crypto work. Same oracle, same `signal:rejected` detail, ~20.6x more wall.

Because both winners satisfy the same single oracle with the same strictness (correctness ladder is a tie — both are a clean rejection, not a bit-exact decrypt), the decision falls to performance per the procedure, and mediabunny's 7 ms vs 144 ms wins on wall median, additionally favored by the tiebreak that it requires no COOP/COEP and no wasm threads (`env.configUsed`: `coopCoep: "not-required"`, `wasmThreads: 0`, `sharedArrayBuffer: false`).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (correct clean rejection of `hls-sample-aes` at `src/engines/ffmpeg-wasm/adapter.ts:2113`) but lost on performance: `durationMs=144` vs mediabunny's `7` (~20.6x slower wall). Heavier wasm runtime overhead around the synchronous scheme guard.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA — Chrome's WebCodecs/built-in stack exposes no raw stream-decrypt primitive (decryption lives behind EME, not a programmatic decrypt op), so not declaring `decrypt` is correct.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA — mp4box.js is an ISOBMFF parser/segmenter; it can surface CENC metadata but performs no key-driven decryption, and HLS/TS is outside its container scope entirely.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA — a demux-only ffmpeg-wasm wrapper with no exposed decrypt entry point.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA — a parser, not a decryptor.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA — wraps WebCodecs for transcode/convert; no raw decrypt primitive, same rationale as platform.

All five NAs are `NA_ENGINE` (capability not declared in the adapter), which the runner/registry treats as an honest "operation not offered" rather than a runtime failure. None looks like an under-declared capability: raw stream decrypt is genuinely outside the scope of these five libraries.

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/encryption/capability-findings.ts:52-62` (case) + `:65-81` (factory). op=`decrypt`, scheme=`hls-sample-aes`, oracle=`graceful-failure`, notes embed `signal:rejected` and the explicit gating rationale (reject SAMPLE-AES; returning full-segment AES output is an over-claim).
- **Fixture exists & is real**: `fixtures/media/hls_aes128.m3u8` (378 B, real `#EXT-X-KEY:METHOD=AES-128` playlist) with companion `hls_aes128.key` (16 B) and five real encrypted segments `hls_aes128_000..004.ts` (~0.9 MB each, ~4.6 MB total). Not synthetic/empty/mock. Note the asset is full-segment AES-128 by design; the scenario deliberately requests the *different* `hls-sample-aes` scheme to force a rejection — this is intentional, not a mismatch bug (the notes call it out).
- **Winner adapter genuinely refuses**: `src/engines/mediabunny/adapter.ts:1608` (`decrypt`); `hls-sample-aes` matches neither the `hls-aes128` branch (`:1613`) nor CENC, hitting the explicit `throw` at `:1625-1626`. It does NOT return canned output, copy input→output, short-circuit to a golden, or swallow the error — it throws synchronously before any segment I/O.
- **Oracle is meaningful for this row**: `src/core/oracles.ts:2586` `gracefulFailure()`. It is the correct gate for a negative scenario — it PASSes only on a recognized rejection token (`:2596-2599`) or on absence of output (`:2607-2610`), and importantly **FAILs if the engine produced output from this input** (`:2611-2617`). So an engine that cheated by emitting full-segment-AES decrypted bytes would FAIL, not PASS. The gate is loose only in that any clean throw qualifies (it does not distinguish a "wrong scheme" error from an unrelated crash that still rejects), which is acceptable for a capability-finding row but is not a strong correctness gate.
- **Cached note**: both PASS results have `cached==true`. The evidence was reused, not freshly re-run; per the launcher seeding caveat, stale PASS reuse is possible. The reasons are deterministic synchronous scheme guards, so staleness risk to the *verdict* is low, but the `durationMs` numbers (7 vs 144) are from a prior run and uncorroborated by any `bench{}` distribution.

**validationVerdict: WEAK-GATE.** The fixture is real, the winner's rejection is a genuine code path (not a mock/short-circuit), and the oracle does reject fake-output cheats — so the PASS is real. But the gate is `graceful-failure` (a smoke-level negative gate), not a bit-exact decrypt oracle, so the PASS proves only "rejects cleanly," not any decryption correctness. Combined with `cached==true` and no `bench{}`, the strength of evidence is limited.

## Confidence & caveats

- Confidence: **medium**. The NA/PASS structure and rejection code paths are unambiguous and verified at source; the verdict (mediabunny by speed of clean rejection) is sound.
- Caveats: (1) This is a negative capability-finding row — "winning" means rejecting fastest, not decrypting; the result says nothing about either engine's actual SAMPLE-AES capability (neither has it). (2) Both PASS entries are cached and lack `bench{}`; the 20.6x wall margin rests on single `durationMs` samples (n effectively 1), so it is directional only. (3) The five NA_ENGINE results are honest non-declarations, not failures.
