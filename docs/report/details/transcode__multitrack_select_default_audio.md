# transcode/multitrack_select_default_audio

family: transcode | fixture asset: `h264_multitrack.mp4` (fixtures/media/, 4.5 MB, exists) | primaryMetric: wall (ms) | passCount: 3/7

## Verdict

- **Best framework: `remotion-webcodecs@4.0.479`** — CONTESTED (3 engines PASS: remotion-webcodecs, mediabunny, ffmpeg-wasm).
- **Decisive factor: CORRECTNESS STRENGTH first, then performance.** remotion-webcodecs is the only PASS whose `ssim-psnr` gate landed at the bit-exact rung: `exactFrames=12/12` (all 12 paired frames digest-identical, SSIM=1, PSNR=∞). mediabunny and ffmpeg-wasm passed the *same* `ssim-psnr` oracle only via the perceptual luma-signature proxy with `exactFrames=0/12` (SSIM≈0.99999975/0.99999982) — a strictly weaker rung on the correctness ladder. Even ignoring correctness, remotion-webcodecs also wins performance.
- **Margin over runner-up (mediabunny):** wall **497.67 ms vs 806.30 ms → 1.62x faster**; throughputRealtime **20.09x vs 12.40x → 1.62x higher**; encodeFps **602.8 vs 372.1 → 1.62x**; longtasks **632 ms vs 1227 ms → 0.52x (less main-thread blocking)**. Versus ffmpeg-wasm: wall 497.67 ms vs 18,395.90 ms → **36.96x faster**; throughput 20.09x vs 0.54x → 36.96x. All benches are n==1 (no spread/MAD), so the performance margins are single-shot evidence; the correctness gap (exactFrames 12 vs 0) is the robust, repeatable discriminator and stands on its own.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:✓(exact 12/12) · playback-smoke:✓ · property-invariant:✓ | 497.67 ms | 20.09x | 0 (not sampled) | 632 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:✓(exact 0/12) · playback-smoke:✓ · property-invariant:✓ | 806.30 ms | 12.40x | 0 (not sampled) | 1227 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:✓(exact 0/12) · playback-smoke:✓ · property-invariant:✓ | 18,395.90 ms | 0.54x | 0 (not sampled) | 2907 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: MediaRecorder canvas-capture path is video-only, drops audio; cannot produce the requested audio track |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

**Operation/codec/container.** This is an A.16 multi-track re-encode: source `h264_multitrack.mp4` is an MP4 with one H.264 video stream and **two AAC audio tracks** (ffprobe stream order video:0, audio:1, audio:2). The requested output is also `mp4` / `h264` / `aac` (`opts: { container:'mp4', video:{codec:'h264'}, audio:{codec:'aac'} }`, src/scenarios/transcode/index.ts:978-981). The gate is the `ssim-psnr` video-quality oracle plus the `property-invariant` `transcode-output-metadata` invariant (extraOracles + optsInvariant, index.ts:986-987), because transcode does not populate `ctx.metadata` so the invariant re-probes the produced bytes and asserts the requested container/codecs/track-shape survived. The metadata oracle confirmed all three engines produced **mp4 with 1 video + 2 audio tracks** — i.e. both AAC tracks were carried through the re-encode (videoTracks:1, audioTracks:2 in every PASS).

**Backend.** remotion-webcodecs ran on `backend: webcodecs`, `hwAccel: prefer-hardware(+software fallback)`, `pipeline: streaming-backpressure`, `writer: bufferWriter` (env.configUsed). The Apple M1 Max VideoToolbox path decodes/encodes H.264 in hardware. mediabunny used the same WebCodecs hardware backend (`prefer-hardware`, `streaming-lockstep`). ffmpeg-wasm is single-thread wasm software transcode (no SIMD threads here), which is why it is ~37x slower.

**Adapter code path (decisive).** The winner's `transcode()` calls the real Remotion library, not a canned output: it maps the canonical container/codecs and drives `convertMedia` (src/engines/remotion-webcodecs/adapter.ts:521-577). It validates the request (`ensureSupportedTranscodeRequest`, line 526) and asserts requested tracks are present (`assertRequestedTracksPresent`, line 527), maps H.264 video (line 536-538) and AAC audio (line 548-552), then delegates to the shared `convert()` driver (line 576) which probes for moov sizing and runs `wc.convertMedia(...)` with a `bufferWriter` (adapter.ts:593-615). The multiple audio tracks are handled by convertMedia's default per-track copy/reencode handler (no `onAudioTrack` override is installed because no sampleRate/channel change is requested, adapter.ts:564), so both AAC tracks are transcoded through and muxed back — matching audioTracks:2.

**Why bit-exact here.** The `ssim-psnr` oracle (src/core/oracles.ts:1688-1771) decodes the engine output with the platform decoder, pairs against golden/reference frames, and counts a frame as `exact` when the normalized RGBA SHA-256 digest matches (line 1766-1770 → SSIM 1 / PSNR ∞). remotion-webcodecs produced output whose decoded frames were **digest-identical to the reference for all 12 paired frames** (`exactFrames:12, ssimMin:1, ssimMean:1`). The two WebCodecs competitors produced visually identical-to-the-eye output (SSIM ≥ 0.99999946) but with non-matching pixel digests (`exactFrames:0`) — a different encoder/decoder normalization chain. On the correctness ladder this puts remotion-webcodecs at the bit-exact rung and the others at the perceptual-proxy rung, which is the primary tiebreaker before performance even matters. Its duration delta was also the tightest among... actually mediabunny had 0.0693s, ffmpeg-wasm 0.0053s, remotion-webcodecs 0.0210s — all well within the 0.15s tolerance, so duration is not decisive; frame-digest exactness is.

## What each other framework did wrong

- **mediabunny@1.48.0 (PASS, lost):** correct output (mp4, 1v+2a, all oracles pass) but on the weaker correctness rung — `ssim-psnr exactFrames:0/12` (SSIM proxy 0.99999974) vs the winner's 12/12 bit-exact. Also slower: wall 806.30 ms (1.62x the winner), throughput 12.40x (0.62x), longtasks 1227 ms (1.94x more main-thread blocking).
- **ffmpeg.wasm@0.12.15 (PASS, lost):** correct output and all oracles pass, but weakest on both axes — `ssim-psnr exactFrames:0/12`, and single-thread wasm software transcode made it 18,395.90 ms wall (**36.96x slower**), throughputRealtime 0.54x (below realtime), longtasks 2907 ms.
- **platform@chrome-149 (NA_ENGINE):** honest capability gap — the platform transcode path is `<video>→canvas→MediaRecorder`, which is video-only and structurally drops audio, so it cannot emit the requested 2 audio tracks. NA is legitimate, not under-declared.
- **mp4box@2.3.0 (NA_ENGINE):** does not declare the `transcode` operation — honest; MP4Box is a muxer/parser, not an encoder.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** does not declare `transcode` — honest; it is a parser only (no muxer/encoder).
- **web-demuxer@4.0.0 (NA_ENGINE):** does not declare `transcode` — honest; it is a demuxer only.

## Anti-cheat validation

- **Scenario:** src/scenarios/transcode/index.ts:973-988 (`id: 'multitrack_select_default_audio'`), built via `buildVideoScenario`. notes (index.ts:983-985) state the gating rationale: video gated by ssim-psnr, output metadata asserted because transcode does not populate ctx.metadata.
- **Fixture:** `asset: 'h264_multitrack.mp4'` (index.ts:974) → `fixtures/media/h264_multitrack.mp4`, present and 4.5 MB. Real H.264+2×AAC MP4, not synthetic/mock.
- **Winner adapter:** src/engines/remotion-webcodecs/adapter.ts:521-577 (`transcode`) → :580-615 (`convert` → `wc.convertMedia`). Genuinely invokes the Remotion WebCodecs library; validates request and track presence; no canned output, no input→output copy, no short-circuit to golden, no error-swallow-then-pass.
- **Gating oracles:** `ssim-psnr` src/core/oracles.ts:1688 (decodes output, compares per-frame digest + luma-signature SSIM; exactFrames counted via SHA-256 match at :1766). `transcode-output-metadata` invariant src/core/oracles.ts:3626-3708 (re-probes produced bytes with the reference engine and asserts container + per-track video/audio shape at :3655-3700). Both perform real comparisons; measurements are physically plausible (12 frame pairs, mp4, 1 video + 2 audio tracks, sub-0.07s duration deltas).
- **Cached note:** all three PASS results have `cached: true` ("cached previous PASS result"). Evidence was reused, not freshly re-run this session — mild staleness risk, but the cached values are internally consistent and the adapter/oracle code paths are real.
- **Verdict: REAL.** Real fixture + real convertMedia implementation + meaningful bit-exact frame-digest + structural metadata gates. The winner additionally clears the *strictest* rung (exactFrames 12/12) the runners-up did not.

## Confidence & caveats

- Confidence: **high** on the winner and the correctness-based ranking — the exactFrames 12 vs 0 gap is a clean, oracle-measured discriminator independent of the single-shot benches.
- Caveats: (1) all benches are **n==1** (mad=0, p95==median), so the 1.62x / 36.96x performance margins are single-sample; the correctness gap is the load-bearing reason. (2) `peakMemory` was not sampled (n=0) for any engine, so memory could not factor into the tiebreak. (3) All winning results are **cached** — a fresh re-run is advisable for a fully honest leaderboard per the launcher-seeding caveat.
