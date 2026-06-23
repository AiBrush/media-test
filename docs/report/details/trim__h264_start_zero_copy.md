# trim/h264_start_zero_copy

family: trim | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264/AAC MP4) | primaryMetric: wall (ms) | passCount: 2/7

Copy-trim of `[0us .. 5_000_000us)` (0..5s) from a 30s 1080p H.264-in-MP4 with AAC audio. `frameAccurate:false`, `durationToleranceSec:0.5`. The `start==0` case exercises the "no leading GOP to re-encode" path: the first kept frame IS source frame 0, so a correct engine never has to reconstruct a boundary GOP. Gating oracles: `trim-boundaries` + `playback-smoke` (the `PLAYABLE_AV` set).

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED — 2 of 7 engines PASS (mediabunny, ffmpeg.wasm); the other 5 are NA_ENGINE (do not declare `trim`).

Decisive factor: PERFORMANCE on the primary metric. Correctness is a tie (both pass the identical two oracles; the gate is duration-only here, `boundaryFrameComparisons:0` for both). mediabunny wins wall median **39.585ms vs 105.905ms = 2.67x faster**, and throughputRealtime **757.86x vs 283.27x = 2.68x**. Margin over runner-up (ffmpeg.wasm): ~2.67x on wall.

Caveat affecting the margin: mediabunny's `longtasks` is **19963ms vs ffmpeg's 234ms** (~85x worse) — its WebCodecs-backed path blocks the main thread far longer than the off-the-critical-path wasm trim. Both measurements are n==1 (single sample, mad==0), so the spread is unknown and the win is weaker evidence than a multi-sample run.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 39.585 ms | 757.86 x | 0 (n=0) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 105.905 ms | 283.27 x | 0 (n=0) | 234 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

Both PASS engines clear the same gate, so this comes down to how each performs the cut on H.264/MP4. The oracle (`src/core/oracles.ts:2348` `trimBoundaries`) is duration-only for this scenario: it probes/decodes the trimmed output, computes `outDurationSec`, and compares to the requested 5s against `durationToleranceSec=0.5`. Boundary-frame digest comparison is explicitly disabled (`src/core/oracles.ts:2410-2431`) because the loaded golden is a source-prefix, not a trim-range golden — hence `boundaryFrameComparisons:0` for both engines. mediabunny lands `outDurationSec=5.0773` (Δ 0.0773s); ffmpeg lands `outDurationSec=5.0133` (Δ 0.0133s). ffmpeg is actually tighter on duration, but both are an order of magnitude inside the 0.5s band, so correctness is a wash and the ladder drops to performance.

mediabunny's trim (`src/engines/mediabunny/adapter.ts:1445-1500`) opens the MP4 once, and since `frameAccurate=false` it first tries `tryAudioOnlyPacketCopyTrim` then runs mediabunny's `Conversion` with `trim:{start:0, end:5}`. Per its config (`env.configUsed`) it runs `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`. For `start==0` the GOP boundary is already frame 0, so no boundary re-encode is forced; the conversion is dominated by container re-timing/remux of mostly stream-copied packets. Running as pure-TS ESM against the browser's native demux/codec stack (no wasm module load, no MEMFS round-trip) is why wall is 39.585ms and realtime throughput hits 757.86x. It also requires no COOP/COEP isolation.

ffmpeg.wasm's trim (`src/engines/ffmpeg-wasm/adapter.ts:2538-2645`) takes the genuine keyframe-aligned fast path for `frameAccurate=false`: it builds `-ss <start> -i <in> -map 0 -t <dur> -c copy -avoid_negative_ts make_zero -movflags +faststart` and executes it in the wasm core (`this.run(args)`). This is a correct, lossless stream copy. But it must first `writeInput` the 31MB file into MEMFS, run an info pass (`runInfo`), then a second copy pass, then `readBinary` the output back out — all inside a single-thread wasm core. That I/O and double-pass overhead is why wall is 105.905ms (2.67x slower) despite doing strictly less CPU work (pure `-c copy`, no decode). Notably ffmpeg's `+faststart` and `-avoid_negative_ts make_zero` give it the tighter measured duration (Δ 0.0133s).

The single place ffmpeg actually wins is main-thread responsiveness: its `longtasks` is 234ms vs mediabunny's 19963ms. mediabunny's WebCodecs/`copyTo` + canvas-pool pipeline (the same machinery that decodes for the playback-smoke check) parks a very long task on the main thread, whereas ffmpeg's work happens in the wasm worker. On the chosen primaryMetric (wall) and throughput, mediabunny still wins decisively; the longtasks figure is the headline caveat.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on performance. Correctness tie (trim-boundaries + playback-smoke both true, duration Δ 0.0133s, actually tighter than mediabunny). Lost wall 105.905ms vs 39.585ms (0.37x as fast / mediabunny 2.67x faster) and throughput 283.27x vs 757.86x. Genuine `-c copy` keyframe trim in single-thread wasm; the MEMFS write + double pass is the cost. It does win main-thread longtasks (234ms vs 19963ms).
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: the platform/WebCodecs adapter exposes decode/encode primitives, not a container-level trim/remux operation, so it has no `trim()` to register.
- **mp4box@2.3.0** — NA_ENGINE: does not declare `trim`. Plausible-but-arguably-conservative: MP4Box.js can fragment/segment and re-mux MP4, so a copy-trim is in principle within reach; not declaring it is a capability choice, not a hard limitation. NA looks honest given the adapter scope.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare `trim`. Honest: it is a parser/demuxer, not a muxer/editor; it cannot emit a trimmed container.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare `trim`. Honest: demux-only library, no mux/trim output path.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare `trim`. Under-declared-looking: a WebCodecs converter could implement trim, but this adapter scopes itself to transcode/convert and does not register `trim`. NA is a declaration choice, accepted as honest here.

## Anti-cheat validation

- Scenario: `src/scenarios/trim/index.ts:445-457` (`id:'h264_start_zero_copy'`, `asset:'h264_1080p_30s.mp4'`, `startUs:0`, `endUs:5_000_000`, `frameAccurate:false`, `durationToleranceSec:0.5`, `extraOracles:PLAYABLE_AV`).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — a real 30s 1080p H.264/AAC MP4, not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:2348` `trimBoundaries` performs a real duration measurement (reference probe or decoded frame-pts span) vs the requested 5s; `src/core/oracles.ts:1575` `playback-smoke` plays the output `<video>`. The trim-boundaries gate here is duration-only — boundary-frame digests are deliberately disabled (`oracles.ts:2410-2431`) because no trim-range golden exists, so `boundaryFrameComparisons:0`. This is a real but loose gate (0.5s tolerance on a 5s clip), not a bit-exact correctness check.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445-1500` — genuine `Conversion` with `trim:{start,end}` over a real `openInput`; no canned output, no input->output copy (the no-op short-circuit at :1468 only fires for a true 0..duration identity trim, which this 0..5s of a 30s file is NOT), no golden short-circuit, no error swallowing. ffmpeg runner-up (`adapter.ts:2538-2645`) likewise runs real `-c copy` in wasm.
- Measurements are physically plausible: 5.077s / 5.013s output durations for a requested 5s cut; 757.86x / 283.27x realtime for a 5s segment; 31MB input.
- cached: BOTH PASS results have `cached==true` ("cached previous PASS result"). The decisive evidence (wall, throughput, longtasks) was reused, not re-run this session — staleness risk on the exact numbers. The numbers are internally consistent and plausible, but a fresh re-run is advised before treating the 2.67x margin as load-bearing.

Verdict: **WEAK-GATE**. Real fixture + real implementations, but the gating oracle is duration-only with a wide 0.5s tolerance and no boundary-frame digest (`boundaryFrameComparisons:0`) — the PASS is genuine but not a strong correctness proof, and the winner is decided on cached n==1 performance.

## Confidence & caveats

- Confidence: medium. The winner ordering on wall/throughput is clear (2.67x), but: (1) both results are `cached==true` (stale numbers), (2) n==1 with mad==0 means no spread/variance evidence, and (3) the correctness gate is duration-only/loose, so the win is essentially a perf win on a weakly-gated correctness tie.
- Material counter-signal: mediabunny's `longtasks=19963ms` vs ffmpeg's `234ms`. If main-thread responsiveness were the primary metric, ffmpeg would win. The verdict here follows the prescribed ladder (wall first).
- `peakMemory` and `targetWrites` are n==0 (not captured) for both, so memory could not be used as a tiebreaker.
- The 5 NA_ENGINE engines are gated honestly at the operation-declaration level (`engine does not declare operation 'trim'`); mp4box and remotion-webcodecs are the two whose NA is closest to "under-declared capability" but remain declaration choices, not faked passes.
