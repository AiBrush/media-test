# transcode/av1_to_vp9_webm

family: transcode | fixture asset: `fixtures/media/av1_720p_5s.webm` (AV1 video + Opus audio, ~1.9 MB) | primaryMetric: wall (ms) | passCount: 2 of 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 2 engines PASS: mediabunny and remotion-webcodecs).
- **Decisive factor: performance.** Correctness is a dead heat — both pass the *identical* oracle set (`ssim-psnr`, `playback-smoke`) with statistically indistinguishable SSIM (mediabunny min 0.9999360 / mean 0.9999387 vs remotion min 0.9999384 / mean 0.9999397, both ≥ 0.97 gate, both `exactFrames=0`). The tie breaks on wall time and main-thread responsiveness.
- **Margin over runner-up (remotion-webcodecs):** **1.62x faster wall** (495.81 ms vs 804.19 ms), **1.62x higher throughputRealtime** (10.10x vs 6.23x), **1.62x higher encodeFps** (302.5 vs 186.5), and **6.4x fewer long-task ms** (403 ms vs 2577 ms on the main thread). All bench points are `n=1` (single sample, `mad=0`, `p95=median`), so the margin is real but rests on one run per engine — weaker statistical evidence; see caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | ssim-psnr:pass, playback-smoke:pass | 495.81 ms | 10.10x | 0 (not sampled) | 403 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass, playback-smoke:pass | 804.19 ms | 6.23x | 0 (not sampled) | 2577 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA — source carries audio and the MediaRecorder canvas-capture path cannot preserve/copy audio |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare video codec 'av1' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Note: `peakMemory` and `decodeFps` were not sampled (`n=0`, empty `samples[]`) for either PASS engine, so memory cannot be used as a tiebreaker.

## Why the winner wins (deep technical)

The operation is a **video re-encode inside the same container family**: AV1 → VP9, both carried in WebM (Matroska/EBML), with the source's Opus audio copied through (`opts: { container: 'webm', video: { codec: 'vp9' } }` — no `audio` block, so audio is passed through, per `src/scenarios/transcode/index.ts:577-586`). This is a *transcode*, not a remux: the AV1 bitstream must be fully decoded to raw frames and re-encoded as VP9. There is no committed golden, so the gate runs in §5.2 "reference-source" mode — the engine output is re-decoded by the platform decoder and SSIM-compared against the in-browser-decoded SOURCE (`src/core/oracles.ts:1737-1738`).

mediabunny drives this through its high-level **Conversion** API: `mb.Conversion.init(opts)` then `conversion.execute()` (`src/engines/mediabunny/adapter.ts:848-855`), which runs a fused read→decode→encode→mux pipeline (`pipeline: "streaming-lockstep"` from `env.configUsed`). The decode leg uses a hardware AV1 `VideoDecoder` (`hwAccel: "prefer-hardware"`), and the VP9 encode config is **probed with `canEncodeVideo` / WebCodecs `isConfigSupported` before committing** so it never hands the Conversion a config the browser rejects mid-stream (`src/engines/mediabunny/adapter.ts:527-651`). Crucially, mediabunny applies a **resolution-aware numeric VP9 bitrate floor** rather than a quality enum (`DEFAULT_VIDEO_BITRATE` logic at `adapter.ts:502-527`) because VP9 hardware encoders are scarce and reject small/low-bitrate frames; for a 720p clip this lands on a software VP9 encoder path that stays fed. The result: **495.81 ms wall, 302.5 encodeFps, only 403 ms of long tasks** — the lockstep pipeline keeps the encode queue saturated without stalling the main thread.

remotion-webcodecs produces a *correct* output (SSIM 0.9999384, playback-smoke OK) via its own WebCodecs decode→encode→mux path (`backend: "webcodecs"`, `hwAccel: "prefer-hardware(+software fallback)"`, `pipeline: "streaming-backpressure"`, `writer: "bufferWriter"`). But it is **1.62x slower (804.19 ms)** and, more tellingly, spends **2577 ms in long tasks vs mediabunny's 403 ms — a 6.4x worse main-thread responsiveness profile**. Its config shows `convert=main-thread` (`worker: "convert=main-thread; extractFrames/parse=worker-capable"`), meaning the conversion loop itself runs on the main thread; combined with `waitForQueueToBeLessThan` backpressure, that is the mechanistic source of both the higher wall time and the much larger long-task budget. The `adapterFastPaths` it advertises (MP4 sample-table http-range, MOV→MP4 ftyp rewrite) are irrelevant here — this is a WebM input with no MP4/MOV fast path to take, so remotion runs its general re-encode loop with no shortcut.

Both engines report `exactFrames=0`: no output frame is byte-identical to the source (expected — VP9 re-encode is lossy relative to the AV1 source), so the gate rests purely on the downsampled-luma-signature SSIM, which is essentially saturated at ~0.99994 for both. Correctness is therefore genuinely comparable, and performance is the only honest discriminator. mediabunny wins it on every measured axis (wall, throughput, encodeFps, longtasks).

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** Correct output (SSIM min 0.9999384 ≥ 0.97, playback-smoke pass) but 1.62x slower wall (804.19 ms vs 495.81 ms), 1.62x lower throughput (6.23x vs 10.10x), 1.62x lower encodeFps (186.5 vs 302.5), and 6.4x more long-task ms (2577 vs 403). Root cause: `convert=main-thread` conversion loop under `streaming-backpressure`, which serializes the re-encode on the UI thread.
- **platform@chrome-149 (NA_ENGINE):** Honest NA — its transcode path is `<video>→canvas→MediaRecorder`, which captures only video pixels and **cannot preserve/copy the source's Opus audio track**. Since the fixture carries audio, the canvas-capture pipeline structurally cannot produce a faithful transcode. This is a genuine runtime limitation, not an under-declaration.
- **ffmpeg.wasm@0.12.15 (NA_ENGINE):** Honest NA — "engine does not declare video codec 'av1'". The 0.12.15 wasm build's libavcodec is compiled without an AV1 decoder, so it cannot ingest the AV1 source. Genuine capability gap.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — "engine does not declare operation 'transcode'". MP4Box is an ISOBMFF box parser/(re)muxer with no encode/decode pipeline; transcode is correctly out of scope.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA — "engine does not declare operation 'transcode'". It is a parser only (no encoder), so transcode is correctly not declared.
- **web-demuxer@4.0.0 (NA_ENGINE):** Honest NA — "engine does not declare operation 'transcode'". It is a demuxer (libav-based packet extraction) with no encode side; transcode is correctly out of scope.

All five NA verdicts are honest: the two that lack codec/audio capability (ffmpeg.wasm, platform) and the three parser/demuxer/muxer-only engines (mp4box, remotion-media-parser, web-demuxer) genuinely cannot perform a video re-encode.

## Anti-cheat validation

- **Scenario:** `src/scenarios/transcode/index.ts:577-586` — `id: 'av1_to_vp9_webm'`, `asset: 'av1_720p_5s.webm'`, fromVideo `av1`/fromAudio `opus`/fromContainer `webm` → toContainer `webm`/toVideo `vp9`, `tolerances: { ssimMin: 0.97, psnrMinDb: 36 }`. Notes confirm "AV1→VP9 within WebM, audio copied. NA(browser) where AV1 decode is absent."
- **Fixture:** `fixtures/media/av1_720p_5s.webm` exists, ~1.9 MB — a real AV1/Opus WebM clip, not synthetic/empty/mock. Input is genuine.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:848-855` (`Conversion.init` + `conversion.execute()`), encode-config probing at `:527-651`, bitrate-floor logic at `:502-527`. The transcode genuinely calls the mediabunny Conversion library (real decode→encode→mux); it does NOT return canned output, copy input→output, short-circuit to a golden, or swallow errors (`isValid` is checked and a missing output buffer throws, `adapter.ts:849-861`).
- **Oracle:** `src/core/oracles.ts:1688` (`ssimPsnr`), reference-source branch `:1737-1738` → `ssimVsReferenceSource`. It re-decodes the engine output with the platform decoder, FAILs cleanly on 0 frames / undecodable output (`:1729-1734`), and gates on the worst-frame SSIM (`minSsim >= t.ssimMin`, `:1823`). Measurements (pairs=12, exactFrames=0, SSIM ~0.99994) are physically plausible for a lossy AV1→VP9 re-encode of a 5 s 720p clip.
- **Verdict: WEAK-GATE.** The implementation and fixture are real, but the gating oracle is a perceptual proxy, not bit-exact: there is no committed golden, `exactFrames=0` for both engines (no PSNR — `psnrMinDb: 36` is declared but never measured because golden pixels are absent, `oracles.ts:1824-1828`), and the second oracle (`playback-smoke`) is smoke-only. The SSIM gate (0.97) is loose relative to the observed 0.99994 — anything visually close passes. PASS is real but not a strong correctness signal; the win is decided on performance, which is sound.
- **Cached note:** BOTH PASS engines have `cached: true` ("cached previous PASS result"). Results were reused, not re-run this session — staleness risk. The performance margin (1.62x wall) was measured in different prior runs (mediabunny startedAt 13:52 UTC, remotion 17:01 UTC), so cross-engine timing comparison carries cache + cross-run noise.

## Confidence & caveats

- **Confidence: medium.** Clear, consistent perf margin across four metrics all pointing the same way (1.62x / 6.4x), and an honest, well-documented NA picture for the other five engines.
- Both PASS results are **cached** and each bench metric is **n=1** (`mad=0`, `p95=median`) — single-sample timings reused from prior runs at different timestamps. The direction of the win is robust (every axis favors mediabunny, longtasks by 6.4x), but the exact ratios should not be over-interpreted.
- Correctness is a genuine tie (identical oracle set, SSIM differing only at the 5th decimal); the verdict is a **performance** decision, not a correctness one.
- The gate is a perceptual proxy with no bit-exact / PSNR backing (`exactFrames=0`), hence the WEAK-GATE validation — a correct-but-low-quality VP9 encode could still pass at SSIM 0.97, though both engines land far above that.
