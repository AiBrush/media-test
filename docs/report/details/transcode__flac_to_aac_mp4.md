# transcode/flac_to_aac_mp4

- family: transcode
- fixture asset: `fixtures/media/flac_seektable.flac` (143 KB, exists)
- primaryMetric: wall
- passCount: 1 of 7

## Verdict

- best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`)
- **uncontested** — exactly one engine reached PASS. The other six are NA (no FAILs).
- decisive factor: FFmpeg's compiled-in software FLAC decoder + native AAC encoder is the only code
  path in the suite that can both *decode FLAC* (Chrome WebCodecs cannot) and *transcode to AAC/MP4*.
  Every other engine either lacks a transcode operation or cannot decode FLAC in the browser runtime.
- margin over runner-up: N/A (no second PASS). Absolute performance: wall median 282.78 ms,
  throughputRealtime 35.36x, longtasks 5478 ms, n=1.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | 282.78 ms | 35.36x | 0 (not sampled) | 5478 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_BROWSER | — | — | — | — | — | browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false) |
| remotion-webcodecs@4.0.479 | NA_BROWSER | — | — | — | — | — | browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false) |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |

## Why the winner wins (deep technical)

The operation is a full audio re-encode: demux FLAC (lossless, native `.flac` container with a seektable),
*decode* the FLAC frames to PCM, then *encode* to AAC-LC and *mux* into an MP4 with `-movflags +faststart`,
at a target bitrate of 256 kbps (`opts.audio = { codec: 'aac', bitrate: 256000 }`, see
`src/scenarios/transcode/index.ts:384-391`). This requires a real FLAC decoder AND a real AAC encoder
inside the browser. That combination only exists in the FFmpeg wasm core.

ffmpeg.wasm runs a single genuine FFmpeg invocation. The transcode path
(`src/engines/ffmpeg-wasm/adapter.ts:2165`) writes the real fixture bytes to the wasm FS
(`writeInput`, line 2203), probes it via `runInfo` (line 2206), then builds the argv `[...inputOptions,
'-i', written.name, '-map', '0']` (line 2271). The audio branch (lines 2461-2505) resolves the encoder
through `audioEncoderName('aac') -> 'aac'` (FFmpeg's native AAC encoder; `codecs.ts:35`,`183-184`,`352`)
and appends `-c:a aac` (line 2472) plus `-b:a 256000` (line 2505). For the MP4 target it adds
`-movflags +faststart` (lines 2517-2522), then `args.push(outName)` and `await this.run(args)` (lines
2527-2528) — a real `ff.exec` of the vendored single-thread core (`run()` at line 1819). There is no
copy-through, no canned blob, and no short-circuit to the golden; the output is read back from the wasm
FS with `readBinary(outName)` (line 2529). The codec table comments explicitly note "FFmpeg native AAC
(no fdk-aac in the build)" (`codecs.ts:35`), consistent with a real software encode rather than a stub.

Backend: the adapter pins the single-thread core `@ffmpeg/core` (configUsed `coreBuild:"st"`), recorded
in the header comment at `adapter.ts:8-20`, because the multi-thread core can throw opaque pthread/wasm
failures on Chromium 149 transcodes. This is why the longtasks figure is high (5478 ms of main-thread/worker
blocking) while wall is only 282.78 ms median over n=1 — the encode is CPU-bound single-thread wasm. Even
so it ran at 35.36x realtime for this short (~0.14 MB) FLAC clip.

The two passing oracles confirm the output shape, not bit-exactness. `property-invariant` here is the
`transcode-output-metadata` invariant (`oracles.ts:3626-3708`): it re-probes the produced bytes with the
reference engine and checks container == `mp4`, duration within tolerance, and that the requested
audio track exists. Measurements: `durationDeltaSec:0`, `durationToleranceSec:0.12`, `audioTracks:1` —
i.e. exactly one AAC audio track, zero duration drift against the source within the 0.12 s priming band
(`TC_AUDIO_PRIMING_TOLERANCE_SEC`, applied because the case is not `lossless`). `playback-smoke`
(`oracles.ts:1574-1577`) then loads the MP4 in a real `<video>` and confirms it plays, proving the AAC/MP4
bitstream is actually decodable by Chrome's native pipeline.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_BROWSER, honest. It is a WebCodecs-based transcoder; Chrome's
  `AudioDecoder.isConfigSupported({codec:'flac'})` returns false, so it cannot decode the FLAC source.
  This is a genuine runtime-capability gap, not an under-declaration: Chrome WebCodecs has no FLAC audio
  decoder. Correct NA.
- **remotion-webcodecs@4.0.479** — NA_BROWSER, same root cause and same honest reason
  ("WebCodecs AudioDecoder.isConfigSupported=false" for flac). Cannot ingest the FLAC bitstream.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "does not declare operation 'transcode'". It is a
  parser/demuxer only; declaring no encode path is honest.
- **web-demuxer@4.0.0** — NA_ENGINE, "does not declare operation 'transcode'". Demux-only library;
  honest NA.
- **mp4box@2.3.0** — NA_ENGINE, "does not declare operation 'transcode'". MP4 box parser/muxer with no
  audio re-encode; honest NA.
- **platform@chrome-149** — NA_ENGINE, "does not declare input container 'flac'". The bare-browser
  baseline has no FLAC-in container demux declared for the transcode op; honest NA.

## Anti-cheat validation

- scenario definition: `src/scenarios/transcode/index.ts:384-391` (case `flac_to_aac_mp4`), generated
  into a Scenario at `index.ts:403-423`. requires operations `['transcode']`, containersIn `['flac']`,
  containersOut `['mp4']`, audioCodecs `['flac','aac']`; oracles `['property-invariant','playback-smoke']`.
- fixture: asset `flac_seektable.flac` is a REAL file present at
  `fixtures/media/flac_seektable.flac` (143 KB). Not synthetic/empty/mock.
- winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2165` (transcode), audio encode argv at
  lines 2461-2505 (`-c:a aac`, `-b:a 256000`), faststart at 2517-2522, real `ff.exec` at 2527-2528 via
  `run()` (line 1819). Encoder resolution `audioEncoderName` -> native `aac` (`codecs.ts:35`,`352`).
  Genuine library call; no copy-input, no golden short-circuit, no swallowed error (run() throws on
  non-zero exit with a log tail).
- gating oracles: `transcode-output-metadata` (`src/core/oracles.ts:3626-3708`) re-probes the output and
  asserts container/duration/track-shape; `playback-smoke` (`oracles.ts:1574-1577`) plays the output in a
  real `<video>`. Measurements are physically plausible: 1 audio track, 0 s duration delta vs 0.12 s band.
- verdict: **WEAK-GATE.** The implementation, fixture, and oracle comparisons are all real, but neither
  gate is a correctness gate in the strict sense. `property-invariant` only checks output *metadata shape*
  (container == mp4, 1 audio track, duration within 0.12 s) — it does NOT verify the decoded PCM matches
  the source, and `playback-smoke` only proves the file plays a few frames. The scenario's own notes
  acknowledge this for the lossless FLAC-target sibling: "PCM bit-exactness needs a dedicated audio decode
  oracle before it can be asserted here" (`index.ts:370-372`). So the PASS is honest but proves
  "well-formed AAC/MP4 of the right duration," not "faithful audio transcode." No bit-exact / PCM /
  golden-packet gate ran.
- cached note: the winner's result has `cached:true` ("cached previous PASS result"). Numbers were reused,
  not re-run this pass; staleness risk exists but the underlying code path is intact and the fixture is
  present.

## Confidence & caveats

- Confidence: high on the *winner identity* (only 1 PASS; all 6 NAs are honest and well-explained) and on
  the *implementation being real* (concrete FFmpeg argv, real encoder mapping, no faking).
- Caveat 1: the win is on a smoke + metadata-shape gate (WEAK-GATE); no PCM/bit-exact oracle exercised
  the audio fidelity. A future decode oracle could surface encode-quality differences not visible here.
- Caveat 2: bench n=1 (no spread), peakMemory not sampled (0 with empty samples[]), and the result is
  cached — treat the 282.78 ms / 35.36x / 5478 ms figures as single-sample, possibly stale.
- Caveat 3: performance ranking is moot — there is no runner-up to compare against.
