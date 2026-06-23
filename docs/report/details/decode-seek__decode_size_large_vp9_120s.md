# decode-seek/decode_size_large_vp9_120s

family: decode-seek | fixture asset: `large_vp9_1080p_120s.webm` (~102 MB, 1080p VP9 in WebM, 120 s) | primaryMetric: decodeFps | passCount: 5/7

## Verdict

- Best framework: **mediabunny@1.48.0** (`env.engineId` "mediabunny").
- **CONTESTED**: 5 of 7 engines PASS, and 4 of those reach the strongest correctness tier the oracle can express (all 12 paired frames digest-identical to the committed golden, SSIM=1, PSNR=∞). Correctness is therefore a tie among mediabunny, platform, web-demuxer and remotion-webcodecs; the decision falls to performance.
- Decisive factor: highest **decodeFps** (the primaryMetric) at 44.13 fps. Margin over the runner-up (platform, 40.57 fps): **1.088x faster decode throughput**, and equivalently **1.088x lower wall** (1359.6 ms vs 1479.0 ms). The margin is real but modest; see caveats (n=1, all results cached).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true (exact 12/12, SSIM 1, decodeFps 44.13) | 1359.64 | n/a (decodeFps primary) | 0 (not sampled) | 3675 | cached previous PASS result |
| platform@chrome-149 | PASS | ssim-psnr:true (exact 12/12, SSIM 1, decodeFps 40.57) | 1479.01 | n/a | 0 (not sampled) | 4223 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (exact 12/12, SSIM 1, decodeFps 39.63) | 1514.11 | n/a | 0 (not sampled) | 3638 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (exact 12/12, SSIM 1, decodeFps 36.47) | 1645.16 | n/a | 0 (not sampled) | 3391 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (exact 0/12, SSIM min 0.99995, decodeFps 23.44) | 2559.51 | n/a | 3,354,271,393 bytes | 2913 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

(No engine reported throughputRealtime or peakMemory for this scenario except ffmpeg.wasm's peakMemory; bench peakMemory n=0 for the others.)

## Why the winner wins (deep technical)

The operation is `decodeFrames` over a large 1080p **VP9-in-WebM** clip (`maxFrames: 60`; the gating oracle pairs the leading 12 frames against the committed golden `fixtures/golden/large_vp9_1080p_120s.webm.frames.json`). Container is Matroska/WebM with VP9 video; there is no faststart/fragmentation concern as with MP4, and no encryption. The only correctness gate is `ssim-psnr` (`src/scenarios/decode-seek/index.ts:279` `DECODE_ORACLES = ['ssim-psnr']`).

The `ssim-psnr` oracle (`src/core/oracles.ts:1688`) has two strength tiers. Its strongest verdict is the **digest-equality fast path** (`src/core/oracles.ts:1766`): when the candidate frame's normalized-RGBA sha256 equals the golden frame's sha256, that pair is treated as SSIM=1 / PSNR=∞, and when every pair is exact (`exactCount === pairs`, `src/core/oracles.ts:1803`) it returns PASS with `psnrDb=∞`. The weaker tier is the downsampled-luma-signature SSIM gate (`src/core/oracles.ts:1782-1786`, gated on `minSsim >= t.ssimMin`), used only when digests do NOT match. mediabunny landed the strong tier: `oracleOutcomes[0].measurements` = `{pairs:12, exactFrames:12, ssimMean:1, ssimMin:1}` with detail "all 12 paired frames digest-identical (SSIM=1, PSNR=∞)". This is bit-exact agreement with the WebCodecs-baked golden on all 12 sampled frames — the maximal correctness this oracle can certify.

Mechanistically, mediabunny achieved bit-exact digests because its decode path is the canonical WebCodecs hardware path that the golden was baked from. `MediabunnyEngine.decodeFrames` (`src/engines/mediabunny/adapter.ts:1330`) opens the input, gets the primary video track, constructs a real `VideoSampleSink` (`adapter.ts:1387`) over the library's WebCodecs `VideoDecoder`, iterates `sink.samples()`, and for each `VideoSample` calls `imageDataFromVideoSample(sample)` then `digestImageData(img, index, sample.microsecondTimestamp)` (`adapter.ts:1398-1400`). The pixel backend (`env.configUsed.pixelBackend = "VideoSample.copyTo(RGBA)>canvas"`) copies the sample directly to RGBA, deliberately avoiding canvas-fingerprinting perturbations that could shift a digest (comment at `adapter.ts:1326-1329` and capability tag `decode:golden-rgba` at `adapter.ts:1068` — "VideoSample.copyTo(RGBA) matches the baked WebCodecs golden path"). With `backend: webcodecs`, `hwAccel: prefer-hardware` on the Apple M1 Max (ANGLE Metal), the actual VP9 decode runs through the same hardware/WebCodecs pipeline that produced the golden, so the digests collide exactly rather than merely landing within SSIM tolerance.

On performance (the tiebreaker, primaryMetric `decodeFps`), mediabunny's 44.13 fps leads the field. Against the bit-exact cohort the margins are: vs platform 44.13/40.57 = **1.088x**; vs web-demuxer 44.13/39.63 = **1.114x**; vs remotion-webcodecs 44.13/36.47 = **1.210x**. Wall time corroborates: mediabunny 1359.6 ms is the lowest, 1.088x under platform's 1479.0 ms and 1.21x under remotion-webcodecs' 1645.2 ms. mediabunny's `streaming-lockstep` pipeline with a 4-deep canvas pool (`env.configUsed.canvasPoolSize: 4`, `queueDepth: auto`) and pure-TS ESM core needs no COOP/COEP and no SharedArrayBuffer (`coopCoep: not-required`, `sharedArrayBuffer: false`), so the decode is not bottlenecked on worker setup. Its longtasks figure (3675 ms) is mid-pack and not decisive; correctness ties, so throughput governs.

## What each other framework did wrong

- **platform@chrome-149** (PASS, runner-up): Correctness identical (exact 12/12, SSIM=1) via the same `webcodecs` + `hwAccel` VideoDecoder path. Lost purely on throughput: decodeFps 40.57 vs 44.13 (0.919x of mediabunny), wall 1479.0 ms (1.088x slower). Its `offscreencanvas`/`webgpu>webgl>offscreen2d` pixel readback and queueDepth 2 are marginally slower than mediabunny's copyTo(RGBA)+canvas pool. Also highest longtasks (4223 ms).
- **web-demuxer@4.0.0** (PASS): Same maximal correctness (exact 12/12, SSIM=1). Lost on throughput: decodeFps 39.63 (0.898x), wall 1514.1 ms (1.114x slower).
- **remotion-webcodecs@4.0.479** (PASS): Same maximal correctness (exact 12/12, SSIM=1). Slowest of the bit-exact cohort: decodeFps 36.47 (0.826x), wall 1645.2 ms (1.210x slower). Its `streaming-backpressure` `waitForQueueToBeLessThan` decode and offscreencanvas-2d readback cost throughput; its MP4/MOV fast-paths don't apply to this WebM input.
- **ffmpeg.wasm@0.12.15** (PASS but weakest correctness): Passed only via the **proxy** tier — detail says "PSNR via golden pixels unavailable (digest proxy: 0/12 exact)", measurements `exactFrames:0, ssimMin 0.99995`. It decodes with the wasm VP9 decoder, not the WebCodecs path, so its normalized-RGBA digests do NOT match the golden (0/12 exact); it cleared the gate on luma-signature SSIM (0.99995 >= floor) rather than bit-exactness. Even ignoring the weaker correctness tier, it is far slowest (decodeFps 23.44 = 0.531x of mediabunny, wall 2559.5 ms = 1.88x slower) and burns enormous memory (peakMemory 3.354 GB — single-thread wasm whole-clip buffering of a 102 MB input).
- **mp4box@2.3.0** (NA_ENGINE): Honest NA — "engine does not declare operation 'decodeFrames'". mp4box is an MP4/ISOBMFF box parser/demuxer with no pixel decoder, and the input is WebM anyway; the NA is correct, not under-declared.
- **remotion-media-parser@4.0.479** (NA_ENGINE): Honest NA — "engine does not declare operation 'decodeFrames'". The media-parser is a demux/probe library (decoding lives in remotion-webcodecs, which is a separate entry that DID run and pass). NA is correct.

## Anti-cheat validation

- Scenario definition: `src/scenarios/decode-seek/index.ts:378-389` (case) wired through `sizeLadderScenarios` at `src/scenarios/decode-seek/index.ts:404-419` (op `decodeFrames`, input `large_vp9_1080p_120s.webm`, `requires.videoCodecs:['vp9']`, `containersIn:['webm']`, `primaryMetric:'decodeFps'`).
- Fixture: `fixtures/media/large_vp9_1080p_120s.webm` EXISTS and is a real 102 MB file (stat confirmed) — a genuine large VP9/WebM asset, not synthetic/empty/mock. Goldens exist: `fixtures/golden/large_vp9_1080p_120s.webm.frames.json` (3.2k, frame digests) and `.ssim.json` (76k, luma sigs), so the oracle has real reference data to compare against.
- Oracle: `ssim-psnr` at `src/core/oracles.ts:1688`; digest-exact fast path `:1766`, all-exact PASS `:1803`, SSIM-floor fallback `:1823`. The gate performs a real per-frame comparison (sha256 digest equality, then downsampled-luma SSIM against committed sigs); it is not trivially satisfiable. Measurements are physically plausible: 12 paired 1080p frames, SSIM exactly 1.0 for the bit-exact engines, 0.99995 for the wasm decoder.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1330` `decodeFrames` → real `VideoSampleSink` (`:1387`) over WebCodecs `VideoDecoder`, real RGBA copy + sha256 (`imageDataFromVideoSample`/`digestImageData`, `:1398-1400`). No canned output, no copy-input-to-output, no short-circuit to the golden, no error swallowing (errors propagate; the audio-fallback branch only triggers when there is no video track). Genuine implementation.
- Verdict: **REAL** — real large VP9/WebM fixture, genuine WebCodecs decode in the winner, and a meaningful correctness oracle that mediabunny cleared at its strongest tier (bit-exact 12/12).
- Cached note: mediabunny's result has `cached: true` ("cached previous PASS result"), as do ALL five PASS entries (and the run is stamped 2026-06-22). Evidence is reused, not freshly re-run; per the launcher-seeding caveat, decodeFps numbers could be stale. The PASS verdict (bit-exact digests) is robust to caching, but the ~1.09x throughput margin over platform should be treated as soft.

## Confidence & caveats

- Confidence: **medium**. The correctness verdict (mediabunny REAL, bit-exact) is high-confidence; the *winner selection* rests on a modest 1.088x throughput margin measured at **n=1, mad=0** (single sample, no spread) and with `cached: true` for every PASS engine. Four engines tie on maximal correctness, so the ranking is performance-only and the top-2 gap is small enough that a fresh re-run could reorder mediabunny and platform.
- peakMemory and throughputRealtime were not sampled (n=0) for the WebCodecs engines, so the only memory datapoint is ffmpeg.wasm's 3.35 GB; a cross-engine memory comparison is unavailable.
- Both NA_ENGINE results are honest capability declarations, not under-declared decode support.
