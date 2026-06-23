# trim/h264_vfr_frame_accurate

**Family:** trim | **Fixture asset:** `fixtures/media/h264_vfr.mp4` (H.264 video + AAC audio in MP4, 2.3 MB, real file) | **Primary metric:** wall (throughputRealtime reported) | **Pass count:** 2 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` (CONTESTED — 2 engines PASS).
- **Decisive factor:** PERFORMANCE. Both PASS engines satisfy the identical oracle set (`trim-boundaries` + `playback-smoke`) at identical strictness (duration-delta gate only; boundary frame digest skipped for both because the loaded golden is a source-prefix, not a trim-range golden). Correctness is therefore comparable, so the win is decided on wall time.
- **Margin over runner-up (ffmpeg.wasm):** **10.72x faster** wall (214.85 ms vs 2302.72 ms) and **10.72x higher** throughputRealtime (58.33x vs 5.44x realtime). Counterpoint: mediabunny's main-thread longtasks total is **2.65x higher** (12909 ms vs 4863 ms) — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 214.85 ms | 58.33x | 0 (not sampled) | 12909 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 2302.72 ms | 5.44x | 0 (not sampled) | 4863 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The operation is a **frame-accurate trim** of VFR (variable-frame-rate) H.264-in-MP4 over the range `startUs=3_000_000 .. endUs=6_000_000` (requested 3.000 s). Frame-accuracy on a VFR source with non-uniform boundary timestamps means the cut points generally fall mid-GOP, so the leading partial GOP must be re-decoded and re-encoded rather than copied; only an engine with a real decode→encode→mux pipeline can honor the exact start/end instead of snapping to keyframes.

Mediabunny's adapter implements this through the native mediabunny `Conversion` API. In `src/engines/mediabunny/adapter.ts:1445` (`trim()`), it validates the range, builds the output container (`makeOutputFormat`), and constructs `ConversionOptions` with `trim: { start: range.startUs/1e6, end: range.endUs/1e6 }` (`adapter.ts:1485-1489`). Because `opts.frameAccurate` is true here, it sets `convOpts.video = { forceTranscode: true, hardwareAcceleration: HW_ACCEL }` (`adapter.ts:1493-1495`), then runs `runConversion` (`adapter.ts:1496`). The `env.configUsed` confirms the path that actually ran: `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `wasmThreads: 0`, `coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`. So the boundary-GOP re-encode runs on the **hardware H.264 encoder/decoder via WebCodecs** (Apple M1 Max / ANGLE Metal per `env.gpu`), with a streaming read→decode→encode→mux that never buffers the whole file and needs no COOP/COEP.

The measured result: `trim-boundaries` reports `outDurationSec=3.072`, `requestedDurationSec=3`, `durationDeltaSec=0.072` — comfortably inside the scenario's widened `durationToleranceSec=0.1` (widened precisely because VFR boundary timestamps are uneven; `src/scenarios/trim/index.ts:228-229`). `boundaryFrameComparisons=0` because the trim-range golden is not baked, so the oracle gates on duration only. `playback-smoke` confirms the muxed output decodes and plays in a real `<video>`. Wall time **214.85 ms** at **58.33x realtime** reflects the GPU-accelerated boundary re-encode of a 3-second segment.

ffmpeg.wasm produces an equally valid result (`durationDelta=0.066 s`, within tolerance; smoke passes) but does the same decode/re-encode/mux entirely in a **single-threaded WASM build** (no SharedArrayBuffer / multithread on this run), so it costs **2302.72 ms** at only **5.44x realtime** — an order of magnitude slower for the same correctness. That is the entire gap: identical oracle strength, hardware WebCodecs vs CPU WASM transcode of the leading GOP.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but the runner-up. Correctness is equal (same two oracles, same duration-only gate, `durationDelta=0.066 s` vs mediabunny's `0.072 s` — both well inside 0.1 s, so not a correctness differentiator). It loses purely on speed: 2302.72 ms wall vs 214.85 ms (10.72x slower) and 5.44x vs 58.33x realtime, because it transcodes the boundary GOP in single-thread WASM instead of the hardware WebCodecs encoder.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: the raw WebCodecs/platform adapter exposes decode/demux primitives, not a packaged trim+remux op.
- **mp4box@2.3.0** — NA_ENGINE: does not declare 'trim'. Honest; mp4box.js is a demux/box-layout tool with no re-encode/transcode path needed for a frame-accurate VFR cut.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'trim'. Honest; it is a demuxer only, with no encoder to re-cut the boundary GOP.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'trim'. Honest; a parser, not a transcoder.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'trim'. This is the most plausible candidate for an **under-declared** capability (it wraps WebCodecs and elsewhere does conversion), but for this suite it simply does not register the `trim` operation, so it is correctly NA here.

## Anti-cheat validation

- **Scenario:** `src/scenarios/trim/index.ts:219-232` — `id: 'h264_vfr_frame_accurate'`, `asset: 'h264_vfr.mp4'`, `container: mp4`, `videoCodec: h264`, `audioCodec: aac`, `startUs=3_000_000`, `endUs=6_000_000`, `frameAccurate: true`, `tolerances.durationToleranceSec=0.1`, `extraOracles: PLAYABLE_AV`. Notes: "Frame-accurate trim of VFR content; tests exact-cut on non-uniform timestamps."
- **Fixture exists:** `fixtures/media/h264_vfr.mp4`, 2.3 MB real file (stat confirmed). Not synthetic/empty/mock.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1445-1500`. Genuinely calls the real mediabunny `Conversion` pipeline (`Output`/`BufferTarget`/`runConversion`) with `forceTranscode: true` + `hardwareAcceleration: prefer-hardware`. No canned output, no input→output copy (the no-op identity path at `adapter.ts:1468-1477` only triggers for start≈0 and `isNoopTrim`, which does NOT apply to a 3s→6s frame-accurate cut), no short-circuit to golden, no error-swallow-as-success (it throws on bad ranges and on empty output).
- **Oracle:** `src/core/oracles.ts:2348` (`trimBoundaries`). Performs a real duration comparison: probes the produced bytes / decodes frames and compares `outDurationSec` to the requested range, failing when `delta > durationToleranceSec` (`oracles.ts:2388-2403`). Boundary frame digest is intentionally skipped (`oracles.ts:2405-2431`) because the loaded golden is a source-prefix, not a trim-range golden — so the gate is the duration check plus `playback-smoke`. Measurements are physically plausible for a real 3 s VFR cut (3.072 s / 3.066 s outputs).
- **Verdict:** **WEAK-GATE.** The PASS is real (real fixture, real hardware-WebCodecs transcode, real duration measurement), but the correctness gate is a duration tolerance (±0.1 s) plus a playback smoke test — it does NOT verify frame-accurate boundary content (boundaryFrameComparisons=0, no SSIM/bit-exact frame check). A pipeline could pass with the boundary off by up to ~a few frames and still clear the 0.1 s window. The performance ranking itself is sound and decisive.
- **Cached note:** Both PASS results have `cached: true` ("cached previous PASS result") — neither was re-run this session. Staleness risk: the wall/throughput numbers and the 10.72x margin are reused, not freshly measured. Per the launcher-seeding caveat, a fully honest fresh run would require clearing raw + .browser-cache.

## Confidence & caveats

- **Confidence: medium.** The winner is unambiguous on the recorded numbers (10.72x wall margin), and the adapter/oracle code paths are real and verified by file:line. But three factors temper it: (1) both winners are `cached` n=1 samples (mad=0, p95=median), so the timing has no spread and weak statistical weight — a single fresh re-run could shift absolutes (the relative ordering is very unlikely to flip given the order-of-magnitude gap). (2) The gate is duration+smoke (WEAK-GATE), not frame-exact, so neither engine's *frame accuracy* is actually proven here. (3) mediabunny's longtasks (12909 ms) is 2.65x ffmpeg.wasm's (4863 ms), meaning more main-thread blocking despite far lower wall — if main-thread responsiveness were the primary metric, the call would be closer; but the declared primary metric is wall, where mediabunny wins decisively. peakMemory was not sampled (n=0) for either engine, so the memory tiebreaker is unavailable.
