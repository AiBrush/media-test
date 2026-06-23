# robustness/edge_pcm_s16be_probe

family: robustness | fixture asset: `pcm_s16be.aiff` (960054 bytes, real AIFF) | primaryMetric: golden-metadata (probe) | passCount: 1 of 7

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
Uncontested — exactly 1 PASS, 6 NA_ENGINE. Decisive factor: it is the **only** engine that declares the `aiff` input container; every other engine was pre-negotiated out by the runner with `engine does not declare input container 'aiff'`. There is no runner-up that ran the operation, so no performance margin applies (NA engines never executed). The win is a capability win: AIFF (big-endian 16-bit PCM) container detection.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | n/a (no bench block; durationMs=145) | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |

Note: the shard carries no `bench{}` block for the ffmpeg entry (probe-only, cached). The only timing datum is `durationMs:145` and `cached:true`.

## Why the winner wins (deep technical)

The operation is a **probe** of `pcm_s16be.aiff`: an Apple **AIFF** (Audio Interchange File Format) container carrying **big-endian signed 16-bit PCM** (codec token `pcm-s16be`). The raw bytes confirm the format edge this scenario targets: header `464f524d ... 41494646` = `FORM....AIFF`, a `COMM` chunk declaring 2 channels / sampleSize `0x0010` (16-bit) / an 80-bit IEEE-754 extended sample-rate field `400EBB80` decoding to 48000 Hz, followed by an `SSND` sound-data chunk. This is the classic byte-order edge: `pcm_s16be` is invalid inside RIFF/WAVE (which is little-endian), so AIFF is the natural big-endian PCM container, and a demuxer must recognize the `FORM/AIFF` magic (not `RIFF/WAVE`) and read the big-endian chunk fields and the 80-bit extended sample rate.

ffmpeg.wasm is the only adapter that declares `aiff` as a supported input container — `src/engines/ffmpeg-wasm/codecs.ts:83` maps the canonical `aiff` token to libavformat's `aiff` demuxer (`CONTAINER_DEMUX_NAMES.aiff = ['aiff']`), and `adapter.ts:173/187` list `aiff` in the declared container sets. Because the runner pre-negotiates on declared `containersIn` (`['aiff']` from `src/scenarios/robustness/index.ts:124`), only ffmpeg.wasm was admitted; all others short-circuited to NA_ENGINE before any code ran.

The probe itself is a genuine libavformat parse, not a canned result. `FfmpegWasmEngine.probe()` (`adapter.ts:1892`) writes the input to the MEMFS scratch path and calls `runInfo()` (`adapter.ts:1912`), which executes the real vendored core via `ff.exec(['-hide_banner', ...inputOptions, '-i', inName], ...)` (`adapter.ts:1918`). `ffmpeg -i` with no output file deliberately exits non-zero after printing the Input block; the adapter guards on that by requiring `/^Input #\d+/m` to appear in the captured log (`adapter.ts:1924`) and otherwise throwing. Metadata is then derived from the actual ffmpeg log by `metadataFromLog()` (`adapter.ts:1946`): `parseDurationSecFromLog`, `parseTracksFromLog`, `parseTagsFromLog`. Note (`adapter.ts:262`) the adapter intentionally avoids the broken `_ffprobe` entry point and drives everything from the working `ffmpeg` program — so the values come from libavformat's real AIFF demuxer, including the 80-bit extended sample-rate decode and big-endian PCM tagging.

The gating oracle `golden-metadata` (`src/core/oracles.ts:595`) then compares the probed metadata field-by-field against `fixtures/golden/pcm_s16be.aiff.meta.json`: container `aiff`, duration 5s, one audio track `pcm-s16be` / 48000 Hz / 2 channels / bitrate 1536000. The shard's oracle outcome is `pass:true` with `measurements.durationDeltaSec = 0` against `durationToleranceSec = 0.041666...` (≈ a strict 1-frame band at 24fps; `oracles.ts:614-637`). A measured duration delta of exactly **0.0s** means ffmpeg's AIFF duration (derived from `SSND` size / byte-rate) matched the golden 5.000s to the millisecond — strong evidence the big-endian frame-count and 48 kHz extended sample-rate were decoded correctly. The container and full track tuple (codec/sampleRate/channels) also matched, since `goldenMetadata` returns PASS only when `diffs.length === 0` (`oracles.ts:655-656`).

## What each other framework did wrong

- **web-demuxer@4.0.0**: NA_ENGINE — does not declare input container `aiff`. Honest: web-demuxer's libav build targets MP4/WebM/MKV/TS/etc.; AIFF is not in its declared demux set.
- **mediabunny@1.48.0**: NA_ENGINE — no `aiff` input. Honest: mediabunny is an MP4/WebM-centric parser/muxer with no AIFF/RIFF audio-container demuxer.
- **remotion-media-parser@4.0.479**: NA_ENGINE — no `aiff` input. Honest. Its `codecs.ts:72` only treats `aiff` as a pass-through *codec* token, not a declared *container*, so the runner correctly excluded it.
- **mp4box@2.3.0**: NA_ENGINE — no `aiff` input. Honest: MP4Box.js parses ISO-BMFF (MP4/MOV/fragmented), structurally unrelated to IFF/AIFF chunk format.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — no `aiff` input. Honest: it consumes container output from a parser and uses WebCodecs; no AIFF demuxing path. Its `codecs.ts:112` only references `aiff` as a codec name.
- **platform@chrome-149**: NA_ENGINE — no `aiff` input. Honest: the Chrome platform path (WebCodecs + built-in demuxers) does not expose an AIFF container demuxer in the suite's capability model.

All six NA_ENGINE verdicts look honest: AIFF is a niche legacy audio container that none of these JS/WebCodecs-oriented libraries implement, and only the full libavformat (ffmpeg.wasm) build has an AIFF demuxer. No under-declaration is evident.

## Anti-cheat validation

- Scenario: `src/scenarios/robustness/index.ts:116-128` (id `edge_pcm_s16be_probe`, op `probe`, asset `pcm_s16be.aiff`, containersIn `['aiff']`, audioCodecs `['pcm-s16be']`, oracle `golden-metadata`). The inline FIX note documents that this was corrected from a non-manifest `wav_s16be.wav` to the real big-endian AIFF asset.
- Fixture: `fixtures/media/pcm_s16be.aiff` EXISTS — 960054 bytes; header bytes confirm a real `FORM/AIFF` container with a `COMM` (16-bit, 2ch, 48000 Hz) and `SSND` chunk. Not synthetic/empty/mock.
- Oracle: `golden-metadata` at `src/core/oracles.ts:595-657` performs a real field-by-field comparison (container, duration within a strict tolerance band, and per-track codec/sampleRate/channels) against the committed golden `fixtures/golden/pcm_s16be.aiff.meta.json`. It fails on any diff; it is not trivially satisfiable. Measurements (`durationDeltaSec:0`, tol `0.0417s`) are physically plausible for a 5s 48kHz/16-bit/stereo AIFF.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:1892` (probe) -> `:1912` (runInfo, real `ff.exec(['-i', ...])`) -> `:1946` (metadataFromLog from the actual ffmpeg log). Container declared at `codecs.ts:83`. No canned output, no input->output copy, no golden short-circuit; errors are surfaced (`adapter.ts:1924`) not swallowed.
- Cached note: the ffmpeg result has `cached:true` ("cached previous PASS result"), so this evidence was REUSED, not re-run in this session. The PASS is structurally sound (real fixture, real implementation, meaningful oracle), but the numbers are from a prior run; a fresh run is needed to rule out staleness per the launcher seeding caveat.

Verdict: **REAL** — real fixture + real libavformat probe implementation + meaningful field-exact metadata oracle. (Mild staleness flag because the single PASS entry is cached.)

## Confidence & caveats

Confidence: high on the verdict. Only one engine could even run, and its PASS rests on a genuine ffmpeg parse plus a strict golden-metadata comparison with a 0.0s duration delta. Caveats: (1) the winning result is `cached:true`, so it was not re-executed this run — staleness is possible. (2) There is no `bench{}` block, so no performance numbers exist; the win is purely a capability/correctness win, not a speed win. (3) The six NA verdicts are capability-gate exclusions; they are not evidence those libraries would fail AIFF, only that they do not declare it.
