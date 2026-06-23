# probe/massive_h264_1080p_2h

family: probe | fixture asset: `massive_h264_1080p_2h.mp4` (1.1 GB, ~2h low-bitrate 1080p H.264 + AAC, MP4/isom) | primaryMetric: wall (ms) | passCount: 7 / 7

## Verdict

- **Best framework: remotion-webcodecs@4.0.479** (engineId `remotion-webcodecs@4.0.479`).
- **Contested: YES** — all 7 engines PASS the single gating oracle (`golden-metadata`), so correctness is a wash and the decision falls entirely to performance.
- **Decisive factor: wall median.** remotion-webcodecs reports the lowest wall median at **75.38 ms**.
- **Margin over runner-up:** essentially a statistical tie at the top. 75.38 ms vs remotion-media-parser's 75.75 ms = **1.005x faster (0.37 ms)** — within noise. It is **1.05x faster** than mediabunny (79.32 ms), and only meaningfully faster against the slower cohort: **12.1x** vs web-demuxer (908.96 ms), **25.8x** vs ffmpeg.wasm (1944.44 ms), **29.2x** vs mp4box (2197.84 ms), **45.6x** vs platform (3440.31 ms). All bench rows are **n=1, mad=0**, so the top-3 ordering is weak evidence; see caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 75.38 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 75.75 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 79.32 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 908.96 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 1944.44 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 2197.84 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 3440.31 ms | n/a | n/a | n/a | cached previous PASS result |

Notes: the shard's `bench` block carries only `wall`; throughputRealtime / peakMemory / longtasks were not recorded for this case (probe with `metrics: ['wall']`). All `golden-metadata` outcomes report `durationDeltaSec` 0 against `durationToleranceSec` 0.041666s, except **platform** which reports `durationDeltaSec` 0.021333s (still well inside the 1-frame band).

## Why the winner wins (deep technical)

This is the MASSIVE rung of the probe family: a ~1.1 GB, 2-hour, low-bitrate 1080p H.264/AAC progressive MP4 (`isom`, ~216k video samples). The scenario's notes (src/scenarios/probe/index.ts:322-324) state the requirement precisely: "probe must report ~2h duration from the moov WITHOUT walking the many-thousand-sample table (lazy/partial read, no OOM)." The golden (fixtures/golden/massive_h264_1080p_2h.mp4.meta.json) pins `durationSec: 7200`, video h264 1920x1080 @ 30fps, audio aac 48000 Hz mono. Because the file is faststart-style with the `moov` carrying an `mvhd` declaring the global timescale/duration, the entire correctness target is satisfiable from a small front-of-file header read; the discriminator at scale is whether an adapter resists the temptation to walk `stts`/`stsz`/`stco` (or every `moof`) to derive duration.

remotion-webcodecs wins because its probe path (src/engines/remotion-webcodecs/adapter.ts:332-355) asks `@remotion/media-parser parseMedia()` for only the cheap metadata-tier fields — `{ container, durationInSeconds, tracks, metadata }` — and the adapter docstring (adapter.ts:327-329) explicitly notes "`tracks` does not force a full decode pass; duration comes from the header where present." media-parser reads `durationInSeconds` straight out of the `mvhd`, so the cost is O(header bytes), not O(216k samples). That keeps wall at 75.38 ms even on a 1.1 GB input.

remotion-media-parser (the second-place engine, 75.75 ms) uses the SAME underlying library and an almost identical field set plus `rotation` (src/engines/remotion-media-parser/adapter.ts:363-384). The 0.37 ms gap is noise from a single sample — the two are mechanistically the same metadata-only read against the same `mvhd`; remotion-webcodecs just happened to log the marginally lower single run.

mediabunny (79.32 ms) is the strongest design-of-record here: `metadataFromInput` (src/engines/mediabunny/adapter.ts:417-441) calls `input.getDurationFromMetadata()` FIRST and only falls back to `computeDuration()` when the metadata duration is null/non-finite. The inline comment (adapter.ts:421-426) is exactly on point — `getDurationFromMetadata()` reads the declared `mvhd`/Segment duration WITHOUT scanning samples, precisely avoiding the "walk every sample → OOM" trap this MASSIVE case is built to expose, and it ran with the `webcodecs` backend, `hwAccel: prefer-hardware`, `coopCoep: not-required` (env.configUsed). It is functionally indistinguishable from the two remotion engines in correctness and within ~4 ms in wall; on a multi-sample re-run it could plausibly lead. The win for remotion-webcodecs over mediabunny (1.05x) is not a meaningful architectural advantage.

The decisive separation is only against the slower four, all of which take the O(file) or O(samples) route. web-demuxer (908.96 ms) drives the libav/ffmpeg wasm demuxer, which opens and indexes the container before exposing metadata. mp4box (2197.84 ms, `backend: pure-js`, `pipeline: whole-file-append(MP4BoxBuffer+fileStart)`, env.configUsed) appends the whole 1.1 GB through its pure-JS ISOBMFF box parser to assemble the sample tables before `onReady`. ffmpeg.wasm (1944.44 ms) spins up the wasm module and runs an ffprobe-equivalent open. platform (3440.31 ms) is the slowest: its config (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`) shows it routes probe through a real media-element / WebCodecs open that touches far more of the file than a header read needs. All four are correct (golden-metadata passes) but pay 12x–46x the wall of the header-only readers — exactly the at-scale penalty the scenario was designed to surface.

## What each other framework did wrong

- **remotion-media-parser@4.0.479 (PASS, 75.75 ms):** lost the tiebreak by 0.37 ms (1.005x) on a single n=1 sample — statistically a tie. Same `@remotion/media-parser` metadata-only path as the winner; no real deficiency.
- **mediabunny@1.48.0 (PASS, 79.32 ms):** lost by 3.94 ms (1.05x). Architecturally the cleanest cheap-duration path (getDurationFromMetadata-first, adapter.ts:427-441); the small wall gap on n=1 is not a meaningful loss.
- **web-demuxer@4.0.0 (PASS, 908.96 ms):** correct, but 12.1x slower — its wasm libav demuxer indexes the container/sample table before surfacing metadata rather than reading only the `mvhd`.
- **ffmpeg.wasm@0.12.15 (PASS, 1944.44 ms):** correct, but 25.8x slower — wasm module init plus a full ffprobe-style container open on a 1.1 GB file.
- **mp4box@2.3.0 (PASS, 2197.84 ms):** correct, but 29.2x slower — `whole-file-append` pure-JS ISOBMFF parsing buffers/parses the entire file (env.configUsed `backend: pure-js`, `pipeline: whole-file-append(MP4BoxBuffer+fileStart)`) before `onReady`.
- **platform@chrome-149 (PASS, 3440.31 ms):** correct (and the only engine with a non-zero `durationDeltaSec` 0.021333s, still inside tolerance), but 45.6x slower — probe routed through a VideoDecoder/media-element open that reads far more than the header needs.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/probe/index.ts:316-325 (PROBE_CASES entry) → mapped to a golden scenario at src/scenarios/probe/index.ts:335-353 with `op: 'probe'`, `oracles: ['golden-metadata']`, `metrics: ['wall']`. NOT the perf-extract-metadata-massive variant (index.ts:398-407, which uses `opsPerSec`).
- **Fixture exists and is real:** `fixtures/media/massive_h264_1080p_2h.mp4` present at **1.1 GB** on disk (stat confirmed). Not synthetic/empty/mock; it is a genuine 2h 1080p H.264/AAC MP4. Golden sidecars also present (`.meta.json`, `.packets.json` 66 MB, `.ssim.json`, `.frames.json`).
- **Oracle is meaningful:** `golden-metadata` (src/core/oracles.ts:595-657) does a real field-by-field comparison of measured metadata against the golden: container string, duration within a per-container tolerance (here 0.041666s ≈ 1 frame), and per-track codec/width/height/fps/sampleRate/channels (compareTrack, oracles.ts:659-686). It can genuinely FAIL (any mismatch pushes a diff and returns `fail`). The 7200s duration and 2-track h264+aac structure in the measurements are physically plausible for the real asset.
- **Winner adapter is genuinely implemented:** src/engines/remotion-webcodecs/adapter.ts:332-355 calls the real `@remotion/media-parser parseMedia()` with metadata-tier fields and maps the result; no hardcoded/canned metadata, no short-circuit to the golden file, no copy of input→output. (mediabunny's path at adapter.ts:417-441 is likewise a real `Input.getDurationFromMetadata()/getTracks()` call.)
- **Cached note:** **ALL 7 results have `cached: true`** (`reason: "cached previous PASS result"`). This evidence was reused, not freshly re-run, so the exact wall numbers are stale. Given the top-3 spread is already sub-5 ms on n=1, the cached ordering at the head of the field should not be treated as a real performance ranking.
- **Verdict: REAL.** Real 1.1 GB fixture + real media-parser/mediabunny implementations + a meaningful field-comparison oracle. The only soft spot is gate strength relative to the question being asked (see confidence).

## Confidence & caveats

- **Confidence: low** on the *winner identity within the top 3*; high on the *overall tier separation* (the three header-only readers clearly beat the four file/sample walkers by 12x–46x).
- The gating oracle is `golden-metadata` only (metadata-exact, mid-strength on the ladder), with **no packet/keyframe or decoded-frame gate**. For a MASSIVE-scale lazy-read probe, metadata-exact correctly verifies the 7200s duration was reported, but does NOT independently verify the duration was obtained *without* walking the sample table — that "no full scan / no OOM" property is only inferred from wall time, not asserted by an oracle. This makes the case a near **WEAK-GATE** with respect to its own stated intent; the PASS is real but does not directly prove lazy behavior.
- Every `bench.wall` is **n=1, mad=0, warmup=1**: the 0.37 ms / 3.94 ms gaps among remotion-webcodecs, remotion-media-parser, and mediabunny are within measurement noise. The named winner is the lowest single sample, not a robust leader.
- All results are **cached**; a fresh multi-sample re-run (clearing raw + .browser-cache per the launcher seeding caveat) is recommended before trusting the head-of-field ordering.
