# Project-Specific Benchmark Agent Instructions

## Concrete Task

You must validate this project after reviewing the actual code, not from a generic benchmark template.

Project root:

```txt
/Users/tarekbadr/Home/software/projects/aibrush/aibrush.lib/media-test/media-browser-test
```

Local browser UI:

```txt
http://localhost:5173/index.html
```

This repository is a browser-only media-engine conformance and benchmark suite. The matrix is generated from:

- Scenarios, which are the benchmark rows.
- Engines, which are the framework/adapter columns.
- The current browser/runtime, which can make a supported engine/scenario pair become browser-not-applicable.

In code, a user-facing "Feature" or "Task" means a registered `Scenario`.

In code, a user-facing "Framework" means a registered `MediaEngine`.

The actual matrix cell is:

```txt
(browser, engineId, scenarioId)
```

If a run targets only one browser, the agent assignment may be described as `(Feature x Framework)`, but the agent must still record the browser because `NA_BROWSER` depends on the browser.

If a run targets multiple browsers, create one unique agent for every:

```txt
(Browser x Feature x Framework)
```

Do not reuse one browser's support verdict for another browser.

## Desired User-Facing Result

For the visible table/report requested by the user, every final displayed cell must be exactly one of:

```txt
Pass (<execution time>)
N/A
```

Examples:

```txt
Pass (12.4 ms)
Pass (348 ms)
Pass (1.21 s)
N/A
```

Important: the code's machine-readable result model is more detailed than the requested display.

The internal statuses in `src/core/scenario.ts` are:

```ts
'PASS' | 'FAIL' | 'NA_ENGINE' | 'NA_BROWSER' | 'ERROR' | 'SKIPPED'
```

Agents must preserve that internal distinction. In particular:

- `NA_ENGINE` means the engine did not declare the required capability.
- `NA_BROWSER` means the engine declared the capability, but the browser cannot provide the required runtime support.

Only the final human-facing display collapses both NA statuses to:

```txt
N/A
```

Do not change `ScenarioResult.status` to a literal `N/A`.

## Mandatory Unique-Agent Rule

Create exactly one unique agent for every assigned matrix cell.

For a single-browser run, the required unit is:

```txt
(scenarioId x engineId)
```

For a multi-browser run, the required unit is:

```txt
(browser x scenarioId x engineId)
```

Do not create one agent per scenario family.

Do not create one agent per engine.

Do not assign multiple scenario-engine cells to one agent.

Do not batch cells.

Each table cell must have exactly one dedicated agent.

Use stable agent identifiers:

```txt
agent__<browser_slug>__<scenario_slug>__<engine_slug>
```

For single-browser work where the browser is fixed and known, the shorter form is acceptable:

```txt
agent__<scenario_slug>__<engine_slug>
```

Examples:

```txt
agent__brave__probe_basic_h264__mediabunny
agent__brave__demux_audio_6ch_51__mp4box
agent__chromium__trim_hevc_copy__platform
agent__webkit__transcode_vp9_alpha__remotion_webcodecs
```

The coordinator must verify:

```txt
actual_unique_agents === browsers * scenarios * engines
```

or, for a fixed single browser:

```txt
actual_unique_agents === scenarios * engines
```

## Actual Code Map

Agents must use these files as the source of truth.

### Scenario Model

Read:

```txt
src/core/scenario.ts
src/scenarios/index.ts
src/scenarios/<family>/index.ts
```

`Scenario` is the internal name for a benchmark feature/task/case. Each scenario declares:

- `id`, for example `probe/...`, `demux/...`, `transcode/...`.
- `family`, derived from the `id` prefix.
- `op`, one of the `Operation` values from `src/core/engine.ts`.
- `input`, which points to one or more fixture asset ids.
- `options`, forwarded to the engine operation.
- `requires`, the capability gate.
- `oracles`, the correctness gate.
- `metrics`, the performance measurements to collect after correctness passes.
- `primaryMetric`, the per-case ranking metric when present.
- `timeoutMs`, when the scenario needs a custom timeout.
- `notes`, which often explain edge cases or expected NA conditions.

The registered scenario list comes from `src/app/register.ts`, not only from `src/scenarios/index.ts`, because `registerAll()` defensively imports each scenario family and reports failures.

### Engine Model

Read:

```txt
src/core/engine.ts
src/core/registry.ts
src/app/register.ts
src/engines/*/adapter.ts
src/engines/*/register.ts
```

`MediaEngine` is the internal name for a framework adapter. Engines implement:

- `id`
- `capabilities()`
- optional `configUsed`
- optional `init()`
- optional `dispose()`
- required operation methods such as `probe`, `demux`, `remux`, `transcode`, `decodeFrames`, `seek`, and `trim`
- optional `mux`
- optional `decrypt`

Known engine wirings in this project currently include:

- `mediabunny`
- `platform`
- `ffmpeg.wasm`
- `mp4box`
- `remotion-media-parser`
- `web-demuxer`
- `remotion-webcodecs`
- `aibrush-media`

The displayed engine id may be versioned or runtime-derived, for example `mediabunny@...` or `platform@...`. `src/app/main.ts` explicitly maps registry ids to actual `engine.id` values before drawing the matrix. Agents must use the result's `engineId` when matching cells.

### Negotiation And NA Rules

Read:

```txt
src/core/runner.ts
src/core/feature-detect.ts
src/core/INTERNAL_API.md
```

The runner decides whether a scenario is applicable by calling:

```ts
negotiate(caps, support, scenario.requires)
```

The negotiation rules are already implemented in `src/core/runner.ts`.

Pass 1 checks engine declarations from `MediaEngine.capabilities()`:

- required operations
- input containers
- output containers
- video codecs
- audio codecs
- encryption schemes
- feature flags

Any missing engine declaration becomes:

```txt
NA_ENGINE
```

Pass 2 checks browser/runtime support from `detectCodecSupport()`:

- WebCodecs presence
- video decode support
- video encode support
- audio decode support
- audio encode support
- alpha support

Any browser/runtime gap becomes:

```txt
NA_BROWSER
```

Engines that do not depend on WebCodecs for codec support should declare:

```txt
webcodecs:independent
```

That feature intentionally opts them out of the browser WebCodecs codec gate.

Agents must not create a second support system. They must validate and, if necessary, correct:

- the scenario's `requires`
- the engine's `capabilities()`
- the runtime detection path
- the existing `negotiate()` behavior

### Runner And Result Flow

Read:

```txt
src/core/runner.ts
src/app/main.ts
src/app/ui.ts
src/core/report.ts
scripts/launch.mjs
scripts/run.sh
scripts/compare.mjs
```

The runner flow for one cell is:

1. Build a fresh engine instance from the registry.
2. Detect browser environment and codec support once per run.
3. Negotiate `engine.capabilities()` against `scenario.requires`.
4. If negotiation returns NA, emit `NA_ENGINE` or `NA_BROWSER` and do not run the operation.
5. Await `engine.init()` before timing the operation.
6. Build `MediaInput` from `/fixtures/media/<assetId>`.
7. Execute the scenario operation.
8. Run all declared correctness oracles.
9. If any oracle fails, emit `FAIL`.
10. If all oracles pass, emit `PASS`.
11. Only after `PASS`, run performance measurement for declared metrics.
12. Always call `engine.dispose()` when present.

Current live UI rendering is in `src/app/ui.ts`.

Current report rendering is in `src/core/report.ts`.

If the user-facing requirement is "only `Pass (<execution time>)` or `N/A`", agents should inspect and update the display formatting in those files, not the internal result status model.

### Fixtures And Golden Data

Read:

```txt
fixtures/manifest.json
fixtures/golden/*.json
fixtures/bake.mjs
scripts/bake-fixtures.sh
vite.config.mjs
```

Runtime media is fetched from:

```txt
/fixtures/media/<assetId>
```

Golden data is fetched from:

```txt
/fixtures/golden/<assetId>.*.json
```

`vite.config.mjs` serves `/fixtures/**` as raw static bytes with HTTP Range support before Vite's transform pipeline. This matters for media names ending in `.ts`, which must be served as MPEG-TS media, not TypeScript modules.

Fixture-related errors are not automatically unsupported-framework results. Agents must distinguish:

- missing media asset
- missing golden metadata
- wrong fixture path
- wrong MIME guess
- unsupported codec/container
- genuine adapter failure

## Coordinator Workflow

The coordinator must perform these steps before spawning validation agents:

1. Boot or inspect the app registration path in `src/app/register.ts`.
2. Extract registered scenario ids from `listScenarios()` after `registerAll()`, or directly from scenario files if the app cannot boot.
3. Extract registered engine ids from `listEngines()` after `registerAll()`, remembering that runtime result ids may differ from registry ids.
4. Determine the target browser or browsers. The default local command uses real Brave, but the code also supports `chromium`, `webkit`, and `firefox`.
5. Compute the full matrix:

   ```txt
   target browsers x registered scenario ids x registered engine ids
   ```

6. Create one unique agent for each cell.
7. Give each agent exactly one browser, one scenario id, and one engine id.
8. Collect structured reports from every agent.
9. Coordinate shared fixes only when a bug is genuinely shared.
10. Re-run affected cells after fixes.
11. Verify the final human-facing output uses only `Pass (<execution time>)` or `N/A`.
12. Verify the internal JSON still preserves `PASS`, `FAIL`, `NA_ENGINE`, `NA_BROWSER`, `ERROR`, and `SKIPPED` where appropriate.

## Per-Agent Assignment

Each agent receives exactly one assignment:

```txt
Project root: /Users/tarekbadr/Home/software/projects/aibrush/aibrush.lib/media-test/media-browser-test
Benchmark URL: http://localhost:5173/index.html
Browser: <browser>
Scenario id: <scenarioId>
Engine id: <engineId>
Required visible result: Pass (<execution time>) or N/A
```

The agent must not work on any other cell.

## Per-Agent Workflow

### 1. Read The Scenario

The agent must locate the assigned scenario in `src/scenarios/**`.

It must record:

- `scenario.id`
- `scenario.family`
- `scenario.op`
- `scenario.input`
- `scenario.options`
- `scenario.requires`
- `scenario.oracles`
- `scenario.metrics`
- `scenario.primaryMetric`
- `scenario.notes`

The agent must understand what observable behavior is being tested.

For example, a demux scenario is not "does the framework claim demux exists"; it is "does this engine produce packet and metadata output that passes the declared oracle for this exact asset and requirement set."

### 2. Read The Engine Adapter

The agent must locate the assigned engine adapter and registration path.

It must record:

- how the engine is registered
- the actual `engine.id`
- `capabilities()`
- whether the engine declares `webcodecs:independent`
- whether the required operation is implemented
- whether the operation throws by design because it should have been negotiated to NA first
- whether `init()` must be awaited
- whether `configUsed` should be present

Unsupported methods may throw inside adapters, but the runner should not call those methods when the engine honestly omitted the capability. If an unsupported method is being called, the likely fix is the engine's `capabilities()` or the scenario's `requires`, not hiding the thrown error.

### 3. Run Or Simulate Negotiation

The agent must evaluate:

```txt
engine.capabilities() against scenario.requires
browser detectCodecSupport() against scenario.requires
```

using the existing `negotiate()` rules.

Expected outcomes:

- Missing declared operation/container/codec/feature/encryption: `NA_ENGINE`.
- Missing browser WebCodecs/API/codec/alpha support: `NA_BROWSER`.
- Successful negotiation: execute the scenario.

The agent may classify the visible cell as `N/A` only when the internal result should be `NA_ENGINE` or `NA_BROWSER`.

The agent must not classify these as `N/A`:

- adapter bug
- scenario bug
- fixture path bug
- missing `await`
- missing registration
- wrong MIME type
- wrong codec string
- oracle bug
- UI result formatting bug
- supported feature not yet implemented

Those are implementation failures that need fixes or must remain internally visible as `FAIL`/`ERROR` until fixed.

### 4. Validate Execution For Supported Cells

If negotiation succeeds, the agent must ensure the scenario can execute correctly.

Inspect likely failure points:

- `src/core/runner.ts` operation dispatch for the scenario `op`
- adapter method implementation
- required dynamic imports in `init()`
- fixture id and fetch path
- golden files required by the declared oracles
- codec/container token mismatch
- async operations that need `await`
- timeout handling
- reference-engine oracle setup
- platform oracle hooks
- cleanup in `dispose()`

If the operation runs and all oracles pass, the internal status should be:

```txt
PASS
```

The visible cell should then be:

```txt
Pass (<execution time>)
```

### 5. Pick The Execution Time Source

For the visible `Pass (<execution time>)` string, prefer the most specific existing time source:

1. `r.bench.wall.median`, when the scenario measured `wall`.
2. The primary metric value, only if the product intentionally wants primary benchmark numbers instead of wall time.
3. `r.durationMs`, as a fallback for functional-only PASS cells with no bench.

Do not include `engine.init()` in operation timing unless the display explicitly uses `durationMs` as a fallback. The benchmark protocol excludes load/init from operation timing.

If the UI/report currently shows `PASS` plus a separate metric line, update display formatting in `src/app/ui.ts` and/or `src/core/report.ts` so the requested surface shows a single `Pass (<execution time>)` value.

Do not alter the raw `ScenarioResult` shape just to satisfy display formatting.

## Classification Rules

### Internal `NA_ENGINE`

Use `NA_ENGINE` when the engine does not honestly declare the scenario's required capability.

Examples:

- parser-only engine does not declare `transcode`
- engine does not declare `trim`
- engine does not declare output container `webm`
- engine does not declare video codec `av1`
- engine does not declare feature `metadata:write`
- placeholder `aibrush-media` has empty capabilities

Visible display:

```txt
N/A
```

### Internal `NA_BROWSER`

Use `NA_BROWSER` when the engine declares the capability but the browser/runtime cannot support it.

Examples:

- WebCodecs is absent
- browser cannot decode required video codec
- browser cannot encode required video codec
- browser cannot decode required audio codec
- browser cannot encode required audio codec
- browser cannot configure alpha frames

Visible display:

```txt
N/A
```

### Internal `PASS`

Use `PASS` only when:

- negotiation succeeds
- the engine operation completes
- all declared oracles pass
- any benchmark metrics are collected only after correctness passes
- no uncaught page error is caused by this cell

Visible display:

```txt
Pass (<execution time>)
```

### Internal `FAIL`

Use `FAIL` when the engine runs but the result is wrong:

- oracle mismatch
- timeout for a normal operation
- wrong decoded frame
- wrong packet table
- bad trim boundary
- playback smoke fails
- robustness expectation fails

`FAIL` is not an acceptable final visible result under the user's requested simplified display. A `FAIL` cell must be fixed if the feature is supposed to be supported, or reclassified through honest capabilities if it was wrongly negotiated into execution.

### Internal `ERROR`

Use `ERROR` when implementation or runtime execution breaks:

- thrown exception from a supported path
- failed engine construction
- failed `init()`
- bad fixture fetch
- unhandled adapter exception
- missing oracle hook
- invalid scenario options

`ERROR` is not an acceptable final visible result. It must be fixed or converted to honest `NA_ENGINE`/`NA_BROWSER` only when the evidence shows the scenario should never have run for that engine/browser.

## Shared Fix Rules

Agents should keep fixes scoped to their own cell unless the root cause is shared.

Shared-fix examples:

- `src/app/ui.ts` renders NA as `NA(engine)` / `NA(browser)` when the requested user-facing table must show only `N/A`.
- `src/app/ui.ts` renders `PASS` and metrics separately when the requested display must be `Pass (<execution time>)`.
- `src/core/report.ts` renders benchmark cells as primary-metric-only numbers when the requested report must show `Pass (<execution time>)`.
- `src/core/runner.ts` negotiation calls an unsupported adapter method because a scenario `requires` field is incomplete.
- `src/app/main.ts` draws columns with registry ids while results use runtime `engine.id`.
- `vite.config.mjs` fails to serve fixture media as raw bytes.
- `src/app/register.ts` drops an engine or scenario family silently.

If a shared bug is found, the coordinator should own the shared fix and then send affected cells back to their dedicated agents for revalidation.

## Required Agent Report

Each agent must return this structure:

```json
{
  "agent_id": "agent__<browser_slug>__<scenario_slug>__<engine_slug>",
  "browser": "<browser>",
  "scenario_id": "<scenarioId>",
  "scenario_family": "<family>",
  "engine_id": "<engineId>",
  "registry_engine_id": "<registry id if different>",
  "internal_status": "PASS | FAIL | NA_ENGINE | NA_BROWSER | ERROR | SKIPPED",
  "visible_result": "Pass (<execution time>) | N/A",
  "execution_time_ms": 123.45,
  "support_verdict": "supported | unsupported-by-engine | unsupported-by-browser",
  "negotiation_reason": "<reason from negotiate(), if any>",
  "scenario_requires": {
    "operations": [],
    "containersIn": [],
    "containersOut": [],
    "videoCodecs": [],
    "audioCodecs": [],
    "encryption": [],
    "features": []
  },
  "engine_capabilities_checked": true,
  "browser_support_checked": true,
  "oracles_checked": [],
  "files_inspected": [],
  "files_changed": [],
  "errors_found": [],
  "fix_summary": "",
  "verification": ""
}
```

## Recommended Commands

Use bun, not npm or npx.

Type-check:

```txt
bun run typecheck
```

Build:

```txt
bun run build
```

Serve the app:

```txt
bun run dev
```

or:

```txt
bash scripts/serve.sh --port 5173
```

Run one scenario/engine in the real-browser launcher:

```txt
bash scripts/run.sh --browser brave --engine <engine> --scenario <scenarioId> --pillar all --warmup 1 --iters 1
```

Build the report from raw results:

```txt
bash scripts/compare.sh
```

The launcher is automation only. It does not measure anything itself. Measurements are produced inside the browser page.

## Final Coordinator Validation

After all agents finish, the coordinator must verify:

- Every target `(browser, scenarioId, engineId)` has exactly one unique agent.
- No target cell is missing.
- No target cell has duplicate agents.
- Every unsupported cell is internally `NA_ENGINE` or `NA_BROWSER` and visibly `N/A`.
- Every supported, corrected cell is internally `PASS` and visibly `Pass (<execution time>)`.
- No final visible cell contains raw `PASS`, `FAIL`, `ERROR`, `SKIPPED`, `NA_ENGINE`, `NA_BROWSER`, `NA(engine)`, `NA(browser)`, `Unknown`, or an empty placeholder.
- Machine-readable results still preserve the internal status distinction.
- The UI table and generated report agree on the requested display rule, if both are in scope.

Final coordinator summary schema:

```json
{
  "target_browsers": [],
  "total_scenarios": 0,
  "total_engines": 0,
  "expected_agents": 0,
  "actual_unique_agents": 0,
  "all_cells_have_unique_agents": true,
  "duplicate_cells": [],
  "missing_cells": [],
  "visible_invalid_cells": [],
  "internal_error_cells_requiring_fix": [],
  "remaining_issues": []
}
```

## Agent Prompt Template

Use this template for each cell:

```md
You are a benchmark validation agent for this repository:

/Users/tarekbadr/Home/software/projects/aibrush/aibrush.lib/media-test/media-browser-test

You are assigned exactly one matrix cell.

Do not work on any other cell.

Browser:

<BROWSER>

Scenario id:

<SCENARIO_ID>

Engine id:

<ENGINE_ID>

Your task:

1. Read the scenario definition in `src/scenarios/**`.
2. Read the engine adapter and registration path in `src/engines/**` and `src/app/register.ts`.
3. Evaluate `scenario.requires` against `engine.capabilities()` and browser support using the existing `negotiate()` rules in `src/core/runner.ts`.
4. If the cell is unsupported, ensure the internal status is `NA_ENGINE` or `NA_BROWSER` and the visible result is `N/A`.
5. If the cell is supported, ensure the operation executes, all declared oracles pass, and the visible result is `Pass (<execution time>)`.
6. Do not mark adapter bugs, fixture bugs, async bugs, registration bugs, or oracle bugs as `N/A`.
7. Preserve the internal `ScenarioResult.status` model.
8. Return the required structured report.

The only valid final visible results are:

- `Pass (<execution time>)`
- `N/A`
```
