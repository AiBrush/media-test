# mux/av1_opus_to_mp4

family: mux | fixture asset: `av1_720p_5s.webm` (1.9 MB, AV1 1280x720@30 + Opus 48 kHz stereo) | primaryMetric: wall | passCount: 1 / 7

## Verdict

Best framework: **mediabunny@1.48.0** (engineId `mediabunny`). **Uncontested** — it is the only engine that produced a result at all; the other 6 are all NA_ENGINE (none even attempted the operation).

Decisive factor: capability coverage. This scenario demands demuxing **AV1 video + Opus audio out of a WebM (Matroska) container and re-muxing both coded tracks into MP4**. mediabunny is the only engine in the matrix that declares the full triple (operation `mux` + input container `webm` + video codec `av1`). Every competitor is filtered out by the runner's capability gate before any oracle runs, so there is no runner-up to measure a margin against.

mediabunny passed its single gating oracle (`property-invariant`, the cross-container duration invariant `probe(out).dur ≈ probe(x).dur`) with Δ = 0.0070 s against a tolerance of 0.0417 s (≈ ±1 frame @ 24 fps): outDurationSec 5.001 vs goldenDurationSec 5.008.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass | 14.695 ms | 340.80 x-realtime | 0 (n=0, not sampled) | 4410 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare video codec 'av1' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is a pure **container transmux**: pull the already-coded AV1 elementary stream and the Opus stream out of a WebM/Matroska wrapper and rewrap both, byte-for-byte at the sample level, into an ISOBMFF (MP4) sample table. Both AV1 (`av01`) and Opus (`Opus`/`dOps`) are legal in MP4, so no re-encoding is required — the scenario notes confirm this ("AV1+Opus tracks muxed into MP4 (both legal in MP4)"). The hard parts are (a) carrying the codec-private configuration boxes correctly (AV1's `av1C` OBU sequence header, Opus's `dOps` from the WebM CodecPrivate), and (b) preserving sample timing/duration so the output's global duration matches the source.

mediabunny's mux path is genuinely implemented at `src/engines/mediabunny/adapter.ts:1508` (`async mux(tracks, opts)`). It builds a real `OutputFormat` for `mp4` via `makeOutputFormat` (adapter.ts:1509), constructs a real `mb.Output` over an instrumented `BufferTarget` (adapter.ts:1513-1514), and for each track creates an `EncodedVideoPacketSource('av1')` / `EncodedAudioPacketSource('opus')` and attaches it with `output.addVideoTrack` / `output.addAudioTrack` (adapter.ts:1528-1540). It then calls `output.start()` (adapter.ts:1553), iterates the demuxed chunks wrapping each in a real `mb.EncodedPacket(data, key|delta, ptsUs/1e6, durationUs/1e6, i)` (adapter.ts:1562-1569), and — critically — attaches the decoder config (codec string, dimensions/sample-rate/channels, and the `description` carrying the codec-private bytes) to the **first** packet so the muxer can emit the `av1C`/`dOps` boxes (adapter.ts:1570-1591). It finalizes with `output.finalize()` (adapter.ts:1598) and returns the real produced bytes (adapter.ts:1599). This is a true coded-packet remux through the library, not a copy or a canned blob.

The backend used (env.configUsed): `backend: webcodecs`, `coreBuild: pure-ts-esm`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required`. Notably the mux itself does not need a decoder — it shuttles coded packets — so the WebCodecs backend tag mostly reflects mediabunny's default config; the relevant property is that it requires **no COOP/COEP and no SharedArrayBuffer**, so it runs in any plain browser context, unlike a threaded wasm transmuxer.

The gating oracle is `property-invariant` dispatched at `src/core/oracles.ts:344` → `propertyInvariant` (oracles.ts:2645), resolving to the duration-invariant branch (oracles.ts:2709+): it re-probes the produced MP4 via the reference engine and compares its duration to the golden source duration. Measurements are physically consistent with the fixture: golden meta (`fixtures/golden/av1_720p_5s.webm.meta.json`) records durationSec 5.008 for a 5-second 720p30 AV1 + 48 kHz Opus clip; the muxed MP4 probed at 5.001 s, Δ 0.007 s, inside the 0.0417 s (≈1 frame) band. The 7 ms shortfall is the expected effect of WebM block timing vs MP4 sample-table edit-list rounding on a short clip — well within "structural duration preserved."

Performance (single-sample, n=1, no contender): wall median 14.695 ms, throughputRealtime 340.80x. The 4410 ms longtasks figure dwarfs the 14.7 ms wall and reflects suite-level main-thread occupancy (decode/probe of golden frames and harness overhead), not the mux op cost itself. peakMemory was not sampled (n=0). With n=1 these numbers are weak performance evidence, but performance is irrelevant here because the field is uncontested.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare video codec 'av1'." Honest under-declaration relative to native FFmpeg (which can demux AV1/Matroska), but the *wasm build/adapter* shipped here does not advertise AV1, so the runner correctly skips it. Not a failure, a declared gap.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'." Honest: MP4Box.js is an ISOBMFF-only library; it cannot parse a Matroska/WebM source, so it legitimately cannot supply the input demux for this mux.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'." Honest: the bare-WebCodecs "platform" engine exposes decode/encode primitives but no container muxer, so a transmux-to-MP4 is out of scope by design.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'." Honest: web-demuxer is a read/demux-only library; muxing is not in its surface.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'." Honest: it is a parser/reader, not a writer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'." Plausibly honest, though remotion-webcodecs does perform container conversion in some contexts; for this matrix it does not declare `mux`, so the runner skips it. The NA is correct given the declaration; whether it *could* mux AV1+Opus→MP4 is a separate capability question, but there is no evidence of an under-declared gate being exploited here.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/index.ts:84-92` — `id: 'av1_opus_to_mp4'`, `input: 'av1_720p_5s.webm'`, `containersIn: ['webm']`, `to: 'mp4'`, `videoCodecs: ['av1']`, `audioCodecs: ['opus']`, notes "AV1+Opus tracks muxed into MP4 (both legal in MP4)."
- Fixture: `fixtures/media/av1_720p_5s.webm` EXISTS (1.9 MB). Golden meta `fixtures/golden/av1_720p_5s.webm.meta.json` confirms real media: webm container, AV1 1280x720@30, Opus 48 kHz stereo, durationSec 5.008. Not synthetic/empty/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508-1600` — genuine library mux (EncodedVideoPacketSource/EncodedAudioPacketSource → mb.Output(mp4) → start/add(EncodedPacket)/finalize). No hardcoded output, no input→output copy, no short-circuit to the golden, no error swallowing (errors thrown on unsupported codec/container at :1510, :1527, :1538).
- Oracle: `src/core/oracles.ts:344` → `propertyInvariant` (oracles.ts:2645), duration-invariant branch (oracles.ts:2709+): re-probes the produced MP4 and compares to golden duration with a tight ±0.0417 s (≈1 frame) tolerance. Measurements (out 5.001 / golden 5.008 / Δ 0.007) are physically plausible for the real clip.
- Cached note: mediabunny's result has **cached==true** ("cached previous PASS result"). The PASS is real but was reused, not re-run in this batch — mild staleness risk if the adapter or fixture changed since the cache was written; the durations and config remain consistent with the current fixture.
- Verdict: **WEAK-GATE**. The implementation, fixture, and oracle are all real, but the gate is a single *property-invariant duration* check — it confirms the container's global duration was preserved across WebM→MP4, but it does NOT verify packet-exactness (golden-packets), box layout (mp4-box-layout), or decoded-frame fidelity (decoded-frames-bitexact). A muxer could in principle preserve duration while corrupting sample data or dropping the av1C/dOps config and still pass this proxy. The PASS is genuine but the correctness evidence is duration-only, hence WEAK-GATE rather than REAL.

## Confidence & caveats

Confidence: high on the verdict (uncontested — only mediabunny is capability-eligible; the other 6 NA_ENGINE reasons are individually consistent with each library's real surface). Medium on correctness *strength*: the gate is a single duration-invariant proxy, not a packet/frame-exact comparison, so "the mux is byte-correct" is asserted, not proven, by this scenario. The winner's result is cached (not freshly re-run), and bench metrics are n=1 with peakMemory unsampled — but performance is moot for an uncontested win. No second eligible engine exists to cross-check the output, so the duration figure has no independent corroboration within this scenario.
