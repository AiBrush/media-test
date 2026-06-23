# remux/h264_in_mkv_mkv_to_mp4

family: remux | fixture asset: `h264_in_mkv.mkv` (4.4 MB, real Matroska, H.264 1280x720@30 + AAC 48k stereo, dur 10.021s) | primaryMetric: wall | passCount: 3/7

## Verdict

- **Best framework: `mediabunny@1.48.0`** (engineId `mediabunny`).
- **CONTESTED**: 3 engines PASS (mediabunny, ffmpeg-wasm, remotion-webcodecs). All three pass the *same* single oracle (`reference-reimport`) at comparable structural strength, so the decision falls through to **performance**.
- **Decisive factor: wall-clock / throughput.** mediabunny remuxes in **55.82 ms** (179.52x realtime) vs ffmpeg-wasm 90.37 ms (110.89x) and remotion-webcodecs 630.02 ms (15.91x).
- **Margin over runner-up (ffmpeg-wasm):** **1.62x faster wall** (90.37 / 55.82), **1.62x higher throughput** (179.52 / 110.89). Over remotion-webcodecs: **11.29x faster wall**, **11.29x throughput**.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 55.82 ms | 179.52x | 0 (unmeasured) | 5077 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 90.37 ms | 110.89x | 0 (unmeasured) | 1017 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | reference-reimport:pass | 630.02 ms | 15.91x | 0 (unmeasured) | 1017 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mkv' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Notes: `peakMemory`, `sourceReads`, `targetWrites` all have n==0 samples for every engine (not instrumented for this run), so they cannot break the tie. All perf metrics are **n==1, mad==0, p95==median** — single-shot evidence (see caveats).

## Why the winner wins (deep technical)

This is a **lossless container change**: H.264 + AAC coded samples are demuxed from Matroska (EBML/Cues/Clusters) and re-wrapped into ISO-BMFF (MP4 moov/mdat) with **no pixel re-encode**. The fidelity bar is therefore structural integrity, and all three passing engines clear it. The gating oracle `reference-reimport` (src/core/oracles.ts:1225, dispatch at :1243 → `semanticRemuxReimport` :1273) re-imports each engine's MP4 output with the reference engine and checks media-track semantics: it requires a non-empty packet table and an exact media-track-count/layout match against the golden meta (2 media tracks). mediabunny's output re-imported as **770 packets, 475 keyframes, 2 media tracks** with a duration delta of only **0.016 s** against a 0.1 s tolerance — i.e. the re-wrapped MP4 reproduces essentially the original timeline.

Mechanistically mediabunny wins on **throughput of the demux→remux copy**, not correctness. Its remux path (src/engines/mediabunny/adapter.ts:1244) takes the no-transform branch: it builds the MP4 output format (`makeOutputFormat`, :1250), opens the MKV with `openInput` (:1252), and runs the library's `Conversion` engine (`runConversion`, :842 → `mb.Conversion.init` :848, `conversion.execute()` :855). Because no `video`/`audio` codec options are supplied, Conversion performs a **packet-level passthrough copy** of the encoded H.264/AAC samples straight into an in-memory `BufferTarget` (read back at :859-865). The config used was `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: "not-required"` — a pure-TypeScript ESM muxer that never pays a wasm module-instantiation / heap-copy tax and needs no cross-origin isolation. That is exactly why it lands at 55.82 ms / 179.52x realtime.

By contrast **ffmpeg-wasm** (90.37 ms, 110.89x) does the identical logical remux but inside the Emscripten/wasm sandbox: the 4.4 MB input must be written into the MEMFS virtual filesystem and the output read back out, and the libavformat MKV demuxer → MP4 muxer runs in a single wasm thread. It is correct (also 770 packets, 475 keyframes, 2 tracks, duration delta 0.0052 s — actually a slightly tighter timeline match than mediabunny) but ~1.62x slower on wall because of the FS marshalling and wasm overhead. Its much lower `longtasks` (1017 ms vs mediabunny's 5077 ms) reflects that ffmpeg-wasm keeps the heavy work off the main thread; mediabunny's streaming-lockstep copy runs main-thread, which is the one place ffmpeg-wasm is actually *better*. Wall/throughput still decide the family, so mediabunny wins, but this is the honest weak spot.

**remotion-webcodecs** (630.02 ms, 15.91x) is the slowest passer by an order of magnitude. Its config (`pipeline: "streaming-backpressure"`, `convert=main-thread`, `bufferWriter`) shows the remux runs on the main thread with WebCodecs-style backpressure plumbing; its re-import was **773 packets, 481 keyframes** (slightly more than the 770/475 the other two emit — extra leading/trailing packets, well within the oracle's 2% tolerance and the duration delta 0.048 s < 0.1 s), so it is correct but pays heavily for its conversion pipeline. 11.29x slower wall than mediabunny.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on perf only. Same oracle, even tighter duration delta (0.0052 s vs 0.016 s), but 1.62x slower wall (90.37 ms vs 55.82 ms) due to wasm/MEMFS marshalling. Honest runner-up.
- **remotion-webcodecs@4.0.479** — PASS, lost on perf. 11.29x slower wall (630.02 ms), 15.91x realtime only; main-thread backpressure conversion pipeline. Correct (773 pkts / 481 kf / 2 tracks).
- **mp4box@2.3.0** — NA_ENGINE: "does not declare input container 'mkv'". Honest: MP4Box.js is an ISO-BMFF (MP4/MOV) parser/segmenter and genuinely cannot ingest Matroska/EBML, so it cannot be the *source* demuxer for an MKV->MP4 remux. Not under-declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'remux'". Honest: it is a parser/prober, not a muxer; it has no MP4-write path.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'remux'". Honest: a demux-only library (name + scope); it can read MKV but has no mux/remux output path.
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'remux'". Honest: the bare browser platform exposes WebCodecs decode/encode and MSE playback but no container muxer, so it cannot author an MP4.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/index.ts:44` (`{ asset: 'h264_in_mkv.mkv', from: 'mkv', to: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] }`), built via `buildRemux` in `src/scenarios/remux/_shared.ts:84`; id derived by `remuxId` (:73) = `remux/h264_in_mkv_mkv_to_mp4`. Default oracle set is `['reference-reimport']` (`_shared.ts:78`).
- **Fixture exists & is real:** `fixtures/media/h264_in_mkv.mkv` — 4.4 MB on disk, real Matroska. Golden `fixtures/golden/h264_in_mkv.mkv.meta.json` declares H.264 1280x720@30 + AAC 48k stereo, durationSec 10.021, 2 tracks. Not synthetic/mock.
- **Oracle:** `reference-reimport` — `src/core/oracles.ts:1225`, remux branch :1243-1247, semantic check `semanticRemuxReimport` :1273-1299 (non-empty packet table required; exact media-track count + layout vs golden; duration within tolerance :1310+). A real re-parse of the produced bytes by an independent reference engine, with physically plausible measurements (770 pkts / 475 kf / 2 tracks for ~10 s of 30 fps + AAC). Not trivially satisfiable.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1244` (`remux`) → `runConversion` :842 → real `mb.Conversion.init`/`.execute` (:848/:855), output read from the library `BufferTarget` buffer (:859-865). No canned output, no input→output copy fake, no golden short-circuit, no error-swallowing (invalid conversion throws at :851).
- **Verdict: REAL** — real fixture + real mediabunny Conversion implementation + a meaningful structural re-import oracle with plausible measurements.
- **Cached note:** mediabunny's result has `cached: true` ("cached previous PASS result"), as do all 3 passers. Numbers were reused, not re-run this session — minor staleness risk; the PASS itself is real (the cached oracle measurements are internally consistent across the three engines: 770/475 vs 770/475 vs 773/481).

## Confidence & caveats

- Confidence: **high** on the verdict (clear, monotonic wall/throughput ordering; correctness genuinely tied) but the perf *margin* rests on **n==1 single-shot** samples (mad==0, p95==median) for every engine — a 1.62x gap on one sample is suggestive, not statistically firm. A repeat run could narrow or widen it.
- `peakMemory`, `sourceReads`, `targetWrites` were not instrumented (n==0), so the secondary tiebreakers (b: peakMemory) could not be applied.
- mediabunny's only structural weak spot vs ffmpeg-wasm is `longtasks` (5077 ms vs 1017 ms) — it blocks the main thread far longer; in a responsiveness-weighted ranking ffmpeg-wasm would be more attractive despite the slower wall.
- All three results are cached; treat as last-known-good rather than fresh.
