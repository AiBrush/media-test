# remux/h264_ts_ts_to_mov

family: remux | fixture asset: `h264_ts.ts` (fixtures/media/h264_ts.ts, 4,633,636 bytes, real MPEG-TS) | primaryMetric: wall | passCount: 2

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **CONTESTED** — two engines PASS (ffmpeg-wasm and mediabunny), both satisfying the identical single oracle (`reference-reimport`) with byte-for-byte identical measurements (770 packets, 480 keyframes, 2 media tracks, durationDelta 0.0057s < tol 0.1s). Correctness is therefore a dead tie; **performance is the decisive factor.**
- **Decisive factor: wall median (the scenario's primaryMetric).** ffmpeg-wasm is **1.17x faster wall** (114.07ms vs 132.99ms), **1.17x higher throughputRealtime** (87.85x vs 75.35x), and blocks the main thread far less: **longtasks 474ms vs 1361ms = 2.87x less main-thread blocking.** Both samples are n==1 (weak statistical evidence), so the margin is suggestive rather than robust.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | reference-reimport:true | **114.07** | **87.85** | 0 (n=0, not measured) | **474** | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 132.99 | 75.35 | 45,955,686 | 1361 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ts' |

## Why the winner wins (deep technical)

**The operation.** This cell rewraps H.264 video + AAC audio from an MPEG-TS elementary-stream container into a QuickTime (`mov`) ISO-BMFF container, with no re-encode. The hard part for TS→MOV is the **NAL framing rewrite**: MPEG-TS carries H.264 as Annex-B (each NAL preceded by a `00 00 00 01` start code, with SPS/PPS inline), while ISO-BMFF/QuickTime stores length-prefixed AVCC samples with the parameter sets hoisted into an `avcC` sample-entry box. The scenario notes (matrix.ts:83) flag exactly this: "TS->MOV: Annex-B -> AVCC into QuickTime; completes the TS<->MOV arm." Both winners must do this conversion losslessly (identical coded samples) plus build a fresh QuickTime `moov`/`stbl`/edit-list and re-stamp PTS/DTS off the TS PCR clock.

**ffmpeg-wasm's path (winner).** The remux is a genuine FFmpeg stream copy: `src/engines/ffmpeg-wasm/adapter.ts:2044` builds `[...inputOptions, '-i', in, '-map', '0', '-c', 'copy']`, and for the `mov` target appends `-movflags +faststart` (adapter.ts:2045-2050) so the `moov` atom is written first. FFmpeg's libavformat does the Annex-B→AVCC bitstream-filter conversion internally during the copy mux (no transcode), maps every input stream (`-map 0`, adapter.ts:2043) so the secondary AAC track survives, and writes a single MEMFS output that is read back at adapter.ts:2064. It first probes the input (`runInfo`, adapter.ts:2039) and asserts container compatibility (`assertRemuxContainerCompatible`, adapter.ts:2040) before muxing. Because libavformat runs as compiled wasm doing pure byte/box manipulation, it spends 114.07ms wall and only 474ms of long-task time. Per env.configUsed it is `webcodecs:independent` software code (no WebCodecs, single FFmpeg wasm instance), which is why its main-thread footprint is smaller than mediabunny's pipeline here.

**Why ffmpeg edged mediabunny.** mediabunny's remux (`src/engines/mediabunny/adapter.ts:1244-1260`) is also a real, lossless rewrap: it constructs an `mb.Output({ format, target })` and runs `runConversion(...)` with no codec options, which copies encoded samples (the capability declares `remux: true`, adapter.ts:1025). Its config (`env.configUsed`) is `backend: webcodecs`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm` — a pure-TypeScript demux/mux pipeline. For a structural rewrap of a 10s clip the two produce semantically identical output (the `reference-reimport` oracle sees the SAME 770 packets / 480 keyframes / 2 tracks from BOTH, proving identical media identity). The TS→MOV transform itself is not where they diverge; the gap is execution cost: mediabunny's pure-TS streaming-lockstep loop spends 132.99ms wall and **1361ms** of long-task time (2.87x ffmpeg's 474ms) iterating packets in JS, vs FFmpeg's compiled-wasm copy mux. On the primaryMetric (wall) and on main-thread responsiveness (longtasks) ffmpeg wins; mediabunny's only reported advantage is that it actually measured peakMemory (45.96MB) whereas ffmpeg's peakMemory sample is absent (n==0), so memory cannot be compared.

**Oracle evidence (real numbers).** The gating oracle re-imported each engine's MOV output with the reference engine (`referenceReimport`/`semanticRemuxReimport`, oracles.ts:1225-1324) and confirmed: reimportPackets 770, reimportKeyframes 480, reimportMediaTracks 2 == goldenMediaTracks 2, durationDeltaSec 0.005667 against durationToleranceSec 0.1. These are physically plausible for a 10.021s 720p30 clip (golden meta: 1280x720, 30fps H.264 + 48kHz stereo AAC): ~300 video frames over 10s plus AAC frames easily reaches ~770 packets, and 480 keyframes is consistent with a TS source carrying very frequent IDRs.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on performance: 132.99ms wall (0.86x of ffmpeg, i.e. ffmpeg 1.17x faster), 75.35x throughput vs 87.85x, and 1361ms longtasks vs 474ms (2.87x more main-thread blocking). Correctness identical (same oracle, same measurements). Pure-TS streaming-lockstep mux costs more CPU than FFmpeg's compiled-wasm `-c copy`.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — the Chrome built-in stack (WebCodecs + MediaSource) has no container-mux/remux primitive, so declining is correct, not under-declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — it is a read-only media parser/demuxer with no muxer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mov'". Plausible/honest — its converter targets MP4/WebM; QuickTime `mov` output is genuinely outside its declared `containersOut`.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — it is a demux-only wasm wrapper, no mux/remux path.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ts'". Honest — MP4Box.js parses ISO-BMFF only; it cannot ingest MPEG-TS, so it cannot be the source reader for a TS→MOV remux.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/matrix.ts:77-84` (RemuxCase `{ asset: 'h264_ts.ts', from: 'ts', to: 'mov', ... }`), built via `buildRemux`/`defaultOracles` in `src/scenarios/remux/_shared.ts:78-101`. Id derivation `remuxId` (_shared.ts:73) yields `remux/h264_ts_ts_to_mov`.
- **Fixture:** `fixtures/media/h264_ts.ts` EXISTS — 4,633,636 bytes, first byte `0x47` (MPEG-TS sync), FFmpeg-muxed; a real media file, not synthetic/empty/mock. Golden `fixtures/golden/h264_ts.ts.meta.json` confirms 10.021s, 1280x720@30 H.264 + 48kHz stereo AAC.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — genuine `-c copy` stream-copy remux with real MEMFS write/run/read; it probes (adapter.ts:2039) and asserts compatibility (adapter.ts:2040) and reads real output bytes (adapter.ts:2064). No canned output, no input->output copy, no golden short-circuit, no swallowed errors.
- **Oracle:** `src/core/oracles.ts:1225` (`referenceReimport`) → `1273` (`semanticRemuxReimport`). It re-demuxes the engine's actual output bytes with the reference engine and diffs media-track count, per-type layout, and duration against golden (oracles.ts:1289-1324). It is a real structural/metadata-exact comparison, not trivially satisfiable: an empty packet table fails (oracles.ts:1244-1245), track mismatch fails, and duration drift beyond max(band, 0.1s) fails. Measurements are plausible for real media.
- **Verdict: REAL.** Real fixture + real FFmpeg stream-copy implementation + meaningful structural re-import oracle. Note the oracle is structural/metadata-exact (track layout + duration + non-empty packet table), NOT bit-exact decoded-frame comparison (decoded-frames-bitexact is intentionally excluded from the default remux battery per _shared.ts:19); the PASS is strong-structural, not pixel-proven, but that is the documented design for lossless rewrap cells.
- **Cached note:** BOTH PASS results have `cached==true` ("cached previous PASS result"). Numbers were reused, not re-run this session — staleness risk applies to both engines symmetrically, so the relative ranking is unaffected, but the absolute timings (and especially the n==1 samples) should be re-measured for a hardened verdict.

## Confidence & caveats

- Confidence: **medium.** The winner is unambiguous on the primaryMetric (wall) and decisively better on longtasks, with identical correctness — but both bench samples are **n==1, mad==0** (single run), so the 1.17x wall margin is suggestive, not statistically robust. A 1.17x gap on a single sample could narrow under repeated runs; the 2.87x longtasks gap is large enough to likely survive.
- Both winners are `cached==true`; a fresh re-run is advisable per the launcher seeding caveat.
- ffmpeg's peakMemory was not captured (n==0), so the memory dimension is uncontested-by-absence; mediabunny's 45.96MB is the only data point and does not change the wall/longtasks-driven verdict.
- All NA_ENGINE declines (5 engines) look honest and capability-grounded (no muxer / no TS input / no mov output / read-only parser), not under-declared.
