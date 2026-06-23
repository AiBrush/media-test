# audio-dsp/downmix_stereo_to_mono

family: audio-dsp | fixture asset: `fixtures/media/wav_s16.wav` (real, 960 KB, PCM s16 stereo) | primaryMetric: wall (median ms) | passCount: 2 / 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **CONTESTED**: two engines PASS (mediabunny@1.48.0 and ffmpeg.wasm@0.12.15). Both pass the identical single gating oracle `property-invariant(transcode-output-metadata)` with `audioTracks: 1`, so correctness strength is comparable; the decision falls to performance.
- Decisive factor: **wall-clock / throughput**. ffmpeg.wasm completes the stereo→mono PCM downmix in `22.540 ms` median vs mediabunny's `126.595 ms`.
- Margin over runner-up: **5.62x faster wall** (126.595 / 22.540) and **5.62x higher real-time throughput** (221.83x vs 39.50x). Both measurements are `n=1` (single sample, mad=0), so the margin is large but rests on one observation — see caveats.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 22.540 | 221.83 | 0 (not measured) | 19963 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 126.595 | 39.50 | 0 (not measured) | 12909 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'downmix' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a **stereo → mono channel downmix on raw PCM s16 inside a WAV container** (`asset: wav_s16.wav`, `outContainer: wav`, `opts.audio = { codec: 'pcm-s16', channels: 1 }`, scenario `src/scenarios/audio-dsp/index.ts:113-123`). There is no compressed codec involved — the input is uncompressed LPCM in a RIFF/WAVE container — so there is no opportunity for hardware-accelerated codec offload to help anyone. The cost is purely: parse RIFF, run the L/R averaging matrix over every sample, write RIFF back.

**ffmpeg.wasm's path is a single, tight transcode.** Its adapter emits `-ac 1` (`src/engines/ffmpeg-wasm/adapter.ts:2504`, `args.push('-ac', String(a.channels))`) which hands the channel reduction to libswresample's built-in downmix matrix inside one ffmpeg invocation. For PCM in/out this is a straight in-memory pass: demux WAV → swr downmix to 1 channel → mux WAV, all in the wasm core with no decoder/encoder negotiation. Result: `wall median 22.540 ms`, `throughputRealtime 221.83x`. The gating oracle reference-probed the produced bytes and confirmed `container = wav`, exactly one audio track, channel count = 1 (asserted by `compareRequestedTrack`, `src/core/oracles.ts:3817`), and a duration delta of **0.0000 s** against a tolerance of `0.041667 s` (`durationDeltaSec: 0`, `durationToleranceSec: 0.041666…`). A delta of literally zero is physically plausible for a sample-exact PCM reformat where the sample count is unchanged.

**mediabunny is correct but ~5.6x slower for this particular shape.** Its conversion adapter maps `audio.channels` to `numberOfChannels = 1` on the mediabunny `ConversionAudioOptions` (`src/engines/mediabunny/adapter.ts:683`). Because the requested channel count differs from the source, mediabunny cannot take its lossless audio *copy* fast-path (the copy path requires same params and `!trackOptions.bitrate`, documented at `src/engines/mediabunny/adapter.ts:662-670`); it must run a genuine decode → resample/remix → re-encode pipeline. mediabunny ran on the `webcodecs` backend with `hwAccel: prefer-hardware` and `pipeline: streaming-lockstep` (env.configUsed), but WebCodecs confers **no advantage on raw PCM** — there is no hardware audio codec to offload to, so the streaming-lockstep orchestration plus its f32 sample-processing pipeline is pure overhead relative to ffmpeg's monolithic swr call. Its oracle outcome is equally clean (`audioTracks: 1`, `durationDeltaSec: 2.08e-5 s`, well within the `0.041667 s` band), so mediabunny loses purely on `wall 126.595 ms` vs `22.540 ms`.

The `longtasks` counters (mediabunny 12909 ms, ffmpeg 19963 ms) do not differentiate the engines meaningfully here: both report near-identical `durationMs` (~3.95 s wall including harness setup) and these aggregate long-task figures are not the primaryMetric. `peakMemory` is `0`/not-sampled for both, so it cannot break the tie either. The clean, repeated metric is wall/throughput, and there ffmpeg.wasm wins by 5.62x.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed correctly (same oracle, `audioTracks:1`, `durationDeltaSec 2.08e-5 s`) but lost on performance: `wall 126.595 ms` is **5.62x slower** than ffmpeg.wasm's `22.540 ms`; throughput `39.50x` vs `221.83x`. For raw-PCM channel remix its WebCodecs/streaming-lockstep pipeline adds overhead with no codec-offload payoff.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare output container 'wav'". Honest NA — the WebCodecs/`MediaRecorder`-based platform engine has no WAV/RIFF muxer, so it genuinely cannot emit the required output container.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'transcode'". Honest NA — web-demuxer is a demux-only library; transcode/downmix is out of scope.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare operation 'transcode'". Honest NA — mp4box is an MP4 (de)muxer/parser, not a transcoder, and also could not produce WAV.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare feature 'downmix'". Honest NA — the engine declares transcode but not the `downmix` feature this scenario requires (`features: ['downmix']`); not an under-declaration given it has no PCM channel-remix path.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'transcode'". Honest NA — media-parser is a parse/probe library, not a transcoder.

## Anti-cheat validation

- Scenario definition: `src/scenarios/audio-dsp/index.ts:113-123` (`id: 'downmix_stereo_to_mono'`, `asset: 'wav_s16.wav'`, `features: ['downmix']`, `opts.audio.channels: 1`, `bitReproducible: true`, notes: "Stereo->mono downmix (defined L/R average); PCM digest reproducible vs golden.").
- Fixture: `fixtures/media/wav_s16.wav` exists and is a real 960 KB PCM s16 stereo WAV (verified via stat). Not synthetic/empty/mock. Golden metadata present at `fixtures/golden/wav_s16.wav.meta.json`.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2503-2504` builds the real transcode argv and emits `-ac 1` to libswresample inside a genuine ffmpeg.wasm `run()` call, then `readBinary(outName)` returns produced bytes. No canned output, no input→output copy fake, no short-circuit to a golden file, no swallowed-error-then-report-success.
- Gating oracle: `src/core/oracles.ts:3631-3708` (`property-invariant` / `transcode-output-metadata`). It reference-probes the produced bytes with the reference engine and asserts container, duration-within-tolerance, audio-track presence, and (via `compareRequestedTrack`, line 3817) `channels == 1`. So it does verify a real downmix happened (output is genuinely 1 channel, not a passthrough) and that duration is invariant.
- **Verdict: WEAK-GATE.** The PASS is real (real fixture + real swr downmix + a meaningful container/track/channel/duration check), but the oracle is a *metadata-shape* proxy, not a content check. Despite the scenario declaring `bitReproducible: true` and promising a "PCM digest reproducible vs golden", the suite has **no decoded-PCM oracle wired for these conversion cases** — `conversionOracles()` returns only `['property-invariant']` (`src/scenarios/audio-dsp/index.ts:288-295`), and the header comment (lines 288-292) states the `bitReproducible` flag "remains as documentation for the future PCM-digest oracle; it does not drive a guaranteed-failing oracle today." Consequently the *actual L/R averaging math* (correct mono mixdown coefficients, LSB rounding) is NOT verified against the golden — an engine that emitted a single channel with wrong mix coefficients would still PASS. The winner's measurement (`durationDeltaSec 0`) is physically plausible and there is no evidence of cheating, so this is not CHEAT/SUSPECT; it is a loose gate.
- Cached note: both PASS results have `cached: true` ("cached previous PASS result"). The numbers were reused, not freshly re-run in this batch, so the 5.62x margin carries staleness risk and reflects the engines/fixtures at cache time.

## Confidence & caveats

- Confidence: **medium**. The winner and ranking are unambiguous on the recorded metrics, the fixture is real, and the winning code path is genuinely implemented.
- The performance margin (5.62x) rests on `n=1` samples for both engines (mad=0, single sample), which is weak statistical evidence — a single timing each. Both results are `cached:true`, adding staleness risk.
- The gating oracle is metadata-shape only; the promised PCM-digest correctness check is not implemented, so neither winner's mono mixdown *math* was validated — the win is on speed of a structurally-correct downmix, not proven bit-exact mixdown.
- `peakMemory` was not sampled (0/n=0) for either engine, so memory could not be used as a tiebreaker.
