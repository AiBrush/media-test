# remux/prop_recorder_headerless_duration_materialized

family: remux | fixture asset: `fixtures/media/recorder_headerless.webm` (VP8 video + Opus audio, headerless MediaRecorder WebM, 192 KB) | primaryMetric: wall | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`)
- Status: **CONTESTED** — 2 of 7 engines PASS (mediabunny, ffmpeg.wasm@0.12.15).
- Decisive factor: **correctness strength first.** Both passes use the same gating oracle `property-invariant` in its `probe-duration-across-containers` branch. mediabunny materialized an output duration of **3.460s** vs golden **3.084s** → Δ **0.376s**; ffmpeg.wasm produced **3.513s** → Δ **0.429s**. Both fall under the loose recorder-WebM band of **0.500s**, but mediabunny's delta is tighter (0.376 vs 0.429, i.e. mediabunny is ~0.053s / ~12% closer to the source duration). Performance reinforces the same winner.
- Margin over runner-up (ffmpeg.wasm): correctness Δ-duration **0.376s vs 0.429s** (mediabunny tighter). Wall is essentially a tie (mediabunny 8.94ms vs ffmpeg 7.97ms median, i.e. ffmpeg 1.12x faster wall on n=1 — within noise), but **main-thread blocking is decisive: mediabunny longtasks 234ms vs ffmpeg 19,963ms — an ~85x lower main-thread stall.** mediabunny also reports peakMemory (27.1 MB) while ffmpeg has no memory sample (n=0).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 8.94 | n/a | 27,113,360 B (27.1 MB) | 234 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 7.97 | n/a | n/a (n=0) | 19,963 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

No throughputRealtime metric is recorded for this probe-style scenario; primaryMetric is `wall`.

## Why the winner wins (deep technical)

The operation is a **lossless container change WebM (VP8 + Opus) → MKV** for a *headerless* MediaRecorder capture. The hard part is structural, not pixel: a MediaRecorder WebM written by Chrome carries no top-level Segment `Duration` element and sparse/absent Cues, because the file is streamed live and the muxer never seeks back to backfill the header. The invariant `PROBE_DUR` (scenario `metamorphic.ts:158-168`) requires that after remux the output container *materializes* a sane, seekable duration — i.e. `probe(remux(x)).dur ≈ probe(x).dur` within a loose recorder-WebM band.

mediabunny satisfies this by running its **`Conversion` API with no codec/transform options**, which copies the encoded VP8/Opus packets into a fresh MKV `Output`/`BufferTarget` (`src/engines/mediabunny/adapter.ts:1244-1260`, driven through `runConversion` at `adapter.ts:841-868`, `conversion.init`/`execute`). All timestamps are normalized to microseconds and re-emitted; because mediabunny accumulates the encoded packet timeline during the read pass, it can write a concrete Segment/track duration into the MKV header even though the source had none. The materialized 3.460s is within 0.376s of the 3.084s golden — the closest of the two passes. Backend per `env.configUsed`: `backend=webcodecs`, `hwAccel=prefer-hardware`, `pipeline=streaming-lockstep`, `coreBuild=pure-ts-esm`, `coopCoep=not-required`, `sharedArrayBuffer=false`. Crucially this remux is a *packet copy* — no decode/encode of VP8 is needed — so the streaming-lockstep pipeline stays light: longtasks of only **234ms** and peakMemory **27.1 MB**.

The gating oracle is `propertyInvariant` → probe-duration branch (`src/core/oracles.ts:2709-2759`). It re-probes the authored output through the reference engine (`ctx.referenceEngine.probe`), computes `Δ = |outDur - goldenDur|`, and compares against a container/asset-keyed band. The recorded measurements (`outDurationSec:3.46`, `goldenDurationSec:3.084`, `deltaSec:0.376`, `durationToleranceSec:0.5`) are physically plausible for a ~3-second VP8/Opus recorder clip; the golden 3.084s comes from `fixtures/golden/recorder_headerless.webm.meta.json`.

Against ffmpeg.wasm, the decisive contrast is main-thread cost. ffmpeg.wasm also passes the same oracle (Δ0.429s) but its single-threaded wasm transmux blocks the main thread for **19,963ms** of longtasks — ~85x mediabunny — and reports no peakMemory sample. So even though ffmpeg's bare wall median (7.97ms) edges mediabunny's (8.94ms) on n=1, the responsiveness and correctness-tightness both favor mediabunny. The hardware-WebCodecs-capable, COOP/COEP-free, streaming mediabunny path beats the single-thread wasm tiebreaker as well.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost. Same oracle, looser duration Δ (0.429s vs mediabunny 0.376s) and catastrophic main-thread blocking (longtasks 19,963ms vs 234ms, ~85x worse); no peakMemory recorded (bench n=0). Single-thread wasm transmux loses the WebCodecs/streaming tiebreaker.
- **platform@chrome-149** — NA_ENGINE, honest: "engine does not declare operation 'remux'". The raw WebCodecs platform shim exposes no muxer, so it genuinely cannot produce an MKV container; not an under-declared capability.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: "engine does not declare operation 'remux'". web-demuxer is a demux/probe library only; it has no mux/write path. Honest.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: "engine does not declare operation 'remux'". A parser, not a writer. Honest.
- **mp4box@2.3.0** — NA_ENGINE, honest: "engine does not declare input container 'webm'". mp4box.js is ISO-BMFF only and cannot read a Matroska/WebM source. Genuine container limitation.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest: "engine does not declare output container 'mkv'". Its writer targets fragmented MP4/WebM, not MKV. Honest declaration, not a dodge.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/metamorphic.ts:158-168` (id `prop_recorder_headerless_duration_materialized`, invariant `PROBE_DUR`, input `recorder_headerless.webm`, webm→mkv, vp8/opus).
- Fixture: `fixtures/media/recorder_headerless.webm` **exists**, 192 KB — a real headerless MediaRecorder WebM, not synthetic/empty/mock.
- Golden: `fixtures/golden/recorder_headerless.webm.meta.json` declares `durationSec: 3.084`, VP8 320x240@30 + Opus 48k stereo, encoder "Chrome" — consistent with a real recorder capture.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1260` (`remux` → `Conversion` packet copy) and `:841-868` (`runConversion` calls real `mb.Conversion.init/.execute` and reads the actual `BufferTarget.buffer`). No canned/hardcoded output, no input→output passthrough, no short-circuit to golden, no swallowed errors (invalid conversions throw at `adapter.ts:849-853`).
- Oracle: `src/core/oracles.ts:2709-2759` performs a real re-probe of the authored output via `ctx.referenceEngine.probe` and a numeric Δ-vs-golden comparison; not trivially satisfiable.
- Verdict: **WEAK-GATE.** The implementation, fixture, and oracle are all real (this is genuinely a REAL pass), BUT the gate is a *loose duration-band proxy* (tolerance 0.500s on a 3.084s clip ≈ 16% slack) rather than a strict structural/bit-exact check. Both passing engines clear it comfortably and the duration band — not pixel/packet equality — is what is verified. The win is real but the correctness margin is measured on a deliberately loose recorder-WebM band, so it is not a strong correctness signal. The scenario notes themselves acknowledge a "loose recorder-webm band".
- Cached note: **both** PASS results have `cached==true` ("cached previous PASS result"). The reported numbers were reused, not re-run this batch — staleness risk applies to both engines equally, but it does not change the ranking (correctness Δ and the ~85x longtask gap both favor mediabunny regardless).

## Confidence & caveats

- Confidence: **medium.** Winner selection is robust (mediabunny wins on both the tighter duration Δ and the ~85x lower main-thread blocking; the wall tie is within n=1 noise), but two caveats temper it: (1) the gate is a loose duration band (WEAK-GATE), not a strict structural oracle, so "best" here means "closest sane duration + most responsive remux", not "bit-exact"; (2) all bench numbers are n=1 with `cached==true` — single-sample, reused evidence (mad=0, p95==median), so the small wall difference is not statistically meaningful. The longtask delta (234 vs 19,963ms) is large enough to be decisive despite n=1.
