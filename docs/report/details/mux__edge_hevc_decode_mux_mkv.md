# mux/edge_hevc_decode_mux_mkv

family: mux | fixture asset: `hevc_1080p_10s.mp4` (HEVC/hvcC video + AAC audio, ~11 MB, 1920x1080) | primaryMetric: wall | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **YES** — 2 engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Both satisfy the identical correctness gate with identical measurements, so the contest is decided on performance.
- Decisive factor: **wall-clock and main-thread blocking**. mediabunny remuxed HEVC→MKV in **53.51 ms** vs ffmpeg.wasm's **96.07 ms** (1.80x faster), and incurred **4410 ms** of longtasks vs ffmpeg.wasm's **19963 ms** (4.53x less main-thread blocking).
- Margin over runner-up (ffmpeg.wasm): 1.80x faster wall, 4.53x fewer longtasks. (Caveat: n==1 for both, mad==0, so spread is unmeasured; both results cached.)

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true (12/12 bit-exact) | 53.51 ms | n/a | 102,636,021 B (~97.9 MB) | 4410 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (12/12 bit-exact) | 96.07 ms | n/a | 0 B (not sampled, n=0) | 19963 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

Neither passing engine reported throughputRealtime in `bench`; ffmpeg.wasm's peakMemory has n=0 (not sampled), so memory cannot be compared head-to-head.

## Why the winner wins (deep technical)

The operation is a **mux of HEVC encoded packets out of an MP4 source into a Matroska (MKV) container**, with AAC audio carried alongside. The hard part for HEVC→MKV specifically is **codec-private authoring**: HEVC in MP4 stores its parameter sets (VPS/SPS/PPS) inside the `hvcC` box of the `hev1`/`hvc1` sample entry; the Matroska writer must lift those exact bytes and re-emit them as the track's `CodecPrivate`. If the bytes are dropped, reordered, or re-derived incorrectly, a downstream WebCodecs `VideoDecoder` cannot configure and the decoded pixels diverge. The gate is metamorphic: `decode(mux(x)) == decode(x)`.

mediabunny ran on the **WebCodecs backend with `prefer-hardware` acceleration** (env.configUsed: `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `wasmThreads:0`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`). Its mux path (`src/engines/mediabunny/adapter.ts:1508` `async mux`) builds an `Output` with a Matroska `OutputFormat`, adds an `EncodedVideoPacketSource` for the HEVC track (`adapter.ts:1528`), and — critically — attaches the source `description` (the `hvcC` codec-private bytes) to the **first packet's** `decoderConfig.description` (`adapter.ts:1557`, `:1570-1581`). That is the concrete code path that makes HEVC→MKV faithful: the muxer receives `decoderConfig:{codec:codecParamForTrack(...), codedWidth, codedHeight, description}` and authors the Matroska `CodecPrivate` from it. Per-packet PTS/duration are preserved verbatim (`adapter.ts:1562-1569`, packets emitted `'key'`/`'delta'` with original `ptsUs/durationUs` and a monotonically increasing sequence index), so the demuxed-then-decoded frames land on the same PTS grid as the source. No re-encode occurs — packets are copied bit-for-bit into the new container — which is exactly what a mux should do and why the decoded output is bit-exact.

The oracle confirms this mechanistically. `property-invariant` resolves to the `decode-remux` branch (`src/core/oracles.ts:2686-2707`): it decodes mediabunny's MKV output with the platform WebCodecs decoder (`ctx.decodeWithPlatform`, `oracles.ts:2697`) and compares per-frame SHA-256 digests against the offline golden `decode(x)` via `compareDigests` (`oracles.ts:1166`). The reported measurements — `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` — mean all 12 decoded frames of the MKV output matched the golden source decode byte-for-byte. The golden `fixtures/golden/hevc_1080p_10s.mp4.frames.json` contains exactly 12 entries of real 1920x1080 frames with distinct SHA-256 hashes (e.g. frame 0 keyframe `fd71f40c…`), so a pass here is genuine pixel equality, not a vacuous match.

ffmpeg.wasm produced the **same correctness result** (12/12 bit-exact via the same oracle), so the two are tied on the correctness ladder (both at the strongest applicable rung for this scenario — a decode-bit-exact metamorphic gate; there is no separate golden-packets gate here because the MKV target reframes the stream and the scenario notes explicitly drop the source-keyed packet count). The tiebreak is performance, where mediabunny dominates: its single-threaded `wasmThreads:0` is irrelevant because it offloads decode/mux scheduling to the browser's native WebCodecs + a pure-TS Matroska writer, whereas ffmpeg.wasm must run the entire libavformat/libavcodec demux-copy-mux pipeline inside a single-thread WASM VM. The result is mediabunny finishing in 53.51 ms vs 96.07 ms and, more strikingly, blocking the main thread for only 4410 ms of longtasks vs ffmpeg.wasm's 19963 ms — a 4.53x reduction in jank, consistent with WASM's synchronous run loop monopolizing the thread.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (same 12/12 bit-exact correctness) but LOST on performance: 96.07 ms wall (1.80x slower) and 19963 ms longtasks (4.53x more main-thread blocking) than mediabunny. peakMemory was not sampled (n=0), so it could not even contribute a memory win. Single-thread WASM pipeline is the cost driver.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA; web-demuxer is a read/demux-only wrapper (libav demuxer) and exposes no muxing output path.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest NA; mp4box.js is an ISO-BMFF (MP4) library and structurally cannot author a Matroska/EBML container.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA; it is a parser/probe library, not a muxer.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA; the raw browser baseline exposes WebCodecs decode/encode but no built-in container muxer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA; this adapter declares transcode/convert flows, not a standalone encoded-packet mux op.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/codec-edges.ts:117-128` (id `edge_hevc_decode_mux_mkv`, `invariant: DECODE_MUX`, `input: 'hevc_1080p_10s.mp4'`, `to: 'mkv'`, `videoCodecs: ['hevc']`). Notes (`:125-127`) state HEVC into Matroska with `CodecPrivate = hvcC`, gated by `decode(mux(x))==decode(x)`, reframing target so no source-keyed packet count is expected — consistent with the single property-invariant oracle observed.
- Fixture: `fixtures/media/hevc_1080p_10s.mp4` EXISTS (~11 MB, real HEVC). Golden decode `fixtures/golden/hevc_1080p_10s.mp4.frames.json` EXISTS with 12 real 1920x1080 frames carrying distinct SHA-256 digests. Not synthetic/mock.
- Oracle: `src/core/oracles.ts:2686-2707` (decode-remux branch of `propertyInvariant`) → `compareDigests` at `src/core/oracles.ts:1166-1207`. This is a REAL comparison: it decodes the engine's actual MKV output with WebCodecs and requires every golden frame's SHA-256 to match (`mismatches>0` fails). Not trivially satisfiable — `compared===0` or any digest mismatch fails; tolerance is exact-hash, not a wide band; this is not an ssim/smoke proxy.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508` (`mux`), packet copy at `:1559-1569`, codec-private (`hvcC`) carried via first-packet `decoderConfig.description` at `:1570-1581`. Genuine mediabunny `Output`/`EncodedVideoPacketSource` library calls; no canned output, no input→output copy of the container, no golden short-circuit, no error swallowing (errors throw; `finally` only closes sources).
- Verdict: **REAL** — real fixture + real library mux implementation + exact per-frame hash oracle with 12/12 bit-exact measurements.
- Cached note: BOTH passing engines have `cached:true` (mediabunny reason "cached previous PASS result", durationMs 2052; ffmpeg.wasm cached, durationMs 4999). Evidence is reused, not freshly re-run — staleness risk is low because the gate is deterministic bit-exact and inputs/goldens are unchanged, but the wall/longtasks numbers reflect a prior run.

## Confidence & caveats

- Confidence: **high** on the winner (mediabunny is the only candidate beating the runner-up on both wall and longtasks while tying on the strongest applicable correctness gate; 5 of 7 engines are honest NA on the mux op/mkv container).
- Caveats: (1) both passing results are `cached`, so timings are historical; (2) n==1, mad==0, no p95 spread, so the perf margin is a single-sample estimate (weaker statistical evidence, though the 1.80x / 4.53x gaps are large); (3) ffmpeg.wasm peakMemory not sampled (n=0), so memory was not part of the decision; (4) correctness between the two PASS engines is genuinely tied (identical 12/12 bit-exact measurements), so the verdict rests entirely on performance.
