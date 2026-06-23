# streaming-output/prop_faststart_in_memory_duration_invariant

family: streaming-output | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264/AAC in MP4) | primaryMetric: wall (ms) | passCount: 2 of 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- **Contested**: yes — two engines PASS (`ffmpeg-wasm`, `mediabunny`), each clearing the identical pair of gating oracles (`property-invariant` probe-duration + `mp4-box-layout` moov-before-mdat).
- **Decisive factor**: correctness-strength tiebreak first, then primary performance. ffmpeg-wasm reproduces the source duration *exactly* (Δ 0.0000s) versus mediabunny's Δ 0.0800s, so it sits strictly tighter on the same property-invariant gate; it then also wins the primary wall metric by **3.16×** (150.87 ms vs 476.92 ms).
- **Margin over runner-up (mediabunny)**: wall 150.865 ms vs 476.920 ms = **0.32× wall (3.16× faster)**; duration error 0.0000s vs 0.0800s (mediabunny is +80 ms of duration drift, still within the 0.125s band). mediabunny's only counter-win is longtasks (2907 ms vs ffmpeg's 5137 ms = 0.57×), a main-thread-blocking proxy, not the primary metric. peakMemory was unmeasured (n=0) for both.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, mp4-box-layout:true | 150.865 ms | n/a (not benched) | 0 (n=0) | 5137 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true, mp4-box-layout:true | 476.920 ms | n/a (not benched) | 0 (n=0) | 2907 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:in-memory' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:in-memory' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

**The operation.** This scenario (`src/scenarios/streaming-output/fragmented-faststart.ts:104-119`) takes the real progressive-download MP4 `h264_1080p_30s.mp4` (H.264 video + AAC audio in ISOBMFF) and asks each engine to perform a `remux` to MP4 with `shape.fastStart='in-memory', target='buffer'`. fastStart:`in-memory` means the muxer must relocate the `moov` (movie header / sample tables) to the *front* of the file, ahead of `mdat`, so a player can start without fetching the tail. The invariant being gated is `probe-duration`: relocating the moov must not change the reported container duration (tolerance 0.125s, `tolerances.durationToleranceSec`). A second oracle, `mp4-box-layout`, structurally proves the moov actually landed before mdat. Critically, this is a **stream-copy remux** — the coded H.264/AAC samples are byte-copied, not re-encoded — so the WebCodecs/hardware decode path is *not* on the critical path for either engine.

**ffmpeg-wasm's path.** `src/engines/ffmpeg-wasm/adapter.ts:2031` `remux()` runs `ffmpeg -i in -map 0 -c copy` and, because the container is mp4 and `fastStart !== false`, appends `-movflags +faststart` (`adapter.ts:2048-2049`). `+faststart` does FFmpeg's two-pass moov relocation: write mdat-first, then rewind and move the moov to the head. The on-disk evidence is in the shard's `mp4-box-layout` measurement: `layout: ftyp@0, moov@32, free@27342, mdat@27350` with `topLevelBoxes:4, moovOffset:32, mdatOffset:27350` — the `free` box at @27342 is the padding FFmpeg leaves where the moov originally sat, the classic +faststart signature, and moov(32) < mdat(27350) satisfies the oracle's `firstMoov > firstMdat` check (`src/core/oracles.ts:409-412`). Its `property-invariant` measurement is `outDurationSec:30, goldenDurationSec:30, deltaSec:0` — **bit-faithful duration**, because `-c copy` preserves the source `mvhd`/track timescales and edit lists verbatim; the reference probe reads exactly 30.000s. On wall it cost **150.865 ms** (single sample, n=1).

**mediabunny's path (runner-up).** `src/engines/mediabunny/adapter.ts:1250-1256` builds the output format from `outputFormatOptionsFrom(opts)` (`adapter.ts:180-199`), which forwards `fastStart:'in-memory'` straight into mediabunny's `IsobmffOutputFormatOptions`, then runs the real `mb.Output` + `runConversion` pipeline (`adapter.ts:1255-1256`). Its layout measurement `ftyp@0, moov@28, mdat@10903` (`topLevelBoxes:3, moovOffset:28, mdatOffset:10903`) shows a tighter, free-box-free moov-first emit (mediabunny buffers the whole output in RAM and writes the final moov directly at the front — no padding `free` box). It also passes both gates. But its `property-invariant` measurement is `outDurationSec:30.08, deltaSec:0.0799999999999983` — an 80 ms duration drift (likely from re-deriving sample-table durations / a trailing partial-frame rounding in the buffered second pass), well inside the 0.125s band but strictly looser than ffmpeg's exact 0. And its wall was **476.920 ms**, 3.16× slower.

**Why ffmpeg wins this specific codec/container/op.** For an H.264+AAC ISOBMFF *stream-copy* faststart, neither engine decodes; the work is parse + sample re-table + moov relocation. ffmpeg's C `mov` muxer doing `+faststart` in MEMFS is leaner than mediabunny's pure-TS-ESM Conversion that buffers the whole file in JS heap to place the moov in memory (`configUsed.coreBuild:"pure-ts-esm", pipeline:"streaming-lockstep"`), which shows up as the 3.16× wall gap. mediabunny's hardware WebCodecs backend (`configUsed.backend:"webcodecs", hwAccel:"prefer-hardware"`) buys nothing here because no frame is ever decoded. ffmpeg also reproduces the duration exactly, edging the correctness ladder. mediabunny's one win — longtasks 2907 ms vs 5137 ms — is a main-thread-responsiveness proxy (ffmpeg's wasm run blocks the thread longer in absolute terms), but it is not the primary metric and does not flip a remux correctness/wall decision.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed but lost. Same two oracles, but (a) duration drift Δ 0.0800s vs ffmpeg's exact Δ 0.0000s on the gating property-invariant (looser, though still passing), and (b) 3.16× slower wall (476.920 ms vs 150.865 ms). Only edge: lower longtasks (2907 vs 5137 ms), a non-primary proxy.
- **mp4box@2.3.0** — NA_ENGINE: `engine does not declare feature 'fastStart:in-memory'`. Honest. MP4Box.js can segment/fragment and rewrite, but the suite's mp4box adapter does not declare an in-memory moov-relocation remux capability; not under-declared in a way that hides a real impl for this op.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: `engine does not declare feature 'fastStart:in-memory'`. Honest; the remotion-webcodecs path is a decode/encode transform layer, not a moov-relocating ISOBMFF muxer for this shape.
- **remotion-media-parser@4.0.479** — NA_ENGINE: `engine does not declare operation 'remux'`. Honest — it is a parser/probe library, no muxing/remux output op at all.
- **web-demuxer@4.0.0** — NA_ENGINE: `engine does not declare operation 'remux'`. Honest — it is a demux-only (WASM libav demuxer) library; it produces packets, not a remuxed container.
- **platform@chrome-149** — NA_ENGINE: `engine does not declare operation 'remux'`. Honest — the inline browser/WebCodecs platform path has no general MP4 muxer/remux operation (and per the scenario notes its inline mp4 demux is progressive-only).

## Anti-cheat validation

- **Scenario**: `src/scenarios/streaming-output/fragmented-faststart.ts:104-119` (`id: 'prop_faststart_in_memory_duration_invariant'`). Input `asset: 'h264_1080p_30s.mp4'`, op remux to mp4, `shape.fastStart:'in-memory'`, `tolerances.durationToleranceSec:0.125`. Notes (lines 115-118) state the gate honestly: relocating the moov must not change reported duration; the moov-first shape is supported today because the probe reads the container header.
- **Fixture exists**: `fixtures/media/h264_1080p_30s.mp4` — confirmed via stat, 31 MB real H.264/AAC MP4. Not synthetic/empty/mock.
- **Gating oracles**: `property-invariant` probe-duration branch at `src/core/oracles.ts:2709-2758` performs a REAL reference-engine probe of the engine output and compares against the golden/source duration with the explicit 0.125s band; the shard measurements (out 30 / 30.08 vs golden 30) are physically plausible for a 30s clip. `mp4-box-layout` at `src/core/oracles.ts:365-426` actually parses top-level boxes (`parseTopLevelBoxes`, line 428) and asserts `firstMoov < firstMdat` for fastStart in-memory (lines 405-412) — not trivially satisfiable; a moov-last file would fail. Reported offsets (ffmpeg moov@32/mdat@27350 with a free@27342; mediabunny moov@28/mdat@10903) are real, distinct, byte-level box layouts.
- **Winner adapter**: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` `remux()` — genuine `ffmpeg -i ... -map 0 -c copy -movflags +faststart`. Real wasm ffmpeg invocation (`this.run(args)`), reads back real output bytes (`readBinary`), no canned output, no input→output copy short-circuit, no golden short-circuit, errors propagate (no swallowing). Capability declared at `adapter.ts:1504` (`'fastStart:in-memory'`).
- **Verdict: REAL** — real 31 MB H.264/AAC MP4 fixture, real wasm ffmpeg `-c copy`/`+faststart` remux, and two meaningful oracles (exact-duration invariant + structural moov-before-mdat layout) that a wrong layout or wrong duration would fail. The runner-up mediabunny is also a real `mb.Output` Conversion, so the contest itself is honest.
- **Cached note**: BOTH PASS entries have `cached:true` ("cached previous PASS result"). The numbers were reused from a prior run, not re-executed in this batch — staleness risk applies symmetrically to both contenders; the wall/longtasks figures should be treated as last-known-good rather than freshly measured.

## Confidence & caveats

- Confidence: **high** on the winner. Both engines clear the same gates; ffmpeg is strictly tighter on the gating duration invariant (exact 0.0000s) AND 3.16× faster on the primary wall metric, so the ranking is robust to the longtasks counter-signal.
- Caveats: (1) both results are `cached:true` — re-run for fresh wall/longtasks before publishing. (2) All bench metrics are **n=1** (mad=0, p95==median), so wall/longtasks are single-shot point estimates; the 3.16× wall gap is large enough to survive noise but lacks a distribution. (3) `peakMemory` and `throughputRealtime` were not measured (n=0 / absent) for either engine, so the memory/throughput tiebreakers could not be applied. (4) mediabunny's 80 ms duration drift, while looser, is comfortably within tolerance — this is a margin-of-correctness win, not a pass/fail distinction.
