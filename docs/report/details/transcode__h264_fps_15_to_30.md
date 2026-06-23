# transcode/h264_fps_15_to_30

family: transcode | fixture asset: `fixtures/media/h264_vfr.mp4` (H.264/AAC in MP4, VFR source) | primaryMetric: wall (throughputRealtime reported) | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Status: **CONTESTED** — two engines PASS (`mediabunny`, `ffmpeg.wasm@0.12.15`), both clearing the identical oracle pair (`property-invariant` + `playback-smoke`).
- Decisive factor: **performance**, since correctness strength is identical (same two oracles, both metadata-exact + smoke; no bit-exact/SSIM gate attached for this fps-interpolation case). mediabunny used the hardware WebCodecs backend; ffmpeg.wasm ran the single-thread libx264 wasm core.
- Margin over runner-up (ffmpeg.wasm): **13.43x faster wall** (717.20 ms vs 9630.11 ms), **13.43x higher realtime throughput** (17.47x vs 1.30x), **13.43x higher encodeFps** (154.77 vs 11.53 fps). Both n==1 (single timed sample, mad=0), so the magnitude is decisive even though sample count is low.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 717.20 ms | 17.47x | 0 (not sampled) | 2577 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | 9630.11 ms | 1.30x | 0 (not sampled) | 2577 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |

Notes: `peakMemory` has n==0 samples for both PASS engines (not measured this run), so it is not a usable tiebreaker. `longtasks` is identical (2577 ms) for both — this is a shared main-thread metric, not engine-discriminating here.

## Why the winner wins (deep technical)

This case is an **fps UP-conversion** from a variable-frame-rate H.264/AAC MP4 (`h264_vfr.mp4`) to a constant 30 fps H.264/AAC MP4 (scenario `src/scenarios/transcode/index.ts:597-611`). The op is genuine re-encode: changing frame cadence cannot be done by stream copy, both engines must decode every frame, resample the timeline to 30 fps, and re-encode H.264. The gating is by output metadata (container=mp4, video codec=h264, fps≈30 within tolerance, duration preserved) plus a playback smoke check — SSIM is deliberately omitted because the no-golden reference path pairs frames by index, which interpolation/cadence-shift would mis-score (scenario notes lines 591-594, 608-610).

mediabunny's path: the adapter maps the scenario `video.fps` into `ConversionVideoOptions.frameRate` (`src/engines/mediabunny/adapter.ts:587` — `if (typeof v.fps === 'number') opts.frameRate = v.fps;`), probes the H.264 encode config with `canEncodeVideo`/`VideoEncoder.isConfigSupported` before committing (passing the requested framerate through, line ~636), then runs the streaming-lockstep `Conversion.init`/`execute` pipeline (`src/engines/mediabunny/adapter.ts:848-855`). Per `env.configUsed` it ran `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false` — i.e. the **GPU/VideoToolbox-backed WebCodecs decoder+encoder on the Apple M1 Max** (ANGLE Metal renderer in env.gpu). That is why it hit **encodeFps 154.77** and **17.47x realtime** in 717 ms.

ffmpeg.wasm's path is correct but slow by construction: the adapter emits the fps change as a libavfilter `fps=fps=30` filter (`src/engines/ffmpeg-wasm/adapter.ts:2328`) and encodes with libx264 (`-c:v libx264 -pix_fmt yuv420p -preset veryfast`, lines 2437-2440), running `-threads 1` on the single-thread wasm core (line 2408; the adapter intentionally defaults single-thread to avoid SAB/COOP+COEP and threading instability — header comment lines 10-11). Software H.264 decode+scale+encode entirely in WebAssembly with no GPU offload yields **encodeFps 11.53** and only **1.30x realtime** — barely faster than playback. The 2577 ms of longtasks reflects the heavy synchronous wasm work blocking the main thread.

Oracle evidence (real, plausible numbers): both engines passed `property-invariant` ("transcode-output-metadata", `src/core/oracles.ts:3631-3707`) with `videoTracks: 1` and a duration delta inside the 0.15 s band — mediabunny `durationDeltaSec: 0.10033`, ffmpeg.wasm `durationDeltaSec: 0.00033`. ffmpeg's tighter duration match (0.3 ms vs 100 ms) is a marginal correctness edge, but both are well within tolerance so it does not change the metadata-exact verdict; performance is the deciding axis. The oracle genuinely checks container, codec, and fps (within `fpsTolerance`) via `compareRequestedTrack` (`src/core/oracles.ts:3805-3812`) by re-probing the produced bytes with the reference engine, so the PASS reflects a real H.264/30fps/MP4 output, not a copy of the input (input is 15→30, a copy would fail the fps check).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost on speed): correct H.264 fps re-encode via `fps=fps=30` + libx264, but single-thread wasm with no GPU — **13.43x slower wall** (9630 ms vs 717 ms), **11.53 vs 154.77 encodeFps**, **1.30x vs 17.47x realtime**. It did slightly better on duration fidelity (Δ0.00033s vs mediabunny's Δ0.10033s) but both pass, so this is not enough to overturn the performance gap.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: it is a parser/demuxer, not an encoder; no transcode capability is registered. Genuine NA.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: demux-only library; cannot encode. Genuine NA.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest: ISOBMFF box/remux tool with no codec encode path. Genuine NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "engine does not declare feature 'fps'". It does declare transcode but not the `fps` feature; this row requires `features: ['fps']`. Plausibly honest (no frame-rate-conversion path declared), though it is a WebCodecs-based transcoder so this is an under-declared capability candidate worth flagging rather than a hard limitation.
- **platform@chrome-149** — NA_ENGINE, "engine does not declare feature 'fps'". The raw WebCodecs/platform adapter declares transcode but not fps conversion. Same under-declaration note as remotion-webcodecs: the platform could in principle resample cadence, so this NA is capability-scoping, not a runtime block.

## Anti-cheat validation

- Scenario: `src/scenarios/transcode/index.ts:597-611` (`id: 'h264_fps_15_to_30'`, `asset: 'h264_vfr.mp4'`, `features: ['fps']`, `opts.video.fps: 30`, `invariant: 'transcode-output-metadata'`, `oraclesOverride: ['property-invariant','playback-smoke']`).
- Fixture: `fixtures/media/h264_vfr.mp4` EXISTS — 2.3 MB real H.264/AAC MP4 (stat confirmed). Not synthetic/empty/mock. A VFR source is the right input for an fps-up test.
- Oracle: `property-invariant` / "transcode-output-metadata" at `src/core/oracles.ts:3631-3707`; track comparison (codec/width/height/**fps within fpsTolerance**) at `src/core/oracles.ts:3805-3812`. It re-probes the produced output bytes with the reference engine and compares against the requested shape and source duration — a real comparison, not trivially satisfiable. Measurements are physically plausible (durationDeltaSec 0.0003–0.1003 s vs 0.15 s tol, videoTracks=1). SSIM omission is justified and documented (index-paired SSIM is unsound under interpolation).
- Winner adapter: mediabunny `src/engines/mediabunny/adapter.ts:587` (fps→frameRate), `:848-855` (real `Conversion.init`/`execute`). Uses the real mediabunny Conversion API + WebCodecs encoder; no canned output, no input→output copy (a copy would keep 15 fps and fail the oracle), no golden short-circuit, no error swallowing (`conversion.isValid` is checked and throws on invalid tracks, lines 849-853).
- Verdict: **REAL**. Real fixture, real WebCodecs transcode implementation, meaningful metadata-exact oracle that an input-copy or wrong-fps output would fail. The one caveat below tempers strength.
- Cached note: BOTH PASS engines have `cached: true` ("cached previous PASS result") — results were reused, not re-run this session, so the numbers carry mild staleness risk. Per the launcher-seeding caveat, a fully honest re-run would clear the cache; the 13.43x gap is large enough to survive cache noise, but treat the exact ms values as last-known rather than fresh.

## Confidence & caveats

- Confidence: **high** on the winner identity — the performance margin (13.43x on wall, throughput, and encodeFps) dwarfs any single-sample variance, and correctness is a genuine tie.
- Caveats: (1) both engines' results are cached (staleness). (2) n==1 timed sample each (mad=0, no spread), so absolute timings are point estimates. (3) Correctness gate is metadata-exact + smoke, not bit-exact/SSIM — appropriate for fps interpolation but means PASS proves "right container/codec/fps/duration + decodable", not pixel fidelity; this is a structural gate, not the strongest ladder rung. (4) `remotion-webcodecs` and `platform` NA on feature 'fps' look like capability under-declaration (both are WebCodecs-capable) rather than true runtime limits — worth revisiting if fps support is later added to those adapters.
