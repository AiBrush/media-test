# trim/mov_keyframe_aligned

family: trim | fixture asset: `fixtures/media/h264_1080p_5s.mov` (4.4 MB, H.264/AVC video + AAC audio in QuickTime MOV) | primaryMetric: wall | passCount: 2 of 7

Operation: keyframe-aligned (non-frame-accurate) copy-trim of the QuickTime MOV, range `startUs=1_000_000 .. endUs=4_000_000` (requested 3.0 s), `durationToleranceSec = 1.1`, extra oracle set `PLAYABLE_AV = ['playback-smoke']`.

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`, backend `webcodecs`, `coreBuild=pure-ts-esm`, COOP/COEP not required).
- **CONTESTED**: 2 engines PASS — mediabunny and ffmpeg.wasm@0.12.15. The other 5 are NA_ENGINE (do not declare `trim`).
- Decisive factor: **correctness strength on the gating `trim-boundaries` oracle.** Both engines pass the same two oracles, so the tiebreak is the strictness of the measured boundary. mediabunny's output duration is 3.072 s (Δ = **0.072 s** from the requested 3.0 s); ffmpeg.wasm's output is 4.0107 s (Δ = **1.0107 s**), which clears the 1.1 s tolerance with only ~0.089 s of slack. mediabunny's trim is ~14x tighter on the duration boundary that the oracle actually measures.
- Margin over runner-up: correctness — mediabunny Δduration 0.072 s vs ffmpeg 1.0107 s (**14.0x tighter**, ffmpeg consumes 92% of the tolerance budget). Performance goes the other way: ffmpeg wall 42.73 ms vs mediabunny 425.78 ms (**~9.96x faster** wall for ffmpeg) and throughput 117x vs 11.74x realtime (**~9.96x**). Per the decision procedure correctness ranks above performance, so mediabunny wins; the performance loss is noted as the principal caveat.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 425.775 ms | 11.743x | 0 (not sampled) | 4223 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 42.735 ms | 117.000x | 0 (not sampled) | 19963 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

Note: `peakMemory` and `targetWrites` have n=0 samples for both engines (not measured this run); they are not usable tiebreakers here.

## Why the winner wins (deep technical)

The container is QuickTime MOV (`ftyp`/`moov` atom tree with `stbl` sample tables and potentially an `edts`/`elst` edit list), the video is H.264/AVC, audio is AAC. The scenario is a *keyframe-aligned* copy-trim (`frameAccurate:false`), so the expectation is a lossless stream copy of the GOP-aligned sample range — no re-encode — preserving the QT atom structure (scenario `notes`: "preserves the QT atom/edit-list structure").

mediabunny path: `src/engines/mediabunny/adapter.ts:1445` `trim()`. After rejecting bad ranges, it short-circuits the no-op identity case (`isNoopTrim`, adapter.ts:476/1468), then for the non-frame-accurate case first attempts an audio-only packet-copy trim (`tryAudioOnlyPacketCopyTrim`, adapter.ts:1480) which does not apply to this A/V MOV. It then builds a `Conversion` with `trim: { start: range.startUs/1e6, end: range.endUs/1e6 }` (adapter.ts:1485-1489) and runs it via `runConversion` (adapter.ts:842/1496). Because no `convOpts.video` codec is forced for a keyframe-aligned trim, mediabunny takes its "copy whenever possible" path — the Conversion stream-copies the encoded H.264/AAC packets rather than re-encoding (see adapter.ts:601-602 and the codec-copy notes around 29/669). Mediabunny resolves the trim window against the sample tables and trims with its own timestamp accounting, which is why the realized duration lands at 3.072 s — only 0.072 s over the 3.0 s request (a tail-GOP rounding of a couple of frames), matching `oracleOutcomes[0].measurements`: `outDurationSec=3.072`, `requestedDurationSec=3`, `durationDeltaSec=0.072`. The `env.configUsed` confirms `backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`, `sharedArrayBuffer:false` — it gets accurate trimming without needing cross-origin isolation or wasm threads. `playback-smoke` then confirms a real `<video>` element decoded and played frames of the produced MOV.

ffmpeg.wasm path: `src/engines/ffmpeg-wasm/adapter.ts:2538` `trim()`. For the keyframe-aligned branch it emits `-ss <start> -i in -map 0 -t <dur> -c copy` with `-ss` placed *before* `-i` (adapter.ts:2613-2627), the classic fast-seek-to-nearest-preceding-keyframe stream copy, plus `-avoid_negative_ts make_zero` and `-movflags +faststart` for the MOV (adapter.ts:2629-2631). This is genuine and correct, but input-side `-ss` snaps the cut to the keyframe at or before 1.0 s and the copy carries whole GOPs, so the realized output runs 4.0107 s — overshooting the 3.0 s request by 1.0107 s (`measurements.durationDeltaSec=1.0107`). That still passes because the oracle tolerance is 1.1 s, but it eats 92% of the budget. ffmpeg pays for that copy with a 19,963 ms longtask spike (single-thread wasm core, `wasmThreads` per its config) even though wall is only 42.74 ms median over n=1 — the long-task figure reflects the wasm/MEMFS warmup and demux/mux work blocking the main thread.

Why mediabunny wins the tiebreak: both pass `trim-boundaries` and `playback-smoke`, so correctness *count* is equal, but the ladder also rewards "tighter measured tolerances." The oracle's live gate is the duration delta (boundary-frame digest is skipped for both — see below), and mediabunny's 0.072 s is 14x closer to the request than ffmpeg's 1.0107 s. A correct keyframe-aligned trim should land near the requested 3.0 s span; ffmpeg's near-1-second overshoot means its cut is materially looser even though both are technically "within tolerance." Correctness outranks performance in the decision procedure, so mediabunny is the winner despite ffmpeg's ~10x raw-speed advantage.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost on correctness): same two oracles passed, but `trim-boundaries` measured `durationDeltaSec=1.0107 s` vs mediabunny's `0.072 s` — a 14x looser realized cut that consumes 92% of the 1.1 s tolerance. Its input-side `-ss ... -c copy` snaps to a preceding keyframe and carries full trailing GOPs (adapter.ts:2613-2627), so the trim is much less duration-accurate. It is ~9.96x faster on wall (42.74 ms vs 425.78 ms) but also incurs a 19,963 ms longtask (vs 4,223 ms), and performance is subordinate to correctness here.
- **platform@chrome-149**: NA_ENGINE — "engine does not declare operation 'trim'." Honest NA: the platform/WebCodecs adapter has no container-level trim/remux op (WebCodecs is codec-only, no MP4/MOV muxer), so it cannot perform a copy-trim.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "does not declare operation 'trim'." Honest NA: it is a parser/demuxer, no muxing/trim output capability.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — "does not declare operation 'trim'." Honest NA for this scenario as adapted (no trim op declared).
- **mp4box@2.3.0**: NA_ENGINE — "does not declare operation 'trim'." Honest NA: MP4Box.js parses/segments MP4 but the adapter does not expose a trim operation.
- **web-demuxer@4.0.0**: NA_ENGINE — "does not declare operation 'trim'." Honest NA: demux-only library, no trim/mux output.

All five NAs are honest capability gaps (parsers/demuxers/codec-only runtimes), not under-declared trim support.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:268` (`id: 'mov_keyframe_aligned'`), asset `h264_1080p_5s.mov`, container `mov`, video `h264`, audio `aac`, `startUs=1_000_000`, `endUs=4_000_000`, `frameAccurate:false`, `tolerances.durationToleranceSec=1.1`, `extraOracles=PLAYABLE_AV` (index.ts:125 → `['playback-smoke']`).
- Fixture exists and is real: `fixtures/media/h264_1080p_5s.mov` present, 4.4 MB — a genuine H.264/AAC QuickTime file, not synthetic/empty/mock.
- Gating oracle: `trim-boundaries` at `src/core/oracles.ts:2346-2435`. It computes output duration via a reference-engine probe or a decoded frame-pts span proxy (oracles.ts:2360-2386) and fails when `|outDuration − requested| > durationToleranceSec` (oracles.ts:2394-2400). This is a real measured comparison against the requested range, not trivially satisfiable for an arbitrary output. The supporting oracle `playback-smoke` (oracles.ts:1572) requires a real `<video>` to decode and play frames of the produced file.
- Boundary-frame digest caveat: for BOTH engines the per-frame boundary digest was skipped — detail "boundary frame digest skipped (loaded golden is source-prefix, not trim-range golden)", `boundaryFrameComparisons=0` (oracles.ts:2405-2431). The golden loaded is the full-source prefix, not a trim-range golden, so the strongest part of the oracle (start/end frame SHA-256 match) was not exercised. The live gate is therefore duration-only — a structural/metadata-exact check on duration, not a bit-exact frame check. This makes the gate meaningfully real but not maximally strict; ffmpeg's 1.0107 s pass in particular relies on the loose 1.1 s tolerance.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445-1500` — genuinely calls mediabunny's `Conversion.init/execute` with a real `trim` window (adapter.ts:1485-1489, runConversion at 842) and `BufferTarget`; no canned output, no input→output passthrough (the no-op path at 1468 only triggers when start≈0 and end≈duration, which is not this range), no golden short-circuit, no swallowed errors (it throws on bad ranges and missing format).
- Measurements are physically plausible: 3.072 s output for a 3.0 s request on a 5 s source, 11.74x realtime throughput, 425.78 ms wall — all consistent with a real WebCodecs-backed copy-trim of a 4.4 MB MOV.
- Cached note: BOTH PASS results have `cached:true` ("cached previous PASS result"). The numbers were reused, not re-run this session, so there is staleness risk (per the launcher seeding caveat). The verdict stands on the cached evidence but should be re-validated with a fresh run if precision matters.
- Verdict: **WEAK-GATE.** Real fixture + real mediabunny Conversion implementation + a real (duration) oracle, but the strongest check (boundary-frame SHA-256) was skipped (`boundaryFrameComparisons=0`) and the duration tolerance is wide (1.1 s) — wide enough that ffmpeg's 1.0107 s overshoot also passes. The PASS is genuine but the gate is loose; mediabunny still clearly wins on the one number the gate does measure.

## Confidence & caveats

- Confidence: **medium.** The winner choice is well-supported (mediabunny is 14x tighter on the only live oracle measurement and uses a verified real copy-trim path), but three caveats temper it: (1) both results are `cached:true` (staleness risk); (2) bench is n=1 with mad=0 for both — single-sample timing, so the ~10x performance figures are weak evidence and not the deciding factor anyway; (3) the gate is WEAK (duration-only, 1.1 s tolerance, no boundary-frame digest). If raw throughput were the priority, ffmpeg.wasm's ~9.96x faster wall and 117x realtime would make it the pick — the decision hinges on the procedure's correctness-over-performance ordering. peakMemory/targetWrites were not sampled (n=0), so memory could not be used as a tiebreaker.
