# transcode/video_only_h264_resize_360p_to_vp9_webm

family: transcode · fixture asset: `fixtures/media/h264_video_only.mp4` (real H.264 video-only MP4, 1280x720, 30fps, 5.0s, ~2.78 Mbps, no audio) · primaryMetric: throughputRealtime · passCount: 1 / 7

## Verdict

- Best framework: **platform@chrome-149** (`env.engineId "platform"`).
- Contested? **No — uncontested.** Exactly one engine reached `status==PASS`; the other six are `NA_ENGINE`.
- Decisive factor: this scenario is gated on the capability token `mediarecorder:video-only` (plus operation `transcode`). Only the platform adapter declares that token, because the transcode is implemented as the browser-native `<video> → canvas → MediaRecorder(VP9/WebM)` capture path. Every other engine either does not declare the feature (remotion-webcodecs, mediabunny, ffmpeg-wasm) or does not declare the `transcode` operation at all (web-demuxer, mp4box, remotion-media-parser).
- Margin over runner-up: N/A — there is no second PASS to compare against. Platform's win is on eligibility/capability, not a benchmark margin.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:true, playback-smoke:true | 50003.77 ms | 0.0999 x-rt | 0 (n=0) | 2414 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'mediarecorder:video-only' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'mediarecorder:video-only' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'mediarecorder:video-only' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Notes: platform's `peakMemory` and `decodeFps` benches have `n==0` (not sampled); `encodeFps` median is 2.9998 fps (n=1). All platform benches are `n==1` (single sample, mad=0), so the timing figures are low-confidence point estimates.

## Why the winner wins (deep technical)

The operation is a lossy re-encode: decode H.264 (in an MP4, no audio) → downscale 1280x720 → 640x360 → encode VP9 → mux into a WebM, target bitrate 4 Mbps. Raw browser platform APIs cannot accept opaque encoded chunks into a muxer; the only broadly-available native muxing path is `MediaRecorder`, which re-encodes a *live* `MediaStream`. The platform adapter implements exactly that pipeline rather than faking a container copy.

Backend (from `env.configUsed`): `backend:"webcodecs"`, `hwAccel:true`, `pipeline:"streaming"`, `decode:"VideoDecoder"`, `encode:"<video>→canvas→MediaRecorder(out)"`, `pixelBackend:"webgpu>webgl>offscreen2d"`, `frameTransfer:"transferable"`. So the source is decoded via hardware `VideoDecoder`/`<video>`, blitted onto a canvas at the target 640x360, and the canvas capture stream is fed to a VP9 `MediaRecorder`. Because it is real-time-bound (MediaRecorder records wall-clock), throughputRealtime is ~0.0999x (i.e. ~10x slower than realtime), wall median is 50003.77 ms for a 5s clip, encodeFps 2.9998. These figures are physically consistent with a real-time canvas→MediaRecorder replay of a 5s/150-frame clip, not an offline fast encode.

Adapter code path:
- Capability declaration: `src/engines/platform/adapter.ts:232` declares `transcode: true` (LIMITED) and `src/engines/platform/adapter.ts:272-274` declares the `mediarecorder:video-only` feature token that gates this scenario.
- The transcode entrypoint `src/engines/platform/adapter.ts:370-416` honestly NA-guards: rejects `opts.audio` (line 377), fanout variants (383), rotation (386), audio-bearing fixtures (390), alpha (396), oversized buckets (402), and unrecordable container/codec combos via `recorderMimeFor` (408). For this fixture none of those trip (it is genuinely audio-less, no alpha), so it proceeds.
- The real encode: `src/engines/platform/transcode.ts:72 transcodeViaRecorder`. `recorderMimeFor` (line 31) resolves `video/webm;codecs=vp9` via `MediaRecorder.isTypeSupported` (line 36). The canvas is sized to `opts.video.width/height` = 640x360 (lines 93-99), `canvas.captureStream(0)` is used so frames are pushed only on `track.requestFrame()` (line 106), `videoBitsPerSecond` is set to the 4 Mbps target (line 108), and `playAndPaint` (line 203) drives `ctx.drawImage(video,...)` per decoded frame via `requestVideoFrameCallback` (lines 215-229). Output bytes are assembled from the real recorder chunks (lines 132-135). This is a genuine decode→resize→re-encode, not a copy.

Oracle evidence (from the shard): the gating oracle is `ssim-psnr`, which for a transcode with no committed golden uses the §5.2 reference path `ssimVsReferenceSource` (`src/core/oracles.ts:1736-1738`, body ~1840-1926): it re-decodes the platform output, decodes the SOURCE in-browser, downscales the source to the candidate's 640x360, and computes full-pixel SSIM. Measured: `pairs:8`, `ssimMean:0.99099`, `ssimMin:0.99027`, `psnrDb:30.13` (advisory), gate `SSIM≥0.93`. A mean SSIM of 0.991 against a 640x360 reference is strong evidence the VP9 output is the correctly-downscaled source content — far above the 0.93 floor and consistent with the oracle's documented "correct downscale ≈0.99 vs wrong frame ≈0.84" separation (oracles.ts:1917-1919). `playback-smoke` additionally confirms the WebM actually plays a few frames.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE: "engine does not declare feature 'mediarecorder:video-only'". It DOES declare `transcode:true` (`src/engines/mediabunny/adapter.ts:1026`) and could encode VP9/WebM via Conversion, but it does not advertise the platform-specific MediaRecorder-video-only token this scenario gates on. NA is honest (this token is a deliberately platform-only capability marker), not a transcode-capability gap.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: same feature token absent. It declares `transcode:true` (`src/engines/ffmpeg-wasm/adapter.ts:1459`) and can produce VP9/WebM via wasm, but does not declare `mediarecorder:video-only`. Honest NA on a token that does not describe its (non-MediaRecorder) pipeline.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: same token absent. WebCodecs-based encoder; could in principle transcode but is not the MediaRecorder path this scenario selects. Honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". It is a demux-only library (no encoder). Honest NA.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". MP4 box parser/remuxer, no re-encode capability. Honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Parser only, no encoder. Honest NA.

None of the six failed an oracle; all are pre-oracle capability NAs. None looks like an under-declared transcode capability *for this specific scenario*, because the gate is the platform-only `mediarecorder:video-only` token by design (see scenario `notes`).

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:202-215` (id `video_only_h264_resize_360p_to_vp9_webm`). `asset: 'h264_video_only.mp4'`, `features: ['resize','mediarecorder:video-only']`, `opts: webm/vp9/640x360/4Mbps`, `tolerances: ssimMin 0.93`. `notes` explicitly say the fixture is chosen so platform can exercise its REAL canvas→MediaRecorder path "without falsely claiming audio preservation" — gating rationale is sound.
- Fixture existence: `fixtures/media/h264_video_only.mp4` exists, 1.7 MB. ffprobe confirms a single real H.264 video stream 1280x720, 5.0s, no audio track. Golden meta (`fixtures/golden/h264_video_only.mp4.meta.json`) corroborates: container mp4, h264, 1280x720, 30fps, ~2.78 Mbps, single video track. Real media, not synthetic/empty/mock.
- Winner adapter: `src/engines/platform/transcode.ts:72-160` performs a genuine decode→canvas-resize→VP9 MediaRecorder encode; it does NOT copy input→output, does NOT short-circuit to the golden, and does NOT swallow errors as success (it throws → NotApplicableError/FAIL). The NA guards at `adapter.ts:370-407` prevent over-claiming (audio/alpha/fanout/oversize).
- Gating oracle: `src/core/oracles.ts:1688 ssimPsnr` → reference path `ssimVsReferenceSource` (~1840-1926) does a REAL full-pixel SSIM of the re-decoded output against the in-browser-decoded+downscaled source. Not trivially satisfiable: gate SSIM≥0.93 with measured 0.99099 mean / 0.99027 min over 8 real frame pairs; PSNR 30.13 dB advisory. exactFrames is not the basis here (this is the reference-source branch using true-pixel SSIM, not the digest-proxy branch), and the tolerance discriminates correct vs wrong frames (~0.99 vs ~0.84). Measurements are physically plausible for a 720p→360p VP9 transcode.
- Cached note: platform's result has `cached==true` ("cached previous PASS result"). The PASS evidence (oracles + benches) was REUSED from a prior run, not re-executed this run — staleness risk exists, but the cached payload is internally consistent and the implementation/oracle are real.
- Verdict: **REAL** — real fixture + genuine MediaRecorder transcode implementation + meaningful full-pixel SSIM gate, with a cached-staleness caveat.

## Confidence & caveats

- Confidence: high on the decision (single eligible PASS; capability gating is explicit and honest). Medium on the benchmark figures: every platform bench is `n==1` (mad=0, single sample), and `peakMemory`/`decodeFps` were not sampled (`n==0`), so timing is a point estimate, not a distribution.
- The win is uncontested by construction — the scenario is gated on a platform-only token. This measures "can the browser-native path do a video-only H.264→VP9/WebM downscale-transcode correctly", which platform does (SSIM 0.991), not a head-to-head speed race.
- `cached==true`: evidence was reused. If the fixture or adapter changed since caching, re-run to confirm. The launcher seeding caveat (stale PASS reuse) applies; clear raw + .browser-cache for an honest fresh run.
