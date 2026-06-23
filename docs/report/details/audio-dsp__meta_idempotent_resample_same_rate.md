# audio-dsp/meta_idempotent_resample_same_rate

- family: audio-dsp
- fixture asset(s): `fixtures/media/wav_s16.wav` (PCM s16, stereo, 44100 Hz, ~960 KB; decodes to 220499 sample-frames)
- primaryMetric: wall (metrics: wall, peakMemory)
- passCount: 2 of 7 (ffmpeg.wasm@0.12.15, mediabunny@1.48.0)

## Verdict

- Best framework: **mediabunny@1.48.0**
- CONTESTED: 2 engines PASS. Both satisfy the identical correctness gate (the `property-invariant` / `audio-pcm-digest` oracle) with byte-for-byte equal measurements, so the tie is broken on performance.
- Decisive factor: **wall-clock**. mediabunny median 5.29 ms vs ffmpeg.wasm 20.57 ms = **~3.89x faster wall**. Correctness is exactly equal (both report 220499 samples, 44100 Hz, 2 ch, bit-identical PCM digest), so this is a pure performance win.
- Margin over runner-up (ffmpeg.wasm): 20.57 / 5.29 = **3.89x faster wall**. Peak-memory is not directly comparable (mediabunny reports 33,457,658 bytes; ffmpeg.wasm reports n=0 / 0 bytes, i.e. peakMemory was not sampled), so memory is not used as a tiebreaker here.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 5.29 ms (n=1) | n/a | 33,457,658 B (n=1) | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 20.57 ms (n=1) | n/a | 0 B (n=0, not sampled) | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | transcode: adapter cannot remap audio channel count (downmix/upmix) |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

This scenario is a metamorphic idempotence test: transcode a PCM-s16 WAV to the *same* container/codec/channels (`container: 'wav'`, `audio: { codec: 'pcm-s16', sampleRate: 48000, channels: 2 }`) and assert the result decodes to the exact same PCM as the source. The input is uncompressed linear PCM (no lossy AAC/Opus/MP3 stage and no entropy coder), so a correct engine must reproduce all 220499 stereo sample-frames identically. Note the source actually decodes at 44100 Hz, not the 48000 Hz named in `opts`; the oracle (`src/core/oracles.ts:2977-3024`, `audioPcmDigestInvariant`) compares output against the *source decode*, computing a SHA-256 over the decoded PCM plus sample count, sample rate and channel count. Because both engines preserved the source's true 44100 Hz / 2 ch / 220499 samples and produced an identical PCM SHA-256, the idempotence invariant holds for both regardless of the requested 48000 value — i.e. neither engine forced an unnecessary resample that would have changed the sample count.

mediabunny's win is mechanistic, not a correctness advantage. Its adapter (`src/engines/mediabunny/adapter.ts:1271-1322` `transcode`, calling `buildAudioOptions` at `:672-692`) drives the library's pure-TypeScript ESM `Conversion` pipeline. For a same-codec PCM path it stays in-process: `env.configUsed` shows `coreBuild: "pure-ts-esm"`, `backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`. There is no WASM module instantiation, no virtual-FS write of the ~960 KB input, and no subprocess-style argv dispatch — the conversion reads the WAV samples and re-muxes/encodes PCM directly, which is why the measured op is only 5.29 ms.

ffmpeg.wasm is correct but structurally heavier. Its adapter (`src/engines/ffmpeg-wasm/adapter.ts:2461-2508`) builds an argv (`-c:a pcm_s16le`, `-ar 48000`, `-ac 2`) and invokes the vendored single-thread ffmpeg WASM core (the adapter defaults to the single-thread core, see header at `:10`). Each transcode pays: writing the input into the emscripten MEMFS, running the full demux -> swresample/aresample -> PCM encode -> WAV mux graph inside WASM, then reading the output back. Even for a no-op-ish PCM round-trip that fixed cost lands at 20.57 ms median — 3.89x mediabunny's wall. Both samples are n=1 with mad=0, so the spread is unknown; the 3.89x gap is large enough to be decisive but rests on a single measured run each (see caveats).

So the deciding lever is the runtime substrate for an uncompressed-PCM same-rate transcode: mediabunny's pure-TS in-process conversion vs ffmpeg.wasm's WASM-core + MEMFS round-trip. Both produce bit-identical PCM (the strongest possible audio correctness, a full PCM SHA-256 match), so the performance margin is the only differentiator and mediabunny owns it.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but lost on performance: 20.57 ms vs mediabunny 5.29 ms (3.89x slower wall) for the same bit-exact PCM result. The gap is the WASM-core instantiation + MEMFS input write + full ffmpeg filtergraph cost (`src/engines/ffmpeg-wasm/adapter.ts:2461-2508`, single-thread core per header `:10`). No correctness deficit.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "the adapter cannot remap audio channel count (downmix/upmix)". The scenario requests `channels: 2` on a stereo source (no actual remap needed), but the adapter declares it cannot handle channel-count changes for transcode and conservatively opts out. This looks like a slightly over-broad capability guard rather than a genuine inability for this exact stereo->stereo case, but it is an honestly-declared NA, not a faked pass.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'". The WebCodecs-based platform engine has no WAV muxer registered, so it cannot produce the required `containersOut: ['wav']`. Honest capability gap.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". mp4box.js is a demux/box-parsing/remux tool with no encode path; declining transcode is correct.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". It is a parser/demuxer only; honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Demux-only library; honest NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/audio-dsp/index.ts:701-714` (`METAMORPHIC_CASES` entry `id: 'meta_idempotent_resample_same_rate'`, `op: 'transcode'`, `input: 'wav_s16.wav'`, `oracles: ['property-invariant']`, `invariant: 'audio-pcm-digest'`). Notes at `:712-713` describe the A.16 idempotence rationale.
- Fixture: `fixtures/media/wav_s16.wav` exists on disk (~960 KB, real PCM s16 stereo). It is a genuine media file, not synthetic/empty/mock. Decoded measurements (220499 sample-frames, 44100 Hz, 2 ch) are physically consistent with a ~5 s stereo PCM clip.
- Oracle: `src/core/oracles.ts:2977-3024` (`audioPcmDigestInvariant`). It decodes BOTH the source and the engine output to PCM (`decodeAudioPcmDigest`, `:3026+`), then requires equality of sample count, sample rate, channel count AND a full SHA-256 of the decoded PCM (`:3009-3016`). This is a bit-exact correctness gate — not a wide-tolerance or smoke-only check; it cannot be satisfied by copying metadata or by an approximately-correct output.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1271-1322` (`transcode`) + `:672-692` (`buildAudioOptions`). It opens the real input, builds a real `Conversion`, and writes output through an instrumented target. No canned bytes, no input->output passthrough to fake a transcode, no short-circuit to the golden, no error-swallowing. The runner-up `src/engines/ffmpeg-wasm/adapter.ts:2461-2508` likewise issues real ffmpeg argv to the WASM core.
- Measurements plausibility: identical 220499-sample / 44100 Hz / 2 ch results from two independent engines on the same fixture, both bit-exact to source — strongly consistent and not trivially gameable.
- Cached note: BOTH winning results have `cached: true` ("cached previous PASS result"). The PASS verdicts and the 5.29 ms vs 20.57 ms wall numbers were reused from a prior run, not freshly re-executed in this run. Staleness risk exists per the launcher seeding caveat (stale-PASS reuse), but the cached evidence is internally consistent and the implementations are genuine.
- Verdict: **REAL** — real fixture, real transcode implementations in both PASS engines, and a strict bit-exact PCM-digest oracle. mediabunny is the legitimate performance winner.

## Confidence & caveats

- Confidence: medium-high. Correctness verdict is solid (strict bit-exact oracle, two engines agree on identical PCM). The winner ranking rests on a clean 3.89x wall margin.
- Caveat (sampling): both wall medians are n=1 (warmup=1, mad=0, p95==median). A 3.89x gap is well outside any plausible single-sample noise for this kind of fixed-cost difference, but the evidence is one run each, so the precise ratio could shift on re-measurement.
- Caveat (cache): both PASS rows are `cached: true`; numbers were reused, not re-run this session.
- Caveat (memory): ffmpeg.wasm reports peakMemory n=0 (not sampled), so memory cannot be compared; only wall is decisive.
- Note (opts vs reality): scenario `opts.sampleRate` is 48000 but the source decodes at 44100 Hz; the oracle keys on the source decode, so idempotence is correctly evaluated at the true 44100 Hz and both engines avoided an unnecessary resample.
