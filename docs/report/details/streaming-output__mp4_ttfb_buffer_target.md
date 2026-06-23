# streaming-output/mp4_ttfb_buffer_target

- Family: streaming-output
- Fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio, ~31 MB, 30 s, 1080p), real file (31M on disk).
- primaryMetric: `timeToFirstByte` (lower-is-better)
- passCount: 1 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **No** — uncontested. Exactly 1 engine reached PASS; the other 6 are NA_ENGINE and ineligible.
- Decisive factor: mediabunny is the only engine that BOTH declares the `remux` operation AND declares the
  `target:writes` feature (Output target write-telemetry / first-byte instrumentation). The other four
  remux-capable adapters do not declare `target:writes`; the remaining two do not declare `remux` at all,
  so the scenario gates them out as NA before any oracle runs.
- Margin over runner-up: not applicable (no second PASS). Absolute result: ttfb median **373.1 ms**, wall
  **373.5 ms** (n=1), throughput **80.3x-realtime**, peakMemory **58.95 MB**, longtasks **747 ms**,
  targetWrites **2463**, bytesOut **31.27 MB**.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true, mp4-box-layout:true | 373.495 ms | 80.322 x | 58,954,022 B | 747 ms | — |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

This case is the **buffer-target control** for the time-to-first-byte experiment (`src/scenarios/streaming-output/ttfb.ts:35-49`). The operation is a lossless **MP4 -> MP4 remux** of H.264+AAC with `shape.fastStart:false, target:'buffer'`. Because the output is a `BufferTarget`, the first byte only becomes observable at `finalize()`, so ttfb is expected to track whole-op wall — and indeed the shard shows ttfb 373.1 ms vs wall 373.5 ms, essentially identical, exactly the control behavior the scenario notes predict.

Mechanistically, mediabunny performs the remux through `MediabunnyAdapter.remux` (`src/engines/mediabunny/adapter.ts:1244-1260`). Since `fastStart !== 'reserve'`, it takes the Conversion path: it builds an `Mp4OutputFormat` via `makeOutputFormat(opts.container, outputFormatOptionsFrom(opts))` (line 1250), opens the source with `openInput`, wires an `instrumentedOutputTarget` (line 1254), constructs `new Output({ format, target })` (line 1255), and runs a `Conversion.init/.execute` with no codec transform (`runConversion`, line 856-868). With no video/audio re-encode requested, the Conversion copies the encoded H.264 and AAC samples straight through — a true container remux, not a transcode. The 80.3x-realtime throughput on a 30 s clip and 58.95 MB peak memory are physically consistent with a sample-copy (no decode/encode), reinforcing that this is a real lossless remux.

The `target:writes` feature is satisfied concretely by the BufferTarget branch of `instrumentedOutputTarget` (`src/engines/mediabunny/adapter.ts:819-838`): it attaches a `target.on('write', ...)` callback that increments `targetWrites` per emitted chunk and records `firstByteMs`. The shard reports `targetWrites: 2463`, a plausible per-chunk write count for a ~31 MB progressive MP4, and `timeToFirstByte: 373.1 ms`. This telemetry is exactly what other adapters lack the declaration for.

Two oracles gate the PASS, both real and quantitative:

1. **reference-reimport** (`src/core/oracles.ts:1225-1271`, remux branch `semanticRemuxReimport` at 1273+). The output bytes are fed back into an independent reference engine (`ctx.referenceEngine.demux`), which recovered **2310 packets, 1425 keyframes, 2 media tracks** (matching golden's 2 media tracks), with `durationDeltaSec: 0.08` against `durationToleranceSec: 0.1` — a tight, passing match. This confirms the remuxed file is semantically intact, not corrupt or empty.

2. **mp4-box-layout** (`src/core/oracles.ts:365-426`, `fastStart === false` branch at 415-423). It parses real top-level ISOBMFF boxes and asserts mdat precedes moov for a non-faststart control: measured `mdatOffset: 28`, `moovOffset: 31259904`, `topLevelBoxes: 3` (ftyp@0, mdat@28, moov@31259904). The detail string confirms "fastStart:false control placed mdat before moov." A faststart output (moov-first) would FAIL this branch, so it is not trivially satisfiable.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'target:writes'." It can remux but its registry capability set omits the streaming/target write-telemetry feature this case requires; honest under-declaration relative to this metric, since the scenario explicitly needs `target:writes` for the ttfb measurement.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'." The Chrome platform adapter (WebCodecs + MediaRecorder) does not expose a lossless container remux op; honest NA — WebCodecs has no sample-copy muxer primitive.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'target:writes'." Remux-capable but does not declare the write-telemetry feature; honest given it lacks first-byte/target-write instrumentation.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'." A demux-only library; it cannot mux/write output, so NA is correct and honest.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare feature 'target:writes'." mp4box can segment/write MP4, so this is borderline; but it does not declare the suite's `target:writes` telemetry feature, so it is gated out — at worst a mild under-declaration, not a failure.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'." A parser, not a muxer; honest NA.

## Anti-cheat validation

- Scenario: `src/scenarios/streaming-output/ttfb.ts:35-49` (case `mp4_ttfb_buffer_target`, built via `buildStreamAll` in `_shared.ts`).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` — EXISTS, real 31 MB H.264/AAC file (verified via stat). Not synthetic/mock.
- Oracles: `reference-reimport` at `src/core/oracles.ts:1225` (+ `semanticRemuxReimport` 1273) and `mp4-box-layout` at `src/core/oracles.ts:365`. Both perform real comparisons: reference-reimport demuxes the output with an independent engine and checks packet/track/duration deltas (2310 pkts, 2 tracks, 0.08s<0.1s); mp4-box-layout parses real ISOBMFF boxes and enforces mdat-before-moov for the fastStart:false control.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1260` (remux Conversion path), `:819-838` (BufferTarget write telemetry / firstByteMs), `:1080` (declares `target:writes`).
- Verdict: **REAL**. Real fixture, genuine library-backed remux (mediabunny Conversion sample-copy, no canned/golden short-circuit, no input->output copy, errors thrown not swallowed), and two meaningful non-trivial oracles with physically plausible measurements.
- Cached note: the mediabunny entry has no `cached:true` flag (`startedAtIso` 2026-06-22T17:37:12Z present, durationMs 4114), so this was freshly run, not reused — no staleness risk.

## Confidence & caveats

- Confidence: **high**. The winner is unambiguous (only PASS), the implementation path is concrete and library-backed, and both gating oracles are real with sane numbers.
- Caveats: (1) Performance numbers are **n=1** (mad=0, single sample), so the ttfb/wall/throughput figures are single-shot point estimates, not distributions — fine for the control's qualitative claim (ttfb ≈ wall) but weak as precise benchmarks. (2) This is the buffer-target CONTROL; the cross-case discriminator (stream.ttfb << buffer.ttfb) lives in the sibling case `mp4_ttfb_streaming_target` and is realized at the report layer, not as an oracle here. (3) ffmpeg.wasm and mp4box NA-by-feature look like mild under-declarations of `target:writes` rather than true incapability, but they remain correctly ineligible for this metric.
