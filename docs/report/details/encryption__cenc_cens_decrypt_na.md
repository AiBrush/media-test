# encryption/cenc_cens_decrypt_na

**Family:** encryption | **Fixture asset:** `fixtures/media/cenc_ctr.mp4` (2.2 MB, real CENC-CTR MP4; stand-in only — no `cens` corpus exists) | **Primary metric:** wall | **passCount:** 2 of 7

## Verdict

**Best framework: mediabunny@1.48.0** — CONTESTED (2 engines PASS).

This is a *capability-finding / negative* scenario. The scenario feeds the unsupported `cenc-cens` (AES-CTR pattern encryption) scheme token to any decrypt-capable engine and requires a CLEAN rejection. The gate is `graceful-failure` (`signal:rejected`), not a correctness/bit-exact gate. Two engines declare `decrypt` and both reject the scheme cleanly: ffmpeg.wasm and mediabunny. The other five never declare the `decrypt` operation and are honestly NA_ENGINE.

Both winners pass the *identical* oracle with the identical strength (one `graceful-failure:pass`), so correctness is tied. The decisive factor is **performance**: mediabunny rejects in **11 ms** wall vs ffmpeg.wasm's **233 ms** — a **~21x faster** rejection. Both results are `cached==true` and both signal `rejected`.

Margin over runner-up: **21.2x faster wall** (11 ms vs 233 ms). Caveat: both are n-of-cache single durations, no bench{} distribution, so the margin is directional, not statistically deep.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 11 ms (durationMs) | n/a | n/a | n/a | cached: graceful: mediabunny decrypt: unsupported scheme 'cenc-cens' |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 233 ms (durationMs) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: unsupported decrypt scheme 'cenc-cens' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

No `bench{}` block is present for either PASS engine (negative/reject scenario; only `durationMs` recorded). Wall figures above are `durationMs`.

## Why the winner wins (deep technical)

The operation under test is **decrypt** against a fragmented-free CENC-CTR MP4 (`cenc_ctr.mp4`: H.264 video + AAC audio in ISOBMFF), but the *scheme* requested is `cenc-cens` — the AES-128-CTR **pattern** ("cens") variant, the CTR-mode counterpart to `cbcs`. No `cens` asset or golden exists in the corpus (`capability-findings.ts:42,46-49`), so the scenario cannot be a positive decrypt test. The scenario is therefore deliberately a *rejection contract*: an engine that declares `decrypt` must refuse the unsupported scheme rather than silently mis-decrypt the CTR fixture as if it were cens. The notes encode `signal:rejected`, and the only oracle is `graceful-failure`.

**mediabunny's rejection path** (`src/engines/mediabunny/adapter.ts:1608-1627`): `decrypt()` first short-circuits `hls-aes128`, then gates on the scheme allow-list with `if (opts.scheme !== 'cenc-ctr' && opts.scheme !== 'cenc-cbcs') throw new Error("mediabunny decrypt: unsupported scheme 'cenc-cens'")` at line 1625-1626. This throw happens **before** any I/O — before `input.arrayBuffer()`, before constructing `mb.Input` or invoking the ISOBMFF `resolveKeyId` read path (lines 1628-1648). It is a pure synchronous allow-list check, which is exactly why the wall is **11 ms**: no file buffering, no demux, no WebCodecs spin-up. The runner catches the throw and routes it through `graceful-failure`, which sees the notes marker `signal:rejected` (a "good token") and returns PASS (`src/core/oracles.ts:2590-2599`).

**ffmpeg.wasm's rejection path** (`src/engines/ffmpeg-wasm/adapter.ts:2073-2113`): `decrypt()` handles `hls-aes128`, then `if (opts.scheme !== 'cenc-ctr') { throw new Error("ffmpeg.wasm@0.12.15: unsupported decrypt scheme 'cenc-cens'") }` at line 2109-2113. Functionally identical contract — a plain Error for anything outside its declared encryption set `['cenc-ctr','hls-aes128']` (line 1475). It also passes `graceful-failure`. The reason it is **233 ms** vs mediabunny's 11 ms is overhead unrelated to the decrypt logic itself (ffmpeg.wasm carries heavier module/runtime init even on a cached negative path); the throw point is comparably early, but the engine's baseline cost is far higher. Mediabunny used the WebCodecs backend config (`backend:"webcodecs"`, `coreBuild:"pure-ts-esm"`, `coopCoep:"not-required"`, `sharedArrayBuffer:false`) — a pure-TS ESM core with no COOP/COEP requirement, which also favours it on tiebreakers even before the wall margin.

So both engines satisfy the *same* correctness contract identically; mediabunny wins purely on a ~21x lower cost to reach the clean rejection, plus the no-COOP/COEP, no-SAB tiebreaker.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed correctly (clean reject of `cenc-cens`, `graceful-failure:pass`) but lost on performance: **233 ms vs 11 ms** wall (21.2x slower) to reach the identical rejection. Not "wrong", just slower.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: MP4Box.js is a parser/segmenter and exposes no decrypt primitive.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: raw WebCodecs/platform has no standalone CENC decrypt primitive (decryption would be EME/MSE, not this raw-bytes op).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: it parses media, does not decrypt.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: transcode/decode wrapper, no decrypt op.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: demux-only, no decrypt op.

All five NAs are honest non-declarations, not under-declared capabilities: none of these libraries ships a CENC/cens decrypt primitive, so declaring it would be an over-claim.

## Anti-cheat validation

- **Scenario:** `src/scenarios/encryption/capability-findings.ts:40-50` (id `cenc_cens_decrypt_na`), built via `defineScenario` at lines 65-81 with `op:'decrypt'`, `options.scheme:'cenc-cens'`, `oracles:['graceful-failure']`, `metrics:['wall']`.
- **Fixture:** `asset: 'cenc_ctr.mp4'` → `fixtures/media/cenc_ctr.mp4` exists (2.2 MB real CENC-CTR MP4). It is explicitly a *stand-in* for input construction only (line 42: "no 'cens' asset exists"); the test never expects a decrypted output from it, so reuse here is legitimate, not a synthetic/mock cheat.
- **Oracle:** `gracefulFailure` at `src/core/oracles.ts:2586-2623`. It reads the `signal:rejected` marker from notes (line 2590), confirms `rejected` is a good token (line 2596-2599), and PASSes. Crucially, if a decrypt-capable engine had *returned output* for this unsupported scheme, the no-marker branch (lines 2607-2617) would FAIL it — so the gate genuinely punishes over-claiming. The header comment in `capability-findings.ts:6-7` confirms "returning a decrypted output for one of these rows is suspicious and fails."
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1625-1626` — a real, pre-I/O allow-list throw for unsupported schemes. No canned output, no input->output copy, no golden short-circuit, no swallowed error. The engine's declared encryption set deliberately excludes cens (mediabunny declares only cenc-ctr/cenc-cbcs/hls-aes128, lines 1031-1093). Runner-up ffmpeg.wasm reject at `src/engines/ffmpeg-wasm/adapter.ts:2109-2113` is equally genuine.
- **Cached note:** Both PASS results have `cached==true` (mediabunny 11 ms, ffmpeg.wasm 233 ms). The evidence is reused from a prior run, not freshly re-executed; staleness risk is low because the path is a static scheme allow-list (deterministic), but the wall numbers should not be over-trusted as fresh measurements.

**Verdict: WEAK-GATE.** The PASS is real (real fixture, real pre-I/O scheme-rejection code in both winners, an oracle that genuinely fails over-claiming engines), but the gate is a `graceful-failure` rejection contract, not a bit-exact/crypto correctness gate. It proves "rejects unsupported cens cleanly," not "decrypts cens correctly" — by design, since no cens corpus exists. Strength of evidence is intrinsically limited by the negative nature of the test.

## Confidence & caveats

- **Confidence: high** on the verdict structure (2 PASS, 5 honest NA) and on mediabunny as winner: the decisive 11 ms vs 233 ms gap is unambiguous and the rejection code paths are verified in source.
- The win is on a *negative* scenario; mediabunny is not demonstrated superior at actually decrypting cens (nobody can — no asset). It is superior at cheaply and cleanly refusing it.
- Both winners' wall figures are single cached `durationMs` values with no `bench{}` distribution (no median/p95/mad/n), so the 21x margin is directional, not statistically robust.
- All measurements physically plausible: sub-second rejection of a 2.2 MB MP4 with an early allow-list throw; no decoded-frame/SSIM/byte claims to scrutinise (correctly absent for a reject test).
