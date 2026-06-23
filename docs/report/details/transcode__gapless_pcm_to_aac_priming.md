# transcode/gapless_pcm_to_aac_priming

family: transcode | fixture asset: `fixtures/media/wav_s16.wav` (PCM s16 WAV, 960 KB, real file) | primaryMetric: wall | passCount: 3 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Contested** — 3 engines PASS (mediabunny, remotion-webcodecs, ffmpeg-wasm), all satisfying the identical oracle set (`property-invariant` = transcode-output-metadata, plus `playback-smoke`).
- **Decisive factor: performance on the primary metric (wall median).** Correctness strength is a tie (every PASS clears the same two oracles at the same tier), so the ranking falls to performance. mediabunny's wall median is **36.26 ms**, vs **55.05 ms** for runner-up remotion-webcodecs and **204.08 ms** for ffmpeg-wasm.
- **Margin over runner-up (remotion-webcodecs): 1.52x faster wall** (55.05 / 36.26). Over ffmpeg-wasm: **5.63x faster** (204.08 / 36.26).
- **Caveat that nearly contests the call:** mediabunny reports `longtasks` median **12909 ms** versus remotion-webcodecs **173 ms** (≈75x worse main-thread blocking). The wall win is real and on the designated primary metric, but the longtask spread means remotion-webcodecs is the better choice if main-thread responsiveness, not throughput, is the goal. All benches are **n=1** (mad=0, p95==median), so this is single-sample evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 36.26 ms | n/a (not measured) | 0 (n=0) | 12909 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true, playback-smoke:true | 55.05 ms | n/a | 0 (n=0) | 173 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | 204.08 ms | n/a | 0 (n=0) | 4277 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

`throughputRealtime` was not collected for this scenario; metrics = `['wall','peakMemory','longtasks']` (src/scenarios/transcode/index.ts:1640). `peakMemory` has n=0 samples for all engines (median 0), so it is not a usable discriminator here.

## Why the winner wins (deep technical)

**The operation.** This is the A.16 gapless case: take a raw **PCM s16 WAV** (`wav_s16.wav`) and re-encode the audio to **AAC at 192 kbps inside an MP4 (ISOBMFF) container** (src/scenarios/transcode/index.ts:1629-1645). AAC is a block transform codec: every encode introduces **encoder delay (priming, ~1024-2112 samples for the analysis lookahead) plus trailing padding** to fill the final 1024-sample frame. That shifts the decoded/container duration relative to the PCM source, which is exactly why the scenario sets a **relaxed `durationToleranceSec = 0.12`** (TC_AUDIO_PRIMING_TOLERANCE_SEC, src/scenarios/transcode/index.ts:28). A strict per-frame band would falsely fail a *correct* gapless encode — the notes call this out explicitly (index.ts:1642-1644).

**What the gate actually checks.** The winning gate is `property-invariant` → `transcodeOutputMetadataInvariant` (src/core/oracles.ts:3626-3708). It does a **real reference-engine probe of the produced output bytes** (oracles.ts:3641), then asserts three independent facts: (1) container normalizes to `mp4` (oracles.ts:3655); (2) output duration is within the priming band of the source duration (oracles.ts:3659-3677); (3) the requested **audio codec actually appears as a track** — `compareRequestedTrack` finds a track whose normalized codec == `aac` and flags a diff if none matches (oracles.ts:3692-3699, 3785-3796). `playback-smoke` then confirms the muxed file decodes/plays a few frames in a real `<video>` element.

**mediabunny's measured result.** Its outcome shows `audioTracks: 1`, `durationDeltaSec: 0.0773333…`, `durationToleranceSec: 0.12` — i.e. the AAC re-encode added ~77 ms of priming/padding drift, comfortably inside the 0.12 s band, and produced exactly one AAC track in MP4. These are physically plausible numbers for an AAC priming shift (tens of ms), confirming a genuine re-encode rather than a copy.

**Why it is fast.** mediabunny ran on `backend: webcodecs`, `coreBuild: pure-ts-esm`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false` (env.configUsed). Its `transcode()` builds a single mediabunny `Output` with an `Mp4OutputFormat` and a `Conversion` that streams the source through the browser's native **WebCodecs `AudioEncoder` (AAC)** — see adapter `transcode()` at src/engines/mediabunny/adapter.ts:1271-1322, which constructs the format via `makeOutputFormat` (codecs.ts:158-183, mp4→`Mp4OutputFormat`), opens the input, builds `convOpts.audio` via `buildAudioOptions` (adapter.ts:1303, 672-692 — maps codec→`aac`, passes through `bitrate: 192000`), and runs `runConversion` (adapter.ts:842, 1307). Because the encoder is the platform's native AAC path and there is no wasm core to instantiate and no COOP/COEP/SAB requirement, the wall cost is dominated by encode time of a short audio clip — **36.26 ms**.

**Why the runner-up is slower.** remotion-webcodecs also uses `backend: webcodecs` (env.configUsed) and the same native AAC encoder, so it clears the identical oracle set with an even tighter `durationDeltaSec: 0.056` (better priming fidelity). But its wall median is **55.05 ms** — 1.52x slower — attributable to its heavier conversion harness (`pipeline: streaming-backpressure`, `writer: bufferWriter`, `convert=main-thread`). Notably it keeps `longtasks` to **173 ms**, far below mediabunny's 12909 ms, so it blocks the main thread far less. On the designated primary metric (wall) mediabunny still wins; on responsiveness remotion-webcodecs is superior.

**Why ffmpeg-wasm is far behind.** ffmpeg.wasm produced the *most* accurate output (`durationDeltaSec: 0`, perfect duration match) and passed both oracles, but its wall median is **204.08 ms** — 5.63x slower than mediabunny — because it must run the FFmpeg AAC encoder inside single-thread wasm (`engineId: ffmpeg-wasm`) rather than the browser's native hardware/optimized AAC path. Its `longtasks` of 4277 ms also reflect the wasm encode burst.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** correct and slightly more accurate (`durationDeltaSec` 0.056 vs mediabunny 0.077), but 1.52x slower wall (55.05 ms vs 36.26 ms). Its sole edge — 173 ms vs 12909 ms longtasks — is not the primary metric, so it ranks second.
- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** passed both oracles with a perfect duration match (`durationDeltaSec` 0), but 5.63x slower wall (204.08 ms) because AAC encoding runs in single-thread wasm instead of the native WebCodecs encoder mediabunny/remotion use.
- **platform@chrome-149 (NA_ENGINE):** honest NA. Its only encode path is `<video>→canvas→MediaRecorder` (env.configUsed.encode), which is video-only and drops the audio track; it cannot emit the requested AAC audio track at all. Correct self-declaration, not an under-declared capability.
- **web-demuxer@4.0.0 (NA_ENGINE):** honest NA — a demux-only library that does not declare the `transcode` operation; it has no encoder.
- **mp4box@2.3.0 (NA_ENGINE):** honest NA — an ISOBMFF box parser/muxer with no audio encoder; does not declare `transcode`.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** honest NA — a parser, not an encoder; does not declare `transcode`.

## Anti-cheat validation

- **Scenario:** src/scenarios/transcode/index.ts:1629-1645. Input = `wav_s16.wav`, options request `{ container: 'mp4', audio: { codec: 'aac', bitrate: 192000 } }` with `invariant: 'transcode-output-metadata'`.
- **Fixture exists and is real:** `fixtures/media/wav_s16.wav` is present, 960 KB — a genuine PCM s16 WAV, not synthetic/empty/mock. Input container ≠ output container (wav→mp4) and codec changes (pcm-s16→aac), so a copy-through would be detectable.
- **Oracle:** `transcodeOutputMetadataInvariant`, src/core/oracles.ts:3626-3708, dispatched at oracles.ts:2651. It probes the *actual output bytes* with the reference engine (3641), and verifies container=mp4 (3655), duration within band (3659-3677), and an AAC audio track exists (3692-3699 + compareRequestedTrack 3785-3796). Measurements (`audioTracks:1`, `durationDeltaSec:0.0773`, tol 0.12) are physically plausible for an AAC priming shift. Not trivially satisfiable: a wrong container, missing/non-AAC track, or >0.12 s duration error all fail.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1271-1322 (`transcode`), with real library calls — `makeOutputFormat` (Mp4OutputFormat), `buildAudioOptions` (aac + bitrate, adapter.ts:672-692), `runConversion` (adapter.ts:842 via 1307). No canned output, no input→output copy, no short-circuit to a golden, no swallowed errors reported as success; it throws on invalid shapes (e.g. adapter.ts:1280, 1295-1298).
- **Verdict: WEAK-GATE.** The fixture is real and the implementation is a genuine WebCodecs AAC re-encode, so the PASS is real — but the gate is **metadata/structural only** (container + AAC track presence + a deliberately *relaxed* 0.12 s duration band) plus a smoke playback. It does **not** decode the AAC back to PCM and compare against the source (no `decoded-audio-pcm`, no bit-exact/SSIM audio check), so it cannot detect a degraded-but-still-AAC encode. The relaxed tolerance is justified by AAC priming physics (the whole point of A.16), but it makes this a moderate gate, not a strong correctness gate. The win is decided on performance under that moderate gate.
- **Cached note:** the winner's result has **cached==true** ("cached previous PASS result"), as do both other PASS engines and the bench numbers. Staleness risk: these wall/longtask numbers were reused, not re-run in this session; treat the 1.52x margin as indicative, not freshly measured.

## Confidence & caveats

- **Confidence: medium.** Eligibility, NA honesty, and the winner's correctness are solid (real fixture, real adapter, real oracle). The *ranking* rests on a single-sample (n=1, mad=0) wall comparison among cached results, and the gate is a relaxed metadata/smoke gate rather than a bit-exact audio check.
- The longtasks inversion (mediabunny 12909 ms vs remotion-webcodecs 173 ms) is the main reason this is not high confidence: if the decision metric were main-thread responsiveness instead of wall throughput, remotion-webcodecs would win. The decision strictly follows the documented order (primaryMetric=wall first).
- `peakMemory` (n=0) and `throughputRealtime` (not collected) provided no additional signal.
