# trim/h264_rotated_keyframe_aligned

family: trim | fixture asset: `fixtures/media/h264_rotated90.mp4` (4.4 MB, exists) | primaryMetric: wall (ms) | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Status: **CONTESTED** — two engines PASS (mediabunny, ffmpeg.wasm); the other 5 are NA_ENGINE.
- Decisive factor: **correctness strength on the gating `trim-boundaries` oracle.** Both engines pass the same two oracles (`trim-boundaries`, `playback-smoke`) with identical strictness (boundary-frame digest skipped, `boundaryFrameComparisons=0`, duration is the live gate). The tie is broken on the one numeric the oracle measures: distance from the requested cut. mediabunny lands `durationDeltaSec=0.0747s`; ffmpeg.wasm lands `durationDeltaSec=1.0133s` — only 0.087s under the 1.1s tolerance, i.e. nearly busting it. mediabunny's boundary is **~13.6x tighter** to the requested 4.000s range.
- Margin over runner-up: correctness margin = 0.0747s vs 1.0133s delta (mediabunny 13.6x tighter). Performance is the OPPOSITE: ffmpeg.wasm is ~10.1x faster wall (34.4ms vs 346.0ms) and 10.1x higher realtime throughput (290.8x vs 28.9x). Per the decision ladder, correctness outranks performance, so mediabunny wins despite being slower.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 346.035 | 28.899 | 0 (not sampled) | 4277 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 34.385 | 290.824 | 0 (not sampled) | 12909 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

Note: peakMemory/targetWrites have `n:0` (no samples) for both engines, so memory is not a usable tiebreaker here.

## Why the winner wins (deep technical)

The scenario (`src/scenarios/trim/index.ts:495-508`) is a copy-trim of `h264_rotated90.mp4` (H.264 video + AAC audio in MP4) over `startUs=1_000_000 .. endUs=5_000_000` (a requested 4.000s range), with `frameAccurate:false`, `tolerances.durationToleranceSec=1.1`, and `features:['rotate']`. The notes make the intent explicit: "Copy-trim of rotated (rotate=90 display matrix) video; the matrix must survive the cut." The `features:['rotate']` gate is what reduces the field to rotation-aware engines.

mediabunny routes this through its `trim` method (`src/engines/mediabunny/adapter.ts:1445-1500`). Because the track set contains video, the audio-only packet-copy fast path (`tryAudioOnlyPacketCopyTrim`, adapter.ts:912-921) returns null. Because `frameAccurate` is false, no `forceTranscode` is set (adapter.ts:1493-1495), so mediabunny performs a **stream-copy trim via `Conversion` with `trim:{start:1.0, end:5.0}`** (adapter.ts:1485-1496). The header comment at adapter.ts:22-25 documents the rotation contract: mediabunny by default keeps the ISOBMFF rotation as **display-matrix metadata** (`canUseRotationMetadata`) and only bakes pixels when an explicit `rotate` op forces `allowRotationMetadata:false`. This scenario is a trim (not a normalize/rotate request), so mediabunny's Conversion preserves the 90° display matrix on the output container — exactly the property the scenario gates. mediabunny's Conversion re-times the kept packets and snaps the copy boundary intelligently, producing `outDurationSec=4.0747s` — only 0.0747s over the requested 4.000s.

ffmpeg.wasm routes through its `trim` method (`src/engines/ffmpeg-wasm/adapter.ts:2538-2645`). For `frameAccurate:false` it takes the **keyframe-aligned fast trim** branch (adapter.ts:2613-2627): `-ss <start> BEFORE -i ... -t <duration> -c copy` plus `-avoid_negative_ts make_zero` and `-movflags +faststart`. `-ss` before `-i` seeks to the **nearest preceding keyframe**, and `-c copy` preserves the rotation side-data matrix verbatim, so ffmpeg also satisfies the rotate gate. But the input-side `-ss`/keyframe snap is coarser: ffmpeg snaps the start to the GOP boundary and keeps `-t 4.0s` of packets from there, yielding `outDurationSec=5.0133s` — a `durationDeltaSec=1.0133s`, only 0.087s inside the 1.1s tolerance. The 1.013s overshoot is consistent with the cut snapping back a full GOP plus copy-trim end-of-GOP carry; ffmpeg passes, but barely.

The gating oracle `trim-boundaries` (`src/core/oracles.ts:2348-2435`) probes the output duration (reference-engine probe, else decoded frame-pts span) and gates on `|outDuration - requested| <= durationToleranceSec`. The boundary-frame digest is deliberately skipped (oracles.ts:2405-2431) because the loaded golden is a source-prefix, not a trim-range golden — hence `boundaryFrameComparisons=0` for both. So the only quantitative correctness signal is the duration delta, and mediabunny's 0.0747s is 13.6x tighter than ffmpeg's 1.0133s. Per ladder step 4(a), `trim-boundaries` is a structural/metadata-exact oracle and "tighter measured tolerances win"; both engines tie on oracle count and strictness, so the tighter measured delta decides it for mediabunny. Performance (step 4b) — where ffmpeg dominates 10.1x — is only consulted when correctness is comparable, which it is not.

Backend note: mediabunny ran `backend:webcodecs`, `hwAccel:prefer-hardware` on Apple M1 Max (ANGLE Metal), `streaming-lockstep` pipeline, `coopCoep:not-required`, `sharedArrayBuffer:false`, `wasmThreads:0` (env.configUsed). It needs no COOP/COEP and no SharedArrayBuffer, a deployment advantage over the wasm engine. ffmpeg.wasm is a single-thread wasm core (its longtasks are 12909ms vs mediabunny's 4277ms — the wasm core blocks the main thread ~3x longer per the longtasks metric), which is a further tiebreaker in mediabunny's favor under step 4(c).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** correct rotation-preserving `-c copy` trim, but its keyframe-snapped `-ss`-before-`-i` copy-trim overshot to `outDurationSec=5.0133s` (`durationDeltaSec=1.0133s`), 13.6x looser than mediabunny's 0.0747s and within a hair (0.087s) of busting the 1.1s tolerance. It is 10.1x faster (34.4ms vs 346ms wall, 290.8x vs 28.9x realtime) but loses on the higher-priority correctness axis; it also blocks the main thread 3x longer (longtasks 12909ms vs 4277ms).
- **mp4box@2.3.0 (NA_ENGINE):** does not declare operation 'trim'. Honest NA — mp4box is a demux/probe/box-layout library and never exposes a sample-cutting/rewrite trim op.
- **web-demuxer@4.0.0 (NA_ENGINE):** does not declare operation 'trim'. Honest NA — it is a demuxer (packet extraction), not a re-muxer/cutter.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** does not declare operation 'trim'. Honest NA — a read-only parser; no output writing.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** does not declare operation 'trim'. Honest NA for this adapter; its surface is decode/transcode-oriented, not a container-level trim op.
- **platform@chrome-149 (NA_ENGINE):** does not declare operation 'trim'. Honest NA — the raw WebCodecs/`<video>` platform baseline has no built-in trim/remux primitive.

## Anti-cheat validation

- Scenario: `src/scenarios/trim/index.ts:495-508` (`id:'h264_rotated_keyframe_aligned'`). Input `asset:'h264_rotated90.mp4'`, container mp4, video h264, audio aac, range 1.0s..5.0s, `frameAccurate:false`, tol 1.1s, `features:['rotate']`. Notes confirm the display-matrix-survives-the-cut intent.
- Fixture: `fixtures/media/h264_rotated90.mp4` exists, 4.4 MB — a real, non-synthetic rotated H.264/MP4 file.
- Oracle: `trim-boundaries` at `src/core/oracles.ts:2348-2435` performs a real duration comparison against the requested range; `playback-smoke` at the `PLAYABLE_AV` extra oracle plays decoded frames. The duration gate is real but coarse (1.1s tolerance) and the boundary-frame digest is intentionally skipped (oracles.ts:2405-2431) because no trim-range golden was baked — so the strongest available check is duration, not bit-exact boundary frames.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445-1500` genuinely calls mediabunny's `Conversion` (`trim:{start,end}`) — no canned output, no input->output passthrough (the noop-trim shortcut at 1468-1477 only fires for start≈0 identity trims, which does NOT apply here since startUs=1_000_000), no golden short-circuit. Output bytes flow from `runConversion`. Implementation is real.
- Verdict: **WEAK-GATE.** Both PASSes are real (real fixture, real library calls, plausible measurements: 4.07s/5.01s output durations off a 4.0s request are physically sensible for GOP-snapped copy-trims). But the gating oracle is a loose duration proxy (±1.1s) with the boundary-frame bit-exact check disabled, and there is no oracle that actually verifies the rotation display matrix survived — the `rotate` feature is only a capability gate, not a checked output property. So the win is genuine but the correctness gate is weaker than a true rotation/boundary-exact comparison.
- Cached note: BOTH PASS results have `cached:true` ("cached previous PASS result"). Numbers were reused, not freshly re-run, so there is mild staleness risk (per the launcher seeding caveat). The relative ranking (duration delta and wall) is internally consistent and plausible, so confidence remains usable but not maximal.

## Confidence & caveats

- Confidence: **medium.** The winner pick is robust under the stated ladder (correctness before performance), but it hinges on a coarse duration proxy whose tolerance (1.1s) ffmpeg nearly busts; a stricter boundary-frame or matrix oracle could change the strength assessment.
- Caveats: (1) both winners are cached, not re-run. (2) No oracle directly verifies the 90° display matrix survived — the `rotate` feature only gates eligibility. (3) peakMemory not sampled (n:0), so it could not be used as a tiebreaker. (4) ffmpeg.wasm is far faster (10.1x wall); if a future suite weights performance over a loose duration delta, the ranking would flip.
