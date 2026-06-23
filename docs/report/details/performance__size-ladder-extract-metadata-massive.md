# performance/size-ladder-extract-metadata-massive

- **family:** performance
- **fixture asset:** `fixtures/media/massive_h264_1080p_2h.mp4` (1.1 GB, H.264 1080p30 video + AAC mono 48 kHz audio, MP4 / `isom`, ~2 h / 7200 s, ~216k frames)
- **operation:** `probe` (extract-metadata)
- **primaryMetric:** `opsPerSec` (higher better); secondary `wall` (ms, lower better)
- **passCount:** 7 / 7 (all engines PASS `golden-metadata`)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — all 7 engines passed the single gating oracle (`golden-metadata`), so the ranking is decided on performance.
- **Decisive factor:** All engines satisfy the same metadata oracle equally (each reports the identical 2-track golden match with `durationDeltaSec=0`). Correctness is therefore a tie; the win is on the primary metric. mediabunny reads the MP4 declared duration from the `mvhd` box plus the track table over an HTTP-range-backed `UrlSource` instead of scanning samples or buffering the 1.1 GB file, giving it the lowest probe wall time.
- **Margin over runner-up:** mediabunny **22.89 ops/s @ 43.69 ms wall** vs runner-up remotion-media-parser **13.62 ops/s @ 73.42 ms wall** → **1.68x higher ops/sec, 1.68x faster wall**. Against the rest the margin is far larger (e.g. vs mp4box 1899 ms → **43.5x**; vs ffmpeg.wasm 1684 ms → **38.6x**; vs platform 2630 ms → **60.2x**).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | opsPerSec | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 43.69 | 22.891 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 73.42 | 13.620 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 86.16 | 11.606 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 450.80 | 2.218 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 1684.33 | 0.594 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 1899.28 | 0.527 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 2630.47 | 0.380 | n/a | n/a | n/a | cached previous PASS result |

Notes: this is a metadata-extract probe scenario, so the bench block only carries `opsPerSec` and `wall` — `throughputRealtime`, `peakMemory`, and `longtasks` are not collected here (the peakMemory ladder lives in the separate `size-ladder-demux-peak-memory-*` scenarios). Every sample is `n=1` (single timed op after one warmup, `mad=0`, `p95==median`), so spread cannot be assessed and each number is a single observation — the ordering is wide enough (1.68x at the top, 38–60x across the field) that n=1 is still decisive but the top-two gap should be read as "clearly faster," not "precisely 1.68x."

## Why the winner wins (deep technical)

The operation is "extract metadata" (`op: 'probe'`) on a **1.1 GB, 2-hour H.264-in-MP4** file. The golden (`fixtures/golden/massive_h264_1080p_2h.mp4.meta.json`) requires the probe to report container `mp4`, `durationSec=7200`, a video track `h264 1920x1080 @ 30fps`, and an audio track `aac 48000 Hz / 1 ch`. The `golden-metadata` oracle (`src/core/oracles.ts:595`) compares container, duration within a strict ±1-frame band (`durationToleranceSec≈0.0417 s`), and per-track codec/dims/fps/sampleRate/channels (`compareTrack`, oracles.ts:659). All seven engines produce the exact match (`durationDeltaSec=0`), so the correctness gate is genuinely a tie — the differentiator is *how cheaply* each engine obtains that metadata from a multi-GB file.

mediabunny's probe path is in `src/engines/mediabunny/adapter.ts`. `metadataFromInput` (adapter.ts:417) deliberately reads duration via the **cheap declared-duration path first**: `input.getDurationFromMetadata()` (adapter.ts:429) reads the MP4 `mvhd`/`tkhd` declared duration directly, and only falls back to `input.computeDuration()` (adapter.ts:436 — which would walk every `moof`/sample to find the last packet timestamp) if metadata yields null. For a faststart MP4 with a valid `mvhd`, the cheap path returns 7200 s immediately, so mediabunny never scans the ~216k-sample table just to time the file. Tracks come from `input.getTracks()` (adapter.ts:443) and are normalized field-by-field (`normalizeTrack`). Crucially, the input is opened over an **HTTP-range-backed `UrlSource`** (`openInput`, adapter.ts:266-270: unmutated, non-blob URL → `new mb.Input({ source: new mb.UrlSource(input.url) })`), so mediabunny fetches only the `moov` atom region rather than buffering all 1.1 GB into memory. The combination — range-fetch the box structure + read declared duration without a sample walk — is exactly what makes a 1.1 GB probe finish in **43.69 ms**. Its `configUsed` confirms the design: `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false`, `wasmThreads: 0`, `coreBuild: pure-ts-esm` — a pure-TS demux with no wasm boot cost and no cross-origin-isolation requirement.

The two near-competitors lose for the same family of reasons at smaller magnitude. remotion-media-parser (runner-up, 73.42 ms) runs a `cpu-js` streaming reader with `fieldsTier: metadata-only`, which is also a metadata-only parse — but its JS box-walker is ~1.68x slower than mediabunny's, with no http-range fast path declared in its config. remotion-webcodecs (86.16 ms) is a WebCodecs-oriented adapter whose `mp4-sample-table:http-range` fast path is scoped to *demux* rows, not the probe path, so the metadata read carries more setup overhead than mediabunny's lean `getDurationFromMetadata`+`getTracks` two-call path.

The slow tail is dominated by whole-file ingestion and wasm boot. web-demuxer (450.80 ms) and ffmpeg.wasm (1684.33 ms) route through wasm (libav-style) demuxers that must instantiate the wasm module and feed the file in; ffmpeg.wasm in particular pays module init + an avformat open that reads far more than the `moov`. mp4box (1899.28 ms) is the textbook anti-pattern here: its `configUsed` is `pipeline: whole-file-append(MP4BoxBuffer+fileStart)` with `rangeReads: false` — it appends the **entire 1.1 GB** through `appendBuffer`/`fileStart` before `onReady` fires, so even a metadata read pays the full-file ISOBMFF parse cost. platform@chrome-149 is slowest (2630.47 ms): the platform adapter probes via `<video>`/WebCodecs element-load semantics, which for a 2-hour file incurs media-element setup and demux that dwarf a targeted box read.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS but lost on speed: 73.42 ms vs 43.69 ms = **1.68x slower wall, 0.595x the ops/sec**. Same metadata-only parse, but `cpu-js` JS box-walking with no declared http-range fast path for probe.
- **remotion-webcodecs@4.0.479** — PASS, 86.16 ms = **1.97x slower** than mediabunny. Its `http-range` and `MOV->MP4 ftyp` fast paths are scoped to large/progressive *demux* rows, not the probe metadata read, so setup overhead dominates.
- **web-demuxer@4.0.0** — PASS, 450.80 ms = **10.3x slower**. wasm (libav) demuxer: module instantiation + feeding the file costs an order of magnitude over a targeted moov read.
- **ffmpeg.wasm@0.12.15** — PASS, 1684.33 ms = **38.6x slower**. wasm avformat open reads/ingests well beyond the `moov`; full ffmpeg init + probe is the heaviest non-platform path.
- **mp4box@2.3.0** — PASS, 1899.28 ms = **43.5x slower**. `whole-file-append(MP4BoxBuffer+fileStart)` with `rangeReads:false` buffers and parses the entire 1.1 GB before metadata is available — the worst data-volume profile for a probe.
- **platform@chrome-149** — PASS, 2630.47 ms = **60.2x slower** (slowest). Probes via `<video>`/WebCodecs element load; media-element setup + demux of a 2-hour file is the dominant cost for metadata that mediabunny gets from one box read.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/size-ladder.ts:69-83` (the `extractLadder` `perfCase`, `id` template line `src/scenarios/performance/size-ladder.ts:71`); asset comes from `LADDER.massive` = `massive_h264_1080p_2h.mp4` (`src/scenarios/performance/_shared.ts:82`). `op: 'probe'`, `oracles: ['golden-metadata']`, `primary: 'opsPerSec'`, `timeoutMs: T_HUGE` (300 s, `_shared.ts:92`).
- **Fixture exists and is real:** `fixtures/media/massive_h264_1080p_2h.mp4` is present at **1.1 GB** (not synthetic/empty/mock). Golden `fixtures/golden/massive_h264_1080p_2h.mp4.meta.json` exists with physically plausible values (mp4, 7200 s, h264 1920x1080@30 + aac 48000/1ch, bitrates 1.2 Mbps video / 64 kbps audio). NOTE: the scenario *source comments* (size-ladder.ts:22, _shared.ts:82) still say the massive golden is "NOT baked → NA until bake" — that comment is **stale**; the golden meta+packets+ssim files have since been baked (meta.json modified ~3 days ago, frames/ssim ~1 day ago), which is why all engines legitimately rank instead of degrading to NA. The PASS is real, not fabricated.
- **Winner implementation is genuine:** `src/engines/mediabunny/adapter.ts:417` (`metadataFromInput`) calls the real library: `input.getDurationFromMetadata()` (adapter.ts:429), `input.computeDuration()` fallback (adapter.ts:436), `input.getTracks()` (adapter.ts:443), `input.getMetadataTags()` (adapter.ts:457), opened via real `mb.Input`/`mb.UrlSource` (adapter.ts:267-270). No hardcoded output, no copy of the golden, no error-swallow-to-pass (the `lib` getter throws loudly if init was skipped, adapter.ts:1013).
- **Oracle is meaningful:** `goldenMetadata` (`src/core/oracles.ts:595`) does a real field-by-field compare against `ctx.golden.meta` with a strict ±1-frame duration band and explicit track codec/dims/fps/sampleRate/channels checks; it `fail()`s on any diff. Not trivially satisfiable. Measured `durationDeltaSec=0` against a 7200 s golden, `durationToleranceSec≈0.0417 s` — physically consistent with a correct `mvhd` read. (This is metadata-exact, mid-strength on the correctness ladder — not bit-exact, but well above smoke/SSIM-proxy.)
- **Cached note:** ALL 7 engine results have `cached: true` ("cached previous PASS result"). The numbers were reused, not re-run in this batch — **staleness risk applies to the absolute timings**. The relative ordering (1.68x top gap, 38–60x tail) is large and mechanistically explained, so the *winner identity* is robust, but the exact ms figures should be treated as last-good-run values.
- **Verdict:** **REAL** — real 1.1 GB fixture, genuine mediabunny library calls, meaningful metadata-exact oracle with plausible measurements. Sole caveats: all results cached (timings stale) and the source comments lag the actual baked golden.

## Confidence & caveats

- **Confidence: medium-high.** The winner is determined by primaryMetric with a clear 1.68x margin and a concrete, code-cited mechanism (cheap `mvhd` duration + http-range `UrlSource` vs whole-file buffering / wasm boot).
- **Caveats:** (1) Every engine is `cached:true` — timings are reused, not fresh (per the launcher seeding caveat, stale PASS reuse is a known risk); (2) all bench samples are `n=1` with `mad=0`, so no variance estimate — the top-two 1.68x gap is suggestive but on single observations; (3) the metric is `opsPerSec`/`wall` only (no peakMemory/longtasks in this scenario), so a memory-streaming claim for mediabunny is inferred from its `UrlSource` config + adapter code, not directly measured here (the demux-peak-memory ladder measures that separately); (4) the scenario's own comments still describe the massive rung as un-baked/NA, contradicting the now-present golden — confirmed the golden is real, so the PASSes are valid.
