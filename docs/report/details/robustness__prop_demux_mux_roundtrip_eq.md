# robustness/prop_demux_mux_roundtrip_eq

family: robustness | fixture asset: `h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4) | primaryMetric: wall (median ms) | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **YES** — two engines PASS with byte-for-byte equal correctness (mediabunny and mp4box@2.3.0).
- Decisive factor: **performance (wall median)**. Correctness is a tie (both pass the single gating `property-invariant` oracle with identical measurements: measuredCount 2308 == goldenCount 2308, comparedTracks 2, maxPtsDriftUs 1). mediabunny wins purely on speed.
- Margin over runner-up: mediabunny wall **199 ms** vs mp4box **348 ms** = **1.75x faster wall** (Δ 149 ms). Note: both results are `cached==true` and report a single per-run `durationMs` (no `bench{}` distribution, effectively n==1), so the speed margin is weak-confidence evidence (see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 199 ms (durationMs) | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | property-invariant:true | 348 ms (durationMs) | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'mux:roundtrip-compare' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

(No `bench{}` block was emitted for either PASS engine in this shard; the only timing signal is the top-level `durationMs`. throughputRealtime / peakMemory / longtasks were not recorded.)

## Why the winner wins (deep technical)

The operation under test is the metamorphic invariant `demux(mux(x)) == x` for H.264-in-MP4 + AAC. The harness demuxes the source coded tracks, hands the encoded packet tables to the candidate engine's `mux()` to author a fresh MP4, then re-demuxes that output with a reference engine and compares the re-demuxed packet table (count, sizes, keyframe layout, PTS) against the golden source packets. The gating oracle is `property-invariant` dispatched to `demuxMuxRoundtripInvariant` (src/core/oracles.ts:3413), which calls `goldenPackets(...)` (src/core/oracles.ts:3430) on the re-demuxed output. Both passing engines reproduced the source exactly: **2308 packets** across **2 tracks** (video + audio) with **maxPtsDriftUs == 1** (one-microsecond rounding, i.e. effectively bit-stable timing). This is a structural/metadata-exact gate — strong, not a perceptual proxy and not smoke-only.

Because correctness is identical between the two PASS engines, the win is decided on the performance ladder (primaryMetric `wall`). mediabunny finalizes the round-trip in 199 ms vs mp4box's 348 ms — **1.75x faster**.

Mechanistically the speed gap comes from the muxer architecture, visible in each adapter and confirmed by `env.configUsed`:

- mediabunny ran with `backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`. Its `mux()` (src/engines/mediabunny/adapter.ts:1508) builds a real `mb.Output` with an `Mp4OutputFormat`, attaches an `EncodedVideoPacketSource`/`EncodedAudioPacketSource` per track (adapter.ts:1528, :1539), and streams the source's encoded `EncodedPacket`s straight through with `output.start()` → per-packet `source.add()` → `output.finalize()` (adapter.ts:1553-1598). The first packet of each track carries the `decoderConfig` (codec string + `description` = avcC/esds) so the muxer can emit the codec-private boxes (adapter.ts:1571-1590), and `maximumPacketCount` is pre-declared so the sample tables are sized up front. This is a single streaming pass that never re-parses a whole file into a DOM-like box tree.
- mp4box ran `backend: "pure-js"`, `worker: false`, `pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"`. Its mux path is a pure-JS ISOBMFF box builder/appender that buffers and re-walks the whole file; the `whole-file-append` strategy plus single-threaded JS box accounting is the higher-constant path, which is why it lands ~149 ms slower for the same 2308 packets.

So the winner surpasses the field by (a) being one of only two engines that declare AND correctly implement `mux:roundtrip-compare` for MP4, and (b) doing it through a streaming WebCodecs-aligned muxer rather than a whole-file pure-JS box append, yielding a 1.75x wall advantage at identical correctness.

## What each other framework did wrong

- **mp4box@2.3.0** — PASSed with identical correctness (property-invariant true, 2308/2308 packets, maxPtsDriftUs 1) but lost on speed: 348 ms vs 199 ms wall = 1.75x slower, due to its `whole-file-append(MP4BoxBuffer+fileStart)` pure-JS single-thread mux pipeline (`backend: "pure-js"`, `worker: false`). A legitimate close runner-up, not a defect.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — web-demuxer is a demux-only WASM wrapper around FFmpeg's demuxers; it has no muxing path, so it cannot satisfy `demux(mux(x))`.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — the bare WebCodecs/browser platform exposes decoders/encoders but no MP4 muxer primitive; muxing requires a userland library.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — `@remotion/media-parser` is a read/parse-side library; writing/muxing is out of scope.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'mux:roundtrip-compare'". ffmpeg.wasm can mux in general, so this is a feature-level under-declaration for THIS specific round-trip-compare gate rather than a hard capability gap. The declaration is conservative (the adapter only opts in once the round-trip path is proven), so it reads as honest-conservative, not a hidden capability being concealed — but it is the one NA that could plausibly be lifted with more validation.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — the remotion-webcodecs converter declares transcode/convert operations, not a standalone packet-level `mux` primitive that the harness can feed coded tracks into.

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:1030 (`id: 'prop_demux_mux_roundtrip_eq'`, op `mux`, input `h264_1080p_30s.mp4`, containersIn/Out mp4, videoCodecs h264, audioCodecs aac, features `mux:roundtrip-compare`, options `{ container: 'mp4', invariant: 'demux(mux(x))==x' }`). Notes (index.ts:1039-1043) confirm the oracle "now performs the re-demux comparison" and that engines must declare the feature only after that path passes.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists — **31 MB**, a real 1080p/30s H.264+AAC MP4 (verified via stat). Not synthetic/empty/mock.
- Oracle: `property-invariant` → `demuxMuxRoundtripInvariant` (src/core/oracles.ts:3413). It guards on real `ctx.output`, a real `ctx.referenceEngine`, and non-empty `ctx.golden.packets`, re-demuxes the candidate's mux output (oracles.ts:3425) and compares the re-demuxed table to golden source packets via `goldenPackets` (oracles.ts:3430). This is a real packet-table comparison (count/sizes/keyframe layout with a 1 µs PTS tolerance), NOT a loose/smoke gate and NOT trivially satisfiable. Measurements (2308 packets per side, 2 tracks, 1 µs max drift) are physically plausible for a 30 s 1080p30 clip.
- Winner adapter: src/engines/mediabunny/adapter.ts:1508 (`mux`) — genuine call into the real mediabunny `Output`/`Mp4OutputFormat`/`EncodedVideoPacketSource`/`EncodedAudioPacketSource` API with `start()`/`add()`/`finalize()` (adapter.ts:1514, :1528, :1553-1598). No canned output, no input→output copy, no golden short-circuit, no swallowed errors (unsupported codecs throw). Feature declaration at adapter.ts:1078.
- Cached note: the winner result has **`cached==true`** ("cached previous PASS result"), as does mp4box. Both PASS verdicts are reused from a prior run, not re-executed in this shard. The correctness evidence (oracle measurements) is preserved and consistent; the staleness risk is on the timing numbers and on whether the adapters changed since the cached run.
- Verdict: **REAL** — real 31 MB fixture, real streaming mux implementation calling the actual library, and a meaningful structural packet-table oracle with plausible measurements. The only weakening factor is cached-only evidence (timing especially).

## Confidence & caveats

- Confidence: **medium**. Correctness verdict (REAL, both engines genuinely satisfy the invariant) is high-confidence from code + oracle inspection. The winner *selection* is lower-confidence because it rests entirely on a single cached `durationMs` per engine (no `bench{}` distribution, no n/mad/p95 spread, effectively n==1) and both results are `cached==true`.
- The 1.75x wall margin (199 vs 348 ms) is real-looking but should be re-measured on a fresh, uncached run before being treated as authoritative; per the launcher-seeding caveat, clear raw + `.browser-cache` for an honest re-run.
- Only 2 of 7 engines are eligible; the other 5 are NA. Four NAs are clearly honest (no mux primitive). The ffmpeg.wasm NA is feature-level conservative and is the single candidate that could move to PASS if `mux:roundtrip-compare` validation is extended to it.
- No peakMemory/longtasks/throughputRealtime were captured, so the performance tiebreak could not cross-check the wall result against a memory or main-thread-blocking signal.
