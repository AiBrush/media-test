# demux/h264_rotated90

- **Family:** demux
- **Fixture asset:** `fixtures/media/h264_rotated90.mp4` (4.4 MB, real H.264/AAC MP4 carrying a 90° display matrix)
- **Golden:** `fixtures/golden/h264_rotated90.mp4.packets.json` (770 packets)
- **Primary metric:** wall (ms, lower better)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** mediabunny@1.48.0 — **CONTESTED** (all 7 engines PASS the single gating oracle `golden-packets` with identical strength).
- **Decisive factor:** PERFORMANCE. Correctness is a flat tie (every engine reproduces the 770-packet table across 2 tracks with `maxPtsDriftUs` ≤ 1, 0 size/keyframe mismatches), so the win is decided on wall-clock.
- **Margin over runner-up:** mediabunny **10.565 ms** vs mp4box **14.66 ms** = **1.39x faster wall**. Against the rest the gap is much larger: 2.38x vs ffmpeg.wasm, ~33x vs the remotion pair, ~80x vs web-demuxer, ~568x vs the platform path.
- **Caveat:** all results are `cached==true` and every bench is **n==1** (mad=0, p95==median because there is a single sample). The performance ranking is real but statistically thin — see Confidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true | **10.565** | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true | 14.66 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 25.105 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 346.15 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 357.32 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true | 845.245 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 6001.2 | n/a | n/a | n/a | cached previous PASS result |

(The bench block for every engine contains only `wall`; throughputRealtime/peakMemory/longtasks were not recorded for this demux row.)

## Why the winner wins (deep technical)

**The operation.** This is a pure container-demux correctness probe over an H.264 (avcC) + AAC MP4 whose `tkhd` carries a 90° rotation matrix. The scenario note (`src/scenarios/demux/index.ts:162-164`) makes the intent explicit: rotation is a *display* property and must NOT perturb the packet table — `trackIndex`/`keyframe`/`size`/`pts` under the 90° matrix must match golden verbatim. So the test rewards a demuxer that walks the `stbl` sample tables (`stsz` sizes, `stss` keyframes, `stts`/`ctts` timestamps) and ignores the display matrix entirely. Every engine that did this passed; the matrix is a red herring for demux and none of them mis-counted because of it.

**Why correctness is a tie.** The gating oracle `goldenPackets` (`src/core/oracles.ts:703-796`) groups both sides per `trackIndex`, sorts by `dtsUs`/`ptsUs`, then compares `size` exactly, `keyframe` flag exactly, and pts/dts residual within ±1000 µs after removing a constant per-track origin offset (edit-list / priming tolerance, `tsTolUs = seekToleranceUs`, line 738). The shard shows every engine landing on `measuredCount:770 / goldenCount:770 / comparedTracks:2` with `maxPtsDriftUs` of 0 (ffmpeg.wasm, mp4box-... actually 1, web-demuxer 0) or 1 (mediabunny, mp4box, remotion-webcodecs, remotion-media-parser, platform). A 1 µs drift is rounding noise, well inside the 1000 µs gate. There is exactly one oracle and it is structural/metadata-exact, so the ladder cannot separate the engines on correctness — the decision falls through to performance per the procedure.

**How mediabunny wins on wall.** Mediabunny's demux path (`src/engines/mediabunny/adapter.ts:1152-1183`) opens the MP4 with a format-restricted `Input` and, per track, drains a real `EncodedPacketSink.packets(undefined, undefined, { verifyKeyPackets:true })` (line 1162-1167), emitting `{ trackIndex, size: pkt.byteLength, ptsUs: pkt.microsecondTimestamp, dtsUs===ptsUs, keyframe: pkt.type==='key' }`. This is a pure-TS ESM core (`configUsed.coreBuild: "pure-ts-esm"`, `backend: "webcodecs"` but for demux no decoder is spun up) that reads the `stbl` tables directly with no WASM module to instantiate and no worker handshake. That is why it lands at 10.565 ms — essentially the cost of parsing the moov + iterating two sample tables. mp4box (`backend: pure-js`, `pipeline: whole-file-append`) does the same conceptual work at 14.66 ms; the 1.39x gap is mediabunny's leaner streaming sample-table walk vs mp4box's whole-file `MP4Box.appendBuffer` ISO parse. ffmpeg.wasm at 25.105 ms pays the libavformat WASM demux overhead even though it never has to decode. The remotion pair (~346–357 ms) and web-demuxer (845 ms) are an order(s) of magnitude slower, and the `platform` Chrome path at 6001 ms is pathological for demux because its “demux” is actually realized through a WebCodecs/`<video>` pipeline (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`) — it instantiates a hardware decoder and runs frames just to recover a packet table, which is the wrong tool for a metadata-only probe.

**Tiebreaker hygiene.** Mediabunny additionally needs **no COOP/COEP** (`coopCoep: "not-required"`, `sharedArrayBuffer:false`), no WASM threads, and streams rather than buffering the whole file — so beyond being fastest it is also the cheapest to deploy. That reinforces the wall-clock decision.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS, runner-up. Correct (770 pkts, maxPtsDriftUs 1) but 14.66 ms = **1.39x slower** than mediabunny; its `whole-file-append(MP4BoxBuffer+fileStart)` pure-JS parse buffers the entire file before yielding samples, costing more than mediabunny's streaming sample-table walk.
- **ffmpeg.wasm@0.12.15** — PASS. Correct (maxPtsDriftUs 0) but 25.105 ms = **2.38x slower**; pays libavformat-in-WASM demux startup/parse overhead for a job that needs no codec work.
- **remotion-media-parser@4.0.479** — PASS. Correct but 346.15 ms = **~33x slower**; `cpu-js` full-parse demux (`fieldsTier: full-parse(demux)`) over the whole stream in JS.
- **remotion-webcodecs@4.0.479** — PASS. Correct but 357.32 ms = **~34x slower**; the webcodecs-oriented streaming-backpressure pipeline is heavyweight for a pure packet-table read.
- **web-demuxer@4.0.0** — PASS. Correct (maxPtsDriftUs 0) but 845.245 ms = **~80x slower**; ffmpeg-in-WASM worker demuxer with high fixed setup cost.
- **platform@chrome-149** — PASS. Correct but **6001.2 ms = ~568x slower**; the browser path has no native packet-table API, so it drives a full `VideoDecoder`/`<video>`→canvas pipeline to reconstruct packets — enormous overkill for demux.

## Anti-cheat validation

- **Scenario:** `src/scenarios/demux/index.ts:157-165` declares `asset: 'h264_rotated90.mp4'`, container mp4, videoCodecs h264, audioCodecs aac, with the rotation-invariance rationale in `notes`.
- **Fixture exists:** `fixtures/media/h264_rotated90.mp4` present, **4.4 MB** — a real encoded MP4, not synthetic/empty/mock.
- **Golden exists:** `fixtures/golden/h264_rotated90.mp4.packets.json` present, **770 packets** — matches every engine's `measuredCount:770`. Physically plausible for a multi-second 30fps H.264+AAC clip (2 tracks).
- **Oracle:** `golden-packets` at `src/core/oracles.ts:703-796` performs a real per-track exact comparison of count, trackIndex layout, packet **size** (exact), **keyframe** flag (exact), and pts/dts drift within ±1000 µs after constant origin alignment. It is not trivially satisfiable: any size or keyframe mismatch, count mismatch, or varying timing residual fails. This is a structural/metadata-exact gate, not a smoke or wide-tolerance gate.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1152-1183` — genuine demux via real `EncodedPacketSink.packets({verifyKeyPackets:true})`, reading actual `pkt.byteLength` / `pkt.microsecondTimestamp` / `pkt.type`. No canned output, no copy of golden, no error-swallow-then-report-success. `dtsUs===ptsUs` is honestly documented (mediabunny abstracts DTS; the oracle's per-track sort + offset tolerance accommodates this without weakening size/keyframe checks).
- **Cached note:** **All 7 results are `cached==true`** (reused from a prior run; mediabunny startedAt 2026-06-22T14:10:23Z). The ranking reflects a previous run, not a fresh re-execution — staleness risk per the launcher-seeding caveat.
- **Verdict:** **REAL** — real 4.4 MB fixture, real golden (770 pkts), genuine library-backed demux in the winner, and a meaningful exact-comparison oracle.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict is solid (real fixture, real golden, strict oracle, all numbers physically plausible). The *winner* ranking rests entirely on wall-clock because correctness is a 7-way tie.
- **Statistical thinness:** every bench is **n==1** (mad=0, p95==median by construction). The 1.39x mediabunny-over-mp4box margin is plausible but a single-sample measurement; it is not a high-confidence performance separation. The large gaps (vs remotion/web-demuxer/platform) are robust to sampling noise.
- **All results cached** — not re-run this cycle; numbers could be stale relative to current adapters.
- No throughputRealtime / peakMemory / longtasks were recorded for this row, so the performance tiebreak used wall only.
