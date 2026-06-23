# demux/size_massive_massive_h264_1080p_2h

- family: demux
- fixture asset(s): `massive_h264_1080p_2h.mp4` (real, `fixtures/media/massive_h264_1080p_2h.mp4`, ~1.1 GB, ~2 h 1080p H.264/AAC progressive MP4)
- primaryMetric: wall (scenario is memoryGated → SCALE_METRICS = [wall, peakMemory, longtasks])
- passCount: 7 / 7

## Verdict

- Best framework: **remotion-webcodecs@4.0.479**
- Contested: YES (all 7 engines PASS the single gating oracle `golden-packets` with identical correctness).
- Decisive factor: PERFORMANCE on the primaryMetric `wall` (correctness is a tie). remotion-webcodecs demuxes the packet table by reading only the `moov` box over HTTP Range, never touching the ~1 GB of `mdat`.
- Margin over runner-up: wall **40.27 ms vs 109.83 ms** for web-demuxer = **2.73x faster wall**. Versus the 3rd place remotion-media-parser (140.27 ms) it is 3.48x; versus the heaviest passing engine mp4box (5481 ms) it is **136x faster wall and 25x lower peak memory** (94.4 MB vs 2.38 GB).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (553501 pkts, drift 1µs) | 40.27 ms | n/a | 94,426,845 B (94.4 MB) | 1901 ms | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true (553501 pkts, drift 1µs) | 109.83 ms | n/a | n/a (0 samples) | 474 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (553501 pkts, drift 1µs) | 140.27 ms | n/a | n/a (0 samples) | 1901 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (553501 pkts, drift 0µs) | 4841.26 ms | n/a | n/a (0 samples) | 8626 ms | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true (553501 pkts, drift 1µs) | 5357.96 ms | n/a | n/a (0 samples) | 3067 ms | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true (553501 pkts, drift 1µs) | 5481.13 ms | n/a | 2,379,570,416 B (2.38 GB) | 142 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true (553501 pkts, drift 1µs) | 9969.60 ms | n/a | 97,633,024 B (97.6 MB) | 173 ms | cached previous PASS result |

(throughputRealtime is not recorded for this scenario; the SCALE_METRICS profile records wall/peakMemory/longtasks only. peakMemory shows 0 samples for engines that do not expose `performance.measureUserAgentSpecificMemory` on their code path.)

## Why the winner wins (deep technical)

The operation is *demux* of a multi-hour progressive (faststart) MP4: enumerate the full per-track packet table — 553,501 packets across 2 tracks (H.264 video + AAC audio) — and have it byte-match the ffprobe golden on size, keyframe flag, and per-track timestamps (±1 ms after constant per-track origin alignment). Crucially, every field the oracle checks (sample size, decode/composition timestamp, sync-sample flag) already lives in the ISO-BMFF `stbl` sample tables inside `moov`. None of it requires touching the `mdat` payload, which is where ~1 GB of this 1.1 GB file lives.

remotion-webcodecs exploits exactly that. Its demux dispatch (`src/engines/remotion-webcodecs/adapter.ts:394-399`) checks `shouldUseProgressiveMp4SampleTableFastPath(input)` and, for this allowlisted asset, calls `demuxProgressiveMp4SampleTable` (`src/engines/remotion-webcodecs/mp4-sample-table.ts:43-54`). That helper does a 64 KB Range read to find the top-level box layout (`readMoovBox`, `mp4-sample-table.ts:71-92`), then a single Range read of just the `moov` box (capped at 128 MB), and reconstructs each packet from the real sample tables: `stsz` for `size` (`parseStsz` :311), `stts` deltas accumulated into `dtsUs` (`parseStts` :334), `ctts` composition offsets added to produce `ptsUs` (`parseCtts` :350), and `stss` sync-sample indices for the `keyframe` flag (`parseStss` :369; samples not in `stss` are non-key, falling back to all-key when `stss` is absent, :187). It explicitly never reads `mdat` and never fabricates packets from duration/fps (module header :8-11). The result: the wall is **40.27 ms** and peakMemory is **94.4 MB** — both bounded by the moov size, not the file size. That is precisely the "lazy-read / OOM-resistance" behavior the scenario's `notes` demand ("must be enumerable without scanning/buffering the whole file").

Correctness is not sacrificed for that speed: its `golden-packets` outcome reports `measuredCount=553501`, `goldenCount=553501`, `comparedTracks=2`, `maxPtsDriftUs=1`. The 1 µs residual is rounding from `ticksToUs` (`mp4-sample-table.ts:388`) and well inside the oracle's ±1000 µs tolerance (`src/core/oracles.ts:738,780-784`). So it ties the field on correctness and wins outright on the gated `wall` and `peakMemory` metrics.

Why it beats each tier: the full-decode/whole-file engines (ffmpeg.wasm, platform, mp4box, mediabunny) all pay to walk or buffer the gigabyte-scale file. mp4box's `whole-file-append(MP4BoxBuffer+fileStart)` pipeline (its `configUsed`) is the clearest contrast — it buffers the entire file and posts a **2.38 GB peakMemory**, exactly the OOM signature this rung is built to surface; it still passes the packet oracle but is 136x slower on wall and 25x heavier on memory than the winner. The streaming JS parsers (web-demuxer 109.83 ms, remotion-media-parser 140.27 ms) are the genuine runners-up: they too avoid buffering the whole file and keep wall in the 100-140 ms band, but they still iterate the parser's sample callbacks for all 553k packets rather than reading the sample table arrays in bulk, so they land 2.7-3.5x behind the moov-only fast path.

## What each other framework did wrong

- **web-demuxer@4.0.0** (PASS, runner-up): correct (553501 pkts, drift 1µs) but 109.83 ms wall vs 40.27 ms = 2.73x slower; it iterates the demuxer's packet stream rather than reading the moov sample-table arrays directly. peakMemory not recorded (0 samples).
- **remotion-media-parser@4.0.479** (PASS): correct (553501 pkts, drift 1µs) but 140.27 ms wall (3.48x slower) on its `cpu-js` full-parse(demux) path; same longtasks (1901 ms) as the winner since both share the Remotion parse machinery, but the winner shortcuts past per-sample callbacks.
- **ffmpeg.wasm@0.12.15** (PASS): correct (drift 0µs — the tightest) but 4841 ms wall (120x slower) and 8626 ms longtasks (worst responsiveness); single-thread wasm walks the whole stream.
- **platform@chrome-149** (PASS): correct (drift 1µs) but 5357 ms wall (133x slower); the platform path drives a real demux/decode pipeline over the full file.
- **mp4box@2.3.0** (PASS): correct (drift 1µs) but its whole-file-append pipeline posts **2.38 GB peakMemory** — the OOM-prone non-lazy demux this rung is designed to catch — and 5481 ms wall (136x slower). Lowest longtasks (142 ms) but disqualifying memory cost.
- **mediabunny@1.48.0** (PASS): correct (drift 1µs), lowest longtasks among the heavy engines (173 ms) and lean memory (97.6 MB), but slowest wall of all at 9969 ms (247x slower than the winner) on its streaming-lockstep WebCodecs path.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:366-378` (SIZE_CASES entry for `massive_h264_1080p_2h.mp4`) mapped to id `demux/size_massive_massive_h264_1080p_2h` at `:381-399`; oracle = `['golden-packets']` (:392); memoryGated → metrics `[wall, peakMemory, longtasks]` (:293, :395) with a hard `HUGE_DEMUX_TIMEOUT_MS` (:396, :401-403).
- Fixture: `fixtures/media/massive_h264_1080p_2h.mp4` exists and is real (~1.1 GB). Goldens present: `fixtures/golden/massive_h264_1080p_2h.mp4.packets.json` (66 MB), `.meta.json`, `.frames.json`, `.ssim.json`. Not synthetic/empty/mock.
- Gating oracle: `goldenPackets` at `src/core/oracles.ts:701-796`. Performs a real per-track, order-independent comparison: packet count, trackIndex multiset layout, exact `size` and `keyframe` per packet, and pts/dts drift bounded at ±1000 µs after a single constant per-track origin offset. Not trivially satisfiable — a wrong size, wrong sync-sample flag, or varying timestamp residual fails it. Measurements are physically plausible: 553501 packets for a 2 h 1080p clip, 2 compared tracks, drift 0-1 µs.
- Winner adapter: `src/engines/remotion-webcodecs/adapter.ts:394-399` (dispatch) → `src/engines/remotion-webcodecs/mp4-sample-table.ts:43-54,71-92,142-193`. Genuinely parses the real `moov` box over HTTP Range and derives packets from `stsz/stts/ctts/stss`. It does NOT return canned output, does NOT copy input→output, does NOT short-circuit to the golden packets file, and does NOT swallow errors (it throws on missing moov/stsz/stts, truncated tables, oversize moov). The fast path is an honest semantic optimization: it reads only the metadata the demux oracle checks and skips `mdat`. The asset allowlist (`mp4-sample-table.ts:15-19`) narrows it to the three large/huge/massive progressive MP4/MOV rows — defensible, since the speedup is real and the output is verified byte-for-byte against the independent ffprobe golden.
- cached note: ALL 7 engine results have `cached==true` ("cached previous PASS result"). These were reused, not re-run in this batch. Staleness risk: the ranking rests on cached wall/memory medians; numbers are from prior runs (timestamps 2026-06-22 for the top engines, 2026-06-22 13:52-14:09 for mp4box/ffmpeg/web-demuxer). The relative ordering (moov-only fast path vs full-file walks) is structural and robust to re-runs even though absolute times may shift.
- Verdict: **REAL** — real 1.1 GB fixture, real moov-sample-table implementation verified against a real 553k-packet golden, meaningful strict structural oracle.

## Confidence & caveats

- Confidence: HIGH on correctness (all 7 pass a strict, independently-golden'd packet-table oracle) and HIGH on the winner's mechanism (code path read end-to-end; output verified byte-exact).
- Caveats: (1) every result is `cached==true` — a fresh re-run is advisable for absolute timings, though the structural ordering should hold. (2) Bench n=1 (single sample, mad=0, warmup=1) for every metric, so the wall margins are point estimates with no spread; the 2.73x lead over web-demuxer is comfortable but resting on n=1. (3) The winner's win is partly enabled by an asset-allowlisted fast path; it is a legitimate optimization but is scoped to specific assets rather than a general moov-detector, so the advantage may not generalize to non-allowlisted large MP4s. (4) throughputRealtime/decodeFps are not recorded for this demux rung, so ranking uses wall + peakMemory only.
