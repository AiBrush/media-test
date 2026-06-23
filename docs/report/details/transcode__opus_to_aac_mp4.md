# transcode/opus_to_aac_mp4

- family: transcode
- fixture asset: `opus.ogg` (Opus-in-Ogg, 146 KB, exists in `fixtures/media/`)
- operation: transcode Opus(ogg) → AAC(mp4) @ 192 kbps
- primaryMetric: none declared → headline metric is `wall` (first in metrics list `['wall','throughputRealtime','peakMemory','longtasks']`)
- passCount: 2 of 7 (mediabunny, ffmpeg.wasm)

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (2 engines PASS, identical oracle set passed).
- **Decisive factor: PERFORMANCE.** Correctness is comparable (both pass the exact same two oracles, both well inside the duration tolerance band). mediabunny wins the headline `wall` metric: **96.785 ms vs ffmpeg.wasm 275.910 ms = 2.85x faster wall**, and equivalently **103.39x-realtime vs 36.27x-realtime = 2.85x higher throughput**.
- **Margin over runner-up (ffmpeg.wasm):** 2.85x wall, 2.85x throughputRealtime. Caveat: ffmpeg.wasm actually wins `longtasks` (173 ms vs mediabunny 4784 ms), and both runs are n==1 and `cached==true`, so the performance margin is weak-confidence evidence (single sample, mad==0/p95==median trivially).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass, playback-smoke:pass | 96.785 ms | 103.394 x | 0 (not sampled) | 4784 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass, playback-smoke:pass | 275.910 ms | 36.269 x | 0 (not sampled) | 173 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

This case forces a genuine **decode→re-encode** audio transcode: the source codec is Opus and the target is AAC at a pinned 192 kbps, so there is no copy fast-path possible. The container also flips from Ogg to MP4, so an MP4 muxer with an `mp4a`/`esds` AudioSpecificConfig path is required on the write side.

mediabunny ran on its WebCodecs/streaming-lockstep pipeline (`env.configUsed`: `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`, `wasmThreads:0`). The transcode goes through the real mediabunny Conversion API (`src/engines/mediabunny/adapter.ts`: imports `ConversionOptions/ConversionAudioOptions`, doc-block lines 49/65 describe `Conversion .init/.execute` running read→decode→encode→mux). The AAC re-encode is configured in `buildAudioOptions` (`adapter.ts:672-692`): because the scenario pins `audio:{codec:'aac', bitrate:192000}`, `opts.codec='aac'` and `opts.bitrate=192000` are both set (`adapter.ts:678-684`). The doc comment at `adapter.ts:664-670` is explicit that pinning a numeric bitrate deliberately leaves mediabunny's lossless copy fast-path (which requires `!trackOptions.bitrate`) and enters the genuine re-encode branch — exactly what an Opus→AAC change-of-codec demands. The decode side uses the browser's native Opus decoder and the encode side the browser's native AAC encoder (WebCodecs `AudioEncoder`), so the heavy DSP runs on optimized native code rather than wasm.

ffmpeg.wasm produced an equally correct output but pays a structural tax: it runs the whole decode (libopus) and AAC encode inside a single-thread wasm core (`src/engines/ffmpeg-wasm/adapter.ts:10` notes the adapter "defaults this adapter to the single-thread core"; `wasmThreads`/SAB not used). All of libopus decode + AAC encode + MP4 mux happens in interpreted/JIT-compiled wasm, which is why its wall is ~2.85x higher (275.9 ms vs 96.8 ms). Interestingly ffmpeg.wasm's `longtasks` is far lower (173 ms vs 4784 ms): the WebCodecs path schedules large synchronous GPU/codec callbacks on the main thread that register as long tasks, whereas the wasm run keeps its work in shorter slices here — but the headline `wall` metric (and the realtime throughput derived from it) is what ranks this transcode, and mediabunny dominates that.

On the gating oracle, both engines satisfy `property-invariant` in its `transcode-output-metadata` form (`src/core/oracles.ts:3631-3708`). The oracle re-probes the produced bytes with the reference engine, checks the container equals the requested `mp4`, checks exactly one audio track matching the requested shape, and checks output duration against the source within a tolerance band. mediabunny's measured `durationDeltaSec=0.0837 s` and ffmpeg's `0.007 s` are both well under the `durationToleranceSec=0.12 s` band (the relaxed AAC priming/padding band `TC_AUDIO_PRIMING_TOLERANCE_SEC` applied via scenario `tolerances`, `index.ts:1108`). Both also pass `playback-smoke` (`oracles.ts:1574-1580`): a real `<video>` element decoded and advanced a few frames of the MP4/AAC output. mediabunny's slightly larger duration delta (0.084 s vs 0.007 s) reflects AAC encoder delay/padding it carries; it is correct and inside band, so it does not cost it the win.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost on performance: 275.910 ms wall vs 96.785 ms (2.85x slower) and 36.27x vs 103.39x realtime throughput, because its libopus-decode + AAC-encode + MP4-mux all run in a single-thread wasm core (`adapter.ts:10`) instead of native WebCodecs. Correctness was equal (same two oracles, durationDelta 0.007 s, even tighter than the winner). It does win `longtasks` (173 ms vs 4784 ms) but that is not the headline metric.
- **platform@chrome-149** — NA_ENGINE, honest: "engine does not declare input container 'ogg'". The platform/WebCodecs adapter does not register Ogg demuxing as a supported input container, so it cannot ingest the Opus-in-Ogg source. Plausible (Chrome has no built-in Ogg demuxer surfaced through this adapter).
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest: "engine does not declare input container 'ogg'". Same Ogg-input gap as the platform engine; its capability registry omits `ogg` as an input container.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: this library is a parser/demuxer, not a transcoder; "engine does not declare operation 'transcode'" is a genuine capability boundary (no encode path).
- **mp4box@2.3.0** — NA_ENGINE, honest: MP4Box is an MP4 (de)muxer; it has no audio decode/encode, so "engine does not declare operation 'transcode'" is correct.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: a demuxer only; "engine does not declare operation 'transcode'" is the correct, non-under-declared boundary.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:1024-1033` (case `opus_to_aac_mp4`, asset `opus.ogg`, from ogg/opus → mp4/aac @192 kbps); scenario factory `index.ts:1089-1111`; relaxed duration tolerance applied at `index.ts:1108`. Notes: "Opus→AAC (A.6 gap). Relaxed duration band for AAC encoder delay/padding (gapless)."
- **Fixture:** `fixtures/media/opus.ogg` exists, 146 KB — a real Opus-in-Ogg file, not synthetic/empty/mock. Output is browser-playable (mp4) so `playback-smoke` is added (`index.ts:1090-1092`).
- **Winner adapter:** `src/engines/mediabunny/adapter.ts` — real mediabunny `Conversion` API (doc lines 49/65); `buildAudioOptions` `adapter.ts:672-692` sets `codec='aac'` + `bitrate=192000`, deliberately taking the genuine re-encode branch (comment `adapter.ts:664-670`). No canned output, no input→output copy (copy is impossible across Opus→AAC), no short-circuit to a golden, no error swallowing.
- **Gating oracle:** `src/core/oracles.ts:3631-3708` (`property-invariant` / transcode-output-metadata) re-probes produced bytes via the reference engine, asserts container==mp4, audio track count/shape, and duration within band — a real structural/metadata comparison, not trivially satisfiable. Plus `playback-smoke` `oracles.ts:1574-1580` (real `<video>` decode). Measurements are physically plausible: durationDelta 0.0837 s (mediabunny) / 0.007 s (ffmpeg) under a 0.12 s band; audioTracks=1 each.
- **Verdict: WEAK-GATE.** The implementation and fixture are real and the winner genuinely re-encodes (REAL on those axes), but the gating oracle for this lossy audio case is output-shape + duration-band + smoke playback — it does NOT verify decoded PCM bit-exactness or perceptual SSIM/PSNR of the audio. A transcode that produced an mp4 with one AAC track of the right duration but degraded/garbled audio could still pass. This is by design per the scenario notes (lossy→lossy gated on output format), but it means PASS here is "produced a valid, playable AAC/MP4 of the right shape," not "audio is faithful." Both PASS engines clear that real-but-loose bar.
- **Cached note:** Both winning and runner-up results have `cached==true` ("cached previous PASS result"); the numbers were reused, not freshly re-run. Per the launcher seeding caveat, stale PASS reuse is a known risk — the 2.85x margin should be confirmed with a fresh run before being quoted as definitive.

## Confidence & caveats

- Confidence: **medium**. The winner is clear on the headline metric and both passing engines are validated as genuine implementations, but: (1) both results are `cached==true` (staleness), (2) bench `n==1` (no spread — mad==0, p95==median are artifacts of a single sample), and (3) the gate is loose (no audio-fidelity oracle), so "correctness comparable" is established only at the output-shape/duration/playback level.
- ffmpeg.wasm's `longtasks` advantage (173 ms vs 4784 ms) is real and could matter for main-thread responsiveness; mediabunny wins purely on total wall/throughput.
- `peakMemory` was not sampled for either engine (n==0), so memory could not be compared.
