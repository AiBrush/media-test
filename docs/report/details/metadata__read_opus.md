# metadata/read_opus

- **family:** metadata
- **fixture asset(s):** `fixtures/media/opus.ogg` (145,910 bytes — real OGG container carrying an Opus audio stream)
- **golden:** `fixtures/golden/opus.ogg.meta.json` (container=ogg, durationSec=10.007, 1 audio track: codec=opus, sampleRate=48000, channels=2)
- **primaryMetric:** wall (median ms)
- **passCount:** 2 of 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES (2 PASS: ffmpeg-wasm and mediabunny). The other 5 engines are honest `NA_ENGINE` (do not declare the `ogg` input container).
- **Decisive factor:** PERFORMANCE — correctness is identical (both pass the same single oracle `golden-metadata` on the same structural fields). ffmpeg-wasm wins on wall median: **4.255 ms vs 4.450 ms = 1.046x faster** (margin ~0.195 ms). It also matched golden duration more tightly (Δ 0.0030 s vs 0.0065 s), but both are far inside the ±0.0417 s tolerance so that is not correctness-decisive.
- **Margin over runner-up (mediabunny):** 1.046x faster wall; 0.46x duration error (0.0030 s vs 0.0065 s delta). Both samples are n=1 and `cached==true`, so the margin is weak evidence (sub-millisecond gap on a single un-replicated sample).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 4.255 ms | n/a | n/a | n/a | cached previous PASS (duration Δ 0.0030 s ≤ tol 0.0417 s) |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 4.450 ms | n/a | n/a | n/a | cached previous PASS (duration Δ 0.0065 s ≤ tol 0.0417 s) |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |

Only the `wall` metric is collected for read scenarios (`metrics: ['wall']` in `buildRead`, `_shared.ts:93`); throughputRealtime/peakMemory/longtasks are not measured here.

## Why the winner wins (deep technical)

The operation is `op:'probe'` over an **OGG container carrying an Opus stream** (no transcode, no decode of audio PCM). The only gate is `golden-metadata` (`src/core/oracles.ts:595`), which compares container string, durationSec within tolerance, and per-track {type, codec, sampleRate, channels} positionally — it does NOT compare tags, bitrate, or language (`_shared.ts:13-21`). So this is purely a container-demux/header-parse race; both winners must correctly recognize the OGG bitstream, find the Opus identification header, and report 48 kHz / 2ch / ~10.007 s.

ffmpeg-wasm parses the metadata from the real `ffmpeg -i <in>` Input-block log, not ffprobe. `probe()` (`src/engines/ffmpeg-wasm/adapter.ts:1892`) writes the fixture to MEMFS, runs `ffmpeg -hide_banner -i <in>` via `runInfo` (`adapter.ts:1912`) — which deliberately exits non-zero after printing the Input block — and then `metadataFromLog` (`adapter.ts:1946`) extracts the values: `parseDurationSecFromLog` (`adapter.ts:312`) reads the `Duration: HH:MM:SS.ss` line via regex, and `parseTracksFromLog` (`adapter.ts:346`) walks the `Stream #...: Audio: opus, 48000 Hz, stereo` line, mapping `stereo`→2 channels (`channelsFromLayout`, `adapter.ts:327`) and the codec token through `canonicalCodec`. This is the libavformat OGG demuxer doing genuine page/granule-position parsing; duration comes from the Opus stream's final granule position, which is why its delta to golden (0.0030 s) is the smallest. The wall median is 4.255 ms — this is parsing the container header only (146 KB file), so the cost is dominated by MEMFS write + the `-i` log walk, which is cheap and explains the sub-5 ms time even for a wasm engine.

mediabunny ran on its `webcodecs` backend (`env.configUsed.backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`) and routes OGG through its native `OGG` input format (`src/engines/mediabunny/codecs.ts:137`). It also passed `golden-metadata` cleanly, but reported duration Δ 0.0065 s (slightly looser, likely a different granule→duration rounding) and a marginally higher wall median of 4.450 ms. The two are functionally tied on correctness; ffmpeg-wasm's edge is a sub-millisecond wall margin plus a tighter (but oracle-irrelevant) duration match.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost): correct OGG/Opus probe via its `OGG` input format, but 1.046x slower wall (4.450 ms vs 4.255 ms) and 2.2x larger duration error (0.0065 s vs 0.0030 s) — both inside tolerance, so it lost only on the performance tiebreaker on a single cached sample.
- **mp4box@2.3.0** — NA_ENGINE, honest: it is an MP4/ISO-BMFF box parser and does not declare the `ogg` container; OGG is a page-based bitstream MP4Box genuinely cannot demux.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: does not declare `ogg` input; its parser matrix does not cover OGG containers.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: does not declare `ogg`; its libav-based build is scoped to the containers it registers and OGG is not among them.
- **platform@chrome-149** — NA_ENGINE, honest: the WebCodecs/`MediaCapabilities` platform path does not declare `ogg` demux as a probe-able input container in this suite (WebCodecs has no built-in container demuxer; the platform adapter only declares what it can natively parse).
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest: does not declare `ogg` input container.

All five NA_ENGINE results are honest under-coverage, not under-declared capability: the runner gate (`src/core/runner.ts:123-125`) rejects any engine whose `caps.containersIn` lacks `ogg`, and only the two engines that genuinely register an OGG demuxer (ffmpeg-wasm via libavformat, mediabunny via `OggInputFormat`) ran.

## Anti-cheat validation

- **Scenario definition:** built by `buildRead` (`src/scenarios/metadata/_shared.ts:81`) from the case at `src/scenarios/metadata/index.ts:116-121` (`asset: 'opus.ogg'`, container `ogg`, audioCodecs `['opus']`, notes: "OGG/Opus VorbisComment header container — structural gate"). op=`probe`, oracle=`golden-metadata`.
- **Fixture is real:** `fixtures/media/opus.ogg` exists, 145,910 bytes — a genuine OGG/Opus file, not synthetic/empty/mock. Golden `fixtures/golden/opus.ogg.meta.json` holds physically plausible values (48000 Hz, stereo, 10.007 s, bitrate 116652).
- **Winner adapter is genuine:** `src/engines/ffmpeg-wasm/adapter.ts:1892` (`probe`) → `runInfo` (line 1912, runs real `ffmpeg -i`) → `metadataFromLog` (line 1946) → regex parse of duration (line 312) and tracks (line 346). No canned output, no copy of input→output, no short-circuit to the golden file, no error-swallowing-as-success (it throws if no `Input #` block is logged, line 1924).
- **Oracle is real:** `goldenMetadata` (`src/core/oracles.ts:595`) does an actual field-by-field comparison of measured metadata vs golden, with a strict per-frame duration band (measured tol 0.0417 s ≈ 1 frame @ 24fps). It is not trivially satisfiable — container/codec/sampleRate/channels must match exactly (`compareTrack`, line 659). Measurements are plausible (durationDeltaSec 0.0030/0.0065 s, well below the duration values).
- **Gate strength caveat:** this is a single structural oracle (no `golden-packets`, no decoded-PCM gate). It verifies the header was parsed correctly but does not exercise Opus packet decode, so the PASS is real but not the strongest possible gate for an audio codec.
- **Cached note:** BOTH PASS results have `cached==true` (`reason: "cached previous PASS result"`). The evidence was reused, not re-run this cycle — staleness risk applies, and the sub-millisecond wall margin rests on n=1 cached samples.
- **Verdict:** **WEAK-GATE** — real fixture + real implementation + a real but single/structural-only oracle with a generous (~1-frame) duration tolerance; the contested win is decided by a fragile sub-ms wall margin on cached n=1 data.

## Confidence & caveats

- Correctness between the two winners is effectively tied; the win is a performance tiebreaker with a ~0.2 ms margin — well within noise for n=1, mad=0 (single sample), cached results. A re-run could flip the order.
- The gate (`golden-metadata`) does not assert Opus packet-level fidelity, so neither winner is proven to decode Opus correctly here — only to parse the OGG/Opus headers.
- The 5 NA verdicts are confirmed honest via `runner.ts:123-125` and the engines' codec registries; none looks like an under-declared OGG capability.
- Confidence: **medium** (clear winner by procedure, but margin is fragile and both results are cached).
