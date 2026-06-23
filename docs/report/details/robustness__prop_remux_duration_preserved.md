# robustness/prop_remux_duration_preserved

family: robustness | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264/AAC in MP4, 1920×1080@30fps, 30s, ~31 MB) | output container: `mov` (QuickTime) | primaryMetric: durationMs (no `bench` block in this shard) | passCount: 2 of 7

## Verdict

**Best framework: ffmpeg.wasm@0.12.15** — **CONTESTED** (2 engines PASS: `ffmpeg-wasm` and `mediabunny`).

Both winners pass the **identical, maximally-strict** oracle: `property-invariant` resolving to the bit-exact frame-digest path `decode(remux(x))==decode(x)` with **12/12 frames compared, 0 mismatched**. Correctness is therefore a dead tie. The decisive factor is the **only numeric performance signal present in this shard — `durationMs`**: ffmpeg-wasm 638 ms vs mediabunny 736 ms = **~1.15× faster wall (736/638 = 1.154)**.

CAVEAT: this margin is thin and weak evidence. There is no `bench{}` block for this scenario (no median/p95/mad, n=1), both results are `cached==true`, and `durationMs` is whole-run latency (includes wasm-core/Conversion setup), not a clean remux throughput metric. On deployment hygiene mediabunny is arguably preferable (see tiebreakers). The pick reflects the literal decision ladder where, correctness being equal, the lone available perf number decides.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (12/12 bit-exact) | 638 ms | n/a (no bench) | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true (12/12 bit-exact) | 736 ms | n/a (no bench) | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |

No bench metrics (throughputRealtime/peakMemory/longtasks) are present in this shard for any engine; only `durationMs` and the oracle outcomes are recorded.

## Why the winner wins (deep technical)

**The operation.** This is a *lossless container rewrap*: take the H.264 video + AAC audio elementary streams out of an MP4 (ISOBMFF, `major_brand: isom`, per `fixtures/golden/h264_1080p_30s.mp4.meta.json`) and re-wrap them into a QuickTime `mov` container — no re-encoding of pixels or PCM. The metamorphic property under test is `decode(remux(x)) == decode(x)`: the remuxed MOV must decode to the *exact same pixels* as the source MP4. Because no sample bytes are transcoded, the decoded frames must be bit-identical, which is why the oracle uses the strongest gate (SHA-256 of normalized RGBA), not a tolerance/SSIM proxy.

**Oracle routing nuance (important).** The scenario's declared invariant string is `probe(remux(x)).dur≈probe(x).dur` (src/scenarios/robustness/index.ts:408). In `propertyInvariant` (src/core/oracles.ts:2645) dispatch is by substring, and the `which.includes('remux')` branch (src/core/oracles.ts:2686) is tested *before* the `which.includes('duration')`/`probe` branch (src/core/oracles.ts:2709). The string contains "remux", so the oracle routes to the **frame-digest decode-remux path**, not the looser reference-probe duration comparison. The net effect is a *stronger* gate than the scenario name implies: instead of a `±tol` duration band, the remux is validated by decoding the output and demanding zero RGBA digest mismatches against `fixtures/golden/h264_1080p_30s.mp4.frames.json` (`pending:false`, real sha256 values). Both PASS engines clear this with `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0`.

**ffmpeg.wasm winner path.** `remux()` (src/engines/ffmpeg-wasm/adapter.ts:2031) first probes the input via `runInfo` and `assertRemuxContainerCompatible(inputMetadata.tracks, 'mov')`, then stream-copies with `['-i', name, '-map', '0', '-c', 'copy']` and, because the target is `mov`, appends `-movflags +faststart` (src/engines/ffmpeg-wasm/adapter.ts:2044–2050). `-map 0 -c copy` is a true demux→remux: H.264 NALs and AAC frames are copied byte-for-byte into a fresh QuickTime moov/mdat with no decoder/encoder in the loop, so the decoded pixels are necessarily preserved — which is exactly what the bit-exact oracle confirms (12/12). `+faststart` moves the moov ahead of mdat (a second pass over the file) but does not alter sample data. This path completes in **638 ms** total.

**Why it edges mediabunny.** mediabunny's `remux()` (src/engines/mediabunny/adapter.ts:1244) builds a QuickTime `Output` via `makeOutputFormat('mov', …)` and runs `runConversion` with no video codec requested, so mediabunny's `Conversion` recognizes a copy-through and performs a packet-level rewrap (its `remux:true` capability, declared at src/engines/mediabunny/adapter.ts:1025) on its WebCodecs/streaming-lockstep backend (`env.configUsed`: `backend:webcodecs`, `pipeline:streaming-lockstep`, `coreBuild:pure-ts-esm`, `coopCoep:not-required`). It is equally bit-exact (12/12), but its measured whole-run latency is **736 ms**, ~1.15× higher than ffmpeg-wasm's 638 ms. For a pure stream-copy neither engine actually exercises a hardware video codec (no decode/encode happens), so mediabunny's WebCodecs/hardware advantage does not apply to the rewrap itself; the durationMs is dominated by I/O + container assembly, where the single-thread ffmpeg `-c copy` path was marginally quicker on this run.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed, lost on the only metric: durationMs 736 ms vs ffmpeg-wasm 638 ms (1.15× slower; equivalently 0.87× the speed). Correctness identical (property-invariant 12/12 bit-exact). Loss is on a single, cached, n=1 latency sample — weak evidence; mediabunny is genuinely competitive and has the cleaner runtime profile (no COOP/COEP, no multi-MB wasm core).
- **web-demuxer@4.0.0** — NA_ENGINE "does not declare operation 'remux'". Honest: it is a read-only demuxer (`containersOut: []`, src/engines/web-demuxer/adapter.ts:641; `remux()` is a stub). No muxer exists, so it cannot produce a MOV.
- **remotion-media-parser@4.0.479** — NA_ENGINE "does not declare operation 'remux'". Honest: read-only parser with no muxer (`containersOut: []` ~line 199; `remux()` throws "read-only parser; no muxer", src/engines/remotion-media-parser/adapter.ts:548).
- **platform@chrome-149** — NA_ENGINE "does not declare operation 'remux'". Honest: declares `remux:false` (src/engines/platform/adapter.ts:233) — raw WebCodecs/`<video>` cannot losslessly rewrap encoded samples into a container; `remux()` throws NotApplicableError (src/engines/platform/adapter.ts:355).
- **remotion-webcodecs@4.0.479** — NA_ENGINE "does not declare output container 'mov'". Honest: it *does* declare `remux:true` (src/engines/remotion-webcodecs/adapter.ts:243) but `containersOut = ['mp4','webm','wav']` (src/engines/remotion-webcodecs/codecs.ts:26) — it can write MP4 but not QuickTime MOV, so it is correctly gated out of this specific MP4→MOV path.
- **mp4box@2.3.0** — NA_ENGINE "does not declare output container 'mov'". Honest: declares `remux:true` but only to fragmented-MP4 within the ISOBMFF family, `containersOut: ['mp4']` (src/engines/mp4box/adapter.ts:647). It does not author a `mov`/QuickTime brand output, so the gate is correct, not an under-declaration.

## Anti-cheat validation

- **Scenario**: src/scenarios/robustness/index.ts:407–417 (`id: 'prop_remux_duration_preserved'`, `op:'remux'`, `input:'h264_1080p_30s.mp4'`, `containersIn:['mp4']`, `containersOut:['mov']`, `videoCodecs:['h264']`, `audioCodecs:['aac']`). Notes: "Duration is invariant under a lossless container change."
- **Fixture exists & is real**: `fixtures/media/h264_1080p_30s.mp4` present, ~31 MB (`stat` confirms 31M), a genuine 1920×1080@30fps H.264/AAC 30s clip per `fixtures/golden/h264_1080p_30s.mp4.meta.json`. Not synthetic/empty/mock.
- **Oracle is real**: `propertyInvariant` (src/core/oracles.ts:2645) routes via the `remux` substring (src/core/oracles.ts:2686) into `ctx.decodeWithPlatform(ctx.output)` then `compareDigests` (src/core/oracles.ts:1166). `compareDigests` requires `mismatches===0` over all overlapping frames matched by index/PTS and compares normHex(sha256) of decoded RGBA against golden — not satisfiable by a wide tolerance, not SSIM, not smoke. Golden `fixtures/golden/h264_1080p_30s.mp4.frames.json` is `pending:false` with populated sha256 digests (e.g. frame 0 `e3c072e0…2bc8`), so the comparison is against real baked frames. Measurements (12/12, 0 mismatched) are physically plausible for a lossless rewrap.
- **Winner adapter is real**: ffmpeg.wasm `remux()` (src/engines/ffmpeg-wasm/adapter.ts:2031–2068) invokes the real ffmpeg.wasm core with `-map 0 -c copy -movflags +faststart`, reads the produced bytes from MEMFS (`readBinary(outName)`). No canned output, no input→output passthrough faking a transcode, no short-circuit to the golden, no error swallowing (failures propagate; cleanup in `finally`).
- **Cached note**: BOTH PASS results have `cached==true` ("cached previous PASS result"). The evidence is reused, not freshly re-run; per the launcher seeding caveat, a clean re-run would strengthen the timing comparison. Correctness verdict is unaffected (bit-exact gate), but the 1.15× durationMs margin is staleness-exposed.
- **Verdict: REAL** — real 31 MB fixture, genuine ffmpeg `-c copy` rewrap implementation, and a non-trivial bit-exact frame-digest oracle. The only soft spot is that the *winner-selection metric* (durationMs) is cached and n=1; the gate itself is strong.

## Confidence & caveats

- **Confidence: medium.** Correctness is unambiguous and identical for both PASS engines (bit-exact 12/12). The winner ranking rests on a single cached `durationMs` (638 vs 736 ms, 1.15×) with no `bench` spread (no median/p95/mad/n), so the perf margin is thin and could flip on a fresh run.
- The scenario name implies a duration-probe invariant but the oracle dispatch actually executes the stronger bit-exact decode-remux path; this *strengthens* the gate, not weakens it, but is a naming/dispatch quirk worth noting (src/core/oracles.ts:2686 precedes :2709).
- Deployment tiebreaker favors mediabunny (WebCodecs backend, `coopCoep:not-required`, pure-TS-ESM, no multi-MB wasm core, streaming-lockstep), so for COOP/COEP-constrained or bundle-sensitive contexts mediabunny is the practical choice despite the marginal durationMs loss.
- All five NA verdicts were validated against adapter capability declarations and are honest (read-only parsers/demuxer, platform `remux:false`, and two muxers lacking `mov` in `containersOut`); none is an under-declared capability.
