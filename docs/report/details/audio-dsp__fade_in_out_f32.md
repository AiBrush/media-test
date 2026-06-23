# audio-dsp/fade_in_out_f32

- family: audio-dsp | fixture asset: `fixtures/media/wav_f32.wav` (1.9 MB, real PCM f32 WAV) | primaryMetric: wall (no explicit override; first of metrics `['wall','throughputRealtime','peakMemory','longtasks']`) | passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **CONTESTED**: two engines PASS — `ffmpeg-wasm` and `mediabunny`. Both pass the *same single* oracle (`property-invariant` / transcode-output-metadata) with *identical* measurements (`durationDeltaSec=0`, `durationToleranceSec=0.041666…`, `audioTracks=1`). Correctness strength is therefore a tie, so the decision falls to performance.
- Decisive factor: **wall-clock median**. ffmpeg-wasm 31.54 ms vs mediabunny 41.85 ms → **1.33x faster wall**, and **1.33x higher throughputRealtime** (158.53x vs 119.47x realtime). Margin caveat: both are single-sample runs (`n=1`, `mad=0`), so this is weak statistical evidence, and mediabunny actually *wins* the main-thread-blocking metric (`longtasks` 3045 ms vs ffmpeg 5077 ms = mediabunny 0.60x). Since the primary metric is wall, ffmpeg-wasm takes it, but the win is narrow and the metric choice is load-bearing — see caveats.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 31.54 ms | 158.53x | 0 (not sampled) | 5077 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 41.85 ms | 119.47x | 0 (not sampled) | 3045 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-f32' |

(peakMemory has `n=0`/empty samples for both PASS engines — the metric was not collected on this run, so it is not usable as a tiebreaker.)

## Why the winner wins (deep technical)

The operation is a pure-PCM DSP transform inside a WAV container: take `wav_f32.wav` (linear PCM, 32-bit float, no codec), apply a deterministic linear fade-in over the first 1 s and fade-out over the last 1 s (a per-sample multiply by `clamp(t/inSec)` then `clamp((dur-t)/outSec)`), and re-emit WAV f32. There is no entropy-coded bitstream involved — the entire cost is sample-array math plus RIFF wrapping. That framing is why both audio-capable transcoders pass and why the differentiator is raw sample-loop throughput, not codec correctness.

ffmpeg-wasm expresses the fade as a native filtergraph string. `src/engines/ffmpeg-wasm/adapter.ts:2481-2498` builds `-af afade=t=in:st=0:d=1:curve=tri` (linear maps to ffmpeg's `tri`) and `afade=t=out:st=<dur-1>:d=1`. The fade-out branch at `adapter.ts:2495-2498` requires a known input duration and throws `NotApplicableError` otherwise, so the duration probe is genuinely consumed (not faked). The envelope therefore runs inside libavfilter compiled to wasm — a tight, vectorizable C loop over the f32 plane — and the WAV remux is libavformat's RIFF muxer. On the M1 Max wasm build this lands at **31.54 ms wall / 158.53x realtime**: the per-sample multiply is essentially memory-bound and the compiled filter wins the inner loop. `'fade'` is a declared feature for this engine (`adapter.ts:1517` `// -af afade`), so the PASS reflects real declared support, not an accidental match.

mediabunny applies the identical mathematical envelope but in TypeScript on the main JS thread. `src/engines/mediabunny/adapter.ts:694-754` (`buildAudioProcess`) returns a `ConversionAudioOptions.process` callback that, per `AudioSample`, copies the f32 plane out (`adapter.ts:719-721`), loops frame-by-frame computing `scale = gain * clamp(t/fadeInSec) * clamp((dur-t)/fadeOutSec)` (`adapter.ts:727-743`), and reconstructs a new `AudioSample` (`adapter.ts:746-752`). It runs under the WebCodecs backend (`env.configUsed.backend="webcodecs"`, `pipeline="streaming-lockstep"`, `coopCoep="not-required"`, `wasmThreads=0`) — but for PCM f32 there is no actual audio codec to hardware-accelerate; the work is the JS `process` loop plus mediabunny's pure-TS WAV writer. That per-sample JS multiply is slower than the compiled afade filter, giving **41.85 ms wall / 119.47x realtime** — 0.75x of ffmpeg's throughput. Mechanistically: same algorithm, but interpreted/JIT'd f32 loop with per-sample object allocation (`new mb.AudioSample` per chunk) versus a compiled SIMD-friendly C loop.

The one place mediabunny leads is `longtasks` (3045 ms vs ffmpeg 5077 ms). ffmpeg.wasm's monolithic wasm transcode is a single long synchronous burst that registers as much more main-thread long-task time, whereas mediabunny's streaming-lockstep chunked pipeline yields more often. For an audio-only batch transcode (no UI to keep responsive in this harness) the primary metric is wall throughput, so this does not overturn the result — but it is the genuine engineering trade-off and the reason the win is "narrow," not "dominant."

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on perf): correctness is a dead tie (same oracle, identical `durationDeltaSec=0`/`audioTracks=1`). It loses the primary wall metric 41.85 ms vs 31.54 ms (1.33x slower) and throughput 119.47x vs 158.53x (0.75x), because its fade envelope is a per-sample TypeScript loop with per-chunk `AudioSample` allocation (`src/engines/mediabunny/adapter.ts:718-752`) rather than a compiled filter. Real second place; it wins `longtasks` (0.60x) but that is not the primary metric here.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — web-demuxer is a demux-only library (libavformat demuxer bindings); it has no encode/DSP path, so declining transcode is correct, not under-declared.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — mp4box.js is an ISOBMFF box parser/segmenter; it cannot decode/process PCM or write WAV.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'". Honest NA — the WebCodecs/Media platform path has no WAV muxer; it cannot emit the required `wav` output container.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — media-parser is a parse/probe library with no transcode/DSP capability.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare audio codec 'pcm-f32'". Plausibly honest — its WebCodecs-routed pipeline targets encoded codecs (AAC/Opus etc.) and does not register raw `pcm-f32`. Mildly notable: it is WebCodecs-based and could in principle pass PCM through, but raw f32 is not a WebCodecs AudioEncoder codec, so declining is defensible rather than a clear under-declaration.

## Anti-cheat validation

- Scenario definition: `src/scenarios/audio-dsp/index.ts:189-208` (`id: 'fade_in_out_f32'`), op `transcode`, input asset `wav_f32.wav`, `features: ['fade']`, `opts.audio.fade = { inSec:1, outSec:1, curve:'linear' }`, `bitReproducible: true`, notes: "Linear fade-in(1s)+fade-out(1s) on f32; deterministic envelope -> reproducible PCM digest."
- Fixture: `fixtures/media/wav_f32.wav` exists and is a real 1.9 MB PCM-f32 WAV (not synthetic/empty/mock). Confirmed via `stat`.
- Oracle: `property-invariant` (which=`transcode-output-metadata`), `src/core/oracles.ts:3631-3707`. It reference-probes the produced bytes, asserts the output container, asserts duration within a tolerance band (here `durationDeltaSec=0` ≤ `0.041666 s`), and asserts the requested track shape (`audioTracks=1`).
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2481-2498` (real `afade` filtergraph construction) and `adapter.ts:1517` (declared `fade` feature). The fade is genuinely implemented as libavfilter `afade` — no canned output, no input→output copy, no golden short-circuit; the fade-out path even throws when duration is unknown (`adapter.ts:2495-2498`).
- Verdict: **WEAK-GATE**. The implementation and fixture are real, and the PASS reflects a genuine transcode. BUT the only oracle that gated this scenario is metadata-only. The scenario is flagged `bitReproducible: true` with a deterministic, golden-encodable PCM envelope, yet `conversionOracles()` returns *only* `['property-invariant']` and the in-file comment is explicit (`src/scenarios/audio-dsp/index.ts:288-296`): "The current suite has no decoded-PCM oracle … The `bitReproducible` flag remains as documentation for the future PCM-digest oracle; it does not drive a guaranteed-failing video-frame oracle today." Consequence: the oracle checks container=wav, duration preserved, and 1 audio track — all of which a **no-op pass-through transcode that never applied the fade envelope would also satisfy** (a fade preserves duration and track count exactly). The gate therefore cannot distinguish "fade correctly applied" from "fade silently dropped." It is not a CHEAT (no faked data; the adapters do build real fade pipelines), but the correctness gate is far weaker than the scenario's `bitReproducible` intent implies.
- Cached note: BOTH PASS results have `cached==true` ("cached previous PASS result"; ffmpeg startedAt 2026-06-22T14:06, mediabunny 2026-06-22T13:59). Numbers were reused, not freshly re-run — staleness/seeding risk applies, and the per-engine timing comparison rests on cached single-sample runs.

## Confidence & caveats

- Confidence: **medium**. The NA_ENGINE rationales are all honest, the two-way PASS is unambiguous, and the perf ordering on the primary metric (wall) is clear directionally.
- Caveats that weaken it: (1) the gate is a metadata-only WEAK-GATE — neither engine's fade *correctness* (the actual envelope samples) was verified, only output shape/duration; (2) both PASS rows are `n=1, mad=0` single samples → the 1.33x wall/throughput margin is fragile; (3) the loser (mediabunny) actually wins `longtasks` 0.60x, so under a responsiveness-weighted metric the winner could flip; (4) `peakMemory` was not sampled (`n=0`) for either engine, removing a tiebreaker; (5) both results are cached, so the comparison is of reused, not fresh, measurements.
