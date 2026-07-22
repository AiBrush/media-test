# Media-test feature × engine campaign

Last updated: 2026-07-21

This is the persistent checklist for the 78-cell Chromium campaign. Cells are
processed feature-row first, then engine-column, using the exact order below.

Legend: `V` = verified terminal, `A` = active scope lock, `P` = pending.

| Feature | mediabunny | ffmpeg-wasm | mp4box | remotion | web-demuxer@4.0.0 | aibrush-media |
|---|---:|---:|---:|---:|---:|---:|
| probe | V | V | V | V | V | V |
| demux | V | V | V | V | V | V |
| remux | V | V | V | V | V | V |
| transcode | A | P | P | P | P | P |
| decode-seek | P | P | P | P | P | P |
| trim | P | P | P | P | P | P |
| mux | P | P | P | P | P | P |
| encryption | P | P | P | P | P | P |
| metadata | P | P | P | P | P | P |
| streaming-output | P | P | P | P | P | P |
| audio-dsp | P | P | P | P | P | P |
| robustness | P | P | P | P | P | P |
| performance | P | P | P | P | P | P |

Totals: 18 verified, 1 active, 59 pending.

## Campaign invariants

- Chromium runs use `http://127.0.0.1:5151`, `--no-reuse`, and
  `fixtures/manifest.json`.
- A supported scenario is terminal only as `PASS` with full exhaustive
  coverage and every admissible candidate passing.
- An unsupported scenario is terminal only as evidence-backed `NA_ENGINE`.
- A cell boundary requires relevant focused tests, `bun test`,
  `bun run typecheck`, and `git diff --check`.
- Results and fixture/generated artifacts remain ignored and untracked.
- No campaign commits or pushes are made by the agent.

## Current evidence identity

- Scenario definition digest:
  `d9ddb928118389acc4f6ef16c0d4d986179b81ecaa675140225ce3ad9360ca16`
- Oracle definition digest:
  `7e690969cfb0ce5faa2c4b62ca83f9ae45192835699a648e06e743e26c4b6c4b`
- Current regression gate (2026-07-21): Mediabunny, FFmpeg.wasm, MP4Box,
  Remotion, web-demuxer, and aibrush-media demux, compact-golden, oracle, runner
  integrity/streaming, exhaustive coverage, and strict result boundary
  and remux regressions pass; full suite 1087 pass, 13927 assertions across 79
  files, typecheck clean,
  `git diff --check` clean.

## Verified cells

### probe × mediabunny

- Quick: `results/raw/chromium-2026-07-20T10-00-10-495Z.json`
- Exhaustive: `results/raw/chromium-2026-07-20T10-15-56-145Z.json`
- Terminal rows: 58 PASS, 2 NA_ENGINE; 60/60 scenarios observed.
- Exhaustive coverage: 178/178 admissible candidates passed; 183 total
  candidates; 58 full-grade scenarios and 2 unsupported scenarios.
- NA_ENGINE evidence: four AIFF candidates and one CAF candidate are outside
  Mediabunny's declared input-container API surface.
- Source landing: `56717f8`; no later Mediabunny adapter change at current
  `HEAD`.
- Suggested commit message: `cell(probe × mediabunny): verify exhaustive probe coverage`

### probe × mp4box

- Quick: `results/raw/chromium-2026-07-20T13-26-42-513Z.json`
- Exhaustive: `results/raw/chromium-2026-07-20T13-27-04-019Z.json`
- Terminal rows: 17 PASS, 43 NA_ENGINE; 60/60 scenarios observed.
- Exhaustive coverage: 49/49 admissible candidates passed; 183 total
  candidates; 17 full-grade scenarios and 43 unsupported scenarios.
- NA_ENGINE evidence is preserved per candidate in the exhaustive artifact:
  unsupported container/encryption tuples and missing authenticated-range
  transport for bounded large-file probes.
- Source landing: `9e65e0e`; exhaustive evidence was produced after that
  commit on the current clean `HEAD`.
- Suggested commit message: `cell(probe × mp4box): verify exhaustive probe coverage`

### probe × ffmpeg-wasm

- Quick: `results/raw/chromium-2026-07-20T14-30-23-977Z.json`
- Exhaustive: `results/raw/chromium-2026-07-20T14-33-56-506Z.json`
- Terminal rows: 47 PASS, 13 NA_ENGINE; 60/60 scenarios observed.
- Exhaustive coverage: 138/138 admissible candidates passed; 183 total
  candidates; 47 full-grade scenarios and 13 unsupported scenarios.
- NA_ENGINE evidence is preserved per candidate: the adapter does not expose
  authenticated range/progressive reads for the large/huge/massive bounded
  probe rows, CENC-CBCS, or HLS resource-trace probing.
- Fixes were evidence-producing: loaded-core stream syntax, nominal `tbr`,
  display rotation, default disposition, PCM bitrate, content-sniffed
  container, typed malformed-input rejection, track-bound 16-byte CENC IVs,
  Xing/LAME duration, and verified baked-asset delivery fallback.
- Suggested commit message: `cell(probe × ffmpeg-wasm): complete exhaustive probe evidence`

### probe × remotion

- Quick: `results/raw/chromium-2026-07-20T15-13-15-278Z.json`
- Exhaustive: `results/raw/chromium-2026-07-20T15-21-35-453Z.json`
- Terminal rows: 42 PASS, 18 NA_ENGINE; 60/60 scenarios observed.
- Exhaustive coverage: 114/114 admissible candidates passed; 183 total
  candidates. The 69 NA_ENGINE members retain exact unsupported tuple or
  parser-limitation evidence; no candidate is FAIL/ERROR.
- NA_ENGINE evidence covers unsupported containers/protection/resource-trace
  tuples, unauthenticated bounded range probes, and exact Remotion 4.0.479
  parser limitations for selected valid WAV ancillary layouts, raw ADTS
  variants, and TS streams whose parsed access-unit path lacks an early SPS.
- Fixes remain byte-evidence based: Matroska language/default/cadence fields,
  ISO language/brand/sample-entry channels, CMAF fragment timing, AAC
  coded/presentation views, coded raster dimensions, clockwise rotation, PCM
  bitrate, and typed malformed-input rejection.
- Suggested commit message: `cell(probe × remotion): complete exhaustive probe evidence`

### probe × web-demuxer@4.0.0

- Quick: `results/raw/chromium-2026-07-20T15-51-20-328Z.json`
- Exhaustive: `results/raw/chromium-2026-07-20T15-52-00-899Z.json`
- Terminal rows: 30 PASS, 30 NA_ENGINE; 60/60 scenarios observed.
- Exhaustive coverage: 85/85 admissible candidates passed; all 183 candidates
  executed. The remaining 98 candidates are exact NA_ENGINE results; no
  candidate is FAIL/ERROR.
- NA_ENGINE evidence covers undeclared audio/HLS containers, protected CENC
  representations, multi-input probe, and the adapter's truthful whole-file
  limitation for bounded large/huge/massive rows.
- Fixes remain evidence-producing: nominal rational cadence when frame-count
  duration disagrees, clockwise rotation, AAC coded/presentation views, ISO
  brand and sample-entry channels, Matroska default disposition, discontinuous
  TS cadence/ADTS evidence, typed malformed-input rejection, and same-origin
  WASM materialization for package nesting inside the robustness Worker.
- Suggested commit message: `cell(probe × web-demuxer): complete exhaustive probe evidence`

### probe × aibrush-media

- Quick: `results/raw/chromium-2026-07-20T18-03-43-623Z.json`
- Exhaustive: `results/raw/chromium-2026-07-20T18-09-14-298Z.json`
- Terminal rows: 50 PASS, 10 NA_ENGINE; 60/60 scenarios observed.
- Exhaustive coverage: 144/144 admissible candidates passed; all 183
  candidates executed. The remaining 39 candidates are exact NA_ENGINE
  results; no candidate is FAIL/ERROR.
- NA_ENGINE evidence is limited to the ten large/huge/massive bounded probe
  rows because the adapter truthfully exposes whole-file reads rather than
  authenticated range or progressive transport.
- Fixes remain byte-evidence based: PCM bitrate, ISO brand/language/default
  disposition and CENC scheme, Matroska language/default disposition,
  content-sniffed mislabeled input, typed graceful malformed rejection,
  browser-safe long fragmented timelines, and canonical ISO display-matrix
  rotation.
- Suggested commit message: `cell(probe × aibrush-media): complete exhaustive probe evidence`

### demux × mediabunny

- Quick: `results/raw/chromium-2026-07-21T02-17-27-182Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T03-05-03-824Z.json`
- Terminal rows: 47 PASS, 2 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: 141/141 admissible candidates passed; all 150
  candidates executed. The remaining 9 candidates are exact NA_ENGINE
  results; no candidate is FAIL/ERROR and every supported aggregate is full.
- NA_ENGINE evidence is limited to AIFF/CAF input containers and real MOV/MKV
  variants containing auxiliary timecode/attachment tracks that Mediabunny
  1.48.0 does not expose through `Input.getTracks()`/`EncodedPacketSink`.
- Fixes remain evidence-producing: exact ISO edit-list packet membership,
  Xing/LAME MP3 presentation duration, packet-authoritative cadence for a
  contradictory WebM nominal-rate carrier, bounded massive-golden decoding,
  per-candidate materialization release, and typed scale-mode payload
  omission while every structural packet row remains exact.
- Cross-engine spot-check:
  `results/raw/chromium-2026-07-21T03-18-34-345Z.json` (MP4Box,
  `demux/h264_1080p_30s`, exhaustive 4/4 PASS, full).
- Suggested commit message: `cell(demux × mediabunny): complete exhaustive demux evidence`

### demux × ffmpeg-wasm

- Quick: `results/raw/chromium-2026-07-21T04-37-06-264Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T04-37-51-681Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151`.
- Terminal rows: 45 PASS, 4 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: 134/134 admissible candidates passed; all 150
  candidates executed. The remaining 16 candidates are exact NA_ENGINE
  results; all 255 executed oracle verdicts are PASS and every supported
  aggregate is full.
- NA_ENGINE evidence is limited to the four large/huge/massive scale rows:
  FFmpeg.wasm's CLI framecrc route materializes a completed batch and cannot
  expose the contract's real first-packet boundary
  (`FFMPEG_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE`).
- Fixes remain evidence-producing: source `-debug_ts` timestamp capture for
  discontinuous MPEG-TS, EBML unavailable-DTS normalization, exact AVC/AAC
  decoder configuration, neutral-reader payload digests, complete framecrc
  packet walks, MP3 Xing/LAME duration, WAV packet sizing, typed malformed and
  WORKERFS failures, bounded metadata logging, worker-generation recycling,
  adapter-limited benchmark batching, and valid I-JSON error transport.
- Exhaustive artifact content hash:
  `facce11e6ecd392985f26b883ff0a67d679d8847ac7a0523d0a4ca37893698ec`.
- Suggested commit message: `cell(demux × ffmpeg-wasm): complete exhaustive demux evidence`

### demux × mp4box

- Quick: `results/raw/chromium-2026-07-21T04-54-20-191Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T04-54-50-465Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151`.
- Terminal rows: 18 PASS, 31 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: 50/50 admissible candidates passed; all 150 candidates
  executed. The remaining 100 candidates are exact NA_ENGINE results; all 94
  executed oracle verdicts are PASS and every supported aggregate is full.
- NA_ENGINE evidence covers the adapter's declared ISO BMFF-only input surface
  and the four large/huge/massive scale rows. MP4Box extraction does not expose
  the contract's real first-packet event
  (`MP4BOX_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE`).
- Fixes remain evidence-producing: auxiliary `tmcd` packets no longer publish a
  fabricated canonical A/V codec, and a bounded non-fragmented MOV edit-list
  rule omits only the contiguous trailing coded suffix outside presentation.
  Fragmented sample numbering and round trips remain unchanged.
- Focused MP4Box regressions: 44 pass. Cell boundary: full suite 1045 pass,
  typecheck clean, and `git diff --check` clean.
- Exhaustive artifact content hash:
  `3ec6bfd120fb52d35102e021dc3eb5e4f827b1c5a778bf748fcc64258402ee30`.
- Suggested commit message: `cell(demux × mp4box): complete exhaustive demux evidence`

### demux × remotion

- Quick: `results/raw/chromium-2026-07-21T10-59-52-945Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T11-08-59-314Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151`.
- Quick terminal rows: 37 PASS, 12 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: 110/110 admissible candidates passed; all 150 candidates
  executed. The remaining 40 candidates are exact NA_ENGINE results; all 209
  executed oracle verdicts are PASS. Forty supported aggregates are full and
  nine scenarios are unsupported across every candidate.
- NA_ENGINE evidence covers valid parser structures Remotion 4.0.479 cannot
  completely extract (selected ISO tracks, early-SPS TS, raw ADTS/WAV variants),
  encrypted HLS, unsupported containers, and the four scale rows whose real
  first-packet boundary is unavailable.
- Fixes remain source-evidence based: complete ISO coded-sample counts and edit
  membership, ISO `stss` sync flags, packet-derived VFR cadence, Xing/LAME MP3
  timing, byte-clocked PCM WAV chunks, HE-AAC presentation views, typed valid
  parser limitations, and all-or-nothing neutral TS normalization. The neutral
  TS reader now preserves concatenated PTS epochs, physical ADTS spans, and
  AUD-delimited H.264 access units across PES boundaries; every normalized
  Remotion sample is first bound by coded-payload identity.
- Focused Remotion/oracle/demux/remux/trim regressions: 133 pass. Cell boundary:
  full suite 1048 pass, typecheck clean, and `git diff --check` clean.
- Exhaustive artifact content hash:
  `c3fff4dc3d0ff2299088ccb0cff03785e6274965ef705671d937c43af29d8f02`.
- Suggested commit message: `cell(demux × remotion): complete exhaustive demux evidence`

### demux × web-demuxer@4.0.0

- Quick: `results/raw/chromium-2026-07-21T11-29-18-009Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T11-37-09-836Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151`.
- Quick terminal rows: 27 PASS, 22 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: 79/79 admissible candidates passed; all 150 candidates
  executed. The remaining 71 candidates are exact NA_ENGINE results; all 148
  executed oracle verdicts are PASS. Twenty-seven supported aggregates are
  full and 22 scenarios are unsupported across every candidate.
- NA_ENGINE evidence covers undeclared container/codec tuples, the pinned
  package's unavailable MPEG-TS packet reader, and all four scale rows because
  web-demuxer 4.0.0 does not expose a real first-packet boundary.
- Fixes remain byte-evidence based: authoritative length-prefixed parsing before
  incidental start-code scanning, ISO configuration records on packet evidence,
  typed negative-input rejection, ISO presentation channel recovery, and
  all-or-nothing `stss` sync binding by track/size with a unique one-microsecond
  timebase rounding tolerance.
- Focused web-demuxer/demux regressions: 67 pass. Cell boundary: full suite 1052
  pass with 13814 assertions across 78 files, typecheck clean, and
  `git diff --check` clean.
- Exhaustive artifact content hash:
  `bdf0b1c3e0aa55e5e4c11c4807bb1409e2f44536521e9e81075311b54c679f64`.
- Suggested commit message: `cell(demux × web-demuxer): complete exhaustive demux evidence`

### demux × aibrush-media

- Quick: `results/raw/chromium-2026-07-21T12-14-59-853Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T12-16-10-300Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151`.
- Quick terminal rows: 45 PASS, 4 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: 133/133 admissible candidates passed; all 150
  candidates executed. The remaining 17 candidates are exact NA_ENGINE
  results; all 255 executed oracle verdicts are PASS and every supported
  aggregate is full.
- NA_ENGINE evidence covers all 16 large/huge/massive scale candidates because
  the framework materializes a complete packet table without an observable
  first-packet boundary, plus one valid MKV candidate whose auxiliary track
  layout cannot be represented as canonical aibrush audio/video packet streams.
- Fixes remain evidence-producing: SHA-256 packet identities, authoritative
  packet-size/payload consistency, byte-sniffed mislabeled input, typed negative
  rejection, byte-derived container language and disposition, single-frame and
  missing-terminal-duration cadence, FFmpeg-compatible WAV/AIFF/CAF PCM packet
  granularity, and explicit scale/track-layout support decisions.
- Focused aibrush-media/demux regressions: 67 pass. Cell boundary: full suite
  1057 pass with 13821 assertions across 78 files, typecheck clean, and
  `git diff --check` clean.
- Quick artifact content hash:
  `7832274bb9f461f2d96b2d608596d50fdffb7885a4287607dc0f7137dad34ac3`.
- Exhaustive artifact content hash:
  `ceb437eb55915332cd346b00bf3c1f82ca171ce319159cb2e394d9764074c5c8`.
- Suggested commit message: `cell(demux × aibrush-media): complete exhaustive demux evidence`

### remux × mediabunny

- Quick: `results/raw/chromium-2026-07-21T16-04-06-641Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T16-40-03-311Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151`.
- Quick terminal rows: 42 PASS, 7 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: 148 admissible candidates passed; all 178 candidates
  executed. The remaining 30 candidates are exact NA_ENGINE results; all 157
  executed oracle verdicts are PASS. Forty-three supported aggregates are full
  and six scenarios are unsupported across every candidate.
- NA_ENGINE evidence is limited to H.264-in-TS inputs lacking the observed
  length-prefixed framing/configuration required by Mediabunny's mux API,
  FLAC-in-Ogg outside the declared feature surface, ADTS output that cannot
  preserve explicit timestamps, and six real MOV/MKV candidates containing
  auxiliary tracks unavailable to the encoded-packet path.
- Fixes remain evidence-producing: typed malformed-input rejection; signed
  QuickTime composition offsets; padded sample-entry configuration recovery;
  AAC AudioSpecificConfig channel truth; Opus pre-skip/EOS discard handling;
  locally consistent EBML terminal-duration materialization while rejecting
  stale declarations; MP3 metadata-prefix and unavailable terminal-interval
  normalization; headerless and round-trip source-truth fallbacks; bounded
  massive-timeline reductions; and opaque RGBA browser self-test pixels.
- Focused remux/engine/oracle/runner/UI regressions: 170 pass with 934
  assertions. Cell boundary: full suite 1068 pass with 13850 assertions across
  78 files, typecheck clean, and `git diff --check` clean.
- Quick artifact content hash:
  `1194643a801d2a6701ad8e979695453824beccdbaa4cda6466963cfffa662016`.
- Exhaustive artifact content hash:
  `a2bb21d2c8c0c25652d42b5baf6851c2fee1c74f24313151f24f82444edccee6`.
- Suggested commit message: `cell(remux × mediabunny): complete exhaustive remux evidence`

### remux × ffmpeg-wasm

- Quick: `results/raw/chromium-2026-07-21T19-24-31-404Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T21-33-14-863Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151`.
- Quick terminal rows: 43 PASS, 6 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: 152 admissible candidates passed; all 178 candidates
  executed. The remaining 26 candidates are exact NA_ENGINE results; all 161
  executed oracle verdicts are PASS. Forty-seven supported aggregates are full
  and two AV1 scenarios are unsupported across every candidate.
- NA_ENGINE evidence is limited to declared AV1 remux feature gaps and concrete
  candidate limitations: long ISO edit preroll, signed-CTS MPEG-TS inputs whose
  samples FFmpeg drops when targeting ISO/Matroska, and MJPEG tuples unavailable
  in the loaded FFmpeg.wasm build.
- Fixes remain evidence-producing: bounded worker-backed benchmark sampling;
  header-only structured output probing; optional video/audio mapping; typed
  malformed-input, timeout, and WORKERFS failures; QuickTime AudioSampleEntry v2
  parsing; coded visual dimensions; MP3 coded-header channel/rate truth; explicit
  HE-AAC SBR core/presentation-rate handling; and strict EBML duration
  rematerialization only when the complete relative PTS timeline is preserved.
- Cross-engine spot-check:
  `results/raw/chromium-2026-07-21T22-44-24-532Z.json` (Mediabunny, exhaustive:
  VP8 WebM-to-MKV 4/4 PASS and timestamp-unrepresentable MP4-to-ADTS 4/4 concrete
  NA_ENGINE; no adverse result).
- Focused remux/FFmpeg/runner regressions: 96 pass. Cell boundary: full suite
  1078 pass with 13884 assertions across 78 files, typecheck clean,
  `git diff --check` clean, and `git diff --cached --check` clean.
- Quick artifact content hash:
  `068ad8d0690dbdfbf413c977c9d83c86d1486a9442db91ad4d531dc175f42a68`.
- Exhaustive artifact content hash:
  `c5d88a2e7010ea1d4943f2fbfc1761e4af35dc5689b8341940d0533fa58668bf`;
  file SHA-256:
  `33ec47dfb57b4576a5164ab0cbccc43faf4651f5e52be0834f488767c81c7158`.
- Suggested commit message: `cell(remux × ffmpeg-wasm): complete exhaustive remux evidence`

### remux × mp4box

- Quick: `results/raw/chromium-2026-07-21T22-59-36-869Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T22-58-46-924Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `7da3abec-4560-4bc8-a188-85be5e74acd2`.
- Quick terminal rows: 1 PASS, 48 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: all five admissible candidates passed; all 178 candidates
  executed. The remaining 173 candidates are exact NA_ENGINE results; all five
  executed oracle verdicts are PASS. Both supported aggregates are full and 47
  scenarios are unsupported across every candidate.
- NA_ENGINE evidence matches MP4Box 2.3.0's declared fragmenter surface: ISO
  BMFF (MP4/MOV) input and fragmented MP4 output only. Three large real MOV
  candidates additionally contain auxiliary tracks outside the adapter's
  segmentable audio/video contract; the one admissible 447 MB candidate passes.
- Fixes remain evidence-producing: fragments whose exact source sample range has
  negative `cts-dts` now mark `trun` composition offsets as signed, eliminating
  an observed 2^32/600-second wrap; and Chromium's deterministic large-Blob
  `NotReadableError` falls back to the already digest-verified input buffer while
  MP4Box continues parsing it in bounded chunks.
- Targeted browser evidence:
  `results/raw/chromium-2026-07-21T22-58-11-561Z.json` (signed-CTS catalog,
  exhaustive 4/4 PASS) and
  `results/raw/chromium-2026-07-21T22-58-18-937Z.json` (exact 447 MB baked MOV,
  PASS).
- Focused MP4Box/remux regressions: 72 pass with 5156 assertions. Cell boundary:
  full suite 1080 pass with 13889 assertions across 78 files, typecheck clean,
  `git diff --check` clean, and `git diff --cached --check` clean.
- Quick artifact content hash:
  `75fe7ad3344e5513cb2682303c53f1186e5ff872f210b1cec252eb82a9b1f6db`.
- Exhaustive artifact content hash:
  `cc519e9bcdc8bdd1942ac51f423ef56875ff171ba7908513e3cf14c21eb84bae`;
  file SHA-256:
  `afb29aebd9ca02ce7e085d011a3e105d527302f20da8c143b9b29cb26d550da8`.
- Suggested commit message: `cell(remux × mp4box): complete exhaustive remux evidence`

### remux × remotion

- Quick: `results/raw/chromium-2026-07-21T23-24-50-411Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T23-25-03-003Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `bb312ec4-9a83-4c25-8511-c5e64f7e5c1d`.
- Quick terminal rows: 2 PASS, 47 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: all eight admissible candidates passed; all 178
  candidates executed. The remaining 170 candidates are exact NA_ENGINE
  results; all eight executed oracle verdicts are PASS. Three supported
  aggregates are full and 46 scenarios are unsupported across every candidate.
- NA_ENGINE evidence matches Remotion 4.0.479's concrete copy surface. The
  package can copy the admitted MOV/H.264/AAC-to-MP4 and WebM/VP9/Opus-to-WebM
  tuples; other wrapper/codec combinations remain undeclared or reason-coded.
  Within those rows, one valid MOV is exact NA because media-parser extracts
  only 1/1755 AAC samples, two huge real MOVs contain unpreservable auxiliary
  tracks, and the 725 MB MOV exceeds the declared 512 MiB in-memory policy.
- Fixes remain evidence-producing: digest-verified object-URL inputs use a
  chunked random-access reader over the exact authenticated bytes; compatible
  unresolved wrappers reach runtime inspection; ISO copy preflight compares
  every extracted sample count with the byte-authenticated sample table; and
  256–512 MiB inputs use a direct resizable-buffer writer that avoids
  Remotion's failing File/Blob copy. Normal outputs retain the package's stock
  writer, preserving its exact WebM authoring behavior.
- Targeted browser evidence:
  `results/raw/chromium-2026-07-21T23-20-54-153Z.json` (exact 447 MB baked MOV,
  PASS with 46,126/46,126 source/output samples) and
  `results/raw/chromium-2026-07-21T23-24-39-941Z.json` (the previously adverse
  `02.webm` candidate, PASS on the restored stock writer path).
- Focused Remotion/remux/runner regressions: 100 pass with 658 assertions. Cell
  boundary: full suite 1083 pass with 13902 assertions across 78 files,
  typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Quick artifact content hash:
  `c09588658e0de05fba75bd72bc08ab2c56390af02c9da69586500f7b56149f88`;
  file SHA-256:
  `6aa74d5479f67c835e886f3c5a1b6b345ac7b087975c9b9bfabb91171e4a9e71`.
- Exhaustive artifact content hash:
  `fd5121a67b7c16ef94ab8e4c90db919f421b7cd0813989ee95db54e82fe4a668`;
  file SHA-256:
  `fadb3f9b22a331f4fdba2ba12421995659735d6ddc89ae83664a5b7b21120045`.
- Suggested commit message: `cell(remux × remotion): complete exhaustive remux evidence`

### remux × web-demuxer@4.0.0

- Quick: `results/raw/chromium-2026-07-21T23-29-44-063Z.json`
- Exhaustive: `results/raw/chromium-2026-07-21T23-29-59-751Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `cd24d07a-04db-4a85-b956-fd2ce69cb048`.
- Quick terminal rows: 49 NA_ENGINE; 49/49 scenarios observed.
- Exhaustive coverage: all 178 candidate identities executed and all 178 are
  exact NA_ENGINE results. No candidate is PASS, FAIL, ERROR, or SKIPPED; all
  49 aggregates preserve the operation-wide unsupported boundary.
- NA_ENGINE evidence is uniform and declared before lifecycle or asset work:
  web-demuxer@4.0.0 exposes parser-only `probe`, `demux`, `decodeFrames`, and
  `seek`, declares no output containers, and has no muxer API. Every row and
  candidate therefore records `engine does not declare operation 'remux'`.
  The adapter's throwing `remux()` stub remains only a fail-loud guard for a
  mis-wired runner and was never invoked.
- No implementation change was warranted. Focused web-demuxer/remux/runner
  regressions: 113 pass with 669 assertions. Cell boundary: full suite 1083
  pass with 13902 assertions across 78 files, typecheck clean,
  `git diff --check` clean, and `git diff --cached --check` clean.
- Quick artifact content hash:
  `4d14f8124187b30a4a8b9f9e6f73a1de0f8905b0efa2d803fc799ff32bdc9a40`;
  file SHA-256:
  `af820390a6640400c855816e58bf20785b5058abc10a9807ee288bb84c88ad5b`.
- Exhaustive artifact content hash:
  `fd597d32c512497a80452d25c2a518fcdec78cdd02bc20080a4c63ceb08646de`;
  file SHA-256:
  `cb5130964ed8d256562cf8274638265430a44467f4cedb8590349cc5b3202758`.
- Suggested commit message: `cell(remux × web-demuxer): verify operation-wide NA evidence`

### remux × aibrush-media

- Quick: `results/raw/chromium-2026-07-22T03-21-02-043Z.json`
- Exhaustive: `results/raw/chromium-2026-07-22T03-39-28-175Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `d6445c57-95ff-484a-bcc7-c4312e9f9c1b`.
- Quick terminal rows: 49 PASS; 49/49 scenarios observed.
- Exhaustive coverage: all 175 admissible candidates passed; all 178
  candidates executed. The remaining three candidates are exact NA_ENGINE
  results. All 49 aggregates have full coverage and terminal PASS status.
- NA_ENGINE evidence is limited to the `03.mkv` mixed H.264/AAC/MJPEG input in
  the MKV-to-MP4, MKV-to-MOV, and MKV-to-TS rows. The MJPEG track is outside
  the target writers' declared copy surface and is rejected with
  `AIBRUSH_CONTAINER_CODEC_ILLEGAL` before operation execution.
- Fixes remain evidence-producing: strict MP3 frame/gapless preservation;
  corrected TS decode timing and AVC access-unit delimiters; finite WebM
  clusters; validated Ogg continuation-bit/CRC repair; prepared MOV/MKV packet
  copy with exact AAC cadence; edit-list presentation duration used only for a
  substantive coded-span divergence; and typed malformed/unsupported error
  routing without widening strict-copy tolerances.
- Targeted repaired-path evidence:
  `results/raw/chromium-2026-07-22T03-01-01-162Z.json` (five formerly adverse
  aggregates: 17 admissible candidates PASS and three exact NA_ENGINE).
- Focused aibrush-media/remux/runner regressions: 108 pass with 558 assertions.
  Cell boundary: full suite 1087 pass with 13927 assertions across 79 files,
  typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Quick artifact content hash:
  `b0e33990b74359041a211c865f1998a120769ad7ea3a4f36e2b4435f540f2ce7`;
  file SHA-256:
  `a77687780e745c40dfc0bd3a35d7e13ac8b01874c64189f13de1f4fe121b020f`.
- Exhaustive artifact content hash:
  `13eaafff78cd4ae8486aee2869c746be1e48f84c07a340b47a8a0855809c49e0`;
  file SHA-256:
  `fbdc2f5161dbc7044738d4e9def0f1fe0f4d99036ae37d622683db2257910616`.
- Suggested commit message: `cell(remux × aibrush-media): complete exhaustive remux evidence`

## Active cell

### transcode × mediabunny

- Scope lock: only Mediabunny transcode adapter/support behavior and
  transcode-owned shared layers when independently proven necessary.
- Quick: pending.
- Exhaustive: pending.
- Boundary gates: pending.
- Suggested commit message: pending.
