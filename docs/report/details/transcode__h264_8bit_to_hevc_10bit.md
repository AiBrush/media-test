# transcode/h264_8bit_to_hevc_10bit

- **Family:** transcode
- **Fixture asset:** `micro_h264_1frame.mp4` (320×240 one-frame H.264-in-MP4, 5.5 KB, `fixtures/media/`)
- **Primary metric:** none recorded (no engine ran — all NA)
- **Pass count:** 0 / 7

## Verdict

**Best framework: NONE.** No engine produced a PASS — every one of the 7 frameworks was gated out as `NA_ENGINE` before any oracle could run. This is **uncontested** in the trivial sense (nothing to contest) and the decisive factor is **capability gating**: the scenario requires emitting **HEVC 10-bit** output (`feature: 'depth:10bit-output'`), and no engine in the Chrome-149 / single-thread-wasm environment declares it. There is no runner-up margin to report because no engine reached the benchmark phase (empty `bench`, no `oracleOutcomes`, no `durationMs`).

The NA is split into two distinct, honest sub-reasons:
- **Three engines never declare the `transcode` operation at all** (mp4box, remotion-media-parser, web-demuxer) → gated at runner.ts:119.
- **Four engines declare `transcode` but not the `depth:10bit-output` feature** (mediabunny, platform/Chrome WebCodecs, ffmpeg-wasm, remotion-webcodecs) → gated at runner.ts:173.

## Per-engine results

| Engine | Status | Oracles passed | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'depth:10bit-output' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'depth:10bit-output' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'depth:10bit-output' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'depth:10bit-output' |

All seven entries carry empty `oracleOutcomes:[]` and no `bench`/`durationMs`, exactly as expected for a Pass-1 capability rejection (the runner returns before the execute/oracle phase).

## Why the winner wins (deep technical)

There is no winner, so this section explains **why the operation is genuinely infeasible for every framework** for this specific codec/container/operation, which is the substantive finding.

The operation is an **8-bit → 10-bit transcode**: decode H.264 (8-bit 4:2:0) from an MP4 and **re-encode to HEVC Main 10 (10-bit 4:2:0) inside MP4**. The scenario's `requires` block (src/scenarios/transcode/index.ts:882-888) demands `operations:['transcode']`, `videoCodecs` including both `h264` and `hevc`, and crucially `features:['depth:10bit-output']`. The encode side is the hard constraint: producing an HEVC bitstream whose VPS/SPS advertise `bit_depth_luma_minus8 = 2` (10-bit) and a 10-bit profile (Main 10, profile_idc 2).

Mechanistically, this fails on three independent grounds across the field:

1. **WebCodecs engines (platform/Chrome-149, mediabunny, remotion-webcodecs).** Chrome's `VideoEncoder` HEVC support is not a general capability — HEVC encode is hardware/platform-gated and, where available, overwhelmingly 8-bit (`hev1`/`hvc1` Main, not Main 10). None of these adapters lists `depth:10bit-output` in its declared feature set (mediabunny adapter.ts:1046+, platform adapter.ts:272+, remotion-webcodecs adapter.ts:274). They *do* declare `transcode`, so the runner advances past the operation check and rejects on the feature check at runner.ts:171-173. This is the spec-faithful behaviour described in runner.ts:181-186: an engine that declares a feature must be able to configure the browser for it; an engine that cannot emit 10-bit HEVC honestly omits the feature rather than declaring it and failing a downstream `VideoEncoder.isConfigSupported` call.

2. **ffmpeg.wasm@0.12.15.** This is the most informative NA. ffmpeg-wasm declares `transcode:true` (adapter.ts:1455-1464) and is otherwise the most capable transcoder in the suite, but its feature list (ffmpeg-wasm/adapter.ts:1494) declares only **`depth:10bit-to-8bit`** ("verified 10-bit source decode to 8-bit H.264 encode via pix_fmt") and deliberately **omits `depth:10bit-output`**. The reason, captured in the scenario notes (index.ts:837-839: "remains N/A until an engine can emit HEVC-10 inside suite budgets"): the wasm libx265 10-bit encode path is either absent from this build or far too slow/memory-heavy for the single-thread wasm runtime within the suite's per-scenario budget. So it gates at runner.ts:173 with the feature reason — an honest declaration, not a silent failure.

3. **Demux/parse-only engines (mp4box, remotion-media-parser, web-demuxer).** These three never claim to transcode at all. They are container parsers / demuxers; their `operations` maps set `transcode` falsey. The runner rejects them first, at runner.ts:119, with "does not declare operation 'transcode'". This is correct: mp4box's own adapter header (mp4box/adapter.ts:7) states it implements "exactly four operations" and explicitly throws on undeclared ops (adapter.ts:946) so a mis-wired runner fails loudly rather than faking a result.

The net effect is that the cross product of (HEVC encoder availability) × (10-bit pixel-format support) × (suite time/memory budget) is empty for every framework in this environment. The shard correctly records all 7 as NA rather than manufacturing a PASS.

## What each other framework did wrong

Since there is no winner, every engine is a "non-winner." None did anything *wrong* — each NA looks honest:

- **mp4box@2.3.0** — NA_ENGINE, "does not declare operation 'transcode'". Honest: it is a pure MP4 parser/remuxer with no encoder; gated at runner.ts:119.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "does not declare operation 'transcode'". Honest: it is a parser only, no encode path; gated at runner.ts:119.
- **web-demuxer@4.0.0** — NA_ENGINE, "does not declare operation 'transcode'". Honest: demux-only (libav demuxer in wasm), no encoder; gated at runner.ts:119.
- **mediabunny@1.48.0** — NA_ENGINE, "does not declare feature 'depth:10bit-output'". Honest: declares transcode (WebCodecs-backed) but no 10-bit HEVC encode; gated at runner.ts:173.
- **platform@chrome-149** — NA_ENGINE, "does not declare feature 'depth:10bit-output'". Honest: raw WebCodecs `VideoEncoder` has no reliable HEVC Main 10 config in Chrome-149; gated at runner.ts:173.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "does not declare feature 'depth:10bit-output'". Honest: WebCodecs transcoder, feature list (adapter.ts:274) excludes 10-bit output; gated at runner.ts:173.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE, "does not declare feature 'depth:10bit-output'". Honest and intentional: declares `depth:10bit-to-8bit` only (adapter.ts:1494) because HEVC-10 wasm encode is out of suite budget; gated at runner.ts:173.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/transcode/index.ts:829-840 (case in `DEPTH_HDR_CASES`), wired into a `Scenario` at index.ts:876-889. Requires `operations:['transcode']`, `videoCodecs:['h264','hevc']`, `features:['depth:10bit-output']`.
- **Fixture:** `asset: 'micro_h264_1frame.mp4'` → exists on disk at `fixtures/media/micro_h264_1frame.mp4`, 5.5 KB, a real browser-baked 320×240 single-frame H.264/MP4 fixture (not synthetic/empty/mock). The input is genuine.
- **Oracle:** the scenario falls through to the default `oracles: ['ssim-psnr','playback-smoke']` (index.ts:889). These are real comparison oracles in src/core/oracles.ts, but **they never ran** — all engines were rejected in capability negotiation (runner.ts Pass 1) before the execute/oracle phase, so `oracleOutcomes` is empty for all 7. There is no PASS to validate, hence no loose-tolerance / smoke-only PASS risk here.
- **Winner adapter:** N/A (no winner). The relevant honest-declaration code paths were inspected: ffmpeg-wasm/adapter.ts:1494 (`depth:10bit-to-8bit` only), platform/adapter.ts:272+, mediabunny/adapter.ts:1046+, remotion-webcodecs/adapter.ts:274 — none declares `depth:10bit-output`.
- **Cached:** none of the 7 entries carry `cached:true` (the field is absent), so there is no staleness risk; these are live NA determinations.
- **Verdict: REAL.** Real fixture file, real capability-gating logic, and a meaningful (correctness) oracle that simply never got a chance to run because the operation is genuinely infeasible. The NA is the *correct* answer, not a dodge — it matches the scenario's own documented rationale (index.ts:837-839) that this row "remains N/A until an engine can emit HEVC-10 inside suite budgets."

## Confidence & caveats

- **Confidence: high.** The shard, the scenario definition, the runner gating logic (runner.ts:119 and :173), the fixture's on-disk existence, and every engine's feature declaration were all read directly and are mutually consistent.
- **Caveat:** because no engine ran, there are zero measurements (SSIM, byte sizes, durations) to physically sanity-check — the validation rests entirely on capability declarations and gating code, not on output inspection.
- **Caveat:** this is environment-bound. The verdict is specific to Chrome-149 + single-thread wasm. A future browser exposing hardware HEVC Main 10 encode, or a multi-thread wasm libx265-10 build within budget, would let an engine declare `depth:10bit-output` and flip this row from NA to a contestable PASS. The result is a snapshot, not a permanent property of any library.
