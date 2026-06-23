# transcode/av_downmix_stereo_to_mono

- family: transcode | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264 1080p + AAC stereo, ~30s) | primaryMetric: wall (TC_METRICS) | passCount: 2/7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- **CONTESTED** — two engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Correctness is comparable (both pass the same two oracles, `ssim-psnr` + `property-invariant`).
- Decisive factor: **performance**. With correctness tied, mediabunny wins overwhelmingly on every wall-clock/throughput metric.
- Margin over runner-up (ffmpeg-wasm): **~34.0x faster wall** (2598.1 ms vs 88341.9 ms), **34.0x throughputRealtime** (11.547x vs 0.3396x), **34.0x encodeFps** (346.4 vs 10.19), **3.5x fewer long-task ms** (1012 ms vs 3585 ms). ffmpeg-wasm reported no peakMemory sample (n=0); mediabunny used 62.5 MB.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true, property-invariant:true | 2598.08 ms | 11.547x | 62,526,717 B | 1012 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true, property-invariant:true | 88341.95 ms | 0.3396x | 0 B (n=0) | 3585 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: MediaRecorder canvas-capture path is video-only, drops audio; cannot produce the requested audio track |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | adapter cannot remap audio channel count (downmix/upmix) |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a **muxed A/V transcode** of H.264-in-MP4 with an **AAC stereo→mono downmix**: re-encode video as H.264, re-encode audio as AAC with `numberOfChannels: 1`, remux to MP4 (`src/scenarios/transcode/index.ts:1672-1694`). The scenario gates video fidelity with `ssim-psnr` and the channel-layout change with the `transcode-output-metadata` `property-invariant`.

**Correctness is a genuine tie.** Both engines pass both oracles with physically plausible numbers:
- `ssim-psnr` — mediabunny SSIM min 0.99999543, mean 0.99999880 over 12 frame pairs; ffmpeg SSIM min 0.99999978, mean ~1.0 over 12 pairs. Both clear the 0.98 gate. Note `exactFrames == 0` on both: there is no committed golden pixel, so the oracle runs the downsampled-luma-signature SSIM proxy (`src/core/oracles.ts:1772-1789`) rather than digest/PSNR-exact. This is a **perceptual proxy**, the weaker rung of the correctness ladder, so it does not separate the two engines.
- `property-invariant` (transcode-output-metadata, `src/core/oracles.ts:3626-3708`) — the reference engine re-probes the produced MP4 and `compareRequestedTrack` (`src/core/oracles.ts:3813-3819`) asserts `track.channels === 1`. Both engines yield `videoTracks:1, audioTracks:1` and pass. mediabunny's `durationDeltaSec` is 0.0800 s and ffmpeg's is 0.0160 s, both inside the relaxed 0.12 s priming band — ffmpeg's is tighter, but both PASS, so duration does not break the tie either.

**Performance is therefore decisive, and the gap is enormous (~34x).** The mechanism is the encoder backend:
- mediabunny ran on **WebCodecs with `hardwareAcceleration: 'prefer-hardware'`** (env.configUsed: `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`, `wasmThreads:0`). Its adapter drives mediabunny's native Conversion API (`src/engines/mediabunny/adapter.ts:65`, "Conversion runs read→decode→encode→mux"), so the H.264 re-encode lands on the platform/GPU H.264 encoder (the Apple M1 Max VideoToolbox path via the browser), not a CPU codec. The downmix is delegated cleanly: `buildAudioOptions` sets `opts.numberOfChannels = a.channels` (`src/engines/mediabunny/adapter.ts:683`) and lets mediabunny's Conversion perform the AAC re-encode + channel remap. The result: **encodeFps 346.4** and **11.5x realtime**, finishing the 30 s clip in **2.6 s**.
- ffmpeg.wasm ran the **single-thread wasm software codec** (libx264/aac compiled to WASM, `wasmThreads:0`). A 1080p30 H.264 software re-encode in a single WASM thread is exactly the worst case: **encodeFps 10.19**, **0.34x realtime** (slower than playback), **88.3 s wall** — and 3585 ms of blocking long tasks vs mediabunny's 1012 ms. Same correct output, ~34x the cost.

Tiebreaker support all points the same way: hardware WebCodecs vs single-thread wasm; mediabunny needs **no COOP/COEP** (`coopCoep:"not-required"`, `sharedArrayBuffer:false`) whereas ffmpeg.wasm's threaded path requires cross-origin isolation; mediabunny is a pure-TS-ESM core (`coreBuild:"pure-ts-esm"`) vs the multi-MB ffmpeg wasm bundle.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed correctly but lost on performance: 88341.95 ms wall (34.0x slower), 0.3396x realtime (34.0x lower), 10.19 encodeFps (34.0x lower), 3585 ms long tasks (3.5x more blocking). Root cause: single-thread WASM software H.264 encode (`wasmThreads:0`). It also reported no peakMemory (bench.peakMemory n=0), so its memory cost is unmeasured rather than favorable.
- **platform@chrome-149** — NA_BROWSER-style honest NA: its transcode path is `<video>→canvas→MediaRecorder`, which is **video-only and drops audio**, so it physically cannot emit the requested mono AAC track. Honest, not under-declared — MediaRecorder canvas capture genuinely has no audio input here.
- **remotion-webcodecs@4.0.479** — honest NA: the adapter has WebCodecs transcode but **cannot remap audio channel count (downmix/upmix)**. It declares transcode for other shapes; the NA is scoped to the channel-remap capability this scenario requires, which is accurate.
- **web-demuxer@4.0.0** — honest NA_ENGINE: a demuxer that does not declare the `transcode` operation. No encode capability; correct.
- **remotion-media-parser@4.0.479** — honest NA_ENGINE: a parser, does not declare `transcode`. Correct.
- **mp4box@2.3.0** — honest NA_ENGINE: a box-level (de)muxer, does not declare `transcode` (no codec engine). Correct.

## Anti-cheat validation

- Scenario: `src/scenarios/transcode/index.ts:1672-1694` (`id: 'transcode/av_downmix_stereo_to_mono'`), op `transcode`, output `{container:'mp4', video:{codec:'h264'}, audio:{codec:'aac', channels:1}}`, oracles `['ssim-psnr','property-invariant']`, tolerances `{ssimMin:0.98, durationToleranceSec: TC_AUDIO_PRIMING_TOLERANCE_SEC}`.
- Fixture: input `h264_1080p_30s.mp4` → `fixtures/media/h264_1080p_30s.mp4` exists, **31 MB real H.264/AAC media** (verified via stat). Not synthetic/mock/empty. notes confirm intent: stereo→mono channel-layout change during a muxed A/V re-encode (a documented corpus-driven stand-in for a true 5.1 muxed source, with audio-only 5.1 covered by audio-dsp).
- Winner adapter: mediabunny `src/engines/mediabunny/adapter.ts:65` (real Conversion read→decode→encode→mux), `:672-692` `buildAudioOptions`, `:683` `opts.numberOfChannels = a.channels` (real channel remap delegated to the library — no canned output, no input→output copy, no golden short-circuit). The encode is a genuine WebCodecs encode.
- Oracles: `ssim-psnr` `src/core/oracles.ts:1688-1807` performs a real frame-paired SSIM (luma-signature proxy here since no golden pixels are committed; `exactFrames==0` is expected, not a defeat) — this is a **proxy gate**, not bit-exact. `property-invariant`/transcode-output-metadata `src/core/oracles.ts:3626-3708` re-probes the produced MP4 with a reference engine and `compareRequestedTrack` `:3817-3819` enforces `track.channels === 1` — a real, non-trivial structural assertion of the downmix; measurements (videoTracks:1, audioTracks:1, durationDelta 0.08 s / 0.016 s) are physically plausible.
- Cached: both PASS results have **cached==true** (reused, not re-run this session). Staleness risk noted — the numbers are from a prior run; correctness/perf were not re-measured. The adapter+oracle code is real, so the cached PASS is credible, but the exact perf numbers carry mild staleness risk.
- Verdict: **WEAK-GATE**. Real fixture, real implementation, and a real structural channel-count assertion — but the video-fidelity gate is the perceptual SSIM proxy with `exactFrames==0` (no bit-exact/PSNR), so the PASS is real yet not the strongest possible. The winner is decided on a clean 34x perf margin with correctness tied.

## Confidence & caveats

- Confidence: **high** on the winner and the decisive factor — the 34x margin is far beyond any noise, and the correctness tie is unambiguous.
- Caveats: (1) both PASS rows are cached (n==1 bench samples, mad==0), so the perf magnitudes have staleness/single-sample uncertainty — direction is certain, exact ratios are point estimates. (2) The video gate is a perceptual SSIM proxy (`exactFrames==0`), not bit-exact; correctness is "good" not "crypto-strong." (3) ffmpeg-wasm's peakMemory is unmeasured (n=0), so the memory comparison is one-sided. (4) Only mediabunny exposed full `configUsed`; ffmpeg's exact wasm-thread config is inferred from its known single-thread build and the throughput profile.
