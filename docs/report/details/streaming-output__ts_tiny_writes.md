# streaming-output/ts_tiny_writes

**Family:** streaming-output | **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio in progressive MP4, ~31 MB) | **Operation:** remux MP4 -> MPEG-TS, `target: 'stream'`, `writeChunkBytes: 188` | **primaryMetric:** wall (median ms) | **passCount:** 1 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` (env.engineId `mediabunny`).
- **Contested?** No — **uncontested**. Exactly one engine reached `status==PASS`; the other six are `NA_ENGINE` (operation/feature/container not declared).
- **Decisive factor:** mediabunny is the only engine in the matrix that declares the `remux` operation AND the `ts` output container AND the `target:writes` streaming-write feature. Every other engine self-disqualified at capability gating before any oracle ran, so there is no runner-up to compute a margin against. Margin over runner-up: N/A (no second PASS).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 433.085 ms | 69.270 x-realtime | 0 (not sampled, n=0) | 238 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Additional mediabunny bench: `targetWrites=862` (count), `bytesOut=32,242,940` bytes (~32.2 MB of TS). durationMs (full op incl. setup) = 4706 ms.

## Why the winner wins (deep technical)

This case asks for a **lossless container change from progressive MP4 (H.264/AAC) into MPEG-TS**, emitted through a *streaming* output target in many small 188-byte-aligned writes (188 bytes is the canonical MPEG-TS packet size). MPEG-TS is a packet-multiplexed transport container (PAT/PMT + 188-byte TS packets carrying PES), structurally unrelated to ISO-BMFF; producing it requires a muxer that actually understands TS packetization, not just byte-copying an MP4. Only mediabunny ships that muxer in this matrix, and it ships it bound to a real streaming write path.

Mechanistically, the adapter's `remux()` (src/engines/mediabunny/adapter.ts:1244) takes the non-`fastStart:'reserve'` path: it builds an `OutputFormat` for `ts` via `makeOutputFormat('ts', ...)` (adapter.ts:1250), opens the source MP4 with `openInput` (adapter.ts:1252), constructs an instrumented `StreamTarget`, and drives a mediabunny `Conversion` to completion via `runConversion` (adapter.ts:1256). Because no codec/transform options are passed, Conversion copies the **encoded** H.264 NAL samples and AAC frames straight into the TS PES layer — a true remux, not a transcode. The `target:'stream'` branch of `instrumentedOutputTarget` (adapter.ts:776-817) wires a real `WritableStream<StreamTargetChunk>` into `mb.StreamTarget` (adapter.ts:801) and counts every `write()` callback (`markWrite`, adapter.ts:771-774). The shard's `targetWrites=862` is exactly that counter firing once per chunk mediabunny pushed to the transport stream, and `bytesOut=32,242,940` is the reassembled TS payload (chunks placed at their `chunk.position` into a `maxEnd`-sized buffer, adapter.ts:804-808). The backend (`env.configUsed`) is `coreBuild: "pure-ts-esm"`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: "not-required"` — i.e. a single-threaded pure-TS muxer with no cross-origin-isolation requirement, which is why it can run the TS mux path at all where the WASM/WebCodecs engines cannot.

The gating oracle is **reference-reimport** in semantic-remux mode (src/core/oracles.ts:1225, branching at :1243 into `semanticRemuxReimport` at :1273). It feeds mediabunny's TS output bytes back through the reference engine's demuxer (`ctx.referenceEngine.demux`, oracles.ts:1233) and checks that the re-parsed TS is media-equivalent to the golden MP4. The shard measurements are physically plausible for this 30 s 1080p clip: `reimportPackets=2310`, `reimportKeyframes=1425`, `reimportMediaTracks=2` matching `goldenMediaTracks=2`, and `durationDeltaSec=0.08` against `durationToleranceSec=4.5`. The track count matches exactly (video+audio survive the MP4->TS round trip), the packet table is non-empty and large, and the duration drift (80 ms) is the small audio-frame/PES rounding tail expected from a TS remux — well inside tolerance. This proves the TS bytes really demux back to the same two-track program, not that an MP4 was relabeled.

Performance is uncontested but recorded: wall median 433.085 ms (single-source streaming remux of a 30 s clip => 69.27x realtime throughput), 238 ms of long tasks, 862 stream writes. peakMemory was not sampled (n=0), so memory cannot be characterized.

## What each other framework did wrong

- **platform@chrome-149** — `NA_ENGINE: engine does not declare operation 'remux'`. Honest NA: the browser platform path (MediaRecorder / WebCodecs + inline demux) has no general container-remux operation, and certainly no MPEG-TS muxer. Not an under-declaration.
- **ffmpeg.wasm@0.12.15** — `NA_ENGINE: engine does not declare feature 'target:writes'`. This is the most interesting NA: ffmpeg *could* produce MPEG-TS, but the adapter does not expose the streaming small-write `target:writes` capability this scenario requires, so it is gated out on the streaming-write feature rather than on TS muxing. Looks like an under-declared capability (ffmpeg can mux TS), but it is an honest gate against *this specific* streaming-write contract — ffmpeg.wasm writes through MEMFS to a whole file, not an incremental StreamTarget, so declaring `target:writes` would be a false claim. Honest given the contract.
- **mp4box@2.3.0** — `NA_ENGINE: engine does not declare output container 'ts'`. Honest: MP4Box.js is an ISO-BMFF (MP4/fragmented-MP4) tool; it has no MPEG-TS writer.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE: engine does not declare output container 'ts'`. Honest: Remotion's WebCodecs muxer targets MP4/WebM, not TS.
- **web-demuxer@4.0.0** — `NA_ENGINE: engine does not declare operation 'remux'`. Honest: web-demuxer is a read/demux-only library; it has no mux/remux output path.
- **remotion-media-parser@4.0.479** — `NA_ENGINE: engine does not declare operation 'remux'`. Honest: media-parser is a parser/probe library with no muxing/output capability.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/streaming-output/base.ts:78-91 (`id: 'ts_tiny_writes'`, `asset: 'h264_1080p_30s.mp4'`, `from: 'mp4'`, `to: 'ts'`, `shape: { container: 'ts', target: 'stream', writeChunkBytes: 188 }`, `oracles: ['reference-reimport']`).
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` — EXISTS, ~31 MB real H.264/AAC MP4. Not synthetic/empty/mock.
- **Oracle:** src/core/oracles.ts:1225 (`referenceReimport`) -> :1273 (`semanticRemuxReimport`); duration gate at :1311-1323, track-layout gate at :1289-1298. Real comparison: it actually demuxes the engine's TS output with a reference engine and compares packet/track/duration against the golden. Not trivially satisfiable — empty packet tables fail (:1244-1245), track-count mismatches and duration drift beyond tolerance produce diffs.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1244 (`remux`), :1250 (`makeOutputFormat('ts')`), :1254-1256 (instrumented StreamTarget + `runConversion`), :776-817 (`instrumentedOutputTarget` stream branch, real `mb.StreamTarget`). Genuinely calls the mediabunny library Conversion/Output API; no canned output, no input->output copy (input is MP4, output is TS — different container), no golden short-circuit, no error swallowing (errors throw at :1251).
- **Verdict:** **WEAK-GATE.** The reference-reimport gate is REAL and meaningful for structural integrity (2310 packets, 2 tracks, 0.08 s duration delta on a real fixture, genuine TS mux), so the PASS is honest. However, the feature's *headline* claim — "MPEG-TS streamed in many tiny 188-byte-aligned writes" — is **not asserted by any oracle**. The scenario's own notes (base.ts:88-90) state the 188-byte write-granularity assertion "needs CountingTarget wiring (see ./ts-webm-live.ts)" and is therefore unverified here; `writeChunkBytes:188` does not gate anything, and `targetWrites=862` is observed telemetry, not an oracle-checked threshold. So correctness of the remux is strongly gated, but the distinctive "tiny writes" property is gate-free.
- **Cached note:** mediabunny's result has `cached==true` (`reason: "cached previous PASS result"`). This evidence was reused, not freshly re-run, so there is staleness risk — the numbers reflect a prior run, consistent with the documented launcher stale-PASS-reuse caveat.

## Confidence & caveats

- **Confidence: high** on the winner identity (only 1 of 7 engines is even eligible; the other six are capability-gated NAs that are honest given each library's nature).
- The win is **uncontested**, so there is no performance margin to defend; the bench numbers are single-sample (`n=1`, `mad=0`, `p95==median`) — weak as performance evidence, but performance is not load-bearing here.
- **peakMemory not sampled** (n=0) — memory cannot be assessed.
- **Result is cached** — re-run recommended for a fully fresh confirmation.
- The strongest caveat is the WEAK-GATE: the 188-byte tiny-write contract central to this scenario id is not validated by an oracle in this base case; structural re-import is the only gate. The companion `ts-webm-live.ts` battery is where the write-granularity assertion is intended to live.
