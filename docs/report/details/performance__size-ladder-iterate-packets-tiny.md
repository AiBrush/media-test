# performance/size-ladder-iterate-packets-tiny

family: performance | fixture asset: `fixtures/media/tiny_h264_360p_2s.mp4` (173 KB, H.264 video + AAC audio in MP4) | primaryMetric: packetsPerSec | passCount: 7/7

## Verdict

- Best framework: **mediabunny@1.48.0** (`env.engineId "mediabunny"`).
- Status: **CONTESTED** — all 7 engines PASS the single gating oracle (`golden-packets`) with effectively identical correctness, so the decision is purely on the primary throughput metric.
- Decisive factor: **packetsPerSec** (the scenario's `primary`). mediabunny iterates the full 155-packet table at **36,384.98 packets/s**, vs the runner-up mp4box at **22,032.69 packets/s**.
- Margin over runner-up (mp4box): **1.65x higher packetsPerSec** (36384.98 / 22032.69 = 1.651), **1.65x lower wall** (7.035 ms / 4.26 ms = 1.651), and **469.48x vs 284.29x realtime** (1.65x). Caveat: every engine here ran with **n=1** (single timed sample, mad=0, warmup=1), so the throughput ordering is reproducible-in-direction but statistically thin.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | packetsPerSec | reason |
|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true (155/155, drift 1µs) | 4.26 | 469.48 | 36384.98 | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true (155/155, drift 1µs) | 7.035 | 284.29 | 22032.69 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (155/155, drift 0µs) | 9.275 | 215.63 | 16711.59 | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true (155/155, drift 1µs) | 12.52 | 159.74 | 12380.19 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (155/155, drift 1µs) | 16.32 | 122.55 | 9497.55 | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (155/155, drift 1µs) | 20.07 | 99.65 | 7722.97 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true (155/155, drift 0µs) | 42.075 | 47.53 | 3683.90 | cached previous PASS result |

(peakMemory and longtasks are not metrics for this scenario — `metrics: ['packetsPerSec','throughputRealtime','wall']` in `src/scenarios/performance/size-ladder.ts:93` — so those columns have no samples here. Throughput columns substituted.)

## Why the winner wins (deep technical)

The operation is **demux** of the smallest valid asset on the size ladder: `tiny_h264_360p_2s.mp4`, a ~173 KB, 2-second, 360p H.264 video track interleaved with an AAC audio track in a plain (non-fragmented) MP4. The golden packet table (`fixtures/golden/tiny_h264_360p_2s.mp4.packets.json`) holds **155 packets across 2 tracks** (trackIndex 0 = video, trackIndex 1 = audio), with the first audio packet carrying `ptsUs = -21333` — the raw AAC encoder priming / edit-list origin that ffprobe exposes. Every engine reproduced 155 packets with size-exact and keyframe-exact agreement and `maxPtsDriftUs` of 0–1µs, so correctness is a tie and the ranking is decided by the §5.3 size-axis primary metric, `packetsPerSec`.

At the **tiny** rung the workload is dominated by **per-call / setup overhead**, not sustained byte throughput — there are only 155 packets and the whole file fits trivially in memory. This is exactly where mediabunny's architecture wins. Its demux path (`src/engines/mediabunny/adapter.ts:1152-1183`) opens the input once, gets the track list, and for each track drains an `EncodedPacketSink` via `sink.packets(undefined, undefined, { verifyKeyPackets: true })` (line 1165), pushing `{ trackIndex, size: pkt.byteLength, ptsUs: pkt.microsecondTimestamp, dtsUs: ptsUs, keyframe: pkt.type === 'key' }` per packet (lines 1169-1175). Per `env.configUsed`, mediabunny runs as a **pure-TS ESM core** (`coreBuild: "pure-ts-esm"`), with **no WASM** (`wasmThreads: 0`), **no SharedArrayBuffer**, and **no COOP/COEP requirement** (`coopCoep: "not-required"`). For a tiny in-memory MP4 the moov sample table is parsed directly in JS and packets are sliced out of the already-buffered mdat — there is no WASM module instantiation, no FS layer, and no worker/postMessage hop on the demux path. That eliminates the fixed startup cost that dominates a 4 ms job, yielding **4.26 ms wall** and **36,384.98 packets/s** — the lowest latency and highest throughput in the field.

The runner-up, **mp4box@2.3.0**, is also pure-JS (`backend: "pure-js"`, `pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"`) and is fast (7.035 ms / 22,032.69 pkt/s), but it buffers the whole file and appends it through its `MP4Box.appendBuffer`/`fileStart` ingestion path before exposing samples, adding parse-and-copy overhead that costs it the 1.65x gap. **ffmpeg.wasm@0.12.15** (9.275 ms / 16,711.59 pkt/s) pays the price of marshaling the file into the Emscripten/MEMFS virtual filesystem and running the libavformat demuxer inside WASM — heavyweight machinery whose fixed cost dwarfs the actual 155-packet read at tiny scale (it is 2.2x slower than mediabunny despite being the only other engine besides web-demuxer to hit `maxPtsDriftUs: 0`). The two **WebCodecs-backed** engines, platform (12.52 ms) and remotion-webcodecs (16.32 ms), are slower still: demux here only needs container parsing, and routing through `VideoDecoder`/streaming-backpressure plumbing (`pipeline: "streaming-backpressure"`, `queueDepth: "waitForQueueToBeLessThan"` for remotion-webcodecs) adds orchestration overhead with no benefit for a parse-only op. **web-demuxer@4.0.0** is the slowest (42.075 ms / 3,683.90 pkt/s, 9.9x slower than mediabunny) — its FFmpeg-WASM-in-worker design has the largest per-call setup tax for a 4 ms job.

## What each other framework did wrong

- **mp4box@2.3.0** — PASSed, lost on throughput: 22,032.69 pkt/s vs 36,384.98 (0.61x), 7.035 ms vs 4.26 ms wall. Whole-file `MP4BoxBuffer` append/ingest (`pipeline: "whole-file-append"`) adds a buffer-and-parse pass that mediabunny's direct sample-table slicing avoids.
- **ffmpeg.wasm@0.12.15** — PASSed (cleanest timestamps, `maxPtsDriftUs: 0`), lost on throughput: 16,711.59 pkt/s (0.46x), 9.275 ms wall (2.18x slower). WASM module + MEMFS marshaling overhead dominates the tiny-rung job.
- **platform@chrome-149** — PASSed, lost: 12,380.19 pkt/s (0.34x), 12.52 ms wall (2.94x slower). WebCodecs/`VideoDecoder` streaming pipeline is overhead for a parse-only demux.
- **remotion-webcodecs@4.0.479** — PASSed, lost: 9,497.55 pkt/s (0.26x), 16.32 ms wall (3.83x slower). `streaming-backpressure` + queue-depth gating adds orchestration cost with no payoff here.
- **remotion-media-parser@4.0.479** — PASSed, lost: 7,722.97 pkt/s (0.21x), 20.07 ms wall (4.71x slower). `cpu-js` `full-parse(demux)` via `webReader` is correct but slower per packet than mediabunny's sink.
- **web-demuxer@4.0.0** — PASSed (also `maxPtsDriftUs: 0`), lost hardest: 3,683.90 pkt/s (0.10x), 42.075 ms wall (9.88x slower). Largest per-call setup tax (FFmpeg WASM in worker) for a tiny job.

No engine returned NA or FAIL — every one declared and genuinely implemented the demux op against this MP4/H.264+AAC fixture.

## Anti-cheat validation

- Scenario definition: `src/scenarios/performance/size-ladder.ts:86-100` (the `iterateLadder` factory; tiny rung at `RUNGS[0]` line 49). Input asset resolved via `LADDER.tiny = 'tiny_h264_360p_2s.mp4'` (`src/scenarios/performance/_shared.ts:76`). op=`demux`, oracles=`['golden-packets']`, primary=`packetsPerSec`, timeout=`T_FAST` (30s).
- Fixture exists and is real: `fixtures/media/tiny_h264_360p_2s.mp4` = 173 KB on disk (not synthetic/empty/mock); golden `fixtures/golden/tiny_h264_360p_2s.mp4.packets.json` = 17 KB containing 155 real packet records (trackIndex 0/1, real byte sizes e.g. 7010, 2707, real ptsUs including the -21333µs AAC priming origin). Counts and the negative-origin priming are physically plausible for a 2s 360p H.264+AAC MP4.
- Gating oracle: `goldenPackets()` at `src/core/oracles.ts:701-796`. It is a REAL, strict comparison: track-layout multiset must match (line 724), per-track packet **size** must be exact (line 777), **keyframe flag** must be exact (line 778), and pts/dts drift must stay within `seekToleranceUs` (1ms) after a single per-track constant-origin alignment (lines 772-784). A wrong demux cannot pass (count/size/keyframe/timing mismatches each fail at lines 717-792). Measurements in the shard (`measuredCount:155, goldenCount:155, comparedTracks:2, maxPtsDriftUs:0|1`) are consistent with this implementation — not a wide-tolerance or smoke-only gate.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1152-1183`. Genuinely implemented — opens the real mediabunny `Input`, drains `EncodedPacketSink.packets(..., { verifyKeyPackets: true })`, emits real `byteLength`/`microsecondTimestamp`/bitstream-verified `keyframe`. No canned output, no input→output copy, no golden short-circuit, no error swallowing (errors propagate; `mbInput.dispose()` in `finally`).
- Verdict: **REAL** — real fixture, real library demux, strict size+keyframe+timestamp oracle against an ffprobe-derived golden.
- Cached note: the winner's result (and all 7) have `cached: true` ("cached previous PASS result"). Correctness (155-packet match) is stable and trustworthy, but the **throughput numbers were reused, not freshly re-run**, so the exact packetsPerSec/wall values carry staleness risk. Per the launcher-seeding caveat, a truly fresh run would require clearing raw + .browser-cache.

## Confidence & caveats

- Confidence: **medium**. The correctness verdict is solid (strict oracle, real fixture, genuine adapter). The throughput-based winner is directionally clear (mediabunny is fastest by a 1.65x margin over the runner-up and far ahead of the rest), but every engine ran at **n=1** (single sample, mad=0) and all results are **cached**, so the precise ratios are weak statistical evidence and could shift on a fresh, multi-sample re-run.
- The 1.65x lead is comfortably outside measurement noise for a 4 vs 7 ms gap, and is mechanistically explained (pure-TS, no-WASM, no-worker, no-COOP/COEP demux of a tiny in-memory MP4), so the ordering of the top two is unlikely to invert; the tail ordering (remotion-media-parser vs web-demuxer) is the part most sensitive to re-measurement.
