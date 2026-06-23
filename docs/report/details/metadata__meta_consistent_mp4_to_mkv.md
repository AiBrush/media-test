# metadata/meta_consistent_mp4_to_mkv

- **Family:** metadata
- **Fixture asset(s):** `fixtures/media/h264_1080p_30s.mp4` (H.264 1080p video + AAC audio, ~31 MB, 30 s; exists on disk)
- **Operation:** `remux` MP4 -> MKV (Matroska), then cross-container probe-duration consistency check
- **Primary metric / oracle:** `property-invariant` (invariant = probe-duration; `durationToleranceSec` = 0.1)
- **passCount:** 2 of 7 (ffmpeg.wasm, mediabunny)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES — two engines PASS (ffmpeg.wasm and mediabunny), both satisfying the same single `property-invariant` oracle.
- **Decisive factor:** PERFORMANCE. Correctness is a tie (identical oracle, both inside the 0.1 s band). ffmpeg.wasm wins on wall time and on tighter duration fidelity.
- **Margin over runner-up (mediabunny):** wall median 218.14 ms vs 386.41 ms = **1.77x faster**; longtasks 3045 ms vs 4410 ms = **1.45x less main-thread blocking**; duration delta 0.0420 s vs 0.0800 s = **~1.9x tighter** match to the 30.000 s golden. (Both n=1, mad=0; peakMemory not sampled (n=0) for either.)

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 218.14 ms | n/a (not sampled) | 0 (n=0) | 3045 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 386.41 ms | n/a (not sampled) | 0 (n=0) | 4410 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

## Why the winner wins (deep technical)

The operation is a **lossless container rewrap** of an H.264 (video) + AAC (audio) elementary-stream pair out of the ISO-BMFF (MP4) box structure and into the Matroska/EBML (MKV) cluster structure. No pixel or PCM transcode is required or wanted — the coded samples must move byte-for-byte, only the wrapper changes. The gate is metamorphic: `probe(remux(x)).dur ≈ probe(x).dur`. Because MP4's `mvhd`/`mdhd` timescale-based duration and MKV's `SegmentDuration` (TimecodeScale-based, default 1 ms) round differently, the scenario deliberately opens a 100 ms band (`tolerances.durationToleranceSec: 0.1`, `write-roundtrip.ts:164`) to absorb block-rounding while still catching any gross drift, dropped tail block, or accidental re-encode.

ffmpeg.wasm performs this as a true stream copy. `remux()` (`src/engines/ffmpeg-wasm/adapter.ts:2031`) builds `[...inputOptions, '-i', <in>, '-map', '0', '-c', 'copy', <out.mkv>]` (`adapter.ts:2044`). `-map 0` forwards every input stream (so the AAC track is not dropped by ffmpeg's default one-stream-per-type selection), and `-c copy` means the H.264 NAL units and AAC frames are demuxed from `moov`/`mdat` and re-laddered into Matroska clusters without going through any decoder/encoder. There is a pre-flight `assertRemuxContainerCompatible(inputMetadata.tracks, opts.container)` (`adapter.ts:2040`) that verifies H.264+AAC are legal Matroska payloads before muxing. Stream copy is why ffmpeg's wall is only **218.14 ms** and its measured output duration is **30.042 s** (Δ 0.0420 s) — essentially the native libavformat MP4 demux -> MKV mux round-trip, the leanest possible path, no WebCodecs/canvas involvement.

mediabunny also PASSes and is genuinely correct, but it routes the remux through its `Conversion` pipeline. `remux()` (`src/engines/mediabunny/adapter.ts:1244`) calls `makeOutputFormat('mkv', ...)` which returns a real `new MkvOutputFormat(...)` (`src/engines/mediabunny/codecs.ts:168-169`, `mkv: MATROSKA`), then `runConversion()` (`adapter.ts:842`) does `Conversion.init` + `conversion.execute()`. Per `env.configUsed`, mediabunny ran with `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`. Mediabunny's Conversion will stream-copy compatible tracks (so no full re-encode here), but the conversion-engine bookkeeping (track discovery, sample-table walk, lockstep queueing, canvas pool init even when unused) adds overhead: wall **386.41 ms** (1.77x slower) and longtasks **4410 ms** (1.45x more blocking). Its output duration is **30.080 s** (Δ 0.0800 s) — still inside the band but a coarser Matroska TimecodeScale rounding than ffmpeg's. So mediabunny is a legitimate, correct runner-up that simply costs more main-thread time and lands further from the 30.000 s golden.

Both passed the identical oracle, so the correctness ladder does not separate them (both are property-invariant / metadata-exact at the same strictness). The tiebreaker is squarely (b) PERFORMANCE, and ffmpeg sweeps every sampled axis. Note the evidence is **n=1** for both — a single warm sample with mad=0 — so the 1.77x wall margin is directional, not statistically tight; but it is corroborated by the longtasks gap and the tighter duration delta, and a 1.77x gap is well outside single-sample noise for a 30 s file.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on perf): correct remux via real `MkvOutputFormat`+`Conversion`, but 386.41 ms wall (1.77x slower than ffmpeg's 218.14 ms), 4410 ms longtasks (1.45x more blocking), and Δ 0.0800 s duration (1.9x looser than ffmpeg's 0.0420 s). No correctness defect — purely the heavier Conversion pipeline.
- **platform@chrome-149** (NA_ENGINE): "engine does not declare operation 'remux'". Honest NA — the WebCodecs platform shim exposes decode/encode primitives, not a container remuxer; there is no MKV muxer in the platform path.
- **web-demuxer@4.0.0** (NA_ENGINE): "engine does not declare operation 'remux'". Honest NA — web-demuxer is a demux-only (read side) library; it does not author output containers.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "engine does not declare operation 'remux'". Honest NA — media-parser is a parse/probe-only reader, not a muxer.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare output container 'mkv'". Honest NA — MP4Box.js writes ISO-BMFF (MP4/MOV/fMP4) only; it has no Matroska/EBML muxer, so MKV output is genuinely out of scope.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): "engine does not declare output container 'mkv'". Honest NA — its WebCodecs-based muxing targets MP4/WebM; plain MKV is not in its declared `containersOut`, so the capability gate correctly excludes it rather than producing a fake pass.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/metadata/write-roundtrip.ts:155-172` (case `meta_consistent_mp4_to_mkv`, `input: 'h264_1080p_30s.mp4'`, `from: 'mp4'`, `to: 'mkv'`, `invariant: PROBE_DUR`, `tolerances.durationToleranceSec: 0.1`). Notes (`:165-171`) describe the A.16 cross-container metadata-consistency rationale and explicitly disclose the oracle gap (no tag-readback oracle; duration is the readable proxy).
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` — REAL file, `stat` shows 31 MB on disk. Not synthetic/empty/mock.
- **Oracle:** `src/core/oracles.ts:2645` (`propertyInvariant`); the cross-container probe-duration branch runs at `:2709-2758`. It re-probes the engine's actual output bytes via `ctx.referenceEngine.probe(...)` (`:2721`) and compares against the golden source duration with `Math.abs(outDur - goldenDur)` (`:2730`). Measurements in the shard are physically plausible: golden 30.000 s, ffmpeg out 30.042 s, mediabunny out 30.080 s — both small positive deltas consistent with Matroska block-duration rounding on a 30 s clip. The 0.1 s band is scenario-explicit and not so wide that anything passes (a re-encode/dropped-tail would drift well past 100 ms).
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — genuine `-map 0 -c copy` stream copy through the real ffmpeg.wasm worker (`this.run(args)` at `:2063`, output read back via `readBinary` at `:2064`). No canned bytes, no input->output passthrough fake, no short-circuit to the golden, no error swallowing (errors propagate from `this.run`). MKV is a declared `containersOut` (`adapter.ts:1495` region).
- **Cached note:** ffmpeg.wasm's result has `cached: true` ("cached previous PASS result", durationMs 4996, startedAt 2026-06-22T14:01:19Z); mediabunny likewise `cached: true` (startedAt 2026-06-22T16:56:40Z). Both are reused, not freshly re-run this batch. Per the launcher seeding caveat, cached PASS reuse carries mild staleness risk, but the adapters and oracle inspected here are real and the measurements are consistent.
- **Verdict:** **REAL** — real 31 MB H.264/AAC MP4 fixture, genuine stream-copy remux to a real Matroska muxer, and a meaningful reference-engine duration comparison with a justified 100 ms band.

## Confidence & caveats

- **Confidence: HIGH** on the winner pick. Both correctness (tie) and the perf decision are grounded in real shard numbers and verified adapter code.
- The single gating oracle is a **duration proxy**, not a full tag-set / box-layout equality — the scenario notes openly acknowledge a missing tag-readback oracle. So the PASS proves "no gross duration drift across containers," not "every semantic tag survived the MP4->MKV rewrap." This is a known oracle gap, not a cheat.
- Benchmarks are **n=1, mad=0** for both engines; peakMemory and throughputRealtime were not sampled (n=0 / absent). The 1.77x wall margin is directional and corroborated by longtasks + duration delta, but not statistically tight.
- Both winners are **cached** — a fresh re-run could shift the absolute wall numbers (though not the relative ordering, given the architectural gap: native stream copy vs Conversion pipeline).
