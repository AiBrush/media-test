# trim/robust_truncated_source

- family: trim
- fixture asset: `fixtures/media/trim_truncated_h264_55p.mp4` (H.264 + AAC in MP4, truncated to 55% — incomplete moov/mdat; 17,192,334 bytes on disk)
- primaryMetric: wall (metrics requested: wall, peakMemory)
- passCount: 2 of 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- **Decisive factor: correctness *path*, not numbers.** Both passing engines satisfy only the same single oracle (`graceful-failure`), so correctness rung and oracle count are tied. The tiebreak is *how* each reached PASS: mediabunny genuinely opened the truncated container and ran a real `Conversion` trim pipeline, then returned partial/safe output (allowed here by `gracefulAllowOutput: true`), demonstrating true graceful degradation. ffmpeg.wasm reached PASS by short-circuiting on a filename substring (`includes('truncated')`) and throwing *before* ever invoking the wasm trim — a non-mechanistic gate that does not prove its decoder degrades safely on the bad bytes.
- **Margin over runner-up:** no meaningful performance margin exists — the shard carries no `bench{}` block for either engine (robustness cases record only `durationMs`). Raw durations: mediabunny 678 ms vs ffmpeg.wasm 157 ms; both `cached:true`. ffmpeg is nominally ~4.3x lower wall, but that number reflects its early filename bail (it never decoded), so it is not a like-for-like comparison and is not decisive. The win is on validity of the robustness demonstration, not speed.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs=678) | n/a | n/a | n/a | cached previous PASS; returned partial/safe output, no crash/hang |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs=157) | n/a | n/a | n/a | cached: trim rejected known malformed input 'trim_truncated_h264_55p.mp4' before wasm trim |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

No `bench{}` (wall/throughputRealtime/peakMemory/longtasks) metrics are present in the shard for any engine; only `durationMs` is recorded, so the table reports that instead of inventing metric numbers.

## Why the winner wins (deep technical)

This is a robustness scenario: the input `trim_truncated_h264_55p.mp4` is a genuine MP4 (`ftyp isom`/`moov mvhd` visible at offset 0x00–0x20) that has been cut off at 55% of its length, leaving an incomplete `moov`/`mdat` so the sample tables reference bytes that do not exist. The requested op is a non-frame-accurate trim of `2.0s..8.0s` of H.264 video + AAC audio. The only gate is `graceful-failure` (src/scenarios/trim/index.ts:938), and the scenario uniquely sets `extraOptions.gracefulAllowOutput: true` (index.ts:902), meaning the oracle accepts *either* a clean reject *or* partial-but-safe output, provided the engine does not crash/hang/OOM.

The oracle logic (src/core/oracles.ts:2586–2628) resolves as follows for this case: there is no `signal:<token>` marker in the notes (only prose), so it falls to output inference. Because the scenario lists `graceful-failure` among its oracles, `hasGracefulSignal` is true. Mediabunny returned output, so the `!ctx.output` branch (oracles.ts:2608) is skipped; the `gracefulAllowsReturnedOutput(ctx)` branch (oracles.ts:2611, backed by 2625–2628 reading `options.gracefulAllowOutput === true`) fires and returns PASS with detail "operation returned partial/safe output and did not crash/hang" — exactly the detail recorded in the shard for mediabunny.

Mechanistically, mediabunny earned that the hard way. Its `trim` adapter (src/engines/mediabunny/adapter.ts:1445–1500) validates the range (1450–1455), builds a real `Output` with a `BufferTarget` (1484), and constructs a `ConversionOptions` with `trim: { start, end }` in seconds (1485–1489), then runs `runConversion` (1496) which calls `mb.Conversion.init/execute` over the actual demux→decode→re-mux pipeline. Per `env.configUsed`, this ran on the `webcodecs` backend with `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, no SharedArrayBuffer and `coopCoep: "not-required"`. On the truncated file, mediabunny's streaming reader consumed the packets that *are* present, the pipeline hit the truncation boundary, and it finalized whatever valid samples it had into a well-formed container rather than throwing or hanging — the textbook "degrade gracefully, emit a safe partial" behavior the `gracefulAllowOutput` flag is designed to reward. The single recorded oracle (`graceful-failure:true`) is the strongest signal this scenario offers; there is no decoded-frame, golden-packet, or boundary oracle to win on, so correctness strength is capped at this smoke-grade robustness gate for everyone.

ffmpeg.wasm also PASSed, but did not demonstrate degradation of its codec at all. Its `trim` adapter (src/engines/ffmpeg-wasm/adapter.ts:2538–2552) lowercases the input name and, at 2550–2551, throws `trim rejected known malformed input '<name>' before wasm trim` whenever the filename `includes('bitflipped')` or `includes('truncated')`. That throw is caught by the runner and routed to `graceful-failure` as a clean reject (PASS). It is a valid robustness outcome under the oracle's spec, but it is a *filename heuristic*, not evidence that the FFmpeg wasm core safely handles the bad bytes — the 157 ms duration is the cost of name-matching and bailing, not of demuxing. Between two engines tied on the only oracle, the one that actually ran its real pipeline against the corrupt input and survived (mediabunny) is the stronger, more trustworthy robustness result.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, runner-up):** Reached PASS via a filename short-circuit (adapter.ts:2550–2551, `inputName.includes('truncated')`) that throws before the wasm trim ever runs. Legitimate under the loose `graceful-failure` gate, but it proves nothing about the decoder's behavior on the malformed bytes; mediabunny's PASS reflects a real pipeline survival, ffmpeg's does not.
- **platform@chrome-149 (NA_ENGINE):** Honest NA — raw WebCodecs/`MediaRecorder` platform APIs do not provide a container-level trim/remux operation, so the adapter does not declare `trim`.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — mp4box.js is a demux/segment library declaring only its four real ops; it does not implement trim.
- **web-demuxer@4.0.0 (NA_ENGINE):** Honest NA — a demuxer only; undeclared ops throw by design (adapter.ts ~1043 comment). No trim capability claimed.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA — a parser/probe library (mp4-sample-table reader), no muxing/trim path.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** Honest NA — this entry does not declare `trim` (its sibling mediabunny-backed path handles conversions in this suite).

All five NA verdicts are genuine capability gaps for a trim op, not under-declared capabilities: none of these libraries can write a trimmed MP4.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/trim/index.ts:893–904 (`id: 'robust_truncated_source'`), mapped to a `Scenario` at index.ts:919–943; oracle list `['graceful-failure']` at line 938.
- **Fixture:** `fixtures/media/trim_truncated_h264_55p.mp4` exists (17,192,334 bytes). Header bytes confirm a real MP4: `ftyp isom`/`iso2/avc1/mp41` at 0x00–0x1F and `moov`/`mvhd` at 0x20 — a genuine truncated H.264/AAC file, not synthetic/empty/mock. The truncation rationale is in `notes` (index.ts:903).
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1445–1500 (`trim`) → `runConversion` at adapter.ts:842 calling `mb.Conversion.init`. This is a real call into the mediabunny library's Conversion pipeline with `trim: { start, end }`; it does not return canned output, does not copy input→output (the no-op path at 1468–1476 is gated on `isNoopTrim` for a 0..duration request, which does not apply to a 2..8s trim), does not short-circuit to a golden, and does not swallow errors to fake success.
- **Oracle:** src/core/oracles.ts:2586 (`gracefulFailure`), with the output-allowed branch at 2611 and `gracefulAllowsReturnedOutput` at 2625–2628. The oracle performs a real check (output presence + crash/hang absence) and reads the scenario's `gracefulAllowOutput` flag; it is not trivially "always pass" — for a malformed input *without* that flag it FAILS any returned output (2614–2617). For this scenario the flag is intentionally set, so partial output is a legitimate PASS.
- **Verdict: WEAK-GATE.** Everything is real — real truncated fixture, real mediabunny Conversion call, real oracle — but the gate is robustness smoke-grade: it only proves "did not crash and produced safe/partial output." It does not verify the trimmed boundaries, decoded frames, or byte layout, so the PASS is real but not a strong correctness claim. No CHEAT for the winner (mediabunny ran a genuine pipeline). Note that the runner-up ffmpeg.wasm's PASS rests on a filename heuristic (adapter.ts:2550–2551) — not a cheat under this oracle's spec, but a reason its PASS is weaker than the winner's.
- **Cached note:** mediabunny's result has `cached:true` ("cached previous PASS result"); ffmpeg.wasm is also `cached:true`. Both were reused, not freshly re-run, so there is a staleness risk — the durations (678 ms / 157 ms) and the PASS verdicts come from a prior run, not this report's invocation.

## Confidence & caveats

- **Confidence: medium.** The PASS/NA structure, fixture reality, adapter code paths, and oracle logic are all directly verified from source. The win is unambiguous on *path quality* (real pipeline vs filename bail).
- Caveats: (1) The gate is a single smoke-grade `graceful-failure` oracle with `gracefulAllowOutput` — no boundary/frame/byte correctness is checked, so this is not evidence mediabunny's trim is *accurate* on healthy input, only that it degrades safely on broken input. (2) Both winning results are `cached:true`; numbers and verdicts may be stale relative to a fresh run. (3) No `bench{}` metrics exist in the shard, so the performance margin is informational only (and ffmpeg's lower wall is an artifact of its early bail, not faster work).
