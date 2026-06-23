# decode-seek/decode_vp9

- family: decode-seek
- fixture asset: `vp9_1080p_10s.webm` (VP9 video in WebM/Matroska container, 9.3 MB) + goldens `fixtures/golden/vp9_1080p_10s.webm.{frames,ssim,packets,meta}.json`
- primaryMetric: `decodeFps` (frames/s, higher-better)
- passCount: 5 of 7 (2 NA_ENGINE)

## Verdict

- Best framework: **platform@chrome-149** (WebCodecs `VideoDecoder`).
- Status: **CONTESTED** — 5 engines PASS the `ssim-psnr` gate.
- Decisive factor: among the four engines that achieved bit-exact digest correctness (exactFrames=12/12), platform has the **highest decodeFps (48.90)**, the scenario's primary metric, and by far the lowest `longtasks` (315 ms).
- Margin over runner-up (remotion-webcodecs @ 44.70 fps): **1.094x faster decodeFps**, **0.92x wall** (613.46 ms vs 671.16 ms), and **41x lower longtasks** (315 ms vs 12909 ms). Evidence strength is limited: n=1, mad=0 for every metric.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | decodeFps | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:pass (12/12 exact, SSIM=1) | 613.46 | 48.90 | 739,788,410 B | 315 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (12/12 exact, SSIM=1) | 671.16 | 44.70 | n/a (0) | 12909 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (12/12 exact, SSIM=1) | 723.67 | 41.46 | n/a (0) | 874 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (12/12 exact, SSIM=1) | 793.43 | 37.81 | n/a (0) | 5137 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (0/12 exact, SSIM 1.0000 proxy) | 1077.99 | 27.83 | n/a (0) | 2059 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

This case decodes the first 30 frames (12 paired against golden) of a 1080p VP9 elementary stream carried in a WebM/Matroska container, then SSIM/digest-compares the rasterized RGBA against the committed golden signatures. VP9 in WebM has two adapter-relevant subtleties: (1) WebM stores codec setup in a Matroska `CodecPrivate` blob that is **not** a valid WebCodecs `description` for VP9, and (2) VP9 has no out-of-band extradata requirement at all — the decoder reads everything from the uncompressed frame header. An adapter that naively forwards the WebM `CodecPrivate` to `VideoDecoder.configure({description})` corrupts the config.

Platform handles this correctly. Its inline WebM demuxer feeds packets to a real `VideoDecoder`, and `decodeWithWebCodecs` explicitly **drops the description for VP8/VP9** at `src/engines/platform/decode.ts:108-115` (`codecUsesDescription(codec)` returns false for vp09), keeping it only for avc1/hvc1/av01. It then gates on `VideoDecoder.isConfigSupported` (decode.ts:119-122) and decodes via `collectDecodedFrames` (decode.ts:165-205), emitting frames in presentation order and rasterizing each to `ImageData` for `getPixels` (decode.ts:144-160). Per `env.configUsed`, platform ran `backend:"webcodecs", hwAccel:true, pipeline:"streaming", queueDepth:2, frameTransfer:"transferable", pixelBackend:"webgpu>webgl>offscreen2d"` — i.e. the M1 Max hardware VP9 decode block (GPU reported as ANGLE Metal, Apple M1 Max). The combination of hardware decode plus a transferable, GPU-backed rasterization path (WebGPU-preferred) is what produced the top decodeFps of **48.90** and a single 315 ms long task, while still landing **12/12 digest-exact frames** (oracle measurements: `pairs:12, exactFrames:12, ssimMean:1, ssimMin:1` → PSNR=∞ branch at oracles.ts:1803-1809).

The other three digest-exact engines also used WebCodecs and also hit 12/12 exact, so correctness is tied; the separation is purely throughput and main-thread responsiveness. remotion-webcodecs (44.70 fps) is the closest, but its `streaming-backpressure` / `offscreencanvas-2d` pixel path and `prefer-hardware(+software fallback)` config cost it 12909 ms of long tasks — a far heavier main-thread footprint than platform's 315 ms. web-demuxer (41.46) routes packets through its wasm demuxer before WebCodecs; mediabunny (37.81) uses a `streaming-lockstep` pipeline with `VideoSample.copyTo(RGBA)>canvas` rasterization, the slowest of the hardware-decode group. Platform's lighter, transferable, GPU-rasterized loop is the mechanistic reason it edges them on the size-ladder fps metric.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479**: PASS, lost on performance — decodeFps 44.70 vs 48.90 (0.91x) and an enormous longtasks figure of 12909 ms (41x platform's 315 ms), indicating heavy main-thread blocking despite equal 12/12 correctness.
- **web-demuxer@4.0.0**: PASS, lost on performance — decodeFps 41.46 (0.85x of platform); extra wasm-demux hop before WebCodecs.
- **mediabunny@1.48.0**: PASS, lost on performance — decodeFps 37.81 (0.77x of platform), slowest of the digest-exact group; `streaming-lockstep` + `copyTo(RGBA)` rasterization adds overhead. longtasks 5137 ms.
- **ffmpeg.wasm@0.12.15**: PASS but **weakest correctness AND slowest** — decodeFps 27.83 (0.57x of platform), wall 1077.99 ms, and crucially `exactFrames:0/12` (oracle detail: "PSNR via golden pixels unavailable (digest proxy: 0/12 exact)", ssimMin 0.99995). Its software wasm VP9 decode is not byte-identical to the golden, so it passes only on the proxy SSIM tier — strictly below the four digest-exact engines on the correctness ladder.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'decodeFrames'". Honest NA: it is a parser/demuxer, not a frame decoder; declaring decodeFrames false is accurate.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare operation 'decodeFrames'". Honest NA: mp4box is an MP4/box parser and demuxer with no decode pipeline; it also cannot parse WebM at all.

## Anti-cheat validation

- Scenario definition: `src/scenarios/decode-seek/index.ts:94-101` — `{ id: 'decode_vp9', asset: 'vp9_1080p_10s.webm', container: 'webm', videoCodec: 'vp9', maxFrames: 30 }`. Family docstring (index.ts:1-9) confirms decodeFrames pulls frames and compares pixels to golden via `ssim-psnr`.
- Fixture: `fixtures/media/vp9_1080p_10s.webm` exists (9.3 MB, real VP9/WebM); goldens `fixtures/golden/vp9_1080p_10s.webm.{frames,ssim,packets}.json` exist (frames 3.2k, ssim 76k, packets 90k). Real, non-synthetic input.
- Oracle: `src/core/oracles.ts:1688-1833` (`ssimPsnr`). It pairs candidate frames to golden by index, treats a normalized-RGBA SHA-256 digest match as the bit-exact PSNR=∞ branch (oracles.ts:1766-1771, 1803-1809), and otherwise computes downsampled-luma SSIM against the committed `ssim.json` sigs gated on the worst frame (`minSsim >= t.ssimMin`, ssimMin default 0.99 at oracles.ts:157). Not trivially satisfiable: ffmpeg-wasm demonstrably fails the digest tier (0/12) and only clears the SSIM proxy, proving the gate discriminates. Platform's `exactFrames:12, ssimMin:1` is physically plausible for a hardware VP9 decode matching the golden digests.
- Winner adapter: `src/engines/platform/adapter.ts:422-456` (decodeFrames) → `src/engines/platform/decode.ts:89-163` (`decodeWithWebCodecs`). Genuinely calls WebCodecs `VideoDecoder` (decode.ts:175-205), rasterizes/digests real frames (decode.ts:144-160). No canned output, no copy-input-to-output, no golden short-circuit, no error swallowing (errors rethrow at decode.ts:135-139; falls back to `<video>` only when DOM present).
- Cached note: ALL engine results in this shard have `cached:true` ("cached previous PASS result"); platform's was last started 2026-06-22T14:01:39Z. Numbers were reused, not re-run this cycle — mild staleness risk, but the underlying evidence (12/12 digest-exact, plausible fps) is consistent and real.
- Verdict: **REAL** — real fixture, real WebCodecs hardware decode, discriminating digest+SSIM oracle.

## Confidence & caveats

- Confidence: **high** for correctness (12/12 digest-exact, strongest oracle tier), **medium** for the performance ranking because every metric is n=1, mad=0 (single sample), so the 1.094x decodeFps margin over remotion-webcodecs is narrow and could plausibly flip on re-run.
- All results cached; a fresh re-run is advisable before treating the fps ordering as definitive.
- peakMemory is only reported for platform (739.8 MB); the other engines report 0/absent, so memory cannot be compared across the field.
- The win is on a hardware-WebCodecs vs hardware-WebCodecs basis (platform vs remotion-webcodecs/web-demuxer/mediabunny), so the tiebreaker is genuinely throughput + main-thread cost, not a hw-vs-wasm mismatch (that mismatch only separates ffmpeg.wasm).
