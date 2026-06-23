# streaming-output/webm_streaming_target

- **Family:** streaming-output
- **Fixture asset:** `fixtures/media/vp9_1080p_10s.webm` (VP9 video + Opus audio, ~9.3 MB, real file)
- **Operation / shape:** remux WebM -> WebM, `target: 'stream'` (incremental StreamTarget writes)
- **primaryMetric:** wall (ms); secondary streaming-output metrics: targetWrites, bytesOut, throughputRealtime
- **passCount:** 1 of 7

## Verdict

- **Best framework:** mediabunny@1.48.0 (env.engineId `mediabunny`)
- **Contested?** No — uncontested. It is the only `PASS`; the other 6 engines are all `NA_ENGINE`.
- **Decisive factor:** mediabunny is the only engine that simultaneously (a) declares `remux`, (b) declares WebM as an input container, and (c) declares the `target:writes` capability that this scenario's `target: 'stream'` shape requires. Every other engine is screened out at the capability gate before any oracle runs.
- **Margin over runner-up:** none measurable — there is no second `PASS` to compare against. All rivals failed the eligibility gate, not the oracle.

## Per-engine results

| Engine | Status | Oracles passed (name:pass) | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 196.23 ms | 51.00 x-realtime | 0 (n=0, not sampled) | 0 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

This case is a lossless container rewrap of a VP9 + Opus elementary stream from one WebM (Matroska) container into another WebM container, written through an **incremental StreamTarget** rather than a single whole-blob buffer. The shape `{ container: 'webm', target: 'stream' }` (`src/scenarios/streaming-output/base.ts:99`) makes the streaming write path the point of the test: `_shared.ts:174-175` adds the `target:writes` capability requirement whenever `shape.target === 'stream'`, so an engine that can rewrap WebM but only emits one final blob is deliberately excluded.

mediabunny ran on the `webcodecs` backend with `hwAccel: 'prefer-hardware'`, `coreBuild: pure-ts-esm`, `pipeline: 'streaming-lockstep'`, `coopCoep: 'not-required'`, `sharedArrayBuffer: false`, `wasmThreads: 0` (from `env.configUsed`). Note that for a pure remux no actual pixel decode/encode happens — the encoded VP9/Opus packets are demuxed from the source Matroska and re-muxed into a fresh WebM container, so the WebCodecs/hardware path is configured but the heavy work is container parsing + EBML re-serialization, which is why this completes in 196 ms at 51x realtime for a 10 s clip with zero long tasks.

The adapter path is genuine and streaming-aware. `MediabunnyEngine.remux()` (`src/engines/mediabunny/adapter.ts:1244-1260`) opens the source via `openInput`, builds a real WebM `OutputFormat` (`makeOutputFormat`, line 1250), and crucially wires an **instrumented StreamTarget** via `instrumentedOutputTarget(this.lib, opts)` (line 1254). Because `opts.target === 'stream'`, that helper (`adapter.ts:776-816`) constructs a native `mb.StreamTarget` backed by a `WritableStream` whose `write(chunk)` callback increments `targetWrites` and accumulates positioned chunks; the output bytes are reassembled from the recorded chunks at `chunk.position` (lines 806-807). The recorded **514 targetWrites** in the shard is the direct, observable proof that mediabunny streamed the output in many small positioned writes rather than one BufferTarget flush — exactly the property the `target:writes` feature gate exists to verify. The conversion itself runs through the real `mb.Conversion.init/.execute` API (`runConversion`, `adapter.ts:842-868`), with an `isValid` guard that throws if no usable output tracks survive — it does not copy input to output or short-circuit to a golden.

The gating oracle is `reference-reimport` (`src/core/oracles.ts:1225-1271`, remux branch -> `semanticRemuxReimport` at 1273+). It feeds mediabunny's produced bytes back through the reference engine's `demux()` and asserts the re-parsed stream is semantically equivalent to the golden: matching media-track count and per-type layout, and duration drift within tolerance. The shard measurements are physically consistent with a real VP9/Opus 10 s clip: `reimportPackets: 801`, `reimportKeyframes: 506`, `reimportMediaTracks: 2` vs `goldenMediaTracks: 2`, and `durationDeltaSec: 0.006999...` against `durationToleranceSec: 0.1` (a ~7 ms tail, the expected block-rounding residue of a Matroska re-mux). `bytesOut: 9294855` (~9.29 MB) closely tracks the ~9.3 MB input, confirming a lossless rewrap (no re-encode bloat or truncation). The 506 keyframes / 801 packets ratio is plausible for VP9 with frequent altref/keyframe structure plus an interleaved Opus track.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 — NA_ENGINE, "does not declare feature 'target:writes'":** It can remux WebM (CONTAINERS_OUT includes `webm`), but it does not expose incremental StreamTarget write telemetry, so it cannot satisfy this scenario's `target: 'stream'` requirement (only mediabunny declares `target:writes`, `adapter.ts:1080`). Honest NA — the capability genuinely is not declared.
- **ffmpeg.wasm@0.12.15 — NA_ENGINE, "does not declare feature 'target:writes'":** Same gate. ffmpeg.wasm reads/writes WebM (`codecs.ts:74-115`) and can remux-copy, but writes through the wasm MEMFS as a whole file, not an instrumented incremental StreamTarget; it does not declare `target:writes`. Honest NA.
- **mp4box@2.3.0 — NA_ENGINE, "does not declare input container 'webm'":** mp4box.js is an ISO-BMFF-only engine; `containersIn: ['mp4','mov']` (`adapter.ts:645`). It physically cannot parse a Matroska/WebM input. Honest NA.
- **web-demuxer@4.0.0 — NA_ENGINE, "does not declare operation 'remux'":** It is a demuxer/parser only; its `remux()` explicitly throws "not supported (demuxer/parser only — no muxer)" (`adapter.ts:1047-1048`). It can read WebM but has no muxer. Honest NA.
- **remotion-media-parser@4.0.479 — NA_ENGINE, "does not declare operation 'remux'":** Read-only parser, no muxer or codecs (`adapter.ts:7`, :188). Honest NA.
- **platform@chrome-149 — NA_ENGINE, "does not declare operation 'remux'":** Raw browser platform has no lossless container rewrap; `remux: false` (`adapter.ts:233`, with the rationale at :16). Its only WebM-write path is the lossy canvas->MediaRecorder route, which is a transcode, not a remux. Honest NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/streaming-output/base.ts:92-103` (`id: 'webm_streaming_target'`), built via `buildStreamAll` -> `_shared.ts`. Feature gating for the streaming target: `src/scenarios/streaming-output/_shared.ts:131,174-175` (`target:'stream'` -> `target:writes`).
- **Fixture:** `fixtures/media/vp9_1080p_10s.webm` exists on disk (~9.3 MB real VP9/Opus WebM). Not synthetic/empty/mock.
- **Oracle:** `reference-reimport` at `src/core/oracles.ts:1225` (remux semantic branch `semanticRemuxReimport`, `oracles.ts:1273+`). It re-demuxes the produced bytes and compares track count, per-type track layout, and duration drift against the golden — a real structural comparison, not a trivially-true check. Empty-packet output is rejected (`oracles.ts:1244-1245,1249-1250`).
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1244-1260` (remux via real `Conversion`), with the streaming StreamTarget instrumentation at `adapter.ts:776-816` and the `target:writes` capability declaration at `adapter.ts:1080`. No canned output, no input->output copy, no golden short-circuit; `runConversion` (`adapter.ts:842-855`) throws on an invalid/empty conversion rather than reporting false success.
- **Verdict:** REAL. Real fixture + real mediabunny Conversion/StreamTarget implementation + a meaningful structural re-import oracle whose measurements (801 packets, 506 keyframes, 2 tracks, 7 ms duration delta, 9.29 MB out, 514 stream writes) are physically plausible for this VP9/Opus clip.
- **Cached note:** mediabunny's result is `cached: true` ("cached previous PASS result"). The PASS evidence was reused, not re-executed in this run; bench is `n=1` (single sample, mad=0). Staleness risk is low for a deterministic remux but should be flagged: a true fresh re-run (clearing raw + .browser-cache) would harden the timing numbers.

## Confidence & caveats

- **Confidence: high** on the winner selection — it is the sole eligible engine and all six NA reasons were individually verified against each engine's declared capabilities in source.
- **Caveats:**
  - The result is cached (`cached: true`, `n=1`), so wall=196.23 ms / throughput=51x carry single-sample timing uncertainty (mad=0 is an artifact of one sample, not stability).
  - `peakMemory` was not sampled (`n=0`, median 0) — memory comparison is unavailable for this cell.
  - This is an uncontested win by capability gate, not by measured superiority over a rival; the verdict says nothing about whether ffmpeg.wasm or remotion-webcodecs could produce a correct streaming WebM if they declared `target:writes` — they simply do not expose the instrumented incremental-write path the scenario gates on.
  - The oracle is structural/metadata-exact (track layout + duration) plus packet/keyframe counts, not bit-exact decoded-frame comparison; it is a strong structural gate but not crypto/bit-exact strength.
