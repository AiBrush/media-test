# audio-dsp/resample_44k1_to_48k

family: audio-dsp | fixture asset: `wav_s16_44k1.wav` (PCM s16le, 44100 Hz, 2ch, 10.0s, 1.8 MB) | primaryMetric: wall (throughputRealtime reported alongside) | passCount: 3 / 7

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** (`ffmpeg-wasm`).

CONTESTED — three engines PASS (ffmpeg-wasm, mediabunny, remotion-webcodecs) and all three pass the *same single* oracle (`property-invariant` / transcode-output-metadata) with *identical* correctness measurements (`durationDeltaSec:0`, `durationToleranceSec:0.0417`, `audioTracks:1`, container=wav, sampleRate verified to 48000). Because correctness is a dead tie at the structural/metadata-exact rung, the decision falls to **PERFORMANCE**.

Decisive factor: **wall-clock / realtime throughput**. ffmpeg-wasm completes the upsample in **49.40 ms** vs mediabunny 95.94 ms vs remotion-webcodecs 129.08 ms. Margin over the runner-up (mediabunny): **1.94x faster wall** (95.94 / 49.40) and **1.94x higher realtime throughput** (202.43x vs 104.23x). Over the third-place finisher remotion-webcodecs: **2.61x faster wall**. Caveat: this is a single-sample win (n==1, mad==0) and ffmpeg-wasm's `longtasks` is 19963 ms (one-time wasm core load/JIT) vs mediabunny's 3045 ms — see Confidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 49.40 | 202.43 | (not sampled, n=0) | 19963 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass | 95.94 | 104.23 | 98143748 | 3045 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:pass | 129.08 | 77.47 | (not sampled, n=0) | 2059 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a **sample-rate conversion 44100 -> 48000 Hz** on a PCM-s16le WAV, re-encoded back to PCM-s16le WAV (`opts: { container:'wav', audio:{ codec:'pcm-s16', sampleRate:48000 } }`). Crucially the scenario sets `bitReproducible:false` (src/scenarios/audio-dsp/index.ts:97) with the explicit rationale that "resampling … (format + duration-invariant assertion only)" — different resampler kernels (libswresample vs WebAudio/WebCodecs vs Remotion's path) produce different sample values, so a bit-exact PCM digest is deliberately NOT the gate. The gate is therefore the **structural/metadata-exact** invariant: probe the produced WAV and confirm container=wav, exactly one audio track, audio codec pcm-s16, sampleRate==48000, channels preserved, and duration within tolerance. All three winners satisfied this equally (the shard records `audioTracks:1`, `durationDeltaSec:0` for each), so none can be separated on correctness strength.

ffmpeg-wasm performs a genuine resample: `transcode()` (src/engines/ffmpeg-wasm/adapter.ts:2165) builds an ffmpeg argv that sets `-c:a pcm_s16le` and, at src/engines/ffmpeg-wasm/adapter.ts:2503, pushes `-ar 48000` (driving libswresample inside the vendored wasm core), then `await this.run(args)` (line 2528) executes the real wasm `ffmpeg` program and the output is read back from the emscripten FS via `readBinary(outName)` (line 2529) — it is not the input echoed back nor the golden short-circuited. For a 10-second 44.1k stereo PCM clip this is a pure CPU resample with no encode/quantization stage beyond the integer PCM write, which is why it is the cheapest of the three at the wall: **49.40 ms, 202.43x realtime**.

mediabunny ran a real WebCodecs-backed streaming pipeline (env.configUsed: `backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`, pure-TS ESM core) and also passed the metadata invariant identically, but its wall was **95.94 ms (104.23x realtime)** — 1.94x slower — and it was the only engine that actually sampled peakMemory: **98.1 MB** (vs ffmpeg-wasm/remotion not sampling memory at all here). For a tiny PCM resample, mediabunny's per-sample JS-orchestrated lockstep pipeline carries more overhead than ffmpeg's single in-wasm swresample call. remotion-webcodecs (env: `backend:"webcodecs"`, `pipeline:"streaming-backpressure"`, bufferWriter) is correct but slowest at **129.08 ms (77.47x)**, 2.61x slower than the winner.

The one place ffmpeg-wasm is *not* superior is `longtasks` = **19963 ms** — orders of magnitude above mediabunny (3045 ms) and remotion (2059 ms). This reflects the one-time cost of loading/instantiating the monolithic single-thread ffmpeg wasm core and JIT-warming it (the adapter notes it defaults to the single-thread core for stability). That is a fixed startup tax, not per-operation work, and the wall/throughput metrics (which exclude warmup) are what the primaryMetric ranks on; but it is a real caveat for cold-start latency budgets.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on performance only. Same oracle, same correctness (`durationDeltaSec:0`, `audioTracks:1`), but **1.94x slower wall** (95.94 vs 49.40 ms) and **1.94x lower throughput** (104.23x vs 202.43x). Also the highest sampled peakMemory (98.1 MB). No correctness deficiency.
- **remotion-webcodecs@4.0.479** — PASS, lost on performance. Slowest of the three: **129.08 ms / 77.47x realtime**, 2.61x slower wall than the winner. Correctness identical to the others.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — mp4box is an MP4 box parser/segmenter, not a transcoder/resampler; it has no audio DSP capability, so declining is correct, not an under-declaration.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — it is a demuxer only; no resample/encode path exists.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'". Honest NA — the WebCodecs/MediaRecorder platform path cannot author a raw WAV/PCM container as a transcode target, so it correctly declines this specific output shape rather than faking it.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — media-parser is a read-only parser, not an encoder.

## Anti-cheat validation

- Scenario: src/scenarios/audio-dsp/index.ts:90 (`id: 'resample_44k1_to_48k'`). Fixture asset `wav_s16_44k1.wav` — **exists** at fixtures/media/wav_s16_44k1.wav (1.8 MB). ffprobe confirms it is a genuine 44100 Hz / 2ch / pcm_s16le / 10.0s asset — NOT synthetic/empty, and NOT already-48k. The scenario `notes` (line 98) explicitly documents that the source was baked at 44.1k so that "->48k" is a real upsample and not a silent no-op (a prior version that pointed at the already-48k `wav_s16.wav` was a recorded false-pass the dossier fixed). Gating rationale honest.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2165 (`transcode`), with the resample driven by `-ar 48000` at line 2503 and the real wasm invocation `await this.run(args)` at line 2528; output read from FS at line 2529. No canned bytes, no input->output copy, no golden short-circuit, no swallowed error reported as success (failures throw or raise NotApplicableError).
- Gating oracle: src/core/oracles.ts:343 dispatch -> propertyInvariant (3645) -> transcodeOutputMetadataInvariant (3626). It re-probes the produced output via the reference engine (line 3641), and `compareRequestedTrack` (src/core/oracles.ts:3778) asserts `track.sampleRate !== sampleRate` at line 3814 — i.e. it genuinely verifies the WAV's sample rate equals the requested 48000, plus channels (3817), container (3655), and duration tolerance (3661-3677). This is a real probe-and-compare, not a trivially-satisfiable gate.
- Strength note: this is a structural/metadata-exact gate, not bit-exact — by deliberate design (`bitReproducible:false`) because resampler kernels diverge in sample values. So the PASS is REAL but does not assert PCM fidelity of the resampled audio; it asserts the output is correctly-shaped 48k WAV. That keeps it below the bit-exact rung but it is a meaningful, non-loose assertion.
- Measurements plausibility: durationDeltaSec=0 with tol 0.0417s, audioTracks=1 — physically consistent with a clean 10s PCM resample. Plausible.
- Cached: **all three PASS results have cached==true** (reason "cached previous PASS result"). Staleness risk: numbers were reused from a prior run, not re-executed this run; the perf margins (n==1, mad==0) are single-sample and could shift on a re-run. Correctness verdict is robust to this (deterministic metadata probe); the perf ranking is the part exposed to staleness.

Verdict: **REAL** — real 44.1k fixture, genuine libswresample-backed ffmpeg resample, and a meaningful probe-based oracle that actually checks output sampleRate==48000. The only qualifier is that the gate is structural (not bit-exact) by design and the perf-based win rests on cached single-sample numbers.

## Confidence & caveats

Confidence: **medium**. Correctness tie and winner identity are solid (deterministic oracle, honest NAs, verified genuine implementation). The decisive axis is performance, and all PASS bench rows are n==1 / mad==0 / cached==true, so the 1.94x and 2.61x wall margins are single-shot evidence rather than distributions. ffmpeg-wasm also carries a large one-time `longtasks` cold-start cost (19963 ms) that does not affect the wall primaryMetric but matters for first-call latency. If a cold-start-sensitive budget were the criterion, mediabunny (no COOP/COEP requirement, WebCodecs streaming, 3045 ms longtasks) would be the more attractive choice despite the slower steady-state wall.
