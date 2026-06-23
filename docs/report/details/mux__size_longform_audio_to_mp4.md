# mux/size_longform_audio_to_mp4

- family: mux
- fixture asset: `fixtures/media/longform_1h_audio.m4a` (1 h AAC-LC, 48 kHz mono, ~64 kbit/s, 29,659,705 bytes, sha256 74cf9cc3…71ad)
- target container: mp4 (audio-only `.m4a`)
- primaryMetric: throughputRealtime (output media-seconds per wall-second)
- passCount: 3 of 7 (mediabunny, ffmpeg-wasm, mp4box). 4 NA_ENGINE.

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (`ffmpeg-wasm`).
- Status: **CONTESTED** — three engines PASS with byte-for-byte identical oracle outcomes.
- Decisive factor: **performance (the primary metric)**, since correctness strength is a dead tie. All
  three passers report the exact same two oracle measurements (reference-reimport 168751 packets /
  168751 keyframes; probe-duration Δ 0.0213 s ≤ 0.0417 s). With correctness comparable, the ranking
  falls to `throughputRealtime`, where ffmpeg-wasm is far ahead.
- Margin over runner-up: ffmpeg-wasm **5831.80 x-realtime** vs mediabunny **792.46 x-realtime** =
  **7.36x higher throughput**, and **617.3 ms** wall vs mediabunny **4542.83 ms** = **7.36x faster
  wall**. Against mp4box (732.87 x-realtime / 4912.22 ms wall) the gap is **7.96x**. Caveat: n=1 for
  every metric (warmup=1, mad=0), so the margin is single-sample evidence — but a 7x gap dwarfs any
  plausible single-run jitter, so the ordering is safe even though the precise ratio is soft.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true; property-invariant:true | 617.31 | 5831.80 | not sampled (n=0) | 4223 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true; property-invariant:true | 4542.83 | 792.46 | not sampled (n=0) | 4707 | cached previous PASS result |
| mp4box@2.3.0 | PASS | reference-reimport:true; property-invariant:true | 4912.22 | 732.87 | not sampled (n=0) | 4146 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

peakMemory and targetWrites carry n=0 / empty samples for all three passers (not instrumented on this
cell), so they cannot serve as tiebreakers; only wall / throughputRealtime / longtasks are populated.

## Why the winner wins (deep technical)

This is a pure container-authoring job: the runner demuxes the 1 h AAC source into EncodedTracks, then
each engine's `mux()` packs those already-coded AAC access units into an MP4/`.m4a`. No re-encode happens
— mux copies coded samples verbatim and only authors the `moov` sample table (`stts`/`stsz`/`stco`) and
ftyp/mdat. The scenario exists to stress the index-growth path: 1 h of AAC at 1024 samples/frame, 48 kHz
is ~168,751 frames, so the muxer must write a ~168k-entry `stsz`/`stco`/`stts` and is in stco→co64
crossover territory. All three passers author a structurally correct table — both oracles confirm it.

Correctness is genuinely a tie, so the win is mechanistic on throughput:

- **ffmpeg-wasm** muxes via the C muxer compiled to wasm. Its `mux()` (`src/engines/ffmpeg-wasm/adapter.ts:2899`)
  materializes each demuxed track as a raw elementary stream in MEMFS (`buildElementaryStream`,
  written at `adapter.ts:2920`), then runs a single real ffmpeg `-c copy` invocation (`adapter.ts:2924-2941`):
  `-map 0 -c copy -avoid_negative_ts make_zero -movflags +faststart`. The libavformat `mov` muxer writes
  the entire 168k-entry sample table in tight compiled C in one pass, then the `+faststart` flag relocates
  the `moov` ahead of `mdat`. That compiled-C inner loop is why it sustains **5831.80 x-realtime** /
  **617.31 ms** for the whole hour — roughly 7x faster than the two pure-JS authors. Its backend here is
  the single-thread wasm core (no SharedArrayBuffer needed), and it still wins on raw muxer speed.
- **mediabunny** (`configUsed.backend: webcodecs`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`)
  authors the same table in TypeScript. It is correct and second on throughput (**792.46 x** / 4542.83 ms),
  but building a 168k-entry sample table in JS object/array land is ~7x slower than the C loop.
- **mp4box** (`configUsed.backend: pure-js`, `pipeline: whole-file-append(MP4BoxBuffer+fileStart)`) is the
  slowest passer (**732.87 x** / 4912.22 ms). Its whole-file-append authoring model buffers and re-appends,
  which at 168k samples is the heaviest of the three; correctness is identical but throughput is last.

Oracle evidence (identical for all three, real numbers from the shard):
- `reference-reimport`: re-importing each engine's MP4 output with the reference engine yields
  **168751 packets / 168751 keyframes**, an EXACT match to the source golden
  `fixtures/golden/longform_1h_audio.m4a.packets.json` (a 168751-entry list; every AAC packet is a
  keyframe). The gate (`oracles.ts:1254-1265`) is `withinRel(...,0.02,1)` on count and keyframes — an
  exact hit, far inside the 2% band, so the authored sample table round-trips losslessly.
- `property-invariant` probe-duration (`oracles.ts:2709-2758`): reference-probed output duration
  **3600.0213 s** vs golden **3600 s**, Δ **0.0213 s ≤ 0.0417 s** tolerance. The 0.0213 s residual is one
  AAC frame of encoder priming (the golden packet table starts at ptsUs −21333, i.e. 1024/48000 s of
  priming) surfacing as duration — physically exactly what a faithful AAC→MP4 mux produces.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, but lost on the primary metric: 792.46 x-realtime vs winner 5831.80 x
  (7.36x slower), 4542.83 ms vs 617.31 ms wall. Correctness identical; pure-TS sample-table authoring is
  the bottleneck at 168k samples.
- **mp4box@2.3.0** — PASS, slowest passer: 732.87 x-realtime (7.96x slower than winner), 4912.22 ms wall.
  Its `whole-file-append(MP4BoxBuffer+fileStart)` pipeline is the heaviest model for a 168k-sample table.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA. The Chrome
  WebCodecs platform engine exposes decode/encode primitives, not a container muxer; there is no
  standalone browser mux API, so declining the op is correct, not an under-declaration.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, same reason. Honest: this engine is a WebCodecs
  transcode/decode wrapper and does not author containers.
- **remotion-media-parser@4.0.479** — NA_ENGINE, same reason. Honest: media-parser is read-only
  (demux/probe); it has no muxer.
- **web-demuxer@4.0.0** — NA_ENGINE, same reason. Honest: the name says it — a demuxer, no mux path.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/size-ladder.ts:100-111` (`id: 'size_longform_audio_to_mp4'`),
  built through `buildMux` in `src/scenarios/mux/_shared.ts:204`. Oracle set for this single-source
  ISO-BMFF→mp4 case = `reference-reimport` + `property-invariant` (probe-duration), per
  `defaultOracles` (`_shared.ts:183-195`).
- Fixture: `fixtures/media/longform_1h_audio.m4a` EXISTS — 29,659,705 bytes, real AAC, sha256 matches the
  manifest entry (`fixtures/manifest.json:678-690`, sizeBytes 29659705, sha256 74cf9cc3…71ad). NOT
  synthetic/empty/mock. The scenario header comment claiming the asset is "generated with sha256/sizeBytes
  null / NA until bake" is STALE — the bake has since populated both the file and the goldens
  (`fixtures/golden/longform_1h_audio.m4a.meta.json` durationSec 3600; `.packets.json` 168751 entries).
- Oracle implementations: `referenceReimport` at `src/core/oracles.ts:1225` (real reference re-demux of
  the engine's output, count+keyframe diff vs golden, rejects empty packet tables at line 1249-1250),
  and the probe-duration branch of `propertyInvariant` at `src/core/oracles.ts:2709-2758` (real reference
  probe of the authored output vs golden duration). Neither is trivially satisfiable: an empty/garbage
  mux fails reference-reimport (empty table) and a wrong-duration mux fails the 0.0417 s band.
  Measurements are physically plausible (168751 ≈ 3600 s × 48000 / 1024; one priming frame of duration
  drift).
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2899-2947` (`mux`). Genuine implementation —
  rebuilds elementary streams, writes them to MEMFS (`adapter.ts:2920`), and runs a real ffmpeg `-c copy`
  stream-copy (`adapter.ts:2924-2941`). No canned output, no input→output copy to fake a transcode, no
  golden short-circuit, no swallowed error reporting success (it `throw`s on empty track sets and reads
  the actual MEMFS output).
- Cached note: ffmpeg-wasm's result has `cached: true` ("cached previous PASS result"), as do all three
  passers. The numbers were reused, not freshly re-run this session — minor staleness risk, but the
  cached oracle outcomes are internally consistent (exact golden match) and the adapter code is real.
- Verdict: **REAL** — real fixture, real ffmpeg `-c copy` mux, two meaningful oracles (exact packet/
  keyframe round-trip + strict cross-container duration invariant).

## Confidence & caveats

- Confidence: **high** on the winner and the REAL verdict. The 7.36x throughput margin is far beyond any
  single-run noise, the fixture and goldens are real and consistent, and the adapter is genuine.
- Caveat 1: all bench metrics are n=1 (warmup=1, mad=0, p95==median) and `cached: true`, so the precise
  ratio is single-sample evidence; the ORDERING is robust but the exact 7.36x figure is soft.
- Caveat 2: peakMemory and targetWrites are not instrumented (n=0) on this cell, so the "lower memory"
  tiebreaker could not be evaluated — the decision rests purely on throughput/wall.
- Caveat 3: correctness is a true tie across the three passers; the winner is chosen entirely by the
  declared primaryMetric (throughputRealtime), which is the scenario's intended ranking axis (§9).
