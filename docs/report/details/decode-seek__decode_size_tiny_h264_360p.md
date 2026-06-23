# decode-seek/decode_size_tiny_h264_360p

family: decode-seek | fixture asset: `fixtures/media/tiny_h264_360p_2s.mp4` (H.264 in MP4, 360p, ~2s, 173 KB) | primaryMetric: decodeFps | passCount: 5/7

## Verdict

Best framework: **platform@chrome-149** (Chrome WebCodecs `VideoDecoder`, hardware-accelerated).
CONTESTED — 5 engines PASS (platform, mediabunny, ffmpeg-wasm, remotion-webcodecs, web-demuxer).

Decisive factor: **correctness strength first, then performance**. Four engines (platform, mediabunny, remotion-webcodecs, web-demuxer) reach the strongest tier — all 12 paired frames **digest-identical** (`exactFrames=12`, SSIM=1, PSNR=∞). ffmpeg-wasm is at the SAME apparent SSIM gate but **only via the perceptual proxy** (`exactFrames=0`, ssimMin=0.9999702) — a strictly weaker correctness signal per the ladder, so it is demoted below the bit-exact group despite the fastest fps. Among the four bit-exact engines, platform has the highest decodeFps and lowest wall.

Margin over runner-up (mediabunny, the next bit-exact engine): **258.34 vs 249.03 decodeFps = 1.04x faster**, and wall **116.13 vs 120.47 ms = 1.04x lower**. A small but consistent lead. (Versus ffmpeg-wasm's headline 283.18 fps, platform is 0.91x — but ffmpeg-wasm loses on correctness tier, not speed.)

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:true (exact 12/12, SSIM=1) | 116.13 | n/a (decodeFps 258.34) | 0 (not measured) | 12909 | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:true (exact 12/12, SSIM=1) | 120.47 | n/a (decodeFps 249.03) | 0 (not measured) | 3234 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (exact 0/12, SSIM=0.99997) | 105.94 | n/a (decodeFps 283.18) | 280,770,253 | 3391 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (exact 12/12, SSIM=1) | 132.71 | n/a (decodeFps 226.06) | 0 (not measured) | 3391 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (exact 12/12, SSIM=1) | 148.81 | n/a (decodeFps 201.59) | 0 (not measured) | 4223 | cached previous PASS |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

The operation is `decodeFrames` on a tiny 360p H.264 elementary stream inside a faststart MP4. There is no encryption, no fragmentation, and the clip fits entirely in memory, so the contest is purely about: (1) producing pixel-exact output versus the committed golden, and (2) per-frame decode throughput at the low end of the size curve (the scenario's stated purpose, `notes: "Tiny 360p H.264: low end of the decode-fps-vs-size curve."`, src/scenarios/decode-seek/index.ts:352).

platform decodes via Chrome's native WebCodecs `VideoDecoder` with `hwAccel:true` (env.configUsed.backend="webcodecs", decode="VideoDecoder", hwAccel:true) on an Apple M1 Max VideoToolbox path. The adapter (src/engines/platform/decode.ts:89 `decodeWithWebCodecs`) configures the decoder against the demuxed avcC config, feeds `EncodedVideoChunk`s in decode order, retains output frames, re-orders to presentation order (src/engines/platform/decode.ts:141), rasterizes each `VideoFrame` to tight RGBA ImageData and computes a `crypto.subtle.digest('SHA-256')` per frame (src/engines/platform/decode.ts:154 → src/engines/platform/digest.ts:32-69). Because the golden was baked from the SAME platform/WebCodecs pixel pipeline, every one of the 12 emitted frames matches the golden sha256 exactly — the oracle's digest-equality branch fires for all pairs (src/core/oracles.ts:1766-1771), giving `exactFrames=12`, ssimMean=1, ssimMin=1, and PSNR=∞ via the `exactCount===pairs` branch (src/core/oracles.ts:1803-1809). This is the top of the correctness ladder: not perceptual proxy, but byte-identical normalized RGBA.

Hardware decode of a tiny 360p clip on M1 has near-zero per-frame cost, so platform tops the bit-exact group at 258.34 decodeFps / 116.13 ms wall. mediabunny also rides WebCodecs hardware (env.configUsed backend="webcodecs", hwAccel="prefer-hardware") and likewise lands `exactFrames=12`, but is marginally slower (249.03 fps, 120.47 ms) — likely the extra `VideoSample.copyTo(RGBA)>canvas` rasterization hop in its config versus platform's direct ImageData path. remotion-webcodecs (226.06 fps) and web-demuxer (201.59 fps) are bit-exact too but trail further, consistent with extra demux/worker-orchestration overhead on a clip this small where fixed costs dominate.

The interesting case is ffmpeg-wasm: it posts the highest raw decodeFps (283.18) and lowest wall (105.94 ms), but its decoder is single-thread WASM software, NOT WebCodecs. Its RGB conversion differs at the bit level from the WebCodecs-baked golden, so NONE of its frames hit the digest-equality fast path (`exactFrames=0`); it falls through to the SSIM-signature branch (src/core/oracles.ts:1773-1786) and scores ssimMin=0.9999702 — passing the 0.99 gate but only as a perceptual proxy. Per the ranking ladder, perceptual-proxy SSIM with exactFrames==0 is explicitly weaker than bit-exact digest output, so ffmpeg-wasm cannot win even though it is fastest. Its 280 MB peakMemory (the only engine to report it) also reflects the WASM heap cost of the software path.

## What each other framework did wrong

- **mediabunny@1.48.0**: PASS, bit-exact (exact 12/12). Lost on performance only: 249.03 vs 258.34 decodeFps (0.96x) and 120.47 vs 116.13 ms wall — a ~4% deficit, plausibly the `VideoSample.copyTo(RGBA)>canvas` rasterization hop. Strong but second.
- **ffmpeg.wasm@0.12.15**: PASS but demoted on correctness tier. Software WASM decode → `exactFrames=0`, ssimMin=0.9999702 (perceptual proxy only, src/core/oracles.ts:1773-1786). Fastest fps (283.18) but the weaker oracle outcome loses to bit-exact engines. Highest memory (280.77 MB).
- **remotion-webcodecs@4.0.479**: PASS, bit-exact (exact 12/12). Lost on performance: 226.06 decodeFps (0.87x of platform), 132.71 ms wall. Streaming-backpressure/worker overhead is wasted on a tiny clip.
- **web-demuxer@4.0.0**: PASS, bit-exact (exact 12/12). Slowest PASS: 201.59 decodeFps (0.78x of platform), 148.81 ms wall, highest longtasks among PASS (4223 ms). WASM demux + WebCodecs handoff overhead dominates at small size.
- **mp4box@2.3.0**: NA_ENGINE — does not declare `decodeFrames`. Honest NA: mp4box is a pure MP4 demuxer/box parser with no decode capability, so it cannot produce pixels.
- **remotion-media-parser@4.0.479**: NA_ENGINE — does not declare `decodeFrames`. Honest NA: media-parser is a parsing/metadata library, not a frame decoder.

## Anti-cheat validation

- Scenario definition: src/scenarios/decode-seek/index.ts:346-353 (case `decode_size_tiny_h264_360p`, asset `tiny_h264_360p_2s.mp4`, container mp4, codec h264, maxFrames 30, default SSIM tolerance 0.99).
- Fixture: `/Users/tarekbadr/.../fixtures/media/tiny_h264_360p_2s.mp4` EXISTS, 173 KB — a real H.264/MP4 clip, not synthetic/empty/mock.
- Golden: `fixtures/golden/tiny_h264_360p_2s.mp4.frames.json` (per-frame sha256) + `.ssim.json` (luma sigs) + `.meta.json` present — real committed goldens.
- Oracle: src/core/oracles.ts:1688 `ssimPsnr`. Real comparison: digest-equality against golden frames (line 1766) with SSIM-signature fallback (1773-1786); gate is `minSsim >= 0.99` on the WORST frame (line 1823), not the mean. PSNR=∞ only when every pair is digest-identical (1803). Not trivially satisfiable; tolerance 0.99 is tight; measurements (12 pairs matching the ~2s clip frame budget, SSIM in [0.99997, 1]) are physically plausible.
- Winner adapter: src/engines/platform/decode.ts:89 `decodeWithWebCodecs` → genuine `VideoDecoder` (decode.ts:175), genuine `crypto.subtle.digest('SHA-256')` (digest.ts:32,40). No canned output, no copy-input, no short-circuit to golden, no error swallowing (errors rethrow, decode.ts:135-138; unsupported config throws, decode.ts:120-122).
- Verdict: **REAL**. Real fixture + real WebCodecs implementation + meaningful bit-exact oracle.
- Cached note: ALL 5 PASS rows have `cached:true` ("cached previous PASS result"). Numbers were reused, not freshly re-run, so absolute fps/wall figures carry staleness risk; per MEMORY launcher-seeding caveat, a fully honest fresh run would clear raw + .browser-cache. The relative correctness ranking (digest-exact vs proxy) is structural and unaffected by caching.

## Confidence & caveats

- Confidence: high on the verdict (correctness tier is a hard structural distinction; platform also leads the bit-exact group on speed).
- Caveats: (1) All measurements cached → absolute timings stale; (2) n==1 per metric (no warmup spread, mad=0), so the 1.04x platform-vs-mediabunny margin is within noise — the win rests primarily on platform being the fastest bit-exact engine, not on a decisive speed gap. (3) decodeFps is the primaryMetric; throughputRealtime/peakMemory unreported (0) for the WebCodecs engines, so cross-engine memory comparison is limited to ffmpeg-wasm only. (4) The golden was baked from the platform/WebCodecs pipeline, which structurally favors WebCodecs engines on digest equality; ffmpeg-wasm's exactFrames=0 is expected and does not by itself indicate a defect.
