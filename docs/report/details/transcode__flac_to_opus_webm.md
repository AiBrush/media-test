# transcode/flac_to_opus_webm

family: transcode | fixture asset: `flac_seektable.flac` (FLAC/lossless, ~143 KB) | primaryMetric: wall | passCount: 0

## Verdict

**Best framework: NONE.** No engine reached `status=="PASS"`. All 7 frameworks were gated out before producing any oracle outcome (`oracleOutcomes:[]` for every engine). This is an **uncontested non-result**: the operation FLAC(lossless) -> Opus(lossy) in WebM is not achievable by any of the 7 frameworks in this runtime (Chromium 149 on Apple M1 Max). Decisive factor: the source codec **FLAC cannot be decoded by Chrome's WebCodecs `AudioDecoder`** (`isConfigSupported=false`), which removes every WebCodecs-based transcoder, while the non-WebCodecs engines either do not declare the `transcode` operation or do not declare `flac` as an input container, and ffmpeg.wasm explicitly disowns reliable libopus encode. No margin to report (no winner, no runner-up).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | NA_BROWSER | none | - | - | - | - | browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false) |
| remotion-webcodecs@4.0.479 | NA_BROWSER | none | - | - | - | - | browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false) |
| platform@chrome-149 | NA_ENGINE | none | - | - | - | - | engine does not declare input container 'flac' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | none | - | - | - | - | transcode not applicable: libopus encode in vendored wasm core traps or exceeds timeout; Opus encode not declared a reliable transcode path (durationMs 115) |
| mp4box@2.3.0 | NA_ENGINE | none | - | - | - | - | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | none | - | - | - | - | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | none | - | - | - | - | engine does not declare operation 'transcode' |

No bench block was emitted for any engine (none ran), so all perf columns are empty. The only timing present is ffmpeg.wasm's `durationMs:115` — that is the capability-negotiation/short-circuit cost, not a transcode wall time.

## Why there is no winner (deep technical)

The pipeline required here is: demux FLAC -> decode FLAC to PCM -> encode PCM to Opus -> mux Opus into WebM/Matroska. The whole chain is gated at the **decode-FLAC** step for the WebCodecs engines and at **declaration** for the rest.

1. **WebCodecs has no FLAC audio decoder in Chrome 149.** Both `mediabunny@1.48.0` and `remotion-webcodecs@4.0.479` are WebCodecs-driven audio transcoders: they obtain PCM by feeding FLAC `EncodedAudioChunk`s to an `AudioDecoder`. The runner probes this at `src/core/runner.ts:288` (`browser cannot decode audio codec '<ac>' (WebCodecs AudioDecoder.isConfigSupported=false)`). Chrome ships FLAC *demuxing/probe* support but **not** a FLAC `AudioDecoder` config that returns `supported:true`, so the probe returns NA_BROWSER before any frame is touched. This is an honest runtime-capability gate (NA_BROWSER, not FAIL): the engines are correctly declared as *capable in principle* but the browser lacks the codec, so the suite must not penalize them as a defect. The Opus *encoder* (the target) is fully present in Chrome WebCodecs — the failure is purely on the source side.

2. **platform@chrome-149 does not accept FLAC as an input container.** The platform engine wraps `MediaRecorder`/`<audio>`/`<video>` element decode + canvas/Recorder encode; it advertises only container inputs the media element pipeline can demux for transcode. FLAC-in-FLAC is not in its `containersIn`, so the registry rejects it at `src/core/runner.ts:124` (`engine does not declare input container 'flac'`). This is a correct under-the-hood reflection that the platform path cannot drive a FLAC source into a Recorder-based encode.

3. **ffmpeg.wasm@0.12.15 disowns reliable Opus encode.** ffmpeg.wasm *could* decode FLAC (it has the native FLAC decoder in the wasm core, so it is not browser-gated), but its adapter declares that the vendored single-thread wasm core's **libopus encoder traps or exceeds the suite timeout**. Rather than emit a fake/timed-out transcode, it returns NA_ENGINE with `durationMs:115` (the negotiation cost). The reason string is explicit that "Opus encode is not declared as a reliable transcode path." This is a deliberate, honest declaration of a flaky encode target, not a silent failure.

4. **mp4box, remotion-media-parser, web-demuxer do not implement `transcode` at all.** These three are parser/demuxer libraries (mp4box = ISO-BMFF box parser; remotion-media-parser = read-only container parser; web-demuxer = ffmpeg-wasm-backed *demuxer*). None registers the `transcode` operation in its capability descriptor, so the registry returns NA_ENGINE at `src/core/runner.ts` operation check (`engine does not declare operation 'transcode'`). These NAs are honest: a demuxer has no encoder, so claiming transcode would itself be a cheat.

The net mechanistic story for this specific codec/container: **the lossy re-encode target (Opus/WebM) is universally available, but the lossless source (FLAC) is the bottleneck** — Chrome WebCodecs can't decode it, the platform element pipeline won't accept it, and the only engine with a native FLAC decoder (ffmpeg.wasm) has an unreliable Opus encoder. There is no path from FLAC bytes to Opus packets in this matrix.

## What each framework did wrong

- **mediabunny@1.48.0** — NA_BROWSER. Correct, honest gate: it declares `transcode:true` (`src/engines/mediabunny/adapter.ts:1026`) but relies on WebCodecs `AudioDecoder` for FLAC, which Chrome 149 reports `isConfigSupported=false` (`src/core/runner.ts:288`). Not a defect; a missing browser codec.
- **remotion-webcodecs@4.0.479** — NA_BROWSER. Same WebCodecs FLAC-decode gate; honest. Its entire pipeline is WebCodecs, so no fallback exists.
- **platform@chrome-149** — NA_ENGINE (`engine does not declare input container 'flac'`, `src/core/runner.ts:124`). Honest: the MediaRecorder/element path has no FLAC demux for transcode input.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE. The one engine that could decode FLAC, but it self-declares libopus encode as unreliable (traps/timeouts) and refuses rather than emitting a bogus output. Honest, conservative declaration; arguably the only engine that *might* be coaxed into the op with a different/multithread wasm core, so this is the closest to an under-declaration — but the stated trap/timeout rationale makes the NA defensible.
- **mp4box@2.3.0** — NA_ENGINE (`does not declare operation 'transcode'`). Honest: it is a box parser, no encoder.
- **remotion-media-parser@4.0.479** — NA_ENGINE (`does not declare operation 'transcode'`). Honest: read-only parser.
- **web-demuxer@4.0.0** — NA_ENGINE (`does not declare operation 'transcode'`). Honest: a demuxer, no encode stage.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:1034-1043` (id `flac_to_opus_webm`), built into a scenario at `src/scenarios/transcode/index.ts:1089-1111`. Op `transcode`, input `flac_seektable.flac`, fromContainer/Audio `flac`, toContainer `webm`, toAudio `opus`, `opts.audio.codec='opus' bitrate=128000`. Oracles = `property-invariant` + `playback-smoke` (WebM is browser-playable, `src/scenarios/transcode/index.ts:1090-1092`). A lossy-priming duration tolerance is applied (`TC_AUDIO_PRIMING_TOLERANCE_SEC`, line 1108).
- **Fixture existence:** `fixtures/media/flac_seektable.flac` exists, ~143 KB — a real, non-empty FLAC file with a seektable (matching goldens `fixtures/golden/flac_seektable.flac.meta.json` and `.packets.json`). Not synthetic/mock. The source input is genuine.
- **Oracle:** `property-invariant` + `playback-smoke` in `src/core/oracles.ts`. These would be the gating oracles *if any engine ran* — note this is an **output-format/smoke gate**, not a bit-exact correctness gate (the scenario notes say "Output-format gate; playback-smoke ok (WebM)"). FLAC->Opus is lossy so a strong decoded-PCM bit-exact oracle is intentionally not used. This does not affect the verdict here because no engine produced output to evaluate.
- **Capability gates:** `src/core/runner.ts:288` (audio-decode WebCodecs probe) and `src/core/runner.ts:123-125` (containersIn declaration) — both real negotiation, not hardcoded skips.
- **Winner adapter:** N/A — there is no winner.
- **cached:** No engine entry carries `cached:true`; ffmpeg.wasm carries `startedAtIso` and `durationMs:115`, the rest are pure declaration-time NAs. No staleness risk.
- **Verdict: REAL.** Real fixture, real capability negotiation, honest NA reasons that map exactly to the known Chrome WebCodecs FLAC-decode gap and to genuine engine non-implementation. There is no winner to cheat with, and no engine faked a transcode. The "no winner" outcome is a true reflection of the FLAC-source bottleneck.

## Confidence & caveats

High confidence on the NONE verdict and on the gating mechanics — all 7 reasons are physically consistent (Chrome lacks a FLAC `AudioDecoder`; demuxers/parsers have no encoder; platform has no FLAC input). Caveats: (1) the would-be gating oracles are output-format/smoke level, so even if an engine ran this is a WEAK gate scenario by design (lossy transcode) — relevant only for future runs where an engine gains a FLAC-decode path. (2) ffmpeg.wasm's NA is the one borderline case: it has a native FLAC decoder and could plausibly encode Opus with a multithreaded/COOP-COEP wasm core, so its NA is a conservative self-declaration rather than a hard impossibility; if a reliable libopus-in-wasm path were adopted it could become the sole eligible engine. (3) Verdict assumes Chromium 149's WebCodecs FLAC-decode support stays absent; a future Chrome adding `AudioDecoder` FLAC support would flip mediabunny/remotion-webcodecs to runnable.
