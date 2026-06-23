# transcode/h264_to_hevc_mp4

family: transcode | fixture asset: `h264_1080p_30s.mp4` (31 MB, real H.264/AAC MP4) | primaryMetric: wall (median, ms) | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (PASS).
- Contested: YES. Two engines PASS — mediabunny and remotion-webcodecs@4.0.479 — with identical oracle outcomes (`ssim-psnr` + `playback-smoke`, both true).
- Decisive factor: **performance**. Correctness is a tie (both pass the same two oracles with effectively identical SSIM and the same 0/12 digest-exact proxy), so the contest falls to the primaryMetric (wall) and throughput. mediabunny finished the 30s 1080p H.264→HEVC re-encode in **3461 ms vs 5836 ms** for remotion-webcodecs.
- Margin over runner-up: **1.69x faster wall** (5835.95 / 3461.36), **1.69x higher realtime throughput** (8.667x vs 5.141x), **1.69x higher encodeFps** (260.0 vs 154.2). remotion-webcodecs wins only on peak memory (47.17 MB vs 55.22 MB = mediabunny is 1.17x heavier). Both engines report the identical `longtasks` = 2147 ms, so main-thread blocking is a wash. n=1 on all bench rows (mad=0), so the perf margin is single-sample evidence — but the 1.69x gap is large and consistent across three independent metrics, so the ranking is solid.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true, playback-smoke:true | 3461.36 ms | 8.667x | 55.22 MB | 2147 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true, playback-smoke:true | 5835.95 ms | 5.141x | 47.17 MB | 2147 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode NA: H.264→HEVC/MP4 re-encode exceeds the browser-wasm suite budget |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: source carries audio and the MediaRecorder canvas-capture path cannot preserve/copy audio |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a **cross-codec re-encode**: decode H.264 (AVC, in MP4) → re-encode to **HEVC (H.265)** muxed back into MP4. This is not a remux/copy — the codec changes, so a full decode→encode→mux pipeline is mandatory and the output cannot be bit-identical to any golden (HEVC is a different, lossy codec). The scenario (`src/scenarios/transcode/index.ts:76-86`) sets tolerances `ssimMin: 0.97, psnrMinDb: 36` and uses the default oracle pair `['ssim-psnr','playback-smoke']`.

Both PASS engines run on the **same backend class**: native WebCodecs with hardware-preferred encode on an Apple M1 Max (GPU string `ANGLE Metal Renderer: Apple M1 Max`). The M1 Max ships a hardware HEVC encoder, which is why both engines can encode HEVC at all and why neither needs COOP/COEP or SharedArrayBuffer. mediabunny's `env.configUsed`: `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `coopCoep:"not-required"`, `canvasPoolSize:4`. remotion-webcodecs' `env.configUsed`: `backend:"webcodecs"`, `hwAccel:"prefer-hardware(+software fallback)"`, `pipeline:"streaming-backpressure"`, `writer:"bufferWriter"`.

mediabunny drives the encode through its first-class **Conversion API** — `Conversion.init(opts)` then `conversion.execute()` (`src/engines/mediabunny/adapter.ts:848,855`), wired up in `transcode()` (`src/engines/mediabunny/adapter.ts:1271-1322`). Crucially, the adapter PROBES the encoder config with `canEncodeVideo`/`VideoEncoder.isConfigSupported` before committing (`buildVideoOptions`, documented `adapter.ts:527-546`), so it commits the hardware HEVC path directly without a mid-stream reject/fallback. Its pipeline is `streaming-lockstep` (read→decode→encode→mux run concurrently with a bounded canvas ring buffer `canvasPoolSize:4`), which keeps the GPU encoder fed. The measured result: **encodeFps 260.0**, wall **3461 ms**, throughput **8.667x realtime** for a 30s clip.

remotion-webcodecs drives the same hardware encoder through `@remotion/webcodecs` `convertMedia({...})` (`src/engines/remotion-webcodecs/adapter.ts:615-627`), routed via `transcode()`→`convert()` (`adapter.ts:521,580`). It first does a header-only `parseMedia` probe for duration/fps to pre-size the MP4 moov (`adapter.ts:600-606`) and writes to an in-memory `bufferWriter`. It is a genuine, correct implementation — but its `streaming-backpressure` driver plus `prefer-hardware(+software fallback)` config and the extra probe pass yield **encodeFps 154.2**, wall **5836 ms**, throughput **5.141x**. Same encoder, same machine, ~1.69x slower end to end. Its one win is peak memory (47.17 MB vs 55.22 MB), explained by mediabunny's 4-slot canvas pool holding more RGBA frames resident; that is the cost mediabunny pays for keeping the encoder saturated.

Oracle evidence (identical between the two, from the shard): `ssim-psnr` pass — mediabunny `ssimMin 0.9999980, ssimMean 0.9999996` over 12 pairs; remotion-webcodecs `ssimMin 0.9999919, ssimMean 0.9999989` over 12 pairs. Both report `exactFrames: 0` (the digest proxy can never hit on a lossy HEVC re-encode), so PSNR is reported as "unavailable (digest proxy)" and the gate rests on SSIM ≥ 0.97 of the worst frame (`src/core/oracles.ts:1823,1830`). Both SSIM minimums (0.99999…) sail past 0.97. `playback-smoke` confirms the produced MP4/HEVC actually plays a few frames in a `<video>` element. Since both clear the same gate with near-identical SSIM, correctness is a genuine tie and the 1.69x wall margin is the decider.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** (PASS, lost on perf): correct re-encode via `convertMedia` (`adapter.ts:615`), passed both oracles with SSIM 0.99999, but 1.69x slower wall (5835.95 ms vs 3461.36 ms), 1.69x lower throughput (5.141x vs 8.667x) and 1.69x lower encodeFps (154.2 vs 260.0). Same hardware HEVC encoder; the gap is pipeline/driver overhead (extra probe pass + `streaming-backpressure` vs `streaming-lockstep`). Won only on peak memory (47.17 MB, 0.85x of mediabunny).
- **ffmpeg.wasm@0.12.15** (NA_ENGINE): self-declared NA — "H.264 to HEVC/MP4 re-encode exceeds the browser-wasm suite budget". Honest: a single-threaded wasm libx265 encode of a 30s 1080p clip would take far longer than the suite budget, and the engine is gated out rather than failing a deadline. Not an under-declared capability — it is a deliberate budget gate for a genuinely expensive SW encode.
- **platform@chrome-149** (NA_ENGINE): self-declared NA — the source fixture has an AAC audio track, and the platform engine's only transcode path is `<video>→canvas→MediaRecorder`, which captures video pixels but cannot preserve/copy the audio track. Honest capability limit of the canvas-capture approach (`env.configUsed.encode:"<video>→canvas→MediaRecorder(out)"`), not a missing-encoder claim.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare operation 'transcode'". Honest — MP4Box.js is a box parser/segmenter/remuxer with no video encoder; it cannot re-encode codecs.
- **web-demuxer@4.0.0** (NA_ENGINE): "engine does not declare operation 'transcode'". Honest — it is a demuxer (extracts encoded packets), no encoder.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "engine does not declare operation 'transcode'". Honest — the parser-only sibling of @remotion/webcodecs; parsing/probing only, no encode path (encode lives in the separate webcodecs package, which competed and passed).

## Anti-cheat validation

- Scenario: `src/scenarios/transcode/index.ts:76-86` (id `h264_to_hevc_mp4`), `asset: 'h264_1080p_30s.mp4'`, `fromVideo: 'h264'`, `fromAudio: 'aac'`, `toContainer: 'mp4'`, `toVideo: 'hevc'`, tolerances `ssimMin: 0.97, psnrMinDb: 36`.
- Fixture exists and is real: `fixtures/media/h264_1080p_30s.mp4` = **31 MB** on disk (verified via stat) — a genuine 1080p/30s H.264/AAC MP4, not synthetic/empty/mock.
- Winner adapter genuinely implements the op: mediabunny `transcode()` builds a real `Output` + `ConversionOptions` and runs the library's `Conversion.init()`/`conversion.execute()` (`src/engines/mediabunny/adapter.ts:1271-1322`, `848-855`). No canned bytes, no input→output copy, no short-circuit to a golden, no swallowed errors (invalid conversion throws with discarded-track reasons, `adapter.ts:849-853`). Encoder config is probed before commit, so it is a true hardware HEVC encode.
- Oracle is real: `ssimPsnr` (`src/core/oracles.ts:1688-1832`) re-decodes the engine's MP4/HEVC output with the platform decoder, downsamples luma, and computes per-frame SSIM against the in-browser-decoded reference source (`§5.2` reference path, `oracles.ts:1737-1738`), gating on the WORST frame ≥ 0.97 (`oracles.ts:1823`). It is not trivially satisfiable: a copy-input or garbage output would either fail platform re-decode (`oracles.ts:1720,1726,1732`) or fail the worst-frame SSIM threshold. `playback-smoke` additionally requires the output to play in `<video>`.
- Caveat — the gate is a PERCEPTUAL PROXY, not bit-exact: both engines show `exactFrames: 0` and PSNR "unavailable (digest proxy)". This is correct and unavoidable for a lossy cross-codec HEVC re-encode (digest-exact is physically impossible), but it means the correctness gate sits on the perceptual ladder, not the bit-exact ladder. The SSIM minimums (0.9999980 / 0.9999919) are physically plausible for a high-bitrate HEVC re-encode of a clean source.
- Cached: BOTH PASS results have `cached: true` ("cached previous PASS result"). The verdict and the 1.69x perf margin rest on reused (not freshly re-run) measurements — staleness risk noted. Per the launcher-seeding caveat, a truly fresh run would require clearing the raw cache + .browser-cache.
- Verdict: **REAL** — real 31 MB fixture, real library encode path on both sides, meaningful re-decode + worst-frame SSIM oracle. The only softness is that the gate is a perceptual proxy (necessarily so for lossy HEVC) and the numbers are cached.

## Confidence & caveats

- Confidence: **medium**. The winner is unambiguous on the decision procedure (correctness tie → primaryMetric wall, 1.69x margin confirmed across wall/throughput/encodeFps). Downgraded from high because (a) every bench row is n=1 (mad=0), so the perf margin is single-sample; (b) both PASS rows are `cached:true` (stale-reuse risk); (c) the correctness gate is a perceptual proxy with `exactFrames:0` (legitimate for lossy HEVC, but weaker than a bit-exact gate).
- All NAs look honest: two self-declared engine NAs with concrete technical reasons (wasm budget; audio-preservation limit) and three "operation not declared" NAs for parser/demuxer/remuxer engines that have no video encoder. No under-declared capability detected.
- remotion-webcodecs' lone win (peak memory, 0.85x) does not flip the ranking, since the primaryMetric is wall and the spec ranks throughput/wall above peak memory when correctness ties.
