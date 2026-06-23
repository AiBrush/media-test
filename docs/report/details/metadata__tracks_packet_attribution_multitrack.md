# metadata/tracks_packet_attribution_multitrack

- family: metadata
- fixture asset: `fixtures/media/h264_multitrack.mp4` (4.5 MB, real file; 3 tracks = 1 H.264 video + 2 AAC audio)
- primaryMetric: `packetsPerSec`
- passCount: 7 / 7

## Verdict

- Best framework: **mediabunny@1.48.0**
- Contested: **YES** — all 7 engines PASS the single gating oracle (`golden-packets`) with bit-identical correctness, so the decision falls entirely to performance.
- Decisive factor: **throughput on the primary metric `packetsPerSec`**. mediabunny demuxes the 1240-packet, 3-track table at **52,133 packets/s (23.78 ms wall)**, the fastest of all seven.
- Margin over runner-up (ffmpeg.wasm@0.12.15 at 43,258 pps / 28.67 ms): **1.21x higher throughput, 1.21x faster wall**. Caveat: n==1, mad==0, all results cached (see caveats).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | packetsPerSec (primary) | maxPtsDriftUs | reason |
|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:pass (1240 pkts, 3 tracks) | 23.785 | 52133.70 | 1 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (1240 pkts, 3 tracks) | 28.665 | 43258.33 | 0 | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass (1240 pkts, 3 tracks) | 37.910 | 32709.05 | 1 | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:pass (1240 pkts, 3 tracks) | 56.665 | 21882.99 | 1 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (1240 pkts, 3 tracks) | 295.510 | 4196.14 | 1 | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (1240 pkts, 3 tracks) | 356.245 | 3480.75 | 1 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass (1240 pkts, 3 tracks) | 1124.150 | 1103.06 | 0 | cached previous PASS result |

Note: this scenario declares only `wall` and `packetsPerSec` metrics (`src/scenarios/metadata/rotation-tracks.ts:149`); there is no `throughputRealtime`, `peakMemory`, or `longtasks` measurement in the shard, so those columns are not applicable here.

## Why the winner wins (deep technical)

**The operation.** This is a pure read-side `demux` (`op: 'demux'`, `src/scenarios/metadata/rotation-tracks.ts:140`). The container is progressive (faststart) MP4 with three elementary streams: one AVC/H.264 video track (300 packets) and two parallel AAC-LC audio tracks (470 packets each), totalling 1240 packets across 3 tracks (verified from `fixtures/golden/h264_multitrack.mp4.packets.json`). The gate (`golden-packets`) does not decode anything; it asserts that every demuxed packet is stamped with the correct `trackIndex`, that the per-track multiset of sizes and keyframe flags matches ffprobe's golden, and that per-track timestamps agree after a constant origin offset (`src/core/oracles.ts:721-792`). Because no pixels are produced, hardware decode is irrelevant; the contest is who can walk the MP4 sample tables (`stsz`/`stco`/`stss`/`stts`) and emit a per-track packet list fastest.

**What mediabunny actually does.** Its `demux()` (`src/engines/mediabunny/adapter.ts:1152-1183`) opens the input once, calls `getTracks()`, then for each track constructs an `EncodedPacketSink` and iterates `sink.packets(undefined, undefined, { verifyKeyPackets: true })` (line 1165). For each `EncodedPacket` it reads the real `pkt.byteLength`, `pkt.microsecondTimestamp`, and bitstream-verified `pkt.type === 'key'` (lines 1168-1175). This is a genuine pure-TS/ESM sample-table walk with no wasm boundary and no decoder in the loop. mediabunny's config (`env.configUsed`) is `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false` — it parses the moov atom and streams packet records directly in JS, so the per-packet cost is essentially a struct read with a keyframe check. That yields **52,133 packets/s** and **23.78 ms** to enumerate all 1240 packets.

**Why it beats the rest mechanistically.**
- vs **ffmpeg.wasm (43,258 pps / 28.67 ms, 1.21x slower)**: ffmpeg.wasm runs libavformat's MP4 demuxer inside single-threaded wasm. It produces the most precise timestamps (`maxPtsDriftUs: 0`, vs mediabunny's 1µs rounding artifact) but pays a wasm marshalling and AVPacket-copy tax on every packet plus the wasm heap round-trip, so it loses on throughput despite identical correctness.
- vs **platform/WebCodecs (32,709 pps / 37.91 ms, 1.59x slower)**: the platform adapter has no native demuxer, so it bridges through mp4box-style parsing to feed WebCodecs; the parse-then-bridge overhead dominates a metadata-only walk where the WebCodecs decoder is never used.
- vs **mp4box (21,883 pps / 56.66 ms, 2.38x slower)**: mp4box.js is pure-JS like mediabunny but uses `whole-file-append(MP4BoxBuffer+fileStart)` with `rangeReads:false` (its `env.configUsed`), buffering the full 4.5 MB before it can enumerate samples, and its onSamples callback path is heavier per packet than mediabunny's sink iterator.
- vs **remotion-webcodecs (4,196 pps) and remotion-media-parser (3,481 pps)**: both use a `cpu-js`/streaming parser (remotion-media-parser config: `backend: cpu-js`, `fieldsTier: full-parse(demux)`); the streaming reader re-parses incrementally and is ~12-15x slower per packet than mediabunny's direct moov walk.
- vs **web-demuxer (1,103 pps / 1124 ms, 47x slower)**: it spins up an ffmpeg-based wasm worker; the worker bootstrap plus message-passing per packet make it by far the slowest, even though its timestamps are exact (`maxPtsDriftUs: 0`).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15**: PASSed (golden-packets, 1240 pkts, drift 0µs) but lost on throughput — 43,258 pps vs 52,133 pps (0.83x of winner); the libav-in-wasm AVPacket copy/marshal tax per packet.
- **platform@chrome-149**: PASSed but 32,709 pps (0.63x of winner); no native demuxer, must bridge container parsing to WebCodecs which is never invoked for a metadata-only walk.
- **mp4box@2.3.0**: PASSed but 21,883 pps (0.42x of winner); whole-file buffering (`whole-file-append`, `rangeReads:false`) and a heavier onSamples callback path.
- **remotion-webcodecs@4.0.479**: PASSed but only 4,196 pps (0.08x of winner); streaming-backpressure JS parser, far higher per-packet cost.
- **remotion-media-parser@4.0.479**: PASSed but only 3,481 pps (0.067x of winner); `cpu-js` streaming full-parse demux, the second slowest.
- **web-demuxer@4.0.0**: PASSed (drift 0µs) but 1,103 pps (0.021x of winner); ffmpeg-wasm worker bootstrap + per-packet postMessage overhead, 47x slower wall (1124 ms vs 23.78 ms).

No engine FAILed and no engine returned NA — every engine declared the `demux`/`mp4`/`h264`/`aac` capability honestly and produced a real 1240-packet table.

## Anti-cheat validation

- Scenario definition: `src/scenarios/metadata/rotation-tracks.ts:138-156` (`id: 'metadata/tracks_packet_attribution_multitrack'`, `op: 'demux'`, `input: 'h264_multitrack.mp4'`, oracle `golden-packets`).
- Fixture: `fixtures/media/h264_multitrack.mp4` exists, 4.5 MB, a real multi-track MP4 (not synthetic/empty/mock). Golden `fixtures/golden/h264_multitrack.mp4.packets.json` (139 KB) decodes to 1240 packets: 300 on trackIndex 0 (video), 470 each on trackIndex 1 and 2 (the two AAC tracks). First packet sample: `{trackIndex:1, size:303, ptsUs:-21333, dtsUs:-21333, keyframe:true}` — a physically plausible AAC priming/edit-list negative origin, consistent with the oracle's "constant per-track origin shift" handling.
- Oracle: `src/core/oracles.ts:701-796` (`goldenPackets`). It performs a real order-independent, per-track comparison: trackIndex multiset (line 722-730), exact per-packet `size` and `keyframe` match (lines 777-778), and timestamp residual after a per-track constant offset within a 1 ms tolerance (lines 780-784). It can genuinely fail (size/keyframe/count mismatch all push diffs). Not a smoke gate, not a wide-open tolerance.
- Measurements plausibility: all seven engines independently report `measuredCount:1240`, `goldenCount:1240`, `comparedTracks:3`, with `maxPtsDriftUs` of 0 or 1 — physically consistent with the real 1240/3-track golden.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1152-1183`. Genuine implementation — opens the file, enumerates real tracks, iterates `EncodedPacketSink.packets(... verifyKeyPackets:true)`, reads real `byteLength`/`microsecondTimestamp`/`type`. No canned output, no copy-input-to-output, no short-circuit to the golden, no error swallowing.
- Cached note: mediabunny's result has `cached:true` ("cached previous PASS result"), as do all 7 engines. The numbers were reused from a prior run, not freshly re-executed in this report run — staleness risk applies uniformly to the whole shard, so the relative ranking is internally consistent but the absolute timings are not fresh.
- Verdict: **REAL** — real 4.5 MB fixture, real golden with plausible packet counts, a meaningful correctness oracle that compares per-track layout/size/keyframe/timestamps, and a genuine library-backed demux in the winner.

## Confidence & caveats

- Confidence: **medium**. Correctness verification is strong (real fixture, real oracle, real adapter), but the performance verdict rests on **n==1, mad==0** single-sample benchmarks that are **all cached**. A 1.21x margin over ffmpeg.wasm is real but modest and could narrow on a fresh multi-sample re-run.
- The contest is performance-only because the gate is a single structural oracle that all engines satisfy identically; there is no bit-exact decode or crypto tier to separate them on correctness strength.
- mediabunny and the two exact-drift engines (ffmpeg.wasm, web-demuxer) differ by 1µs in `maxPtsDriftUs`; this is a rounding/edit-list convention artifact, well within the 1 ms oracle tolerance, and does not constitute a correctness disadvantage for the winner.
- Per the seeding caveat in memory, cached PASS reuse means these are not honest fresh timings; a clean re-run (clearing raw + .browser-cache) would be needed to harden the absolute throughput figures.
