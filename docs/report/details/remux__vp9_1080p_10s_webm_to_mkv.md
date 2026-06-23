# remux/vp9_1080p_10s_webm_to_mkv

family: remux | fixture asset: `vp9_1080p_10s.webm` (9.3 MB, VP9 video + Opus audio in WebM/Matroska) | primaryMetric: wall | passCount: 2

## Verdict

- Best framework: **mediabunny@1.48.0**
- Status: **CONTESTED** — two engines passed (mediabunny, ffmpeg.wasm). Both passed the same gating oracle (`reference-reimport`) with effectively identical structural results, so correctness is a tie and the decision falls to performance.
- Decisive factor: **wall-clock and main-thread responsiveness**. Mediabunny remuxes in 41.25 ms vs ffmpeg.wasm's 89.93 ms — **2.18x faster wall** and **2.18x higher realtime throughput** (242.6x vs 111.3x). The larger gap is main-thread blocking: mediabunny logs **474 ms** of long-tasks vs ffmpeg.wasm's **1901 ms** — **4.01x less** UI-blocking work.
- Margin over runner-up: 2.18x faster wall, 2.18x throughput, 4.01x fewer long-task ms. (Both measured at n=1, so the margin is directionally strong but not statistically averaged — see caveats.)

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 41.25 ms | 242.62 x | 46,248,065 B (~44.1 MB) | 474 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 89.93 ms | 111.29 x | 0 B (not sampled) | 1901 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |

## Why the winner wins (deep technical)

This is a **lossless container conversion**: VP9 video and Opus audio coded samples are copied byte-for-byte from a WebM (Matroska) wrapper into an MKV (Matroska) wrapper. No pixels are decoded or re-encoded, so the only "work" is demuxing the EBML/Matroska elements of the source, re-emitting them into the MKV structure, and re-laying-out the cluster/block timestamps. Both passing engines do exactly that as a genuine stream copy.

**Correctness is a true tie.** The gating oracle for this cell is `reference-reimport` only (default for remux cells, set in `src/scenarios/remux/_shared.ts:78-81`; scenario defined at `src/scenarios/remux/index.ts:87`). The oracle (`src/core/oracles.ts:1225` → `semanticRemuxReimport` at `:1273`) re-imports each engine's output with the reference engine and diffs media-track count, per-type track layout, and duration against the golden (`fixtures/golden/vp9_1080p_10s.webm.meta.json`: 2 tracks — vp9 video 1920x1080@30, opus audio 48000Hz/2ch; durationSec 10.008). Both engines produced a parseable Matroska file with **2 media tracks** matching golden's 2, and **801 packets / 506 keyframes** on re-import. Duration delta: mediabunny Δ0.007s, ffmpeg.wasm Δ0.020s — both well under the 0.1s tolerance (`oracles.ts:1318` floors the tol at 0.1s for remux block-rounding). This is a structural/metadata-exact gate (no bit-exact frame digest is attached for this cell, per `_shared.ts:19-21`), so neither engine earns a correctness-strength advantage — both clear the same bar with comparable margins.

**Mediabunny's mechanistic edge is its backend and pipeline.** Mediabunny ran with `env.configUsed.backend="webcodecs"`, `pixelBackend="VideoSample.copyTo(RGBA)>canvas"`, `wasmThreads=0`, `coreBuild="pure-ts-esm"`, `sharedArrayBuffer=false`, `coopCoep="not-required"`, `pipeline="streaming-lockstep"`. Its `remux()` (`src/engines/mediabunny/adapter.ts:1244-1260`) is a thin, pure-TypeScript path: it opens the input (`openInput`), builds an MKV `Output` via `makeOutputFormat`, and drives `runConversion` with no `video`/`audio` transform options — mediabunny's Conversion then recognizes a codec-compatible target and **stream-copies the encoded VP9/Opus samples** rather than transcoding. There is no WASM module to instantiate, no MEMFS, and no virtual-filesystem round-trip; the EBML parse and re-mux run as native JS over the buffered source. That keeps total work tiny: 41.25 ms wall, ~44.1 MB peak memory, and only 474 ms of long-tasks.

**ffmpeg.wasm pays a fixed WASM tax.** Its `remux()` (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) is also an honest stream copy — `['-i', name, '-map', '0', '-c', 'copy', outName]`, with `-map 0` to keep both tracks — but it must (a) write the 9.3 MB input into the emscripten MEMFS (`writeInput`), (b) run a metadata probe pass (`runInfo` at `:2039`) plus the codec-compatibility assert, (c) execute the full ffmpeg CLI inside WASM, and (d) read the output back out of MEMFS. That demux/probe/mux/copy-back overhead is what shows up as 89.93 ms wall and a heavy **1901 ms** of long-tasks — roughly 4x mediabunny's main-thread occupancy, which on a real page is the difference between a smooth and a janky frame budget. (peakMemory was not sampled for ffmpeg here — `n=0`, reported 0 — so memory cannot be compared.)

Net: identical correctness, but mediabunny is 2.18x faster on the primary metric and far gentler on the main thread, with no COOP/COEP/SharedArrayBuffer requirement. It is the clear winner for VP9+Opus WebM→MKV remux.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** Correct and honest stream copy, but 2.18x slower wall (89.93 ms vs 41.25 ms), 2.18x lower throughput (111.3x vs 242.6x), and 4.01x more long-task time (1901 ms vs 474 ms) due to MEMFS I/O, a separate probe pass, and WASM execution overhead. peakMemory not sampled (n=0), so no memory comparison.
- **platform@chrome-149 (NA_ENGINE):** Honest NA — "engine does not declare operation 'remux'". The platform/WebCodecs engine exposes decode/encode primitives, not a container-remux operation; no under-declaration.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** Honest NA — "engine does not declare output container 'mkv'". It can remux but not into MKV, so it is correctly gated out of a `*_to_mkv` cell.
- **web-demuxer@4.0.0 (NA_ENGINE):** Honest NA — "engine does not declare operation 'remux'". It is a demux-only library (produces packets, does not mux/write a container).
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA — "engine does not declare operation 'remux'". A parser/probe library with no muxing path.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — "engine does not declare input container 'webm'". MP4Box is ISO-BMFF (MP4) only and cannot read a Matroska/WebM source.

## Anti-cheat validation

- **Scenario:** `src/scenarios/remux/index.ts:87` — `{ asset: 'vp9_1080p_10s.webm', from: 'webm', to: 'mkv', videoCodecs: ['vp9'], audioCodecs: ['opus'] }`; built by `src/scenarios/remux/_shared.ts:84` (`buildRemux`), default oracle `reference-reimport` (`_shared.ts:78-81`).
- **Fixture exists:** `fixtures/media/vp9_1080p_10s.webm` is a real 9.3 MB file (stat confirmed) — not synthetic/empty/mock. Golden `fixtures/golden/vp9_1080p_10s.webm.meta.json` declares 2 tracks (vp9 1920x1080@30 + opus 48kHz/2ch, durationSec 10.008), consistent with a real 1080p/10s clip.
- **Oracle is real:** `src/core/oracles.ts:1225` (`referenceReimport`) + `:1273` (`semanticRemuxReimport`) actually re-demux the engine output with the reference engine and diff track count, per-type layout, and duration vs golden; it fails on empty packet tables (`:1244-1246`) and duration drift beyond a 0.1s-floored tolerance (`:1318-1323`). Measurements are physically plausible: 801 packets / 506 keyframes (~10s of 30fps VP9 ≈ 300 video frames + ~500 Opus 20ms audio packets), 2 media tracks, Δduration 0.007s. Not trivially satisfiable.
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts:1244-1260` calls the real mediabunny `Output`/`runConversion` Conversion API with no transform options (codec-compatible stream copy). It does not return canned bytes, does not copy input→output to fake the rewrap (it re-muxes into a distinct MKV `Output`), does not short-circuit to the golden, and does not swallow errors. ffmpeg.wasm's `:2031-2069` is likewise a real `-c copy` CLI invocation.
- **Cached:** Both PASS results have `cached==true` ("cached previous PASS result"). They were reused, not re-run this session — staleness risk noted (a fresh re-run could shift the perf margin, though the 2.18x/4.01x gaps are large enough to survive normal jitter).
- **Verdict: REAL** — real fixture + real stream-copy implementation + a meaningful structural re-import oracle with plausible measurements. The only weakness is that the gate is structural rather than bit-exact (no decoded-frame digest for this cell), but it genuinely verifies a parseable, track-complete, duration-correct MKV.

## Confidence & caveats

- Confidence: **high** on the winner pick. Correctness is a clean tie on the only gating oracle, and the performance margin (2.18x wall, 4.01x long-tasks) is decisive and large.
- Caveat — measurement depth: all bench numbers are **n=1** (mad=0, p95==median), so there is no run-to-run variance estimate; the margin is directional, not statistically averaged. The gap size makes a reversal unlikely.
- Caveat — staleness: both winners are `cached==true`; a fresh re-run is the honest way to confirm the margin per the launcher-seeding caveat.
- Caveat — oracle strength: this is a structural/metadata-exact gate (`reference-reimport`), not bit-exact frame comparison. For lossless remux that is appropriate, but it would not catch a subtle sample-level corruption that still re-imports with the right packet/track/duration shape.
- Caveat — memory: ffmpeg.wasm peakMemory was not sampled (n=0), so the memory axis could not be compared; the decision rests on wall, throughput, and long-tasks.
