# probe/longform_1h_audio

family: probe | fixture asset: `longform_1h_audio.m4a` (30 MB, real ISOBMFF/MP4 audio-only) | primaryMetric: wall | passCount: 7/7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (all 7 engines PASS the single gating oracle `golden-metadata` with identical correctness, so the decision falls to performance).
- **Decisive factor:** wall median. mediabunny clocks **4.945 ms**, the lowest of the field. Correctness is a flat tie (every engine reports `durationDeltaSec` ≤ tolerance and the exact 1-audio-track layout), so per the procedure (4a comparable → 4b performance) ranking is by `wall` median.
- **Margin over runner-up:** runner-up is remotion-media-parser at 6.645 ms → mediabunny is **1.34x faster wall**. Against the broader field: 4.48x faster than web-demuxer (22.155 ms), 17.0x faster than mp4box (84.195 ms), 18.2x faster than ffmpeg.wasm (89.77 ms), and 1213x faster than platform/WebCodecs (5999.575 ms). Caveat: every bench is **n=1** (mad=0, single sample), so the wall ranking is weak statistical evidence; the order is plausible but a single-sample win between mediabunny (4.945) and remotion-media-parser (6.645) is within noise of a JS-init jitter.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 4.945 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 6.645 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 13.400 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 22.155 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 84.195 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 89.770 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 5999.575 | n/a | n/a | n/a | cached previous PASS result |

(The scenario declares `metrics: ['wall']` only — no throughputRealtime/peakMemory/longtasks were collected, so those columns are n/a for all engines.)

## Why the winner wins (deep technical)

The fixture is a **multi-hour AUDIO-ONLY AAC-LC stream in an MP4/ISOBMFF container** (`.m4a`, `major_brand: isom`, golden: 1 audio track, AAC, 48000 Hz, mono, ~64.4 kbps, `durationSec: 3600`). The scenario notes (src/scenarios/probe/index.ts:237-239) state the gating requirement precisely: *"probe must report ~1h duration cheaply (not by scanning all samples) and exactly 1 audio track."* The trap is that a naïve probe walks the `stts`/`stsz` sample table (or, for a fragmented file, every `moof`) to derive duration — at one hour of AAC that is hundreds of thousands of samples, inflating wall time and peak memory.

mediabunny wins because its adapter takes the **cheap declared-duration path first**. In `metadataFromInput` (src/engines/mediabunny/adapter.ts:417-441) it calls `input.getDurationFromMetadata()` (line 429), which reads the container's declared duration straight out of the **`mvhd`/`mdhd` header** without touching the sample table, and only falls back to the expensive `input.computeDuration()` scan (line 436) when the cheap path yields null. For this faststart MP4 the `mvhd` duration is present, so mediabunny never scans the ~1h sample run. It then reads tracks via `input.getTracks()` (line 443) and normalizes them. The oracle measurement confirms the read was exact, not estimated: `durationDeltaSec: 0` against golden 3600 s (tolerance ±0.04167 s, the strict ±1-frame band) — the probe reproduced the header duration bit-for-bit and the track-count compare saw exactly 1 audio track. The config used is `backend: webcodecs, coreBuild: pure-ts-esm, sharedArrayBuffer: false, coopCoep: not-required` — a pure-TS header parse with **no wasm boot and no COOP/COEP requirement**, which is why its wall (4.945 ms) is an order of magnitude below the wasm engines that must instantiate a module before they can read a single box.

remotion-media-parser is a near-tie (6.645 ms) doing the same thing in spirit — `configUsed.fieldsTier: 'metadata-only'`, `pipeline: streaming`, `backend: cpu-js` — a streaming header-only parse, also no wasm. The 1.34x gap is small and, at n=1, not robustly separable. mediabunny's edge is its single synchronous-style header read versus remotion's streaming reader setup overhead.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on perf only. 6.645 ms vs 4.945 ms = 1.34x slower wall. Same correctness (`durationDeltaSec: 0`). Gap is within n=1 noise.
- **remotion-webcodecs@4.0.479** — PASS, 13.400 ms = 2.71x slower than mediabunny. Same `durationDeltaSec: 0`. Adapter routes the probe through its parse layer with extra fast-path bookkeeping (`adapterFastPaths` for http-range MP4 demux); for a 30 MB local file that setup is pure overhead.
- **web-demuxer@4.0.0** — PASS, 22.155 ms = 4.48x slower. `durationDeltaSec: 0`. web-demuxer is a wasm-backed FFmpeg demuxer; even a header-only probe pays wasm instantiation/marshalling cost the pure-TS engines avoid.
- **mp4box@2.3.0** — PASS, 84.195 ms = 17.0x slower. `durationDeltaSec: 0`, but `configUsed.pipeline: 'whole-file-append(MP4BoxBuffer+fileStart)'` with `rangeReads: false` — MP4Box.js appends the **whole 30 MB file** through `appendBuffer` before exposing `moov`, so it pays a full-buffer ingest the header-only readers skip. Correct, just architecturally heavier for big files.
- **ffmpeg.wasm@0.12.15** — PASS, 89.770 ms = 18.2x slower, the slowest non-platform engine. `durationDeltaSec: 0`. Single-thread wasm FFmpeg: module boot + virtual-FS write of the input dominate a header probe.
- **platform@chrome-149** — PASS but **5999.575 ms = 1213x slower**. It is the only engine with a non-zero delta (`durationDeltaSec: 0.0213`, still inside ±0.04167 tol). The platform path has no cheap metadata API: `configUsed.decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`, `pipeline: streaming`. To get a duration it effectively drives the `<video>`/MSE element to load metadata for a 1-hour file, hence the ~6 s wall and the small estimate delta. Honest PASS, catastrophically uncompetitive for this op.

No NA and no FAIL cells — every engine genuinely implements probe for MP4 audio-only, so there is no under-declared capability to flag.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/probe/index.ts:231-240 (`asset: 'longform_1h_audio.m4a'`, `container: 'mp4'`, `audioCodecs: ['aac']`), built into a probe scenario at src/scenarios/probe/index.ts:336-360 with `op: 'probe'`, `oracles: ['golden-metadata']`, `metrics: ['wall']`.
- **Fixture is real:** `fixtures/media/longform_1h_audio.m4a` exists, **30 MB** — a genuine ~1h AAC/MP4 file, not synthetic/empty/mock. Golden present: `fixtures/golden/longform_1h_audio.m4a.meta.json` (container mp4, durationSec 3600, 1 AAC audio track 48000 Hz mono).
- **Winner adapter is genuine:** src/engines/mediabunny/adapter.ts:417-473 (`metadataFromInput`) calls the real mediabunny `Input` API — `getDurationFromMetadata()` (429), `computeDuration()` fallback (436), `getTracks()` (443), `getMetadataTags()` (457). No canned output, no copy of golden, no swallowed-error-as-success (catch blocks set `null`, which then fall through to the precise path or surface a diff in the oracle).
- **Oracle is meaningful:** `goldenMetadata` at src/core/oracles.ts:595-657 does a real field-by-field compare vs the committed golden — container string, duration within a tolerance band (here the strict ±0.04167 s / ±1-frame band, not the loose estimate band), and positional per-track codec/sampleRate/channels/count compare (compareTrack, src/core/oracles.ts:659+). It can and does fail (returns `fail()` with diffs). The measurement `durationDeltaSec: 0` against a 3600 s golden is physically plausible: it means the header `mvhd` duration was read exactly, which is what a correct ISOBMFF probe yields.
- **Verdict: REAL.** Real 30 MB fixture, real library calls, a strict (±1-frame) golden compare that exercises the exact "cheap duration + track count" capability the scenario gates.
- **Cached note:** the winner's result has `cached: true` ("cached previous PASS result"), as do ALL 7 engines — none were re-run for this report. The wall numbers (mediabunny 4.945 ms etc.) are reused from a prior bake; staleness risk applies uniformly. Given the 1.34x margin over the runner-up at n=1, treat the *ranking between mediabunny and remotion-media-parser* as low-confidence; the correctness verdict (all PASS, exact) is unaffected by caching.

## Confidence & caveats

- **Correctness: high.** All 7 PASS with exact (`durationDeltaSec: 0`, except platform's 0.0213 < tol) header reads; the oracle is a real strict compare; the fixture and golden both exist.
- **Performance ranking: low-to-medium.** Every bench is **n=1 / mad=0 / single sample** and **cached** (not re-run). The 1.34x mediabunny-vs-remotion gap is within plausible single-sample JS jitter, so the #1/#2 ordering is soft. The large gaps (mp4box, ffmpeg.wasm, platform being 17–1213x slower) are architecturally explained (whole-file append, wasm boot, MSE element load) and robust regardless of sampling noise.
- mediabunny's `pure-ts-esm` build with `coopCoep: not-required` is also a real deployment advantage (no cross-origin-isolation header burden) beyond the raw wall number.
