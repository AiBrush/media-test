# probe/tiny_h264_360p_2s

family: probe | fixture asset: tiny_h264_360p_2s.mp4 (H.264 video + AAC audio in MP4) | primaryMetric: wall (ms) | passCount: 7/7

## Verdict

- Best framework: mediabunny@1.48.0
- Contested: YES (all 7 engines PASS the single gating oracle `golden-metadata`)
- Decisive factor: PERFORMANCE. Correctness is identical across all 7 (every engine passes the same metadata oracle with durationDeltaSec=0). mediabunny has the lowest wall median, 3.275 ms.
- Margin over runner-up: 1.13x faster than remotion-media-parser (3.715 ms). Larger margins downstream: 1.49x vs remotion-webcodecs (4.875 ms), 1.81x vs mp4box (5.94 ms), 2.86x vs ffmpeg.wasm (9.37 ms), 6.88x vs web-demuxer (22.52 ms), 10.24x vs platform (33.55 ms).
- Strength caveat: this is a metadata-only probe; the gate is structural-metadata, not bit-exact. Every wall sample is n=1, mad=0, and cached==true (reused, not freshly re-run), so the performance ranking is weak evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 3.275 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 3.715 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 4.875 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:true | 5.940 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 9.370 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 22.520 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 33.550 | n/a | n/a | n/a | cached previous PASS result |

All engines: bench carries only the `wall` metric (n=1, warmup=1, mad=0, p95==median). throughputRealtime / peakMemory / longtasks were not recorded for this probe scenario.

## Why the winner wins (deep technical)

The operation is a pure container probe: open `tiny_h264_360p_2s.mp4` (a ~173 KB faststart MP4 holding one H.264 video track at 640x360@30 and one AAC track at 48000 Hz / 2ch) and report normalized metadata. The gating oracle `golden-metadata` (src/core/oracles.ts:595) compares container string, duration within a strict ±1-frame band (durationToleranceSec = 0.04166s ≈ 1/24), and per-track codec/dims/fps/sampleRate/channels against fixtures/golden/tiny_h264_360p_2s.mp4.meta.json. Every engine reports durationDeltaSec=0 (golden durationSec=2.0, measured exactly 2.0) and the full 2-track set (video h264 640x360@30, audio aac 48000/2). Because the oracle outcome is binary-identical across all 7, correctness cannot separate them — the tie breaks on wall time.

mediabunny wins on wall because its adapter reads metadata via the cheap header path and never scans samples. In src/engines/mediabunny/adapter.ts, `metadataFromInput` (adapter.ts:417) calls `input.getFormat()` (adapter.ts:418), then resolves duration with `getDurationFromMetadata()` FIRST (adapter.ts:427-433) and only falls back to the precise `input.computeDuration()` scan (adapter.ts:434-440) when metadata yields null. For a faststart MP4 the moov/mvhd carries the duration directly, so the cheap path returns 2.0 s immediately and the full-sample walk is skipped. Tracks come from `input.getTracks()` (adapter.ts:443), reading the stsd/stsz/mdhd boxes already parsed during `getFormat()`. The source is a range-capable `UrlSource` (adapter.ts:250/268) so mediabunny fetches only the header bytes it needs rather than buffering the whole file. The net result is the minimal init-overhead-dominated cost the scenario notes describe ("tiny bucket (~100 KB) ... size-ladder representative") — 3.275 ms.

The closest competitor, remotion-media-parser (3.715 ms, backend cpu-js / streaming, fieldsTier metadata-only per its configUsed), is a pure-JS streaming parser that likewise stops at the moov; it pays only a ~0.44 ms (1.13x) penalty, consistent with both engines being header-only and the file being tiny. The larger gaps below come from heavier machinery that is overkill for a header read.

## What each other framework did wrong

- remotion-media-parser@4.0.479 — PASS but lost on speed: 3.715 ms vs 3.275 ms (1.13x slower). Pure-JS streaming parse (configUsed backend cpu-js, fieldsTier metadata-only); essentially tied, marginally more per-byte overhead.
- remotion-webcodecs@4.0.479 — PASS, 4.875 ms (1.49x slower). configUsed shows a WebCodecs convert pipeline with backpressure/worker plumbing and adapter fast-paths aimed at large MP4/MOV demux; that infrastructure is unnecessary for a tiny header probe and adds setup cost.
- mp4box@2.3.0 — PASS, 5.940 ms (1.81x slower). configUsed: whole-file-append (MP4BoxBuffer + fileStart), rangeReads=false. It appends the entire file before exposing moov, so it does more buffering than the range-reading winner even though it still passes metadata exactly.
- ffmpeg.wasm@0.12.15 — PASS, 9.370 ms (2.86x slower). wasm demuxer; pays WASM call/marshalling overhead to ffprobe-style metadata that the native-JS parsers get more cheaply at this size.
- web-demuxer@4.0.0 — PASS, 22.520 ms (6.88x slower). WASM (libav-based) demuxer; heavy module/instance overhead dominates for a ~173 KB probe.
- platform@chrome-149 — PASS, 33.550 ms (10.24x slower). configUsed shows the WebCodecs/`<video>` element path (decode VideoDecoder, encode via MediaRecorder); spinning up the media element / hardware pipeline just to read metadata is the slowest route. Honest PASS, worst latency.

No engine returned NA or FAIL; there are no under-declared capabilities to flag here — every engine genuinely implements container probing for MP4.

## Anti-cheat validation

- Scenario definition: src/scenarios/probe/index.ts:258 (asset 'tiny_h264_360p_2s.mp4', container mp4, videoCodecs ['h264'], audioCodecs ['aac'], notes: "tiny bucket (~100 KB) 360p MP4 — size-ladder representative for the MP4/H.264 family").
- Fixture: fixtures/media/tiny_h264_360p_2s.mp4 EXISTS, 173 KB — a real, non-synthetic MP4 matching the declared codec/container. Goldens present: .meta.json (426 B), .packets.json, .frames.json, .ssim.json.
- Oracle: golden-metadata at src/core/oracles.ts:595. Performs a real field-by-field comparison (container, duration within strict ±1/24s band, per-track codec/width/height/fps/sampleRate/channels) against the golden meta. Golden meta is physically plausible: 640x360 h264 @30, aac 48000/2, duration 2s, bitrates 581396/96360. Not trivially satisfiable — any wrong dim/codec/track-count fails.
- Winner adapter: src/engines/mediabunny/adapter.ts:417-451 (metadataFromInput → getFormat/getDurationFromMetadata/getTracks via real mediabunny Input + UrlSource at adapter.ts:250/268). Genuine library calls; no canned output, no copy-input-as-output, no golden short-circuit, no error swallowing.
- Verdict: REAL. Real fixture + real library implementation + a meaningful structural-metadata oracle.
- Cached note: ALL 7 results have cached==true ("cached previous PASS result"). The PASS is valid (re-derivable), but the wall numbers were reused, not freshly measured — staleness/measurement-freshness risk applies to the performance ranking specifically.

## Confidence & caveats

- Confidence: medium. The winner selection is unambiguous on the recorded numbers (lowest wall, real implementation, real oracle), but: (1) the gate is metadata-only (structural), not bit-exact, so the win is a latency win on a cheap probe, not a correctness differentiation; (2) every wall sample is n=1 with mad=0 and p95==median, so the 1.13x margin over remotion-media-parser is within plausible run-to-run noise and could flip on a fresh multi-sample run; (3) all entries are cached, so none of these timings were produced in the current run. The downstream margins (vs mp4box, ffmpeg.wasm, web-demuxer, platform) are large enough (1.81x–10.24x) to be robust regardless.
