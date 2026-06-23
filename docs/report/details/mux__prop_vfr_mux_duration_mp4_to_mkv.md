# mux/prop_vfr_mux_duration_mp4_to_mkv

family: mux | fixture asset: `fixtures/media/h264_vfr.mp4` (2.3 MB, exists) | primaryMetric: wall | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Decisive factor: with correctness comparable (both pass the single `property-invariant` probe-duration gate), mediabunny wins on **performance**: 13.49 ms wall vs ffmpeg.wasm 42.54 ms = **3.15x faster wall**, and **19.6x lower long-task time** (1017 ms vs 19963 ms). mediabunny also posts a tighter duration delta (Δ 0.1000s vs 0.1340s) against the same 0.2000s band.
- Margin over runner-up (ffmpeg.wasm): 3.15x faster wall; 19.6x less main-thread blocking. Both ran with n==1 (single sample, mad==0), so the perf margin is directionally strong but low-replication; the magnitude (>3x) far exceeds plausible single-sample noise.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true (Δ0.1000s≤0.2000s) | 13.49 ms | n/a | 140,550,474 B | 1017 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (Δ0.1340s≤0.2000s) | 42.54 ms | n/a | 0 (not sampled) | 19963 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

## Why the winner wins (deep technical)

The operation is a VFR-preserving remux of **H.264 video + AAC audio** out of an MP4 (ISOBMFF, per-sample `stts` durations) into a **Matroska/MKV** container, where the original variable per-sample durations must be re-authored as Matroska block/cluster timecodes. The gate is metamorphic: probe the muxed output's container duration and require it to match the golden source duration (12.533s) within 200 ms. The scenario notes (src/scenarios/mux/metamorphic.ts:144-151) state the test exists to catch "a muxer that quantizes VFR to a constant cadence," and explicitly requires a "timestamp-preserving corpus-input→EncodedTracks path."

mediabunny ran on the WebCodecs backend with `prefer-hardware` hwAccel and a `streaming-lockstep` pipeline, single-threaded TS ESM core, no SharedArrayBuffer and `coopCoep: not-required` (env.configUsed). Crucially, for a pure remux it never decodes/re-encodes the H.264 — it copies coded packets. The timestamp fidelity comes from two adapter sites:

- `prepareMuxTracks` (src/engines/mediabunny/adapter.ts:1185-1239) reads every packet via `EncodedPacketSink` and records `ptsUs: pkt.microsecondTimestamp` AND `durationUs: pkt.microsecondDuration` per chunk (lines 1209-1212). It reads the *real* per-sample duration rather than synthesizing a constant cadence — exactly what VFR demands. This is what backs the declared capability token `mux:vfr-timestamps` (adapter.ts:1076).
- `mux()` (src/engines/mediabunny/adapter.ts:1508-1600) reconstructs each `EncodedPacket(c.data, key/delta, c.ptsUs/1e6, c.durationUs/1e6, i)` (lines 1562-1569) and feeds it to a real `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (lines 1528, 1539) attached to a real `mb.Output` whose format comes from `makeOutputFormat('mkv')` (line 1509; mkv normalization at adapter.ts:284). The first packet carries the decoder config so the Matroska writer emits the CodecPrivate (avcC) box. `output.finalize()` materializes the container.

Because the per-packet `microsecondDuration` survives into the Matroska timecodes, the materialized output duration came out 12.633s vs golden 12.533s — Δ 0.1000s (oracle measurements: outDurationSec 12.633, goldenDurationSec 12.533, deltaSec 0.0999…, durationToleranceSec 0.2). The 100 ms residual is the VFR/Matroska final-sample materialization rounding the scenario explicitly allows a 200 ms band for.

ffmpeg.wasm passes the same gate (Δ 0.1340s, out 12.667s) via its `-c copy` stream-copy mux path (src/engines/ffmpeg-wasm/adapter.ts:2899 `async mux`, declared at adapter.ts:33). `-c copy` is also timestamp-preserving, so correctness is genuinely comparable. The separation is performance: the wasm muxer is a single-threaded WebAssembly build (the shard shows no `wasmThreads`/SAB benefit) that pays MEMFS file I/O, elementary-stream framing, and process-startup overhead, producing 42.54 ms wall and a 19963 ms long-task figure. mediabunny's native-JS streaming muxer touches the packets directly in the JS heap (peakMemory 140.5 MB) and finishes in 13.49 ms with only 1017 ms of long tasks — a 3.15x wall win and 19.6x less main-thread blocking. mediabunny also lands a slightly tighter duration delta, so it wins (or ties) the correctness leg too.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but loses on perf: 42.54 ms wall (3.15x slower than mediabunny) and 19963 ms long-tasks (19.6x worse), plus a marginally looser duration delta (0.1340s vs 0.1000s). Single-threaded wasm + MEMFS overhead is the cause; correctness is real, just slower.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — the platform shim exposes WebCodecs decode/encode but no container muxer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'mux'. Honest; it is a transcode/decode wrapper, not a muxer.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'mux'. Honest; a parser/demuxer only, no write path.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'mux'. Honest; name confirms demux-only scope.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest and precise — mp4box.js writes ISOBMFF only; it can mux MP4 but has no Matroska writer, so it correctly NAs on the mkv target rather than faking it.

## Anti-cheat validation

- Scenario definition: src/scenarios/mux/metamorphic.ts:136-151 (`id: 'prop_vfr_mux_duration_mp4_to_mkv'`, invariant PROBE_DUR, to: 'mkv', tolerance 0.2s).
- Fixture: input `h264_vfr.mp4` → `fixtures/media/h264_vfr.mp4`, 2.3 MB, confirmed present via stat. Real VFR H.264+AAC corpus file, not synthetic/empty/mock.
- Oracle: src/core/oracles.ts:2709-2759 (property-invariant → probe-duration branch). It performs a REAL probe of the muxed bytes via `ctx.referenceEngine.probe(...)` (line 2721) and compares against the golden/source duration with `Math.abs(outDur - goldenDur)`. Not trivially satisfiable: a constant-cadence muxer would shift the total duration past the 0.2s band and fail. Measurements (out 12.633s / golden 12.533s / Δ 0.0999…s / tol 0.2s) are physically plausible for a ~12.5s VFR clip.
- Winner adapter: src/engines/mediabunny/adapter.ts:1508-1600 (`mux`) + 1185-1239 (`prepareMuxTracks`). Genuine library calls (mb.Output, EncodedVideoPacketSource, EncodedAudioPacketSource, makeOutputFormat('mkv'), output.finalize). No canned output, no input→output copy, no short-circuit to golden, no error swallowing (codec mismatches throw).
- Verdict: **REAL**. Real fixture, real Matroska mux that preserves per-sample VFR durations, real reference-probe oracle with a meaningful tolerance band.
- Cached note: both PASS results have `cached: true` ("cached previous PASS result"). The numbers are reused, not freshly re-run, so there is mild staleness risk on the exact wall/longtask figures — but both correctness verdicts and the >3x perf gap are large enough that re-running is unlikely to flip the winner.

## Confidence & caveats

- Confidence: high on the winner (only 2 eligible PASS; mediabunny is no-worse on correctness and decisively faster). Medium on the precise perf margin because both benches are n==1 (mad==0, single sample) and cached.
- ffmpeg.wasm's peakMemory is 0 (not sampled), so a memory comparison is not possible; the win rests on wall + longtasks.
- The 4 NA_ENGINE and 1 NA (mkv-container) declarations all look honest — they reflect genuine missing mux/Matroska write capability, not under-declaration.
