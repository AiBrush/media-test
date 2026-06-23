# trim/h264_to_eof_copy

Family: trim | Fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4, ~31 MB) | primaryMetric: wall | passCount: 2 / 7

Operation: copy-trim 27.0s..30.0s (`startUs=27_000_000`, `endUs=30_000_000`), `frameAccurate:false`, container mp4. Tests the end-of-file boundary: the last kept GOP must run to the real last sample, and `endUs==duration` must be clamped, not over-run. Duration tolerance `±1.1s` (loose by design because keyframe-aligned copy-trim cannot land on an exact non-key frame). Requested duration = 3.000s.

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED — two engines PASS (mediabunny, ffmpeg.wasm@0.12.15); the other five are NA_ENGINE (do not declare `trim`).

Decisive factor: **correctness strength on the gating `trim-boundaries` oracle.** Both engines pass the same two oracles (`trim-boundaries`, `playback-smoke`) and neither does a boundary-frame digest (`boundaryFrameComparisons==0` for both, because the loaded golden is a source-prefix, not a trim-range golden). The oracle therefore reduces to the duration-accuracy gate, and the measured deltas are an order of magnitude apart:

- mediabunny: `outDurationSec=3.072`, `durationDeltaSec=0.072s`
- ffmpeg-wasm: `outDurationSec=4.016`, `durationDeltaSec=1.016s`

mediabunny lands **14.1x closer** to the requested 3.000s window (0.072s vs 1.016s) — ffmpeg-wasm only barely clears the 1.1s tolerance (1.016s of 1.1s used, 92% of the budget). On correctness strength mediabunny wins outright, so performance is not the deciding axis. (For the record on performance, ffmpeg-wasm is faster on wall: 123.68ms vs 435.02ms = 3.52x faster, and 242.6x vs 69.0x realtime = 3.52x; but it reports 165.3 MB peak memory vs mediabunny's 0 (uninstrumented), and its accuracy is far worse. Performance does not override a clear correctness gap per the decision ladder.)

Margin over runner-up: 14.1x tighter trim-boundary duration delta (0.072s vs 1.016s).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 435.02 ms | 68.96 x | 0 (uninstrumented) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 123.68 ms | 242.56 x | 165,317,636 B (165.3 MB) | 12909 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

This is a non-frame-accurate copy-trim of H.264-in-MP4 at the EOF boundary. The hazard is twofold: (1) the requested start at 27.0s lands at an interior, almost-certainly non-keyframe PTS, so a stream-copy must rewind to the preceding IDR/keyframe; (2) the requested end equals the source duration (30s), so the engine must clamp to the real last sample rather than over- or under-run. The duration delta directly measures how cleanly the engine handled both.

mediabunny runs the cut through its high-level Conversion API rather than ffmpeg-style decode-side seeking. In `src/engines/mediabunny/adapter.ts:1485-1496`, `trim()` builds `ConversionOptions` with `trim: { start: range.startUs/1e6, end: range.endUs/1e6 }` (27.0 → 30.0) and, because `frameAccurate` is false, it does NOT set `video.forceTranscode` — so the Conversion runs as a stream copy on the H.264 packets. Mediabunny's conversion engine selects the GOP that contains the start time and trims the packet table at GOP granularity while preserving the full final GOP to the real EOF, then re-muxes. The result is `outDuration=3.072s` — only 0.072s over the 3.0s request, i.e. roughly two extra frames of leading-GOP slack (≈33ms/frame at ~30fps → ~2 frames), which is exactly what a tight GOP-aligned copy should produce when 27.0s falls just after a keyframe. Before reaching the Conversion path, the adapter also probes for the audio-only packet-copy fast path (`adapter.ts:1480`, `tryAudioOnlyPacketCopyTrim`) and the no-op identity path (`adapter.ts:1468-1477`); neither applies here (this is A/V mp4, non-identity range), so it correctly falls through to the streaming-lockstep Conversion. `env.configUsed` confirms `backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `coopCoep:"not-required"`, `sharedArrayBuffer:false` — it needs no cross-origin isolation and no wasm threading.

ffmpeg-wasm takes the classic fast-seek copy path (`src/engines/ffmpeg-wasm/adapter.ts:2613-2627`): for non-frame-accurate trims it emits `-ss <start>` BEFORE `-i`, then `-t <duration> -c copy`. Input-side `-ss` seeks to the nearest preceding keyframe and copies from there, plus `-avoid_negative_ts make_zero`. With this fixture's GOP structure, the keyframe preceding 27.0s sits ~1s earlier, so the copied span runs ~4.016s instead of 3.0s — `durationDeltaSec=1.016s`, consuming 92% of the 1.1s tolerance. It passes, but only just, and its boundary is materially looser than mediabunny's. The accuracy gap is structural: input-side `-ss -c copy` is keyframe-granular with no upper-bound trimming of the leading GOP, whereas mediabunny's Conversion trims the packet table at both ends around the requested window.

On the gating oracle (`src/core/oracles.ts:2346-2435`), the live gate is the duration check at lines 2388-2400 (`|outDuration - requested| <= durationToleranceSec`). The boundary-frame digest block (lines 2410-2431) is intentionally inert here: `ctx.golden.frames` is the source-prefix golden, not a trim-range golden, so `sameUsRange` fails and `boundaryFrameComparisons` stays 0 for both engines. So correctness collapses to duration accuracy, and mediabunny's 0.072s vs ffmpeg-wasm's 1.016s is the decisive, real measurement.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost): correct stream-copy trim, but keyframe-granular input-side `-ss -c copy` (`adapter.ts:2613-2627`) produced `outDuration=4.016s`, `durationDeltaSec=1.016s` — 14.1x looser than mediabunny's 0.072s and 92% of the tolerance budget. Faster on wall (123.68ms vs 435.02ms, 3.52x) but performance does not override the correctness gap. Also reports 165.3 MB peak memory.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA — mp4box is a demux/box-parser/segmenter, not a re-muxing trimmer; not an under-declared capability.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA — a libav-based demuxer that yields packets; it has no mux/trim output path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA — a read-only parser, no encode/mux side.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA — the raw WebCodecs/MSE platform baseline exposes no trim primitive; doing this would require a hand-rolled demux+mux that the platform adapter does not provide.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA — this adapter focuses on WebCodecs transcode/convert, not container-level copy-trim.

All five NAs look genuine for THIS operation: none is a transcode/demux engine that secretly could do a container copy-trim and merely failed to declare it. The contest is legitimately mediabunny vs ffmpeg-wasm.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:462-473` (`id: 'h264_to_eof_copy'`, asset `h264_1080p_30s.mp4`, range 27.0s..30.0s, `frameAccurate:false`, `durationToleranceSec:1.1`, notes: "Copy-trim 27s..EOF; tests end-of-file boundary").
- Fixture exists and is real: `fixtures/media/h264_1080p_30s.mp4`, ~31 MB on disk (stat confirmed). Real H.264/AAC MP4, not synthetic/empty/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445-1500`. Genuinely calls mediabunny's `Output`/`BufferTarget` + Conversion API with a real `trim:{start,end}`; no hardcoded bytes, no golden short-circuit. The only "copy input→output" branch is the explicit no-op-identity guard (`adapter.ts:1468-1477`), which requires start≈0 AND end≈duration AND matching container — this 27..30 range does NOT trigger it, so the output is a real trimmed container, not the source echoed back.
- Gating oracle: `src/core/oracles.ts:2346-2435` (`trimBoundaries`). Performs a real duration comparison via reference-engine probe / decoded-frame PTS span against the requested window; tolerance 1.1s is loose but defensible for keyframe-aligned copy-trim, and mediabunny clears it with huge margin (0.072s). Measurements are physically plausible: 3.072s and 4.016s outputs from a 3.0s request on a 30s source, with leading-GOP slack consistent with H.264 GOP sizes.
- Verdict: **REAL**. Real 31 MB fixture, real Conversion-API implementation, real duration oracle with plausible measurements; winner chosen on a genuine 14.1x accuracy margin, not on a trivially-satisfiable gate.
- Cached note: BOTH PASS results have `cached:true` ("cached previous PASS result"). The numbers were reused, not re-run this session — minor staleness risk. Adapter timestamps (mediabunny adapter modified 2h ago, ffmpeg-wasm 10h ago) post-date the cached mediabunny run start (14:02Z) for some files, so a fresh re-run is advisable to confirm the deltas, but the relative ordering (GOP-table trim vs keyframe `-ss` copy) is structural and would not invert.

## Confidence & caveats

Confidence: high on the winner and the mechanism. The decisive 14.1x duration-delta margin is a hard measured number and the code paths (Conversion `trim` vs input-side `-ss -c copy`) fully explain it. Caveats: (1) both results are cached, so re-running to refresh is prudent. (2) The `trim-boundaries` oracle is duration-only here (`boundaryFrameComparisons==0`) — there is no per-frame bit/pixel boundary check, so this is a metadata/duration-exact gate, not a frame-exact one; both PASSes are real but not frame-level proven. (3) bench `n==1` for every metric (single sample, mad=0), so the performance numbers are weak evidence — but performance is not the deciding axis here. (4) mediabunny's peakMemory is 0 (uninstrumented), so the memory comparison is one-sided.
