# metadata/rotation_decode_read_h264_rotated90

- **family:** metadata
- **fixture asset(s):** `fixtures/media/h264_rotated90.mp4` (4.4 MB, real H.264-in-MP4 with a 90° display matrix)
- **golden:** `fixtures/golden/h264_rotated90.mp4.frames.json` (12 baked RGBA frame digests; oracle compares first 8 per `maxFrames`)
- **primaryMetric:** wall (no `primaryMetric` field; only `wall` bench present)
- **passCount:** 1 / 7

## Verdict

- **Best framework:** `platform@chrome-149` (Chrome 149 WebCodecs).
- **Contested?** No — **uncontested**. Exactly one engine ran (status PASS); the other six returned NA (all NA_ENGINE).
- **Decisive factor:** `platform` is the only engine that declares the decode-side capability `rotation:decode` AND implements a decode op (`decodeFrames`). It passed the strongest oracle in the ladder — `decoded-frames-bitexact` — with **8/8 frames bit-exact, 0 mismatches**. No runner-up exists, so there is no metric margin to report.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | decoded-frames-bitexact:true | 122.54 ms (n=1) | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'rotation:decode' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'rotation:decode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'rotation:decode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'rotation:decode' |

The shard only carries a `wall` bench (median 122.54 ms, p95 122.54, mad 0, n=1) for `platform`; throughputRealtime/peakMemory/longtasks were not collected for this decode-read scenario.

## Why the winner wins (deep technical)

This scenario is a rotation READ gate expressed as an **observable decoded effect**, not a metadata-field comparison. As the scenario doc explains (`src/scenarios/metadata/rotation-tracks.ts:8-18`), `golden-metadata.compareTrack` never compares `track.rotation`, so the only faithful way to assert that an engine honored the MP4 90° display matrix is to decode the clip and digest-compare the resulting RGBA against golden frames that the reference decoder baked **rotation-applied**. The A.16 trap is the engine that "bakes rotation into width/height and serves unrotated pixels" — that produces a different RGBA image and a frame-digest mismatch.

The fixture is genuinely rotated: `h264_rotated90.mp4` is a 4.4 MB real H.264/MP4. The golden frames in `h264_rotated90.mp4.frames.json` carry `width:1280, height:720` (not 720×1280), confirming the reference decoder presented the matrix-applied frame at the coded raster while baking the 90° rotation into the pixel content — exactly the "matrix not w/h swap" semantics the scenario describes (`rotation-tracks.ts:13-18`). A wrong implementation would diverge on the sha256, not on dimensions.

`platform` is the only engine that satisfies the two gates the runner imposes here. The scenario is built by `buildDecodeRead` (`src/scenarios/metadata/_shared.ts:220`) as op `decodeFrames`, requiring operation `decodeFrames` and feature `rotation:decode`, gated by oracle `decoded-frames-bitexact`. `platform` declares `decodeFrames: true` (`src/engines/platform/adapter.ts:230`) and lists `'rotation:decode'` in its feature set (`adapter.ts:277`). The adapter comment is explicit about the mechanism (`adapter.ts:268-270`): display-matrix MP4s route through the browser `<video>` presenter / WebCodecs decode so rotation is baked into the observed pixels, while write-path rotation (transcode/remux/mux) stays undeclared. The decode runs on the WebCodecs `VideoDecoder` hardware path — `env.configUsed` shows `backend:"webcodecs", hwAccel:true, pipeline:"streaming", decode:"VideoDecoder"` on an Apple M1 Max (ANGLE Metal). RGBA normalization is in `src/engines/platform/raster.ts:77` (`imageDataFromVideoFrame`): when a frame is rotated/cropped the direct `copyTo(RGBA)` fast path is skipped (it is gated on an `untransformed` check at `raster.ts:99-107`) and the frame is instead drawn through canvas `drawImage` (`raster.ts:84-88`), which honors the display matrix — the comment at `raster.ts:72-75` states this is precisely why the canvas fallback exists.

The oracle outcome confirms a real, strong pass: `decoded-frames-bitexact` reported `measuredFrames:8, goldenFrames:8, comparedFrames:8, mismatchedFrames:0` — "8 frame digest(s) bit-exact vs golden". This is the top rung of the correctness ladder (bit-exact decoded frames), the strongest possible evidence for a rotation-read gate. The oracle (`src/core/oracles.ts:1056`) sources the engine's own decoded `ctx.frames` (`oracles.ts:1112-1113`), slices golden to `maxFrames`=8 (`oracles.ts:1129-1134`), and compares sha256 per index with a pts fallback (`compareDigests`, `oracles.ts:1166-1206`). A single differing byte in any of the 8 frames would have produced `mismatches>0` and a FAIL.

## What each other framework did wrong

- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest: mp4box is a pure MP4 demuxer/box-parser with no pixel decoder; it cannot produce decoded RGBA, so it correctly does not claim the `decodeFrames` op.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest: media-parser is a container/metadata parser, not a frame decoder; correct under-declaration.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'rotation:decode'". ffmpeg can decode H.264, so this is a deliberate feature gate, not an op gate. The suite requires an explicit `rotation:decode` claim (scenario `notes`, `rotation-tracks.ts:79-81`) so that engines which do not guarantee display-matrix-applied output report NA instead of a misleading pixel mismatch. ffmpeg.wasm decode by default ignores the container display matrix unless an explicit `transpose`/autorotate filter is applied, so declining the claim is honest rather than under-declared.
- **mediabunny@1.48.0** — NA_ENGINE: "engine does not declare feature 'rotation:decode'". mediabunny is the reference decoder that BAKED the goldens (CanvasSink/VideoSample.draw, per `rotation-tracks.ts:15`), so it can apply rotation; but it did not register the `rotation:decode` capability token for this op, so it self-excludes. Mild under-declaration relative to its actual ability, but consistent with the suite's conservative gating; not a defect.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'rotation:decode'". WebCodecs-based, decode-capable, but does not claim matrix-applied output; honest conservative NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare feature 'rotation:decode'". A WASM demuxer; declining a decode-presentation capability is honest.

## Anti-cheat validation

- **Scenario:** `src/scenarios/metadata/rotation-tracks.ts:60-83` (`id: 'rotation_decode_read_h264_rotated90'`, `asset: 'h264_rotated90.mp4'`, `maxFrames: 8`, `features: ['rotation:decode']`), built via `buildDecodeRead` (`src/scenarios/metadata/_shared.ts:220-233`).
- **Fixture exists:** `fixtures/media/h264_rotated90.mp4` present, 4.4 MB — a real H.264/MP4 clip, not synthetic/empty/mock.
- **Golden:** `fixtures/golden/h264_rotated90.mp4.frames.json` — `pending:false`, 12 real sha256 RGBA digests, `bakedAtIso:"2026-06-18T13:54:06.075Z"`, baked by the platform engine in a real Chrome 149. Frames carry 1280×720 (matrix baked into pixels, not into dims), consistent with genuine rotated content.
- **Oracle:** `decoded-frames-bitexact` at `src/core/oracles.ts:1056` → `compareDigests` at `oracles.ts:1166-1206`. Performs a per-frame sha256 comparison against golden with zero tolerance; FAILs on any mismatch, on missing overlap, or on empty decode. It is NOT a smoke/SSIM proxy (`measurements.exactFrames` n/a; this is bit-exact, the strongest gate). Measurements (`comparedFrames:8, mismatchedFrames:0`) are physically plausible for an 8-frame 30 fps decode (golden ptsUs 0,33333,66667,… match 1/30 s spacing).
- **Winner adapter:** declares `decodeFrames:true` (`src/engines/platform/adapter.ts:230`) and `'rotation:decode'` (`adapter.ts:277`); decode rasterization honors the display matrix via canvas `drawImage` fallback (`src/engines/platform/raster.ts:77-107`). Real WebCodecs `VideoDecoder` path (`env.configUsed.decode:"VideoDecoder"`, `hwAccel:true`). No hardcoded output, no input→output copy, no golden short-circuit, no swallowed errors.
- **Cached note:** `platform`'s result has `cached:true` ("cached previous PASS result"). Evidence is a reused PASS, not a fresh re-run this batch — minor staleness risk per the launcher-seeding caveat. The golden bake (2026-06-18) predates the run (2026-06-22); since fixtures and golden are unchanged, the cached PASS is consistent, but a fresh re-run would harden the evidence.
- **Verdict:** **REAL** — real 4.4 MB rotated fixture + genuine WebCodecs decode with matrix-applied rasterization + bit-exact zero-tolerance oracle that passed 8/8 with 0 mismatches.

## Confidence & caveats

- **Confidence: high.** Uncontested winner; the single PASS is backed by the strongest correctness oracle (bit-exact) with clean measurements, and the fixture/golden/adapter/oracle code all check out as REAL.
- **Caveat 1 (cached):** the winning result is cached, not freshly re-run; numbers (wall 122.54 ms, n=1) and PASS are reused. A single sample (n=1, mad=0) is thin perf evidence, but perf is irrelevant to the verdict here.
- **Caveat 2 (no contest):** six engines self-excluded by capability declaration. Most NAs are honest (mp4box/media-parser have no decoder). mediabunny is the reference baker and is arguably under-declared for `rotation:decode`, but its abstention does not affect correctness of the result; it simply means the gate has a single eligible engine.
- **Caveat 3:** the gate is read-only (display rotation observed on decode). The complementary write-path gate is `metadata/rotation_survives_mp4_mkv`; this detail covers only the READ side.
