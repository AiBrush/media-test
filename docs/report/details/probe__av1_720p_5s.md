# probe/av1_720p_5s

- **family:** probe
- **fixture asset:** `av1_720p_5s.webm` (1.9 MB, WebM/Matroska container; AV1 video + Opus audio)
- **primaryMetric:** wall (ms) — probe has no `opsPerSec` headline for this case; the single timed metric in the shard is `wall`.
- **passCount:** 6 of 7 (mp4box = NA_ENGINE)

## Verdict

- **Best framework: mediabunny@1.48.0**
- **Contested:** YES — six engines PASS (mediabunny, ffmpeg.wasm, platform, web-demuxer, remotion-media-parser, remotion-webcodecs). All six pass the *same* and *only* oracle (`golden-metadata`) with identical strictness, so correctness is a flat tie and the decision falls to performance.
- **Decisive factor:** lowest wall-clock probe time. mediabunny median **6.91 ms** beats the runner-up ffmpeg.wasm **8.47 ms** (**1.23x faster**), remotion-webcodecs 8.63 ms (1.25x), remotion-media-parser 9.04 ms (1.31x), web-demuxer 12.91 ms (1.87x), and platform 6000.53 ms (**868x** — the `<video>`-element path is pathologically slow for probe). mediabunny also has the lowest end-to-end `durationMs` (1103 ms vs 2033–21887 ms) and the strongest correctness tie-marker: `durationDeltaSec = 0`.
- **Margin caveat:** every bench is `n=1, mad=0` (single sample, no spread). The 1.23x gap over ffmpeg.wasm is a single-shot measurement and should be treated as weak evidence on its own; the *robust* separators are (a) platform being ~3 orders of magnitude slower and (b) mp4box being structurally incapable of WebM.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true (Δdur=0s) | 6.91 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true (Δdur=0.002s) | 8.47 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true (Δdur=0s) | 8.63 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true (Δdur=0s) | 9.04 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true (Δdur=0s) | 12.91 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true (Δdur=0.007s) | 6000.53 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

*The shard `bench{}` for every engine contains only the `wall` metric; throughputRealtime/peakMemory/longtasks were not recorded for this probe case, hence `n/a`.*

## Why the winner wins (deep technical)

**The operation.** This is a read-side metadata probe of a Matroska/WebM file carrying an **AV1** video track (1280x720, 30 fps) and an **Opus** stereo audio track (48 kHz, 2ch), golden duration 5.008 s. The scenario is declared with `videoCodecsIn: ['av1']` (not `videoCodecs`), per the scenario note (`src/scenarios/probe/index.ts:113-121`): this routes AV1 through the *input/parse* capability gate, deliberately so an engine that can demux/parse AV1 but cannot *encode* it is not falsely hidden behind an encode gate. Probe therefore never decodes a single AV1 OBU — it reads the WebM `Segment`/`Tracks`/`Info` headers and surfaces normalized container + per-track metadata. The gating oracle is `golden-metadata` only (`src/core/oracles.ts:595`), which compares container, duration (within a per-frame band — here `durationToleranceSec = 0.0417s`, i.e. ±1 frame at 24fps floor), and positional per-track codec/dims/fps/sampleRate/channels against `fixtures/golden/av1_720p_5s.webm.meta.json`.

**Why mediabunny is fastest.** mediabunny's `probe()` (`src/engines/mediabunny/adapter.ts:1134-1141`) opens a real `Input` over a `BlobSource` and calls `metadataFromInput()` (`adapter.ts:417`). The critical design choice is the **cheap duration path** (`adapter.ts:421-441`): it reads `input.getDurationFromMetadata()` first — which pulls the Matroska `Segment`-level declared duration straight out of the header — and only falls back to the expensive `computeDuration()` full-sample/fragment walk when the metadata duration is null/non-finite. For a well-formed WebM with a `Duration` element this header read returns immediately, never touching the cluster/block data. Track metadata comes from `input.getTracks()` + `normalizeTrack()` (`adapter.ts:443-447`), reading the `TrackEntry`/`CodecID`/`Video`/`Audio` sub-elements. The result: a pure header parse, no decode, no sample scan — which is why it lands at **6.91 ms** and `durationDeltaSec = 0` (it echoes the same authored duration the golden was baked from). The config (`backend: webcodecs`, `coopCoep: not-required`, `sharedArrayBuffer: false`, `coreBuild: pure-ts-esm`) confirms there is no wasm thread spin-up tax for this read-only path.

**Why the others, though correct, are slower.** ffmpeg.wasm (8.47 ms) must route the probe through its wasm `avformat` demuxer — correct, and its Δdur=0.002s shows it reports the same duration, but the wasm boundary adds a small constant overhead over mediabunny's pure-TS header read. remotion-webcodecs (8.63 ms) and remotion-media-parser (9.04 ms, `backend: cpu-js`, `fieldsTier: metadata-only`) are JS parsers doing the same header walk with a heavier object/streaming-reader path. web-demuxer (12.91 ms) wraps an Emscripten/libav demuxer and pays the largest wasm marshalling cost of the fast group. **platform (6000.53 ms)** is the outlier: its config encodes `decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder` — for probe it relies on the `<video>` element's `loadedmetadata`, which for WebM/AV1 incurs a multi-second media-engine spin-up; it is correct (Δdur=0.007s within tolerance) but 868x slower than mediabunny.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on perf: 8.47 ms vs 6.91 ms = **1.23x slower**; wasm `avformat` boundary overhead. Correctness identical (Δdur 0.002s ≤ 0.0417s tol).
- **remotion-webcodecs@4.0.479** — PASS, lost on perf: 8.63 ms = **1.25x slower**. Same golden-metadata pass (Δdur=0).
- **remotion-media-parser@4.0.479** — PASS, lost on perf: 9.04 ms = **1.31x slower**; `cpu-js` metadata-only parser, no wasm/hardware acceleration but heavier than mediabunny's header read.
- **web-demuxer@4.0.0** — PASS, lost on perf: 12.91 ms = **1.87x slower**; largest wasm-demuxer marshalling cost of the fast cluster.
- **platform@chrome-149** — PASS, lost on perf catastrophically: 6000.53 ms = **868x slower**; `<video>`-element `loadedmetadata` spin-up for WebM/AV1. Honest PASS, unusable for a probe headline.
- **mp4box@2.3.0** — **NA_ENGINE**, `engine does not declare input container 'webm'`. This NA is **honest**: MP4Box.js is an ISOBMFF (MP4/MOV/fragmented-MP4) box parser and genuinely cannot parse the Matroska/EBML container of a WebM file. Declining the row rather than FAILing is the correct capability negotiation, not an under-declaration.

## Anti-cheat validation

- **Scenario:** `src/scenarios/probe/index.ts:113-121` — case `{ asset: 'av1_720p_5s.webm', container: 'webm', videoCodecsIn: ['av1'], audioCodecs: ['opus'], notes: 'AV1 read-side probe ... videoCodecsIn so software engines that can parse/decode/copy AV1 but cannot encode AV1 are not falsely hidden behind an encode-capability gate.' }`. The gating rationale is documented and sound.
- **Fixture exists & is real:** `fixtures/media/av1_720p_5s.webm` = **1.9 MB** real WebM (not empty/synthetic/mock). Golden baked independently: `fixtures/golden/av1_720p_5s.webm.meta.json` lists container=webm, durationSec=5.008, AV1 1280x720@30 + Opus 48000/2ch; plus `.packets.json` (45k), `.frames.json` (3.2k), `.ssim.json` (79k) — physically plausible for a 5 s 720p clip.
- **Oracle:** `golden-metadata` at `src/core/oracles.ts:595-657` performs a *real* field-by-field comparison: container string, duration within a strict ±1-frame band (`durationToleranceSec = 0.0417s`, no loose-container widening for webm), and positional per-track codec/width/height/fps/sampleRate/channels diffs (`compareTrack`, `oracles.ts:659-686`). Not trivially satisfiable: a wrong codec/dims/track-count/duration produces a diff and FAILs. The measured `durationDeltaSec` values (0, 0.002, 0.007) are physically plausible muxer-rounding deltas, all well inside tolerance.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1134-1141` (`probe`) → `:417-453` (`metadataFromInput`). Genuinely calls the real mediabunny `Input`/`BlobSource`/`getDurationFromMetadata`/`computeDuration`/`getTracks` API. No canned output, no copy-input-to-output, no short-circuit to the golden file, no error-swallow-as-success.
- **Cached note:** **All 7 entries have `cached: true`** ("cached previous PASS result"). The numbers were *reused*, not re-run in this report's session — per the launcher seeding caveat, single-sample (`n=1`) cached benches carry staleness risk and the 1.23x perf margin should not be over-trusted. The *capability* outcomes (6 PASS / mp4box NA) are structural and not staleness-sensitive.
- **Verdict: REAL.** Real 1.9 MB fixture + real golden + genuine mediabunny header-parse implementation + a meaningful metadata-exact oracle that can fail. The only soft spot is evidentiary (cached n=1 benches), not correctness.

## Confidence & caveats

- **Confidence: medium.** The winner's *correctness* and the loser disqualifications (mp4box NA, platform 868x) are unambiguous. The perf *ranking among the fast cluster* (mediabunny > ffmpeg.wasm > remotion-webcodecs > remotion-media-parser > web-demuxer) rests on single-shot, cached `n=1` measurements with `mad=0`, so the tight 1.23x–1.87x gaps could reorder on a re-run.
- All six passers cleared only `golden-metadata` — there is no stronger (bit-exact/structural-packet) oracle gating this probe case, so "best" means "correct + fastest header read", not "most rigorously verified decode".
- mediabunny's win is mechanistically attributable to its cheap `getDurationFromMetadata()` header path avoiding a sample scan; this advantage is real for any well-formed WebM with an authored `Duration` element, as here.
