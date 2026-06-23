# transcode/bframe_reorder_h264_to_vp9

family: transcode | fixture asset: `h264_bframes_1080p.mp4` (real, 11 MB, fixtures/media/) | primaryMetric: throughputRealtime (x-realtime) | passCount: 1/7

## Verdict
- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **No** — uncontested. Exactly one engine reached `status=="PASS"`; the other six are `NA_ENGINE`.
- Decisive factor: mediabunny is the only engine that actually performs a B-frame/open-GOP **H.264-in-MP4 → VP9+Opus-in-WebM** re-encode (decode-reorder across a codec boundary AND a real audio encode). The other six either do not declare `transcode` at all, cannot encode Opus, or cannot carry an audio track.
- Margin over runner-up: not applicable to correctness (no second PASS to compare). Standalone performance: 4.043 x-realtime, wall median 2473.12 ms, encode 121.30 fps over 12 paired frames (n=1).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true, playback-smoke:true | 2473.12 ms | 4.043 x | 0 (not sampled) | 4863 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | libopus encode in vendored wasm core traps or exceeds timeout; Opus encode not declared as reliable transcode path |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | B-frame reorder sources are not reliably re-encoded by this package |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

(peakMemory bench has n==0/samples=[] for mediabunny, i.e. not sampled, reported as 0; decodeFps also n==0.)

## Why the winner wins (deep technical)

The operation is the hardest class of transcode in the matrix: the source `h264_bframes_1080p.mp4` is an **open-GOP H.264 stream with B-frames**, so coded order (DTS) ≠ presentation order (PTS). A correct transcode must decode, reorder into presentation order, re-encode to **VP9**, AND encode an **Opus** audio track, then mux to **WebM**. Any engine that mishandles the decode-reorder lands frames out of order and SSIM collapses; any engine that cannot encode Opus or carry an audio track cannot satisfy the requested output at all.

mediabunny ran on `backend: webcodecs`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false`, `wasmThreads: 0`. The transcode path is genuinely implemented in `src/engines/mediabunny/adapter.ts:1271` (`transcode()`), which builds a real mediabunny `Conversion`: it opens the input, builds video options via `buildVideoOptions` (adapter.ts:542) and audio options, sets an explicit `trim: { start: 0, end: inputDuration }` (adapter.ts:1305) to bound the clip, and dispatches to `runConversion` (adapter.ts:842). `runConversion` calls `mb.Conversion.init(opts)`, checks `conversion.isValid` against `discardedTracks`, then `await conversion.execute()` (adapter.ts:848-855) and returns the real `BufferTarget` bytes (adapter.ts:856-868). No canned output, no input→output copy, no golden short-circuit.

The key VP9-specific correctness lever is in `buildVideoOptions` (adapter.ts:529-535): for codecs with solid hardware encoders (H.264/HEVC/AV1) it prefers GPU, but **for VP9/VP8 it does NOT force hardware** — hardware VP9 encoders are scarce and reject small-frame/low-bitrate configs — and it uses a resolution-aware numeric bitrate instead of the QUALITY_HIGH preset (which collapses to a hardware-rejected ~120 kbps). The encode config is probed with `canEncodeVideo` (WebCodecs `isConfigSupported`) before committing, so the Conversion is never handed a config the browser rejects mid-transcode. This is exactly why mediabunny succeeds where the others bail: it routes VP9 to the software encoder and pairs it with a working Opus audio encode, satisfying the `{ container: 'webm', video: vp9, audio: opus }` request from the scenario (src/scenarios/transcode/index.ts:961-964).

The gate is `ssim-psnr` (oracles.ts:1688), and because this transcode has **no committed golden**, it routes to `ssimVsReferenceSource` (oracles.ts:1842): it reads the source bytes, decodes them in-browser with the platform decoder (`decodeWithPlatform`, oracles.ts:1866), and computes true per-frame `ssim()` (oracles.ts:1898) between the engine's VP9 output frames and the reference H.264 source frames. The shard measurements are physically plausible for a correct reorder-aware transcode: `pairs: 12`, `ssimMean: 0.99999880`, `ssimMin: 0.99999641`, gate `ssimMin ≥ 0.97`. SSIM ≈ 1.0 across 12 presentation-order frames is precisely the signature of a transcode that handled the PTS/DTS reorder correctly — a mishandled reorder would have driven SSIM down toward ~0.84 (the documented wrong-frame score at oracles.ts:1917-1919). `playback-smoke` also passed (the produced WebM played a few frames in `<video>`), confirming the muxed VP9/Opus WebM is browser-decodable.

## What each other framework did wrong
- **platform@chrome-149** — NA_ENGINE (honest). Its encode path is `<video>→canvas→MediaRecorder` (env.configUsed.encode), a canvas-capture pipeline that is video-only and **drops audio**; the scenario requires an Opus audio track, which this path structurally cannot produce. Honest NA, not under-declared.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE (honest). libopus encode in the vendored wasm core traps or exceeds the suite timeout; the adapter declines to declare Opus encode as a reliable transcode path. Since the target requires Opus audio, declining is correct rather than risking a hard ERROR.
- **remotion-webcodecs@4.0.479** — NA_ENGINE (honest, capability-specific). Explicitly declares that B-frame-reorder sources are not reliably re-encoded by this package — the exact open-GOP/B-frame property this scenario stresses. Honest, codec-aware NA.
- **web-demuxer@4.0.0** — NA_ENGINE (honest). A demux-only library; does not declare the `transcode` operation at all. No encode capability exists.
- **remotion-media-parser@4.0.479** — NA_ENGINE (honest). A parser; does not declare `transcode`. No encode capability.
- **mp4box@2.3.0** — NA_ENGINE (honest). An MP4 box/muxer library; does not declare `transcode`, and could not produce VP9/Opus/WebM regardless.

## Anti-cheat validation
- Scenario definition: `src/scenarios/transcode/index.ts:955-967` (`id: 'bframe_reorder_h264_to_vp9'`), built by `buildVideoScenario` (index.ts:290); default oracle list `['ssim-psnr','playback-smoke']` (index.ts:293). Notes: "B-frame/open-GOP H.264 → VP9: reorder correctness across a codec change."
- Fixture: `fixtures/media/h264_bframes_1080p.mp4` exists, 11 MB — a real H.264/AAC MP4 with B-frames, not synthetic/empty/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1271` (transcode) → `:842` (runConversion: real `Conversion.init`/`execute`/`BufferTarget` bytes) → `:542`/`:529-535` (VP9 software-encode routing). Genuinely calls the library; no hardcoded output, no input→output copy, no golden short-circuit, no error swallowing (it throws on invalid Conversion).
- Oracle: `src/core/oracles.ts:1688` (ssim-psnr) → `:1842` (ssimVsReferenceSource) performs a REAL in-browser source decode and per-frame `ssim()`; gate is `ssimMin ≥ 0.97` on the worst frame. Measurements (pairs 12, ssimMin 0.99999641) are plausible and discriminating, not trivially satisfiable. Note this gate is a perceptual proxy (no committed golden pixels; PSNR advisory only; `exactFrames` 0/12), so it is strong-but-perceptual rather than bit-exact — appropriate since lossy H.264→VP9 can never be bit-exact.
- cached: **true** — mediabunny's result was reused ("cached previous PASS result"), not re-run in this batch. Staleness risk: the PASS evidence is from a prior run (startedAtIso 2026-06-22T17:00:31Z). The implementation and oracle were inspected directly and are sound, so the risk is low, but the numbers were not freshly regenerated.
- Verdict: **WEAK-GATE**. Real fixture + real implementation + real comparison, but the gating oracle is a perceptual SSIM proxy against an in-browser reference (no committed golden, exactFrames 0/12, PSNR advisory-only), so the PASS is genuine but not a bit-exact/structural-exact gate.

## Confidence & caveats
- Confidence: high on the verdict (single eligible PASS; six NAs are honest and codec/capability-specific). Medium on strength-of-evidence, because (a) the gate is perceptual not bit-exact, (b) bench is n==1 with mad==0 (no spread), and (c) the result is cached. peakMemory and decodeFps were not sampled (n==0), so memory/decode comparisons are unavailable. No second PASS exists, so there is no contested ranking to verify.
