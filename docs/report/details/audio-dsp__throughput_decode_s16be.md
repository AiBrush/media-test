# audio-dsp/throughput_decode_s16be

family: audio-dsp | fixture asset: `fixtures/media/pcm_s16be.aiff` (real, 960 KB) | primaryMetric: framesPerSec | passCount: 1/7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- Contested: **NO** — uncontested. Exactly 1 of 7 engines reached PASS; the other 6 are NA_ENGINE (none ran an oracle).
- Decisive factor: ffmpeg.wasm is the only engine that **declares both** the `aiff` input container **and** the `decodeFrames` operation, so it is the only engine eligible to even attempt the test. It then satisfied the strong `decoded-audio-pcm` bit-exact gate: 4096/4096 sample-frames bit-exact vs golden, 0 mismatches.
- Margin over runner-up: not applicable — no second PASS exists. Performance is reported for completeness only: 114142.40 fps (framesPerSec == decodeFps), 35.885 ms wall, n=1 (single sample, mad=0).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | decoded-audio-pcm:true | 35.885 ms | n/a (framesPerSec 114142.40 fps) | 0 (n=0, not sampled) | n/a | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

Note: this scenario has no peakMemory/longtasks/throughputRealtime samples in the shard; the bench block carries `framesPerSec`, `decodeFps`, `wall`, and an empty `peakMemory` (n=0). All numbers above are taken verbatim from the shard.

## Why the winner wins (deep technical)

The codec/container under test is **uncompressed 16-bit big-endian PCM (`pcm-s16be`) wrapped in an AIFF container** (Apple Audio Interchange File Format). Per the golden meta (`fixtures/golden/pcm_s16be.aiff.meta.json`): stereo (2 ch), 48000 Hz, 1536000 bps, ~5 s. AIFF is the big-endian sibling of WAV: sample words are stored most-significant-byte-first inside an `SSND` chunk. This is precisely the trait that excludes the browser-native engines — Chromium's WebCodecs/`decodeAudioData` and the WebCodecs-oriented adapters (mediabunny, platform, web-demuxer, remotion-webcodecs) do not enumerate AIFF as a parseable input container, so the runner short-circuits them at the declaration gate (`src/core/runner.ts:125`, "engine does not declare input container 'aiff'") before any decode is attempted.

ffmpeg.wasm wins because it carries a full libavformat/libavcodec demuxer+decoder stack and explicitly declares `aiff` among its input containers and `pcm-s16be` among its audio codecs (`src/engines/ffmpeg-wasm/adapter.ts:173`, `:187` for containers; `:158` `'pcm-s16be'` in the codec list), and declares `decodeFrames: true` (`adapter.ts:1460`, `:1740`) plus the `decode:audio-pcm` feature (`adapter.ts:1500`). Both capability axes the runner checks are therefore satisfied, making ffmpeg.wasm the sole eligible engine.

The decode path itself is genuine and audio-aware. In `decodeFrames` (`src/engines/ffmpeg-wasm/adapter.ts:2649`), the adapter detects an audio-only input (`videoTrack` absent, `audioTrack` present, `adapter.ts:2662`), reads sampleRate/channels from the real `ffmpeg -i` probe log, and invokes ffmpeg to decode the AIFF/s16be stream to canonical little-endian float PCM: `-map 0:a:0 -vn -f f32le -acodec pcm_f32le` (`adapter.ts:2666-2668`), capped to `maxFrames=4096` samples via `-t (maxSamples/sampleRate)` (`adapter.ts:2667`). It then walks the raw f32le buffer one interleaved sample-frame at a time (`channels * 4` bytes each), computing a SHA-256 over each frame (`adapter.ts:2676-2685`). This is real big-endian→float conversion performed by libavcodec inside wasm, not a copy of the input.

The gating oracle `decoded-audio-pcm` (`src/core/oracles.ts:1136`) is a true bit-exact correctness gate. It re-reads the original AIFF source bytes and independently recomputes the expected digests via `decodeAudioPcmFrameDigests` (`oracles.ts:1153` → `:3047`), which first tries a native PCM parser (`decodeNativeAudioPcmFrameDigests`, `oracles.ts:3094` — it understands the `s16be` sample format directly, `:3082`) and falls back to a browser `decodeAudioData` path. Either way the comparison normalizes both sides to per-sample-frame interleaved **f32 sha256** and matches by index (`compareDigests`, `oracles.ts:1166-1207`). PASS requires zero mismatches across all overlapping frames. The shard measurements confirm a real, full comparison: `measuredFrames=4096, goldenFrames=4096, comparedFrames=4096, mismatchedFrames=0` — every one of the 4096 capped sample-frames was decoded and matched bit-for-bit. That is the strongest tier on the correctness ladder for audio (decoded-audio-pcm = structural/metadata-exact-class, bit-exact PCM), not a perceptual proxy or smoke gate.

Backend: `env.configUsed` is not carried in this shard entry, but the engine is the single-thread/wasm ffmpeg build; the win here is functional coverage (AIFF/PCM-s16be support), not hardware acceleration. The throughput number (114142.40 fps over 35.885 ms for a 4096-sample slice) is plausible for raw PCM passthrough-to-float in wasm, where there is no entropy decoder — only endian swap + int→float scaling.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE, honest. "engine does not declare input container 'aiff'". mediabunny targets MP4/WebM/MP3/WAV-class containers via WebCodecs; AIFF is genuinely outside its declared container set, so the NA is correct, not under-declared.
- **platform@chrome-149** — NA_ENGINE, honest. "engine does not declare input container 'aiff'". The Chromium-native path relies on WebCodecs/`decodeAudioData`; AIFF is not in its declared inputs.
- **web-demuxer@4.0.0** — NA_ENGINE, honest. "engine does not declare input container 'aiff'". A WebCodecs-feeding demuxer without AIFF in its container declaration.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest. "engine does not declare input container 'aiff'". WebCodecs-based; no AIFF container support declared.
- **mp4box@2.3.0** — NA_ENGINE, honest. "engine does not declare operation 'decodeFrames'". mp4box is an ISO-BMFF box parser/demuxer with no decode pipeline; it cannot decode PCM samples, so the missing-op NA is correct (and it also has no AIFF parser).
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest. "engine does not declare operation 'decodeFrames'". A parser/probe library, not a decoder; declaring no decode op is accurate.

All six NAs look genuine. None is a suspicious under-declaration: the WebCodecs cohort legitimately lacks an AIFF demuxer, and the two parser engines legitimately lack a decode operation.

## Anti-cheat validation

- Scenario definition: `src/scenarios/audio-dsp/index.ts:354-365` (`id: 'throughput_decode_s16be'`), built from the `THROUGHPUT_CASES` table; `op` resolves to `decodeFrames` (`index.ts:395`), `maxFrames:4096`, oracle `decoded-audio-pcm`, primaryMetric `framesPerSec`. notes: "A.6 standalone DECODE throughput for big-endian PCM (samples/s); gated by PCM digest."
- Fixture asset: `fixtures/media/pcm_s16be.aiff` — EXISTS, real file, 960 KB (consistent with stereo/48 kHz/16-bit/~5 s ≈ 960 KB of SSND payload). Not synthetic/empty/mock. Golden sidecars exist: `fixtures/golden/pcm_s16be.aiff.meta.json`, `...packets.json`.
- Oracle: `decoded-audio-pcm` at `src/core/oracles.ts:1136` (`decodedAudioPcm`), comparison core `compareDigests` `oracles.ts:1166-1207`, reference decode `decodeAudioPcmFrameDigests` `oracles.ts:3047` / native `s16be` parser `oracles.ts:3094`. It is a real bit-exact SHA-256-per-sample-frame comparison against an independently re-decoded reference; not trivially satisfiable (any single mismatch fails; requires comparedFrames>0). It is NOT ssim-psnr and NOT smoke-only.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2649` (`decodeFrames`), audio branch `:2662-2687`, real ffmpeg invocation `-f f32le -acodec pcm_f32le` `:2668`, per-frame SHA-256 `:2682`. No canned output, no input→output copy, no golden short-circuit, no error swallowing — it reads the actual decoded raw buffer and hashes it.
- Measurements plausibility: comparedFrames=4096 == measuredFrames=4096 == goldenFrames=4096, mismatchedFrames=0. Frame count equals the configured cap (maxFrames=4096), all bit-exact. Physically consistent with lossless PCM (decode is deterministic; libavcodec f32le output must match the reference's native s16be→f32 conversion exactly).
- Cached note: this PASS has **cached==true** ("cached previous PASS result"). The result was REUSED, not freshly re-executed in this run, so the timing (35.885 ms / 114142.40 fps, n=1) and the PASS reflect a prior run. Per the launcher-seeding caveat, stale PASS reuse is possible; however the oracle outcome and measurements are fully populated and internally consistent, and the correctness claim (bit-exact PCM) does not depend on this run's timing.

Verdict: **REAL** — real fixture (960 KB AIFF), real libavcodec wasm decode path, and a meaningful bit-exact PCM oracle (4096/4096 frames, 0 mismatch). The only caveat is the cached==true staleness flag on the evidence, which lowers confidence on the freshness of timing but not on the correctness verdict.

## Confidence & caveats

- Confidence: **high** that ffmpeg.wasm is the correct/only winner — it is the sole eligible engine (only declarer of AIFF + decodeFrames) and it cleared a strong bit-exact gate.
- Caveats: (1) cached==true — timing/throughput are from a prior run, not re-validated here; a fresh run (clear raw + .browser-cache) would harden the perf numbers. (2) Performance ranking is moot (no runner-up), so the framesPerSec/wall figures (n=1, mad=0) are descriptive only and weak as benchmark evidence. (3) `env.configUsed` (backend/wasmThreads) is absent from this shard entry, so the exact wasm threading config could not be confirmed. (4) peakMemory was not sampled (n=0).
