# trim/h264_multitrack_keyframe_aligned

- **family:** trim
- **fixture asset:** `fixtures/media/h264_multitrack.mp4` (1 video H.264 + 2 audio AAC, ~4.5 MB, real file)
- **primaryMetric:** wall (ms)
- **passCount:** 2 of 7 (ffmpeg.wasm, mediabunny)
- **trim request:** startUs=1_000_000, endUs=5_000_000 → requested 4.0s; frameAccurate=false (keyframe-aligned copy); durationTolerance=1.1s

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (2 engines PASS).
- **Decisive factor:** CORRECTNESS STRENGTH, not performance. Both engines pass the same two oracles
  (`trim-boundaries`, `playback-smoke`), but the only quantitative signal in the gating oracle is cut
  accuracy (`durationDeltaSec`). mediabunny lands the cut at **4.0747s (Δ 0.0747s)** versus ffmpeg.wasm's
  **5.0133s (Δ 1.0133s)** against a requested 4.0s. mediabunny's measured boundary error is **13.6x tighter**;
  ffmpeg.wasm only passes by 0.087s of headroom under the 1.1s tolerance. Per the decision ladder
  ("tighter measured tolerances win"), mediabunny wins on correctness before performance is even consulted.
- **Margin over runner-up:** correctness Δduration 0.0747s vs 1.0133s (13.6x tighter cut). On raw speed
  ffmpeg.wasm is the opposite — 27.76ms vs 434.17ms wall (15.6x faster), 360.2x vs 23.0x realtime — but it
  buys that with a 19,963ms longtask burst (main-thread blocking) vs mediabunny's 2,907ms, and it sacrifices
  cut accuracy. Correctness dominates the tiebreak ladder, so mediabunny wins.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | trim-boundaries:Δ0.0747s, playback-smoke:✓ | 434.165 ms | 23.03x | 0 (n=0) | 2907 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:Δ1.0133s, playback-smoke:✓ | 27.760 ms | 360.23x | 0 (n=0) | 19963 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

(peakMemory has n=0 samples for both PASS engines — not measured in this cell, so it cannot break the tie.)

## Why the winner wins (deep technical)

**Container/codec/operation.** The fixture is a progressive MP4 with one H.264 video track and **two** AAC
audio tracks (`h264_multitrack.mp4`). The operation is a non-frame-accurate ("keyframe-aligned") copy-trim of
the interior range [1.0s, 5.0s). The scenario note is explicit: "every track must be cut & re-based in
lockstep." The hard part is that an interior `startUs` rarely coincides with a video IDR; the engine must
choose how to reconcile the three tracks' edit start and how the resulting container reports duration.

**ffmpeg.wasm's mechanism (and why its cut is loose).** `adapter.ts:2613-2627` builds the fast path
`-ss <start> ... -i <in> -map 0 -t <dur> -c copy`. Placing `-ss` *before* `-i` is input-seek: ffmpeg seeks to
the nearest **preceding keyframe** and stream-copies from there without re-encoding. Because the IDR before
1.0s sits earlier in the GOP, the copied range starts before the requested point and the muxed output spans
~5.013s rather than 4.0s — exactly the `outDurationSec:5.0133, durationDeltaSec:1.0133` recorded in the shard.
`-map 0` copies all three tracks and `-avoid_negative_ts make_zero` (`adapter.ts:2629`) re-bases their
timestamps, so the multitrack lockstep requirement is met and `+faststart` (`adapter.ts:2630-2631`) makes the
moov-first output a `<video>`-playable file (passing `playback-smoke`). It is a correct keyframe-snap trim —
just a coarse one that lands within 0.087s of failing the 1.1s gate.

**mediabunny's mechanism (and why its cut is tight).** `adapter.ts:1484-1496` runs mediabunny's
`Conversion` with `trim:{ start: range.startUs/1e6, end: range.endUs/1e6 }` — exact-second boundaries — and,
because `frameAccurate` is false here, does NOT set `video.forceTranscode`. mediabunny's Conversion re-times
the output to the requested window (re-basing each track's packet table and edit list to the exact range)
while keeping the video losslessly key-aligned where possible, yielding `outDurationSec:4.0747,
durationDeltaSec:0.0747`. The recorded `env.configUsed` confirms the backend: `backend:"webcodecs"`,
`hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`,
`sharedArrayBuffer:false`, `coopCoep:"not-required"`. That streaming-lockstep pipeline is exactly what keeps
the 1 video + 2 audio tracks aligned at the cut, and the pure-TS ESM core means no COOP/COEP and no SAB
requirement — a deployment-footprint tiebreaker in mediabunny's favor.

**Oracle evidence.** Both pass `trim-boundaries` (`oracles.ts:2348-2435`). The oracle probes output duration
via the reference engine, falls back to a decoded-frame pts span, compares to the requested 4.0s, and gates on
`durationToleranceSec` (1.1s here). Boundary-frame digest is deliberately skipped
(`measurements.boundaryFrameComparisons:0`, `oracles.ts:2405-2431`) because the loaded golden is a
source-prefix, not a trim-range golden — so the live gate is duration only. Under that gate the *only*
discriminating number is `durationDeltaSec`, and mediabunny's 0.0747s vs ffmpeg's 1.0133s is the decisive
correctness margin. `playback-smoke` (`oracles.ts:1575+`) confirms both outputs play frames in a `<video>`.

**Why mediabunny over ffmpeg on the ladder.** Equal oracle *count* and *tier* (both structural
trim-boundaries + smoke), so rule 4(a) breaks the tie on strictness of the measured boundary: tighter cut
wins. mediabunny is 15.6x slower on wall and 15.7x lower on realtime throughput, but performance (4b) is only
consulted when correctness is comparable — here it is not. As a bonus, ffmpeg's single-thread wasm core
produced a 19,963ms longtask (vs 2,907ms), i.e. it monopolized the main thread far longer despite finishing
the encode faster, a real UX cost on top of the coarser cut.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed but lost. Its `-ss`-before-`-i` `-c copy` keyframe-snap (`adapter.ts:2614`)
  produced a 5.0133s clip for a 4.0s request (Δ 1.0133s), 13.6x looser than mediabunny and only 0.087s inside
  the 1.1s tolerance. Also single-thread wasm: 19,963ms longtask main-thread block.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest — the raw WebCodecs
  platform adapter exposes decode/encode primitives, not a container-level trim/remux operation.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest — MP4Box is a
  parser/segmenter in this suite; it does not declare a trim op.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest — demux-only library.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest — wired here
  for transcode/convert, no trim op declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest — a
  parser, output-incapable, correctly declines.

All five NAs are honest capability declarations (NA_ENGINE = op not declared), not under-declarations: a pure
demuxer/parser/raw-codec adapter genuinely cannot perform a container trim+remux of a multitrack MP4.

## Anti-cheat validation

- **Scenario:** `src/scenarios/trim/index.ts:512-524` (id `h264_multitrack_keyframe_aligned`), oracle set
  `extraOracles: PLAYABLE_AV` (= `['playback-smoke']`, `index.ts:125`) on top of the always-on trim-boundaries
  gate; `tolerances.durationToleranceSec:1.1`.
- **Fixture:** `fixtures/media/h264_multitrack.mp4` — exists, ~4.5 MB real H.264+2×AAC MP4 (stat confirmed).
  Not synthetic/empty/mock.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1445-1500` — genuinely calls `new this.lib.Output`
  + `Conversion` with real `trim:{start,end}` seconds and `runConversion`; no canned output, no input→output
  copy (the no-op identity branch at :1468-1476 is guarded by `isNoopTrim` and does NOT trigger for a
  1s→5s sub-range), no golden short-circuit, no swallowed errors.
- **Oracle:** `src/core/oracles.ts:2348-2435` (`trim-boundaries`) does a real reference-probe / decoded-frame
  pts-span duration measurement and gates on a numeric delta; `playback-smoke` (`oracles.ts:1575+`) actually
  plays the output in `<video>`. The measurements (4.0747s / 5.0133s vs 4.0s requested) are physically
  plausible for this fixture and range.
- **Verdict: WEAK-GATE.** The PASS is real (real fixture, real Conversion call, real duration oracle), but the
  active gate is duration-only with a wide 1.1s tolerance and `boundaryFrameComparisons:0` (frame digest
  skipped because the golden is a source-prefix, `oracles.ts:2405-2431`). No bit-exact or boundary-frame
  correctness is enforced. mediabunny's win is genuine and on the strict side of the gate, but the gate itself
  cannot distinguish a frame-accurate cut from a keyframe-snapped one beyond the duration delta. Not a CHEAT
  (no faked/canned output found), but the correctness ceiling is the duration proxy.
- **Cached note:** BOTH PASS results have `cached:true` ("cached previous PASS result"). The numbers were
  reused, not re-run in this pass — staleness risk: the cut-accuracy comparison rests on a prior execution.

## Confidence & caveats

- **Confidence:** medium. Winner selection is unambiguous on the documented ladder (tighter cut delta), and
  both adapters are genuine. Confidence is held below high because (1) both results are cached, and (2) the
  gating oracle is a duration proxy (boundaryFrameComparisons=0), so neither engine's *frame-level* boundary
  fidelity was actually verified for this multitrack cut.
- **Caveat:** ffmpeg.wasm is dramatically faster (15.6x wall, 360x realtime). If the suite reweighted toward
  throughput, ffmpeg would win — but it would still be the looser cut (5.0133s) and the main-thread-blocking
  (19,963ms longtask) option. The decision here is correctness-first by design.
- **Caveat:** peakMemory has n=0 for both (not captured), so the memory tiebreaker is unavailable; all bench
  metrics are n=1 (single sample, mad=0), so spread is unknown and the perf numbers are weak evidence.
