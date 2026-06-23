# demux/mp3_xing

family: demux | fixture asset: `mp3_xing.mp3` (fixtures/media/mp3_xing.mp3, 64 KB, real) | primaryMetric: wall (ms) | passCount: 4 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`), backend `webcodecs` / `pure-ts-esm` core, streaming-lockstep pipeline, no COOP/COEP.
- **CONTESTED**: 4 engines PASS (mediabunny, ffmpeg.wasm, remotion-media-parser, remotion-webcodecs), all satisfying the SAME oracle `golden-packets` with an identical, structurally-exact result: 384/384 packets, 1 compared track, size + keyframe exact, pts/dts drift within 1µs.
- **Decisive factor**: correctness is a dead heat (all four pass the strongest applicable oracle here, structural/metadata-exact, with identical 384-packet tables), so the win falls to **performance — wall median**. mediabunny is fastest at **5.96 ms**.
- **Margin over runner-up (ffmpeg.wasm @ 6.74 ms): 1.13x faster wall.** Over remotion-media-parser (7.785 ms): 1.31x. Over remotion-webcodecs (10.405 ms): 1.75x. Evidence is weak in spread terms: every bench is **n=1, warmup=1, mad=0** (single timed sample), so the 1.13x lead over ffmpeg.wasm is suggestive, not statistically robust.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true (384/384, drift≤1µs) | 5.96 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (384/384, drift≤1µs) | 6.74 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (384/384, drift 0µs) | 7.785 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (384/384, drift 0µs) | 10.405 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |

(The shard records only the `wall` bench metric for this row; throughputRealtime/peakMemory/longtasks were not captured.)

## Why the winner wins (deep technical)

The operation is **MP3 elementary-stream demux**: an MPEG-1/2 Layer III bitstream in a raw `.mp3` container (no ISOBMFF/Matroska box structure) whose first frame is a **Xing/Info VBR TOC header frame**. The scenario's gating concern (src/scenarios/demux/index.ts:208-211, notes) is that the Xing/Info TOC frame is a synthetic header frame that must be recognized and **excluded from the audio packet table** — emitting it would yield 385 packets and a size-table mismatch. The golden (fixtures/golden/mp3_xing.mp3.packets.json) holds exactly **384 packets**, first packet size 731 bytes at pts 0, keyframe=true, with a realistic spread of MP3 frame sizes (130/156/182/208/261/731 bytes seen), every frame flagged keyframe (each Layer III frame is independently seekable). mediabunny produced 384 packets, the correct Xing-skipped table, matching golden byte-for-byte on size and keyframe flags.

mediabunny's demux path is genuinely implemented in src/engines/mediabunny/adapter.ts:1152-1183. It builds a real `Input` over a `BlobSource` (openInput, src/engines/mediabunny/adapter.ts:245-279, restricting to the asset's `mp3` container), enumerates tracks, then for the single audio track constructs an `EncodedPacketSink` and iterates `sink.packets(undefined, undefined, { verifyKeyPackets: true })` (adapter.ts:1162-1167). Each yielded `EncodedPacket` contributes its real `byteLength` and `microsecondTimestamp`; keyframe comes from the bitstream-verified `pkt.type === 'key'` (adapter.ts:1168-1175). The Xing-frame exclusion is handled inside mediabunny's own Mp3InputFormat frame walker (it parses the Xing/Info tag and does not surface it as an audio packet), not by any test-side fudge. Because mediabunny's reader is a **pure-TS ESM core with no WASM module to instantiate and no worker to spin up** (env.configUsed.coreBuild `pure-ts-esm`, wasmThreads 0, sharedArrayBuffer false, coopCoep not-required), the per-op fixed cost is minimal — it just byte-walks a 64 KB buffer. That is the mechanistic reason its wall median (5.96 ms) edges out ffmpeg.wasm (6.74 ms, which pays wasm heap-copy/marshalling overhead even on a tiny file) and both Remotion engines (7.785 / 10.405 ms; remotion-webcodecs in particular carries the heavier `streaming-backpressure` + worker-capable conversion scaffolding, env.configUsed, which is pure overhead for a small elementary demux).

The one cosmetic difference: mediabunny reports `maxPtsDriftUs: 1` vs `0` for the others. This is because mediabunny intentionally abstracts DTS away and the adapter reports `dtsUs === ptsUs = pkt.microsecondTimestamp` (adapter.ts:1146-1149, 1173); a 1µs rounding artifact in its µs-timestamp conversion against the ffprobe golden. It is well inside the oracle's ±1000µs (`seekToleranceUs`) tolerance (oracles.ts:738, 782-784) and does not weaken the PASS — sizes and keyframe flags, the load-bearing correctness signals for MP3 frame walking, are exact.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, identical correctness (384/384, drift≤1µs). Lost on performance: 6.74 ms vs 5.96 ms = **1.13x slower wall**. Cause is structural: the wasm core must copy the input into the wasm heap and marshal packet metadata back across the JS/wasm boundary, fixed overhead that dominates on a 64 KB demux where the actual parse is trivial. Margin is small and n=1, so this is a soft loss.
- **remotion-media-parser@4.0.479** — PASS, even cleaner correctness (384/384, drift **0µs**, full-parse demux on a pure cpu-js streaming reader). Lost on performance only: 7.785 ms = **1.31x slower wall**.
- **remotion-webcodecs@4.0.479** — PASS, 384/384, drift 0µs. Slowest PASS at 10.405 ms = **1.75x slower wall**; its streaming-backpressure + worker-capable convert pipeline (env.configUsed) is heavyweight scaffolding wasted on a small elementary-stream demux.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare input container 'mp3'". **Honest NA**: MP4Box.js is an ISOBMFF (MP4/MOV) box parser; a raw MP3 elementary stream has no box structure, so it genuinely cannot demux this container. Correctly under-declared, not a cheat.
- **platform@chrome-149** — NA_ENGINE, same reason. **Honest NA**: the WebCodecs/MSE "platform" path has no general-purpose MP3 elementary-stream demuxer exposed to JS, so the adapter declines the container rather than fake it.
- **web-demuxer@4.0.0** — NA_ENGINE, same reason. **Honest NA**: its declared container set does not include raw `mp3`. (Underlying ffmpeg could parse MP3, but the adapter does not declare it for this row, so it is reported NA rather than producing an unvalidated result.)

## Anti-cheat validation

- **Scenario**: src/scenarios/demux/index.ts:207-212 — `asset: 'mp3_xing.mp3'`, container `mp3`, codec `mp3`, notes calling out the Xing/Info TOC exclusion requirement. Real, specific gating rationale.
- **Fixture**: `fixtures/media/mp3_xing.mp3` exists, 64 KB — a real MP3 file, not synthetic/empty/mock. Golden `fixtures/golden/mp3_xing.mp3.packets.json` exists (43 KB) with 384 plausible MP3-frame packets (varied sizes 130–731 B, monotonic pts, all keyframe) — physically consistent with real Layer III frames.
- **Oracle**: `golden-packets`, src/core/oracles.ts:701-796. Performs a real per-track, order-independent comparison: exact packet count, exact trackIndex layout, **exact per-packet size**, **exact keyframe flag**, and pts/dts drift bounded to ±1000µs after a constant per-track origin alignment (oracles.ts:774-792). Not trivially satisfiable — size and keyframe mismatches fail unconditionally, and the count check would catch an engine that wrongly emitted the 385th (Xing) frame. Measurements (384/384, comparedTracks 1, maxPtsDriftUs 0–1) are physically plausible.
- **Winner adapter**: src/engines/mediabunny/adapter.ts:1152-1183 — genuine `EncodedPacketSink.packets({verifyKeyPackets:true})` walk over a real `Input`/`BlobSource`; emits real `byteLength`/`microsecondTimestamp`/bitstream-verified keyframe. No canned output, no input→output copy, no golden short-circuit, no error-swallowing.
- **Verdict: REAL** — real fixture + real library demux + meaningful structural oracle. The win is correctness-tied and decided on wall time.
- **Cached note**: all four PASS rows (and indeed all entries) have `cached: true` ("cached previous PASS result"). The packet-table correctness is deterministic and stable under caching, but the **wall-median margins were not re-measured this run** — the 1.13x/1.31x/1.75x perf gaps are reused single-sample numbers (n=1, mad=0) and carry staleness/variance risk. The winner ordering is plausible but should not be treated as a tight performance benchmark.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict (mediabunny REAL, contested with 3 other genuine PASS engines, 3 honest NAs) is high-confidence: oracle and adapter code inspected, fixture and golden confirmed real.
- The **winner selection rests entirely on performance**, and all benches are **n=1, warmup=1, mad=0, cached=true**. The 1.13x lead over ffmpeg.wasm is within plausible single-sample noise; a re-run could reorder the top two. mediabunny and ffmpeg.wasm are effectively co-leaders on this row.
- Only `wall` was captured; throughputRealtime/peakMemory/longtasks were unavailable, so secondary perf tiebreakers could not be applied.
- mediabunny's `maxPtsDriftUs: 1` (vs 0 for others) is a benign µs-rounding artifact from its pts-as-dts reporting (adapter.ts:1146-1149), not a real timing error.
