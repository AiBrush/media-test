# transcode/ladder_large_vp9_1080p_120s_to_h264_720p

- family: transcode
- fixture asset: `large_vp9_1080p_120s.webm` (WebM/VP9 + Opus, ~102 MB, 120 s, 1080p) → MP4/H.264 + AAC @ 1280x720
- primaryMetric: framesPerSec
- passCount: 1 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (engineId `mediabunny`).
- Contested: **NO** — uncontested. Exactly one engine reached PASS; the other six are all NA_ENGINE.
- Decisive factor: mediabunny is the only engine that both (a) declares the `transcode` operation AND (b) can actually re-encode a large VP9→H.264 clip with a muxed AAC audio track inside the browser-WebCodecs budget. It passed the `ssim-psnr` correctness gate (SSIM min 0.99999 ≥ 0.97 over 12 frames).
- Margin over runner-up: not applicable — no other engine produced a comparable measurement (all NA). Absolute performance: 377.75 fps encode throughput, 9530 ms wall, peak memory 174.75 MB on the M1 Max hardware WebCodecs path.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true | 9530.12 ms | n/a (framesPerSec=377.75 fps; encodeFps=377.75) | 174753313 B (174.75 MB) | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode not applicable: large VP9→H.264/AAC 720p re-encode exceeds the browser-wasm suite budget |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA — MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | transcode: large fixture transcodes not reliable through the in-memory bufferWriter output path |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

(The shard's bench block carries `framesPerSec`/`encodeFps`/`wall`/`peakMemory`; there is no `throughputRealtime` or `longtasks` metric for this scenario — primaryMetric is `framesPerSec`.)

## Why the winner wins (deep technical)

This scenario is a full cross-axis re-encode: it crosses the **container axis** (WebM → MP4), the **video-codec axis** (VP9 → H.264), the **audio-codec axis** (Opus → AAC), and the **resolution axis** (1920x1080 → 1280x720), on a large 120-second source. That is the hardest combination in the transcode family: every track must be decoded and fully re-encoded (no copy/remux shortcut is legal because both the video codec and the audio codec change), and the demuxer/muxer pair must straddle two different containers.

mediabunny's `transcode` adapter (`src/engines/mediabunny/adapter.ts:1271-1322`) routes through the library's high-level `Conversion` API. The single-rung path (no `variants`) calls `runSingle(opts.video)` (adapter.ts:1321), which opens the source with `openInput` (adapter.ts:1287), builds an MP4 output target (adapter.ts:1285-1289), constructs `ConversionOptions` with `convOpts.video = await buildVideoOptions(...)` (adapter.ts:1302) and `convOpts.audio = buildAudioOptions(...)` (adapter.ts:1303), pins a full-duration trim `{start:0, end:inputDuration}` (adapter.ts:1305), and then hands off to `runConversion` (adapter.ts:1307). `runConversion` (adapter.ts:842-868) calls the genuine `mb.Conversion.init(opts)` (adapter.ts:848), guards `conversion.isValid` against zero usable output tracks (adapter.ts:849-854), and then performs the real work via `await conversion.execute()` (adapter.ts:855) before reading the produced bytes back out of the BufferTarget (adapter.ts:856-868). This is a true decode→scale→re-encode→remux pipeline, not a copy.

The backend that made the difference is recorded in `env.configUsed`: `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`, `canvasPoolSize:4`, `pixelBackend:"VideoSample.copyTo(RGBA)>canvas"`. mediabunny decodes the VP9 with a hardware `VideoDecoder` and encodes H.264 with a hardware `VideoEncoder` on the Apple M1 Max (per `env.gpu` = ANGLE Metal Renderer), with the `hardwareAcceleration:'prefer-hardware'` flag applied on the encoder (adapter.ts:604 / 657). Because it uses pure-WebCodecs hardware codecs rather than a WASM software encoder, it does NOT require COOP/COEP or SharedArrayBuffer and stays inside the suite budget — encoding 120 s of 720p at **377.75 fps** (encodeFps == framesPerSec in the shard) and finishing the whole 102 MB job in **9530 ms** wall at **174.75 MB** peak memory. The `streaming-lockstep` pipeline with a 4-canvas pool bounds memory so a 102 MB / 120 s clip does not have to be fully materialized in RAM at once.

Correctness: the gate is `ssim-psnr` (`src/core/oracles.ts:1688-1833`). The shard's outcome — `ssimMean 0.9999865`, `ssimMin 0.9999856`, `pairs 12`, `exactFrames 0`, detail "SSIM min 1.0000 ≥ 0.97 (mean 1.0000) over 12 frame(s); PSNR via golden pixels unavailable (digest proxy: 0/12 exact)" — corresponds to the committed-golden branch (oracles.ts:1741-1832): a golden `ssim.json` ships 12 per-frame downsampled-luma signatures (`refSigs`), the candidate's decoded pixels are downsampled to the same signature side (oracles.ts:1782) and scored frame-by-frame with `sigSsim` (oracles.ts:1783), and the gate is on the WORST frame (`minSsim >= t.ssimMin`, oracles.ts:1823) with `t.ssimMin = 0.97` from the scenario tolerances (`src/scenarios/transcode/index.ts:1215`). minSsim 0.99999 clears 0.97 by a wide margin. `exactFrames == 0` is EXPECTED and not a weakness here: a VP9→H.264 lossy re-encode with a 1080p→720p downscale cannot be byte-identical to the golden reference, so the digest-equality PSNR proxy correctly reports 0 exact; SSIM on the structural luma signature is the appropriate correctness measure for a perceptual re-encode and it is essentially 1.0, meaning the downscaled H.264 frames are structurally indistinguishable from the reference.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE, honest. Reason: "large VP9→H.264/AAC 720p re-encode exceeds the browser-wasm suite budget." It declares `transcode`, but its software (single-thread, no SharedArrayBuffer) WASM x264/aac encode of a 120 s 1080p→720p clip would blow the time/memory budget; deferring it is a legitimate capability call, not an under-declaration. (durationMs 173 — exited immediately at the gate, did no work.)
- **platform@chrome-149** — NA_ENGINE, honest and precise. Reason: "MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track." The scenario requires `toAudio:'aac'` (index.ts:1186). The platform encode path (`env.configUsed.encode = "<video>→canvas→MediaRecorder(out)"`) captures only video frames off a canvas and cannot mux the Opus→AAC audio the scenario demands. Correctly NA rather than silently emitting a video-only MP4. (durationMs 24.)
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest. Reason: "large fixture transcodes are not reliable through the in-memory bufferWriter output path." Its `configUsed.writer = "bufferWriter"` accumulates the whole output in memory; for a 102 MB / 120 s job that path is declared unreliable, so it defers. It declares transcode for smaller rungs but gates out this large one — a defensible runtime limitation, not a faked pass. (durationMs 1.)
- **remotion-media-parser@4.0.479** — NA_ENGINE. Reason: "engine does not declare operation 'transcode'." It is a parser/demuxer only; no encode capability. Honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE. Reason: "engine does not declare operation 'transcode'." A demux-only library; cannot re-encode. Honest NA.
- **mp4box@2.3.0** — NA_ENGINE. Reason: "engine does not declare operation 'transcode'." An MP4 box parser/muxer with no codec; cannot re-encode. Honest NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:1178-1191` (SIZE_LADDER_CASES entry, mapped at index.ts:1194-1219). Declares `asset:'large_vp9_1080p_120s.webm'`, from webm/vp9/opus → mp4/h264/aac at 1280x720, `oracles:['ssim-psnr']`, tolerances `{ssimMin:0.97, psnrMinDb:36}` (index.ts:1215), timeoutMs 600000, features include `resize`.
- Fixture existence: `fixtures/media/large_vp9_1080p_120s.webm` exists, 102 MB — a real, large VP9/WebM media file, not synthetic/empty/mock. The size and 120 s duration are consistent with a genuine 1080p VP9 clip.
- Oracle implementation: `src/core/oracles.ts:1688-1833` (`ssimPsnr`). Performs a real per-frame comparison: candidate decoded pixels are downsampled to luma signatures and SSIM-scored against committed golden signatures (oracles.ts:1760-1790), gating on the worst frame ≥ 0.97 (oracles.ts:1823). Not trivially satisfiable: a wrong/mismatched frame scores ~0.84 per the verified note (oracles.ts:1918-1919), well below the 0.97 floor. The shard's measured values (12 pairs, ssimMin 0.99999) are physically plausible for a correct downscale-transcode.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1271-1322` (transcode) → `runConversion` at adapter.ts:842-868. Genuinely calls `mb.Conversion.init` + `conversion.execute()` (real library re-encode), validates `isValid`, and reads the actual produced output buffer. No canned output, no input→output copy (illegal anyway since codecs change), no short-circuit to golden, no swallowed errors (init failure throws, adapter.ts:851).
- Cached note: mediabunny's result has `cached:true` ("cached previous PASS result", startedAtIso 2026-06-22T16:40:23Z vs the other engines' 17:33-17:37 re-run). The PASS evidence was REUSED from a prior run, not re-executed in this run. Per the launcher seeding caveat this carries mild staleness risk, but the cached numbers are internally consistent (encodeFps == framesPerSec, durationMs 31648 ≥ wall 9530 incl. decode/setup) and the adapter/oracle/fixture all check out, so the verdict stands.
- Verdict: **REAL** — real 102 MB VP9 fixture + genuine WebCodecs Conversion re-encode + meaningful SSIM correctness gate (min 0.99999 ≥ 0.97). Sole caveat is the cached reuse (staleness, not fabrication).

## Confidence & caveats

- Confidence: high. Single unambiguous PASS; all six NAs are honest (three never declare transcode; three declare it but legitimately gate out on budget/audio/output-path limits for this large cross-codec job).
- Caveats: (1) mediabunny's result is `cached:true` — the PASS was reused from 2026-06-22T16:40Z, not re-run in this batch; re-run to refresh if absolute timing matters. (2) bench has n=1 (single sample, mad=0, p95==median), so the 377.75 fps / 9530 ms figures are point estimates with no spread evidence. (3) The oracle samples only 12 frames of a 120 s clip; SSIM is structurally strong but is a perceptual proxy (no bit-exact or PSNR-vs-golden-pixels gate is possible for a lossy re-encode), so this is a strong-but-not-bit-exact correctness signal.
