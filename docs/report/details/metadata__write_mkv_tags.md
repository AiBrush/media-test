# metadata/write_mkv_tags

- family: metadata
- fixture asset: `fixtures/media/h264_in_mkv.mkv` (4.4 MB, H.264 video + AAC audio in Matroska)
- primaryMetric: wall (ms)
- passCount: 2 of 7 (mediabunny, ffmpeg.wasm)

## Verdict

- Best framework: **mediabunny@1.48.0** (`webcodecs` backend, streaming-lockstep pipeline).
- Status: **CONTESTED** — two engines PASS (mediabunny, ffmpeg.wasm) with identical correctness.
- Decisive factor: **performance**, because correctness is a tie. Both engines satisfy the exact
  same two oracles with identical measurements (reference-reimport: 770 packets / 475 keyframes /
  2 media tracks; property-invariant decode-remux: 12/12 frames bit-exact, 0 mismatched). With
  correctness comparable, the runner ranks on wall median.
- Margin over runner-up: mediabunny wall median **41.175 ms** vs ffmpeg.wasm **74.490 ms** =
  **~1.81x faster wall** (0.55x of ffmpeg.wasm's time). Caveat: n==1 (single timed sample,
  warmup=1, mad=0) for both — a weak performance signal; see Confidence.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true, property-invariant:true | 41.175 ms | n/a (not measured) | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true, property-invariant:true | 74.490 ms | n/a (not measured) | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Only `wall` and `targetWrites` were collected as bench metrics; `targetWrites` has n==0 (median 0)
for both engines, so it carries no signal. throughputRealtime / peakMemory / longtasks were not
emitted for this scenario.

## Why the winner wins (deep technical)

This is a Matroska tag-write modeled as a tag-bearing lossless rewrite (op `remux`, container
`mkv`). The asset is H.264 video + AAC audio in an MKV container. The scenario (built by
`buildWrite`, `src/scenarios/metadata/_shared.ts:133-147`) attaches exactly two oracles:
`reference-reimport` and `property-invariant`. The latter routes to the `decode-remux`
invariant (`src/core/oracles.ts:3883` maps `op === 'remux'` to `decode-remux`), i.e.
decode(remux(x)) == decode(x).

mediabunny performs a genuine container rewrite through its Conversion API. `remux()`
(`src/engines/mediabunny/adapter.ts:1244-1260`) builds an `MkvOutputFormat`
(`src/engines/mediabunny/codecs.ts:168-169`), opens the real `Input`, and runs
`runConversion` (`adapter.ts:842-868`) which calls `Conversion.init` / `conversion.execute()`.
Crucially it checks `conversion.isValid` and throws on discarded tracks — it cannot silently
fake success. Because the source codecs (H.264, AAC) are both Matroska-legal, mediabunny
copies the coded samples without re-encoding, which is exactly what the no-corruption gate
demands.

The two oracle outcomes confirm the rewrite is real and lossless:
- `reference-reimport` (`src/core/oracles.ts:1225-1271` → `semanticRemuxReimport` at 1273+):
  the reference engine re-demuxes mediabunny's MKV output and recovers **770 packets, 475
  keyframes, 2 media tracks** (goldenMediaTracks=2), with durationDeltaSec **0.016 s** against a
  0.1 s tolerance. The track layout and duration match the golden — proof the output is a valid,
  semantically-equivalent Matroska, not an empty or truncated file.
- `property-invariant` / decode-remux (`src/core/oracles.ts:2686-2707`): the platform decoder
  decodes the output and `compareDigests` checks frame digests against the golden source decode.
  Result: **measuredFrames=12, goldenFrames=12, comparedFrames=12, mismatchedFrames=0** — every
  compared frame is bit-exact. The H.264 coded samples survived the MKV rewrite untouched, so the
  tag-write provably did not corrupt video.

mediabunny used the WebCodecs backend with hardware-preferred decode
(`env.configUsed`: backend `webcodecs`, hwAccel `prefer-hardware`, pipeline
`streaming-lockstep`, wasmThreads 0, COOP/COEP not-required, sharedArrayBuffer false). For a
pure remux the H.264 frames are copied rather than re-decoded/re-encoded, so the win is mostly
about a lean pure-TS ESM mux path with no wasm cold-start. ffmpeg.wasm produces an
identically-correct MKV but pays the single-thread wasm tax (load + in-memory FS round trip),
which shows up as 74.490 ms vs mediabunny's 41.175 ms — a ~1.81x wall gap with no correctness
difference. mediabunny also needs no COOP/COEP isolation, a deployment-friendliness tiebreaker
in its favor.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on speed only. Identical oracle measurements (770 pkts /
  475 kf / 2 tracks; 12/12 bit-exact; durationDelta 0.026 s < 0.1 s). Wall median 74.490 ms =
  ~1.81x slower than mediabunny (single-thread wasm cold path). A correctness co-winner, ranked
  second purely by wall.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'mkv'". Honest NA;
  mp4box is an ISO-BMFF/MP4 library and genuinely cannot parse Matroska, so it correctly opts out.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'".
  Honest NA; its muxer does not emit Matroska.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'".
  Honest NA; it is a parser/probe library, not a muxer/remuxer.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA;
  the bare WebCodecs/platform shim exposes decode/encode primitives but no container remux op.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA;
  it is a demux-only wrapper with no muxing path.

All five NAs are NA_ENGINE (capability not declared), and each looks honest given the library's
real scope — none appears to be an under-declared capability hiding a working MKV-remux path.

## Anti-cheat validation

- Scenario: `src/scenarios/metadata/write-roundtrip.ts:64-75` (id `write_mkv_tags`), built via
  `buildWrite` at `src/scenarios/metadata/_shared.ts:133-147` (oracles
  `['reference-reimport','property-invariant']`, invariant `DECODE_REMUX`).
- Fixture: asset `h264_in_mkv.mkv` — exists at `fixtures/media/h264_in_mkv.mkv`, 4.4 MB real
  Matroska (H.264 + AAC). Golden artifacts present: `fixtures/golden/h264_in_mkv.mkv.meta.json`,
  `.packets.json` (87k), `.frames.json`, `.ssim.json`. Real input, not synthetic/empty/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1260` (`remux`), backed by
  `runConversion` at `adapter.ts:842-868` (real `Conversion.init`/`execute`, `isValid` guard) and
  `MkvOutputFormat` at `src/engines/mediabunny/codecs.ts:168-169`. The operation genuinely calls
  the library; it does not return canned output, copy input bytes, short-circuit to the golden, or
  swallow errors (it throws on invalid conversion / no output buffer).
- Oracles: `reference-reimport` at `src/core/oracles.ts:1225` (re-demuxes the output via the
  reference engine; fails on empty packet table, mismatched track count/layout, or duration drift
  > tol) and `decode-remux` at `src/core/oracles.ts:2686-2707` (bit-exact frame-digest comparison
  against golden via `compareDigests`). Measurements are physically plausible for a 4.4 MB MKV:
  770 packets / 475 keyframes / 2 tracks / 12 bit-exact frames / 0.016 s duration delta.
- Verdict: **WEAK-GATE**. The implementation and oracles are real and non-trivial, but they do
  NOT verify the actual feature name — writing MKV/Matroska SimpleTag CONTENT. The scenario file
  itself states this explicitly (`write-roundtrip.ts:14-18` and `:72-74`: "Tag-content readback
  not gated … no oracle re-probes a remux output and compares a tag map"). The remux adapter path
  shown does not wire `opts.tags` into `Output.setMetadataTags` for this code path, and no oracle
  reads tags back. So the PASS truthfully proves "a tag-bearing MKV rewrite produced a valid
  container and did not corrupt the H.264/AAC media" — a real and useful no-corruption gate — but
  it is a proxy for tag-writing, not a verification of written tag bytes. This is a known,
  documented oracle gap, not a cheat: there is no faked output or tolerance-so-wide-it-passes
  trick (decode-remux is bit-exact with mismatchedFrames=0).
- Cached note: both PASS results have **cached==true** ("cached previous PASS result"). The
  evidence was reused, not re-run in this session; staleness risk exists, though the source
  fixture and goldens are present and consistent.

## Confidence & caveats

- Confidence: **medium**. The winner selection (mediabunny over ffmpeg.wasm on wall) is robust on
  the recorded numbers, but two caveats temper it: (1) performance is the only differentiator and
  it rests on **n==1** timed samples (mad=0, p95==median) for both engines — a single-shot wall
  measurement is weak evidence of a durable ~1.81x edge; (2) both results are **cached**, so the
  numbers were not re-measured this run.
- Correctness is a genuine tie — both engines hit identical, strong (structural + bit-exact)
  oracle measurements.
- Feature-coverage caveat: the gate is a no-corruption proxy (WEAK-GATE); it does not assert that
  Matroska SimpleTag content was actually written and reads back as the UNICODE_TAGS map. A
  tag-readback oracle would be needed to upgrade this to a REAL gate for the literal feature.
