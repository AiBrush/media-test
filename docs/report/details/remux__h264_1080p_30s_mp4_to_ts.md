# remux/h264_1080p_30s_mp4_to_ts

family: remux | fixture asset: `h264_1080p_30s.mp4` (31 MB, 30 s 1080p H.264/AAC, real fixture) | primaryMetric: wall | passCount: 2

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **CONTESTED**: 2 of 7 engines PASS (`ffmpeg-wasm`, `mediabunny`); both satisfy the single gating oracle `reference-reimport` with structurally-equivalent output (2 media tracks, H.264 video + AAC audio, durationDelta well inside tolerance). Correctness strength is therefore a tie at the same ladder rung (structural re-import).
- **Decisive factor: performance.** With correctness comparable, the tiebreak is wall median (primaryMetric). ffmpeg-wasm = 145.99 ms vs mediabunny = 311.65 ms.
- **Margin over runner-up (mediabunny):** ~**2.13x faster wall** (145.99 ms vs 311.65 ms) and ~**2.13x higher realtime throughput** (205.50x vs 96.26x). Both n=1 (single sample, mad=0), so the margin is real but lightly sampled — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 145.99 | 205.50 | 0 (not sampled) | 19963 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 311.65 | 96.26 | 60,074,659 | 315 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |

## Why the winner wins (deep technical)

**Operation in concrete terms.** This is a *lossless* container conversion: take H.264 video + AAC audio that live in an ISO-BMFF MP4 (length-prefixed AVCC NAL units, sample tables in `moov`) and re-wrap the identical coded samples into an MPEG-2 Transport Stream (188-byte packets, PES, PAT/PMT, PCR). No pixel re-encode occurs — only the bitstream framing changes (AVCC → Annex-B start codes for H.264, ADTS framing for AAC inside PES). The strongest oracle the family *could* run (decoded-frames-bitexact) is deliberately omitted for default remux rows (the source frame golden is still a `pending` placeholder per `src/scenarios/remux/_shared.ts:19-21`), so the gate is the structural `reference-reimport`.

**ffmpeg-wasm's path.** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` implements remux as a genuine FFmpeg stream copy: `[-i in -map 0 -c copy …]` with explicit `-map 0` so secondary tracks are not dropped, and for the `ts` target it injects `-muxdelay 0 -muxpreload 0` (`adapter.ts:2051-2055`) to kill FFmpeg's default ~1.4 s TS preload offset so the re-imported duration measures media length, not PTS origin. It first probes the input (`runInfo`) and asserts container compatibility (`assertRemuxContainerCompatible`, line 2040) before muxing. The re-import (oracle measurements) yields **reimportPackets=2308, reimportKeyframes=1423, reimportMediaTracks=2** against **goldenMediaTracks=2**, with **durationDeltaSec=0.0373 s** against a tolerance of **4.5 s** — a clean structural pass with the duration drift two orders of magnitude inside band. Because `-c copy` does zero entropy coding and the wasm muxer just repacketizes bytes, the whole 30 s/1080p remux completes in **145.99 ms wall = 205.50x realtime**.

**Why it beats mediabunny.** mediabunny also passes (`src/engines/mediabunny/adapter.ts:1244`), re-importing to **reimportPackets=2310, reimportKeyframes=1425, 2 media tracks, durationDelta=0.0800 s** — equally valid structurally (the ~2-packet/keyframe difference between the two engines is normal TS-muxer repacketization variance, well inside the oracle's 2% packet band and 4.5 s duration band). Correctness is a genuine tie at the structural rung. The separation is purely throughput: ffmpeg-wasm's wasm demux→mux loop finished in 145.99 ms while mediabunny's `streaming-lockstep` pipeline (env.configUsed: `backend:webcodecs`, `pipeline:streaming-lockstep`, `pure-ts-esm`, no SharedArrayBuffer, COOP/COEP not required) took 311.65 ms — **2.13x slower**. Note mediabunny does report peakMemory (60.07 MB) where ffmpeg-wasm's peakMemory sample is absent (n=0), and mediabunny's longtask total is far lower (315 ms vs 19963 ms) — but primaryMetric is wall, and on wall ffmpeg-wasm wins decisively. (The 19963 ms longtask figure for ffmpeg-wasm reflects the heavy single-threaded wasm core init/work blocking the main thread; it does not change the wall-clock op-time ranking but is a UX caveat noted below.)

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on performance: 311.65 ms wall (2.13x slower than ffmpeg-wasm) and 96.26x realtime (0.47x the winner's throughput). Correctness identical (reference-reimport pass, 2 tracks, durationDelta 0.0800 s). It is the legitimate runner-up, not wrong.
- **platform@chrome-149** — NA_ENGINE, honest: "engine does not declare operation 'remux'". The Chrome WebCodecs platform engine has no muxer/remux op; declaring NA is correct, not an under-declared capability.
- **mp4box@2.3.0** — NA_ENGINE, honest: "engine does not declare output container 'ts'". MP4Box is an ISO-BMFF (MP4/MOV) tool; it has no MPEG-TS muxer, so it cannot emit `ts`. Correctly NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: "engine does not declare operation 'remux'". This package is a parser/demuxer only (no muxing), so NA is genuine.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: "engine does not declare operation 'remux'". As named, it demuxes only; no remux/mux capability. Genuine NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest: "engine does not declare output container 'ts'". It can mux to some containers but not MPEG-TS; declining the `ts` target is correct, not under-declaration.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/index.ts:42` (case `{asset:'h264_1080p_30s.mp4', from:'mp4', to:'ts', videoCodecs:['h264'], audioCodecs:['aac']}`), built via `src/scenarios/remux/_shared.ts:84` (`buildRemux`), id `remux/h264_1080p_30s_mp4_to_ts`, op `remux`, options `{container:'ts'}`, default oracle `reference-reimport` (`_shared.ts:78-81`).
- **Fixture exists & is real:** `fixtures/media/h264_1080p_30s.mp4` = 31 MB on disk (stat confirmed). Real H.264/AAC media with goldens present (`fixtures/golden/h264_1080p_30s.mp4.{meta,packets,frames,ssim}.json`); golden packets/meta drive the re-import comparison. Not synthetic/empty/mock.
- **Winner implementation genuine:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — real FFmpeg `-map 0 -c copy` stream copy executed via `this.run(args)` (the wasm core), with a real `runInfo` probe + `assertRemuxContainerCompatible` precheck and TS-specific `-muxdelay 0 -muxpreload 0`. No canned output, no input→output passthrough faking a remux (it genuinely re-muxes to TS), no golden short-circuit, no error swallowing (errors propagate; `finally` only cleans MEMFS).
- **Oracle genuine:** `reference-reimport` via `semanticRemuxReimport` `src/core/oracles.ts:1273-1377`. It re-parses `ctx.output` with the reference engine and compares media-track count + per-type layout vs golden, duration delta vs golden within tolerance, and requires a video remux to expose keyframes (`oracles.ts:1361-1365`). Measurements are physically plausible for 30 s 1080p H.264: 2308 packets / 1423 keyframes (winner), 2 media tracks, durationDelta 0.0373 s. Not trivially satisfiable: it fails on wrong track count/layout, drifted duration, or zero keyframes. It is a *structural* (not bit-exact) gate, so this is a meaningful but not maximal-strength oracle.
- **Cached note:** Both PASS engines have `cached:true` ("cached previous PASS result"). The numeric evidence was reused, not freshly re-run this invocation — staleness risk exists, but the source fixture and adapter code are present and consistent with the cached measurements.
- **Verdict: REAL** — real 31 MB fixture, genuine FFmpeg stream-copy implementation, and a meaningful structural oracle with plausible measurements. The only deduction is that the gate is structural (reference-reimport) rather than bit-exact/golden-packets, which is an intentional family design choice, not a cheat.

## Confidence & caveats

- **Confidence: medium-high.** Winner selection is unambiguous (only 2 PASS; correctness tied; wall margin 2.13x is decisive on the primaryMetric).
- **Sampling weakness:** both engines ran n=1 (mad=0, p95=median). A 2.13x wall gap is large enough to survive sampling noise, but a single sample is weaker evidence than a multi-run median.
- **Cached results:** both PASS rows are `cached:true`; if the fixture or adapters changed since caching, numbers could be stale. Adapter/fixture inspected here are consistent with the cached output.
- **Oracle strength:** the gate is structural re-import, not bit-exact decode — adequate for lossless remux (coded samples are copied), but it would not catch a subtle per-sample corruption that still yields the right packet/track topology.
- **longtasks asymmetry:** ffmpeg-wasm's 19963 ms longtask total vs mediabunny's 315 ms means ffmpeg-wasm monopolizes the main thread far longer; for a UI-responsiveness-sensitive deployment mediabunny would be preferable despite the slower wall time. This does not change the primaryMetric-based ranking.
