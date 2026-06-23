# probe/big_buck_bunny_1080p_h264

- **family:** probe
- **fixture asset:** `fixtures/media/big_buck_bunny_1080p_h264.mov` (real 725 MB QuickTime/MOV, H.264 1080p24 + AAC 5.1) — exists
- **goldens:** `fixtures/golden/big_buck_bunny_1080p_h264.mov.meta.json` (+ `.frames.json`, `.packets.json`)
- **primaryMetric:** wall (ms)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** mediabunny@1.48.0
- **Contested:** YES — all 7 engines PASS the single gating oracle (`golden-metadata`), so correctness is tied and the decision falls to performance.
- **Decisive factor:** lowest wall-time probe. mediabunny reads the MOV header (`moov`/`mvhd` + track getters) via range-read `UrlSource` and resolves duration through the cheap `getDurationFromMetadata()` path, never scanning the 725 MB body.
- **Margin over runner-up:** wall median 4.765 ms vs remotion-media-parser 7.685 ms = **1.61x faster**. Against the 3rd place remotion-webcodecs (8.715 ms) = 1.83x. Against the slowest passing engine, platform (6999.38 ms), = ~1469x. All samples are n=1 (mad=0), so the absolute single-digit-ms margins are weak evidence individually but the ordering across orders of magnitude (ms vs hundreds/thousands of ms) is robust.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass (Δdur 0.0180s ≤ 0.0417s) | 4.765 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass (Δdur 0.00033s ≤ 0.0417s) | 7.685 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass (Δdur 0.00033s ≤ 0.0417s) | 8.715 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass (Δdur 0.00033s ≤ 0.0417s) | 60.615 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass (Δdur 0.00033s ≤ 0.0417s) | 866.965 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass (Δdur 0.0020s ≤ 0.0417s) | 1187.605 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass (Δdur 0.0180s ≤ 0.0417s) | 6999.380 | n/a | n/a | n/a | cached previous PASS result |

(The shard's `bench` block contains only the `wall` metric for every engine; throughputRealtime / peakMemory / longtasks were not recorded for this probe scenario.)

## Why the winner wins (deep technical)

This is a **probe** of a huge (725 MB) self-contained QuickTime `.mov` carrying H.264 1080p24 video and AAC 5.1 audio, plus a non-media "other" track (the golden meta lists video + `other` + audio). The scenario sets `options.metadataTrackTypes: ['video','audio']` (src/scenarios/probe/index.ts:310), so the oracle (`metadataTracksForScenario`, src/core/oracles.ts:688-698) filters out the `other` track and compares exactly **2 tracks** — matching every engine's reported "2 track(s)" detail.

The gating oracle is `golden-metadata` (src/core/oracles.ts:595-657). It is a real structural comparison: container token (must equal `mov`), global duration within a strict ±1-frame band (`durationToleranceSec = 1/24 ≈ 0.0417s`, src/core/oracles.ts:159), and per-track `codec/width/height/fps/sampleRate/channels` (src/core/oracles.ts:659-686). For the golden, that means video h264 1920x1080 @24fps and audio aac 48000 Hz / 6 ch. The measured `durationDeltaSec` values are physically plausible: 0.00033s for the JS parsers, 0.0180s for the two WebCodecs-pixel engines (mediabunny, platform), and 0.0020s for ffmpeg.wasm — all comfortably inside the 0.0417s frame band. The ~18 ms delta for mediabunny/platform reflects reading the container's declared `mvhd` duration vs a slightly track-edit-list-adjusted value; it is real, not fabricated, and still passes.

Because correctness is identical across all 7 engines (one and the same oracle, all `pass`), the win is purely a **wall-time** decision, and the mechanism is the I/O strategy:

mediabunny's probe (`probe()` → `metadataFromInput`, src/engines/mediabunny/adapter.ts:1134-1141, 417-474) opens the asset through `UrlSource` (src/engines/mediabunny/adapter.ts:266-271) so the library issues HTTP **range reads** for just the `moov` atom rather than materializing the 725 MB file as a Blob. Duration is resolved through the **cheap metadata path first** — `input.getDurationFromMetadata()` (adapter.ts:429), which reads the `mvhd`/track header without walking the sample table; only if that returns null/non-finite does it fall back to the full `computeDuration()` scan (adapter.ts:434-441). Track normalization (`normalizeTrack`, adapter.ts:297-338) pulls codec/dims/sample-rate/channels straight from the demuxer getters; fps is estimated from a **120-packet prefix** via `computePacketStats(120)` (adapter.ts:312), i.e. a bounded read, not a whole-file decode. Config confirms this lean path: `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required`, no WASM, no worker. The result is a 4.765 ms header parse.

The runner-up **remotion-media-parser** (7.685 ms) is also a pure streaming JS metadata parser (`fieldsTier: metadata-only`, `reader: webReader`) and is in the same ms class; mediabunny edges it 1.61x, likely from range-reading only the `moov` vs remotion's `streaming` forward scan to reach header fields. **remotion-webcodecs** (8.715 ms) leans on the same media-parser core for probe and lands third. The gap from there to **web-demuxer** (60.6 ms) is the WASM-init/FFI cost of crossing into its libav-based wasm demuxer just to read a header. **mp4box** (866.96 ms) uses `whole-file-append(MP4BoxBuffer+fileStart)` with `rangeReads:false` — it appends bytes until the `moov` is satisfied through a pure-JS ISOBMFF box parser, paying a large buffering cost on a 725 MB faststart-or-not MOV. **ffmpeg.wasm** (1187.6 ms) pays full wasm module instantiation plus an `ffprobe`-style format-open. **platform** (6999.38 ms) is the outlier: its probe routes through actual `<video>`/WebCodecs element loading (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`), so the browser must fetch/parse far more of the resource before exposing track metadata — three orders of magnitude slower than a targeted header read.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on speed only: 7.685 ms vs 4.765 ms (1.61x slower). Same correctness (Δdur 0.00033s). Streaming forward scan vs mediabunny's targeted range read.
- **remotion-webcodecs@4.0.479** — PASS, 8.715 ms (1.83x slower). Identical oracle outcome; shares the media-parser probe core, no advantage for a header-only read.
- **web-demuxer@4.0.0** — PASS, 60.615 ms (12.7x slower). Correct (Δdur 0.00033s) but pays wasm/libav FFI setup to read metadata a pure-JS parser gets for free.
- **mp4box@2.3.0** — PASS, 866.965 ms (182x slower). `rangeReads:false` + whole-file append buffering (config `pipeline: whole-file-append`) forces it to ingest a large prefix of a 725 MB file before the `moov` is parseable.
- **ffmpeg.wasm@0.12.15** — PASS, 1187.605 ms (249x slower). Full wasm instantiation + format-open overhead dominates a header probe (Δdur 0.0020s, still correct).
- **platform@chrome-149** — PASS, 6999.380 ms (1469x slower). Routes probe through real `<video>`/`VideoDecoder` element loading instead of a container header read; correct (Δdur 0.0180s) but catastrophically slow for a probe.

No engine returned NA or FAIL for this scenario, so there are no under-declared-capability concerns here.

## Anti-cheat validation

- **Scenario:** src/scenarios/probe/index.ts:303-315 (`asset: 'big_buck_bunny_1080p_h264.mov'`, container `mov`, h264/aac, `options.metadataTrackTypes: ['video','audio']`). Notes describe it as the real Big Buck Bunny 1080p H.264 .mov, a "huge/big-read PARITY" drop-in that is NA until present, then golden-gated — consistent with the populated 725 MB fixture.
- **Fixture exists:** `fixtures/media/big_buck_bunny_1080p_h264.mov` = 725 MB real media (stat confirmed). Goldens present: `.meta.json` (container mov, duration 596.462s, video h264 1920x1080@24 / audio aac 48000/6ch), plus `.frames.json` and a 5 MB `.packets.json`. Not synthetic/empty/mock.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1134-1141 (`probe`) → :417-474 (`metadataFromInput`) → :219-232 / :429 (`getDurationFromMetadata` cheap path) → :297-338 (`normalizeTrack`, real getCodec/getDisplayWidth/getNumberOfChannels + computePacketStats(120) for fps). Genuinely calls the mediabunny library against the real file via `UrlSource` (adapter.ts:266-271). No canned output, no copy-input-to-output, no short-circuit to golden, no error-swallow-as-success (failures bubble as null/throw, which would surface as oracle FAIL).
- **Oracle:** src/core/oracles.ts:595-657 (`golden-metadata`). Performs a real field-by-field comparison (container, ±1-frame duration band src/core/oracles.ts:159, per-track codec/dims/fps/sampleRate/channels src/core/oracles.ts:659-686). Track filtering at src/core/oracles.ts:688-698 honors the scenario's `metadataTrackTypes`. Not trivially satisfiable: a wrong codec, dimension, sample rate, channel count, or a >0.0417s duration error fails it. Measurements are physically plausible (Δdur 0.00033–0.0180s on a 596.462s asset; 2 tracks).
- **Cached note:** every engine row has `cached: true` ("cached previous PASS result"). The wall numbers and oracle outcomes were reused, not re-run in this batch — there is staleness risk and the n=1/mad=0 single-sample timings should not be over-interpreted as precise. The ordering (ms-class JS parsers vs hundreds/thousands-of-ms wasm/element paths) is nonetheless robust to that risk.
- **Verdict:** REAL — real 725 MB fixture, genuine library-backed probe implementation, and a meaningful structural oracle that compares against real goldens.

## Confidence & caveats

- **Confidence:** medium-high. The PASS/correctness picture is solid (real fixture, real oracle, real adapter). The performance winner is clear by ordering, but every metric is a single cached sample (n=1, mad=0), so the 1.61x margin over remotion-media-parser is suggestive rather than statistically firm.
- All bench data beyond `wall` (throughput, peak memory, longtasks) is absent for this scenario, so the ranking rests on wall-time alone.
- Correctness is genuinely tied: all 7 engines pass the same single oracle. A stronger gate (golden-packets / decoded-frames-bitexact) is not applied to this probe scenario, which is appropriate for a probe op but means the win is a performance win, not a correctness win.
