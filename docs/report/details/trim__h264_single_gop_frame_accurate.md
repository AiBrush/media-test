# trim/h264_single_gop_frame_accurate

family: trim | fixture asset: `h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4) | primaryMetric: wall | passCount: 2

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 of 7 engines PASS).
- Decisive factor: **performance**. Both PASS engines satisfy the same single gating oracle (`trim-boundaries`) at equal correctness strength (duration-only structural gate, boundary-frame digest skipped for both), so the tie breaks on speed and main-thread responsiveness.
- Margin over runner-up (ffmpeg.wasm@0.12.15): **8.85x faster wall** (162.25 ms vs 1435.98 ms), **8.85x higher realtime throughput** (184.90x vs 20.89x), **14.67x less main-thread blocking** (longtasks 1361 ms vs 19963 ms). Caveat: n==1 for every metric (single sample, mad=0), and both results are cached.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:pass | 162.25 ms | 184.90x | n/a (n=0) | 1361 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:pass | 1435.98 ms | 20.89x | n/a (n=0) | 19963 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The operation is a degenerate frame-accurate cut: `startUs=5_000_000 .. endUs=5_100_000` — a ~100 ms / ~3-frame (@30 fps) range with `frameAccurate: true` and `durationToleranceSec: 0.1` (scenario `src/scenarios/trim/index.ts:545-557`). Because the cut starts at 5.0 s — almost certainly mid-GOP for a 1080p30 H.264 stream — and demands frame accuracy, a pure stream-copy cannot honor the boundary: the engine must decode the enclosing GOP and re-encode the boundary frames. This is a transcode-bound micro-operation, so the back end that does the boundary re-encode determines the winner.

mediabunny's `trim()` (`src/engines/mediabunny/adapter.ts:1445-1500`) takes the frame-accurate branch and explicitly forces a transcode with a hardware hint: `convOpts.video = { forceTranscode: true, hardwareAcceleration: HW_ACCEL }` (line 1494, with `HW_ACCEL = MEDIABUNNY_CONFIG.hwAccel` at line 160). The shard's `env.configUsed` confirms the path actually taken: `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`. On this host (Apple M1 Max, ANGLE Metal) the boundary GOP is decoded and re-encoded by the platform's hardware H.264 codec via WebCodecs. The result: wall median 162.25 ms, 184.90x realtime, and only 1361 ms of cumulative long-task time. The trim-boundaries oracle measured `outDurationSec=0.17067`, `requestedDurationSec=0.1`, `durationDeltaSec=0.07067` — under the 0.1 s tolerance (`src/core/oracles.ts:2394`), so it passes on the duration gate (the boundary-frame digest is intentionally skipped because the loaded golden is a source-prefix, not a trim-range golden — `src/core/oracles.ts:2405-2430`).

ffmpeg.wasm reaches the same correctness verdict but through a fundamentally slower mechanism. Its `trim()` frame-accurate branch (`src/engines/ffmpeg-wasm/adapter.ts:2574-2605`) places `-ss/-t` AFTER `-i` to force decode+re-encode, then encodes with software libx264 (`-c:v libx264 -pix_fmt yuv420p -preset veryfast`, lines 2592-2594) inside the single-thread stable wasm core. There is no GPU path: every macroblock of the boundary GOP is decoded and re-encoded in JS/wasm on the main thread. That costs wall 1435.98 ms and a punishing 19963 ms of long-task time (the wasm encode monopolizes the main thread). Its oracle numbers are actually marginally tighter (`durationDeltaSec=0.06633` vs mediabunny's 0.07067), but both are comfortably inside tolerance, so correctness is a tie and the ~8.85x throughput / ~14.7x responsiveness gap is decisive.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost): Correct, but 8.85x slower wall (1435.98 ms vs 162.25 ms) and 14.67x worse main-thread blocking (longtasks 19963 ms vs 1361 ms) because it does the boundary re-encode in single-thread software libx264 in the wasm core (`adapter.ts:2592`) instead of hardware WebCodecs.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA — MP4Box.js is a demuxer/box parser with no encode path, so a frame-accurate (re-encoding) trim is genuinely out of scope.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'trim'. Plausible-but-arguably-under-declared: it wraps WebCodecs and could in principle re-encode a boundary GOP; here it simply does not expose a trim operation.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'trim'. Honest — a parser-only library, no muxing/encoding.
- **platform@chrome-149** — NA_ENGINE: does not declare 'trim'. Honest — the raw-platform reference engine exposes decode/probe primitives, not a packaged trim op.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'trim'. Honest — a demuxer (libav-based) with no re-mux/encode trim surface.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:545-557` (id `h264_single_gop_frame_accurate`, asset `h264_1080p_30s.mp4`, range 5.0–5.1 s, `frameAccurate: true`, tol 0.1 s, `extraOracles: BOUNDARIES_ONLY`).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists and is a real 31 MB H.264/AAC MP4 (verified via stat). Not synthetic/empty/mock.
- Gating oracle: `trim-boundaries` at `src/core/oracles.ts:2348-2435`. It probes the trimmed output's duration (reference probe → decoded frame-span → audio-container fallback) and compares against the requested range with a real numeric tolerance (line 2394). The boundary-frame digest is deliberately disabled when the golden is a source-prefix rather than a baked trim-range golden (lines 2405-2430), so today the gate is duration-only.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445-1500`. Genuine implementation — opens input via `openInput`, builds a real mediabunny `Conversion` with `trim:{start,end}` and `forceTranscode:true` + hardware acceleration (lines 1488-1496), runs it through `runConversion`. No canned output, no input→output copy (the no-op fast path at lines 1468-1477 only triggers for a start≈0 identity trim, which a 5.0 s start cannot hit), no golden short-circuit, no error swallowing.
- Verdict: **WEAK-GATE**. Both implementations and the fixture are real, but the only oracle that fired is a duration-within-tolerance structural check (boundary-frame digest skipped, `boundaryFrameComparisons:0`). For a scenario whose entire point is "frame-accurate single-GOP cut", a 0.1 s tolerance with no per-frame digest does not actually verify frame accuracy — a non-frame-accurate keyframe-snapped cut could plausibly land inside 0.1 s too. The PASS is real but the gate is looser than the feature name implies. Measurements are physically plausible (out durations 0.166–0.171 s for a ~0.1 s request reflect real muxer/GOP/AAC-packet padding on a sub-GOP cut).
- Cached note: BOTH winning and runner-up results have `cached:true` ("cached previous PASS result"). Numbers were reused, not freshly re-run — per the launcher seeding caveat, the wall/throughput/longtasks figures are stale-PASS reuse and should be re-baked from a cleared cache for an honest fresh measurement.

## Confidence & caveats

- Confidence: medium. The ranking (mediabunny > ffmpeg.wasm; the 5 NA engines never contest) is robust — the 8.85x wall and 14.7x longtask gaps far exceed any single-sample noise. But: (1) every bench metric is n==1 (mad=0, p95==median), so spread is unknown; (2) both results are cached, so the figures may be stale; (3) peakMemory is unmeasured (n=0) for both, removing one tiebreaker axis; (4) the gating oracle is duration-only (WEAK-GATE) — neither engine's frame accuracy was actually digest-verified, so "best at frame-accurate trim" rests on the adapters' code paths (both force a real boundary re-encode) rather than on a per-frame oracle.
