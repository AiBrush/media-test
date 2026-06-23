# robustness/edge_open_gop_bframes_decode

- **Family:** robustness (edge battery — gnarly-but-valid asset)
- **Fixture asset:** `fixtures/media/h264_bframes_1080p.mp4` (≈11 MB, H.264 High@1080p in MP4, open-GOP with B-frame reordering)
- **Golden:** `fixtures/golden/h264_bframes_1080p.mp4.frames.json` (12 baked RGBA sha256 digests, `pending:false`, baked by the platform engine in Chrome 149)
- **Operation:** `decodeFrames` with `options.maxFrames=90`, gated by oracle `decoded-frames-bitexact`
- **primaryMetric:** none populated in shard (no `bench{}` block on any entry; only `durationMs` available)
- **passCount:** 4 of 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (4 engines PASS with identical bit-exact correctness).
- **Decisive factor:** Correctness is a perfect tie — all four PASS engines produced `comparedFrames:12 / mismatchedFrames:0` against the 12 golden digests (the full bit-exact ladder, the strongest correctness class). No `bench{}` metrics were recorded for this scenario, so the only available performance signal is end-to-end `durationMs`. mediabunny is fastest at **1947 ms**, ahead of platform (1982 ms), remotion-webcodecs (2183 ms), and web-demuxer (2229 ms).
- **Margin over runner-up:** 1947 ms vs 1982 ms (platform) = **1.018x faster wall** (≈35 ms, ~1.8%). This is a *thin* margin on a single cached `durationMs` sample (n=1, no MAD/p95 spread, all four `cached:true`), so the win is by correctness-tie + marginally lower wall, not a robust performance gap.

## Per-engine results

| Engine | Status | Oracles passed (name:pass) | Wall (durationMs) | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | decoded-frames-bitexact:true (12/12) | 1947 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | decoded-frames-bitexact:true (12/12) | 1982 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | decoded-frames-bitexact:true (12/12) | 2183 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | decoded-frames-bitexact:true (12/12) | 2229 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare feature 'decode:golden-rgba' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare operation 'decodeFrames' |

No `throughputRealtime`, `peakMemory`, or `longtasks` were recorded for any engine on this scenario (the bench block is absent from every shard entry).

## Why the winner wins (deep technical)

This scenario stresses the single hardest correctness property of an H.264 decode pipeline: **presentation-order reconstruction across B-frames in an open GOP.** In `h264_bframes_1080p.mp4` the coded (decode/DTS) order is not the display (PTS) order — B-frames reference both past and future anchors, and an open GOP means the first frames of a GOP can depend on frames from the prior GOP. An adapter that naively emits frames in decode order, or that drops the leading non-displayable frames, will produce a digest sequence that does not match the golden `frames[0..11]` (PTS 0, 33333, 66667, … 366667 µs at ~30 fps). The golden therefore acts as a precise, per-PTS bit-exact gate: `compareDigests` (src/core/oracles.ts:1166–1207) keys each `want` frame by index, falls back to `matchByPts` within ±21 ms (oracles.ts:1209–1221), and fails on *any* `normHex` mismatch. mediabunny scored `comparedFrames:12, mismatchedFrames:0` — every one of the first 12 PTS-ordered frames is byte-identical to the WebCodecs-baked golden.

mediabunny achieves this because its `decodeFrames` (src/engines/mediabunny/adapter.ts:1330) drives a hardware-accelerated WebCodecs path through mediabunny's `VideoSampleSink` (adapter.ts:1387). The sink yields `VideoSample` objects already in **presentation order**, and the adapter converts each via `imageDataFromVideoSample` → `VideoSample.copyTo(..., {format:'RGBA'})` (adapter.ts:1398, 1721–1754) — the exact RGBA normalization (`pixelBackend: "VideoSample.copyTo(RGBA)>canvas"`, env.configUsed) that matches the golden bake path. Because the golden was produced by Chrome's WebCodecs VideoDecoder and mediabunny decodes through the *same* underlying WebCodecs decoder with `hwAccel: prefer-hardware` (env.configUsed.backend `webcodecs`), the chroma upsampling, color conversion, and rounding are bit-identical to the golden — hence 12/12 bit-exact rather than the near-miss you'd get from an independent (e.g. swscale) RGBA converter. The `maxFrames:90` cap is honored by the sink loop (adapter.ts:1389–1396); the oracle only compares the 12 baked frames (`goldenFramesForDecodeCompare`, oracles.ts:1129–1134), so `measuredFrames:90, goldenFrames:12, comparedFrames:12` is exactly what we see.

The three co-winners reach the identical bit-exact result through the same WebCodecs substrate (all declare `decode:golden-rgba`: platform adapter.ts:280, web-demuxer adapter.ts:662, remotion-webcodecs adapter.ts:274) — confirming the result is genuinely cross-engine and not a quirk of one decoder. The platform engine's reorder logic is visible and instructive: src/engines/platform/decode.ts collects `(pts, VideoFrame)` from the VideoDecoder `output` callback, deliberately over-submits chunks past `maxFrames` to drain B-frame reorder buffers (`submitCap = maxFrames + 16`, decode.ts:194 with the comment at :192–193), `flush()`es, and then **sorts by PTS** (`collected.sort((a,b)=>a.ptsUs-b.ptsUs)`, decode.ts:222) before digesting. That explicit PTS sort is precisely the operation an open-GOP/B-frame asset demands. mediabunny edges the others only on wall time (1947 ms), and only marginally; the correctness is a dead heat.

Caveat on the platform co-winner: the golden was *baked by* the platform engine (frames.json `bakedBy: "frame-bake (platform engine)"`), so platform passing is partly self-referential. The strong, independent evidence is that mediabunny, web-demuxer, and remotion-webcodecs each reproduced the platform-baked digests bit-for-bit — three independent adapters agreeing to the byte makes the golden credible and the PASS real.

## What each other framework did wrong

- **platform@chrome-149 (PASS, lost on wall):** Correct and bit-exact (12/12) but 1982 ms vs mediabunny's 1947 ms (0.98x — ~35 ms slower). Also the golden's baker, so its PASS is the least independent of the four. Lost purely on the thin wall-time tiebreak.
- **remotion-webcodecs@4.0.479 (PASS, lost on wall):** Bit-exact (12/12) via the same WebCodecs path (`backend:webcodecs`, `pixelBackend:offscreencanvas-2d`), but slowest-but-one at 2183 ms (0.89x of mediabunny → ~12% slower wall). Its MOV/MP4 fast-path machinery is irrelevant here and adds no help on a plain progressive MP4 decode.
- **web-demuxer@4.0.0 (PASS, lost on wall):** Bit-exact (12/12) but slowest at 2229 ms (0.87x of mediabunny → ~14% slower wall). Same correctness class, worst wall of the four.
- **ffmpeg.wasm@0.12.15 (NA_ENGINE — honest):** Declares the `decodeFrames` *operation* (adapter.ts:1460) but NOT the *feature* `decode:golden-rgba`, so the runner gates it out ("engine does not declare feature 'decode:golden-rgba'"). This is honest, not under-declared: ffmpeg.wasm rasterizes via swscale, whose RGBA output differs at the byte level from Chrome's WebCodecs golden, so it could never be bit-exact against this golden — declaring the capability would produce false FAILs. Correct self-exclusion.
- **remotion-media-parser@4.0.479 (NA_ENGINE — honest):** Pure parser/demuxer with no decoder; `decodeFrames` throws "no decoder; emits encoded samples only" (adapter.ts:556–557). Genuinely cannot decode pixels. Honest NA.
- **mp4box@2.3.0 (NA_ENGINE — honest):** Pure MP4 box parser/demuxer; does not declare `decodeFrames` at all (no decode/encode capability). Honest NA.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/robustness/index.ts:48–58 (`id: 'edge_open_gop_bframes_decode'`, `op: 'decodeFrames'`, `asset: 'h264_bframes_1080p.mp4'`, `features: ['decode:golden-rgba']`, `options: {maxFrames:90}`, `oracles: ['decoded-frames-bitexact']`, note: "Open-GOP / B-frame reorder over many frames — output must stay in pts order.").
- **Fixture exists & is real:** `fixtures/media/h264_bframes_1080p.mp4` present, ≈11 MB — a real multi-second 1080p H.264 clip, not synthetic/empty/mock. Golden `fixtures/golden/h264_bframes_1080p.mp4.frames.json` has 12 real 64-hex sha256 digests at monotonic PTS (0…366667 µs, 1920x1080), `pending:false`, `bakedAtIso:2026-06-18`.
- **Oracle is real & strict:** `decoded-frames-bitexact` → `decodedFramesBitexact` (src/core/oracles.ts:1056) → `compareDigests` (oracles.ts:1166). It performs `normHex(g.sha256) !== normHex(w.sha256)` exact comparison per frame; any single mismatch FAILs (oracles.ts:1190–1204). Tolerance is zero (sha256 equality) — not trivially satisfiable; a missing golden FAILs honestly (oracles.ts:1062–1068). Measurements `measuredFrames:90 / goldenFrames:12 / comparedFrames:12 / mismatchedFrames:0` are physically consistent (90 decoded under maxFrames:90, 12 compared = full golden set).
- **Winner adapter is genuine:** mediabunny `decodeFrames` (src/engines/mediabunny/adapter.ts:1330) drives a real `VideoSampleSink` over WebCodecs (adapter.ts:1387), pulls real `VideoSample`s, and digests `VideoSample.copyTo(RGBA)` output (adapter.ts:1398, 1754). No canned output, no input→output copy, no short-circuit to the golden file, no error swallowing (errors propagate after `mbInput.dispose()`). The 12-frame bit-exact match is independently corroborated by three other adapters.
- **Verdict: REAL.** Real 11 MB fixture, real WebCodecs decode in every PASS engine, zero-tolerance sha256 oracle over a populated golden, cross-engine agreement.
- **Cached note:** All four PASS results carry `cached:true` ("cached previous PASS result"), reused from earlier runs rather than re-executed in this pass. Correctness staleness risk is low (golden is deterministic and `pending:false`), but the `durationMs` tiebreak (1947 vs 1982 ms) is a single stale, un-spread sample — do not over-weight the ~1.8% wall margin.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict (4-way bit-exact PASS, REAL gate) is high-confidence and code-verified. The *winner selection among the four* is low-confidence: it rests entirely on a ~35 ms (~1.8%) `durationMs` difference from a single cached sample, with no `bench{}` (throughputRealtime/peakMemory/longtasks all absent) and n=1, no MAD/p95.
- Any of mediabunny / platform / web-demuxer / remotion-webcodecs is correctness-equivalent here; a re-run could reorder them on wall time. If forced to break the tie by tiebreaker (B) c, all use hardware WebCodecs with `coopCoep:not-required` and `wasmThreads:0`, so no architectural separation either — mediabunny wins only on the measured wall number.
- platform's PASS is self-referential (it baked the golden); treat the three non-baker bit-exact matches as the real proof.
- ffmpeg.wasm's NA is correct behavior, not a coverage hole, because its swscale RGBA cannot match a WebCodecs-baked golden.
