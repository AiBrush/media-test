# transcode/h264_to_ts

family: transcode | fixture asset: `h264_1080p_30s.mp4` (fixtures/media/, ~31 MB, real) | primaryMetric: throughputRealtime (TC_METRICS) | passCount: 1 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** — **UNCONTESTED** (exactly one PASS).
- **Decisive factor:** mediabunny is the only engine that both *declares* the `transcode` operation AND declares `ts` (MPEG-TS) as an output container, and it actually produced a structurally valid TS file that re-probed back to the requested shape. Every other engine was screened out at capability-gating (NA) before any bytes were written; none failed an oracle — they simply never qualified to run.
- **Margin over runner-up:** not applicable for correctness — there is no second PASS. The closest competitor on capability, ffmpeg.wasm, *can* transcode but self-declared NA ("H.264 transcode to TS exceeds the browser-wasm suite budget"), so there is no head-to-head metric comparison. mediabunny's measured run: wall median **2684.0 ms**, throughput **11.18x realtime**, encodeFps **335.3 fps**, longtasks **403 ms**, peakMemory not sampled (n=0).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | property-invariant:pass | 2684.01 ms | 11.177x | n/a (n=0) | 403 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode not applicable: H.264 transcode to TS exceeds the browser-wasm suite budget |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a full re-encode of a 30 s 1080p H.264/AAC MP4 into an **MPEG-2 Transport Stream (TS)** container. TS is fundamentally different from MP4: instead of an `moov`/`mdat` box tree with a sample table, the elementary streams must be packetized into 188-byte TS packets carrying PES payloads, with the video written as **Annex-B** (start-code-delimited NAL units, SPS/PPS in-band) and AAC written as **ADTS** frames — exactly the "Annex-B/ADTS write path" the scenario notes call out (src/scenarios/transcode/index.ts:1254-1256). This is why the scenario gates with `property-invariant` only and deliberately omits SSIM/playback-smoke: raw TS bytes are not reliably decodable through a `<video>` element, so pixel/playback oracles would be unsound here (index.ts:1256).

mediabunny ran on `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`, `sharedArrayBuffer:false` (shard env.configUsed). The transcode path is genuine: `transcode()` builds an `OutputFormat` for `ts`, opens a fresh `Input`, attaches an instrumented `BufferTarget`, builds video+audio conversion options and a full-duration trim, then calls `runConversion` (src/engines/mediabunny/adapter.ts:1271-1322). `runConversion` does the real work via `mb.Conversion.init(opts)` → `conversion.execute()` (adapter.ts:842-868) — Conversion decodes the source through WebCodecs, re-encodes H.264, and muxes into the TS writer; it validates `conversion.isValid` and throws on discarded tracks rather than emitting an empty file. The performance signature confirms a real GPU-assisted re-encode rather than a copy: **encodeFps 335.3** and **11.18x realtime** for a 30 s clip in 2.68 s wall are consistent with hardware H.264 encode on the Apple M1 Max (ANGLE Metal renderer in env.gpu), and the small **403 ms** long-task total reflects the streaming-lockstep queueing keeping the main thread free.

The gating oracle `property-invariant` resolved to the `transcode-output-metadata` branch (oracles.ts:2650-2651 → `transcodeOutputMetadataInvariant`, oracles.ts:3626-3708). It re-probes the *actual produced output bytes* through the reference engine (oracles.ts:3641), then asserts: (1) container equals the requested `ts`; (2) duration delta within the TS-appropriate band; (3) the requested video track shape is present. The recorded measurements are physically plausible for this clip: `videoTracks: 1`, `durationDeltaSec: 0.0800 s` against `durationToleranceSec: 0.15 s` — i.e. the re-encoded TS duration landed within 80 ms of the 30 s source, well inside tolerance, and the probe found exactly one video track plus (per the PASS detail) "2 track(s)" total, matching the H.264+AAC output shape. That is a structural/metadata-exact pass on real re-probed bytes, not a smoke gate.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — NA_ENGINE (honest, deliberate).** It *can* transcode H.264 and *can* write TS, but the adapter explicitly screens this exact case: for `h264_1080p_30s.mp4` + h264 + container in {mkv, ts} it returns "H.264 transcode to TS exceeds the browser-wasm suite budget" (src/engines/ffmpeg-wasm/adapter.ts:867-873). This is a single-threaded wasm software re-encode budget guard, not an under-declared capability — the NA is honest. A real run would have been far slower than mediabunny's hardware path, so even had it run it would likely lose on performance.
- **platform@chrome-149 — NA_ENGINE (honest).** "engine does not declare output container 'ts'." The browser WebCodecs/`<video>` platform has no TS muxer; Chrome cannot author MPEG-TS natively. Correct, honest NA.
- **remotion-webcodecs@4.0.479 — NA_ENGINE (honest).** "engine does not declare output container 'ts'." Its WebCodecs-based writer set does not include a TS muxer. Honest NA.
- **mp4box@2.3.0 — NA_ENGINE (honest).** "engine does not declare operation 'transcode'." mp4box.js is an ISO-BMFF (MP4) box parser/segmenter with no encoder and no TS writer; it cannot transcode at all. Honest NA.
- **web-demuxer@4.0.0 — NA_ENGINE (honest).** "engine does not declare operation 'transcode'." It is a demux-only library (no encode/mux). Honest NA.
- **remotion-media-parser@4.0.479 — NA_ENGINE (honest).** "engine does not declare operation 'transcode'." A read-side parser only; no encode path. Honest NA.

All six non-winners are NA at capability gating, not FAILs; none produced wrong output. The single PASS is therefore uncontested by construction.

## Anti-cheat validation

- **Scenario:** src/scenarios/transcode/index.ts:1250-1257 (`h264_to_ts` case) generated at index.ts:1271-1296; oracle is `property-invariant` only for the `ts` target (index.ts:1272), input `h264_1080p_30s.mp4` (index.ts:1277), requested `container:'ts'`, `video.codec:'h264'`.
- **Fixture exists:** `fixtures/media/h264_1080p_30s.mp4`, ~31 MB real H.264/AAC MP4 (stat confirmed). Not synthetic/empty/mock.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1271-1322 (`transcode`) → src/engines/mediabunny/adapter.ts:842-868 (`runConversion` via `Conversion.init`/`execute`). Real library calls; no canned output, no input→output copy, no golden short-circuit; errors throw (`!conversion.isValid` → throw; missing buffer → throw). encodeFps 335.3 / 11.18x confirms an actual re-encode occurred.
- **Oracle:** src/core/oracles.ts:3626-3708 (`transcodeOutputMetadataInvariant`), dispatched at oracles.ts:2650-2651. It re-probes the produced bytes via the reference engine (oracles.ts:3641) and compares container + duration (Δ 0.080 s ≤ 0.15 s) + video track count (1). This is a real structural comparison against the requested output shape — not trivially satisfiable, and stronger than a smoke gate.
- **cached note:** mediabunny's result has `cached:true` ("cached previous PASS result"). The bench/oracle numbers were reused from a prior run, not re-executed in this pass — staleness risk applies. The measurements are internally consistent and physically plausible, but a fresh re-run would strengthen confidence.
- **Verdict: WEAK-GATE.** Implementation and fixture are real and the oracle is a genuine re-probe, BUT for the TS target the *only* gate is metadata/structure (container + duration + track count). There is no pixel-fidelity (SSIM/PSNR) or bit-exact frame check, so a structurally-correct-but-pixel-degraded re-encode could still pass. The PASS is real and meaningfully structural, just not a correctness-strong (bit-exact/perceptual) gate — by the scenario's own deliberate design, because raw TS is not decodable through `<video>`.

## Confidence & caveats

- **Confidence: high** that mediabunny is the correct, uncontested winner — it is the only engine declaring both `transcode` and `ts` output, all six others are honest capability NAs, and the adapter genuinely re-encodes.
- **Caveats:** (1) the win is uncontested, so no metric margin exists; (2) the gate is structural-only (WEAK-GATE) — no pixel/bit-exact verification of the TS payload; (3) `cached:true` means numbers were reused, not freshly measured; (4) peakMemory was not sampled (n=0), so memory cost of the TS write path is unknown; (5) ffmpeg.wasm's NA is a suite-budget choice, not an inability — under a larger budget it would contest on capability (though likely lose on performance to the hardware path).
