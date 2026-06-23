# probe/hevc_1080p_10s

- family: probe
- fixture asset: `fixtures/media/hevc_1080p_10s.mp4` (HEVC/H.265 video + AAC audio in an MP4 container, ~11 MB, 10 s)
- golden: `fixtures/golden/hevc_1080p_10s.mp4.meta.json`
- primaryMetric: wall (golden-metadata is the single gating oracle; bench ranks the survivors)
- passCount: 7 / 7

## Verdict

- Best framework: **mediabunny@1.48.0**
- Contested: **YES** — all 7 engines PASS the only oracle (`golden-metadata`), so the decision falls to performance.
- Decisive factor: lowest wall-clock median for a header-only metadata read. mediabunny = **5.04 ms** median vs runner-up remotion-webcodecs **11.32 ms**.
- Margin over runner-up: **2.25x faster wall** (5.04 ms vs 11.32 ms). Against the slowest engine (platform, 146.88 ms) the margin is **29.1x**.
- Evidence strength caveat: every engine's bench is `n==1` (single timed sample, `warmup:1`, `mad==0`), and every result is `cached==true`. Correctness is identical across all 7 (each reports `durationDeltaSec:0`, 2 tracks), so the ranking is a pure single-sample latency comparison — real but low-resolution evidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 5.04 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 11.32 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 15.07 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 22.48 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 71.01 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 113.36 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 146.88 | n/a | n/a | n/a | cached previous PASS result |

Notes on the bench columns: this scenario only declares `metrics: ['wall']` (see `src/scenarios/probe/index.ts:349`), so throughputRealtime / peakMemory / longtasks were never collected (`n/a` for all engines). The shard carries only the `wall` metric.

## Why the winner wins (deep technical)

The operation is a **metadata probe of an MP4 carrying HEVC (hvc1/hev1) video + AAC audio**. A probe must report container, duration, and per-track codec/dimensions/fps/sampleRate/channels. The golden (`hevc_1080p_10s.mp4.meta.json`) demands: container `mp4`, durationSec `10`, track[0] `video/hevc 1920x1080 @ 30fps`, track[1] `audio/aac 48000Hz 2ch`. The `golden-metadata` oracle (`src/core/oracles.ts:595`) compares container, duration within the strict ±1-frame band (`durationToleranceSec ≈ 0.04167 s`, oracles.ts:159), and each track positionally via `compareTrack` (oracles.ts:659). Crucially, `compareTrack` ignores bitrate, language, and tags — so for this fixture the contract reduces to: correct container + duration within 41.7 ms + 2 tracks with the right codec/dims/fps/rate/channels. All 7 engines satisfy it identically (`durationDeltaSec:0`), which is why the win is decided on speed, not correctness.

The decisive mechanism is **how cheaply each engine extracts duration and track descriptors from a faststart MP4**. For ISOBMFF, all of this lives in the `moov` atom (mvhd duration/timescale, trak/mdia/minf/stbl/stsd sample-entry boxes giving codec + dims + sample rate). The cheapest correct probe reads the `moov` and stops — it does NOT walk the sample table or scan the `mdat`. mediabunny's adapter does exactly this: `probe()` (`src/engines/mediabunny/adapter.ts:1134`) opens the input and calls `metadataFromInput` (adapter.ts:417), which takes the **cheap duration path first** — `input.getDurationFromMetadata()` (adapter.ts:429), reading the declared mvhd duration WITHOUT a sample scan, and only falls back to `computeDuration()` (a full walk) when the metadata duration is null (adapter.ts:434-441). For a normal 10 s MP4 with a valid mvhd, the cheap path returns 10 s immediately, so the entire probe is an O(header) front-of-file read. mediabunny is a pure-TS ESM core (`env.configUsed.coreBuild: "pure-ts-esm"`, no wasm boot, `wasmThreads:0`, no COOP/COEP), so there is no module-instantiation tax on the timed call — yielding the 5.04 ms median.

By contrast the two slowest engines pay structural overheads unrelated to correctness. **ffmpeg.wasm (71.01 ms)** must round-trip the file through a wasm `ffprobe`-style demux inside the emscripten VM (wasm call boundary + libavformat probe). **platform (146.88 ms)** uses the browser-native path (`backend: "webcodecs"`, `decode: "VideoDecoder"`, `encode: <video>→canvas→MediaRecorder`) — for a probe it leans on the media element / WebCodecs configuration machinery, which is far heavier than a direct box parse for a metadata-only read; it is the worst tool for an O(header) job. **mp4box (113.36 ms)** is a pure-JS ISOBMFF parser but its `config.pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"` with `rangeReads:false` means it appends the whole 11 MB buffer through `onReady` before surfacing the moov — whole-file buffering instead of mediabunny's lazy header read.

The closest competitors are themselves lazy header readers: **remotion-webcodecs (11.32 ms)** and **remotion-media-parser (15.07 ms)** both stream-parse the MP4 header (`fieldsTier: "metadata-only"`, `pipeline: "streaming"`), and **web-demuxer (22.48 ms)** is a wasm demuxer with a lighter probe than ffmpeg.wasm. mediabunny still beats remotion-webcodecs by 2.25x — the gap is the pure-TS, zero-wasm, single-call `getDurationFromMetadata` path versus remotion's heavier parser/worker-capable plumbing.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, but lost on speed: wall 11.32 ms vs 5.04 ms (**2.25x slower**). Same identical correctness (`durationDeltaSec:0`, 2 tracks). Streaming metadata-only parse is competitive but carries more parser/worker-capable plumbing than mediabunny's pure-TS header read.
- **remotion-media-parser@4.0.479** — PASS; wall 15.07 ms (**2.99x slower**). `cpu-js` streaming `metadata-only` reader; correct but slower than the webcodecs sibling and mediabunny.
- **web-demuxer@4.0.0** — PASS; wall 22.48 ms (**4.46x slower**). wasm demuxer; correct metadata but the wasm boundary makes a metadata-only read cost more than the pure-JS/TS header readers.
- **ffmpeg.wasm@0.12.15** — PASS; wall 71.01 ms (**14.1x slower**). Full libav-style probe inside the emscripten VM; correct but a heavyweight path for an O(header) job.
- **mp4box@2.3.0** — PASS; wall 113.36 ms (**22.5x slower**). Pure-JS ISOBMFF but `whole-file-append` with `rangeReads:false` buffers the entire 11 MB before exposing the moov.
- **platform@chrome-149** — PASS; wall 146.88 ms (**29.1x slower**, slowest). Browser-native WebCodecs/media-element path is the wrong tool for a metadata-only probe; heaviest setup cost.

No engine FAILed and no engine returned NA — HEVC-in-MP4 probe is universally supported across the corpus, so the NA-negotiation logic (codec hint `videoCodecs:['hevc']`) was not triggered for any engine.

## Anti-cheat validation

- Scenario definition: `src/scenarios/probe/index.ts:66` — `{ asset: 'hevc_1080p_10s.mp4', container: 'mp4', videoCodecs: ['hevc'], audioCodecs: ['aac'] }`, mapped to id `probe/hevc_1080p_10s` with `op: 'probe'`, `oracles: ['golden-metadata']`, `metrics: ['wall']` (index.ts:335-354).
- Fixture: `fixtures/media/hevc_1080p_10s.mp4` exists and is a real ~11 MB media file (not synthetic/empty/mock). Golden `fixtures/golden/hevc_1080p_10s.mp4.meta.json` exists and carries physically plausible values (mp4, 10 s, 1920x1080 HEVC @ 30fps + 48 kHz stereo AAC, with real bitrates 8.71 Mbps video / 128 kbps audio).
- Oracle: `golden-metadata` at `src/core/oracles.ts:595` performs a real comparison — container string match (oracles.ts:606), duration within a ±1-frame strict band (oracles.ts:614-637, ~0.0417 s here, NOT loose), and positional per-track codec/dims/fps/sampleRate/channels diff (`compareTrack`, oracles.ts:659-686). It is not trivially satisfiable: a wrong codec, wrong dims, or a duration off by >41.7 ms FAILs. The measured `durationDeltaSec:0` and `durationToleranceSec:0.04167` in the shard are consistent with a precise mvhd duration and the strict band.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1134` (`probe`) → `metadataFromInput` (adapter.ts:417) calls the real mediabunny `Input` API: `getDurationFromMetadata()` (adapter.ts:429), `getTracks()` (adapter.ts:443), `getFormat()` (adapter.ts:418). No canned output, no copy-input-to-output, no short-circuit to the golden file, no swallowed error reported as success (the catch blocks fall back to `computeDuration` or null, not to a fabricated pass).
- Caveat — caching: **every engine's result has `cached==true`** ("cached previous PASS result"). The numbers were reused from a prior run, not freshly re-executed in this report run. Staleness risk applies to the absolute wall numbers, though the relative ordering (mediabunny fastest) is consistent with the architectural analysis.
- Verdict: **REAL** — real 11 MB HEVC/MP4 fixture, a genuine mediabunny library implementation that reads the actual moov, and a meaningful strict-band metadata oracle. The only weakness is evidentiary (n==1 single sample + all-cached), not a cheat.

## Confidence & caveats

- Confidence: **medium**. Correctness is unambiguous (real fixture, real oracle, real adapter, identical PASS for all 7). The *winner* ranking rests on a single timed sample per engine (`n==1`, `mad==0`) and all results are cached, so the precise 2.25x margin could shift on a fresh multi-sample run — but mediabunny's pure-TS, zero-wasm, cheap-duration-path architecture makes its first-place finish for a header-only probe robust regardless.
- The bench columns throughputRealtime/peakMemory/longtasks are genuinely absent (scenario only declares `wall`), not omitted by error.
- All 7 engines exercise the same browser/GPU env (Chromium 149, Apple M1 Max); no engine-specific environment advantage skews the comparison.
