# remux/flac_seektable_flac_to_ogg

family: remux | fixture asset: `flac_seektable.flac` (fixtures/media/flac_seektable.flac, 143 KB, real `fLaC` magic, 48 kHz / 2ch / 10 s) | primaryMetric: wall | passCount: 1 / 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** — UNCONTESTED (only PASS; 6 NA).
- **Decisive factor:** it is the only engine that declares the full capability chain required by this cell — operation `remux`, input container `flac`, output container `ogg`, audio codec `flac`, AND the explicit gating feature `remux:flac-in-ogg`. Every other engine was eliminated at the capability gate before any media was processed.
- **Margin over runner-up:** not applicable — no second PASS. The next-closest engines never executed (NA_ENGINE), so there is no performance gap to report.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 4.99 ms | 2004.0 x-realtime | 0 (not sampled) | 4223 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ogg' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:flac-in-ogg' |

## Why the winner wins (deep technical)

This cell asks for a **lossless container re-wrap of a native FLAC elementary stream into the Ogg-mapped FLAC container** (Ogg FLAC, the RFC-style FLAC-in-Ogg encapsulation). It is explicitly NOT a transcode: the scenario carries `features: ['remux:flac-in-ogg']` (src/scenarios/remux/audio.ts:61) precisely so that an engine that would silently transcode FLAC to Opus to satisfy "audio in Ogg" cannot be scored as a remux. The source is a CDDA-like FLAC: STREAMINFO reports 48000 Hz, 2 channels, 480000 total samples (= 10.0 s), matching the golden meta (fixtures/golden/flac_seektable.flac.meta.json: durationSec 10, sampleRate 48000, channels 2, codec flac).

ffmpeg.wasm performs the genuine operation in `remux()` at src/engines/ffmpeg-wasm/adapter.ts:2031-2069. It probes the input (`runInfo`), asserts container compatibility (the WebM-only guard at adapter.ts:903-921 is a no-op for Ogg), then builds and runs `ffmpeg [...inputOptions] -i <in.flac> -map 0 -c copy <out.ogg>` (adapter.ts:2044, 2062-2063). The `-c copy` codec path means FFmpeg's native FLAC parser hands the coded FLAC frames straight to the Ogg muxer with zero re-encode — the FLAC frames and the STREAMINFO are byte-preserved, only the Ogg page/segment framing is newly synthesized. The engine declares this exact capability token at adapter.ts:1521 (`'remux:flac-in-ogg' // Ogg-mapped FLAC stream copy; oracle validates duration from Ogg granules`), so the registry/runner lets it run instead of NA-ing it.

The gating oracle is `reference-reimport` (default for every remux cell, src/scenarios/remux/_shared.ts:78-81), implemented at src/core/oracles.ts:1225 dispatching into `semanticRemuxReimport` (oracles.ts:1273). For Ogg FLAC the reference demuxer returns **0 packets / 0 tracks** (a known limitation parsing Ogg-FLAC), which is why the shard shows `reimportPackets:0, reimportKeyframes:0, reimportMediaTracks:0`. The oracle does NOT loosely wave this through: `isExpectedOggFlacOutput` (oracles.ts:1388-1394) confirms the output container is `ogg` AND a flac audio track is expected, then engages a **stronger structural proof** rather than a weaker one. It:
1. parses the Ogg granule positions directly from the output bytes (`durationFromOggGranules`, oracles.ts:1401-1436) → `durationFromOggGranulesSec:10`, vs golden 10 s → `durationDeltaSec:0` against `durationToleranceSec:0.1` (oracles.ts:1318-1322);
2. parses the **FLAC STREAMINFO from BOTH the source FLAC and the Ogg-FLAC output** (`nativeFlacStreamInfoFromInput` + `oggFlacStreamInfo`, oracles.ts:1326-1358) and diffs sampleRate, channels, bitsPerSample, totalSamples, and the STREAMINFO **MD5**. The shard records `flacSourceTotalSamples:480000` and `flacOutputTotalSamples:480000` (identical), `oggFlacPages:1`, `oggFlacPayloadBytes:51` (a real, non-empty Ogg page payload — the page-payload>0 guard at oracles.ts:1355 passed).

So the PASS is anchored on a metadata-exact, sample-count-exact, STREAMINFO-MD5-exact comparison between source and remuxed output — squarely on the **structural/metadata-exact** rung of the correctness ladder, not a smoke or perceptual proxy. The detail string `Ogg-FLAC STREAMINFO/granule proof: 1 media track(s)` (oracles.ts:1368-1371) reflects this dedicated path.

Performance is secondary here (no contest) but plausible: wall median 4.99 ms over 480000 samples gives the reported 2004 x-realtime — fully consistent with a pure `-c copy` re-wrap (no codec work, just demux + Ogg page assembly). `longtasks:4223 ms` is the dominant cost and reflects ffmpeg.wasm module/exec overhead, not the copy itself. peakMemory/sourceReads/targetWrites were not sampled (n=0).

## What each other framework did wrong

- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — web-demuxer is a demux-only library (it exposes packet extraction, not a muxer), so it cannot produce an Ogg-FLAC output. Not an under-declaration.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest. The WebCodecs platform has no built-in container muxer at all, and notably no FLAC encoder/Ogg-FLAC muxer; remux is genuinely outside its surface.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — it is a parser/probe library, not a transcoder/muxer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'ogg'". Honest. Remotion's WebCodecs muxer targets MP4/WebM; it has no Ogg muxer, so an Ogg-FLAC target is genuinely unsupported.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'flac'". Honest. MP4Box.js is an ISO-BMFF (MP4/MOV/fragmented) tool; it cannot parse a raw `fLaC` container as input, so the FLAC source is out of scope.
- **mediabunny@1.48.0** — NA_ENGINE: "engine does not declare feature 'remux:flac-in-ogg'". This is the most interesting non-winner. mediabunny DOES have an `OggOutputFormat`, but it does not declare the `remux:flac-in-ogg` feature token, so the runner NAs it rather than risk scoring a FLAC→Opus transcode (or an unsupported Ogg-FLAC mapping) as a lossless remux. This NA looks honest/conservative-by-design: the feature gate exists specifically to prevent over-claiming an Ogg-FLAC copy that mediabunny may not actually perform; absent an explicit declaration the safe call is NA, not a speculative run.

## Anti-cheat validation

- **Scenario:** src/scenarios/remux/audio.ts:56-65 (RemuxCase `flac_seektable.flac` from `flac` to `ogg`, audioCodecs `['flac']`, feature `remux:flac-in-ogg`); id is synthesized by `remuxId` (src/scenarios/remux/_shared.ts:73-75) → `remux/flac_seektable_flac_to_ogg`. Default oracle is `reference-reimport` (_shared.ts:78-81).
- **Fixture exists & is real:** fixtures/media/flac_seektable.flac, 143 KB, header `66 4c 61 43` (`fLaC`) followed by a 34-byte STREAMINFO block — a genuine FLAC file, not synthetic/empty/mock. Golden meta (fixtures/golden/flac_seektable.flac.meta.json) corroborates 48 kHz / 2ch / 10 s flac.
- **Oracle is real:** src/core/oracles.ts:1225 (`referenceReimport`) → :1273 (`semanticRemuxReimport`). It is NOT trivially satisfiable: the Ogg-FLAC branch (:1326-1358) compares source-vs-output STREAMINFO fields including totalSamples and MD5, plus an Ogg-granule duration check (:1302-1324) with a tight 0.1 s tolerance, plus a page-payload>0 guard (:1355). Measurements are physically plausible: 480000 samples = exactly 10 s at 48 kHz; 1 Ogg page with 51 payload bytes is reasonable for a short header-bearing page; duration delta 0.
- **Winner adapter is genuine:** src/engines/ffmpeg-wasm/adapter.ts:2031-2069 runs real `ffmpeg -i ... -map 0 -c copy out.ogg`; no canned output, no input→output passthrough faking a transcode, no golden short-circuit, no error swallowing (errors propagate from `this.run`). Feature declared at adapter.ts:1521.
- **Cached note:** the winner's result has `cached==true` ("cached previous PASS result"). The PASS was reused, not re-run in this batch — mild staleness risk. However the adapter/oracle/fixture all check out on inspection and the cached measurements are internally consistent, so the cached evidence is credible.
- **Verdict: REAL** — real fixture + real `-c copy` implementation + a meaningful, metadata/sample-exact oracle. (One caveat: because the reference demuxer returns 0 packets for Ogg-FLAC, the PASS rests on the STREAMINFO/granule fallback rather than a packet-table diff; this is a deliberate, non-trivial structural proof, not a loosened gate.)

## Confidence & caveats

- **Confidence: high** for the winner selection (uncontested; capability gate is unambiguous) and high that the implementation/oracle are genuine.
- Caveat 1: result is `cached==true`; not re-executed this run.
- Caveat 2: the gating proof is the Ogg-FLAC STREAMINFO/granule fallback, not the standard packet-count diff, because the reference engine cannot enumerate Ogg-FLAC packets (`reimportPackets:0`). This is by design but means correctness strength is "structural/metadata-exact," not "bit-exact packet table."
- Caveat 3: mediabunny's NA is conservative-by-policy; if it genuinely supports Ogg-FLAC copy and simply lacks the feature token, this cell would become contested. As scored, it is a correct NA.
