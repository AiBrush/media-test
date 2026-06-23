# streaming-output/mp4_fragmented_cmaf

family: streaming-output | fixture asset: `h264_1080p_30s.mp4` (31 MB, exists in fixtures/media/) | op: remux (H.264 + AAC, MP4 -> fragmented MP4 / CMAF) | primaryMetric: wall (defaulted to STREAM_METRICS[0]) | passCount: 3 of 7

## Verdict

Best framework: **mp4box@2.3.0**. CONTESTED — three engines PASS (mp4box, ffmpeg.wasm, mediabunny), all satisfying the identical oracle pair (reference-reimport + mp4-box-layout). Correctness is comparable across all three, so the decision falls to PERFORMANCE on the primary metric `wall`.

Decisive factor: lowest wall-clock median. mp4box 155.23 ms vs ffmpeg.wasm 222.61 ms vs mediabunny 316.73 ms.

Margin over runner-up (ffmpeg.wasm): **1.43x faster wall** (222.61 / 155.23). Over mediabunny: 2.04x faster wall. mp4box also has the **tightest semantic delta** (reimport durationDeltaSec = 0.000 exactly, vs ffmpeg 0.0214 s, vs mediabunny 0.0800 s — the latter sitting right at the 0.1 s tolerance edge) and the highest throughputRealtime (193.26x vs ffmpeg 134.76x vs mediabunny 94.72x). Caveat: every bench metric here is n=1 (mad=0, warmup=1), so the perf ranking is single-sample evidence — directionally robust given the ~1.4x and ~2x gaps, but not statistically tight.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | reference-reimport:pass, mp4-box-layout:pass | 155.23 | 193.26 | 0 (not sampled) | 1361 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass, mp4-box-layout:pass | 222.61 | 134.76 | 0 (not sampled) | 294 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:pass, mp4-box-layout:pass | 316.73 | 94.72 | 0 (not sampled) | 9925 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fragmented' |

peakMemory and targetWrites are 0/n=0 for every engine: the runner does not yet thread a CountingTarget/memory probe through the remux op (documented gap in src/scenarios/streaming-output/_shared.ts:20-25, :64-68), so those columns are non-discriminating here.

## Why the winner wins (deep technical)

The operation is a lossless container reshape: take progressive H.264+AAC in MP4 (`h264_1080p_30s.mp4`) and re-emit it as a fragmented MP4 / CMAF — one `moov` init segment carrying an `mvex` (movie-extends) box followed by `moof`/`mdat` media-fragment pairs, with no re-encoding of coded samples. Because all three winners copy the same coded packets, correctness converges and the codec work is identical; what differs is the *fragmenter implementation* and the *runtime backend*.

mp4box runs entirely in **pure JavaScript** (env.configUsed.backend = "pure-js", hwAccel=false, wasmThreads=0, worker=false). Its remux path is the documented mp4box.js fragmenter: it parses the whole file with `createFile(true)` so mdat sample data survives (src/engines/mp4box/adapter.ts:920), sets one segment policy per track (`setSegmentOptions(t.id, null, { nbSamples: 1000, rapAlignement: true })`, adapter.ts:931-934), builds a single combined init segment via `initializeSegmentation()`, then `start()/flush()/stop()` synchronously emits every media fragment through the `onSegment` callback (adapter.ts:937-940), and finally concatenates init + fragments into one buffer (adapter.ts:942). Two design choices make it fast and structurally clean for THIS file: (1) `nbSamples: 1000` produces large fragments — the shard's mp4-box-layout shows only **topLevelBoxes=8** (ftyp@0, moov@32, then moof@1312/mdat@15796 and just a few more big moof/mdat pairs), so there is very little box-writing and concatenation overhead; (2) `rapAlignement: true` starts each segment on a random-access point, which is exactly the CMAF segmentation contract. The box-layout oracle (src/core/oracles.ts:365-403) confirms the fragmented invariants hold: moovOffset=32 present, moofOffset=1312 present, an mdat exists after the moof, and moof does not precede moov — all PASS. The reference-reimport oracle (oracles.ts:1225-1271 -> semanticRemuxReimport:1273) re-demuxes mp4box's output with mediabunny and finds reimportPackets=2308, reimportKeyframes=1423, reimportMediaTracks=2 == goldenMediaTracks=2, and **durationDeltaSec = 0** against a 0.1 s tolerance — i.e. mp4box's fragmenter reproduced the source packet table and duration exactly.

ffmpeg.wasm produces an equally valid fragmented MP4 but more slowly. Its remux is a real `ffmpeg -i in -map 0 -c copy -movflags frag_keyframe+empty_moov+default_base_moof out` stream-copy (src/engines/ffmpeg-wasm/adapter.ts:2044-2047, :2062-2065). `frag_keyframe` fragments on every video keyframe, yielding many more fragments — the shard shows topLevelBoxes=33 — and the work runs through the wasm FFmpeg muxer plus MEMFS write/read, so wall is 222.61 ms (1.43x slower than mp4box). reference-reimport still matches (2308 packets, 1423 keyframes, durationDeltaSec=0.0214 s). Notably ffmpeg's longtasks=294 ms is the LOWEST of the three (its heavy work happens inside the wasm call rather than as long main-thread tasks), but longtasks is not the primary metric.

mediabunny is the slowest. It uses the **WebCodecs** backend (env.configUsed.backend="webcodecs", hwAccel="prefer-hardware", pipeline="streaming-lockstep", coopCoep="not-required") with its IsobmffOutputFormat fastStart:'fragmented'. Its output is valid (topLevelBoxes=35, reimportPackets=2310, reimportKeyframes=1425 — two extra packets/keyframes, still within the 2% band) but it is 2.04x slower on wall (316.73 ms) and shows a dramatic **longtasks=9925 ms** plus the largest durationDeltaSec=0.0800 s, which is right at the 0.1 s tolerance boundary. For a pure container-reshape that needs no decoding, routing through the WebCodecs/streaming-lockstep pipeline is heavier than mp4box's direct in-memory box fragmentation, and the long main-thread blocking (9925 ms) is the worst UX of the three.

Net: for lossless H.264+AAC progressive-to-fMP4 fragmentation, mp4box's single-purpose pure-JS box fragmenter with coarse 1000-sample RAP-aligned segments is both the fastest (155.23 ms) and the most semantically faithful (Δduration = 0), beating a wasm FFmpeg stream-copy and a WebCodecs-pipeline muxer that do not need their extra machinery for this task.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost on perf: wall 222.61 ms is 1.43x mp4box's 155.23 ms; throughputRealtime 134.76x vs 193.26x. `frag_keyframe` produces far more fragments (33 top-level boxes vs 8). Correctness fine (reimport 2308 pkts / 1423 kf, Δduration 0.0214 s). Its one win — longtasks 294 ms — is on a non-primary metric.
- **mediabunny@1.48.0** — PASS but lost on perf: wall 316.73 ms (2.04x slower), throughputRealtime 94.72x (lowest), and longtasks 9925 ms (worst by far). Also the loosest semantic match (Δduration 0.0800 s, at the 0.1 s tolerance edge; 2 extra packets/keyframes). The WebCodecs streaming-lockstep pipeline is overkill for a sample-copy fragmentation.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'remux'". Honest: it is a read-only parser, no muxer/output path. Genuine NA.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'remux'". Honest: a demux-only library (FFmpeg-wasm demuxer bindings), no output muxing. Genuine NA.
- **platform@chrome-149** — NA_ENGINE, "engine does not declare operation 'remux'". Honest: the inline platform path is a progressive-only MP4 demux (per _shared.ts:34-39 "does not handle moof/traf") with no remux/fragment muxer. Genuine NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "engine does not declare feature 'fragmented'". Honest at the feature granularity: it may remux but does not declare the `fragmented` output capability that this scenario requires (base.ts:54 features:['fragmented']), so the runner correctly NAs it rather than letting it emit a non-fragmented MP4.

## Anti-cheat validation

- Scenario definition: src/scenarios/streaming-output/base.ts:47-62 (id 'mp4_fragmented_cmaf'), built via src/scenarios/streaming-output/_shared.ts:200-223 (buildStream). op='remux', input='h264_1080p_30s.mp4', options carries `fragmented:true` (shapeOptions, _shared.ts:160-169), features:['fragmented'], oracles forced to reference-reimport plus auto-added mp4-box-layout (mp4LayoutOracleApplies/_shared.ts:133-142).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — a real H.264 1080p 30s clip, not synthetic/empty/mock. Confirmed via ls.
- Winner adapter: src/engines/mp4box/adapter.ts:913-944 (remux fragmenter). It genuinely calls mp4box.js: parseToInfo with keepMdatData=true (:920), setSegmentOptions per track (:933), initializeSegmentation/start/flush/stop (:937-940), onSegment collects real media fragments (:925-927), concatBuffers joins init+fragments (:942). No canned bytes, no input->output passthrough, no short-circuit to golden, no swallowed errors (throws on no tracks / non-mp4 target).
- Gating oracles: mp4-box-layout (src/core/oracles.ts:365-426) parses the actual output bytes' top-level boxes and enforces fragmented invariants (moov present, moof present, mdat after moof, moof not before moov) — not trivially satisfiable. reference-reimport (oracles.ts:1225-1271 / semanticRemuxReimport:1273-1324) re-demuxes the output with mediabunny and diffs packet count (±2%), keyframe count, media-track count/layout, and duration (tol 0.1 s) against the golden — a real round-trip comparison, no SSIM/exactFrames==0 proxy, no smoke-only gate. Measurements are physically plausible: 2308 packets / 1423 keyframes / 2 tracks / 31.27 MB out for a 30 s 1080p clip.
- Cached: mp4box result has cached==true ("cached previous PASS result"). All three PASS rows are cached, so this is reused evidence, not a fresh re-run — staleness risk noted (per the launcher seeding caveat). The bench n=1/mad=0 values are single captured samples.
- Verdict: **REAL** — real 31 MB fixture, genuine mp4box.js fragmenter implementation, two meaningful structural+semantic oracles with plausible measurements.

## Confidence & caveats

Confidence: medium-high. The winner is unambiguous on the primary metric (wall) with a clear 1.43x margin and is simultaneously the most semantically faithful (Δduration=0). Caveats: (1) all bench values are n=1, mad=0, warmup=1 — single-sample, so exact ms figures are not statistically tightened, though the ordering is consistent across wall AND throughputRealtime AND durationDelta; (2) all three PASS rows are cached (cached==true), so numbers are reused from a prior run; (3) peakMemory/targetWrites are unsampled (runner gap), so the "bounded-memory stream target" dimension is not actually measured here — the win rests on speed + correctness, not memory; (4) mp4box's coarse 1000-sample fragments (8 boxes) satisfy the layout oracle but are less granular than ffmpeg's keyframe fragments — if a future oracle asserted MSE per-fragment appendability or CMAF segment-duration uniformity, ranking could shift.
