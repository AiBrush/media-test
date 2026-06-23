# decode-seek/decode_vp9_alpha

- **Family:** decode-seek
- **Fixture asset(s):** `fixtures/media/vp9_alpha.webm` (749 KB; VP9 in WebM, 640×480, 30 fps, ~5 s, with a per-block alpha side-data plane)
- **Primary metric:** decodeFps
- **passCount:** 2 of 7 (mediabunny, platform)

## Verdict

- **Best framework:** `platform@chrome-149`
- **Contested:** YES — two engines PASS (platform, mediabunny). Both satisfied the same two oracles (`ssim-psnr`, `alpha-plane`).
- **Decisive factor:** CORRECTNESS STRENGTH. platform's `ssim-psnr` is **digest bit-exact** — all 12 paired frames digest-identical (SSIM=1, PSNR=∞, exactFrames 12/12). mediabunny passes the same oracle only as a **perceptual proxy** (SSIM min 0.9967, mean 0.9968, exactFrames **0/12**). Per the ladder, bit-exact > perceptual proxy with exactFrames==0, so platform wins on correctness regardless of speed.
- **Margin over runner-up:** Correctness margin is categorical (12/12 exact vs 0/12 exact). On the primary metric mediabunny is actually FASTER (decodeFps 153.4 vs 86.4 → mediabunny 1.78x faster wall: 195.6 ms vs 347.4 ms), but performance is the tiebreaker only when correctness is comparable, which it is not here.

## Per-engine results

| Engine | Status | Oracles passed | wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | **PASS** | ssim-psnr:✓ (SSIM=1, exact 12/12), alpha-plane:✓ (12/12) | 347.40 ms | n/a (decodeFps 86.36) | 165,766,020 B (~158 MB) | 9925 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:✓ (SSIM min 0.9967, exact 0/12), alpha-plane:✓ (12/12) | 195.56 ms | n/a (decodeFps 153.40) | 0 (not sampled) | 406 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'alpha' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'alpha' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'alpha' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

Notes: peakMemory/timeToFirstFrame are unsampled (n=0) for mediabunny; throughputRealtime is not reported for this scenario (primaryMetric is decodeFps). All benches are n=1 (single sample, mad=0), so performance figures are weak evidence.

## Why the winner wins (deep technical)

This fixture is the hard alpha case: VP9 in WebM where the alpha channel is **not** in the primary VP9 bitstream but carried as a parallel per-block alpha plane (Matroska `BlockAdditions`, the WebM "alpha mode" convention). A naive VP9 decode yields only the color (YUV→RGB) planes; recovering true straight-alpha pixels requires demuxing the side-data, decoding it as a *second* VP9 stream, and merging it back as the A channel. The golden for this asset was **baked by the platform engine itself** (`fixtures/golden/vp9_alpha.webm.frames.json` → `bakedBy: "frame-bake (platform engine) ... Chrome/149.0.0.0"`, baked 2026-06-21), and the digests are the sha256 of the normalized tight/top-left/straight-alpha RGBA buffer produced by `src/engines/platform/digest.ts`.

platform's win is mechanistic: its decode path (`src/engines/platform/decode.ts:117-160`) detects alpha side-data (`hasAlphaSideData`, line 117), decodes the color samples and the alpha samples through **two separate WebCodecs `VideoDecoder` sessions** (`collectDecodedFrames`, lines 128-133), pairs them by presentation timestamp (`alphaByPts`, line 142), and merges the alpha plane straight into the RGBA `A` byte via `mergeAlphaPlane` (line 152 → :226-238, `color.data[i+3] = alpha.data[i]`). Because the golden was produced by exactly this code path + `digestImageData`, platform's frames are byte-identical to the golden: `ssim-psnr` short-circuits on digest equality (`oracles.ts:1766-1771`) and reports `exactCount === pairs` → SSIM=1 / PSNR=∞ (`oracles.ts:1803-1809`). The shard confirms: `pairs:12, exactFrames:12, ssimMean:1, ssimMin:1`. The backend is hardware WebCodecs (`env.configUsed.backend: "webcodecs", hwAccel: true, decode: "VideoDecoder", pixelBackend: "webgpu>webgl>offscreen2d"`), no COOP/COEP required.

mediabunny also genuinely decodes the alpha (it declares the `alpha` capability at `src/engines/mediabunny/adapter.ts:1061`, "VP9 alpha (WebM/MKV) via alpha:'keep'") and its `decodeFrames` (`adapter.ts:1330-1410`) pulls `VideoSample` objects from a `VideoSampleSink` and converts them with `VideoSample.copyTo(format:'RGBA')` for untransformed frames (`adapter.ts:1736-1759`, `pixelBackend: "VideoSample.copyTo(RGBA)>canvas"`). Functionally correct — `alpha-plane` reports `framesWithAlpha 12/12`, identical to platform — but the `copyTo(RGBA)` colorspace conversion path differs at the byte level from the platform raster path that baked the golden, so **none** of mediabunny's frames hit the digest short-circuit (`exactFrames:0`). It instead falls back to the downsampled-luma-signature SSIM branch (`oracles.ts:1773-1786`) against `vp9_alpha.webm.ssim.json`, scoring SSIM min 0.9967 / mean 0.9968 over 12 frames — comfortably above the default floor but, per the ladder, only a *perceptual proxy* with exactFrames==0, which is strictly weaker than platform's bit-exact pass.

So the ranking is decided at step 4(a): same oracle set, but platform's correctness evidence is the strongest tier (bit-exact) while mediabunny's is the weakest passing tier (perceptual proxy, 0 exact). mediabunny's 1.78x faster wall and far lower longtask budget (406 ms vs 9925 ms) and lower memory (platform sampled ~158 MB; mediabunny unsampled) would have made it the winner on the 4(b) performance tiebreaker — but that tiebreaker is never reached because correctness is not comparable.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost): correct alpha decode and both oracles green, but `ssim-psnr` exactFrames **0/12** (SSIM min 0.9967) — perceptual-proxy tier vs platform's bit-exact 12/12. Its `VideoSample.copyTo(RGBA)` path (`adapter.ts:1754`) is byte-divergent from the golden baker, so it cannot hit the digest short-circuit. Faster (153.4 vs 86.4 decodeFps) but speed is the tiebreaker, not the gate.
- **web-demuxer@4.0.0** (NA_ENGINE): "engine does not declare feature 'alpha'." Honest — its feature list (`src/engines/web-demuxer/adapter.ts:656-664`) is `metadata:read/protected-tracks/multitrack/rotation:read/seek:keyframe/decode:golden-rgba/webcodecs:independent` with no `alpha`; it has no WebM BlockAdditions alpha-merge path.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): "engine does not declare feature 'alpha'." Honest — no declared per-track alpha-plane decode/merge capability.
- **ffmpeg.wasm@0.12.15** (NA_ENGINE): "engine does not declare feature 'alpha'." Arguably under-declared (libvpx can decode VP9 alpha), but the adapter's decode contract emits RGBA digests without the WebM alpha-side-data merge, so not declaring `alpha` is defensible rather than a cheat.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "engine does not declare operation 'decodeFrames'." Honest — it is a parser/demuxer, not a pixel decoder.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare operation 'decodeFrames'." Honest — ISOBMFF box parser/demuxer only, no decode pipeline (and the asset is WebM, not MP4).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/decode-seek/index.ts:124-131` — `id:'decode_vp9_alpha'`, `asset:'vp9_alpha.webm'`, container webm, videoCodec vp9, maxFrames 30, notes: "Alpha track decode; alpha plane compared separately via the alpha-plane oracle."
- **Fixture exists:** `fixtures/media/vp9_alpha.webm` present, 749 KB — a real VP9/WebM clip, not synthetic/empty/mock. Golden sidecars present: `frames.json` (12 baked frame digests), `ssim.json` (luma sigs), `packets.json` (17 KB), `meta.json` (640×480, vp9, 30 fps).
- **Oracle implementations:** `ssim-psnr` at `src/core/oracles.ts:1688-1810` performs real digest-equality + downsampled-luma SSIM against committed golden (not trivially satisfiable; FAILs when no frames/no golden). `alpha-plane` at `src/core/oracles.ts:2090-2185` reads decoded pixels via `getPixels`, extracts the alpha plane, and requires at least one non-opaque frame (`framesWithAlpha===0` → FAIL, line 2169); with a golden alpha digest it would compare bit-exact.
- **Winner adapter:** `src/engines/platform/decode.ts:117-160` (real WebCodecs dual-`VideoDecoder` color+alpha decode and `mergeAlphaPlane` at :226-238). Genuine library calls (`VideoDecoder.isConfigSupported`/decode), no canned output, no copy-input-to-output, no short-circuit to the golden file, no error-swallowing-as-success.
- **Verdict:** **WEAK-GATE.** The implementation and fixture are real and the oracle is real, but the gate that decides the contest is self-referential: the golden frame digests were baked *by the winning platform engine* (`frames.json` $bakedBy line), so platform's "bit-exact 12/12" is partly tautological — any engine using a different (still correct) RGBA conversion is structurally barred from the exact-frame tier (mediabunny demonstrates this with a correct decode scoring exactFrames 0/12). The PASS is real and the alpha plane is genuinely recovered, but "bit-exact" overstates platform's correctness advantage. The `alpha-plane` oracle here is also presence-only (`comparedAlphaDigests:0` — no golden alpha digest committed), so it cannot distinguish the two engines.
- **Cached note:** Both PASS results have `cached==true` ("cached previous PASS result"); platform's was started 2026-06-22T14:12 and mediabunny's 2026-06-22T16:51. Numbers were reused, not freshly re-run — mild staleness risk, and per the launcher seeding caveat stale PASS reuse can mask regressions.

## Confidence & caveats

- **Confidence: medium.** The PASS/NA classification and oracle set are unambiguous from the shard, and the winner's code path is verified. Confidence is held below "high" because (1) the decisive oracle is self-referential to the winner (golden baked by platform), making the bit-exact advantage partly an artifact of the baking choice rather than a pure quality gap; (2) both results are cached, not freshly run; (3) all benches are n=1 with mad=0, so the performance picture (where mediabunny clearly leads) is weak evidence.
- If the goal were *fastest correct alpha decode*, mediabunny is the practical pick (1.78x faster wall, 24x lower longtask budget, lower memory) at SSIM 0.9967 — i.e., visually indistinguishable. platform wins strictly under the correctness-first ladder because it owns the golden.
- A stronger, non-tautological gate would commit a per-frame golden **alpha digest** (so `alpha-plane` does real bit-exact alpha comparison, `comparedAlphaDigests>0`) and/or bake the SSIM/frames golden with a decoder-neutral reference, which would let mediabunny compete on correctness rather than being capped at the proxy tier.
