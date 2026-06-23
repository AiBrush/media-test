# remux/h264_ts_ts_to_mkv

family: remux | fixture asset: `h264_ts.ts` (4,633,636 bytes, real MPEG-TS, sync byte 0x47) | primaryMetric: wall | passCount: 2 (of 7)

## Verdict

- Best framework: **mediabunny@1.48.0**.
- Status: **CONTESTED** — 2 engines PASS (mediabunny, ffmpeg.wasm@0.12.15) and pass the identical oracle with identical correctness measurements.
- Decisive factor: **performance, after a correctness tie.** Both engines satisfy the same single gate (`reference-reimport`) with byte-for-byte equal measurements (770 reimport packets, 480 keyframes, 2 media tracks, durationDelta 0.026s). The tie is broken on the wall clock and, far more sharply, on main-thread blocking.
- Margin over runner-up (ffmpeg.wasm): wall **1.09x faster** (131.36ms vs 142.91ms), throughputRealtime **1.09x higher** (76.28x vs 70.12x realtime), and **longtasks 19.6x lower** (1017ms vs 19963ms of main-thread blocking). Both samples are n=1 (mad=0), so the wall margin is weak evidence; the longtasks gap is an order-of-magnitude architectural difference, not run noise.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 131.36 ms | 76.28x | 54,744,236 B (52.2 MB) | 1017 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 142.91 ms | 70.12x | (not reported, n=0) | 19963 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ts' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

This cell is a **lossless container rewrap of H.264+AAC from MPEG-TS into Matroska (MKV)** — no re-encode. The coded video samples are identical; what changes is NAL framing and timing model. MPEG-TS carries H.264 as **Annex-B elementary streams** (00 00 01 / 00 00 00 01 start codes) interleaved across 188-byte transport packets with a 90 kHz PCR/PTS clock and AAC in ADTS framing. Matroska stores the same H.264 as **length-prefixed (AVCC-style) NAL units inside SimpleBlocks**, with an `avcC`-equivalent CodecPrivate and a nanosecond timebase. So the remuxer must: (1) reassemble PES from the TS packet layer, (2) strip Annex-B start codes and re-emit length-prefixed NALs, (3) lift SPS/PPS into Matroska CodecPrivate, and (4) retime PTS/DTS from 90 kHz ticks into the Matroska timecode scale. The matrix note (matrix.ts:75) states this exactly: "Annex-B -> Matroska length-prefixed; coded samples unchanged."

Both PASS engines do real work here, and the oracle confirms structural fidelity: `reference-reimport` (oracles.ts:1225, dispatching into `semanticRemuxReimport` at oracles.ts:1273 for `op==='remux'`) re-imports the produced MKV with the reference engine and reports **reimportPackets=770, reimportKeyframes=480, reimportMediaTracks=2** against **goldenMediaTracks=2**, with **durationDeltaSec=0.026 within durationToleranceSec=0.1**. The 480 keyframes / 770 packets ratio and the ~26 ms duration drift are physically plausible for a multi-second H.264+AAC clip whose TS-origin PTS offset has been normalized into Matroska's timebase. Correctness is therefore a genuine tie; the differentiator is execution architecture.

mediabunny ran with `env.configUsed.backend = "webcodecs"`, `hwAccel = "prefer-hardware"`, `pipeline = "streaming-lockstep"`, `coreBuild = "pure-ts-esm"`, `sharedArrayBuffer = false`, `coopCoep = "not-required"`. Its remux path (mediabunny/adapter.ts:1244 `async remux`) builds an `OutputFormat` for the target container (adapter.ts:1250), opens the TS input, wraps a `BufferTarget`, and runs the streaming `Conversion` (adapter.ts:1256 `runConversion`, which calls `mb.Conversion.init` at adapter.ts:848). Because this is a pure rewrap, the Conversion takes the stream-copy path (it does not set `forceTranscode`, which is only set for true transcodes at adapter.ts:687/1494) and performs the Annex-B->AVCC reframing and Matroska muxing in native TypeScript/WebCodecs without spinning up a wasm filesystem. The result is a tight **131.36ms** wall and, crucially, only **1017ms of longtasks**: the work is chunked across the streaming-lockstep pipeline so the main thread is rarely blocked for long.

ffmpeg.wasm produced an output the oracle accepts identically, via a faithful `-c copy` stream rewrap (ffmpeg-wasm/adapter.ts:2031 `async remux`): it writes the TS into MEMFS, runs `runInfo`, then `args = [...inputOptions, '-i', name, '-map', '0', '-c', 'copy', ..., outName]` (adapter.ts:2044) — and for non-MP4/MOV targets like MKV it skips the faststart/frag flags, simply muxing to Matroska. This is a real ffmpeg stream copy, not a fake. But it pays the cost of the single-thread wasm core: **19963ms of longtasks** — a ~19.6x heavier main-thread stall than mediabunny — because the WebAssembly demux/remux loop runs as one or a few monolithic synchronous tasks rather than yielding. Its wall (142.91ms) is only modestly higher, and its peakMemory was not sampled (n=0), but the responsiveness gap is decisive: for an in-browser tool, 20s of cumulative long-task blocking versus ~1s is the difference between a responsive and a frozen UI. Tiebreaker (c) also favors mediabunny: hardware-capable WebCodecs path, no COOP/COEP requirement (`coopCoep: "not-required"`, `sharedArrayBuffer: false`), and streaming rather than whole-file MEMFS buffering.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (identical correctness: 770/480/2, Δ0.026s) but lost on performance: 1.09x slower wall (142.91 vs 131.36ms), 1.09x lower throughput (70.12x vs 76.28x), and **19.6x more main-thread blocking** (19963ms vs 1017ms longtasks). Single-thread wasm core with whole-file MEMFS staging; no peakMemory sample (n=0).
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'." Honest: the browser exposes no container-remux primitive (WebCodecs decodes/encodes frames; it does not mux containers). Correct under-declaration, not a hidden capability.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ts'." Honest: MP4Box.js is an ISOBMFF library; it cannot parse MPEG-TS input. Genuine capability gap for this `from:'ts'` cell.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'." Honest: its writer targets MP4/WebM, not Matroska MKV; cannot satisfy `to:'mkv'`.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'." Honest: it is a demux-only library (produces packets), with no muxer/output container path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'." Honest: a parser/probe library, not a muxer; no remux write path.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/matrix.ts:70-76` (case `asset:'h264_ts.ts', from:'ts', to:'mkv'`), built into id `remux/h264_ts_ts_to_mkv` by `remuxId`/`buildRemux` in `src/scenarios/remux/_shared.ts:73-104`. Default oracle set is `['reference-reimport']` (_shared.ts:78-81).
- Fixture: `fixtures/media/h264_ts.ts` EXISTS — 4,633,636 bytes; first bytes `47 40 11 10 00 42 f0 25` confirm a real MPEG-TS stream (0x47 sync byte). Not synthetic/empty/mock.
- Oracle: `referenceReimport` at `src/core/oracles.ts:1225`, branching into `semanticRemuxReimport` at `src/core/oracles.ts:1273` for `op==='remux'`. It re-demuxes the produced bytes with the reference engine, rejects an empty packet table (oracles.ts:1244-1246), and diffs media-track count/layout vs golden (oracles.ts:1289-1297). The measurements (770 packets, 480 keyframes, 2/2 tracks, Δ0.026s ≤ 0.1s) are real and physically plausible — not trivially satisfiable.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244` (`async remux`) → `runConversion` (adapter.ts:1256 → `mb.Conversion.init` at adapter.ts:848). Genuine library call; stream-copy rewrap (no `forceTranscode`), no canned output, no input->output copy, no short-circuit to golden, no swallowed errors (errors throw).
- Verdict: **REAL**. Real MPEG-TS fixture, real mediabunny Conversion remux, and a structural re-import oracle that actually parses the output and compares track semantics + duration.
- Cached note: mediabunny's result has `cached:true` ("cached previous PASS result"), and so does ffmpeg.wasm. Both rows are reused, not re-run this session. Correctness measurements are deterministic for a lossless rewrap, so the PASS verdicts carry low staleness risk; the perf numbers (especially the n=1 wall medians) should be treated as point estimates from the prior run. The longtasks gap is large enough to survive re-measurement noise.

## Confidence & caveats

- Confidence: **high** on the winner. Correctness is a genuine tie verified by identical oracle measurements; the performance margin is decisive on longtasks (19.6x) and consistent on wall/throughput.
- Caveats: (1) both PASS rows are `cached:true` — not re-run this session. (2) All bench metrics are n=1 (mad=0, p95==median), so the 1.09x wall/throughput margins are weak as standalone evidence; the longtasks order-of-magnitude gap and the architectural rationale (WebCodecs streaming vs single-thread wasm MEMFS) are what carry the decision. (3) ffmpeg.wasm reported no peakMemory (n=0), so a memory comparison is not possible — mediabunny's 52.2 MB is reported but uncontested. (4) Only one oracle gates this cell (`reference-reimport`, a structural/metadata gate); there is no bit-exact decoded-frame check on this row, so "lossless" is verified structurally and by duration, not pixel-by-pixel (this is by design per _shared.ts:22-26).
