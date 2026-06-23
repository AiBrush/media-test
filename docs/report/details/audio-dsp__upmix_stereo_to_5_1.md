# audio-dsp/upmix_stereo_to_5_1

family: audio-dsp | fixture asset: `fixtures/media/wav_s16.wav` (PCM s16 WAV, ~960 KB, real) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Status: **CONTESTED** — two engines reached PASS (`ffmpeg-wasm`, `mediabunny`).
- Decisive factor: **performance**, since correctness is identical (both pass exactly one oracle, `property-invariant` / transcode-output-metadata, with equivalent results). ffmpeg-wasm is ~5x faster on the primary metric.
- Margin over runner-up (mediabunny): **5.04x faster wall** (34.73 ms vs 175.04 ms) and **5.04x higher realtime throughput** (143.97x vs 28.56x). Both measured at n=1 (weak statistical evidence; see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 34.73 ms | 143.97x | (not measured, n=0) | 1012 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 175.04 ms | 28.56x | 46,990,774 B (~44.8 MiB) | 173 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'upmix' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |

## Why the winner wins (deep technical)

The operation is a stereo→5.1 **upmix** of a PCM-s16 WAV, re-emitted as a 6-channel PCM-s16 WAV (`opts: { container: 'wav', audio: { codec: 'pcm-s16', channels: 6 } }`, src/scenarios/audio-dsp/index.ts:148-158). The scenario explicitly sets `bitReproducible: false` because the channel-routing matrix (which of the 6 output channels the L/R inputs land on) is engine-defined — there is no single golden PCM. The gate is therefore the metamorphic **property-invariant** oracle in `transcode-output-metadata` mode (src/core/oracles.ts:3631-3708), which re-probes the produced bytes with the reference engine and asserts (a) container == `wav`, (b) duration within tolerance, and (c) via `compareRequestedTrack` (src/core/oracles.ts:3778-3821) that the single audio track reports exactly `channels === 6`. This is a real structural check, not a smoke test, but it is metadata-level — it does not verify the actual sample content of the 4 synthesized channels.

Both PASS engines satisfy this identically. The shard measurements are physically plausible for a real ~10-second WAV: ffmpeg reports `durationDeltaSec: 0` (exact), mediabunny `durationDeltaSec: 0.0000208s` (sub-sample rounding), both well under the `durationToleranceSec: 0.0417s` band; both report `audioTracks: 1`. So correctness strength is a tie on the ladder (one structural/metadata oracle each, no bit-exact gate exists for this case by design).

Correctness being equal, the decision falls to performance (primaryMetric = wall). ffmpeg-wasm:
- runs the upmix as a single in-WASM FFmpeg invocation appending `-ac 6` to the output args (src/engines/ffmpeg-wasm/adapter.ts:2253, also :2504 on the direct path). FFmpeg's libavfilter inserts the `aresample`/channel-rebuild step internally and writes the WAV via its muxer — a tight C/WASM loop over interleaved s16 samples.
- wall median **34.73 ms**, **143.97x realtime**.

mediabunny:
- maps `audio.channels` → `ConversionAudioOptions.numberOfChannels = 6` (src/engines/mediabunny/adapter.ts:683, built in `buildAudioOptions` src/engines/mediabunny/adapter.ts:672-692; `upmix` declared as a real capability at src/engines/mediabunny/adapter.ts:1065). Its pure-TS ESM core (`coreBuild: "pure-ts-esm"`, `wasmThreads: 0`, `sharedArrayBuffer: false` per env.configUsed) decodes to f32, re-channels, and re-encodes PCM in JavaScript.
- wall median **175.04 ms**, **28.56x realtime** — 5.04x slower.

The decisive mechanism: for a small PCM passthrough-plus-rechannel job, FFmpeg's compiled native filter graph in WASM dispatches the per-sample channel mapping far more efficiently than mediabunny's per-frame TS decode/encode loop, even though ffmpeg incurs a higher one-time longtask cost (1012 ms vs 173 ms — its monolithic exec blocks the main thread longer during module/exec setup, while mediabunny's streaming-lockstep pipeline yields more). On steady-state wall time, which is the primary metric here, ffmpeg wins by ~5x. Note ffmpeg's peakMemory was not captured (n=0 samples), whereas mediabunny reports ~44.8 MiB; we cannot claim a memory win for ffmpeg, only a wall/throughput win.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed; lost on speed. Same single oracle (property-invariant, channels=6, durationDelta 2.08e-5s) but 175.04 ms wall vs 34.73 ms (0.198x the speed) and 28.56x vs 143.97x realtime. Pure-TS ESM core, single-thread, no SAB — the JS re-channel/re-encode loop is the bottleneck. Legitimate runner-up, not a failure.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare operation 'transcode'". Honest: mp4box is a parser/segmenter (ISO-BMFF box layout), it has no audio re-encode/upmix path. Correct NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'transcode'". Honest: a parser, not a transcoder. Correct NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'transcode'". Honest: demux-only (WASM FFmpeg demuxer), no encode side. Correct NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare feature 'upmix'". Plausible/honest: it declares `transcode` for other audio-dsp cases but specifically does not expose channel upmix; the NA is at the granular feature level rather than blanket, which is the more honest gating.
- **platform@chrome-149** — NA_ENGINE: "does not declare output container 'wav'". Honest: the browser-native (WebCodecs + MediaRecorder) path cannot mux a raw PCM WAV container; WAV output is genuinely out of scope. Correct NA.

## Anti-cheat validation

- Scenario definition: src/scenarios/audio-dsp/index.ts:148-158 (`id: 'upmix_stereo_to_5_1'`), notes: "Stereo->5.1 upmix (channel routing varies by engine); assert 6-channel output + duration."
- Fixture: `asset: 'wav_s16.wav'` → `fixtures/media/wav_s16.wav` confirmed present, ~960 KB real PCM-s16 WAV (`stat` succeeded). Not synthetic/empty/mock.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2253 (`finalArgs.push('-ac', String(opts.audio.channels))`) and :2504 — genuinely invokes FFmpeg-WASM with `-ac 6`; output read back via `readBinary(outName)` (adapter.ts:2257). No canned output, no input→output copy, no short-circuit to a golden, no swallowed error reporting success.
- Gating oracle: src/core/oracles.ts:3631-3708 (transcode-output-metadata) + src/core/oracles.ts:3817-3818 (the `channels !== 6` diff). It re-probes the produced bytes with the reference engine and fails on container/duration/channel mismatch — a real comparison, not trivially satisfiable. Measurements (durationDelta 0 / 2.08e-5s vs 0.0417s tol; audioTracks 1) are physically plausible.
- Caveat on gate strength: this is a **metadata/structural** gate, not bit-exact — by deliberate design (`bitReproducible: false`), since the upmix matrix is engine-defined. The oracle does not inspect the synthesized rear/center/LFE channel contents, so a malformed but correctly-headered 6-channel WAV would still pass. That is a correctness-coverage limitation inherent to the scenario, not evidence of cheating.
- Cached note: BOTH PASS results have `cached: true` ("cached previous PASS result"). The benchmarks were reused, not re-run this session — staleness risk on the exact wall/throughput numbers. The 5x ordering is large enough that staleness is unlikely to flip the winner, but treat the absolute ms values as last-run, not fresh.

Verdict: **WEAK-GATE** — real fixture + real implementation, but the gating oracle is metadata/structural only (channel count + duration), not content-verifying, so the PASS is genuine yet not a strong correctness proof.

## Confidence & caveats

- Confidence: medium. Winner selection (ffmpeg-wasm) is robust on the primary metric with a 5.04x margin.
- n=1 for every bench metric on both engines (mad=0, p95==median) — single-sample timing; the ~5x gap is well outside plausible single-run noise, but statistical strength is low.
- ffmpeg peakMemory not measured (n=0); cannot compare memory. mediabunny used ~44.8 MiB.
- Both results cached → numbers are from a prior run, not this session.
- Gate is metadata-only (no bit-exact content check), so "best" reflects fastest correctly-shaped output, not verified audio fidelity of the 4 synthesized channels.
