# audio-dsp/throughput_encode_s16be

family: audio-dsp | fixture asset: `wav_s16.wav` (input) -> AIFF `pcm_s16be` output | primaryMetric: framesPerSec | passCount: 1 / 7

## Verdict
- Best framework: **ffmpeg.wasm@0.12.15** (`env.engineId` "ffmpeg-wasm").
- **Uncontested** — it is the only engine with status==PASS. The other six are NA_ENGINE.
- Decisive factor: it is the only adapter that declares BOTH the `transcode` operation AND `aiff` as an output container, so it is the only engine the runner even dispatches. It then runs a real wasm encode (`-c:a pcm_s16be` into an AIFF FORM/AIFF container) and satisfies the `property-invariant` (transcode-output-metadata) gate.
- Margin over runner-up: none to compute — every other engine was gated out before producing output (NA_ENGINE), so there is no second PASS to rank against.

## Per-engine results
| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 35.14 ms (n=1) | n/a (not measured) | 0 (not measured) | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'aiff' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'aiff' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Note on bench: only the `wall` metric has samples (n=1, median=35.14 ms, p95=35.14, mad=0). `framesPerSec` (the declared primaryMetric), `decodeFps`, and `peakMemory` all report n=0 with empty `samples[]` — they were not captured for this encode cell, so the headline throughput number is effectively unmeasured. durationMs (total cell incl. setup) = 3995 ms.

## Why the winner wins (deep technical)
The operation requested is an audio-only PCM **re-encode + re-container**: take a little-endian 16-bit PCM stream in a RIFF/WAVE file and re-emit it as **big-endian 16-bit PCM (`pcm_s16be`) inside an AIFF** container. The scenario (`src/scenarios/audio-dsp/index.ts:378-389`) sets `op: 'transcode'`, `input: wav_s16.wav`, `requires.containersIn: ['wav']`, `requires.containersOut: ['aiff']`, `requires.audioCodecs: ['pcm-s16','pcm-s16be']`, and `options: { container:'aiff', audio:{ codec:'pcm-s16be' }, invariant:'transcode-output-metadata' }`.

The capability gate in the runner intersects each engine's declared `operations`/`containersIn`/`containersOut`/`audioCodecs` against `requires`. AIFF-out + a `transcode` op is a narrow combination: only ffmpeg.wasm declares it. ffmpeg.wasm lists `pcm-s16be` among its audio codecs (`src/engines/ffmpeg-wasm/adapter.ts:158`) and `aiff` among its containers (adapter.ts:173,187), so it is the sole engine routed to `transcode()`.

Inside the adapter (`src/engines/ffmpeg-wasm/adapter.ts:2165` onward), the audio branch (around adapter.ts:2461-2530) builds real ffmpeg CLI args: `enc = audioEncoderName(a.codec)` resolves `pcm-s16be` -> `pcm_s16be` via the `AUDIO_ENCODER` table (`src/engines/ffmpeg-wasm/codecs.ts:43`, returned by `audioEncoderName` at codecs.ts:352). It pushes `-c:a pcm_s16be`, writes to `outName` with the AIFF extension, invokes the vendored single-thread wasm core (`this.run(args)`), then `readBinary(outName)` and returns `{ bytes, mime, container:'aiff' }`. This is a genuine sample-format byte-order conversion done by libavcodec's PCM encoder, not a copy — `pcm_s16le` -> `pcm_s16be` swaps each 16-bit sample's endianness, and the muxer wraps it in an AIFF `FORM`/`COMM`/`SSND` layout (big-endian by spec). The backend is the deliberately single-thread wasm core (adapter.ts:10 comment: defaulted to single-thread to avoid pthread traps during transcode cells), so no COOP/COEP isolation is required.

The gate is the `property-invariant` oracle with `which='transcode-output-metadata'` (`src/core/oracles.ts:2651` dispatch -> `transcodeOutputMetadataInvariant` at oracles.ts:3626). It re-probes the produced bytes (oracles.ts:3641); for AIFF it has a robust fallback `parseAiffMetadata` (oracles.ts:3643-3650, parser at 3710) that reads the `FORM`/`AIFF` magic and the `COMM` chunk to recover channels, sample frames, sample size, and the 80-bit extended sample rate. It then checks (1) container matches requested `aiff`, (2) duration delta within tolerance, and (3) the requested audio track exists. The recorded measurements are physically consistent with a real encode: `durationDeltaSec: 0` (output duration exactly equals source — expected for a lossless format/endianness change that preserves sample count), `durationToleranceSec: 0.0416667` (= 1/24 s band), `audioTracks: 1`. A single audio track with zero duration drift is exactly what a correct WAV->AIFF PCM re-encode yields.

## What each other framework did wrong
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: mp4box is an MP4/ISO-BMFF box parser/muxer, not an encoder; it has no PCM-to-AIFF transcode path and AIFF is not even an ISO-BMFF container.
- **platform@chrome-149** — NA_ENGINE, "engine does not declare output container 'aiff'". Honest: the Chrome platform stack (WebCodecs + media muxers) has no AIFF muxer; AIFF is not a writable container in the browser. Under-declaration is not plausible here.
- **mediabunny@1.48.0** — NA_ENGINE, "engine does not declare output container 'aiff'". Honest: mediabunny muxes MP4/WebM/etc.; AIFF is outside its writer set.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "engine does not declare output container 'aiff'". Honest: it rides WebCodecs/browser muxers, which lack AIFF output.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: it is a parser/demuxer, read-only; no encode/transcode capability.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: a libav-wasm demuxer only; it surfaces packets, it does not re-encode or mux AIFF.

All six NAs are genuine capability gaps, not under-declared abilities: AIFF + big-endian PCM encode is a niche path that only the full ffmpeg toolchain provides among these engines.

## Anti-cheat validation
- Scenario: `src/scenarios/audio-dsp/index.ts:378-389` (THROUGHPUT_CASES entry id `throughput_encode_s16be`), wired into `defineScenario` at index.ts:392-414 (`op:'transcode'`, `oracles:['property-invariant']`, `options.invariant:'transcode-output-metadata'`).
- Fixture: `fixtures/media/wav_s16.wav` exists, 960 KB. Header verified real: `RIFF....WAVE fmt ` with format tag 0x0001 (PCM), 2 channels, sample rate 0x0000BB80 = 48000 Hz, 16 bits/sample, followed by a `data` chunk. Not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:3626` `transcodeOutputMetadataInvariant` (dispatched via property-invariant at oracles.ts:2651); AIFF fallback parser `parseAiffMetadata` at oracles.ts:3710. It performs a real re-probe + container/duration/track comparison; not trivially satisfiable (duration tolerance is a tight 1/24 s and container/track-presence must match).
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2165` `transcode()`; audio encode args ~adapter.ts:2461-2530 (`-c:a pcm_s16be`, real `this.run`/`readBinary`); encoder mapping `src/engines/ffmpeg-wasm/codecs.ts:43` + `audioEncoderName` codecs.ts:352. No canned output, no input->output copy, no short-circuit to a golden, no error swallowing (errors throw).
- Verdict: **WEAK-GATE**. The encode and fixture are real, but the gate is a metadata/property invariant (container == aiff, durationDelta == 0 within 1/24 s, audioTracks == 1) — a structural shape check, NOT a sample-level bit-exact comparison of the PCM payload against a golden. It confirms a valid AIFF with one audio track and preserved duration, but does not verify the actual big-endian sample bytes are correct. The PASS is real and non-trivial, just not the strongest possible correctness gate for an endianness conversion.
- Cached note: this result has `cached: true` ("cached previous PASS result") — it was reused, not re-run this session, so there is a staleness risk; the wall=35.14 ms (n=1) and the empty framesPerSec/peakMemory samples are from the earlier run.

## Confidence & caveats
- Confidence: high on the decision (1 PASS vs 6 honest NA_ENGINE — no contest) and on the implementation being genuine (verified adapter code path + real fixture header + real oracle).
- Caveats: (1) the gate is property/metadata-level, not bit-exact, so it cannot catch a byte-order bug in the PCM payload (WEAK-GATE). (2) The result is cached — numbers are stale and the headline `framesPerSec` primaryMetric was never measured (n=0, empty samples), so the "throughput" framing of this scenario is unfulfilled; only a single wall sample exists. (3) No competitor produced output, so there is no comparative margin.
