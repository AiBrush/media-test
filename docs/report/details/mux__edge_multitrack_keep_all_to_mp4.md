# mux/edge_multitrack_keep_all_to_mp4

family: mux | fixture asset: `fixtures/media/h264_multitrack.mp4` (4.5 MB, 1 video H.264 + 2 audio AAC, 10s) | primaryMetric: throughputRealtime | passCount: 3 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (3 engines PASS: mediabunny, ffmpeg-wasm, mp4box).
- **Decisive factor: PERFORMANCE.** All three PASS engines pass the *identical* two oracles with *byte-identical* measurements (reference-reimport 1240 packets / 945 keyframes; property-invariant duration Δ 0.0213s ≤ 0.0417s). Correctness is therefore a tie, so the win is decided by speed.
- **Margin over runner-up (ffmpeg-wasm):** wall median 40.33ms vs 71.72ms → **1.78x faster wall**; throughputRealtime 247.92x vs 139.42x → **1.78x higher throughput**. Over the slowest PASS (mp4box, 80.34ms) mediabunny is **1.99x faster**.
- **Caveat on the win:** mediabunny's `peakMemory` is 101.0 MB vs mp4box's 58.4 MB (mediabunny uses **1.73x more memory**), and mediabunny's `longtasks` is only 555ms vs ffmpeg/mp4box 19963ms — a large main-thread-responsiveness advantage. ffmpeg-wasm reported `peakMemory` n=0 (not measured). Performance win confidence is tempered by n=1 (single sample, mad=0) for every metric.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true, property-invariant:true | 40.335 | 247.924 | 101,002,460 | 555 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true, property-invariant:true | 71.725 | 139.421 | 0 (n=0, not measured) | 19963 | cached previous PASS result |
| mp4box@2.3.0 | PASS | reference-reimport:true, property-invariant:true | 80.340 | 124.471 | 58,442,501 | 19963 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

**The operation.** This is a "keep-all" multitrack *mux* (`op: 'mux'`, src/scenarios/mux/codec-edges.ts:135-149): the runner demuxes `h264_multitrack.mp4` into encoded tracks (1 video H.264 + 2 audio AAC), then asks each engine to pack ALL of those encoded packet streams back into a single MP4 with no decode/re-encode. The golden (`fixtures/golden/h264_multitrack.mp4.meta.json`) confirms the source layout: video h264 1280x720@30fps, plus two independent AAC stereo @48 kHz tracks. The correctness bar is that *every* track survives the write.

**Why correctness is a three-way tie.** Both gating oracles produce the same verdict for all three PASS engines:
- `reference-reimport` (src/core/oracles.ts:1225-1271). Because `op === 'mux'` (not `'remux'`), this takes the NON-semantic branch (lines 1249-1270): it re-demuxes each engine's output with the reference engine and compares the *total* packet count and *total* keyframe count against the golden packet table (`h264_multitrack.mp4.packets.json`, which holds 1240 packets / 945 keyframes) within a 2% relative tolerance (`withinRel(..., 0.02, 1)`, lines 1258-1262). All three reported exactly `reimportPackets:1240, reimportKeyframes:945` — an exact match, 0% divergence. (The 945 keyframes ≈ the two AAC tracks' frames, where every audio packet is a sync sample, plus video IDRs; this is physically consistent with two 10s/48 kHz AAC tracks ≈ 469 frames each.)
- `property-invariant` = probe-duration (src/core/oracles.ts:2730-2758). Output container duration 10.0213s vs golden 10.0s → Δ 0.02133s ≤ tol 0.04167s (≈ ±1 frame at 30fps / ±1 AAC frame). All three identical.

So there is no correctness separation to exploit — the win is purely speed.

**Why mediabunny is fastest, mechanistically.** mediabunny ran on `backend: webcodecs`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer:false` (env.configUsed). Its `mux()` (src/engines/mediabunny/adapter.ts:1508-1600) is a pure container-authoring path with **no decode and no encode**: for each demuxed track it constructs an `EncodedVideoPacketSource` / `EncodedAudioPacketSource` (adapter.ts:1528, 1539), registers it with `output.addVideoTrack` / `output.addAudioTrack` pre-sizing the sample table via `maximumPacketCount` (adapter.ts:1529, 1540), then streams every encoded packet straight through `new mb.EncodedPacket(c.data, key|delta, ptsUs/1e6, durationUs/1e6, i)` into `source.add(...)` (adapter.ts:1559-1591), attaching the decoder config only on the first packet so the muxer can author the `avcC`/`esds` codec-private boxes (adapter.ts:1571-1590), and finalizes to a `BufferTarget` (adapter.ts:1598). This is native-TypeScript box authoring against an in-memory buffer — no wasm boundary, no FS, no worker round-trip — which is why wall is 40.3ms, throughput 247.9x realtime, and the main-thread `longtasks` total is just 555ms.

By contrast ffmpeg-wasm (71.7ms) and mp4box (80.3ms) both report `longtasks: 19963ms` — a ~20s aggregate of blocking main-thread work, two orders of magnitude worse than mediabunny's 555ms — because ffmpeg.wasm crosses the wasm/MEMFS boundary (write input to virtual FS, run `-c copy`, read output) and mp4box runs a `whole-file-append(MP4BoxBuffer+fileStart)` pure-JS pipeline (`backend: pure-js`, `worker: false`, env.configUsed) that buffers the entire file. mediabunny's streaming-lockstep design avoids both, giving the 1.78x–1.99x wall advantage that decides the tie.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — PASS but lost on speed.** Identical correctness (1240/945, Δ0.0213s) but 71.72ms wall vs 40.34ms (1.78x slower) and 139.42x vs 247.92x throughput. Its `peakMemory` is n=0 (unmeasured, can't credit it), and `longtasks` 19963ms shows heavy main-thread blocking from the wasm/MEMFS copy-mux round-trip.
- **mp4box@2.3.0 — PASS but lost on speed.** Identical correctness, but slowest of the three (80.34ms wall, 124.47x throughput, 1.99x slower than mediabunny) and the same 19963ms longtasks penalty from its `whole-file-append` pure-JS, single-thread, no-worker pipeline (env.configUsed: `backend: pure-js`, `worker:false`). Its one advantage — `peakMemory` 58.4 MB vs mediabunny 101 MB (0.58x) — is a secondary metric that does not outrank wall/throughput under the decision ladder.
- **remotion-media-parser@4.0.479 — NA_ENGINE (honest).** Declares only probe+demux (src/engines/remotion-media-parser/adapter.ts:10); it is a parser, has no muxer. "engine does not declare operation 'mux'" is a truthful capability gap.
- **platform@chrome-149 — NA_ENGINE (honest).** `mux: false // NA — MediaRecorder can't ingest opaque encoded chunks` (src/engines/platform/adapter.ts:235). The Web Platform exposes no API to repackage pre-encoded packets into MP4; MediaRecorder only encodes live capture. Honest NA.
- **web-demuxer@4.0.0 — NA_ENGINE (honest).** A demuxer only; no muxer/write side. Honest NA.
- **remotion-webcodecs@4.0.479 — NA_ENGINE (honest).** Transcode/convert-oriented WebCodecs wrapper that does not declare a standalone encoded-packet mux op. Honest NA.

## Anti-cheat validation

- **Scenario:** src/scenarios/mux/codec-edges.ts:135-149 (`id: 'edge_multitrack_keep_all_to_mp4'`), built via `buildMux` (src/scenarios/mux/_shared.ts:204-229), `op: 'mux'`.
- **Fixture:** `fixtures/media/h264_multitrack.mp4` — REAL file, 4.5 MB, verified via stat. Not synthetic/empty/mock. Golden meta confirms 3 real tracks (1 H.264 + 2 AAC, 10s).
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1508-1600. GENUINE implementation: real `mb.Output` + `EncodedVideoPacketSource`/`EncodedAudioPacketSource` + `BufferTarget`, iterates `tracks.tracks` and copies every encoded packet (1524-1596), `await output.finalize()` (1598). No canned output, no input→output copy faked as a mux, no golden short-circuit, no swallowed errors (throws on unsupported codecs, 1527/1538). It writes ALL tracks, satisfying the keep-all intent.
- **Gating oracle:** `reference-reimport` src/core/oracles.ts:1225-1271; `property-invariant`(probe-duration) src/core/oracles.ts:2730-2758. The reimport oracle does a real re-demux and compares packet/keyframe totals to a real golden table (1240/945) at 2% tolerance — not trivially satisfiable; an engine that dropped one AAC track (~470 packets) would fall ~38% below 1240 and FAIL the count check. Measurements (1240 pkts, 945 kf, 10.0213s duration) are physically plausible for this fixture.
- **Caveat (WEAK-GATE, not CHEAT):** the scenario *notes* claim reference-reimport "checks track layout + per-track packet counts so a dropped/merged track FAILs." For `op:'mux'` the oracle actually takes the **non-semantic branch** and checks only TOTALS (the per-track `mediaTrackLayout` comparison at lines 1289-1298 runs ONLY for `op==='remux'`). A *merge* of the two AAC tracks into one that preserved total packet count could in principle still pass the total-only check, and the golden packets.json carries no per-track ids. The dropped-track case is still caught (total count drops), but the stated per-track layout guarantee is not enforced here. The gate is real and meaningful but slightly looser than its description.
- **Cached:** ALL three PASS results have `cached:true` ("cached previous PASS result"). Numbers were reused, not freshly re-run — staleness risk per the launcher-seeding caveat; treat the exact ms/byte figures as last-known, not this-run.

## Confidence & caveats

- **Confidence: medium.** The PASS/NA classification is solid and the winner's code is verifiably real. But: (1) every metric is n=1 (mad=0, single sample) so the 1.78x speed margin is directional, not statistically robust; (2) all three results are cached; (3) the gate is a totals-only structural check (WEAK-GATE), not bit-exact, so correctness is "track-survival plausible" rather than pixel/byte proven.
- mediabunny wins decisively on wall/throughput/longtasks; mp4box's only edge is lower peak memory (0.58x), which does not flip the ranking under the metric ladder. ffmpeg-wasm's peakMemory was not measured (n=0).
