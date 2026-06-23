# streaming-output/stream_large_vp9_webm

Family: streaming-output | Fixture: `fixtures/media/large_vp9_1080p_120s.webm` (~102 MB, 120 s 1080p VP9 + Opus) | primaryMetric: peakMemory | passCount: 1/7

## Verdict

Best framework: **mediabunny@1.48.0** (uncontested — the only PASS of 7 engines).

Decisive factor: it is the only adapter that simultaneously declares the `remux` operation, the `webm` input container, AND the `target:writes` (StreamTarget) feature, so it is the only engine the runner even lets execute this WebM→WebM stream-target remux. It then passed the gating `reference-reimport` oracle: a reference engine re-imported its streamed output to 9601 packets / 6061 keyframes across 2 media tracks (golden 2 tracks), with duration delta 0.007 s well inside the 0.1 s tolerance.

Margin over runner-up: not applicable — there is no second PASS. The other 6 engines were all NA (capability not declared); none produced a competing measurement.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 235.3 ms | 510.02 x-realtime | 0 (not measured) | 185 ms | streamed remux; reimport 9601 pkts / 6061 kf / 2 tracks, durΔ 0.007s |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |

Note: `peakMemory` (the declared primary metric) is reported as 0 with `n:0`/empty samples — i.e. it was NOT measurable here (no cross-origin-isolated `measureUserAgentSpecificMemory`, no `performance.memory` fallback in this run), exactly the honest-null behavior the scenario header documents. The ranking therefore rests on correctness (reference-reimport) plus the secondary wall/throughput/targetWrites telemetry, since the primary metric is absent for the lone runner.

## Why the winner wins (deep technical)

This case is a **container remux of VP9 video + Opus audio inside a Matroska/WebM file at the ~100 MB "large" rung, written through a streaming output target** (`shape: { container: 'webm', target: 'stream' }`, `from: 'webm' to: 'webm'`, `src/scenarios/streaming-output/size-ladder.ts:60-71`). No codec change is requested, so the operation should copy encoded VP9/Opus samples from the source EBML into a freshly muxed WebM while never holding the whole output in a single buffer.

mediabunny is the only engine whose declared capability set covers all three gates the runner checks for this case: `operation 'remux'`, `input container 'webm'`, and `feature 'target:writes'`. The other six each trip exactly one of those gates (see below), so the runner short-circuits them to NA before any media work — leaving mediabunny as the sole executor.

Mechanistically, the winner ran on the `webcodecs` backend with `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required` (from `env.configUsed`). The remux path is `remux()` at `src/engines/mediabunny/adapter.ts:1244-1260`: it builds a `WebMOutputFormat` via `makeOutputFormat` (`src/engines/mediabunny/codecs.ts:171`), opens the input with `openInput`, then constructs the **StreamTarget** through `instrumentedOutputTarget` (`adapter.ts:767`, stream branch at `adapter.ts:776-817`). That branch wires a real `WritableStream<StreamTargetChunk>` into `new mb.StreamTarget(writable)` (`adapter.ts:801`); each muxer write fires `markWrite()` (`adapter.ts:771-774`, `788`) so `targetWrites` is genuine write telemetry, and the chunks are reassembled positionally into the final byte array only after the stream `close()` resolves (`adapter.ts:804-815`). The actual muxing is `mb.Conversion.init(...).execute()` inside `runConversion` (`adapter.ts:842-867`) — mediabunny's real conversion engine, which validates usable output tracks (`conversion.isValid`) and throws on empty/invalid output rather than emitting a fake file. There is no input→output byte copy and no short-circuit to the golden.

The gating oracle is `reference-reimport` (`src/core/oracles.ts:1225-1271`, remux branch `semanticRemuxReimport` at `oracles.ts:1273+`). It takes mediabunny's emitted bytes, feeds them as a fresh input to a *different* reference engine's `demux()` (`oracles.ts:1230-1236`), and asserts the re-imported stream is semantically intact. The recorded measurements are physically consistent with a real 120 s 1080p VP9/Opus WebM: `reimportPackets: 9601`, `reimportKeyframes: 6061`, `reimportMediaTracks: 2` vs `goldenMediaTracks: 2`, and `durationDeltaSec: 0.006999...` against `durationToleranceSec: 0.1`. The duration delta of 7 ms is the expected sub-block tail rounding from re-muxing Matroska clusters, comfortably inside tolerance. The 6113 `targetWrites` and 102,380,586 `bytesOut` (~102 MB, matching the source size for a lossless container copy) further confirm a genuine large-file streamed mux, not a trivial pass-through. Throughput of 510x realtime at a 235 ms wall is plausible for a no-transcode copy of pre-encoded VP9/Opus packets.

## What each other framework did wrong

- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest under-coverage: the bare WebCodecs platform adapter exposes decode/encode primitives but no container remux operation, so it cannot service a WebM→WebM remux at all.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: media-parser is a demux/probe-only library with no muxing/remux path.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: a demuxer (read-side) only; it has no output/mux capability to remux into WebM.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". Honest and correct: mp4box.js is an ISO-BMFF (MP4/MOV) library and genuinely cannot read a Matroska/WebM input; declining a WebM input is the right call, not an under-declaration.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'target:writes'". This one is a capability boundary worth flagging: ffmpeg.wasm can certainly remux WebM, but its MEMFS-based model materializes the whole output file in the wasm heap and does not expose an incremental StreamTarget, so it correctly declines the `target:writes` (streaming-output) feature this scenario requires. Honest given the streaming contract — though it means the strongest CLI remuxer is excluded by the streaming axis, not by inability to remux.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'target:writes'". Same streaming-target gate: it has remux/transcode but no incremental write-through output target declared. Honest.

## Anti-cheat validation

- Scenario definition: `src/scenarios/streaming-output/size-ladder.ts:60-71` (id `stream_large_vp9_webm`), built via `buildStream` in `src/scenarios/streaming-output/_shared.ts`.
- Fixture asset: `fixtures/media/large_vp9_1080p_120s.webm` — EXISTS, ~102 MB real VP9/Opus WebM (verified via `ls`). Golden present: `fixtures/golden/large_vp9_1080p_120s.webm.{meta,packets,frames,ssim}.json`. Not synthetic/mock; `bytesOut` 102,380,586 matches the fixture size, consistent with a real lossless container copy.
- Oracle: `reference-reimport` / `semanticRemuxReimport`, `src/core/oracles.ts:1225-1324`. It is a REAL comparison — it re-demuxes the engine's actual output through a separate reference engine and checks media-track count/layout against golden and duration within tolerance. It rejects empty packet tables (`oracles.ts:1244-1250`). Measurements (9601 pkts, 6061 kf, 2 tracks, 7 ms duration delta) are physically plausible for the asset. Not trivially satisfiable.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1260` (remux), `767-817` (StreamTarget instrumentation), `842-867` (runConversion → real `mb.Conversion.init/execute`). Genuine library call; no canned output, no input→output copy, no golden short-circuit, no error swallowing (it throws on invalid conversion / missing buffer).
- Cached: this engine result has no `cached:true` flag (field absent / freshly run, `startedAtIso` 2026-06-22T17:33:38Z) — no staleness risk.
- Verdict: **REAL**. Real 102 MB fixture, real mediabunny Conversion + StreamTarget code path, and a meaningful re-import correctness gate with plausible measurements.

## Confidence & caveats

Confidence: high on the verdict (only 1 eligible PASS; real code + real fixture + meaningful oracle). Caveats: (1) the declared primary metric `peakMemory` was NOT measured here (n:0, value 0) — the whole reason-to-exist of this size-ladder family (bounded streaming peak memory vs file size) cannot actually be evidenced from this run, so the "win" is on correctness + secondary throughput only, not on the metric the scenario advertises. (2) Single-sample benches (n:1, mad:0) for wall/throughput/targetWrites — weak performance evidence, but moot since the contest is uncontested. (3) The scenario header itself admits the buffer-vs-stream peak-memory divergence only materializes once the runner forwards the target/shape arg so the stream rung truly uses a StreamTarget; the adapter does honor `opts.target==='stream'` (`adapter.ts:776`), but with peakMemory unmeasured the divergence is not observable in this shard.
