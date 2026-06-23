# performance/size-ladder-extract-metadata-huge

- **family:** performance
- **fixture asset:** `huge_h264_1080p_600s.mov` (real 448 MB QuickTime MOV, H.264 1080p30 + AAC 48k stereo, 600 s)
- **primaryMetric:** opsPerSec (rank by ops/sec; wall as secondary)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (all 7 engines PASS the single gating oracle `golden-metadata`).
- **Decisive factor:** Pure performance. Correctness is a tie (every engine satisfies the identical `golden-metadata` structural check: container `mov`, duration 600 s within ±0.0417 s, 2 tracks h264 1920x1080@30 + aac 48000/2). With correctness comparable, ranking falls to `primaryMetric` opsPerSec / wall median.
- **Margin over runner-up:** mediabunny 145.99 ops/s @ 6.85 ms wall vs runner-up remotion-webcodecs 119.90 ops/s @ 8.34 ms wall = **1.22x higher throughput, 1.22x lower wall** (8.34/6.85 = 1.22). Both crush the whole-file-buffering engines (mp4box 1.63 ops/s, ffmpeg.wasm 1.07 ops/s, platform 1.05 ops/s) by ~90-140x. NOTE: n==1 per engine (no warmup repeats; mad/p95 == median), so the ~22% gap over the runner-up is single-sample evidence and is weaker than the 90x+ gap over the buffering engines.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 6.85 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 8.34 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 14.42 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 80.11 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 612.79 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 931.17 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 951.76 | n/a | n/a | n/a | cached previous PASS result |

(This scenario declares metrics `opsPerSec` + `wall` only — throughputRealtime/peakMemory/longtasks are not collected for the extract-metadata ladder, hence n/a. opsPerSec: mediabunny 145.99, remotion-webcodecs 119.90, remotion-media-parser 69.35, web-demuxer 12.48, mp4box 1.63, ffmpeg.wasm 1.07, platform 1.05.)

## Why the winner wins (deep technical)

The operation is `probe` (extract-metadata) on a **448 MB progressive QuickTime `.mov`** carrying H.264 1080p30 video + AAC-LC 48 kHz stereo, 600 s long. The only correctness obligation is the structural `golden-metadata` oracle (`src/core/oracles.ts:595`), which compares container token, duration within a per-frame tolerance (±0.0417 s ≈ 1 frame at 30 fps), and per-track codec/dimensions/fps/sampleRate/channels against `fixtures/golden/huge_h264_1080p_600s.mov.meta.json`. Every engine produces the correct answer, so the contest is entirely about *how cheaply* each engine can extract the header without touching the 448 MB of `mdat` sample payload.

mediabunny wins because its probe is a pure header read. `probe()` (`src/engines/mediabunny/adapter.ts:1134`) opens a `BlobSource`-backed `Input` and calls `metadataFromInput()` (`adapter.ts:417`). The decisive line is the duration path at `adapter.ts:427-433`: it calls `input.getDurationFromMetadata()` FIRST, which reads the declared duration straight out of the QuickTime `mvhd` box, and only falls back to the expensive `computeDuration()` sample-table walk if metadata yields null (`adapter.ts:434-441`). For this `.mov` the `mvhd` carries duration 600 s, so the fallback never fires — no `stts`/`stsz` traversal, no `mdat` read. Tracks are read via `getTracks()` (`adapter.ts:443`) which parses `stsd`/`stsc` codec descriptors only. The result: a **6.85 ms** wall to fully characterize a 448 MB file, i.e. it reads kilobytes of `moov` and ignores the payload. The MOV is faststart-friendly here (cheap metadata path succeeds), so mediabunny pays only container-parse cost. Its `pure-ts-esm` core needs no COOP/COEP and no WASM, so there is zero module-instantiation tax on the hot path (`env.configUsed.coopCoep: "not-required"`, `wasmThreads: 0`).

The runner-up, remotion-webcodecs (119.90 ops/s, 8.34 ms), uses the same class of lazy streaming parser (`env.configUsed.reader: webReader`, `fieldsTier: metadata-only`, `pipeline: streaming-backpressure`) and is only ~22% slower — both are header-only parsers, the gap is parser/allocation overhead, not algorithm. remotion-media-parser (69.35 ops/s, 14.42 ms) is third — also a streaming `cpu-js` metadata-only reader, ~2.1x slower than mediabunny, again header-only but with more per-call overhead. web-demuxer (12.48 ops/s, 80.11 ms) is an order of magnitude slower: it routes through an ffmpeg-derived WASM demuxer whose `avformat_open_input` does more probing work than a targeted box reader.

The three slow engines (mp4box 1.63 ops/s @ 612.79 ms, ffmpeg.wasm 1.07 @ 931.17 ms, platform 1.05 @ 951.76 ms) are ~90-140x slower because they do NOT do a pure header read. mp4box's config shows `pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"` and `rangeReads: false` — it appends the entire 448 MB file before it will report `onReady`, so the wall is dominated by buffering/copying ~448 MB through the JS heap. ffmpeg.wasm must instantiate the wasm module and feed the file through the emscripten FS / libavformat probe. platform (`<video>` element + WebCodecs) must hand the blob to the media element and wait for `loadedmetadata`, which for a 448 MB MOV involves the browser's own demuxer ingesting a large prefix. They all reach the same correct metadata — they just pay full-buffer cost to get it.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, lost on perf. Same header-only strategy as the winner but 1.22x slower (119.90 vs 145.99 ops/s; 8.34 vs 6.85 ms). Pure parser-overhead gap; correctness identical.
- **remotion-media-parser@4.0.479** — PASS, lost on perf. Streaming `cpu-js` metadata-only reader, 2.1x slower (69.35 ops/s, 14.42 ms). Header-only but heavier per-call overhead.
- **web-demuxer@4.0.0** — PASS, lost on perf. ~11.7x slower than winner (12.48 ops/s, 80.11 ms): ffmpeg-WASM `avformat` probe path is far heavier than a targeted box parse.
- **mp4box@2.3.0** — PASS, lost on perf badly. `whole-file-append`, `rangeReads:false` → buffers all 448 MB before reporting metadata. 89x slower (1.63 ops/s, 612.79 ms).
- **ffmpeg.wasm@0.12.15** — PASS, lost on perf badly. WASM instantiation + libavformat full-probe over the FS. 136x slower (1.07 ops/s, 931.17 ms).
- **platform@chrome-149** — PASS, lost on perf badly. `<video>`/WebCodecs `loadedmetadata` over a 448 MB blob. 139x slower (1.05 ops/s, 951.76 ms).

No engine FAILed and none is NA — the op (`probe`) and the MOV/h264/aac capability are declared by all 7, which is honest for a metadata-extract.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/size-ladder.ts:69-83` (generated via `perfCase`, id template line 71; `huge` rung at line 53). op=`probe`, input=`LADDER.huge`, oracles=`['golden-metadata']`, primary=`opsPerSec`, timeout `T_HUGE` (300 s).
- **Fixture exists & is real:** `LADDER.huge = 'huge_h264_1080p_600s.mov'` (`src/scenarios/performance/_shared.ts:80`). `ls fixtures/media/huge_h264_1080p_600s.mov` → **448 MB**, real QuickTime MOV. Not synthetic/empty/mock.
- **Golden exists & is plausible:** `fixtures/golden/huge_h264_1080p_600s.mov.meta.json` (430 B): container `mov`, durationSec 600, video h264 1920x1080@30 bitrate ~5.84 Mbps, audio aac 48000/2 ~128 kbps, tag `major_brand: "qt  "`. Physically consistent with a 600 s 1080p H.264 clip at ~448 MB. NOTE: the source-file header comment in size-ladder.ts (lines 21, 53, 80) says the huge golden was "NOT baked → NA until bake" — but the golden meta/packets files were since baked (dated 3 days ago), so the comment is stale and the now-real PASS is legitimate, not fabricated.
- **Oracle is meaningful:** `goldenMetadata` at `src/core/oracles.ts:595-657` performs a real field-by-field comparison (container string match, duration delta vs ±1-frame tolerance, per-track codec/width/height/fps±/sampleRate/channels via `compareTrack` at `oracles.ts:659`). Not trivially satisfiable — a wrong container, wrong duration, or wrong track shape FAILs. The reported `durationDeltaSec: 0` against tol `0.0417` is exact and plausible (declared mvhd duration matches the golden exactly).
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts:1134` (`probe`) → `metadataFromInput` (`adapter.ts:417`) → cheap `getDurationFromMetadata()` then `getTracks()` (`adapter.ts:429,443`). Calls the real mediabunny `Input`/`BlobSource` API, reads the actual MOV boxes, disposes the input. No canned output, no copy of golden, no error-swallowing-as-success (errors set duration null and fall back to a real scan).
- **cached note:** ALL 7 entries have `cached: true` ("cached previous PASS result"). The numbers were reused, not re-run this session — staleness risk noted (per the launcher seeding caveat, stale PASS reuse is possible; a fresh run would re-time). The relative ordering is consistent with the architectural backends, so the ranking is credible, but absolute ms figures are from a prior run.
- **Verdict:** **REAL** — real 448 MB fixture, real header-parsing implementation, real structural oracle with exact/plausible measurements. Only caveats: all-cached evidence and n==1 sampling.

## Confidence & caveats

- **Confidence:** medium. Correctness gate is real and the winner's mechanism (cheap mvhd duration + box-only track read) cleanly explains the 6.85 ms wall and the ~90-140x lead over whole-file-buffering engines.
- **Caveats:** (1) All results `cached:true` — not re-run this session; absolute timings could drift. (2) `n==1`, no warmup repeats, mad==0/p95==median → the ~22% margin over remotion-webcodecs is single-sample and not statistically robust; the 90x+ margins over mp4box/ffmpeg/platform are large enough to be safe regardless. (3) The gate is structural metadata only (not bit-exact decode) — appropriate for a metadata-extract op, but it does not exercise sample-level correctness. (4) Stale source-comment in size-ladder.ts claims this rung is NA-until-bake; the golden has since been baked, so the PASS is valid despite the comment.
