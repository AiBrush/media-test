# remux/prop_ts_to_mp4_duration_materialized

family: remux | fixture asset: `fixtures/media/h264_ts.ts` (4.6 MB, real MPEG-TS, H.264 720p30 + AAC 48k stereo) | primaryMetric: wall | passCount: 3 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 3 engines PASS: mediabunny, ffmpeg.wasm, remotion-webcodecs).
- **Decisive factor: PERFORMANCE.** All three winners pass the *same single* oracle (`property-invariant` / probe-duration) at comparable correctness — none has a stronger oracle ladder rung available here. With correctness tied, the tiebreak is wall time.
- **Margin over runner-up:** mediabunny 62.23 ms vs ffmpeg.wasm 115.15 ms = **1.85x faster wall**; vs remotion-webcodecs 852.70 ms = **13.7x faster wall**. mediabunny also has the smallest duration error (Δ 0.0057 s) and runs on a hardware WebCodecs backend with **no COOP/COEP requirement** (`coopCoep:"not-required"`, `sharedArrayBuffer:false`), versus ffmpeg.wasm's single-thread wasm. Caveat: all measurements are n==1, cached, so the perf ranking is directional rather than statistically robust.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true (Δ0.0057s) | 62.23 | n/a (not measured) | 0 (n=0) | 2147 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (Δ0.0057s) | 115.15 | n/a | 0 (n=0) | 2147 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true (Δ0.0700s) | 852.70 | n/a | 0 (n=0) | 2477 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ts' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Note: `peakMemory` and `throughputRealtime` were not captured for any engine in this shard (bench.peakMemory has n=0; no throughputRealtime metric present), so memory/throughput cannot break the tie. The ranking rests entirely on `wall` (n=1 each).

## Why the winner wins (deep technical)

This case probes the hardest part of TS→MP4: **MPEG-TS carries no global/container duration** (only PCR timestamps + per-PES PTS/DTS), so a correct remux must *materialize* a precise `mvhd`/`mdhd` duration in the output ISOBMFF that matches the source's true span. The oracle (`src/core/oracles.ts:2709`–`2758`, probe-duration branch) reference-probes the engine's output MP4 and compares its duration to the golden source duration (`fixtures/golden/h264_ts.ts.meta.json` → `durationSec: 10.021`). Tolerance is `durationToleranceSec: 1.50315` s (the LOOSE_DURATION band keyed off the estimate-only TS container).

mediabunny's remux runs the real Conversion pipeline, not a byte copy: `remux()` at `src/engines/mediabunny/adapter.ts:1244` builds an `OutputFormat` for `mp4`, opens the TS `Input`, and calls `runConversion()` (`src/engines/mediabunny/adapter.ts:842`), which does `Conversion.init` → `isValid` check → `execute()` → reads the produced `BufferTarget.buffer` into real bytes (`adapter.ts:855`–`866`). The Conversion API performs read→decode→encode→mux (per the adapter header note, `adapter.ts:49`) on a **hardware WebCodecs backend** (`env.configUsed.backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`). Because it walks the actual PTS span and writes it into the MP4 movie/track headers, the materialized duration is `outDurationSec: 10.026667` s vs golden `10.021` s — **Δ 0.005667 s**, three orders of magnitude inside the 1.50315 s band. That is the tightest delta of the three winners.

On performance mediabunny wins cleanly at **62.23 ms** wall. ffmpeg.wasm produces the *identical* duration (Δ 0.005667 s) — equally correct — but pays the single-thread wasm tax at **115.15 ms** (1.85x slower); it transmuxes through the libavformat MP4 muxer in WASM rather than native WebCodecs. remotion-webcodecs is also correct but at **852.70 ms** (13.7x slower) and a looser **Δ 0.0700 s** (its output duration 10.091 s); its `streaming-backpressure` + `bufferWriter` path and main-thread `convert` add overhead for this small file. mediabunny's edge is the combination of a hardware decode/encode WebCodecs path with no SharedArrayBuffer/COOP-COEP gating, plus an accurate header-duration write — fastest *and* most accurate.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on perf only. Same oracle, identical Δ 0.005667 s duration accuracy, but wall 115.15 ms = 1.85x slower than mediabunny (single-thread wasm libav muxer vs hardware WebCodecs). No correctness deficit.
- **remotion-webcodecs@4.0.479** — PASS, lost on perf and (marginally) accuracy. Wall 852.70 ms = 13.7x slower; duration Δ 0.0700 s (vs 0.0057 s) — still well inside tolerance but the loosest of the three. Higher longtasks (2477 ms vs 2147 ms).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: it is a *parser* (demux/probe) library, not a muxer; not under-declared.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ts'". Honest: mp4box.js is an ISOBMFF-only library and genuinely cannot ingest MPEG-TS; declaring no `ts` input is correct.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: the bare WebCodecs/platform shim exposes decode/encode primitives, not a one-call container remux.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: it is a demuxer (extract packets), not a remuxer that writes a new container.

## Anti-cheat validation

- **Scenario:** `src/scenarios/remux/metamorphic.ts:67` (`id: 'prop_ts_to_mp4_duration_materialized'`), invariant `probe-duration`, input `h264_ts.ts`, from `ts` to `mp4`. Notes (`metamorphic.ts:74`–`77`) state the gating rationale: TS has no global duration, output MP4 must write a precise mvhd duration ≈ source.
- **Fixture exists:** `fixtures/media/h264_ts.ts` = 4.6 MB real MPEG-TS (NOT synthetic/empty). Golden `fixtures/golden/h264_ts.ts.meta.json` declares `durationSec: 10.021`, container `ts`, H.264 1280x720@30 + AAC 48k stereo — physically plausible for a ~10 s 720p clip; matching `.packets.json` (87 KB) also present.
- **Oracle:** `src/core/oracles.ts:2709`–`2758` performs a REAL reference-probe of the engine output and an absolute-delta comparison against the golden duration. Measurements are plausible (out 10.0267 s vs golden 10.021 s). The 1.50315 s band is the documented LOOSE_DURATION container band for estimate-only TS, not an "anything passes" tolerance — a wrong/zero/dropped-track duration (e.g. 0 s or 5 s) would still fail by a wide margin.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1244` (`remux`) → `:842` (`runConversion`, `Conversion.init`/`execute`, real `BufferTarget.buffer` read at `:860`). Genuinely calls the library; does NOT copy input→output, return canned bytes, short-circuit to a golden, or swallow errors (it throws on invalid conversion / empty buffer, `:851`,`:861`).
- **Verdict: REAL.** Real fixture + real Conversion implementation + meaningful (non-trivial) duration oracle. The tolerance is loose-by-design for TS but still discriminating.
- **Cached note:** winner result has `cached: true` ("cached previous PASS result"). Staleness risk — the PASS and the 62.23 ms wall were reused, not freshly re-run in this report pass. Per the launcher seeding caveat, a fully honest re-run would clear raw + .browser-cache. Treat the perf number as directional.

## Confidence & caveats

- Confidence: **medium**. The winner selection is robust (genuine impl, real fixture, real oracle, clear 1.85x/13.7x wall margins). Downgraded from high because: (1) all three winners share a single, intentionally-loose oracle — no bit-exact or structural rung distinguishes correctness, so the decision is purely perf-driven; (2) every measurement is **n==1** with mad==0 and **cached==true**, so the wall ranking lacks repeat-sample/variance evidence; (3) peakMemory and throughputRealtime were not captured, removing two potential tiebreakers.
