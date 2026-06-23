# demux/vp9_alpha

- **family:** demux
- **fixture asset:** `fixtures/media/vp9_alpha.webm` (VP9-with-alpha video + Opus audio in WebM/Matroska, 640x480, 30fps, ~5s, 749 KB)
- **primaryMetric:** wall (ms)
- **passCount:** 6 of 7

## Verdict

- **Best framework:** `platform@chrome-149` (Chrome's own stack via this suite's hand-rolled WebM demuxer).
- **Contested:** YES — 6 engines all PASS the single gating oracle (`golden-packets`) with byte-identical correctness, so the winner is decided purely on performance.
- **Decisive factor:** lowest wall-clock demux time. Correctness is a perfect tie across all 6 PASS engines (150/150 packets, `comparedTracks=1`, `maxPtsDriftUs=0`), so the ladder falls through to performance, where platform's `wall median = 9.28 ms` is the fastest.
- **Margin over runner-up:** vs `mediabunny@1.48.0` (10.685 ms) → **1.15x faster wall**. vs the rest: 1.64x faster than ffmpeg.wasm (15.235 ms), 1.74x than remotion-webcodecs (16.13 ms), 1.90x than remotion-media-parser (17.67 ms), 8.43x than web-demuxer (78.21 ms). Caveat: every result is `n=1, mad=0, cached=true`, so the margin over mediabunny is weak evidence (single sample, sub-millisecond gap).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | golden-packets:pass | 9.28 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:pass | 10.685 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass | 15.235 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass | 16.13 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass | 17.67 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass | 78.21 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |

(The bench block in the shard carries only the `wall` metric; throughputRealtime/peakMemory/longtasks were not recorded for this row, hence n/a.)

## Why the winner wins (deep technical)

This is a **container-demux** test, not a decode test: the operation is to walk the Matroska/WebM bitstream and emit the exact packet table (per-track count, sizes, keyframe flags, pts/dts), then compare against the ffprobe-derived golden. The codec payload (VP9) is never decoded by the oracle — what matters is correct EBML/Matroska element parsing and, specifically for this fixture, correct handling of VP9 **alpha side-data**.

The gating subtlety (scenario notes, `src/scenarios/demux/index.ts:171-173`): in VP9-with-alpha WebM, the alpha plane rides as a `BlockAdditional` (BlockAddID=1) inside the same `BlockGroup` as the main video frame. A naive demuxer can mistakenly enumerate that alpha payload as an extra packet, inflating the count past the golden's 150. The golden packets file confirms a single video track (trackIndex 0 only — the Opus track is not in the golden packet list) with exactly **150 packets, 3 keyframes**, first packet size 13769 bytes at pts 0.

Platform's adapter handles this correctly and cheaply. `src/engines/platform/demux-webm.ts` is a from-scratch EBML reader:
- It distinguishes `SimpleBlock` (0xa3) from `BlockGroup` (0xa0) — `demux-webm.ts:474-497`.
- For a `BlockGroup` it reads `BlockAdditions`→`BlockAdditional` (`demux-webm.ts:489`, `:535-543`) and attaches the alpha bytes to the sample as **side-data** (`sample.alpha`, `demux-webm.ts:36-37`, `:459-460`, `:496`) rather than pushing it as a separate frame. The push loop iterates only over `block.frames` (`demux-webm.ts:497`), so alpha never increments the packet count — directly satisfying the "no double-counting" requirement.
- Keyframe flag derivation is correct: SimpleBlock uses the keyframe bit (`demux-webm.ts:564`), while BlockGroup infers keyframe = absence of `ReferenceBlock` (`demux-webm.ts:495`), matching the golden's 3 keyframes.

Because this is a pure synchronous byte-walk over a 749 KB buffer with no codec init, no WASM module instantiation, and no worker round-trip, it is the cheapest path. `env.configUsed.backend="webcodecs"` is reported but irrelevant to demux here — no `VideoDecoder` is spun up for the packet table. The result: `wall median = 9.28 ms`, the lowest of all engines.

The oracle (`goldenPackets`, `src/core/oracles.ts:703-796`) does a real, strict comparison: it groups both sides by trackIndex, sorts each group by dts then pts, and compares **size and keyframe flags exactly** (`oracles.ts:777-778`) plus pts/dts within a 1 ms per-track-origin-aligned tolerance (`oracles.ts:780-784`). Platform's reported `maxPtsDriftUs=0` means perfect timestamp agreement, not merely within tolerance — the strongest possible result on this structural-exact oracle.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, identical correctness (150/150, drift 0). Lost on performance only: `10.685 ms` vs `9.28 ms` = **1.15x slower** wall. Its pure-TS ESM core (`coreBuild="pure-ts-esm"`, `sharedArrayBuffer=false`) is competitive but marginally behind the in-engine byte-walk. Gap is sub-2 ms on a single (n=1) sample, so the loss is narrow.
- **ffmpeg.wasm@0.12.15** — PASS, identical correctness. Lost on performance: `15.235 ms` = **1.64x slower**. WASM module + libavformat matroska demuxer carries FS/marshalling overhead that the native byte-walk avoids.
- **remotion-webcodecs@4.0.479** — PASS, identical correctness. `16.13 ms` = **1.74x slower**. Routes demux through its WebCodecs-oriented streaming pipeline; heavier than a single buffered EBML pass for a small file.
- **remotion-media-parser@4.0.479** — PASS, identical correctness. `17.67 ms` = **1.90x slower** (the slowest of the CPU-JS parsers). `backend="cpu-js"`, full-parse(demux) tier; correct but its general-purpose parser is the slowest of the JS demuxers here.
- **web-demuxer@4.0.0** — PASS, identical correctness. `78.21 ms` = **8.43x slower**, by far the slowest. This is the FFmpeg-in-WASM web-demuxer; its per-call WASM/worker init dominates wall time on a tiny fixture.
- **mp4box@2.3.0** — **NA_ENGINE**, "engine does not declare input container 'webm'". This NA is **honest**: MP4Box.js is an ISO-BMFF (MP4/MOV) parser and genuinely cannot read a Matroska/WebM container. Not an under-declared capability — it is structurally incapable of demuxing WebM.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:166-174` — asset `vp9_alpha.webm`, container `webm`, videoCodecs `['vp9']`, audioCodecs `['opus']`, with notes mandating the alpha-side-data / no-double-counting gate.
- **Fixture exists & is real:** `fixtures/media/vp9_alpha.webm` present, **749 KB** (verified via `ls`). Not synthetic/empty. Goldens present: `vp9_alpha.webm.packets.json` (17 KB), `.meta.json`, `.frames.json`, `.ssim.json`. Golden packets parse to **150 entries, single track 0, 3 keyframes**, first size 13769 @ pts 0 — physically plausible for a 5 s / 30 fps / ~1.2 Mbps VP9 clip (≈150 frames).
- **Oracle is real & strict:** `goldenPackets` at `src/core/oracles.ts:703-796` — exact per-packet size and keyframe-flag equality, count + trackIndex-layout checks, and origin-aligned 1 ms timestamp tolerance. Not trivially satisfiable; not a smoke/SSIM gate. The reported `maxPtsDriftUs=0` is the tightest possible outcome.
- **Winner adapter is genuine:** `src/engines/platform/demux-webm.ts` is a real EBML/Matroska parser (`SimpleBlock`/`BlockGroup`/`BlockAdditions` at `:474-497`, alpha as side-data at `:496`, keyframe logic at `:495`/`:564`). No hardcoded packet list, no short-circuit to the golden file, no copy-through or swallowed errors. It computes the packet table from the actual bytes.
- **Cached note:** ALL 7 rows are `cached=true` ("cached previous PASS result"), including the winner. The wall numbers are reused from a prior run and were not re-measured this run; the 1.15x platform-over-mediabunny margin is therefore stale single-sample evidence. Correctness (150/150, drift 0) is robust regardless of caching.
- **Verdict:** **REAL** — real fixture, real EBML implementation, strict structural-exact oracle. The only weakness is performance evidence quality (cached, n=1), which affects the *margin* confidence but not the PASS validity.

## Confidence & caveats

- Correctness ranking is unambiguous: all 6 PASS engines are byte-identical on the only gating oracle (`maxPtsDriftUs=0`, exact sizes/keyframes), so the winner genuinely turns on wall time.
- Performance margin over mediabunny is **low-confidence**: `n=1`, `mad=0`, sub-2 ms gap, and `cached=true` for both. A re-run could plausibly reorder platform vs mediabunny.
- The platform vs web-demuxer (8.43x) and platform vs the slower group (1.6x–1.9x) gaps are large enough to survive single-sample noise.
- mp4box's NA is correctly justified (container mismatch), so it is rightly excluded rather than penalized.
