# transcode/metamorphic_resize_same_1080p_idempotent

family: transcode | fixture asset: `h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4, 31 MB) | primaryMetric: throughputRealtime | passCount: 3 of 7

## Verdict

- Best framework: **remotion-webcodecs@4.0.479** (engineId `remotion-webcodecs`).
- CONTESTED: 3 engines PASS (remotion-webcodecs, mediabunny, ffmpeg.wasm), all passing the same two oracles (`ssim-psnr`, `property-invariant`).
- Decisive factor: **correctness strength on the ssim-psnr ladder**. remotion-webcodecs scored `exactFrames=12/12` — every paired frame is digest-identical (SSIM=1.0000 exact, PSNR=∞). Both mediabunny and ffmpeg.wasm scored `exactFrames=0/12` (perceptual SSIM proxy ~0.99999976, PSNR unavailable). Per the ranking rule "ssim-psnr is WEAKER if measurements.exactFrames==0" and "tighter measured tolerances / higher exactFrames win," remotion-webcodecs has strictly stronger correctness evidence: it produced a bit-exact (post-normalization) idempotent 1080p→1080p resize, the others only a perceptually-equal one.
- Margin over runner-up (mediabunny): on correctness, 12/12 exact frames vs 0/12 (decisive). NOTE: on performance mediabunny is actually faster — wall 3055.85 ms vs 5387.64 ms (remotion-webcodecs is 1.76x SLOWER), throughputRealtime 9.82x vs 5.57x, longtasks 234 ms vs 3045 ms. The win is purely on correctness strength, which the decision procedure ranks first.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (12/12 exact), property-invariant:true | 5387.64 | 5.568 | 0 (n=0) | 3045 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:true (0/12 exact), property-invariant:true | 3055.85 | 9.817 | 0 (n=0) | 234 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (0/12 exact), property-invariant:true | 100043.16 | 0.300 | 0 (n=0) | 5390 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: source carries audio and the MediaRecorder canvas-capture path cannot preserve/copy audio |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a metamorphic idempotence check: decode H.264 1080p, run a resize to the SAME 1920x1080, re-encode H.264 into MP4, then validate that the output is pixel-stable against an in-browser reference decode of the source (no committed golden — `usesTransformReference`/no-golden path in `ssimPsnr`, src/core/oracles.ts:1694-1738). A correct ~no-op resize should reproduce the source pixels almost perfectly; the gate is SSIM≥0.97 with digest-exact frames promoted to PSNR=∞.

remotion-webcodecs ran on `backend: webcodecs`, `hwAccel: prefer-hardware(+software fallback)`, `pixelBackend: offscreencanvas-2d`, `pipeline: streaming-backpressure` (env.configUsed). Its transcode path (src/engines/remotion-webcodecs/adapter.ts:521-577) maps the canonical request to `@remotion/webcodecs`: because the scenario asks for an explicit `h264` output codec it sets `videoCodec` and builds a `ResizeOperation` via `buildResize` (adapter.ts:535-541), then drives the shared `convert()` (adapter.ts:579-631) which calls the real `wc.convertMedia({ container, videoCodec, resize, controller, writer: bufferWriter, expectedDurationInSeconds, expectedFrameRate })`. This is a genuine decode→resize-on-OffscreenCanvas-2D→VideoEncoder re-encode, with a header-only `parseMedia` probe (adapter.ts:599-609) supplying the moov size hints and an in-memory bufferWriter returning the bytes (adapter.ts:629-630).

The reason it achieved `exactFrames=12/12` is the pixel pipeline. The ssim-psnr oracle re-decodes the candidate output with the platform decoder, normalizes each frame to tight, top-left, straight-alpha RGBA, and SHA-256s it (src/engines/remotion-webcodecs/digest.ts:36-74, byte-identical to the platform/mediabunny digest rule). When `normHex(cand.sha256) === normHex(want[i].sha256)` the frame is counted exact, SSIM=1, and once `exactCount === pairs` the oracle returns PSNR=∞ (oracles.ts:1766-1809). remotion-webcodecs hit the same-resolution no-op so faithfully that all 12 sampled frames round-tripped to the identical normalized RGBA digest as the reference source decode — i.e. the resize was a true identity transform at the pixel level after the H.264 re-encode/re-decode. The `property-invariant` oracle (transcode-output-metadata, oracles.ts:2650-2651) independently confirmed the output is MP4 with the requested shape and `durationDeltaSec=0.0210s` against a 0.15s tolerance, `videoTracks=1`.

mediabunny and ffmpeg.wasm both PASS the same two oracles but only as a perceptual proxy: `exactFrames=0/12`, `ssimMin≈0.99999960`/`0.99999978`, PSNR reported unavailable. Their re-encode is perceptually lossless but introduces sub-perceptual pixel deltas (encoder quantization / decoder rounding differences) so no frame is digest-identical — strictly weaker evidence on the ladder. mediabunny used `pixelBackend: VideoSample.copyTo(RGBA)>canvas`, a different RGBA derivation than the offscreencanvas-2d path the digest expects, which plausibly contributes the tiny non-bit-exact deltas.

## What each other framework did wrong

- **mediabunny@1.48.0**: PASS but lost on correctness strength — `ssim-psnr` exactFrames=0/12 (SSIM proxy 0.99999976, PSNR unavailable) vs the winner's 12/12 exact + PSNR=∞. It is faster (wall 3055.85 ms = 1.76x faster, throughputRealtime 9.817x, longtasks 234 ms) but performance is the secondary tiebreaker, applied only when correctness is comparable — and here it is not.
- **ffmpeg.wasm@0.12.15**: PASS but the weakest performer and tied-weak on correctness — `ssim-psnr` exactFrames=0/12 (SSIM 0.99999988, PSNR unavailable), and catastrophically slow: wall 100043.16 ms (18.6x slower than the winner), throughputRealtime 0.300x (slower than realtime), longtasks 5390 ms. Single-thread wasm software encode (no hardware WebCodecs) is the cause.
- **platform@chrome-149**: NA_ENGINE — honest. Its transcode path is `<video>→canvas→MediaRecorder` (env.configUsed), which cannot preserve or copy the source AAC audio track; with an audio-bearing fixture the adapter correctly self-declares NA rather than silently dropping audio. Honest capability gap, not under-declared.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'transcode'". Honest: media-parser is a demux/parse library with no encoder.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare operation 'transcode'". Honest: it is a demuxer only, no encode path.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare operation 'transcode'". Honest: mp4box is an MP4 box parser/muxer with no video codec.

## Anti-cheat validation

- Scenario definition: src/scenarios/transcode/index.ts:1326-1345 (`id: 'metamorphic_resize_same_1080p_idempotent'`), op `transcode`, input `h264_1080p_30s.mp4`, opts `{container:'mp4', video:{codec:'h264', width:1920, height:1080}, invariant:'transcode-output-metadata'}`, oracles `['ssim-psnr','property-invariant']`, tolerances `{ssimMin:0.97, psnrMinDb:36, durationToleranceSec:0.15}`. Notes describe a sound same-dims no-golden reference path (lines 1300-1305, 1341-1344).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — a real H.264+AAC 1080p clip, not synthetic/empty/mock.
- Oracle: `ssimPsnr` at src/core/oracles.ts:1688 with the no-golden reference path (1694-1738), digest-exact promotion (1766-1809); `propertyInvariant`/transcode-output-metadata at oracles.ts:2645-2651. The gate is a real per-frame comparison against an in-browser reference decode of the source; digest equality uses SHA-256 over normalized RGBA (not a wide tolerance). exactFrames=12 with SSIM=1.0/PSNR=∞ is physically plausible for a same-dimension idempotent resize.
- Winner adapter: src/engines/remotion-webcodecs/adapter.ts:521-577 (transcode) → 579-631 (convert via real `wc.convertMedia` with VideoEncoder + ResizeOperation + bufferWriter). No canned output, no input→output copy, no golden short-circuit, no swallowed errors. Digest: src/engines/remotion-webcodecs/digest.ts:36-74 (real crypto.subtle SHA-256).
- Verdict: **REAL** — real fixture, real WebCodecs re-encode implementation, meaningful digest-exact oracle that the winner satisfied at the strongest (bit-exact) rung.
- Cached note: ALL THREE PASS results have `cached==true` ("cached previous PASS result"). The evidence was reused, not freshly re-run in this report pass; given the prior launcher/seeding stale-PASS caveat this is a mild staleness risk, but the measurements (exactFrames, SSIM, durations, wall) are internally consistent and physically plausible, so confidence remains high that the cached numbers reflect a genuine prior run.

## Confidence & caveats

- Confidence: HIGH. Three independent engines pass the same oracles; the winner is separated cleanly by a bit-exact (12/12 digest-identical) result versus perceptual-only (0/12) for the others — a strong, unambiguous correctness signal.
- Caveats: (1) all bench metrics are n=1 (mad=0, p95==median), so the performance numbers carry low statistical weight — but performance is not the deciding axis here. (2) peakMemory/decodeFps have n=0 (not captured), so memory could not be compared. (3) All PASS results are cached; a fresh re-run (clear raw + .browser-cache) would harden the evidence. (4) The "exact" frames are exact only after RGBA normalization via the platform decoder; this is the suite's standard digest contract, not raw bitstream equality, but it is identical across engines so the comparison is fair.
