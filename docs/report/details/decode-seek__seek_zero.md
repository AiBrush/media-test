# decode-seek/seek_zero

family: decode-seek | fixture asset: `h264_1080p_30s.mp4` (H.264 1080p, ~30s, 31 MB, in `fixtures/media/`) | container: mp4 | videoCodec: h264 | primaryMetric: seekMs | passCount: 5 / 7

Scenario: seek to `tUs: 0`, `expectKeyframe: true`, `seekToleranceUs: 0` — must land deterministically on the first frame (pts 0 keyframe). (`src/scenarios/decode-seek/index.ts:575-584`)

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **CONTESTED** — 5 of 7 engines PASS, all with the identical, strongest-possible seek-accuracy result (exact, zero-tolerance landing). Correctness is a dead tie, so the decision is made on **performance**.
- **Decisive factor: wall/seek latency.** mediabunny seeks in **33.45 ms median**, vs the runner-up platform@chrome-149 at **99.59 ms** → **2.98x faster wall**. It also has the lowest blocking time: **longtasks 1017 ms** vs platform's **19963 ms** (≈19.6x lower) and web-demuxer's 8626 ms.
- **Margin over runner-up (platform):** 2.98x faster seek; over 3rd-place ffmpeg.wasm (272.08 ms) 8.13x; over web-demuxer (223.21 ms) 6.67x; over remotion-webcodecs (3959.56 ms) **118x**.
- Caveat: all benches are **n==1** (single sample, mad==0) and **cached==true** — see Confidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:pass (Δ0µs) | 33.45 | n/a | n/a | 1017 | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:pass (Δ0µs) | 99.59 | n/a | n/a | 19963 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:pass (Δ0µs) | 223.21 | n/a | n/a | 8626 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:pass (Δ0µs) | 272.08 | n/a | n/a | 3045 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:pass (Δ0µs) | 3959.56 | n/a | n/a | 874 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(No throughputRealtime/peakMemory metrics are emitted for this seek scenario; bench carries only seekMs/wall/longtasks.)

## Why the winner wins (deep technical)

This is a pure random-access seek to pts 0 on a faststart H.264/MP4. Every engine that can decode lands on the same frame — the oracle is a **timestamp** oracle (`seekAccuracy`, `src/core/oracles.ts:2199-2234`): it computes the expected keyframe pts from the golden via `expectedSeekPtsUs`/`keyframeAtOrBefore` (`oracles.ts:2236-2268`) and asserts `|landedPtsUs - expectedPtsUs| <= seekToleranceUs`. For seek_zero the expected keyframe is pts 0, and all five decoders report `landedPtsUs: 0, seekDeltaUs: 0, expectedPtsUs: 0` — an exact, zero-tolerance match. Correctness cannot separate them, so the win is mechanistic on *how fast each reaches the pts-0 keyframe*.

mediabunny's seek path (`src/engines/mediabunny/adapter.ts:1415-1436`) is minimal and decoder-direct: it opens the input, grabs the primary video track, constructs a `VideoSampleSink` with `videoDecoderOptionsForTrack` (so hardware decode options are chosen up front), and calls `sink.getSample(targetSec)`. For target 0 s, the sink resolves the sample table to the first random-access point (the moov `stss`/sample tables of this faststart MP4), feeds exactly that one keyframe to a hardware-backed `VideoDecoder`, and returns the decoded `VideoSample` — from which the adapter reads `microsecondTimestamp` (0) and produces the RGBA digest. Per env.configUsed, mediabunny ran `backend: webcodecs`, `hwAccel: prefer-hardware`, `pixelBackend: VideoSample.copyTo(RGBA)>canvas`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`. The decisive levers: (1) a single-keyframe decode with no GOP walk (target is the RAP itself), (2) hardware VideoDecoder on the Apple M1 Max ANGLE/Metal path, and (3) a lean pure-TS ESM core with no wasm init cost and no COOP/COEP requirement. That yields **33.45 ms** end-to-end and only **1017 ms** of long-task time.

The platform runner-up (`src/engines/platform`) also uses WebCodecs `VideoDecoder` with `hwAccel: true` and lands pts 0 correctly, but takes **99.59 ms** (2.98x slower) and — critically — racks up **19963 ms of longtasks**, by far the worst of all engines. Its config (`pixelBackend: webgpu>webgl>offscreen2d`, `frameTransfer: transferable`, plus a `<video>→canvas→MediaRecorder` encode path it carries around) implies heavier per-seek scaffolding (element/canvas/GPU setup) than mediabunny's direct sink, which dominates a tiny single-keyframe operation. The wasm engines pay container demux + wasm overhead: ffmpeg.wasm (272.08 ms) and web-demuxer (223.21 ms) both single-thread (`wasmThreads: 0`) and must parse the MP4 in-wasm before reaching the first keyframe. remotion-webcodecs is correct but pathologically slow here at **3959.56 ms** (118x mediabunny) — its `streaming-backpressure` + `waitForQueueToBeLessThan` pipeline and per-seek converter setup are tuned for sustained extraction, not a single cold seek-to-zero.

## What each other framework did wrong

- **platform@chrome-149 (PASS, lost on perf):** correct (Δ0µs) but 99.59 ms = 2.98x slower wall, and 19963 ms longtasks (≈19.6x mediabunny's 1017 ms) — heaviest main-thread blocking of any engine, from its WebGPU/canvas/MediaRecorder scaffolding around a trivial single-keyframe decode.
- **web-demuxer@4.0.0 (PASS, lost on perf):** correct (Δ0µs); 223.21 ms = 6.67x slower; 8626 ms longtasks. Single-thread wasm demux of the full MP4 before reaching pts 0.
- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correct (Δ0µs); 272.08 ms = 8.13x slower (slowest of the "fast" cohort). wasm transcode/demux stack overhead for what is just a keyframe fetch; single-thread.
- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** correct (Δ0µs) but 3959.56 ms = **118x slower**. Backpressure/queue pipeline and converter init are wrong-sized for a one-shot cold seek.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'seek'". **Honest NA** — it is a read-only parser with no decoder; it can resolve a read-side keyframe but cannot produce the RGBA FrameDigest the seek() contract + seek-accuracy oracle require, and its `seek()` throws rather than fabricate (`src/engines/remotion-media-parser/adapter.ts:561-567`, rationale at lines 12-13).
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare operation 'seek'". **Honest NA** — mp4box can map a RAP to a byte offset but has no decoder to yield a decoded frame; `seek()` throws (`src/engines/mp4box/adapter.ts:957-959`). Genuine capability gap, not under-declaration.

## Anti-cheat validation

- **Scenario:** `src/scenarios/decode-seek/index.ts:575-584` — `seek_zero`, asset `h264_1080p_30s.mp4`, `tUs:0`, `expectKeyframe:true`, `seekToleranceUs:0`. Real gating rationale in `notes`: "Seek to 0: must land deterministically on the first frame (pts 0 keyframe)."
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` exists — 31 MB real H.264 1080p ~30s clip (verified via stat). Not synthetic/empty/mock.
- **Oracle:** `seekAccuracy` at `src/core/oracles.ts:2199-2234`, with expected-pts resolution from goldens at `oracles.ts:2236-2268`. It performs a real comparison: derives the expected keyframe pts from golden packets and asserts `|landed - expected| <= seekToleranceUs` with **tolerance 0** — the strictest possible setting, not trivially satisfiable. Measurements (landedPtsUs=0, seekDeltaUs=0, expectedPtsUs=0) are physically plausible: pts 0 is exactly the first keyframe of a faststart MP4.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1415-1436` — genuine implementation: opens input, builds a real `VideoSampleSink`, calls `sink.getSample()`, reads `sample.microsecondTimestamp`, and computes the digest from the decoded sample. No canned output, no golden short-circuit, no input copy, errors thrown (not swallowed).
- **Cached note:** mediabunny's result is **cached==true** ("cached previous PASS result") — it was reused, not re-run this session. The PASS is real but the latency numbers are from a prior run; staleness risk applies to all 5 PASS engines (all cached).
- **Verdict: REAL** — real fixture, real decoder-backed implementation, real zero-tolerance timestamp oracle.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict is rock-solid (exact Δ0µs, tolerance 0, real oracle/fixture/adapter). The *winner-selection* rests entirely on performance because correctness ties, and the perf evidence is weak per the rubric: **n==1** for every engine (single sample, mad==0, p95==median), so there is no variance estimate. A 2.98x gap over platform is large enough to survive single-sample noise, but the longtasks comparison (1017 vs 19963 ms) is the more robust differentiator.
- All 5 PASS engines are **cached==true**, so latencies are from prior runs (potential staleness; per memory note, stale PASS reuse is a known caveat for honest fresh runs).
- No throughputRealtime/peakMemory metrics emitted for this scenario, so those rubric tiebreakers were unavailable; ranking used seekMs (primaryMetric) + longtasks.
