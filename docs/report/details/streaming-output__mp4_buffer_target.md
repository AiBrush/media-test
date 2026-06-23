# streaming-output/mp4_buffer_target

- **Family:** streaming-output
- **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio, ~31 MB, 30 s, 1080p; exists on disk, 31M)
- **Operation:** `remux` MP4→MP4, output shape `{ container:'mp4', fastStart:false, target:'buffer' }` (whole-blob progressive BufferTarget, **moov after mdat**)
- **primaryMetric:** wall (no explicit override on the case → default wall median)
- **passCount:** 2 of 7 (ffmpeg.wasm, mediabunny)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` (engineId `ffmpeg-wasm`).
- **Contested:** YES — two engines PASS with **identical oracle strength** (both pass `reference-reimport` + `mp4-box-layout`).
- **Decisive factor:** PERFORMANCE on the primary metric. Correctness is a tie (same two oracles, same physically-plausible packet/keyframe table, same correct mdat-before-moov layout). ffmpeg.wasm wins the wall-clock primary metric.
- **Margin over runner-up (mediabunny):** wall median **277.96 ms vs 356.89 ms = 1.28× faster**; throughputRealtime **107.93× vs 84.06× = 1.28× higher**. Both n=1 (mad=0, no spread) so the margin is single-sample evidence. **Caveat:** mediabunny is far gentler on the main thread — longtasks **474 ms vs 5390 ms (11.4× lower)** — so a responsiveness-weighted ranking would flip this call.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | reference-reimport:✓, mp4-box-layout:✓ | 277.96 ms | 107.93× | 0 (not sampled) | 5390 ms | cached previous PASS result |
| mediabunny@1.48.0 | **PASS** | reference-reimport:✓, mp4-box-layout:✓ | 356.89 ms | 84.06× | 0 (not sampled) | 474 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:none' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:none' |

Note: peakMemory has n=0 samples for both PASS engines (not captured in this run), and targetWrites is n=0 (the CountingTarget instrumentation is not yet wired for the buffer-target baseline). bytesOut: ffmpeg 31,258,827 B, mediabunny 31,270,779 B — both ~31 MB, consistent with lossless stream-copy of the 31 MB source (no re-encode).

## Why the winner wins (deep technical)

**The operation.** This is a *lossless container rewrap* of H.264/AAC from MP4 to MP4 with `fastStart:false`. No pixels or samples are re-encoded; the coded packets are copied and only the box geometry changes. The scenario specifically demands the **progressive/non-faststart** layout: `mdat` must precede `moov` (the default "moov-last" tail position). The `mp4-box-layout` oracle (`src/core/oracles.ts:365`, `fastStart===false` branch at `:415-422`) enforces exactly this: it parses top-level boxes and FAILs unless `firstMdat < firstMoov`.

**ffmpeg.wasm's mechanism.** The remux path is `src/engines/ffmpeg-wasm/adapter.ts:2031`. It writes the input to MEMFS, runs `runInfo` to enumerate tracks, then builds args `[-i in -map 0 -c copy …]` (`adapter.ts:2044`) — a genuine stream-copy of *every* mapped track, no transcode. The decisive line for THIS case is `adapter.ts:2048`: `else if (opts.fastStart !== false) args.push('-movflags','+faststart')`. Because the scenario passes `fastStart:false`, ffmpeg **deliberately omits `+faststart`**, leaving the muxer's natural moov-last geometry. The shard confirms the resulting layout: `ftyp@0, free@32, mdat@40, moov@31231517` (4 top-level boxes, `moovOffset 31231517 > mdatOffset 40`) — the oracle's exact PASS condition. This is the correct mechanistic outcome: a single-threaded wasm `-c copy` mux is essentially a byte-shuffle plus box-table rewrite, which is why it is fast (277.96 ms, 107.93× realtime for 30 s of media).

**Correctness evidence (real numbers).** `reference-reimport` (`src/core/oracles.ts:1225` → `semanticRemuxReimport` at `:1273`) re-demuxes the ffmpeg output with mediabunny and got **2308 packets, 1423 keyframes, 2 media tracks** vs golden 2 media tracks, with **durationDeltaSec 0** against a 0.1 s tolerance — a clean round-trip with no track loss and no duration drift. These are physically plausible for ~30 s of 1080p H.264 (GOP-dense content) plus AAC.

**Why ffmpeg edged mediabunny.** mediabunny (`src/engines/mediabunny/adapter.ts`) also genuinely remuxes via `mb.Output` + `mb.BufferTarget` (`:819`, `:935`, buffer read at `:987`) using the WebCodecs backend (`env.configUsed.backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`). Its `outputFormatOptionsFrom` (`adapter.ts:180`) maps `fastStart:false` straight through to mediabunny's `IsobmffOutputFormat`, producing the correct layout `ftyp@0, mdat@28, moov@31259904` (3 boxes; note no `free` pad box, mdat at offset 28 vs ffmpeg's 40). Its re-import gave **2310 packets, 1425 keyframes, durationDeltaSec 0.08 s** (still inside the 0.1 s tolerance, but a hair looser than ffmpeg's exact 0). On wall-clock it is 1.28× slower (356.89 vs 277.96 ms). The single axis where mediabunny dominates is **main-thread occupancy: 474 ms of longtasks vs ffmpeg's 5390 ms (11.4×)** — ffmpeg.wasm runs the whole rewrap as one long synchronous-feeling wasm exec, monopolizing the thread, whereas mediabunny's streaming-lockstep pipeline yields frequently. Since the case's primary metric is wall (not longtasks), ffmpeg wins under the stated decision procedure, but this is a genuinely close, contested result.

## What each other framework did wrong

- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest NA. The platform/WebCodecs adapter has no muxer; WebCodecs decodes/encodes but does not box-write MP4, so declaring remux would be a lie. Correct abstention.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest NA. web-demuxer is a demux-only (libav-based) reader; it has no remux/mux output path.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest NA. It is a parser/probe library, read-only; no container writer exists.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare feature 'fastStart:none'". Looks honest — mp4box.js's segmentation/writeFile path is oriented toward fragmented/init+media output, not an arbitrary moov-last progressive rewrap, and the adapter declares no `fastStart` feature at all (grep found none). The case requires the `fastStart:none` feature (`src/scenarios/streaming-output/_shared.ts:180`), so it is gated out before running.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare feature 'fastStart:none'". Honest NA. The adapter declares no `fastStart` capability; remotion-webcodecs targets transcode/WebCodecs conversion, not fine-grained ISOBMFF box-ordering control, so it cannot guarantee the moov-last control shape.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/streaming-output/base.ts:22-33` (id `mp4_buffer_target`), built via `src/scenarios/streaming-output/_shared.ts` (`buildStreamAll`). Feature gating `fastStart:none` is appended at `_shared.ts:180`; the `mp4-box-layout` oracle is attached for fastStart/fragmented MP4 shapes via `withMp4LayoutOracle` (`_shared.ts:139`).
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` — REAL file, stat shows 31 MB on disk. Not synthetic/empty/mock. The ~31 MB `bytesOut` from both engines is consistent with copying this real payload losslessly.
- **Oracles:** `mp4-box-layout` (`src/core/oracles.ts:365`) parses actual top-level boxes from the output bytes and asserts `mdat < moov` for `fastStart:false` (`:415-422`) — a real structural comparison, not trivially satisfiable (a faststart/plain output with moov-first would FAIL here). `reference-reimport` (`src/core/oracles.ts:1225`, semantic path `:1273`) re-demuxes the output with the reference engine and diffs track count, track-type layout, and duration against golden with a 0.1 s tolerance (`:1318`) — meaningful, with real measured packet/keyframe counts (2308/1423 and 2310/1425).
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2031` (`remux`). Genuine ffmpeg `-c copy` stream-copy with `-map 0`; the `fastStart:false` branch (`:2048`) correctly omits `+faststart`. No canned output, no input→output passthrough fake, no short-circuit to golden, no error swallowing (errors propagate; output is read back from MEMFS at `:2064`).
- **Cached note:** ffmpeg's result has `cached:true` ("cached previous PASS result"); mediabunny is also `cached:true`. Both rows are reused, not freshly re-run in this run — per the launcher seeding caveat there is a mild staleness risk, but the cached measurements (layout offsets, packet counts, byte sizes) are internally consistent and physically plausible.
- **Verdict:** **REAL** — real 31 MB fixture, real ffmpeg `-c copy` rewrap honoring the requested moov-last shape, and two non-trivial oracles (structural box-order + semantic re-import) that a faked/plain output would fail. The only reservation is that the win is cached and single-sample.

## Confidence & caveats

- **Confidence: medium.** The PASS/NA classification and oracle strength are unambiguous and code-validated. The *winner choice* is the soft part: it is a contested 1.28× wall-clock margin on **n=1** samples (mad=0, no distribution), and mediabunny beats ffmpeg by 11.4× on longtasks (main-thread responsiveness) — a metric that matters for browser UX but is not the case's primary metric. A responsiveness- or interactivity-weighted policy would name mediabunny.
- Both PASS rows are **cached**; a fresh re-run (clearing raw + .browser-cache per the seeding caveat) is advisable before treating the 1.28× margin as durable.
- **peakMemory (n=0) and targetWrites (n=0) were not captured**, so memory and write-granularity tiebreakers are unavailable for this baseline.
- Mediabunny's WebCodecs/no-COOP-COEP/pure-TS-ESM profile is the cleaner deployment story (smaller footprint, no SharedArrayBuffer/cross-origin-isolation requirement) vs ffmpeg.wasm's heavyweight wasm core — relevant if bundle/deploy constraints outweigh raw wall time.
