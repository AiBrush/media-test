# audio-dsp/upmix_mono_to_stereo

family: audio-dsp | fixture asset: `fixtures/media/wav_s16_mono.wav` (960 KB, genuine mono PCM s16) | primaryMetric: wall | passCount: 2 of 7

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** (CONTESTED — 2 PASS: ffmpeg-wasm and mediabunny).
Decisive factor: both engines pass the *identical* single oracle (`property-invariant` / `transcode-output-metadata`) with equally strict results, so correctness is a tie and the decision falls to **performance**. ffmpeg.wasm wins decisively on the primary metric (wall) and throughput:

- wall median: **27.25 ms** (ffmpeg) vs **307.42 ms** (mediabunny) → **11.28x faster**.
- throughputRealtime: **366.9x** vs **32.5x** → **11.28x higher**.
- peakMemory: 38.04 MB vs 35.13 MB → 0.92x (mediabunny is 8% leaner — its only edge).
- longtasks: 4223 ms vs 1017 ms → ffmpeg blocks the main thread ~4.15x longer (its only real cost).

Margin caveat: both benches are **n=1** (mad=0, p95==median, single sample), so the spread is unmeasured; the 11x wall gap is far larger than any plausible single-run jitter, so the ranking is robust even at n=1.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 27.25 ms | 366.9x | 38.04 MB | 4223 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass | 307.42 ms | 32.5x | 35.13 MB | 1017 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'upmix' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a mono→stereo upmix on uncompressed PCM s16 in a WAV (RIFF) container: take `wav_s16_mono.wav` (1 channel, pcm-s16) and produce a 2-channel pcm-s16 WAV (`opts.audio = { codec: 'pcm-s16', channels: 2 }`). Because both source and target are uncompressed PCM, there is **no codec decode/encode** in the classic sense — the entire job is RIFF demux → channel replication → RIFF mux. The cost is dominated by container parsing and per-sample channel duplication, not by an entropy/transform codec.

ffmpeg.wasm performs this as a single graph invocation. In `src/engines/ffmpeg-wasm/adapter.ts:2504` the adapter emits `-ac 2` whenever `opts.audio.channels` is set, letting libavfilter's auto-inserted `aresample`/channel-layout converter duplicate the mono channel into L and R. With `pcm_s16le` in and out, libav copies samples through a tight C loop in the wasm core; there is no Huffman/MDCT stage, so the 366.9x-realtime throughput and 27 ms wall are believable for a ~sub-second WAV. The cost is concentrated in one synchronous wasm call, which is exactly why `longtasks` is high (4223 ms reported as accumulated long-task time across the run including warmup), even though wall for the measured pass is tiny. Backend reported in `env.configUsed` for ffmpeg is the single-thread wasm core (`wasmThreads:0`, no SharedArrayBuffer / COOP-COEP), so this is achieved without cross-origin isolation — a deployment advantage.

mediabunny does the same logical work but in pure-TS ESM (`coreBuild:"pure-ts-esm"`, `pipeline:"streaming-lockstep"`, `backend:"webcodecs"` per `env.configUsed`). For PCM there is no WebCodecs decoder to offload to, so the channel duplication and WAV (re)muxing run in JS, which is ~11x slower than the hand-tuned wasm. mediabunny's compensating win is memory: 35.13 MB vs 38.04 MB (its streaming-lockstep pipeline avoids materializing the whole decoded buffer the way the ffmpeg MEMFS roundtrip does), and far lower main-thread blocking (1017 ms longtasks).

The gating oracle is `property-invariant` resolved to `transcode-output-metadata` (`src/core/oracles.ts:3626`). For ffmpeg it measured `durationDeltaSec: 0` (bit-exact duration, output sample count identical to source) against tolerance `0.0417 s`; for mediabunny `durationDeltaSec: 0.0000208 s` (≈1 sample of drift) — both trivially inside tolerance, and both report `audioTracks: 1`. The channel count is checked in `compareRequestedTrack` (`src/core/oracles.ts:3817`): `channels != 2` would push a diff and fail, so both engines genuinely produced a 2-channel WAV. The duration-exactness gives ffmpeg the marginally cleaner correctness number, but since both pass the channels assertion identically, correctness is a tie and performance decides.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost): identical oracle pass, but **11.28x slower wall** (307.42 ms vs 27.25 ms) and 11.28x lower throughput. Only edges are 0.92x peakMemory and 4.15x lower longtasks — not enough to overcome a 11x primary-metric gap.
- **platform@chrome-149** (NA_ENGINE): "does not declare output container 'wav'". Honest NA — the browser WebCodecs/MediaRecorder path has no WAV muxer; it cannot author a RIFF/PCM file, so it legitimately cannot perform this scenario.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): "does not declare feature 'upmix'". Honest NA at the feature granularity — the adapter advertises transcode but not channel-count upmixing.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "does not declare operation 'transcode'". Honest — media-parser is a demux/probe-only library, no encode/transcode capability.
- **web-demuxer@4.0.0** (NA_ENGINE): "does not declare operation 'transcode'". Honest — demuxer only; no muxer/encoder.
- **mp4box@2.3.0** (NA_ENGINE): "does not declare operation 'transcode'". Honest — mp4box is an ISOBMFF box parser/segmenter, not a PCM/WAV transcoder.

All five NAs look genuine (capability-gated, not under-declared): none of these libraries has a WAV-writing transcode path, so declaring the op would just produce guaranteed failures.

## Anti-cheat validation

- Scenario definition: `src/scenarios/audio-dsp/index.ts:127` (`id: 'upmix_mono_to_stereo'`), asset `wav_s16_mono.wav`, `features: ['upmix']`, `opts.audio = { codec: 'pcm-s16', channels: 2 }`, `bitReproducible: true`. Notes (line 125-126, 135) explicitly fix a prior bug where the case pointed at an already-stereo file (a no-op); it now uses a genuine mono source baked with `-ac 1`.
- Fixture exists and is real: `fixtures/media/wav_s16_mono.wav`, 960 KB on disk (stat confirmed). Not synthetic/empty/mock.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2504` emits real `-ac 2` to the ffmpeg wasm core; `upmix` is declared as `-ac N where N > input channels` at adapter.ts:1515. Genuine library call — no canned output, no input→output copy, no short-circuit to a golden, no swallowed errors.
- Oracle: `src/core/oracles.ts:3626` (`transcodeOutputMetadataInvariant`), reached via `propertyInvariant` at oracles.ts:2650. It performs a REAL probe of the produced bytes (`ctx.referenceEngine.probe`) and asserts container=='wav', duration within band, audio-track presence, and channels==2 (oracles.ts:3817). Measurements are physically plausible (durationDeltaSec 0 / 2.08e-5 s vs 0.0417 s tol; audioTracks 1).
- **Weakness (the reason this is not REAL-strong):** the scenario declares `bitReproducible: true` (notes: "duplicate channel ... reproducible") but the suite gated it with the **metadata/shape** oracle only — NO `audio-pcm-digest` / `decoded-audio-pcm` comparison against a golden was run, and `ls fixtures/golden/ | grep upmix` returns nothing. The gate therefore proves the output is a 2-channel WAV of the right duration, but does NOT prove the right channel actually carries the duplicated mono samples (a degenerate upmix writing silence in R, or an L/R swap, would still pass). This is a loose-proxy gate relative to the scenario's stated bit-reproducible intent.
- Cached note: the winner's result has `cached: true` ("cached previous PASS result"); mediabunny is also cached. Staleness risk: numbers were reused, not re-run this session — per the launcher-seeding caveat, a truly fresh run would require clearing raw + .browser-cache. The 11x gap is large enough to survive staleness, but the exact ms values are from a prior run.

Verdict: **WEAK-GATE** — real fixture + real ffmpeg implementation + a real probe-based oracle, but the oracle is metadata/shape-only while the scenario advertises bit-reproducible PCM, so the PASS is genuine yet weaker than the scenario's stated correctness bar.

## Confidence & caveats

Confidence: medium. The winner selection (ffmpeg over mediabunny on an 11x wall margin) is high-confidence and robust to n=1 jitter. The validation verdict is the limiting factor: the gate does not verify PCM content, and both results are cached, so I cannot independently confirm the right channel holds the duplicated samples. No golden file exists for this case to cross-check. If re-run honestly with a PCM-digest oracle, both engines would need to demonstrate true channel duplication.
