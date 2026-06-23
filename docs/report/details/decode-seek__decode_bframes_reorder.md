# decode-seek/decode_bframes_reorder

family: decode-seek | fixture asset: `fixtures/media/h264_bframes_1080p.mp4` (11 MB, H.264 in MP4, B-frame GOP) | primaryMetric: decodeFps | passCount: 5

## Verdict

- **Best framework: `platform@chrome-149`** (raw browser WebCodecs `VideoDecoder`).
- **CONTESTED**: 5 of 7 engines PASS. Four of them (platform, mediabunny, remotion-webcodecs, web-demuxer) are bit-exact (12/12 digest-identical, SSIM=1, PSNR=∞). ffmpeg.wasm passes only on the SSIM proxy (0/12 digest-exact). The two MP4Box / remotion-media-parser entries are NA (don't declare `decodeFrames`).
- **Decisive factor**: correctness is a four-way tie at the strongest tier (bit-exact frames), so the win is decided on PERFORMANCE. Platform leads the primary metric `decodeFps` at **52.40 fps** and lowest `wall` at **1145 ms**.
- **Margin over runner-up** (mediabunny, the next-fastest bit-exact engine): 52.40 vs 48.47 fps = **1.08x faster decode throughput**; wall 1145.1 vs 1237.8 ms = **1.08x lower**. Margin is modest and rests on n==1 samples (see caveats); the longtask spread strongly favors mediabunny.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:true (12/12 exact, SSIM=1) | 1145.09 | n/a (decodeFps 52.40) | 0 (not measured) | 19963 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:true (12/12 exact, SSIM=1) | 1237.84 | n/a (decodeFps 48.47) | 0 (not measured) | 3045 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (12/12 exact, SSIM=1) | 1337.65 | n/a (decodeFps 44.85) | 0 (not measured) | 2055 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (12/12 exact, SSIM=1) | 1483.95 | n/a (decodeFps 40.43) | 0 (not measured) | 4223 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (0/12 exact, SSIM min 0.99995) | 1848.25 | n/a (decodeFps 32.46) | 2,976,751,172 | 2095 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

**The operation.** This scenario decodes the first `maxFrames: 60` frames of `h264_bframes_1080p.mp4` — an H.264 elementary stream in ISOBMFF whose GOP contains B-frames, so **decode order (DTS) differs from presentation order (PTS)**. The gating requirement (scenario note, `src/scenarios/decode-seek/index.ts:74`): "frames must be emitted in presentation (pts) order, not decode order." A naive decoder that emits frames as the codec spits them out (DTS order) would produce a frame sequence that does NOT line up index-for-index with the golden, and the per-index SSIM/digest pairing in the oracle would collapse. The oracle compares 12 paired frames (golden ships 12 luma signatures + digests in PTS order).

**Why platform is correct.** The platform adapter's decode path (`src/engines/platform/decode.ts`) feeds demuxed `EncodedVideoChunk`s to a real Chrome `VideoDecoder` in DTS order (`collectDecodedFrames`, `decode.ts:195-204`), then explicitly **re-sorts the collected `VideoFrame`s by `ptsUs`** before rasterizing/digesting: `collected.sort((a, b) => a.ptsUs - b.ptsUs)` at `decode.ts:222`. To make sure reordering is fully flushed, it submits a B-frame slack window past `maxFrames`: `submitCap = min(samples.length, maxFrames + 16)` (`decode.ts:194`) and calls `decoder.flush()` (`decode.ts:205`). This is precisely the mechanism this test exists to verify, and it lands 12/12 frames digest-identical with the golden (`oracleOutcomes[].measurements`: `pairs:12, exactFrames:12, ssimMean:1, ssimMin:1`). Each emitted `VideoFrame` is rasterized to RGBA via `imageDataFromVideoFrame` and SHA-256 digested (`decode.ts:148-155`), so a digest match is byte-exact frame equality, not a perceptual approximation.

**Why platform wins the tie.** Correctness is a four-way tie at the top tier — platform, mediabunny, remotion-webcodecs, and web-demuxer are all 12/12 digest-exact (SSIM=1, PSNR=∞), the strongest rung on the ladder. So the decision falls to performance. Platform uses `backend: webcodecs`, `hwAccel: true` (Apple M1 Max VideoToolbox via Chrome), `pipeline: streaming`, `pixelBackend: webgpu>webgl>offscreen2d`, `frameTransfer: transferable` (`env.configUsed`). Being the thinnest possible wrapper over the OS hardware decoder — no JS/wasm demux layer between the bytes and `VideoDecoder` — it posts the best primary metric `decodeFps 52.40` and lowest `wall 1145.09 ms`. Over the runner-up mediabunny that is 1.08x on both axes.

**Important counter-signal.** Platform's `longtasks` median is **19963 ms** — roughly 6.6x mediabunny's 3045 ms and ~10x remotion-webcodecs' 2055 ms. This reflects its main-thread pipeline (`worker: false`, `pixelBackend: webgpu>webgl>offscreen2d` raster on the main thread), which blocks the event loop far longer despite finishing wall-faster. For UI responsiveness, mediabunny/remotion-webcodecs are clearly superior. The win here is on the declared primary metric (decodeFps) and wall only; it is not a clean sweep.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, runner-up): bit-exact and correct, lost only on speed — `decodeFps 48.47` (0.92x of platform) and `wall 1237.84 ms` (1.08x slower). It uses its own pure-TS ESM demux + WebCodecs (`backend: webcodecs`, `coreBuild: pure-ts-esm`); the extra TS demux/lockstep layer costs the throughput gap. Far better longtasks (3045 ms) — the real-world choice.
- **remotion-webcodecs@4.0.479** (PASS): bit-exact, `decodeFps 44.85` (0.86x), `wall 1337.65 ms` (1.17x slower). Best longtasks of all (2055 ms) but slowest of the WebCodecs trio on raw throughput.
- **web-demuxer@4.0.0** (PASS): bit-exact, slowest of the WebCodecs-class engines — `decodeFps 40.43` (0.77x), `wall 1483.95 ms` (1.30x). Its wasm (libav) demux feeding WebCodecs adds overhead vs native demux.
- **ffmpeg.wasm@0.12.15** (PASS but correctness-weaker): SSIM proxy only — `exactFrames: 0/12`, `ssimMin 0.99995`, `ssimMean 0.99995`. Its full software decode in wasm produces pixels that are perceptually identical but NOT byte-identical to the golden (different IDCT/deblock rounding than the hardware/Chrome decoder), so it never reaches digest equality. Per the ladder, an ssim-psnr pass with `exactFrames==0` is the weakest correctness rung among these passers. Also slowest (`decodeFps 32.46`, 0.62x) and enormous memory: `peakMemory 2.98 GB` — the wasm heap. It would lose regardless of speed because it is correctness-weaker.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "engine does not declare operation 'decodeFrames'". Honest NA — remotion-media-parser is a parser/demuxer, it does not pixel-decode; declaring decodeFrames would be a false capability.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare operation 'decodeFrames'". Honest NA — MP4Box.js is an ISOBMFF box parser/demuxer with no decoder; correct to abstain.

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/decode-seek/index.ts:67-75` (case `decode_bframes_reorder`), with note at line 74. Input asset field: `asset: 'h264_bframes_1080p.mp4'`, `container: 'mp4'`, `videoCodec: 'h264'`, `maxFrames: 60`.
- **Fixture exists & is real**: `fixtures/media/h264_bframes_1080p.mp4` is present, **11 MB** — a genuine 1080p H.264/MP4 clip, not synthetic/empty/mock. Goldens are committed and substantive: `fixtures/golden/h264_bframes_1080p.mp4.frames.json`, `.packets.json` (87k), `.ssim.json` (76k of per-frame luma signatures), `.meta.json`.
- **Oracle is real**: `ssimPsnr` at `src/core/oracles.ts:1688`. It pairs candidate frames to golden by index, accepts a frame only on SHA-256 digest equality of normalized RGBA (`oracles.ts:1766-1771`) or, failing that, downsampled-luma SSIM vs the committed signature (`oracles.ts:1773-1786`), and **gates on the worst frame** `minSsim >= t.ssimMin` (`oracles.ts:1823`), not the mean. Not trivially satisfiable: a wrong/DTS-ordered sequence breaks the per-index pairing and fails. Winner's measurements (`pairs:12, exactFrames:12, ssimMean:1, ssimMin:1`) are physically plausible for a hardware decode that matches a golden baked from the same source.
- **Winner adapter is genuine**: `src/engines/platform/decode.ts:89` `decodeWithWebCodecs` calls real `VideoDecoder.isConfigSupported`/`configure`/`decode`/`flush` (lines 119, 190, 203, 205), rasterizes actual `VideoFrame`s, and PTS-reorders at line 222. No canned output, no copy-input-to-output, no golden short-circuit, no error swallowing (errors propagate via the decoder `error` callback at `decode.ts:184-186` and rethrow at `decode.ts:217-220`). Adapter entry `src/engines/platform/adapter.ts:422` (`decodeFrames`).
- **Cached note**: ALL 7 entries have `cached: true` ("cached previous PASS result"). The evidence is reused, not freshly re-run in this run — staleness risk per the launcher-seeding caveat. The margins are real-but-small and from cached n==1 samples.
- **Verdict: REAL.** Real 11 MB H.264/B-frame fixture, committed goldens, a genuine WebCodecs implementation that performs the exact PTS-reorder the test targets, and a digest+SSIM oracle that cannot be passed by an incorrectly ordered or garbled decode. The only blemish is that all entries are cached.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict is solid (code + oracle + measurements all consistent and bit-exact for 4 engines). The performance ranking that breaks the tie is weak evidence: every bench is **n==1** (`mad:0`, `p95==median`), so the 1.08x platform-over-mediabunny gap is within plausible run-to-run noise and could flip.
- **All results cached** — not re-run this cycle; numbers may be stale.
- **Primary-metric tunnel vision**: platform "wins" on decodeFps/wall but is dramatically worse on `longtasks` (19963 ms vs mediabunny 3045 ms). If the leaderboard weighted main-thread blocking, mediabunny or remotion-webcodecs would be the practical winner. Reported here so the headline is not mistaken for a dominance.
- `peakMemory` is 0 (not measured) for the WebCodecs engines, so the memory axis is only observable for ffmpeg.wasm (2.98 GB).
