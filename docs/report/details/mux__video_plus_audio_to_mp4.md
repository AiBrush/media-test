# mux/video_plus_audio_to_mp4

- **family:** mux
- **fixture asset(s):** `h264_1080p_30s.mp4` (31 MB, real H.264 1080p30 + AAC) + `aac_adts.aac` (164 KB, real raw ADTS AAC) — multi-source assembly
- **target container:** mp4 (H.264 video track from asset A + AAC audio track from asset B)
- **primaryMetric:** none declared → defaults to `wall`
- **passCount:** 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — 2 engines PASS (mediabunny, ffmpeg-wasm).
- **Decisive factor:** PERFORMANCE. Both engines pass the *same single* oracle (`property-invariant:probe-duration`) and nothing stronger, so correctness strength is comparable. mediabunny wins on every perf axis: **2.73x faster wall** (148.04 ms vs 404.83 ms), **2.73x higher throughputRealtime** (202.64x vs 74.10x realtime), and **3.63x fewer longtask ms** (1012 ms vs 3675 ms main-thread blocking).
- **Margin over runner-up (ffmpeg-wasm):** wall 404.835/148.045 = **2.73x**; throughput 202.64/74.10 = **2.73x**; longtasks 3675/1012 = **3.63x**. Caveat: n=1 sample for both, mad=0 (no spread), so the magnitude is single-shot evidence — but the gap is large (≈2.7x) and consistent across independent metrics.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | property-invariant:pass | 148.04 ms | 202.64x | not sampled (n=0) | 1012 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 404.83 ms | 74.10x | not sampled (n=0) | 3675 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' (mux:false — MediaRecorder can't ingest opaque encoded chunks) |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

**The operation.** This is a *multi-source assembly mux*, not a transcode: the runner demuxes the H.264 video elementary stream from `h264_1080p_30s.mp4` and the AAC stream from the raw ADTS file `aac_adts.aac`, then hands both encoded-packet track sets to `engine.mux(tracks, {container:'mp4'})`. The coded samples are copied verbatim (length-prefixed AVCC NAL units for video, raw AAC access units for audio); only a fresh MP4 sample table (`stts`/`stsc`/`stsz`/`stco`, `ctts` for B-frame reorder, and `esds`/`avcC` codec-private boxes) is authored and the two tracks are interleaved into one `mdat`. The challenge is purely container authoring with cross-source A/V interleave.

**Backend used (from `env.configUsed`).** mediabunny ran `backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`, `wasmThreads: 0`. Note that for a pure *copy* mux no decode/encode actually fires — WebCodecs is only the configured backend; the mux path is pure-TS container writing with no codec work. ffmpeg-wasm, by contrast, must spin up its WebAssembly module, mount both inputs into MEMFS, and run a full `-c copy` muxer process inside the wasm VM single-threaded.

**Mechanistic reason for the gap.** mediabunny's `mux()` (`src/engines/mediabunny/adapter.ts:1508`) constructs an `Output` with a `BufferTarget` (line 1514), creates an `EncodedVideoPacketSource`/`EncodedAudioPacketSource` per track (lines 1528, 1539), and pre-sizes each with `maximumPacketCount: t.chunks.length` (lines 1529, 1540) so the muxer can author the sample-table boxes without a second pass. It then streams each pre-demuxed chunk into the source as `EncodedPacket` objects (lines 1562-1591), attaching the decoder config only on the first packet (lines 1571-1590) so the muxer emits `avcC`/`esds` codec-private boxes, and calls `output.finalize()` (line 1598). This is a single in-process JS pass directly over already-copied `Uint8Array` slices — no VM boundary, no filesystem emulation — which is why wall is 148 ms and main-thread blocking is only 1012 ms. The track candidates come from `prepareMuxTracks()` (line 1185), which demuxes every named input via `EncodedPacketSink` with `verifyKeyPackets: true` (line 1206), preserves per-packet PTS/duration (`mux:vfr-timestamps`, declared line 1076), and rebases each track to zero (line 1217) so the cross-source interleave starts coherently.

ffmpeg-wasm produces a *correct* output (Δ 0.0213 s ≤ 0.0417 s) but pays the wasm tax: module instantiation, MEMFS staging of a 31 MB + 164 KB input set, and a single-threaded `-c copy` mux inside the VM (`mux:true` declared at `src/engines/ffmpeg-wasm/adapter.ts:1463`, copy path documented line 33). That overhead shows up as 404.83 ms wall (2.73x mediabunny) and 3675 ms of longtasks (3.63x mediabunny) — the heavy main-thread blocking is the wasm execution that a pure-TS streaming muxer avoids.

**Oracle measurements (real numbers).** The gate is `property-invariant:probe-duration` (`src/core/oracles.ts:2709-2758`). mediabunny: `outDurationSec=30`, `goldenDurationSec=30`, `deltaSec=0`, tolerance `0.041666…s` (≈1 frame @ 24 fps) → exact duration match. ffmpeg-wasm: `outDurationSec=30.021333…`, `goldenDurationSec=30`, `deltaSec=0.02133…s`, same tolerance → passes with ≈0.02 s slack. mediabunny's perfect 0 s delta is a (very minor) correctness signal too: its authored MP4 carries a duration identical to the source golden, whereas ffmpeg's `-c copy` mux rounds the assembled duration by ~half an AAC frame. Both pass, so this is not the decisive factor — but it confirms mediabunny is at least as accurate, not faster-because-sloppier.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (same oracle), but LOST on performance: 2.73x slower wall (404.83 ms vs 148.04 ms), 2.73x lower realtime throughput (74.10x vs 202.64x), and 3.63x more main-thread blocking (3675 ms vs 1012 ms). Root cause is the wasm-VM + MEMFS overhead of an in-VM `-c copy` mux vs a pure-TS streaming muxer. Its duration delta (0.0213 s) is also slightly worse than mediabunny's exact 0.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'adts'". Honest NA — its capabilities declare `containersIn: ['mp4','mov']` (`src/engines/mp4box/adapter.ts:645`); it cannot demux the raw ADTS AAC second source, so this multi-source (mp4 + adts) case is correctly out of scope. (mp4box *does* declare `mux:true`, line 641 — the gate is the input-container limitation, not a missing mux op.)
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — `mux: false` at `src/engines/platform/adapter.ts:235` with the rationale "MediaRecorder can't ingest opaque encoded chunks". The browser's only writer is MediaRecorder, which encodes live tracks; it has no API to pack pre-encoded packets into an MP4.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — it declares only `demux: true` (`src/engines/remotion-media-parser/adapter.ts:192`); it is a parser, not a muxer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — it declares `demux:true` and `remux:true` (`src/engines/remotion-webcodecs/adapter.ts:240,243`) but not `mux`; its `convertMedia` does whole-file copy-tracks, not encoded-packet assembly from separate sources.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — declares only `demux: true` (`src/engines/web-demuxer/adapter.ts:626`); it is a demux-only library.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/mux/index.ts:94-101` (LEGACY_CASES entry `video_plus_audio_to_mp4`), built via `buildMux` in `src/scenarios/mux/_shared.ts:204`. Input is the real two-asset list `['h264_1080p_30s.mp4','aac_adts.aac']`, `containersIn: ['mp4','adts']`, target mp4. Notes confirm intent: "Multi-source mux: video track from one asset + audio track from another into one MP4."
- **Fixtures exist (real media):** `fixtures/media/h264_1080p_30s.mp4` = 31 MB; `fixtures/media/aac_adts.aac` = 164 KB. Golden `fixtures/golden/h264_1080p_30s.mp4.meta.json` confirms a genuine asset: 30 s, H.264 1920x1080@30 fps @8.2 Mbps + AAC 48 kHz stereo @128 kbps. Not synthetic/empty/mock.
- **Oracle:** `src/core/oracles.ts:2709-2758` (`propertyInvariant`, probe-duration branch). It re-probes the *authored output* with the reference engine and compares against the source golden duration with a ±1-frame tolerance (`durationToleranceSec` ≈ 0.0417 s, `src/core/oracles.ts:159`). This is a REAL comparison against a baked golden, not trivially satisfiable — a copy-failure or truncated mux would shift the duration past tolerance. Measurements are physically plausible (30 s out, 0/0.0213 s deltas).
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1508` (`mux`), backed by `prepareMuxTracks` at line 1185. Genuinely implemented: opens real mediabunny `Output`/`BufferTarget`/`Encoded{Video,Audio}PacketSource`, streams the demuxed packets, and finalizes a real MP4. No canned output, no input→output copy faking a transcode, no short-circuit to a golden file, no swallowed errors (codec-unsupported and format-unsupported both `throw`, lines 1510, 1527, 1538).
- **Verdict:** **WEAK-GATE.** The implementation, fixtures, and oracle are all real, so the PASS is genuine — but the *only* gate is `property-invariant:probe-duration`, a container-agnostic duration check that sits low on the correctness ladder (a structural/perceptual proxy, not bit-exact, packet-count, or sample-table verification). Per the scenario's own design (`_shared.ts:25-31` and `multi-source.ts:25-31`), packet-count gates (`reference-reimport`) are deliberately omitted for multi-source cases because the golden is keyed on a single source asset and would false-fail. So the muxed sample-table layout, track interleave, and codec-private boxes are NOT directly verified — only that the result probes to ~30 s. The PASS is real; the gate is loose for a mux conformance claim.
- **Cached note:** BOTH winning results have `cached: true` ("cached previous PASS result"). The numbers (wall, throughput, longtasks, oracle measurements) are reused from a prior run, not freshly executed this run — staleness risk per the launcher-seeding caveat. The relative ranking (mediabunny ≫ ffmpeg-wasm) is robust to staleness given the ~2.7x margin, but the absolute timings should be treated as last-known-good, not fresh.

## Confidence & caveats

- **Confidence: medium.** Winner selection is unambiguous (only 2 PASS, identical oracle, large consistent perf margin favoring mediabunny). Downgraded from high because: (1) both results are `cached`, not freshly re-run; (2) n=1 per metric with mad=0 (no variance evidence); (3) the gate is a duration proxy (WEAK-GATE), so neither engine's actual MP4 box layout / interleave correctness is verified here.
- **peakMemory is not sampled** (n=0 for both) — cannot use the memory tiebreaker.
- The 5 NA_ENGINE results are all honest capability gaps verified in adapter source, not under-declarations: platform/remotion-mp/remotion-webcodecs/web-demuxer genuinely lack a mux op, and mp4box genuinely cannot ingest the ADTS second source.
