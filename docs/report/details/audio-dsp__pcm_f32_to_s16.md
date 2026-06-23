# audio-dsp/pcm_f32_to_s16

- family: audio-dsp
- fixture asset(s): `fixtures/media/wav_f32.wav` (1.9 MB, real PCM-f32 WAV)
- primaryMetric: wall (with throughputRealtime / peakMemory / longtasks secondary)
- passCount: 2 of 7 (contested)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Contested: YES — two engines PASS (`ffmpeg-wasm` and `mediabunny`), and both pass the *identical* single oracle `property-invariant(transcode-output-metadata)` with identical measurements (`durationDeltaSec=0`, `audioTracks=1`). Correctness is therefore a tie; the decision falls to performance.
- Decisive factor: **wall-clock latency**. ffmpeg.wasm completes the f32→s16 WAV reformat in **16.13 ms** vs mediabunny's **30.52 ms** — a **1.89x** faster wall and the same **1.89x** edge on throughputRealtime (309.98x vs 163.85x realtime). ffmpeg.wasm also reports **0 sampled peak memory** (heap not instrumented for this row) against mediabunny's **~29.3 MB** resident.
- Margin caveat: both measurements are `n=1` (`mad=0`, `p95==median`), so the spread is unknown and the 1.89x ratio is single-shot evidence, not a distribution. Both rows are `cached:true` (reused, not freshly re-run).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 16.13 ms | 309.98x | 0 (n=0, not sampled) | 1017 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 30.52 ms | 163.85x | 29,326,591 B (~28 MB) | 1073 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-f32' |

## Why the winner wins (deep technical)

The operation is a **PCM sample-format conversion inside a RIFF/WAVE container**: decode 32-bit IEEE float samples from `wav_f32.wav`, quantize to signed 16-bit little-endian (`clamp + round`), and rewrap as WAV. There is no entropy codec, no inter-frame prediction, no GPU-decodable bitstream — it is pure integer/float DSP plus chunk re-muxing. That is the mechanistic key to why ffmpeg.wasm wins: the workload is CPU-bound DSP where a tight C/wasm inner loop beats a WebCodecs-oriented pipeline that carries decoder/encoder setup overhead it cannot amortize on a sample-format change.

**ffmpeg.wasm path.** `transcode()` (src/engines/ffmpeg-wasm/adapter.ts:2165) writes the real fixture to the wasm FS (`writeInput`, line 2203), probes it with `runInfo` (line 2206), then builds a genuine FFmpeg argument vector (`['-i', name, '-map', '0', ...]`, line 2271) and runs the actual `ffmpeg` program. For this case `-c:a pcm_s16le` (audio encoder name resolved by `audioEncoderName`) plus the WAV muxer does the f32→s16 reformat in FFmpeg's native swresample sample-format path — a vectorized C loop compiled to wasm. The config used is the single-thread pure-wasm core (per the adapter header, init defaults to single-thread to avoid SAB/COOP-COEP fragility). Despite single-thread, it finishes in 16.13 ms because the entire job is one streaming pass over ~5 s of PCM with no encoder negotiation. The `property-invariant` oracle then reference-probes the produced bytes and confirms `wav, 1 track(s) match requested output shape`, `durationDeltaSec=0` (≤ tolerance 0.0417 s).

**mediabunny path (runner-up).** `transcode()` (src/engines/mediabunny/adapter.ts:1271→runSingle at 1284) opens the input, builds an `Output` with a WAV `OutputFormat`, and runs the real `Conversion` API (`buildAudioOptions` at line 1303, `runConversion` at 1307) on the `webcodecs` backend (`env.configUsed.backend="webcodecs"`, `hwAccel="prefer-hardware"`, `pipeline="streaming-lockstep"`, `wasmThreads=0`, `coopCoep="not-required"`). mediabunny is architected around the WebCodecs read→decode→encode→mux lockstep loop; for a PCM f32→s16 reformat that machinery (sink/queue setup, AudioSample marshalling, conversion bookkeeping) is overhead that ffmpeg's monolithic swresample loop does not pay. The result is correct and passes the same oracle with identical measurements, but takes 30.52 ms (1.89x slower) and holds ~28 MB resident vs ffmpeg's uninstrumented heap. Hardware acceleration buys nothing here: PCM is not a hardware-decoded format, so the `prefer-hardware` hint is moot for this codec.

**Decisive factor restated:** correctness is a dead tie (same oracle, same `durationDeltaSec=0`, same `audioTracks=1`), so per the ranking rules the tiebreak is performance, and ffmpeg.wasm wins primaryMetric `wall` by 1.89x with a matching throughput lead.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed, lost on speed only. Same oracle, but wall 30.52 ms vs 16.13 ms (1.89x slower) and throughput 163.85x vs 309.98x; also ~29.3 MB peak vs ffmpeg's unsampled heap. Cause: WebCodecs streaming-lockstep Conversion overhead on a job that is plain swresample DSP.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — it is a *parser*, not an encoder; it has no WAV/PCM write path. Correct under-no-capability declaration.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — a demuxer only; cannot encode/re-quantize PCM.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — an ISO-BMFF box mux/demux tool with no PCM resampling or WAV output.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'". Honest — the browser WebCodecs/MediaRecorder surface does not emit RIFF/WAVE containers, so it cannot satisfy `outContainer:'wav'`.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare audio codec 'pcm-f32'". Honest — its WebCodecs codec matrix targets compressed audio; raw pcm-f32 input is outside its declared codecs.

All five NAs look genuine (capability/codec/container gaps), not under-declared dodges: none of these tools has a documented PCM-reformat-to-WAV path.

## Anti-cheat validation

- Scenario definition: src/scenarios/audio-dsp/index.ts:221-230 — `id:'pcm_f32_to_s16'`, `asset:'wav_f32.wav'`, `container:'wav'`, `audioCodecs:['pcm-f32','pcm-s16']`, `outContainer:'wav'`, `opts:{container:'wav',audio:{codec:'pcm-s16'}}`, `bitReproducible:true`, notes: "f32 -> s16 (clamp + round-half-to-even); golden encodes the exact quantization."
- Fixture: `fixtures/media/wav_f32.wav` EXISTS, 1.9 MB real PCM-f32 WAV (verified via stat). Goldens present: `fixtures/golden/wav_f32.wav.meta.json` and `wav_f32.wav.packets.json`. Real input, not synthetic/mock.
- Oracle implementation: src/core/oracles.ts:3631-3708 (`property-invariant` → transcode-output-metadata). It reference-probes the produced bytes via `ctx.referenceEngine.probe`, then asserts container match, duration within tolerance (`durationToleranceSec=0.0417`, measured `durationDeltaSec=0`), and the requested audio track shape (`audioTracks=1`). Real comparison, but **metadata/shape only — NOT a PCM bit-exact comparison.**
- Oracle selection: src/scenarios/audio-dsp/index.ts:291-295 — `conversionOracles()` *always* returns `['property-invariant']`. The header comment (lines 9-31) explains this is deliberate: the harness's bit-exact/decode oracles (`decoded-frames-bitexact`, `golden-metadata`) are wired to a WebCodecs *VideoDecoder*→RGBA path and to `op:'probe'` only, so they cannot gate an audio `transcode`. The `bitReproducible:true` flag and the golden's "exact quantization" are therefore **documentation for a future PCM-digest oracle and do NOT drive the gate that actually ran.**
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2165-2271 — genuine FFmpeg exec (writeInput → runInfo → arg vector → run), real `-c:a` encoder + WAV muxer. No canned output, no input→output copy, no golden short-circuit, no error-swallowing-as-success. Runner-up mediabunny: src/engines/mediabunny/adapter.ts:1271-1322 — real `Conversion`/`Output`/`buildAudioOptions`/`runConversion`. Both implementations are real.
- Verdict: **WEAK-GATE.** The fixture is real and both implementations are genuine, so the PASS is real — but the gating oracle checks only container/duration/track-count, NOT the f32→s16 quantization correctness the scenario's golden and `bitReproducible:true` intent imply. A subtly wrong quantizer (e.g. round-half-up vs round-half-to-even, or clipping bugs) would still pass this metadata-only invariant. The PASS is not strong evidence of sample-accurate conversion.
- Cached note: BOTH winning rows are `cached:true` ("cached previous PASS result"). The 16.13 ms / 30.52 ms numbers were reused, not freshly re-run — staleness risk applies to the performance margin (the deciding factor), though the oracle outcome itself is structurally stable.

## Confidence & caveats

- Confidence: medium. The winner is unambiguous on the recorded numbers (1.89x wall + 1.89x throughput, same correctness), and both adapters are verified-real with a real fixture. But three things soften it: (1) the gate is metadata-only (WEAK-GATE), so neither PASS proves bit-accurate quantization; (2) all benchmark samples are `n=1` (no variance, `mad=0`), so the 1.89x margin is single-shot; (3) both winning rows are cached, so the timing was reused rather than freshly measured. The ranking would not flip on correctness, but the size of the performance margin should be treated as indicative, not precise.
