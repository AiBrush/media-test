# mux/size_tiny_360p_to_mp4

family: mux | fixture asset: `fixtures/media/tiny_h264_360p_2s.mp4` (173 KB, real) | primaryMetric: `wall` (default = MUX_METRICS[0]) | passCount: 3 / 7

## Verdict

- **Best framework: mp4box@2.3.0** (engineId `mp4box`).
- **CONTESTED**: 3 engines PASS (mp4box, ffmpeg.wasm, mediabunny), and all three pass the *identical* oracle set with *identical* measurements (155 packets / 96 keyframes on reference-reimport; probe-duration Δ 0.0213 s ≤ 0.0417 s). Correctness is therefore a dead heat — the winner is decided by **performance**.
- **Decisive factor**: the scenario sets no explicit `primaryMetric`, so the ranking metric defaults to `metrics[0]` = `wall` (see `src/scenarios/mux/_shared.ts:84` MUX_METRICS, `src/core/scenario.ts:166-170`). On wall median, mp4box is fastest: **13.74 ms** vs ffmpeg.wasm 16.81 ms (mp4box **1.22x faster**) and mediabunny 17.81 ms (**1.30x faster**).
- **Caveat on the margin**: all three are `n==1` single-sample benches (mad=0, p95=median), so the wall ordering is weak evidence. On the family's *intended* axis (`throughputRealtime`, per the size-ladder header) mp4box also leads: 145.56x vs 118.94x (1.22x) vs 112.26x (1.30x). The only metric where mp4box loses is `longtasks` (874 ms — by far the worst; mediabunny 173 ms, ffmpeg 2095 ms), reflecting mp4box's synchronous whole-file pure-JS box authoring on the main thread.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | reference-reimport:true; property-invariant:true | 13.74 | 145.56 | 31,367,250 | 874 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true; property-invariant:true | 16.81 | 118.94 | 0 (n=0) | 2095 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true; property-invariant:true | 17.81 | 112.26 | 0 (n=0) | 173 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is a pure container author/repack: the runner demuxes `tiny_h264_360p_2s.mp4` (H.264 video 640x360@30fps + AAC-LC stereo 48 kHz, 2 s, ISO-BMFF/AVCC framing) into EncodedTracks, then calls `engine.mux(tracks, {container:'mp4'})`. No re-encode happens — coded samples are copied verbatim and only the moov/sample-table (stts/stsz/stco/stsc) and codec-private boxes (avcC/esds) are rewritten. Because the source is ISO-BMFF and the target is mp4, `_shared.ts:111` FAITHFUL_REIMPORT_TARGETS includes mp4, so the source-keyed golden (155 packets / 96 keyframes) is a valid packet reference and `reference-reimport` is attached alongside the always-on `property-invariant:probe-duration`.

mp4box wins on speed mechanistically because it authors the MP4 with a tight, fully synchronous pure-JS box writer and a single in-memory buffer flush. Its mux path (`src/engines/mp4box/adapter.ts:971-1052`) calls `MP4Box.createFile(true)` + `out.init({brands:['isom','iso6','mp41'], timescale:1000})`, then `out.addTrack(...)` once per track and a tight `out.addSample(trackId, copyBytes(chunk.data), {duration, cts, dts, is_sync})` loop (`:1036-1041`), finishing with one `streamToBytes(out.getBuffer())` (`:1045`). The config used was `backend:pure-js, worker:false, pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"` — no WebCodecs round-trip, no async source.add per packet, no wasm boundary. For only ~155 samples that synchronous tabular write is the cheapest possible path: 13.74 ms wall / 145.56x realtime. The cost shows up as a single 874 ms long task (everything runs in one blocking turn), which does not affect the wall/throughput ranking but is the engine's weak spot.

mediabunny (the runner-up on longtasks, 3rd on wall) is mechanistically heavier here even though it is also a real muxer: its mux (`src/engines/mediabunny/adapter.ts:1508-1600`) builds a `mb.Output`, creates an `EncodedVideoPacketSource`/`EncodedAudioPacketSource`, then `await output.start()` and an `await source.add(pkt, meta)` per packet (`:1591`) before `await output.finalize()`. Each packet is wrapped in a `mb.EncodedPacket` and pushed through an async streaming-lockstep pipeline (`configUsed.pipeline:"streaming-lockstep"`). That per-packet awaited add is correct and keeps long tasks tiny (173 ms — best of the three, because work is yielded across microtasks) but adds promise/scheduling overhead that makes the *wall* number (17.81 ms) the slowest of the trio. ffmpeg.wasm sits in the middle on wall (16.81 ms) but is worst on longtasks (2095 ms): it pays the wasm/FS marshalling cost and runs the libavformat muxer synchronously in one giant blocking task.

The oracle evidence is identical and strong for all three: `reference-reimport` re-imports each engine's output through the reference engine and gets exactly 155 packets / 96 keyframes — bit-for-bit matching the baked golden (`fixtures/golden/tiny_h264_360p_2s.mp4.packets.json` = 155 packets, 96 keyframes), so no engine dropped, duplicated, or mislabeled a sample. `property-invariant:probe-duration` re-probes each output and measures 2.0213 s vs golden 2.0 s (Δ 0.0213 s within the ±1-frame@24fps tolerance 0.0417 s) — the small positive tail is the expected AAC-frame/sample-table rounding of a faithful repack, not drift. Since correctness, packet counts, keyframe counts, and duration are byte-identical across the three PASS engines, performance is the only differentiator, and mp4box leads on the default primary metric (wall) and on the size-ladder's intended throughputRealtime.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed correctness identically (155/96, Δ0.0213s) but lost on perf: wall 16.81 ms (mp4box 1.22x faster), throughputRealtime 118.94x (mp4box 1.22x higher), and the worst longtasks of all (2095 ms) from synchronous wasm-side libavformat muxing + FS marshalling. peakMemory not captured (n=0).
- **mediabunny@1.48.0** — PASSed correctness identically (155/96, Δ0.0213s); slowest wall (17.81 ms, mp4box 1.30x faster) and lowest throughput (112.26x) because its streaming-lockstep `await source.add` per packet adds async scheduling overhead. It does win longtasks (173 ms), but that is not the primary metric. peakMemory n=0.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — the WebCodecs platform adapter exposes decode/encode but no container muxer; there is no built-in browser MP4 writer to under-declare.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'mux'. Honest — it is a WebCodecs transcode/decode wrapper, not a container author.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'mux'. Honest — the name and library scope are demux-only; muxing is genuinely out of scope.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'mux'. Honest — it is a read-only parser, structurally incapable of writing a container.

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/mux/size-ladder.ts:60-69` (`id: 'size_tiny_360p_to_mp4'`), built via `buildMux` in `src/scenarios/mux/_shared.ts:204-229`. op='mux', target mp4, requires demux+mux, oracles = reference-reimport + property-invariant (probe-duration).
- **Fixture**: `input: 'tiny_h264_360p_2s.mp4'` resolves to `fixtures/media/tiny_h264_360p_2s.mp4` — REAL file, 173 KB, exists on disk (stat confirmed). Goldens exist: `fixtures/golden/tiny_h264_360p_2s.mp4.{meta,packets}.json` (meta = h264 640x360@30 + aac 48k stereo, 2 s; packets = 155 / 96 keyframes). Not synthetic/mock/empty.
- **Winner adapter**: `src/engines/mp4box/adapter.ts:971-1052`. Genuine implementation — calls the real MP4Box.js (`MP4Box.createFile`, `out.init`, `out.addTrack`, `out.addSample` per chunk at `:1036`, `out.getBuffer()` at `:1045`). It does NOT copy input bytes to output, does NOT short-circuit to the golden, and guards against fakes: empty output throws (`:1046`), and external (non-mp4box-prepared) tracks throw NotApplicableError (`:980-985`). Errors surface as throws, not swallowed-as-success.
- **Oracles**: `src/core/oracles.ts:1225-1271` (referenceReimport) re-imports the engine's actual output bytes through the reference engine and diffs packet/keyframe counts against the baked golden with a tight `withinRel(...,0.02,1)` count gate + exact-ish keyframe gate — a real round-trip comparison, not trivially satisfiable. `property-invariant:probe-duration` (`oracles.ts:2630+`, tolerance `1/24 ≈ 0.0417 s` from line 159) re-probes output duration vs golden — measured Δ 0.0213 s is physically plausible repack rounding. Measurements (155 packets, 96 keyframes, 2.0213 s) are all physically plausible for this real 2 s H.264+AAC clip.
- **Cached note**: all three PASS results have `cached:true` ("cached previous PASS result"). The PASS and the oracle measurements are reused, not re-run this session — staleness risk exists if the adapter/fixture changed since the cached run, but the cached numbers are internally consistent and match the on-disk golden, so confidence remains high.
- **Verdict: REAL** — real fixture + real MP4Box muxer implementation + meaningful round-trip + duration oracles with plausible numbers.

## Confidence & caveats

- Confidence: **high** on the winner (real fixture, real implementation, real oracle, golden-matched measurements). 
- Caveats: (1) the contest margin rests on `n==1` benches (mad=0) so wall/throughput ordering is low-precision; mp4box's lead (1.22–1.30x) is modest and could invert on re-runs. (2) The decisive metric is the *default* `wall` (this tiny case sets no explicit primaryMetric); on `longtasks` mediabunny would win, and on `peakMemory` only mp4box reported a value (31.4 MB) while ffmpeg/mediabunny captured n=0. (3) All winners are cached — a fresh re-run is advisable before treating the leaderboard cell as final.
