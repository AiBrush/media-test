# mux/h264_aac_to_mp4

- **Family:** mux
- **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264 1080p30 + AAC, 30s)
- **Operation:** demux H.264+AAC tracks from the source, then `mux()` the encoded packets into a fresh MP4 container (copy-mux, no re-encode)
- **primaryMetric:** throughputRealtime (x-realtime, higher is better)
- **passCount:** 3 of 7 (mediabunny, mp4box, ffmpeg-wasm)

## Verdict

- **Best framework: mediabunny@1.48.0** — **CONTESTED** (3 engines PASS with identical correctness).
- **Decisive factor:** performance on the primaryMetric (throughputRealtime). All three passing engines satisfy the *exact same* two oracles with *byte-for-byte identical* measurements (2308 packets, 1423 keyframes, duration Δ 0.0213s), so correctness is a perfect tie and the ranking falls to performance.
- **Margin over runner-up (mp4box):** mediabunny 173.59x vs mp4box 130.23x realtime = **1.33x higher throughput**; wall 172.82 ms vs 230.36 ms = **1.33x faster**; longtasks 315 ms vs 1017 ms = **3.23x less main-thread blocking**. Over third-place ffmpeg-wasm: 173.59x vs 120.51x = **1.44x throughput**, wall 172.82 ms vs 248.95 ms = **1.44x faster**.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true, property-invariant:true | 172.82 | 173.59 | 0 (not sampled) | 315 | cached previous PASS result |
| mp4box@2.3.0 | PASS | reference-reimport:true, property-invariant:true | 230.36 | 130.23 | 223,134,116 | 1017 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true, property-invariant:true | 248.95 | 120.51 | 0 (not sampled) | 263 | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

This scenario is a **copy-mux**: the runner demuxes the H.264 video + AAC audio elementary streams from `h264_1080p_30s.mp4` (the coded samples plus codec-private/`avcC`/`esds` data) and hands the engine `EncodedTracks`; the engine must re-pack those *already-encoded* packets into a new MP4 (`moov`/`mdat`, A/V interleave) without touching the sample bytes. No decode/encode is required, so this is a packet-plumbing + box-authoring contest, not a codec contest.

**Correctness is a dead heat.** All three passing engines satisfy the same two gates with identical numbers:
- `reference-reimport` (oracles.ts:1225) re-parses each engine's MP4 with the reference engine and counts packets/keyframes: every passer reports **2308 packets, 1423 keyframes** — proving the full sample table round-trips (the H.264 GOP keyframe cadence and AAC frame count survived the remux).
- `property-invariant:probe-duration` (oracles.ts:2715–2758) probes the authored output duration against the golden source: every passer reports **outDurationSec 30.0213s vs goldenDurationSec 30s, Δ 0.0213s ≤ tol 0.0417s** (±1 video-frame band at 30fps ≈ 0.0333s widened). The 0.0213s tail is the normal AAC-frame/last-sample-duration rounding that container reframing materializes — identical across all three because they wrote the same sample timing.

Because correctness cannot separate them, the **primaryMetric (throughputRealtime)** decides, and here mediabunny dominates mechanistically:

1. **Backend.** mediabunny ran `backend: "webcodecs"`, `coreBuild: "pure-ts-esm"`, `pipeline: "streaming-lockstep"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false` (shard `env.configUsed`). For a *copy*-mux the WebCodecs path is irrelevant to the bytes (no transcode), but mediabunny's pure-TS muxer streams packets directly into a `BufferTarget` without a wasm heap or filesystem shim. The mux adapter (`src/engines/mediabunny/adapter.ts:1508-1600`) builds an `EncodedVideoPacketSource`/`EncodedAudioPacketSource`, pre-sizes each track with `maximumPacketCount: t.chunks.length`, then in a tight loop wraps each demuxed chunk in `new mb.EncodedPacket(c.data, key|delta, ptsUs/1e6, durationUs/1e6, i)` and `await source.add(...)`, attaching the `decoderConfig` (with `avcC`/`esds` `description`) only on the **first** packet (lines 1557-1591). It calls `output.start()` → per-track add loop → `output.finalize()` → returns `targetInfo.mediaBytes(...)`. This is a single linear pass over the sample list with no intermediate copies.

2. **Main-thread blocking.** mediabunny's longtasks = **315 ms** vs mp4box's **1017 ms** — a **3.23x** reduction. mp4box (`backend: "pure-js"`, `pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"`, `discardMdatDataProbe: true`) buffers the *entire* file as `MP4BoxBuffer` segments via `appendBuffer`/`fileStart`, which forces large contiguous allocations and a synchronous box re-serialization — visible as the **223 MB peakMemory** sample (the only engine that reported peakMemory; mediabunny and ffmpeg-wasm did not sample it). That whole-file-append strategy is exactly why mp4box pays 230 ms wall and a 1-second long-task while mediabunny streams.

3. **No wasm tax.** ffmpeg.wasm is the slowest passer (248.95 ms wall, 120.51x). Even for a stream-copy (`-c copy`-equivalent) it must boot the Emscripten module, write the input into MEMFS, run the libavformat demux→mux remux, and read the output back out of the virtual FS. That FS marshalling overhead is the **1.44x** wall gap vs mediabunny. ffmpeg-wasm's longtasks (263 ms) are actually slightly *lower* than mp4box's, but its end-to-end wall is highest because of the module/FS round-trip, and throughputRealtime keys off wall.

**Tiebreaker confirmation:** mediabunny additionally wins the secondary tiebreakers — no COOP/COEP requirement (`coopCoep: "not-required"`), no SharedArrayBuffer, no wasm threads, and streaming rather than whole-file buffering — so even on operational footprint it is the cleanest choice.

**Sample-count caveat:** every metric here is `n: 1` (single timed run, `warmup: 1`, `mad: 0`, p95 == median). The throughput gaps (1.33x / 1.44x) and the 3.23x longtask gap are large enough to be decisive even with single-sample noise, but the precise ratios should be treated as point estimates, not tight confidence intervals.

## What each other framework did wrong

- **mp4box@2.3.0 (PASS, lost on performance):** correct (identical 2308/1423 packets, Δ 0.0213s) but 1.33x slower wall (230.36 vs 172.82 ms), 1.33x lower throughput (130.23 vs 173.59x), and **3.23x more main-thread blocking** (1017 vs 315 ms longtasks). Its `whole-file-append(MP4BoxBuffer+fileStart)` pure-JS pipeline buffered the full file and was the only engine to register a 223 MB peakMemory spike.
- **ffmpeg.wasm@0.12.15 (PASS, lost on performance):** correct (identical oracle measurements) but slowest passer — 248.95 ms wall (1.44x slower than mediabunny) and lowest throughput (120.51x), the cost of Emscripten module init + MEMFS write/read marshalling around the libav remux for what is otherwise a stream copy.
- **web-demuxer@4.0.0 (NA_ENGINE):** does not declare the `mux` operation. **Honest NA** — web-demuxer is a demux/probe-only WASM wrapper around FFmpeg's libavformat *reading* path; it exposes no muxer, so it genuinely cannot author a container.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** does not declare `mux`. **Honest NA** — `@remotion/media-parser` is a read-only parser/demuxer; it has no container-writing capability.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** does not declare `mux`. Plausibly **honest** for this suite's adapter surface — its capability set is transcode/decode-oriented; it does not expose a raw encoded-packet muxer entry point in this adapter.
- **platform@chrome-149 (NA_ENGINE):** does not declare `mux`. **Honest NA** — the bare browser platform exposes WebCodecs decode/encode but **no native MP4 muxer** (there is no built-in `MediaMux`/container-writer API in Chrome), so a container author cannot be assembled from platform primitives alone without pulling in a JS muxer (which would no longer be "platform").

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/mux/index.ts:47-55` (`id: 'h264_aac_to_mp4'`, `input: 'h264_1080p_30s.mp4'`, `to: 'mp4'`, video `h264`, audio `aac`). Built via `buildMuxAll(LEGACY_CASES)` (`_shared.ts`), default metrics include `throughputRealtime` as primary (`_shared.ts:86,95`). Notes: "Demux H.264+AAC, re-mux into MP4: classic A/V interleave; round-trips via reference."
- **Fixture exists & is real:** `fixtures/media/h264_1080p_30s.mp4` confirmed present, **31 MB** — a genuine 1080p30 H.264+AAC clip, not synthetic/empty/mock. Goldens exist: `fixtures/golden/h264_1080p_30s.mp4.{meta,packets,frames,ssim}.json`.
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts:1508-1600` (`mux()`). It builds real `mb.EncodedVideoPacketSource`/`EncodedAudioPacketSource`, calls `output.addVideoTrack/addAudioTrack`, wraps each demuxed chunk in a real `mb.EncodedPacket` (preserving keyframe flag, PTS, duration, sequence index — line 1562-1569), attaches the real `decoderConfig`/`description` (avcC/esds) on the first packet (1571-1590), and `output.start()` (1553) → add loop (1555-1596) → `output.finalize()` (1598) → returns the materialized buffer `targetInfo.mediaBytes(...)` (1599). **No** canned output, **no** input→output passthrough, **no** golden short-circuit, **no** error swallowing (codec mapping failures `throw`, lines 1527/1538).
- **Oracles are real, non-trivial comparisons:** `reference-reimport` (`oracles.ts:1225-1271`) actually re-demuxes the engine's bytes with the reference engine and counts packets/keyframes, failing on an empty table or >2% packet/keyframe divergence from golden (lines 1244-1264). `property-invariant:probe-duration` (`oracles.ts:2715-2758`) re-probes the authored output via the reference engine and gates on a tight ±1-frame duration band (passed at Δ 0.0213s ≤ 0.0417s). Measurements are physically plausible: 2308 packets / 1423 keyframes / 30.02s for a 30s 1080p30 clip are consistent real values, not placeholders.
- **Cached note:** all three PASS results have `cached: true` ("cached previous PASS result"). Evidence was **reused, not re-run** this session — staleness risk applies to the exact metric values. The correctness verdict is robust (oracle measurements are deterministic for a copy-mux); the performance ratios depend on the cached single-sample timings.
- **Verdict: REAL.** Real 31 MB fixture, genuinely implemented streaming muxer calling the real mediabunny library, and two meaningful oracles performing real re-import/duration comparisons against goldens. The only soft spot is the WEAK-GATE-adjacent nature of mux oracles in general (round-trip packet-count + duration rather than bit-exact sample-hash), but for a copy-mux the packet-table round-trip is a strong structural gate, and it is not trivially satisfiable.

## Confidence & caveats

- **Confidence: high** on the winner and the contested ranking. The 3-way correctness tie is exact (identical measurements), and the performance margins (1.33x–1.44x throughput, 3.23x longtasks) are large and consistent with the documented pipeline differences (streaming pure-TS vs whole-file-append vs wasm+MEMFS).
- **Caveats:** (1) all metrics are `n:1` cached single-run samples — ratios are point estimates. (2) peakMemory is only available for mp4box (223 MB); mediabunny/ffmpeg-wasm did not sample it, so the memory comparison is one-sided (though mp4box's whole-file-append strategy makes its 223 MB the expected outlier). (3) The mux oracles validate structural round-trip + duration, not per-sample bit-exactness; this is appropriate for a copy-mux but is a weaker gate than a decoded-frames-bitexact comparison would be.
