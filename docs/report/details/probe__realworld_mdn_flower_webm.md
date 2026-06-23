# probe/realworld_mdn_flower_webm

- **family:** probe
- **fixture asset:** `fixtures/media/realworld_mdn_flower.webm` (real MDN CC0 flower clip, 554 KB, VP8 video + Vorbis audio in WebM)
- **golden:** `fixtures/golden/realworld_mdn_flower.webm.meta.json` (container=webm, durationSec=5.059, 2 tracks: vp8 960x540@29.97, vorbis 44100/2ch)
- **primaryMetric:** wall (ms; this is a per-container correctness probe, not a `opsPerSec` perf-headline case)
- **passCount:** 5 of 7 (1 NA_ENGINE, 0 FAIL)

## Verdict

- **Best framework:** mediabunny@1.48.0 — **CONTESTED** (5 engines PASS).
- **Decisive factor:** With correctness tied (every PASS engine satisfies the single `golden-metadata` oracle with the same 2-track match and a sub-tolerance duration delta), the tiebreaker is `wall` median. mediabunny is the fastest at **4.315 ms**.
- **Margin over runner-up:** ffmpeg.wasm@0.12.15 at 5.30 ms → mediabunny is **1.23x faster wall** (5.30 / 4.315). Against the rest the margin widens: 2.36x vs remotion-media-parser (10.17 ms), 2.96x vs web-demuxer (12.75 ms), 4.40x vs remotion-webcodecs (18.99 ms), and ~1390x vs platform (6000 ms). Evidence is weak in spread terms: every bench is **n=1, mad=0, cached=true**, so the ordering is a single-sample snapshot, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 4.315 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 5.30 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 10.17 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 12.755 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 18.985 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 6000.165 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'webm' |

Note: the shard's `bench` block contains only the `wall` metric for this probe case; throughputRealtime / peakMemory / longtasks were not collected (probe metrics: `['wall']`), hence "n/a".

## Why the winner wins (deep technical)

**The operation.** This is a metadata-only probe of a Matroska/WebM container carrying a VP8 video track (960x540, 29.97 fps nominal) and a Vorbis audio track (44.1 kHz stereo), Lavf-muxed. The scenario is built by the per-container probe factory (`src/scenarios/probe/index.ts:335-354`) with `op: 'probe'`, `oracles: ['golden-metadata']`, `metrics: ['wall']`. There is exactly one gate: container token, duration within ±1 frame, and a positional per-track compare of type/codec/dims/fps/sampleRate/channels (`src/core/oracles.ts:595-657`). No decode, no packet walk — so the winning move is to read the EBML/Segment header and Tracks element cheaply and stop.

**What mediabunny actually did.** Its adapter probes through `metadataFromInput` (`src/engines/mediabunny/adapter.ts:416-474`). The key cost-control choice is the duration path: it calls `input.getDurationFromMetadata()` first (`adapter.ts:429`), which reads the WebM Segment `Duration` element from the header WITHOUT scanning clusters/SimpleBlocks, and only falls back to the O(samples) `computeDuration()` scan when metadata yields null/non-finite (`adapter.ts:434-441`). Tracks come from `input.getTracks()` and are normalized one-by-one (`adapter.ts:443-447`). For a 5 s / 554 KB WebM the header-only path is the entire work, which is why mediabunny lands at 4.315 ms — a pure-TS ESM library (`coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, no SharedArrayBuffer) with no wasm instantiation or worker round-trip on the metadata path. The oracle confirms the result is correct: `golden-metadata` passed with `durationDeltaSec = 0.003 s` against `durationToleranceSec = 0.04167 s` (≈1 frame @ 24 fps), and "metadata matches golden (2 track(s))" — i.e. container=webm, both vp8 dims/fps and vorbis sampleRate/channels matched the committed golden positionally.

**Why it beat the rest mechanistically.** Correctness is identical across all five PASS engines (same single structural oracle, all sub-tolerance), so the contest collapses to wall time on a header read. mediabunny's advantage is the absence of any heavyweight runtime on the hot path: ffmpeg.wasm must run a libavformat probe inside a wasm VM (warm but still a wasm call boundary) and reports 5.30 ms; remotion-media-parser runs a `cpu-js` / `webReader` streaming parser at the `metadata-only` field tier (its own `configUsed`) and pays JS-streaming overhead → 10.17 ms; web-demuxer wraps an FFmpeg-derived wasm demuxer → 12.755 ms; remotion-webcodecs spins up its convert/parse machinery (worker-capable, backpressure writer) even for a pure probe → 18.985 ms. The platform engine is the outlier at 6000.165 ms because its "probe" is the browser media-element path (`decode: "VideoDecoder"`, `encode: "<video>→canvas→MediaRecorder"`): it loads the `.webm` into a real `<video>`/MediaSource and waits on `loadedmetadata`, a multi-second media-stack round-trip versus a direct header parse. So the decisive factor is purely "header parser vs media runtime," and mediabunny's pure-TS header read is the leanest of the lot.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** Correct (golden-metadata pass, `durationDeltaSec = 0.001 s`) but 5.30 ms vs 4.315 ms = 1.23x slower wall; the libavformat probe runs inside the wasm VM, adding a call-boundary tax over mediabunny's native-JS header read.
- **remotion-media-parser@4.0.479 (PASS, lost):** Correct (`durationDeltaSec = 0`), but 10.17 ms = 2.36x slower; `backend: cpu-js`, `reader: webReader`, `fieldsTier: metadata-only` — a JS streaming parser whose per-chunk overhead exceeds a one-shot header read.
- **web-demuxer@4.0.0 (PASS, lost):** Correct (`durationDeltaSec = 0`), but 12.755 ms = 2.96x slower; wasm demuxer wrapper pays VM + glue overhead for what is a trivial header parse.
- **remotion-webcodecs@4.0.479 (PASS, lost):** Correct (`durationDeltaSec = 0`), but 18.985 ms = 4.40x slower; its convert/extract pipeline (streaming-backpressure, bufferWriter, worker-capable) is heavyweight for a metadata-only call.
- **platform@chrome-149 (PASS, lost badly):** Correct (`durationDeltaSec = 0.004 s`) but 6000.165 ms ≈ 1390x slower; the "probe" is a `<video>`/MediaSource load awaiting metadata, not a parser — orders of magnitude off for header-only work.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — reason "engine does not declare input container 'webm'". MP4Box.js is an ISOBMFF (MP4/MOV) parser and genuinely cannot read Matroska/WebM; the `requires.containersIn: ['webm']` gate (`src/scenarios/probe/index.ts:342`) correctly negotiates it out rather than forcing a guaranteed failure. This NA is a true capability gap, not an under-declaration.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/probe/index.ts:102-111` (case entry) → built at `src/scenarios/probe/index.ts:335-354`. Operation is `probe`, oracle `golden-metadata`, metric `wall`. Notes state it is a "Real-world fetched corpus smoke: MDN CC0 flower.webm from sourceUrl in manifest" — deliberately a real browser-documentation WebM, not generated testsrc.
- **Fixture exists and is real:** `fixtures/media/realworld_mdn_flower.webm` is present, **554 KB** (confirmed via `ls`/`stat`), VP8+Vorbis WebM. Golden present: `fixtures/golden/realworld_mdn_flower.webm.meta.json` (435 bytes, container=webm, durationSec=5.059, 2 tracks). Not synthetic, empty, or mocked.
- **Winner adapter genuinely implemented:** `src/engines/mediabunny/adapter.ts:416-474` opens a real mediabunny `Input`, calls real library methods `getFormat()`, `getDurationFromMetadata()`, `getTracks()`, `getMetadataTags()`. No canned output, no copy of input→golden, no error-swallow-as-success (failures set duration null / leave fields unset, which would FAIL the oracle, not pass it).
- **Oracle is a real comparison:** `golden-metadata` at `src/core/oracles.ts:595-657` reads measured metadata vs the committed golden, diffs container, duration (±1-frame band = 0.04167 s via `durationToleranceFor`), and every track field positionally (`compareTrack`, lines 659-686). It is NOT trivially satisfiable: it is structural/metadata-exact, not a smoke gate and not an ssim proxy. Measurements are physically plausible — durationDeltaSec values (0, 0.001, 0.003, 0.004) are well under the 0.04167 s tolerance and consistent with a true ~5.059 s clip; "2 track(s)" matches the golden's VP8+Vorbis pair.
- **Cached note:** Every engine's result has `cached: true` ("cached previous PASS result"). The PASS verdicts and the metadata diffs are trustworthy (correctness is deterministic), but the `wall` timings (and thus the perf ordering that decides the winner) are REUSED, not freshly re-run — n=1, mad=0. Per the launcher-seeding caveat, a stale-PASS reuse risk applies to the timing margins specifically.
- **Verdict: REAL.** Real CC0 fixture, real mediabunny library calls, real structural oracle with plausible measurements. The only caveat is that the deciding metric is cached single-sample timing (downgrades confidence, not the verdict).

## Confidence & caveats

- **Confidence: medium.** Correctness winner identity (mediabunny eligible, fastest) is solid; the gate is a real structural oracle on a real fixture.
- **Caveats:** (1) The tiebreak is performance with **n=1, mad=0, cached=true** for all engines — a single reused sample per engine, so the 1.23x margin over ffmpeg.wasm is suggestive, not statistically robust; a fresh re-run could reorder the top two. (2) Correctness among the 5 PASS engines is genuinely tied (one structural oracle, all sub-tolerance), so this is a "fastest correct probe" win, not a correctness-strength win. (3) No peakMemory/throughput/longtasks were collected for this case, so secondary tiebreakers could not be applied.
