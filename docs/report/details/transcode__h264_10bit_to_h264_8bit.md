# transcode/h264_10bit_to_h264_8bit

- **Family:** transcode
- **Fixture asset:** `fixtures/media/h264_10bit_1080p_5s.mp4` (5.6 MB; H.264 High 10 profile, `pix_fmt=yuv420p10le`, 1920x1080, ~5s)
- **Primary metric:** wall (transcode latency); secondary throughputRealtime / encodeFps / longtasks
- **passCount:** 1 of 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` — **uncontested** (only PASS).
- **Decisive factor:** It is the only engine that declares AND genuinely implements the
  `depth:10bit-to-8bit` capability: a real software decode of the 10-bit (`yuv420p10le`)
  H.264 source followed by an explicit `-pix_fmt yuv420p` (8-bit) libx264 re-encode. All six
  other engines are N/A — either the framework does not implement a `transcode` operation at
  all (the demuxer/parser class) or it does not wire the 10-bit→8-bit depth feature (the
  WebCodecs class).
- **Margin over runner-up:** none (no second PASS). Absolute cost: wall median **12554 ms**
  (n=1), throughputRealtime **0.398x**, encodeFps **11.95**, longtasks **19963 ms**.

## Per-engine results

| Engine | Status | Oracles passed | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass, playback-smoke:pass | 12554.06 ms | 0.3983 x | 0 (not sampled) | 19963 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | does not declare feature 'depth:10bit-to-8bit' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | does not declare feature 'depth:10bit-to-8bit' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | does not declare feature 'depth:10bit-to-8bit' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | does not declare operation 'transcode' |

(peakMemory/decodeFps bench arrays have n=0 samples for this run, so they carry no measurement.)

## Why the winner wins (deep technical)

This scenario is a **bit-depth down-conversion**: the input is High-10 H.264 in MP4 with a
10-bit-per-sample planar layout (`yuv420p10le`, confirmed by `ffprobe` on the fixture). The
operation requested by the scenario (src/scenarios/transcode/index.ts:842-853) is to re-encode
to 8-bit H.264 in MP4 (`extraOpts: { video: { codec: 'h264', bitDepth: 8 } }`,
`feature: 'depth:10bit-to-8bit'`). Down-converting 10-bit to 8-bit is a *lossy sample
transformation* — it is not a stream copy, not a remux, and not a metadata edit; the decoder
must reconstruct 10-bit samples and the encoder must requantize them to 8-bit. Only a real
decode+encode pipeline can satisfy it.

ffmpeg.wasm takes the libx264 branch of its transcode builder
(src/engines/ffmpeg-wasm/adapter.ts:2433-2440). Because the caller asks for `codec: 'h264'`
with `bitDepth: 8`, `requestedBitDepth` is 8, so the >8-bit guard at adapter.ts:2282-2290 is
NOT triggered (that guard would NA a 10-bit *output* request, which is the sibling scenario).
Instead `enc` resolves to `libx264` and adapter.ts:2438 pushes the decisive flags:
`-pix_fmt yuv420p -preset veryfast` (with `-crf 12` from line 2440 because no bitrate is set).
The `-pix_fmt yuv420p` is the actual 10→8-bit reduction: FFmpeg auto-decodes the High-10
source to its native `yuv420p10le`, then the encoder's input format conversion downsamples
each component from 10-bit to 8-bit before libx264 (an 8-bit-only build) encodes it. The output
is a genuinely re-quantized 8-bit H.264 elementary stream muxed back into MP4. The adapter does
not short-circuit to the golden, copy the input, or hardcode output — the `exec()` call runs
the real vendored ffmpeg.wasm core (single-thread by default per the adapter header comment at
adapter.ts:10).

The gate is two oracles (default `['ssim-psnr','playback-smoke']` from index.ts:889). The
ssim-psnr oracle (src/core/oracles.ts:1688) for a transcode with no committed golden takes the
**reference-source path** (oracles.ts:1697-1738): it decodes the ORIGINAL 10-bit source
in-browser and the engine's 8-bit MP4 output via the platform decoder, then compares
downsampled-luma SSIM over sampled frames. The measurements are physically sensible for a
high-quality (crf 12) 10→8-bit transcode: `pairs=12`, `ssimMean=0.99995`, `ssimMin=0.99995` —
i.e. the 8-bit output is perceptually near-identical to the 10-bit source, exactly what a clean
down-convert should yield. `exactFrames=0` is expected and correct here: an 8-bit re-encode of
a 10-bit source can never be *digest-identical* to the source frames (different bit depth,
lossy quantization, re-compression), so PSNR-via-digest is reported "unavailable" and the gate
rests on the SSIM floor (0.99995 >= 0.97). playback-smoke (oracles.ts:1574) additionally
confirms a `<video>` element decoded and played frames from the output, proving the muxed MP4
is a real, browser-playable H.264 stream rather than a malformed blob.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE: "does not declare feature 'depth:10bit-to-8bit'". Honest
  NA. mediabunny offers a WebCodecs-backed transcode, but the suite has not wired a 10-bit
  decode → 8-bit re-encode capability for it; grep of src/engines/mediabunny finds no
  `depth:` token. The browser VideoDecoder/VideoEncoder path for High-10 + explicit 8-bit
  output is not registered, so the feature gate correctly excludes it.
- **platform@chrome-149** — NA_ENGINE: "does not declare feature 'depth:10bit-to-8bit'".
  Honest NA. The raw WebCodecs platform engine does not register the depth-conversion feature
  (no `depth:` token in src/engines/platform); High-10 hardware decode + 8-bit encode is not
  declared as a supported transform.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare feature
  'depth:10bit-to-8bit'". Honest NA. Same WebCodecs class as above; the 10→8-bit feature is
  not wired into its capability set.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'transcode'".
  Honest NA. This is a demux/parse-only library; it has no encoder and structurally cannot
  perform a transcode. Declining the whole `transcode` operation is correct, not under-declared.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'transcode'". Honest NA. A
  pure demuxer (packet extraction); no encode path exists, so declining transcode is correct.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare operation 'transcode'". Honest NA. An
  ISO-BMFF box/segment tool (remux/parse); it does not decode or encode video samples, so it
  cannot transcode. Correct decline.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/transcode/index.ts:842-853 (`DEPTH_HDR_CASES` entry
  `h264_10bit_to_h264_8bit`), assembled into a Scenario at index.ts:876-889. Input is the real
  corpus fixture, output is 8-bit H.264/MP4, default oracles `ssim-psnr` + `playback-smoke`.
  The `notes` state it deliberately uses the real 10-bit H.264 source instead of a mislabeled
  HEVC fixture — a sound gating rationale.
- **Fixture exists & is real:** `fixtures/media/h264_10bit_1080p_5s.mp4`, 5.6 MB. `ffprobe`
  confirms `codec_name=h264`, `pix_fmt=yuv420p10le` (genuinely 10-bit), 1920x1080. Not
  synthetic, not empty, not a mock.
- **Winner adapter genuinely implements the op:** src/engines/ffmpeg-wasm/adapter.ts:2275-2440.
  Real libx264 branch with `-pix_fmt yuv420p` performing the 10→8-bit reduction, executed via
  the vendored ffmpeg.wasm `exec()`. Capability declared at adapter.ts:1494 with the honest
  comment "verified 10-bit source decode to 8-bit H.264 encode via pix_fmt". No canned output,
  no input→output copy, no golden short-circuit, no swallowed error reporting success.
- **Oracle is meaningful:** src/core/oracles.ts:1688 (ssim-psnr) runs the reference-source
  comparison (decode 10-bit source + decode 8-bit output, SSIM over 12 frames); src/core/
  oracles.ts:1574 (playback-smoke) requires real `<video>` playback. Measurements
  (pairs=12, ssimMean/min=0.99995, exactFrames=0) are physically plausible for a crf-12
  10→8-bit transcode. `exactFrames==0` here is correct (bit-depth change precludes a
  digest-identical frame) rather than a sign of a hollow gate — the SSIM floor (>=0.97) is the
  real correctness lever and 0.99995 clears it with large margin.
- **Cached note:** the winner result has `cached==true` ("cached previous PASS result"). The
  PASS evidence (oracle outcomes + measurements) was reused, not freshly re-run, so there is a
  staleness risk if fixtures or the adapter changed since the cached run. The adapter file's
  mtime ("1 day") is close to the run timestamp (2026-06-22), so the risk is low but non-zero.
- **Verdict:** **REAL** — real 10-bit fixture, genuine libx264 decode+down-convert+re-encode
  implementation, and a non-trivial SSIM+playback gate with plausible measurements. The only
  caveat is the cached reuse.

## Confidence & caveats

- **Confidence: high** that ffmpeg.wasm is the correct (and only eligible) winner: it is the
  sole PASS and the sole engine with a wired 10→8-bit path; all six NA reasons are honest
  (verified by grep that the WebCodecs engines do not declare the feature and the
  parser/demuxer engines have no transcode op).
- Performance numbers are **n==1** with `mad=0`/`p95==median` (single sample), so the wall
  (12554 ms), encodeFps (11.95) and longtasks (19963 ms) are point estimates, not distributions
  — but with no contender, performance is not decisive anyway.
- `peakMemory` and `decodeFps` were not sampled (n=0) for this run.
- The win rests on a perceptual proxy (SSIM) plus smoke, not a bit-exact gate — appropriate
  since a 10→8-bit down-convert is inherently lossy, but it means correctness is validated to
  perceptual (SSIM 0.99995) rather than bit-exact strength.
- Result is **cached**; a fresh re-run is advisable to fully eliminate staleness risk.
