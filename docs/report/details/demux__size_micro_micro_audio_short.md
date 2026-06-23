# demux/size_micro_micro_audio_short

- **family:** demux
- **fixture asset(s):** `fixtures/media/micro_audio_short.m4a` (1.4 KB, 6-packet AAC-in-MP4 with encoder-delay priming)
- **primaryMetric:** wall (ms)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** **mp4box@2.3.0** (`mp4box`)
- **Contested:** YES — all 7 engines PASS the gating oracle `golden-packets` with identical correctness (measuredCount=6 == goldenCount=6, comparedTracks=1). Correctness is a tie, so the decision falls to performance.
- **Decisive factor:** wall median. mp4box demuxes in **4.395 ms**, the fastest of the field, and ties the best correctness (maxPtsDriftUs=0).
- **Margin over runner-up:** runner-up is mediabunny@1.48.0 at 8.86 ms → mp4box is **2.02x faster wall**. mp4box also has maxPtsDriftUs=0 vs mediabunny's 2µs (a structurally tighter, though both-passing, timestamp reconstruction). Against the platform baseline (6000.82 ms, which spins up a `<video>`+MediaRecorder pipeline) mp4box is ~1365x faster.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-packets:pass (count 6/6, drift 0µs) | 4.395 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:pass (count 6/6, drift 2µs) | 8.860 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (count 6/6, drift 0µs) | 9.050 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (count 6/6, drift 0µs) | 10.260 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (count 6/6, drift 0µs) | 10.340 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass (count 6/6, drift 0µs) | 20.905 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass (count 6/6, drift 0µs) | 6000.820 | n/a | n/a | n/a | cached previous PASS result |

(bench{} for every engine carries only the `wall` metric; throughputRealtime/peakMemory/longtasks were not collected for this micro demux row, so they are n/a.)

## Why the winner wins (deep technical)

**The operation.** This is a pure demux of a tiny ISO-BMFF/MP4 audio file (`micro_audio_short.m4a`): one AAC audio track, 6 access units. The container carries encoder-delay priming, so the golden packet table (ffprobe-derived) starts at ptsUs **-23220** and walks 0 → 23220 → 46440 → 69660 → 92880 with sizes [133, 162, 60, 66, 129, 5], every packet a keyframe (AAC frames are independently decodable). The `golden-packets` oracle (`src/core/oracles.ts:703`) groups packets per track, sorts by dts/pts, compares sizes and keyframe flags exactly, and allows only a *constant* per-track origin shift on timestamps (`src/core/oracles.ts:772`) — exactly the edit-list/priming offset called out in the scenario note. So the gate genuinely tests that an engine recovers all 6 sample sizes and their relative timing.

**Why mp4box is fastest here.** For a 1.4 KB whole-file MP4, the cost is dominated by parsing the `moov`/`stbl` sample tables and emitting sample records — there is no real decode work in a demux. mp4box.js does this in pure JS with zero runtime spin-up. Its adapter (`src/engines/mp4box/adapter.ts:765`) reads the whole buffer, calls `parseToInfo(bytes, true)` (keepMdatData=true so sample scalars are valid — `src/engines/mp4box/adapter.ts:709`), then sets `setExtractionOptions(t.id, null, { nbSamples: 100_000 })` and drives `file.start(); file.flush(); file.stop()` synchronously (`adapter.ts:794-799`). The `onSamples` callback (`adapter.ts:776`) copies only the scalar fields it needs — `size`, `cts`/`dts` (converted ticks→µs via `Math.round((s.cts/ts)*1_000_000)`), and `is_sync` for the keyframe flag — and immediately calls `releaseUsedSamples` (`adapter.ts:790`) to free memory. With config `backend: pure-js, whole-file-append(MP4BoxBuffer+fileStart), rangeReads:false`, there is no WebCodecs handshake, no wasm module load, no worker round-trip, and no decode — just a synchronous box walk. At this file size that wins handily: 4.395 ms.

**Why the others are slower despite also passing.** mediabunny (8.86 ms) and remotion-webcodecs (9.05 ms) both run on a `webcodecs` backend with prefer-hardware decoder config; even when only demuxing, their pipelines (streaming-lockstep / streaming-backpressure) carry more orchestration overhead than mp4box's flat synchronous flush. mediabunny is also the only engine to show maxPtsDriftUs=2 (still inside the 1 ms tolerance) — a 2µs residual from its tick→µs reconstruction, a hair looser than mp4box's exact 0µs. ffmpeg.wasm (10.26 ms) and web-demuxer (20.905 ms) carry wasm demuxer overhead (FFmpeg's libavformat path), and web-demuxer in particular pays a worker/wasm message round-trip that is large relative to a 6-packet file. remotion-media-parser (10.34 ms) is `cpu-js` full-parse with a webReader, structurally similar to mp4box but with a heavier streaming reader abstraction. platform (6000.82 ms) is the catastrophic outlier: its config encodes the operation as `<video>→canvas→MediaRecorder`, i.e. it has no native packet-level demux API, so the harness derives a packet table through a media-element pipeline that must load and play the asset — three orders of magnitude slower for a micro file.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, but lost on performance: 8.86 ms wall = 2.02x slower than mp4box. Also the only engine with a non-zero maxPtsDriftUs (2µs) from its timestamp reconstruction; within tolerance but structurally less exact than mp4box's 0µs.
- **remotion-webcodecs@4.0.479** — PASS; 9.05 ms wall (2.06x slower). webcodecs streaming-backpressure pipeline overhead dominates a 6-packet demux.
- **ffmpeg.wasm@0.12.15** — PASS; 10.26 ms wall (2.33x slower). libavformat demux through wasm carries module/marshalling overhead disproportionate to a 1.4 KB file.
- **remotion-media-parser@4.0.479** — PASS; 10.34 ms wall (2.35x slower). cpu-js full-parse via webReader; same algorithmic class as mp4box but a heavier reader abstraction.
- **web-demuxer@4.0.0** — PASS; 20.905 ms wall (4.76x slower). Slowest of the wasm-class engines; worker/wasm round-trip cost is large relative to the tiny payload.
- **platform@chrome-149** — PASS; 6000.82 ms wall (1365x slower). No native packet-demux API — operation realized through a `<video>`/MediaRecorder pipeline that must load and play the asset.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:304-312` — `SIZE_CASES` entry `{ asset: 'micro_audio_short.m4a', container: 'mp4', bucket: 'micro', audioCodecs: ['aac'] }`. Note explicitly documents the 6-packet AAC, the -23220µs priming pts, and that the oracle's constant-origin tolerance absorbs the edit-list/priming shift — honest gating rationale.
- **Fixture:** `fixtures/media/micro_audio_short.m4a` exists, 1.4 KB — a real (tiny but valid) AAC-in-MP4 file, not synthetic/empty/mock. Golden `fixtures/golden/micro_audio_short.m4a.packets.json` exists with 6 physically plausible packets (sizes 133/162/60/66/129/5 bytes, monotonic 23220µs spacing ≈ 1024-sample AAC frame at 44.1 kHz, first pts -23220µs = encoder delay).
- **Oracle:** `golden-packets` at `src/core/oracles.ts:703-796`. Performs a real per-track, size-exact + keyframe-exact comparison; timestamps allow only a *constant* per-track origin offset (`oracles.ts:772-784`) with a 1 ms residual tolerance — it is NOT trivially satisfiable (a wrong sample count, wrong size, or varying timing residual all FAIL). The shard measurements (measuredCount=6, goldenCount=6, comparedTracks=1, maxPtsDriftUs 0/2) are consistent with the golden.
- **Winner adapter:** `src/engines/mp4box/adapter.ts:765-804` (`demux`). Genuinely calls mp4box.js: `parseToInfo` + `setExtractionOptions` + `start/flush/stop`, and reads real per-sample `size`/`cts`/`dts`/`is_sync` in `onSamples` (`adapter.ts:776-787`). No canned output, no input→output copy, no golden short-circuit, no error swallowing.
- **Verdict:** **REAL** — real fixture, real mp4box.js sample-table walk, meaningful size/keyframe/timing oracle.
- **Cached note:** ALL 7 engine results have `cached:true` ("cached previous PASS result"). The numbers were reused, not re-run this session — standard staleness caveat applies, but the underlying implementation and oracle are sound.

## Confidence & caveats

- **Confidence: high** on the REAL verdict (code paths, fixture, and oracle all verified). **Medium** on the precise performance ranking: every bench is `n:1, warmup:1, mad:0` (single sample, no spread), so the wall medians are point estimates. The mp4box-vs-mediabunny gap (4.395 vs 8.86 ms) is ~4.5 ms on n=1 — directionally robust (mp4box is a pure-JS synchronous walk vs webcodecs pipelines) but not statistically tight.
- All results are cached; a fresh re-run could shift sub-10ms medians, though the platform outlier (6000 ms) and the pure-JS-vs-pipeline structure make the ordering qualitatively stable.
- Correctness is a genuine 7-way tie; the win is purely on latency for this micro AAC-in-MP4 demux.
