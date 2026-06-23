# metadata/read_pcm_s16be

- **family:** metadata
- **fixture asset:** `fixtures/media/pcm_s16be.aiff` (960 KB, real `IFF data, AIFF audio`; FORM/AIFF/COMM/SSND chunks present)
- **primaryMetric:** wall (ms)
- **passCount:** 1 of 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` (engineId `ffmpeg-wasm`).
- **Contested?** No — **uncontested**. Exactly one engine reached PASS; the other six are honest `NA_ENGINE`.
- **Decisive factor:** AIFF container support. ffmpeg.wasm is the *only* engine that declares the `aiff` input container, so it is the only one eligible to run, and it satisfied the structural `golden-metadata` oracle exactly.
- **Margin over runner-up:** None to measure — every other engine never executed (NA), so there is no comparable wall/throughput number. The win is a coverage win, not a performance win.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 10.94 ms (n=1) | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| ffmpeg.wasm runner-up | — | — | — | — | — | — | (none — single PASS) |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |

(The shard records only a single `wall` metric for the winner — n=1, p95=10.94 ms, mad=0. No throughputRealtime, peakMemory, or longtasks were emitted for this metadata probe.)

## Why the winner wins (deep technical)

The operation is a pure **metadata read** of an **AIFF** container carrying **big-endian 16-bit PCM** (`pcm-s16be`), 48 kHz stereo, ~5 s. AIFF is Apple's IFF-derived RIFF cousin: a `FORM…AIFF` wrapper whose `COMM` chunk holds channel count, sample frames, bit depth, and the sample rate as an 80-bit IEEE-754 extended float, and whose `SSND` chunk holds raw big-endian PCM. The fixture's hex confirms exactly this layout: `464f524d` (`FORM`), `4149464620` (`AIFF`), `434f4d4d` (`COMM`) with `0002` channels, `0010` (16) bit depth, and the extended-float sample-rate field `400e bb80…` decoding to 48000 Hz, followed by `53534e44` (`SSND`).

Of the seven engines, **only ffmpeg.wasm declares `aiff` in its input-container capability set** (`src/engines/ffmpeg-wasm/adapter.ts:173` and `:187`, with the demuxer/muxer name fragments wired at `src/engines/ffmpeg-wasm/codecs.ts:83,99` and the extension/MIME mapping at `:128-129`/`:159-160`). The five demuxer/parser libraries and the platform WebCodecs path target ISOBMFF/Matroska/WebM/ADTS/Ogg-family containers and simply do not list AIFF, so the runner's Pass-1 declaration check (`src/core/runner.ts:123-125`) short-circuits them to `NA_ENGINE` before any bytes are touched.

Mechanically, ffmpeg.wasm does **not** use ffprobe — the vendored `@ffmpeg/core(-mt)` 0.12.10 `_ffprobe` entry returns -1 (documented at `src/engines/ffmpeg-wasm/adapter.ts:262-267`). Instead `probe()` drives the reliable `ffmpeg` program and parses its stderr `Input #0`/`Stream #` lines: the audio branch at `src/engines/ffmpeg-wasm/adapter.ts:399-403` extracts sample rate via the `(\d+)\s*Hz` regex and channel count from the layout token (`channelsFromLayout`, `:327-335`), while the container token is canonicalized from the `.aiff` suffix at `:799`. That yields `{container:'aiff', durationSec≈5, track[0]={audio, pcm-s16be, 48000 Hz, 2 ch}}`.

The gating oracle `golden-metadata` (`src/core/oracles.ts:595-657`) then does a real field-by-field comparison against `fixtures/golden/pcm_s16be.aiff.meta.json`: container string (`:606`), duration within tolerance (`:614-637`), and per-track codec/sampleRate/channels (`compareTrack`, `:659-686`). The shard's measurement `durationDeltaSec: 0` against `durationToleranceSec: 0.041666…` (±1 frame @ 24 fps) means the measured duration matched the golden 5.000 s **exactly**, and the codec/48000/stereo fields all matched (`detail: "metadata matches golden (1 track(s))"`). This is a structural/metadata-exact oracle on the strength ladder — well above smoke/perceptual.

## What each other framework did wrong

- **mediabunny@1.48.0** — `NA_ENGINE`: does not declare input container `aiff`. Honest NA; mediabunny's reader targets MP4/WebM/MP3/WAV/Ogg families, not Apple AIFF.
- **platform@chrome-149** — `NA_ENGINE`: does not declare `aiff`. Honest; Chrome's WebCodecs/MediaSource demux surface has no AIFF container demuxer.
- **ffmpeg.wasm@0.12.15** — winner (no fault).
- **mp4box@2.3.0** — `NA_ENGINE`: does not declare `aiff`. Honest by construction — MP4Box.js parses only ISOBMFF boxes; AIFF is an IFF chunk format, structurally unrelated.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: does not declare `aiff`. Honest; its container matrix does not include AIFF.
- **web-demuxer@4.0.0** — `NA_ENGINE`: does not declare `aiff`. Honest; the libav-based wasm demuxer wrapper does not expose AIFF in its declared `containersIn`.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: does not declare `aiff`. Honest; built on WebCodecs which has no AIFF demuxer.

All six NAs look genuine, not under-declared: AIFF is a niche, big-endian, chunk-based container that none of these JS/WebCodecs libraries advertise. The scenario `notes` (`src/scenarios/metadata/index.ts:100-102`) explicitly anticipates this: "Honestly NA on engines that do not declare the 'aiff' container; PASS (structural) on those that do."

## Anti-cheat validation

- **Scenario:** `src/scenarios/metadata/index.ts:96-103` — `asset: 'pcm_s16be.aiff'`, `container: 'aiff'`, `audioCodecs: ['pcm-s16be']`.
- **Fixture exists & is real:** `fixtures/media/pcm_s16be.aiff`, 960 KB, `file` reports `IFF data, AIFF audio`; hex dump shows valid FORM/AIFF/COMM/SSND chunks (not synthetic/empty/mock).
- **Golden:** `fixtures/golden/pcm_s16be.aiff.meta.json` declares container=aiff, durationSec=5, one audio track pcm-s16be/48000/2ch/1536000 bps — physically consistent (48000 × 16 × 2 = 1,536,000 bps).
- **Oracle:** `golden-metadata` at `src/core/oracles.ts:595-657` (dispatch `:313`); real container + duration-tolerance + per-track field comparison. Not trivially satisfiable: a wrong codec, channel count, sample rate, or out-of-tolerance duration would push a diff and FAIL. Measured `durationDeltaSec=0` is exact, not a wide-tolerance pass.
- **Winner adapter:** ffmpeg.wasm genuinely runs the wasm `ffmpeg` program and parses stderr (`src/engines/ffmpeg-wasm/adapter.ts:399-403`, container at `:799`); no canned output, no golden short-circuit, no input copy. The probe-derivation rationale is documented at `:262-267`.
- **Cached note:** the winner's result has `cached: true` (`reason: "cached previous PASS result"`). The PASS is a reused prior run, not a fresh execution — minor staleness risk, but the evidence (exact duration delta, correct track fields) is internally consistent and the adapter/oracle code is real.

**validationVerdict: REAL** — real AIFF fixture + real ffmpeg.wasm implementation + meaningful structural oracle with an exact (Δ=0 s) duration match and correct codec/sampleRate/channels.

## Confidence & caveats

- **Confidence: high.** Single eligible engine, honest NA gating for the other six, structural-exact oracle with a real fixture.
- **Caveats:** (1) Winner result is **cached** — a fresh re-run would strengthen the evidence, though no correctness flag suggests staleness. (2) The win is a **coverage** win (sole AIFF-capable engine), not a contested performance comparison — the 10.94 ms wall (n=1, mad=0) is informational only and has no runner-up to compare against. (3) The oracle compares parsed stderr metadata, not decoded PCM samples; it confirms the container/track are read correctly, not that every PCM sample is bit-exact (that would be `golden-packets`/`decoded-audio-pcm`, not gated here).
