# mux/h264_aac_to_mov

**family:** mux | **fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (31 MB, real) | **primaryMetric:** wall (ms) | **passCount:** 2 / 7

## Verdict

- **Best framework: `mediabunny@1.48.0`** (env.engineId `mediabunny`).
- **CONTESTED:** two engines PASS — `mediabunny` and `ffmpeg.wasm@0.12.15` — and they pass the *exact same two oracles with identical measurements*. Correctness is a dead tie.
- **Decisive factor: performance.** With correctness comparable, mediabunny wins on wall and realtime throughput by a clean ~2.57x margin.
- **Margin over runner-up (ffmpeg-wasm):** wall median **110.46 ms vs 284.19 ms = 2.57x faster**; throughputRealtime **271.59x vs 105.56x = 2.57x higher**. Both measured at **n==1** (single sample, mad==0), so the margin is large but is single-shot evidence. Caveat going the other way: mediabunny's `longtasks` is **19963 ms vs ffmpeg's 1007 ms** (see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | reference-reimport:true; property-invariant:true | 110.46 ms | 271.59x | 0 (not sampled) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true; property-invariant:true | 284.19 ms | 105.56x | 0 (not sampled) | 1007 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

`peakMemory` and `targetWrites` were not sampled for either PASS engine (`n==0`), so they cannot be used as tiebreakers.

## Why the winner wins (deep technical)

**The operation.** This scenario demuxes H.264 video + AAC audio out of `h264_1080p_30s.mp4` (ISO-BMFF / MP4) and **muxes the encoded packets into a QuickTime `.mov`** container. MOV is the ISO-BMFF sibling of MP4 but with a distinct `ftyp` brand and atom layout (`qt  ` major brand, the `wide`/`mdat` arrangement, the QuickTime sample-table dialect). Crucially this is a *remux/copy* path: the AVCC framing and the sample model are preserved byte-for-byte at the elementary-stream level, so no re-encode happens — the win is decided by how efficiently each engine reads the source sample table and re-authors a QuickTime sample table around the same encoded packets.

**Both engines are correct, identically.** Both PASS the same two gates with the same numbers:
- `reference-reimport` → "2308 packets, 1423 keyframes" (`reimportPackets:2308`, `reimportKeyframes:1423`). The reference engine re-demuxed each engine's authored `.mov` and recovered the full packet table; oracles.ts:1252-1265 compares this against the *source golden* packet/keyframe counts within a 2% relative band (`withinRel(..., 0.02, 1)`), and both matched with no diffs. The mp4→mov copy preserves AVCC framing so the source golden is a faithful reference (scenario note, write-targets.ts:47-49).
- `property-invariant` (probe-duration) → "Δ 0.0213s ≤ 0.0417s" (`outDurationSec:30.0213`, `goldenDurationSec:30`, `deltaSec:0.0213`, `durationToleranceSec:0.0417`). oracles.ts:2709-2758 re-probes the authored output with the reference engine and asserts duration within a per-container band. Both engines materialized a 30.021s MOV — the ~21ms tail is normal AAC-frame rounding, well inside the ±41.7ms band.

Because correctness strength (number, strictness, and measured tolerances of oracles) is identical, the decision falls to **performance (rule 4b)**.

**Mechanistically why mediabunny is faster.** mediabunny ran on `backend: webcodecs`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false` (env.configUsed). Its mux path (`src/engines/mediabunny/adapter.ts:1508-1597`) builds a native `Output` with a `MovOutputFormat` (`src/engines/mediabunny/codecs.ts:166-167`), attaches `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (adapter.ts:1528,1539), and streams the *already-encoded* packets straight into the muxer via `source.add(pkt, meta)` (adapter.ts:1591), carrying the decoder config (AVCC `description`) only on the first packet (adapter.ts:1570-1590). This is a pure in-process JS/TS write loop: no decode, no re-encode, no filesystem indirection — it copies encoded `EncodedPacket`s into the QuickTime sample table directly in the page heap. Result: **110.46 ms wall, 271.59x realtime**.

ffmpeg.wasm, by contrast, drives a full ffmpeg CLI inside a WebAssembly VM. Its mux is the dossier `-c copy` file path (adapter.ts:33,495): the input must be staged into MEMFS, ffmpeg's demuxer/muxer machinery spins up, the copy runs, and the output is read back out of MEMFS — all inside a single-thread wasm interpreter (the env shows no SharedArrayBuffer/threads in play). That VM + MEMFS overhead is the 2.57x gap: **284.19 ms wall, 105.56x realtime**. Even though both do a zero-re-encode copy, mediabunny's native-JS muxer avoids the wasm boundary and the virtual filesystem round-trip entirely.

**Tiebreaker direction confirms mediabunny:** mediabunny needs no COOP/COEP and no SharedArrayBuffer (`coopCoep: not-required`), and uses a streaming pipeline rather than whole-file wasm buffering — both rule-4c tiebreakers favor it, on top of the raw speed win.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (correct), but **lost on speed**: 284.19 ms wall vs 110.46 ms (2.30x slower in absolute terms; mediabunny is 2.57x faster), 105.56x vs 271.59x realtime. Cause: wasm-VM + MEMFS `-c copy` overhead vs mediabunny's native-JS streaming muxer. Its one redeeming metric is much lower `longtasks` (1007 ms vs 19963 ms).
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'mux'". Honest NA — the browser platform path (WebCodecs decode/encode + `<video>`) exposes no general container-muxing operation; there is no native MOV writer to declare.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare output container 'mov'". Honest and *granular*: mp4box.js can author ISO-BMFF but its adapter does not advertise the QuickTime `.mov` write target specifically, so it is correctly excluded rather than faking an mp4-as-mov.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'mux'". Honest — web-demuxer is a read/demux-only library; it has no muxing capability.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'mux'". Honest — media-parser is a parser/probe library, not a writer.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'mux'". Honest at the family level — its conversion API targets transcode/remux flows, not declared as a generic `mux` op for this matrix.

All five NAs look genuine (capability-honest), not under-declared: muxing to QuickTime requires a real container writer, which only mediabunny and ffmpeg.wasm provide here.

## Anti-cheat validation

- **Scenario:** `src/scenarios/mux/write-targets.ts:40-50` (`id: 'h264_aac_to_mov'`, `input: 'h264_1080p_30s.mp4'`, `to: 'mov'`, video `h264`, audio `aac`). Built via `buildMuxAll` (write-targets.ts:166).
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` — **exists, 31 MB**, a real H.264/AAC MP4. Not synthetic/empty/mock.
- **Oracles:** `reference-reimport` at `src/core/oracles.ts:1225-1271` does a real re-demux of the engine's authored bytes and compares packet/keyframe counts against the source golden within a 2% band — not trivially satisfiable (an empty/copied/short-circuited output would fail the count check at oracles.ts:1258-1264 or the empty-table check at 1249-1251). `property-invariant`/probe-duration at `src/core/oracles.ts:2709-2758` re-probes the authored MOV and enforces a ±41.7ms duration band against the 30s golden — a fake/zero-length output would fall outside the band. Measurements (2308 packets, 1423 keyframes, 30.021s) are physically plausible for a 30s 1080p clip.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1508-1597` (`mux`) genuinely calls mediabunny's `Output` + `MovOutputFormat` (codecs.ts:166-167) + `EncodedVideoPacketSource`/`EncodedAudioPacketSource`, streaming real `EncodedPacket`s with first-packet decoder config. No canned output, no input→output byte copy, no golden short-circuit, no swallowed errors (it throws on unsupported codec/container at 1510/1527/1538 and on invalid conversions elsewhere).
- **Cached note:** mediabunny's result has **`cached: true`** ("cached previous PASS result"), as does ffmpeg's. Both PASSes were *reused, not re-run* in this report build — staleness risk applies symmetrically to both contenders, so it does not change the relative ranking, but the absolute numbers reflect an earlier run.
- **Verdict: REAL.** Real 31 MB fixture, real mediabunny muxer implementation, two meaningful structural/metadata oracles with plausible measurements.

## Confidence & caveats

- **Confidence: high** on the winner. Correctness is an exact tie (identical oracle passes/measurements) and mediabunny's 2.57x speed margin plus the no-COOP/COEP / streaming tiebreakers all point the same way.
- **Single-sample benches:** both engines report `n==1`, `mad==0`. The 2.57x margin is large enough to survive single-shot noise, but it is not a multi-sample distribution — treat the ratio as indicative, not p95-tight.
- **Longtasks anomaly:** mediabunny's `longtasks` is **19963 ms** vs ffmpeg's **1007 ms** — i.e. mediabunny blocked the main thread far longer despite finishing the wall clock faster. This suggests the mediabunny streaming-lockstep mux runs heavy synchronous work on the main thread (no worker offload), which would hurt UI responsiveness in a real app even though raw throughput wins. It does not flip the verdict under rule 4b (primaryMetric=wall, then throughput, both favor mediabunny; longtasks is a later tiebreaker), but it is the strongest caveat against mediabunny.
- **peakMemory/targetWrites not sampled** (`n==0`) for both, so memory could not be used as a tiebreaker.
- **Cached evidence:** both winners are `cached:true`; a fresh re-run is advisable before treating these exact millisecond figures as current.
