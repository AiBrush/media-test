# probe/huge_vp9_1080p_240s

- **family:** probe
- **fixture asset:** `huge_vp9_1080p_240s.webm` (205 MB real WebM, VP9 video + Opus audio, ~240s)
- **primaryMetric:** wall (probe op; bench carries only `wall` for this row)
- **passCount:** 6 of 7 (1 NA_ENGINE)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — 6 engines PASS the identical gating oracle (`golden-metadata`).
- **Decisive factor:** PERFORMANCE. Correctness is a tie (every PASS engine matched the 2-track golden with `durationDeltaSec ≈ 0`, well inside the strict ±0.04167s / 1-frame band), so ranking falls to wall median. Mediabunny probed in **23.365 ms**, the fastest of all engines.
- **Margin over runner-up:** runner-up is `web-demuxer@4.0.0` at 40.995 ms → mediabunny is **1.75x faster wall** (23.365 vs 40.995 ms). Against the rest the gap is larger: 14.0x faster than remotion-webcodecs (326.985 ms), 17.1x faster than platform (399.230 ms), 18.1x faster than ffmpeg.wasm (423.300 ms), 19.0x faster than remotion-media-parser (443.475 ms).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 23.365 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 40.995 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 326.985 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 399.230 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 423.300 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 443.475 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

Notes: every bench is `n=1, warmup=1, mad=0` (single timed sample after one warmup), so each number is a single observation — see caveats. No engine emitted `throughputRealtime`, `peakMemory`, or `longtasks` for this probe row; only `wall` is present.

## Why the winner wins (deep technical)

This is a **metadata probe** of a 205 MB Matroska/WebM file carrying a VP9 video track (1920x1080, 30 fps) and an Opus stereo track (48 kHz, 2 ch), declared duration 240.008s. The operation is purely "open the container, read the EBML/Segment header and TrackEntry elements, report normalized metadata"; no sample decoding is required. The gating oracle `golden-metadata` (src/core/oracles.ts:595) compares container, duration (within the strict per-frame tolerance), and each track's codec/dims/fps/sampleRate/channels positionally against `fixtures/golden/huge_vp9_1080p_240s.webm.meta.json`.

Because the file is huge, the differentiator is **how much of the file an engine touches to satisfy the probe**. Mediabunny's adapter takes the cheap-metadata path: `metadataFromInput` (src/engines/mediabunny/adapter.ts:417) first calls `input.getDurationFromMetadata()` (adapter.ts:429), which reads the WebM Segment/Info `Duration` + `TimecodeScale` directly from the header **without scanning clusters**, and only falls back to `computeDuration()` if metadata yields null (adapter.ts:434-441). It then reads tracks via `input.getTracks()` (adapter.ts:443) over a `BlobSource`, so only the EBML head + Tracks element is fetched. The measured `durationDeltaSec: 0` confirms the header duration matched the golden exactly (golden 240.008s), proving the cheap path resolved without a cluster walk. The result: a **23.365 ms** wall — it never streamed the ~205 MB of cluster payload. The pure-TS ESM core (configUsed `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`) means there is no wasm instantiation cost and no COOP/COEP requirement to pay before the first byte is read.

The runner-up, `web-demuxer@4.0.0` (40.995 ms, 1.75x slower), is itself fast: it is an Emscripten/FFmpeg-libav demuxer that reads the Matroska header to populate AVStream metadata, also avoiding a full decode. But it carries wasm module + glue overhead that mediabunny's pure-TS header reader does not, which is consistent with the ~17.6 ms gap on an otherwise header-only operation.

The remaining four PASS engines are an order of magnitude slower (327-443 ms) because each does materially more work for the same answer: `ffmpeg.wasm@0.12.15` (423.300 ms) spins the full ffmpeg wasm runtime + virtual-FS round-trip for an `ffprobe`-style read; `platform@chrome-149` (399.230 ms, WebCodecs backend) and `remotion-webcodecs@4.0.479` (326.985 ms) drive heavier parse paths; `remotion-media-parser@4.0.479` (443.475 ms, `backend: cpu-js`, `fieldsTier: metadata-only`, `reader: webReader`) is a streaming JS parser that pulls more of the container through its web reader before resolving duration. All five correctly hit the golden (correctness tie), so none of this extra cost buys accuracy here — it is pure overhead, and mediabunny's header-only shortcut is the mechanistic reason it wins.

## What each other framework did wrong

- **web-demuxer@4.0.0** — PASS but lost on speed: 40.995 ms vs 23.365 ms = **1.75x slower**. wasm/libav demux overhead on a header-only probe where mediabunny stays in pure-TS header reads.
- **remotion-webcodecs@4.0.479** — PASS but **14.0x slower** (326.985 ms). Heavier parse pipeline; configUsed shows streaming-backpressure + worker-capable parse, more than the answer needs.
- **platform@chrome-149** — PASS but **17.1x slower** (399.230 ms). WebCodecs/`<video>` platform path is not optimized for cheap container-header metadata.
- **ffmpeg.wasm@0.12.15** — PASS but **18.1x slower** (423.300 ms). Full ffmpeg wasm runtime + FS round-trip dominates a probe that touches only the EBML header.
- **remotion-media-parser@4.0.479** — PASS but **19.0x slower** (443.475 ms, slowest PASS). `cpu-js` streaming parser via webReader pulls more bytes before resolving duration.
- **mp4box@2.3.0** — **NA_ENGINE**, "engine does not declare input container 'webm'". This is an **honest NA**: MP4Box.js is an ISO-BMFF (MP4/MOV) parser and genuinely cannot read a Matroska/WebM container, so the runner correctly negotiated it out rather than forcing a FAIL.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/probe/index.ts:296-302 — `{ asset: 'huge_vp9_1080p_240s.webm', container: 'webm', videoCodecs: ['vp9'], audioCodecs: ['opus'] }`, notes "huge bucket VP9/WebM twin." Operation family is probe-only (file header §1-31).
- **Fixture exists & is real:** `fixtures/media/huge_vp9_1080p_240s.webm` is present, **205 MB** — a genuine large VP9/WebM, not synthetic/empty/mock.
- **Golden is real & specific:** `fixtures/golden/huge_vp9_1080p_240s.webm.meta.json` declares container webm, durationSec 240.008, video vp9 1920x1080@30, audio opus 48000/2 — physically plausible for a 240s 1080p VP9 file. Companion `.packets.json` (2.2 MB) exists, confirming a real bake.
- **Oracle is meaningful:** `goldenMetadata` (src/core/oracles.ts:595) does a real field-by-field diff: container (oracles.ts:606), duration within strict tolerance (oracles.ts:614-637), and positional per-track codec/width/height/fps/sampleRate/channels (oracles.ts:642-657, compareTrack at 659). Not trivially satisfiable; not a smoke gate; not ssim-with-exactFrames==0. Measured `durationDeltaSec: 0` against `durationToleranceSec: 0.04167` (= 1 frame at 24fps floor) shows a tight, real comparison.
- **Winner implementation is genuine:** src/engines/mediabunny/adapter.ts:417-474 calls the real mediabunny `Input` API (`getDurationFromMetadata`, `computeDuration` fallback, `getTracks`, `getMetadataTags`). No canned output, no golden short-circuit, no input-copy, no swallowed-error-as-success (the try/catch blocks set null and fall through to the precise path, they do not fake a pass).
- **Cached note:** ALL seven entries have `cached:true` ("cached previous PASS result"). The wall numbers were reused from a prior run, not re-measured this pass. Staleness risk exists but the underlying fixture/golden/code are real and unchanged.
- **Verdict:** **REAL** — real 205 MB fixture, real golden, real field-diff oracle, genuine library-backed adapter for the winner.

## Confidence & caveats

- **Confidence:** high on the verdict (header-only cheap-metadata path is a clear, mechanistically grounded win and correctness is a clean tie).
- **Caveat — single sample:** every bench is `n=1, warmup=1, mad=0`. The 1.75x margin over web-demuxer rests on one observation each; with no spread data the ordering between the two fastest could shift slightly, though the order-of-magnitude gap to the other four is robust.
- **Caveat — cached:** all rows are cached reuse, not a fresh re-run (consistent with the launcher stale-PASS caveat). Numbers are self-consistent and plausible.
- **Caveat — metric:** probe's intended headline is opsPerSec, but this row's bench only carries `wall`; wall median was used as the ranking metric (lower better), which is the correct proxy.
