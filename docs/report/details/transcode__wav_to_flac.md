# transcode/wav_to_flac

- family: transcode
- fixture asset: `wav_s16.wav` (fixtures/media/wav_s16.wav, ~960 KB PCM s16 WAV)
- primaryMetric: wall
- passCount: 1 of 7

## Verdict

- best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`)
- contested: **NO** — uncontested, sole PASS
- decisive factor: it is the only engine that both **declares** an audio transcode to a FLAC container AND can actually emit a FLAC bitstream. The native libavcodec `flac` encoder is statically linked into the vendored wasm core, so no browser WebCodecs FLAC encoder is required. Every other engine is NA (operation/container not declared, or runtime cannot encode FLAC).
- margin over runner-up: none — zero other engines reached PASS, so there is no second-place performance comparison.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 40.53 ms | 123.37 x-realtime | 0 (n=0) | 19963 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'flac' (WebCodecs AudioEncoder.isConfigSupported=false) |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'flac' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'flac' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

(peakMemory has n=0 samples — not instrumented for this cell; not usable as evidence. wall/throughput/longtasks each have n=1.)

## Why the winner wins (deep technical)

The operation is `pcm-s16` in a RIFF/WAVE container → re-encode to `flac` codec in a raw FLAC container (scenario `wav_to_flac`, src/scenarios/transcode/index.ts:362-373, `opts: { container: 'flac', audio: { codec: 'flac' } }`, `lossless: true`). FLAC is a *lossless* codec, so the encode path must do real Rice/linear-prediction compression of the PCM samples and write a native FLAC stream (fLaC magic + STREAMINFO + audio frames) — there is no container-only "remux" shortcut because the source samples are uncompressed PCM and the target is FLAC-compressed.

Only one engine can do this in-browser. FLAC encoding is not exposed by Chrome's WebCodecs `AudioEncoder` (Chrome ships a FLAC *decoder* but not an *encoder*), which is exactly why mediabunny — which routes audio encode through WebCodecs — returns NA_BROWSER: `AudioEncoder.isConfigSupported('flac')=false`. ffmpeg.wasm sidesteps WebCodecs entirely: the vendored core statically links libavcodec's **native `flac` encoder** (codecs.ts:38 `flac: 'flac', // native`; the comment at codecs.ts:10 confirms native aac/flac/alac/pcm are compiled in). So the winning code path is a genuine software FLAC encode running in wasm, not a delegate to any browser codec.

Adapter mechanism (src/engines/ffmpeg-wasm/adapter.ts):
- `transcode()` (adapter.ts:2165) guards still-image/mutated/truncated/Opus inputs, then writes the WAV input to the wasm FS (adapter.ts:2203) and probes it via `runInfo` (adapter.ts:2206), confirming an audio track exists (`hasAudio`, adapter.ts:2208/2215).
- The audio branch (adapter.ts:2461-2508) resolves `audioEncoderName('flac')` → `'flac'` (adapter.ts:2468) and pushes `-c:a flac` (adapter.ts:2472). No bitrate is supplied (FLAC is lossless), so no `-b:a` is added; sample rate/channels are left at source. The output name is `<scratch>.out.flac` (adapter.ts:2202, `containerExt('flac')`), and `ffmpeg` is actually executed via `this.run(args)` (adapter.ts:2528), then the encoded bytes are read back with `readBinary(outName)` (adapter.ts:2529). This is a real `ffmpeg -i in.wav -map 0 -c:a flac out.flac` invocation — no copy of input→output, no golden short-circuit.

Oracle and measurements: the gate is `property-invariant` dispatched to `transcodeOutputMetadataInvariant` (src/core/oracles.ts:2650 → 3626). It re-probes the produced bytes with the reference engine (oracles.ts:3641 `ctx.referenceEngine.probe(...)`) and asserts: (1) container equals the requested `flac` (oracles.ts:3654); (2) output duration within the duration tolerance band of the golden source duration (oracles.ts:3658-3678); (3) the requested audio track shape is present (oracles.ts:3692-3699, `compareRequestedTrack('audio', ...)`). The shard's recorded measurements are physically consistent with a correct lossless encode of a short WAV: `durationDeltaSec: 0`, `durationToleranceSec: 0.041666…` (≈1 frame @ 24 fps), `audioTracks: 1`, and the pass detail `flac, 1 track(s) match requested output shape`. A zero duration delta is exactly what a sample-count-preserving lossless re-encode should produce. Performance: wall median 40.53 ms, 123.37x realtime — plausible for a sub-second 960 KB PCM clip compressed to FLAC in single-thread wasm.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_BROWSER, honest: it declares the FLAC container/operation but its audio encode goes through WebCodecs `AudioEncoder`, and Chrome-149 reports `isConfigSupported('flac')=false` (no FLAC *encoder* in the browser). Genuine runtime capability gap, not under-declaration. This is the cleanest illustration of *why* ffmpeg.wasm wins: native-encoder vs WebCodecs-encoder.
- **platform@chrome-149** — NA_ENGINE: does not declare output container `flac`. Honest — the platform/WebCodecs path has no FLAC muxer/encoder to offer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare output container `flac`. Same WebCodecs limitation as platform/mediabunny; honest non-declaration.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare operation `transcode` at all (it is a parser/demuxer, not an encoder). Honest.
- **mp4box@2.3.0** — NA_ENGINE: does not declare operation `transcode` (MP4 box muxer/parser only). Honest.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare operation `transcode` (demux-only library). Honest.

All six non-winners are honest NAs: four are capability-absent by design (no encoder/transcode op), and two (platform/mediabunny family) are blocked by a real WebCodecs FLAC-encoder gap.

## Anti-cheat validation

- scenario: src/scenarios/transcode/index.ts:362-373 (`id: 'wav_to_flac'`, `asset: 'wav_s16.wav'`, `toContainer/toAudio: 'flac'`, `lossless: true`). Notes (line 370-372) explicitly state the gate is output-metadata only and that PCM bit-exactness "needs a dedicated audio decode oracle before it can be asserted here" — the gating limitation is disclosed by design, not hidden.
- fixture: `fixtures/media/wav_s16.wav` EXISTS (~960 KB), a real PCM s16 WAV — not synthetic/empty/mock.
- winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2461-2508 (audio branch, `-c:a flac`) + adapter.ts:2528 (`this.run(args)` actually invokes ffmpeg) + codecs.ts:38 (native flac encoder). Real library call; no canned output, no input→output copy, no golden short-circuit, no error-swallowing-as-success.
- oracle: src/core/oracles.ts:3626 `transcodeOutputMetadataInvariant` — reference-engine re-probe of produced bytes with real container/duration/track comparison (oracles.ts:3654, 3658-3678, 3692-3699). Not trivially satisfiable for container/track shape; the duration tolerance (~0.0417 s) is tight for a short clip.
- verdict: **WEAK-GATE**. The implementation and fixture are real and the oracle performs a real comparison, BUT for a *lossless* target the gate only checks output container + duration + audio-track presence; it does NOT decode the FLAC back and assert PCM bit-exactness against the source PCM (no `decoded-audio-pcm`/`audio-pcm-digest` oracle is wired for this scenario, as the scenario notes admit). A broken FLAC encoder that produced the right duration/track shape but wrong samples would still PASS. The PASS is real but not as strong as a bit-exact lossless check would be.
- cached note: the winner's result is `cached: true` ("cached previous PASS result"). The reported numbers were REUSED from a prior run, not re-executed this run — staleness risk: if the adapter/oracle changed since caching, the cached PASS may not reflect current code. The metric n=1 (single sample, mad=0) is weak statistical evidence regardless.

## Confidence & caveats

- Confidence: **high** on the decision (sole eligible PASS; six honest NAs with clearly documented capability gaps). The win is structural — only ffmpeg.wasm carries a native FLAC encoder in-browser.
- Caveat 1: WEAK-GATE — metadata-only oracle on a lossless codec; no PCM bit-exact assertion. Treat the PASS as "produced a valid FLAC file of the right shape/duration," not "verified lossless round-trip."
- Caveat 2: cached==true and n=1 for all metrics (peakMemory uninstrumented, n=0). Performance figures are indicative only and possibly stale.
