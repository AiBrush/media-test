# metadata/tagedit_no_corrupt_audio_flac

- **Family:** metadata
- **Fixture asset:** `fixtures/media/flac_seektable.flac` (143 KB, real FLAC w/ SEEKTABLE)
- **Operation:** `remux` FLAC -> FLAC (`from:'flac'`, `to:'flac'`, invariant `probe-duration`)
- **Primary metric:** wall (metrics order: wall, peakMemory, longtasks)
- **Pass count:** 2 / 7 (ffmpeg.wasm, mediabunny)

## Verdict

- **Best framework:** `mediabunny@1.48.0` — CONTESTED (2 PASS).
- **Decisive factor:** PERFORMANCE. Both PASS engines satisfy the identical single oracle (`property-invariant` / probe-duration) with bit-identical measurements (Δ 0.0000s ≤ 0.0417s). Correctness is therefore a dead tie, so the tiebreak falls to wall median.
- **Margin over runner-up:** mediabunny wall **5.94 ms** vs ffmpeg.wasm **11.31 ms** = **1.90x faster wall** (n=1 each, so weak statistical evidence). mediabunny additionally needs **no COOP/COEP**, **no SharedArrayBuffer** (`wasmThreads:0`, pure-ts-esm, streaming-lockstep), against ffmpeg.wasm's monolithic single-thread wasm whole-file buffering. ffmpeg.wasm reports the *lower* longtasks (4146 ms vs 19963 ms), but longtasks is the lowest-priority metric here and the primaryMetric (wall) favors mediabunny.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | property-invariant:pass | 5.94 ms | n/a | 0 (not sampled) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 11.31 ms | n/a | 0 (not sampled) | 4146 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'flac' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |

(peakMemory bench has n=0 samples for both — not measured this run; reported median 0 is a placeholder, not a real 0-byte reading.)

## Why the winner wins (deep technical)

This case is a FLAC->FLAC lossless rewrite — the metamorphic statement is "a tag edit must not corrupt the audio stream." Because the suite has no PCM-digest oracle for FLAC, the scenario (src/scenarios/metadata/write-roundtrip.ts:136-147, notes line 142-145) deliberately downgrades the corruption check to a **duration-preservation proxy**: `probe(remux(x)).dur ≈ probe(x).dur`. The gating oracle is `property-invariant` routed by token `PROBE_DUR = 'probe-duration'` (src/scenarios/metadata/_shared.ts:68). Since `op === 'remux'` (not `probe`), the oracle takes the cross-container output branch at src/core/oracles.ts:2709-2758: it re-probes `ctx.output` through the reference engine, compares the probed duration to the golden source duration, and passes if within the FLAC container band.

Both PASS engines hit the exact same numbers: `outDurationSec:10`, `goldenDurationSec:10`, `deltaSec:0`, `durationToleranceSec:0.041666…` (one video-frame worth of 24fps tolerance, ~41.7 ms). A delta of literally 0.0000s on a 10s file means both engines performed a true **stream copy** — no re-encode, no frame drop — so the STREAMINFO total-samples / sample-rate survived intact. Correctness is genuinely tied; nothing in the correctness ladder separates them.

The win therefore comes from the execution path. mediabunny ran on its pure-TypeScript ESM core (`coreBuild:"pure-ts-esm"`, env.configUsed) with `pipeline:"streaming-lockstep"`, `wasmThreads:0`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`. Its `remux()` (src/engines/mediabunny/adapter.ts:1244-1260) builds a FLAC output format via `makeOutputFormat('flac', …)`, opens the input, and drives `runConversion(...)` — a streaming demux->remux that copies coded FLAC frames without materializing/decoding the whole file. That streaming, no-wasm-bootstrap path executed the 143 KB FLAC rewrap in **5.94 ms wall**.

ffmpeg.wasm did the same logical work — `remux()` at src/engines/ffmpeg-wasm/adapter.ts:2031-2069 runs `-map 0 -c copy` (genuine stream copy, with `-metadata k=v` for tag writes) — but inside the single-threaded wasm FFmpeg runtime, paying MEMFS write-in, full-file buffering, and process-style arg dispatch. That cost **11.31 ms wall**, ~1.90x slower. Its longtasks figure is actually *lower* (4146 ms vs mediabunny's 19963 ms), which likely reflects mediabunny's main-thread streaming chunk loop blocking longer per task — but longtasks is the lowest-priority tiebreak metric and the declared primaryMetric (wall) decides in mediabunny's favor.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost on performance: 11.31 ms wall vs 5.94 ms (0.52x the speed; 1.90x slower). Same single oracle, same Δ=0 correctness, so it loses purely on the wall tiebreak. (It does win the longtasks sub-metric, 4146 vs 19963 ms, which is noted but non-decisive.)
- **platform@chrome-149** — NA_ENGINE, honest: "engine does not declare operation 'remux'." WebCodecs/Chrome has no muxing/remux primitive, so declining the op is correct, not an under-declaration.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: "engine does not declare operation 'remux'." web-demuxer is a demux-only library; it cannot author a FLAC output container.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: "engine does not declare operation 'remux'." It is a parser, read-only; no mux/remux capability.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest: "engine does not declare output container 'flac'." It can remux but its mux target set excludes FLAC; declaring FLAC absent is correct.
- **mp4box@2.3.0** — NA_ENGINE, honest: "engine does not declare input container 'flac'." mp4box is ISO-BMFF (MP4) only; it cannot parse a native FLAC input. Correct NA.

## Anti-cheat validation

- **Scenario:** src/scenarios/metadata/write-roundtrip.ts:136-147 (`tagedit_no_corrupt_audio_flac`), built via `buildProperty` (src/scenarios/metadata/_shared.ts:176-196) -> `op:'remux'`, `options:{container:'flac', invariant:'probe-duration'}`.
- **Fixture:** `fixtures/media/flac_seektable.flac` EXISTS (143 KB real FLAC), with golden `fixtures/golden/flac_seektable.flac.meta.json` + `.packets.json`. Real media, not synthetic/mock.
- **Oracle:** `property-invariant` at src/core/oracles.ts:2645-2769; the probe-duration cross-container branch is src/core/oracles.ts:2709-2758. It re-probes the actual `ctx.output` bytes through the reference engine and compares to the golden duration with a real ~41.7 ms band — not trivially satisfiable, but it is a **duration proxy**, not a PCM/bit-exact check (the scenario authors acknowledge this explicitly: "the honest no-PCM-oracle proxy for 'audio samples bit-identical'").
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1244-1260 — real `makeOutputFormat`/`openInput`/`runConversion` streaming remux; does NOT short-circuit to golden, copy input->output verbatim, or swallow errors. ffmpeg.wasm equivalent (src/engines/ffmpeg-wasm/adapter.ts:2031-2069) is a genuine `-c copy` invocation.
- **Verdict: WEAK-GATE.** The implementation and fixture are real and the oracle does a real probe comparison, but the only gate is a duration-equality proxy (Δ tolerance ~41.7 ms) — it cannot detect intra-stream sample corruption that preserves total duration. PASS is real but not strong correctness evidence. The measurements (10s duration, Δ=0) are physically plausible for a 143 KB FLAC.
- **Cached note:** BOTH PASS results have `cached:true` ("cached previous PASS result"). Evidence was reused, not re-run this session — staleness risk; the launcher seeding caveat (stale PASS reuse) applies. Winner determination by wall (5.94 vs 11.31 ms) rests on cached single-sample (n=1) benches.

## Confidence & caveats

- **Confidence: medium.** Winner selection is unambiguous *given the data* (only 2 eligible, tied correctness, clear 1.90x wall margin), but: (1) the gate is a WEAK duration proxy, not bit-exact; (2) both benches are n=1 with mad=0 (single sample, no spread) — a 5.4 ms wall gap is small in absolute terms; (3) both results are `cached:true`, so numbers may be stale. peakMemory was not sampled (n=0). longtasks actually favors ffmpeg.wasm, so the win is metric-selection dependent (wall as primary).
