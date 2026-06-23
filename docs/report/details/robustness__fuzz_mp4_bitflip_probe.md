# robustness/fuzz_mp4_bitflip_probe

family: robustness | fixture asset: `fuzz_mp4_bitflip.mp4` (real, 31MB in fixtures/media/) | primaryMetric: durationMs (no bench block emitted for robustness pillar) | passCount: 7 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (PASS).
- Contested: **YES** — all 7 engines PASS the single declared oracle `graceful-failure`, so correctness is a perfect tie. The decision falls entirely to performance.
- Decisive factor: **wall time (durationMs)**. mediabunny completed the probe of the bit-flipped MP4 in **7ms**, the fastest of the field.
- Margin over runner-up: vs remotion-media-parser (10ms) = **1.43x faster**; vs remotion-webcodecs (22ms) = 3.1x; vs web-demuxer (68ms) = 9.7x; vs mp4box (73ms) = 10.4x; vs platform (123ms) = 17.6x; vs ffmpeg.wasm (264ms) = 37.7x.
- Evidence strength caveat: the margin is on a single sample (n=1, durationMs only; no median/p95/mad emitted) and every result is `cached==true`. The 7ms-vs-10ms gap is within plausible scheduling noise, so the win is REAL but weakly separated from remotion-media-parser.

## Per-engine results

All engines passed exactly one oracle: `graceful-failure`. No bench block is emitted for this robustness scenario, so throughputRealtime / peakMemory / longtasks are not measured (n/a). The comparable performance number is `durationMs`.

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | **7ms** | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:pass | 10ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 22ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | graceful-failure:pass | 68ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | graceful-failure:pass | 73ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | graceful-failure:pass | 123ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 264ms | n/a | n/a | n/a | cached previous PASS result |

## Why the winner wins (deep technical)

The operation under test is `op: 'probe'` (scenario `src/scenarios/robustness/index.ts:246-252`) against `fuzz_mp4_bitflip.mp4`: an ISO-BMFF/MP4 container (faststart H.264-class asset) into which the fixture pipeline injected 128 random bit-flips scattered across the file. A probe must walk the box tree (`ftyp`/`moov`/`mvhd`/`trak`/`mdia`/`stbl` sample tables) and return container/track metadata. Because the flips can corrupt box sizes, sample-table entries, or codec-config payloads, a brittle parser can read out of bounds, loop on a bogus box length, or exhaust memory. The scenario note states the contract precisely: "128 random bit-flips across an MP4; probe must reject or report degraded, never fault."

The gating oracle `graceful-failure` (`src/core/oracles.ts:2586-2623`) encodes that contract as a smoke-level robustness gate. With this scenario's `options.gracefulAllowOutput: true`, `gracefulAllowsReturnedOutput` (`src/core/oracles.ts:2625-2628`) returns true, so the oracle PASSes on EITHER of two outcomes: (a) the engine threw/rejected cleanly within the timeout (no output → `src/core/oracles.ts:2609`), or (b) the engine returned partial/safe metadata without crashing (`src/core/oracles.ts:2611-2612`). The only failure modes are timeout/crash/hang (mapped at `src/core/runner.ts:1035-1045`). Every engine shipped a metadata object within its timeout, so all 7 satisfy the gate identically. There is no correctness differentiation available — the oracle does not compare against a golden, does not check field accuracy, and does not require a throw. Per the decision ladder, when correctness is comparable the verdict is performance, and mediabunny is fastest.

Mechanistically, mediabunny wins this probe for the same structural reason it wins the rest of the probe family: its adapter `probe()` (`src/engines/mediabunny/adapter.ts:1134-1141`) opens the input via `openInput` and reads metadata through `metadataFromInput`, which lazily reads only the header/`moov` boxes it needs and disposes immediately (`finally { mbInput.dispose() }` at line 1138-1139). The engine config (`env.configUsed`) is `backend: webcodecs`, `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required` — a pure-TypeScript box parser with no wasm module to instantiate and no worker spin-up. A probe never reaches the WebCodecs decode path, so the codec backend is irrelevant here; the cost is pure container parsing in JS. That is why mediabunny (7ms) and remotion-media-parser (10ms, `backend: cpu-js`, `fieldsTier: metadata-only`) — both lightweight JS metadata readers — sit far below the wasm/recorder-based engines. On a bit-flipped file the parser still only touches the box scaffolding to produce degraded metadata, so the corruption does not change the dominant cost.

The slow tail is explained by per-engine fixed costs that dwarf 7ms of parsing: ffmpeg.wasm (264ms) pays wasm module + `ffprobe`-equivalent invocation overhead; platform@chrome-149 (123ms) routes through a heavier `<video>`/WebCodecs-oriented harness; mp4box (73ms, `pure-js`, `whole-file-append(MP4BoxBuffer+fileStart)`) appends the whole buffer before it can answer; web-demuxer (68ms) carries a wasm demuxer init.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on performance only. 10ms vs 7ms = 1.43x slower. Within noise on n=1; the closest competitor and the only one whose loss is not clearly real.
- **remotion-webcodecs@4.0.479** — PASS, lost on performance. 22ms = 3.1x slower than mediabunny; heavier streaming/WebCodecs-oriented harness for what is a metadata-only probe.
- **web-demuxer@4.0.0** — PASS, lost on performance. 68ms = 9.7x slower; wasm demuxer initialization overhead on a probe that needs no demux.
- **mp4box@2.3.0** — PASS, lost on performance. 73ms = 10.4x slower; `whole-file-append(MP4BoxBuffer+fileStart)` buffers the entire input before parsing (`rangeReads: false`), inflating wall time on a 31MB file.
- **platform@chrome-149** — PASS, lost on performance. 123ms = 17.6x slower; the platform path is built around `VideoDecoder`/`<video>` and is poorly suited to a pure metadata probe.
- **ffmpeg.wasm@0.12.15** — PASS, lost on performance. 264ms = 37.7x slower; single-thread wasm module load + process-style invocation is the dominant cost. Slowest in the field.

No engine returned NA and none FAILed — there is no honest-vs-under-declared-capability question here; the operation (`probe`) is universally implemented and all 7 declared it.

## Anti-cheat validation

- Scenario definition: `src/scenarios/robustness/index.ts:246-252` — `id: 'fuzz_mp4_bitflip_probe'`, `asset: 'fuzz_mp4_bitflip.mp4'`, `op: 'probe'`, `containersIn: ['mp4']`, `options: { gracefulAllowOutput: true }`, note: "128 random bit-flips across an MP4; probe must reject or report degraded, never fault."
- Fixture: `fixtures/media/fuzz_mp4_bitflip.mp4` EXISTS, 31MB — a real MP4 derivative, not synthetic/empty/mock. (The note token-trap discussion at `src/scenarios/robustness/index.ts:259-263` shows the suite authors deliberately avoid prose tokens that would short-circuit the oracle; this scenario's note contains no `signal:` marker, so the verdict rests on output/timeout inference, not prose.)
- Oracle: `graceful-failure` at `src/core/oracles.ts:2586-2623`; `gracefulAllowsReturnedOutput` at `src/core/oracles.ts:2625-2628`. Runner robustness path: `src/core/runner.ts:1011-1068`.
- Winner adapter: mediabunny `probe()` at `src/engines/mediabunny/adapter.ts:1134-1141` — genuinely opens the input and reads metadata via the real mediabunny library (`openInput` + `metadataFromInput`), disposes in `finally`. No canned output, no copy-input, no golden short-circuit, no error swallowing that fakes success (a throw would route through the runner as a graceful-failure PASS anyway).
- Verdict: **WEAK-GATE**. The fixture is real and the implementation is genuine, but the only gate is `graceful-failure` with `gracefulAllowOutput: true` — a smoke-level robustness check that PASSes on ANY non-crashing outcome (throw OR partial output) and performs NO comparison against goldens, no metadata-accuracy check, and does not even require the engine to detect the corruption. The PASS is real (the engines genuinely did not fault on a bit-flipped MP4) but it is the weakest oracle on the ladder, so it does not certify correct degraded metadata — only "did not crash/hang." The winner is then chosen on a single-sample wall-time number.
- Cached note: ALL 7 results have `cached==true` (reasons: "cached previous PASS result"); these were reused, not re-run, so the durationMs values carry staleness risk and the 7ms-vs-10ms head-to-head is not freshly reproduced.

## Confidence & caveats

- Confidence: **medium**. The fixture and winner implementation are verified real, and mediabunny is consistent with its dominance across the probe family. But: (1) the gate is smoke-only (WEAK-GATE); (2) the win is on durationMs with n==1, no median/p95/mad, so the 1.43x margin over remotion-media-parser is within scheduling noise; (3) every result is cached. If a fresh run is needed for an honest head-to-head, clear the raw + .browser-cache (per the launcher-seeding caveat) and re-run the robustness pillar.
- The robustness pillar emits no bench block, so peakMemory/throughput/longtasks comparisons are unavailable — a graceful-failure scenario cannot distinguish engines on memory-bounded handling of corruption, only on wall time and crash/hang.
