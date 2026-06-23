# audio-dsp/gain_half_f32

- **Family:** audio-dsp
- **Fixture asset:** `fixtures/media/wav_f32.wav` (1.9 MB, real PCM-f32 WAV — exists)
- **Operation:** `transcode` WAV(pcm-f32) -> WAV(pcm-f32) with `audio.gainLinear = 0.5` (exact 0.5x scale, no quantization on f32)
- **Primary metric:** wall (median ms)
- **passCount:** 2 of 7 (mediabunny, ffmpeg.wasm)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES — two engines PASS (ffmpeg.wasm and mediabunny), both satisfying the identical gating oracle.
- **Decisive factor:** PERFORMANCE. Correctness is *indistinguishable* between the two passers because the only oracle that ran is the metadata-shape `property-invariant(transcode-output-metadata)`, which both pass with identical measurements (`durationDeltaSec:0, audioTracks:1`). The tiebreak therefore falls to the primary metric, wall time.
- **Margin over runner-up (mediabunny):** **2.60x faster wall** (15.78 ms vs 41.02 ms median) and **2.60x higher throughputRealtime** (316.86x vs 121.89x). NOTE: both are `n==1` (single timed sample, `mad==0`), so the margin is suggestive, not statistically robust. Also note ffmpeg's `longtasks` is *worse*: 12909 ms vs mediabunny's 1192 ms (~10.8x more main-thread blocking from the single-thread wasm core), so on a UI-responsiveness tiebreak mediabunny would win.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 15.78 ms | 316.86x | 0 (not sampled) | 12909 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 41.02 ms | 121.89x | 0 (not sampled) | 1192 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-f32' |

## Why the winner wins (deep technical)

This is a pure audio-DSP transcode: read a PCM-float32 WAV, multiply every sample by 0.5, write a PCM-f32 WAV back. There is no demux of a compressed bitstream, no video, and (crucially for f32) no quantization — `sample * 0.5` is exact in IEEE-754 because halving is just an exponent decrement, so the operation is genuinely bit-reproducible (scenario `index.ts:175-187`, `bitReproducible: true`).

**ffmpeg.wasm path.** The adapter maps `audio.gainLinear` directly onto ffmpeg's `volume` filter: `src/engines/ffmpeg-wasm/adapter.ts:2474-2480` builds `volume=0.5` and `:2502` emits `-af volume=0.5`, with `-c:a pcm_f32le` selected via `audioEncoderName` (`:2468-2472`). This is libavfilter's native `volume` filter operating on planar/packed float samples — a real, in-engine multiply, not a copy-through. Because the core is the single-thread wasm build (the adapter defaults to single-thread to avoid SAB/COOP-COEP; see header comment `:10`), the 1.9 MB WAV is processed by hand-tuned C compiled to wasm with no JS-loop overhead, finishing the gain pass in **15.78 ms** at **316.86x realtime**. The cost shows up elsewhere: the synchronous wasm run accrues **12909 ms of longtasks**, i.e. it monopolizes the main thread far more than mediabunny.

**Why ffmpeg edges mediabunny.** mediabunny's adapter implements gain as a JS per-sample callback in `ConversionAudioOptions.process` — `src/engines/mediabunny/adapter.ts:704-741`, where `scale = gain` and `data[base + channel] = data[base + channel] * scale` runs in interpreted/JIT'd JS over every f32 sample. That is correct and equally bit-exact for a 0.5 factor, but a JS sample loop over ~1.9 MB of float data is ~2.6x slower than the compiled libavfilter kernel (**41.02 ms** wall, **121.89x realtime**). The flip side is that mediabunny's streaming pipeline (`pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`, `backend:"webcodecs"` per `env.configUsed`) yields only **1192 ms longtasks** — an order of magnitude friendlier to the UI thread. Since the suite's primary metric for this family is wall time, ffmpeg wins, but the margin is on `n==1` with `mad==0` (no variance estimate), and ffmpeg's win is purely throughput, not responsiveness.

**Correctness caveat.** Neither engine's PASS proves the gain was *actually applied at 0.5*. The gating oracle (`transcode-output-metadata`, `src/core/oracles.ts:3631-3707`) only reference-probes the produced bytes for container == `wav`, duration within tolerance, and audio-track count/shape. Its measurements here are exactly `{durationDeltaSec:0, durationToleranceSec:0.0417, audioTracks:1}` — no PCM digest comparison. The scenario file itself acknowledges this: `index.ts:291` states the `bitReproducible` flag "remains as documentation for the future PCM-digest oracle; it does not drive [the oracle]." So the winner wins a real-but-shallow gate; both passers' DSP code is genuine, but the test would not catch a 1.0x (no-op) gain.

## What each other framework did wrong

- **mediabunny@1.48.0 (PASS, lost):** Correct and bit-exact via real per-sample JS scaling (`adapter.ts:729-741`), but 2.60x slower wall (41.02 ms vs 15.78 ms) and 2.60x lower throughput. Wins the longtasks tiebreak (1192 ms vs 12909 ms) but loses on the primary wall metric.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare operation 'transcode'". Honest NA — mp4box.js is an ISO-BMFF box parser/segmenter; it neither decodes/encodes PCM nor applies audio filters, so it legitimately cannot perform a gain transcode.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare output container 'wav'". Honest NA — the WebCodecs/platform path has no WAV muxer wired; it can decode/encode samples but cannot emit a WAV container for the requested output shape.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'transcode'". Honest NA — remotion's media-parser is a read-only demux/probe library; no encode/filter path exists.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'transcode'". Honest NA — web-demuxer is a demux-only wasm wrapper; no encoder or DSP stage.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare audio codec 'pcm-f32'". Plausibly honest — its codec table is keyed to WebCodecs-registered codecs, and raw PCM-f32 round-tripping is not declared. Mild under-declaration risk (a WebCodecs path could in principle handle raw f32 samples), but consistent with a WebCodecs-bound engine that has no WAV/PCM I/O.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/audio-dsp/index.ts:175-187` (`id: 'gain_half_f32'`), wired into the suite with `invariant: 'transcode-output-metadata'` at `index.ts:305`.
- **Fixture:** `fixtures/media/wav_f32.wav` — REAL file, 1.9 MB, present on disk (`stat` confirmed). Not synthetic/empty/mock. Golden metadata exists (`fixtures/golden/wav_f32.wav.meta.json`).
- **Gating oracle:** `src/core/oracles.ts:3631-3707` (the `transcode-output-metadata` branch of `property-invariant`). It performs a *real* reference-probe of the produced bytes (container, duration vs golden within tolerance, track shape) — it is not trivially always-true (a wrong container, wrong duration, or zero audio tracks would fail it). BUT it is metadata-only: it never compares decoded PCM against a golden, despite the scenario declaring `bitReproducible: true`. The scenario explicitly notes this is by design pending a future PCM-digest oracle (`index.ts:291`).
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2474-2502` — genuinely emits `-af volume=0.5 -c:a pcm_f32le` and runs the real vendored ffmpeg wasm core. No canned output, no input->output copy, no short-circuit to golden, no swallowed errors (it throws `NotApplicableError` on unsupported codecs rather than faking success).
- **Cached note:** ffmpeg's result has `cached: true` ("cached previous PASS result"), as does mediabunny's. Both numbers are reused from a prior run, not freshly measured — staleness risk applies to the bench figures and the PASS itself. Per the launcher-seeding caveat, a truly honest re-run would require clearing the cache.
- **Verdict: WEAK-GATE.** Real fixture + real ffmpeg `volume` implementation + a non-trivial but *shape-only* oracle. The PASS is real, but it does not verify the actual DSP result (gain magnitude / sample values). A no-op (1.0x) or wrong-factor gain would pass identically. This is a genuine-but-weak gate, not a cheat — there is no fabricated data or oracle-that-cannot-fail.

## Confidence & caveats

- **Confidence: medium.** Adapter code paths and the oracle are unambiguous and were read directly; the WEAK-GATE classification is firmly grounded in `oracles.ts:3631-3707` + `index.ts:291`.
- The performance verdict rests on `n==1` samples (`mad==0`, no spread) and `cached:true` for both engines — the 2.60x margin is directionally clear but not statistically hardened, and peakMemory was never sampled (`n==0`) so the memory tiebreak is unavailable.
- The winner is contested and could flip if the suite weighted `longtasks`/UI-responsiveness over raw wall time — on that axis mediabunny wins ~10.8x.
- Correctness between the two passers is genuinely a tie under the current (shape-only) oracle; a future PCM-digest oracle could change the picture if either engine's gain were non-exact.
