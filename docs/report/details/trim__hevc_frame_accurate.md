# trim/hevc_frame_accurate

**Family:** trim | **Fixture asset:** `fixtures/media/hevc_1080p_10s.mp4` (HEVC/hvc1 video + AAC audio, MP4, ~11 MB) | **Primary metric:** wall (ms) | **passCount:** 1 / 7

Operation: frame-accurate trim of the HEVC clip over `startUs=2_500_000 .. endUs=6_500_000` (requested 4.000 s), `frameAccurate: true`, declared feature `trim:frame-accurate-hevc`, duration tolerance 0.1 s.

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **UNCONTESTED** (only PASS of 7 engines).
- **Decisive factor:** mediabunny is the *only* engine that declares BOTH the `trim` operation AND the gated capability `trim:frame-accurate-hevc` (an HEVC re-encode of the leading GOP via WebCodecs). Five engines do not declare `trim` at all; ffmpeg.wasm declares `trim` but not the HEVC frame-accurate feature, so it is gated out as NA_ENGINE before any run.
- **Margin over runner-up:** N/A — there is no second PASS. All six non-winners are NA_ENGINE (capability not declared), so there is no measured runner-up to compute a ratio against.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | trim-boundaries:pass, playback-smoke:pass | 480.805 ms | 20.798 x-rt | 0 (n=0, not sampled) | 5478 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'trim:frame-accurate-hevc' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

This case requires a **frame-accurate** cut at `t=2.5 s` of an **HEVC (hvc1) elementary stream in MP4**. A frame-accurate trim that does not start on an IDR/CRA keyframe is fundamentally different from a copy-trim: the leading partial GOP between the prior keyframe and the requested start must be **decoded and re-encoded** so the output opens on a clean IDR at exactly the requested PTS. That re-encode demands a working **HEVC encoder**, which on the web means a WebCodecs `VideoEncoder` configured for `hvc1`/`hev1` backed by platform hardware. Only mediabunny both exposes a trim API and advertises that it can drive that HEVC re-encode.

Mechanistically, mediabunny's `trim()` (`src/engines/mediabunny/adapter.ts:1445`) builds a `mediabunny.Output` with a BufferTarget and runs the library's high-level **Conversion** pipeline with `trim: { start: 2.5, end: 6.5 }` (`adapter.ts:1485-1489`). Because the scenario sets `frameAccurate: true`, the adapter takes the branch at `adapter.ts:1493-1495` that sets `convOpts.video = { forceTranscode: true, hardwareAcceleration: HW_ACCEL }`. `forceTranscode` is the critical lever: without it, mediabunny would snap the start to the nearest keyframe and emit a lossless copy (the keyframe-aligned sibling case `hevc_keyframe_aligned`); with it, the Conversion runs read→decode→**encode**→mux so the requested 2.5 s start is honored exactly rather than rounded to a GOP boundary. The `env.configUsed` in the shard confirms the realized backend: `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"` — i.e. it used the Apple M1 Max hardware HEVC codec (GPU string `ANGLE Metal Renderer: Apple M1 Max`) with no cross-origin-isolation requirement, where ffmpeg.wasm's software HEVC path would need single-thread wasm (or SAB threading with COOP/COEP).

The gating oracle `trim-boundaries` (`src/core/oracles.ts:2348`) measured the realized cut: `outDurationSec=4.0747`, `requestedDurationSec=4.0`, `durationDeltaSec=0.07467` — within the tight `durationToleranceSec=0.1` for this case (the keyframe-aligned siblings allow 1.1 s; this one is 11x tighter, consistent with a genuine frame-accurate gate). The ~75 ms overshoot is physically plausible: it is roughly the duration of two 25 fps frames (one frame ≈ 40 ms), the expected tail when the encoder flushes whole GOP boundaries. The second oracle `playback-smoke` confirmed a real `<video>` element decoded and played frames of the produced output, proving the muxed hvc1/MP4 is a valid, decodable file and not an opaque blob. Performance was 480.8 ms wall at 20.8x realtime for a 4 s extract — credible for a hardware HEVC decode+re-encode of a 1080p clip on M1 Max.

The note on the oracle ("boundary frame digest skipped (loaded golden is source-prefix, not trim-range golden)", `boundaryFrameComparisons: 0`) is honest: the suite has not yet baked a trim-range frame golden for this range, so per-frame SHA-256 boundary comparison is deliberately disabled (`oracles.ts:2405-2431`) to avoid falsely failing a correct cut against a source-prefix golden. The live gate is therefore duration-within-0.1 s plus real playback — strong enough to confirm the cut happened and is roughly frame-accurate, but not a bit-exact pixel proof.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'trim:frame-accurate-hevc'". It declares the `trim` operation but not the HEVC frame-accurate re-encode capability, so the runner gates it at `src/core/runner.ts:171-174` before execution. This NA looks **honest/conservative**: ffmpeg.wasm *could* in principle re-encode HEVC in software, but the adapter chooses not to advertise it (likely because libx265 in the 0.12.15 wasm build is absent or prohibitively slow/COOP-COEP-bound), and an under-declared capability is preferable to a false PASS.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". The raw-WebCodecs/`<video>` platform shim is a decode/probe primitive with no muxing trim op. Honest NA.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". mp4box is an MP4 box parser/segmenter; it could copy-trim on keyframes but cannot re-encode HEVC, so it correctly declines the whole `trim` op. Honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". It is a demuxer only (no encoder/muxer trim path). Honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". A parser/metadata library with no trim/encode op. Honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". It wraps WebCodecs transcode but does not expose a `trim` operation in this suite, so it is gated at the operation level. Honest NA (and notably it does have WebCodecs access, but the adapter never declares the op, so it cannot win here).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/trim/index.ts:251-264` (`id: 'hevc_frame_accurate'`). Real `asset: 'hevc_1080p_10s.mp4'`, `frameAccurate: true`, `features: ['trim:frame-accurate-hevc']`, `tolerances.durationToleranceSec: 0.1`. Notes: "HEVC frame-accurate trim (leading GOP re-encode requires an HEVC encoder); NA where unsupported."
- **Fixture exists:** `fixtures/media/hevc_1080p_10s.mp4` present, ~11 MB — a real HEVC/MP4 file, not synthetic/empty/mock.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1445` (`trim`), with the frame-accurate branch at `:1493-1495` (`forceTranscode: true`, `hardwareAcceleration`) and the Conversion run at `:1496` (`runConversion`). Feature declared at `adapter.ts:1052` (`'trim:frame-accurate-hevc'`). This is a genuine call into mediabunny's real Conversion/encode pipeline — it does NOT return canned output, copy input→output (the noop-trim shortcut at `:1468-1477` is bypassed because `startUs=2.5 s` ≠ 0), short-circuit to a golden, or swallow errors (invalid ranges throw at `:1450-1455`).
- **Gating oracle:** `src/core/oracles.ts:2348` (`trimBoundaries`). It performs a real duration comparison of the *decoded/probed output* against the requested range with a tight 0.1 s tolerance, and would `fail()` at `:2394-2400` / `:2433` if the cut were wrong. Measurements (`outDurationSec=4.0747`, `durationDeltaSec=0.07467`) are physically plausible for a 4 s frame-accurate HEVC extract. Boundary-frame SHA comparison is honestly skipped (`boundaryFrameComparisons:0`) because no trim-range frame golden is baked yet.
- **Cached:** `cached: true` — this is a **reused** prior PASS, not a fresh run (`reason: "cached previous PASS result"`). Per the launcher-seeding caveat, a stale PASS can survive even after the code changed; the wall/throughput/longtasks numbers reflect a previous execution and should be re-validated with a fresh run (clear raw + .browser-cache).
- **Verdict:** **WEAK-GATE.** The fixture is real, the implementation genuinely re-encodes via WebCodecs HEVC, and the oracle performs a real (tight, 0.1 s) duration check plus live playback — so the PASS is real. But it is not a *strong* correctness gate: there is no bit-exact / per-frame boundary digest (`boundaryFrameComparisons:0`), so "frame-accurate" is only proven to ~one-frame duration precision, not pixel-exact at the cut. Combined with `cached:true`, evidence is solid for "a real HEVC frame-accurate trim happened" but stops short of bit-exact proof.

## Confidence & caveats

- **Confidence: high** that mediabunny is the correct and only eligible winner — the decision is structural (sole declarer of op+feature), not a close metric race, so it is robust to the cached flag.
- **Caveats:** (1) `cached:true` means bench numbers (480.8 ms / 20.8x / longtasks 5478 ms) are from a prior run and should be re-validated fresh. (2) The gate is duration+smoke only; the ~75 ms (≈2-frame) overshoot is within tolerance but the cut is not proven pixel-exact (no trim-range frame golden). (3) `peakMemory`/`targetWrites` were not sampled (n=0), so memory cost is unknown. (4) ffmpeg.wasm's NA is a declaration choice, not a hard impossibility — a future build that advertises software HEVC re-encode could contest this case.
