# demux/size_large_large_h264_1080p_120s

- **family:** demux
- **fixture asset:** `fixtures/media/large_h264_1080p_120s.mp4` (~90 MB, 120 s, 1080p H.264 video + AAC audio, faststart MP4 / ISO-BMFF)
- **golden:** `fixtures/golden/large_h264_1080p_120s.mp4.packets.json` (1.1 MB, 9226 packets across 2 tracks)
- **primaryMetric:** `wall` (memoryGated → SCALE_METRICS = [`wall`, `peakMemory`, `longtasks`])
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES — all 7 engines PASS the identical gating oracle `golden-packets` with bit-identical packet tables (9226 packets, 2 tracks). Correctness is therefore a dead heat; the decision falls to **performance on the primaryMetric (`wall`)**.
- **Decisive factor:** lowest `wall` median. ffmpeg.wasm = **211.98 ms**, beating the runner-up mediabunny (230.73 ms) by **1.09x** and mp4box (302.17 ms) by **1.43x**. Every other PASS engine is an order of magnitude slower (platform 547 ms, remotion-media-parser 8091 ms, remotion-webcodecs 14535 ms, web-demuxer 14932 ms).
- **Caveat on the win:** the margin over mediabunny is thin (≈19 ms, n=1, mad=0 — single-sample evidence) and ffmpeg.wasm pays for its low wall with the second-worst main-thread blocking (longtasks 1361 ms vs mediabunny... actually mediabunny is worse at 4531 ms; mp4box 1217 ms). See caveats.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (9226, drift 0µs) | 211.98 | n/a (not recorded) | 0 (not measured) | 1361 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true (9226, drift 1µs) | 230.73 | n/a | 0 (not measured) | 4531 | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true (9226, drift 1µs) | 302.17 | n/a | 478,054,193 (478 MB) | 1217 | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true (9226, drift 1µs) | 546.54 | n/a | 0 (not measured) | 159 | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (9226, drift 1µs) | 8090.93 | n/a | 0 (not measured) | 19963 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (9226, drift 1µs) | 14535.41 | n/a | 0 (not measured) | 1394 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true (9226, drift 0µs) | 14931.97 | n/a | 0 (not measured) | 1217 | cached previous PASS result |

(No engine emitted a `throughputRealtime` metric for this row; the gated SCALE_METRICS set is wall/peakMemory/longtasks. Only mp4box reported a nonzero `peakMemory` — `performance.measureUserAgentSpecificMemory()` returned 0/empty for the others.)

## Why the winner wins (deep technical)

**The operation is a pure packet-table demux of a 90 MB faststart MP4 (H.264 + AAC).** No decoding, no pixel work — the engine must walk the `moov` sample tables (`stsz`/`stco`/`stsc`/`stts`/`ctts`/`stss`) and emit, per packet, `{trackIndex, size, ptsUs, dtsUs, keyframe}`. The golden has 9226 packets over 2 tracks; the oracle compares per-track, order-independently, with exact `size` + `keyframe` matching and ≤1 ms ts tolerance after a constant per-track origin shift (`src/core/oracles.ts:761-795`). All seven engines reproduce the table exactly (`maxPtsDriftUs` 0 or 1), so the oracle cannot separate them — this row is a *performance* contest, and `wall` is the primaryMetric.

**ffmpeg.wasm's path (`src/engines/ffmpeg-wasm/adapter.ts:260-488`).** Because the vendored `@ffmpeg/core` 0.12.10 `_ffprobe` entry is broken (returns -1 for every probe; documented at adapter.ts:262-267), demux is driven through the reliable `ffmpeg` program: it runs `ffmpeg -i <in> -c copy -f framecrc <out>` (adapter.ts:269), then parses the framecrc text (one line per packet: `#tb`, then per-packet `pts/dts/size/F=0x<flags>` at adapter.ts:441-488). This is a genuine container demux inside single-thread wasm — `-c copy` copies coded bytes without re-encoding, and framecrc emits the per-packet metadata the oracle needs. On the M1 Max, the WASM `mov,mp4` demuxer streams the sample tables and finishes the whole 90 MB / 9226-packet walk in **211.98 ms** — the fastest of all seven. Crucially, the heavy lifting happens inside the wasm module (off the structured JS heap), which is also why `measureUserAgentSpecificMemory()` reports 0 for it: the bytes live in the WASM linear memory, not in counted JS objects.

**Why it edges mediabunny.** mediabunny (`src/engines/mediabunny/adapter.ts:1152-1183`) uses `EncodedPacketSink.packets(..., { verifyKeyPackets: true })` per track. `verifyKeyPackets` forces it to load *full* packet payloads (adapter.ts:1163-1165) so it can bitstream-verify keyframe type — correct, but it means mediabunny materializes packet bodies in JS-land and runs a bitstream scan per packet. That extra per-packet verification is what produces its **4531 ms** of long tasks (highest of the fast trio) even though its wall (230.73 ms) is only 1.09x behind. mediabunny is the architecturally cleaner engine here (hardware-class WebCodecs config, `coopCoep: not-required`, pure-TS ESM, streaming-lockstep), but on raw wall for this specific copy-demux it loses by ≈19 ms.

**Why it edges mp4box.** mp4box (`src/engines/mp4box/adapter.ts:765-803`) is pure-JS and uses `pipeline: whole-file-append(MP4BoxBuffer+fileStart)` — it `await input.arrayBuffer()`s the entire 90 MB, appends it as one buffer, and drives `onSamples` to completion. It diligently calls `releaseUsedSamples` (adapter.ts:790) to drop sample bodies, yet still reports **478 MB peak memory** — the whole-file buffer plus the parsed 9226-entry sample table. Its wall (302.17 ms) is 1.43x slower than ffmpeg.wasm, and it is the only engine that pays a measured half-gigabyte memory cost on a memory-gated rung. For a streaming-demux scenario whose whole point (per the scenario note) is "stream the packet table without buffering the whole file," mp4box's whole-file append is the least scalable of the fast engines.

**Decisive factor restated:** on the gated primaryMetric `wall`, ffmpeg.wasm is fastest (211.98 ms), winning by 1.09x over mediabunny and 1.43x over mp4box, with no measured memory blow-up.

## What each other framework did wrong

- **mediabunny@1.48.0 (PASS, lost):** wall 230.73 ms vs winner 211.98 ms (**+8.8%**, runner-up). `verifyKeyPackets:true` forces full-payload loads + per-packet bitstream verification (adapter.ts:1163-1165), giving the highest longtasks of the fast group (4531 ms). Thin loss; strongest runner-up.
- **mp4box@2.3.0 (PASS, lost):** wall 302.17 ms (**1.43x** slower). Whole-file `appendBuffer` pipeline → **478 MB peakMemory** (only engine with a measured memory cost); contradicts the scenario's "don't buffer the whole file" intent.
- **platform@chrome-149 (PASS, lost):** wall 546.54 ms (**2.58x** slower). Its WebCodecs/streaming config is built for decode, not a bare packet-table walk; lowest longtasks (159 ms) but loses decisively on wall.
- **remotion-media-parser@4.0.479 (PASS, lost):** wall 8090.93 ms (**38x** slower). `backend: cpu-js`, `fieldsTier: full-parse(demux)` on the main thread → catastrophic longtasks of **19963 ms** (worst of all engines, ~20 s of main-thread blocking).
- **remotion-webcodecs@4.0.479 (PASS, lost):** wall 14535.41 ms (**68.6x** slower). The convert path runs on the main thread; for a plain packet table its streaming-backpressure machinery is pure overhead.
- **web-demuxer@4.0.0 (PASS, lost):** wall 14931.97 ms (**70.4x** slower, slowest engine). Exact packet match (drift 0µs) but its wasm FFmpeg-based demuxer is the slowest at this scale.

No engine returned NA or FAIL on this row, so there are no under-declared capabilities or oracle failures to adjudicate.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:332-341` (the `large_h264_1080p_120s.mp4` SIZE_CASE, bucket `large`, `memoryGated:true`) → id assembled at `src/scenarios/demux/index.ts:381-398` as `demux/size_${bucket}_${asset-stem}` = `demux/size_large_large_h264_1080p_120s`. Oracle declared: `['golden-packets']`; metrics `SCALE_METRICS` (`src/scenarios/demux/index.ts:293`).
- **Fixture exists & is real:** `fixtures/media/large_h264_1080p_120s.mp4` present, ~90 MB — a genuine 120 s 1080p H.264/AAC MP4, not synthetic/empty/mock. Golden `fixtures/golden/large_h264_1080p_120s.mp4.packets.json` present (1.1 MB, 9226 packets).
- **Gating oracle is real:** `src/core/oracles.ts:703-796`. It loads golden packets, fails if absent (line 708), checks packet count, track-index multiset layout, then does a per-track, dts/pts-sorted, position-by-position comparison requiring exact `size` and `keyframe` flag matches with only a ≤1 ms ts tolerance after a *constant* per-track origin shift (varying residuals fail). Not trivially satisfiable; measurements (9226 measured == 9226 golden, comparedTracks 2, maxPtsDriftUs 0–1) are physically plausible for a 120 s 1080p clip (~30 fps → ~3600 video frames + AAC frames ≈ 9226 total).
- **Winner adapter is genuine:** `src/engines/ffmpeg-wasm/adapter.ts:269` runs the real wasm FFmpeg program `ffmpeg -i <in> -c copy -f framecrc`; packets are parsed from real framecrc output at adapter.ts:441-488 (per-packet size/pts/dts/keyframe). No canned output, no copy-of-golden short-circuit, no error-swallow-as-success. The 9226-packet exact match against an independently baked ffprobe golden confirms a real demux.
- **cached note:** ffmpeg.wasm's result is **cached==true** ("cached previous PASS result", startedAt 2026-06-22T14:06:57Z). ALL seven engines in this shard are cached==true — none were re-run for this report. Staleness risk applies uniformly; the n=1 single-sample wall medians cannot be re-verified from the shard alone.
- **Verdict:** **REAL** — real 90 MB fixture, real wasm-FFmpeg demux implementation, meaningful exact-match packet oracle with plausible measurements. The only reservation is operational (all-cached, n=1), not a cheat.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict (7/7 exact packet match) is airtight. The *winner* selection is performance-only with a **thin 1.09x margin** over mediabunny on **n=1, mad=0** samples — a single re-run could plausibly flip ffmpeg.wasm and mediabunny.
- All results are **cached** (no fresh run); per the launcher-seeding caveat, stale PASS reuse means these numbers were not regenerated for this report.
- `peakMemory` is 0/unmeasured for 6 of 7 engines (`measureUserAgentSpecificMemory()` returned empty), so the only hard memory datapoint is mp4box's 478 MB. ffmpeg.wasm's true memory footprint lives in WASM linear memory and is invisible to the JS memory counter — its "0" is not evidence of low memory.
- `throughputRealtime` is not recorded for this row, so the performance ranking rests on `wall` (primaryMetric), with `longtasks` as a secondary signal (where ffmpeg.wasm 1361 ms is mid-pack, better than mediabunny's 4531 ms but worse than platform's 159 ms).
