# mux/prop_vfr_mux_duration_mp4_to_mp4

- family: mux | fixture asset: `fixtures/media/h264_vfr.mp4` (2.3 MB, H.264 720p VFR + AAC) | primaryMetric: wall | passCount: 3 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 3 of 7 engines PASS).
- **Decisive factor: performance.** All three passing engines satisfy the *same single* oracle (`property-invariant` / probe-duration) at the same tolerance band (0.25 s), so correctness strength is a tie. Wall-clock then decides: mediabunny 24.21 ms vs mp4box 54.13 ms vs ffmpeg-wasm 59.31 ms.
- **Margin over runner-up (mp4box):** 2.24x faster wall (54.135 / 24.210). vs ffmpeg-wasm: 2.45x faster wall (59.310 / 24.210). Caveat: mediabunny's peak memory 68.46 MB is the *highest* of the three (mp4box 53.56 MB; ffmpeg-wasm reported 0 bytes / n==0, i.e. unmeasured), and all benches are n==1 (mad==0), so the speed win is single-sample evidence.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass | 24.21 ms | n/a | 68,464,390 B | 2907 ms | cached previous PASS result |
| mp4box@2.3.0 | PASS | property-invariant:pass | 54.135 ms | n/a | 53,564,486 B | 4924 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 59.31 ms | n/a | 0 B (n=0) | 2152 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

(No bench exposes throughputRealtime for this scenario; primaryMetric is `wall`.)

## Why the winner wins (deep technical)

This row is a VFR-preservation test: `h264_vfr.mp4` carries irregular per-sample durations (nominal fps ≈ 8.856 per the golden meta) and the muxer must re-author those exact per-packet timestamps into a fresh MP4 sample table (`stts`/`ctts`). A muxer that assumes a constant cadence quantizes the timeline and the materialized container duration drifts. The gate `property-invariant` (invariant `probe-duration`, PROBE_DUR) probes the muxed output with the reference engine and compares against golden `durationSec = 12.533 s` with an explicit override tolerance `durationToleranceSec = 0.25 s` (oracles.ts:2709–2758).

mediabunny's measured drift is **Δ 0.1003 s** (`outDurationSec 12.6333` vs `goldenDurationSec 12.533`), comfortably inside the 0.25 s band. Mechanistically, the win is in two adapter code paths:
- `prepareMuxTracks` (src/engines/mediabunny/adapter.ts:1185–1240) drains the source via `EncodedPacketSink.packets(... verifyKeyPackets:true)` and records each packet's **real** `pkt.microsecondTimestamp` and `pkt.microsecondDuration` per chunk (lines 1206–1213). It does not synthesize a constant duration — the VFR cadence is captured exactly, then rebased to zero (line 1217).
- `mux` (src/engines/mediabunny/adapter.ts:1508–1600) feeds those chunks back through `EncodedVideoPacketSource` / `EncodedAudioPacketSource`, constructing each `EncodedPacket` with `c.ptsUs / 1e6` and `c.durationUs / 1e6` (lines 1562–1569). The H.264 `avcC` and AAC `esds` private data ride on the first packet's `decoderConfig.description` (lines 1571–1590), so mediabunny's `Mp4OutputFormat` emits a correct sample table with per-sample durations rather than a single nominal-fps entry.

The backend (env.configUsed) is `webcodecs` with `hwAccel: prefer-hardware`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`, pipeline `streaming-lockstep`. Critically, for an **identity mux** the WebCodecs decode/encode path is never engaged — coded packets are copied verbatim — so mediabunny pays only the cost of demux + a pure-TS MP4 writer with no WASM init and no worker spin-up. That is why it lands at 24.21 ms wall, ~2.2–2.5x ahead of the two heavier writers, while needing no COOP/COEP headers.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS but lost on speed: 54.135 ms wall (2.24x slower than mediabunny). Drift Δ 0.2337 s (`outDurationSec 12.7667`) — the largest of the three and nearly at the 0.25 s ceiling, indicating its pure-JS `whole-file-append` writer (config: `backend pure-js`, `wasmThreads 0`, `worker false`) materializes VFR durations less tightly. Highest longtasks too (4924 ms).
- **ffmpeg.wasm@0.12.15** — PASS but slowest: 59.31 ms wall (2.45x slower). Tightest drift Δ 0.0663 s (`outDurationSec 12.5993`), so its correctness is actually best, but correctness is a tie at this gate and wall decides. peakMemory unmeasured (n==0), so it cannot even claim a memory advantage. Single-thread WASM init/teardown dominates its cost.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: adapter declares `demux: true` only (src/engines/web-demuxer/adapter.ts:626), no mux op. It is a libav-backed demuxer, not a writer.
- **platform@chrome-149** — NA_ENGINE, honest: declares `demux: true` (src/engines/platform/adapter.ts:229); raw WebCodecs/MSE has no container-muxing primitive, so it cannot author an MP4.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest: declares `demux`/`remux` (adapter.ts:240,243) via `convertMedia`, but not a standalone `mux` from an EncodedTracks set. The scenario explicitly NAs engines that flatten to raw elementary streams.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: declares `demux: true` (adapter.ts:192); it is a parser, no write side.

## Anti-cheat validation

- **Scenario:** src/scenarios/mux/metamorphic.ts:120 (`id: 'prop_vfr_mux_duration_mp4_to_mp4'`), invariant PROBE_DUR, input `h264_vfr.mp4`, features `[VFR_MUX_TIMESTAMPS]`, explicit `tolerances.durationToleranceSec: 0.25`.
- **Fixture exists:** `fixtures/media/h264_vfr.mp4`, 2.3 MB real H.264+AAC VFR file (confirmed via stat). Golden `fixtures/golden/h264_vfr.mp4.meta.json` gives `durationSec 12.533`, codec h264 1280x720 fps 8.856 + aac 48 kHz — physically plausible VFR media, not synthetic/empty.
- **Oracle:** src/core/oracles.ts:2709–2758. Performs a *real* reference-engine `probe()` of the muxed output (line 2721) and compares absolute duration delta against golden; not trivially satisfiable. Measured deltas (0.0663 / 0.1003 / 0.2337 s) are plausible VFR rounding bands, and the 0.25 s tolerance is the scenario's explicit override, not a runaway-wide default.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1185–1240 (prepareMuxTracks) and :1508–1600 (mux). Genuine: drains real packets, preserves per-packet PTS/duration, feeds them through mediabunny's real `Output`/`EncodedVideoPacketSource`. No canned output, no input→output copy, no golden short-circuit, no swallowed errors.
- **Cached note:** mediabunny's result is `cached: true` ("cached previous PASS result"), startedAtIso 2026-06-22T17:13:39Z — reused, not re-run this session. mp4box and ffmpeg-wasm are also cached. Mild staleness risk: the speed ranking rests on cached n==1 benches.
- **Verdict: REAL.** Real fixture + real mediabunny mux implementation + a meaningful duration-comparison oracle against a real golden.

## Confidence & caveats

- Confidence: **medium**. Winner correctness/verdict are solid; the performance-based ranking is on n==1, mad==0 benches and all three results are cached, so the 2.2–2.5x wall margin is single-sample evidence.
- The win is performance-only — all three passing engines pass the identical (single) gate, which is a property/structural duration proxy, not a bit-exact frame gate. ffmpeg-wasm actually has the tightest duration drift (0.0663 s) and mp4box the loosest (0.2337 s, near the ceiling).
- mediabunny carries the highest peak memory (68.46 MB vs 53.56 MB for mp4box); if memory were primary, mp4box would lead among the two measured engines. ffmpeg-wasm peakMemory is unmeasured (n==0).
