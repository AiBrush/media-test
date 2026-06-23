# robustness/edge_extreme_fps_1_probe

- **family**: robustness
- **fixture asset**: `fixtures/media/h264_1fps_30s.mp4` (real file, 183 KB on disk)
- **golden**: `fixtures/golden/h264_1fps_30s.mp4.meta.json` (container=mp4, durationSec=30, 1 video track h264 320×240 **fps=1**)
- **primaryMetric**: durationMs (wall time) — no `bench{}` block emitted for this probe row
- **passCount**: 7 / 7

## Verdict

- **Best framework**: **mp4box@2.3.0** (CONTESTED — 7-way tie on correctness, narrow win on speed, effectively co-leader with remotion-media-parser).
- **Decisive factor**: Correctness is *identical and exact* across all 7 engines — every engine passes the single gating oracle `golden-metadata` with `durationDeltaSec=0` (perfect, well inside the strict ±0.0417 s = 1-frame band). With correctness tied, the decision falls to performance (`durationMs`). mp4box and remotion-media-parser are tied-fastest at **9 ms**; mp4box is selected because its probe path is the leanest "read-moov-only, drop mdat" pure-JS parse (`discardMdatDataProbe: true`), giving minimal peak memory with no COOP/COEP requirement, while still computing the extreme `fps=1` correctly from the sample table.
- **Margin over runner-up**: vs the *other* tied-fastest engine (remotion-media-parser) the margin is **1.00x (a dead tie at 9 ms)**. vs the slowest passing engine (web-demuxer, 169 ms) mp4box is **18.8x faster**; vs ffmpeg.wasm (150 ms) it is **16.7x faster**. All numbers are n==1 single samples (no mad/p95 spread reported), so the speed gap among the sub-20 ms engines is weak evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-metadata:true | 9 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 9 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 15 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 17 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 17 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 150 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 169 | n/a | n/a | n/a | cached previous PASS result |

All seven `golden-metadata` outcomes carry identical `measurements`: `durationDeltaSec=0`, `durationToleranceSec=0.041666…` (the strict 1/24 s per-frame band). No engine emitted a `bench{}` object for this row; `durationMs` is the only quantitative differentiator.

## Why the winner wins (deep technical)

This is a **probe-only** scenario (`op: 'probe'`, `src/scenarios/robustness/index.ts:711-719`): the engine must parse the MP4 `moov` and report container/track metadata — specifically the pathological **1 fps over 30 s** timing. There is no decode, no transcode, no pixel comparison; the gate is purely metadata-vs-golden.

The fixture is genuinely "extreme": 30 video samples spread across 30 seconds. The danger is an engine computing fps wrongly (e.g. dividing by the wrong timescale, returning 0, or reporting the codec/container as something else). The golden requires `fps=1` exactly, and the oracle's per-track comparator (`src/core/oracles.ts:673`) allows only `±t.fpsTolerance` drift. mp4box clears it because its `toNormalizedMetadata` computes **average fps as `nb_samples / track-seconds`** — `src/engines/mp4box/adapter.ts:449` (`if (fpsDenSec > 0 && t.nb_samples > 0) track.fps = t.nb_samples / fpsDenSec;`), with `fpsDenSec = t.duration / t.timescale` (line 430/448). For this file that is 30 samples / 30 s = **1.0 fps**, hitting the golden value on the nose. The movie duration is taken directly from `mvhd.duration / mvhd.timescale` (`src/engines/mp4box/adapter.ts:416-417`), producing exactly 30.000 s and `durationDeltaSec=0`.

Mechanistically, mp4box uses a **pure-JS ISO-BMFF box walker** (`env.configUsed.backend: "pure-js"`, `pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"`). Critically for a probe it sets `discardMdatDataProbe: true` (`src/engines/mp4box/adapter.ts:99`: "probe drops mdat (moov-only) for minimal peak memory") — it appends the file, resolves on `onReady` from `getInfo()`, and never materializes the `mdat` payload. For a 183 KB H.264/MP4 the entire moov parse completes in **9 ms** with no WebCodecs, no wasm module instantiation, and `coopCoep: not-required`. That is why it ties the streaming remotion parser and crushes the wasm/WebCodecs engines: those carry fixed start-up cost (wasm module load for ffmpeg.wasm/web-demuxer; WebCodecs/canvas setup for platform/mediabunny/remotion-webcodecs) that dwarfs the trivial parse work for a tiny file.

Because correctness is a perfect 7-way tie (every engine reports the exact same `durationDeltaSec=0` and passes the same single oracle), no engine can win on **correctness strength** — they are all at the "structural/metadata-exact" rung (`golden-metadata`) with identical measured tolerances. The decision therefore legitimately reduces to performance + tiebreakers, where mp4box's moov-only, no-COOP/COEP, smallest-runtime probe path is the cleanest. The honest framing: mp4box and remotion-media-parser are **co-leaders at 9 ms**; mp4box is chosen on tiebreaker (c) (lower memory footprint via mdat discard, simplest probe path), not on a measured speed margin.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, also 9 ms, also `durationDeltaSec=0`. Did *nothing* wrong; it is a true co-leader (streaming `webReader`, `fieldsTier: metadata-only`, pure CPU-JS). It loses only on tiebreaker (c): mp4box's moov-only `discardMdatDataProbe` path is marginally leaner. Margin = 1.00x (tie).
- **remotion-webcodecs@4.0.479** — PASS, 15 ms (1.67x slower than mp4box). Correct metadata, but its `streaming-backpressure` + WebCodecs-oriented adapter carries setup overhead unnecessary for a pure metadata probe.
- **mediabunny@1.48.0** — PASS, 17 ms (1.89x slower). Correct, but the `streaming-lockstep` WebCodecs pipeline (canvas pool, prefer-hardware) adds fixed cost beyond what a moov probe needs.
- **platform@chrome-149** — PASS, 17 ms (1.89x slower). Correct via the browser `VideoDecoder`/streaming path; same WebCodecs start-up tax as mediabunny.
- **ffmpeg.wasm@0.12.15** — PASS, 150 ms (16.7x slower). Correct metadata, but the single-thread wasm core must instantiate the ffmpeg module and FS-write the file before `ffprobe`-style parse — heavy fixed cost for a 183 KB probe.
- **web-demuxer@4.0.0** — PASS, 169 ms (18.8x slower, the slowest passing engine). Correct metadata via its wasm libav demuxer, but wasm module load + worker setup dominate; for a tiny moov probe this is by far the worst startup-amortization.

No engine FAILed and none returned NA — the operation (`probe`) is universally declared and the 1fps fixture is universally handled.

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/robustness/index.ts:711-719` — `id: 'edge_extreme_fps_1_probe'`, `op: 'probe'`, `asset: 'h264_1fps_30s.mp4'`, `oracles: ['golden-metadata']`, notes "§A.16 extreme fps (1 fps): probe must report ~1 fps and ~30s duration (golden)."
- **Fixture exists**: `fixtures/media/h264_1fps_30s.mp4`, 183 KB real H.264/MP4 (verified via `ls`/`stat`). Not synthetic/empty/mock. Golden `fixtures/golden/h264_1fps_30s.mp4.meta.json` is a real, physically-plausible metadata record (mp4, 30 s, h264 320×240 fps=1 bitrate 48667).
- **Oracle**: `golden-metadata` at `src/core/oracles.ts:595-657`. It performs a **real field-by-field comparison** against the golden meta: container string (line 606), duration within a tolerance band (lines 614-637, here the strict 1-frame ±0.0417 s band), and per-track codec/width/height/fps/sampleRate/channels via `compareTrack` (lines 659-686). fps tolerance is tight (`Math.abs(a.fps - b.fps) > t.fpsTolerance`, line 673). Not trivially satisfiable — any wrong fps (e.g. 0, 30, or 25) or wrong duration would push `diffs` non-empty and FAIL. Measured `durationDeltaSec=0` is physically plausible for a clean CFR file probed against an ffprobe-derived golden.
- **Winner adapter**: `src/engines/mp4box/adapter.ts` — probe is genuinely implemented: `MP4Box.createFile` + whole-file append + `onReady`/`getInfo()` (line 718, 28), with `toNormalizedMetadata` deriving fps from `nb_samples / track-seconds` (line 449) and duration from `mvhd.duration/timescale` (line 416). No canned output, no copy-input-to-output, no short-circuit to the golden file, no error-swallow-and-report-success. `discardMdatDataProbe: true` (line 99) confirms a real moov-only parse.
- **Verdict**: **WEAK-GATE**. The implementation and fixture are fully real and the oracle is a genuine comparison, *but* the gate is a single metadata oracle (`golden-metadata`) with no packet-level or decoded-frame check. It is the correct gate for a `probe` op, yet it is the weaker "structural/metadata-exact" rung — a PASS proves the engine reports the right container/duration/fps, not that it can decode the stream. Because all 7 engines clear this single loose-ish gate identically, the "winner" is decided on a 9 ms vs 9 ms tie + tiebreaker rather than on any correctness differentiation. PASS is real, not strong, and not discriminating.
- **Cached note**: **All 7 results have `cached==true`** ("cached previous PASS result"). None were re-run in this pass; the `durationMs` figures (and thus the entire speed-based ranking) are reused from prior runs and carry staleness risk. The 9 ms vs 9 ms tie and the sub-20 ms cluster are single-sample, cached numbers — treat the speed ordering as indicative only.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict (7-way exact tie on `golden-metadata`, `durationDeltaSec=0`) is solid and code-verified. The winner pick is genuinely contested and rests on a 1.00x tie broken only by adapter-design tiebreakers.
- All evidence is **cached** (no fresh re-run); `durationMs` is n==1 with no mad/p95 — the speed margins among fast engines are weak. Only the wasm-vs-JS gap (16-19x) is robust.
- No `bench{}` block exists for this probe row, so peakMemory/throughput/longtasks could not be compared numerically; the memory-footprint tiebreaker for mp4box rests on its documented `discardMdatDataProbe` moov-only path, not a measured peakMemory number.
- The gate is metadata-only by design for a probe op; a stronger conclusion (which engine demuxes/decodes this 1fps stream best) would require the demux/decode scenarios for the same asset.
