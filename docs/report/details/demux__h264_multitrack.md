# demux/h264_multitrack

family: demux | fixture asset: `fixtures/media/h264_multitrack.mp4` (H.264 video + AAC, multi-track MP4, 4.5 MB) | primaryMetric: wall | passCount: 7/7

## Verdict

- Best framework: **mp4box@2.3.0** (engineId `mp4box`).
- Status: **CONTESTED** — all 7 engines PASS the same single gating oracle (`golden-packets`) with identical correctness, so the win is decided on performance.
- Decisive factor: lowest wall-clock demux time. mp4box median **23.135 ms**, runner-up mediabunny **27.205 ms**.
- Margin over runner-up: **1.18x faster wall** than mediabunny (27.205 / 23.135). Far ahead of the rest: 1.21x vs ffmpeg.wasm (27.92 ms), 15.8x vs web-demuxer (640.69 ms), 19.2x vs remotion-webcodecs (444.59 ms), 15.8x vs remotion-media-parser (364.73 ms), 259x vs platform/WebCodecs (6001.69 ms). Caveat: all samples are n=1, mad=0 — single-shot timings, so margins inside ~20% (mp4box vs mediabunny vs ffmpeg.wasm) are weak evidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-packets:pass | 23.135 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:pass | 27.205 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass | 27.920 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass | 364.730 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass | 444.595 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass | 640.690 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass | 6001.690 | n/a | n/a | n/a | cached previous PASS result |

(The shard records only the `wall` metric for every engine; throughputRealtime/peakMemory/longtasks were not emitted for this demux row.)

## Why the winner wins (deep technical)

This scenario is a pure **container-demux** task: enumerate the coded packet table of a multi-track H.264/AAC MP4 and verify it byte-for-byte and timestamp-for-timestamp against the ffprobe golden. The golden (`fixtures/golden/h264_multitrack.mp4.packets.json`) holds **1240 packets across 3 tracks** — track 0 = 300 packets (the H.264 video), tracks 1 and 2 = 470 packets each (the two AAC audio tracks). The first packet is `{trackIndex:1, size:303, ptsUs:-21333, dtsUs:-21333, keyframe:true}`, i.e. ffprobe exposes the raw negative edit-list/priming origin; the oracle (`src/core/oracles.ts:761`-`786`) tolerates a *constant* per-track pts/dts offset but requires sizes and keyframe flags to match exactly and residual ts drift ≤1 ms. Every engine reported `measuredCount:1240 / goldenCount:1240 / comparedTracks:3` with `maxPtsDriftUs` of 0 (ffmpeg.wasm, web-demuxer) or 1 (the rest) — so correctness is a dead heat. The win is therefore decided purely on wall time.

mp4box wins because demuxing this file requires *nothing more than reading the `moov` sample tables*, which is exactly what mp4box.js is. Its `demux()` (`src/engines/mp4box/adapter.ts:765`) buffers the whole file, calls `parseToInfo(bytes, true)` (keepMdatData=true, `createFile(true)` so samples survive — see the warning at `adapter.ts:32`/`:709`), then sets `onSamples` (`adapter.ts:776`) and walks each track's `stbl`. For every sample it copies only scalar fields: `size`, `cts/timescale → ptsUs`, `dts/timescale → dtsUs`, and `is_sync → keyframe` (`adapter.ts:780`-`786`), immediately calling `releaseUsedSamples` (`adapter.ts:790`) so no coded bytes are retained. `nbSamples:100_000` (`adapter.ts:795`) collapses the whole file into one callback, minimizing per-callback overhead, and `flush()` runs synchronously to completion (`adapter.ts:798`). There is **no codec instantiation, no WebCodecs VideoDecoder, no wasm module load, no thread spin-up** — the entire job is JS struct-field reads off the parsed box tree (backend `pure-js`, `hwAccel:false`, `wasmThreads:0` per env.configUsed). That is the structurally minimal amount of work for "read the packet table," which is why it lands at 23.135 ms.

mediabunny (27.205 ms) and ffmpeg.wasm (27.920 ms) are within ~20% and effectively tied with mp4box given n=1/mad=0 single-shot timing; the ranking among these three is real but low-confidence. mediabunny is also pure-TS ESM with no SharedArrayBuffer/COOP-COEP requirement, but for this read-only sample-table walk mp4box's tighter scalar-copy loop edges it out. The three slow demuxers pay a fixed structural tax that dominates a 23 ms job: web-demuxer (640.69 ms) and ffmpeg.wasm both run an FFmpeg-derived libavformat demuxer, but web-demuxer additionally pays worker/wasm-module bootstrap on top of the parse; remotion-media-parser (364.73 ms) is a `cpu-js` full-parse streaming reader (`backend:cpu-js`, `fieldsTier:full-parse(demux)`) whose per-sample JS streaming overhead is an order of magnitude above mp4box's batch box-walk; remotion-webcodecs (444.59 ms) layers its streaming-backpressure WebCodecs-oriented pipeline on top of parsing. The platform/WebCodecs path is catastrophically slow here (6001.69 ms) because "platform" has no native packet-enumeration API — to expose a packet table it must drive a real `VideoDecoder`/MediaRecorder pipeline (env: `decode:VideoDecoder`, `encode:<video>→canvas→MediaRecorder`), so it effectively decodes/processes media frames just to count packets, a ~259x penalty over mp4box's metadata-only walk.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, but lost the perf tiebreak: wall 27.205 ms vs mp4box 23.135 ms (1.18x slower). Correctness identical (1240/1240, 3 tracks, maxPtsDrift 1µs). A near-tie at n=1; not a substantive correctness deficit.
- **ffmpeg.wasm@0.12.15** — PASS, wall 27.920 ms (1.21x slower than mp4box). Actually had the *cleanest* timestamps (maxPtsDriftUs:0), but its libav demuxer carries more per-call overhead than a raw box-walk; loses only on speed, and only by ~20% at n=1.
- **remotion-media-parser@4.0.479** — PASS but 364.73 ms (15.8x slower). `backend:cpu-js`, `fieldsTier:full-parse(demux)` streaming reader; per-sample JS streaming cost dominates a tiny job. Correct (1240/1240, drift 1µs).
- **remotion-webcodecs@4.0.479** — PASS but 444.59 ms (19.2x slower). Streaming-backpressure WebCodecs-oriented pipeline adds parsing+queue machinery atop the demux; correct (1240/1240, drift 1µs).
- **web-demuxer@4.0.0** — PASS but 640.69 ms (15.8x slower than… see ratio: 27.7x slower than mp4box). FFmpeg-in-wasm with worker/module bootstrap tax dwarfing the 23 ms parse. Cleanest drift (maxPtsDriftUs:0) but slowest of the wasm group.
- **platform@chrome-149** — PASS but 6001.69 ms (259x slower). WebCodecs has no packet-table API, so it must run a real VideoDecoder/MediaRecorder pipeline to surface packets — structurally wrong tool for metadata-only demux. Correct (1240/1240, drift 1µs) but disqualified on perf.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:94`-`100` (DEMUX_CASES entry `asset:'h264_multitrack.mp4'`, container mp4, videoCodecs `['h264']`, audioCodecs `['aac']`, note: "Multiple tracks: packets must carry correct trackIndex; golden interleaves both tracks."). The scenarioId `demux/h264_multitrack` is derived at `index.ts:258` (`demux/${asset minus extension}`).
- Fixture: `fixtures/media/h264_multitrack.mp4` exists, **4.5 MB** real MP4 — not synthetic/empty/mock. Goldens exist: `h264_multitrack.mp4.packets.json` (139 KB, 1240 entries), `.meta.json`, `.frames.json`, `.ssim.json`.
- Gating oracle: `golden-packets` at `src/core/oracles.ts:703`-`796`. It performs a real per-track comparison — groups both measured and golden packets by trackIndex, sorts by dts/pts, and checks packet count, trackIndex multiset layout, exact per-packet `size`, exact `keyframe` flag, and pts/dts residual ≤1 ms after a single constant per-track origin offset. It is NOT trivially satisfiable: a wrong count, missing track, wrong size, flipped keyframe flag, or varying timing residual all fail. Measurements are physically plausible (1240 packets, 3 tracks, sub-µs drift, video keyframe size 303 B).
- Winner adapter: `src/engines/mp4box/adapter.ts:765`-`804` (`demux`). Genuine mp4box.js sample-table walk (`onSamples` at `:776`, scalar copy `:780`-`786`, `releaseUsedSamples` `:790`). No hardcoded output, no input→output copy, no golden short-circuit, no error-swallowing — declared capabilities at `:639`/`:667`-`678` confirm probe/demux/remux are pure-JS box operations.
- Verdict: **REAL** — real 4.5 MB fixture, genuine box-parsing implementation, and a meaningful structural/metadata-exact oracle comparing 1240 packets to an ffprobe golden.
- Cached note: the winner's result has `cached:true` ("cached previous PASS result"), as do all 7 engines. Timings (23.135 ms etc.) were reused from a prior run, not re-measured this session; treat the absolute numbers and the tight mp4box/mediabunny/ffmpeg.wasm spread as stale-but-plausible rather than freshly verified.

## Confidence & caveats

- Confidence: **medium**. Correctness is unambiguous and identical for all 7 (oracle real, fixture real, 1240/1240). The *winner identity within the top cluster* is the soft spot: mp4box (23.135), mediabunny (27.205), ffmpeg.wasm (27.920) are all single-shot (n=1, mad=0) and within ~20%, so run-to-run jitter could reorder them. The verdict for mp4box is sound (it does the structurally minimal work — a pure-JS sample-table walk with no codec/wasm/thread init), and the gap to the slow tier (15.8x-259x) is decisive and robust.
- All results are `cached:true`; absolute wall numbers are reused, not re-run this session — a fresh run is advisable before treating the 1.18x mp4box-over-mediabunny margin as final.
