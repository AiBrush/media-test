# performance/extract-metadata

- **family:** performance
- **fixture asset:** `h264_1080p_30s.mp4` (31 MB, 1080p H.264 video + AAC stereo, MP4/isom, 30 s) — golden `fixtures/golden/h264_1080p_30s.mp4.meta.json`
- **primaryMetric:** opsPerSec (higher is better); `wall` kept for context
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479`
- **Contested:** YES — all 7 engines PASS the single gating oracle (`golden-metadata`) with effectively identical correctness, so the decision falls to performance.
- **Decisive factor:** primaryMetric `opsPerSec`. remotion-media-parser scores **289.44 ops/s** (wall median **3.455 ms**), the highest of the field.
- **Margin over runner-up:** **2.30x** the ops/s of `remotion-webcodecs@4.0.479` (289.44 vs 125.79 ops/s); equivalently **2.30x faster wall** (3.455 ms vs 7.95 ms). Against the strongest non-Remotion engine (web-demuxer, 33.20 ops/s) the margin is **8.72x**.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | opsPerSec | durationDeltaSec | reason |
|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 3.455 | 289.44 | 0 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 7.95 | 125.79 | 0 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 30.125 | 33.20 | 0 | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 62.275 | 16.06 | 0 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 88.655 | 11.28 | 0 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 270.64 | 3.69 | 0 | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 6000.605 | 0.167 | 0.0213 | cached previous PASS result |

(No throughputRealtime / peakMemory / longtasks metrics are recorded for this scenario; the bench block carries only `opsPerSec` and `wall`. All n=1, warmup=1, mad=0, p95==median.)

## Why the winner wins (deep technical)

The operation is `op: 'probe'` — read normalized container metadata (container, duration, per-track codec/dims/fps/sampleRate/channels) and nothing else. The scenario (`src/scenarios/performance/index.ts:86-102`) deliberately runs this **repeatedly inside the bench window** and scores probes/second, so the contest is about **per-call metadata-extraction overhead on the same 31 MB MP4**, not about decode/transcode throughput. Correctness is gated but the gate is satisfied identically by everyone, so the ranking is pure per-call latency.

remotion-media-parser wins because its probe is a true **header-only streaming parse**. Its adapter (`src/engines/remotion-media-parser/adapter.ts:348-417`) calls `parseMedia` (via `runParse`, tier `'metadata-only'`) requesting only `{ durationInSeconds, container, tracks, metadata, rotation }` and, critically, requests `fps` only when the container header does not already carry it (`includeContainerFps = headerFps == null`, line 362). For an faststart MP4 like this fixture the moov atom is at the front and fully describes both tracks, so media-parser reads the `moov` box, populates duration/codec/dims/fps from `stsd`/`mvhd`/`mdhd`, and **returns without walking the sample table or the mdat** — the `needsSingleVideoFpsFallback` slow-fps path (lines 403-416) is never taken for a well-formed MP4. env.configUsed confirms the lightweight path: `backend: "cpu-js"`, `pipeline: "streaming"`, `reader: "webReader"`, `fieldsTier: "metadata-only"`, `worker: false`. The result is wall **3.455 ms** / **289.44 ops/s**, validated by `golden-metadata` with `durationDeltaSec: 0` against a tolerance of `0.041667 s` (one frame at 24 fps; the strict band) and a 2-track match.

The runner-up, remotion-webcodecs (125.79 ops/s, 7.95 ms), uses the same family but goes through its WebCodecs-oriented convert/parse stack (`backend: "webcodecs"`, `pipeline: "streaming-backpressure"`); its probe path carries extra setup (worker-capable parse plumbing, MP4 sample-table fast-path machinery) that adds ~4.5 ms of fixed per-call cost the pure media-parser avoids — a 2.30x gap on a sub-10 ms operation. Everyone below is dominated by container-parser or wasm/codec init overhead amortized per probe: web-demuxer (33.20 ops/s) and mp4box (16.06 ops/s) are pure-JS box parsers that buffer/append more of the file (mp4box config: `whole-file-append(MP4BoxBuffer+fileStart)`); ffmpeg.wasm (11.28 ops/s) pays libavformat probe + wasm boundary cost; mediabunny (3.69 ops/s, 270.64 ms) and especially platform (0.167 ops/s, 6000 ms) spin up far heavier machinery — the `platform` engine drives an actual `<video>`/HTMLMediaElement load+`loadedmetadata` cycle, which is ~1700x slower per probe than a header read, though it still lands inside the duration tolerance (Δ 0.0213 s < 0.0417 s).

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS but lost on speed: 125.79 ops/s vs 289.44 (0.435x), 7.95 ms vs 3.455 ms wall. Same correctness (durationDelta 0), but the WebCodecs streaming-backpressure stack adds fixed per-probe overhead the bare media-parser header read avoids.
- **web-demuxer@4.0.0** — PASS, 33.20 ops/s (0.115x of winner), 30.125 ms. wasm/ffmpeg-based demuxer probe is ~8.7x slower per call.
- **mp4box@2.3.0** — PASS, 16.06 ops/s (0.055x), 62.275 ms. Pure-JS whole-file append parser (`whole-file-append(MP4BoxBuffer+fileStart)`); higher per-probe parse cost.
- **ffmpeg.wasm@0.12.15** — PASS, 11.28 ops/s (0.039x), 88.655 ms. libavformat probe across the wasm boundary; correct but heavy.
- **mediabunny@1.48.0** — PASS, 3.69 ops/s (0.0128x), 270.64 ms. Streaming-lockstep WebCodecs path far heavier than a header-only read for a pure probe.
- **platform@chrome-149** — PASS but worst, 0.167 ops/s (0.00058x), 6000.6 ms. HTMLMediaElement-based metadata load is ~78x slower than the next engine; the only engine with a non-zero durationDelta (0.0213 s, still within the 0.0417 s band).

No NA or FAIL engines: every adapter declares `probe` and the runtime supports it, so the capability gate in `src/core/runner.ts` admitted all 7.

## Anti-cheat validation

- **Scenario:** `src/scenarios/performance/index.ts:86-102` — `id: 'performance/extract-metadata'`, `op: 'probe'`, `input: BIG_READ_ASSET` (`= 'h264_1080p_30s.mp4'`, line 73). Notes confirm intent: "repeated metadata extraction on the big-read 1080p H.264 file ... Score = probes/sec; correctness gated by golden-metadata."
- **Fixture exists / is real:** `fixtures/media/h264_1080p_30s.mp4` present, **31 MB** real H.264/AAC MP4 (not synthetic/empty/mock). Golden `fixtures/golden/h264_1080p_30s.mp4.meta.json` carries physically plausible values (mp4, 30 s, video h264 1920x1080 30fps 8.2 Mbit/s, audio aac 48000 Hz stereo 128 kbit/s).
- **Oracle:** `golden-metadata` in `src/core/oracles.ts:595-657`. Performs a REAL field-by-field comparison: container string (line 606), duration within a per-container tolerance (lines 614-637; here the strict ±1-frame band 0.0417 s), positional per-track codec/width/height/fps/sampleRate/channels (lines 643-682 via `compareTrack`). Not trivially satisfiable — any wrong container, missing track, or out-of-band duration FAILs. Winner measurements (`durationDeltaSec: 0`, 2-track match) are consistent with reading the moov directly.
- **Winner adapter:** `src/engines/remotion-media-parser/adapter.ts:348-417` (`probe`) calls the real `parseMedia` library (imported line 70) with a metadata-only field set; no canned/hardcoded metadata, no short-circuit to the golden file, no swallowed errors. Capabilities declare only `probe`/`demux` (lines 188-219), matching a read-only parser.
- **Cached note:** **All 7 results have `cached: true` ("cached previous PASS result")** — none were re-run in this batch, so the absolute ops/s are reused timings. This is a staleness risk for the exact numbers but the relative ordering (a 2.3x–8.7x spread) is large and architecturally expected.
- **Verdict:** **REAL** — real 31 MB fixture, genuine library-backed probe, and a meaningful multi-field metadata oracle with a strict 1-frame duration band. The only caveat is statistical (n=1, cached), not a cheat.

## Confidence & caveats

- **Confidence: medium.** The winner and its margin are unambiguous on the primary metric, the implementation is genuine, and the oracle is real. But every sample is **n=1 with warmup=1 and cached=true**, so the precise ops/s figures are single-shot and reused; the 2.30x lead over remotion-webcodecs is comfortable but a re-run could shift the exact ratio.
- Correctness does not separate the engines here (one shared oracle, all pass with durationDelta 0 except platform's still-in-band 0.0213 s), so this is a **performance-decided** win, not a correctness-strength win.
- No memory/longtask/throughput metrics were captured, so tiebreakers (c) could not be quantified; remotion-media-parser additionally has the lightest footprint (`cpu-js`, no worker, no COOP/COEP) which reinforces the win.
