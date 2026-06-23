# transcode/aac_to_mp3_mp4

family: transcode | fixture asset: `aac_adts.aac` (ADTS-wrapped AAC, 164 KB) | primaryMetric: wall (ms) | passCount: 1/7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- Contested: **No** — uncontested. Exactly one engine reached `PASS`; the other six are NA (declaration or browser-capability gaps).
- Decisive factor: ffmpeg.wasm is the only engine that ships a real **MP3 (libmp3lame) encoder** inside its wasm core. Every other engine that even declares `transcode` here defers MP3 encoding to the browser's WebCodecs `AudioEncoder`, which returns `isConfigSupported=false` for `mp3` in Chrome 149 → NA_BROWSER. The remaining engines do not declare `transcode` at all (NA_ENGINE), or do not declare the `adts` input container.
- Margin over runner-up: not applicable (no second PASS). Absolute performance: wall median **135.63 ms**, throughputRealtime **73.96x**, longtasks **1598 ms**, peakMemory not sampled (n=0).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass, playback-smoke:pass | 135.63 ms | 73.96x | n/a (n=0) | 1598 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'mp3' (AudioEncoder.isConfigSupported=false) |
| remotion-webcodecs@4.0.479 | NA_BROWSER | — | — | — | — | — | browser cannot encode audio codec 'mp3' (AudioEncoder.isConfigSupported=false) |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a **lossy→lossy audio transcode across containers**: decode AAC carried in a raw ADTS elementary stream, re-encode the PCM to MPEG-1/2 Layer III (MP3) at 192 kbps, and mux the MP3 frames into an ISO-BMFF (MP4) container. Two things make this hard in a browser sandbox: (1) an **MP3 encoder** is required, and (2) the source is bare **ADTS**, not an MP4/file-system-friendly container, so the engine must parse the AAC elementary stream itself.

ffmpeg.wasm is the only engine that satisfies both. Its `transcode` adapter (`src/engines/ffmpeg-wasm/adapter.ts:2165`) writes the input bytes to the wasm FS (`writeInput`, line 2203), probes the input via `runInfo`/`metadataFromLog` (line 2206) to confirm an audio track exists (line 2215-2217), then builds a genuine ffmpeg command line: `-c:a <encoder>` where `audioEncoderName('mp3')` resolves to `libmp3lame` (line 2468-2472), `-b:a 192000` from `opts.audio.bitrate` (line 2505), output name `<base>.out.mp4` (line 2202) with MP4 muxing flags applied for the `mp4` container (line 2517+). The output is read back as real bytes via `readBinary(outName)` and returned with `containerMime('mp4')`. This is an honest lame encode + MP4 mux, not a copy or canned blob.

The gating oracle is `property-invariant / transcode-output-metadata` (`src/core/oracles.ts:3630-3708`). It re-probes the produced bytes with the reference engine (line 3641) and asserts: container equals the requested `mp4` (line 3655), exactly the requested audio track shape exists (`audioTracks` filter, line 3692-3699), and duration stays within tolerance vs the golden source (line 3661-3677). The shard's measurements are physically plausible for this fixture: `audioTracks=1`, `durationDeltaSec=0.00433s` against `durationToleranceSec=0.12s` — i.e. the transcoded MP3-in-MP4 reproduces the source duration to ~4 ms, well inside the relaxed lossy band. The second oracle, `playback-smoke`, decoded and played a few frames of the output `<video>`, confirming the MP4 is actually demuxable/decodable by the browser, not merely a well-formed header.

Because this is lossy→lossy (AAC→MP3), the scenario notes (`src/scenarios/transcode/index.ts:1022`) explicitly gate on **output format and shape, not bit-exactness** — there is no valid PCM-bit-exact reference to compare against after two lossy codec passes, so the metadata+smoke gate is the correct (and the strongest meaningful) oracle for this codec pair. Backend: ffmpeg.wasm runs its **single-thread wasm core** for transcode by design (adapter header note at line 10: defaults to single-thread core to avoid pthread instability during real transcode cells), so the 135.63 ms wall and 73.96x realtime throughput are from a single-threaded software lame encode of a short audio clip — entirely plausible.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_BROWSER, honest. It declares `transcode` but routes MP3 encoding through WebCodecs `AudioEncoder`; Chrome 149 reports `AudioEncoder.isConfigSupported({codec:'mp3'})=false` (Chromium ships no MP3 *encoder*), so it correctly declines rather than faking output. This is a genuine runtime capability gap, not an under-declaration.
- **remotion-webcodecs@4.0.479** — NA_BROWSER, honest. Same root cause: WebCodecs-backed encode, no MP3 encoder in Chrome 149.
- **platform@chrome-149** — NA_ENGINE, honest. The platform adapter does not declare the `adts` raw-AAC input container, so the harness gates it out before any encode attempt. Reasonable: the browser MediaSource/decoding path is not wired for bare ADTS elementary streams here.
- **mp4box@2.3.0** — NA_ENGINE, honest. mp4box is an ISO-BMFF box parser/muxer; it has no audio codec and does not declare the `transcode` operation. Correct NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest. A parser/demuxer only; does not declare `transcode`. Correct NA.
- **web-demuxer@4.0.0** — NA_ENGINE, honest. A demuxer only; does not declare `transcode`. Correct NA.

None of the NAs look like under-declared capability: MP3 encode is genuinely absent in WebCodecs, and the NA_ENGINE engines are parsers/muxers with no encoder at all.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:1015` (`id: 'aac_to_mp3_mp4'`), input field `asset: 'aac_adts.aac'` (line 1016), `opts: { container:'mp4', audio:{ codec:'mp3', bitrate:192000 } }` (line 1021), notes confirming the output-format gate for lossy→lossy (line 1022).
- Fixture: `fixtures/media/aac_adts.aac` exists, 164 KB — a real ADTS/AAC media file, not synthetic/empty/mock.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2165` (`transcode`), with the real lame path at lines 2468-2472 (`-c:a libmp3lame`), 2505 (`-b:a 192000`), 2202/2517 (MP4 output + movflags), and a real readback at 2257/2508-area `readBinary`. No hardcoded bytes, no input→output copy, no short-circuit to a golden file, no error swallowing (failures throw).
- Oracle: `src/core/oracles.ts:3630` (`transcode-output-metadata`) re-probes the produced bytes via the reference engine and checks container/track-shape/duration; tolerance 0.12 s is appropriate for a lossy transcode and is NOT trivially wide (measured Δ 0.00433 s is far tighter than the gate). Plus `playback-smoke` (`src/core/oracles.ts:1575`) confirms real decodability.
- Verdict: **REAL** — real ADTS/AAC fixture, a genuine libmp3lame encode + MP4 mux in the wasm core, and a meaningful metadata+playback oracle whose measurements (audioTracks=1, Δduration 4.3 ms vs 120 ms tol) are physically plausible for this codec/container pair.
- Cached note: the winner's result is `cached==true` ("cached previous PASS result"), so the timings (wall 135.63 ms, throughput 73.96x, longtasks 1598 ms) were **reused, not re-run** this session — staleness/timing-drift risk applies to the numbers, though the PASS/oracle logic is sound.

## Confidence & caveats

- Confidence: **high** for the verdict (single eligible PASS; all NAs independently verified as honest in code).
- Caveat 1: bench numbers come from a cached result (`cached=true`); treat the absolute timings as indicative, not freshly measured.
- Caveat 2: `n=1` for all bench metrics (mad=0, single sample), and `peakMemory` was not sampled (n=0) — weak performance evidence, but performance is moot since the win is uncontested on capability.
- Caveat 3: this is a lossy→lossy transcode; the gate is intentionally a format/shape+smoke gate, not bit-exact. The PASS is real but is a structural/metadata-strength oracle, not a crypto/bit-exact one — appropriate for AAC→MP3.
