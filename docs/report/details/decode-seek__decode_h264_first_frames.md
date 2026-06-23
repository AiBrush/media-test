# decode-seek/decode_h264_first_frames

family: decode-seek | fixture asset: `h264_1080p_30s.mp4` (real, 31 MB, H.264 in MP4) | primaryMetric: `decodeFps` (frames/s, higher-better) | passCount: 5 / 7

## Verdict

- Best framework: **platform@chrome-149** (Chrome WebCodecs `VideoDecoder`).
- CONTESTED: 5 engines PASS the `ssim-psnr` gate; 4 of them (platform, mediabunny, web-demuxer, remotion-webcodecs) are bit-exact (`exactFrames==12`); ffmpeg.wasm passes via the SSIM-only proxy (`exactFrames==0`).
- Decisive factor: among the bit-exact group, platform has the **highest `decodeFps` (45.57 fps)** and by far the **lowest `longtasks` (330 ms)**. It also posts the lowest wall (1316.6 ms).
- Margin over runner-up: vs mediabunny (44.91 fps, the closest bit-exact rival) platform is **1.015x decodeFps** and **1.015x wall** — a near-tie on throughput — but **7.51x fewer long-task ms** (330 ms vs 2477 ms), the real separation. vs remotion-webcodecs platform is **2.88x faster decodeFps** (45.57 vs 15.84) and **10.3x fewer long-task ms**.

## Per-engine results

| engine | status | oracles passed (name:pass) | decodeFps (median) | wall median (ms) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:pass (exact 12/12) | 45.572 | 1316.59 | 1,610,365,212 B | 330 | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (exact 12/12) | 44.907 | 1336.10 | n/a (0) | 2477 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (exact 12/12) | 34.708 | 1728.72 | n/a (0) | 2477 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (proxy, exact 0/12, ssimMin 0.99995) | 37.188 | 1613.44 | 3,012,591,623 B | 4531 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (exact 12/12) | 15.839 | 3788.07 | n/a (0) | 3391 | cached previous PASS |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

Note: peakMemory is only reported by platform (1.61 GB) and ffmpeg.wasm (3.01 GB); the three WebCodecs-via-library engines report 0 samples for peakMemory (`n==0`), so memory is not comparable across the whole field. All bench rows are `n==1` (single sample, `mad==0`), so spread cannot be assessed — the throughput ranking is therefore lower-confidence evidence (see caveats).

## Why the winner wins (deep technical)

The operation is a linear decode of the first frames of an H.264 (avc1) elementary stream carried in an MP4/ISOBMFF container, with the candidate's per-frame normalized-RGBA SHA-256 digests compared against committed golden digests in PTS order (`fixtures/golden/h264_1080p_30s.mp4.frames.json`, with `…ssim.json` luma signatures as the SSIM fallback). The oracle (`src/core/oracles.ts:1760-1809`) walks paired frames, and when a candidate frame's `sha256` equals the golden frame's `sha256` it counts an exact frame and assigns SSIM=1 / PSNR=∞; when all `pairs` are exact it returns the `"all N paired frames digest-identical (SSIM=1, PSNR=∞)"` pass with `psnrDb=∞`. Platform's result shows exactly that: `pairs:12, exactFrames:12, ssimMean:1, ssimMin:1` — the strongest correctness rung available for this scenario (bit-exact digest equality, not the perceptual proxy).

Mechanistically, platform decodes through Chrome's native `VideoDecoder`. The adapter's `decodeFrames` (`src/engines/platform/adapter.ts:422`) routes to `decodeWithWebCodecs` (adapter.ts:439), implemented in `src/engines/platform/decode.ts:89-163`. That path: (1) inline-demuxes the MP4 to avc1 samples with the out-of-band avcC `description` preserved because H.264 carries its SPS/PPS config out-of-band (`codecUsesDescription` returns true for avc1 — decode.ts:77-83, and the description is attached at decode.ts:112-115); (2) probes `VideoDecoder.isConfigSupported` (decode.ts:119) and configures a hardware-preferred decoder; (3) feeds `EncodedVideoChunk`s in decode order with a `maxFrames+16` submit cap to flush B-frame reorder (decode.ts:194-205), then sorts collected `VideoFrame`s by `ptsUs` to emit in presentation order (decode.ts:222). The `configUsed` confirms this is real hardware-backed WebCodecs: `backend:"webcodecs", hwAccel:true, decode:"VideoDecoder", frameTransfer:"transferable", queueDepth:2`, running on the Apple M1 Max ANGLE/Metal GPU recorded in `env.gpu`. Because the M1 Max H.264 hardware decoder produces the same YUV that the golden bake produced, the rasterized RGBA digests match exactly — hence 12/12 exact.

The decisive performance gap is `longtasks`: platform spends only **330 ms** on long tasks versus 2477 ms for mediabunny/web-demuxer, 3391 ms for remotion-webcodecs, and 4531 ms for ffmpeg.wasm. Platform's pipeline is `streaming` with `queueDepth:2` and `frameTransfer:"transferable"` (configUsed), so decoded frames are moved off the main thread cheaply and the decode loop yields frequently; the library wrappers (even when they also use WebCodecs under the hood) interpose extra JS-side framing/copy work that shows up as ~7.5x more main-thread blocking. On raw throughput platform (45.57 fps) edges mediabunny (44.91 fps) by only 1.015x — statistically a tie at `n==1` — so if the two were judged on decodeFps alone the call would be a near-coin-flip; the long-task margin (7.51x) and the marginally lower wall (1316.6 vs 1336.1 ms) are what break the tie in platform's favor, plus the tiebreaker that platform is the bare-platform WebCodecs path (no library bundle, `coopCoep:"not-required"`).

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, bit-exact (12/12), and the only genuine challenger. Lost on the throughput tiebreak: 44.91 fps vs 45.57 (0.985x) and 2477 ms long tasks vs platform's 330 ms (7.51x worse main-thread blocking). It uses the same `webcodecs`/`prefer-hardware` backend (configUsed) but its `streaming-lockstep` + `VideoSample.copyTo(RGBA)>canvas` pixel path adds main-thread copy work platform avoids.
- **web-demuxer@4.0.0** — PASS, bit-exact (12/12), but slower: 34.71 fps (0.76x of platform) and wall 1728.7 ms (1.31x). Same 2477 ms long-task burden as mediabunny. Correct but not competitive on throughput.
- **ffmpeg.wasm@0.12.15** — PASS but on the **weaker proxy rung**: `exactFrames:0/12`, passing only via SSIM (`ssimMin 0.99995 ≥ 0.99`, detail "PSNR via golden pixels unavailable (digest proxy)"). Its wasm decoder produces a slightly different RGB conversion than the golden, so no digest matches — physically plausible for a software decoder, but it is one ladder rung below the bit-exact engines. Also the worst on cost: 4531 ms long tasks (13.7x platform) and 3.01 GB peakMemory (1.87x platform's 1.61 GB), reflecting single-thread wasm with its own framebuffers.
- **remotion-webcodecs@4.0.479** — PASS, bit-exact (12/12), but dramatically slowest: 15.84 fps (0.35x of platform, i.e. platform is 2.88x faster) and wall 3788.1 ms (2.88x). configUsed shows `prefer-hardware(+software fallback)` with an `offscreencanvas-2d` pixel path and `streaming-backpressure`; the heavy per-frame canvas readback dominates. Correct but a clear performance loser.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest NA — MP4Box.js is a demuxer/parser only; it has no decoder, so it cannot produce decoded frames. Not an under-declared capability.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest NA — the media-parser package parses containers/metadata and does not decode pixels (decoding is remotion-webcodecs' job). Correct declaration.

## Anti-cheat validation

- Scenario definition: `src/scenarios/decode-seek/index.ts:58-66` — `id:'decode_h264_first_frames'`, `asset:'h264_1080p_30s.mp4'`, `container:'mp4'`, `videoCodec:'h264'`, `maxFrames:60`, notes: "Linear decode of the first frames; digests must match golden in pts order." Oracle wired at index.ts:279 (`DECODE_ORACLES = ['ssim-psnr']`), `primaryMetric:'decodeFps'` (index.ts:305).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists — 31 MB real H.264/MP4 (verified via stat). Goldens exist: `…frames.json` (3.2k digests), `…ssim.json` (76k luma sigs), `…packets.json` (264k), `…meta.json`. Not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:1688` (`ssimPsnr`). It performs a REAL comparison: per-frame SHA-256 digest equality against committed golden digests (oracles.ts:1766-1771) with a downsampled-luma SSIM fallback (oracles.ts:1782-1786), gated on the worst-frame SSIM (oracles.ts:1823). The bit-exact branch (oracles.ts:1803-1809) requires ALL pairs to be digest-identical to claim PSNR=∞ — not trivially satisfiable. Default `ssimMin` floor for this case is the strict 0.99 (no looser per-case tolerance is set in index.ts:58-66), and the winning engines clear it at the maximum (ssimMin=1.0). Measurements are physically plausible: 12 paired frames, SSIM 1.0 / 0.99995, real fps in the 16–46 range, multi-GB peak memory for the wasm/native paths.
- Winner adapter: `src/engines/platform/decode.ts:89-163` (`decodeWithWebCodecs`) via `adapter.ts:422,439`. Genuinely calls Chrome `VideoDecoder`/`EncodedVideoChunk` (decode.ts:90,175,198,203), rasterizes each real `VideoFrame` to ImageData and digests it (decode.ts:148-155). No canned output, no copy-input-as-output, no short-circuit to golden, no error-swallow-then-report-success (decode errors with zero frames are rethrown, decode.ts:217-220).
- Cached note: platform's result (and all five PASS rows) have `cached:true` ("cached previous PASS result"). The numbers are reused, not freshly re-run this session; per the launcher seeding caveat, throughput/long-task figures could be stale. The PASS itself is structurally sound (real fixture + real WebCodecs path + strict bit-exact oracle), but the performance ranking carries staleness risk.
- Verdict: **REAL** — real 31 MB H.264/MP4 fixture, real hardware WebCodecs decode implementation, and a strict bit-exact-or-strong-SSIM oracle that cannot be trivially passed.

## Confidence & caveats

- Confidence: **medium**. The correctness verdict is strong (strict bit-exact oracle, real fixture, real decoder). The performance ranking that selects platform over mediabunny is weaker: all bench rows are `n==1` with `mad==0` (single sample, no spread), so the 1.015x decodeFps edge is within noise — the win rests primarily on the 7.51x long-task margin, which is large enough to survive single-sample noise.
- All five PASS rows are `cached:true`; figures were not re-measured this run (launcher seeding/staleness caveat applies).
- peakMemory is not comparable field-wide (only platform and ffmpeg.wasm report it; the three library-WebCodecs engines report `n==0`).
- ffmpeg.wasm's PASS is one correctness rung lower (proxy SSIM, exactFrames=0) and would not have been a contender for the win even if it were faster.
