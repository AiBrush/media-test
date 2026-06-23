# trim/fmp4_fragment_boundary_copy

- family: trim
- fixture asset: `h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4, ~31 MB real fixture)
- primaryMetric: wall (ms) — leaderboard ranks this copy-trim by wall throughput
- passCount: 2 of 7 (ffmpeg.wasm, mediabunny)
- requested range: startUs=4_000_000 .. endUs=10_000_000 → 6.0s copy-trim on a fragment boundary; tolerance durationToleranceSec=0.5; frameAccurate=false; features=['fragmented']

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- Status: **CONTESTED** — two engines PASS (ffmpeg-wasm, mediabunny). The other five are NA_ENGINE (no trim operation declared).
- Decisive factor: **performance**. Both PASS engines satisfied the identical oracle set (trim-boundaries + playback-smoke) with comparable correctness (both had boundaryFrameComparisons=0 — frame digest deliberately skipped — so the live gate is duration-within-tolerance, which both met). With correctness tied, ffmpeg-wasm wins decisively on wall time.
- Margin over runner-up (mediabunny): wall median **105.01 ms vs 737.13 ms = 7.02x faster**; throughputRealtime **285.67x vs 40.70x realtime = 7.02x higher**; longtasks **386 ms vs 2152 ms = 5.57x less main-thread blocking**. ffmpeg-wasm's duration delta is also tighter (0.016s vs 0.080s). Caveat: both samples are n=1 and cached==true, so the magnitude is single-shot evidence — but a 7x gap dwarfs any plausible single-run noise.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 105.01 ms | 285.67x | 0 (not sampled) | 386 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 737.13 ms | 40.70x | 0 (not sampled) | 2152 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

peakMemory and targetWrites have n==0 samples for both PASS engines (not instrumented in this run), so they are not usable as a discriminator here.

## Why the winner wins (deep technical)

This case is a **non-frame-accurate copy-trim** (`frameAccurate: false`) of a 6-second sub-range cut on a fragment boundary of an H.264/AAC MP4. The spec intent (`notes`: "Fragmented/CMAF trim: cut on a fragment boundary and rewrite tfdt/baseMediaDecodeTime") is to keep the picture data untouched and only re-time the container — so the fast, correct path is **stream-copy keyframe-aligned cutting**, not a decode/re-encode.

ffmpeg-wasm takes exactly that path. In `src/engines/ffmpeg-wasm/adapter.ts:2613-2627`, the `else` (non-frame-accurate) branch builds the argument list with **`-ss` placed BEFORE `-i`** and **`-c copy`**: it input-seeks to the nearest preceding keyframe, then `-t durationSec` with `-c copy` stream-copies the encoded H.264 NAL units and AAC frames without touching the codecs. It then appends `-avoid_negative_ts make_zero` (line 2629) to rebase timestamps at the cut, and `-movflags +faststart` (line 2630-2631) for the MP4 container. Because no pixels are decoded or re-encoded, the wall cost is dominated by demux + remux of a ~6s window: **105.01 ms, 285.67x realtime**. The output measured **6.016s vs the requested 6.0s (Δ 0.016s)** — a 16 ms over-shoot consistent with the cut snapping to the enclosing keyframe/GOP, comfortably inside the 0.5s tolerance.

mediabunny also passes and is genuinely implemented — `src/engines/mediabunny/adapter.ts:1484-1496` drives the real library `Conversion` with `trim: { start, end }` and, crucially, does NOT set `forceTranscode` in the non-frame-accurate branch (that flag is gated behind `if (opts.frameAccurate)` at line 1493-1495), so mediabunny keeps the cut lossless where boundaries land on key frames. But its measured output duration is **6.08s (Δ 0.080s)** — a coarser snap than ffmpeg's — and its wall is **737.13 ms / 40.70x realtime** with **2152 ms of long tasks**. The 7.02x wall gap and 5.57x long-task gap reflect mediabunny's pure-TS-ESM streaming-lockstep pipeline (env.configUsed: `coreBuild: pure-ts-esm`, `pipeline: streaming-lockstep`, `wasmThreads: 0`) doing per-packet JS work on the main thread for the demux/re-mux, versus ffmpeg's single monolithic wasm libavformat copy-mux pass. Note mediabunny's configUsed advertises a `webcodecs`/`prefer-hardware` backend, but for a `-c copy`-equivalent trim no decode happens, so the hardware path is irrelevant here — the gap is pure container-plumbing overhead, not codec work.

So the win is mechanistic: identical oracle satisfaction (duration-within-tolerance; smoke playback), but ffmpeg-wasm's libavformat stream-copy remux is ~7x cheaper than mediabunny's TS Conversion pipeline AND lands the duration ~5x closer to the request.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on performance): correct lossless copy-trim via real `Conversion` (`adapter.ts:1484-1496`), but 7.02x slower wall (737.13 ms vs 105.01 ms), 7.02x lower realtime throughput (40.70x vs 285.67x), 5.57x more long tasks (2152 ms vs 386 ms), and a looser duration snap (Δ 0.080s vs 0.016s). No correctness deficit — purely the runner-up on speed.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: web-demuxer is a demuxer, it has no cut/remux-to-file API.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: the raw browser MSE/WebCodecs platform exposes no trim primitive.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: mp4box is an ISOBMFF parser/segmenter, not declared for range trimming in this suite.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest and explicitly documented: `src/engines/remotion-webcodecs/adapter.ts:850-862` — "@remotion/webcodecs has NO trim/cut API (docs list it under 'Soon')"; the method throws and `trim` is left undeclared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: a parser, no encode/mux output path.

All five NA verdicts are genuine under-no-capability, not under-declared: each library architecturally lacks a trim-to-container operation.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:528-541` (id `fmp4_fragment_boundary_copy`). Real range 4_000_000..10_000_000 us, tolerance 0.5s, frameAccurate false, features ['fragmented'].
- Fixture asset: `fixtures/media/h264_1080p_30s.mp4` — **exists**, ~31 MB real H.264/AAC MP4 (stat confirmed). Not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:2348-2435` (`trim-boundaries`). It performs a real measurement — probes the trimmed output duration via the reference engine or decoded-frame PTS span (lines 2360-2386) and compares against the requested range with the configured tolerance (lines 2388-2400). The measured values are physically plausible: outDuration 6.016s/6.08s for a requested 6.0s cut. NOTE the boundary-frame digest comparison is **deliberately skipped** (lines 2405-2431, measurements.boundaryFrameComparisons=0) because the loaded golden is a source-prefix, not a trim-range golden; the code documents this and falls back to duration-only gating to avoid false failures. So the active gate is duration-within-tolerance + playback-smoke — a real but loose gate (no bit-exact / no boundary-frame check). The companion oracle is playback-smoke (a smoke gate: `<video> played a few frames`).
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2538-2645`, copy-trim path at 2613-2641. Genuinely invokes the real wasm ffmpeg (`-ss`/`-i`/`-t`/`-c copy`/`+faststart`, then `this.run(args)` and `this.readBinary(outName)`). No canned output, no input→output passthrough, no golden short-circuit, no error swallowing — it rejects malformed/mutated inputs (2550-2554) and reads back the actually-muxed bytes.
- Cached note: both PASS results have **cached==true** ("cached previous PASS result"). Evidence is reused, not freshly re-run — staleness risk per the launcher-seeding caveat. Numbers should be re-validated on a clean run, but the implementations and oracle are real.
- Verdict: **WEAK-GATE**. Real fixture + real ffmpeg stream-copy implementation + a real oracle, BUT the correctness gate is duration-tolerance (0.5s) plus playback-smoke, with the stronger boundary-frame digest skipped (boundaryFrameComparisons=0). The PASS is genuine but not a strong/bit-exact correctness proof; both engines clear it on duration alone.

## Confidence & caveats

- Confidence: **medium**. The winner ordering is unambiguous (7.02x wall, same oracles), the fixture is real, and the winning code path is a textbook stream-copy trim — all verifiable from code. Confidence is held at medium (not high) because: (1) the gating oracle is a loose duration/smoke gate with the boundary-frame digest skipped (WEAK-GATE), so neither engine proved frame-exact fragment-boundary correctness; (2) both PASS results are cached==true with n==1 samples (no mad/p95 spread, no peakMemory/targetWrites instrumentation), so the performance margin is single-shot; (3) the scenario is named/declared `fragmented` ("rewrite tfdt/baseMediaDecodeTime") but the source `h264_1080p_30s.mp4` is a faststart/progressive MP4 and the oracle does not actually inspect tfdt/baseMediaDecodeTime — the fragment-boundary intent is asserted in notes but not verified by the gate, so the test under-checks its own stated goal.
