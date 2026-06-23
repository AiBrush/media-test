# streaming-output/prop_probe_dur_buffer_shape

- family: streaming-output
- fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264 1080p30 + AAC 48kHz stereo, 30.0s)
- primaryMetric: wall (no explicit primaryMetric on shard entries; bench = wall / peakMemory / longtasks)
- passCount: 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (`ffmpeg-wasm`).
- Status: **CONTESTED** — two engines PASS (mediabunny and ffmpeg-wasm).
- Decisive factor: **correctness strength first** — ffmpeg-wasm's remuxed buffer output probes to a **bit-exact** duration (`outDurationSec=30`, `deltaSec=0.0000s`) versus mediabunny's `outDurationSec=30.08`, `deltaSec=0.0800s`. Both clear the `durationToleranceSec=0.125` gate, but ffmpeg's invariant delta is strictly tighter (0.0000 vs 0.0800). ffmpeg-wasm also wins the wall-clock tiebreaker.
- Margin over runner-up: duration delta 0.0000s vs 0.0800s (mediabunny is 80 ms off the source duration); wall **284.70 ms vs 413.06 ms → ~1.45x faster wall**. Caveat: mediabunny wins main-thread blocking (longtasks 1007 ms vs 3045 ms, ~3.0x lower) and reports a measured peakMemory (72.1 MB) where ffmpeg's peakMemory is unmeasured (n=0). All bench samples are n=1 (single shot, mad=0), so the performance margins are weak evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, mp4-box-layout:true | 284.70 ms | n/a | 0 (n=0, unmeasured) | 3045 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true, mp4-box-layout:true | 413.06 ms | n/a | 72,120,486 B (72.1 MB) | 1007 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:none' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:none' |

No throughputRealtime metric is present in any bench block for this scenario.

## Why the winner wins (deep technical)

This scenario is a metamorphic duration-invariant probe: remux the source H.264/AAC MP4 into a **progressive, fastStart:false BufferTarget MP4** (`shape: { container:'mp4', fastStart:false, target:'buffer' }`) and assert that the re-wrapped output still probes to the source duration within ±0.125 s (`src/scenarios/streaming-output/metamorphic.ts:66-76`). Because both winners do a pure container rewrap (stream copy, no decode/encode), the operation exercises the container muxer's timeline bookkeeping (movie/track `mvhd`/`mdhd`/`tkhd` durations and edit lists), not the codec backend.

ffmpeg.wasm performs the remux with `-map 0 -c copy` and, critically for this case, **emits NO `-movflags`** when `fastStart === false`: the `else if (opts.fastStart !== false)` branch is skipped, so `+faststart` is never applied and the moov is left at the default tail position (`src/engines/ffmpeg-wasm/adapter.ts:2044-2050`). The shard's `mp4-box-layout` measurement confirms the expected control layout `ftyp@0, free@32, mdat@40, moov@31231517` (`topLevelBoxes=4`, `mdatOffset=40 < moovOffset=31231517`), i.e. mdat-before-moov, exactly what `fastStart:false` should produce (oracle branch `src/core/oracles.ts:415-423`). Because ffmpeg stream-copies the original sample table verbatim and recomputes the MP4 timeline from the copied stts/track timescales, the muxed `mvhd` duration round-trips to the source's 30.0 s exactly: the property-invariant oracle reports `outDurationSec=30`, `goldenDurationSec=30`, `deltaSec=0` (`src/core/oracles.ts:2709-2758`; golden duration from `fixtures/golden/h264_1080p_30s.mp4.meta.json` `durationSec:30`).

mediabunny also genuinely remuxes — `Conversion.init/execute` over a real `Input` and an `Output` bound to a `BufferTarget`, with `fastStart:false` threaded through `outputFormatOptionsFrom` (`src/engines/mediabunny/adapter.ts:1244-1260`, `767-839`, `180-196`). Its layout `ftyp@0, mdat@28, moov@31259904` (`topLevelBoxes=3`) is also a valid mdat-first control and passes `mp4-box-layout`. But its probed output duration is `30.08 s` (`deltaSec=0.0800`), 80 ms longer than the source — almost certainly the trailing edit-list / last-AAC-frame / mvhd-vs-track timescale rounding that mediabunny's TS muxer introduces when it rebuilds the timeline. That is still inside the 0.125 s band, so it PASSes, but on the correctness ladder (property-invariant with a tighter measured tolerance wins) ffmpeg's `Δ=0.0000` strictly beats mediabunny's `Δ=0.0800`.

Performance reinforces ffmpeg here for the wall metric: a `-c copy` rewrap inside the wasm core completes in 284.70 ms versus mediabunny's 413.06 ms streaming-lockstep Conversion (~1.45x). mediabunny ran on the WebCodecs backend (`env.configUsed.backend="webcodecs"`, `hwAccel="prefer-hardware"`, `wasmThreads=0`, `pipeline="streaming-lockstep"`, `coopCoep="not-required"`), but for a stream-copy remux there are no decode/encode passes for hardware WebCodecs to accelerate, so the WebCodecs advantage does not materialize. mediabunny does win two perf sub-metrics — longtasks 1007 ms vs 3045 ms (the single-thread wasm core, `wasmThreads=0`, blocks the main thread ~3x longer) and a measured peakMemory of 72.1 MB (ffmpeg reports `peakMemory n=0`, i.e. no measurement). Those do not overturn the correctness-first ranking: ffmpeg wins the primary correctness axis (tighter duration delta) and the wall tiebreaker, so it is the winner. All benches are n=1 (mad=0, p95=median), so treat the perf margins as directional, not statistically robust.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but loses. Real remux (`Conversion`, `adapter.ts:1244-1260`), valid mdat-first layout, but probed output duration is `30.08 s` (`deltaSec=0.0800`) vs ffmpeg's bit-exact `30.00 s` (`deltaSec=0.0000`); also 1.45x slower wall (413.06 vs 284.70 ms). It does win longtasks (1007 vs 3045 ms) and has a measured peakMemory, but correctness-first ranking puts ffmpeg ahead.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest capability gap — web-demuxer is a demux-only library, no muxer/remux path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — media-parser is a read/probe-only parser, it has no output container writer.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — the bare WebCodecs/platform shim has no container muxer to remux MP4-in-MP4.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare feature 'fastStart:none'". mp4box can mux/segment MP4 but the adapter does not advertise the explicit moov-at-tail (`fastStart:false`) control shape required by this case; looks like an honest under-declaration of a niche output shape rather than a missing core capability.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'fastStart:none'". Same fastStart:none feature gate; honest — its output path defaults to a different layout and does not declare the tail-moov control.

## Anti-cheat validation

- Scenario definition: `src/scenarios/streaming-output/metamorphic.ts:66-76` (id `prop_probe_dur_buffer_shape`), built via `buildStreamPropertyAll` in `src/scenarios/streaming-output/_shared.ts` (fastStart:false → `fastStart:none` feature at `_shared.ts:180-181`).
- Fixture asset: `fixtures/media/h264_1080p_30s.mp4` — **exists**, 31 MB, genuine H.264 1080p30 + AAC. Golden duration source `fixtures/golden/h264_1080p_30s.mp4.meta.json` (`durationSec:30`). Not synthetic/mock.
- Oracle implementations: `property-invariant` probe-duration branch `src/core/oracles.ts:2709-2758` (real reference-engine probe of `ctx.output`, absolute-delta vs golden duration, explicit 0.125 s tolerance — not trivially satisfiable); `mp4-box-layout` `src/core/oracles.ts:365-426` (real top-level box parse, asserts mdat-before-moov for fastStart:false).
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — genuine `-map 0 -c copy` stream-copy remux through the ffmpeg.wasm core; reads real output bytes from MEMFS (`readBinary`). No canned output, no input→output copy shortcut, no golden short-circuit, no error swallowing (errors propagate via `this.run`).
- Verdict: **REAL**. Real 31 MB fixture, real ffmpeg.wasm `-c copy` remux producing a real ISOBMFF output, two non-trivial oracles (a metric duration-invariant with a finite tolerance and a structural box-layout check) whose measurements are physically plausible (mdat@40, moov@31.2M for a ~31 MB file; duration exactly 30.0 s).
- Cached note: ffmpeg-wasm result `cached==true` ("cached previous PASS result", `durationMs=4975`, `startedAtIso=2026-06-22T13:55:57Z`); mediabunny also `cached==true`. Both rows are reused, not freshly re-run — staleness risk applies (per the launcher seeding caveat, stale PASS reuse can mask regressions), but the cached measurements are internally consistent and plausible.

## Confidence & caveats

- Confidence: **medium**. Both winners are genuinely implemented and both PASS; the winner call rests on a real but small correctness edge (Δ=0.0000 vs 0.0800 s, both inside tolerance) plus a wall-time win that is contradicted by longtasks/peakMemory. A reviewer who weights main-thread responsiveness or memory could reasonably prefer mediabunny.
- All bench samples are n=1 (warmup=1, mad=0, p95=median) — performance margins are single-shot and not statistically robust.
- Both PASS rows are cached; numbers were not re-measured this run.
- ffmpeg's peakMemory is unmeasured (n=0), so the memory comparison is one-sided.
- The duration tolerance (0.125 s) is generous enough that mediabunny's 80 ms drift passes; the gate is meaningful but not extremely tight for this metric.
