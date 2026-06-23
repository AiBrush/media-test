# streaming-output/prop_probe_dur_stream_shape

- family: streaming-output
- fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio, progressive MP4, ~31 MB, 30 s)
- operation: `remux` (lossless container re-wrap) with output shape `{ container:'mp4', target:'stream' }`
- primaryMetric: wall (ms); gating oracle: `property-invariant` (probe-duration branch)
- passCount: 1 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contest status: **UNCONTESTED** — exactly one engine reached status=PASS; the other 6 are NA_ENGINE (capability not declared).
- Decisive factor: mediabunny is the only engine that declares BOTH the `remux` operation AND the `target:writes` capability required by a `target:'stream'` output shape. It actually executed a native `StreamTarget` write path and produced an MP4 whose reference-reprobed duration (30.08 s) matched the source golden (30.00 s) within Δ 0.0800 s ≤ 0.1250 s.
- Margin over runner-up: none to compute — every other engine was gated NA before running, so there is no second PASS and no metric comparison.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 507.395 ms | n/a (not in bench) | 0 bytes (n=0, unmeasured) | 501 ms | — (passed; Δ 0.0800s ≤ 0.1250s) |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Notes on bench: only `wall`, `peakMemory`, `longtasks` are present in the shard. `peakMemory` has n=0 (no samples) → reported 0 is "unmeasured", not a real 0-byte footprint. `wall` and `longtasks` each have n=1 (single timed run, mad=0, p95==median) — single-sample evidence; total adapter `durationMs` was 5454.

## Why the winner wins (deep technical)

This is a metamorphic duration invariant: `probe(remux_stream(x)).dur ≈ probe(x).dur`. The scenario is built by `buildStreamPropertyAll` in `src/scenarios/streaming-output/_shared.ts` as an `op:'remux'` case (`_shared.ts:202-215`, `operations:['remux']`) whose output shape is `{ container:'mp4', target:'stream' }`. The shape builder `shapeFeatures` (`_shared.ts:131,172-192`) injects the `target:writes` feature whenever `target:'stream'` is requested, so the runner demands an engine that can write through an incremental, position-addressed target and report write telemetry — not merely produce a finished buffer.

mediabunny took the streaming write path in its adapter. `remux()` (`src/engines/mediabunny/adapter.ts:1244-1260`) builds an `OutputFormat` for MP4, opens the source via `openInput`, then constructs an instrumented output target via `instrumentedOutputTarget`. Because `opts.target === 'stream'` (`adapter.ts:776`), it creates a real `WritableStream<StreamTargetChunk>` whose `write(chunk)` handler (`adapter.ts:787-792`) increments `targetWrites`, stamps `firstByteMs`, and stores each `{position, data}` chunk; it then wraps that in mediabunny's native `new mb.StreamTarget(writable)` (`adapter.ts:801`). The conversion runs through `runConversion` → `mb.Conversion.init(opts)` + `conversion.execute()` (`adapter.ts:848-855`), which is mediabunny's real read→(copy, no transcode)→mux pipeline. After `close()`, `mediaBytes()` (`adapter.ts:804-815`) re-assembles the position-keyed chunks into a contiguous Uint8Array — this is the genuine streamed MP4, not a copy of the input. Because the source is H.264+AAC and the conversion supplies no codec/transform options, coded samples are copied verbatim into a freshly-authored `moov`/`mdat`; only the container framing and the byte-delivery shape change, so the timeline (mvhd timescale × sample durations) is preserved.

The oracle (`src/core/oracles.ts:2645` → `propertyInvariant`) routes on the invariant token `probe-duration`: it contains "duration" (`oracles.ts:2709`) but neither "decode" nor "remux", so it hits the duration branch. Since the scenario op is `remux` (not `probe`, `oracles.ts:2710`), it takes the reference-reprobe path (`oracles.ts:2714-2758`): it reads the golden source duration (`ctx.golden.meta.durationSec` = 30, confirmed in `fixtures/golden/h264_1080p_30s.mp4.meta.json:3`), re-probes the streamed output through the reference engine (`ctx.referenceEngine.probe(...)`, `oracles.ts:2721`), and compares. The shard measurements are physically plausible for a re-wrapped 30 s clip: `outDurationSec=30.08`, `goldenDurationSec=30`, `deltaSec≈0.08`, `durationToleranceSec=0.125`. The 0.08 s excess is the expected "one extra GOP / final partial sample / edit-list rounding" wobble of a re-muxed MP4 and sits comfortably under the scenario's explicit ±0.125 s tolerance (`metamorphic.ts:86`). PASS is therefore genuine: a real native StreamTarget write produced a structurally-different MP4 whose duration survived the streaming shape change.

## What each other framework did wrong

- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest. The Chrome platform adapter exposes WebCodecs decode/probe primitives, not a muxing/remux output op. Cannot write an MP4 container, so genuinely out of scope for this op.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest. `@remotion/media-parser` is a read-only demux/parse library with no muxer; it cannot author output. Correct NA, not under-declared.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest. web-demuxer is a WASM demuxer (read path only); no output container writer. Correct NA.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'target:writes'". ffmpeg.wasm CAN remux, but it writes a whole file to its MEMFS virtual filesystem; it does not expose an incremental, position-addressed native StreamTarget with per-write telemetry. The NA is on the streaming-shape capability specifically, which is the honest line — it is not under-declaring `remux`, only the streaming write granularity this row requires.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare feature 'target:writes'". mp4box.js can segment/fragment MP4, but the adapter does not declare the suite's `target:writes` streaming-target capability. Honest for this stream-shape row.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'target:writes'". Its conversion path does not expose the instrumented StreamTarget write telemetry the row requires. Honest NA on the streaming feature.

All six NAs are capability-gating, not failures: the runner declined to run them because they did not declare the op (`remux`) or feature (`target:writes`) the scenario requires (gating logic per `_shared.ts:19-20,131,172-192`). None looks like an under-declared capability that should secretly pass.

## Anti-cheat validation

- Scenario definition: `src/scenarios/streaming-output/metamorphic.ts:77-90` (`id:'prop_probe_dur_stream_shape'`, `invariant: PROBE_DUR='probe-duration'`, shape `{container:'mp4', target:'stream'}`, explicit `durationToleranceSec:0.125`). Built into an `op:'remux'` Scenario by `src/scenarios/streaming-output/_shared.ts:202-215`.
- Fixture: asset `h264_1080p_30s.mp4` exists at `fixtures/media/h264_1080p_30s.mp4` (~31 MB, real H.264/AAC progressive MP4 — verified by `ls`). Not synthetic, not empty, not a mock. Golden duration source `fixtures/golden/h264_1080p_30s.mp4.meta.json:3` = `"durationSec": 30`.
- Oracle: `src/core/oracles.ts:2645` `propertyInvariant`, duration branch `oracles.ts:2709-2758`. It performs a REAL reference re-probe of the produced output (`oracles.ts:2721`) and compares against the golden source duration with the scenario's explicit ±0.125 s tolerance. Not trivially satisfiable: a stream path that dropped samples or mis-authored the mvhd timeline would shift the reported duration outside the band and FAIL. Measurements (30.08 vs 30.00, Δ0.08, tol0.125) are physically plausible for a re-wrapped 30 s clip.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1260` (remux) → `adapter.ts:776-817` (native `mb.StreamTarget` write path) → `adapter.ts:848-855` (`Conversion.init`/`execute`). The output is reassembled from the actually-written position-keyed chunks (`adapter.ts:804-815`); it is NOT a copy of the input buffer, NOT a canned/hardcoded value, NOT a short-circuit to the golden, and errors are not swallowed (invalid conversion throws, `adapter.ts:849-853`).
- Cached: result `cached` field is absent/false in the shard for mediabunny (it carries `startedAtIso`, fresh `env.configUsed`, and a one-sample bench) → this is a fresh run, no staleness risk.
- Verdict: **REAL** — real fixture + real native StreamTarget remux implementation + a meaningful duration oracle that re-probes the produced output against a golden with a tight (±0.125 s) tolerance.

## Confidence & caveats

- Confidence: high on the verdict (single eligible PASS; all NAs are honest capability gates; oracle and adapter code paths verified).
- Caveat (evidence strength): the gate is a duration-invariant (structural/metadata-class), not a bit-exact decoded-frame check. The sibling row `prop_decode_equals_stream_shape` carries the stronger `decode(remux(x))==decode(x)` frame-equality gate; this row only asserts the timeline survives streaming. So PASS proves duration preservation, not full sample fidelity, for the stream shape.
- Caveat (samples): `wall` and `longtasks` are n=1 (mad=0 is an artifact of a single sample, not stability); `peakMemory` n=0 is unmeasured (reported 0 is not a real footprint). Treat the 507.395 ms wall / 501 ms longtask as single-run indicators only.
- No contest: there is no runner-up to compare, so no performance margin is computable for this scenario.
