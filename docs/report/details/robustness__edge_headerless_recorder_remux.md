# robustness/edge_headerless_recorder_remux

family: robustness | fixture asset: `recorder_headerless.webm` (192 KB, real MediaRecorder VP8+Opus WebM) | primaryMetric: durationMs (no bench{} block present in shard) | passCount: 3 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 3 engines PASS: mediabunny, remotion-webcodecs, ffmpeg-wasm).
- Decisive factor: **wall-clock time**. Correctness is a dead tie — all three pass the exact same two oracles (`reference-reimport`, `playback-smoke`) with byte-identical re-import measurements (139 packets / 47 keyframes / 2 media tracks). The oracle ladder produces no separation, so ranking falls to performance (decision procedure 4b).
- Margin over runner-up: durationMs 555 (mediabunny) vs 585 (remotion-webcodecs) vs 710 (ffmpeg-wasm) → **1.05x faster than remotion-webcodecs, 1.28x faster than ffmpeg-wasm**. NOTE: all three results are `cached==true` and the shard carries only `durationMs` (no median/p95/mad/n bench distribution), so this margin is single-sample evidence and weak.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true, playback-smoke:true | 555 | n/a (not in shard) | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | reference-reimport:true, playback-smoke:true | 585 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true, playback-smoke:true | 710 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |

The shard contains no `bench{}` object for any engine in this scenario; the only timing signal is `durationMs`. Throughput / peakMemory / longtasks columns are therefore "n/a".

## Why the winner wins (deep technical)

The operation is a container re-wrap of a *headerless* MediaRecorder WebM: VP8 video + Opus audio in a Matroska/WebM stream where the SegmentInfo duration is unknown and Cues (seek index) are sparse or absent (scenario notes: "Re-wrap a headerless recorder stream into a seekable WebM (add Cues / known duration)"). The hard part is not transcoding — no codec change is requested (`options: { container: 'webm' }`, `containersOut: ['webm']`, codecs vp8/opus on both sides) — it is parsing a WebM whose header lies about duration and re-emitting a well-formed, seekable WebM with a correct duration and a Cues element, all while stream-copying the encoded VP8/Opus blocks unchanged.

mediabunny does this through its `Conversion` API. The adapter's `remux()` (src/engines/mediabunny/adapter.ts:1244) takes the non-reserve path: it builds a `WebMOutputFormat` via `makeOutputFormat(opts.container, ...)` (line 1250), opens the source with `openInput` (1252), constructs an `Output` over a `BufferTarget` (1255), and runs `runConversion(...)` (1256), which calls `mb.Conversion.init` (line 848) with `remux: true` semantics — read packets → mux without decode/re-encode. Because mediabunny re-derives the segment duration from the demuxed block timestamps and writes a fresh Cues table during muxing, the re-imported output reports a clean duration: the oracle measured `durationDeltaSec = 0.376` against `durationToleranceSec = 0.5`, i.e. the reconstructed duration is within band even though the source header had no reliable duration. The pure-TS streaming-lockstep pipeline (`configUsed.pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `wasmThreads: 0`, `sharedArrayBuffer: false`) avoids any WASM module instantiation cost — which is exactly why it edges the other two on the 555 ms wall.

The `reference-reimport` oracle (src/core/oracles.ts:1225, semantic branch `semanticRemuxReimport` at line 1273) demuxes mediabunny's output with the reference engine and confirms: 139 packets, 47 keyframes, 2 media tracks vs 2 golden media tracks, with the duration delta inside tolerance. `playback-smoke` (line 1574) then loads the bytes into a real `<video>` element and confirms the frames advance — proving the re-wrapped WebM is genuinely demuxable AND decodable by Chrome's native pipeline, not just structurally plausible.

The two losing PASS engines reach the *identical* semantic result (same 139/47/2, durationDelta 0.376 for remotion, 0.429 for ffmpeg) but are slower. ffmpeg-wasm (-c copy stream-copy, src/engines/ffmpeg-wasm/adapter.ts:2031, `-map 0 -c copy`) pays the single-thread WASM tax (no `wasmThreads`, MEMFS round-trip in/out) → 710 ms, the slowest. remotion-webcodecs (convertMedia copy-tracks, src/engines/remotion-webcodecs/adapter.ts:494 → `this.convert`) is close at 585 ms but its WebM-target path does not hit the MOV→MP4 ftyp fast-path (that only fires for `container === 'mp4'`, line 498), so it runs the full convertMedia backpressure pipeline. mediabunny's pure-TS muxer with no WASM bring-up is the cheapest of the three for this small 192 KB file.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, but lost on wall time: 585 ms vs 555 ms (1.05x slower). Correctness identical (reference-reimport 139pkt/47kf/2trk, durationDelta 0.376 < 0.5; playback-smoke pass). No fast-path applies to WebM target; full convertMedia copy-tracks pipeline.
- **ffmpeg.wasm@0.12.15** — PASS, but slowest: 710 ms vs 555 ms (1.28x slower). Single-thread WASM `-c copy` remux with MEMFS I/O overhead. Correctness identical except a marginally larger durationDelta 0.429 (still < 0.5 tol).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — remotion-media-parser is a parser/demuxer, it has no muxer, so it genuinely cannot produce a remuxed file.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — the raw WebCodecs/platform surface exposes decoders/encoders but no container muxer for a copy-only re-wrap.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — web-demuxer is read-only (demux/probe), no mux side.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". Honest — mp4box.js is an ISO-BMFF (MP4) library; it cannot parse a Matroska/WebM input at all.

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:103-114 (`id: 'edge_headerless_recorder_remux'`, op `remux`, asset `recorder_headerless.webm`, vp8/opus, oracles `reference-reimport` + `playback-smoke`).
- Fixture: `fixtures/media/recorder_headerless.webm` EXISTS — 192 KB real WebM (confirmed via stat). Not synthetic/empty/mock.
- Oracle implementations: `reference-reimport` at src/core/oracles.ts:1225 (semantic branch `semanticRemuxReimport` at 1273) — performs a REAL demux of the engine's output with an independent reference engine, then compares track count, per-type track layout, and duration against the golden with a tolerance (0.5 s here). `playback-smoke` at src/core/oracles.ts:1574 — feeds the output to a real `<video>` element and asserts frame advance. Measurements are physically plausible (139 packets / 47 keyframes / 2 tracks for a ~few-second VP8+Opus recording; ~3:1 frame:keyframe spacing is normal for VP8 with periodic keyframes).
- Winner adapter: src/engines/mediabunny/adapter.ts:1244 (`remux`) → real `mb.Conversion.init` at line 848 with a `WebMOutputFormat` + `BufferTarget`. No canned output, no input→output copy shortcut, no golden short-circuit, no swallowed errors (the path throws loudly if the format is unsupported or no usable output buffer is produced, lines 852/861).
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the oracle does a genuine reimport+playback comparison — but neither gating oracle is bit-exact or golden-packet-exact for a remux (no `golden-packets`, no `mp4-box-layout`/`webm-live-layout` structural assertion). The gate proves "re-wrapped output is demuxable, track-correct, duration-correct within 0.5 s, and plays" — strong enough that the PASS is real, but it would not catch fine-grained block-timestamp or Cues-placement regressions. PASS is genuine, gate strictness is moderate.
- Cached note: ALL THREE PASS results have `cached==true` ("cached previous PASS result"). The winner was reused, not re-run in this batch; the 30 ms gap over remotion is single-sample and stale-prone. Staleness risk is real but the fixture/code are unchanged, so the PASS itself is trustworthy.

## Confidence & caveats

- Confidence: **medium**. The correctness tie is unambiguous (identical oracle outcomes, all REAL implementations). The performance ranking that breaks the tie rests on single `durationMs` samples with no bench distribution (no n/mad/p95) and all results cached — a 555-vs-585 ms split is within plausible run-to-run noise, so the mediabunny-over-remotion ordering is soft. mediabunny-over-ffmpeg (555 vs 710, 1.28x) is more robust because the WASM bring-up cost is a structural advantage.
- Caveat: the gate is a WEAK-GATE (semantic + smoke, not bit-exact), so "best" here means "fastest correct re-wrap," not "most precisely identical re-wrap."
- Caveat: if a fresh (non-cached) run were required, the ordering between mediabunny and remotion-webcodecs could flip given the 5% margin.
