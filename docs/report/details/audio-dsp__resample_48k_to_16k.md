# audio-dsp/resample_48k_to_16k

family: audio-dsp | fixture asset: `fixtures/media/wav_s16.wav` (real, ~960 KB, 48 kHz s16 stereo WAV) | primaryMetric: throughputRealtime (x-realtime; family headline is framesPerSec/throughput) | passCount: 3 of 7

Operation: aggressive PCM downsample 48 kHz -> 16 kHz, output container `wav`, output codec `pcm-s16`. Scenario `bitReproducible: false`; notes say "format + duration assertion only", so the gate is a structural/metadata invariant, NOT a PCM-content comparison.

## Verdict

Best framework: **remotion-webcodecs@4.0.479** (CONTESTED — 3 engines PASS).

Decisive factor: correctness is identical across all three PASS engines (they all satisfy the same single `property-invariant` / `transcode-output-metadata` oracle with no diffs), so the tie breaks on PERFORMANCE. remotion-webcodecs leads on both the headline throughput axis and wall time:
- throughputRealtime 148.02x vs mediabunny 136.67x (**1.08x**) vs ffmpeg.wasm 123.70x (**1.20x**).
- wall median 33.78 ms vs mediabunny 36.59 ms (**1.08x faster**) vs ffmpeg.wasm 40.42 ms (**1.20x faster**).

Margin over runner-up (mediabunny): 1.08x on both throughput and wall. This is a NARROW win on n==1 cached samples — see caveats. Counter-signal: remotion-webcodecs incurs 3391 ms longtasks vs mediabunny/ffmpeg 1017 ms (**3.3x more** main-thread blocking), so if main-thread responsiveness were the headline, mediabunny would win.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | property-invariant:pass | 33.78 ms | 148.02x | 0 (not sampled) | 3391 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass | 36.59 ms | 136.67x | 0 (not sampled) | 1017 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 40.42 ms | 123.70x | 0 (not sampled) | 1017 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

(peakMemory has n==0 samples for every engine — not instrumented this run.)

## Why the winner wins (deep technical)

The operation is a sample-rate conversion on raw linear PCM (s16) inside a RIFF/WAVE container: read 48000 Hz interleaved s16 stereo, run a polyphase/anti-alias resampler to 16000 Hz, and re-author a WAV header. There is no video, no inter-frame coding, no AAC/Opus bitstream — the codec is uncompressed PCM, so the bottleneck is purely the resample arithmetic plus container I/O, and the differentiator between engines is the audio pipeline backend and how much work crosses the main thread.

All three PASS engines satisfy the SAME oracle. The gate is `propertyInvariant` -> `transcodeOutputMetadataInvariant` (src/core/oracles.ts:2650-2651, 3626-3708). It probes the produced output with the reference engine and checks three things: container == `wav` (3655-3657), duration within the per-container tolerance band (3659-3680), and the requested audio track shape via `compareRequestedTrack` (3692-3700, 3778-3821). Critically, `compareRequestedTrack` DOES enforce `track.sampleRate === 16000` (oracles.ts:3814-3816) and channels — so a PASS means the output WAV genuinely reports 16 kHz, not a silent no-op at 48 kHz. The shard measurements bear this out: mediabunny durationDeltaSec 6.25e-05 s (one 16 kHz sample-frame of rounding), remotion-webcodecs and ffmpeg durationDeltaSec exactly 0, all under the 0.041667 s (= 1/24) tolerance, audioTracks: 1. These numbers are physically plausible for a 5 s clip resampled to 16 kHz.

remotion-webcodecs ran on `backend: webcodecs`, `hwAccel: prefer-hardware(+software fallback)`, `pipeline: streaming-backpressure`, `writer: bufferWriter`, `wasmThreads: 0`, `worker: convert=main-thread` (shard env.configUsed). For an audio-only WAV resample there is no GPU work to offload, so the throughput win comes from the streaming-backpressure pipeline and a lean buffer writer driving the AudioData/resample path with minimal copies, giving the best end-to-end ratio at 148.02x realtime / 33.78 ms wall. The cost of doing the convert on the main thread shows up as the 3391 ms longtasks figure — the resample loop blocks the main thread far longer than the workerized competitors even though total wall is lower.

mediabunny is the close runner-up. Its adapter genuinely drives the resample: `transcode()` (src/engines/mediabunny/adapter.ts:1271-1322) opens the input, builds `ConversionAudioOptions` via `buildAudioOptions` (660-692), which forwards `opts.sampleRate = a.sampleRate` (i.e. 16000) at line 682 straight into mediabunny's `Conversion`, and only sets `forceTranscode`/`process` when a gain/fade DSP is requested (685-690) — none here, so the resample is mediabunny's own native conversion, not a hand-rolled hack. It declares the `resample` capability against `ConversionAudioOptions.sampleRate` (adapter.ts:1063). It runs `backend: webcodecs`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false`, `wasmThreads: 0`. mediabunny's main-thread cost is far lower (1017 ms longtasks, 3.3x better than the winner) but its wall (36.59 ms) and throughput (136.67x) trail by 1.08x. Decisive gap: the streaming-lockstep pipeline serializes read/convert/write more tightly than remotion's backpressured streaming, costing ~2.8 ms wall.

ffmpeg.wasm is third on every speed axis (40.42 ms wall, 123.70x, 1017 ms longtasks). It produces a correct 16 kHz WAV (durationDeltaSec 0) using libswresample inside the wasm module, but the wasm boundary plus single-thread execution (`wasmThreads: 0` implied; no SAB) makes it 1.20x slower wall than the WebCodecs-backed winner for this trivially small PCM job. Its correctness is identical, so it loses purely on throughput.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on perf): correct 16 kHz WAV, durationDeltaSec 6.25e-05 s. Trails the winner by 1.08x wall (36.59 vs 33.78 ms) and 1.08x throughput (136.67x vs 148.02x). Note: it is strictly BETTER on main-thread jank (1017 ms vs 3391 ms longtasks) — would win on a longtasks-headline metric.
- **ffmpeg.wasm@0.12.15** (PASS, lost on perf): correct 16 kHz WAV via libswresample, durationDeltaSec 0. Slowest of the three at 40.42 ms wall (1.20x slower) and 123.70x throughput; wasm boundary + single thread is the cost.
- **platform@chrome-149** (NA_ENGINE): "does not declare output container 'wav'". Honest NA — the platform transcode path is MediaRecorder-based (src/engines/platform/transcode.ts:4-8, 76-77) and can only mux WebM/MP4; it physically cannot emit a RIFF/WAVE PCM container. Genuine capability gap, not under-declaration.
- **mp4box@2.3.0** (NA_ENGINE): "does not declare operation 'transcode'". Honest — mp4box.js is an MP4 box parser/demuxer/segmenter with no audio resampler or WAV muxer.
- **web-demuxer@4.0.0** (NA_ENGINE): "does not declare operation 'transcode'". Honest — it is a wasm demuxer (packet extraction) only, no encode/resample path.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "does not declare operation 'transcode'". Honest — it is a parser/probe library (metadata + sample tables), no DSP/encode capability.

## Anti-cheat validation

- Scenario definition: src/scenarios/audio-dsp/index.ts:100-110 (id `resample_48k_to_16k`, asset `wav_s16.wav`, opts `{ container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 16000 } }`, features `['resample']`, `bitReproducible: false`).
- Fixture: `fixtures/media/wav_s16.wav` EXISTS (~960 KB, real 48 kHz s16 stereo WAV — confirmed via stat). Not synthetic/empty/mock. The 48k source is genuinely above the 16k target, so the downsample is real work, not a no-op (contrast with the sibling cases the dossier explicitly fixed for no-op sources).
- Oracle: src/core/oracles.ts:3626-3708 (`transcodeOutputMetadataInvariant`), reached via propertyInvariant 2650-2651. It probes the actual produced bytes with the reference engine and enforces container==wav, duration within ±0.041667 s, and (via compareRequestedTrack, 3778-3821, sampleRate check at 3814-3816) the output sampleRate==16000 and channel count. Not trivially satisfiable: a 48 kHz passthrough would FAIL the sampleRate diff. It is NOT a smoke gate and NOT an ssim/exactFrames==0 proxy.
- Winner adapter: src/engines/remotion-media-parser is the parser sibling; the WINNER is remotion-webcodecs (src/engines/remotion-webcodecs). Its transcode runs the real WebCodecs-backed @remotion/webcodecs convert path (env.configUsed.backend=webcodecs, pipeline=streaming-backpressure). Cross-checked the closely related mediabunny adapter (adapter.ts:1271-1322, 682) to confirm the suite drives genuine sampleRate=16000 conversion rather than copying input to output. No canned output, no golden short-circuit, no swallowed error reporting success.
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the sampleRate gate is meaningful, BUT the oracle is metadata/structural only — it verifies the output WAV header claims 16 kHz and the right duration; it does NOT decode the resampled PCM and compare against a golden (scenario is deliberately `bitReproducible: false`, "format + duration assertion only"). So a PASS proves correct re-authoring of rate/duration/container, not anti-alias/resample fidelity. The PASS is genuine but not a strong correctness proof.
- Cached note: ALL three PASS results have `cached: true` ("cached previous PASS result") — reused, not re-run this session. Timing margins (1.08x) are within plausible run-to-run noise for cached n==1 samples; staleness/measurement-noise risk is real.

## Confidence & caveats

Confidence: medium. The winner ordering (remotion-webcodecs > mediabunny > ffmpeg.wasm) is consistent across wall AND throughput, which raises confidence in the direction — but the margin is only 1.08x over mediabunny, every bench metric is n==1 with mad==0 (single sample, no spread), peakMemory was not sampled (n==0), and all three results are cached. A re-run could plausibly reorder remotion-webcodecs and mediabunny. mediabunny is the better choice if main-thread responsiveness matters (3.3x lower longtasks) and avoids COOP/COEP. The gate is metadata-only (WEAK-GATE), so none of these three is proven to produce high-fidelity resampled audio — only correctly-shaped 16 kHz WAV output.
