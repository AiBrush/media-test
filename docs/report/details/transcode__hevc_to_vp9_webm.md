# transcode/hevc_to_vp9_webm

family: transcode | fixture asset: `hevc_1080p_10s.mp4` (HEVC video + AAC audio in MP4, ~11 MB) | primaryMetric: wall (ms, lower better) | passCount: 2 of 7

## Verdict

- **Best framework: mediabunny@1.48.0** — **CONTESTED** (2 PASS: mediabunny, remotion-webcodecs).
- **Decisive factor: performance.** Correctness is a tie — both engines passed the *same* two oracles (`ssim-psnr`, `playback-smoke`) with effectively identical perceptual scores (SSIM min ≈ 1.0000, both with `exactFrames=0` over 12 pairs), so the gating oracle cannot separate them. mediabunny wins on every speed metric.
- **Margin over runner-up (remotion-webcodecs):** wall **1559.74 ms vs 1898.16 ms → 1.22× faster**; throughputRealtime **6.41× vs 5.27× → 1.22× higher**; encodeFps **192.34 vs 158.05 → 1.22× higher**; longtasks (main-thread blocking) **4924 ms vs 19963 ms → 4.05× less blocking** (the most lopsided margin). All metrics are `n=1` (single timed sample, `mad=0`), so the speed ranking is suggestive rather than statistically robust — but mediabunny leads on all five axes, so the direction is unambiguous.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:✓ playback-smoke:✓ | 1559.74 ms | 6.41× | 0 (not sampled) | 4924 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:✓ playback-smoke:✓ | 1898.16 ms | 5.27× | 0 (not sampled) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | libopus encode in vendored wasm core traps/exceeds timeout; Opus encode not declared as reliable transcode path |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only, drops audio; cannot produce requested audio track |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

`peakMemory` and `decodeFps` were not sampled (`n=0`, empty `samples`) for either PASS engine, so they cannot be used as tiebreakers here.

## Why the winner wins (deep technical)

This scenario is a **full cross-codec re-encode**, not a remux: source HEVC(H.265)-in-MP4 with AAC audio → target VP9-in-WebM with Opus audio (`fromVideo:'hevc' toVideo:'vp9'`, `fromAudio:'aac' toAudio:'opus'`, `toContainer:'webm'`; scenario `src/scenarios/transcode/index.ts:498-509`). Because WebM cannot carry AAC, the audio leg is *forced* to AAC→Opus re-encode, and the video leg is a HEVC decode → VP9 encode. So a winning engine must do four hard things in-browser: (1) decode HEVC (HW-gated on this M1 Max via ANGLE Metal), (2) re-encode VP9 (software encoder in Chrome), (3) re-encode Opus audio, (4) mux a valid WebM.

**mediabunny's path.** Its config (`env.configUsed`) is `backend:webcodecs`, `hwAccel:prefer-hardware`, `wasmThreads:0`, `pipeline:streaming-lockstep`, `coreBuild:pure-ts-esm`, `coopCoep:not-required`, `sharedArrayBuffer:false`. The adapter drives mediabunny's high-level **Conversion API** (`Conversion.init`/`execute`), building `ConversionVideoOptions`/`ConversionAudioOptions` from the scenario opts (`src/engines/mediabunny/adapter.ts:546`, `:676`) and running it to completion through `runConversion` (`src/engines/mediabunny/adapter.ts:842-868`), which validates `conversion.isValid` (rejecting if all output tracks were discarded) before pulling bytes from a `BufferTarget`. Crucially the adapter pre-flights `VideoEncoder.isConfigSupported` for the codec before committing (`src/engines/mediabunny/adapter.ts:531-539`, `:651-653`), so VP9 — which it explicitly treats as a software-preferred encode (`SOFTWARE_PREFERRED_ENCODE = {'vp9','vp8'}`, `src/engines/mediabunny/adapter.ts:499`) — is only attempted when the browser can actually do it, avoiding a mid-conversion ERROR. The decode side negotiates the best HW-accel mode via `mb.canDecodeVideo` probing (`adapter.ts:888-910`), so HEVC decode rides the M1 Max hardware decoder.

The measured result: `ssim-psnr` reports **SSIM min 0.9999972643520892 ≥ 0.97 (mean 0.9999986939279834)** over **12 frame pairs**, `exactFrames:0`. The VP9 re-encode is visually lossless against the in-browser HEVC reference decode but not bit-identical (expected — VP9 is a different lossy codec, so no frame is digest-exact). `playback-smoke` confirms the muxed WebM actually plays. mediabunny finishes in **1559.74 ms** at **6.41× realtime** / **192.34 encodeFps**, and — the standout — only **4924 ms** of cumulative long-task time.

**Why mediabunny beats remotion-webcodecs (same correctness).** remotion-webcodecs ran the conceptually identical job through `@remotion/webcodecs` `convertMedia` (`src/engines/remotion-webcodecs/adapter.ts:521`, driver at `:579`/`:615`), config `backend:webcodecs`, `hwAccel:prefer-hardware(+software fallback)`, `pixelBackend:offscreencanvas-2d`, `pipeline:streaming-backpressure`. Its `ssim-psnr` is fractionally higher (SSIM min 0.9999999336167055) but both are pinned at the SSIM ceiling and both have `exactFrames:0`, so per the correctness ladder this is "comparable" and not decisive. The gap is execution efficiency: mediabunny's `streaming-lockstep` pipeline and pure-TS-ESM core produce **4.05× less main-thread blocking** (4924 ms vs 19963 ms long-tasks) and a **1.22× faster wall** at the *same* perceptual quality. The most likely mechanistic cause of the long-task disparity is the pixel/transfer path: remotion-webcodecs routes frames through an `offscreencanvas-2d` pixel backend, whereas mediabunny uses `VideoSample.copyTo(RGBA)>canvas` with a 4-deep canvas pool (`canvasPoolSize:4`) keeping VRAM/allocation constant, which keeps individual tasks short. Neither requires COOP/COEP (`coopCoep:not-required`) and neither used wasm threads, so the tiebreaker rules (a) correctness-tie → (b) performance cleanly decide for mediabunny.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, lost on speed):** correct output (SSIM min 0.99999993, 12 pairs, `playback-smoke` ✓) but slower on every metric — 1898.16 ms wall (0.82× of winner = 1.22× slower), 5.27× realtime, 158.05 encodeFps, and 19963 ms long-tasks (4.05× more main-thread blocking than mediabunny). Lost the contest purely on performance, correctness being a tie.
- **ffmpeg.wasm@0.12.15 (NA_ENGINE):** honest capability NA — its vendored wasm libopus encoder traps or exceeds the suite timeout, so the engine does not declare a reliable Opus-encode transcode path. WebM's forced AAC→Opus audio leg is exactly what it cannot do. Not an under-declared capability; the reason is specific to the Opus encoder.
- **platform@chrome-149 (NA_ENGINE):** honest NA — its only transcode encode path is `<video>→canvas→MediaRecorder`, which is video-only and silently drops the audio track. It cannot emit the required Opus audio track, so producing a complete VP9+Opus WebM is genuinely out of reach with this approach.
- **mp4box@2.3.0 (NA_ENGINE):** honest — mp4box is a demuxer/box parser and does not declare the `transcode` operation at all (no encoder). Correct NA.
- **web-demuxer@4.0.0 (NA_ENGINE):** honest — a demux-only library; does not declare `transcode`. Correct NA.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** honest — a parser only; does not declare `transcode` (re-encode lives in the separate `@remotion/webcodecs` engine). Correct NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:498-509` (`id:'hevc_to_vp9_webm'`, in the `CROSS_CODEC_CASES` matrix). Real intent: HEVC→VP9 with WebM forcing AAC→Opus; `notes` says "NA(browser) where HEVC decode is unavailable", a legitimate gating rationale.
- **Fixture:** `asset:'hevc_1080p_10s.mp4'` resolves to `fixtures/media/hevc_1080p_10s.mp4`, which **exists** and is **~11 MB** real media (1080p, 10 s). Not synthetic/empty/mock.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts` — `transcode` is genuinely implemented via mediabunny's Conversion API: options built at `:546`/`:676`, executed by `runConversion` at `:842-868` (real `Conversion.init`/`execute`, `isValid` check, bytes pulled from `BufferTarget`). It pre-flights `VideoEncoder.isConfigSupported` (`:531-539`) and negotiates HEVC decode HW mode (`:888-910`). No canned output, no input→output copy, no golden short-circuit, no error swallowing (invalid conversions throw at `:851`).
- **Gating oracle:** `ssim-psnr` at `src/core/oracles.ts:1688-1833`. For a no-committed-golden transcode it validates against an in-browser **reference decode of the source** (§5.2 path), gating on the **worst-frame** SSIM (`minSsim >= t.ssimMin`, `:1823`) with `ssimMin=0.97` (`src/scenarios/transcode/index.ts:507`). Measurements are physically plausible: 12 frame pairs, SSIM ~0.99999, `exactFrames:0`. This is a **perceptual proxy** gate, not bit-exact — appropriate since VP9 is a different lossy codec, but it sits in the middle of the correctness ladder. `exactFrames=0` means the PSNR=∞ digest-exact branch (`:1803`) is NOT taken; the gate rests entirely on luma-signature SSIM. The 0.97 floor is loose enough that any near-faithful re-encode passes, but it does perform a real frame-by-frame comparison against decoded source pixels, so it is not trivially satisfiable.
- **Cached note:** the winner's result has **`cached:true`** ("cached previous PASS result", started 2026-06-22T14:06:04Z) — it was reused, not re-run in this batch. The runner-up is also `cached:true`. Per the launcher seeding caveat, cached PASS reuse carries staleness risk; the PASS evidence is real but was not freshly regenerated.
- **Verdict: WEAK-GATE.** Real fixture + real mediabunny Conversion implementation + a real (frame-by-frame) oracle, but the gating oracle is a *perceptual SSIM proxy with `exactFrames=0`* and a loose 0.97 floor — a meaningful PASS but not a strong correctness gate. No evidence of mock data, faked output, or an unfailable oracle.

## Confidence & caveats

- **Confidence: medium.** Correctness winner is a genuine tie at the SSIM ceiling, so the verdict rests on performance, and all bench metrics are `n=1` (`mad=0`, single sample) — the speed margins (1.22× wall, 4.05× long-tasks) are directionally clear but not statistically hardened.
- Both PASS results are `cached:true`; numbers were not re-measured this run (staleness risk).
- The gate is a perceptual proxy (`ssim-psnr`, `exactFrames=0`, floor 0.97) — it certifies "visually faithful re-encode," not bit-exactness; true RGB PSNR was unavailable (no golden pixels). A stronger gate (decoded-frames bit-exact) is impossible for a cross-lossy-codec transcode by definition.
- `peakMemory`/`decodeFps` were not sampled, so two potential tiebreakers were unavailable; the win would be more robust with them.
