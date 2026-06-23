# trim/vp9_alpha_keyframe_aligned

**family:** trim | **fixture asset:** `fixtures/media/vp9_alpha.webm` (VP9-with-alpha in WebM, 749 KB) | **primaryMetric:** wall | **passCount:** 1 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` (env.engineId `mediabunny`).
- **Contested?** No — **uncontested**. Exactly one engine reached `status=="PASS"`; the other six are `NA_ENGINE`.
- **Decisive factor:** mediabunny is the only engine that declares both the `trim` operation AND the `alpha` feature. Every other engine is gated out before any oracle runs: five never declare `trim`, and `ffmpeg.wasm` declares `trim` but not `alpha` (its vendored libvpx decodes the VP9-alpha fixture as opaque RGBA, so it honestly withholds the `alpha` capability token).
- **Margin over runner-up:** N/A — there is no second PASS to measure against. mediabunny's own numbers: wall median **478.17 ms** (n=1), throughputRealtime **10.46x**, longtasks **12909 ms**, peakMemory not sampled (n=0).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 478.17 ms | 10.46x | n=0 (not sampled) | 12909 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'alpha' |

## Why the winner wins (deep technical)

The operation is a copy-trim of a **VP9 video track carrying an alpha plane inside a WebM/Matroska container**, cut to the range `[1_000_000us, 3_000_000us)` = a 2.000 s window (`src/scenarios/trim/index.ts:330-341`). VP9 alpha in WebM is encoded as a side stream (BlockAdditional / alpha companion); the test's whole point (`notes: "alpha plane must survive the cut"`) is that the trimming engine must keep that auxiliary plane intact through the container re-write rather than dropping it as ordinary opaque video. The scenario declares `features: ['alpha']`, which is the gate that selects only alpha-aware engines.

mediabunny ran on the **WebCodecs backend with `prefer-hardware` hwAccel** (`env.configUsed.backend = "webcodecs"`, `hwAccel = "prefer-hardware"`, `pipeline = "streaming-lockstep"`, `coopCoep = "not-required"`, `wasmThreads = 0`, `sharedArrayBuffer = false`) on an Apple M1 Max via ANGLE Metal. Because `frameAccurate` is false for this case, the adapter takes the lossless container-trim path: `trim()` at `src/engines/mediabunny/adapter.ts:1445` builds an `Output` with the WebM format and hands `trim: { start: 1.0, end: 3.0 }` to a real `Conversion` (`adapter.ts:1485-1496`). It does NOT force a transcode (the `forceTranscode`/`hardwareAcceleration` branch at `adapter.ts:1493-1495` only fires when `frameAccurate` is true). The conversion is genuinely executed via `Conversion.init(opts)` + `conversion.execute()` and the output is read back from the live `BufferTarget` buffer (`runConversion`, `adapter.ts:842-866`) — there is no canned/golden short-circuit on this path. mediabunny's declared capability set backs this: it lists `vp9` among `videoCodecs`, `webm` in `containersOut`, and both `'alpha'` (VP9 alpha via WebM/MKV) and `'alpha:transcode'` feature tokens (`adapter.ts:1040,1039,1061-1062`), so the runner's feature gate (`src/core/runner.ts:171-173`) lets it through and the browser-alpha gate (`runner.ts:293-296`) passes because Chrome 149 can configure alpha frames.

The gating oracle `trim-boundaries` (`src/core/oracles.ts:2348-2435`) probed the trimmed output and measured `outDurationSec = 2`, `requestedDurationSec = 2`, **`durationDeltaSec = 0`** — exactly on target, far inside the scenario's `durationToleranceSec = 0.5`. The boundary-frame digest comparison was deliberately **skipped** (`boundaryFrameComparisons = 0`, detail: "loaded golden is source-prefix, not trim-range golden") because the repo only ships source-asset frame golden, which would falsely fail a correct sub-range cut (oracle comment at `oracles.ts:2405-2410`). The second oracle, `playback-smoke`, confirmed a real `<video>` element decoded and played frames of the output. So the PASS rests on an exact duration match plus live playback — real, but not a bit-exact alpha-plane verification.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'trim'". Honest NA; it is a WebCodecs transcode/render engine, not a container editor, and the runner refuses to invoke an undeclared op (`runner.ts:105`).
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare operation 'trim'". Honest; MP4Box is an ISOBMFF box parser/segmenter with no trim primitive, and the fixture is WebM anyway.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'trim'". Honest; the bare-platform engine offers decode/probe primitives, not a muxing trim.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'trim'". Honest; it is a demux-only wasm wrapper with no muxer/writer to emit a trimmed file.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'trim'". Honest; a read-only parser, no write side.
- **ffmpeg.wasm@0.12.15** — `NA_ENGINE`: "engine does not declare feature 'alpha'". This is the most interesting and is an HONEST under-not-over declaration: ffmpeg.wasm DOES declare `trim`, but its vendored libvpx build decodes this VP9-alpha fixture as opaque RGBA and traps on VP9-alpha encode (`src/engines/ffmpeg-wasm/adapter.ts:28`, `2294-2297`), so it correctly omits the generic `alpha` token rather than claiming a capability it cannot honor. The runner's `alpha`-feature gate (`runner.ts:171-173`) therefore NAs it before execution.

## Anti-cheat validation

- **Scenario:** `src/scenarios/trim/index.ts:330-341` — `id: 'vp9_alpha_keyframe_aligned'`, `asset: 'vp9_alpha.webm'`, `container: 'webm'`, `videoCodec: 'vp9'`, range `1_000_000..3_000_000us`, `features: ['alpha']`, `tolerances.durationToleranceSec = 0.5`.
- **Fixture:** `fixtures/media/vp9_alpha.webm` EXISTS, 749 KB — a real, non-trivial VP9-alpha WebM, not synthetic/empty/mock.
- **Oracle:** `src/core/oracles.ts:2348-2435` (`trim-boundaries`). It performs a REAL measurement — probes/decodes the trimmed output and compares decoded duration to the requested 2 s window (`durationDeltaSec = 0`, tolerance 0.5 s). It is NOT trivially satisfiable on duration. However, the strongest sub-check (boundary-frame SHA-256 digest vs trim-range golden) is INACTIVE here (`boundaryFrameComparisons = 0`) because only source-prefix golden exists; this is a transparent, documented limitation, not a faked pass.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1445-1500` (`trim`) → `runConversion` `adapter.ts:842-866`. Genuinely calls `Conversion.init` + `execute()` and reads the live `BufferTarget` buffer; no copy-input-as-output, no golden short-circuit, no swallowed error (it throws on invalid conversion / empty buffer at `adapter.ts:849-861`).
- **Cached note:** `cached == true` ("cached previous PASS result"). The numbers (wall 478.17 ms, throughput 10.46x, longtasks 12909 ms) were reused from a prior run, not re-executed this run — mild staleness risk per the launcher-seeding caveat; clearing raw + `.browser-cache` would be needed for a fully fresh re-measurement.
- **Verdict:** **WEAK-GATE.** Real fixture + real implementation + a real oracle, but the gate that actually fires is duration-within-0.5s plus playback-smoke. The bit-exact alpha-plane / boundary-frame correctness check is disabled (no trim-range golden), so the PASS is genuine but does not positively prove the alpha plane survived the cut — it only proves a correctly-sized, playable WebM came out.

## Confidence & caveats

- **Confidence: high** on the *outcome* (uncontested winner): only one engine is even eligible, and all six NAs are honest, well-documented capability gaps (verified in adapter feature lists and runner gating logic).
- **Caveat 1:** Correctness strength is duration + smoke only; alpha-plane preservation is asserted by the scenario's intent but not verified by an active oracle (`boundaryFrameComparisons = 0`). A trim-range golden with alpha would be needed to upgrade this from WEAK-GATE to REAL.
- **Caveat 2:** Result is cached (`cached: true`), n=1 on every metric (mad=0, p95=median), so the performance numbers are single-sample and stale; peakMemory was not sampled (n=0). Treat the timings as indicative only.
- **Caveat 3:** No contest means no comparative performance signal — mediabunny "wins" by being the sole alpha-capable trimmer in this suite, not by beating a rival.
