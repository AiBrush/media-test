# demux/realworld_mdn_flower_mp4

- **family**: demux
- **fixture asset(s)**: `fixtures/media/realworld_mdn_flower.mp4` (1.1 MB, real MDN CC0 "flower" clip — H.264 video 960×540 @ 29.97fps + AAC stereo 48kHz, mp42 brand, 5.055s)
- **primaryMetric**: wall (ms)
- **passCount**: 5 of 7

## Verdict

- **Best framework**: `mp4box@2.3.0` (env.engineId `mp4box`).
- **Contested**: YES — 5 engines PASS the same gating oracle (`golden-packets`).
- **Decisive factor**: All 5 passing engines produce a bit-identical packet table (387 packets, 2 tracks), so correctness strength is a tie. Performance breaks the tie. mp4box has the lowest wall median by a wide margin.
- **Margin over runner-up**: mp4box 7.08 ms vs ffmpeg.wasm 19.34 ms → **2.73× faster wall** than the next-fastest. vs the slowest passer (platform/WebCodecs, 6000.93 ms) it is **~848× faster**. Caveat: all benches are n=1 (mad=0, p95==median), so spread is unknown and the ranking is weaker evidence than a multi-sample run would give.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-packets:pass (387 pkts, maxPtsDrift=1µs) | 7.08 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (387 pkts, maxPtsDrift=0µs) | 19.34 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (387 pkts, maxPtsDrift=0µs) | 28.45 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (387 pkts, maxPtsDrift=0µs) | 40.06 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass (387 pkts, maxPtsDrift=0µs) | 6000.93 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'packets:dts' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'packets:dts' |

(throughputRealtime/peakMemory/longtasks are not present in this shard's bench block for any engine — only `wall` was sampled.)

## Why the winner wins (deep technical)

This scenario is a pure container-demux task: read a faststart progressive MP4, walk the ISO-BMFF sample tables, and emit a `PacketInfo[]` carrying per-sample `size`, `ptsUs` (from `cts`), `dtsUs` (from `dts`), and `keyframe` (from `is_sync`). The fixture is genuine H.264 with B-frames — the golden's first video packets show reordered timestamps (e.g. pkt0 pts=0/dts=−66733µs, pkt1 pts=133467/dts=−33367), so a correct demuxer must surface `cts != dts`. The scenario gates on the `packets:dts` feature precisely because it requires DTS to be exposed, not just PTS.

Because demux here is metadata/sample-table extraction (no pixel decode), the work is dominated by box parsing and stbl/stts/stsc/stsz/stco/ctts walking — a pure-CPU job. mp4box is a pure-JS ISO-BMFF parser (`env.configUsed.backend: "pure-js"`, `pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"`, no wasm threads, no worker). Its demux path (`src/engines/mp4box/adapter.ts:765-804`) appends the whole 1.1 MB buffer once, sets `setExtractionOptions(t.id, null, {nbSamples: 100_000})` per track (adapter.ts:794-795), then `file.start(); file.flush(); file.stop()` drives `onSamples` synchronously to completion. In the `onSamples` callback (adapter.ts:776-791) it copies only the scalar fields — `s.size`, `Math.round((s.cts/ts)*1e6)`, `Math.round((s.dts/ts)*1e6)`, `!!s.is_sync` — and immediately calls `releaseUsedSamples` (adapter.ts:790) so no media bytes are retained. This is the minimal possible work for a sample-table demux: one parse pass, scalar copy, no decode, no re-buffering. That is why its wall median is 7.08 ms.

The runner-up, ffmpeg.wasm (19.34 ms), pays the cost of marshaling the file into the wasm FS and running libavformat's demuxer through the WASM/asm boundary — correct (maxPtsDrift=0µs) but 2.73× the wall of native-JS box walking for a file this small, where JS startup beats wasm module/FS overhead. The two Remotion engines (remotion-webcodecs 28.45 ms; remotion-media-parser 40.06 ms, `backend: "cpu-js"`, `fieldsTier: "full-parse(demux)"`) are also correct but their streaming parsers do more bookkeeping per sample. platform@chrome-149 (6000.93 ms) is the outlier: its config (`backend: "webcodecs"`, `hwAccel: true`, `decode: "VideoDecoder"`, `encode: "<video>→canvas→MediaRecorder"`) routes through the full WebCodecs/`<video>` media pipeline to recover the packet table, so it spins up the hardware decode path and element lifecycle just to enumerate packets — three orders of magnitude slower for an operation that needs no decoding at all.

On correctness mp4box is essentially tied: golden-packets reports `measuredCount:387, goldenCount:387, comparedTracks:2`, with `maxPtsDriftUs: 1` for mp4box vs `0` for the others. The 1µs delta is a rounding artifact of converting track-tick `cts`/`dts` to microseconds (adapter.ts:783-784, `Math.round((s.cts/ts)*1e6)`) and is well inside the oracle's `tsTolUs` (1 ms = 1000 µs, oracles.ts:738), so it is a non-issue. Sizes and keyframe flags matched exactly (no `sizeMismatch`/`kfMismatch` diffs), confirming mp4box read the real, B-frame-reordered sample table rather than a smoothed/PTS-only approximation.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but lost on speed: 19.34 ms wall vs 7.08 ms (2.73× slower). WASM module + in-memory FS marshaling overhead dominates for a 1.1 MB file where native-JS box parsing is cheaper.
- **remotion-webcodecs@4.0.479** — PASS, lost on speed: 28.45 ms (4.0× slower). Streaming-backpressure parse pipeline adds per-sample overhead beyond a one-shot table walk.
- **remotion-media-parser@4.0.479** — PASS, slowest of the correct CPU parsers: 40.06 ms (5.66× slower). `cpu-js` full-parse(demux) tier does more field extraction than this packet-only task needs.
- **platform@chrome-149** — PASS but catastrophically slow for demux: 6000.93 ms (~848× slower). It uses the WebCodecs `VideoDecoder` + `<video>`/MediaRecorder pipeline to derive packets, invoking hardware decode/element setup that pure demux does not require.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare feature 'packets:dts'". Honest NA — `grep` finds no `packets:dts` in its adapter; it does not advertise DTS-exposing demux, which this B-frame scenario requires.
- **mediabunny@1.48.0** — NA_ENGINE: "engine does not declare feature 'packets:dts'". Honest NA — same: no `packets:dts` declaration in its adapter. Mediabunny normalizes to presentation timestamps and does not surface raw per-sample DTS, so skipping (rather than failing) the DTS-gated case is correct.

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/demux/index.ts:67-77` — `id: 'realworld_mdn_flower_mp4'`, `asset: 'realworld_mdn_flower.mp4'`, container mp4, videoCodecs h264, audioCodecs aac, `features: ['packets:dts']`. Notes (lines 74-76) state the purpose: ensure the downloaded MP4 actually demuxes into the expected H.264/AAC packet table.
- **Fixture exists / real**: `fixtures/media/realworld_mdn_flower.mp4` is present, 1.1 MB. Golden meta (`fixtures/golden/realworld_mdn_flower.mp4.meta.json`) describes real 960×540 29.97fps H.264 + 48kHz AAC; golden packets (`...packets.json`, 43 KB) encode 387 packets with genuine B-frame reorder (negative DTS, cts≠dts). Not synthetic/mock/empty.
- **Gating oracle**: `goldenPackets` at `src/core/oracles.ts:701-796`. It compares measured vs golden packet count, per-track trackIndex layout, and per-position `size` (exact), `keyframe` flag (exact), plus PTS/DTS with a constant per-track origin-shift allowance and ±1000µs residual tolerance (oracles.ts:738, 774-792). This is a real structural comparison against an ffprobe-derived golden — not trivially satisfiable (size and keyframe must match exactly; only a constant edit-list/priming offset is forgiven). Measurements (387/387 packets, 2 tracks, maxPtsDrift 0–1µs) are physically plausible for a 5.055s clip.
- **Winner adapter**: `src/engines/mp4box/adapter.ts:765-804` (`demux`). Genuinely calls mp4box.js: appends the real buffer (line 766-767), sets extraction options (line 795), drives `start/flush/stop` (lines 797-799), and reads scalars from real `onSamples` callbacks (lines 776-791). No canned output, no copy of golden, no input→output passthrough, no error swallowing. `keepMdatData=true` (createFile(true)) so samples actually carry data (adapter.ts:709-718).
- **Cached note**: ALL 7 entries have `cached: true` ("cached previous PASS result"). The ranking is from reused results, not a fresh re-run — staleness risk per the launcher-seeding caveat. The winner's PASS and 7.08 ms wall are real but were not freshly re-measured in this run.
- **Verdict**: **REAL** — real fixture, genuine mp4box demux implementation, meaningful structural golden-packets oracle with exact size/keyframe matching. Minor caveat: evidence is entirely cached.

## Confidence & caveats

- Correctness ranking is firm: 5/5 passers produce identical 387-packet tables; mp4box's 1µs PTS drift is a rounding artifact inside tolerance.
- Performance ranking rests on **n=1 wall samples** (mad=0, p95==median for every engine) — no variance data, so the 2.73× margin over ffmpeg.wasm is directional, not statistically robust.
- All results are **cached==true**; numbers were not re-measured this run (stale-reuse risk).
- bench only contains `wall`; throughputRealtime/peakMemory/longtasks were not recorded, so the tiebreak used wall median only.
- mediabunny/web-demuxer NAs are honest under-the-hood capability gaps (no `packets:dts` declaration), not under-declared — DTS surfacing is a legitimate API difference.
