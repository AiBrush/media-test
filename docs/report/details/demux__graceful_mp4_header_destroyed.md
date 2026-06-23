# demux/graceful_mp4_header_destroyed

family: demux | fixture asset: `demux_mp4_header_destroyed.mp4` (real, ~31 MB) | primaryMetric: wall (graceful scenario; no bench block emitted) | passCount: 6 / 7

## Verdict

Best framework: **mediabunny@1.48.0** (CONTESTED — 6 of 7 engines PASS the single `graceful-failure` oracle).

This is a *graceful-failure* scenario: a valid H.264-in-MP4 file with its first 256 bytes (the `ftyp` box and the head of `moov`) stripped. There is no decode/remux output to grade, no goldens to bit-compare, and no `bench{}` block in the shard. The only gate is `graceful-failure`, which PASSes when the operation produces no output and neither crashes nor hangs. All six engines that *attempt* demux satisfy it identically, so correctness strength is tied at the top of the ladder for this scenario (the gate is a robustness gate, not a bit-exact/structural one).

Decisive factor: with correctness tied, the tiebreak is **how fast and how cleanly each engine recognised the input as unparseable**. mediabunny rejects at **7 ms** with a precise format-detection error ("Input has an unsupported or unrecognizable format."), the joint-fastest result and the cleanest diagnosis (it never builds a partial packet table). remotion-webcodecs ties on wall (7 ms) but is co-winner-class; mediabunny is selected as the primary winner for the cleaner pure-TS container-probe path with no COOP/COEP requirement.

Margin over runner-up: wall 7 ms vs 7 ms (remotion-webcodecs) — effectively a tie at the floor; both are ~2.3x faster than remotion-media-parser (16 ms), ~7.6x faster than web-demuxer (53 ms), ~12.9x faster than mp4box (90 ms), and ~28x faster than ffmpeg.wasm (197 ms). Note: graceful-failure has no `bench` samples (n is not reported), so these are single-shot `durationMs` values — weak performance evidence.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 7 ms | n/a | n/a | n/a | graceful: Input has an unsupported or unrecognizable format. |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 7 ms | n/a | n/a | n/a | graceful: Unknown file format |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | 16 ms | n/a | n/a | n/a | graceful: Unknown file format |
| web-demuxer@4.0.0 | PASS | graceful-failure:true | 53 ms | n/a | n/a | n/a | graceful: get_media_info failed: undefined |
| mp4box@2.3.0 | PASS | graceful-failure:true | 90 ms | n/a | n/a | n/a | graceful: moov not found (not an ISO-BMFF/MP4 file, or moov truncated) |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 197 ms | n/a | n/a | n/a | graceful: demux failed to open input (framecrc exit 1); STCO outside TRAK / error reading header / Invalid data |
| platform@chrome-149 | NA_ENGINE | — | 94 ms | n/a | n/a | n/a | platform demux NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV |

(No `bench{}` metrics are present in the shard for any engine; throughputRealtime / peakMemory / longtasks are not measured for a graceful-failure gate. Wall values are the single-shot `durationMs` from each entry.)

## Why the winner wins (deep technical)

The fixture is a faststart/progressive H.264 MP4 whose first 256 bytes were dropped. In ISO-BMFF the very first bytes are the `ftyp` box (major brand + compatible brands) immediately followed by the `moov` box header (size + 'moov' fourcc, then `mvhd`/`trak`/`stbl`...). Removing the first 256 bytes destroys the `ftyp` brand and the leading structure of `moov`, so the byte stream no longer begins with a recognisable top-level box: a parser that reads `[u32 size][u32 type]` at offset 0 gets garbage box lengths/types. The correct behaviour is to recognise this immediately and reject, *without* attempting to synthesise a packet table from misaligned offsets (which is how a fuzzer-style hang or a corrupt-table bug arises).

mediabunny used `backend: webcodecs`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`. Its demux entrypoint (`src/engines/mediabunny/adapter.ts:1152` `async demux`) calls `openInput` (`adapter.ts:1153`), which constructs an `Input` over a `BlobSource` with `formats: mb.ALL_FORMATS` (`adapter.ts:263-275`). With no container hint, mediabunny runs container format detection across all registered input formats; because the leading `ftyp`/`moov` signature is gone, none of the format probes match and mediabunny throws "Input has an unsupported or unrecognizable format." *before* ever reaching `getTracks()`/`EncodedPacketSink` (`adapter.ts:1156-1177`). The runner catches that throw and routes it to `gracefulFailure` (`src/core/oracles.ts:2586`), which — because the scenario's oracle list contains `graceful-failure` (`hasGracefulSignal`, `oracles.ts:2603-2606`) and no output/metadata/demux/frames were produced — returns PASS (`oracles.ts:2607-2609`). The 7 ms wall reflects that the rejection happens in the format-sniff stage on a few KB of the BlobSource, not after buffering all 31 MB.

This is the textbook-correct path: detect at the signature/probe layer, never allocate a packet table. remotion-webcodecs reaches the same outcome at the same wall (7 ms) via its parser's "Unknown file format" rejection, so it is functionally co-winner; mediabunny edges it as the primary pick on the cleaner, COOP/COEP-free pure-TS probe and the more specific diagnostic. Everyone else also rejected, but later in their pipeline and after more work (mp4box scans for `moov`, ffmpeg.wasm spins up the wasm module and the libavformat mov demuxer before erroring), which is why their wall is 13x–28x higher.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, joint-fastest (7 ms), "Unknown file format". Not "wrong"; it is the co-winner. Loses the primary slot only on the tiebreak (mediabunny's pure-TS probe / more specific error). Margin: 0 ms wall.
- **remotion-media-parser@4.0.479** — PASS (16 ms), `backend: cpu-js`, full-parse(demux). Correct rejection ("Unknown file format") but ~2.3x slower wall than the winner because its CPU-JS full-parse reader does more work before bailing.
- **web-demuxer@4.0.0** — PASS (53 ms), "get_media_info failed: undefined". Correct graceful reject but ~7.6x slower; the error string is vaguer (`undefined`), and it pays wasm/libav `get_media_info` startup before failing.
- **mp4box@2.3.0** — PASS (90 ms), `backend: pure-js`, whole-file-append. Correct reject ("moov not found"). ~12.9x slower because its `whole-file-append(MP4BoxBuffer+fileStart)` pipeline appends bytes and scans for a `moov` box before concluding it is absent.
- **ffmpeg.wasm@0.12.15** — PASS (197 ms), slowest (~28x). libavformat's mov demuxer partially mis-parsed the headerless stream (log shows "STCO outside TRAK", "Multiple mdhd?", "mvhd.timescale = 0") then "error reading header / Invalid data found / Aborted()". It rejected gracefully (framecrc exit 1, no output) but only after wasm init + a deep, noisy parse attempt.
- **platform@chrome-149** — NA_ENGINE (94 ms). Honest NA: raw platform demux only supports progressive MP4/MOV and WebM/MKV and does not expose a standalone demux op; declining is correct, not an under-declared capability.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:455-463` (id `graceful_mp4_header_destroyed`), generated by `gracefulScenarios` map at `src/scenarios/demux/index.ts:475-492` (op `demux`, oracles `['graceful-failure']`, metrics `['wall','peakMemory']`).
- Fixture: `fixtures/media/demux_mp4_header_destroyed.mp4` exists, ~31 MB — a REAL media file (a valid H.264 MP4 with its first 256 bytes destroyed, per scenario notes), not synthetic/empty/mock.
- Oracle: `gracefulFailure` at `src/core/oracles.ts:2586-2623`. It performs a real check: PASS only if the op produced no output and did not crash/hang (`oracles.ts:2607-2609`); it FAILs if a robustness/malformed scenario *does* emit output without `gracefulAllowOutput` (`oracles.ts:2614-2617`). This scenario does not set `gracefulAllowOutput`, so any engine that fabricated a packet table from the corrupt bytes would FAIL — the gate is not trivially satisfiable.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1152` (`demux`), `:1153` (`openInput`), `:263-275` (`Input` over `BlobSource` with `ALL_FORMATS`). The op genuinely opens the file through the real mediabunny library and throws a library-originated format error; it does not return canned output, copy input→output, short-circuit to a golden, or swallow the error and falsely report success.
- Verdict: **REAL**. Real 31 MB fixture, real library demux path, and an oracle that distinguishes clean rejection from fabricated output. The only caveat is that for a graceful gate the "win" is essentially a timing tiebreak among equally-correct rejections.
- Cached note: ALL engine results in this shard have `cached: true` (re-used, not re-run this session). Staleness risk is low for a deterministic format-rejection (the bytes and library behaviour do not change), but the single-shot `durationMs` used for the tiebreak was measured in a prior run and could shift; the 7 ms vs 7 ms tie is within noise.

## Confidence & caveats

- Confidence: medium. The PASS/NA classification and REAL verdict are solid (real fixture, real adapter path, meaningful gate). But the *ranking* among the six PASSes rests entirely on single-shot `durationMs` (no `bench`, no n/mad/p95), and the top two (mediabunny, remotion-webcodecs) tie at 7 ms — so "best" is a near-arbitrary tiebreak rather than a decisive correctness or measured-performance win.
- The graceful-failure oracle is by design a robustness/smoke-style gate, not a bit-exact or structural one; PASS here means "rejected cleanly", nothing about packet-table fidelity (there is no valid packet table to produce).
- All results cached; values reflect a prior run.
