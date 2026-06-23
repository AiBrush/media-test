# transcode/vp9_to_vp8_webm

family: transcode | fixture asset: `vp9_1080p_10s.webm` (9.3 MB, real VP9/Opus WebM) | primaryMetric: wall (median ms) | passCount: 1 / 7

## Verdict

**Best framework: ffmpeg.wasm@0.12.15 — uncontested winner (1 PASS of 7).**

Decisive factor: this scenario re-encodes the audio track Opus→**Vorbis**, and Vorbis is an audio encode codec that Chromium's `WebCodecs AudioEncoder` does not support (`AudioEncoder.isConfigSupported = false`). Every WebCodecs-backed engine (mediabunny, platform, remotion-webcodecs) is therefore honestly gated NA_BROWSER, and three parser-only engines (web-demuxer, mp4box, remotion-media-parser) never declare the `transcode` operation at all (NA_ENGINE). Only ffmpeg.wasm carries a self-contained libvorbis (+ libvpx) encoder inside its wasm core, so it is the sole engine that can perform the full VP9→VP8 / Opus→Vorbis WebM down-generation.

Margin over runner-up: not applicable — there is no second PASS to rank against.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:✓, playback-smoke:✓ | 51519.59 ms | 0.194 x-rt | 0 (not sampled) | 4223 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'vorbis' (AudioEncoder.isConfigSupported=false) |
| platform@chrome-149 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'vorbis' (AudioEncoder.isConfigSupported=false) |
| remotion-webcodecs@4.0.479 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'vorbis' (AudioEncoder.isConfigSupported=false) |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Supplementary ffmpeg.wasm bench: encodeFps median 5.823 fps (n=1); decodeFps/peakMemory not sampled (n=0). All bench metrics n=1 (single timed run, warmup=1, mad=0) → performance evidence is thin but the win is on capability, not speed.

## Why the winner wins (deep technical)

The operation is a **whole-file re-encode within the WebM/Matroska container**: source is VP9 video + Opus audio (`vp9_1080p_10s.webm`, 1080p, ~10 s), target is VP8 video + Vorbis audio in WebM (scenario `src/scenarios/transcode/index.ts:548-560`, `opts: { container:'webm', video:{codec:'vp8'}, audio:{codec:'vorbis'} }`). Both tracks must be fully decoded and re-encoded — VP9→VP8 is a lossy "down-generation" to an older codec, and Opus→Vorbis is a lossy audio transcode.

The browser-native pipeline cannot do this because **WebCodecs exposes no Vorbis encoder**. mediabunny, platform (Chrome's own WebCodecs), and remotion-webcodecs all probe `AudioEncoder.isConfigSupported({codec:'vorbis'...})`, get `false`, and return NA_BROWSER with the identical reason string. This is the correct, honest result: Chromium ships Opus/AAC encode but not Vorbis encode. VP8 video encode would itself be available via WebCodecs `VideoEncoder`, but the audio leg alone is fatal for those engines.

ffmpeg.wasm wins because its vendored 0.12.x core statically links the full FFmpeg encoder set. `src/engines/ffmpeg-wasm/codecs.ts:9-10` documents the build enables `libvpx/libvorbis` (and `:29` maps `vp8 -> 'libvpx'`, `:39` maps `vorbis -> 'libvorbis'`). So the adapter has real, in-wasm encoders for both target codecs and does not depend on any browser codec. The transcode entrypoint `src/engines/ffmpeg-wasm/adapter.ts:2165` (`transcode()`) runs: it is NOT short-circuited by `isSuiteBudgetTranscodeNa` — that budget guard (`adapter.ts:875-882`) only NAs the VP8/Vorbis path for the much larger `h264_1080p_30s.mp4` source, not for this 10 s clip — and it is NOT blocked by the Opus-encode guard at `adapter.ts:2194-2199` because here Opus is the *input* codec being replaced by Vorbis, not the output. It demuxes the WebM, decodes VP9+Opus, and re-encodes via libvpx (VP8) + libvorbis, muxing back to WebM.

Correctness was confirmed by the `ssim-psnr` oracle (`src/core/oracles.ts:1688`). Because no raw-pixel golden ships, the oracle ran in **golden mode B** (`oracles.ts:1748-1790`): it paired the platform-re-decoded VP8 output frames against the committed per-frame downsampled-luma signatures in `fixtures/golden/vp9_1080p_10s.webm.ssim.json` (76 KB of real signatures). Measured result from the shard: `pairs: 12`, `ssimMean: 0.99994`, `ssimMin: 0.99993`, `exactFrames: 0`. SSIM min 0.9999 clears the scenario floor `ssimMin: 0.97` (`index.ts:558`) with enormous headroom — the VP8 re-encode is visually near-identical to the VP9 source. The secondary `playback-smoke` oracle confirmed the output WebM actually plays in a `<video>` element (decodable, valid container). `exactFrames==0` is expected and correct here: a lossy VP9→VP8 re-encode will never be bit-exact, so digest equality is impossible and the structural-SSIM gate is the right instrument.

Performance is secondary (no competitor to compare against). The single-thread wasm encode took wall median 51.5 s (0.194x realtime, encodeFps 5.82) with 4223 ms of long-tasks — slow, as expected for a 1080p two-codec wasm re-encode, but the suite budget allowed it for this 10 s clip.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_BROWSER, honest. Its WebCodecs-based encoder probed `AudioEncoder.isConfigSupported` for Vorbis and got `false`. No browser Vorbis encoder exists; the NA is genuine, not an under-declared capability.
- **platform@chrome-149** — NA_BROWSER, honest. Same root cause: Chrome's native WebCodecs `AudioEncoder` has no Vorbis path. Could have done the VP8 video leg, but the Vorbis audio target is unencodable in-browser.
- **remotion-webcodecs@4.0.479** — NA_BROWSER, honest. Identical WebCodecs Vorbis-encode limitation; same reason string.
- **web-demuxer@4.0.0** — NA_ENGINE, honest. It is a demuxer only and does not declare the `transcode` operation; it has no encode path of any kind.
- **mp4box@2.3.0** — NA_ENGINE, honest. MP4/ISO-BMFF box parser+muxer; declares no `transcode` op and could not target WebM/Matroska anyway.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest. Parser/metadata library; no encode/transcode capability declared.

All six non-winner statuses are legitimate capability gaps, not failed attempts — there are zero FAILs in this scenario.

## Anti-cheat validation

- **Scenario**: `src/scenarios/transcode/index.ts:548-560` (id `vp9_to_vp8_webm`). Notes: "VP9→VP8 down-generation within WebM; Opus→Vorbis." Real operation, real gating rationale.
- **Fixture**: asset `vp9_1080p_10s.webm` — exists at `fixtures/media/vp9_1080p_10s.webm`, 9.3 MB real VP9/Opus WebM (not synthetic/empty/mock).
- **Winner adapter**: `src/engines/ffmpeg-wasm/adapter.ts:2165` (`transcode()`), encoder selection in `src/engines/ffmpeg-wasm/codecs.ts:29` (vp8→libvpx) and `:39` (vorbis→libvorbis). Genuinely calls the vendored ffmpeg wasm with real libvpx/libvorbis encoders; not a copy-through, not a golden short-circuit, not a swallowed error. The budget-NA guard (`adapter.ts:875-882`) does NOT apply to this fixture, so the encode truly ran.
- **Oracle**: `ssim-psnr` at `src/core/oracles.ts:1688` (golden-signature mode B, `:1748-1790`), gating on worst-frame SSIM ≥ 0.97 (`:1823`). It performs a real per-frame SSIM comparison of the re-decoded VP8 output against committed golden luma signatures (`fixtures/golden/vp9_1080p_10s.webm.ssim.json`, 76 KB). Measurements (pairs=12, ssimMin 0.99993) are physically plausible for a high-quality lossy re-encode. `playback-smoke` adds a real decodability check. The gate is not trivially satisfiable: a garbled/empty/wrong-content output would score far below 0.97.
- **Cached**: ffmpeg.wasm result has `cached: true` ("cached previous PASS result"). The PASS evidence (oracles, SSIM numbers) is reused, not freshly re-run — minor staleness risk, but the fixture, golden, and adapter code paths are all present and consistent, so the cached PASS is credible.

**validationVerdict: REAL** — real fixture, real in-wasm libvpx/libvorbis encode, real golden-signature SSIM gate with plausible high-confidence measurements.

## Confidence & caveats

Confidence: **high** on the winner selection (only 1 of 7 can do Vorbis encode in-browser; the gating logic is sound and the NAs are all honest). Caveats: (1) the PASS is `cached`, so the timing/oracle numbers were not re-measured this run; (2) all bench metrics are n=1 (mad=0, single sample) — performance figures are indicative only, though performance is irrelevant since the win is uncontested on capability; (3) peakMemory/decodeFps were not sampled (n=0).
