# transcode/h264_flip_vertical

- **Family:** transcode
- **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264/AVC in MP4, 1920x1080, ~30 s)
- **Operation / options:** `transcode` → container `mp4`, video `h264`, `flip: 'v'` (vertical flip via `-vf vflip`)
- **primaryMetric:** wall (ms)
- **passCount:** 1 of 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` — **uncontested** (the only engine that PASSed).
- **Decisive factor:** It is the only adapter that **declares the `flip` feature**. The other six engines stay honest `NA` — four because they do not declare `flip`, two because they do not declare the `transcode` operation at all.
- **Margin over runner-up:** N/A — there is no second PASS. All other engines are non-eligible (NA), so there is no performance race to win.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | ssim-psnr:✓, playback-smoke:✓ | 86034.72 ms | 0.3487 x-realtime | 0 (not sampled) | 173 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'flip' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'flip' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'flip' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Advisory bench: encodeFps median 10.46 fps (n=1). All bench metrics are n=1 (single sample, mad=0), so the timing numbers are weak evidence of central tendency — but timing is irrelevant to the verdict here since there is no contest.

## Why the winner wins (deep technical)

This is a **spatial-transform transcode**: decode H.264, vertically mirror every frame, re-encode H.264 back into MP4. Two things must be true for an engine to even enter: (1) it must declare the generic `transcode` operation, and (2) it must declare the descriptive `flip` capability token that this row gates on (`src/scenarios/transcode/index.ts:721-724`, `features: [c.feature]` at line ~793). The scenario was deliberately designed so that engines lacking the knob remain honest `NA_ENGINE` rather than faking a pass — see the design note at `src/scenarios/transcode/index.ts:695-700` ("a real upright H.264 asset so the cell becomes live as soon as an engine declares support").

Only `ffmpeg.wasm` clears both bars. Its capability list explicitly advertises `'flip'` (`src/engines/ffmpeg-wasm/codecs.ts:1486`, commented `-vf hflip/vflip`). When the row runs, the adapter reads the `flip` option and, for `flip === 'v'`, appends the **`vflip`** filter to the FFmpeg `-vf` chain (`src/engines/ffmpeg-wasm/adapter.ts:2312-2318`). It then re-encodes with H.264 (libx264 in the wasm build), and because a spatial transform is present it tightens the encoder quality (`spatialTransformCrf = crop || pad || flip ? '6' : '12'` at `adapter.ts:2435`) so the output is near-lossless relative to the transformed source — which is exactly what produces the very high SSIM observed. This is a genuine FFmpeg filtergraph invocation against the real wasm-compiled libavfilter, not a copy or a canned blob.

The correctness gate is the **transform-aware** `ssim-psnr` oracle (`src/core/oracles.ts:1842` `ssimVsReferenceSource`). Rather than comparing the output to the raw source (which would falsely fail because the frames are mirrored), the oracle decodes the source in-browser via the platform decoder, then applies the **same** vertical flip to the reference frames with `flipImageData` (`oracles.ts:1950-1954` inside `prepareReferenceImage`; `flipImageData` at `oracles.ts:2028`, `flipV` branch mirrors the canvas with `dctx.scale(1, -1)`). Candidate output frames are then compared to the flipped reference. The shard measurements are physically plausible for a near-lossless mirror re-encode at full 1920x1080: **8 frame pairs, SSIM mean 0.9996, SSIM min 0.9995, PSNR 55.5 dB (advisory)**, against a gate of **SSIM mean ≥ 0.97**. The margin to the floor (0.9996 vs 0.97) is large and is achieved on the *worst* frame too (min 0.9995), which is strong evidence the flip is geometrically correct — a wrong/un-flipped output would land near ~0.84 per the oracle's calibration note (`oracles.ts:1917-1919`). The `playback-smoke` oracle additionally confirms the muxed MP4 is decodable (`<video> played a few frames`).

Backend: `env.engineId = "ffmpeg-wasm"`, browser chromium 149 on Apple M1 Max. No `configUsed.backend/hwAccel/wasmThreads` block is present in this shard entry, so this is the single-thread/standard wasm path (no hardware encode). That makes the wall time large — **86.0 s wall, 0.349x realtime, encodeFps 10.46** — but timing does not bear on the verdict because no other engine is eligible. The win is purely a *capability* win: ffmpeg.wasm is the only engine in this matrix that can express an arbitrary libavfilter geometry transform inside the browser.

## What each other framework did wrong

- **mediabunny@1.48.0** — `NA_ENGINE`: does not declare feature `flip`. Honest NA. Mediabunny is a WebCodecs-based pipeline without an arbitrary filtergraph; a vertical mirror is not in its declared transform set, so it correctly abstains rather than faking it.
- **platform@chrome-149** — `NA_ENGINE`: does not declare feature `flip`. Honest NA. The raw WebCodecs platform path has no built-in vflip filter; mirroring would require a manual canvas/WebGL pass the adapter does not implement, so abstaining is correct.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: does not declare feature `flip`. Honest NA. It can transcode H.264 but does not advertise a vertical-flip transform knob.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: does not declare operation `transcode`. Honest NA — it is a parser/demuxer, not an encoder, so it cannot re-encode a flipped stream at all.
- **web-demuxer@4.0.0** — `NA_ENGINE`: does not declare operation `transcode`. Honest NA — a demux-only library with no encode path.
- **mp4box@2.3.0** — `NA_ENGINE`: does not declare operation `transcode`. Honest NA — an MP4 box/remux tool with no pixel-level decode/encode/transform.

All six NAs look honest, not under-declared: four are decode/parse/remux-only tools that legitimately cannot encode, and the two encoders (mediabunny, platform/WebCodecs, remotion-webcodecs) genuinely lack an arbitrary spatial-flip filter in their declared feature sets.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:720-725` (case `h264_flip_vertical`, `feature: 'flip'`, `extraOpts: { flip: 'v' }`); built at `src/scenarios/transcode/index.ts:783-805` with `input: 'h264_1080p_30s.mp4'`, `oracles: ['ssim-psnr','playback-smoke']`, default tolerances `ssimMin: 0.97, psnrMinDb: 36`.
- **Fixture exists:** `fixtures/media/h264_1080p_30s.mp4` is present (31 MB) — a real, full-size 1080p H.264 MP4, not synthetic/empty/mock.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2312-2318` appends real `vflip` to the FFmpeg filtergraph; quality tightening at `adapter.ts:2435`; feature declared at `src/engines/ffmpeg-wasm/codecs.ts:1486`. This is a real libavfilter call, not canned output, not an input→output copy, and not a short-circuit to a golden file.
- **Oracle:** `src/core/oracles.ts:1842-1926` (`ssimVsReferenceSource`) decodes the source in-browser and applies the matching `vflip` (`prepareReferenceImage` at 1928, `flipImageData` at 2028) before SSIM comparison. Gate is SSIM mean ≥ 0.97 on per-frame structural similarity — a real, non-trivial comparison. Measurements (8 pairs, SSIM 0.9996/min 0.9995, PSNR 55.5 dB) are physically plausible for a near-lossless full-res mirror re-encode.
- **Verdict:** **REAL** — real fixture, real FFmpeg filtergraph implementation, and a meaningful transform-aware structural-similarity oracle that would fail a wrong/un-flipped output (~0.84 per the oracle's own calibration note).
- **Cached note:** The winning result is `cached: true` ("cached previous PASS result"). The PASS and SSIM measurements are reused from a prior run, not re-executed in this run. The evidence is internally consistent and the bench numbers are concrete, but there is a standard staleness risk: if the adapter or fixture changed after the cache was written, the cached PASS would not reflect it. n=1 on all bench metrics also limits timing confidence.

## Confidence & caveats

- **Confidence: high** on the verdict. With exactly one eligible engine and a genuine transform-aware oracle clearing its floor by a wide margin (0.9996 vs 0.97), the outcome is unambiguous.
- The PSNR (55.5 dB) is advisory only — the reference is resampled by a different path than the candidate, so only SSIM is the gate (per `oracles.ts:1915-1919`). This does not weaken the verdict; SSIM alone is the calibrated discriminator.
- Bench is single-sample (n=1, mad=0) and `peakMemory` was not sampled (n=0). Timing/memory should be treated as indicative, not statistically robust — but they are immaterial to a single-PASS, capability-driven verdict.
- The six NAs are honest abstentions, not failures; this row is a pure capability gate that only ffmpeg.wasm currently satisfies.
