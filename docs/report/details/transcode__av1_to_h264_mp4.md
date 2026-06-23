# transcode/av1_to_h264_mp4

family: transcode | fixture asset: `fixtures/media/av1_720p_5s.webm` (AV1 video + Opus audio in WebM, 1.9 MB) | primaryMetric: wall (ms) | passCount: 2 of 7

## Verdict

- **Best framework: `mediabunny@1.48.0`** (CONTESTED — 2 engines PASS: mediabunny and remotion-webcodecs@4.0.479).
- **Decisive factor: correctness strength.** Both winners pass the identical oracle pair (`ssim-psnr` + `playback-smoke`), so the correctness ladder breaks the tie before performance. mediabunny's re-encoded H.264 reproduces the AV1 source far more faithfully: **SSIM min 0.9999** (mean 0.9999) vs remotion-webcodecs' **SSIM min 0.9812** (mean 0.9814). Both clear the 0.98 floor, but mediabunny sits at the ceiling while remotion-webcodecs is 0.0012 above the failure floor — a ~16x larger SSIM error margin relative to perfect (1 − 0.9812 = 0.0188 vs 1 − 0.9999 = 0.0001).
- **Margin over runner-up:** correctness — mediabunny SSIM distance-from-1 is **~190x smaller** (0.0001 vs 0.0188). Performance is mixed and does not overturn the correctness win: remotion-webcodecs is **1.19x faster wall** (307.85 ms vs 367.69 ms) and **1.19x higher throughputRealtime** (16.27x vs 13.62x), but mediabunny has **~13x less main-thread blocking** (longtasks 173 ms vs 2244 ms). All bench metrics are **n=1** (single sample, mad=0), so the performance numbers are weak evidence; the SSIM gap is the load-bearing signal.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:✓ (min 0.9999), playback-smoke:✓ | 367.69 ms | 13.62x | 0 (not sampled) | 173 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:✓ (min 0.9812), playback-smoke:✓ | 307.85 ms | 16.27x | 0 (not sampled) | 2244 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested AAC audio track |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare video codec 'av1' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

(peakMemory and decodeFps have n=0 / empty samples for both PASS engines — not measured this run.)

## Why the winner wins (deep technical)

The operation is a full cross-codec, cross-container re-encode: **AV1 (in WebM) → H.264 (in MP4)** with **Opus → AAC** audio. This is not a remux — the elementary streams cannot be copied, so the pipeline must (1) demux WebM, (2) hardware-decode AV1 via `VideoDecoder`, (3) re-encode to H.264 via `VideoEncoder`, (4) transcode Opus→AAC, and (5) mux into an MP4. That requirement is exactly why five engines are NA: the four parser/demuxer engines (remotion-media-parser, mp4box, web-demuxer) never declare a `transcode` operation, ffmpeg.wasm refuses because it does not declare the `av1` decode codec, and the platform engine's `<video>→canvas→MediaRecorder` capture path is structurally video-only.

mediabunny runs the real Conversion pipeline. The adapter calls `mb.Conversion.init(opts)` (`src/engines/mediabunny/adapter.ts:848`) and `await conversion.execute()` (`src/engines/mediabunny/adapter.ts:855`), driving mediabunny's read→decode→encode→mux engine. Per `env.configUsed`, it ran `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"` — i.e. hardware WebCodecs on the Apple M1 Max Metal stack with no cross-origin-isolation requirement. Critically, the H.264 encode config is **probed with `mb.canEncodeVideo` (`src/engines/mediabunny/adapter.ts:639`) before committing**, and the resolution-aware bitrate target (`buildVideoBitrate`, see adapter.ts:~505-513 with a 300 kbps floor) is chosen so the encoder is never handed a config it rejects mid-stream. The `hardwareAcceleration` mode is set on the Conversion (`adapter.ts:604/657`). This high, well-chosen bitrate is the mechanistic reason the output is near-perceptually-lossless: SSIM min **0.9999** over 12 paired frames (`oracleOutcomes[0].measurements`: pairs=12, ssimMean=0.9999389, ssimMin=0.9999369). encodeFps measured at **407.95 fps**, longtasks only **173 ms** — the streaming-lockstep pipeline plus a `CanvasSink` ring buffer keeps work off the main thread.

remotion-webcodecs also genuinely transcodes (it produced a decodable MP4 that the platform decoder re-decoded, and it passed playback-smoke), but its encode is perceptibly softer: SSIM min **0.9812**, mean **0.9814** over 12 frames. Its `env.configUsed` shows `pipeline:"streaming-backpressure"`, `writer:"bufferWriter"`, `worker:"convert=main-thread"` — the convert stage runs on the **main thread**, which is consistent with its very high **longtasks=2244 ms** (the encode/mux work blocks the event loop). It is faster in pure wall time (307.85 ms, 16.27x realtime, encodeFps 487.26) but at the cost of (a) lower visual fidelity and (b) ~13x more main-thread jank.

The oracle is a perceptual proxy, not bit-exact: `ssim-psnr` validates against in-browser-decoded **reference source** frames (no committed golden for transcode), reporting "PSNR via golden pixels unavailable (digest proxy: 0/12 exact)" — `exactFrames==0` for both, which is expected for a lossy AV1→H.264 re-encode (the pixels legitimately change). Per the correctness ladder this is the perceptual tier, weaker than bit-exact/structural, but it is the appropriate gate for a lossy transcode. Within that tier the tighter measured fidelity (0.9999 vs 0.9812) is decisive.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, lost):** Correct transcode but lower fidelity — SSIM min 0.9812 vs mediabunny's 0.9999 (190x larger error-from-1). Despite being 1.19x faster on wall (307.85 vs 367.69 ms), it runs convert on the main thread (`worker:"convert=main-thread"`) yielding longtasks 2244 ms (~13x mediabunny's 173 ms). Correctness strength outranks the small wall win.
- **platform@chrome-149 (NA_ENGINE):** Honest NA. Its only re-encode path is `<video>→canvas→MediaRecorder`, which captures video frames only and cannot carry the requested AAC audio track; it correctly declines rather than emitting an audioless MP4.
- **ffmpeg.wasm@0.12.15 (NA_ENGINE):** Honest NA. Does not declare the `av1` decode codec, so it cannot ingest the AV1 source. (This build omits the libaom/dav1d decoder; declining is correct, not under-declared given the wasm build's codec set.)
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA. A parser/probe engine — does not declare the `transcode` operation at all; it has no encode pipeline.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA. A box-level MP4 parser/muxer; does not declare `transcode` and has no decoder/encoder.
- **web-demuxer@4.0.0 (NA_ENGINE):** Honest NA. A demuxer only; does not declare `transcode`.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:161-172` — id `av1_to_h264_mp4`, asset `av1_720p_5s.webm`, fromVideo `av1` / fromAudio `opus` → toVideo `h264` / toAudio `aac`, tolerances `{ ssimMin: 0.98, psnrMinDb: 38 }`.
- **Fixture exists & is real:** `fixtures/media/av1_720p_5s.webm` present, **1.9 MB** real AV1+Opus WebM (not synthetic/empty). Verified via `ls`.
- **Winner adapter is a genuine implementation:** `src/engines/mediabunny/adapter.ts:848` `mb.Conversion.init(opts)` + `:855` `await conversion.execute()`; encode pre-probed at `:639` `mb.canEncodeVideo`, hardware mode set at `:604/:657`. No canned output, no input→output copy (a copy is impossible across AV1→H.264), no short-circuit to golden, no error swallowing — encode failures throw an explicit NA(browser) at adapter.ts:651-653.
- **Oracle is a real comparison:** `src/core/oracles.ts:1688` `ssimPsnr` decodes the candidate output with the platform decoder (`:1718`), pairs frames against in-browser-decoded reference source, computes downsampled-luma SSIM (`:1782-1786`), and gates on the **worst frame** (`:1823` `minSsim >= t.ssimMin`). 12 real paired frames; measured SSIM (0.9999369 min) is physically plausible for a high-bitrate H.264 re-encode of 720p content. Not trivially satisfiable: remotion-webcodecs lands at 0.9812 — only just clearing the 0.98 floor — proving the gate discriminates.
- **Caveat — gate is perceptual, not bit-exact:** `exactFrames==0/12` (digest proxy), so PSNR is reported unavailable and the pass rests on SSIM alone. This is correct for a lossy transcode but is the perceptual tier of the ladder, so the PASS is real but not the strongest possible.
- **Cached note:** mediabunny's result has `cached==true` ("cached previous PASS result"); remotion-webcodecs is also `cached==true`. Both were **reused, not re-run** this session — staleness risk applies to both equally; the comparison is internally consistent but not freshly re-executed.
- **Verdict: WEAK-GATE.** Real fixture + real Conversion implementation + a real discriminating oracle, but the gating oracle is a perceptual SSIM proxy with 0 bit-exact frames (no golden pixels / no PSNR), so the correctness evidence is perceptual rather than structural or bit-exact.

## Confidence & caveats

- **Confidence: high** on the winner identity and the NA reasoning; **medium** on the performance ordering (every bench metric is n=1, mad=0 — a single sample, so wall/throughput/longtasks deltas are indicative only).
- The correctness margin (SSIM 0.9999 vs 0.9812) is robust and is what decides the contest; it does not depend on the noisy single-sample timings.
- Both PASS results are cached; a fresh re-run could shift timings and slightly move SSIM, but the structural conclusion (mediabunny's high-bitrate hardware re-encode is more faithful) is stable.
- peakMemory was not sampled (n=0) for either engine, so the memory tiebreaker could not be applied.
