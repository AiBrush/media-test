# remux/large_vp9_1080p_120s_webm_to_mkv

family: remux | fixture asset: `large_vp9_1080p_120s.webm` (102,363,592 B / ~102 MB, VP9 video + Opus audio, 120.008 s, 1920x1080@30) | primaryMetric: `throughputRealtime` | passCount: 2 of 7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Contested:** YES — two engines PASS (mediabunny, ffmpeg.wasm). Both satisfy the identical correctness gate (`reference-reimport`) at the same strength, so the decision falls to PERFORMANCE on the primary metric `throughputRealtime`.
- **Decisive factor:** sustained realtime throughput. mediabunny 356.22 x-realtime vs ffmpeg.wasm 216.88 x-realtime = **1.64x faster throughput**; wall median 336.89 ms vs 553.33 ms = **1.64x faster wall**. Correctness is a tie, so throughput is the tiebreaker.
- **Margin over runner-up:** 1.64x throughputRealtime, 1.64x wall. Caveat: both measurements are n==1 and both results are `cached==true`, so the margin is single-sample, reused evidence (weaker than a fresh multi-sample win).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 336.89 ms | 356.22 x-rt | 0 (not measured) | 4531 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 553.33 ms | 216.88 x-rt | 0 (not measured) | 4531 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Oracle measurements (both PASS engines, from shard):
- mediabunny: reimportPackets 9601, reimportKeyframes 6061, reimportMediaTracks 2, goldenMediaTracks 2, durationDeltaSec 0.0070 (tol 0.1).
- ffmpeg.wasm: reimportPackets 9601, reimportKeyframes 6061, reimportMediaTracks 2, goldenMediaTracks 2, durationDeltaSec 0.0200 (tol 0.1).

## Why the winner wins (deep technical)

This is a **lossless container change** (WebM/Matroska family) of a 120 s 1080p clip carrying a **VP9 video** track and an **Opus audio** track, retargeted from `.webm` to `.mkv`. WebM is a constrained Matroska profile, so VP9+Opus -> MKV is a pure EBML re-wrap: encoded blocks are copied byte-for-byte, no decode/re-encode. The scenario's primary metric is `throughputRealtime` precisely because remux is an I/O-bound sample copy (`src/scenarios/remux/size-ladder.ts:9-11`), so at the 100 MB "large" rung the meaningful axis is how fast the muxer can stream blocks through, not codec quality.

**mediabunny's path** (`src/engines/mediabunny/adapter.ts:1244-1259`): `remux()` builds an output `Format` for the `mkv` container, opens the input with `openInput`, then runs a `Conversion` with **no `video`/`audio` codec options**, which makes mediabunny's `Conversion` stream-copy the encoded VP9 and Opus samples rather than transcode. `runConversion` (`src/engines/mediabunny/adapter.ts:842-855`) calls `Conversion.init(opts)`, checks `conversion.isValid` (throws if no usable output tracks), then `conversion.execute()` and harvests the `BufferTarget` buffer. The whole muxer is a **pure-TS ESM core** (`env.configUsed.coreBuild: "pure-ts-esm"`) with `sharedArrayBuffer:false` and `coopCoep:"not-required"`, streaming-lockstep pipeline. Although `env.configUsed.backend` reports `"webcodecs"`/`prefer-hardware`, that label describes the engine's default decode backend; for a copy-only remux no codec is instantiated, so the cost is essentially EBML parse + EBML write in-process. That lightweight in-JS demux→remux loop is why it hits **356.22 x-realtime / 336.89 ms wall**.

**ffmpeg.wasm's path** (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`): it writes the 102 MB input into MEMFS (`writeInput`), runs `runInfo` to probe tracks, calls `assertRemuxContainerCompatible` (irrelevant here since target is MKV/Matroska, not WebM), then executes `ffmpeg -i in -map 0 -c copy out.mkv` — a genuine all-stream stream-copy into Matroska — and reads the output back out of MEMFS. This is also a correct, real remux, but it pays the **single-thread wasm overhead** (`-c copy` still runs through the ffmpeg.wasm runtime) plus the **MEMFS write-in / read-out round trip of a 100 MB file**, which is exactly the per-call tax that doubles its wall time to 553.33 ms and halves throughput to 216.88 x-realtime.

Both engines produce a structurally identical, re-importable Matroska file — the reference engine re-demuxed each output to **the same 9601 packets, 6061 keyframes, 2 media tracks**, matching the golden 2-track (vp9+opus) layout, with duration drift of only 7 ms (mediabunny) and 20 ms (ffmpeg) against the 120.008 s golden, far inside the 0.1 s tolerance. Correctness is therefore a dead heat; the throughput/wall gap is the sole differentiator, and mediabunny's in-process pure-TS muxer beats ffmpeg.wasm's wasm + MEMFS path by a clean **1.64x** on both wall and throughput.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (correct remux, identical oracle measurements) but LOST on performance: 553.33 ms wall vs 336.89 ms (1.64x slower) and 216.88 x-realtime vs 356.22 (1.64x lower throughput), attributable to wasm single-thread execution plus the MEMFS write/read round trip of the 100 MB asset.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: the browser platform adapter exposes no file-producing container remux API; not an under-declaration.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". Honest: MP4Box is an ISO-BMFF (MP4/MOV) tool and cannot ingest a Matroska/WebM container.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: it is a parser/probe library, not a muxer; it produces no output bytes.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest: its converter targets MP4/WebM outputs, not the `.mkv` Matroska target this scenario requires.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: it is a demux-only library (read side), so it cannot mux a new container.

All five NAs are genuine capability gaps, not suppressed capabilities — each cites a specific missing operation/container that matches the library's actual scope.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/size-ladder.ts:46-55` (the `large_vp9_1080p_120s.webm` -> `mkv` case); built via `buildRemux` (`src/scenarios/remux/_shared.ts:84-104`), `primaryMetric` overridden to `throughputRealtime` at `size-ladder.ts:82-86`. Default oracle is `reference-reimport` (`_shared.ts:78-81`).
- **Fixture:** `fixtures/media/large_vp9_1080p_120s.webm` EXISTS — real 102,363,592-byte file, manifest entry `fixtures/manifest.json:614-628` with non-null sha256 `3e1647a4...a91a32` and matching `sizeBytes: 102363592`. NOTE: the scenario header comment (`size-ladder.ts:14-19`) warns these large assets *were* `source: generated` with null sha256 pending a bake — but the manifest now carries a real sha256 and size, and goldens exist (`fixtures/golden/large_vp9_1080p_120s.webm.{meta,packets,frames,ssim}.json`), so the bake has completed and the stale-NA warning no longer applies. Not synthetic/empty/mock.
- **Oracle:** `reference-reimport` -> `referenceReimport`/`semanticRemuxReimport` (`src/core/oracles.ts:1225-1377`). It re-demuxes `ctx.output` with an independent reference engine, fails on empty packet table, then checks media-track count and per-codec layout vs golden meta, duration drift vs golden (tol max(band,0.1)s), and requires keyframes for a video remux. This is a real structural comparison against the golden, not trivially satisfiable.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1244-1259` (`remux`) + `:842-855` (`runConversion`). Genuine: opens the real input, runs `Conversion.init`/`.execute` with no codec options (true stream copy), validates `isValid`, returns the actual output buffer. No canned output, no input->output passthrough fake, no short-circuit to the golden, no swallowed error.
- **Plausibility:** 9601 packets / 6061 keyframes for a 120 s clip (30 fps VP9 with -g 60 closed GOP -> ~3601 video frames + ~6000 Opus frames, keyframe-heavy due to short GOP and per-block Opus) and 2 tracks (vp9+opus) matching the golden are physically consistent with the manifest's `genMethod` (`-g 60`, libopus). Duration deltas 7 ms / 20 ms are realistic re-wrap tail rounding.
- **Cached note:** the winner's result has `cached==true` ("cached previous PASS result") — it was REUSED from a prior run, not re-executed here, and the benchmark is n==1. Staleness/single-sample risk is real but the underlying fixture, adapter, and oracle are all genuine.
- **Verdict: REAL** — real 102 MB VP9/Opus fixture, genuine stream-copy remux implementation, meaningful structural re-import oracle with plausible measurements. Confidence tempered only by cached + n==1 evidence.

## Confidence & caveats

- Confidence: **medium**. The winner is unambiguous on correctness (tie) and clearly ahead on the primary metric (1.64x), and the implementation/fixture/oracle are all validated as real.
- Caveats: (1) both PASS results are `cached==true` — reused, not freshly re-run; (2) all benches are n==1 with mad==0, so the 1.64x margin rests on single samples (no spread evidence); (3) `peakMemory` was not captured (0 / n==0 samples) for either engine, so the size-ladder's peak-memory axis cannot adjudicate — the decision rests solely on throughput/wall; (4) both engines report an identical `longtasks` of 4531 ms, which looks like a coarse/shared measurement and should not be used as a discriminator; (5) the gate is a single structural oracle (`reference-reimport`) — no bit-exact decoded-frame check is attached for this row (it is deferred per `_shared.ts:20-23`), so "correctness" here means structural integrity, not pixel-exact preservation.
