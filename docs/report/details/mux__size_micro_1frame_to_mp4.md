# mux/size_micro_1frame_to_mp4

- family: mux
- fixture asset(s): `fixtures/media/micro_h264_1frame.mp4` (5.5 KB, real on disk)
- primaryMetric: `throughputRealtime` (inherited default; no per-case override in size-ladder.ts)
- passCount: 3 of 7 (mediabunny, ffmpeg-wasm, mp4box)

## Verdict

- Best framework: **mediabunny@1.48.0** — CONTESTED (3 engines PASS with identical correctness).
- Decisive factor: PERFORMANCE on the primary metric. Correctness is a dead heat (all three PASS the same
  two oracles with identical measurements), so the tie breaks on `throughputRealtime`, where mediabunny leads.
- Margin over runner-up (mp4box): **295.86 vs 236.41 x-realtime = 1.25x throughput**, and **3.38 ms vs
  4.23 ms wall = 1.25x faster**. Over the slowest passer (ffmpeg-wasm): **3.60x throughput / 3.60x wall**.
  All numbers are n=1 (single sample, mad=0), so the margin is real but statistically thin — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass, property-invariant:pass | 3.38 | 295.86 | n/a (n=0) | 4277 | cached previous PASS result |
| mp4box@2.3.0 | PASS | reference-reimport:pass, property-invariant:pass | 4.23 | 236.41 | n/a (n=0) | 474 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass, property-invariant:pass | 12.16 | 82.27 | n/a (n=0) | 4410 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

All three passers report `peakMemory` and `targetWrites` with n=0 samples (not measured for this case), so
memory/target-write tiebreakers are unavailable. longtasks is reported but is a page-level main-thread metric,
not the leaderboard ranking number; note mp4box's longtasks (474 ms) is far lower than mediabunny's (4277 ms),
but longtasks does not override the primaryMetric.

## Why the winner wins (deep technical)

This case muxes a single-keyframe H.264 elementary stream (320x240, fps=1, ~4749-byte access unit per the
golden packet table) into an MP4 (`isom` brand). It is an I/O-bound sample COPY — no decode, no re-encode —
so the work is: demux one packet out of the source, then author the smallest possible MP4 sample table
(a one-entry `stts`/`stsz`/`stco`, an `stss` marking the single sample as a sync sample, and the `avcC`
codec-private box from the source SPS/PPS). The scenario notes call this exactly: the single-sample
sample-table authoring is a "classic muxer off-by-one rung" (`src/scenarios/mux/size-ladder.ts:39-48`).

Correctness is identical across the three passers. Both gating oracles return the same measurements for all
three:
- `reference-reimport` (`src/core/oracles.ts:1225-1271`): re-imports each engine's MP4 with the reference
  engine and gets `reimportPackets=1, reimportKeyframes=1`. For the `mux` op the oracle requires a non-empty
  packet table and, when a golden packet list exists (it does: `fixtures/golden/micro_h264_1frame.mp4.packets.json`
  has 1 keyframe packet), checks packet count and keyframe count are within 2% (±1). 1==1, so all pass.
- `property-invariant` / probe-duration (`src/core/oracles.ts:2711-2758`, `2730-2744`): probes the output
  duration via the reference engine and compares to golden `durationSec=1`. All three report
  `outDurationSec=1, goldenDurationSec=1, deltaSec=0` against an mp4 tolerance of `0.041666...s` (~1 frame at
  24fps). Δ=0 passes with maximum headroom.

With correctness tied, the win is purely on `throughputRealtime` (the size-ladder primaryMetric per
`src/scenarios/mux/size-ladder.ts:16-20`). mediabunny's mux path is a pure-TypeScript ESM muxer with no
WASM and no worker (`env.configUsed`: `backend:"webcodecs"`, `coreBuild:"pure-ts-esm"`,
`sharedArrayBuffer:false`, `coopCoep:"not-required"`). The mux implementation
(`src/engines/mediabunny/adapter.ts:1508-1597`) constructs an `mb.Output` with a `BufferTarget`, adds an
`EncodedVideoPacketSource` for the H.264 track sized to `maximumPacketCount: t.chunks.length` (i.e. 1 — it
pre-sizes the sample table for exactly one entry, no growth/realloc churn at `adapter.ts:1529`), attaches the
source `avcC` description and `codecParamForTrack` codec string only on the first packet
(`adapter.ts:1571-1590`), and copies the one `EncodedPacket` straight through (`adapter.ts:1562-1569`). For a
1-packet copy this is a near-constant-cost in-memory box-writer with no decode pipeline spin-up — which is
why it posts the lowest wall (3.38 ms) and highest throughput (295.86 x-realtime).

mp4box (`backend:"pure-js"`, `pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"`) is the next fastest at
4.23 ms / 236.41 x — also pure-JS, also correct, but its whole-file append + ISO box model carries slightly
more per-op overhead than mediabunny's pre-sized streaming source. The gap is small (1.25x) and on n=1.

ffmpeg.wasm is the outlier at 12.16 ms / 82.27 x — 3.6x slower. Even for a 1-packet copy, the wasm path pays
the cost of the MEMFS virtual filesystem round-trip (write input file, run the muxer, read output file) and
single-thread wasm execution, which dwarfs the actual sample-copy work at this micro size. It is correct, just
structurally heavier per op.

## What each other framework did wrong

- **mp4box@2.3.0** — PASSed, lost on throughput: 236.41 vs 295.86 x-realtime (0.80x) and 4.23 vs 3.38 ms wall
  (1.25x slower). Correctness identical; pure-JS whole-file-append overhead is marginally higher than
  mediabunny's pre-sized streaming muxer. (It does win longtasks 474 vs 4277 ms, but that is not the primary
  metric.)
- **ffmpeg.wasm@0.12.15** — PASSed, lost decisively on throughput: 82.27 vs 295.86 x-realtime (0.28x) and
  12.16 vs 3.38 ms wall (3.6x slower). Single-thread wasm + MEMFS file I/O overhead dominates a 1-packet copy.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — the
  media-parser library is a read/demux/probe tool with no muxer; declaring mux would be false.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — a demux-only
  WASM wrapper; no write/author path.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — the raw browser
  platform exposes WebCodecs encode/decode but no container muxer; writing MP4 boxes would require a
  third-party muxer the platform adapter intentionally does not bundle.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — a
  WebCodecs transcode wrapper that does not expose a standalone encoded-packet mux op.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/size-ladder.ts:38-48` (id `size_micro_1frame_to_mp4`), built via
  `buildMux` in `src/scenarios/mux/_shared.ts:204-228` (op `mux`, oracles = probe-duration invariant +
  reference-reimport for faithful mp4 targets).
- Fixture: input `micro_h264_1frame.mp4` resolves to `fixtures/media/micro_h264_1frame.mp4`, which EXISTS on
  disk (5.5 KB real file, not synthetic/empty). Golden packet table
  (`fixtures/golden/micro_h264_1frame.mp4.packets.json`) has 1 real keyframe packet of 4749 bytes; meta
  golden has H.264 320x240 fps=1 duration 1s. Physically plausible for a single-frame H.264 MP4.
- Gating oracles: `reference-reimport` at `src/core/oracles.ts:1225-1271` does a REAL re-demux of the
  engine's output bytes and compares packet/keyframe counts to the golden within ±2% (±1) — not trivially
  satisfiable (an empty/garbage output would fail the non-empty-packet check). `property-invariant`
  probe-duration at `src/core/oracles.ts:2711-2758` does a REAL reference probe of the output and compares to
  golden duration within ~1 frame. Measurements (1 packet, 1 keyframe, Δ duration 0.0s) are physically
  consistent with a single-frame clip.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508-1597` — genuine mediabunny `Output` /
  `EncodedVideoPacketSource` / `BufferTarget` muxer; copies the real demuxed packet with its avcC config; no
  hardcoded bytes, no input->output passthrough, no golden short-circuit, errors thrown loudly (e.g.
  unsupported codec at `adapter.ts:1527`).
- Verdict: **REAL** — real fixture, real library implementation, meaningful round-trip + duration oracles.
  Caveat (does not change verdict): both gating oracles use mediabunny as the *reference engine* to re-import
  and probe the output, so mediabunny is partly self-graded; the same self-grading applies symmetrically to
  the correctness tie, and the decisive metric (throughput) is engine-internal timing, so the winner ranking
  is unaffected.
- Cached note: mediabunny's result is `cached==true` ("cached previous PASS result"), as are mp4box's and
  ffmpeg-wasm's. The winning numbers were REUSED, not freshly re-run — staleness risk per the launcher
  seeding caveat. The relative ordering is robust to a re-run (1.25x and 3.6x gaps), but the absolute
  throughput/wall values should be treated as point estimates.

## Confidence & caveats

- Confidence: medium. The PASS-vs-NA partition and the correctness tie are unambiguous and code-verified.
  The winner is decided by a 1.25x throughput margin over mp4box — real but modest, on **n=1 samples**
  (mad=0, p95==median: a single observation each), so the margin is weak statistical evidence and a re-run
  could narrow or invert the mediabunny/mp4box ordering. The ffmpeg-wasm gap (3.6x) is large enough to be safe.
- All three passers report `peakMemory`/`targetWrites` with n=0 (unmeasured), so the secondary memory
  tiebreaker could not be applied.
- All three results are cached (not re-run this session).
- mediabunny is the suite reference engine; the oracles re-import/probe with it. This is a known structural
  property of the harness, not evidence of cheating, but it means correctness is self-consistent rather than
  cross-validated by an independent demuxer for this case.
