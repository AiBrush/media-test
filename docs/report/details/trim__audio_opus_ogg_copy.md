# trim/audio_opus_ogg_copy

family: trim | fixture asset: `opus.ogg` (fixtures/media/opus.ogg, 146 KB, real) | primaryMetric: wall (median ms) | passCount: 2/7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Status: **CONTESTED** — two engines PASS (mediabunny, ffmpeg.wasm). The other 5 are `NA_ENGINE` (do not declare the `trim` operation).
- Correctness is a tie: both pass the single gating oracle `trim-boundaries` with `boundaryFrameComparisons=0` (duration-only gate, tolerance 0.1s). mediabunny is actually tighter on the measured duration delta (0.0135s vs 0.020s), but both are far inside tolerance.
- Decisive factor: **performance**. mediabunny wins on wall-clock and throughput.
- Margin over runner-up (ffmpeg.wasm): **1.37x faster wall** (7.26ms vs 9.94ms), **1.37x higher throughputRealtime** (1378x vs 1007x). ffmpeg.wasm also reports a 65.6 MB peak-memory footprint (wasm heap) where mediabunny reports none for this op; mediabunny longtasks 19963ms is a process-lifetime counter, not per-op cost, so it is not load-bearing here. All benches are n=1 (mad=0), so the margin is single-shot evidence.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true | 7.26 ms | 1378.37 x | 0 (n=0) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true | 9.94 ms | 1006.74 x | 65,568,576 B | 4410 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The operation is a copy-trim of Opus audio inside an Ogg container: cut the range [2.0s, 7.0s) (requested 5.0s) on Ogg-page / granulepos boundaries WITHOUT re-encoding. The scenario sets `frameAccurate: false` and `tolerances.durationToleranceSec: 0.1` (src/scenarios/trim/index.ts:345-355), so the correct strategy is a lossless packet passthrough, not a transcode.

mediabunny took its audio-only packet-copy fast path. In `trim()` (src/engines/mediabunny/adapter.ts:1445-1500), because `frameAccurate` is false, it calls `tryAudioOnlyPacketCopyTrim` (adapter.ts:1480) before ever falling back to the heavier Conversion API. That fast path (adapter.ts:912-994) opens the input, confirms exactly one audio track and no video (adapter.ts:921-925), reads the real Opus codec + decoderConfig/sampleRate/channels/description (adapter.ts:929-943), and creates a fresh Ogg `Output` with an `EncodedAudioPacketSource` (adapter.ts:935-937). It then iterates the source's encoded packets through `EncodedPacketSink.packets(..., { verifyKeyPackets: true })` (adapter.ts:952), selecting packets whose `[timestamp, timestamp+duration)` overlaps the trim window (adapter.ts:953-955), re-basing each packet's timestamp to a zero origin (`pkt.timestamp - originSec`, adapter.ts:956-963), copying the raw encoded bytes (`copyBytes(pkt.data)`), and re-attaching the decoder config metadata on the first packet (adapter.ts:964-975). This is a genuine demux → packet-filter → re-mux, so the Opus bitstream is preserved bit-for-bit and only the Ogg page framing/granulepos is rewritten — exactly the "cut on Ogg page / granulepos boundaries" the scenario notes call for.

That packet-copy path is why mediabunny is both correct and fast: no decode/encode, no WebCodecs round-trip, no wasm heap. Its config (env.configUsed) is `backend: webcodecs, coreBuild: pure-ts-esm, wasmThreads: 0, sharedArrayBuffer: false, coopCoep: not-required` — but for this audio copy no decoder is actually invoked; the win comes from a pure-TS streaming copy with no SAB/COOP-COEP requirement. The oracle `trim-boundaries` (src/core/oracles.ts:2348-2435) probes the output duration (reference-engine probe, else decoded frame-span, else simple-audio-container scan) and compares to the requested 5.0s. mediabunny's measured `outDurationSec=5.0135`, `durationDeltaSec=0.0135` — well under the 0.1s tolerance and tighter than ffmpeg's 0.020s, consistent with mediabunny snapping to whole Opus packets near the page boundary.

ffmpeg.wasm also PASSes the same oracle (`outDurationSec=5.02`, delta 0.020s), so correctness is comparable. The gap is mechanism cost: ffmpeg.wasm runs an emscripten wasm build (`-c copy` stream-copy) that must allocate and operate a ~65.6 MB wasm heap (peakMemory 65,568,576 B) and pay module/FS overhead, yielding 9.94ms wall vs mediabunny's 7.26ms (1.37x). mediabunny's native-JS streaming copy needs no wasm heap, so peakMemory is unmeasured/zero for the op.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (real `-c copy` stream-copy, same oracle), but lost on performance: 9.94ms wall vs 7.26ms (0.73x as fast / mediabunny 1.37x faster), throughput 1006.74x vs 1378.37x, and a 65.6 MB wasm-heap peakMemory where mediabunny pays none. n=1 single-shot, so the margin is suggestive, not statistically hardened.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA — the browser platform engine exposes decode/playback primitives, not a container-level copy-trim/mux operation.
- **mp4box@2.3.0** — NA_ENGINE: does not declare 'trim'. Honest for this case anyway: mp4box is an ISOBMFF (MP4) tool and cannot author an Ogg/Opus output.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'trim'. It is a parser/probe-only library (no muxing/writing), so the NA is honest.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'trim'. It is a demux-only library (no mux/output), so it cannot emit a trimmed file; honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'trim'. WebCodecs-based transcoding could in principle re-encode, but it does not register the `trim` op; the NA is an undeclared-capability boundary rather than a runtime failure (NA_ENGINE, not NA_BROWSER), and is honest for an Opus-copy where no transcode is wanted.

## Anti-cheat validation

- Scenario definition: src/scenarios/trim/index.ts:345-355 — `id: 'audio_opus_ogg_copy'`, `asset: 'opus.ogg'`, container `ogg`, audioCodec `opus`, range startUs 2_000_000 / endUs 7_000_000, `frameAccurate: false`, `durationToleranceSec: 0.1`, extraOracles `PLAYABLE_AUDIO`. Notes: "Opus-in-OGG copy-trim; cut on Ogg page / granulepos boundaries."
- Fixture: `fixtures/media/opus.ogg` exists, 146 KB — a real Opus/Ogg file, not synthetic/empty/mock.
- Oracle: `trim-boundaries` at src/core/oracles.ts:2348-2435. It performs a real duration comparison (probe/decode/container-scan) against the requested range and fails outside tolerance (oracles.ts:2394-2400). Measurements are physically plausible (5.0135s and 5.02s for a requested 5.0s cut). NOTE: this is a duration-only gate for this scenario — `boundaryFrameComparisons=0` because no trim-range frame golden is baked (oracles.ts:2405-2431), and tolerance is 0.1s. That is a real but loose correctness check (no bit-exact packet/golden comparison), which weakens the strength of the PASS even though it is not trivially satisfiable.
- Winner adapter: src/engines/mediabunny/adapter.ts:1445-1500 (trim dispatch) and adapter.ts:912-994 (`tryAudioOnlyPacketCopyTrim`). The op is genuinely implemented — it demuxes real Opus packets via `EncodedPacketSink`, filters by the trim window, copies raw bytes, and re-muxes via `Output`/`EncodedAudioPacketSource`. It does NOT copy input to output to fake a trim (it re-bases timestamps and drops out-of-range packets), does NOT short-circuit to a golden, and throws rather than reporting success when no packets fall in range (adapter.ts:982-983) or no buffer is produced (adapter.ts:988). The identity/noop fast path (adapter.ts:1468-1477) only triggers for start≈0 full-range requests, which is not this case (start=2.0s).
- Cached note: mediabunny's result has `cached: true` ("cached previous PASS result"), and so does ffmpeg.wasm. Both PASS rows were reused, not re-run in this report build — staleness risk applies to both equally, so the head-to-head comparison is still apples-to-apples but is single-shot (n=1) cached evidence.
- Verdict: **WEAK-GATE**. Real fixture + real packet-copy implementation, but the gating oracle is a duration-only proxy (0.1s tolerance, no boundary-frame/golden-packet comparison). The PASS is genuine; the gate is not strong.

## Confidence & caveats

- Confidence: medium. Winner selection is robust (only 2 eligible; mediabunny clearly faster with a real implementation), but: (1) the gate is duration-only/loose, so "correctness tie" is not proven at packet/bit level; (2) all benches are n=1, mad=0 — the 1.37x wall margin is a single sample; (3) both PASS rows are cached, so numbers may be stale; (4) `longtasks` 19963ms for mediabunny vs 4410ms for ffmpeg looks like a cumulative/lifetime counter rather than per-op work and was deliberately not used as a decision metric. A re-run with multiple samples and a trim-range golden (enabling boundary-packet comparison) would harden both the correctness tie and the performance margin.
