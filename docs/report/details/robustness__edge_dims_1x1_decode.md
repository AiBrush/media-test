# robustness/edge_dims_1x1_decode

family: robustness · fixture asset: `video_1x1.webm` (VP9 in WebM, 1×1 px, 1.8 kB) · primaryMetric: (none recorded in shard — no `bench{}` block) · passCount: 5 of 7

## Verdict

- Best framework: **platform@chrome-149** (Chrome WebCodecs `VideoDecoder`).
- **CONTESTED**: 5 engines PASS (platform, mediabunny, ffmpeg.wasm, web-demuxer, remotion-webcodecs); 2 are NA_ENGINE (mp4box, remotion-media-parser).
- Decisive factor: **correctness strength**, not performance. The shard carries no `bench{}` metrics, so ranking rests entirely on the oracle. platform is the *only* engine that produced a **bit-exact / digest-identical** frame: `ssim-psnr` reported `exactFrames:1, ssimMean:1, ssimMin:1` (SSIM=1, PSNR=∞). Every other PASS engine landed on the weaker perceptual fallback: `exactFrames:0` with SSIM ≈ 0.9997–0.9998, which clears the `ssimMin ≥ 0.96` gate but is one rung lower on the correctness ladder (perceptual proxy vs. digest-exact).
- Margin over runner-up: digest-exact (SSIM 1.0000 / PSNR ∞) vs. best non-winner SSIM 0.9998 (mediabunny / ffmpeg.wasm) — i.e. the runner-ups contributed **0 exact frames out of 1** while platform contributed **1/1**. Caveat: this exactness is partly self-referential (see Anti-cheat).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:true (exactFrames 1/1, SSIM 1, PSNR ∞) | n/a (no bench; durationMs 15) | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:true (exactFrames 0/1, SSIM 0.9998) | n/a (durationMs 11) | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (exactFrames 0/1, SSIM 0.9998) | n/a (durationMs 147) | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (exactFrames 0/1, SSIM 0.9997) | n/a (durationMs 75) | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (exactFrames 0/1, SSIM 0.9997) | n/a (durationMs 46) | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'decodeFrames' |

Note: this shard contains no `bench{}` object for any engine. The only timing is `durationMs` (total run incl. cache hydration), which is not a clean throughput metric; it is shown for completeness only and is NOT a ranking input.

## Why the winner wins (deep technical)

The operation is `decodeFrames` with `options.maxFrames:1` against `video_1x1.webm` — a single-keyframe **VP9 elementary stream in a WebM/Matroska container** at the degenerate dimension 1×1. The gating oracle is `ssim-psnr` (src/core/oracles.ts:1688) with `tolerances.ssimMin = 0.96` (src/scenarios/robustness/index.ts:690-691). The scenario exists specifically to exercise the SSIM/luma divide-by-zero guard on a one-pixel frame, and its `notes` declare up front that the row is "perceptual rather than bitexact because a one-pixel VP9 decode can round differently across otherwise correct decoders" (index.ts:692-695).

The oracle's comparison logic has two tiers (oracles.ts:1760-1790). Tier 1: if the candidate frame's `sha256` equals the golden frame's `sha256` (oracles.ts:1766), the frame is counted as digest-identical → SSIM 1, and `exactCount++`. Tier 2 (fallback): when the digest differs, it derives a downsampled Rec.601 luma signature from the candidate pixels and computes signature-SSIM against `golden.ssimRef` (oracles.ts:1773-1786). When `exactCount === pairs` the oracle short-circuits to `psnrDb = +Infinity` and the strong PASS message "all 1 paired frames digest-identical (SSIM=1, PSNR=∞)" (oracles.ts:1803-1809) — which is exactly platform's recorded `detail`. The others land in the `ssimPass` branch (oracles.ts:1826-1830) with the "digest proxy: 0/1 exact" message.

Mechanistically, platform decodes via Chrome's native WebCodecs `VideoDecoder` (src/engines/platform/decode.ts:89 `decodeWithWebCodecs`), feeds the single VP9 keyframe as an `EncodedVideoChunk` of type `key` (decode.ts:198-203), flushes, then rasterizes the resulting `VideoFrame` to `ImageData` and sha256-digests the normalized RGBA buffer (decode.ts:148-155 → digest.ts). Critically, the **golden frame digests were themselves baked by this same platform engine**: `fixtures/golden/video_1x1.webm.frames.json` carries `"bakedBy":"frame-bake (platform engine) · …Chrome/149.0.0.0…"` (frames.json:103) and every frame sha256 is the identical `515a5350…3b3c638`. So platform's decode reproduces the byte-exact RGBA pixel the golden encodes, giving a guaranteed digest match. This is a real decode — platform is not short-circuiting to the golden — but the *exactness* is a consequence of golden provenance, and the scenario notes openly anticipate that other (equally correct) VP9 decoders will round the YUV→RGB conversion of the single subsampled pixel a fraction differently and therefore miss the digest. They do: SSIM 0.9997–0.9998 confirms the decoded pixel is essentially the same color, just not the same byte.

platform's adapter also has a VP9-specific correctness detail relevant here: it DROPS any out-of-band `description`/CodecPrivate for VP8/VP9 (decode.ts:77-83, 108-115) because Chrome's VP9 decoder reads config in-band and a WebM `CodecPrivate` blob is not a valid WebCodecs description; this avoids the null-`.trim()` native config crash and lets the 1×1 VP9 keyframe configure and decode cleanly.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on correctness strength: `exactFrames:0/1`, SSIM 0.9998 (the strongest of the non-winners, but still the perceptual-proxy tier, one rung below platform's digest-exact 1.0/∞). Its own WebCodecs/VideoSample.copyTo(RGBA) path rounds the 1×1 VP9 pixel to a slightly different byte than the platform-baked golden.
- **ffmpeg.wasm@0.12.15** — PASS but lost: identical perceptual outcome to mediabunny (`exactFrames:0/1`, SSIM 0.9998). Software libvpx decode + its own RGBA conversion yields a near-identical but not byte-identical pixel.
- **web-demuxer@4.0.0** — PASS but lost: `exactFrames:0/1`, SSIM 0.9997. Same perceptual-tier fallback; digest mismatch vs. golden.
- **remotion-webcodecs@4.0.479** — PASS but lost: `exactFrames:0/1`, SSIM 0.9997. Decodes via WebCodecs but rasterizes through offscreencanvas-2d; the resulting RGBA byte does not match the platform-baked golden digest.
- **mp4box@2.3.0** — NA_ENGINE, honest: it is a pure ISO-BMFF box parser/demuxer with no decoder and declares only demux/probe-class ops (adapter.ts:7-12, 634-637). It does not declare `decodeFrames`, so the runner records NA and never calls it. Not an under-declaration. (Also a container mismatch: mp4box parses MP4, not WebM.)
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: it emits encoded samples only and explicitly throws "decodeFrames not supported (no decoder; emits encoded samples only)" (adapter.ts:556-557); `decodeFrames` is left out of its declared `operations` (adapter.ts:190, 545), so the runner NAs it without invocation. Genuine capability gap, not a cheat.

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:683-696 (`id: 'edge_dims_1x1_decode'`, op `decodeFrames`, asset `video_1x1.webm`, codec vp9, container webm, `oracles:['ssim-psnr']`, `tolerances.ssimMin:0.96`).
- Fixture: `fixtures/media/video_1x1.webm` EXISTS (1.8 kB, real VP9/WebM bitstream — not synthetic/empty/mock). It is the smallest valid VP9 clip and is intentionally degenerate (1×1), matching the scenario's stated divide-by-zero-guard purpose.
- Oracle: `ssim-psnr` at src/core/oracles.ts:1688; digest-exact path 1760-1809, signature-SSIM fallback 1773-1830. The oracle performs a REAL comparison: sha256 digest equality against committed golden, then luma-signature SSIM against `fixtures/golden/video_1x1.webm.ssim.json` (side=16, 256-value Rec.601 signatures). Measurements are physically plausible: one 1×1 frame, SSIM in [0.9997, 1.0], golden frame digests all `515a5350…` for a constant-color 1-pixel clip.
- Winner adapter: src/engines/platform/decode.ts:89-163 (`decodeWithWebCodecs`) — genuine WebCodecs `VideoDecoder.configure`/`decode`/`flush` (lines 175-205), real rasterize+digest (148-155). No canned output, no input→output copy, no short-circuit to golden, no error-swallow-as-success.
- Verdict: **WEAK-GATE**. The gate is real and the decode is real, but (1) the gating oracle is a perceptual/digest-proxy SSIM, not a true RGB PSNR (golden ships no raw pixels — oracles.ts:1799-1802), and (2) the golden frame digests AND ssim signatures were baked by the *winning* engine itself (frames.json:103 `bakedBy: frame-bake (platform engine)`; ssim.json `$note: platform-decoded golden frames`). That makes platform's unique `exactFrames:1`/SSIM=1 result partly self-referential rather than an independent correctness advantage — the scenario notes explicitly acknowledge other correct decoders will round differently. The PASS is honest; the *strength* margin over the other four PASS engines is inflated by golden provenance, so the win is real but the gate is loose/proxy. Not a CHEAT: every PASS engine ran a real decode, and the two NA engines are honestly under-capable.
- Cached note: ALL 7 engine entries have `cached:true` ("cached previous PASS result"). No engine was re-run for this shard; results are reused. Staleness risk is low for a deterministic 1×1 decode but should be flagged — the numbers were not freshly produced.

## Confidence & caveats

- Confidence: **medium**. Engine eligibility, oracle path, fixture existence, and NA honesty are all directly verified in code. The winner is unambiguous on the correctness ladder (only digest-exact frame).
- Caveat 1 — golden provenance: platform baked the golden, so its exact-match advantage is structural, not necessarily indicative of superior decode quality vs. mediabunny/ffmpeg.wasm. A different baker would likely flip which engine is digest-exact.
- Caveat 2 — no `bench{}`: this shard has no wall/throughput/memory metrics, so no performance tiebreaker was possible; ranking is correctness-only. `durationMs` (platform 15 ms, mediabunny 11 ms, ffmpeg.wasm 147 ms) is reported for context only and is dominated by cache hydration, not decode.
- Caveat 3 — all results cached; not re-run in this pass.
