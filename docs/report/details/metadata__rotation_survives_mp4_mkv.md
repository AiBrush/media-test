# metadata/rotation_survives_mp4_mkv

- **family:** metadata
- **fixture asset(s):** `fixtures/media/h264_rotated90.mp4` (4.4 MB, H.264 video + AAC audio, 90° display matrix); golden = `fixtures/golden/h264_rotated90.mp4.frames.json` (12 baked, rotation-applied frame digests)
- **operation:** `remux` mp4 → mkv, gated by metamorphic invariant `decode(remux(x)) == decode(x)`
- **primaryMetric:** wall (no scenario override; metrics = `['wall','peakMemory','longtasks']`)
- **passCount:** 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES — two engines PASS with *identical correctness* (both satisfy `property-invariant` with 12/12 bit-exact decoded frames, 0 mismatches).
- **Decisive factor:** PERFORMANCE on the primary metric (wall). Correctness is a tie, so the wall-clock and long-task margins decide.
- **Margin over runner-up (mediabunny):** **2.52x faster wall** (63.10 ms vs 158.74 ms), **3.26x fewer long-task ms** (1182 ms vs 3856 ms). Mediabunny *wins* peak memory (45.2 MB vs 89.9 MB → ffmpeg uses **1.99x more memory**), but memory is the tertiary metric and does not override a 2.5x wall lead. Evidence strength is weak: every metric is **n=1, mad=0**, and **both winners are cached** (re-used, not re-run this batch).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | property-invariant:pass | 63.10 ms | n/a | 89,883,725 B (89.9 MB) | 1182 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass | 158.74 ms | n/a | 45,160,308 B (45.2 MB) | 3856 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

No `throughputRealtime` is recorded in the shard for either engine (bench carries only wall/peakMemory/longtasks).

## Why the winner wins (deep technical)

The operation is a pure container **rewrap** of H.264 video + AAC audio from MP4 (ISO-BMFF) to MKV (Matroska), where the one thing that must survive is the **90° display/rotation matrix**. In MP4 the rotation lives in the `tkhd` track-header transform matrix; remuxing to MKV must carry it forward (Matroska stores it as a video `ProjectionPoseRoll` / track flag the decoder applies). The oracle (`oracles.ts:2686-2707`, the `decode-remux` branch of `propertyInvariant`) does NOT inspect the matrix field directly — it decodes the produced MKV with the platform decoder (`ctx.decodeWithPlatform`) and digest-compares the resulting RGBA frames against the golden frames, which the reference decoder baked **rotation-applied**. An engine that dropped or garbled the matrix during the rewrap would decode unrotated (or wrongly-oriented) pixels and mismatch. Both PASS engines produced **12/12 bit-exact frames (mismatchedFrames: 0)**, so the rotation matrix survived the MP4→MKV transition in both.

**ffmpeg-wasm's path** (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`): it runs the native FFmpeg pipeline `-i <in> -map 0 -c copy <out>.mkv`. The `-c copy` is a true bitstream stream-copy — no decode, no re-encode — so the H.264 access units and AAC frames are repackaged verbatim and FFmpeg's Matroska muxer translates the source `tkhd` rotation into the MKV track header automatically. Because there is no transcode, the wall cost is just demux + remux of a 4.4 MB file inside the wasm core: **63.10 ms**. The `-map 0` is the load-bearing detail (line 2044) — it forces all input streams (video + AAC) into the output rather than FFmpeg's default one-stream-per-type selection. This is a single, tight C-level loop in the wasm core, which is why it incurs only **1182 ms** of long-task time despite running single-threaded wasm (`backend: 'wasm'`, no SharedArrayBuffer / COOP-COEP requirement on this build path).

**Why ffmpeg-wasm beats mediabunny here:** mediabunny (`src/engines/mediabunny/adapter.ts:1244-1260`) performs the rewrap through its `Output` + `runConversion` machinery with a `MkvOutputFormat` (`src/engines/mediabunny/codecs.ts:168-169`) under the **WebCodecs** backend (`configUsed.backend: 'webcodecs'`, `pixelBackend: VideoSample.copyTo(RGBA)>canvas`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`). Even though mediabunny's conversion can stream-copy compatible tracks, its streaming-lockstep conversion harness and WebCodecs/canvas plumbing carry more per-frame JS/event-loop overhead than FFmpeg's monolithic native loop — reflected in **2.52x higher wall (158.74 ms)** and **3.26x more long-task time (3856 ms)**, the latter being the more damaging number for main-thread responsiveness. Mediabunny's compensating win is **peak memory: 45.2 MB vs ffmpeg's 89.9 MB** — the FFmpeg wasm core pre-allocates a large MEMFS/heap to materialize the whole input file (`writeInput` buffers the full 4.4 MB into MEMFS, and the wasm linear-memory heap is sized generously), whereas mediabunny streams. But peak memory is the tertiary metric and a sub-2x memory penalty does not offset a 2.5x speed advantage on the primary (wall) metric.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (property-invariant 12/12 bit-exact) but LOST on performance: wall 158.74 ms vs 63.10 ms (2.52x slower) and longtasks 3856 ms vs 1182 ms (3.26x worse). Its only edge (peak memory 45.2 MB vs 89.9 MB) is on the lowest-priority metric. WebCodecs + streaming-lockstep conversion overhead is the gap.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare output container 'mkv'". Honest NA — MP4Box.js is an ISO-BMFF (MP4) library and genuinely has no Matroska muxer; declaring mkv-out would be a false capability.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare output container 'mkv'". Honest NA — its converter does not emit a Matroska container.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest NA — web-demuxer is a read/demux-only library, no write/remux path.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest NA — it is a parser (read-only), not a muxer.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest NA — the raw browser platform (WebCodecs + MSE) exposes no remux/muxing-to-container primitive; remux would require a userland muxer.

All five NAs are genuine capability gaps, not under-declarations: none of these libraries can both `remux` AND emit `mkv`.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/metadata/rotation-tracks.ts:87-104` (`ROTATION_PROPERTY` → `id: 'rotation_survives_mp4_mkv'`, `invariant: DECODE_REMUX`, `input: 'h264_rotated90.mp4'`, from `mp4` to `mkv`). Built via `buildProperty` (`src/scenarios/metadata/_shared.ts:176-196`) → `op:'remux'`, `oracles:['property-invariant']`, options `{container:'mkv', invariant:'decode(remux(x))==decode(x)'}`.
- **Fixture exists & is real:** `fixtures/media/h264_rotated90.mp4` = 4.4 MB real H.264/AAC asset (verified via `ls`/`stat`). Golden frames present: `fixtures/golden/h264_rotated90.mp4.frames.json` (3.2 KB, 12 digests). Not synthetic/empty/mock.
- **Oracle:** `src/core/oracles.ts:2645` (`propertyInvariant`) → decode-remux branch `2686-2707`. It decodes the *produced output* (`ctx.decodeWithPlatform(ctx.output, {maxFrames: want.length})`) and bit-exact digest-compares to golden frames; if no golden frames it FAILs (`2691-2694`). This is a real bit-exact comparison, not a wide tolerance and not smoke-only. Measurements `{measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0}` are physically plausible for a short rotated clip.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — genuine `ffmpeg -i <in> -map 0 -c copy <out>.mkv` stream-copy via the real ffmpeg.wasm core. No canned output, no input→output passthrough faking a transcode, no short-circuit to golden, no swallowed errors (run() awaited, output read back from MEMFS). Container compatibility asserted at `2040`.
- **Verdict:** **REAL** — real fixture, real ffmpeg.wasm stream-copy implementation, and a bit-exact decode-equality oracle that decodes the actual remux output and would fail on a dropped rotation matrix.
- **Cached note:** Winner result has `cached:true` ("cached previous PASS result"), as does mediabunny. Both metrics rows are re-used from a prior run (n=1, mad=0). The PASS verdicts are real but the *performance numbers* carry staleness risk and single-sample noise — the 2.5x wall gap is large enough to be robust to that noise, but a fresh re-run would strengthen confidence.

## Confidence & caveats

- **Confidence: medium.** Correctness ordering is unambiguous (both PASS, both 12/12 bit-exact — a true tie). The winner choice rests entirely on performance, where ffmpeg-wasm's 2.52x wall and 3.26x long-task leads are decisive on the primary metric.
- Caveats: (1) both winners are `cached`, so timings were not re-measured this batch; (2) **n=1** for every metric (mad=0, p95=median) — single-sample evidence, weaker than a multi-run median; (3) mediabunny holds a real 1.99x peak-memory advantage, so on a memory-constrained target the ranking could legitimately flip — the win is metric-policy-dependent (wall-primary), not absolute; (4) no `throughputRealtime` recorded, so the realtime-throughput tiebreaker could not be applied.
