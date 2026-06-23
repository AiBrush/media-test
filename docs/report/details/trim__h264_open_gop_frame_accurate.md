# trim/h264_open_gop_frame_accurate

family: trim | fixture asset: `h264_bframes_1080p.mp4` (H.264 + AAC in MP4, open-GOP, ~11 MB) | primaryMetric: throughputRealtime | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Status: **CONTESTED** — two engines PASS (`mediabunny`, `ffmpeg.wasm@0.12.15`).
- Correctness strength is a TIE: both pass exactly the same two oracles, `trim-boundaries` and `playback-smoke`, and in BOTH cases the frame-accurate boundary digest was *skipped* (`boundaryFrameComparisons: 0`) — only the duration proxy was live. So the decision falls to performance.
- Decisive factor: **performance**. mediabunny finished in 502.83 ms wall / 19.89x-realtime vs ffmpeg.wasm's 8872.29 ms / 1.13x-realtime — a **17.6x faster wall** and **17.6x higher realtime throughput**. mediabunny also held a measured 45.9 MB peak (ffmpeg.wasm did not report peakMemory) and ran 3675 ms of long tasks vs 5478 ms (0.67x).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 502.83 ms | 19.89x | 45,875,777 B | 3675 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 8872.29 ms | 1.13x | 0 (n=0) | 5478 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The scenario (src/scenarios/trim/index.ts:480-491) cuts `h264_bframes_1080p.mp4` from 2.7 s to 6.3 s with `frameAccurate: true`. The manifest marks this asset as open-GOP: B-frames carry forward reference dependencies across GOP boundaries, so the requested start pts (2.7 s) is an interior, non-keyframe sample. A correct frame-accurate cut therefore *cannot* be a stream copy snapped to the previous keyframe — the boundary region must be decoded and re-encoded so the first kept frame is reconstructed without dangling cross-boundary references.

mediabunny takes exactly that path. Its trim adapter (src/engines/mediabunny/adapter.ts:1485-1496) builds a `ConversionOptions` with `trim: { start: 2.7, end: 6.3 }` and, because `opts.frameAccurate` is set, attaches `convOpts.video = { forceTranscode: true, hardwareAcceleration: HW_ACCEL }`. `forceTranscode` defeats the copy fast-path and runs mediabunny's read->decode->encode->mux Conversion pipeline so the boundary frames are genuinely rebuilt. Crucially, `HW_ACCEL` resolves to `prefer-hardware` and the run used `backend: webcodecs` / `hwAccel: prefer-hardware` / `pipeline: streaming-lockstep` (env.configUsed). The re-encode runs on the Apple M1 Max hardware H.264 encoder via WebCodecs, with no SharedArrayBuffer and `coopCoep: not-required`. That is why the whole 3.6 s clip transcoded in 502.83 ms (19.89x-realtime) at a constrained 45.9 MB peak.

ffmpeg.wasm reaches the same correctness but pays a heavy tax. Its trim adapter (src/engines/ffmpeg-wasm/adapter.ts:2574-2604) emits `-ss/-t AFTER -i` (forcing decode+re-encode) and re-encodes with `libx264 -pix_fmt yuv420p -preset veryfast`. That is a software x264 encoder compiled to wasm, running single-thread in this stable core. The result: 8872.29 ms wall and only 1.13x-realtime — it barely keeps up with the clip's own runtime. peakMemory was not captured (n=0) so memory cannot be compared, but the wall/throughput gap alone is decisive: mediabunny is 8872.29/502.83 = **17.6x faster** and 19.89/1.13 = **17.6x more realtime throughput**, while also spending less time in long tasks (3675 vs 5478 ms, 0.67x).

The oracle measurements are physically consistent with a real re-encode of this clip: mediabunny's output duration was 3.6693 s vs the requested 3.6 s (Δ 0.0693 s) and ffmpeg.wasm's was 3.6663 s (Δ 0.0663 s) — both within the tight 0.1 s `durationToleranceSec`, and both slightly long by roughly one extra GOP's worth of tail, exactly what an encoder that lands on the nearest encodable boundary would produce.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but lost on performance: 8872.29 ms wall (17.6x slower) and 1.13x-realtime (17.6x lower throughput) than mediabunny, because it re-encodes with single-thread wasm `libx264 -preset veryfast` (src/engines/ffmpeg-wasm/adapter.ts:2592-2594) instead of a hardware WebCodecs encoder. Correctness was equal (same two oracles, boundary digest skipped).
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: the raw WebCodecs/`<video>` platform shim exposes decode/playback primitives, not a trim/transcode pipeline, so not declaring `trim` is correct, not under-declared.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: mp4box is a demuxer/box parser; it cannot re-encode the open-GOP boundary that a frame-accurate cut requires.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: it is a parser, not an encoder.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: a demuxer cannot perform the boundary re-encode.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Borderline — a WebCodecs-based engine *could* in principle implement a frame-accurate trim; declaring NA is conservative rather than dishonest, but it is the one NA that could plausibly contest if the adapter exposed `trim`.

## Anti-cheat validation

- Scenario: src/scenarios/trim/index.ts:480-491 (`id: 'h264_open_gop_frame_accurate'`, `asset: 'h264_bframes_1080p.mp4'`, `startUs: 2_700_000`, `endUs: 6_300_000`, `frameAccurate: true`, `durationToleranceSec: 0.1`).
- Fixture: `fixtures/media/h264_bframes_1080p.mp4` EXISTS (~11 MB real H.264/AAC MP4, open-GOP). Not synthetic/empty/mock.
- Winner adapter: src/engines/mediabunny/adapter.ts:1485-1496 — genuine Conversion API call with `forceTranscode: true` + hardware WebCodecs; no canned output, no input->output copy (the no-op copy branch at :1468-1477 is gated on `startUs ~= 0`, which is false here at 2.7 s), no golden short-circuit, no swallowed error.
- Gating oracle: src/core/oracles.ts:2348-2435 (`trim-boundaries`). It DOES perform a real duration comparison and would fail on Δ > 0.1 s. **However**, the boundary-frame digest comparison (the part that would actually verify frame-accurate open-GOP reconstruction) is deliberately skipped because the loaded golden is a source-prefix, not a trim-range golden (oracles.ts:2405-2430), so `boundaryFrameComparisons: 0` for both engines. The advertised "tight ±1-frame, boundary must be reconstructed" guarantee in the scenario notes is NOT actually enforced — only duration + `playback-smoke` (oracles.ts:1574-1580) gate the PASS.
- Verdict: **WEAK-GATE**. The fixture is real and both implementations genuinely re-encode (no cheat), but the correctness gate for this specific open-GOP frame-accuracy claim is a duration proxy plus a smoke check; the frame-exact boundary comparison the scenario was designed around is inert. The PASS is real but does not prove frame-accurate boundary correctness.
- Cached note: BOTH winning and runner-up results have `cached: true` ("cached previous PASS result") — reused, not re-run in this batch. Staleness risk applies, and all bench metrics are n=1 (mad=0, p95==median), so the 17.6x margin rests on single samples.

## Confidence & caveats

- Confidence: medium. The performance margin (17.6x) is large and unambiguous, so the *ranking* is robust even on n=1. But two caveats temper it: (1) the correctness gate is a WEAK-GATE — boundary frame digest skipped, so neither engine was proven frame-accurate at the cut; (2) both results are cached and n=1, so absolute numbers could be stale.
- ffmpeg.wasm's peakMemory was not captured (n=0), so the memory dimension of the comparison is one-sided.
- The decisive evidence is hardware WebCodecs (mediabunny) vs single-thread wasm software x264 (ffmpeg.wasm) — a structural, repeatable advantage, not a measurement fluke.
