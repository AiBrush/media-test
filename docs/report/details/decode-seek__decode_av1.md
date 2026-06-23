# decode-seek/decode_av1

family: decode-seek · fixture asset: `av1_720p_5s.webm` (AV1 video in WebM/Matroska, 1280x720, ~5 s) · primaryMetric: decodeFps · passCount: 4 / 7

## Verdict

- **Best framework: platform@chrome-149** (`env.engineId` "platform").
- **CONTESTED**: 4 engines PASS the `ssim-psnr` gate (platform, web-demuxer, mediabunny, remotion-webcodecs). 3 are NA_ENGINE.
- **Correctness tier**: platform and web-demuxer both reach the strongest tier — **12/12 frames digest-identical** (`exactFrames=12`, SSIM=1, PSNR=∞). mediabunny and remotion-webcodecs sit one tier lower (perceptual proxy only: `exactFrames=0`, SSIM min 0.9693).
- **Decisive factor (platform vs web-demuxer, the two correctness co-leaders)**: PERFORMANCE on the primary metric. platform decodeFps **93.71** vs web-demuxer **91.42** (1.025x faster on the primary metric), wall median **320.15 ms vs 328.15 ms** (1.025x faster), and far lower main-thread blocking: longtasks **1012 ms vs 2477 ms** (2.45x less). platform is the only PASS engine that also reported peakMemory (349.5 MB) and finished in the shortest durationMs (2486 ms vs ~5000 ms for the others).
- **Margin over runner-up (web-demuxer):** +2.5% decodeFps, -2.4% wall, -59% longtasks. Narrow on throughput, decisive on responsiveness.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | decodeFps | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:pass (12/12 exact, SSIM=1) | 320.15 | 93.71 | 349,472,299 B | 1012 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (12/12 exact, SSIM=1) | 328.15 | 91.42 | 0 (not measured) | 2477 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (0/12 exact, SSIM min 0.9693) | 273.72 | 109.60 | 0 (not measured) | 234 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (0/12 exact, SSIM min 0.9693) | 286.53 | 104.70 | 0 (not measured) | 4223 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare video codec 'av1' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

The operation is **decode the first frames of an AV1 elementary stream carried in a WebM/Matroska container to normalized RGBA** and compare each decoded frame's sha256 digest against a browser-baked golden. AV1 has no SW decoder in the WASM engines here (ffmpeg.wasm's build omits libaom/dav1d), so the only viable path is the browser's WebCodecs `VideoDecoder`, which on this Apple M1 Max / Chrome 149 host decodes AV1 (software AV1 via Chrome's dav1d, surfaced through WebCodecs).

platform decodes through its own WebCodecs driver (`src/engines/platform/decode.ts:90` onward): it builds a `VideoDecoderConfig`, validates with `VideoDecoder.isConfigSupported` (`decode.ts:119`), feeds `EncodedVideoChunk`s to a `VideoDecoder`, then rasterizes each `VideoFrame` to `ImageData` and digests it with the shared `digestImageData` (`decode.ts:154`, `src/engines/platform/digest.ts`). Its `configUsed` confirms a real hardware-preferring WebCodecs path: `backend:"webcodecs"`, `hwAccel:true`, `decode:"VideoDecoder"`, `pixelBackend:"webgpu>webgl>offscreen2d"`, `frameTransfer:"transferable"`, `pipeline:"streaming"`, `queueDepth:2`, no COOP/COEP requirement.

Why platform reaches `exactFrames=12` and not just an SSIM proxy: the golden `fixtures/golden/av1_720p_5s.webm.frames.json` was **baked by the platform engine itself** (`"bakedBy":"frame-bake (platform engine) · ...Chrome/149"`). Because platform's runtime decode uses the identical normalize+sha256 routine that produced the golden, all 12 frame digests match byte-for-byte → the `ssim-psnr` oracle takes its strongest branch (`src/core/oracles.ts:1766`, then `:1803` where `exactCount === pairs` reports SSIM=1 / PSNR=∞). The measurements in the shard (`pairs:12, exactFrames:12, ssimMean:1, ssimMin:1`) are exactly this path.

web-demuxer reaches the SAME 12/12 digest-exact tier **independently**: it is a demuxer/parser that hands WebCodecs a `VideoDecoderConfig` + `EncodedVideoChunk` stream and drives a real `VideoDecoder` itself (`src/engines/web-demuxer/adapter.ts:848`–937: `isConfigSupported` guard at `:855`, pipelined `decoder.decode` loop, pts-sort reorder window, then `imageDataFromVideoFrame` + the SHARED `digestImageData` from `./digest.ts` at `:934`). Crucially it uses the same engine-independent digest normalization (file header `:55`–57), so its browser-decoded pixels also hash-match the golden → `exactFrames=12, SSIM=1`. Correctness is therefore a genuine tie between platform and web-demuxer.

The tie breaks on performance (decision rule 4b). platform's primary metric decodeFps is 93.71 vs web-demuxer's 91.42 (1.025x), wall 320.15 vs 328.15 ms, and — the most material gap — main-thread longtasks 1012 ms vs 2477 ms (web-demuxer blocks the main thread 2.45x longer, driven by its heavy WASM demux step compiled per the file header). platform also reports a real peakMemory (349.5 MB) and the smallest total durationMs (2486 ms). All n==1 (single sample, mad=0), so the throughput margin is weak evidence; the longtasks/responsiveness gap is the more robust separator, and it favours platform.

mediabunny and remotion-webcodecs are genuinely faster on raw decodeFps (109.60 and 104.70 fps) and lower wall (273.72 / 286.53 ms), but they LOSE on correctness strength: both land `exactFrames=0` — their decoded pixels do not hash-match the golden, so the oracle falls back to the downsampled-luma SSIM proxy (`oracles.ts:1782`) and passes only because SSIM min 0.9693 clears the relaxed 0.96 floor declared for this AV1 row (`src/scenarios/decode-seek/index.ts:121`). Per the ranking ladder, bit/digest-exact (strongest tier) outranks a perceptual SSIM proxy with `exactFrames==0`, so neither can outrank the two digest-exact engines despite faster throughput.

## What each other framework did wrong

- **web-demuxer@4.0.0 (PASS, runner-up):** Correctness-tied at 12/12 digest-exact (SSIM=1), but lost on performance — decodeFps 91.42 vs 93.71 (-2.5%), wall 328.15 vs 320.15 ms, and notably longtasks 2477 ms vs platform's 1012 ms (2.45x more main-thread blocking from its WASM demux). Did not report peakMemory. Honest, real WebCodecs decode; simply the slower/heavier of the two co-leaders.
- **mediabunny@1.48.0 (PASS, lost on correctness tier):** Fastest decodeFps (109.60) and lowest wall (273.72 ms), but `exactFrames=0` — its decoded RGBA does not digest-match the golden, so it only cleared the SSIM proxy (min 0.9693 ≥ 0.96). Perceptual-proxy tier ranks below digest-exact; speed cannot promote it.
- **remotion-webcodecs@4.0.479 (PASS, lost on correctness tier):** Same perceptual-proxy outcome as mediabunny (`exactFrames=0`, SSIM min 0.9693), decodeFps 104.70. Worse still on responsiveness: longtasks 4223 ms (highest of all PASS engines). Below the digest-exact tier on correctness.
- **ffmpeg.wasm@0.12.15 (NA_ENGINE):** "engine does not declare video codec 'av1'". HONEST NA — the WASM build ships without libaom/dav1d (adapter header `:21`, `:44`–45 deliberately keep av1 out of `videoCodecs`), so it genuinely cannot decode AV1. Not an under-declared capability.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'decodeFrames'". HONEST — it is a parser/demuxer that emits encoded samples only; `decodeFrames` throws (`adapter.ts:556`) and is not in its declared `operations`.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare operation 'decodeFrames'". HONEST — mp4box is a pure-JS ISOBMFF box parser with no decoder; `decodeFrames` throws (`adapter.ts:953`) and is undeclared (header `:7`–12).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/decode-seek/index.ts:114`–123 — `id:'decode_av1'`, `asset:'av1_720p_5s.webm'`, `container:'webm'`, `videoCodec:'av1'`, `tolerances.ssimMin:0.96`. Notes: "AV1/WebM decode. NA(browser) where AV1 decode is unavailable (software-only otherwise)."
- **Fixture exists and is real:** `fixtures/media/av1_720p_5s.webm` present, ~1.9 MB — a real AV1/WebM clip, not synthetic/empty/mock.
- **Golden:** `fixtures/golden/av1_720p_5s.webm.frames.json` (`pending:false`, 12 baked frame digests, baked by the platform engine in Chrome 149); `.ssim.json` (79 KB of per-frame luma sigs) supports the SSIM proxy branch for engines whose pixels do not hash-match.
- **Oracle:** `src/core/oracles.ts:1688` `ssimPsnr`. Real comparison: digest equality first (`:1766`), full PASS only when `exactCount === pairs` (`:1803`, SSIM=1/PSNR=∞); otherwise the downsampled-luma SSIM proxy (`:1782`) gated on the worst-frame SSIM ≥ tolerance (`:1823`). Not trivially satisfiable — two of four PASS engines failed the exact branch and fell back to the proxy.
- **Winner adapter:** `src/engines/platform/decode.ts:90`–154 — genuine `VideoDecoder` driver (real `isConfigSupported` guard `:119`, real `decode`/`flush`, real rasterize+`digestImageData` `:154`). No canned output, no copy-input-to-output, no golden short-circuit, no error-swallowing-as-success. Runner-up web-demuxer's decode (`src/engines/web-demuxer/adapter.ts:848`) is likewise a real WebCodecs path.
- **Verdict: REAL.** Real AV1/WebM fixture, real WebCodecs decode implementations, meaningful digest-exact + SSIM-proxy oracle with physically plausible measurements (12 frames at 1280x720, 33 ms pts spacing ≈ 30 fps, SSIM 1.0 for exact / 0.9693 for the proxy engines). One mild caveat: platform's `exactFrames=12` is partly self-referential because platform baked the golden — but web-demuxer's INDEPENDENT 12/12 match (same shared digest routine, different engine) corroborates that the AV1 decode is genuinely bit-stable, so the exact-match evidence is not circular in substance.
- **Cached note:** ALL engine results in this shard have `cached:true` ("cached previous PASS result") — reused, not re-run in this pass. Staleness risk is low (the underlying fixture, golden, and adapter code are committed and unchanged), but the numbers were not freshly produced this run.

## Confidence & caveats

- **Confidence: medium.** The correctness verdict is solid (digest-exact tier is unambiguous and independently corroborated). The platform-over-web-demuxer ordering rests on a narrow throughput margin (+2.5% decodeFps) plus a larger but n==1 longtasks gap (2.45x). All bench metrics are single-sample (n=1, mad=0), so spread is unknown.
- platform and web-demuxer are a true correctness tie; if responsiveness (longtasks) is weighted lower than raw throughput, web-demuxer remains essentially co-equal — this is a close contest, not a blowout.
- mediabunny/remotion-webcodecs are faster but legitimately ranked below on correctness because their pixels do not hash-match the golden (proxy-only PASS at the relaxed 0.96 AV1 floor).
- All results are cached; a fresh re-run is advisable before publishing the leaderboard.
