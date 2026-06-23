# robustness/edge_seek_past_eof

- **family:** robustness
- **fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (H.264 1080p, 30 s, ~31 MB, real file on disk)
- **operation:** `seek` to `tUs = 300_000_000` (300 s, i.e. ~5 minutes past EOF of a 30 s clip; `seekEdge: 'past-eof'`)
- **primaryMetric:** wall (only `wall`, `peakMemory`, `longtasks` are declared; the shard carries no `bench{}` block, so ranking uses `durationMs`)
- **oracle:** `graceful-failure` (single declared oracle)
- **passCount:** 5 of 7 (mp4box and remotion-media-parser are NA_ENGINE)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — 5 engines PASS (web-demuxer, mediabunny, platform, ffmpeg-wasm, remotion-webcodecs), all on the *same* single oracle `graceful-failure`.
- **Correctness is a dead heat:** every passing engine satisfies exactly one oracle, `graceful-failure`, with the identical detail string "operation produced no output and did not crash/hang → handled gracefully". This is a smoke/robustness gate (the weakest rung on the ladder), so no engine can win on correctness strength — they are indistinguishable there.
- **Decisive factor:** PERFORMANCE (wall, via `durationMs`). mediabunny handled the out-of-range seek in **109 ms**, the fastest of all five.
- **Margin over runner-up (platform, 134 ms):** **1.23x faster wall**. Against the others: 4.70x faster than web-demuxer (512 ms), 32.6x faster than ffmpeg.wasm (3552 ms), 116x faster than remotion-webcodecs (12639 ms). Evidence strength is weak: `durationMs` is a single sample (n=1, no mad/p95), and the result is `cached==true`, so this is one stale measurement, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 109 ms | n/a (no bench) | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | graceful-failure:true | 134 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | graceful-failure:true | 512 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 3552 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 12639 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | — | — | — | — | engine does not declare operation 'seek' |
| remotion-media-parser@4.0.479 | NA_ENGINE | (none) | — | — | — | — | engine does not declare operation 'seek' |

No `bench{}` block is present in this shard; throughputRealtime / peakMemory / longtasks were not recorded as bench metrics for this robustness scenario, so the only quantitative discriminator is `durationMs`.

## Why the winner wins (deep technical)

**What the test actually exercises.** This is the robustness framing of seek-past-EOF (§A.16). The runner calls `engine.seek(input, 300_000_000)` on the 30 s H.264/MP4 workhorse (`src/core/runner.ts:720-721`). Per the spec the engine must either *clamp to the last decodable frame* or *return a clean error* — and crucially must NOT loop, fault, hang, or balloon memory. The verdict is purely runner-driven: a return-without-hang OR a clean throw within the time budget is graceful; only a timeout/hang FAILs (`runRobustness`, `src/core/runner.ts:1028-1046`). The `graceful-failure` oracle (`src/core/oracles.ts:2586-2623`) infers PASS from output-absence: when `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` it returns PASS (line 2608-2609). Note this check deliberately does NOT inspect `ctx.seek`, so a clean clamp-return (which populates only `ctx.seek`) and a clean throw (which populates nothing) BOTH land on PASS — exactly as the scenario notes describe (`src/scenarios/robustness/index.ts:521-525`). The detail string "operation produced no output" on all five engines indicates each engine either threw cleanly or returned a clamp object that the oracle does not count as "output" — both are correct robustness behavior.

**Why mediabunny is fastest.** mediabunny ran on the WebCodecs backend with hardware preference (`env.configUsed.backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `coopCoep:"not-required"`, `wasmThreads:0`). Its seek path (`src/engines/mediabunny/adapter.ts:1415-1436`) opens the input, grabs the primary video track, builds a `VideoSampleSink`, and calls `sink.getSample(300)` (targetSec = 300_000_000/1e6). For a target 270 s beyond the 30 s duration, mediabunny's sample sink resolves against the sample table and either returns the last sample or returns nothing → the adapter throws `mediabunny seek: no frame at 300000000us` (line 1424). That throw is caught by the runner as the graceful success condition. The whole path is metadata/sample-table-bound — it parses the moov, locates the (nonexistent) target in the index, and returns — without spinning up a heavyweight decode session or a wasm core, which is why it finishes in **109 ms**, edging out Chrome's own platform path (134 ms, also pure WebCodecs but with more per-call setup around `VideoDecoder` + canvas/webgpu pixel transfer).

**Why the wasm/heavier engines are far slower.** ffmpeg.wasm (3552 ms) must instantiate its wasm core and run libavformat seek logic single-threaded (no SAB, no threads) before it can determine the target is out of range — a fixed multi-second tax. remotion-webcodecs (12639 ms) carries the heaviest streaming-backpressure conversion pipeline with worker setup and its own demux fast-paths; for an out-of-range seek that machinery is pure overhead. web-demuxer (512 ms) clamps `targetSec` to `durationSec - 0.001` (`src/engines/web-demuxer/adapter.ts:973`) and then spins up a real `VideoDecoder`, reads the keyframe range with `AV_SEEK_FLAG_BACKWARD`, and decodes a frame — heavier than mediabunny's sink-only path, hence ~4.7x slower, but still graceful.

## What each other framework did wrong

- **platform@chrome-149 (PASS, lost on perf):** correct and graceful, but 134 ms vs 109 ms = **1.23x slower wall**. Its decode/pixel path (`VideoDecoder` + `webgpu>webgl>offscreen2d` transferable transfer) adds per-call setup that mediabunny's sample-sink avoids. Only difference is speed; correctness identical (graceful-failure:true).
- **web-demuxer@4.0.0 (PASS, lost on perf):** graceful, but **4.70x slower** (512 ms). It clamps to `durationSec-0.001` (`adapter.ts:973`) and actually decodes the clamped keyframe through a real `VideoDecoder` (`adapter.ts:980-1010`) instead of short-circuiting an out-of-range target, paying a decode cost mediabunny does not.
- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** graceful, but **32.6x slower** (3552 ms) — dominated by single-thread wasm core instantiation and libav seek (no threads / no SharedArrayBuffer).
- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** graceful, but **116x slower** (12639 ms) — the streaming-backpressure conversion pipeline + worker/writer scaffolding is enormous overhead for a seek that resolves to "out of range".
- **mp4box@2.3.0 (NA_ENGINE):** honest NA. It declares only probe/demux (+remux-class), not `seek` (`src/engines/mp4box/adapter.ts:634-639`, comment line 946: "Undeclared operations: mp4box does none of these"). Pure-JS parser/demuxer with no decoder, so it cannot produce the RGBA FrameDigest the seek contract needs. Capability gate `requires.operations:['seek']` is unsatisfied → NA. Not an under-declaration.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** honest NA. It can resolve a read-side keyframe but has no decoder, so it cannot return the pixel FrameDigest the suite's seek()/seek-accuracy contract requires; it explicitly leaves `seek` undeclared and its `seek()` throws rather than fabricate (`src/engines/remotion-media-parser/adapter.ts:12-13, 561-567`). Genuine capability gap, not hidden capability.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:540-553` (case `edge_seek_past_eof`) → mapped to a `Scenario` at `src/scenarios/robustness/index.ts:568-584` with `op:'seek'`, `options:{tUs:300_000_000, seekEdge:'past-eof'}`, `oracles:['graceful-failure']`.
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` — REAL file, ~31 MB, present on disk (`stat` confirmed). Not synthetic/empty/mock. The input is a legitimate H.264-in-MP4 clip; only the seek *target* is out of range, which is the intended edge.
- **Oracle:** `graceful-failure` at `src/core/oracles.ts:2586-2623`. It performs a real runner-signal check: PASS only when the op produced no output AND did not time out (`src/core/runner.ts:1028-1046` routes a hang to FAIL/'timeout'). It is NOT trivially satisfiable in the catastrophic direction — a hang/timeout FAILs. It IS, however, a smoke/robustness gate: no golden comparison, no SSIM, no packet/keyframe count check; "did not crash within budget" is the whole test. Appropriate for a robustness edge case but the weakest oracle rung.
- **Winner adapter:** mediabunny `seek` at `src/engines/mediabunny/adapter.ts:1415-1436` — genuinely calls the real library (`openInput`, `getPrimaryVideoTrack`, `new VideoSampleSink(...)`, `sink.getSample(targetSec)`). No canned output, no copy-input-to-output, no short-circuit to a golden, no error swallowing — an out-of-range target makes `getSample` return null and the adapter throws (line 1424), which the runner records as the graceful success.
- **Measurement plausibility:** physically plausible. mediabunny 109 ms and platform 134 ms are realistic for a metadata/index-bound out-of-range seek on WebCodecs; ffmpeg.wasm 3552 ms matches wasm-core instantiation cost; remotion-webcodecs 12639 ms matches its heavy pipeline. No impossible numbers.
- **Cached note:** ALL FIVE PASS results have `cached==true` ("cached previous PASS result"). The verdict and the 109-ms winning margin are reused, not freshly re-run; per the launcher seeding caveat, stale PASS reuse is a known staleness risk. The performance ordering should be re-confirmed on a fresh run before treating the 1.23x margin as durable.
- **Verdict:** **WEAK-GATE.** Real fixture + real mediabunny implementation + a real (non-trivial-in-the-bad-direction) oracle, but the oracle is a smoke/robustness gate (no golden/correctness comparison), and the winner is separated from the runner-up only by a single cached `durationMs` sample. The PASS is real; the *strength* of the gate and the margin evidence are weak.

## Confidence & caveats

- **Confidence: medium.** The NA/PASS split and the honest-NA reasoning are solid (verified in adapter source). The winner is unambiguous on the only available discriminator (wall), but that discriminator is one cached sample with no mad/p95/n distribution, and correctness is a 5-way tie on a smoke oracle.
- **Caveats:** (1) No `bench{}` block — ranking rests entirely on `durationMs`. (2) All winning results are cached; re-run for an honest fresh ordering (clear raw + `.browser-cache`). (3) The 1.23x mediabunny-over-platform margin is small and could invert on a fresh run; the >4.7x gaps over web-demuxer/ffmpeg.wasm/remotion-webcodecs are large enough to be robust regardless. (4) The oracle cannot distinguish "clean clamp-return" from "clean throw" — both pass — so this scenario does not assert *which* graceful strategy each engine used (the golden-anchored decode-seek seek_past_eof scenario covers exact clamp landing).
