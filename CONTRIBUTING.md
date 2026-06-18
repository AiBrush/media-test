# Contributing to Browser Media-Engine Benchmark

Thank you for your interest in contributing. This suite is meant to make browser media-engine behavior visible, reproducible, and comparable across engines.

## Getting Started

1. Fork or clone the repository.
2. Install dependencies:

   ```bash
   bun install
   ```

3. Start the interactive suite:

   ```bash
   bun run serve
   ```

4. Run verification before opening a pull request:

   ```bash
   bun run typecheck
   bun run build
   ```

## Development Setup

- Runtime: Bun.
- Browser runs: use `scripts/run.sh` through `bun run run`.
- Fixture corpus: `fixtures/media`.
- Golden outputs: `fixtures/golden`.
- Raw results: `results/raw`.
- Consolidated report: `results/report.md` and `results/report.json`.

This workspace expects Bun/Bunx. Avoid introducing npm/npx-only workflows.

## Project Structure

```text
src/app/        Browser UI and result matrix
src/core/       Benchmark runner, bench protocol, oracles, registry, reporting
src/engines/    Engine adapters and capability declarations
src/scenarios/  Scenario definitions grouped by media feature
fixtures/       Local media assets and golden outputs
scripts/        Automation for serve, run, compare, bake, and add-engine
results/        Raw and consolidated benchmark results
```

## Contribution Guidelines

### Code Style

- Follow the existing TypeScript style.
- Keep changes scoped to the feature or engine being changed.
- Prefer existing helpers and scenario/oracle patterns over new one-off logic.
- Keep comments short and useful.

### Benchmark Discipline

Correctness gates performance. A benchmark timing is useful only after the scenario output has passed the relevant oracle.

Contributions should:

- Preserve feature-first execution.
- Use local fixtures and goldens where possible.
- Make unsupported capabilities explicit with the correct `N/A` classification.
- Avoid treating browser-specific limitations as engine failures.
- Include raw result evidence when changing scenario, oracle, or adapter behavior.

### Adding or Updating Scenarios

When adding a scenario:

1. Put it in the appropriate feature family under `src/scenarios`.
2. Declare required features and codecs precisely.
3. Use the smallest local fixture that still exercises the behavior.
4. Add or refresh goldens in `fixtures/golden` when the oracle needs them.
5. Document expected `PASS`, `FAIL`, or `N/A` behavior when it is not obvious.

### Adding an Engine

Use the engine scaffold:

```bash
bun run add-engine
```

An engine adapter should:

- Declare capabilities honestly.
- Separate initialization from measured work.
- Return structured outputs that existing oracles can inspect.
- Avoid hiding engine limitations as generic exceptions.

### Testing

Run the static checks:

```bash
bun run typecheck
bun run build
```

Run targeted browser checks for benchmark changes:

```bash
bun run run --browser brave --engine mediabunny --feature remux --warmup 1 --iters 1
```

Run one scenario while debugging:

```bash
bun run run --browser brave --engine mediabunny --scenario remux/prop_bframes_decode_remux_mp4_mkv --warmup 1 --iters 1
```

Regenerate the consolidated report when result data changes:

```bash
bun run compare
```

### Fixture and Golden Data

Fixture changes are part of the benchmark contract. When updating media or golden files:

- Keep source inputs inspectable in `fixtures/media`.
- Keep expected outputs inspectable in `fixtures/golden`.
- Prefer deterministic generation through scripts.
- Note any codec, browser, or platform assumption in the scenario or PR description.

### Commits

- Use clear, focused commit messages.
- Keep unrelated formatting, fixture, and engine changes separate when possible.
- Include result evidence for benchmark behavior changes.

## Pull Requests

Before opening a pull request:

1. Run `bun run typecheck`.
2. Run `bun run build`.
3. Run the smallest browser benchmark slice that covers your change.
4. Update docs if the user-facing workflow, scenario list, or result interpretation changed.
5. Link any related issue and include raw result filenames when relevant.

## Reporting Bugs

Open a GitHub issue with:

- Steps to reproduce.
- Browser and version.
- Engine and version.
- Scenario id.
- Expected vs actual status.
- Raw result JSON path or attachment when available.

## Security

For security vulnerabilities, see [SECURITY.md](SECURITY.md). Do not open a public issue for security-sensitive reports.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
