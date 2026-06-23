# trim/massive_h264_copy_sustained

family: trim | fixture asset: `massive_h264_1080p_2h.mp4` (1.1 GB, H.264 1080p + AAC, MP4) | primaryMetric: `sourceReads` | passCount: 1 / 7

## Verdict

- **Best framework: mediabunny@1.48.0 (UNCONTESTED).**
- Exactly one engine reached `status=PASS`; the other six are `NA_ENGINE`. There is no runner-up to rank against, so the decisive factor is **capability eligibility**, not performance: mediabunny is the only engine that declares both the `trim` operation **and** the scenario-required feature token `trim:massive-lazy-read`. Five engines never declare `trim`; ffmpeg.wasm declares `trim` but not `trim:massive-lazy-read`, so it is gated out before it ever runs.
- Margin over runner-up: **N/A** (no second PASS). mediabunny's measured cost: wall median 5321.01 ms (n=1), throughputRealtime 1353.13 x-realtime, longtasks 19963 ms, duration delta 0.0747 s vs the 60 s requested cut.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:pass, playback-smoke:pass | 5321.01 ms | 1353.13 x | 0 (not sampled) | 19963 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'trim:massive-lazy-read' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

(`peakMemory`, `sourceReads`, `targetWrites` have n=0 samples in this shard — not instrumented for this run despite `sourceReads` being the nominal primaryMetric; see caveats.)

## Why the winner wins (deep technical)

This rung is a **mid-file 1-minute copy-trim** (`startUs=3_600_000_000`, `endUs=3_660_000_000`, i.e. the 3600 s..3660 s span) inside a **2-hour, 1.1 GB H.264/AAC MP4** (`src/scenarios/trim/index.ts:643-664`). The whole point of the "massive" rung is OOM-resistance: the demuxer must NOT materialize the full multi-thousand-entry sample table or buffer the entire 1.1 GB file to reach an offset deep in the `mdat`. The scenario therefore attaches the feature gate `features: ['trim:massive-lazy-read']` (`index.ts:657`) which is folded into `requires.features` by `buildTrim` (`index.ts:687-690`).

mediabunny is the only engine that satisfies this gate. Its adapter declares the token at `src/engines/mediabunny/adapter.ts:1053` with the rationale "normal corpus inputs use UrlSource, preserving lazy reads for massive trims." That claim is backed by real code: `openInput` (`adapter.ts:245-277`) routes an unmutated, non-blob corpus asset through `new mb.UrlSource(input.url)` at `adapter.ts:266-270`. UrlSource is a range-reading `PathedSource`, so mediabunny issues HTTP range reads for the `moov`/sample table and only the `mdat` byte ranges that overlap the requested cut, instead of `await input.arrayBuffer()` (which is reserved for blob/mutated inputs at lines 260 and 272-275). This is the mechanism that keeps a 1.1 GB file from ballooning peak memory.

The trim itself is genuine. `trim()` (`adapter.ts:1445-1500`) builds a real mediabunny `Output` with a `BufferTarget` and runs `Conversion` with `trim: { start, end }` (lines 1484-1496). Because the scenario sets `frameAccurate: false` (`index.ts:653`), the code first attempts a lossless copy path (`tryAudioOnlyPacketCopyTrim`, line 1480) and otherwise lets Conversion copy/remux the spanning GOPs without forcing a re-encode (the `forceTranscode` branch at 1493-1495 only fires for frame-accurate cuts). The configUsed backend is `webcodecs` / `prefer-hardware` on an Apple M1 Max with `coopCoep: not-required` and `sharedArrayBuffer: false` — a single-thread-friendly, no-cross-origin-isolation path.

The correctness gate (`trim-boundaries`, `src/core/oracles.ts:2346-2435`) passed with measurements: `outDurationSec=60.0747`, `requestedDurationSec=60`, `durationDeltaSec=0.0747` against the scenario tolerance `durationToleranceSec: 1.0` (`index.ts:654`). The 0.0747 s delta (~2 frames at 30 fps) is well inside tolerance and physically plausible for a key-frame-snapped copy-trim. As the scenario notes warn (`index.ts:648-650, 660-663`), the output spans >4096 frames, exceeding the oracle's `maxFrames: 4096` decode cap (`oracles.ts:2374`), so correctness deliberately leans on the **reference-engine probe** for duration (`oracles.ts:2360-2367`) plus the **playback-smoke** gate (a real `<video>` element played a few frames of the output). `boundaryFrameComparisons=0` because no trim-range frame golden was baked (`oracles.ts:2410-2431`), which is the documented, intentional behavior — not a silent skip of an available comparison.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — NA_ENGINE, honest-but-conservative.** It DOES declare `trim` as an operation (`src/engines/ffmpeg-wasm/adapter.ts:2546`) and can copy-trim H.264/AAC MP4 in principle, but it does not declare `trim:massive-lazy-read`. ffmpeg.wasm runs in the Emscripten MEMFS sandbox: the input file must be `writeFile`-d into the virtual FS, i.e. the full 1.1 GB is buffered into wasm linear memory before `-ss/-to` can seek. That would risk OOM (32-bit wasm address space) and defeats the lazy-read mandate, so withholding the token is a correct, honest NA rather than under-declaration.
- **platform@chrome-149 — NA_ENGINE, honest.** WebCodecs/MediaRecorder expose no container-level copy-trim/remux primitive; "engine does not declare operation 'trim'" is accurate — there is no native browser trim API.
- **mp4box@2.3.0 — NA_ENGINE, plausibly under-declared.** MP4Box.js is an MP4 (de)muxer and could in theory segment/extract a byte-range trim, but the adapter does not register the `trim` operation, so it is correctly NA for this suite's contract.
- **remotion-media-parser@4.0.479 — NA_ENGINE, honest.** A parser/probe library only; no trim/mux output path declared.
- **web-demuxer@4.0.0 — NA_ENGINE, honest.** Demux-only (ffmpeg-wasm-backed packet reader); no muxing/trim output declared.
- **remotion-webcodecs@4.0.479 — NA_ENGINE, honest.** Its converter targets re-encode/transcode flows and does not declare a container copy-`trim` operation.

All six NA verdicts are genuine capability declarations, not failed attempts: every NA entry has empty `oracleOutcomes[]` and no bench samples.

## Anti-cheat validation

- **Scenario:** `src/scenarios/trim/index.ts:643-664` (`id: 'massive_h264_copy_sustained'`).
- **Fixture:** `asset: 'massive_h264_1080p_2h.mp4'` — verified present at `fixtures/media/massive_h264_1080p_2h.mp4`, **1.1 GB** real H.264 1080p + AAC MP4. Not synthetic/empty/mock.
- **Oracle(s):** `trim-boundaries` (`src/core/oracles.ts:2346-2435`) — performs a real reference-probe + decode duration comparison against the scenario range with a 1.0 s tolerance; `playback-smoke` (`oracles.ts:1572+`) actually plays the output `<video>`. The duration gate is a real measurement (Δ=0.0747 s), not a trivially-true assertion. The boundary-frame digest is intentionally inactive here (no trim-range golden), so correctness is duration + reference-probe + playback rather than bit-exact — meaningful for a copy-trim but not the strongest possible (frame-digest) gate.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1445-1500` (real `Conversion` with `trim` range) + `adapter.ts:266-270` (lazy `UrlSource`). The no-op short-circuit at lines 1468-1477 cannot fire (start=3600 s ≠ 0), so the output is a genuinely produced trim, not an input→output copy fake. No canned output, no golden short-circuit, no swallowed errors (invalid ranges throw at 1450-1455).
- **Verdict: REAL** (with a mild gate caveat). Real 1.1 GB fixture + real Conversion-based trim through a range-reading source + a meaningful (duration + reference-probe + playback) oracle that recorded plausible numbers.
- **Cached note:** mediabunny's entry has `cached: true` ("cached previous PASS result"), `durationMs=209997`. The PASS is reused from a prior run, so the wall/throughput/longtasks numbers reflect that earlier execution and carry staleness risk; they were not re-measured in this shard.

## Confidence & caveats

- Confidence: **high** on the verdict (single eligible PASS by explicit feature gate; implementation and fixture both verified in code).
- The win is purely on **eligibility/capability**, not a performance contest — no second engine ran, so margins are not meaningful.
- `cached: true`: timings are from a previous run; treat wall=5321 ms / throughput=1353x as indicative, not freshly verified.
- primaryMetric is `sourceReads`, but `sourceReads`/`peakMemory`/`targetWrites` all have **n=0 samples** in this shard, so the headline OOM-resistance/lazy-read metric was not actually captured for this run — the lazy-read claim is validated by code inspection (UrlSource), not by a recorded `sourceReads` count.
- Oracle strength is structural/duration-level (trim-boundaries) + smoke (playback), not bit-exact; >4096-frame output exceeds the decode cap by design, so no boundary-frame digest was compared.
