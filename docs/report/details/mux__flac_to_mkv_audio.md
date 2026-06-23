# mux/flac_to_mkv_audio

family: mux | fixture asset: `fixtures/media/flac_seektable.flac` (FLAC, 48 kHz / 2ch, ~10 s, lossless) | target container: mkv (Matroska, audio-only) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Contested**: two engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Both satisfy the *same* single gating oracle `property-invariant` (probe-duration) with *identical* correctness measurements (`outDurationSec=10`, `goldenDurationSec=10`, `deltaSec=0`, tol `0.0417s`). Correctness is therefore a dead heat, so the decision falls to performance.
- **Decisive factor: wall time (the primaryMetric)**. mediabunny `6.96 ms` vs ffmpeg-wasm `8.63 ms` → **1.24x faster wall**, and throughputRealtime `1436.78x` vs `1158.75x` → **1.24x higher**. Both samples are n=1, so this is a thin, low-confidence margin (see caveats). ffmpeg-wasm actually reports far lower longtasks (173 ms vs 3675 ms) but the primaryMetric is wall, and ffmpeg-wasm's peakMemory was not sampled (n=0), so it cannot win the memory tiebreak either.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | property-invariant:true | 6.96 ms | 1436.78x | 43,111,016 B (~43.1 MB) | 3675 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 8.63 ms | 1158.75x | 0 (n=0, not sampled) | 173 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |

## Why the winner wins (deep technical)

The operation is `op:'mux'`: the runner first demuxes `flac_seektable.flac` into encoded FLAC packets, then calls `engine.mux(tracks, {container:'mkv'})`. The runner does NOT re-probe the output onto `ctx.metadata`/`ctx.demux` (see `src/scenarios/mux/_shared.ts:19-25`), so for an audio-only reframing target the *only* applicable structural gate is `property-invariant:probe-duration` — a container-agnostic check that the authored MKV materializes the right global duration. `golden-metadata`/`golden-packets` are deliberately never attached (they read demux context that does not exist for a mux op), and `reference-reimport` is attached only for ISO-BMFF faithful targets (mp4/mov), not for a Matroska reframe (`_shared.ts:28-48`). So both winners are judged by exactly one oracle and tie on it.

mediabunny's mux path (`src/engines/mediabunny/adapter.ts:1508-1597`) is a genuine Matroska authoring path: it builds a real `mb.Output({ format: makeOutputFormat('mkv'), target: BufferTarget })`, creates an `EncodedAudioPacketSource('flac')` (`adapter.ts:1539`), `output.addAudioTrack(source, { maximumPacketCount })`, then streams each coded FLAC packet as an `mb.EncodedPacket` preserving per-packet PTS/duration (`adapter.ts:1562-1569`). Critically, the **first packet carries `decoderConfig.description`** (`adapter.ts:1582-1590`) — the FLAC STREAMINFO bytes — so mediabunny's WebM/Matroska muxer can emit the `CodecPrivate` element, which is exactly the "lossless-audio codec-private (STREAMINFO) authoring into a Matroska track" the scenario notes call for (`write-targets.ts:148-150`). This is a pure-TS ESM core (`env.configUsed.coreBuild="pure-ts-esm"`, `wasmThreads=0`, `coopCoep="not-required"`, `sharedArrayBuffer=false`): no wasm boot, no MEMFS round-trip, no process spawn. For a ~10 s lossless audio stream that is just a packet-copy into a Matroska Block stream, that lean path explains the `6.96 ms` wall and `1436.78x` realtime throughput.

ffmpeg-wasm's mux path (`src/engines/ffmpeg-wasm/adapter.ts:2899-2947`) is equally real but heavier per byte: it reconstructs each opaque encoded track into an elementary stream in MEMFS (`buildElementaryStream`, `adapter.ts:2919-2921`), `writeFile`s it, then runs a real `ffmpeg -i <flac.es> -map 0 -c copy -avoid_negative_ts make_zero out.mkv` exec through the vendored wasm core. That is a faithful stream-copy remux into Matroska, and it lands the same `deltaSec=0` duration — but the MEMFS write + argv assembly + wasm exec overhead is why it trails at `8.63 ms` wall / `1158.75x`. Both engines copy coded FLAC samples losslessly, so there is no correctness separation to exploit; mediabunny simply pays less fixed overhead on the authoring path. The decisive factor is therefore the primaryMetric wall margin (1.24x), not any oracle-strength difference.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (real FLAC→MKV `-c copy` mux) but LOST on performance: 1.24x slower wall (8.63 vs 6.96 ms) and 1.24x lower realtime throughput (1158.75x vs 1436.78x). Its only counter-metrics (longtasks 173 ms vs 3675 ms) do not override the wall primaryMetric, and its peakMemory was not sampled (n=0) so it can't claim the memory tiebreak.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — remotion-media-parser is a read/parse-only library; it has no container-writing path, so declining mux is correct, not an under-declaration.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — a demux-only wasm wrapper with no muxer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — its scope is WebCodecs transcode/convert, not raw encoded-packet container authoring.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — the bare browser exposes no Matroska/FLAC muxer API (no WebCodecs muxer for FLAC-in-MKV).
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'flac'". Honest NA — mp4box.js is ISO-BMFF only; it cannot read a raw FLAC source nor write Matroska, so it is gated out on the input-container declaration before mux is even considered.

## Anti-cheat validation

- **Scenario**: `src/scenarios/mux/write-targets.ts:143-151` — `id:'flac_to_mkv_audio'`, `input:'flac_seektable.flac'`, `containersIn:['flac']`, `to:'mkv'`, `audioCodecs:['flac']`. Notes confirm the intent: lossless-audio codec-private (STREAMINFO) authoring into a Matroska track.
- **Fixture exists and is real**: `fixtures/media/flac_seektable.flac` present (~143k on disk), with goldens `fixtures/golden/flac_seektable.flac.meta.json` (container flac, durationSec 10, 48 kHz/2ch/flac) and `flac_seektable.flac.packets.json`. Not synthetic/empty/mock.
- **Oracle**: `src/core/oracles.ts:2645` `propertyInvariant` → probe branch at `oracles.ts:2709-2730`. It probes the AUTHORED output via the reference engine and compares to the golden source duration: `d = |outDur - goldenDur|` against `durationToleranceSec`. Measurements in the shard (`outDurationSec=10`, `goldenDurationSec=10`, `deltaSec=0`, tol `0.0417s`) are physically plausible for a 10 s FLAC source and not trivially satisfiable — a broken mux that dropped/duplicated packets would shift the probed duration past the ±1-frame band.
- **Winner adapter**: `src/engines/mediabunny/adapter.ts:1508-1597` — genuine `mb.Output`/`EncodedAudioPacketSource('flac')`/`addAudioTrack` with first-packet `decoderConfig.description` (STREAMINFO) at `adapter.ts:1582-1590`. No canned output, no input→output copy short-circuit, no golden short-circuit, no swallowed errors (unsupported codec/container throw).
- **Caveat — both PASS results are `cached:true`** ("cached previous PASS result"). The evidence is reused, not re-run this session; staleness risk exists but the oracle/fixture/adapter are all real and consistent.
- **Verdict: REAL.** Real fixture, real Matroska authoring in the winner, real cross-container duration oracle. The gate is structural-but-single (probe-duration only); it is meaningful for a reframing audio mux but is not a bit-exact/packet-level gate, so the *strength* of the PASS is moderate rather than maximal.

## Confidence & caveats

- **Confidence: medium.** Winner is unambiguous on the primaryMetric, but the margin is thin (1.24x) and both benches are **n=1, mad=0, p95=median** — single-sample evidence with no spread, so the wall ranking could flip under re-measurement.
- The two PASS engines tie exactly on the only oracle; mediabunny wins purely on performance, not correctness strength. If longtasks (173 ms vs 3675 ms) or unmeasured peakMemory were weighted above wall, ffmpeg-wasm's case would strengthen — but wall is the declared primaryMetric.
- Both results are cached; a fresh re-run is advisable before treating the wall margin as durable.
- The oracle is probe-duration only (no STREAMINFO/CodecPrivate byte verification, no packet-count check on the MKV), so a subtly malformed-but-right-duration Matroska would still pass; this is a WEAK-ish gate strength even though the PASS itself is genuine.
