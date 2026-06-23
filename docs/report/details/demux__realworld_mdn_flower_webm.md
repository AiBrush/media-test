# demux/realworld_mdn_flower_webm

- family: demux
- fixture asset(s): `realworld_mdn_flower.webm` (MDN CC0 "flower" sample, VP8 video + Vorbis audio in WebM/Matroska, ~554 KB real file)
- primaryMetric: wall (ms)
- passCount: 6 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15**
- Contested: **YES** — 6 engines PASS the single gating oracle (`golden-packets`) identically, so the decision falls to performance.
- Decisive factor: **wall-clock latency**. All 6 passers produce byte-identical packet tables (370 packets, 2 tracks, maxPtsDriftUs=0), so correctness is a perfect tie; ffmpeg.wasm has the lowest wall median.
- Margin over runner-up: ffmpeg.wasm **6.13 ms** vs mediabunny **8.86 ms** = **1.44x faster wall** (next: remotion-media-parser 155 ms ≈ 25x slower; platform 6000 ms ≈ 979x slower). Caveat: all benches are n=1 (mad=0, single sample), and the 6.13 vs 8.86 ms gap is small in absolute terms, so the lead is real but low-confidence as a ranking.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 6.13 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true | 8.86 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true | 110.95 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 131.06 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 154.98 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 6000.56 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

All passing engines report the same `golden-packets` measurements: measuredCount=370, goldenCount=370, comparedTracks=2, maxPtsDriftUs=0. The bench block in this shard only contains `wall`; throughputRealtime/peakMemory/longtasks were not recorded for this demux row.

## Why the winner wins (deep technical)

This is a **pure container-demux / packet-enumeration** task on a real WebM (EBML/Matroska) file carrying a **VP8** video track and a **Vorbis** audio track. The gating oracle `golden-packets` (src/core/oracles.ts:703) does NOT decode any pixels — it walks the compressed bitstream and compares the per-packet table (count, per-track layout, size, keyframe flag, and pts/dts after a per-track constant-origin alignment) against the committed ffprobe-derived golden `fixtures/golden/realworld_mdn_flower.webm.packets.json` (370 packets: 150 on the VP8 track, 220 on the Vorbis track, 222 keyframes). Because the operation is "read the Matroska SimpleBlock/BlockGroup structure and report packets," it is entirely a parsing problem; pixel backend, WebCodecs hardware, and GPU are irrelevant to correctness here, which is why all six demuxers that understand WebM land on the exact same answer (maxPtsDriftUs=0, zero size/keyframe mismatches).

ffmpeg.wasm wins purely on speed of that parse. Its demux path (src/engines/ffmpeg-wasm/adapter.ts:1961) runs a single `ffmpeg -hide_banner -i <in> -map 0 -c copy -f framecrc <out>` invocation. The `-map 0` forces all streams (so the secondary Vorbis track is not dropped by default stream selection), `-c copy` stream-copies without re-encoding, and the `framecrc` muxer emits one line per copied packet. The parser `parseFramecrcPackets` (src/engines/ffmpeg-wasm/adapter.ts:441-489) reads `#tb` timebase lines, converts ticks→µs, and derives the keyframe flag from the framecrc convention (no `F=` field = KEY; `F=0x0` = non-key; src/engines/ffmpeg-wasm/adapter.ts:463-476). This is C-compiled-to-wasm Matroska demuxing with no per-frame JS object churn beyond the final text parse — for a 554 KB file the whole framecrc walk completes in 6.13 ms, edging mediabunny's pure-TS streaming demuxer (8.86 ms).

mediabunny is the strongest competitor and the gap (1.44x) is modest; its config used `backend: webcodecs / pipeline: streaming-lockstep / coopCoep: not-required`, but for demux-only no decode runs, so it too is essentially exercising its TS Matroska reader. The remotion and web-demuxer engines parse correctly but are an order of magnitude slower (111–155 ms) due to heavier JS/streaming-reader overhead per packet. platform@chrome-149 is the outlier at 6000.56 ms: the platform adapter's demux emulation drives a `<video>`/MSE-style path (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`) that effectively plays/walks the media in something close to real time rather than doing a tight container scan, so it pays a ~6 s wall cost while still producing the correct 370-packet table.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, identical correctness (370 packets, maxPtsDriftUs=0). Lost on performance only: 8.86 ms vs 6.13 ms = 1.44x slower wall. Low-confidence margin (n=1).
- **web-demuxer@4.0.0** — PASS, identical correctness. Lost on performance: 110.95 ms = ~18x slower than ffmpeg.wasm.
- **remotion-webcodecs@4.0.479** — PASS, identical correctness. Lost on performance: 131.06 ms = ~21x slower.
- **remotion-media-parser@4.0.479** — PASS, identical correctness (config `backend: cpu-js`, full-parse demux). Lost on performance: 154.98 ms = ~25x slower.
- **platform@chrome-149** — PASS, identical correctness, but 6000.56 ms = ~979x slower; the `<video>`/MediaRecorder-based demux emulation runs near real time instead of a fast container scan.
- **mp4box@2.3.0** — NA_ENGINE, reason "engine does not declare input container 'webm'." HONEST NA: mp4box is an ISO-BMFF (MP4/MOV) parser only — adapter declares `containersIn: ['mp4','mov']` (src/engines/mp4box/adapter.ts:645) and explicitly cannot read Matroska/WebM (src/engines/mp4box/adapter.ts:911). Not an under-declared capability.

## Anti-cheat validation

- Scenario definition: src/scenarios/demux/index.ts:106 (`id: 'realworld_mdn_flower_webm'`, asset `realworld_mdn_flower.webm`, container webm, videoCodecs ['vp8'], audioCodecs ['vorbis'], notes describe an MDN CC0 real-world corpus smoke).
- Fixture exists: `fixtures/media/realworld_mdn_flower.webm`, 554 KB real WebM file — confirmed via stat. Not synthetic/empty/mock.
- Golden exists and is plausible: `fixtures/golden/realworld_mdn_flower.webm.packets.json` (41 KB) lists 370 packets — trackIndex multiset {1:220, 0:150}, 222 keyframes, first audio packet size=1/pts=0, first video keyframe size=57748 — physically plausible for VP8+Vorbis real media.
- Oracle: src/core/oracles.ts:703 (`goldenPackets`). Performs a REAL per-track comparison of count, trackIndex layout, packet size (exact), keyframe flag (exact), and pts/dts drift (≤1ms after constant per-track origin alignment, oracles.ts:738-792). NOT trivially satisfiable — size and keyframe flags must match exactly; the result reports maxPtsDriftUs=0 here, i.e. perfect timestamp agreement.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:1961 (`demux`) + parser at adapter.ts:441-489. Runs real `ffmpeg -c copy -f framecrc`; no canned output, no copy-input-to-output fake, no short-circuit to the golden, no error-swallow-then-report-success (it throws if the Input block or framecrc output is missing, adapter.ts:2002-2018).
- Verdict: **REAL** — real fixture, real ffmpeg.wasm Matroska demux, meaningful exact-match oracle.
- Cached note: winner result has `cached: true` (reason "cached previous PASS result") — it was reused from a prior run, not re-executed in this session, so there is mild staleness risk; however, all six PASS engines are likewise cached and the correctness measurements are deterministic packet-table comparisons.

## Confidence & caveats

- Correctness ranking confidence: HIGH — all passers hit identical, exact, deterministic packet-table matches against a real golden.
- Performance ranking confidence: LOW-to-MEDIUM — every wall measurement is n=1 (mad=0, single sample, warmup=1), and the ffmpeg.wasm vs mediabunny margin (6.13 vs 8.86 ms, 1.44x) is small in absolute terms; a re-run could plausibly flip the top two. The large gaps (platform ~6 s, remotion/web-demuxer 100–155 ms) are robust to noise.
- All results are cached; for a fully honest fresh ranking the raw + .browser-cache should be cleared and the row re-run.
- No throughputRealtime/peakMemory/longtasks were captured for this row, so the perf comparison rests on wall alone.
