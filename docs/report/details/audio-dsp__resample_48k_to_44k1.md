# audio-dsp/resample_48k_to_44k1

family: audio-dsp | fixture asset: `fixtures/media/wav_s16.wav` (real 48 kHz / stereo / PCM s16 WAV, 960044 bytes ≈ 5 s) | primaryMetric: throughputRealtime (also wall/peakMemory/longtasks) | passCount: 3 of 7

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** — **CONTESTED** (3 engines PASS: ffmpeg-wasm, mediabunny, remotion-webcodecs).

All three passing engines clear the **identical** correctness gate (one `property-invariant` / `transcode-output-metadata` oracle, all passed), so correctness strength is a tie. The decisive factor is therefore **performance**: ffmpeg-wasm has the lowest wall median and highest realtime throughput, and also the lowest main-thread blocking (longtasks).

Margin over runner-up (mediabunny): **1.51x faster wall** (35.795 ms vs 53.900 ms), **1.51x higher throughput** (139.68x vs 92.76x realtime), and **3.32x less main-thread blocking** (263 ms vs 874 ms longtasks). Over the third engine remotion-webcodecs the gap is larger: **3.93x faster wall** (35.795 ms vs 140.790 ms) and **16.8x less blocking** (263 ms vs 4410 ms longtasks). Caveat: every metric is n==1, so margins are point estimates, not distributions.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 35.795 | 139.684 | (n=0, unmeasured) | 263 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 53.900 | 92.764 | (n=0, unmeasured) | 874 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true | 140.790 | 35.514 | 99,973,478 | 4410 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a sample-rate conversion of linear PCM: read a 48 kHz / 16-bit / stereo `WAVE`/`fmt `+`data` RIFF file and re-author it as a 44.1 kHz / pcm-s16 WAV. There is no codec bitstream to decode/encode here — the byte payload is uncompressed PCM — so the only real work is (a) interpreting the RIFF header, (b) DSP resampling from 48000 to 44100 (a non-integer 160:147 ratio that forces a polyphase / windowed-sinc interpolation, not a trivial decimation), and (c) re-emitting a RIFF container with the new `fmt ` sample-rate field and a `data` chunk sized for the new frame count. Because two different resamplers produce different PCM (different filter kernels), the scenario sets `bitReproducible:false` (src/scenarios/audio-dsp/index.ts:84) and the gate is a structural/duration invariant rather than a PCM bit-digest.

ffmpeg-wasm runs this entirely in a single WebAssembly module (libavformat WAV demuxer → libswresample → WAV muxer). For PCM at ~960 KB the wasm path is dominated by one contiguous compute burst with no per-sample JS marshalling and no WebCodecs round-trip. That shows up directly in the shard: wall median **35.795 ms** at **139.684x realtime**, and a single **263 ms** longtask — the lowest blocking of the three. ffmpeg's resample/mux is a tight native loop, so even though it is single-threaded wasm (no SharedArrayBuffer / no COOP-COEP requirement for this row), it beats the JS-orchestrated alternatives on a payload this small.

mediabunny (env.configUsed.backend `webcodecs`, `coreBuild:pure-ts-esm`, `coopCoep:not-required`, `wasmThreads:0`) is also genuine: its adapter drives the real `Conversion.init/execute` API (src/engines/mediabunny/adapter.ts:848-855 `runConversion`), and `buildAudioOptions` sets `opts.sampleRate = 44100` (src/engines/mediabunny/adapter.ts:682), letting mediabunny's own audio resampler do the 48k→44.1k conversion. It is correct and fast (53.900 ms, 92.764x) but its pure-TS DSP/orchestration carries more per-sample overhead than ffmpeg's native wasm loop, leaving it **1.51x** behind on wall and throughput and **3.32x** behind on longtasks (874 ms). Note: because no `gain`/`fade` is requested, mediabunny does NOT take the `forceTranscode`+`process` callback path (src/engines/mediabunny/adapter.ts:685-690) — the resample is requested via `opts.sampleRate` alone.

remotion-webcodecs is the slowest of the three by a wide margin: 140.790 ms wall, 35.514x realtime, a 4410 ms longtask, and ~100 MB peak memory (the only engine that reported peakMemory). Its WebCodecs-centric pipeline (`pipeline:streaming-backpressure`, `bufferWriter`) is built for compressed A/V transcodes where hardware decode/encode pays off; for an uncompressed-PCM resample there is no codec to accelerate, so the WebCodecs scaffolding is pure overhead — hence the 16.8x longtask penalty vs ffmpeg.

The gate every winner cleared is `transcodeOutputMetadataInvariant` (src/core/oracles.ts:3626-3708): it reference-probes the produced bytes and checks container == `wav`, audio track count == 1, the requested audio codec (`pcm-s16`) and the requested `sampleRate` (44100 via `compareRequestedTrack`, src/core/oracles.ts:3814-3816), plus duration within tolerance. The shard measurements are physically sane: durationToleranceSec **0.041666…s** (one 24 fps frame) with durationDeltaSec ffmpeg **0**, mediabunny **0.0000227 s**, remotion **0.00283 s** — all far inside tolerance, and the near-zero deltas are exactly what an honest 5 s→5 s resample should yield. ffmpeg's reported delta of 0 is consistent with libavformat writing a `data` chunk whose frame count reproduces the source duration to probe precision.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSED, lost on speed only: 53.900 ms vs 35.795 ms (1.51x slower wall), 92.764x vs 139.684x (1.51x lower throughput), 874 ms vs 263 ms longtasks (3.32x more main-thread blocking). Correctness identical (same single property-invariant pass, durationDelta 0.0000227 s).
- **remotion-webcodecs@4.0.479** — PASSED, lost decisively on speed: 140.790 ms (3.93x slower than ffmpeg), 35.514x throughput (lowest), 4410 ms longtask (16.8x ffmpeg), and ~99.97 MB peak memory. WebCodecs pipeline overhead is wasted on an uncompressed-PCM resample.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'". Honest NA — the browser MediaRecorder/WebCodecs muxers do not emit RIFF/WAV, so it genuinely cannot satisfy `outContainer:'wav'`.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — mp4box.js is an ISOBMFF (de)muxer, not a transcoder/resampler; it has no DSP path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — it is a parser/demuxer only, no encode/resample capability.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — it is a demux-only wasm wrapper, no transcode/resample path.

## Anti-cheat validation

- **Scenario definition**: src/scenarios/audio-dsp/index.ts:76-86 (`id: 'resample_48k_to_44k1'`). Declares `asset:'wav_s16.wav'`, `container:'wav'`, `audioCodecs:['pcm-s16']`, `outContainer:'wav'`, `features:['resample']`, `opts:{container:'wav', audio:{codec:'pcm-s16', sampleRate:44100}}`, `bitReproducible:false`. Notes: "Downsample 48k->44.1k; assert output sample rate + duration invariance (5s in, 5s out)."
- **Fixture**: `fixtures/media/wav_s16.wav` EXISTS, 960044 bytes. Header verified real: `RIFF`…`WAVE`/`fmt `, channels=2, bits=16, sample rate = 0x0000BB80 = **48000 Hz**, `data` chunk present. This is a genuine 48 kHz source (so 48k→44.1k is a real conversion, not a no-op).
- **Oracle**: src/core/oracles.ts:3626 `transcodeOutputMetadataInvariant` (dispatched from `propertyInvariant` at src/core/oracles.ts:2650-2651). It re-probes the produced output with the reference engine and asserts container, audio track count, codec, requested sampleRate (44100; src/core/oracles.ts:3814-3816), and duration within band — a real comparison against the produced bytes, not trivially satisfiable.
- **Winner adapter**: src/engines/ffmpeg-wasm/adapter.ts (real ffmpeg.wasm transcode entry; PCM→swresample→WAV mux). mediabunny cross-check: src/engines/mediabunny/adapter.ts:682 (`opts.sampleRate = 44100`) and :848-855 (`runConversion` calls real `Conversion.init/execute`), confirming the resample is library-driven, not faked.
- **Verdict: WEAK-GATE.** The implementation, fixture, and oracle are all REAL and the measurements are physically plausible, BUT the single gating oracle is a structural/metadata + duration invariant (`property-invariant`), not a PCM bit/perceptual comparison. It confirms the output IS a 44.1 kHz pcm-s16 WAV of the right duration with one audio track; it does NOT verify the resampled samples are DSP-correct (no audio-pcm-digest, no SSIM/PSNR equivalent for audio). This is the intended design — `bitReproducible:false` because resamplers legitimately differ — but it means a PASS proves "produced a well-formed downsampled WAV of correct shape/duration," not "produced spectrally-correct audio." That is a real-but-loose gate, hence WEAK-GATE rather than REAL.
- **Cached note**: ALL three passing results have `cached==true` ("cached previous PASS result"). Numbers were reused, not freshly re-run; staleness risk applies to both the PASS verdicts and the timing margins. Per the launcher-seeding caveat, clear raw + .browser-cache for an honest fresh run before trusting these as final.

## Confidence & caveats

- Confidence: **medium**. The winner ordering (ffmpeg > mediabunny > remotion) is consistent across wall, throughput, and longtasks, so the ranking is robust; but every metric is **n==1** (mad=0, p95==median), so the exact ratios are point estimates with no spread, and all three are cached.
- The gate is structural/duration-only (WEAK-GATE): correctness among the three winners is genuinely indistinguishable at this oracle, so the contest is decided purely on performance. A future audio-pcm-digest or spectral oracle could separate them on fidelity.
- peakMemory is unmeasured (n=0) for ffmpeg-wasm and mediabunny, so the memory dimension could only be compared via remotion's ~100 MB figure; it was not part of the decisive comparison.
