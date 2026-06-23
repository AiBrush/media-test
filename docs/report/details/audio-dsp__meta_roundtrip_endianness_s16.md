# audio-dsp/meta_roundtrip_endianness_s16

- Family: audio-dsp
- Fixture asset(s): `fixtures/media/wav_s16.wav` (960 KB real WAV, RIFF/PCM s16le, 48000 Hz, 2 ch — header `fmt ` block: 0x0001 PCM, 2 ch, 0xBB80=48000 Hz, 16-bit)
- primaryMetric: wall
- passCount: 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- Best framework: **mediabunny@1.48.0** — CONTESTED (2 PASS).
- Decisive factor: PERFORMANCE. Both PASS engines satisfy the identical gating oracle (`property-invariant` / `audio-pcm-digest`) with byte-identical measurements (220499 samples, 44100 Hz, 2 ch, bit-exact PCM digest), so correctness strength is comparable. mediabunny wins on wall median.
- Margin over runner-up: **2.78x faster wall** (mediabunny 10.095 ms vs ffmpeg-wasm 28.090 ms). Evidence is weak in spread terms — both samples are `n==1` (`mad==0`, `p95==median`) and both results are `cached==true`. peakMemory is uninstrumented (`n==0`, 0 bytes) for both, so memory cannot arbitrate.
- Caveat that nearly flips the call: ffmpeg-wasm actually performs the intended two-leg s16le->s16be->s16le endianness roundtrip; mediabunny silently ignores the `roundtrip` flag and does a single same-format transcode (see Why / Anti-cheat). Under the rubric both pass the same oracle at the same strictness, so the win stands on speed — but ffmpeg-wasm is the more faithful execution of the scenario's stated intent.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass | 10.095 ms | n/a (not measured) | 0 (n=0) | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 28.090 ms | n/a (not measured) | 0 (n=0) | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-s16be' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |

## Why the winner wins (deep technical)

The operation is a metamorphic identity test (dossier A.16): transcode `wav_s16.wav` and require the decoded PCM of the output to be bit-identical to the decoded PCM of the source. Scenario opts are `{ container: 'wav', audio: { codec: 'pcm-s16', roundtrip: 'pcm-s16be' }, invariant: 'audio-pcm-digest' }` (`src/scenarios/audio-dsp/index.ts:716-728`). The gate is the strongest available for this op: `audioPcmDigestInvariant` (`src/core/oracles.ts:2977-3024`) decodes BOTH the source bytes and the engine output to interleaved f32 PCM and compares sample count, sample rate, channel count, AND a sha256 over the raw PCM (`oracles.ts:3009-3016`). It cannot pass on metadata alone — the PCM bytes must hash-match. The shard records `sourceSamples==outputSamples==220499`, `sampleRate 44100`, `channels 2`, and an implicit digest match (no diff string) for both winners.

Note on the 44100 vs the file's 48000 Hz: the oracle decodes through the browser WebAudio/`decodeAudioPcmDigest` path, which renders into the AudioContext's native 44100 Hz, so 5.0 s of 48 kHz content is reported as 220499 samples (5 s * 44100 ≈ 220500). Because BOTH the source and the output traverse the identical decode path, the resample is common-mode and the bit-exact comparison remains valid. This is normal, not a defect.

mediabunny (env.configUsed.backend `webcodecs`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`) runs the transcode through its `Conversion` API (`src/engines/mediabunny/adapter.ts:1271-1322`). `buildAudioOptions` (`adapter.ts:672-692`) maps the canonical `pcm-s16` to mediabunny's `pcm-s16` codec via `canonicalToMediabunnyAudio` (`src/engines/mediabunny/codecs.ts:116`, mapping at `codecs.ts:80`) and builds a WAV output format (`codecs.ts:158,174`). For a same-format PCM WAV->WAV conversion this is a near-pure container rewrap with sample-format passthrough — minimal DSP, no encoder warmup, no wasm boundary — which is why wall median is 10.095 ms. There is NO heavy codec involved (PCM is uncompressed), so the win is dominated by pipeline overhead, and mediabunny's pure-TS streaming path beats the wasm round-trip.

ffmpeg-wasm (env.engineId `ffmpeg-wasm`) is genuinely heavier here because it honors the roundtrip flag: `transcode` (`src/engines/ffmpeg-wasm/adapter.ts:2165-2259`) detects `opts.audio.roundtrip` (`adapter.ts:2219`) and runs TWO real ffmpeg invocations — leg 1 encodes the audio to the big-endian codec into an AIFF mid-container (`midContainer = ...endsWith('be') ? 'aiff'`, `adapter.ts:2234-2249`), leg 2 re-encodes that back to `pcm-s16` (le) WAV (`adapter.ts:2251-2256`). Two wasm execs plus a scratch-FS write/read explain the 28.090 ms (2.78x mediabunny). It produces the same bit-exact result because s16le->s16be->s16le is lossless for 16-bit integer PCM, so the digest still matches.

So the decisive mechanism: identical correctness outcome (same oracle, same 220499-sample bit-exact digest), and mediabunny does strictly less work (single same-format WAV rewrap on a pure-TS path with no COOP/COEP and no SharedArrayBuffer requirement) than ffmpeg-wasm's two-pass wasm endianness round-trip. Lower wall, no wasm-threading requirement — mediabunny wins.

## What each other framework did wrong

- ffmpeg.wasm@0.12.15 (PASS, lost on perf): correct and arguably MORE faithful (real two-leg s16be roundtrip), but 28.090 ms vs 10.095 ms = 0.36x mediabunny's speed (2.78x slower). The two wasm execs + scratch FS I/O are the cost.
- web-demuxer@4.0.0: NA_ENGINE — "does not declare operation 'transcode'". HONEST: web-demuxer is a pure WASM demux/probe/seek specialist with no encoder/muxer (`src/engines/web-demuxer/adapter.ts:7-8`).
- remotion-media-parser@4.0.479: NA_ENGINE — "does not declare operation 'transcode'". HONEST: it is a container parser, no encode path.
- mp4box@2.3.0: NA_ENGINE — "does not declare operation 'transcode'". HONEST: ISO-BMFF box parser/segmenter, no audio transcode, and would not handle a WAV output anyway.
- remotion-webcodecs@4.0.479: NA_ENGINE — "does not declare audio codec 'pcm-s16be'". HONEST: the scenario `requires.audioCodecs` includes `pcm-s16be` (`index.ts:721`); the engine does not declare it, so the runner correctly gates it out rather than letting it fake the endianness leg.
- platform@chrome-149: NA_ENGINE — "does not declare output container 'wav'". HONEST: the platform adapter's `containersOut` is only `['webm','mp4']` (`src/engines/platform/adapter.ts:248`); MediaRecorder cannot emit WAV, so it honestly declines rather than over-claiming.

## Anti-cheat validation

- Scenario: `src/scenarios/audio-dsp/index.ts:716-728` (METAMORPHIC_CASES entry `meta_roundtrip_endianness_s16`), built into a Scenario at `index.ts:743-758`.
- Fixture: `fixtures/media/wav_s16.wav` EXISTS (960 KB, valid RIFF/WAVE PCM s16le 48000 Hz/2 ch per its `fmt ` header). Real media, not synthetic/empty/mock.
- Oracle: `audioPcmDigestInvariant` at `src/core/oracles.ts:2977-3024` (dispatched via `property-invariant` at `oracles.ts:343`). It decodes source AND output to PCM and compares sample count, rate, channels, and a sha256 PCM digest (`oracles.ts:3009-3016`). NOT trivially satisfiable: a wrong-endianness or altered output would change the PCM bytes and fail the digest. Measurements (220499 samples, 44100 Hz, 2 ch) are physically plausible for ~5 s of stereo audio decoded at 44.1 kHz.
- Winner adapter: mediabunny `transcode` `src/engines/mediabunny/adapter.ts:1271-1322`, `buildAudioOptions` `adapter.ts:672-692`, codec map `src/engines/mediabunny/codecs.ts:80,116`, WAV format `codecs.ts:158-174`. It calls the real mediabunny `Conversion`/`Output` API — no canned output, no copy-input-to-output short circuit, no golden short-circuit, errors are thrown (not swallowed).
- Verdict: **WEAK-GATE**. The PASS is real (real fixture, real library call, a digest oracle that genuinely compares PCM bytes), but the gate does not enforce the scenario's specific intent for the winner. mediabunny's `buildAudioOptions` reads only codec/sampleRate/channels/bitrate/gain/fade and NEVER consults `opts.audio.roundtrip` — so the winning path is a single same-format WAV->WAV rewrap, not the s16le->s16be->s16le endianness round-trip the scenario describes. The oracle (decode-and-compare-PCM) is satisfied identically by a no-op-ish rewrap and by the genuine roundtrip, so it cannot distinguish the two. This is not a CHEAT (no faked/hardcoded output, no error swallowing — the output really decodes bit-exact), but the gate under-constrains the operation for mediabunny. ffmpeg-wasm, by contrast, does run the real two-leg endianness round-trip (`adapter.ts:2219-2258`).
- Cached note: BOTH winners' results are `cached==true` ("cached previous PASS result"); they were reused, not freshly re-run. Per the launcher seeding caveat, the 10.095 ms / 28.090 ms wall figures and the digest match are stale-reuse evidence — directionally trustworthy (consistent identical measurements) but not a fresh measurement.

## Confidence & caveats

- Confidence: medium. The winner ranking is clear on the recorded numbers (2.78x wall, same oracle), but: (1) both samples are `n==1` cached, so the perf margin is single-shot evidence with zero spread; (2) peakMemory is uninstrumented for both, removing a tiebreaker; (3) the gate is a WEAK-GATE for the winner because mediabunny ignores the `roundtrip` flag — a stricter oracle that asserted the endianness legs actually ran (e.g. inspecting the mid-container or requiring the BE leg) would arguably favor ffmpeg-wasm. If faithfulness-to-intent were scored above raw speed, ffmpeg-wasm would be the better answer.
