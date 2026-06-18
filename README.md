# Browser Media-Engine Benchmark

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Suite](https://img.shields.io/badge/suite-browser_media_benchmark-0f766e)](#browser-media-engine-benchmark)
[![Reference](https://img.shields.io/badge/reference-mediabunny_1.48.0-orange)](#latest-results)

Library-agnostic, browser-only media-engine conformance and benchmark suite. The product is the comparison: every engine is run against the same local media corpus, the same browser runtime, and the same correctness oracles before performance numbers are trusted.

The suite compares media engines across feature families such as probe, demux, remux, mux, metadata, encryption, decode/seek, transcode, audio DSP, and performance sweeps. Execution is feature-first: choose the feature or scenario, then compare the selected frameworks on that exact case.

## Latest Results

Source: [results/report.md](results/report.md) and [results/report.json](results/report.json). Generated `2026-06-18T17:40:53.441Z`, suite `0.1.0`, reference engine `mediabunny`, browsers `brave` and `chromium`, `339` scenarios, `8` engines.

All timing comparisons are made only inside a single browser against the same corpus. Raw timing numbers are not compared across browsers.

| # | Engine | Wins | Conf % | Robust % | Bundle | Breadth | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `mediabunny@1.48.0` | 30 (29 unc.) | 31.8% | 100% | 165.2 kB | 8 | 30 wins (1 contested, 29 uncontested); perf 0.99x vs winners |
| 2 | `remotion-webcodecs@4.0.479` | 7 (7 unc.) | 46.5% | - | 94 kB | 6 | 7 wins; perf 0.15x vs winners |
| 3 | `mp4box@2.3.0` | 4 (3 unc.) | 63.4% | - | 41.3 kB | 5 | 4 wins; perf 1x vs winners |
| 4 | `ffmpeg.wasm@0.12.15` | 2 | 75% | - | 1.4 kB | 1 | 2 wins; perf 0.74x vs winners |
| 5 | `web-demuxer@4.0.0` | 2 (2 unc.) | 37.1% | - | 43.2 kB | 4 | 2 wins; perf 0.22x vs winners |
| 6 | `remotion-media-parser@4.0.479` | 1 | 53.8% | - | 72.6 kB | 4 | 1 win; perf 0.06x vs winners |
| 7 | `platform@chrome-149` | 1 | 47.8% | - | - | 4 | 1 win; perf 0.95x vs winners |
| 8 | `aibrush-media@dev` | 0 | 0% | - | - | 0 | 0 wins |

Latest focused Brave verification: [results/raw/brave-2026-06-18T23-19-12-344Z.json](results/raw/brave-2026-06-18T23-19-12-344Z.json).

| Scenario | Engine | Status | Duration | Notes |
| --- | --- | --- | ---: | --- |
| `remux/flac_seektable_flac_to_ogg` | `mediabunny@1.48.0` | `NA_ENGINE` | 11 ms | Engine does not declare `remux:flac-in-ogg`. |
| `remux/prop_bframes_decode_remux_mp4_mkv` | `mediabunny@1.48.0` | `FAIL` | 1144 ms | Real property failure: `decode(remux(x)) == decode(x)` frame digests differ for 12/12 frames. |

For the full matrix, see [results/report.md](results/report.md). Machine-readable results live in [results/report.json](results/report.json) and [results/raw/](results/raw/).

## What It Tests

- Correctness first: probe, demux, remux, mux, metadata, encryption, decode/seek, transcode, and audio DSP scenarios are checked against local golden metadata, packet, frame, SSIM, and property oracles.
- Performance second: speed, throughput, memory, long tasks, source reads, target writes, output bytes, decode FPS, and encode FPS are measured only after correctness passes.
- Runtime capability honesty: unsupported engine, browser, codec, fixture, or asset cases become explicit `N/A` statuses instead of hidden failures.
- Local corpus discipline: scenarios run against media in `fixtures/media` and goldens in `fixtures/golden`, so inputs and expected outputs are inspectable in the repository.
- Browser realism: `scripts/run.sh` launches real browser runs and stores raw JSON under `results/raw`.

## Installation

This project uses Bun. In this workspace, use Bun/Bunx rather than npm/npx.

```bash
bun install
```

## Usage

Serve the interactive browser UI:

```bash
bun run serve
```

Then open:

```text
http://localhost:5173/index.html
```

Run the benchmark launcher in a real browser:

```bash
bun run run --browser brave --engine mediabunny --feature remux --warmup 1 --iters 1
```

Run one scenario:

```bash
bun run run --browser brave --engine mediabunny --scenario remux/prop_bframes_decode_remux_mp4_mkv --warmup 1 --iters 1
```

Generate the consolidated report:

```bash
bun run compare
```

Bake or refresh fixtures and goldens:

```bash
bun run bake
```

Check the TypeScript build:

```bash
bun run typecheck
bun run build
```

## Feature-First Flow

The default execution model is:

1. Choose one or more feature families, such as `probe`, `demux`, or `remux`.
2. Optionally narrow to specific scenarios.
3. Choose one or more engines.
4. Run correctness and performance on each selected scenario across those engines.

This keeps the table centered on media capabilities instead of making the framework column the primary workflow.

## Engines

Current registered engines include:

- `mediabunny@1.48.0`
- `platform@chrome-149`
- `ffmpeg.wasm@0.12.15`
- `mp4box@2.3.0`
- `remotion-media-parser@4.0.479`
- `remotion-webcodecs@4.0.479`
- `web-demuxer@4.0.0`
- `aibrush-media@dev`

Add a new engine with:

```bash
bun run add-engine
```

## Repository Layout

```text
src/app/        Browser UI, feature/scenario selection, result matrix
src/core/       Benchmark protocol, runner, oracles, registry, report generation
src/engines/    Engine adapters
src/scenarios/  Feature-family scenario definitions
fixtures/       Local media corpus, golden metadata, packets, frames, keys, segments
scripts/        Serve, run, compare, bake, and engine scaffolding scripts
results/        Consolidated reports and raw browser result JSON
```

## Status Meanings

| Status | Meaning |
| --- | --- |
| `PASS` | Correctness passed and timing/metrics were collected. |
| `FAIL` | The engine produced an output, but an oracle or property check failed. |
| `ERROR` | The engine threw an unexpected exception. |
| `NA_ENGINE` | The engine does not claim the required feature. |
| `NA_BROWSER` | The browser/runtime lacks a required capability. |
| `NA_ASSET` | The fixture, golden, or bake artifact required by the scenario is not available. |

## Contributing

We welcome contributions. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing expectations, engine-adapter guidance, and result-reporting rules.

## Security

To report a vulnerability, please see [SECURITY.md](SECURITY.md). Do not open a public issue for security-sensitive reports.

## License

MIT. See [LICENSE](LICENSE).
