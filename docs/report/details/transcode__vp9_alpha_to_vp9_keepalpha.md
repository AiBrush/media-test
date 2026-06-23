# transcode/vp9_alpha_to_vp9_keepalpha

family: transcode | fixture asset: `vp9_alpha.webm` (749 KB, real WebM/VP9-alpha) | primaryMetric: wall (median ms) | passCount: 1/7

## Verdict

- Best framework: **mediabunny@1.48.0** (engine id `mediabunny`).
- Contested: **NO** — exactly one engine reached `status=PASS`. The other six are all `NA_ENGINE`.
- Decisive factor: mediabunny is the only engine that declares the required `alpha:transcode` (alpha-preserving VPx re-encode) capability AND actually wires the mediabunny `Conversion` API with `alpha:'keep'`. Every other engine is gated out at capability negotiation before any byte is processed (under-declared op or missing alpha feature).
- Margin over runner-up: N/A — there is no runner-up that ran. Six engines never executed (capability NA), so there is no head-to-head metric comparison.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | alpha-plane:true, playback-smoke:true | 1068.43 | 4.680 | 0 (not sampled) | 179 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'alpha:transcode' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'alpha' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'alpha' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Supplementary mediabunny bench (n=1, warmup=1, mad=0 on every metric → single sample, weak statistical evidence): encodeFps median 140.39 fps; decodeFps/peakMemory not sampled (n=0). durationMs 7376.

## Why the winner wins (deep technical)

The operation under test is a VP9-with-alpha → VP9-with-alpha re-encode *with a resize to 320×240*, where the alpha plane must survive the encode (scenario `opts.alpha:'keep'`, `src/scenarios/transcode/index.ts:905-919`). This is strictly harder than generic alpha *decode*: the engine must decode the VP9 YUVA frames, re-scale, and re-encode through a VP9 encoder configured to emit an alpha side-data plane (in WebM/Matroska, VP8/VP9 alpha is carried as a second coded plane via BlockAdditional), then mux it back.

mediabunny is the only engine that both *declares* this and *implements* it. The capability set explicitly lists `'alpha'` and `'alpha:transcode'` (`src/engines/mediabunny/adapter.ts:1061-1062`) alongside `'resize'` (`:1056`) and `transcode: true` (`:1026`), so the runner's negotiate() lets it run. The implementation path is genuine, not a stub: `alphaModeFrom()` parses `alpha:'keep'` into an `AlphaMode` (`adapter.ts:201-203`), it is threaded into the extra options (`:212-213`), and ultimately set on the mediabunny `ConversionVideoOptions` as `opts.alpha = extra.alpha` (`adapter.ts:599`). Critically, the same alpha flag is also passed into the pre-flight encodability probe `mb.canEncodeVideo(codec, { ..., alpha })` (`adapter.ts:637-640`), so mediabunny verifies the browser's VP9 encoder can actually emit an alpha plane *before* committing the Conversion — this is what prevents a mid-transcode hard ERROR and lets it honestly fall through to NA(browser) instead if alpha-VP9 encode were unsupported. The Conversion then runs read→decode→encode→mux in a streaming-lockstep pipeline (`env.configUsed.pipeline:"streaming-lockstep"`, backend `"webcodecs"`, `hwAccel:"prefer-hardware"`, though VP9 is in the software-preferred encode set so it lands on the software VP9 encoder per `adapter.ts:622-626`).

The gating oracle `alpha-plane` (`src/core/oracles.ts:2090-2185`) re-decodes the produced WebM output with the platform decoder (`ctx.decodeWithPlatform`, `:2108-2113`), reads each frame's pixels via `getPixels`, and runs `extractAlpha()` (`oracles.ts:2110-2123`) which flags a frame `nonOpaque` if any pixel has alpha ≠ 255 (`:4110-4123`). The shard measurements are physically consistent with a real alpha clip: `pairs=12, framesWithAlpha=12, pixelFrames=12, maxAlphaMeanAbsDiff=0, comparedAlphaDigests=0`. So all 12 re-decoded frames carried a genuine non-opaque alpha channel — the alpha plane survived the VP9→VP9 re-encode + resize, which is exactly the property the scenario targets. `playback-smoke:true` additionally confirms the muxed WebM is a playable `<video>`.

Performance is essentially uncontested context rather than a winning margin: wall median 1068 ms for a 12-frame clip, throughputRealtime 4.68× and encodeFps 140 fps on the software VP9 encoder. All metrics are n=1 (single sample, mad=0), so they are descriptive only.

## What each other framework did wrong

- **platform@chrome-149** — NA_ENGINE, "does not declare feature 'alpha:transcode'". Honest NA: the adapter declares `'alpha'` *decode* (`src/engines/platform/adapter.ts:275`) but its transcode is the canvas→MediaRecorder→WebM path (`:232`, comment "lossy/real-time/video-only"), which composites onto an opaque canvas and cannot preserve a separate VP9 alpha plane. Correctly refuses rather than emitting opaque output.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE, "does not declare feature 'alpha'". Honest NA: it has `transcode: true` and even parses an `alpha` option (`adapter.ts:2262`), but does not declare the `alpha` capability token, so the runner gates it before run. (libvpx-in-wasm alpha-plane VP9 encode is not validated for this build; declining is the safe call.)
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "does not declare feature 'alpha'". Honest NA: declares `transcode: true` (convertMedia reencode/resize/rotate, `adapter.ts:244`) but no `alpha` token; its convertMedia path does not preserve a VPx alpha plane.
- **mp4box@2.3.0** — NA_ENGINE, "does not declare operation 'transcode'". Honest NA: mp4box is an ISOBMFF box parser/muxer with no encode pipeline at all; transcode is structurally out of scope.
- **web-demuxer@4.0.0** — NA_ENGINE, "does not declare operation 'transcode'". Honest NA: a demux-only library (WASM FFmpeg demuxer); no encoder.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "does not declare operation 'transcode'". Honest NA: a pure parser/probe library; no transcode op exists.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:903-919` (case `vp9_alpha_to_vp9_keepalpha` in `ALPHA_CASES`), built via `buildVideoScenario`. Input `asset:'vp9_alpha.webm'`, `opts.alpha:'keep'`, output 320×240 VP9/WebM, oracles overridden to `['alpha-plane','playback-smoke']`. Notes explicitly state SSIM is omitted because colour-plane drift on the tiny alpha clip is not the property under test — alpha presence is.
- Fixture: `fixtures/media/vp9_alpha.webm` EXISTS, 749 KB — a real, non-empty WebM carrying a VP9 alpha plane. Not synthetic/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts` — alpha mode parse `:201-203`, threaded `:212-213`, set on Conversion `:599`, alpha-aware encodability probe `:637-640`, capability declaration `:1026` (transcode) + `:1056` (resize) + `:1061-1062` (alpha / alpha:transcode). Genuine mediabunny `Conversion` call, no canned output, no input→output copy (it re-encodes through the VP9 software encoder), no golden short-circuit.
- Oracle: `alpha-plane` at `src/core/oracles.ts:2090-2185` — re-decodes the engine's *output bytes* with the platform decoder and inspects the actual alpha channel of 12 decoded frames. It is a REAL pixel inspection, not trivially-passing.
- Verdict: **WEAK-GATE**. The PASS is real (real fixture, real implementation, real pixel inspection), but the oracle ran in *presence-only* mode: `comparedAlphaDigests=0` because no golden alpha digest was baked for this fixture (`oracles.ts:2144-2158, 2181-2182`). It therefore verifies that alpha is *present and non-opaque* on all 12 frames, NOT that the alpha is bit-exact / unchanged vs a reference. A degenerate-but-nonzero alpha (e.g. correctly decoded but mildly re-quantised) would still pass. With a baked alpha digest this would escalate to a strong (bit-exact) gate. No competing engine ran, so the loose gate does not change the winner — mediabunny is the only candidate regardless.
- Cached note: mediabunny's result is `cached:true` ("cached previous PASS result"). Staleness risk: the metrics and oracle outcomes were REUSED from a prior run, not re-executed this pass; numbers (n=1, mad=0) reflect that single prior sample. The PASS itself is plausible and consistent, but treat the bench figures as a stale single-shot snapshot.

## Confidence & caveats

- Confidence: **high** on the winner selection (1 PASS vs 6 honest capability-NA is unambiguous; no contest to adjudicate).
- Confidence: **medium** on correctness *strength* — the alpha-plane oracle passed only in presence-only mode (no golden alpha digest), so bit-exact alpha preservation is asserted by the adapter's design and `maxAlphaMeanAbsDiff=0`, but not proven against a reference.
- Caveats: (1) all mediabunny bench metrics are n=1 with mad=0 — descriptive, not statistically robust; (2) peakMemory/decodeFps were not sampled (n=0); (3) result is cached, so figures are a prior-run snapshot; (4) the six NA engines are correctly declined, but ffmpeg.wasm in particular *could* potentially encode alpha-VP9 via libvpx — its NA is conservative under-declaration rather than a hard impossibility, so the field could become contested if that capability were declared and validated.
