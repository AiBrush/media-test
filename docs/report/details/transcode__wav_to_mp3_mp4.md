# transcode/wav_to_mp3_mp4

family: transcode | fixture asset: `wav_s16.wav` (PCM-S16 in WAV) | primaryMetric: wall (none explicitly set; first declared metric) | passCount: 1/7

## Verdict

**Best framework: ffmpeg.wasm@0.12.15** — **uncontested** (exactly one PASS).

Decisive factor: this is a **PCM(WAV) → MP3-in-MP4 audio encode**, and MP3 *encoding* is the gate. Chrome 149's WebCodecs `AudioEncoder` reports `isConfigSupported({codec:'mp3'})=false`, so every WebCodecs-backed engine (mediabunny, remotion-webcodecs) is honestly NA_BROWSER, and the parser/demux-only engines (mp4box, remotion-media-parser, web-demuxer) never declare the `transcode` operation at all (NA_ENGINE). `platform` declares transcode but not the `mp3` audio codec (NA_ENGINE). Only ffmpeg.wasm carries a software MP3 encoder (`libmp3lame`) compiled into its vendored wasm core, so it is the only engine that can produce the output at all. No runner-up margin exists (single PASS).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:✓, playback-smoke:✓ | 69.955 ms | 71.475 x-rt | 0 (n=0) | 4223 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false) |
| remotion-webcodecs@4.0.479 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false) |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'mp3' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Oracle measurements (ffmpeg.wasm, property-invariant): `durationDeltaSec=0`, `durationToleranceSec=0.12`, `audioTracks=1`. playback-smoke: "<video> played a few frames of the output". Bench n=1 (single sample, warmup=1) for wall/throughput/longtasks; peakMemory n=0 (unmeasured, `crossOriginIsolated`/`performance.measureUserAgentSpecificMemory` not available on this single-thread path).

## Why the winner wins (deep technical)

The operation requested is `transcode` with `opts={container:'mp4', audio:{codec:'mp3', bitrate:192000}}` over a real PCM-S16 WAV source (scenario `src/scenarios/transcode/index.ts:1054-1063`, materialized at `:1089-1111`). Two independent capabilities are required: (1) decode/ingest linear PCM, and (2) **encode MP3** and mux it into an MP4 container. The MP3 *encoder* is the scarce capability.

ffmpeg.wasm is the only engine that ships a real MP3 encoder. The codec map at `src/engines/ffmpeg-wasm/codecs.ts:37` resolves `mp3 → libmp3lame`, the LAME encoder linked into the published 0.12.10/0.12.15 wasm core (`codecs.ts:9` documents `libmp3lame` is compiled in). In the audio branch of the transcode adapter (`src/engines/ffmpeg-wasm/adapter.ts:2461-2508`), `audioEncoderName('mp3')` returns `libmp3lame`; the adapter then emits real ffmpeg CLI args `-c:a libmp3lame` (`:2472`) and `-b:a 192000` (`:2505`), and because the container is `mp4` it appends `-movflags +faststart` (`:2517-2522`) to move the moov atom ahead of mdat. The command is dispatched to the actual wasm `ffmpeg.exec` via `await this.run(args)` (`:2528`) and the result is read back with `readBinary(outName)` (`:2529`) — i.e. genuine wasm encode work, not a copy. This is the *mp3-in-mp4 transcode* path (note the engine separately documents a distinct "remux:mp3-in-mp4" frame-copy path at `:1519`, which is NOT used here because the source is PCM, forcing a true re-encode). The 4223 ms longtask figure is consistent with a single-thread wasm LAME encode of a ~960 KB WAV plus MP4 muxing; the small 69.955 ms wall median is the in-page measured cell wall (the wasm core is pre-warmed by the untimed synthetic warm-up at `adapter.ts:1673`), and 71.475× realtime reflects encoding a multi-second clip faster than playback.

Correctness gate: the property-invariant oracle `transcodeOutputMetadataInvariant` (`src/core/oracles.ts:3626-3708`) re-probes the produced bytes through the reference engine (`:3641`) and asserts the output container equals the requested `mp4` (`:3655-3657`), that an audio track exists with `audioTracks=1` (`:3692-3700`), and that output duration matches the source within tolerance. Here `durationDeltaSec=0` against a `durationToleranceSec=0.12` band — the scenario applies `TC_AUDIO_PRIMING_TOLERANCE_SEC` (`index.ts:1106-1108`) precisely because lossy MP3 encode introduces gapless encoder delay/padding; the measured delta of exactly 0 is well inside that band, so the metadata invariant is a real (not vacuous) pass. The playback-smoke oracle additionally loads the bytes into a real `<video>` element and confirms it decodes/plays frames, proving the MP4 is a valid, browser-decodable MP3-in-MP4 file rather than a structurally-plausible but undecodable blob.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_BROWSER, honest. It is a WebCodecs-backed engine; Chrome 149 `AudioEncoder.isConfigSupported({codec:'mp3'})` returns false (Chrome ships an MP3 *decoder* but no MP3 *encoder*). It correctly declined rather than faking output. Not an under-declaration — the capability truly does not exist in the runtime.
- **remotion-webcodecs@4.0.479** — NA_BROWSER, same root cause: WebCodecs has no MP3 audio encoder in Chrome 149. Honest NA.
- **platform@chrome-149** — NA_ENGINE: declares the `transcode` op but not the `mp3` audio codec. Honest — the platform path is also bounded by WebCodecs/MediaRecorder, neither of which can encode MP3.
- **mp4box@2.3.0** — NA_ENGINE: does not declare the `transcode` operation. mp4box is an MP4 box parser/muxer with no audio codec; honest NA (it could remux but cannot encode PCM→MP3).
- **remotion-media-parser@4.0.479** — NA_ENGINE: parser-only, does not declare `transcode`. Honest.
- **web-demuxer@4.0.0** — NA_ENGINE: demuxer-only, does not declare `transcode`. Honest.

All six non-winners are genuine NA, not FAILs: none produced wrong output. The gap is a true capability gap (software MP3 encoder), not a quality/perf gap.

## Anti-cheat validation

- **Scenario**: `src/scenarios/transcode/index.ts:1054-1063` — `id:'wav_to_mp3_mp4'`, `asset:'wav_s16.wav'`, `opts:{container:'mp4', audio:{codec:'mp3', bitrate:192000}}`. Notes: "PCM→MP3 (A.6, MP3 as an encode target from WAV)."
- **Fixture**: `fixtures/media/wav_s16.wav` exists, 960 KB (`stat` confirmed) — a real PCM-S16 WAV, not synthetic/empty/mock.
- **Winner adapter**: real implementation — `src/engines/ffmpeg-wasm/codecs.ts:37` (`mp3→libmp3lame`); `src/engines/ffmpeg-wasm/adapter.ts:2468-2528` builds `-c:a libmp3lame -b:a 192000 … -movflags +faststart` and runs the wasm core (`:2528`), reads back encoded bytes (`:2529`). No canned output, no input→output copy (PCM source forces re-encode, distinct from the documented mp3-frame-copy remux at `:1519`), no short-circuit to golden, no error swallowing (`NotApplicableError` is thrown, not caught-as-pass, when no encoder exists `:2470`).
- **Oracle**: `src/core/oracles.ts:3626-3708` (`transcodeOutputMetadataInvariant`) re-probes output via reference engine and checks container + track shape + duration band; plus `playback-smoke` (`:1572+`) actually plays the MP4. Measurements are physically plausible: container=mp4, audioTracks=1, durationDelta=0 within a 0.12 s priming tolerance.
- **cached**: `cached:true` — this PASS was REUSED from a prior run, not re-executed this run. Per the launcher-seeding caveat, stale PASS reuse is a known risk; the evidence is from cache, so re-running fresh (clear raw + .browser-cache) is advisable to fully re-confirm. Logic and code path are sound, so risk is low but non-zero.
- **Verdict: REAL** — real fixture + real libmp3lame wasm encode + a meaningful re-probe-and-play oracle pair. The only caveat is the cached evidence (see Confidence).

## Confidence & caveats

Confidence: **high** on the verdict (single eligible PASS; all NAs are honest capability gaps; winner implementation and oracle are genuine and quantitatively verified). Caveats: (1) the PASS is `cached:true`, so the numbers were not re-measured this run — a fresh run is recommended to rule out staleness; (2) bench n=1 (single sample, mad=0, p95=median) so the perf numbers carry no spread/statistical weight, but perf is irrelevant to the decision since there is no contender; (3) peakMemory is unmeasured (n=0) on this single-thread non-cross-origin-isolated path; (4) the correctness gate is structural-metadata + playback-smoke, not bit-exact PCM/golden-packet — adequate for a lossy MP3 encode target but not the strongest possible oracle, so this is a slightly softer (yet legitimate) correctness assertion than a decoded-frames-bitexact gate.
