# performance/metamorphic-vfr-probe-duration

**Family:** performance | **Fixture:** `fixtures/media/h264_vfr.mp4` (H.264 video + AAC audio in MP4, ~2.3 MB, genuinely variable frame rate) | **Primary metric:** `opsPerSec` (probes/sec = 1/wall) | **passCount:** 7 / 7

Concrete restatement of the question: For the scenario whose id (after the slash) is `metamorphic-vfr-probe-duration` — a `probe` (read-only metadata extraction) of the variable-frame-rate asset `h264_vfr.mp4`, gated by the `golden-metadata` oracle and ranked by `opsPerSec` — which of the 7 media frameworks does the operation best, why mechanistically, and is the test honest (real fixture, real implementation, meaningful oracle)?

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED win (all 7 engines PASS the single gating oracle equally).
- **Decisive factor:** Since every engine passes the same lone oracle (`golden-metadata`) at effectively identical correctness, the ranking falls to the primary performance metric `opsPerSec`. mediabunny posts the highest throughput at **325.73 ops/s** (wall median 3.07 ms).
- **Margin over runner-up:** runner-up is remotion-media-parser@4.0.479 at **298.51 ops/s** (wall 3.35 ms). mediabunny is **~1.09x faster** by ops/s and **~1.09x lower** wall. This is a narrow margin on **n==1** (single measured iteration, warmup=1, mad=0) — weak statistical evidence; mediabunny and remotion-media-parser are essentially tied.

## Per-engine results

| Engine | Status | Oracles passed | Wall median (ms) | opsPerSec | durationDeltaSec | reason |
|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 3.07 | **325.73** | 0.000333 | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 3.35 | 298.51 | 0.001000 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 7.59 | 131.75 | 0.001000 | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 14.40 | 69.44 | 0.001000 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 16.21 | 61.69 | 0.003000 | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 25.75 | 38.83 | 0.000333 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 30.61 | 32.67 | 0.000333 | cached previous PASS result |

(This scenario does not report throughputRealtime, peakMemory, or longtasks — `metrics: ['opsPerSec', 'wall']` in the scenario def. The two probe metrics are mechanically linked: `opsPerSec = ctx.ops(=1)/wall`, runner.ts:1131-1132.)

## Why the winner wins (deep technical)

The operation is a pure **probe** of an MP4 (`isom` major brand) carrying an H.264 (avc1) video track and an AAC audio track. The metamorphic point of the scenario (`src/scenarios/performance/metamorphic.ts:35-37,137-151`) is that `h264_vfr.mp4` is **variable frame rate**: nominal fps is 8.856 over a 12.533 s duration, and the duration must be derived from the container's real timeline (mvhd/stts), NOT reconstructed from `frameCount × fps`. The `golden-metadata` oracle (`src/core/oracles.ts:595-657`) asserts the probed `durationSec` lands within a strict per-frame band of the golden 12.533 s (`fixtures/golden/h264_vfr.mp4.meta.json`), plus exact container/codec/dims/fps/sampleRate/channels per track.

Mechanistically mediabunny wins because its probe is the cheapest *metadata-only* path of the seven. Its adapter (`src/engines/mediabunny/adapter.ts:1134-1141`) opens the input, calls `metadataFromInput`, and disposes — nothing else. `metadataFromInput` (`adapter.ts:417-453`) reads duration via the **cheap declared-duration path first**: `input.getDurationFromMetadata()` (adapter.ts:429) reads the MP4 `mvhd`/`tkhd` declared duration directly, with no sample-table scan, and only falls back to `computeDuration()` (a full fragment/sample walk) when the declared duration is null. For a faststart MP4 the declared duration is present, so mediabunny never walks the `stts`/`ctts` tables. That is why its measured `durationDeltaSec` is 0.000333 s (within tolerance 0.041667 s = one frame at 24fps band) AND its wall is just 3.07 ms — it satisfies the VFR-duration invariant from the box header alone. Its config (`env.configUsed`: `coreBuild: pure-ts-esm`, `sharedArrayBuffer:false`, `coopCoep: not-required`) means no WASM instantiation and no COOP/COEP requirement on the probe path; the WebCodecs backend listed is irrelevant to probe (no decode happens).

The runner-up, remotion-media-parser (cpu-js, `fieldsTier: metadata-only`, webReader, streaming), is nearly identical: 3.35 ms / 298.51 ops/s, durationDelta 0.001 s. Both are pure-JS box parsers reading the header timeline; the 0.28 ms / ~1.09x gap is within n==1 noise (mad=0 because there is only one sample). mediabunny's slightly tighter delta (0.000333 vs 0.001) suggests it reports the raw mvhd-derived duration with marginally less rounding, but both are correct.

The slower passing engines all do strictly more work for the same answer: remotion-webcodecs (7.59 ms) carries a heavier streaming-backpressure converter init; mp4box (14.40 ms, pure-js whole-file append `MP4BoxBuffer+fileStart`) buffers and parses the entire file rather than just the moov header; ffmpeg.wasm (16.21 ms) pays WASM module/avformat open cost; platform/chrome (25.75 ms, WebCodecs + `<video>`-based muxing config) goes through a heavier media-element/demuxer stack; web-demuxer (30.61 ms) is the slowest, paying WASM + worker bootstrap to answer a header-only question. None of these is *wrong* — they all hit duration 12.533 s within tolerance — they are simply heavier probe paths for a question answerable from the moov box.

## What each other framework did wrong

- **remotion-media-parser@4.0.479 — PASS, lost on throughput.** Correct (durationDelta 0.001 s) but 3.35 ms vs 3.07 ms → 298.51 vs 325.73 ops/s (~0.92x of winner). Gap is within n==1 noise; effectively a tie.
- **remotion-webcodecs@4.0.479 — PASS, lost on throughput.** 7.59 ms / 131.75 ops/s (~0.40x of winner). Streaming-backpressure converter adapter has higher fixed init overhead for a header-only probe.
- **mp4box@2.3.0 — PASS, lost on throughput.** 14.40 ms / 69.44 ops/s (~0.21x). `whole-file-append (MP4BoxBuffer+fileStart)` with `rangeReads:false` ingests the full 2.3 MB rather than range-reading just the moov.
- **ffmpeg.wasm@0.12.15 — PASS, lost on throughput.** 16.21 ms / 61.69 ops/s (~0.19x). WASM avformat open + probe cost dominates; durationDelta 0.003 s (still within tol).
- **platform@chrome-149 — PASS, lost on throughput.** 25.75 ms / 38.83 ops/s (~0.12x). Heavier WebCodecs + media-element demux stack for metadata; correct (durationDelta 0.000333 s).
- **web-demuxer@4.0.0 — PASS, slowest.** 30.61 ms / 32.67 ops/s (~0.10x of winner). WASM + worker bootstrap for a question answerable from the box header.

No engine was NA or FAIL here — VFR MP4 probe is universally supported, so the contest is purely about probe-path overhead.

## Anti-cheat validation

- **Scenario:** `src/scenarios/performance/metamorphic.ts:137-151` (`id: 'performance/metamorphic-vfr-probe-duration'`, `op: 'probe'`, `input: VFR_ASSET`). `VFR_ASSET = 'h264_vfr.mp4'` (`src/scenarios/performance/_shared.ts:86`).
- **Fixture exists and is real:** `fixtures/media/h264_vfr.mp4` present, ~2.3 MB — a genuine H.264/AAC MP4, not synthetic/empty/mock. Golden present: `fixtures/golden/h264_vfr.mp4.meta.json` declares container mp4, duration 12.533 s, video h264 1280x720 @ 8.856 fps, audio aac 48000/2.
- **Oracle is meaningful, not trivially satisfiable:** `golden-metadata` (`src/core/oracles.ts:595-657`) compares measured container/duration/per-track codec/dims/fps/sampleRate/channels against the golden. Duration uses a strict per-frame band (`durationToleranceFor`), here 0.041667 s; it is NOT a wide catch-all. fps comparison uses `fpsTolerance` 0.1 (scenario tolerance). Measured `durationDeltaSec` values (0.000333–0.003 s) are physically plausible for real header-derived durations. This is a **metadata-exact** (structural) gate — stronger than smoke/perceptual proxy, weaker than bit-exact/decoded-frame.
- **Winner implementation is genuine:** `src/engines/mediabunny/adapter.ts:1134-1141` `probe()` calls the real mediabunny `Input` API (`openInput` → `metadataFromInput` → `dispose`); duration is read via real `getDurationFromMetadata()`/`computeDuration()` (`adapter.ts:429,436`). No canned output, no copy of golden, no swallowed errors reported as success.
- **Cached note:** ALL 7 entries have `cached: true` / `reason: "cached previous PASS result"`. The numbers were reused, not re-run in this batch. Per the launcher-seeding caveat in memory, stale PASS reuse is possible; however the result is structurally consistent (opsPerSec = 1000/wall to the digit for every engine), and the win is on a real, plausible metric.
- **Verdict: WEAK-GATE.** Implementation and fixture are real and the oracle is a real strict-tolerance comparison, BUT the *gate is a single metadata oracle* on a `probe` op, and the *winner is decided purely on a sub-millisecond throughput margin measured at n==1 (mad=0, single iteration)*. The PASS is genuine; the ranking evidence is thin. Not REAL (only one metadata oracle, no decode/packet correctness on this VFR asset, and the margin is noise-level), not SUSPECT/CHEAT (no faked path found).

## Confidence & caveats

- **Confidence: medium.** Code paths, fixture existence, golden, and oracle were all directly inspected. The winner's adapter does real work.
- The mediabunny-vs-remotion-media-parser gap (325.73 vs 298.51 ops/s) is ~1.09x at **n==1** — within measurement noise. A re-run could flip the top two. Treat the win as "mediabunny is in the fastest tier," not a robust lead.
- All results are **cached**; a fresh run (clearing raw + .browser-cache per the seeding caveat) would give more trustworthy throughput numbers.
- The sister scenario `metamorphic-vfr-iterate-packets` (golden-packets) is the *hard* VFR correctness gate (exact irregular packet table); this `vfr-probe-duration` case only checks that duration derives from the real timeline, which all engines satisfy.
