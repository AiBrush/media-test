# mux/edge_rotation_decode_mux_mkv

family: mux | fixture asset: `fixtures/media/h264_rotated90.mp4` (H.264 video + AAC audio, 90° display matrix) | primaryMetric: wall | passCount: 2

## Verdict

- **Best framework: mediabunny@1.48.0** (engineId `mediabunny`).
- **Contested**: 2 engines PASS (mediabunny, ffmpeg.wasm@0.12.15), 5 are NA_ENGINE.
- **Decisive factor: performance**. Both PASS engines satisfy the identical, strongest-tier oracle (`property-invariant` = `decode(mux(x))==decode(x)`, 12/12 RGBA frame digests **bit-exact** vs golden, 0 mismatches). Correctness is therefore a tie, so ranking falls to the wall-clock primary metric.
- **Margin over runner-up**: mediabunny 41.87ms vs ffmpeg.wasm 100.05ms wall median = **~2.39x faster wall**. mediabunny also wins on longtasks-amortized startup is offset; note its peakMemory is 56.9MB (ffmpeg-wasm reported 0 bytes, i.e. unmeasured, so memory is not directly comparable). Both n=1, so the margin is single-sample evidence (see caveats).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass | 41.87ms | n/a (not benched) | 56,905,673 B | 3675ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 100.05ms | n/a (not benched) | 0 B (unmeasured) | 2152ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is: take an H.264 elementary stream carrying a 90° rotation, originally in MP4 (where rotation lives in the `tkhd` display matrix), and re-mux the **same coded samples** into a Matroska (`.mkv`) container. The hard part is that Matroska does not have an MP4 display matrix; rotation must be re-authored as Matroska track display metadata (the scenario notes call out ProjectionPoseRoll / display metadata), AND the B-frame reorder + per-packet timestamps must survive the re-lacing into Matroska SimpleBlocks. The gating oracle does NOT trust container bytes; it decodes the produced `.mkv` with the platform WebCodecs decoder and compares the rendered RGBA frames against the golden source-decode (`src/core/oracles.ts:2686-2707`, comparison in `compareDigests` at `src/core/oracles.ts:1166-1207`). A dropped rotation, a mangled timestamp, or a corrupted sample would change the decoded presentation and the SHA-256 digests would diverge.

mediabunny passed with `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` — every one of the 12 frames is byte-identical after the MP4→MKV round trip. Mechanistically, mediabunny's mux/remux path (`src/engines/mediabunny/adapter.ts:1244-1260`) builds a `makeOutputFormat('mkv')` Matroska `Output` over a `BufferTarget` and runs the library's `Conversion` (`runConversion`) with no codec/transform options, which copies the encoded H.264 packets unchanged while re-authoring container-level metadata (rotation, codec-private) into Matroska. The encoded samples are never re-encoded, so the decoded pixels are inherently preserved; mediabunny's job is purely to carry the display rotation and per-packet PTS/duration into the SimpleBlock timeline, which it did correctly. Its `env.configUsed` shows the verification decode ran on `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, with `sharedArrayBuffer:false` and `coopCoep: not-required` — i.e. it needs no cross-origin isolation and leans on the M1 Max hardware H.264 decoder (ANGLE Metal renderer). That hardware-decode + pure-TS ESM core (`coreBuild: pure-ts-esm`, `wasmThreads:0`) is exactly why its wall median is 41.87ms.

ffmpeg.wasm reaches the same bit-exact result (12/12, 0 mismatches) via a genuine `ff.exec` ffmpeg invocation (`src/engines/ffmpeg-wasm/adapter.ts` writes the input with `writeFile` and runs an exec; mkv is a declared container at `adapter.ts:164/179/794`, with mkv-specific handling at `adapter.ts:870`). But it pays the wasm tax: a single-threaded WASM ffmpeg build must stream the demux/copy/mux through the emscripten FS and the WASM heap, producing a 100.05ms wall median — 2.39x slower than mediabunny's native-WebCodecs-assisted path. ffmpeg-wasm's correctness is equally strong (same oracle, same bit-exactness), so it loses purely on throughput, not faithfulness.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost. Same strongest-tier oracle, identical bit-exactness (12/12, mismatchedFrames:0), but **2.39x slower wall** (100.05ms vs 41.87ms). Honest, full-strength loss on performance only; its peakMemory was unmeasured (0 B), so the memory dimension is not decisive.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest declaration; mp4box is an ISO-BMFF (MP4) toolkit and cannot author Matroska, so it correctly abstains rather than faking an mkv.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest; the raw WebCodecs platform shim exposes decode/encode but no container muxer in this suite.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest; it is a parser/demuxer, not a muxer.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest; demux-only by design.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest; no container-write operation declared.

All five NAs look genuine (capability/declaration mismatches), not under-declared evasions: none of these libraries ships a Matroska muxer in this harness.

## Anti-cheat validation

- **Scenario**: `src/scenarios/mux/codec-edges.ts:88-100` (id `edge_rotation_decode_mux_mkv`), invariant `DECODE_MUX`, `input: 'h264_rotated90.mp4'`, `to: 'mkv'`, feature `rotate`.
- **Fixture**: `fixtures/media/h264_rotated90.mp4` **exists**, 4.4 MB real H.264+AAC file with a 90° rotation — not synthetic/empty/mock.
- **Oracle**: `property-invariant` dispatch at `src/core/oracles.ts:2686-2707`, real bit-exact digest comparison in `compareDigests` at `src/core/oracles.ts:1166-1207`. It decodes the produced output with the platform decoder and requires SHA-256 RGBA frame digests to match golden with **zero tolerance** (any mismatch -> fail). This is the strongest correctness tier (decoded-frames-bitexact class), not a smoke or wide-tolerance gate. Measurements (12 frames compared, 0 mismatched) are physically plausible for a short rotated clip.
- **Winner adapter**: `src/engines/mediabunny/adapter.ts:1244-1260` (remux) -> `makeOutputFormat('mkv')` + `Output`/`BufferTarget` + `runConversion`. Real library calls; no canned output, no input->output copy-to-fake, no golden short-circuit, no error-swallow-then-pass.
- **Cached note**: BOTH PASS results have `cached:true` ("cached previous PASS result"). The evidence is reused, not freshly re-run this session — staleness risk per the launcher-seeding caveat. The implementation and oracle are genuine, so the verdict stands, but the exact wall numbers (41.87 / 100.05ms) are from a prior run.
- **Verdict: REAL** — real 4.4MB fixture, real Conversion-based Matroska mux, meaningful bit-exact decode-equality oracle.

## Confidence & caveats

- Confidence: **high** on the winner identity (mediabunny is the only faster of the two genuine PASS engines; the other five honestly abstain). 
- Caveats: (1) bench is **n=1** for both engines (mad=0, p95==median), so the 2.39x wall margin is single-sample and could shift on re-run. (2) Both results are **cached** — numbers are not from a fresh run. (3) peakMemory is incomparable (mediabunny 56.9MB vs ffmpeg-wasm unmeasured 0 B); the win rests on wall, not memory. (4) longtasks (mediabunny 3675ms vs ffmpeg-wasm 2152ms) is dominated by one-time engine warmup/decode setup and is not the primary ranking metric here.
