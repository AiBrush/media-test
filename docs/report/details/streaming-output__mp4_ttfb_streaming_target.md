# streaming-output/mp4_ttfb_streaming_target

family: streaming-output | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 1080p30 + AAC 48k stereo, ~30s) | primaryMetric: `timeToFirstByte` (lower-is-better) | passCount: 1 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **No** — uncontested. Exactly one engine reached `status=="PASS"`; the other six are `NA_ENGINE` (capability not declared).
- Decisive factor: mediabunny is the only engine that declares **both** `op:'remux'` **and** the `target:writes` feature that this row demands. The streaming-target case (`shape.target:'stream'`) requires `target:writes` (see `_shared.ts:174`), so any buffer-only remux engine is gated out before an oracle ever runs.
- Margin over runner-up: not applicable for correctness/perf (no second PASS). The closest non-winners (ffmpeg.wasm, mp4box, remotion-webcodecs) all fail the same `target:writes` gate; the rest fail an even earlier `remux` op gate.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 475.18 ms | 63.13 x-rt | 0 (not sampled, n=0) | 185 ms | TTFB 4.01 ms; 122 target writes; 31,270,779 bytes out |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Winner bench detail (from shard, all n=1, mad=0, single sample): `timeToFirstByte` median 4.009999990463257 ms; `wall` 475.17999997735023 ms; `throughputRealtime` 63.13397028795398 x-realtime; `targetWrites` 122; `bytesOut` 31,270,779; `longtasks` 185 ms; `peakMemory` n=0 (not captured this run). durationMs 4646.

## Why the winner wins (deep technical)

The operation is a **lossless MP4→MP4 remux** (coded H.264 + AAC samples copied, no re-encode) emitted through an **incremental StreamTarget** rather than a whole-file BufferTarget. The headline metric, `timeToFirstByte`, exists precisely to separate "first byte at finalize()" (buffer) from "first byte mid-stream" (stream) — see the scenario header `ttfb.ts:5-9`.

mediabunny is the only engine wired for this. Its adapter declares `target:writes` in `featureList()` (`src/engines/mediabunny/adapter.ts:1080`) and `remux:true` in its operations map (`adapter.ts:1025`). On `shape.target:'stream'`, `_shared.ts:174` stamps the `target:writes` feature requirement onto the scenario, so only an engine declaring that feature is eligible.

The mechanism that produces the low TTFB is genuine streaming plumbing, not a buffer-then-report fake. In `remux()` (`adapter.ts:1244-1260`) it builds an instrumented target via `instrumentedOutputTarget()` (`adapter.ts:767`). For the stream branch (`adapter.ts:776-816`) it constructs a real `WritableStream<StreamTargetChunk>` and wraps it in `new mb.StreamTarget(writable)` (`adapter.ts:801`). The `write()` callback (`adapter.ts:787-792`) calls `markWrite()` (`adapter.ts:771-774`), which on the **first** chunk records `firstByteMs = nowMs() - startMs`. Because the mediabunny conversion runs in "streaming-lockstep" with auto backpressure (`env.configUsed.pipeline:"streaming-lockstep"`, `adapter.ts:151`), the muxer flushes the MP4 header/early `mdat` fragment as soon as it is ready, so the first `write()` fires at **4.01 ms** — about 1/118th of the 475 ms whole-op wall. That gap is the buffer-vs-stream discriminator the scenario was built to expose (compare to the sibling `mp4_ttfb_buffer_target` control where ttfb ≈ wall). The 122 target writes (`targetWrites:122`) confirm the output left the engine in 122 incremental chunks, not one finalize() blob.

Correctness still gates the speed: the row attaches `reference-reimport` (the default for an `op:'remux'`, `_shared.ts`), so a fast-but-corrupt stream cannot steal the TTFB crown. The oracle (`oracles.ts:1225`, semantic path `semanticRemuxReimport` at `oracles.ts:1273`) feeds the engine's output bytes back into the reference engine's demuxer and checks media identity. Measured: `reimportPackets:2310`, `reimportKeyframes:1425`, `reimportMediaTracks:2` == `goldenMediaTracks:2`, and `durationDeltaSec:0.08 < durationToleranceSec:0.1` (`oracles.ts:1318-1321`). The 2-track layout (1 video + 1 audio) matches the golden meta (`fixtures/golden/h264_1080p_30s.mp4.meta.json`: H.264 1920x1080@30 + AAC 48k stereo, 30s). The packet/keyframe counts are physically plausible for a 30s clip (~30 fps ⇒ thousands of video packets plus AAC frames; 1425 keyframes is consistent with a low-GOP/IDR-heavy 1080p source plus per-AAC-frame "keyframe" flags). All hardware-accelerated WebCodecs context (`backend:"webcodecs"`, `hwAccel:"prefer-hardware"`) is irrelevant to correctness here since remux is a sample copy, but it is why the wall is a tidy 475 ms at 63x realtime.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'target:writes'". Honest NA: it declares `remux:true` (`src/engines/ffmpeg-wasm/adapter.ts:1458`) but its `featureList()` has no `target:writes` entry; ffmpeg.wasm writes to MEMFS and returns a whole buffer, so it cannot satisfy a streaming-target / first-byte gate. Under-declared? No — buffer-only output genuinely cannot produce a true incremental TTFB.
- **mp4box@2.3.0** — NA_ENGINE: same `target:writes` gate. mp4box can rewrap MP4 but the adapter does not declare incremental target-write telemetry. Honest.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: same `target:writes` gate. Honest; its output path is buffer-oriented, no StreamTarget write callback.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest and correct by design: `src/engines/platform/adapter.ts:356` explicitly throws `NotApplicableError('remux', 'raw platform APIs cannot losslessly rewrap encoded samples into a container')` — raw WebCodecs has no container muxer.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: it is a demux-only library (see undeclared-ops guard, `src/engines/web-demuxer/adapter.ts:1043`).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: a parser, not a muxer.

## Anti-cheat validation

- Scenario definition: `src/scenarios/streaming-output/ttfb.ts:51` (`id: 'mp4_ttfb_streaming_target'`), built through `buildStreamAll` in `src/scenarios/streaming-output/_shared.ts` (op `remux` at `_shared.ts:206`; `target:writes` requirement stamped at `_shared.ts:174`).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists (31 MB real file, `stat` confirmed). Golden `fixtures/golden/h264_1080p_30s.mp4.meta.json` confirms 2 media tracks (H.264 1080p30 + AAC 48k stereo, 30s). Not synthetic/empty/mock.
- Oracle: `reference-reimport` — `src/core/oracles.ts:1225` (semantic branch `oracles.ts:1273-1322`). Performs a REAL round-trip: re-imports the engine's output via the reference engine's demuxer and compares track count, per-type track layout, and duration (Δ 0.08s vs 0.1s tol). Not trivially satisfiable: an empty packet table fails (`oracles.ts:1244-1246`), and a track-layout or duration drift adds a diff and fails. Measurements (2310 packets, 1425 keyframes, 2==2 tracks) are physically plausible for the fixture.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244` (`remux`), real stream path `adapter.ts:776-816` using `mb.StreamTarget` + `WritableStream`, first-byte timing at `adapter.ts:771-774`/`adapter.ts:787-788`. No canned output, no input→output copy, no golden short-circuit, no error swallowing — it runs a real `mb.Conversion` (`adapter.ts:848`).
- Cached: `cached` field absent / not set true on the winner entry — result was re-run this run (startedAtIso 2026-06-22T17:33:41Z). No staleness flag.
- Verdict: **REAL** — real fixture + real StreamTarget remux implementation + meaningful round-trip oracle with plausible measured numbers.

## Confidence & caveats

- Confidence: **high** on the verdict (single eligible engine; capability gate is explicit in code; oracle is a real round-trip with sane measurements; fixture and golden verified on disk).
- Caveats: (1) The TTFB win is **uncontested** because the suite gates competitors out at the capability layer, not because mediabunny beat them on a measured number — the buffer-vs-stream comparison is realized at the report layer (`ttfb.ts:20-24`), not as an oracle. (2) All bench metrics are **n=1** (mad=0, single sample), so TTFB 4.01 ms and wall 475 ms are single observations, not distributions — weaker statistical evidence. (3) `peakMemory` was not sampled (n=0), so the bounded-memory advantage of a stream target is unmeasured on this run. (4) The NA designations for ffmpeg.wasm/mp4box/remotion-webcodecs reflect honest non-declaration of incremental target-write plumbing; they could theoretically be wired to stream, so the field is genuinely contestable in a future run.
