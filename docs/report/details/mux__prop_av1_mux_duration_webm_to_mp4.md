# mux/prop_av1_mux_duration_webm_to_mp4

family: mux | fixture asset: `fixtures/media/av1_720p_5s.webm` (1.9 MB, AV1 720p30 + Opus 48k stereo) | primaryMetric: wall | passCount: 1 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (uncontested — the only engine that executed; all other 6 are NA_ENGINE).
- Contested: **no**.
- Decisive factor: mediabunny is the only of the seven engines that *declares* the full requirement triple for this scenario — operation `mux` + input container `webm` + video codec `av1`. Every other engine fails one of those declaration gates before any media is touched, so they never run the operation. mediabunny then actually re-muxes AV1+Opus from WebM into MP4 and writes an `mvhd` duration that matches the source to within 0.007 s.
- Margin over runner-up: none — there is no second engine that even ran. Mediabunny's measured result: wall median 16.34 ms (n=1), `property-invariant` PASS with Δduration 0.0070 s against a tolerance of 0.0417 s.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 16.34 ms | n/a (not measured) | 0 (n=0, not measured) | 4707 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare video codec 'av1' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

Notes: `throughputRealtime` and `peakMemory` were not sampled for this run (bench.peakMemory has n=0; no throughput metric present). The bench was reused from a prior PASS (`cached:true`), so wall=16.34 ms (n=1, mad=0) and longtasks=4707 ms are single-sample, low-confidence timing figures.

## Why the winner wins (deep technical)

This scenario is a metamorphic cross-container duration invariant (`invariant: PROBE_DUR`, scenario at `src/scenarios/mux/metamorphic.ts:77-88`): take an AV1+Opus WebM, mux it into MP4 (ISO-BMFF), then assert `probe(mux(x)).dur ≈ probe(x).dur`. The hard part is not decoding pixels — it is *re-authoring container timing*. WebM/Matroska carries duration as a Segment-level `Duration` element in TimecodeScale ticks, while MP4 carries it in the `mvhd`/`mdhd` boxes in movie timescale units. A muxer that drops or mis-rounds per-packet durations, or that fails to write a final-sample duration, will produce an `mvhd` duration that drifts from the 5.008 s source.

mediabunny ran on its WebCodecs/streaming pipeline (`env.configUsed`: `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `coopCoep:"not-required"`, `wasmThreads:0`, `sharedArrayBuffer:false`). Crucially, this is a *mux* (encoded-packet copy), not a transcode — the AV1 video and Opus audio packets are demuxed from WebM and re-emitted into MP4 without re-encoding. The concrete code path is `MediabunnyEngine.mux` at `src/engines/mediabunny/adapter.ts:1508`: it builds the MP4 `OutputFormat` (`makeOutputFormat`, line 1509), creates an `mb.Output` over an instrumented `BufferTarget` (lines 1513-1514), wires each track to an `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (lines 1528-1546), and re-emits every packet as `new mb.EncodedPacket(c.data, key|delta, c.ptsUs/1e6, c.durationUs/1e6, i)` (lines 1562-1569). Because each packet's source PTS and duration are preserved (in seconds), and the first packet carries the `decoderConfig` so the muxer can write the AV1 codec-private (`av1C`) box (lines 1571-1587), mediabunny's MP4 writer computes a faithful `mvhd` duration. The actual conversion is executed for real via `Conversion.init` + `conversion.execute()` (`adapter.ts:848-855`) for the remux path and `output.start()`/per-packet `source.add` for the encoded-packet mux path (lines 1553-1556). The corresponding capability declarations `mux:vfr-timestamps`, `remux:av1-opus-in-mp4`, and `mux:roundtrip-compare` (adapter lines 1072, 1076, 1078) match exactly what this scenario exercises.

The oracle (`src/core/oracles.ts:2709-2759`, the `duration`/`probe` branch of `propertyInvariant`) is a genuine measurement: it probes the *authored output* bytes with the reference engine (`ctx.referenceEngine.probe`, line 2721), reads `goldenDur` from the source golden meta (`ctx.golden.meta.durationSec`), computes `d = |outDur - goldenDur|`, and selects a per-container tolerance band. The shard's `measurements` are physically plausible: `outDurationSec:5.001`, `goldenDurationSec:5.008` (matching `fixtures/golden/av1_720p_5s.webm.meta.json` exactly: `durationSec:5.008`, container webm, video av1 1280x720@30, audio opus 48k stereo), `deltaSec:0.006999...`, `durationToleranceSec:0.041666...` (≈ one frame at 24 fps, the default cross-container duration band). The 7 ms drift is real container-timing rounding (Matroska TimecodeScale vs MP4 timescale), well inside a single-frame budget — exactly the kind of small, honest residual a correct muxer produces.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: `engine does not declare video codec 'av1'`. Honest under-declaration of an AV1 capability in this suite's registry; ffmpeg can in principle handle AV1, but this adapter does not declare it, so it is correctly gated out before running (capability gate at `src/core/runner.ts:136`). Not a failure of the operation, just an un-declared codec.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: `engine does not declare operation 'mux'`. It is a transcode/WebCodecs-conversion engine, not a container muxer; honest declaration gate (`runner.ts:119`).
- **web-demuxer@4.0.0** — NA_ENGINE: `engine does not declare operation 'mux'`. As its name says, it is a *de*muxer only; it cannot author an MP4. Honest.
- **platform@chrome-149** — NA_ENGINE: `engine does not declare operation 'mux'`. The raw browser platform (WebCodecs/MediaSource) exposes no first-class file-muxing API in this adapter, so the op is not declared. Honest.
- **mp4box@2.3.0** — NA_ENGINE: `engine does not declare input container 'webm'`. mp4box.js is ISO-BMFF-only and cannot parse Matroska/WebM input, so it is gated on the input-container declaration (`runner.ts:125`). Honest — the source is WebM.
- **remotion-media-parser@4.0.479** — NA_ENGINE: `engine does not declare operation 'mux'`. It is a parser/prober, not a writer. Honest.

All six NA verdicts are genuine declaration gates, not under-declared capabilities being hidden — none of these engines is a WebM-in / MP4-out container muxer for AV1, except possibly ffmpeg.wasm whose only gap is the un-declared AV1 codec token.

## Anti-cheat validation

- Scenario: `src/scenarios/mux/metamorphic.ts:77-88` (`id: 'prop_av1_mux_duration_webm_to_mp4'`, `invariant: PROBE_DUR`, `input: 'av1_720p_5s.webm'`, `containersIn: ['webm']`, `to: 'mp4'`, `videoCodecs: ['av1']`, `audioCodecs: ['opus']`).
- Fixture: `fixtures/media/av1_720p_5s.webm` EXISTS (1.9 MB real media). Golden meta `fixtures/golden/av1_720p_5s.webm.meta.json` confirms av1+opus, durationSec 5.008 — matches the oracle's `goldenDurationSec:5.008`. Not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:2709-2759` — real reference-engine probe of the authored output bytes vs golden source duration, with a finite ≈0.0417 s (single-frame) tolerance. Not trivially satisfiable: a muxer that mangles timing would exceed the band and FAIL (line 2745). Measurement Δ 0.0070 s is a real residual, not zero/canned.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508` (`mux`), with real packet re-emission at lines 1562-1569 and execution at `output.start()`/`source.add` (1553-1556) and `Conversion.init`/`.execute()` (848-855). No canned output, no input→output copy fakery, no golden short-circuit, no error-swallowing-as-success.
- Cached note: mediabunny's result is `cached:true` ("cached previous PASS result"). The PASS verdict and the duration measurement are trustworthy (deterministic container-timing), but the timing bench (wall 16.34 ms n=1, longtasks 4707 ms n=1) was reused and is single-sample — treat the perf numbers as stale/low-confidence, not freshly measured.
- Verdict: **REAL** — real fixture + real mux implementation + meaningful single-frame-tolerance duration oracle with a plausible non-zero residual.

## Confidence & caveats

- Confidence: **high** for the winner selection (uncontested; 1 PASS, 6 honest NA_ENGINE) and for the REAL validation (fixture, golden, oracle, and adapter code all verified).
- Caveats: (1) result is cached, so the perf metrics are not fresh and n=1 — no perf comparison is possible anyway since no other engine ran. (2) `peakMemory` and `throughputRealtime` were not sampled (n=0 / absent). (3) The oracle gates only *duration* (a count-gate-free metamorphic check by design, per scenario notes); it does NOT verify decoded-pixel or packet-level fidelity of the AV1/Opus copy — a muxer could in principle corrupt sample data while keeping duration correct and still pass here. That is a deliberate scope choice for this metamorphic variant, not a cheat, but it bounds how strong the PASS is. (4) ffmpeg.wasm's NA is purely an un-declared AV1 codec token; if AV1 were declared it might contest this scenario.
