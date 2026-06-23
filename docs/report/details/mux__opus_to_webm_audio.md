# mux/opus_to_webm_audio

family: mux | fixture asset: `fixtures/media/opus.ogg` (Opus in OGG, ~146 KB) | primaryMetric: wall (ms) | passCount: 2

This scenario authors an **audio-only WebM (Matroska) track** from an Opus elementary stream sourced from an OGG container (`input: 'opus.ogg'`, `containersIn: ['ogg']`, `to: 'webm'`, `audioCodecs: ['opus']`). The gating oracle is the `property-invariant` metamorphic check in its **probe-duration-across-containers** form: it probes the authored WebM and requires its duration to match the golden source duration within a tolerance band.

## Verdict

- **Best framework: mediabunny@1.48.0** (engineId `mediabunny`), backend `webcodecs` / `pure-ts-esm`, `coopCoep: not-required`.
- **CONTESTED**: 2 engines PASS (mediabunny, ffmpeg.wasm). Both satisfy the identical single oracle.
- **Decisive factor: PERFORMANCE.** Correctness is a tie (both pass the same `property-invariant` probe-duration gate, both well inside tolerance), so the wall/throughput margin decides.
- **Margin over runner-up (ffmpeg.wasm):** wall median **7.915 ms vs 10.970 ms = ~1.39x faster**; throughputRealtime **1264.3x vs 912.2x = ~1.39x higher**; longtasks **263 ms vs 330 ms = ~0.80x (lower/better)**. peakMemory uninstrumented for both (n=0). Caveat: both samples are n=1 (mad=0), so the margin is single-shot evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 7.915 ms | 1264.31x | 0 (n=0) | 263 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 10.970 ms | 912.22x | 0 (n=0) | 330 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |

## Why the winner wins (deep technical)

**Operation and data path.** The candidate has to take Opus packets out of an OGG container and re-emit them into a Matroska/WebM `SimpleBlock` track structure. Opus in WebM carries the same packetization as in OGG (per-frame Opus packets, 48 kHz clock, `CodecPrivate` = OpusHead), so this is a packet-copy mux: no audio re-encode is required, only container reframing plus authoring of the WebM Segment/Tracks/Cluster/CodecPrivate structure and a duration estimate.

**mediabunny's mechanism.** mediabunny's `mux()` (`src/engines/mediabunny/adapter.ts:1508`) builds a real `mb.Output` with a WebM `OutputFormat` (`makeOutputFormat`, line 1509) and a `BufferTarget`, then attaches an `EncodedAudioPacketSource` for the Opus track (line 1539: `canonicalToMediabunnyAudio` -> `EncodedAudioPacketSource`, `output.addAudioTrack`). It feeds each source packet as an `mb.EncodedPacket` with original PTS/duration (lines 1562-1569), and carries the decoder config (sampleRate/channels/`description`=CodecPrivate) on the first packet (lines 1582-1589) so the muxer can emit the Opus `CodecPrivate` (OpusHead) box. This is the native, in-process WebCodecs/pure-TS writer path: `env.configUsed` confirms `backend: webcodecs`, `coreBuild: pure-ts-esm`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required`. Because there is no WASM module to spin up, no MEMFS round trip, and no subprocess-style exec, the muxing is essentially a tight JS loop over a few hundred Opus packets. The shard shows that translating into **7.915 ms wall** and **1264.3x realtime** for a ~10 s clip.

**Oracle evidence (real numbers).** mediabunny's `property-invariant` outcome: `outDurationSec: 10.014`, `goldenDurationSec: 10.007`, `deltaSec: 0.0070`, `durationToleranceSec: 0.041666...` -> Δ 0.0070 s ≤ 0.0417 s. The authored WebM is a real audio container whose probed duration lands within ~7 ms of the 10.007 s golden, consistent with Opus packetization (one 20 ms frame ≈ 0.020 s granularity). This is the probe-duration branch of `propertyInvariant` at `src/core/oracles.ts:2709-2758`: it probes `ctx.output` via the reference engine and compares to the golden duration with a container-keyed tolerance band.

**Why it beat ffmpeg.wasm specifically.** ffmpeg.wasm produces a correct output too (its `mux()` at `src/engines/ffmpeg-wasm/adapter.ts:2899` materializes each track as an elementary stream into MEMFS and runs a genuine `-c copy` mux, lines 2916-2942), and its duration is actually *closer* to golden (Δ 0.001 s vs 0.007 s). But the gate is a proxy with a 0.0417 s band — both pass comfortably, so the 6 ms duration-accuracy difference is not a correctness discriminator. What separates them is execution model: ffmpeg.wasm pays the cost of writing an elementary stream into MEMFS, invoking the wasm ffmpeg program (`-i ... -map ... -c copy -avoid_negative_ts make_zero out.webm`), and reading the result back. That overhead shows as ~1.39x higher wall (10.970 ms) and ~67 ms more long-task time (330 ms vs 263 ms). mediabunny also wins the secondary tiebreakers: no COOP/COEP requirement and no single-thread-wasm penalty, against ffmpeg.wasm's wasm pipeline.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost on performance: ~1.39x slower wall (10.970 ms vs 7.915 ms), ~1.39x lower throughput (912.22x vs 1264.31x), and higher main-thread blocking (longtasks 330 ms vs 263 ms). Its closer duration (Δ 0.001 s) does not help because the gate is a loose proxy both clear easily. The cost is the MEMFS-write/wasm-exec/read-back path.
- **web-demuxer@4.0.0** — NA_ENGINE: `engine does not declare operation 'mux'`. Honest: web-demuxer is a demux/probe-only wrapper around an ffmpeg-wasm core; it exposes no muxing/output path, so the NA is genuine, not under-declared.
- **platform@chrome-149** — NA_ENGINE: `engine does not declare operation 'mux'`. Honest: the platform engine is WebCodecs decode/probe surface; the browser has no built-in WebM muxer API, so it cannot author a container without a userland writer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: `engine does not declare operation 'mux'`. Honest: this adapter targets convert/transcode flows, not standalone container muxing.
- **remotion-media-parser@4.0.479** — NA_ENGINE: `engine does not declare operation 'mux'`. Honest: media-parser is a read/parse-only library (no writer), so NA is correct.
- **mp4box@2.3.0** — NA_ENGINE: `engine does not declare input container 'ogg'`. Honest: mp4box.js is ISO-BMFF (MP4/MOV) only; it cannot ingest OGG, and it cannot author WebM/Matroska. NA is correct on the input-container axis.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/mux/write-targets.ts:131-141` (`id: 'opus_to_webm_audio'`, `input: 'opus.ogg'`, `to: 'webm'`, `audioCodecs: ['opus']`). Notes: "AUDIO WRITE matrix: Opus (from OGG) -> WebM audio-only ... probe-duration gates the authored audio-only WebM duration." Built into scenarios via `buildMuxAll(WRITE_TARGET_CASES)`.
- **Fixture:** `fixtures/media/opus.ogg` exists, ~146 KB, a real Opus-in-OGG file (not synthetic/empty/mock). Confirmed via stat.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1508` `mux()` — genuine: constructs `mb.Output` + WebM `OutputFormat` + `BufferTarget` + `EncodedAudioPacketSource`, streams real packets with original PTS/duration and first-packet decoder config (CodecPrivate). No canned output, no input->output copy, no short-circuit to golden, no error-swallowing (unsupported codecs throw at lines 1527/1538).
- **Oracle:** `src/core/oracles.ts:2645` `propertyInvariant`, probe-duration branch at `:2709-2758`. It actually probes `ctx.output` through the reference engine and compares to the golden duration. This is a **proxy/metadata gate** (duration only), not a bit-exact or PCM-digest comparison. Measurements are physically plausible: 10.014 s authored vs 10.007 s golden, Δ 0.0070 s ≤ 0.0417 s — consistent with a real ~10 s Opus stream at 20 ms frame granularity.
- **Cached note:** mediabunny's result has `cached: true` (`reason: "cached previous PASS result"`); ffmpeg.wasm is also `cached: true`. The PASS and bench numbers were reused, not freshly re-run, so there is mild staleness risk on the exact timings (both n=1, mad=0). The relative ordering is robust to that risk given the ~1.39x gap.
- **Verdict: WEAK-GATE.** Real fixture + real mediabunny implementation, but the single gating oracle is a duration proxy (no decoded-PCM digest, no golden-packet/byte comparison). The PASS is real but does not prove sample-accurate Opus packet copy or correct WebM `CodecPrivate` authoring — only that the authored container reports the right duration. Both winner and runner-up clear the same loose band.

## Confidence & caveats

- Confidence: **medium.** Two genuine implementations, plausible measurements, honest NAs across the other five — but the win rests on (a) a duration-only proxy oracle (WEAK-GATE) and (b) single-shot cached benches (n=1, mad=0), so the 1.39x margin is single-sample evidence rather than a distribution.
- A stronger gate (decoded-audio-pcm digest of the authored WebM, or golden-packet comparison of the Opus `SimpleBlock` payloads) would better discriminate true Opus-in-WebM correctness; here both engines could pass merely by emitting a correctly-timed container.
- peakMemory was not instrumented (n=0) for either engine, so the memory tiebreaker could not be applied.
