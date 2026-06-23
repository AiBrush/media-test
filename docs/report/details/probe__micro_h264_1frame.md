# probe/micro_h264_1frame

- **Family:** probe
- **Fixture asset:** `fixtures/media/micro_h264_1frame.mp4` (5.5 KB — smallest valid MP4, single H.264 keyframe, video-only, 320x240, ~1 s)
- **Primary metric:** wall (ms median)
- **Pass count:** 7 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` (env.engineId `mediabunny`)
- **Contested:** YES — all 7 engines PASS the single gating oracle (`golden-metadata`), so the decision is correctness-tied and resolved on performance.
- **Decisive factor:** lowest wall median. mediabunny = **5.095 ms** vs runner-up `platform@chrome-149` = **8.710 ms**.
- **Margin over runner-up:** **1.71x faster** wall than platform (8.710 / 5.095), and **1.80x** faster than the next-fastest library `remotion-webcodecs` (9.190 ms). All measurements are `n=1` (mad=0, single warmup), so the margin is suggestive, not statistically robust.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 5.095 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 8.710 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 9.190 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 9.915 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 13.005 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 13.340 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 21.215 | n/a | n/a | n/a | cached previous PASS result |

(The shard's `bench` block contains only the `wall` metric; throughputRealtime / peakMemory / longtasks were not recorded for this probe row, so they are n/a for all engines.)

## Why the winner wins (deep technical)

This scenario is an **init-overhead-dominated probe** (scenario note, `src/scenarios/probe/index.ts:248`): a 5.5 KB MP4 holding one H.264 IDR keyframe at 320x240. There is essentially no media to scan — the entire competition is about how cheaply each engine opens the `isom` container, reads the `moov` (`mvhd` duration + `stsd`/`avc1` track config), and normalizes one video track. The gating oracle is `golden-metadata` (`src/core/oracles.ts:595`), which only compares container, duration (±1 frame = ±0.04167 s), and per-track codec/dims/fps. Every engine reported `durationDeltaSec: 0` against the golden's `durationSec: 1`, codec `h264`, 320x240, fps 1 (`fixtures/golden/micro_h264_1frame.mp4.meta.json`). So correctness is a flat tie and performance decides.

mediabunny wins because its probe path is the leanest. `metadataFromInput` (`src/engines/mediabunny/adapter.ts:417`) takes the **cheap-first duration strategy**: it calls `input.getDurationFromMetadata()` (`adapter.ts:429`) which reads the container's declared `mvhd` duration directly without scanning samples, and only falls back to `computeDuration()` (a full fragment walk) when metadata yields null. For a faststart MP4 with a single sample, the cheap path returns `1` immediately, so mediabunny never touches `mdat`. Track metadata is read via `input.getTracks()` + `normalizeTrack` (`adapter.ts:443-447`), which pulls width/height/codec/fps straight from the `avc1`/`stsd` getters. The engine ran on `backend: webcodecs`, `coopCoep: not-required`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coreBuild: pure-ts-esm` (env.configUsed) — a pure-TS ESM box parser with zero wasm instantiation cost, which is exactly what makes the 5.1 ms init the fastest.

The decisive mechanism over the runners-up is **avoiding heavyweight runtime init for a metadata-only read**:
- vs `platform@chrome-149` (8.710 ms, 1.71x slower): platform's config wires up a full `VideoDecoder` + `webgpu>webgl>offscreen2d` pixel backend and `transferable` frame transfer. Even though a metadata probe shouldn't decode pixels, the platform adapter pays for spinning up that WebCodecs/canvas pipeline. mediabunny's `pure-ts-esm` box read sidesteps all of it.
- vs `ffmpeg.wasm` (13.005 ms, 2.55x slower) and `web-demuxer` (21.215 ms, 4.16x slower): both must instantiate a wasm module before they can parse a single `moov`. For a 5.5 KB file, that wasm boot cost dominates entirely — web-demuxer is the slowest in the field precisely because its Emscripten/libav wasm init is the largest fixed tax.

## What each other framework did wrong

- **platform@chrome-149 — PASS but lost:** 8.710 ms vs 5.095 ms (1.71x slower). Correct metadata, but its WebCodecs+canvas pixel pipeline init (`decode: VideoDecoder`, `pixelBackend: webgpu>webgl>offscreen2d`) is overhead this metadata-only probe doesn't need.
- **remotion-webcodecs@4.0.479 — PASS but lost:** 9.190 ms (1.80x slower). `backend: webcodecs` with offscreencanvas-2d pixel backend and streaming-backpressure pipeline; same WebCodecs init tax with no upside for a pure metadata read.
- **remotion-media-parser@4.0.479 — PASS but lost:** 9.915 ms (1.95x slower). A `cpu-js` `metadata-only` parser (no wasm, no WebCodecs), yet still ~2x slower than mediabunny's box reader on this micro input.
- **ffmpeg.wasm@0.12.15 — PASS but lost:** 13.005 ms (2.55x slower). Must boot the ffmpeg wasm module before reading the `moov`; that fixed wasm-instantiation cost swamps the tiny file.
- **mp4box@2.3.0 — PASS but lost:** 13.340 ms (2.62x slower). `pure-js` with `whole-file-append(MP4BoxBuffer+fileStart)` and `rangeReads: false` — it appends the entire buffer and parses, slower than mediabunny's streaming box read even at 5.5 KB.
- **web-demuxer@4.0.0 — PASS but lost:** 21.215 ms (4.16x slower, slowest). Heaviest wasm-demuxer init cost, the worst fit for an init-overhead-dominated micro probe.

No engine was NA or FAIL — capability declarations all look honest for a basic MP4/H.264 metadata probe.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/probe/index.ts:243-249` — declares `asset: 'micro_h264_1frame.mp4'`, container `mp4`, videoCodecs `['h264']`, note "micro bucket (~1 KB): smallest valid MP4, one keyframe, video-only. Init-overhead-dominated probe."
- **Fixture exists:** `fixtures/media/micro_h264_1frame.mp4` present at 5.5 KB — a real, non-empty MP4, not synthetic/mock.
- **Golden exists:** `fixtures/golden/micro_h264_1frame.mp4.meta.json` with physically plausible values (mp4, durationSec 1, one h264 video track 320x240, fps 1, bitrate 37992, major_brand isom). Sibling goldens (`.frames.json`, `.packets.json`, `.ssim.json`) also present.
- **Oracle:** `golden-metadata` at `src/core/oracles.ts:595-657` — a REAL field-by-field comparison (container, duration within ±0.04167 s, per-track codec/dims/fps via `compareTrack` at line 659). Not trivially satisfiable for metadata; it would FAIL on any container/codec/dimension mismatch. However, it is a **metadata-only gate**: it does not decode the frame, does not check packet bytes against `.packets.json`, and does not run SSIM against `.ssim.json`. So while it cannot be cheated, it is correctness-weak relative to the bit-exact / decoded-frame oracles available for this fixture.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:417-474` (`metadataFromInput`) genuinely calls mediabunny `input.getDurationFromMetadata()`, `input.getTracks()`, and `normalizeTrack` (real `InputVideoTrack` getters, `adapter.ts:296-351`). No hardcoded output, no copy of input→output, no read of the golden file, no error-swallow-then-report-success.
- **Verdict:** **WEAK-GATE.** Real fixture + real implementation + a real, non-trivial oracle — but the only gate is metadata-only (no decode/bit-exact/packet check on a fixture that has frames/packets/ssim goldens available). The PASS is genuine; the correctness bar is a probe-level metadata check, not a strong decode gate.
- **Cached note:** Every engine's result has `cached: true` ("cached previous PASS result"). Results were reused, not re-run in this batch — staleness risk applies to both the PASS verdicts and the wall timings, which weakens the (already n=1) performance margin.

## Confidence & caveats

- **Confidence: medium.** The winner is correct and its lean cheap-duration probe path mechanistically explains the fastest wall. But: (1) all rows are `cached: true` (reused, not freshly measured); (2) all bench samples are `n=1, mad=0` — a single timed run per engine, so the 1.71x margin over platform could shift under repeated sampling; (3) the gate is metadata-only, so this is a probe-latency contest, not a decode-correctness contest. The mediabunny ordering is consistent (it is the fastest by a clear ~1.7x), so the winner pick is robust even if exact ratios are soft.
