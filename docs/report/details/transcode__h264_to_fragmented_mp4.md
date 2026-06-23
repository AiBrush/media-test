# transcode/h264_to_fragmented_mp4

family: transcode | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264/AAC clip) | primaryMetric: wall | passCount: 2/7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- **CONTESTED**: 2 engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Both satisfy the identical oracle set (`ssim-psnr` + `property-invariant`) with comparable correctness, so the **decisive factor is performance**.
- Margin over runner-up (ffmpeg.wasm): **~19.5x faster wall** (4274.2 ms vs 83542.5 ms), **~19.5x throughputRealtime** (7.019x vs 0.359x), **~19.5x encodeFps** (210.57 vs 10.77 fps). ffmpeg's longtasks blocking is also higher (1598 ms vs mediabunny's 1012 ms → 0.63x). Correctness is a near-tie: ffmpeg's worst-frame SSIM (0.9750) is marginally above mediabunny's (0.9679), but both clear the 0.96 gate with mean SSIM ~0.993, so this does not overturn the perf result.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | ssim-psnr:true, property-invariant:true | 4274.2 | 7.019 | n/a (n=0) | 1012 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true, property-invariant:true | 83542.5 | 0.359 | n/a (n=0) | 1598 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fragmented' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fragmented' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Note: `peakMemory` and `decodeFps` have n=0 samples for both PASS engines (not measured); they cannot be used as tiebreakers here.

## Why the winner wins (deep technical)

The operation is a full re-encode of a 30 s 1080p30 H.264/AAC clip into a **fragmented MP4 / CMAF** output (`fastStart: 'fragmented'`, scenario `src/scenarios/transcode/index.ts:1259-1268`; the `fragmented` feature and `fastStart` option are injected at `index.ts:1281`). This is a transcode, not a remux — the H.264 video track is decoded and re-encoded — and the container is written with an `empty_moov` + per-keyframe `moof/mdat` fragment layout instead of a single trailing `moov`.

mediabunny ran on `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"` (env.configUsed). On the Apple M1 Max (ANGLE Metal renderer in the env block), `prefer-hardware` routes the H.264 encode to the platform VideoToolbox hardware encoder via WebCodecs, which is why it sustains **encodeFps 210.57** and finishes the 30 s clip in 4.27 s wall (**7.019x realtime**). The adapter path is `src/engines/mediabunny/adapter.ts:1271` (`transcode`) → `runSingle` builds the `Conversion` with `makeOutputFormat`/`outputFormatOptionsFrom` (the `fastStart:'fragmented'` mapping is at `adapter.ts:181-196`) → `runConversion` calls the real library `Conversion.init` / `conversion.execute()` (`adapter.ts:842-855`). The fragmented output shape comes straight from mediabunny's `Output` muxer; the duration is bounded by `convOpts.trim = { start: 0, end: inputDuration }` (`adapter.ts:1305`) so the output duration matches the source within tolerance.

The `property-invariant` oracle (variant `transcode-output-metadata`) confirmed the structural result: `mp4, 2 track(s) match requested output shape`, `videoTracks: 1`, with `durationDeltaSec: 0.08` against a `durationToleranceSec: 0.15` budget — i.e. the fragmented re-encode preserved the muxed track count and duration. The `ssim-psnr` oracle took the no-golden **reference-source path** (`src/core/oracles.ts:1694-1738`): because a lossy re-encode can never reproduce committed golden digests, the oracle decodes the SOURCE in-browser and compares downsampled luma signatures against the candidate output (re-decoded by the platform engine). mediabunny scored SSIM **mean 0.9926, min 0.9679** over 12 frames — comfortably above the scenario's `ssimMin: 0.96` gate (`index.ts:1262`). `exactFrames: 0` is expected and correct for a lossy transcode (digest-exact frames are impossible after re-encode), so the gate correctly rests on the perceptual SSIM measurement rather than digest equality.

ffmpeg.wasm produced a structurally correct fragmented MP4 too — its adapter emits the genuine `-movflags frag_keyframe+empty_moov+default_base_moof` flags for the `fastStart === 'fragmented'` branch (`src/engines/ffmpeg-wasm/adapter.ts:2046-2047`, and again at `2518-2519` for the transcode path) — and passed both oracles (SSIM mean 0.9931, min 0.9750; durationDelta 0.0667). But it runs single-threaded wasm software encode (env.engineId `ffmpeg-wasm`), giving **encodeFps 10.77** and an 83.5 s wall (0.359x realtime — slower than realtime). That is the entire ~19.5x gap.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost on perf): correct fragmented output and both oracles green, but software wasm re-encode is ~19.5x slower on every throughput metric (wall 83542.5 ms vs 4274.2 ms; throughputRealtime 0.359x vs 7.019x; encodeFps 10.77 vs 210.57) and blocks the main thread longer (longtasks 1598 ms vs 1012 ms). Its worst-frame SSIM (0.9750) is slightly better than mediabunny's (0.9679), but with both far above the 0.96 gate, correctness is judged comparable and performance decides.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): "engine does not declare feature 'fragmented'". Honest NA — the scenario requires the `fragmented` feature (`requires.features`), and this engine's capability descriptor does not list it. No fragmented/CMAF muxer is declared.
- **platform@chrome-149** (NA_ENGINE): same honest NA — "does not declare feature 'fragmented'". The bare platform/WebCodecs adapter has no fMP4 muxer that advertises the `fragmented` feature.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare operation 'transcode'". Honest — mp4box is a (de)muxer/box parser, not an encoder; it cannot re-encode H.264.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "does not declare operation 'transcode'". Honest — it is a parser, not an encoder.
- **web-demuxer@4.0.0** (NA_ENGINE): "does not declare operation 'transcode'". Honest — demux-only library, no encode path.

All five NA_ENGINE outcomes look honest: the two parsers/demuxers (mp4box, remotion-media-parser, web-demuxer) genuinely have no transcode capability, and the two encode-capable engines (remotion-webcodecs, platform) simply do not declare the specific `fragmented`/CMAF muxing feature this scenario gates on.

## Anti-cheat validation

- **Scenario**: `src/scenarios/transcode/index.ts:1259-1268` (case), wired into `defineScenario` at `index.ts:1274-1295`. op `transcode`, input `h264_1080p_30s.mp4`, `fastStart:'fragmented'`, oracles `['ssim-psnr','property-invariant']` (`index.ts:1272`). The notes explain why playback-smoke is intentionally NOT used (MSE-style fragments aren't reliably playable as a standalone `<video>` src), so the SSIM-on-re-decoded-bytes + metadata gate is the deliberate substitute — a reasonable, documented gating choice.
- **Fixture**: `fixtures/media/h264_1080p_30s.mp4` exists and is a real 31 MB media file (verified via stat). Not synthetic/empty/mock.
- **Oracle**: `ssim-psnr` at `src/core/oracles.ts:1686-1830` performs a real comparison — no-golden reference path (`1694-1738`) decodes the actual source in-browser and SSIMs downsampled luma signatures against the candidate (`downsampleLuma`/`sigSsim`, `1782-1786`); gate is on the WORST frame (`minSsim >= t.ssimMin`, `1823`). `exactFrames: 0` is physically correct for a lossy re-encode and the gate correctly does not require digest equality. `property-invariant` (`transcode-output-metadata`) checks output container/track-count/duration. Measurements are plausible for real 1080p30 media (12 paired frames, SSIM ~0.99, durationDelta 0.07-0.08 s within a 0.15 s budget).
- **Winner adapter**: `src/engines/mediabunny/adapter.ts:1271` (`transcode`) → `runConversion` → real `Conversion.init`/`conversion.execute()` (`842-855`); fragmented mapping at `181-196`. Genuine library invocation — no canned output, no input→output copy, no short-circuit to golden, no swallowed errors (it `throw`s on invalid dims/missing tracks/unencodable codecs).
- **Verdict: REAL.** Real fixture + real WebCodecs-backed library transcode + a meaningful perceptual+structural gate. One caveat (below) keeps confidence at medium rather than high.
- **Cached note**: BOTH PASS results have `cached: true` ("cached previous PASS result"). The winning numbers were reused from a prior run, not re-executed in this run — staleness risk applies to both engines symmetrically, so the ~19.5x relative ranking is robust even if absolute timings drifted.

## Confidence & caveats

- Confidence: **medium**. The winner is unambiguous on performance (19.5x across three independent throughput metrics, all from real cached PASS runs), the implementations are genuine, and the fixture/oracles are real.
- Caveats: (1) Both PASS results are `cached:true` — absolute wall/fps not re-measured this run, though the large margin makes the ranking insensitive to drift. (2) All bench metrics have **n=1** (single sample, mad=0, p95==median), so timing variance is uncharacterized; the ~19.5x gap is far too large to be noise, but a single-sample win is weaker statistical evidence. (3) `peakMemory` and `decodeFps` are n=0 (unmeasured) and could not serve as tiebreakers. (4) SSIM uses a digest/luma-signature proxy, not true RGB PSNR (no golden pixels are committed) — a documented limitation, not a defect; both engines clear the 0.96 SSIM gate with margin.
