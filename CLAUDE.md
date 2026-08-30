# media-test — operating protocol

Browser matrix benchmark: 13 scenario families (features) × 6 engines. Every matrix row
is a scenario (`family/name`), verified by oracles against golden data. Correctness is
binary: **PASS** (green, wall time shown) or **FAIL**. `NA_*` = not applicable,
`ERROR`/`SKIPPED` = environment / reviewed suppression. Timing never gates correctness —
a slow PASS is a PASS.

## The one-cell rule

Work on **exactly one feature × one engine** per task (a "cell" = every `family/*`
scenario row for that engine, e.g. `trim × mediabunny`). A cell has only two acceptable
end states:

1. **PASS** — the engine performs the feature correctly; time is measured automatically.
2. **NA_ENGINE** — the framework genuinely cannot support it, declared with evidence.

There is no third outcome. Never leave a cell at FAIL or ERROR, never batch-fix many
cells at once, and never fake a pass. When the cell is green or N/A **in exhaustive
mode**, commit, then pick the next cell. The campaign is the whole matrix, one cell at a
time.

## Fix vs N/A — triage in this order

1. **Environment?** Mass ERROR `Cannot read properties of undefined (reading 'digest')`
   = insecure context — serve and open only via `http://127.0.0.1:5151`. `NA_BROWSER` =
   missing browser API, `NA_ASSET` = missing fixture, timeout on long-form assets =
   budget. None of these mean "framework doesn't support it".
2. **Harness bug?** The same scenario FAILing across several engines ⇒ suspect the golden
   value or an oracle tolerance (`src/core/oracles.ts`), not the engines (this happened:
   the golden-metadata duration band). Change an oracle/golden only when you can verify
   the correct value independently — never loosen a tolerance just to go green.
3. **Our adapter bug?** Wrong framework API usage in `src/engines/<engine>/adapter.ts` —
   fix and re-run until PASS.
4. **Genuine framework limitation?** Only when the framework's public API offers no way
   to do the operation, or the framework itself reports the codec/container/operation
   unsupported. Declare it properly (reason must cite the concrete API gap):
   - operation-wide: the engine's `CapabilitySet` declaration;
   - concrete tuple: `supports()` in `src/engines/<engine>/support.ts` returning
     `{ supported: false, status: 'NA_ENGINE', reasonCode, reason }`;
   - discoverable only at runtime: throw a `NotApplicableError` (`createNotApplicableError`).
   Never fake N/A via runner hacks or `src/core/disabled-cells.ts` (that table is for
   reviewed budget/safety suppressions only, not applicability).

## Definition of done (per cell)

- Quick run PASSes, then the **exhaustive run** (`--exhaustive`) PASSes: every admissible
  file green, coverage grade `full` — or the cell is `NA_ENGINE` with a cited reason.
  Exhaustive folds with FAIL > ERROR > PASS: one failing file fails the cell.
- `bun test` and `bun run typecheck` stay clean.
- If an oracle/golden was touched, one other engine re-run on the affected scenarios
  shows no cross-engine regression.
- Commit names the cell, e.g. `cell(trim × mediabunny): …`.

## Commands (bun only — npm/npx unavailable)

```sh
bun run dev                 # vite dev server → http://127.0.0.1:5151
bun run serve               # vite build + preview → http://127.0.0.1:5152
bun run build               # production build
bun test && bun run typecheck         # unit tests — must stay green
```

In-page (DevTools on the served page):

```js
await window.__SUITE__.run({ engineIds: ['mp4box'], featureIds: ['trim'],
  reuseData: false, exhaustiveMedia: true })
```

## Exact ids (validated strictly — unknown ids throw)

- Engines: `mediabunny`, `ffmpeg-wasm`, `mp4box`, `remotion`, `web-demuxer@4.0.0`
  (versioned id!), `aibrush-media`. (`platform` is instrument-only, never a column.)
- Features: `probe`, `demux`, `remux`, `transcode`, `decode-seek`, `trim`, `mux`,
  `encryption`, `metadata`, `streaming-output`, `audio-dsp`, `robustness`, `performance`.

## Traps

- Secure context: only `http://127.0.0.1:5151` / `5152` (vite sets COOP/COEP, required
  for memory measurement and multithreaded ffmpeg.wasm). LAN-HTTP ⇒ every cell ERRORs.
- `bun run serve` is `127.0.0.1:5152` (preview), `bun run dev` is `127.0.0.1:5151` (dev). Use `reuseData:false` in `window.__SUITE__.run()` to force a fresh run.
- Fixtures must exist (`fixtures/manifest.json`); baking (`bun run bake`) needs native
  ffmpeg and is the only place native ffmpeg is allowed.

Use `/test-cell <engine> <feature>` for the full step-by-step procedure.
