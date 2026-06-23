# streaming-output/prop_ts_stream_duration_materialized

family: streaming-output · fixture asset: `h264_1080p_30s.mp4` (H.264/AAC in MP4, 31 MB) · primaryMetric: wall · passCount: 1/7

## Verdict

- Best framework: **mediabunny@1.48.0** (uncontested — the only PASS).
- Contested: **no**. 1 PASS, 0 FAIL, 6 NA_ENGINE.
- Decisive factor: mediabunny is the only engine that DECLARES the `remux` operation with output container `ts` AND the `target:writes` (streaming target) feature, so it is the only engine the runner even dispatched. It then passed the `property-invariant` (probe-duration) gate: re-probed output duration 30.08 s vs golden 30.00 s, Δ 0.0800 s ≤ 0.1250 s tolerance.
- Margin over runner-up: not applicable (no second eligible engine). Wall median 456.585 ms (n=1).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass | 456.585 ms | n/a | 0 (n=0) | 501 ms | probe-duration Δ 0.0800s ≤ 0.1250s |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | does not declare operation 'remux' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | does not declare output container 'ts' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | does not declare output container 'ts' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | does not declare operation 'remux' |

(peakMemory has n=0 samples — not measured this run; throughputRealtime not emitted for this remux scenario.)

## Why the winner wins (deep technical)

The operation under test is a **lossless container change MP4 → MPEG-TS, streamed in 188-byte writes** (`shape: { container: 'ts', target: 'stream', writeChunkBytes: 188 }`, ts-webm-live.ts:90), then a re-probe of the streamed TS to confirm its duration survived. MPEG-TS has no global duration field; a parser must estimate duration from the last PCR/PTS, so a tiny-write streaming writer that botches continuity counters, PAT/PMT repetition, or the final PES boundary would produce a duration-corrupt stream. The gate is exactly that materialized-duration invariant.

mediabunny is the only engine wired for this path. Its adapter declares `remux: true`, `containersOut` including `'ts'`, and feature `target:writes` (adapter.ts:1025, 1036-1039, 1080). The remux entrypoint (adapter.ts:1244-1260) builds a real `MpegTsOutputFormat` via `makeOutputFormat('ts')` (codecs.ts:158-173) — the genuine library class, not a hand-rolled muxer — and drives it with `mb.Conversion.init` (runConversion, adapter.ts:842-848). Because no codec/transform options are passed, Conversion copies the encoded H.264 and AAC elementary streams sample-by-sample into TS PES packets (true remux, no re-encode).

The streaming requirement is satisfied honestly: `instrumentedOutputTarget` (adapter.ts:767-816) detects `opts.target === 'stream'` and constructs a real `mb.StreamTarget(writable)` backed by a `WritableStream` whose `write(chunk)` callback receives each `StreamTargetChunk` at its byte `position` (adapter.ts:786-801). Chunks are reassembled by position into a contiguous buffer only at `mediaBytes()` (adapter.ts:804-814), so the library genuinely emits the TS incrementally through the streaming target rather than buffering a whole file and slicing it.

The configUsed backend is `webcodecs` with `hwAccel: prefer-hardware` on Apple M1 Max ANGLE Metal, `coopCoep: not-required`, `sharedArrayBuffer: false`, `wasmThreads: 0`, pipeline `streaming-lockstep` — i.e. pure-TS ESM core with no cross-origin isolation requirement. For a copy-only remux, WebCodecs decode/encode is not exercised (samples are copied), which is why wall is a modest 456.585 ms for a 30 s 1080p stream.

The oracle (`property-invariant` / probe-duration, oracles.ts:2709-2758) re-probes `ctx.output` through the reference engine and compares against the golden source duration. Measurements: `outDurationSec` 30.08, `goldenDurationSec` 30, `deltaSec` 0.0799999999999983, `durationToleranceSec` 0.125 (the scenario's explicit `durationToleranceSec: 0.125` override at ts-webm-live.ts:91). The 0.08 s overshoot is physically consistent with TS estimate-only duration (final partial PES / PCR-based tail), comfortably inside the deliberately loose band the scenario notes call for. So mediabunny's tiny-write TS output is provably not duration-corrupt.

## What each other framework did wrong

- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'remux'". Honest: the raw browser platform exposes WebCodecs decode/encode but no container muxer/remuxer, so it cannot author a TS file.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "does not declare feature 'target:writes'". ffmpeg.wasm can produce TS, but its adapter writes to an in-memory FS file, not an incremental streaming target; it does not declare the `target:writes` (streaming) capability this scenario gates on. Looks honest (the streaming-target telemetry path is genuinely absent), not under-declared, given the scenario's streaming requirement.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare output container 'ts'". mp4box.js is an ISO-BMFF (MP4) tool; it has no MPEG-TS writer. Honest.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare output container 'ts'". Its mux targets are MP4/WebM; no TS output. Honest.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'remux'". It is a parser/demuxer, not a muxer/remuxer. Honest.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'remux'". Demux-only by design. Honest.

All 6 NAs are genuine capability gaps, not under-declarations: TS authoring through an incremental streaming target is a narrow capability that only mediabunny implements here.

## Anti-cheat validation

- Scenario: src/scenarios/streaming-output/ts-webm-live.ts:83 (`id: 'prop_ts_stream_duration_materialized'`), case at lines 81-96, invariant `probe-duration`, explicit tolerance 0.125 s.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists (31 MB real H.264/AAC MP4). Not synthetic/empty/mock.
- Oracle: src/core/oracles.ts:2709-2758 (probe-duration branch of `propertyInvariant`). Performs a REAL re-probe of the streamed output via `ctx.referenceEngine.probe(...)` and compares the measured duration to the golden source duration with a numeric Δ vs tolerance test. Not trivially satisfiable: a duration-corrupt TS would re-probe far outside ±0.125 s. Measurements (30.08 vs 30.00, Δ 0.08) are physically plausible for estimate-only TS.
- Winner adapter: src/engines/mediabunny/adapter.ts:1244-1260 (remux → real `MpegTsOutputFormat`, codecs.ts:172-173) and adapter.ts:767-816 (real `StreamTarget`/`WritableStream` incremental write path). No canned output, no input→output copy faking a remux, no short-circuit to golden, no swallowed errors (Conversion validity is checked in runConversion).
- Verdict: **REAL**. Real fixture + genuine library-backed streaming TS remux + a meaningful re-probe oracle with a measured, plausible duration.
- Cached: `cached` is absent/false on the mediabunny entry — this was re-run, not reused. No staleness risk.

Caveat on gate strength: probe-duration is a property invariant with a deliberately LOOSE band (TS has no global duration). It proves the stream is not duration-corrupt; it does NOT prove bit-exact packet/keyframe fidelity. The companion `ts_continuity_many_writes` shape case (same folder) carries the stronger `reference-reimport` gate for continuity-counter/PAT-PMT integrity. So this specific gate is a property/proxy gate, not bit-exact.

## Confidence & caveats

- Confidence: **high** for the winner selection (1 PASS, 6 honest NAs, real implementation + real fixture verified at file:line).
- Caveat 1: only one engine is even eligible, so there is no comparative performance signal — wall 456.585 ms is n=1 (mad 0, no spread), weak as a benchmark datapoint.
- Caveat 2: peakMemory and throughputRealtime were not measured (n=0 / not emitted).
- Caveat 3: the gate is a loose duration-property invariant by design; treat this as "TS streaming output is duration-sane," not as a bit-exact correctness proof. The stronger continuity gate lives in the sibling shape scenario, not here.
