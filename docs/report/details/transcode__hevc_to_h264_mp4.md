# transcode/hevc_to_h264_mp4

family: transcode | fixture asset: `hevc_1080p_10s.mp4` (HEVC 1920x1080 @30fps, AAC 48kHz stereo, ~10s, 11 MB) | primaryMetric: throughputRealtime (wall/encodeFps reported) | passCount: 3 / 7

## Verdict

- **Best framework: remotion-webcodecs@4.0.479** — CONTESTED (3 engines PASS: remotion-webcodecs, mediabunny, ffmpeg-wasm).
- **Decisive factor: performance.** All three PASS engines satisfy the identical oracle set (`ssim-psnr` + `playback-smoke`) with statistically indistinguishable correctness (SSIM min ≈ 1.0000, exactFrames=0 for all). Correctness is a tie, so the ranking falls to the performance ladder, where remotion-webcodecs dominates.
- **Margin over runner-up (mediabunny):** wall 1247.9 ms vs 1712.4 ms = **1.37x faster wall**; throughputRealtime 8.01x vs 5.84x = **1.37x higher**; encodeFps 240.4 vs 175.2 = **1.37x higher**; longtasks 173 ms vs 2147 ms = **12.4x less main-thread blocking**. Against ffmpeg-wasm the gap is enormous: **21.4x faster wall** (1247.9 ms vs 26725 ms) and **21.4x higher throughput** (8.01x vs 0.374x).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | **PASS** | ssim-psnr:true, playback-smoke:true | 1247.9 ms | 8.013x | 0 (not sampled) | 173 ms | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:true, playback-smoke:true | 1712.4 ms | 5.840x | 0 (not sampled) | 2147 ms | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true, playback-smoke:true | 26725.1 ms | 0.374x | 0 (not sampled) | 1361 ms | cached previous PASS |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: MediaRecorder canvas-capture path cannot preserve/copy the source AAC audio |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | does not declare operation 'transcode' (parser only) |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | does not declare operation 'transcode' (demuxer only) |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | does not declare operation 'transcode' (box parser/remuxer only) |

(peakMemory/decodeFps carry n=0 samples for every engine — not measured for this scenario, so they are not usable tiebreakers.)

## Why the winner wins (deep technical)

This is the hard reverse direction: decode **HEVC/H.265 in MP4** and re-encode to **H.264/AVC in MP4**, carrying the AAC stereo track through. On an Apple M1 Max (ANGLE Metal renderer), the M1's media engine has both an HEVC hardware decoder and an H.264 hardware encoder, so the winning strategy is to keep the whole decode→encode loop on WebCodecs hardware and never touch wasm software codecs.

**remotion-webcodecs** does exactly that. `env.configUsed` shows `backend:"webcodecs"`, `hwAccel:"prefer-hardware(+software fallback)"`, `pipeline:"streaming-backpressure"` with `queueDepth:"waitForQueueToBeLessThan"` and `worker:"convert=main-thread; extractFrames/parse=worker-capable"`. The hardware HEVC `VideoDecoder` feeds VideoFrames straight into a hardware H.264 `VideoEncoder` under explicit encoder-queue backpressure (`waitForQueueToBeLessThan`), which is why it hits **encodeFps 240.4** (8x real time for a 30fps source → 8.013x realtime) while keeping the main thread almost free (**longtasks only 173 ms** across the whole 10s clip). The backpressure loop is what gives it the cleanest main-thread profile of the three.

**mediabunny** runs the same fundamental WebCodecs hardware path — `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, and `buildVideoOptions` (`src/engines/mediabunny/adapter.ts:608-657`) probes encodability with `mb.canEncodeVideo(...isConfigSupported)` in mode order `[prefer-hardware, no-preference, prefer-software]` before committing, so it genuinely selects the H.264 hardware encoder. The conversion itself is a real `Conversion.init({input,output}).execute()` (`runConversion`, `src/engines/mediabunny/adapter.ts:842-868`), invoked from `transcode()` at `src/engines/mediabunny/adapter.ts:1271-1322`, with `convOpts.trim={start:0,end:inputDuration}` to copy the full clip. It is correct and only 1.37x slower on wall — but its `pipeline:"streaming-lockstep"` (decode and encode advance in lockstep rather than under async queue-depth backpressure) serializes more work on the main thread: **longtasks 2147 ms**, 12.4x worse than remotion-webcodecs, even though wall time is close. That main-thread cost is the concrete reason it loses the contest despite identical correctness.

**ffmpeg.wasm** is the outlier. `engineId:"ffmpeg-wasm"`, single-thread wasm (no SharedArrayBuffer/COOP-COEP needed but also no hardware): it decodes HEVC and encodes H.264 entirely in software libavcodec compiled to wasm. That yields **encodeFps 11.2** and **wall 26725 ms** — 21.4x slower than the winner and below real time (0.374x). It is the most *accurate* on paper (ssimMean 0.99999985, the highest of the three) but accuracy is moot when all three already clear the SSIM≥0.98 gate; the 70x encode-fps deficit decides it.

The oracle measurements confirm the correctness tie is real, not fabricated: `ssim-psnr` paired 12 candidate frames against the committed downsampled-luma golden (`fixtures/golden/hevc_1080p_10s.mp4.ssim.json`, side=16 / 256-value Rec.601 luma sigs) and got ssimMin 0.99999101 (remotion-webcodecs), 0.99999710 (mediabunny), 0.99999977 (ffmpeg-wasm) — all far above the 0.98 tolerance. Because no raw golden pixels are committed, `exactFrames=0` and PSNR is reported as a digest proxy only (oracles.ts:1799-1810), so the SSIM gate is the binding correctness check and it does not separate the three.

## What each other framework did wrong

- **mediabunny@1.48.0 (PASS, lost on perf):** correct via real `Conversion.execute()` on hardware H.264, but 1.37x slower wall (1712.4 vs 1247.9 ms), 1.37x lower throughput (5.84x vs 8.01x), and — decisively — 12.4x more main-thread blocking (longtasks 2147 ms vs 173 ms) because of its `streaming-lockstep` pipeline vs the winner's `streaming-backpressure` queue.
- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** software libavcodec in single-thread wasm; 21.4x slower wall (26725 ms), 0.374x realtime (below playback speed), encodeFps only 11.2 vs 240.4. Highest SSIM but that margin is irrelevant above the shared 0.98 gate.
- **platform@chrome-149 (NA_ENGINE — honest):** its transcode path is `<video>→canvas→MediaRecorder` (video-only, lossy real-time capture). The fixture carries an AAC track and the canvas-capture pipeline cannot preserve or copy audio, so the adapter correctly declines (`src/engines/platform/adapter.ts:14,23` document the audio-drop limitation). Honest NA, not an under-declared capability.
- **remotion-media-parser@4.0.479 (NA_ENGINE — honest):** a media *parser*; does not declare the `transcode` operation. No encode capability — genuine.
- **web-demuxer@4.0.0 (NA_ENGINE — honest):** a *demuxer*; does not declare `transcode`. No encode path — genuine.
- **mp4box@2.3.0 (NA_ENGINE — honest):** an ISOBMFF box parser/remuxer; does not declare `transcode` and has no codec. Genuine NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:127-136` — `id:'hevc_to_h264_mp4'`, `asset:'hevc_1080p_10s.mp4'`, fromVideo `hevc` + fromAudio `aac` → toContainer `mp4`, toVideo `h264`, tolerances `{ssimMin:0.98, psnrMinDb:38}`. Real codec-change transcode, not a remux.
- **Fixture exists and is real:** `fixtures/media/hevc_1080p_10s.mp4` present, 11 MB. Golden meta (`fixtures/golden/hevc_1080p_10s.mp4.meta.json`) confirms HEVC 1920x1080@30fps bitrate 8.71 Mbps + AAC 48kHz stereo — physically plausible for a 10s 1080p HEVC clip. Not synthetic/empty/mock.
- **Winner adapter genuinely implements transcode:** `src/engines/mediabunny/...` n/a (winner is remotion-webcodecs). For the winner remotion-webcodecs, `env.configUsed` shows a real WebCodecs `VideoDecoder`→`VideoEncoder` streaming-backpressure pipeline (encode=main-thread, parse worker-capable); the runner-up mediabunny's path (`src/engines/mediabunny/adapter.ts:1271-1322` → `runConversion` :842-868 → `Conversion.init/execute`) is a real library conversion with `canEncodeVideo` hardware probing (:608-657). No canned output, no input→output copy (codec actually changes HEVC→H.264), no golden short-circuit, no error swallowing (invalid conversions throw at :849-853).
- **Oracle is a real comparison (but a proxy):** `ssim-psnr` (`src/core/oracles.ts:1688-1810`) pairs platform-redecoded output frames against the committed golden luma signatures and computes block-averaged Rec.601 SSIM; gate is SSIM≥0.98. Because golden ships no raw pixels, `exactFrames=0` and PSNR is a digest proxy — so this is a perceptual proxy gate, not bit-exact. Measurements (12 pairs, ssimMin 0.999991–0.9999998) are physically plausible for a hardware HEVC→H.264 re-encode of real footage. `playback-smoke` only confirms the <video> element renders frames.
- **Cached note:** ALL three PASS results have `cached:true` ("cached previous PASS result"). The numbers were reused, not freshly re-run — staleness risk applies to the exact wall/throughput figures, though the relative ordering is robust (HW WebCodecs vs SW wasm gap is structural).
- **Verdict: WEAK-GATE.** The implementation and fixture are real and the transcode genuinely changes codec, but the binding correctness oracle is a perceptual SSIM proxy with exactFrames=0 and no golden-pixel PSNR — a real PASS, but not a strong (bit-exact/structural) gate. No evidence of cheating.

## Confidence & caveats

- **Confidence: medium.** Winner selection is unambiguous on the performance ladder (consistent 1.37x wall/throughput/encodeFps edge plus 12.4x lower longtasks over mediabunny; 21.4x over ffmpeg-wasm). But three caveats temper it: (1) the gating oracle is a perceptual proxy (WEAK-GATE, exactFrames=0), so correctness cannot separate the engines and the entire decision rests on perf; (2) every metric is **n=1** (mad=0, p95=median) — single-sample timings are weak evidence, and a 1.37x wall gap could narrow under repeated runs, though longtasks 173 vs 2147 ms is a structural pipeline difference unlikely to flip; (3) all winners are **cached**, so figures may be stale. peakMemory/decodeFps were not sampled (n=0) and could not be used as tiebreakers.
