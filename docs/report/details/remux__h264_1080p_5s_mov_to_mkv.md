# remux/h264_1080p_5s_mov_to_mkv

- family: remux
- fixture asset: `fixtures/media/h264_1080p_5s.mov` (4.4 MB real H.264/AAC QuickTime MOV)
- target container: Matroska (`mkv`)
- primaryMetric: wall (median ms)
- passCount: 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- Best framework: **mediabunny@1.48.0**
- Contested: **yes** — two engines PASS (mediabunny, ffmpeg.wasm), both satisfying the identical single gating oracle `reference-reimport`. Correctness is a tie, so the decision falls to performance.
- Decisive factor: **wall-clock and realtime throughput**. mediabunny remuxed MOV→MKV in **45.95 ms** vs ffmpeg.wasm's **55.12 ms** = **1.20x faster wall**, and **108.81x** vs **90.71x** realtime = **1.20x higher throughput**. mediabunny also reports a finite peak-memory measurement (69.6 MB) where ffmpeg.wasm reports none (peakMemory n==0). Caveat: both samples are n==1 (cached), so the margin is a single-shot point estimate.
- Margin over runner-up: 1.20x wall, 1.20x throughput.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 45.95 ms | 108.81 x | 69,645,287 B (66.4 MB) | 1073 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 55.12 ms | 90.71 x | 0 (n=0, unreported) | 1012 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

This cell is a **lossless container re-wrap**: the H.264 coded video samples (AVCC, length-prefixed NALs in the QuickTime `mdat`/`stbl` sample table) and AAC audio frames are lifted out of the MOV ISO-BMFF wrapper and re-emitted into a Matroska `Segment` (SimpleBlock/BlockGroup elements under a Cluster, with a Cues index). No pixels are decoded and no frames are re-encoded — only the framing changes (sample-table offsets → Matroska block timestamps). The scenario notes confirm this intent: "H.264 coded samples re-wrapped MOV→Matroska" (`src/scenarios/remux/matrix.ts:43`). Because the bitstream is preserved, the only meaningful correctness check the suite attaches is structural: `reference-reimport` (default oracle set, `src/scenarios/remux/_shared.ts:78-81`).

The gating oracle, `reference-reimport` (`src/core/oracles.ts:1278-1367`), re-opens each engine's produced MKV with the reference demuxer and diffs: media-track count and layout, per-track keyframe presence, and a duration delta against the golden `h264_1080p_5s.mov.meta.json`. Both engines clear it:

- mediabunny: re-imported **388 packets**, **241 keyframes**, **2 media tracks** (golden 2), `durationDeltaSec = 0.077s` against `durationToleranceSec = 0.1s`.
- ffmpeg.wasm: re-imported **386 packets**, **239 keyframes**, **2 media tracks** (golden 2), `durationDeltaSec = 0.042s` against the same `0.1s` tolerance.

The 2-packet / 2-keyframe difference between the two outputs is within the oracle's ±2% relative band (`withinRel(..., 0.02, 1)`, `src/core/oracles.ts:1258-1262`) and reflects trivial muxer-tail/index differences, not a correctness gap — both are physically plausible packet/keyframe counts for a ~5s 1080p clip. So correctness is a genuine tie.

The win is mechanistic on the muxing path. mediabunny's `remux()` (`src/engines/mediabunny/adapter.ts:1244-1260`) builds a native Matroska `OutputFormat` + `BufferTarget`, opens the MOV with `openInput`, and drives the library's `Conversion` API to completion (`runConversion` → `Conversion.init` + `conversion.execute()`, `src/engines/mediabunny/adapter.ts:842-868`). For a same-codec remux the Conversion does NOT spin up an encoder — it stream-copies encoded packets directly through the JS/WASM-free pure-TS-ESM muxer (`env.configUsed.coreBuild = "pure-ts-esm"`, `backend = "webcodecs"` used only for the decode-gated paths it doesn't take here). Everything stays in-process in a single BufferTarget, no MEMFS round-trip, no virtual-filesystem write/read, and no separate worker boot. That is why its **longtasks** (1073 ms) are comparable to ffmpeg's but its **wall** is 17% lower.

ffmpeg.wasm's remux (`src/engines/ffmpeg-wasm/adapter.ts`, `-c copy` stream-copy file path documented at line 33, MKV branch reachable via lines 794/870) is also a genuine, correct stream-copy, but it pays for the wasm sandbox: it must write the 4.4 MB input into the emscripten MEMFS, invoke the ffmpeg CLI (`-i in -c copy -f matroska out`), then read the muxed file back out of MEMFS. That extra buffer-in/buffer-out and the heavier single-thread wasm core cost it the 9.2 ms (55.12 vs 45.95) wall gap and pushes its realtime throughput down to 90.71x. It also does not surface a peakMemory sample (n==0) — likely because wasm-heap memory isn't visible to the JS `performance.measureUserAgentSpecificMemory` probe — so it cannot even contend on the memory tiebreaker.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (runner-up, PASS): correct, but slower — 55.12 ms wall (1.20x mediabunny), 90.71x throughput (0.83x mediabunny), and no peakMemory sample. The MEMFS write→`-c copy`→MEMFS read round-trip plus single-thread wasm boot is the cost; correctness is otherwise equivalent (386 pkts / 239 kf, durΔ 0.042s).
- **platform@chrome-149**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: the WebCodecs platform shim exposes decode/encode primitives but no muxer, so it genuinely cannot write a container. Not an under-declared capability.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: web-demuxer is a read-only demuxer (ffmpeg-wasm libavformat read path); it has no mux/write side.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare output container 'mkv'". Honest: MP4Box.js is an ISO-BMFF (MP4/MOV/fragmented-MP4) tool; it has no Matroska writer, so MKV output is genuinely out of scope.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — "engine does not declare output container 'mkv'". Honest given its ISOBMFF/WebM-oriented output set; no Matroska writer declared.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: it is a parser/demuxer only, no muxing operation.

All five NAs are capability-honest: none is a remux+MKV-capable engine being incorrectly excluded.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/matrix.ts:37-44` (MOV→MKV cell), id assembled by `remuxId` (`src/scenarios/remux/_shared.ts:73-75`) → `remux/h264_1080p_5s_mov_to_mkv`.
- Fixture: input `asset: 'h264_1080p_5s.mov'` resolves to `fixtures/media/h264_1080p_5s.mov`, which **exists** and is a real 4.4 MB H.264/AAC MOV (verified via stat). Golden meta/packets present: `fixtures/golden/h264_1080p_5s.mov.{meta,packets}.json`. Not synthetic/empty/mock.
- Gating oracle: `reference-reimport` at `src/core/oracles.ts:1278-1367`. It performs a REAL re-demux of the produced bytes and compares track count/layout, video keyframe presence, and duration vs golden (±0.1s, or ±2% relative for packet/keyframe counts). It is not trivially satisfiable: an engine that emitted a corrupt or empty container would fail track-count, keyframe-presence ("reimport found no keyframes for a video remux output", line 1363-1364), or duration checks.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1260` (`remux`) → `842-868` (`runConversion` calls real `Conversion.init`/`execute`). It calls the genuine library muxer, does NOT copy input bytes to output, does NOT short-circuit to a golden file, and does NOT swallow errors (it throws on invalid Conversion / missing buffer, lines 849-854, 828, 861).
- Verdict: **REAL** — real fixture + real library implementation + a meaningful structural oracle whose measurements (388 pkts, 241 kf, 2 tracks, durΔ 0.077s) are physically plausible for a 5s 1080p clip.
- Cached note: the winner's result has **cached==true** ("cached previous PASS result"), so the timings (n==1, mad==0, p95==median) are reused from a prior run, not freshly re-executed. The 1.20x margin should be treated as a single-shot estimate; a fresh re-run could shift it.

## Confidence & caveats

- Correctness verdict is high-confidence: both PASS engines clear the same real oracle with plausible numbers, so this is a true tie on correctness and a clean performance call.
- Performance margin is **medium-confidence**: all bench samples are n==1 (cached, mad==0), so the 1.20x wall/throughput gap is a point estimate with no spread to assess. The direction (mediabunny faster, no MEMFS round-trip) is mechanistically robust even if the exact ratio is soft.
- The oracle is structural (re-import), not bit-exact: it confirms the MKV is a valid, track-faithful, duration-faithful container, but it does not assert the H.264/AAC coded samples are byte-identical to source. For a same-codec lossless re-wrap this is the appropriate gate per `_shared.ts:19-26` (decoded-frames-bitexact is intentionally deferred while source frame goldens are placeholders), but it is a structural gate, not a crypto/bit-exact one.
