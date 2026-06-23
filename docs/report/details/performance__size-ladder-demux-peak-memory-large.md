# performance/size-ladder-demux-peak-memory-large

- **family:** performance
- **fixture asset:** `large_h264_1080p_120s.mp4` (fixtures/media/, ~90 MB, H.264 1080p30 + AAC 48 kHz stereo, 120 s)
- **golden:** `fixtures/golden/large_h264_1080p_120s.mp4.packets.json` (9226 packets, 2 tracks) + `.meta.json`
- **operation:** demux (iterate every packet of both tracks)
- **primaryMetric:** peakMemory (lower-is-better)
- **passCount:** 7 / 7 (all engines PASS golden-packets)

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (7 engines all PASS the gating oracle).
- **Decisive factor:** peak memory at scale. mediabunny holds the only LOW real peakMemory sample
  (28.81 MB) and simultaneously wins the secondary metrics (lowest wall 220.7 ms, highest throughput
  41,808 packets/s). Of the seven engines, only two produced a real peakMemory measurement (n=1);
  the other five report `peakMemory.median == 0` with `n == 0` (the `measureUserAgentSpecificMemory`
  API did not fire on those runs — an absent sample, NOT a real 0-byte footprint). Among engines with
  a genuine memory sample, mediabunny's 28.81 MB beats mp4box's 216.41 MB.
- **Margin over runner-up (mp4box, the only other engine with a real peakMemory number):**
  **0.133x peak memory (≈7.51x lower)**, plus **0.76x wall (1.32x faster)** and **1.32x packets/s**.
- **Important caveat on the literal report ranking:** by the strict `report.ts` rule
  (`computeCaseWinner`, report.ts:435-438, which sorts the finite `bench.peakMemory.median` ascending),
  the five engines whose median is `0` would sort FIRST and produce a spurious 5-way "tie at 0 bytes".
  That ranking is a measurement artifact, not a real OOM-resistance win — see Anti-cheat validation.
  Applying the scenario's actual intent (§A.16: "asserts the engine STREAMS rather than buffering the
  whole file"), only mediabunny has positive evidence of streaming, so it is the genuine winner.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | packetsPerSec | peakMemory | reason |
|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:pass (9226/9226, drift 1µs) | 220.67 | 41,808 | **28.81 MB** (n=1) | cached previous PASS |
| mp4box@2.3.0 | PASS | golden-packets:pass (9226/9226, drift 1µs) | 291.10 | 31,694 | 216.41 MB (n=1) | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (9226/9226, drift 0µs) | 409.47 | 22,532 | — (n=0, median 0) | cached previous PASS |
| platform@chrome-149 | PASS | golden-packets:pass (9226/9226, drift 1µs) | 6,030.63 | 1,530 | — (n=0, median 0) | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (9226/9226, drift 1µs) | 7,499.09 | 1,230 | — (n=0, median 0) | cached previous PASS |
| web-demuxer@4.0.0 | PASS | golden-packets:pass (9226/9226, drift 0µs) | 9,572.16 | 964 | — (n=0, median 0) | cached previous PASS |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (9226/9226, drift 1µs) | 10,988.61 | 840 | — (n=0, median 0) | cached previous PASS |

(longtasks / throughputRealtime were not produced as bench samples for this case; not shown.)

## Why the winner wins (deep technical)

The operation is a full packet enumeration of a 90 MB progressive (faststart) MP4 carrying H.264 1080p30
video and AAC stereo audio — 9226 packets across 2 tracks (3600 video frames + ~5626 AAC frames over
120 s). The gating oracle (`golden-packets`, oracles.ts:703) is structural/metadata-exact: it checks
packet count, per-track index layout, byte-exact `size` per packet, keyframe flags, and PTS/DTS drift
(≤1 ms after a constant per-track origin alignment). All seven engines clear it byte-for-byte
(`sizeMismatch=0`, `kfMismatch=0`, `maxPtsDriftUs` ≤ 1), so correctness is a tie and the case resolves
on the declared primaryMetric, `peakMemory`.

mediabunny's memory advantage is mechanistic, not incidental. Its demux path
(src/engines/mediabunny/adapter.ts:1152-1183) opens the asset via `openInput`
(adapter.ts:245-277), which for a normal, non-mutated corpus URL constructs
`new mb.Input({ source: new mb.UrlSource(input.url) })` (adapter.ts:266-270). `UrlSource` lets
mediabunny **range-read** the `moov` sample tables and then stream packet payloads on demand rather
than materializing the whole 90 MB file as a Blob/ArrayBuffer (documented rationale at adapter.ts:237-244).
Packets are pulled lazily through `EncodedPacketSink.packets(...)` as an async iterator
(adapter.ts:1162-1176), so at any instant only a bounded working set of decoded sample-table state plus
the current packet is resident. The result is a peak of **28.81 MB** — roughly a third of the file
size — which is the positive signal the §A.16 memory-pressure case is designed to detect.

mp4box, the only other engine with a real number, sits at **216.41 MB** — more than 2.3x the 90 MB file.
Its `env.configUsed` is explicit about why: `backend: "pure-js"`, `pipeline:
"whole-file-append(MP4BoxBuffer+fileStart)"`, `rangeReads: false`. MP4Box.js appends the entire file
into its internal buffer before/while parsing, holding the full byte stream plus the parsed box tree and
per-sample tables simultaneously. That whole-file-buffering is exactly the OOM-prone pattern the case
exists to expose, and it produces a 7.51x higher peak than mediabunny's streaming reader. mp4box is
still fast in wall time (291 ms) because it is pure-JS box parsing with no decode, but it loses the
ranked metric decisively.

mediabunny also incidentally wins the perf undercard: 220.67 ms wall (1.32x faster than mp4box,
~50x faster than the streaming-but-slow remotion/platform engines) and 41,808 packets/s (the highest of
all seven). So even setting the peakMemory artifact aside, mediabunny is Pareto-dominant over every
engine that produced comparable evidence.

## What each other framework did wrong

- **mp4box@2.3.0** — PASSed the oracle but LOST on the ranked metric: real peakMemory of 216.41 MB vs
  mediabunny's 28.81 MB (7.51x worse). `configUsed.pipeline = "whole-file-append(MP4BoxBuffer+fileStart)"`
  and `rangeReads:false` confirm it buffers the entire 90 MB file rather than streaming. Also slower wall
  (291.1 ms vs 220.7 ms).
- **ffmpeg.wasm@0.12.15** — PASSed (drift 0µs, fastest of the wasm group at 409.5 ms / 22,532 pps) but
  produced **no peakMemory sample** (`n=0`, median 0). With the UA memory API absent on its run there is
  no evidence it streams; its literal `median:0` would spuriously top the lower-is-better sort, which is
  a measurement artifact, not OOM-resistance.
- **platform@chrome-149** — PASSed but no peakMemory sample (n=0). On the secondary metrics it is far
  slower: 6,030.6 ms wall, 1,530 pps (mediabunny is ~27x faster wall here), reflecting WebCodecs/
  `<video>`-driven packet extraction overhead for a pure demux job.
- **remotion-webcodecs@4.0.479** — PASSed but no peakMemory sample (n=0). 7,499.1 ms / 1,230 pps. Its
  `cpu`/WebCodecs streaming path is correct but an order of magnitude slower than mediabunny on this MP4.
- **web-demuxer@4.0.0** — PASSed (drift 0µs) but no peakMemory sample (n=0). Slowest-but-one at
  9,572.2 ms / 964 pps; the ffmpeg-in-wasm bridge cost dominates per-packet emission.
- **remotion-media-parser@4.0.479** — PASSed but no peakMemory sample (n=0). Slowest overall:
  10,988.6 ms / 840 pps with `backend:"cpu-js"` full-parse demux — correct, but no memory evidence and
  far behind on throughput.

None of the non-winners FAILed and none are NA; the gating oracle is satisfied by all. The losses are
purely (a) higher real peak memory (mp4box) or (b) no admissible peakMemory sample plus much lower
throughput (the five n=0 engines).

## Anti-cheat validation

- **Scenario definition:** src/scenarios/performance/size-ladder.ts:107-122 (built by `perfCase`,
  _shared.ts:139); the `large` rung asset is `LADDER.large = 'large_h264_1080p_120s.mp4'`
  (_shared.ts:79). op=demux, oracles=['golden-packets'], primary='peakMemory'.
- **Fixture exists / is real:** `fixtures/media/large_h264_1080p_120s.mp4` is present (~90 MB, dated
  3 days ago) — a real, non-trivial H.264/AAC MP4, not synthetic/empty. The scenario's source comment
  (lines 20, 52) says the golden was "NOT baked", but the bake has since landed:
  `fixtures/golden/large_h264_1080p_120s.mp4.packets.json` (1.1 MB, 9226 packets) and `.meta.json` both
  exist, so the PASSes are real golden comparisons, not golden-absent NAs. The measured 9226 packets
  matches the golden count exactly and is physically plausible (3600 video frames @ 30 fps × 120 s +
  ~5626 AAC frames).
- **Oracle is meaningful:** `goldenPackets` (src/core/oracles.ts:703-795) does a real per-track,
  order-independent comparison — exact packet count, exact byte sizes, keyframe flags, and ±1 ms
  PTS/DTS drift after constant origin alignment. It is not trivially satisfiable; a fast-but-wrong demux
  would FAIL on size/count/keyframe mismatch. Measurements (`measuredCount:9226`, `goldenCount:9226`,
  `comparedTracks:2`, `maxPtsDriftUs` 0-1) are consistent with real media.
- **Winner adapter is genuine:** mediabunny demux at src/engines/mediabunny/adapter.ts:1152-1183 calls
  the real library (`EncodedPacketSink.packets()` async iteration over `Input`/`UrlSource`,
  adapter.ts:1162-1176, 266-270). It returns measured `byteLength`/`microsecondTimestamp`/keyframe per
  packet — no canned output, no input→output copy, no short-circuit to the golden, no swallowed errors
  (errors propagate; `dispose()` in `finally`).
- **Cached note:** ALL seven results are `cached:true` ("cached previous PASS result"). They were
  reused, not re-run in this batch — staleness risk applies to every engine equally. The winner's
  margins should be re-confirmed on a fresh run, especially the secondary wall/throughput numbers
  (n=1, mad=0, single sample).
- **Verdict: REAL.** Real 90 MB fixture, real golden (9226 packets), strong structural oracle, genuine
  streaming implementation. The only blemish is the peakMemory `median:0`/`n=0` artifact on five engines
  (a missing-sample, not a fake), which the strict report sort mis-ranks but which does not affect the
  honesty of the winner's own measurement.

## Confidence & caveats

- **Confidence: high** that mediabunny is the genuine winner: it has the lowest REAL peak memory
  (28.81 MB), the lowest wall, and the highest throughput, and its adapter provably streams via
  range-reading UrlSource.
- **Caveats:** (1) all results are cached (n=1, mad=0) — single-sample evidence; (2) five engines have
  no peakMemory sample, so the head-to-head memory comparison is effectively mediabunny vs mp4box only;
  (3) the literal `report.ts` peakMemory sort treats `median:0` (no sample) as the best value and would
  emit a false 5-way tie — a ranking bug worth flagging upstream, since a missing-sample should be
  excluded (n>0) rather than treated as 0 bytes.
