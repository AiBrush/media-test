# streaming-output/prop_probe_dur_fragmented_shape

- **Family:** streaming-output
- **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (real, 31 MB; H.264 1080p30 video + AAC 48 kHz stereo, 30.000 s)
- **Operation / shape:** `remux` → fragmented MP4 (fMP4/CMAF, `shape: { container: 'mp4', fragmented: true }`), feature `fragmented`
- **primaryMetric:** wall (scenario declares metrics `['wall','peakMemory','longtasks']`, no explicit primary)
- **passCount:** 3 of 7 (mp4box, mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `mp4box@2.3.0` — **CONTESTED** (3 engines PASS).
- **Decisive factor:** mp4box wins on BOTH legs of the rank ladder. (a) Correctness strength: it is the only PASS engine that reports the duration **bit-exactly** — `property-invariant` Δ **0.0000 s** vs source 30 s, where ffmpeg-wasm posts Δ 0.0214 s and mediabunny Δ 0.0800 s (all under the 0.125 s tolerance, but mp4box is strictly tightest). (b) Performance: with correctness effectively tied (all pass the same two oracles), mp4box also has the lowest wall median.
- **Margin over runner-up (ffmpeg-wasm):** wall **177.50 ms → 138.21 ms = 1.28x faster**. Versus mediabunny (326.49 ms): **2.36x faster**. Duration error is exactly 0.0000 s for mp4box vs 0.0214 s (ffmpeg) and 0.0800 s (mediabunny). Evidence strength is weak on the bench axis: every engine ran n=1 (mad=0, p95=median), so the wall ordering rests on a single sample each.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | property-invariant:✓ (Δ0.0000s), mp4-box-layout:✓ | 138.21 | n/a | 321,776,006 | 19,963 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:✓ (Δ0.0214s), mp4-box-layout:✓ | 177.50 | n/a | 0 (not sampled) | 12,909 | cached previous PASS |
| mediabunny@1.48.0 | PASS | property-invariant:✓ (Δ0.0800s), mp4-box-layout:✓ | 326.49 | n/a | 0 (not sampled) | 4,531 | cached previous PASS |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fragmented' |

No engine reports `throughputRealtime` for this probe-duration/layout scenario; the bench block carries only wall / peakMemory / longtasks. peakMemory was only sampled for mp4box (n=1); ffmpeg-wasm and mediabunny have n=0 (empty samples), so their peakMemory of 0 is "not measured", not "zero".

## Why the winner wins (deep technical)

This scenario takes a progressive (faststart-style) H.264-in-MP4 source and asks each engine to **re-wrap it as a fragmented MP4** (moov init segment + repeating `moof`/`mdat` media fragments), then asserts two invariants: (1) the reference engine re-probes the produced bytes and the **reported duration must still equal the source's 30 s** within 0.125 s (`property-invariant` → `probeDurationInvariant`, oracles.ts:2709-2758), and (2) the top-level box order is a valid fragmented layout — `moov` present, at least one `moof`, and an `mdat` after that `moof`, with `moof` not preceding `moov` (`mp4-box-layout`, oracles.ts:392-402).

mp4box's remux is a **genuine pure-JS fragmenter**, not a copy. The path is `setSegmentOptions(trackId, …, { nbSamples: 1000, rapAlignement: true })` per track → `initializeSegmentation()` (one combined `ftyp`+`moov`-with-`mvex` init segment) → `start()`/`flush()` → `onSegment` collecting each media fragment, finally concatenated in arrival order (src/engines/mp4box/adapter.ts:913-944, especially the segment loop at 932-934 and the init+segment concat at 937-942). Because mp4box rebuilds the movie box from the parsed `mvhd`/`tkhd`/`mvex` timing and re-emits the original sample durations verbatim, the re-probed `fragment_duration` ratio reconstructs to **exactly 30.000 s → Δ 0.0000 s** (shard measurement `outDurationSec:30, deltaSec:0`). The probe side of mp4box (adapter.ts:413-425) explicitly falls back to `info.fragment_duration.num/den` for fragmented files whose `mvhd.duration` is 0, which is why a fragmented output round-trips its duration cleanly. The emitted layout in the shard — `ftyp@0, moov@32, moof@1312, mdat@15796, …` (8 top-level boxes, large ~1000-sample fragments) — satisfies `mp4-box-layout` directly: `moov` precedes the first `moof`, and an `mdat` follows it.

On the configUsed axis mp4box ran `backend: "pure-js"`, single-thread (`wasmThreads:0`, `worker:false`), pipeline `whole-file-append(MP4BoxBuffer+fileStart)`, `discardMdatDataDemuxRemux:false` (i.e. `createFile(true)` to keep `mdat` so samples survive fragmentation — see the keepMdatData note at adapter.ts:31-33, 709-710) and `segmentRapAlignement:true`. Since this is a structural re-wrap (no pixels, no decode), a box-walker with no codec round-trip is the cheapest possible implementation, which is why its wall is the lowest at 138.21 ms despite being pure JS. The downside surfaces in `longtasks: 19,963 ms` — the largest of the three — because all the fragmenting happens synchronously on the main thread (`file.flush()` drives the whole 31 MB file at once, adapter.ts:798/939), and peakMemory is the highest sampled at ~322 MB (keeping the whole `mdat` resident).

ffmpeg-wasm is the closest competitor on correctness (Δ 0.0214 s — its `-movflags +frag_keyframe`/empty-moov style fragmenter introduces ~one-frame of edit-list/duration rounding) and second on wall (177.50 ms, **1.28x slower** than mp4box), with finer fragments (33 top-level boxes, ~2 MB each). mediabunny is correct but loosest (Δ 0.0800 s) and slowest (326.49 ms, **2.36x slower**); it ran the real WebCodecs/streaming-lockstep pipeline (`backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `coopCoep:"not-required"`) and produced the most fragments (35 top-level boxes, ~2 MB each) — its higher duration delta reflects mediabunny re-deriving sample timing through its own muxer rather than copying the source mvhd ticks. Notably mediabunny has the **lowest longtasks (4,531 ms)** because its streaming pipeline yields to the event loop, so on a responsiveness metric it would win — but the ranked primaryMetric is wall, where mp4box leads.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** correct on both oracles but duration delta 0.0214 s (vs mp4box 0.0000 s) and wall 177.50 ms (1.28x slower than 138.21 ms). Loses on both correctness-strictness and wall. Single-sample (n=1) so the margin is weak evidence.
- **mediabunny@1.48.0 (PASS, lost):** correct on both oracles but loosest duration delta 0.0800 s and slowest wall 326.49 ms (2.36x slower). Real WebCodecs hardware path and best longtasks (4,531 ms), but wall is the ranked metric. n=1.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — Chrome's built-in stack (WebCodecs + inline demux) has no remux/mux operation declared; it cannot produce a fragmented container.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — web-demuxer is a demux-only (libav-based) reader; it has no muxer/fragmenter.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — media-parser is a read-only parser, no output path.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare feature 'fragmented'". Plausibly honest — remotion-webcodecs can remux but the runner gated it on the `fragmented` feature it does not declare. This is a feature-level NA rather than an operation NA; worth a periodic audit (does remotion-webcodecs actually support fMP4 output?), but as declared it is a clean NA.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/streaming-output/metamorphic.ts:91-107 (`id: 'prop_probe_dur_fragmented_shape'`, `invariant: 'probe-duration'`, `asset: 'h264_1080p_30s.mp4'`, `shape: { container:'mp4', fragmented:true }`, `tolerances.durationToleranceSec: 0.125`).
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — real H.264/AAC media, not synthetic/empty. Golden meta `fixtures/golden/h264_1080p_30s.mp4.meta.json` confirms durationSec 30, 1920x1080@30 h264 + aac 48k stereo.
- **Oracles:** `property-invariant` probe-duration branch at src/core/oracles.ts:2709-2758 — re-probes the produced bytes via `ctx.referenceEngine.probe(...)` and compares to the golden source duration with a real numeric tolerance (0.125 s here); not trivially satisfiable. `mp4-box-layout` at src/core/oracles.ts:365-402 parses real top-level boxes and enforces moov-present + moof-present + mdat-after-moof ordering. Shard measurements are physically plausible: durations ≈30 s, real box offsets (`moov@32, moof@1312, mdat@15796`), 8/33/35 top-level boxes consistent with ~1000-sample vs ~2 MB fragment granularity.
- **Winner adapter:** src/engines/mp4box/adapter.ts:913-944 — `remux` is a real mp4box.js fragmenter (`setSegmentOptions`/`initializeSegmentation`/`onSegment`/`start`/`flush`). It does NOT return canned output, copy input→output, or short-circuit to a golden; it keeps `mdat` (`createFile(true)`, adapter.ts:709-710) so samples are genuinely re-fragmented. The honesty note at adapter.ts:632-640 and the deliberate non-declaration of `remux:compose` (adapter.ts:672-676) indicate conservative, non-cheating capability declarations.
- **Cached note:** all three PASS results have `cached:true` ("cached previous PASS result"). The numbers were reused, not re-run this session — staleness risk exists but the layout/duration measurements are internally consistent with the real fixture, so this is a normal cache reuse, not fabricated evidence.
- **Verdict:** **REAL** — real 31 MB fixture, genuine pure-JS fragmenter implementation, two meaningful oracles (exact-duration round-trip + structural box-layout) with plausible measured numbers.

## Confidence & caveats

- **Confidence: high** for the REAL verdict and for the correctness ranking (mp4box Δ0.0000 < ffmpeg Δ0.0214 < mediabunny Δ0.0800 are exact shard values).
- **Caveats:** (1) The performance margin (1.28x over ffmpeg) rests on n=1 samples (mad=0, p95=median) — weak statistical evidence; a re-run could reorder mp4box vs ffmpeg on wall. (2) All three PASS results are cached. (3) On responsiveness, mp4box is actually the WORST (longtasks 19,963 ms, ~4.4x mediabunny's 4,531 ms) and has the highest sampled peakMemory (~322 MB) because it fragments the whole file synchronously on the main thread; if the ranked metric were longtasks or peakMemory, mediabunny would win. (4) peakMemory is only measured for mp4box; ffmpeg/mediabunny report n=0, so cross-engine memory comparison is not possible. (5) remotion-webcodecs' `fragmented`-feature NA is worth periodic re-audit.
