# trim/robust_end_far_past_eof

family: trim | fixture asset: `h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4, ~30 s, 31 MB) | primaryMetric: (none — robustness gate, `metrics:['wall','peakMemory']` declared but never benched) | passCount: 2 / 7

Trim range requested: `startUs=50_000_000` (50 s) .. `endUs=9_999_000_000` (~2.78 h) on a 30 s file. The entire range lies past EOF (start ≥ duration), so the only correct behavior is a clean reject with no output, no hang, no OOM. Single declared oracle: `graceful-failure`.

## Verdict

- Best framework: **mediabunny@1.48.0** (PASS).
- Contested: **YES** — two engines PASS (mediabunny, ffmpeg.wasm). Both satisfy the identical and only oracle (`graceful-failure`), so correctness strength is a tie at the weakest rung of the ladder (smoke/robustness gate). Decision falls to the performance tiebreaker.
- Decisive factor: **wall-time-to-reject** (the only numeric signal present, `durationMs`). mediabunny rejected in **124 ms** vs ffmpeg.wasm **273 ms** → **2.20x faster**. Secondary tiebreakers all favor mediabunny: pure-TS ESM core (no wasm compile, no COOP/COEP/SharedArrayBuffer), streaming demux that fails at the first sink read rather than after a full `ffprobe`-style log parse.
- Margin over runner-up: 273 / 124 = **2.20x faster to reject** (caveat: robustness path is never benched, so n is effectively 1 per engine and durationMs is a coarse single-shot proxy, not a median over samples).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (not benched; durationMs=124) | n/a | n/a | n/a | cached: graceful: startSample out of range. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (not benched; durationMs=273) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: trim start is past end-of-file |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

(No `bench{}` block exists for either passing engine: the robustness path in `runRobustness` never invokes the benchmark protocol — see `src/core/runner.ts:1093` "Robustness never benches". `durationMs` from the shard is the only timing signal.)

## Why the winner wins (deep technical)

This scenario is not a transcode/remux competition — it is a robustness gate. The container is MP4 with an H.264 video track and an AAC audio track, and the trim window `[50 s, ~9999 s]` begins past the file's ~30 s duration. There are zero coded samples whose presentation interval intersects the requested range. A correct engine must detect this and throw/reject cleanly; an incorrect engine would hang scanning to "EOF" at 2.78 h, allocate against the absurd end timestamp (OOM risk), or fabricate an empty/garbage output. The runner classifies "threw cleanly, produced no output, did not time out" as the success condition (`src/core/runner.ts:1038-1041`, then `src/core/oracles.ts:2608-2609` PASS on empty `ctx.output/metadata/demux/frames`).

mediabunny's trim entry point is `src/engines/mediabunny/adapter.ts:1445`. It validates only sign/ordering of the range (`:1450-1455` — `startUs<0` and `endUs<=startUs`), which both pass here (50 s < 9999 s, both positive), so it proceeds into the real library path. With `frameAccurate=false` it first tries the audio-only packet-copy fast path `tryAudioOnlyPacketCopyTrim` (`:1480`), and otherwise builds a `mediabunny` `Conversion` with `trim:{ start: 50, end: 9999 }` (`:1485-1496`) backed by `Output`/`BufferTarget`. The library, when asked to seek/sample-index to a start of 50 s on a track that ends at ~30 s, throws **"startSample out of range."** — the exact `errMessage(opError)` recorded in the shard reason `graceful: startSample out of range.`. This is mediabunny's own demuxer raising on an out-of-domain sample index: it converts the start time to a sample index against the real `stts`/`stsz` sample tables and finds nothing, so it aborts before allocating any output buffer. The throw unwinds through the adapter's `finally { mbInput.dispose() }` (`:1497`) and into `runRobustness`'s catch (`src/core/runner.ts:1031-1041`) → verdict `graceful` → `graceful-failure` PASS. Crucially mediabunny's config is `backend:webcodecs`, `coreBuild:pure-ts-esm`, `wasmThreads:0`, `sharedArrayBuffer:false`, `coopCoep:not-required`, `pipeline:streaming-lockstep` (from `env.configUsed` in the shard). The rejection happens at the demuxer's sample-table lookup with no codec instantiation and no wasm module to compile — that is why it lands in **124 ms**.

ffmpeg.wasm also PASSes, but its path is heavier. Its trim entry is `src/engines/ffmpeg-wasm/adapter.ts:2538`. It first writes the 31 MB input into the wasm FS (`writeInput`, `:2565`), then runs a full info pass `this.runInfo(...)` and parses the ffmpeg log into `inputMetadata` to recover `durationSec` (`:2567`). Only then does its explicit guard fire: `if (inputMetadata.durationSec !== null && startSec >= inputMetadata.durationSec) throw new Error('${ENGINE_ID}: trim start is past end-of-file')` (`:2570-2571`) — the exact shard reason `graceful: ffmpeg.wasm@0.12.15: trim start is past end-of-file`. That is a correct, deliberately defensive guard (it does not even hand the past-EOF `-ss` to the wasm core, which protects against the 2.78 h end value), but the **273 ms** cost reflects the wasm FS write + the probe/log-parse round trip that mediabunny avoids. Same correctness rung, 2.20x slower to reject.

Tiebreaker summary (B-rung c): mediabunny needs no COOP/COEP isolation and no SharedArrayBuffer, uses a single-threaded pure-TS ESM demuxer that fails at the sample-index lookup, and streams rather than buffering the whole file into a wasm FS before deciding. ffmpeg.wasm carries the single-thread wasm core plus a whole-file copy into MEMFS just to read the duration. On every secondary axis mediabunny is the lighter, faster reject.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but lost the tiebreaker: 273 ms vs 124 ms (**2.20x slower** to produce the same graceful reject). Mechanistically it pays a 31 MB wasm-FS write + an ffmpeg info/log-parse pass (`adapter.ts:2565-2567`) before its explicit past-EOF guard (`adapter.ts:2570-2571`) fires. Correctness is identical (same `graceful-failure` oracle), so the slower wall time is the only differentiator and it is the runner-up.
- **platform@chrome-149** — NA_ENGINE, "engine does not declare operation 'trim'". Honest: the WebCodecs/MediaSource platform adapter exposes decode/encode/probe primitives, not a container-level trim/remux op, so it correctly never declares `trim`. Not an under-declaration — there is no built-in browser "trim MP4" API.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare operation 'trim'". Honest: mp4box.js is a demux/segmenter/box parser; it has no trim/cut operation surface in this suite.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'trim'". Honest: it is a parser/probe library, no trim op.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "engine does not declare operation 'trim'". This one is the most plausible candidate for an under-declaration (it does transcode/convert), but in this suite it does not register a `trim` op, so negotiation short-circuits to NA_ENGINE at `src/core/runner.ts:119` before any execution. NA looks defensible given its declared op set, though a trim-capable adapter could in principle be added.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'trim'". Honest: it is a demuxer, not an editor.

All five NA_ENGINE verdicts are correct robustness hygiene: an engine that never claims `trim` should not be graded on a trim gate (`src/core/runner.ts:116-119`).

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:881-891` (`id: 'robust_end_far_past_eof'`, asset `h264_1080p_30s.mp4`, `startUs:50_000_000`, `endUs:9_999_000_000`, notes "Range entirely past EOF (50s..~2.7h on a 30s file): graceful reject, no hang/OOM."). Oracle wiring at `:938` (`oracles: ['graceful-failure']`).
- Fixture exists and is real: `fixtures/media/h264_1080p_30s.mp4` is present, **31 MB** (stat confirmed) — a genuine H.264/AAC MP4, not synthetic/empty/mock. The trim range itself is intentionally out-of-domain, which is the whole point of the gate, not a fixture defect.
- Oracle: `gracefulFailure` at `src/core/oracles.ts:2586-2623`. It is NOT trivially satisfiable in the dangerous direction: if a robustness op *produces* output from this past-EOF input it FAILs ("produced output from malformed/mutated input", `:2614-2617`). PASS requires either an empty output set after a caught throw (`:2608-2609`) or `gracefulAllowOutput` (which this scenario does NOT set). So an engine cannot cheat by emitting a fake empty container and calling it success unless it genuinely returns nothing.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445` (trim) → real `mediabunny` `Conversion`/`EncodedPacketSink` path (`:1480`, `:1485-1496`); the throw "startSample out of range." originates inside the library's sample-table lookup, not from a hardcoded short-circuit. Range validation (`:1450-1455`) lets this in-range-sign request through to the real library rather than rejecting on a cheap local check — so the PASS is earned by the library actually attempting and refusing the seek. Runner routing confirmed at `src/core/runner.ts:1028-1042` and pass-reason format at `:1094` matches the shard verbatim.
- Cached note: BOTH passing engines have `cached==true` (mediabunny startedAt 2026-06-22T13:52, ffmpeg startedAt 2026-06-22T16:54). Results were reused, not re-run in this report pass. Staleness/timing risk is real for the 124 ms vs 273 ms comparison (single-shot, different capture times, no median/MAD). The verdicts and reasons are stable code-determined throws, so the PASS/PASS classification is trustworthy; only the precise wall margin carries the cache caveat.
- Verdict: **WEAK-GATE**. Everything is real (real 31 MB fixture, real library throw, real anti-fabrication oracle), but the gating oracle is `graceful-failure` — a robustness/smoke-level gate ("did it reject without producing output or hanging"), the weakest rung on the correctness ladder. There is no bit-exact, structural, or perceptual comparison here, so the PASS is real but not strong, and the winner is decided on a coarse single-shot timing proxy.

## Confidence & caveats

- Confidence: **medium**. The PASS/PASS classification and all five NA_ENGINE verdicts are unambiguous and code-grounded (exact reason strings match the adapter throws and the runner's `graceful:`-prefix formatter). The *ranking* between the two PASS engines rests on `durationMs` (124 vs 273) because robustness scenarios are never benched — so there is no median/p95/MAD and effectively n=1 per engine.
- Both winning results are `cached==true`; the timing margin should be treated as indicative (2.2x), not a precise re-measured number.
- The oracle is intentionally a smoke/robustness gate; this test verifies *defensive correctness* (no crash/hang/OOM/fabrication), not output fidelity. mediabunny wins as the lighter, faster, COOP/COEP-free reject; ffmpeg.wasm is a correct but heavier runner-up.
