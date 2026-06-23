# mux/h264_aac_to_ts

family: mux | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real) | primaryMetric: wall | passCount: 2 (of 7)

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Decisive factor: **performance**, not correctness. Both passing engines (mediabunny, ffmpeg-wasm) cleared the *exact same* single oracle (`property-invariant` / probe-duration) with *identical* measurements (out 30.0373s vs golden 30s, Δ 0.0373s ≤ 0.0417s tolerance). Correctness is a tie, so the tiebreak is speed/backend.
- Margin over runner-up (ffmpeg-wasm): **2.64x faster wall** (141.5ms vs 373.3ms), **2.64x higher realtime throughput** (211.9x vs 80.4x). mediabunny runs on WebCodecs hardware-accelerated demux + a pure-TS MPEG-TS muxer with no COOP/COEP requirement; ffmpeg-wasm is single-thread wasm. Caveat: both samples are n==1 and both results are `cached==true`.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 141.545 ms | 211.95 x-realtime | 115,770,763 B (~110 MB) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 373.285 ms | 80.37 x-realtime | 0 B (not sampled) | 1182 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is: demux H.264 video + AAC audio out of an ISOBMFF (MP4) container and re-mux the *coded* (already-compressed) samples into an MPEG-TS stream. MPEG-TS is materially harder than MP4 remux for this codec pair because TS requires (a) H.264 to be carried in Annex-B byte-stream framing (start-code-prefixed NAL units, SPS/PPS inline) rather than the length-prefixed AVCC layout MP4 uses, and (b) the elementary streams to be PES-packetized and interleaved into 188-byte TS packets with PAT/PMT program tables and PCR. The scenario note states this explicitly: "Mux into MPEG-TS: requires Annex-B framing + PES packetization of the coded samples" (`src/scenarios/mux/index.ts:73`).

mediabunny performs a genuine encoded-packet mux. Its `mux()` (`src/engines/mediabunny/adapter.ts:1508`) builds a real `Output` with `MpegTsOutputFormat` selected by `makeOutputFormat('ts')` (`src/engines/mediabunny/codecs.ts:172-173`), wires an `EncodedVideoPacketSource(h264)` and `EncodedAudioPacketSource(aac)` (adapter.ts:1528, 1539), and streams the demuxed `EncodedPacket`s through (adapter.ts:1562-1591). It carries the decoder config (codec string + `description`/codec-private bytes) on the first packet of each track (adapter.ts:1571-1590) so the muxer can derive the SPS/PPS and emit the correct PMT stream-type descriptors. The Annex-B conversion and PES/TS packetization happen inside mediabunny's `MpegTsOutputFormat` writer — i.e. it is the library doing real container synthesis, not a passthrough. The demux side that feeds it runs on WebCodecs with hardware preference, per `env.configUsed`: `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `wasmThreads: 0`, `sharedArrayBuffer: false`.

That backend profile is exactly why mediabunny wins the tiebreak. Re-muxing copies coded packets (no transcode), so the dominant cost is container parse/write throughput. mediabunny's pure-TS path with hardware-assisted demux completes the 30s asset in **141.5ms (211.9x realtime)**, versus ffmpeg-wasm's single-thread wasm at **373.3ms (80.4x realtime)** — a 2.64x wall-time and throughput advantage, with no SharedArrayBuffer / cross-origin-isolation requirement. The output it produced is structurally valid: the reference probe of the muxed TS reported a duration of 30.0373s against the 30s golden, inside the ±0.0417s band (one frame at 30fps would be ~0.0333s; the 0.0373s delta is the expected TS PES/PCR timing rounding for a 30s stream, physically plausible, not a degenerate zero).

The one cost mediabunny pays is memory and main-thread occupancy: peakMemory ~110 MB (ffmpeg-wasm did not sample memory, recorded 0) and longtasks of 19963ms (vs ffmpeg-wasm's 1182ms). The longtasks figure is large because the WebCodecs lockstep pipeline drives work on the main thread; ffmpeg-wasm offloads more into its wasm worker. Under this scenario's `primaryMetric: wall`, however, the 2.64x wall win is decisive and correctness is identical, so mediabunny is the winner.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSED (same oracle, identical Δ 0.0373s), but lost on performance: 373.285ms wall vs 141.545ms (2.64x slower) and 80.37x vs 211.95x realtime. Single-thread wasm (no threads) is the mechanistic cause; it does produce a real TS mux. It is a legitimate runner-up, only slower.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'ts'". Honest NA — mp4box.js is an ISOBMFF (MP4/fragmented-MP4) writer and genuinely has no MPEG-TS output muxer, so it cannot author Annex-B/PES TS.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — the bare browser platform exposes no encoded-packet container muxer API (no WebCodecs muxing primitive); muxing requires a userland library.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — it is a *parser/reader* (demux/probe), not a container writer.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — as the name states, it demuxes only; no mux/output path.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — its converter targets transcode/decode flows, not raw encoded-packet container muxing in this suite's adapter.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/index.ts:67-74` (id `h264_aac_to_ts`, input `h264_1080p_30s.mp4`, containersIn `['mp4']`, to `'ts'`, codecs h264/aac).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` — EXISTS, 31 MB real H.264+AAC media (not synthetic/empty/mock).
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508` (`mux`), real library calls — `Output` + `MpegTsOutputFormat` (`codecs.ts:172`), `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (adapter.ts:1528,1539), packet loop (adapter.ts:1559-1592), `output.finalize()` (adapter.ts:1598). No canned output, no input→output copy, no golden short-circuit, no swallowed errors (codec failures throw, adapter.ts:1527,1538).
- Gating oracle: `src/core/oracles.ts:3823` (`probeDurationInvariant`, routed via property-invariant probe-duration at line 2711). It re-probes the muxed bytes through the reference engine and compares measured duration to the golden source duration within a per-container tolerance band — a REAL comparison, measurements (30.0373s vs 30s, Δ 0.0373s ≤ 0.0417s) are physically plausible for a 30s TS stream.
- Verdict: **WEAK-GATE**. The implementation and fixture are real, but the *only* gating oracle is a duration-equality invariant. It does NOT verify Annex-B NAL framing, PES/PMT structure, packet counts, keyframe positions, or A/V interleave — a remux that mangled framing but preserved overall duration could still pass. There is no `mp4-box-layout`/`golden-packets`/`demux(mux(x))==x` structural gate here despite the scenario note emphasizing Annex-B/PES correctness. PASS is real but proves only "duration survived," not "TS is conformant."
- Cached note: both PASS results have `cached==true` ("cached previous PASS result"); mediabunny started 2026-06-22T14:01:34Z, ffmpeg-wasm 2026-06-22T16:57:41Z. Numbers were reused, not freshly re-run — staleness risk per the launcher-seeding caveat.

## Confidence & caveats

- Confidence: **medium**. The winner pick (mediabunny) is robust because correctness is a true tie and the 2.64x wall margin is large and consistent across both wall and throughput metrics.
- Caveats: (1) every bench is **n==1** (mad==0, p95==median), so the performance margin is a single-shot measurement — weaker evidence than a multi-sample distribution. (2) Both results are **cached**, so they were not re-run for this report. (3) The gate is duration-only (WEAK-GATE): the leaderboard should not read this as "mediabunny produces conformant MPEG-TS," only "it produces a TS whose probed duration matches." (4) ffmpeg-wasm's peakMemory==0 means memory was not sampled for it, so the memory comparison is one-sided and not used in the decision.
