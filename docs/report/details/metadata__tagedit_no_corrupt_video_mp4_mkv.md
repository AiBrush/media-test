# metadata/tagedit_no_corrupt_video_mp4_mkv

- family: metadata
- fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 1080p + AAC, real file)
- operation: `remux` MP4 -> MKV (tag-only rewrite modeled as a lossless container change)
- primaryMetric: wall (median ms)
- passCount: 2 / 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15**
- Contested: **YES** (2 engines PASS: ffmpeg-wasm and mediabunny; both bit-exact)
- Decisive factor: **performance**. Correctness is identical (both pass `property-invariant`/decode-remux with 12/12 frame digests bit-exact, 0 mismatched). The tiebreak goes to wall time.
- Margin over runner-up: ffmpeg-wasm wall median **247.32 ms** vs mediabunny **355.15 ms** = **1.44x faster wall** (mediabunny is 1.44x slower). longtasks are near-identical (4277 ms vs 4223 ms, ffmpeg 1.01x higher, negligible). peakMemory not measured (n=0) for either. Both n=1, so the wall margin is single-sample evidence — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass (12/12 bit-exact) | 247.32 ms | n/a | 0 (n=0) | 4277 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass (12/12 bit-exact) | 355.15 ms | n/a | 0 (n=0) | 4223 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

## Why the winner wins (deep technical)

The scenario asserts a metamorphic invariant: a tag-only rewrite (modeled as a lossless MP4 -> MKV remux of an H.264/AAC stream) must NOT touch the coded video samples — `decode(remux(x)) == decode(x)`, pixel-exact. The gating oracle is `property-invariant` routed to the `decode-remux` branch (`src/core/oracles.ts:2686-2707`): it decodes the engine's remux OUTPUT with the platform decoder (`ctx.decodeWithPlatform`) and compares the resulting RGBA frame SHA-256 digests against the baked golden decode of the SOURCE (`fixtures/golden/h264_1080p_30s.mp4.frames.json`, 12 frames at 1920x1080, e.g. frame 0 sha256 `e3c072e0…`). `compareDigests` (`src/core/oracles.ts:1166-1207`) requires zero mismatches; the shard records `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` for BOTH winners, so correctness is a dead heat.

Because correctness is equal, the win is mechanistic on the remux data path and its cost. ffmpeg.wasm's `remux()` (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) issues a genuine `-map 0 -c copy` stream copy: it demuxes the MP4 elementary streams and re-muxes the *identical* coded H.264 NAL units and AAC frames into a Matroska container with no re-encode. Because the codec bitstream is copied verbatim, the decoded pixels are necessarily identical to the source decode — exactly what the oracle measured (12/12 bit-exact). The whole operation is a single libavformat demux+mux pass through the wasm core, which is why its wall median is only 247.32 ms.

mediabunny's `remux()` (`src/engines/mediabunny/adapter.ts:1244-1260`) is also a true lossless copy: with no codec/transform options it builds an `Output` with the target MKV format and runs `runConversion`, which copies encoded samples (its config used `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `wasmThreads: 0`, `coopCoep: "not-required"` — per `env.configUsed` in the shard). It is equally correct (12/12 bit-exact) but its streaming-lockstep conversion path carries more per-sample JS/WebCodecs orchestration overhead for a pure container rewrap, landing at 355.15 ms — 1.44x slower than ffmpeg's monolithic wasm `-c copy`. For a tag-edit/remux where the work is pure muxing (no decode/encode actually needed), ffmpeg's single-pass C muxer is the leaner path, and that is the decisive factor here.

Note that the `property-invariant`/decode-remux oracle still decodes the output to verify pixels, but neither engine needs WebCodecs hardware decode to *produce* the remux — so mediabunny's hardware-accel tiebreak advantage (which would matter for a transcode) is irrelevant for this stream-copy case; it only adds orchestration cost.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost): correctness tied (12/12 bit-exact) but 1.44x slower wall (355.15 ms vs 247.32 ms). Lost purely on the performance tiebreak for a pure container rewrap.
- **platform@chrome-149**: NA_ENGINE — does not declare operation `remux`. Honest: WebCodecs alone offers no container muxer, so a stream-copy remux is genuinely out of scope.
- **remotion-media-parser@4.0.479**: NA_ENGINE — does not declare operation `remux`. Honest: it is a parser/demuxer, not a muxer.
- **web-demuxer@4.0.0**: NA_ENGINE — does not declare operation `remux`. Honest: demux-only library; no MKV writer.
- **mp4box@2.3.0**: NA_ENGINE — does not declare output container `mkv`. Honest: MP4Box is an ISOBMFF (MP4) toolkit and cannot author Matroska output.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — does not declare output container `mkv`. Plausibly honest: its mux targets do not include Matroska. Mild under-declaration risk vs a full muxer, but consistent with a WebCodecs-centric MP4/WebM pipeline rather than MKV.

## Anti-cheat validation

- Scenario definition: `src/scenarios/metadata/write-roundtrip.ts:121-134` (`NO_CORRUPT_PROPERTY[0]`, id `tagedit_no_corrupt_video_mp4_mkv`), built via `buildProperty` (`src/scenarios/metadata/_shared.ts:176-196`) into op `remux`, input `h264_1080p_30s.mp4`, options `{container:'mkv', invariant:'decode(remux(x))==decode(x)'}`, oracle `property-invariant`.
- Fixture exists and is real: `fixtures/media/h264_1080p_30s.mp4` = 31 MB real H.264/AAC MP4 (stat confirmed). Golden decode `fixtures/golden/h264_1080p_30s.mp4.frames.json` = 12 frames, real per-frame SHA-256 at 1920x1080. Not synthetic/empty/mock.
- Oracle: `property-invariant` decode-remux branch `src/core/oracles.ts:2686-2707`, comparison `compareDigests` `src/core/oracles.ts:1166-1207`. It decodes the engine OUTPUT and requires zero mismatched SHA-256 frame digests vs the golden source decode — a strict structural/decoded-pixel gate, not a smoke or wide-tolerance proxy. Cannot be trivially satisfied: an engine that re-encodes or drops frames produces different digests and fails.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — genuine `-map 0 -c copy` libavformat stream-copy into the target container; reads back the produced bytes. No canned output, no input->output passthrough fake, no short-circuit to golden, no error swallowing.
- Measurements physically plausible: 12 frames decoded from a 30s 1080p clip (sparse digest sample), 0 mismatches, wall in the hundreds of ms for a wasm stream-copy of a 31 MB file. Consistent with real media.
- Verdict: **REAL** — real fixture + real stream-copy implementation + strict decoded-frame bit-exact oracle.
- Cached note: BOTH PASS results have `cached:true` ("cached previous PASS result"). The pass evidence and bench numbers were reused, not re-run this session; the wall margin (the decisive factor) is therefore a stale single-sample reading and should be re-measured for a high-confidence performance claim.

## Confidence & caveats

- Correctness verdict (both bit-exact) is high confidence: oracle is strict and measurements are clean (12/12, 0 mismatch) for both engines.
- Performance verdict is medium confidence: the win is decided on wall time with n=1 (no spread; mad=0, p95==median by construction) and BOTH results are cached/stale. A 1.44x gap is meaningful but single-sample; re-running fresh could narrow or shift it.
- peakMemory was not captured (n=0) for either engine, so the memory tiebreak could not be applied.
- All NA engines are honest capability gaps for an MP4->MKV stream-copy remux (no muxer / no MKV output target); the only mild under-declaration candidate is remotion-webcodecs lacking MKV output, but that is consistent with its WebCodecs MP4/WebM scope.
