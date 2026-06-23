# demux/size_micro_micro_h264_1frame

- **Family:** demux
- **Fixture asset:** `micro_h264_1frame.mp4` (real file, 5.5 KB, in `fixtures/media/`)
- **Golden:** `fixtures/golden/micro_h264_1frame.mp4.packets.json` — exactly 1 packet, trackIndex 0, size 4749, pts/dts 0, keyframe true
- **Primary metric:** wall (ms)
- **Pass count:** 7 / 7

## Verdict

- **Best framework:** `mp4box@2.3.0`
- **Contested:** YES — all 7 engines PASS the only gating oracle (`golden-packets`) with bit-identical results, so the decision falls entirely to performance.
- **Decisive factor:** wall-clock median. mp4box demuxed in **2.485 ms** vs runner-up mediabunny's **3.945 ms**.
- **Margin over runner-up:** **1.59x faster wall** (3.945 / 2.485). Caveat: every engine ran n==1 (single sample, mad=0), so the margin is a single-shot measurement, not a distribution — weak statistical evidence at sub-10ms timescales.

## Per-engine results

All correctness is identical: every engine passes `golden-packets` with measuredCount=1, goldenCount=1, comparedTracks=1, maxPtsDriftUs=0. bench carries only `wall` (no throughputRealtime / peakMemory / longtasks were collected for this micro demux row).

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-packets:true | **2.485 ms** | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true | 3.945 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 6.945 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 9.485 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 11.130 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true | 25.905 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 6001.105 ms | n/a | n/a | n/a | cached previous PASS result |

## Why the winner wins (deep technical)

This scenario is the smallest valid H.264-in-MP4: a single keyframe (IDR) sample of 4749 bytes inside a ~5.5 KB faststart MP4. The operation is "walk the packet table and emit one PacketInfo per sample." The gating oracle (`src/core/oracles.ts:703` `goldenPackets`) compares the emitted packet multiset against the ffprobe golden per-track: exact `size`, exact `keyframe` flag, and pts/dts within a constant per-track origin offset. With only one keyframe packet there is nothing to interleave, no edit-list/priming shift, and no inter-frame dts/cts reordering to get wrong — so correctness is trivially achievable by any competent MP4 parser. Indeed all 7 report the identical measurement (1 packet, maxPtsDriftUs=0). Correctness therefore cannot separate the field; only the cost of reaching that answer can.

mp4box wins because of how its adapter touches the file. `src/engines/mp4box/adapter.ts:765` `demux()` runs entirely in pure JS (`env.configUsed.backend:"pure-js"`, no wasm, no WebCodecs, no worker). It reads the whole 5.5 KB into one `ArrayBuffer`, wraps it as a single `MP4BoxBuffer` with `fileStart=0` (`appendBuffer` path, `pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"`), parses the `moov` once, and then drains samples synchronously: `file.setExtractionOptions(t.id, null, {nbSamples: 100_000})` (adapter.ts:795) followed by `file.start(); file.flush(); file.stop()` (adapter.ts:797-799). Because the input is whole-file, `flush()` drives `processSamples` to completion in one synchronous pass; the `onSamples` callback (adapter.ts:776) copies only the scalar fields it needs — `s.size`, `s.cts`, `s.dts`, `s.is_sync` (adapter.ts:782-785) — and immediately calls `releaseUsedSamples` (adapter.ts:790) so no media bytes are retained. For a 1-sample file this is essentially "parse one stbl, read one entry," with zero codec init, zero GPU/WebCodecs handshake, and zero wasm module instantiation. That is why it lands at 2.485 ms.

The runner-up, mediabunny (3.945 ms), is correct and fast but pays a structural tax it does not need here: `env.configUsed.backend:"webcodecs"` with `hwAccel:"prefer-hardware"` and a `streaming-lockstep` pipeline plus a `canvasPoolSize:4`. Even though pure demux does not require a decoder, the engine's path carries WebCodecs-oriented setup overhead that a pure-JS box parser avoids, costing the ~1.46 ms gap. ffmpeg.wasm (6.945 ms) is roughly 2.8x slower than mp4box because every demux goes through the wasm FS boundary and libavformat probing — heavyweight for a 1-frame file. remotion-media-parser (9.485 ms, `backend:"cpu-js"`, `streaming`/`webReader`) and remotion-webcodecs (11.130 ms, WebCodecs + `streaming-backpressure` + bufferWriter) carry their streaming-reader and conversion-pipeline scaffolding. web-demuxer (25.905 ms) is the slowest of the lightweight engines, consistent with spinning up its ffmpeg-derived wasm worker for what is a one-packet read.

platform@chrome-149 is the outlier at **6001.105 ms** — ~2415x slower than mp4box. Its config (`decode:"VideoDecoder"`, `encode:"<video>→canvas→MediaRecorder(out)"`, `pixelBackend:"webgpu>webgl>offscreen2d"`) shows the browser-native path drives the full WebCodecs/`<video>` element machinery and almost certainly hits a fixed ~6 s timer/settle window (MediaRecorder / element readiness) regardless of payload size. It still produces the correct single packet, so it PASSes, but it is non-competitive for micro demux.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on speed: 3.945 ms vs 2.485 ms = **1.59x slower**. WebCodecs/`prefer-hardware` + `streaming-lockstep` setup overhead is dead weight for a pure 1-frame box-table read.
- **ffmpeg.wasm@0.12.15** — PASS, lost on speed: 6.945 ms = **2.79x slower**. wasm FS round-trip + libavformat probing is heavy for a 5.5 KB single-sample file.
- **remotion-media-parser@4.0.479** — PASS, lost on speed: 9.485 ms = **3.82x slower**. `cpu-js` streaming `webReader` scaffolding dominates at this tiny size.
- **remotion-webcodecs@4.0.479** — PASS, lost on speed: 11.130 ms = **4.48x slower**. WebCodecs + `streaming-backpressure` + bufferWriter conversion pipeline overhead with nothing to amortize it over.
- **web-demuxer@4.0.0** — PASS, lost on speed: 25.905 ms = **10.42x slower**. ffmpeg-derived wasm worker startup cost for a one-packet demux.
- **platform@chrome-149** — PASS, lost on speed: 6001.105 ms = **~2415x slower**. Native `VideoDecoder`/`<video>`→MediaRecorder path appears to incur a fixed multi-second settle window independent of payload.

No engine returned NA or FAIL here; the only differentiator is wall time.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:298` (`SIZE_CASES[0]`), `asset: 'micro_h264_1frame.mp4'`, `container: 'mp4'`, `bucket: 'micro'`, `videoCodecs: ['h264']`. Notes (line 302): "Micro: a single-frame H.264 MP4 must demux to exactly one keyframe packet (golden has 1)." Gating rationale is header/edge robustness of the packet walk at minimum valid size.
- **Fixture exists:** `fixtures/media/micro_h264_1frame.mp4`, 5.5 KB — a real H.264/MP4 file, not synthetic/empty/mock.
- **Golden exists and is plausible:** `fixtures/golden/micro_h264_1frame.mp4.packets.json` = a single packet `{trackIndex:0, size:4749, ptsUs:0, dtsUs:0, keyframe:true}`. A 4749-byte IDR keyframe in a 5.5 KB MP4 (rest = ftyp/moov/box overhead) is physically consistent.
- **Oracle:** `src/core/oracles.ts:703` `goldenPackets`. It does a real per-track comparison: exact packet count, exact trackIndex layout, **exact `size`** (oracles.ts:777) and **exact `keyframe`** flag (oracles.ts:778), with pts/dts tolerant only to a constant per-track origin offset (oracles.ts:772-784). Not trivially satisfiable — wrong size or wrong sync flag fails. For 1 packet it still enforces size==4749 and keyframe==true. Measurement maxPtsDriftUs=0 is exact, consistent with both pts/dts==0.
- **Winner adapter:** `src/engines/mp4box/adapter.ts:765` `demux()`. Genuinely calls MP4Box.js: `setExtractionOptions` (adapter.ts:795), `start/flush/stop` (adapter.ts:797-799), and reads real sample fields `s.size/s.cts/s.dts/s.is_sync` in `onSamples` (adapter.ts:776-786). No hardcoded output, no copy-input-to-output, no golden short-circuit, no error swallowing.
- **Verdict:** **REAL** — real fixture + real MP4Box parse + a strict exact-size/exact-keyframe oracle.
- **Cached note:** ALL 7 entries have `cached:true` ("cached previous PASS result"). The result is reused, not freshly re-run in this report pass. Per the launcher seeding caveat, stale PASS reuse is a known risk; for a deterministic single-packet demux the correctness is stable, but the wall numbers are historical single-shot samples and should be re-run fresh before being quoted as a hard performance ranking.

## Confidence & caveats

- Correctness verdict (REAL) is high confidence: real fixture, strict oracle, genuine adapter code path verified at file:line.
- Performance ranking confidence is **medium**: every engine is n==1 (mad=0, p95==median), so the 1.59x mp4box-over-mediabunny margin rests on one measurement each at sub-4ms scale, where GC/JIT jitter is significant. The ordering among the lightweight pure-parse engines (mp4box < mediabunny < ffmpeg-wasm) is plausible and consistent with their backends, but the exact ratios are soft.
- All entries are cached; a fresh re-run is advisable before treating these wall times as authoritative.
- The platform 6001 ms figure is almost certainly a fixed settle/timer artifact of the native decode→MediaRecorder path, not a per-frame cost; it is a real PASS but not a meaningful demux benchmark.
