Goal: Validate and repair the media-browser benchmark matrix so every targeted visible cell shows only `Pass (<execution time>)` or `N/A`, while preserving the internal `ScenarioResult.status` model.

Before acting, read the project-specific instructions in:

@BENCHMARK_AGENT_INSTRUCTIONS.md

Treat that file as authoritative. Do not rely on a generic benchmark plan.

Concrete project terms:

- Feature / Task / Case = registered `Scenario`.
- Framework = registered `MediaEngine`.
- Real cell identity = `(browser, scenarioId, engineId)`.
- For a single-browser run, create exactly one unique agent per `(scenarioId x engineId)`.
- For a multi-browser run, create exactly one unique agent per `(browser x scenarioId x engineId)`.
- Do not batch cells. Do not assign multiple cells to one agent.

Use these source-of-truth files:

- `src/core/scenario.ts`
- `src/core/engine.ts`
- `src/core/runner.ts`
- `src/core/feature-detect.ts`
- `src/core/registry.ts`
- `src/app/register.ts`
- `src/app/main.ts`
- `src/app/ui.ts`
- `src/core/report.ts`
- `src/scenarios/**`
- `src/engines/**`
- `fixtures/manifest.json`
- `fixtures/golden/**`
- `vite.config.mjs`

Use the existing support model:

- Compare `scenario.requires` with `engine.capabilities()`.
- Use browser support from `detectCodecSupport()`.
- Use the existing `negotiate()` logic in `src/core/runner.ts`.
- Missing engine capability becomes internal `NA_ENGINE`.
- Missing browser/runtime capability becomes internal `NA_BROWSER`.
- Both NA statuses display as `N/A` in the user-facing table/report.
- Do not change raw `ScenarioResult.status` to literal `N/A`.

For supported cells:

- The operation must execute.
- All declared oracles must pass.
- Performance metrics run only after correctness passes.
- The visible result must be `Pass (<execution time>)`.

For unsupported cells:

- The internal result must be `NA_ENGINE` or `NA_BROWSER`.
- The visible result must be `N/A`.

Do not classify these as `N/A`: adapter bugs, fixture bugs, missing registration, wrong fixture path, wrong MIME/codec token, missing await, oracle bugs, UI formatting bugs, or supported-but-unimplemented functionality. Fix those, or leave them internally visible as `FAIL`/`ERROR` until fixed.

Validate display formatting in `src/app/ui.ts` and `src/core/report.ts`. The requested human-facing output is only:

- `Pass (<execution time>)`
- `N/A`

Use bun, not npm or npx. Useful commands:

- `bun run typecheck`
- `bun run build`
- `bash scripts/serve.sh --port 5173`
- `bash scripts/run.sh --browser brave --engine <engine> --scenario <scenarioId> --pillar all --warmup 1 --iters 1`
- `bash scripts/compare.sh`

Final coordinator check:

- actual unique agents equals target browsers *scenarios* engines, or scenarios * engines for a fixed single-browser run.
- no missing cells
- no duplicate agents
- no visible raw `PASS`, `FAIL`, `ERROR`, `SKIPPED`, `NA_ENGINE`, `NA_BROWSER`, `NA(engine)`, `NA(browser)`, empty placeholder, or unknown status
- machine-readable results still preserve the internal status distinction
