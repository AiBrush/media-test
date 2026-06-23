# probe/h264_bframes_1080p

family: probe | fixture asset: `h264_bframes_1080p.mp4` (11 MB, real fixture in fixtures/media/) | primaryMetric: wall | passCount: 7 / 7

## Verdict

- Best framework: **mediabunny@1.48.0**
- CONTESTED: all 7 engines PASS the single gating oracle (`golden-metadata`), so correctness is a tie and the decision falls to performance.
- Decisive factor: wall-clock median. mediabunny probes in **2.855 ms**, the fastest of all seven.
- Margin over runner-up (remotion-webcodecs @ 8.36 ms): **~2.93x faster wall**. Against the slowest correct engine (platform @ 5999.6 ms) it is ~2101x faster; against ffmpeg.wasm (69.7 ms) ~24x faster.
- Evidence strength caveat: every engine ran `n==1` (mad=0, p95==median), and all results are `cached==true`, so the timing margin is single-sample and not re-validated this run.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 2.855 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 8.360 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 16.685 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 40.300 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:true | 40.880 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 69.705 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 5999.615 | n/a | n/a | n/a | cached previous PASS result |

Note: this probe scenario only emits the `wall` bench metric; throughputRealtime / peakMemory / longtasks are not measured (no bench entries in the shard), hence "n/a".

## Why the winner wins (deep technical)

The operation under test is a pure metadata probe of a 1080p H.264-in-MP4 clip whose distinguishing property is the presence of B-frames. The scenario note (src/scenarios/probe/index.ts:72) states the gating rationale explicitly: "B-frames: probe must still report duration/dims from the moov, not the GOP order." In other words, a correct probe must read width/height/fps/duration from the container's structural boxes (`mvhd`/`tkhd`/`stsd`/`stts`), and must NOT be confused by the decode-vs-presentation (DTS vs PTS) reordering that B-frames introduce. Every engine that reads the `moov` correctly gets the same answer; the golden (fixtures/golden/h264_bframes_1080p.mp4.meta.json) asserts container=mp4, duration=10s, video h264 1920x1080 @ 30fps, audio aac 48000Hz/2ch.

The gating oracle `golden-metadata` (src/core/oracles.ts:595-657) does a positional, field-by-field comparison: container string, duration within a strict per-frame band, and per-track codec/width/height/fps/sampleRate/channels (compareTrack at src/core/oracles.ts:659-686). For this fixture the duration tolerance resolved to 0.041667 s (= 1 frame at ~24fps floor / per-frame band). mediabunny reported `durationDeltaSec: 0` — an exact duration match — comfortably inside the band, and matched all track fields (detail: "metadata matches golden (2 track(s))").

Mechanistically, mediabunny wins because it does the minimum container work and never touches the elementary stream. Its adapter (src/engines/mediabunny/adapter.ts:417-453, metadataFromInput) takes the cheap duration path first: `input.getDurationFromMetadata()` (adapter.ts:429), which reads the declared `mvhd`/`tkhd` duration WITHOUT scanning samples, and only falls back to `computeDuration()` (a full fragment/sample walk) when metadata yields null (adapter.ts:434-441). Track normalization (`input.getTracks()` then `normalizeTrack`, adapter.ts:443-447) pulls dims/fps/codec straight from the `stsd`/`stts` getters. Because the MP4 here is a plain faststart/progressive file with a populated `moov`, the cheap path returns immediately and mediabunny does essentially one structural parse plus track-getter reads — hence 2.855 ms. This is exactly the path the scenario wants: duration from the moov, not from GOP/decode order, so B-frames are irrelevant to its answer.

The backend chosen (env.configUsed) was `backend: "webcodecs"`, `coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`. For a probe, no actual decoding occurs, so the pure-TS container parser does the work; the absence of any COOP/COEP / SharedArrayBuffer requirement is a deployment advantage and there is no wasm load or worker spin-up cost on the critical path, which is why it edges out the other WebCodecs-class engines.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASSed (golden-metadata, durationDeltaSec=0) but lost on speed at 8.36 ms vs 2.855 ms (2.93x slower). Its config carries a `streaming-backpressure` pipeline with mp4-sample-table http-range fast-paths and a bufferWriter; that machinery adds fixed overhead that a bare metadata probe does not need.
- **remotion-media-parser@4.0.479** — PASSed (durationDeltaSec=0) but 16.685 ms (5.8x slower). `backend: cpu-js`, `fieldsTier: metadata-only`, webReader streaming; pure-JS parsing with a streaming reader is correct but slower than mediabunny's direct getters.
- **web-demuxer@4.0.0** — PASSed (durationDeltaSec=0) but 40.30 ms (14.1x slower). It is wasm/FFmpeg-backed demuxer machinery; even for a probe it pays demuxer init/parse cost far above a structural-only reader.
- **mp4box@2.3.0** — PASSed (durationDeltaSec=0) but 40.88 ms (14.3x slower). Config `whole-file-append(MP4BoxBuffer+fileStart)`, `rangeReads: false` — it appends the entire 11 MB file before the moov is parsed, so it pays whole-file buffering for a probe.
- **ffmpeg.wasm@0.12.15** — PASSed (durationDeltaSec=0) but 69.705 ms (24.4x slower). Full FFmpeg-in-wasm; the heavy generic demuxer/probe path is the slowest of the wasm/JS engines for trivial metadata.
- **platform@chrome-149** — PASSed but at 5999.6 ms (2101x slower) and with the only nonzero duration delta (durationDeltaSec=0.021333, still well inside the 0.041667 s band). Its config probes via real playback (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`), so it effectively demuxes/decodes to obtain metadata, dwarfing every dedicated parser. Honest PASS, but architecturally wrong tool for a probe.

No engine returned NA and none FAILed, so there are no under-declared-capability concerns for this scenario.

## Anti-cheat validation

- Scenario definition: src/scenarios/probe/index.ts:67-73 (PROBE_CASES entry `asset: 'h264_bframes_1080p.mp4'`, container mp4, videoCodecs ['h264'], audioCodecs ['aac'], note at line 72).
- Fixture: `fixtures/media/h264_bframes_1080p.mp4` exists, **11 MB real media** (not synthetic/empty/mock). Goldens present: `.meta.json` (431 B), `.packets.json` (87k), `.frames.json` (3.2k), `.ssim.json` (76k) — consistent with a genuinely decoded/probed real clip.
- Gating oracle: `golden-metadata` at src/core/oracles.ts:595-657 with per-track compare at 659-686. It is a real field-by-field structural comparison (container, duration within ±0.041667 s strict band, codec/dims/fps/sampleRate/channels), not trivially satisfiable: a swapped/wrong dim or out-of-band duration FAILs. This is a structural/metadata-exact oracle (mid-ladder), not a smoke or wide-tolerance gate. measurements (durationDeltaSec 0 for six engines, 0.021333 for platform; tolerance 0.041667 s) are physically plausible for a 10 s 30fps 1080p file.
- Winner adapter: src/engines/mediabunny/adapter.ts:417-453 (metadataFromInput) — genuinely opens a mediabunny `Input` over a `BlobSource`, reads duration via `getDurationFromMetadata()` (line 429) with `computeDuration()` fallback, enumerates `getTracks()` and normalizes real track getters. No canned output, no copy-input-as-output, no short-circuit to the golden, no error-swallow-then-claim-success.
- Verdict: **REAL** — real 11 MB fixture, real library implementation reading actual container boxes, meaningful structural oracle with a tight (1-frame) duration band.
- Cached note: the winner's result (and all 7) have `cached==true` ("cached previous PASS result"). The PASS itself is trustworthy (oracle + real code verified), but the 2.855 ms timing was reused, not re-measured this run; treat the numeric margin as single-sample, possibly stale.

## Confidence & caveats

- Confidence: **high** for correctness (genuine fixture, genuine adapter path, meaningful structural oracle) and for the ordinal winner (mediabunny is fastest by a clear ~3x margin even allowing single-sample noise).
- Caveats: (1) All engines `n==1`, mad=0, p95==median — timing is a single sample; the 2.93x margin over remotion-webcodecs is plausible but not statistically robust. (2) All results `cached==true` — none re-run this session (launcher staleness risk per project memory). (3) Only the `wall` metric exists for this probe; memory/throughput/longtask comparisons are unavailable. (4) The oracle is metadata-exact, not bit-exact decode; it validates that the probe reads the moov correctly (the B-frame point) but does not exercise decode-order handling beyond duration/dims.
