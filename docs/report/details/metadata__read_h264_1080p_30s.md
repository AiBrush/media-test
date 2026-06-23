# metadata/read_h264_1080p_30s

- **Family:** metadata
- **Fixture asset:** `h264_1080p_30s.mp4` (real file, `fixtures/media/h264_1080p_30s.mp4`, ~31 MB, 30 s 1080p H.264 video + AAC stereo audio, faststart MP4/isobmff)
- **Operation:** `probe` (structural metadata read)
- **primaryMetric:** wall (median ms)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479` (by a hair) — but this is effectively a **statistical tie with `mediabunny@1.48.0`**.
- **Contested:** YES — all 7 engines PASS the single gate (`golden-metadata`) with identical, exact measurements (`durationDeltaSec=0`).
- **Decisive factor:** Correctness is identical across all 7 (same oracle, same exact delta), so the rank falls to PERFORMANCE (primaryMetric = wall). remotion-media-parser posts the lowest wall median at **4.060 ms**, edging mediabunny's **4.085 ms**.
- **Margin over runner-up:** **1.006x faster wall** vs mediabunny (4.060 ms vs 4.085 ms = a 0.025 ms / ~0.6% gap). This margin is **inside the noise floor**: both samples are `n=1`, `warmup=1`, `mad=0`, so the ordering between these top two is not robust. Both decisively beat #3 (remotion-webcodecs 6.350 ms ⇒ ~1.56x) and crush the wasm/platform tail (mp4box 119.96 ms ⇒ ~29.5x slower than the winner).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 4.060 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 4.085 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 6.350 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 30.690 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 67.975 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 82.755 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:true | 119.960 | n/a | n/a | n/a | cached previous PASS result |

(No `throughputRealtime` / `peakMemory` / `longtasks` were collected for this scenario — the scenario declares only `metrics: ['wall']` in `buildRead`, `src/scenarios/metadata/_shared.ts:93`. wall is therefore the sole numeric discriminator.)

## Why the winner wins (deep technical)

This is a **pure structural-metadata read** of a faststart H.264/AAC MP4. The gate is `golden-metadata` (`src/core/oracles.ts:595`), which compares only container, `durationSec` (±1-frame band ≈ 0.0417 s), and per-track `{type, codec, width, height, fps, sampleRate, channels}` matched positionally (`compareTrack`, `oracles.ts:659`). The golden (`fixtures/golden/h264_1080p_30s.mp4.meta.json`) declares container `mp4`, duration 30 s, a 1920x1080 h264 video @ 30 fps and a 48000 Hz / 2-channel aac track. Every engine returns exactly this — the shard shows `durationDeltaSec:0` for all 7, i.e. each parser read the `mvhd`/`tkhd` timescale-and-duration and the `stsd`/`avcC`/`esds` configuration **exactly**, not within tolerance. Because correctness is a 7-way exact tie, the decision is purely how cheaply each engine extracts that header data.

The two winners win by **never touching `mdat`**. For a faststart MP4 the entire `moov` (with `stsd`, `stts`, `stsz`, `stco`/`co64`) sits before the media data, so a parser only needs the first few hundred KB of the 31 MB file. remotion-media-parser ran with `backend: 'cpu-js'`, `reader: 'webReader'`, and crucially **`fieldsTier: 'metadata-only'`** (`env.configUsed`) — it streams just enough boxes to satisfy the requested fields and stops, which is why it lands at 4.060 ms. mediabunny took the same header-only path: its `metadataFromInput` (`src/engines/mediabunny/adapter.ts:417`) calls `input.getDurationFromMetadata()` **first** (`adapter.ts:429`) to read the container's declared `mvhd` duration **without scanning samples**, only falling back to the sample-walking `computeDuration()` when metadata yields null (`adapter.ts:434-441`). Tracks are normalized via `input.getTracks()` then `normalizeTrack` (`adapter.ts:443-447`, `:297`), reading `getCodec()`, `getDisplayWidth/Height()`, and FPS from a **120-packet prefix** via `computePacketStats(120)` (`adapter.ts:312`) rather than the whole stream — bounded work regardless of clip length. mediabunny opened the file with `UrlSource` (range-read capable, `openInput` `adapter.ts:268-275`) on a pure-TS ESM core with `coopCoep: 'not-required'` and `sharedArrayBuffer:false`, so no cross-origin-isolation tax. The result is the two fastest engines being within 0.025 ms of each other.

The rest of the field pays structural overhead this operation does not need. remotion-webcodecs (6.350 ms) is the same Remotion parser core but routed through its WebCodecs-flavored adapter with extra setup (`backend: 'webcodecs'`, hardware-prefer), ~1.56x slower for a job that never decodes a frame. web-demuxer (30.69 ms) and ffmpeg.wasm (67.98 ms) both run an Emscripten/wasm libav* demuxer — paying module instantiation and a wasm-heap copy of the MP4 header just to read fields a JS box-walker reads natively; that is a ~7.6x and ~16.7x penalty vs the winner. platform@chrome-149 (82.76 ms) reads metadata through the browser media stack (`<video>`/WebCodecs config probe), which is heavyweight for a header read. mp4box (119.96 ms) is the slowest by far: its `env.configUsed` shows `pipeline: 'whole-file-append(MP4BoxBuffer+fileStart)'` with `rangeReads:false` — it appends the buffer through `MP4Box.appendBuffer` and (for probe) discards mdat (`discardMdatDataProbe:true`), but the append/parse model over a 31 MB file still costs ~29.5x the winner.

Net: for header-only probing of a faststart H.264/AAC MP4, the **metadata-only / declared-duration fast path** (Remotion `fieldsTier:'metadata-only'`; mediabunny `getDurationFromMetadata` + 120-packet FPS estimate) beats every full-demux/wasm path. The two JS box-walkers tie at the top; remotion-media-parser is nominally first by 0.6%.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost the top slot by **0.025 ms (1.006x)**, n=1/mad=0 ⇒ noise; not a real defect. Correctness identical (`durationDeltaSec:0`).
- **remotion-webcodecs@4.0.479** — PASS, **1.56x slower** (6.350 ms). Same correctness; the WebCodecs-oriented adapter adds setup the pure metadata read does not require.
- **web-demuxer@4.0.0** — PASS, **~7.6x slower** (30.69 ms): wasm libav demuxer instantiation + heap copy of the MP4 header for a job a JS parser does natively.
- **ffmpeg.wasm@0.12.15** — PASS, **~16.7x slower** (67.98 ms): full ffmpeg.wasm module load + probe; correct but the heaviest-weight correct path among the wasm tools.
- **platform@chrome-149** — PASS, **~20.4x slower** (82.76 ms): browser media-stack probe (`backend: webcodecs`, `<video>`); correct but not designed for cheap header extraction.
- **mp4box@2.3.0** — PASS, **~29.5x slower** (119.96 ms): `whole-file-append` model with `rangeReads:false` over a 31 MB file; correct metadata, worst wall.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/metadata/index.ts:53-62` (case object) built by `buildRead` at `src/scenarios/metadata/_shared.ts:81-96`. Generated id `metadata/read_h264_1080p_30s`, `op: 'probe'`, `oracles: ['golden-metadata']`, `metrics: ['wall']`. `notes` document the honest scope: the structural gate is real; tag CONTENT is deliberately NOT claimed (compareTrack never reads `tags`).
- **Fixture exists & is real:** `fixtures/media/h264_1080p_30s.mp4`, ~31 MB, real H.264/AAC MP4 (not synthetic/empty/mock). Golden `fixtures/golden/h264_1080p_30s.mp4.meta.json` declares the exact stream layout the engines reproduce.
- **Oracle is meaningful:** `goldenMetadata` (`src/core/oracles.ts:595-657`) performs a real field-by-field comparison: it FAILs on missing probe metadata (`:599`), missing golden (`:600`), container mismatch (`:606`), duration outside the ±1-frame band (`:626`), track-count mismatch (`:646`), and per-track codec/dims/fps/sr/ch diffs (`compareTrack`, `:659`). It is NOT trivially satisfiable. The reported `durationDeltaSec:0` against `durationToleranceSec≈0.0417` is physically plausible for a precise faststart MP4 (declared `mvhd` duration is exact), and the "2 track(s)" matches the golden's video+audio.
- **Winner adapter genuinely implemented:** remotion-media-parser reads via its `webReader` with `fieldsTier:'metadata-only'` (env.configUsed; real Remotion `@remotion/media-parser` parse, not canned output). The co-leader mediabunny's `metadataFromInput` (`src/engines/mediabunny/adapter.ts:417-474`) calls the real library (`getDurationFromMetadata`, `getTracks`, `getCodec`, `getDisplay{Width,Height}`, `computePacketStats`) — no hardcoded values, no short-circuit to the golden, no error-swallowing-as-success (errors map fields to null/undefined which would FAIL the oracle, not fake a pass).
- **Cached note:** ALL 7 results have `cached:true` (`reason: "cached previous PASS result"`). The PASS verdicts and oracle deltas are real but were REUSED, not freshly re-run in this collection — wall medians (all n=1) carry **staleness risk**, which further weakens the 0.025 ms winner-vs-runner-up margin.
- **Verdict:** **REAL** — real 31 MB fixture, real library implementations, and a meaningful field-comparison oracle that can and does fail. The only caveats are evidentiary (cached, n=1), not integrity (no cheating found).

## Confidence & caveats

- **Confidence: medium.** The PASS set and oracle integrity are high-confidence (REAL); the *winner identity* is low-confidence because remotion-media-parser leads mediabunny by only 0.6% on `n=1`, `mad=0`, `cached:true` samples — a re-run could flip the top two.
- This scenario only collects `wall`; no memory/throughput/longtask data exists to break the top-two tie on a secondary axis.
- Tiebreaker lean: both leaders are pure-JS, no-COOP/COEP, streaming header readers. If forced to pick a single robust winner, mediabunny and remotion-media-parser are interchangeable here; remotion-media-parser is reported as best strictly on the recorded primaryMetric.
