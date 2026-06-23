# streaming-output/stream_large_h264_mp4

**Family:** streaming-output | **Fixture asset:** `fixtures/media/large_h264_1080p_120s.mp4` (89,573,913 bytes, ~85 MB, 120 s 1080p H.264 + AAC) | **Primary metric:** peakMemory | **Pass count:** 1 / 7

## Verdict

**Best framework: mediabunny@1.48.0** — UNCONTESTED (only 1 engine eligible). Every other engine resolved to `NA_ENGINE` before any oracle ran. Decisive factor: mediabunny is the only adapter that declares BOTH the `remux` operation AND the `target:writes` capability feature that the stream-target shape demands; the other six are gated out at the capability layer (no `remux`, or no `target:writes`). No runner-up exists, so there is no performance margin to report — the margin is categorical (1 PASS vs 6 NA).

## Per-engine results

| Engine | Status | Oracles passed | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | reference-reimport:pass | 1366.57 ms | 87.81 x-realtime | 0 (unmeasured) | 501 ms | streamed remux, 478 target writes, 9228 reimport packets / 5688 keyframes / 2 tracks |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |

Note: `peakMemory` is the declared primaryMetric but its sample set is empty (`n:0`, median 0). On Chromium without cross-origin isolation, `measureUserAgentSpecificMemory` is unavailable, so the harness honestly omits the value (per the scenario header's MEASUREMENT NOTES) rather than fabricating one. The real evidence here is the streaming telemetry: 478 `targetWrites` and 89,828,426 `bytesOut` against the 89,573,913-byte input — i.e. the output was emitted incrementally through a StreamTarget rather than as one file-sized buffer.

## Why the winner wins (deep technical)

**Operation/container/codec.** This case is a same-codec, same-container container REMUX: 120 s 1080p H.264 video + AAC audio in MP4, streamed back out as MP4 with `shape.target='stream'` (`src/scenarios/streaming-output/size-ladder.ts:43-57`). No pixel re-encode is required — the win is about muxing encoded packets out through a streaming sink while keeping memory bounded and throughput high.

**Capability gating is the whole ballgame.** `_shared.ts` (`src/scenarios/streaming-output/_shared.ts:131,172-175`) auto-injects the `target:writes` feature whenever `shape.target==='stream'`. The runner then NA-gates any engine that does not declare both `op:'remux'` and that feature. mediabunny's `capabilities()` (`src/engines/mediabunny/adapter.ts:1025` `remux: true`; `:1080` `'target:writes'`) is the only set satisfying both, so it is the only engine that even reaches execution. This is legitimate gating, not a rigged win: a remux-to-stream test that NA's an engine lacking a streaming write path is exactly the §A.10 contrast the family exists to measure.

**Real streaming write path.** mediabunny ran the genuine Conversion API with a native `StreamTarget` wrapping a `WritableStream`. `instrumentedOutputTarget` (`src/engines/mediabunny/adapter.ts:776-816`) constructs `new mb.StreamTarget(writable)` and counts each `write(chunk)` callback. The shard's `targetWrites:478` is that counter — 478 discrete chunk writes for an ~85 MB output is physically consistent with chunked muxing of a fragmented/streamed MP4, not a single buffered flush. `env.configUsed` confirms the streaming machinery: `backend:'webcodecs'`, `pipeline:'streaming-lockstep'`, `coopCoep:'not-required'`, `sharedArrayBuffer:false`, `wasmThreads:0` — a hardware-WebCodecs, single-process, no-isolation path.

**Correctness gate passed with plausible numbers.** The `reference-reimport` oracle (`src/core/oracles.ts:1225`, semantic-remux branch `:1247,1273`) fed the streamed output back into a reference demux. Measurements: `reimportPackets:9228`, `reimportKeyframes:5688`, `reimportMediaTracks:2` vs `goldenMediaTracks:2`, `durationDeltaSec:0.064` against `durationToleranceSec:0.1`. Two media tracks (video+audio) survived the round-trip with matching track layout, and duration drift (64 ms) sits inside the 100 ms tolerance — the small tail the oracle explicitly tolerates as audio-frame/block rounding (`oracles.ts:1316-1318`). 9228 packets for 120 s is plausible (~30 fps video ≈ 3600 frames + AAC ~1024-sample frames ≈ 5600 → ~9200 combined), and 5688 keyframes reflects the AAC track (every audio packet is a sync sample) plus video IDR frames. Sustained throughput of 87.81x realtime over 1366 ms wall for a 120 s asset is consistent with a no-decode encoded-packet copy.

## What each other framework did wrong

- **platform@chrome-149** — `NA_ENGINE: engine does not declare operation 'remux'`. The raw-WebCodecs platform adapter exposes decode/encode primitives but no container muxer, so it cannot remux MP4→MP4. Honest NA (no MP4 box writer in the platform path).
- **ffmpeg.wasm@0.12.15** — `NA_ENGINE: engine does not declare feature 'target:writes'`. ffmpeg.wasm can remux, but its MEMFS/whole-file model has no incremental StreamTarget write telemetry, so it does not claim `target:writes`. Honest NA for a streaming-target case; it would only contest the buffer-target rung.
- **mp4box@2.3.0** — `NA_ENGINE: engine does not declare feature 'target:writes'`. MP4Box.js segments via `onSegment`/`getBuffer` but the adapter does not declare the streaming-write feature this shape requires. Honest NA (arguably under-declared — MP4Box *can* emit segments — but not declared, so correctly gated out).
- **remotion-media-parser@4.0.479** — `NA_ENGINE: engine does not declare operation 'remux'`. It is a parser/demuxer only (read side); no mux/remux output path. Honest NA.
- **web-demuxer@4.0.0** — `NA_ENGINE: engine does not declare operation 'remux'`. Demux-only WASM (libavformat read path); no muxer exposed. Honest NA.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE: engine does not declare feature 'target:writes'`. Its converter targets buffered output; no streaming-write telemetry declared. Honest NA for the stream-target shape.

## Anti-cheat validation

- **Scenario:** `src/scenarios/streaming-output/size-ladder.ts:43-57` (case id `stream_large_h264_mp4`), built via `buildStream` in `src/scenarios/streaming-output/_shared.ts`.
- **Fixture:** `fixtures/media/large_h264_1080p_120s.mp4` EXISTS — `stat` reports 89,573,913 bytes (~85 MB). This is a real, large H.264/AAC MP4, not synthetic/empty/mock. Goldens present: `fixtures/golden/large_h264_1080p_120s.mp4.{meta,packets,frames,ssim}.json` (packets golden 1.1 MB).
- **Oracle:** `reference-reimport` — `src/core/oracles.ts:1225` (`referenceReimport`) → `semanticRemuxReimport` `:1273`. Performs a REAL round-trip: re-imports the engine's output bytes through a reference demuxer, compares media-track count, per-type track layout, and duration against the golden meta with bounded tolerance. Empty packet tables FAIL (`:1244-1245,1249-1250`). Not trivially satisfiable — a copied-input or empty output would fail the track-layout/duration checks. Measurements (9228 pkts, 5688 kf, Δ0.064s ≤ 0.1s) are physically plausible for a 120 s H.264+AAC remux.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:776-816` (real `mb.StreamTarget` over a `WritableStream`, per-write counter), `:841-868` (`runConversion` runs real `mb.Conversion.init/.execute`), `:1025`/`:1080` (capability declaration). No canned output, no input→output copy, no golden short-circuit, no error swallowing (invalid conversions throw at `:849-853`).
- **Cached:** result is NOT cached (`cached` flag absent/false; `startedAtIso:2026-06-22T17:34:41Z` present). No staleness risk.
- **Verdict: REAL.** Real large fixture + genuine streaming StreamTarget Conversion + meaningful structural re-import oracle with plausible measurements. The only soft spot is that the declared primaryMetric (peakMemory) is unmeasured (n:0) on this non-isolated Chromium run — but the gating *correctness* oracle is real and the streaming telemetry (478 writes, byte count) substantiates the stream path.

## Confidence & caveats

Confidence: **high** for the verdict (1 PASS, 6 honest capability NAs, real fixture, real implementation, meaningful oracle). Caveats: (1) Single-sample bench (`n:1`, mad 0) — wall/throughput are one measurement, weak as performance evidence, but performance is irrelevant to an uncontested win. (2) The declared primaryMetric `peakMemory` is unmeasured here (`measureUserAgentSpecificMemory` needs cross-origin isolation, which this run did not have), so the family's headline buffer-vs-stream peak-memory divergence is not demonstrated by a number in this cell — the PASS rests on the correctness oracle + streaming write telemetry, not on a measured memory bound. (3) mp4box's NA is the most debatable (MP4Box.js can emit segments) but is correctly gated since the adapter does not declare `target:writes`.
