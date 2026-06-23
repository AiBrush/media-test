# performance/size-ladder-extract-metadata-medium

- family: performance
- fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264 1080p30 + AAC 48 kHz stereo, ~30 s)
- primaryMetric: opsPerSec (higher better); secondary wall (ms, lower better)
- passCount: 7 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: YES — all 7 engines PASS the same single correctness gate (`golden-metadata`) with identical
  results (durationDeltaSec=0, 2 tracks matched), so correctness is a perfect tie and the decision falls to
  the performance ladder.
- Decisive factor: **per-call probe throughput (opsPerSec)**. mediabunny is 272.11 ops/s (wall 3.675 ms) —
  the fastest of all 7.
- Margin over runner-up (remotion-media-parser, 202.22 ops/s / 4.945 ms): **1.35x higher opsPerSec,
  1.35x lower wall**. Over the slowest passing engine (platform, 9.45 ops/s / 105.785 ms) the gap is
  **28.8x opsPerSec / 28.8x wall**. All samples are n=1 (cached single run) — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | opsPerSec | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 3.675 | 272.11 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 4.945 | 202.22 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 6.615 | 151.17 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 27.785 | 35.99 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 61.045 | 16.38 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 73.925 | 13.53 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 105.785 | 9.45 | n/a | n/a | n/a | cached previous PASS result |

(This scenario's metric list is `['opsPerSec','wall']` only — throughputRealtime/peakMemory/longtasks are
not collected here, hence n/a across the board.)

## Why the winner wins (deep technical)

The operation is `op: 'probe'` on a faststart (non-fragmented) progressive MP4: read the container header,
report container + duration + per-track codec/dimensions/fps/sampleRate/channels. There is no decode and no
sample-data read in the hot path. At this "medium" rung (31 MB, 30 s) the dominant cost is therefore
**header-parse + per-call overhead**, exactly the axis §5.3 of `size-ladder.ts` (file header, lines 4-11)
exists to isolate. The winner is whoever can crack the moov atom and enumerate tracks with the least fixed
overhead.

mediabunny's probe path (`src/engines/mediabunny/adapter.ts:417` `metadataFromInput`) is structurally ideal
for this. It calls `input.getFormat()` for the container, then takes the **cheap duration path**:
`input.getDurationFromMetadata()` (adapter.ts:429), which reads the declared `mvhd`/`tkhd` duration directly
out of the already-parsed `moov` rather than walking samples; only on a null/non-finite result does it fall
back to `input.computeDuration()` (adapter.ts:436). For a faststart MP4 with a valid mvhd (golden duration
30 s), the metadata-first branch returns immediately and the expensive sample-table walk is never entered.
It then enumerates tracks once via `input.getTracks()` + `normalizeTrack()` (adapter.ts:443-447). mediabunny
is a pure-TS ESM core (`env.configUsed.coreBuild: "pure-ts-esm"`, `sharedArrayBuffer:false`,
`coopCoep:"not-required"`) with no wasm module to instantiate and no worker round-trip — so the per-call
fixed cost is essentially "parse the moov box tree once," which is why it lands at **3.675 ms / 272.11 ops/s**.
The `golden-metadata` oracle (`src/core/oracles.ts:595`) confirms it read the structure correctly: container
`mp4`, durationDeltaSec=0 (under the strict ±1-frame band of 0.0417 s), and both tracks (h264 1920x1080@30,
aac 48000/2ch) matched the golden positionally.

The two Remotion engines are close behind for the same reason: remotion-media-parser
(`backend:"cpu-js"`, `fieldsTier:"metadata-only"`, `reader:"webReader"`, `worker:false`) is a streaming
JS box parser that stops at metadata — 4.945 ms / 202.22 ops/s, only 1.35x slower. remotion-webcodecs
(`backend:"webcodecs"`, `pipeline:"streaming-backpressure"`) is at 6.615 ms / 151.17 ops/s. All three
JS/streaming parsers crush the wasm and platform engines because none of them needs to spin up a heavy
runtime just to read a header.

The decisive performance gap is mediabunny vs the heavyweight engines. ffmpeg.wasm (73.925 ms / 13.53 ops/s,
**20.1x slower** than mediabunny) pays the cost of routing even a metadata probe through the wasm FS +
libav* demuxer; mp4box (61.045 ms / 16.38 ops/s, **16.6x slower**) uses `whole-file-append`
(`pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"`, `rangeReads:false`) so it appends the buffer and
runs its JS ISOBMFF parser over the full file rather than a header-only fast path; platform
(105.785 ms / 9.45 ops/s, **28.8x slower**) is the standard `<video>`/WebCodecs route whose element/decoder
setup overhead dwarfs the actual header read for a metadata-only operation.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on speed only: 4.945 ms / 202.22 ops/s vs mediabunny's
  3.675 ms / 272.11 ops/s = 1.35x slower wall, 0.74x the throughput. Correctness identical
  (golden-metadata pass, durationDelta=0). Marginal loser.
- **remotion-webcodecs@4.0.479** — PASS, 6.615 ms / 151.17 ops/s = 1.80x slower wall than the winner. Its
  webcodecs streaming-backpressure pipeline adds overhead a pure header probe doesn't benefit from.
- **web-demuxer@4.0.0** — PASS, 27.785 ms / 35.99 ops/s = 7.56x slower wall (0.13x throughput). Wasm-backed
  demuxer; runtime/glue overhead on a tiny operation.
- **mp4box@2.3.0** — PASS, 61.045 ms / 16.38 ops/s = 16.6x slower wall. `whole-file-append` with
  `rangeReads:false` buffers/parses more than a header-only fast path needs.
- **ffmpeg.wasm@0.12.15** — PASS, 73.925 ms / 13.53 ops/s = 20.1x slower wall. Full libav* demux through
  the wasm FS for what is only a header read.
- **platform@chrome-149** — PASS, 105.785 ms / 9.45 ops/s = 28.8x slower wall (slowest passing engine).
  `<video>`/WebCodecs element + decoder setup overhead is the dominant cost for a metadata-only probe.

No engine FAILed or was NA here; every loss is purely a performance margin on an identical correct result.

## Anti-cheat validation

- Scenario definition: `src/scenarios/performance/size-ladder.ts:69-83` (`extractLadder`), id built at line 71
  as `performance/size-ladder-extract-metadata-${r.key}`; the `medium` rung is `src/scenarios/performance/_shared.ts:77`
  → `medium: 'h264_1080p_30s.mp4'`. op=`probe`, oracles=`['golden-metadata']`, primary=`opsPerSec`.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` EXISTS, 31 MB — a real H.264/AAC MP4, not synthetic/empty/mock.
- Golden: `fixtures/golden/h264_1080p_30s.mp4.meta.json` EXISTS (container mp4, durationSec 30, video h264
  1920x1080@30 + audio aac 48000/2ch). This is the `baked: true` rung per size-ladder.ts:50.
- Oracle: `src/core/oracles.ts:595` `goldenMetadata` performs a REAL structural comparison — container
  (line 606), duration within a strict per-frame tolerance band (lines 614-637; measured tolerance
  0.04167 s = ±1 frame at 24fps floor), track count (645), and per-track codec/width/height/fps/
  sampleRate/channels via `compareTrack` (line 659). It is NOT trivially satisfiable: any wrong field
  pushes a diff and fails. Measured durationDeltaSec=0 against a 30 s golden is physically plausible
  (both demuxers read the same mvhd).
- Winner adapter: `src/engines/mediabunny/adapter.ts:417-474` `metadataFromInput` genuinely calls the real
  mediabunny library (`input.getFormat()`, `getDurationFromMetadata()`/`computeDuration()`, `getTracks()`,
  `normalizeTrack()`). No canned output, no golden short-circuit, no copy-to-fake, no error swallowing that
  would report success.
- cached note: **ALL 7 results have cached==true** (reason "cached previous PASS result"). The PASS verdicts
  and metadata are trustworthy (reproducible structural reads), but the timing numbers were reused, not
  freshly measured this run — staleness risk applies to the magnitude of the margins, not to who passes.
- Verdict: **REAL** — real 31 MB fixture, real golden, meaningful structural oracle, genuine library call.

## Confidence & caveats

- Confidence: **medium**. The winner and ranking are unambiguous (mediabunny is fastest on the primary
  metric with a clean correctness tie), and the implementation/oracle are verified genuine.
- Caveat 1: every bench is **n=1, warmup=1, mad=0, p95==median** — single-sample timings. The 1.35x margin
  over remotion-media-parser is within the range a single noisy sample could swing; the large gaps
  (vs wasm/platform, 16-29x) are robust, the top-3 ordering is softer evidence.
- Caveat 2: all results are **cached** (run timestamps 2026-06-22 13:52–16:48), so the timings reflect a
  prior run, not this invocation — per the launcher seeding caveat, clear raw + .browser-cache for an honest
  fresh re-measure if the close top-3 margins matter.
- Caveat 3: this rung's metric set excludes peakMemory/throughputRealtime/longtasks, so the memory/streaming
  dimension (where wasm engines might differ) is not exercised here — that lives in the demux-peak-memory rungs.
