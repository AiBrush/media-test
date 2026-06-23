# decode-seek/seek_mkv_h264_keyframe

family: decode-seek | fixture asset: `h264_in_mkv.mkv` (4.4 MB, H.264 video in Matroska) | primaryMetric: seekMs | passCount: 5 of 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 5 of 7 engines PASS).
- **Decisive factor: performance.** All 5 passing engines satisfy the *identical* and only gating oracle `seek-accuracy` at the strictest possible tolerance (`seekToleranceUs: 0`, landed Δ = 0µs on the keyframe at 4,000,000µs). Correctness is therefore a perfect tie, so the contest is decided by `seekMs` (the primaryMetric).
- **Margin over runner-up:** mediabunny `seekMs` median = 34.06ms vs platform (chrome-149) = 71.29ms → **2.09x faster wall**. Third place ffmpeg.wasm = 329.17ms (9.66x slower than mediabunny); web-demuxer = 162.65ms (4.78x); remotion-webcodecs = 431.29ms (12.66x).
- **Important caveat:** mediabunny wins wall time but carries a `longtasks` median of 19,963ms — vastly worse than platform's 179ms (111x more main-thread blocking). On the headline metric (seekMs) mediabunny wins; on responsiveness it is the worst of the field. See caveats.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:pass (Δ0µs) | 34.06 | n/a | n/a | 19963 | cached previous PASS |
| platform@chrome-149 | PASS | seek-accuracy:pass (Δ0µs) | 71.29 | n/a | n/a | 179 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | seek-accuracy:pass (Δ0µs) | 162.65 | n/a | n/a | 12909 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:pass (Δ0µs) | 329.17 | n/a | n/a | 3585 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:pass (Δ0µs) | 431.29 | n/a | n/a | 179 | cached previous PASS |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(No `throughputRealtime`/`peakMemory` metrics are present in this shard's bench blocks; only `seekMs`/`wall`/`longtasks` were captured.)

## Why the winner wins (deep technical)

The operation is a **keyframe seek into H.264 carried inside a Matroska (MKV) container**, targeting t = 4.0s with zero tolerance. MKV has no faststart/`moov` sample table like MP4; the demuxer must walk the **Cues/Cluster index** (the scenario notes call this out: "Matroska Cues/Cluster seek path … seek to a keyframe at 4s using the MKV Cues index / Cluster timestamps"). The whole field correctly resolves to the keyframe PTS 4,000,000µs (Δ0µs), so the win is purely about *how cheaply* each engine reaches that frame.

mediabunny used `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false` (from `env.configUsed`). Its seek path is in `src/engines/mediabunny/adapter.ts:1415-1436`: it opens the input, gets the primary video track, constructs a `VideoSampleSink` and calls `sink.getSample(targetSec)` (`adapter.ts:1421-1423`). mediabunny's sink internally binds the Matroska Cues index to a WebCodecs `VideoDecoder`, so the path is: locate the Cue/Cluster keyframe at-or-before 4s, feed exactly that one keyframe to the hardware decoder, and return `sample.microsecondTimestamp` (`adapter.ts:1426`). Because it is a pure-TS ESM demuxer (`coreBuild: pure-ts-esm`) bolted directly onto hardware WebCodecs, there is no wasm module instantiation, no virtual filesystem write, and no software H.264 decode — explaining the 34ms wall, roughly half of platform's 71ms.

The gating oracle `seek-accuracy` (`src/core/oracles.ts:2199-2234`) is a *timestamp* oracle: it computes the expected landing via `expectedSeekPtsUs` (`oracles.ts:2250-2268`), which for `expectKeyframe=true` selects `keyframeAtOrBefore(pkts, 4_000_000)` from the golden video packets, then fails unless `|landedPtsUs − expectedPtsUs| ≤ seekToleranceUs` (here 0). The recorded measurement `{landedPtsUs:4000000, seekDeltaUs:0, expectedPtsUs:4000000}` is exactly an at-or-before keyframe match against the real golden, which contains 770 packets / 475 keyframes for this clip. mediabunny clears this at the tightest tolerance, identically to the others, so it loses nothing on correctness while winning on cost.

## What each other framework did wrong

- **platform@chrome-149 (PASS, runner-up):** Correct (Δ0µs) but 2.09x slower wall (71.29 vs 34.06ms). It seeks via the native `<video>`/`VideoDecoder` element pipeline (`backend: webcodecs`, `hwAccel: true`); the element-level seek + media-engine teardown adds latency over mediabunny's direct sink call. Notably it has the *best* responsiveness (longtasks 179ms), so it would win a responsiveness-first ranking — but seekMs is the primaryMetric.
- **web-demuxer@4.0.0 (PASS):** Correct (Δ0µs) but 4.78x slower wall (162.65ms) and longtasks 12,909ms — it is a wasm (FFmpeg-based) demuxer, so module init + wasm-side Matroska parsing dominate before the keyframe reaches WebCodecs.
- **ffmpeg.wasm@0.12.15 (PASS):** Correct (Δ0µs) but 9.66x slower wall (329.17ms). Full ffmpeg-wasm load + MEMFS round-trip for a single-keyframe seek is enormously heavyweight relative to a native demuxer; this is the cost of a general-purpose wasm transcoder doing a one-frame seek.
- **remotion-webcodecs@4.0.479 (PASS):** Correct (Δ0µs) but slowest at 431.29ms (12.66x). Its `streaming-backpressure` converter path and frame-extraction setup add overhead; the MKV asset is not on any of its declared `adapterFastPaths` (those target large progressive MP4/MOV), so it falls through to the generic, costlier path. Its longtasks (179ms) are good, but wall is the metric.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — "engine does not declare operation 'seek'". MP4Box.js is an ISOBMFF (MP4) parser and cannot demux Matroska, so neither the `seek` op nor MKV input is in scope; the under-declaration is correct, not a hidden capability.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA — "engine does not declare operation 'seek'". remotion-media-parser is a parser/probe layer that does not expose a decode-and-land seek primitive in this suite; declaring it NA rather than faking a result is correct.

## Anti-cheat validation

- **Scenario:** `src/scenarios/decode-seek/index.ts:530-541` — id `seek_mkv_h264_keyframe`, asset `h264_in_mkv.mkv`, container mkv, codec h264, tUs 4_000_000, keyframe true, tolerances `{seekToleranceUs: 0}`. Real, specific intent (Matroska Cues/Cluster seek).
- **Fixture exists:** `fixtures/media/h264_in_mkv.mkv` present, 4.4 MB — a real MKV, not synthetic/empty/mock.
- **Golden exists:** `fixtures/golden/h264_in_mkv.mkv.packets.json` (87k, 770 packets / 475 keyframes), `.frames.json`, `.meta.json`, `.ssim.json` all present. Keyframes cluster near 4s (e.g. 3.819s, 3.840s … 3.904s), consistent with a true keyframe at-or-before 4,000,000µs.
- **Winner adapter genuinely implements seek:** `src/engines/mediabunny/adapter.ts:1415-1436` calls the real `mediabunny.VideoSampleSink.getSample(targetSec)` against the opened input and returns the real `sample.microsecondTimestamp`. No canned output, no copy of input→output, no short-circuit to golden, no error-swallow-then-report-success (errors throw; missing frame throws).
- **Oracle is meaningful:** `src/core/oracles.ts:2199-2234` performs a real PTS comparison against golden-derived `keyframeAtOrBefore` with `seekToleranceUs=0` — the strictest possible tolerance, not trivially satisfiable. Measurements `{landedPtsUs:4000000, seekDeltaUs:0, expectedPtsUs:4000000}` are physically plausible for this fixture.
- **Cached note:** ALL 5 PASS results have `cached:true` ("cached previous PASS result"). The numbers were reused, not freshly re-run in this invocation. Per project memory (launcher seeding caveat), cached PASS reuse carries staleness risk; however the underlying fixtures, goldens, oracle, and adapter all check out as real.
- **Verdict: REAL** — real MKV fixture + real golden + genuine `VideoSampleSink` implementation + a strict (Δ0µs) timestamp oracle backed by golden keyframe packets.

## Confidence & caveats

- **Confidence: medium.** Correctness/anti-cheat are solidly REAL; the *performance* winner is decided on **n=1, mad=0** samples for every engine — a single timing sample each, so the 2.09x margin over platform is real-but-thin evidence. A re-run could shuffle the close mediabunny↔platform ordering.
- **Responsiveness trade-off:** mediabunny's longtasks median (19,963ms) is the worst in the field and 111x platform's (179ms). For interactive seeking, platform (or remotion-webcodecs) would be preferable despite slower wall. The chosen winner reflects the declared primaryMetric (seekMs) only.
- All evidence is cached; no live re-execution was performed in this analysis.
