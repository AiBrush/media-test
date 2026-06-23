# mux/mp4_fragmented_cmaf

family: mux | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264+AAC, 1080p/30s) | primaryMetric: wall (no targetWrites declared on this case) | passCount: 3 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (3 engines PASS: mediabunny, mp4box@2.3.0, ffmpeg.wasm@0.12.15).
- **Decisive factor: performance, on identical correctness.** All three PASS the same three oracles with effectively identical measurements (reimport 2308 packets / 1423 keyframes; duration Δ ≈ 0.0213 s; valid moov+moof/mdat fragmented layout). With correctness tied, mediabunny wins on speed.
- **Margin over runner-up (mp4box):** wall 132.56 ms vs 195.78 ms = **1.48x faster**; throughputRealtime 226.30x vs 153.23x = **1.48x higher**; longtasks 2152 ms vs 4438 ms = **2.06x less main-thread blocking**. Over the slowest passer (ffmpeg-wasm 266.60 ms) mediabunny is **2.01x faster** with **2.36x less** longtask time.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:Y, property-invariant:Y, mp4-box-layout:Y | 132.56 | 226.30 | 0 (n=0) | 2152 | cached previous PASS result |
| mp4box@2.3.0 | PASS | reference-reimport:Y, property-invariant:Y, mp4-box-layout:Y | 195.78 | 153.23 | 0 (n=0) | 4438 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:Y, property-invariant:Y, mp4-box-layout:Y | 266.60 | 112.53 | 0 (n=0) | 5077 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

peakMemory has n=0 samples for all engines (not measured in this run), so it is not a usable tiebreaker. bytesOut: mediabunny 31,245,715; mp4box 31,481,947; ffmpeg-wasm 31,246,059.

## Why the winner wins (deep technical)

This case packs already-encoded H.264 video + AAC audio EncodedTracks (sourced from the 30 s 1080p fixture) into a **fragmented / CMAF MP4** — a `moov` init segment followed by repeating `moof`/`mdat` media fragments, rather than a single classic `moov`+`mdat`. The scenario passes `extraOptions: { fragmented: true }` (`src/scenarios/mux/output-modes.ts:85`). The win is decided on performance because correctness is a three-way tie.

**Identical correctness.** All three passers satisfy the same oracle ladder. The strongest gate here is the structural `mp4-box-layout` (`src/core/oracles.ts:365`), which parses the real top-level box tree and, for the fragmented branch (`oracles.ts:392-402`), requires a `moov` *and* a `moof` *and* an `mdat` that comes after the first `moof`, and rejects a `moof` placed before `moov`. Mediabunny's output reports `moovOffset:28, moofOffset:1134, mdatOffset:1926` with 35 top-level boxes and a clean `ftyp@0, moov@28, moof@1134, mdat@1926, moof@2078662, mdat@2079454, ...` cadence — a genuine init-plus-fragments layout. `reference-reimport` (`oracles.ts:1225`) re-demuxes the produced bytes with an independent reference engine and counts 2308 packets / 1423 keyframes — matching ffmpeg-wasm and mp4box packet-for-packet — proving the fragments are real, parseable media, not a stub. `property-invariant` (probe-duration) reports outDuration 30.0213 s vs golden 30 s, Δ 0.02133 s ≤ tol 0.04167 s. These are metadata/structural-exact gates, not perceptual proxies, so the PASS is strong, but all three share it.

**Why mediabunny is faster — backend and code path.** mediabunny ran on `backend:"webcodecs"`, `coreBuild:"pure-ts-esm"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`, `sharedArrayBuffer:false` (env.configUsed). For a *mux* (packing pre-encoded packets, no decode/encode), the heavy lifting is container authoring in JS, and mediabunny streams packets straight through its native fragmented writer: the adapter (`src/engines/mediabunny/adapter.ts:1508` `mux()`) wires `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (lines 1528, 1539), declares `maximumPacketCount` up front so buffers are sized once (lines 1529, 1540), then feeds each chunk as an `EncodedPacket` carrying key/delta flag, PTS, duration and decode index (lines 1562-1569), attaching the decoder config only on the first packet so codec-private boxes are emitted once (lines 1571-1590). `fragmented:true` is mapped to mediabunny's native `fastStart:'fragmented'` output option in `outputFormatOptionsFrom` (`adapter.ts:183-184`), so fragment authoring happens inside mediabunny's compiled writer rather than in adapter glue. The result: wall 132.56 ms, throughput 226.30x realtime, and only 2152 ms of longtasks.

**Versus mp4box (runner-up).** mp4box ran `backend:"pure-js"`, `pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"`, `segmentRapAlignement:true`. Its pure-JS box authoring is correct (same 2308/1423 reimport, Δ 0.0213 s) but slower (195.78 ms, 1.48x mediabunny) and far more main-thread-blocking (4438 ms longtasks, 2.06x). Telling structural signature: its layout reports **4618 top-level boxes** (vs 35 for mediabunny) and a much tighter fragment cadence (`moof@1214, mdat@1314, moof@51861, ...`) — mp4box emits far more, much smaller fragments, which still passes the layout gate but costs per-box overhead.

**Versus ffmpeg.wasm (slowest passer).** ffmpeg-wasm is the slowest of the three at 266.60 ms (2.01x mediabunny), 112.53x throughput, 5077 ms longtasks (2.36x). It is single-threaded wasm doing the same correct job (2308/1423, Δ 0.02135 s, 33 top-level boxes), but the wasm container muxer plus the JS↔wasm FS round-trips dominate wall time. Its fragment count (33 top-level boxes) is close to mediabunny's, so the gap is execution cost, not layout shape.

## What each other framework did wrong

- **mp4box@2.3.0 (PASS, lost on perf):** correct but 1.48x slower wall (195.78 vs 132.56 ms) and 2.06x more longtasks (4438 vs 2152 ms); pure-JS box authoring with 4618 tiny fragment boxes carries per-box overhead.
- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correct but slowest — 266.60 ms (2.01x), 112.53x throughput, 5077 ms longtasks; single-thread wasm + FS marshalling overhead for a job that needs no decode/encode.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest NA — Remotion's WebCodecs path is a transcode/convert pipeline, not a raw encoded-packet container author.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest — the bare browser exposes no API to author a fragmented MP4 from pre-encoded packets (no muxer primitive).
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest — it is a read/parse-only library; no write/mux capability.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest — name and scope are demux-only; muxing is out of declared capability.

## Anti-cheat validation

- **Scenario:** `src/scenarios/mux/output-modes.ts:78-92` (id `mp4_fragmented_cmaf`), built via `buildMux` from `src/scenarios/mux/_shared.ts`.
- **Fixture:** input `h264_1080p_30s.mp4` → `fixtures/media/h264_1080p_30s.mp4` **exists, 31 MB**, real H.264+AAC 1080p/30s. Not synthetic/empty/mock.
- **Oracles:** `mp4-box-layout` at `src/core/oracles.ts:365` (fragmented branch 392-402) parses real top-level boxes and enforces moov-init + moof + post-moof mdat ordering — not trivially satisfiable; a plain non-fragmented MP4 would fail. `reference-reimport` at `oracles.ts:1225` re-demuxes via an independent reference engine and rejects empty packet tables (line 1249-1251); measured 2308 packets / 1423 keyframes are physically plausible for 30 s of 1080p H.264 + AAC. `property-invariant` probe-duration enforces Δ 0.0213 s ≤ 0.0417 s tol.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1508` `mux()` genuinely authors the container via `mb.Output` + `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (1528/1539), feeds real `EncodedPacket`s with per-chunk PTS/duration/keyframe (1562-1569), maps `fragmented:true`→`fastStart:'fragmented'` (`adapter.ts:183-184`). No canned output, no input→output copy, no golden short-circuit, no error swallowing (errors throw, e.g. lines 1527/1538/1510). The reimport packet/keyframe counts being identical to two independent engines confirms real fragmented bytes.
- **Cached note:** all three PASS results have `cached:true` ("cached previous PASS result"). The PASSes were reused, not re-run in this batch, so the wall/throughput numbers carry mild staleness risk; however, the cross-engine reimport consistency (2308/1423 identical) corroborates the cached evidence.
- **Verdict: REAL** — real 31 MB fixture, genuine native fragmented-MP4 muxer call, and a meaningful structural+reimport gate that a faked or plain-MP4 output would fail.

## Confidence & caveats

- Confidence: **high** for the winner and the REAL verdict (real fixture, real adapter path, strong structural+reimport oracles, three independent engines agreeing on packet/keyframe counts).
- Caveats: (1) all benches are **n=1** (mad=0, p95==median), so the perf margins, while large (1.48x–2.06x), rest on single samples — weaker statistical evidence than multi-sample runs. (2) All three winners' results are **cached** (staleness risk noted). (3) **peakMemory n=0** for every engine — memory was not measured, so it could not be used as a tiebreaker. (4) primaryMetric for this specific case is wall (targetWrites is the primary only on the streaming/reserve sibling cases), so the perf ranking is on wall/throughput/longtasks as recorded.
