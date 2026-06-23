# remux/h264_in_mkv_mkv_to_ts

family: remux | fixture asset: `h264_in_mkv.mkv` (4.4 MB, real Matroska, H.264 + AAC) | primaryMetric: wall (with throughputRealtime / peakMemory / longtasks) | passCount: 2 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Contested**: 2 engines PASS (mediabunny, ffmpeg.wasm). Both satisfy the identical correctness gate with effectively identical structural measurements, so the contest is decided on **performance**.
- **Decisive factor: wall-clock and main-thread responsiveness.** mediabunny remuxes in **49.125 ms** vs ffmpeg.wasm's **81.32 ms** (**1.66x faster wall**), at **203.99 x-realtime** vs **123.23 x-realtime** (**1.66x higher throughput**), and — most decisively — generates only **173 ms** of long tasks vs ffmpeg.wasm's **1901 ms** (**~11.0x less main-thread blocking**). Both ran cached, n=1.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 49.125 ms | 203.99 x | 53,878,809 B (~51.4 MB) | 173 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 81.32 ms | 123.23 x | 0 (not sampled) | 1901 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

**Operation.** This cell takes H.264 video + AAC audio carried in a **Matroska (MKV)** container and re-wraps the *identical coded samples* into **MPEG-TS**. No re-encode happens: the only real work is the container-framing rewrite — Matroska's length-prefixed (AVCC-style) NAL layout in SimpleBlocks must become **Annex-B start-code** framing inside TS PES packets, with PAT/PMT generation and a 90 kHz PCR/PTS clock. The scenario notes confirm this: "MKV->TS: Matroska H.264 -> MPEG-TS (Annex-B); coded samples identical." (`src/scenarios/remux/matrix.ts:61-68`).

**Correctness is a tie, so it is not the differentiator.** Both PASS engines clear the single gating oracle `reference-reimport` (`src/core/oracles.ts:1225`, semantic remux branch at `:1273` `semanticRemuxReimport`). The oracle re-imports each engine's TS output with the reference engine and checks **media-track preservation** plus a duration-delta band. The measurements are nearly identical:
- mediabunny: reimportPackets **770**, reimportKeyframes **475**, reimportMediaTracks **2**, goldenMediaTracks **2**, durationDeltaSec **0.0050** vs tol **1.50315**.
- ffmpeg.wasm: reimportPackets **770**, reimportKeyframes **475**, reimportMediaTracks **2**, goldenMediaTracks **2**, durationDeltaSec **0.0055** vs tol **1.50315**.

Both reproduce all 2 media tracks, the same 770-packet / 475-keyframe table, and a sub-6-ms duration drift against a ~1.5 s tolerance. Neither output is bit-exact-gated (the default remux battery uses the structural re-import gate, not `decoded-frames-bitexact` — `src/scenarios/remux/_shared.ts:20-26,77-81`), so on the correctness ladder both sit at the **structural/metadata-exact** tier with no separation. Per the decision procedure, that throws the contest to performance.

**Backend mechanism — why mediabunny is faster here.** mediabunny's `env.configUsed` shows a **pure-TS ESM** build (`coreBuild: "pure-ts-esm"`), `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`. Its remux path (`src/engines/mediabunny/adapter.ts:1244` `remux()`) builds the TS `OutputFormat` via `makeOutputFormat(opts.container, ...)`, opens the MKV `Input`, and drives a real `mb.Conversion.init({input, output})` / `conversion.execute()` (`runConversion`, `src/engines/mediabunny/adapter.ts:842-868`). Because source and target codecs are unchanged, mediabunny stays on its **same-codec packet-copy** path (the "copy whenever possible" behavior documented at `adapter.ts:29,669`) — it parses Matroska blocks, re-frames the NALs to Annex-B, and writes TS entirely in JS with no WASM boundary and no worker. The work is light (a single ~5 s clip), so the JS muxer finishes in **49 ms** and only blocks the main thread for **173 ms** total. Peak heap is a modest **~51.4 MB**.

ffmpeg.wasm, by contrast, runs the libavformat MPEG-TS muxer inside a WASM core. Its remux (`src/engines/ffmpeg-wasm/adapter.ts:2031`) writes the input into MEMFS, probes it, then runs `-map 0 -c copy -muxdelay 0 -muxpreload 0 <out>.ts` (`adapter.ts:2042-2055`) — a genuine stream copy with TS-specific PTS-origin normalization (so duration checks measure media length, not the libav ~1.4 s preload). That is correct and lossless, but the cost is real: MEMFS write + WASM transition + libav demux/remux. The shard's **1901 ms longtasks** reflect WASM core init/exec stalling the main thread, vs mediabunny's 173 ms. Net: mediabunny is 1.66x faster wall, 1.66x higher realtime throughput, and ~11x kinder to main-thread responsiveness.

**Tiebreaker reinforcement.** Even if wall were close, mediabunny wins the procedure-(c) tiebreakers: it requires **no COOP/COEP** (`coopCoep: "not-required"`) and **no SharedArrayBuffer**, so it deploys without cross-origin-isolation headers; ffmpeg.wasm's multi-thread core needs those headers and ships a multi-MB WASM payload. mediabunny is single-pass streaming-lockstep, pure-TS, smaller footprint.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correct lossless `-c copy` MKV→TS with proper `-muxdelay 0 -muxpreload 0` origin normalization, identical 770-packet/475-keyframe/2-track re-import. Lost purely on metrics: **81.32 ms** wall (1.66x slower), **123.23 x** throughput (0.60x), and **1901 ms** longtasks (~11x worse main-thread blocking). peakMemory was not sampled (0), so memory cannot be compared.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest NA — remotion-media-parser is a parser/demuxer, it has no muxing/remux write path.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest NA — the browser platform (WebCodecs + MSE) exposes decode/encode but no container muxer; there is no built-in MKV→TS remux primitive.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'mkv'". Honest NA — MP4Box.js is an ISOBMFF (MP4/MOV/fMP4) tool and cannot read Matroska input.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare output container 'ts'". Honest NA — its muxer set does not include an MPEG-TS writer, so the TS target is genuinely unsupported.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest NA — web-demuxer is demux-only (its name is literal); it has no mux/remux output path.

All five NAs are capability-honest: each cites the specific missing facet (operation, input container, or output container) and matches the library's actual scope — none looks like an under-declared capability.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/matrix.ts:61-68` (RemuxCase `asset: 'h264_in_mkv.mkv', from: 'mkv', to: 'ts'`), built via `buildRemux` in `src/scenarios/remux/_shared.ts:84-104`. Default oracle set = `['reference-reimport']` (`_shared.ts:77-81`).
- **Fixture:** `fixtures/media/h264_in_mkv.mkv` exists and is a real 4.4 MB Matroska file (H.264 + AAC), with committed golden `fixtures/golden/h264_in_mkv.mkv.packets.json` (87 KB). Real input, not synthetic/empty/mock.
- **Oracle:** `reference-reimport` at `src/core/oracles.ts:1225`, remux branch `semanticRemuxReimport` at `:1273`. It re-demuxes the engine's actual output bytes with the reference engine, requires a non-empty packet table (`:1244`), and compares media-track count/layout vs golden plus a duration-delta band. This is a real parse-and-compare against the engine's produced container — not trivially satisfiable. The measurements (770 packets, 475 keyframes, 2 tracks, ~5 ms duration drift) are physically plausible for a 5 s H.264+AAC clip.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1244` `remux()` → `makeOutputFormat('ts')` + `mb.Output` + `mb.Conversion.init/execute` (`runConversion`, `:842-868`). Genuine library call; does NOT return canned bytes, does NOT copy input→output (it re-wraps MKV→TS via the real Conversion pipeline), and does NOT short-circuit to the golden. ffmpeg.wasm's path (`src/engines/ffmpeg-wasm/adapter.ts:2031`) is likewise a real `-c copy` exec.
- **Cached note:** mediabunny's result has **cached=true** ("cached previous PASS result"). The PASS was reused, not re-executed this run — staleness risk applies if the adapter or fixture changed since the cached run; however the structural measurements are consistent with ffmpeg.wasm's independent re-import (identical 770/475/2), which corroborates the cached result.
- **Verdict: REAL.** Real fixture + real library remux implementation + a meaningful structural oracle that parses the produced container and compares against golden track layout with plausible measurements.

## Confidence & caveats

- **Confidence: high** that mediabunny is the correct winner: correctness is a genuine tie (identical strong structural measurements), and the performance margins (1.66x wall, ~11x longtasks) plus the no-COOP/COEP / no-SAB deployment advantage are unambiguous.
- **Caveats:** (1) Both PASS results are **cached** and **n=1** with mad=0, so the perf numbers are single-sample point estimates with no spread — a win on n=1 is weaker statistical evidence, though the 1.66x wall and 11x longtasks gaps are large enough to survive normal variance. (2) ffmpeg.wasm's **peakMemory was not sampled (0)**, so the memory dimension is unavailable for it; mediabunny's ~51.4 MB cannot be compared against a real ffmpeg figure. (3) The gate is structural (reference-reimport), not bit-exact decode — both engines could in principle differ in coded-sample fidelity without this oracle catching it, but the MKV→TS path is a pure re-wrap so this is low risk.
