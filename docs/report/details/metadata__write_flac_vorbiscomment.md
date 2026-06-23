# metadata/write_flac_vorbiscomment

- family: metadata
- fixture asset: `flac_seektable.flac` (real, fixtures/media/flac_seektable.flac, 143 KB, FLAC 16-bit stereo 48 kHz, 480000 samples = 10.000 s)
- primaryMetric: wall (metrics: wall, targetWrites)
- passCount: 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (2 engines PASS with identical oracle outcomes).
- **Decisive factor: performance.** Correctness is a dead heat (both pass `reference-reimport` and `property-invariant` with byte-identical measurements), so the tiebreak falls to wall time and backend posture. mediabunny wins on wall median: **5.675 ms vs 7.075 ms = 1.247x faster** (0.802x of ffmpeg-wasm's wall).
- **Margin caveat:** both bench samples are `n==1, warmup==1, mad==0` (single timed iteration). A 1.25x gap on n==1 with no spread is weak statistical evidence; treat the ranking as directional, not robust.
- **Secondary tiebreakers reinforce mediabunny:** it runs as `coreBuild:pure-ts-esm`, `wasmThreads:0`, `sharedArrayBuffer:false`, `coopCoep:not-required` (env.configUsed) — no COOP/COEP header requirement and no multi-MB wasm core, versus ffmpeg.wasm's single-thread wasm transcoder core. For a tag-only FLAC rewrite this is a pure-JS bitstream copy vs a wasm process spawn.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true, property-invariant:true | 5.675 ms | n/a (not measured) | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true, property-invariant:true | 7.075 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'flac' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

(Bench set for this scenario is `['wall','targetWrites']`; throughputRealtime/peakMemory/longtasks were not collected. `targetWrites` is `n==0` / median 0 for both engines — the FLAC remux output path did not emit per-write telemetry, so it is non-discriminating.)

## Why the winner wins (deep technical)

The operation under test is **op:'remux'** that re-wraps a FLAC elementary stream into a FLAC container while attaching a VORBIS_COMMENT tag block (`options: { container:'flac', tags: UNICODE_TAGS, invariant:'probe-duration' }`, built by `buildWrite` in src/scenarios/metadata/_shared.ts:133-152). The codec is FLAC and both input and output container are native FLAC — a lossless stream copy, no decode/re-encode. The source is `flac_seektable.flac`: real FLAC, STREAMINFO declares 48000 Hz / 2 ch / 480000 samples = exactly 10.000 s, with a SEEKTABLE metadata block.

mediabunny's path (src/engines/mediabunny/adapter.ts:1244-1259 `remux`) builds a `flac` OutputFormat (`makeOutputFormat`, adapter.ts:932/1250), opens the input, instruments a `BufferTarget` (`instrumentedOutputTarget`, adapter.ts:767-835), and runs `Conversion.init/.execute` with no codec/transform options (`runConversion`, adapter.ts:842-868). With no video/audio transform options the Conversion copies the encoded FLAC packets verbatim into a freshly written FLAC container — a pure-TS bitstream copy with zero codec work. mediabunny declares `metadata:write` (adapter.ts:1054) and `containersOut` includes `flac` (adapter.ts:1039), so the runner forwarded the op to a genuine code path. This explains the 5.675 ms wall: there is no wasm instantiation and no transcode, just FLAC frame copy + container framing in JS, executed on the Apple M1 Max.

ffmpeg-wasm's path (src/engines/ffmpeg-wasm/adapter.ts:2031-2069 `remux`) materializes the input into MEMFS, runs `-i in -map 0 -c copy`, appends one `-metadata key=value` per tag (adapter.ts:2056-2061), and reads the FLAC output back. This is also a genuine lossless stream copy that genuinely writes the Vorbis comments via FFmpeg's metadata muxer — but it pays the wasm-FS round-trip and FFmpeg process orchestration cost, hence the higher 7.075 ms wall.

The two gating oracles report **byte-identical** measurements for both engines, which is why correctness cannot separate them:
- `reference-reimport` (src/core/oracles.ts:1225-1271, routed through `semanticRemuxReimport` at oracles.ts:1273ff for op=='remux'): the reference engine re-demuxed each output and found **reimportPackets:105, reimportKeyframes:105, reimportMediaTracks:1, goldenMediaTracks:1, durationDeltaSec:0** (tolerance 0.1 s). 105 FLAC frames is a plausible packet count for a 10 s FLAC at default frame sizes; track count matches golden. This is a structural/metadata-exact oracle (container parses, track layout and duration match golden) — strong on "did not corrupt the container," silent on tag content.
- `property-invariant` with `invariant:'probe-duration'` (src/core/oracles.ts:2645-2759, cross-container probe branch): re-probed each output, **outDurationSec:10, goldenDurationSec:10, deltaSec:0, durationToleranceSec:0.041666…** (one video-frame-equivalent band). Δ 0.0000 s ≤ 0.0417 s — the FLAC sample count was preserved exactly, the honest "audio samples intact" proxy.

Both engines land on the same numbers, so the ladder reduces to performance, where mediabunny's pure-TS copy beats the wasm path 1.247x.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** correct and genuinely writes Vorbis comments, but slower — wall 7.075 ms vs 5.675 ms (1.247x slower) and requires a wasm core + MEMFS round-trip. No correctness deficit; pure throughput/backend loss.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'flac'." Honest NA — MP4Box.js is an ISOBMFF (MP4/MOV) toolkit and cannot parse a native FLAC elementary stream. Correct under-the-truth declaration.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare output container 'flac'." Honest NA — the Remotion WebCodecs converter targets MP4/WebM, not raw FLAC muxing.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'remux'." Honest NA — media-parser is a read/probe/demux library, not a muxer; it cannot produce an output container.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'remux'." Honest NA — the bare WebCodecs/browser platform exposes decode/encode primitives but no container muxer, so remux is genuinely out of scope.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'remux'." Honest NA — web-demuxer demuxes only; it has no mux/write side. Correct declaration.

All five NAs look genuine, not under-declared capability hiding: none of these libraries has a real FLAC-write/remux path.

## Anti-cheat validation

- **Scenario:** src/scenarios/metadata/write-roundtrip.ts:91-102 (`id: 'write_flac_vorbiscomment'`), built via `buildWrite` at src/scenarios/metadata/_shared.ts:133-152.
- **Fixture:** `flac_seektable.flac` exists at fixtures/media/flac_seektable.flac (143 KB). `file(1)` confirms a real FLAC bitstream, 16-bit stereo 48 kHz, 480000 samples; magic bytes `fLaC` present. Duration 480000/48000 = 10.000 s, exactly matching both engines' oracle measurements (outDurationSec:10). Not synthetic/empty/mock.
- **Oracles:** src/core/oracles.ts:1225 (`reference-reimport` → `semanticRemuxReimport` at 1273) performs a real re-demux of `ctx.output` and compares track layout + duration to golden; src/core/oracles.ts:2645 (`property-invariant`, probe-duration branch at 2709-2759) re-probes the authored output and compares duration within a 0.0417 s band. Measurements (105 packets/keyframes, 1 track, Δ0.0000 s) are physically plausible for this real FLAC. Neither oracle is trivially satisfiable for corruption; tolerance is tight (one-frame band).
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1244-1259 (`remux`) — genuine `Conversion.init/.execute` over a real `flac` OutputFormat + BufferTarget (no canned output, no input→output passthrough, no golden short-circuit, no error swallowing).
- **Verdict: WEAK-GATE.** The PASS is real (real fixture, real lossless-copy implementation, meaningful structural+duration oracles), BUT no oracle reads back the WRITTEN VORBIS_COMMENT tag content. The scenario file header (write-roundtrip.ts:15-18) and notes explicitly admit this: "reading the WRITTEN tag CONTENT back and asserting tags ⊇ T … is NOT REALIZABLE here." So the feature literally named "write_flac_vorbiscomment" is gated only on "did not corrupt the FLAC / duration preserved" — a no-corruption proxy, not a tag-presence assertion. Notably, mediabunny's winning `remux` path (adapter.ts:1244-1259 → runConversion) never calls `setMetadataTags`, so the UNICODE_TAGS may not even be written to the output — yet it still PASSes because the gate ignores tag content. This is not a CHEAT (no faked output), but the gate does not test the headline capability.
- **Cached note:** BOTH PASS engines have `cached:true` ("cached previous PASS result"). Evidence is reused, not freshly re-run; per the launcher seeding caveat, stale PASS reuse is a known risk. The 5.675 ms / 7.075 ms wall figures are from a prior run.

## Confidence & caveats

- Confidence: **medium.** Winner selection is well-grounded (only 2 eligible; identical correctness; clean perf gap; honest NAs). But: (1) both results are cached, so timings may be stale; (2) bench is n==1/mad==0 — the 1.247x margin is directional only; (3) the gating oracle is a WEAK-GATE that never verifies the Vorbis comment was written, and the mediabunny remux path does not appear to apply `opts.tags` at all — so "best at writing FLAC Vorbis comments" really means "fastest at producing a non-corrupt FLAC container for this op," which both engines do. If a tag-readback oracle were added, mediabunny's standing on THIS specific capability would need re-verification.
