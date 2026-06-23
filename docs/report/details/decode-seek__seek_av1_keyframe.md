# decode-seek/seek_av1_keyframe

family: decode-seek | fixture asset: `av1_720p_5s.webm` (AV1 in WebM/Matroska, 720p, 5s, ~1.9 MB) | primaryMetric: seekMs | passCount: 3 of 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 3 engines PASS with identical correctness).
- **Decisive factor: performance (seek wall time).** All three PASS engines satisfy the same single gate (`seek-accuracy`) with the exact same measurements (`landedPtsUs=2000000`, `seekDeltaUs=0`, `expectedPtsUs=2000000`), so correctness strength is a perfect tie. The winner is decided on the primary metric `seekMs`.
- **Margin over runner-up:** mediabunny 23.245 ms vs web-demuxer 64.840 ms wall median = **2.79x faster**; vs platform 190.945 ms = **8.21x faster**; vs remotion-webcodecs 262.900 ms = **11.31x faster**. Caveat: all benches are `n=1` (single sample, mad=0), so the margins are point estimates, not distributions — but a 2.8x gap is far outside plausible single-sample noise for a sub-300 ms operation.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:true | 23.245 | n/a | n/a | 1361 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:true | 64.840 | n/a | n/a | 1073 | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:true | 190.945 | n/a | n/a | 1361 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:true | 262.900 | n/a | n/a | 1017 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare video codec 'av1' |

(No `throughputRealtime` or `peakMemory` metrics are emitted for this seek scenario; only `seekMs`/`wall`/`longtasks` are present in the shard bench block.)

## Why the winner wins (deep technical)

The operation is a **single keyframe-accurate seek to 2.0 s in an AV1/WebM clip**. The container is Matroska/WebM (Cues + Cluster/SimpleBlock structure), the codec is AV1, and the scenario demands an *exact* landing (`seekToleranceUs: 0`) on the keyframe at or before 2 s. Because the golden keyframe sits exactly at 2 000 000 µs, the only correct landing PTS is 2 000 000 µs, which all three PASS engines hit (`seekDeltaUs=0`). With correctness tied, the mechanism that matters is **how fast each engine can demux to the target Cluster, hand the keyframe chunk to a decoder, and read back the decoded frame's timestamp.**

mediabunny's seek path (`src/engines/mediabunny/adapter.ts:1415-1436`) is a thin, direct route: it opens the input, grabs the primary video track (`getPrimaryVideoTrack`), constructs a `VideoSampleSink` with decoder options resolved from the track (`videoDecoderOptionsForTrack`, line 1421), and calls `sink.getSample(targetSec)` (line 1423) — which mediabunny documents as "the last frame with start ≤ t in presentation order." It then reads `sample.microsecondTimestamp` (line 1426) as the landed PTS. Per `env.configUsed`, this engine runs `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, with `coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`. Two properties make it the fastest here: (1) its **WebM demuxer is pure-TypeScript and parses only the Cues index plus the one Cluster needed to reach the 2 s keyframe** — there is no wasm module to instantiate, no SharedArrayBuffer, and no COOP/COEP requirement; (2) the actual AV1 decode is delegated to the **browser's hardware-preferred WebCodecs `VideoDecoder`** on the M1 Max. The combination of zero-wasm-startup demux + native decode is exactly why it lands at **23.245 ms**, an order of magnitude under the wasm-demux competitor and the `<video>`-element platform path.

web-demuxer (runner-up, 64.840 ms) is also correct and also decodes via WebCodecs, but its demux stage runs **ffmpeg compiled to wasm** (`src/engines/web-demuxer/adapter.ts` header notes: a libav-based demuxer; `seek('video', tSec)` returns an `EncodedVideoChunk` from an `AVSEEK_FLAG_BACKWARD` seek that lands on the preceding keyframe). The wasm demuxer must be instantiated and the libav seek executed before WebCodecs ever sees the chunk; that wasm overhead is the 2.79x gap. The platform engine (190.945 ms) seeks through the browser `<video>` element pipeline (`decode: "VideoDecoder"`, but the seek is mediated by the media element rather than direct sink reads), which carries much higher per-seek latency. remotion-webcodecs (262.900 ms) layers Remotion's converter/extract-frames machinery (`pipeline: "streaming-backpressure"`, `waitForQueueToBeLessThan`) on top of WebCodecs, adding the most overhead of the three for a single-frame seek.

## What each other framework did wrong

- **web-demuxer@4.0.0 (PASS, lost):** Correctness identical (`seek-accuracy` pass, `seekDeltaUs=0`), but **2.79x slower** (64.840 ms vs 23.245 ms). Cause: ffmpeg/libav-wasm demux + WebCodecs decode — the wasm instantiation/seek cost dominates a single-frame seek where mediabunny's pure-TS Cues parse has near-zero startup.
- **platform@chrome-149 (PASS, lost):** Correct but **8.21x slower** (190.945 ms). Seek is mediated by the browser `<video>`/MediaSource path rather than a direct decoder sink; per-seek element latency is high for a one-shot keyframe seek.
- **remotion-webcodecs@4.0.479 (PASS, lost):** Correct but **11.31x slower** (262.900 ms) — slowest PASS. Remotion's streaming-backpressure converter and frame-extraction layer add the most overhead for a single seek.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA — "engine does not declare operation 'seek'." It is a parser/metadata library and never advertises a seek-to-frame op, so it is correctly excluded rather than under-declared.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — "engine does not declare operation 'seek'." mp4box is an MP4/ISOBMFF box parser; it does not implement a decode-and-land seek op, and the fixture is WebM regardless. Correct exclusion.
- **ffmpeg.wasm@0.12.15 (NA_ENGINE):** Honest NA — "engine does not declare video codec 'av1'." This build's declared codec set excludes AV1, so the capability gate skips it before any seek attempt. Plausible NA (the wasm build is not compiled with an AV1 decoder).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/decode-seek/index.ts:511-519` — `id: 'seek_av1_keyframe'`, `asset: 'av1_720p_5s.webm'`, `container: 'webm'`, `videoCodec: 'av1'`, `tUs: 2_000_000`, `keyframe: true`, `tolerances: { seekToleranceUs: 0 }`. Notes: "AV1/WebM keyframe seek at 2s. NA(browser) where AV1 decode is unavailable."
- **Fixture exists:** `fixtures/media/av1_720p_5s.webm` confirmed present, ~1.9 MB — a real AV1/WebM file, not synthetic/empty/mock.
- **Oracle:** `src/core/oracles.ts:2199-2234` (`seekAccuracy`). It computes the expected keyframe PTS from the golden via `expectedSeekPtsUs(ctx.golden, requestedUs, expectKeyframe)` and fails unless `|landedPtsUs - expectedPtsUs| <= seekToleranceUs`. With tolerance = 0, the gate is **strict** (only an exact keyframe PTS passes). Measurements are physically plausible: landed/expected = 2 000 000 µs = exactly the requested 2 s keyframe; delta 0.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1415-1436`. Genuine implementation — real `VideoSampleSink.getSample()` decode via WebCodecs, reads `sample.microsecondTimestamp` for the landed PTS, digests the actual decoded `VideoSample`. No canned output, no short-circuit to golden, no input copy, no error swallowing (throws on missing track/frame).
- **Verdict: REAL.** Real AV1/WebM fixture + genuine WebCodecs decode-and-land seek + strict zero-tolerance PTS oracle that cannot be trivially satisfied.
- **Cached note:** All four PASS results carry `cached: true` ("cached previous PASS result"). Evidence is reused, not freshly re-run; per the launcher-seeding caveat, stale PASS reuse is possible. The relative ranking is robust (large multiplicative gaps), but absolute seekMs values should be treated as last-known-good rather than fresh.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict is solid (strict zero-tolerance oracle, real fixture, real decode path). The performance ranking has two soft spots: (1) every bench is `n=1` with `mad=0`, so there is no spread information — the 2.79x margin over web-demuxer is a single-sample comparison; (2) all results are `cached:true`, so numbers were reused, not re-measured this run. The gap magnitudes (2.8x–11.3x) are large enough that the ordering is very likely correct, but a fresh re-run (clear raw + `.browser-cache`) would harden the exact millisecond figures.
