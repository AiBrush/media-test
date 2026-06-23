# performance/size-ladder-demux-peak-memory-huge

- **Family:** performance
- **Fixture asset:** `fixtures/media/huge_h264_1080p_600s.mov` (448 MB, H.264 video + AAC audio in a QuickTime/ISO-BMFF MOV, ~600 s, 2 tracks)
- **Golden:** `fixtures/golden/huge_h264_1080p_600s.mov.packets.json` (5.4 MB, baked)
- **Primary metric (declared):** `peakMemory` (lower-better)
- **Oracle gate:** `golden-packets`
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `remotion-media-parser`? No — `remotion-webcodecs@4.0.479`.
- **Flag:** CONTESTED (all 7 engines PASS the correctness gate).
- **Decisive factor:** The *declared* primary metric (`peakMemory`) is **degenerate** in this shard: 6 of 7 engines report `peakMemory.median = 0` produced from an **empty samples array** (`n: 0`, `samples: []`) — i.e. `performance.measureUserAgentSpecificMemory` never materialized a value and `median([]) → 0` (`src/core/bench.ts:197-198`). Only `mp4box` recorded a *real* peakMemory of **927,914,141 bytes (~927 MB)**. Because the report ranks `peakMemory` lower-better and treats `0` as a finite value (`src/core/report.ts:435-438`), the engines that *never measured memory* would be crowned co-winners and the one engine that *did* measure it (mp4box) sinks to last — a pure measurement artifact, not a real win. With correctness identical across all 7 and the primary metric unusable for 6/7, the decision falls to the only real, universally-measured performance axis: **packetsPerSec / wall**. On that axis `remotion-webcodecs` wins.
- **Margin over runner-up (web-demuxer):** **2.20x** higher packetsPerSec (4,056,816 vs 1,841,724 pkt/s) and **2.20x** faster wall (11.37 ms vs 25.05 ms). All measurements are **n = 1** (single sample, mad = 0), so this is weak statistical evidence.

## Per-engine results

| engine | status | oracles passed | wall median | packetsPerSec | peakMemory | reason |
|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (46126 pkts, drift 1µs) | 11.37 ms | 4,056,816 | 0 (n:0, not measured) | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass (46126 pkts, drift 1µs) | 25.05 ms | 1,841,724 | 0 (n:0, not measured) | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (46126 pkts, drift 0µs) | 957.24 ms | 48,186 | 0 (n:0, not measured) | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:pass (46126 pkts, drift 1µs) | 1043.86 ms | 44,187 | **927,914,141 (n:1, real)** | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:pass (46126 pkts, drift 1µs) | 1165.03 ms | 39,592 | 0 (n:0, not measured) | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass (46126 pkts, drift 1µs) | 2338.15 ms | 19,727 | 0 (n:0, not measured) | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (46126 pkts, drift 1µs) | 75,898.19 ms | 607 | 0 (n:0, not measured) | cached previous PASS result |

`throughputRealtime` and `longtasks` are not present in any engine's bench for this case (the scenario requested `peakMemory, packetsPerSec, wall`).

## Why the winner wins (deep technical)

The container is a **faststart QuickTime MOV (ISO-BMFF)** carrying **H.264** video and **AAC** audio, ~600 s, 448 MB on disk. The operation is *demux* (iterate every packet's table entry); the gating truth is the per-packet table: size, keyframe flag, and pts/dts. Every byte of those fields lives in the `moov` sample tables (`stsz` sizes, `stts`/`ctts` timing, `stss` sync samples) — none of it requires reading the multi-hundred-MB `mdat`.

`remotion-webcodecs` exploits exactly this. Its `demux()` routes the huge MOV through `demuxProgressiveMp4SampleTable(input)` (`src/engines/remotion-webcodecs/adapter.ts:398`), implemented in `src/engines/remotion-webcodecs/mp4-sample-table.ts:43-54`: it fetches only the `moov` box over HTTP Range (`readMoovBox(input.url)`) and derives the packet rows from `stsz/stts/ctts/stss` (`sampleTablesFromMoov`). The header comment is explicit and matches the env: *"It never reads mdat and never fabricates packets from duration or fps"* (`mp4-sample-table.ts:10`); `env.configUsed.adapterFastPaths` lists *"mp4-sample-table:http-range for selected large/progressive MP4/MOV demux rows."* Because it touches only a ~few-MB sample table instead of buffering 448 MB, its wall is **11.37 ms** and it derives all **46,126** packets that match the golden exactly (`maxPtsDriftUs: 1`, sizes/keyframe flags exact). This is also why its `peakMemory` cell is empty — it never allocated enough to register against the heavy floor, and the UA memory probe did not produce a sample for this run.

`web-demuxer` uses the same class of trick (it also produced no peakMemory sample and a tiny 25.05 ms wall, consistent with a moov-only sample-table read), but is **2.20x slower** in both wall and packetsPerSec, so it loses the secondary-axis race. Both of these "no-mdat" engines embody the *streaming / OOM-resistant* behavior that the §A.16 peak-memory scenario was written to reward — they simply never had the metric captured.

Contrast with `mp4box`, the only engine with a genuine memory number. Its `demux()` (`src/engines/mp4box/adapter.ts:765-804`) does `await input.arrayBuffer()` (pulls the entire 448 MB into JS), wraps it as one `MP4BoxBuffer` and `appendBuffer`s the whole file (`env.configUsed.pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"`, `discardMdatDataDemuxRemux: false` so mdat is retained for `onSamples`). That whole-file buffer plus the parsed structures is exactly why it peaks at **927 MB** — roughly 2x the file size. It is correct (46,126 packets, drift 1µs) and honest, but it is the *worst* memory profile in the field and the antithesis of what the scenario tests. The report's lower-better ranking ironically buries this real number beneath six zeros.

## What each other framework did wrong

- **web-demuxer@4.0.0** — PASS, lost on the secondary axis: 1,841,724 pkt/s vs winner 4,056,816 (winner 2.20x faster), wall 25.05 ms vs 11.37 ms. Same moov-only fast path, no peakMemory sample. n=1.
- **ffmpeg.wasm@0.12.15** — PASS (cleanest correctness: `maxPtsDriftUs: 0`), but single-thread wasm fully demuxes the stream: 48,186 pkt/s, wall 957 ms (~84x slower wall than the winner). No peakMemory sample captured.
- **mp4box@2.3.0** — PASS, but the only engine whose *real* peakMemory was recorded, and it is the worst: 927 MB from whole-file `appendBuffer` buffering (`adapter.ts:766-799`). Wall 1043.86 ms, 44,187 pkt/s. It would win a literal lower-better peakMemory ranking *only* because the others reported 0 — instead it loses both the artifactual primary and the real secondary axis.
- **mediabunny@1.48.0** — PASS, streaming-lockstep WebCodecs path but still walks the full demux: 39,592 pkt/s, wall 1165 ms (~102x slower wall). No peakMemory sample.
- **platform@chrome-149** — PASS, hardware WebCodecs streaming path: 19,727 pkt/s, wall 2338 ms (~206x slower wall than winner). No peakMemory sample.
- **remotion-media-parser@4.0.479** — PASS but catastrophically slow: 607 pkt/s, wall **75,898 ms** (cpu-js full-parse demux, `backend: cpu-js`, no fast path). ~6677x slower wall than the winner; correct but unrankable on memory.

## Anti-cheat validation

- **Scenario:** `src/scenarios/performance/size-ladder.ts:107-122` (the `memoryPressure` map building `performance/size-ladder-demux-peak-memory-${r.key}`); the huge rung resolves to `LADDER.huge = 'huge_h264_1080p_600s.mov'` (`src/scenarios/performance/_shared.ts:80`). Gate is `golden-packets`, primary `peakMemory`, timeout `T_HUGE = 300000` (`_shared.ts:92`).
- **Fixture exists & is real:** `fixtures/media/huge_h264_1080p_600s.mov` — 448 MB, real H.264/AAC MOV (not synthetic/empty). Golden `huge_h264_1080p_600s.mov.packets.json` is 5.4 MB and baked. Scenario notes (`size-ladder.ts:21`) say this rung was "golden NOT baked → NA until bake"; the golden has since been baked, so all 7 engines legitimately rank.
- **Oracle:** `goldenPackets` at `src/core/oracles.ts:703-796`. It is a strict, order-independent per-track comparison: exact packet count (46126 == 46126), exact `size`, exact `keyframe` flag, and pts/dts within ±1 ms after a single per-track constant origin offset. Not trivially satisfiable; measurements (`comparedTracks: 2`, `maxPtsDriftUs: 0–1`, 46126 packets) are physically plausible for a 600 s 2-track MOV.
- **Winner adapter:** `src/engines/remotion-webcodecs/adapter.ts:394-398` → `src/engines/remotion-webcodecs/mp4-sample-table.ts:43-54`. Genuine: reads the real `moov` over HTTP Range and derives packets from `stsz/stts/ctts/stss`; *"never reads mdat and never fabricates packets from duration or fps"* (`mp4-sample-table.ts:10`). **Caveat (not a cheat):** the fast path is asset-gated by a hardcoded allow-list `SAMPLE_TABLE_FAST_PATH_ASSETS` that explicitly contains `huge_h264_1080p_600s.mov` (`mp4-sample-table.ts:15-19`). It is a legitimate moov-only streaming demux verified byte-exact by the oracle, but it is a per-asset special-case path, and the 11.37 ms wall reflects "parse the moov sample table," not "demux 448 MB of media."
- **Verdict:** **WEAK-GATE.** Inputs, implementation, and oracle are all REAL, but the *declared* primary metric (`peakMemory`) collapsed to a degenerate `0` for 6/7 engines (empty samples), so the headline "lower peak memory" ranking is not meaningful; the winner is decided on a secondary axis (packetsPerSec/wall) at n=1. The single engine with a real memory number (mp4box, 927 MB) would paradoxically win a literal peakMemory ranking only because the others measured nothing.
- **Cached note:** ALL 7 results have `cached: true` ("cached previous PASS result"). The numbers were reused, not re-run — staleness risk; a fresh run could change the secondary-axis margins and might materialize peakMemory samples for more engines.

## Confidence & caveats

- **Confidence: low.** The primary metric is unusable for 6/7 engines, the winner is chosen on a secondary axis, every measurement is n=1 (mad=0, no spread), and all results are cached.
- The winner's edge depends on an asset-specific moov-only fast path; it is honest and oracle-verified, but it is not a general-purpose full-stream demux comparison.
- The scenario's intent (peakMemory↓ as an OOM/streaming proxy) is currently only directly satisfied by mp4box's real 927 MB figure; the engines that actually stream simply lack a captured number, so the leaderboard cannot reward streaming the way the scenario intends until the UA memory probe materializes for them.
