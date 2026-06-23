# mux/size_micro_1frame_to_mkv

**Family:** mux | **Fixture asset:** `micro_h264_1frame.mp4` (single-frame H.264, 320x240, 1 fps, 1 s, ~5.5 KB) → mux to **MKV (Matroska)** | **primaryMetric:** throughputRealtime | **passCount:** 2 / 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **Contested:** YES — two engines PASS (`ffmpeg-wasm`, `mediabunny`), each satisfying the identical single gating oracle (`property-invariant` / probe-duration) with byte-identical results (Δ 0.0000 s ≤ 0.0417 s). Correctness is a dead tie, so the decision falls to PERFORMANCE.
- **Decisive factor:** wall median and throughputRealtime. ffmpeg-wasm muxed in **9.375 ms** vs mediabunny's **28.245 ms** — a **3.01x faster wall** (and equivalently **3.01x higher throughputRealtime**, 106.67x vs 35.40x realtime).
- **Margin over runner-up:** 3.01x wall / 3.01x throughput. Counter-signal: ffmpeg-wasm's `longtasks` is **3045 ms** vs mediabunny's **626 ms** (4.86x worse main-thread blocking from the single-thread wasm core), and both samples are **n=1, mad=0** (single observation — weak statistical evidence; see caveats).

## Per-engine results

| Engine | Status | Oracles passed (name:pass) | Wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | Reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 9.375 | 106.667 | 0 (n=0) | 3045 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 28.245 | 35.404 | 0 (n=0) | 626 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

(peakMemory and targetWrites have n=0 samples for both PASS engines — not measured in this run, so they cannot break the tie.)

## Why the winner wins (deep technical)

**The operation.** This is a true *mux*, not a remux/transcode: the runner first demuxes `micro_h264_1frame.mp4` to obtain one `EncodedTrack` (a single keyframe AVCC chunk), then calls `engine.mux(tracks, {container:'mkv'})`. The coded H.264 sample is copied verbatim; only the Matroska container, a single Cluster, and a single SimpleBlock are authored. The scenario notes (`src/scenarios/mux/size-ladder.ts:56-58`) call this the "off-by-one rung on the Matroska writer" — a 1-SimpleBlock / single-Cluster file is exactly where a muxer that mishandles the trivial block-group or cue list breaks. Both PASS engines author the single SimpleBlock correctly: duration survives the MP4→MKV container change (1 s in, 1 s out), which is precisely what the gate measures.

**Correctness is a tie.** The only attached oracle is `property-invariant` with the `probe(mux(x)).dur≈probe(x).dur` invariant (selected in `_shared.ts:200` via `muxOptions`, default oracle set in `_shared.ts:183-195`). The shard shows both engines returning `outDurationSec:1, goldenDurationSec:1, deltaSec:0, durationToleranceSec:0.041666…` — i.e. Δ exactly 0 against a ±1-frame (1/24 s) band (`oracles.ts:2745-2758`). Reference-reimport is deliberately *not* attached for an MKV target: `_shared.ts:111` / `defaultOracles` (`:188`) restrict packet-count gating to `FAITHFUL_REIMPORT_TARGETS = {mp4, mov}` because MP4→MKV legitimately re-laces AVCC NALs into SimpleBlock framing and would false-fail a correct mux. So neither engine earns any structural or bit-exact credit here — both clear the same single duration-proxy gate. Per the correctness ladder, probe-duration is a *property-invariant proxy* tier (weaker than bit-exact/structural), and both pass it identically. Correctness cannot rank them.

**Performance decides — ffmpeg-wasm.** ffmpeg-wasm's `mux()` (`src/engines/ffmpeg-wasm/adapter.ts:2899`) materializes the single demuxed track as an elementary H.264 Annex-B stream (`buildElementaryStream`, bitstream reconstruction block at `:491-493`), then runs a stream-copy mux: `-i <es> -map 0 -c copy -avoid_negative_ts make_zero <out>.mkv` (`:2924-2942`). For a 1-frame, ~5.5 KB input this is a near-trivial container author inside the already-warm wasm core — measured **9.375 ms** wall, **106.67x realtime**. mediabunny's `mux()` (`src/engines/mediabunny/adapter.ts:1508`) builds a pure-TS Matroska `Output` with an `EncodedVideoPacketSource` (`:1528-1535`), starts the output, pushes the single `EncodedPacket` carrying the decoderConfig/description on packet 0 (`:1562-1591`), and finalizes (`:1598`). That is also a genuine, well-formed write, but the TS object construction + `output.start()`/`finalize()` round-trips cost **28.245 ms** — 3.01x slower. Since throughputRealtime is the per-case ranking metric (`size-ladder.ts:16`, output-seconds per wall-second), ffmpeg-wasm's 106.67x to mediabunny's 35.40x is the decisive 3.01x margin.

**Why the margin is suggestive but not conclusive.** This is a micro file: 9.375 ms vs 28.245 ms is ~19 ms of absolute difference dominated by fixed per-call overhead (mediabunny's TS allocation vs ffmpeg's MEMFS write + arg parse), not sustained-throughput behavior. The size-ladder's *intended* throughput signal lives on the large/long rungs (`size-ladder.ts:71-111`), which are NA/golden-absent today. ffmpeg-wasm also pays for it elsewhere: its `longtasks` of **3045 ms** (vs mediabunny's **626 ms**) reflects the single-thread wasm core (`wasmThreads:0`, no SharedArrayBuffer) blocking the main thread far longer — relevant for responsiveness even though it is not the ranking metric here.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (same probe-duration gate, Δ 0.0000 s), but LOST on performance: 28.245 ms wall (3.01x slower) and 35.40x throughput (0.33x of the winner). Its only advantage is far lower main-thread blocking (longtasks 626 ms vs 3045 ms), but that is not the primary metric. Honest, correct mux — just slower for this micro author.
- **mp4box@2.3.0** — NA_ENGINE, "does not declare output container 'mkv'". Honest: its capabilities declare `mux:true` but `containersOut:['mp4']` (`src/engines/mp4box/adapter.ts:639-647`). MP4Box.js is an ISO-BMFF-only writer with no Matroska muxer, so it genuinely cannot emit MKV. Correct NA, not an under-declaration.
- **web-demuxer@4.0.0** — NA_ENGINE, "does not declare operation 'mux'". Honest: the adapter is a probe/demux/seek-only WASM parser and explicitly "does NOT … mux, remux, transcode" (`src/engines/web-demuxer/adapter.ts:7-8`). No muxing code exists. Correct NA.
- **platform@chrome-149** — NA_ENGINE, "does not declare operation 'mux'". The bare WebCodecs/browser surface exposes decode/encode but no container muxer; no canned mux path. Honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "does not declare operation 'mux'". A read-only parser; no writer. Honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "does not declare operation 'mux'". Transcode/convert-oriented; does not expose the raw `mux(tracks,{container})` op the runner requires. Honest NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/mux/size-ladder.ts:50-59` (id `size_micro_1frame_to_mkv`), built via `buildMux` in `src/scenarios/mux/_shared.ts:204`.
- **Fixture:** input `micro_h264_1frame.mp4` — REAL file present at `fixtures/media/micro_h264_1frame.mp4` (~5.5 KB, stat-confirmed). Golden meta `fixtures/golden/micro_h264_1frame.mp4.meta.json` confirms real media: container mp4, durationSec 1, one H.264 320x240 track @ 37992 bps. Not synthetic/empty/mock.
- **Oracle:** `property-invariant` probe-duration branch at `src/core/oracles.ts:2709-2758`. It does a REAL comparison: re-probes the authored output via the reference engine (`:2719-2728`), computes Δ vs the golden source duration, and fails if Δ exceeds a container-aware tolerance (1/24 s here). Measurements (out 1 s, golden 1 s, Δ 0) are physically plausible for a 1 s clip. The PASS is genuine, BUT this is a single proxy gate — duration-invariance only, no bit-exact frame digest, no packet-count, no Matroska box-layout check (decode-mux frame goldens are placeholders; reference-reimport intentionally excluded for the reframing MKV target). A muxer that wrote a structurally-odd-but-1-second MKV could still pass.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2899-2947` — genuine elementary-stream build + `-c copy` mux into `.mkv` via the vendored ffmpeg.wasm core; no canned output, no input→output copy short-circuit, no golden short-circuit, errors propagate (run throws). Real implementation.
- **Cached note:** BOTH PASS results have `cached==true` ("cached previous PASS result"). The numbers were reused, not re-run this session — staleness risk: if the adapter or core changed since the cache, the timings/verdict may be stale. The MEMORY launcher-seeding caveat applies (stale PASS reuse). The relative ordering is plausible (wasm stream-copy of a tiny file beating TS object construction), so the verdict stands, but the exact 3.01x margin should be treated as cached evidence.
- **Verdict: WEAK-GATE.** Real fixture + real ffmpeg.wasm implementation + a real-but-loose single proxy oracle (duration-invariance only). The PASS is real; it just is not a strong correctness signal (no bit-exact/structural Matroska gate), and the winner is decided purely on a micro-file performance margin from cached n=1 samples.

## Confidence & caveats

- **Confidence: medium.** Winner selection is clear (only ffmpeg-wasm and mediabunny eligible; ffmpeg-wasm strictly faster on the primary metric), but the evidence is soft: single gating oracle (proxy), `n==1` / `mad==0` for both engines, peakMemory/targetWrites unmeasured (n=0), and both results cached.
- The performance margin (3.01x) is dominated by fixed per-call overhead on a ~5.5 KB / 1-frame input — not the sustained-throughput behavior the size-ladder is designed to expose; the large/long rungs that would stress co64 / cue-density are NA today.
- ffmpeg-wasm wins the ranking metric but is 4.86x worse on longtasks (3045 ms vs 626 ms) due to single-thread wasm — a real responsiveness tradeoff not captured by throughputRealtime.
- All five NA_ENGINE verdicts are honest (capability/container genuinely undeclared and unimplemented), not under-declarations.
