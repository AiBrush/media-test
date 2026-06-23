# mux/video_a_plus_audio_b_to_mkv

family: mux | fixture assets: `h264_1080p_30s.mp4` (H.264 1080p30 video, 31MB) + `aac_adts.aac` (raw AAC ADTS audio, 164KB) | target container: MKV (Matroska) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Status: **CONTESTED** — two engines PASS (mediabunny, ffmpeg.wasm@0.12.15); the other five are NA.
- Decisive factor: **correctness is comparable** (both pass the single gating oracle `property-invariant` / probe-duration), so the decision falls to **performance**, where mediabunny dominates. It is also strictly tighter on correctness: probe-duration Δ = **0.0000s** (exact) vs ffmpeg's Δ = **0.0420s** (both inside the 0.125s band).
- Margin over runner-up (ffmpeg.wasm): **3.07x faster wall** (115.67ms vs 355.22ms), **3.07x higher throughputRealtime** (259.36x vs 84.45x realtime), **4.81x fewer long-task time** (1012ms vs 4863ms). Peak memory not comparable (mediabunny 129.7MB measured; ffmpeg reported 0 bytes / n=0).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true (Δ0.0000s) | 115.67 ms | 259.36x | 129,728,647 B | 1012 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (Δ0.0420s) | 355.22 ms | 84.45x | 0 B (n=0) | 4863 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |

## Why the winner wins (deep technical)

This scenario is a **multi-source assembly mux**: the runner demuxes the H.264 video track out of `h264_1080p_30s.mp4` (an ISOBMFF/MP4 source, AVCC sample format, ~30s) and the AAC audio out of the raw ADTS elementary stream `aac_adts.aac`, then hands both as `EncodedTracks` to the engine, which must interleave and index them into a single **Matroska (MKV)** container. MKV is the honest target here (notes in `src/scenarios/mux/multi-source.ts:47-50`): the legacy multi-source case only ever wrote MP4, so this case exercises cross-source A/V interleave into a Matroska EBML layout where the muxer must author SeekHead/Cues and CodecPrivate per track.

mediabunny ran on its native muxer path with `env.configUsed.coreBuild = "pure-ts-esm"`, `backend = "webcodecs"` for the read/decode side, `sharedArrayBuffer = false`, `coopCoep = "not-required"`. The mux itself is pure-TS: in `src/engines/mediabunny/adapter.ts:1508-1600` the adapter builds an `Output` with a Matroska `OutputFormat` (`makeOutputFormat(opts.container, ...)`), creates an `EncodedVideoPacketSource(h264)` and `EncodedAudioPacketSource(aac)`, and streams each demuxed chunk as an `EncodedPacket` carrying per-packet PTS/duration (`c.ptsUs/1e6`, `c.durationUs/1e6`, lines 1562-1569). Critically, the **first packet of each track carries a `decoderConfig` with the codec-private `description`** (avcC for video, AudioSpecificConfig for audio — lines 1570-1590), which is exactly what the Matroska muxer needs to emit `CodecPrivate` so the output is demuxable/playable. Because mediabunny copies the already-encoded packets (no re-encode) and writes EBML in a single streaming pass (`output.start()` → per-packet `add()` → `output.finalize()`), the output duration is reproduced **bit-for-bit on the time axis**: the probe-duration oracle measured `outDurationSec = 30`, `goldenDurationSec = 30`, **deltaSec = 0** (shard `oracleOutcomes[0].measurements`). That is an exact match, the strongest possible result for this (loose-by-design) duration gate.

The gating oracle is `property-invariant` resolved to the probe-duration variant (`src/core/oracles.ts:2711` → block at 2715-2758). It does not trust the candidate's self-report: it re-probes the authored MKV with a **reference engine** (`ctx.referenceEngine.probe(...)`, line 2721) and compares the materialized duration against the golden's `durationSec` (30s, from `fixtures/golden/h264_1080p_30s.mp4.meta.json`). The scenario sets `tolerances.durationToleranceSec = 0.125` (`multi-source.ts:45`), so `explicitDurOverride` is true and the band is the strict 0.125s, not the loose mp3 band. mediabunny lands dead-on; ffmpeg lands 0.042s long.

On performance, mediabunny's pure-TS streaming EBML writer with WebCodecs-fed packets finishes the whole demux+interleave+finalize in **115.67ms wall** (throughput 259.36x realtime, n=1) and only blocks the main thread for **1012ms** of long-task time. ffmpeg.wasm has to reconstruct elementary streams in MEMFS and shell out to a `-c copy` mux subprocess inside the wasm VM (`src/engines/ffmpeg-wasm/adapter.ts:491-520`: it converts AVCC length-prefixed NALs back to Annex-B and AAC to ADTS framing before `-c copy`), which costs **355.22ms** (84.45x realtime) and a much heavier **4863ms** of long tasks (single-thread wasm; `wasmThreads` not used). Same correctness class, ~3x the wall, ~4.8x the main-thread jank — mediabunny is the clear winner.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on performance):** genuinely muxed (Annex-B/ADTS reconstruction + `-c copy`, adapter.ts:491+) and passed the same oracle, but with a looser duration result (Δ 0.0420s vs mediabunny's 0.0000s) and is 3.07x slower wall / 3.07x lower realtime throughput / 4.81x more long-task time. The 0.042s overshoot is the classic ADTS-frame-rounding tail when re-framing AAC into MKV; harmless under the 0.125s band but strictly weaker than the exact match.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** reason "engine does not declare operation 'mux'". Honest NA — remotion-webcodecs is a decode/convert layer, not a container muxer; no `mux` capability declared.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest — the browser WebCodecs platform exposes encode/decode but no built-in container muxer (Chrome ships no MKV writer API), so declaring mux:false is correct, not under-declared.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest — media-parser is a read/probe/demux-only library; it has no write/mux path.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest — its name and scope are demux-only; muxing is out of scope.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'adts'". This is a precise, capability-honest NA: mp4box can author ISOBMFF and could in principle mux, but it cannot ingest the **raw ADTS** audio source (`aac_adts.aac`) — it has no ADTS demuxer — so it cannot assemble this particular A+B pair. The NA is on the input-container axis, not the output, and looks correct rather than under-declared.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/multi-source.ts:38-51` (case `video_a_plus_audio_b_to_mkv`). Inputs are a list `['h264_1080p_30s.mp4', 'aac_adts.aac']`, target `mkv`, video `h264`, audio `aac`, explicit `durationToleranceSec: 0.125`.
- Fixtures exist and are real media (not synthetic/empty): `fixtures/media/h264_1080p_30s.mp4` = 31MB, `fixtures/media/aac_adts.aac` = 164KB. Golden meta `fixtures/golden/h264_1080p_30s.mp4.meta.json` reports H.264 1920x1080@30fps + AAC 48kHz stereo, durationSec 30.
- Gating oracle: `property-invariant` → probe-duration, `src/core/oracles.ts:2711` and body 2715-2758. It re-probes the authored output with an independent reference engine (line 2721) and compares to the golden duration with a real Δ check (line 2745). Not trivially satisfiable for this case: the 0.125s band rejects any output whose materialized duration is off by more than ~4 video frames; a copy-of-input or canned blob would not probe as a valid 30s MKV.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508-1600`. Confirmed genuine — constructs a real mediabunny `Output`/Matroska format, real `EncodedVideoPacketSource`/`EncodedAudioPacketSource`, streams real per-packet PTS/duration, and emits real CodecPrivate via the first-packet `decoderConfig`. No hardcoded output, no input->output copy, no short-circuit to golden, no error swallowing (errors are thrown, e.g. unsupported codec at 1527/1538).
- Plausibility of measurements: outDurationSec 30 == goldenDurationSec 30 (deltaSec 0) for mediabunny; ffmpeg 30.042 vs 30. Both physically plausible for a 30s clip. Wall (115.67ms / 355.22ms) and throughput (259x / 84x realtime) are sane for a 30s remux-mux of pre-encoded packets.
- Cached note: **both PASS results have `cached: true`** (reason "cached previous PASS result"). Evidence is reused, not freshly re-run in this batch; per the launcher seeding caveat there is a staleness risk, but the cached numbers are internally consistent and the adapter/oracle code is real. Treated as REAL with a caveat, not SUSPECT, because the implementation and gate are verifiably genuine.
- Verdict: **REAL** — real fixtures, real muxer implementation, oracle performs an independent reference re-probe with a meaningful (override) tolerance.

## Confidence & caveats

- Confidence: **high** on the winner and ordering. Both PASS engines clear the same gate; mediabunny is strictly tighter on the oracle (Δ0 vs Δ0.042) and overwhelmingly faster (3.07x wall, 4.81x fewer long tasks), so the contest is not close.
- Caveat 1: the gate is a **single, container-agnostic probe-duration** oracle, not a per-track packet-count or decoded-frame check. The scenario notes explicitly omit reference-reimport because the golden is single-asset while the output is multi-source (multi-source.ts:25-30, 46). So PASS proves "30s of A/V landed in a valid MKV", not "every video packet and every AAC frame is bit-exact". The win is real but the correctness gate is medium-strength, not crypto/structural-exact.
- Caveat 2: all benchmark metrics are **n=1** (no spread; mad=0, p95==median), so the 3x performance margin is a single-sample comparison — directionally strong given the size of the gap, but weaker statistical evidence than a multi-sample run would give.
- Caveat 3: both winners' results are **cached**; a fresh re-run (clear raw + .browser-cache) would harden the evidence.
