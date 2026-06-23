# probe/h264_4k_10s

family: probe | fixture asset: `h264_4k_10s.mp4` (3840x2160 H.264 + 48kHz stereo AAC, 10s, MP4) | primaryMetric: wall | passCount: 7/7

## Verdict

- Best framework: **mediabunny@1.48.0** (status PASS).
- CONTESTED: all 7 engines PASS the single gating oracle (`golden-metadata`), so correctness is identical/comparable across the field; the decision is made purely on the tie-break performance axis (`wall` median).
- Decisive factor: wall-clock latency. mediabunny probes the 4K MP4 in **5.82 ms** median, vs **14.25 ms** for the runner-up (remotion-media-parser).
- Margin over runner-up: **2.45x faster wall** (14.25 / 5.82). Against the slowest passing engine (platform@chrome-149, 294.11 ms) the margin is **50.5x**.

## Per-engine results

All seven engines pass the same and only oracle, `golden-metadata`, with identical measurements (durationDeltaSec 0, durationToleranceSec 0.041666...). primaryMetric here is `wall` (this is a per-asset golden probe, not one of the `perf-extract-metadata-*` opsPerSec headline cases). throughputRealtime / peakMemory / longtasks are not present in this shard's bench (only `wall` was collected).

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 5.82 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 14.25 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 26.17 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 59.80 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 74.42 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 92.92 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 294.11 | n/a | n/a | n/a | cached previous PASS result |

## Why the winner wins (deep technical)

The operation is a pure metadata probe of a 4K H.264-in-MP4 file (faststart ISOBMFF: a `moov` carrying `mvhd` global duration, two `trak`s with `avc1`/`mp4a` sample-entry descriptions and `stts`/`stsd` tables). A correct probe needs only the container header boxes — container token, `mvhd` duration, and per-track codec/dims/fps/sampleRate/channels — and must NOT decode any of the 300 video frames or walk the full sample table of the 26 MB file. The golden (`fixtures/golden/h264_4k_10s.mp4.meta.json`) asserts exactly that: container `mp4`, durationSec 10, track[0] video h264 3840x2160 @30fps, track[1] audio aac 48000Hz/2ch. The oracle `goldenMetadata` (src/core/oracles.ts:595) compares container, duration within a strict ~1-frame band (durationToleranceSec 0.0417 s = 1/24, i.e. one frame), and each track positionally via `compareTrack` (oracles.ts:659) on type/codec/width/height/fps/sampleRate/channels. Every engine cleared this with durationDeltaSec exactly 0, meaning all seven read the declared `mvhd` duration rather than estimating — so the field is genuinely tied on correctness.

With correctness tied, the win is mechanistic latency. mediabunny ran on the `webcodecs` backend with `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`, `wasmThreads: 0` (env.configUsed). Crucially for a *probe*, no WebCodecs decoder is actually instantiated — the adapter's probe path (src/engines/mediabunny/adapter.ts:417 `metadataFromInput`) calls `input.getDurationFromMetadata()` FIRST (adapter.ts:429), which reads the `mvhd`/track-header declared duration without scanning samples, and only falls back to the expensive `computeDuration()` full-fragment walk when metadata yields null (adapter.ts:434-441). For this faststart MP4 the cheap path returns 10s immediately, so the probe is a small front-of-file box parse plus `getTracks()` + `normalizeTrack` (adapter.ts:443-447). This is pure-TS reading directly over a `BlobSource` with no wasm module instantiation, no worker round-trip, and no GPU/decoder spin-up — hence the 5.82 ms median.

The runner-up, remotion-media-parser (14.25 ms), is architecturally the closest: `backend: cpu-js`, `fieldsTier: metadata-only`, `pipeline: streaming`, `webReader`. It is also a header-only JS parse, which is why it is 2.45x of mediabunny rather than 10x — but mediabunny's tighter pure-TS box reader and the `getDurationFromMetadata` fast path edge it out. The remaining engines pay structural overhead that a probe does not need: mp4box (59.80 ms) buffers the WHOLE file via `whole-file-append(MP4BoxBuffer+fileStart)` with `rangeReads: false` (env.configUsed), so for a 26 MB asset it appends all 26 MB before surfacing the moov; web-demuxer (74.42 ms) and ffmpeg.wasm (92.92 ms) both route through a wasm module (libav-style) whose instantiation/parse dominates a trivial header read; and platform@chrome-149 (294.11 ms) is the worst because its probe path leans on the media element / WebCodecs setup (`decode: VideoDecoder`, `pixelBackend: webgpu>webgl>offscreen2d`) — spinning the platform demuxer/decoder plumbing just to read metadata is 50x slower than mediabunny's direct box parse.

Caveat on evidence strength: every bench here is n==1, warmup 1, mad 0, p95==median (single sample). The ordering is large and monotonic (5.82 << 14.25 << ... << 294.11), so the *ranking* is robust even at n==1, but the precise ratios carry single-sample noise and should be read as order-of-magnitude, not 3-significant-figure, truths.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on perf only. Closest competitor (also header-only cpu-js, metadata-only tier) but 14.25 ms vs 5.82 ms = 2.45x slower wall; no correctness deficit.
- **remotion-webcodecs@4.0.479** — PASS, lost on perf. 26.17 ms = 4.50x slower; webcodecs-oriented pipeline carries more setup than a bare box parse needs for probe.
- **mp4box@2.3.0** — PASS, lost on perf. 59.80 ms = 10.3x slower. `whole-file-append` with `rangeReads:false` buffers the entire 26 MB before exposing the moov, unnecessary for a faststart header probe.
- **web-demuxer@4.0.0** — PASS, lost on perf. 74.42 ms = 12.8x slower; wasm demuxer instantiation/parse overhead dominates a trivial metadata read.
- **ffmpeg.wasm@0.12.15** — PASS, lost on perf. 92.92 ms = 16.0x slower; full libav wasm pipeline spin-up is the heaviest of the parser group for a header-only op.
- **platform@chrome-149** — PASS, lost on perf decisively. 294.11 ms = 50.5x slower; the browser-native path engages VideoDecoder/canvas/pixel-backend plumbing to obtain metadata, the wrong tool for a pure probe.

## Anti-cheat validation

- Scenario definition: src/scenarios/probe/index.ts:65 — `{ asset: 'h264_4k_10s.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] }`, mapped at index.ts:335-354 to id `probe/h264_4k_10s`, op `probe`, oracles `['golden-metadata']`, metrics `['wall']`. Real per-asset golden probe, not a synthetic/empty input.
- Fixture: `fixtures/media/h264_4k_10s.mp4` EXISTS, 26 MB on disk — a real 4K asset, not a mock/zero-byte file.
- Golden: `fixtures/golden/h264_4k_10s.mp4.meta.json` present and physically plausible for the named media — 3840x2160 (true 4K), 30fps, h264 video bitrate ~20.8 Mbit/s (consistent with 4K), 48kHz/2ch aac ~128 kbit/s, durationSec 10. Companion goldens (.packets.json 87k, .ssim.json 76k, .frames.json) exist but are not used by this probe scenario.
- Oracle: src/core/oracles.ts:595 `goldenMetadata` performs a real field-by-field comparison (container at :606, duration with a strict ~1-frame band at :614-637, positional per-track compare via `compareTrack` at :659-686). Not trivially satisfiable: it would FAIL on wrong container, duration drift > one frame, track-count mismatch, or any codec/dims/fps/rate/channel mismatch. Measured durationDeltaSec 0 against tolerance 0.0417 s is physically plausible (engine read the declared mvhd duration).
- Winner adapter: src/engines/mediabunny/adapter.ts:417 `metadataFromInput` genuinely calls the mediabunny library — `input.getDurationFromMetadata()` (:429), `input.computeDuration()` fallback (:436), `input.getTracks()` (:443), `normalizeTrack` per track (:446), `input.getMetadataTags()` (:457). No canned output, no short-circuit to the golden file, no error-swallow-as-success (the try/catch sets duration to null and falls through to a real fallback, not a fake pass).
- Verdict: **REAL**. Real 26 MB 4K fixture, real library probe call path, meaningful multi-field golden comparison with a strict 1-frame duration band.
- Cached note: ALL seven engine results have `cached: true` (reason "cached previous PASS result"). The numbers were reused from a prior run, not re-executed in this run. Staleness risk: low for the correctness verdict (golden + fixture are committed and unchanged), but the wall timings are stale single-sample values; a fresh re-run could shift the exact ms (and thus the precise ratios), though the large monotonic gaps make a ranking flip unlikely.

## Confidence & caveats

- Confidence: medium-high on the ranking, lower on exact ratios. The win is unambiguous in direction (5.82 ms is the clear minimum and the field is monotonic out to 294.11 ms), but it rests on a single oracle (`golden-metadata`) and on n==1 cached wall samples (mad 0, p95==median). 
- The contest is correctness-tied (all 7 PASS the same oracle identically), so this is a pure latency ranking — the "winner" is best *for fast metadata extraction*, not because it demonstrated superior parsing correctness.
- No throughputRealtime / peakMemory / longtasks were captured for this scenario, so the tie-break used wall only; mp4box's whole-file buffering would likely show an even larger peakMemory gap if that metric had been collected.
