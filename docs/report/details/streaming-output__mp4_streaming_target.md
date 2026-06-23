# streaming-output/mp4_streaming_target

- **family:** streaming-output
- **fixture asset:** `h264_1080p_30s.mp4` (H.264 video + AAC audio in progressive MP4, 31 MB, exists in `fixtures/media/`)
- **operation / shape:** `remux` mp4 -> mp4 with `target: 'stream'` (incremental StreamTarget, not whole-blob BufferTarget)
- **primaryMetric:** wall (default = metrics[0]; STREAM_METRICS = wall, throughputRealtime, peakMemory, targetWrites, bytesOut, longtasks)
- **passCount:** 1 of 7 (6 NA_ENGINE, 0 FAIL)

## Verdict

- **Best framework:** `mediabunny@1.48.0` — UNCONTESTED (only 1 PASS).
- **Decisive factor:** mediabunny is the ONLY engine that declares the `target:writes` capability AND backs it with a genuine native `StreamTarget` write path, so it is the only engine the runner even executes for this streaming-target row. Every other engine is gated out at capability time (NA_ENGINE) before any oracle runs.
- **Margin over runner-up:** N/A — there is no runner-up that produced bytes. The nearest competitors (ffmpeg.wasm, mp4box) can remux MP4 but do not declare `target:writes`, so the streaming-target row is NA for them rather than a measured loss.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 423.815 ms | 70.79 x-realtime | 0 (not sampled, n=0) | 238 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Auxiliary bench (mediabunny): targetWrites = 122 (count), bytesOut = 31,270,779 bytes (~31.3 MB out for a ~31 MB source — consistent with a lossless rewrap, not a re-encode). n=1 for every metric (single non-warmup sample, mad=0), so all numbers are point estimates, not distributions.

## Why the winner wins (deep technical)

This row tests OUTPUT SHAPE, not codec work: the same H.264+AAC samples are copied losslessly out of the source MP4 and into a new MP4, but the bytes must leave through an **incremental StreamTarget** (`options.target = 'stream'`) rather than a single whole-file BufferTarget. The scenario builder (`src/scenarios/streaming-output/_shared.ts:174`) adds the `target:writes` capability requirement to `requires.features` for any case with `shape.target === 'stream'`. The runner's capability gate therefore filters the field down to engines that BOTH declare `remux` AND declare `target:writes`. Only mediabunny clears both bars: it declares the feature at `src/engines/mediabunny/adapter.ts:1080` (`'target:writes' // Output can write through native StreamTarget and reports target write telemetry`).

The declaration is not cosmetic — it is backed by a real implementation. The remux entry point `src/engines/mediabunny/adapter.ts:1244` (`async remux(...)`) builds the output format, opens the source via `openInput`, and routes the output target through `instrumentedOutputTarget` (`adapter.ts:1254`). Because `opts.target === 'stream'`, that helper takes the streaming branch at `adapter.ts:776`: it constructs a real `WritableStream<StreamTargetChunk>` whose `write(chunk)` callback (`adapter.ts:787-792`) increments a write counter (`markWrite`, `adapter.ts:771-774`), records `chunk.position`, and accumulates `maxEnd`. That writable is handed to a genuine `mb.StreamTarget(writable)` (`adapter.ts:801`), wired into `new this.lib.Output({ format, target })` (`adapter.ts:1255`), and driven to completion by `runConversion` (`adapter.ts:855`, `await conversion.execute()`). The final bytes are reassembled position-by-position from the captured chunks (`adapter.ts:806-807`). The shard's `targetWrites = 122` is the live count from that callback — direct evidence that the muxer emitted 122 discrete incremental writes rather than one monolithic buffer flush, which is exactly the property the scenario name promises ("targetWrites should be many small writes, not one"). The backend used (`env.configUsed`) is `backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, with `sharedArrayBuffer: false` and `coopCoep: "not-required"` — i.e. no cross-origin isolation headers needed, a deployability advantage over wasm-threaded competitors.

The gating oracle, `reference-reimport`, is a real structural-integrity check, not a smoke test. For an `op:'remux'` scenario it routes through `semanticRemuxReimport` (`src/core/oracles.ts:1247` -> `:1273`): it re-feeds the engine's OUTPUT bytes back into the reference engine's demuxer (`oracles.ts:1233`), then diffs the re-imported media-track count and per-type track layout against the golden, and checks output duration against golden duration. The shard measurements are physically plausible for this fixture: `reimportPackets = 2310`, `reimportKeyframes = 1425`, `reimportMediaTracks = 2`, `goldenMediaTracks = 2`, `durationDeltaSec = 0.08` against `durationToleranceSec = 0.1`. Two media tracks (video + audio) is exactly right for H.264+AAC. A 30-second clip yielding 2310 packets (~77 packets/s combined across V+A) and a sub-frame duration drift of 80 ms (within the 100 ms semantic-remux tolerance floor set at `oracles.ts:1318`, `Math.max(baseTolSec, 0.1)`) is consistent with a clean lossless rewrap where audio-frame/block boundary rounding materializes a small tail. The oracle passed because the re-demuxed packet table and track layout matched the golden — proving the 122 incremental StreamTarget writes reassembled into a structurally valid, semantically identical MP4.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'target:writes'". It genuinely implements MP4 remux (`remux: true` at `adapter.ts:1458`) and declares many features, but its feature list (`adapter.ts:1505-1521`) does NOT include `target:writes`. Its MP4 output path is whole-file MEMFS/BufferTarget, not an incremental StreamTarget, so the NA is HONEST under-no-declaration rather than an under-declared capability.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare feature 'target:writes'". It declares `remux: true` (`src/engines/mp4box/adapter.ts:640`) and a features list (`:662`) but not `target:writes`. mp4box's writer materializes the file as one assembled ArrayBuffer, not a streaming write sequence; honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'target:writes'". It can do conversion/encode work but does not expose a remux-time streaming write target; honest NA.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Raw browser APIs cannot losslessly rewrap encoded samples into a container; the adapter explicitly throws `NotApplicableError('remux', 'raw platform APIs cannot losslessly rewrap encoded samples into a container')` (`src/engines/platform/adapter.ts:356`). Honest NA — `remux` is simply not a platform primitive.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". web-demuxer is a demux-only library; it declares no muxing/remux operation (`adapter.ts:624`, undeclared ops throw at `:1043`). Honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". A parser, not a muxer; remux is in its undeclared-operations block (`adapter.ts:545`). Honest NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/streaming-output/base.ts:34-45` (case `mp4_streaming_target`), built via `buildStream` in `src/scenarios/streaming-output/_shared.ts:200`. Shape `{ container: 'mp4', target: 'stream' }`; the `target:'stream'` knob forces the `target:writes` feature requirement at `_shared.ts:174`.
- **Fixture:** `asset: 'h264_1080p_30s.mp4'` — a REAL 31 MB H.264+AAC progressive MP4 present in `fixtures/media/`. Not synthetic, not empty, not a mock. bytesOut (31,270,779) is consistent with a real ~31 MB rewrap.
- **Winner adapter:** real library calls — `mb.StreamTarget(writable)` (`src/engines/mediabunny/adapter.ts:801`), `new this.lib.Output(...)` (`:1255`), `conversion.execute()` (`:855`). The output is reassembled from genuinely captured stream chunks (`:806`), NOT copied from input, NOT short-circuited to a golden, NOT a hardcoded buffer. The 122 targetWrites come from a live write callback (`:771`), so the streaming behavior is actually exercised. No error-swallowing: `runConversion` throws on invalid/empty track sets (`:849-853`).
- **Gating oracle:** `reference-reimport` -> `semanticRemuxReimport` (`src/core/oracles.ts:1247`, `:1273`). It re-demuxes the produced bytes and compares track count + layout + duration to the golden; this is a structural-metadata-exact gate, not a smoke or wide-tolerance pass. Measurements are physically plausible (2 tracks, 2310 packets, 1425 keyframes, 0.08 s duration delta within 0.1 s tol). Note: this gate validates structural integrity and duration, but does NOT verify the 188-byte/small-write GRANULARITY claim with bit-exact frame comparison — that is a documented observability gap (see `_shared.ts:22-25`).
- **Cached note:** mediabunny's result has `cached: true` ("cached previous PASS result"). The PASS was REUSED from a prior run, not re-executed in this run. Per the launcher-seeding caveat, cached PASS rows carry staleness risk; the numbers are real but were not freshly regenerated here.
- **Verdict:** REAL — real fixture, real native StreamTarget implementation, meaningful structural re-import oracle with plausible measurements. (Strength is structural/metadata-exact, not bit-exact; the write-granularity assertion is observed only as a raw count, not validated against an expected count.)

## Confidence & caveats

- **Confidence:** HIGH that mediabunny is the correct/only winner — the win is a clean capability-gate monopoly with a verified real implementation and a meaningful oracle. There is no contest to adjudicate.
- The PASS is **cached**; a fresh re-run is advisable to remove staleness risk before publishing leaderboard numbers.
- All bench metrics are **n=1** (single sample, mad=0): wall, throughput, targetWrites, etc. are point estimates with no spread information.
- `peakMemory` was **not sampled** (n=0, value 0) — the bounded-stream-memory promise that is the whole point of a StreamTarget is NOT measured here, so this row does not prove the memory advantage over a BufferTarget; it only proves incremental writes happened and reassemble correctly.
- The 6 NA_ENGINE results are all **honest** under-no-declaration (no operation / no `target:writes` feature), not under-declared capabilities — ffmpeg.wasm and mp4box could conceivably add a streaming write target in future, but as shipped they do whole-file buffering and correctly decline this row.
