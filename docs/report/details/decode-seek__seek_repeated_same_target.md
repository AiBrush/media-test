# decode-seek/seek_repeated_same_target

family: decode-seek | fixture asset: `h264_1080p_30s.mp4` (H.264 / MP4, 31 MB) | primaryMetric: seekMs (ms/seek, lower-better) | passCount: 5 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- **CONTESTED**: 5 engines PASS (mediabunny, ffmpeg.wasm, web-demuxer, platform, remotion-webcodecs). All 5 satisfy the gating `seek-accuracy` oracle **identically** (landedPtsUs=4000000, seekDeltaUs=0, expectedPtsUs=4000000 — exact keyframe landing, Δ 0µs at a 0µs tolerance). Correctness is therefore a perfect tie.
- Decisive factor: **PERFORMANCE on the primary metric `seekMs`**. mediabunny lands the 4s keyframe in **37.4 ms**, far ahead of every other PASS engine.
- Margin over runner-up (ffmpeg.wasm @ 113.505 ms): **~3.03x faster seek** (113.505 / 37.4). Against the rest: 3.72x vs web-demuxer (139 ms), 3.91x vs platform (146.1 ms), 75.7x vs remotion-webcodecs (2832.5 ms). Evidence is weak in n: every engine ran n=1 (mad=0, p95=median), so this is a single-sample headline, not a distribution.

## Per-engine results

| engine | status | oracles passed | seekMs (wall) median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:pass | 37.400 ms | n/a | n/a | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:pass | 113.505 ms | n/a | n/a | 1017 ms | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:pass | 139.000 ms | n/a | n/a | 3234 ms | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:pass | 146.100 ms | n/a | n/a | 4277 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:pass | 2832.465 ms | n/a | n/a | 3045 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(No throughputRealtime/peakMemory metrics are emitted for this scenario; metrics are `seekMs`, `wall`, `longtasks`. wall==seekMs for all engines since the measured op is the single seek.)

## Why the winner wins (deep technical)

The operation is a **precise random-access seek into H.264-in-MP4 to a 4-second keyframe**, with the scenario's intent being **idempotency**: seeking twice to the same target must land on the IDENTICAL frame with no decoder-state drift (`src/scenarios/decode-seek/index.ts:586-598`). The oracle `seek-accuracy` (`src/core/oracles.ts:2199-2234`) is a *timestamp* oracle: it resolves the expected landing PTS from the golden packet table via `keyframeAtOrBefore` (`oracles.ts:2236-2248`, the largest keyframe PTS ≤ requested 4000000µs) and fails unless `|landedPtsUs − expectedPtsUs| ≤ seekToleranceUs` with `seekToleranceUs=0`. All five declaring engines hit exactly landedPtsUs=4000000 / seekDeltaUs=0 — meaning every one correctly resolved the on-grid keyframe at 4.0s. Correctness is a dead heat, so the win is mechanistic on speed.

mediabunny's seek path (`src/engines/mediabunny/adapter.ts:1415-1436`) constructs a `VideoSampleSink` over the primary video track and calls `sink.getSample(targetSec)` — mediabunny's own MP4 sample-table demuxer resolves the sync sample at/before 4.0s and feeds *only* the minimal GOP into a hardware-backed WebCodecs `VideoDecoder` (env.configUsed: `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `coopCoep:"not-required"`). Because the stbl/stss table gives the exact byte offset of the 4s keyframe, mediabunny decodes essentially **one keyframe** and reads `sample.microsecondTimestamp` directly — no full-file scan, no transcode, no wasm round-trip. That is why it clocks **37.4 ms**: the cost is dominated by a single hardware keyframe decode plus an RGBA copy (`imageDataFromVideoSample` → `digestImageData`).

The losers pay structural overhead for the same answer. **ffmpeg.wasm (113.5 ms)** runs avformat/avcodec inside single-thread wasm (no SharedArrayBuffer/COOP-COEP here) — it must marshal the file into the wasm FS and run software H.264 decode; 3.03x slower despite the same Δ0 landing. **web-demuxer (139 ms)** wraps an Emscripten libav demuxer; it demuxes correctly to the keyframe but carries wasm + worker messaging overhead (its longtasks=3234ms reflect heavy main-thread/worker churn). **platform (146.1 ms)** uses the raw `<video>`-element/WebCodecs `VideoDecoder` route (env.configUsed `decode:"VideoDecoder"`, `hwAccel:true`); even with hardware decode the element-driven seek pipeline (currentTime set + seeked event + frame grab) is ~3.9x heavier than mediabunny's direct sample-sink fetch. **remotion-webcodecs (2832.5 ms)** is the outlier at 75.7x slower: its `convert`-oriented streaming-backpressure pipeline (env.configUsed `pipeline:"streaming-backpressure"`, `writer:"bufferWriter"`) is built for full-file conversion, so a single point seek pays nearly the whole parse/setup cost — correct landing, terrible per-seek latency.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, correct (Δ0µs), but 113.505 ms = **3.03x slower** than mediabunny. Single-thread wasm software decode + FS marshaling; no hardware path.
- **web-demuxer@4.0.0** — PASS, correct (Δ0µs), 139 ms = **3.72x slower**. Emscripten libav demux + worker messaging overhead; longtasks 3234 ms.
- **platform@chrome-149** — PASS, correct (Δ0µs), 146.1 ms = **3.91x slower**. Hardware `VideoDecoder` but element/seeked-event-driven seek pipeline is heavier than a direct sample-table fetch; longtasks 4277 ms.
- **remotion-webcodecs@4.0.479** — PASS, correct (Δ0µs), 2832.465 ms = **75.7x slower**. Conversion-pipeline (streaming-backpressure/bufferWriter) pays full parse/setup per point-seek.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'seek'". **Honest NA** — remotion-media-parser is a parser/probe library, not a decoder; it has no precise-frame seek primitive, so declining `seek` is correct, not an under-declared capability.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'seek'". **Honest NA** — mp4box is a box/sample-table demuxer (it could compute the sync sample offset, but it does no actual frame decode), so it cannot return a *landed decoded frame*; not declaring `seek` is defensible.

## Anti-cheat validation

- **Scenario**: `src/scenarios/decode-seek/index.ts:586-598` (case `seek_repeated_same_target`), wired into scenarios at `index.ts:618-639` (op `seek`, oracle `seek-accuracy`, primaryMetric `seekMs`, tolerance `seekToleranceUs:0`).
- **Fixture**: `asset: 'h264_1080p_30s.mp4'` — real file present at `fixtures/media/h264_1080p_30s.mp4`, 31 MB (stat confirmed). Real H.264/MP4 media, not synthetic/empty/mock.
- **Oracle**: `seek-accuracy` at `src/core/oracles.ts:2199-2234`, expected-PTS resolution via `keyframeAtOrBefore`/`expectedSeekPtsUs` at `oracles.ts:2236-2268` against golden packets. It is a **real, strict** comparison (exact keyframe PTS, 0µs tolerance) — not trivially satisfiable; an engine that landed on the wrong frame or a non-keyframe would fail. Measurements (landedPtsUs=4000000 = exactly 4.0s on a 30s clip; expectedPtsUs=4000000; Δ0) are physically plausible for a real 4s keyframe.
- **Caveat — it is a timestamp gate, not a pixel gate**: by design (`oracles.ts:2204-2207`) seek-accuracy does NOT hard-gate the decoded pixel digest, and the scenario's *idempotency* intent (two seeks landing on the identical frame) is not directly asserted in the recorded oracleOutcomes — only one landing PTS is checked. So the gate verifies "landed on the correct keyframe," not "byte-identical pixels across two seeks." This is a genuine but slightly looser-than-pixel gate.
- **Winner adapter**: `src/engines/mediabunny/adapter.ts:1415-1436` — genuine `VideoSampleSink.getSample` decode, returns real `sample.microsecondTimestamp`. No canned output, no golden short-circuit, no copy-input fakery, no swallowed errors (throws on null sample).
- **Cached**: ALL 7 entries have `cached:true` ("cached previous PASS result"). The numbers were reused from a prior run, not freshly re-executed — per the launcher-seeding caveat, stale-reuse staleness risk applies to every engine here.
- **Verdict: REAL** — real 31 MB H.264/MP4 fixture, real WebCodecs decode in the winner's adapter, and a meaningful exact-keyframe (0µs) oracle. Downgrade pressure: timestamp-only gate (not pixel-exact, idempotency not separately asserted) and all-cached evidence keep confidence at medium rather than high.

## Confidence & caveats

- Confidence: **medium**. The accuracy result is a clean exact tie (Δ0µs) across 5 engines and the win is unambiguous on `seekMs` (37.4 ms, ~3x clear of the field). But: (1) every metric is **n=1** (mad=0, p95=median) — a single-sample latency headline, not a distribution; (2) every result is **cached** (reused, staleness risk); (3) the gate is a **timestamp** oracle, so the scenario's stated idempotency/pixel-determinism is only partially exercised. The performance ordering is large enough (3x–75x) to survive sampling noise, so the ranking is robust even if absolute ms shift on a fresh run.
