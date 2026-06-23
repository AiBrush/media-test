# mux/prop_h264_mux_duration_mp4_to_ts

family: mux | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 1080p30 + AAC 48k stereo) | primaryMetric: wall | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **YES** — 2 engines PASS (mediabunny, ffmpeg.wasm) with identical correctness.
- Decisive factor: **performance**. Correctness is a tie (both pass the single `property-invariant` probe-duration gate with byte-for-byte the same measurement: Δ 0.0373s ≤ 0.0417s). The split is wall time.
- Margin over runner-up: mediabunny wall median **186.03 ms vs ffmpeg.wasm 1165.57 ms = 6.27x faster** (n=1, mad=0 — single-sample, weak statistical evidence; see caveats). Long-task time is comparable (1012 ms vs 1017 ms). peakMemory not captured for either (n=0).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass | 186.03 ms | n/a | n/a (n=0) | 1012 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 1165.57 ms | n/a | n/a (n=0) | 1017 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is a **cross-container remux of H.264 video + AAC audio from an ISO-BMFF (MP4) source into an MPEG-TS (Annex-B/PES) output**, with no re-encoding. The gating oracle is the metamorphic invariant `probe(mux(x)).dur ≈ probe(x).dur` (`src/scenarios/mux/_shared.ts:77`, `PROBE_DUR`), interpreted by the duration branch of `propertyInvariant` in `src/core/oracles.ts:2709-2758`. MPEG-TS reframes the elementary streams into 188-byte TS packets/PES, so packet *count* shifts and a count-based `reference-reimport` gate would false-fail; the scenario notes (`src/scenarios/mux/metamorphic.ts:61-63`) deliberately pick duration, which is invariant under the container change, as the faithful check.

Both passing engines reproduce the source duration: golden `durationSec=30` (`fixtures/golden/h264_1080p_30s.mp4.meta.json:3`); both produce `outDurationSec=30.0373333…s`, Δ 0.037333s, under the tolerance band 0.041667s (≈1/24s). That ~37 ms surplus is the physically-expected artifact of TS reframing — PES/PTS quantization plus a partial trailing access unit — not a duration-clobbering bug, so the gate is doing real work (a wrong-timescale or dropped-sample muxer would blow well past 1/24s). The two measurements are identical to the last decimal, confirming a genuine correctness tie.

mediabunny wins on **wall**: 186.03 ms vs ffmpeg.wasm's 1165.57 ms (6.27x). The mechanistic reason is the backend and the data path. mediabunny ran on `backend: webcodecs`, `coreBuild: pure-ts-esm`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required` (shard `env.configUsed`). Its mux path (`src/engines/mediabunny/adapter.ts:1508-1600`) is a pure container-rewrite: it builds an `mb.Output` over a `BufferTarget`, attaches `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (lines 1528, 1539), and streams the already-demuxed coded packets straight through — each `EncodedPacket` is constructed from the source `c.data` with its original `ptsUs/1e6` and `durationUs/1e6` preserved (lines 1562-1569), with the decoder config attached only on the first packet so the TS muxer can emit codec-private setup (lines 1571-1590). No decode, no transcode, no pixel touch — just copy-with-timing-preserved into the TS writer, then `output.finalize()` (line 1598). ffmpeg.wasm, by contrast, marshals the whole 31 MB file across the JS↔wasm FS boundary, spins up the single-thread `libavformat` TS muxer, and copies bytes back out — wasm startup + MEMFS round-trip dominates, producing the ~1.0s gap. Long-task time being near-identical (1012 vs 1017 ms) suggests the runner's surrounding decode/setup work is the same; the *muxer step itself* is where mediabunny's native-WebCodecs-adjacent path is an order of magnitude cheaper.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (same oracle, Δ 0.0373s), but lost on performance: wall 1165.57 ms vs 186.03 ms = **6.27x slower**, attributable to single-thread wasm + MEMFS marshalling of the 31 MB input rather than a streaming encoded-packet copy.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — the raw WebCodecs/platform adapter exposes decode/encode primitives, not a container muxer, so it genuinely cannot author a TS file.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'ts'". Honest — MP4Box.js writes ISO-BMFF only; MPEG-TS is outside its container matrix. (It does declare `mux`, but not the `ts` target, exactly the right granularity.)
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — it is a demux/probe-only library (libav demuxers), no muxing surface.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — a parser/reader, not a writer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Plausibly honest for a TS target, though remotion-webcodecs does convert/encode in other families; for an MP4→TS container author it does not register the `mux` op. No evidence of under-declaration here since TS is an uncommon output target.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/metamorphic.ts:53-64` (id `prop_h264_mux_duration_mp4_to_ts`, input `h264_1080p_30s.mp4`, `to: 'ts'`, video h264 / audio aac, invariant `PROBE_DUR`). Builder/gating: `src/scenarios/mux/_shared.ts:200,213-217` (`requires` op `mux`, `containersOut: [c.to]`).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` — **exists, 31 MB**, a real H.264+AAC encode (golden meta confirms 1920x1080@30, AAC 48k stereo, 30.0s). Not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:2709-2758` (probe-duration branch). It reference-probes the actual authored output (`ctx.referenceEngine.probe`, line 2721), computes `|outDur − goldenDur|`, and compares to a container-keyed band (`durationToleranceFor`, line 2742). Real comparison against a real golden (30s); tolerance 0.0417s is tight (1 frame), not trivially satisfiable. Measurements (out 30.0373s, Δ 0.0373s) are physically plausible for an MP4→TS reframe.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508-1600` — genuine mediabunny `Output`/`EncodedVideoPacketSource`/`EncodedAudioPacketSource` API; copies coded packets with preserved timing; no canned output, no input→output passthrough faking a transcode (it IS a legit container copy), no golden short-circuit, no swallowed errors (throws on unsupported codec/container).
- Verdict: **REAL** — real fixture, real library mux, meaningful tight duration gate with plausible numbers.
- Cached note: both PASS results have `cached==true` ("cached previous PASS result"); evidence was reused, not re-run this session. Numbers (wall 186.03 / 1165.57 ms) reflect a prior run — staleness risk is low for a correctness verdict but the perf margin should be treated as last-known.

## Confidence & caveats

- Confidence: **medium**. Correctness verdict is solid (REAL gate, real fixture, real implementation). The contested winner is decided purely on wall time.
- Caveats: (1) perf samples are n=1, mad=0 for both engines — a 6.27x margin on a single sample is suggestive but not statistically robust; (2) both results are cached (stale-but-plausible); (3) peakMemory and throughputRealtime were not captured (n=0), so the only performance axis is wall + longtasks; (4) only one oracle gates this cell (no decode/bit-exact gate for the TS target), so correctness strength is "structural/metadata-exact" tier, not bit-exact — both engines pass it equally, which is why the decision falls to performance.
