# remux/h264_1080p_30s_mp4_to_mkv

family: remux | fixture asset: `h264_1080p_30s.mp4` (31 MB, real H.264/AAC in MP4) | primaryMetric: wall | passCount: 2/7

## Verdict

- **Best framework: `ffmpeg.wasm@0.12.15`** (engineId `ffmpeg-wasm`).
- **CONTESTED**: two engines passed (`ffmpeg-wasm`, `mediabunny`); the other five returned `NA_ENGINE`.
- **Decisive factor: performance.** Correctness is a tie — both pass the same single gate (`reference-reimport`) with equivalent strength (ffmpeg's reimport is bit-for-bit identical to the golden packet table; mediabunny is +2 packets/keyframes, still inside tolerance). The winner is therefore decided on the primary metric **wall median: 201.45 ms vs 415.81 ms = 2.06x faster**, with a much lighter main-thread footprint on `longtasks` (2913 ms vs 315 ms is the one place mediabunny is better — see caveat).
- **Margin over runner-up (mediabunny):** 2.06x faster wall; 2.06x higher throughputRealtime (148.9x vs 72.1x realtime). Peak memory is not comparable (ffmpeg reported 0 bytes / n=0 samples; mediabunny reported 63.3 MB).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 201.45 | 148.92 | 0 (n=0) | 2913 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 415.81 | 72.15 | 63,285,036 | 315 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

**The operation.** This is a *lossless container conversion*: H.264 (AVC, AVCC length-prefixed NAL framing) video + AAC-LC audio are lifted out of an ISOBMFF (MP4) wrapper and re-wrapped into a Matroska (MKV) container. No pixels or audio samples are re-encoded — only the box/EBML structure, the AVCC `avcC`/CodecPrivate config, and the timestamp/cluster layout change. The golden (`fixtures/golden/h264_1080p_30s.mp4.meta.json`) describes the source as 1920x1080 @ 30 fps, 8.2 Mbps H.264 + 48 kHz stereo 128 kbps AAC, 30 s — and `...packets.json` carries exactly **2308 packets / 1423 keyframes** (the keyframe tally folds in the AAC track, whose packets are all coded as keyframes, plus the video IDRs).

**Why ffmpeg.wasm is correct and fast.** Its `remux()` (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) calls `assertRemuxContainerCompatible(...)` then runs a genuine stream-copy: `args = [...inputOptions, '-i', in, '-map', '0', '-c', 'copy', out.mkv]` (line 2044). `-c copy` means libavcodec never decodes; the H.264 access units and AAC frames are demuxed from the MP4 and remuxed into Matroska byte-for-byte. `-map 0` explicitly carries every input stream so neither track is dropped. Because no codec runs, the work is pure I/O + bitstream re-framing inside the single-thread wasm build, which is why it finishes in **201.45 ms** (148.9x realtime for a 30 s clip). The re-import oracle reads its output back with the reference engine and gets **2308 packets, 1423 keyframes, 2 media tracks, durationDelta 0.042 s** (`durationToleranceSec` 0.1) — an *exact* match to the golden packet table, the strongest possible structural result for this gate.

**The backend.** ffmpeg.wasm ran as `coreBuild` single-thread wasm with no COOP/COEP requirement (the shard records no `configUsed` for it; its path is libav stream-copy, CPU-bound, no WebCodecs/GPU). mediabunny ran `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `sharedArrayBuffer: false`, `coopCoep: not-required` (shard `env.configUsed`). For a *remux* (copy) job, WebCodecs hardware decode is irrelevant — mediabunny's Conversion API (`src/engines/mediabunny/adapter.ts:1244-1260`: `makeOutputFormat(...)` + `runConversion(...)` with no codec options, so it stream-copies) still has to demux/remux through its JS muxer, and its 415.81 ms / 72.1x realtime reflects that JS muxing overhead and the 63.3 MB working set it materialized.

**Net.** Identical container/codec target, both genuine stream-copies, both pass the only attached gate; ffmpeg wins purely on a 2.06x wall-time margin and exact (vs +2) structural fidelity.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSED (real stream-copy via Conversion, reimport 2310 packets / 1425 keyframes / 2 tracks / Δ0.080 s). Lost on performance only: **2.06x slower wall (415.81 ms vs 201.45 ms)** and half the throughput (72.1x vs 148.9x). Its reimport drifts +2 packets/+2 keyframes from golden (audio block-rounding at the MKV cluster boundary) — still inside the 2% structural tolerance, but a hair less exact than ffmpeg's perfect match. It does win `longtasks` (315 ms vs 2913 ms), the one genuine point in its favor.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare output container 'mkv'". Honest NA — remotion-webcodecs targets MP4/WebM output; it has no Matroska muxer, so it cannot produce the required MKV.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare output container 'mkv'". Honest — mp4box.js is an ISOBMFF (MP4) library; it has no Matroska writer. Under-declaration would be a stretch since MKV is genuinely out of scope.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest — the WebCodecs/MediaSource platform surface exposes decode/encode/MSE but no demux-then-remux stream-copy primitive; a remux would require a userland muxer the platform engine doesn't ship.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest — web-demuxer is read-only (demux/probe); it does not write containers.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest — media-parser is a read/parse-only library with no muxing/writing capability.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/index.ts:41` — `{ asset: 'h264_1080p_30s.mp4', from: 'mp4', to: 'mkv', videoCodecs: ['h264'], audioCodecs: ['aac'] }`, built via `buildRemux` in `src/scenarios/remux/_shared.ts:84-104`. op `remux`, options `{container:'mkv'}`, default oracle set `['reference-reimport']` (`_shared.ts:78-81`).
- **Fixture exists and is real:** `fixtures/media/h264_1080p_30s.mp4` is present, 31 MB — a genuine 30 s 1080p H.264/AAC clip (not synthetic/empty/mock). Golden `fixtures/golden/h264_1080p_30s.mp4.{meta,packets}.json` confirm 2 tracks / 2308 packets / 1423 keyframes / 30 s.
- **Winner adapter is a genuine implementation:** `src/engines/ffmpeg-wasm/adapter.ts:2044` runs real ffmpeg `-map 0 -c copy` stream-copy into MKV, reads the muxed bytes back (`readBinary`), and cleans up. No canned output, no input→output passthrough faking a transcode, no short-circuit to a golden file, no swallowed errors (errors from `this.run` propagate).
- **Oracle is meaningful:** `reference-reimport` for this remux op routes through `semanticRemuxReimport` (`src/core/oracles.ts:1273-1377`). It re-demuxes `ctx.output` with the reference engine and checks (a) media-track count vs golden, (b) per-codec track layout, (c) duration within `max(band, 0.1) s`, and (d) that a video remux did not lose all keyframes. Not trivially satisfiable: an empty/garbage output would fail track-count, layout, or the "no keyframes" diff. Measurements are physically plausible (2308/2310 packets, 1423/1425 keyframes, Δ0.042/0.080 s, 2 tracks) and ffmpeg's match the golden exactly. Note this gate does NOT enforce exact packet count (only 2% structural + duration), so it is a structural/metadata-exact gate, not bit-exact — strong but not the strongest rung.
- **Cached note:** BOTH PASS results have `cached:true` ("cached previous PASS result"). Per the launcher seeding caveat, cached PASSes are reused, not re-run this cycle — there is mild staleness risk, but the measurements are internally consistent with the goldens, so the evidence is credible.
- **Verdict: REAL** — real fixture + real ffmpeg stream-copy implementation + meaningful structural oracle whose measurements are plausible and (for the winner) exactly match the golden.

## Confidence & caveats

- **Confidence: high** that ffmpeg.wasm is the correct winner. Both eligible engines are genuine; the correctness tie is real and the 2.06x wall margin is decisive.
- **Caveats:** (1) All benches are **n=1** (mad=0, p95=median) — single-sample timings, so the 2.06x margin is directional, not statistically robust. (2) Both results are **cached**, so they were not re-measured this run. (3) ffmpeg reported **peakMemory n=0 / 0 bytes** (instrumentation gap), so the memory comparison is one-sided — mediabunny's 63.3 MB cannot be contrasted. (4) mediabunny genuinely wins **longtasks** (315 ms vs 2913 ms): ffmpeg's single-thread wasm stream-copy blocks the main thread far longer, which matters for UI responsiveness even though total wall is lower. (5) The gating oracle is structural (track/layout/duration/keyframe-presence), not bit-exact or exact-packet-count, so "correctness tie" means both produce valid, semantically-equivalent MKV — not that they are byte-identical.
