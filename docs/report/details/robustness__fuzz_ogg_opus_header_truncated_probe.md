# robustness/fuzz_ogg_opus_header_truncated_probe

family: robustness | fixture asset: `fuzz_ogg_opus_header_truncated.ogg` (146 KB, OGG/Opus, capture-pattern + OpusHead dropped) | primaryMetric: graceful-failure (durationMs) | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (PASS).
- Contested: **yes** — two engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Both pass the *same single* oracle, `graceful-failure`, so correctness strength is identical (both correctly **reject** the malformed stream and emit no output).
- Decisive factor: **performance / cost of the rejection path**. With correctness tied, the tiebreak is wall time on the reject. mediabunny rejected in `durationMs=55`; ffmpeg.wasm in `durationMs=170`.
- Margin over runner-up: **~3.09x faster wall** on the rejection path (170/55). Secondary tiebreakers also favor mediabunny: pure-TS ESM core (`coreBuild: pure-ts-esm`), no COOP/COEP requirement (`coopCoep: not-required`, `sharedArrayBuffer: false`), versus ffmpeg.wasm's single-thread wasm whose abort path logs `Aborted()`. (Both results `cached:true`, single sample, no `bench` block — see caveats.)

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 55 ms (durationMs) | n/a | n/a | n/a | cached: graceful: Input has an unsupported or unrecognizable format. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 170 ms (durationMs) | n/a | n/a | n/a | cached: graceful: ffmpeg could not read input for probe. Log: op1.in: Invalid data found when processing input \| Aborted() |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'ogg' |
| platform@chrome-149 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'ogg' |
| web-demuxer@4.0.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'ogg' |
| remotion-media-parser@4.0.479 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'ogg' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'ogg' |

No engine reports a `bench{}` block for this scenario; `durationMs` is the only timing signal and is used as the wall proxy.

## Why the winner wins (deep technical)

This is a §A.16 robustness fuzz on an **OGG container carrying Opus** (`containersIn:['ogg']`, `audioCodecs:['opus']`, `op:'probe'`, `src/scenarios/robustness/index.ts:843`). The mutation drops the **OGG capture pattern (`OggS`) plus the OpusHead identification header** at the front of the stream. The hexdump of the fixture confirms it: the file opens mid-OpusTags with `00 14 00 00 ... "encoder=Lavc libopus"` and the first real `OggS` page header only appears at byte offset 0x1B — there is no leading `OggS`/`OpusHead`, so there is no parseable bitstream-identification page. The required behavior (scenario notes line 848-850): the probe must **reject a stream with no identifiable bitstream rather than loop scanning for a page**. The gate is `graceful-failure`.

mediabunny ran on `backend: webcodecs`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required` (`env.configUsed` in the shard). Its `probe()` is a genuine call into the library: `src/engines/mediabunny/adapter.ts:1134` opens the asset via `openInput(...)` and runs `metadataFromInput`, whose very first line is `const format = await input.getFormat()` (`adapter.ts:418`). mediabunny restricts the candidate `InputFormat` list to the asset's declared container — `ogg` maps to the `OGG` format singleton (`src/engines/mediabunny/codecs.ts:137`, `CANONICAL_TO_INPUT_FORMAT.ogg = OGG`). With the capture pattern and OpusHead stripped, mediabunny's OGG demuxer finds no valid page/identification header at the head of the stream and throws `"Input has an unsupported or unrecognizable format."` (the exact string in the shard reason). The runner catches that throw, leaves `ctx.output`/`metadata`/`demux`/`frames` undefined, and `gracefulFailure` (`src/core/oracles.ts:2607-2610`) infers a clean reject → PASS. Crucially mediabunny **fails fast on format detection** (no full-stream page scan), which is why the reject costs only 55 ms.

ffmpeg.wasm reaches the *same correctness verdict* by a different mechanism: its libavformat probe returns `Invalid data found when processing input` and the wasm module logs `Aborted()`, which the adapter surfaces as a graceful reject (`graceful-failure:pass`). But it pays 170 ms — the single-thread wasm module's demux-probe + abort/teardown is materially more expensive than mediabunny's TS format sniff. Since both pass exactly one oracle of identical strictness (robustness reject; no correctness ladder above it applies here — there is no golden to bit-compare against, the "correct" output is *no output*), the decision falls to step 4(b) PERFORMANCE: mediabunny wins by **3.09x wall** and additionally avoids any COOP/COEP/SharedArrayBuffer requirement (4(c) tiebreaker: no COOP/COEP, lighter pure-TS core vs wasm).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost. Same single oracle (`graceful-failure`), correctness tied, but 170 ms vs 55 ms = 3.09x slower on the reject path; runs as single-thread wasm with an `Aborted()` teardown, heavier than mediabunny's pure-TS format sniff.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest NA — MP4Box.js is an ISOBMFF (MP4/MOV/fragmented) parser and genuinely has no OGG demuxer; no ogg mapping in its codec table.
- **platform@chrome-149** — NA_ENGINE: does not declare ogg for this op. Honest — the platform adapter does not expose an OGG probe path through WebCodecs/MSE for this scenario.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare ogg. Honest — no ogg in its declared input containers.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare ogg. Honest — its container set for probe does not include OGG.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare ogg. Honest — same Remotion stack, no OGG input declaration.

All five NAs look honest, not under-declared: a grep across the other engines' `codecs.ts` confirms `ogg` is present only in mediabunny and ffmpeg-wasm (`src/engines/ffmpeg-wasm/codecs.ts:81`). The two that declare ogg are exactly the two that produced a result.

## Anti-cheat validation

- Scenario definition: `src/scenarios/robustness/index.ts:843-851` (`id: 'fuzz_ogg_opus_header_truncated_probe'`, `asset: 'fuzz_ogg_opus_header_truncated.ogg'`, `op: 'probe'`).
- Fixture: `fixtures/media/fuzz_ogg_opus_header_truncated.ogg` **exists**, 146 KB, real OGG/Opus bytes. Hexdump confirms the documented mutation: no leading `OggS`/`OpusHead` (file starts inside OpusTags with `"encoder=Lavc libopus"`; first `OggS` page at offset 0x1B). This is a real, deterministically-mutated corpus file, not synthetic/empty/mock.
- Oracle: `gracefulFailure` at `src/core/oracles.ts:2586-2623`. It is a real anti-garbage gate: for a robustness scenario with no `gracefulAllowOutput`, it PASSes **only** when the op produced no output (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`, line 2608), and explicitly FAILs if the op emitted output from malformed input (line 2614-2617). It is not trivially satisfiable — an engine that emitted garbage metadata/frames would FAIL. This scenario sets no `gracefulAllowOutput`, so output-absence is mandatory.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1134` (`probe()`) → `metadataFromInput` → `input.getFormat()` (`adapter.ts:418`). Genuine library call; the throw originates from mediabunny's OGG format detection, not from canned/hardcoded output or a short-circuit to a golden. No error-swallowing: the adapter lets the throw propagate; the runner records the reject.
- Verdict: **REAL**. Real mutated fixture + genuine library probe + a meaningful output-absence oracle. One nuance: the gate is the robustness "reject" oracle (single oracle), so the PASS is a real *robustness* pass, not a positive-correctness/bit-exact pass — appropriate for a fuzz scenario whose correct output is no output.
- Cached note: both PASS results are `cached:true` (mediabunny startedAt 2026-06-22T17:04, ffmpeg.wasm 2026-06-22T14:03). Evidence was reused, not re-run this cycle; staleness risk is low (deterministic fixture + deterministic reject) but the 55 ms / 170 ms timings are from cached single-sample runs.

## Confidence & caveats

- Confidence: **high** on the winner choice. Correctness is genuinely tied (one identical oracle), and the performance margin is unambiguous (3.09x).
- Caveat 1: the timing margin rests on `durationMs` only — there is no `bench{}` block, so `n=1`, no mad/p95 spread. A 55-vs-170 ms gap is large enough to be decisive even for a single sample, but it is single-sample evidence.
- Caveat 2: both winners are `cached:true`; numbers are reused. A fresh re-run is advisable per the launcher seeding caveat (clear raw + .browser-cache for an honest re-measure).
- Caveat 3: this is a robustness reject gate, so "best" means "rejected malformed input fastest and cleanest," not "decoded most accurately." No positive-correctness ladder applies here.
