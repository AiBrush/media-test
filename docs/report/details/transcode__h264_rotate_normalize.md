# transcode/h264_rotate_normalize

- **family:** transcode
- **fixture asset:** `fixtures/media/h264_rotated90.mp4` (4.4 MB, H.264 video + AAC stereo @48 kHz in MP4, 1280×720, 30 fps, ~10 s)
- **operation:** `transcode` — bake display rotation to upright (`video.rotate: 0`), output H.264/MP4
- **primaryMetric:** wall (ms); secondary throughputRealtime, encodeFps, peakMemory, longtasks
- **passCount:** 3 of 7 (remotion-webcodecs, mediabunny, ffmpeg-wasm)
- **gating oracles:** `ssim-psnr` (correctness), `playback-smoke`
- **tolerances:** ssimMin 0.98, psnrMinDb 38

## Verdict

- **Best framework:** **remotion-webcodecs@4.0.479** — `env.engineId` `remotion-webcodecs`.
- **Contested:** YES — 3 engines PASS.
- **Decisive factor:** CORRECTNESS STRENGTH. remotion-webcodecs is the only PASS engine whose re-encoded
  output decodes **bit-exact** to the committed upright golden: `ssim-psnr` reports `exactFrames: 12` of 12
  pairs (all digest-identical → SSIM=1, **PSNR=∞**). The other two PASS engines satisfy only the weaker
  downsampled-luma SSIM path with `exactFrames: 0` (no frame is digest-identical), i.e. perceptual-proxy
  only. Per the oracle ladder, bit-exact decoded frames > perceptual SSIM proxy, so remotion-webcodecs wins
  on correctness before performance is even consulted.
- **Margin over runner-up:** On correctness, the gap is categorical: 12/12 digest-exact frames vs 0/12 for
  both mediabunny and ffmpeg-wasm. remotion-webcodecs is *also* fastest: wall median **413.4 ms** vs
  mediabunny **708.0 ms** (1.71× faster) and ffmpeg-wasm **13 450 ms** (32.5× faster); throughputRealtime
  **24.19×** vs **14.12×** (1.71×) and **0.74×** (32.5×); encodeFps **725.7** vs **423.7** (1.71×) and
  **22.3** (32.5×). So even on the secondary tiebreak it leads.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | **PASS** | ssim-psnr:✓ (12/12 exact, SSIM=1, PSNR=∞); playback-smoke:✓ | 413.39 ms | 24.19× | 0 (n=0) | 19963 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:✓ (0/12 exact, SSIMmin 0.99999946); playback-smoke:✓ | 708.05 ms | 14.12× | 0 (n=0) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:✓ (0/12 exact, SSIMmin 0.99999975); playback-smoke:✓ | 13449.95 ms | 0.74× | 0 (n=0) | 2577 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA — source carries audio and the MediaRecorder canvas-capture path cannot preserve/copy audio |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Note: peakMemory and decodeFps have `n:0` (no samples) for every engine; those columns carry no signal here.
The 19963 ms `longtasks` value is identical across both WebCodecs engines (a page-lifetime main-thread
metric, not a per-op signal); only ffmpeg-wasm's worker path shows a different 2577 ms.

## Why the winner wins (deep technical)

**The operation.** The fixture is H.264-in-MP4, 1280×720, with a stereo AAC track. Despite the name
`h264_rotated90.mp4`, the container `tkhd` transformation matrix is **identity** ([1,0,0,1,0,0]) on both
track headers, and `coded_width/coded_height` = 1280×720. So `rotate: 0` is a *normalize* operation: decode
→ (rotation already 0°, no pixel rotation needed) → re-encode H.264 into a fresh MP4 with clean,
normalized display metadata. The committed golden (`fixtures/golden/h264_rotated90.mp4.frames.json`) holds
12 browser-decoded upright 1280×720 RGBA sha256 digests — exactly the upright reference the oracle compares
against. Because `usesTransformReference` (oracles.ts:1973) only triggers for crop/pad/flip — not
rotate — this scenario runs in **committed-golden mode** (`haveGolden=true`, oracles.ts:1695), so the gate
is decoded-frame digest equality against golden, with downsampled-luma SSIM as the fallback.

**Why remotion-webcodecs hits 12/12 bit-exact.** Its `transcode()` (adapter.ts:521) normalizes the rotate
to a degree value (adapter.ts:542-544) and routes the work through the shared `convert()` driver
(adapter.ts:576), which first header-probes for `durationInSeconds`/`fps` to pre-size the MP4 moov
(adapter.ts:600-606), then calls the real library `wc.convertMedia({ container, videoCodec, rotate,
controller, writer: bufferWriter, expectedDurationInSeconds, expectedFrameRate })` (adapter.ts:615-627) and
returns the in-memory bytes via `result.save()` (adapter.ts:629-630). convertMedia decodes with native
WebCodecs `VideoDecoder` (hardware-preferred — `env.configUsed.hwAccel: "prefer-hardware(+software
fallback)"`, `backend: "webcodecs"`) and re-encodes with the native `VideoEncoder`. Crucially, the suite's
golden was baked with the *same* browser WebCodecs decode/normalize path (see the `$todo` in
`h264_rotated90.mp4.frames.json`: "BROWSER-PRODUCED GOLDEN … ffmpeg cannot produce them"). remotion's
WebCodecs decode of its own freshly-encoded output therefore reproduces the *identical* normalized RGBA
buffers, so `normHex(cand.sha256) === normHex(want[i].sha256)` for all 12 pairs (oracles.ts:1766), driving
`exactCount=12 → exactCount===pairs → PSNR=∞` (oracles.ts:1803-1809). It also wins performance: streaming
back-pressure pipeline (`pipeline: "streaming-backpressure"`, `queueDepth: "waitForQueueToBeLessThan"`) on
hardware codecs gives wall 413.4 ms / encodeFps 725.7 — 1.71× ahead of mediabunny and 32.5× ahead of
ffmpeg-wasm.

**Why mediabunny and ffmpeg-wasm pass but lose.** Both produce perceptually-identical output (SSIMmin
0.99999946 and 0.99999975 respectively, ≥ the 0.98 floor) but **0/12 digest-exact**. Their re-encoded
pixels differ from the golden at the byte level (different encoder ringing / chroma rounding / decode color
conversion), so they never satisfy the digest-equality fast path and fall to the downsampled-luma SSIM
signature path (oracles.ts:1773-1789) — a strictly weaker, lossy proxy. On the oracle ladder
(bit-exact > perceptual SSIM proxy) that is a clear second tier. ffmpeg-wasm is additionally crippled on
speed: single-thread wasm software transcode at wall 13 450 ms and **0.74× realtime** (slower than
playback), with encodeFps 22.3 — both far behind the hardware-WebCodecs engines.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on correctness strength: `ssim-psnr` `exactFrames: 0` (no
  digest-identical frame), SSIMmin 0.99999946 via the weaker luma-signature proxy, vs the winner's 12/12
  bit-exact PSNR=∞. Also 1.71× slower wall (708.0 vs 413.4 ms) and half the encodeFps (423.7 vs 725.7).
- **ffmpeg.wasm@0.12.15** — PASS but worst on both axes: `exactFrames: 0` (perceptual-proxy only, SSIMmin
  0.99999975), and catastrophically slow — wall 13 450 ms, throughput **0.74× realtime** (32.5× slower than
  the winner), encodeFps 22.3. Single-thread wasm software encode (`env.configUsed` shows no WebCodecs
  backend) is the cause.
- **platform@chrome-149** — NA_ENGINE (effectively NA_BROWSER capability). It declares transcode
  (`backend: webcodecs`, `encode: "<video>→canvas→MediaRecorder(out)"`) but its canvas-capture encode path
  cannot preserve/copy the source AAC audio; reason is honest given the documented MediaRecorder limitation
  for an audio-bearing source. Not an under-declared capability — it correctly refuses rather than emit a
  silent/audio-dropped output that would mis-pass.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: a parser-only library that does not declare
  `transcode` (operations map in adapter.ts:190); no encoder exists.
- **mp4box@2.3.0** — NA_ENGINE, honest: declares/implements only its four demux/remux operations
  (adapter.ts:637; undeclared ops throw, adapter.ts:946). No re-encode capability.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: demux-only (operations map adapter.ts:624; undeclared ops
  throw, adapter.ts:1043). No encoder.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:269-281` (case `h264_rotate_normalize`),
  materialized by `buildVideoScenario` (index.ts:290) with default oracles `['ssim-psnr','playback-smoke']`
  (index.ts:293). `notes`: "Bake the 90° display rotation into pixels (rotate→0); SSIM vs upright reference
  frames."
- **Fixture exists & is real:** `fixtures/media/h264_rotated90.mp4` — 4.4 MB real H.264/AAC MP4, ffprobe
  confirms 1280×720 H.264 video + AAC track (NOT synthetic/empty/mock). One caveat surfaced below.
- **Oracle is meaningful:** `ssim-psnr` (oracles.ts:1688-1833) performs a real per-frame comparison — digest
  equality against the committed golden (oracles.ts:1766) with downsampled-luma SSIM fallback
  (oracles.ts:1782-1786), gating on the worst-frame SSIM ≥ 0.98 (oracles.ts:1823). It is not trivially
  satisfiable: the winner cleared it via the strict digest path (PSNR=∞), and the measurements are
  physically plausible (12 paired frames at golden resolution 1280×720, SSIM values to 7 decimal places).
- **Winner implementation is genuine:** `src/engines/remotion-webcodecs/adapter.ts` `transcode()` (line 521)
  → `convert()` (line 580) → real `wc.convertMedia(...)` with `rotate`, native WebCodecs decode+encode,
  `bufferWriter`, returns bytes from `result.save()` (line 629). No canned output, no input→output copy, no
  short-circuit to the golden file, no error-swallow-as-success.
- **Cached note:** the winner's result is `cached: true` ("cached previous PASS result", startedAt
  2026-06-22). All three PASS results are cached reuse, not a fresh re-run — staleness risk applies equally
  across the contested set, so it does not bias the ranking, but the absolute numbers are from a prior run.
- **Verdict:** **REAL** — real fixture + real WebCodecs convertMedia implementation + a meaningful
  bit-exact-first oracle that the winner cleared at the strongest tier.

## Confidence & caveats

- **Confidence: high.** The winner is decisive on the primary axis (12/12 bit-exact vs 0/12) and also leads
  every performance metric, so the ranking is robust to bench noise.
- **Bench caveat:** every metric is `n: 1` (`mad: 0`, p95==median) — single-sample timings. The 1.71× and
  32.5× wall margins are large enough to survive single-sample noise, but treat the absolute ms as
  indicative only. All three are cached, so timings reflect the prior run's environment.
- **Fixture-name caveat (not a cheat, but worth flagging):** the asset is named `*_rotated90` and notes say
  "bake the 90° display rotation," yet both `tkhd` matrices are identity and the codec dimensions are already
  1280×720 — so for this committed copy the rotate-to-0 is effectively a re-encode/normalize rather than an
  actual 90° pixel rotation. The gate still validates a real transcode against a real golden; the operation
  is just less of a rotation stress-test than the name implies.
- **Golden-coupling caveat:** the bit-exact win is partly a consequence of the golden being browser-WebCodecs
  baked (per the frames.json `$todo`). This rewards the WebCodecs-native engine whose decode/normalize path
  matches the golden bake exactly; mediabunny (also WebCodecs, but via `VideoSample.copyTo(RGBA)>canvas`)
  and ffmpeg-wasm (software) legitimately differ at the byte level. The SSIM fallback still confirms all
  three are perceptually correct, so the loss is one of strictness tier, not of validity.
