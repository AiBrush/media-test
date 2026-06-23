# robustness/edge_multitrack_demux

- **Family:** robustness
- **Fixture asset:** `fixtures/media/h264_multitrack.mp4` (4.5 MB real MP4: 1× H.264 1280×720@30, 2× AAC 48 kHz stereo, ~10 s)
- **Golden:** `fixtures/golden/h264_multitrack.mp4.packets.json` (139 KB, 1240 packets: 300 video + 470 + 470 audio)
- **Operation:** `demux` — emit full packet table; gate trackIndex correctness on every packet
- **Primary metric:** wall time (`durationMs`; no `bench{}` block present in this shard)
- **Pass count:** 7 / 7

## Verdict

- **Best framework:** **mediabunny@1.48.0** (`webcodecs` config, `pure-ts-esm` core, COOP/COEP not required).
- **Contested:** YES — all 7 engines PASS the sole gating oracle `golden-packets` with byte-identical correctness (1240/1240 packets, 3/3 tracks compared, maxPtsDrift ≤ 1 µs).
- **Decisive factor:** PERFORMANCE (wall time), since correctness is a tie. Mediabunny is fastest at **20 ms**.
- **Margin over runner-up (mp4box@2.3.0, 47 ms):** **2.35× faster wall**. Over the slowest passing engine (web-demuxer, 812 ms): **40.6×**.

## Per-engine results

All 7 share an identical oracle outcome: `golden-packets:PASS` (measuredCount 1240 = goldenCount 1240, comparedTracks 3). No `bench{}` object exists in this shard; throughputRealtime / peakMemory / longtasks are not recorded — only `durationMs`.

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:pass (drift 1µs) | **20** | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:pass (drift 1µs) | 47 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass (drift 1µs) | 65 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (drift 0µs) | 174 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (drift 1µs) | 362 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (drift 1µs) | 433 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass (drift 0µs) | 812 | n/a | n/a | n/a | cached previous PASS result |

## Why the winner wins (deep technical)

This scenario is a pure **container-layer demux**: parse the MP4 `moov`/`stbl` sample tables for three interleaved tracks and emit every packet with a correct `trackIndex`, byte size, pts/dts, and keyframe flag. There is no decoding, no pixel work, no encryption (plain `isom` brand, faststart-style progressive MP4). Consequently the WebCodecs/GPU advantages that decide transcode/decode scenarios are mostly irrelevant here — the workload is sample-table walking and box parsing in JS. All seven engines produce the exact same 1240-packet table, so the contest collapses to **how cheaply each engine walks the sample tables**.

Mediabunny wins on wall time (20 ms) because its demux path is a thin, allocation-light iterator over the parsed sample tables. The adapter (`src/engines/mediabunny/adapter.ts:1152-1183`) opens the input once, calls `getTracks()`, and for each track constructs an `EncodedPacketSink` and iterates `sink.packets(undefined, undefined, { verifyKeyPackets: true })` (`adapter.ts:1162-1167`), pushing `{trackIndex, size: pkt.byteLength, ptsUs: pkt.microsecondTimestamp, dtsUs: ptsUs, keyframe: pkt.type === 'key'}`. Mediabunny is a pure-TS ESM library that reads directly from a `BlobSource`/range-capable reader and resolves packet metadata straight out of the in-memory `stbl` boxes — no wasm module to instantiate, no FS shim, no worker round-trip. That eliminates the fixed startup cost that dominates the slower engines on a 4.5 MB / 10 s clip.

The oracle (`src/core/oracles.ts:703-796`, `goldenPackets`) is genuinely strict: it groups both measured and golden packets by `trackIndex`, sorts each group by dts then pts, and compares position-by-position. **Sizes and keyframe flags must match exactly** (`oracles.ts:777-778`); only timestamps get a per-track constant-offset alignment with a 1 ms residual tolerance (`oracles.ts:772-784`). The golden's first packet is `pts/dts = -21333 µs` (raw container priming / edit-list), and the oracle's per-track origin alignment is exactly what lets an engine that applies the edit list (starting at 0) still match — confirming the comparison is principled, not loose. Mediabunny's reported `maxPtsDriftUs: 1` is well inside the 1000 µs tolerance; its choice to report `dtsUs === ptsUs` (it abstracts DTS away, `adapter.ts:1146-1150`) is harmless here because the oracle aligns per-track and the residual stays ≤ 1 µs.

Correctness strength is therefore identical across all seven on the strongest available ladder rung for this op (`golden-packets` is a structural/metadata-exact gate). The only sub-µs differentiator is that ffmpeg-wasm and web-demuxer report `maxPtsDriftUs: 0` vs `1` for the rest — but at a 1000 µs tolerance this is noise, not a correctness ranking, and both of those engines are dramatically slower (174 ms and 812 ms). So performance is the decisive axis and mediabunny's 20 ms wins by 2.35× over mp4box.

## What each other framework did wrong

- **mp4box@2.3.0 (47 ms, runner-up):** Correct, identical packet table (drift 1 µs). Lost on wall time — 2.35× slower. Its `whole-file-append(MP4BoxBuffer+fileStart)` pure-JS pipeline buffers and re-parses the full file, heavier than mediabunny's direct sample-table iteration.
- **platform@chrome-149 (65 ms):** Correct (drift 1 µs). 3.25× slower than mediabunny. The browser-native path still funnels demux through its WebCodecs/MediaSource plumbing; more overhead for a parse-only job.
- **ffmpeg.wasm@0.12.15 (174 ms):** Correct, drift 0 µs (best timestamp fidelity). 8.7× slower — pays the wasm module instantiation + MEMFS file-write cost before it ever touches the sample tables. Strong correctness, weak performance.
- **remotion-media-parser@4.0.479 (362 ms):** Correct (drift 1 µs). 18.1× slower; `cpu-js` streaming full-parse(demux) on the main thread, no worker.
- **remotion-webcodecs@4.0.479 (433 ms):** Correct (drift 1 µs). 21.7× slower; its streaming-backpressure convert pipeline is built for transcode and is overkill for a packet-table dump.
- **web-demuxer@4.0.0 (812 ms):** Correct, drift 0 µs (best fidelity). 40.6× slower — slowest passing engine; an ffmpeg-wasm-derived demuxer paying the same wasm/FS startup tax plus its worker bridge.

No engine FAILed and none returned NA — every framework genuinely declared and implemented MP4 demux for this multitrack fixture.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:82-91` — `id: 'edge_multitrack_demux'`, `op: 'demux'`, `asset: 'h264_multitrack.mp4'`, `containersIn:['mp4']`, `videoCodecs:['h264']`, `audioCodecs:['aac']`, `oracles:['golden-packets']`, note: "Multiple tracks interleaved — trackIndex correctness on every packet."
- **Fixture exists & is real:** `fixtures/media/h264_multitrack.mp4` = 4.5 MB real progressive MP4. Golden `fixtures/golden/h264_multitrack.mp4.packets.json` = 139 KB, **1240 packets** distributed 300 (video, track 0) / 470 / 470 (two AAC tracks) — physically plausible: 300 video frames ≈ 10 s × 30 fps; 470 AAC frames ≈ 10 s × 48000/1024. First packet pts = −21333 µs (real edit-list/priming). No synthetic/empty/mock input.
- **Oracle:** `src/core/oracles.ts:703-796` (`goldenPackets`). Real per-track ordered comparison; exact size + keyframe matching (`oracles.ts:777-778`); 1 ms timestamp residual after constant per-track origin alignment (`oracles.ts:772-784`). Not trivially satisfiable — packet count, trackIndex multiset, sizes, and keyframe flags must all match the ffprobe golden.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1152-1183`. Genuine library use: `EncodedPacketSink.packets({ verifyKeyPackets: true })` over real tracks; emits real `byteLength`/`microsecondTimestamp`/bitstream-verified key type. No hardcoded output, no input→output copy, no short-circuit to golden, no error swallowing (try/finally only disposes the input).
- **Cached note:** ALL 7 engines have `cached: true` ("cached previous PASS result"). This row was **reused, not freshly re-run** in this report pass. Per the launcher seeding caveat, stale-PASS reuse is a known risk; the durations are from prior runs (mediabunny startedAt 2026-06-22T16:49Z). Correctness evidence (golden match) is stable, but the millisecond wall-time margins are from cached runs and should be confirmed with a fresh, uncached run before treating the 2.35× margin as authoritative.
- **Verdict:** **REAL** — real 4.5 MB multitrack fixture, real golden with plausible 1240-packet/3-track layout, real strict oracle, real library implementation in the winner. The only caveat is cache staleness on the timing numbers.

## Confidence & caveats

- **Confidence: medium.** Correctness is unambiguous and REAL (7-way exact golden match on a strict oracle). The winner-selection axis (wall time) rests on `durationMs` from **cached** runs; no `bench{}` (throughput/memory/longtasks) was captured for this scenario, so the only performance signal is single-number wall time with no `n`/mad/p95 spread — weaker statistical evidence than a multi-sample benchmark.
- The mediabunny→mp4box margin (2.35×) is comfortable but the absolute numbers (20 vs 47 ms) are small enough that startup-noise on a fresh run could shift ordering among the top three (mediabunny 20, mp4box 47, platform 65).
- ffmpeg-wasm and web-demuxer have marginally tighter timestamp fidelity (drift 0 µs vs 1 µs) but this is irrelevant under the 1000 µs tolerance and they are 8.7×/40.6× slower, so it does not affect ranking.
