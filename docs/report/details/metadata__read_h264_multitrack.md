# metadata/read_h264_multitrack

- **Family:** metadata
- **Fixture asset:** `fixtures/media/h264_multitrack.mp4` (4.5 MB, real MP4: 1 H.264 video 1280x720@30fps + 2 AAC audio 48000Hz/2ch)
- **Primary metric:** wall (ms)
- **passCount:** 7 / 7 (all engines PASS)
- **Operation:** `probe` (read-only structural metadata extraction)
- **Oracle:** `golden-metadata` (single gate)

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479` (env.engineId `remotion-media-parser@4.0.479`).
- **Contested:** YES. All 7 engines PASS the identical single oracle (`golden-metadata`) with identical exact measurements (`durationDeltaSec: 0`, within tolerance `0.041666…s`). Correctness is a dead heat — every engine read container=mp4, dur=10s, and all 3 tracks (1 h264 1280x720@30fps + 2 aac 48000/2ch) positionally correct.
- **Decisive factor:** PERFORMANCE (wall median), since correctness is identical and there is only one oracle (no strictness ladder to break the tie).
- **Margin over runner-up:** remotion-media-parser wall median **3.380 ms** vs runner-up remotion-webcodecs **10.860 ms** → **3.21x faster wall**. Slowest engine (mp4box, 22.735 ms) is 6.73x slower than the winner. All measurements are **n=1, mad=0, cached=true** — single-sample evidence, so the margin is directional, not statistically robust.

## Per-engine results

| Engine | Status | Oracles passed | Wall median (ms) | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | **3.380** | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 10.860 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 12.925 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 16.240 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 19.120 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 22.585 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:true | 22.735 | n/a | n/a | n/a | cached previous PASS result |

(The scenario declares `metrics: ['wall']` only — no throughputRealtime/peakMemory/longtasks were collected for this probe case; bench contains only the `wall` metric.)

## Why the winner wins (deep technical)

This is a pure structural-metadata READ of a faststart-style H.264-in-MP4 with three `trak` boxes (one video, two AAC audio). The only work required is to parse the `ftyp`/`moov` header tree (`mvhd` for duration, three `tkhd`/`mdia`/`stsd` chains for per-track codec/dims/rate/channels) — no sample data needs to be decoded. The differentiator is therefore *how little of the 4.5 MB file each engine must touch and how cheap its parse path is*, not codec quality.

**remotion-media-parser** uses a CPU-JS streaming container parser (`env.configUsed.backend: "cpu-js"`, `pipeline: "streaming"`, `reader: "webReader"`, `fieldsTier: "metadata-only"`). Its `probe()` (`src/engines/remotion-media-parser/adapter.ts:348`) calls the real library `parseMedia` (`src/engines/remotion-media-parser/adapter.ts:363-384`) requesting the **minimal field set** `{ durationInSeconds, container, tracks, metadata, rotation }` at the `'metadata-only'` tier. Remotion's parser is designed to stop reading as soon as the requested fields are resolvable — for a moov-front MP4 that means it reads the header boxes and halts before the `mdat` payload, so it never streams the multi-megabyte sample region. The normalize step (`src/engines/remotion-media-parser/adapter.ts:599-628`, `normalizeTrack` at line 620) maps the parsed tracks straight into `NormalizedMetadata`. The result: a **3.380 ms** wall median, the lowest of all seven and 3.21x faster than the runner-up.

The oracle that all engines clear, `golden-metadata` (`src/core/oracles.ts:595`), compares only container, duration (±tolerance), and per-track `{type, codec, width, height, fps, sampleRate, channels}` matched positionally (`compareTrack`, `src/core/oracles.ts:659`). Against golden `fixtures/golden/h264_multitrack.mp4.meta.json` (container mp4, dur 10s, tracks: h264 1280x720@30fps, aac 48000/2ch ×2) every engine produced `durationDeltaSec: 0` and a 3-track match — so correctness genuinely cannot separate them and performance is the only lawful tiebreak.

The other engines lose purely on the cost of their parse path for this header read:
- **remotion-webcodecs (10.860 ms)** wraps the same media-parser core but routes through a heavier WebCodecs-oriented convert pipeline (`backend: "webcodecs"`, `pipeline: "streaming-backpressure"`); its probe path carries more setup than the lean metadata-only parse. 3.21x slower than the winner.
- **mediabunny (12.925 ms)** is a pure-TS ESM reader on the WebCodecs backend; competent but 3.82x slower for this header-only read.
- **ffmpeg.wasm (16.240 ms)** must boot/feed the wasm `libav` probe through its FS shim to run the equivalent of `ffprobe`, a much heavier path for a trivial moov read — 4.80x slower.
- **platform/chrome-149 (19.120 ms)** uses the browser-native demux stack (`VideoDecoder`/MSE-style) which is built for playback, not cheap metadata; 5.66x slower.
- **web-demuxer (22.585 ms)** is a libav-wasm demuxer — wasm spin-up dominates a 3 ms-class task; 6.68x slower.
- **mp4box (22.735 ms)** uses `whole-file-append(MP4BoxBuffer+fileStart)` (`env.configUsed.pipeline`) with `rangeReads: false`, i.e. it appends the entire buffered file before its `onReady` fires — the most work of any engine for a header-only probe; 6.73x slower (the slowest).

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS but lost on performance: wall 10.860 ms vs 3.380 ms (**3.21x slower**). Heavier WebCodecs convert/backpressure pipeline than the bare metadata-only parse.
- **mediabunny@1.48.0** — PASS but lost: wall 12.925 ms (**3.82x slower**). Pure-TS reader, fine correctness, more overhead for a header-only read.
- **ffmpeg.wasm@0.12.15** — PASS but lost: wall 16.240 ms (**4.80x slower**). wasm libav probe boot cost dominates a sub-4 ms task.
- **platform@chrome-149** — PASS but lost: wall 19.120 ms (**5.66x slower**). Native playback-oriented demux stack is not optimized for cheap metadata extraction.
- **web-demuxer@4.0.0** — PASS but lost: wall 22.585 ms (**6.68x slower**). libav-wasm demuxer startup overhead.
- **mp4box@2.3.0** — PASS but lost: wall 22.735 ms (**6.73x slower**, slowest). `whole-file-append` with `rangeReads:false` buffers the full 4.5 MB before parsing the header.
- No engine was NA or FAIL on this scenario; every required capability (probe, mp4 container, h264 video, aac audio) is honestly declared by all seven.

## Anti-cheat validation

- **Scenario definition:** built by `buildRead` (`src/scenarios/metadata/_shared.ts:81`) from the case in `src/scenarios/metadata/index.ts:72-81` (asset `h264_multitrack.mp4`). Generated id `metadata/read_h264_multitrack` (`_shared.ts:83`), op `probe`, oracle `['golden-metadata']`, metric `['wall']`. Notes correctly disclaim that per-track LANGUAGE is NOT gated (compareTrack ignores language) and positional attribution is handled by a separate scenario — an honest scope statement, not an over-claim.
- **Fixture exists and is real:** `fixtures/media/h264_multitrack.mp4`, 4.5 MB on disk — a genuine multi-track MP4, not synthetic/empty/mock.
- **Oracle is real, not trivially satisfiable:** `golden-metadata` (`src/core/oracles.ts:595`, `compareTrack` at `:659`) performs a field-by-field comparison against `fixtures/golden/h264_multitrack.mp4.meta.json`. It checks container string, duration within a strict ±0.0417s (≈1 frame @24fps) band, and per-track type/codec/dims/fps/sampleRate/channels positionally. A wrong track count, codec, or dimension would FAIL. Measurements (`durationDeltaSec: 0`, 3-track match, golden dims 1280x720/30fps, 48000/2ch) are physically plausible for this asset. NOTE: this oracle does NOT verify tag CONTENT, rotation, or language values — so the PASS proves structural correctness only, which the scenario notes honestly state.
- **Winner adapter is a genuine implementation:** `src/engines/remotion-media-parser/adapter.ts:348` (`probe`) calls the real `parseMedia` library (`:363-384`) with a minimal metadata-only field set and normalizes via `normalizeTrack` (`:599-628`). No hardcoded/canned output, no short-circuit to the golden file, no error-swallow-then-report-success.
- **Cached note:** ALL 7 results have `cached: true` ("cached previous PASS result") — none were re-run in this pass. The PASS verdicts and the wall numbers are reused from earlier runs (timestamps span 2026-06-22T14:04–17:04). The correctness verdict is robust (deterministic structural read), but the performance ranking rests on stale single-sample (n=1, mad=0) timings — treat the 3.21x margin as directional.
- **Verdict:** **REAL** — real 4.5 MB fixture, real `parseMedia` implementation, meaningful structural oracle. The only caveats are (a) the oracle is structural-only (cannot catch tag/language errors, as the scenario openly documents) and (b) all evidence is cached n=1.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict (all 7 PASS, winner REAL) is high-confidence — the oracle is genuine and the adapter is real. The *ranking* is medium-confidence: every bench is `n=1, mad=0, cached=true`, so the 3.21x margin over remotion-webcodecs could shift under re-measurement, though a sub-4 ms header parse beating wasm/native-demux paths is mechanistically expected.
- Single oracle, single metric (`wall`): no peakMemory/longtasks/throughput data to corroborate the timing-based decision.
- The golden-metadata gate is structural-only by design; it does NOT prove the engines read the multi-track *language* or *tag* values correctly — a known, documented family gap (`src/scenarios/metadata/index.ts:34-40`).
- Recommend a fresh non-cached re-run with n>1 to harden the performance margin before treating remotion-media-parser as a durable winner for this scenario.
