# Performance

> Scope: This page owns the performance-family scenarios, their measurement contracts, and the correctness conditions under which a number may be ranked; general runner, oracle, aggregation, and adapter mechanics belong to their subsystem pages.
> Phase-2 owner: p2_feature_performance.

## Purpose

The performance family asks how quickly and economically each scored [engine](../glossary.md#engine) completes representative browser-media work after a correctness [oracle](../glossary.md#oracle) has established that the result is admissible. It covers metadata and packet throughput, remux and transcode throughput, decode/encode/seek latency, bundle cost, scale behavior, memory, main-thread blocking, and metamorphic timing checks.

This page is the contract for benchmark authors, adapter maintainers, and report consumers. It does not redefine the general [scenario](../glossary.md#scenario), [capability gate](../glossary.md#capability-gate), oracle, or reporting models; those are specified in [scenario DSL and registry](../subsystems/scenario-dsl-registry.md), [runner and capability negotiation](../subsystems/runner-capability-negotiation.md), [oracle system](../subsystems/oracle-system.md), and [reporting and aggregation](../subsystems/reporting-aggregation.md).

## As-built

### Registration and execution path

`performanceScenarios` concatenates four headline scenarios with the operation-sweep, decode/encode/seek, size-ladder, resource, and metamorphic arrays. That array is registered as the `performance` family in the global battery, whose duplicate-id check runs at module load. [src/scenarios/performance/index.ts:47-54](../../src/scenarios/performance/index.ts#L47-L54) [src/scenarios/performance/index.ts:252-264](../../src/scenarios/performance/index.ts#L252-L264) [src/scenarios/index.ts:18-50](../../src/scenarios/index.ts#L18-L50) [src/scenarios/index.ts:57-71](../../src/scenarios/index.ts#L57-L71)

The named `performance` pillar is broader than this family: it selects every non-robustness scenario and enables benchmarking after the functional run. Callers must also filter by feature when they want only the 33 scenarios inventoried below. [src/core/runner.ts:631-652](../../src/core/runner.ts#L631-L652) [src/core/runner.ts:1746-1766](../../src/core/runner.ts#L1746-L1766)

For one [cell](../glossary.md#cell), the runner checks assets and declared/runtime support, initializes the engine outside the measured window, executes the operation, and runs all declared oracles. A real oracle failure produces [`FAIL`](../glossary.md#fail); an all-[golden](../glossary.md#golden)-gap outcome produces [`NA_ASSET`](../glossary.md#na_asset); only a surviving [`PASS`](../glossary.md#pass) enters the benchmark step. A runtime [`NotApplicableError`](../glossary.md#notapplicableerror) becomes [`NA_ENGINE`](../glossary.md#na_engine), while an unclassified exception becomes [`ERROR`](../glossary.md#error). [src/core/runner.ts:1310-1367](../../src/core/runner.ts#L1310-L1367) [src/core/runner.ts:1382-1468](../../src/core/runner.ts#L1382-L1468)

### Headline metrics

The four headline rows are:

| Scenario id | Work and primary metric | Correctness gate |
| --- | --- | --- |
| `performance/extract-metadata` | Probe `h264_1080p_30s.mp4`; `opsPerSec` | `golden-metadata` |
| `performance/iterate-video-packets` | Demux the same asset; `packetsPerSec` | `golden-packets` |
| `performance/convert-webm-resize-320x180` | H.264/AAC MP4 to VP9/Opus WebM at 320×180; `framesPerSec` | `ssim-psnr`, with SSIM 0.97 and PSNR 36 dB declared |
| `performance/bundle-size` | Probe a tiny valid MP4 as the functional gate; offline minified+gzipped JavaScript kB is the intended `bundleSize` score | `golden-metadata` |

The first three declarations, inputs, capabilities, metrics, and tolerances are in the headline module. [src/scenarios/performance/index.ts:78-164](../../src/scenarios/performance/index.ts#L78-L164) The bundle row is declared as an ordinary probe scenario even though its score is build-time evidence. [src/scenarios/performance/index.ts:218-248](../../src/scenarios/performance/index.ts#L218-L248)

The headline and sweep input is the committed 31,258,790-byte, 30-second H.264/AAC MP4, not a separate “big read” fixture. [src/scenarios/performance/_shared.ts:63-86](../../src/scenarios/performance/_shared.ts#L63-L86) [fixtures/manifest.json:6-18](../../fixtures/manifest.json#L6-L18)

### Operation sweep

The operation sweep registers exactly these four rows:

| Scenario id | Operation and primary metric | Gate |
| --- | --- | --- |
| `performance/op-sweep-probe` | Probe; `opsPerSec` | `golden-metadata` |
| `performance/op-sweep-demux` | Demux; `packetsPerSec` | `golden-packets` |
| `performance/op-sweep-remux-mp4-to-mkv` | MP4 to Matroska; `throughputRealtime` | semantic `reference-reimport` plus `playback-smoke` |
| `performance/op-sweep-transcode-webm` | MP4 to 320×180 VP9/Opus WebM; `encodeFps` | `ssim-psnr`, output-metadata property, and playback |

The probe and demux sweep rows use the same input, primary metrics, and gates as the corresponding headline rows; their distinct ids do not currently express a distinct measurement protocol. [src/scenarios/performance/op-sweep.ts:43-72](../../src/scenarios/performance/op-sweep.ts#L43-L72) The remux and transcode declarations carry their own output contracts and oracles. [src/scenarios/performance/op-sweep.ts:74-118](../../src/scenarios/performance/op-sweep.ts#L74-L118)

Despite a stale note that describes packet-count/keyframe checking, remux `reference-reimport` currently routes to a semantic output-structure check: it re-reads the candidate output, compares media track layout and canonical codec tokens when confident, and uses a duration band of at least 100 ms. [src/core/oracles.ts:1301-1325](../../src/core/oracles.ts#L1301-L1325) [src/core/oracles.ts:1328-1393](../../src/core/oracles.ts#L1328-L1393)

### Decode, encode, and seek

The bounded decode row `performance/decode-fps` decodes at most 12 frames and ranks `decodeFps`, gated by the strict decoded-frame golden. `performance/encode-fps` transcodes at source resolution to VP9/Opus WebM and ranks `encodeFps`, gated by SSIM and playback. `performance/seek-ms` seeks to 14 seconds and ranks `seekMs`, with a 50 ms accuracy tolerance. [src/scenarios/performance/decode-encode-seek.ts:43-60](../../src/scenarios/performance/decode-encode-seek.ts#L43-L60) [src/scenarios/performance/decode-encode-seek.ts:62-93](../../src/scenarios/performance/decode-encode-seek.ts#L62-L93) [src/scenarios/performance/decode-encode-seek.ts:95-116](../../src/scenarios/performance/decode-encode-seek.ts#L95-L116)

### Resource and size ladders

The size ladder creates 15 scenarios from code-generated ids:

- Six probe rows — `performance/size-ladder-extract-metadata-tiny`, `performance/size-ladder-extract-metadata-medium`, `performance/size-ladder-extract-metadata-large4k`, `performance/size-ladder-extract-metadata-large`, `performance/size-ladder-extract-metadata-huge`, and `performance/size-ladder-extract-metadata-massive` — rank `opsPerSec` and use `golden-metadata`. [src/scenarios/performance/size-ladder.ts:48-83](../../src/scenarios/performance/size-ladder.ts#L48-L83)
- Six demux rows — `performance/size-ladder-iterate-packets-tiny`, `performance/size-ladder-iterate-packets-medium`, `performance/size-ladder-iterate-packets-large4k`, `performance/size-ladder-iterate-packets-large`, `performance/size-ladder-iterate-packets-huge`, and `performance/size-ladder-iterate-packets-massive` — rank `packetsPerSec` and use `golden-packets`. [src/scenarios/performance/size-ladder.ts:85-100](../../src/scenarios/performance/size-ladder.ts#L85-L100)
- Three demux rows — `performance/size-ladder-demux-peak-memory-large4k`, `performance/size-ladder-demux-peak-memory-large`, and `performance/size-ladder-demux-peak-memory-huge` — rank `peakMemory` while also collecting packet rate and wall time. [src/scenarios/performance/size-ladder.ts:102-124](../../src/scenarios/performance/size-ladder.ts#L102-L124)

The standalone resource rows reuse the 320×180 transcode: `performance/convert-peak-memory` ranks `peakMemory`, and `performance/convert-longtasks` ranks accumulated `longtasks`; both are gated by SSIM and playback. [src/scenarios/performance/resource.ts:42-76](../../src/scenarios/performance/resource.ts#L42-L76)

The ladder source still marks the `large`, `huge`, and `massive` rungs as unbaked and emits that claim into scenario notes. [src/scenarios/performance/size-ladder.ts:40-61](../../src/scenarios/performance/size-ladder.ts#L40-L61) That annotation is stale: the manifest contains resolved hashes and sizes for all three assets, and matching metadata goldens are committed. [fixtures/manifest.json:600-612](../../fixtures/manifest.json#L600-L612) [fixtures/manifest.json:630-642](../../fixtures/manifest.json#L630-L642) [fixtures/manifest.json:692-704](../../fixtures/manifest.json#L692-L704) [fixtures/golden/large_h264_1080p_120s.mp4.meta.json:1-12](../../fixtures/golden/large_h264_1080p_120s.mp4.meta.json#L1-L12) [fixtures/golden/huge_h264_1080p_600s.mov.meta.json:1-12](../../fixtures/golden/huge_h264_1080p_600s.mov.meta.json#L1-L12) [fixtures/golden/massive_h264_1080p_2h.mp4.meta.json:1-12](../../fixtures/golden/massive_h264_1080p_2h.mp4.meta.json#L1-L12)

### Metamorphic checks

Five scenarios time a transformation while asserting a relationship rather than only a fixed representation:

| Scenario id | Relation and primary metric |
| --- | --- |
| `performance/metamorphic-transcode-idempotent-source-res` | Source-resolution transcode remains visually faithful; `framesPerSec` |
| `performance/metamorphic-probe-duration-cross-container` | Duration survives MP4-to-WebM remux; `throughputRealtime` |
| `performance/metamorphic-decode-remux` | MP4-to-Matroska remux remains structurally/decode compatible; `throughputRealtime` |
| `performance/metamorphic-vfr-iterate-packets` | Demux observes the irregular VFR packet table; `packetsPerSec` |
| `performance/metamorphic-vfr-probe-duration` | Probe reports the VFR source duration with a 0.1 fps tolerance; `opsPerSec` |

Their declarations and gates are grouped in the metamorphic module. [src/scenarios/performance/metamorphic.ts:43-119](../../src/scenarios/performance/metamorphic.ts#L43-L119) [src/scenarios/performance/metamorphic.ts:121-159](../../src/scenarios/performance/metamorphic.ts#L121-L159)

### Measurement and ranking

One warmup and one measured iteration are the library defaults and the UI-selected defaults. Each measured iteration rebuilds the media inputs, times one complete operation, and reuses that sample for every requested metric. [src/core/bench.ts:16-25](../../src/core/bench.ts#L16-L25) [src/app/main.ts:319-321](../../src/app/main.ts#L319-L321) [src/core/runner.ts:1628-1708](../../src/core/runner.ts#L1628-L1708)

`Meter` uses `performance.now()` where present, calculates rates from wall time and supplied counters, observes long tasks only for a row that requests them, and probes memory after the timed operation. The sample calls the latter value `peakMemoryBytes`, but the implementation takes one end-of-operation reading rather than sampling a peak. [src/core/measure.ts:33-103](../../src/core/measure.ts#L33-L103) [src/core/measure.ts:150-157](../../src/core/measure.ts#L150-L157) [src/core/measure.ts:169-233](../../src/core/measure.ts#L169-L233)

Probe count is always one, demux and decode numerators come from observed packets/frames, and seek count is one. For any bytes-producing operation without a `FrameSink`, however, `framesPerSec` and `encodeFps` use `round(golden fps × golden duration)` rather than an observed encoder-frame count. [src/core/runner.ts:1661-1691](../../src/core/runner.ts#L1661-L1691) [src/core/runner.ts:1713-1723](../../src/core/runner.ts#L1713-L1723)

Missing and non-finite metric values are removed before summarization. An empty set still becomes a `BenchSummary` with `n: 0`, `median: 0`, `p95: 0`, and `mad: 0`. [src/core/bench.ts:91-150](../../src/core/bench.ts#L91-L150) Reporting admits any finite median from a `PASS` cell and does not require `n > 0`, so that synthetic zero can be displayed or ranked. [src/core/report.ts:573-593](../../src/core/report.ts#L573-L593) [src/core/report.ts:628-678](../../src/core/report.ts#L628-L678)

The offline bundle producer bundles, tree-shakes, minifies, and gzips the imported JavaScript surface but intentionally excludes separately loaded WASM and worker assets. [scripts/measure-bundles.mjs:1-21](../../scripts/measure-bundles.mjs#L1-L21) Live browser results do not inject that map and retain the empty `n: 0` summary; `scripts/compare.mjs` later overwrites only `PASS` bundle cells from `results/bundle-sizes.json`. [scripts/compare.mjs:99-110](../../scripts/compare.mjs#L99-L110) [scripts/compare.mjs:135-189](../../scripts/compare.mjs#L135-L189)

### Neutral reference decode

For transform scenarios without a committed frame golden, `ssim-psnr` decodes both the candidate output and the source with the platform helper, takes up to eight frames, downscales source pixels to the candidate dimensions, and gates on mean SSIM. Candidate and source frames are paired by array index. [src/core/oracles.ts:1758-1809](../../src/core/oracles.ts#L1758-L1809) [src/core/oracles.ts:1905-1995](../../src/core/oracles.ts#L1905-L1995)

This source reference is neutral by construction: the platform helper is registered as an instrument-only implementation and excluded from scored engines. [src/engines/platform/adapter.ts:522-527](../../src/engines/platform/adapter.ts#L522-L527) [src/core/registry.ts:63-69](../../src/core/registry.ts#L63-L69) Its output path tries an inline container reader plus [WebCodecs](../glossary.md#webcodecs), then a DOM video-element fallback where available. [src/engines/platform/oracle-helpers.ts:108-165](../../src/engines/platform/oracle-helpers.ts#L108-L165) The WebCodecs path checks the exact decoder configuration, retains presentation timestamps, sorts frames by timestamp, and closes every retained `VideoFrame` after rasterization. [src/engines/platform/decode.ts:89-160](../../src/engines/platform/decode.ts#L89-L160) [src/engines/platform/decode.ts:165-223](../../src/engines/platform/decode.ts#L165-L223) [src/engines/platform/decode.ts:239-247](../../src/engines/platform/decode.ts#L239-L247)

## Contracts and invariants

- **Registered inventory.** The family exports 33 stable scenario ids: 4 headline, 4 operation-sweep, 3 decode/encode/seek, 15 ladder, 2 standalone resource, and 5 metamorphic rows. The family export is the single registration source. [src/scenarios/performance/index.ts:252-264](../../src/scenarios/performance/index.ts#L252-L264)
- **Declared primary metric.** The shared performance builder inserts the primary metric into `metrics` when absent and writes the same id to `primaryMetric`; all non-headline helpers use it. [src/scenarios/performance/_shared.ts:123-153](../../src/scenarios/performance/_shared.ts#L123-L153)
- **Direction and unit.** Throughput, decode/encode fps, operations, packets, and frames are higher-is-better. Wall, seek latency, memory, I/O counts, long-task time, output bytes, initialization, and bundle size are lower-is-better; the canonical units are fixed in the benchmark module. [src/core/bench.ts:30-89](../../src/core/bench.ts#L30-L89)
- **Correctness before speed.** In the current binary model, every non-golden-gap oracle must pass before any benchmark executes. A failed oracle has no admissible performance number; a benchmark timeout after correctness returns `PASS` without a number. [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463)
- **Initialization boundary.** `engine.init()` is excluded from operation timing. The result model reserves a separate `loadInit` sample, but the performance-family scenarios do not request it. [src/core/runner.ts:1358-1367](../../src/core/runner.ts#L1358-L1367) [src/core/scenario.ts:224-245](../../src/core/scenario.ts#L224-L245)
- **Fresh measured input.** Each warmup or measured operation constructs fresh `MediaInput` objects; one operation sample then feeds all metrics so large inputs are not reprocessed once per metric. [src/core/runner.ts:1628-1708](../../src/core/runner.ts#L1628-L1708)
- **Status routing.** Asset absence is `NA_ASSET`; declared/runtime browser gaps are `NA_BROWSER`; a recognized runtime `NotApplicableError` is `NA_ENGINE`; a functional timeout is `FAIL`; other exceptions are `ERROR`. [src/core/runner.ts:1310-1356](../../src/core/runner.ts#L1310-L1356) [src/core/runner.ts:1382-1468](../../src/core/runner.ts#L1382-L1468)
- **Browser-local claims.** The report declares browser numbers indicative and forbids raw cross-browser or cross-machine comparison; it also records a 3% winner noise band. [src/core/report.ts:283-294](../../src/core/report.ts#L283-L294)
- **Coverage-first exhaustive aggregation.** Passing-file rates use the median, memory uses the maximum, and additive costs use the sum. Ranking prefers greater passing-file coverage before speed, but the top-level current exhaustive result still becomes `FAIL` when any file fails. [src/core/bench.ts:194-227](../../src/core/bench.ts#L194-L227) [src/core/scenario.ts:294-313](../../src/core/scenario.ts#L294-L313) [src/core/report.ts:609-620](../../src/core/report.ts#L609-L620)
- **Manual skips are distinct from applicability.** Remotion's large and huge packet/memory rows currently have explicit disabled-cell entries, so they become [`SKIPPED`](../glossary.md#skipped) rather than an observed `NA_ENGINE` or timeout. [src/core/disabled-cells.ts:68-87](../../src/core/disabled-cells.ts#L68-L87) [src/core/disabled-cells.ts:143-171](../../src/core/disabled-cells.ts#L143-L171)

## Target design and known gaps

### Target design

#### Correctness-qualified performance

Performance eligibility must be based on semantic validity, not byte-level resemblance to one baker. Replace the boolean oracle outcome with the three-way `PASS` / [`DIFF`](../glossary.md#diff) / `FAIL` model: `PASS` and `DIFF` may carry benchmark samples, but the report must visibly preserve `DIFF`; `FAIL` must suppress ranking. A [representation difference](../glossary.md#representation-difference) can be `DIFF`, while invalid, lost, corrupt, or out-of-tolerance media remains `FAIL`. This is a corroborating requirement of the [oracle-system target](../subsystems/oracle-system.md).

For rows gated by `golden-metadata`, target comparison must canonicalize `avc1`/`avc3` to H.264, `hev1`/`hvc1` to HEVC, `V_MPEG4/ISO/AVC` to H.264, and `mp4a` to AAC; match tracks by media type rather than array index; accept documented HE-AAC/SBR core-rate versus reconstructed 2× rate and Parametric Stereo mono-core versus stereo-output views; band [VFR](../glossary.md#vfr) and [NTSC rate](../glossary.md#ntsc-rate) observations; and widen duration for [edit list](../glossary.md#edit-list), [priming](../glossary.md#priming), and [timebase](../glossary.md#timebase) effects. ISO BMFF edit lists explicitly map media time to the presentation timeline, so presentation duration need not equal a raw sample span ([W3C ISO BMFF byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#iso-bmff-byte-stream-format)). Acceptance requires fixtures for reordered tracks, all named codec aliases, HE-AAC/SBR, Parametric Stereo, 30000/1001 and 24000/1001 rates, VFR, edit-list offsets, and AAC priming; semantically equal observations must never become `FAIL`.

For rows gated by `golden-packets`, exact packet size, keyframe placement, and one-to-one packet grouping must be diagnostics rather than universal semantic requirements. Annex B can carry start-code-delimited parameter sets in band, whereas AVC sample entries can carry decoder configuration out of band; the ISO BMFF byte-stream rules explicitly permit both in-band and out-of-band parameter-set carriage ([W3C ISO BMFF byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#iso-bmff-byte-stream-format)). Acceptance requires the same coded access units expressed as Annex B and length-prefixed AVC, with inline versus out-of-band SPS/PPS and legal NAL grouping: preserved decode/timestamps/content must be `PASS` or `DIFF`, not `FAIL`.

#### Reference-frame applicability and pairing

Keep the neutral in-browser source decode: it avoids making any scored framework the judge of another. Pair candidate and reference frames by presentation time, not array index. WebCodecs timestamps are microseconds and are propagated through encoded chunks and frames ([WebCodecs specification](https://www.w3.org/TR/webcodecs/#encodedvideochunk-interface)); the target matcher should use monotonic one-to-one nearest-time or overlapping-presentation-window matching, a cadence-derived tolerance, and explicit unmatched-frame/time coverage. Acceptance requires 30→24 fps conversion, dropped/duplicated frames, VFR input, and 30000/1001 input tests where aligned content passes and shifted/wrong content fails.

Separate candidate validity from reference-path applicability. If structural re-import and playback prove an output valid but the browser's neutral decoder does not support its exact configuration, the SSIM measurement is `NA_BROWSER` and the cell is not ranked on SSIM; it is not a candidate `FAIL`. `VideoDecoder.isConfigSupported()` is defined for an exact candidate configuration, not an engine-wide codec promise ([WebCodecs specification](https://www.w3.org/TR/webcodecs/#dom-videodecoder-isconfigsupported)). True undecodability through both the required playback/structure checks remains `FAIL`.

Reference implementations and adapters must close every `VideoFrame` once no longer needed; the WebCodecs resource-management model makes `close()` release the underlying media resource ([WebCodecs specification](https://www.w3.org/TR/webcodecs/#dom-videoframe-close)). Acceptance includes a repeated-decode leak check whose retained frame/resource count returns to baseline.

#### Metric validity and applicability

Correctness status and measurement availability must remain separate. For a scenario's primary metric:

| Condition | Target outcome | Ranking |
| --- | --- | --- |
| Valid result and required finite samples | `PASS` or `DIFF` plus a populated summary | Eligible within the same browser, corpus, and protocol |
| Truly wrong result | `FAIL` | No benchmark number |
| Required browser API/configuration absent | `NA_BROWSER` for the benchmark measurement | No number |
| Engine cannot expose the required operation/counter for the concrete tuple | `NA_ENGINE`, normally via `NotApplicableError` | No number |
| Required golden, source media, or offline measurement artifact absent | `NA_ASSET` | No number |
| Producer promised a metric but emitted no finite sample, or the harness violated the protocol | `ERROR` with the missing field and iteration | No number |

Secondary metric applicability should be recorded per metric without erasing a valid primary measurement. No `n: 0` summary may carry a numeric median, appear in a winner calculation, or render as 0. Acceptance requires a deliberately unsupported memory API, unsupported long-task entry type, absent bundle map, and injected non-finite counter; each must take the target route above.

The per-token capability gate remains a preflight optimization, not proof of [combinatorial support](../glossary.md#combinatorial-support). An [adapter](../glossary.md#adapter) that discovers a concrete unsupported operation × input × codec × output × option tuple must throw `NotApplicableError`; the runner must preserve it as `NA_ENGINE`. This should replace manual disabled cells where the limitation is genuine applicability, while documented performance budgets remain explicit scale limits rather than masquerading as capability absence.

#### Reproducible timing protocol

Use `performance.now()` for operation timing because the Performance API's monotonic clock is not subject to wall-clock adjustment, while recording timer resolution because user agents may coarsen it ([High Resolution Time Level 3](https://www.w3.org/TR/hr-time-3/#sec-monotonic-clock)). Fast rows should adapt their inner iteration count until a configurable minimum measured duration is reached and then collect at least five independent repetitions; a single operation already exceeding that duration may use at least three repetitions or be labeled exploratory. The Google Benchmark guidance similarly uses adaptive iteration, minimum run time, warmup, repetitions, and randomized interleaving to reduce state-order bias ([Google Benchmark user guide](https://google.github.io/benchmark/user_guide.html#runtime-and-reporting-considerations)).

Record every raw sample, warmup count, measured count, random/interleave seed, browser build, OS, CPU/GPU, engine and suite versions, corpus hash, worker mode, power state, and declared thermal/quiescence conditions. Compare engines only within one browser build and machine, randomize or interleave engine order, and report median, p95, MAD, and confidence/instability labels only when sample counts support them. Cold initialization/download/compile time must remain a separately named `loadInit` protocol, never silently included in or excluded from steady-state operation time.

#### Honest numerators and media timelines

Each rate must divide observed work by the exact measured window. Engines should expose actual encoded-frame/chunk counts or the neutral output reader should count presentation units; `fps × duration` must not manufacture the numerator. For VFR, use actual presentation timestamps and frame intervals. For NTSC-derived CFR, preserve rational values such as 30000/1001 rather than rounding to 30; FFmpeg's official rate vocabulary identifies 30000/1001 and 24000/1001 as the NTSC and NTSC-film rates ([ffprobe documentation](https://ffmpeg.org/ffprobe-all.html#Video-rate)).

`throughputRealtime` must use presentation duration after edit lists/priming policy, and the report must state whether the denominator is source presentation duration, output presentation duration, or processed interval. Seek latency must define cache state and target type. First-byte/first-frame metrics must be emitted by the operation at the event, not inferred at completion. Source-read claims must wire a counting/random-access source through the adapter boundary; Mediabunny's official source model distinguishes whole-buffer input from lazy/random-access sources, so counting reads is meaningful only when the benchmark actually uses that source interface ([Mediabunny media sources](https://mediabunny.dev/guide/reading-media-files)).

#### Resource and bundle protocols

Rename the present endpoint reading to `memoryAfterOperation` unless a real peak protocol is implemented. A peak protocol must take a baseline, sample during the operation and a defined settle window, report both maximum and delta, identify the API, and never mix `measureUserAgentSpecificMemory()` with `performance.memory` in one ranking. The former is an experimental whole-context estimate with security requirements ([MDN `measureUserAgentSpecificMemory`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory)); the latter is deprecated, non-standard, and unreliable for workers/shared heaps ([MDN `performance.memory`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory)).

Long-task measurement must first prove that `longtask` is a supported entry type, filter entries to the meter's `[begin, end]` timestamps, and use `NA_BROWSER` when unsupported. A long task is a main-thread task over 50 ms, so this metric measures responsiveness/blocking, not total worker compute ([Long Tasks API](https://www.w3.org/TR/longtasks-1/#sec-PerformanceLongTaskTiming)). A zero is valid only when observation was active and no in-window long task occurred.

Bundle reporting must publish separate, explicitly named figures for minified+gzipped JavaScript, runtime WASM, workers, codec/core payloads, and their transfer total. `ffmpeg.wasm` loads its core, WASM, and worker URLs separately, and its official example describes the core payload as about 31 MB; a small wrapper bundle is therefore not the total shipped cost ([ffmpeg.wasm usage](https://ffmpegwasm.netlify.app/docs/getting-started/usage/)). The same offline evidence must be joined before both live and offline reports, and a missing key must be `NA_ASSET`, never 0.

#### Scale, duplicates, and partial coverage

Make scale coverage data-driven from manifest/golden availability instead of hand-maintained `baked` flags. Treat the duplicated headline/sweep probe and demux rows either as aliases of one measurement or give them genuinely different protocols; they must not double-weight aggregate wins. Acceptance checks that every registered performance id has a unique stated question and that all currently committed long-form goldens run without an “unbaked” note.

Preserve every per-file sub-result. “Passes file 01, fails 02/03” is [partial coverage](../glossary.md#partial-coverage), not `ERROR`; expose passed/admissible/total counts, failing filenames, and per-file samples. Performance comparison may remain coverage-first, but must compare speed only at equal admissible coverage and label partial cells rather than collapsing them into a binary top-level `FAIL` that hides the successful work.

### Known gaps

#### Binary and representation-sensitive correctness

**Current.** `OracleOutcome` is boolean and `ResultStatus` has no `DIFF`; any material `golden-metadata` difference fails, with positional track comparison and exact codec/rate/channel checks. `golden-packets` requires exact size and keyframe flags after positional per-track grouping. [src/core/scenario.ts:210-222](../../src/core/scenario.ts#L210-L222) [src/core/oracles.ts:721-811](../../src/core/oracles.ts#L721-L811) [src/core/oracles.ts:835-927](../../src/core/oracles.ts#L835-L927)

**Consequence.** A legal representation difference can suppress an otherwise meaningful benchmark as `FAIL`, while the re-import reader already canonicalizes common ISO BMFF fourccs and Matroska codec ids. [src/core/box-readers.ts:43-117](../../src/core/box-readers.ts#L43-L117)

**Target.** Implement the three-way model and semantic metadata/packet rules above, grounded in ISO/IEC 14496-12 and its open ISO BMFF byte-stream profile ([ISO/IEC 14496-12:2022](https://www.iso.org/standard/83102.html), [W3C ISO BMFF byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/)).

**Verification.** Re-run each affected performance row against canonical and alternate valid representations: both are benchmark-eligible, alternate representation is visibly `DIFF`, and corrupted/lost media remains `FAIL` with no number.

#### Index-paired SSIM and decoder conflation

**Current.** The neutral platform source reference is fair by design, but candidate and source frames are paired by index; any candidate-output platform decode failure becomes an oracle failure. [src/core/oracles.ts:1758-1822](../../src/core/oracles.ts#L1758-L1822) [src/core/oracles.ts:1905-1963](../../src/core/oracles.ts#L1905-L1963)

**Consequence.** A valid fps/frame-count conversion can compare different moments and falsely fail, while a valid output unsupported by the browser reference decoder is conflated with an invalid candidate.

**Target.** Use timestamp/window pairing and split output validity from browser decoder applicability, using WebCodecs configuration support and timestamps as specified ([WebCodecs specification](https://www.w3.org/TR/webcodecs/)).

**Verification.** 30→24, VFR, NTSC rate, duplicated-frame, and browser-unsupported-output fixtures produce the expected aligned pairs, unmatched coverage, `NA_BROWSER`, and true `FAIL` routes.

#### Insufficient samples and rankable empty summaries

**Current.** Defaults are one warmup plus one measured operation. Empty finite samples summarize to `n: 0` with zero statistics, and report ranking checks finite median but not `n`. [src/core/bench.ts:16-25](../../src/core/bench.ts#L16-L25) [src/core/bench.ts:127-150](../../src/core/bench.ts#L127-L150) [src/core/report.ts:628-678](../../src/core/report.ts#L628-L678)

**Consequence.** p95/MAD are not informative at `n = 1`, run-order/cache noise is uncontrolled, and a missing lower-is-better metric can win at zero.

**Target.** Adopt adaptive duration, repetitions, randomized interleaving, and strict `n > 0` eligibility following established benchmark practice ([Google Benchmark user guide](https://google.github.io/benchmark/user_guide.html#runtime-and-reporting-considerations)).

**Verification.** Unit tests reject `n: 0`; end-to-end reports show raw samples and protocol metadata; repeated randomized runs remain within a declared stability band or are labeled unstable.

#### Estimated frame numerators

**Current.** Encoded-output rows derive frame counts as rounded golden fps times duration. [src/core/runner.ts:1681-1690](../../src/core/runner.ts#L1681-L1690) [src/core/runner.ts:1713-1723](../../src/core/runner.ts#L1713-L1723)

**Consequence.** VFR, 30000/1001, edit-list, dropped/duplicated-frame, and intentional fps-conversion cases can report a rate for work the engine did not perform.

**Target.** Count actual output presentation units and retain rational/timestamp timing, consistent with WebCodecs timestamp semantics and rational NTSC rates ([WebCodecs specification](https://www.w3.org/TR/webcodecs/#encodedvideochunk-interface), [ffprobe documentation](https://ffmpeg.org/ffprobe-all.html#Video-rate)).

**Verification.** Counter totals equal independently re-imported frame/access-unit counts for CFR, VFR, NTSC, and fps-change outputs; no rate is emitted when a count is unavailable.

#### Resource metrics misstate availability and meaning

**Current.** Memory is read once after the timed operation and falls back to deprecated `performance.memory`; requested long-task observation writes zero even when no observer was attached. The observer uses `buffered: true` without filtering entry timestamps. [src/core/measure.ts:59-75](../../src/core/measure.ts#L59-L75) [src/core/measure.ts:106-147](../../src/core/measure.ts#L106-L147) [src/core/measure.ts:169-233](../../src/core/measure.ts#L169-L233)

**Consequence.** “Peak” can miss the real peak, unlike APIs can be ranked together, an unsupported browser can look perfect at zero blocking, and buffered work outside the operation may be counted.

**Target.** Use explicitly named protocols, capability-aware NA routing, in-window long-task filtering, and comparable memory evidence ([Long Tasks API](https://www.w3.org/TR/longtasks-1/), [MDN `measureUserAgentSpecificMemory`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory), [MDN `performance.memory`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory)).

**Verification.** Synthetic pre-window/in-window long tasks and controlled allocation spikes demonstrate timestamp filtering, unsupported-API NA, and measured peak/delta behavior.

#### Bundle evidence is incomplete and joined late

**Current.** The producer measures minified+gzipped JavaScript only, excludes runtime payloads, and the browser result stays at `n: 0` until the offline comparison script replaces passing cells. [scripts/measure-bundles.mjs:8-21](../../scripts/measure-bundles.mjs#L8-L21) [scripts/compare.mjs:99-110](../../scripts/compare.mjs#L99-L110) [scripts/compare.mjs:145-189](../../scripts/compare.mjs#L145-L189)

**Consequence.** A wrapper around a large separately loaded core appears cheaper than a self-contained library, and live versus offline reports can disagree.

**Target.** Publish component and total transfer sizes, join the same versioned artifact before report construction, and route absence to `NA_ASSET`; official ffmpeg.wasm usage demonstrates why separate core/WASM/worker payloads matter ([ffmpeg.wasm usage](https://ffmpegwasm.netlify.app/docs/getting-started/usage/)).

**Verification.** A fixture map with JS, WASM, worker, codec/core, and total bytes produces identical live/offline cells; deletion of the map yields `NA_ASSET`, never zero.

#### Coarse applicability, manual skips, and collapsed coverage

**Current.** Preflight uses declared requirements and runtime browser support, while runtime `NotApplicableError` already maps to `NA_ENGINE`; several large Remotion rows are manually disabled. Exhaustive results preserve per-file outcomes but describe the top-level status as an all-files AND. [src/core/runner.ts:1331-1393](../../src/core/runner.ts#L1331-L1393) [src/core/disabled-cells.ts:68-87](../../src/core/disabled-cells.ts#L68-L87) [src/core/disabled-cells.ts:143-171](../../src/core/disabled-cells.ts#L143-L171) [src/core/scenario.ts:294-313](../../src/core/scenario.ts#L294-L313)

**Consequence.** Unsupported concrete combinations can leak into `FAIL`/`ERROR`, hand-kept skip rules drift, and mixed per-file behavior loses its partial-grade signal at the cell level.

**Target.** Require adapter runtime applicability decisions, minimize disabled cells, and introduce an explicit partial-coverage grade with denominator and failing files. Frameworks with lazy/random-access source APIs should also expose the source mode used so scale claims distinguish buffering from incremental reads ([Mediabunny media sources](https://mediabunny.dev/guide/reading-media-files)).

**Verification.** Tuple-specific unsupported operations become `NA_ENGINE`; stale disabled entries are removed; a controlled 1-of-3 pass reports partial 1/3 with all sub-results and cannot outrank full coverage.

#### Stale ladder notes and duplicated questions

**Current.** Three resolved, golden-backed ladder assets are labeled unbaked, and headline probe/demux are behaviorally duplicated by sweep probe/demux. [src/scenarios/performance/size-ladder.ts:47-61](../../src/scenarios/performance/size-ladder.ts#L47-L61) [src/scenarios/performance/op-sweep.ts:43-72](../../src/scenarios/performance/op-sweep.ts#L43-L72)

**Consequence.** Reports can claim evidence is unavailable when it exists, and aggregate leaderboards may count one measurement question twice.

**Target.** Derive availability from the fixture/golden loader and make every scenario id represent a unique protocol or an explicit alias excluded from aggregate scoring.

**Verification.** Registry validation lists 33 unique ids with 33 documented purposes, committed long-form goldens produce no “unbaked” note, and aggregate scoring cannot double-count aliases.

## Sources

### Repository evidence

- [src/scenarios/performance/index.ts:47-54](../../src/scenarios/performance/index.ts#L47-L54), [src/scenarios/performance/index.ts:78-164](../../src/scenarios/performance/index.ts#L78-L164), and [src/scenarios/performance/index.ts:218-264](../../src/scenarios/performance/index.ts#L218-L264) — headline declarations and family composition.
- [src/scenarios/performance/_shared.ts:63-153](../../src/scenarios/performance/_shared.ts#L63-L153) — common assets, requirements, tolerances, timeouts, and builder.
- [src/scenarios/performance/op-sweep.ts:43-120](../../src/scenarios/performance/op-sweep.ts#L43-L120) — four operation-sweep scenarios.
- [src/scenarios/performance/decode-encode-seek.ts:43-116](../../src/scenarios/performance/decode-encode-seek.ts#L43-L116) — decode, encode, and seek scenarios.
- [src/scenarios/performance/size-ladder.ts:40-124](../../src/scenarios/performance/size-ladder.ts#L40-L124) — ladder generation, metrics, and stale baked flags.
- [src/scenarios/performance/resource.ts:42-76](../../src/scenarios/performance/resource.ts#L42-L76) — memory and long-task transcode rows.
- [src/scenarios/performance/metamorphic.ts:43-159](../../src/scenarios/performance/metamorphic.ts#L43-L159) — five metamorphic performance scenarios.
- [src/core/runner.ts:1237-1475](../../src/core/runner.ts#L1237-L1475) and [src/core/runner.ts:1628-1723](../../src/core/runner.ts#L1628-L1723) — correctness gate, status routing, timed samples, counters, and frame estimation.
- [src/core/measure.ts:13-158](../../src/core/measure.ts#L13-L158) and [src/core/measure.ts:169-269](../../src/core/measure.ts#L169-L269) — metric derivation, long-task observer, memory probe, and counting source.
- [src/core/bench.ts:16-227](../../src/core/bench.ts#L16-L227) — defaults, metric directions, empty summaries, and exhaustive aggregation.
- [src/core/report.ts:283-294](../../src/core/report.ts#L283-L294) and [src/core/report.ts:573-742](../../src/core/report.ts#L573-L742) — reproducibility caveats and winner eligibility.
- [src/core/oracles.ts:721-984](../../src/core/oracles.ts#L721-L984), [src/core/oracles.ts:1301-1393](../../src/core/oracles.ts#L1301-L1393), and [src/core/oracles.ts:1758-1995](../../src/core/oracles.ts#L1758-L1995) — metadata/packet comparison, semantic remux re-import, and SSIM reference paths.
- [src/core/box-readers.ts:43-117](../../src/core/box-readers.ts#L43-L117) — existing reference-reimport codec canonicalization.
- [src/engines/platform/oracle-helpers.ts:108-165](../../src/engines/platform/oracle-helpers.ts#L108-L165) and [src/engines/platform/decode.ts:89-247](../../src/engines/platform/decode.ts#L89-L247) — neutral output decode, exact WebCodecs support check, timestamps, and frame closure.
- [src/engines/platform/adapter.ts:522-527](../../src/engines/platform/adapter.ts#L522-L527) and [src/core/registry.ts:63-69](../../src/core/registry.ts#L63-L69) — instrument-only platform registration and exclusion from scoring.
- [src/core/scenario.ts:210-318](../../src/core/scenario.ts#L210-L318) — current statuses, boolean oracle outcome, samples, summaries, and coverage data.
- [src/core/disabled-cells.ts:68-87](../../src/core/disabled-cells.ts#L68-L87) and [src/core/disabled-cells.ts:143-171](../../src/core/disabled-cells.ts#L143-L171) — manually skipped large performance cells.
- [scripts/measure-bundles.mjs:1-21](../../scripts/measure-bundles.mjs#L1-L21) and [scripts/compare.mjs:99-189](../../scripts/compare.mjs#L99-L189) — JavaScript-only bundle producer and late offline injection.
- [fixtures/manifest.json:600-612](../../fixtures/manifest.json#L600-L612), [fixtures/manifest.json:630-642](../../fixtures/manifest.json#L630-L642), and [fixtures/manifest.json:692-704](../../fixtures/manifest.json#L692-L704) — resolved large, huge, and massive ladder assets.

### External authorities

- World Wide Web Consortium, [“High Resolution Time Level 3 — Monotonic Clock”](https://www.w3.org/TR/hr-time-3/#sec-monotonic-clock), accessed 2026-07-16 — supports monotonic operation timing and documenting reduced timer resolution.
- World Wide Web Consortium, [“Long Tasks API 1 — PerformanceLongTaskTiming”](https://www.w3.org/TR/longtasks-1/#sec-PerformanceLongTaskTiming), accessed 2026-07-16 — defines main-thread long tasks and the 50 ms threshold.
- Web Platform Incubator Community Group, [“Measure Memory API”](https://wicg.github.io/performance-measure-memory/), accessed 2026-07-16 — defines the user-agent-specific memory estimate and its context scope.
- MDN Web Docs, [“Performance: measureUserAgentSpecificMemory() method”](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory), accessed 2026-07-16 — documents experimental availability and security/isolation requirements.
- MDN Web Docs, [“Performance: memory property”](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory), accessed 2026-07-16 — documents the fallback as deprecated, non-standard, and unreliable.
- World Wide Web Consortium, [“WebCodecs”](https://www.w3.org/TR/webcodecs/), accessed 2026-07-16 — defines exact configuration support, microsecond timestamps, and explicit `VideoFrame` resource release.
- Chrome for Developers, [“WebCodecs best practices”](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs), accessed 2026-07-16 — supports worker-oriented processing, timestamp preservation, and prompt frame closure.
- Google Benchmark, [“User Guide — Runtime and reporting considerations”](https://google.github.io/benchmark/user_guide.html#runtime-and-reporting-considerations), accessed 2026-07-16 — supports adaptive iterations, warmup, repetitions, and randomized interleaving.
- International Organization for Standardization, [“ISO/IEC 14496-12:2022 — ISO base media file format”](https://www.iso.org/standard/83102.html), accessed 2026-07-16 — identifies the normative ISO BMFF edition governing box, track, sample, and presentation structures.
- World Wide Web Consortium, [“ISO BMFF Byte Stream Format”](https://www.w3.org/TR/mse-byte-stream-format-isobmff/), accessed 2026-07-16 — supports edit-list timeline handling and legal in-band/out-of-band codec configuration representations.
- FFmpeg Project, [“ffprobe Documentation — Video rate”](https://ffmpeg.org/ffprobe-all.html#Video-rate), accessed 2026-07-16 — identifies rational NTSC and NTSC-film rates.
- Mediabunny, [“Reading media files / Media sources”](https://mediabunny.dev/guide/reading-media-files), accessed 2026-07-16 — distinguishes whole-buffer sources from lazy/random-access input and supports explicit source-read protocols.
- ffmpeg.wasm, [“Usage”](https://ffmpegwasm.netlify.app/docs/getting-started/usage/), accessed 2026-07-16 — shows separately loaded core/WASM/worker assets and the approximate core payload size relevant to total bundle cost.
