# robustness/edge_vfr_probe

- family: robustness
- fixture asset(s): `fixtures/media/h264_vfr.mp4` (real, 2.3 MB) — H.264 video + AAC audio in an MP4 (faststart, `major_brand=isom`)
- golden: `fixtures/golden/h264_vfr.mp4.meta.json` (container=mp4, durationSec=12.533, video h264 1280x720 @ fps=8.856, audio aac 48000/2)
- op: `probe` (metadata read only — no decode/remux output)
- oracle(s): `golden-metadata` (single oracle; structural/metadata-exact tier)
- primaryMetric: wall (probe latency, reported as `durationMs`; no `bench{}` block emitted for this probe row)
- passCount: 7 / 7

## Verdict

- Best framework: **remotion-media-parser@4.0.479** (engineId `remotion-media-parser@4.0.479`).
- CONTESTED: all 7 engines PASS the single `golden-metadata` oracle, every one of them matching the golden VFR duration/fps/track layout within tolerance. Correctness is a flat tie, so **performance is the decisive factor**.
- Decisive factor: probe latency. remotion-media-parser probes the VFR MP4 in **7 ms** vs the runner-up mediabunny at 11 ms — **~1.57x faster wall**, and far ahead of the heavyweights (ffmpeg.wasm 284 ms = ~40x slower).
- Margin over runner-up: 7 ms vs 11 ms (1.57x). Caveat: every row is `cached:true` and timing is effectively n==1 per engine, so this is a soft margin (see Confidence).

## Per-engine results

All 7 engines PASS the same single oracle `golden-metadata` (2 tracks matched). No `throughputRealtime`, `peakMemory`, or `longtasks` were emitted for these probe rows; the only timing signal is `durationMs` (probe wall) and the oracle's `durationDeltaSec` against a `durationToleranceSec` of 0.04167 s (±1 frame).

| engine | status | oracles passed | wall (durationMs) | durationDeltaSec | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 7 | 0.001000 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 11 | 0.000333 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 14 | 0.000333 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 23 | 0.001000 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 27 | 0.001000 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 102 | 0.000333 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 284 | 0.003000 | n/a | n/a | n/a | cached previous PASS result |

## Why the winner wins (deep technical)

The operation under test is a **probe of a variable-frame-rate H.264/MP4**. The robustness angle (scenario `notes`: "VFR duration/fps reporting under non-uniform timestamps", `src/scenarios/robustness/index.ts:59-68`) is that with non-uniform inter-frame deltas, an engine cannot just read a single `mvhd` field and call it fps — the average frame rate (8.856 fps for this clip vs the 720p/30-ish nominal it looks like) must be derived consistently. The `golden-metadata` oracle (`src/core/oracles.ts:595-657`) checks container token, duration within a strict ±1-frame band (here `durationToleranceSec=0.04167 s`, because MP4 carries a precise `mvhd` movie duration and is NOT in the loose set `LOOSE_DURATION_CONTAINERS`, `oracles.ts:211`), plus per-track codec/dims/fps/sampleRate/channels (`compareTrack`, `oracles.ts:659-682`, fps compared with `fpsTolerance=0.1` from the scenario). Every engine cleared all of these, so the gate is a tie and the comparison falls to latency.

remotion-media-parser wins on latency because of *what it chooses to read*. Its `probe()` (`src/engines/remotion-media-parser/adapter.ts:348-417`) requests the minimal `metadata-only` field set from the real `parseMedia()` — `durationInSeconds`, `container`, `tracks`, `metadata`, `rotation`, and `fps` only when the container header doesn't already expose it (`adapter.ts:374-383`). For a faststart MP4 the `moov` box sits at the front, so the parser reads the `mvhd` movie duration and the `stts`/`mdhd` timescale data and computes an average fps without ever touching the `mdat` payload. Critically, it has a VFR-aware escalation ladder: if the header fps is missing or implausible it falls back to header fps (`adapter.ts:403-405`) and only as a last resort triggers a `slowFps` full parse (`adapter.ts:407-416`) that walks sample timestamps. For this fixture the cheap path sufficed, yielding fps=8.856 with `durationDeltaSec=0.001 s` (well inside the 0.04167 s band) at **7 ms**. The backend is `cpu-js` / `fieldsTier: metadata-only` (env.configUsed), i.e. a pure-JS streaming reader that stops as soon as the requested fields resolve — no WebCodecs init, no wasm module instantiation, no `mdat` scan.

The runner-up **mediabunny (11 ms, 1.57x slower)** is also a clean header probe (env.configUsed `coreBuild:pure-ts-esm`, `coopCoep:not-required`) and actually reports the *tightest* duration delta (0.000333 s), but pays a slightly higher fixed cost to spin up its `webcodecs`/`VideoSample` pipeline scaffolding even for a metadata-only op. Correctness is identical, so it loses purely on wall time. **platform (14 ms)** uses the Chrome `VideoDecoder` WebCodecs backend; for a pure probe the hardware decode path is dead weight, and its delta also lands at 0.000333 s. The structural losers are the demux-heavy engines: **web-demuxer (102 ms)** and especially **ffmpeg.wasm (284 ms, ~40x the winner)** must instantiate a wasm module (single-thread, `wasmThreads:0`) and run a fuller container parse before they can answer duration/fps — correct, but enormously more expensive for a question that only needs the `moov` header.

In short: for a header-resolvable VFR MP4 probe, the winner is the engine that reads the *fewest bytes with the lowest fixed startup cost* and still derives the average fps correctly. remotion-media-parser's metadata-only field selection plus pure-JS streaming reader is the minimal-work path, and that is the entire margin.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on performance only: 11 ms vs 7 ms (0.64x the speed / 1.57x slower). Tightest duration delta (0.000333 s) but higher fixed pipeline cost. Not a correctness loss.
- **platform@chrome-149** — PASS, lost on performance: 14 ms (2.0x slower than winner). WebCodecs `VideoDecoder` backend is unnecessary overhead for a metadata-only probe.
- **mp4box@2.3.0** — PASS, lost on performance: 23 ms (3.3x slower). `whole-file-append(MP4BoxBuffer+fileStart)` pipeline with `rangeReads:false` buffers more of the file than the winner needs for the header.
- **remotion-webcodecs@4.0.479** — PASS, lost on performance: 27 ms (3.9x slower). Carries the WebCodecs convert pipeline scaffolding; for probe it is heavier than its sibling media-parser's metadata-only path.
- **web-demuxer@4.0.0** — PASS, lost on performance: 102 ms (14.6x slower). wasm demuxer instantiation + container walk dominates a probe.
- **ffmpeg.wasm@0.12.15** — PASS, lost on performance: 284 ms (40.6x slower). Single-thread wasm core (`wasmThreads:0`) startup + full parse; correct (delta 0.003 s) but by far the slowest. Largest bundle / heaviest init.

## Anti-cheat validation

- Scenario definition: `src/scenarios/robustness/index.ts:59-68` — `id:'edge_vfr_probe'`, `op:'probe'`, `asset:'h264_vfr.mp4'`, `oracles:['golden-metadata']`, `tolerances:{fpsTolerance:0.1}`, notes "VFR duration/fps reporting under non-uniform timestamps."
- Fixture exists and is real: `fixtures/media/h264_vfr.mp4` = 2.3 MB on disk (not synthetic/empty/mock). Golden `fixtures/golden/h264_vfr.mp4.meta.json` present with physically plausible VFR values (durationSec=12.533, fps=8.856 — a non-integer average consistent with variable timestamps; 1280x720 h264 + 48 kHz stereo aac).
- Oracle: `src/core/oracles.ts:595-657` (`goldenMetadata`) performs a REAL field-by-field comparison against the golden meta — container token, duration within a strict ±1-frame band for MP4 (precise container, `oracles.ts:211`/`246-253`), and per-track codec/dims/fps (`fpsTolerance` 0.1) via `compareTrack` (`oracles.ts:659-682`). It is NOT a smoke gate and NOT trivially wide: the 0.04167 s duration band would reject a >1-frame VFR mis-estimate, and the measured deltas (0.000333–0.003 s) sit ~14x to ~125x inside it, which is the expected agreement of two correct demuxers, not an artifact of a loose tolerance.
- Winner adapter: `src/engines/remotion-media-parser/adapter.ts:348-417` (`probe`). Calls the real `parseMedia()` (imported `adapter.ts:70`) with a genuine metadata field set and a VFR-aware fps fallback ladder (`adapter.ts:403-416`). No canned output, no copy of input→golden, no error swallowing — corrupted inputs are deliberately fed through so the parser throws cleanly (`adapter.ts:10-31` doc / capabilities declare only `probe`+`demux`).
- Verdict: **WEAK-GATE**. The implementation, fixture, and oracle are all real (a true REAL on those axes), but the scenario gates on a *single metadata-exact oracle* for a probe, which is one rung below bit-exact/structural-packet correctness on the ladder. More importantly the *winner is decided by performance*, and every result row is `cached:true` with a single timing sample, so the 1.57x latency margin is real but soft evidence rather than a hardened re-run.
- Cached note: ALL 7 rows have `cached:true` ("cached previous PASS result"). Timings (7/11/14/23/27/102/284 ms) were reused, not freshly measured; staleness/ordering risk applies to the latency ranking specifically.

## Confidence & caveats

- Confidence: **medium**. The PASS/FAIL outcome is unambiguous and well-gated (real fixture, real parseMedia probe, meaningful ±1-frame duration check). The *winner selection* is less firm: correctness is a 7-way tie, so the decision rests entirely on probe latency, and that latency comes from cached, single-sample rows with no `mad`/`p95`/`n` spread to confirm stability.
- The 7 ms vs 11 ms gap (1.57x) is small enough that a fresh re-run could re-order the top three (remotion-media-parser, mediabunny, platform are all within ~7 ms). The large-margin claims against web-demuxer (14.6x) and ffmpeg.wasm (40.6x) are robust regardless of sampling noise because they reflect wasm/demux startup cost, not measurement jitter.
- mediabunny is the strongest *correctness* candidate (smallest duration delta, 0.000333 s) and would be the pick if performance were a wash; the only reason it loses is the 4 ms latency gap.
- No `bench{}`, `throughputRealtime`, `peakMemory`, or `longtasks` were present in this probe shard; ranking used `durationMs` as the sole performance signal per the decision procedure's fallback.
