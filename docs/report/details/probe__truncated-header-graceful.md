# probe/truncated-header-graceful

- **family:** probe
- **fixture asset:** `fixtures/media/truncated_h264.mp4` (373 KB on disk — a real, header-truncated H.264/AAC-in-MP4: `ftyp(isom/iso2/avc1/mp41)` + `free` + an `mdat` whose declared size overruns the file, and **no `moov`** — moov truncated/absent)
- **primaryMetric:** wall (only `durationMs` is recorded in the shard; no `bench{}` object is present for any engine)
- **passCount:** 7 / 7

## Verdict
- **Best framework:** `mediabunny@1.48.0` — CONTESTED (all 7 engines PASS the same single oracle).
- **Decisive factor:** Correctness is tied (every engine satisfies exactly one `graceful-failure` oracle, the weakest "smoke" tier — there is no golden/bit-exact/structural comparison to separate them). The tie therefore breaks on **performance (wall)**. mediabunny detects the truncated/missing `moov` and resolves the probe in **8 ms**, the fastest of all 7.
- **Margin over runner-up:** mp4box@2.3.0 at 10 ms → mediabunny is **1.25x faster wall** than the runner-up, and ~21.9x faster than ffmpeg.wasm (175 ms) and ~751x faster than platform/WebCodecs (6009 ms). Evidence strength is weak: n is effectively 1 (single `durationMs`, no `bench` median/p95/mad/samples), and the gap to mp4box is only 2 ms — within plausible scheduler noise.

## Per-engine results
All seven satisfy the identical oracle `graceful-failure:pass`. No `bench{}` block exists, so throughputRealtime / peakMemory / longtasks were not recorded for this scenario (the `metrics` list declares `wall` + `peakMemory`, but only wall/`durationMs` landed in the shard).

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 8 ms | n/a | n/a | n/a | cached previous PASS; "operation returned partial/safe output and did not crash/hang" |
| mp4box@2.3.0 | PASS | graceful-failure:pass | 10 ms | n/a | n/a | n/a | graceful: mp4box: moov not found (not an ISO-BMFF/MP4 file, or moov truncated) |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:pass | 11 ms | n/a | n/a | n/a | graceful: End of parsing... reached, but no tracks have been found |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 13 ms | n/a | n/a | n/a | graceful: End of parsing... reached, but no tracks have been found |
| web-demuxer@4.0.0 | PASS | graceful-failure:pass | 32 ms | n/a | n/a | n/a | graceful: get_media_info failed: undefined |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 175 ms | n/a | n/a | n/a | graceful: moov atom not found / Invalid data found when processing input / Aborted() |
| platform@chrome-149 | PASS | graceful-failure:pass | 6009 ms | n/a | n/a | n/a | cached previous PASS; "operation returned partial/safe output and did not crash/hang" |

## Why the winner wins (deep technical)

This scenario is a robustness probe, not a fidelity probe. The asset is the first ~60% of a valid progressive MP4: `xxd` shows `ftyp` (major brand `isom`, compatible `iso2/avc1/mp41`) at offset 0, a `free` box, then an `mdat` header at offset 0x2A whose size field (`0x0009 67b9`) points well past the 373 KB EOF, and crucially the `moov` (the box carrying the `trak`/`stbl` sample tables, codec config, and duration) was cut off. Because every ISO-BMFF reader needs the `moov` to enumerate tracks, the *only* correct behaviour is to reject cleanly or return partial-but-safe metadata — never crash, hang, or OOM trying to walk the over-long `mdat`. The gating oracle `graceful-failure` (src/core/oracles.ts:2586) encodes exactly that: with `options.gracefulAllowOutput=true` (scenario index.ts:547), both a clean throw routed by the runner (→ no `ctx.output`, line 2608) and a partial-safe return (line 2611) count as PASS.

Mechanistically, mediabunny wins on the *time-to-graceful-resolution*. Its config (`backend:webcodecs`, `coreBuild:pure-ts-esm`, `pipeline:streaming-lockstep`, `sharedArrayBuffer:false`, `coopCoep:not-required`) means probe is a pure-TS box walk over a streaming reader: it reads the `ftyp`, hits the truncated/missing `moov`, and bails almost immediately. At **8 ms** it produces a partial/safe result (the oracle detail reads "operation returned partial/safe output and did not crash/hang") without ever spinning up WASM, a worker, or the WebCodecs VideoDecoder — it never needs a `moov` to decide the header is unusable. This is the minimal-work path for a malformed header and is why it edges mp4box (10 ms), which must `appendBuffer` the whole file and `flush()` before discovering neither `onReady` nor `onError` fired and synthesising the `reject(new Error('mp4box: moov not found...'))` at src/engines/mp4box/adapter.ts:743.

Contrast with the slow tail. ffmpeg.wasm (175 ms) pays the lavf demuxer-probe cost: its log (`[mov,mp4,m4a,3gp,3g2,mj2] moov atom not found | Invalid data found when processing input | Aborted()`) shows the C `mov` demuxer scanning for the atom, failing, and aborting through the Emscripten runtime — a 21.9x heavier path for the same conclusion. platform@chrome-149 is the outlier at **6009 ms**: its config drives a real WebCodecs/`<video>` pipeline (`decode:VideoDecoder`, `encode:<video>→canvas→MediaRecorder`), and on a header-truncated file the `<video>`/parser path stalls until close to the 15 s timeout cap (`HEADER_TRUNCATED_TIMEOUT_MS`, index.ts:533) before yielding partial/safe output — graceful, but 751x slower than mediabunny.

Because correctness is identical (one smoke-tier oracle each; no golden, no bit-exact, no structural comparison exists to differentiate them), the only separating signal is wall time, and mediabunny is fastest. The win is therefore real but narrow — the metric ladder never gets past rung (b) performance, and the performance gap to mp4box is only 2 ms on n≈1.

## What each other framework did wrong
- **mp4box@2.3.0 (runner-up, 10 ms):** correct and clean — `reject(new Error('mp4box: moov not found...'))` at adapter.ts:743 after whole-file `appendBuffer`+`flush`. Lost on wall only: 1.25x slower than mediabunny, because it buffers the entire 373 KB before concluding no `moov` parsed, vs mediabunny bailing on the streaming header.
- **remotion-media-parser@4.0.479 (11 ms):** clean reject ("End of parsing... reached, but no tracks have been found"). 1.375x slower wall than mediabunny; otherwise equivalent correctness.
- **remotion-webcodecs@4.0.479 (13 ms):** same parser core, same clean reject; 1.625x slower wall.
- **web-demuxer@4.0.0 (32 ms):** clean reject via WASM (`get_media_info failed: undefined`); 4x slower wall — pays WASM-side demuxer cost.
- **ffmpeg.wasm@0.12.15 (175 ms):** clean graceful abort (`moov atom not found` → `Aborted()`); 21.9x slower wall — full lavf probe + Emscripten abort path.
- **platform@chrome-149 (6009 ms):** graceful partial/safe output but ~751x slower wall — the real WebCodecs/`<video>` pipeline stalls near the timeout cap on a moov-less file. Slowest by three orders of magnitude.

## Anti-cheat validation
- **Scenario definition:** src/scenarios/probe/index.ts:535-553 (`id: 'probe/truncated-header-graceful'`, `op:'probe'`, `input:'truncated_h264.mp4'`, `oracles:['graceful-failure']`, `options.gracefulAllowOutput:true`, `timeoutMs:15000`). Notes (index.ts:526-531) document it as the header-truncation analog of the demux fuzz: "~60% of a valid MP4 (moov/mdat incomplete)".
- **Fixture exists & is genuinely malformed:** `fixtures/media/truncated_h264.mp4`, 373 KB. `xxd` confirms `ftyp`+`free`+over-long `mdat` and **no `moov`** — a real corpus asset truncated on disk (no `mutate` needed). Not synthetic/empty/mock. The 0-byte case is a separate scenario (`zero_length.mp4`), so this is distinct, legitimate coverage.
- **Winner adapter is real:** mediabunny probe is a genuine pure-TS ISO-BMFF box walk over a streaming reader (config `coreBuild:pure-ts-esm`, `pipeline:streaming-lockstep`); it returns partial/safe output rather than hardcoded/canned data. No copy-input→output, no golden short-circuit. The other clean-reject engines independently corroborate the file is unparseable (mp4box adapter.ts:740-743 reject; ffmpeg `moov atom not found`).
- **Oracle is appropriate but weak:** `gracefulFailure` (oracles.ts:2586) is a robustness gate, not a fidelity gate. For this scenario it cannot fail unless the engine crashes/hangs/OOMs or (without `gracefulAllowOutput`) emits output from malformed input. With `gracefulAllowOutput:true` BOTH clean-throw and partial-output PASS. That is *correct by design* for a "fail gracefully" test, but it is a smoke-tier gate — it does not compare against any golden, so it cannot distinguish quality among the 7, only liveness.
- **Cached note:** ALL seven results have `cached:true`. The winner (mediabunny) is `"cached previous PASS result"`, as is platform. The five clean-rejecters carry cached error strings. Staleness risk: these were reused, not re-run this session, so the 8 ms vs 10 ms margin reflects prior runs and should not be over-weighted.
- **Verdict:** **WEAK-GATE.** Real fixture + real implementation + a meaningful liveness oracle, but the oracle is smoke/proxy-tier (any non-crashing engine passes; `gracefulAllowOutput` widens it further), so the PASS is real yet weak, and the winner is decided purely on a 2 ms wall margin over cached n≈1 data.

## Confidence & caveats
- **Confidence: low.** The winner is separated only by a 2 ms wall gap (8 ms vs 10 ms) on a smoke-tier oracle, with no `bench{}` (no median/p95/mad/samples) and `cached:true` on every engine. The ranking is plausible (mediabunny's streaming pure-TS header bail is genuinely the lightest path, ffmpeg/platform genuinely the heaviest) but the top-two ordering could flip on a fresh run.
- All 7 engines are functionally correct here — this scenario validates robustness, not fidelity, so "best" means "fastest to fail gracefully," not "most accurate."
- `peakMemory` was declared in `metrics` but not captured in the shard; a memory-based tiebreak was not possible.
- Per the launcher seeding caveat, fully-cached PASS cells like these should be re-run with cleared raw + `.browser-cache` for an honest fresh timing before treating the 8 ms vs 10 ms margin as load-bearing.
