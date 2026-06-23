# performance/bundle-size

- **family:** performance
- **fixture asset(s):** `fixtures/media/tiny_h264_360p_2s.mp4` (~173 KB, H.264/AAC MP4, 640×360, 2.0 s)
- **primaryMetric:** `bundleSize` (kB, min+gzip, lower-is-better) — **NOT measured at runtime; never injected**
- **passCount:** 7 of 7 (all PASS the nominal probe via `golden-metadata`)

## Verdict

**Best framework: mp4box@2.3.0** — but this is a *degenerate* contested case. All 7 engines report `status=PASS`, yet the ranking metric (`bundleSize`) is **empty for every engine**: `bench.bundleSize = {n:0, median:0, samples:[]}`. The PASS comes 100% from the `golden-metadata` oracle on a trivial probe, **not** from any bundle-size measurement. The leaderboard cannot honestly rank by the in-shard metric (all medians are 0/NaN → no winner).

The only bundle-size signal that exists is the *offline, orphaned* `results/bundle-sizes.json`, which the runner never reads (see Anti-cheat). Using those offline numbers as the tiebreaker (the metric's documented semantics — smaller shipped JS wins, excluding the no-shippable-cost `platform` baseline which is 0 by definition):

- **mp4box = 41.3 kB** (smallest real shippable bundle)
- runner-up **web-demuxer = 43.2 kB** → margin **1.05× smaller** (mp4box is 4.4% leaner)
- mediabunny = 165.2 kB (4.00× larger than mp4box); remotion-webcodecs = 94 kB (2.28×); remotion-media-parser = 72.6 kB (1.76×).
- `ffmpeg.wasm = 1.4 kB` is reported but is a **fiction of the offline measurer** — it only counts the JS shim, not the multi-MB `.wasm` core it lazy-loads; it is excluded as not physically representing shipped cost.

**Decisive factor:** smallest real min+gzip JS payload among engines with an actual shippable library cost. **Margin over runner-up:** 41.3 kB vs 43.2 kB = 1.05× (4.4%). This is a *thin, low-confidence* win drawn from an offline file the harness does not consume.

## Per-engine results

All 7 PASS on the same probe oracle; the ranking metric is blank for all. "bundleSize (offline)" is from the orphaned `results/bundle-sizes.json`, **not** from the shard's `bench`.

| engine | status | oracles passed | bundleSize (shard bench) | bundleSize (offline json) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-metadata:pass | 0 (n=0) | **41.3 kB** | — (n=0) | — | — | — | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 0 (n=0) | 43.2 kB | — (n=0) | — | — | — | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 0 (n=0) | 72.6 kB | — (n=0) | — | — | — | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 0 (n=0) | 94 kB | — (n=0) | — | — | — | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 0 (n=0) | 165.2 kB | — (n=0) | — | — | — | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 0 (n=0) | 1.4 kB (shim only, wasm excluded) | — (n=0) | — | — | — | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 0 (n=0) | 0 kB (no shippable lib) | — (n=0) | — | — | — | cached previous PASS result |

Probe oracle measurements (identical structure across all 7): `durationDeltaSec=0` (platform: 0.021333), `durationToleranceSec=0.041667`, "metadata matches golden (2 track(s))".

## Why the winner wins (deep technical)

This scenario has **no media-processing work that distinguishes engines** — by construction. The scenario notes (`src/scenarios/performance/index.ts:166-248`) state the op is `probe` on the smallest valid golden file purely so the nominal op SUCCEEDS everywhere; "the op is never actually timed for the score; the score comes entirely from the injected bundleSizeKb" (index.ts:185-186). So the only mechanistic differentiator is **shipped JavaScript byte cost**, and the winner is whichever library tree-shakes + minifies + gzips smallest for a metadata-probe-class entrypoint.

mp4box wins on that axis at **41.3 kB**. Mechanistically this is expected: MP4Box.js (`src/engines/mp4box`, `backend:"pure-js"` per the shard's `env.configUsed`) is a single-purpose ISO-BMFF box parser with no codec/decoder/WebCodecs glue and no wasm — its `whole-file-append(MP4BoxBuffer+fileStart)` pipeline (env.configUsed) is pure JS box-walking, which gzips tightly. web-demuxer (43.2 kB) is nearly tied but carries a thin wasm-bridge surface; remotion-media-parser (72.6 kB, `backend:"cpu-js"`, `fieldsTier:"metadata-only"`) ships a larger streaming parser with multi-container support; remotion-webcodecs (94 kB) and especially mediabunny (165.2 kB, `coreBuild:"pure-ts-esm"`, with canvas-pool / VideoSample / WebCodecs orchestration) bundle full demux+decode+encode machinery, so they pay 2.3×–4.0× the byte cost even when only probing.

**Critically, none of this is visible in the shard's measured benchmark.** The runner's `runSample` closure (`src/core/runner.ts:1120-1158`) populates `ctx.ops`, `bytesOut`, `packets`, `seeks`, `frames` — **but never `ctx.bundleSizeKb`**. There is no `fetch('results/bundle-sizes.json')`, no `window.__BUNDLE_SIZES__` read, and no `sample.bundleSizeKb = ...` anywhere in `src/` or `app/` (grep confirms zero hits outside the *type declaration* `src/core/scenario.ts:244` and the bench-map alias `src/core/bench.ts:48`). The two-line injection the scenario notes promise (index.ts:200-213, "lives in app/main.ts + core/runner.ts, which this file may not edit") was **never wired**. Result: `bench.bundleSize.median = 0, n = 0` for all 7 — exactly the "honest NA→no number" the notes anticipated, surfaced here as a PASS only because the *probe* oracle passes.

So mp4box "wins" only by importing the **offline** producer file `results/bundle-sizes.json` (written by `scripts/measure-bundles.mjs`) as an external ranking source. The probe oracle (`goldenMetadata`, `src/core/oracles.ts:593-657`) genuinely validates `ctx.metadata` against `fixtures/golden/tiny_h264_360p_2s.mp4.meta.json` (container=`mp4`, video `h264 640×360 @30fps`, audio `aac 48000Hz/2ch`, duration 2 s within ±0.041667 s), and every engine reports `durationDeltaSec=0` — a real, plausible, strict-band metadata match. That oracle is correct and meaningful *for a probe*, but it is **the wrong gate for a bundle-size scenario**: it certifies that the engine can probe a tiny MP4, which says nothing about its shipped size. The headline metric is therefore unverified by the gate that actually fired.

## What each other framework did wrong

(None FAILed or went NA — all 7 PASS the probe. The "wrong" here is the bundle-size gap on the *offline* file, which is the metric's intended axis.)

- **web-demuxer@4.0.0** — PASS, runner-up. Offline bundle 43.2 kB vs mp4box 41.3 kB → 1.05× larger (4.4%). Loses on raw shipped bytes; carries a wasm demux bridge surface beyond pure box-walking.
- **remotion-media-parser@4.0.479** — PASS. Offline 72.6 kB → 1.76× mp4box. Larger multi-container streaming parser (`backend:"cpu-js"`, `fieldsTier:"metadata-only"`); more code shipped for the same probe.
- **remotion-webcodecs@4.0.479** — PASS. Offline 94 kB → 2.28× mp4box. Bundles WebCodecs convert/extract pipeline (`streaming-backpressure`, `bufferWriter`) it does not need for a probe.
- **mediabunny@1.48.0** — PASS. Offline 165.2 kB → **4.00× mp4box**, the largest real bundle. Full pure-TS demux+decode+encode + canvas pool (`coreBuild:"pure-ts-esm"`, `canvasPoolSize:4`); heaviest shipped JS.
- **ffmpeg.wasm@0.12.15** — PASS. Offline 1.4 kB is a **measurement artifact**: counts only the JS loader shim, not the multi-MB `ffmpeg-core.wasm` it fetches at runtime. Treating it as smallest would be a false win; excluded.
- **platform@chrome-149** — PASS. Offline 0 kB *by definition* (built-in WebCodecs/`<video>`, nothing shipped). Not a library, so excluded from the "smallest shipped library" ranking; would otherwise trivially win.

## Anti-cheat validation

- **Scenario:** `src/scenarios/performance/index.ts:220-248` (id `'performance/bundle-size'`, op `probe`, oracle `golden-metadata`, primaryMetric `bundleSize`). Rationale documented at index.ts:166-217 and `_shared.ts:31-35`.
- **Fixture exists:** `fixtures/media/tiny_h264_360p_2s.mp4` — REAL, 173 KB, present on disk. Golden present: `fixtures/golden/tiny_h264_360p_2s.mp4.meta.json` (426 B, real h264+aac metadata). Input is genuine media, not synthetic/empty/mock. ✓
- **Oracle:** `goldenMetadata`, `src/core/oracles.ts:593-657` — performs a REAL comparison: container, ±tolerance duration, per-track codec/dims/fps/sampleRate/channels against the golden. Not trivially satisfiable for a probe. ✓ for what it gates.
- **Winner adapter:** `src/engines/mp4box` (`backend:"pure-js"`, env.configUsed). Probe is genuinely implemented via MP4Box box parsing; no canned output for this op. (Op correctness is real; but it is the *probe*, not the bundle-size, that is exercised.)
- **Offline producer:** `scripts/measure-bundles.mjs` → `results/bundle-sizes.json` exists (555 B) with real per-engine kB (mediabunny 165.2, mp4box 41.3, web-demuxer 43.2, remotion-media-parser 72.6, remotion-webcodecs 94, ffmpeg.wasm 1.4, platform 0).
- **Wiring gap (the core defect):** the runner **never consumes** that file. No `bundleSizeKb`, `__BUNDLE_SIZES__`, or `bundle-sizes.json` reference exists in `src/core/runner.ts` or `app/` (only the type field `src/core/scenario.ts:244` and bench alias `src/core/bench.ts:48`). Consequently `bench.bundleSize = {n:0, median:0, samples:[]}` for all 7 engines — the primaryMetric is **never populated**.
- **Cached:** **ALL 7 results have `cached:true`** ("cached previous PASS result"). Evidence is fully reused, not freshly run; staleness risk is total for this cell. Per the launcher seeding caveat, a fresh run would re-derive the same empty bench unless the injection is implemented first.

**validationVerdict: WEAK-GATE.** The scenario's *gate that actually fires* (`golden-metadata` on a tiny probe) is real and passes honestly, but it does **not** measure the headline metric. The primaryMetric `bundleSize` has zero finite samples for every engine, so the leaderboard "ranking" is not backed by any in-shard measurement — the win is reconstructed from an orphaned offline file the harness ignores. This is not a CHEAT (no faked/hardcoded output is fed into the oracle; the probe genuinely runs and the offline sizes are plausibly real), but the case is a documented "looks measured, isn't" hole: the metric the cell claims to rank by is blank. Combined with `cached:true` on all 7, confidence in any ordering is low.

## Confidence & caveats

- **Confidence: LOW.** The decisive metric is unmeasured in the shard (all `bundleSize` medians = 0, n = 0). The mp4box "win" rests on the offline `results/bundle-sizes.json`, which the runtime never reads, and the margin over web-demuxer is only 1.05× (4.4%).
- Every engine is `cached:true` → no fresh evidence; numbers may be stale.
- `ffmpeg.wasm` (1.4 kB) and `platform` (0 kB) are excluded from the meaningful ranking because their offline numbers do not represent real shipped library cost (wasm core excluded; built-in browser API respectively).
- If the documented `bundleSizeKb` injection (index.ts:200-213) is implemented, this cell would rank for real and the ordering (mp4box < web-demuxer < remotion-media-parser < remotion-webcodecs < mediabunny) should hold, since those offline numbers are physically plausible for the respective library scopes.
