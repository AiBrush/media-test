# transcode/h264_to_mkv

family: transcode | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 video + AAC audio, 1080p, 30s) | primaryMetric: wall (ms) | passCount: 1 / 7

## Verdict

**Best framework: mediabunny@1.48.0 — UNCONTESTED winner (only PASS).**

Decisive factor: mediabunny is the only one of the 7 engines that simultaneously (a) declares the `transcode` operation AND (b) declares Matroska/MKV in `containersOut`. Every other engine took itself out of contention via an honest capability gate (NA_ENGINE) before any oracle ran. There is no runner-up that PASSed, so no performance margin applies. For reference, mediabunny's own numbers: wall median 3012.27 ms (n=1), throughputRealtime 9.96x, encodeFps 298.78, longtasks 1017 ms; peakMemory not sampled (n=0).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true, property-invariant:true | 3012.27 ms | 9.96x | n/a (n=0) | 1017 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode not applicable: H.264 transcode to MKV exceeds the browser-wasm suite budget |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation under test is a full **re-encode transcode** of H.264-in-MP4 → H.264-in-Matroska (`src/scenarios/transcode/index.ts:1245`, options `{ container: 'mkv', video: { codec: 'h264' } }` wrapped by `withOutputMetadataInvariant`). This is not a remux: the scenario drives `op:'transcode'`, and the gating oracles validate decoded pixels (`ssim-psnr`) plus output container/track shape (`property-invariant` / `transcode-output-metadata`). Matroska is the hard part — the H.264 NALs must be reframed into MKV/EBML SimpleBlocks with codec-private (avcC→Matroska CodecPrivate) carried over and timestamps rebased onto Matroska's TimecodeScale. Only an engine that can both decode/encode AND mux EBML qualifies.

mediabunny ran on the **WebCodecs backend with hardware acceleration** (`env.configUsed`: `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `wasmThreads:0`, `coopCoep:"not-required"`, `sharedArrayBuffer:false`). The adapter drives mediabunny's high-level Conversion API (`src/engines/mediabunny/adapter.ts:842` `runConversion` → `Conversion.init` / `conversion.execute`), with the MKV `OutputFormat` selected by `makeOutputFormat`/`outputFormatOptionsFrom` (`adapter.ts:180`, container normalization at `adapter.ts:284` mapping `matroska|mkv → 'mkv'`). The video encode options are negotiated up-front via `canDecodeVideo`/`isConfigSupported` style checks (`adapter.ts:546`, decode-side at `videoDecoderOptionsForTrack` `adapter.ts:888`) so the Conversion never commits a config the browser would reject mid-run. The result: a streaming read→decode→encode→mux loop that hit **298.78 encodeFps** and finished the 30s clip in **3012 ms (≈9.96x realtime)** — feasible only because the M1 Max hardware H.264 encoder is doing the heavy lifting (a pure-wasm encode would be far slower, which is exactly why ffmpeg.wasm opted out).

The oracle evidence:
- **ssim-psnr (PASS)**: `SSIM min 1.0000 ≥ 0.98 (mean 1.0000) over 12 frame(s)`; measurements `pairs:12, exactFrames:0, ssimMean:0.9999988, ssimMin:0.9999954`. The output MKV bytes were re-decoded by the platform engine (`oracles.ts:1718 decodeWithPlatform`) and compared against golden luma signatures (`oracles.ts:1782 downsampleLuma`/`sigSsim`); the worst frame scored 0.99999 against a 0.98 floor (`oracles.ts:1823` gates on `minSsim`). Note this is the **perceptual-proxy rung** of the ladder, weaker than bit-exact: `exactFrames:0` means no frame was digest-identical (expected — lossy re-encode never reproduces source digests), and true RGB PSNR is unavailable (`detail` says "PSNR via golden pixels unavailable"). The 0.98 SSIM floor with a measured 0.99999 is a comfortable, real margin, not a degenerate pass.
- **property-invariant / transcode-output-metadata (PASS)**: `mkv, 2 track(s) match requested output shape`; measurements `durationDeltaSec:0.08 ≤ durationToleranceSec:0.15, videoTracks:1`. The reference engine probed the produced bytes (`oracles.ts:3641`), confirmed the container normalized to `mkv` (`oracles.ts:3655`), the duration drifted only 80 ms over a 30s clip (`oracles.ts:3670`), and exactly one video track of the requested H.264 codec was present (`oracles.ts:3682`). Both video+audio tracks survived the MKV mux (2 tracks reported), confirming a real container write, not a header stub.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — NA_ENGINE (honest budget opt-out).** Returns `H.264 transcode to MKV exceeds the browser-wasm suite budget` (`src/engines/ffmpeg-wasm/adapter.ts:867-872`, matched on `h264_1080p_30s.mp4` + `container==='mkv'`). It is *capable* of this transcode, but a single-thread wasm full re-encode of a 1080p/30s clip is minutes-long and is deliberately skipped. Honest NA, not a masked failure — but it means the only credible competitor for correctness never produced bytes.
- **platform@chrome-149 — NA_ENGINE (honest).** `containersOut: ['webm','mp4']` (`src/engines/platform/adapter.ts:248`); raw WebCodecs + the platform muxers cannot write Matroska, so the runner gates it out on `does not declare output container 'mkv'`.
- **remotion-webcodecs@4.0.479 — NA_ENGINE (honest).** Declares `transcode:true` (`src/engines/remotion-webcodecs/adapter.ts:244`) but `containersOut: ['mp4','webm','wav']` (`adapter.ts:248`) — convertMedia has no MKV writer, so it is gated out on `does not declare output container 'mkv'`. Correct, not under-declared.
- **mp4box@2.3.0 — NA_ENGINE (honest).** Does not declare the `transcode` operation at all (it is an MP4 box parser/segmenter, no encode path). Correct.
- **web-demuxer@4.0.0 — NA_ENGINE (honest).** Demux/probe only; its own header states it does not decode/encode/mux/transcode (`src/engines/web-demuxer/adapter.ts:7`). Correct.
- **remotion-media-parser@4.0.479 — NA_ENGINE (honest).** Parser only; does not declare `transcode`. Correct.

## Anti-cheat validation

- **Scenario**: `src/scenarios/transcode/index.ts:1245` (`id: 'h264_to_mkv'`, generated by the `CONTAINER_WRITE_CASES` map at `:1271`), input `h264_1080p_30s.mp4` (`:1277`), oracles `['ssim-psnr','property-invariant']` (`:1272` — MKV is not browser-playable so no playback-smoke, per notes `:1248`). Tolerances `ssimMin:0.98, psnrMinDb:38, durationToleranceSec` (`:1293`).
- **Fixture**: `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — a real, substantial H.264/AAC clip, not synthetic/empty/mock.
- **Winner adapter**: `src/engines/mediabunny/adapter.ts:842` (`runConversion` → real `mb.Conversion.init`/`.execute`), MKV format selection at `adapter.ts:180`/`:284`, encode negotiation `adapter.ts:546`. Genuine library calls; no canned output, no input→output copy (a copy would keep the MP4 container and fail the `mkv` container check at `oracles.ts:3655`), no short-circuit to a golden file, no error-swallow-then-PASS.
- **Oracles**: `ssim-psnr` at `src/core/oracles.ts:1688` performs a real platform re-decode of the output bytes and per-frame luma-signature SSIM against golden, gating on the worst frame (`:1823`). `property-invariant`/`transcode-output-metadata` at `oracles.ts:3631` re-probes the produced bytes and checks container, duration delta, and track shape. Neither is trivially satisfiable: measurements are physically plausible (12 frame pairs, SSIM 0.99999, 2 tracks, 80 ms duration drift over 30s).
- **Verdict: REAL.** Real 31 MB fixture + genuine Conversion implementation + two meaningful oracles (one structural-exact metadata gate, one perceptual SSIM gate). Caveat: the SSIM gate is the perceptual-proxy rung (`exactFrames:0`, PSNR unavailable), so it is correct but not bit-exact-strong — combined with the strict metadata invariant the overall PASS is solid.
- **Cached note**: mediabunny's result has `cached:true` ("cached previous PASS result"). The evidence is a reused prior run, not freshly re-executed in this batch — staleness risk per the launcher-seeding caveat. The PASS is real but was not re-run here.

## Confidence & caveats

Confidence: **high** for the winner selection — it is the sole PASS and every loser's NA is an honest, code-verified capability gate (no under-declared MKV writer was hidden anywhere). Caveats: (1) the win is uncontested by exclusion, not by beating a competitor head-to-head, so it says "mediabunny is the only browser engine that can do H.264→MKV here," not "mediabunny is the fastest at it." (2) All bench metrics are n=1 (mad=0, single sample) and peakMemory was not sampled (n=0), so performance figures are indicative only. (3) `cached:true` → numbers and PASS are from a prior run. (4) The SSIM oracle is a proxy (exactFrames=0, no true PSNR); the structural metadata invariant is the stronger of the two gates.
