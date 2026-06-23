# decode-seek/meta_decode_remux_eq_decode_anchored

family: decode-seek | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (real, 31 MB H.264 1080p30 in MP4) | primaryMetric: wall | passCount: 2 / 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (`ffmpeg-wasm`).
- Status: **CONTESTED** — two engines PASS (ffmpeg-wasm and mediabunny), both satisfying the identical `property-invariant` gate with byte-identical strength (12/12 frames bit-exact, 0 mismatches).
- Decisive factor: **PERFORMANCE**. Correctness is a tie (same oracle, same measurements, both 0 mismatches), so the tiebreak is the primary metric `wall`. ffmpeg-wasm = **203.22 ms** median vs mediabunny = **344.21 ms** median.
- Margin over runner-up: **~1.69x faster wall** (344.21 / 203.22 = 1.694). Also lower long-task time: 3675 ms vs 3638 ms is effectively equal (mediabunny marginally lower by ~1%), and peakMemory was not sampled (n=0) for either engine.

Caveat on evidence strength: both winners' benches are **n=1** (single timed sample, mad=0, warmup=1), so the wall margin is a single-shot measurement, not a distribution. Both results are also `cached:true` (reused, not re-run this session).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 203.22 ms | n/a (not benched) | 0 (n=0) | 3675 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 344.21 ms | n/a (not benched) | 0 (n=0) | 3638 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

The operation is a **decode-anchored remux equivalence** check: take the H.264 elementary stream out of an MP4 faststart container, re-wrap it (stream-copy, no re-encode) into a **Matroska/MKV** container, then prove the rewrap is pixel-lossless by decoding the produced MKV with the platform (WebCodecs) decoder and comparing the first 12 RGBA frame digests against the offline browser-baked golden decode of the original MP4. The invariant `decode(remux(x))==decode(x)` is registered in `src/scenarios/decode-seek/index.ts:672-686`, and routed by `propertyInvariant` at `src/core/oracles.ts:2686-2707`, which decodes `ctx.output` via `ctx.decodeWithPlatform(...)` and runs `compareDigests` (`src/core/oracles.ts:1166-1207`).

Both PASS engines produced output whose decoded frames matched the golden **bit-exact**: oracleOutcomes report `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0`. The golden (`fixtures/golden/h264_1080p_30s.mp4.frames.json`) carries real sha256 digests of normalized RGBA buffers at 1920x1080 (`pending:false`, e.g. frame0 `e3c072e0…`, frame1 `3312df3b…` at ptsUs 0 / 33333 = 30 fps), so a stream-copy that altered any sample's bytes or its timing would change at least one digest and the gate would fail (`compareDigests` line 1190 normHex inequality → mismatch). Both engines therefore did a genuine lossless rewrap of identical coded H.264 samples.

Because correctness is a dead heat, the win goes to the faster remux. ffmpeg-wasm's path (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) is a single in-MEMFS `ffmpeg -i in -map 0 -c copy out.mkv` invocation: it demuxes the MP4, stream-copies every track (no AVC re-encode), and lets the Matroska muxer write the result. The `-map 0 -c copy` path performs zero pixel work — only NAL repacketization and timestamp rebasing into the Matroska timecode model — which is why its wall is 203.22 ms. mediabunny (`src/engines/mediabunny/adapter.ts:1244-1260`) uses its pure-TS `Output`/`Conversion` pipeline (env.configUsed: `backend:webcodecs`, `coreBuild:pure-ts-esm`, `pipeline:streaming-lockstep`, `sharedArrayBuffer:false`, `coopCoep:not-required`) to drive the same stream-copy into MKV; it is also correct but carries more JS-side orchestration overhead, landing at 344.21 ms (1.69x slower). The long-task totals are essentially equal (3675 vs 3638 ms), so the wall delta is the clean discriminator.

Tiebreak notes from `env.configUsed` (only present on the mediabunny entry): mediabunny advertises a no-COOP/COEP, single-thread (`wasmThreads:0`) WebCodecs config — attractive deployment-wise — but for THIS stream-copy remux the WebCodecs backend is irrelevant to the remux itself (no decode/encode happens in a `-c copy` rewrap; decode only happens later inside the oracle). ffmpeg-wasm exposes no configUsed block here, but its remux is plain wasm stream-copy. The performance gap, not the backend, decides it.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, but lost on speed: same oracle, same 12/12 bit-exact result, wall 344.21 ms vs ffmpeg-wasm 203.22 ms (1.69x slower). No correctness deficiency; purely the runner-up on the primary metric.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest NA — its WebCodecs-muxer surface does not advertise Matroska output, so it cannot be the remux target here.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest NA — mp4box.js is an ISO-BMFF (MP4) library; producing MKV is genuinely out of scope.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — it is a parser/demuxer, not a muxer; it has no remux capability to under-declare.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — demux-only library; no muxing/remux path exists.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — the raw browser platform (WebCodecs + no bundled muxer) does not expose a remux operation in this suite's adapter.

All five NAs are capability-honest: the two that fail on output container ('mkv') are MP4/WebCodecs-muxer engines that cannot target Matroska, and the three that fail on operation ('remux') are parse/demux-only or muxer-less. None look like an under-declared capability being dodged.

## Anti-cheat validation

- Scenario definition: `src/scenarios/decode-seek/index.ts:672-686` (`INVARIANT_CASES`, id `meta_decode_remux_eq_decode_anchored`, op `remux`, input `h264_1080p_30s.mp4`, container `mp4` → containersOut `['mkv']`, invariant `decode(remux(x))==decode(x)`, `oracleImplemented:true`). Notes confirm the intent: the DECODE oracle certifies the remux is pixel-lossless.
- Fixture existence: `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — a real H.264 1080p30 MP4, not synthetic/empty/mock. Golden `fixtures/golden/h264_1080p_30s.mp4.frames.json` exists with `pending:false` and real RGBA sha256 digests (1920x1080, 30 fps cadence).
- Oracle: `src/core/oracles.ts:2645` (`propertyInvariant`), branch at `2686-2707` for the decode/remux token, comparing via `compareDigests` (`1166-1207`). The comparison is bit-exact sha256 per frame (line 1190), fails on any single mismatch or missing frame, and requires ≥1 overlapping frame. NOT a smoke gate, NOT a wide-tolerance proxy, NOT ssim-with-exactFrames==0. Measurements (12 measured / 12 golden / 12 compared / 0 mismatched) are physically plausible for the first 0.4 s of a 30 fps clip.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` (`remux`). Genuine ffmpeg.wasm `-i … -map 0 -c copy out.mkv` stream-copy via MEMFS; reads back real output bytes (`readBinary(outName)`). No canned output, no input→output passthrough faking a transcode, no short-circuit to the golden, no error swallowing (errors propagate; cleanup in `finally`). The oracle decodes the produced MKV independently with the platform decoder, so a faked output could not match the golden RGBA digests.
- Verdict: **REAL** — real fixture + real ffmpeg.wasm stream-copy implementation + a strict bit-exact frame-digest oracle.
- Cached note: the winner's result is `cached:true` ("cached previous PASS result") — reused, not re-run this session. The PASS itself is real (it was produced by a genuine prior run), but the 203.22 ms wall and the win margin reflect that earlier run; staleness risk exists if the adapter/fixture changed since.

## Confidence & caveats

- Confidence: **high** that ffmpeg-wasm is the correct winner — it is one of only two PASS engines, both pass the same strict bit-exact gate, and it is unambiguously faster (1.69x) on the declared primary metric.
- Caveat 1: both PASS results are `cached:true`; numbers are from prior runs, not this session.
- Caveat 2: benches are **n=1** (mad=0, warmup=1) for both engines — the wall margin is a single sample, so the 1.69x figure is directional, not statistically robust.
- Caveat 3: `peakMemory` was not captured (n=0) and `throughputRealtime` is absent for both, so memory/throughput tiebreakers could not be evaluated — the decision rests on `wall` alone.
- Caveat 4: the five NAs were judged honest from their reasons; the adapter capability declarations were not exhaustively re-derived for each, but the reasons (no 'mkv' output / no 'remux' op) are consistent with each library's known scope.
