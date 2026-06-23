# decode-seek/decode_size_huge_h264_600s

**Family:** decode-seek | **Fixture asset:** `fixtures/media/huge_h264_1080p_600s.mov` (real, ~448 MB on disk) | **Primary metric:** decodeFps | **Pass count:** 3 / 7

This is the top of the decode-size ladder: a ~448 MB, 600-second, 1080p **H.264 elementary video in a QuickTime/MOV container**. The op is `decodeFrames` with `maxFrames: 60`; the single gating oracle is `ssim-psnr` over the leading frames (digest-equality → SSIM=1 / PSNR=∞ for identical frames). The engineering stress here is **lazy/partial reads and peak memory under a multi-hundred-MB input**: an engine must reach the leading frames without buffering the whole file.

## Verdict

**Best framework: `web-demuxer@4.0.0` — CONTESTED win (3 of 7 PASS, all correctness-tied).**

All three passing engines (web-demuxer, mediabunny, platform) satisfy the same and only oracle identically: `ssim-psnr` with `pairs=12, exactFrames=12, ssimMean=1, ssimMin=1` — every paired leading frame is byte-for-byte digest-identical to golden (SSIM=1, PSNR=∞). Correctness is therefore a perfect tie, so the decision falls to **performance on the primary metric, decodeFps**.

**Decisive factor: throughput on the primary metric.** web-demuxer decodes at **42.21 fps** vs mediabunny **35.40 fps** and platform **27.40 fps**.
- Margin over runner-up (mediabunny): **1.19x faster decodeFps** (42.21 / 35.40), and **1.19x lower wall** (1421.5 ms vs 1694.9 ms).
- Margin over platform: **1.54x faster decodeFps** (42.21 / 27.40), **1.54x lower wall** (1421.5 vs 2189.4 ms).

**Caveat that tempers the win:** web-demuxer's `longtasks` median is **4924 ms** — ~4.0x worse than mediabunny (1227 ms) and ~4.9x worse than platform (1012 ms). It is the fastest to *finish* but the most main-thread-blocking of the three. Since the scenario's declared `primaryMetric` is `decodeFps` (not longtasks), web-demuxer wins, but the longtask cost is a real responsiveness penalty. All three benches are **n=1** (mad=0, single sample), so the throughput ordering is directionally clear but weak as statistical evidence.

## Per-engine results

| Engine | Status | Oracles passed | decodeFps | Wall median | longtasks | Reason |
|---|---|---|---|---|---|---|
| web-demuxer@4.0.0 | **PASS** | ssim-psnr:true (12/12 exact) | **42.21 fps** | **1421.5 ms** | 4924 ms | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:true (12/12 exact) | 35.40 fps | 1694.9 ms | 1227 ms | cached previous PASS |
| platform@chrome-149 | PASS | ssim-psnr:true (12/12 exact) | 27.40 fps | 2189.4 ms | 1012 ms | cached previous PASS |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | decodeFrames N/A: huge 600s MOV needs whole-file wasm decode exceeding suite budget |
| remotion-webcodecs@4.0.479 | SKIPPED | — | — | — | — | decode exceeds 120s op budget (media-parser full-file scan too slow on 600s asset) |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | engine does not declare operation 'decodeFrames' |

(peakMemory and timeToFirstFrame have n=0 / median=0 for all engines — not captured in this run, so peak-memory could not be used as a tiebreaker despite being the scenario's stated stress axis. throughputRealtime is not present in the bench; primary metric is decodeFps.)

## Why the winner wins (deep technical)

**Codec/container path.** The input is H.264 in a non-fragmented QuickTime MOV. Decoding it efficiently means: parse the `moov`/sample tables, locate the leading keyframe + dependent samples, hand the H.264 `avcC` extradata and elementary chunks to a hardware H.264 decoder, and pull only the first ~60 presentation frames — without dragging the full 448 MB through memory. All three PASS engines use Chrome's hardware `VideoDecoder` (Apple M1 Max via ANGLE/Metal), so **pixel correctness is identical** (12/12 digest-exact). The differentiator is the **demux/feed efficiency in front of the decoder**.

**web-demuxer's path (the winner).** `src/engines/web-demuxer/adapter.ts:848` `decodeFrames` runs a genuine WASM-libav demux feeding a pipelined WebCodecs decoder:
- `src/engines/web-demuxer/adapter.ts:853` gets the `VideoDecoderConfig` (with `avcC` description) straight from the libav-based demuxer (`getDecoderConfig('video')`).
- `adapter.ts:855` self-gates with `VideoDecoder.isConfigSupported(...)` and **throws loudly** if the codec can't be configured — it does not fake a pass.
- `adapter.ts:887` consumes `d.read('video')` as a **streaming ReadableStream of EncodedVideoChunks** and `adapter.ts:894` feeds them into the decoder in a pipelined loop, capped at `submitCap = maxFrames + 16` (`adapter.ts:863`). This **bounds how much of the 448 MB file is touched** — it stops submitting after ~76 chunks rather than scanning the whole MOV, which is precisely the "lazy/partial read" the scenario tests.
- `adapter.ts:926` sorts the buffered reorder window by pts and slices to `maxFrames`, correctly handling H.264 B-frame decode-vs-presentation reordering before digesting (`adapter.ts:934`).

The libav (C, compiled to WASM) sample-table walk plus a tight pipelined submit loop lets web-demuxer reach and emit the leading frames faster than the TS-side demuxers — hence the top **42.21 fps / 1421.5 ms wall**. The trade-off shows in **longtasks=4924 ms**: the WASM demux + synchronous-ish reader loop blocks the main thread far longer than the competitors, so it pays for raw throughput with responsiveness.

**Why mediabunny is close but second.** mediabunny (`env.configUsed.backend=webcodecs`, `pipeline=streaming-lockstep`, `coreBuild=pure-ts-esm`, `coopCoep=not-required`, `sharedArrayBuffer=false`) also streams into hardware WebCodecs and posts much lower longtasks (1227 ms), i.e. a smoother main thread. Its pure-TS demux is slightly slower to feed the decoder than web-demuxer's WASM libav: **35.40 fps vs 42.21 fps (0.84x)**, **1694.9 ms vs 1421.5 ms wall**. Correctness identical (12/12 exact). It loses purely on the primary metric, and arguably would win on a longtasks-weighted metric.

**Why platform is third.** platform (`backend=webcodecs`, `hwAccel=true`, `pipeline=streaming`, `decode=VideoDecoder`, `pixelBackend=webgpu>webgl>offscreen2d`, `frameTransfer=transferable`) is the slowest decoder here at **27.40 fps / 2189.4 ms** despite the lowest longtasks (1012 ms). The platform path leans on the browser's own demux/pull cadence (queueDepth=2) which is less aggressive at prefetching leading samples from a huge MOV than libav's table walk, so throughput trails web-demuxer by **1.54x** even though both end on hardware H.264. Correctness identical.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed with identical correctness (ssim-psnr 12/12 exact) but lost on the primary metric: **0.84x** web-demuxer's decodeFps (35.40 vs 42.21) and 1.19x its wall. No fault; simply a slower TS-side feed into the same hardware decoder. (Note: it beats the winner on longtasks 1227 vs 4924 ms.)
- **platform@chrome-149** — PASSed (12/12 exact) but slowest decode: **0.65x** web-demuxer's decodeFps (27.40 vs 42.21), 1.54x wall. Lowest longtasks (1012 ms) but not the gating metric.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE, reason: "huge 600s MOV decode requires a whole-file browser-wasm decode path that exceeds the suite budget." **Honest NA:** ffmpeg.wasm's single-thread wasm decode would have to read/decode the whole file with no partial-read shortcut, blowing the op budget. Genuine scale limit, not under-declaration (it declares decodeFrames elsewhere).
- **remotion-webcodecs@4.0.479** — SKIPPED, reason: decode exceeds the 120s op budget because it parses via `@remotion/media-parser`, whose full-file scan on this 600s asset is the same slowness tracked as disabled for remotion-media-parser. **Honest scale skip** — the parser front-end can't reach leading frames without a slow full scan.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare operation 'decodeFrames'." Honest — mp4box is a demuxer/parser; it produces no decoded pixels, so it correctly does not claim the decode op.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'decodeFrames'." Honest — a parser, not a decoder; no pixel output.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/decode-seek/index.ts:391` (`id: 'decode_size_huge_h264_600s'`, `asset: 'huge_h264_1080p_600s.mov'`, `container: 'mov'`, `videoCodec: 'h264'`, `maxFrames: 60`, `heavyBake: true`); built into a scenario at `index.ts:404` with `op: 'decodeFrames'`, oracles `DECODE_ORACLES` (`index.ts:279` = `['ssim-psnr']`), primaryMetric `decodeFps`.
- **Fixture exists & is real:** `fixtures/media/huge_h264_1080p_600s.mov` present at ~448 MB — a genuine multi-hundred-MB H.264/MOV asset, not synthetic/empty/mock. The size matches the scenario's "~500-700 MB, 600s" intent.
- **Oracle is meaningful:** `ssim-psnr` at `src/core/oracles.ts:1688`. It pairs the engine's own decoded frames (`ctx.frames`) against committed golden frames index-by-index; a pair counts as exact only when normalized RGBA `sha256` digests match (`oracles.ts:1766`), and PASS-as-PSNR-∞ requires **all** pairs digest-identical (`oracles.ts:1803`, `exactCount === pairs`). Not trivially satisfiable: it is real per-frame digest comparison against golden, not a wide tolerance or a smoke gate. Measurements `pairs=12, exactFrames=12, ssimMin=1` are physically plausible for a deterministic H.264 hardware decode.
- **Winner adapter is genuine:** `src/engines/web-demuxer/adapter.ts:848` `decodeFrames` runs real WASM-libav demux + WebCodecs `VideoDecoder`: config from `getDecoderConfig('video')` (`adapter.ts:853`), `isConfigSupported` self-gate that throws on failure (`adapter.ts:855`), streaming `read('video')` of EncodedVideoChunks piped into the decoder (`adapter.ts:887`/`:894`), pts-sorted reorder window, real rasterize+sha256 digest (`adapter.ts:933`-`:935`). No canned output, no input→output copy, no golden short-circuit, no swallowed errors (decode errors are surfaced, `adapter.ts:921`).
- **Cached note:** **All three PASS results have `cached:true`** ("cached previous PASS result"). The evidence is reused, not re-run in this batch — staleness risk applies to all three, but the relative ordering (web-demuxer fastest) is internally consistent and the implementations are verified real.

**Verdict: REAL.** Real 448 MB H.264/MOV fixture, a real WASM-demux + hardware-WebCodecs decode implementation, and a strict per-frame digest oracle requiring 12/12 exact frames. The only weakness is benches are n=1 and cached.

## Confidence & caveats

- **Confidence: medium.** Correctness tie is unambiguous (all 12/12 digest-exact). The winner is decided purely by the primary metric (decodeFps), where web-demuxer leads by 1.19x / 1.54x.
- **Caveats:** (1) all benches are **n=1** (mad=0) and **cached** — a single sample is weak statistical evidence and could be stale. (2) **peakMemory was not captured** (n=0/median=0 for all), so the scenario's headline stress axis (peak memory under a huge input) is unmeasured — the win rests on throughput alone. (3) web-demuxer's **longtasks=4924 ms is 4.0-4.9x worse** than the other two; on a responsiveness-weighted ranking mediabunny would arguably win. The verdict honors the declared primaryMetric=decodeFps.
