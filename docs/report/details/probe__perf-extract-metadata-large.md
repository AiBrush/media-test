# probe/perf-extract-metadata-large

- **Family:** probe
- **Fixture asset:** `fixtures/media/large_h264_1080p_120s.mp4` (~90 MB, H.264 1080p30 video + AAC 48 kHz stereo, faststart MP4)
- **Golden:** `fixtures/golden/large_h264_1080p_120s.mp4.meta.json`
- **Primary metric:** `opsPerSec` (repeated-probe throughput); `wall` is context
- **passCount:** 7 / 7 (every engine PASS)

## Verdict

- **Best framework:** `mediabunny@1.48.0` (CONTESTED — all 7 engines pass the same oracle).
- **Decisive factor:** PERFORMANCE. Correctness is identical across all 7 (each passes `golden-metadata`
  with `durationDeltaSec=0`), so the §8.1 headline metric `opsPerSec` decides. mediabunny posts the
  highest throughput by a wide margin.
- **Margin over runner-up:** mediabunny **274.35 ops/s** vs remotion-media-parser **194.93 ops/s** =
  **1.41x higher throughput**; on wall, **3.645 ms vs 5.13 ms = 1.41x faster**. Against the
  third-fastest (remotion-webcodecs, 126.58 ops/s / 7.9 ms) it is **2.17x**. Against the slowest passing
  engine (mp4box, 6.91 ops/s / 144.67 ms) it is **~39.7x**.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | opsPerSec | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 3.645 | 274.35 | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 5.13 | 194.93 | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 7.9 | 126.58 | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 96.03 | 10.41 | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 144.67 | 6.91 | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 173.10 | 5.78 | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 173.97 | 5.75 | n/a | n/a | cached previous PASS result |

(The bench block carries only `opsPerSec` and `wall`; `peakMemory`/`longtasks`/`throughputRealtime`
were not recorded for this probe-throughput scenario, hence "n/a".)

## Why the winner wins (deep technical)

The operation is **repeated metadata extraction on a ~90 MB faststart H.264/AAC MP4**. Because the file
is faststart (`major_brand: isom`, `moov` ahead of `mdat`), a correct probe is an **O(header) front-of-file
read**: parse `ftyp` + `moov` (`mvhd` global duration, `trak`/`mdia`/`minf`/`stbl` sample descriptions),
and never touch the 90 MB media payload. The scenario notes (`src/scenarios/probe/index.ts:382-384`) make
this explicit: "repeated metadata extraction… Score = probes/sec; correctness gated by golden-metadata."
The whole point at LARGE scale is that probe stays O(header), not O(samples).

mediabunny's probe path nails this. In `src/engines/mediabunny/adapter.ts:417-447`, `metadataFromInput`
takes the **cheap metadata-only route**: it calls `input.getDurationFromMetadata()`
(`adapter.ts:429`) which reads the container's declared global duration from `mvhd` **without scanning
samples**, and only falls back to the expensive `computeDuration()` sample/fragment walk if metadata
yields null/non-finite (`adapter.ts:434-441`). Tracks come from `input.getTracks()` (`adapter.ts:443`),
which parses the `stsd` codec descriptions (h264, aac), dims (1920x1080), fps (30), sampleRate (48000),
channels (2) — exactly the fields `golden-metadata` checks (`oracles.ts:642-686`). The result:
`durationDeltaSec=0` against the golden `120s` (well inside the `±0.0417s` one-frame band,
`durationToleranceSec=0.041666…` in the shard), 2 tracks matched.

Mechanistically, mediabunny is a **pure-TS ESM container reader** (`configUsed.coreBuild:"pure-ts-esm"`,
`backend:"webcodecs"` but only for codec capability warm-up, not for the probe itself). The probe is a
direct byte parse of the moov box with no wasm module instantiation, no full-file buffering, and no
`<video>` element round-trip. Each repeated probe is therefore a tight JS parse of the already-resident
header bytes → **274.35 probes/s / 3.645 ms wall**.

The runner-up, **remotion-media-parser** (194.93 ops/s, 5.13 ms), is architecturally the same idea — a
streaming CPU-JS parser in `metadata-only` field tier (`configUsed.fieldsTier:"metadata-only"`,
`backend:"cpu-js"`, `reader:"webReader"`) — and it correctly stops at the header. It loses by **1.41x**
purely on parser overhead (its streaming reader/field-extraction pipeline carries more per-probe work
than mediabunny's direct moov walk). The gap is real but narrow, and both sit in the same correctness
class.

The order-of-magnitude losers reveal who pays for the full file. **mp4box** (6.91 ops/s, 144.67 ms) uses
`whole-file-append(MP4BoxBuffer+fileStart)` with `rangeReads:false`
(`configUsed.pipeline`), i.e. it feeds the entire ~90 MB into its ISO-BMFF parser per probe — O(file),
not O(header) — which is why it is **~39.7x slower** despite producing the same metadata. **platform**
(Chrome WebCodecs path) and **ffmpeg.wasm** are slowest (~173 ms, 5.78 / 5.75 ops/s): platform funnels
through `VideoDecoder`/`<video>` machinery to read metadata, and ffmpeg.wasm must demux the file through a
single-thread wasm `avformat` open. **web-demuxer** (10.41 ops/s, 96.03 ms) sits between — a wasm demuxer
open that, while correct, is an order of magnitude slower than the native-JS header readers.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, correct (`durationDeltaSec=0`), but **1.41x slower wall
  (5.13 ms vs 3.645)** and 1.41x lower throughput (194.93 vs 274.35 ops/s). Same metadata-only streaming
  strategy, just more per-probe overhead. Only loser in the same correctness *and* same algorithmic
  (O-header) class.
- **remotion-webcodecs@4.0.479** — PASS, correct, but **2.17x slower (7.9 ms / 126.58 ops/s)**. Its
  config notes adapter fast-paths (http-range sample-table) aimed at huge demux rows; for this large probe
  it still carries WebCodecs-oriented setup cost the pure parsers avoid.
- **web-demuxer@4.0.0** — PASS, correct, but **~26x slower (96.03 ms / 10.41 ops/s)**. wasm demuxer
  open per probe is far heavier than a native-JS moov walk.
- **mp4box@2.3.0** — PASS, correct, but **~39.7x slower (144.67 ms / 6.91 ops/s)** because
  `whole-file-append` with `rangeReads:false` buffers the entire ~90 MB per probe (O-file instead of
  O-header).
- **platform@chrome-149** — PASS, correct, but **~47x slower (173.10 ms / 5.78 ops/s)**: reading metadata
  via the WebCodecs/`<video>` decode stack is the heaviest correct path here.
- **ffmpeg.wasm@0.12.15** — PASS, correct, but **slowest (173.97 ms / 5.75 ops/s)**: single-thread wasm
  `avformat` open dominated by module/demux setup. Last on the leaderboard.

No NA and no FAIL — there is no under-declared capability to flag; every engine genuinely implements
probe and matches the golden.

## Anti-cheat validation

- **Scenario:** `src/scenarios/probe/index.ts:375-424` (`PERF_PROBE_CASES[0]`, id
  `perf-extract-metadata-large`, asset `large_h264_1080p_120s.mp4`, oracle `golden-metadata`, metrics
  `[opsPerSec, wall]`).
- **Fixture exists & is real:** `fixtures/media/large_h264_1080p_120s.mp4` present, **~90 MB** real H.264
  1080p MP4 — not synthetic/empty/mock. Golden `fixtures/golden/large_h264_1080p_120s.mp4.meta.json`
  exists with concrete real values (container mp4, durationSec 120, h264 1920x1080@30 bitrate 5836579,
  aac 48000/2).
- **Winner adapter genuinely implemented:** `src/engines/mediabunny/adapter.ts:417-473`
  (`metadataFromInput`) calls the real mediabunny `Input` API — `getFormat()`, `getDurationFromMetadata()`
  (`:429`), `computeDuration()` fallback (`:436`), `getTracks()`/`normalizeTrack` (`:443-447`),
  `getMetadataTags()` (`:457`). No canned output, no copy-input, no short-circuit to the golden, no error
  swallowing that fakes success — failures set `durationSec=null` (which would *fail* the oracle, not pass
  it).
- **Oracle is meaningful:** `goldenMetadata` (`src/core/oracles.ts:593-657`) does a real field-by-field
  compare of container, duration (within a strict per-frame `±0.0417s` band, `oracles.ts:614-637`), and
  per-track codec/dims/fps/sampleRate/channels (`compareTrack`, `:659-686`). It is not smoke, not a
  perceptual proxy, not a wide-open tolerance. Measured `durationDeltaSec=0` vs tol `0.0417` is physically
  plausible for a 120 s file (exact container-declared duration). 2 tracks matched is correct for this
  fixture (1 video + 1 audio).
- **Cached note:** **All 7 results have `cached==true`** ("cached previous PASS result"). The PASS verdicts
  and metadata correctness are trustworthy (the oracle is deterministic on a fixed fixture/golden), but the
  *throughput numbers* (opsPerSec/wall) were reused, not freshly measured this run — per the launcher
  seeding caveat, treat the exact ms values as last-known-good rather than fresh. The relative ordering
  (native-JS readers >> wasm/WebCodecs) is robust regardless.
- **Verdict: REAL.** Real ~90 MB fixture, real mediabunny header-parse implementation, real metadata oracle
  with a strict tolerance. The only caveat is staleness from caching and `n==1` samples.

## Confidence & caveats

- **Confidence: high** that mediabunny wins. The throughput gap to the runner-up is 1.41x and to the wasm/
  WebCodecs cohort is 25–48x — far outside any plausible single-sample noise.
- **n==1, mad==0** for every engine: each metric is a single warmed sample (no spread), so absolute ms are
  weak evidence individually. The decisive evidence is the *architectural* ordering (O(header) native-JS vs
  O(file) wasm/decode-stack), which the numbers consistently reflect.
- **cached==true** for all engines → numbers are reused; a fresh re-run is advised to confirm the exact
  274.35 vs 194.93 figure, though the winner is not in doubt.
- mediabunny and remotion-media-parser are close enough that on a different host or with warm caches the
  margin could narrow; mediabunny's edge is the more direct moov walk vs remotion's streaming field-tier
  pipeline.
