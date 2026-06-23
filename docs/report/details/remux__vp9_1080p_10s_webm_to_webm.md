# remux/vp9_1080p_10s_webm_to_webm

family: remux | fixture asset: `fixtures/media/vp9_1080p_10s.webm` (9.3 MB, VP9 1920x1080@30 + Opus 48 kHz stereo, dur 10.008 s) | primaryMetric: wall | passCount: 3 / 7

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED (3 engines PASS: mediabunny, ffmpeg.wasm, remotion-webcodecs).

All three passing engines satisfied the identical and only gating oracle (`reference-reimport`) with byte-for-byte identical measurements (801 packets, 506 keyframes, 2 media tracks, duration delta within tolerance). Correctness is therefore a dead heat, so the decision falls to **performance**.

Decisive factor: **wall-clock throughput**. mediabunny finishes the WebM->WebM identity re-mux in **48.17 ms** (207.76x realtime) versus ffmpeg.wasm at 77.44 ms (129.24x) and remotion-webcodecs at 157.91 ms (63.38x).

Margin over runner-up (ffmpeg.wasm): **1.61x faster wall** (48.17 vs 77.44 ms), **1.61x higher throughputRealtime** (207.76x vs 129.24x), and a **9.28x lower main-thread blocking budget** (longtasks 2152 ms vs 19963 ms). Over the third place (remotion-webcodecs): **3.28x faster wall**.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 48.17 | 207.76 | n/a (n=0) | 2152 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 77.44 | 129.24 | n/a (n=0) | 19963 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | reference-reimport:pass | 157.91 | 63.38 | n/a (n=0) | 1901 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Note: peakMemory has n=0 samples for every engine (not instrumented for this row), so it cannot break the tie. targetWrites / sourceReads are also n=0. The tie is broken on wall / throughput / longtasks, all n=1 (single timed sample, mad=0) — weaker statistical evidence; see caveats.

## Why the winner wins (deep technical)

This scenario is a **VP9/Opus WebM -> WebM identity container re-mux** (matrix.ts:91-100). Because VP9 and Opus are both legal Matroska/WebM payloads, the correct operation is a pure re-wrap: demux the EBML/Matroska elements, copy the encoded VP9 frames and Opus packets unchanged, and re-emit a fresh WebM (new SeekHead/Cues/Clusters). No decode or re-encode is required, and none of the three winners performs one.

mediabunny ran with `configUsed.backend = "webcodecs"`, `hwAccel = "prefer-hardware"`, `pipeline = "streaming-lockstep"`, `coreBuild = "pure-ts-esm"`, `sharedArrayBuffer = false`, `coopCoep = "not-required"`. Its remux path (`src/engines/mediabunny/adapter.ts:1244-1260`) builds an `Output` with the target WebM format and calls `runConversion` with **no `video`/`audio` transform options**. In mediabunny a transform-less `Conversion` copies encoded samples verbatim (`src/engines/mediabunny/adapter.ts:842-868`: `Conversion.init` -> `conversion.execute()` writing into a `BufferTarget`), so the VP9 frames and Opus packets are demuxed and re-multiplexed without ever entering a `VideoDecoder`/`VideoEncoder`. That is why it needs no WebCodecs hardware path for the actual byte work and finishes in ~48 ms: it is essentially an EBML parse + EBML write over a 9.3 MB buffer. The 2152 ms longtasks figure reflects the suite's full warmup/instrumentation window rather than the 48 ms of muxing work itself; relative to the other two it is the second-lowest blocking budget.

The gating oracle is `reference-reimport` (`src/core/oracles.ts:1225-1271` -> `semanticRemuxReimport` 1273-1324). It is a genuine structural-integrity gate: it feeds mediabunny's output bytes back into the **reference engine's** `demux()` and compares the resulting packet table and track topology against the goldens. For mediabunny it observed **reimportPackets = 801, reimportKeyframes = 506, reimportMediaTracks = 2, goldenMediaTracks = 2, durationDeltaSec = 0.007 (tol 0.1)**. Those numbers are physically consistent with the source: 10 s of 30 fps VP9 (~300 video frames) plus 10 s of Opus at 20 ms/frame (~500 audio frames, every Opus frame a keyframe) gives ~800 packets and ~500+ keyframes, and the duration delta of 7 ms is exactly the kind of Cluster/block-rounding tail you expect from an honest re-wrap. The output round-trips through an independent demuxer with both the video and audio tracks intact — a real correctness signal, just not a pixel-level one (see anti-cheat note on oracle strength).

ffmpeg.wasm (env.engineId `ffmpeg-wasm`) and remotion-webcodecs produced byte-equivalent structural results (identical 801/506/2 measurements; remotion's durationDelta also 0.007 s, ffmpeg's 0.020 s — both well inside the 0.1 s band) so neither is *wrong*. They simply lost on speed. ffmpeg.wasm pays the single-thread wasm tax: the libavformat demux/mux of a 9.3 MB file inside the wasm VM costs 77.44 ms wall and, critically, **19963 ms of longtasks** — a ~9.3x heavier main-thread stall than mediabunny, the worst of any engine here, because the monolithic wasm `-c copy` invocation runs as one long synchronous task. remotion-webcodecs (`pipeline = "streaming-backpressure"`, `writer = "bufferWriter"`) is the slowest in wall (157.91 ms, 3.28x slower than mediabunny) despite the lowest longtasks (1901 ms); its streaming/backpressure convert path adds per-chunk scheduling overhead that dominates on a job this small. Against both, mediabunny's lean transform-less `Conversion` over a single in-memory `BufferTarget` is simply the most direct route from EBML-in to EBML-out.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed correctness (identical 801 pkts / 506 kf / 2 tracks, durationDelta 0.020 s < 0.1) but lost on performance: 77.44 ms wall (1.61x slower than mediabunny) and 19963 ms longtasks (9.28x more main-thread blocking) due to single-thread wasm `-c copy` running as one synchronous task.
- **remotion-webcodecs@4.0.479** — PASSed correctness (identical 801/506/2, durationDelta 0.007 s) but is the slowest by wall: 157.91 ms (3.28x slower than mediabunny, 2.04x slower than ffmpeg); its streaming-backpressure convert pipeline adds per-chunk overhead that dominates a 10 s clip.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — remotion-media-parser is a demux/parse library only; it has no muxer, so it genuinely cannot write a WebM.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — as the name implies it is a demux-only wasm binding with no mux/write path.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". Honest NA — MP4Box.js is an ISOBMFF (MP4/MOV) toolkit and cannot parse Matroska/WebM input; it could never read this VP9-in-WebM source.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — the raw browser platform exposes WebCodecs decode/encode but no container muxer, so a remux op is not declared.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/matrix.ts:91-100` (the VP9/Opus WebM->WebM identity case), built via `buildRemux` in `src/scenarios/remux/_shared.ts:84-104`; id scheme `src/scenarios/remux/_shared.ts:73-75`.
- Fixture: `fixtures/media/vp9_1080p_10s.webm` — **exists**, 9.3 MB, real VP9 1080p + Opus media (golden meta `fixtures/golden/vp9_1080p_10s.webm.meta.json`: webm, 10.008 s, VP9 1920x1080@30, Opus 48 kHz/2ch). Not synthetic/empty/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1260` (remux) and `:842-868` (runConversion). Confirmed GENUINE: it opens the real input, builds a real `Output`, calls `mb.Conversion.init` + `conversion.execute()`, and returns the actual `BufferTarget` bytes. No canned output, no input->output copy faking a remux, no short-circuit to the golden file, no error-swallow-then-report-success (an invalid conversion throws at adapter.ts:849-853).
- Oracle: `src/core/oracles.ts:1225-1271` (`referenceReimport`) -> `:1273-1324` (`semanticRemuxReimport`). Real comparison: re-demuxes the engine output with the reference engine and checks track count, per-type track layout, and duration delta vs goldens. NOT trivially satisfiable (empty packet table fails at :1244-1246; track-count/layout mismatch and duration drift > tol produce diffs/fail). Measurements (801 pkts, 506 kf, 2 tracks, Δ0.007 s) are physically plausible for a 10 s 30 fps VP9 + 20 ms Opus stream.
- Caveat on oracle strength: this is a **structural** gate, not bit-exact. The matrix.ts:99 note claims "decoded pixels must be bit-identical", but the default oracle set (`_shared.ts:78-81`) attaches ONLY `reference-reimport`; `decoded-frames-bitexact` is intentionally deferred while frame goldens are placeholders (`_shared.ts:20-22`). So the PASS is real and meaningful but does not prove pixel identity of the copied VP9 frames.
- cached: **all three PASS results have cached==true** ("cached previous PASS result"). The numbers were reused, not freshly re-run this pass — staleness risk. mediabunny startedAt 2026-06-22T14:04Z, ffmpeg 14:01Z, remotion-webcodecs 16:44Z.

Verdict: **WEAK-GATE**. Real fixture + real mediabunny implementation + a real (non-trivial) re-import oracle, but the single attached gate is structural/semantic rather than the bit-exact pixel gate the scenario notes advertise, so correctness among the three PASS engines cannot be differentiated below container topology + duration. The winner is therefore decided purely on performance.

## Confidence & caveats

- Performance margins (1.61x over ffmpeg, 3.28x over remotion) rest on **n=1** samples (mad=0, single timed run) for wall/throughput/longtasks — directionally clear but statistically thin; a multi-sample re-run would firm this up.
- peakMemory/targetWrites/sourceReads are uninstrumented (n=0) for this row, so the tiebreak could not consider memory or I/O counts.
- All winning evidence is **cached** (cached==true); a fresh re-run is advisable before treating these exact numbers as authoritative.
- The three-way correctness tie is an artifact of the structural-only oracle; if `decoded-frames-bitexact` were attached the ranking could in principle change (though all three are lossless sample-copy paths, so a different outcome is unlikely).
- Confidence: medium — winner identity (mediabunny) is robust (fastest by a wide, consistent margin across wall, throughput, and longtasks vs ffmpeg), but the cached + n=1 + weak-gate combination caps confidence below high.
