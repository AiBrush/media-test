# mux/pcm_f32_to_wav

- **Family:** mux
- **Fixture asset:** `fixtures/media/wav_f32.wav` (1.9 MB, real RIFF/WAVE WAVE_FORMAT_IEEE_FLOAT, 48 kHz stereo, 5.000 s, pcm-f32)
- **Operation:** demux pcm-f32 from a WAV source, then `mux(tracks, {container:'wav'})` — author a fresh RIFF header + `data` chunk targeting WAV (the only writeable PCM container).
- **Primary metric:** throughputRealtime (x-realtime); secondary wall median
- **passCount:** 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (2 engines PASS).
- **Decisive factor:** PERFORMANCE. Correctness is a tie — both passing engines satisfy the identical single oracle (`property-invariant` / probe-duration) with the same exact measurement (Δ 0.0000 s ≤ 0.0417 s). Mediabunny wins on throughput.
- **Margin over runner-up (ffmpeg-wasm):** **5.88x faster wall** (18.29 ms vs 107.66 ms) and **5.88x higher realtime throughput** (273.30x vs 46.44x). Both samples are n==1, so the magnitude is single-shot evidence; the direction is unambiguous (a ~6x gap far exceeds any plausible single-run jitter). Caveat: mediabunny reports a much larger `longtasks` figure (4531 ms vs 173 ms) and 96.5 MB peak memory vs ffmpeg's 0 (unmeasured).

## Per-engine results

| Engine | Status | Oracles passed | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | property-invariant:true | 18.29 ms | 273.30x | 96,486,299 B | 4531 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 107.66 ms | 46.44x | 0 (unmeasured) | 173 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

## Why the winner wins (deep technical)

This scenario authors a WAV (RIFF) container around 32-bit IEEE-float PCM. The fmt-chunk authoring is non-trivial: WAVE_FORMAT_IEEE_FLOAT (format tag 0x0003, or WAVE_FORMAT_EXTENSIBLE with the float sub-GUID) is a different code path from integer PCM (0x0001), and `wBitsPerSample=32` / `nBlockAlign = channels*4` / `nAvgBytesPerSec` must be written correctly, then the bulk float samples copied verbatim into the `data` chunk. The golden (`fixtures/golden/wav_f32.wav.meta.json`) describes the target: container wav, pcm-f32, 48000 Hz, 2 ch, bitrate 3,072,000, duration 5 s.

**Mediabunny's path.** The adapter packs the already-demuxed encoded PCM packets through the real library mux pipeline: `src/engines/mediabunny/adapter.ts:1508` `mux()` constructs `makeOutputFormat('wav')`, an `Output` over a `BufferTarget` (`adapter.ts:1513-1514`), creates an `EncodedAudioPacketSource(canonicalToMediabunnyAudio('pcm-f32'))` and `output.addAudioTrack(...)` (`adapter.ts:1537-1540`), then `output.start()` and re-emits each demuxed packet as an `EncodedPacket` carrying its original PTS/duration (`adapter.ts:1553-1566`). The WAV fmt/data chunks are emitted by mediabunny's native `WavOutputFormat` writer. This is pure-TypeScript ESM with **no WASM and no worker** — the env confirms `backend: "webcodecs"`, `coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`, `wasmThreads: 0`. For an audio-only PCM repack there is no decode/encode — it is a direct in-JS byte copy of the sample data plus header authoring, which is why it runs in **18.29 ms at 273.30x realtime**.

**The oracle that gates both.** `property-invariant` resolves to the probe-duration branch (`src/core/oracles.ts:2709-2758`): with no explicit golden frames it probes the authored output through the reference engine, compares its duration to the golden duration, and gates on a container-keyed tolerance. The shard measurements are `outDurationSec: 5, goldenDurationSec: 5, deltaSec: 0, durationToleranceSec: 0.04166…` — i.e. the authored WAV materialized exactly 5.000 s of float PCM (the correct sample count), so the band (≈±1 frame at the working frame rate) is satisfied with a perfect Δ of 0. This is a structural/metadata-exact gate (it verifies the materialized sample count via duration), one rung below bit-exact but well above smoke. Both engines tie here because both author a structurally correct, full-length WAV.

**Why mediabunny beats ffmpeg-wasm.** ffmpeg.wasm also genuinely muxes (`src/engines/ffmpeg-wasm/adapter.ts:2899` `mux()`): it materializes each track as an elementary stream (`buildElementaryStream`, `adapter.ts:2919`), writes it into the wasm FS, then runs a real `-i … -map … -c copy -avoid_negative_ts make_zero <out>.wav` exec (`adapter.ts:2925-2941`). That is correct but pays the WASM tax: single-threaded wasm module dispatch, virtual-FS writeFile/readBinary round-trips, and process-style argv exec overhead. The result is **107.66 ms / 46.44x** — a 5.88x slowdown versus mediabunny's in-process byte copy. ffmpeg's lower longtasks (173 ms vs mediabunny's 4531 ms) reflects that its heavy work happens inside the wasm exec rather than on the JS main thread, but it does not change the throughput verdict, which is what the primary metric rewards.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed correctly (same oracle, Δ 0 s) but lost on performance: 5.88x slower wall (107.66 ms vs 18.29 ms) and 5.88x lower realtime throughput, due to single-thread wasm dispatch + virtual-FS I/O for a job that is fundamentally a header-write plus sample copy.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — remotion-webcodecs is a transcode/convert layer over WebCodecs, not a packet-level muxer; it never advertises the `mux` op.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — it is a read-only parser; no write/author path exists.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — name and scope are demux-only.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — the raw browser platform exposes WebCodecs decode/encode but no RIFF/WAV container writer.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'wav'". Honest — mp4box is an ISO-BMFF (MP4/MOV) box engine; it cannot ingest a RIFF/WAVE source, so it cannot demux the pcm-f32 input to feed mux.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/mux/write-targets.ts:96-105` — `id: 'pcm_f32_to_wav'`, `input: 'wav_f32.wav'`, `to: 'wav'`, `audioCodecs: ['pcm-f32']`. Notes: "WRITE TARGET wav (§A.3): 32-bit float PCM → WAV (WAVE_FORMAT_IEEE_FLOAT). Float-format fmt-chunk authoring distinct from integer PCM." Gating rationale is real and codec-specific.
- **Fixture exists:** `fixtures/media/wav_f32.wav` present, 1.9 MB — a real, non-empty media file (not synthetic/mock). Golden `fixtures/golden/wav_f32.wav.meta.json` confirms wav/pcm-f32/48000/2ch/5 s.
- **Oracle:** `src/core/oracles.ts:2709-2758` (property-invariant → probe-duration branch). It performs a real reference-engine probe of the authored output and compares to the golden duration with a tight container-keyed band; measurements (outDur 5, goldenDur 5, Δ 0, tol 0.04167) are physically plausible for a real 5 s 48 kHz stereo float WAV. Not trivially satisfiable: a truncated/header-only/copied-input output would not probe to exactly 5 s.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1508-1566` — genuine library mux via `Output` + `EncodedAudioPacketSource` + `BufferTarget`; no canned bytes, no input→output copy shortcut, no golden short-circuit, no swallowed errors (unsupported codec/format throw). Capability `mux:true` and `containersOut` includes 'wav' (`adapter.ts:1030,1039`).
- **Verdict:** **REAL** — real fixture + real library implementation + meaningful structural (duration/sample-count) oracle.
- **Cached note:** Both PASS rows have `cached:true` ("cached previous PASS result"). Evidence was reused, not freshly re-run, so there is mild staleness risk; per the launcher seeding caveat, a truly fresh run would require clearing raw + .browser-cache. The result is internally consistent and plausible, so confidence remains medium-high.

## Confidence & caveats

- Both passing engines share a **single** oracle (property-invariant probe-duration). This is a structural gate, not bit-exact PCM comparison — so "correct WAV authoring" is verified at the sample-count/duration level, not sample-value level. A bit-exact PCM oracle would be stronger evidence but is not run here.
- Performance samples are **n==1** with mad==0 (single shot), so the 5.88x margin is directionally certain but not statistically characterized.
- Both rows are **cached**; numbers reflect a prior run.
- ffmpeg-wasm's peakMemory is 0 (unmeasured), so the memory comparison is one-sided; mediabunny reports 96.5 MB. Mediabunny's 4531 ms longtasks is notable but does not affect the throughput-led ranking.
