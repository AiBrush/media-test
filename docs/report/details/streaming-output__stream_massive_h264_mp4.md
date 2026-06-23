# streaming-output/stream_massive_h264_mp4

family: streaming-output | fixture asset: `fixtures/media/massive_h264_1080p_2h.mp4` (1.1 GB, 2h, 1080p H.264 + AAC) | primaryMetric: peakMemory | passCount: 1 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** — UNCONTESTED (only 1 of 7 engines is eligible; the other 6 are NA).
- **Decisive factor:** mediabunny is the only engine that declares BOTH the `remux` operation AND the `target:writes` feature, so it is the only engine the runner allowed to attempt the streaming (StreamTarget) remux of a 1.1 GB / 2-hour MP4. It then passed the gating `reference-reimport` oracle: the reference re-imported its output to **553503 packets / 341103 keyframes / 2 media tracks**, with **durationDelta 0.064 s ≤ 0.1 s tolerance**.
- **Margin over runner-up:** not applicable — there is no second PASS. Every other engine was gated out at capability negotiation (NA), never producing output to compare. Performance for the winner: wall median **35130.65 ms**, throughputRealtime **204.95x**, targetWrites **28466**, bytesOut **1249826319** (~1.16 GB), longtasks **747 ms**, peakMemory **0** (not sampled, n=0).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 35130.65 ms | 204.95x | n/a (n=0) | 747 ms | streaming remux passed semantic re-import |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

This scenario is the SIZE-LADDER "massive STREAM rung": a 1.1 GB, 2-hour, low-bitrate (≈1.2 Mbps video / 64 kbps AAC) 1080p H.264-in-MP4 file that must be remuxed MP4→MP4 to a **streaming target** while keeping peak memory far below file size (the OOM-resistance rung, contrasted against `buffer_massive_h264_mp4` which materializes the whole file). Scenario def: `src/scenarios/streaming-output/size-ladder.ts:91-105` (`asset: 'massive_h264_1080p_2h.mp4'`, `shape.target: 'stream'`, `oracles: ['reference-reimport']`, `primaryMetric: 'peakMemory'`).

**Capability gate is the whole story here.** The runner negotiates each engine against the scenario shape. A STREAM-target remux requires (a) the `remux` operation and (b) the `target:writes` feature (the ability to write through a streaming write-sink and report per-write telemetry). mediabunny is the only engine declaring both: `src/engines/mediabunny/adapter.ts:1025` (`remux: true`) and `:1080` (`'target:writes'`). All six competitors are gated out before any work — see the NA list below.

**The streaming path is genuine, not buffered.** For `opts.target === 'stream'` the adapter builds a real `WritableStream<StreamTargetChunk>` and hands it to mediabunny's native `new mb.StreamTarget(writable)` (`src/engines/mediabunny/adapter.ts:786-801`). The remux drives `mb.Conversion.init({input, output})` then `conversion.execute()` (`adapter.ts:1255-1256`, `runConversion` at `:848-855`). With no `video`/`audio`/`trim` options supplied, Conversion takes the lossless **encoded-sample copy** fast path — it demuxes packets and re-muxes them into the new MP4 container without re-decoding/re-encoding H.264 or AAC. That is why throughput is ~**205x realtime** (7200 s of media remuxed in 35.1 s wall) and why longtasks stayed at just **747 ms** despite a 1.1 GB input: the read side is a lazy `UrlSource` and the write side flushes through the StreamTarget in chunks (telemetry recorded **28466** discrete target writes, `bench.targetWrites`), so neither side holds the whole file. Output size **1249826319 bytes** (~1.16 GB) is consistent with a faithful container copy of a 1.1 GB source plus MP4 box overhead.

**The oracle gate is real and meaningful.** `reference-reimport` (`src/core/oracles.ts:1225-1271`, semantic remux branch `semanticRemuxReimport` at `:1273+`) feeds the engine's emitted bytes back into the reference engine's demuxer and compares semantics against the golden. The shard's single oracle outcome reports `reimportPackets: 553503`, `reimportKeyframes: 341103`, `reimportMediaTracks: 2`, `goldenMediaTracks: 2`, `durationDeltaSec: 0.064` against `durationToleranceSec: 0.1`. These are physically plausible for this asset: golden meta (`fixtures/golden/massive_h264_1080p_2h.mp4.meta.json`) is 7200 s, 2 tracks (h264 1080p30 + AAC 48 kHz mono). At 30 fps × 7200 s ≈ 216k video packets and 48000/1024 × 7200 ≈ 337k AAC packets → ~553k total, matching 553503; AAC packets are all keyframes plus H.264 IDRs ≈ 341103. Track count and ~0.064 s duration drift (sub-frame container rounding) confirm the remux preserved media identity. This is a structural/metadata-exact gate (track count + layout + duration), stronger than a smoke gate.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — NA_ENGINE:** "engine does not declare feature 'target:writes'". It can remux, but does not expose a streaming write-sink with write telemetry, so it cannot service a STREAM-target scenario. Honest NA (single-thread wasm with whole-output buffering does not match the streaming contract).
- **mp4box@2.3.0 — NA_ENGINE:** "engine does not declare feature 'target:writes'". MP4Box.js can segment/fragment but the adapter does not declare the streaming-write-telemetry capability this rung requires. Honest NA.
- **remotion-webcodecs@4.0.479 — NA_ENGINE:** "engine does not declare feature 'target:writes'". Declares remux but not the streaming target capability. Honest NA.
- **platform@chrome-149 — NA_ENGINE:** "engine does not declare operation 'remux'". The bare browser/WebCodecs platform exposes no container-remux primitive (WebCodecs is codec-level, not muxing). Honest NA.
- **remotion-media-parser@4.0.479 — NA_ENGINE:** "engine does not declare operation 'remux'". It is a parser/demuxer, not a muxer. Honest NA.
- **web-demuxer@4.0.0 — NA_ENGINE:** "engine does not declare operation 'remux'". Demux-only by design. Honest NA.

All six NAs are at capability-negotiation time with empty `oracleOutcomes` — none produced output, so there is no FAIL evidence and no metric gap to report. The NAs look honest: the operation/feature genuinely is absent from each adapter's declared capabilities, consistent with each library's nature (parser-only, codec-only, or non-streaming muxer).

## Anti-cheat validation

- **Scenario:** `src/scenarios/streaming-output/size-ladder.ts:91-105` — id `stream_massive_h264_mp4`, `asset: 'massive_h264_1080p_2h.mp4'`.
- **Fixture exists & is real:** `fixtures/media/massive_h264_1080p_2h.mp4` = **1.1 GB** on disk (stat confirmed). Not synthetic/empty/mock. Golden sidecars present: `.meta.json` (7200 s, h264+aac, 2 tracks), `.packets.json` (66 MB), `.frames.json`, `.ssim.json`.
- **Oracle:** `referenceReimport` `src/core/oracles.ts:1225`; remux branch `semanticRemuxReimport` `:1273`. Performs a REAL round-trip: re-imports the engine's emitted bytes through the reference demuxer and compares track count, per-type track layout, and duration (≤0.1 s tol) against the golden. Empty packet tables fail (`:1245`). Not trivially satisfiable.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1244` (`remux`), `:1255-1256` (real `mb.Conversion.init/execute`), `:786-801` (real `StreamTarget`/`WritableStream`), `:1025`/`:1080` (declared capabilities). The op calls the real library, does NOT copy input→output bytes to fake a transcode, does NOT short-circuit to the golden, and does NOT swallow errors (invalid conversion throws, `runConversion` `:849-853`).
- **Measurements plausible:** 553503 packets / 341103 keyframes / 2 tracks / 0.064 s duration drift / ~1.16 GB out all reconcile with a 2h 1080p30 + 48 kHz AAC source. No mock-sized round numbers.
- **Cached:** the mediabunny entry has no `cached:true` flag (cached field absent → freshly run; `startedAtIso: 2026-06-22T17:35:01Z`, `durationMs: 124812`). No staleness risk.
- **Verdict: REAL** — real 1.1 GB fixture + genuine streaming Conversion implementation + meaningful structural re-import oracle with physically consistent numbers.

## Confidence & caveats

- Confidence: **high**. Single eligible engine, genuine implementation, real fixture, real oracle with plausible numbers.
- Caveats: (1) This is an uncontested win driven by capability declarations — six engines never competed, so we cannot say mediabunny would beat a streaming ffmpeg.wasm/mp4box if those declared `target:writes`; the win proves correctness + capability, not best-in-class margin. (2) `peakMemory` is the declared primaryMetric but was NOT sampled (`bench.peakMemory.n == 0`, median 0) — the headline OOM-resistance claim of this rung is therefore unverified by a memory number; the streaming-vs-buffer divergence this scenario exists to show is inferred from the streaming code path (StreamTarget chunked writes, 28466 writes) rather than measured here. (3) All bench metrics are n=1 (mad=0), so timing is single-shot evidence.
