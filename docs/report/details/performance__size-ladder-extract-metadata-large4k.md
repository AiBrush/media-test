# performance/size-ladder-extract-metadata-large4k

- **Family:** performance
- **Fixture asset:** `fixtures/media/h264_4k_10s.mp4` (26 MB real 4K H.264+AAC MP4; golden `fixtures/golden/h264_4k_10s.mp4.meta.json`)
- **Primary metric:** opsPerSec (higher is better)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479`
- **Contested:** YES — all 7 engines PASS the single gate (golden-metadata). Correctness is identical (every engine satisfies the one oracle with the same detail "metadata matches golden (2 track(s))", `durationDeltaSec=0`), so the decision falls entirely to the performance tiebreaker (primaryMetric = opsPerSec).
- **Decisive factor:** Per-call probe overhead at large size. remotion-media-parser extracts metadata at **274.73 ops/s** (wall median **3.64 ms**), beating the runner-up mediabunny at 228.83 ops/s / 4.37 ms.
- **Margin over runner-up:** **1.20x faster** by opsPerSec (274.73 / 228.83), equivalently 0.83x the wall time (3.64 ms vs 4.37 ms).

## Per-engine results

| Engine | Status | Oracles passed | opsPerSec (primary) | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | **274.73** | 3.64 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 228.83 | 4.37 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 134.14 | 7.46 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 17.94 | 55.75 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 12.90 | 77.54 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 9.77 | 102.39 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 6.17 | 161.97 ms | n/a | n/a | n/a | cached previous PASS result |

(throughputRealtime / peakMemory / longtasks are not metrics of this scenario — `metrics: ['opsPerSec','wall']`, primary `opsPerSec`. peakMemory is only collected on the sibling `size-ladder-demux-peak-memory-*` rungs.)

## Why the winner wins (deep technical)

The operation is `probe` (extract-metadata) on a 26 MB 4K H.264/AAC progressive MP4. The golden requires container=`mp4`, durationSec=10, a video track (h264, 3840x2160, fps 30, ~20.8 Mb/s) and an audio track (aac, 48 kHz, stereo, ~128 kb/s). For *metadata extraction* the only bytes that matter are the MP4 `moov` atom (ftyp/moov box headers, `tkhd`/`mdhd`/`stsd` sample descriptions, SPS/PPS dims and timescale). None of the 26 MB of `mdat` H.264 NAL payload needs to be read. So the headline differentiator at this rung is **how few bytes the engine reads and how little it allocates to surface track metadata**, not decode throughput. The 4K resolution is incidental to metadata cost — it only inflates `mdat`, which a good probe never touches — so this is fundamentally a per-call header-parse overhead contest.

remotion-media-parser's adapter is a pure-JS **streaming, read-only container parser** (`env.configUsed.backend = "cpu-js"`, `pipeline = "streaming"`, `reader = "webReader"`, `fieldsTier = "metadata-only"`). Its `probe()` (`src/engines/remotion-media-parser/adapter.ts:348`) calls `runParse()` (`adapter.ts:335`, the real `parseMedia` from `@remotion/media-parser`) requesting only the cheapest metadata fields — `durationInSeconds, container, tracks, metadata, rotation` (`adapter.ts:374-381`) — and deliberately omits anything that would force a full parse. Because media-parser is a streaming pull-parser, requesting only header-tier fields lets it stop reading once the `moov` is consumed; for a faststart MP4 (`moov` near the front, major_brand `isom`) that is a few KB. The result is a 3.64 ms wall and 274.73 ops/s — the lowest per-call overhead in the field.

mediabunny (228.83 ops/s, 4.37 ms) is extremely close — also a pure-TS streaming reader (`coreBuild = "pure-ts-esm"`, `coopCoep = "not-required"`), so both win on the same mechanism: native-JS box walking with no wasm instantiation and no whole-file buffering. The 1.20x gap is small and rests on **n=1, mad=0** (a single timed sample, no spread), so it is *weak statistical evidence* — the two are effectively co-leaders and the ordering could flip on re-run. remotion-media-parser is reported as the winner strictly by the recorded primaryMetric value.

The slower cohort splits along architecture: remotion-webcodecs (134.14 ops/s) carries WebCodecs/canvas plumbing overhead even for a metadata probe; mp4box (17.94 ops/s, 55.75 ms) uses `whole-file-append(MP4BoxBuffer+fileStart)` with `rangeReads=false` (`env.configUsed`), i.e. it appends the entire 26 MB buffer before reporting `onReady`, paying a ~15x penalty vs the streaming leaders. web-demuxer (12.90) and ffmpeg.wasm (9.77) pay wasm module instantiation + a libav-style full open; platform (6.17 ops/s, 161.97 ms) is slowest because the browser's `<video>`/WebCodecs demuxer path has the heaviest fixed setup cost for a trivial header read. All of them still pass correctness — they are just an order of magnitude slower at per-call metadata.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on performance only: 228.83 ops/s vs 274.73 (0.83x; runner-up by a 1.20x margin). Same correctness (golden-metadata pass, durationDeltaSec=0). Loss margin is tiny and on n=1 — essentially a tie.
- **remotion-webcodecs@4.0.479** — PASS but 134.14 ops/s (2.05x slower than winner; 7.46 ms wall). WebCodecs/offscreencanvas pipeline overhead is dead weight for a pure metadata probe.
- **mp4box@2.3.0** — PASS but 17.94 ops/s (15.3x slower; 55.75 ms). `whole-file-append` with `rangeReads=false` buffers the full 26 MB before metadata is available.
- **web-demuxer@4.0.0** — PASS but 12.90 ops/s (21.3x slower; 77.54 ms). wasm libav open dominates the cost.
- **ffmpeg.wasm@0.12.15** — PASS but 9.77 ops/s (28.1x slower; 102.39 ms). Heavy wasm instantiation + full input mount for a header read.
- **platform@chrome-149** — PASS but 6.17 ops/s (44.5x slower; 161.97 ms). Browser-native demux setup is the highest fixed-cost path.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/size-ladder.ts:71` (id template `performance/size-ladder-extract-metadata-${r.key}`), large4k rung at `size-ladder.ts:51`. op=`probe`, oracles=`['golden-metadata']`, primary=`opsPerSec`. Asset resolved via `LADDER.large4k = 'h264_4k_10s.mp4'` (`src/scenarios/performance/_shared.ts:78`).
- **Fixture exists & is real:** `fixtures/media/h264_4k_10s.mp4` present, **26 MB** — a genuine 4K H.264/AAC MP4, not synthetic/empty. Golden `fixtures/golden/h264_4k_10s.mp4.meta.json` present (432 bytes, container mp4, 2 tracks, real 3840x2160/48kHz values).
- **Oracle is meaningful:** `goldenMetadata()` at `src/core/oracles.ts:595` performs a field-by-field comparison of measured metadata vs golden — container (line 606), duration within a strict per-frame tolerance (line 614-637; recorded `durationToleranceSec=0.0417` ≈ 1 frame @ 24fps band), and per-track codec/width/height/fps/sampleRate/channels (`compareTrack`, line 659). Any mismatch → FAIL (line 655). Not a smoke gate. The shard's `durationDeltaSec=0` is physically plausible (10.000 s golden, exact match) and the "2 track(s)" detail matches the golden's 2-track layout. The gate is correct but it is a **metadata-exact** gate, not bit-exact — appropriate for a probe op.
- **Winner adapter is genuine:** `src/engines/remotion-media-parser/adapter.ts:348` (`probe`) → `runParse` (`adapter.ts:335`) calls the real `parseMedia` from `@remotion/media-parser` with metadata-only `fields` (`adapter.ts:374-381`). No hardcoded/canned output, no short-circuit to the golden, no error swallowing. Capabilities declare only `probe`+`demux` (read-only parser), consistent with the op.
- **Verdict:** **REAL** — real 26 MB fixture, real streaming `parseMedia` call, meaningful metadata-exact oracle. The only weakness is that correctness here is a structural/metadata gate (not bit-exact), and the win is decided by performance.
- **Cached note:** ALL 7 engines have `cached=true` ("cached previous PASS result"). Numbers were reused, not freshly re-run, so the 1.20x winner/runner-up margin carries staleness risk and rests on n=1/mad=0 single samples — low statistical power.

## Confidence & caveats

- **Confidence: medium.** Correctness is unanimous and validated as REAL; the winner is genuine. But the ranking is a *pure performance* call with a thin 1.20x margin over mediabunny, all samples are **n=1, mad=0**, and **every result is cached**. A fresh re-run could plausibly swap the top two. remotion-media-parser and mediabunny should be read as co-leaders, with remotion-media-parser ahead only on the recorded primaryMetric.
