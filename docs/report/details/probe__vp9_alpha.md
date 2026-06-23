# probe/vp9_alpha

family: probe | fixture asset: `vp9_alpha.webm` (749 KB, real fixture present in `fixtures/media/`) | primaryMetric: wall | passCount: 6 of 7

## Verdict

- Best framework: **mediabunny@1.48.0**.
- CONTESTED: 6 of 7 engines PASS the identical, single gating oracle (`golden-metadata`) at identical strictness; the winner is decided purely on PERFORMANCE.
- Decisive factor: lowest wall-clock probe time. mediabunny median wall = **3.005 ms**, versus runner-up ffmpeg.wasm at **8.695 ms** -> **2.89x faster** wall. Against the slowest passing engine (platform/Chrome WebCodecs at 6000.03 ms) it is ~1997x faster.
- Caveat: every entry in this shard is `cached==true` (reused prior PASS) and every bench has `n==1` (no spread; mad==0, p95==median), so the performance margin is weak statistical evidence even though the ordering is large and consistent.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 3.005 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 8.695 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 9.130 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 16.255 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 17.810 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 6000.030 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

No `throughputRealtime`, `peakMemory`, or `longtasks` metrics are present in this shard; the only bench metric recorded is `wall`.

## Why the winner wins (deep technical)

This is a metadata-only probe of a **VP9 video-only WebM** (Matroska/EBML container, 640x480 @ 30 fps, 5.000 s, codec `vp9`, single video track, encoder tag `Lavf`, per `fixtures/golden/vp9_alpha.webm.meta.json`). The operation never decodes a frame; correctness is purely "does the normalized metadata match golden". The alpha aspect is decode-time only and is explicitly NOT asserted by this probe (`src/scenarios/probe/index.ts:126-129`): the gate here is the VIDEO-ONLY invariant that the golden lists exactly ONE video track, so `golden-metadata`'s track-count diff asserts count==1 and the positional compare asserts it is a video track with codec vp9, width 640, height 480, fps within tolerance.

Because the oracle is identical and binary for all six passers, no engine can distinguish itself on correctness here -- every one reports `durationDeltaSec` well inside the ±1-frame band (`durationToleranceSec` = 1/24 = 0.041666...s). Five of the six report `durationDeltaSec == 0` (exact 5.000 s from the EBML/Segment Info `Duration` * `TimecodeScale`); only platform reports `durationDeltaSec == 0.033` (still < 0.04166 tol, so it passes). The contest therefore collapses to wall time.

mediabunny wins on mechanism: it opens the file with a real `mb.Input` constrained to the WebM input format (`src/engines/mediabunny/adapter.ts:245-277`, `openInput` pushes the container-specific `InputFormat` from `inputFormatForContainer('webm')` rather than `ALL_FORMATS`, so the EBML demuxer is selected directly with no format sniffing). Track normalization (`src/engines/mediabunny/adapter.ts:297-330`, `normalizeTrack`) reads the WebM `TrackEntry`/`Video` element getters -- `getCodec()`, `getDisplayWidth()`, `getDisplayHeight()`, `getRotation()` -- which are pure header/EBML reads, and computes duration via the cheap `getDurationFromMetadata()`-first path documented at `adapter.ts:34-37` (Segment Info Duration), avoiding any full-cluster scan. fps is estimated from a 120-packet prefix via `v.computePacketStats(120)` (`adapter.ts:312`); for a 30 fps file this is a bounded cue/cluster walk, not a full decode. The net is a pure-TypeScript ESM core (`coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false` in `env.configUsed`) that parses only the EBML header region -> 3.005 ms.

The runner-up, ffmpeg.wasm (8.695 ms), is ~2.89x slower because even a metadata probe pays the wasm module/FS round-trip: the file must be written into the MEMFS virtual filesystem and parsed by libavformat's matroska demuxer inside the wasm sandbox, an init-and-IO overhead that dominates a sub-10ms probe. remotion-media-parser (9.130 ms, `backend: "cpu-js"`, `fieldsTier: "metadata-only"`) is a pure-JS streaming parser that is competitive but still ~3x mediabunny. remotion-webcodecs (16.255 ms) and web-demuxer (17.810 ms) carry heavier setup (WebCodecs/worker-capable pipeline and a wasm demux core respectively) for what is a trivial header read.

The outlier is platform@chrome-149 at **6000.03 ms** -- ~2000x slower. Its `env.configUsed` shows `decode: "VideoDecoder"` and `encode: "<video>→canvas→MediaRecorder(out)"`: the browser-native path has no cheap metadata API for WebM, so it routes the probe through an `HTMLMediaElement`/MediaSource-style load to obtain duration and track info, and the ~6 s figure is dominated by media-element readiness/loadedmetadata latency rather than parsing. It still passes (duration delta 0.033 s < tol), but it is by far the most expensive way to read an EBML header.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost): correct metadata but 8.695 ms vs 3.005 ms -> 2.89x slower; wasm MEMFS write + libavformat matroska demux overhead dominates a header-only probe.
- **remotion-media-parser@4.0.479** (PASS, lost): correct, `cpu-js` metadata-only parse at 9.130 ms -> 3.04x slower than mediabunny.
- **remotion-webcodecs@4.0.479** (PASS, lost): correct at 16.255 ms -> 5.41x slower; the WebCodecs/worker-capable conversion pipeline is heavier setup than a pure EBML header read needs.
- **web-demuxer@4.0.0** (PASS, lost): correct at 17.810 ms -> 5.93x slower; slowest of the lightweight demuxers, consistent with a wasm demux core spin-up.
- **platform@chrome-149** (PASS, lost): correct (durationDeltaSec 0.033 < tol 0.04166) but 6000.03 ms -> ~1997x slower; native media-element load latency, no cheap WebM metadata API.
- **mp4box@2.3.0** (NA_ENGINE): honest NA -- "engine does not declare input container 'webm'". mp4box is an ISO-BMFF (MP4/MOV/fMP4) parser only; it genuinely cannot parse EBML/Matroska, so this is an honest capability gap, not an under-declaration.

## Anti-cheat validation

- Scenario definition: `src/scenarios/probe/index.ts:122-130` -- the vp9_alpha case (`asset: 'vp9_alpha.webm'`, `container: 'webm'`, `videoCodecs: ['vp9']`). Notes (`:126-129`) document the VIDEO-ONLY / track-count==1 gating rationale; alpha is decode-time and intentionally not asserted by probe.
- Fixture: `fixtures/media/vp9_alpha.webm` EXISTS, 749 KB -- a real, non-empty WebM, not synthetic/mock/empty.
- Golden: `fixtures/golden/vp9_alpha.webm.meta.json` EXISTS with physically plausible values (webm, 5 s, single vp9 video track 640x480@30, bitrate 1,198,352, encoder Lavf).
- Oracle: `golden-metadata` at `src/core/oracles.ts:593-657`. It performs a REAL comparison: container string, duration within a strict ±1-frame band (`durationToleranceFor`, `oracles.ts:610-637`; tol 0.041666 s here, NOT a loose container), track-count diff (`:645-646`), and positional per-track codec/width/height/fps/sampleRate/channels compare (`compareTrack`, `:659-686`). Not trivially satisfiable: a wrong codec, wrong dims, extra/missing track, or >1-frame duration drift all FAIL. Measurements in the shard are plausible (durationDeltaSec 0 for five engines, 0.033 for platform; tol 0.041666).
- Winner adapter: `src/engines/mediabunny/adapter.ts` -- `openInput` (`:245-277`) constructs a real `mb.Input` with the WebM `InputFormat`; `normalizeTrack` (`:297-330`) reads real mediabunny track getters; duration uses the cheap metadata-first path (`:34-37`). No hardcoded/canned output, no short-circuit to golden, no input-copy fakery, no error-swallow-as-success (errors map to null fields, which would FAIL the diff, not silently pass).
- Cached note: ALL seven entries are `cached==true` ("cached previous PASS result"). The evidence is reused, not freshly re-run; combined with `n==1` benches this is a staleness risk for the exact wall numbers, though the ranking is robust to it.
- Verdict: **REAL** -- real fixture + real EBML-parsing implementation + a meaningful, strict (±1 frame, exact dims/codec/track-count) metadata oracle.

## Confidence & caveats

- Confidence: medium. The correctness gate is real and strict, the winner's code path is genuine, and the wall ordering (mediabunny 3.005 ms fastest by a 2.89x margin) is large and consistent.
- Downgrade reasons: (1) all results are cached, so numbers were not re-measured this run; (2) every bench is n==1 with mad==0 and p95==median, so there is no variance evidence -- a single noisy sample could shift small gaps (the 8.695 vs 9.130 ms gap between ffmpeg.wasm and remotion-media-parser is within plausible single-sample noise, but neither threatens the winner).
- The contest is a pure performance tie-break since all six passers satisfy the same single oracle identically; mediabunny would not win on correctness strength alone here, only on speed.
