# demux/graceful_zero_length

family: demux | fixture asset: `fixtures/media/zero_length.mp4` (0 bytes, real file) | primaryMetric: wall (only `durationMs` recorded; `bench{}` not populated) | passCount: 6 / 7

## Verdict

**Best framework: remotion-webcodecs@4.0.479** — but the win is **CONTESTED** and effectively a tie. Six engines all satisfy the single gating oracle (`graceful-failure`) identically; correctness strength is *equal across all six* (one and the same proxy/robustness oracle, no bit-exact / structural ladder applies here). The decision therefore falls to performance, and the only performance signal present in the shard is `durationMs` (no `bench{}` block, no `throughputRealtime`/`peakMemory`/`longtasks` values were emitted).

- Decisive factor: lowest `durationMs` among PASS engines.
- Margin over runner-up: remotion-webcodecs **9 ms** vs mediabunny **10 ms** = **1.11x** faster wall. This is a razor-thin, single-sample (n implied = 1, all results `cached==true`) margin and is **not** strong evidence of a real performance difference — at 9–10 ms the measurement is dominated by the HTTP 416 round-trip plus fetch teardown, i.e. timing noise. Treat remotion-webcodecs and mediabunny as a statistical tie.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 9 | n/a | n/a | n/a | graceful: Server returned status code 416 for .../zero_length.mp4 and range 0 |
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 10 | n/a | n/a | n/a | graceful: Error fetching .../zero_length.mp4: 416 Range Not Satisfiable |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:pass | 12 | n/a | n/a | n/a | graceful: Server returned status code 416 ... and range 0 |
| mp4box@2.3.0 | PASS | graceful-failure:pass | 18 | n/a | n/a | n/a | graceful: mp4box: moov not found (not an ISO-BMFF/MP4 file, or moov truncated) |
| web-demuxer@4.0.0 | PASS | graceful-failure:pass | 35 | n/a | n/a | n/a | graceful: get_media_info failed: undefined |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 147 | n/a | n/a | n/a | graceful: demux failed to open input (framecrc exit 1). Log: op1.in: Invalid data found ... \| Aborted() |
| platform@chrome-149 | NA_ENGINE | (none) | 22 | n/a | n/a | n/a | platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV |

## Why the winner wins (deep technical)

This scenario is a **negative test**: the input is a genuinely empty (0-byte) MP4 (`zero_length.mp4`). There is no `ftyp`, no `moov`, no `mdat`, no bytes at all. The only correct behaviour for any demuxer is to **reject cleanly within the 15 s timeout** (`GRACEFUL_TIMEOUT_MS = 15_000`, `src/scenarios/demux/index.ts:424`) without hanging, crashing, or fabricating a packet table. Because correctness here is binary "did it throw/reject cleanly", all six PASS engines are *equally correct*; there is no bit-exact, structural, or perceptual ladder to separate them. So the "win" reduces to which engine detected the empty file and unwound fastest.

remotion-webcodecs reaches its clean rejection by attempting a real read of the asset and propagating the transport-layer error. Its adapter declares HTTP-range fast paths (`env.configUsed.adapterFastPaths`: `"mp4-sample-table:http-range for selected large/progressive MP4/MOV demux rows"`, implemented in `src/engines/remotion-webcodecs/mp4-sample-table.ts` and `adapter.ts`). For a 0-byte file, the very first ranged GET (`bytes=0-…`) against the Vite dev server cannot be satisfied, so the server answers **HTTP 416 Range Not Satisfiable** — exactly the recorded reason: *"Server returned status code 416 for http://localhost:5173/fixtures/media/zero_length.mp4 and range 0"*. The fetch helper throws on the 416 status, the parse never even reaches box parsing, and the operation unwinds in **9 ms**. No output (`ctx.output`/`metadata`/`demux`/`frames` all undefined) → the `graceful-failure` oracle's no-output branch fires PASS (`src/core/oracles.ts:2607-2610`).

mediabunny takes the same shape: `openInput()` builds `new mb.Input({ source: new mb.UrlSource(input.url), … })` (`src/engines/mediabunny/adapter.ts:245-279`), and `UrlSource` issues range reads to populate headers/sample data (`adapter.ts:237-241` comment). The 0-byte file yields the same 416; mediabunny surfaces it as *"Error fetching …: 416 Range Not Satisfiable"* and unwinds in **10 ms**. The 1 ms / 1.11x gap to the winner is below any meaningful resolution at this scale and across cached single samples — mechanistically the two engines do the *same* thing (range GET → 416 → throw).

The reason the slower PASS engines are slower is also mechanistic and informative:
- **mp4box (18 ms)** does **not** range-read (`env.configUsed.rangeReads:false`, `pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"`). It fetches the whole (empty) body, appends 0 bytes to its `MP4BoxBuffer`, runs its ISO-BMFF box scanner, finds no `moov`, and reports *"moov not found (not an ISO-BMFF/MP4 file, or moov truncated)"*. That is a real parser verdict rather than a transport error, hence a few ms more work.
- **web-demuxer (35 ms)** boots its wasm `get_media_info` path which returns *undefined* on the empty input — heavier startup than a pure-JS throw.
- **ffmpeg.wasm (147 ms, 16.3x slower than the winner)** must spin up the emscripten module and run a `framecrc` demux; libavformat probes the empty input, returns *"Invalid data found when processing input"*, and the process aborts (`Aborted()`, framecrc exit 1). The wasm cold path dominates — correct, but by far the most expensive way to discover the file is empty.

In short: the winner is fastest because it fails at the *transport* layer (416 on the first ranged byte) instead of at the parser or wasm layer, but this advantage is shared with mediabunny and is sub-millisecond-meaningful.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on the tiebreak only: 10 ms vs 9 ms (0.90x the winner's speed, 1 ms gap). Same transport-layer 416 rejection mechanism; the gap is noise across cached single samples. Not a substantive defect.
- **remotion-media-parser@4.0.479** — PASS, 12 ms (1.33x slower). Same 416 transport rejection; marginally slower teardown. No defect.
- **mp4box@2.3.0** — PASS, 18 ms (2.0x slower). Whole-file-append pipeline with `rangeReads:false` means it downloads the (empty) body and runs the box scanner before concluding "moov not found", a slightly longer path than a 416 short-circuit. Correct, just not range-optimised.
- **web-demuxer@4.0.0** — PASS, 35 ms (3.9x slower). wasm `get_media_info` startup cost; returns undefined on empty input. Correct but heavier.
- **ffmpeg.wasm@0.12.15** — PASS, 147 ms (16.3x slower). Full emscripten + libavformat probe of the empty file ("Invalid data found", Aborted()). Correct rejection but by far the costliest path.
- **platform@chrome-149** — **NA_ENGINE** (not a PASS). Reason: *"raw platform demux only supports progressive MP4/MOV and WebM/MKV"*. This NA looks **honest**: the platform path has no standalone demuxer API — demuxing rides on `<video>`/WebCodecs decode, so a pure "demux this container and reject" operation is genuinely not declared for it. It is correctly excluded from contention rather than under-declared (the engine has no demux op to expose here).

## Anti-cheat validation

- **Scenario**: `src/scenarios/demux/index.ts:436-444` defines `graceful_zero_length` → `asset: 'zero_length.mp4'`, `container: 'mp4'`, `oracles: ['graceful-failure']`, `timeoutMs: 15_000`. Notes (`:441-443`) state the rationale: "Zero-length container fed to demux … must reject/handle cleanly (throw/reject) within the timeout — never hang or crash."
- **Fixture**: `fixtures/media/zero_length.mp4` exists and is **0 bytes** (verified via `stat`/`ls`). For this negative test, an empty file is the *correct and intended* input (it is not a missing/mock fixture standing in for real media — emptiness is the test condition).
- **Oracle**: `gracefulFailure` at `src/core/oracles.ts:2586-2623`. It is a real, non-trivial gate for THIS scenario: with no `signal:` marker in the notes (plain prose is intentionally ignored, `:2578-2579`), it falls to the inference branch (`:2602-2618`). PASS requires **no output of any kind** (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`, `:2608`); critically, if the input is malformed and the engine *did* produce output, the oracle returns **FAIL** ("operation produced output from malformed/mutated input", `:2614-2617`). So it can fail — an engine that fabricated a packet table from an empty file would be caught. The recorded reasons are physically plausible for a 0-byte MP4: a 416 on the first range read (range-reading engines), "moov not found" (whole-file mp4box), and libavformat "Invalid data found" / Aborted (ffmpeg.wasm).
- **Winner adapter**: remotion-webcodecs `src/engines/remotion-webcodecs/adapter.ts` + `mp4-sample-table.ts` (http-range demux fast path declared in `env.configUsed.adapterFastPaths`). It genuinely fetches the asset and propagates the 416; it does **not** return canned output, copy input→output, short-circuit to a golden, or swallow the error as success. (Cross-checked the sibling mediabunny adapter at `adapter.ts:245-279`, which uses the real `mb.Input`/`mb.UrlSource` library path and the identical 416 mechanism.)
- **Verdict: WEAK-GATE.** The implementations and fixture are real and the oracle can genuinely fail, so this is not a CHEAT. But the gate is a single robustness/proxy oracle (binary "rejected cleanly"), not a correctness ladder (no bit-exact/structural/perceptual comparison applies to an empty file). The PASS is real but weak, and the winner is separated from the runner-up only by a 1 ms cached-single-sample margin. Additionally, several "rejections" are detected at the **transport layer (HTTP 416)** rather than inside the demuxer itself — i.e. the dev server, not the library, is what refuses the empty file for the range-reading engines — which further weakens the gate as a test of library-side robustness.
- **Cached note**: ALL seven results have `cached==true`. None was re-run in this batch; the wall numbers are reused. The performance tiebreak (9 vs 10 ms) therefore carries **staleness risk** and should not be read as a fresh measurement.

## Confidence & caveats

- Confidence: **medium**. The PASS/NA classification, the fixture reality, and the oracle's non-triviality are solid (verified against source and a 0-byte fixture). The *ranking* among the six PASS engines is low-confidence: it rests entirely on `durationMs` (no `bench{}` was emitted), the top two differ by 1 ms, and every result is cached (single sample, no mad/p95 spread).
- The winner could equally be called mediabunny; remotion-webcodecs is named only because its `durationMs` is numerically lowest. For any practical purpose they are tied.
- Caveat: for the range-reading engines the rejection is enforced by the server's HTTP 416, not by the demux library parsing zero bytes — so this scenario partly tests the harness/transport rather than pure library robustness.
- platform's NA is honest (no standalone demux op), not an under-declared capability.
