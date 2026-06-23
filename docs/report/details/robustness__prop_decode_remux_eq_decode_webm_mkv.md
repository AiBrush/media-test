# robustness/prop_decode_remux_eq_decode_webm_mkv

family: robustness | fixture asset: `vp9_1080p_10s.webm` (VP9 1080p30 + Opus 48k stereo, 9.3 MB) | output container: MKV | primaryMetric: (none recorded in shard) | passCount: 2/7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED win (2 engines PASS: mediabunny and ffmpeg.wasm).
- **Decisive factor:** both engines satisfy the identical correctness gate (property-invariant `decode(remux(x))==decode(x)`, 12/12 frame digests bit-exact, 0 mismatches), so correctness strength is a tie. The tiebreaker is performance + backend quality. mediabunny finished in **durationMs 369** vs ffmpeg.wasm **539** = **1.46x faster wall**, and ran on hardware WebCodecs (`backend=webcodecs`, `hwAccel=prefer-hardware`, `pipeline=streaming-lockstep`) with **no COOP/COEP / no SharedArrayBuffer requirement** (`coopCoep=not-required`, `sharedArrayBuffer=false`), whereas ffmpeg.wasm is a single-thread wasm build. No `bench{}` block is present in this shard, so the only quantitative timing signal is `durationMs`; the margin is therefore real but on a single observation (see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass (12/12 bit-exact) | n/a (durationMs 369) | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass (12/12 bit-exact) | n/a (durationMs 539) | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare output container 'mkv' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

No `bench{}` object is present for any engine in this shard; the only per-engine timing is `durationMs` (mediabunny 369, ffmpeg.wasm 539). Both PASS engines have `cached=true`.

## Why the winner wins (deep technical)

The operation is a **lossless container remux** of a VP9-video + Opus-audio WebM into Matroska (MKV). Because VP9 and Opus are native Matroska/WebM codecs (WebM is a constrained Matroska profile), a correct remux must copy the encoded VP9 frames and Opus packets verbatim into MKV without re-encoding — the decoded pixels of the output must be bit-for-bit identical to the decoded pixels of the input. The oracle enforces exactly this: `propertyInvariant` (src/core/oracles.ts:2686-2707) takes the candidate's MKV output, re-decodes it with the platform WebCodecs decoder via `ctx.decodeWithPlatform`, and compares the per-frame normalized-RGBA sha256 digests against the baked golden for `vp9_1080p_10s.webm`. mediabunny's result: `measuredFrames=12, goldenFrames=12, comparedFrames=12, mismatchedFrames=0` — every one of the 12 sampled frames (1920x1080) hashed identically to the golden, proving the VP9 bitstream survived the WebM→MKV repackage untouched.

mediabunny achieves this through its `remux()` adapter (src/engines/mediabunny/adapter.ts:1244-1260). For a plain container change with no codec/transform options it builds the MKV output format via `makeOutputFormat(opts.container, ...)`, opens the source with `openInput`, and runs `runConversion` (adapter.ts:842-855) which calls the real library `mb.Conversion.init(opts)` and `conversion.execute()`. With no `convOpts.video`/`convOpts.audio` transform set, mediabunny's Conversion copies encoded samples (the docstring at adapter.ts:1243 — "Conversion with no codec/transform options copies encoded samples") rather than transcoding, which is why decoded pixels are preserved. The decode side that produced the golden uses `VideoSample.copyTo(RGBA)` directly (`pixelBackend=VideoSample.copyTo(RGBA)>canvas`, adapter.ts:721/1363) to avoid canvas-readback perturbation, so the bit-exact comparison is meaningful.

On backend quality, mediabunny ran with `backend=webcodecs`, `hwAccel=prefer-hardware` on the Apple M1 Max Metal path, `pipeline=streaming-lockstep`, `coreBuild=pure-ts-esm`, and crucially `coopCoep=not-required` with `sharedArrayBuffer=false`. ffmpeg.wasm, the only other PASS, must run the libavformat remuxer inside a wasm sandbox; even though both produced a correct MKV with identical 12/12 bit-exact frames, mediabunny's hardware/streaming path completed in 369ms vs ffmpeg.wasm's 539ms (1.46x). Given equal correctness, the lighter deployment footprint (no cross-origin isolation headers needed) plus the faster wall time make mediabunny the winner.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** correctness is a dead tie — same property-invariant pass, same `12/12` bit-exact, `mismatchedFrames=0`. It lost purely on the performance tiebreaker: durationMs 539 vs 369 (1.46x slower wall) and a heavier single-thread-wasm backend with no hardware accel. A valid, strong second place.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** `engine does not declare operation 'remux'` — honest NA; remotion-media-parser is a parser/demuxer, it has no muxing/remux op, so it genuinely cannot perform this operation.
- **web-demuxer@4.0.0 (NA_ENGINE):** `engine does not declare operation 'remux'` — honest NA; web-demuxer is a demux-only WASM wrapper with no muxer, cannot author an MKV.
- **platform@chrome-149 (NA_ENGINE):** `engine does not declare operation 'remux'` — honest NA; the raw WebCodecs/platform engine exposes decode/encode primitives but no container remux op. (Note the platform engine is still used internally by the oracle to re-decode the candidate output.)
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** `engine does not declare output container 'mkv'` — honest NA; remotion-webcodecs can transcode/remux to its supported containers but does not list MKV as an output target, so it is correctly skipped rather than failed.
- **mp4box@2.3.0 (NA_ENGINE):** `engine does not declare input container 'webm'` — honest NA; mp4box is an ISO-BMFF (MP4/MOV) library and cannot parse the EBML/Matroska WebM input.

All five NAs are capability-honest and consistent with each engine's actual scope; none looks like an under-declared capability being dodged.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/robustness/index.ts:394-405 — `id: 'prop_decode_remux_eq_decode_webm_mkv'`, `op: 'remux'`, `input: 'vp9_1080p_10s.webm'`, `containersIn: ['webm']`, `containersOut: ['mkv']`, codecs vp9/opus, `options.invariant = 'decode(remux(x))==decode(x)'`. Notes: "Same invariant across the WebM→MKV path."
- **Fixture exists and is real:** `fixtures/media/vp9_1080p_10s.webm` is present, **9.3 MB**, a genuine 1080p30 VP9 + Opus WebM (meta golden confirms container=webm, durationSec=10.008, video vp9 1920x1080@30, audio opus 48k stereo, encoder=Lavf). Not synthetic/empty/mock.
- **Oracle:** src/core/oracles.ts:2645 `propertyInvariant`, decode-remux branch at lines 2686-2707. It re-decodes the candidate's MKV output with the platform decoder and runs `compareDigests` against the baked golden frame digests — a real, non-trivial pixel-level comparison (bit-exact sha256, zero tolerance), not a smoke or wide-tolerance gate.
- **Golden integrity:** `fixtures/golden/vp9_1080p_10s.webm.frames.json` has `pending=false`, **12 frames, 12 distinct sha256** digests (e.g. 890d666868ba, 6297b48f57c4, 25701b7fbbb0). No zeroed/duplicated placeholder digests, so the gate cannot be trivially satisfied.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1244-1260 (`remux`) → :842-855 (`runConversion` → real `mb.Conversion.init`/`.execute()`). No canned output, no input→output passthrough, no short-circuit to the golden file, no error swallowing (invalid conversion throws at :851).
- **Cached note:** mediabunny's winning result has `cached=true` ("cached previous PASS result"); ffmpeg.wasm is also `cached=true`. Both rows were reused, not freshly re-run in this report pass — minor staleness risk, but the underlying gate and fixture are real.
- **Verdict: REAL** — real 9.3 MB VP9/Opus fixture, genuine mediabunny Conversion remux, and a bit-exact 12-frame decoded-pixel oracle against a fully baked golden. The pass is strong (decoded-frames bit-exact tier), not a proxy.

## Confidence & caveats

- **Confidence: medium.** The correctness verdict is solid (real fixture, real impl, strong bit-exact oracle, baked golden). The *winner selection* is the soft part: correctness between mediabunny and ffmpeg.wasm is an exact tie (both 12/12 bit-exact), so the win rests entirely on the performance/backend tiebreaker.
- This shard contains **no `bench{}` object** and **no `primaryMetric`** for either PASS engine. The only timing signal is `durationMs` (369 vs 539), effectively n=1 per engine — no median/p95/mad spread, so the 1.46x margin is weakly sampled.
- Both PASS results are `cached=true`; a fresh re-run could shift the durationMs margin (note the launcher stale-PASS caveat).
- The backend-quality tiebreaker (hardware WebCodecs + no COOP/COEP vs single-thread wasm) is a genuine differentiator independent of the timing noise and reinforces mediabunny as the winner.
