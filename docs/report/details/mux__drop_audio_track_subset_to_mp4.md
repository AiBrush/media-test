# mux/drop_audio_track_subset_to_mp4

family: mux | fixture asset: `fixtures/media/h264_multitrack.mp4` (4.5 MB, 1 video + 2 audio, H.264/AAC) | primaryMetric: wall | passCount: 3/7

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED — three engines PASS (mediabunny, ffmpeg.wasm, mp4box), all with the identical single oracle outcome. Correctness is therefore a dead heat, so the decision falls to **performance**.

Decisive factor: **wall-clock latency**. mediabunny mux'd the subset in **40.17 ms** vs ffmpeg.wasm **59.09 ms** (1.47x slower) and mp4box **106.94 ms** (2.66x slower). It also has the lowest peak memory of the engines that report it (40.6 MB vs mp4box 63.3 MB; ffmpeg.wasm did not report peakMemory). Margin over runner-up (ffmpeg.wasm): **1.47x faster wall, 1.47x higher throughput-realtime (248.9x vs 169.2x)**.

Caveat to the win: mediabunny's `longtasks` measurement is **1007 ms**, the WORST of the three (ffmpeg.wasm 315 ms, mp4box 3638 ms — actually worst), so on main-thread responsiveness mediabunny is between the two. The wall/throughput win is unambiguous; the longtask figure is the one metric where it is not the leader.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 40.17 ms | 248.91x | 40,575,179 B (40.6 MB) | 1007 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 59.09 ms | 169.22x | 0 (not reported) | 315 ms | cached previous PASS result |
| mp4box@2.3.0 | PASS | property-invariant:true | 106.94 ms | 93.51x | 63,276,933 B (63.3 MB) | 3638 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

All three PASS engines passed the SAME oracle with the SAME measurement: `outDurationSec=10.021333`, `goldenDurationSec=10`, `deltaSec=0.021333`, `durationToleranceSec=0.041667` → `Δ 0.0213s ≤ 0.0417s`.

## Why the winner wins (deep technical)

The operation is a **track-subset mux**: open `h264_multitrack.mp4` (ISO-BMFF, 1 H.264 video + 2 AAC audio tracks), demux to encoded packets, then re-mux ONLY {video:0, audio:0} into a new faststart MP4 — dropping audio:1. `extraOptions.trackSelect = ['video:0','audio:0']` (src/scenarios/mux/multi-source.ts:88) carries the subset; the second audio track must NOT appear in the output. No transcode occurs — all three engines stream-copy encoded packets.

The runner (src/core/runner.ts:724-733) calls `engine.prepareMuxTracks(inputs, options)` then `engine.mux(tracks, opts)`. `trackSelect` is NOT interpreted in core — each adapter must parse and honour it. mediabunny does so genuinely in `selectPreparedMuxTracks` (src/engines/mediabunny/adapter.ts:377-414): it regex-parses each `type:ordinal(@input)` selector (line 389 `/^([a-z]+):(\d+)(?:@(\d+))?$/`), then matches a prepared candidate by `inputIndex`/`type`/`typeOrdinal` (line 395-397). With `['video:0','audio:0']` against a 1-video/2-audio source it returns exactly the video and the FIRST audio candidate, structurally discarding audio:1. The selected `EncodedTracks` are then muxed via `mb.Output` + `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (src/engines/mediabunny/adapter.ts:1508-1551): each surviving track is registered with `addVideoTrack`/`addAudioTrack` (lines 1529, 1540) and its packets re-fed as `EncodedPacket`s (line 1562) — a real ISO-BMFF author through mediabunny's pure-TS muxer, not a copy of the input bytes.

Mechanistically, mediabunny is fastest because of its backend choice (env.configUsed): `backend=webcodecs`, `coreBuild=pure-ts-esm`, `wasmThreads=0`, `sharedArrayBuffer=false`, `coopCoep=not-required`, `pipeline=streaming-lockstep`. For a stream-COPY mux no decode/encode runs, so the work is pure JS packet shuffling + box authoring. mediabunny's pure-TS ESM muxer pays **zero wasm instantiation cost and zero module-boot overhead**, so for a 10 s clip it finishes in 40 ms. ffmpeg.wasm (1.47x slower at 59 ms) carries the cost of marshalling input into the wasm MEMFS, running the libavformat `-map`/`-c copy` pipeline, and reading the result back across the JS↔wasm boundary — even with the single-thread copy path that is heavier than a native-JS box write. mp4box (2.66x slower at 107 ms, `backend=pure-js`, `pipeline=whole-file-append(MP4BoxBuffer+fileStart)`) is slowest because it buffers and appends the WHOLE file through its ISOFile sample-extraction path before re-authoring, which also explains its highest peak memory (63.3 MB vs mediabunny 40.6 MB) and a 3638 ms longtask.

The oracle is `property-invariant` on the `probe-duration` branch (src/core/oracles.ts:2709-2759): it reference-probes the authored output's duration and compares to the golden source duration with a container-keyed tolerance. mediabunny's output probed at 10.0213 s vs golden 10 s — a 0.0213 s delta, well inside the 0.0417 s band (≈±1 frame at 24 fps). The 0.0213 s positive offset is the expected AAC priming/last-partial-frame rounding from re-authoring the audio track, which is physically plausible for a real AAC-in-MP4 remux. The measurement is identical across all three engines, confirming they all produced a ~10 s output.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on performance: 59.09 ms wall (1.47x slower than mediabunny), 169.22x throughput vs 248.9x. It did NOT report peakMemory (0, not measured), so it cannot be credited on memory. Its single advantage is the lowest `longtasks` (315 ms). Correctness identical (same probe-duration outcome). Loses purely on the primary metric.
- **mp4box@2.3.0** — PASS, lost on performance decisively: 106.94 ms wall (2.66x slower), 93.51x throughput (lowest), highest peak memory (63.3 MB), and worst longtask (3638 ms) from its whole-file-append pipeline. Correctness identical. Clear last among PASS engines.
- **platform@chrome-149** — NA_ENGINE, honest: declares `mux: false` (src/engines/platform/adapter.ts:235) because MediaRecorder cannot ingest opaque pre-encoded packets — it only records from live MediaStream/canvas sources, so packet-level re-mux is genuinely impossible. Honest NA, not an under-declared capability.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: a demux-only library; its `mux()` throws (src/engines/web-demuxer/adapter.ts:1064, "undeclared operations" block). No mux capability exists. Honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: a media PARSER (read-only). No container-write/mux path. Honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest: WebCodecs decode/encode wrapper without a track-subset MP4 muxer declared for this op. Honest NA.

## Anti-cheat validation

- Scenario definition: src/scenarios/mux/multi-source.ts:81-94 (id `drop_audio_track_subset_to_mp4`, `input: 'h264_multitrack.mp4'`, `to: 'mp4'`, `extraOptions.trackSelect=['video:0','audio:0']`).
- Fixture: `fixtures/media/h264_multitrack.mp4` EXISTS (4.5 MB, real multitrack ISO-BMFF). Not synthetic/empty/mock.
- Oracle: src/core/oracles.ts:2709-2759 (`property-invariant` → probe-duration branch). It reference-probes the AUTHORED output and compares duration to the golden with a real ±0.0417 s tolerance; the measurements (10.0213 s, Δ 0.0213 s) are physically plausible for a real AAC-in-MP4 re-author.
- Winner adapter: src/engines/mediabunny/adapter.ts — `selectPreparedMuxTracks` (377-414) does a real regex-driven track subset; `mux` (1508-1551) authors a real MP4 via `mb.Output`/`EncodedVideoPacketSource`/`EncodedAudioPacketSource`. No canned output, no input→output byte copy, no golden short-circuit, no error swallowing.
- Verdict: **WEAK-GATE**. The implementation and fixture are real, but the ONLY gating oracle is probe-duration, which checks output DURATION — it never verifies that audio:1 was actually dropped or that the output contains exactly {video, audio:0}. A muxer that KEPT both audio tracks (or dropped the wrong one) would have the SAME ~10 s duration and still PASS. The scenario notes (multi-source.ts:91-93) and `_shared.ts` (defaultOracles 183-195) explicitly omit reference-reimport for track-subset cases ("subset ≠ source golden packet count") and there is no `demux(mux(x))` track-count oracle in oracles.ts. So the PASS is real but does NOT prove the core intent (the drop). This is a structural gap in the gate, not adapter cheating — the winner's code does perform the drop; it is simply unverified by the oracle.
- Cached note: all three PASS results have `cached==true` ("cached previous PASS result"). Numbers were REUSED, not freshly re-run, and every bench metric is `n==1` (no mad/p95 spread). Performance ranking is therefore single-sample evidence and carries staleness risk.

## Confidence & caveats

Confidence: **medium**. The winner ranking is clear on the primary metric (1.47x / 2.66x wall margins are large), the fixture and adapters are genuinely real, and the NA engines are honestly declared. Confidence is held to medium because: (1) the gate is a WEAK probe-duration check that does not validate the actual track drop — so all three "PASS" outputs are only proven to be ~10 s long, not correctly subsetted; (2) every metric is `n==1` with `cached==true`, so the perf margins rest on single, possibly stale samples; (3) mediabunny is NOT the leader on longtasks (1007 ms vs ffmpeg.wasm 315 ms) and ffmpeg.wasm did not report peakMemory, leaving memory comparison only between mediabunny and mp4box.
