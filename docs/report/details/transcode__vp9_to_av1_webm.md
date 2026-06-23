# transcode/vp9_to_av1_webm

- family: transcode
- fixture asset: `vp9_1080p_10s.webm` (VP9 video + Opus audio, WebM; 9.3 MB, exists in `fixtures/media/`)
- primaryMetric: throughputRealtime (x-realtime)
- passCount: 1 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (engineId `mediabunny`).
- Contested: **NO** — uncontested. mediabunny is the only PASS; the other 6 engines are all NA_ENGINE (none even ran the transcode).
- Decisive factor: mediabunny is the only engine that **declares and implements an AV1 encoder path** for this VP9→AV1 WebM transcode and actually produced a valid AV1/WebM output that survived the SSIM and playback gates. Every competitor either does not declare the `transcode` operation, does not declare the `av1` video codec, has no AV1 encoder in its WebCodecs wrapper, or cannot preserve the source's Opus audio through its capture path.
- Margin over runner-up: not applicable — there is no second PASS to compare against. Absolute result: wall median 2733.67 ms, throughputRealtime 3.66x, encodeFps 109.74 fps, longtasks 3675 ms (n=1).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true, playback-smoke:true | 2733.67 | 3.66 | 0 (not sampled) | 3675 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA — source carries audio and the MediaRecorder canvas-capture path cannot preserve/copy audio |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare video codec 'av1' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | Remotion WebCodecs 4.0.479 exposes no AV1 encoder |

## Why the winner wins (deep technical)

The operation is a full re-encode: decode VP9 (1080p, 10 s) from a Matroska/WebM container, re-encode the video to **AV1**, copy the **Opus** audio through unchanged, and re-mux into WebM. This is the hardest class of transcode in the suite because AV1 software encoding is notoriously slow and AV1 WebCodecs encoders are rarely present — hence the scenario `notes` explicitly say "AV1 encode is SW/slow → NA where no encoder."

mediabunny used the WebCodecs backend with `hwAccel: prefer-hardware` on an Apple M1 Max (env.configUsed: `backend: webcodecs`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false`, `wasmThreads: 0`). The adapter does not blindly hand the codec to mediabunny's Conversion; it first **probes encodability**: `buildVideoOptions` in `src/engines/mediabunny/adapter.ts:626-645` builds an acceleration-mode preference list (for AV1, which is not in `SOFTWARE_PREFERRED_ENCODE`, the order is `[prefer-hardware, no-preference, prefer-software]`) and calls `mb.canEncodeVideo('av1', { bitrate, hardwareAcceleration: mode })` (a wrapper over `VideoEncoder.isConfigSupported`) for each mode, committing the first that returns true (`adapter.ts:638-644`). Only after a config is confirmed encodable does it set `opts.hardwareAcceleration` and proceed — so it never crashes mid-transcode on an unsupported AV1 config. The resolution-aware bitrate (`defaultVideoBitrate`, with AV1 efficiency factor 0.6 at `adapter.ts:520`) avoids the QUALITY_HIGH-preset trap that collapses to a hardware-rejected low bitrate.

The transcode itself is a genuine mediabunny `Conversion`: `transcode()` opens the real input (`openInput`, `adapter.ts:1287`), creates a WebM `Output` with a `BufferTarget` (`adapter.ts:1289`), assembles `ConversionOptions` with the probed video options and a copy-through audio block (`adapter.ts:1290-1305`), then `runConversion` calls `mb.Conversion.init(opts)`, checks `conversion.isValid` (rejecting if no usable output tracks), and `await conversion.execute()` (`adapter.ts:848-855`). Output bytes come from the real `BufferTarget.buffer` (`adapter.ts:827-836`). The measured `encodeFps` of 109.74 and `throughputRealtime` of 3.66x for a 10 s 1080p AV1 encode are only plausible with a hardware AV1 encoder — consistent with the M1 Max media engine being picked by the probe.

The gating oracle is `ssim-psnr` (`src/core/oracles.ts:1688`). Because there is no committed raw-pixel golden, the oracle re-decodes the engine's WebM output with the platform decoder (`ctx.decodeWithPlatform`, `oracles.ts:1718`) and compares it frame-by-frame against the golden luma signatures using downsampled-luma SSIM, gating on the **worst** frame (`minSsim >= t.ssimMin`, `oracles.ts:1823`). The shard reports `pairs: 12`, `ssimMin: 0.99994`, `ssimMean: 0.99994` against the `ssimMin: 0.97` tolerance — i.e. the re-decoded AV1 output is near-perceptually-identical to the reference across all 12 sampled frames. `playback-smoke` additionally confirmed a real `<video>` element played several frames of the output, proving the WebM is structurally valid and browser-playable (not just byte-present).

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest. Reason: "Remotion WebCodecs 4.0.479 exposes no AV1 encoder." It has a real transcode pipeline but its WebCodecs wrapper does not surface an AV1 `VideoEncoder` config, so it cannot produce the target codec. Honest capability gap, not under-declared.
- **platform@chrome-149** — NA_ENGINE, honest but path-limited. Reason: the encode path is `<video>→canvas→MediaRecorder(out)` (env.configUsed), and MediaRecorder canvas-capture cannot carry/copy the source's **Opus audio track**, so the platform engine declines rather than silently dropping audio. A correct, conservative NA.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE, honest. Reason: "engine does not declare video codec 'av1'." The wasm build registered for the suite has no AV1 encoder declared, so the runner gates it out in pre-flight before any work. Plausible: AV1 (libaom/SVT-AV1) is heavy and commonly omitted from wasm builds.
- **mp4box@2.3.0** — NA_ENGINE, honest. Reason: "engine does not declare operation 'transcode'." MP4Box.js is a demux/remux/box tool with no encoder; it cannot transcode at all. Correctly under-declared.
- **web-demuxer@4.0.0** — NA_ENGINE, honest. Reason: "engine does not declare operation 'transcode'." A demux-only library; no encode capability. Correct.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest. Reason: "engine does not declare operation 'transcode'." A parser, not a transcoder. Correct.

## Anti-cheat validation

- Scenario: `src/scenarios/transcode/index.ts:537-547` — `id: 'vp9_to_av1_webm'`, `asset: 'vp9_1080p_10s.webm'`, `fromVideo: 'vp9'` / `fromAudio: 'opus'` → `toVideo: 'av1'`, `toContainer: 'webm'`, `opts.video.codec: 'av1'`, tolerances `{ ssimMin: 0.97, psnrMinDb: 36 }`.
- Fixture: `fixtures/media/vp9_1080p_10s.webm` exists, 9.3 MB — a real VP9/Opus WebM, not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:1688` (`ssimPsnr`). It re-decodes the engine's output via the platform decoder (`oracles.ts:1718`), pairs against golden luma signatures, computes per-frame SSIM, and gates on the worst frame at `oracles.ts:1823`. Not trivially satisfiable: a copied-input or broken AV1 stream would either fail platform decode (clean FAIL, `oracles.ts:1726-1733`) or diverge in SSIM. Measurements (12 pairs, SSIM 0.99994) are physically plausible for a clean 1080p re-encode.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1284-1322` (`transcode`/`runSingle`), real AV1 encodability probe at `adapter.ts:626-645`, genuine `Conversion.init`/`execute` at `adapter.ts:848-855`, real output bytes from `BufferTarget.buffer` at `adapter.ts:827-836`. No canned output, no input→output copy, no golden short-circuit, no swallowed errors (invalid conversions throw at `adapter.ts:849-853`).
- Verdict: **WEAK-GATE**. The implementation, fixture, and oracle are all real and the SSIM comparison is meaningful, but the correctness gate rests on a perceptual SSIM proxy with `exactFrames: 0` (no bit-exact / golden-packets / true-PSNR check) — the detail itself notes "PSNR via golden pixels unavailable (digest proxy: 0/12 exact)." For a lossy AV1 re-encode this is the appropriate oracle (bit-exactness is impossible), but per the ladder it is a perceptual proxy, not a structural/bit-exact gate, so PASS is real but not maximally strong. Combined with `playback-smoke` it is solid evidence of a valid, playable AV1/WebM output.
- Cached note: mediabunny's result has `cached: true` ("cached previous PASS result", startedAt 2026-06-22T16:49:18Z). The PASS evidence was reused, not re-run in this batch — mild staleness risk, but the cached oracle outcomes and bench numbers are internally consistent and physically plausible.

## Confidence & caveats

- Confidence: **high** for the winner selection — only one engine PASSed and the decision is structurally unambiguous (6 honest NAs).
- Confidence on the strength of the PASS: medium — gate is perceptual SSIM (exactFrames 0) plus smoke, not bit-exact; bench is n=1 (mad=0, no spread evidence), so throughput/encodeFps numbers are single-sample.
- peakMemory was not sampled (n=0, median 0), so the memory profile of the AV1 encode is unknown.
- The result is cached; a fresh re-run would strengthen confidence, though nothing in the cached evidence looks fabricated.
