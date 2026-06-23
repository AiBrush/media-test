# decode-seek/seek_negative

family: decode-seek | fixture asset: `h264_1080p_30s.mp4` (H.264 in MP4, faststart progressive) | primaryMetric: seekMs | passCount: 5 / 7

## Verdict
- **Best framework: mediabunny@1.48.0** — CONTESTED win (5 of 7 engines PASS).
- All 5 PASS engines pass the *identical* gating oracle with *identical* strictness: `seek-accuracy` with `landedPtsUs=0`, `seekDeltaUs=0`, `expectedPtsUs=0`, i.e. an exact (0µs tolerance) landing on the first keyframe. Correctness is therefore a dead tie; the decisive factor is **performance**.
- **Decisive factor: wall/seek latency.** mediabunny seeks in **45.14 ms** (primaryMetric `seekMs` = `wall`), the fastest of all five.
- **Margin over runner-up (platform@chrome-149, 97.56 ms): 2.16x faster wall.** Also 0.55x platform's longtasks blocking (173 ms vs 1182 ms). Further down the field: 2.85x faster than ffmpeg.wasm (128.79 ms), 4.93x faster than web-demuxer (222.58 ms), 38.9x faster than remotion-webcodecs (1756.78 ms).

## Per-engine results
| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:true | 45.14 | n/a | n/a | 173 | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:true | 97.56 | n/a | n/a | 1182 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:true | 128.79 | n/a | n/a | 12909 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:true | 222.58 | n/a | n/a | 1007 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:true | 1756.78 | n/a | n/a | 555 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

No engine reports throughputRealtime or peakMemory for this scenario; the bench block carries only `seekMs`/`wall` and `longtasks`.

## Why the winner wins (deep technical)
This scenario is an **edge-case correctness gate** dressed as a seek: target `tUs = -5_000_000` (−5 s) against a 30 s H.264/MP4 clip. The contract (scenario notes, index.ts:570-573) is that a negative timestamp must **clamp to 0 and land on the first keyframe (pts 0), gracefully — never throw on the sign, never seek "before" the start**, with `seekToleranceUs: 0`. Because the asset is faststart H.264 in MP4, the first sample (pts 0) is an IDR keyframe, so the only correct answer is `landedPtsUs == 0`.

mediabunny achieves this in its `seek()` adapter at `src/engines/mediabunny/adapter.ts:1422`: `const targetSec = Math.max(0, tUs / 1e6);` — the negative input is clamped to `0` *before* it ever reaches the library. It then constructs a `VideoSampleSink` over the primary video track (adapter.ts:1421) and calls `sink.getSample(0)` (adapter.ts:1423), which returns the last frame with start ≤ 0, i.e. the pts-0 IDR. `sample.microsecondTimestamp` is reported as `landedPtsUs` (adapter.ts:1426). The shard confirms the exact result: `landedPtsUs=0`, oracle delta `0µs`. Correctness here is unbeatable (0µs is the floor), so mediabunny does not win on accuracy — it wins on cost.

Mechanistically, mediabunny runs `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `wasmThreads: 0` (from env.configUsed). For a seek-to-keyframe-0, mediabunny's `VideoSampleSink` only needs to (a) parse the MP4 sample table, (b) locate the first IDR (already pts 0), and (c) hand that single coded sample to a hardware `VideoDecoder` for one decode. There is no GOP walk (the target is the very first keyframe), and no whole-file buffering thanks to the streaming pipeline. That yields the **45.14 ms** wall and only **173 ms** of long-task main-thread blocking — the lowest blocking of any engine here. The win is on n=1 (single sample, mad=0), so the magnitude is soft evidence, but the *ordering* is robust because the gaps are large (2.16x to the runner-up, ~39x to the slowest) and reflect structural differences, not noise.

By contrast, `platform@chrome-149` (the runner-up) drives the raw browser stack: `decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`, `pixelBackend: webgpu>webgl>offscreen2d`. Its **97.56 ms** and especially its **1182 ms** of longtasks reflect heavier per-seek setup (decoder configure + canvas/GPU readback plumbing) for what is ultimately the same one-keyframe decode. ffmpeg.wasm pays the wasm tax: **128.79 ms** wall and a catastrophic **12909 ms** longtasks figure — the single-thread wasm core (`wasmThreads: 0`) blocks the main thread heavily even though it lands the seek perfectly. web-demuxer (**222.58 ms**) and remotion-webcodecs (**1756.78 ms**) are correct but progressively slower; remotion-webcodecs' `streaming-backpressure` + `bufferWriter` + main-thread convert path is ~39x mediabunny's latency, the worst of the PASS set.

## What each other framework did wrong
- **platform@chrome-149** — PASS, but lost on performance: 97.56 ms vs 45.14 ms (**2.16x slower wall**) and 1182 ms vs 173 ms longtasks (6.8x more main-thread blocking) for the same exact `landedPtsUs=0` result. Heavier VideoDecoder-configure + GPU/canvas readback per seek.
- **ffmpeg.wasm@0.12.15** — PASS, lost on performance: 128.79 ms wall (**2.85x slower**) and a 12909 ms longtasks figure (single-thread wasm, `wasmThreads:0`) that would freeze the UI; correct clamp via `Math.max(0, tUs/1e6)` at ffmpeg-wasm/adapter.ts:2750.
- **web-demuxer@4.0.0** — PASS, lost on performance: 222.58 ms wall (**4.93x slower**). Clamps correctly at web-demuxer/adapter.ts:972 (`Math.max(0, tUs/1e6)`).
- **remotion-webcodecs@4.0.479** — PASS, lost on performance by the widest margin: 1756.78 ms wall (**38.9x slower**). Clamps at remotion-webcodecs/adapter.ts:743 (`Math.max(0, tUs)`); slow streaming-backpressure + main-thread convert path.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'seek'". Honest NA — mp4box is a demuxer/box parser with no frame-decode/seek capability; it cannot land on a decoded keyframe, so the seek op is genuinely undeclared, not under-declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'seek'". Honest NA — media-parser is a parse-only library (no decode-and-seek surface); the NA is legitimate.

## Anti-cheat validation
- **Scenario:** `src/scenarios/decode-seek/index.ts:561-573` (id `seek_negative`). Input is the REAL fixture `h264_1080p_30s.mp4`, confirmed present at `fixtures/media/h264_1080p_30s.mp4` (31 MB on disk). Not synthetic/empty. `tUs = -5_000_000`, `keyframe: true`, `edge: 'negative'`, `tolerances.seekToleranceUs: 0`. Notes (index.ts:570-573) state the negative target must clamp to 0 / first keyframe gracefully.
- **Oracle:** `seek-accuracy` at `src/core/oracles.ts:2199-2234`. It computes `expectedPtsUs` from real golden video packets via `expectedSeekPtsUs` → `keyframeAtOrBefore` (oracles.ts:2236-2257); for a negative request with no keyframe at-or-before, it falls back to the *earliest* keyframe (pts 0). It then asserts `|landedPtsUs − expectedPtsUs| ≤ seekToleranceUs` with tolerance `0`. This is a strict, non-trivial timestamp comparison against goldens — NOT smoke-only and NOT a wide tolerance. Measurements (`landedPtsUs=0, seekDeltaUs=0, expectedPtsUs=0`) are physically correct for clamping a −5 s seek to the pts-0 IDR of a faststart MP4.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1415-1436`. The op is genuinely implemented — it opens the real input, gets the primary video track, builds a `VideoSampleSink`, and calls `sink.getSample(Math.max(0, tUs/1e6))`. The `Math.max(0, …)` at line 1422 is the actual clamp under test; no canned output, no golden short-circuit, no swallowed error (it throws if no sample). Operation `seek: true` is declared at adapter.ts:1028.
- **Cached note:** ALL five PASS results carry `cached: true` ("cached previous PASS result"). Evidence is reused, not freshly re-run, so absolute timings carry staleness risk (and per the launcher-seeding caveat, stale PASS reuse is a known pitfall). The *ordering* and the *correctness* (0µs landing) are robust regardless, and the win margins (2.16x–39x) far exceed any plausible cache jitter.
- **Verdict: REAL.** Real 31 MB H.264/MP4 fixture + genuine WebCodecs-backed seek implementation with the actual negative-clamp under test + strict 0µs golden-keyed oracle that lands on the exact expected pts.

## Confidence & caveats
- **Confidence: medium-high.** Correctness verdict is unambiguous (exact 0µs landing, strict oracle, real fixture, real code path). Performance ranking is driven by n=1 single-sample benches (mad=0, no spread), so absolute ms are soft; however the gaps are large and structural, making the ordering trustworthy.
- All five PASS results are `cached:true` — a fresh re-run would strengthen the timing evidence; clear raw + `.browser-cache` for an honest re-measure.
- This is a clamp/edge gate, not a deep mid-GOP seek; mediabunny's advantage here (first-keyframe, no GOP walk) may not generalize to arbitrary non-keyframe seek targets.
