# transcode/vp9_alpha_to_vp8_keepalpha

family: transcode | fixture asset: `vp9_alpha.webm` (749 KB, exists in fixtures/media/) | primaryMetric: wall | passCount: 1/7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **NO** — exactly 1 PASS; the other 6 engines are all NA_ENGINE (none even declares the operation/feature). Uncontested winner.
- Decisive factor: mediabunny is the only adapter that declares both the `transcode` operation AND the `alpha:transcode` feature, and backs them with a real `Conversion` (WebCodecs VP8 encode with `alpha:'keep'`). Every other engine negotiated out via capability gating, so there is no runner-up to measure a margin against.
- Margin over runner-up: N/A (no second PASS).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | alpha-plane:true, playback-smoke:true | 551.86 (n=1) | 9.06 (n=1) | 0 (n=0, not sampled) | 4146 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'alpha' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'alpha:transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'alpha' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Supplementary mediabunny bench (not in the table columns): encodeFps median 271.81 (n=1); decodeFps n=0 (not sampled); durationMs 6834.

## Why the winner wins (deep technical)

The operation is a **cross-codec alpha-preserving re-encode**: source is VP9 with a YUVA alpha plane stored as VP9 alpha side-data inside a WebM/Matroska container (`vp9_alpha.webm`); target is **VP8 in WebM**, where the alpha plane is likewise carried as a per-block additional (BlockAdditional) alpha frame. This is strictly harder than generic alpha decode — the encoder must produce a *second* VP8-encoded alpha stream alongside the colour stream, not merely raster RGBA once. The scenario at `src/scenarios/transcode/index.ts:921` therefore requires the granular `alpha:transcode` feature (not just `alpha`) and gates on the dedicated `alpha-plane` oracle plus `playback-smoke` (`oraclesOverride: ['alpha-plane','playback-smoke']`, `opts.alpha: 'keep'`).

mediabunny is the only engine wired for this. Its capability block declares both `alpha` and `alpha:transcode` (`src/engines/mediabunny/adapter.ts:1061-1062`) and registers `transcode: true` (`adapter.ts:1026`). The `alpha:'keep'` request flows through `alphaModeFrom` (`adapter.ts:201-203`) into the `ConversionVideoOptions` via `if (extra?.alpha) opts.alpha = extra.alpha;` (`adapter.ts:599`), and is also passed to the encode-capability probe `mb.canEncodeVideo(codec, {..., alpha})` (`adapter.ts:637-640`). For VP8/VP9 the adapter explicitly prefers the software encoder path (`SOFTWARE_PREFERRED_ENCODE` → modes `['prefer-software','no-preference']`, `adapter.ts:622-623`), because hardware VPx encoders are scarce and reject alpha; this is what lets the alpha-bearing VP8 encode actually succeed. The encode is genuine: `runConversion` calls `mb.Conversion.init(opts)`, checks `conversion.isValid`, runs `await conversion.execute()`, and returns the muxed `BufferTarget` bytes (`adapter.ts:848-866`) — no input→output copy, no golden short-circuit.

The `alpha-plane` oracle (`src/core/oracles.ts:2090`) then re-decodes mediabunny's *output bytes* with the platform decoder (`ctx.decodeWithPlatform`, `oracles.ts:2110`) and extracts the alpha channel per frame via `extractAlpha`. Recorded measurements: `pairs:12, framesWithAlpha:12, pixelFrames:12, maxAlphaMeanAbsDiff:0, comparedAlphaDigests:0`. Concretely, all 12 decoded output frames carried a non-opaque alpha channel (`framesWithAlpha === pixelFrames === 12`), proving the VP8 alpha plane survived the VP9→VP8 transcode round-trip and is decodable by an independent (platform/WebCodecs) decoder. `comparedAlphaDigests:0` means the golden bake shipped no alpha-only digest, so the oracle ran in presence-verification mode (`oracles.ts:2179-2183`) rather than bit-exact comparison — a real structural gate, not a numerical one. `playback-smoke` confirms a `<video>` actually rendered frames from the output (`oracles.ts:1572`), corroborating that the WebM is well-formed and playable.

The backend that achieved this (`env.configUsed`): `backend: webcodecs`, `hwAccel: prefer-hardware` (nominal), `pixelBackend: VideoSample.copyTo(RGBA)>canvas`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required`, `wasmThreads: 0`. Notably no COOP/COEP and no SharedArrayBuffer were required — mediabunny drives WebCodecs directly for decode/encode and only muxes in TS, so the alpha transcode completed in 551.86 ms wall (encodeFps 271.81, 9.06x realtime) with no wasm threading.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'alpha'". Honest NA. ffmpeg could technically transcode VPx alpha, but the adapter does not declare alpha support, so it correctly negotiates out rather than faking the alpha plane.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare feature 'alpha:transcode'". The most informative NA: the raw WebCodecs platform engine may support generic alpha rendering but does not declare the stricter *alpha-preserving transcode* capability (no built-in WebM alpha muxer), so it is gated out one level finer than the others. Honest.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'alpha'". Honest; the WebCodecs-based transcoder does not implement alpha-plane preservation.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Correct — it is a demuxer only; it has no encode path at all.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Correct — ISOBMFF box mux/parse tool, no encoder, and MP4 is not even the target container here (WebM).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Correct — a parser, not a transcoder.

All six NAs are honest capability declines (no oracle was attempted/silently passed). None look like under-declared capabilities for this specific alpha-preserving-VP8 task: only mediabunny ships the `alpha:'keep'` Conversion path that can emit a VP8 alpha sub-stream.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:921` (case `vp9_alpha_to_vp8_keepalpha`), notes at `:930-933` explaining VP8 YUVA alpha and why SSIM is deliberately omitted (cross-codec colour drift on a tiny alpha clip is not the property under test — appropriate, not a loophole).
- Fixture asset: `fixtures/media/vp9_alpha.webm` — REAL file, 749 KB, present on disk (stat confirmed). Not synthetic/empty/mock. It is a genuine VP9-alpha WebM.
- Gating oracle: `alpha-plane` at `src/core/oracles.ts:2090`; it re-decodes the engine's OUTPUT bytes with the platform decoder (`:2110`) and inspects per-frame alpha — it is not trivially satisfiable: it FAILs on 0 pixel frames (`:2166`), FAILs if no frame is non-opaque (`:2169`), and FAILs on digest mismatch when a golden alpha digest exists (`:2172`). Measurements (12/12 frames non-opaque, maxAlphaMeanAbsDiff 0) are physically plausible for a 12-frame alpha clip. Secondary `playback-smoke` at `:1572`.
- Winner adapter: real implementation at `src/engines/mediabunny/adapter.ts` — `alpha:'keep'` wired at `:599`, encode-capability probe with alpha at `:637-640`, genuine `Conversion.init/execute` at `:848-866`. No canned output, no input→output copy, no golden short-circuit, no swallowed error reported as success.
- Verdict: **WEAK-GATE**. The PASS is real (real fixture, real mediabunny WebCodecs VP8 alpha encode, real platform re-decode), but because the golden carries no alpha-only digest, `comparedAlphaDigests:0` — the oracle verifies alpha *presence* (12/12 non-opaque) rather than *bit-exact alpha fidelity*. It cannot detect a degraded-but-present alpha plane. Strong enough to prove alpha survived the VP9→VP8 transcode; not strong enough to certify alpha bit-accuracy.
- Cached note: mediabunny's result has `cached==true` ("cached previous PASS result") — it was reused, not re-run in this batch. Staleness risk: low (adapter declares the capability and the code path is real), but the bench numbers (wall 551.86, n=1, mad=0) come from a single prior sample and should be treated as a point estimate.

## Confidence & caveats

- Confidence: **high** on the winner identity (only 1 PASS; the other 6 are unambiguous capability NAs).
- The win is uncontested, so there is no performance margin to report.
- The oracle is presence-only for alpha (no golden alpha digest), so this is a WEAK-GATE rather than a bit-exact certification; n=1 cached bench means the timing figures are indicative, not statistically robust (mad=0 is an artifact of a single sample).
- peakMemory and decodeFps were not sampled (n=0) for this cell, so memory/decode-throughput comparisons are unavailable.
