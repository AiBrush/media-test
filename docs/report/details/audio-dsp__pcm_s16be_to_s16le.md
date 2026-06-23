# audio-dsp/pcm_s16be_to_s16le

- Family: audio-dsp | Fixture asset: `fixtures/media/pcm_s16be.aiff` (960 KB, AIFF, pcm-s16be) | Output: WAV pcm-s16 (pcm_s16le) | primaryMetric: wall | passCount: 1/7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- **Uncontested** — exactly one engine reached status=PASS. The other 6 engines are all NA_ENGINE (capability-gated out before any oracle ran).
- Decisive factor: ffmpeg.wasm is the only engine that declares BOTH the `transcode` operation AND the `aiff` input container. Every other engine was filtered by the capability registry: 3 lack `transcode`, 3 lack the `aiff` input container.
- Margin over runner-up: not applicable — there is no second PASS engine, so there is no performance race. ffmpeg.wasm's measured numbers stand alone (wall median 10.34 ms, 483.6x realtime, peak 35.3 MB, longtasks 4223 ms).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 10.34 ms | 483.559 x | 35,290,545 B | 4223 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is an endianness flip plus container rewrap: decode 16-bit big-endian PCM samples out of an AIFF (`FORM…AIFF`, COMM + SSND chunks, samples stored MSB-first) and re-emit them as 16-bit little-endian PCM inside a RIFF/WAVE container (`data` chunk, samples LSB-first). No resampling, no lossy codec — the only correctness risk is a silent endianness bug (bytes copied through without the per-sample swap), which is exactly what the scenario `notes` says it guards: "Big-endian(AIFF) -> little-endian(WAV) byte-swap; exact. Guards silent endianness bugs." (src/scenarios/audio-dsp/index.ts:254-261).

ffmpeg.wasm wins because it is the only adapter wired to actually perform this conversion. The transcode entry point (src/engines/ffmpeg-wasm/adapter.ts:2165) builds a real ffmpeg argv: the audio branch maps the requested output codec `pcm-s16` to the ffmpeg encoder token `pcm_s16le` via `audioEncoderName` (src/engines/ffmpeg-wasm/codecs.ts:40, `'pcm-s16': 'pcm_s16le'`) and pushes `-c:a pcm_s16le` (adapter.ts:2468-2472), then writes the WAV output and invokes the vendored wasm core with `await this.run(args)` (adapter.ts:2527-2528) before reading the produced bytes back (`readBinary`, adapter.ts:2529). This is the genuine libavcodec PCM decode/encode path running in WebAssembly: ffmpeg's AIFF demuxer reads the COMM sample-size/rate, decodes pcm_s16be to internal samples, and the pcm_s16le encoder writes them LSB-first into the WAV `data` chunk — the byte swap is done inside libavcodec's sample-format conversion, not faked at the adapter level. The adapter defaults to the single-thread wasm core (adapter.ts:10 comment: "default this adapter to the single-thread core" to avoid COOP/COEP/SharedArrayBuffer fragility), so this PASS does not depend on cross-origin isolation.

The gating oracle is `property-invariant` with invariant `transcode-output-metadata` (scenario sets `options.invariant: 'transcode-output-metadata'`, src/scenarios/audio-dsp/index.ts:305; oracle body at src/core/oracles.ts:3631-3708). It re-probes the produced bytes through the reference engine (oracles.ts:3641), with an AIFF byte-parser fallback (oracles.ts:3643-3650, parseAiffMetadata at oracles.ts:3710), then asserts: (1) output container matches the requested `wav`; (2) the produced duration is within tolerance of the golden source duration; (3) an audio track exists matching the requested shape. The shard measurements are physically consistent with a clean PCM rewrap: `durationDeltaSec: 0` against `durationToleranceSec: 0.0417` (= 1/24 s ≈ one frame at 24fps band), and `audioTracks: 1`. A zero duration delta is exactly what a lossless sample-for-sample PCM conversion should yield, and the detail string confirms the container resolved to `wav` with 1 track.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE, "engine does not declare input container 'aiff'". Honest NA: mediabunny's registry input-container set does not include AIFF, so the runner gated it before the op. mediabunny supports transcode broadly but genuinely lacks an AIFF demuxer, so this is an honest capability gap, not an under-declaration.
- **platform@chrome-149** — NA_ENGINE, "engine does not declare input container 'aiff'". Honest: the browser WebCodecs/MediaSource platform path has no AIFF container parser; AIFF is not a web-native container. Correct to gate out.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "engine does not declare input container 'aiff'". Honest: same root cause — its demux relies on web container parsers that exclude AIFF.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: media-parser is a read/probe/parse library, not an encoder; declining `transcode` is correct, not an under-declaration.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: mp4box is an ISOBMFF box parser/segmenter with no PCM decode/encode pipeline; declining transcode is correct. (It also could not read AIFF.)
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: web-demuxer only demuxes/extracts packets; it has no encoder, so transcode is genuinely out of scope.

All six NAs look honest: three are op-level (transcode not implemented), three are container-level (no AIFF demuxer). None resemble an under-declared capability that should have been tried.

## Anti-cheat validation

- Scenario: src/scenarios/audio-dsp/index.ts:254-261 (`id: 'pcm_s16be_to_s16le'`, `asset: 'pcm_s16be.aiff'`, `container: 'aiff'`, `outContainer: 'wav'`, `opts.audio.codec: 'pcm-s16'`, `bitReproducible: true`).
- Fixture: `fixtures/media/pcm_s16be.aiff` EXISTS — real 960 KB AIFF file (not synthetic/empty/mock). Goldens present: `fixtures/golden/pcm_s16be.aiff.meta.json`, `fixtures/golden/pcm_s16be.aiff.packets.json`.
- Oracle: `property-invariant` / `transcode-output-metadata` at src/core/oracles.ts:3631-3708. It re-probes produced output, compares container + duration (Δ vs tolerance) + audio-track shape. Measurements in shard (`durationDeltaSec:0`, `durationToleranceSec:0.0417`, `audioTracks:1`) are plausible for a lossless PCM rewrap.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2165 (transcode), :2468-2472 (`-c:a pcm_s16le`), :2527-2529 (real `this.run(args)` + `readBinary`); codecs.ts:40 (`pcm-s16` -> `pcm_s16le`). No canned output, no input->output copy, no golden short-circuit, no error swallowing — it spawns the real wasm ffmpeg and reads back the encoded bytes.
- Verdict: **WEAK-GATE**. The implementation and fixture are real, but the gating oracle is a metadata/property invariant, NOT a bit-exact PCM digest. The scenario is flagged `bitReproducible: true` and its whole purpose is to "guard silent endianness bugs" — yet the suite comment (index.ts:288-292) admits "the current suite has no decoded-PCM oracle" and `bitReproducible` "does not drive a guaranteed-failing oracle today." So a buggy engine that copied big-endian bytes through without swapping (wrong samples but right container/duration/track-count) would STILL PASS this gate. The PASS is real (ffmpeg genuinely does the swap) but the oracle does not actually verify the endianness flip it claims to test.
- Cached note: ffmpeg.wasm result has `cached: true` ("cached previous PASS result"). Numbers were reused, not re-run this session — minor staleness risk on the bench values, though the PASS verdict is stable given the deterministic PCM path.

## Confidence & caveats

- Confidence: high on the verdict (uncontested 1-PASS; 6 honest NAs verified against reasons). The winner is unambiguous.
- Caveat 1: the gate is a property/metadata invariant, not a bit-exact PCM comparison, so correctness STRENGTH is weak for a scenario explicitly about endianness exactness — see WEAK-GATE above.
- Caveat 2: bench values are cached (n=1, mad=0, single sample) — weak performance evidence, but irrelevant here since there is no contest.
- Caveat 3: longtasks (4223 ms) is large relative to the 10.34 ms wall median; this reflects wasm core init/warm-up main-thread blocking rather than the conversion itself, and has no competitor to compare against.
