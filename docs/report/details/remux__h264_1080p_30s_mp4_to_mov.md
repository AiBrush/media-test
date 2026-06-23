# remux/h264_1080p_30s_mp4_to_mov

family: remux | fixture asset: `h264_1080p_30s.mp4` (H.264 1080p30 + AAC-LC 48k stereo, ~31 MB) → MOV (QuickTime) | primaryMetric: wall | passCount: 2/7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- **CONTESTED**: two engines PASS (`ffmpeg-wasm`, `mediabunny`). Correctness is comparable — both satisfy the single gating oracle `reference-reimport` — so the decision falls to **performance**.
- **Decisive factor: wall-clock and main-thread responsiveness.** ffmpeg.wasm remuxes in **177.42 ms** vs mediabunny's **362.18 ms** (**2.04x faster**), at **169.09x** realtime vs **82.83x** (**2.04x**), and — most strikingly — blocks the main thread for only **179 ms** of long-tasks vs **1901 ms** (**10.6x less** main-thread jank).
- **Margin over runner-up (mediabunny):** 2.04x faster wall, 2.04x higher realtime throughput, 0.094x long-tasks (i.e. mediabunny stalls the UI ~10.6x longer). Caveat: both samples are **n==1** (single timed run, mad=0, p95==median), so the perf ranking is directional, not statistically hardened.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 177.42 ms | 169.09x | (not sampled, n=0) | 179 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 362.17 ms | 82.83x | 59,940,098 B (~57.2 MB) | 1901 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |

## Why the winner wins (deep technical)

This cell is a **lossless container re-wrap**: H.264 (AVCC, length-prefixed NALs) + AAC-LC coded samples are lifted out of the ISO-BMFF MP4 and re-boxed into a QuickTime `.mov`. MP4 and MOV are both ISOBMFF dialects, so the coded samples are byte-identical; only the box/brand layer changes (no decode, no re-encode). The gate is `reference-reimport` (`src/core/oracles.ts:1273` `semanticRemuxReimport`), which re-imports the produced bytes with the reference engine and diffs media-track count/layout, duration (tol = max(band, 0.1 s) per `oracles.ts:1318`), and "video output must contain keyframes" (`oracles.ts:1361-1365`). It does NOT require exact packet counts — packet count is informational in `measurements`.

**ffmpeg.wasm** (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) runs a true stream-copy: it probes the input (`runInfo` → `metadataFromLog`), calls `assertRemuxContainerCompatible` (`adapter.ts:2040`) to confirm H.264/AAC are legal in MOV, then invokes the wasm `ffmpeg` binary with `['-i', in, '-map', '0', '-c', 'copy', '-movflags', '+faststart', out.mov]` (`adapter.ts:2044-2049,2062-2063`). `-map 0` preserves both tracks (avoids ffmpeg's default one-stream-per-type drop); `-c copy` guarantees no transcode; `+faststart` does a second pass to move `moov` ahead of `mdat`. The result re-imports as **2308 packets, 1423 keyframes, 2 media tracks, durationDeltaSec=0.0** — i.e. it reproduces the golden packet table *exactly* (golden `h264_1080p_30s.mp4.packets.json` = 2308 entries) with zero duration drift. This exactness is a consequence of ffmpeg's demuxer/muxer preserving the original sample table 1:1.

**mediabunny** (`src/engines/mediabunny/adapter.ts:1244-1259`) is also genuine: it builds an `Output` with `makeOutputFormat('mov', …)` and runs `runConversion` over an opened `Input` (its `Conversion` pipeline stream-copies compatible tracks). It passes too — **2310 packets, 1425 keyframes, 2 tracks, durationDeltaSec=0.08 s** (under the 0.1 s tolerance, `oracles.ts:1318`). The +2 packets / +0.08 s tail come from mediabunny materializing an extra edit/priming-style sample pair and a small audio-block-rounding tail during its sample-by-sample re-mux — semantically identical, structurally a hair looser than ffmpeg's exact 2308/Δ0.

So **correctness is a near-tie, edging to ffmpeg** (exact 2308 vs 2310 packets, Δ0 vs Δ0.08 s) — but the decisive gap is **execution cost**. ffmpeg.wasm's monolithic native-code demux→remux→faststart loop runs in **177.42 ms / 169.09x realtime** and yields only **179 ms** of long-tasks because the heavy work happens inside the wasm module in one tight burst. mediabunny's TS pipeline (`env.configUsed`: `coreBuild: "pure-ts-esm"`, `pipeline: "streaming-lockstep"`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`) re-muxes sample-by-sample in JS, taking **362.17 ms / 82.83x** and — critically — **1901 ms of long-tasks**, ~10.6x more main-thread blocking, because each sample hop is JS work on the UI thread. For a 30 s 1080p asset that is a real responsiveness difference. (mediabunny does report peakMemory ~57.2 MB; ffmpeg.wasm did not sample peakMemory, n=0, so memory is not comparable here.)

Net: comparable, slightly-stronger correctness for ffmpeg + a clean 2.04x wall / 10.6x long-task advantage → ffmpeg.wasm wins.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (reference-reimport true), lost on performance: 362.17 ms vs 177.42 ms (2.04x slower), 82.83x vs 169.09x realtime, and 1901 ms vs 179 ms long-tasks (10.6x more main-thread blocking) from its pure-TS sample-by-sample re-mux. Marginally looser correctness too: 2310 packets / Δ0.08 s vs ffmpeg's exact 2308 / Δ0.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: the WebCodecs platform shim exposes decode/encode primitives but no container muxer, so it cannot write a MOV.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: it is a *parser/demuxer*, not a muxer; no write path exists.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: name says it all — demux only, no output container writer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mov'". Plausibly honest: it can mux some containers but does not register a QuickTime/MOV writer. (It may emit MP4; not declaring MOV looks like a real capability gap, not an under-declaration of remux generally.)
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mov'". Honest-leaning: mp4box.js writes ISOBMFF/fragmented MP4 but does not advertise a QuickTime-branded MOV output, so it correctly abstains rather than emitting a mislabeled file.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/index.ts:40` — `{ asset: 'h264_1080p_30s.mp4', from: 'mp4', to: 'mov', videoCodecs: ['h264'], audioCodecs: ['aac'] }`, built via `buildRemux` in `src/scenarios/remux/_shared.ts:84` (id `remux/h264_1080p_30s_mp4_to_mov`, op `remux`, oracle `reference-reimport`).
- **Fixture exists & is real:** `fixtures/media/h264_1080p_30s.mp4` present, **~31 MB** real H.264/AAC media (not synthetic/empty). Golden truth: `fixtures/golden/h264_1080p_30s.mp4.meta.json` (2 tracks: H.264 1920x1080@30, AAC 48k/2ch, 30 s) and `…packets.json` (2308 packet entries) — real packet table, not a stub.
- **Oracle is meaningful:** `src/core/oracles.ts:1273` `semanticRemuxReimport` performs a real reference re-import of the produced bytes, diffs media-track count/layout, duration vs golden (Δ within max(band,0.1 s)), and rejects video output with zero keyframes (`oracles.ts:1361-1365`). Not trivially satisfiable: it parses actual output structure. It is *structural*, not bit-exact or perceptual (no SSIM/exactFrames here), so this is the appropriate-but-not-strongest gate for a lossless re-wrap.
- **Winner implementation is genuine:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — real wasm `ffmpeg` invocation `-map 0 -c copy -movflags +faststart`, reads back actual output bytes (`readBinary`), cleans up scratch. No canned output, no input→output copy short-circuit, no golden short-circuit, no error swallowing (it `assertRemuxContainerCompatible` and lets failures throw). Measurements (2308 packets / 1423 kf / Δ0) match the golden table exactly, which is physically consistent with a stream copy.
- **Verdict: REAL.** Real 31 MB fixture, real ffmpeg.wasm stream-copy remux, meaningful structural re-import gate, plausible measurements.
- **Cached note:** the winning ffmpeg.wasm result has `cached:true` (reason "cached previous PASS result"); mediabunny's is also `cached:true`. Both rows are reused, not freshly re-run — a known staleness risk in this suite. Per project memory (launcher seeding caveat), a fully honest fresh run would clear raw + .browser-cache. Confidence in the PASS verdicts is high (oracle logic + goldens are deterministic), but the exact perf numbers (n==1) could shift on a fresh run.

## Confidence & caveats

- **Correctness: high.** Both PASS engines satisfy a real structural oracle against real goldens; ffmpeg's exact 2308/Δ0 match is the strongest available signal short of bit-exact.
- **Performance ranking: medium.** ffmpeg's 2.04x wall and 10.6x long-task advantage is large and self-consistent (wall and realtime agree exactly), but both engines have **n==1** (mad=0, p95==median), so it is a single-sample observation, not a distribution. The long-task gap (179 vs 1901 ms) is the most decision-relevant and least likely to be noise given the architectural difference (native wasm burst vs pure-TS per-sample JS).
- **Memory not comparable:** ffmpeg.wasm did not sample peakMemory (n=0); only mediabunny reports ~57.2 MB.
- **Staleness:** both winning/runner-up rows are `cached:true`; numbers reflect a prior run.
- The 5 NA_ENGINE engines are correct abstentions (demuxers/parsers without a MOV muxer), not under-declared capabilities being hidden.
