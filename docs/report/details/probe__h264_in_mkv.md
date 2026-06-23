# probe/h264_in_mkv

family: probe | fixture asset: `fixtures/media/h264_in_mkv.mkv` (4.4 MB, real Matroska) | primaryMetric: wall | passCount: 6 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** — CONTESTED (6 of 7 engines PASS the same single oracle `golden-metadata`).
- Decisive factor: **wall-clock latency**. All six PASSing engines satisfy the identical correctness gate with an exact track-count match (2 tracks) and a duration delta inside the strict ±1-frame band, so correctness is a tie; the win falls to performance. mediabunny is the fastest at wall median **10.06 ms**.
- Margin over runner-up (remotion-media-parser @ 14.375 ms): **1.43x faster wall**. Both n==1, mad==0, so the spread is unmeasured and the margin is weak evidence (see caveats).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 10.06 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 14.375 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 17.335 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 67.265 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 158.475 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 6000.9 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'mkv' |

Bench note: only the `wall` metric is recorded for this probe (metrics:['wall'] in the scenario); throughputRealtime/peakMemory/longtasks were not collected, hence n/a everywhere.

## Why the winner wins (deep technical)

The operation is a **metadata-only probe** of H.264 video + AAC audio carried in a **Matroska (mkv)** container. No decode, no demux of packet payloads, no encode — just open the container, read the EBML/Segment header, and report container token, duration, and per-track codec/geometry. The gating oracle `golden-metadata` (src/core/oracles.ts:595-657) compares container string, duration within tolerance, track count, and per-track codec/width/height/fps/sampleRate/channels against `fixtures/golden/h264_in_mkv.mkv.meta.json` (container "mkv", durationSec 10.021, video h264 1280x720@30, audio aac 48000/2ch).

mediabunny's probe path (src/engines/mediabunny/adapter.ts:417-453, `metadataFromInput`) is built for exactly this cheap shape. It maps the `mkv` token to the `MATROSKA` Input-format singleton (src/engines/mediabunny/codecs.ts:131), then takes the **cheap metadata duration path first**: `input.getDurationFromMetadata()` (adapter.ts:429) reads Matroska's Segment `Duration` element directly from the header, with `computeDuration()` (a full cluster/sample walk) used only as a fallback when the declared duration is null/non-finite (adapter.ts:434-441). For this 10 s file the header carries the duration, so the expensive walk is skipped entirely — that is the mechanism behind the 10.06 ms wall. Track geometry comes from `input.getTracks()` + `normalizeTrack` (adapter.ts:443-447), reading codec/dimensions out of the Track entries without touching media samples. The measured `durationDeltaSec` was **0** against golden 10.021 s, well inside the strict band `durationToleranceSec` ≈ 0.0417 s (1 frame @ ~24fps tolerance floor), and the track count matched at 2.

Why mediabunny beats the other PASSing engines on this same task:

- It is a **pure-TS ESM** parser (env.configUsed.coreBuild "pure-ts-esm", sharedArrayBuffer false, coopCoep "not-required") that reads only the Matroska header. There is no wasm module to instantiate and no media engine to spin up for a header read, so its fixed cost is minimal.
- remotion-media-parser (14.375 ms) is also a CPU-JS streaming reader (configUsed.backend "cpu-js", fieldsTier "metadata-only") and is the closest competitor, but mediabunny's header-only fast path edges it by 1.43x.
- The two WebCodecs-backed engines pay engine setup they don't need for a probe: remotion-webcodecs (17.335 ms) and especially platform@chrome-149 (6000.9 ms). The platform path here is the catastrophic outlier — it routes probe metadata through a `<video>` element / MediaSource style load (configUsed shows decode "VideoDecoder", encode "<video>→canvas→MediaRecorder"), so reporting a duration for an mkv waits on the element's media pipeline to reach a readyState, ~600x slower than a header read.
- ffmpeg.wasm (158.475 ms) must run the single-thread wasm core (`ffprobe`-equivalent) end to end; correct but ~16x slower than mediabunny because of wasm instantiation + full avformat open.
- web-demuxer (67.265 ms) wraps an Emscripten/wasm libav demuxer; likewise correct but ~6.7x slower than mediabunny for the same header read.

All six produce the same correct answer; the only differentiator is the cost of getting there, and mediabunny's "read the Segment Duration, never scan samples" path is the cheapest.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on speed only. Same oracle (golden-metadata:pass, durationDeltaSec 0, 2 tracks), but wall 14.375 ms vs 10.06 ms = 1.43x slower. No correctness deficit.
- **remotion-webcodecs@4.0.479** — PASS, lost on speed. 17.335 ms = 1.72x slower than the winner; pays WebCodecs/converter setup unneeded for a metadata-only probe.
- **web-demuxer@4.0.0** — PASS, lost on speed. 67.265 ms = 6.69x slower; wasm libav demuxer init dominates the header read.
- **ffmpeg.wasm@0.12.15** — PASS, lost on speed. 158.475 ms = 15.75x slower; full single-thread wasm avformat open for what is a header probe.
- **platform@chrome-149** — PASS but the slowest by three orders of magnitude. 6000.9 ms = ~596x slower; routing the probe through the `<video>`/media-element pipeline forces waiting on the element to load the mkv before duration is available.
- **mp4box@2.3.0** — NA_ENGINE, honest. Its registry declares `containersIn: ['mp4', 'mov']` (src/engines/mp4box/adapter.ts:645) and it is an ISOBMFF-only parser ("any non-mp4 target throws", adapter.ts:911). Matroska is genuinely outside its capability, so the NA is a correct negotiation, not an under-declared capability.

## Anti-cheat validation

- Scenario definition: src/scenarios/probe/index.ts:131 — `{ asset: 'h264_in_mkv.mkv', container: 'mkv', videoCodecs: ['h264'], audioCodecs: ['aac'] }`, an entry in the auto-generated `golden-metadata` probe matrix (one oracle: golden-metadata).
- Fixture: `fixtures/media/h264_in_mkv.mkv` exists, 4.4 MB — a real Matroska file, not synthetic/empty/mock.
- Golden: `fixtures/golden/h264_in_mkv.mkv.meta.json` present with physically plausible values (10.021 s, h264 1280x720@30, aac 48000/2ch). The oracle (src/core/oracles.ts:595-657) performs a real field-by-field comparison: container string, duration within the strict ±1-frame band (no loose container override applies to mkv), track count, and per-track codec/dims/fps/sampleRate/channels. It is not trivially satisfiable — a wrong track count, codec, or out-of-band duration fails it.
- Winner adapter: src/engines/mediabunny/adapter.ts:417-453 — genuinely opens the input, reads container format via `getFormat()`, declared duration via `getDurationFromMetadata()` (with `computeDuration()` fallback), and real tracks via `getTracks()`. No canned output, no short-circuit to the golden, no swallowed errors reported as success (the try/catch only downgrades duration to null, which would then FAIL the duration check, not silently PASS).
- Measurements plausible: durationDeltaSec 0 vs golden 10.021 s, 2 tracks reported — consistent with real media.
- Verdict: **REAL**. Real fixture + real implementation + meaningful, comparison-based oracle.
- Cached note: the winner's result has `cached: true` ("cached previous PASS result"), so the 10.06 ms wall was reused from an earlier run, not re-executed in this batch. The correctness verdict is stable, but the timing margin should be treated as a prior-run snapshot.

## Confidence & caveats

- Confidence: **medium**. Correctness verdict is solid (real fixture, real oracle, real adapter). The win is purely on wall time, and the timing evidence is weak: every engine ran with **n==1, mad==0** (single sample, no spread), and the winner's row is **cached**. A 1.43x gap over remotion-media-parser at n==1 is suggestive, not definitive — a re-run could reorder the top two.
- The gate is a single metadata oracle (golden-metadata). There is no packet/SSIM/bit-exact gate on this probe row, so this is the standard probe gate for the matrix — appropriate for a probe, but it means "best" here means "fastest correct header read", not "most rigorous decode".
- The golden lists both video and audio `bitrate` as the identical 3485059 (an mkv overall-bitrate quirk); the oracle does not compare bitrate, so this does not affect any verdict.
- platform's 6000.9 ms is an extreme outlier but does not change ranking; it remains a correct PASS.
