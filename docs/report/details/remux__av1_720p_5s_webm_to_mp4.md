# remux/av1_720p_5s_webm_to_mp4

family: remux | fixture asset: `fixtures/media/av1_720p_5s.webm` (1.9 MB, real AV1+Opus WebM) | primaryMetric: wall | passCount: 1 of 7

## Verdict

**Best framework: mediabunny@1.48.0 — UNCONTESTED winner (only PASS).**

This is a lossless container change: pull AV1 video + Opus audio out of a Matroska/WebM
container and re-wrap the *same encoded samples* into ISOBMFF/MP4 (both codecs are legal in MP4).
Exactly one engine even attempted the operation; the other six are NA (capability-gated). The
decisive factor is therefore **capability coverage**: mediabunny is the only engine that declares
both the `remux` operation AND the `remux:av1-opus-in-mp4` feature AND `webm` as an input
container, and its `reference-reimport` oracle confirmed the output is a real, parseable MP4 with
both media tracks intact and duration drift of only **0.007 s** (tolerance 0.1 s). No runner-up
exists, so there is no performance margin to report.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 31.14 ms | 160.80x | 38,118,240 B (36.4 MB) | 1901 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:av1-opus-in-mp4' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:av1-opus-in-mp4' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

**The operation.** The source is `av1_720p_5s.webm`: an AV1 video track (1280x720, 30 fps,
~3.1 Mb/s) plus a stereo 48 kHz Opus audio track in a WebM/Matroska EBML container
(`fixtures/golden/av1_720p_5s.webm.meta.json`). The target is MP4 (ISOBMFF). Because AV1 and Opus
are both legal in MP4, this is a *lossless remux*: the encoded video OBUs and Opus packets are
copied byte-for-byte into new MP4 sample tables — no decode, no re-encode. The scenario `notes`
state this explicitly ("AV1 + Opus are both legal in mp4 — lossless remux out of webm",
`src/scenarios/remux/index.ts:104`).

**The backend mediabunny used.** From `env.configUsed`: `backend: "webcodecs"`,
`pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`,
`coopCoep: "not-required"`, `wasmThreads: 0`. Crucially, for a pure remux *no codec is touched* —
the `webcodecs`/`hwAccel: prefer-hardware` settings are inert here because the Conversion copies
encoded samples rather than decoding/encoding them. That means the win needs no GPU and no
cross-origin isolation, which is exactly why it is robust.

**The adapter code path.** `MediabunnyEngine.remux` at
`src/engines/mediabunny/adapter.ts:1244` builds an MP4 output format via
`makeOutputFormat('mp4', ...)` (`src/engines/mediabunny/codecs.ts:165` → `new Mp4OutputFormat`),
opens the WebM input, then calls `runConversion` (`adapter.ts:841`). `runConversion` does
`Conversion.init(opts)` with **no video/audio codec or transform options** — per the method's own
doc comment, "Conversion with no codec/transform options copies encoded samples"
(`adapter.ts:1243`). It guards `conversion.isValid` and surfaces `discardedTracks[].reason` as a
thrown error (`adapter.ts:849-853`), so a track that could not be carried into MP4 would FAIL loudly
rather than silently. The bytes come back from a real `BufferTarget` buffer (`adapter.ts:856-865`),
not a canned blob. This is a genuine library call, not a copy-input-to-output shortcut.

**The oracle and its measured numbers.** The gate is `reference-reimport`
(`src/core/oracles.ts:1225`), routed through `semanticRemuxReimport` (`oracles.ts:1273`) because
`ctx.scenario.op === 'remux'`. It feeds mediabunny's produced MP4 back into the *reference engine's*
demuxer and checks: (1) non-empty packet table — got **401 packets**; (2) media-track count and
layout vs golden — got **2 media tracks vs golden 2** (one AV1 video, one Opus audio), layout
match; (3) duration drift — **durationDeltaSec 0.007 s** against `durationToleranceSec 0.1 s`
(`oracles.ts:1318-1323`); (4) video keyframes present — **254 reimport keyframes** (a video remux
with no keyframes would FAIL at `oracles.ts:1363`). These numbers are physically consistent with the
fixture: 5.008 s at 30 fps ≈ 150 AV1 frames plus ~250 Opus packets ≈ ~401 total samples, and a
0.007 s tail is the normal block-rounding artifact of re-wrapping into MP4 sample durations. The
output round-trips through an independent demuxer, which is strong structural evidence the MP4 is
valid and preserves media identity.

**Performance context (single sample).** wall median 31.14 ms, throughputRealtime 160.80x
realtime (a 5 s clip remuxed in ~31 ms), peakMemory ~36.4 MB. Note `n=1` (single timed run,
warmup 1, mad 0) so these are point estimates, not distributions. `longtasks` 1901 ms reflects
total main-thread occupancy during the cached harness execution rather than the 31 ms remux itself.
`sourceReads`/`targetWrites` have `n=0` (not instrumented for this run).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — NA_ENGINE**: "engine does not declare feature 'remux:av1-opus-in-mp4'".
  Honest under-coverage rather than a false NA: the engine's registration does not advertise this
  AV1+Opus→MP4 remux feature, so the runner gated it out before execution. (ffmpeg could in
  principle `-c copy` AV1/Opus into MP4, so this is a conservative declaration, but it is not a cheat
  — it simply did not compete.)
- **remotion-webcodecs@4.0.479 — NA_ENGINE**: same feature gate, "does not declare feature
  'remux:av1-opus-in-mp4'". Honest NA; the WebCodecs-based remotion path did not register this
  specific lossless remux feature.
- **mp4box@2.3.0 — NA_ENGINE**: "engine does not declare input container 'webm'". Honest and
  structurally correct — mp4box.js is an ISOBMFF (MP4/MOV) parser and genuinely cannot read a
  Matroska/WebM EBML source, so it cannot be the demux side of a webm→mp4 remux.
- **platform@chrome-149 — NA_ENGINE**: "engine does not declare operation 'remux'". Honest: the
  browser platform adapter exposes decode/playback paths, not a container-rewrite operation.
- **remotion-media-parser@4.0.479 — NA_ENGINE**: "engine does not declare operation 'remux'".
  Honest: media-parser is a read/parse library, not a muxer, so it has no remux op to offer.
- **web-demuxer@4.0.0 — NA_ENGINE**: "engine does not declare operation 'remux'". Honest: it is a
  demux-only library (its name says so) and declares no muxing/remux capability.

All six NAs are capability-driven and look honest; none appears to be an under-declared capability
masking a hidden failure (mp4box's webm gate and the three demux/parse-only libraries are
fundamentally incapable of this op; ffmpeg.wasm is the only one that *could* arguably compete and
is the only candidate for future coverage expansion).

## Anti-cheat validation

- **Scenario**: `src/scenarios/remux/index.ts:97-105` (the `to: 'mp4'`, `videoCodecsIn: ['av1']`,
  `audioCodecs: ['opus']`, `features: ['remux:av1-opus-in-mp4']` cell). Oracle defaults from
  `src/scenarios/remux/_shared.ts:77-80` (`defaultOracles` → `['reference-reimport']`).
- **Fixture**: `fixtures/media/av1_720p_5s.webm` exists and is a real 1.9 MB WebM (not synthetic /
  empty / mock); golden metadata at `fixtures/golden/av1_720p_5s.webm.meta.json` confirms a 2-track
  AV1+Opus, 5.008 s source.
- **Winner adapter**: `src/engines/mediabunny/adapter.ts:1244` (`remux`) → `runConversion`
  (`adapter.ts:841`) → real `Conversion.init`/`execute` with no codec options (genuine
  sample-copy), output from a real `BufferTarget`. No hardcoded bytes, no input→output copy
  short-circuit, no golden short-circuit; errors are thrown, not swallowed (`adapter.ts:849-853`).
- **Oracle**: `src/core/oracles.ts:1225` → `semanticRemuxReimport` `oracles.ts:1273`. It performs a
  REAL round-trip: re-demuxes the produced MP4 with an independent reference engine and compares
  track count/layout/duration/keyframes against the golden. It is not trivially satisfiable — an
  empty packet table fails (`oracles.ts:1244`), a missing track fails (`oracles.ts:1289`), a
  keyframe-less video output fails (`oracles.ts:1363`), and duration drift beyond 0.1 s fails
  (`oracles.ts:1321`). Measurements (401 packets, 254 keyframes, 2 tracks, Δ0.007 s) are physically
  plausible for this fixture.
- **Cached note**: mediabunny's result has `cached: true` ("cached previous PASS result"). The
  PASS is real and the cached measurements are internally consistent, but it was *reused, not
  re-run* in this batch — minor staleness risk if the adapter/oracle changed since caching.
- **Verdict: REAL** — real fixture + genuine library remux + meaningful structural oracle with
  plausible numbers. The only caveat is the cached reuse and the single timed sample (n=1).

## Confidence & caveats

Confidence **high** on the winner identity (only PASS; uncontested by construction) and on the
REAL validation (the adapter and oracle were read directly; the gate is structural, not smoke).
Caveats: (1) the win is by *capability default* — six engines never competed, so this says more
about coverage than about mediabunny out-muxing a rival on the same op; (2) performance metrics are
n=1 with mad=0, so wall/throughput/memory are point estimates; (3) `cached: true` means the result
was not freshly re-executed in this run; (4) `reference-reimport` is a structural/metadata gate, not
bit-exact — it confirms the MP4 is well-formed and preserves track identity and duration, but does
not prove every AV1 OBU / Opus packet survived byte-for-byte (a `golden-packets`/`decoded-frames-
bitexact` gate would be stronger). For a lossless remux, structural-exact is the appropriate and
honest gate, so this is REAL rather than WEAK-GATE.
