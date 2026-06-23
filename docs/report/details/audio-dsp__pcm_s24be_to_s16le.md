# audio-dsp/pcm_s24be_to_s16le

family: audio-dsp | fixture asset: `pcm_s24be.aiff` (1.4 MB, exists in fixtures/media/) | primaryMetric: wall | passCount: 1 / 7

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** — UNCONTESTED (exactly 1 PASS, 6 NA_ENGINE).

Decisive factor: it is the only engine that declares BOTH the `transcode` operation AND `aiff` as an input
container. The other six are eliminated at the capability-gate before any media work: three are pure
demuxers/parsers that do not declare `transcode` at all (mp4box, remotion-media-parser, web-demuxer), and
three declare `transcode`/encode but do not declare an AIFF demuxer (mediabunny, platform/WebCodecs,
remotion-webcodecs). With no second PASS, there is no runner-up and no performance margin to report.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 14.63 ms | 341.76 x-realtime | 0 (n=0, not sampled) | 3234 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a sample-format reduction inside a container swap: 24-bit big-endian PCM carried in an AIFF
`FORM`/`COMM`/`SSND` container (`pcm_s24be.aiff`) must become 16-bit little-endian PCM in a RIFF/WAVE
container (`opts: { container: 'wav', audio: { codec: 'pcm-s16' } }`). Mechanically this is two coupled
transforms: (1) endianness reversal of every sample word (AIFF stores big-endian, WAV stores little-endian),
and (2) bit-depth truncation 24->16 (drop the low byte of each 3-byte sample, with the natural per-sample
quantization). The scenario notes call this out exactly: "24-bit big-endian(AIFF) -> 16-bit
little-endian(WAV); byte-swap + truncation, exact" (src/scenarios/audio-dsp/index.ts:277-285).

ffmpeg.wasm is the only engine that can even touch this input. Its codec map declares `pcm_s24be` as a
decodable/known token and `aiff` as a supported container (src/engines/ffmpeg-wasm/codecs.ts:44, :67, :83,
:99, :129), and it declares the `transcode` op (src/engines/ffmpeg-wasm/adapter.ts:2165). The transcode path
writes the input to the wasm FS, probes it via a `-i` info pass to confirm an audio track exists
(adapter.ts:2206-2217), then builds a real ffmpeg argv mapping all streams (`-map 0`) and emitting to a
`.wav` output via the libavformat WAV muxer with the `pcm_s16le` encoder selected from the requested
`pcm-s16` codec token (codecs.ts:40, container resolution at codecs.ts:118-119). This is genuine libavcodec
PCM resampling/format conversion inside the vendored single-thread core, not a copy: the input is 24-bit-BE
AIFF and the output is a freshly muxed 16-bit-LE WAV, so the byte stream is necessarily rewritten.

The gate is `property-invariant` with `invariant: 'transcode-output-metadata'`
(src/scenarios/audio-dsp/index.ts:293-296, 305), handled by `transcodeOutputMetadataInvariant`
(src/core/oracles.ts:3626-3708). It reference-probes the PRODUCED bytes, asserts the container equals the
requested `wav` (oracles.ts:3655-3657), asserts the requested audio track shape is present
(oracles.ts:3692-3700), and asserts duration is preserved within a ±1-frame band (oracles.ts:3659-3677). The
shard measurements are physically consistent: `audioTracks: 1`, `durationDeltaSec: 0`, with
`durationToleranceSec: 0.04166...` (1/24 s). A `durationDeltaSec` of exactly 0 is plausible here because
PCM->PCM keeps the same sample count, so the output duration matches the source bit-for-bit at the metadata
level. Bench: wall median 14.63 ms (n=1) and 341.76x realtime — fast because PCM transcode is a tight
byte-level loop with no entropy decode; the 3234 ms longtask figure reflects the one-time wasm core
load/JIT, not the conversion itself.

Note the honest limitation baked into the scenario: `bitReproducible: true` is documentation only; the suite
has no PCM-digest oracle today, so the gate verifies output SHAPE (container + track + duration), not the
exact byte-swap/truncation result (oracles.ts comment 288-296). This is a real PASS but a metadata-strength
gate, not a bit-exact one.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE, "does not declare input container 'aiff'". Honest: mediabunny's input
  demuxers cover ISOBMFF/WebM/etc., not AIFF; it cannot ingest the source at all. Not an under-declaration.
- **platform@chrome-149** — NA_ENGINE, "does not declare input container 'aiff'". Honest: browser
  WebCodecs/MediaSource has no AIFF container parser, so the WebCodecs path has nothing to feed the decoder.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "does not declare input container 'aiff'". Honest: same
  WebCodecs constraint; its parser front-end does not expose AIFF.
- **mp4box@2.3.0** — NA_ENGINE, "does not declare operation 'transcode'". Honest: MP4Box is an ISOBMFF
  box parser/segmenter; it neither decodes PCM nor encodes, so transcode is genuinely out of scope.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "does not declare operation 'transcode'". Honest: it is a
  read-only metadata/sample parser with no encode path.
- **web-demuxer@4.0.0** — NA_ENGINE, "does not declare operation 'transcode'". Honest: a wasm demuxer only;
  it extracts packets but does not re-encode or remux to a new container.

All six NAs are capability-truthful, not evasive: three lack the op entirely (demux/parse-only), three lack
the AIFF input container (WebCodecs-family). None should have been able to PASS this AIFF->WAV transcode.

## Anti-cheat validation

- Scenario: src/scenarios/audio-dsp/index.ts:275-285 (`id: 'pcm_s24be_to_s16le'`), wired into a real
  transcode scenario at index.ts:298-317 with `op: 'transcode'`, `input: 'pcm_s24be.aiff'`.
- Fixture: `fixtures/media/pcm_s24be.aiff` EXISTS, 1.4 MB — a real 24-bit-BE AIFF asset, not synthetic/empty.
  Matching goldens exist (`fixtures/golden/pcm_s24be.aiff.meta.json`, `.packets.json` 40k).
- Oracle: `transcodeOutputMetadataInvariant` at src/core/oracles.ts:3626-3708. It probes the ACTUAL produced
  bytes via the reference engine (oracles.ts:3641) with an AIFF-parse fallback (oracles.ts:3643-3650), then
  compares container, requested audio track shape, and duration against the source golden. Not trivially
  satisfiable for container/track shape; duration band is ±1 frame (1/24 s). It is, however, a
  metadata/shape gate — it does NOT decode PCM and compare samples, so the byte-swap+truncation correctness
  is not bit-verified (the `bitReproducible` flag is inert today; oracles.ts:288-296 comment).
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2165-2271 (real `-i` probe + `-map 0` argv to the WAV
  muxer with `pcm_s16le`); codec/container declarations at src/engines/ffmpeg-wasm/codecs.ts:40,44,67,83,
  99,118-119,129. No canned output, no input->output copy, no short-circuit to a golden file; errors throw
  rather than being swallowed.
- Cached: ffmpeg.wasm result has `cached: true` ("cached previous PASS result"). The PASS is from a prior
  run reused, not freshly re-executed in this report; staleness risk is low (PCM transcode + shape gate is
  deterministic) but the bench numbers (wall 14.63 ms, n=1) and the PASS were not re-verified this run.

Verdict: **WEAK-GATE**. Real fixture, real ffmpeg.wasm libavcodec implementation, real shape comparison —
but the gating oracle checks output container/track/duration metadata only, not the decoded PCM bytes, so
the silent-endianness and 24->16 truncation correctness that the scenario notes care about is NOT actually
verified bit-for-bit. The PASS is genuine but weaker than the "exact" claim in the scenario notes.

## Confidence & caveats

Confidence: high on the decision (1 PASS vs 6 honest NAs is unambiguous; uncontested winner). Medium on the
strength of the win: it rests on a metadata/shape gate plus a duration invariant, with `peakMemory` not
sampled (n=0) and bench n=1 (no spread, mad=0), and the result is cached rather than re-run. The
`bitReproducible: true` intent is documentation only — no PCM-digest oracle exists, so the most important
correctness property of this scenario (exact byte-swap + truncation) is asserted in the notes but not tested.
