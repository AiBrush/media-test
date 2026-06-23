# remux/prop_bframes_decode_remux_mp4_mov

family: remux | fixture asset: `h264_bframes_1080p.mp4` (11 MB, real) | primaryMetric: wall | passCount: 2 (of 7 engines)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (`ffmpeg-wasm`).
- Status: **CONTESTED** — two engines PASS the identical bit-exact gate: `ffmpeg-wasm` and `mediabunny@1.48.0`. Both satisfy `property-invariant` (decode-remux) with 12/12 frames bit-exact, 0 mismatched. Correctness is a dead tie at the strongest rung of the ladder (decoded-frames bit-exact).
- Decisive factor: **performance (wall median)** — the only correctness-comparable tiebreaker available. ffmpeg-wasm `wall` median = **100.44 ms** vs mediabunny **133.99 ms**.
- Margin over runner-up: **1.33x faster wall** (133.99 / 100.44 = 1.334). longtasks are identical (234 ms each). peakMemory was not sampled for either (n=0), so no memory margin can be claimed.
- Evidence strength caveat: both wall numbers are single-sample (n=1, mad=0) and both results are `cached==true`. The performance margin is real but weakly powered; see Confidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 100.44 ms | n/a (not measured) | 0 (n=0) | 234 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 133.99 ms | n/a (not measured) | 0 (n=0) | 234 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |

No throughputRealtime metric is present in the shard bench for any engine; only `wall`, `peakMemory` (n=0, unsampled), and `longtasks` were recorded.

## Why the winner wins (deep technical)

The operation is a **container rewrap of H.264-in-MP4 to H.264-in-QuickTime (.mov)** with a B-frame / open-GOP video stream (golden meta: 1920x1080, h264, 30 fps, ~8.47 Mbps video + AAC-LC 48 kHz stereo, 10 s). The gating invariant is `decode(remux(x)) == decode(x)`: the suite decodes the engine's `.mov` output with the platform WebCodecs decoder and compares per-frame normalized-RGBA sha256 digests against the baked golden frames (`fixtures/golden/h264_bframes_1080p.mp4.frames.json`, 12 real digests, `pending:false`). The hard part for B-frames is that the elementary stream's decode order (DTS) differs from presentation order (PTS); a correct remux must rewrite the new container's sample tables / edit list so that presentation order, composition offsets (`ctts`), and the first-decodable I-frame are preserved exactly. Any dropped composition-time offset or mangled edit list would reorder or duplicate decoded frames and the digests would diverge.

ffmpeg.wasm achieves this with a pure stream-copy. `src/engines/ffmpeg-wasm/adapter.ts:2044` builds `[...inputOptions, '-i', written.name, '-map', '0', '-c', 'copy']` — no re-encode, every input stream explicitly mapped. For the mov target it falls into the `opts.container === 'mp4' || opts.container === 'mov'` branch (`adapter.ts:2045`) and appends `-movflags +faststart` (`adapter.ts:2049`), so the QuickTime `moov` is rewritten ahead of `mdat`. Because the H.264 access units and their `ctts` composition offsets are byte-copied into the new `stbl`, the B-frame reorder is preserved verbatim — the decoded RGBA frames are necessarily identical to the source decode, which is exactly what the 12/12 bit-exact result shows (`measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0`). The work runs in the vendored single-thread wasm core; the cost is dominated by the wasm muxer pass, hence the 234 ms longtask and 100.44 ms wall.

mediabunny is equally correct but does the rewrap through its `Conversion` pipeline (`src/engines/mediabunny/adapter.ts:1244` `remux()` -> `makeOutputFormat(opts.container)` -> `runConversion`), running on the **WebCodecs backend** (`env.configUsed.backend == "webcodecs"`, `hwAccel == "prefer-hardware"`, `pipeline == "streaming-lockstep"`, `coopCoep == "not-required"`, `wasmThreads == 0`). Its "copy whenever possible" path likewise preserves the packets, so it also lands 12/12 bit-exact. The performance gap is mechanistic: mediabunny's conversion path sets up a streaming-lockstep reader/writer with a managed queue and target instrumentation, which adds per-sample bookkeeping over what is, for a same-codec rewrap, the same byte-copy ffmpeg does directly. That overhead shows as the extra ~33.5 ms of wall (133.99 vs 100.44), i.e. ffmpeg is 1.33x faster on this small 10 s clip. Correctness is identical, so the tie breaks purely on wall time.

Tiebreaker nuance: on (c)-criteria mediabunny actually has the more attractive runtime profile (hardware-preferred WebCodecs, no COOP/COEP requirement, streaming rather than whole-file MEMFS buffering, and a pure-TS ESM core vs ffmpeg's multi-MB wasm blob). But the decision procedure ranks correctness, then performance via primaryMetric (`wall`), before those soft tiebreakers — and ffmpeg's measured wall win is decisive at that earlier step.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on performance only. Same bit-exact correctness (12/12, 0 mismatched) but 133.99 ms wall vs 100.44 ms (0.75x as fast; ffmpeg 1.33x faster). Both n=1 cached samples, so the gap is real but weakly powered.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — web-demuxer is a demux/probe library with no muxer, so it cannot author a .mov output. Under-declaration is not plausible.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — media-parser is a read-only parser (no muxing path).
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — the raw platform shim does not expose a remux op (WebCodecs has no muxer; remux would require a userland muxer the platform engine deliberately does not provide).
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mov'". Honest — adapter declares `containersOut: ['mp4','webm','wav']` (`src/engines/remotion-webcodecs/adapter.ts:248`); mov is genuinely absent. Its `remuxCompatibleMovToMp4` reads mov but writes mp4, so it still cannot emit a .mov target.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mov'". Honest — adapter declares `containersOut: ['mp4']` only (`src/engines/mp4box/adapter.ts:647`); mp4box.js writes ISO-BMFF tagged mp4, not the `qt ` brand. Not under-declared.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/metamorphic.ts:53` (`id: 'prop_bframes_decode_remux_mp4_mov'`), invariant `DECODE_REMUX = 'decode(remux(x))==decode(x)'` (line 33/57), input `h264_bframes_1080p.mp4`, from mp4 -> to mov. Notes: "B-frame MP4->MOV: same reorder-survival invariant onto the QuickTime container." Real, codec-appropriate gating rationale.
- Fixture: `fixtures/media/h264_bframes_1080p.mp4` exists and is a real 11 MB H.264 file (golden meta: 1920x1080, h264+aac, 10 s). Not synthetic/empty/mock.
- Golden: `fixtures/golden/h264_bframes_1080p.mp4.frames.json` has 12 real sha256 digests, `pending:false` (e.g. `d26decab...`, `1a9d7baf...`) — browser-baked decode(x), exactly what the oracle compares against.
- Oracle: `src/core/oracles.ts:2686` (decode-remux branch of `propertyInvariant`). It decodes `ctx.output` via `ctx.decodeWithPlatform` and runs `compareDigests` against the golden frames — a real per-frame bit-exact comparison, NOT a tolerance band, NOT smoke, NOT ssim. Trivially-satisfiable failure modes are guarded: no output -> fail (`2688`), missing golden frames -> fail (`2691-2694`), decode error -> fail (`2699`). The measurement `mismatchedFrames:0` over `comparedFrames:12` is physically plausible for a lossless rewrap.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` `remux()`. Genuine: invokes the real wasm ffmpeg with `-map 0 -c copy` + `-movflags +faststart`, reads back the muxed bytes via `readBinary(outName)`. No canned output, no input->output passthrough faking a transcode, no short-circuit to the golden, no swallowed errors (`assertRemuxContainerCompatible` and `this.run` propagate failures).
- Cached note: BOTH PASS results carry `cached==true` ("cached previous PASS result"). The evidence is reused, not freshly re-run this session; the wall numbers (100.44 / 133.99 ms, both n=1) reflect a prior run. Staleness risk is real but the correctness gate (bit-exact) is deterministic, so the PASS verdicts are robust even if stale.
- Verdict: **REAL** — real 11 MB fixture, real ffmpeg wasm stream-copy implementation, strict deterministic bit-exact oracle over 12 baked golden frames.

## Confidence & caveats

- Confidence: **high** on correctness/verdict (bit-exact, deterministic, real fixture+oracle); **medium** on the performance margin.
- The performance win rests on n=1, mad=0, p95==median (single sample) for both engines, and both rows are `cached==true`. The 1.33x wall ratio is directionally trustworthy for a small 10 s clip but could shift under fresh, multi-sample runs.
- peakMemory was not measured (n=0) for either engine, and no throughputRealtime metric exists in this shard — so peakMemory/throughput tiebreakers could not be applied.
- Soft tiebreakers (hardware WebCodecs, no COOP/COEP, streaming, smaller bundle) favor mediabunny; only the primaryMetric wall ranking puts ffmpeg ahead. If the suite reweighted toward memory or bundle size, mediabunny could win.
