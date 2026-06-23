# transcode/wav_to_vorbis_ogg

family: transcode | fixture asset: `fixtures/media/wav_s16.wav` (960 KB, real PCM s16 WAV) | primaryMetric: wall | passCount: 1/7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- Uncontested: only 1 of 7 engines reached PASS. The other 6 are NA (5 NA_ENGINE, 1 NA_BROWSER); none FAILed.
- Decisive factor: it is the only engine that both declares the `transcode` operation AND can actually encode the **Vorbis** audio codec into an **OGG** container. It does this through the vendored libvorbis muxer/encoder in the wasm core; every other engine either does not declare `transcode`, does not declare `ogg` output, or (mediabunny) routes encode through WebCodecs, which has no Vorbis `AudioEncoder` in Chrome 149.
- Margin over runner-up: N/A — no runner-up reached PASS, so there is no correctness or performance comparison to draw.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 65.285 ms | 76.587 x-realtime | 0 (not sampled) | 5077 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false) |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ogg' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ogg' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a lossy audio encode: decode PCM s16 from a RIFF/WAV container and re-encode to **Vorbis** packets muxed into an **OGG** bitstream, at a requested 128 kbps (scenario `src/scenarios/transcode/index.ts:1065-1073`, `opts: { container: 'ogg', audio: { codec: 'vorbis', bitrate: 128_000 } }`). This is precisely the kind of work that needs a full software audio encoder plus an Ogg page muxer — not a demux/parse-only library, and not a WebCodecs pass-through.

ffmpeg.wasm uses a vendored single-thread FFmpeg core. The adapter's audio encode path (`src/engines/ffmpeg-wasm/adapter.ts:2461-2508`) maps the requested codec to a concrete software encoder via `audioEncoderName()` (`src/engines/ffmpeg-wasm/codecs.ts:352-354`), and the table at `codecs.ts:34-39` resolves `vorbis -> 'libvorbis'`. It then emits real ffmpeg CLI args: `-c:a libvorbis` (line 2472) and `-b:a 128000` (line 2505), writing to an `.ogg` output name, after which it reads back the encoded bytes. The vendored core was built with libvorbis (header comment `codecs.ts:10`), so this is a genuine libvorbis encode + libogg mux, not a copy or a stub. The bench shows wall median 65.285 ms at 76.587x realtime — physically consistent with encoding a ~12 s / 960 KB PCM clip in a wasm core; the 5077 ms longtasks figure reflects the (untimed) core load/JIT and warm-up, not the measured encode wall.

The gating oracle is `property-invariant` with the `transcode-output-metadata` arm (`src/core/oracles.ts:3626-3708`, dispatched at `oracles.ts:2650-2651`). This is not a smoke gate: it re-probes the produced bytes through an independent reference engine (`ctx.referenceEngine.probe`, line 3641), then asserts (a) the muxed container equals the requested `ogg` (line 3655), (b) exactly one audio track is present matching the requested audio shape (lines 3692-3700, `compareRequestedTrack`), and (c) the output duration stays within tolerance of the source. The shard measurements confirm real, plausible numbers: `audioTracks: 1`, `durationDeltaSec: 0.004` against `durationToleranceSec: 0.12`. A 4 ms duration delta means the libvorbis encode preserved the program length to within a few samples — exactly what a correct PCM->Vorbis transcode should do, with the 0.12 s band only loosened to absorb lossy encoder priming/padding (`index.ts:1106-1108`).

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_BROWSER, honest. Its encode path delegates to WebCodecs `AudioEncoder`, and Chrome 149 returns `isConfigSupported=false` for `vorbis` (no Vorbis encoder is exposed to WebCodecs). The capability gate correctly refused rather than faking output. This is a true runtime limitation, not an under-declaration.
- **platform@chrome-149** — NA_ENGINE: does not declare output container `ogg`. The platform (MediaRecorder/WebCodecs+muxer) path has no Ogg muxer, so the scenario's `containersOut: ['ogg']` requirement is unmet. Honest.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare output container `ogg`. Same container-muxer gap as platform; its WebCodecs-based encode targets MP4/WebM only. Honest.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare the `transcode` operation at all. It is a demux-only library; declaring transcode would be a false capability. Honest.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare `transcode`. It is a parser/metadata engine with no encoder. Honest.
- **mp4box@2.3.0** — NA_ENGINE: does not declare `transcode` (and is MP4-only besides). No encoder, no Ogg muxer. Honest.

## Anti-cheat validation

- Scenario: `src/scenarios/transcode/index.ts:1065-1073` (id `wav_to_vorbis_ogg`), built by `audioEncodeScenarios` at `index.ts:1089-1109`.
- Fixture: `asset: 'wav_s16.wav'` -> `fixtures/media/wav_s16.wav` exists, 960 KB real PCM s16 WAV. Not synthetic/empty/mock.
- Winner adapter: real encode path at `src/engines/ffmpeg-wasm/adapter.ts:2461-2508` (`-c:a libvorbis`, `-b:a 128000`), codec map `src/engines/ffmpeg-wasm/codecs.ts:34-39,352-354`. Calls the real wasm FFmpeg core via `this.run(...)` and `readBinary(outName)`; no canned output, no input->output copy, no short-circuit to a golden, no swallowed error reported as success.
- Oracle: `src/core/oracles.ts:3626-3708` re-probes the produced bytes through an independent reference engine and asserts container=ogg, audioTracks=1, and duration within tolerance. Measurements (`audioTracks:1`, `durationDeltaSec:0.004` vs `durationToleranceSec:0.12`) are physically plausible for a real PCM->Vorbis encode.
- Cached note: this PASS has `cached: true` ("cached previous PASS result"). Evidence is a reused prior run, not a fresh re-execution this batch, so there is mild staleness risk; per launcher caveat a fresh run would clear the cache for an honest re-measure.
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the oracle does a genuine independent re-probe, but the gate is a metadata/property invariant (container + track count + loose duration band), not a decoded-PCM bit-exact or golden-packet comparison. It proves a valid Vorbis-in-OGG file with correct shape and length was produced; it does not prove the audio samples themselves are faithful. PASS is real but not at the top of the correctness ladder.

## Confidence & caveats

- Confidence: high on the winner selection — only one engine is even eligible, and the win is structural (capability), not a close metric race.
- The five NA_ENGINE declarations and the one NA_BROWSER are all consistent with each engine's true capabilities (demux-only parsers, MP4-only mp4box, no WebCodecs Vorbis encoder), so no under-declared capability was hidden.
- peakMemory was not sampled (n=0); longtasks (5077 ms) is dominated by untimed core warm-up, so only wall/throughput are meaningful, and both come from n=1 (single sample, mad=0) — adequate for a capability verdict but thin for performance claims.
- Caveat: cached==true means the PASS was reused; a clean re-run is advisable before treating the timing as current.
