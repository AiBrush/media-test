# transcode/h264_colorspace_709_to_2020

family: transcode | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, exists) | primaryMetric: none recorded (bench timed out) | passCount: 1 / 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- Contested? **No — uncontested.** Exactly one engine reached `status=PASS`; the other six are `NA_ENGINE`.
- Decisive factor: ffmpeg.wasm is the only engine that *declares* the `colorspace` transcode feature AND actually implements a BT.709→BT.2020 matrix conversion via the libavfilter `colorspace` filter, then re-encodes H.264/MP4 that passes the output-shape invariant and `<video>` playback. Every other engine is gated out before any work runs.
- Margin over runner-up: **N/A** — there is no second PASS, so there is no performance/correctness margin to compute. (Note: ffmpeg.wasm's own bench did not produce numbers; see caveats.)

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | n/a | n/a | n/a | n/a | cached: bench timeout: operation exceeded timeout of 120000ms |
| mediabunny@1.48.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare feature 'colorspace' |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare feature 'colorspace' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare feature 'colorspace' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |

No `bench{}` block, `primaryMetric`, or `env.configUsed` was emitted for any engine in this shard; the winner's only timing signal is `durationMs=339964` (~340 s wall for the whole gated run), and its reason string records that the *benchmark* phase exceeded the 120 s timeout (the correctness phase still completed and was cached).

## Why the winner wins (deep technical)

The operation is an H.264-in-MP4 → H.264-in-MP4 re-encode whose distinguishing requirement is a **colour-matrix / primaries conversion from BT.709 (HD) to BT.2020 (UHD/wide-gamut)**. This is not a remux: changing the colour space requires the YUV samples to be reinterpreted/converted, which forces a full decode → colour-convert → re-encode pipeline. Only an engine with a real video filter graph and a real H.264 encoder can do this inside the browser sandbox.

ffmpeg.wasm builds exactly that. In `src/engines/ffmpeg-wasm/adapter.ts:2362-2371` the transcode path reads `extra.colorspace`, normalises the endpoints through `ffmpegColorspace()` (adapter.ts:231-240, which maps `bt2020`→`bt2020` and `bt709`→`bt709`), and emits a libavfilter filter `colorspace=all=bt2020:iall=bt709`. That filter string is pushed into the `-vf` chain at adapter.ts:2372 and the whole command is executed via `this.run(args)` → `ff.exec(args)` (adapter.ts:1819-1823). `colorspace=all=bt2020:iall=bt709` is the genuine FFmpeg colour-space converter: `iall` declares the input is BT.709 and `all` requests BT.2020 output matrix/primaries/transfer, so the wasm build actually performs the 709→2020 matrix math and stamps the new colour tags on the re-encoded H.264 stream. None of the read-only engines have such a code path.

The gate is `property-invariant` with `which='transcode-output-metadata'` plus `playback-smoke`, chosen deliberately by the scenario author (index.ts:754-759): "ssim-psnr is omitted until the oracle can model colour-space transformed reference frames." Because a 709→2020 conversion *changes pixel values by design*, a pixel-identity SSIM gate against an un-transformed golden would be meaningless, so the row gates on output container/codec/duration shape + decodability rather than pixel fidelity. The invariant (`transcodeOutputMetadataInvariant`, oracles.ts:3626-3708) re-probes the produced bytes with the reference engine, then checks: container == requested (`mp4`), duration within tolerance, and a video track exists with the requested codec (`h264`). The shard's measurements confirm a real, plausible result: `durationDeltaSec: 0` against `durationToleranceSec: 0.15`, and `videoTracks: 1` — i.e. the output is a single-video-track MP4 whose duration matches the 30 s source to within zero observable drift. `playback-smoke` (oracles.ts:1574-1580) then loaded the output into a real `<video>` element and advanced frames, proving the re-encoded H.264 is decodable by the browser, not a malformed/empty file.

## What each other framework did wrong

- **mediabunny@1.48.0** — `NA_ENGINE`, "engine does not declare feature 'colorspace'". Mediabunny does declare the `transcode` operation generally, but not the `colorspace` capability token, so the runner gates it before execution. Honest NA: a JS/WebCodecs muxing library has no libavfilter colour-matrix converter; the conversion would require manual YUV matrix math it does not provide.
- **platform@chrome-149** — `NA_ENGINE`, "engine does not declare feature 'colorspace'". The raw WebCodecs platform engine can encode/decode H.264 but exposes no colour-space-conversion transform; declaring it would be over-claiming. Honest NA.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`, "engine does not declare feature 'colorspace'". Same as platform: WebCodecs-based transcode without a 709→2020 matrix-conversion stage. Honest NA.
- **web-demuxer@4.0.0** — `NA_ENGINE`, "engine does not declare operation 'transcode'". A demux-only library; it has no encoder at all. Correctly excluded.
- **mp4box@2.3.0** — `NA_ENGINE`, "engine does not declare operation 'transcode'". MP4 box parser/segmenter, no codec pipeline. Correctly excluded.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`, "engine does not declare operation 'transcode'". A parser/probe library, not a transcoder. Correctly excluded.

All six NAs look honest: three are not transcoders at all (demux/parse/box tools), and three are transcoders that genuinely lack a colour-space-conversion filter and chose not to declare `colorspace`.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:751-760` (id `h264_colorspace_709_to_2020`, feature `colorspace`, `extraOpts.colorspace = { from: 'bt709', to: 'bt2020' }`), generated via `transformFeatureScenarios` map at index.ts:783-804 with `input: 'h264_1080p_30s.mp4'`.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` — verified present, 31 MB. A real, non-trivial 1080p/30 s H.264 MP4, not synthetic/empty/mock.
- Gating oracle(s): `property-invariant` → `transcodeOutputMetadataInvariant` at `src/core/oracles.ts:3626-3708` (real reference-engine re-probe + container/duration/codec checks, not trivially satisfiable: it fails on container mismatch, duration drift beyond tolerance, or a missing video track); `playback-smoke` at oracles.ts:1574-1580 (real `<video>` decode-and-advance).
- Winner adapter path: `src/engines/ffmpeg-wasm/adapter.ts:2362-2372` (colorspace filter assembly) and adapter.ts:1819-1823 (`ff.exec(args)` real wasm invocation). The operation is genuinely implemented — it constructs `-vf colorspace=all=bt2020:iall=bt709` and runs the wasm FFmpeg encoder; it does NOT copy input→output, return canned bytes, or short-circuit to a golden.
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the PASS is genuine, but the correctness gate is intentionally a structural/metadata invariant + smoke playback — there is NO pixel-fidelity oracle (ssim-psnr is explicitly omitted per index.ts:757-759). So the test proves "produced a decodable H.264/MP4 of the right shape/duration with a colorspace filter applied," but it does NOT verify that the output actually carries BT.2020 colour tags or that the matrix conversion is numerically correct. The metadata invariant checks container/codec/duration/track-count, not colour primaries. This is a real PASS on a deliberately loose (proxy) gate for a colour-space conversion — hence WEAK-GATE, not REAL.
- Cached note: the winner's result has `cached=true` and the reason records a 120 s **bench** timeout (`bench timeout: operation exceeded timeout of 120000ms`). The correctness verdict was reused from a prior run, not re-executed this cycle; the staleness/launcher-reuse caveat applies. The correctness oracles still hold, but no fresh timing exists and the cached evidence was not re-validated this run.

## Confidence & caveats

- Confidence: **high** for the winner selection (only 1 PASS, all NAs are well-justified and the adapter code path is real and cited). Medium for the strength of the win, because the gate is a structural/smoke proxy with no colour-correctness verification.
- The colorspace conversion's actual correctness (BT.2020 primaries/matrix/transfer written and computed correctly) is NOT tested by any oracle here — `videoTracks:1` and `durationDeltaSec:0` only confirm shape and duration. A targeted gate would re-probe `color_primaries/colorspace/color_trc` of the output.
- No `bench{}` / `primaryMetric` / `env.configUsed` were emitted, so backend (single-thread wasm, COOP/COEP, threads) and performance numbers cannot be reported; the ~340 s `durationMs` and the bench-phase timeout indicate this is a heavy full-decode/re-encode workload in wasm.
- `cached=true`: result reused, not re-run — re-running with a cleared cache is advisable for an honest fresh measurement.
