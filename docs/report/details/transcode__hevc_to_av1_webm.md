# transcode/hevc_to_av1_webm

- **family:** transcode
- **fixture asset:** `fixtures/media/hevc_1080p_10s.mp4` (11,061,061 bytes; HEVC video + AAC audio in MP4)
- **operation:** transcode HEVC/MP4 → AV1/WebM (AAC→Opus audio re-encode forced by WebM container)
- **primaryMetric:** throughputRealtime
- **passCount:** 1 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **UNCONTESTED** (only engine with status=PASS).
- **Decisive factor:** mediabunny is the only engine that both *declares* the `transcode` operation AND ships a working WebCodecs **AV1 encoder** path (probed via `isConfigSupported`) plus an **Opus** audio re-encode for the WebM target. Every other engine either does not declare `transcode`, declares no AV1 encoder, or its capture path drops audio.
- **Margin over runner-up:** N/A — no runner-up cleared the gate (all 6 others are NA_ENGINE). The win is by eligibility, not by metric margin.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | ssim-psnr:pass, playback-smoke:pass | 3232.13 ms | 3.094 x-realtime | 0 (not sampled) | 3675 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA — MediaRecorder canvas-capture path is video-only, drops audio; cannot produce the requested audio track |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare video codec 'av1' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | Remotion WebCodecs 4.0.479 exposes no AV1 encoder |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Bench note: this row is `cached==true`, n==1 for every metric (mad=0, p95==median — single sample, no spread). `encodeFps` median = 92.82 fps; `peakMemory`/`decodeFps` have n==0 (not sampled). The throughputRealtime 3.094x means the 10s clip transcoded in ~3.23s wall.

## Why the winner wins (deep technical)

This scenario is a *cross-codec re-encode*, not a remux: HEVC and AV1 share no bitstream, so the source must be **fully decoded** (HEVC → raw frames) and **re-encoded** (raw → AV1), and because the destination container is WebM (which cannot legally carry AAC), the AAC audio must also be **transcoded to Opus**. That requires three real capabilities in one pipeline: an HEVC decoder, an AV1 encoder, and an Opus encoder, all wired through a muxer that emits WebM. Only mediabunny supplies all three.

Mechanistically, mediabunny drives Chromium's WebCodecs via its `Conversion` API. The adapter builds `ConversionVideoOptions` and, critically, **probes encodability before committing**: `buildVideoOptions` calls `mb.canEncodeVideo(codec, {width, height, bitrate, hardwareAcceleration})` in preference order `[HW_ACCEL, 'no-preference', 'prefer-software']` for AV1 (AV1 is not in `SOFTWARE_PREFERRED_ENCODE`) — `src/engines/mediabunny/adapter.ts:622-645`. The first mode whose `VideoEncoder.isConfigSupported` returns true is chosen; if none can encode, it throws an explicit `NA(browser)` message rather than entering a doomed encode (`adapter.ts:647-655`). On this M1 Max / Chrome 149 host the env reports `backend:"webcodecs"`, `hwAccel:"prefer-hardware"` — so AV1 was accepted (software libaom fallback is available even when hardware AV1 encode is absent). The bitrate is resolution-aware (`defaultVideoBitrate`, av1 efficiency factor 0.6, `adapter.ts:520,610-614`) so the encoder is never starved into the WebCodecs minimum-bitrate rejection that bites VP9/VP8. The Conversion is then validated (`conversion.isValid`, discarded-track reasons surfaced) and executed: `Conversion.init` → `conversion.execute()` at `adapter.ts:848-855`. This is a genuine decode→encode→mux through the real library, with a `VideoSample.copyTo(RGBA)>canvas` pixel backend and a 4-slot canvas pool (`configUsed.canvasPoolSize:4`), no SharedArrayBuffer / COOP+COEP required.

The gate is the `ssim-psnr` oracle (`src/core/oracles.ts:1688`). For transcode there is no committed golden *output* file, but there IS a committed per-frame reference for the SOURCE: `fixtures/golden/hevc_1080p_10s.mp4.ssim.json` (75 KB, `{assetId, side, sigs}`) carrying downsampled-luma signatures of the source frames. The oracle takes the `haveGolden` branch: it platform-decodes mediabunny's AV1/WebM output, derives a downsampled-luma signature per candidate frame, and computes signature-SSIM against the source sigs, gating on the **worst** frame (`minSsim >= t.ssimMin`, `oracles.ts:1823`). Measured: `pairs:12, ssimMean:0.9999426, ssimMin:0.9999408, exactFrames:0` — i.e. all 12 sampled frames of the AV1 output are perceptually identical (SSIM ≈ 0.99994) to the original HEVC frames, comfortably clearing the 0.97 floor. `exactFrames:0` is expected and correct here: AV1 is a different lossy codec, so no decoded frame is *byte*-identical to the source (digest proxy yields 0/12), but structural similarity is essentially 1.0 — exactly the signature of a faithful re-encode rather than a copy or a corrupted output. The second oracle, `playback-smoke` (`oracles.ts:1574`), confirms a real `<video>` element decoded and played several frames of the WebM output, proving the muxed AV1+Opus WebM is actually demuxable/decodable by the browser, not just a structurally plausible blob.

## What each other framework did wrong

- **platform@chrome-149** — NA_ENGINE (honest). Its transcode path is `<video>→canvas→MediaRecorder`; MediaRecorder canvas-capture is video-only and would drop the audio track, so it cannot produce the required Opus audio. This is a genuine capability gap for an A/V transcode, correctly declared rather than faked. (Chrome itself can decode HEVC and encode AV1; the limitation is the engine's capture-based transcode topology, not the codec.)
- **ffmpeg.wasm@0.12.15** — NA_ENGINE (honest, capability-token level). Declares no `av1` video codec for encode in its registry, so it is short-circuited before any run. The 0.12.x single-thread wasm build ships without an AV1 (aom/SVT) encoder.
- **remotion-webcodecs@4.0.479** — NA_ENGINE (honest). `durationMs:2`; reason "Remotion WebCodecs 4.0.479 exposes no AV1 encoder." It declares transcode generally but explicitly lacks the AV1 encode target, so it self-NAs in pre-flight.
- **remotion-media-parser@4.0.479** — NA_ENGINE (honest). A *parser*, not a transcoder; does not declare the `transcode` operation at all.
- **web-demuxer@4.0.0** — NA_ENGINE (honest). A demux-only library; does not declare `transcode`.
- **mp4box@2.3.0** — NA_ENGINE (honest). An MP4 box/remux library; does not declare `transcode` (and could not target WebM regardless).

All six NAs are genuine capability gaps, not under-declarations: none of these libraries ships an AV1 encoder + Opus encoder + WebM muxer combination that this scenario requires.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:510-522` (`id: 'hevc_to_av1_webm'`, in `CROSS_CODEC_CASES`). asset `hevc_1080p_10s.mp4`, fromVideo hevc / fromAudio aac → toContainer webm / toVideo av1 / toAudio opus; tolerances `ssimMin:0.97, psnrMinDb:36`. notes: "HEVC→AV1: both ends are browser/HW-gated; expect NA on engines/browsers lacking either" — gating rationale matches the 6 NAs observed.
- **Fixture exists & is real:** `fixtures/media/hevc_1080p_10s.mp4` — `stat` = 11,061,061 bytes. Real HEVC/AAC MP4, not synthetic/empty/mock. Source reference golden present: `fixtures/golden/hevc_1080p_10s.mp4.ssim.json` (75 KB, structured `{assetId, side, sigs}`).
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts` — AV1 encode probed via `canEncodeVideo`/`isConfigSupported` (`adapter.ts:629-645`), real `Conversion.init`+`execute` (`adapter.ts:848-855`), validity-checked, instrumented BufferTarget (`adapter.ts:819-838`). No canned output, no input→output copy (cross-codec makes copy impossible), no short-circuit to a golden file, no error-swallowing (it throws explicit NA(browser) on unencodable configs).
- **Oracle is meaningful:** `ssim-psnr` at `src/core/oracles.ts:1688`, gating branch `oracles.ts:1760-1832`; gate is min-frame SSIM ≥ 0.97 against committed source luma signatures, plus `playback-smoke` (`oracles.ts:1574`) requiring real `<video>` playback. Measurements are physically plausible for a real AV1 re-encode: 12 paired frames, SSIM≈0.99994 (high but not 1.0), exactFrames=0 (no byte-identity, as expected for lossy cross-codec). Not trivially satisfiable: a wrong/garbled output scores ~0.84 per the oracle's own note (`oracles.ts:1917-1919`) and would fail; a copy/passthrough is impossible across HEVC→AV1.
- **Cached note:** the winning result has `cached==true` ("cached previous PASS result"). The PASS evidence is therefore reused, not freshly re-run in this batch — staleness risk per the launcher-seeding caveat. The oracle measurements are internally consistent and plausible, but a fresh re-run (clearing raw + .browser-cache) would harden the n==1 bench numbers (currently single-sample, mad=0).

## Confidence & caveats

- **Confidence: high** that mediabunny is the correct and only winner — the eligibility logic is unambiguous (1 PASS, 6 honest NAs), and the implementation + oracle are real.
- **Caveats:** (1) result is cached, so bench metrics are single-sample (n==1, no spread) and could drift on a fresh run; throughput/wall should be re-measured before quoting as performance ground truth. (2) The SSIM gate uses downsampled-luma *signatures* against the source (a perceptual proxy), not full-pixel PSNR against a committed AV1 golden — strong enough to discriminate (0.99994 vs ~0.84 wrong-frame floor) but it is a proxy, not bit-exact. (3) `peakMemory` and `decodeFps` were not sampled (n==0).
