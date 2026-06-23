# remux/h264_1080p_5s_mov_to_ts

- **family:** remux
- **fixture asset:** `fixtures/media/h264_1080p_5s.mov` (4.4 MB, real H.264/AAC QuickTime/MOV) → target container MPEG-TS (`ts`)
- **primaryMetric:** wall (ms), correctness gated by `reference-reimport`
- **passCount:** 2 of 7 (mediabunny, ffmpeg.wasm)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — two engines PASS (mediabunny, ffmpeg.wasm); both satisfy the identical and only attached oracle (`reference-reimport`) with semantically equivalent results (2 media tracks preserved, ~387 packets re-imported, ~240 keyframes, duration within tolerance).
- **Decisive factor:** PERFORMANCE. Correctness is a tie (same single structural oracle, same track layout, both well inside duration tolerance). mediabunny wins on every measured metric.
- **Margin over runner-up (ffmpeg.wasm):**
  - wall median: 65.73 ms vs 620.49 ms → **9.44x faster**
  - throughputRealtime: 76.07x vs 8.06x → **9.44x higher**
  - longtasks (main-thread blocking): 1901 ms vs 19963 ms → **10.5x lower**
  - peakMemory: 52.5 MB vs not-measured (n=0 for ffmpeg.wasm, so no direct ratio).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | reference-reimport:pass | 65.73 ms | 76.07x | 52,498,110 B | 1901 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 620.49 ms | 8.06x | n/a (n=0) | 19963 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

**The operation.** This cell re-wraps a real H.264 (avc1) + AAC QuickTime/MOV into MPEG-TS. The coded video samples are unchanged, but the container framing must be rewritten: ISOBMFF/QuickTime stores NAL units length-prefixed (AVCC, 4-byte length headers, `avcC` parameter sets in the sample description), whereas MPEG-TS carries H.264 as an Annex-B elementary stream (00 00 00 01 start codes, SPS/PPS inlined ahead of IDR access units) packetized into 188-byte TS packets with PES headers, PAT/PMT, and a PCR. AAC similarly moves from MP4 `mp4a`/esds framing into ADTS-framed PES. So this is a lossless re-mux that genuinely exercises the AVCC→Annex-B NAL-framing rewrite plus full TS packetization — not a trivial copy.

**mediabunny's path.** The adapter routes `remux()` (src/engines/mediabunny/adapter.ts:1244) with no transform options straight into `makeOutputFormat('ts', …)` which returns `new MpegTsOutputFormat()` (src/engines/mediabunny/codecs.ts:172-173), opens the source with `openInput`, and runs `runConversion(...)` (adapter.ts:1250-1256). Because no codec/resolution/bitrate options are present, Conversion copies encoded samples and only the muxer changes — mediabunny's own MPEG-TS writer performs the AVCC→Annex-B re-framing and TS packetization in pure TypeScript. Container parsing/probe runs on the main thread but the heavy decode is avoided entirely (stream copy), and where WebCodecs is touched it uses `prefer-hardware` on an Apple M1 Max (env.configUsed.backend="webcodecs", hwAccel="prefer-hardware", pipeline="streaming-lockstep", wasmThreads=0, coopCoep="not-required"). The result: 65.73 ms wall, 76.07x realtime, only 1901 ms of long-task time, 52.5 MB peak.

**The oracle that gated it.** `reference-reimport` (src/core/oracles.ts:1225) feeds mediabunny's TS bytes back through the reference engine's `demux()` and, for an `op:'remux'`, runs `semanticRemuxReimport` (oracles.ts:1273). It confirms the output is a real, parseable container and that the media-track layout matches the golden. mediabunny's measurements are physically plausible for a 5 s 1080p H.264/AAC clip: **reimportPackets 388, reimportKeyframes 241, reimportMediaTracks 2 == goldenMediaTracks 2, durationDeltaSec 0.0773 within durationToleranceSec 0.75**. The small packet-count and keyframe difference vs ffmpeg.wasm (388/241 vs 386/239) is exactly the kind of TS repacketization / parameter-set-insertion jitter the semantic gate is designed to tolerate (it diffs track layout + duration, not exact packet counts, for remux ops).

**Why faster than ffmpeg.wasm for THIS job.** ffmpeg.wasm also does a genuine stream copy (`-map 0 -c copy` with `-muxdelay 0 -muxpreload 0`, src/engines/ffmpeg-wasm/adapter.ts:2044-2054), and it lands an even tighter duration delta (0.0347 s) because of the explicit mux-delay normalization. But it pays the WASM tax: the entire libavformat MOV demux + MPEG-TS mux runs in a single-threaded WebAssembly VM (no SharedArrayBuffer threads on this config), plus a `runInfo` probe pass and MEMFS write/read round-trips for the 4.4 MB input and the TS output. That is why its wall is 620 ms (9.44x slower) and it blocks the main thread for ~20 s of long-task time (10.5x more) — a poor UX cost for an operation mediabunny does natively with hardware-capable, COOP/COEP-free plumbing. Correctness being a wash, mediabunny's order-of-magnitude perf and main-thread responsiveness advantage is decisive.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** Correct lossless TS re-mux via `-map 0 -c copy` (adapter.ts:2044), even slightly better duration fidelity (Δ0.0347 s vs 0.0773 s). Lost purely on performance: 620.49 ms wall (9.44x slower), 8.06x realtime (9.44x lower throughput), 19963 ms longtasks (10.5x more main-thread blocking). Single-thread WASM + MEMFS I/O is the cost driver. peakMemory not even reported (bench n=0).
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'remux'" — honest NA. web-demuxer is a demux-only WASM wrapper; it has no muxer/output container path, so it cannot write TS. Not an under-declaration.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare output container 'ts'" — honest NA. mp4box.js is an ISOBMFF (MP4/MOV/fragmented MP4) tool; it has no MPEG-TS muxer. Correctly excluded rather than faking a path.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'remux'" — honest NA. The raw browser platform (WebCodecs + MediaSource) exposes decode/encode primitives but no remux/muxing-to-TS API, so there is no in-platform stream-copy-to-TS path.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare output container 'ts'" — honest NA. Remotion's WebCodecs converter targets MP4/WebM outputs; no MPEG-TS muxer.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'remux'" — honest NA. It is a parser/demuxer only; no muxing/output capability.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/remux/matrix.ts:45-52 — the `mov`→`ts` case for asset `h264_1080p_5s.mov`, built by `buildRemux` (src/scenarios/remux/_shared.ts:84) which yields id `remux/h264_1080p_5s_mov_to_ts` (`remuxId`, _shared.ts:73). op='remux', options.container='ts', requires containersIn=['mov'], containersOut=['ts'], videoCodecs=['h264'], audioCodecs=['aac']. Notes explicitly flag the AVCC→Annex-B NAL-framing rewrite as the point of the cell.
- **Fixture exists and is real:** `fixtures/media/h264_1080p_5s.mov` present, 4.4 MB — a real encoded H.264/AAC MOV, not synthetic/empty/mock. Goldens present: `h264_1080p_5s.mov.{frames,meta,packets,ssim}.json`.
- **Oracle is meaningful:** `reference-reimport` → `semanticRemuxReimport` (src/core/oracles.ts:1225, 1273) re-demuxes the engine's actual output bytes through the reference engine, rejects an empty packet table (oracles.ts:1244-1245), compares media-track count and per-type layout against golden (oracles.ts:1289-1298), and compares re-probed duration against golden within a container-aware tolerance (oracles.ts:1310-1323). It is a genuine structural-integrity gate against the golden, not trivially satisfiable. Note it is STRUCTURAL/metadata-exact strength, not bit-exact (no `decoded-frames-bitexact` attached — by design while source frame goldens are browser-bake placeholders, _shared.ts:20-22). Measurements (388 packets / 241 keyframes / 2 tracks / Δ0.077 s) are physically plausible for a 5 s 1080p clip.
- **Winner adapter is genuine:** src/engines/mediabunny/adapter.ts:1244-1259 calls real mediabunny `Output` + `MpegTsOutputFormat` + `runConversion`; no canned bytes, no input→output copy, no golden short-circuit, no swallowed error (throws if format unsupported). ffmpeg.wasm runner-up equally genuine (`-map 0 -c copy`, adapter.ts:2044).
- **Cached note:** Both PASS results have `cached==true` ("cached previous PASS result"). The numbers were reused from a prior run, not freshly re-executed in this report build — standard staleness risk applies (per the launcher-seeding caveat: stale PASS reuse). The verdict rests on the cached metrics; a clean re-run would strengthen confidence but the relative ordering (native TS muxer vs single-thread WASM) is robust to caching.
- **Verdict:** **REAL** — real 4.4 MB H.264/AAC MOV fixture + two genuine stream-copy TS-muxing implementations + a meaningful structural re-import oracle that compares against golden track layout and duration. Caveat: oracle is structural (not bit-exact), and evidence is cached.

## Confidence & caveats

- **Confidence: high** for the winner ranking. Correctness is a genuine tie on the only attached oracle; the performance gap is ~9-10x across all three measured axes, far beyond any caching/jitter noise.
- **Caveats:**
  - Both winners' bench rows are **n=1** (warmup=1, mad=0, p95==median): single-sample timing, so absolute numbers carry low statistical weight — but a 9.44x wall gap is decisive even at n=1.
  - Both results are **cached** (cached==true); not freshly re-run for this report.
  - The gate is **structural (reference-reimport), not bit-exact**; pixel identity of the re-wrapped H.264 stream is not directly proven here (it is asserted lossless by construction of `-c copy` / Conversion stream-copy). A `decoded-frames-bitexact` row would upgrade this from WEAK-on-strictness to fully bit-exact.
  - ffmpeg.wasm did not report peakMemory (bench n=0), so the memory comparison is one-sided.
