# remux/vp8_720p_10s_webm_to_mkv

family: remux | fixture asset: `fixtures/media/vp8_720p_10s.webm` (VP8 video + Vorbis audio, ~1.3 MB) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (`ffmpeg-wasm`).
- CONTESTED: 2 engines PASS (`ffmpeg-wasm`, `mediabunny`); the other 5 are NA_ENGINE (undeclared capability).
- Decisive factor: PERFORMANCE. Both PASS engines satisfy the identical single gate (`reference-reimport`) with byte-for-byte equal structural results (771 packets, 476 keyframes, 2 media tracks), so correctness is a tie. ffmpeg-wasm wins on the primary metric (wall) and on throughput.
- Margin over runner-up (mediabunny): wall 13.12 ms vs 14.37 ms = **1.10x faster**; throughputRealtime 762.4x vs 696.1x = **1.10x higher**. Both measured at n==1 (single sample, mad==0), so the margin is real but thin and weakly-supported. mediabunny shows a far lower longtasks figure (see caveats).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 13.12 | 762.42 | 93,450,087 | 4531 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 14.37 | 696.10 | 0 (not sampled) | 19963 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

This is a lossless container conversion: a VP8 video track and a Vorbis audio track must be lifted out of the WebM (Matroska subset) wrapper and re-laced into a full Matroska (`.mkv`) container with the coded bitstream copied verbatim — no pixel re-encode, no resample. The gating oracle is `reference-reimport` (src/core/oracles.ts:1225, semantic remux branch at oracles.ts:1273 `semanticRemuxReimport`), which feeds the engine's output bytes back through the reference engine's demuxer and checks media-track count, per-type track layout, and duration drift against the golden (`fixtures/golden/vp8_720p_10s.webm.meta.json`: 2 tracks — vp8 video + vorbis audio, durationSec 10.003). Both PASS engines re-imported to exactly **771 packets, 476 keyframes, 2 media tracks vs 2 golden tracks** — identical structural fingerprints — with duration deltas well inside the 0.1 s tolerance: ffmpeg-wasm Δ=0.020 s, mediabunny Δ=0.003 s. Correctness is therefore a dead heat; the contest is decided on speed.

ffmpeg-wasm performs the remux as a pure stream copy: `remux()` (src/engines/ffmpeg-wasm/adapter.ts:2031) probes the input, runs `assertRemuxContainerCompatible` (adapter.ts:903 — VP8/Vorbis are both legal in the target so no NA is thrown), then issues `ffmpeg [...] -i <in> -map 0 -c copy <out>.mkv` (adapter.ts:2044). The `-map 0 -c copy` path does zero codec work: it demuxes WebM blocks and re-laces them into Matroska clusters, so the wasm CPU cost is essentially I/O plus EBML re-emission. That is why the wall median is just **13.12 ms** and effective throughput is **762x realtime** for a 10 s clip — the operation never touches the VP8/Vorbis decoders.

mediabunny does the same logical job via its `Conversion` API: `remux()` (src/engines/mediabunny/adapter.ts:1244) builds an `MkvOutputFormat` via `makeOutputFormat(opts.container, ...)` (adapter.ts:1250), opens the input, and runs `runConversion` (adapter.ts:842) which drives read→(copy)→mux to a `BufferTarget`. Its config (`env.configUsed`) shows `backend: webcodecs`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`. For a remux the Conversion recognizes the codecs are unchanged and stream-copies the packets rather than invoking WebCodecs, so the WebCodecs backend is mostly idle here. mediabunny is marginally slower (14.37 ms; 696x realtime) — a 1.10x gap. Both numbers are tiny absolute values on a 1.3 MB file, so this is a narrow win driven by per-call overhead (mediabunny's TS Conversion orchestration vs ffmpeg's single native exec), not an algorithmic difference.

Memory is not a clean tiebreaker: ffmpeg-wasm reports peakMemory 93.45 MB (its wasm heap is allocated up front), while mediabunny reports 0 because peakMemory was not sampled (n==0 in its bench block) — so this is missing data, not a 0-byte footprint. The COOP/COEP / SharedArrayBuffer tiebreakers do not separate them: ffmpeg here runs single-thread (`threadArgs()` empty unless wasmThreads>1) and mediabunny explicitly needs no cross-origin isolation. The decisive, defensible signal remains the primary metric (wall) plus throughput, both favoring ffmpeg-wasm by 1.10x.

## What each other framework did wrong

- **mediabunny@1.48.0** (runner-up, PASS): correct and genuine, but 1.10x slower on wall (14.37 vs 13.12 ms) and 1.10x lower throughput (696.1 vs 762.4x). It actually had the tighter duration delta (0.003 s vs ffmpeg's 0.020 s), but that is far inside tolerance and does not change the PASS verdict. Lost purely on the primary perf metric.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". Honest NA — MP4Box is an ISOBMFF (MP4/MOV) tool and genuinely cannot parse Matroska/WebM input; it has no business reading a VP8/Vorbis WebM.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest NA — its mux targets are WebCodecs-friendly containers (MP4/WebM); it does not emit full Matroska/MKV.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — it is a read-only parser/demuxer with no muxing/remux write path.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — the bare browser platform exposes decode/playback, not a container-remux primitive.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — as the name says, it demuxes only; no remux/mux output.

## Anti-cheat validation

- Scenario definition: src/scenarios/remux/index.ts:88 — `{ asset: 'vp8_720p_10s.webm', from: 'webm', to: 'mkv', videoCodecs: ['vp8'], audioCodecs: ['vorbis'] }`, built via `buildRemux` in src/scenarios/remux/_shared.ts:84 with default oracle set `['reference-reimport']` (_shared.ts:78).
- Fixture: `fixtures/media/vp8_720p_10s.webm` EXISTS (1.3 MB, real VP8+Vorbis clip; golden meta at fixtures/golden/vp8_720p_10s.webm.meta.json confirms vp8 video 1280x720@30 + vorbis 48kHz stereo, 10.003 s). Not synthetic/empty/mock.
- Oracle: src/core/oracles.ts:1225 (`referenceReimport`) → oracles.ts:1273 (`semanticRemuxReimport`). It really re-demuxes the engine output, rejects empty packet tables (oracles.ts:1244), and compares media-track count + per-type layout + duration drift (tol 0.1 s) against golden. Not trivially satisfiable; measurements (771 packets, 476 keyframes, 2/2 tracks, Δ 0.003–0.020 s) are physically plausible for a 10 s 30 fps clip.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2031 (`remux`) issues a real `ffmpeg -i <in> -map 0 -c copy <out>.mkv` (adapter.ts:2044), reads the produced bytes back (adapter.ts:2064), and throws on non-zero exit (adapter.ts:1819 `run`). No canned output, no input→output passthrough, no golden short-circuit, no swallowed errors.
- Cached note: BOTH PASS results have `cached: true` ("cached previous PASS result"). Evidence was reused, not re-run this cycle — staleness risk applies to the exact perf numbers. Per the launcher-seeding caveat, a fully honest fresh perf delta would require clearing raw + .browser-cache.
- Verdict: **REAL** — real fixture + real stream-copy implementation + meaningful structural oracle. The only soft spot is that the gate is structural (not bit-exact decoded-frames), and the perf margin rests on n==1 cached samples.

## Confidence & caveats

- Confidence: medium. The winner choice (ffmpeg-wasm) is correct under the decision procedure, but the margin is small (1.10x) and both perf samples are n==1 with mad==0 (single observation), so the speed ranking is low-evidence.
- The two engines are structurally indistinguishable on correctness (identical 771/476/2/2 fingerprints); a fresh re-run could plausibly flip the sub-2-ms wall gap.
- `longtasks` strongly favors mediabunny (4531 ms... actually 19963 ms for mediabunny vs 4531 ms for ffmpeg) — ffmpeg has the LOWER longtasks (4531 vs 19963 ms), reinforcing the ffmpeg win on main-thread responsiveness; but longtasks here likely aggregates warm-up and is also n==1.
- peakMemory is uncomparable: ffmpeg 93.45 MB (sampled) vs mediabunny 0 (not sampled, n==0) — treated as missing data, not a footprint advantage.
- Both results are cached; the ranking should be re-confirmed on a clean fresh run before being treated as a stable leaderboard entry.
