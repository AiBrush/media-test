# robustness/edge_ts_pts_wraparound_demux

family: robustness | fixture asset: `ts_discontinuity.ts` (fixtures/media/, 190 KB, real MPEG-TS) | primaryMetric: wall (durationMs proxy; no bench{} block — all results cached) | passCount: 4 / 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (CONTESTED — 4 of 7 engines PASS).
- Decisive factor: **correctness accuracy of the duration derivation under 33-bit PTS wraparound.** All four passers satisfy the same single oracle (`golden-metadata`) on the LOOSE ts duration band (±90.09 s), so the track-level checks (h264/aac, 320×240, 30 fps, 48 kHz/2 ch) tie. The differentiator inside correctness is the measured `durationDeltaSec`: ffmpeg-wasm reports **0.0050 s** vs golden 600.605 s — the engine that unwrapped the rollover and re-derived total duration most precisely.
- Margin over runner-up: duration delta **0.0050 s vs 0.0263 s** (remotion-webcodecs / remotion-media-parser) = **~5.3× tighter**; vs mediabunny **1.4003 s** = **~280× tighter**. CAVEAT on perf: ffmpeg-wasm is the SLOWEST on wall (264 ms vs mediabunny's 36 ms = 7.3× slower), so if you rank purely on wall mediabunny wins; the verdict prioritizes correctness strength (per the decision ladder) because this is a robustness/edge scenario whose entire purpose is safe, accurate duration derivation across a timestamp discontinuity.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true (Δ0.0050s) | 264 | n/a | n/a | n/a | cached previous PASS |
| mediabunny@1.48.0 | PASS | golden-metadata:true (Δ1.4003s) | 36 | n/a | n/a | n/a | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true (Δ0.0263s) | 50 | n/a | n/a | n/a | cached previous PASS |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true (Δ0.0263s) | 66 | n/a | n/a | n/a | cached previous PASS |
| web-demuxer@4.0.0 | SKIPPED | — | n/a | n/a | n/a | n/a | container supported, but mis-derives fps (240 vs golden 30) on the PTS rollover — tracked engine limitation, cell skipped |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | does not declare input container 'ts' |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | does not declare input container 'ts' |

No engine exposes `throughputRealtime`, `peakMemory`, or `longtasks` in this shard: every result is `cached:true` and carries no `bench{}` block — only `durationMs` and the oracle measurements. Treat all perf comparisons as single-sample (n=1), low-confidence evidence.

## Why the winner wins (deep technical)

The fixture is `ts_discontinuity.ts`: an MPEG-TS program stream (188-byte packets) carrying H.264 video (320×240, 30 fps) and AAC-LC audio (48 kHz stereo), deliberately joined so that the 33-bit PES PTS counter (90 kHz clock, wraps every 2^33/90000 ≈ 26.5 h, but here a forced discontinuity/rollover) jumps. MPEG-TS has **no global duration field** — duration must be derived from first/last PTS (or PCR). A naive demuxer that subtracts a post-wrap PTS from a pre-wrap PTS produces a negative or absurd duration, or extrapolates a wrong inter-frame interval. The scenario notes (src/scenarios/robustness/index.ts:754) require duration be "derived safely without negative-duration or hang behavior."

ffmpeg-wasm wins on correctness because its probe path is a genuine libavformat demux, not a heuristic. `probe()` (src/engines/ffmpeg-wasm/adapter.ts:1892) writes the fixture into the wasm FS and calls `runInfo()` (adapter.ts:1912), which execs the real `ffmpeg -hide_banner -i <in>` program; `metadataFromLog()` (adapter.ts:1946) then parses libavformat's printed `Duration:` line via `parseDurationSecFromLog`. libavformat's mpegts demuxer applies its standard PTS-wrap correction (`av_rescale`/wrap handling against the 33-bit field), so the reported total resolves to within **0.0050 s** of the golden 600.605 s — by far the tightest of the four. This is the most precise unwrap in the field and is the decisive correctness signal for a wraparound/discontinuity test.

The other three passers also clear the gate but with looser duration agreement. mediabunny (env.configUsed.coreBuild=`pure-ts-esm`, backend webcodecs, COOP/COEP not required) demuxes the TS in pure TS and lands at Δ1.4003 s — still inside the 90.09 s loose band, but its PTS-walk estimate drifts ~1.4 s (roughly a GOP/segment-tail rounding on a 600 s clip). remotion-webcodecs (env backend `webcodecs`, streaming-backpressure) and remotion-media-parser (env backend `cpu-js`, full-parse demux) both land at exactly Δ0.0263 s — they share Remotion's media-parser TS reader and therefore the same duration estimate.

The oracle that gates this (`goldenMetadata`, src/core/oracles.ts:595) applies the LOOSE duration band for ts: `durationToleranceFor` (oracles.ts:240) maps container `ts` into `LOOSE_DURATION_CONTAINERS` (oracles.ts:211), giving `max(±0.5 s, ±15% × 600.605)` = **90.09 s**, exactly the `durationToleranceSec:90.09075` in every passer's measurements. This loosening is documented (oracles.ts:188-191) precisely because TS has no header duration and two correct demuxers legitimately disagree by a GOP+. The track-level comparisons (oracles.ts:659 `compareTrack`) remain STRICT — codec, 320×240 dims, 30 fps (±fpsTolerance), 48 kHz, 2 ch — and all four match the golden, which is why web-demuxer (240 fps mis-derivation) would FAIL the strict fps check and was skipped instead.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost): same single oracle, but duration delta **1.4003 s** vs ffmpeg's 0.0050 s — its pure-TS PTS-walk is ~280× less accurate at re-deriving total duration across the rollover. It is the fastest on wall (36 ms vs 264 ms) but loses on the correctness-first ladder for an edge/robustness scenario.
- **remotion-webcodecs@4.0.479** (PASS, lost): duration delta **0.0263 s** — ~5.3× looser than ffmpeg's 0.0050 s. Tied with remotion-media-parser (shared Remotion parser). Wall 50 ms.
- **remotion-media-parser@4.0.479** (PASS, lost): duration delta **0.0263 s** (identical estimate to remotion-webcodecs); ~5.3× looser than the winner. cpu-js full-parse demux, wall 66 ms.
- **web-demuxer@4.0.0** (SKIPPED): container IS supported (it probes normal MPEG-TS fine), but on this wraparound fixture it mis-derives the video frame rate as **240 fps vs golden 30** because the 33-bit PTS rollover corrupts its inter-frame-interval fps estimate. That would FAIL the strict per-track fps check; it is a tracked engine limitation, so the cell is honestly skipped rather than counted as a pass. Honest skip.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare input container 'ts'." Honest NA — mp4box.js is an ISOBMFF (MP4/MOV/fragmented-MP4) box parser and has no MPEG-TS transport-stream demuxer, so it genuinely cannot ingest a `.ts` program stream.
- **platform@chrome-149** (NA_ENGINE): "engine does not declare input container 'ts'." Honest NA — the WebCodecs/MSE platform path declares no MPEG-TS demuxer (browsers do not natively demux raw .ts via these APIs), so the capability gate correctly excludes it.

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:746-757 (`id: 'edge_ts_pts_wraparound_demux'`, op `probe`, asset `ts_discontinuity.ts`, containersIn `['ts']`, videoCodecs `['h264']`, audioCodecs `['aac']`, oracle `golden-metadata`, tolerances `fpsTolerance:30`, notes describe the TS timestamp-jump robustness requirement).
- Fixture exists and is real: `fixtures/media/ts_discontinuity.ts` = 190 KB on disk (stat confirmed). Golden: `fixtures/golden/ts_discontinuity.ts.meta.json` (container ts, durationSec 600.605, 2 tracks: h264 320×240@30, aac 48000/2). Not synthetic/empty/mock.
- Oracle: `goldenMetadata` at src/core/oracles.ts:595; loose ts band resolved by `durationToleranceFor` at oracles.ts:240 + `LOOSE_DURATION_CONTAINERS` at oracles.ts:211. The oracle performs a real positional track-by-track comparison against the committed golden (codec/dims/fps/sampleRate/channels are STRICT); only the TS duration band is widened, for a documented physical reason (TS carries no header duration). It is NOT trivially satisfiable: the strict fps check is exactly what excludes web-demuxer's 240 fps mis-read.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:1892 (`probe`) → :1912 (`runInfo` execs real `ffmpeg -i`) → :1946 (`metadataFromLog` parses libavformat's printed Duration/streams). Genuinely calls the vendored ffmpeg wasm core; no canned output, no input→output copy, no golden short-circuit, no error-swallow-as-success (runInfo throws if no `Input #` block is logged, adapter.ts:1924).
- Measurements are physically plausible: container ts, 2 tracks, duration ~600.6 s, ffmpeg Δ0.0050 s, band 90.09 s — all consistent with a real 10-minute discontinuous TS clip.
- Cached note: ALL seven results are `cached:true` (`reason:"cached previous PASS result"`). The PASS verdicts and oracle measurements are reused, not re-run in this batch — staleness risk exists; the duration deltas/wall numbers reflect a prior run. No bench{} sample arrays are present to cross-check spread.
- Verdict: **REAL** — real fixture, real libavformat demux implementation, meaningful oracle with strict per-track checks (only the TS duration band is intentionally/documentedly loose). The cached-only evidence is the one caveat.

## Confidence & caveats

- Confidence: medium. The winner is REAL and its correctness margin (Δ0.0050 s, ~5.3× tighter than the next) is concrete and from a genuine libavformat path. But the contest is decided on a single loose-band oracle, and the perf signal is thin: no `bench{}`, all results `cached`, n=1, no mad/p95.
- Perf vs correctness tension: if ranked purely on wall, mediabunny (36 ms) beats ffmpeg-wasm (264 ms, 7.3× slower). The verdict deliberately weights correctness strength first because this is a robustness/edge scenario about safe duration derivation across a PTS wraparound — exactly where ffmpeg's libavformat unwrap excels.
- The ts duration band is 90.09 s wide, so all four "passes" are loose on duration; the real discriminators are the strict track checks (all tie) plus the measured duration accuracy (winner). web-demuxer's exclusion confirms the gate has teeth on fps.
