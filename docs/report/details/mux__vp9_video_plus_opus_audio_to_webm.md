# mux/vp9_video_plus_opus_audio_to_webm

family: mux | fixtures: vp9_1080p_10s.webm (VP9 video) + opus.ogg (Opus audio) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Decisive factor: **performance**. Both passing engines satisfy the identical (and only) gate — `property-invariant` (probe-duration) — so correctness strength is a tie. mediabunny wins on every performance axis.
- Margin over runner-up (ffmpeg.wasm@0.12.15): **1.66x faster wall** (94.94ms vs 157.61ms), **1.66x higher throughputRealtime** (105.42x vs 63.50x), and **2.87x fewer long-task ms** (1182ms vs 3391ms main-thread blocking). Both samples are n=1 (mad=0), so the spread is unmeasured and the margin is single-shot evidence — directionally clear but not statistically deep.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 94.94ms | 105.42x | 0 (not sampled) | 1182ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 157.61ms | 63.50x | 0 (not sampled) | 3391ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |

peakMemory and targetWrites have n=0 samples for both engines (not instrumented in this run).

## Why the winner wins (deep technical)

The operation is a **cross-source A/V assembly into WebM (Matroska)**: take the VP9 video track demuxed from `vp9_1080p_10s.webm` and the Opus audio track demuxed from `opus.ogg`, then interleave both into a single WebM. Both VP9 and Opus are native Matroska/WebM payloads, so no transcode is required — this is an encoded-packet **copy-mux**: the demuxer hands the runner `EncodedTracks` (opaque codec chunks with PTS/duration/keyframe flags), and the engine's job is purely to author the container (Tracks element, codec-private data, Cluster/SimpleBlock interleave, Cues/duration).

mediabunny does this through its native-TS Output writer, not a decode/encode loop. In `src/engines/mediabunny/adapter.ts:1508` (`mux`), it constructs `WebMOutputFormat` via `makeOutputFormat` (`src/engines/mediabunny/codecs.ts:171`), then builds one `EncodedVideoPacketSource(vp9)` and one `EncodedAudioPacketSource(opus)` (`adapter.ts:1528`, `:1539`) registered with `output.addVideoTrack`/`addAudioTrack`. Each source chunk becomes a real `mb.EncodedPacket(c.data, key|delta, ptsUs/1e6, durationUs/1e6, i)` (`adapter.ts:1562`), and the **first packet of each track carries a synthesized `decoderConfig`** (codec string + dimensions/sampleRate/channels + `description` codec-private bytes) so the Matroska CodecPrivate / track entry is authored correctly (`adapter.ts:1571-1590`). It then `output.start()` → per-packet `source.add` → `output.finalize()` (`adapter.ts:1553`, `:1591`, `:1598`). This is a pure byte-shuffle into the container; despite `env.configUsed.backend=webcodecs` / `hwAccel=prefer-hardware`, the WebCodecs decode/encode path is **not** exercised here (no transcode), so the win is the efficiency of mediabunny's pure-TS-ESM Matroska writer running entirely on the main thread without a wasm boundary.

ffmpeg.wasm performs the same logical copy-mux but pays the wasm tax. Its mux path rebuilds each opaque WebCodecs chunk into a demuxable elementary stream in MEMFS and then runs `ffmpeg -i vid -i aud -c copy out` (`src/engines/ffmpeg-wasm/adapter.ts:491-495`, exec at `:1779`). `-c copy` means no re-encode, but it still incurs: MEMFS writeFile of both reconstructed streams, full ffmpeg process bootstrap/argument parsing, and Matroska muxing inside a single-thread wasm VM. The shard shows the cost concretely: **longtasks 3391ms** of main-thread blocking versus mediabunny's **1182ms** (2.87x), and wall 157.61ms vs 94.94ms (1.66x). The throughput figures mirror this exactly (63.50x vs 105.42x realtime for a ~10s asset).

Correctness is identical and gated by `property-invariant` probe-duration (`src/core/oracles.ts:2709-2758`): the oracle re-probes the authored output with the reference engine and compares to the golden source duration. mediabunny's output measured **outDurationSec=10.014 vs goldenDurationSec=10.008, Δ=0.0060s**, well inside the ±0.0417s band (one frame at 24fps). ffmpeg's output measured **outDurationSec=10.042, Δ=0.0340s** — also passing but ~5.7x further from golden, consistent with ffmpeg's elementary-stream-reconstruction adding a sliver of cross-source mux rounding. So even on the single shared oracle, mediabunny's authored duration is materially closer to the source (10.008s golden).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** correct but slower — 1.66x worse wall (157.61ms), 2.87x more main-thread blocking (3391ms longtasks), and its authored duration (10.042s, Δ0.034s) drifted 5.7x further from the 10.008s golden than mediabunny's (10.014s, Δ0.006s). Root cause: single-thread wasm `-c copy` mux with MEMFS round-trip and elementary-stream reconstruction overhead.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** does not declare operation 'mux'. Honest — `@remotion/webcodecs` is a convert/transcode pipeline, not a low-level encoded-packet container author; declaring mux would be an over-claim.
- **platform@chrome-149 (NA_ENGINE):** does not declare 'mux'. Honest — the raw browser baseline (WebCodecs + `<video>`) has no container muxer primitive; authoring WebM bytes is out of platform scope.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** does not declare 'mux'. Honest — `@remotion/media-parser` is a read-only demux/probe library; it has no write/mux side.
- **web-demuxer@4.0.0 (NA_ENGINE):** does not declare 'mux'. Honest — the name says it: a demuxer only, no muxing capability.
- **mp4box@2.3.0 (NA_ENGINE):** does not declare input container 'webm'. Honest — mp4box.js is ISOBMFF-only; it cannot parse the VP9-in-WebM source, so it cannot ingest the tracks even though it can author MP4.

All five NAs are genuine capability gaps, not under-declared skips.

## Anti-cheat validation

- Scenario: `src/scenarios/mux/multi-source.ts:53` (`id: 'vp9_video_plus_opus_audio_to_webm'`), built via `buildMuxAll` in `src/scenarios/mux/_shared.ts`.
- Fixtures (real, present on disk): `fixtures/media/vp9_1080p_10s.webm` (9.3 MB) and `fixtures/media/opus.ogg` (146 KB) — both real media, not synthetic/mock/empty. Golden: `fixtures/golden/vp9_1080p_10s.webm.meta.json` declares durationSec=10.008, VP9 1920x1080@30 + Opus 48kHz stereo — physically plausible for a 10s 1080p WebM.
- Oracle: `src/core/oracles.ts:2709-2758` (`property-invariant` probe-duration branch). It re-probes the authored output with `ctx.referenceEngine.probe` and compares to golden duration with a finite per-container tolerance — a real measurement, not trivially satisfiable. Measured deltas (0.0060s / 0.0340s) are real and distinct per engine.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508-1600` — genuine `Output` + `EncodedVideoPacketSource`/`EncodedAudioPacketSource` + per-packet `EncodedPacket` + `decoderConfig` codec-private authoring + `finalize`. No canned bytes, no input→output passthrough, no short-circuit to golden, no swallowed errors (throws on unsupported codec/container).
- Verdict: **WEAK-GATE**. The implementations and fixtures are fully real (would be REAL on that basis), but the gating oracle is a single container-agnostic **duration invariant** — a proxy. It does NOT verify per-track packet fidelity, A/V interleave correctness, frame digests, or that both tracks survived (a one-track output of the right duration would pass). The scenario notes (`multi-source.ts:25-30`) openly acknowledge this: reference-reimport packet-count is omitted for multi-source because the single-asset golden would false-fail, and a `demux(mux(x))` per-track oracle "does not yet exist". So PASS is real but the correctness gate is loose for a two-track assembly.
- Cached note: BOTH passing engines have `cached:true` ("cached previous PASS result") — neither was re-run this cycle. Staleness risk: the measured durations and bench numbers are reused, not freshly produced. Per the launcher seeding caveat, treat these specific numbers as last-good rather than this-run-fresh.

## Confidence & caveats

- Confidence: **medium**. The winner is unambiguous (only 2 engines eligible, mediabunny wins all performance axes and is also closer on the duration metric), implementations are verified-real, and fixtures exist. Downgraded from high because: (1) bench is n=1/mad=0 for both, so the 1.66x margin is single-shot; (2) both results are cached, not freshly re-run; (3) the gate is a duration proxy (WEAK-GATE) that does not confirm two-track fidelity, so "correct" here means "right container + right duration", not "both tracks bit-faithfully interleaved".
- peakMemory/targetWrites were not sampled (n=0), so the memory tiebreaker could not be evaluated.
- Tiebreaker note: mediabunny also requires no COOP/COEP (`coopCoep:not-required`, `sharedArrayBuffer:false`), a deployment advantage over multi-threaded wasm — though this single-thread ffmpeg run did not need cross-origin isolation either.
