# audio-dsp/pcm_s16le_to_s16be

family: audio-dsp | fixture asset: `wav_s16.wav` (RIFF/WAVE, Microsoft PCM, 16-bit, stereo, 48000 Hz, 960 KB) | primaryMetric: wall (ms) | passCount: 1 / 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **Uncontested.** Exactly one engine reached `status=PASS`; the other six are `NA_ENGINE`.
- **Decisive factor:** ffmpeg.wasm is the only engine that declares BOTH the `transcode` operation AND `aiff` as an output container. The conversion `pcm_s16le` (WAV) -> `pcm_s16be` (AIFF) requires writing an AIFF FORM/COMM/SSND container with a big-endian PCM payload, which is exactly the capability the other engines lack.
- **Margin over runner-up:** none meaningful to compute -- every other engine is NA (operation or container not declared), so there is no second PASS to rank against. ffmpeg.wasm completed in wall median 29.64 ms at 168.69x realtime.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 29.64 ms | 168.69x | 0 (n=0) | 234 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'aiff' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Note: `peakMemory` has `samples:[]` / `n:0` (not measured on this run); the value 0 is an absence, not a measurement. `wall`, `throughputRealtime`, and `longtasks` are all `n=1` (single sample, `mad=0`, p95==median) -- weak statistical evidence, but the win is by eligibility, not by speed.

## Why the winner wins (deep technical)

The operation is a pure-PCM, cross-container, cross-endianness byte-swap transcode: source is a little-endian 16-bit RIFF/WAVE stream (`pcm_s16le`, 48 kHz stereo) and the target is a big-endian 16-bit AIFF stream (`pcm_s16be`). There is no perceptual codec in the loop -- the work is (1) demuxing the WAV `data` chunk, (2) re-emitting each 16-bit sample with swapped byte order, and (3) wrapping it in the AIFF `FORM`/`COMM`/`SSND` chunk layout with an 80-bit IEEE-extended sample rate. Two declared capabilities are required at once: the `transcode` op and an `aiff` output container.

ffmpeg.wasm is the only adapter that satisfies both. Its capability surface lists `aiff` in `FALLBACK_CONTAINERS_OUT` (`src/engines/ffmpeg-wasm/adapter.ts:187`), and `transcode: true` is declared in its capability descriptor (`src/engines/ffmpeg-wasm/adapter.ts:1459` / `:1739`). The concrete code path: `transcode()` (`src/engines/ffmpeg-wasm/adapter.ts:2165`) builds the output name with `containerExt('aiff')` (`:2202`), runs `ffmpeg -i` on the written WAV input, then in the audio branch (`:2461-2505`) resolves the encoder via `audioEncoderName('pcm-s16be')`. The codec map returns `pcm_s16be` (`src/engines/ffmpeg-wasm/codecs.ts:43`, used at `:352`), so the spawned command is effectively `ffmpeg -i in.wav -map 0 -c:a pcm_s16be out.aiff`. The vendored single-thread wasm core (chosen deliberately for stability per the adapter header comment at `:5-10`) muxes the big-endian PCM into a real AIFF FORM container; the bytes returned carry `mime: containerMime('aiff')` and `container: 'aiff'` (`:2258`/end of branch). This is a genuine library invocation -- no copy-through, no canned blob.

The gating oracle is `property-invariant` with the `transcode-output-metadata` sub-check (`src/core/oracles.ts:2650-2651` dispatch -> `transcodeOutputMetadataInvariant` at `:3626`). It does not trust the engine's self-report: it reference-probes the produced bytes (`ctx.referenceEngine.probe(...)`, `:3641`), with a hardened AIFF fallback parser `parseAiffMetadata` (`:3643-3649`, `:3710+`) that actually reads the `FORM`/`AIFF` magic, the `COMM` chunk channels/sampleFrames/sampleSize and the 80-bit extended sample rate. It then asserts (a) the probed container equals the requested `aiff` (`:3655`), (b) duration is preserved within a derived tolerance (`:3659-3680`), and (c) the requested audio track shape is present (`:3692-3700`). The recorded measurements are physically consistent with the fixture: `audioTracks=1`, `durationDeltaSec=0` against `durationToleranceSec=0.041667` (i.e. exactly preserved, well inside ~1/24 s), confirming a real WAV->AIFF round trip rather than an empty or truncated file. Throughput of 168.69x realtime is plausible for a memcpy-class PCM byte-swap of a ~5 s, 960 KB stereo clip in wasm.

## What each other framework did wrong

- **mediabunny@1.48.0 — NA_ENGINE (honest):** "engine does not declare output container 'aiff'". mediabunny's mux/transcode surface targets MP4/WebM/MP3/etc.; AIFF is not in its declared output containers, so the runner correctly returns NA rather than forcing a fabricated pass. Under-declaration is unlikely -- AIFF/big-endian PCM muxing is genuinely outside its writer set.
- **platform@chrome-149 — NA_ENGINE (honest):** "engine does not declare output container 'aiff'". The Chrome WebCodecs/MediaRecorder platform path cannot emit an AIFF container; no native muxer produces AIFF. Genuine capability gap.
- **remotion-webcodecs@4.0.479 — NA_ENGINE (honest):** "engine does not declare output container 'aiff'". Same WebCodecs-based muxer limitation; AIFF output is not wired.
- **remotion-media-parser@4.0.479 — NA_ENGINE (honest):** "engine does not declare operation 'transcode'". This is a parser/demuxer, not an encoder; it has no transcode op at all. Correct NA.
- **web-demuxer@4.0.0 — NA_ENGINE (honest):** "engine does not declare operation 'transcode'". Demux-only library; no encode/mux path. Correct NA.
- **mp4box@2.3.0 — NA_ENGINE (honest):** "engine does not declare operation 'transcode'". MP4Box handles ISOBMFF parsing/segmentation; it has no transcode op and could not write AIFF regardless. Correct NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/audio-dsp/index.ts:263-274` -- id `pcm_s16le_to_s16be`, `asset: 'wav_s16.wav'`, `container: 'wav'`, `outContainer: 'aiff'`, `opts: { container: 'aiff', audio: { codec: 'pcm-s16be' } }`, `bitReproducible: true`. Notes: "Little-endian(WAV) -> big-endian(AIFF) byte-swap; exact reverse of pcm_s16be_to_s16le." Oracle policy `conversionOracles()` (`:293-296`) returns `['property-invariant']` and the scenario tags `invariant: 'transcode-output-metadata'` (`:305`).
- **Fixture exists & is real:** `fixtures/media/wav_s16.wav` present, 960 KB; `file` reports "RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit, stereo 48000 Hz". A genuine little-endian 16-bit PCM source -- exactly the documented input. Not synthetic/empty/mock.
- **Winner adapter genuinely implements the op:** `src/engines/ffmpeg-wasm/adapter.ts:2165` (`transcode`), audio-encoder selection at `:2468-2472`, codec map `pcm-s16be -> pcm_s16be` at `src/engines/ffmpeg-wasm/codecs.ts:43`. Real `ffmpeg -i ... -c:a pcm_s16be out.aiff` against the vendored wasm core; output bytes read back from the wasm FS (`:2257-2258`). No hardcoded output, no input-copy short-circuit, no golden short-circuit, no error swallowing (errors throw/propagate; NA paths use `NotApplicableError`).
- **Oracle is a real comparison, not trivially satisfiable:** `transcodeOutputMetadataInvariant` (`src/core/oracles.ts:3626`) re-probes the produced bytes via the reference engine, with a real AIFF FORM/COMM parser fallback (`parseAiffMetadata`, `:3710+`) that decodes channels/sampleFrames/sampleSize/80-bit rate. It asserts container match, duration preservation within tolerance, and audio-track presence. Measurements (`durationDeltaSec=0`, `durationToleranceSec=0.041667`, `audioTracks=1`) are physically plausible for this clip.
- **Caveat (gate strength):** this is a metadata/property-invariant gate, NOT a bit-exact decoded-PCM digest. The `bitReproducible: true` flag is documentation for a future PCM-digest oracle (see `src/scenarios/audio-dsp/index.ts:288-296`); it does not currently verify the actual byte-swap sample values. So the PASS proves "correct AIFF container + 1 audio track + preserved duration," not "every sample byte-swapped correctly."
- **Cached note:** the winner's result has `cached:true` ("cached previous PASS result"). Numbers were reused, not re-run this cycle -- mild staleness risk, but the implementation and fixture inspected here are current and consistent.
- **Verdict: WEAK-GATE.** Real fixture + real ffmpeg.wasm implementation + a real (re-probed) oracle, but the gate is a metadata/duration property-invariant rather than a bit-exact PCM comparison, so it is a genuine-but-not-strong correctness signal.

## Confidence & caveats

- Confidence: **high** on the winner selection (only 1 PASS; the 6 NAs are all honest capability gaps verified against adapter declarations) and on the anti-cheat verdict (fixture, adapter, and oracle code all inspected).
- Caveats: (1) PASS evidence is a single sample (`n=1`, `mad=0`) and `cached:true`; (2) `peakMemory` was not measured (`n=0`); (3) the gate is metadata-level, not bit-exact, so a silent endianness bug in the SSND payload could in principle still pass -- the strongest possible gate for this scenario is not yet wired.
