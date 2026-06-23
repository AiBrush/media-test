# trim/hevc_keyframe_aligned

family: trim | fixture asset: `hevc_1080p_10s.mp4` (HEVC/hvc1 video + AAC audio, MP4 container, ~11 MB) | primaryMetric: wall | passCount: 2 (of 7)

Scenario: copy-trim of HEVC (hvc1) in MP4, range `startUs=2_000_000 → endUs=6_000_000` (requested 4.000 s), `frameAccurate:false`, `durationToleranceSec:1.1`. Source: `src/scenarios/trim/index.ts:238-250`.

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** — `status=PASS`.
- **Contested:** YES. Two engines PASS (ffmpeg.wasm and mediabunny@1.48.0); the other five are `NA_ENGINE` ("engine does not declare operation 'trim'").
- **Decisive factor:** PERFORMANCE. Both passers satisfy the identical oracle set (`trim-boundaries` + `playback-smoke`) with comparable correctness strength, so the tie breaks on speed. ffmpeg.wasm performs a pure keyframe-aligned `-c copy` stream-copy (no HEVC decode), while mediabunny runs a full read→decode→encode→mux Conversion pipeline that hardware-decodes HEVC.
- **Margin over runner-up (mediabunny):** wall **43.20 ms vs 492.00 ms = 11.39x faster**; throughputRealtime **231.48x vs 20.32x = 11.39x higher**; longtasks **4223 ms vs 19963 ms = 0.21x** (main-thread blocking). ffmpeg also lands a tighter duration: Δ 0.032 s vs Δ 0.0747 s. Both samples are **n=1, mad=0, cached=true** → evidence is single-shot; see caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 43.20 ms | 231.48x | 0 (not sampled) | 4223 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 492.00 ms | 20.32x | 0 (not sampled) | 19963 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

This is a **keyframe-aligned copy-trim of HEVC (hvc1) in MP4** — the cheapest legitimate trim: cut on a GOP boundary and stream-copy the encoded NAL units into a new container without ever decoding pixels. The oracle (`src/core/oracles.ts:2348`) is duration-gated for this case (boundary frame-digest comparison is intentionally skipped because the loaded golden is a source-prefix, not a trim-range golden — `oracles.ts:2405-2431`), so the winner is decided on which engine produces an in-tolerance trim fastest and with least main-thread cost.

**ffmpeg.wasm's path is a true stream copy with no decoder in the loop.** Its `trim()` (`src/engines/ffmpeg-wasm/adapter.ts:2538`) takes the `frameAccurate:false` branch at `adapter.ts:2613-2627`, emitting `-ss <start> [input opts] -i <in> -map 0 -t <dur> -c copy`. `-ss` placed *before* `-i` seeks to the nearest preceding keyframe; `-c copy` muxes the existing HEVC packets verbatim. It then adds `-avoid_negative_ts make_zero` and `-movflags +faststart` for MP4 (`adapter.ts:2629-2631`). Because no HEVC frames are decoded or re-encoded, the operation is essentially demux+remux at memory bandwidth, which is why wall is **43.20 ms** and throughput **231.48x-realtime** even on the **single-thread `st` core** (the adapter defaults to `@ffmpeg/core` single-thread per `adapter.ts:10-11,1574`). The measured `outDurationSec=4.032 s` vs requested 4.000 s (Δ 0.032 s) reflects landing on the keyframe-aligned GOP boundary, comfortably inside the 1.1 s tolerance. Its `longtasks=4223 ms` is the wasm instantiation/IO cost, ~4.7x lower than mediabunny's.

**mediabunny is correct but pays for a decode/encode pipeline.** Its `trim()` (`src/engines/mediabunny/adapter.ts:1445`) builds a `Conversion` with `trim:{start,end}` (`adapter.ts:1485-1488`) and runs the streaming-lockstep read→decode→encode→mux pipeline (`runConversion`, `adapter.ts:842`). Its `env.configUsed` confirms `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `pixelBackend:"VideoSample.copyTo(RGBA)>canvas"` — i.e. it actually **hardware-decodes the HEVC** through WebCodecs on the Apple M1 Max (ANGLE Metal). Even when the Conversion can keep streams lossless, the engine still spins up the decode/queue machinery, which is why it shows **492.00 ms wall**, only **20.32x-realtime**, and a punishing **19963 ms longtasks** (the WebCodecs decode/copy work serialized onto the main thread via canvas readback). Its duration delta is also looser (Δ 0.0747 s, `outDurationSec=4.0747 s`). Same oracles pass, but it is **11.39x slower** with **4.7x more main-thread blocking** — decisive on the `wall` primary metric.

The tiebreaker irony: mediabunny uses **hardware WebCodecs** and ffmpeg uses a **single-thread wasm core**, yet ffmpeg wins handily — because for a keyframe-aligned copy-trim the right algorithm is "don't decode at all," and ffmpeg's `-c copy` does exactly that while mediabunny's Conversion decodes. Neither requires COOP/COEP (`coopCoep:"not-required"`, `sharedArrayBuffer:false`), so isolation requirements are not a differentiator here.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on perf): correct trim, identical oracles passed, but its WebCodecs hardware-decode Conversion pipeline is **11.39x slower wall** (492.00 ms vs 43.20 ms), **11.39x lower throughput** (20.32x vs 231.48x), and **4.73x more main-thread blocking** (19963 ms vs 4223 ms longtasks); duration delta also looser (0.0747 s vs 0.032 s).
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare operation 'trim'". Honest NA: mp4box is a parser/(re)muxer; trim is not in its declared op set.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'trim'". Honest NA: the raw-platform baseline declares no trim operation.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'trim'". Honest NA: a demuxer only; no muxing/trim output path.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'trim'". Plausibly under-declared (the lib does have a convertMedia/trim surface), but as configured here it does not register `trim`, so NA stands for this run.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'trim'". Honest NA: a parser, not a writer.

## Anti-cheat validation

- **Scenario:** `src/scenarios/trim/index.ts:238-250` — id `hevc_keyframe_aligned`, `asset:'hevc_1080p_10s.mp4'`, container mp4, videoCodec hevc, audioCodec aac, range 2_000_000→6_000_000 us, `frameAccurate:false`, `durationToleranceSec:1.1`. notes: "HEVC (hvc1) copy-trim; NA(browser) where HEVC unsupported."
- **Fixture exists:** `fixtures/media/hevc_1080p_10s.mp4`, ~11 MB real HEVC asset (verified via `ls -la`). Not synthetic/empty/mock.
- **Oracle:** `trim-boundaries` at `src/core/oracles.ts:2348` performs a real duration measurement — probes the trimmed output via the reference engine and/or decodes frames for a pts-span proxy (`oracles.ts:2360-2386`), then fails if `|out - requested| > durationToleranceSec` (`oracles.ts:2394-2400`). Boundary frame-digest comparison is deliberately gated off here because the loaded golden is a source-prefix, not a trim-range golden (`oracles.ts:2405-2431`); `playback-smoke` separately confirms the `<video>` element decoded and played frames of the output. Measurements are physically plausible: outDurationSec≈4.03 s for a requested 4.0 s cut of a 10 s source.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2538-2645` — genuine FFmpeg invocation. The copy-trim path (`adapter.ts:2613-2627`) issues real `-ss/-t/-c copy` args and runs them via `this.run(args)` (`adapter.ts:2636`), then reads the produced bytes from MEMFS (`adapter.ts:2637`). No canned output, no input→output copy to fake a transcode, no short-circuit to a golden, no error swallowing (errors throw; malformed/mutated inputs are rejected at `adapter.ts:2550-2561`).
- **Verdict: REAL.** Real ~11 MB HEVC fixture + genuine FFmpeg `-c copy` stream-copy implementation + a meaningful duration oracle backed by a live `<video>` playback-smoke check. The duration gate is on the loose side (1.1 s tolerance, intentional for keyframe-snapped cuts) and the strong boundary-frame digest is skipped, so the gate is a notch below bit-exact — but it is a real measured comparison against the requested range, not a trivially-satisfiable smoke-only pass.
- **Cached note:** the winner's result has `cached:true` ("cached previous PASS result"); the run was reused, not freshly executed. Both passers are cached with `n=1, mad=0`, so the numbers are single-shot and carry staleness risk (see launcher seeding caveat).

## Confidence & caveats

- **Confidence: high** that ffmpeg.wasm is the correct winner. Both passers clear the identical oracle set; the 11.39x wall margin and 4.73x longtask advantage are large and mechanistically explained (stream-copy vs decode-pipeline) — the conclusion is robust even at n=1.
- **Caveats:** (1) Both winning measurements are **cached, n=1, mad=0/p95==median** — no variance, single sample; the magnitude of the gap makes it safe but a fresh re-run would harden it. (2) The gating oracle is duration-only at 1.1 s tolerance with boundary frame-digest skipped (no trim-range golden baked yet); a bit-exact packet/boundary gate would be stronger evidence of cut fidelity. (3) `peakMemory` and `targetWrites` were not sampled (n=0) for either engine, so memory could not contribute to the ranking. (4) The five NA engines are mostly honest non-declarations; remotion-webcodecs is a plausible under-declaration but does not affect the winner.
