# transcode/h264_vfr_to_cfr_30

family: transcode | fixture asset: `fixtures/media/h264_vfr.mp4` (real, 2.3 MB) | primaryMetric: throughputRealtime | passCount: 2 of 7

VFR→CFR retime: source is H.264/AAC in MP4 with a variable frame timeline (`r_frame_rate=30/1` but `avg_frame_rate=1665/188 ≈ 8.86 fps`, 111 video packets over 12.533 s). The op re-encodes to a constant 30 fps H.264/MP4 (`opts.video = { codec:'h264', fps:30 }`). Per scenario notes, index-paired SSIM is unsound here (VFR/CFR timelines mis-pair frame-for-frame), so the hard gate is `property-invariant`/`transcode-output-metadata`, backed by a `playback-smoke` sanity check.

## Verdict

Best framework: **mediabunny@1.48.0** — CONTESTED (2 PASS: mediabunny, ffmpeg.wasm). Both passed the identical oracle set (`property-invariant` + `playback-smoke`) with equal correctness strength, so the decision falls to performance. Decisive factor: throughput/wall. mediabunny is **11.37x faster realtime** (17.01x vs 1.50x), **11.37x lower wall** (737 ms vs 8376 ms), and **11.37x higher encodeFps** (150.6 vs 13.25 fps) than ffmpeg.wasm. Margin caveat: n==1 per metric (no warmup-corrected spread), so the 11x gap is a single-sample point estimate — but the magnitude is far larger than any plausible run-to-run noise.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 736.92 ms | 17.007x | 0 (not sampled) | 4924 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | 8376.06 ms | 1.496x | 0 (not sampled) | 2152 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

mediabunny ran the conversion on the **WebCodecs hardware encoder path** (`env.configUsed.backend = "webcodecs"`, `hwAccel = "prefer-hardware"`, `pipeline = "streaming-lockstep"`, `wasmThreads = 0`, `coopCoep = "not-required"`). The adapter funnels the op through mediabunny's real `Conversion` API: `transcode()` builds a `ConversionOptions` (`src/engines/mediabunny/adapter.ts:1271-1310`), maps the requested fps to `ConversionVideoOptions.frameRate` (`adapter.ts:587` — `if (typeof v.fps === 'number') opts.frameRate = v.fps`), and drives `Conversion.init` → `conversion.execute()` (`runConversion`, `adapter.ts:842-855`). Conversion runs read→decode→encode→mux in lockstep; the VFR input timeline is normalized to a constant 30 fps cadence by the encoder during re-encode, which is exactly what this scenario probes. Crucially, `buildVideoOptions` pre-flights `VideoEncoder.isConfigSupported` before committing (`adapter.ts:621-653`), so the H.264 hardware encoder is confirmed available on this Apple M1 Max (ANGLE Metal) host — hence the GPU-backed encode at **encodeFps = 150.6** and **17.0x realtime**, finishing the 12.53 s clip in **736.92 ms**.

The gating oracle (`property-invariant`/`transcode-output-metadata`, `src/core/oracles.ts:3631-3708`) re-probes the produced bytes through the reference engine and compares against the requested output shape: container must be `mp4`, duration must stay within the re-encode band, and the video track's codec/fps must match. mediabunny's measured `durationDeltaSec = 0.1003 s` is within `durationToleranceSec = 0.15 s` — i.e. the VFR 12.533 s source was retimed to a CFR clip whose duration drifted only ~100 ms, well inside tolerance, with `videoTracks = 1`. The fps clause (`oracles.ts:3808-3812`) compares the probed `track.fps` against the requested 30 within `fpsTolerance`; the PASS confirms the output carries a coherent ~30 fps cadence rather than the source's ~8.86 fps average. `playback-smoke` (`oracles.ts:1572+`) additionally confirms a real `<video>` element decoded and rendered frames from the output — guarding against a structurally-valid-but-undecodable file.

ffmpeg.wasm produced an even tighter `durationDeltaSec = 0.000333 s` (better duration fidelity), so its correctness is at least as strong — it just paid a 11.37x throughput penalty. That gap is mechanistic: ffmpeg.wasm here is the **single-thread wasm core** (its adapter defaults to single-thread to dodge SharedArrayBuffer/COOP-COEP, per `src/engines/ffmpeg-wasm/adapter.ts:10-18`), so libx264 software-encodes every frame in WebAssembly with no GPU and no thread pool — 13.25 encodeFps, 1.50x realtime, 8.38 s wall. mediabunny's GPU encoder simply outclasses a single-thread software libx264 for this 1080p-class H.264 re-encode. (Note ffmpeg.wasm's lower longtasks of 2152 ms vs mediabunny's 4924 ms reflects wasm yielding the main thread more, but total wall is what matters and mediabunny dominates there.)

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost on speed: 8376 ms wall vs 737 ms (11.37x slower), 1.496x vs 17.007x realtime (0.088x), encodeFps 13.25 vs 150.6. Cause: single-thread wasm software libx264 with no hardware encode (`adapter.ts:10-18`). Correctness was actually marginally better (`durationDeltaSec = 0.000333 s` vs mediabunny's 0.1003 s) but both pass the same oracles, so performance decides.
- **platform@chrome-149** — NA_ENGINE, "does not declare feature 'fps'". Honest: the platform adapter declares `transcode` (via `<video>→canvas→MediaRecorder`, `adapter.ts:14`) but MediaRecorder cannot pin an exact constant output frame rate, so it correctly omits the `fps` retiming feature rather than fake it. Honest under-declaration, not a hidden capability.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "does not declare feature 'fps'". Honest: declares `transcode:true` (convertMedia reencode + resize + rotate, `adapter.ts:244`) but does not advertise constant-frame-rate retiming as a supported feature, so the runner negotiates NA for the `fps` gate. Genuine feature gap, not under-declaration of the op.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "does not declare operation 'transcode'". Honest: read-only parser, no codecs/muxer (`adapter.ts:7-10`), declares only probe + demux.
- **mp4box@2.3.0** — NA_ENGINE, "does not declare operation 'transcode'". Honest: box parser/remuxer with no encode (`adapter.ts:12, 630-636`); transcode requires re-encoding it cannot do.
- **web-demuxer@4.0.0** — NA_ENGINE, "does not declare operation 'transcode'". Honest: FFmpeg-wasm demux/probe only, no encode/mux (`adapter.ts:7-8`).

## Anti-cheat validation

- Scenario: `src/scenarios/transcode/index.ts:236-251` (`id: 'h264_vfr_to_cfr_30'`), `asset: 'h264_vfr.mp4'`, `opts.video.fps = 30`, `oraclesOverride: ['property-invariant','playback-smoke']`, `optsInvariant: 'transcode-output-metadata'`.
- Fixture: `fixtures/media/h264_vfr.mp4` exists, 2.3 MB, real H.264/AAC MP4 with a genuinely variable timeline (ffprobe: `r_frame_rate=30/1`, `avg_frame_rate=1665/188 ≈ 8.86`, 111 video frames, 12.533 s). Not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:3631-3708` (`transcode-output-metadata`) re-probes the actual output via the reference engine and checks container + duration band + per-track codec/fps (fps clause `oracles.ts:3808-3812`); `playback-smoke` at `oracles.ts:1572+` decodes real frames in a `<video>`. Measurements are physically plausible (durationDeltaSec 0.1003 s / 0.000333 s within 0.15 s tol; videoTracks=1).
- Winner adapter: `src/engines/mediabunny/adapter.ts:1271-1310` (`transcode`), fps→frameRate at `:587`, encoder pre-flight at `:621-653`, real `Conversion.init`/`.execute` at `:842-855`. No canned output, no input→output copy, no golden short-circuit, no swallowed errors (invalid conversions throw at `:849-853`).
- Verdict: **REAL**. Real VFR fixture, genuine GPU WebCodecs re-encode through mediabunny's Conversion API, and an oracle that re-probes the output and verifies container/duration/codec/fps plus live decode.
- Cached note: mediabunny's result has `cached==true` ("cached previous PASS result"), as does ffmpeg.wasm's — both numbers are reused, not freshly re-run. Per the launcher-seeding caveat, the 11.37x margin should be re-confirmed on a fresh run, though a gap this large is robust to staleness.

## Confidence & caveats

Confidence: high on the winner (REAL gate, real fixture, real GPU encode path, decisive 11.37x performance margin with comparable correctness). Caveats: (1) bench n==1 per metric — the 11x figure is a single-sample point estimate with mad=0/no spread, so it is weak as a precise number but overwhelming as a direction; (2) both PASS results are cached, so re-validation on a fresh run is advisable; (3) `property-invariant` is a structural/metadata gate, not bit-exact — appropriate here because index-paired SSIM is unsound for VFR→CFR retiming, but it does not verify per-frame pixel fidelity; (4) fps verification leans on the reference engine's probed `averagePacketRate`, which is a sound proxy for CFR cadence but not a direct PTS-cadence audit.
