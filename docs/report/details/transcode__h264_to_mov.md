# transcode/h264_to_mov

family: transcode | fixture asset: `h264_1080p_30s.mp4` (31 MB, real H.264/AAC clip) | primaryMetric: throughputRealtime | passCount: 2/7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (2 engines PASS: mediabunny and ffmpeg.wasm).
- **Decisive factor: performance.** Both PASS engines clear the exact same two oracles at indistinguishable
  correctness (SSIM ≈ 1.0000, metadata-invariant pass, both with `exactFrames==0`). Correctness is a tie, so
  ranking falls to performance, where mediabunny is overwhelmingly ahead.
- **Margin over runner-up (ffmpeg.wasm):**
  - wall median **2596.2 ms vs 80431.9 ms → 30.98x faster**.
  - throughputRealtime **11.56x vs 0.373x → 31.0x higher** (mediabunny is faster-than-realtime; ffmpeg.wasm is ~3x slower than realtime).
  - encodeFps **346.66 vs 11.19 → 30.98x higher**.
  - longtasks **173 ms vs 5077 ms → 29.3x less main-thread blocking**.
  - peakMemory not captured (`n==0`) for either engine, so memory is not a discriminator here.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | ssim-psnr:pass, property-invariant:pass | 2596.2 ms | 11.56x | n/a (n=0) | 173 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass, property-invariant:pass | 80431.9 ms | 0.373x | n/a (n=0) | 5077 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a re-encode transcode of a 30-second 1080p **H.264-in-MP4** source into a **QuickTime MOV**
(ISOBMFF/qtff) container, preserving 1 video + 1 audio track (the property-invariant detail confirms
"`mov, 2 track(s)`"). Scenario `transcode/h264_to_mov` (`src/scenarios/transcode/index.ts:1239-1243`,
materialized at `:1271-1294`) requests `container:'mov', video:{codec:'h264'}`, gated by `ssim-psnr` +
`property-invariant` with default tolerances `ssimMin:0.98, psnrMinDb:38`.

**Backend that made the difference.** mediabunny ran on `env.configUsed`:
`backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `wasmThreads:0`,
`sharedArrayBuffer:false`, `coopCoep:"not-required"`, on an Apple M1 Max (ANGLE Metal). The adapter routes
the transcode through mediabunny's `Conversion` API: `transcode()` builds a real `MovOutputFormat`
(`src/engines/mediabunny/adapter.ts:1285` → `makeOutputFormat('mov', …)` →
`src/engines/mediabunny/codecs.ts:166-167` returns `new MovOutputFormat(isobmff)`), constructs an `Output`
with a `BufferTarget`, and drives `Conversion.init/.execute()` to completion
(`src/engines/mediabunny/adapter.ts:1287-1307`, runner at `:841-868`). Video options force
`hardwareAcceleration:'prefer-hardware'` (`adapter.ts:604`, `:634`), so decode and re-encode of the H.264
elementary stream go through the M1 Max hardware VideoToolbox-backed WebCodecs path. That is why encodeFps
hits **346.66 fps** and the whole 30 s clip transcodes in **2.6 s at 11.56x realtime**, with only 173 ms of
cumulative long-task time — the heavy lifting runs off the main thread on the GPU/media engine, not in JS.

**Why ffmpeg.wasm cannot compete here.** ffmpeg.wasm does the identical work but in a **single-thread WASM
software codec** (the adapter defaults to the single-thread core to avoid SAB/COOP-COEP fragility — see
`src/engines/ffmpeg-wasm/adapter.ts:10`). Software H.264 decode + re-encode of 1080p frames in WASM yields
encodeFps **11.19**, wall **80.4 s**, throughput **0.373x** (3x slower than realtime), and **5077 ms** of
blocking long tasks. It still PASSes both oracles (SSIM 0.99999998, duration delta 0.0 s), so it is correct —
it just costs ~31x more wall time and ~29x more main-thread blocking for the same result.

**Oracle evidence (real numbers from the shard).** `ssim-psnr` (`src/core/oracles.ts:1688-1832`) is in
reference-source mode (no committed pixel golden; it re-decodes the produced MOV with the platform engine and
SSIMs against the in-browser-decoded source). mediabunny: 12 pairs, **ssimMin 0.999995, ssimMean 0.999999**,
`exactFrames:0`; far above the 0.98 gate. `property-invariant` (transcode-output-metadata,
`src/core/oracles.ts:3626-3708`) re-probes the output with the reference engine and confirms container=`mov`,
**durationDeltaSec 0.08 ≤ tolerance 0.15**, videoTracks 1 — structurally a valid MOV with the requested shape.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost on performance: 30.98x slower wall (80431.9 vs 2596.2 ms), 31.0x
  lower throughput (0.373x vs 11.56x), 29.3x more long-task blocking (5077 vs 173 ms). Single-thread WASM
  software codec vs hardware WebCodecs is the entire gap; correctness is a dead heat.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'mov'". Honest NA — the raw
  WebCodecs/platform muxer surface does not expose a MOV/qtff writer; it is a capability gap, not a hidden bug.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mov'". Honest NA —
  remotion-webcodecs muxes mp4/webm, not the QuickTime variant; declaring `mov` would be over-claiming.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — mp4box is a
  demux/remux/box-tool with no encoder; it cannot re-encode H.264.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — it is a
  demuxer only, no encode path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest —
  it is a read/parse-only library with no muxer or encoder.

## Anti-cheat validation

- **Scenario:** `src/scenarios/transcode/index.ts:1239-1243` (case), `:1271-1294` (definition). `input:
  'h264_1080p_30s.mp4'` at `:1277`.
- **Fixture exists:** `fixtures/media/h264_1080p_30s.mp4` — real 31 MB H.264/AAC file (confirmed via `ls`).
  Not synthetic/empty/mock. Golden artifacts present (`fixtures/golden/h264_1080p_30s.mp4.{meta,frames,packets,ssim}.json`).
- **Winner adapter genuinely implements the op:** `src/engines/mediabunny/adapter.ts:1271-1311` calls the real
  `mb.Conversion.init/.execute` (`:848-855`) with a real `MovOutputFormat` (`codecs.ts:166-167`) and
  hardware WebCodecs (`:604/:634`). No canned bytes, no input→output copy, no short-circuit to golden, no
  swallowed error reporting success (`runConversion` throws on `!conversion.isValid`, `adapter.ts:849-854`).
- **Oracles are real but proxy-grade:** `ssim-psnr` (`oracles.ts:1688`) actually re-decodes the produced MOV
  and computes downsampled-luma SSIM against the in-browser-decoded source; `property-invariant`
  (`oracles.ts:3626`) re-probes the output container/duration/track shape. Measurements are physically
  plausible (12 frame pairs, SSIM 0.99999, duration delta 0.08 s within 0.15 s tol, 1 video track). **Caveat:**
  this is a perceptual proxy, not a bit-exact gate — `exactFrames:0` on both engines and PSNR is reported as
  "unavailable" (no golden pixels). A re-encode is allowed a different GOP, so this is appropriate by design,
  but it means the correctness gate is mid-strength, not bit-exact.
- **Cached note:** the winner's result has **`cached:true`** ("cached previous PASS result"); the runner-up is
  also `cached:true`. Numbers were reused, not freshly re-run — staleness risk noted, though both cached
  results are internally consistent and the relative ordering (hardware vs software codec) is robust.
- **Verdict: WEAK-GATE.** Real fixture + genuine hardware-WebCodecs implementation + real oracles, but the
  gating correctness oracle is a perceptual/metadata proxy (ssim-psnr with `exactFrames==0`, no PSNR, no
  bit-exact frame comparison), so the PASS is real but not the strongest possible class.

## Confidence & caveats

- Confidence **high** on the winner: the 31x performance margin is far larger than any sample-spread concern,
  and the mechanistic cause (hardware WebCodecs vs single-thread WASM) is well established.
- Caveats: (1) both PASS results are `cached:true` (potential staleness). (2) bench metrics have `n==1`
  (mad/p95 == median, zero spread), so the absolute timings are single-sample estimates — but a 31x gap
  dwarfs single-sample noise. (3) peakMemory was not captured (`n==0`) for either engine, so the memory
  tiebreaker could not be evaluated. (4) correctness ranking is a true tie under a proxy gate, so the win
  rests entirely on performance.
