# transcode/h264_rotate_180

- **Family:** transcode
- **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264/AAC in MP4, ~30 s)
- **Operation:** apply explicit 180° rotation, re-encode to H.264/MP4
- **primaryMetric:** none set (correctness rotate row); tiebreaker = wall median
- **Oracles (gating):** `property-invariant` (transcode-output-metadata) + `playback-smoke`
- **passCount:** 3 of 7 (mediabunny, remotion-webcodecs, ffmpeg-wasm)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — 3 engines PASS, all satisfying the identical two oracles with equal strictness.
- **Decisive factor:** PERFORMANCE. Correctness is a tie (every passing engine clears the same metadata
  invariant + smoke gate; no pixel/bit-exact oracle exists for this row because the reference frames are
  not counter-rotated, per the scenario notes). mediabunny wins on wall median.
- **Margin over runner-up (remotion-webcodecs):** wall 2684.53 ms vs 7466.29 ms = **2.78x faster**;
  throughputRealtime 11.18x vs 4.02x = **2.78x higher**; encodeFps 335.25 vs 120.54 = **2.78x higher**.
  Caveat: mediabunny's main-thread blocking is far worse (longtasks 3234 ms vs 173 ms) and its peakMemory
  was not sampled (n=0), so remotion has the better responsiveness/memory profile. All bench samples are
  n=1 and `cached==true`, so the margin is single-shot evidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass, playback-smoke:pass | 2684.53 | 11.175 | 0 (n=0, not sampled) | 3234 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:pass, playback-smoke:pass | 7466.29 | 4.018 | 47,599,048 | 173 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass, playback-smoke:pass | 83328.02 | 0.360 | 0 (n=0, not sampled) | 192 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode is NA — MediaRecorder canvas capture does not apply rotation transforms |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Measured oracle deltas (transcode-output-metadata, tolerance 0.15 s, all PASS):
mediabunny durationDeltaSec=0.0800; remotion-webcodecs durationDeltaSec=0.0210; ffmpeg-wasm
durationDeltaSec=0.0000. All three report videoTracks=1 in the re-muxed MP4.

## Why the winner wins (deep technical)

This row is an *apply-180°-rotation* re-encode of a real 30 s 1080p H.264/AAC MP4. There is no rotation-aware
golden, so the gate is metamorphic on the OUTPUT shape (container=mp4, video track present, duration within
0.15 s of source) plus a `<video>` playback smoke check — not on rotated pixels (scenario notes,
`src/scenarios/transcode/index.ts:649-651`). Because the correctness bar is shape+duration only, the three
WebCodecs/wasm pipelines that actually run the transcode all clear it; the contest collapses to throughput.

mediabunny routes the operation through its `Conversion` API. The adapter's `transcode()`
(`src/engines/mediabunny/adapter.ts:1271-1322`) opens one `Input`, builds a single `Output`, and forwards a
`ConversionOptions{input, output, video, trim:{start:0,end:duration}}` to `runConversion`. The 180° angle is
handled in `buildVideoOptions` (`src/engines/mediabunny/adapter.ts:588-598`): it normalizes
`rotate = ((180 % 360)+360)%360 = 180` and sets `allowRotationMetadata = false`, which forces mediabunny to
BAKE the rotation into the coded pixels rather than only flipping the ISOBMFF display-matrix flag. The encode
runs on the WebCodecs backend with `hwAccel:"prefer-hardware"` selected by probing
`canEncodeVideo(isConfigSupported)` (`adapter.ts:616-645`) on the M1 Max's hardware H.264 encoder, in a
`streaming-lockstep` pipeline with no SharedArrayBuffer / no COOP-COEP requirement
(`env.configUsed`). That yields wall 2684.53 ms, throughputRealtime 11.18x, encodeFps 335.25 — i.e. it
re-encodes a 30 s clip in ~2.7 s. The oracle then re-probes the output via the reference engine and confirms
container=mp4, 1 video track, durationDelta 0.0800 s ≤ 0.15 s (`oracles.ts:3682-3707`).

remotion-webcodecs uses the same WebCodecs encode primitive (`backend:"webcodecs"`,
`hwAccel:"prefer-hardware(+software fallback)"`) but a `streaming-backpressure` pipeline with
`waitForQueueToBeLessThan` queue throttling and an offscreencanvas-2d pixel path. It is correct (durationDelta
0.0210 s, the tightest of the three) but ~2.78x slower in wall/throughput/encodeFps — the rotation goes
through a 2D canvas draw per frame and the backpressure wait caps the encoder feed rate, so it lands at
120.54 encodeFps vs mediabunny's 335.25. Its compensating strength: extractFrames/parse run worker-capable,
so it only blocks the main thread 173 ms (vs mediabunny's 3234 ms) and it actually sampled peakMemory at
47.6 MB. ffmpeg.wasm is correct (durationDelta exactly 0.0000 — it re-muxes with the source timebase) but
runs a single-thread wasm software H.264 encode (`encodeFps 10.80`, throughputRealtime 0.360x = slower than
real time), giving wall 83328 ms ≈ **31x slower** than mediabunny. On a pure correctness-tie row the
hardware-accelerated WebCodecs path is the decisive advantage, and within the two WebCodecs engines
mediabunny's lockstep, non-throttled encoder feed is 2.78x faster.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** correct (durationDelta 0.0210 s) but 2.78x slower —
  wall 7466.29 ms vs 2684.53 ms, throughput 4.02x vs 11.18x, encodeFps 120.54 vs 335.25. Its
  streaming-backpressure `waitForQueueToBeLessThan` throttle + offscreencanvas-2d rotation draw cap encoder
  throughput. (It does win responsiveness: longtasks 173 ms vs 3234 ms, and is the only PASS engine that
  sampled peakMemory: 47.6 MB.)
- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correct with exact duration (Δ 0.0000 s) but single-thread
  wasm software encode is ~31x slower (wall 83328 ms, throughputRealtime 0.360x — below real time,
  encodeFps 10.80). No hardware encoder access in the wasm sandbox is the root cause.
- **platform@chrome-149 (NA_ENGINE):** honest, capability-grounded NA. Its only encode route is
  `<video>→canvas→MediaRecorder`, and `MediaRecorder` canvas capture cannot apply a rotation transform; the
  adapter throws `NotApplicableError('transcode', 'MediaRecorder canvas capture does not apply rotation
  transforms')` (`src/engines/platform/adapter.ts:387`). NOT an under-declared capability — it genuinely
  cannot bake rotation.
- **mp4box@2.3.0 (NA_ENGINE):** honest — does not declare the `transcode` operation. mp4box is a
  parser/muxer, not an encoder; it has no decode→rotate→encode pipeline.
- **web-demuxer@4.0.0 (NA_ENGINE):** honest — does not declare `transcode`. It is a demuxer only (no encoder).
- **remotion-media-parser@4.0.479 (NA_ENGINE):** honest — does not declare `transcode`. It is a parser, not
  an encoder.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:636-652` (id `h264_rotate_180`, in
  `ROTATE_CASES`). `opts.video.rotate = 180`, `optsInvariant: 'transcode-output-metadata'`,
  `oraclesOverride: ['property-invariant','playback-smoke']`, durationTolerance from
  `TC_REENCODE_DURATION_TOLERANCE_SEC`. Notes explicitly justify omitting ssim-psnr ("the reference frames
  are not counter-rotated"), which is sound — a correct 180° rotation would score near-zero SSIM against an
  un-rotated reference, so a pixel oracle here would be unfair, not absent-by-laziness.
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB, real H.264/AAC MP4 — `stat` confirmed.
  Not synthetic/empty/mock.
- **Oracle:** `transcodeOutputMetadataInvariant` at `src/core/oracles.ts:3626-3708`. It re-probes the
  engine OUTPUT via an independent reference engine (`ctx.referenceEngine.probe`), compares requested
  container, duration vs golden within an explicit tolerance band, and counts video/audio tracks. It is a
  genuine metamorphic check on real output, NOT trivially satisfiable: a copy-input-to-output cheat would
  still have to produce a valid mp4 with matching duration, and a missing/zero-track output fails. Measured
  values are physically plausible (durationDelta 0.08/0.02/0.00 s on a ~30 s clip; videoTracks=1). This is a
  SHAPE/metadata gate, not a pixel gate — so the PASS is real but does NOT prove the 180° rotation pixels
  are correct.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1271-1322` (transcode via `Conversion`) +
  `:588-598` (rotate=180, allowRotationMetadata:false to bake pixels) + `:616-645` (real
  `canEncodeVideo`/WebCodecs hardware probe). The transcode genuinely decodes→rotates→re-encodes through
  the library; it does not return canned output, copy input→output, short-circuit to a golden, or swallow
  errors (encode failure throws `NotApplicableError`/`Error`, not a silent PASS).
- **Cached note:** mediabunny's result has `cached==true` ("cached previous PASS result") — bench numbers
  were reused from a prior run, not re-executed this session. All three PASS engines are cached, so the
  perf margin is single-shot (n=1, mad=0) and carries staleness risk; the RANKING (mediabunny > remotion >
  ffmpeg) is robust to noise given the 2.78x and 31x gaps, but exact ms values should be treated as
  one-sample estimates.
- **Verdict:** **WEAK-GATE.** Real fixture + real WebCodecs/Conversion implementation + a real metamorphic
  oracle — but the gate is metadata/shape + playback smoke only. No oracle verifies the rotated pixels are
  actually rotated 180°, so a winner that produced an UPRIGHT (or wrongly-rotated) but otherwise valid mp4
  would also pass. The PASS is honest and the perf comparison is fair, but correctness coverage for the
  rotation transform itself is intentionally absent (acknowledged in scenario notes).

## Confidence & caveats

- **Confidence: medium.** The winner and ranking are unambiguous (2.78x and 31x gaps dominate any n=1
  noise), and all code paths/fixtures were verified. Confidence is held at medium (not high) because:
  (1) the gate is WEAK — no rotation-pixel oracle, so "best" means "fastest valid-shape transcode," not
  "fastest correct rotation"; (2) all PASS results are `cached==true` with n=1/mad=0, so absolute bench
  numbers are single-shot; (3) mediabunny did not sample peakMemory (n=0) and has a much worse main-thread
  longtask profile (3234 ms), so a responsiveness- or memory-weighted ranking would favor remotion-webcodecs.
- The four NA engines are all honest (3 don't declare transcode; platform has a concrete MediaRecorder
  limitation cited at adapter.ts:387). No under-declared capabilities detected.
