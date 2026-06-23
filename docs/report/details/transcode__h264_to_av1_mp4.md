# transcode/h264_to_av1_mp4

family: transcode | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, exists) | primaryMetric: wall (ms) | passCount: 1 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** — UNCONTESTED (sole PASS).
- Decisive factor: it is the ONLY engine that actually owns an AV1 *encoder* path in this runtime. Every other engine is NA — either it never declares the `transcode` operation at all, or it declares transcode but has no configurable AV1 encoder (ffmpeg.wasm core build, remotion-webcodecs), or its encode path structurally cannot carry the source's AAC audio (platform/MediaRecorder).
- Margin over runner-up: N/A — there is no runner-up; the other 6 engines produced zero oracle evidence (all NA, empty `oracleOutcomes`).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true, playback-smoke:true | 12220.04 ms | 2.455 x-rt | 50,737,585 B (~48.4 MB) | 2147 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: source carries audio and the MediaRecorder canvas-capture path cannot preserve/copy audio |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare video codec 'av1' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | Remotion WebCodecs 4.0.479 exposes no AV1 encoder |

Supplementary bench (mediabunny only): encodeFps median 73.65 fps; decodeFps n=0 (not sampled); all metrics n=1 (single sample, mad=0, no spread evidence).

## Why the winner wins (deep technical)

The operation is a full transcode: H.264 (AVC) video in an MP4 (faststart) container, with an AAC audio track, re-encoded to AV1 video while staying in MP4. This is the hardest transcode row in the family — AV1 software encode is slow and AV1 hardware encoders are rare — and the scenario `notes` explicitly anticipate "expect NA where no AV1 encoder is configurable" (`src/scenarios/transcode/index.ts:113-123`).

mediabunny ran on the WebCodecs backend with `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false`, `wasmThreads: 0` (env.configUsed). Mechanistically it drives mediabunny's `Conversion` API: `transcode()` opens the input, builds `ConversionVideoOptions` for AV1, then runs read→decode→encode→mux to a `BufferTarget` (`src/engines/mediabunny/adapter.ts:1271-1322`, `runConversion` at `:841-868`). The AV1 encode config is not blindly committed — `buildVideoOptions` probes real encodability with `mb.canEncodeVideo(codec, {width,height,bitrate,hardwareAcceleration})` (a WebCodecs `VideoEncoder.isConfigSupported` wrapper) across modes `[prefer-hardware, no-preference, prefer-software]` and only proceeds with the first mode the browser confirms (`src/engines/mediabunny/adapter.ts:616-658`). That is exactly why mediabunny succeeds where the others are NA: on the Apple M1 Max / Chrome 149 host its WebCodecs probe found a usable AV1 encoder, so the encode is a genuine VideoEncoder pipeline, not a fake copy.

The result throughput tells the same story: wall median 12,220 ms to transcode a 30 s clip = throughputRealtime 2.455x (encodeFps 73.65). A pure-copy/remux would be far faster and a software libaom AV1 encode of 1080p30 would typically be sub-realtime — 2.45x realtime is consistent with a hardware/accelerated AV1 encoder doing real work on 1080p frames. peakMemory ~48 MB and longtasks 2147 ms (single-threaded main-thread conversion, no SAB) are likewise plausible for an in-browser 1080p re-encode.

Oracle evidence: `ssim-psnr` passed with ssimMin 0.99994 and ssimMean 0.99994 over 12 frame pairs (`measurements: pairs=12, exactFrames=0, ssimMean=0.9999414, ssimMin=0.9999401`), versus the scenario tolerance `ssimMin: 0.97`. Because there is no committed golden for this transcode row, the oracle validated against the in-browser-decoded SOURCE reference (`src/core/oracles.ts:1694-1738`) using downsampled-luma-signature SSIM (`:1773-1786`). `exactFrames=0` is expected and correct here: AV1 is a different, lossy codec so decoded RGBA digests will never bit-match the H.264 source, hence the PSNR-via-digest proxy reports 0 exact and the gate rests on SSIM (`:1799-1810`). `playback-smoke` separately confirmed a real `<video>` element played frames of the AV1/MP4 output (`src/core/oracles.ts:1574-1580`), proving the muxed MP4 is a decodable, playable file — not garbage bytes.

## What each other framework did wrong

- **platform@chrome-149** — NA_ENGINE (honest). Its transcode path is `<video>→canvas→MediaRecorder(out)` (env.configUsed.encode). MediaRecorder canvas-capture re-records only the visual stream; the source MP4 has an AAC audio track that this path cannot preserve or copy, so the engine correctly declines rather than silently dropping audio. Honest capability limit, not under-declaration.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE (honest). "engine does not declare video codec 'av1'." Confirmed in `src/engines/ffmpeg-wasm/codecs.ts:10,31`: the published 0.12.15 core build ships no libaom/dav1d AV1 ENCODER, so `av1` is deliberately omitted from the encode-side `videoCodecs` token (it remains demux/decode-capable via `videoCodecsIn`). Correctly NA for an AV1 *encode* target.
- **mp4box@2.3.0** — NA_ENGINE (honest). "engine does not declare operation 'transcode'." mp4box is an ISOBMFF box parser/remuxer with no codec encoder; it cannot re-encode H.264→AV1. Honest.
- **remotion-media-parser@4.0.479** — NA_ENGINE (honest). "engine does not declare operation 'transcode'." It is a read-only media parser, no encode path. Honest.
- **web-demuxer@4.0.0** — NA_ENGINE (honest). "engine does not declare operation 'transcode'." Demux-only (ffmpeg-wasm demuxer wrapper), no encoder. Honest.
- **remotion-webcodecs@4.0.479** — NA_ENGINE (honest). "Remotion WebCodecs 4.0.479 exposes no AV1 encoder." It does declare transcode for other codecs but has no AV1 encoder wired in this version, so it correctly declines the AV1 target rather than failing mid-run. Honest capability gate.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:113-123` — id `h264_to_av1_mp4`, asset `h264_1080p_30s.mp4`, from mp4/h264/aac → mp4/av1, tolerances `{ssimMin:0.97, psnrMinDb:36}`, notes warn AV1 encode is slow/SW and NA expected where no encoder is configurable.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB real H.264 1080p/30s media (stat confirmed). Real input, not synthetic/empty/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1271-1322` (`transcode`), `:542-658` (`buildVideoOptions` with `canEncodeVideo` isConfigSupported probe), `:841-868` (`runConversion` → real `Conversion.init/.execute` → BufferTarget). Genuine decode→encode→mux; no canned output, no input→output copy, no golden short-circuit, errors thrown not swallowed (e.g. throws on invalid dims `:1280`, on missing track `:1295`).
- Oracle: `src/core/oracles.ts:1688` (`ssimPsnr`) performs real per-frame downsampled-luma SSIM against the in-browser-decoded source reference (`:1737-1738`, `:1773-1786`); `:1574` (`playbackSmoke`) actually plays the output in a `<video>`. Measurements physically plausible: 12 frame pairs, ssimMin 0.99994 (well above 0.97), exactFrames=0 (expected for cross-codec lossy AV1).
- Verdict: **WEAK-GATE**. The PASS is real (real fixture, real WebCodecs AV1 encode, plausible 12.2s/2.45x-realtime numbers, playable output), but the correctness gate is a perceptual proxy, not a strong correctness oracle: ssim-psnr ran with `exactFrames==0`, no committed golden, no true RGB PSNR (digest-proxy only), and SSIM is computed on downsampled luma signatures of just 12 frames vs the decoded source. It proves "visually equivalent and playable," not bit-exact or golden-matched. Combined with `playback-smoke` (smoke only), the evidence is genuine but on the weaker rung of the correctness ladder.
- Cached note: mediabunny's result has `cached==true` ("cached previous PASS result", startedAt 2026-06-22T16:46:49Z). It was REUSED, not re-run in this batch — staleness risk: the numbers and PASS reflect a prior run, not a fresh execution. Per the launcher seeding caveat this is the expected stale-PASS-reuse behavior.

## Confidence & caveats

- Confidence: HIGH on the decision (1 PASS vs 6 honest NAs; nothing to contest). MEDIUM on the strength of the win.
- All bench metrics are n=1 (mad=0, p95==median): single-sample, no variance evidence — performance numbers are indicative, not statistically robust.
- The winner is cached, so PASS is historical, not freshly reproduced this run.
- The gate is a perceptual/smoke proxy (WEAK-GATE), so "best" here means "the only engine that can do AV1 encode and produced a playable, perceptually-faithful MP4," not "verified bit-exact."
