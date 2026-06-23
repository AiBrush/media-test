# transcode/hevc_to_vp8_webm

family: transcode | fixture asset: `hevc_1080p_10s.mp4` (HEVC video + AAC audio in MP4) | primaryMetric: wall | passCount: 1/7

## Verdict

**Best framework: `ffmpeg.wasm@0.12.15`** — UNCONTESTED (the only PASS of 7 engines).

Decisive factor: this scenario targets **VP8 video + Vorbis audio in WebM**. Vorbis has **no WebCodecs `AudioEncoder`** in Chrome 149, so all three browser/WebCodecs engines (platform, remotion-webcodecs, mediabunny) correctly self-report `NA_BROWSER` (`AudioEncoder.isConfigSupported=false`). The three parser/demuxer-only engines (web-demuxer, mp4box, remotion-media-parser) do not declare the `transcode` operation at all (`NA_ENGINE`). Only ffmpeg.wasm bundles a full software codec set (libvpx for VP8, libvorbis for Vorbis, plus a native HEVC decoder), so it is the lone engine that can complete the pipeline. Margin over runner-up: not applicable — no other engine produced any output to compare.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass, playback-smoke:pass | 45961.06 ms | 0.2176 x-rt | 0 (unmeasured) | 474 ms | cached previous PASS result |
| platform@chrome-149 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'vorbis' (AudioEncoder.isConfigSupported=false) |
| remotion-webcodecs@4.0.479 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'vorbis' (AudioEncoder.isConfigSupported=false) |
| mediabunny@1.48.0 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'vorbis' (AudioEncoder.isConfigSupported=false) |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

ffmpeg.wasm also reports `encodeFps` median 6.53 fps; `peakMemory` and `decodeFps` have n==0 (not sampled).

## Why the winner wins (deep technical)

This operation is a **full re-encode across both tracks and a container swap**: HEVC (H.265) video → VP8, AAC audio → Vorbis, MP4 → WebM. Nothing here is a copy/remux; every codec on both ends differs from the source, so the engine must (1) decode HEVC, (2) re-encode VP8, (3) decode AAC, (4) re-encode Vorbis, (5) mux into a Matroska/WebM container. The hard gate is **Vorbis encode**: it is the oldest WebM audio codec and is absent from the WebCodecs encoder surface in all current Chromium builds.

ffmpeg.wasm uses its **single-thread vendored wasm core** (the adapter defaults to single-thread to avoid SharedArrayBuffer/COOP-COEP issues and pthread traps during real encode cells — see `src/engines/ffmpeg-wasm/adapter.ts:10`). The codec map proves real software codecs are wired, not stubs: `vp8 -> 'libvpx'` (`src/engines/ffmpeg-wasm/codecs.ts:29`) and `vorbis -> 'libvorbis'` (`src/engines/ffmpeg-wasm/codecs.ts:39`). The transcode entrypoint at `src/engines/ffmpeg-wasm/adapter.ts:2165` builds a genuine ffmpeg argv: it picks the video encoder via the codec map, resolves the audio encoder via `audioEncoderName('vorbis')` → `'libvorbis'` and pushes `-c:a libvorbis` (`adapter.ts:2468-2472`), then runs the wasm `ffmpeg` program and reads back the binary output (`adapter.ts:2528-2529`). libvpx-VP8 is given a wasm-safe config (chroma-subsampled 8-bit planar pixel format, guarded at `adapter.ts:2391-2394`) precisely because libvpx otherwise traps under wasm — evidence this path was hardened against real failures, not faked.

The result is corroborated by the oracle measurements on the actual produced WebM. `ssim-psnr` re-decoded the output with the platform decoder and compared **12 frame pairs** against the reference, yielding **SSIM min 0.9999254851 and mean 0.9999325445**, far above the `ssimMin` gate of 0.97 (scenario `tolerances.ssimMin: 0.97`, `src/scenarios/transcode/index.ts:533`). The oracle gates on the worst frame (`oracles.ts:1823`), so a 0.9999 minimum is a strong perceptual pass. `playback-smoke` additionally confirmed a real `<video>` element decoded and played frames of the output, proving the WebM is a valid, browser-playable container — not just bytes.

Wall is **45,961 ms** for a 10-second 1080p clip (throughput **0.2176x realtime**, encode **6.53 fps**) — slow, as expected for single-thread wasm software VP8+Vorbis encode of 1080p, but that is the cost of being the only engine able to do the job at all. Because every other engine is NA, there is no performance contest.

## What each other framework did wrong

- **platform@chrome-149** — `NA_BROWSER`, honest. Chrome's WebCodecs has no Vorbis `AudioEncoder`; `isConfigSupported('vorbis')` returns false, so the engine cannot encode the required audio track. Correct self-gate, not an under-declaration.
- **remotion-webcodecs@4.0.479** — `NA_BROWSER`, honest. Same root cause: it rides on WebCodecs `AudioEncoder`, which lacks Vorbis. No way to produce the Vorbis track in-browser.
- **mediabunny@1.48.0** — `NA_BROWSER`, honest. Same WebCodecs Vorbis-encode gap; mediabunny correctly probes encoder support and bails before producing wrong output.
- **web-demuxer@4.0.0** — `NA_ENGINE`, honest. A demuxer; it does not declare the `transcode` operation and has no encoder, so transcode is genuinely out of scope.
- **mp4box@2.3.0** — `NA_ENGINE`, honest. An MP4 box parser/muxer with no codec engine; `transcode` is legitimately undeclared.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`, honest. A parser only; no encode capability, so transcode is correctly not declared.

## Anti-cheat validation

- **Scenario**: `src/scenarios/transcode/index.ts:523-535` (`id: 'hevc_to_vp8_webm'`), asset `hevc_1080p_10s.mp4`, fromVideo hevc / fromAudio aac → toVideo vp8 / toAudio vorbis, container webm, `tolerances.ssimMin: 0.97`.
- **Fixture exists**: `fixtures/media/hevc_1080p_10s.mp4` is present and ~11 MB — a real HEVC-in-MP4 sample, not synthetic/empty/mock.
- **Winner adapter genuine**: `src/engines/ffmpeg-wasm/adapter.ts:2165` (`async transcode`) builds a real ffmpeg argv and invokes the wasm program (`adapter.ts:2528`), reading back encoded bytes (`adapter.ts:2529`). Codec map is real: `codecs.ts:29` (vp8→libvpx), `codecs.ts:39` (vorbis→libvorbis), `codecs.ts:352` (`audioEncoderName`). No canned output, no input→output copy, no short-circuit to golden, no error-swallow-as-success; in fact unsupported codecs throw `NotApplicableError` (e.g. `adapter.ts:2470`).
- **Oracle meaningful**: `ssim-psnr` at `src/core/oracles.ts:1688` re-decodes the candidate output with the platform engine, pairs frames, computes downsampled-luma-signature SSIM, and gates on the worst frame ≥ ssimMin (`oracles.ts:1823`). Measurements are physically plausible for a faithful VP8 re-encode: 12 pairs, SSIM min 0.99993 / mean 0.99993. Note `exactFrames==0` — there is no committed golden pixel set, so PSNR is reported as unavailable and the gate rests on the SSIM proxy; this is a real perceptual comparison against decoded output, not a trivially-satisfiable smoke gate.
- **Cached**: winner result has `cached==true` ("cached previous PASS result"). Staleness risk: the PASS was reused rather than re-run this batch; the SSIM numbers and bench reflect a prior run.
- **Verdict: REAL** — real 11 MB HEVC fixture, genuinely implemented libvpx/libvorbis transcode path, and a meaningful frame-by-frame SSIM oracle returning 0.9999 against decoded output. The only soft spot is the SSIM-proxy nature of the gate (no golden pixels → no true PSNR, exactFrames==0), but SSIM 0.9999 over 12 frames plus a real playback-smoke pass is strong evidence.

## Confidence & caveats

Confidence: **high** for the winner selection (it is the only PASS and the NA reasons are all honest and codec-correct), **medium-high** for the strength of the win. Caveats: (1) the win is uncontested, so there is no comparative performance/correctness ranking; (2) the result is `cached`, so the exact SSIM/wall figures could be stale; (3) the oracle is a perceptual SSIM proxy (exactFrames==0, no true PSNR), making it a strong-but-not-bit-exact gate; (4) peakMemory/decodeFps were not sampled (n==0).
