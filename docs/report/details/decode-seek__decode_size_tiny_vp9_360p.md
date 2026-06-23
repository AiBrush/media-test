# decode-seek/decode_size_tiny_vp9_360p

family: decode-seek | fixture asset: `tiny_vp9_360p_2s.webm` (VP9 video in WebM/Matroska, 360p, ~2 s, 155 KB) | primaryMetric: decodeFps | passCount: 5 (of 7; 4 bit-exact, 1 proxy-SSIM)

## Verdict

Best framework: **remotion-webcodecs@4.0.479**. CONTESTED — 5 engines PASS (remotion-webcodecs, mediabunny, platform, web-demuxer, ffmpeg.wasm); 2 are NA_ENGINE (mp4box, remotion-media-parser).

Decisive factor: correctness is a 4-way tie at the TOP of the ladder — remotion-webcodecs, mediabunny, platform, and web-demuxer each decoded all 12 paired frames digest-identical (exactFrames=12, SSIM=1, PSNR=∞), i.e. the bit-exact/digest-equality proxy, the strongest rung the `ssim-psnr` oracle can reach. ffmpeg.wasm passed on the WEAKER perceptual proxy (exactFrames=0, SSIM 0.969 ≥ 0.96 floor) and is therefore correctness-inferior. Among the 4 bit-exact engines, the tiebreak is the primaryMetric `decodeFps` (higher better): remotion-webcodecs leads at 254.57 fps.

Margin over runner-up (mediabunny, next bit-exact engine): 254.57 / 239.91 = **1.06x faster decodeFps**, and 117.84 / 125.04 = **1.06x lower wall** (117.84 ms vs 125.04 ms). Over the slowest bit-exact engine (web-demuxer, 178.44 fps) the lead is 1.43x. NOTE: every metric is n=1 (mad=0, single sample), so the ~6% margin over mediabunny is within run-to-run noise and the win is statistically thin.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | decodeFps | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 117.84 | 254.57 | n/a (0) | 1012 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (exact 0/12, SSIM 0.9696) | 119.54 | 250.96 | 281,513,335 | 3638 | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 125.04 | 239.91 | 128,133,828 | 1012 | cached previous PASS |
| platform@chrome-149 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 142.59 | 210.39 | 69,217,342 | 1007 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 168.12 | 178.44 | n/a (0) | 19963 | cached previous PASS |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

(throughputRealtime not reported in this shard's bench; decodeFps is the primaryMetric used for ranking.)

## Why the winner wins (deep technical)

The operation is `decodeFrames` over a VP9 elementary stream carried in WebM (Matroska), 360p, capped at `maxFrames: 30` (only 12 frames were paired against the golden). VP9 is an intra/inter codec with NO bidirectional B-frames in this profile, so decode order equals presentation order — the reorder-window machinery in the adapters is moot here and every engine that gets pixels at all should produce identical frames.

That is exactly what the oracle confirms. `ssimPsnr` in `src/core/oracles.ts:1760-1810` walks paired frames; for each, if the candidate's normalized-RGBA `sha256` equals the golden frame's `sha256` (`oracles.ts:1766`), it counts an exact frame (SSIM=1). When `exactCount === pairs` it short-circuits to PSNR=∞ and returns PASS (`oracles.ts:1803-1809`). remotion-webcodecs, mediabunny, platform, and web-demuxer all hit `exactFrames=12 == pairs=12`, meaning their decoded pixels are byte-identical to the committed golden after the shared canvas normalization. This is the strongest correctness signal the suite produces for a decode op (the bit-exact/digest rung), so the four are correctness-equivalent and the decision falls through to performance per the ranking ladder.

Mechanistically all four bit-exact engines route the actual pixel decode through the SAME backend: Chrome 149's native WebCodecs `VideoDecoder` with hardware preferred (Apple M1 Max via ANGLE/Metal). The reason remotion-webcodecs edges ahead on `decodeFps` (254.57) is pipeline overhead, not codec correctness:
- remotion-webcodecs (`src/engines/remotion-webcodecs/adapter.ts:651-705`) uses `parseMedia` to sample the track and `createVideoDecoder` (its thin wrapper over native WebCodecs, hardware-preferred — `env.configUsed.hwAccel="prefer-hardware(+software fallback)"`, `pipeline="streaming-backpressure"`). It feeds chunks with `waitForQueueToBeLessThan` backpressure and rasterizes via offscreencanvas-2d. Lowest wall (117.84 ms) and highest decodeFps.
- mediabunny (`configUsed.pipeline="streaming-lockstep"`, `pixelBackend="VideoSample.copyTo(RGBA)>canvas"`) is a near-equal second at 239.91 fps / 125.04 ms; its lockstep (one-in-one-out) discipline costs a little throughput vs remotion's deeper backpressured queue.
- platform (raw Chrome `VideoDecoder`, `queueDepth=2`, `pixelBackend="webgpu>webgl>offscreen2d"`) is 210.39 fps; the lower fixed queue depth (2) limits decoder occupancy on a clip this small.
- web-demuxer (`src/engines/web-demuxer/adapter.ts:848-947`) is correct but slowest at 178.44 fps. It demuxes the WebM in a bundled wasm worker, hands `EncodedVideoChunk`s through `read('video')` into a native `VideoDecoder`, then rasterizes. Its longtasks of 19,963 ms is an extreme outlier (vs ~1000 ms for the others) — the wasm demux + worker round-trips and per-frame canvas rasterization dominate the main thread for a tiny clip, dragging wall to 168.12 ms.

So the winner is decided purely on the throughput rung after a 4-way correctness tie: remotion-webcodecs has the deepest backpressured WebCodecs feed and the lowest per-frame overhead for this small VP9/WebM clip.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, bit-exact (exact 12/12, SSIM=1), correctness-equal to the winner. Lost only on throughput: 239.91 vs 254.57 decodeFps (0.94x) and 125.04 vs 117.84 ms wall (1.06x slower). Its streaming-lockstep pipeline trades a little throughput for backpressure simplicity. Statistically the gap is n=1 noise.
- **platform@chrome-149** — PASS, bit-exact (exact 12/12, SSIM=1). Lost on throughput: 210.39 decodeFps (0.83x of winner), 142.59 ms wall (1.21x). Fixed `queueDepth=2` underfills the decoder on a 12-frame clip. (Best peakMemory at 69.2 MB, but memory is not the primaryMetric and does not override the decodeFps ranking.)
- **web-demuxer@4.0.0** — PASS, bit-exact (exact 12/12, SSIM=1). Slowest bit-exact engine: 178.44 decodeFps (0.70x), 168.12 ms wall (1.43x), and a 19,963 ms longtasks blowout from wasm-worker demux + per-frame rasterization. Correct but heaviest path.
- **ffmpeg.wasm@0.12.15** — PASS, but on the WEAKER proxy rung: exactFrames=0/12, gate rested on SSIM min 0.9690 ≥ 0.96 floor (mean 0.9696), no digest match. Its software VP9 decode + RGB conversion differs from the golden pixels enough to never be digest-identical, so even though its raw decodeFps (250.96) is close to the winner, it is correctness-inferior and cannot outrank a bit-exact engine. Also peakMemory 281.5 MB (highest) and longtasks 3638 ms (single-thread wasm, `wasmThreads:0`).
- **mp4box@2.3.0** — NA_ENGINE, honest. mp4box.js is an ISO-BMFF (MP4) box parser/demuxer; it does not implement `decodeFrames` and does not decode pixels at all. Reason "engine does not declare operation 'decodeFrames'" is a genuine capability gap, not under-declaration. (It also targets MP4, not WebM.)
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest. media-parser is a parse-only library (it surfaces tracks/samples for downstream decode by @remotion/webcodecs, which is the separate engine that DID win). It legitimately does not declare `decodeFrames`; the NA is correct, not a hidden capability.

## Anti-cheat validation

- Scenario definition: `src/scenarios/decode-seek/index.ts:354-365` — `id: 'decode_size_tiny_vp9_360p'`, `asset: 'tiny_vp9_360p_2s.webm'`, container webm, videoCodec vp9, maxFrames 30, tolerances `{ ssimMin: 0.96 }`. Notes explain the slightly looser SSIM floor is for "cross-decoder VP9 output differences" — a documented, narrow relaxation, not a blanket loosening.
- Fixture: `fixtures/media/tiny_vp9_360p_2s.webm` EXISTS (155 KB, real VP9/WebM media). Not synthetic/empty/mock.
- Winner adapter: `src/engines/remotion-webcodecs/adapter.ts:651-705` — `decodeFrames` genuinely calls `parseMedia` + `createVideoDecoder` (native WebCodecs, hardware-preferred) and rasterizes each real `VideoFrame`; capabilities at `:241` declare decodeFrames honestly. No canned output, no copy-input, no short-circuit to golden, no error-swallowing-as-success.
- Oracle: `src/core/oracles.ts:1688` (`ssimPsnr`), gate logic `:1760-1810`. It performs a REAL per-frame comparison — sha256 digest equality of normalized RGBA against the committed golden (`:1766`), counting `exactFrames`, and only returns PSNR=∞ PASS when ALL pairs are digest-identical (`:1803`). Measurements are physically plausible: pairs=12 matches a ~2 s clip sampled to maxFrames, SSIM=1 for bit-exact decoders, SSIM 0.9696 for ffmpeg's software path. NOT trivially satisfiable for the winner (digest equality is the strict rung); the only loose-ish path is ffmpeg's 0.96 SSIM floor, and ffmpeg is the LOSER, so the winner's gate is strong.
- Cached: ALL engine results have `cached: true` ("cached previous PASS result"). Evidence was reused, not re-run this session — staleness risk noted. The win margin is also n=1 per metric, so the cached numbers carry no spread to corroborate.

Verdict: **REAL** for the winner — real VP9/WebM fixture, genuine native-WebCodecs decode implementation, and a strict digest-equality oracle that the winner passed at the top rung (exact 12/12). The only caveats are the cached-only evidence and the n=1 throughput margin (the correctness verdict is robust; the specific RANKING among the 4 bit-exact engines is soft).

## Confidence & caveats

- Confidence: medium. The PASS and bit-exact correctness are solid and oracle-verified. The choice of remotion-webcodecs over mediabunny rests on a ~6% decodeFps / wall margin measured at n=1 (mad=0, single sample) on cached results — within plausible noise. A re-run could flip the top-1 among the four bit-exact engines.
- All four bit-exact engines share the same native Chrome WebCodecs VP9 decode backend, so they are effectively correctness-tied; the suite's primaryMetric (decodeFps) is the only discriminator and it is noisy here.
- peakMemory is unreported (0) for remotion-webcodecs and web-demuxer, so memory could not be used as a tiebreak; had it been, platform (69.2 MB) would look attractive but is throughput-inferior.
- Two NA_ENGINE results (mp4box, remotion-media-parser) are honest parse-only gaps, not under-declared capabilities.
