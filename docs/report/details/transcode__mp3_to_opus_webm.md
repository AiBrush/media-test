# transcode/mp3_to_opus_webm

family: transcode | fixture asset: `mp3_xing.mp3` (64,166 bytes, MPEG-1 Layer III, 64 kbps CBR, 44.1 kHz stereo, ID3v2.4 + Xing header) | primaryMetric: wall | passCount: 2 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 2 engines PASS: mediabunny and remotion-webcodecs).
- **Decisive factor: main-thread responsiveness.** Both engines pass the identical oracle pair (`property-invariant` + `playback-smoke`) with the same correctness strength, so the tie breaks on PERFORMANCE. mediabunny wins on every measured axis: wall 131.49 ms vs 144.70 ms (**1.10x faster**), throughputRealtime 76.05x vs 69.11x (**1.10x higher**), and — decisively — longtasks 179 ms vs 12,909 ms (**72.1x lower**). The longtask gap is the dominant signal: remotion-webcodecs blocked the main thread for ~12.9 s of cumulative long tasks during this convert (its pipeline runs `convertMedia` on the main thread per its own `configUsed.worker: "convert=main-thread"`), whereas mediabunny's streaming-lockstep Conversion kept long tasks to 179 ms.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 131.49 ms | 76.05x | n/a (n=0) | 179 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true, playback-smoke:true | 144.70 ms | 69.11x | n/a (n=0) | 12909 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | libopus encode in vendored wasm core traps/exceeds timeout; Opus encode not declared |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

(peakMemory not sampled in this run: n=0, median 0 for both PASS engines — not a usable tiebreak axis here.)

## Why the winner wins (deep technical)

The operation is a **lossy-to-lossy audio transcode**: decode MP3 (MPEG-1 Layer III, 64 kbps CBR, 44.1 kHz stereo from `mp3_xing.mp3`) → re-encode to **Opus** → mux into a **WebM** container at 128 kbps. Because both source and target are lossy, no bit-exact or PCM-exact assertion is possible (the scenario notes "A.6 gap"); the gate is therefore an output-format / metadata invariant plus a real-playback smoke test. The runner correctly applies `TC_AUDIO_PRIMING_TOLERANCE_SEC` as the duration band (`durationToleranceSec: 0.12`) to absorb Opus encoder pre-skip/priming (gapless, A.16). Both winners land well inside it.

**mediabunny's path.** The adapter drives the high-level Conversion API: `Conversion.init(opts)` then `conversion.execute()` (`src/engines/mediabunny/adapter.ts:848`–`855`), with `runConversion` checking `conversion.isValid`/`discardedTracks` so an unencodable track surfaces as a hard error rather than a silent copy. The audio block is built without pinning bitrate on a same-codec copy, but here the codecs differ (mp3→opus) so mediabunny commits to its WebCodecs Opus encoder. `env.configUsed` confirms `backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`. The streaming-lockstep read→decode→encode→mux loop with `queueDepth: "auto"` keeps each task slice short — reflected in the **179 ms** total longtasks measurement. The `property-invariant` (transcode-output-metadata) oracle re-probes the output via the reference engine and confirms `webm` container with 1 audio track and `durationDeltaSec: 0.04 < 0.12` tolerance; `playback-smoke` then plays the produced WebM/Opus in a real `<video>` element.

**Why mediabunny beats remotion-webcodecs.** remotion-webcodecs also genuinely transcodes via `convertMedia` (`src/engines/remotion-webcodecs/adapter.ts:615`) with `audioCodec` mapped through `canonicalToRemotionAudio('opus')` (`:549`–`551`), real WebCodecs `prefer-hardware(+software fallback)`, `writer: bufferWriter`, and probe-derived `expectedDurationInSeconds`. It passes both oracles with `durationDeltaSec: 0.076 < 0.12`. But its `configUsed.worker` is `"convert=main-thread; extractFrames/parse=worker-capable"` — the conversion encode/mux runs on the main thread. The shard shows the cost: **longtasks 12,909 ms** versus mediabunny's **179 ms** (a 72x gap), plus a 1.10x slower wall (144.70 vs 131.49 ms) and 1.10x lower realtime throughput (69.11x vs 76.05x). For a UI-facing transcode, ~12.9 s of cumulative main-thread long tasks is a severe responsiveness penalty; mediabunny's lockstep slicing wins cleanly on the tiebreak ladder (performance), and additionally on the responsiveness tiebreaker even though both are pure WebCodecs with no COOP/COEP requirement.

**Evidence-strength caveat:** both bench rows are `n=1` (single sample, mad=0, p95==median), so the wall/throughput margins (~1.10x) rest on one observation each and are weak as standalone evidence. The longtasks margin (72x), however, is so large that single-sample noise cannot plausibly invert the ordering — that is the robust decisive signal.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASSed (both oracles, durationDelta 0.076 s) but LOST on performance: 1.10x slower wall, 1.10x lower throughput, and 72.1x more longtasks (12,909 ms vs 179 ms) because its `convertMedia` runs on the main thread (`configUsed.worker: "convert=main-thread"`).
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — mp4box.js is an MP4 demux/remux/parser, not a decode/encode pipeline; it has no encoder at all.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'mp3'". Honest — the platform WebCodecs path has no raw-MP3 (MPEG elementary/Xing) demuxer wired in; it cannot ingest the source.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — web-demuxer is a demux-only ffmpeg-wasm wrapper, exposes packets, not an Opus encoder.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path". Plausibly honest capability carve-out (the vendored core lacks/destabilizes libopus encode), though it is the one engine that could *in principle* do this on CPU — borderline under-declaration, but defensible given the trap/timeout rationale; returned in 155 ms (fast NA, not a hung run).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — media-parser is read-only (parse/probe), no encode side.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:1044`–`1053` (case `mp3_to_opus_webm`), expanded by the `audioEncodeScenarios` map at `:1089`–`1109` which sets op `transcode`, oracles `['property-invariant','playback-smoke']`, and the priming-tolerance duration band.
- **Fixture:** asset `mp3_xing.mp3` exists at `fixtures/media/mp3_xing.mp3`, 64,166 bytes; `file(1)` reports "MPEG ADTS, layer III, v1, 64 kbps, 44.1 kHz, Stereo" with ID3v2.4 + Xing header. Real, non-synthetic, non-empty media.
- **Winner adapter:** mediabunny genuinely runs `Conversion.init`/`conversion.execute` with an isValid/discardedTracks guard (`src/engines/mediabunny/adapter.ts:848`–`855`); it does NOT copy input→output, hardcode bytes, or short-circuit to a golden. Codecs differ (mp3→opus) so the WebCodecs Opus encoder is exercised for real.
- **Oracle:** `property-invariant` transcode-output-metadata at `src/core/oracles.ts:3631`–`3708` re-probes the produced bytes through the reference engine and asserts container==webm, 1 audio track, and `durationDelta (0.04 s) <= tol (0.12 s)`; `playback-smoke` (`:1574`–`1580`) plays the output in a real `<video>`. Measurements (durationDeltaSec 0.04, audioTracks 1) are physically plausible for a ~8 s 64 kbps MP3 re-encoded to Opus.
- **Strength caveat:** this is a metadata-shape + smoke gate, NOT a bit-exact / decoded-audio-PCM gate. That is *correct by physics* (lossy→lossy precludes bit-exactness), but it means the PASS verifies "produces a valid playable WebM/Opus with right container+track count+duration" rather than transcode fidelity. The gate is meaningful (re-probe + real playback), just not a strong correctness oracle.
- **cached:** both PASS engines have `cached: true` ("cached previous PASS result") — results were reused, not freshly re-run; per the launcher seeding caveat, stale-PASS reuse is a known risk, so the absolute numbers carry mild staleness risk. Relative ordering (72x longtask gap) is robust to that.
- **Verdict: WEAK-GATE.** Real fixture + real library implementations on both sides, but the gating oracle is an output-format/metadata invariant plus playback-smoke (no bit-exact correctness possible for lossy→lossy). The PASS is genuine; it is not a strong fidelity assertion.

## Confidence & caveats

- **Confidence: medium.** The winner and decisive factor are unambiguous (72.1x longtasks margin + wins on wall and throughput). Lowered from high because: (1) both bench rows are n=1 (mad=0, single sample) so wall/throughput margins are noisy; (2) both PASS results are cached (staleness risk); (3) the gate is WEAK (metadata+smoke, not fidelity). None of these can invert the ordering given the magnitude of the longtask gap.
- peakMemory was not sampled (n=0) for either engine, so memory was unavailable as a tiebreak axis.
- ffmpeg.wasm is the only NA that could arguably implement this on CPU; its NA is a declared-capability carve-out (libopus trap/timeout), borderline but defensible.
