# mux/edge_rotation_decode_mux_mov

family: mux | fixture asset: `fixtures/media/h264_rotated90.mp4` (4.4 MB, real) | primaryMetric: wall (default; no explicit primaryMetric in `_shared.ts`) | passCount: 2 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Contested**: yes — two engines PASS (`mediabunny`, `ffmpeg-wasm`) with *identical* oracle outcomes, so correctness is a dead heat and the decision falls to performance.
- **Decisive factor: wall-clock**. mediabunny mux finalized in **39.44 ms** vs ffmpeg-wasm's **673.81 ms** — a **17.1× faster** wall median. Both passed the same two gates with the same measurements, so correctness strength is equal and performance breaks the tie.
- **Margin over runner-up (ffmpeg-wasm)**: 673.81 / 39.44 = **17.1× faster wall**. Peak memory is not directly comparable (ffmpeg-wasm reported `peakMemory` with `n==0`, i.e. unmeasured, median 0); mediabunny measured 56.6 MB peak. Caveat: both samples are `n==1` and both results are `cached==true`.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, reference-reimport:true | 39.44 ms | n/a (not in bench) | 56,619,226 B (56.6 MB) | 3675 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, reference-reimport:true | 673.81 ms | n/a (not in bench) | 0 (n=0, unmeasured) | 205 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is a **container mux**: take the already-encoded H.264 video track (+AAC audio) demuxed from `h264_rotated90.mp4` and author it into a **QuickTime `.mov`** container, preserving the **90° display matrix** so the decoded presentation is unchanged. The gating invariant `DECODE_MUX` (`src/scenarios/mux/_shared.ts:75`, `decode(mux(x))==decode(x)`) decodes the muxed output in the platform decoder and compares per-frame SHA-256 RGBA digests against the baked golden `fixtures/golden/h264_rotated90.mp4.frames.json` (12 frames, 1280×720, baked by the platform engine on 2026-06-18). If a muxer drops the `tkhd`/`elst` display matrix, the decoded pixels rotate and the digests diverge — so passing means the matrix was authored faithfully.

Both PASS engines produced **bit-exact** decode results: `property-invariant` reports `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` and `reference-reimport` reports `reimportPackets:770, reimportKeyframes:475` for *both*. These numbers are physically plausible: ~12.8 s of ~30 fps video would yield hundreds of packets, and the keyframe-heavy ratio is consistent with the source's GOP structure. So on the correctness ladder (this is a **bit-exact decoded-frames** comparison plus a **structural reference-reimport** packet/keyframe check — the strongest tier), the two engines are indistinguishable.

mediabunny wins on **mechanism cost**. Its `mux()` (`src/engines/mediabunny/adapter.ts:1508`) builds a real `Output` with the QuickTime `OutputFormat`, wires an `EncodedVideoPacketSource` (`adapter.ts:1528`) and `EncodedAudioPacketSource`, and re-adds each opaque encoded chunk as an `EncodedPacket` (`adapter.ts:1562`) carrying the first-packet `decoderConfig.description` (`adapter.ts:1579`) so the muxer can emit the correct `avcC` codec-private box. This is a **pure-TypeScript, single-pass packet copy** straight into a `BufferTarget` — no re-encode, no transcode, no WASM boot. config used (from `env.configUsed`): `coreBuild: pure-ts-esm`, `pipeline: streaming-lockstep`, `sharedArrayBuffer: false`, `coopCoep: not-required`. The display matrix rides along because the source's encoded packets and track config preserve the ISOBMFF rotation metadata into the `.mov` `tkhd` matrix (mediabunny only *bakes* rotation into pixels when an explicit `rotate` Conversion is requested via `allowRotationMetadata:false` at `adapter.ts:597` — this scenario is a straight packet mux, not a Conversion, so the matrix is copied, not flattened). Result: 39.44 ms wall.

ffmpeg-wasm does the same job correctly but at WASM cost. Its mux path (`src/engines/ffmpeg-wasm/adapter.ts`, `mux:true` declared at `adapter.ts:~1746`, `-c copy` file path per the header comment at `adapter.ts:33`) must **reconstruct demuxable elementary streams** from the opaque WebCodecs-style length-prefixed AVCC chunks in MEMFS (`adapter.ts:491`+ "Bitstream reconstruction for mux()") and then run a full `ffmpeg -i ... -c copy out` exec through the single-thread wasm core. That bitstream-rebuild + exec round-trip is what costs 673.81 ms — 17.1× more wall than mediabunny's in-process packet append. Interestingly ffmpeg-wasm's `longtasks` is *lower* (205 ms vs mediabunny's 3675 ms): mediabunny's lockstep platform-decode verification phase generates long main-thread tasks, while ffmpeg's heavy work runs inside the worker. But `longtasks` is a secondary metric and the primary wall metric decisively favors mediabunny.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed with identical oracle measurements (12/12 bit-exact, 770 packets / 475 keyframes) but lost on performance: **673.81 ms wall vs 39.44 ms (17.1× slower)**. Cause is the WASM-core `-c copy` exec plus elementary-stream reconstruction from opaque chunks (`adapter.ts:491`+), versus mediabunny's in-process packet copy. Not a defect — just a slower mechanism for this single-track mov mux.
- **mp4box@2.3.0** — NA_ENGINE, honest: declares `containersOut: ['mp4']` only (`src/engines/mp4box/adapter.ts:647`); it cannot write a QuickTime `.mov`, so the runner correctly records "does not declare output container 'mov'". Not an under-declaration — mp4box's writer targets ISO-BMFF mp4.
- **platform@chrome-149** — NA_ENGINE, honest: `mux:false` (`src/engines/platform/adapter.ts:235`) with the note "MediaRecorder can't ingest opaque encoded chunks". Raw WebCodecs has no container writer that accepts pre-encoded packets, so muxing is genuinely impossible.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: a parser/demuxer only; does not declare the `mux` operation.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: a demuxer only; `mux` is undeclared and the adapter throws on undeclared ops (`src/engines/web-demuxer/adapter.ts:1043`).
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest: does not declare the `mux` operation.

## Anti-cheat validation

- **Scenario**: `src/scenarios/mux/codec-edges.ts:74` (`id: 'edge_rotation_decode_mux_mov'`), invariant `DECODE_MUX`, input `h264_rotated90.mp4`, `to: 'mov'`, oracles `['property-invariant', 'reference-reimport']`. Notes (`codec-edges.ts:83-86`) confirm the gating rationale: the 90° display matrix must be authored into the mov output, and a dropped matrix would change decoded pixels.
- **Fixture exists**: `fixtures/media/h264_rotated90.mp4` = 4.4 MB real H.264 file (verified via stat). Not synthetic/empty/mock.
- **Golden is real, not a placeholder**: `fixtures/golden/h264_rotated90.mp4.frames.json` carries 12 real SHA-256 RGBA digests with `"pending": false` and `"bakedAtIso": "2026-06-18T13:54:06.075Z"` ("frame-bake (platform engine)"). The `$todo` string is stale boilerplate; `pending:false` plus populated `frames[].sha256` proves the bake completed. (The header comment in `codec-edges.ts:22-24` warns these were `$todo` placeholders pre-bake — they have since been filled.)
- **Oracle is meaningful**: `property-invariant` decode-remux branch (`src/core/oracles.ts:2686-2707`) decodes `ctx.output` with the platform decoder and runs `compareDigests` against the golden frames — a real per-frame bit-exact comparison (`mismatchedFrames:0` over 12 frames), NOT a smoke gate, NOT ssim with exactFrames==0. `reference-reimport` (`src/core/oracles.ts:1225-1271`) demuxes the engine output with a reference engine and checks a non-empty packet table plus golden packet/keyframe consistency (770 packets, 475 keyframes).
- **Winner adapter is genuine**: `src/engines/mediabunny/adapter.ts:1508` `mux()` constructs a real `mb.Output` + `EncodedVideoPacketSource` (`:1528`) and appends every encoded `EncodedPacket` with decoder config (`:1562`-`:1591`), `output.finalize()` (`:1598`). No canned output, no input→output copy, no golden short-circuit, no error swallowing.
- **Cached note**: both PASS results have `cached==true` ("cached previous PASS result"). Evidence is reused, not freshly re-run in this pass — staleness risk per the launcher seeding caveat. The oracle measurements remain internally consistent (identical across both engines, plausible counts), so the verdict holds, but a fresh re-run would strengthen confidence.

**validationVerdict: REAL** — real 4.4 MB fixture, real baked golden frames, real bit-exact + structural oracles with plausible measurements, and a genuine library-backed mux implementation in the winner.

## Confidence & caveats

- **Confidence: high** on correctness (real fixture + real baked golden + bit-exact oracle, identical for both engines) and **high** on the performance ranking (17.1× wall margin is far beyond any n=1 noise band).
- Caveats: (1) both engines are `cached==true`, so numbers are reused, not re-run; (2) bench `n==1` for wall (mad=0, p95=median) — a single sample, though the 17.1× gap is too large to be sampling noise; (3) ffmpeg-wasm's `peakMemory` is unmeasured (`n==0`), so the memory comparison is one-sided; (4) mediabunny's `longtasks` (3675 ms) is much higher than ffmpeg-wasm's (205 ms), a real main-thread cost from its lockstep verification path, but it is a secondary metric and does not overturn the primary wall-clock decision.
