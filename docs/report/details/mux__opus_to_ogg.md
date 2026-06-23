# mux/opus_to_ogg

family: mux · fixture asset: `fixtures/media/opus.ogg` (146 KB, real Opus-in-OGG) · primaryMetric: wall · passCount: 2

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **CONTESTED**: 2 engines PASS (mediabunny, ffmpeg.wasm@0.12.15); the other 5 are NA_ENGINE.
- **Decisive factor**: correctness tiebreak THEN performance. Both engines pass the *same single* oracle (`property-invariant` / probe-duration across containers), so correctness *strength* is the first discriminator: mediabunny's authored OGG reproduces the source duration more tightly — Δ 0.0065s vs ffmpeg's Δ 0.0130s against the same 0.0417s band (mediabunny is **2.0x closer** to golden). Performance then confirms it: mediabunny wall median 10.395 ms vs ffmpeg 11.560 ms (**1.11x faster**), and crucially longtasks 315 ms vs 4223 ms (**13.4x less main-thread blocking**), throughputRealtime 962.7x vs 865.7x (**1.11x higher**).
- **Margin over runner-up (ffmpeg.wasm)**: 2.0x tighter duration delta; 1.11x faster wall; 1.11x higher realtime throughput; 13.4x fewer longtask-ms. Both on n==1 (single sample, mad=0), so the perf margin is weak evidence on its own — but the longtasks gap is an order-of-magnitude architectural difference (see below) and the correctness gap is independent of sampling.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true (Δ0.0065s≤0.0417s) | 10.395 | 962.67 | 31,964,810 | 315 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (Δ0.0130s≤0.0417s) | 11.560 | 865.66 | 0 (not sampled, n=0) | 4223 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

**The operation.** This scenario demuxes an Opus elementary stream out of a source OGG container and re-muxes it back into a *fresh* OGG container — re-authoring OGG pages, segment tables, and granulepos. Opus in OGG is special: the container must carry an `OpusHead` identification header (channel count, pre-skip, input sample rate, output gain) and an `OpusTags` comment header as the first two logical-stream packets, and every audio page's granulepos must track decoded-sample position at 48 kHz. A correct muxer must regenerate these from the encoded packets; it cannot just byte-copy pages. The gate is duration-invariance: probe the authored output and compare its duration to the golden source duration (10.007 s) within the container's tolerance band (0.0417 s here).

**mediabunny's path.** mediabunny ran on its native streaming WebCodecs/pure-TS pipeline (`env.configUsed`: `backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`). Although the backend reports `webcodecs`, this audio re-mux is a *packet-copy* — no Opus decode/re-encode is needed — driven by `mediabunny/adapter.ts:1508` `mux()`. It builds an `OggOutputFormat` via `makeOutputFormat('ogg')` (`adapter.ts:1509`), constructs an `mb.Output` with a `BufferTarget` (`adapter.ts:1514`), and for the single Opus audio track creates an `EncodedAudioPacketSource` (`adapter.ts:1539`) added with `maximumPacketCount` hinting (`adapter.ts:1540`). It then streams the encoded packets through `output.start()` → per-packet `mb.EncodedPacket(c.data, key/delta, ptsUs/1e6, durationUs/1e6, i)` (`adapter.ts:1562`), attaching the WebCodecs `decoderConfig` (codec param, sampleRate 48000, channels, `description`) **only on the first packet** (`adapter.ts:1582-1589`) so the muxer emits the correct `OpusHead`/codec-private boxes, finishing with `output.finalize()` (`adapter.ts:1598`). Because mediabunny computes granulepos from the per-packet timestamps/durations it carries through, the re-authored OGG's probed duration lands at 10.0135 s — Δ **0.0065 s** from golden (oracle `measurements`: `outDurationSec:10.0135, goldenDurationSec:10.007, deltaSec:0.0065, durationToleranceSec:0.0417`). Running pure-TS with zero wasm threads on the JS event loop is also why its longtask footprint is just **315 ms**.

**Why ffmpeg loses despite also passing.** ffmpeg.wasm muxes via the dossier `-c copy` file path (`ffmpeg-wasm/adapter.ts:33` capability note; `.ogg` recognized as the `ogg` muxer at `adapter.ts:803`). Stream-copying the Opus packets into libavformat's ogg muxer also satisfies the duration gate, but its probed output duration is 10.02 s — Δ **0.0130 s** (oracle `measurements`: `outDurationSec:10.02, goldenDurationSec:10.007, deltaSec:0.0130, durationToleranceSec:0.0417`), i.e. 2.0x further from golden than mediabunny, reflecting ffmpeg's page-flush/granule rounding when it re-pages the elementary stream. The far bigger gap is the runtime: ffmpeg.wasm is a single-thread wasm core that must boot the emscripten module, mount MEMFS, and run the libav muxer, producing **4223 ms** of longtasks — 13.4x more main-thread blocking than mediabunny's 315 ms — and a slightly higher wall (11.56 ms vs 10.395 ms) and lower realtime throughput (865.7x vs 962.7x). ffmpeg also did not sample peakMemory (n=0), so it cannot even contest the memory dimension. On the strictest available discriminator (duration fidelity) plus every measured perf axis, mediabunny is ahead.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed but lost. Looser duration fidelity (Δ 0.0130 s vs 0.0065 s, 2.0x worse), slower wall (11.56 vs 10.395 ms, 0.90x), lower throughput (865.7x vs 962.7x), and 13.4x more longtask-ms (4223 vs 315) from single-thread wasm boot + libav muxing. peakMemory not sampled (n=0).
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest. mp4box is an ISO-BMFF (MP4/MOV) parser/muxer; it cannot read an OGG/Ogg-Opus input at all, so it correctly declines the op.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest. The platform adapter is WebCodecs encode/decode primitives only; the browser exposes no muxing API (no OGG muxer), so mux is legitimately absent.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest. This is a transcode/convert engine over WebCodecs; it does not expose a standalone packet-mux write op (no `mux` in its adapter capabilities).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest. As the name says it is a *demuxer* (read-side); it has no write/mux path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest. A read-only media *parser*; declares no muxing/write capability.

## Anti-cheat validation

- **Scenario**: `src/scenarios/mux/write-targets.ts:54` (`id: 'opus_to_ogg'`), built by `buildMuxAll` from `src/scenarios/mux/_shared.ts`. Input `opus.ogg`, `containersIn:['ogg']`, `to:'ogg'`, `audioCodecs:['opus']`. notes (line 59-61): demux Opus from OGG, re-mux into OGG re-authoring pages + granulepos; reframing target gated by probe-duration (not a source-keyed packet count) — gating rationale documented and appropriate for a reframing re-mux.
- **Fixture exists & is real**: `fixtures/media/opus.ogg` present, 146 KB (real Opus-in-OGG, not synthetic/empty). Golden present: `fixtures/golden/opus.ogg.meta.json` (container ogg, durationSec 10.007, 1 Opus audio track 48 kHz / 2ch / 116652 bps) and `fixtures/golden/opus.ogg.packets.json` (56 KB packet table).
- **Oracle is real**: `src/core/oracles.ts:2709-2759` — the "probe(out).dur ≈ probe(x).dur across containers" branch. It re-opens the *authored output bytes* with the reference engine (`ctx.referenceEngine.probe`, line 2721), reads the real probed duration, and compares |out−golden| against a container-resolved tolerance band (line 2730-2743). It is NOT trivially satisfiable: the band is 0.0417 s (≈±1 frame), and a wrong duration would fail. Reported measurements (10.0135 s / 10.007 s / Δ0.0065 s and 10.02 s / Δ0.0130 s) are physically plausible for a ~10 s Opus clip.
- **Winner adapter is genuine**: `src/engines/mediabunny/adapter.ts:1508-1599` `mux()` calls the real mediabunny `Output`/`OggOutputFormat`/`EncodedAudioPacketSource` API, streams per-packet `EncodedPacket`s carrying real decoder config, and finalizes to a real buffer. No canned output, no input→output copy-to-fake, no golden short-circuit, no error swallowing (throws on unsupported codec/empty buffer).
- **Cached note**: BOTH PASS results have `cached:true` ("cached previous PASS result"). The evidence was reused, not re-run this session — staleness risk exists. However the winner determination is robust to this: mediabunny leads on the correctness discriminator (duration delta) AND every perf axis, so even mild cache drift would not flip the ranking.
- **Verdict: REAL** — real fixture, real golden, real mediabunny API implementation, meaningful (±1-frame) duration oracle. The single mild caveat (cached evidence + n==1 benches) is noted but does not undermine correctness.

## Confidence & caveats

- **Confidence: high** on the winner; medium on the *size* of the perf margin.
- Both PASS rows are `cached:true` and all benches are n==1 (single sample, mad=0, p95==median), so wall/throughput margins (1.11x) are weak statistically. The longtasks gap (13.4x) and the duration-fidelity gap (2.0x) are the load-bearing discriminators and are not sampling-noise artifacts (longtasks reflects single-thread-wasm-boot vs pure-TS architecture; duration delta is deterministic muxer behavior).
- ffmpeg did not sample peakMemory (n=0), so memory could not be compared head-to-head; mediabunny's 31.96 MB stands uncontested.
- The gate is a single proxy oracle (probe-duration); there is no bit-exact OGG-page or granulepos check, so this is a structural-duration gate, not crypto/bit-exact. The PASS is meaningful but not the strongest possible rung — both engines clear it, which is why the duration *delta* had to break the tie.
