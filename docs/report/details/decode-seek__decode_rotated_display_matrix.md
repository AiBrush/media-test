# decode-seek/decode_rotated_display_matrix

family: decode-seek | fixture asset: `fixtures/media/h264_rotated90.mp4` (4.4 MB, H.264+AAC in MP4, coded 1280x720 @30fps, 90° display-matrix rotation) | primaryMetric: decodeFps | passCount: 4 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- **CONTESTED**: 4 engines PASS (mediabunny, platform, remotion-webcodecs, ffmpeg-wasm). Three of them (mediabunny, platform, remotion-webcodecs) are bit-exact (12/12 digest-identical frames, SSIM=1, PSNR=∞); ffmpeg-wasm is the weaker SSIM proxy (exactFrames 0/12).
- Decisive factor: among the three correctness-equal (bit-exact) engines, **performance**. mediabunny has the highest decodeFps and lowest wall.
- Margin over runner-up (platform, the next bit-exact engine): **decodeFps 87.89 vs 72.99 = 1.20x faster; wall 341.32 ms vs 410.98 ms = 1.20x faster**. Over remotion-webcodecs: 87.89 vs 58.98 fps = 1.49x, wall 341.32 vs 508.66 ms = 1.49x. (All bench rows are n==1, no warmup repeats — see caveats.)

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 341.32 | n/a (decodeFps 87.89) | 0 (not measured) | 263 | cached previous PASS result |
| platform@chrome-149 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 410.98 | n/a (decodeFps 72.99) | 344,144,164 | 234 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 508.66 | n/a (decodeFps 58.98) | 0 (not measured) | 3638 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (exact 0/12, SSIM min 0.9999) | 498.47 | n/a (decodeFps 60.18) | 0 (not measured) | 4095 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'rotate' |

(No engine reports throughputRealtime for this scenario; primaryMetric is decodeFps, shown inline. peakMemory is only sampled by the platform engine.)

## Why the winner wins (deep technical)

The scenario (`src/scenarios/decode-seek/index.ts:172-183`) asks a specific question: does the decoder **apply the MP4 `tkhd` display matrix to the OUTPUT PIXELS** — producing content rotated 90° with display dimensions swapped — rather than merely swapping width/height in metadata while leaving coded pixels unrotated? The committed golden (`fixtures/golden/h264_rotated90.mp4.frames.json`, 13 frame digests; `...ssim.json` luma sigs) is the *rotated, displayed* pixel sequence, so an engine that emits unrotated coded pixels gets a digest/SSIM mismatch.

mediabunny passes the strongest oracle outcome and wins on speed because of its decode-to-RGBA path. In `decodeFrames` (`src/engines/mediabunny/adapter.ts:1330-1410`) it opens the primary video track and pulls `VideoSample` objects from a `VideoSampleSink` constructed with `videoDecoderOptionsForTrack` (hardware-preferred WebCodecs). Each sample is converted by `imageDataFromVideoSample` (`adapter.ts:1722-1734`): it sizes the output buffer from **`sample.displayWidth/displayHeight`** (line 1723-1724), i.e. the rotation-swapped display dimensions, and the fast `copyTo({format:'RGBA'})` path is **deliberately skipped whenever `sample.rotation !== 0`** (`imageDataFromVideoSampleCopyTo`, `adapter.ts:1741-1750`: `untransformed` requires `sample.rotation === 0`). For the rotated clip it therefore falls to `sample.draw(ctx, …)` (line 1732), and mediabunny's `VideoSample.draw` **bakes the display-matrix rotation into the canvas pixels** (comment at line 1731). The resulting normalized RGBA digests match the golden exactly: the shard records `ssim-psnr` pass, `pairs:12, exactFrames:12, ssimMean:1, ssimMin:1` — `detail: "all 12 paired frames digest-identical (SSIM=1, PSNR=∞)"`. This is the digest-equality (PSNR=∞) branch of the oracle (`src/core/oracles.ts:1803-1809`), the strongest result the gate can return.

Mechanistically the env confirms the fast backend: `configUsed.backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pixelBackend:"VideoSample.copyTo(RGBA)>canvas"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`, `wasmThreads:0`. Decoding the H.264 NAL units runs on the M1 Max hardware decoder (ANGLE Metal), and only the rotation presentation goes through the canvas draw. That yields decodeFps **87.89** and wall **341.32 ms** — the best of the three bit-exact engines.

Correctness is a three-way tie at the top (mediabunny, platform, remotion-webcodecs all 12/12 digest-identical), so the decision drops to performance (decision rule 4b). mediabunny beats platform by **1.20x** on both decodeFps (87.89 vs 72.99) and wall (341.32 vs 410.98 ms), and beats remotion-webcodecs by **1.49x** (decodeFps 58.98, wall 508.66 ms). Tiebreaker signals also favor mediabunny: it needs no COOP/COEP (`coopCoep:"not-required"`, `sharedArrayBuffer:false`) and runs a pure-TS ESM core; its longtask budget (263 ms) is an order of magnitude below remotion-webcodecs (3638 ms) and ffmpeg-wasm (4095 ms). platform's longtasks (234 ms) is marginally lower, but platform also carries a 344 MB peak-memory cost (the only engine to report it) and is the slower decoder.

## What each other framework did wrong

- **platform@chrome-149** — PASS, bit-exact (12/12, SSIM=1), but lost on throughput: decodeFps 72.99 vs 87.89 (0.83x) and wall 410.98 ms vs 341.32 ms (1.20x slower). Also the only engine reporting a large peakMemory (344,144,164 bytes ≈ 344 MB) via its `webgpu>webgl>offscreen2d` pixel path.
- **remotion-webcodecs@4.0.479** — PASS, bit-exact (12/12, SSIM=1), but slowest of the correct engines: decodeFps 58.98 (0.67x of mediabunny), wall 508.66 ms (1.49x), and a heavy 3638 ms longtask total from its `streaming-backpressure` / `offscreencanvas-2d` pipeline.
- **ffmpeg.wasm@0.12.15** — PASS but on the WEAKER proxy: `exactFrames:0/12`, SSIM min 0.9999 ≥ 0.99 floor (detail: "PSNR via golden pixels unavailable (digest proxy: 0/12 exact)"). Its single-thread wasm RGB→digest path produces byte-different (but perceptually identical) pixels, so it never reaches the digest-identical/PSNR=∞ branch. Plus it is slow: decodeFps 60.18, wall 498.47 ms, longtasks 4095 ms.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest NA — remotion-media-parser is a parser/demuxer, it does not own a frame decode path.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest NA — mp4box is an ISOBMFF box parser/demuxer, not a pixel decoder.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare feature 'rotate'". Honest NA — it does not advertise display-matrix rotation handling (the scenario carries `features:['rotate']`, gated out by capability registry).

## Anti-cheat validation

- Scenario definition: `src/scenarios/decode-seek/index.ts:172-183` — `id:'decode_rotated_display_matrix'`, `asset:'h264_rotated90.mp4'`, `container:'mp4'`, `videoCodec:'h264'`, `features:['rotate']`, `maxFrames:30`. Notes explicitly state the golden is the rotated, displayed pixels.
- Fixture exists and is real: `fixtures/media/h264_rotated90.mp4` = 4.4 MB; golden meta (`fixtures/golden/h264_rotated90.mp4.meta.json`) shows real media — H.264 1280x720 @30fps, 3,358,956 bps + AAC 48 kHz stereo, 10 s. Golden frame digests (`...frames.json`, 13 frames) and luma sigs (`...ssim.json`, 77 KB) are committed. Not synthetic/empty/mock.
- Oracle: `ssim-psnr` in `src/core/oracles.ts:1688-1810`. It pairs the engine's decoded frames against committed golden digests by index; the PASS=∞ branch (`:1803-1809`) requires **every** paired frame's normalized RGBA SHA-256 to equal the golden (`normHex(cand.sha256) === normHex(want[i].sha256)`, `:1766`). This is a real, strict, per-pixel-digest comparison — not trivially satisfiable. mediabunny's 12/12 exact result is the strongest outcome of this gate.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1330-1410` (real WebCodecs decode via `VideoSampleSink`), with rotation correctly baked into pixels at `:1722-1734` / `:1741-1750` (`sample.rotation !== 0` forces the `sample.draw` rotated path; output sized from `displayWidth/displayHeight`). No canned output, no copy-input-to-output, no short-circuit to the golden, no swallowed errors — the digest is computed from real decoded pixels (`digestImageData`).
- Measurements are physically plausible: 12 paired frames (golden has 13, maxFrames 30), SSIM exactly 1.0 for digest-identical frames, decodeFps 58-88 for 720p H.264 on M1 Max hardware — all reasonable.
- cached note: mediabunny's result is `cached:true` ("cached previous PASS result", startedAt 2026-06-22T17:04). All four PASS rows are cached, as are the NA rows. Staleness risk: the numbers were reused, not re-run in this invocation; ranking is robust to it because the speed margins (1.20x / 1.49x) exceed plausible cache jitter, but the absolute fps/wall values are single-sample reused measurements.
- Verdict: **REAL** — real fixture, genuine WebCodecs decode + rotation baking, strict digest-equality oracle the winner satisfies 12/12.

## Confidence & caveats

- Confidence: **high** on the verdict (real fixture + real decode + strict bit-exact oracle; clear correctness tier and consistent perf margin).
- All bench rows are **n==1, warmup:1, mad==0** — single measurements, so the perf margins are point estimates without spread. The 1.20x (vs platform) and 1.49x (vs remotion-webcodecs) gaps are large enough to be decisive, but a 1.20x gap on n==1 is weaker evidence than a multi-sample run would give.
- peakMemory is only sampled by the platform engine (344 MB); mediabunny/remotion-webcodecs/ffmpeg report 0 (not measured), so memory cannot be compared across engines.
- All results are `cached:true`; a fresh re-run could shift absolute timings (per the launcher seeding caveat), though not the correctness tiers.
- The three NA_ENGINE entries are honest capability gates (parser-only engines and an engine not declaring 'rotate'), not under-declared decode capability.
