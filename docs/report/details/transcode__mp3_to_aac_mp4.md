# transcode/mp3_to_aac_mp4

family: transcode | fixture asset: `mp3_xing.mp3` (64 KB, real MP3 with Xing VBR header) | primaryMetric: wall | passCount: 3/7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 3 engines PASS).
- **Decisive factor: PERFORMANCE.** Correctness is identical across the three passing engines (both pass `property-invariant` [transcode-output-metadata] and `playback-smoke`; neither oracle is bit-exact, so no correctness separation is possible). mediabunny wins on wall time.
- **Margin over runner-up (remotion-webcodecs):** wall median 85.73 ms vs 106.32 ms = **1.24x faster**; throughputRealtime 116.65x vs 94.05x = **1.24x higher**. mediabunny costs slightly MORE peak memory (43.2 MB vs 35.3 MB = 1.23x). All benches are n==1 (single sample, mad==0), so the speed edge is weak evidence — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:Y, playback-smoke:Y | 85.73 ms | 116.65x | 43,224,037 B | 3675 ms | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:Y, playback-smoke:Y | 106.32 ms | 94.05x | 35,271,853 B | 19963 ms | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:Y, playback-smoke:Y | 348.20 ms | 28.72x | 0 B (n=0) | 3675 ms | cached previous PASS |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a real **decode→re-encode transcode**: MP3 (MPEG-1/2 Layer III elementary frames in a raw MP3 stream carrying a Xing/VBR header) must be fully decoded to PCM and re-encoded as **AAC-LC, target 192 kbps, muxed into an MP4 (ISO BMFF) container**. This is not a remux: the audio codec changes (mp3 → aac), so the encoder path must run.

mediabunny ran the genuine `Conversion` pipeline. The adapter opens the input, builds an MP4 output format and a real conversion (`src/engines/mediabunny/adapter.ts:1284-1311`): `Conversion.init(convOpts)` then `conversion.execute()` (`runConversion`, `src/engines/mediabunny/adapter.ts:842-855`). Audio options are derived in `buildAudioOptions` (`adapter.ts:672-692`), which sets `opts.codec='aac'` and `opts.bitrate=192000` — so the conversion drives a real AAC encoder, not a copy. `convOpts.trim = { start: 0, end: inputDuration }` (`adapter.ts:1305`) explicitly bounds the output to the source duration, which is exactly why the output duration lands within tolerance. Per `env.configUsed`, mediabunny used `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `pipeline: "streaming-lockstep"` — i.e. the browser's native AudioDecoder/AudioEncoder (here on an Apple M1 Max) drive the codec work, with no SharedArrayBuffer and no COOP/COEP isolation requirement. That native-codec path is the mechanistic reason it is fastest: it does the MP3→PCM→AAC work in hardware/native code rather than in a wasm build.

The gating oracle measurements confirm a plausible real transcode: `property-invariant` reports `audioTracks: 1`, `durationDeltaSec: 0.10068`, against `durationToleranceSec: 0.12` (the small ~0.1 s delta is the well-known AAC encoder-delay / priming-sample artifact — a re-encoded MP3→AAC almost always grows by ~1024–2048 samples, which is physically expected and lands just inside the band). `playback-smoke` then confirms a real `<video>` element decoded and advanced a few frames of the produced MP4, proving the muxed AAC/MP4 is actually playable.

remotion-webcodecs is the same fundamental approach (WebCodecs, `backend: "webcodecs"`, `hwAccel: "prefer-hardware(+software fallback)"`, `pipeline: "streaming-backpressure"`) and is also correct (`durationDeltaSec: 0.101`, audioTracks 1, playback OK). It simply ran 1.24x slower wall and showed a very large `longtasks` figure of 19963 ms (vs mediabunny's 3675 ms), indicating it blocked the main thread far more — consistent with its `convert=main-thread` config. It uses less peak memory (35.3 MB) but that does not overcome the wall/throughput and main-thread-blocking disadvantage for the primaryMetric (wall).

ffmpeg.wasm also passed both oracles and was the most duration-accurate (`durationDeltaSec: 0`), but it is the single-thread wasm path: wall 348.20 ms is **4.06x slower** than mediabunny and throughput 28.72x is **4.06x lower** — exactly what you expect when MP3 decode and AAC encode run in a wasm build rather than native WebCodecs. (Its peakMemory sample was not captured, n=0.)

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS but lost on performance: 1.24x slower wall (106.32 ms vs 85.73 ms), 1.24x lower throughput, and 5.4x worse main-thread blocking (longtasks 19963 ms vs 3675 ms) from its main-thread convert config. Equally correct otherwise.
- **ffmpeg.wasm@0.12.15** — PASS but slowest: 4.06x slower wall (348.20 ms) and 4.06x lower throughput (28.72x) because MP3 decode + AAC encode run in single-thread wasm rather than native WebCodecs. Best duration accuracy (Δ 0 s) but that does not affect the wall primaryMetric.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'mp3'". Honest NA — the platform/WebCodecs-direct adapter has no MP3 demuxer, so it legitimately cannot ingest a raw MP3 stream.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — media-parser is a parse/probe library, not an encoder.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — mp4box is an MP4 (de)muxer with no audio encoder.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — it is a demuxer only.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:374-382` (case `mp3_to_aac_mp4`), expanded at `index.ts:403-419`. Requires op `transcode`, containersIn `mp3`, containersOut `mp4`, audioCodecs `{mp3, aac}`, options `{container:'mp4', audio:{codec:'aac', bitrate:192000}}`, oracles `property-invariant` + `playback-smoke`.
- **Fixture:** `asset: 'mp3_xing.mp3'` → `fixtures/media/mp3_xing.mp3` exists, 64 KB, a genuine MP3 with a Xing VBR header (NOT synthetic/empty/mock). Real input confirmed via `stat`.
- **Gating oracle(s):** `property-invariant` transcode-output-metadata at `src/core/oracles.ts:3630-3708` (probes the OUTPUT with the reference engine, checks container == 'mp4', duration within a computed tolerance band against the source golden, and audio-track shape vs requested codec/bitrate). `playback-smoke` at `src/core/oracles.ts:1574-1581` (plays the output MP4 in a real `<video>` and requires advancement).
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1271-1322` (real `transcode`), `buildAudioOptions` `adapter.ts:672-692` (sets aac codec + 192 kbps), `runConversion` `adapter.ts:842-855` (`Conversion.init` + `execute`). No canned/hardcoded output, no input→output copy, no short-circuit to golden, no error-swallowing — `runConversion` even throws if `conversion.isValid` is false.
- **Verdict: WEAK-GATE.** The implementation is real and the fixture is real, but neither gating oracle is a strong correctness check: `property-invariant` only validates container/track-shape and duration within a 0.12 s band (it does not verify decoded PCM bit-exactness or audible fidelity), and `playback-smoke` is a smoke test. So the PASS is genuine but proves "produced a playable, correctly-shaped AAC/MP4 of the right duration", not "the audio is faithfully transcoded". A decoded-audio-pcm oracle would be needed to assert fidelity.
- **Cached note:** ALL three passing results have `cached==true` ("cached previous PASS result"). The winner's bench numbers were reused, not freshly re-run — staleness risk applies, and the n==1 single-sample benches make the 1.24x margin fragile.

## Confidence & caveats

- Winner is correct, but only on a metadata+smoke gate (WEAK-GATE), so the win is about speed, not proven fidelity.
- The performance margin (1.24x over remotion-webcodecs) rests on n==1 benches with mad==0 and cached==true — low statistical strength. A re-run could narrow or invert this margin; mediabunny's larger peak memory (1.23x) is a real trade-off.
- The four NA engines all look like honest capability gaps (no MP3 demux for platform; no transcode/encode op for the parser/demuxer/muxer-only libraries), not under-declared capabilities.
- Overall confidence: **medium** — clear and plausible result, but cached single-sample evidence on a non-bit-exact gate.
