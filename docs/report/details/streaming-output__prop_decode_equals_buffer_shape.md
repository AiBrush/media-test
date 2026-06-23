# streaming-output/prop_decode_equals_buffer_shape

family: streaming-output | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 1080p30 + AAC 48k stereo, progressive faststart MP4) | primaryMetric: wall | passCount: 2

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Status: **CONTESTED** — 2 of 7 engines PASS (`ffmpeg-wasm`, `mediabunny`); the other 5 are NA.
- Decisive factor: **correctness is a dead tie** — both winners pass the identical strong oracle pair
  (`property-invariant` decode(remux(x))==decode(x) bit-exact over 12 frames, 0 mismatches, plus
  `mp4-box-layout` confirming the `fastStart:false` control layout). The tie therefore breaks on
  **performance**: ffmpeg.wasm's wall median is **255.42 ms vs mediabunny's 588.09 ms = 2.30x faster**,
  with longtasks 2907 ms vs 3585 ms (**1.23x lower** main-thread blocking).
- Margin over runner-up (mediabunny): 2.30x faster wall, 1.23x fewer long-task ms. Caveat: n==1 for both
  (mad=0, single sample), so the margin is a single-shot measurement, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, mp4-box-layout:true | 255.42 ms | n/a (not measured) | 0 (not sampled) | 2907 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true, mp4-box-layout:true | 588.09 ms | n/a (not measured) | 0 (not sampled) | 3585 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'streaming:decode-equality' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'streaming:decode-equality' |

(throughputRealtime / peakMemory are not present in this shard's bench block; peakMemory has n=0 samples for
both winners. Only `wall` and `longtasks` carry real samples, each n=1.)

## Why the winner wins (deep technical)

The operation under test is a **lossless container re-wrap (remux)** of a progressive H.264-in-MP4 file into
a `BufferTarget`-style progressive MP4 with `fastStart:false`. No pixels are decoded or re-encoded: the
invariant `decode(remux(x))==decode(x)` is precisely the assertion that the elementary H.264 samples are
copied byte-for-byte and only the ISOBMFF box structure may change. Crucially, this means the supposed
advantage of WebCodecs **hardware decode/encode is irrelevant** for the work itself — the codec engine is
never invoked during a stream copy. The competition is therefore decided by how fast each library can demux
and re-mux the ISOBMFF boxes and shuttle ~31 MB of `mdat` payload.

ffmpeg.wasm wins this on its native-C demuxer/muxer compiled to wasm. Its adapter
(`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) issues a genuine stream copy:
`[...inputOptions, '-i', name, '-map', '0', '-c', 'copy']` (line 2044), which maps every input stream and
copies coded packets with zero re-encode. Because the scenario sets `fastStart:false`, the adapter's branch
at line 2048 correctly does **not** add `+faststart`, so libavformat writes `mdat` before `moov`. The shard's
`mp4-box-layout` measurement confirms exactly this: `ftyp@0, free@32, mdat@40, moov@31231517`
(`mdatOffset:40 < moovOffset:31231517`, 4 top-level boxes) — the control layout the oracle requires
(`src/core/oracles.ts:415-423`, the `fastStart === false` branch checks `firstMdat < firstMoov`). The single
free-space `free` box at offset 32 is benign padding from the muxer and does not affect the gate.

mediabunny also passes correctness identically: its `remux()`
(`src/engines/mediabunny/adapter.ts:1244-1260`) builds a real `Mp4OutputFormat` via
`makeOutputFormat()` (`src/engines/mediabunny/codecs.ts:158-165`, forwarding the `fastStart` option from
`outputFormatOptionsFrom`) and runs the library `Conversion` through `runConversion`. Its `mp4-box-layout`
measurement is `ftyp@0, mdat@28, moov@31259904` (3 boxes, no `free` pad) — also a valid `fastStart:false`
control. Both engines' `property-invariant` outcomes are byte-identical in strength:
`measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0`. The oracle
(`src/core/oracles.ts:2686-2707`) decodes the remuxed output with the platform decoder and compares each
frame's sha256 RGBA digest against the baked golden in `fixtures/golden/h264_1080p_30s.mp4.frames.json`
(real browser-produced sha256 digests, `pending:false`). Both produced bit-exact output — so both correctly
performed a lossless re-wrap.

With correctness tied, the mechanistic separator is throughput. mediabunny runs `coreBuild:pure-ts-esm`
(from its `env.configUsed`): its box parsing and sample copy happen in JS/TS. ffmpeg.wasm runs the libavformat
demux/mux loop in compiled wasm, which moves the ~31 MB `mdat` copy and the table re-authoring through far
fewer JS-engine cycles. The result is the observed 2.30x wall advantage (255.42 ms vs 588.09 ms) and lower
sustained main-thread blocking (longtasks 2907 ms vs 3585 ms, 1.23x lower). Note that ffmpeg.wasm here is
single-thread (`wasmThreads:0` is not reported for it, but the suite's ffmpeg core is the ST build) and still
beats the WebCodecs-configured mediabunny, underlining that the WebCodecs/hardware tiebreaker does not apply
to a copy-only remux.

## What each other framework did wrong

- **mediabunny@1.48.0** (the runner-up, PASSed): correct and bit-exact, but lost purely on speed — 588.09 ms
  wall is 2.30x slower than ffmpeg.wasm and it blocked the main thread 1.23x longer (3585 ms longtasks). Its
  pure-TS box copy is the bottleneck for a 31 MB `mdat` re-wrap.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'remux'". Honest NA: it
  is a parser/demuxer, not a muxer, so it cannot produce a remuxed output to feed the oracle.
- **platform@chrome-149**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: the bare
  browser/WebCodecs platform exposes decode/encode but no container muxer for `remux`.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: demux-only library.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare feature 'streaming:decode-equality'". Borderline:
  mp4box.js can segment/re-fragment ISOBMFF, but it is not declared for this decode-equality feature, so the
  runner gates it out before running. Plausibly an under-declared capability, but not a false PASS.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — "engine does not declare feature 'streaming:decode-equality'".
  Honest given its declared feature set for this scenario.

## Anti-cheat validation

- Scenario definition: `src/scenarios/streaming-output/metamorphic.ts:33-46` (id `prop_decode_equals_buffer_shape`,
  invariant token `decode(remux(x))==decode(x)`, shape `{container:'mp4', fastStart:false, target:'buffer'}`).
- Fixture: `asset: 'h264_1080p_30s.mp4'` → `fixtures/media/h264_1080p_30s.mp4` EXISTS, 31 MB real H.264+AAC
  MP4. Not synthetic/empty/mock. Golden frame digests at `fixtures/golden/h264_1080p_30s.mp4.frames.json`
  are real browser-produced sha256 RGBA hashes with `pending:false` (e.g. frame 0 sha256
  `e3c072e0...fb2bc8`, 1920x1080).
- Gating oracles: `src/core/oracles.ts:2686-2707` (property-invariant decode branch — real platform decode of
  the remuxed output + sha256 digest comparison against the golden, fails on any mismatch or absent golden)
  and `src/core/oracles.ts:365-426` / 415-423 (mp4-box-layout — real top-level ISOBMFF box parsing,
  fastStart:false branch asserts `mdat` precedes `moov`). Neither is trivially satisfiable: the digest oracle
  requires bit-exact RGBA frames, and the layout oracle requires the physically correct box order.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — genuine ffmpeg `-map 0 -c copy` stream
  copy reading from MEMFS and reading back the produced bytes; no canned/golden short-circuit, no
  input→output passthrough fakery (it actually re-muxes; the `free` pad and `mdat`/`moov` offsets in the
  measurement prove the muxer ran). Errors are thrown, not swallowed.
- Measurements are physically plausible: 12 frames compared at 1920x1080, moov offset ~31.2 MB matches a
  31 MB asset with `mdat` first, wall ~255 ms for a 31 MB wasm copy is reasonable.
- cached note: BOTH winners have `cached:true` ("cached previous PASS result"). The PASS evidence was reused
  from a prior run, not re-executed this session. The verdict and bit-exact measurements are from that cached
  run; mild staleness risk, but consistent across both engines and backed by real fixtures/oracles.
- Verdict: **REAL** — real fixture, real stream-copy implementation, meaningful bit-exact + structural oracles.

## Confidence & caveats

- Confidence: **high** on correctness (both engines bit-exact, 0/12 mismatch, strong oracles, real fixture).
  Medium on the performance margin: n==1 with mad=0 for both wall and longtasks means the 2.30x figure is a
  single-shot reading, not a stable distribution; a re-run could shift it (though ffmpeg's native-wasm copy
  advantage over pure-TS for a 31 MB rewrap is mechanistically expected to persist).
- Both results are cached, so neither was re-run this session.
- throughputRealtime and peakMemory were not sampled in this shard (peakMemory n=0), so only wall and
  longtasks could be compared.
