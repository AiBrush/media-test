# robustness/fuzz_truncated_h264_asset_demux

- **Family:** robustness
- **Fixture asset:** `fixtures/media/truncated_h264.mp4` (real x264-encoded MP4, 373,248 bytes; `ftyp(isom/avc1/mp41)` + `free` + truncated `mdat` declaring size `0x000967b9` ≈ 616 KB but no full payload, and **NO `moov` box** — the sample table is missing entirely)
- **Operation:** demux
- **primaryMetric:** wall (only `durationMs` recorded in this cached shard; no `bench{}` block present)
- **passCount:** 6 of 7 PASS (1 NA_ENGINE)

## Verdict

- **Best framework:** `mediabunny@1.48.0` (PASS)
- **Contested:** Yes — 6 engines PASS the single `graceful-failure` oracle; platform is NA_ENGINE.
- **Decisive factor:** Among the 6 PASS engines mediabunny is (tied-)fastest at **15 ms** and is the **only** engine that produced a *partial/safe output* path (`gracefulAllowOutput`) rather than erroring out on the missing `moov`. It exercised real demux logic against the truncated bitstream and degraded cleanly — the exact "clean partial + EOF" behavior the scenario notes call for ("Engine must yield a clean partial+EOF or reject, not fault on the missing tail").
- **Margin over runner-up:** mp4box ties on wall at 15 ms but only *rejected* ("moov not found"); mediabunny degraded with partial output → stronger graceful behavior at equal cost. Next fastest distinct: remotion-media-parser 17 ms (1.13x slower), then remotion-webcodecs 24 ms (1.6x), web-demuxer 38 ms (2.5x), ffmpeg.wasm 140 ms (**9.3x slower**).

## Per-engine results

| Engine | Status | Oracles passed | Wall (durationMs) | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 15 ms | n/a | n/a | n/a | cached previous PASS; returned partial/safe output, no crash/hang |
| mp4box@2.3.0 | PASS | graceful-failure:pass | 15 ms | n/a | n/a | n/a | mp4box: moov not found (not an ISO-BMFF/MP4 file, or moov truncated) |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:pass | 17 ms | n/a | n/a | n/a | graceful: Server returned status code 416 for truncated_h264.mp4 and range 373248 |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 24 ms | n/a | n/a | n/a | graceful: Server returned status code 416 for truncated_h264.mp4 and range 373248 |
| web-demuxer@4.0.0 | PASS | graceful-failure:pass | 38 ms | n/a | n/a | n/a | graceful: get_media_info failed: undefined |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 140 ms | n/a | n/a | n/a | graceful: demux failed to open input (framecrc exit 1). Log: moov atom not found / Invalid data / Aborted() |
| platform@chrome-149 | NA_ENGINE | (none) | 5953 ms | n/a | n/a | n/a | platform engine: demux is NA — no moov box (not a progressive MP4 or truncated) |

(No `bench{}` was recorded for any engine in this shard — throughputRealtime/peakMemory/longtasks are unavailable; ranking uses `durationMs`.)

## Why the winner wins (deep technical)

The asset is a **deliberately truncated H.264-in-MP4**. The hex header confirms `ftyp` (brands `isom`/`iso2`/`avc1`/`mp41`), a `free` box, then an `mdat` whose box size field is `0x000967b9` (~616 KB) while the whole file is only 373,248 bytes — and there is **no `moov` box at all**. With no `moov` there is no `stbl` (no `stsz`/`stco`/`stts`/`stss`), so no demuxer can build a sample table; a correct engine must either reject cleanly or emit a clean partial without faulting on the missing tail (scenario notes, src/scenarios/robustness/index.ts:860-863).

mediabunny ran on its `webcodecs`/`pure-ts-esm` backend (env.configUsed: `coreBuild:"pure-ts-esm"`, `coopCoep:"not-required"`, `sharedArrayBuffer:false`). Its `demux()` opens the input via `openInput()` and iterates tracks with `EncodedPacketSink.packets(..., { verifyKeyPackets:true })` (src/engines/mediabunny/adapter.ts:1152-1183). Against this file mediabunny's ISO-BMFF parser found `ftyp`/`mdat` but no `moov`, so it yielded an empty/partial track set instead of throwing — the runner therefore got a defined `OpResult` and recorded verdict `graceful` (src/core/runner.ts:1028-1030). Because the scenario sets `options.gracefulAllowOutput: true` (src/scenarios/robustness/index.ts:859), the `graceful-failure` oracle took the `gracefulAllowsReturnedOutput` branch and PASSed with detail "operation returned partial/safe output and did not crash/hang" (src/core/oracles.ts:2611-2612, 2625-2628). That is the strongest reading of the gate: it didn't merely throw, it demonstrated the parser degrades to a safe empty/partial result on a headerless stream — at the (tied) lowest wall of 15 ms, with no COOP/COEP requirement and no wasm thread dependency.

Every other PASS engine satisfied the *same* single oracle but via the weaker "produced no output → inferred graceful" branch (src/core/oracles.ts:2607-2609): they threw/rejected. mp4box matched mediabunny's 15 ms but only emitted "moov not found"; the wasm and HTTP-range engines were materially slower. The decisive separation is therefore (correctness-strength) mediabunny's partial-output degrade > pure rejection, with (performance) a tie-or-better wall and a hardware-friendly, COOP/COEP-free, single-thread config as the tiebreaker.

A notable artifact: three engines (remotion-media-parser, remotion-webcodecs, web-demuxer's range reads) "passed" not by parsing the file but because the dev server returned **HTTP 416** for a Range request at offset 373248 (the exact file length) — i.e. their range-reader requested past EOF and the 416 surfaced as a clean rejection. That is still graceful (no crash/hang) and legitimately PASSes the robustness gate, but it is a transport-layer rejection, not demux-layer truncation handling — weaker evidence than mediabunny actually parsing the boxes.

## What each other framework did wrong

- **mp4box@2.3.0 (PASS, lost):** Rejected with "moov not found (not an ISO-BMFF/MP4 file, or moov truncated)". Ties mediabunny on wall (15 ms) but only threw — no partial/safe-output path, so it loses the correctness-strength tiebreak (pure reject < graceful partial degrade).
- **remotion-media-parser@4.0.479 (PASS, lost):** Graceful via an **HTTP 416** on a Range read at offset 373248 (transport rejection, not demux truncation handling). Slower at 17 ms (1.13x).
- **remotion-webcodecs@4.0.479 (PASS, lost):** Same **416** range-read rejection (adapterFastPaths uses http-range for large MP4 demux). Slowest of the JS engines at 24 ms (1.6x); evidence is transport-layer, not parser-layer.
- **web-demuxer@4.0.0 (PASS, lost):** `get_media_info failed: undefined` — its libav/wasm probe returned a failure object; graceful but uninformative, and 38 ms (2.5x slower).
- **ffmpeg.wasm@0.12.15 (PASS, lost):** libavformat reported "moov atom not found / Invalid data found / Aborted()" (framecrc exit 1). Graceful, but the single-thread wasm path cost **140 ms (9.3x slower)** — by far the slowest; clearly loses on performance.
- **platform@chrome-149 (NA_ENGINE):** Its inline demuxer throws `UnsupportedMp4Error('no moov box ...')` (src/engines/platform/demux-mp4.ts:719), which adapter.ts:347-348 converts to `NotApplicableError('demux', ...)`, and the runner maps that to NA_ENGINE (src/core/runner.ts:590-591, 1032-1033). **This NA is borderline:** platform *declares* the demux op and MP4 container, so a no-moov truncation is a *runtime data condition*, not an undeclared capability — arguably it should have been routed to `graceful` (it did reject cleanly). Treating "no moov" as NA lets platform sidestep the robustness gate it would otherwise have PASSed. Per the decision procedure NA cannot win regardless, so it is excluded; flagged here as a slightly over-broad NA, not a correctness failure.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/robustness/index.ts:852-864 (`id: 'fuzz_truncated_h264_asset_demux'`, `asset: 'truncated_h264.mp4'`, `op: 'demux'`, `containersIn:['mp4']`, `videoCodecs:['h264']`, `options:{gracefulAllowOutput:true}`, `oracles:['graceful-failure']`). Notes (§A.16) explicitly describe a shipped truncated asset with incomplete moov/mdat; "Verdict by output-absence, not notes."
- **Fixture exists / is real:** `fixtures/media/truncated_h264.mp4`, 373,248 bytes. Hex confirms a genuine x264 stream (`x264 - co...` SEI string visible in mdat at ~0x130) inside an ISO-BMFF wrapper with `ftyp`+`free`+truncated `mdat` and **no `moov`**. Not synthetic/empty/mock; it is exactly the malformed edge the scenario targets. The HTTP-416 errors at range 373248 corroborate the file length.
- **Winner adapter genuinely implements demux:** src/engines/mediabunny/adapter.ts:1152-1183 calls real mediabunny APIs (`openInput`, `getTracks`, `EncodedPacketSink.packets({verifyKeyPackets:true})`). No canned output, no copy-input-to-output, no short-circuit to a golden, no error-swallow-then-report-success — when it cannot find tracks it returns an empty/partial result, which the runner records honestly.
- **Oracle is meaningful (for a robustness gate):** src/core/oracles.ts:2586-2628. It PASSes only on (a) no output produced (inferred clean throw) or (b) returned output WITH `gracefulAllowOutput:true`; it FAILs on timeout (src/core/runner.ts:1044-1045) and on output from malformed input when output is NOT allowed. This is a smoke/robustness gate by design (no golden comparison) — appropriate for a fuzz/truncation case, but not a bit-exact correctness gate.
- **Cached:** ALL 7 entries have `cached:true` — every result was reused, not re-run in this pass. Staleness risk: the relative ranking (mediabunny/mp4box 15 ms fastest, ffmpeg.wasm 140 ms slowest) is plausible and self-consistent, but a fresh re-run is advisable to confirm the 15 ms vs 15 ms tie and the partial-output branch.
- **Verdict:** **WEAK-GATE.** Real fixture + real mediabunny demux implementation + a meaningful-but-loose oracle. The PASS is genuine, but `graceful-failure` is a robustness smoke gate (no golden/decoded comparison), so the win is "handled truncation gracefully and fastest," not "decoded/demuxed correctly." Not a CHEAT — no faked output or unfailable oracle was found.

## Confidence & caveats

- **Confidence: medium.** The fixture and the winner's code path are verified real; the oracle is genuine but intentionally loose (robustness smoke), so winner separation among 6 PASS engines rests on a thin 0–2 ms wall margin plus the partial-output-vs-reject distinction.
- All evidence is **cached** (`cached:true` everywhere); no `bench{}` block exists, so peakMemory/throughput/longtasks comparisons were impossible — ranking used `durationMs` only.
- mediabunny vs mp4box is a 15 ms tie on wall; the win hinges on mediabunny taking the partial-output branch (stronger graceful behavior). If a fresh run shows mp4box equal or faster and mediabunny also merely rejecting, the two become effectively co-best.
- platform's NA_ENGINE classification for a no-moov runtime condition looks slightly over-broad (it declares demux+MP4); worth revisiting whether it should be a graceful PASS instead.
