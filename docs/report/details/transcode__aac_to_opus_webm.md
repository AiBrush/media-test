# transcode/aac_to_opus_webm

family: transcode | fixture asset: `aac_adts.aac` (raw ADTS AAC, ~164 KB) | primaryMetric: wall | passCount: 2

## Verdict

Best framework: **remotion-webcodecs@4.0.479** (CONTESTED, 2 of 7 engines PASS).

Decisive factor: **performance on the primary metric (wall)**, because correctness is a tie. Both PASS engines (remotion-webcodecs and mediabunny) satisfied the exact same oracle set — `property-invariant` (transcode-output-metadata) + `playback-smoke` — with bit-identical measurements (durationDeltaSec 0.009 s vs a 0.12 s tolerance, audioTracks 1). With correctness comparable, the tie breaks on wall: remotion-webcodecs 117.48 ms vs mediabunny 139.83 ms.

Margin over runner-up (mediabunny): **1.19x faster wall** (117.48 ms vs 139.83 ms) and **1.19x higher real-time throughput** (85.38x vs 71.74x realtime). Caveat: both samples are n==1 (cached single runs, mad==0), so the wall margin is weak evidence; and mediabunny is materially better on main-thread blocking (longtasks 1192 ms vs 4223 ms, i.e. mediabunny is 3.54x lower) — a non-primary metric that would favor mediabunny in a UI-responsiveness ranking.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true, playback-smoke:true | 117.48 ms | 85.38x | 0 (not sampled) | 4223 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 139.83 ms | 71.74x | 0 (not sampled) | 1192 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode not declared a reliable transcode path |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a full re-encode, not a remux: source is raw **ADTS AAC** (`fromContainer: 'adts'`, `fromAudio: 'aac'`) and the target is **Opus in a WebM/Matroska container** at 128 kbps (`toContainer: 'webm'`, `toAudio: 'opus'`, `opts.audio.bitrate 128_000`, scenario `src/scenarios/transcode/index.ts:393-400`). There is no copy path possible — AAC packets cannot live in a WebM Opus track — so every winner must demux ADTS, decode AAC to PCM, re-encode to Opus, and mux into WebM. This is exactly why the four parsing/remux libraries (mp4box, web-demuxer, remotion-media-parser) and the platform engine drop to NA_ENGINE: they never declare the `transcode` operation (or, for `platform`, never declare the `adts` input container), so the runner negotiates them out before any oracle runs.

remotion-webcodecs runs the conversion through `@remotion/webcodecs` `convertMedia`. Its `transcode()` maps the canonical Opus codec to a Remotion audio codec (`canonicalToRemotionAudio`, `src/engines/remotion-webcodecs/adapter.ts:548-552`) and dispatches to the shared `convert()` driver (`src/engines/remotion-webcodecs/adapter.ts:576`, body at `:579-590+`), which uses a `bufferWriter` in-memory output target. The decode→encode is performed by Chrome's native `AudioDecoder`/`AudioEncoder` (WebCodecs). Per `env.configUsed`: `backend:"webcodecs"`, `hwAccel:"prefer-hardware(+software fallback)"`, `pipeline:"streaming-backpressure"`, `queueDepth:"waitForQueueToBeLessThan"`, `writer:"bufferWriter"`, `worker:"convert=main-thread"`, and notably `coopCoep` is not required and `wasmThreads:0` — there is no WASM in this path at all; the codec work is the browser's built-in libopus/AAC. That native, no-WASM pipeline is the mechanistic reason it edges out mediabunny on wall (117.48 ms) and throughput (85.38x realtime). The flip side shows in `longtasks:4223 ms`: `convert` runs on the main thread (`worker:"convert=main-thread"`), so the work, though fast wall-clock, blocks the event loop longer than mediabunny's.

The `property-invariant` gate (`src/core/oracles.ts:3631-3708`, the `transcode-output-metadata` branch) re-probes the produced bytes with the reference engine and checks (a) container equals the requested `webm`, (b) output duration is within tolerance of the source, and (c) the requested audio track shape is present. Both engines passed with `durationDeltaSec 0.009 s` against `durationToleranceSec 0.12 s` and `audioTracks:1` — a 13x margin inside tolerance, physically plausible for AAC→Opus where encoder/decoder priming introduces a few ms of duration drift (the scenario sets `TC_AUDIO_PRIMING_TOLERANCE_SEC` exactly for this). `playback-smoke` (`src/core/oracles.ts:1572-1580`) then loaded the WebM into a `<video>` and confirmed it advanced frames, proving the Opus-in-WebM bitstream is real and decodable, not a stub.

Why not mediabunny, the only other PASS: it is genuinely correct (same two oracles, same measurements) and runs through mediabunny's `Conversion` API (`backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `wasmThreads:0`, `transcode()` at `src/engines/mediabunny/adapter.ts:1271`). It simply loses the wall/throughput race by ~19%. Its lockstep read→decode→encode→mux scheduling yields far lower main-thread blocking (longtasks 1192 ms, 3.54x better), which is why this is a close, metric-dependent call rather than a blowout — under a longtasks-primary policy mediabunny would win. With wall as the declared primaryMetric, remotion-webcodecs takes it.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on the primary metric: wall 139.83 ms vs winner 117.48 ms (1.19x slower) and throughput 71.74x vs 85.38x (1.19x lower). Correctness identical (property-invariant durationDeltaSec 0.009 s, playback-smoke true). It actually beats the winner on longtasks (1192 ms vs 4223 ms) and would win a responsiveness-first ranking; it just isn't the primary metric here.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE, and the NA looks honest: "libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path." This is a real capability gap for the Opus encoder in that wasm build, not an under-declaration.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'adts'." Honest — the bare-WebCodecs platform engine has no ADTS demuxer, so it cannot ingest a raw `.aac` elementary stream.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest; web-demuxer is a demux-only library with no encoder/muxer.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest; mp4box.js is an MP4 box parser/remuxer, not a transcoder, and could not target WebM/Opus anyway.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest; the parser reads media but cannot encode (its sibling @remotion/webcodecs is the encoder, declared separately as the remotion-webcodecs engine — which is exactly the winner).

## Anti-cheat validation

- Scenario: `src/scenarios/transcode/index.ts:393-400` (case `aac_to_opus_webm`), generated into a `defineScenario` at `:407-422` with `op:'transcode'`, `oracles:['property-invariant','playback-smoke']`, and `durationToleranceSec` set from `TC_AUDIO_PRIMING_TOLERANCE_SEC`.
- Fixture: `asset: 'aac_adts.aac'` — confirmed present in `fixtures/media/aac_adts.aac`, ~164 KB, dated 5 days old. Real raw ADTS AAC elementary stream, not synthetic/empty/mock.
- Oracle: `property-invariant` transcode-output-metadata branch at `src/core/oracles.ts:3631-3708` — it re-probes the produced bytes via the reference engine, compares container, source-vs-output duration with a finite tolerance, and required audio-track shape; it fails on any diff. `playback-smoke` at `src/core/oracles.ts:1572-1580` loads the bytes in `<video>` and requires frame advance. Neither is trivially satisfiable: a copied/empty/canned output would fail the container check (must be `webm`), the duration delta (would be null or wildly off), or `<video>` playback.
- Winner adapter: `src/engines/remotion-webcodecs/adapter.ts:521-577` (`transcode`) → `convert` driver `:579+`. It genuinely calls `@remotion/webcodecs` `convertMedia` driving native WebCodecs `AudioDecoder`/`AudioEncoder`; it maps the Opus codec via `canonicalToRemotionAudio` (`:548-552`) and throws (not swallows) on unsupported codecs. No hardcoded output, no input→output copy (impossible AAC-in-WebM), no short-circuit to a golden.
- Verdict: **REAL**. Real ADTS fixture, real native-WebCodecs re-encode implementation, and a metadata+playback oracle pair that re-probes actual output and would catch a fake. The measurements (durationDeltaSec 0.009 s, audioTracks 1, 85.38x realtime) are physically plausible for a ~164 KB AAC→Opus/WebM transcode.
- Cached note: BOTH PASS results have `cached:true` ("cached previous PASS result") — they were reused, not re-run in this report pass. The single-sample (n==1, mad==0) wall/throughput figures carry mild staleness risk; the correctness verdict is unaffected but the 1.19x performance margin should be re-measured before being treated as stable.

## Confidence & caveats

Confidence: medium. The PASS/NA partition and the REAL validation are solid. The winner choice, however, is a narrow, metric-policy-dependent call: remotion-webcodecs wins by ~1.19x on the primary metric (wall) and throughput, but mediabunny is 3.54x better on longtasks and equally correct. Both numbers come from a single cached run each (n==1, mad==0), so the performance margin is weak evidence; a fresh multi-sample re-run could plausibly flip the wall ordering or shift the decision if the ranking weighted main-thread blocking. peakMemory was not sampled (n==0) for either engine, so the memory tiebreaker is unavailable.
