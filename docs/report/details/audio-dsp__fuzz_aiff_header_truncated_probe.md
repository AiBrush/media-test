# audio-dsp/fuzz_aiff_header_truncated_probe

family: audio-dsp | fixture asset: `aiff_header_truncated.aiff` | primaryMetric: wall | passCount: 1

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (uncontested — exactly 1 PASS of 7 engines).
- **Decisive factor:** It is the *only* engine that declares `aiff` as an input container, so it is the only engine the runner even dispatched. The other six were gated out at NA_ENGINE before any code ran. Among engines that actually executed the probe, ffmpeg.wasm satisfied the `graceful-failure` oracle by rejecting the corrupt big-endian AIFF cleanly (a clean throw, no crash/hang/OOM).
- **Margin over runner-up:** Not applicable in the performance sense — there is no second PASS to compare against. The runner-up cohort are all NA_ENGINE (capability-gated), not slower passes. ffmpeg.wasm completed in `durationMs: 148` (cached).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | n/a (no bench; durationMs 148) | n/a | n/a | n/a | cached: graceful: ffmpeg could not read input for probe. Log: `[aiff @ 0xdeec10] exp -16446 is out of range \| op1.in: Invalid data found when processing input \| Aborted()` |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |

No `bench{}` block is present in the shard for any engine (the gating metric for this probe is wall/peakMemory per the scenario, but a graceful-failure case records only the pass/fail signal and a `durationMs`).

## Why the winner wins (deep technical)

This is an A.16 robustness fuzz case. The fixture `aiff_header_truncated.aiff` is a 24-byte file:
`46 4F 52 4D 00 0E A6 2E 41 49 46 46 43 4F 4D 4D 00 00 00 12 00 02 00 03` — i.e. a valid `FORM` magic, a `FORM` size of `0x000EA62E`, the `AIFF` form-type, then a `COMM` chunk header whose declared chunk size is `0x00000012` (18 bytes) but only 4 of those 18 bytes are present (`00 02 00 03` = numChannels=2, then the start of numSampleFrames). The sampleSize, the 80-bit IEEE-754 extended `sampleRate` field, and the entire `SSND` sound-data chunk are all gone. The COMM chunk is truncated mid-descriptor.

The operation under test is `probe`. ffmpeg.wasm's probe path (`src/engines/ffmpeg-wasm/adapter.ts:1892` `probe()`) writes the input to the MEMFS scratch file and calls `runInfo()` (`adapter.ts:1912`), which runs `ffmpeg -hide_banner -i <in>` with a hard `READ_EXEC_TIMEOUT_MS` guard (`adapter.ts:1918`). The vendored libavformat AIFF demuxer attempts to parse the COMM chunk's 80-bit extended sample-rate field from bytes that do not exist / are garbage, producing the diagnostic captured in the shard reason: `[aiff @ 0xdeec10] exp -16446 is out of range` (the exponent decoded from the bogus/absent extended-float bytes is nonsensical), followed by `op1.in: Invalid data found when processing input` and `Aborted()`. Because libavformat never emits an `Input #0` block for an input it cannot open, `runInfo()`'s guard `if (!/^Input #\d+/m.test(log))` (`adapter.ts:1924`) fires and throws a plain `Error` (`adapter.ts:1925-1927`). Note this deliberately avoids the broken `_ffprobe` entry point (`adapter.ts:262-267`) and derives everything from the reliable `ffmpeg` program log — so the rejection is driven by real demuxer parsing, not a stubbed ffprobe.

The runner catches that plain throw and routes it to the `graceful-failure` oracle (`src/core/oracles.ts:2586`). Since there is no `signal:` marker in the scenario notes, the oracle falls to its inference branch: the scenario lists `graceful-failure` in `oracles` (`oracles.ts:2606`), and the operation produced no `output`/`metadata`/`demux`/`frames` (`oracles.ts:2608`), so it returns PASS with `"operation produced no output and did not crash/hang → handled gracefully"` — exactly the `oracleOutcomes[0].detail` recorded in the shard. The win is therefore mechanistically grounded: a real wasm-libavformat AIFF demuxer hit a real parse error on a real truncated COMM chunk, surfaced it as a clean throw within the timeout, and the oracle confirmed no output leaked.

The backend was single-thread ffmpeg.wasm (the env shows `engineId: ffmpeg-wasm`, Chromium 149 on an M1 Max; no hardware codec or WebCodecs involvement, which is correct — this is container header parsing, not decoding). The `Aborted()` is the wasm runtime unwinding after libavformat's failure, contained by the adapter's try/catch around `ff.exec` (`adapter.ts:1919-1921`); it does not propagate as a crash, which is precisely what graceful-failure requires.

## What each other framework did wrong

- **platform@chrome-149** — NA_ENGINE, "engine does not declare input container 'aiff'". Honest NA: WebCodecs/WebAudio in Chrome has no AIFF container demuxer surface exposed to this suite; declining is correct, not an under-declaration.
- **mp4box@2.3.0** — NA_ENGINE, same reason. Honest: MP4Box parses ISO-BMFF (MP4/MOV/fMP4) only; AIFF (EA-IFF-85 chunked) is out of scope.
- **remotion-media-parser@4.0.479** — NA_ENGINE, same reason. Its codecs.ts mentions `aiff` only as a *codec/audio-codec passthrough name* (`codecs.ts:8,47,72`), not as a registered input *container* in `requires.containersIn`; the runner's container gate therefore correctly excludes it. Honest NA.
- **mediabunny@1.48.0** — NA_ENGINE, same reason. Mediabunny's input demuxers do not include AIFF; honest.
- **web-demuxer@4.0.0** — NA_ENGINE, same reason. Honest; its ffmpeg-derived demuxer build does not register AIFF in this suite's container map.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, same reason. `aiff` appears only in a codecs.ts comment (`codecs.ts:112`), not as a declared input container. Honest NA.

All six NAs are capability-gated *before* the probe runs, so none "did anything wrong" at runtime — they simply do not claim AIFF demux. ffmpeg.wasm is the lone engine registering `aiff` as a demux container (`src/engines/ffmpeg-wasm/codecs.ts:83`).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/audio-dsp/index.ts:630` (`id: 'fuzz_aiff_header_truncated_probe'`, op `probe`, asset `aiff_header_truncated.aiff`, container `aiff`, codec `pcm-s16be`, oracle `graceful-failure`). Notes (line 636-637): "A.16 header-truncated AIFF: FORM/COMM header destroyed; big-endian PCM probe must reject cleanly." Gating rationale is a genuine negative/robustness assertion.
- **Fixture:** `fixtures/media/aiff_header_truncated.aiff` exists, 24 bytes. Hexdump confirms it is a real (deliberately truncated) AIFF: valid `FORM....AIFF` + truncated `COMM` chunk that claims 18 bytes but supplies 4. Not synthetic-empty, not a mock; it is a real malformed media file as the test intends.
- **Oracle:** `graceful-failure` at `src/core/oracles.ts:2586-2623`. It is NOT trivially satisfiable for this case: it PASSes only when the op produced no output AND did not crash/hang (`oracles.ts:2608-2609`); if a known-malformed input had produced output it would FAIL (`oracles.ts:2614-2617`). It is a smoke/negative gate by design (correct gate for a "must reject cleanly" probe), not a loose proxy masquerading as a correctness gate.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:1892` (`probe`) → `:1912` (`runInfo`) → `:1924` (`!/^Input #/` guard) → `:1925` throw. The rejection is produced by the real vendored libavformat AIFF demuxer (log: `exp -16446 is out of range`), not canned: no hardcoded output, no input→output copy, no short-circuit to a golden, no error-swallow-then-success (the catch at `:1919` only absorbs the deliberate "no output file" abort; the genuine parse failure is detected by the missing `Input #` block and re-thrown).
- **cached note:** ffmpeg.wasm's result has `cached: true` (`durationMs: 148`). The PASS was reused from a prior run, not re-executed this run — mild staleness risk, but the embedded log diagnostic is specific and physically consistent with the fixture's truncated COMM chunk, so the evidence is credible.
- **Verdict: REAL.** Real malformed fixture + real libavformat demuxer rejection + meaningful negative oracle that can fail.

## Confidence & caveats

- Confidence: **high**. Single uncontested PASS; the win is structurally forced (sole AIFF-container engine) and the failure path is grounded in a real, fixture-consistent libavformat diagnostic.
- Caveat 1: result is `cached: true` — not re-run this cycle; if libavformat behavior changed it would not be reflected.
- Caveat 2: this is a negative/robustness gate (graceful-failure), so the PASS proves "rejects cleanly," not decode correctness; there is no bit-exact/structural oracle here by design.
- Caveat 3: no `bench{}` numbers exist in the shard; performance comparison is moot since there is exactly one PASS.
