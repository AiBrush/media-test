# performance/decode-fps

family: performance · fixture asset: `h264_1080p_30s.mp4` (31 MB, H.264 High @ 1920×1080, 30 fps, MP4/faststart) · primaryMetric: `decodeFps` · passCount: 3 / 7

Scenario: decode the first `maxFrames=12` frames (in presentation order) of the big-read H.264 fixture, rank by `decodeFps`, gate HARD with the bit-exact decoded-frames oracle (`decoded-frames-bitexact`) against baked RGBA golden digests (`src/scenarios/performance/decode-encode-seek.ts:46-60`).

## Verdict

- **Best framework: `web-demuxer@4.0.0`** — CONTESTED win (3 engines PASS the identical strongest-tier oracle).
- **Decisive factor: PERFORMANCE.** All three PASS engines satisfy `decoded-frames-bitexact` identically (12/12 frames bit-exact, 0 mismatches), so correctness strength is tied. The win is on the primary metric `decodeFps` (higher better).
- **Margin over runner-up:** web-demuxer `34.641 fps` vs mediabunny `34.077 fps` = **1.017× faster** decode (wall `346.41 ms` vs `352.14 ms`, **1.017× lower wall**). Over the third PASS engine (platform) the margin is **1.249× faster** (`34.641` vs `27.733 fps`; wall `346.41 ms` vs `432.70 ms`). The web-demuxer/mediabunny gap is **within noise**: `n==1`, `mad==0`, `p95==median` for every metric (single un-replicated sample), so this is a weak-evidence statistical dead heat between the top two; the platform gap (~25%) is the only margin large enough to be meaningful at n=1.

## Per-engine results

| engine | status | oracles passed (name:pass) | decodeFps (median) | wall median | framesPerSec | reason |
|---|---|---|---|---|---|---|
| web-demuxer@4.0.0 | PASS | decoded-frames-bitexact:true | **34.641 fps** | **346.41 ms** | 34.641 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | decoded-frames-bitexact:true | 34.077 fps | 352.14 ms | 34.077 | cached previous PASS result |
| platform@chrome-149 | PASS | decoded-frames-bitexact:true | 27.733 fps | 432.70 ms | 27.733 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | decoded-frames-bitexact:true | 6.182 fps | 1941.18 ms | 6.182 | cached previous PASS result (slowest PASS) |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | engine does not declare operation 'decodeFrames' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | engine does not declare feature 'decode:golden-rgba' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | engine does not declare operation 'decodeFrames' |

(No `throughputRealtime`, `peakMemory`, or `longtasks` metrics are present in this shard — the scenario only requests `decodeFps`, `framesPerSec`, `wall`.)

Note: four engines PASS (web-demuxer, mediabunny, platform, remotion-webcodecs). remotion-webcodecs is bit-exact but ~5.6× slower than the winner (6.18 fps) and is never in contention for the perf-ranked win.

## Why the winner wins (deep technical)

The operation is `decodeFrames` on real **H.264 High-profile, 1920×1080, 30 fps in a faststart MP4** — i.e. a B-frame-reordered AVC bitstream that must be parsed, fed to a hardware decoder, and rasterized to tight straight-alpha RGBA so its sha256 matches the platform-baked golden.

All four PASS engines route pixel decode through the **same browser WebCodecs `VideoDecoder` with hardware acceleration** (`env.configUsed.backend == "webcodecs"`, `hwAccel` true/prefer-hardware on the Apple M1 Max / ANGLE Metal GPU). So the raw H.264 NAL decode work is identical hardware; the differentiator is the *demux + chunk-feeding + rasterize* glue around the decoder, not the codec itself. That is exactly why the three fast engines cluster at 27–35 fps and why correctness is a tie.

web-demuxer's edge comes from its adapter path in `src/engines/web-demuxer/adapter.ts:848-947` (`decodeFrames`):
- It obtains the `VideoDecoderConfig` (including the AVCC `description`/extradata) directly from the **native FFmpeg-WASM demuxer** (`d.getDecoderConfig('video')`, line 853) and gates on `VideoDecoder.isConfigSupported()` (line 855) — no JS-side box parsing of the sample table on the hot path.
- It does a **pipelined streaming read**: `d.read('video').getReader()` (line 887) yields ready-made `EncodedVideoChunk`s straight from wasm, fed to `decoder.decode()` in a tight loop (line 894) with a bounded `submitCap = maxFrames + 16` (line 863) so it stops submitting after a small reorder window instead of demuxing the whole 30 s / 31 MB file. For a 12-frame window this means it touches only the first GOP-and-a-bit of packets — minimal demux work, minimal decoder queue.
- It correctly handles **B-frame reorder** by buffering the reorder window and sorting by `ptsUs` before slicing the lowest-`maxFrames` (lines 926-927), so presentation-order frame 0..11 are the ones digested — matching the golden's pts ladder (0, 33333, 66667, … 366667 µs).
- Rasterization + digest use `imageDataFromVideoFrame` then `digestImageData` (lines 933-934) from `src/engines/web-demuxer/digest.ts:65-73`, which is **byte-for-byte identical** to the platform/golden normalization (tight RGBA, top-left, straight alpha, sha256). That is why its 12 digests equal the golden exactly.

The measured win is `34.641 fps` (wall `346.41 ms` for 12 frames). The native wasm demuxer producing decoder-ready chunks shaves the per-chunk JS overhead that mediabunny's pure-TS demux (`coreBuild: "pure-ts-esm"`, `pipeline: "streaming-lockstep"`) incurs — though here the difference is only `~5.7 ms` total (1.017×), inside single-sample noise. Against the platform engine (`<video>`-adjacent `VideoDecoder` path, `pipeline: "streaming"`, `pixelBackend: "webgpu>webgl>offscreen2d"`) web-demuxer is a clear `1.249×` faster: the platform path's heavier pixel backend negotiation and queueDepth=2 lockstep cost ~86 ms more wall for the same 12 frames.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, bit-exact (12/12, 0 mismatch), but lost the perf rank: `34.077 fps` vs `34.641` = `0.98×` (5.73 ms slower wall). Its pure-TS ESM demux + `streaming-lockstep` pipeline (`canvasPoolSize:4`, no SAB, COOP/COEP not required) is marginally slower feeding chunks than web-demuxer's native-wasm chunk producer. Gap is within n=1 noise — a near tie, not a real defect.
- **platform@chrome-149** — PASS, bit-exact (12/12, 0 mismatch), but `27.733 fps` = `0.80×` of the winner (86.29 ms slower wall). The browser-baseline path's `webgpu>webgl>offscreen2d` pixel backend negotiation and `queueDepth:2` streaming add real overhead vs the lean wasm-fed loop. This is also the *golden source* engine (it baked `frames.json`), which is why its digests trivially match — correct but slowest of the top three.
- **remotion-webcodecs@4.0.479** — PASS, bit-exact (12/12, 0 mismatch), but dramatically slow at `6.182 fps` (wall `1941.18 ms`, `0.18×` the winner = 5.6× slower). Its `streaming-backpressure` path with `waitForQueueToBeLessThan` queue throttling and an `offscreencanvas-2d` rasterize, plus `convert=main-thread`, serializes decode far more than necessary for a 12-frame prefix. Correct, but never competitive on the perf metric.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". **Honest NA** — remotion media-parser is a demuxer/metadata parser, it has no pixel-decode path, so it correctly does not declare the op. No under-declaration.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'decode:golden-rgba'". **Honest NA** — ffmpeg.wasm can decode H.264 but cannot normalize output to the *browser/WebCodecs RGBA* convention the golden was baked under (the scenario notes call this out explicitly, `decode-encode-seek.ts:58-59`). Declining the `decode:golden-rgba` feature is the correct, non-cheating choice rather than emitting digests that would never match.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". **Honest NA** — mp4box is an MP4 box parser / fragmenter; it produces samples but does no pixel decode, so it correctly omits the op.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/decode-encode-seek.ts:46-60` (`decodeFps` perfCase, `op: 'decodeFrames'`, `input: BIG_READ_GOLDEN`, `options: { maxFrames: 12 }`, oracle `decoded-frames-bitexact`, primary `decodeFps`). `BIG_READ_GOLDEN = 'h264_1080p_30s.mp4'` (`src/scenarios/performance/_shared.ts:71`).
- **Fixture exists and is real:** `fixtures/media/h264_1080p_30s.mp4` is present, **31 MB** — a genuine 30 s 1080p H.264 asset, not synthetic/empty/mock.
- **Golden is real (NOT pending):** `fixtures/golden/h264_1080p_30s.mp4.frames.json` has `"pending": false` with **12 real sha256 RGBA digests** (1920×1080), `bakedBy` the platform engine in Chrome 149, `bakedAtIso 2026-06-18`. NOTE: the scenario *comment* (`decode-encode-seek.ts:9-12`) still says the golden is a `pending` placeholder — that comment is **stale**; the golden was baked on 2026-06-18 and the oracle now gates hard. The `$todo` string in the JSON is likewise stale (the `"pending"` flag below it is `false`).
- **Oracle is a real, strong comparison:** `src/core/oracles.ts:1056-1127` (`decodedFramesBitexact`) → `compareDigests` (`:1166-1205`). It pairs each golden frame to the engine's decoded frame by index (pts fallback) and compares **full sha256 hex**; any mismatch or missing frame FAILs. This is the strongest tier (bit-exact crypto digest), not a loose tolerance, not SSIM, not smoke. `goldenFramesForDecodeCompare` (`:1129-1134`) slices golden to `maxFrames=12`, matching the shard's `comparedFrames:12`.
- **Winner implementation is genuine:** `src/engines/web-demuxer/adapter.ts:848-947` performs a real WebCodecs `VideoDecoder` decode of chunks produced by the native FFmpeg-WASM demuxer, with `isConfigSupported` gating, B-frame-reorder handling, and shared-normalization rasterize+digest (`src/engines/web-demuxer/digest.ts:65-73`, byte-identical to platform/golden). No canned output, no input→output copy, no short-circuit to the golden file, no error-swallowing-as-success (`error:` callback rethrows when 0 frames, line 921).
- **Plausibility:** measurements are physically sane — 12 measured = 12 golden = 12 compared, 0 mismatched; 1920×1080 frames; decodeFps 27–35 for hardware WebCodecs on M1 Max is realistic; three independent engines reproducing the **identical** golden sha256 set is itself strong proof of real pixel decode (a fake path cannot guess a 1080p RGBA sha256).
- **Cached note:** the winner's result is `cached==true` ("cached previous PASS result"), as are all four PASS rows. The PASS itself is real (bit-exact against committed golden), but the `decodeFps` ranking margins (especially the 1.017× over mediabunny) were **reused, not freshly re-run**, and `n==1`/`mad==0` — staleness + single-sample risk applies to the *ordering* of the top two, though not to the correctness verdict.

**Verdict: REAL.** Real 31 MB H.264 fixture, real committed RGBA golden (not pending), genuine WebCodecs decode in the winner's adapter, and a strict bit-exact crypto-digest oracle that three engines independently satisfy. The only caveat is evidentiary strength of the perf *ranking*, not legitimacy.

## Confidence & caveats

- **Correctness verdict: high confidence** — bit-exact sha256 against a real baked golden, reproduced identically by three engines.
- **Perf-ranking confidence: low-medium** — every metric is `n==1`, `mad==0`, `p95==median`, and all rows are `cached`. The web-demuxer→mediabunny gap (1.017×, 5.7 ms) is inside single-sample noise; the two are effectively tied and a re-run could flip them. The web-demuxer→platform gap (1.249×) is large enough to trust.
- **Stale documentation caveat:** the scenario comment and golden `$todo` both still describe the golden as "pending" though it is baked and gating — cosmetic, does not affect the result.
- A fresh, replicated (n≥5) re-run is recommended before treating web-demuxer as a definitive winner over mediabunny on this case.
