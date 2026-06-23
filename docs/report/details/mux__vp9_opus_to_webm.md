# mux/vp9_opus_to_webm

family: mux | fixture asset: `vp9_1080p_10s.webm` (9.3 MB, exists in fixtures/media/) | primaryMetric: throughputRealtime | passCount: 2

Operation: demux VP9 (video) + Opus (audio) from a WebM source and re-mux the already-encoded
tracks back into a WebM (Matroska) container. The coded samples are copied, so the gate is a
container-agnostic structural invariant (`property-invariant:probe-duration`), not a packet-table
diff (reference-reimport is only attached for faithful ISO-BMFF sources, so it is absent here).

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED — two engines PASS (mediabunny, ffmpeg.wasm),
both satisfying the identical single oracle. Correctness is comparable (same oracle, same ladder
rung), so the decision falls to **performance**.

Decisive factor: main-thread responsiveness and wall time. mediabunny is **1.38x faster wall**
(187.85 ms vs 259.27 ms), **1.38x higher throughputRealtime** (53.28x vs 38.60x), and — most
dramatically — **22.8x lower longtasks** (874 ms vs 19,963 ms of blocking). It also has a tighter
secondary correctness margin on the gate (Δ 0.0070 s vs 0.0200 s). Margin over runner-up
(ffmpeg.wasm) is decisive on every measured axis. Caveat: both PASS results are `cached==true` and
`n==1` (single sample, mad==0), so the spread is unknown and the evidence is weaker than a
multi-sample run.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass | 187.85 ms | 53.28x | 0 (not sampled) | 874 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 259.27 ms | 38.60x | 0 (not sampled) | 19963 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

(peakMemory and targetWrites carry n==0 / empty samples for both PASS engines — not measured this run.)

## Why the winner wins (deep technical)

This is a packet-copy mux: VP9 keyframes/deltas and Opus packets are demuxed from the source WebM
and written, byte-for-byte, into a fresh Matroska/WebM container. No re-encode happens, so the work
is pure container plumbing — building the EBML SimpleBlock/BlockGroup structure, the Cluster
timecodes, and the CodecPrivate (VP9/Opus) headers. The gate (`property-invariant:probe-duration`,
src/core/oracles.ts:2714 branch) re-probes the authored output with the reference engine and checks
the materialized duration against the golden source. mediabunny's output measured
outDurationSec=10.001 s vs goldenDurationSec=10.008 s → Δ 0.0070 s, well inside the
durationToleranceSec=0.04167 s (±1 frame at the source rate). ffmpeg.wasm measured 10.028 s →
Δ 0.0200 s, also inside band but ~2.9x looser, indicating it slightly extended the muxed duration
(typical of cue/cluster rounding on the WebM writer).

The mechanistic difference is the backend, recorded in env.configUsed. mediabunny ran
backend="webcodecs", pipeline="streaming-lockstep", coreBuild="pure-ts-esm", wasmThreads=0,
coopCoep="not-required", sharedArrayBuffer=false. For a copy mux the WebCodecs decode path is not
even exercised — the value here is that mediabunny's muxer is native ES/TS that streams encoded
packets directly into a BufferTarget. Its mux() (src/engines/mediabunny/adapter.ts:1508) creates an
`EncodedVideoPacketSource(vp9)` and `EncodedAudioPacketSource(opus)` (adapter.ts:1528, 1539),
pre-sizes each track with `maximumPacketCount` (adapter.ts:1529, 1540), then in a tight loop wraps
each demuxed chunk into an `EncodedPacket(data, key|delta, ptsUs/1e6, durationUs/1e6, i)`
(adapter.ts:1562) and `await source.add(pkt, meta)` (adapter.ts:1591), attaching the
decoderConfig/CodecPrivate description on the first packet only (adapter.ts:1571-1590), finishing
with `output.finalize()` (adapter.ts:1598). That is incremental, low-overhead JS doing only EBML
serialization — hence 187.85 ms wall and just 874 ms of long-task time.

ffmpeg.wasm, by contrast, is a single-thread WebAssembly build (no SharedArrayBuffer/threads on this
config). Its mux path (src/engines/ffmpeg-wasm/adapter.ts:2899) routes coded packets through the
emscripten FS and the libavformat matroska muxer inside one wasm instance running on the main
thread. The copy itself is cheap, but the wasm module monopolizes the main thread: longtasks
19,963 ms — **22.8x** more blocking than mediabunny — which is the dominant cost for a browser UI and
the reason mediabunny wins the responsiveness axis even where the raw wall gap is "only" 1.38x.
throughputRealtime confirms it: 53.28x vs 38.60x realtime, a 1.38x lead. The primaryMetric
(throughputRealtime) and every secondary bench point the same direction, so there is no metric
trade-off to weigh.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed the same oracle but lost on performance: 1.38x slower wall
  (259.27 vs 187.85 ms), 1.38x lower throughputRealtime (38.60x vs 53.28x), and 22.8x more
  main-thread blocking (19,963 ms vs 874 ms of longtasks). Its single-thread wasm libavformat muxer
  monopolizes the main thread. Also a looser duration match (Δ 0.0200 s vs 0.0070 s). Honest loss,
  not a failure.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest: the bare
  Chrome platform engine exposes decode/probe primitives but no general track-muxer API for arbitrary
  encoded-packet → WebM authoring, so the capability is genuinely absent.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". Honest: mp4box.js
  is an ISO-BMFF (MP4) library and cannot parse the Matroska/WebM source to obtain the VP9/Opus
  tracks. Correctly under-declared rather than faked.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest:
  this engine targets WebCodecs transcode pipelines, not a standalone packet muxer.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest by name and
  scope: it is a demux-only library; muxing is out of capability.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest:
  a read-only parser, no container-writing capability.

All five NAs look genuine — no candidate appears to under-declare a mux/webm capability it actually has.

## Anti-cheat validation

- Scenario definition: src/scenarios/mux/index.ts:75-83 (`id: 'vp9_opus_to_webm'`, input
  `vp9_1080p_10s.webm`, containersIn ['webm'], to 'webm', videoCodecs ['vp9'], audioCodecs ['opus'],
  notes "Demux VP9+Opus, mux back into WebM"). Routed through buildMuxAll → defaultOracles
  (src/scenarios/mux/_shared.ts:187-194): reference-reimport is skipped for this non-ISO-BMFF source,
  leaving `property-invariant` (probe-duration) as the gate — matching the shard.
- Fixture: `fixtures/media/vp9_1080p_10s.webm` EXISTS, 9.3 MB — a real, non-trivial VP9+Opus WebM
  (not synthetic/empty/mock).
- Winner adapter: src/engines/mediabunny/adapter.ts:1508-1600. Genuine implementation —
  EncodedVideoPacketSource/EncodedAudioPacketSource, per-packet copy of real demuxed data with
  preserved PTS/duration/keyframe flags, decoderConfig on packet 0, real `output.finalize()`. No
  canned output, no input→output passthrough, no golden short-circuit, no swallowed errors (it throws
  on unsupported codec / empty buffer).
- Oracle: src/core/oracles.ts:2645 (propertyInvariant dispatcher) → probe-duration branch at
  src/core/oracles.ts:2714. Performs a REAL reference-engine re-probe of the authored output and
  compares to the golden duration with a ±1-frame band (0.04167 s). Not trivially satisfiable: it is
  a measured comparison, and ffmpeg.wasm's 0.0200 s delta shows the band is tight enough to discriminate.
  Measurements (10.001 s / 10.008 s for a 10 s fixture) are physically plausible.
- Caveat: both PASS results are `cached==true` (reused, not re-run this session) and `n==1`. The PASS
  is real but the timing evidence is single-sample.

Verdict: **WEAK-GATE**. The fixture is real, the winner's mux is genuinely implemented, and the
oracle is a real measured comparison — but the gate is a single duration-invariant proxy (±1 frame),
not a structural packet-table/box-layout or decoded-frame check. It confirms the muxed file is a
valid container of the right length, not that every VP9/Opus packet survived bit-exact. PASS is
honest but not the strongest possible correctness evidence for a copy mux.

## Confidence & caveats

Confidence: medium. The winner selection is unambiguous on every performance axis (1.38x wall,
1.38x throughput, 22.8x longtasks) and the implementation/fixture are verified real. Confidence is
held to medium because: (1) both PASS results are cached and n==1, so timing spread is unknown and
could shift the 1.38x wall margin (the 22.8x longtasks gap is large enough to survive noise); (2)
the single oracle is a duration proxy (WEAK-GATE), so neither engine is proven packet-faithful here;
(3) peakMemory/targetWrites were not sampled (n==0), so the memory tiebreaker is unavailable.
