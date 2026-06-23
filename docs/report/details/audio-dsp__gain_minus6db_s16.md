# audio-dsp/gain_minus6db_s16

family: audio-dsp | fixture asset: fixtures/media/wav_s16.wav (real, 960 KB) | primaryMetric: wall | passCount: 2

## Verdict

**Best framework: ffmpeg.wasm@0.12.15** — CONTESTED (2 PASS: ffmpeg-wasm and mediabunny).

Both passing engines satisfy the **same single oracle** (`property-invariant` / `transcode-output-metadata`) with **identical measurements** (`durationDeltaSec: 0`, `audioTracks: 1`, container `wav`). Correctness strength is therefore a tie — neither demonstrates more than "produced a 1-track WAV of the right duration." The decisive factor is **PERFORMANCE on the primary metric (wall)**:

- ffmpeg-wasm wall median **25.535 ms** vs mediabunny **66.640 ms** → **2.61x faster wall**.
- ffmpeg-wasm throughputRealtime **195.81x** vs mediabunny **75.03x** → **2.61x higher throughput**.
- ffmpeg-wasm longtasks **330 ms** vs mediabunny **2477 ms** → **7.51x lower main-thread blocking** (the strongest margin).

Both samples are **n=1** (mad=0, no spread), so the perf evidence is single-shot and not statistically robust; the direction is consistent across all three metrics, but the magnitude should be treated as indicative. peakMemory is unrecorded (n=0, 0 bytes) for both, so it cannot break the tie.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 25.535 ms | 195.81x | n/a (0) | 330 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass | 66.640 ms | 75.03x | n/a (0) | 2477 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'gain' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |

## Why the winner wins (deep technical)

**The operation.** This scenario is a pure audio DSP transcode: take a real little-endian 16-bit PCM stereo WAV (`fixtures/media/wav_s16.wav`, container `wav`, codec `pcm-s16`), apply a gain of `-6.0206 dB` (== exact 0.5 linear), and re-emit `wav / pcm-s16` (`src/scenarios/audio-dsp/index.ts:165-174`). There is no compressed codec, no keyframe structure, no encryption — the entire cost is demux → decode PCM → per-sample multiply → re-encode PCM → mux WAV. Because PCM is uncompressed, the realtime-throughput numbers (>75x) and sub-100ms walls are physically plausible for a ~5s clip.

**Why ffmpeg-wasm is faster here.** ffmpeg-wasm maps the gain to a native libavfilter `volume` filter string: `audioFilters.push(\`volume=${gain}\`)` where `gain` is the literal `gainLinear` 0.5 when present (`src/engines/ffmpeg-wasm/adapter.ts:2474-2480`). The entire decode→filter→encode chain runs inside the compiled WASM module (libavcodec/libavfilter/libavformat) in one tight C loop; the only JS↔WASM boundary crossings are the input buffer in and the output buffer out. That keeps main-thread work small (longtasks 330 ms) and the wall low (25.535 ms, 195.81x realtime).

**Why mediabunny is slower (but still correct).** mediabunny applies gain in JavaScript via `ConversionAudioOptions.process`, a per-`AudioSample` callback: it copies each sample to an `f32` `Float32Array` (`copyTo(data, {format:'f32'})`), then loops every frame×channel multiplying by `scale = 10 ** (gainDb/20)` or `gainLinear` (`src/engines/mediabunny/adapter.ts:704-743`). That per-sample JS loop, plus the WebCodecs/AudioSample marshalling (`env.configUsed.backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `wasmThreads: 0`, `sharedArrayBuffer: false`), is exactly what shows up as the 2477 ms longtasks figure — a 7.51x heavier main-thread cost than ffmpeg-wasm's in-WASM filter. Result: same correct output shape, 2.61x slower wall.

**The oracle it satisfied.** The gate is `property-invariant` with `which == 'transcode-output-metadata'` (`src/core/oracles.ts:3631-3707`). It reference-probes the produced bytes, asserts the output container equals the requested `wav`, that an audio track exists, and that output duration is within tolerance of the source (`durationToleranceSec ≈ 0.0417s`). The shard shows `durationDeltaSec: 0` and `audioTracks: 1` for both — duration preserved exactly and a single audio track emitted. **Crucially this oracle never decodes the PCM and never compares samples**, so it confirms "a valid mono/stereo WAV of the right length came out" but says nothing about whether -6 dB was actually applied or applied correctly. ffmpeg-wasm wins on speed, not on a correctness edge — there is no correctness edge available to win on here.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, but lost on performance: 2.61x slower wall (66.640 vs 25.535 ms), 2.61x lower throughput (75.03x vs 195.81x), and 7.51x more main-thread blocking (longtasks 2477 vs 330 ms). Cause is its JS per-sample `process` loop + WebCodecs AudioSample marshalling vs ffmpeg's in-WASM `volume` filter. Correctness is identical (same oracle, same measurements).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest — web-demuxer is a demux-only library (no encode/transcode surface), so it genuinely cannot perform a gain transcode.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest — mp4box is an ISO-BMFF box parser/muxer, not an audio transcoder, and has no PCM/WAV DSP path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest — it is a parser, not an encoder.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'gain'." Plausibly honest: although it can transcode via WebCodecs, it does not expose a gain/volume DSP knob, so the `features:['gain']` requirement gates it out. (Mild under-declaration risk — a WebCodecs pipeline could in principle scale samples — but the adapter does not implement that feature, so NA is defensible.)
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'." Honest — the browser's native media-encoding surface (WebCodecs + muxer) does not emit a RIFF/WAVE container, so it cannot satisfy `containersOut:['wav']`.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/audio-dsp/index.ts:165-174` (id `gain_minus6db_s16`), wired to oracles at `src/scenarios/audio-dsp/index.ts:293-296` and `:298-317`.
- **Fixture:** `fixtures/media/wav_s16.wav` exists and is a real 960 KB WAV (verified via stat). Not synthetic/empty/mock. Input is a genuine 16-bit PCM stereo file.
- **Oracle:** `src/core/oracles.ts:3631-3707` (`property-invariant` → `transcode-output-metadata`). Performs a REAL reference-probe of the produced bytes (container check, audio-track-count check, duration-vs-source within ±0.0417s). It is **not** a smoke/playback gate and it is not trivially-always-true (it fails on wrong container, missing audio track, or duration drift). **However it does NOT decode the PCM and does NOT compare samples against any golden** — so it cannot detect whether the -6 dB gain was actually applied, was applied with the wrong factor, or was skipped entirely.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2474-2480` — genuinely emits libavfilter `volume=0.5` and runs the real WASM ffmpeg pipeline; no canned output, no input→output copy, no short-circuit to a golden, no error swallowing.
- **Gating mismatch (the reason this is not REAL):** the scenario declares `bitReproducible: true` with notes promising "defined LSB rounding -> reproducible PCM digest" (`index.ts:171-173`), but the suite intentionally attaches only the metadata invariant. The code comment at `index.ts:288-296` and the writer note at `src/scenarios/audio-dsp/_shared.ts:17` both state plainly: *"The current suite has no decoded-PCM oracle … `bitReproducible` … does not drive a guaranteed-failing … oracle today."* So the strongest available correctness signal for a gain test (sample-level PCM digest) is unimplemented; the PASS rests on a metadata-shape proxy.
- **Cached note:** BOTH passing engines have `cached: true` ("cached previous PASS result"). The numbers were reused, not re-run in this session — staleness risk applies to both the PASS verdict and the perf margins. The launcher-seeding caveat in memory (stale PASS reuse) is directly relevant.
- **Verdict: WEAK-GATE.** Real fixture + real, non-faked implementations on both engines, but the gating oracle is a metadata/duration proxy that cannot verify the actual DSP (gain) operation. The PASS is genuine but shallow; the contest is decided purely on speed, not correctness.

## Confidence & caveats

- **Confidence: medium.** The framework ranking (ffmpeg-wasm > mediabunny) is unambiguous and consistent across wall, throughput, and longtasks. But: (1) all benches are **n=1** (no spread, weak statistical evidence); (2) both results are **cached** (possible staleness); (3) the gating oracle is **metadata-only** — it does not prove either engine applied -6 dB correctly, so "best at this feature" means "fastest valid-WAV producer," not "most correct gain."
- The winner could be confirmed beyond doubt only with a decoded-PCM digest oracle compared to a baked golden (which the suite acknowledges it lacks). Until then, treat the correctness portion of this test as unverified for sample accuracy.
- peakMemory was not captured (n=0) for either engine, so the memory tiebreaker could not be evaluated.
