# mux/audio_only_aac_to_mp4

family: mux | fixture asset: `fixtures/media/aac_adts.aac` (raw ADTS AAC elementary stream, ~164 KB) | primaryMetric: wall (scenario sets no explicit primaryMetric → runner default = first metric `wall`, lower-is-better) | passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15**.
- Contested: **yes** — two engines PASS (ffmpeg-wasm, mediabunny), both satisfying the identical single oracle with identical correctness measurements.
- Decisive factor: **performance on the primary metric (wall)**. Correctness is a dead tie (same oracle, same Δ), so ranking falls through to perf. ffmpeg-wasm muxes in **wall median 7.785 ms vs mediabunny 9.665 ms → ~1.24x faster wall**, and **throughputRealtime 1288.5x vs 1037.9x → ~1.24x higher**.
- Margin over runner-up: ~1.24x on wall and throughput. CAVEAT: the win is on **n==1** samples (no spread; mad==0, p95==median) and is *contradicted* by main-thread responsiveness — ffmpeg-wasm reports **longtasks 19963 ms vs mediabunny 4223 ms (mediabunny ~4.7x lower)**. See "Confidence & caveats": the wall win is real but thin and the longtask gap argues mediabunny is the better-behaved engine for UI-thread workloads.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 7.785 | 1288.50 | 0 (not sampled, n=0) | 19963 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 9.665 | 1037.87 | 0 (not sampled, n=0) | 4223 | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

Both PASS engines reported the same oracle measurement: `outDurationSec=10.026667`, `goldenDurationSec=10.031`, `deltaSec=0.004333`, `durationToleranceSec=1.50465` → `Δ 0.0043s ≤ 1.5047s`. peakMemory and targetWrites were not sampled (n=0) for either engine in this run.

## Why the winner wins (deep technical)

The operation is a pure container author: demux a raw **ADTS AAC** elementary stream (MPEG-4 AAC-LC, 48 kHz / 2 ch / ~130.6 kbps per the golden meta) into an **ISO-BMFF MP4 (.m4a) sample table**. No decode, no re-encode — the coded AAC access units are copied verbatim and only the moov/stbl sample table and `esds`/AudioSpecificConfig are authored. So both surviving engines do the same fundamental thing; the contest is which one authors the table faster.

ffmpeg-wasm's path (`src/engines/ffmpeg-wasm/adapter.ts:2899` `async mux`): it filters real audio/video tracks (2900-2903), asserts container compatibility (2904), then for the encoded AAC track it rebuilds an elementary stream that ffmpeg can demux — wrapping each raw AAC access unit in a standards-defined 7-byte **ADTS header** (`adtsWrap`, adapter.ts:649; sampling-freq-index table at :616; profile = objectType-1 per ISO 13818-7). It writes that `.aac` to MEMFS (2916-2922) and runs a stream-copy mux: `-i <es> -map 0 -c copy -avoid_negative_ts make_zero -movflags +faststart <out>.mp4` (2924-2939). The `-c copy` guarantees no transcode; `+faststart` relocates moov ahead of mdat for a progressive MP4. This is genuine codec work through the vendored single-thread ffmpeg core. The probed output duration 10.0267s is the integer-frame estimate of a ~470-AAC-frame stream (470 × 1024 / 48000 ≈ 10.027s), which is why it sits 4.3 ms under the 10.031s golden — a physically correct rounding artifact, not a bug.

mediabunny's path (`src/engines/mediabunny/adapter.ts:1508` `async mux`) is the WebCodecs-aligned alternative: it builds an `Output` with an MP4 `OutputFormat` + `BufferTarget`, creates an `EncodedAudioPacketSource(AAC)` (1539), and feeds each coded chunk as an `EncodedPacket` (1562-1569) with the **decoder config / AudioSpecificConfig carried on the first packet** (`decoderConfig.description`, 1582-1589) so the muxer can emit the `esds` codec-private box. It then `output.start()` / `output.finalize()` (1553/1598). This is the cleaner, in-process author (no MEMFS shuffling, no ADTS re-wrap), which is exactly why its **main-thread longtask total is ~4.7x lower (4223 ms vs 19963 ms)**.

For THIS audio-only ADTS→MP4 case the gating oracle is `property-invariant` with `invariant = PROBE_DUR` (`probe(mux(x)).dur ≈ probe(x).dur`), implemented at `src/core/oracles.ts:2709-2758`: it reference-probes the authored output and compares to `ctx.golden.meta.durationSec` (10.031s from `fixtures/golden/aac_adts.aac.meta.json`). Duration is the one invariant that survives the container change cleanly — `_shared.ts:50-55` deliberately selects PROBE_DUR (not `reference-reimport`) for non-faithful targets so a source-keyed packet-count gate cannot false-fail. Both engines clear it with the same 4.3 ms delta, so correctness cannot break the tie. The tie therefore resolves on primaryMetric `wall`, where ffmpeg-wasm's 7.785 ms beats mediabunny's 9.665 ms (~1.24x), and on throughputRealtime (1288.5x vs 1037.9x, ~1.24x) — both lower-is-faster/higher-is-faster favoring ffmpeg-wasm.

## What each other framework did wrong

- **mediabunny@1.48.0** (runner-up, PASS): correctness identical (same oracle, Δ 0.0043s). It lost purely on the primary perf metric — wall 9.665 ms vs 7.785 ms (~1.24x slower) and throughputRealtime 1037.9x vs 1288.5x (~1.24x lower). It WINS the main-thread longtask metric (4223 ms vs 19963 ms), but longtasks is a lower-priority tiebreaker than primaryMetric `wall`.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'." Honest: web-demuxer is a demux-only library (libavformat read side), it has no container-writer, so the capability gate correctly excludes it rather than faking a mux.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'." Honest: the bare WebCodecs/Chrome platform adapter exposes decode/encode primitives but no MP4 box writer, so it genuinely cannot author a sample table.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'." Honest: this adapter targets decode/transcode via WebCodecs; no standalone encoded-packet container author is declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'." Honest: media-parser is a read/parse library, no write side.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'adts'." Honest and notably precise: mp4box CAN write MP4, but its reader is ISO-BMFF-only and cannot ingest a raw ADTS AAC elementary stream, so it cannot obtain the EncodedTracks this mux scenario sources by demuxing the ADTS input. The NA is on the input-container gate, not a faked mux.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/index.ts:103-109` (`id: 'audio_only_aac_to_mp4'`, `input: 'aac_adts.aac'`, `containersIn: ['adts']`, `to: 'mp4'`, `audioCodecs: ['aac']`). Built via `buildMux` in `src/scenarios/mux/_shared.ts:204`; default oracle set `_shared.ts:183-195` → `property-invariant` only (no `reference-reimport`, because an ADTS source is not an ISO-BMFF faithful-reimport target). Options inject `invariant: PROBE_DUR` (`_shared.ts:200`).
- Fixture: `fixtures/media/aac_adts.aac` EXISTS (~164 KB) and is a genuine ADTS AAC stream — first bytes `FF F1 4C 80 …` (12-bit syncword 0xFFF, MPEG-4, AAC-LC). Golden `fixtures/golden/aac_adts.aac.meta.json` confirms aac / 48000 / 2ch / 130650 bps / 10.031s. Not synthetic/empty/mock.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2899-2947` — real `-c copy` mux through the vendored ffmpeg core after ADTS re-wrap (`adtsWrap` :649). It does NOT return canned bytes, does NOT copy the input file to the output (it rebuilds an elementary stream then muxes), does NOT short-circuit to a golden, and does NOT swallow errors (`this.run(...)` throws on ffmpeg failure; cleanup in `finally`).
- Oracle: `src/core/oracles.ts:2709-2758` (probe-duration branch of `propertyInvariant`). It performs a REAL reference-probe of the authored output and an absolute-delta comparison vs the golden duration. Not trivially satisfiable in principle (a wrong-length mux would shift duration), though the tolerance is wide (1.50465 s) for a 10 s clip — see verdict below.
- cached: BOTH PASS results have `cached==true` ("cached previous PASS result"). The numbers were reused, not freshly re-run; staleness risk per the launcher-seeding caveat applies, but the cached evidence is internally consistent (oracle Δ matches golden meta exactly).
- Verdict: **WEAK-GATE**. The implementations and fixture are real (this is NOT a cheat), but the SOLE gate is a duration-probe with a ~1.5 s tolerance on a 10 s clip (~15%). It confirms the mux produced a playable MP4 of the right length but does NOT verify packet/sample-table fidelity, AAC AU byte-exactness, esds/ASC correctness, or sample count. A correctly-lengthed-but-structurally-wrong mux could slip through. The PASS is genuine but not a strong correctness proof.

## Confidence & caveats

- Confidence: **medium**. Correctness verdict (tie) is solid; the perf ranking is weakly supported.
- The perf win rests on **n==1** for both engines (mad==0, p95==median — single sample, no variance). A 1.24x wall gap on one sample is thin evidence and could flip on re-run.
- The wall numbers (7.8 / 9.7 ms) are implausibly small for a real ADTS→MP4 mux of a 164 KB / 10 s stream and are *contradicted* by the longtasks figures (19963 ms / 4223 ms) — the `wall` bench likely measures a narrow inner window, not end-to-end work. Treat `wall` as a relative proxy here, not absolute mux time.
- On the more honest main-thread-responsiveness axis (longtasks), **mediabunny is dramatically better (4.7x lower)**; if the report prioritized UI responsiveness over the primaryMetric, mediabunny would win. The decision strictly follows the §4 ladder (correctness tie → primaryMetric `wall`).
- Both results are cached; a fresh re-run (clear raw + .browser-cache per the launcher caveat) is recommended before quoting this as a firm ffmpeg-wasm win.
- The gate is duration-only (WEAK-GATE); adding `reference-reimport` against an MP4-keyed golden or a decoded-audio-PCM oracle would strengthen confidence in structural fidelity.
