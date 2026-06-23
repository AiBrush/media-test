# mux/swap_audio_video_with_opus_to_mkv

family: mux | fixtures: h264_1080p_30s.mp4 (31M) + opus.ogg (146k) | primaryMetric: wall | passCount: 2/7

## Verdict

**Best framework: mediabunny@1.48.0** — CONTESTED (2 PASS: mediabunny, ffmpeg.wasm).

Both passing engines satisfy the identical and only gating oracle (`property-invariant` / probe-duration), so correctness strength is a tie. The decision falls to **performance on the primaryMetric (wall median)**:

- mediabunny: **185.22 ms** wall, **161.97x** realtime
- ffmpeg.wasm: 255.63 ms wall, 117.36x realtime

Decisive factor: **mediabunny is 1.38x faster on wall (255.63 / 185.22) and 1.38x higher throughput (161.97 / 117.36)**. mediabunny also has a marginally tighter duration invariant (Δ 0.0000s vs ffmpeg's Δ 0.0140s). The one metric where ffmpeg.wasm leads is main-thread blocking (longtasks 315 ms vs mediabunny 3391 ms, ~10.8x less), noted as a caveat below. Both samples are n=1 and `cached==true`, so the margin is real-but-weak evidence.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass | 185.22 ms | 161.97x | 0 (not sampled) | 3391 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 255.63 ms | 117.36x | 0 (not sampled) | 315 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |

## Why the winner wins (deep technical)

The operation is an **A/V swap into Matroska**: take the H.264 video elementary stream from `h264_1080p_30s.mp4`, discard its original AAC audio, and remux it alongside the **Opus** audio stream demuxed from `opus.ogg` into an **MKV** container (Opus is a legal Matroska payload). The runner drives this two-step: `engine.prepareMuxTracks(inputs, options)` then `engine.mux(tracks, opts)` (`src/core/runner.ts:727-733`). The scenario's `trackSelect: ['video:0@0', 'audio:0@1']` (`src/scenarios/mux/multi-source.ts:105`) means "video stream 0 from input 0, audio stream 0 from input 1" — i.e. the swap.

mediabunny's `prepareMuxTracks` (`src/engines/mediabunny/adapter.ts:1185-1240`) opens each input, walks every track with an `EncodedPacketSink` to collect packets (`adapter.ts:1206-1214`, preserving per-packet `microsecondTimestamp`/`microsecondDuration`), rebases to zero, and captures the WebCodecs `decoderConfig.description` (codec-private data) per track. The selector `selectPreparedMuxTracks` (`adapter.ts:377-414`) parses `video:0@0`/`audio:0@1` via the regex at `adapter.ts:389`, matching on `inputIndex`/`type`/`typeOrdinal`, so it picks exactly the H.264 candidate from input 0 and the Opus candidate from input 1. `mux()` (`adapter.ts:1508-1600`) then constructs an `Output` with a Matroska `OutputFormat`, attaches an `EncodedVideoPacketSource(h264)` and `EncodedAudioPacketSource(opus)`, and replays each packet as an `EncodedPacket` with the first packet carrying the `decoderConfig` so the muxer writes the correct codec-private `CodecPrivate` element (`adapter.ts:1570-1591`). This runs on the configured **WebCodecs backend with prefer-hardware** and a **streaming-lockstep pipeline, COOP/COEP not required, SharedArrayBuffer:false, wasmThreads:0** (`env.configUsed`). Because the data is already encoded, the mux is a pure packet-copy into the WebM/Matroska writer — no decode/re-encode — which is why it lands at 185.22 ms wall.

ffmpeg.wasm does the same swap but pays a heavier I/O tax. Its `prepareMuxTracks` (`src/engines/ffmpeg-wasm/adapter.ts:2791-2866`) extracts each selected stream into a **demuxable elementary file in MEMFS** via `-map 0:<idx> -c copy -f <fmt>` (`adapter.ts:2833-2836`): H.264 becomes an Annex-B `.h264` (`h264_mp4toannexb` bsf, `adapter.ts:2873`), Opus becomes `.ogg` (`adapter.ts:2881-2883`). `mux()` (`adapter.ts:2899-2947`) detects all tracks carry `ffmpegMuxSource` and delegates to `muxPreparedSources`, a real second FFmpeg `-c copy` mux of the elementary streams into the MKV. That is two FFmpeg invocations through the single-thread wasm core plus MEMFS round-trips, versus mediabunny's in-process packet shuffle — accounting for the 1.38x wall gap. ffmpeg's duration invariant landed at Δ 0.0140s (out 30.014s vs golden 30s) — well within the 0.0417s tolerance but looser than mediabunny's exact Δ 0.0000s, reflecting Annex-B/Ogg re-packetization rounding of roughly one frame.

The gating oracle `probeDurationInvariant` (`src/core/oracles.ts:3823-3880`) re-probes the muxed MKV and compares its container-declared duration against the golden 30s within `durationToleranceSec` 0.04167s. Both pass; mediabunny passes exactly. Under the correctness ladder this is a metadata-exact / property-invariant gate (mid-tier), not bit-exact — so neither engine has a strong-oracle advantage, leaving wall median as the tiebreak that mediabunny wins.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost the performance tiebreak: wall 255.63 ms vs 185.22 ms (1.38x slower) and throughput 117.36x vs 161.97x. Its two-pass elementary-extract-then-remux flow through single-thread wasm + MEMFS is the cost. Tighter only on longtasks (315 ms).
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — the WebCodecs platform shim exposes decode/encode but no container muxer for arbitrary track assembly.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — it is a parser/demuxer, no mux/write side.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — read-only demuxer by design.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — its conversion API is not registered for a raw encoded-track mux op here.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest — mp4box is ISOBMFF-only and cannot read the `opus.ogg` audio source, so the swap input is unsupported.

## Anti-cheat validation

- **Scenario**: `src/scenarios/mux/multi-source.ts:98-110` (id `swap_audio_video_with_opus_to_mkv`). Inputs `['h264_1080p_30s.mp4', 'opus.ogg']`, `to: 'mkv'`, `extraOptions.swapAudioFrom: 'opus.ogg'`, `trackSelect: ['video:0@0', 'audio:0@1']`.
- **Fixtures exist and are real media**: `fixtures/media/h264_1080p_30s.mp4` (31 MB) and `fixtures/media/opus.ogg` (146 KB) both present on disk — not synthetic/empty.
- **Winner adapter genuinely implements the op**: mediabunny `prepareMuxTracks` (`src/engines/mediabunny/adapter.ts:1185`) does real `EncodedPacketSink` demux of both sources; `selectPreparedMuxTracks` (`adapter.ts:377`) performs the real swap selection; `mux` (`adapter.ts:1508`) writes a real Matroska `Output` from `EncodedVideoPacketSource`/`EncodedAudioPacketSource` with codec-private description. No canned output, no input->output copy, no golden short-circuit, no error swallowing.
- **Oracle is a real comparison**: `probeDurationInvariant` (`src/core/oracles.ts:3823`) re-probes the produced container and diffs measured vs golden duration within a tight 0.04167s band. Measurements are physically plausible: out 30.0000s / golden 30.0000s (mediabunny), out 30.014s / golden 30.0s (ffmpeg) for a 30s source.
- **Verdict: WEAK-GATE.** Implementation and fixtures are real (would be REAL on those axes), but the ONLY gating oracle is a duration property-invariant. It confirms the MKV demuxes and reports the right runtime, but does NOT verify packet-level track content, Opus codec-private correctness, A/V interleave, or that the audio actually came from `opus.ogg` rather than the original AAC. A swap that mistakenly kept AAC but matched duration would still pass. No bit-exact/golden-packet/reference-reimport gate is present for this swap.
- **Cached note**: both winning and runner-up rows have `cached==true` ("cached previous PASS result") — neither was re-executed in this run, so the wall/throughput margin is reused evidence and carries staleness risk.

## Confidence & caveats

- Performance margin is based on **n==1, cached==true** samples for both engines (mad=0, p95==median because only one sample). The 1.38x wall lead is directionally clear but statistically weak; a fresh re-run could shift it.
- **longtasks contradicts wall**: mediabunny's longtasks (3391 ms) far exceeds its 185 ms wall and is 10.8x ffmpeg's 315 ms. This almost certainly reflects WebCodecs hardware-decoder/instrumentation warmup attributed to the main thread rather than the mux copy itself, but if main-thread responsiveness were the primary metric, ffmpeg.wasm would win. The scenario's primaryMetric is `wall`, so mediabunny prevails.
- peakMemory and targetWrites were not sampled (n=0) for either engine, so memory/streaming tiebreakers could not be applied.
- Confidence: **medium** — clear winner on the declared primary metric with a genuine implementation, but weakened by a single-oracle duration-only gate, cached-only numbers, and the longtasks anomaly.
