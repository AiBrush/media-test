# streaming-output/mp4_faststart_in_memory

family: streaming-output | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio, ~31 MB, 30 s) | primaryMetric: (none emitted in shard; ranked by bench wall median) | passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **CONTESTED**: two engines PASS — `ffmpeg-wasm` and `mediabunny@1.48.0`. Both satisfy the identical, full correctness gate (`reference-reimport` + `mp4-box-layout`), so correctness strength is comparable.
- Decisive factor: **performance on the primary bench axis (wall median)**. ffmpeg-wasm remuxes in **150.92 ms** vs mediabunny's **400.78 ms** — **2.66x faster wall** and a matching **2.66x higher throughputRealtime** (198.77x vs 74.85x realtime).
- Margin over runner-up (mediabunny): 2.66x faster wall, 2.66x throughput, near-identical output size (31,258,827 B vs 31,270,771 B, 0.04% smaller).
- IMPORTANT CAVEAT (not decisive but material): ffmpeg-wasm pays the wall win with **main-thread blocking** — `longtasks` 19,963 ms vs mediabunny's 1,017 ms (mediabunny is ~19.6x better on responsiveness). Both results are n==1 (single sample, mad=0), so the wall margin is suggestive rather than statistically firm.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true, mp4-box-layout:true | 150.92 | 198.77 | n/a (n=0) | 19963 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true, mp4-box-layout:true | 400.78 | 74.85 | n/a (n=0) | 1017 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:in-memory' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:in-memory' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

(peakMemory and targetWrites carry n=0 / empty samples in this shard for both PASS engines — not measured, reported as n/a.)

## Why the winner wins (deep technical)

The operation is a **lossless faststart remux**: open `h264_1080p_30s.mp4` (H.264 in MP4 + AAC), stream-copy every coded sample into a new MP4 *with the `moov` atom relocated ahead of `mdat`* so the file is progressive-download / range-request friendly. No re-encode is involved; the elementary streams are byte-preserved and only the ISOBMFF box layout changes.

**ffmpeg-wasm's mechanism.** Its `remux()` (src/engines/ffmpeg-wasm/adapter.ts:2031) builds `[-i in -map 0 -c copy]` and, for the MP4 target, appends `-movflags +faststart` (adapter.ts:2048-2049). `+faststart` is a *post-mux relocation* pass: ffmpeg writes the file with `moov` at the tail, then rewrites it moving `moov` to the front and inserting a `free` pad. That two-pass-on-MEMFS behavior is exactly what the box-layout oracle observed: top-level layout `ftyp@0, moov@32, free@27342, mdat@27350` — 4 boxes, `moov` (offset 32) strictly before `mdat` (offset 27350), with the tell-tale `free` filler between them (oracles.ts:405-412 pass branch). `-c copy` means the H.264/AAC samples are bit-copied, so the work is pure container I/O in single-threaded wasm — and on an M1 Max that finishes in 150.92 ms. The re-import oracle then demuxed the output and counted **2308 packets / 1423 keyframes across 2 media tracks with durationDeltaSec = 0** (perfect duration match, well inside the 0.1 s tolerance), confirming the stream-copy was truly lossless.

**Why it beats mediabunny here.** mediabunny's `remux()` (src/engines/mediabunny/adapter.ts:1250-1256) routes through `makeOutputFormat(container, outputFormatOptionsFrom(opts))` → `fastStart: 'in-memory'` (adapter.ts:180-196), driving mediabunny's `Conversion`/`Output` with a `BufferTarget`. The `in-memory` mode buffers the whole muxed result in RAM and does a second pass to place `moov` first; the box-layout oracle saw `ftyp@0, moov@28, mdat@10903` (3 boxes, `moov` before `mdat`, no `free` pad — a tighter pre-positioned layout than ffmpeg's). Its re-import showed **2310 packets / 1425 keyframes / 2 tracks, durationDelta 0.08 s** (within 0.1 s tol). Correctness is therefore a wash — both pass the same two gates with physically plausible, near-identical packet tables (2308 vs 2310; the 2-packet / 2-keyframe difference reflects edit-list / muxer framing nuances, both inside the gate's 2% rel band). The differentiator is raw speed: mediabunny ran the conversion through its `webcodecs`/`pure-ts-esm` pipeline (`backend: webcodecs`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, env.configUsed) which carries per-packet JS/TS muxer overhead, landing at 400.78 ms — 2.66x slower than ffmpeg's tight wasm `-c copy` loop.

**The responsiveness counterpoint.** ffmpeg-wasm's win is single-thread wasm (`coreBuild: st`, `wasmThreads: 1`): the entire 150 ms remux plus the warm/probe machinery executes as long synchronous wasm calls, producing `longtasks = 19,963 ms` of cumulative main-thread blocking in the measured window. mediabunny's streaming-lockstep WebCodecs pipeline yields to the event loop and reports only `longtasks = 1,017 ms` (~19.6x less blocking). For a UI-embedded faststart, mediabunny would feel far more responsive; but on the primary ranked axis (wall median, then throughput) ffmpeg-wasm is the clear winner, so it takes this scenario with the responsiveness penalty noted.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed with full correctness (reference-reimport 2310 pkts/1425 kf, mp4-box-layout moov@28<mdat@10903), but **lost on performance**: 400.78 ms wall (2.66x slower than ffmpeg's 150.92 ms) and 74.85x vs 198.77x throughput. Only edge it holds is longtasks (1017 vs 19963 ms), which is not the primary ranking axis here.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare feature 'fastStart:in-memory'". Honest NA: MP4Box.js can build an ISOBMFF but the adapter does not expose a moov-relocating remux op; not under-declared for this specific in-memory faststart mode.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare feature 'fastStart:in-memory'". Honest — its WebCodecs transcode/encode path doesn't offer a moov-first stream-copy faststart shape.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'remux'". Honest by design: media-parser is a read/parse-only library, it has no muxer/output side.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'remux'". Honest: it is a demux-only WASM library (no mux/remux capability).
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'remux'". Honest: the bare-browser baseline (MSE/WebCodecs) has no general MP4 remux/faststart muxer; the platform cannot relocate a moov without a userland muxer.

## Anti-cheat validation

- **Scenario definition**: src/scenarios/streaming-output/fragmented-faststart.ts:49-64 (`id: 'mp4_faststart_in_memory'`). It requests `shape: { container: 'mp4', fastStart: 'in-memory', target: 'buffer' }` and gates on `reference-reimport` + `mp4-box-layout`. The file header (lines 12-19) documents the gating rationale and explicitly refuses to emit fake-passing placeholders (§0.1).
- **Fixture is real**: `asset: 'h264_1080p_30s.mp4'` → `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB (`stat` confirmed). Not synthetic/empty/mock. The ~2308-2310 packet / ~1423-1425 keyframe / 2-track / ~30 s re-import numbers are physically consistent with a real 30 s 1080p30 H.264+AAC clip.
- **Winner adapter is genuine**: src/engines/ffmpeg-wasm/adapter.ts:2031-2069. It really invokes the vendored FFmpeg wasm core (`-i in -map 0 -c copy -movflags +faststart out`, adapter.ts:2044-2049), reads back the produced bytes from MEMFS (adapter.ts:2064), and returns them. No canned output, no input→output copy faking a remux, no short-circuit to a golden, no error swallowing (`this.run` throws with a log tail on nonzero exit). Capability `fastStart:in-memory` is declared honestly (adapter.ts:1504) and probed.
- **Oracles are real**: `mp4-box-layout` (src/core/oracles.ts:357-426) actually parses top-level ISOBMFF boxes (parseTopLevelBoxes, oracles.ts:428-455) and asserts `moov` offset < `mdat` offset for the in-memory branch (oracles.ts:405-412) — not trivially satisfiable, it would FAIL on a moov-last layout. `reference-reimport` (oracles.ts:1223-1271 → semanticRemuxReimport 1273+) re-demuxes the output with a reference engine, compares media-track count/layout against golden and duration within a real 0.1 s tolerance (oracles.ts:1318-1323) — it would fail on an empty packet table or track/duration drift. Measurements (durationDelta 0 for ffmpeg, 0.08 s for mediabunny; matching 2-track layout) are plausible. This is a structural + semantic gate, not a smoke-only or ssim-with-exactFrames==0 proxy.
- **Cached note**: BOTH PASS results have `cached: true` ("cached previous PASS result"). Evidence was reused, not re-run in this pass. Staleness risk applies symmetrically to both engines; the relative wall margin should be re-confirmed on a fresh run, especially given n==1 / mad==0.
- **Verdict: REAL.** Real fixture + real FFmpeg `-movflags +faststart` stream-copy + meaningful structural (moov-before-mdat) and semantic (re-import packet/track/duration) oracles. The only weaknesses are evidential (cached, n==1), not integrity defects.

## Confidence & caveats

- Confidence: **medium**. The winner selection is well-grounded (real implementations, real gate, plausible numbers), but two caveats temper it: (1) both PASS results are **cached** (not re-run this pass), and (2) every bench metric is **n==1** with mad==0, so the 2.66x wall margin rests on a single sample.
- The win is axis-dependent: ffmpeg-wasm wins **wall/throughput**, mediabunny wins **main-thread responsiveness** (longtasks ~19.6x lower) and emits a cleaner box layout (no `free` pad). If responsiveness/COOP-COEP-free single-thread friendliness were the ranked metric, mediabunny (WebCodecs, `coopCoep: not-required`, smaller pure-TS bundle, no wasm core download) would be preferred.
- peakMemory and targetWrites were not captured (n=0) for either engine, so memory footprint could not be used as a tiebreaker.
