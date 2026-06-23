# remux/h264_bframes_1080p_mp4_to_mkv

- family: remux
- fixture asset: `h264_bframes_1080p.mp4` (real, ~11 MB, H.264 video + AAC audio, 1080p30, 10s)
- primaryMetric: wall (ms); secondary throughputRealtime, longtasks, peakMemory
- passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (CONTESTED with mediabunny@1.48.0).
- Both PASS engines satisfied the identical gating oracle (`reference-reimport`) with equivalent, strong correctness (2 media tracks recovered, ~770 packets, duration delta well inside tolerance). Correctness is a tie, so the decision falls to performance.
- Decisive factor: **wall-clock latency and main-thread responsiveness.** ffmpeg.wasm remuxed in 92.23ms median vs mediabunny's 129.07ms — **1.40x faster wall** and **1.40x higher realtime throughput** (108.42x vs 77.48x). It also blocked the main thread far less: **longtasks 1192ms vs 3045ms (mediabunny is 2.55x worse)**.
- Margin caveat: both engines were measured at n=1 (mad=0, p95==median), so the spread is unknown; the win is consistent across all three perf metrics but rests on single samples.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 92.23 ms | 108.42 x | n/a (n=0) | 1192 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 129.07 ms | 77.48 x | n/a (n=0) | 3045 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

peakMemory has n=0 samples for both PASS engines (not captured in this run), so it is not a usable discriminator here.

## Why the winner wins (deep technical)

The operation is a **lossless container rewrap**: take the H.264 (with B-frames) + AAC coded samples out of the ISO-BMFF/MP4 wrapper and re-emit them, byte-identical at the elementary-stream level, into a Matroska (MKV) wrapper. No decode/re-encode is involved, so codec quality is irrelevant; what matters is (a) correctly carrying every coded packet and (b) preserving the B-frame DTS/PTS reorder spread across the wrapper change (scenario note: "B-frame reorder must survive the wrapper change: dts/pts spread preserved"). Because both engines did the rewrap correctly, the differentiator is the cost of the demux→mux pipeline.

**ffmpeg.wasm** does the rewrap with a single native FFmpeg stream-copy invocation: `[-i in -map 0 -c copy out.mkv]` (src/engines/ffmpeg-wasm/adapter.ts:2044). `-c copy` means the AVPacket payloads are passed straight from the MP4 demuxer to the Matroska muxer with no codec context, and `-map 0` forces every input stream through so the second (audio) track is not dropped by FFmpeg's default one-stream-per-type selection. The FFmpeg MP4 demuxer reads the B-frame `ctts` (composition-time-offset) table and hands the muxer correct DTS/PTS pairs, which Matroska stores as block timestamps + `BlockDuration`; the reorder is preserved structurally. This is a tight, C-compiled demux/mux loop inside one wasm module, which is why it finishes in 92ms and emits only one 1192ms long task.

**mediabunny** runs the same rewrap through its higher-level `Conversion` API: `Output({format: Matroska, target: BufferTarget})` driven by `runConversion(...)` (src/engines/mediabunny/adapter.ts:1250-1256). Because no transcode options are passed, the Conversion stream-copies the encoded tracks (the adapter's capabilities declare `remux: true`, adapter.ts:1025). This path is correct — it produced 2 media tracks and 772 packets on re-import — but the pure-TypeScript ESM core (`env.configUsed.coreBuild: "pure-ts-esm"`, `wasmThreads: 0`, `sharedArrayBuffer: false`) parses and rebuilds the box/element structure in JS, which is slower and far burstier on the main thread (3045ms of long tasks, 2.55x ffmpeg's). Its `backend: webcodecs`/`hwAccel: prefer-hardware` config is moot here because a stream-copy never touches the video decoder/encoder.

**Oracle evidence (real numbers from the shard):** the gating oracle is `reference-reimport` (src/core/oracles.ts:1225, semantic remux branch `semanticRemuxReimport` at 1273). It feeds each engine's output bytes back through a reference demuxer and checks media-track count, per-type track layout, and duration drift.
- ffmpeg.wasm: reimportPackets 770, reimportKeyframes 472, reimportMediaTracks 2 == goldenMediaTracks 2, durationDeltaSec 0.0420 < tol 0.10.
- mediabunny: reimportPackets 772, reimportKeyframes 474, reimportMediaTracks 2 == goldenMediaTracks 2, durationDeltaSec 0.0690 < tol 0.10.

The tiny packet/keyframe count difference (770/472 vs 772/474) is the kind of harmless edge-sample variance the oracle tolerates (it only flags >2% divergence or a track-count/duration mismatch); neither is "more correct." ffmpeg's smaller duration delta (0.042 vs 0.069s) is a marginal structural edge but both are comfortably inside the 0.1s band, so correctness is treated as a tie and performance decides.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed with equally strong correctness but lost on performance: 1.40x slower wall (129.07 vs 92.23ms), 1.40x lower throughput (77.48x vs 108.42x), and 2.55x more main-thread blocking (3045 vs 1192ms long tasks). Root cause: pure-TS ESM single-thread core (no wasm threads / SAB) doing JS-level box→element rebuild vs ffmpeg's compiled stream-copy loop.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest gap; its adapter declares `containersOut: ['mp4']` (src/engines/mp4box/adapter.ts:647). MP4Box.js is an ISO-BMFF library and cannot write Matroska.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest gap; `containersOut` is mp4/webm/wav only (src/engines/remotion-webcodecs/adapter.ts:248) — it cannot mux MKV.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest; the browser exposes no native container-rewrap API (WebCodecs decodes/encodes frames but does not mux containers).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest; web-demuxer is a demux-only (read) library with no muxer.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest; it is a parser/probe library with no write/mux path.

All five NAs are genuine capability gaps (missing op or missing output container), not under-declared capabilities being hidden to dodge a hard test.

## Anti-cheat validation

- Scenario definition: src/scenarios/remux/index.ts:53-60 — `{ asset: 'h264_bframes_1080p.mp4', from: 'mp4', to: 'mkv', videoCodecs: ['h264'], audioCodecs: ['aac'], notes: 'B-frame reorder must survive the wrapper change: dts/pts spread preserved.' }`.
- Fixture: `fixtures/media/h264_bframes_1080p.mp4` exists (~11 MB) — a real H.264+AAC 1080p file, not synthetic/empty/mock. Golden meta `fixtures/golden/h264_bframes_1080p.mp4.meta.json` confirms mp4 / 10s / video h264 1920x1080@30 + audio aac 48k stereo (2 tracks), matching the oracle's goldenMediaTracks=2.
- Oracle: src/core/oracles.ts:1225 `referenceReimport` → 1273 `semanticRemuxReimport`. It re-demuxes the engine's actual output bytes, fails on empty packet table (line 1244/1250), enforces media-track count + per-type layout equality (1289-1298), and enforces duration drift within a tolerance floored at 0.1s (1318-1322). This is a real structural round-trip comparison, not trivially satisfiable, and the recorded measurements (770/772 packets, 472/474 keyframes, 2 tracks, sub-0.07s drift) are physically plausible for a 10s 1080p30 H.264+AAC clip.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2031-2069 `remux()` — genuine FFmpeg `-map 0 -c copy` stream-copy into the requested container; reads real output via `readBinary(outName)` (no canned bytes, no input→output copy fake, no golden short-circuit, no error swallowing — `this.run(args)` throws on non-zero exit).
- Verdict: **REAL** — real fixture, real stream-copy implementation in both PASS engines, and a meaningful structural re-import oracle with plausible measurements.
- Cached note: both PASS results have `cached: true` ("cached previous PASS result"). They were reused, not freshly re-run in this run, so the exact perf numbers carry mild staleness risk; however the qualitative ranking (ffmpeg faster + far fewer long tasks) is robust to small drift.

## Confidence & caveats

- Confidence: **high** on the winner (consistent across all three measured perf metrics; correctness tie is well established by identical oracle pass + matching track/packet counts).
- Caveats: (1) both engines measured at n=1 (mad=0, p95==median) — perf margins are single-sample. (2) Both results are cached, not re-run this session. (3) peakMemory was not captured (n=0) so the memory dimension could not be compared. (4) The 1.40x wall margin is meaningful but not enormous; if mediabunny were rebuilt with a wasm/threaded core the gap could narrow.
