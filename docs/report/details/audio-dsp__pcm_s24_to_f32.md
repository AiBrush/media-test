# audio-dsp/pcm_s24_to_f32

- family: audio-dsp
- fixture asset: `fixtures/media/wav_s24.wav` (1.4 MB, exists on disk)
- operation: `transcode` (WAV pcm_s24le -> WAV pcm_f32le), outContainer `wav`
- primaryMetric: wall (median, ms)
- oracle(s): `property-invariant` with `invariant: 'transcode-output-metadata'`
- passCount: 2 of 7 (ffmpeg.wasm, mediabunny)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (`ffmpeg-wasm`).
- Contested: YES — two engines PASS (ffmpeg-wasm and mediabunny), both satisfy the identical gating oracle with identical correctness measurements.
- Decisive factor: **PERFORMANCE** (correctness is a tie at the single `property-invariant`/transcode-output-metadata gate). ffmpeg-wasm wins on the primary metric `wall`: 14.52 ms median vs mediabunny 32.78 ms.
- Margin over runner-up: **~2.26x faster wall** (32.78 / 14.52), and identically **~2.26x higher throughputRealtime** (344.35x vs 152.53x realtime). Both samples are n==1, cached, so the margin is a single-shot observation (weak statistical evidence — see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 14.52 ms | 344.35x | n/a (n=0 samples, 0 bytes) | 179 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 32.78 ms | 152.53x | 38,989,072 B (~37.2 MiB) | 4924 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-f32' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |

## Why the winner wins (deep technical)

This scenario is a pure PCM sample-format conversion: it ingests `wav_s24.wav` (24-bit signed little-endian PCM in a RIFF/WAVE container) and writes a WAV whose audio codec is 32-bit IEEE float (`pcm_f32le`). There is no perceptual codec, no MDCT, no entropy coding — the operation is `sample/8388608.0`-style normalization of every 24-bit sample to a float in [-1,1], re-wrapped in a RIFF header (fmt chunk format tag 3 / WAVE_FORMAT_IEEE_FLOAT). Because both viable engines do exactly that arithmetic, correctness is identical and the contest collapses to throughput.

ffmpeg-wasm performs the conversion through a real FFmpeg invocation. The transcode path in `src/engines/ffmpeg-wasm/adapter.ts:2165` (`async transcode`) writes the input to the in-memory FS, probes it via `runInfo`, then builds an FFmpeg arg list. The audio branch maps the requested codec token to a real encoder name and emits `-c:a` for it: `src/engines/ffmpeg-wasm/codecs.ts:42` maps `'pcm-f32' -> 'pcm_f32le'` (and `'pcm-s24' -> 'pcm_s24le'` on the input side), and the adapter pushes `-c:a pcm_f32le` (adapter audio branch around `src/engines/ffmpeg-wasm/adapter.ts:2461`, `if (enc) args.push('-c:a', enc)`), then `readBinary(outName)` returns the produced WAV (`src/engines/ffmpeg-wasm/adapter.ts:2257-2258`). PCM->PCM in FFmpeg is a single libavcodec sample-format conversion (no encoder search, no rate control), which is why wall is only 14.52 ms and throughput is 344.35x realtime. Notably this adapter defaults to the **single-thread wasm core** (header comment, `src/engines/ffmpeg-wasm/adapter.ts:10`) yet still wins — the PCM workload is so light that thread parallelism is irrelevant and the lighter setup/teardown of the simple exec dominates.

mediabunny PASSes too and is correct, but ~2.26x slower (32.78 ms wall). Its env shows `backend: webcodecs`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`. For this PCM conversion it routes through its Conversion API; `buildAudioOptions` (`src/engines/mediabunny/adapter.ts:672`) maps the codec via `canonicalToMediabunnyAudio` (`'pcm-f32' -> 'pcm-f32'`, `src/engines/mediabunny/codecs.ts:104`) and sets `numberOfChannels`/`sampleRate` from the request. Because no gain/fade `process` is requested here, it does NOT set `forceTranscode`/`sampleFormat='f32'`/`process` (that branch at `adapter.ts:686-690` only fires for DSP cases like fade), so it takes the streaming decode->re-encode lockstep path through its read/decode/encode/mux pipeline. That pipeline carries more per-sample JS/object overhead (AudioSample wrapping, BufferTarget muxing) than FFmpeg's tight C sample-format conversion, which is consistent with both the 2.26x wall gap and the very different memory/longtask profiles: mediabunny reports peakMemory 38,989,072 B (~37.2 MiB) and 4924 ms of longtasks, whereas ffmpeg-wasm reports 179 ms of longtasks and no captured peakMemory (n=0). The longtask gap (4924 ms vs 179 ms) is the clearest mechanistic signal that mediabunny's JS lockstep pipeline keeps the main thread busy far longer for the same audio.

The gating oracle is `transcodeOutputMetadataInvariant` (`src/core/oracles.ts:3626`, reached from `propertyInvariant` at `src/core/oracles.ts:2650`). It reference-probes the produced bytes and asserts: container equals requested (`wav`), the requested audio track shape is present, and duration is preserved within a per-container tolerance. Both engines record identical measurements: `durationDeltaSec: 0`, `durationToleranceSec: 0.041666...` (1/24 s), `audioTracks: 1`, detail "wav, 1 track(s) match requested output shape". Both produced a real WAV with exactly one audio track and zero duration drift — a genuine, equal pass.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed correctly (identical oracle, `durationDeltaSec:0`, 1 audio track) but LOST on performance: 32.78 ms wall vs 14.52 ms (2.26x slower), 152.53x vs 344.35x throughput, and 4924 ms vs 179 ms longtasks. Its streaming-lockstep webcodecs/JS pipeline carries higher per-sample overhead than FFmpeg's native PCM sample-format conversion for this trivial s24->f32 reformat.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — web-demuxer is a demux/probe library with no encode/mux path, so it cannot author a WAV output.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — mp4box is an ISOBMFF (MP4) box parser/segmenter; it has no audio transcode and no WAV writer.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — it is a parser/probe engine, not an encoder.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare audio codec 'pcm-f32'". Plausibly honest — WebCodecs `AudioEncoder` exposes no raw `pcm-f32` codec string (PCM is uncompressed, not a WebCodecs-registered encoder), so a WebCodecs-backed transcoder genuinely cannot target pcm_f32le. Not an under-declaration.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'". Honest NA — the browser platform path (MediaRecorder/WebCodecs muxers) does not emit RIFF/WAVE; it produces webm/mp4. No WAV writer exists, so it cannot produce the required output container.

## Anti-cheat validation

- Scenario definition: `src/scenarios/audio-dsp/index.ts:241-250` (case `id: 'pcm_s24_to_f32'`, `asset: 'wav_s24.wav'`, `outContainer: 'wav'`, `opts.audio.codec: 'pcm-f32'`, `bitReproducible: true`, notes "24-bit -> f32 normalization; tests full-range 24-bit sample handling."). Scenario factory at `src/scenarios/audio-dsp/index.ts:298` injects `invariant: 'transcode-output-metadata'`.
- Fixture: `fixtures/media/wav_s24.wav` exists (1.4 MB on disk) — a REAL RIFF/WAVE 24-bit PCM file, not synthetic/empty/mock.
- Gating oracle: `transcodeOutputMetadataInvariant` at `src/core/oracles.ts:3626` (dispatched at `src/core/oracles.ts:2650`). It reference-probes the produced bytes (real probe via reference engine), checks container == requested, requested audio-track shape present, and duration within tolerance. It is a metadata/property invariant, NOT a bit-exact PCM-digest comparison — it does NOT decode-and-compare samples against a golden, so it cannot catch a wrong-but-well-shaped PCM payload.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2165` (`transcode`) -> codec map `src/engines/ffmpeg-wasm/codecs.ts:42` (`pcm-f32 -> pcm_f32le`) -> real `ff.exec` with `-c:a pcm_f32le` -> `readBinary(outName)` (`adapter.ts:2257`). This is a genuine FFmpeg call; it does NOT return canned bytes, copy input->output, or short-circuit to a golden. No golden WAV exists for this case (only AIFF goldens are baked under `fixtures/golden/`), so a golden short-circuit is structurally impossible.
- Verdict: **WEAK-GATE**. Implementation and fixture are real and the PASS is genuine, but the oracle is a metadata/duration invariant (container=wav, 1 audio track, durationDelta 0 within 1/24 s), not the bit-exact PCM-digest comparison that the scenario's own `bitReproducible: true` and notes ("normalization; exact") imply should ideally gate it. The scenario file itself (`src/scenarios/audio-dsp/index.ts:288-292`) documents that no decoded-PCM oracle is wired yet and that `bitReproducible` does not currently drive a gate. So the sample math (s24 -> f32 normalization correctness) is asserted only structurally, not numerically — a real but not strong gate.
- Cached note: BOTH PASS results have `cached: true` (reason "cached previous PASS result"). They were reused, not re-run in this pass; the bench numbers (wall, throughput, memory, longtasks) are from a prior run and carry staleness risk. Per-engine n==1 means the 2.26x margin is a single-shot measurement.

## Confidence & caveats

- Confidence: MEDIUM. The ranking is unambiguous (only 2 PASS, identical correctness, winner is 2.26x faster on the primary metric and on throughput, with a large longtask gap), and the winner's code path is verified real. But: (1) both winners are cached (stale-risk), (2) all bench samples are n==1 with mad==0, so the performance margin lacks variance evidence, (3) the gate is a metadata invariant, not a PCM-digest — neither engine's actual sample normalization is bit-verified, so a subtle s24->f32 rounding bug would not be caught. ffmpeg-wasm's peakMemory was not captured (n=0), so the memory comparison is one-sided (mediabunny ~37.2 MiB recorded).
