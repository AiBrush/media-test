# transcode/bframe_reorder_h264_to_h264

family: transcode | fixture asset: `fixtures/media/h264_bframes_1080p.mp4` (1920x1080 H.264, has_b_frames=2, 300 frames, 10.0s, +AAC audio) | primaryMetric: throughputRealtime | passCount: 2/7

## Verdict

- **Best framework: `mediabunny@1.48.0`** (CONTESTED — 2 engines PASS: mediabunny and ffmpeg.wasm).
- **Decisive factor: PERFORMANCE.** Correctness is a tie (both engines pass `ssim-psnr` with SSIM≈1.0000 over 12 frames and `playback-smoke`; neither produced any digest-exact frames, so both rest on the luma-SSIM proxy at identical strength). The tiebreak therefore falls to performance, where mediabunny's hardware-WebCodecs encode crushes ffmpeg.wasm's single-thread software encode.
- **Margin over runner-up (ffmpeg.wasm):** throughputRealtime 9.928x vs 0.415x = **23.9x faster** real-time; wall median 1007.25 ms vs 24094.125 ms = **23.9x lower** wall; encodeFps 297.84 vs 12.45 = **23.9x higher** encode fps; longtasks 403 ms vs 142 ms (ffmpeg lower here — but ffmpeg's main-thread time is dwarfed by total wall). Both samples are n==1 (single timed run, mad=0), so the magnitude estimate is from one observation — but a ~24x gap is far beyond any plausible run-to-run noise.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:pass, playback-smoke:pass | 1007.25 ms | 9.928 x | 37,513,017 B | 403 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass, playback-smoke:pass | 24094.125 ms | 0.415 x | 0 (not sampled) | 142 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA — source carries audio; MediaRecorder canvas-capture path cannot preserve/copy audio |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | B-frame reorder sources not reliably re-encoded by this package |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

**The operation.** This is a re-encode of an open-GOP / B-frame H.264 1080p source back to H.264 in MP4. The fixture's `has_b_frames=2` means the bitstream uses bidirectional prediction, so decode order (DTS) differs from presentation order (PTS). The scenario notes (`src/scenarios/transcode/index.ts:951-953`) call out exactly this: a correct engine must drive frames through its decoder in DTS order and re-emit them in PTS order before encoding, otherwise the SSIM check in presentation order collapses because frames land out of sequence.

**Winner backend (from `env.configUsed`).** mediabunny ran `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false`, on an Apple M1 Max (ANGLE Metal). It used the platform's hardware H.264 decoder and encoder via WebCodecs. ffmpeg.wasm ran a vendored single-thread libx264 software encode (`wasmThreads: 0`) entirely in the wasm VM.

**Mechanism of the win.** mediabunny's `transcode()` (`src/engines/mediabunny/adapter.ts:1271`) opens the input, builds `ConversionVideoOptions` via `buildVideoOptions` (which probes `VideoEncoder.isConfigSupported` before committing so it never feeds the encoder an unsupported config), then runs the whole read→decode→encode→mux through `mb.Conversion.init` + `conversion.execute()` (`src/engines/mediabunny/adapter.ts:842-855`). The Conversion's streaming-lockstep pipeline lets the WebCodecs hardware decoder handle the B-frame DTS→PTS reorder internally and hands ordered `VideoSample`s to the hardware encoder. The result: encodeFps **297.84**, wall **1007.25 ms** for a 10s clip = **9.928x realtime**, peakMemory ~37.5 MB. The `ssim-psnr` oracle measured `pairs:12, ssimMean:0.9999991528, ssimMin:0.9999973854` — essentially perfect, confirming the reorder was handled correctly (any reorder bug would have driven minSSIM far below the 0.98 gate).

ffmpeg.wasm's `transcode()` (`src/engines/ffmpeg-wasm/adapter.ts:2165`) is also a genuine re-encode — it maps the input, selects a real software encoder via `videoEncoderName` and passes `-c:v <enc>` to a real wasm `ff.exec` (`src/engines/ffmpeg-wasm/adapter.ts:2300`, run via `this.run` at 2256/2138). It too produced essentially perfect pixels (`ssimMean:0.9999999032, ssimMin:0.9999998306`), so correctness is a genuine tie. But single-thread libx264-in-wasm tops out at encodeFps **12.45**, wall **24094.125 ms** = **0.415x realtime** — i.e. it takes 2.4x the clip's real duration to transcode it. peakMemory was not sampled (0, n=0) for ffmpeg.

So the correctness ladder (per the decision procedure) places both at the same rung — perceptual proxy `ssim-psnr` with `exactFrames==0` plus `playback-smoke`, identical oracle set — and performance decides it 23.9x in mediabunny's favour. Tiebreakers reinforce the same verdict: hardware WebCodecs vs single-thread wasm, and `coopCoep: not-required` (no COOP/COEP header requirement, no SharedArrayBuffer) for mediabunny.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correct output (SSIM≈1.0) but single-thread software libx264 in wasm — 0.415x realtime / 24.1s wall / 12.45 encodeFps, a **23.9x** deficit on every throughput metric vs mediabunny. Real implementation, just slow.
- **platform@chrome-149 (NA_ENGINE, honest):** its transcode path is `<video>→canvas→MediaRecorder`. The source has an AAC audio track and the canvas-capture path cannot preserve/copy audio, so it correctly declines rather than silently dropping audio. Honest capability NA, not under-declaration.
- **mp4box@2.3.0 (NA_ENGINE, honest):** MP4Box.js is a demux/remux/box-layout library with no encoder — it does not declare `transcode`. Genuine capability gap.
- **remotion-webcodecs@4.0.479 (NA_ENGINE, plausibly honest):** declares transcode generally but explicitly opts out of B-frame-reorder sources ("not reliably re-encoded by this package"). This is a feature-specific self-exclusion; it looks honest (its own decode-reorder handling is the named weakness), though it is conservative — it could in principle drive WebCodecs like mediabunny does.
- **web-demuxer@4.0.0 (NA_ENGINE, honest):** demux-only (libav-based demuxer); no encode path, does not declare `transcode`.
- **remotion-media-parser@4.0.479 (NA_ENGINE, honest):** a parser/probe library; no encoder, does not declare `transcode`.

## Anti-cheat validation

- **Scenario:** `src/scenarios/transcode/index.ts:942` (`id: 'bframe_reorder_h264_to_h264'`, asset `h264_bframes_1080p.mp4`), built via `buildVideoScenario`. Tolerances `ssimMin: 0.98, psnrMinDb: 38`. Notes (lines 951-953) document the reorder-correctness intent.
- **Fixture exists and is real:** `fixtures/media/h264_bframes_1080p.mp4`, 11 MB. ffprobe confirms `codec_name=h264`, `1920x1080`, `has_b_frames=2`, `nb_frames=300`, `duration=10.0s`, plus AAC audio. Not synthetic/empty/mock.
- **Winner adapter genuine:** `src/engines/mediabunny/adapter.ts:1271` (`transcode`) → `runConversion` at `:842-855` calls real `mb.Conversion.init` + `conversion.execute()` and checks `conversion.isValid` (throws on no usable output tracks). No canned bytes, no input→output copy, no short-circuit to golden, no swallowed errors. Encoder config is pre-validated with `VideoEncoder.isConfigSupported`.
- **Oracle genuine:** `ssim-psnr` at `src/core/oracles.ts:1688`. For a no-committed-golden transcode it re-decodes the engine output with the platform decoder and compares against in-browser-decoded reference frames; the gate is on the WORST frame `minSsim >= t.ssimMin` (0.98), not the mean (line 1823). Measurements are physically plausible (12 paired frames, SSIM 0.99999+). Note: this is a **perceptual proxy** — `exactFrames==0` for both engines (re-encode is lossy, so no digest-exact frames; PSNR via golden pixels unavailable), and `playback-smoke` is smoke-only. The reorder property itself IS exercised, because a DTS/PTS reorder bug would scramble presentation order and drop minSSIM below 0.98.
- **Cached note:** mediabunny's winning result has `cached==true` ("cached previous PASS result"), as does ffmpeg.wasm. The reported numbers were reused, not freshly re-run — staleness risk noted (per memory: launcher seeding can reuse stale PASS). The verdict is robust regardless: the 23.9x performance gap and the codec/backend asymmetry (hardware WebCodecs vs single-thread wasm) would not invert on a re-run.
- **Verdict: WEAK-GATE.** Real fixture + real implementation, but the gating oracle is a perceptual/proxy gate (luma-SSIM with `exactFrames==0`) plus a smoke check — a genuine PASS but not a bit-exact or structural-exact correctness proof. Not CHEAT (no faked output) and not SUSPECT in substance (the gap is real and mechanistically explained); the only caveats are the proxy oracle and the cached evidence.

## Confidence & caveats

- Confidence: **high** on the winner. Two real implementations both pass; the performance margin (23.9x) is enormous and mechanistically grounded (hardware WebCodecs vs single-thread wasm libx264), so the tiebreak is unambiguous even though both bench samples are n==1.
- Caveats: (1) the correctness gate is a perceptual proxy, not bit-exact — both engines could in principle have subtle pixel drift below the 0.98 floor that this oracle tolerates; (2) both winning results are `cached==true`, so numbers are reused; (3) n==1 timing means the exact ratio (23.9x) carries single-sample uncertainty, though the order of magnitude is secure; (4) remotion-webcodecs' NA is self-declared and conservative — it may be technically capable of this case.
