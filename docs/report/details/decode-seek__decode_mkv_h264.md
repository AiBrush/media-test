# decode-seek/decode_mkv_h264

family: decode-seek · fixture asset: `fixtures/media/h264_in_mkv.mkv` (4.4 MB, H.264 1280×720@30 + AAC, Matroska/`Lavf`) · primaryMetric: `decodeFps` · passCount: 5/7

## Verdict

**Best framework: `web-demuxer@4.0.0`** — CONTESTED win. Five engines PASSed the gate; four of them
(`web-demuxer`, `mediabunny`, `platform`, `remotion-webcodecs`) tied at the strongest possible correctness
outcome on this gate: all 12 paired frames digest-identical (`exactFrames:12`, SSIM=1, PSNR=∞). The fifth
PASS (`ffmpeg.wasm`) cleared only the perceptual SSIM proxy (`exactFrames:0`, SSIM min 0.9986) — strictly
weaker. With correctness tied across the four bit-exact engines, the tiebreak is the declared
`primaryMetric` = `decodeFps`.

**Decisive factor:** highest `decodeFps`. `web-demuxer` decoded at **91.35 fps**, ahead of `mediabunny`
81.26 fps (margin **1.12x**), `platform` 76.77 fps (**1.19x**), and `remotion-webcodecs` 74.39 fps
(**1.23x**). It also posts the lowest wall median (656.8 ms vs 738–819 ms; **1.12x–1.25x** faster).

**Margin over runner-up (`mediabunny`):** 1.12x on decodeFps (91.35 vs 81.26 fps) and 1.12x on wall
(656.8 vs 738.4 ms). Caveat: the win rests on n==1 samples and `web-demuxer` carries a catastrophic
`longtasks` of 19963 ms (main-thread WASM-demux jank), ~8x worse than `mediabunny` (2477 ms) — see caveats.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | decodeFps | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (exactFrames 12/12, SSIM=1) | 656.80 | 91.36 | n/a (0) | 19963 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (exactFrames 12/12, SSIM=1) | 738.41 | 81.26 | n/a (0) | 2477 | cached previous PASS result |
| platform@chrome-149 | PASS | ssim-psnr:pass (exactFrames 12/12, SSIM=1) | 781.55 | 76.77 | n/a (0) | 2907 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (exactFrames 12/12, SSIM=1) | 806.58 | 74.39 | n/a (0) | 5449 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (exactFrames 0/12, SSIM min 0.9986) | 818.76 | 73.28 | 1359217216 | 1007 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

The operation is `decodeFrames` on H.264 carried inside **Matroska** — i.e. the demuxer must walk
Cluster/SimpleBlock structures and lacing to recover Annex-B/AVCC packets and per-frame timestamps, then a
real H.264 decoder must turn those packets into pixels in presentation order. The golden
(`fixtures/golden/h264_in_mkv.mkv.frames.json`, `pending:false`, `bakedBy: frame-bake (platform engine)` on
2026-06-21) commits **12 sha256 digests of the normalized RGBA buffer** decoded in a real Chrome. The
`ssim-psnr` oracle (`src/core/oracles.ts:1688`) pairs the engine's own `ctx.frames` digests against those
12 goldens by index; when every normalized-RGBA sha256 matches it reports `exactFrames==pairs` and returns
PASS with SSIM=1/PSNR=∞ (`oracles.ts:1766`, `:1803`). So the four bit-exact engines are not merely "close" —
their decoded pixels are byte-identical to the platform-baked reference after RGBA normalization.

`web-demuxer` achieves this through a clean split-of-labor: its bundled ffmpeg-wasm worker demuxes the MKV
(Cluster/SimpleBlock parse, lacing, timestamp recovery) and hands back a ready `VideoDecoderConfig` plus
`EncodedVideoChunk`s, while the actual H.264 decode runs on Chrome's **hardware WebCodecs** `VideoDecoder`.
In `src/engines/web-demuxer/adapter.ts:848` `decodeFrames` (1) guards `hasVideoDecoder()`, (2) self-gates
via `VideoDecoder.isConfigSupported()` and throws on unsupported codecs (`adapter.ts:855`), (3) pipelines
chunk submission with a B-frame reorder window (`submitCap = maxFrames + 16`, `adapter.ts:863`), (4) sorts
the buffered window by `frame.timestamp` and slices the lowest-pts `maxFrames` so output is in **presentation
order** (`adapter.ts:926`), then (5) rasterizes each `VideoFrame` to RGBA and sha256s it with the shared
normalization (`adapter.ts:933-935`). Because the decode itself is the platform hardware decoder — the same
decoder family that baked the golden — the digests land bit-exact (12/12), and because the demux is
pipelined and the decode is hardware, the measured `decodeFps` (91.35) and wall (656.8 ms) are the best in
the field. The pure-pixel-throughput metric `decodeFps` does not charge the engine for the main-thread WASM
demux cost, which is why it leads despite the worst `longtasks`.

The runner-up `mediabunny` is mechanistically similar in correctness (also bit-exact 12/12) but slower:
`env.configUsed` shows `backend:webcodecs`, `hwAccel:prefer-hardware`, `pipeline:streaming-lockstep`. Its
`decodeFrames` (`src/engines/mediabunny/adapter.ts:1330`) drives a `VideoSampleSink` over the primary video
track (`adapter.ts:1387`) and copies each `VideoSample` to RGBA via `VideoSample.copyTo` (`adapter.ts:1398`,
`pixelBackend: VideoSample.copyTo(RGBA)>canvas`). The streaming-lockstep pipeline pulls one sample at a time
rather than deep-pipelining submission, so its throughput (81.26 fps) trails web-demuxer's pipelined submit
by 1.12x even though both end on Chrome's hardware H.264 decoder. Its big advantage is responsiveness:
longtasks 2477 ms vs web-demuxer's 19963 ms.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on speed only. Identical top correctness (exactFrames 12/12), but
  decodeFps 81.26 vs 91.36 (0.89x of winner) and wall 738.4 vs 656.8 ms. Streaming-lockstep sample pull is
  less pipelined than web-demuxer's submit loop. (Far better longtasks: 2477 ms.)
- **platform@chrome-149** — PASS, lost on speed. exactFrames 12/12 (it baked the golden, so trivially
  bit-exact), but decodeFps 76.77 (0.84x) and wall 781.5 ms. `<video>`-pathless raw `VideoDecoder` with
  `queueDepth:2` is shallower-pipelined than web-demuxer's reorder-window submit.
- **remotion-webcodecs@4.0.479** — PASS, lost on speed. exactFrames 12/12 but slowest decodeFps of the
  bit-exact group at 74.39 (0.81x) and wall 806.6 ms; `pipeline:streaming-backpressure` /
  `waitForQueueToBeLessThan` throttles submission, costing throughput; longtasks 5449 ms.
- **ffmpeg.wasm@0.12.15** — PASS but **weakest correctness**: ssim-psnr cleared only the perceptual proxy
  (`exactFrames:0/12`, SSIM min 0.9986 ≥ 0.99, mean 0.9990) — its software H.264 decode does NOT produce
  RGBA byte-identical to the WebCodecs-baked golden, so it is ranked below all four bit-exact engines on
  correctness strength before performance is even consulted. Also slowest decodeFps (73.28) and only engine
  reporting peakMemory (1.36 GB — the wasm heap).
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest. It is a parser/demuxer that "emits encoded samples
  only" with no decoder; `capabilities()` declares only probe/demux (`adapter.ts:186`), and `decodeFrames`
  throws a clear "no decoder" error (`adapter.ts:556`). Cannot produce pixels → genuine NA, not under-declared.
- **mp4box@2.3.0** — NA_ENGINE, honest. ISOBMFF box parser with no decoder; `decodeFrames` throws
  "decodeFrames not supported (no decoder — pair with WebCodecs)" (`adapter.ts:953`). Also could not even
  demux this asset (Matroska, not ISOBMFF). Genuine NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/decode-seek/index.ts:146` — `id:'decode_mkv_h264'`,
  `asset:'h264_in_mkv.mkv'`, `container:'mkv'`, `videoCodec:'h264'`, `maxFrames:60`. Notes
  (`index.ts:152`): "H.264-in-Matroska decode path (Cluster/SimpleBlock timestamps, lacing) — decode-relevant
  and previously untested." Real container/codec edge, not synthetic.
- **Fixture exists:** `fixtures/media/h264_in_mkv.mkv` present, 4.4 MB. Golden meta
  (`fixtures/golden/h264_in_mkv.mkv.meta.json`) confirms physically-plausible real media: mkv, durationSec
  10.021, video h264 1280×720@30 bitrate 3.49 Mbps, audio aac 48 kHz stereo, encoder `Lavf`. Frame golden
  has 12 real sha256 digests, `pending:false`, `bakedBy: frame-bake (platform engine)` 2026-06-21 — a real
  browser-baked reference, not a placeholder.
- **Gating oracle:** `ssim-psnr` at `src/core/oracles.ts:1688`. It pairs the engine's own decoded RGBA
  digests against the 12 committed goldens by index (`oracles.ts:1760-1771`), gates on the WORST frame
  (`minSsim >= t.ssimMin`, default 0.99, `oracles.ts:1823`/`:157`), and reports `exactFrames` when sha256s
  match. Not trivially satisfiable: it requires either digest equality or a measured per-frame luma-SSIM ≥
  0.99 on the minimum frame. Measurements are plausible (12 pairs, matching the 12-frame golden; SSIM in
  [0.9986, 1.0]).
- **Winner adapter:** `src/engines/web-demuxer/adapter.ts:848` (`decodeFrames`). Genuinely implemented — real
  ffmpeg-wasm demux → real `VideoDecoder.isConfigSupported`/`configure`/`decode`/`flush`
  (`adapter.ts:855,883,894,909`) → real `VideoFrame`→RGBA→sha256 (`adapter.ts:933-935`). No canned output, no
  input→output copy, no short-circuit to golden, no error swallowing (decode errors propagate,
  `adapter.ts:921`).
- **Verdict: REAL.** Real Matroska fixture, real WASM-demux + hardware-WebCodecs decode, meaningful
  worst-frame-gated bit-exact oracle with plausible measurements.
- **Cached note:** all five PASS results carry `cached:true` ("cached previous PASS result"). The numbers
  were reused, not freshly re-run in this pass — staleness risk per the launcher-seeding caveat. The decode
  paths and golden are unchanged, so the PASS verdicts are trustworthy, but the precise fps/wall margins
  reflect an earlier run.

## Confidence & caveats

- **Confidence: medium.** Correctness ranking is unambiguous (four bit-exact 12/12 vs one SSIM-proxy-only),
  and the validation is REAL. The *winner* among the four bit-exact engines hinges on `decodeFps`, where all
  bench metrics are **n==1, mad==0** — single-sample, no spread — so the 1.12x margin over mediabunny is
  thin evidence.
- **Responsiveness counter-signal:** `web-demuxer` posts `longtasks` 19963 ms, ~8x mediabunny (2477 ms) and
  ~3.7x remotion-webcodecs (5449 ms) — the main-thread ffmpeg-wasm MKV demux blocks for ~20 s. If the
  leaderboard weighted longtasks or main-thread jank, `mediabunny` would be the better practical choice. The
  win is strictly on the declared `primaryMetric` (decodeFps) and wall.
- `peakMemory` is unreported (0) for the WebCodecs engines, so the memory tiebreak could not be applied; only
  ffmpeg.wasm exposed it (1.36 GB).
- All results `cached:true` — margins are from a prior run; a fresh re-run could reorder the tightly-bunched
  top three.
