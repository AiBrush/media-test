# remux/prop_adts_to_mp4_duration_invariant

family: remux | fixture asset: `fixtures/media/aac_adts.aac` (raw ADTS AAC, 164 KB) | primaryMetric: wall | passCount: 3 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (engineId `mediabunny`).
- **CONTESTED**: 3 engines PASS (ffmpeg-wasm, mediabunny, remotion-webcodecs), all satisfying the identical gating oracle `property-invariant[probe-duration]`.
- **Decisive factor: performance, on equal correctness.** All three pass the same single oracle, so the tie breaks on the wall-clock primaryMetric. mediabunny's remux completes in **6.655 ms** vs ffmpeg-wasm 16.855 ms (**2.53x faster**) and remotion-webcodecs 257.8 ms (**38.7x faster**). mediabunny is also tied with ffmpeg-wasm for the tightest duration delta (Δ 0.0043s) and far tighter than remotion-webcodecs (Δ 0.0380s, ~8.8x looser).
- **Margin over runner-up (ffmpeg-wasm):** 2.53x lower wall median. Longtasks are higher for mediabunny (1361 ms vs 1007 ms) but that is a coarse main-thread occupancy figure, not the primary metric, and the wall gap is decisive.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 6.655 ms | n/a (not in bench) | 0 (n=0, unmeasured) | 1361 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 16.855 ms | n/a | 27,843,887 bytes | 1007 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true | 257.80 ms | n/a | 0 (n=0, unmeasured) | 9925 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |

All three PASS rows have `cached: true` (reused, not freshly re-run this session). No `throughputRealtime` metric is present in any bench block for this scenario.

## Why the winner wins (deep technical)

**The operation.** This is the honest audio analogue of the decode-remux invariant. The input is raw ADTS AAC (`aac_adts.aac`): a bare sequence of ADTS frames with no container and therefore **no global duration header**. The only ground truth for duration is `frameCount × 1024 / sampleRate`. The golden meta (`fixtures/golden/aac_adts.aac.meta.json`) records `durationSec = 10.031`, `sampleRate = 48000`, 2 channels, AAC. The golden packet table (`fixtures/golden/aac_adts.aac.packets.json`) shows AAC access units at PTS steps of exactly **21333 µs = 1024/48000 s**, confirming 1024-sample frames at 48 kHz. A correct ADTS→MP4 remux must scan the elementary stream, count frames, and **materialize a precise `mvhd`/`mdhd` duration** in the output `.m4a`; the gate then re-probes that output and compares it to the golden.

**mediabunny's path.** The adapter's `remux()` (`src/engines/mediabunny/adapter.ts:1244`) takes the non-fastStart branch: it builds an MP4 `OutputFormat` (`makeOutputFormat`, line 1250), opens the ADTS input with `openInput` (ADTS is recognized via the container alias at `src/engines/mediabunny/adapter.ts:291`, `n.includes('adts') || n.includes('aac') -> 'adts'`), constructs an `Output` with an instrumented `BufferTarget` (line 1254-1255), and runs the real library Conversion via `runConversion` -> `mb.Conversion.init` / `conversion.execute()` (`src/engines/mediabunny/adapter.ts:848,855`). The Conversion is a genuine read->mux pipeline that consumes the ADTS access units and writes them into MP4 sample tables, deriving the `mvhd` timescale/duration from the counted AAC frames. The re-probed output reports `outDurationSec = 10.026666...` = exactly `470 × 1024 / 48000`, i.e. mediabunny counted 470 frames and emitted a sample-accurate MP4 duration. The oracle measures Δ = |10.02667 − 10.031| = **0.004333 s**, well inside the loose-container tolerance `1.50465 s` (`property-invariant[probe-duration]`, `probeDurationInvariant` at `src/core/oracles.ts:3823`).

**Why it is fastest.** mediabunny ran on the `webcodecs` backend with `hwAccel: prefer-hardware`, `wasmThreads: 0`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false` (env.configUsed). Critically, for a pure remux of an *already-compressed* AAC elementary stream there is **no decode/encode** — it is a packet copy plus container assembly. mediabunny does this with a native-TS streaming muxer (`coreBuild: pure-ts-esm`), so the only work is parsing ADTS headers and writing `stbl`/`mvhd` boxes: **6.655 ms** wall. ffmpeg-wasm must boot/route through the wasm core to do the same copy-mux, costing 16.855 ms and 27.8 MB peak heap. remotion-webcodecs routes through its full convert pipeline (`pipeline: streaming-backpressure`, `writer: bufferWriter`, convert on main thread) — 257.8 ms wall and 9925 ms of longtasks — heavyweight for what is fundamentally a remux. mediabunny needs no COOP/COEP and no SharedArrayBuffer, a deployment-friendliness tiebreaker on top of the raw speed win.

**Correctness comparison among PASS engines.** ffmpeg-wasm matches mediabunny's duration delta exactly (Δ 0.0043s) — both materialize the same 470-frame duration — but loses on wall time. remotion-webcodecs passes but with a looser delta (Δ 0.0380s ≈ 1.8 AAC frames of drift), indicating slightly less precise duration materialization, and is dramatically slower. So mediabunny wins on both axes (tied-best correctness, best performance).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** Correct and identically precise (Δ 0.0043s) but 16.855 ms wall = 2.53x slower than mediabunny, and carries a 27.8 MB peak heap from the wasm core for a trivial packet-copy remux. Lower longtasks (1007 ms) does not overcome the primary-metric (wall) gap.
- **remotion-webcodecs@4.0.479 (PASS, lost on perf + precision):** Slowest by far at 257.8 ms (38.7x slower) with 9925 ms longtasks, and the loosest duration delta of the three (Δ 0.0380s vs 0.0043s). Routes a remux through the full convert/backpressure pipeline on the main thread.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — the raw WebCodecs platform engine is decode/encode only; it has no container muxer for ADTS→MP4.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — media-parser is a read/parse-only library, no mux/output path.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — web-demuxer demultiplexes only; it does not write containers.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'adts'". Honest and correct — MP4Box.js parses/segments ISOBMFF; it cannot ingest a raw ADTS elementary stream as input, so it cannot perform this remux.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/metamorphic.ts:79` (`id: 'prop_adts_to_mp4_duration_invariant'`, `invariant: PROBE_DUR`, `input: 'aac_adts.aac'`, `from: 'adts'`, `to: 'mp4'`, `audioCodecs: ['aac']`). Notes explicitly state raw ADTS has no duration header and the output `.m4a` must carry an accurate `frameCount×1024/SR` duration.
- **Fixture exists and is real:** `fixtures/media/aac_adts.aac`, 164 KB — a real raw ADTS AAC file, not synthetic/empty/mock. Golden meta `fixtures/golden/aac_adts.aac.meta.json` (durationSec 10.031, 48 kHz stereo AAC) and golden packets `fixtures/golden/aac_adts.aac.packets.json` (PTS steps of 21333 µs = 1024/48000 s) are physically self-consistent.
- **Winner adapter genuinely implements the op:** `src/engines/mediabunny/adapter.ts:1244` (`remux`) -> `runConversion` -> `mb.Conversion.init` / `conversion.execute()` (`src/engines/mediabunny/adapter.ts:848,855`). It calls the real mediabunny Conversion API with a real `Output`/`BufferTarget`; it does NOT return canned bytes, copy input to output verbatim, or short-circuit to the golden. The measured `outDurationSec = 10.02667` = exactly `470 × 1024 / 48000` is a derived, frame-counted value, not a copy of the golden 10.031 — proving real materialization (it differs from the golden by 0.0043s).
- **Oracle is meaningful, not trivially satisfiable:** `probeDurationInvariant` at `src/core/oracles.ts:3823` re-probes the produced output and compares `metadata.durationSec` against the golden duration with an absolute tolerance. The 1.50465 s loose band is generous, but the measured delta (0.0043s) is ~350x tighter than the band, and the value being a precise frame-count product confirms genuine duration synthesis rather than a wide-tolerance pass-anything gate. This is a single property-invariant oracle (no bit-exact PCM gate), so the correctness floor is structural-metadata, not crypto/bit-exact.
- **Cached note:** all three PASS rows have `cached: true` ("cached previous PASS result"). Evidence is reused from a prior run, so there is mild staleness risk, but the cached measurements are internally consistent and physically plausible.

**Verdict: WEAK-GATE.** The fixture is real, the winner's implementation is a genuine library Conversion, and the measurements are physically exact (470-frame duration), so the PASS is real — but the single gating oracle is a duration property-invariant with a very wide loose tolerance (1.5s) and no bit-exact / PCM-sample comparison of the remuxed audio. The PASS is correct but the gate is a metadata-property proxy rather than a strong audio-fidelity check.

## Confidence & caveats

- **Confidence: high** for the winner pick. The decisive factor (2.53x wall margin on identical-correctness, equal-tightest duration delta) is unambiguous.
- Caveats: (1) all results are `cached`, so they were not re-run this session. (2) Wall samples are `n=1` (single sample, mad=0), so the speed comparison is single-shot evidence — directionally strong (mediabunny 6.655 vs 16.855 vs 257.8 ms is a large gap) but low statistical depth. (3) peakMemory is unmeasured (n=0) for mediabunny and remotion-webcodecs, so the memory axis cannot be compared; only ffmpeg-wasm reports 27.8 MB. (4) `throughputRealtime` is absent for this scenario. (5) The gate is duration-only (WEAK-GATE) — it does not verify the remuxed AAC samples are bit-identical, only that the output duration is accurate.
