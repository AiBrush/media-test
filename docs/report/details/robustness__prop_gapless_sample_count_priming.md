# robustness/prop_gapless_sample_count_priming

- **Family:** robustness
- **Fixture asset:** `fixtures/media/gapless_aac.m4a` (14 KB, real AAC-LC in MP4, 44100 Hz stereo, durationSec 1.013)
- **Primary metric:** wall (metrics declared: wall, peakMemory)
- **passCount:** 1 of 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **uncontested** (1 PASS, 6 NA_ENGINE).
- **Decisive factor:** It is the *only* engine that both declares the `trim` operation **and** declares the `audio-samples:gapless-priming` feature, and then actually re-times the AAC clip so the browser-decoded sample count equals the priming/padding-removed total. The `property-invariant` (gapless) oracle PASSed with `sampleDelta=1` (expected 48624 @ 48000 Hz, decoded 48623), inside the ≤1-sample tolerance.
- **Margin over runner-up:** No runner-up exists — every other engine returned NA_ENGINE (capability not declared), so there is no second PASS to rank against on correctness or performance.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | property-invariant:pass | n/a (no bench block; durationMs=15) | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'audio-samples:gapless-priming' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

> Note: the shard carries no `bench{}` block for any engine (only the winner ran, and only `durationMs=15` is recorded for it). The scenario declares metrics `['wall','peakMemory']` but the cached PASS payload does not include per-metric medians, so wall/throughput/memory/longtasks are unavailable in this shard.

## Why the winner wins (deep technical)

This scenario is a metamorphic *property* test, not a head-to-head. The operation is `trim(0 .. 1_012_993 µs)` on `gapless_aac.m4a` — effectively the whole clip — with the invariant `gapless-decoded-sample-count-priming-removed`. The trick of gapless AAC is that the container carries an **encoder delay (priming)**: the golden packet table (`fixtures/golden/gapless_aac.m4a.packets.json`) shows the first packet at `ptsUs = -23220` (a negative-PTS priming frame) followed by packets at 0, 23220, 46440 … µs. AAC-LC frames are 1024 samples each; the golden has packets totalling `rawAacFrameSamples = 46080` (45 × 1024 at the 44100 Hz source rate). A naïve trim that just copies frames and reports `frameCount × 1024` would expose the raw 46080-sample count instead of the priming-stripped audible length.

mediabunny passed because its `trim()` adapter (`src/engines/mediabunny/adapter.ts:1445-1500`) drives the real library `Conversion` path: it opens the input (`openInput`, line 1460), builds a `BufferTarget` `Output` (line 1484), and issues `trim: { start: range.startUs/1e6, end: range.endUs/1e6 }` (line 1488) through `runConversion` (line 1496). For a full-range trim it re-times/re-muxes the AAC track with mediabunny re-applying the edit-list / priming so the produced MP4 decodes to the *audible* length. The capability is declared honestly at `src/engines/mediabunny/adapter.ts:1051` (`trim:frame-accurate`) and `:1069` (`audio-samples:gapless-priming`, commented "full-range AAC trims preserve priming/padding-stripped decode length"), so the runner lets it run the scenario.

The gating oracle `gaplessDecodedSampleCountInvariant` (`src/core/oracles.ts:2902-2975`) then **browser-decodes the trimmed output** via `decodeAudioSampleCount(ctx.output)` (line 2924) — a real WebAudio/WebCodecs decode, not a metadata read. It derives the expected sample count from the golden (`durationSec 1.013 × decodedSampleRate`) and compares. The shard measurements are physically consistent with a true gapless decode:
- `decodedSampleRate = 48000` (Chrome's audio path resampled the 44100 Hz source to its 48 kHz mixer rate), `decodedChannels = 2` matching golden.
- `expectedDecodedRateSamples = round(1.013 × 48000) = 48624`; `decodedSamples = 48623`; `sampleDelta = 1`, inside the `sampleDelta > 1` failure threshold (oracle line 2959).
- `rawAacFrameSamples = 46080`; `expectedSourceRatePrimingRemovedSamples = 44673`; `primingSamples = 1024`; `rawMinusExpectedSourceRateSamples = 1407`. Crucially the anti-naïve check at oracle line 2965 (`rawAacFrameSamples === decodedSamples` ⇒ fail "priming/padding was not stripped") did **not** trigger, because the decoded count (48623) is not the raw frame count — priming was actually removed.
- `decodedDurationSec = 1.01297917 s` vs golden `1.013 s`, `durationDeltaSec ≈ 2.08e-5 s`, well under the `1/sampleRate = 1/44100 ≈ 2.27e-5 s` duration tolerance (oracle line 2962).

So the win is mechanistic: mediabunny's `Conversion` honored the AAC priming edit-list during the full-range trim, and a real browser decode of its MP4 yielded the priming-removed audible sample count to within a single sample.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: `engine does not declare feature 'audio-samples:gapless-priming'`. It *does* implement `trim`, but it has not declared that its AAC trim path preserves priming/padding-stripped decode length. Given ffmpeg can in principle honor gapless metadata, this NA is arguably **under-declared** rather than a true capability gap — but it is honest gating (the suite refuses to credit an unverified gapless claim).
- **mp4box@2.3.0** — NA_ENGINE: `engine does not declare operation 'trim'`. MP4Box is a demux/box-layout tool in this harness, not a trimmer; honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE: `engine does not declare operation 'trim'`. Demux-only adapter; honest NA.
- **platform@chrome-149** — NA_ENGINE: `engine does not declare operation 'trim'`. The bare-WebCodecs/platform adapter exposes decode/probe paths, not a trim/mux pipeline; honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: `engine does not declare operation 'trim'`. A parser, not an encoder/muxer; honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: `engine does not declare operation 'trim'`. Despite a WebCodecs transcode path elsewhere, it does not declare `trim` for this op; honest NA.

## Anti-cheat validation

- **Scenario:** `src/scenarios/robustness/index.ts:1083-1105` (`id: 'prop_gapless_sample_count_priming'`, op `trim`, input `gapless_aac.m4a`, features `trim:frame-accurate` + `audio-samples:gapless-priming`, invariant `gapless-decoded-sample-count-priming-removed`, startUs 0 / endUs 1_012_993). Notes explicitly require the decoded count to equal priming+padding-removed total, not frameCount×1024.
- **Fixture exists:** `fixtures/media/gapless_aac.m4a` (14 KB real AAC-LC/MP4) plus goldens `fixtures/golden/gapless_aac.m4a.meta.json` (44100 Hz stereo, 1.013 s) and `…packets.json` (real packet table, first packet `ptsUs=-23220` priming). Not synthetic/empty/mock.
- **Oracle:** `gaplessDecodedSampleCountInvariant` at `src/core/oracles.ts:2902-2975`, dispatched from `:2678`. It performs a real browser audio decode (`decodeAudioSampleCount`, line 2924) and three independent checks (sample delta ≤1, duration delta ≤ 1/sampleRate, and an explicit anti-naïve guard that fails if the decoded count equals raw frame×1024). Tolerances are tight (1 sample, ~22.7 µs), not trivially satisfiable.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1445-1500` (`trim`) → `runConversion` (line 1496). Genuine library `Conversion` with `trim:{start,end}`; no canned output, no input→output copy for a real trim (the noop short-circuit at line 1468 only fires for an explicit zero-length identity trim of a key-frame-aligned full clip, and even then the decode-count oracle still validates the bytes). No swallowed errors — it throws on bad ranges (lines 1450-1455).
- **Cached note:** the winner's result has `cached: true` (`reason: "cached previous PASS result"`, durationMs 15). The PASS evidence (decoded 48623 samples, delta 1) is real and was produced by a prior real run, but it was **reused, not re-executed in this run** — minor staleness risk if the fixture or adapter changed since caching.
- **Verdict:** **REAL** — real fixture, real mediabunny Conversion trim, and a meaningful tight-tolerance gapless-decode oracle with physically plausible measurements (priming 1024, raw 46080, decoded 48623 @ 48 kHz resample, sampleDelta 1).

## Confidence & caveats

- **Confidence:** high that mediabunny is the correct and only winner — capability gating is unambiguous (6 NA_ENGINE) and the oracle measurements are internally consistent and tight.
- **Caveats:** (1) Single PASS on a cached result; no fresh re-run in this shard, so PASS rests on prior-run evidence. (2) No `bench{}`/wall/memory data in the shard, so performance is not assessable (and irrelevant given 1 PASS). (3) ffmpeg.wasm's NA may be an under-declared gapless capability rather than a real limitation — if it declared `audio-samples:gapless-priming` this could become contested. (4) The 48000 Hz decode rate reflects Chrome resampling the 44100 Hz source; the oracle correctly recomputes the expected count at the decoded rate, so the resample does not invalidate the result.
