# probe/h264_vfr

family: probe | fixture asset: `h264_vfr.mp4` (fixtures/media/h264_vfr.mp4, 2.3 MB, real) | primaryMetric: wall (ms) | passCount: 7/7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (all 7 engines PASS the single gating oracle `golden-metadata`).
- **Decisive factor: PERFORMANCE (wall median).** Correctness is a tie — every engine passes the exact same metadata-exact oracle with the same 2-track match and sub-tolerance duration deltas — so the ranking falls through to the primary metric (wall). mediabunny has the lowest wall median at **3.55 ms**.
- **Margin over runner-up:** remotion-media-parser is second at 6.425 ms → mediabunny is **~1.81x faster wall**. Over the slowest passing engine (platform, 47.31 ms) the margin is **~13.3x**. Evidence is weak in spread terms: every bench is **n=1, mad=0** (single sample) and **cached==true**, so the margin is indicative, not statistically robust.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 3.55 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 6.425 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:true | 13.72 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 13.935 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 18.5 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 42.835 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 47.31 | n/a | n/a | n/a | cached previous PASS result |

Note: `bench` carries only the `wall` metric for this scenario; throughputRealtime / peakMemory / longtasks were not recorded (probe is a header-read, not a decode/encode loop), so the tie-break is decided on wall alone.

## Why the winner wins (deep technical)

The operation is a **metadata probe** of an **H.264 + AAC MP4** whose distinguishing trait is a **variable frame rate**. The golden (`fixtures/golden/h264_vfr.mp4.meta.json`) declares container `mp4`, duration `12.533 s`, a 1280x720 H.264 video track with a *nominal average* fps of `8.856`, and a 48000 Hz / 2-channel AAC track. The scenario (src/scenarios/probe/index.ts:74-81) attaches a VFR-specific `fpsTolerance: 0.1` precisely because for VFR media there is no single true fps — every engine must report an *average* that lands within ±0.1 of 8.856. The `golden-metadata` oracle (src/core/oracles.ts:595-657, track compare at :659-686) checks container, duration within band, and per-track codec/dims/fps/sampleRate/channels.

For probe there is no pixel work, so correctness collapses to "did you read the moov correctly and average the VFR cadence sensibly." All seven did. mediabunny's win is therefore purely about reading the container faster.

mediabunny's path (src/engines/mediabunny/adapter.ts):
- Duration is taken via the **cheap metadata path first** — `input.getDurationFromMetadata()` reads the declared `mvhd`/`tkhd` duration without scanning samples (metadataFromInput, adapter.ts:427-441). It only falls back to the sample-walking `computeDuration()` if the header yields null. For this 12.533 s file the header path succeeds, so no full-file scan is paid. The measured `durationDeltaSec` is **0.0003333 s** against a `durationToleranceSec` of **0.041667 s** (i.e. delta is ~0.8% of the allowed band — essentially exact).
- fps is computed from a **bounded prefix** of packets: `v.computePacketStats(120)` and `stats.averagePacketRate` (adapter.ts:309-318). Reading only the first 120 packets to derive the average packet rate is exactly the right VFR strategy — it produces the nominal/average 8.856 fps without demuxing the whole stream, which keeps wall time minimal while still landing inside the ±0.1 fps band.
- The backend (env.configUsed) is `pure-ts-esm` core with `coopCoep: not-required` and `sharedArrayBuffer: false`. No WebCodecs decode is needed for probe, so mediabunny pays only ESM parsing of the box structure — the lightest possible path, which is why it edges out remotion-media-parser's also-streaming JS parser.

remotion-media-parser (the 6.425 ms runner-up) is conceptually similar — a streaming metadata-only parser (`parseMedia` with `fieldsTier: 'metadata-only'`, backend `cpu-js`, src/engines/remotion-media-parser/adapter.ts:340-356) — and lands at the same 0.001 s duration delta. It is ~1.81x slower in wall, plausibly because its request/field-resolution and `webReader` plumbing add per-call overhead over mediabunny's direct box read. Both are honest, near-identical metadata reads; the gap is implementation constant-factor, not capability.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on speed only. 6.425 ms wall vs 3.55 ms = ~1.81x slower. durationDelta 0.001 s (well inside 0.041667 s). No correctness deficit.
- **mp4box@2.3.0** — PASS, lost on speed. 13.72 ms = ~3.87x slower. Backend `pure-js`, `whole-file-append(MP4BoxBuffer+fileStart)` — it buffers/appends the whole file rather than range-reading the moov, inflating wall on a 2.3 MB input. durationDelta 0.001 s.
- **ffmpeg.wasm@0.12.15** — PASS, lost on speed. 13.935 ms = ~3.93x slower. wasm probe (ffprobe-equivalent) carries module/FS overhead. Largest duration delta of the set at 0.003 s, still far inside 0.041667 s.
- **remotion-webcodecs@4.0.479** — PASS, lost on speed. 18.5 ms = ~5.2x slower. `streaming-backpressure` pipeline with `bufferWriter`; heavier scaffolding than the bare metadata read this probe needs. durationDelta 0.001 s.
- **web-demuxer@4.0.0** — PASS, lost on speed. 42.835 ms = ~12.1x slower. Likely wasm demuxer init dominating a probe-only op. durationDelta 0.000333 s.
- **platform@chrome-149** — PASS, lost on speed. 47.31 ms = ~13.3x slower (slowest). Uses `VideoDecoder`/`<video>` WebCodecs machinery (env decode/encode fields) where only a header read is required; spinning up the platform demux/decoder path is overkill for probe. durationDelta 0.000333 s.

No engine was NA or FAIL — none under-declared a probe capability; this is a uniformly-supported metadata read.

## Anti-cheat validation

- **Scenario:** src/scenarios/probe/index.ts:74-81. Input field `asset: 'h264_vfr.mp4'`, container mp4, codecs h264/aac, `tolerances.fpsTolerance: 0.1`. Notes explicitly explain the VFR average-fps rationale.
- **Fixture:** `fixtures/media/h264_vfr.mp4` exists, 2.3 MB — a real H.264/AAC MP4, not synthetic/empty/mock.
- **Golden:** `fixtures/golden/h264_vfr.mp4.meta.json` carries physically plausible values (12.533 s, 1280x720, fps 8.856, 48 kHz stereo AAC, bitrates ~1.35 Mbps / 128 kbps). Sibling goldens (.packets.json 65k, .frames.json, .ssim.json) confirm a real decoded corpus.
- **Oracle:** src/core/oracles.ts:595-657 (`goldenMetadata`) + compareTrack :659-686. It performs a real field-by-field comparison (container, duration within a per-container band, codec/dims/fps/sampleRate/channels positionally per track) and FAILs on any mismatch. Not trivially satisfiable: the duration band here is ±0.041667 s (one frame at the golden cadence) and fps band ±0.1 — both tight. Measured durationDelta 0.000333 s for mediabunny is plausible for a correct moov read.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:417-447 (metadataFromInput) + :297-356 (normalizeTrack) + :309-318 (fps via computePacketStats). It calls the real mediabunny `Input` API (getDurationFromMetadata, getTracks, getDisplayWidth/Height, computePacketStats, getCodec). No canned output, no copy-input-to-output, no short-circuit to the golden, no error-swallow-as-success (failures map to null fields, which would surface as oracle diffs).
- **cached note:** mediabunny's result (and all 7) has **cached==true** — reused from a prior PASS, not re-run this session. The PASS and the wall figure are real but stale; a fresh run could shift the small margins.
- **Verdict: REAL.** Real fixture, real library calls, meaningful tight metadata oracle. The single caveat is that the oracle is metadata-structural (not bit-exact decode) and the decision is performance on n=1 cached samples — strong enough for "REAL," not for a robust speed claim.

## Confidence & caveats

- Confidence: **medium.** The winner determination is unambiguous on the recorded metric (lowest wall by a clear ~1.81x), and the implementation/fixture/oracle all validate as genuine.
- Caveats: (1) all benches are **n=1, mad=0, cached** — the 1.81x margin is a single-sample, reused measurement; (2) the gate is **metadata-only structural**, so this is not a correctness-strength differentiation — every engine ties on correctness and the winner is decided purely on wall; (3) throughputRealtime/peakMemory/longtasks were not captured for this probe, removing secondary tie-breakers; (4) a fresh (non-cached) run is advised before quoting the speed margin externally.
