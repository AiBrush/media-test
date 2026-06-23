# audio-dsp/edge_longform_audio_probe

Family: audio-dsp | Fixture: `longform_1h_audio_pcm.wav` (318 MB real PCM-s16 WAV) | primaryMetric: wall | passCount: 5/7

## Verdict

Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
Contested: **YES** — 5 of 7 engines PASS, all on the same single oracle (`golden-metadata`) with identical correctness (`durationDeltaSec=0`). The tiebreak is therefore pure performance.
Decisive factor: lowest wall-clock median, **2.505 ms**, beating the runner-up remotion-webcodecs (3.200 ms) by **1.28x**, remotion-media-parser (3.635 ms) by **1.45x**, platform/chrome-149 (602.745 ms) by **240x**, and ffmpeg.wasm (1340.885 ms) by **535x**. mediabunny reads the WAV `data`/`fmt ` header duration via the cheap metadata path instead of scanning the 1-hour sample body, which is exactly what this "report ~1h cheaply, no full-sample scan / OOM" probe rewards.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 2.505 ms | n/a | 0 (not sampled) | 403 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 3.200 ms | n/a | 0 (not sampled) | 840 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 3.635 ms | n/a | 26,749,956 bytes | 263 ms | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 602.745 ms | n/a | 0 (not sampled) | 406 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 1340.885 ms | n/a | 0 (not sampled) | 1182 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

All five PASS engines reported `durationDeltaSec=0` against `durationToleranceSec≈0.041667 s` (the strict ±1-frame band). No `throughputRealtime`, `decodeFps`, `outputBytes`, or `targetWrites` metrics are emitted for a probe op, so wall median is the primary discriminator.

## Why the winner wins (deep technical)

The operation is a **metadata probe of a multi-hour mono PCM-s16 WAV** (`container: wav`, `audioCodecs: ['pcm-s16']`, golden `durationSec: 3600`, `sampleRate: 44100`, `channels: 1`, `bitrate: 705600`). For a RIFF/WAV file there is no compressed bitstream to demux: duration is derivable in O(1) from the `fmt ` chunk (sample rate, channel count, bytes-per-sample) and the `data` chunk size declared in the header — `duration = dataChunkBytes / (sampleRate * channels * bytesPerSample)`. The whole point of this A.16 edge probe (scenario `notes`: "multi-hour PCM: probe must report ~1h cheaply (no full-sample scan / OOM)") is to separate engines that read the header from engines that walk/decode the 318 MB sample body.

mediabunny takes the cheap path explicitly. In `src/engines/mediabunny/adapter.ts:416-441` (`metadataFromInput`), it calls `input.getDurationFromMetadata()` FIRST (line 429) and only falls back to the expensive `input.computeDuration()` scan (line 436) when the metadata path returns null/non-finite. For WAV the header carries the duration, so the fast path returns immediately and the full-sample scan is never entered — the comment at lines 421-426 documents this exact design intent ("longform and fragmented/CMAF inputs don't pay a full-fragment walk … the longform/edge probes explicitly require duration cheaply"). The result is a **2.505 ms** wall median with `peakMemory` not even registering (no large buffer allocation), and the oracle confirming an exact match: `durationDeltaSec=0` vs the golden 3600 s, plus codec `pcm-s16`, `sampleRate=44100`, `channels=1` all matching the single golden track. mediabunny ran on `backend: webcodecs`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false` (env.configUsed) — note WebCodecs is irrelevant to a header probe; the win is the pure-TS RIFF header read, not any GPU/codec path.

The two other near-instant engines reach the same header-only read: remotion-webcodecs (3.200 ms) and remotion-media-parser (3.635 ms, `backend: cpu-js`, `fieldsTier: metadata-only`) are within ~1.3-1.5x of mediabunny and likewise report `durationDeltaSec=0`. mediabunny edges them out on wall median; remotion-media-parser additionally pays a measured 26.75 MB `peakMemory` (the only engine that registered memory at all) versus mediabunny's unmeasured/near-zero footprint, reinforcing mediabunny's lighter probe path. The two slow PASS engines reveal the anti-pattern this probe is designed to catch: **platform/chrome-149 (602.745 ms)** uses the browser's media element/WebCodecs demux stack which buffers/parses far more than a header read, and **ffmpeg.wasm (1340.885 ms, 1182 ms in long tasks)** boots a wasm module and runs a full `ffprobe`-style open over the input — both correct but ~240x and ~535x slower respectively. Correctness is identical across all five, so these gaps are the entire decision.

Caveat on evidence strength: every PASS is `cached:true` and the bench is `n:1, warmup:1, mad:0`. A single-sample wall median makes the 1.28x margin over remotion-webcodecs the weakest of the four margins — it is plausible run-to-run jitter could reorder mediabunny and remotion-webcodecs. The 240x/535x gaps over platform and ffmpeg.wasm are robust regardless of jitter.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, correct (`durationDeltaSec=0`), but 3.200 ms wall vs mediabunny's 2.505 ms = **1.28x slower**; also the highest long-task time among fast engines (840 ms). Lost on the wall tiebreak only.
- **remotion-media-parser@4.0.479** — PASS, correct (`durationDeltaSec=0`), 3.635 ms wall = **1.45x slower**, and the only engine reporting non-zero `peakMemory` (26,749,956 bytes ≈ 26.7 MB). `backend: cpu-js, fieldsTier: metadata-only` — honest metadata read, just heavier/slower than mediabunny.
- **platform@chrome-149** — PASS, correct, but **602.745 ms wall = 240x slower** than mediabunny. The browser `<video>`/WebCodecs demux path does substantially more work than a RIFF header read for a header-only probe.
- **ffmpeg.wasm@0.12.15** — PASS, correct, but **1340.885 ms wall = 535x slower** with 1182 ms in long tasks: wasm module boot + full ffprobe-style container open. Slowest PASS by a wide margin.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare input container 'wav'". HONEST: mp4box is an ISO-BMFF (MP4/MOV) parser and genuinely cannot demux RIFF/WAV; declining is correct, not an under-declared capability.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare input container 'wav'". HONEST: web-demuxer's declared input set does not include WAV; the NA is a truthful capability gate, not a dodge.

## Anti-cheat validation

- Scenario definition: `src/scenarios/audio-dsp/index.ts:485-495` (case `edge_longform_audio_probe`, `op: 'probe'`, `asset: 'longform_1h_audio_pcm.wav'`, `oracles: ['golden-metadata']`, `notes` at line 494 stating the cheap-probe rationale).
- Fixture: `fixtures/media/longform_1h_audio_pcm.wav` EXISTS and is a real 318 MB PCM-s16 WAV (not synthetic/empty/mock). Golden `fixtures/golden/longform_1h_audio_pcm.wav.meta.json` exists with `durationSec: 3600`, single `pcm-s16` 44100 Hz mono track. A genuine ~1-hour PCM file at 705,600 bits/s mono is physically consistent: 3600 s × 88,200 bytes/s ≈ 317.5 MB, matching the on-disk 318 MB.
- Oracle: `golden-metadata` at `src/core/oracles.ts:595-657`. It performs a REAL field-by-field comparison: container (line 606), duration within a resolved tolerance (lines 614-640), and per-track codec/sampleRate/channels (lines 659-686 `compareTrack`). It is not trivially satisfiable — the duration band used here is the strict per-container value (`durationToleranceSec≈0.041667 s`, i.e. ±1 frame), and every PASS engine had to land within 0.0417 s of 3600 s. Measurements are physically plausible (`durationDeltaSec=0` is exactly what a correct WAV header read yields).
- Winner adapter: `src/engines/mediabunny/adapter.ts:416-453` (`metadataFromInput`), specifically the cheap-path call at line 429 (`input.getDurationFromMetadata()`) with a real `computeDuration()` fallback at line 436. This is a genuine mediabunny `Input` read — no canned output, no copy of input→output, no short-circuit to the golden file, no swallowed error reported as success (the catch blocks set duration to null and fall through to the precise scan rather than fabricating a value).
- Verdict: **REAL**. Real 318 MB fixture, real library probe via mediabunny `Input.getDurationFromMetadata()`, meaningful strict-tolerance metadata oracle. The only softness is that the gate is a single metadata oracle (no decoded-PCM/bit-exact check) — but for a *probe* op that is the appropriate correctness gate, so this is REAL rather than WEAK-GATE.
- Cached note: the winner's result is `cached:true` ("cached previous PASS result"), reused not re-run. Staleness risk is low for correctness (header math is deterministic) but the wall-median ranking is single-sample (`n:1, mad:0`), so the tightest margin (1.28x over remotion-webcodecs) carries run-to-run-jitter uncertainty.

## Confidence & caveats

Confidence: **medium**. The correctness verdict and the large performance gaps over platform (240x) and ffmpeg.wasm (535x) are unambiguous. The win over remotion-webcodecs and remotion-media-parser rests on a 1.28x-1.45x wall-median margin measured at `n:1` with `mad:0` on cached results — credible (mediabunny's cheap-path adapter is built precisely for this case) but not jitter-proof; a re-run could plausibly swap mediabunny and remotion-webcodecs at the top. All five PASS results are cached. The two NA engines (mp4box, web-demuxer) are honestly gated on a genuine missing WAV-container capability, not under-declaration.
