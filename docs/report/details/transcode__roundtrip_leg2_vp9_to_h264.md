# transcode/roundtrip_leg2_vp9_to_h264

family: transcode | fixture asset: `fixtures/media/vp9_1080p_10s.webm` (9,293,670 bytes, real VP9/Opus WebM) | primaryMetric: throughputRealtime | passCount: 3 / 7

This is leg 2/2 of the A.16 double-transcode round-trip (A->B->A): **VP9 (WebM/Opus) -> H.264 (MP4/AAC)**. The VP9 corpus asset stands in for the B-leg; the SSIM floor is loosened to 0.95 (vs the usual 0.99) to absorb cumulative generational loss while still catching corruption.

## Verdict

**Best framework: mediabunny@1.48.0 — CONTESTED (3 PASS: mediabunny, remotion-webcodecs, ffmpeg.wasm).**

All three passing engines satisfy the SAME two oracles (`ssim-psnr` + `playback-smoke`) at effectively identical correctness (worst-frame SSIM >= 0.99999, all `exactFrames=0`, i.e. the SSIM perceptual gate is what carried them — none is bit-exact). Correctness is therefore a tie, and the decision falls to **PERFORMANCE**.

Decisive factor: **wall-clock / realtime throughput.** Mediabunny converts the 10s clip in **993.16 ms (10.08x realtime, 302.1 encodeFps)**, vs remotion-webcodecs **1852.81 ms (5.40x, 161.9 encodeFps)** and ffmpeg.wasm **28,869 ms (0.35x, 10.4 encodeFps)**.

- Margin over runner-up (remotion-webcodecs): **1.87x faster wall**, **1.87x higher throughput**, **1.87x higher encodeFps**, and **4.6x fewer longtask-ms** (1192 ms vs 5478 ms).
- Margin over ffmpeg.wasm: **29.1x faster wall**, **29.1x higher throughput**.

Caveat: all benches are **n=1, mad=0** (single sample), and all three PASS rows are **cached==true**. The wall gap to remotion (1.87x) is large enough to be decisive despite n=1; the gap to ffmpeg (29x) is overwhelming.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | ssim-psnr:true, playback-smoke:true | **993.16** | **10.077** | 0 (not sampled) | **1192** | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true, playback-smoke:true | 1852.81 | 5.402 | 0 (not sampled) | 5478 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true, playback-smoke:true | 28869.25 | 0.347 | 0 (not sampled) | 4410 | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only, drops audio; cannot produce requested audio track |

SSIM detail per passing engine (worst-frame / mean over 12 pairs, all exactFrames=0):
- mediabunny: ssimMin 0.99999657, ssimMean 0.99999939
- ffmpeg.wasm: ssimMin 0.99999975, ssimMean 0.99999984
- remotion-webcodecs: ssimMin 0.99999461, ssimMean 0.99999595

## Why the winner wins (deep technical)

**Backend.** Mediabunny ran on `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required` (env.configUsed). On this Apple M1 Max (ANGLE Metal), the decode side (VP9) and the encode side (H.264) both hit the platform's hardware/optimized WebCodecs path. H.264 has a first-class hardware encoder on Apple silicon, which is exactly the codec this leg targets, so the encode stage is near-free — hence 302 encodeFps and 10.08x realtime.

**The actual code path.** The transcode is genuine, not a copy. `MediabunnyAdapter.transcode` (src/engines/mediabunny/adapter.ts:1271) builds a real `ConversionOptions`: it opens the input (`openInput`, line 1287), constructs an MP4 `Output` over an instrumented `BufferTarget` (line 1288-1289), builds video options via `buildVideoOptions` (line 1302) and audio options via `buildAudioOptions` (line 1303, VP9/Opus -> H.264/AAC), pins `trim {start:0, end:inputDuration}` (line 1305) to force a full re-time, and then `runConversion` (line 1307) calls `mb.Conversion.init` + `conversion.execute()` (src/engines/mediabunny/adapter.ts:848-855). That `execute()` drives mediabunny's read->decode->encode->mux lockstep loop end-to-end; the produced MP4 bytes come straight from the BufferTarget (line 859-866). There is no short-circuit to the golden and no input->output copy.

**Encode-config safety = why it is fast AND correct.** `buildVideoOptions` probes the encoder config with WebCodecs `isConfigSupported`/`canEncodeVideo` BEFORE committing (adapter.ts:529-539, ~608-651), preferring hardware for H.264 and using a resolution-aware bitrate floor. Because H.264 has a solid hardware encoder, the probe succeeds on the hardware path with no fallback to software — that is the mechanistic source of the 1.87x lead over remotion-webcodecs, which used `hwAccel: prefer-hardware(+software fallback)` with an `offscreencanvas-2d` pixel backend and a main-thread `convert` step (its env.configUsed). Remotion's main-thread conversion and 2D-canvas pixel transfer cost it both wall time (1853 ms) and, much more starkly, **longtask budget: 5478 ms of long tasks vs mediabunny's 1192 ms (4.6x)** — i.e. remotion blocks the main thread far harder for the same work.

**Oracle evidence (real numbers).** The gating oracle `ssim-psnr` (src/core/oracles.ts:1688) re-decodes mediabunny's MP4 output with the platform decoder (`ctx.decodeWithPlatform`, line 1718), pairs 12 candidate frames against the committed golden luma signatures in `fixtures/golden/vp9_1080p_10s.webm.ssim.json`, and gates on the WORST frame (`minSsim >= t.ssimMin`, line 1823). Mediabunny's `ssimMin = 0.99999657` clears the 0.95 floor by a huge margin, with `exactFrames=0` (no frame was bit-identical — expected after a real lossy VP9->H.264 re-encode; a copy/cheat would have shown exactFrames=12 / digest matches). The `playback-smoke` oracle additionally confirmed a real `<video>` element decoded and played frames of the MP4, proving the muxed container is genuinely playable, not just byte-plausible.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 — PASS but lost on speed.** Identical correctness (ssimMin 0.99999461) but **1.87x slower wall (1852.81 vs 993.16 ms)**, **1.87x lower throughput (5.40x vs 10.08x)**, and **4.6x more longtask-ms (5478 vs 1192)**. Root cause from its env.configUsed: `convert=main-thread` and `pixelBackend: offscreencanvas-2d` — main-thread conversion plus 2D-canvas pixel handling instead of mediabunny's tighter streaming-lockstep WebCodecs loop.
- **ffmpeg.wasm@0.12.15 — PASS but catastrophically slow.** Correctness fine (ssimMin 0.99999975, the highest of the three) but **29.1x slower wall (28,869 ms)**, **0.35x realtime (slower than playback)**, **10.4 encodeFps**. It is a single-thread WASM software H.264 encoder (libx264) with no hardware acceleration and no SAB/threads on this run — software encode of 1080p is inherently ~30x off a hardware encoder.
- **web-demuxer@4.0.0 — NA_ENGINE (honest).** Pure demuxer; does not declare the `transcode` operation. No encode/mux capability — honest NA, not under-declared.
- **remotion-media-parser@4.0.479 — NA_ENGINE (honest).** Parser/metadata library, no encode path; does not declare `transcode`. Honest NA.
- **mp4box@2.3.0 — NA_ENGINE (honest).** ISO-BMFF box muxer/parser with no decode/encode engine; cannot transcode codecs. Honest NA.
- **platform@chrome-149 — NA_ENGINE (honest, well-reasoned).** Its only encode route is `<video>->canvas->MediaRecorder`, which is video-only and drops audio. This scenario requires an AAC audio track (`toAudio: aac`), which the canvas-capture path cannot produce, so it correctly declines (durationMs 3, no oracle attempt). This is an honest capability gap, not a swallowed failure.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/transcode/index.ts:1405-1421 (`id: 'roundtrip_leg2_vp9_to_h264'`), built via `buildVideoScenario`. Input `asset: 'vp9_1080p_10s.webm'`, from VP9/Opus/WebM to H.264/AAC/MP4. Notes confirm the gating rationale: loosened SSIM floor (0.95) bounds cumulative generational loss and catches corruption.
- **Fixture exists:** `fixtures/media/vp9_1080p_10s.webm` = **9,293,670 bytes**, a real VP9 WebM (not synthetic/empty/mock). Golden luma sigs present: `fixtures/golden/vp9_1080p_10s.webm.ssim.json` (76k).
- **Oracle:** `ssim-psnr` at src/core/oracles.ts:1688; worst-frame gate at line 1823 (`minSsim >= t.ssimMin`); candidate output re-decoded by platform at line 1718. Tolerance 0.95 is meaningful (not "anything passes") and the engines cleared it at ~0.99999 with **exactFrames=0**, which is physically consistent with a genuine lossy re-encode (a copy/golden short-circuit would show digest matches / exactFrames=12). `playback-smoke` independently confirms the MP4 plays.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1271 (`transcode`) -> runConversion at adapter.ts:848-855 (`Conversion.init` + `execute()`). Real mediabunny Conversion (read->decode->encode->mux) over a real `BufferTarget`; no canned bytes, no input->output copy, no error swallowing (init validity checked at line 849-853).
- **Cached note:** all three PASS rows are **cached==true** ("cached previous PASS result"). Evidence is reused, not freshly re-run; per the launcher seeding caveat, fresh-run numbers could differ. The correctness verdict is robust (oracle logic + golden are deterministic), but the n=1 timing margins carry staleness risk.
- **Verdict: REAL.** Real 9.3MB VP9 fixture + real golden SSIM signatures + genuine WebCodecs Conversion implementation + meaningful worst-frame SSIM gate that the winner passed via real lossy re-encode (exactFrames=0). No mock data or unfailable gate.

## Confidence & caveats

- **Confidence: high** on the winner ordering. The 1.87x wall/throughput lead over remotion-webcodecs plus 4.6x lower longtask budget, and 29x over ffmpeg.wasm, are decisive even though correctness ties.
- All benches are **n=1, mad=0** — single-sample timing. The margins are large enough to dominate sampling noise, but a multi-sample re-run would tighten the evidence.
- All three PASS rows are **cached==true** (staleness risk per launcher seeding caveat).
- `peakMemory` was not sampled (n=0, median 0) for any engine, so the memory tiebreaker could not be applied; the decision rests on wall/throughput/longtasks, where mediabunny leads on all three.
- The gate is a perceptual SSIM proxy (exactFrames=0, no true RGB PSNR since golden ships no raw pixels) — strong for this lossy round-trip but not bit-exact; this is correct by design for a generational-loss scenario.
