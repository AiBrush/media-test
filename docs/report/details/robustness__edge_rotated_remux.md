# robustness/edge_rotated_remux

- **Family:** robustness
- **Fixture asset:** `fixtures/media/h264_rotated90.mp4` (4.4 MB, real H.264+AAC clip carrying a 90° display-matrix rotation)
- **Operation:** remux MP4 → MOV (`op: 'remux'`, `containersIn: ['mp4']`, `containersOut: ['mov']`, `features: ['rotate']`)
- **primaryMetric:** none reported in shard (no `bench` block present for any engine; only `durationMs` task wall)
- **passCount:** 2 of 7 (mediabunny, ffmpeg.wasm)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** yes — 2 engines PASS (mediabunny, ffmpeg.wasm), 5 are NA_ENGINE.
- **Decisive factor:** CORRECTNESS STRENGTH on the gating oracle. Both engines pass the same two oracles (`reference-reimport` structural/semantic + `playback-smoke`). On the single hard measured quantity that `reference-reimport` checks for a remux — duration drift after the wrapper change — **ffmpeg.wasm achieves `durationDeltaSec: 0` (bit-perfect timeline)** while mediabunny shows `durationDeltaSec: 0.0693333s` (within the 0.1 s tolerance, but a real tail-rounding drift). Both reproduce 2 media tracks; ffmpeg also re-imports a tighter packet/keyframe table (770 pkts / 475 kf) consistent with stream-copy, vs mediabunny's 772 pkts / 477 kf.
- **Margin over runner-up:** duration fidelity 0.0000 s vs 0.0693 s (ffmpeg exact; mediabunny 69 ms off). Performance is NOT decisive here and actually favors mediabunny (task wall 682 ms vs 873 ms ≈ mediabunny 1.28× faster), but there is no `bench`/`primaryMetric` block and both results are **cached (n effectively 1)**, so the perf signal is weak evidence and is overridden by the correctness edge per the ranking ladder.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true; playback-smoke:true | n/a (durationMs 873) | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true; playback-smoke:true | n/a (durationMs 682) | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |

No engine reported a `bench{}` block in this shard, so wall median / throughputRealtime / peakMemory / longtasks are unavailable; `durationMs` (total task wall, includes cache hydration) is shown inline for the two PASS engines.

## Why the winner wins (deep technical)

The operation is a **lossless container rewrap** of an H.264 video + AAC audio elementary stream from an ISO-BMFF `.mp4` box layout into a QuickTime `.mov` box layout, where the source carries a 90° rotation expressed as a `tkhd` transformation matrix. The scenario's whole point (`notes: 'Rotation metadata survival through a wrapper change.'`) is that the display-rotation must travel intact while the coded samples are copied byte-for-byte (no re-encode).

ffmpeg.wasm performs this with a true stream-copy mux. In `src/engines/ffmpeg-wasm/adapter.ts:2044` it builds `['-i', in, '-map', '0', '-c', 'copy', ...]` — `-map 0` keeps both the video and audio tracks (not just ffmpeg's default one-per-type), and `-c copy` re-packetizes nothing. For the `mov`/`mp4` family it appends `-movflags +faststart` (`adapter.ts:2049`), producing a moov-first QuickTime file. Crucially, ffmpeg's MOV muxer copies the source `tkhd` display matrix verbatim, and because it stream-copies the original sample timing tables, the re-imported timeline is identical to the golden: the shard records `durationDeltaSec: 0`, `reimportMediaTracks: 2`, `goldenMediaTracks: 2`, `reimportPackets: 770`, `reimportKeyframes: 475`. That `durationDeltaSec: 0` is the strongest possible result on the only numeric assertion `semanticRemuxReimport` makes for a remux (`src/core/oracles.ts:1311-1323`), which compares re-imported duration against golden within a tolerance floored at 0.1 s (`oracles.ts:1318`).

mediabunny also passes and is mechanistically sound: its `remux()` (`src/engines/mediabunny/adapter.ts:1244-1260`) opens the input, builds the output format via `makeOutputFormat(opts.container)` resolving `'mov'` → QuickTime (`adapter.ts:282`), and runs a `Conversion` with no codec/transform options, which copies encoded samples. For rotation it correctly keeps the angle as **ISOBMFF rotation metadata** rather than baking pixels, because the `rotate` *transcode* baking path (`allowRotationMetadata:false`, `adapter.ts:588-594`) is only triggered when a numeric `opts.rotate` is supplied; a plain container remux preserves the display matrix as metadata — exactly the survival the scenario wants. Its re-import: `reimportPackets: 772`, `reimportKeyframes: 477`, `reimportMediaTracks: 2`, `durationDeltaSec: 0.0693333s`. The 2 extra packets and ~69 ms tail are consistent with mediabunny materializing a slightly longer audio tail / different edit-list rounding when it rewrites the sample tables, which is legal (the oracle's 0.1 s floor absorbs it) but is measurably less faithful than ffmpeg's zero-drift copy.

So both are real, both preserve rotation, both reproduce the 2-track layout. The tiebreak is correctness strictness: ffmpeg's stream-copy reproduces the source timeline exactly (Δ = 0 s) whereas mediabunny introduces a small but real timing drift (Δ = 69 ms). Performance would favor mediabunny (682 ms vs 873 ms task wall, and mediabunny runs on a pure-TS ESM core with no COOP/COEP requirement vs ffmpeg's wasm core), but with no `bench`/`primaryMetric` block and both rows `cached:true` (single-sample, stale-reuse), the perf delta is weak evidence and does not outrank a genuine correctness gap on the gated metric.

## What each other framework did wrong

- **mediabunny@1.48.0 (PASS, lost):** correct and faster, but its re-imported output drifts on the gated quantity — `durationDeltaSec: 0.0693333s` vs ffmpeg's `0`, plus 772/477 pkts/kf vs ffmpeg's 770/475. Loses on correctness strictness only.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — remotion-media-parser is a parser/demuxer, it has no muxer, so it cannot emit a `.mov`. Genuine capability gap, not under-declaration.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — the WebCodecs/native browser surface decodes and demuxes but offers no container muxer; a remux to MOV is genuinely out of scope.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — its name and design are demux-only (libav-backed demuxer); no mux path exists.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare output container 'mov'". Plausible/honest — it can mux but its output-container set excludes QuickTime `mov` (typically targets `mp4`/`webm`); declining `mov` is an honest container limitation rather than a missing operation.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare output container 'mov'". Honest — mp4box is an ISO-BMFF (`mp4`) tool; it does not advertise the QuickTime `mov` brand as an output target, so it correctly NAs rather than emitting a mislabeled file.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:69-81` (`id: 'edge_rotated_remux'`, `op: 'remux'`, `asset: 'h264_rotated90.mp4'`, `containersOut: ['mov']`, `oracles: ['reference-reimport','playback-smoke']`, `notes: 'Rotation metadata survival through a wrapper change.'`).
- **Fixture:** `fixtures/media/h264_rotated90.mp4` exists — 4.4 MB real media (not synthetic/empty/mock). Goldens present: `fixtures/golden/h264_rotated90.mp4.{meta,packets,frames,ssim}.json`.
- **Oracle:** `reference-reimport` at `src/core/oracles.ts:1225`, remux branch `semanticRemuxReimport` at `oracles.ts:1273`. It re-imports the engine's output bytes through an independent reference engine, fails on empty packet tables (`oracles.ts:1244-1250`), compares media-track count and per-type layout (`oracles.ts:1289-1298`), and compares duration within a real tolerance (`oracles.ts:1311-1323`). This is a genuine round-trip comparison against golden track layout/duration, not trivially satisfiable. The measurements are physically plausible for this clip (770-772 packets, 475-477 keyframes, 2 tracks, ~sub-100ms duration deltas).
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — genuine `-map 0 -c copy` stream-copy mux through the real ffmpeg.wasm core with `-movflags +faststart`; reads the actual output file back (`adapter.ts:2064`). No canned output, no input→output passthrough, no short-circuit to golden, no error swallowing (errors propagate from `this.run`).
- **Verdict:** **REAL.** Real 4.4 MB fixture + real wasm stream-copy implementation + a meaningful structural+duration round-trip oracle backed by committed goldens. The second oracle (`playback-smoke`) is a weak smoke gate, but the gating strength comes from `reference-reimport`, so the overall PASS is real (not WEAK-GATE).
- **Cached note:** Both PASS rows are `cached:true` ("cached previous PASS result"). Evidence is therefore reused, not freshly re-run — effective n=1, with the launcher-seeding stale-PASS caveat applying. The correctness measurements (Δduration, track counts) are stored and used directly; if a fully fresh run is desired, clear raw + `.browser-cache` before re-running.

## Confidence & caveats

- Confidence: **medium-high.** The winner choice rests on a clear, gated correctness measurement (durationDeltaSec 0 vs 0.0693 s) with both engines using genuine stream-copy paths verified in source.
- Caveat 1: No `bench{}` / `primaryMetric` in this shard, so the performance dimension is supported only by `durationMs` (task wall, includes cache hydration), which favors mediabunny (682 ms vs 873 ms) — a legitimate point in mediabunny's favor that the ranking ladder subordinates to correctness.
- Caveat 2: Both results are cached (stale-reuse risk); the win margin is a real-but-small 69 ms duration drift well inside the 0.1 s tolerance, so a reasonable reader could call this a near-tie and prefer mediabunny on speed + no-COOP/COEP + pure-TS bundle.
- Caveat 3: The 5 NA_ENGINE results all look honest (parser/demuxer-only engines, or muxers that genuinely don't target the QuickTime `mov` brand); none appear to be under-declared remux capability.
