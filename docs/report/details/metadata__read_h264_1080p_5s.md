# metadata/read_h264_1080p_5s

- family: metadata
- fixture asset: `h264_1080p_5s.mov` (QuickTime MOV, H.264 video 1920x1080@30fps + AAC 48000/2, ~4.4 MB, 5.0s)
- primaryMetric: wall (ms)
- passCount: 7 / 7
- op: `probe`; gating oracle: `golden-metadata` (structural, single oracle)

## Verdict

- Best framework: **mp4box@2.3.0** (uncontested on correctness — all 7 tie; decided on performance).
- Contested: YES — all 7 engines PASS the single `golden-metadata` oracle, so correctness strength is identical and the ranking falls through to performance.
- Decisive factor: lowest wall median. mp4box = 9.405 ms vs runner-up remotion-media-parser = 9.790 ms.
- Margin over runner-up: **1.04x faster wall** (9.790 / 9.405). This is a razor-thin, low-confidence margin: every bench is `n==1`, `mad==0`, `cached==true` (single warmed sample, reused not re-run).

## Per-engine results

All engines pass exactly one oracle (`golden-metadata:pass`). The scenario declares no throughput/memory/longtask metrics (`metrics: ['wall']`), so those columns are not measured.

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-metadata:pass | 9.405 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 9.790 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 11.130 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 21.710 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 42.360 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 96.710 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 6000.370 | n/a | n/a | n/a | cached previous PASS result |

Oracle measurements: every engine reports `durationDeltaSec: 0` against a `durationToleranceSec: 0.041666…` (±1 frame at 24fps reference band), except `platform@chrome-149` at `durationDeltaSec: 0.021333` (still well inside the ±0.0417s band). All match golden "(2 track(s))".

## Why the winner wins (deep technical)

This is a pure **probe** of structural metadata from a QuickTime MOV (ISO-BMFF family with the `qt  ` major brand) carrying H.264 video and AAC audio. The oracle (`src/core/oracles.ts:595` `goldenMetadata`) only compares container token, global duration (±1 frame), and per-track codec/dims/fps/sampleRate/channels (`compareTrack`, `src/core/oracles.ts:659`); it never inspects tag content, rotation, or language (documented HONEST SCOPE in `src/scenarios/metadata/index.ts:21-40`). The golden (`fixtures/golden/h264_1080p_5s.mov.meta.json`) requires: container `mov`, duration `5`, video h264 1920x1080 30fps, audio aac 48000/2. Because this is metadata-only, no engine has to touch `mdat` pixel/sample bytes — the winner is whoever parses the `moov` box tree fastest with no false reads.

mp4box's advantage is structural: its `probe()` (`src/engines/mp4box/adapter.ts:749`) reads the whole file, drives a real `ISOFile` to `onReady`/`flush()` (`parseToInfo`/`driveToReady`, `src/engines/mp4box/adapter.ts:708-732`), then converts via `toNormalizedMetadata` (`src/engines/mp4box/adapter.ts:412`). For probe it uses `discardMdatData=true` (`config` at `src/engines/mp4box/adapter.ts:99`, `parseToInfo(bytes, false)` at line 754), so the parser drops `mdat` media bytes and keeps only the `moov` box tree — minimal work for a metadata read. Container disambiguation is correct and cheap: `canonicalContainer` (`src/engines/mp4box/adapter.ts:304`) inspects `ftyp` brands and maps the `qt  ` brand to `mov` (matching the golden exactly — getInfo() alone does not distinguish mov from mp4). Duration comes straight from `mvhd` (`info.duration / info.timescale`, line 416), giving the exact `durationDeltaSec: 0`. Video fps is the average `nb_samples / track-seconds` (line 449) which lands within the ±0.05 fps oracle tolerance, and audio sampleRate/channels are decoded from the real AAC AudioSpecificConfig / QuickTime v2 AudioSampleEntry (`audioParamsFromSampleEntry`, line 388) rather than trusting legacy placeholder fields. This is a focused, native-JS box walk with no decoder spin-up.

The reason mp4box edges every other PASS engine here is that it does the least work that still satisfies the structural gate: a single whole-file append + `moov`-only parse. There is no WebCodecs `VideoDecoder` configuration, no wasm core to instantiate, no demux of the full sample table required for this op. remotion-media-parser (9.79 ms) is essentially tied — a streaming `cpu-js` parser (`configUsed.backend: cpu-js`, `pipeline: streaming`, `fieldsTier: metadata-only`) that also stops at metadata; it is 0.385 ms slower, attributable to streaming-reader overhead vs mp4box's whole-buffer append. The slower engines pay setup costs irrelevant to a metadata read: ffmpeg.wasm (21.71 ms) carries wasm-core overhead, web-demuxer (42.36 ms) goes through its wasm demux layer, mediabunny (96.71 ms) spins up its WebCodecs-oriented streaming-lockstep pipeline (`backend: webcodecs`, `prefer-hardware`) even though the probe needs none of it, and platform@chrome-149 (6000.37 ms) is catastrophically slow because its "probe" path runs the full `<video>`/WebCodecs platform pipeline (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`) — it effectively plays/decodes ~5s of media to read header fields, hence the ~6.0s wall that mirrors the clip duration.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on perf only. wall 9.790 ms vs winner 9.405 ms = 1.04x slower. Same single oracle passed, `durationDeltaSec: 0`. Loss is within streaming-reader overhead; with `n==1` this is not a meaningful gap.
- **remotion-webcodecs@4.0.479** — PASS. wall 11.130 ms = 1.18x slower than winner. Correctness identical (`durationDeltaSec: 0`). Its WebCodecs/backpressure adapter is heavier than a pure moov walk for a header-only read.
- **ffmpeg.wasm@0.12.15** — PASS. wall 21.71 ms = 2.31x slower. wasm-core/FS overhead dominates a trivial metadata read; correctness identical.
- **web-demuxer@4.0.0** — PASS. wall 42.36 ms = 4.50x slower. Routes the probe through its wasm demuxer; correct but expensive for moov-only data.
- **mediabunny@1.48.0** — PASS. wall 96.71 ms = 10.28x slower. `backend: webcodecs, hwAccel: prefer-hardware, pipeline: streaming-lockstep` — pays WebCodecs/pipeline init the metadata read never uses.
- **platform@chrome-149** — PASS but worst by 3 orders of magnitude. wall 6000.37 ms = 638x slower. Its probe drives the full platform decode/playback path (`decode: VideoDecoder`), so reading 5s of header takes ~5s of wall. Also the only engine with a non-zero `durationDeltaSec` (0.021333), though still inside tolerance.

## Anti-cheat validation

- Scenario definition: `src/scenarios/metadata/index.ts:64-71` (asset `h264_1080p_5s.mov`), built into a `probe` scenario by `buildRead` at `src/scenarios/metadata/_shared.ts:81` (`op: 'probe'`, `oracles: ['golden-metadata']`). Notes confirm intent: MOV as a tag carrier distinct from mp4 udta, gating structural metadata only.
- Fixture exists and is REAL: `fixtures/media/h264_1080p_5s.mov`, 4.4 MB (confirmed via stat). Not synthetic/empty/mock. Golden present: `fixtures/golden/h264_1080p_5s.mov.meta.json` (container mov, 5s, h264 1920x1080@30, aac 48000/2).
- Oracle: `goldenMetadata` at `src/core/oracles.ts:595` performs a real field-by-field comparison (container, duration with ±1-frame band, per-track codec/dims/fps/sr/ch via `compareTrack` at `:659`). It is NOT trivially satisfiable: a >1-frame duration drift or any codec/dim mismatch fails. Measurements are physically plausible (mov, exact 5.000s, 2 tracks). It is a STRUCTURAL/metadata-exact gate (mid-ladder), not bit-exact and not smoke — strong enough for a probe but it does NOT verify tag content (documented limitation).
- Winner adapter: `src/engines/mp4box/adapter.ts:749` `probe()` → `parseToInfo` (real `ISOFile.appendBuffer`/`flush`/`getInfo`) → `toNormalizedMetadata` (`:412`). Genuinely calls the mp4box library; no canned output, no golden short-circuit, no input copy, no error-swallow-as-success (errors reject via `onError`).
- Cached note: winner result has `cached: true` ("cached previous PASS result") — it was REUSED, not re-run for this report. The PASS itself is real, but the 9.405 ms timing is a single stale, warmed sample. Staleness risk applies to the perf margin specifically.

Verdict: **REAL** — real MOV fixture, genuine mp4box `moov` parse, meaningful structural oracle. The only weakness is that the deciding metric (perf) rests on cached `n==1` samples.

## Confidence & caveats

- Confidence: medium. The PASS/correctness verdict is solid (real fixture + real parser + real structural oracle). The *ordering* of the winner is low-confidence: 7 engines tie on correctness and the win is a 1.04x wall gap on a single cached sample (`n==1, mad==0, cached==true`). mp4box vs remotion-media-parser could flip on a fresh re-run.
- The oracle does not assert tag content, rotation, or language (by design, see HONEST SCOPE). "Best at reading metadata" here means "fastest correct structural probe", not "richest tag extraction".
- platform@chrome-149's 6000 ms is an architectural artifact (full decode path used for a probe), not a correctness failure — it still PASSes, just absurdly slowly.
- All numbers above are taken verbatim from the shard; no values were invented.
