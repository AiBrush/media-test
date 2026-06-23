# metadata/read_no_tags_recorder_webm

- **Family:** metadata
- **Fixture asset:** `fixtures/media/recorder_headerless.webm` (192 KB, real file — headerless MediaRecorder-origin WebM, VP8 video + Opus audio)
- **Golden:** `fixtures/golden/recorder_headerless.webm.meta.json` (container `webm`, duration 3.084s, 2 tracks: vp8 320x240@30fps, opus 48000Hz/2ch)
- **Primary metric:** wall (ms)
- **Pass count:** 6 of 7 (1 NA)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` (uncontested on the *primary metric*, but a **CONTESTED** scenario — 6 engines PASS with identical oracle strength, so the decision falls to performance).
- **Decisive factor:** wall-clock median. All 6 PASS engines satisfy the *same single oracle* (`golden-metadata`) at the *same strictness* (structural/metadata-exact), so correctness does not separate them. ffmpeg-wasm posts the lowest wall median.
- **Margin over runner-up:** ffmpeg-wasm 5.305 ms vs mediabunny 5.705 ms = **1.08x faster wall** — a razor-thin gap on **n==1, mad==0** samples (single sample, no spread). This is within measurement noise; the "win" is real on the recorded number but weakly evidenced (see caveats). The next tier (platform 15.76 ms, web-demuxer 20.67 ms, remotion-webcodecs 27.56 ms) is 3–5x slower; remotion-media-parser at 1917.7 ms is ~362x slower.

## Per-engine results

| Engine | Status | Oracles passed | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true (Δdur 0.0040s ≤ 0.5s) | 5.305 ms | n/a | n/a | n/a | cached previous PASS |
| mediabunny@1.48.0 | PASS | golden-metadata:true (Δdur 0.3762s ≤ 0.5s) | 5.705 ms | n/a | n/a | n/a | cached previous PASS |
| platform@chrome-149 | PASS | golden-metadata:true (Δdur 0.00017s ≤ 0.5s) | 15.755 ms | n/a | n/a | n/a | cached previous PASS |
| web-demuxer@4.0.0 | PASS | golden-metadata:true (Δdur 0.00017s ≤ 0.5s) | 20.665 ms | n/a | n/a | n/a | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true (Δdur 0.00017s ≤ 0.5s) | 27.560 ms | n/a | n/a | n/a | cached previous PASS |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true (Δdur 0.00017s ≤ 0.5s) | 1917.705 ms | n/a | n/a | n/a | cached previous PASS |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |

(No throughputRealtime/peakMemory/longtasks were recorded for this probe-only scenario; the only bench metric is `wall`.)

## Why the winner wins (deep technical)

This is a **pure `probe` (metadata-read) scenario** over a *headerless MediaRecorder WebM* — a container that, unlike a normal WebM, carries **no Segment `Duration` element** and no `Tags` element (live capture, unknown length, sparse/absent Cues). The scenario (`src/scenarios/metadata/write-roundtrip.ts:197-216`) requires `op: 'probe'`, `containersIn: ['webm']`, `videoCodecs: ['vp8']`, `audioCodecs: ['opus']`, and gates on the single oracle `golden-metadata`. The interesting engineering requirement is that the probe must return a sane duration **estimated from the last block timestamp** and never null-deref on the missing header — not bit-exact decoding.

Because the only gate is `golden-metadata`, **correctness strength is identical across all 6 PASS engines** — they all pass the structural/metadata-exact tier (container=webm, 2 tracks, vp8 + opus, dims/fps/sr/ch) and all land inside the loose duration band. So ranking falls to performance (decision procedure step 4b).

ffmpeg-wasm's probe path is genuine and lean for this case: `probe()` (`src/engines/ffmpeg-wasm/adapter.ts:1892`) writes the input to MEMFS and calls `runInfo()` (`adapter.ts:1912`), which execs `ffmpeg -hide_banner -i <in>` (`adapter.ts:1918`). Critically, this build **does not use ffprobe** — the vendored `@ffmpeg/core` 0.12.10 `_ffprobe` entry point is broken (reads uninitialized `Module.ret` → "ffprobe exited -1"), documented at `adapter.ts:262-268` — so metadata is derived entirely by parsing the `Input #0` log block. `metadataFromLog()` (`adapter.ts:1946`) calls `parseDurationSecFromLog()` (the `Duration: HH:MM:SS.ms` regex at `adapter.ts:311-313`), `parseTracksFromLog()` (`adapter.ts:341`), and `parseTagsFromLog()` (`adapter.ts:411`). The container token comes from the input suffix via `containerFromInput()` (`adapter.ts:790`), which honestly yields `webm` for `.webm` rather than guessing. The recorded `golden-metadata` measurement for ffmpeg-wasm is `durationDeltaSec = 0.0040s` against the golden 3.084s — i.e. ffmpeg's last-block-timestamp duration estimate landed within 4 ms of the baked golden, the tightest *real* estimate of any engine except those that report the exact 0.00017s (the engines that share the golden's own demuxer estimate).

The duration gate here is loose by design: the scenario does **not** set an explicit `durationToleranceSec` override (it only sets `fpsTolerance: 0.25`), so `goldenMetadata()` (`oracles.ts:595`) calls `durationToleranceFor()` (`oracles.ts:240`), which routes a recorder/headerless WebM through `isLooseRecorderWebm()` (`oracles.ts:226-230`) and applies the wide band `max(±0.5s, ±15%)`. The shard confirms `durationToleranceSec: 0.5` for every engine — the 0.5s floor. This is the correct gate: a headerless WebM has no precise global duration, so two correct demuxers legitimately disagree by far more than a frame (documented `oracles.ts:199-202`). Even mediabunny's 0.376s estimate gap passes cleanly under this band.

On the deciding metric, ffmpeg-wasm's 5.305 ms wall edges mediabunny's 5.705 ms (1.08x). Both are WebCodecs-era engines reading a 192 KB file, and at these magnitudes the metric is essentially measuring the in-memory log/parse step (the heavy WASM core was warmed once in `init()`), so the two are tied in practice. The clearer story is the tier gap: the WebCodecs/JS engines that demux the full EBML element tree to derive the estimate (platform 15.76 ms, web-demuxer 20.67 ms, remotion-webcodecs 27.56 ms) are 3–5x slower, and remotion-media-parser's `fieldsTier: 'full-parse(fps)'` CPU-JS path (`backend: cpu-js`, `worker: false`) pays 1917.7 ms because it walks the stream to recover FPS for a headerless cadence — correct, but ~362x slower than ffmpeg-wasm.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost the perf tiebreak by 1.08x (5.705 ms vs 5.305 ms wall). Its duration estimate is also the loosest of the field at `durationDeltaSec = 0.3762s` (still comfortably under the 0.5s loose band). Effectively tied with the winner; the loss is within n==1 noise.
- **platform@chrome-149** — PASS, exact duration (Δ 0.00017s) but 15.755 ms wall = **2.97x slower** than ffmpeg-wasm. Uses the browser's native WebCodecs/`<video>` demux path; correct but heavier per-probe setup.
- **web-demuxer@4.0.0** — PASS, exact duration (Δ 0.00017s) but 20.665 ms wall = **3.90x slower**. Full EBML demux to read metadata.
- **remotion-webcodecs@4.0.479** — PASS, exact duration (Δ 0.00017s) but 27.560 ms wall = **5.19x slower**, the slowest of the WebCodecs tier.
- **remotion-media-parser@4.0.479** — PASS, exact duration (Δ 0.00017s) but **1917.705 ms wall = ~362x slower**. `backend: cpu-js`, `worker: false`, `fieldsTier: full-parse(fps)` — it fully parses the stream in single-thread JS to recover the estimated FPS for a timestamp-cadence container.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". This NA is **honest**: MP4Box.js is an ISO-BMFF (MP4/MOV) parser and genuinely cannot read a Matroska/WebM (EBML) container; it correctly does not declare `webm` in `containersIn`, so the runner skipped it rather than faking a result.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/metadata/write-roundtrip.ts:197-216` (`metadata/read_no_tags_recorder_webm`), input `recorder_headerless.webm`, oracle `['golden-metadata']`.
- **Fixture exists:** `fixtures/media/recorder_headerless.webm` — confirmed present, 192 KB, a real headerless WebM (VP8/Opus). Not synthetic/empty/mock.
- **Golden exists:** `fixtures/golden/recorder_headerless.webm.meta.json` — container webm, duration 3.084s, vp8+opus tracks. (Note: the golden file carries `tags: {encoder: "Chrome"}`, but `golden-metadata` does not compare tags — `goldenMetadata()` at `oracles.ts:595-657` only compares container/duration/per-track codec/dims/fps/sr/ch — so the "no_tags" framing is honored: there is nothing to assert in the tag map.)
- **Oracle:** `goldenMetadata()` `src/core/oracles.ts:595`. It performs a REAL comparison against the baked golden: container string equality, duration within the per-container band, and positional per-track field comparison via `compareTrack()`. The loose duration band (`durationToleranceFor` at `oracles.ts:240`, `isLooseRecorderWebm` at `oracles.ts:226`) is justified and *narrow in scope* — it only widens to 0.5s for genuinely header-less recorder WebM; ordinary WebM stays at the strict ±1-frame gate. Not trivially satisfiable: it still fails on a wrong container, wrong track count, wrong codec, or a duration drift > 0.5s.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:1892` (`probe`) → `:1912` (`runInfo`, real `ffmpeg -i` exec) → `:1946` (`metadataFromLog`, real log parse). No canned output, no golden short-circuit, no input→output copy, no error swallowing that fakes success (it explicitly throws if no `Input #` block is present, `adapter.ts:1924`).
- **Verdict: REAL.** Real fixture + real `ffmpeg -i`-driven implementation + meaningful structural oracle. The only soft spot is the loose 0.5s duration band, but it is correct for a header-less container and the winner's *actual* estimate (Δ 0.0040s) is far tighter than the gate.
- **Cached note:** All 7 entries have `cached: true` ("cached previous PASS result"). Results were **reused, not re-run** in this batch. Staleness risk applies to the absolute wall numbers, and especially to the 1.08x ffmpeg-vs-mediabunny ordering, which could flip on a fresh run.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict (all 6 genuinely PASS, mp4box honestly NA) is high-confidence and code-verified. The *winner selection* is low-confidence: 6 engines tie on the only oracle, and ffmpeg-wasm wins purely on a **1.08x wall margin from a single sample (n==1, mad==0)** — inside measurement noise and against a co-tied mediabunny.
- The 5.305 ms wall for an ffmpeg.wasm probe is suspiciously fast for an actual `ffmpeg -i` exec; at this scale the `wall` bench is almost certainly timing the warm in-memory log/parse step, not a cold WASM spin-up. Treat it as a per-probe steady-state number, not end-to-end.
- All results `cached: true`; a fresh re-run could re-order ffmpeg-wasm vs mediabunny. The clear, robust finding is the *tier separation*: ffmpeg-wasm/mediabunny (~5–6 ms) << platform/web-demuxer/remotion-webcodecs (16–28 ms) << remotion-media-parser (~1918 ms).
