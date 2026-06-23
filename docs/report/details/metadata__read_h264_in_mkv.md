# metadata/read_h264_in_mkv

- **family:** metadata
- **fixture asset:** `fixtures/media/h264_in_mkv.mkv` (4.4 MB Matroska; H.264 1280x720@30 video + AAC 48 kHz stereo audio; golden `durationSec` 10.021 s)
- **primaryMetric:** wall (probe latency); oracle = `golden-metadata`
- **passCount:** 6 of 7 (1 NA_ENGINE)

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479`
- **Contested:** YES — 6 engines PASS, all satisfying the identical single oracle `golden-metadata` with no correctness separation.
- **Decisive factor:** PERFORMANCE (wall median), since correctness strength is a perfect tie. remotion-media-parser posts the lowest wall median, **17.41 ms**.
- **Margin over runner-up:** essentially a dead heat — **1.01x** faster than remotion-webcodecs (17.66 ms), **1.16x** vs mediabunny (20.27 ms), **1.50x** vs platform (26.18 ms), **2.14x** vs ffmpeg.wasm (37.25 ms), **3.87x** vs web-demuxer (67.28 ms). All benches are **n=1, mad=0**, so the top-2 gap is inside measurement noise (see Confidence).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 17.41 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 17.66 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 20.27 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 26.18 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 37.25 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 67.28 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'mkv' |

(The scenario declares only `metrics: ['wall']` in `_shared.ts:93`; throughputRealtime/peakMemory/longtasks are not collected for this probe-only case, hence n/a everywhere.)

## Why the winner wins (deep technical)

This is a pure **read/probe** of structural metadata from a **Matroska (MKV)** container carrying an **H.264** video elementary stream and an **AAC** audio track. There is no decode, no transcode, no encryption — the only work is parsing the EBML/Matroska header tree (Segment → Tracks → TrackEntry: CodecID `V_MPEG4/ISO/AVC` + `A_AAC`, plus PixelWidth/PixelHeight, default frame duration, sampling frequency, channels) and reporting container + per-track structural fields. The gate `golden-metadata` (`src/core/oracles.ts:595`) compares only `container`, `durationSec` (within a per-frame tolerance), and per-track `{type, codec, width, height, fps, sampleRate, channels}` matched positionally (`compareTrack`, `oracles.ts:659`). It does **not** compare tags, rotation, language, or bitrate (documented in `_shared.ts:13-21`). For a header-parse on a clean fixture, this is comfortably satisfiable by any competent demuxer — which is exactly what the shard shows: all six eligible engines return `durationDeltaSec` essentially 0 against a tolerance of 0.041667 s (one 24-fps frame). remotion-media-parser, remotion-webcodecs, mediabunny and platform report `durationDeltaSec` exactly 0; ffmpeg.wasm reports 0.001 s; web-demuxer reports 1.78e-15 s (float noise). Every one resolves the 2-track layout (video h264 1280x720@30, audio aac 48000/2). So **correctness is a 6-way tie at the top of nothing stronger than a metadata-exact gate** — there is no bit-exact, golden-packet, or decoded-frame oracle attached here to break the tie.

With correctness tied, the ladder drops to **performance / wall median**. remotion-media-parser's adapter takes the cheapest possible path for this operation: its `probe()` (`src/engines/remotion-media-parser/adapter.ts:348`) issues a single `parseMedia` call (`adapter.ts:363-384`) requesting only the metadata-tier fields (`durationInSeconds`, `container`, `tracks`, `metadata`, `rotation`, and `fps` only when no header fps was already found — `adapter.ts:374-381`), tagged `'metadata-only'` (`adapter.ts:383`). `parseMedia` is a streaming, **pure-JS** parser (`env.configUsed.backend: "cpu-js"`, `fieldsTier: "metadata-only"`, `worker:false`, `reader: webReader`) that stops reading bytes as soon as the requested header-tier fields are resolved; it never walks the cluster/cue body for a plain probe. That header-only stop is why it lands at 17.41 ms. remotion-webcodecs (17.66 ms) shares the same Remotion media-parser core for probing, so it is statistically indistinguishable. mediabunny (20.27 ms) is a comparably lean pure-TS ESM parser (`coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`) and lands close behind. platform@chrome-149 (26.18 ms) pays more because the browser-native path spins up WebCodecs/`<video>` plumbing it does not need for a metadata read. ffmpeg.wasm (37.25 ms) pays the cost of marshalling the file through the wasm FS and running libavformat's full `avformat_find_stream_info`, far heavier than a header-tier JS walk. web-demuxer (67.28 ms) is the slowest by ~3.9x — also a wasm/libav-derived demux that probes more aggressively than needed.

The decisive factor is therefore **lowest probe latency on a header-only Matroska parse**, won on the strength of the adapter requesting a minimal field set and the parser short-circuiting after the Tracks element. The win is real but the **margin is negligible (1.01x over the runner-up)** and rests on single-sample benches.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, lost on perf only by 0.25 ms (17.66 vs 17.41 ms = 1.01x). Effectively tied; same Remotion parsing core. Not a meaningful loss.
- **mediabunny@1.48.0** — PASS; 20.27 ms wall, 1.16x slower than winner. Correctness identical (durationDeltaSec 0). Pure perf gap.
- **platform@chrome-149** — PASS; 26.18 ms, 1.50x slower. The native WebCodecs/`<video>` config (`pixelBackend: "webgpu>webgl>offscreen2d"`, `decode: "VideoDecoder"`) is overkill for a metadata read, adding setup overhead a JS header parser avoids.
- **ffmpeg.wasm@0.12.15** — PASS; 37.25 ms, 2.14x slower. libavformat full stream-info probe inside wasm plus FS marshalling. Correct (durationDeltaSec 0.001 s, well within tolerance) but heavyweight.
- **web-demuxer@4.0.0** — PASS; 67.28 ms, 3.87x slower (the slowest passing engine). wasm/libav demux probing more of the file than a header-tier read requires.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'mkv'". This is an **honest NA**: MP4Box.js is an ISO-BMFF (MP4/MOV) parser and genuinely cannot read Matroska/EBML; it correctly declines rather than under-declaring a capability. Not a failure.

## Anti-cheat validation

- **Scenario definition:** built by `buildRead` in `src/scenarios/metadata/_shared.ts:81-96`; the MKV case is declared in `src/scenarios/metadata/index.ts:82-88` (`asset: 'h264_in_mkv.mkv'`, `container: 'mkv'`, `videoCodecs: ['h264']`, `audioCodecs: ['aac']`, op `probe`, oracle `golden-metadata`).
- **Fixture exists:** `fixtures/media/h264_in_mkv.mkv` present, **4.4 MB** real Matroska — not synthetic/empty/mock. Golden `fixtures/golden/h264_in_mkv.mkv.meta.json` describes a plausible real clip (mkv, 10.021 s, video h264 1280x720@30, audio aac 48000/2).
- **Oracle:** `goldenMetadata` at `src/core/oracles.ts:595-657` performs a real field-by-field comparison of measured probe metadata vs the golden (container string, duration within a strict ~1-frame band `0.041667 s`, positional per-track codec/dims/fps/sr/ch via `compareTrack` at `oracles.ts:659`). It is not trivially satisfiable: a wrong container, missing track, wrong codec/dims, or duration off by >1 frame all fail. Measurements in the shard (durationDeltaSec ~0 vs tol 0.041667; "2 track(s)") are physically plausible for this fixture.
- **Winner adapter:** `src/engines/remotion-media-parser/adapter.ts:348` (`probe`) → genuine `parseMedia` call with a real field request (`adapter.ts:363-384`) and `toNormalizedMetadata` mapping (`adapter.ts:386-389`). No canned output, no copy of golden, no swallowed errors — it really parses the Matroska header. Capabilities declare `mkv` as a readable input (`adapter.ts:197`), matching the operation performed.
- **Cached note:** the winner's result has **cached==true** ("cached previous PASS result", startedAt 2026-06-22T16:39:03Z). All 6 PASS results are cached and re-used, not freshly re-run — per the launcher-seeding caveat there is a (low for an immutable read) staleness risk, but the gate and adapter are real.
- **Verdict: REAL** — real 4.4 MB fixture, real `parseMedia` implementation, meaningful structural-metadata oracle with a strict duration band. The only soft spot is that this is a metadata-exact gate (no bit-exact/packet gate available for a probe), so the PASS is correct but not the strongest possible class of evidence.

## Confidence & caveats

- **Confidence: medium.** Verdict REAL and the winner is genuinely correct, but (1) the perf win is **1.01x** over remotion-webcodecs — within noise; (2) **every bench is n=1, mad=0**, so latency ordering for the top three (17.41 / 17.66 / 20.27 ms) is not statistically robust; (3) **all results are cached**, so they reflect a prior run, not a fresh execution.
- The win rests entirely on perf because correctness is a 6-way tie on a single metadata-exact oracle; another run could plausibly reorder remotion-media-parser, remotion-webcodecs and mediabunny.
- mp4box's NA is correct (no Matroska support) and should not be read as a deficiency for this codec/container pair.
