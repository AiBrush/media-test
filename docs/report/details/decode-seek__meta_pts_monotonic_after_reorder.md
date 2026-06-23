# decode-seek/meta_pts_monotonic_after_reorder

family: decode-seek | fixture asset: `fixtures/media/h264_bframes_1080p.mp4` (11 MB, real) | primaryMetric: wall (scenario metrics = [wall, peakMemory, longtasks]; no explicit primaryMetric → first metric `wall`) | passCount: 5 / 7

## Verdict

- Best framework: **platform@chrome-149** (status PASS).
- CONTESTED: 5 of 7 engines PASS with **byte-identical oracle measurements** (`frames:60, duplicateOrBackstep:0, inversions:0, minPositiveStepUs:33333`). Correctness is a dead tie, so the decision falls to performance.
- Decisive factor: lowest **wall median** = 1252.84 ms.
- Margin over runner-up (mediabunny@1.48.0, 1300.35 ms): **1.038x faster wall** (≈ 47.5 ms). This is a razor-thin win on **n=1** samples (mad=0, single sample), so it is weak statistical evidence. Platform also carries a measured peakMemory cost (1.46 GB) that the unmeasured engines do not report.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | property-invariant:true | 1252.84 ms | n/a (not measured) | 1,464,915,611 B (~1.46 GB) | 874 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 1300.35 ms | n/a | 0 (unmeasured) | 833 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true | 1541.07 ms | n/a | 0 (unmeasured) | 179 ms | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | property-invariant:true | 2006.82 ms | n/a | 0 (unmeasured) | 1192 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 3052.95 ms | n/a | 2,981,404,887 B (~2.98 GB) | 3042 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

throughputRealtime is absent from every engine's bench block for this scenario (only wall/peakMemory/longtasks were collected).

## Why the winner wins (deep technical)

The operation is `decodeFrames` over **H.264 (AVC) in an MP4 container that deliberately uses B-frames** (`h264_bframes_1080p.mp4`). B-frames make the bitstream's **decode order (DTS) differ from presentation order (PTS)**: the decoder receives frames out of display order and must reorder them. The metamorphic invariant `decode-pts-strictly-increasing` asserts the emitted frames, in presentation order, have **strictly increasing PTS** — i.e. the engine correctly performed B-frame reorder and produced no duplicate/back-stepped timestamps. The gating oracle is `property-invariant` → `decodePtsStrictlyIncreasingInvariant` (src/core/oracles.ts:3532-3569): it walks `ctx.frames.frames`, counts `step<=0` as duplicate/backstep and `step<0` as inversion, and PASSes only when there are zero of them. All five PASS engines reported the same `minPositiveStepUs:33333` (= 1/30 s) across 60 frames, which is exactly the constant 30 fps cadence expected once B-frame reorder is resolved — physically plausible for this fixture.

Platform's winning code path: `PlatformAdapter.decodeFrames` (src/engines/platform/adapter.ts:422-456). It reads the bytes, runs an **inline MP4 sample-table demux** (`buildDecodeInput`, src/engines/platform/adapter.ts:479+, backed by demux-mp4.ts) to extract encoded samples with their per-sample `ptsUs/dtsUs/keyframe`, then decodes via **WebCodecs `VideoDecoder`** in `collectDecodedFrames` (src/engines/platform/decode.ts:165-224). env.configUsed confirms `backend:"webcodecs", hwAccel:true, decode:"VideoDecoder"` running on the Apple M1 Max VideoToolbox-backed hardware decoder (ANGLE Metal). Hardware AVC decode plus a thin pure-platform demux is why its wall (1252.84 ms) edges out mediabunny's pure-TS demux+WebCodecs (1300.35 ms) and crushes the wasm software decoders (web-demuxer 2006 ms, ffmpeg.wasm 3052 ms).

Two mechanistic details matter for this specific invariant:
1. **Reorder handling** — decode.ts:194 submits `maxFrames + 16` chunks in DTS order so the decoder's reorder buffer can flush the out-of-order B-frames before the first `maxFrames` presentation frames are finalized. The output callback collects `{ptsUs: frame.timestamp, frame}` (decode.ts:182), i.e. it trusts the hardware decoder's emitted `VideoFrame.timestamp`.
2. **Caveat (see anti-cheat)** — decode.ts:222 `collected.sort((a,b)=>a.ptsUs-b.ptsUs)` explicitly sorts by PTS before returning. So for the platform engine the strictly-increasing property is largely *guaranteed by the adapter*, not just by the decoder; the oracle can still catch duplicate PTS (`step==0`) but cannot catch a pure ordering error in platform's output because platform pre-sorts.

Performance is the only differentiator here because correctness is identical across all 5. The win is genuine but marginal (1.038x, n=1, mad=0) and platform pays for it in memory: it is the only WebCodecs engine that actually reported peakMemory (1.46 GB) — a 1080p hardware decode retaining up to ~60 decoded VideoFrames is memory-heavy, whereas mediabunny/remotion-webcodecs/web-demuxer reported 0 (unmeasured) so a memory comparison is not possible against them.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost): correctness tied (identical oracle measurements) but wall 1300.35 ms vs 1252.84 ms → 1.038x slower, the only metric gap; it actually had a slightly *lower* longtasks (833 ms vs 874 ms), so on responsiveness it is arguably comparable. A re-run could flip this n=1 result.
- **remotion-webcodecs@4.0.479** (PASS, lost): correctness tied; wall 1541.07 ms = 1.23x slower than platform. Notably best longtasks (179 ms) thanks to `pipeline:"streaming-backpressure"` + worker-capable extract, but total wall lost.
- **web-demuxer@4.0.0** (PASS, lost): correctness tied; wall 2006.82 ms = 1.60x slower (wasm demux feeding WebCodecs) and worst longtasks among PASS (1192 ms).
- **ffmpeg.wasm@0.12.15** (PASS, lost): correctness tied but slowest by far — wall 3052.95 ms = 2.44x slower, longtasks 3042 ms, and the highest peakMemory at 2.98 GB (single-thread wasm software AVC decode of 1080p). Clearly dominated.
- **remotion-media-parser@4.0.479** (NA_ENGINE): reason "engine does not declare operation 'decodeFrames'". Honest NA — remotion-media-parser is a parser/demuxer, not a frame decoder; it has no pixel-decode path, so it cannot satisfy a decode-frames invariant. Not an under-declared capability.
- **mp4box@2.3.0** (NA_ENGINE): reason "engine does not declare operation 'decodeFrames'". Honest NA — mp4box is an ISOBMFF box parser / fragment tool with no decoder; it can demux samples but never produces decoded frames. Correct to declare false.

## Anti-cheat validation

- Scenario definition: src/scenarios/decode-seek/index.ts:701-714 (id `meta_pts_monotonic_after_reorder`, op `decodeFrames`, input `h264_bframes_1080p.mp4`, options `{maxFrames:60, invariant:'decode-pts-strictly-increasing'}`, `notes` = metamorphic B-frame reorder correctness, "Needs no golden"). Built into a scenario at index.ts:732-749 with oracle `property-invariant`.
- Fixture: `fixtures/media/h264_bframes_1080p.mp4` exists, 11 MB — a real H.264+B-frame 1080p MP4, not synthetic/mock/empty. Confirmed via stat.
- Oracle: src/core/oracles.ts:3532-3569 (`decodePtsStrictlyIncreasingInvariant`), dispatched at oracles.ts:2658-2659. It performs a real per-frame PTS walk and fails on any `step<=0`. It is not trivially loose: it requires zero duplicates/inversions over 60 real frames and reports the actual min step. Measurements (frames:60, minPositiveStepUs:33333 = 30 fps) are physically consistent with the fixture.
- Winner adapter: src/engines/platform/adapter.ts:422-456 (decodeFrames) → src/engines/platform/decode.ts:165-224 (`collectDecodedFrames`, real `VideoDecoder` decode of inline-demuxed samples). No canned output, no copy-input-to-output, no short-circuit to a golden (this scenario has no golden), errors are surfaced (decode.ts:184-186, 217-220).
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the oracle is a real comparison, BUT the platform adapter **sorts decoded frames by PTS before emitting** (src/engines/platform/decode.ts:222). For the platform engine the strictly-increasing property is therefore partly enforced by the adapter rather than purely observed from the decoder, so this oracle cannot detect a reorder bug in platform's output (it can still detect duplicate PTS). The same likely applies to other adapters that present in PTS order. The PASS is real (and correctness is genuinely identical across all 5 engines), but the gate is weaker than a true "did the decoder reorder correctly" test would be. Not a CHEAT (no faked data), but the invariant is closer to a smoke/structural check than a strong reorder oracle.
- Cached note: platform's result has `cached:true` ("cached previous PASS result"); ALL five PASS engines are cached. The ~47 ms wall margin is from prior runs, not a fresh head-to-head, so the winner ranking carries staleness risk.

## Confidence & caveats

- Confidence: **medium**. The PASS set, NA reasons, fixture, oracle, and adapter code path are all verified. But the win is decided purely on a 1.038x wall delta from **n=1, cached** samples (mad=0, p95==median) with mediabunny within noise — a re-run could easily reorder platform vs mediabunny.
- All five PASS engines are byte-identical on correctness, so "best" is essentially "fastest cached wall," not a correctness distinction.
- throughputRealtime and peakMemory are unmeasured for three of the five PASS engines, limiting performance tiebreaking; platform's 1.46 GB peak is a real cost the unmeasured engines hide.
- The WEAK-GATE caveat (adapter PTS-sorting) means the headline invariant under-tests B-frame reorder for engines that present in PTS order.
