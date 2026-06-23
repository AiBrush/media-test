# trim/mkv_keyframe_aligned

- **family:** trim
- **fixture asset:** `fixtures/media/h264_in_mkv.mkv` (H.264 video + AAC audio in Matroska/MKV, ~4.4 MB)
- **operation:** copy-trim (keyframe-aligned, `frameAccurate: false`), range `startUs=1_000_000 .. endUs=5_000_000` → requested 4.0 s
- **primaryMetric:** wall (median ms)
- **passCount:** 2 of 7 (ffmpeg.wasm, mediabunny)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — two engines PASS (mediabunny, ffmpeg.wasm).
- **Decisive factor:** CORRECTNESS STRENGTH on the only gating oracle (`trim-boundaries`). The gate is duration-accuracy (boundary-frame digest is skipped on both because the loaded golden is a source-prefix, not a trim-range golden, so `boundaryFrameComparisons==0`). mediabunny's output duration delta is **0.074 s** vs ffmpeg.wasm's **1.000 s** against the 4.0 s request — a ~13.5x tighter cut. ffmpeg.wasm only squeaks under the 1.1 s tolerance; mediabunny is essentially frame-accurate. Per the ranking rule "tighter measured tolerances win," correctness is NOT comparable, so the slower-but-accurate engine wins before performance is considered.
- **Margin over runner-up:** correctness margin = 0.074 s vs 1.000 s duration delta (mediabunny 13.5x closer to the requested boundary). Performance goes the other way: ffmpeg.wasm is ~6.5x faster wall (74.27 ms vs 485.35 ms) and ~6.5x higher realtime throughput (134.9x vs 20.6x), but performance is not the decisive axis here because correctness is not comparable.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true | 485.35 ms | 20.65x | 0 (not sampled) | 4531 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true | 74.27 ms | 134.93x | 0 (not sampled) | 4410 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

**Container/codec context.** The input is H.264 in a Matroska (MKV, non-WebM) container with an AAC audio track. MKV's seekable index is the Cues element, and a copy-trim must (a) find the keyframe at/just-before the start time via Cues, (b) drop preceding non-keyframe packets, and (c) re-mux the surviving packets into a new container with a corrected timeline. The scenario note calls this out explicitly: "Matroska (non-WebM) copy-trim using Cues; distinct from WebM Cue layout." Because this is a copy-trim (`frameAccurate: false`), neither engine re-encodes video — the difference between them is purely how precisely each one realizes the requested 1.0 s..5.0 s window.

**mediabunny's path.** `src/engines/mediabunny/adapter.ts:1445` `trim()` opens the MKV via `openInput`, and for the non-frame-accurate path runs the library's `Conversion` API with an explicit `trim: { start: range.startUs/1e6, end: range.endUs/1e6 }` (adapter.ts:1484-1496). It runs on the WebCodecs backend (`env.configUsed.backend == "webcodecs"`, `hwAccel == "prefer-hardware"`, `pipeline == "streaming-lockstep"`, `coopCoep == "not-required"`, `sharedArrayBuffer == false`). The Conversion engine honors the requested end boundary tightly: the shard's `trim-boundaries` measurements show `outDurationSec=4.074`, `requestedDurationSec=4`, `durationDeltaSec=0.074` — only 74 ms over the request, i.e. mediabunny trimmed essentially to the requested boundary rather than rounding out to the next downstream keyframe.

**Why that beats ffmpeg.wasm.** ffmpeg.wasm's copy-trim (`src/engines/ffmpeg-wasm/adapter.ts:2613-2627`) builds the classic fast-seek argument vector `-ss <start> -i <in> -map 0 -t <dur> -c copy -avoid_negative_ts make_zero`. With `-c copy` there is no re-encode, so the output is quantized to the GOP structure: the trailing boundary lands on a keyframe-bounded packet run, producing `outDurationSec=5`, `durationDeltaSec=1.000` — a full extra second of carried-over GOP. That is correct keyframe-aligned behavior, but it is 13.5x looser than mediabunny on the gating measurement, and it sits right at the edge of the 1.1 s tolerance. The oracle (`src/core/oracles.ts:2388-2400`) gates strictly on `Math.abs(outDurationSec - requestedSec) <= durationToleranceSec`, so both pass, but the strictness ladder in the decision procedure favors the tighter measured value.

**Performance footnote (not decisive).** ffmpeg.wasm is dramatically faster here — 74.27 ms wall vs mediabunny's 485.35 ms (≈6.5x), and 134.93x vs 20.65x realtime throughput. Both ran with n==1 (single timed sample, `mad==0`, `p95==median`), so the perf numbers are weak single-shot evidence. Both report `peakMemory` n==0 (not sampled). Longtasks are comparable (ffmpeg 4410 ms, mediabunny 4531 ms), dominated by wasm/decoder init rather than the trim itself. Per the procedure, performance is only the tiebreak when correctness is comparable; it is not comparable here, so mediabunny wins.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed but lost on correctness strength: same single oracle (`trim-boundaries`), but `durationDeltaSec=1.000` vs mediabunny's `0.074` (13.5x looser, barely under the 1.1 s tolerance). Its `-ss/-c copy` fast path snaps the cut to GOP boundaries, carrying an extra ~1 s. It is faster (6.5x wall) but speed is not the decisive axis.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest — MP4Box.js is an ISO-BMFF parser/segmenter with no Matroska trim/remux op; it cannot copy-trim MKV.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest — web-demuxer is a demux-only wrapper; no mux/trim output capability.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest — the bare-platform WebCodecs baseline has no container muxer to write a trimmed MKV, so it cannot declare a trim op.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest — media-parser is read/parse-only; it has no container writer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Plausibly honest for the MKV target: remotion-webcodecs' converter does not declare a Matroska copy-trim op in this suite. (Worth re-checking only if a future revision adds MKV output; for now the NA is consistent with the other Remotion package being parse-only.)

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/trim/index.ts:283-295` — `id: 'mkv_keyframe_aligned'`, `asset: 'h264_in_mkv.mkv'`, `container: 'mkv'`, `videoCodec: 'h264'`, `audioCodec: 'aac'`, `startUs: 1_000_000`, `endUs: 5_000_000`, `frameAccurate: false`, `tolerances.durationToleranceSec: 1.1`, `extraOracles: BOUNDARIES_ONLY` (`BOUNDARIES_ONLY = []` at index.ts:133, so the only oracle is the family-default `trim-boundaries`).
- **Fixture exists:** `fixtures/media/h264_in_mkv.mkv` present, ~4.4 MB — a real Matroska file, not synthetic/empty/mock.
- **Oracle:** `src/core/oracles.ts:2346-2435` (`trimBoundaries`). It reads the requested range, probes the trimmed output's duration via the reference engine and/or by decoding frame PTS span (oracles.ts:2360-2386), and fails if `|outDuration - requested| > tolerance` (oracles.ts:2388-2400). It is a REAL comparison against the produced bytes, not trivially satisfiable for arbitrary output. Caveat: boundary-frame digest comparison is intentionally skipped (oracles.ts:2405-2431) because the loaded golden is a source-prefix, not a trim-range golden, so the gate reduces to duration-accuracy only (`boundaryFrameComparisons=0` in both shard entries). This makes the gate looser than a full bit-exact boundary check — a proxy gate.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1445-1500` — genuine: opens the MKV with `openInput`, runs the library `Conversion` with `trim:{start,end}` (line 1488), muxes via real `this.lib.Output`/`BufferTarget`. No canned output, no input→output passthrough (the no-op shortcut at 1468-1477 only fires when start≈0 AND `isNoopTrim`, which is false for a 1 s..5 s sub-range), no golden short-circuit, no error swallowing. ffmpeg.wasm winner-runner-up path (`src/engines/ffmpeg-wasm/adapter.ts:2613-2636`) is likewise a real `-c copy` exec.
- **Verdict:** WEAK-GATE. The fixture is real and both implementations are genuine, but the sole gate is a duration-tolerance proxy (1.1 s wide, no boundary-frame digest, `boundaryFrameComparisons=0`). The PASS is real but does not prove byte-/frame-exact boundaries. Measurements are physically plausible (4.074 s and 5.0 s outputs for a 4.0 s request on a multi-second source; durations consistent with keyframe-aligned vs near-exact cuts).
- **Cached note:** BOTH PASS results have `cached==true` (`reason: "cached previous PASS result"`). The numbers were reused, not re-run this session — staleness risk: the winner is decided on cached evidence for both contenders. mediabunny's cached run is timestamped 2026-06-22T14:04Z, ffmpeg.wasm 2026-06-22T16:59Z.

## Confidence & caveats

- **Confidence:** medium. The winner ordering is clear from the shard's own measurements (0.074 s vs 1.000 s delta), but it rests on a single proxy oracle (duration tolerance) with no boundary-frame digest, and both contenders are cached (n==1 timing, peakMemory not sampled).
- The 1.1 s tolerance is wide enough that ffmpeg.wasm's GOP-rounded 5.0 s output (delta exactly 1.000 s) passes; a stricter trim-range golden with boundary-frame digests would more sharply separate the two and could change a "both PASS" into a single decisive winner.
- The 5 NA_ENGINE results are consistent and honest: none of those five declare a `trim` op, and none has an MKV container writer, so they cannot perform this operation.
