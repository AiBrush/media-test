# encryption/clearkey_decrypt_na

family: encryption | fixture asset: `cenc_ctr.mp4` (CENC AES-CTR container, H.264 video + AAC audio) | primaryMetric: wall | passCount: 2

## Verdict

- Best framework: **mediabunny@1.48.0** (PASS).
- Contested: YES — 2 engines PASS (mediabunny, ffmpeg.wasm), both satisfying the single gate `graceful-failure`. The other 5 are NA_ENGINE.
- Decisive factor: CORRECTNESS IS A TIE (both reject the unsupported `clearkey` scheme cleanly and pass the same lone oracle), so the tiebreak falls to PERFORMANCE on the primary metric `wall`. mediabunny rejects in **6 ms** vs ffmpeg.wasm **155 ms**.
- Margin over runner-up: **~25.8x faster wall** (6 ms vs 155 ms). Note: both numbers are single durations (`durationMs`), not benchmarked medians; there is no `bench{}` block because the scheme is rejected before any media work. So the margin is real in direction but low-precision (n=1, no mad/p95). Both results are `cached==true`.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 6 ms (durationMs) | n/a | n/a | n/a | cached: graceful: mediabunny decrypt: unsupported scheme 'clearkey' |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 155 ms (durationMs) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: unsupported decrypt scheme 'clearkey' |
| platform@chrome-149 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare operation 'decrypt' |

No engine emitted a `bench{}` block: this is a capability-finding row whose only correct action is to throw, so the runner records `durationMs` only. throughputRealtime / peakMemory / longtasks are therefore absent for every engine.

## Why the winner wins (deep technical)

This is NOT a positive decrypt test. The scenario `encryption/clearkey_decrypt_na` (src/scenarios/encryption/capability-findings.ts:24-38) is a §A.12 capability-finding row. The input `options.scheme` is `'clearkey'` — an EME key-system / license-negotiation concept, NOT one of the suite's raw-decrypt primitives (`cenc-ctr | cenc-cbcs | hls-aes128`, the closed `EncryptionScheme` union documented at src/scenarios/encryption/_shared.ts:96-101). The asset `cenc_ctr.mp4` is reused only to give a decrypt-capable engine a realistically-shaped CENC container to look at; the CORRECT outcome is a clean rejection, because returning a decrypted output for `clearkey` would be a capability over-claim (notes: "returning output would be an over-claim", capability-findings.ts:34-37). The lone oracle is `graceful-failure` (capability-findings.ts:77), and the scenario carries the notes marker `GRACEFUL signal:rejected`.

The oracle (src/core/oracles.ts:2586-2623) parses `signal:rejected` from the scenario notes (regex at line 2590), classifies `rejected` as a "good token" (line 2596), and returns PASS "malformed input handled gracefully (signal: 'rejected')" — exactly the detail recorded for both winners. Critically, the oracle would FAIL any engine that produced output instead of throwing (lines 2614-2617, since `gracefulAllowOutput` is not set on this scenario), so the gate is not vacuous: it discriminates a clean rejection from an over-claiming "success".

mediabunny wins because it (a) DECLARES `decrypt` as a capability — so the runner does not short-circuit it to NA — and (b) implements an explicit scheme allow-list that rejects `clearkey` immediately. In src/engines/mediabunny/adapter.ts:1608-1627 the `decrypt()` method handles only `hls-aes128` and then `cenc-ctr`/`cenc-cbcs`; anything else hits `throw new Error("mediabunny decrypt: unsupported scheme 'clearkey'")` at adapter.ts:1625-1626. That throw happens BEFORE any input buffering, demux, or `resolveKeyId` work (which would only run on the CENC branch at adapter.ts:1628-1648), so the cost is just dispatch — recorded as **6 ms** durationMs. The runner catches the throw and routes it to `graceful-failure`, which PASSes.

ffmpeg.wasm reaches the identical verdict by the same structural mechanism: src/engines/ffmpeg-wasm/adapter.ts:2109-2113 rejects any scheme other than `cenc-ctr` (and the separate `hls-aes128` branch at 2077) with `throw new Error("ffmpeg.wasm@0.12.15: unsupported decrypt scheme 'clearkey'")`. The comment at adapter.ts:2110-2112 confirms `clearkey` is explicitly enumerated as a non-native path. Correctness is therefore a genuine tie — both throw cleanly, both pass the one oracle with identical `detail`.

The only separator is wall time, and the gap is mechanistic: ffmpeg.wasm's adapter must (per the file's design) bring up its single-thread wasm core and module plumbing on the path to the decrypt entry, so even its early-reject path costs **155 ms**, ~25.8x mediabunny's **6 ms** pure-TS-ESM dispatch (env.configUsed.coreBuild `pure-ts-esm`, no SharedArrayBuffer, COOP/COEP not-required). mediabunny's lighter cold path on the rejection branch is the decisive factor. Caveat: this is a single sampled `durationMs` each (no `bench` median/mad/p95), so it is weak-precision evidence — the direction is unambiguous but the exact ratio should not be over-read.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but lost the perf tiebreak: 155 ms reject vs mediabunny's 6 ms (~25.8x slower wall). Correctness identical (same `graceful-failure:true`, same `signal:'rejected'` detail). Reason: `unsupported decrypt scheme 'clearkey'` (adapter.ts:2113).
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: the platform/WebCodecs adapter exposes decode/demux/encode primitives, not a raw decrypt op, so the runner gates it at Pass 1 (runner.ts:117-119).
- **mp4box@2.3.0** — NA_ENGINE: does not declare `decrypt`. Honest — mp4box.js is a box parser/segmenter; it can surface CENC metadata but does not perform sample decryption.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare `decrypt`. Honest — it is a demux-only ffmpeg-wasm wrapper with no decrypt capability declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare `decrypt`. Honest — a metadata/parse engine, no decrypt op.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare `decrypt`. Honest — transcode/WebCodecs wrapper, no decrypt op.

All 5 NAs are genuine under-of-scope, not under-declared capabilities: none of these libraries implements a sample-level decrypt primitive, so declaring `decrypt` and then rejecting would be theater. NA_ENGINE is the correct, honest classification (runner.ts:104,117-119).

## Anti-cheat validation

- Scenario: src/scenarios/encryption/capability-findings.ts:24-38 (case `clearkey_decrypt_na`), built into a Scenario at capability-findings.ts:65-81 — `op: 'decrypt'`, `input: 'cenc_ctr.mp4'`, `options.scheme: 'clearkey'`, `oracles: ['graceful-failure']`, `metrics: ['wall']`.
- Fixture: `fixtures/media/cenc_ctr.mp4` EXISTS (2.2 MB real CENC AES-CTR MP4 — H.264 + AAC). Not synthetic/empty/mock. It is the genuine cenc_ctr corpus asset (keys mirrored at _shared.ts:56-63), reused here only as container shape; the test never tries to actually decrypt it with the clearkey path.
- Oracle: src/core/oracles.ts:2586-2623 (`gracefulFailure`). Performs a real discrimination: PASS only when the engine threw/rejected (signal token, line 2596-2598) OR produced no output (2607-2610); FAILs when output is produced from this input without `gracefulAllowOutput` (2614-2617). Not trivially satisfiable — an engine that fabricated decrypted output would FAIL.
- Winner adapter: src/engines/mediabunny/adapter.ts:1608-1627; the rejection is a real `throw` on the scheme allow-list miss (1625-1626), not a canned success, not a golden short-circuit, not a swallowed error. The runner converts the throw into the graceful-failure PASS.
- Cached note: BOTH winners have `cached==true` (reused, not re-run this session). Staleness risk is low for a capability-finding row (the scheme allow-list is static code), but the 6 ms / 155 ms durations are from a prior run and were not re-measured here.
- Verdict: **REAL**. Real fixture, real explicit-rejection code path in both passing adapters, and a meaningful oracle that would fail an over-claiming engine. The PASS is genuine, though it is a graceful-rejection gate (correctness = "correctly says no"), not a bit-exact decrypt gate — so it certifies honest capability boundaries, not decrypt fidelity.

## Confidence & caveats

- Confidence: HIGH on the verdict and on the REAL classification. The scenario, oracle, fixture, and both winner code paths were all inspected directly.
- Caveat 1: "Winning" here means winning a graceful-NO contest. Neither engine decrypts ClearKey; the metric being compared is rejection latency, which is a weak basis for a "best framework" claim — both are equally correct.
- Caveat 2: No `bench{}` block exists; wall figures are single `durationMs` samples (n=1, no mad/p95), so the 25.8x ratio is directionally solid but low-precision.
- Caveat 3: Both winners are `cached==true`; durations were not re-measured this run.
