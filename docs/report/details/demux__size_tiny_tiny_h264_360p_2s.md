# demux/size_tiny_tiny_h264_360p_2s

family: demux | fixture asset: `tiny_h264_360p_2s.mp4` (H.264/AAC in MP4, ~173 KB) | primaryMetric: wall (ms) | passCount: 7/7

## Verdict

- Best framework: **mp4box@2.3.0** (`mp4box` adapter).
- **CONTESTED**: all 7 engines PASS with byte-identical correctness on the single gate (`golden-packets`). Correctness is therefore a perfect tie — the decision falls to performance per the procedure (4b).
- Decisive factor: lowest wall-clock median. mp4box demuxes the whole sample table in **4.85 ms**, edging out platform/WebCodecs (5.145 ms) and mediabunny (5.495 ms).
- Margin over runner-up (platform@chrome-149, 5.145 ms): **1.06x faster wall** (5.145/4.85). Margin over mediabunny: 1.13x. Over the slowest passing engine, web-demuxer (95.395 ms): **19.7x faster**. This is a thin, single-sample (n=1) margin — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-packets:pass | **4.850** | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass | 5.145 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:pass | 5.495 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass | 8.280 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass | 13.795 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass | 22.190 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass | 95.395 | n/a | n/a | n/a | cached previous PASS result |

All engines: golden-packets measurements = `measuredCount:155, goldenCount:155, comparedTracks:2`. maxPtsDriftUs = 0 (mp4box has 0? see note) — actually: ffmpeg-wasm and web-demuxer report maxPtsDriftUs=0; mp4box, platform, mediabunny, remotion-media-parser, remotion-webcodecs report maxPtsDriftUs=1µs (one tick of microsecond rounding). bench has only the `wall` metric; throughputRealtime/peakMemory/longtasks were not recorded for this tiny demux row (n/a above).

## Why the winner wins (deep technical)

This scenario is a pure **container demux** of a tiny progressive (faststart) MP4 holding two tracks: a 60-sample H.264/AVC video track and a 95-sample AAC audio track (golden total 155 packets, 96 keyframes — every audio frame is a sync sample plus the video IDR/keyframes). No pixels are decoded; the test only walks the ISO-BMFF sample tables and compares the resulting packet table (size, keyframe flag, per-track origin-aligned pts/dts) against the ffprobe golden in `fixtures/golden/tiny_h264_360p_2s.mp4.packets.json`.

Because the only gate is `golden-packets` and **every** engine reproduces the table exactly (155/155, layout {track0:60, track1:95}, max residual pts drift ≤1µs after per-track origin alignment — `src/core/oracles.ts:761-795`), correctness cannot separate them. The 1µs drift on five of the engines is sub-tolerance rounding noise (the oracle tolerance is `seekToleranceUs` = 1ms = 1000µs, `oracles.ts:738`), not a real error. So the win is decided on wall time.

mp4box wins the wall race because for a tiny, fully-buffered, faststart MP4 the *fastest* path is exactly what its adapter does: read the whole file into one ArrayBuffer, parse the `moov` box once, and walk the in-memory sample table with zero codec involvement. In `src/engines/mp4box/adapter.ts:765-804` the adapter (1) reads `input.arrayBuffer()`, (2) parses to `info` with `keepMdatData=true` via `parseToInfo`, (3) registers an `onSamples` sink that copies only the scalar fields it needs — `s.size`, `s.cts`/`s.dts` converted to µs via `Math.round((s.cts/ts)*1_000_000)` (`adapter.ts:783-784`), and `!!s.is_sync` for the keyframe flag (`adapter.ts:785`) — and immediately frees sample memory with `file.releaseUsedSamples` (`adapter.ts:790`), (4) drives extraction to completion synchronously with `file.start(); file.flush(); file.stop()` (`adapter.ts:797-799`), and (5) sorts the global table by dts then trackIndex (`adapter.ts:802`). This is a pure-JS box/sample-table walk (`env.configUsed.backend == "pure-js"`, `whole-file-append(MP4BoxBuffer+fileStart)`); there is no WebCodecs handshake, no wasm module instantiation, and no worker spin-up. For 155 samples that overhead-free path is the cheapest possible, hence 4.85 ms.

The two nearest rivals are slower for structural reasons even though both also "demux" correctly:
- **platform@chrome-149 (5.145 ms, runner-up)** uses `backend: webcodecs, hwAccel:true, pipeline:streaming` (its `configUsed`). Routing the same packet walk through the browser's WebCodecs/`VideoDecoder`-oriented streaming pipeline adds setup overhead that a tiny 155-packet file cannot amortize — it pays for machinery it does not need when only the packet table is wanted. Margin: mp4box is 1.06x faster.
- **mediabunny@1.48.0 (5.495 ms)** runs `backend:webcodecs, coopCoep:not-required, pipeline:streaming-lockstep` (its `configUsed`). The lockstep streaming demux and canvas-pool init cost (canvasPoolSize 4) are wasted on a demux-only row, so it lands 1.13x behind mp4box.

The wasm and parser engines are further back exactly as their backends predict: **ffmpeg.wasm (8.28 ms)** pays wasm module/FS overhead per call; **remotion-media-parser (13.795 ms, `backend:cpu-js, fieldsTier:full-parse(demux)`)** does a full streaming parse in JS; **remotion-webcodecs (22.19 ms)** carries the heaviest streaming-backpressure + bufferWriter setup; **web-demuxer (95.395 ms)** is ~20x slower than mp4box — its FFmpeg-wasm-backed demuxer pays a large fixed wasm init/threading cost that dwarfs the actual 155-sample walk at this tiny size.

## What each other framework did wrong

(None failed — this is a 7/7 PASS row; "wrong" = lost the performance tiebreak with identical correctness.)
- **platform@chrome-149**: correct (155/155, drift 1µs) but 1.06x slower wall (5.145 vs 4.850 ms) — WebCodecs/streaming setup overhead unneeded for a packet-table walk.
- **mediabunny@1.48.0**: correct (155/155, drift 1µs) but 1.13x slower (5.495 ms) — streaming-lockstep + canvas-pool init cost on a decode-free row.
- **ffmpeg.wasm@0.12.15**: correct (155/155, drift 0µs) but 1.71x slower (8.280 ms) — wasm/Emscripten-FS overhead.
- **remotion-media-parser@4.0.479**: correct (155/155, drift 1µs) but 2.84x slower (13.795 ms) — pure cpu-js full-parse demux.
- **remotion-webcodecs@4.0.479**: correct (155/155, drift 1µs) but 4.57x slower (22.190 ms) — streaming-backpressure + bufferWriter setup overhead.
- **web-demuxer@4.0.0**: correct (155/155, drift 0µs) but 19.7x slower (95.395 ms) — FFmpeg-wasm demuxer fixed init cost dominates at tiny scale.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:314-321` (asset `tiny_h264_360p_2s.mp4`, container mp4, bucket tiny, videoCodecs [h264], audioCodecs [aac]; notes: "Tiny 360p H.264/AAC: two-track packet table at small scale (golden 60 video + 95 audio)").
- Fixture exists and is real: `fixtures/media/tiny_h264_360p_2s.mp4`, ~173 KB on disk — a genuine encoded H.264/AAC MP4, not synthetic/empty/mock.
- Golden exists and is non-trivial: `fixtures/golden/tiny_h264_360p_2s.mp4.packets.json` (17 KB) decodes to exactly 155 packet entries — 60 on track 0 (video) + 95 on track 1 (audio), 96 sync packets — matching the notes (60 video + 95 audio). Physically plausible for a ~2s 360p clip (~30fps video → ~60 frames; ~48µs/1024-sample AAC → ~95 frames).
- Oracle: `golden-packets` at `src/core/oracles.ts:701-796`. It performs a real per-track, order-independent comparison: count + trackIndex multiset layout must match, then per packet it checks `size` exactly, `keyframe` flag exactly, and pts/dts within ±1ms after subtracting a single per-track constant origin offset (`oracles.ts:774-792`). Not trivially satisfiable: any wrong sample size, missing/extra packet, flipped keyframe flag, or varying timing residual fails. Measured numbers in the shard are plausible (155/155, drift 0–1µs).
- Winner adapter: `src/engines/mp4box/adapter.ts:765-804` (`demux`). Genuinely calls MP4Box.js (`createFile`, `setExtractionOptions`, `onSamples`, `start/flush/stop`), reads real sample scalars, frees memory, and sorts. No canned output, no copy-input-to-output, no golden short-circuit, no error swallowing.
- Verdict: **REAL** — real fixture + real MP4Box.js sample-table walk + meaningful structural oracle that compares against an ffprobe golden.
- Cached note: the winner's result has `cached:true` ("cached previous PASS result"), as do ALL 7 engines. The numbers were reused, not re-run, so the thin 0.3–0.6 ms gaps between the top three are staleness-sensitive.

## Confidence & caveats

- Confidence: **medium**. Correctness verdict (all REAL/PASS) is high-confidence. The *winner* ranking is medium because the tiebreak rests entirely on wall time with **n=1, mad=0** (a single sample, no spread) — at 4.85 vs 5.145 vs 5.495 ms the gaps are within plausible single-run jitter for a sub-10ms operation, and **every** result is cached (not freshly re-run). A re-run could reorder the top three.
- ffmpeg.wasm and web-demuxer report maxPtsDriftUs=0 (slightly tighter timing) vs 1µs for the top three, but this is sub-microsecond rounding and does not change correctness ranking; it does not promote them past their large wall-time deficits.
- No peakMemory/throughput/longtasks were recorded for this row, so the only performance axis available is wall — the ranking would be more robust with memory and multi-sample data.
