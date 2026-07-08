# aibrush-media — aggregate leaderboard

Generated 2026-07-08T11:49:43.175Z · scope: **browser `chromium`** · 1612 cells · 7 engines · 13 families · 1 result file(s).

> Scored on the single browser the most engines share (`chromium`) so every engine is measured on the **identical** scenario set — apples-to-apples. Competitor engines are never re-run; each carries only the browser(s) of its last recorded run, so a pooled multi-browser score would unfairly average us over browsers they lack. Use `--browser all` to pool, `--browser <name>` to pick another.

**Scoring (matches the harness `isAdmissible`).** A cell is *admissible* iff `PASS | FAIL | ERROR` — `NA_*`/`SKIPPED` are honest capability-misses and are excluded, so declaring fewer features never inflates the score. **conformance% = PASS / admissible** is the win metric; **coverage% = admissible / total** shows breadth (a high conformance on a thin slice is exposed by a low coverage). Cells are the **freshest** observation per `(engine, browser, scenario)` across all loaded result files; competitor engines are **never re-run** — they retain their last recorded cells.

*File rotation (provenance only — does NOT affect scoring): 405 of 1612 scored cell(s) ran on a rotated **real** file (selection.isBaked === false); 1207 on baked/legacy fixtures.*

## Overall ranking

| # | Engine | conformance% | PASS | FAIL | ERROR | NA | coverage% | total |
|---|--------|-------------:|-----:|-----:|------:|---:|----------:|------:|
| 1 | `web-demuxer@4.0.0` | **97.1%** | 66 | 2 | 0 | 188 | 26.6% | 256 |
| 2 | `remotion-media-parser@4.0.479` | **91.4%** | 64 | 4 | 2 | 176 | 28.5% | 246 |
| 3 | `mediabunny@1.48.0` | **90.8%** | 157 | 15 | 1 | 48 | 78.3% | 221 |
| 4 | `ffmpeg.wasm@0.12.15` | **89.4%** | 161 | 13 | 6 | 43 | 80.7% | 223 |
| 5 | `mp4box@2.3.0` | **88.9%** | 32 | 3 | 1 | 188 | 16.1% | 224 |
| 6 | `aibrush-media@dev` ⭐ | **87.6%** | 163 | 16 | 7 | 19 | 90.7% | 205 |
| 7 | `remotion-webcodecs@4.0.479` | **85.8%** | 91 | 12 | 3 | 131 | 44.7% | 237 |

## Per-family conformance% (PASS / admissible)

| Engine | audio-dsp | decode-seek | demux | encryption | metadata | mux | performance | probe | remux | robustness | streaming-output | transcode | trim |
|--------|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `web-demuxer@4.0.0` | — (0/0) | 100.0% (17/17) | 80.0% (8/10) | — (0/0) | 100.0% (3/3) | — (0/0) | 100.0% (8/8) | 100.0% (15/15) | — (0/0) | 100.0% (15/15) | — (0/0) | — (0/0) | — (0/0) |
| `remotion-media-parser@4.0.479` | 100.0% (1/1) | — (0/0) | 69.2% (9/13) | — (0/0) | 100.0% (6/6) | — (0/0) | 90.9% (10/11) | 95.2% (20/21) | — (0/0) | 100.0% (18/18) | — (0/0) | — (0/0) | — (0/0) |
| `mediabunny@1.48.0` | 100.0% (4/4) | 100.0% (20/20) | 83.3% (10/12) | 83.3% (5/6) | 100.0% (6/6) | 100.0% (20/20) | 87.5% (7/8) | 72.2% (13/18) | 93.3% (14/15) | 90.0% (18/20) | 85.7% (6/7) | 88.9% (24/27) | 100.0% (10/10) |
| `ffmpeg.wasm@0.12.15` | 100.0% (6/6) | 87.5% (14/16) | 94.4% (17/18) | 100.0% (6/6) | 100.0% (8/8) | 66.7% (12/18) | 100.0% (11/11) | 100.0% (16/16) | 93.8% (15/16) | 100.0% (22/22) | 83.3% (5/6) | 77.8% (21/27) | 80.0% (8/10) |
| `mp4box@2.3.0` | — (0/0) | — (0/0) | 88.9% (8/9) | — (0/0) | 100.0% (2/2) | 100.0% (4/4) | 71.4% (5/7) | 88.9% (8/9) | 100.0% (1/1) | 100.0% (2/2) | 100.0% (2/2) | — (0/0) | — (0/0) |
| `aibrush-media@dev` ⭐ | 83.3% (5/6) | 83.3% (10/12) | 100.0% (23/23) | 75.0% (3/4) | 100.0% (8/8) | 94.4% (17/18) | 85.7% (6/7) | 83.3% (15/18) | 93.3% (14/15) | 100.0% (26/26) | 100.0% (9/9) | 53.6% (15/28) | 100.0% (12/12) |
| `remotion-webcodecs@4.0.479` | 100.0% (1/1) | 100.0% (14/14) | 71.4% (10/14) | — (0/0) | 100.0% (6/6) | — (0/0) | 66.7% (10/15) | 94.4% (17/18) | 0.0% (0/2) | 95.2% (20/21) | — (0/0) | 86.7% (13/15) | — (0/0) |

## `aibrush-media@dev` vs the best competitor — per family

For each family: our conformance%, the **best competitor** (any engine but ours) and theirs, and the delta (Δ = ours − theirs). A positive Δ is a win; coverage shown so a "win" on a thin slice is visible.

| Family | ours (conf% · cov%) | best competitor | theirs (conf% · cov%) | Δ conf% | verdict |
|--------|--------------------:|-----------------|----------------------:|--------:|---------|
| audio-dsp | 83.3% · 50.0% | `ffmpeg.wasm@0.12.15` | 100.0% · 46.2% | -16.7 | ❌ loss |
| decode-seek | 83.3% · 100.0% | `remotion-webcodecs@4.0.479` | 100.0% · 87.5% | -16.7 | ❌ loss |
| demux | 100.0% · 100.0% | `ffmpeg.wasm@0.12.15` | 94.4% · 100.0% | 5.6 | ✅ win |
| encryption | 75.0% · 100.0% | `ffmpeg.wasm@0.12.15` | 100.0% · 100.0% | -25.0 | ❌ loss |
| metadata | 100.0% · 66.7% | `remotion-webcodecs@4.0.479` | 100.0% · 66.7% | 0.0 | ➖ tie |
| mux | 94.4% · 81.8% | `mediabunny@1.48.0` | 100.0% · 74.1% | -5.6 | ❌ loss |
| performance | 85.7% · 100.0% | `ffmpeg.wasm@0.12.15` | 100.0% · 100.0% | -14.3 | ❌ loss |
| probe | 83.3% · 100.0% | `ffmpeg.wasm@0.12.15` | 100.0% · 100.0% | -16.7 | ❌ loss |
| remux | 93.3% · 93.8% | `mp4box@2.3.0` | 100.0% · 4.3% | -6.7 | ❌ loss |
| robustness | 100.0% · 100.0% | `ffmpeg.wasm@0.12.15` | 100.0% · 91.7% | 0.0 | ➖ tie |
| streaming-output | 100.0% · 100.0% | `mp4box@2.3.0` | 100.0% · 14.3% | 0.0 | ➖ tie |
| transcode | 53.6% · 90.3% | `mediabunny@1.48.0` | 88.9% · 81.8% | -35.3 | ❌ loss |
| trim | 100.0% · 92.3% | `mediabunny@1.48.0` | 100.0% · 71.4% | 0.0 | ➖ tie |

**Summary.** `aibrush-media@dev` ranks **#6 of 7** overall (conformance **87.6%**, coverage **90.7%**); per-family vs the best competitor: **1 win, 8 losses, 4 ties**.
