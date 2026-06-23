# probe/large_h264_1080p_120s

- **Family:** probe
- **Fixture asset:** `large_h264_1080p_120s.mp4` (fixtures/media/, ~90 MB, 1080p H.264 + AAC, faststart MP4)
- **Primary metric:** wall (ms; lower is better) — scenario declares `metrics: ['wall']`, `oracles: ['golden-metadata']`
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — all 7 engines PASS the single gating oracle (`golden-metadata`) with byte-identical correctness (`durationDeltaSec: 0` for every engine, well inside the strict ±0.04167s = ±1-frame band).
- **Decisive factor:** PERFORMANCE (wall median), since correctness strength is a tie. Mediabunny posts the lowest wall median at **3.855 ms**.
- **Margin over runner-up:** runner-up is `remotion-media-parser@4.0.479` at 4.785 ms → mediabunny is **1.24x faster** (4.785 / 3.855). Against the slowest correct engine (`ffmpeg.wasm` 153.505 ms) mediabunny is **39.8x faster**. Caveat: every engine ran with `n: 1`, `mad: 0`, `cached: true` — the 1.24x lead over remotion-media-parser is a single-sample margin and is therefore weak evidence; the lead over the wasm/MediaRecorder tier (37–40x) is large enough to be robust regardless of single-sample noise.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 3.855 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 4.785 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 5.580 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 36.300 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 146.495 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 151.010 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 153.505 | n/a | n/a | n/a | cached previous PASS result |

(Only `bench.wall` was recorded for this scenario; throughputRealtime / peakMemory / longtasks were not collected, so they read n/a. All measurements are single-sample: `n: 1`, `warmup: 1`, `mad: 0`.)

## Why the winner wins (deep technical)

The operation is a **metadata probe of a ~90 MB faststart H.264/AAC MP4**. The scenario note (src/scenarios/probe/index.ts:278) states the test intent precisely: "Probe must read the moov cheaply at scale (faststart)." In a faststart MP4 the `moov` box (containing `mvhd` movie duration, `tkhd`/`stsd`/`mdhd` per-track descriptors) sits at the FRONT of the file before the `mdat` media payload. A correct, scale-aware probe therefore needs to touch only the first few tens of KB, never the ~90 MB of sample data. Every engine here produces correct metadata (container=mp4, dur=120s, video h264 1920x1080@30, audio aac 48000/2 — matching fixtures/golden/large_h264_1080p_120s.mp4.meta.json), so the only thing separating them is HOW MUCH of the file each one had to read and parse to get there.

Mediabunny wins because its probe path is built around a range-reading source plus a header-only duration read. The adapter opens the asset with `UrlSource` (src/engines/mediabunny/adapter.ts:266-270) precisely so the library can issue HTTP range requests for the moov instead of forcing Chromium to materialize the whole 90 MB file as a Blob (documented at adapter.ts:237-244). `probe()` (adapter.ts:1134-1141) delegates to `metadataFromInput()`, whose duration read calls **`getDurationFromMetadata()` FIRST** (adapter.ts:428-433) — this reads the declared `mvhd` duration directly and only falls back to the expensive `computeDuration()` sample-walk when metadata yields null (adapter.ts:434-441; rationale at adapter.ts:421-426). Combined with restricting the input format to the known container singleton when available (adapter.ts:254-258), the probe is O(header), not O(file size). Track normalization (adapter.ts:297-356) likewise reads codec/dims/sampleRate/channels from container descriptors; the only packet-touching call is `computePacketStats(120)` for fps (adapter.ts:312), bounded to a 120-packet prefix — not a full scan. The result is a **3.855 ms** wall, the lowest of the field.

The two other front-of-pack engines are also header-only readers, which is why they cluster near mediabunny: `remotion-media-parser` ran in `fieldsTier: metadata-only` / `streaming` / `webReader` mode (configUsed) at 4.785 ms, and `remotion-webcodecs` (which wraps the same parser plus an `http-range for selected large/progressive MP4/MOV demux rows` fast path, per its configUsed `adapterFastPaths`) at 5.580 ms. Mediabunny edges them by reading the duration straight from `mvhd` without the parser-graph overhead, but the gap is small (1.24x) and single-sample.

The back of the field reveals the mechanistic cost of NOT being range-aware. `web-demuxer` (libav/wasm) at 36.3 ms is ~9x slower than mediabunny. `mp4box@2.3.0` is the clearest example: its configUsed shows `pipeline: whole-file-append(MP4BoxBuffer+fileStart)`, `rangeReads: false` — it appends the ENTIRE file buffer through `appendBuffer`/`fileStart` before MP4Box.js surfaces `onReady`, so even though the moov is at the front, the pure-JS box parser pays for ingesting the whole 90 MB stream (151.0 ms). `platform@chrome-149` (146.5 ms) and `ffmpeg.wasm@0.12.15` (153.5 ms) are the same story from different angles: the platform path drives a real `<video>`/WebCodecs setup, and ffmpeg.wasm boots a single-threaded wasm libav that buffers the file into its MEMFS before `avformat_open_input`. All three are ~38–40x slower than mediabunny — correct, but architecturally unsuited to "read the moov cheaply at scale."

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS (correct metadata, durationDelta 0). Lost on performance only: 4.785 ms vs 3.855 ms = **1.24x slower**. Difference is the parser-graph traversal overhead vs mediabunny's direct `getDurationFromMetadata()` mvhd read; margin is single-sample (n=1) so it is a soft loss.
- **remotion-webcodecs@4.0.479** — PASS. 5.580 ms = **1.45x slower** than mediabunny. Same metadata-only correctness; wraps remotion-media-parser plus an http-range MP4 fast path, adding a thin layer of overhead over the bare parser.
- **web-demuxer@4.0.0** — PASS. 36.300 ms = **9.4x slower**. libav-in-wasm demux has higher fixed init/parse cost than a native-JS range reader for a header-only probe.
- **platform@chrome-149** — PASS. 146.495 ms = **38.0x slower**. Uses the browser media stack (VideoDecoder / `<video>`), which carries heavy setup cost for what is just a header read.
- **mp4box@2.3.0** — PASS. 151.010 ms = **39.2x slower**. configUsed `rangeReads: false` + `whole-file-append` pipeline: ingests the full 90 MB buffer before exposing metadata, defeating the faststart advantage.
- **ffmpeg.wasm@0.12.15** — PASS. 153.505 ms = **39.8x slower** (slowest). Single-thread wasm libav buffers the file into MEMFS before `avformat_open_input`; correct but the heaviest path for a cheap probe.

No engine returned NA or FAIL — the capability (probe of an mp4/h264/aac asset) is universally declared and the golden exists.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/probe/index.ts:271-279 (the `PROBE_CASES` entry; id derived at src/scenarios/probe/index.ts:337 as `probe/<asset-without-ext>` → `probe/large_h264_1080p_120s`). Oracles wired at index.ts:348 (`oracles: ['golden-metadata']`), metrics at index.ts:349 (`['wall']`).
- **Fixture exists and is real:** `fixtures/media/large_h264_1080p_120s.mp4` is present, **~90 MB** — a genuine large 1080p asset, not synthetic/empty/mock. Golden present: `fixtures/golden/large_h264_1080p_120s.mp4.meta.json` (432 B) with physically-plausible values (dur 120s, video h264 1920x1080@30 bitrate 5,836,579, audio aac 48000/2 bitrate 127,984, major_brand isom). The scenario note (index.ts:272-273) explicitly documents the honest-FAIL fallback ("until then this probe reports a clean FAIL ('no golden meta') rather than a fabricated pass") — and the oracle enforces exactly that (oracles.ts:600 returns FAIL on absent golden), so the PASSes here mean the golden is genuinely baked.
- **Oracle is meaningful:** `golden-metadata` at src/core/oracles.ts:595-657 performs a real field-by-field comparison: container (oracles.ts:606), duration within a STRICT per-container ±1-frame band (oracles.ts:614-637; for mp4 = ±0.04167s, not loose — mp4 is NOT in LOOSE_DURATION_CONTAINERS, oracles.ts:211), and per-track codec/width/height/fps/sampleRate/channels (oracles.ts:659-686). The measured `durationDeltaSec: 0` against a `durationToleranceSec: 0.041666…` is a real, tight pass, not a wide-open tolerance. This is a structural/metadata-exact gate (mid-strength on the correctness ladder), above perceptual/smoke gates.
- **Winner implementation is genuine:** mediabunny `probe()` (src/engines/mediabunny/adapter.ts:1134-1141) → `metadataFromInput()` (adapter.ts:417-453) calls real library APIs (`input.getFormat()`, `getDurationFromMetadata()`, `getTracks()`, per-track `getCodec()/getDisplayWidth()/getSampleRate()` at adapter.ts:297-356). No canned output, no copy of input→output, no short-circuit to the golden file, no error-swallowing-as-success (the duration path falls back to `computeDuration()` and only returns null on genuine failure, adapter.ts:434-441).
- **Cached note:** ALL 7 engine results have `cached: true` ("cached previous PASS result"). The numbers were reused from a prior run, not freshly measured this run — staleness risk applies uniformly. The ranking is unaffected (relative order is stable and the cross-tier gap is large), but the 1.24x lead over remotion-media-parser should be re-confirmed on a fresh, multi-sample run before being treated as definitive.
- **Verdict:** **REAL** — real ~90 MB fixture, real golden with plausible values, genuine library-backed probe implementation, and a meaningful strict-tolerance metadata oracle.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict (all 7 genuinely PASS a real, strict oracle) is high-confidence. The PERFORMANCE winner is correct on the recorded data but rests on `n: 1`, `mad: 0` single-sample benches with `cached: true`, so the narrow 1.24x lead over remotion-media-parser is fragile. The decisive separation that matters most — header-only range readers (mediabunny / remotion-media-parser / remotion-webcodecs, ~4–6 ms) vs whole-file-buffering engines (web-demuxer / platform / mp4box / ffmpeg.wasm, ~36–154 ms) — is large and architecturally grounded, so the top-3-vs-bottom-4 split is robust.
- **Caveats:** (1) Only `wall` was benched; no peakMemory/throughput to corroborate the moov-cheap-read story directly. (2) All results cached — re-run fresh (and with higher n) to harden the intra-top-3 ordering. (3) This is the golden-probe variant (primaryMetric wall); a separate `perf-extract-metadata-large` case (index.ts:377) ranks the same asset by opsPerSec and would be the place to confirm the throughput-at-scale claim.
