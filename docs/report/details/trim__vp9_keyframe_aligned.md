# trim/vp9_keyframe_aligned

family: trim | fixture asset: `vp9_1080p_10s.webm` (VP9 video + Opus audio, WebM/Matroska, 9.3 MB) | primaryMetric: wall | passCount: 2 of 7

Scenario: copy-trim the WebM source from 1.0s to 5.0s (requested 4.0s), `frameAccurate:false`, snapping to keyframes via WebM Cues. Duration tolerance is 1.1s (≈ one GOP of slack on each boundary). Gating oracles: `trim-boundaries` (duration gate; boundary-frame digest skipped because the loaded golden is a source-prefix, not a trim-range golden) plus `playback-smoke`.

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED — two engines PASS (mediabunny and ffmpeg.wasm@0.12.15); the other five are NA_ENGINE (do not declare `trim`).

Decisive factor: both pass the identical oracle set, so correctness strength is the same *category* — but mediabunny's cut is far tighter to the requested range AND dramatically cheaper.
- Correctness margin: mediabunny `durationDeltaSec` = **0.02s** (out 4.02s vs requested 4.0s) vs ffmpeg.wasm **1.014s** (out 5.014s vs 4.0s). ffmpeg.wasm only clears the 1.1s gate by 0.086s; mediabunny clears it by ~55x more headroom. mediabunny's boundary is essentially keyframe-exact.
- Performance margin: wall median **1394.1ms vs 60.7ms** — here ffmpeg.wasm is the faster *wall* number (≈23x), BUT its main-thread blocking is catastrophic: `longtasks` **12909ms vs 874ms** (mediabunny is ~14.8x lower / less jank). throughputRealtime 7.18x (mediabunny) vs 164.9x (ffmpeg.wasm). On n==1 for every metric, the wall figures are weak evidence, whereas the correctness gap (Δduration) and the longtask gap are large and physically meaningful.

Winner chosen on correctness strength first (tighter, near-keyframe-exact cut) with the responsiveness (longtask) profile as the corroborating tiebreaker; the raw wall advantage of ffmpeg.wasm is offset by its 1.0s over-trim and 13s of main-thread stalls.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 1394.1ms | 7.18x | n/a (n=0) | 874ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 60.7ms | 164.9x | n/a (n=0) | 12909ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

peakMemory and targetWrites report n=0 (not sampled) for both PASS engines, so they cannot break the tie.

## Why the winner wins (deep technical)

This is a non-frame-accurate copy-trim of VP9-in-WebM. The correct, cheap implementation demuxes encoded VP9 packets, finds the keyframe at/just-before 1.0s using the WebM Cues index, copies packets from there to 5.0s, and re-muxes into a fresh WebM without re-encoding pixels. mediabunny does exactly this through its `Conversion` API.

In `src/engines/mediabunny/adapter.ts:1445` the `trim()` method opens the input (`openInput`, line 1460), declines the no-op short-circuit (`isNoopTrim`, line 1468/476 — start 1.0s ≠ 0 so it never triggers), and because `opts.frameAccurate` is false it builds a Conversion with `trim: { start: 1.0, end: 5.0 }` (line 1485-1489) and crucially does **not** set `video.forceTranscode` (that is only added in the `frameAccurate` branch at line 1493-1495). With no forced transcode, mediabunny's Conversion performs a stream-copy trim that snaps to the nearest preceding keyframe — exactly the WebM/VP9 Cues path the scenario notes call for. The measured result `outDurationSec:4.02` (Δ 0.02s) shows the chosen keyframe sits essentially on the 1.0s request boundary, i.e. the source has a keyframe ≈1.0s in and the cut is near-exact. The config used confirms a pure-TS ESM core (`coreBuild:"pure-ts-esm"`), `backend:"webcodecs"` only for the decode side of `playback-smoke`, `sharedArrayBuffer:false`, `coopCoep:"not-required"` — so this trim needs no cross-origin isolation, unlike a threaded wasm build.

`trim-boundaries` (src/core/oracles.ts:2348) is the live gate: it reads the requested range, probes the output duration via the reference engine (falling back to a decoded frame-pts span), and compares against the 1.1s tolerance (line 2388-2400). The boundary-frame SHA-256 digest block (line 2410-2431) is deliberately skipped here because `ctx.golden.frames` is a source-prefix golden, not a trim-range golden (`boundaryFrameComparisons:0`), so only duration gates today. mediabunny's 0.02s delta passes with enormous headroom. `playback-smoke` (src/core/oracles.ts:1574) then loads the muxed WebM into a `<video>` and confirms it advances frames — proving the re-muxed VP9/Opus container is structurally valid and decodable, not just a byte blob.

Against ffmpeg.wasm the win is twofold. First, accuracy: ffmpeg.wasm landed at 5.014s (Δ 1.014s), pulling in a full extra ~1s GOP — it snapped to a keyframe a whole group-of-pictures earlier than mediabunny did, barely clearing the 1.1s gate. Second, responsiveness: ffmpeg.wasm's single-thread wasm pipeline blocks the main thread for `longtasks:12909ms` (≈13s of unbroken jank) even though its internal `wall` is 60.7ms; mediabunny's streaming-lockstep pipeline keeps longtasks to 874ms. For an in-browser editor the 14.8x lower main-thread stall plus the 50x-tighter cut make mediabunny the correct pick despite ffmpeg.wasm's lower wall number (and both wall figures are n==1, single-sample, so the wall comparison is itself weak).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed both oracles but lost. Over-trimmed by a full GOP: `durationDeltaSec` 1.014s vs mediabunny 0.02s (out 5.014s vs the 4.0s request). Also `longtasks` 12909ms vs 874ms (14.8x more main-thread blocking) and throughput aside, its accuracy and jank profile are both worse. Its low wall (60.7ms) is a single sample (n=1) and does not offset the 1.0s mis-cut.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: mp4box.js is an ISO-BMFF (MP4) box parser/segmenter with no WebM/Matroska muxing and no trim primitive; declining `trim` (especially WebM/VP9 trim) is correct, not an under-declaration.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare `trim`. Honest for this op; it is a transcode/convert wrapper over WebCodecs and does not expose a copy-trim entry point in this suite.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare `trim`. Honest: it is a demux-only (read packets) library with no muxer, so it cannot emit a trimmed WebM.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare `trim`. Honest: a parser/metadata reader, no muxing or trim capability.
- **platform@chrome-149** — NA_ENGINE: does not declare `trim`. Honest: the raw-WebCodecs "platform" baseline exposes decode/encode primitives but no packaged container trim operation.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:165-177` (`id: 'vp9_keyframe_aligned'`), asset `vp9_1080p_10s.webm`, range 1_000_000..5_000_000us, `frameAccurate:false`, tolerance 1.1s, notes "WebM/VP9 copy-trim using Cues for keyframe boundaries."
- Fixture exists: `fixtures/media/vp9_1080p_10s.webm`, 9.3 MB real WebM (VP9/Opus). Not synthetic/empty/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445` (`trim`) calls the real mediabunny `Conversion` with `trim:{start,end}` (line 1485-1489) and `runConversion` (line 1496). It does NOT copy input→output to fake the cut (the `isNoopTrim` identity short-circuit at line 1468/476 only fires for a 0..duration full-file request, which this 1..5s range is not), does NOT return canned output, and does NOT read the golden. The output is a genuinely re-muxed WebM.
- Oracle: `trim-boundaries` at `src/core/oracles.ts:2348` performs a real duration comparison (probe/decode-derived duration vs requested) against a 1.1s tolerance; `playback-smoke` at `src/core/oracles.ts:1574` requires a real `<video>` to advance frames on the output. Measurements are physically plausible (4.02s out for a 4.0s request from a 10s source; Δ 0.02s).
- Caveat: the duration tolerance is a 1.1s GOP-width gate and the frame-digest comparison is currently SKIPPED (`boundaryFrameComparisons:0`) because no trim-range golden exists — so the gate is duration + playability only, not bit-exact boundary verification. The PASS is real but not the strongest possible (no bit-exact / decoded-frame check). mediabunny's 0.02s delta is much tighter than the gate requires, which strengthens confidence the cut is genuinely keyframe-aligned.
- cached==true for BOTH PASS engines: results were reused, not re-run this session — staleness risk noted.

Verdict: **WEAK-GATE**. Real fixture + real mediabunny Conversion implementation + a meaningful (duration + playback) oracle, but the correctness gate is a 1.1s GOP-width duration tolerance with the bit-exact boundary-frame digest disabled, so the PASS, while genuine, is a proxy rather than a strict frame-exact verification.

## Confidence & caveats

Confidence: medium. The winner is clear on correctness (50x tighter cut: Δ0.02s vs Δ1.014s) and on main-thread responsiveness (14.8x fewer longtask ms), and both decisive numbers are large and codec-meaningful. Caveats: (1) every bench metric is n==1 with mad=0, so spread is unknown and the wall comparison in particular is weak single-sample evidence; (2) peakMemory/targetWrites were not sampled (n=0) so could not factor in; (3) both PASS results are cached, not freshly re-run; (4) the gate is duration+smoke (frame-digest skipped), so neither engine is proven frame-exact at the boundary — only duration-accurate within tolerance.
