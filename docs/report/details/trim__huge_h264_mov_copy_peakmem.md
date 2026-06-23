# trim/huge_h264_mov_copy_peakmem

family: trim | fixture asset: `huge_h264_1080p_600s.mov` (448 MB, H.264 1080p + AAC, QuickTime/MOV) | primaryMetric: peakMemory | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 of 7 engines PASS: mediabunny and ffmpeg.wasm).
- Decisive factor: **performance**. Correctness is a tie (both pass the same two oracles, `trim-boundaries` + `playback-smoke`, both with `boundaryFrameComparisons=0`, i.e. the duration-proxy gate only). The named primaryMetric `peakMemory` was NOT captured for either engine (`peakMemory.n==0`, `samples:[]`; `sourceReads.n==0`), so ranking falls through the bench ladder to wall / throughput / longtasks.
- Margin over runner-up (ffmpeg.wasm): wall median **678.54 ms vs 786.59 ms = 1.16x faster**; throughputRealtime **884.25x vs 762.78x = 1.16x higher**; longtasks (main-thread blocking) **4410 ms vs 12909 ms = 2.93x lower**. All measurements are single-sample (n==1), so the spread is unmeasured (mad=0, p95==median) — the margin is real but weak evidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:✓, playback-smoke:✓ | 678.54 | 884.25 | n=0 (not captured) | 4410 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:✓, playback-smoke:✓ | 786.59 | 762.78 | n=0 (not captured) | 12909 | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

This rung is a **copy-trim** (`frameAccurate:false`, `tolerances.durationToleranceSec:0.5`) of a 6-second mid-file span (`startUs:300_000_000`..`endUs:306_000_000`, i.e. 300s..306s) deep inside a **448 MB H.264-in-MOV** file. The scenario's stated purpose (src/scenarios/trim/index.ts:626-641) is the OOM-resistance / lazy-read story: `primaryMetric:'peakMemory'`, and the notes call out that `peakMemory + sourceReads expose whether the engine Range-reads only the kept GOPs or buffers the whole input`.

mediabunny ran on the **WebCodecs backend** (`env.configUsed`: `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`, `sharedArrayBuffer:false`) on an Apple M1 Max. For this video-bearing copy-trim it goes through the Conversion `trim` path in src/engines/mediabunny/adapter.ts:1445-1500: the audio-only fast path `tryAudioOnlyPacketCopyTrim` is skipped because that helper bails the moment a video track is present (adapter.ts:921 `if (meta.tracks.some((t) => t.type === 'video')) return null`), so trim() builds a `Conversion` with `trim:{ start: 300, end: 306 }` and no `forceTranscode` (adapter.ts:1485-1496). Because `frameAccurate` is false, no boundary re-encode is forced; mediabunny copies the kept GOP packets. Crucially, mediabunny opens the corpus asset over a `UrlSource` so it can **range-read sample tables and only the kept GOPs** rather than buffering the whole file — this is exactly the declared `trim:massive-lazy-read` capability (adapter.ts:1053). That lazy I/O is the mechanism the scenario's peakMemory metric was designed to reward.

ffmpeg.wasm takes the opposite I/O strategy. Its `writeInput` materializes the **entire input into MEMFS** before any trimming: src/engines/ffmpeg-wasm/adapter.ts:1855-1856 does `const bytes = copyBytes(await input.arrayBuffer())` then `writeFile(inName, bytes)`. For a 448 MB .mov that is a full whole-file buffer (plus the `copyBytes` duplication) held in the wasm heap. The trim itself is the correct fast path — keyframe-aligned `-ss` BEFORE `-i` with `-c copy` and `-movflags +faststart` (adapter.ts:2614-2631) — so it is a genuine stream copy, not a re-encode; but the up-front whole-file load is why it blocks the main thread far longer (longtasks 12909 ms vs mediabunny's 4410 ms, a 2.93x gap) and why, had peakMemory been captured, the architecture predicts mediabunny's range-reads would win the named metric. On the captured metrics mediabunny is 1.16x faster wall (678.54 vs 786.59 ms) and 1.16x higher realtime throughput (884.25x vs 762.78x).

Oracle measurements are physically plausible and consistent with a real cut: mediabunny's output is `outDurationSec:6.08` vs `requestedDurationSec:6` (`durationDeltaSec:0.08`), ffmpeg.wasm's is `outDurationSec:6.016` (`durationDeltaSec:0.016`) — both well inside the 0.5 s tolerance, both keyframe-snapped copy results (the small positive deltas are the leading/trailing partial-GOP frames you expect from a copy-trim, not a re-timed exact cut). Both also passed `playback-smoke` (a `<video>` element decoded a few frames of the output). ffmpeg.wasm's duration delta is actually tighter (0.016 vs 0.08 s), but the gate is duration-within-tolerance only and boundary-frame digests are skipped on both (`boundaryFrameComparisons:0`), so this does not constitute superior measured correctness — it is below the gate's resolution. Correctness is therefore a wash and performance decides.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, runner-up): Correct and a real stream copy, but lost on performance — 1.16x slower wall, 1.16x lower throughput, and 2.93x more main-thread blocking (12909 ms longtasks), driven by its whole-file `arrayBuffer()`→MEMFS materialization (adapter.ts:1855-1856) versus mediabunny's UrlSource range-reads. Single-thread wasm core, no hardware codec, vs mediabunny's hardware WebCodecs (tiebreaker also favors mediabunny).
- **web-demuxer@4.0.0**: NA_ENGINE — `engine does not declare operation 'trim'`. Honest NA: web-demuxer is a demux-only library, no mux/trim path.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — `engine does not declare operation 'trim'`. Honest NA: its adapter does not register a `trim` op.
- **platform@chrome-149**: NA_ENGINE — `engine does not declare operation 'trim'`. Honest NA: the raw-platform baseline exposes WebCodecs decode/encode primitives, not a packaged trim operation.
- **mp4box@2.3.0**: NA_ENGINE — `engine does not declare operation 'trim'`. Honest NA: mp4box is a box parser/segmenter, no trim op declared.
- **remotion-media-parser@4.0.479**: NA_ENGINE — `engine does not declare operation 'trim'`. Honest NA: a parser, not a transformer.

## Anti-cheat validation

- Scenario definition: src/scenarios/trim/index.ts:626-641 (`id:'huge_h264_mov_copy_peakmem'`), composed via `buildTrim` at index.ts:669 (`op:'trim'`, `input: c.asset`, `range:{startUs,endUs}`).
- Fixture: `asset:'huge_h264_1080p_600s.mov'` → `fixtures/media/huge_h264_1080p_600s.mov`, **exists, 448 MB** (verified via stat). Real H.264/AAC MOV, not synthetic/empty/mock. Mid-file 300s..306s cut on a genuine huge asset, matching the notes' "big-read" / OOM-resistance rationale.
- Winner adapter: src/engines/mediabunny/adapter.ts:1445-1500 (`trim`). Genuine implementation — opens a real `MediaInput`, builds a real mediabunny `Conversion` with `trim:{start,end}` and `runConversion`. It does NOT hardcode output, does NOT copy input→output to fake a cut (the no-op identity path at adapter.ts:1468-1477 only fires for `range.startUs≈0` AND `isNoopTrim`, which a 300s start cannot satisfy), and does NOT short-circuit to a golden. Errors are thrown, not swallowed.
- Gating oracle: src/core/oracles.ts:2348-2435 (`trimBoundaries`). It performs a real check: probes the produced output's duration via the reference engine / decoded-frame pts span and compares to the requested range with the scenario tolerance (oracles.ts:2388-2400). The measurements (`outDurationSec` 6.08 / 6.016 vs `requestedDurationSec` 6) are physically plausible for a real copy-trim.
- Verdict: **WEAK-GATE**. The PASS is real (real 448 MB fixture, real Conversion trim, real duration comparison, plausible numbers), but the gate is a duration-proxy within a loose 0.5 s tolerance with **boundary-frame digest comparison disabled** (`boundaryFrameComparisons:0`, oracles.ts:2405-2431 deliberately skips digests because only source-prefix golden is baked, not a trim-range golden) and `playback-smoke` is smoke-only. There is no bit-exact / frame-exact correctness check on the cut content. Additionally the named `primaryMetric` (peakMemory) and `sourceReads` — the entire point of this rung — were NOT captured (`n==0`), so the headline OOM/lazy-read story is unmeasured and the win rests on secondary wall/throughput/longtasks numbers.
- Cached note: **both PASS results have `cached:true`** (`reason:"cached previous PASS result"`). The winning evidence was reused, not re-run this session — staleness risk applies to both engines equally; the relative margin should be re-confirmed on a fresh run, especially given peakMemory was never recorded.

## Confidence & caveats

- Confidence: **medium**. The winner choice is robust on every captured metric (mediabunny leads wall, throughput, and longtasks simultaneously) and the architectural argument (lazy range-read vs whole-file MEMFS buffering) directly aligns with the scenario's intent. But three caveats temper it: (1) the named primaryMetric `peakMemory` and `sourceReads` are empty (n==0), so the decisive metric for this rung is missing; (2) every bench metric is single-sample (n==1, mad=0, p95==median) — no variance estimate; (3) both results are cached. Correctness is a genuine tie below the gate's resolution, so the verdict is a performance decision on incomplete instrumentation. If peakMemory were captured, the result would likely strengthen (mediabunny's range-reads should beat ffmpeg.wasm's full-file load), but that is an inference, not a measured fact here.
