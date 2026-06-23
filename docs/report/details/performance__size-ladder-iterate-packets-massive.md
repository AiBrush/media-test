# performance/size-ladder-iterate-packets-massive

- **Family:** performance
- **Fixture asset:** `massive_h264_1080p_2h.mp4` (H.264 video + AAC audio in faststart MP4, ~1.1 GB, ~2 h, 553,501 packets across 2 tracks)
- **Primary metric:** `packetsPerSec` (higher better)
- **passCount:** 7 / 7

## Verdict

- **Best framework (by primary metric): web-demuxer@4.0.0** — `packetsPerSec` median **4,950,592** (wall **111.8 ms**), the fastest of seven PASSes.
- **Contested:** YES. All 7 engines PASS the identical correctness gate (`golden-packets`, 553,501 packets, 2 tracks, maxPtsDriftUs ≤ 1). Correctness is a dead heat, so the win is decided purely on performance.
- **Decisive factor:** web-demuxer routes this specific asset through a hand-written `mp4-sample-table` HTTP-Range fast path (`src/engines/web-demuxer/adapter.ts:765`) that reads ONLY the moov box and derives packets from stsz/stts/ctts/stss — never touching the 1.1 GB mdat or its own FFmpeg-WASM demuxer.
- **Margin over runner-up:** vs remotion-webcodecs (3,710,663 pkt/s, 149.2 ms): **1.33x faster** packets/sec, **0.75x** the wall. Both, plus remotion-media-parser, share the SAME fast-path helper, so the gap among the top three reflects moov-parse micro-overhead, not library architecture. Over the fastest engine WITHOUT the fast path (platform, 139,887 pkt/s): **35.4x**.
- **CAVEAT (see Anti-cheat):** the top-3 perf numbers are produced by suite-authored moov-parser code, not the engines' real demux libraries. n==1 (single sample, mad=0). Confidence in the *ranking-as-library-comparison* is LOW.

## Per-engine results

| Engine | Status | Oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| web-demuxer@4.0.0 | PASS | golden-packets:pass (553501, drift 1µs) | 111.80 | 64,397.8 | n/a | n/a | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (553501, drift 1µs) | 149.16 | 48,268.7 | n/a | n/a | cached previous PASS |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (553501, drift 1µs) | 228.80 | 31,469.2 | n/a | n/a | cached previous PASS |
| platform@chrome-149 | PASS | golden-packets:pass (553501, drift 1µs) | 3,956.76 | 1,819.7 | n/a | n/a | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (553501, drift **0µs**) | 5,327.44 | 1,351.5 | n/a | n/a | cached previous PASS |
| mediabunny@1.48.0 | PASS | golden-packets:pass (553501, drift 1µs) | 7,950.31 | 905.6 | n/a | n/a | cached previous PASS |
| mp4box@2.3.0 | PASS | golden-packets:pass (553501, drift 1µs) | 15,078.66 | 477.5 | n/a | n/a | cached previous PASS |

(peakMemory/longtasks are not metrics of this iterate-packets case — primary is packetsPerSec; no UA-memory sample emitted. All n=1, warmup=1, mad=0, p95=median.)

## Why the winner wins (deep technical)

The container here is a faststart progressive MP4 (`moov` before `mdat`) holding ~2 hours of H.264 video plus AAC audio. Iterating "every video packet" means producing 553,501 packet rows: per-packet size, PTS, DTS, and keyframe flag. Crucially, ALL of that information already lives in the moov sample-table boxes — `stsz` (sizes), `stts` (decode durations → DTS), `ctts` (composition offsets → PTS), and `stss` (sync-sample / keyframe list). You do not need to read a single byte of the 1.1 GB mdat to enumerate the packet table.

web-demuxer's adapter exploits exactly this. `demux()` first checks `shouldUseProgressiveMp4SampleTableFastPath(input)` (`src/engines/web-demuxer/adapter.ts:765`) and, for the gated asset set that includes `massive_h264_1080p_2h.mp4`, calls `demuxProgressiveMp4SampleTable()` in `src/engines/web-demuxer/mp4-sample-table.ts:48`. That helper issues an HTTP Range request for the file header, walks the top-level boxes to locate `moov`, range-reads only the moov (`readMoovBox`, mp4-sample-table.ts:68), then in `sampleTableFromTrak` (around mp4-sample-table.ts:156) parses `stsz`/`stts`/`ctts`/`stss` and synthesizes the 553,501 packet rows. It "never reads mdat and never fabricates packets from duration or fps" (file header comment). The result: wall median **111.8 ms** and **4.95 M packets/sec** — the moov for a 2 h clip is only a few MB, so the work is essentially one range read plus a tight integer loop over the sample tables.

The oracle (`goldenPackets`, `src/core/oracles.ts:703`) then verifies this output against the real 66 MB golden (`fixtures/golden/massive_h264_1080p_2h.mp4.packets.json`): it groups both sides per track, sorts by DTS then PTS, and compares position-by-position — sizes and keyframe flags must match EXACTLY, timestamps within ±1 ms after a constant per-track origin shift. web-demuxer reports `measuredCount=553501`, `goldenCount=553501`, `comparedTracks=2`, `maxPtsDriftUs=1`. So the fast path is not just fast, it is bit-faithful to the container's declared packet table.

The performance gap over the bottom four is mechanistic: mediabunny, mp4box, ffmpeg.wasm, and platform have NO such moov-only shortcut for this asset, so they actually stream/parse the file the way their libraries normally do (ffmpeg.wasm demuxes through FFmpeg's libavformat in WASM; mp4box appends the whole file and walks fragments; platform feeds an MSE/WebCodecs pipeline). Their walls are 3.96 s – 15.08 s, i.e. 35x – 135x slower, because they are doing materially more I/O and per-sample work. That is the honest cost of "iterate every packet" with a real demuxer at GB scale, and it is exactly the divergence the §5.3 size axis exists to expose.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 — PASS, lost on perf (1.33x slower pkt/s, 149.2 ms vs 111.8 ms).** Uses the SAME fast-path concept: `demux()` calls `shouldUseProgressiveMp4SampleTableFastPath` → `demuxProgressiveMp4SampleTable` (`src/engines/remotion-webcodecs/adapter.ts:395-398`, helper `src/engines/remotion-webcodecs/mp4-sample-table.ts:43`). Identical correctness (drift 1µs); marginally higher moov-parse overhead. Not a library-architecture loss.
- **remotion-media-parser@4.0.479 — PASS, lost on perf (2.05x slower pkt/s, 228.8 ms).** Also short-circuits via `shouldUseMp4SampleTableDemux` (`src/engines/remotion-media-parser/adapter.ts:437`, helper `mp4-sample-table.ts`). Same hand-written moov parser, slowest of the three fast-path engines.
- **platform@chrome-149 — PASS, lost on perf (35.4x slower pkt/s, 3,956.8 ms).** No moov fast path; demuxes through the real MSE/WebCodecs-fed pipeline (`backend: webcodecs, decode: VideoDecoder`), paying full per-sample cost. Correct (drift 1µs).
- **ffmpeg.wasm@0.12.15 — PASS, lost on perf (47.6x slower pkt/s, 5,327.4 ms).** Real libavformat demux in single-thread WASM (`wasmThreads:0`). Notably the STRONGEST correctness: `maxPtsDriftUs=0` (exact timestamps) vs everyone else's 1µs. On the strict correctness ladder it is the best, but the primary metric is throughput, where WASM demux is far slower.
- **mediabunny@1.48.0 — PASS, lost on perf (71.1x slower pkt/s, 7,950.3 ms).** Pure-TS streaming-lockstep demux, no moov shortcut. Correct (drift 1µs).
- **mp4box@2.3.0 — PASS, lost on perf (134.9x slower pkt/s, 15,078.7 ms).** Whole-file append pipeline (`pipeline: whole-file-append(MP4BoxBuffer+fileStart)`, `rangeReads:false`) — buffers and walks the entire 1.1 GB file, the worst fit for "enumerate packets from moov." Correct (drift 1µs).

## Anti-cheat validation

- **Scenario:** `src/scenarios/performance/size-ladder.ts:86-100` (the `iterateLadder` generator; `massive` rung via `RUNGS` line 54). op=`demux`, oracle=`golden-packets`, primary=`packetsPerSec`. Asset id resolved from `LADDER.massive` in `src/scenarios/performance/_shared.ts:82` = `massive_h264_1080p_2h.mp4`.
- **Fixture exists:** YES — `fixtures/media/massive_h264_1080p_2h.mp4` is a real 1.1 GB file (not synthetic/empty/mock).
- **Golden exists:** YES — `fixtures/golden/massive_h264_1080p_2h.mp4.packets.json` (66 MB, real per-packet table). NOTE: the scenario's prose comments (size-ladder.ts:22, `_shared.ts`) say this rung's golden is "NOT baked → NA until bake"; that prose is STALE — the golden was baked (file mtime 3 days) and all 7 engines genuinely rank against it now.
- **Oracle:** `goldenPackets`, `src/core/oracles.ts:703-796`. Real, strict comparison: exact per-track size + keyframe-flag match, ±1 ms timestamp tolerance after constant-origin alignment, and packet-count equality. Measurements are physically plausible for a 2 h H.264 clip (553,501 packets; drift 0–1µs). NOT trivially satisfiable.
- **Winner adapter:** `src/engines/web-demuxer/adapter.ts:764-766` → `src/engines/web-demuxer/mp4-sample-table.ts:43-110,156`. Reads the REAL moov over HTTP Range and parses REAL stsz/stts/ctts/stss. No canned output, no input→output copy, no golden short-circuit, no error swallowing (it throws on missing/truncated boxes).
- **Verdict: WEAK-GATE.** The correctness gate is REAL and strong (PASS is genuine and bit-faithful to the container's packet table). HOWEVER the *performance* result — the metric the win is decided on — is NOT produced by web-demuxer's own library (its FFmpeg-WASM demuxer). It is produced by a suite-authored, hand-written moov-only parser (`mp4-sample-table.ts`) that THREE engines (web-demuxer, remotion-webcodecs, remotion-media-parser) share verbatim, gated to a hard-coded asset allowlist. The four engines that lack this helper run their real demuxers and are 35x–135x "slower." The packetsPerSec leaderboard therefore measures author code vs library code, not library vs library — a loose/proxy attribution rather than fabricated data. Not CHEAT (output is real and golden-verified; the helper is documented and genuinely parses the container), but the perf ranking should be read as "engines whose adapter was given a moov shortcut" not "fastest demuxer."
- **Cached note:** ALL 7 results have `cached:true` ("cached previous PASS result"). Numbers were REUSED, not re-run for this report — staleness risk applies to every cell, including the winner.

## Confidence & caveats

- **Correctness confidence: HIGH.** Seven independent PASSes against a strict 66 MB golden, identical 553,501 packet counts, drift ≤1µs (ffmpeg.wasm exact at 0µs). The packet table is well-validated.
- **Performance-ranking confidence: LOW.** (1) n==1 per engine (single sample, mad=0, p95=median) — weak statistical evidence. (2) All cached, not freshly re-run. (3) The decisive metric is dominated by whether an adapter has the shared moov fast path, not by the underlying library's demux throughput; the top-3 gap (1.33x–2.05x) is moov-parser micro-overhead among the same helper.
- If the goal is "which LIBRARY demuxes a 2 h MP4 fastest," this row is inconclusive for the top three and only fair for the four full-parse engines (where ffmpeg.wasm 5.3 s / mediabunny 8.0 s / platform 4.0 s / mp4box 15.1 s is a real comparison).
- The stale "golden NOT baked" scenario prose is a documentation bug, not a correctness problem — the golden is present and was used.
