# demux/metamorphic_flac_seektable_invariance

family: demux | fixture asset: `fixtures/media/flac_noseektable.flac` (143k, real) | golden: `fixtures/golden/flac_noseektable.flac.packets.json` (105 packets) | primaryMetric: wall | passCount: 4 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 4 of 7 engines PASS).
- Decisive factor: **performance (wall median)**. All four passers are correctness-tied (identical oracle: `golden-packets` PASS, `measuredCount=105`, `goldenCount=105`, `maxPtsDriftUs=0`, `comparedTracks=1`), so the tiebreak falls to wall time.
- Margin over runner-up: mediabunny **5.655 ms** vs remotion-webcodecs **9.810 ms** = **1.73x faster** wall. Versus the rest: ffmpeg.wasm 10.375 ms (1.83x), remotion-media-parser 12.375 ms (2.19x).
- Strength caveat: every passer is `cached==true` and `n==1` (no spread), so the timing ranking is weak evidence; correctness is identical across all four, so mediabunny is the winner on a thin but consistent margin.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true (105) | 5.655 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (105) | 9.810 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (105) | 10.375 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (105) | 12.375 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |

Note: this scenario declares only `metrics: ['wall']`, so the shard carries only the `wall` bench block. throughputRealtime / peakMemory / longtasks were not measured for any engine.

## Why the winner wins (deep technical)

The operation is a pure native-FLAC **demux**: enumerate the encoded-frame packet table of `flac_noseektable.flac` and compare it to a golden that was bake-equalized to the SEEKTABLE-bearing variant. FLAC is a self-framing native stream (no MP4/MKV index): each FLAC frame begins with a sync code and a UTF-8-encoded frame/sample number, so a correct demuxer can walk frame-by-frame **without** the optional `SEEKTABLE` metadata block. The metamorphic property being tested is exactly that: presence/absence of the SEEKTABLE must not change the packet count (105) or per-packet sizes. The golden has all 105 packets flagged `keyframe:true` (every FLAC frame is independently decodable), so a demuxer that leaned on the SEEKTABLE to find frame boundaries would under-count or mis-size and FAIL.

Mediabunny passes because its demux path is a genuine frame walk. `src/engines/mediabunny/adapter.ts:1152` opens the real input (`openInput`), gets tracks, and for the single audio track iterates `EncodedPacketSink.packets(undefined, undefined, { verifyKeyPackets: true })` (`adapter.ts:1165`), pushing one `PacketInfo` per emitted packet with `size = pkt.byteLength`, `ptsUs = pkt.microsecondTimestamp`, and `keyframe = pkt.type === 'key'` (`adapter.ts:1169-1175`). `verifyKeyPackets` forces a bitstream-level key check rather than trusting a container flag — the right thing for FLAC, where keyframe-ness is intrinsic. The container is declared for read at `adapter.ts:1036` (`flac` in `containersIn`) and mapped to mediabunny's `FLAC_FORMAT` singleton at `src/engines/mediabunny/codecs.ts:136`, so `flac` is a real, declared capability, not an accident.

On backend: mediabunny ran `backend:webcodecs`, `coreBuild:pure-ts-esm`, `wasmThreads:0`, `coopCoep:not-required` (env.configUsed). For FLAC demux no decoder is actually invoked — the packet walk is pure TypeScript parsing of the FLAC frame headers — so the pure-TS ESM path with no SharedArrayBuffer/COOP-COEP requirement is the lightest possible: no wasm module instantiation, no worker spin-up, no cross-origin isolation gate. That is why it lands at 5.655 ms, ~1.7-2.2x ahead of the others. remotion-webcodecs (9.810 ms) is also WebCodecs-backed but carries a heavier streaming-backpressure pipeline (`pipeline:streaming-backpressure`, bufferWriter); ffmpeg.wasm (10.375 ms) pays single-thread wasm parse/setup cost (no thread config shown, and FLAC demux still routes through libavformat in wasm); remotion-media-parser (12.375 ms) is `backend:cpu-js` full-parse-demux in JS with `worker:false`, the slowest interpreter path. All four produce the bit-identical 105-packet table (`maxPtsDriftUs:0`), so the gap is purely setup/parse overhead, won by mediabunny's zero-wasm, zero-worker TS frame walk.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, correctness-tied (golden-packets 105, drift 0). Lost on wall: 9.810 ms vs 5.655 ms = 1.73x slower. Heavier streaming-backpressure pipeline overhead for a small whole-file FLAC parse.
- **ffmpeg.wasm@0.12.15** — PASS, correctness-tied. Lost on wall: 10.375 ms = 1.83x slower. Single-thread wasm libavformat demux carries wasm-runtime parse/setup cost mediabunny's pure-TS path avoids.
- **remotion-media-parser@4.0.479** — PASS, correctness-tied. Lost on wall: 12.375 ms = 2.19x slower (slowest passer). `cpu-js` full-parse demux, no worker — interpreter-bound.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'flac'". Honest NA: web-demuxer's declared `containersIn` does not list `flac`, so the runner correctly skips it rather than letting it attempt and fail.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'flac'". Honest NA: mp4box is an ISO-BMFF (MP4/MOV) parser only; native FLAC streams are out of scope by design.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'flac'". Honest NA: the raw-platform demux adapter has no native-FLAC container demux capability declared.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:509-520` (`flacSeektableMetamorphic`), `input: 'flac_noseektable.flac'`, `oracles: ['golden-packets']`, `requires.containersIn: ['flac']`.
- Fixture: `fixtures/media/flac_noseektable.flac` EXISTS (143k real file). The sibling `flac_seektable.flac` also exists (143k) and `cmp` confirms the two files genuinely DIFFER (first diff at byte 43 — the SEEKTABLE block region), so the metamorphic pair is real bit-distinct media, not a copy. Input is not synthetic/empty/mock.
- Oracle: `goldenPackets` at `src/core/oracles.ts:703-796`. Real comparison — checks packet count, per-track trackIndex layout, then per-track size-exact and keyframe-flag-exact comparison position-by-position, with only a 1 ms (`seekToleranceUs`) origin-aligned timestamp tolerance. Not trivially satisfiable: a missing/mis-sized frame trips `sizeMismatch` or the count diff. Golden has 105 packets all `keyframe:true`, first packet size 1298 — physically plausible for a ~3 s FLAC stream. Measurements in the shard (`measuredCount=105`, `goldenCount=105`, `maxPtsDriftUs=0`) are consistent with the golden.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1152-1183` (real `EncodedPacketSink.packets()` walk, `verifyKeyPackets:true`, real `byteLength`/`microsecondTimestamp`). No canned output, no input->output copy, no golden short-circuit, no error swallowing.
- Verdict: **REAL**. Real bit-distinct fixture pair, real frame-walk implementation, size+keyframe-exact oracle against an independent ffprobe-derived golden.
- Cached note: all four passers report `cached==true` ("cached previous PASS result"), so the timings (n==1, mad==0) are reused, not freshly re-run. Per the launcher-seeding caveat, the wall ranking carries staleness risk; correctness is reproducible against the on-disk golden regardless.

## Confidence & caveats

- Confidence: **high** on correctness (4 engines independently produce the identical 105-packet table, drift 0, against a real golden; clean honest NAs for the three non-FLAC engines). **Medium** on the performance ranking: all timings are cached, n==1, mad==0, and the scenario only measures `wall`, so the 1.7x margin is a single-sample reading, not a distribution.
- The metamorphic intent is documented but not enforced by a dedicated cross-input `demux(x)==demux(y)` oracle (the scenario notes this explicitly, `index.ts:498-507`); it is asserted indirectly via the bake-equalized golden. The gate is meaningful but is the same `golden-packets` comparison as the plain `demux/flac_noseektable` case, so this id mostly documents intent.
