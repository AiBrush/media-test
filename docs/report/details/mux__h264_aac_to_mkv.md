# mux/h264_aac_to_mkv

family: mux | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264 1080p30 + AAC-LC 48k stereo, 30s) | primaryMetric: wall (default for MUX_METRICS) | passCount: 2 of 7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Contested**: 2 engines PASS (mediabunny, ffmpeg.wasm). Both satisfy the *same single* oracle (`property-invariant` probe-duration), so correctness strength is a tie; the decision falls to **performance**.
- **Decisive factor: throughput / wall time.** mediabunny muxed in **96.36 ms** vs ffmpeg.wasm **1187.69 ms** — a **12.3x faster wall** and **12.3x higher realtime throughput** (311.3x-realtime vs 25.3x-realtime). mediabunny also produced far less main-thread stall: **406 ms longtasks** vs ffmpeg.wasm's **19 963 ms** (≈49x less blocking).
- Both results are `cached==true` (reused, not re-run this session) — staleness caveat applies to both, symmetrically.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 96.36 ms | 311.33 x-rt | 124,473,495 B (~118.7 MB) | 406 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 1187.69 ms | 25.26 x-rt | 0 (not sampled, n=0) | 19,963 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is a **pure mux**: the runner demuxes `h264_1080p_30s.mp4` to obtain already-encoded H.264 (AVCC, length-prefixed NALs) + AAC-LC EncodedTracks, then asks each engine to pack those coded samples — copied verbatim — into a **Matroska (.mkv)** container. No re-encode happens; the cost is the demux read + container authoring (EBML/Segment/Cluster/SimpleBlock lacing + CodecPrivate). This is exactly why a duration invariant, not a packet-count gate, is used: MP4 sample tables → MKV SimpleBlock lacing legitimately reframe the bitstream, so `_shared.ts` deliberately withholds `reference-reimport` for mkv (FAITHFUL_REIMPORT_TARGETS = {mp4, mov}) and keeps the container-agnostic probe-duration gate.

mediabunny ran on its `webcodecs` backend with `hwAccel:'prefer-hardware'`, `pipeline:'streaming-lockstep'`, `coreBuild:'pure-ts-esm'`, no SharedArrayBuffer and `coopCoep:'not-required'` (env.configUsed). For a *mux* the WebCodecs path is incidental (no decode/encode is needed), but the pure-TS ESM Matroska writer is the load-bearing part. The adapter's `mux()` (`src/engines/mediabunny/adapter.ts:1508-1600`) maps `mkv` → `MkvOutputFormat` (`src/engines/mediabunny/codecs.ts:131,168-169`), creates `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (adapter.ts:1528, 1539), sizes each track with `maximumPacketCount: t.chunks.length` (1529, 1540), then streams each coded packet through `source.add()` reconstructing `EncodedPacket(data, key|delta, ptsUs/1e6, durationUs/1e6, i)` (1562-1569). The first packet of each track carries the `decoderConfig` (codec string + width/height or sampleRate/channels + the demuxed `description`/codec-private bytes, 1571-1590) so the Matroska writer can emit correct CodecPrivate (avcC for H.264, AudioSpecificConfig for AAC) without re-parsing. Per-packet PTS/duration are preserved verbatim ('mux:vfr-timestamps' capability), which is why the authored duration lands at **30.021 s** vs golden **30.000 s**: Δ **0.0210 s ≤ 0.1250 s** (measurements: outDurationSec 30.021, goldenDurationSec 30, deltaSec 0.021, tol 0.125). The whole job is a single-pass in-browser native-TS write — no wasm boot, no virtual-FS round-trip — hence 96.36 ms wall / 311x-realtime and only 406 ms of longtasks.

ffmpeg.wasm passes the identical oracle (Δ **0.0420 s ≤ 0.1250 s**; outDurationSec 30.042) and is *correct*, but is an order of magnitude slower for structural reasons: it must boot the wasm module, write the 31 MB input into MEMFS, run the C muxer, and read the output back. Its 1187.69 ms wall (25.26x-realtime) and especially its **19 963 ms longtasks** (single-thread wasm blocking the main thread for ~20 s of CPU work over its run) reflect that overhead. Since the two are tied on the one correctness gate available, this performance gap is decisive in mediabunny's favor.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but LOST on perf: 1187.69 ms vs 96.36 ms (12.3x slower wall), 25.26 vs 311.33 x-realtime (12.3x lower), 19,963 ms vs 406 ms longtasks (≈49x more main-thread blocking). peakMemory not sampled (n=0) so no memory comparison; targetWrites n=0 for both. Correctness is equal (same probe-duration gate, Δ 0.042s).
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest — MP4Box.js is an ISO-BMFF (MP4/MOV) writer with no Matroska output path; under-declaration would be a stretch since it genuinely cannot emit EBML.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — web-demuxer is a read/demux-only library; it exposes no muxer.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — raw WebCodecs decodes/encodes frames but ships no container muxer; muxing requires a separate library.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest for an encoded-packet mux — its surface is conversion/transcode, not a standalone packet muxer.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — media-parser is a parser/reader, not a writer.

## Anti-cheat validation

- **Scenario**: `src/scenarios/mux/index.ts:57-65` (id `h264_aac_to_mkv`), built via `buildMux` in `src/scenarios/mux/_shared.ts` (defaultOracles + muxOptions). op=`mux`, target `mkv`, invariant `PROBE_DUR`, tolerance override `durationToleranceSec: 0.125`.
- **Fixture**: input `h264_1080p_30s.mp4` exists at `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264+AAC; golden `fixtures/golden/h264_1080p_30s.mp4.meta.json` reports durationSec 30, 1920x1080@30 H.264, AAC 48k stereo). Not synthetic/empty.
- **Oracle**: `src/core/oracles.ts:2709-2759` (property-invariant, probe-duration branch). It reference-probes the *authored output* with the reference engine and compares to golden source duration; it is a REAL probe of mediabunny's bytes, not a no-op. BUT it is a single, loose, container-agnostic proxy: it checks only duration within ±0.125 s and does NOT compare packets, keyframes, or decoded frames. `reference-reimport` is intentionally withheld for mkv (cross-container reframing, `_shared.ts` FAITHFUL_REIMPORT_TARGETS) and `decode(mux(x))` frame goldens are placeholders, so no bit/structural gate runs here.
- **Winner adapter**: `src/engines/mediabunny/adapter.ts:1508-1600` — genuine `MkvOutputFormat` + EncodedVideo/AudioPacketSource, verbatim coded-packet copy with preserved PTS/duration and real decoderConfig (no canned output, no input→output copy, no golden short-circuit, errors thrown not swallowed). Implementation is real.
- **Verdict: WEAK-GATE.** Real fixture + real mediabunny mux implementation, and the oracle does a real measurement — but the *only* gate that runs is a duration proxy (±0.125 s, deltaSec 0.021/0.042), which cannot catch a structurally broken-but-right-length mkv. The PASS is honest but weak; a packet/decode gate would strengthen it. No cheat evidence.
- **Cached note**: both PASS results have `cached==true` ("cached previous PASS result"). Numbers were reused, not re-measured this run — staleness risk for both wall/throughput figures; the 12.3x margin is large enough to survive normal run-to-run jitter but was not freshly confirmed.

## Confidence & caveats

- Confidence: **medium**. The winner pick is robust (only 2 PASS, identical correctness gate, a 12.3x perf margin that dwarfs any jitter). The reservation is that (a) both results are cached, and (b) the deciding axis is performance on **n=1, mad=0** samples — single-shot timings with no spread, so the absolute numbers are weak evidence even though the *ratio* is decisive.
- Correctness is gated by a duration-only proxy; this scenario does not prove byte/packet/frame fidelity of the mkv, only that mediabunny and ffmpeg.wasm both produce a ~30 s Matroska. Treat the mux as "plausibly correct," not "verified bit-faithful."
- peakMemory could not be compared (ffmpeg.wasm n=0); the win rests on wall/throughput/longtasks.
