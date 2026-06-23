# decode-seek/decode_open_gop_first_frame

family: decode-seek | fixture asset: `h264_open_gop_1080p.mp4` (4.5 MB, real H.264/AVC in MP4) | primaryMetric: decodeFps | passCount: 5/7

## Verdict

- Best framework: **remotion-webcodecs@4.0.479** — CONTESTED (5 PASS, but ranked on performance after correctness tied).
- Decisive factor: among the four engines that achieved the strongest correctness tier (12/12 digest-identical frames, SSIM=1, PSNR=∞), remotion-webcodecs had the fastest decode: **43.96 decodeFps** and **364 ms wall**.
- Margin over runner-up (platform@chrome-149, 39.56 fps / 404.4 ms): **1.11x higher decodeFps, 1.11x lower wall**. Over mediabunny (37.36 fps / 428.3 ms): **1.18x faster**. All on n=1, so the margin is suggestive, not statistically firm.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | decodeFps | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (12/12 exact) | 364.00 | 43.96 | n/a (0) | 3045 | cached previous PASS |
| platform@chrome-149 | PASS | ssim-psnr:true (12/12 exact) | 404.40 | 39.56 | n/a (0) | 5137 | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:true (12/12 exact) | 428.29 | 37.36 | n/a (0) | 3045 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (12/12 exact) | 467.83 | 34.20 | n/a (0) | 632 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (0/12 exact, SSIM 0.99995) | 687.38 | 23.28 | n/a (0) | 12587 | cached previous PASS |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

The operation is open-GOP first-frame decode of H.264/AVC in an MP4 container (`h264_open_gop_1080p.mp4`). Per the scenario notes (`src/scenarios/decode-seek/index.ts:223-225`), an open GOP places **leading B-frames before the first I/IDR**, so the first DISPLAYED (presentation-order) frame is NOT the first DECODED (decode-order) frame. A correct decoder must therefore (a) feed encoded samples in decode order, (b) collect emitted `VideoFrame`s, and (c) reorder them by presentation timestamp before comparison against the golden. The oracle gates on the worst paired frame, and the strongest signal is digest equality (normalized RGBA SHA-256 → SSIM 1 / PSNR ∞, `src/core/oracles.ts:1766-1771,1803-1809`).

remotion-webcodecs gets this exactly right in its adapter (`src/engines/remotion-webcodecs/adapter.ts:651-731`). It parses with media-parser and builds a native WebCodecs `VideoDecoder` straight from the parsed track config (`adapter.ts:667-694`), feeds each encoded sample with queue backpressure (`waitForQueueToBeLessThan(16)`, `adapter.ts:704-710`), then — critically for open-GOP — **sorts the captured frames by presentation timestamp `ptsUs` and re-indexes before digesting** (`adapter.ts:722-728`). That sort is what neutralizes the B-frame-before-IDR reorder, producing presentation-ordered digests that match the golden index-for-index → **12/12 exactFrames, ssimMin=1, ssimMean=1** in the shard. The config used was `backend: webcodecs`, `hwAccel: prefer-hardware(+software fallback)`, `pipeline: streaming-backpressure` — i.e. hardware-accelerated decode on the Apple M1 Max (ANGLE Metal) with no COOP/COEP requirement. The performance edge over the other WebCodecs engines is small and plausibly the streaming-backpressure pipeline plus a leaner offscreencanvas-2d rasterize path: 43.96 fps vs platform's `VideoDecoder` reference path at 39.56 fps and mediabunny's `VideoSample.copyTo(RGBA)>canvas` at 37.36 fps.

The other three PASS engines are correctness-equivalent (all 12/12 digest-identical), so they lose purely on throughput, not on accuracy. ffmpeg-wasm is the odd one out on correctness strength: it passes the gate but with **exactFrames=0** — its frames are not digest-identical; it relies on the per-frame luma-signature SSIM proxy (ssimMin 0.99995 ≥ 0.99 floor). That is a genuinely weaker form of the same oracle (a software-decode RGB-conversion path that rounds differently than the native WebCodecs reference), so even if its speed were competitive it would rank below the digest-exact engines on the correctness ladder. It is also the slowest (23.28 fps, 687 ms wall, 12587 ms longtasks — single-thread wasm with no SharedArrayBuffer).

## What each other framework did wrong

- **platform@chrome-149** — PASS, correctness-tied (12/12 exact). Lost on speed: 39.56 fps vs 43.96 (0.90x), 404.4 ms vs 364 ms wall, and notably higher main-thread blocking (longtasks 5137 ms vs 3045 ms).
- **mediabunny@1.48.0** — PASS, correctness-tied (12/12 exact). Slower decode: 37.36 fps (0.85x), 428.3 ms wall. Its `VideoSample.copyTo(RGBA)>canvas` rasterize path is marginally heavier than the winner's.
- **web-demuxer@4.0.0** — PASS, correctness-tied (12/12 exact). Slowest of the digest-exact group: 34.20 fps (0.78x), 467.8 ms wall (best longtasks at 632 ms, but throughput is the primaryMetric).
- **ffmpeg.wasm@0.12.15** — PASS but on the **weaker** oracle path: exactFrames=0/12, gate held by SSIM proxy (min 0.99995). Slowest overall (23.28 fps, 687 ms, 12587 ms longtasks). Lost on both correctness strength and performance.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'decodeFrames'". Honest NA — media-parser is a parser/demuxer, not a pixel decoder; it has no WebCodecs decode surface for this op.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare operation 'decodeFrames'". Honest NA — mp4box is an MP4 box/sample-table demuxer and emits encoded samples only; it does not decode to RGBA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/decode-seek/index.ts:216-226` (id `decode_open_gop_first_frame`, asset `h264_open_gop_1080p.mp4`, container mp4, videoCodec h264, maxFrames 16). Oracle set: `DECODE_ORACLES = ['ssim-psnr']` (`src/scenarios/decode-seek/index.ts:279`).
- Fixture: `fixtures/media/h264_open_gop_1080p.mp4` exists, **4.5 MB real H.264/MP4** (stat confirmed) — not synthetic/empty/mock. The notes give a clear, codec-specific gating rationale (leading B-frames before first IDR).
- Oracle: `ssimPsnr` at `src/core/oracles.ts:1688-1809`. Real comparison: digest equality of normalized RGBA frames against committed golden (`oracles.ts:1766`), with a downsampled-luma-signature SSIM fallback (`oracles.ts:1782-1786`); gate is on the worst frame (`oracles.ts:1823`). Not trivially satisfiable for the winner: it requires 12 paired frames to be SHA-256 digest-identical to the golden (`exactFrames==12`), which is the strongest tier on the ladder, not a smoke/wide-tolerance pass.
- Winner adapter: `src/engines/remotion-webcodecs/adapter.ts:651-731` — genuine native WebCodecs `createVideoDecoder` + per-sample `decode()` with backpressure, real frame rasterize + SHA-256 digest (`adapter.ts:727`). No canned output, no copy-input-to-output, no golden short-circuit, no error swallowing (decode errors are rethrown, `adapter.ts:719`). The presentation-order sort (`adapter.ts:722`) is the legitimate open-GOP correctness mechanism.
- Cached note: ALL seven entries have `cached:true` ("cached previous PASS result"). Evidence is reused, not freshly re-run — staleness risk applies uniformly across engines, so it does not bias the ranking, but the absolute numbers are from a prior run.
- Verdict: **REAL** — real 4.5 MB fixture, genuine hardware-WebCodecs decode implementation, and a digest-exact (12/12) gating oracle. Note: the winner's correctness is strong; ffmpeg-wasm's PASS specifically is WEAK (exactFrames=0, SSIM-proxy), but that does not affect the winner.

## Confidence & caveats

- Confidence: **high** on REAL validation and on correctness ranking (4 engines digest-exact, ffmpeg-wasm proxy-only). Confidence on the performance ordering is **medium**: every bench metric is **n=1** (mad=0, p95==median — single sample), so the 1.11x margin over platform is small relative to likely run-to-run noise. A re-run could plausibly reorder remotion-webcodecs / platform / mediabunny.
- peakMemory and timeToFirstFrame are unrecorded (n=0) across all engines, so memory could not be used as a tiebreaker.
- All results are cached; numbers reflect prior runs, not a fresh execution.
