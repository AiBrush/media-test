# trim/robust_inverted_range

family: trim | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4, ~31 MB, real file) | primaryMetric: n/a (no bench block emitted — robustness/graceful path) | passCount: 2 of 7

This is a ROBUSTNESS trim case: a well-formed file is fed with an illegal inverted range `startUs=8_000_000 .. endUs=2_000_000` (end < start). PASS is defined as "the op throws/returns safely within timeout, produces NO output" — i.e. the `graceful-failure` oracle, not a correctness/bit-exact gate.

## Verdict

- Best framework: **mediabunny@1.48.0** (engineId `mediabunny`).
- Contested: **yes** — 2 engines PASS (mediabunny, ffmpeg.wasm), and both satisfy the identical oracle (`graceful-failure`) with the same correctness strength.
- Decisive factor: **PERFORMANCE / rejection latency**. Correctness is a tie (both pass only the smoke-tier `graceful-failure` oracle), so the tiebreak falls to wall time. mediabunny rejected in `durationMs=10` vs ffmpeg.wasm `durationMs=112` — **~11.2x faster** to the clean reject. Mechanistically mediabunny throws on a pure synchronous numeric guard before opening the input or touching wasm; ffmpeg.wasm reaches its guard inside the wasm-backed adapter path.
- Margin over runner-up: 11.2x lower durationMs (10 ms vs 112 ms). Both results are `cached==true` and n is effectively 1 (single recorded duration, no bench median/p95), so this margin is weak evidence — see caveats.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs=10) | n/a | n/a | n/a | cached: graceful: mediabunny trim rejected invalid range 8000000..2000000us |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs=112) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: trim range is outside the supported domain |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |

No `bench{}` block is present in the shard for any engine — the robustness/graceful path records only `durationMs`, not the wall/throughput/memory/longtask metric set. Values above are taken verbatim from the shard.

## Why the winner wins (deep technical)

For an inverted-range request on a valid H.264/AAC MP4, there is nothing to decode, demux, or re-encode — the only correct behavior is to detect the degenerate range and reject cleanly without fabricating output. So the contest is not about codec/container handling at all; it is about *how early and how cheaply* each engine recognizes the illegal domain.

mediabunny's `trim` (`src/engines/mediabunny/adapter.ts:1445-1455`) performs the domain check as the very first thing it does, before opening the input:
```
if (range.startUs < 0) throw new Error(`mediabunny trim rejected negative start ${range.startUs}us`);
if (range.endUs <= range.startUs) throw new Error(`mediabunny trim rejected invalid range ${range.startUs}..${range.endUs}us`);
```
With `startUs=8_000_000, endUs=2_000_000`, the `endUs <= startUs` branch (`adapter.ts:1453`) fires synchronously. No `openInput`, no `Output`/`Conversion`, no WebCodecs configure, no buffer allocation. The runner catches the plain `Error` and routes it to `graceful-failure`, which (per `src/core/oracles.ts:2603-2609`) sees `hasGracefulSignal` true (scenario declares the `graceful-failure` oracle) and no output/metadata/demux/frames present → PASS, "operation produced no output and did not crash/hang." Because the throw happens before any I/O or wasm, the recorded latency is `durationMs=10`. The reason string in the shard ("mediabunny trim rejected invalid range 8000000..2000000us") matches the exact `adapter.ts:1454` message verbatim, confirming this is the code path that ran. The env shows the WebCodecs backend with `hwAccel: prefer-hardware`, `coopCoep: not-required`, `sharedArrayBuffer: false` — but none of that machinery is exercised here; it is short-circuited away.

ffmpeg.wasm's `trim` (`src/engines/ffmpeg-wasm/adapter.ts:2538-2561`) also rejects, but its guard sits a few checks deeper (after malformed-name, mutated-input, and finiteness checks) at `adapter.ts:2559-2560`:
```
if (range.startUs < 0 || range.endUs <= range.startUs) {
  throw new Error(`${ENGINE_ID}: trim range is outside the supported domain`);
}
```
Its shard reason ("ffmpeg.wasm@0.12.15: trim range is outside the supported domain") matches `adapter.ts:2560`. It is still a synchronous guard ahead of `writeInput`/wasm exec, so it is also correct and graceful — but the recorded `durationMs=112` is ~11.2x mediabunny's 10 ms. The single-thread wasm core (no SharedArrayBuffer) and heavier adapter setup explain the larger fixed overhead even on a path that never reaches `ffmpeg.exec`. Correctness is identical (same oracle, same "no output" verdict), so the latency gap is the only differentiator and mediabunny wins it.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but lost on performance: it reached the same graceful reject in `durationMs=112` vs mediabunny's 10 (11.2x slower). The deeper guard placement and the heavier single-thread-wasm adapter scaffolding account for the gap; correctness is a dead tie.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA — the platform/WebCodecs adapter exposes decode/encode primitives, not a packaged trim operation, so `negotiate()` (`src/core/runner.ts:119`) bails before any oracle runs.
- **mp4box@2.3.0** — NA_ENGINE: does not declare `trim`. Honest; mp4box is a parser/segmenter, not a trim engine.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare `trim`. Honest; it is a demux-only library.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare `trim`. Honest; it is a parser, not an editor.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare `trim`. Plausibly under-declared (remotion/webcodecs can re-encode), but for this robustness reject the missing declaration is consistent with the suite's capability map and is not a correctness regression.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:829-842` (`ROBUSTNESS_CASES[0]`, `id: 'robust_inverted_range'`). Range `startUs: 8_000_000, endUs: 2_000_000`, `notes: "Inverted range (end<start) on a VALID file: trim must reject cleanly (graceful), no output."`
- Fixture: `asset: 'h264_1080p_30s.mp4'` → `fixtures/media/h264_1080p_30s.mp4` exists, ~31 MB real H.264/AAC MP4 (verified via stat). Not synthetic/empty/mock — it is a genuine valid file fed with an illegal range, which is exactly the intended robustness shape.
- Oracle: `graceful-failure` at `src/core/oracles.ts:2586-2623`. It is NOT trivially satisfiable: it FAILs if the op produces output from malformed input (`oracles.ts:2614-2617`), and only PASSes when there is genuinely no output/metadata/demux/frames (`oracles.ts:2608-2609`). For this scenario the gate is correct-by-construction: an inverted range MUST yield no output, so "no output + no crash" is the right contract. It is, however, a smoke/robustness-tier gate, not a bit-exact or structural correctness gate — there is no golden comparison because there can be no legitimate output.
- Winner adapter: mediabunny `src/engines/mediabunny/adapter.ts:1453-1454` — a real synchronous range guard that throws a plain Error; no canned output, no input→output copy, no short-circuit to a golden, no swallowed error. The shard reason string matches the source message exactly.
- Cached note: mediabunny's result is `cached==true` (also ffmpeg.wasm). Both verdicts were reused from a prior run (mediabunny startedAtIso 2026-06-22T16:39, ffmpeg.wasm 2026-06-22T14:07), not freshly re-executed. Staleness risk is low for a deterministic synchronous guard, but the durationMs numbers (10 vs 112) are single cached samples and should not be over-trusted as a stable performance margin.
- Verdict: **WEAK-GATE**. The fixture is real, both implementations genuinely reject via real code paths, and the oracle is meaningful and not gameable — but the gate is `graceful-failure` (smoke/robustness tier with no golden comparison), so the PASS is real yet not a strong correctness signal. Not CHEAT: no faked output or unfailable oracle. Not SUSPECT beyond the standard cached-evidence caveat.

## Confidence & caveats

- Confidence: **high** on the verdict structure (2 honest PASS, 5 honest NA_ENGINE, both PASS code paths verified at file:line, fixture confirmed real).
- The winner margin is performance-only and rests on single cached `durationMs` samples (n≈1, no bench median/p95/mad). 10 ms vs 112 ms is directionally clear (mediabunny's guard runs before any I/O), but the precise 11.2x ratio is weak evidence and could shift on a fresh re-run.
- Correctness between the two winners is a genuine tie; if the suite weighted "earliest synchronous reject before opening input" as a robustness quality signal, mediabunny would still win, reinforcing the same outcome.
- Both winners are cached; a clean fresh run (clear raw + .browser-cache) would harden the latency numbers.
