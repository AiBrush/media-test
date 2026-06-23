# robustness/fuzz_adts_aac_bitflip_probe

family: robustness | fixture asset: `fuzz_adts_aac_bitflip.aac` (raw ADTS/AAC, 164 KB, exists in fixtures/media/) | primaryMetric: wall | passCount: 4 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 4 engines PASS: mediabunny, remotion-webcodecs, remotion-media-parser, ffmpeg.wasm).
- All four PASSing engines satisfy the SAME single oracle (`graceful-failure`) at the SAME strictness — there is no correctness differentiator (no bit-exact / structural / perceptual ladder distinction here; the gate is "did not crash/hang, output absent OR allowed-partial"). Correctness is therefore comparable across all four.
- **Decisive factor: performance.** The scenario's primaryMetric is `wall`; no `bench{}` block was emitted (cached graceful results carry only `durationMs`), so ranking falls to `durationMs` (wall proxy). mediabunny completed in **9 ms**, the fastest of the four.
- **Margin over runner-up (remotion-webcodecs, 19 ms): 2.1x faster wall.** vs remotion-media-parser (22 ms): 2.4x. vs ffmpeg.wasm (130 ms): 14.4x.
- Evidence strength caveat: this is a single-sample (`n` not reported; cached) timing on tiny inputs at the millisecond floor — the margin is real but low-resolution. Mediabunny additionally carries the cleanest config (pure-TS ESM, `coopCoep: not-required`, no SharedArrayBuffer), which is a structural tiebreaker in its favor.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 9 ms (durationMs) | n/a | n/a | n/a | cached previous PASS; returned partial/safe output, no crash/hang |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 19 ms (durationMs) | n/a | n/a | n/a | cached: graceful: Invalid syncword: 2914 |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:pass | 22 ms (durationMs) | n/a | n/a | n/a | cached: graceful: Invalid syncword: 2914 |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 130 ms (durationMs) | n/a | n/a | n/a | cached previous PASS; partial/safe output, no crash/hang |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |

No `bench{}` object was present in the shard for any engine; throughputRealtime / peakMemory / longtasks were not recorded for these cached graceful-failure runs, so wall (durationMs) is the only quantitative axis.

## Why the winner wins (deep technical)

The operation is **probe** on a **raw ADTS-framed AAC** elementary stream (`fuzz_adts_aac_bitflip.aac`) whose bytes have been bit-flipped so that ADTS frame headers carry corrupt 12-bit syncwords and/or wrong `aac_frame_length` fields. ADTS has no container index: a prober must linearly scan, locating each 7/9-byte header by its `0xFFF` syncword and advancing by the header's self-declared frame length. The failure mode the scenario targets (notes, src/scenarios/robustness/index.ts:838-840) is a prober that either **loops forever** on a zero/garbage frame length or emits garbage metadata that downstream code trusts. The gate is `graceful-failure` with `options.gracefulAllowOutput: true` (index.ts:837), so an engine PASSes by either throwing cleanly OR returning a safe/partial probe — as long as it does not crash, hang, or OOM within `FUZZ_TIMEOUT_MS`.

mediabunny's probe path is genuine: `probe()` opens the input via `openInput` and delegates to `metadataFromInput` (src/engines/mediabunny/adapter.ts:1134-1141), which drives mediabunny's real ADTS input-format parser. The adapter routes container detection to `'adts'` for `.aac`/adts names (adapter.ts:291) and declares `adts` in `containersIn` (adapter.ts:1036), so the runner does NOT mark it NA. On this corrupt stream mediabunny's parser bounds its header scan and returns partial/safe metadata rather than looping — recorded outcome: *"operation returned partial/safe output and did not crash/hang"* — which `gracefulAllowsReturnedOutput` (oracles.ts:2625-2628, keyed on `options.gracefulAllowOutput === true`) converts to PASS via oracles.ts:2611-2612.

The two Remotion engines reach the same verdict by the other branch: they THREW with `Invalid syncword: 2914` (i.e. media-parser's ADTS reader detected a non-`0xFFF` syncword and rejected), the runner caught the throw and left output absent, and the oracle PASSes via oracles.ts:2607-2609 ("no output → handled gracefully"). ffmpeg.wasm likewise returned partial/safe output. All four are legitimate, distinct graceful handlers.

Because every PASSing engine clears the identical oracle at identical strictness (a smoke-grade robustness gate — there is no golden, no SSIM, no bit-exact comparison to separate them), section A.4(a) correctness ranking produces a tie, and the decision drops to A.4(b) performance. On `wall` (durationMs): mediabunny **9 ms** beats remotion-webcodecs **19 ms (2.1x)**, remotion-media-parser **22 ms (2.4x)**, and ffmpeg.wasm **130 ms (14.4x)**. mediabunny's edge is mechanistically consistent with its config (`backend: pure-ts-esm`, `streaming-lockstep`, `coopCoep: not-required`): it parses ADTS headers in a tight TypeScript scan with no wasm module instantiation or worker round-trip, whereas ffmpeg.wasm pays a wasm-runtime probe cost (130 ms) for the same trivial header scan. Tiebreak A.4(c) also favors mediabunny: no COOP/COEP requirement, no SharedArrayBuffer, streaming reader.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS but lost on perf: 19 ms vs 9 ms = **2.1x slower wall**. Threw cleanly (`Invalid syncword: 2914`); correctness identical, no oracle advantage.
- **remotion-media-parser@4.0.479** — PASS but lost on perf: 22 ms vs 9 ms = **2.4x slower wall**. Same clean throw on the corrupt syncword (`cpu-js` / streaming `webReader`); no correctness differentiator.
- **ffmpeg.wasm@0.12.15** — PASS but slowest: 130 ms vs 9 ms = **14.4x slower wall**, attributable to wasm runtime overhead for a header-only scan; returned partial/safe output, no correctness edge.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'adts'". HONEST NA — WebCodecs has no demuxer; the browser cannot parse a raw ADTS elementary stream container, only decode AAC access units once demuxed. Correct under-capability declaration, not a dodge.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare input container 'adts'". HONEST — MP4Box.js is an ISO-BMFF (MP4) box parser; raw ADTS is out of scope by design.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare input container 'adts'". Plausibly honest given its declared container set, though web-demuxer wraps FFmpeg and could in principle read ADTS; absent an `adts` declaration the runner correctly gates it NA. No evidence of a faked pass either way.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/robustness/index.ts:832-841 (case `fuzz_adts_aac_bitflip_probe`); mapped to a Scenario at index.ts:881-900 with `op: 'probe'`, `containersIn: ['adts']`, `audioCodecs: ['aac']`, `oracles: ['graceful-failure']`, `options.gracefulAllowOutput: true`.
- **Fixture:** `fuzz_adts_aac_bitflip.aac` exists in fixtures/media/ (164 KB real file, not empty/synthetic/mock). The notes describe a legitimate bit-flip corruption of a real ADTS stream — a real degraded-input fixture.
- **Oracle:** `graceful-failure` at src/core/oracles.ts:2586-2628. It does a real liveness/output check: PASS only if (a) output absent after a caught throw (2607-2609) or (b) `gracefulAllowOutput` explicitly set (2611-2612, 2625-2628); a crash/hang/timeout/oom would FAIL (2592-2594) and producing trusted output WITHOUT the allow-flag would FAIL (2614-2617). It is correctly NOT a bit-exact/structural gate — appropriate for a fuzz/robustness probe, but it IS a smoke-grade gate that cannot distinguish quality among survivors.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1134-1141 (`probe` -> `metadataFromInput`), container routing adapter.ts:291, declaration adapter.ts:1036. Genuine real-library call; no canned output, no copy-input-to-output, no short-circuit to a golden, no error-swallow-then-fake-success. The "partial/safe output" comes from mediabunny's actual bounded ADTS parse.
- **Cached:** ALL four PASSing results are `cached: true` (mediabunny startedAtIso 2026-06-22T16:53). Evidence is reused, not freshly re-run — staleness risk noted; the 9 ms timing in particular is a stale single sample.
- **Verdict: WEAK-GATE.** Real fixture + real mediabunny probe implementation + a genuinely-evaluated oracle, BUT the gate is `graceful-failure` (smoke-grade survival, not a correctness comparison). The PASS is real; it just is not strong, and the winner is decided purely on a low-resolution cached wall margin rather than on any correctness superiority.

## Confidence & caveats

- Confidence: **medium.** The winner selection is robust on the stated decision procedure (only wall available; mediabunny clearly lowest; honest NAs for the three non-starters), but the gate is smoke-grade and the deciding metric is a single cached millisecond-floor sample with no `bench` spread (no `n`, mad, p95).
- All four survivors are functionally equal at the oracle level; "best" here means "fastest graceful handler," not "most correct." If `bench{}` (memory/longtasks) were available, the ranking could shift, though mediabunny's pure-TS, no-COOP/COEP profile would likely still lead.
- web-demuxer's NA is the only NA with mild ambiguity (FFmpeg backend could theoretically read ADTS); it is gated honestly by its declaration, but its capability set could be re-examined.
