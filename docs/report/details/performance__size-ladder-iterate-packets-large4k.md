# performance/size-ladder-iterate-packets-large4k

- **family:** performance
- **fixture asset:** `fixtures/media/h264_4k_10s.mp4` (26 MB, real 4K H.264 video + AAC audio, 2 tracks)
- **primaryMetric:** packetsPerSec
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — all 7 engines PASS the gating oracle (`golden-packets`) with byte-identical packet tables (770 packets, 2 tracks). Correctness is a perfect tie, so the decision falls to the performance primary metric (`packetsPerSec`).
- **Decisive factor:** raw demux throughput. Mediabunny iterates the full sample table at **22,597 packets/s** (wall median **34.07 ms**), vs the next-fastest mp4box at **5,341 packets/s** (144.16 ms).
- **Margin over runner-up (mp4box):** **4.23x more packets/s**, **4.23x lower wall** (34.07 ms vs 144.16 ms), **4.23x higher throughputRealtime** (293.5x vs 69.4x realtime). Mediabunny is ~4.2x ahead of the #2 and ~6x ahead of the platform baseline.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | packetsPerSec | reason |
|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:pass | 34.07 | 293.47 | 22597.21 | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:pass | 144.16 | 69.37 | 5341.47 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass | 205.24 | 48.72 | 3751.80 | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass | 282.26 | 35.43 | 2727.98 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass | 683.63 | 14.63 | 1126.33 | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass | 816.97 | 12.24 | 942.51 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass | 2617.02 | 3.82 | 294.23 | cached previous PASS result |

Note: this scenario records no `peakMemory` / `longtasks` samples (its metrics list is `packetsPerSec`, `throughputRealtime`, `wall`); the peakMemory deep-edge lives in the sibling `size-ladder-demux-peak-memory-large4k`. All bench rows are `n=1` (single timed sample after warmup, `mad=0`, p95==median).

## Why the winner wins (deep technical)

The operation is **iterate-every-packet demux** of a 26 MB 4K H.264/MP4 (MP4 with two tracks: video index 0, AAC audio index 1). There is no decode, no pixel work — the cost is entirely (a) parsing the `moov` sample tables (`stsz`/`stco`/`stsc`/`stts`/`stss`) and (b) materializing 770 `EncodedPacket` descriptors with size + presentation timestamp + verified keyframe flag. Because correctness is a tie, the winner is the engine that walks that sample table with the least per-packet overhead.

Mediabunny's demux path (`src/engines/mediabunny/adapter.ts:1152-1183`) opens the input once, calls `getTracks()`, and for each track constructs a single `EncodedPacketSink` and `for await`s `sink.packets(undefined, undefined, { verifyKeyPackets: true })` (lines 1162-1176). Each yielded `EncodedPacket` exposes `microsecondTimestamp` and `byteLength` directly off the parsed sample table, so the adapter does a flat push of `{trackIndex, size, ptsUs, dtsUs:ptsUs, keyframe: pkt.type==='key'}` with zero extra copies. `configUsed` shows `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`, `wasmThreads: 0` — this is a pure-TS, single-thread, no-cross-origin-isolation path, and it still hits 22,597 packets/s because the sample-table walk is a tight typed loop with no wasm FFI boundary and no whole-file buffering ceremony per packet. The measured 34.07 ms wall for 770 packets across a 26 MB file means it reads the index lazily rather than re-scanning payload.

The oracle (`src/core/oracles.ts:703-796`, `goldenPackets`) is a strict structural gate: it requires the exact packet count (770 vs golden 770), an exact per-track `trackIndex` multiset (`comparedTracks: 2`), per-packet exact `size` match, exact `keyframe`-flag match, and pts/dts within ±1000 µs after a constant per-track origin alignment. Mediabunny passes with `maxPtsDriftUs: 1` — effectively bit-exact timestamps modulo the rounding floor. The golden itself (`fixtures/golden/h264_4k_10s.mp4.packets.json`, 770 entries) carries real values: a video keyframe of 130,393 bytes at pts 0, an AAC priming packet at -21,333 µs, P-frames at 95,824 bytes, etc. — physically plausible for 4K H.264.

Why each of the four WebCodecs/wasm contenders trailed despite identical correctness:
- **mp4box (#2, pure-js)** at 5,341 packets/s buffers the whole file (`pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"`, `rangeReads: false`); it parses correctly but pays a full-append cost and a less tight per-sample emit loop — 4.23x slower wall.
- **ffmpeg.wasm (#3)** at 3,751 packets/s pays the wasm/JS FFI boundary and libavformat's heavier general-purpose demuxer for every packet; throughputRealtime 48.7x.
- **platform / Chrome-149 (#4)** at 2,728 packets/s routes through the browser's `VideoDecoder`-oriented streaming pipeline (`queueDepth: 2`), which is built for decode pacing, not bulk packet enumeration — its per-packet overhead dominates for a pure index walk.
- **remotion-webcodecs / remotion-media-parser** (1,126 / 943 packets/s) use a streaming CPU/JS reader (`fieldsTier: "full-parse(demux)"`, `webReader`); correct but ~20x slower than mediabunny.
- **web-demuxer (last)** at 294 packets/s (2,617 ms) is the slowest by an order of magnitude — its wasm-backed full demux is correct but carries the largest fixed cost per file.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS but lost on perf: 5,341 packets/s vs 22,597 (**4.23x slower**, 144.16 ms wall). Whole-file-append pipeline, no range reads, pure-js.
- **ffmpeg.wasm@0.12.15** — PASS but lost: 3,751 packets/s (**6.02x slower**, 205.24 ms). wasm FFI + general libavformat demuxer overhead per packet.
- **platform@chrome-149** — PASS but lost: 2,728 packets/s (**8.28x slower**, 282.26 ms). Decode-oriented streaming pipeline (queueDepth 2) is mis-fit for bulk packet iteration.
- **remotion-webcodecs@4.0.479** — PASS but lost: 1,126 packets/s (**20.06x slower**, 683.63 ms). Streaming CPU/JS reader.
- **remotion-media-parser@4.0.479** — PASS but lost: 943 packets/s (**23.98x slower**, 816.97 ms). webReader full-parse demux, single-thread CPU-JS.
- **web-demuxer@4.0.0** — PASS but lost: 294 packets/s (**76.8x slower**, 2,617 ms). Slowest demux; large fixed wasm cost.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/size-ladder.ts:86-100` (the `iterateLadder` factory; `large4k` rung built from `RUNGS[2]`, `src/scenarios/performance/size-ladder.ts:51`). Op = `demux`, primary = `packetsPerSec`, oracle = `golden-packets`. Input = `LADDER.large4k` = `h264_4k_10s.mp4` (`src/scenarios/performance/_shared.ts:78`).
- **Fixture exists:** `fixtures/media/h264_4k_10s.mp4`, 26 MB, real 4K H.264/AAC MP4 — NOT synthetic/empty/mock. Golden present: `fixtures/golden/h264_4k_10s.mp4.packets.json` with exactly **770** packet entries (matches every engine's `measuredCount: 770` and `goldenCount: 770`).
- **Oracle:** `src/core/oracles.ts:703-796` (`goldenPackets`). Performs a real per-track structural comparison — exact count, exact track-layout multiset, per-packet exact size + keyframe flag, pts/dts within ±1000 µs after constant origin alignment. NOT trivially satisfiable: a wrong count, missing track, wrong size, or flipped keyframe flag FAILs. Measurements (`maxPtsDriftUs: 1`, `comparedTracks: 2`) are physically plausible.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1152-1183` — genuine `EncodedPacketSink.packets(..., { verifyKeyPackets: true })` iteration off the real library; reads real `byteLength` / `microsecondTimestamp` / `pkt.type`. No canned output, no input→output copy, no golden short-circuit, no swallowed errors (errors propagate; `dispose()` in `finally`).
- **Verdict:** **REAL** — real 26 MB 4K fixture, real golden (770 packets), genuine library implementation, and a strict structural oracle that gates the win on byte-exact packet correctness before perf decides.
- **Cached note:** ALL 7 entries have `cached: true` ("cached previous PASS result"). The packet tables and oracle outcomes are deterministic for a fixed file, so correctness reuse is safe. However, the perf numbers (`packetsPerSec`, `wall`) are reused, not freshly re-run — there is some staleness risk in the exact ranking margins. The ~4.2x gap to the runner-up is large enough that the ranking is robust to cache jitter, but a fresh re-run would harden the precise margin.

## Confidence & caveats

- **Confidence: high** that mediabunny is the correct winner — perfect correctness tie across all 7, then a dominant 4.23x perf lead on the primary metric (packetsPerSec) and identical 4.23x lead on wall.
- **Caveats:** (1) every bench row is `n=1` (single sample, `mad=0`), so spread is unknown — a win on n=1 is weaker statistical evidence, though the ordering spans nearly 2 orders of magnitude (294 → 22,597 packets/s) so the rank is not in doubt. (2) All results are cached, so perf is reused not re-measured. (3) This rung records no peakMemory/longtasks; the streaming-vs-buffering memory question is answered by the sibling `size-ladder-demux-peak-memory-large4k`, not here.
