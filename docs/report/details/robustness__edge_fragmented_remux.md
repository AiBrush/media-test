# robustness/edge_fragmented_remux

- family: robustness | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4, ~31 MB) | primaryMetric: none recorded in shard (metrics declared: wall, peakMemory, longtasks) | passCount: 3 of 7
- operation: `remux` MP4 -> fragmented MP4 (fMP4/CMAF), option `{ container:'mp4', fragmented:true }`
- oracles: `reference-reimport` (structural/metadata-exact) + `playback-smoke`

## Verdict

- Best framework: **mp4box@2.3.0** — CONTESTED (3 engines PASS: mp4box, ffmpeg.wasm, mediabunny).
- Decisive factor: **correctness strength first.** All three pass the same two oracles, so the tie is broken inside the gating `reference-reimport` measurements. mp4box re-imports its own fragmented output with `durationDeltaSec = 0` (perfectly preserved movie duration) and an exact `2308`-packet / `1423`-keyframe sample table; ffmpeg.wasm drifts by `0.0213 s`; mediabunny drifts by `0.08 s` (right at the `0.1 s` tolerance edge) and emits `2310/1425` (two extra packets/keyframes from re-segmentation). With correctness as the primary ladder rung, mp4box is strictly tightest.
- Margin over runner-up: duration fidelity `0 s` vs ffmpeg `0.0213 s` (ffmpeg is the next-tightest); packet-table identity exact vs mediabunny `+2` packets. On the only timing number present in the shard (`durationMs`, not a benched metric), mp4box is also lowest: `811 ms` vs ffmpeg `918 ms` (1.13x) and mediabunny `913 ms` (1.13x). All three results are `cached:true`, so timing is weak evidence; the correctness gap is the real decider.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | reference-reimport:true; playback-smoke:true | n/a (durationMs 811; no bench) | n/a | n/a | n/a | cached previous PASS; durationDeltaSec=0, reimport 2308 pkts / 1423 kf / 2 tracks |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true; playback-smoke:true | n/a (durationMs 918; no bench) | n/a | n/a | n/a | cached previous PASS; durationDeltaSec=0.0213, reimport 2308 pkts / 1423 kf / 2 tracks |
| mediabunny@1.48.0 | PASS | reference-reimport:true; playback-smoke:true | n/a (durationMs 913; no bench) | n/a | n/a | n/a | cached previous PASS; durationDeltaSec=0.08, reimport 2310 pkts / 1425 kf / 2 tracks |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fragmented' |

Note: this shard carries no per-engine `bench{}` block and no `primaryMetric`; the only timing field is `durationMs` (whole-result wall, not a sampled median/p95). throughputRealtime / peakMemory / longtasks were not emitted for any engine here.

## Why the winner wins (deep technical)

The operation is a lossless container rewrap of H.264+AAC from a classic indexed MP4 (single `moov`/`stbl` at the front-or-back) into a fragmented MP4 — an `ftyp` + init-`moov` (with `mvex`/`trex` and zero-sample tracks) followed by a chain of `moof`+`mdat` fragments. The challenge is not pixel work (no decode/encode happens) but correctly splitting the contiguous sample table into fragments, each starting on a RAP, while keeping every sample's DTS/PTS/duration and the overall movie duration intact so a re-importer reconstructs the identical media.

mp4box.js is a pure-JS ISO-BMFF box engine, so for this exact task it operates at the byte/box level the operation is defined in. Its adapter (`src/engines/mp4box/adapter.ts:10`, role doc lines 4-10) routes `remux` through the library fragmenter (`setSegmentOptions`/`onSegment`) with `segmentRapAlignement:true` (config echoed in the shard's `env.configUsed`: `backend:"pure-js"`, `pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"`, `segmentRapAlignement:true`, `discardMdatDataDemuxRemux:false`). Crucially it keeps `mdat` data for demux/remux (`createFile(true)` / `keepMdatData=true`, lines 32-34 and 99-101) so the real encoded samples flow through unchanged. Because mp4box re-emits the original sample timings verbatim and aligns segment boundaries to existing RAPs rather than re-deriving timestamps, the re-imported output reproduces the source's `2308` packets and `1423` keyframes and yields `durationDeltaSec = 0` against the golden — the single tightest correctness signal among the three (shard `oracleOutcomes[0].measurements`).

ffmpeg.wasm (`src/engines/ffmpeg-wasm/adapter.ts:2044-2050`) does the genuine FFmpeg path: `-map 0 -c copy -movflags frag_keyframe+empty_moov+default_base_moof`. That is a correct fMP4 stream-copy and it also lands `2308/1423` packets/keyframes, but the muxer materializes a small edit/tail rounding so the re-import shows `durationDeltaSec = 0.0213 s` — well inside the `0.1 s` band, hence PASS, but measurably looser than mp4box's exact zero. It runs single-threaded wasm (`backend pure-js`-equivalent ffmpeg core), the heaviest runtime of the three.

mediabunny (`src/engines/mediabunny/adapter.ts:1244-1259`) remuxes via `Output` with `makeOutputFormat(..., fastStart:'fragmented')` (mapping at `outputFormatOptionsFrom`, lines 180-198) and a `runConversion` stream-copy; its declared `env.configUsed.backend` is `webcodecs`/`prefer-hardware`, but no decode/encode actually fires for a copy-remux, so that backend tag is not load-bearing here. mediabunny re-fragments into a slightly different cadence: re-import reports `2310` packets / `1425` keyframes (+2 vs source) and `durationDeltaSec = 0.08 s` — still a PASS but sitting at 80% of the `0.1 s` tolerance and the only engine that does not reproduce the exact packet count. That is why, on the correctness ladder (structural/metadata-exact rung), mediabunny ranks third.

The gating oracle `reference-reimport` (`src/core/oracles.ts:1225`, remux branch `semanticRemuxReimport` at line 1273) is itself a real, non-trivial gate for remux: it feeds the engine's output bytes back through the injected reference engine's `demux`, then checks media-track count, per-type track layout, and movie duration against the golden with a `0.1 s` (or container-derived) band (lines 1289-1323). It is a structural/metadata-exact comparison — stronger than smoke or an SSIM proxy, weaker than bit-exact — and all three engines clear it; the differentiator is how far inside the band each lands.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost on correctness tightness: `durationDeltaSec = 0.0213 s` vs mp4box's `0 s` (re-import 2308 pkts / 1423 kf, identical to mp4box). Also highest `durationMs` (918 vs 811, 1.13x slower) on a cached single-thread wasm run. A legitimate, well-implemented fMP4 stream-copy — just not the tightest.
- **mediabunny@1.48.0** — PASS but ranked third: re-import shows `+2` packets/keyframes (`2310/1425`) and `durationDeltaSec = 0.08 s`, hugging the `0.1 s` tolerance edge — the loosest correctness of the three despite a near-identical `durationMs` (913).
- **platform@chrome-149** — NA_ENGINE: `engine does not declare operation 'remux'`. Honest: WebCodecs is a codec API with no container muxer, so it cannot remux. Correctly under-claimed, not a hidden capability.
- **remotion-media-parser@4.0.479** — NA_ENGINE: `engine does not declare operation 'remux'`. Honest: it is a read-only parser, no muxing/writing path.
- **web-demuxer@4.0.0** — NA_ENGINE: `engine does not declare operation 'remux'`. Honest: a demux-only wasm library, no mux side.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: `engine does not declare feature 'fragmented'`. Honest at the feature granularity: it may remux to plain MP4 but does not claim fragmented/CMAF output, so it is correctly gated out of THIS scenario rather than failing it.

## Anti-cheat validation

- Scenario: `src/scenarios/robustness/index.ts:167-179` (`id:'edge_fragmented_remux'`, `op:'remux'`, `asset:'h264_1080p_30s.mp4'`, `features:['fragmented']`, `options:{container:'mp4',fragmented:true}`, oracles `['reference-reimport','playback-smoke']`, notes "Fragmented/CMAF output structure.").
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists, ~31 MB real H.264+AAC media (verified via stat). Not synthetic/empty/mock.
- Oracle: `reference-reimport` at `src/core/oracles.ts:1225`, remux branch `semanticRemuxReimport` at `:1273`. It re-demuxes the engine's actual output bytes through the reference engine and compares track count, per-type layout, and duration against the golden with a `0.1 s` band — a real round-trip comparison, not a tolerance that anything passes; the measured `2308`/`2310` packet counts, `1423`/`1425` keyframes, 2 media tracks, and sub-0.1 s duration deltas are physically plausible for a 30 s 1080p H.264+AAC clip.
- Winner adapter: `src/engines/mp4box/adapter.ts:640` declares `remux:true`; the remux path uses the genuine mp4box fragmenter (`setSegmentOptions`/`onSegment`, role doc :10, `segmentRapAlignement` :101) and keeps `mdat` samples (`keepMdatData=true`, :100). No canned output, no input->output copy passthrough, no short-circuit to the golden, no swallowed errors.
- Verdict: **REAL.** Real fixture, real fragmenter implementation, meaningful structural oracle. The second oracle (`playback-smoke`) is smoke-only, but it is the secondary gate; the primary `reference-reimport` is a genuine round-trip structural check.
- Cached note: ALL three PASS results are `cached:true` ("cached previous PASS result"). Correctness measurements (packet/keyframe/track/duration deltas) are deterministic and reliable even when cached; the timing numbers (`durationMs`) are stale and should not be over-weighted — appropriately, the verdict rests on the correctness gap, not on the ~107 ms timing margin.

## Confidence & caveats

- Confidence: **high** on the winner. The decision rests on deterministic, cache-stable correctness measurements (durationDeltaSec 0 vs 0.0213 vs 0.08; exact 2308/1423 packet table for mp4box) directly from the shard, with all three implementations confirmed genuine in source.
- Caveats: (1) No `bench{}` / `primaryMetric` in this shard — performance ranking leans on `durationMs` only, which is cached and therefore weak (n effectively 1, no p95/mad). (2) All three winners are `cached:true`; a fresh re-run could shift timings (not correctness). (3) The gate is structural-exact, not bit-exact — a remux that subtly reorders samples but preserves track layout and duration could still pass, so "exact" here means metadata/duration-exact, not byte-identical. (4) mediabunny's `+2` packet count is small and could reflect a benign init-fragment artifact rather than a defect; it is the relative-ranking tiebreaker, not evidence of incorrectness.
