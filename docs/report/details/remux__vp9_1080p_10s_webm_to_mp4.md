# remux/vp9_1080p_10s_webm_to_mp4

family: remux | fixture asset: `vp9_1080p_10s.webm` (9.3 MB, VP9 1080p30 video + Opus 48kHz stereo audio) | primaryMetric: wall | passCount: 2/7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 2 engines PASS: mediabunny and ffmpeg.wasm).
- **Decisive factor: performance, after a correctness tie.** Both engines satisfy the identical structural gate (`reference-reimport`) with byte-for-semantics-identical results: 801 packets, 506 keyframes, 2 media tracks, duration within tolerance. Correctness is therefore comparable, so the tiebreaker is the primary metric (wall).
- **Margin over runner-up (ffmpeg.wasm):**
  - wall median: 70.88 ms vs 78.125 ms → **1.10x faster**.
  - throughputRealtime: 141.20x vs 128.10x → **1.10x higher**.
  - longtasks (main-thread blocking): 315 ms vs 19963 ms → **63.4x less** main-thread stall — the most decisive operational gap.
  - Both n==1 (single sample, mad==0), so the wall margin is weak evidence; the longtasks gap is large enough to be decisive regardless.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 70.88 ms | 141.20x | 48,997,397 B | 315 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 78.125 ms | 128.10x | 0 B (not sampled) | 19963 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:vp9-opus-in-mp4' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

This scenario is a **lossless container re-wrap, not a transcode**: VP9 video and Opus audio are pulled out of a Matroska/WebM container and re-wrapped into ISO-BMFF (MP4). VP9 is a registered ISO-BMFF coded stream (`vp09` sample entry + `vpcC` configuration box) and Opus is `Opus`/`dOps` in MP4, so the encoded samples are copied verbatim — no decode, no re-encode. The scenario notes (src/scenarios/remux/matrix.ts:125-135) correct an earlier wrong premise that VP9->MP4 was a transcode; it mirrors the existing AV1 webm->mp4 cell.

**mediabunny's path.** The adapter's `remux()` (src/engines/mediabunny/adapter.ts:1244-1260) takes the no-codec-options branch: it builds an MP4 output format via `makeOutputFormat`, opens the WebM with `openInput`, and runs `runConversion`, which calls the real library API `mb.Conversion.init(opts)` followed by `conversion.execute()` (src/engines/mediabunny/adapter.ts:842-855). With no `video`/`audio` transform options supplied, mediabunny's Conversion copies encoded packets straight through its ISOBMFF muxer — a pure-TS/ESM stream copy. The config used confirms this is a **streaming-lockstep** pipeline on a pure-TS ESM core, `coopCoep: not-required`, `sharedArrayBuffer: false`, `wasmThreads: 0` (env.configUsed). Because it never spins up a wasm runtime or a single monolithic blocking call, the work is chunked: longtasks total only **315 ms**, and wall is **70.88 ms** (141.20x realtime for a 10.008s clip).

**Oracle evidence (real numbers).** The gating `reference-reimport` oracle (src/core/oracles.ts:1225-1271, semantic remux branch src/core/oracles.ts:1273-1324) re-imports mediabunny's MP4 with the reference engine and got `reimportPackets: 801`, `reimportKeyframes: 506`, `reimportMediaTracks: 2`, matching `goldenMediaTracks: 2` (golden meta `vp9_1080p_10s.webm.meta.json` lists exactly 2 tracks: VP9 video + Opus audio). The duration check yielded `durationDeltaSec: 0.007` against `durationToleranceSec: 0.1` — well within band. These counts are physically plausible: a 10s 30fps clip plus 48kHz Opus blocks reasonably produces ~800 combined packets, and 506 keyframes reflects VP9's keyframe cadence plus per-block Opus keyframes.

**Why it beats ffmpeg.wasm.** ffmpeg.wasm produces the *identical* semantic result (801 packets, 506 keyframes, 2 tracks, durationDelta 0.013s < 0.1s) via a genuine `-map 0 -c copy ... -movflags +faststart` stream copy (src/engines/ffmpeg-wasm/adapter.ts:2031-2069). Correctness is a tie. The split is operational: ffmpeg.wasm runs the whole mux inside a single wasm invocation, registering **19963 ms** of longtasks — a ~20-second main-thread block — versus mediabunny's 315 ms. mediabunny is also 1.10x faster on wall and reports a concrete peakMemory (48.99 MB) where ffmpeg.wasm did not sample it. For a browser-resident remux, the 63x lower main-thread stall is the decisive practical advantage.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** Correctness identical to winner, but lost on performance — wall 78.125 ms (1.10x slower), throughput 128.10x (1.10x lower), and especially longtasks 19963 ms vs 315 ms (63.4x more main-thread blocking). Honest implementation; just slower and far more blocking.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'webm'" — honest NA. MP4Box.js is an ISO-BMFF-only library; it genuinely cannot demux Matroska/WebM, so it cannot be the input side of a webm->mp4 remux.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare feature 'remux:vp9-opus-in-mp4'" — honest NA. The scenario requires the specific `remux:vp9-opus-in-mp4` capability token; this engine declares neither it nor the broader path.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'remux'" — honest. The bare WebCodecs platform shim exposes decode/encode primitives, not a muxing/remux operation.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'remux'" — honest. It is a parser/demuxer, not a muxer; no remux output path exists.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'remux'" — honest. As the name says, it demuxes only; it has no muxer to write MP4.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/remux/matrix.ts:125-135 (case `{ asset: 'vp9_1080p_10s.webm', from: 'webm', to: 'mp4', videoCodecs:['vp9'], audioCodecs:['opus'], features:['remux:vp9-opus-in-mp4'] }`); id built by `remuxId` in src/scenarios/remux/_shared.ts:73-75; default oracle `reference-reimport` from src/scenarios/remux/_shared.ts:78-81.
- **Fixture exists & is real:** `fixtures/media/vp9_1080p_10s.webm`, 9.3 MB on disk — a genuine VP9/Opus WebM, not synthetic/empty/mock. Golden metadata `fixtures/golden/vp9_1080p_10s.webm.meta.json` confirms VP9 1080p30 + Opus 48kHz stereo, durationSec 10.008.
- **Oracle is meaningful:** `reference-reimport` (src/core/oracles.ts:1225-1271, semantic branch 1273-1324) actually re-demuxes the produced MP4 with the reference engine and compares media-track count, per-type track layout, and duration (tol 0.1s) against the golden. It fails on empty packet tables, track-count mismatch, or duration drift — not trivially satisfiable. It is a structural gate (not bit-exact decode), so PASS proves the output is a real, parseable MP4 preserving track semantics, but does not prove pixel/PCM identity.
- **Winner adapter is genuine:** src/engines/mediabunny/adapter.ts:1244-1260 → `runConversion` → real `mb.Conversion.init` + `conversion.execute()` (adapter.ts:842-855). No canned output, no input->output copy, no short-circuit to golden, no swallowed errors (errors throw).
- **Cached note:** mediabunny's result is `cached: true` ("cached previous PASS result"), as is ffmpeg.wasm's. Evidence was reused, not freshly re-run — staleness risk per the launcher-seeding caveat. Measurements are internally consistent and plausible, so risk is low but not zero.
- **Verdict: WEAK-GATE.** Real fixture + real stream-copy implementation + real oracle, but the gate is structural (`reference-reimport`), not a bit-exact decoded-frames or golden-packets correctness gate. PASS is genuine and meaningful but proves container-level integrity, not sample-level identity. Per src/scenarios/remux/_shared.ts:20-27 this is intentional (frame goldens are placeholders for default remux rows).

## Confidence & caveats

- Confidence: **medium**. The winner/loser ordering is unambiguous (correctness tie → mediabunny wins all perf metrics, decisively on longtasks). But: (1) both perf samples are n==1 (mad==0), so the 1.10x wall margin is thin; the 63x longtasks gap carries the decision. (2) Both results are cached, so numbers may be stale. (3) The gate is structural, not bit-exact — neither engine's pixel/audio fidelity is independently proven by this scenario (decode equality is covered elsewhere via the property/decoded-frames rows). The 5 NA engines are all honestly NA (parser/demuxer-only or ISO-BMFF-only tools that genuinely lack the webm-input remux path); none look like under-declared capabilities.
