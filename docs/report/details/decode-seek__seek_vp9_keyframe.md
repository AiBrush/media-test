# decode-seek/seek_vp9_keyframe

family: decode-seek | fixture asset: `vp9_1080p_10s.webm` (9.3 MB, VP9 in WebM) | primaryMetric: seekMs | passCount: 5 of 7

## Verdict
- **Best framework: mediabunny@1.48.0** (CONTESTED — 5 engines PASS the same strict oracle).
- **Decisive factor: performance.** All five passing engines satisfy the identical `seek-accuracy` oracle exactly (seekDeltaUs = 0 against a tolerance of 0µs), so correctness strength is a flat tie. The win is on `seekMs` (primaryMetric).
- **Margin over runner-up:** mediabunny seek median **53.66 ms** vs the joint runners-up platform (136.68 ms) and web-demuxer (136.70 ms) — about **2.55x faster** wall. It is **12.7x** faster than ffmpeg.wasm (679.34 ms) and **14.7x** faster than remotion-webcodecs (788.47 ms). Note: n=1 per engine (single sample, mad=0), so the ranking is suggestive rather than statistically robust.

## Per-engine results
| engine | status | oracles passed | seek/wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:true | 53.66 | n/a | n/a | 1361 | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:true | 136.68 | n/a | n/a | 2152 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:true | 136.70 | n/a | n/a | 2055 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:true | 679.34 | n/a | n/a | 19963 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:true | 788.47 | n/a | n/a | 1192 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(No throughputRealtime/peakMemory metrics are emitted for this seek scenario; the bench block carries only seekMs/wall/longtasks.)

## Why the winner wins (deep technical)
The operation is a **keyframe-accurate seek to 4.000 s in a 10 s 1080p VP9 elementary stream carried in a WebM/Matroska container**. WebM stores random-access points in a Cues element; a correct seek must (1) parse the SeekHead/Cues to find the cluster containing the keyframe at-or-before 4 s, (2) start a VP9 decode at that keyframe, and (3) surface the landed frame's presentation timestamp. The oracle (`src/core/oracles.ts:2199` `seekAccuracy`) compares the landed PTS against the expected keyframe PTS computed from the golden packet table via `keyframeAtOrBefore` (`oracles.ts:2236`) with `seekToleranceUs: 0`. Every passing engine reports `landedPtsUs=4000000`, `expectedPtsUs=4000000`, `seekDeltaUs=0` — i.e. the 4 s mark coincides with a real VP9 keyframe (confirmed by the existence of `fixtures/golden/vp9_1080p_10s.webm.packets.json`), and all five landed exactly on it. Correctness is therefore a true tie at the strongest available tier for a seek scenario (a structural/timestamp gate; ssim/pixel is intentionally not gated here per the comment at `oracles.ts:2204-2207`).

mediabunny wins on the only differentiator: latency. Its adapter (`src/engines/mediabunny/adapter.ts:1415` `seek`) opens the input, gets the primary video track, constructs a `VideoSampleSink` with decoder options derived from the track (`adapter.ts:1421`), and calls `sink.getSample(targetSec)` (`adapter.ts:1423`), returning `sample.microsecondTimestamp` as the landed PTS (`adapter.ts:1426`). mediabunny's pure-TS Matroska demuxer reads the Cues index directly and feeds only the keyframe-anchored packets into a hardware-accelerated `VideoDecoder` (env.configUsed: `backend=webcodecs`, `hwAccel=prefer-hardware`, `coopCoep=not-required`, M1 Max via ANGLE Metal). Because it indexes straight to the cue point and decodes a single GOP head on the GPU, it completes in 53.66 ms — roughly half the time of the browser's own `<video>`/VideoDecoder path and a fraction of the wasm engines.

The wasm contenders pay a structural penalty. ffmpeg.wasm (679.34 ms, and a **19,963 ms** longtask figure — by far the worst, reflecting single-thread wasm libvpx work blocking the main thread) decodes VP9 in software inside the wasm sandbox; it lands correctly but is an order of magnitude slower. remotion-webcodecs (788.47 ms) uses WebCodecs too but routes through its convert/parse pipeline (`streaming-backpressure`, `waitForQueueToBeLessThan`, bufferWriter), adding parsing and queue-management overhead on top of the decode for what is a one-frame seek. platform (the browser baseline) and web-demuxer tie at ~136.7 ms — both correct, both ~2.55x slower than mediabunny.

## What each other framework did wrong
- **platform@chrome-149** — PASS, but 136.68 ms seek vs 53.66 ms (2.55x slower). The native `<video>`/VideoDecoder seek path carries more demux+pipeline overhead than mediabunny's direct cue-indexed GPU decode; also the highest longtask among the WebCodecs engines (2152 ms).
- **web-demuxer@4.0.0** — PASS, 136.70 ms (2.55x slower). Correct keyframe landing, but its libav-backed demux+decode is slower than mediabunny's pure-TS Cues indexing.
- **ffmpeg.wasm@0.12.15** — PASS, 679.34 ms (12.7x slower) with a 19,963 ms longtask. Software VP9 decode in single-thread wasm; correct but heavily main-thread-blocking and slow.
- **remotion-webcodecs@4.0.479** — PASS, 788.47 ms (14.7x slower, the slowest). Correct landing via WebCodecs, but its backpressure/convert pipeline adds overhead disproportionate to a single-frame seek.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'seek'". Honest NA — mp4box is an ISO-BMFF (MP4) parser and does not implement a general seek/decode op, and this fixture is WebM regardless.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'seek'". Honest NA — it is a parser/metadata library that does not declare the decode-seek operation.

## Anti-cheat validation
- **Scenario:** `src/scenarios/decode-seek/index.ts:486-495` — id `seek_vp9_keyframe`, asset `vp9_1080p_10s.webm`, container webm, codec vp9, `tUs: 4_000_000`, `keyframe: true`, `tolerances.seekToleranceUs: 0`, notes "WebM/VP9 keyframe seek at 4s via Cues."
- **Fixture exists:** `fixtures/media/vp9_1080p_10s.webm` present, 9.3 MB — real VP9/WebM media, not synthetic/empty/mock. Golden present: `fixtures/golden/vp9_1080p_10s.webm.packets.json` (90 KB), which backs the oracle's expected-keyframe computation.
- **Oracle:** `src/core/oracles.ts:2199` `seekAccuracy` → `expectedSeekPtsUs` (`:2250`) → `keyframeAtOrBefore` (`:2236`) over real golden packets. With `seekToleranceUs:0`, the gate is strict (exact PTS match; not trivially satisfiable). Measurements (landedPtsUs=4000000, expectedPtsUs=4000000, seekDeltaUs=0) are physically plausible for a real 10 s clip with a keyframe at 4 s.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1415-1436` — genuine: opens MediaInput, gets primary video track, builds `VideoSampleSink`, calls `sink.getSample(targetSec)`, returns the decoded sample's real `microsecondTimestamp`. No canned output, no golden short-circuit, no error swallowing.
- **Cached note:** mediabunny's result has `cached:true` ("cached previous PASS result"), as do all five passers — these were reused, not re-run, so the absolute seekMs values carry staleness risk. The relative ranking is consistent and the correctness gate is exact, so this does not change the verdict.
- **Verdict: REAL** — real fixture + real golden-backed strict oracle + genuine WebCodecs decode implementation.

## Confidence & caveats
- Confidence: **high** on the verdict (correctness tie + clear, large performance margin), **medium** on the precise timing magnitudes.
- All five passing results are `cached:true` and **n=1** (single sample, mad=0, p95==median). A single-sample win is weaker evidence; mediabunny's lead (2.55x over the nearest, and far more over the wasm engines) is large enough to survive plausible variance, but a re-run with higher n would harden it.
- Both NA engines are honest (parser-only libraries that do not declare `seek`); they are not under-declared capabilities for this WebM/VP9 decode-seek op.
