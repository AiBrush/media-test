# demux/graceful_webm_header_destroyed

- family: demux
- fixture asset: `demux_webm_header_destroyed.webm` (fixtures/media/, 9.3 MB, valid VP9/WebM with first 128 bytes — the EBML header — zeroed)
- primaryMetric: wall (graceful-failure scenario; metrics declared `['wall','peakMemory']`, but shard carries only `durationMs`, no `bench{}`)
- passCount: 5 of 7 (six demux-capable engines; one of them, mp4box, is correctly NA)

## Verdict

- bestFramework: **mediabunny@1.48.0**
- contested: **YES** — five engines PASS the single boolean `graceful-failure` oracle (web-demuxer, remotion-media-parser, remotion-webcodecs, ffmpeg.wasm, mediabunny). Correctness strength is identical across all five (one boolean oracle, no measurements), so the ranking falls through to performance.
- decisive factor: **lowest wall (`durationMs`)** to reach a clean rejection. mediabunny rejected in **8 ms**, the fastest of all engines.
- margin over runner-up: vs remotion-media-parser (9 ms) → **1.13x faster**. Against the rest: vs remotion-webcodecs (14 ms) 1.75x, vs web-demuxer (55 ms) 6.9x, vs ffmpeg.wasm (246 ms) **30.8x**. NOTE: this is a very weak, low-confidence margin — every PASS entry is `cached==true` with n==1 (no `bench{}` median/mad/p95), and an 8 ms vs 9 ms gap is within single-sample noise.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 8 | n/a | n/a | n/a | cached: graceful: Input has an unsupported or unrecognizable format. |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | 9 | n/a | n/a | n/a | cached: graceful: Unknown file format |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 14 | n/a | n/a | n/a | cached: graceful: Unknown file format |
| web-demuxer@4.0.0 | PASS | graceful-failure:true | 55 | n/a | n/a | n/a | cached: graceful: get_media_info failed: undefined |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 246 | n/a | n/a | n/a | cached: graceful: demux failed to open input (framecrc exit 1). Log: op1.in: Invalid data found when processing input \| Aborted() |
| platform@chrome-149 | NA_ENGINE | — | 5695 | n/a | n/a | n/a | platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

(No engine reports `bench{}`, throughputRealtime, peakMemory, or longtasks for this scenario — only `durationMs`.)

## Why the winner wins (deep technical)

This is a robustness/graceful-failure case, not a correctness-strength contest: the gating oracle `graceful-failure` (src/core/oracles.ts:2586) is a single boolean. The fixture is a real 9.3 MB VP9-in-WebM file whose first 128 bytes — the EBML header (`0x1A45DFA3` magic, the `EBML` master element and the `DocType "webm"` declaration) — have been overwritten with zeros. The hex dump confirms the destruction: bytes 0x00–0x4F are all `00`, and the first surviving structure appears at offset 0x55 (`0x1549A966A0` ≈ the `Info` element with `Lavf` muxer strings, `0x1654AE6B` = `Tracks`). With the leading EBML/Segment framing gone, no conformant Matroska/WebM parser can locate the Segment or build a cluster/cue index, so the only correct behavior is a clean, prompt rejection — never a hang on a mangled VINT element size (exactly the failure mode the scenario notes warn about: "never loop on a mangled element size").

mediabunny wins on the only differentiating axis available — time-to-clean-reject. Its demux path opens the container via `openInput` → `mb.Input({ formats, source })` and immediately probes format/tracks (src/engines/mediabunny/adapter.ts:1152-1156, `metadataFromInput` then `getTracks`). Because the EBML magic and DocType are absent, mediabunny's format-detection (MatroskaInputFormat sniffing) fails up front and throws **"Input has an unsupported or unrecognizable format."** before it ever attempts to enumerate packets via `EncodedPacketSink` (adapter.ts:1162-1176). That early, sniff-stage throw is why it returns in 8 ms — it does the least work: it never buffers the 9.3 MB body, never walks clusters. The runner's `runRobustness` (src/core/runner.ts:1011-1042) catches that throw as `verdict='graceful'`, leaves `opResult` undefined, and routes to the oracle with no output; `gracefulFailure` (oracles.ts:2607-2610) then infers PASS from output-absence ("operation produced no output and did not crash/hang"). The pure-TS ESM build (`coreBuild: pure-ts-esm`, `coopCoep: not-required`, no SharedArrayBuffer) means there is no wasm instantiation cost on this fail-fast path, which is the structural reason it beats the wasm-backed engines.

The performance ordering is mechanistically sensible: the two JS-parser engines (mediabunny 8 ms, remotion-media-parser 9 ms) fail at the sniff stage in single-digit ms; remotion-webcodecs (14 ms) wraps the same parser plus a webcodecs pipeline setup; web-demuxer (55 ms) and especially ffmpeg.wasm (246 ms) pay a wasm module/FS round-trip — ffmpeg.wasm must load `op1.in` into its virtual FS and run libavformat's probe, which reports "Invalid data found when processing input" then `Aborted()` (a controlled libav abort, still graceful = exit 1, not a hang). So the 30.8x gap over ffmpeg.wasm is real wasm overhead, but the 1.13x gap over remotion-media-parser is not a meaningful engineering difference.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, but lost on wall: 9 ms vs 8 ms (1.13x slower). Threw "Unknown file format" at the sniff stage (cpu-js streaming parser). Essentially tied; the loss is single-sample noise, not a real deficiency.
- **remotion-webcodecs@4.0.479** — PASS, lost on wall: 14 ms (1.75x slower than mediabunny). Same "Unknown file format" rejection but pays the extra webcodecs-pipeline (streaming-backpressure) setup before the parser bails.
- **web-demuxer@4.0.0** — PASS, lost on wall: 55 ms (6.9x slower). Its wasm `get_media_info` failed (reason "get_media_info failed: undefined") — a clean failure, but it pays wasm load/FS cost before rejecting.
- **ffmpeg.wasm@0.12.15** — PASS, lost on wall: 246 ms (30.8x slower). libavformat probe returned "Invalid data found when processing input" → `framecrc exit 1` / `Aborted()`. Graceful (controlled abort, no hang), but the heaviest path: full wasm module + virtual-FS input load before the probe can reject.
- **platform@chrome-149** — NA_ENGINE. Honest: raw platform demux (no library) only handles progressive MP4/MOV and WebM/MKV via element-level parsing it does not own a general demuxer for; the engine declares `demux is NA`. The 5695 ms `durationMs` reflects the NA-detection path, not a failed parse. Not an under-declared capability — the platform has no first-party WebM packet-demux API.
- **mp4box@2.3.0** — NA_ENGINE. Honest: mp4box.js is an ISO-BMFF (MP4) parser only; it "does not declare input container 'webm'". WebM/Matroska is genuinely out of scope, so NA is correct, not an under-declaration.

## Anti-cheat validation

- scenario definition: src/scenarios/demux/index.ts:464-472 (`GRACEFUL_CASES` entry `graceful_webm_header_destroyed`), generated into a Scenario at src/scenarios/demux/index.ts:475-492 with `op:'demux'`, `requires.containersIn:['webm']`, `videoCodecs:['vp9']`, `oracles:['graceful-failure']`. Notes: "Valid WebM with its EBML header (first 128 bytes) destroyed: demux must reject cleanly, never loop on a mangled element size."
- fixture asset: `demux_webm_header_destroyed.webm` EXISTS in fixtures/media/ (9.3 MB). Hex dump confirms it is a genuinely mutated real file: bytes 0x00–0x4F zeroed (EBML header gone), real Matroska elements (`Info`/`Lavf` muxer string, `Tracks`) surviving from offset 0x55. Not synthetic, not empty, not a mock.
- oracle: `gracefulFailure` at src/core/oracles.ts:2586-2623. It is a robustness inversion oracle — PASS requires the op produce NO output (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`, line 2608) after a clean throw within timeout; a timeout FAILs (runner.ts:1044-1046), and returning output from malformed input FAILs (oracles.ts:2614). It is meaningful in the sense that it rejects hangs and rejects "produced a packet table from garbage." It is, however, a single boolean with no measurements — it cannot distinguish the quality of the rejection, only its existence/timeliness.
- winner adapter: src/engines/mediabunny/adapter.ts:1152-1183 (`demux`). Genuinely implemented — opens a real `mb.Input`, calls `metadataFromInput`/`getTracks`/`EncodedPacketSink.packets`. It does NOT hardcode, copy input→output, short-circuit to a golden, or swallow errors: the rejection comes from the library's own format sniffer throwing ("unsupported or unrecognizable format"), which propagates to the runner's catch (runner.ts:1031-1041).
- cached note: ALL five PASS entries (and both NA timing values) are `cached==true`. The evidence was reused, not freshly re-run. Per the launcher-seeding caveat, an 8 ms-vs-9 ms wall difference from stale, single-sample, cached `durationMs` is fragile; the PASS verdicts themselves (library-level rejections) are robust, but the performance ranking is not.
- verdict: **WEAK-GATE**. Real fixture + real implementations + a non-trivial oracle (rejects hangs and false-positive output), but the gate is a single boolean graceful-failure with no quantitative correctness measurement, so the "win" rests entirely on a 1.13x cached, n==1 wall margin. PASS is real; the gate's discriminating power is weak.

## Confidence & caveats

- Confidence: **medium**. The PASS/NA partition is unambiguous and code-confirmed (mediabunny library throw is real; mp4box/platform NAs are honest). The CHOICE of winner among five effectively-tied PASS engines is low-evidence: no `bench{}`, n==1, all cached, and mediabunny's 8 ms only edges remotion-media-parser's 9 ms (1.13x — within noise).
- Caveats: (1) `durationMs` is the only timing signal; treat sub-2x gaps as ties. (2) All results stale/cached — a fresh run could reorder mediabunny vs remotion-media-parser. (3) The graceful-failure oracle has no measurements to plausibility-check, so anti-cheat rests on the fixture mutation (verified via hex) and the adapter code path (verified). (4) If the rubric weights correctness ladder strictly, all five PASS engines are equal at the "smoke/robustness" tier and the winner is genuinely a coin-flip biased by 1 ms.
