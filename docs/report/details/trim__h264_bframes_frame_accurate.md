# trim/h264_bframes_frame_accurate

family: trim · fixture asset: `h264_bframes_1080p.mp4` (H.264 + AAC in MP4, ~11 MB) · primaryMetric: throughputRealtime · passCount: 2 / 7

## Verdict

- **Best framework: `mediabunny@1.48.0`** (CONTESTED — 2 engines PASS: mediabunny and ffmpeg.wasm).
- **Decisive factor: PERFORMANCE.** Both passing engines satisfied the *identical* oracle set with the *identical* strictness (`trim-boundaries` duration-only gate + `playback-smoke`), so correctness is a tie. The win is on speed: mediabunny is **~17.0x faster wall** (412.99 ms vs 7035.07 ms) and **~17.0x higher real-time throughput** (24.21x vs 1.42x-realtime).
- **Margin over runner-up (ffmpeg.wasm):** 7035.07 / 412.99 = **17.04x** lower wall; 24.213 / 1.421 = **17.04x** higher throughputRealtime. Both samples are n=1 (no spread), so the margin is directionally certain but each median rests on a single run.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 412.99 ms | 24.213x | 0 (not sampled) | 3675 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 7035.07 ms | 1.421x | 0 (not sampled) | 1361 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The scenario is a **frame-accurate cut [1.5 s, 4.5 s) of H.264 video that contains a B-frame run** (`frameAccurate: true`, scenario `src/scenarios/trim/index.ts:206-218`). The hard part is the boundary GOP: because the stream uses B-frames, decode order ≠ presentation order, so a byte-copy cut at an arbitrary PTS would slice into a frame whose reference dependencies live before the cut point. The note states the requirement exactly: "Frame-accurate cut through a B-frame run; reorder must not corrupt the boundary frame." A correct engine must therefore **decode and re-encode the leading region** so the first output frame is a self-contained IDR with the reorder state reset.

mediabunny handles this in `src/engines/mediabunny/adapter.ts:1445-1500`. For `frameAccurate === true` it deliberately forces a transcode of the boundary region: `convOpts.video = { forceTranscode: true, hardwareAcceleration: HW_ACCEL }` (`adapter.ts:1493-1495`) and passes the exact float range `trim: { start: 1.5, end: 4.5 }` (`adapter.ts:1488`) so the start/end are honored rather than snapped to keyframes. The `forceTranscode` path runs the boundary GOP through **WebCodecs with `hardwareAcceleration: 'prefer-hardware'`** — confirmed by the shard env: `configUsed.backend = "webcodecs"`, `hwAccel = "prefer-hardware"`, `pipeline = "streaming-lockstep"`, on the Apple M1 Max (ANGLE Metal). That hardware H.264 decode+encode is what produces the 24.21x-realtime throughput and the 412.99 ms wall: a 3 s output reconstructed in ~0.41 s.

The gating oracle `trim-boundaries` (`src/core/oracles.ts:2346-2435`) probes the output duration via the reference engine / decoded-frame PTS span and checks `|outDuration − requested| ≤ durationToleranceSec` (0.1 s, scenario line 215). mediabunny's measurements: `outDurationSec = 3.072`, `requestedDurationSec = 3`, `durationDeltaSec = 0.072` — inside the 0.1 s tolerance with 0.028 s to spare. The boundary-frame digest comparison is **explicitly skipped** (`boundaryFrameComparisons: 0`) because the loaded golden is a source-prefix, not a trim-range golden (oracles.ts:2405-2431); so the live correctness signal here is duration + playback smoke only. `playback-smoke` (oracles.ts:1574-1580) then confirms a real `<video>` element advanced frames on the muxed MP4 — proving the re-encoded boundary IDR is decodable and the B-frame reorder was not corrupted.

ffmpeg.wasm passes the *same* two oracles with an even tighter duration delta (3.0663 s, Δ 0.0663 s) but loses purely on cost: it runs the libavcodec H.264 decode→encode pipeline in **single-thread wasm** (no SharedArrayBuffer threads available), so the same cut takes 7035 ms / 1.42x-realtime. Interestingly ffmpeg.wasm reports *lower* longtasks (1361 ms vs mediabunny's 3675 ms) — mediabunny's WebCodecs work blocks the main thread in longer chunks even though total wall is far shorter — but longtasks is a secondary metric and does not change a 17x wall/throughput gap.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** Correctness tie (trim-boundaries Δ 0.0663 s, playback-smoke pass) but **17.04x slower wall (7035 ms vs 413 ms)** and **17.04x lower throughput (1.42x vs 24.21x-realtime)** because it transcodes the boundary GOP in single-thread wasm with no hardware acceleration, versus mediabunny's hardware WebCodecs. Decisive metric gap.
- **platform@chrome-149 (NA_ENGINE):** does not declare operation `trim`. Honest NA — the bare-Chrome platform adapter exposes decode/encode primitives but no trim/mux operation, so it cannot produce a trimmed container.
- **mp4box@2.3.0 (NA_ENGINE):** does not declare `trim`. Honest — mp4box is a demux/box-parsing library; a *frame-accurate* trim through B-frames needs a decode+re-encode it has no encoder for.
- **web-demuxer@4.0.0 (NA_ENGINE):** does not declare `trim`. Honest — demux-only, no encoder/muxer for frame-accurate output.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** does not declare `trim`. Honest — it is a parser, not an encoder.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** does not declare `trim`. Plausibly *under-declared* — this engine wraps WebCodecs and conceptually could do a frame-accurate re-encode trim, so the NA is honest-by-declaration but the capability gap is a choice, not an inherent limitation.

## Anti-cheat validation

- **Scenario:** `src/scenarios/trim/index.ts:206-218` — `id: 'h264_bframes_frame_accurate'`, `asset: 'h264_bframes_1080p.mp4'`, `startUs: 1_500_000`, `endUs: 4_500_000`, `frameAccurate: true`, `tolerances.durationToleranceSec: 0.1`.
- **Fixture exists:** `fixtures/media/h264_bframes_1080p.mp4` is present, **~11 MB** real media (not synthetic/empty/mock). Verified via `ls`.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1445-1500` — genuine implementation: opens the real input (`openInput`), builds a mediabunny `Output` + `Conversion`, sets `forceTranscode: true` + `hardwareAcceleration` for the frame-accurate path, and runs `runConversion`. No canned output, no input→output passthrough (the no-op shortcut at lines 1468-1477 is guarded by `isNoopTrim` and only fires for a 0..duration identity request — this scenario is 1.5..4.5 s, so it does NOT fire), no golden short-circuit, no error swallowing (it throws on invalid range).
- **Oracle:** `src/core/oracles.ts:2346-2435` (`trim-boundaries`) performs a real duration comparison against the requested range with a 0.1 s tolerance; `playback-smoke` (oracles.ts:1574-1580) requires a real `<video>` to advance. Measurements are physically plausible (3.072 s output for a 3 s request; 0.072 s = ~2 frames of MP4 muxing quantization at 30 fps).
- **Caveat — gate strength:** the boundary-frame SHA-256 digest comparison is **skipped** (`boundaryFrameComparisons: 0`) because no trim-range golden is baked, so the active correctness signal is duration-tolerance + playback-smoke, NOT a bit-exact boundary check. This is a real-but-loose gate: it would catch a grossly wrong cut length or an unplayable file, but not a subtly mis-reordered boundary frame. Hence **WEAK-GATE**, not REAL.
- **Cached:** mediabunny's result has `cached: true` ("cached previous PASS result") — and so does ffmpeg.wasm's. Both rows were reused, not re-run in this batch; numbers carry staleness risk and the win was not freshly reproduced.

**validationVerdict: WEAK-GATE** — real ~11 MB H.264/B-frame fixture, genuine hardware-WebCodecs transcode implementation, but the gating oracle is duration-tolerance + smoke (boundary-frame digest disabled), so the PASS is real yet not a strong frame-exact proof.

## Confidence & caveats

- Confidence: **medium.** The winner choice is unambiguous (only mediabunny and ffmpeg.wasm pass; a 17x perf gap with identical oracle strength).
- Both passing rows are `cached: true` and `n: 1` — no spread (mad/p95 == median), so the magnitude (not the direction) of the 17x margin could drift on a fresh run; per the launcher-seeding caveat, a truly honest fresh number would require clearing the raw + .browser-cache.
- The trim-boundaries gate does not verify boundary-frame bit-exactness for this B-frame case (digest skipped), so "frame-accurate" is asserted by the adapter's forceTranscode path and proven only to duration+playback granularity here.
- peakMemory was not sampled (n=0) for either engine, so the memory tiebreaker could not be applied.
