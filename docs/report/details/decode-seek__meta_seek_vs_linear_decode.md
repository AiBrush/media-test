# decode-seek/meta_seek_vs_linear_decode

family: decode-seek | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 / AVC in MP4, ~31 MB, 30s 1080p) | primaryMetric: wall | passCount: 5 / 7

## Verdict

- **Best framework: `mediabunny@1.48.0`** (contested — 5 of 7 engines PASS).
- **Decisive factor: PERFORMANCE.** All 5 PASS engines satisfy the single gating oracle (`property-invariant` / `seek(t)==linear-decode-frame-at(t)`) with **identical, perfect correctness** — every one landed exactly on PTS 4000000µs (deltaUs = 0). Correctness is therefore a tie, so the ranking falls through to wall-clock latency.
- **Margin over runner-up:** mediabunny 42.84ms wall vs web-demuxer 146.04ms = **3.41x faster wall** than the runner-up; **3.84x** faster than platform (164.65ms), **4.52x** faster than ffmpeg.wasm (193.79ms), and **65.4x** faster than remotion-webcodecs (2803.05ms). All measurements are n=1 (single sample, mad=0), so the magnitude ranking is robust but the precise ratios are weak-N evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true (Δ0µs) | 42.845 ms | n/a (not measured) | 0 (n=0) | 4223 ms | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | property-invariant:true (Δ0µs) | 146.040 ms | n/a | 0 (n=0) | 3675 ms | cached previous PASS result |
| platform@chrome-149 | PASS | property-invariant:true (Δ0µs) | 164.650 ms | n/a | 131,698,844 bytes (~125.6 MB) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (Δ0µs) | 193.790 ms | n/a | 0 (n=0) | 3234 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true (Δ0µs) | 2803.045 ms | n/a | 0 (n=0) | 2055 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(throughputRealtime is not in this scenario's metric set — metrics are `wall`, `peakMemory`, `longtasks`. peakMemory was only captured by `platform`; the other engines report n=0 samples, so 0 means "not measured", not "zero memory".)

## Why the winner wins (deep technical)

This is a **metamorphic seek invariant**, not a pixel test. The scenario (`src/scenarios/decode-seek/index.ts:688-700`) drives `op: 'seek'` to `tUs = 4_000_000` with `expectKeyframe: true` on the H.264-in-MP4 clip. The oracle `seekVsLinearDecodeInvariant` (`src/core/oracles.ts:3501-3530`) takes the engine's `ctx.seek.landedPtsUs`, computes the *reference* PTS via `expectedSeekPtsUs` (`oracles.ts:2250-2268`) which, for a keyframe request, returns `keyframeAtOrBefore(videoPackets, 4_000_000).ptsUs` from the golden demuxed packet table, and asserts `|landed − expected| ≤ seekToleranceUs` where the default tolerance is a strict **1000µs (1ms)** (`oracles.ts:154-161`). Every PASS engine produced `landedPtsUs = 4000000`, `expectedPtsUs = 4000000`, `deltaUs = 0`: the requested 4.000s coincides exactly with a keyframe (GOP boundary) in this CFR clip, so a correct seek snaps precisely to it. Correctness is thus a 5-way tie at the strongest possible margin (zero error), and there is no bit-exact pixel ladder to break the tie because this invariant deliberately avoids a cross-decoder pixel requirement (scenario notes, `index.ts:697-699`).

With correctness tied, the win is mechanistic latency. mediabunny's seek path (`src/engines/mediabunny/adapter.ts:1415-1436`) is a thin, purpose-built random-access primitive: it opens the input, grabs the primary video track, constructs a `VideoSampleSink` configured with hardware-preferred `VideoDecoder` options (`videoDecoderOptionsForTrack`), and calls `sink.getSample(targetSec)` — a single seek-to-nearest-keyframe-then-decode-forward operation that returns exactly one `VideoSample`, reads its `microsecondTimestamp` as the landed PTS, and disposes everything (`mbInput.dispose()`). It decodes the **one** frame it needs at the keyframe and stops; it never walks the whole 30s stream. The env confirms the fast backend: `configUsed.backend = "webcodecs"`, `hwAccel = "prefer-hardware"`, `pipeline = "streaming-lockstep"`, `coopCoep = "not-required"`, `wasmThreads = 0`, `coreBuild = "pure-ts-esm"` — pure-TS demux feeding hardware WebCodecs on the M1 Max (ANGLE Metal), with no SharedArrayBuffer / COOP-COEP gate. That gives 42.845ms wall.

The losers are slower for concrete reasons: **web-demuxer (146ms)** routes demux through its `ffmpeg`-derived wasm core before handing packets to WebCodecs, adding wasm boundary and module-init overhead the pure-TS mediabunny demuxer avoids (3.41x slower). **ffmpeg.wasm (193ms)** does the full seek+decode inside single-threaded wasm (`wasmThreads:0`) with no hardware decode path at all, so even one keyframe decode is software in wasm — slowest of the WebCodecs-class engines (4.52x slower). **platform (164ms)** uses the same hardware WebCodecs `VideoDecoder` (`adapter.ts:459`) and lands correctly, but pays for a heavier rasterization/transfer stack (`pixelBackend: webgpu>webgl>offscreen2d`, `frameTransfer: transferable`) and is the only engine that materialized real memory pressure — **peakMemory 131.7 MB** and **longtasks 19963ms**, an order of magnitude more main-thread blocking than mediabunny's 4223ms; on the tiebreaker axes (peak memory, longtasks) platform is strictly worse even before the 3.84x wall gap. **remotion-webcodecs (2803ms)** is correct but ~65x slower: its seek goes through the generic convert/extract pipeline (`pipeline: streaming-backpressure`, `convert=main-thread`) with full parser setup rather than a dedicated single-sample sink, so it pays whole-pipeline startup cost to retrieve one frame.

## What each other framework did wrong

- **web-demuxer@4.0.0** — PASS, correct (Δ0µs) but 146.04ms wall = **3.41x slower** than mediabunny; wasm-core demux overhead in front of WebCodecs vs mediabunny's pure-TS demux.
- **platform@chrome-149** — PASS, correct (Δ0µs) but 164.65ms wall = **3.84x slower**, and the only engine showing heavy resource cost: **131.7 MB peak memory** and **19963ms longtasks** (4.7x mediabunny's longtasks). Loses on every tiebreaker axis.
- **ffmpeg.wasm@0.12.15** — PASS, correct (Δ0µs) but 193.79ms wall = **4.52x slower**; software seek+decode entirely inside single-thread wasm (no hardware decode), slowest of the hardware-class group.
- **remotion-webcodecs@4.0.479** — PASS, correct (Δ0µs) but 2803.05ms wall = **65.4x slower**; generic main-thread convert/extract pipeline startup to fetch a single frame.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'seek'". Honest NA — it is a parser, not a decoder, and cannot decode a frame at a timestamp; declaring `seek` would be false advertising.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'seek'". Honest NA — mp4box is a box/sample-table demuxer with no decode pipeline, so it genuinely cannot land on a *decoded* frame PTS; the NA is correct, not under-declared.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/decode-seek/index.ts:688-700` (case `meta_seek_vs_linear_decode`), generated into a Scenario at `index.ts:732-748`. op=`seek`, input=`h264_1080p_30s.mp4`, options `{tUs:4_000_000, expectKeyframe:true}`, oracle `property-invariant`.
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` — confirmed present, ~31 MB real H.264/MP4 file (`stat`). Real media, not synthetic/mock/empty.
- **Oracle:** `seekVsLinearDecodeInvariant` at `src/core/oracles.ts:3501-3530`, dispatched from `oracles.ts:2654-2655`; reference PTS from `expectedSeekPtsUs` / `keyframeAtOrBefore` over the golden demuxed packet table (`oracles.ts:2250-2268`). Strict 1ms tolerance (`oracles.ts:154-161`). This is a real cross-path comparison (seek PTS vs independently-demuxed golden keyframe PTS), not trivially satisfiable; deltaUs=0 at a genuine GOP boundary is physically plausible for a CFR 4s seek.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1415-1436` — genuine `VideoSampleSink.getSample(targetSec)` against the real mediabunny library + hardware `VideoDecoder`; reads `sample.microsecondTimestamp` as the landed PTS. No canned output, no golden short-circuit, no swallowed errors (it throws on missing track/sample), proper resource disposal.
- **Verdict: REAL.** Real fixture + real WebCodecs/library implementation + meaningful strict-tolerance metamorphic oracle.
- **Cached note:** the winner's result (and all 5 PASS results) have `cached:true` ("cached previous PASS result"). The PASS and Δ0µs correctness are trustworthy, but the **wall numbers were reused, not re-run this session** — treat the 3.41x margin as the latest recorded measurement, not a fresh one.

## Confidence & caveats

- Confidence: **high** on the winner identity. Correctness is a 5-way perfect tie (Δ0µs), so the decision is purely latency, and mediabunny's 42.84ms is far below the field with no plausible measurement-noise explanation for a 3.4x–65x gap.
- Caveats: (1) every bench is **n=1** (mad=0, single sample) — exact ratios are weak-N; (2) all results are **cached**, so wall times are stale relative to this run; (3) this oracle is a **timing/metadata invariant, not a pixel/bit-exact gate** — it certifies the seek lands on the correct PTS, not that decoded pixels match, so "best" here means fastest correct seek, not pixel-validated; (4) throughputRealtime is not measured for this scenario (not in its metric set); peakMemory is only populated for `platform`.
