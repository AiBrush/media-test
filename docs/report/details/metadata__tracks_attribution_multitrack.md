# metadata/tracks_attribution_multitrack

- **family:** metadata
- **fixture asset:** `fixtures/media/h264_multitrack.mp4` (4.5 MB real MP4: 1× H.264 1280×720@30 video + 2× AAC 48 kHz stereo audio = 3 tracks)
- **primaryMetric:** wall (scenario declares `metrics: ['wall']`, no explicit primaryMetric → wall)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479`
- **Contested:** YES — all 7 engines PASS the single gating oracle `golden-metadata` with identical correctness (3 tracks attributed positionally, durationΔ within tolerance). Correctness is a flat tie, so the decision falls to performance.
- **Decisive factor:** lowest wall-clock probe latency. remotion-media-parser = **4.045 ms** median wall vs runner-up mediabunny **4.340 ms**.
- **Margin over runner-up:** **1.07× faster wall** than mediabunny (4.045 vs 4.340 ms; a razor-thin 0.295 ms gap). Against the rest the lead is large: 1.61× vs remotion-webcodecs (6.52 ms), 5.09× vs web-demuxer (20.57 ms), 5.43× vs ffmpeg.wasm (21.96 ms), 6.85× vs mp4box (27.70 ms), and 1484× vs platform (6000.57 ms). All measurements are n=1 (mad=0, p95=median), so the top-two ordering is low-confidence evidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 4.045 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 4.340 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 6.520 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 20.570 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 21.965 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 27.700 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 6000.575 | n/a | n/a | n/a | cached previous PASS result |

(The shard bench block carries only the `wall` metric for this probe scenario; throughputRealtime/peakMemory/longtasks were not collected, hence n/a.)

## Why the winner wins (deep technical)

This is a **probe** (header-parse) scenario on a faststart-ish MP4 carrying three multiplexed tracks. The gating oracle `golden-metadata` (src/core/oracles.ts:595) compares container, duration (±tolerance), and **per-track {type, codec, width/height, fps, sampleRate, channels} matched positionally** (compareTrack, src/core/oracles.ts:659). The golden (fixtures/golden/h264_multitrack.mp4.meta.json) demands exactly: track[0] video/h264/1280×720/30fps, track[1] audio/aac/48000/2ch, track[2] audio/aac/48000/2ch. Every engine produced this layout, so **correctness is a true 7-way tie** — `durationDeltaSec` is 0 for all engines except platform (0.0213 s, still inside the strict ±0.041666 s one-frame band). With correctness flat, the ranking is decided by wall latency per the decision procedure step 4(b).

remotion-media-parser wins because its probe path is a **pure-JS, metadata-tier, streaming header read** that requests the absolute minimum of fields. In `probe()` (src/engines/remotion-media-parser/adapter.ts:348) it calls `parseMedia` with `fields: { durationInSeconds, container, tracks, metadata, rotation }` only (adapter.ts:374-381) — it never decodes a sample, never builds a full sample table, and stops as soon as the moov/track headers are satisfied. `env.configUsed.fieldsTier` is `"metadata-only"`, `backend` is `"cpu-js"`, `pipeline` `"streaming"`, reader `"webReader"`. Parsing the `moov` (`trak`/`mdia`/`stsd` boxes) for 3 tracks is a few-KB read; at 4.045 ms it is essentially the cost of walking the box tree to the three `stsd` entries (avcC for H.264, esds/mp4a for the two AAC tracks) and reading `mdhd`/`tkhd` for duration and dims. The canonical track-index remap (adapter.ts:426-434, video<audio<other then trackId ascending) guarantees the positional order golden-metadata requires without re-reading the file.

mediabunny (4.340 ms) is the only engine within striking distance — also pure-TS ESM (`coreBuild: "pure-ts-esm"`, `backend: "webcodecs"` but for probe it is a header parse, not a decode). The 0.295 ms gap is within noise for an n=1, mad=0 sample; this win should be read as "statistically indistinguishable, remotion edged it." remotion-webcodecs (6.520 ms) is the same Remotion parser but wrapped in the webcodecs adapter with extra `bufferWriter`/worker-capable scaffolding (`streaming-backpressure` pipeline), adding ~2.5 ms of setup over the lean media-parser path.

The middle tier (web-demuxer 20.57 ms, ffmpeg.wasm 21.96 ms) pays the **wasm tax**: both must instantiate/feed a libav-based wasm core (`web-demuxer` ffmpeg-wasm-derived demuxer; `ffmpeg-wasm` ffprobe-equivalent) just to read headers — single-thread (`wasmThreads:0`), no SharedArrayBuffer — so even a header-only probe carries module-init + MEMFS file-staging overhead an order of magnitude above the JS parsers. mp4box (27.70 ms) is the slowest of the parsers because its `whole-file-append(MP4BoxBuffer+fileStart)` pipeline with `rangeReads:false` buffers the file through `appendBuffer` before its `onReady` fires the moov metadata — it cannot early-exit on the header the way a streaming reader can.

platform (6000.575 ms) is the catastrophic outlier: the platform adapter has no real header-parser, so to obtain track metadata it spins up a full `<video>`/WebCodecs decode pipeline (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`) and effectively plays/decodes the 10-second clip — a 1484× penalty for what should be a microsecond header read. It still PASSes (the metadata it eventually reports matches golden, durationΔ 0.0213 s), but it is the wrong tool for a probe.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on performance only: 4.340 ms vs 4.045 ms = 1.07× slower (0.295 ms gap, n=1 mad=0, effectively a tie).
- **remotion-webcodecs@4.0.479** — PASS, 6.520 ms = 1.61× slower than winner; same underlying Remotion parser but heavier webcodecs/backpressure adapter scaffolding (`streaming-backpressure`, `bufferWriter`) adds setup latency on a header-only op.
- **web-demuxer@4.0.0** — PASS, 20.570 ms = 5.09× slower; libav/wasm demuxer single-thread (`wasmThreads:0`) pays module-init + file-staging overhead to read headers.
- **ffmpeg.wasm@0.12.15** — PASS, 21.965 ms = 5.43× slower; full ffmpeg wasm core init for a probe; no threads, no SAB.
- **mp4box@2.3.0** — PASS, 27.700 ms = 6.85× slower; `whole-file-append` with `rangeReads:false` buffers the file before `onReady`, no streaming early-exit on the moov.
- **platform@chrome-149** — PASS but 6000.575 ms = 1484× slower; no native header parser, falls back to a full VideoDecoder/`<video>` decode of the clip just to enumerate tracks (durationΔ 0.0213 s, still within tolerance).

## Anti-cheat validation

- **Scenario definition:** src/scenarios/metadata/rotation-tracks.ts:113 (`id: 'metadata/tracks_attribution_multitrack'`), `op: 'probe'`, `input: 'h264_multitrack.mp4'`, oracle `['golden-metadata']`. Notes (lines 126-131) state the gate asserts track 0 = video, tracks 1/2 = the two AAC audio tracks each at its own index — a real positional-attribution check.
- **Fixture exists and is real:** `fixtures/media/h264_multitrack.mp4`, 4.5 MB. Not synthetic/empty/mock. Golden `fixtures/golden/h264_multitrack.mp4.meta.json` (585 B) declares the 3-track layout used by the oracle.
- **Oracle is meaningful, not trivial:** golden-metadata (src/core/oracles.ts:595-657) does a real field-by-field comparison: container string, duration within a strict per-frame band (±0.041666 s ≈ 1 frame @ 24fps floor), and per-track type/codec/width/height/fps/sampleRate/channels via compareTrack (src/core/oracles.ts:659-686). A track count mismatch, a merged/dropped/duplicated track, or wrong codec/sr/ch would FAIL. The measured `durationDeltaSec` values (0 for six engines, 0.0213 for platform) and `durationToleranceSec` 0.041666 are physically plausible for a 10 s clip. It is not a smoke gate and not a wide-open tolerance. (Caveat: language is NOT compared and true non-default track SELECTION is not tested — both documented as out-of-scope oracleGaps in the scenario notes; this makes the gate a genuine *attribution* check but not a *selection* check.)
- **Winner adapter is genuine:** src/engines/remotion-media-parser/adapter.ts:348-417 `probe()` calls the real `@remotion/media-parser` `parseMedia` (imported adapter.ts:70) with metadata-only fields and normalizes the returned tracks via a canonical index map (adapter.ts:426-434). No hardcoded output, no copy of the golden, no swallowed errors reporting success.
- **Cached note:** ALL 7 engine results have `cached: true` ("cached previous PASS result"). The numbers were reused, not re-run in this pass — staleness risk applies to the entire shard, and the top-two ordering (0.295 ms gap, n=1) is especially fragile to re-measurement.
- **Verdict:** **REAL** — real 4.5 MB fixture, real parseMedia implementation, meaningful positional-attribution oracle with plausible measurements.

## Confidence & caveats

- **Confidence:** medium. Correctness verdict (all 7 genuinely PASS a real oracle) is high-confidence. The *winner ranking* is low-confidence: remotion beats mediabunny by only 0.295 ms on n=1 samples (mad=0, p95=median), which is within measurement noise — these two are effectively tied and could swap on a re-run.
- All results are `cached: true`; not re-measured this run.
- Bench captured only `wall`; no throughputRealtime/peakMemory/longtasks to use as a tiebreaker.
- The oracle does not assert per-track language (all 'und' in golden) or true track selection — it is an attribution/order gate, which is the strongest gate expressible for this op per the scenario notes.
- Tiebreaker note: remotion-media-parser is pure CPU-JS with `coopCoep` not required and streaming reads — it also wins the secondary tiebreakers (no wasm, no COOP/COEP, streaming vs whole-file buffering) over the wasm engines and mp4box.
