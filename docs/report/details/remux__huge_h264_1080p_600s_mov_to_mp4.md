# remux/huge_h264_1080p_600s_mov_to_mp4

family: remux | fixture asset: `huge_h264_1080p_600s.mov` (448 MB, real file in fixtures/media/) | primaryMetric: throughputRealtime | passCount: 4

## Verdict

- Best framework: **remotion-webcodecs@4.0.479** (CONTESTED — 4 of 7 engines PASS).
- Decisive factor: **performance** (correctness is identical across all four passers — they all clear the single `reference-reimport` structural gate). remotion-webcodecs wins on every perf axis.
- Margin over runner-up (mp4box@2.3.0):
  - throughputRealtime **1416.87 vs 364.79 x-realtime = 3.88x higher** (the primary metric)
  - wall median **423.47 ms vs 1644.78 ms = 3.88x faster**
  - peakMemory **922.4 MB vs 1376.2 MB = 0.67x (lower)**
  - longtasks **403 ms vs 2147 ms = 0.19x (lower main-thread blocking)**
- CAVEAT (see Anti-cheat): remotion-webcodecs' margin is produced by an asset-id-hardcoded fast path that rebrands the ftyp box and returns the input bytes essentially unchanged — it does NOT run a real demux/remux pipeline for this row. Its perf "win" is an identity-copy + 8-byte patch, not a like-for-like remux. The other three passers genuinely repackaged the stream.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | reference-reimport:pass (46126 pkts / 28426 kf / 2 trk / Δdur 0س) | 423.47 ms | 1416.87 x-rt | 922.4 MB | 403 ms | cached previous PASS |
| mp4box@2.3.0 | PASS | reference-reimport:pass (46126 pkts / 28426 kf / 2 trk / Δdur 0s) | 1644.78 ms | 364.79 x-rt | 1376.2 MB | 2147 ms | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass (46126 pkts / 28426 kf / 2 trk / Δdur 0s) | 2180.13 ms | 275.21 x-rt | n/a (n=0) | 2147 ms | cached previous PASS |
| mediabunny@1.48.0 | PASS | reference-reimport:pass (46128 pkts / 28428 kf / 2 trk / Δdur 0.064s ≤0.1) | 6873.64 ms | 87.29 x-rt | n/a (n=0) | 1901 ms | cached previous PASS |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

All four PASS bench rows are n=1 (warmup=1, mad=0, p95==median): single-sample evidence, so the perf ranking is suggestive, not statistically robust. All four are cached==true.

## Why the winner wins (deep technical)

The operation is a lossless container change: a self-contained, faststart QuickTime `.mov` (major_brand `qt  `, golden meta confirms container "mov") carrying H.264 1080p30 video (~5.84 Mbit/s) + AAC-LC 48 kHz stereo, retargeted to an MP4 (ISO-BMFF) wrapper. Because QuickTime MOV and MP4 share the ISO base-media box grammar, and this fixture is already ISO-BMFF-shaped with MP4-legal codecs, the *minimal correct remux* is to rebrand the `ftyp` box — no sample copy, no offset rewrite — provided every existing `stco/co64` chunk offset stays byte-stable.

That is exactly what the winner does. `src/engines/remotion-webcodecs/adapter.ts:494-510` (`remux`) checks `shouldUseCompatibleMovToMp4FastPath(input)` and, for the MP4 target, calls `remuxCompatibleMovToMp4(input)`. `src/engines/remotion-webcodecs/compatible-mov-mp4.ts:26-51` fetches the file (`cache:'no-store'`, line 32), validates the leading `ftyp` is `qt  ` and is followed by `moov` (lines 41-45), then writes `isom` into the major-brand slot and `mp42` into the compatible-brand slot while **keeping the ftyp size unchanged** (lines 47-49, comment: "Keep ftyp size unchanged so every existing chunk offset remains valid"), and returns the otherwise-identical buffer. The backend reported in env.configUsed is `backend:"webcodecs", pipeline:"streaming-backpressure"`, but for this row none of that runs — the listed `adapterFastPaths` entry "compatible MOV->MP4 ftyp rewrite for the huge MOV copy row" (adapter.ts:128) is the active path.

This is why the oracle measurements are golden-EXACT: `reference-reimport` re-imports the output with the reference demuxer and got **46126 packets / 28426 keyframes / 2 media tracks / durationDelta 0s** — identical to the golden packet table (golden has 46126 packets, 28426 keyframes). They are identical because the encoded sample data was never touched; only 8 brand bytes changed, so re-demux reproduces the source packet table bit-for-bit. The structural gate (`src/core/oracles.ts:1223-1271`, semantic path `:1273-1322`) checks track count, per-type layout, and duration within `max(band, 0.1s)` — all trivially satisfied by an identity-copy.

The performance ladder follows directly from how much real work each engine avoided: remotion-webcodecs (fetch + 8-byte patch) hits 1416.87 x-realtime / 423 ms wall; mp4box (pure-JS whole-file append + box re-author, `backend:"pure-js"`, `pipeline:"whole-file-append"`) does a genuine repackage at 364.79 x-rt / 1645 ms and pays peakMemory 1376 MB (whole-file buffered) + 2147 ms longtasks; ffmpeg.wasm (single-thread wasm `-c copy` remux) at 275.21 x-rt / 2180 ms; mediabunny (real WebCodecs streaming-lockstep repackage) is slowest at 87.29 x-rt / 6874 ms and is the only engine whose output diverges from golden (46128/28428, +2 packets/keyframes, Δdur 0.064s) — evidence it genuinely re-fragmented the stream rather than copying it.

## What each other framework did wrong

- **mp4box@2.3.0 (PASS, lost on perf):** genuine remux but 3.88x slower throughput (364.79 vs 1416.87), 3.88x slower wall (1645 vs 423 ms), 1.49x higher peak memory (1376 vs 922 MB), 5.3x more main-thread blocking (2147 vs 403 ms longtasks). Cause: `backend:"pure-js"` + `pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"` buffers and re-authors the entire 448 MB file on the main thread. Correctness is identical (golden-exact 46126/28426).
- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correct golden-exact remux (46126/28426) but slowest of the fast trio — 275.21 x-rt / 2180 ms wall, 2147 ms longtasks; single-thread wasm `-c copy` overhead. peakMemory not captured (n=0). 5.15x lower throughput than the winner.
- **mediabunny@1.48.0 (PASS, lost on perf AND weakest correctness margin):** the only engine that actually repackaged via real WebCodecs streaming-lockstep — output is 46128/28428 (+2 pkts) with Δdur 0.064s (still ≤0.1s tol). Slowest by far: 87.29 x-rt / 6874 ms wall = 16.2x lower throughput than the winner. Ironically the most honest remux pays the highest cost. peakMemory not captured (n=0).
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest NA — the browser exposes WebCodecs (decode/encode) and MediaRecorder but no general container-remux primitive, so declining the op is correct, not under-declaration.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest NA — web-demuxer is a demux-only (ffmpeg-wasm-backed) reader; it has no muxer/writer, so it cannot produce a remuxed container.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest NA — media-parser is parse/probe-only with no writer side (the writer lives in @remotion/webcodecs, tested separately).

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/size-ladder.ts:56-67` (the huge `.mov`->mp4 row), built by `buildRemux` in `src/scenarios/remux/_shared.ts:84-104`; primaryMetric overridden to `throughputRealtime` at `size-ladder.ts:85`. Default oracle set = `['reference-reimport']` only (`_shared.ts:78-81`). The scenario `notes` explicitly intend a "self-contained big-read 1080p H.264 .mov" stressing "lazy/partial reading + sustained throughput + peak memory."
- Fixture: `fixtures/media/huge_h264_1080p_600s.mov` EXISTS and is a real **448 MB** file (not synthetic/empty). Goldens exist: `.meta.json` (container mov, qt  brand, 600s, h264+aac), `.packets.json` (46126 packets / 28426 keyframes — matches the passers' re-import). Measurements are physically plausible for a 600 s 30 fps clip.
- Gating oracle: `src/core/oracles.ts:1223-1271` (`referenceReimport`) -> `:1273-1322` (`semanticRemuxReimport`). It performs a REAL re-demux of the engine output via the reference engine and compares track count, per-type track layout, and duration (tol `max(band,0.1s)`). It is, however, a STRUCTURAL/metadata gate only — there is NO byte-exact or decoded-frame check on the remux output, and no per-packet diff is enforced for remux ops (`_shared.ts:13-19` notes golden-packets/golden-metadata are intentionally not attached to remux ops). An identity copy of a valid input therefore passes trivially.
- Winner adapter: `src/engines/remotion-webcodecs/compatible-mov-mp4.ts:12` hardcodes `COMPATIBLE_MOV_TO_MP4_FAST_PATH_ASSETS = new Set(['huge_h264_1080p_600s.mov'])` — i.e. the fast path is gated on THIS EXACT asset id. `:26-51` returns the fetched input bytes with only `ftyp` major/compatible brands flipped (`qt  `->`isom`/`mp42`), no sample/offset movement. Invoked from `adapter.ts:494-510`.
- Verdict: **SUSPECT**. The technique itself (qt->isom ftyp rebrand of an already-ISO-BMFF MOV) is a legitimate zero-copy remux and is not returning a canned/golden file — it returns the real (re-fetched) media bytes. But three things undermine the result as a fair benchmark: (1) the path is HARDCODED to a single asset id, tailored to exactly this leaderboard row rather than a general "compatible MOV" detector, so the 3.88x throughput crown reflects a special-cased memcpy, not the engine's real remux pipeline (which the other three rows actually exercised); (2) the gating oracle is a single loose structural check that CANNOT distinguish an identity copy from a genuine remux — an engine that did nothing but rebrand bytes scores golden-exact; (3) all four PASS rows are cached==true and n=1, so the numbers were reused, not freshly measured. Not classified CHEAT because the output IS a real, valid MP4 derived from the real input (no fabricated/golden short-circuit, errors are thrown not swallowed), but the win is not a like-for-like remux comparison.
- Cached note: winner remotion-webcodecs result is `cached:true` ("cached previous PASS result"); all four PASS engines are cached. Staleness/seeding risk applies — these were reused from a prior run, not re-executed for this report.

## Confidence & caveats

- Confidence: **medium**. Code paths, fixture existence, golden counts, and oracle logic were all read directly and corroborate the shard numbers. The "winner" determination by the prescribed decision procedure (correctness comparable -> rank by primaryMetric) is unambiguous: remotion-webcodecs leads throughputRealtime by 3.88x.
- Principal caveat: the winner's margin is produced by an asset-id-hardcoded ftyp-rebrand fast path, not a general remux. If the goal is "which engine remuxes a huge MOV fastest in a real pipeline," **mp4box** is the strongest genuine performer among the engines that actually repackaged the stream (mediabunny being the only one whose output structurally diverged, evidencing real re-fragmentation).
- All bench rows are n=1 (mad=0, p95==median) and cached — single-sample, reused evidence. peakMemory is uncaptured (n=0) for ffmpeg.wasm and mediabunny, so the memory comparison only spans webcodecs vs mp4box.
- The gating oracle is structural-only with no decoded-frame or byte-exact check, so a fast-but-trivial remux is not penalized for correctness here.
