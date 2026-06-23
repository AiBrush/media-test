# streaming-output/mp4_faststart_none_control

- **family:** streaming-output
- **fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio, ~31 MB, real file)
- **operation / shape:** `remux` MP4 -> MP4, `{ fastStart: false, target: 'buffer' }` (moov-LAST control)
- **primaryMetric:** wall (ms)
- **passCount:** 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES — two engines PASS with an identical oracle set (`reference-reimport` + `mp4-box-layout`).
- **Decisive factor:** PERFORMANCE. Correctness is a dead heat (both pass the same two structural/semantic gates with physically plausible, near-identical measurements), so the tiebreak falls to the primaryMetric (wall) and throughput.
- **Margin over runner-up (mediabunny):** wall 154.97 ms vs 404.58 ms = **2.61x faster**; throughputRealtime 193.59x vs 74.15x = **2.61x higher**; main-thread longtasks 2477 ms vs 5478 ms = **0.45x (less than half the blocking)**. All on n=1 (mad=0), so the evidence is single-sample — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | reference-reimport:T, mp4-box-layout:T | 154.97 ms | 193.59x | n/a (n=0) | 2477 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:T, mp4-box-layout:T | 404.58 ms | 74.15x | 69,364,972 B | 5478 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:none' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:none' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

This scenario is the **negative control** of the fastStart family: it asserts the *default* ISOBMFF placement where `mdat` precedes `moov` (moov-LAST). The gate is intentionally the contrast to `mp4_faststart_in_memory` (moov-first). Two oracles must both pass: `mp4-box-layout` (the structural assertion that mdat comes before moov) and `reference-reimport` (the semantic assertion that the rewrapped file re-demuxes to the same track/packet shape). Both ffmpeg-wasm and mediabunny satisfy both, so correctness cannot separate them.

**Correctness parity (the numbers).** ffmpeg-wasm's `mp4-box-layout` reports `topLevelBoxes:4, mdatOffset:40, moovOffset:31231517` — layout `ftyp@0, free@32, mdat@40, moov@31231517`. The oracle (src/core/oracles.ts:415-423) only requires `firstMdat <= firstMoov` for the `fastStart===false` branch; mdat@40 sits far before moov@31.2M, so it passes. The extra `free@32` box is ffmpeg's normal muxer padding and is harmless. mediabunny's layout is `ftyp@0, mdat@28, moov@31259904` (3 boxes, no free box). For `reference-reimport` (src/core/oracles.ts:1225-1271, semantic path at :1273+), ffmpeg-wasm re-imports to `2308 packets, 1423 keyframes, 2 media tracks, durationDeltaSec:0` and mediabunny to `2310 packets, 1425 keyframes, 2 media tracks, durationDeltaSec:0.08` (tolerance 0.1 s). Both match the golden's 2 media tracks; the ~2-packet / 0.08 s difference between them is well inside tolerance and reflects benign edit-list / priming bookkeeping, not a defect. This is genuine codec-faithful remuxing on both sides.

**Why ffmpeg-wasm is faster for THIS op.** Both engines do a lossless sample copy (no decode/re-encode), so the work is pure container rewrapping of ~31 MB. ffmpeg-wasm's `remux()` (src/engines/ffmpeg-wasm/adapter.ts:2031-2069) runs a single `-map 0 -c copy` MEMFS pass, and critically for `fastStart === false` it takes the `else` path that does NOT add `-movflags +faststart` (adapter.ts:2048) — it leaves moov at the tail in one streaming write, with no second pass to relocate the moov. That is the cheapest possible MP4 mux: parse boxes, copy mdat samples through, append moov. The wasm stream-copy muxer pushes 193.59x realtime and blocks the main thread for only 2477 ms of longtasks. mediabunny's `remux()` (src/engines/mediabunny/adapter.ts:1244-1260) instead drives the full `Conversion.init/.execute` pipeline (runConversion at adapter.ts:842) over a `BufferTarget`, with `env.configUsed` showing `backend:"webcodecs", pipeline:"streaming-lockstep", queueDepth:"auto"`. Even though `outputFormatOptionsFrom` (adapter.ts:180-199) correctly maps `fastStart:false` into the OutputFormatOptions so no moov-relocation second pass occurs, the pure-TS-ESM Conversion read->mux loop carries more per-packet JS overhead than ffmpeg's compiled wasm `-c copy`, yielding 404.58 ms wall, 74.15x realtime, and 5478 ms of longtasks (2.2x more main-thread blocking). For a 30 s 1080p H.264+AAC progressive MP4 rewrap, the compiled-wasm single-pass copy simply has less interpreter overhead per sample.

**Backend note / tiebreak.** Normally the tiebreak ladder favors hardware WebCodecs over single-thread wasm, but that tiebreak is for *comparable* correctness AND comparable performance. Here performance is not comparable — ffmpeg-wasm wins the primaryMetric outright by 2.61x — so the wasm-vs-WebCodecs preference never engages. Note also that for a pure stream-copy remux, WebCodecs hardware acceleration is irrelevant: no frames are decoded or encoded, so mediabunny's `prefer-hardware` setting buys nothing on this op.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (genuine, both oracles), but lost on performance: 2.61x slower wall (404.58 vs 154.97 ms), 2.61x lower throughput (74.15x vs 193.59x), and 2.2x more longtask blocking (5478 vs 2477 ms). Its Conversion `streaming-lockstep` JS pipeline is heavier than ffmpeg's compiled `-c copy` for a pure rewrap. (It does report peakMemory 69.4 MB, which ffmpeg-wasm did not capture.)
- **mp4box@2.3.0** — NA_ENGINE: "does not declare feature 'fastStart:none'". Honest. mp4box.js can write MP4 but the adapter does not declare the explicit moov-last control shape, so the runner gates it out rather than fake a pass.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare feature 'fastStart:none'". Honest; it declares no explicit-moov-placement output-shape control.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'remux'". Honest — it is a parser/demuxer, not a muxer; it cannot produce an MP4 output to inspect.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'remux'". Honest — a demux-only library, no mux/remux path.
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'remux'". Honest — the browser baseline has no general remux primitive (it is used as the reference-reimport demuxer, not a muxer).

## Anti-cheat validation

- **Scenario definition:** src/scenarios/streaming-output/fragmented-faststart.ts:65-78 (case id `mp4_faststart_none_control`). `shape: { container: 'mp4', fastStart: false, target: 'buffer' }`. The file header (lines 12-19) documents the honest gating: structural `mp4-box-layout` + semantic `reference-reimport`, with an explicit note (lines 21-37) that fragmented/reserve edges are NOT emitted as fake-passing placeholders.
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` exists, ~31 MB (`stat` confirmed). Real H.264+AAC media, not synthetic/empty/mock.
- **Oracles:** src/core/oracles.ts:365-426 (`mp4-box-layout`) parses real top-level boxes and, for the `fastStart===false` branch (:415-423), FAILS unless `firstMdat <= firstMoov` — a real ordering assertion that the moov-first shapes (:405-413) would fail, so it is not trivially satisfiable. src/core/oracles.ts:1225-1271 + :1273+ (`reference-reimport`) re-demuxes the output through the injected reference engine and compares media-track count/layout and duration against the golden with a 0.1 s tolerance; it FAILs on empty packet tables or track mismatch.
- **Winner adapter:** src/engines/ffmpeg-wasm/adapter.ts:2031-2069. Genuine `-map 0 -c copy` MEMFS remux; for `fastStart:false` it correctly OMITS `+faststart` (line 2048's else path) — no canned output, no input->output copy fakery, no golden short-circuit; `this.run` throws on non-zero ffmpeg exit (does not swallow errors). The output is read back from MEMFS and inspected by the oracles.
- **Measurements plausibility:** 2308 packets / 1423 keyframes over 30 s, durationDelta 0, output 31,258,827 bytes (~= 31 MB input), mdat@40 before moov@31.23M — all physically consistent with a lossless H.264+AAC rewrap of the fixture.
- **Cached note:** BOTH PASS results have `cached:true` ("cached previous PASS result"). The evidence is reused, not freshly re-run this session — staleness risk exists (per the launcher seeding caveat), though the cached measurements are internally consistent and plausible.
- **Verdict:** **REAL** — real fixture + real `-c copy` implementation + two meaningful (structural + semantic) oracles that can and do fail. The only reservation is cached-only evidence, which lowers confidence but does not indicate cheating.

## Confidence & caveats

- **Confidence: medium.** The win is clean and mechanistically sound, but: (1) both engines ran at **n=1** (mad=0, p95==median) — a single-sample wall win is weaker evidence; the 2.61x margin is large enough to survive normal variance, but a multi-sample re-run would harden it. (2) Both results are **cached** — not re-run this session. (3) ffmpeg-wasm's **peakMemory was not captured** (n=0), so the memory dimension cannot be compared; mediabunny's 69.4 MB is the only memory datapoint. None of these change the winner (performance margin is decisive and correctness is tied), but they cap confidence below "high".
