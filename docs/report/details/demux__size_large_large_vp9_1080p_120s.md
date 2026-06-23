# demux/size_large_large_vp9_1080p_120s

- **Family:** demux
- **Fixture asset:** `fixtures/media/large_vp9_1080p_120s.webm` (102 MB, real WebM, VP9 video + Opus audio, 1080p / 120 s)
- **Golden:** `fixtures/golden/large_vp9_1080p_120s.webm.packets.json` (1.1 MB, 9601 packets across 2 tracks)
- **primaryMetric:** wall (scenario is `memoryGated`, so SCALE_METRICS = wall, peakMemory, longtasks)
- **passCount:** 6 of 7 (mp4box NA_ENGINE)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES — 6 engines PASS the same gating oracle (golden-packets) with identical correctness.
- **Decisive factor:** wall median. Correctness is a perfect tie (all 6 report `measuredCount=9601`, `goldenCount=9601`, `comparedTracks=2`, `maxPtsDriftUs=0`), so the ranking falls to performance. ffmpeg-wasm has the lowest wall median (268.5 ms).
- **Margin over runner-up:** 268.5 ms vs mediabunny 362.0 ms = **1.35x faster wall**. Over the slowest PASS (web-demuxer 9213.8 ms) the margin is **34.3x**.
- **Caveat:** all six wall medians are single-sample (n=1, mad=0, p95==median) and every result is `cached==true`. The win is real but the evidence is thin (see Confidence).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass | 268.50 | n/a (not recorded) | 0 (n=0) | 1394 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:pass | 362.02 | n/a | 0 (n=0) | 173 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass | 796.06 | n/a | 0 (n=0) | 179 | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass | 924.75 | n/a | 0 (n=0) | 1394 | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass | 6042.16 | n/a | 0 (n=0) | 1073 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass | 9213.81 | n/a | 0 (n=0) | 1394 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |

All six PASS rows carry the identical golden-packets measurement: `{measuredCount:9601, goldenCount:9601, comparedTracks:2, maxPtsDriftUs:0}`.

## Why the winner wins (deep technical)

This is a **demux-only** scenario: each engine must walk the WebM/Matroska cluster structure of a 102 MB, 120-second, 1080p VP9 + Opus file and emit the full per-track packet table (sizes, keyframe flags, presentation/decode timestamps). No decoding is required, so a hardware WebCodecs pixel path provides no advantage here — the work is pure container parsing and packet enumeration. Correctness is settled identically by all six engines: the golden-packets oracle (`src/core/oracles.ts:703`) groups both sides per-track, sorts by dts then pts, and compares position-by-position requiring **exact** size and keyframe-flag equality plus pts/dts drift within ±1 ms after a constant per-track origin alignment (`oracles.ts:774-792`). All six produced exactly 9601 packets across the 2 tracks with `maxPtsDriftUs=0` — a bit-stable packet table, the strongest non-decoding correctness signal available for demux. So the ladder's correctness tier is exhausted as a tie and the decision moves to performance.

ffmpeg-wasm wins on the primaryMetric (wall) at **268.5 ms**. Its demux path is genuinely implemented: `demux()` runs the real vendored ffmpeg binary with `-c copy -f framecrc` and parses the framecrc text output one line per packet (`src/engines/ffmpeg-wasm/adapter.ts:441-489`). The framecrc muxer emits `stream, dts, pts, duration, size, 0xCRC[, F=0x<flags>]`; the adapter derives keyframe state from the `F=` flag convention (no `F=` field OR low bit set == keyframe, `adapter.ts:463-476`) and converts ticks to microseconds using the per-stream timebase (`adapter.ts:478-484`). Because `-c copy` performs a stream-copy (no re-encode, no decode), the WebM demuxer in the wasm core reads clusters and stream-copies packets straight to the null/framecrc sink — this is the cheapest possible exercise of a mature, heavily-optimized C demuxer compiled to wasm, which is why it edges out mediabunny's pure-TS Matroska reader.

mediabunny is the runner-up at 362.0 ms (1.35x slower). It is also a real implementation: `demux()` opens the input and iterates `EncodedPacketSink.packets(..., {verifyKeyPackets:true})` per track, pushing `{size: pkt.byteLength, ptsUs: pkt.microsecondTimestamp, keyframe: pkt.type==='key'}` (`src/engines/mediabunny/adapter.ts:1152-1183`). It runs the WebCodecs backend (`configUsed.backend="webcodecs"`, `coopCoep:not-required`) but for demux the codec backend is irrelevant — the cost is its TS-level Matroska cluster walk plus the `verifyKeyPackets` pass, which is competitive but not as fast as the native wasm stream-copy. Notably mediabunny's longtasks (173 ms) and remotion-webcodecs' (179 ms) are far lower than ffmpeg-wasm's reported 1394 ms; however longtasks is a secondary scale signal and the 1394 ms value is itself implausible (it exceeds ffmpeg-wasm's 268 ms total wall, which is physically impossible for a sub-task of that wall) — it appears to be a coarse/shared measurement artifact (four engines report the identical 1394) and is not trustworthy enough to override the primaryMetric. peakMemory is unrecorded (n=0, median 0) for every engine, so the memory gate provides no discrimination here despite `memoryGated:true`.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on performance only: wall 362.0 ms vs 268.5 ms = 1.35x slower. Identical correctness (9601 packets, drift 0). Its lower longtasks (173 ms) is the only metric where it leads, but longtasks is a secondary gate and primaryMetric (wall) decides.
- **remotion-webcodecs@4.0.479** — PASS, wall 796.1 ms = 2.97x slower than the winner. Same perfect packet table. Its MP4/MOV http-range fast-paths (`configUsed.adapterFastPaths`) do not apply to this WebM input, so it runs the generic streaming-backpressure parse.
- **remotion-media-parser@4.0.479** — PASS, wall 924.75 ms = 3.44x slower. Runs `backend:"cpu-js"`, `fieldsTier:"full-parse(demux)"`, single-threaded JS web reader — a pure-JS full parse is inherently slower than the native wasm stream-copy.
- **platform@chrome-149** — PASS, wall 6042.2 ms = 22.5x slower. The platform path drives `VideoDecoder`/`<video>` machinery (`configUsed.decode:"VideoDecoder"`); using a media-element/WebCodecs pipeline to enumerate packets for a 120 s 1080p file is far heavier than a direct container walk, hence the order-of-magnitude penalty.
- **web-demuxer@4.0.0** — PASS, wall 9213.8 ms = 34.3x slower (slowest PASS). Same correct 9601-packet table, but its wasm demux of the full 102 MB WebM is the slowest path measured.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare input container 'webm'". **Honest NA**: MP4Box.js is an ISO-BMFF (MP4/MOV) box parser and structurally cannot read a Matroska/WebM container, so the capability is genuinely absent, not under-declared.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:342-352` — asset `large_vp9_1080p_120s.webm`, container webm, bucket large, videoCodecs [vp9], audioCodecs [opus], `memoryGated:true`. Notes: "Large 120s 1080p VP9: WebM cluster walk at scale; peakMemory/longtasks recorded." Real, codec-/scale-appropriate gating rationale.
- **Fixture exists:** `fixtures/media/large_vp9_1080p_120s.webm` stat = 102 MB real file (not synthetic/empty/mock). Golden `fixtures/golden/large_vp9_1080p_120s.webm.packets.json` = 1.1 MB, encoding 9601 packets.
- **Gating oracle:** `golden-packets` at `src/core/oracles.ts:703-796`. Real comparison: requires exact packet count, exact per-track trackIndex layout, exact per-packet size and keyframe-flag equality, and pts/dts drift within ±1 ms (`tsTolUs = seekToleranceUs`) after constant per-track origin alignment. Not trivially satisfiable — a wrong packet count, a single size mismatch, or a flipped keyframe flag fails it. The reported measurements (9601 packets, 2 tracks, drift 0) are physically plausible for a 120 s 1080p VP9/Opus WebM.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts` — demux derives packets from the real `ffmpeg -c copy -f framecrc` exec output (parse at `adapter.ts:441-489`). No canned/hardcoded output, no input->output copy fake, no short-circuit to the golden, no error-swallowing (read execs use bounded `exec(args, timeoutMs)` and surface failures). Genuine library invocation.
- **Verdict:** **REAL** — real 102 MB WebM fixture + genuine native-wasm demux implementation + a strict structural oracle that compares against a 9601-packet golden with zero tolerance on sizes/keyframes.
- **Cached note:** every engine result has `cached==true` ("cached previous PASS result"). The numbers were reused, not freshly re-run this session — staleness risk applies to all six wall medians equally. Per the launcher seeding caveat, a fully honest fresh comparison would require clearing raw + .browser-cache and re-running.

## Confidence & caveats

- **Confidence:** medium. The winner determination is clean on correctness (perfect tie) and on the primaryMetric (ffmpeg-wasm lowest wall by a clear 1.35x margin), and the implementation/oracle/fixture are all verified REAL.
- **Caveats:** (1) Every bench is **n=1** (single sample, mad=0, p95==median) — the 1.35x wall margin over mediabunny is plausibly within run-to-run noise for a single sample; treat the head-to-head as suggestive, not statistically settled. (2) All results are **cached** — not re-run this session. (3) **peakMemory is unrecorded** (n=0) for all engines despite the memory gate, so the at-scale memory behavior this scenario is designed to probe was not actually captured. (4) The **longtasks=1394 ms** value reported by 4 engines is implausible (exceeds ffmpeg-wasm's own 268 ms wall) and looks like a coarse/shared measurement artifact; it was deliberately not used to override the primaryMetric.
