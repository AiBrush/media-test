# Browser Media-Engine Comparison Report

Reference engine: `mediabunny` · Suite 0.1.0 · Generated 2026-06-18T06:50:56.369Z

Engines: `aibrush-media@dev`, `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `mp4box@2.3.0`, `platform@chrome-149`, `remotion-media-parser@4.0.479`, `remotion-webcodecs@4.0.479`, `web-demuxer@4.0.0` · Browsers: chromium · Scenarios: 4

All deltas are **within a single browser, vs the reference engine, on the same corpus.** Numbers are never compared across browsers (see Caveats).

## 🏆 Leaderboard

| # | Engine | Wins | Conf % | Robust % | Bundle | Breadth | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ffmpeg.wasm@0.12.15` | 2 | 75% | — | 1.4 kB | 1 | 2 wins · perf 0.74× vs winners · 75% conformant · 1.4 kB bundle |
| 2 | `mp4box@2.3.0` | 1 | 100% | — | 41.3 kB | 1 | 1 win · perf 0.25× vs winners · 100% conformant · 41.3 kB bundle |
| 3 | `remotion-media-parser@4.0.479` | 1 | 100% | — | 72.6 kB | 1 | 1 win · perf 0.06× vs winners · 100% conformant · 72.6 kB bundle |
| 4 | `remotion-webcodecs@4.0.479` | 1 (1 unc.) | 100% | — | 94 kB | 1 | 1 win (0 contested, 1 uncontested) · perf 0.15× vs winners · 100% conformant · 94 kB bundle |
| 5 | `web-demuxer@4.0.0` | 0 | 100% | — | 43.2 kB | 1 | 0 wins · perf 0.13× vs winners · 100% conformant · 43.2 kB bundle |
| 6 | `mediabunny@1.48.0` | 0 | 75% | — | 165.2 kB | 1 | 0 wins · perf 0.16× vs winners · 75% conformant · 165.2 kB bundle |
| 7 | `aibrush-media@dev` | 0 | 0% | — | — | 0 | 0 wins · 0% conformant |
| 8 | `platform@chrome-149` | 0 | 0% | — | — | 0 | 0 wins · 0% conformant |

_Wins = cases where the engine was the fastest CORRECT engine; co-winners of a tie both count, "unc." = uncontested (the only eligible engine). Win COUNTS are aggregated across browsers (counts are safe to sum; raw timing numbers are not — see Caveats). Ranked by wins, then conformance._

## 1. Conformance Summary

| Engine | chromium conf % |
| --- | --- |
| `aibrush-media@dev` | 0% |
| `ffmpeg.wasm@0.12.15` | 75% |
| `mediabunny@1.48.0` | 75% |
| `mp4box@2.3.0` | 100% |
| `platform@chrome-149` | 0% |
| `remotion-media-parser@4.0.479` | 100% |
| `remotion-webcodecs@4.0.479` | 100% |
| `web-demuxer@4.0.0` | 100% |

> **Cell legend:** `PASS` / `FAIL` / `ERROR` / `SKIPPED` are conformance outcomes. `-` = feature not supported by that engine (NA·engine — the feature still lives in the suite, only this cell is skipped). `-ᵇ` = supported by the engine but the browser lacks the codec/API (NA·browser). `—` = not run.

## Browser: chromium

### Winners — one per case (🏆 = fastest correct engine)

| Case | Winner | Value | Runner-up | Margin | Eligible | Flag |
| --- | --- | --- | --- | --- | --- | --- |
| `performance/bundle-size` | 🏆 `ffmpeg.wasm@0.12.15` | 1.4 kB | `mp4box@2.3.0` | +96.61% | 6 | contested |
| `performance/convert-webm-resize-320x180` | `remotion-webcodecs@4.0.479` (uncontested) | 385.21 fps | — | — | 1 | uncontested |
| `performance/extract-metadata` | 🏆 `remotion-media-parser@4.0.479` | 31.78 ops/s | `mediabunny@1.48.0` | +81.27% | 6 | contested |
| `performance/iterate-video-packets` | 🤝 `mp4box@2.3.0`, `ffmpeg.wasm@0.12.15` | 25341.75 packets/s | `ffmpeg.wasm@0.12.15` | +1.07% | 6 | tie |

### 2. Conformance matrix

| Scenario | aibrush-media@dev | ffmpeg.wasm@0.12.15 | mediabunny@1.48.0 | mp4box@2.3.0 | platform@chrome-149 | remotion-media-parser@4.0.479 | remotion-webcodecs@4.0.479 | web-demuxer@4.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `performance/bundle-size` | - | PASS | PASS | PASS | FAIL | PASS | PASS | PASS |
| `performance/convert-webm-resize-320x180` | - | ERROR | FAIL | - | - | - | PASS | - |
| `performance/extract-metadata` | - | PASS | PASS | PASS | - | PASS | PASS | PASS |
| `performance/iterate-video-packets` | - | PASS | PASS | PASS | - | PASS | PASS | PASS |

<details><summary>Reasons (FAIL / NA / ERROR)</summary>

- `aibrush-media@dev` · `performance/bundle-size` — **-**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/convert-webm-resize-320x180` — **-**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/extract-metadata` — **-**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/iterate-video-packets` — **-**: engine does not declare operation 'demux'
- `ffmpeg.wasm@0.12.15` · `performance/convert-webm-resize-320x180` — **ERROR**: RuntimeError: memory access out of bounds
- `mediabunny@1.48.0` · `performance/convert-webm-resize-320x180` — **FAIL**: oracle 'ssim-psnr' failed: vs in-browser reference (source decoded + downscaled to 320x180): SSIM mean 0.9691 (min 0.9659); PSNR mean 23.4 dB (advisory) over 8 frame(s); gate SSIM≥0.97
- `mp4box@2.3.0` · `performance/convert-webm-resize-320x180` — **-**: engine does not declare operation 'transcode'
- `platform@chrome-149` · `performance/bundle-size` — **FAIL**: oracle 'golden-metadata' failed: track count: measured 1 vs golden 2
- `platform@chrome-149` · `performance/convert-webm-resize-320x180` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `performance/extract-metadata` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `performance/iterate-video-packets` — **-**: engine does not declare audio codec 'aac'
- `remotion-media-parser@4.0.479` · `performance/convert-webm-resize-320x180` — **-**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/convert-webm-resize-320x180` — **-**: engine does not declare operation 'transcode'

</details>

### 3. Benchmark matrix

_Indicative for this browser only. Cells without a green conformance gate are blank (—)._

**`aibrush-media@dev`**

_No admissible benchmarks (no green conformance gate)._

**`ffmpeg.wasm@0.12.15`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/extract-metadata` | 41.2 | 41.2 | — | — | — |
| `performance/iterate-video-packets` | 98.9 | 98.9 | — | — | — |

**`mediabunny@1.48.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/extract-metadata` | 80.5 | 80.5 | — | — | — |
| `performance/iterate-video-packets` | 102.8 | 102.8 | — | — | — |

**`mp4box@2.3.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/extract-metadata` | 82.1 | 82.1 | — | — | — |
| `performance/iterate-video-packets` | 88.8 | 88.8 | — | — | — |

**`platform@chrome-149`**

_No admissible benchmarks (no green conformance gate)._

**`remotion-media-parser@4.0.479`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/extract-metadata` | 33.2 | 33.2 | — | — | — |
| `performance/iterate-video-packets` | 6893.6 | 6893.6 | — | — | — |

**`remotion-webcodecs@4.0.479`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | 2325.1 | 2325.1 | — | — | — |
| `performance/extract-metadata` | 45.8 | 45.8 | — | — | — |
| `performance/iterate-video-packets` | 917.6 | 917.6 | — | — | — |

**`web-demuxer@4.0.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/extract-metadata` | 68.6 | 68.6 | — | — | — |
| `performance/iterate-video-packets` | 555.2 | 555.2 | — | — | — |


### 4. Δ vs reference (`mediabunny`)

| Scenario | aibrush-media@dev perf | aibrush-media@dev conf | ffmpeg.wasm@0.12.15 perf | ffmpeg.wasm@0.12.15 conf | mediabunny@1.48.0 perf | mediabunny@1.48.0 conf | mp4box@2.3.0 perf | mp4box@2.3.0 conf | platform@chrome-149 perf | platform@chrome-149 conf | remotion-media-parser@4.0.479 perf | remotion-media-parser@4.0.479 conf | remotion-webcodecs@4.0.479 perf | remotion-webcodecs@4.0.479 conf | web-demuxer@4.0.0 perf | web-demuxer@4.0.0 conf |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `performance/bundle-size` | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA |
| `performance/convert-webm-resize-320x180` | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA |
| `performance/extract-metadata` | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA |
| `performance/iterate-video-packets` | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA | NA |

## 5. Per-engine scorecard

| Engine | Conformance % | PASS / admissible | Perf idx (chromium) | Capability breadth | Robustness % |
| --- | --- | --- | --- | --- | --- |
| `aibrush-media@dev` | 0% | 0 / 0 | — | 0 (—) | — |
| `ffmpeg.wasm@0.12.15` | 75% | 3 / 4 | — | 1 (performance) | — |
| `mediabunny@1.48.0` | 75% | 3 / 4 | — | 1 (performance) | — |
| `mp4box@2.3.0` | 100% | 3 / 3 | — | 1 (performance) | — |
| `platform@chrome-149` | 0% | 0 / 1 | — | 0 (—) | — |
| `remotion-media-parser@4.0.479` | 100% | 3 / 3 | — | 1 (performance) | — |
| `remotion-webcodecs@4.0.479` | 100% | 4 / 4 | — | 1 (performance) | — |
| `web-demuxer@4.0.0` | 100% | 3 / 3 | — | 1 (performance) | — |

_Perf index = geometric mean of throughput ratios vs reference, per browser, over co-passing scenarios. >1.00× = faster than reference on average; null/— = no co-passing scenario to compare._

## Caveats (read before quoting any number)

- Browser numbers are INDICATIVE only. They depend on GPU, OS, drivers, and thermal state; a measurement made on one machine does not transfer to another.
- NEVER compare a raw number across browsers or across machines. Every delta in this report is "vs the reference engine, on the SAME browser, on the same corpus." Cross-browser comparison is invalid by construction — that is why the report is grouped by browser.
- Hardware codec sessions are the real parallelism ceiling, not navigator.hardwareConcurrency. Contention for a limited number of hardware decode/encode sessions can dominate timing for codec-bound workloads.
- No measurement → no claim. No green correctness oracle → no admissible benchmark: a perf number is reported only behind a PASS for that engine × browser × scenario. A speedup that fails conformance is a regression, not a win.
- NA(engine) (the engine did not declare the capability) and NA(browser) (the browser lacks the WebCodecs codec / API) are kept distinct and are never collapsed.
- Runs assume AC power and a quiesced machine. Differences within the noise band are reported as within-noise and are NOT claimed as improvements or regressions.
