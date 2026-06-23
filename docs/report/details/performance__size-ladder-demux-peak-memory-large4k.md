# performance/size-ladder-demux-peak-memory-large4k

- family: performance
- fixture asset: `fixtures/media/h264_4k_10s.mp4` (26 MB, H.264 3840x2160 @30fps + AAC 48 kHz stereo; golden `fixtures/golden/h264_4k_10s.mp4.packets.json`, 87 KB)
- primaryMetric: `peakMemory` (lower-is-better, unit bytes)
- passCount: 7 / 7

## Verdict

- Best framework: **mp4box@2.3.0** — but as the *only honestly-rankable* engine on the declared primary metric, not as a clean "fastest/leanest" win.
- Contested: YES on correctness (all 7 engines PASS the same `golden-packets` gate), but the perf ranking on `peakMemory` is a **degenerate/measurement-artifact situation** (see Anti-cheat).
- Decisive factor: **mp4box is the sole engine that produced a real `peakMemory` sample** (`n=1`, median `81,040,391` bytes ≈ 81 MB). The other six engines report `peakMemory {n:0, median:0, samples:[]}` — i.e. they measured *nothing* (the UA-specific memory API did not yield a sample for them in this run). Under `src/core/report.ts` those `median:0` values are finite and would be ranked as "0 bytes peak" — which would wrongly crown the six non-measuring engines as co-winners and push mp4box (the only real measurement) to last. The honest reading is the inverse: mp4box is the only engine that can be ranked on the metric this scenario exists to test.
- Margin over runner-up: not meaningful on the primary metric — the six "runner-ups" have *no* real peakMemory measurement (`n=0`). On the secondary metric `wall`, mp4box is the **fastest of all seven** at 128.6 ms (vs mediabunny 93.3 ms — correction: mediabunny is faster on wall; see table), so mp4box does not even win on a tiebreak metric. Its only distinction is *having a real peakMemory number at all*.

## Per-engine results

All seven PASS `golden-packets` exactly: measuredCount 770 == goldenCount 770, comparedTracks 2, maxPtsDriftUs ≤ 1. All results are `cached==true`.

| engine | status | oracles passed | wall median (ms) | packetsPerSec | peakMemory (bytes) | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-packets:pass (770, drift 1µs) | 128.615 | 5986.86 | **81,040,391 (n=1, real)** | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:pass (770, drift 1µs) | 93.265 | 8256.04 | 0 (n=0, no sample) | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (770, drift 0µs) | 113.105 | 6807.83 | 0 (n=0, no sample) | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass (770, drift 1µs) | 6012.660 | 128.06 | 0 (n=0, no sample) | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass (770, drift 0µs) | 2682.320 | 287.06 | 0 (n=0, no sample) | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (770, drift 1µs) | 757.580 | 1016.39 | 0 (n=0, no sample) | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (770, drift 1µs) | 860.725 | 894.59 | 0 (n=0, no sample) | n/a | cached previous PASS result |

`throughputRealtime` is declared in the scenario's metrics list but is absent from every engine's `bench` in this shard, so it is not shown. `longtasks` is not a metric of this case and was not produced.

## Why the winner wins (deep technical)

This scenario (`src/scenarios/performance/size-ladder.ts:107-122`) is the §A.16 memory-pressure deep-edge: demux the 4K rung ranked by `peakMemory↓` to assert an engine *streams* rather than *buffers the whole file*. The fixture is a 26 MB 3840x2160 H.264 MP4 with an AAC stereo track; the golden packet table has 770 packets across 2 tracks. The gate is `golden-packets` (`src/core/oracles.ts:703`), which compares per-track, order-independent, with sizes and keyframe flags exact and pts/dts drift bounded to ±1 ms after per-track origin alignment. All seven engines clear it identically (770/770, ≤1 µs drift), so correctness does not separate anyone — the case is decided purely on `peakMemory`.

Here the run is degenerate. Per `src/core/bench.ts` `summarize()`, an engine that emits zero finite samples gets `median([]) === 0` (`median()` returns 0 for an empty array), so its `peakMemory` summary is `{n:0, median:0, samples:[]}`. Six of the seven engines are exactly that: they did not produce any peakMemory sample in this run (the UA-specific memory API `performance.measureUserAgentSpecificMemory()` only materializes under a cross-origin-isolated context, as the scenario notes spell out at `size-ladder.ts:118-120`: "peakMemory present only on cross-origin-isolated Chromium; NA elsewhere"). Only **mp4box** carries a genuine sample: `peakMemory {n:1, median:81040391}`.

mp4box's adapter (`src/engines/mp4box/adapter.ts`) makes the 81 MB peak both real and *expected*. Its pipeline is `whole-file-append(MP4BoxBuffer+fileStart)` (`adapter.ts:97`): `demux()` calls `input.arrayBuffer()` to pull the entire 26 MB file into memory, then `parseToInfo(bytes, true)` builds an MP4Box `createFile(true)` with `keepMdatData=true` (`adapter.ts:716-731`, demux path) so the mdat media bytes are retained alongside the parsed sample tables. It then walks every sample through `file.onSamples` (`adapter.ts:777`), copying only the scalar fields (`size`, `cts/timescale→ptsUs`, `dts/timescale→dtsUs`, `is_sync→keyframe`) and calling `file.releaseUsedSamples(id, last.number+1)` (`adapter.ts:789`) to drop sample data as it goes. Even with that release, the whole-file buffer (~26 MB) plus the parsed box/sample-table structures for a 4K stream land at ~81 MB peak — a physically plausible figure for a pure-JS, whole-file ISO-BMFF parser on a 26 MB file. So the winner "wins" by being the only engine that honestly reported what its memory cost was; the irony is that 81 MB is precisely the *non-streaming* behavior this scenario was built to penalize — but the six streaming-capable engines never produced a number to be measured against.

The backend mix underlines that this is a measurement-availability problem, not a real memory comparison: mp4box runs `backend: pure-js, hwAccel:false, worker:false` (env.configUsed). mediabunny and platform run WebCodecs streaming pipelines; ffmpeg.wasm is single-thread wasm; web-demuxer is wasm; the remotion engines are cpu-js / WebCodecs streaming. Any of those streaming demuxers would almost certainly post a *lower* real peakMemory than 81 MB if the memory API had sampled them — but in this cached run it did not, so they show 0 (= no data), not a true 0.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, correct (770/770, drift 1 µs). Did *not* produce a peakMemory sample (`n:0, median:0`): no real measurement on the primary metric, so it cannot be honestly ranked on this case. It is actually the fastest on the `wall` tiebreak (93.3 ms, 1.38x faster than mp4box) and highest packets/sec (8256), so on a streaming-memory metric it would likely beat mp4box — but the metric was not captured.
- **ffmpeg.wasm@0.12.15** — PASS, correct (770/770, drift 0 µs, tightest). No peakMemory sample (`n:0`). Strong wall (113.1 ms) and packets/sec (6808), but unrankable on the declared metric.
- **platform@chrome-149** — PASS, correct (770/770, drift 1 µs). No peakMemory sample (`n:0`). Slowest demux by far on `wall` (6012.7 ms, 47x slower than mp4box) and lowest packets/sec (128) — its `<video>→canvas→MediaRecorder` config is mis-suited to a pure-demux op — but that is a speed deficit, not the peakMemory metric.
- **web-demuxer@4.0.0** — PASS, correct (770/770, drift 0 µs). No peakMemory sample (`n:0`). Slow wall (2682.3 ms, 21x slower than mp4box).
- **remotion-webcodecs@4.0.479** — PASS, correct (770/770, drift 1 µs). No peakMemory sample (`n:0`). Wall 757.6 ms.
- **remotion-media-parser@4.0.479** — PASS, correct (770/770, drift 1 µs). No peakMemory sample (`n:0`). Wall 860.7 ms.

None of the six is "wrong" on correctness — they all demux the 4K MP4 perfectly. Their shared defect for *this* case is that the scenario's ranking metric (`peakMemory`) was never sampled for them, so the leaderboard cannot fairly compare them to mp4box.

## Anti-cheat validation

- Scenario definition: `src/scenarios/performance/size-ladder.ts:107-122` (`memoryPressure` map; id built at line 109). Input `LADDER.large4k = 'h264_4k_10s.mp4'` (`src/scenarios/performance/_shared.ts:78`).
- Fixture exists: `fixtures/media/h264_4k_10s.mp4`, 26 MB on disk — REAL 4K H.264/AAC media, not synthetic/empty. Goldens exist: `fixtures/golden/h264_4k_10s.mp4.packets.json` (87 KB), `.meta.json` (3840x2160, h264, aac 48 kHz). Golden packet[0] shows the negative edit-list pts (-21333 µs) characteristic of real ffprobe output.
- Oracle: `golden-packets` at `src/core/oracles.ts:703`. It is a genuine, strict per-track comparison: packet-count match, trackIndex layout (multiset) match, exact size and keyframe-flag match per packet, and pts/dts drift bounded to ±`seekToleranceUs` (1 ms) after per-track constant-offset alignment. Not trivially satisfiable — a wrong demux (missing/extra packet, wrong size, dropped keyframe, real timing drift) FAILs. Measurements (770 packets, 2 tracks, ≤1 µs drift) are physically consistent with a 10 s 4K+AAC MP4.
- Winner adapter: `src/engines/mp4box/adapter.ts:765-805` (`demux`), using the real mp4box.js library (`createFile`, `appendBuffer`, `setExtractionOptions`, `onSamples`, `releaseUsedSamples`). No canned output, no input→output copy, no short-circuit to golden, no swallowed error. The 81 MB peak is consistent with its declared `whole-file-append` / `keepMdatData=true` pipeline.
- **The scoring artifact (why this is not a clean REAL win):** `src/core/report.ts` selects the ranking metric via `primaryMetricForCase()` (line 482), which accepts the declared `peakMemory` because every result *has a `peakMemory` bench object* (`results.every(r => r.bench?.[m])` is true even when `n:0`). Then `computeCaseWinner()` (line 435-438) ranks by `bench[metric].median` filtered only on `Number.isFinite`, and `median:0` is finite. Because `peakMemory` is lower-is-better (`src/core/bench.ts` HIGHER_IS_BETTER set excludes it), the six `median:0` (no-measurement) engines would sort *ahead* of mp4box's real 81,040,391 and tie for the win, leaving the only engine that actually measured peak memory ranked LAST. That is a measurement-availability artifact (empty-sample → median 0 → "best"), not a real memory comparison.
- Cached note: ALL seven results have `cached==true` ("cached previous PASS result"). The peakMemory numbers (and their absence) were reused, not re-run; staleness risk is real, and a fresh cross-origin-isolated run could populate the other six engines' peakMemory and completely change the ranking. Per MEMORY (launcher seeding caveat), clear raw + .browser-cache for an honest fresh run before trusting this cell.
- Verdict: **SUSPECT**. The fixture, the mp4box implementation, and the golden-packets gate are all REAL and strong. But the *primary-metric ranking is degenerate*: six of seven engines have no peakMemory sample, their `median:0` placeholders are treated as a legitimate (winning) "0 bytes," and the report logic would invert the intended ranking. The correctness PASS is genuine for all seven; the perf "win" on peakMemory cannot be honestly assigned from this cached data.

## Confidence & caveats

- Confidence: **medium**. High confidence that all seven demux correctly (strict golden-packets, exact counts/drift) and that mp4box's implementation and 81 MB figure are real and plausible. Low confidence in any peakMemory *ranking*: only 1 of 7 engines has a real sample, every result is cached, and the report's empty-sample→0 behavior makes the metric self-defeating here.
- All metrics are `n==1` (or `n==0`); no mad/p95 spread to assess stability — single-shot evidence.
- If forced to name a single best framework, mp4box is the only defensible answer (the sole real peakMemory measurement), with the explicit caveat that it would likely *lose* a properly-measured peakMemory comparison to the streaming WebCodecs engines (mediabunny etc.), since 81 MB whole-file buffering is exactly the OOM-prone pattern this scenario targets.
- Recommended fix for the suite: treat `n==0` bench summaries as NA (exclude from ranking) instead of letting `median([])===0` count as a finite winning value.
