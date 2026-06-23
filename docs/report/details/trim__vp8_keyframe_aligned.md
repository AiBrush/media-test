# trim/vp8_keyframe_aligned

family: trim · fixture asset: `vp8_720p_10s.webm` (VP8 video + Vorbis audio in WebM) · primaryMetric: wall · passCount: 2

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`, backend `webcodecs`, `prefer-hardware`, `streaming-lockstep`, no COOP/COEP).
- Status: **CONTESTED** — 2 engines PASS (mediabunny, ffmpeg.wasm), 5 are NA_ENGINE (do not declare `trim`).
- Decisive factor: **correctness strength on the `trim-boundaries` oracle**. Both engines pass the identical oracle set (`trim-boundaries`, `playback-smoke`), but the measured trim-duration error decides it:
  - mediabunny `durationDeltaSec = 0.02s` (out 4.02s vs requested 4.00s).
  - ffmpeg.wasm `durationDeltaSec = 1.004s` (out 5.004s vs requested 4.00s).
- Margin over runner-up: mediabunny's boundary error is **~50x tighter** (0.02s vs 1.004s). ffmpeg.wasm only passes because the scenario tolerance is wide (`durationToleranceSec: 1.1`); it lands 1.004s long — just inside the gate. Per the correctness ladder, tighter measured tolerance on the same structural oracle wins, even though ffmpeg.wasm is far faster on wall time (15.09ms vs 459.07ms ≈ **30.4x faster wall**, throughput 662.9x vs 21.8x realtime). Performance is the secondary axis and does not override correctness here.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 459.065 ms | 21.79 x-rt | n/a (n=0 samples) | 874 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 15.090 ms | 662.89 x-rt | 68,564,613 B | 4223 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

Note on bench: mediabunny reports `peakMemory` with n=0 samples (not measured on this run); ffmpeg.wasm reports a real 68.5 MB peak. Both wall samples are n=1 (mad=0, p95==median), so the performance numbers are single-shot evidence and the margins are indicative, not statistically robust.

## Why the winner wins (deep technical)

This is a copy-trim of a **VP8/Vorbis WebM** file over `[startUs=1_000_000, endUs=5_000_000]` (a 4.000s window), `frameAccurate: false`. The scenario notes (`src/scenarios/trim/index.ts:324`) state the cut is keyframe-aligned and the Vorbis track is copied through (not decoded) — `audioCodec` is deliberately left undeclared (`index.ts:316-318`) so the case is not gated on a Vorbis WebCodecs decode string.

**mediabunny path.** With `frameAccurate=false`, `trim()` (`src/engines/mediabunny/adapter.ts:1445-1500`) first rules out the no-op identity trim (start≈0; `adapter.ts:1468-1477`) and the audio-only packet-copy fast path (`tryAudioOnlyPacketCopyTrim`, `adapter.ts:1479-1482`) — neither applies because the input has a video track and start=1s. It then constructs a real `Output` with a `BufferTarget` and runs mediabunny's `Conversion` with `trim: { start: 1.0, end: 5.0 }` (`adapter.ts:1484-1496`) via `runConversion`. mediabunny's Conversion re-times the segment to the requested window and only keeps it lossless where the cut lands on keyframes. The result is `outDurationSec = 4.02s`, i.e. the muxed segment is within **0.02s** of the requested 4.00s — essentially one VP8 frame of slack (≈33ms at 30fps), which is the expected granularity when the trailing boundary snaps to the next available frame. The output then survives a live `<video>` playback-smoke (`oracles.ts:1574-1580`) and a reference-engine re-probe in `trim-boundaries` (`oracles.ts:2360-2367`), confirming the container is genuinely playable and its measured duration matches.

**ffmpeg.wasm path.** `trim()` (`src/engines/ffmpeg-wasm/adapter.ts:2538-2645`) takes the keyframe-aligned fast branch (`frameAccurate=false`, `adapter.ts:2613-2627`): it emits `-ss <start> BEFORE -i` then `-t <dur> -c copy`. Pre-input `-ss` seeks to the **nearest preceding keyframe**; with `-c copy` no re-encode happens, so the output begins at whatever VP8 keyframe precedes 1.000s and runs for `-t 4.000s` of stream-copied packets. The measured output duration is `5.004s` (`durationDeltaSec = 1.004s`). The ~1s overshoot is the classic copy-trim artifact: the preceding keyframe is roughly a second earlier than the requested 1.000s mark (a sparse VP8 GOP), and because packets are copied verbatim the duration is padded to the GOP boundary rather than re-timed to the exact request. It still PASSes only because `durationToleranceSec` is 1.1s, and 1.004 < 1.1.

**Net:** for an inexact (keyframe-aligned) VP8 WebM copy-trim, mediabunny's Conversion re-times the window to land within a single frame of the request, while ffmpeg.wasm's pure stream-copy is bound to the source GOP boundary and overshoots by ~1s. Same oracle set, but mediabunny's boundary fidelity is ~50x tighter, so it wins on correctness. ffmpeg.wasm's advantage is raw speed (stream-copy → 15ms wall, 663x realtime, no transcode), but speed is the secondary axis and cannot beat a materially tighter boundary measurement on the gating correctness oracle.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost): correct and real, but its `-ss/-c copy` keyframe-aligned trim overshot the requested window — `trim-boundaries` measured `outDurationSec=5.004` vs requested 4.000 (`durationDeltaSec=1.004s`, 50x looser than mediabunny's 0.02s). It only stayed inside the 1.1s tolerance by a 0.096s margin. Wins on performance (30.4x faster wall, 663x vs 21.8x realtime) but loses the correctness-first ranking.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare operation 'trim'". Honest NA; web-demuxer is a demux-only library (Emscripten libav demuxer) with no muxing/trim write path.
- **mp4box@2.3.0**: NA_ENGINE — does not declare `trim`. Honest; mp4box is an ISO-BMFF (MP4) box parser/segmenter and cannot author WebM/Matroska output, so a WebM copy-trim is genuinely out of scope.
- **platform@chrome-149**: NA_ENGINE — does not declare `trim`. Honest; the raw platform engine exposes WebCodecs/MSE primitives but no end-to-end container trim operation.
- **remotion-media-parser@4.0.479**: NA_ENGINE — does not declare `trim`. Honest; media-parser is a read-only parser, not a writer.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — does not declare `trim`. This is the most plausible under-declaration candidate (it has WebCodecs encode/decode and converter machinery), but for this shard it simply does not register the `trim` op, so it is correctly excluded rather than failing.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:311-325` (id `vp8_keyframe_aligned`, asset `vp8_720p_10s.webm`, container `webm`, videoCodec `vp8`, range 1.0s..5.0s, `frameAccurate:false`, `extraOracles: PLAYABLE_AV` → adds `playback-smoke`; `PLAYABLE_AV` defined `index.ts:125`).
- Fixture exists: `fixtures/media/vp8_720p_10s.webm` is present and **1.3 MB** (real media, not synthetic/empty/mock). `stat` confirms a genuine file.
- Oracle implementations: `trim-boundaries` at `src/core/oracles.ts:2348-2435` performs a REAL check — it re-probes the output via the reference engine (`oracles.ts:2360-2367`) and/or decodes the output for a frame-pts span (`oracles.ts:2372-2386`), then compares measured `outDurationSec` against the requested window with a concrete tolerance (`oracles.ts:2388-2400`). Boundary-frame digest comparison is intentionally skipped here because the loaded golden is a source-prefix, not a trim-range golden (`oracles.ts:2405-2431`) — so duration is the live gate; `boundaryFrameComparisons: 0` in both results is consistent with that code path, not a silently disabled check. `playback-smoke` (`oracles.ts:1574-1580`) actually plays the bytes in a `<video>` and requires advancement.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445-1500`. The trim is genuinely implemented via mediabunny's real `Output`/`BufferTarget`/`Conversion` with the exact requested range (`adapter.ts:1484-1496`). It does NOT return canned output, does NOT copy input→output to fake a trim (the no-op identity short-circuit at `adapter.ts:1468-1477` is correctly bypassed because start=1s≠0), does NOT short-circuit to a golden, and does NOT swallow errors (it throws on bad ranges and empty output, e.g. `adapter.ts:1450-1455`). The audio-only packet-copy branch (`adapter.ts:982-989`) is not taken because the input has video.
- Measurements are physically plausible: 4.02s out for a 4.00s VP8 request (≈1 frame of slack at 30fps), real `<video>` playback, longtasks 874ms, throughput 21.79x realtime for a re-timing WebM trim — all consistent with a genuine WebCodecs-backed conversion of real media.
- Verdict: **REAL** — real 1.3 MB fixture + real Conversion implementation + a meaningful duration-comparison oracle backed by a reference probe and decode. (Caveat: the gate is a duration tolerance, not a bit-exact/SSIM frame check, which is why confidence is not higher.)
- Cached note: mediabunny's winning result has `cached: true` ("cached previous PASS result", startedAtIso 2026-06-22T14:10:42Z). ffmpeg.wasm is also `cached: true`. Both numbers are reused from prior runs, not re-executed this run — staleness risk applies to both; per the launcher seeding caveat, a truly fresh run would require clearing the raw + .browser-cache.

## Confidence & caveats

- Confidence: **medium**. The winner selection is well-grounded: identical oracle sets, and mediabunny's 50x tighter boundary measurement is decisive under correctness-first ranking, backed by a verified real implementation and real fixture.
- Caveats: (1) the gating oracle is a duration tolerance (`durationToleranceSec: 1.1`), a structural/metadata-exact check rather than a bit-exact or SSIM frame comparison — boundary-frame digests are skipped (`boundaryFrameComparisons: 0`) because no trim-range golden is baked, so frame-level correctness of the cut is unverified. (2) Both PASS results are `cached: true` (stale-reuse risk; not re-run this session). (3) All bench metrics are n=1 (mad=0), so performance margins (30.4x wall, throughput) are single-shot and indicative only. (4) mediabunny `peakMemory` was not sampled (n=0), so the two engines' memory cannot be compared. (5) ffmpeg.wasm's 1.004s overshoot is a tolerance-edge pass; if the suite ever tightens `durationToleranceSec` below ~1.0s, ffmpeg.wasm would FAIL and mediabunny would become an uncontested winner.
