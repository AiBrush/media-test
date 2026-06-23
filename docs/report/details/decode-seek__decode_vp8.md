# decode-seek/decode_vp8

family: decode-seek · fixture asset: `vp8_720p_10s.webm` (VP8 video in WebM/Matroska, 1280x720) · primaryMetric: `decodeFps` · passCount: 5/7

## Verdict

- **Best framework: `platform@chrome-149`** (Chrome 149 WebCodecs `VideoDecoder`, hardware-accelerated on Apple M1 Max via ANGLE Metal).
- **Contested.** Five engines PASS. Two of them reach the strongest correctness tier (bit-exact digest match, `exactFrames=12/12`, SSIM=1, PSNR=∞): `platform` and `web-demuxer`. The other three PASS only on the loose SSIM proxy (`exactFrames=0`, SSIM ≈ 0.9696–0.99996).
- **Decisive factor: performance, at equal top-tier correctness.** Against the only co-leader on correctness (`web-demuxer`), platform is **1.53x faster decode throughput** (99.87 vs 65.39 fps), **1.53x lower wall** (300.4 ms vs 458.8 ms), and blocks the main thread **~23.6x less** (179 ms vs 4223 ms longtasks).
- **Margin over runner-up (`web-demuxer`):** 99.87/65.39 = **1.53x decodeFps**; 458.8/300.4 = **1.53x wall**; 179/4223 = **0.042x longtasks** (far better). Both n=1, single sample — see caveats.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | decodeFps | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:true (exact 12/12, SSIM=1) | 300.39 | 99.87 | 0 (not measured) | 179 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (exact 12/12, SSIM=1) | 458.80 | 65.39 | 0 (not measured) | 4223 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:true (exact 0/12, SSIM min 0.9693) | 264.34 | 113.49 | 147,187,145 | 2152 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (exact 0/12, SSIM min 0.9693) | 345.72 | 86.78 | 0 (not measured) | 5761 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (exact 0/12, SSIM min 0.99996) | 354.05 | 84.73 | 690,275,081 | 555 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

**Codec/container & backend.** The input is VP8 in a WebM (Matroska/EBML) container. VP8 carries its entire decoder configuration **in-band** in the bitstream — there is no out-of-band `description`/extradata box. The platform adapter exploits this directly: `src/engines/platform/decode.ts:77-83` (`codecUsesDescription`) returns `false` for `vp8`/`vp08`, so it **drops any demuxed CodecPrivate** before configuring the decoder. This avoids the documented Chrome failure mode where a WebM `CodecPrivate` blob fed as `config.description` corrupts the VP8/VP9 config and trips a native `null.trim()` TypeError (decode.ts:66-83, 108-115). The decoder is then configured with just `{codec, codedWidth, codedHeight}` and run as a hardware `VideoDecoder` (`env.configUsed.backend=webcodecs`, `hwAccel=true`, `decode=VideoDecoder`, `pixelBackend=webgpu>webgl>offscreen2d`, `frameTransfer=transferable`), i.e. GPU-backed VP8 decode on the M1 Max with transferable VideoFrames — minimal copy overhead.

**Why the correctness is top-tier and bit-exact.** The gating oracle is `ssim-psnr` (`src/core/oracles.ts:1686-1833`). It pairs each decoded frame with golden by index. When the candidate's normalized-RGBA SHA-256 equals the golden digest (oracles.ts:1766-1771) the pair is scored as digest-identical → SSIM 1 / PSNR ∞; when **every** pair matches it returns the strongest pass (`exactCount === pairs`, oracles.ts:1803-1809). Platform's measurements are exactly that: `pairs=12, exactFrames=12, ssimMean=1, ssimMin=1`. Frames are rasterized via `imageDataFromVideoFrame` and digested via `digestImageData` in presentation (pts-sorted) order (decode.ts:144-162, 222), and `maxFrames` is satisfied with a +16 submit cushion to flush any reorder (decode.ts:194). The golden `fixtures/golden/vp8_720p_10s.webm.frames.json` holds 12 real per-frame sha256 digests at true ptsUs (1280x720, keyframe flags), and was **baked by the platform engine's own `digest.ts` normalization** (`bakedBy: frame-bake (platform engine)`), so platform meets the reference exactly. Notably `web-demuxer` *also* hits 12/12 — it demuxes WebM via its own (ffmpeg-derived) path but decodes through the **same** WebCodecs hardware pipeline + identical RGBA normalization, so it reproduces byte-identical buffers. Independent demuxers converging on the same byte-exact frames is strong corroboration that this is a real decode, not a cache artifact.

**Why platform beats the co-leader on performance.** With correctness tied at the top tier, the decode-fps headline decides. Platform = 99.87 fps / 300.4 ms wall; web-demuxer = 65.39 fps / 458.8 ms wall (1.53x worse on both). The dominant gap is main-thread responsiveness: web-demuxer logs **4223 ms** of longtasks vs platform's **179 ms** — a ~23.6x difference attributable to web-demuxer dragging an ffmpeg/wasm demuxer module through the main thread for WebM parsing, whereas platform uses a lean inline EBML/WebM demuxer (`demux-webm.ts`) feeding a streaming WebCodecs pipeline (`pipeline=streaming`, `queueDepth=2`). The two faster-fps engines (mediabunny 113.49 fps, remotion-webcodecs 86.78 fps) do not displace platform because they are a **weaker correctness tier** (exactFrames=0; their `copyTo(RGBA)` / `offscreencanvas-2d` pixel backends produce slightly different RGBA bytes, landing on the SSIM proxy at min 0.9693 — passing only because this row relaxes the floor to 0.96, per scenario notes). Per the decision ladder, structural/bit-exact correctness outranks raw throughput, so platform's exact-12 result wins over mediabunny's higher fps.

## What each other framework did wrong

- **web-demuxer@4.0.0 (PASS, co-leader, loses on perf):** Equal top-tier correctness (exactFrames=12/12, SSIM=1) but 1.53x slower decode (65.39 vs 99.87 fps), 1.53x higher wall (458.8 vs 300.4 ms), and 23.6x more main-thread blocking (4223 vs 179 ms longtasks) — its ffmpeg-wasm WebM demux is the bottleneck.
- **mediabunny@1.48.0 (PASS, weaker correctness):** Fastest fps (113.49) but only the SSIM **proxy** — `exactFrames=0`, SSIM min 0.9693 (mean 0.9696). Its `VideoSample.copyTo(RGBA)>canvas` pixel path produces non-byte-identical RGBA, so it never reaches digest-exact; passes only against the relaxed 0.96 floor. Bit-exact > throughput per the ladder.
- **remotion-webcodecs@4.0.479 (PASS, weaker correctness):** Same proxy result (exactFrames=0, SSIM min 0.9693) via `offscreencanvas-2d`, and slower than platform (86.78 fps, 345.7 ms) with the worst longtasks of all (5761 ms, streaming-backpressure on main thread).
- **ffmpeg.wasm@0.12.15 (PASS, weaker correctness):** SSIM min 0.99996 — extremely close but still `exactFrames=0` (its software VP8 decode + RGBA conversion differs at the byte level from the browser-baked golden). Also the heaviest memory of any engine (690 MB peak) and slower than platform (84.73 fps, 354 ms).
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA — it is a *parser/demuxer*, not a decoder; it does not declare the `decodeFrames` operation. Correctly under no obligation to decode pixels.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — MP4Box is an MP4/ISOBMFF box parser; it does not declare `decodeFrames` and cannot decode WebM/VP8 pixels. Not an under-declared capability.

## Anti-cheat validation

- **Scenario:** `src/scenarios/decode-seek/index.ts:102-113` — `id: 'decode_vp8'`, `asset: 'vp8_720p_10s.webm'`, `container: 'webm'`, `videoCodec: 'vp8'`, `maxFrames: 30`, `tolerances.ssimMin: 0.96` (notes: VP8 luma signature can differ slightly across correct decoders, hence the same 0.96 floor as other cross-decoder edge codecs).
- **Fixture exists & is real:** `fixtures/media/vp8_720p_10s.webm` present, **1.3 MB** real WebM (not synthetic/empty/mock).
- **Golden is real:** `fixtures/golden/vp8_720p_10s.webm.frames.json` — `pending: false`, 12 entries with real sha256 digests, 1280x720, keyframe flags, true ptsUs; `bakedBy: frame-bake (platform engine)` via `src/engines/platform/digest.ts`.
- **Oracle is real:** `src/core/oracles.ts:1686-1833` (`ssim-psnr`). It compares each decoded frame's normalized-RGBA sha256 to the golden digest (oracles.ts:1766-1771) and, when not exact, downsamples luma and computes signature SSIM gated on the **worst** frame (`minSsim >= t.ssimMin`, oracles.ts:1823). Not trivially satisfiable: three engines land below digest-exact and one (mediabunny/remotion) sits at 0.9693, only marginally above the 0.96 floor.
- **Winner adapter is genuine:** `src/engines/platform/decode.ts:89-163` drives a real `VideoDecoder` (isConfigSupported gate at :119, real `decoder.configure`/`decoder.decode`/`flush` at :190-205), rasterizes real VideoFrames and digests them (:144-162). No canned output, no input→output copy, no short-circuit to the golden, no error swallowing (decode errors propagate, :184-186, 217-220).
- **Caveat on the gate:** the golden frame digests were baked by the **platform engine itself**, so platform's `exactFrames=12` is partly a home-field result. This is mitigated because `web-demuxer` — an independent demuxer — reproduces the identical 12/12 byte-exact frames, confirming the decode is real and the reference is reproducible across engines.
- **Cached:** ALL seven results have `cached: true` ("cached previous PASS result"). Evidence is reused, not freshly re-run; per the launcher seeding caveat, stale PASS reuse is possible. Numbers are plausible for real 720p VP8 hardware decode, but the n=1 timings were not re-measured this run.
- **Verdict: WEAK-GATE.** The fixture, adapter, and oracle are all real (would otherwise be REAL), but (a) the gating tolerance for this row is the relaxed SSIM proxy at 0.96 — a perceptual proxy, not a mandated bit-exact gate — and (b) the strongest signal (digest-exact) compares against a golden the winning engine baked. The platform PASS is genuine and even bit-exact, but the *gate that lets the field through* is loose, so this is a weak gate rather than a strong correctness gate.

## Confidence & caveats

- **Confidence: medium.** Winner selection is clear (top-tier correctness AND best perf vs the co-leader), and the code paths are verified real.
- All benchmark numbers are **single-sample (n=1, mad=0, p95=median)** and **cached** — the 1.53x perf margins are directionally solid but not statistically robust; a re-run could shift them.
- `peakMemory` is 0/not-measured for platform, web-demuxer, and remotion-webcodecs, so the memory tiebreaker is unusable for those (only mediabunny 147 MB and ffmpeg-wasm 690 MB are reported).
- The golden was baked by the platform engine; cross-engine corroboration (web-demuxer 12/12) is what upgrades confidence in the bit-exact claim. Platform also benefits from `coopCoep: not-required` and hardware WebCodecs vs the wasm engines (ffmpeg-wasm single-thread, 690 MB).
