# performance/size-ladder-iterate-packets-large

- family: performance
- fixture asset: `large_h264_1080p_120s.mp4` (H.264 1080p30 + AAC 48 kHz stereo, 120 s, 90 MB, faststart MP4)
- primaryMetric: `packetsPerSec` (higher better)
- passCount: 7 / 7

## Verdict

- bestFramework: **mp4box@2.3.0**
- CONTESTED: all 7 engines PASS the same gate (`golden-packets`, 9226 packets, maxPtsDriftUs ≤ 1 µs), so correctness is a dead tie and the decision falls to the performance tiebreaker (rule 4b).
- Decisive factor: highest `packetsPerSec` (the case's primaryMetric) and lowest `wall`. mp4box demuxes 9226 packets at **46,420 packets/s in 198.75 ms**.
- Margin over runner-up (ffmpeg.wasm@0.12.15, 44,855 packets/s, 205.69 ms): only **1.035x packetsPerSec / 1.035x wall**. This is a razor-thin win, and with `n=1` (single timed sample, mad=0, p95==median) it is essentially within measurement noise — the honest read is "mp4box and ffmpeg.wasm are co-leaders, mp4box nominally ahead." Both crush the remaining five (next, platform, is 28,354 packets/s = ~1.6x slower than mp4box; the three lazy-reader engines are 40-50x slower).

## Per-engine results

| engine | status | oracles passed | packetsPerSec | wall median | throughputRealtime | reason |
|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-packets:pass (9226, drift 1µs) | 46420.13 | 198.75 ms | 603.77x | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (9226, drift 0µs) | 44855.00 | 205.69 ms | 583.42x | cached previous PASS |
| platform@chrome-149 | PASS | golden-packets:pass (9226, drift 1µs) | 28353.67 | 325.39 ms | 368.79x | cached previous PASS |
| mediabunny@1.48.0 | PASS | golden-packets:pass (9226, drift 1µs) | 15906.07 | 580.03 ms | 206.89x | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (9226, drift 1µs) | 1142.12 | 8077.97 ms | 14.86x | cached previous PASS |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (9226, drift 1µs) | 958.36 | 9626.84 ms | 12.47x | cached previous PASS |
| web-demuxer@4.0.0 | PASS | golden-packets:pass (9226, drift 0µs) | 904.72 | 10197.67 ms | 11.77x | cached previous PASS |

(peakMemory and longtasks are not metrics of THIS scenario — its metrics are `packetsPerSec`, `throughputRealtime`, `wall` — so those columns are omitted; the memory-pressure variant `performance/size-ladder-demux-peak-memory-large` carries peakMemory instead.)

## Why the winner wins (deep technical)

The operation is "iterate every packet of a 120 s 1080p H.264/AAC MP4" — i.e. enumerate the full sample table (3600 video packets across 60 closed GOPs at -g 60, plus 5626 AAC packets) and emit a `PacketInfo{trackIndex,size,ptsUs,dtsUs,keyframe}` per sample. Critically, the golden-packets oracle (src/core/oracles.ts:703-796) only inspects scalar sample-table fields — count, trackIndex multiset, per-packet size, keyframe flag, and pts/dts to ±1 ms after a per-track origin offset. It never requires the coded sample BYTES. So the fastest correct engine is the one that parses the ISO-BMFF box hierarchy and reads the `stsz` (sizes), `stts`/`ctts` (dts/cts), `stco`/`co64` (offsets), and `stss` (sync samples) tables WITHOUT ever decoding, copying mdat, or touching the codec.

That is exactly what mp4box does. Its demux path (src/engines/mp4box/adapter.ts:765-804) calls `parseToInfo(bytes, true)` to build the box tree, then `file.setExtractionOptions(t.id, null, { nbSamples: 100_000 })` for each track (adapter.ts:794-795) and drives `file.start()/flush()/stop()`. In the `onSamples` callback (adapter.ts:776-791) it copies only the four scalars it needs (`s.size`, `s.cts`, `s.dts`, `s.is_sync`), converts ticks→µs via `Math.round((s.cts/timescale)*1e6)`, and immediately `file.releaseUsedSamples(id, last.number+1)` (adapter.ts:790) to free sample memory. Because `discardMdatDataDemuxRemux:false` keeps mdat for sample fidelity but the adapter never reads `s.data`, the hot loop is pure integer arithmetic over the moov sample tables — no entropy decode, no GPU, no wasm FFI boundary. That single-pass, allocation-light table walk is what yields 46,420 packets/s / 198.75 ms wall and a 603.77x realtime ratio (it processes the 120 s of media in ~0.2 s).

ffmpeg.wasm is the co-leader at 44,855 packets/s (205.69 ms, drift 0 µs — actually slightly tighter timestamps than mp4box's 1 µs). It reaches near-identical throughput because libavformat's MP4 demuxer is likewise a sample-table walk, but it pays a fixed cost mp4box avoids: marshalling the 90 MB file into the wasm MEMFS and crossing the JS↔wasm boundary per AVPacket. The result is a ~1.035x gap — inside the noise floor of an `n=1` measurement (both have mad=0 because each ran exactly one timed iteration).

The remaining engines are correct but architecturally mismatched for this op. platform@chrome-149 (28,354 packets/s) routes demux through a WebCodecs-oriented streaming pipeline (`backend:webcodecs`, `queueDepth:2`, `frameTransfer:transferable`) — it pays per-chunk EncodedVideoChunk packaging overhead it doesn't need when only scalars are asked for. mediabunny (15,906 packets/s, pure-TS streaming-lockstep) is a clean JS parser but with more per-packet object churn than mp4box's release-as-you-go loop. The three slowest — remotion-webcodecs (1142), remotion-media-parser (958), web-demuxer (905) — run 40-50x slower (8-10 s wall) because they use lazy/streaming whole-file reader pipelines (`reader:webReader`, `pipeline:streaming-backpressure`, web-demuxer's wasm libav over an MSE-style reader) that re-read and re-buffer the 90 MB asset rather than doing one synchronous in-memory moov parse; at the "large" rung that read/backpressure overhead dominates and collapses packets/sec, which is precisely the size-axis effect §5.3 exists to expose.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost by only 1.035x packetsPerSec (44,855 vs 46,420) and 1.035x wall (205.69 vs 198.75 ms). Cause: wasm MEMFS file marshalling + per-AVPacket JS↔wasm boundary crossings on top of an otherwise equally efficient libavformat sample-table walk. Within `n=1` noise; effectively a tie.
- **platform@chrome-149** — PASS, lost 1.64x on packetsPerSec (28,354) / 1.64x on wall (325.39 ms). Cause: WebCodecs-centric streaming demux pipeline (queueDepth 2, transferable chunk packaging) adds per-chunk overhead unnecessary for a scalar-only packet table.
- **mediabunny@1.48.0** — PASS, lost 2.92x on packetsPerSec (15,906) / 2.92x on wall (580.03 ms). Cause: pure-TS streaming-lockstep parser with more per-packet allocation than mp4box's release-as-you-go loop; correct, just heavier.
- **remotion-webcodecs@4.0.479** — PASS, lost 40.6x on packetsPerSec (1142) / 40.6x on wall (8078 ms). Cause: streaming-backpressure reader pipeline re-buffers the 90 MB file; read/queue overhead dominates at the large rung.
- **remotion-media-parser@4.0.479** — PASS, lost 48.4x on packetsPerSec (958) / 48.4x on wall (9627 ms). Cause: cpu-js full-parse demux over webReader streaming; per-chunk read cost swamps the actual table walk at scale.
- **web-demuxer@4.0.0** — PASS, lost 51.3x on packetsPerSec (905) / 51.3x on wall (10,198 ms). Cause: wasm-libav demux over a streaming reader; whole-file buffering + FFI overhead make it the slowest, despite tight timestamps (drift 0 µs).

No engine returned NA or FAIL — every framework genuinely declares and implements MP4/H.264 demux, so this case is a pure throughput ranking on top of a correctness floor everyone clears.

## Anti-cheat validation

- **Scenario definition**: src/scenarios/performance/size-ladder.ts:86-100 (the `iterateLadder` builder; rung key `large` → asset `large_h264_1080p_120s.mp4` from `LADDER.large`, src/scenarios/performance/_shared.ts:79). op=demux, oracle=golden-packets, primary=packetsPerSec, timeout T_LARGE=120 s. Notes: "iterate every video packet ... stresses streaming/lazy demux + sample-table parsing at scale."
- **Fixture exists and is real**: `fixtures/media/large_h264_1080p_120s.mp4` is present, 90 MB. Golden `fixtures/golden/large_h264_1080p_120s.mp4.meta.json` (mp4, 120 s, 1920x1080 h264 @30fps, aac 48k stereo) and `.packets.json` (1.1 MB) are present. The packets golden contains exactly 9226 entries: trackIndex 0 = 3600 video packets with 60 keyframes (= 120 s ÷ 2 s GOP at -g 60), trackIndex 1 = 5626 AAC packets all keyframes. Physically consistent with a real 120 s 30 fps H.264/AAC file. (NOTE: the scenario's own header comment at size-ladder.ts:20-22 and _shared.ts:46-50 says this rung's golden is "NOT yet baked → NA until bake" — that comment is now STALE; the bake has since landed the meta+packets golden, which is why all 7 engines legitimately rank rather than degrade to golden-absent NA.)
- **Oracle**: src/core/oracles.ts:703-796 (`goldenPackets`). Performs a real, strict comparison: exact packet count (line 717), exact trackIndex multiset layout (724), order-independent per-track sort by dts/pts (749), exact per-packet size match (777), exact keyframe-flag match (778), and pts/dts residual ≤ seekToleranceUs (1 ms) after a single per-track constant origin offset (772-784). Not trivially satisfiable — a wrong count, a dropped/extra packet, a size error, a flipped keyframe flag, or varying timing drift all FAIL. The shard's measurements (measuredCount 9226 == goldenCount 9226, comparedTracks 2, maxPtsDriftUs 0-1) are plausible and tight.
- **Winner adapter**: src/engines/mp4box/adapter.ts:765-804 (`demux`). Genuinely calls mp4box.js (`setExtractionOptions`/`onSamples`/`start`/`flush`/`stop`), walks the real sample tables, converts cts/dts ticks→µs, reads `is_sync` for keyframe, and releases sample memory. No canned output, no input→output copy, no golden short-circuit, no swallowed errors. The speed comes legitimately from reading only scalar sample-table fields and never touching mdat media bytes.
- **cached note**: ALL seven engines have `cached:true` ("cached previous PASS result"). The numbers were reused, not re-run in this batch — minor staleness risk. Adapter mtimes are ~19 h old vs the cached run timestamps (2026-06-22), so the cache likely reflects current code, but a fresh re-run would strengthen the razor-thin mp4box-vs-ffmpeg.wasm margin.
- **Verdict: REAL** — real 90 MB fixture, real golden (9226 packets, plausible per-track breakdown), strict non-trivial oracle, genuine mp4box sample-table-walk implementation. The only caveats are evidential, not integrity: all-cached and `n=1`.

## Confidence & caveats

- Confidence: **medium**. Correctness verdict (all 7 PASS, mp4box REAL) is high-confidence. The WINNER ranking is medium because the margin over ffmpeg.wasm is only 1.035x with `n=1` / mad=0 — statistically a coin-flip; mp4box and ffmpeg.wasm are co-leaders.
- All seven results are `cached:true`; not re-run this batch.
- The scenario source comments claim this rung is un-baked/NA; that is stale — the golden is now present, which is why the case ranks for real.
- peakMemory/longtasks are not part of this scenario's metric set, so the streaming-vs-buffering memory tiebreaker would have to be read from the sibling `size-ladder-demux-peak-memory-large` case, not here.
