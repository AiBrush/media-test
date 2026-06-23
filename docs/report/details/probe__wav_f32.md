# probe/wav_f32

family: probe | fixture asset: `wav_f32.wav` (1.9 MB, fixtures/media/wav_f32.wav) | primaryMetric: wall | passCount: 3

## Verdict

- Best framework: **mediabunny@1.48.0** (status PASS).
- Contested: **YES** — 3 of 7 engines PASS (mediabunny, ffmpeg.wasm, platform); all 3 satisfy the SAME single oracle (`golden-metadata`) with identical correctness (`durationDeltaSec: 0`).
- Decisive factor: **PERFORMANCE** (correctness is a tie). mediabunny wall median **4.075 ms** beats ffmpeg.wasm **5.75 ms** and platform **6002.69 ms**.
- Margin over runner-up (ffmpeg.wasm): **~1.41x faster wall** (5.75 / 4.075). Over platform: **~1473x faster wall** (6002.69 / 4.075).
- Caveat: every PASS is `cached:true` and every bench is `n:1` (mad 0, p95==median), so the perf ordering is single-sample evidence, not a distribution.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 4.075 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 5.75 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 6002.69 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-f32' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-f32' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

Note: the bench block only carries `wall` for every PASS engine; throughputRealtime / peakMemory / longtasks were not recorded for this probe scenario (probe primaryMetric is wall/opsPerSec, not decode throughput).

## Why the winner wins (deep technical)

The operation is a metadata-only **probe** of a RIFF/WAVE container carrying uncompressed 32-bit IEEE-float PCM (`pcm-f32`), stereo, 48 kHz, 5.000 s — `bitrate = 48000 * 2 * 4 * 8 = 3,072,000` bps, which matches the golden exactly. There is no compressed bitstream to decode; the entire job is parsing the WAVE header chunks (`fmt ` for format/sampleRate/channels, `data` size for duration) and emitting normalized metadata. The `golden-metadata` oracle (src/core/oracles.ts:595-657) compares container, duration (±tolerance), and per-track type/codec/sampleRate/channels positionally. For WAV the duration band is the strict ~1-frame band (`durationToleranceSec: 0.041666...` = 1/24 s); all three winners report `durationDeltaSec: 0`, i.e. exact 5.000 s, plus exact codec `pcm-f32`, 48000 Hz, 2 ch. So correctness is a dead tie and the contest collapses to wall time.

mediabunny wins on wall because of its cheap-metadata code path. `metadataFromInput` (src/engines/mediabunny/adapter.ts:417-453) resolves duration via `input.getDurationFromMetadata()` FIRST (adapter.ts:429), reading the container's declared duration straight from the WAVE `data`-chunk size / `fmt ` byte-rate WITHOUT scanning samples, and only falls back to `computeDuration()` on null (adapter.ts:434-441). Track normalization (`normalizeTrack`, adapter.ts:332-347) is pure header-getter reads: `getCodec()`, `getSampleRate()`, `getNumberOfChannels()`, `getBitrate()` — no PCM samples are touched. The adapter runs as `coreBuild: pure-ts-esm`, `sharedArrayBuffer:false`, `coopCoep: not-required` (env.configUsed), so there is no wasm instantiation tax for a header parse, yielding 4.075 ms.

ffmpeg.wasm is correct and nearly as fast in the reported `wall` (5.75 ms) — but that 5.75 ms is the inner probe span only; its `durationMs` (full op incl. wasm core boot) is 3999 ms. Even on the apples-to-apples `wall` number it is 1.41x slower than mediabunny, because libavformat must instantiate the WASM module's demuxer pipeline to read the RIFF header, where mediabunny does it in native JS/TS with no module boundary.

platform (Chrome WebCodecs path, `backend: webcodecs`, `hwAccel:true`, `pipeline: streaming`) is the clear loser at 6002.69 ms wall. WebCodecs has no audio *demuxer*; the platform adapter must hand-roll WAV parsing (src/engines/platform/demux-wav.ts) and its probe pipeline (src/engines/platform/probe.ts) carries streaming/queue setup overhead (`queueDepth:2`, `<video>→canvas→MediaRecorder` encode rig warmed even for a probe) that is enormous relative to a header read. It gets the right answer (`durationDeltaSec:0`) but pays ~1473x the wall of mediabunny — WebCodecs is built for frame decode, not cheap container introspection.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (golden-metadata true, durationDeltaSec 0) but lost on perf: wall 5.75 ms vs 4.075 ms (1.41x slower); also pays a ~3999 ms wasm-core boot in durationMs. No correctness gap, pure latency loss.
- **platform@chrome-149** — PASSed (golden-metadata true, durationDeltaSec 0) but wall 6002.69 ms is ~1473x mediabunny's; WebCodecs has no demuxer so the WAV header is parsed through a heavy streaming/encode-rig pipeline. Correct but catastrophically slow for a probe.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare audio codec 'pcm-f32'". Honest NA — remotion's media-parser does not expose IEEE-float PCM as a recognized codec token; declining beats FAILing on an unparsable codec.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: same "does not declare audio codec 'pcm-f32'". Honest NA — built on WebCodecs which has no raw-PCM-in-WAV input concept.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'wav'". Honest NA — web-demuxer's declared `containersIn` set excludes WAV.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'wav'". Honest and expected — MP4Box.js is an ISOBMFF (MP4/MOV) parser; WAV/RIFF is architecturally out of scope.

## Anti-cheat validation

- Scenario: src/scenarios/probe/index.ts:181 — `{ asset: 'wav_f32.wav', container: 'wav', audioCodecs: ['pcm-f32'] }`, generated under `operations:['probe']` via the PROBE_CASES table (file header lines 36-52). Id derives to `probe/wav_f32`.
- Fixture: `fixtures/media/wav_f32.wav` EXISTS (1.9 MB real RIFF/WAVE file) — not synthetic/empty/mock. Golden present: `fixtures/golden/wav_f32.wav.meta.json` (container wav, durationSec 5, pcm-f32, 48000 Hz, 2 ch, bitrate 3072000) and `fixtures/golden/wav_f32.wav.packets.json`.
- Oracle: `golden-metadata` at src/core/oracles.ts:595-657 — performs a REAL field-by-field diff (container at 606, duration with tolerance at 614-637, per-track codec/sampleRate/channels via `compareTrack` at 659-682). Not trivially satisfiable: any wrong codec/rate/channel/duration produces a diff and FAILs. Measurement `durationDeltaSec: 0` against `durationToleranceSec: 0.04166...` is physically plausible for an exact 5 s WAV.
- Winner adapter: src/engines/mediabunny/adapter.ts — `metadataFromInput` (417), cheap duration at 429, real track getters in `normalizeTrack` (332-347). Genuine library calls (mediabunny `Input`/`getTracks`/`getSampleRate`); no canned output, no input→output copy, no golden short-circuit, no error-swallowing-as-success.
- Verdict: **REAL** — real fixture + real mediabunny header-parse implementation + meaningful field-diff oracle.
- Cached note: winner result is `cached:true` ("cached previous PASS result"), as are both other PASS engines. Evidence is reused, not freshly re-run, and bench is n:1 — staleness/single-sample risk on the PERF ordering, though the correctness gate (durationDeltaSec 0) is deterministic for this header parse.

## Confidence & caveats

- Confidence: **high** on the verdict (correctness identical across 3 PASS; mediabunny strictly fastest on the recorded wall metric; NAs are honest codec/container non-declarations).
- Caveats: (1) all three PASS bench numbers are `n:1`, `mad:0`, `p95==median` — a single sample each, so the 1.41x margin over ffmpeg.wasm is suggestive, not statistically robust. (2) All PASS rows are `cached:true`; a fresh re-run could shift the close mediabunny-vs-ffmpeg.wasm gap (the platform 1473x gap is too large to be reversed by noise). (3) Only `wall` was recorded; throughput/memory/longtask tiebreakers were unavailable.
