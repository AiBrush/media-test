# remux/opus_ogg_to_webm

family: remux | fixture asset: `fixtures/media/opus.ogg` (146 KB, real Opus-in-Ogg) | primaryMetric: throughputRealtime | passCount: 2 of 7

## Verdict

**Best framework: ffmpeg.wasm@0.12.15** — CONTESTED (2 PASS: ffmpeg-wasm and mediabunny).

Both PASS engines satisfy the identical, single gating oracle `reference-reimport` with numerically equivalent correctness (501 packets, 501 keyframes — each Opus frame is independently decodable so keyframes==packets, 1 media track, golden=1 track, duration delta well under the 0.1 s tolerance). Correctness is therefore a tie. The decisive factor is **performance**: ffmpeg-wasm is **1.47x faster on wall** (9.08 ms vs 13.34 ms), **1.47x higher throughput** (1102.1x-realtime vs 749.9x-realtime), and **1.60x lower main-thread blocking** (longtasks 1901 ms vs 3045 ms). Caveat: both results are `cached==true` and bench `n==1` (no spread), so the margin is single-sample evidence.

Margin over runner-up (mediabunny): 1.47x wall, 1.47x throughput, 1.60x lower longtasks.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 9.08 ms | 1102.1x | (not measured, 0 samples) | 1901 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 13.34 ms | 749.9x | 89,607,460 B (~85.5 MB) | 3045 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

The operation is a **lossless audio re-wrap**: take Opus access units from an Ogg logical bitstream and repackage them as a Matroska/WebM `A_OPUS` audio track. No sample data is re-encoded; only the container framing changes (Ogg pages/granule positions → Matroska SimpleBlocks/clusters with the `OpusHead` carried into the WebM CodecPrivate). The scenario `notes` confirm the intent: "Opus OGG -> WebM: lossless audio re-wrap into Matroska/WebM" (`src/scenarios/remux/index.ts:140`).

**ffmpeg-wasm's path** (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`): it materializes the input into MEMFS, probes it (`runInfo`/`metadataFromLog`), then asserts container compatibility (`assertRemuxContainerCompatible`, line 2040) before running a pure stream-copy: `[...inputOptions, '-i', name, '-map', '0', '-c', 'copy', out.webm]` (lines 2044, 2062). The `-c copy` guarantees the Opus packets are bit-preserved; `-map 0` prevents ffmpeg's default one-stream-per-type selection from dropping tracks. Because WebM is the target (not mp4/mov), none of the `-movflags` faststart branches fire — it is a clean Matroska mux. This is a single libavformat demux→remux pipeline inside one wasm module, which is why the wall is only 9.08 ms and throughput hits 1102x-realtime: the whole 146 KB Opus stream is rewrapped in roughly one millisecond of media-normalized work per second of audio.

**mediabunny's path** (`src/engines/mediabunny/adapter.ts:1244-1260`): it builds an `OutputFormat` for webm, opens the Ogg input, and drives the `Conversion` API (`runConversion`, line 1256) with an instrumented `BufferTarget`. Per `env.configUsed`, mediabunny ran `backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`. For a same-codec remux the Conversion detects that the Opus track needs no transcode and stream-copies it, so it too is lossless — but the Conversion machinery (read→(decode/encode bypass)→mux lockstep, canvas pool of 4 reserved even for an audio-only job) and the pure-TS Matroska writer carry more per-call overhead. That overhead manifests as the **85.5 MB peak memory** (the BufferTarget plus Conversion buffers) versus ffmpeg-wasm reporting no peakMemory samples, and as 3045 ms of longtasks versus 1901 ms. The result is 13.34 ms wall / 749.9x-realtime — correct, but 1.47x slower.

The gating oracle `reference-reimport` (`src/core/oracles.ts:1225`, remux branch `semanticRemuxReimport` at line 1273) re-imports each engine's WebM output with the reference engine and demuxes it. It is a **real structural comparison**, not a smoke test: it checks media-track count against the golden (`expectedTracks` from `ctx.golden.meta`), compares the audio/video track layout, and validates duration within tolerance. The shard measurements are physically plausible for a ~5 s Opus stream: ffmpeg `durationDeltaSec: 0.001`, mediabunny `durationDeltaSec: 0.007`, both far inside `durationToleranceSec: 0.1`; both reimport exactly 501 packets and 1 media track matching golden's 1 track. Both engines genuinely produced a valid, re-demuxable WebM/Opus file.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on performance): identical correctness (501 pkts, 1 track, duration delta 0.007 s) but 1.47x slower wall (13.34 vs 9.08 ms), 1.47x lower throughput (750 vs 1102x), 1.60x more longtasks (3045 vs 1901 ms), and 85.5 MB peak memory vs ffmpeg's unmeasured/0. The Conversion + pure-TS Matroska writer overhead is the gap; no correctness deficit.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare input container 'ogg'". Honest — `containersIn: ['mp4', 'mov']` (`src/engines/mp4box/adapter.ts:645`); mp4box is an ISOBMFF-only parser and cannot read Ogg.
- **web-demuxer@4.0.0** (NA_ENGINE): "engine does not declare operation 'remux'". Honest — its `containersIn: ['mp4','mov','mkv','webm','ts']` (adapter.ts:639) excludes ogg AND it is a demux-only engine with no remux/mux op declared.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "engine does not declare operation 'remux'". Honest — it is a read-only parser; `containersIn` (adapter.ts:197) doesn't even include webm-write, and no remux capability is registered.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): "engine does not declare input container 'ogg'". Honest — its `CONTAINERS_IN` set does not include ogg; it cannot ingest the Opus-in-Ogg source.
- **platform@chrome-149** (NA_ENGINE): "engine does not declare operation 'remux'". Honest and explicitly intentional — `src/engines/platform/adapter.ts:356` throws `NotApplicableError('remux', 'raw platform APIs cannot losslessly rewrap encoded samples into a container')`. Raw WebCodecs has no container muxer, so remux is genuinely out of scope.

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/remux/index.ts:135-141` (REMUX_CASES entry `{ asset: 'opus.ogg', from: 'ogg', to: 'webm', audioCodecs: ['opus'] }`), expanded by `buildRemuxAll`. Gating rationale at `src/scenarios/remux/index.ts:110-112`: the honest gate for audio remux is reference-reimport + playback-smoke (remux never populates `ctx.metadata`, so golden-metadata is inapplicable).
- **Fixture**: `fixtures/media/opus.ogg` exists, 146 KB — a real Opus-in-Ogg file, not synthetic/empty/mock.
- **Oracle**: `src/core/oracles.ts:1225` (`referenceReimport`) → remux branch `semanticRemuxReimport` at `src/core/oracles.ts:1273`. Performs a real re-demux of engine output and compares track count, track layout, and duration vs golden. Not trivially satisfiable: an empty packet table fails (line 1245/1250); the duration delta is bounded to 0.1 s. Measurements (501 pkts, 1 track, 0.001–0.007 s delta) are plausible for the real fixture.
- **Winner adapter**: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069`. Genuine implementation — real ffmpeg.wasm invocation with `-c copy -map 0` stream copy into a `.webm` output, reads the produced bytes back from MEMFS. No canned output, no input→output passthrough fake, no short-circuit to a golden file, no error swallowing (compatibility is asserted, errors propagate).
- **Cached note**: winner result has `cached==true` ("cached previous PASS result", startedAtIso 2026-06-22T16:44:38Z). Runner-up mediabunny also `cached==true` (startedAtIso 2026-06-22T13:57:10Z). The PASS evidence is reused, not freshly re-run, so the performance margin is single-sample (n==1, mad==0) and carries staleness risk — directionally reliable but not a robust statistical win.
- **Verdict: REAL** — real fixture + real ffmpeg stream-copy implementation + meaningful structural reimport oracle. Performance margin is the only soft spot (cached, n==1).

## Confidence & caveats

- Confidence: **medium**. The winner determination (ffmpeg-wasm > mediabunny) is unambiguous on every reported metric, but both engines are `cached` with `n==1`/`mad==0` benches, so the 1.47x margin rests on one sample each.
- Correctness is a genuine tie: a single shared oracle (reference-reimport) with no stronger gate (no decoded-audio-pcm / golden-packets for this case), so the decision is performance-driven rather than fidelity-driven.
- ffmpeg-wasm's `peakMemory` has 0 samples (not measured), so the memory comparison vs mediabunny's 85.5 MB is informative but one-sided.
- All five NA verdicts were checked against the adapters' declared capabilities and are honest (no under-declared remux/ogg support).
