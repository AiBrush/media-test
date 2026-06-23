# performance/size-ladder-iterate-packets-huge

**Family:** performance · **Fixture asset:** `huge_h264_1080p_600s.mov` (448 MB faststart MOV, H.264 video + AAC audio) · **Primary metric:** `packetsPerSec` (higher better) · **passCount:** 7 / 7

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479`? No — see below. The winner is **`remotion-webcodecs@4.0.479`**.
- **Contested:** YES. All 7 engines PASS the gating oracle (`golden-packets`, 46126 packets, maxPtsDriftUs ≤ 1). Correctness is therefore identical across every engine, so the contest is decided purely on the primary performance metric `packetsPerSec`.
- **Decisive factor:** `packetsPerSec` median. remotion-webcodecs = **4,314,873.7 packets/s** (wall 10.69 ms) vs runner-up web-demuxer = **3,346,100.8 packets/s** (wall 13.79 ms).
- **Margin over runner-up:** **1.29x more packets/s** and **1.29x lower wall** (10.69 ms vs 13.79 ms). Both winners share the *identical* moov-only sample-table code path, so this margin is within run-to-run noise (n=1, mad=0 for both). The gap to the nearest non-fast-path engine (mp4box, 53,390.9 packets/s) is **~81x**.

## Per-engine results

| Engine | Status | Oracles passed | wall median (ms) | throughputRealtime (x-rt) | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 10.69 | 56,127.2 | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true | 13.79 | 43,525.6 | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true | 863.93 | 694.50 | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 976.55 | 614.41 | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 1,333.75 | 449.86 | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true | 1,802.18 | 332.93 | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | (no bench) | (no bench) | n/a | n/a | cached: bench timeout: operation exceeded timeout of 300000ms |

packetsPerSec (primary): remotion-webcodecs 4,314,873.7 > web-demuxer 3,346,100.8 > mp4box 53,390.9 > ffmpeg.wasm 47,233.6 > platform 34,583.6 > mediabunny 25,594.6 > remotion-media-parser (no sample, timed out). All cached==true. No engine produced peakMemory/longtasks samples (not cross-origin-isolated; honestly null, not zero).

## Why the winner wins (deep technical)

The asset is a **600-second, 448 MB faststart `.mov`** carrying an H.264 video track (18000 samples ≈ 30 fps, 300 sync samples ≈ closed GOP `-g 60`/2s IDR cadence) and an AAC audio track (28126 samples, all keyframes, first-packet pts −21333µs from container priming/edit-list). The operation is "iterate every video packet"; the `golden-packets` oracle (`src/core/oracles.ts:703`) only compares **packet-table fields** — per-track `size`, `keyframe` flag (exact), and pts/dts with a ±1ms per-track-origin-aligned tolerance. Crucially, every one of those fields is fully recoverable from the ISO-BMFF **moov sample tables** (`stsz`/`stts`/`ctts`/`stss`) without ever touching the 448 MB `mdat`.

remotion-webcodecs exploits exactly this. Its `demux()` routes to a moov-only fast path at `src/engines/remotion-webcodecs/adapter.ts:395-399`, calling `demuxProgressiveMp4SampleTable()` (`src/engines/remotion-webcodecs/mp4-sample-table.ts:43-54`). That helper issues an HTTP Range read for the first 64 KB to locate the top-level `moov` (`readMoovBox`, line 71-92), reads just the moov box, then derives one `PacketInfo` per sample directly from `stsz` sizes, `stts` deltas (→ dts), `ctts` offsets (→ pts), and `stss` (→ keyframe) in `sampleTableFromTrak` (line 145-191 of the web-demuxer sibling; equivalent logic in the remotion file). Because it reads on the order of a few MB of moov instead of streaming 448 MB through a codec packet demuxer, it emits all 46126 packet rows in a **10.69 ms** wall — yielding the **4.31M packets/s** figure. The config confirms the path: `env.configUsed.adapterFastPaths = ["mp4-sample-table:http-range for selected large/progressive MP4/MOV demux rows", ...]`. The oracle measured `measuredCount=46126 == goldenCount=46126`, `comparedTracks=2`, `maxPtsDriftUs=1` — i.e. the moov-derived timestamps match the ffprobe golden to within 1µs, and per-track sizes/keyframe flags matched exactly (no diffs).

web-demuxer (runner-up) uses the **same** allowlisted moov fast path (`src/engines/web-demuxer/adapter.ts:764-767` → `src/engines/web-demuxer/mp4-sample-table.ts:48-61`), so it produces an identically-correct table; its only difference is a marginally slower 13.79 ms wall (3.35M packets/s). The 1.29x gap between the two is not a fundamental algorithmic advantage — both parse the same tables over the same Range read — so it is best read as measurement noise on a single (n=1, mad=0) sample.

The remaining four PASS engines do the *honest, full* demux and therefore are 18x–81x slower because they actually walk the elementary stream: mp4box (863.93 ms, pure-JS whole-file append `MP4BoxBuffer+fileStart`), ffmpeg.wasm (976.55 ms, single-thread wasm), platform/WebCodecs path (1,333.75 ms), and mediabunny (1,802.18 ms, streaming-lockstep WebCodecs). They are correct but pay the cost the fast path avoids.

## What each other framework did wrong

- **web-demuxer@4.0.0** — PASS, lost on performance only. Same moov fast-path code, but 13.79 ms wall vs winner's 10.69 ms → **3.35M vs 4.31M packets/s (0.78x)**. Effectively a tie; loses by a noise-level margin (n=1).
- **mp4box@2.3.0** — PASS but **80.8x slower** (53,390.9 packets/s, 863.93 ms). `configUsed` = `pure-js`, `whole-file-append(MP4BoxBuffer+fileStart)`, `rangeReads:false` — it ingests the entire 448 MB file in JS to enumerate samples rather than reading moov alone.
- **ffmpeg.wasm@0.12.15** — PASS but **91.4x slower** (47,233.6 packets/s, 976.55 ms). Single-thread wasm FFmpeg demux of the full file; no fast path.
- **platform@chrome-149** — PASS but **124.8x slower** (34,583.6 packets/s, 1,333.75 ms). WebCodecs `streaming` pipeline; pays full demux cost.
- **mediabunny@1.48.0** — PASS but **168.6x slower** (25,594.6 packets/s, 1,802.18 ms). `streaming-lockstep` WebCodecs, `coopCoep:not-required`, no moov shortcut; slowest of the bench-producing PASS engines.
- **remotion-media-parser@4.0.479** — PASS on the oracle (cached) but **produced NO bench sample**: `reason = "cached: bench timeout: operation exceeded timeout of 300000ms"`. Its `cpu-js`/`webReader` streaming `full-parse(demux)` path (configUsed) cannot demux the 448 MB MOV within the 300s `T_HUGE` cap, so it has no `packetsPerSec` and cannot rank on the primary metric — disqualified from the win despite a correct packet table. This is the exact lazy-reader/OOM hang the size-axis case exists to expose (size-ladder.ts:33).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/size-ladder.ts:86-100` (the `iterateLadder` builder, `op:'demux'`, `oracles:['golden-packets']`, `primary:'packetsPerSec'`, `timeoutMs:T_HUGE=300000`); the `huge` rung maps to `LADDER.huge = 'huge_h264_1080p_600s.mov'` at `src/scenarios/performance/_shared.ts:80`.
- **Fixture exists & is real:** `fixtures/media/huge_h264_1080p_600s.mov` = **448 MB** on disk (verified via stat). Not synthetic/empty.
- **Golden is real:** `fixtures/golden/huge_h264_1080p_600s.mov.packets.json` = 5.4 MB, **46126 packets** (18000 video / 300 keyframes / 30 fps / ~600s; 28126 AAC audio / all keyframes / −21333µs first pts) — physically consistent with the encode and with ffprobe semantics. NOTE: the source comments (size-ladder.ts:21, _shared.ts:80) claim this rung's golden is "NOT yet baked → NA until bake"; the golden has since been baked, so the cases now rank for real. Stale comment, not a cheat.
- **Oracle:** `goldenPackets` at `src/core/oracles.ts:703-796` performs a genuine order-independent per-track comparison: exact `size` and `keyframe`-flag equality, count + trackIndex-layout equality, and pts/dts within ±1ms after constant per-track origin alignment. Not trivially satisfiable; no SSIM/exactFrames==0 proxy; not smoke-only. Measured `maxPtsDriftUs=1` confirms a real, tight match.
- **Winner adapter:** `src/engines/remotion-webcodecs/adapter.ts:395-399` → `src/engines/remotion-webcodecs/mp4-sample-table.ts:43-54,71-92`. The path reads the REAL moov box over HTTP Range and derives REAL packet rows from `stsz/stts/ctts/stss`. The file header (line 10) and code confirm it **never reads mdat and never fabricates packets from duration or fps** — there is no canned output, no copy-input-to-output, no short-circuit to the golden file, no swallowed error (failures throw).
- **Verdict:** **WEAK-GATE.** The PASS is genuinely correct (real fixture, real moov parse, strong exact oracle), so this is not a CHEAT. However the fast path is gated by a **hardcoded per-asset allowlist** — `SAMPLE_TABLE_FAST_PATH_ASSETS` literally lists `'huge_h264_1080p_600s.mov'` (mp4-sample-table.ts:15-19 in both winner adapters) rather than detecting faststart/progressive layout generically. The 4.31M packets/s headline therefore reflects a benchmark-fixture-specific optimization, not a general-purpose demux throughput. The comparison against mp4box/ffmpeg.wasm/mediabunny (which do full demux) is apples-to-oranges: the winner is timing moov-table parsing while the losers time full elementary-stream enumeration. The PASS is real; the throughput ranking is "loose" in the sense that it rewards skipping mdat on a hand-listed asset.
- **Cached note:** ALL 7 results have `cached==true` (winner reused from 2026-06-22T13:52:12Z). Numbers were reused, not re-run this pass — staleness risk noted, though the deterministic moov-only path makes the figure reproducible.

## Confidence & caveats

- **Confidence: medium.** Oracle, fixture, golden, and adapter code paths were all read and verified; the correctness PASS is solid and the metric ordering is unambiguous.
- The two top engines share identical code; their 1.29x separation is within noise (n=1, mad=0, p95==median for every engine — single-shot benches). Treat the winner over web-demuxer as effectively a tie.
- The decisive `packetsPerSec` figures are not comparable across the two implementation classes (moov-fast-path engines vs full-demux engines); the WEAK-GATE verdict captures this.
- remotion-media-parser's timeout means the leaderboard cannot rank it on this rung even though its packet table is correct.
- All evidence is from cached results; a fresh re-run is advisable before publishing the absolute numbers.
