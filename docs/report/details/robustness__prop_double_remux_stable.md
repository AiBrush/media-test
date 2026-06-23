# robustness/prop_double_remux_stable

- **family:** robustness
- **fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (real 31 MB H.264 1080p + AAC MP4)
- **operation:** `remux` (MP4 -> MP4 lossless container copy), invariant `remux(remux(x)) == remux(x)`
- **primaryMetric:** wall (metrics declared: `wall`, `peakMemory`)
- **passCount:** 1 of 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **uncontested** (exactly one PASS; the other 6 are NA_ENGINE).
- **Decisive factor:** It is the only engine that declares the `remux:compose` capability AND backs it with a real implementation that survives the metamorphic double-remux oracle. The oracle re-ran the remux a second time and found a **bit-for-bit stable packet table**: `firstPackets=2310`, `secondPackets=2310`, `measuredCount==expectedCount==2310`, `comparedTracks=2`, `maxPtsDriftUs=0`.
- **Margin over runner-up:** N/A — there is no second PASS to compare against. All six rivals were gated out before producing any output (no oracle outcomes), so there is no performance contest.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass | n/a (no bench block) | n/a | n/a | n/a | cached previous PASS result (durationMs=484) |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:compose' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:compose' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:compose' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Note: the shard carries no `bench{}` block for mediabunny (metrics were not materialized into the shard for this metamorphic case); only `durationMs=484` and `cached=true` are present. No throughput/memory/longtask numbers exist to report — leaving them invented would violate the "real values only" rule.

## Why the winner wins (deep technical)

**The operation and why stability is non-trivial.** The fixture is a 30 s 1080p H.264 video + AAC audio in a faststart MP4. A "remux" here is a lossless container rewrite: the coded H.264 NAL units and AAC access units are copied unchanged, but the MP4 box geometry (`moov`/`stbl` sample tables: `stsz` sizes, `stts`/`ctts` timing, `stss` sync-sample list, `stco`/`co64` chunk offsets) is regenerated from scratch. The metamorphic property `remux(remux(x)) == remux(x)` is a fixed-point test: a correct muxer must emit an output that, when fed back through itself, produces the **same packet table and metadata**. Engines that drift — re-deriving timestamps from float seconds, re-ordering B-frame DTS/PTS, recomputing edit lists, or shifting the keyframe map — fail on the second generation.

**Backend used.** From `env.configUsed`: `backend=webcodecs`, `pipeline=streaming-lockstep`, `coreBuild=pure-ts-esm`, `hwAccel=prefer-hardware`, `sharedArrayBuffer=false`, `coopCoep=not-required`, `wasmThreads=0`. Crucially, for a pure remux the codec path is never invoked — mediabunny's Conversion with no video/audio transform options copies encoded samples directly, so WebCodecs/hardware is irrelevant to correctness here; the determinism comes entirely from its TS muxer.

**The adapter code path.** `src/engines/mediabunny/adapter.ts:1244` `remux()`: for the default (no `fastStart:'reserve'`) path it builds an `OutputFormat` via `makeOutputFormat(opts.container, ...)` (line 1250), opens the source with `openInput` (1252), constructs an `Output` with a `BufferTarget` (1255), and runs `runConversion(...)` (1256). `runConversion` (`adapter.ts:842`) calls the **real library**: `mb.Conversion.init(opts)` (line 848), checks `conversion.isValid` and throws on discarded tracks (849-854), then `await conversion.execute()` (855). Because no `convOpts.video`/`convOpts.audio` transform blocks are supplied for a remux, the Conversion runs in pass-through (copy) mode — encoded packets are remuxed, not re-encoded. The capability `'remux:compose'` is explicitly declared at `adapter.ts:1075` with the comment "remux(remux(x)) is validated by the property-invariant oracle", and `mux:vfr-timestamps` (1076) preserves per-packet PTS/duration from the source — the mechanism that keeps `maxPtsDriftUs=0` across generations.

**The oracle and the measurements.** `doubleRemuxStableInvariant` (`src/core/oracles.ts:3438`) takes the first remux (`ctx.output`), feeds it back through the **candidate engine** (`ctx.engine.remux(firstInput, {container})`, line 3452), then demuxes BOTH generations with the reference engine (3460-3461) and compares them via `compareMediaMetadata` (3466, oracles.ts:889 — track count, per-track codec/dims, duration within band) and `comparePacketTables` (3472, oracles.ts:922 — exact packet count, trackIndex layout via `sameLayout`, and per-packet PTS/DTS drift, size, and keyframe-flag comparison within `seekToleranceUs`). The recorded outcome: `firstPackets=2310`, `secondPackets=2310`, `measuredCount=2310`, `expectedCount=2310`, `comparedTracks=2`, `maxPtsDriftUs=0`. 2310 packets across 2 tracks for a 30 s 1080p/AAC clip is physically plausible (≈900 video frames + ≈1400 AAC frames). Zero PTS drift and identical counts mean the muxer is a true fixed point — exactly what the §A.16 metamorphic gate demands.

## What each other framework did wrong

- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". The browser WebCodecs/Media platform adapter has no muxer/remux op at all; honest NA (Chrome exposes decoders/encoders, not an MP4 muxer).
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare feature 'remux:compose'". mp4box.js can rewrite MP4 boxes, but the adapter does not declare the composed/idempotent double-remux capability, so it was gated before running. Plausibly under-declared (mp4box could in principle do this), but it was not opted in, so the NA is honest within the suite's gating contract.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'remux:compose'". ffmpeg `-c copy` could remux, but the wasm adapter has not declared `remux:compose`; conservative under-declaration rather than a failure.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". A parser/demuxer only — no muxing/remux op exists; honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'remux:compose'". It has WebCodecs transcode paths but did not declare the composed-remux capability; honest within gating.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Demux-only library; no remux op; honest NA.

All six produced **no output and no oracle outcomes** — they were excluded at the capability-gate in the runner, not failed on correctness. None faked a pass.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:1046` (case `prop_double_remux_stable` in `METAMORPHIC_TODO_CASES`), registered into real scenarios at `index.ts:1135` (`metamorphicTodoScenarios`) and exported via `robustnessScenarios` (index.ts:1168). `op='remux'`, `input='h264_1080p_30s.mp4'`, `features:['remux:compose']`, `options.invariant='remux(remux(x))==remux(x)'`.
- **Fixture exists:** `fixtures/media/h264_1080p_30s.mp4` confirmed present, 31 MB — a real H.264/AAC MP4, not synthetic/empty/mock.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1244` (`remux`), `:842` (`runConversion` -> real `Conversion.init`/`execute`), capability declared at `:1075`. No canned output, no input->output copy, no golden short-circuit, no error swallowing (it throws on invalid/discarded tracks).
- **Oracle:** `src/core/oracles.ts:3438` (`doubleRemuxStableInvariant`), reached via dispatcher `oracles.ts:2670`. It performs a genuine second remux through the candidate and a strict structural comparison (exact packet count + layout + per-packet PTS/DTS/size/keyframe drift via `comparePacketTables`, oracles.ts:922, plus metadata via compareMediaMetadata, oracles.ts:889). This is a structural/metadata-exact gate, not a smoke or wide-tolerance proxy; measurements (2310/2310, drift 0) are physically plausible.
- **Cached note:** mediabunny's result has `cached:true` ("cached previous PASS result", durationMs=484). The PASS evidence was reused, not freshly re-run in this batch — there is a known launcher staleness caveat in this suite. The cached payload is internally consistent (full measurements present), so confidence stays high, but a fresh re-run would remove the staleness asterisk.
- **Verdict:** **REAL** — real 31 MB fixture, real mediabunny Conversion remux invoked twice, and a strict packet-table/metadata fixed-point oracle that cannot be trivially satisfied.

## Confidence & caveats

- **Confidence: high.** Real fixture, genuine library calls, strict structural oracle, and physically plausible measurements (exact 2310-packet match, zero drift).
- **Caveats:** (1) Winner result is `cached:true`; evidence is reused, so a fresh run is advisable to eliminate staleness risk. (2) No `bench{}` block exists for this scenario in the shard, so no wall/throughput/memory numbers can be reported. (3) Uncontested win — strength is bounded by the fact that 6 engines simply did not opt into `remux:compose`; mp4box/ffmpeg.wasm in particular could plausibly implement this, so the NAs reflect declaration gating rather than proven incapability.
