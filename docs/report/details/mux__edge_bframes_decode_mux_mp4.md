# mux/edge_bframes_decode_mux_mp4

- family: mux
- fixture asset: `fixtures/media/h264_bframes_1080p.mp4` (11 MB, real H.264+AAC 1080p clip with B-frame reorder)
- primaryMetric: wall (ms)
- passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- CONTESTED: 2 engines PASS (mediabunny, ffmpeg.wasm@0.12.15) with byte-for-byte identical oracle outcomes.
- Decisive factor: PERFORMANCE. Correctness is a tie (both engines pass `property-invariant` with 12/12 frame
  digests bit-exact and `reference-reimport` with 770 packets / 472 keyframes). mediabunny wins on wall time.
- Margin over runner-up: **2.59x faster wall** (54.72 ms vs 141.87 ms). Both samples are n=1 (single timed
  run, mad=0), so the margin is directional rather than statistically tight — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass, reference-reimport:pass | 54.72 ms | n/a (not benched) | 64,335,657 B (~61.4 MB) | 1068 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass, reference-reimport:pass | 141.87 ms | n/a (not benched) | 0 B (n=0, not captured) | 874 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'mux:browser-decode-equality' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| ffmpeg.wasm (n/a) | — | — | — | — | — | — | — |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

(7 distinct engine entries: mediabunny, ffmpeg.wasm, mp4box, platform, remotion-media-parser, web-demuxer,
remotion-webcodecs.)

## Why the winner wins (deep technical)

This scenario is an author-side B-frame stress test. The input `h264_bframes_1080p.mp4` carries an H.264
elementary stream whose coded order differs from presentation order (DTS != PTS because of B-frames). The
`mux` operation must take the already-encoded packets and re-author them into a fresh MP4, regenerating the
`ctts` (composition-time-to-sample) table and edit list from the supplied dts/pts spread. A muxer that
naively assumes pts==dts corrupts the reorder and the decoded picture order shifts. The gating invariant is
`decode(mux(x))==decode(x)` (scenario `src/scenarios/mux/codec-edges.ts:41-55`, invariant token
`DECODE_MUX`), which decodes the muxed output in a real browser via WebCodecs and compares per-frame RGBA
sha256 digests to baked goldens.

Both PASS engines reach the *same* oracle truth, so the win is mechanical/performance, not correctness:

- property-invariant (`src/core/oracles.ts:2686-2707`): decodes `ctx.output` with the platform engine
  (`decodeWithPlatform`, `maxFrames=12`) and runs `compareDigests` against the 12 golden frame sha256s in
  `fixtures/golden/h264_bframes_1080p.mp4.frames.json` (baked 2026-06-18 by the platform/WebCodecs engine).
  Result for both: measuredFrames 12, goldenFrames 12, comparedFrames 12, **mismatchedFrames 0** — every
  reordered B-frame decoded to the exact pixels the source decodes to, proving the ctts/edit-list survived.
- reference-reimport (`src/core/oracles.ts:1225-1271`): the reference engine demuxes the muxed MP4 and counts
  packets/keyframes, then checks them against the golden packet table within 2% relative tolerance. Result
  for both: **770 packets, 472 keyframes** — exactly the golden counts in
  `fixtures/golden/h264_bframes_1080p.mp4.packets.json` (verified: 770 total, 472 keyframe), so no sample was
  dropped or duplicated through the re-wrap.

mediabunny's mux path (`src/engines/mediabunny/adapter.ts:1508-1600`) is a genuine streaming muxer: it builds
an `Output` over an `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (line 1528, 1539), then for each
packet constructs `new mb.EncodedPacket(c.data, c.keyframe ? 'key' : 'delta', c.ptsUs/1e6, c.durationUs/1e6,
i)` (line 1562-1569). Passing the real per-packet pts AND a monotonic decode-order sequence number (`i`) is
precisely what lets the writer reconstruct the composition offsets for B-frames; the first packet carries the
`decoderConfig.description` (avcC, line 1557, 1579) so the `hvcC`/`avcC` codec-private box is authored
correctly. mediabunny runs as pure-TS ESM with no wasm and no SharedArrayBuffer
(env.configUsed: `coreBuild: pure-ts-esm`, `wasmThreads: 0`, `coopCoep: not-required`), so the mux is a
direct JS box-builder with no module instantiation or virtual-FS round-trip — wall **54.72 ms**.

ffmpeg.wasm reaches the identical correct output but pays the wasm tax: its mux
(`src/engines/ffmpeg-wasm/adapter.ts:2899`) routes through the emscripten module and an MEMFS write/read of
the input and output files, plus a `-c copy` stream-copy invocation. That overhead shows as wall **141.87 ms**
(2.59x mediabunny) and longtasks 874 ms. Its peakMemory was not captured (n=0, 0 B), so a memory comparison is
not possible; mediabunny's peakMemory is ~61.4 MB. The decisive metric is therefore the primaryMetric (wall),
where mediabunny is clearly ahead.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost): correctness identical (12/12 bit-exact, 770/472), but 2.59x slower
  wall (141.87 ms vs 54.72 ms) due to wasm module + MEMFS file round-trip overhead. peakMemory not captured
  (n=0). Loses purely on the primaryMetric.
- **mp4box@2.3.0** (NA_ENGINE): does not declare feature `mux:browser-decode-equality`. mp4box.js can write
  ISO-BMFF boxes, but the suite does not claim it satisfies the WebCodecs decode-equality invariant for this
  case. Honest NA — the feature gate (`src/scenarios/mux/_shared.ts:264-265`) is the correct mechanism and
  mp4box simply did not opt in.
- **platform@chrome-149** (NA_ENGINE): does not declare operation `mux`. The platform engine is the
  decode/reference oracle backend (WebCodecs), not a muxer. Honest NA.
- **remotion-media-parser@4.0.479** (NA_ENGINE): does not declare operation `mux`. It is a read/parse-only
  demuxer. Honest NA.
- **web-demuxer@4.0.0** (NA_ENGINE): does not declare operation `mux`. Demux-only library. Honest NA.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): does not declare operation `mux`. It exposes transcode/decode
  paths, not a raw packet muxer. Honest NA.

## Anti-cheat validation

- Scenario: `src/scenarios/mux/codec-edges.ts:41-55` (`id: 'edge_bframes_decode_mux_mp4'`), invariant
  `DECODE_MUX` (`decode(mux(x))==decode(x)`), oracles `['property-invariant','reference-reimport']`.
- Fixture: `fixtures/media/h264_bframes_1080p.mp4` — EXISTS, 11 MB real H.264+AAC media (not synthetic/mock).
  Goldens exist: `.frames.json` (12 real baked RGBA sha256 digests, `pending:false`, bakedBy platform engine
  2026-06-18), `.packets.json` (770 packets / 472 keyframes), `.meta.json`, `.ssim.json`.
- Oracle: property-invariant `src/core/oracles.ts:2686-2707` performs a REAL WebCodecs decode of the muxed
  output and sha256 RGBA digest comparison vs goldens (not a tolerance-loose proxy, not ssim with
  exactFrames==0, not smoke). reference-reimport `src/core/oracles.ts:1225-1271` does a real demux + packet/
  keyframe count check within 2% rel tolerance. measurements are physically plausible: 12 frames at 1920x1080,
  33.333 ms cadence (~30 fps), 770 packets / 472 keyframes consistent with the on-disk golden packet table.
- Winner adapter: mediabunny mux `src/engines/mediabunny/adapter.ts:1508-1600` genuinely calls the mediabunny
  `Output`/`EncodedVideoPacketSource` API, feeds real packet bytes + pts/dts ordering, authors codec-private
  from the source description, and finalizes to bytes. No hardcoded/canned output, no input->output copy, no
  short-circuit to the golden, no swallowed errors (`finally { p.close() }` only closes sources; failures
  throw).
- Verdict: **REAL** — real 11 MB fixture, real WebCodecs decode-equality oracle with bit-exact digest
  comparison plus a packet-count re-import gate, and a genuine library muxer implementation.
- Cached note: BOTH PASS results have `cached:true` ("cached previous PASS result"). The evidence is reused
  from a prior run, not re-executed this run. The oracle pass values and measurements are deterministic
  (bit-exact digests, fixed packet counts), so staleness risk to the CORRECTNESS verdict is low; however the
  wall-time margin (the decisive factor) is from cached n=1 samples and should be re-timed for a hard claim.

## Confidence & caveats

- Confidence: medium. Correctness tie is unambiguous and both oracles are strong (bit-exact + packet count).
  The winner is chosen on performance, where mediabunny's 2.59x wall advantage is large and mechanistically
  explained (pure-TS vs wasm+MEMFS), but both bench samples are n=1 (mad=0, no spread), and both results are
  cached, so the exact ratio is directional.
- ffmpeg.wasm peakMemory is uncaptured (n=0), so a memory tiebreaker is unavailable; the wall metric carries
  the decision.
- No throughputRealtime was recorded for either engine in this shard, so the per-metric comparison rests on
  wall (primaryMetric) and longtasks (where ffmpeg is actually lower, 874 vs 1068 ms — but it loses on the
  primaryMetric).
