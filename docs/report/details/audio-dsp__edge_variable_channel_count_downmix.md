# audio-dsp/edge_variable_channel_count_downmix

- Family: `audio-dsp`
- Fixture asset: `fixtures/media/wav_5_1.wav` (5.8 MB, real on-disk PCM 5.1 WAV)
- Operation: `transcode` (5.1 -> stereo downmix, PCM-s16, container `wav`, sampleRate left as source)
- primaryMetric: none declared on scenario -> de-facto `wall` (scenario metrics: `wall`, `peakMemory`, `longtasks`)
- passCount: 2 of 7 (ffmpeg-wasm, mediabunny)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- CONTESTED: two engines PASS the identical gating oracle (`property-invariant` / `transcode-output-metadata`) with equivalent correctness.
- Decisive factor: **wall-clock throughput**. ffmpeg-wasm transcodes in `62.535 ms` vs mediabunny `185.15 ms` -> **2.96x faster wall** (margin = 185.15 / 62.535). Correctness is a tie (both emit container=`wav`, exactly 1 audio track, duration within tolerance), so the tie breaks on performance, where ffmpeg-wasm is decisively ahead on the primary metric.
- Caveat on the margin: both samples are `n==1`, mediabunny holds the **longtasks** sub-metric (234 ms vs ffmpeg-wasm 474 ms, i.e. ffmpeg-wasm blocks the main thread ~2x longer), and ffmpeg-wasm reported **peakMemory=0** (n==0, not captured) so its memory cost is unmeasured while mediabunny shows 41.2 MB. The win stands on wall but is not a clean sweep across all sub-metrics.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 62.535 ms | n/a (not measured) | 0 (n=0, uncaptured) | 474 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass | 185.15 ms | n/a (not measured) | 41,196,330 B (~41.2 MB) | 234 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | adapter cannot remap audio channel count (downmix/upmix) |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |

Oracle measurements (from shard):
- ffmpeg-wasm: `durationDeltaSec=0`, `durationToleranceSec=0.041666…` (1/24 s band), `audioTracks=1`.
- mediabunny: `durationDeltaSec=0.0000208333…`, `durationToleranceSec=0.041666…`, `audioTracks=1`.

## Why the winner wins (deep technical)

This is a pure-PCM, lossless-container operation: the input is uncompressed `pcm-s16` 5.1 audio in a RIFF/WAVE container and the requested output is `pcm-s16` stereo in WAV. There is no perceptual codec in the loop, so "correctness" here is purely a structural/metadata invariant: the output must be a real WAV, carry exactly one audio track, and preserve the source duration to within 1/24 s. Both PASS engines satisfy that identically (`audioTracks=1`, duration delta within the `0.041667 s` band). Because there is no decoded-PCM bit-exact gate wired for this scenario, neither engine can pull ahead on the correctness ladder — they sit on the same rung (`property-invariant`, the structural/metadata-exact tier). The contest therefore reduces to performance, and on the headline `wall` metric ffmpeg-wasm is 2.96x faster.

Mechanistically, the downmix itself is cheap in both engines but the engines pay very different fixed costs:

ffmpeg-wasm runs the operation as a single native libavfilter pipeline inside the vendored wasm core. The adapter builds one ffmpeg invocation and appends `-ac 2` to request the stereo downmix (src/engines/ffmpeg-wasm/adapter.ts:2504 `if (a.channels) args.push('-ac', String(a.channels))`, alongside `-c:a <pcm encoder>` at adapter.ts:2473 and the `-ar` handling at adapter.ts:2503). The `-ac 2` flag drives ffmpeg's internal channel-mixer matrix (the standard ITU/AC-3 5.1->stereo downmix coefficients) entirely in compiled C, then writes a fresh WAV via the RIFF muxer. For a few-MB PCM file this is essentially one streaming pass with no per-sample JS, which is why its wall is only 62.535 ms even though it is single-thread wasm (the adapter deliberately defaults to the single-thread core, adapter.ts:10). The flip side shows up in `longtasks=474 ms`: the whole transcode is one synchronous wasm call that monopolizes the main thread, ~2x longer than mediabunny's.

mediabunny performs the same downmix through its TypeScript `Conversion` pipeline. The adapter maps the requested stereo count to `ConversionAudioOptions.numberOfChannels` (src/engines/mediabunny/adapter.ts:683 `if (typeof a.channels === 'number') opts.numberOfChannels = a.channels;`), and the engine declares both `downmix` and `upmix` as first-class capabilities backed by that option (adapter.ts:1064-1065). The transcode entrypoint is `transcode()` at adapter.ts:1271. Because mediabunny decodes to AudioData/`AudioSample`, remaps channels, and re-encodes in a streaming-lockstep JS pipeline (env.configUsed `pipeline: "streaming-lockstep"`, `backend: "webcodecs"`, `coreBuild: "pure-ts-esm"`), it carries more JS/GC overhead per sample-frame and a measurable working set (`peakMemory ~41.2 MB`). That extra orchestration is why its wall is 185.15 ms — 3x ffmpeg-wasm's — despite producing a marginally tighter duration (`Δ 2.08e-5 s` vs ffmpeg's exact `0`), a difference far inside the tolerance and therefore not correctness-decisive. mediabunny's one genuine advantage is responsiveness: `longtasks=234 ms`, roughly half ffmpeg-wasm's, because its work is chunked rather than one monolithic wasm trap.

Net: identical correctness rung, ffmpeg-wasm wins the primary `wall` metric by ~2.96x; mediabunny wins only the secondary `longtasks` (responsiveness) and is the only one to report memory. Per the decision procedure (correctness comparable -> performance, primaryMetric/wall first), the winner is ffmpeg-wasm.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on perf): correct downmix via `numberOfChannels` (adapter.ts:683), same oracle pass (`audioTracks=1`, duration delta `2.08e-5 s`), but `wall=185.15 ms` is 2.96x slower than the winner and it consumes ~41.2 MB peak. It wins `longtasks` (234 vs 474 ms) but the primary metric is wall, so it ranks second.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): honest under-capability — `the adapter cannot remap audio channel count (downmix/upmix)`. The op IS declared (it has a transcode path) but it explicitly does not implement channel remapping, so it self-NAs rather than fail. This NA is honest, not under-declaration: the scenario *requires* a channel change, which this adapter genuinely lacks.
- **mp4box@2.3.0** (NA_ENGINE): `engine does not declare operation 'transcode'`. mp4box is a demuxer/box-parser, not an encoder; honest NA.
- **web-demuxer@4.0.0** (NA_ENGINE): `engine does not declare operation 'transcode'`. Demux-only library; honest NA.
- **remotion-media-parser@4.0.479** (NA_ENGINE): `engine does not declare operation 'transcode'`. Parser-only; honest NA.
- **platform@chrome-149** (NA_ENGINE): `engine does not declare output container 'wav'`. WebCodecs/MediaRecorder on Chrome cannot mux a PCM WAV output container, so the platform path honestly NAs on the output-container capability check rather than faking a WAV.

## Anti-cheat validation

- Scenario definition: src/scenarios/audio-dsp/index.ts:530-539 (id `edge_variable_channel_count_downmix`, `op: 'transcode'`, `asset: 'wav_5_1.wav'`, `opts.audio.channels: 2`, `invariant: 'transcode-output-metadata'`, oracle `property-invariant`). The mapping that wires `requires.containersOut` and audio codecs is at index.ts:542-560.
- Fixture: `fixtures/media/wav_5_1.wav` exists on disk, 5.8 MB — a real multichannel PCM WAV, not synthetic/empty/mock. Input is genuine.
- Oracle: src/core/oracles.ts:3626 `transcodeOutputMetadataInvariant` (dispatched from `property-invariant` at oracles.ts:343). It re-probes the actual produced output via the reference engine (oracles.ts:3641), then asserts container match (oracles.ts:3655), source-duration preservation within a real tolerance band (oracles.ts:3659-3677), and audio-track shape (oracles.ts:3692-3700). This is a genuine probe-of-output comparison, not a no-op.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2165 `transcode()`; the decisive downmix flag `-ac 2` is emitted at adapter.ts:2504, the PCM encoder selection at adapter.ts:2473, output read back from the wasm FS at adapter.ts ~2529 (`readBinary(outName)`) and returned as real bytes. No canned output, no input->output copy, no golden short-circuit; errors propagate (mutated/truncated inputs are rejected at adapter.ts:2182-2186).
- Caveat — gate strength: the oracle is structural/metadata only (container + duration tolerance ±1/24 s + audio-track count). It does NOT verify the decoded stereo PCM against a golden, nor that 6 channels were actually mixed down to 2 (it only checks `audioTracks==1`, which is true of any stereo OR mono output). A transcode that produced a stereo WAV of the right duration by any means would pass. Both PASS results are real (real lib calls, real bytes, plausible measurements), but the gate is a metadata-shape gate rather than a downmix-correctness gate.
- Cached note: BOTH PASS entries have `cached==true` ("cached previous PASS result"). The numbers were reused, not freshly re-run; per the launcher seeding caveat there is staleness risk. The relative ranking (2.96x wall) is consistent and plausible, but the exact wall figures are from a prior run.
- Verdict: **WEAK-GATE** — real fixture + real implementations on both winners, but the gating oracle is a structural/metadata invariant (no decoded-PCM/channel-content comparison), so the PASS is genuine yet not a strong proof of downmix correctness.

## Confidence & caveats

- Confidence: medium. The winner selection is robust on the declared primary metric (wall, 2.96x), and the implementation/fixture are verified real. Downgraded from high because: (1) the oracle is a WEAK-GATE that does not assert actual 5.1->stereo channel content; (2) both PASS results are cached (n==1, possibly stale); (3) sub-metrics split — mediabunny wins longtasks and is the only engine reporting peakMemory (ffmpeg-wasm peakMemory uncaptured), so "best overall" is metric-dependent, with wall as the tiebreaker per the procedure.
