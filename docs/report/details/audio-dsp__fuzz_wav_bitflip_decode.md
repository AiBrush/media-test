# audio-dsp/fuzz_wav_bitflip_decode

- **Family:** audio-dsp
- **Fixture asset:** `fixtures/media/wav_bitflip.wav` (960 KB, real RIFF/WAVE PCM s16, 48 kHz stereo; 96 bit-flips across the PCM `data` span)
- **Primary metric:** wall (metrics declared: `wall`, `peakMemory`)
- **Operation:** `decodeFrames` with `{ maxFrames: 256, gracefulAllowOutput: true }`
- **Gating oracle:** `graceful-failure` (single oracle)
- **passCount:** 4 of 7

## Verdict

- **Best framework:** `remotion-webcodecs@4.0.479` (uncontested on the decisive metric).
- **Contested?** Yes — 4 engines PASS (`remotion-webcodecs`, `mediabunny`, `ffmpeg-wasm`, `platform`). All four pass the *same* single oracle (`graceful-failure`), so correctness strength is identical (a robustness/smoke gate, not a correctness-ladder oracle). The tie is broken on performance.
- **Decisive factor:** wall time (`durationMs`, the primary metric). remotion-webcodecs completed the bounded decode-and-conceal in **15 ms**, narrowly beating mediabunny (17 ms), and far ahead of ffmpeg-wasm (988 ms) and platform (3972 ms).
- **Margin over runner-up:** ~1.13x faster than mediabunny (17 ms / 15 ms); ~65.9x faster than ffmpeg-wasm (988 / 15); ~264.8x faster than platform (3972 / 15). NOTE: margins are from `durationMs` only — there is **no `bench{}` block** in the shard and every entry is `cached==true`, so n is effectively 1 and the 15 vs 17 ms gap is within noise. The win over mediabunny is weak; the win over ffmpeg-wasm and platform is decisive and large.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 15 ms | n/a (no bench) | n/a | n/a | cached previous PASS; returned partial/safe output, no crash/hang |
| mediabunny@1.48.0 | PASS | graceful-failure:true | 17 ms | n/a | n/a | n/a | cached previous PASS; returned partial/safe output, no crash/hang |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 988 ms | n/a | n/a | n/a | cached previous PASS; returned partial/safe output, no crash/hang |
| platform@chrome-149 | PASS | graceful-failure:true | 3972 ms | n/a | n/a | n/a | cached: `<video>` timed out waiting for metadata (3000 ms) → produced no output, handled gracefully |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

No `bench{}` metrics (median/p95/mad/throughputRealtime/peakMemory/longtasks) are present in this shard; the only timing signal is `durationMs`.

## Why the winner wins (deep technical)

This is a **fault-injection robustness scenario**, not a fidelity scenario. The input is a structurally valid RIFF/WAVE container (header verified by hex: `RIFF....WAVE fmt ` len 16, format tag `0x0001` PCM, 2 channels, `0xBB80` = 48000 Hz sample rate, 16-bit, then a `data` chunk) whose **PCM payload** has been corrupted with 96 bit-flips. The scenario sets `gracefulAllowOutput: true` (src/scenarios/audio-dsp/index.ts:624), so the contract per the oracle (src/core/oracles.ts:2611-2612) is: the decoder may emit *partial/safe* PCM and must simply not crash, hang, or OOM within the timeout. Because the container header is intact and only the s16 sample bytes are flipped, a correct PCM decoder cannot really "error" — flipped 16-bit samples are still legal s16 values, so the expected behavior is to decode the (now-noisy) samples cleanly. The oracle therefore reduces to a **smoke-level robustness gate**: did the engine return without exploding?

All four passing engines satisfy this identically; none passes a stronger oracle (there is exactly one oracle, `graceful-failure`). With correctness tied, the decision drops to performance (primary metric = wall). **remotion-webcodecs wins on wall at 15 ms.**

Mechanistically, remotion-webcodecs and mediabunny both run the WebCodecs-backed audio path. mediabunny's `decodeFrames` falls through its no-video-track branch into a genuine `AudioSampleSink` decode (src/engines/mediabunny/adapter.ts:1342-1382): it opens the WAV, pulls interleaved little-endian f32 sample-frames via `sample.copyTo(buffer, { planeIndex: 0, format: 'f32' })`, walks `channels*4` bytes per frame, and stops at `maxFrames`. That bounded `max = 256` cap (adapter.ts:1348, 1356) is what keeps the run sub-20 ms — only the first 256 sample-frames are touched, so the corrupted span is decoded but the loop returns almost immediately. remotion-webcodecs uses its `convert`/`extractFrames` WebCodecs pipeline (env.configUsed.backend `webcodecs`, `prefer-hardware(+software fallback)`, `streaming-backpressure`) and lands 2 ms ahead. Both are pure-WebCodecs single-threaded (`wasmThreads: 0`), no COOP/COEP requirement, streaming. The 15 vs 17 ms delta is inside measurement noise (single cached sample), so the win is real but *thin*.

The large, decisive separation is against the other two: ffmpeg-wasm pays a fixed ~988 ms WASM round-trip (compile/instantiate amortized in init, but the per-op decode through the emscripten FS + libavcodec PCM path still dominates) — ~65.9x slower. platform (Chrome's native `<video>`/MediaElement route) is the worst at 3972 ms because it tries to load the WAV through a `<video>` element and the metadata probe **timed out at 3000 ms** (reason field), then reported "no output → handled gracefully." It passes the oracle only by the no-output branch (src/core/oracles.ts:2608-2609), but it is 264.8x slower and effectively decoded nothing.

## What each other framework did wrong

- **mediabunny@1.48.0 (PASS, lost):** correct and fast (17 ms via real `AudioSampleSink` PCM decode, adapter.ts:1342-1382), but 1.13x slower wall than remotion-webcodecs (17 vs 15 ms). Margin is within single-sample noise — a near-tie, not a clear loss.
- **ffmpeg.wasm@0.12.15 (PASS, lost):** decoded gracefully but at 988 ms, ~65.9x slower than the winner — the WASM/libav PCM decode path is far heavier than native WebCodecs for a trivially-decodable s16 stream.
- **platform@chrome-149 (PASS, lost):** only passes via the *no-output* graceful branch — its `<video>` element timed out waiting for metadata at 3000 ms (it cannot ingest a raw WAV through the media element robustly), total 3972 ms, ~264.8x slower; it produced no decoded PCM at all.
- **mp4box@2.3.0 (NA_ENGINE):** honest NA. `decodeFrames` explicitly throws "no decoder — pair with WebCodecs" (src/engines/mp4box/adapter.ts:953-954) and containersIn is only `['mp4','mov']` (adapter.ts:645). It is a box parser/muxer with no decoder. Not an under-declared capability.
- **web-demuxer@4.0.0 (NA_ENGINE):** honest NA. It declares `decodeFrames: true` but containersIn is `['mp4','mov','mkv','webm','ts']` (src/engines/web-demuxer/adapter.ts:628,639) — no `wav`. Its libav-based demuxer is wired for ISOBMFF/Matroska/MPEG-TS, not RIFF. Correctly negotiated out on the container, not the op.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** honest NA. It declares `wav` as an input container (adapter.ts:197) but `decodeFrames` throws "no decoder; emits encoded samples only" (adapter.ts:556-557). It is a parser that yields encoded samples, never PCM frames — so it cannot satisfy a decode op. NA is on the operation, which is accurate.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/audio-dsp/index.ts:618-628 (`ROBUSTNESS_AUDIO_CASES` entry `fuzz_wav_bitflip_decode`), mapped to a full Scenario at index.ts:641-658. Input asset `wav_bitflip.wav`, op `decodeFrames`, opts `{ maxFrames: 256, gracefulAllowOutput: true }`, single oracle `graceful-failure`, notes: "A.16 fuzzed PCM span: 96 bit-flips across a WAV; PCM decode must error or conceal cleanly."
- **Fixture exists:** `fixtures/media/wav_bitflip.wav` confirmed present, 960 KB. Hex dump shows a genuine RIFF/WAVE PCM-s16 header (format `0x0001`, 48000 Hz, 2ch, 16-bit, `data` chunk). This is a REAL corrupted-media fixture (header valid, PCM payload bit-flipped), not synthetic/empty/mock.
- **Oracle:** `gracefulFailure` src/core/oracles.ts:2586-2628. For `gracefulAllowOutput: true` it returns PASS at lines 2611-2612 ("returned partial/safe output"); without output it PASSes at 2608-2609. It is a deliberately *loose* robustness gate — for this scenario (valid header, flipped samples) any non-crashing PCM decoder passes. There is no comparison against a golden and no correctness ladder applied.
- **Winner adapter (remotion-webcodecs):** WebCodecs audio decode pipeline (env.configUsed.backend `webcodecs`, streaming-backpressure). The runner routes graceful scenarios through `runRobustness` (src/core/runner.ts:868-869); the op is executed for real. mediabunny's parallel path (adapter.ts:1342-1382) is verified to call the real `AudioSampleSink` and hash actual decoded f32 PCM — no canned output, no golden short-circuit, no input copy.
- **Cached note:** ALL four passing entries are `cached==true` with `durationMs` only and no `bench{}`. The timings were reused, not freshly measured — staleness risk is real, and the 15-vs-17 ms winner margin cannot be trusted as a stable ordering.
- **Verdict: WEAK-GATE.** The fixture and implementations are real (REAL on those axes), but the gating oracle is a single smoke-level `graceful-failure` check that, given an intact WAV header and `gracefulAllowOutput: true`, essentially cannot fail for any competent PCM decoder. The PASS is genuine but does not demonstrate decode *fidelity* under corruption (no golden/PCM comparison). Not CHEAT — there is no faked output or unfailable-by-construction trickery beyond the intended looseness of the robustness gate.

## Confidence & caveats

- **Confidence: medium.** Engine eligibility, NA honesty, fixture reality, and adapter authenticity are all firmly established from code. The *winner ranking* is the weak part: it rests entirely on a 15 ms vs 17 ms `durationMs` gap between two WebCodecs engines, with no `bench{}`, n≈1, and `cached==true`. A fresh re-run could easily flip remotion-webcodecs and mediabunny.
- The decisive separation (winner vs ffmpeg-wasm 65.9x, vs platform 264.8x) is robust regardless of noise.
- The oracle is intentionally permissive (WEAK-GATE); this scenario tests crash-safety, not decode correctness, so "best" here means "fastest engine that didn't fall over," not "most accurate decoder."
