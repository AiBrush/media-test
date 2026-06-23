# demux/size_huge_huge_h264_1080p_600s

- family: demux
- fixture asset: `huge_h264_1080p_600s.mov` (448 MB MOV, H.264/AAC, 600 s, "huge" bucket; exists in `fixtures/media/`)
- primaryMetric: wall (ms)
- passCount: 6 of 7 (1 SKIPPED)

## Verdict

- Best framework: **web-demuxer@4.0.0** (uncontested on the decisive metric; CONTESTED on correctness — see below).
- Contested: yes. All 6 active engines PASS the single gating oracle `golden-packets` with byte-identical results (46126 packets, comparedTracks=2, maxPtsDriftUs ≤ 1). Correctness is therefore a dead heat, so the tiebreak is performance (primaryMetric = wall).
- Decisive factor: lowest wall median. web-demuxer 10.91 ms vs runner-up remotion-webcodecs 14.48 ms.
- Margin over runner-up: **1.33x faster wall** (14.48 / 10.91). Against the fastest *real-library* demux (ffmpeg.wasm, 1402 ms) the ratio is ~128x — but that gap is an artifact of an adapter fast path, not of the web-demuxer library (see Anti-cheat).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| web-demuxer@4.0.0 | PASS | golden-packets:true | 10.91 | n/a | 0 (not sampled) | 1901 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 14.48 | n/a | 0 (not sampled) | 1901 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 1402.23 | n/a | 0 (not sampled) | 1068 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true | 1492.98 | n/a | 0 (not sampled) | 9925 | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true | 1945.36 | n/a | 935810157 (935.8 MB) | 19963 | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 6136.22 | n/a | 0 (not sampled) | 1765 | cached previous PASS result |
| remotion-media-parser@4.0.479 | SKIPPED | — | — | — | — | — | disabled: it takes so much time |

All PASS engines report identical golden-packets measurements: measuredCount=46126, goldenCount=46126, comparedTracks=2. maxPtsDriftUs=1 for every engine except ffmpeg.wasm (0). throughputRealtime is not present in any bench block for this scenario. peakMemory was only sampled (n=1) for mp4box; all others report n=0 (peakMemory not captured).

## Why the winner wins (deep technical)

This is a packet-table demux of a 600 s, 1080p H.264/AAC clip in a *faststart MOV* (moov before mdat). The only gate is `golden-packets` (`src/core/oracles.ts:701-795`), which compares the engine's enumerated packet list against the ffprobe-derived golden table: per-track, sorted by dts then pts, exact size match, exact keyframe-flag match, and timestamps tolerant only to a constant per-track origin shift (±1 ms residual). With 46126 packets across 2 tracks matching exactly and a maxPtsDriftUs of just 1 µs, every active engine produced a structurally correct, timing-accurate packet table — correctness does not separate them.

The performance separation is entirely about *how* the packet rows are obtained. web-demuxer's adapter short-circuits to a shared progressive-MP4 sample-table fast path: `src/engines/web-demuxer/adapter.ts:765-766` calls `demuxProgressiveMp4SampleTable(input)` whenever `shouldUseProgressiveMp4SampleTableFastPath(input)` is true. That predicate (`src/engines/web-demuxer/mp4-sample-table.ts:39-41`) returns true only when the input is unmutated and its id is in `SAMPLE_TABLE_FAST_PATH_ASSETS` — which explicitly lists `huge_h264_1080p_600s.mov` (`mp4-sample-table.ts:15-19`). The helper does NOT run the web-demuxer FFmpeg/WASM packet stream at all. Instead it reads the first 64 KB over HTTP Range, walks top-level boxes to find `moov` (`mp4-sample-table.ts:68-89`), range-reads exactly the moov box, then derives every packet row directly from the sample tables: `stsz` sizes, `stts` durations → dts, `ctts` → pts offset, `stss` → keyframe flags (`mp4-sample-table.ts:139-190`). It never touches `mdat`. Because the work is "read ~moov bytes and do integer arithmetic over the sample table," wall collapses to 10.91 ms — there is no codec init, no WASM module load, no full-file scan. This is a genuine, correct ISO-BMFF parse (the moov sample tables are the authoritative source of packet sizes/timestamps for a non-fragmented file), but it is the *adapter's* parser, not the web-demuxer library.

remotion-webcodecs (14.48 ms, runner-up) takes the *identical* code path: `src/engines/remotion-webcodecs/adapter.ts:395-398` also calls the same `demuxProgressiveMp4SampleTable` helper for this asset, for the same reason (its `@remotion/media-parser` sample callback would otherwise pull mdat). So the top-2 are effectively the same algorithm; the ~3.6 ms delta is noise on an n=1, mad=0 single sample and should not be read as a real engine advantage.

The three "real library" engines actually exercise their demuxers and pay for it: ffmpeg.wasm 1402 ms, mediabunny 1493 ms, mp4box 1945 ms — roughly 100–180x slower than the fast path, which is the honest cost of constructing/reading a packet stream over a 448 MB file in WASM/JS. Among these, ffmpeg.wasm is fastest and is the only engine with maxPtsDriftUs=0 (perfect timestamp reconstruction). mp4box, the slowest, buffers the whole file (`pipeline: whole-file-append(MP4BoxBuffer+fileStart)`, `rangeReads:false`) and is the only engine that recorded peakMemory: 935.8 MB — exactly the "non-lazy demux blow-up" the scenario notes warn about (`src/scenarios/demux/index.ts:361-363`), plus the worst longtasks at 19963 ms. platform (Chrome WebCodecs path, 6136 ms) is the slowest PASS, ~562x slower than the fast path.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, lost by 1.33x wall):** Correctness identical (46126 pkts, drift 1 µs). It uses the *same* `demuxProgressiveMp4SampleTable` helper (`adapter.ts:395-398`), so its 14.48 ms vs 10.91 ms is within single-sample noise (n=1, mad=0), not a real algorithmic gap.
- **ffmpeg.wasm@0.12.15 (PASS, lost on wall):** Ran a genuine demux at 1402 ms — ~128x the winner's fast path. Best correctness of the real-library group (maxPtsDriftUs=0). It loses only because the winner skipped the library work via a moov-only fast path.
- **mediabunny@1.48.0 (PASS, lost on wall):** 1492.98 ms, ~137x slower; longtasks 9925 ms (heavy main-thread blocking during the streaming-lockstep WebCodecs walk). Correct (drift 1 µs) but far slower.
- **mp4box@2.3.0 (PASS, lost on wall + memory):** 1945.36 ms (slowest of the WASM/JS group) and peakMemory 935.8 MB from whole-file buffering (`rangeReads:false`); longtasks 19963 ms. This is the scenario's intended anti-pattern — a non-lazy demux that blows up memory on a huge file.
- **platform@chrome-149 (PASS, lost on wall):** 6136.22 ms, the slowest PASS (~562x the winner). The Chrome demux/decode pipeline pays full cost on the 448 MB MOV.
- **remotion-media-parser@4.0.479 (SKIPPED):** status=SKIPPED, reason "disabled: it takes so much time". No oracle evidence; not eligible. This is an operator opt-out, not a capability NA — it tells us nothing about correctness here.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:354-364` (SIZE_CASES entry `huge_h264_1080p_600s.mov`); id assembled at `index.ts:381-383` as `demux/size_${bucket}_${asset-without-ext}` → `demux/size_huge_huge_h264_1080p_600s`. Notes call this the BigBuckBunny-scale packet-iterate case and explicitly say a non-lazy demux shows up as peakMemory/longtasks blow-up.
- Fixture: `fixtures/media/huge_h264_1080p_600s.mov` exists, 448 MB — a REAL, non-synthetic large MOV. Goldens present: `huge_h264_1080p_600s.mov.packets.json` (5.4 MB), plus meta/frames/ssim.
- Gating oracle: `golden-packets` at `src/core/oracles.ts:701-795`. It performs a real per-track, position-by-position comparison of size + keyframe flag (exact) and timestamps (±1 ms after constant origin alignment) against the ffprobe golden. Not trivially satisfiable: any count, layout, size, keyframe, or varying-timestamp error fails. Measurements (46126 packets across 2 tracks, sub-µs drift) are physically plausible for a 600 s 1080p H.264 + AAC MOV.
- Winner adapter: `src/engines/web-demuxer/adapter.ts:764-767` → `src/engines/web-demuxer/mp4-sample-table.ts:39-190`. The implementation is real ISO-BMFF parsing (range-read moov, derive packets from stsz/stts/ctts/stss); it does not return canned output, does not copy input to output, and does not read the golden file. Its header comment (`mp4-sample-table.ts:1-11`) explicitly documents "never reads mdat and never fabricates packets from duration or fps."
- Verdict: **WEAK-GATE.** The PASS is genuine (real fixture, real moov parse, meaningful oracle), but the winning *speed* is produced by an adapter-level fast path that is hardcoded to this exact asset id (`SAMPLE_TABLE_FAST_PATH_ASSETS`, `mp4-sample-table.ts:15-19`) and bypasses the web-demuxer FFmpeg/WASM library entirely. remotion-webcodecs uses the byte-identical helper. So the wall-time leaderboard does NOT compare like for like: top-2 are the suite's shared moov parser, while ffmpeg.wasm/mediabunny/mp4box/platform pay the real library cost. The correctness gate is fine; the performance ranking is gameable by whoever opts into the fast path. Not classified CHEAT because the fast path is a legitimate, correct, documented technique (moov sample tables ARE the packet table for a non-fragmented file) and emits no fabricated data — but a reviewer must not credit web-demuxer's library for this 10.91 ms number.
- Cached note: every engine entry has `cached: true` ("cached previous PASS result"). Results were reused, not re-run in this pass — staleness risk if fixture/golden/adapters changed since the cached run (golden.packets.json is dated ~3 days, adapters ~21-22 h; a re-bake could invalidate cache).

## Confidence & caveats

- Confidence: medium-high on the data (all numbers taken verbatim from the shard), but the headline "winner" is undermined by the shared fast path: web-demuxer's win is not attributable to the web-demuxer library.
- All bench samples are n=1 (mad=0, p95==median), so wall comparisons are single-shot; the 1.33x top-2 margin is within plausible run-to-run noise.
- peakMemory was only sampled for mp4box; the absence of memory numbers for the fast-path engines means the memory-gated intent of this "huge" scenario is only meaningfully exercised against mp4box (which fails the spirit of the gate at 935.8 MB but still PASSes because the only gate is golden-packets, not a memory ceiling).
- remotion-media-parser is absent (operator-disabled), so its capability on this case is untested here.
