# probe/huge_h264_1080p_600s

- **family:** probe
- **fixture asset(s):** `huge_h264_1080p_600s.mov` (448 MB, container `mov`, H.264 1920x1080@30 + AAC 48 kHz stereo)
- **primaryMetric:** wall (ms; lower better — no `opsPerSec` metric is declared on this case, only `wall`)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `remotion-webcodecs@4.0.479`
- **Contested:** YES — all 7 engines PASS the single gating oracle (`golden-metadata`) with identical correctness (`durationDeltaSec = 0`, 2 tracks matched). Correctness is a flat tie, so the decision falls to performance.
- **Decisive factor:** wall-clock median for the header probe. remotion-webcodecs finishes the probe in **8.160 ms** median, the fastest of the field.
- **Margin over runner-up:** vs `remotion-media-parser@4.0.479` (12.575 ms): **1.54x faster wall**. vs `mediabunny` (17.54 ms): 2.15x. vs the native `platform` path (1055.57 ms): **129x**. All samples are n=1 (mad=0), so the ordering is single-shot evidence — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 8.160 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 12.575 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 17.540 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 150.995 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 522.835 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 547.085 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 1055.570 | n/a | n/a | n/a | cached previous PASS result |

(The bench block for every engine contains only `wall`; no throughputRealtime / peakMemory / longtasks were recorded for this probe case, hence n/a.)

## Why the winner wins (deep technical)

The operation under test is a **metadata probe of a ~448 MB self-contained QuickTime (`mov`) file** carrying H.264 1080p video and AAC audio. The correctness gate (`golden-metadata`, `src/core/oracles.ts:595`) only checks header-derivable facts: container string, global `durationSec` within ±1 frame @24fps (≈0.0417 s), and per-track codec/dims/fps/sampleRate/channels positionally against `fixtures/golden/huge_h264_1080p_600s.mov.meta.json` (mov, 600 s, video h264 1920x1080 30fps, audio aac 48000/2). Every engine produced an exact match (`durationDeltaSec = 0`), so the gate cannot separate them — the entire scenario reduces to *how cheaply can each demuxer reach the `moov` and report its `mvhd`/`stsd`/`stts` fields without scanning the `mdat`.*

remotion-webcodecs' probe (`src/engines/remotion-webcodecs/adapter.ts:332`) calls `mp.parseMedia({ fields: { container, durationInSeconds, tracks, metadata } })` (`adapter.ts:346`). Requesting only those header fields — and crucially **not** attaching any sample callbacks — keeps media-parser in pure header-walk mode: it stops as soon as the `moov` (and its `mvhd` duration + `trak/stsd` track descriptions) has been consumed, never streaming the multi-hundred-MB `mdat`. The comment at `adapter.ts:327-330` makes the intent explicit: "`tracks` does not force a full decode pass; duration comes from the header where present." For this faststart-style `.mov` the `moov` is reachable from a front-of-file read, so the entire probe is a tiny byte read + box parse, landing at **8.160 ms**.

The reason it edges out its sibling `remotion-media-parser@4.0.479` (12.575 ms) despite both driving the *identical* media-parser `parseMedia` read path is the webcodecs adapter's declared `adapterFastPaths` (`env.configUsed`): `mp4-sample-table:http-range for selected large/progressive MP4/MOV demux rows` and a `compatible MOV->MP4 ftyp rewrite for the huge MOV copy row`. Its source-options layer issues range-scoped reads for large progressive MOV/MP4 inputs, so the header bytes are fetched with less I/O overhead than the plain `webReader` (`fieldsTier: metadata-only`) that remotion-media-parser uses. Both reach the same `moov`; the webcodecs path simply pays less per byte to get there. The gap is modest (1.54x) and on n=1 — see caveats — but consistent with the configured fast path.

Against the wasm/native field the win is structural, not incidental. ffmpeg.wasm (522.835 ms) must boot the wasm module and run `avformat_open_input`/`avformat_find_stream_info` through the Emscripten FS shim — orders of magnitude more setup than a JS box walk. mp4box (547.085 ms) is configured `whole-file-append(MP4BoxBuffer+fileStart)` with `rangeReads: false` (`env.configUsed`), i.e. it appends the file in buffer chunks and depends on the `moov` arriving before it can emit `onReady`; on a 448 MB file that append/parse loop dominates. The native `platform` path (1055.57 ms) sets up a full `webcodecs` decode/encode rig (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`) and reads duration via an HTMLMediaElement, which incurs element-load latency far exceeding a pure header parse. mediabunny (17.54 ms) and web-demuxer (150.995 ms) are both honest JS/wasm demux probes but neither matches media-parser's lean header-field request for this container.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, identical correctness. Lost on performance only: 12.575 ms vs 8.160 ms = **1.54x slower**. Same `parseMedia` read path but uses the plain `webReader` (`fieldsTier: metadata-only`) without the webcodecs adapter's HTTP-range sample-table fast path, so more I/O to reach the same `moov`.
- **mediabunny@1.48.0** — PASS, identical correctness. 17.54 ms = **2.15x slower** than winner. Pure-TS ESM demux (`coopCoep: not-required`), a clean honest probe but heavier per-probe than the media-parser header walk.
- **web-demuxer@4.0.0** — PASS, identical correctness. 150.995 ms = **18.5x slower**. wasm-backed (libav) demux; the wasm bridge dominates a job that JS box-parsers do in single-digit ms.
- **ffmpeg.wasm@0.12.15** — PASS, identical correctness. 522.835 ms = **64x slower**. Full FFmpeg wasm init + `find_stream_info`; vastly more machinery than a header probe needs.
- **mp4box@2.3.0** — PASS, identical correctness. 547.085 ms = **67x slower**. `whole-file-append` with `rangeReads: false` forces buffering toward the `moov` on a 448 MB file before `onReady`.
- **platform@chrome-149** — PASS, identical correctness. 1055.57 ms = **129x slower** (worst). Native WebCodecs/MediaElement rig with full decode/encode setup; HTMLMediaElement load latency swamps the probe.

No engine FAILed and none returned NA — the `probe` op + `mov`/`h264`/`aac` requirements are universally declared, so capability gating did not exclude anyone.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/probe/index.ts:290` (asset `huge_h264_1080p_600s.mov`, container `mov`, video `h264`, audio `aac`). Built into a golden-gated probe scenario at `index.ts:335-353` (`op: 'probe'`, `oracles: ['golden-metadata']`, `metrics: ['wall']`). Notes (`index.ts:294`): "huge bucket (~500-700 MB) self-contained big-read .mov. Probe reads header without scanning media." — matches the observed sub-20ms header-only behavior.
- **Fixture exists & is real:** `fixtures/media/huge_h264_1080p_600s.mov` present, **448 MB** — a genuine large binary, not synthetic/empty/mock. (Scenario notes label it a "synthetic" deterministic generator output, but it is a real, fully-formed `.mov` on disk, not a stub; golden metadata is plausible for it.)
- **Oracle:** `golden-metadata` at `src/core/oracles.ts:595-657`. Performs a real field-by-field comparison (container, duration ±1 frame, per-track codec/dims/fps/sampleRate/channels via `compareTrack` at `:659`) against `fixtures/golden/huge_h264_1080p_600s.mov.meta.json`. Golden values (mov, 600 s, 1920x1080 h264 30fps, aac 48000/2, bitrates 5.84 Mbps / 128 kbps) are physically plausible for a 448 MB 10-minute 1080p file. The gate is meaningful, not trivially satisfiable — a wrong duration, codec, or track count would FAIL.
- **Winner adapter:** `src/engines/remotion-webcodecs/adapter.ts:332` (`probe`), real `mp.parseMedia` call at `:346` with header-only fields. No canned output, no copy-input-to-output, no golden short-circuit, no error swallowing — it returns normalized library output.
- **Verdict:** **WEAK-GATE.** The implementation and fixture are real and the oracle is a genuine comparison, BUT the only gating oracle is `golden-metadata` (header/metadata-exact, the second tier of the ladder) — there is no decoded-frame/packet bit-exact gate. More importantly, every one of the 7 engines passes that gate identically (`durationDeltaSec = 0`), so the oracle provides **no correctness discrimination** for this case; the entire ranking is decided by a perf metric (`wall`) measured at **n=1**. The PASS is real but the competitive separation rests on a single-shot timing, not on correctness strength.
- **Cached note:** **ALL 7 engines have `cached: true`** ("cached previous PASS result"). No engine was re-run in this report; the timings and PASS verdicts are reused from prior runs. Per the launcher seeding caveat, stale-PASS reuse is a known risk — these numbers should be treated as last-known-good, not freshly observed.

## Confidence & caveats

- **Confidence: medium.** Correctness is unambiguous (all PASS, exact metadata match), and the winner's adapter and fixture/oracle are verified real. The *ranking*, however, is built entirely on perf.
- **n=1 everywhere** (every `wall` sample is a single measurement, `mad = 0`, `p95 = median`). A 1.54x margin over the runner-up on one shot is weak evidence; run-to-run jitter could plausibly reorder the top three (8.16 / 12.575 / 17.54 ms are all within an order of magnitude).
- **All results cached** — no fresh re-run in this report; staleness risk applies to both the PASS verdicts and the timings.
- The slow tier (web-demuxer / ffmpeg-wasm / mp4box / platform, 150 ms–1056 ms) is separated by margins large enough that jitter cannot reorder them relative to the fast JS demuxers — that part of the ranking is robust.
- The oracle does not exercise decode or packet correctness, so this case certifies only that each engine reads the `moov` correctly, not that it can decode the H.264 stream.
