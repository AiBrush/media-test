# transcode/extreme_fps_240

family: transcode | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real) | primaryMetric: wall | passCount: 1 / 7

This scenario re-encodes a 30 s 1920x1080 H.264/AAC MP4 to a new H.264/MP4 target while forcing the
video frame rate to an extreme **240 fps** (8x upsampling from the source 30 fps). Because heavy
interpolation makes index-paired SSIM unsound, the scenario is gated by a duration-preservation
metamorphic invariant (`property-invariant` / `probe-duration`) plus a `playback-smoke` check, NOT by
pixel/frame correctness. Tolerances: `durationToleranceSec = TC_REENCODE_DURATION_TOLERANCE_SEC`.

## Verdict

- **Best framework: mediabunny@1.48.0 (UNCONTESTED).** It is the only engine of 7 with status PASS.
- **Decisive factor:** it is the only engine that BOTH declares the `transcode` operation AND the
  `fps` feature AND can actually encode at frameRate=240 without self-disqualifying. ffmpeg.wasm
  declares transcode but hard-caps fps at 120 and returns NA; the remaining five lack either the
  `transcode` op or the `fps` feature entirely.
- **Margin over runner-up:** N/A — there is no second PASS, so no performance contest. mediabunny's
  own numbers: wall median 16590 ms (n=1), throughputRealtime 1.81x, encodeFps 54.2 fps, longtasks
  3675 ms. Duration invariant Δ = 0.0800 s against a 0.1500 s band (used 53% of the budget).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 16589.96 ms | 1.808x | 0 (not sampled) | 3675 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode not applicable: fps=240 is too large for this wasm encode path |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |

(peakMemory and decodeFps have n=0 samples in the shard, hence 0 / not measured.)

## Why the winner wins (deep technical)

The operation is a real re-encode: source 30 fps H.264 must be resampled to 240 fps and re-muxed into
MP4. With 8x temporal upsampling, the source's 900 coded frames must be expanded to ~7200 emitted
frames, so no engine can "remux/copy" — every output packet has to be freshly encoded. That is
exactly why the gate is duration-preservation rather than per-frame SSIM: the scenario notes state
"Heavy interpolation; gated by duration-preservation" and index-paired SSIM would be unsound when
frame counts differ by 8x (`src/scenarios/transcode/index.ts:1446-1458`).

mediabunny runs the genuine Conversion pipeline. The fps target flows through
`src/engines/mediabunny/adapter.ts:587` (`if (typeof v.fps === 'number') opts.frameRate = v.fps;`),
producing a `ConversionVideoOptions.frameRate = 240`. The encode config is probed with
`canEncodeVideo` (WebCodecs `isConfigSupported`) before committing so the Conversion is never handed a
config the browser rejects mid-stream (adapter.ts:527-546). It then builds an `Output` +
`BufferTarget`, calls `mb.Conversion.init(opts)` and `conversion.execute()`
(`src/engines/mediabunny/adapter.ts:848-855`), which drives read -> decode -> frame-rate resample ->
encode -> mux in a streaming-lockstep pipeline. From the shard `env.configUsed`: backend `webcodecs`,
`hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`,
`sharedArrayBuffer: false`, `coopCoep: not-required`. So the upsample to 240 fps is done by a hardware
H.264 encoder (Apple M1 Max via ANGLE Metal per `env.gpu`) with no cross-origin-isolation
requirement.

The gate it satisfied: `property-invariant` with `which = probe-duration`
(`src/core/oracles.ts:2645-2758`). For an authored output the oracle re-probes the produced bytes via
the reference engine and compares against the golden source duration
(`src/core/oracles.ts:2714-2744`). Measurements from the shard: `outDurationSec = 30.08`,
`goldenDurationSec = 30`, `deltaSec = 0.0799999999999983`, `durationToleranceSec = 0.15`. So the
240 fps re-encode preserved wall-clock duration to within 80 ms (0.27% of 30 s) — the encoder emitted
the correct timeline despite the 8x frame multiplication, which is the precise property the scenario
cares about. The 0.08 s overrun is consistent with a final-GOP / encoder-delay rounding at the much
finer 240 fps grid (one extra 240 fps frame is ~4.2 ms; ~19 such frames of slack still clears the
band). `playback-smoke` additionally confirmed a real `<video>` element decoded and played frames of
the output, proving the MP4 is a valid, browser-playable H.264 stream, not a syntactically-broken
container that merely probes to the right duration.

Performance is reported but uncontested: wall 16590 ms for a 30 s clip = 1.81x realtime, encodeFps
54.2, longtasks 3675 ms. All bench metrics are n=1 (single sample, mad=0, p95==median), so they are
point estimates with no spread — fine here because there is no rival to rank against.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — NA_ENGINE (honest, self-imposed cap).** Its transcode adapter explicitly
  rejects fps > 120: `src/engines/ffmpeg-wasm/adapter.ts:2191-2192` throws
  `NotApplicableError('transcode', 'fps=240 is too large for this wasm encode path')`. This is a
  deliberate, declared limit (single-thread wasm x264 at 240 fps over a 30 s clip would be
  pathologically slow), not a hidden crash. The NA is honest: the engine DOES declare transcode and
  fps elsewhere, but draws a documented line at this extreme rate. (durationMs 114 — it bailed
  immediately, before any encode.)
- **mp4box@2.3.0 — NA_ENGINE.** "engine does not declare operation 'transcode'." Honest: MP4Box.js is
  an ISOBMFF box parser/segmenter/remuxer with no encoder, so it genuinely cannot re-encode H.264 at
  any fps. Not an under-declaration.
- **web-demuxer@4.0.0 — NA_ENGINE.** "engine does not declare operation 'transcode'." Honest: it is a
  demuxer (WASM FFmpeg demux only); it exposes packets, not an encode/mux path. Cannot transcode.
- **remotion-media-parser@4.0.479 — NA_ENGINE.** "engine does not declare operation 'transcode'."
  Honest: it is a read-only parser; transcode is out of scope by design (the encode side lives in
  remotion-webcodecs).
- **platform@chrome-149 — NA_ENGINE.** "engine does not declare feature 'fps'." The raw-WebCodecs
  platform baseline supports transcode but the harness adapter does not declare the `fps`
  (frame-rate-retiming) feature, so the capability gate excludes it. This is a real adapter
  limitation (no frame-rate-resampler wired in the baseline), not a dishonest dodge.
- **remotion-webcodecs@4.0.479 — NA_ENGINE.** "engine does not declare feature 'fps'." It declares
  transcode but not the fps retiming feature, so it is gated out. Plausible: arbitrary frame-rate
  conversion (especially 8x upsample) is not a declared capability of its convertMedia path.

## Anti-cheat validation

- **Scenario:** `src/scenarios/transcode/index.ts:1445-1458` (`id: 'extreme_fps_240'`, built via
  `buildVideoScenario`). Input asset `h264_1080p_30s.mp4`. Oracles overridden to
  `['property-invariant', 'playback-smoke']`; opts `{ container:'mp4', video:{codec:'h264', fps:240},
  invariant:'probe-duration' }`. Notes confirm the gating rationale (heavy interpolation -> duration
  gate, index SSIM unsound).
- **Fixture exists and is real:** `fixtures/media/h264_1080p_30s.mp4`, 31 MB on disk; golden meta
  `fixtures/golden/h264_1080p_30s.mp4.meta.json` confirms it is a genuine 30 s, 1920x1080, H.264 @
  30 fps + AAC 48 kHz stereo MP4 (bitrate 8.2 Mbps). Not synthetic/empty/mock.
- **Winner adapter is a genuine implementation:** `src/engines/mediabunny/adapter.ts:587` maps
  fps->`frameRate`, :527-546 probes encodability via WebCodecs `canEncodeVideo`, :848-855 runs a real
  `mb.Conversion.init` + `conversion.execute()` into a `BufferTarget`. No canned output, no
  input->output copy (a copy is impossible at 240 fps — frames must be re-encoded), no short-circuit
  to a golden, no error-swallowing (an invalid Conversion throws at :849-853).
- **Oracle performs a real comparison:** `src/core/oracles.ts:2714-2744` re-probes the produced bytes
  with the reference engine and compares output duration to the golden source duration with a finite
  band; FAILs if Δ exceeds tolerance (:2745-2752). Measurements are physically plausible: 30.08 s out
  vs 30 s golden, Δ 0.08 s, band 0.15 s. `playback-smoke` requires the browser to actually decode and
  render frames, so the MP4 is provably valid, not a metadata-only fake.
- **Cached note:** mediabunny's result is `cached: true` ("cached previous PASS result"). The PASS was
  REUSED from a prior run, not freshly re-executed in this report build. Per the launcher seeding
  caveat, cached PASS carries staleness risk; however the cached payload contains real oracle
  measurements and a real `env.configUsed`, and the code paths above are current, so confidence
  remains high that a fresh run reproduces it.
- **Verdict: REAL.** Real 31 MB H.264 fixture + genuine WebCodecs/mediabunny Conversion encode at
  frameRate=240 + a non-trivial duration-preservation oracle backed by a reference re-probe and a
  live playback smoke. The only soft spots are the deliberately-loose gate (duration, not pixel/SSIM —
  appropriate for 8x interpolation) and the cached evidence.

## Confidence & caveats

- **Confidence: high** for the winner selection — it is the sole PASS and its capability declarations
  and execute path are verified in source.
- The gate is duration-preservation + smoke, NOT pixel-exact, so PASS proves a valid 240 fps MP4 with
  correct timeline and decodable frames, but does NOT validate interpolation pixel quality (by design;
  index SSIM is unsound here).
- All bench metrics are n=1 (mad=0, p95==median) — point estimates only; no spread/repeatability data.
- mediabunny's result is cached (staleness risk); peakMemory/decodeFps have 0 samples in the shard.
- The six NA results are honest capability gates: ffmpeg.wasm's fps>120 cap is explicit
  (adapter.ts:2191), the three parser/demuxer engines have no encoder, and the two WebCodecs-class
  engines (platform, remotion-webcodecs) simply do not declare the fps retiming feature.
