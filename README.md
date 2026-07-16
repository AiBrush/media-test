# media-test

`media-test` is a browser-only conformance and benchmark matrix for comparing media-framework adapters against one engine-independent scenario battery. The battery covers 13 feature families, from probing and packet work through transcoding, streaming output, robustness, and performance. Scenarios declare the operation, inputs, required capabilities, oracles, metrics, and tolerances without naming an engine. [src/core/scenario.ts:74-119](src/core/scenario.ts#L74-L119) [src/core/scenario.ts:145-177](src/core/scenario.ts#L145-L177)

The scored adapters are AiBrush Media, ffmpeg.wasm, Mediabunny, MP4Box.js, Remotion, and web-demuxer. A separate browser-platform implementation supplies WebCodecs decode/playback evidence but is registered as an instrument, not a seventh competitor. [src/app/register.ts:37-92](src/app/register.ts#L37-L92) [src/core/registry.ts:18-26](src/core/registry.ts#L18-L26) [src/core/registry.ts:63-70](src/core/registry.ts#L63-L70)

This documentation has two jobs: describe the implementation that exists today and define the target contracts for later code-cleanup agents. In every owned page, **As-built** is current and code-cited; **Target design and known gaps** is required future behavior and must not be read as implemented.

## Run and score mental model

1. The registry loads scored engine factories and engine-independent scenarios; an individual registration failure is reported without blanking the whole suite. [src/app/register.ts:149-181](src/app/register.ts#L149-L181)
2. The runner expands selected scenarios and engines into browser-specific [cells](docs/glossary.md#cell), then checks engine declarations and runtime browser codec support before execution. [src/core/runner.ts:124-202](src/core/runner.ts#L124-L202) [src/core/runner.ts:1728-1769](src/core/runner.ts#L1728-L1769)
3. A fresh adapter instance performs the operation and returns normalized metadata, packets, bytes, frames, or a seek result. [src/core/engine.ts:196-240](src/core/engine.ts#L196-L240) [src/core/runner.ts:794-845](src/core/runner.ts#L794-L845)
4. Engine-independent oracles judge the observation. In the current implementation, any substantive `pass: false` outcome makes the cell `FAIL`; only a current `PASS` reaches benchmark iterations. [src/core/scenario.ts:208-222](src/core/scenario.ts#L208-L222) [src/core/runner.ts:1411-1463](src/core/runner.ts#L1411-L1463)
5. Reporting folds cells into browser-separated conformance, benchmark, winner, and scorecard views; benchmark numbers are admissible only behind the correctness gate. [src/core/report.ts:4-19](src/core/report.ts#L4-L19) [src/core/report.ts:160-169](src/core/report.ts#L160-L169)

The browser UI and headless launcher drive the same `runMatrix()` surface. Project scripts expose development, serving, browser-run, comparison, build, and typecheck entry points. [src/app/main.ts:43-74](src/app/main.ts#L43-L74) [package.json:10-20](package.json#L10-L20)

## Status vocabulary

The [glossary](docs/glossary.md) is normative. The short version is:

| Term | State | Meaning |
| --- | --- | --- |
| `PASS` | Current status; target oracle verdict | The cell is green today. In the target model it specifically means the semantic and structural contract holds after documented normalization and tolerances. |
| `DIFF` | **Target only** | Valid and semantically acceptable, but represented differently from the ffmpeg-baked golden. It is absent from the current status and boolean oracle types. |
| `FAIL` | Current status; narrowed target meaning | A substantive oracle non-pass today. The target reserves it for truly wrong, invalid, unusable, or tolerance-violating output—not a legal representation difference. |
| `NA_ENGINE` | Current | The engine cannot perform the operation or concrete combination, including a runtime `NotApplicableError`. |
| `NA_BROWSER` | Current | The browser/runtime lacks a required API or supported codec configuration. |
| `NA_ASSET` | Current | Required source or golden evidence is unavailable. |
| `ERROR` | Current | Unexpected harness/adapter execution failure, not ordinary non-applicability. |
| `SKIPPED` | Current | An intentionally disabled cell; not a capability result. |
| partial coverage | **Target only as a grade** | Preserve and grade mixed per-file outcomes such as `PASS`/`FAIL`/`FAIL`. Current exhaustive results retain per-file evidence and counters but collapse the top-level status. [src/core/scenario.ts:294-313](src/core/scenario.ts#L294-L313) [src/core/runner.ts:1118-1205](src/core/runner.ts#L1118-L1205) |

## Documentation map

### Features

- [Audio DSP](docs/features/audio-dsp.md)
- [Decode and seek](docs/features/decode-seek.md)
- [Demux](docs/features/demux.md)
- [Encryption](docs/features/encryption.md)
- [Metadata](docs/features/metadata.md)
- [Mux](docs/features/mux.md)
- [Performance](docs/features/performance.md)
- [Probe](docs/features/probe.md)
- [Remux](docs/features/remux.md)
- [Robustness](docs/features/robustness.md)
- [Streaming output](docs/features/streaming-output.md)
- [Transcode](docs/features/transcode.md)
- [Trim](docs/features/trim.md)

### Subsystems

- [Application and browser UI](docs/subsystems/app-ui.md)
- [Engine adapter contract](docs/subsystems/engine-adapter-contract.md)
- [Golden baking and fixtures](docs/subsystems/golden-baking-fixtures.md)
- [Media selection](docs/subsystems/media-selection.md)
- [Oracle system](docs/subsystems/oracle-system.md)
- [Reporting and aggregation](docs/subsystems/reporting-aggregation.md)
- [Runner and capability negotiation](docs/subsystems/runner-capability-negotiation.md)
- [Scenario DSL and registry](docs/subsystems/scenario-dsl-registry.md)

### Engines

- [AiBrush Media](docs/engines/aibrush-media.md)
- [ffmpeg.wasm](docs/engines/ffmpeg-wasm.md)
- [Mediabunny](docs/engines/mediabunny.md)
- [MP4Box.js](docs/engines/mp4box.md)
- [Remotion](docs/engines/remotion.md)
- [web-demuxer](docs/engines/web-demuxer.md)
