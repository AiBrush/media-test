# remux/mp3_xing_mp3_to_mp4

- family: remux
- fixture asset(s): `fixtures/media/mp3_xing.mp3` (64 KB, real MPEG-1 Layer III with a Xing/Info VBR header; 10s, 44100 Hz, 2ch, ~51 kbps)
- primaryMetric: none declared (bench ranked by wall median)
- passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- Status: **CONTESTED** — two engines PASS (ffmpeg-wasm and mediabunny@1.48.0), both satisfying the single gating oracle `reference-reimport`.
- Decisive factor: with correctness comparable (both re-imported exactly 384 packets / 1 audio track), ffmpeg wins on the bench-ranking metric (wall median) AND on duration fidelity inside the oracle. ffmpeg wall 7.915 ms vs mediabunny 8.520 ms = **1.08x faster wall**; throughput 1263.4x vs 1173.7x realtime = **1.076x higher**; and ffmpeg's re-imported duration drift was Δ0.00596 s vs mediabunny's Δ0.03102 s = **~5.2x tighter** against the same 0.1 s tolerance.
- Margin caveat: the win is thin (n==1, mad==0 — single sample, no spread). mediabunny is clearly better on main-thread blocking: longtasks 1901 ms vs 3045 ms (mediabunny 0.62x of ffmpeg's blocking time). See caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 7.915 ms | 1263.4x | 0 (not sampled) | 3045 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 8.520 ms | 1173.7x | 0 (not sampled) | 1901 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:mp3-in-mp4' |

## Why the winner wins (deep technical)

The operation is a **lossless container change**: lift MPEG-1/2 Layer III audio frames out of a raw MP3 elementary stream (with a Xing/Info VBR TOC header in the first frame) and re-wrap them into an ISO-BMFF MP4 (`.m4a`-shaped) `mp4a`/`.mp3` (object type 0x6B / sample entry `mp3 `) track. No decode/re-encode is allowed — the encoded MP3 frames must be copied byte-for-byte and only the container framing (sample table / `stsz`/`stco`/`stts`) is rebuilt. MP3 is legal in MP4, so this is a pure rewrap (scenario notes: "MP3 is legal in MP4 — lossless audio remux", `src/scenarios/remux/index.ts:126`).

ffmpeg-wasm performs this with the genuine ffmpeg program via `-i <in> -map 0 -c copy -movflags +faststart` (`src/engines/ffmpeg-wasm/adapter.ts:2044-2049`). `-c copy` is a true stream copy (no codec context allocated for re-encode), `-map 0` explicitly maps every input stream so no track is dropped, and `+faststart` relocates the `moov` atom ahead of `mdat` for progressive playability. Before muxing it runs `assertRemuxContainerCompatible` (`adapter.ts:2040`) so an illegal codec/container pairing would throw rather than silently mis-mux — confirming the path is a real, validated remux and not a copy-through. The single-thread wasm build then emits a faststart MP4 whose sample table reproduces all 384 MP3 frames; the reference engine re-demuxes it to exactly **384 packets / 384 keyframes / 1 media track** with a duration drift of only **0.00596 s** versus the 10 s golden — well inside the oracle's 0.1 s band (`oracleOutcomes[0].measurements`).

mediabunny does the same job through its `Conversion` API with no codec/transform options, which copies encoded samples (`src/engines/mediabunny/adapter.ts:1244-1259`: `makeOutputFormat` → `new Output` → `runConversion`). It is an equally honest stream copy and also re-imports to **384 packets / 1 track**, but its duration drift was **0.03102 s** — ~5.2x larger than ffmpeg's, reflecting slightly looser MP3-frame-to-sample-duration rounding when rebuilding the `stts`. Both pass; ffmpeg is simply tighter and, on the bench's wall-median ranking, faster (7.915 ms vs 8.520 ms; 1263.4x vs 1173.7x realtime). The decisive lever is therefore the structural/metadata oracle's duration sub-measurement plus wall median, both of which favor ffmpeg-wasm.

Caveat on the win's robustness: every bench here is n==1 with mad==0, so the wall/throughput edge is a single-shot measurement, not a distribution. And on `longtasks` (cumulative main-thread blocking) mediabunny is materially better — 1901 ms vs 3045 ms — because it runs as pure-TS ESM in-process (`coreBuild: pure-ts-esm`, `sharedArrayBuffer:false`, `coopCoep:not-required`) and streams samples without a wasm/MEMFS round-trip, whereas ffmpeg.wasm pays for writing the input into MEMFS, invoking the wasm program, and reading the output back. For a UI-responsiveness-sensitive deployment mediabunny would be the better pick; under the stated ranking (correctness strength, then wall) ffmpeg-wasm wins.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost): correct lossless remux, re-imported 384 packets / 1 track, but lost the tiebreak — wall 8.520 ms (1.08x slower than ffmpeg), throughput 1173.7x (0.93x of ffmpeg), and a looser re-import duration drift Δ0.03102 s vs ffmpeg's Δ0.00596 s. It does beat ffmpeg on longtasks (1901 vs 3045 ms).
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: web-demuxer is a demux-only wrapper around libavformat WASM with no muxer, so it genuinely cannot produce an MP4. Not an under-declaration.
- **platform@chrome-149**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: the platform engine wraps WebCodecs (decode/encode) and HTMLMediaElement; the browser exposes no container muxer API, so remux is genuinely out of scope.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare input container 'mp3'". Honest: mp4box.js parses/segments ISO-BMFF only; it cannot ingest a raw MP3 elementary stream as a source, so it has no path to read the input.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: media-parser is a read/probe parser with no muxing output.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — "engine does not declare feature 'remux:mp3-in-mp4'". Plausible/honest: the remotion-webcodecs converter is WebCodecs-centric and MP3 is not a WebCodecs-encodable/copy-supported audio codec in its mux path, so it declines this specific feature token rather than the whole `remux` op (it declares other remux features elsewhere) — a granular, defensible NA rather than a blanket under-declaration.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/index.ts:120-127` — case `{ asset: 'mp3_xing.mp3', from: 'mp3', to: 'mp4', audioCodecs: ['mp3'], features: ['remux:mp3-in-mp4'] }`, expanded by `buildRemuxAll` into id `remux/mp3_xing_mp3_to_mp4`. Notes: "MP3 is legal in MP4 — lossless audio remux".
- Fixture: `fixtures/media/mp3_xing.mp3` EXISTS (64 KB real MP3). Goldens exist: `fixtures/golden/mp3_xing.mp3.meta.json` (container mp3, 10 s, mp3 44100/2ch) and `fixtures/golden/mp3_xing.mp3.packets.json` (**384 packets** — matches both engines' re-imported count exactly). Real media, not synthetic/mock.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069`. Genuine ffmpeg.wasm invocation: `-i … -map 0 -c copy [-movflags +faststart] <out>`, output read back from MEMFS via `readBinary`. No canned output, no input→output passthrough, no short-circuit to a golden, no error swallowing (`assertRemuxContainerCompatible` throws on incompatible pairings).
- Oracle: `reference-reimport` at `src/core/oracles.ts:1225-1271`, remux path → `semanticRemuxReimport` (`oracles.ts:1273-1377`). It demuxes the engine's *actual output bytes* with an independent reference engine and checks: non-empty packet table, media-track count vs golden, per-type track layout, and duration delta against the golden within a tolerance (here 0.1 s). This is a real structural/metadata comparison, not a smoke gate and not trivially satisfiable. Measurements are physically plausible: 384 packets / 384 keyframes (every MP3 frame is independently decodable = a keyframe, expected for MP3), 1 audio track, sub-0.04 s duration drift on a 10 s clip.
- cached note: BOTH winners report `cached:true` ("cached previous PASS result"). Evidence was reused, not re-run this session — staleness risk applies to the exact wall/longtasks numbers (per launcher seeding caveat: stale PASS can be reused). The structural result (384/1) is stable and corroborated by the golden, so the PASS itself is trustworthy even if the timings are from a prior run.
- Verdict: **REAL** — real fixture, real ffmpeg `-c copy` implementation, meaningful structural+duration oracle with golden-corroborated packet counts.

## Confidence & caveats

- Confidence: medium. The PASS and correctness conclusions are solid (real code, real fixture, golden-matched 384 packets). The *winner choice* is thin: ffmpeg leads by only 1.08x wall and 1.076x throughput on n==1/mad==0 single-sample benches, so the timing margin is not statistically robust.
- Counter-signal: mediabunny decisively wins `longtasks` (1901 ms vs 3045 ms, 0.62x) and runs in-process with no COOP/COEP requirement (`coopCoep:not-required`, `sharedArrayBuffer:false`); for main-thread responsiveness or no-cross-origin-isolation environments mediabunny is the better engineering choice despite losing the headline wall metric.
- Both results are cached — re-running fresh (clear raw + .browser-cache) is advised before treating the wall/longtasks deltas as authoritative.
- peakMemory was not sampled (n==0) for either engine, so the memory tiebreaker could not be applied.
