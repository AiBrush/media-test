# mux/size_large_1080p_to_mp4

family: mux | fixture asset: `large_h264_1080p_120s.mp4` (90 MB, H.264 1920x1080 + AAC, 120 s, 3600 video / 5626 audio samples) | primaryMetric: throughputRealtime | passCount: 3 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (engineId `mediabunny`).
- Contested: **YES** — 3 engines PASS (mediabunny, mp4box, ffmpeg-wasm), all with byte-for-byte identical correctness evidence.
- Decisive factor: **PERFORMANCE on the primary metric `throughputRealtime`** (correctness was a tie). mediabunny sustains **378.27 x-realtime**, vs mp4box 206.71 and ffmpeg-wasm 192.14.
- Margin over runner-up (mp4box): **1.83x higher throughputRealtime** and **1.83x faster wall** (317.23 ms vs 580.51 ms). Over the 3rd-place ffmpeg-wasm: **1.97x higher throughput** / **1.97x faster wall** (317.23 ms vs 624.53 ms).
- Caveat on the win: it is decided by performance only and all three samples are n==1 (mad==0, no spread). The gap (1.8x–2.0x) is large enough to be decisive despite single-sample evidence, but it is performance-only — correctness does not separate the leaders.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass, property-invariant:pass | 317.23 ms | 378.27 x | (not measured, n=0) | 4531 ms | cached previous PASS result |
| mp4box@2.3.0 | PASS | reference-reimport:pass, property-invariant:pass | 580.51 ms | 206.71 x | 294,822,896 B (~281 MB) | 1017 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass, property-invariant:pass | 624.53 ms | 192.14 x | (not measured, n=0) | 315 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 (n/a dup) | — | — | — | — | — | — | — |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

(7 engine entries total: 3 PASS + 4 NA_ENGINE — platform, web-demuxer, remotion-media-parser, remotion-webcodecs.)

## Why the winner wins (deep technical)

This case is a pure **encoded-sample mux** (no re-encode): take already-encoded H.264 + AAC packets and author a faststart MP4 with correct `stts`/`stsz`/`stco` (or `co64`) sample tables for a many-thousand-sample file. The scenario notes (`src/scenarios/mux/size-ladder.ts:82-84`) target the stco→co64 32-bit-offset crossover that only manifests on a large file. The primary metric is `throughputRealtime` precisely because mux is an I/O-bound sample COPY — sustained throughput, not codec speed, is the meaningful axis (notes line 16-20).

Correctness is a dead heat. All three PASS engines produce output that the reference engine re-imports to **exactly 9226 packets / 5686 keyframes** (`reference-reimport`), and whose probed duration is **120.0213 s vs golden 120 s, Δ 0.0213 s ≤ 0.125 s** (`property-invariant` probe-duration). 9226 = 3600 video + 5626 audio samples (matches the ffprobe sample counts), and 5686 keyframes = 5626 all-key AAC frames + 60 H.264 IDR frames (a ~2 s / 60-frame GOP). Those numbers are physically exact for this fixture, so the oracle ladder gives no edge to anyone — the decision falls to performance.

mediabunny wins on throughput because of its mux pipeline. Its `mux()` handler (`src/engines/mediabunny/adapter.ts:1508-1600`) builds a native `mb.Output` with `EncodedVideoPacketSource` / `EncodedAudioPacketSource` and `maximumPacketCount` pre-declared per track (lines 1528-1540) — the muxer pre-sizes its sample tables so it never has to grow/relocate the index as 9226 packets stream in. It then `await output.start()` (1553), feeds raw `EncodedPacket`s straight through with the decoder config attached only to packet 0 to emit the codec-private boxes (`avcC`/`esds`) once (1570-1590), and `await output.finalize()` (1598). This is a streaming write of pre-encoded bytes — no decode, no transcode — through pure-TS/WebCodecs-free code. env.configUsed for this run shows `backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`, `sharedArrayBuffer:false`: the streaming-lockstep author keeps the working set small and avoids whole-file buffering, which is why it tops the chart at 378.27 x-realtime / 317 ms wall while requiring **no COOP/COEP isolation**.

mp4box is correct and second-fastest but pays a structural tax: env.configUsed is `backend:"pure-js"`, `pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"`, `worker:false`. It appends the whole file into a JS-side MP4Box buffer (no streaming target), which is why its peakMemory is the only one measured here at **294.8 MB (~281 MB) for a 90 MB input** — roughly 3x the input held resident — and its wall is 580.51 ms (1.83x slower than mediabunny). It runs single-threaded pure-JS box authoring, so it cannot match mediabunny's streaming sample copy.

ffmpeg.wasm is correct but slowest (624.53 ms, 192.14 x). It is a single-thread wasm build muxing through libavformat; even a copy-mux pays the wasm/JS FS round-trip (write input into MEMFS, run `-c copy`, read output) plus wasm interpreter overhead. Notably its longtasks median is the lowest (315 ms) and mediabunny's is the highest (4531 ms) — mediabunny's main-thread work is chunkier — but on the ranking metric (throughputRealtime) and wall, ffmpeg loses by ~2x.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS, lost on performance only. Same oracle evidence (9226 pkts / 5686 kf, Δ 0.0213 s) but **1.83x slower wall (580.51 vs 317.23 ms)** and the highest peak memory in the field (**294.8 MB resident for a 90 MB file**) due to `whole-file-append` pure-JS authoring with no streaming target.
- **ffmpeg.wasm@0.12.15** — PASS, lost on performance. Identical correctness, but slowest at **624.53 ms / 192.14 x (1.97x slower than mediabunny)**; single-thread wasm libavformat plus MEMFS I/O round-trips.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — the WebCodecs platform shim is a decode/encode wrapper with no container muxer, so it legitimately has no `mux` op.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — web-demuxer is a read/demux-only library; muxing is out of scope.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — media-parser is a parser/reader, not a writer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — this adapter does not register a `mux` op (its writing path is exposed via transcode/convert, not the encoded-packet mux entrypoint). Defensible NA for this specific encoded-sample mux op.

## Anti-cheat validation

- Scenario: `src/scenarios/mux/size-ladder.ts:73` (`id: 'size_large_1080p_to_mp4'`), input `large_h264_1080p_120s.mp4`, to `mp4`, codecs h264+aac, primaryMetric throughputRealtime, durationTolerance 0.125 s. Built via `buildMux` in `src/scenarios/mux/_shared.ts`.
- Fixture exists and is real: `fixtures/media/large_h264_1080p_120s.mp4` = **89,573,913 bytes (~90 MB)**; ffprobe confirms H.264 1920x1080, 3600 video frames + AAC 5626 frames, duration 120.000000 s. Golden meta/packets present (`fixtures/golden/large_h264_1080p_120s.mp4.meta.json` etc.). Not synthetic/empty.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508-1600`. Genuine implementation — constructs `mb.Output`, real `EncodedVideoPacketSource`/`EncodedAudioPacketSource`, streams every packet via `source.add(...)` and `output.finalize()`. No canned output, no input→output copy short-circuit, no golden read, no error swallowing (throws on unsupported codec/container).
- Oracles: `reference-reimport` at `src/core/oracles.ts:1223-1271` re-imports the engine's actual output bytes through an independent reference engine, counts packets/keyframes, and compares against golden within 2% rel tolerance — a real round-trip, not trivially satisfiable (fails on empty packet table or >2% divergence). `property-invariant` probe-duration at `src/core/oracles.ts:2709-2758` probes the authored output's real duration and gates Δ ≤ 0.125 s. Measurements (9226 pkts, 5686 kf, 120.0213 s) are physically exact for this fixture.
- Cached: **YES** — mediabunny, mp4box and ffmpeg-wasm all carry `cached:true` ("cached previous PASS result"). Staleness risk: these rows were reused, not freshly re-run; the timestamps differ (mediabunny/ffmpeg startedAt 2026-06-22T14:0x, mp4box 16:35). Numbers are consistent and plausible, but a fully honest fresh run would require clearing the cache (per the launcher seeding caveat). Evidence is strong enough to stand, but the win rests on cached single-sample (n==1) benchmarks.
- Verdict: **REAL**. Real 90 MB fixture, genuine streaming-mux implementation, meaningful round-trip + duration oracles with physically exact measurements. Note: gating is structural/metadata (reimport packet/keyframe count + probe duration), not bit-exact — strong but not crypto-grade; and the leaderboard decision is performance-only on cached n==1 samples.

## Confidence & caveats

- Confidence: **high** on the winner. Correctness is a verified tie (identical exact oracle measurements across all 3 PASS engines), and mediabunny leads the primary metric by a large, unambiguous margin (1.83x over #2, 1.97x over #3).
- Caveats: (1) all benchmarks are n==1 (mad==0) and `cached:true` — no spread to bound variance, and rows were reused not re-run. (2) The decision is performance-only; correctness does not separate the leaders. (3) mediabunny's peakMemory was not captured (n=0), so the memory comparison is one-sided (only mp4box reported ~281 MB). (4) The 4 NA engines are all honest "op not declared" for an encoded-packet mux; remotion-webcodecs is the only arguable one but it exposes writing via transcode/convert, not this mux entrypoint, so the NA is defensible.
