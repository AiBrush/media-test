# probe/wav_s16

family: probe | fixture asset: `wav_s16.wav` (fixtures/media/wav_s16.wav, 960 KB, real) | primaryMetric: wall | passCount: 5

## Verdict

- Best framework: **mediabunny@1.48.0** (status PASS).
- CONTESTED: 5 of 7 engines PASS (mediabunny, platform, remotion-webcodecs, remotion-media-parser, ffmpeg-wasm), 2 NA.
- Decisive factor: correctness is a dead heat — every PASS engine satisfies the single gating oracle `golden-metadata` with the strictest possible result (durationDeltaSec = 0 against a ±0.04167s / 1-frame band), so the contest falls through to PERFORMANCE on the primary metric `wall`.
- Margin over runner-up: mediabunny wall median **2.55 ms** vs remotion-media-parser **3.675 ms** = **1.44x faster** than the next PASS engine; **2.37x** faster than remotion-webcodecs (6.055 ms); **5.55x** faster than ffmpeg.wasm (14.15 ms); **2353x** faster than platform (5999.82 ms). Evidence is weak on sample count (n=1, mad=0) and all 5 results are `cached==true`.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 2.55 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 3.675 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 6.055 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 14.15 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 5999.82 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'wav' |
| mp4box@2.3.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'wav' |

(The shard bench block carries only `wall`; throughputRealtime/peakMemory/longtasks were not measured for this probe row.)

## Why the winner wins (deep technical)

The operation is a metadata-only probe of a 16-bit little-endian PCM stream in a RIFF/WAVE container (`pcm-s16`, 48000 Hz, 2 ch, 5.000 s, golden bitrate 1,536,000 bps = 48000 x 16 x 2). There is no compressed bitstream to decode and no inter-frame structure: correctness reduces to (a) classifying the container as `wav`, (b) reading the `fmt ` chunk (sample format, rate, channels), and (c) deriving duration from `data` chunk size / byte-rate. Because the answer is fully determined by header bytes, all five PASS engines land identical, exact values — the shard shows `durationDeltaSec: 0` for every one of them against the strict `durationToleranceSec: 0.041666666666666664` band (oracles.ts golden-metadata, src/core/oracles.ts:614-637). Correctness strength (oracle ladder = structural/metadata-exact, single oracle, zero delta) is therefore tied, and the runner's tie-break rule routes the decision to the primary metric `wall`.

mediabunny wins wall at 2.55 ms via a pure-TypeScript ESM core (env.configUsed.coreBuild = "pure-ts-esm", sharedArrayBuffer = false, coopCoep = "not-required"). Its probe path (src/engines/mediabunny/adapter.ts:1134-1141) opens a mediabunny `Input` over a `BlobSource` and calls `metadataFromInput` (adapter.ts:417-453), which reads duration through the cheap header path `getDurationFromMetadata()` FIRST (adapter.ts:429) and only falls back to `computeDuration()` if that returns null. For WAVE, the `data`-chunk byte count divided by byte-rate gives an O(1) header read — no sample scan, no decode, hence the sub-3ms wall. Track fields come from the real library getters in `normalizeTrack` (adapter.ts:332-347): `getCodec()`, `getSampleRate()`, `getNumberOfChannels()` — mapped to the canonical `pcm-s16`/48000/2 that match the golden exactly. The container is recognized because `WAVE` is wired into `CANONICAL_TO_INPUT_FORMAT` (src/engines/mediabunny/codecs.ts:134) and is in ALL_FORMATS, so `openInput` constrains formats to WAVE for this asset.

remotion-media-parser is the closest competitor at 3.675 ms (backend `cpu-js`, fieldsTier `metadata-only`) — also a header-only JS parse, only ~1.1 ms slower. remotion-webcodecs (6.055 ms) and ffmpeg.wasm (14.15 ms) are slower: ffmpeg.wasm pays wasm module/FS overhead even for a header read, the heaviest of the JS/wasm group. The platform (Chrome WebCodecs) path is the outlier at 5999.82 ms — for a `<audio>`/MediaSource-style probe the browser path incurs element/network/decoder-init latency that dwarfs a direct header parse; correctness still passes (durationDelta 0) but it is ~2353x slower, so it loses decisively on the tie-break metric.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, but lost on performance: wall 3.675 ms vs 2.55 ms = 1.44x slower. Same exact metadata (durationDelta 0); the only gap is raw header-parse throughput.
- **remotion-webcodecs@4.0.479** — PASS, lost on performance: 6.055 ms = 2.37x slower than mediabunny. Correctness identical (durationDelta 0).
- **ffmpeg.wasm@0.12.15** — PASS, lost on performance: 14.15 ms = 5.55x slower; wasm runtime/FS overhead on a header-only read. Correctness identical.
- **platform@chrome-149** — PASS, lost decisively on performance: 5999.82 ms = 2353x slower (browser element/decoder-init latency for a trivial probe). Correctness identical.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'wav'." Honest NA — web-demuxer's ffmpeg-wasm demux build targets ISO/Matroska/etc. and does not register WAVE as a readable input container in the suite registry.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'wav'." Honest NA — mp4box is an ISOBMFF (MP4/MOV) box parser and cannot parse a RIFF/WAVE container at all; declining is correct rather than under-declared.

## Anti-cheat validation

- Scenario definition: src/scenarios/probe/index.ts:179 — `{ asset: 'wav_s16.wav', container: 'wav', audioCodecs: ['pcm-s16'] }` (no explicit id, so scenarioId derives to `probe/wav_s16`). Family header (index.ts:1-31) documents golden-gated, one-probe-per-container coverage.
- Fixture: fixtures/media/wav_s16.wav exists, 960 KB — a real PCM file, not synthetic/empty/mock.
- Golden: fixtures/golden/wav_s16.wav.meta.json present and physically plausible — container `wav`, durationSec 5, pcm-s16, 48000 Hz, 2 ch, bitrate 1,536,000 (= 48000x16x2, exactly consistent).
- Oracle: `golden-metadata` in src/core/oracles.ts:595-657 — performs a REAL field-by-field comparison (container string, duration within tolerance, per-track codec/sampleRate/channels via compareTrack at oracles.ts:659+). It is not trivially satisfiable: it can FAIL on container mismatch, duration delta beyond the strict ±0.04167s band, or any track-field mismatch. Measured durationDeltaSec 0 against tolerance 0.04167 is the tightest possible PASS, not a wide-tolerance free pass.
- Winner adapter: src/engines/mediabunny/adapter.ts:1134-1141 (probe), :417-453 (metadataFromInput), :332-347 (audio track normalization), src/engines/mediabunny/codecs.ts:134 (WAVE wiring). The op is genuinely implemented against the real mediabunny Input API — no canned output, no input->output copy, no short-circuit to the golden, no swallowed errors reported as success.
- Cached note: ALL five PASS results have `cached==true` ("cached previous PASS result"). The wall numbers were reused, not re-run this session — staleness risk applies to the performance ranking (though the implementation and oracle are verified genuine).
- Verdict: **REAL** — real fixture + real mediabunny implementation + meaningful strict metadata oracle. The PASS is genuine and the win is well-founded; the only caveat is that the deciding metric is cached n=1 evidence.

## Confidence & caveats

- Confidence: medium. Correctness verdict (REAL, exact metadata) is high-confidence; the performance ranking that decides the contest rests on cached, n=1, mad=0 single-sample wall medians, so the precise 1.44x margin over remotion-media-parser could shift on a fresh re-run. The platform 2353x gap and ffmpeg.wasm 5.55x gap are large enough to be robust regardless of cache staleness.
- Both NA engines (web-demuxer, mp4box) are honest container-support declines, not under-declared capabilities.
