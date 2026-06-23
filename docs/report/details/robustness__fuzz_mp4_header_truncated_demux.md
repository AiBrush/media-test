# robustness/fuzz_mp4_header_truncated_demux

family: robustness | fixture asset: `fuzz_mp4_header_truncated.mp4` (31 MB, real, in fixtures/media/) | primaryMetric: wall (durationMs) | passCount: 6 / 7

## Verdict

**Best framework: remotion-webcodecs@4.0.479** — but this is a **CONTESTED, WEAK-GATE** result.

Six of seven engines PASS, and all six pass the *same single oracle*: `graceful-failure`. This is a robustness fuzz scenario: the input is an MP4 whose first 256 bytes (ftyp + moov head) were dropped, and the only correct behavior is to **reject** it. There is no correctness/bit-exact oracle here — every passing engine is rated identically on correctness strength (one smoke-level "did not crash, produced no output" gate). Per the decision procedure, when correctness is comparable the tiebreak is **performance (wall median)**.

- Decisive factor: **wall time**. remotion-webcodecs rejected the file in **7 ms**, the fastest of all seven engines.
- Margin over runner-up: vs remotion-media-parser (19 ms) = **2.7x faster wall**; vs mediabunny (24 ms) = 3.4x; vs web-demuxer (44 ms) = 6.3x; vs mp4box (122 ms) = 17.4x; vs ffmpeg.wasm (242 ms) = 34.6x.
- Evidence strength caveat: every passing engine is `cached==true`, and the gate is a smoke-only graceful-failure check (no golden comparison). The "win" is a latency margin on a reject path, not a correctness victory.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 7 ms | n/a | n/a | n/a | cached: graceful: Unknown file format |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:pass | 19 ms | n/a | n/a | n/a | cached: graceful: Unknown file format |
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 24 ms | n/a | n/a | n/a | cached: graceful: Input has an unsupported or unrecognizable format. |
| web-demuxer@4.0.0 | PASS | graceful-failure:pass | 44 ms | n/a | n/a | n/a | cached: graceful: get_media_info failed: undefined |
| mp4box@2.3.0 | PASS | graceful-failure:pass | 122 ms | n/a | n/a | n/a | cached: graceful: mp4box: moov not found (not an ISO-BMFF/MP4 file, or moov truncated) |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 242 ms | n/a | n/a | n/a | cached: graceful: demux failed to open input (framecrc exit 1); STCO outside TRAK / error reading header / Invalid data found |
| platform@chrome-149 | NA_ENGINE | — | 5719 ms | n/a | n/a | n/a | platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV |

No `bench{}` block is present in the shard for any engine; the only quantitative metric is `durationMs`. throughputRealtime / peakMemory / longtasks were not recorded for this reject-path scenario.

## Why the winner wins (deep technical)

The fixture is an H.264-in-MP4 file with its first 256 bytes excised. A normal faststart MP4 begins `ftyp` then `moov`; here the file now begins mid-`trak` — the hexdump shows the stream opening with an `elst` (edit list) box at offset 0, followed by `mdia`/`mdhd`/`hdlr`, with no `ftyp` and no `moov` header where a parser expects them. Any conformant ISO-BMFF demuxer must fail to locate a valid top-level box structure and reject.

remotion-webcodecs wins purely on **latency of the reject**. Mechanistically:

1. The adapter detects the input is `mutated` and switches the Remotion media-parser source from the range-friendly URL reader to an in-memory Blob carrying the actually-corrupted bytes: `src/engines/remotion-webcodecs/adapter.ts:317-323` (`sourceOptions` → `{ src: await input.blob() }`). This is the correct path — `input.url` still points at the pristine fixture, so feeding the Blob is what exposes the real truncation to the library.
2. `demux()` then calls the genuine `mp.parseMedia({...})` (`src/engines/remotion-webcodecs/adapter.ts:427`). The parser reads the leading bytes, finds no recognizable `ftyp`/container signature, and throws **"Unknown file format"** — almost immediately, because the failure is detected from the very first box-header read rather than after buffering. The runner catches that throw, records no output, and the `graceful-failure` oracle infers PASS (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` → `src/core/oracles.ts:2607-2610`).
3. Because rejection happens at the header-sniff stage, none of the 31 MB body is parsed. remotion-webcodecs short-circuits in 7 ms.

The contrast in *how* each engine rejects explains the latency ladder, all on the same Apple M1 Max / Chrome 149 host:
- remotion-webcodecs (7 ms) and remotion-media-parser (19 ms) both fail at the container-signature sniff ("Unknown file format"). The webcodecs adapter's blob/streaming path bails fractionally sooner.
- mediabunny (24 ms) similarly rejects at format detection ("unsupported or unrecognizable format").
- web-demuxer (44 ms) routes through its wasm `get_media_info`, which returns `undefined` (failed open) — wasm bridge crossing adds overhead.
- mp4box (122 ms) uses `whole-file-append(MP4BoxBuffer+fileStart)` (env.configUsed) — it appends and scans buffer looking for `moov`, only concluding "moov not found" after consuming material, hence ~17x slower.
- ffmpeg.wasm (242 ms) is slowest because libavformat's `mov` demuxer tries hard to recover: its log shows it walked into structurally-broken atoms ("STCO outside TRAK", "Multiple mdhd?", "error reading header") before giving up with "Invalid data found when processing input" / `Aborted()`. The wasm module startup plus this recovery attempt costs the most.

All six reject for the right reason (no valid moov / unrecognizable container) and none crash, hang, or emit packets — the desired robustness outcome.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, but 19 ms vs winner 7 ms = **2.7x slower wall**. Same correctness (one graceful-failure pass, "Unknown file format"); loses only on the latency tiebreak.
- **mediabunny@1.48.0** — PASS, 24 ms = **3.4x slower**. Same oracle; rejected as "unsupported or unrecognizable format." Loses on wall.
- **web-demuxer@4.0.0** — PASS, 44 ms = **6.3x slower**. Wasm `get_media_info` returned undefined; correct reject, but wasm bridge overhead.
- **mp4box@2.3.0** — PASS, 122 ms = **17.4x slower**. Whole-file-append parsing model scans for `moov` before concluding it is absent; correct verdict, expensive path.
- **ffmpeg.wasm@0.12.15** — PASS, 242 ms = **34.6x slower** (slowest). libavformat attempted structural recovery on the broken atoms before aborting; correct reject but heavy.
- **platform@chrome-149** — **NA_ENGINE** (not a loss on merit). `src/engines/platform/adapter.ts:352` throws `NotApplicableError('demux', 'raw platform demux only supports progressive MP4/MOV and WebM/MKV')`. The raw-platform demuxer is a hand-rolled MP4/WebM/WAV sniffer with no general container library; on a headless truncated MP4 it hits `UnsupportedMp4Error` and converts to NA (adapter.ts:346-352). This NA is **honest** — Chrome exposes no general demux API, only WebCodecs decoders, so demuxing arbitrary/broken containers is genuinely out of scope. (Its 5719 ms durationMs reflects setup/teardown, not work.)

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/robustness/index.ts:253-265`. id `fuzz_mp4_header_truncated_demux`, op `demux`, asset `fuzz_mp4_header_truncated.mp4`, containersIn `mp4`, videoCodecs `h264`. Notes: "First 256 bytes dropped (ftyp/moov head gone); demux must reject this, not parse it." The scenario authors deliberately AVOID the graceful/threw/rejected trap tokens in notes (comment at lines 259-264) so the verdict rests only on the runner's output-absence inference, not on prose — this hardens the gate against self-described success.
- **Fixture exists / is real**: `fixtures/media/fuzz_mp4_header_truncated.mp4` is present, 31 MB. Hexdump confirms the truncation: file begins with an `elst` box at offset 0 then `mdia`/`mdhd`/`hdlr` — no `ftyp`, no `moov` header — consistent with the leading 256 bytes removed. Not synthetic, not empty, not mock.
- **Oracle**: `gracefulFailure` at `src/core/oracles.ts:2586-2623`. Because no `signal:` marker is present in notes, it falls to output-presence inference (lines 2602-2610): PASS only if the op produced NO output (no `output`/`metadata`/`demux`/`frames`) and did not crash/hang. `gracefulAllowOutput` is NOT set for this case, so returning any parsed output would FAIL (lines 2611-2617). This is a meaningful reject-gate for a robustness scenario, though it is **smoke-level** — it verifies "rejected cleanly," not any decoded/golden comparison.
- **Winner adapter**: `src/engines/remotion-webcodecs/adapter.ts:317-323` (Blob source for mutated input — feeds the genuinely corrupted bytes), `:394-427` (`demux` calls real `mp.parseMedia`). The library throws "Unknown file format"; the adapter does NOT swallow the error and falsely report success, does NOT return canned output, does NOT short-circuit to a golden. The reject is genuine.
- **Verdict: WEAK-GATE.** Real 31 MB truncated fixture + real library invocation on the corrupted bytes + a real (but smoke-only) reject oracle. PASS is honest, but the gate is non-correctness (graceful-failure smoke), so the "win" is a latency margin on a reject path rather than a correctness victory.
- **Cached note**: ALL six PASS entries (and the winner) have `cached==true` — results were reused, not freshly re-run in this batch. Per the launcher seeding caveat, stale PASS reuse is a known risk; the durationMs margins reflect cached prior runs. Treat the 7 ms vs 19/24/44/122/242 ms ranking as indicative, not freshly measured.

## Confidence & caveats

- Confidence: **medium**. The fixture, scenario, oracle, and winner adapter were all verified in code; the reject reasons are physically plausible and codec-appropriate. But (a) the gate is smoke-only graceful-failure (no correctness oracle differentiates the six passers), (b) there is no `bench{}` block — the only metric is a single `durationMs` per engine (n effectively 1), so the latency margins are weak evidence, and (c) every result is cached. The winner designation is correct under the decision procedure (fastest among equal-correctness passers) but rests on a thin, cached latency signal.
- platform's NA_ENGINE is correctly excluded from contention and is an honest capability gap, not an under-declaration.
