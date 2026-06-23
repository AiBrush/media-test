# audio-dsp/fuzz_wav_header_truncated_probe

family: audio-dsp | fixture asset: `wav_header_truncated.wav` (20 bytes, real fixture) | primaryMetric: none (graceful-failure robustness probe; only `durationMs` recorded) | passCount: 5 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 5 of 7 engines PASS the single gating oracle).
- **Decisive factor:** All 5 passing engines satisfy the *identical* single oracle (`graceful-failure`), so correctness strength is a flat tie — there is no stronger oracle to separate them, and the scenario records no bench block (no wall/throughput/memory metrics, only `durationMs`). On the durationMs tiebreak mediabunny and remotion-media-parser tie at the floor (7ms each), beating platform (21ms), remotion-webcodecs (12ms) and ffmpeg.wasm (135ms). The break between the two 7ms engines goes to **mediabunny** on the qualitative tiebreaker in the decision procedure (4c): its rejection comes from a *real structural RIFF chunk-walk* — `Invalid WAVE file - missing "fmt " chunk` — proving it parsed the truncated container and identified the specific missing chunk, versus remotion-media-parser's generic `Offset is outside the bounds of the DataView` (a low-level buffer-bounds throw). mediabunny also runs pure-TS-ESM with `coopCoep: not-required` and `sharedArrayBuffer: false`, declaring `wav` as a first-class container.
- **Margin over runner-up:** 0ms wall margin vs remotion-media-parser (7ms vs 7ms — a true tie on time; decided on rejection quality, not speed). 3.0x faster than platform (7ms vs 21ms) and 19.3x faster than ffmpeg.wasm (7ms vs 135ms). Note: durationMs on a graceful-throw path is dominated by library load/parse-init, n is effectively 1, so the time margin is weak evidence; the rejection-quality tiebreak is the real differentiator.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs 7) | n/a | n/a | n/a | cached: graceful: Invalid WAVE file - missing "fmt " chunk |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | n/a (durationMs 7) | n/a | n/a | n/a | cached: graceful: Offset is outside the bounds of the DataView |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | n/a (durationMs 12) | n/a | n/a | n/a | cached: graceful: Offset is outside the bounds of the DataView |
| platform@chrome-149 | PASS | graceful-failure:true | n/a (durationMs 21) | n/a | n/a | n/a | cached: graceful: WAV missing fmt chunk |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs 135) | n/a | n/a | n/a | cached: graceful: ffmpeg could not read input for probe. Log: op1.in: Invalid data found when processing input \| Aborted() |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'wav' |

No engine recorded a `bench{}` block for this scenario — it is a malformed-input probe whose success criterion is "throw cleanly / emit no output", so only `durationMs` exists. All numbers above are real shard values.

## Why the winner wins (deep technical)

The input is `wav_header_truncated.wav`, a 20-byte file. Hexdump confirms the bytes are exactly `52 49 46 46 24 a6 0e 00 57 41 56 45 66 6d 74 20 10 00 00 00` = `RIFF`, a (now-bogus) 0x000EA624 RIFF size, `WAVE`, the `fmt ` FourCC, and a declared `fmt ` chunk length of 0x00000010 (16) — but the file ends right there, before any of the 16 promised `fmt ` body bytes (no audio-format tag, no channel count, no sample rate, and no `data` chunk at all). A correct WAV reader must walk the RIFF chunk table, see that the declared `fmt ` chunk extends past EOF, and refuse the file. The oracle `graceful-failure` (src/core/oracles.ts:2586) routes a runner-caught throw to PASS for a robustness scenario (`ctx.scenario.oracles.includes('graceful-failure')` branch, line 2606), so any engine that throws/rejects instead of crashing, hanging, or fabricating metadata passes.

Because the oracle is binary and identical for all five passers, correctness strength (decision step 4a) cannot rank them — they all clear exactly one smoke-grade robustness gate, no stronger oracle exists in this scenario, and no perceptual/structural/bit-exact gate is present. The tie therefore falls to step 4b (performance) and 4c (qualitative tiebreakers).

On durationMs, mediabunny and remotion-media-parser both reject in 7ms — the floor of the field. platform takes 21ms, remotion-webcodecs 12ms, ffmpeg.wasm 135ms (it must boot the wasm core and run `avformat_open_input` before libavformat returns `Invalid data found`, then `Aborted()`). Among the two 7ms engines, the qualitative tiebreaker decides: mediabunny's adapter declares `wav` as a first-class read container (src/engines/mediabunny/adapter.ts:1036) and probe as a real op (adapter.ts:1023), and its WAVE input format (src/engines/mediabunny/codecs.ts:18,134) performs an actual RIFF chunk walk. The error string `Invalid WAVE file - missing "fmt " chunk` is mediabunny's own structural diagnostic — it consumed the RIFF/WAVE preamble, looked for the `fmt ` chunk *body*, found the stream truncated, and named the precise missing element. That is a semantically richer rejection than remotion-media-parser's `Offset is outside the bounds of the DataView`, which is a generic JS DataView over-read raised deep inside the byte reader (the parser tried to read past the 20-byte buffer). Both are "graceful", but mediabunny's path demonstrates it understood the container grammar rather than merely tripping a buffer bound. mediabunny additionally runs `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required` (shard env.configUsed), so it needs no cross-origin isolation and no wasm — the lightest deployment among the field.

## What each other framework did wrong

- **remotion-media-parser@4.0.479 (PASS, tied runner-up):** Equal 7ms, also genuinely fed the corrupted Blob through `@remotion/media-parser` (probe path src/engines/remotion-media-parser/adapter.ts:348, which deliberately feeds mutation/truncated bytes so fuzz cases throw cleanly — comment at adapter.ts:344-346). Lost only on rejection quality: its throw is a generic `Offset is outside the bounds of the DataView` buffer-bounds error rather than a named structural `fmt`-chunk diagnostic. Effectively co-winner on speed; ranked second on the 4c qualitative tiebreak.
- **remotion-webcodecs@4.0.479 (PASS):** Rejected gracefully (`Offset is outside the bounds of the DataView`) but at 12ms — 1.7x slower than the 7ms leaders, and same generic buffer-bounds error quality.
- **platform@chrome-149 (PASS):** Rejected with a good structural message (`WAV missing fmt chunk`) but at 21ms, 3.0x slower than mediabunny; the browser-native path is heavier to spin up for a tiny probe.
- **ffmpeg.wasm@0.12.15 (PASS):** Rejected correctly (`Invalid data found when processing input`, then `Aborted()`) but at 135ms — 19.3x slower than the leaders due to wasm core boot + libavformat open before it gives up.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — `engine does not declare input container 'wav'`. MP4Box.js is an ISOBMFF/MP4 box parser with no RIFF/WAVE reader; not declaring `wav` is correct, not an under-declared capability.
- **web-demuxer@4.0.0 (NA_ENGINE):** Honest NA — same reason. web-demuxer targets MP4/MKV/WebM/TS demux; it has no WAV path, so the NA is genuine.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/audio-dsp/index.ts:597-605 (`fuzz_wav_header_truncated_probe`), op `probe`, asset `wav_header_truncated.wav`, container `wav`, oracle `['graceful-failure']`. Notes (line 603-604): "A.16 header-truncated WAV: only the first 20 bytes kept (fmt/data chunk gone); probe must reject cleanly." Generated via `defineScenario` at index.ts:641.
- **Fixture exists and is real:** `fixtures/media/wav_header_truncated.wav`, 20 bytes (`stat` confirmed). Hexdump shows a real-but-truncated RIFF/WAVE/`fmt ` header — not empty, not synthetic-mock; it is a deliberately mutated real WAV header. Genuinely malformed input as intended.
- **Oracle:** `gracefulFailure` at src/core/oracles.ts:2586-2623. It is NOT trivially-pass-everything: a fabricated-metadata path would hit the `return fail(...)` at line 2614 ("operation produced output from malformed/mutated input"), and a `crash/hang/timeout/oom` runner signal fails at line 2594. PASS requires either no output (line 2608) or an explicitly allowed partial output — for a *probe* with no `gracefulAllowOutput`, the engine must throw and produce no metadata. This is a meaningful (though smoke-grade) robustness gate.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1023 (probe declared), :1036 (`wav` in containersIn); WAVE input format wired at src/engines/mediabunny/codecs.ts:18,134. The probe calls the real mediabunny library against the corrupted bytes — no canned output, no golden short-circuit, no input->output copy; it raises mediabunny's own structural error `Invalid WAVE file - missing "fmt " chunk`, proving real parsing.
- **Verdict: WEAK-GATE.** The fixture is real, the implementation is genuine, and the oracle is a real check — but it is a single binary smoke-grade robustness gate ("throw cleanly"), not a correctness comparison against goldens. The PASS is real but not strong, and it does not distinguish the five passers on correctness (only on the speed + rejection-quality tiebreak). No CHEAT/SUSPECT evidence found.
- **Cached note:** ALL engine results have `cached: true` (re-used, not re-run this session). Staleness risk: the durationMs values and error strings are from a prior run. The per-project memory flags stale-PASS reuse from the launcher; for an honest fresh re-measure, clear raw + `.browser-cache`. The correctness verdict (graceful rejection) is robust to caching; only the fine-grained 7ms-vs-7ms timing could shift.

## Confidence & caveats

- Confidence: **medium**. The winner is unambiguous on the binary oracle and on being at the speed floor, but the win over remotion-media-parser is a 0ms tie decided on rejection-message quality (a qualitative 4c tiebreaker), not a measured performance gap — so it is genuinely close.
- This scenario has no bench block and no strong (bit-exact/structural) oracle, so "best" here means "rejects malformed WAV cleanest and fastest", not "best transcode/decode quality". Do not over-read the ranking into general WAV competence.
- All evidence is cached (every engine `cached: true`); a fresh run could reorder the 7ms/12ms/21ms timings, though the PASS/NA structure should hold.
- The two NA_ENGINE results (mp4box, web-demuxer) are honest container non-declarations, not hidden failures.
