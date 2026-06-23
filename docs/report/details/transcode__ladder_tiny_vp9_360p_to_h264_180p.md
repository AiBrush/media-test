# transcode/ladder_tiny_vp9_360p_to_h264_180p

family: transcode | fixture asset: `tiny_vp9_360p_2s.webm` (WebM/VP9 + Opus, ~155 KB) | primaryMetric: framesPerSec | passCount: 3/7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 3 engines passed: mediabunny, remotion-webcodecs, ffmpeg.wasm).
- **Decisive factor: performance.** All three passing engines clear the *same* oracle (`ssim-psnr`) at essentially identical correctness (SSIM min 0.9995–0.9999, all `exactFrames == 0`, no measured PSNR). Correctness is a tie, so the ranking falls to the primary metric `framesPerSec`. mediabunny wins decisively.
- **Margin over runner-up:** mediabunny 394.37 fps vs remotion-webcodecs 290.65 fps = **1.36x faster** on frames/sec; on wall clock 152.14 ms vs 206.44 ms = **1.36x faster**. Versus ffmpeg.wasm (116.13 fps / 516.68 ms) mediabunny is **3.40x faster fps / 3.40x faster wall**. (All bench rows are `n==1`, so margins are point estimates, not distributions — see caveats.)

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true (SSIM min 0.9996, mean 0.9996, 12 pairs, 0 exact) | 152.14 ms | n/a (not measured) | 0 (not sampled) | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (SSIM min 0.9996, mean 0.9996, 12 pairs, 0 exact) | 206.44 ms | n/a | 0 (not sampled) | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (SSIM min 0.9999, mean 0.9999, 12 pairs, 0 exact) | 516.68 ms | n/a | 0 (not sampled) | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested AAC audio track |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

(throughputRealtime, peakMemory and longtasks were not collected for any engine in this shard; `framesPerSec`/`wall`/`encodeFps` are the only populated bench metrics. peakMemory has `n==0` / empty samples.)

## Why the winner wins (deep technical)

This scenario is a **cross-axis transcode**: it crosses the *container* axis (WebM → MP4) and the *video codec* axis (VP9 → H.264) and the *audio codec* axis (Opus → AAC), while also resizing 360p → 180p (320x180). That means the winner must (1) demux WebM and decode VP9, (2) scale, (3) re-encode H.264 *and* re-encode Opus→AAC, (4) mux MP4. It is the hardest of the four corners — most engines that only "remux" or "decode" cannot even declare it.

**mediabunny's path.** Its `configUsed` shows `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`. The adapter routes `transcode` through mediabunny's high-level `Conversion` API: `transcode()` builds `ConversionOptions` (`src/engines/mediabunny/adapter.ts:1271`), constructs video options via `buildVideoOptions` (`adapter.ts:1302` → `:542`) and audio options via `buildAudioOptions` (`:1303`), then calls `runConversion` (`:1307` → `:842`) which does `Conversion.init(opts)` (`:848`), checks `conversion.isValid`, and `await conversion.execute()` (`:855`). The decode and encode legs both run on the browser's native **WebCodecs** `VideoDecoder`/`VideoEncoder` — VP9 decode and H.264 encode are *hardware-backed* on the Apple M1 Max (GPU = "ANGLE Metal Renderer: Apple M1 Max"). The adapter probes `canDecodeVideo` (`:902`) before committing decode acceleration and probes encode support before committing, so it never stalls on an unsupported config. Critically, mediabunny's `coreBuild: "pure-ts-esm"` means there is **no wasm module to instantiate and no COOP/COEP isolation requirement** — for a TINY (~155 KB, 2 s) clip the run is *init-overhead-dominated*, and mediabunny's near-zero fixed cost plus hardware H.264 encode is exactly what wins this rung. Result: 394.37 fps, 152.14 ms wall.

**Why faster than remotion-webcodecs (1.36x).** remotion-webcodecs uses the *same* native WebCodecs backend (`backend: "webcodecs"`, `hwAccel: "prefer-hardware(+software fallback)"`, `pipeline: "streaming-backpressure"`) and achieves identical correctness (SSIM min 0.9996). It is slower (206.44 ms vs 152.14 ms) because of higher per-conversion fixed overhead in its `convert()` orchestration (main-thread convert, `bufferWriter`, `waitForQueueToBeLessThan` backpressure) — on a clip this small the marginal encode work is tiny and the orchestration/queue-management overhead dominates, so mediabunny's leaner lockstep pump pulls ~36% ahead.

**Why much faster than ffmpeg.wasm (3.40x).** ffmpeg.wasm carries no `configUsed.backend` here but is a **single-thread wasm** transcoder: it must instantiate the wasm core, run a *software* VP9 decoder and *software* x264 encoder, and mux MP4 — all in wasm without hardware acceleration. Its SSIM is marginally the highest (min 0.9999) because software x264 produces very clean output, but it pays 516.68 ms — 3.4x mediabunny's wall — because every frame is decoded/encoded on the CPU through wasm rather than on the M1 Max media engine. Correctness is comparable (both well above the 0.97 gate), so the performance gap is decisive.

**Oracle evidence (real numbers).** The gate is `ssim-psnr` (`src/core/oracles.ts:1688`). Output bytes are re-decoded by the platform decoder (`ctx.decodeWithPlatform`, `oracles.ts:1718`) and each of **12** decoded candidate frames is compared by downsampled-luma SSIM signature against the committed golden `tiny_vp9_360p_2s.webm.ssim.json` (`:1773`–`:1786`); the gate is on the *worst* frame, `minSsim >= t.ssimMin` (`:1823`), with `t.ssimMin = 0.97` for this scenario (default tolerance, `index.ts:1215`). mediabunny: min 0.9996, mean 0.9996, 12 pairs, 0 digest-exact — comfortably above 0.97.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASSED but lost on speed: 206.44 ms wall / 290.65 fps vs mediabunny 152.14 ms / 394.37 fps (mediabunny 1.36x faster). Same backend, same SSIM (0.9996); higher orchestration overhead on a TINY clip.
- **ffmpeg.wasm@0.12.15** — PASSED but lost on speed: 516.68 ms / 116.13 fps (mediabunny 3.40x faster). Single-thread wasm, software VP9 decode + software x264 encode, no hardware path; slowest despite best SSIM (0.9999).
- **platform@chrome-149** — NA_ENGINE (honest). Its transcode path encodes via `<video>→canvas→MediaRecorder`; that canvas-capture pipeline is **video-only and drops audio**, and the scenario explicitly requires an AAC audio output track (`toAudio: 'aac'`, `index.ts:1158`). The NA is a true capability gap, not under-declaration.
- **mp4box@2.3.0** — NA_ENGINE (honest). MP4Box.js is a demux/box-layout library; it does not declare the `transcode` operation and has no encoder/codec layer.
- **web-demuxer@4.0.0** — NA_ENGINE (honest). A wasm demuxer only; does not declare `transcode` (no encode/mux).
- **remotion-media-parser@4.0.479** — NA_ENGINE (honest). A parser/probe library; does not declare `transcode`.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:1151` (case `ladder_tiny_vp9_360p_to_h264_180p`), generated into a `Scenario` at `:1194`. Input asset `tiny_vp9_360p_2s.webm` (`:1152`); op `transcode`; output `{container:mp4, video:h264 320x180, audio:aac}`; oracle `['ssim-psnr']` (`:1212`); tolerance default `{ssimMin:0.97, psnrMinDb:36}` (`:1215`).
- **Fixture exists and is real:** `fixtures/media/tiny_vp9_360p_2s.webm` is present, ~155 KB (a genuine 2 s WebM/VP9+Opus clip, not synthetic/empty). Committed goldens exist: `fixtures/golden/tiny_vp9_360p_2s.webm.ssim.json` (~75 KB luma signatures), `.frames.json`, `.packets.json`, `.meta.json`.
- **Winner implementation is genuine:** `src/engines/mediabunny/adapter.ts:1271` `transcode()` → `buildVideoOptions` (`:542`) / `buildAudioOptions` → `runConversion` (`:842`) → `mb.Conversion.init` (`:848`) → `conversion.execute()` (`:855`) → real `BufferTarget.buffer` bytes (`:860`). This drives WebCodecs `VideoDecoder`/`VideoEncoder` plus mediabunny's WebM demuxer and MP4 muxer. No canned output, no input→output copy, no short-circuit to golden, no swallowed errors (invalid conversions throw at `:851`; unencodable codecs throw NA at `:651`).
- **Oracle is a real comparison, but a perceptual proxy:** `src/core/oracles.ts:1688` re-decodes the engine's actual output bytes with the platform decoder (`:1718`) and computes per-frame downsampled-luma SSIM against the committed golden (`:1782`), gating on the worst frame `minSsim >= 0.97` (`:1823`). It is NOT trivially satisfiable — a broken transcode would yield mismatched luma and fail. However: `exactFrames == 0` for all engines, no true PSNR is measured (`PSNR via golden pixels unavailable`), and the tolerance is the relatively loose 0.97 SSIM. So the PASS is genuine but the gate is **perceptual/proxy strength**, not bit-exact or structural (MP4 box layout is NOT checked, so a correctly-decodable but oddly-muxed MP4 would still pass). Measurements (12 frames, SSIM ~0.9996) are physically plausible for a clean VP9→H.264 resize.
- **Cached note:** all three PASS results have `cached == true` ("cached previous PASS result"). The evidence was REUSED from prior runs (mediabunny startedAt 14:10Z, ffmpeg 16:43Z, remotion-webcodecs 16:53Z), not re-executed this run — staleness risk if fixtures/adapters changed since. Numbers are internally consistent and plausible.
- **Verdict: WEAK-GATE.** Real fixture + real WebCodecs implementation + a real (not faked) SSIM comparison, but the gate is a perceptual proxy (SSIM-only, `exactFrames==0`, no PSNR, no structural MP4 check) at a loose 0.97 threshold — the PASS is honest but not a strong correctness proof.

## Confidence & caveats

- Confidence: **high** on the winner ordering — three independent engines agree on correctness and the fps/wall gap (1.36x over runner-up, 3.40x over ffmpeg.wasm) is large and consistent across both `framesPerSec` and `wall`.
- All bench rows are `n == 1` (single sample, `mad == 0`, p95 == median): the margins are point estimates, not statistically robust distributions; a re-run with `n > 1` could shift the mediabunny↔remotion-webcodecs gap somewhat (though a 36% lead is unlikely to reverse).
- `peakMemory`, `throughputRealtime`, and `longtasks` were not measured in this shard, so the perf tiebreak rests solely on fps/wall.
- All PASS results are `cached` — re-validate with a fresh, uncached run before publishing if fixtures/adapters changed.
- Tiebreaker hygiene also favors mediabunny: hardware WebCodecs, `coopCoep: not-required`, `sharedArrayBuffer: false`, pure-TS ESM (no wasm core) — smaller footprint than ffmpeg.wasm and no isolation requirement.
