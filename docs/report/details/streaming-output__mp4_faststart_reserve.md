# streaming-output/mp4_faststart_reserve

family: streaming-output | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264 1080p + AAC, 30 s) | primaryMetric: wall | passCount: 2 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`, backend `webcodecs` / `pure-ts-esm` core, `coopCoep: not-required`).
- **CONTESTED**: 2 engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Both clear the identical oracle pair (`reference-reimport` + `mp4-box-layout`) at full strength, so correctness is comparable.
- **Decisive factor: performance + semantic fidelity of `fastStart:"reserve"`.** Mediabunny wall median **92.13 ms vs ffmpeg 181.69 ms = 1.97x faster**, throughputRealtime **325.63x vs 165.12x = 1.97x higher**, longtasks **164 ms vs 330 ms = 0.50x (half the main-thread blocking)**. Output sizes are within 0.2% (31.32 MB vs 31.26 MB). Additionally mediabunny is the only engine that implements a *true* reserved forward moov (single-pass placeholder sized by `maximumPacketCount`), whereas ffmpeg only approximates the shape via a two-pass `-movflags +faststart` rewrite.
- **Margin over runner-up:** 1.97x wall, 1.97x throughput, 0.50x longtasks. Caveat: both samples are n=1, mad=0, and both rows are `cached==true`.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass, mp4-box-layout:pass | 92.13 ms | 325.63x | 54,249,176 B (~51.7 MB) | 164 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass, mp4-box-layout:pass | 181.69 ms | 165.12x | 0 (not sampled) | 330 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:reserve' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:reserve' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

This case asks for a lossless MP4→MP4 **remux** of H.264 video + AAC audio with `shape.fastStart: 'reserve'` and `maximumPacketCount: 4096` (scenario `base.ts:64-76`). "Reserve" means: pre-allocate a forward `moov` box large enough to hold the final sample tables, write it *before* `mdat` in a single pass, then back-fill the sample offsets/sizes once the media is written — the streaming-server pattern that lets a client start playback without a tail seek and without the two-pass cost of a full faststart rewrite.

**Mediabunny.** Its `remux()` special-cases this shape (`src/engines/mediabunny/adapter.ts:1244-1248`): when `opts.fastStart === 'reserve'` it routes through `prepareMuxTracks([input], opts)` then `mux(tracks, opts)` instead of the generic copy `Conversion` path. The mux path adds each track with `output.addVideoTrack(source, { maximumPacketCount: t.chunks.length })` and the audio equivalent (`adapter.ts:1529`, `:1540`), which is exactly the hint mediabunny's Output muxer needs to size the reserved moov. `fastStart: 'reserve'` is forwarded into the OutputFormatOptions in `outputFormatOptionsFrom()` (`adapter.ts:181-198`, the `rawFastStart === 'reserve'` branch). The resulting `mp4-box-layout` measurement is `ftyp@0, moov@28, free@10906, mdat@85186` (moovOffset=28, mdatOffset=85186): the ~74 KB span between the small ftyp+moov and the very-far mdat is the *reserved* region — a placeholder moov plus a large `free` pad, the structural signature of a true single-pass reserve. The oracle confirms `moovOffset(28) < mdatOffset(85186)` so `fastStart:reserve placed moov before mdat`. `reference-reimport` (oracle `oracles.ts:1225`, semantic remux branch `oracles.ts:1243-1247/1273`) re-demuxes the output with the reference engine and recovers **2308 packets, 1423 keyframes, 2 media tracks** (golden 2 tracks), with `durationDeltaSec 0.0213` against a 0.1 s tolerance — proving the back-filled sample tables are byte-correct and no packets were lost.

**Why it beats ffmpeg mechanistically.** Mediabunny runs as pure-TS ESM on the WebCodecs-era container muxer (env `backend: webcodecs`, `coreBuild: pure-ts-esm`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required`). For a pure stream-copy remux there is no decode/encode — the cost is parsing the source sample table and re-emitting it. Mediabunny does this in one JS pass over the MEMFS-free input and writes the reserved moov up front, so it never re-walks the whole file. That is why wall is **92.13 ms** and it sustains **325.63x realtime** with only **164 ms** of long-task time. FFmpeg.wasm, by contrast, has no native "reserve" primitive; its `remux()` (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) emits `-map 0 -c copy -movflags +faststart` (`:2048-2049`). `+faststart` is inherently a **two-pass** operation inside libavformat: ffmpeg first writes the file with moov at the tail, then rewinds and rewrites the entire file to shift moov to the front. On the 31 MB fixture that second full rewrite through the wasm/MEMFS boundary roughly doubles the work — wall **181.69 ms (1.97x)**, throughput **165.12x (0.51x)**, and **330 ms (2.0x)** of long tasks. Its layout `moov@32, free@27342, mdat@27350` shows moov immediately followed by a small free and mdat (the compacted post-rewrite shape), not a reserved forward gap — functionally faststart, but the approximation the adapter itself documents (`adapter.ts:1503` comment: "`+faststart` (moov-first; reserve approximated)").

So even though both produce a valid moov-before-mdat MP4 that re-imports identically, mediabunny wins on (a) ~2x lower wall/long-task cost from single-pass reserve vs ffmpeg's two-pass rewrite, and (b) closer semantic match to the requested `reserve` feature.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed but lost on performance: 181.69 ms wall (1.97x slower), 165.12x throughput (0.51x), 330 ms long tasks (2.0x). Root cause: `-movflags +faststart` (`adapter.ts:2048-2049`) is a two-pass full-file rewrite, not a true single-pass reserve; the adapter openly labels it "reserve approximated" (`adapter.ts:1503`). peakMemory not sampled (n=0). Correctness identical (durationDeltaSec=0, exact).
- **mp4box@2.3.0** — NA_ENGINE, `engine does not declare feature 'fastStart:reserve'`. Honest: mp4box.js is a parser/segmenter; it has no reserved-forward-moov mux primitive, so declining the feature is correct, not an under-declaration.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, `engine does not declare feature 'fastStart:reserve'`. Honest: it declares `remux` generally but not this specific output-shape feature; no reserve API in its WebCodecs muxer path.
- **remotion-media-parser@4.0.479** — NA_ENGINE, `engine does not declare operation 'remux'`. Honest: it is a parser/demuxer only, no muxing/remux capability.
- **web-demuxer@4.0.0** — NA_ENGINE, `engine does not declare operation 'remux'`. Honest: a demux-only wasm wrapper, name and scope match.
- **platform@chrome-149** — NA_ENGINE, `engine does not declare operation 'remux'`. Honest: the browser exposes no MP4-remux/faststart container-mux API (WebCodecs encodes frames but does not mux a faststart MP4).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/streaming-output/base.ts:64-76` (id `mp4_faststart_reserve`), built via `buildStreamAll` in `src/scenarios/streaming-output/_shared.ts`. Shape `{ container:'mp4', fastStart:'reserve', maximumPacketCount:4096 }`, feature `fastStart:reserve`, gating oracles reference-reimport + mp4-box-layout.
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` — exists, **31 MB** real H.264 1080p + AAC clip (stat confirmed). Not synthetic/empty/mock.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1244-1248` (reserve branch -> prepareMuxTracks+mux), `:1529`/`:1540` (maximumPacketCount sizing the reserved moov), `:181-198` (fastStart forwarding). Genuinely calls the real mediabunny Output/EncodedPacketSource API; no canned bytes, no input→output copy, no golden short-circuit, no swallowed errors (throws on unsupported codec/container).
- **Oracles:** `mp4-box-layout` (`src/core/oracles.ts:365-413`) actually parses top-level boxes and asserts `moovOffset < mdatOffset` for `fastStart:'reserve'` — not trivially satisfiable; a plain tail-moov remux would FAIL here. `reference-reimport` (`src/core/oracles.ts:1225-1271`, semantic branch `:1273+`) re-demuxes the emitted bytes through the reference engine and checks packet table non-empty, media-track count vs golden (2==2), and duration delta (0.0213 s) within 0.1 s. Measurements are physically plausible for a 30 s 1080p clip: 2308 packets, 1423 keyframes, output 31.32 MB ≈ input 31 MB (lossless copy).
- **Cached note:** mediabunny row `cached==true` ("cached previous PASS result"), startedAtIso 2026-06-22T13:51; ffmpeg row also `cached==true`. Staleness risk: both rows reused, not freshly re-run; per MEMORY launcher-seeding caveat, fresh evidence would require clearing raw + .browser-cache. Numbers are internally consistent and plausible, so reuse does not change the ranking.
- **Verdict: REAL.** Real 31 MB fixture, real mediabunny mux implementation exercising the reserve code path, and two meaningful structural/semantic oracles (one of which—box-layout—would catch a fake tail-moov remux). The only reservation is n=1 cached samples, which lowers performance-evidence weight but not the correctness verdict.

## Confidence & caveats

- **Confidence: high** on the winner and verdict; the decisive performance margin (1.97x wall, 0.50x longtasks) is large and the semantic distinction (true reserve vs +faststart two-pass) is grounded in adapter code and the box-layout measurements.
- **Caveats:** (1) both PASS rows are n=1, mad=0, p95==median — single-shot timings, so the 1.97x margin has no spread to confirm it; a re-run could narrow it. (2) Both rows `cached==true` (reused, not re-run). (3) FFmpeg peakMemory was not sampled (n=0), so the memory tiebreaker is unavailable; mediabunny's ~51.7 MB peak is the only datapoint. (4) Correctness is genuinely a near-tie — ffmpeg's durationDeltaSec=0 is marginally tighter than mediabunny's 0.0213 s — so the win rests on performance + reserve fidelity, not on correctness strength.
