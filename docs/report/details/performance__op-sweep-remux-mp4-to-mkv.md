# performance/op-sweep-remux-mp4-to-mkv

family: performance | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264/AAC in MP4) | primaryMetric: throughputRealtime | passCount: 2 / 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (`ffmpeg-wasm`).
- Status: **CONTESTED** — two engines PASS (ffmpeg-wasm and mediabunny@1.48.0). The other five are NA_ENGINE (capability not declared).
- Decisive factor: both passing engines satisfy the *identical* oracle set (`reference-reimport` structural + `playback-smoke`) with semantically equivalent output, so correctness is a tie. The tie breaks on the declared **primaryMetric throughputRealtime**: ffmpeg-wasm muxes at **174.71 x-realtime** vs mediabunny's **85.55 x-realtime** — a **2.04x** throughput win, mirrored by wall time (171.72 ms vs 350.67 ms, **2.04x faster**).
- Margin over runner-up (mediabunny): 174.71 / 85.55 = **2.04x throughputRealtime**; 350.665 / 171.715 = **2.04x lower wall**. Output sizes nearly identical (31,250,018 vs 31,281,905 bytes; 0.10% delta). Evidence strength is moderate: n=1, warmup=1, mad=0 for both (single timed sample each), and both results are `cached==true`.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass, playback-smoke:pass | 171.715 ms | 174.708 x | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:pass, playback-smoke:pass | 350.665 ms | 85.552 x | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

(peakMemory / longtasks were not emitted in the bench block for this scenario; bench carries only throughputRealtime, bytesOut, wall.)

## Why the winner wins (deep technical)

The operation is a **lossless container rewrap**: take H.264 video + AAC audio elementary streams out of the MP4 (ISO-BMFF) box structure and repackage them into the Matroska/MKV EBML structure with **no transcode** (`-c copy`). Because no pixels are decoded or re-encoded, this is an I/O- and parsing-bound copy, so the scenario correctly ranks on `throughputRealtime` (mediaSec / wallSec) rather than a codec-quality metric.

ffmpeg-wasm's path (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) builds the argv `[...inputOptions, '-i', in, '-map', '0', '-c', 'copy', out.mkv]`. The `-map 0` explicitly forwards every input stream (so the secondary AAC track is not dropped by ffmpeg's default one-stream-per-type selection), and `-c copy` performs a pure packet-level stream copy through libavformat's Matroska muxer. For MP4/MOV outputs the adapter would add `-movflags +faststart`, but for MKV no faststart pass is needed — Matroska needs no moov-relocation rewrite — so the copy is a single linear pass. This runs inside the compiled libav demux→remux pipeline (a single highly optimized native-C-to-wasm loop), which is why it lands at **174.71 x-realtime / 171.72 ms wall** for a 30 s asset.

mediabunny's path (`src/engines/mediabunny/adapter.ts:1244-1260`) opens the input via `openInput`, constructs an `Output` with the `MkvOutputFormat` (`src/engines/mediabunny/codecs.ts:131,168` maps `mkv -> MATROSKA`), and runs `runConversion` with no codec/transform options, which copies encoded samples losslessly. Per `env.configUsed`, mediabunny ran with `backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`. For a stream-copy remux no WebCodecs decode/encode is actually exercised (no re-encode), so the cost here is mediabunny's **pure-TypeScript ESM** demux/parse plus EBML mux running in the JS engine and shuffling samples through its streaming-lockstep state machine. That pure-TS sample marshalling is roughly 2x slower than libav's compiled copy loop on this 31 MB file, producing **85.55 x-realtime / 350.67 ms wall**.

The correctness gate is `reference-reimport` (`src/core/oracles.ts:1225-1271`, semantic remux branch `semanticRemuxReimport` at 1273+). It re-demuxes each engine's MKV output through a reference engine and compares media-track count, per-type track layout, and duration drift against the golden. Both engines pass with physically plausible, near-identical numbers:
- ffmpeg-wasm: reimportPackets 2308, reimportKeyframes 1423, reimportMediaTracks 2 (golden 2), durationDeltaSec 0.042 (tol 0.1).
- mediabunny: reimportPackets 2310, reimportKeyframes 1425, reimportMediaTracks 2 (golden 2), durationDeltaSec 0.080 (tol 0.1).

The tiny packet/keyframe deltas (2308 vs 2310; 1423 vs 1425) and sub-frame duration deltas are exactly the kind of edit-list / block-rounding differences expected between two honest Matroska muxers on the same media — neither is identity-copying the input, both are genuinely re-laying-out the streams. Both then pass `playback-smoke` (`<video>` actually decoded a few frames of the output). Since the oracle ladder places `reference-reimport` in the structural/metadata-exact tier and both engines pass it equivalently, correctness is a wash and **performance is the decisive axis** — which ffmpeg-wasm wins decisively at 2.04x.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on speed: throughputRealtime 85.55x vs 174.71x (**0.49x**, i.e. 2.04x slower) and wall 350.67 ms vs 171.72 ms. Mechanistic cause: its remux runs a pure-TS-ESM demux + Matroska mux (`adapter.ts:1244`, `codecs.ts:131/168`) rather than a compiled-C stream-copy loop. Correctness was equivalent (2310 packets / 2 tracks / Δ0.080 s).
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest NA — MP4Box.js is an ISO-BMFF (MP4) library and has no Matroska/EBML muxer; it genuinely cannot emit MKV.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest NA — its output muxers target MP4/WebM (its WebM is not declared as MKV here), so MKV output is correctly out of scope for this scenario's `containersOut:['mkv']`.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — web-demuxer is a demux-only library (no muxer), so it cannot produce any remuxed output.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — the raw browser platform path (WebCodecs/MSE) exposes no general container muxer for remux; declaring it would be a false capability.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — media-parser is a parser/demuxer, not a muxer.

All five NAs look honest (parser-only or wrong-container libraries), not under-declared capabilities. None of the five is a credible hidden remux-to-MKV engine.

## Anti-cheat validation

- Scenario definition: `src/scenarios/performance/op-sweep.ts:74-94` (`sweepRemux`, id `performance/op-sweep-remux-mp4-to-mkv`). Input is `BIG_READ_GOLDEN` = `h264_1080p_30s.mp4` (`src/scenarios/performance/_shared.ts:71`), options `{container:'mkv'}`, requires H.264-in-MP4 / AAC, out MKV. Oracles `['reference-reimport','playback-smoke']`, primary `throughputRealtime`.
- Fixture exists and is real: `fixtures/media/h264_1080p_30s.mp4`, 31 MB on disk (not synthetic/empty/mock). Output bytes (~31.25–31.28 MB) are consistent with a lossless rewrap of a 31 MB source — sizes track the source, confirming a real copy rather than a stub.
- Oracle implementation: `src/core/oracles.ts:1225` (`referenceReimport`) → `:1273` (`semanticRemuxReimport`). It re-demuxes the engine's actual output through an independent reference engine and diffs media-track count, per-type layout, and duration vs golden. This is a real cross-engine comparison; it is not trivially satisfiable (empty packet tables are explicitly failed at `:1245`, duration drift beyond tol fails at `:1321`). Measurements (2308/2310 packets, 1423/1425 keyframes, 2 tracks, Δ0.042/0.080 s) are physically plausible for a 30 s 1080p clip.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — genuine `ffmpeg -i ... -map 0 -c copy out.mkv` via real wasm exec (`this.run`), reads back actual output bytes (`readBinary`). No canned output, no input->output passthrough, no golden short-circuit, no error swallowing (`run` throws on non-zero exit).
- Verdict: **REAL**. Real fixture + real libav stream-copy implementation + meaningful cross-engine structural oracle, with plausible measurements.
- Cached note: both PASS results have `cached==true` ("cached previous PASS result"). The verdict reuses prior runs rather than a fresh re-run, so there is staleness risk — the throughput numbers were not re-measured this run. The relative ranking (ffmpeg-wasm 2x faster) is large enough to survive minor cache drift, but the absolute x-realtime figures should be treated as last-known, not freshly verified.

## Confidence & caveats

- Confidence: **high** on the winner and on REAL classification; the 2.04x throughput margin is large and consistent across both throughputRealtime and wall, and both adapters are verified genuine.
- Caveats: (1) Both winning samples are **n=1, warmup=1, mad=0** — a single timed measurement each, so the precise x-realtime values are weak evidence even though the 2x gap is robust. (2) Both results are **cached** (not re-run this session), adding staleness risk to the absolute timings. (3) No peakMemory/longtasks were captured for this scenario, so the memory tiebreaker could not be evaluated (ffmpeg.wasm typically carries a heavier wasm heap than mediabunny's pure-TS path — not measured here). (4) Tiebreaker note: mediabunny needs no COOP/COEP and ships a smaller pure-TS bundle, but those secondary factors do not override a clean 2x performance win on the declared primaryMetric.
