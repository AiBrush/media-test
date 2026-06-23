# trim/av1_keyframe_aligned

- family: trim
- fixture asset(s): `fixtures/media/av1_720p_5s.webm` (AV1 video + Opus audio, WebM container, ~1.9 MB)
- primaryMetric: wall (ms)
- passCount: 1 / 7

## Verdict

- Best framework: **mediabunny@1.48.0**
- Contested: **No** (uncontested — exactly one engine reached PASS).
- Decisive factor: mediabunny is the only engine that declares BOTH the `trim` operation AND AV1 video-codec support, then actually produces a valid, playable trimmed WebM. Every other engine NA'd before running — 5 because they do not declare a `trim` op, 1 (ffmpeg.wasm) because it does not declare the `av1` video codec.
- Margin over runner-up: none — there is no runner-up that produced output. All six losers are NA_ENGINE.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 391.71 ms | 12.78x | 29,187,794 B (~27.8 MB) | 1192 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare video codec 'av1' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The operation is a keyframe-aligned copy-trim of an AV1/Opus WebM, cutting the range [1.0s, 4.0s) (requested duration 3.0s) out of a 5s source. The scenario sets `frameAccurate: false` and `tolerances.durationToleranceSec: 0.5`, gated by the `PLAYABLE_AV` oracle set = `trim-boundaries` + `playback-smoke` (src/scenarios/trim/index.ts:299-310; src/scenarios/trim/index.ts:125).

mediabunny is the only competitor that maps this work onto a real library code path. Its adapter `trim()` (src/engines/mediabunny/adapter.ts:1445-1500) validates the range, builds a WebM output via `makeOutputFormat`, opens the input, and — because `frameAccurate` is false and a video track is present — falls through the audio-only packet-copy fast path (src/engines/mediabunny/adapter.ts:1480, which only fires for audio-only inputs) into mediabunny's Conversion API with `trim: { start: 1.0, end: 4.0 }` (src/engines/mediabunny/adapter.ts:1485-1489). `forceTranscode` is NOT set (that branch only runs when `frameAccurate` is true, line 1493), so mediabunny performs its lossless/keyframe-aligned container trim, re-timing packets and copying the AV1 video and Opus audio through rather than re-encoding. `runConversion` (src/engines/mediabunny/adapter.ts:842-861) drives `Conversion.init` → `.execute` and returns the muxed bytes; it throws if no usable output tracks exist, so a silent empty output is impossible.

The backend recorded in env.configUsed is `webcodecs` with `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required`. Notably this trim did not require COOP/COEP headers and used no wasm threads — a deployment advantage over a hypothetical ffmpeg.wasm path. WebCodecs hardware availability is what makes AV1 viable here at all: the AV1 elementary stream is copied, but the gate decode/playback rely on the browser's AV1 decoder on the Apple M1 Max (ANGLE Metal).

Oracle measurements confirm a real, correct cut. `trim-boundaries` measured `outDurationSec: 3.02` vs `requestedDurationSec: 3`, `durationDeltaSec: 0.02` — well inside the 0.5s tolerance (src/core/oracles.ts:2388-2400). `playback-smoke` confirmed a real `<video>` element actually decoded and played frames of the output, proving the bytes form a valid playable WebM, not a corrupt or copied container. Performance: wall median 391.71 ms, 12.78x realtime, peak memory ~27.8 MB, one 1192 ms long task. These are physically plausible for a ~1.9 MB 5s 720p AV1 copy-trim.

Caveat on gate strength: `boundaryFrameComparisons: 0` — boundary-frame SHA-256 digest comparison was deliberately skipped because the loaded golden is a source-prefix, not a trim-range golden (src/core/oracles.ts:2405-2431; detail string: "loaded golden is source-prefix, not trim-range golden"). So correctness here is duration-within-tolerance + playability, not frame-exact. That is honest by design for this family, but it makes the PASS a WEAK-GATE rather than a bit-exact proof.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare video codec 'av1'". It DOES declare the `trim` op (src/engines/ffmpeg-wasm/adapter.ts:2546), so the gate is purely the AV1 codec capability. Honest under-the-default-build reality: the 0.12.15 wasm core ships without an AV1 (libaom/libdav1d) decode path, so it correctly self-NA's rather than faking a passthrough.
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'trim'". The adapter explicitly throws `NotApplicableError('trim', 'no frame-accurate cut/rewrap available with raw platform APIs')` (src/engines/platform/adapter.ts:472). Honest: raw WebCodecs + MSE expose no container cut/rewrap primitive.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare operation 'trim'". Honest: this engine exposes decode/transcode, not a container trim op.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'trim'". Honest: it is a parser/probe library, no output/mux/trim capability.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'trim'". Honest: demux-only; no muxing/trim path.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare operation 'trim'". Honest, and additionally mp4box is ISOBMFF-focused — it would not handle a WebM/Matroska container trim regardless.

## Anti-cheat validation

- Scenario definition: src/scenarios/trim/index.ts:299-310 (`id: 'av1_keyframe_aligned'`, `asset: 'av1_720p_5s.webm'`, container webm, videoCodec av1, audioCodec opus, startUs 1_000_000, endUs 4_000_000, frameAccurate false, durationTolerance 0.5s, extraOracles PLAYABLE_AV).
- Fixture: `fixtures/media/av1_720p_5s.webm` EXISTS (~1.9 MB) — a real AV1/Opus WebM, not synthetic/empty/mock.
- Oracles: `trim-boundaries` (src/core/oracles.ts:2348-2435) performs a real probe/decode of the output and compares measured output duration against the requested range with a numeric tolerance check; `playback-smoke` requires a real `<video>` to play frames. The duration check is genuine (Δ 0.02s measured, not rubber-stamped). However, the strong boundary-frame digest path is skipped (`boundaryFrameComparisons: 0`) because no trim-range golden is baked — the gate is duration + playability only, i.e. proxy/smoke strength.
- Winner adapter: src/engines/mediabunny/adapter.ts:1445-1500 calls the real mediabunny Conversion API with a true `trim` range (line 1488) and muxes via `runConversion` (line 842); no canned output, no input→output copy (the no-op identity copy at line 1471 only triggers when start≈0 and range covers the whole asset — not this 1–4s sub-range), no golden short-circuit, no swallowed errors (runConversion throws on invalid/empty output).
- Verdict: **WEAK-GATE**. The fixture is real, the implementation is a genuine library call, and the duration oracle is a real measured comparison — but the gating oracle is duration-within-0.5s + playback-smoke with boundary-frame digest disabled, so the PASS proves "valid playable trim of approximately the right length," not frame-exact correctness.
- Cached note: mediabunny's result has `cached: true` ("cached previous PASS result"). The numbers were reused, not freshly re-run, so there is staleness risk; per the launcher-seeding caveat, a clean fresh run would need the raw + .browser-cache cleared to confirm.

## Confidence & caveats

- Confidence: high on the winner selection (only 1 PASS; all NAs are honest capability/op gating verified in adapter source). Medium on gate strength because correctness is duration+playability, not frame-exact (boundaryFrameComparisons=0).
- The mediabunny PASS is cached — bench numbers (391.71 ms wall, n=1, mad=0) come from a single prior sample and were not re-measured this run.
- ffmpeg.wasm's NA is codec-driven, not op-driven; with an AV1-enabled core build it could contest this case, so the uncontested status is build-dependent.
