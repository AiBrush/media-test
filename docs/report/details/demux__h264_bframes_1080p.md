# demux/h264_bframes_1080p

**family:** demux | **fixture asset:** `h264_bframes_1080p.mp4` (11 MB, H.264 + AAC in MP4) | **primaryMetric:** wall | **passCount:** 5 of 7

## Verdict

- **Best framework:** `platform@chrome-149` (Chrome's WebCodecs/inline ISO-BMFF demux path).
- **Contested:** YES — 5 engines PASS with *identical* correctness (all satisfy `golden-packets` on the full 770-packet, 2-track table). The decision falls entirely to performance.
- **Decisive factor:** lowest wall median, **43.515 ms**.
- **Margin over runner-up** (`ffmpeg.wasm`, 48.805 ms): **1.12x faster wall**. Vs `mp4box` (52.745 ms): 1.21x. Vs `remotion-media-parser` (652.86 ms): 15.0x. Vs `remotion-webcodecs` (1053.575 ms): 24.2x.
- **Caveat:** all five PASS results are `cached==true`, `n==1` (mad=0, no spread). The 1.12x lead over ffmpeg.wasm is thin and rests on a single sample — treat the perf ranking as low-confidence; correctness parity is the solid result.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | golden-packets:true | 43.515 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 48.805 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true | 52.745 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 652.86 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 1053.575 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'packets:dts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'packets:dts' |

(No throughputRealtime / peakMemory / longtasks were recorded in the shard for any engine on this row; only `bench.wall` is present.)

## Why the winner wins (deep technical)

**The operation under test.** This is an MP4 demux of an H.264 elementary stream *with B-frames*. B-frames break the simplifying assumption that presentation order equals decode order: a coded sample's decode timestamp (DTS, from the time-to-sample `stts` table) is strictly less than its presentation timestamp (PTS, = DTS + the per-sample `ctts` composition offset) on reordered frames. The scenario notes make this explicit: *"B-frames: dts < pts on reordered frames — golden encodes the exact dts/pts spread"* (`src/scenarios/demux/index.ts:84`). The gate is therefore the `packets:dts` capability — an engine must surface a *separate* decode timestamp per packet, not just a presentation timestamp.

**What the winner actually did.** `platform` does not lean on `<video>` or a black-box demuxer; it parses the `moov` sample tables by hand. In `src/engines/platform/demux-mp4.ts:620-699` it walks each track's `stts` (time-to-sample), `ctts` (composition offset), `stsz` (sizes), `stsc`/`stco`/`co64` (chunk maps) and `stss` (sync samples). The DTS/PTS reconstruction that satisfies the B-frame gate is at `demux-mp4.ts:666-684`: *"First pass in TICKS: DTS = cumulative durations, PTS = DTS + ctts offset"* — i.e. `dtsTicks` accumulates `stts` deltas and `ptsTicks = dtsTicks + cttsOff` (`demux-mp4.ts:680-684`), then both are converted to microseconds (`demux-mp4.ts:698-699`) after an edit-list origin shift. Keyframe flags come from the `stss` sync-sample table (`demux-mp4.ts:350`). The capability is declared at `src/engines/platform/adapter.ts:278` (`'packets:dts'`), with the inline comment at `adapter.ts:264-265` noting *"'packets:dts' comes from MP4 sample-table decode timestamps."*

**Why the measurements confirm correctness.** The `golden-packets` oracle (`src/core/oracles.ts:703-796`) is strict: it groups both measured and golden packets per track, sorts each by (dts, pts), and compares position-by-position requiring exact `size` and `keyframe` match, with PTS/DTS residual ≤ 1µs *after* removing a single constant per-track origin offset (`oracles.ts:774-785`). The platform result reports `measuredCount=770`, `goldenCount=770`, `comparedTracks=2`, `maxPtsDriftUs=1` — meaning every one of the 770 packets across both the H.264 video and AAC audio tracks lined up in dts order with sub-microsecond timing fidelity. A demuxer that collapsed PTS=DTS (ignoring `ctts`) would have produced large PTS residuals on the reordered B-frames and failed; platform's drift is essentially zero.

**Why it is the fastest.** This is a pure metadata/sample-table walk — no pixel decode is required to enumerate packets. Platform's path is native-Chrome ISO-BMFF box parsing over an already-buffered file with no wasm module instantiation and no library framing overhead, finishing in 43.515 ms. ffmpeg.wasm (48.805 ms) pays single-thread wasm + libavformat demux-context setup; mp4box (52.745 ms, `backend: pure-js`, `whole-file-append`) is a pure-JS MP4Box.js parse that is competitive but slightly slower. The two Remotion engines are an order of magnitude slower (652.86 ms cpu-js full-parse demux; 1053.575 ms webcodecs streaming-backpressure path) because they spin up heavier streaming/worker-capable parse pipelines for what is a trivial table read here.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correctness is *equal* — `golden-packets` true, 770/770 packets, `maxPtsDriftUs=0` (marginally tighter than platform's 1). It exposes packet DTS via `framecrc` (`src/engines/ffmpeg-wasm/adapter.ts:1511`). It loses only on wall: 48.805 ms vs 43.515 ms = **1.12x slower**, attributable to single-thread wasm libavformat overhead. Thin, single-sample margin.
- **mp4box@2.3.0 (PASS, lost on perf):** equal correctness (770/770, drift 1), `backend: pure-js`, `whole-file-append(MP4BoxBuffer+fileStart)`. Slower at 52.745 ms = **1.21x slower** than platform. Pure-JS parse cost, no hardware/wasm advantage to claim.
- **remotion-media-parser@4.0.479 (PASS, lost on perf):** equal correctness (770/770, drift 1); surfaces `sample.decodingTimestamp` separately (`adapter.ts:218`). Backend `cpu-js`, `fieldsTier: full-parse(demux)` — 652.86 ms = **15.0x slower** than platform. Heavyweight full-parse pipeline for a metadata-only task.
- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** equal correctness (770/770, drift 1). Backend `webcodecs`, `streaming-backpressure`, 1053.575 ms = **24.2x slower** — the slowest PASS; its convert/extract pipeline is overkill for packet enumeration.
- **mediabunny@1.48.0 (NA_ENGINE):** *"engine does not declare feature 'packets:dts'."* Honest NA — mediabunny's public packet model surfaces a single timestamp and does not expose a distinct decode timestamp, so it correctly declines the B-frame DTS gate rather than fabricating one. Not an under-declared capability.
- **web-demuxer@4.0.0 (NA_ENGINE):** *"engine does not declare feature 'packets:dts'."* Same honest NA — it does not list `packets:dts` in its declared features, so the runner skips it before any oracle runs. No FAIL was masked.

## Anti-cheat validation

- **Scenario:** `src/scenarios/demux/index.ts:78-85` — case `{ asset: 'h264_bframes_1080p.mp4', container: 'mp4', videoCodecs:['h264'], audioCodecs:['aac'], features:['packets:dts'], notes:'B-frames: dts < pts ...' }`. The id is auto-derived from the asset stem (`h264_bframes_1080p`), matching the shard `scenarioId`.
- **Fixture exists & is real:** `fixtures/media/h264_bframes_1080p.mp4`, **11 MB**, present on disk (stat confirmed). Not synthetic/empty/mock. Goldens present: `fixtures/golden/h264_bframes_1080p.mp4.packets.json` (87k), `.meta.json`, `.frames.json`, `.ssim.json`.
- **Oracle:** `golden-packets` at `src/core/oracles.ts:703-796`. Real, non-trivial comparison: exact packet count + trackIndex multiset layout + per-packet size + keyframe flag, with ≤1µs PTS/DTS residual after a single constant per-track origin offset (`oracles.ts:738, 774-792`). Cannot be satisfied by a PTS=DTS shortcut on B-frame content. Not smoke, not SSIM-with-exactFrames==0. Measurements (770 packets, 2 tracks, maxPtsDriftUs=1) are physically plausible for a ~30s 1080p H.264+AAC MP4.
- **Winner adapter:** `src/engines/platform/demux-mp4.ts:620-699` (genuine `stbl` walk; DTS = cumulative `stts`, PTS = DTS + `ctts`); capability declared at `src/engines/platform/adapter.ts:272-281`. No canned output, no copy-input-to-output, no short-circuit to the golden file, no swallowed errors — it reconstructs timestamps arithmetically from the container's own tables.
- **Verdict:** **REAL** — real 11 MB fixture, genuine hand-rolled sample-table demux that correctly handles B-frame reordering, and a strict packet-table oracle that a fake/PTS=DTS path would fail.
- **Cached note:** the winning result (and all five PASS results) have `cached==true`, `reason:"cached previous PASS result"`. Evidence is reused from a prior run, not freshly re-executed; the perf number (single sample, n=1, mad=0) carries staleness risk and should not be over-trusted for the 1.12x margin.

## Confidence & caveats

- **Correctness confidence: high.** Five independent engines converge on the identical 770-packet, 2-track table with sub-µs drift; cross-engine agreement plus a strict oracle make the demux result robust.
- **Perf-ranking confidence: low.** Winner is decided purely on wall time, but every entry is `n==1`, `cached`, with zero spread, and the gap to ffmpeg.wasm is only 1.12x — within plausible run-to-run noise. A fresh non-cached re-run could reorder the top two.
- The shard records no throughput/memory/longtask metrics for this row, so tie-breaking beyond wall time was not possible.
- mediabunny / web-demuxer NAs are honest capability declines, not masked failures; they should not be read as defects for this specific DTS gate.
