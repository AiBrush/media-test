# aibrush-media — aggregate leaderboard

Generated 2026-06-30T12:22:41.865Z · scope: **browser `chromium`** · 4470 cells · 8 engines · 13 families · 326 result file(s).

> Scored on the single browser the most engines share (`chromium`) so every engine is measured on the **identical** scenario set — apples-to-apples. Competitor engines are never re-run; each carries only the browser(s) of its last recorded run, so a pooled multi-browser score would unfairly average us over browsers they lack. Use `--browser all` to pool, `--browser <name>` to pick another.

**Scoring (matches the harness `isAdmissible`).** A cell is *admissible* iff `PASS | FAIL | ERROR` — `NA_*`/`SKIPPED` are honest capability-misses and are excluded, so declaring fewer features never inflates the score. **conformance% = PASS / admissible** is the win metric; **coverage% = admissible / total** shows breadth (a high conformance on a thin slice is exposed by a low coverage). Cells are the **freshest** observation per `(engine, browser, scenario)` across all loaded result files; competitor engines are **never re-run** — they retain their last recorded cells.

## Overall ranking

| # | Engine | conformance% | PASS | FAIL | ERROR | NA | coverage% | total |
|---|--------|-------------:|-----:|-----:|------:|---:|----------:|------:|
| 1 | `aibrush-media@dev` ⭐ | **100.0%** | 557 | 0 | 0 | 7 | 98.8% | 564 |
| 2 | `mediabunny@1.48.0` | **100.0%** | 510 | 0 | 0 | 48 | 91.4% | 558 |
| 3 | `remotion-webcodecs@4.0.479` | **100.0%** | 267 | 0 | 0 | 291 | 47.8% | 558 |
| 4 | `platform@chrome-149` | **100.0%** | 180 | 0 | 0 | 378 | 32.3% | 558 |
| 5 | `web-demuxer@4.0.0` | **100.0%** | 163 | 0 | 0 | 395 | 29.2% | 558 |
| 6 | `remotion-media-parser@4.0.479` | **100.0%** | 156 | 0 | 0 | 402 | 28.0% | 558 |
| 7 | `mp4box@2.3.0` | **100.0%** | 105 | 0 | 0 | 453 | 18.8% | 558 |
| 8 | `ffmpeg.wasm@0.12.15` | **99.8%** | 486 | 1 | 0 | 71 | 87.3% | 558 |

_Browser coverage across all loaded files (cells per browser; only the **chromium** column is scored above): `aibrush-media@dev`: brave=558, chromium=564, firefox=339, webkit=561; `mediabunny@1.48.0`: chromium=558, firefox=5, webkit=12; `mp4box@2.3.0`: firefox=5, webkit=12, chromium=558; `web-demuxer@4.0.0`: firefox=5, webkit=12, chromium=558; `ffmpeg.wasm@0.12.15`: firefox=5, webkit=12, chromium=558; `platform@firefox-151`: firefox=5; `remotion-webcodecs@4.0.479`: firefox=5, webkit=12, chromium=558; `remotion-media-parser@4.0.479`: firefox=5, webkit=12, chromium=558; `platform@safari-26`: webkit=13._

## Per-family conformance% (PASS / admissible)

| Engine | audio-dsp | decode-seek | demux | encryption | metadata | mux | performance | probe | remux | robustness | streaming-output | transcode | trim |
|--------|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `aibrush-media@dev` ⭐ | 100.0% (36/36) | 100.0% (46/46) | 100.0% (43/43) | 100.0% (13/13) | 100.0% (25/25) | 100.0% (52/52) | 100.0% (33/33) | 100.0% (51/51) | 100.0% (49/49) | 100.0% (60/60) | 100.0% (27/27) | 100.0% (80/80) | 100.0% (42/42) |
| `mediabunny@1.48.0` | 100.0% (27/27) | 100.0% (43/43) | 100.0% (39/39) | 100.0% (10/10) | 100.0% (23/23) | 100.0% (52/52) | 100.0% (32/32) | 100.0% (49/49) | 100.0% (48/48) | 100.0% (56/56) | 100.0% (27/27) | 100.0% (65/65) | 100.0% (39/39) |
| `remotion-webcodecs@4.0.479` | 100.0% (9/9) | 100.0% (40/40) | 100.0% (39/39) | — (0/0) | 100.0% (13/13) | — (0/0) | 100.0% (31/31) | 100.0% (47/47) | 100.0% (8/8) | 100.0% (42/42) | — (0/0) | 100.0% (38/38) | — (0/0) |
| `platform@chrome-149` | 100.0% (3/3) | 100.0% (42/42) | 100.0% (27/27) | — (0/0) | 100.0% (11/11) | — (0/0) | 100.0% (24/24) | 100.0% (40/40) | — (0/0) | 100.0% (28/28) | — (0/0) | 100.0% (5/5) | — (0/0) |
| `web-demuxer@4.0.0` | — (0/0) | 100.0% (40/40) | 100.0% (24/24) | — (0/0) | 100.0% (9/9) | — (0/0) | 100.0% (23/23) | 100.0% (37/37) | — (0/0) | 100.0% (30/30) | — (0/0) | — (0/0) | — (0/0) |
| `remotion-media-parser@4.0.479` | 100.0% (2/2) | — (0/0) | 100.0% (38/38) | — (0/0) | 100.0% (13/13) | — (0/0) | 100.0% (22/22) | 100.0% (47/47) | — (0/0) | 100.0% (34/34) | — (0/0) | — (0/0) | — (0/0) |
| `mp4box@2.3.0` | — (0/0) | — (0/0) | 100.0% (18/18) | — (0/0) | 100.0% (6/6) | 100.0% (9/9) | 100.0% (22/22) | 100.0% (23/23) | 100.0% (2/2) | 100.0% (22/22) | 100.0% (3/3) | — (0/0) | — (0/0) |
| `ffmpeg.wasm@0.12.15` | 100.0% (35/35) | 100.0% (39/39) | 100.0% (43/43) | 100.0% (12/12) | 100.0% (24/24) | 100.0% (48/48) | 100.0% (25/25) | 100.0% (51/51) | 100.0% (47/47) | 100.0% (55/55) | 100.0% (12/12) | 98.3% (57/58) | 100.0% (38/38) |

## `aibrush-media@dev` vs the best competitor — per family

For each family: our conformance%, the **best competitor** (any engine but ours) and theirs, and the delta (Δ = ours − theirs). A positive Δ is a win; coverage shown so a "win" on a thin slice is visible.

| Family | ours (conf% · cov%) | best competitor | theirs (conf% · cov%) | Δ conf% | verdict |
|--------|--------------------:|-----------------|----------------------:|--------:|---------|
| audio-dsp | 100.0% · 100.0% | `ffmpeg.wasm@0.12.15` | 100.0% · 97.2% | 0.0 | ➖ tie |
| decode-seek | 100.0% · 100.0% | `mediabunny@1.48.0` | 100.0% · 100.0% | 0.0 | ➖ tie |
| demux | 100.0% · 100.0% | `ffmpeg.wasm@0.12.15` | 100.0% · 100.0% | 0.0 | ➖ tie |
| encryption | 100.0% · 100.0% | `ffmpeg.wasm@0.12.15` | 100.0% · 92.3% | 0.0 | ➖ tie |
| metadata | 100.0% · 100.0% | `ffmpeg.wasm@0.12.15` | 100.0% · 96.0% | 0.0 | ➖ tie |
| mux | 100.0% · 100.0% | `mediabunny@1.48.0` | 100.0% · 100.0% | 0.0 | ➖ tie |
| performance | 100.0% · 100.0% | `mediabunny@1.48.0` | 100.0% · 97.0% | 0.0 | ➖ tie |
| probe | 100.0% · 100.0% | `ffmpeg.wasm@0.12.15` | 100.0% · 100.0% | 0.0 | ➖ tie |
| remux | 100.0% · 100.0% | `mediabunny@1.48.0` | 100.0% · 98.0% | 0.0 | ➖ tie |
| robustness | 100.0% · 95.2% | `mediabunny@1.48.0` | 100.0% · 93.3% | 0.0 | ➖ tie |
| streaming-output | 100.0% · 100.0% | `mediabunny@1.48.0` | 100.0% · 100.0% | 0.0 | ➖ tie |
| transcode | 100.0% · 95.2% | `mediabunny@1.48.0` | 100.0% · 77.4% | 0.0 | ➖ tie |
| trim | 100.0% · 100.0% | `mediabunny@1.48.0` | 100.0% · 92.9% | 0.0 | ➖ tie |

**Summary.** `aibrush-media@dev` ranks **#1 of 8** overall (conformance **100.0%**, coverage **98.8%**); per-family vs the best competitor: **0 wins, 0 losses, 13 ties**.

