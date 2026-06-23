# remux/hevc_1080p_10s_mp4_to_mkv

- **family:** remux
- **fixture asset:** `fixtures/media/hevc_1080p_10s.mp4` (11 MB, real HEVC/`hvc1` + AAC in ISOBMFF)
- **target container:** Matroska (`.mkv`) — lossless re-wrap, no re-encode (HEVC + AAC are both legal in MKV)
- **primaryMetric:** wall (with throughputRealtime / peakMemory / longtasks secondary)
- **passCount:** 2 of 7 (contested)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` (engineId `ffmpeg-wasm`).
- **Contested:** YES — two engines PASS: `ffmpeg-wasm` and `mediabunny`. Both satisfy the *same* single gating oracle (`reference-reimport`) at equal correctness strength, so the decision falls to **performance**.
- **Decisive factor:** wall-clock and realtime throughput. ffmpeg.wasm remuxed in **70.84 ms** vs mediabunny's **121.97 ms** = **1.72x faster wall**, and **141.17x** vs **81.99x** realtime = **1.72x higher throughput**. ffmpeg.wasm also had drastically lower main-thread blocking: **longtasks 2059 ms vs 19963 ms** (mediabunny blocked the main thread ~9.7x longer).
- **Margin caveat:** every metric is n=1 (single sample, mad=0, p95==median), so the perf margin is real but single-shot; both results are `cached==true` (reused, not re-run this pass).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 70.84 ms | 141.17x | 127,164,671 B (~121 MB) | 2059 ms | cached previous PASS |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 121.97 ms | 81.99x | 0 (not measured, n=0) | 19963 ms | cached previous PASS |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | does not declare output container 'mkv' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | does not declare output container 'mkv' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | does not declare operation 'remux' |

## Why the winner wins (deep technical)

**The operation.** This is a *lossless container change*: HEVC (`hvc1`) video + AAC audio are demuxed from an ISOBMFF (`mp4`) box tree and re-emitted into a Matroska EBML stream. No pixels are decoded; the coded HEVC NAL access units and AAC frames are copied verbatim — only the framing changes (ISOBMFF `stsd/hvcC` + `mdat` interleave → Matroska `Tracks/CodecPrivate` + `SimpleBlock`/`BlockGroup` clusters). Because HEVC decode is browser-gated and the corpus golden frames are placeholders, the default remux gate here is structural, not pixel-level (see `src/scenarios/remux/_shared.ts:18-26` and `defaultOracles` at `:77-81`, which attach only `reference-reimport`).

**Winner backend.** ffmpeg.wasm runs the real Emscripten FFmpeg build single-threaded in wasm. Its `remux()` (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) writes the input to MEMFS, probes tracks via `runInfo`, calls `assertRemuxContainerCompatible` (`:2040` — a no-op for non-WebM targets, so MKV is allowed), then builds the canonical stream-copy command: `['-i', <in>, '-map', '0', '-c', 'copy', <out.mkv>]` (`:2044`). `-map 0` preserves *all* input streams (both video and audio survive — confirmed by the oracle seeing 2 media tracks), and `-c copy` guarantees no re-encode. There is no faststart/fragment path for MKV (those branches at `:2045-2055` only fire for mp4/mov/ts), so the MKV write is the plain Matroska muxer over copied packets.

**Oracle measurements (ffmpeg.wasm).** `reference-reimport` re-imports the produced MKV with the reference engine and diffs media-track semantics (`src/core/oracles.ts:1225-1271`, `semanticRemuxReimport` `:1273+`). Result: **770 packets, 475 keyframes, 2 media tracks** vs **2 golden media tracks**; **durationDeltaSec 0.042 s** within **durationToleranceSec 0.1 s**. The gate checks track count + per-type track layout + a duration band (`:1289-1323`); ffmpeg.wasm matched track count (2==2) and stayed inside the 0.1 s duration window, so it PASSED. The 770/475 packet/keyframe figures are physically plausible for a 10 s HEVC clip (~77 fps-equivalent demuxed access units across video+audio, dense keyframing typical of a short test asset).

**Why it beat mediabunny on perf.** mediabunny's `remux()` (`src/engines/mediabunny/adapter.ts:1244-1260`) is also a genuine lossless copy — it opens an `Input`, builds an `Output` with the MKV format, and runs `runConversion` with no codec options (sample copy). Its `env.configUsed` shows `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`, `wasmThreads:0`. For a *pure remux* the WebCodecs/hardware decode path is irrelevant (no frames are decoded), so mediabunny's streaming-lockstep conversion machinery adds per-block JS overhead without payoff here. The measured cost: **121.97 ms wall** and a **19963 ms longtasks** figure (its conversion loop blocked the main thread far longer), versus ffmpeg.wasm's tight wasm copy loop at **70.84 ms** and **2059 ms** longtasks. ffmpeg.wasm is **1.72x faster wall**, **1.72x higher realtime throughput**, and blocks the main thread **~9.7x less**. The one nominal mediabunny advantage — peakMemory — is unmeasured (n=0, reported 0), so it cannot be credited; ffmpeg.wasm's 121 MB peak is the only real memory number and reflects the whole-file MEMFS buffering inherent to wasm FFmpeg.

**Correctness parity, not advantage.** mediabunny's own oracle (772 packets, 477 keyframes, 2 tracks, durationDelta 0.069 s < 0.1 s tol) also PASSED. The tiny 770-vs-772 packet / 475-vs-477 keyframe difference is exactly the container-repacketization tolerance the gate is designed to absorb (the gate compares track *semantics*, not exact packet counts for remux ops). Neither engine is "more correct" under this oracle — hence performance is the decisive axis.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (correctness parity) but **lost on performance**: 121.97 ms vs 70.84 ms (0.58x the speed), 81.99x vs 141.17x throughput, and 19963 ms vs 2059 ms longtasks. Its WebCodecs/hardware config buys nothing for a no-decode stream copy; the streaming-lockstep conversion path adds overhead. Not wrong, just slower.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare output container 'mkv'". Honest NA — MP4Box.js is an ISOBMFF-only library; it has no Matroska muxer, so it genuinely cannot write MKV.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest — the bare WebCodecs/Media platform shim exposes decode/encode primitives but no container remux operation.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare output container 'mkv'". Honest — Remotion's webcodecs converter targets MP4/WebM output, not Matroska.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest — the media-parser is a read/demux-only library (no muxing/remux capability).
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest — web-demuxer is, by name and design, a demux-only wrapper; it has no remux/mux path.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/index.ts:77-84` — `{ asset:'hevc_1080p_10s.mp4', from:'mp4', to:'mkv', videoCodecs:['hevc'], audioCodecs:['aac'], notes:'HEVC is legal in mp4 and mkv (not in webm).' }`. ID derived by `remuxId` (`_shared.ts:73-75`) → `remux/hevc_1080p_10s_mp4_to_mkv`. Matches the shard scenarioId exactly.
- **Fixture is real:** `fixtures/media/hevc_1080p_10s.mp4` exists, 11 MB — a real HEVC+AAC MP4, not synthetic/empty/mock. Goldens present (`fixtures/golden/hevc_1080p_10s.mp4.{meta,packets,frames,ssim}.json`).
- **Oracle is real:** `reference-reimport` (`src/core/oracles.ts:1225-1271`, `semanticRemuxReimport` `:1273+`) actually re-imports the produced bytes via `ctx.referenceEngine.demux()` and diffs media-track count, per-type track layout, and a duration band vs golden. It is not trivially satisfiable: it fails on empty packet tables, mismatched track count/layout, or duration drift beyond the (max 0.1 s) tolerance. The shard measurements (770 pkts / 475 kf / 2 tracks / 0.042 s delta) are physically plausible for a 10 s HEVC clip.
- **Winner adapter is genuine:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — real FFmpeg `-map 0 -c copy` stream copy to a real `.mkv` MEMFS output then `readBinary`. No canned output, no input→output passthrough, no short-circuit to the golden, no error swallowing (errors from `this.run` propagate).
- **Gate strength:** This is a *structural* gate (track semantics + duration), not bit-exact pixels. That is the correct and documented gate for a browser-decode-gated HEVC remux (`_shared.ts:18-26`), but it is weaker than a `decoded-frames-bitexact` / `golden-packets` gate. The PASS is real but not pixel-strong.
- **Cached note:** Winner result has **`cached==true`** ("cached previous PASS result") — it was reused from a prior run, not re-executed this pass. Staleness risk: the perf numbers (n=1, mad=0) reflect that earlier single run, not a fresh measurement.
- **Verdict:** **REAL** — real 11 MB HEVC/AAC fixture, real FFmpeg `-c copy` implementation, meaningful (non-trivial, fails-on-drift) structural oracle. The only reservations (structural-not-bitexact gate, cached single-sample perf) lower confidence but do not indicate cheating.

## Confidence & caveats

- **Confidence: medium.** Winner selection is unambiguous: same oracle, same correctness strength, clear ~1.72x perf lead. But evidence is single-shot (n=1, mad=0, p95==median for both) and **both results are cached**, so the margin, while consistent across wall/throughput/longtasks, is not re-validated this run.
- The gate is structural (`reference-reimport`), not pixel-exact — HEVC decode is browser-gated and source frame goldens are placeholders, so no engine could be ranked on decoded-frame fidelity for this cell.
- mediabunny's peakMemory is unmeasured (n=0), so memory could not be compared; ffmpeg.wasm's 121 MB is whole-file wasm buffering, an architectural cost that a streaming engine could in principle beat — not demonstrated here.
- The 5 NA engines are all honest capability gaps (no MKV muxer / no remux op), not under-declared capabilities being hidden.
