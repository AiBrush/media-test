# audio-dsp/throughput_decode_s24

family: audio-dsp | fixture asset: `fixtures/media/wav_s24.wav` (1.4 MB, real WAV / PCM-s24LE) | primaryMetric: `framesPerSec` (decode samples/s) | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Contested** — 2 engines PASS the same gating oracle (`decoded-audio-pcm`) with identical bit-exact correctness (4096/4096 frames, 0 mismatches). mediabunny and ffmpeg.wasm tie on correctness, so the win is decided on **performance** (the scenario's primaryMetric).
- Decisive factor: throughput. mediabunny 137,634.41 fps vs ffmpeg.wasm 115,510.43 fps = **1.19x faster decode**, and wall 29.76 ms vs 35.46 ms = **1.19x lower latency (0.84x wall)**. Both measured at n=1 (single sample, mad=0), so the margin is real but the evidence is thin (see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime (framesPerSec) | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | decoded-audio-pcm:true (4096/4096 bit-exact) | 29.76 ms | 137634.41 fps | 0 (not sampled) | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | decoded-audio-pcm:true (4096/4096 bit-exact) | 35.46 ms | 115510.43 fps | 0 (not sampled) | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'decode:audio-pcm' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'decode:audio-pcm' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

peakMemory has n=0 / empty samples for both PASS engines — not measured this run, so it cannot break the tie.

## Why the winner wins (deep technical)

The operation under test is standalone **decode throughput of 24-bit linear PCM (`pcm-s24`) inside a RIFF/WAV container**, capped at `maxFrames: 4096` sample-frames (scenario `src/scenarios/audio-dsp/index.ts:343-353`). PCM is not a compute-bound codec: there is no entropy decoder, no DCT, no inter-frame prediction. "Decoding" pcm_s24le is really sign-extending 3-byte little-endian integers to f32 and interleaving them. Consequently throughput is dominated almost entirely by **pipeline overhead and the cost of marshalling samples out of the library**, not by codec arithmetic. The framework with the leanest sample-egress path wins, and that is mediabunny.

mediabunny's audio decode path (`src/engines/mediabunny/adapter.ts:1330-1382`) runs entirely **in-process in JS/WASM with zero filesystem round-trips**. It opens the input, takes the primary audio track, attaches an `AudioSampleSink` (line 1345), and iterates `sink.samples()` pulling each `AudioSample`, calling `sample.copyTo(buffer, { planeIndex: 0, format: 'f32' })` to get interleaved little-endian f32 (lines 1361-1364), then walks the buffer one `channels*4`-byte sample-frame at a time and SHA-256s each slice (lines 1366-1376). The config it actually used (shard `env.configUsed`) is `coreBuild: "pure-ts-esm"`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`, `pipeline: "streaming-lockstep"`. So mediabunny needs **no COOP/COEP isolation, no SharedArrayBuffer, no worker threads** — it decodes directly and streams samples lockstep into the digest loop. The measured result: wall **29.76 ms** to decode + hash 4096 frames, **137,634.41 fps**, with the oracle confirming **measuredFrames=4096, goldenFrames=4096, comparedFrames=4096, mismatchedFrames=0** (perfect bit-exact match).

ffmpeg.wasm produces an identical correctness result (same oracle measurements, 4096/4096 bit-exact) but is **slower because of its FS-mediated CLI architecture**. Its audio decode path (`src/engines/ffmpeg-wasm/adapter.ts:2649-2688`) must: write the 1.4 MB input into the emscripten MEMFS (`writeInput`, line 2656), run an info pass (`runInfo`, line 2658) to parse the `ffmpeg -i` log for sample rate / channels, then spawn a second ffmpeg invocation with `-map 0:a:0 -vn -f f32le -acodec pcm_f32le` (lines 2666-2669) that re-encodes the whole stream to a `.rgba`/raw f32 scratch file, and finally `readBinary` that file back out of MEMFS (line 2671) before the JS hashing loop (lines 2676-2686). That is two process spawns plus a write-and-read-back through the virtual filesystem, all single-threaded WASM — pure overhead for a format that requires almost no decode work. The result is wall **35.46 ms** and **115,510.43 fps**: same correct bytes, **1.19x slower** purely on plumbing.

So the mechanistic reason mediabunny wins this specific case is architectural: for a trivial-to-decode codec (PCM s24), an in-process streaming sink with no FS marshalling and no isolation requirements beats a CLI-emulation engine that pays write→spawn→spawn→read-back costs, even though both arrive at the exact same hashed samples. The win is a latency/overhead win (1.19x), not a correctness win.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15**: PASSed with identical correctness but lost on the primaryMetric — 115,510.43 fps vs 137,634.41 fps (0.84x throughput) and wall 35.46 ms vs 29.76 ms (1.19x slower). Cause: write/info/decode/read-back round-trips through emscripten MEMFS plus two single-threaded ffmpeg spawns (`adapter.ts:2656-2671`) for a codec that needs no real decode compute.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'decodeFrames'". Honest NA: it is a parser/demuxer, not a sample decoder, so it has no PCM-decode capability to under-declare.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — "engine does not declare feature 'decode:audio-pcm'". Plausibly honest: WebCodecs `AudioDecoder` targets compressed audio (AAC/Opus/etc.); raw PCM-in-WAV is not a WebCodecs decode path, so not declaring it is defensible.
- **platform@chrome-149**: NA_ENGINE — "engine does not declare feature 'decode:audio-pcm'". Honest: the bare browser-platform engine exposes no PCM-sample-digest decode op.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare operation 'decodeFrames'". Honest: mp4box is an ISOBMFF box parser; it neither decodes samples nor handles RIFF/WAV.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare input container 'wav'". Honest container-level NA: the fixture is a WAV file and web-demuxer's declared container set excludes `wav`.

## Anti-cheat validation

- Scenario definition: `src/scenarios/audio-dsp/index.ts:343-353` (case `throughput_decode_s24`), with rationale at `index.ts:320-324` and `notes` "A.6 standalone DECODE throughput for 24-bit PCM (samples/s); gated by PCM digest." Input `asset: 'wav_s24.wav'`, `container: 'wav'`, `audioCodecs: ['pcm-s24']`, `oracles: ['decoded-audio-pcm']`, `opts: { maxFrames: 4096 }`.
- Fixture exists and is real: `fixtures/media/wav_s24.wav` = 1.4 MB on disk (stat confirmed). Golden present: `fixtures/golden/wav_s24.wav.meta.json` and `fixtures/golden/wav_s24.wav.packets.json`. Not synthetic/empty/mock.
- Gating oracle: `decoded-audio-pcm` at `src/core/oracles.ts:1136-1163`. It re-decodes the **source** WAV to f32 sample-frame digests (`decodeAudioPcmFrameDigests`) and compares against the engine's digests via `compareDigests` (`oracles.ts:1166-1207`), which does a per-frame SHA-256 equality check and FAILs on any mismatch or missing frame. This is a real bit-exact comparison, NOT a loose tolerance / SSIM-proxy / smoke gate — it is the strongest ladder rung (decoded-audio-pcm, bit-exact PCM). Measurements are physically plausible: 4096 frames matches `maxFrames`, 0 mismatches.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1330-1382` genuinely calls `this.lib.AudioSampleSink` and `sample.copyTo(...)` then `sha256Hex` per sample-frame. No canned output, no input→output copy, no short-circuit to golden, no swallowed errors (errors throw; `sample.close()` in `finally`). Loser ffmpeg path at `adapter.ts:2649-2688` is likewise a real ffmpeg decode.
- Verdict: **REAL** — real fixture + real in-process library decode + strong bit-exact oracle.
- Cached note: the winning mediabunny entry (and the ffmpeg entry) have `cached: true` (reason "cached previous PASS result"). The PASS/correctness is real but the throughput numbers were reused, not re-measured this run — minor staleness risk on the timing margin.

## Confidence & caveats

- Correctness is high-confidence: both PASS engines are bit-exact (4096/4096, 0 mismatch) against a real golden, on a real 1.4 MB WAV fixture, via a strong oracle.
- The performance margin (1.19x) is the decisive factor but rests on **n=1 samples for both engines** (mad=0, single value). A one-shot timing difference of ~5.7 ms is genuine but weak statistical evidence; a re-run could narrow or invert it.
- Both PASS results are `cached: true`, so the timing reflects an earlier run, not this one.
- peakMemory was not sampled (n=0) for either engine, so the secondary tiebreaker on memory could not be applied.
- All five NA engines look like honest capability/container declarations, not under-declared cheats, given a WAV/PCM-s24 audio-decode workload.
