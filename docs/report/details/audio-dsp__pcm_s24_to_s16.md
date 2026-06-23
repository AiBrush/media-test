# audio-dsp/pcm_s24_to_s16

family: audio-dsp | fixture asset: `wav_s24.wav` (24-bit signed PCM in RIFF/WAVE, 1.4 MB, exists in fixtures/media/) | primaryMetric: wall (ms) | passCount: 3 / 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (CONTESTED — 3 engines PASS: ffmpeg-wasm, mediabunny, remotion-webcodecs).
- **Decisive factor: PERFORMANCE.** All three PASS engines satisfied the exact same single oracle (`property-invariant` / `transcode-output-metadata`) with identical measurements (`durationDeltaSec: 0`, `audioTracks: 1`), so correctness strength is a tie. The tie breaks on wall time.
- **Margin over runner-up:** ffmpeg-wasm wall median **12.175 ms** vs mediabunny **78.355 ms** = **6.44x faster wall**; vs remotion-webcodecs **79.285 ms** = **6.51x faster**. On throughputRealtime ffmpeg-wasm reaches **410.7x-realtime** vs mediabunny **63.8x** and remotion-webcodecs **63.1x** (~6.4x higher). Caveat: every metric is n=1 (mad=0, p95==median), so the spread is unknown and the win, while large, rests on a single sample.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 12.175 | 410.68 | 0 (not sampled, n=0) | 4924 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 78.355 | 63.81 | 0 (not sampled, n=0) | 632 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true | 79.285 | 63.06 | 58,125,238 | 179 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a pure PCM bit-depth reduction inside a RIFF/WAVE container: 24-bit little-endian signed PCM (`pcm_s24le`) → 16-bit little-endian signed PCM (`pcm_s16le`), same sample rate and channel layout, container stays `wav`. There is no compressed codec, no entropy coding, no inter-frame state — it is a sample-by-sample integer truncation plus a header (`fmt ` chunk bits-per-sample 24→16, byte-rate/block-align rewrite, `data` chunk size halved-per-byte). This is the cheapest class of transcode in the entire suite, which is exactly why absolute wall times are tiny and why a native C codec path dominates.

**ffmpeg.wasm** runs the conversion as a genuine ffmpeg command. The adapter (`src/engines/ffmpeg-wasm/adapter.ts:2165` `transcode()`) probes the input via `runInfo` (`adapter.ts:2206`), builds `[...inputOptions, '-i', <in>, '-map', '0']` (`adapter.ts:2271`), and in the audio branch (`adapter.ts:~2461`) maps the requested canonical codec `pcm-s16` to the ffmpeg encoder `pcm_s16le` via `audioEncoderName` (codec table at `src/engines/ffmpeg-wasm/codecs.ts:40-44`), appending `-c:a pcm_s16le`, then `args.push(outName)` and `await this.run(args)` (`adapter.ts:~2528`), finally `this.readBinary(outName)` returns the real produced WAV bytes (`adapter.ts:~2530`). The s24→s16 reduction is performed inside libavcodec's native `pcm_s24le` decoder / `pcm_s16le` encoder — a tight, branch-free integer shift loop compiled to wasm with no per-sample JS boundary crossing. With a ~1.4 MB / sub-second clip, the whole job is one synchronous wasm call: median wall **12.175 ms**, **410.7x-realtime**. (The 4924 ms `longtasks` figure reflects the one-time wasm core instantiation/JIT warm cost charged to this engine's session, not the per-op transcode cost captured by `wall`.)

**mediabunny** and **remotion-webcodecs** both run on the WebCodecs backend (`env.configUsed.backend: "webcodecs"`, `hwAccel: "prefer-hardware"`). For PCM that hardware path is irrelevant — there is no hardware PCM "decoder"; the data must round-trip through `AudioData`/`AudioEncoder`-style JS plumbing and a streaming pipeline (mediabunny `pipeline: "streaming-lockstep"`, remotion `pipeline: "streaming-backpressure"`). That per-chunk JS orchestration plus AudioData allocation is the ~6.4x overhead: both land at ~78–79 ms / ~63x-realtime. remotion additionally sampled `peakMemory` 58.1 MB (its bufferWriter holds the output in memory), whereas mediabunny and ffmpeg-wasm did not sample peakMemory (n=0), so peakMemory cannot rank them. Both produced a correct-shape WAV with 1 audio track and zero duration drift — they lose purely on speed, not correctness.

Crucially, the gating oracle here is **not** a bit-exact PCM check. `transcodeOutputMetadataInvariant` (`src/core/oracles.ts:3626`) only reference-probes the output and asserts (a) container == requested `wav`, (b) `|durationOut − durationSource| ≤ tol`, (c) requested audio track present (count == 1). The shard measurements confirm exactly this surface: `durationDeltaSec: 0`, `durationToleranceSec: 0.0417` (≈1 video-frame band), `audioTracks: 1`. So "the winner wins" is, strictly, "the winner produced a correctly-shaped 16-bit WAV fastest" — the actual 24→16 sample quantization values were never compared to a golden digest.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on performance: wall 78.355 ms vs 12.175 ms (6.44x slower), throughputRealtime 63.81x vs 410.68x. WebCodecs/streaming-lockstep PCM plumbing overhead dwarfs ffmpeg's native shift loop on this trivial reduction.
- **remotion-webcodecs@4.0.479** — PASS but lost on performance: wall 79.285 ms (6.51x slower) and 63.06x-realtime; also the only engine to report peakMemory (58.1 MB) via its in-memory bufferWriter. Same WebCodecs-overhead-on-PCM root cause.
- **platform@chrome-149** — NA_ENGINE, "engine does not declare output container 'wav'". Honest NA: the Chrome WebCodecs/MediaRecorder platform path has no WAV muxer, so it cannot author a RIFF/WAVE output. Genuine capability gap, not under-declaration.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: web-demuxer is a demux-only library; transcode/encode is out of scope.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: MP4Box.js is an MP4 (ISO-BMFF) box parser/remuxer with no audio re-encode and no WAV path.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: it is a parser, not an encoder.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/audio-dsp/index.ts:231-240` (case `pcm_s24_to_s16`), wired into scenarios at `index.ts:298-317` with `op: 'transcode'`, `options.invariant: 'transcode-output-metadata'`, `oracles: conversionOracles(c)` → `['property-invariant']` (`index.ts:293`).
- **Fixture:** `asset: 'wav_s24.wav'` → `fixtures/media/wav_s24.wav` exists, 1.4 MB real 24-bit WAV (not synthetic/empty/mock). Golden metadata present at `fixtures/golden/wav_s24.wav.meta.json` and packets at `wav_s24.wav.packets.json`.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2165` (`transcode`), codec map `src/engines/ffmpeg-wasm/codecs.ts:40-44`. Confirmed genuine: builds a real ffmpeg arg vector, calls `this.run(args)`, returns `readBinary(outName)` of the produced bytes. No canned output, no input→output copy, no short-circuit to a golden file, no error-swallowing (errors throw; only narrow documented cases raise NotApplicableError).
- **Oracle:** `src/core/oracles.ts:3626` `transcodeOutputMetadataInvariant` (dispatched at `oracles.ts:2650-2651`). It performs a real reference-engine probe of the produced bytes and compares container/duration/track-shape against the source golden — a real comparison, NOT trivially-always-true. Measurements (`durationDeltaSec: 0`, `audioTracks: 1`) are physically plausible for an exact-duration PCM reduction.
- **WEAK-GATE rationale:** the scenario is flagged `bitReproducible: true` and its notes claim "24-bit → 16-bit truncation/dither-off; exact reproducible reduction", but `conversionOracles()` (`index.ts:288-296`) deliberately returns only `property-invariant` because, per its own comment, "the current suite has no decoded-PCM oracle ... the `bitReproducible` flag remains as documentation for the future PCM-digest oracle; it does not drive [a digest gate] today." So the gate validates output *shape and duration*, not the actual 24→16 sample values. A PASS here proves a valid same-duration single-track 16-bit WAV was produced, but does NOT prove the quantization is bit-exact against a golden. The PASS is real; the gate is loose relative to what the scenario name advertises.
- **Cached note:** all three PASS results have `cached: true` ("cached previous PASS result"). Numbers were reused, not re-run in this pass — staleness risk applies to both the bench medians and the oracle outcome.

**validationVerdict: WEAK-GATE** — real fixture + real ffmpeg implementation + a real (but metadata/duration-only) oracle that does not check the bit-exact PCM reduction the scenario claims to test.

## Confidence & caveats

- Confidence: **medium**. Engine selection and the performance ranking are unambiguous from the shard; the implementation is verified genuine at file:line. But (1) the oracle is metadata-only — no bit-exact validation of the 24→16 reduction, so all three "correctness" PASSes are weaker than the scenario advertises; (2) every bench metric is n=1 (mad=0), so the 6.4x margin is a single-sample observation; (3) all winning results are cached, so they reflect a prior run, not a fresh execution; (4) peakMemory is unsampled (n=0) for ffmpeg-wasm and mediabunny, so memory cannot be used as a tiebreak among the PASS engines.
