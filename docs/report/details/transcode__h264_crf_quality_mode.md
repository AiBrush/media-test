# transcode/h264_crf_quality_mode

family: transcode | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31,258,790 bytes, real H.264/AAC MP4) | primaryMetric: wall (TC_METRICS) | passCount: 1 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Contested: **NO** — uncontested. Exactly one engine reached `status=PASS`; the other six are `NA_ENGINE`.
- Decisive factor: it is the only engine in the matrix that ships a real software H.264 encoder (vendored libx264) and therefore the only one that declares the `crf` feature. CRF (x264 constant-rate-factor) rate control cannot be expressed through the WebCodecs `VideoEncoder` API (which exposes only `bitrate`/quantizer), and the parser-only engines have no encoder at all.
- Margin over runner-up: not applicable — no second PASS. The "runner-up" engines never ran an oracle (empty `oracleOutcomes`).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | 74851.19 ms | 0.4008 x-realtime | 0 (n=0, not sampled) | 330 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'crf' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'crf' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'crf' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Extra ffmpeg.wasm bench from shard: encodeFps median 12.0239 fps (n=1), all metrics n=1 warmup=1 (single measured sample, mad=0, p95==median). durationMs=235997.

## Why the winner wins (deep technical)

The operation is a full re-encode of a 30-second 1080p30 H.264/AAC MP4 to H.264/MP4 under **CRF 23 quality-rate-control mode** (scenario `src/scenarios/transcode/index.ts:761-770`; options `{ video: { codec: 'h264', crf: 23 }, invariant: 'transcode-output-metadata' }`). CRF is an x264/x265 abstraction: instead of targeting a bitrate, the encoder holds a constant perceptual quantizer and lets the bitrate float. There is no WebCodecs equivalent — `VideoEncoder.configure()` accepts `bitrate` and `bitrateMode`/`latencyMode` but never an x264 CRF, so any WebCodecs-backed engine that honestly modelled the request would have to refuse it. That is exactly why `platform`, `mediabunny` and `remotion-webcodecs` return `NA_ENGINE: engine does not declare feature 'crf'`.

ffmpeg.wasm wins because its adapter declares `transcode: true` and the `crf` feature (`src/engines/ffmpeg-wasm/adapter.ts:1459,1492`) and then actually wires the request to libx264. In the video-encode branch the adapter reads the requested CRF and emits genuine x264 args: `-pix_fmt yuv420p -preset veryfast` and, because `requestedCrf` (23) is defined, `args.push('-crf', String(requestedCrf))` — `src/engines/ffmpeg-wasm/adapter.ts:2434-2440`. It also appends `this.threadArgs()` (`:2455`) for the thread-aware encoder. This is a real call into the vendored single-thread wasm core, not a copy/remux: the adapter explicitly rejects truncated/mutated inputs before encoding (`:2183-2189`) and the warm-up runs a throwaway synthetic transcode so the measured cell does not pay JIT/alloc costs (`:1673,1762`).

The gate is meaningful, not a smoke-only pass. The row uses `oracles: ['property-invariant', 'playback-smoke']` with the `transcode-output-metadata` invariant. The invariant (`src/core/oracles.ts:2650`, body at `:3650-3708`) decodes the produced bytes, checks the output container equals the requested `mp4`, checks at least one **video** track exists, and checks the output duration against the source golden within the resolved tolerance. The shard's measurements are physically consistent with a real 30s re-encode: `durationDeltaSec: 0`, `durationToleranceSec: 0.15` (the `TC_REENCODE_DURATION_TOLERANCE_SEC` override), `videoTracks: 1`, with the pass detail "mp4, 2 track(s) match requested output shape" (video + AAC audio carried through). The second gate, `playback-smoke` (`src/core/oracles.ts:1574-1580`), then loads the output into a real `<video>` element and confirms it advanced frames — proving the CRF-encoded stream is genuinely decodable, not just structurally well-formed.

The cost profile in the shard matches a CPU-bound software encode under single-thread wasm: wall median 74,851 ms, throughputRealtime 0.4008x (sub-realtime, expected for libx264 in wasm), encodeFps 12.02 fps for 1080p, and only 330 ms of long-tasks (the encode runs off the main thread in the wasm worker, so the UI thread is barely blocked). These numbers are exactly what one expects for the only path that can do CRF in-browser; they are slow but correct, and there is no faster competitor here because no competitor can do the operation at all.

## What each other framework did wrong

- **platform@chrome-149** — `NA_ENGINE: engine does not declare feature 'crf'`. Honest NA: the platform path is WebCodecs `VideoEncoder`, whose config has no CRF knob (only bitrate). Declaring `crf` would be an over-declaration; refusing is correct.
- **mediabunny@1.48.0** — `NA_ENGINE: engine does not declare feature 'crf'`. Honest NA for the same reason: mediabunny encodes via WebCodecs and cannot map a constant-quality CRF target.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE: engine does not declare feature 'crf'`. Honest NA: WebCodecs-based, no CRF parameter.
- **remotion-media-parser@4.0.479** — `NA_ENGINE: engine does not declare operation 'transcode'`. Honest NA: it is a demux/parse-only library with no encoder.
- **mp4box@2.3.0** — `NA_ENGINE: engine does not declare operation 'transcode'`. Honest NA confirmed in code: `transcode()` throws "no encoder/decoder — ISOBMFF parser only" (`src/engines/mp4box/adapter.ts:949-950`); it declares only four parse/remux operations.
- **web-demuxer@4.0.0** — `NA_ENGINE: engine does not declare operation 'transcode'`. Honest NA: it is a wasm demuxer (packet extraction), not an encoder.

## Anti-cheat validation

- Scenario: `src/scenarios/transcode/index.ts:761-770` (id `h264_crf_quality_mode`); built by the `transformFeatureScenarios` factory at `:783-804` with `input: 'h264_1080p_30s.mp4'`, `op: 'transcode'`, requires `features: ['crf']`.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` EXISTS, 31,258,790 bytes — a real 30s 1080p H.264/AAC MP4, not synthetic/empty/mock.
- Winner adapter: real libx264 CRF wiring at `src/engines/ffmpeg-wasm/adapter.ts:2434-2440` (reads `requestedCrf`, pushes `-crf 23`); declares `transcode`/`crf` at `:1459,1492`; rejects truncated/mutated inputs at `:2183-2189`. No canned output, no input→output copy, no short-circuit to golden, no swallowed errors.
- Oracle: `transcode-output-metadata` property-invariant at `src/core/oracles.ts:2650` / `:3650-3708` performs a real decoded-metadata comparison (container match, video-track presence, duration-within-tolerance) against the source golden; `playback-smoke` at `:1574-1580` does a real `<video>` decode. Measurements are plausible: durationDelta 0s ≤ 0.15s tol, videoTracks 1, 2 tracks total.
- Verdict: **WEAK-GATE**. The PASS is real (real fixture, real libx264 CRF encode, real decode + playback), but the gating oracles are structural-metadata + smoke, NOT a perceptual/bit-exact correctness check. The row deliberately omits `ssim-psnr` (notes: "CRF 23 intentionally changes perceptual quality"), so nothing here verifies the encoded pixels actually match the source within a quality floor — only that the output is an mp4 with a video track of the right duration that plays. PASS is trustworthy as "produced a decodable CRF-encoded MP4", but it does not strongly bound output quality.
- Cached note: `cached: true` — this result was REUSED from a prior run, not re-executed in the current run (`reason: "cached previous PASS result"`). All bench metrics are n=1 (single sample, mad=0). Staleness risk: low for the verdict (the adapter/oracle code paths are unchanged and the NA topology is structural), but the absolute timings are stale single-shot numbers.

## Confidence & caveats

- Confidence: **high** for the winner identity and the NA honesty (only ffmpeg.wasm can do CRF in-browser; mp4box's throw is confirmed in source; WebCodecs has no CRF parameter).
- Caveats: (1) The win is uncontested by elimination, not by out-competing a peer — there is no performance margin to report. (2) The gate is metadata+smoke only (WEAK-GATE); output perceptual quality is not bounded by any oracle. (3) The winning result is cached and all metrics are single-sample (n=1, mad=0), so the timing figures (74.85s wall, 12.02 encodeFps, 0.4008x realtime) are point estimates. (4) `peakMemory` was not sampled (n=0), so memory cost is unknown.
