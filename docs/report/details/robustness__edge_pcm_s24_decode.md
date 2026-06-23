# robustness/edge_pcm_s24_decode

family: robustness | fixture asset: `fixtures/media/wav_s24.wav` (1.4 MB, exists) | primaryMetric: n/a (no bench block emitted) | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Decisive factor: correctness is a **tie** (both PASS the identical single oracle `property-invariant` with bit-identical measurements), so the decision falls to performance. Neither PASS engine emitted a `bench` block, so the only available timing signal is `durationMs`: mediabunny **56 ms** vs ffmpeg.wasm **195 ms**.
- Margin over runner-up: **~3.48x faster wall** (195 / 56). Evidence is weak: it is a single `durationMs` sample (n==1, no median/p95/mad), and both results are `cached==true` (reused, not re-run this pass).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | n/a (durationMs 56) | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | n/a (durationMs 195) | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false) |

No `bench{}` object is present for any engine in this shard, so throughputRealtime / peakMemory / longtasks are unavailable; the table reports `durationMs` from the result envelope instead.

## Why the winner wins (deep technical)

The operation under test is an **identity transcode** of a 24-bit little-endian PCM stream inside a RIFF/WAVE container (`wav_s24.wav`, 48 kHz, stereo, 240000 sample-frames per the oracle measurements) back out to the same `wav` / `pcm-s24` format. The gating oracle `property-invariant` with `which='audio-pcm-digest'` (src/core/oracles.ts:2977-3024) decodes BOTH the source bytes and the transcoder's output through the browser's `AudioContext.decodeAudioData` (src/core/oracles.ts:3285-3300), then compares sample count, sample rate, channel count, and a SHA-256 over the decoded interleaved PCM. The shard shows a clean pass: `sourceSamples 240000 == outputSamples 240000`, `sourceSampleRate 48000 == outputSampleRate 48000`, `sourceChannels 2 == outputChannels 2`, and the digests matched (no `PCM digest ... vs source ...` diff was emitted; the pass string reads "output decodes bit-identical to source (240000 sample(s))"). Both PASS engines produce identical measurements, so on the correctness ladder this is a flat tie at the "property-invariant" rung (a structural/metadata-exact rung, stronger than perceptual/smoke but weaker than crypto/bit-exact-frame oracles).

Because correctness cannot separate them, the tiebreak is performance + architecture. mediabunny ran the conversion through its native pure-TypeScript pipeline: it does NOT round-trip 24-bit PCM through WebCodecs at all. Its capability set explicitly declares the `audio:pcm-native` token (src/engines/mediabunny/adapter.ts:1088) which tells the runner's `negotiate()` to SKIP the browser encode/decode gate for `pcm-*`, and `pcm-s24` is in its declared `audioCodecs` list (adapter.ts:1041). The transcode path (`transcode()` adapter.ts:1271-1322) builds a `WavOutputFormat` via `makeOutputFormat('wav', ...)` (codecs.ts:158-175) and drives a `Conversion` over the opened input. For PCM-in-WAV this is effectively a header re-emit plus straight sample-copy — no entropy decode, no resampling, no encoder warm-up — which is why its wall is just **56 ms**.

ffmpeg.wasm reaches the SAME correct result but through a heavier route: its `transcode()` (src/engines/ffmpeg-wasm/adapter.ts:2165+) writes the input into the Emscripten MEMFS, runs an `ffmpeg -i ... -c:a pcm_s24le ... out.wav` invocation (codec mapping `pcm-s24 -> pcm_s24le`, codecs.ts:41), and reads the result back out of the virtual filesystem. The vendored single-thread wasm core (the adapter defaults to single-thread to avoid pthread traps, adapter.ts:10) pays MEMFS write, an `-i` probe pass (`runInfo`), full ffmpeg process spin-up, and binary read-back — overhead that dominates a trivially small PCM job, giving **195 ms**, ~3.48x mediabunny's wall. Both backends are CPU/wasm (PCM never touches the GPU/WebCodecs hardware path that mediabunny lists in `env.configUsed.backend='webcodecs'`; that config is the engine default, not the path exercised for native PCM). mediabunny also requires no COOP/COEP and no SharedArrayBuffer (`coopCoep: 'not-required'`, `sharedArrayBuffer: false`), a deployment tiebreaker over the wasm core.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed correctly (identical oracle, identical 240000-sample bit-exact digest) but lost on performance: 195 ms wall vs mediabunny's 56 ms (3.48x slower) due to MEMFS write + `-i` probe + wasm process spin-up + read-back overhead on a job too small to amortize it.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'". Honest NA — the WebCodecs/MediaRecorder platform path has no WAV muxer, so it genuinely cannot emit the required `wav` output.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — web-demuxer is a demux-only library with no encode/mux path.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — mp4box is an MP4 box parser/remuxer with no audio transcode capability (and no WAV support at all).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — it is a parser, not an encoder.
- **remotion-webcodecs@4.0.479** — NA_BROWSER: "browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false)". Honest NA — Chrome 149's WebCodecs `AudioEncoder` has no `pcm-s24` codec, and remotion-webcodecs routes audio encode through WebCodecs, so the capability genuinely does not exist for this engine. (Contrast mediabunny, which bypasses WebCodecs for PCM via its native `audio:pcm-native` path.)

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:130-141 — `id:'edge_pcm_s24_decode'`, `op:'transcode'`, `asset:'wav_s24.wav'`, `containersIn/Out:['wav']`, `audioCodecs:['pcm-s24']`, `options.invariant:'audio-pcm-digest'`, oracle `property-invariant`. Notes confirm intent: "24-bit PCM sample-format edge: materialize an identity WAV transcode and browser-decode source plus output to the same PCM digest."
- Fixture: `fixtures/media/wav_s24.wav` exists, 1.4 MB — a real RIFF/WAVE file, not synthetic/empty/mock. Sample geometry (240000 frames @ 48 kHz stereo = 5.0 s) is physically plausible and consistent across source and output in the oracle measurements.
- Oracle: src/core/oracles.ts:2977-3024 (`audioPcmDigestInvariant`). It decodes BOTH source and transcoder output independently via the browser `AudioContext.decodeAudioData` (oracles.ts:3285-3300) and fails on ANY mismatch in samples, sampleRate, channels, OR SHA-256 PCM digest (oracles.ts:3008-3017). This is a genuine bit-exact-on-decoded-PCM comparison against the real source, not a wide tolerance and not a smoke gate — it cannot be satisfied by canned output.
- Winner adapter: src/engines/mediabunny/adapter.ts:1271-1322 drives a real `Conversion` to a `WavOutputFormat` (codecs.ts:158-175); the `audio:pcm-native` capability (adapter.ts:1088) is a legitimate optimization, not a short-circuit — output still passes the independent browser-decode digest oracle. No hardcoded output, no input->output copy fake, no golden short-circuit, no swallowed errors.
- Verdict: **REAL** — real fixture + real library implementation on both PASS engines + a meaningful bit-exact-on-decoded-PCM oracle.
- Cached note: BOTH PASS results have `cached==true` ("cached previous PASS result"); they were reused from a prior run, not re-executed this pass. The correctness conclusion is robust (digest equality is deterministic), but the 56 ms vs 195 ms timing is stale single-sample evidence.

## Confidence & caveats

- Correctness conclusion: high — deterministic bit-exact PCM digest oracle, both engines clearly pass with matching 240000-sample measurements.
- Winner selection: medium — correctness is a true tie; the win rests entirely on a single, cached `durationMs` (n==1, no median/p95/mad, no `bench` block). The 3.48x margin is directionally strong (native sample-copy vs full wasm-ffmpeg spin-up) but the absolute numbers are stale.
- Architectural tiebreakers reinforce mediabunny: no COOP/COEP, no SharedArrayBuffer, native PCM path avoiding WebCodecs entirely.
