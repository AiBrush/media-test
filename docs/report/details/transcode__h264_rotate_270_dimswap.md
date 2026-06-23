# transcode/h264_rotate_270_dimswap

family: transcode | fixture asset: `h264_rotated90.mp4` (H.264/AAC in MP4, ~4.4 MB) | primaryMetric: wall (ms) | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (PASS).
- Contested: **YES** — two engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Correctness is a tie (both satisfy the same two oracles: `property-invariant[transcode-output-metadata]` + `playback-smoke`), so the decision falls to **performance**.
- Decisive factor: **wall-clock / throughput**. mediabunny runs the rotate-270 transcode in **682.8 ms** vs ffmpeg.wasm's **11,193.5 ms** — a **16.40x** wall-time win — with **16.40x** higher realtime throughput (14.65x vs 0.89x), **16.40x** higher encodeFps (439.4 vs 26.8), and **3.65x** less main-thread blocking (5,478 ms vs 19,963 ms longtasks).
- Margin over runner-up: 16.40x faster wall; both passed the same correctness gates, so the gap is pure efficiency, driven by WebCodecs hardware encode vs single-thread wasm software encode.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 682.80 ms | 14.6456 x | 0 (not sampled) | 5,478 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | 11,193.47 ms | 0.8934 x | 0 (not sampled) | 19,963 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | rotated MP4 outputs are not playback-smoke-safe in this package |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas capture does not apply rotation transforms |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Notes: peakMemory and decodeFps have `n==0` samples for both passing engines (not collected this run); all bench metrics are `n==1` (single sample, mad==0, p95==median), so the perf comparison is single-shot evidence — directionally strong (16x) but weak in statistical depth.

## Why the winner wins (deep technical)

The operation is a **270° rotation of an already-pre-rotated H.264/AAC MP4** (`h264_rotated90.mp4`), re-encoded to H.264 in MP4 with a W↔H dimension swap. Per the scenario notes (src/scenarios/transcode/index.ts:685-687), the compounded display matrix (innate 90° + requested 270°) is baked, and `ssim-psnr` is deliberately omitted because the reference frames are not counter-rotated — so the gate is container/codec/duration metadata plus a real `<video>` playback smoke test, not pixel SSIM.

Both passing engines clear that gate identically, so the win is mechanistic on the encode backend:

mediabunny ran on `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required` (env.configUsed). Its `transcode()` (src/engines/mediabunny/adapter.ts:1271-1322) drives mediabunny's `Conversion` API: it opens an Input, builds video options via `buildVideoOptions`, and runs the conversion. The rotation is handled in `buildVideoOptions` (src/engines/mediabunny/adapter.ts:588-598): `opts.rotate` is normalized into `[0,360)` and crucially `opts.allowRotationMetadata = false` is set, forcing mediabunny to **bake the total rotation into the coded pixels** rather than just toggling the ISOBMFF tkhd display-matrix flag (mediabunny's default `canUseRotationMetadata` would otherwise leave pixels rotated and only flip a container flag). The H.264 frames are then decoded and re-encoded through Chrome's hardware-accelerated `VideoEncoder` (the `prefer-hardware` mode is chosen by probing `canEncodeVideo` at src/engines/mediabunny/adapter.ts:628-645) on the Apple M1 Max GPU/media engine. Result: **439.4 encodeFps**, **14.65x realtime**, finishing in **682.8 ms** with the output duration landing at Δ **0.0693 s** vs source — comfortably inside the 0.15 s tolerance (measurements.durationDeltaSec=0.0693333, durationToleranceSec=0.15) — and 1 video track matching the requested shape.

ffmpeg.wasm produced an equally-conformant output (duration Δ **0** s, 1 video track, playback-smoke OK) but does so with **single-thread wasm software H.264 encode** (the adapter defaults to the single-thread core, src/engines/ffmpeg-wasm/adapter.ts:10; rotate is implemented via libavfilter transpose / display-matrix, line 1485). Software x264-style encode in wasm with no SharedArrayBuffer threading is the bottleneck: **26.8 encodeFps**, **0.89x realtime** (i.e. slower than realtime), **11.19 s** wall, and **19,963 ms** of long tasks hammering the main thread. That is the entire 16.40x gap — same correctness, but hardware WebCodecs encode beats single-thread wasm encode by an order of magnitude on this 30 s 1080p-class clip.

Tiebreakers reinforce mediabunny: it requires no COOP/COEP (`coopCoep: not-required`, `sharedArrayBuffer: false`), uses a streaming-lockstep pipeline rather than whole-file wasm buffering, and runs on the platform hardware encoder.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost on perf): correct output (durationDelta 0 s, 1 video track) but single-thread wasm software encode caps it at 26.8 encodeFps / 0.89x realtime / 11,193 ms wall — **16.40x slower** than mediabunny and 3.65x more main-thread blocking (19,963 ms vs 5,478 ms). No correctness deficit; purely a backend-speed loss.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): self-declared NA — "rotated MP4 outputs are not playback-smoke-safe in this package". This is an **honest capability gap**, not an under-declaration: the package would emit rotated MP4 output that fails the `<video>` playback smoke gate, so it abstains (durationMs=1, no oracles attempted).
- **platform@chrome-149** (NA_ENGINE): honest NA — its encode path is `<video>→canvas→MediaRecorder`, and "MediaRecorder canvas capture does not apply rotation transforms". The browser-native pipeline cannot bake a display-matrix rotation into the captured pixels, so it correctly abstains (durationMs=2) rather than emit an unrotated/wrong output.
- **web-demuxer@4.0.0** (NA_ENGINE): does not declare the `transcode` operation — it is a demuxer only. Honest NA.
- **remotion-media-parser@4.0.479** (NA_ENGINE): does not declare `transcode` — it is a parser/probe library. Honest NA.
- **mp4box@2.3.0** (NA_ENGINE): does not declare `transcode` — it is a box-level (de)muxer, no encode. Honest NA.

## Anti-cheat validation

- Scenario: src/scenarios/transcode/index.ts:672-688 (`id: 'h264_rotate_270_dimswap'`), built via `buildVideoScenario` from `ROTATE_CASES` (src/scenarios/transcode/index.ts:693). opts = `{ container: 'mp4', video: { codec: 'h264', rotate: 270 } }`, oraclesOverride = `['property-invariant','playback-smoke']`, optsInvariant = `transcode-output-metadata`.
- Fixture: `asset: 'h264_rotated90.mp4'` — verified present: `fixtures/media/h264_rotated90.mp4`, ~4.4 MB (real H.264/AAC MP4, not synthetic/empty/mock). A real pre-rotated source is exactly what the compounded-matrix test needs.
- Oracle: `transcodeOutputMetadataInvariant` at src/core/oracles.ts:3626-3708. It re-probes the actual transcode output with the reference engine, then checks container match, duration within tolerance (delta vs golden source duration), and that requested video/audio tracks exist with the requested shape via `compareRequestedTrack`. This is a **genuine structural/metadata-exact comparison**, not trivially satisfiable. The `playback-smoke` oracle (src/core/oracles.ts:1572+) actually plays frames of the output `<video>`.
- Winner adapter: src/engines/mediabunny/adapter.ts:1271-1322 (`transcode` → real `Conversion`) and :588-598 (rotation baked via `allowRotationMetadata:false`). It opens a real Input, runs a real Conversion through WebCodecs `VideoEncoder`, and does not copy input→output, return canned bytes, short-circuit to a golden, or swallow errors (it throws on no-video-track, invalid dimensions, unencodable codec).
- Measurements plausibility: durationDeltaSec 0.0693 within 0.15 tol; encodeFps 439.4 and 14.65x realtime are physically plausible for M1 Max hardware H.264 encode of a ~30 s clip; ffmpeg's 0.89x realtime / 26.8 encodeFps are plausible for single-thread wasm. All consistent with real media.
- Cached note: **both passing engines have `cached==true`** ("cached previous PASS result"). Evidence was reused, not freshly re-run this session — mild staleness risk. The MEMORY launcher-seeding caveat applies (stale PASS reuse possible), but the metadata gate is deterministic and the fixture/adapter/oracle code paths are all genuine, so the verdict holds.
- Verdict: **REAL** — real fixture + real WebCodecs Conversion implementation with rotation baked into pixels + meaningful metadata+playback oracle. (Note: the gate is structural metadata + playback smoke, not pixel-SSIM — by deliberate design because no rotation-aware golden exists — so it is a structural gate, strong but not bit-exact.)

## Confidence & caveats

- Confidence: **high** on the winner. The correctness tie is exact (same two oracles) and the 16.40x performance gap is large and mechanistically explained (hardware WebCodecs vs single-thread wasm).
- Caveats: (1) All bench metrics are single-sample (`n==1`, mad==0); the 16x direction is robust but lacks variance evidence. (2) Both winners' results are `cached==true` — not re-run this session. (3) peakMemory/decodeFps not sampled (`n==0`), so memory could not factor into the tiebreak. (4) The gate is structural (metadata + playback smoke), not pixel-exact, so neither passing engine's actual rotated pixels were SSIM-verified — a rotation-aware golden bake would be needed to gate rotated pixels (as the scenario notes acknowledge).
