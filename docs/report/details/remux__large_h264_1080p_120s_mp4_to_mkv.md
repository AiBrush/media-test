# remux/large_h264_1080p_120s_mp4_to_mkv

family: remux | fixture asset: `large_h264_1080p_120s.mp4` (90 MB real file, fixtures/media/) | primaryMetric: throughputRealtime | passCount: 2/7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- **CONTESTED**: 2 engines PASS (mediabunny, ffmpeg-wasm); both satisfy the identical single gating oracle `reference-reimport` at equal strictness, so correctness is a tie and the decision falls to the scenario's declared primary metric, `throughputRealtime`.
- **Decisive factor: sustained remux throughput.** ffmpeg-wasm = 233.87 x-realtime, mediabunny = 83.98 x-realtime — a **2.78x throughput margin** (equivalently 513.1 ms vs 1428.9 ms wall, also 2.78x faster). longtasks are comparable (1073 ms vs 1017 ms) and peakMemory was not captured (0 samples) for either, so it cannot break the tie. Both are n==1 single-shot, cached results, so the throughput delta — while large — rests on one sample each (see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 513.09 | 233.87 | n/a (n=0) | 1073 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 1428.93 | 83.98 | n/a (n=0) | 1017 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

## Why the winner wins (deep technical)

The operation is a **lossless container rewrap**: take H.264 video + AAC audio elementary streams out of an MP4 (ISOBMFF) `moov`/`mdat` layout and repackage the same encoded samples into a Matroska (MKV) EBML/Cluster layout. There is **no re-encode** — the codec bitstreams are byte-identical; only the container framing (sample tables vs SimpleBlock/BlockGroup clusters, timestamps, track headers) changes. This is fundamentally an I/O- and parsing-bound copy, which is exactly why the scenario (src/scenarios/remux/size-ladder.ts:9-11, 33-45) ranks the large rung by `throughputRealtime` (output media-seconds per wall-second) rather than by a decode-quality metric.

ffmpeg-wasm performs this via a single native FFmpeg stream-copy invocation. Its `remux()` (src/engines/ffmpeg-wasm/adapter.ts:2031-2069) writes the input into MEMFS, probes it once with `runInfo`, then builds the argv `[...inputOptions, '-i', <in>, '-map', '0', '-c', 'copy', <out.mkv>]` (adapter.ts:2044) and runs a single `exec`. `-map 0 -c copy` means the wasm-compiled libavformat demuxes the MP4 sample table and remuxes the *already-encoded* packets straight into the Matroska muxer — no codec context is opened, no frames are decoded or re-encoded. For an MKV target it adds no faststart/fragmentation flags (those branches are MP4/MOV/TS only, adapter.ts:2045-2055), so the MKV path is a clean one-pass copy. The whole 120 s / 90 MB file is processed by tightly-vectorized C in one wasm call, which is why it sustains **233.87 x-realtime** and finishes in **513 ms**.

mediabunny also does a genuine sample copy, via its `Conversion` API with no transform options (src/engines/mediabunny/adapter.ts:1244-1260): it opens the input, builds a Matroska `OutputFormat` + `BufferTarget` (`makeOutputFormat('mkv', ...)`, where matroska/mkv is recognized at adapter.ts:284), and runs `runConversion(...)` (adapter.ts:846-855 → `conversion.execute()`). Because no video/audio re-encode options are passed, the conversion copies encoded packets. The cost difference is architectural: mediabunny runs a pure-TypeScript/ESM streaming-lockstep pipeline in JS (`coreBuild: "pure-ts-esm"`, `pipeline: "streaming-lockstep"`, `wasmThreads: 0`, `sharedArrayBuffer: false` per its `env.configUsed`), demuxing and re-muxing ~9228 packets through JS object plumbing rather than compiled C. That is the mechanistic reason it lands at **83.98 x-realtime / 1429 ms** — ~2.78x slower wall for the identical lossless rewrap.

Correctness is genuinely a tie, confirmed by the oracle measurements. The gating oracle `reference-reimport` (src/core/oracles.ts:1225-1271, structural branch `semanticRemuxReimport` at oracles.ts:1273-1324) re-imports each engine's MKV output with the reference engine and checks media-track count, per-type track layout, and duration drift against the golden (`large_h264_1080p_120s.mp4.meta.json`: 2 tracks, 120 s). Both engines pass with **2 media tracks == goldenMediaTracks 2** and sub-tolerance duration drift: ffmpeg `durationDeltaSec 0.042` and mediabunny `durationDeltaSec 0.064`, both under the `0.1 s` tolerance. Packet tables are near-identical (ffmpeg 9226 packets / 5686 keyframes; mediabunny 9228 / 5688) — the 2-packet / 2-keyframe difference is normal container-edge framing and is not even compared here (this oracle gates on track semantics + duration, not exact packet count). Neither engine ran the stricter `decoded-frames-bitexact` gate, which is deliberately omitted for the default remux battery while source-frame goldens are placeholders (src/scenarios/remux/_shared.ts:19-21). So both PASS at the same correctness strength; performance is the sole, legitimate tiebreaker, and the scenario explicitly nominates `throughputRealtime` as the leaderboard number.

## What each other framework did wrong

- **mediabunny@1.48.0** — Not wrong: it PASSed the same oracle with valid output (2 tracks, 0.064 s duration drift). It simply *lost on speed*: 83.98 x-realtime vs 233.87 (0.36x the winner's throughput; 1429 ms vs 513 ms wall, 2.78x slower), because its pure-TS ESM streaming pipeline (no wasm, no SAB/threads) copies packets in JS rather than compiled C.
- **platform@chrome-149** — NA_ENGINE, honest: declares `remux: false` (src/engines/platform/adapter.ts:233) and `remux()` throws `NotApplicableError` (adapter.ts:355-356). Raw WebCodecs/platform APIs have no lossless container muxer, so this is a true capability gap, not an under-declaration.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: it is a read-only parser with no muxer; `remux()` throws "read-only parser; no muxer" (src/engines/remotion-media-parser/adapter.ts:548-549). Genuine NA.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: a demux-only engine; remux is among its undeclared operations (src/engines/web-demuxer/adapter.ts:1043), so it cannot rewrap. Genuine NA.
- **mp4box@2.3.0** — NA_ENGINE, honest: `containersOut: ['mp4']` only (src/engines/mp4box/adapter.ts:647); MP4Box.js is an ISOBMFF-only writer and "any non-mp4 target throws" (adapter.ts:911). It physically cannot emit MKV. Correct NA on container, not operation.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest: `containersOut: ['mp4','webm','wav']` (src/engines/remotion-webcodecs/adapter.ts:248). It reads MKV but cannot *write* Matroska, so MKV output is a real gap. Correct NA on output container.

## Anti-cheat validation

- **Scenario**: src/scenarios/remux/size-ladder.ts:33-45 (case `asset: 'large_h264_1080p_120s.mp4'`, `from: 'mp4'`, `to: 'mkv'`), built by `buildRemux`/`remuxId` (src/scenarios/remux/_shared.ts:73-104), primaryMetric overridden to `throughputRealtime` at size-ladder.ts:85.
- **Fixture exists & is real**: `fixtures/media/large_h264_1080p_120s.mp4` is a 90 MB on-disk H.264/AAC MP4 (not synthetic/empty/mock). Golden `fixtures/golden/large_h264_1080p_120s.mp4.meta.json` confirms 1920x1080 H.264 @ 30fps + 48 kHz stereo AAC, 120 s — consistent with the re-import packet counts (~9227) and keyframes (~5687). NOTE: the scenario header (size-ladder.ts:15-19) warns these large rungs *could* resolve to NA(asset-missing) until a bake completes; here the asset is genuinely present, so the warning does not apply.
- **Winner implementation is genuine**: ffmpeg-wasm `remux()` (src/engines/ffmpeg-wasm/adapter.ts:2031-2069) issues a real `-map 0 -c copy` FFmpeg stream copy to `<out>.mkv` and reads the produced bytes back from MEMFS (adapter.ts:2063-2064). No canned output, no input->output passthrough, no short-circuit to the golden, no error swallowing (`this.run` throws on non-zero exit).
- **Oracle is meaningful**: `reference-reimport` (src/core/oracles.ts:1225-1271, 1273-1324) actually demuxes the engine's output with the reference engine and compares media-track count, track layout, and duration vs golden with a 0.1 s tolerance — it is not a smoke-only or always-true gate. Measurements (2 tracks, 0.042 s / 0.064 s drift, 9226/9228 packets) are physically plausible for this media. It is, however, a *structural* gate, not bit-exact frame comparison.
- **Cached note**: BOTH PASS results have `cached: true` ("cached previous PASS result"). The throughput numbers were reused, not re-run this session — staleness risk exists, and the 2.78x margin rests on a single (n==1) cached sample per engine.
- **Verdict: WEAK-GATE.** The fixture and both implementations are real and the oracle performs a real comparison, but the only gate attached is the structural `reference-reimport` (track-count + layout + 0.1 s duration tolerance) — no bit-exact or packet-exact correctness gate runs, so a subtly-wrong rewrap that preserved track count and duration could still pass. The win is real but not maximally strong.

## Confidence & caveats

- Confidence: **medium**. The winner selection is unambiguous (only 2 PASS; same oracle; large, monotone throughput margin in the declared primary metric), but: (1) the gating oracle is structural/proxy, not bit-exact; (2) both samples are `cached==true` and `n==1` with `mad==0`/identical p95 (no spread to assess stability); (3) peakMemory — a co-primary axis the scenario cares about at scale (size-ladder.ts:9-11) — was not captured (0 samples) for either engine, so the memory dimension of "best at scale" is unmeasured. A fresh, multi-sample re-run with peakMemory instrumentation would harden the verdict.
