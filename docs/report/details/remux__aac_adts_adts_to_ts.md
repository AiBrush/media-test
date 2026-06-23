# remux/aac_adts_adts_to_ts

- **family:** remux
- **fixture asset:** `aac_adts.aac` (fixtures/media/aac_adts.aac, 164 KB real ADTS AAC elementary stream; golden: container=adts, durationSec=10.031, 1 audio track AAC 48000 Hz / 2 ch / 130650 bps)
- **operation:** lossless remux ADTS AAC elementary stream -> single-program MPEG-TS (`options.container = 'ts'`)
- **primaryMetric:** wall (with throughputRealtime, peakMemory, longtasks secondary)
- **passCount:** 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (2 engines PASS with identical correctness evidence).
- **Decisive factor:** PERFORMANCE. Both passing engines satisfy the exact same gate (`reference-reimport`) with byte-for-byte-identical measurements (470 packets, 470 keyframes, 1 media track, durationDeltaSec 0.00433 << tolerance 1.50465), so correctness is a tie. mediabunny wins on the primary metric (wall median) and throughput.
- **Margin over runner-up (ffmpeg-wasm):** wall 7.285 ms vs 7.725 ms = **1.06x faster**; throughputRealtime 1376.94x vs 1298.51x = **1.06x higher**. Both samples are n==1 and `cached==true`, so the margin is thin/weak evidence (see caveats). Architectural tiebreaker reinforces mediabunny: pure-TS ESM core, `coopCoep: not-required`, no SharedArrayBuffer, far smaller bundle than the ffmpeg.wasm core.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 7.285 ms | 1376.94x | 30,015,466 B | 1901 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 7.725 ms | 1298.51x | 0 B (n=0, not sampled) | 1901 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |

## Why the winner wins (deep technical)

This is a pure container repacketization: the source is a raw AAC-LC elementary stream framed in ADTS (each access unit prefixed with a 7-byte ADTS header carrying profile/sampling-frequency-index/channel-config). The target MPEG-TS wraps those same AAC access units into 188-byte transport packets under a single program (PAT/PMT + one elementary PID, AAC carried in a PES stream). No sample data is re-encoded; the coded AAC bytes are preserved and only the framing changes. The gate therefore correctly tests *structural* integrity, not decode fidelity.

mediabunny performs a genuine mux. `remux()` (src/engines/mediabunny/adapter.ts:1244) builds the output format via `makeOutputFormat('ts', ...)` which returns a real `new MpegTsOutputFormat()` (src/engines/mediabunny/codecs.ts:172-173), opens the ADTS input with `openInput`, constructs an `Output` over an instrumented buffer target, and drives `runConversion` (adapter.ts:842) which calls `Conversion.init(opts)` then `conversion.execute()` (adapter.ts:848-855). `Conversion` demuxes the ADTS frames and remuxes the AAC access units into TS — a real library code path, not a byte copy. Because the AAC stream is audio-only with no B-frames and every audio access unit is independently decodable, the reference re-import sees all 470 packets as keyframes (`reimportKeyframes: 470 == reimportPackets: 470`).

The oracle that gates this scenario is `reference-reimport` (src/core/oracles.ts:1225), routed through the remux-specific `semanticRemuxReimport` (oracles.ts:1273) since `ctx.scenario.op === 'remux'`. It re-parses mediabunny's TS output with the reference engine and confirms: a non-empty packet table (470 packets), media-track layout matches golden (`reimportMediaTracks: 1 == goldenMediaTracks: 1`, both a single AAC audio track), and duration is preserved (`durationDeltaSec: 0.00433` against a generous `durationToleranceSec: 1.50465`). These numbers are physically plausible for a ~10.03 s, 48 kHz AAC stream (10.031 s / (1024 samples per AAC frame / 48000) ≈ 470 frames), confirming the remux is real and lossless at the access-unit level.

On the decisive performance axis, mediabunny used `backend: webcodecs`, `coreBuild: pure-ts-esm`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required` (env.configUsed). For this audio-only container rewrap no actual decode/encode happens, so the work is pure parsing + repacketization in JS/TS. mediabunny finishes in 7.285 ms wall / 1376.94x realtime versus ffmpeg.wasm's 7.725 ms / 1298.51x — a 1.06x edge. ffmpeg.wasm has to spin its emscripten/wasm filesystem (MEMFS write of the input, `-i ... -map 0 -c copy -muxdelay 0 -muxpreload 0`, MEMFS read of output; adapter.ts:2044-2065), paying VFS + wasm boundary overhead that the pure-TS mediabunny path avoids. mediabunny also reports a concrete peakMemory sample (30.0 MB) while ffmpeg did not sample peakMemory (n=0), but the architectural cost of the ffmpeg.wasm core (large wasm binary, COOP/COEP for threaded builds) is materially heavier, reinforcing the pick beyond the thin wall-clock margin.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed with identical correctness (reference-reimport:true, 470/470 packets/keyframes, same durationDelta), so it lost only on performance: 7.725 ms vs 7.285 ms wall (0.94x the speed of mediabunny) and 1298.51x vs 1376.94x throughput. Its remux is a genuine `-c copy` stream copy into TS with origin normalization, but the wasm/MEMFS round-trip adds overhead the pure-TS winner avoids. Honest loser, not a failure.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — remotion-media-parser is a parser/demuxer, it has no muxing/remux capability, so declining the `remux` op is correct (not an under-declaration).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — web-demuxer is demux-only (WASM ffmpeg demuxer surface); it produces packets, not containers, so it cannot emit a TS file.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'adts'". Honest — MP4Box.js parses ISO-BMFF (MP4/MOV/fragmented), not a raw ADTS AAC elementary stream; it has no ADTS demuxer, so it legitimately cannot read the input.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — the WebCodecs/Media platform surface offers decode/encode primitives but no container muxer, so there is no built-in remux path; declining is correct.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'ts'". Honest — remotion-webcodecs can mux to MP4/WebM but does not implement an MPEG-TS muxer; declining the `ts` output target is correct rather than a missing capability it actually has.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/remux/audio.ts:70-78 (case `asset: 'aac_adts.aac', from: 'adts', to: 'ts', audioCodecs: ['aac']`), built into id `remux/aac_adts_adts_to_ts` by `remuxId`/`buildRemux` in src/scenarios/remux/_shared.ts:73-104. Default oracle set is `['reference-reimport']` (_shared.ts:78-81). Notes document the rationale: wrap the AAC elementary stream into a single-program TS (MpegTsOutputFormat), lossless, covering the §A.3 MPEG-TS audio write target.
- **Fixture exists & is real:** `fixtures/media/aac_adts.aac` present, 164 KB — a real ADTS AAC capture, not synthetic/empty/mock. Golden `fixtures/golden/aac_adts.aac.meta.json` (container=adts, 10.031 s, AAC 48 kHz stereo 130650 bps) and a 53 KB `aac_adts.aac.packets.json` packet table back the re-import diff.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1244-1260 (remux) -> codecs.ts:172-173 (`new MpegTsOutputFormat()`) -> adapter.ts:848-855 (`Conversion.init` + `execute`). Genuine library mux. No canned/hardcoded bytes, no input->output copy, no short-circuit to the golden file, no error swallowing (invalid conversion throws at adapter.ts:849-853).
- **Oracle:** src/core/oracles.ts:1225 `referenceReimport` -> oracles.ts:1273 `semanticRemuxReimport`. It re-demuxes the produced TS with an independent reference engine and compares non-empty packet table + media-track layout + duration to golden. Not trivially satisfiable: empty packet tables fail (oracles.ts:1244-1245), track-count mismatch fails (oracles.ts:1289-1290). Measurements (470 packets, 470 keyframes, durationDelta 0.00433 s) are physically consistent with a 10.03 s 48 kHz AAC stream.
- **Cached note:** Both PASS results have `cached==true` ("cached previous PASS result") — reused from a prior run, NOT re-executed this run. Staleness risk: the thin 1.06x perf margin rests on cached n==1 samples; a fresh re-run could narrow or flip the wall-clock ordering (though the architectural tiebreaker would still favor mediabunny).
- **Verdict:** **REAL** — real fixture, real MpegTsOutputFormat mux via mediabunny's Conversion API, meaningful structural re-import oracle with plausible measurements. The gate is structural (not bit-exact / not decoded-PCM), which is appropriate for a lossless container rewrap but is correctness-medium strength, not the strongest ladder rung.

## Confidence & caveats

- **Confidence: medium.** Winner selection (mediabunny) is robust on the architectural tiebreaker, but the head-to-head margin is small.
- Correctness between the two PASS engines is a *true tie* — identical oracle, identical measurements — so the decision rests entirely on a 1.06x performance edge measured at **n==1** with **mad==0** (single sample, no spread) and **cached==true**. This is weak quantitative evidence for the speed claim.
- The gate is `reference-reimport` (structural/metadata-exact tier), not a bit-exact or decoded-PCM oracle. There is no decoded-audio-pcm oracle on this case, so "lossless at the access-unit level" is inferred from packet/track/duration preservation, not verified sample-by-sample.
- ffmpeg.wasm did not sample peakMemory (n=0), so the memory comparison is one-sided (mediabunny 30.0 MB vs unknown); the longtasks figure (1901 ms) is identical for both and likely a shared harness-bootstrap artifact, not remux-specific work.
