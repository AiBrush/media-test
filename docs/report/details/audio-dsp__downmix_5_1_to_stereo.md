# audio-dsp/downmix_5_1_to_stereo

family: audio-dsp | fixture asset: `fixtures/media/wav_5_1.wav` (5.8 MB real 6-channel PCM-s16 WAV) | primaryMetric: wall / throughputRealtime | passCount: 2 of 7

## Verdict

**Best framework: ffmpeg.wasm@0.12.15** — CONTESTED (2 PASS: ffmpeg-wasm and mediabunny@1.48.0).

Both PASS engines satisfied the exact same single gating oracle (`property-invariant` / transcode-output-metadata) with the same correctness strength: each produced a real `wav` container with 1 audio track whose channel count equals the requested 2 (a genuine 6→2 downmix) and a duration delta inside tolerance. Correctness is therefore a tie. The decision falls to **PERFORMANCE**.

**Decisive factor:** wall-clock and realtime throughput. ffmpeg-wasm finished in 65.03 ms vs mediabunny's 186.31 ms = **2.86x faster wall**, and 153.78x vs 53.68x realtime = **2.86x higher throughput**. It also blocked the main thread far less: 330 ms vs 2055 ms of longtasks = **6.2x fewer longtasks**. Margin caveat: both samples are n=1, mad=0 (single measurement, cached), so the spread is unknown and the magnitude (not just the direction) is weaker evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 65.03 ms | 153.78x | 0 (n=0, not sampled) | 330 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 186.31 ms | 53.68x | 46,576,310 B (~46.6 MB) | 2055 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'downmix' |

## Why the winner wins (deep technical)

The operation is a **5.1 → stereo channel downmix on uncompressed PCM-s16 in a RIFF/WAV container**. There is no codec to decode here — the samples are linear 16-bit integers — so the work is (1) parse the WAV `fmt `/`data` chunks, (2) apply a 6-channel → 2-channel mix matrix sample-by-sample, (3) re-quantize to s16, and (4) write a fresh WAV header. The scenario requests `opts.audio = { codec: 'pcm-s16', channels: 2 }` with `outContainer: 'wav'` (`src/scenarios/audio-dsp/index.ts:138-147`).

**ffmpeg.wasm's path.** The adapter takes the generic transcode branch and, because `opts.audio.channels` is set, appends `-ac 2` to the ffmpeg argument vector (`src/engines/ffmpeg-wasm/adapter.ts:2504`, with the equivalent in the audio-roundtrip branch at `:2253`). `-ac 2` invokes libavfilter's built-in channel-mixer, which for a 6→2 reduction applies ffmpeg's default downmix matrix (the AC-3/ITU-style L=L+0.707·C+0.707·Ls, R=R+0.707·C+0.707·Rs combination) entirely in C compiled to wasm. The whole thing runs in one synchronous wasm invocation over a memory-mapped buffer, so for a short clip the wall cost is dominated by a single tight native loop: **65.03 ms wall, 153.78x realtime**. The `declares` list explicitly enumerates `downmix` as `-ac N where N < input channels` (`src/engines/ffmpeg-wasm/adapter.ts:1514`), so the capability is honestly gated, not faked. The gating oracle confirmed the result: `property-invariant` probed the output and reported `audioTracks: 1`, `durationDeltaSec: 0` against a `durationToleranceSec` of 0.04167 s — and crucially `compareRequestedTrack` (`src/core/oracles.ts:3817-3819`) verified `track.channels === 2`, so the silent pass means the output WAV really carries exactly two channels.

**Why it beat mediabunny.** mediabunny is genuinely implemented too: it routes the channel change through `ConversionAudioOptions.numberOfChannels` (set at `src/engines/mediabunny/adapter.ts:683`, declared as the `downmix` feature at `:1064`) and runs `mb.Conversion.execute()` (`:855`). But mediabunny's conversion pipeline is a streaming WebCodecs-oriented graph (`env.configUsed.backend: "webcodecs"`, `pipeline: "streaming-lockstep"`): it decodes to AudioData/AudioBuffer-style frames, downmixes in JS/WebAudio-land, then re-encodes and re-muxes. For PCM-in-WAV that decode→reframe→encode round-trip is pure overhead — there is no compressed bitstream that benefits from a codec — yet it still allocates frame buffers (peakMemory **46.6 MB**, vs ffmpeg's allocator staying inside its own linear heap which the harness didn't sample, n=0) and posts a long stream of lockstep tasks (**2055 ms longtasks**, 6.2x ffmpeg's 330 ms). The net is 186.31 ms wall / 53.68x realtime — correct, but 2.86x slower for an operation where ffmpeg's single native filter pass is the structurally cheaper route. mediabunny's duration fidelity is actually marginally better (`durationDeltaSec: 0.0000208 s` vs ffmpeg's 0), but both are far inside the 0.04167 s band, so it is not a correctness differentiator.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (genuine downmix via `ConversionAudioOptions.numberOfChannels`) but LOST on performance: 186.31 ms wall (2.86x slower), 53.68x realtime (0.35x), 2055 ms longtasks (6.2x more main-thread blocking), 46.6 MB peak. Its streaming WebCodecs decode→reframe→re-encode pipeline is overhead for uncompressed PCM.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — mp4box is an ISOBMFF parser/muxer, not a sample-processing transcoder; it cannot apply a mix matrix.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — it is a demux/parse-only library with no audio sample-rewrite path.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'". Honest — the platform path (WebCodecs/MediaRecorder) has no WAV/RIFF muxer; it cannot emit the required `wav` output.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — it is a demuxer only; no encode/mix stage exists.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'downmix'". Plausibly honest, but worth a flag: remotion-webcodecs does declare `transcode`, so the gap is specifically the `downmix` feature token. Whether WebCodecs+remotion could in principle reduce channel count makes this the one NA that could be an under-declared capability; for this PCM/WAV case it is moot because it also lacks a WAV muxer like the platform engine.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/audio-dsp/index.ts:138-147` — `id: 'downmix_5_1_to_stereo'`, `asset: 'wav_5_1.wav'`, `features: ['downmix']`, `opts.audio.channels: 2`, `bitReproducible: true`, notes: "5.1->stereo downmix via defined ITU-R BS.775 coefficients; exact integer mix, reproducible."
- **Fixture:** `fixtures/media/wav_5_1.wav` exists and is a real 5.8 MB 6-channel PCM-s16 WAV (not synthetic/empty/mock). Confirmed via `stat`.
- **Gating oracle:** `property-invariant` (transcode-output-metadata) at `src/core/oracles.ts:3631-3708`; channel/sampleRate verification in `compareRequestedTrack` at `:3778-3821` (channels checked at `:3817-3819`). This is a REAL structural comparison — it re-probes the produced bytes with the reference engine, confirms container == `wav`, track count, duration within a measured tolerance (0.04167 s), and that the output channel count == 2. It is not trivially satisfiable for the channel requirement: an engine that emitted a 6-channel passthrough would fail the `track.channels !== 2` diff.
- **Winner adapter:** ffmpeg-wasm transcode branch, `-ac 2` at `src/engines/ffmpeg-wasm/adapter.ts:2504` (and `:2253`), capability honestly declared at `:1514`. No canned output, no input→output copy, no golden short-circuit, no swallowed errors — it shells the real wasm ffmpeg and reads back `outName`.
- **Verdict: WEAK-GATE.** The PASS is real (real fixture, real ffmpeg downmix, real channel-count check), but the gate is weaker than the scenario's own intent. The scenario asserts `bitReproducible: true` with "exact integer mix via defined ITU-R BS.775 coefficients … reproducible PCM digest," which implies a `decoded-audio-pcm` / golden-digest oracle should gate it. Only `property-invariant` ran, and it verifies container + track count + channel count + duration — NOT the actual mix coefficients or sample values. Any engine producing *some* valid 2-channel WAV of the right duration passes, regardless of whether its downmix matrix matches BS.775. There is no `fixtures/golden/*downmix*` digest in the repo to enforce the bit-exact claim. So ffmpeg's win is correct on the metadata invariant but the downmix *accuracy* is unverified by the oracle that actually gated.
- **Cached note:** BOTH winners are `cached: true` ("cached previous PASS result"). Neither was re-run in this pass; ffmpeg's bench timestamp is 2026-06-22T16:51Z, mediabunny's is 2026-06-22T13:53Z — different runs, n=1 each, mad=0. Staleness risk is real and the cross-engine timing comparison mixes two separate cached runs.

## Confidence & caveats

- Correctness is a genuine tie (identical single oracle, both verify channels==2). The winner is decided purely on performance, where ffmpeg-wasm's lead is large and consistent across wall (2.86x), throughput (2.86x), and longtasks (6.2x).
- Evidence strength is limited: n=1 / mad=0 / both cached, and the two timings come from different cached runs ~3 h apart. The direction is unambiguous but the exact ratios should be treated as point estimates.
- ffmpeg's peakMemory is unsampled (n=0), so the memory axis cannot be compared; mediabunny's 46.6 MB stands uncontested only because ffmpeg has no number, not because it used less.
- The WEAK-GATE verdict is the main caveat: the bit-reproducible BS.775 claim in the scenario notes is not enforced by any oracle that ran, so this result certifies "produced a valid 2-channel WAV," not "downmixed correctly to spec."
