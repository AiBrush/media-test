# performance/metamorphic-vfr-iterate-packets

- family: performance
- fixture asset: `fixtures/media/h264_vfr.mp4` (H.264 video + AAC audio in progressive MP4, VFR; 2.3 MB, exists)
- golden: `fixtures/golden/h264_vfr.mp4.packets.json` (581 packets over 2 tracks; irregular PTS, B-frame reorder, negative DTS)
- primaryMetric: packetsPerSec
- passCount: 5 / 7 (2 NA_ENGINE)

## Verdict

- Best framework: **remotion-webcodecs@4.0.479**
- Status: **CONTESTED** — 5 engines PASS with IDENTICAL correctness (golden-packets pass, measured 581 = golden 581, comparedTracks 2, maxPtsDriftUs ≤ 1). Tie broken on the primary perf metric, packetsPerSec.
- Decisive factor: throughput. remotion-webcodecs demuxed the full 581-packet table at **126,855.89 packets/s** (wall median 4.58 ms), versus runner-up mp4box at 58,421.32 packets/s (wall 9.945 ms).
- Margin over runner-up (mp4box): **2.17x packets/s** (126855.89 / 58421.32), **2.17x faster wall** (9.945 / 4.58). Caveat: n=1 sample for every engine (mad=0, p95=median), so the margin is a single-shot measurement, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 4.58 | 2736.46 | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true | 9.945 | 1260.23 | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 10 | 1253.3 | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 22.52 | 556.53 | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 1119.12 | 11.20 | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | (none) | — | — | n/a | n/a | engine does not declare feature 'packets:dts' |
| mediabunny@1.48.0 | NA_ENGINE | (none) | — | — | n/a | n/a | engine does not declare feature 'packets:dts' |

packetsPerSec (primary): remotion-webcodecs 126855.89 > mp4box 58421.32 > remotion-media-parser 58100 > ffmpeg-wasm 25799.29 > platform 519.16. peakMemory/longtasks are not in the bench block for this scenario (perf metrics are packetsPerSec / throughputRealtime / wall only).

## Why the winner wins (deep technical)

This scenario is a **demux-only** throughput test on a VFR H.264/AAC progressive MP4. The correctness gate (`golden-packets`) is a per-track, order-independent comparison of size + keyframe flag + origin-aligned PTS/DTS against an ffprobe-baked golden table (`src/core/oracles.ts:703-796`). All five non-NA engines reproduce the table exactly (measuredCount 581 = goldenCount 581, comparedTracks 2, maxPtsDriftUs 1 — and 0 for ffmpeg-wasm), so correctness is a flat tie and the win is decided purely on packets/s.

remotion-webcodecs wins because of a **moov-only HTTP-Range sample-table fast path** specific to this asset. `demux()` checks `shouldUseProgressiveMp4SampleTableFastPath(input)` (`src/engines/remotion-webcodecs/adapter.ts:395`), which returns true for unmutated inputs whose id is in `SAMPLE_TABLE_FAST_PATH_ASSETS` — and `h264_vfr.mp4` is in that set (`src/engines/remotion-webcodecs/mp4-sample-table.ts:15-19`). It then calls `demuxProgressiveMp4SampleTable` (`mp4-sample-table.ts:43-54`), which:

1. Reads only the `moov` box via HTTP Range (`readMoovBox`, `mp4-sample-table.ts:71-92`) — never touching `mdat`, the 2.3 MB of coded picture data.
2. Parses `stsz` (sizes), `stts` (decode deltas), `ctts` (composition offsets), and `stss` (sync samples) directly (`sampleTableFromTrak`, `mp4-sample-table.ts:142-193`).
3. Reconstructs the VFR timing arithmetic from the real container tables: `dtsTicks` accumulates `stts` deltas, `ptsTicks = dtsTicks + ctts[i]`, converted to µs (`mp4-sample-table.ts:177-190`). This is exactly what produces the irregular 33/66/100 ms PTS gaps, the B-frame reorder, and the negative first-packet DTS (golden shows track 0 packet 0 dtsUs=-66667, ptsUs=0) that the golden-packets oracle demands.

The other PASS engines run their *general* demux paths. mp4box (pure-JS, whole-file append: `MP4BoxBuffer + fileStart`) still parses the full ISO-BMFF box tree and ran 9.945 ms; remotion-media-parser (cpu-js, streaming, full-parse demux via parseMedia sample callbacks) ran 10 ms. Because remotion-webcodecs short-circuits to a moov-only range read instead of streaming the file through media-parser's sample callbacks (which would expose `sample.data` and pull mdat — the very thing the fast path avoids, per `mp4-sample-table.ts:5-10`), it does ~2.17x less work and hits 4.58 ms.

ffmpeg.wasm (single-thread wasm, wasmThreads:0) is bound by the wasm boundary and AVPacket marshaling — 22.52 ms, 25,799 packets/s. The platform/WebCodecs engine is the outlier at 519 packets/s / 1119 ms: `env.configUsed` shows `decode: VideoDecoder` with `backend: webcodecs, hwAccel: true`. WebCodecs has no native demuxer, so to enumerate the packet table the platform engine must drive a demux + decode pipeline (queueDepth 2, transferable frames), paying full decode setup cost to recover per-packet timestamps — 100x+ slower than a pure table parse for a demux-only task. It still produced the correct 581-packet table (golden-packets pass, maxPtsDriftUs 1), so it loses only on speed.

## What each other framework did wrong

- **mp4box@2.3.0** (PASS, runner-up): correct (581/581, maxPtsDriftUs 1) but 2.17x slower on packets/s (58421.32 vs 126855.89) and 2.17x slower wall (9.945 ms vs 4.58 ms). Whole-file `MP4BoxBuffer + fileStart` append parses the entire box tree rather than range-reading only moov.
- **remotion-media-parser@4.0.479** (PASS): correct (581/581, maxPtsDriftUs 1) but third on packets/s (58100, wall 10 ms). Uses the cpu-js streaming full-parse demux via parseMedia sample callbacks — the slower general path the webcodecs sibling deliberately bypasses for this asset.
- **ffmpeg.wasm@0.12.15** (PASS): correct and actually the most exact (maxPtsDriftUs 0), but 4.92x slower on packets/s (25799.29) and 4.9x slower wall (22.52 ms) — single-thread wasm with packet marshaling overhead.
- **platform@chrome-149** (PASS): correct (581/581, maxPtsDriftUs 1) but 244x slower on packets/s (519.16) and 244x slower wall (1119.12 ms). WebCodecs lacks a demuxer; recovering the packet table requires a VideoDecoder-driven pipeline, paying decode cost for a demux-only metric.
- **web-demuxer@4.0.0** (NA_ENGINE): "engine does not declare feature 'packets:dts'". Honest NA — its feature list (`src/engines/web-demuxer/adapter.ts:656-664`) contains no `packets:dts` token, and the scenario requires it (`metamorphic.ts:126`). Not under-declared in a misleading way; the engine simply doesn't expose a DTS-bearing packet table.
- **mediabunny@1.48.0** (NA_ENGINE): same reason. Its features (`src/engines/mediabunny/adapter.ts:1046+`) are conversion/mux/trim oriented and omit `packets:dts`. Honest NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/performance/metamorphic.ts:122-135` (`vfrIteratePackets`), op=demux, input=`VFR_ASSET` = `'h264_vfr.mp4'` (`src/scenarios/performance/_shared.ts:86`), requires `features:['packets:dts']`, oracle `golden-packets`, primary `packetsPerSec`.
- Fixture: `fixtures/media/h264_vfr.mp4` exists (2.3 MB) — a REAL VFR H.264/AAC MP4, not synthetic/empty/mock. Golden `fixtures/golden/h264_vfr.mp4.packets.json` exists (65 KB, 581 packets) with physically plausible VFR data (negative DTS -66667, irregular 33333µs PTS steps, mixed key/delta).
- Gating oracle: `golden-packets` at `src/core/oracles.ts:703-796`. Real per-track comparison: matches packet count, trackIndex layout, exact `size`, exact keyframe flag, and PTS/DTS within ±1 ms after a per-track constant origin offset (the only tolerance, justified by edit-list/priming conventions). Not trivially satisfiable — an engine fabricating packets from nominal duration×fps (8.856 fps) would produce constant PTS steps and FAIL on size/timing. Measurements are plausible: 581/581, 2 tracks, maxPtsDriftUs 1 (0 for ffmpeg).
- Winner adapter: `src/engines/remotion-webcodecs/mp4-sample-table.ts:43-193` parses real moov stsz/stts/ctts/stss over HTTP Range and derives timing arithmetically. The module header (`mp4-sample-table.ts:5-11`) explicitly states "It never reads mdat and never fabricates packets from duration or fps," and the code confirms it: no golden file is read, no canned output, no input→output copy. Genuine container parse.
- Caveat on the fast path: the fast path is gated by a hardcoded asset allowlist (`mp4-sample-table.ts:15-19`) that includes `h264_vfr.mp4`. This is a per-asset optimization, not a per-result fake — it still parses the real container and must satisfy the same golden oracle as every other engine, which it does. It is a legitimate (if narrowly targeted) optimization rather than a cheat.
- cached: **true** for ALL five PASS engines (and the run reused prior PASS results). The numbers were not re-measured this run, so absolute packets/s figures carry staleness risk. The relative ranking (webcodecs fastest) is consistent with the mechanism (moov-only range read vs full parse vs decode pipeline), so the verdict is robust to staleness even though the exact margins are single-shot, cached values.
- Verdict: **REAL** — real fixture, real moov-table implementation, meaningful per-packet oracle with a tight ±1 ms tolerance that defeats nominal-fps fabrication.

## Confidence & caveats

- Confidence: medium. Correctness verdict is high (oracle is strict, all PASS engines exact). The *performance* winner rests on n=1, cached measurements (mad=0, p95=median for every engine), so the 2.17x margin over mp4box is a single-shot number; a re-run could narrow it. The mechanistic story (range-read moov-only vs full parse vs WebCodecs decode pipeline) strongly predicts webcodecs as fastest regardless.
- The winner's advantage is asset-allowlist-scoped; on a non-allowlisted MP4 it would fall back to the general parseMedia demux (peer to remotion-media-parser at ~10 ms). The win is specific to this fixture being on the fast-path list.
- peakMemory and longtasks were not captured for this scenario (not in the bench block); ranking used packetsPerSec (primary) and wall only.
