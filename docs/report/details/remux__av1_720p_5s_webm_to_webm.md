# remux/av1_720p_5s_webm_to_webm

**family:** remux | **fixture asset:** `av1_720p_5s.webm` (AV1 video + Opus audio, WebM/Matroska) | **primaryMetric:** wall | **passCount:** 1 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` (env.engineId `mediabunny`).
- **Contested?** No — **uncontested**. Exactly one engine reached `status=="PASS"`; the other six are all `NA_ENGINE` (declared themselves incapable of this op/container/feature and never executed an oracle).
- **Decisive factor:** mediabunny is the only engine that *declares and implements* the `remux` operation for the `remux:av1-opus-in-webm` feature (AV1 + Opus, WebM→WebM). It satisfied the gating `reference-reimport` oracle: the reference re-import of its output yielded **401 packets / 254 keyframes / 2 media tracks**, matching the golden's 2 media tracks with a duration delta of only **0.007 s** against a **0.1 s** tolerance.
- **Margin over runner-up:** none to measure — every other engine is NA, so there is no runner-up that produced bytes or ran an oracle. Margin is "1 PASS vs 0 candidates."

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 18.165 ms | 275.695 x-realtime | 0 (n=0, not sampled) | 1901 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:av1-opus-in-webm' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:av1-opus-in-webm' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Notes on the winner's bench: `wall` n=1, warmup=1, mad=0 (single timed sample — weak statistical evidence for the perf number, but perf is irrelevant here since the win is uncontested on correctness/capability). `throughputRealtime` 275.7x means ~5.008 s of media re-wrapped in ~18 ms of wall. `peakMemory`/`sourceReads`/`targetWrites` have n=0 (not sampled in this run). `longtasks`=1901 ms reflects the whole instrumented browser session, not the 18 ms remux itself.

## Why the winner wins (deep technical)

This cell is a **lossless container re-wrap**: AV1 coded video and Opus coded audio are already legal Matroska/WebM payloads (`av1C` private data in a Matroska `CodecPrivate`/`SimpleBlock` stream + Opus in `A_OPUS`), so the correct operation is to **demux the encoded packets and re-mux them into a fresh WebM without touching the bitstream** — no decode, no re-encode. The scenario declares `videoCodecsIn: ['av1']` (input-side codec requirement) and `features: ['remux:av1-opus-in-webm']` (matrix.ts:101-109), and `_shared.ts` builds it as `op:'remux'` with `options.container='webm'` and the single default oracle `reference-reimport` (_shared.ts:78-103).

Mechanistically, mediabunny's `remux()` (src/engines/mediabunny/adapter.ts:1244-1260) does exactly this: it builds a real WebM `OutputFormat` via `makeOutputFormat('webm', …)` (adapter.ts:1250), opens the source through `openInput` (adapter.ts:1252), constructs a real `mb.Output({ format, target: BufferTarget })` (adapter.ts:1255), and drives the muxer through `runConversion` (adapter.ts:1256). `runConversion` (adapter.ts:842-868) calls `mb.Conversion.init(opts)`, asserts `conversion.isValid` (throwing with the discarded-track reasons if the WebM writer cannot accept the tracks — adapter.ts:849-854), then `conversion.execute()` and returns the real `BufferTarget.buffer` bytes (adapter.ts:856-866). For a same-codec same-container pair the Conversion auto-selects packet copy (no transcode), which is why throughput is ~276x realtime — far above any decode/encode path. mediabunny's capability set explicitly declares `remux: true` with `webm` in both `containersIn` and `containersOut` and `av1` among `videoCodecs` (adapter.ts:1025, 1036-1040), so the runner admits it rather than gating it NA.

The gating oracle `reference-reimport` (src/core/oracles.ts:1276-1376) is the correct structural-integrity gate for a remux op: the runner only exposes `ctx.output` (the muxed bytes) and does not pre-probe it, so metadata/packet goldens cannot be used directly (documented in _shared.ts:9-34). The oracle re-imports `ctx.output` with the reference engine and checks (a) media-track count and per-type layout vs golden (oracles.ts:1289-1299), (b) duration drift vs golden within a remux-aware tolerance floored at 0.1 s (oracles.ts:1311-1324), and (c) that a video remux did not lose all keyframes (oracles.ts:1361-1365). The shard's measurements are all physically consistent with the real fixture: `reimportMediaTracks=2` == `goldenMediaTracks=2`; `reimportPackets=401` which is **exactly** the entry count of `fixtures/golden/av1_720p_5s.webm.packets.json` (401 entries, trackIndex 0 = AV1 video with large 26 KB–108 KB sizes, trackIndex 1 = Opus audio, every Opus packet a keyframe); `reimportKeyframes=254` ≈ all ~250 Opus 20 ms frames over 5.008 s plus the AV1 keyframes; `durationDeltaSec=0.006999…` vs `durationToleranceSec=0.1` — i.e. the re-wrapped duration matches the 5.008 s golden to within 7 ms, well inside tolerance. None of these are placeholders; they are derived from the actual 1.9 MB AV1/Opus asset.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — `NA_ENGINE`: "engine does not declare feature 'remux:av1-opus-in-webm'." Honest NA at the feature granularity (it may remux other pairs but not declare this AV1+Opus-in-WebM cell). It never ran, so no oracle/bytes exist.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'remux'." Honest — web-demuxer is a demux-only library (no muxer), so it correctly cannot write a WebM output.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare feature 'remux:av1-opus-in-webm'." Honest at feature granularity; the AV1+Opus-in-WebM write path is not declared.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare input container 'webm'." Honest and structurally correct — mp4box.js is an ISOBMFF (MP4/MOV) library; it cannot parse a Matroska/WebM input at all.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'remux'." Honest — it is a parser (read side), not a muxer.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'remux'." Honest — the bare WebCodecs/browser platform exposes decoders/encoders but no container muxer, so there is no platform-native remux.

All six NAs look genuine, not under-declared: in five cases the limitation is architectural (demux-only / parse-only / MP4-only / no-muxer), and the two feature-level NAs (ffmpeg.wasm, remotion-webcodecs) are at the specific AV1+Opus-in-WebM granularity rather than a blanket "no remux," which is consistent with conservative capability declaration.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/matrix.ts:101-109` (the AV1/Opus WebM→WebM identity re-mux case); id assembled by `remuxId` in `src/scenarios/remux/_shared.ts:73-75` → `remux/av1_720p_5s_webm_to_webm`. Notes (matrix.ts:108): "AV1/Opus WebM->WebM identity re-mux: AV1 video through the WebM writer (av1C in Matroska)."
- **Fixture asset exists & is real:** `fixtures/media/av1_720p_5s.webm` — present, **1.9 MB**, last modified 5 days ago. Real AV1+Opus content (golden meta: 1280x720, 30 fps, AV1 video + 48 kHz stereo Opus, 5.008 s). Not synthetic/empty/mock.
- **Goldens exist:** `fixtures/golden/av1_720p_5s.webm.packets.json` (401 real packet records with sizes/PTS/keyframe flags), `.meta.json`, `.frames.json`, `.ssim.json`.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1244-1260` (`remux`) → `runConversion` at `:842-868`. Genuine implementation: real `mb.Output` + WebM `OutputFormat` + `BufferTarget`, real `Conversion.init/execute`, real buffer returned. No canned output, no input→output byte copy to fake a remux, no short-circuit to the golden file, no error-swallowing (invalid conversions *throw* with discarded-track reasons at adapter.ts:849-854).
- **Oracle:** `src/core/oracles.ts:1276-1376` (`reference-reimport`). Performs a real reference re-import of the produced bytes and diffs media-track count/layout, duration (tol floored at 0.1 s), and keyframe survival against the golden. Not trivially satisfiable: a copy-through or empty output would fail track-count/duration/keyframe checks. Measurements (401 packets, 254 keyframes, 2 tracks, Δ0.007 s) are physically plausible and match the golden packet table exactly.
- **Cached note:** the winner's result has **`cached==true`** (reason "cached previous PASS result", durationMs 1998). This is a **reused** PASS, not a fresh re-run, so there is mild staleness risk; per the project memory caveat on stale PASS reuse, a fully honest fresh number would require clearing the raw + `.browser-cache`. The PASS evidence itself (oracle measurements) is internally consistent and matches the on-disk golden, so the cached verdict is credible.
- **Verdict: REAL.** Real on-disk AV1/Opus WebM fixture + genuine mediabunny Conversion-based WebM muxer + a meaningful structural re-import oracle whose measurements match the golden. The one reservation (cached result) lowers freshness, not correctness.

## Confidence & caveats

- **Confidence: high** that mediabunny is the correct/only winner — it is the sole PASS, the sole engine declaring this op/feature, and its implementation + oracle are genuine.
- **Caveats:**
  1. Result is `cached==true` (reused, not re-run) — freshness risk only; correctness evidence is intact.
  2. The gate is the *structural* `reference-reimport`, not bit-exact pixels — by design (_shared.ts:19-26 keeps `decoded-frames-bitexact` off default remux rows while source frame goldens are browser-bake placeholders). For an identity WebM→WebM re-wrap this is a reasonable, but not maximally strict, gate; hence WEAK-GATE-adjacent strictness, though the verdict here is REAL because the oracle does real golden comparison with tight, plausible numbers.
  3. Perf bench is single-sample (wall n=1, mad=0; peakMemory/targetWrites n=0) — fine because the win is uncontested and decided on capability/correctness, not performance.
