# demux/h264_4k_10s

family: demux | fixture asset: `h264_4k_10s.mp4` (MP4, H.264 video + AAC audio, ~26 MB) | primaryMetric: wall | passCount: 7/7

## Verdict

- Best framework: **mediabunny@1.48.0**
- CONTESTED: all 7 engines PASS, and all pass the identical single gating oracle (`golden-packets`) with the same 770-packet / 2-track result. Correctness is therefore tied at the top of the ladder, so the decision falls to PERFORMANCE.
- Decisive factor: wall-clock demux latency. mediabunny median **27.77 ms** vs runner-up mp4box **92.92 ms** = **3.35x faster**, and dramatically faster than the rest (ffmpeg.wasm 135.84 ms = 4.89x, remotion-media-parser 1930.72 ms = 69.5x, web-demuxer 2447.76 ms = 88.2x, platform 6015.39 ms = 217x).
- Margin over runner-up (mp4box): 3.35x faster wall.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true (770 pkts, maxPtsDriftUs=1) | 27.77 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true (770 pkts, maxPtsDriftUs=1) | 92.92 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (770 pkts, maxPtsDriftUs=0) | 135.84 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (770 pkts, maxPtsDriftUs=1) | 696.02 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (770 pkts, maxPtsDriftUs=1) | 1930.72 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true (770 pkts, maxPtsDriftUs=0) | 2447.76 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true (770 pkts, maxPtsDriftUs=1) | 6015.39 | n/a | n/a | n/a | cached previous PASS result |

(The shard records only the `wall` metric for this row; throughputRealtime / peakMemory / longtasks were not captured for any engine.)

## Why the winner wins (deep technical)

The operation is pure demux of a 4K H.264-in-MP4 file with an AAC audio track: enumerate the packet table (per-track sizes, keyframe flags, PTS/DTS) without decoding pixels. The gating oracle `golden-packets` (src/core/oracles.ts:703) groups packets per track, sorts each group by dts then pts, and compares position-by-position: `size` and `keyframe` flag must match exactly, while PTS/DTS are tolerated within ±1 ms after a constant per-track origin shift (src/core/oracles.ts:774-792). For this 4K asset the discriminating column is per-packet `size` — the scenario note (src/scenarios/demux/index.ts:155) says this row exists specifically to "verify the size column at high resolution against golden," because 4K frames produce large, distinctively-sized packets that catch off-by-one slice/sample-table parsing. Every engine returned 770 packets across 2 tracks with `maxPtsDriftUs` of 0 or 1 µs — i.e. all 7 read the H.264/AAC sample tables correctly. So correctness does not separate them; throughput does.

mediabunny's demux path (src/engines/mediabunny/adapter.ts:1152-1183) opens the file via `openInput`/`BlobSource` and iterates `EncodedPacketSink.packets(undefined, undefined, { verifyKeyPackets: true })` (adapter.ts:1162-1167), reading each packet's `byteLength`, `microsecondTimestamp`, and bitstream-verified `type === 'key'`. This is a genuine call into the real mediabunny library, not a metadata shortcut. The reason it is 3.35x faster than mp4box and ~200x faster than the platform path is mechanistic:

- It is a pure-TS ESM moov/`stsz`/`stss`/`stts` table walk (env.configUsed: `backend: "webcodecs"`, `coreBuild: "pure-ts-esm"`, `pipeline: "streaming-lockstep"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`). For demux it never instantiates a `VideoDecoder` — it only reads the ISOBMFF sample-table boxes and reports byte ranges, so the 4K resolution is irrelevant to its cost (it never touches pixel data).
- mp4box (the runner-up, 92.92 ms) is also pure-JS but uses `whole-file-append(MP4BoxBuffer+fileStart)` with `rangeReads: false` (env.configUsed) — it appends the entire 26 MB buffer through its `onSamples` state machine, incurring more allocation/copy overhead per sample than mediabunny's direct sink iteration. mediabunny's `EncodedPacketSink` yields packet descriptors lazily without materializing the full sample stream the same way.
- ffmpeg.wasm (135.84 ms) pays wasm boundary and libavformat probe/init overhead on top of the actual demux; it is correct (maxPtsDriftUs=0) but heavier.
- The platform/WebCodecs engine (6015.39 ms) is the slowest because its "demux" is built on a `<video>`/`VideoDecoder` streaming pipeline (env.configUsed: `decode: "VideoDecoder"`, `hwAccel: true`) — it spins up a hardware decode path and demux-by-decode just to recover the packet table, which is enormously more expensive than reading the sample table directly, especially at 4K.

Net: identical correctness, and mediabunny extracts the packet table with the least per-packet overhead of any engine here.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS, but lost on performance: 92.92 ms wall = 3.35x slower than mediabunny. Cause: `whole-file-append` of the full 26 MB buffer with `rangeReads:false` adds copy/allocation overhead vs mediabunny's lazy sink.
- **ffmpeg.wasm@0.12.15** — PASS, 135.84 ms = 4.89x slower. Cause: wasm boundary + libavformat init/probe overhead, despite the tightest timestamps (maxPtsDriftUs=0).
- **remotion-webcodecs@4.0.479** — PASS, 696.02 ms = 25.1x slower. Cause: WebCodecs-oriented `streaming-backpressure` pipeline with bufferWriter; heavier setup than a direct table walk for a read-only demux.
- **remotion-media-parser@4.0.479** — PASS, 1930.72 ms = 69.5x slower. Cause: `cpu-js` full-parse (`fieldsTier: "full-parse(demux)"`) on the main thread (`worker:false`) over the whole file.
- **web-demuxer@4.0.0** — PASS, 2447.76 ms = 88.2x slower. Cause: wasm (libav-backed) demux with high fixed startup cost relative to a 10 s clip; correct (maxPtsDriftUs=0) but slow.
- **platform@chrome-149** — PASS, 6015.39 ms = 217x slower (slowest). Cause: demux-by-decode through `VideoDecoder` hardware pipeline (env.configUsed `decode:"VideoDecoder"`, `hwAccel:true`), the wrong tool for recovering a packet table at 4K.

No engine reported NA or FAIL for this scenario — every framework that competes declared and genuinely implemented MP4/H.264 demux.

## Anti-cheat validation

- Scenario definition: src/scenarios/demux/index.ts:150-156 — `asset: 'h264_4k_10s.mp4'`, container `mp4`, videoCodecs `['h264']`, audioCodecs `['aac']`, note at line 155.
- Fixture: `fixtures/media/h264_4k_10s.mp4` EXISTS, 26 MB (real 4K media, not synthetic/empty/mock).
- Oracle: `golden-packets` at src/core/oracles.ts:703-796. It is a REAL comparison against `fixtures/golden/<id>.packets.json`: it fails on count mismatch, trackIndex-layout mismatch, any `size` mismatch, any keyframe-flag mismatch, and PTS/DTS residual drift beyond ±1 ms after constant origin alignment (lines 717-794). Not trivially satisfiable: an engine with a wrong sample table at 4K would diverge on the size column. Measurements are physically plausible: 770 packets across 2 tracks, maxPtsDriftUs 0-1 µs — consistent with a ~10 s 4K H.264 + AAC clip.
- Winner adapter: src/engines/mediabunny/adapter.ts:1152-1183 (demux). Genuinely calls `EncodedPacketSink.packets(..., { verifyKeyPackets: true })` on the real library, reading actual `byteLength`/`microsecondTimestamp`/`type`. No canned output, no input->output copy, no short-circuit to golden, no error swallowing (errors propagate; `dispose()` in `finally`). Capability `demux:true` honestly declared (adapter.ts:1024).
- Verdict: **REAL** — real 26 MB fixture, real library demux, meaningful exact-size/keyframe oracle.
- Cached note: the winner's result has `cached:true` (reason "cached previous PASS result"), as do ALL 7 engines. The PASS and packet measurements are trustworthy, but the wall timings were reused, not freshly re-run; the absolute 27.77 ms figure (and the 3.35x margin) carries staleness risk and could shift on a fresh run.

## Confidence & caveats

- Confidence: medium. Correctness verdict (all 7 PASS, mediabunny REAL) is solid. The winner decision rests entirely on wall time because correctness is tied and no other bench metrics were captured.
- All measurements are `n:1` (single sample, `mad:0`, warmup:1) — single-shot timing, so the 3.35x margin over mp4box is directional, not statistically robust. However, the gap to mediabunny is so large for the slower engines (25x-217x) that the ranking order is unlikely to invert.
- Every row is cached; a fresh re-run is advised before treating the absolute latency as authoritative.
