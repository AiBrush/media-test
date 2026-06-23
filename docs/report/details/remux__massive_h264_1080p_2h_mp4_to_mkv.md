# remux/massive_h264_1080p_2h_mp4_to_mkv

family: remux | fixture asset: `massive_h264_1080p_2h.mp4` (1.1 GB, 2h, 1080p H.264 + AAC 48k mono) | primaryMetric: throughputRealtime | passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Contested: **YES** — 2 engines PASS (ffmpeg-wasm and mediabunny@1.48.0). Both satisfy the single gating oracle `reference-reimport` with near-identical, physically-plausible structural measurements, so correctness strength is a tie.
- Decisive factor: **PERFORMANCE on the primary metric `throughputRealtime`.** ffmpeg.wasm sustains **865.30 x-realtime** vs mediabunny **234.91 x-realtime** — a **3.68x** throughput margin. Equivalently, wall median **8320.84 ms vs 30649.84 ms** (3.68x faster). Both samples are n=1 (cached), so the evidence strength is one observation each; the margin (3.68x) is far larger than any plausible single-sample noise, so the ranking is safe.
- Caveat: both winning results are `cached==true` (reused, not re-run this session), and mediabunny is actually better on main-thread blocking (longtasks 1007 ms vs ffmpeg 6188 ms). Throughput is the declared leaderboard axis for the size ladder, so ffmpeg wins, but a memory/responsiveness-weighted scoring would favor mediabunny.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 8320.84 | 865.30 | 0 (not sampled) | 6188 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 30649.84 | 234.91 | 0 (not sampled) | 1007 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Note: `peakMemory`, `sourceReads`, `targetWrites` all have `n==0` (no samples) for both PASS engines in this shard, so peak-memory cannot be used as a tiebreaker here.

## Why the winner wins (deep technical)

This is a **lossless container rewrap**: H.264 video + AAC audio elementary streams are copied byte-for-byte out of an MP4 (`isom` major brand, faststart) and re-wrapped into Matroska/MKV. No transcode is involved, so the only work is demux → repacketize → mux. At the massive rung (~1.1 GB, 7200 s, ~216k video frames; the re-imported output shows **553,501 packets** total across the two tracks for ffmpeg), the dominant cost is sustained I/O and packet bookkeeping — exactly what `throughputRealtime` (output media-seconds per wall-second) measures.

**ffmpeg.wasm path** (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`): the adapter builds a true stream-copy invocation `[...inputOptions, '-i', name, '-map', '0', '-c', 'copy', outName]` (line 2044). `-map 0` keeps both the H.264 and AAC tracks (no default single-stream-per-type drop), and `-c copy` means libavformat never instantiates a decoder/encoder — it demuxes elementary packets and feeds them straight to the Matroska muxer. For the MKV target the MP4-specific `-movflags +faststart` branch (lines 2045-2050) is skipped (it only applies to `mp4`/`mov`), so there is no second rewrite pass. The whole 2h file is processed inside the wasm MEMFS by libav's native C demux/mux loop, which is why it hits **865.30 x-realtime / 8320.84 ms wall**. The cost it pays is one large synchronous wasm region: longtasks **6188 ms** (it blocks the main thread for ~6.2 s).

**mediabunny path** (`src/engines/mediabunny/adapter.ts:1244-1260`): it opens the MP4 as an `Input`, creates an `Output` with the MKV `OutputFormat` + a `BufferTarget`, and runs the high-level `Conversion` API (`runConversion`, line 1256). With matching codecs the Conversion stream-copies (no re-encode) under `env.configUsed.backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `wasmThreads:0`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`. That streaming-lockstep design is what keeps it responsive — longtasks **1007 ms**, ~6x lower than ffmpeg — but the per-packet JS/TS orchestration of ~553k packets through the pure-TS-ESM core build (no SharedArrayBuffer, single-thread) is markedly slower end-to-end: **234.91 x-realtime / 30649.84 ms wall**, 3.68x behind ffmpeg.

Correctness is genuinely a tie. The gating oracle `reference-reimport` (`src/core/oracles.ts:1225`, semantic branch `semanticRemuxReimport` at line 1273) re-demuxes each engine's MKV output with the reference engine and checks media-track count + layout + duration drift against the golden (`fixtures/golden/massive_h264_1080p_2h.mp4.meta.json`: 2 tracks, 7200 s). Measurements:
- ffmpeg: reimportPackets **553501**, reimportKeyframes **341101**, reimportMediaTracks **2** (golden 2), durationDeltaSec **0.042 s** (tol 0.1 s).
- mediabunny: reimportPackets **553503**, reimportKeyframes **341103**, reimportMediaTracks **2** (golden 2), durationDeltaSec **0.064 s** (tol 0.1 s).

The 2-packet / 2-keyframe difference is well within the oracle's 2% relative band and reflects normal container repacketization (edit-list / first-block handling), not a media-identity difference. Both produce a real, parseable 2-track MKV with duration matching the 2h golden to <0.07 s. Since the ladder (per the oracle set in `src/scenarios/remux/_shared.ts:78-81`) attaches only the structural `reference-reimport` gate — no `decoded-frames-bitexact`, no `ssim-psnr` — neither engine can earn a correctness edge here, so the contest collapses to the declared primary metric, and ffmpeg's 3.68x throughput lead is decisive.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (correctness-equal) but LOST on the primary metric: throughputRealtime 234.91x vs ffmpeg 865.30x (**0.27x**, i.e. ffmpeg is 3.68x faster); wall 30649.84 ms vs 8320.84 ms. Its single-thread pure-TS Conversion core (no SAB/threads) is the bottleneck at 553k packets. It does win main-thread responsiveness (longtasks 1007 ms vs 6188 ms), but that is not the leaderboard axis.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare output container 'mkv'". Honest: the adapter declares `containersOut: ['mp4']` only (`src/engines/mp4box/adapter.ts:647`); MP4Box.js is an ISO-BMFF (MP4) library and cannot author a Matroska container (`adapter.ts:911` notes any non-mp4 target is impossible). Correct NA, not under-declared.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare output container 'mkv'". Honest: its muxer set does not include Matroska; declaring a fake MKV output would be the cheat, and it correctly abstains.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest: declares `remux: false` (`src/engines/platform/adapter.ts:233`) and throws `NotApplicableError('remux', 'raw platform APIs cannot losslessly rewrap encoded samples into a container')` (line 356). Raw WebCodecs has no container muxer, so this is a genuine capability gap.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest: web-demuxer is a demux-only library (operations block at `adapter.ts:624`); it reads packets but has no muxer, so remux is genuinely out of scope.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest: it is a parser (operations block at `adapter.ts:190`), no muxing/container-write capability.

All five NAs are under capability gating (`requires.operations:['remux']`, `containersOut:['mkv']` from `src/scenarios/remux/_shared.ts:90-97`); each abstention matches the engine's real, declared capability surface — no under-declaration suspected.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/size-ladder.ts:68-79` (massive case), id synthesized by `remuxId()` in `src/scenarios/remux/_shared.ts:73-75` as `remux/massive_h264_1080p_2h_mp4_to_mkv`. Built via `buildRemux` (`_shared.ts:84-104`).
- Fixture: `fixtures/media/massive_h264_1080p_2h.mp4` **exists, 1.1 GB** on disk — a real, large, long-form file (NOT synthetic/empty/mock). Golden present and populated: `fixtures/golden/massive_h264_1080p_2h.mp4.meta.json` (container mp4, durationSec 7200, video h264 1920x1080@30, audio aac 48k mono, 2 tracks). NOTE: the scenario file's own docstring (`size-ladder.ts:15-19`) claims these massive goldens are "pending placeholders" — that comment is **stale**; the bake has since produced real meta/packets goldens, and the shard's plausible 553k-packet / 341k-keyframe / 7200 s measurements confirm a real run against real media, not a fabricated number.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069`. Genuine `-map 0 -c copy` stream-copy through ffmpeg.wasm libav demux/mux. It does NOT return canned bytes, does NOT copy input→output as-is (it actually rewraps MP4→MKV via the muxer), does NOT short-circuit to the golden, and does NOT swallow errors (`assertRemuxContainerCompatible` at line 2040 and `this.run(args)` propagate failures). Output bytes are read back from MEMFS (`readBinary(outName)`, line 2064).
- Gating oracle: `src/core/oracles.ts:1225` (`referenceReimport`) → remux branch `semanticRemuxReimport` (`oracles.ts:1273-1324`). Performs a REAL comparison: re-demuxes the engine's MKV output with an independent reference engine, asserts non-empty packet table, matches media-track count + layout against the golden, and checks duration drift against the 2h golden with a tight tolerance (0.1 s; measured deltas 0.042 s / 0.064 s). Not trivially satisfiable: an empty/garbage MKV would yield 0 packets or wrong track count/duration and FAIL. Measurements are physically plausible for a 2h 30fps file (~553k packets, ~341k keyframes, 7200 s).
- Cached note: **both PASS results have `cached==true`** ("cached previous PASS result"). Evidence was reused, not re-run this session — staleness risk exists, but the measurements are internally consistent with the real fixture/golden, and the 3.68x throughput gap is far outside single-sample noise.
- Verdict: **REAL** — real 1.1 GB fixture + real ffmpeg.wasm stream-copy implementation + meaningful structural/semantic re-import oracle with tight, satisfied tolerances.

## Confidence & caveats

- Confidence: **medium**. The winner and ranking are unambiguous (3.68x primary-metric margin, identical-strength correctness gate), and the implementation/fixture/oracle are all verified real. Confidence is held to medium because: (1) both PASS results are `cached` (not re-run), (2) bench `n==1` for every metric (no spread; mad=0, p95==median trivially), and (3) `peakMemory`/`sourceReads`/`targetWrites` were not sampled (`n==0`), so the size-ladder's headline "peak-memory / OOM-resistance" axis is unmeasured for both engines.
- The only attached gate is the structural `reference-reimport`; there is no decoded-frames-bitexact or SSIM gate, so "correctness" here means container/track/duration integrity, not pixel-identity. Both engines are equal on that gate, which is why performance is decisive.
- mediabunny is the better choice if main-thread responsiveness/UI-jank matters (longtasks 1007 ms vs 6188 ms) or under a memory-constrained policy; ffmpeg wins the throughput leaderboard cell as scored.
