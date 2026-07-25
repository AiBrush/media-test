# Media-test feature × engine campaign

Last updated: 2026-07-25

This is the persistent checklist for the 78-cell Chromium campaign. Cells are
processed feature-row first, then engine-column, using the exact order below.

Legend: `V` = verified terminal, `A` = active scope lock, `P` = pending.

| Feature | mediabunny | ffmpeg-wasm | mp4box | remotion | web-demuxer@4.0.0 | aibrush-media |
|---|---:|---:|---:|---:|---:|---:|
| probe | V | V | V | V | V | V |
| demux | V | V | V | V | V | V |
| remux | V | V | V | V | V | V |
| transcode | V | V | V | V | V | V |
| decode-seek | V | V | V | V | V | V |
| trim | V | V | V | V | V | V |
| mux | V | V | V | V | V | V |
| encryption | V | V | V | V | V | V |
| metadata | V | V | V | V | V | V |
| streaming-output | V | V | V | V | V | V |
| audio-dsp | V | V | V | V | V | V |
| robustness | V | V | V | V | V | V |
| performance | P | P | P | P | P | P |

Totals: 72 verified, 0 active, 6 pending.

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

- aibrush-media Audio-DSP full-feature scenario/oracle definition digests:
  `204c4515fdc11813aa2d72601381d0aaed3427ebd337609916bf655adcd1cf10` /
  `a9daadb82a0bf63fa1f3df99599b7e56be7dc552979d16dbaacab6618c432d01`.
- aibrush-media four-row closure scenario/oracle definition digests:
  `666fa8e2058ca0d4d7789133d84c54e25da1f3e9bb2635f0af8014525983346e` /
  `6e12c3a2c8315f2e9ae24eac9cd930ed7f14b9fde072ffdfd2d23cf0fd7dfe74`.
- Current regression gate (2026-07-25): focused robustness/core/Audio-DSP/
  Mediabunny regressions are 73 pass with 567 assertions. The one
  post-repair full suite is 1196 pass with 14396 assertions across 80 files
  in 119.84 seconds; typecheck and `git diff --check` are clean.

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

### transcode × mediabunny

- Quick: `results/raw/chromium-2026-07-22T20-38-49-446Z.json`
- Exhaustive: `results/raw/chromium-2026-07-22T21-51-23-034Z.json`
- Both authoritative artifacts are forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `f3b81c2e-9a47-4d65-bc10-7e2f59a86d31`.
- Quick terminal rows: 43 PASS, 31 NA_ENGINE, 9 NA_BROWSER, and 1 NA_ASSET;
  84/84 scenarios observed with no FAIL or ERROR.
- Exhaustive terminal rows: 45 PASS, 31 NA_ENGINE, and 8 NA_BROWSER. Forty-three
  supported aggregates have full coverage; the two legitimate partial grades
  are AAC extraction (one admissible PASS plus three NA_BROWSER candidates) and
  default-audio multitrack selection (the dedicated fixture PASS plus three
  NA_ASSET candidates).
- Exhaustive coverage contains all 303 candidate executions: 156 PASS, 112
  exact NA_ENGINE, 32 NA_BROWSER, and 3 NA_ASSET. No aggregate or nested
  candidate is FAIL or ERROR.
- The large-output ladder is full-grade PASS 3/4: `01.webm`, `02.webm`, and the
  baked 120-second fixture pass; `03.webm` is exact
  `MEDIABUNNY_OUTPUT_BUFFER_LIMIT_UNSUPPORTED` because its concrete 2836 MiB
  plan would force Mediabunny's next 4 GiB `BufferTarget` allocation.
- Other repaired exhaustive paths remain evidence-producing: fragmented MP4
  quality samples the source uniformly even when prefix goldens exist; rotation,
  resize, effect, duration, audio timing, multitrack, AV1/VP9/AVC quality, and
  ABR fanout checks use concrete output evidence and narrowly typed support
  boundaries. Fragmented MP4 and AVC-to-VP9 are full 4/4 PASS; the ABR fanout is
  full-grade PASS 3/4 with only the high-frame-rate candidate exact NA_ENGINE.
- Focused Mediabunny transcode repair regressions: 13 pass. Cell boundary: full
  suite 1105 pass with 13969 assertions across 80 files, typecheck clean,
  `git diff --check` clean, and `git diff --cached --check` clean.
- Quick artifact content hash:
  `20cd13894115b8fa69520b1e72086d53a1cb63a1e49747f716de5c5899c9d9a4`;
  file SHA-256:
  `4452e230e72a6153b97daed49d819f7721cdf4feadc4fb9eed9884e8bbde68cd`.
- Exhaustive artifact content hash:
  `f77ee5ec933193750e9783585cd50daba0f71309f5f5933ea7ed93f31c69f0fa`;
  file SHA-256:
  `038d5243ef743105bce8bd9d08d73633e79b59351c32882b8004bffc83202282`.
- Suggested commit message: `cell(transcode × mediabunny): complete exhaustive transcode evidence`

### transcode × ffmpeg-wasm

- Quick: `results/raw/chromium-2026-07-23T04-11-30-550Z.json`
- Exhaustive: `results/raw/chromium-2026-07-24T01-24-23-805Z.json`
- Both authoritative artifacts are completed forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `134D8753-F965-416C-9EC8-BB3E5EB941E3`.
- Quick terminal rows: 37 PASS, 45 NA_ENGINE, and 2 NA_ASSET; all 84 scenarios
  were observed with no aggregate, nested candidate, or oracle FAIL/ERROR.
- Exhaustive terminal rows: 44 PASS and 40 exact NA_ENGINE. Coverage grades are
  41 full, 3 legitimate partial, and 40 none; all 84 scenarios and all 303
  candidate executions were observed. Candidate outcomes are 130 PASS, 166
  NA_ENGINE, and 7 NA_ASSET, with no FAIL or ERROR at any result layer.
- The three partial PASS aggregates are default-audio multitrack selection
  (1 PASS plus 3 inputs without a second audio track), AAC-to-PCM extraction
  (2 PASS plus 2 silent, non-discriminating inputs), and stereo-to-mono downmix
  (2 PASS plus the same 2 non-discriminating silent inputs).
- Repairs preserve concrete evidence: standard MP3-in-MP4 rates, AAC/FLAC/MP3
  timing, AAC ASC rate/channel truth, explicit stereo downmix, bicubic resize,
  AAC two-loop coding, fragmented-MP4 random access, and realm-safe malformed
  input routing are exercised by passing variants. Exact unsupported workload
  and quality boundaries include `FFMPEG_4K_TRANSCODE_SUITE_BUDGET`,
  `FFMPEG_H264_RESIZE_SUITE_BUDGET`, `FFMPEG_HEVC_ENCODE_SUITE_BUDGET`,
  `FFMPEG_VP8_ENCODE_SUITE_BUDGET`, `FFMPEG_VP9_TO_H264_DEADLINE_BOUND`,
  `FFMPEG_H264_2MBPS_QUALITY_BOUND`, `FFMPEG_FRAGMENTED_H264_QUALITY_BOUND`,
  `FFMPEG_H264_TWO_PASS_QUALITY_BOUND`, `FFMPEG_AAC_TO_MP3_PRIMING_BOUND`,
  `FFMPEG_OPUS_TO_AAC_QUALITY_BOUND`, and `FFMPEG_MP3_TO_AAC_QUALITY_BOUND`.
- Focused FFmpeg.wasm/Mediabunny transcode, feature, and runner regressions:
  61 pass with 363 assertions. Cell boundary: full suite 1111 pass with 14025
  assertions across 80 files, typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Quick artifact content hash:
  `f94011ae3629bb13dd1ec19178a68648fe39e79ac74b150861a4e747d254ebb4`;
  file SHA-256:
  `0fedbe0505f0a1520735fe3da2a73bf60f0b3b60ebb1bcf2071e9292216ea76c`.
- Exhaustive artifact content hash:
  `51f667ff9fe969ee0fb5924bf04d382eeaf9704d761086f2ea4cb591363bd083`;
  file SHA-256:
  `fa448e91b72ba34acc10c4b80d38e0b4684569dbf41b7ea358a4647e39e3a8a6`.
- Suggested commit message: `cell(transcode × ffmpeg-wasm): complete exhaustive transcode evidence`

### transcode × mp4box

- Quick: `results/raw/chromium-2026-07-24T06-08-13-832Z.json`
- Exhaustive: `results/raw/chromium-2026-07-24T06-08-52-424Z.json`
- Both authoritative artifacts are completed forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `56C84525-A0BF-4A16-86B1-E271F5B6C8F2`.
- Quick terminal rows: 84 exact NA_ENGINE; all 84 scenarios were observed with
  the concrete reason `engine does not declare operation 'transcode'`.
- Exhaustive terminal rows: 84 exact NA_ENGINE with 84 `none` coverage grades.
  All 303 selected candidates were executed and each is the same operation-level
  NA_ENGINE; there is no aggregate, candidate, or oracle FAIL/ERROR.
- This is an honest engine boundary: MP4Box 2.3.0 parses, demuxes, fragments,
  and muxes encoded ISO-BMFF samples, but has no decoder or encoder and its
  capability profile intentionally omits `transcode`. No implementation change
  was warranted.
- Focused MP4Box capability/correctness regressions: 46 pass with 5025
  assertions. The immediately preceding identical-source boundary remains
  applicable: full suite 1111 pass with 14025 assertions across 80 files and
  typecheck clean. `git diff --check` and `git diff --cached --check` are clean.
- Quick artifact content hash:
  `e12f1a394c0e6ca92659e320a728aed1f02a1c4edf5fbbf7d6e40d9f04e88f25`;
  file SHA-256:
  `d270b7caa70fdfcf82eadcf9f07f64f9ef2f7e4eaf0006a1952081ffd775056c`.
- Exhaustive artifact content hash:
  `b9f736a900aa1e782edd1c4d6088cd0f64a0e6538b4a4ec9ffcb4a1bff4a8f2d`;
  file SHA-256:
  `4b4c437d896149b495463c5c6e9cb757ccb1673aec7c91fd80104a07e38a8b2f`.
- Suggested commit message: `cell(transcode × mp4box): verify operation-wide NA evidence`

### transcode × remotion

- Quick: `results/raw/chromium-2026-07-24T06-35-13-698Z.json`
- Exhaustive: `results/raw/chromium-2026-07-24T06-56-29-667Z.json`
- Both authoritative artifacts are completed forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `7B72DBE1-8CB8-48D6-A53A-54EB4A485E36`.
- Quick terminal rows: 14 PASS, 69 exact NA_ENGINE, and 1 NA_ASSET; all 84
  scenarios were observed with no aggregate, nested candidate, or oracle
  FAIL/ERROR.
- Exhaustive terminal rows: 19 PASS and 65 exact NA_ENGINE. Coverage grades are
  18 full, 1 legitimate partial, and 65 none; all 84 scenarios and all 303
  candidate executions were observed. Candidate outcomes are 42 PASS, 257
  NA_ENGINE, and 4 NA_ASSET, with no FAIL, ERROR, or SKIPPED at any result
  layer and no failing oracle verdict.
- The one partial PASS aggregate is AAC-to-PCM extraction: the baked ADTS input
  passes, `02.aac` and `03.aac` are exact parser NA_ENGINE, and `01.aac` lacks
  a sufficient evidence set. Every other supported aggregate has full
  exhaustive coverage.
- Repairs keep support concrete: unresolved track evidence is no longer
  mistaken for a proven missing track; negative malformed input is typed;
  progress is clamped to the telemetry contract; and exact timing, quality,
  transform, resource, multitrack-selection, and stable-suite-budget misses are
  reason-coded before execution. Neighboring admissible variants remain PASS.
- Remotion benchmark limits cap adaptive inner-loop reuse and the memory-sample
  wait. The targeted VP9-to-H.264 row fell from 131 seconds to 11 seconds while
  retaining its PASS correctness evidence.
- Focused Remotion/transcode/runner regressions: 111 pass with 763 assertions.
  Cell boundary: full suite 1113 pass with 14045 assertions across 80 files,
  typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Quick artifact content hash:
  `f30b4787ddd2ea2969ae844e42e944cb0caca32bc385263d5cbbaae5af459c2c`;
  file SHA-256:
  `32f42b6307e9c269edc82b935ae1cd600edcd8e01dbe8850273ae2f66eb0924e`.
- Exhaustive artifact content hash:
  `e51a4f832d38035d1888932894c08a762c17f277f2e5c14d5233d47e2b5943d3`;
  file SHA-256:
  `4bfb37246a534ff2d66e6a6d2a3631f8c832eb80a43fcffd0482cb6c0b519ff6`.
- Suggested commit message: `cell(transcode × remotion): complete exhaustive transcode evidence`

### transcode × web-demuxer@4.0.0

- Quick: `results/raw/chromium-2026-07-24T07-08-56-185Z.json`
- Exhaustive: `results/raw/chromium-2026-07-24T07-09-11-223Z.json`
- Both authoritative artifacts are completed forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `9F4B0A68-7DCE-47AF-A52A-1DC71AA421CE`.
- Quick terminal rows: 84 exact NA_ENGINE; all 84 scenarios were observed with
  the concrete reason `engine does not declare operation 'transcode'`.
- Exhaustive terminal rows: 84 exact NA_ENGINE with 84 `none` coverage grades.
  All 303 candidate identities were executed and all 303 record the same
  operation-level NA_ENGINE. There is no aggregate, candidate, or oracle
  FAIL/ERROR/SKIPPED.
- This is an honest engine boundary: web-demuxer@4.0.0 exposes parser-backed
  `probe`, `demux`, `decodeFrames`, and `seek`, but has no encoder, output
  container surface, or transcode operation. No implementation change was
  warranted.
- Focused web-demuxer/transcode/runner regressions: 113 pass with 718
  assertions. The immediately preceding identical-source boundary remains
  applicable: full suite 1113 pass with 14045 assertions across 80 files and
  typecheck clean. `git diff --check` and `git diff --cached --check` are clean.
- Quick artifact content hash:
  `98da16030f662b2d110a246a89bbf86568f8f561a3381da3a833c9dd44be9398`;
  file SHA-256:
  `2bbe8eb1fadf0ed893cfde71e40aef35f30093ba3e658ae97b55dae0357f1679`.
- Exhaustive artifact content hash:
  `f62260223cf2eafe29ac112d73f0621f20b0d61c1e095f83472d6402ae1e5c0c`;
  file SHA-256:
  `e643a38649bcd570a9ab38ef03d3c099f58e3d7a6214e24b54690b41366a6b05`.
- Suggested commit message: `cell(transcode × web-demuxer): verify operation-wide NA evidence`

### transcode × aibrush-media

- Quick: `results/raw/chromium-2026-07-24T07-27-02-455Z.json`
- Exhaustive: `results/raw/chromium-2026-07-24T07-55-26-875Z.json`
- Both authoritative artifacts are completed forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `C37F0D54-1A52-4D88-9D1E-B2E445F9C963`.
- Quick terminal rows: 24 PASS, 23 exact NA_ENGINE, 36 NA_BROWSER, and 1
  NA_ASSET; all 84 scenarios were observed with no aggregate or oracle
  FAIL/ERROR.
- Exhaustive terminal rows: 27 PASS, 22 exact NA_ENGINE, 34 NA_BROWSER, and 1
  NA_ASSET. Coverage grades are 24 full, 3 legitimate partial, and 57 none;
  all 84 scenarios and all 303 candidate executions were observed. Candidate
  outcomes are 68 PASS, 98 NA_ENGINE, 136 NA_BROWSER, and 1 NA_ASSET. No
  aggregate, nested candidate, or oracle is FAIL/ERROR/SKIPPED; all 108
  executed oracle verdicts are PASS.
- The three partial PASS aggregates are H.264 15-to-30 fps conversion,
  VP8-to-H.264, and H.264 VFR-to-CFR. Each has two admissible PASS candidates
  and two exact NA_BROWSER candidates; every admitted candidate passes.
- Repairs remain concrete and evidence-backed: malformed transcode faults use
  the typed clean-rejection path; invalid dimensions are rejected before an
  invalid browser probe; AAC/Opus/Vorbis timing and writer limitations are
  reason-coded; and measured alpha, SSIM, and presentation-window misses are
  limited to their exact tuples or input variants while neighboring variants
  remain PASS.
- Benchmark limits eliminate adaptive inner-loop replay, keep one immediate
  operation sample, remove the settle window, and cap the consistently wedged
  cross-process memory request at one second. The original selected row fell
  from roughly 92 seconds to 13 seconds before the final timeout reduction;
  the final exhaustive run completed without a repeated measurement loop.
- Targeted repaired-path evidence:
  `results/raw/chromium-2026-07-24T07-50-35-107Z.json` (7/7 aggregates PASS;
  17 supported candidates PASS and 11 exact NA_ENGINE, with no adverse
  candidate or oracle).
- Focused aibrush-media/runner regressions: 62 pass with 348 assertions. Cell
  boundary: full suite 1118 pass with 14081 assertions across 80 files,
  typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Quick artifact content hash:
  `15fd6b7890a24499a62d8089a557f9df37fb3e14deafe797af575610954b5b6e`;
  file SHA-256:
  `1ed826a1819298e437b6b60d87477971d204254baa3b97741e0452de3d2733b4`.
- Exhaustive artifact content hash:
  `d6003a5a86b64ed96caf3b61bc4206e5240a1bbd4eedfe56cfbd4efe17596a6f`;
  file SHA-256:
  `ea465b851d6c93814d5f3f128f943f9e8d1d8a1b6e9edf628f4eadb6397cb236`.
- Suggested commit message: `cell(transcode × aibrush-media): complete exhaustive transcode evidence`

### decode-seek × mediabunny

- Quick: `results/raw/chromium-2026-07-24T12-41-07-819Z.json`
- Exhaustive: `results/raw/chromium-2026-07-24T12-41-57-411Z.json`
- Both authoritative artifacts are completed forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `7F184E2B-D846-47AE-9F55-AB8C015F3E2D`.
- Quick terminal rows: 29 PASS, 14 NA_ASSET, and 3 exact NA_ENGINE; all 46
  scenarios were observed with no aggregate or oracle FAIL/ERROR/SKIPPED.
- Exhaustive terminal rows: 42 PASS, 1 NA_ASSET, and 3 exact NA_ENGINE; all 46
  scenarios and all 106 candidate executions were observed. Candidate outcomes
  are 48 PASS, 46 NA_ASSET, and 12 NA_ENGINE, with no aggregate, nested
  candidate, or oracle FAIL/ERROR/SKIPPED. Coverage grades are 27 full, 15
  legitimate partial, and 4 none.
- Each partial aggregate has its baked candidate PASS and three selected
  candidates with pending active-generation frame evidence. The only
  all-NA_ASSET row is the rotated-display fixture for the same evidence reason.
  All candidates with available required evidence pass.
- NA_ENGINE evidence is confined to JPEG, PNG, and WebP ImageDecoder rows:
  Mediabunny does not declare those still-image input containers. Every four-file
  exhaustive variant retains that exact intrinsic reason.
- Repairs remain evidence-producing: bounded benchmark replay eliminates the
  repeated adaptive loop and wedged cross-process memory sampling; seek chooses
  the nearest real presentation sample with an earlier tie break; bounded
  platform decode sorts presentation order before truncation; quality compares
  only the requested/committed golden prefix; and the VFR golden now reflects
  the browser's true leading presentation prefix.
- The pending-golden decode-remux fallback now compares source and candidate in
  one presentation domain at source-frame interior anchors. This avoids both the
  previous prefix-versus-uniform mismatch and legal Matroska millisecond
  timestamp rounding at frame boundaries. Targeted exhaustive evidence:
  `results/raw/chromium-2026-07-24T12-40-45-674Z.json` (4/4 PASS).
- Shared-oracle cross-engine spot-check:
  `results/raw/chromium-2026-07-24T12-44-33-331Z.json` (aibrush-media, same
  decode-remux scenario, exhaustive 4/4 PASS).
- Benchmark limits cap inner reuse at one, retain one immediate memory sample,
  remove the settle delay, and cap the sampler request at one second. The final
  quick run completed in 40.8 seconds and exhaustive in 115.7 seconds without a
  repeated measurement loop.
- Focused decode-seek/oracle/Mediabunny regressions: 115 pass with 407
  assertions. Cell boundary: full suite 1122 pass with 14088 assertions across
  80 files, typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Quick artifact content hash:
  `3af1418bfefb8cde1c5e1aca67e58016e929bdc1b0033a8b7dbc721ea9ed607d`;
  file SHA-256:
  `0f6e88089b9e5a8f71f579cdcf359b7147de63c6c7f198d5de600a1aa0232d47`.
- Exhaustive artifact content hash:
  `14d251285605b410e3c7a3e767590e0cdf22eb71d2e4de51310f4149c09e99f0`;
  file SHA-256:
  `284223f143f45d540ae3b252a3b681ffc5721d9ad2776d5f0ebfeb2ce8457927`.
- Suggested commit message: `cell(decode-seek × mediabunny): complete exhaustive decode evidence`

### decode-seek × ffmpeg-wasm

- Quick: `results/raw/chromium-2026-07-24T13-17-28-094Z.json`
- Exhaustive: `results/raw/chromium-2026-07-24T13-19-55-980Z.json`
- Both authoritative artifacts are completed forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `A9C6234E-65C1-4B34-91FB-7D55E1A49B20`.
- Quick terminal rows: 27 PASS, 13 NA_ASSET, and 6 exact NA_ENGINE; all 46
  scenarios were observed with no aggregate or oracle FAIL/ERROR/SKIPPED.
- Exhaustive terminal rows: 38 PASS, 1 NA_ASSET, and 7 exact NA_ENGINE; all 46
  scenarios and all 106 candidate executions were observed. Candidate outcomes
  are 44 PASS, 40 NA_ASSET, and 22 NA_ENGINE, with no aggregate, nested
  candidate, or oracle FAIL/ERROR/SKIPPED. Coverage grades are 26 full, 12
  legitimate partial, and 8 none.
- Each partial aggregate has its baked candidate PASS and three selected
  candidates with pending active-generation frame evidence. The only
  all-NA_ASSET row is the rotated-display fixture for the same evidence reason.
  All candidates with available required evidence pass.
- NA_ENGINE evidence is confined to the adapter's declared surface: VP9 alpha,
  AV1 decode/seek, JPEG/PNG/WebP still-image containers, and the whole-file
  browser-WASM budget for the huge 600-second H.264 MOV decode. Every exhaustive
  variant retains its exact tuple reason.
- Repairs remain evidence-producing: neutral packet timelines replace the
  pinned browser ffprobe's successful-but-empty frame walk; ISO presentation is
  zero-based while EBML native origin is retained; seek chooses the nearest real
  sample with an earlier tie break; and header-only structured probing removes
  redundant full-file frame counts and log probes.
- Large decode prefixes now use FFmpeg's SHA-256 `framehash` over normalized
  RGBA packets and decode an exact single presentation sample lazily only when a
  pixel oracle requests it. This preserves all requested frame digests and SSIM
  evidence while bounding pixel memory to one frame instead of materializing
  roughly 1.0 GiB for 30 4K frames or 0.5 GiB for 60 1080p frames.
- Targeted repaired-path evidence:
  `results/raw/chromium-2026-07-24T13-16-48-103Z.json`
  (`decode_h264_4k` and `decode_h264_first_frames`, both PASS with eight real
  presentation-aligned SSIM samples and no adverse candidate/oracle). The
  targeted run completed in 19.5 seconds; the final quick and exhaustive runs
  completed in 136.0 and 395.6 seconds without a correctness restart.
- Benchmark limits cap inner reuse at one, retain one immediate memory sample,
  remove the settle delay, and cap the cross-process sampler request at one
  second. A sampler timeout remains typed measurement unavailability and never
  causes the supported correctness operation to rerun.
- Focused FFmpeg.wasm/decode-seek/oracle/runner regressions: 151 pass with 802
  assertions. Cell boundary: full suite 1122 pass with 14088 assertions across
  80 files, typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Quick artifact content hash:
  `6e2d109249c67b98bd5818d3487dce3ad36ef236babe39eb39ecca5bebea3491`;
  file SHA-256:
  `d96efffacd8d487190cb092c6cbf504675b23bce1be95384885134cae43672d9`.
- Exhaustive artifact content hash:
  `cd73d2bb75101eaf1b17f1da7390bc824432190c8ae68a83dd775930ca75d49b`;
  file SHA-256:
  `def2d82a1abffd68e7558011254d48c0f6df9dac2166d35984a88288f88bef23`.
- Suggested commit message: `cell(decode-seek × ffmpeg-wasm): complete exhaustive decode evidence`

### decode-seek × mp4box

- Quick: `results/raw/chromium-2026-07-24T13-31-00-011Z.json`
- Exhaustive: `results/raw/chromium-2026-07-24T13-31-11-752Z.json`
- Both authoritative artifacts are completed forced-fresh Chromium runs from
  `http://127.0.0.1:5151` with seed
  `4B3F29C1-8D72-4A0E-A6C4-1F95E7B308DA`.
- Quick terminal rows: 46 exact NA_ENGINE; all scenarios were observed with no
  operation execution, benchmark, aggregate FAIL/ERROR/SKIPPED, or oracle
  verdict fabricated for an unsupported operation.
- Exhaustive terminal rows: 46 exact NA_ENGINE; all 106 selected candidates
  executed their concrete applicability boundary. Eighty-six candidates lack
  the undeclared `decodeFrames` operation, 16 lack the undeclared `seek`
  operation, and the four decode-remux candidates additionally require MKV
  output outside MP4Box's declared ISO BMFF surface. All 46 coverage grades are
  legitimately none, with no nested FAIL/ERROR/SKIPPED.
- This is an evidence-backed unsupported cell, not a missing implementation
  hidden after execution: MP4Box is an ISO parser/muxer and the adapter declares
  neither a decoder nor frame-producing seek. No source repair was necessary.
- The quick and exhaustive matrix evaluations each completed in under 0.4
  seconds; unsupported rows did not enter correctness or measurement replay.
- Focused MP4Box/decode-seek/runner regressions: 110 pass with 5485 assertions.
  The immediately preceding full suite remains applicable because this cell
  changed no executable source: 1122 pass with 14088 assertions across 80
  files. Typecheck, `git diff --check`, and `git diff --cached --check` are
  clean.
- Quick artifact content hash:
  `e7ef67f454784aae134a74c88cea8d530b04299b598a8b8bb04e717334f85ebe`;
  file SHA-256:
  `8b0f6015b444550aebcca378b578d0565bc4e89ac17d3b63ca4a27068d8b30ce`.
- Exhaustive artifact content hash:
  `710748fca0d07be26353b219015f6619c7f1ff22a3a83c07707dd2f5c38ba9a8`;
  file SHA-256:
  `9a5f571623001f61156078baf7a828c3dacfc6dbfc2810c6587bd0996e15c586`.
- Suggested commit message: `cell(decode-seek × mp4box): record concrete decoder NA boundary`

### decode-seek × remotion

- Quick diagnostic: `results/raw/chromium-2026-07-24T13-37-18-811Z.json`.
  It reached 29 PASS, 8 NA_ASSET, and 8 NA_ENGINE, and isolated its sole
  remaining failure to VFR presentation reordering in `seek_vfr_arbitrary`.
- Focused repair proofs:
  `results/raw/chromium-2026-07-24T13-36-59-222Z.json` passed the non-keyframe
  H.264 nearest-frame seek, and
  `results/raw/chromium-2026-07-24T13-43-03-989Z.json` passed the repaired VFR
  seek. The full quick matrix was not replayed after this one-scenario repair;
  the immediately following exhaustive run covered every quick row plus all
  selected variants.
- Authoritative exhaustive:
  `results/raw/chromium-2026-07-24T13-43-21-602Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `D7E81A46-3B20-4F95-8C6D-2A70F1B94E53`.
- Exhaustive terminal rows: 37 PASS, 1 NA_ASSET, and 8 NA_ENGINE. Across 106
  selected candidates, 40 passed, 34 were NA_ASSET, and 32 were NA_ENGINE;
  coverage grades were 26 full, 11 partial, and 9 none. There were no outer or
  nested FAIL, ERROR, or SKIPPED outcomes.
- The sole all-NA_ASSET row is the rotated-display case awaiting its declared
  golden. Concrete NA_ENGINE evidence covers the three long-form whole-file
  decode budgets, JPEG/PNG/WebP image decoding, VP9 alpha decoding, and MKV
  output for decode-remux. The long-form boundary is grounded in Remotion's
  pinned media-parser whole-file sample traversal and lack of a public
  early-stop callback; it is no longer hidden by disabled-cell SKIPPED rows.
- Repairs admit unresolved source track metadata to real decode/seek preflight
  while preserving resolved audio-only rejection, select the nearest decoded
  presentation timestamp with an earlier-frame tie break, and decode 32 coded
  samples past a seek target so B-frame/VFR presentation reordering can settle.
- Focused Remotion/decode-seek/runner regressions: 102 pass with 721 assertions.
  Cell boundary: full suite 1125 pass with 14092 assertions across 80 files,
  typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Exhaustive artifact content hash:
  `1fb7a1b2fa894a98a11373b746a055c8e5c0e4a0e1fd85f5f2489aaaab8fcd75`;
  file SHA-256:
  `6233733280048e17114a124ea54723114025bc28f2b5bb88bbe3afabfb798f35`.
- Suggested commit message: `cell(decode-seek × remotion): complete exhaustive decode evidence`

### decode-seek × web-demuxer@4.0.0

- Quick diagnostic:
  `results/raw/chromium-2026-07-24T15-44-35-630Z.json`. It completed in about
  42 seconds with 24 PASS, 12 NA_ASSET, 6 NA_ENGINE, and four isolated adverse
  rows. Focused fresh-browser proofs then passed the repaired reorder case in
  `results/raw/chromium-2026-07-24T15-44-21-981Z.json` and all four remaining
  adverse rows together in
  `results/raw/chromium-2026-07-24T15-46-09-931Z.json`. The quick matrix was
  not redundantly replayed because the immediately following exhaustive run
  covered every quick row and selected candidate.
- Authoritative exhaustive:
  `results/raw/chromium-2026-07-24T15-46-23-887Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `40e3f8d3-a0e1-4403-ad68-ff69b49ea330`.
- Exhaustive terminal rows: 40 PASS and 6 NA_ENGINE. Across 106 selected
  candidates, 43 passed, 42 were NA_ASSET, and 21 were NA_ENGINE; coverage
  grades were 26 full, 14 partial, and 6 none. There were no outer or nested
  FAIL, ERROR, or SKIPPED outcomes.
- Concrete NA_ENGINE evidence covers JPEG/PNG/WebP image decoding, the
  decode-remux composition that requires an undeclared remux operation, VP9
  alpha, and display-matrix rotation. Partial rows contain a passing committed
  candidate plus generated candidates whose committed frame evidence is
  unavailable; no executable admissible candidate failed.
- Repairs make decoder-config evidence JSON-safe, bound benchmark repetition
  and sampling, retain only bounded decode/seek surfaces, close rasterized
  frames promptly, flush only at key-safe GOP boundaries, choose the nearest
  real seek PTS with an earlier tie, and recycle the package worker when
  web-demuxer 4 leaves its stream-cancellation promise pending.
- Focused web-demuxer/decode-seek/conformance regressions: 76 pass with 432
  assertions. Cell boundary: full suite 1128 pass with 14110 assertions across
  80 files, typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Exhaustive artifact content hash:
  `fd785808f2b71ff97ac390d7f0ed9bde3e9946493eea723b7c900a92e2e87871`;
  file SHA-256:
  `bd6a86b05959a0ae3122cb16bb2530acc24f05282b0d311eebc31ed8fc6750cd`.
- Suggested commit message: `cell(decode-seek × web-demuxer): complete exhaustive decode evidence`

### decode-seek × aibrush-media

- Quick diagnostic:
  `results/raw/chromium-2026-07-24T15-57-36-508Z.json`. It completed in about
  31 seconds with 27 PASS, 17 NA_ASSET, 1 NA_ENGINE, and one isolated failure:
  `seek_vfr_arbitrary` returned 4433333 instead of the nearest real PTS
  4233333 for target 4250000. The focused fresh-browser proof passed after the
  seek repair in `results/raw/chromium-2026-07-24T16-04-34-590Z.json`; the
  quick matrix was not redundantly replayed because exhaustive coverage
  immediately superseded it.
- The first exhaustive diagnostic,
  `results/raw/chromium-2026-07-24T16-04-45-684Z.json`, isolated the remaining
  admissible failure to the baked `decode_vp9_alpha` candidate. Its final
  focused proof is
  `results/raw/chromium-2026-07-24T16-17-20-113Z.json`: RGB SSIM mean/minimum
  1.0 over eight frames and all 12 timestamp-keyed alpha planes exact. A
  shared-path MediaBunny cross-check also passed in
  `results/raw/chromium-2026-07-24T16-17-36-649Z.json`.
- Authoritative exhaustive:
  `results/raw/chromium-2026-07-24T16-18-58-098Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `96928afe-4825-42d4-a41d-4445478c849c`.
- Exhaustive terminal rows: 44 PASS, 1 NA_ASSET, and 1 NA_ENGINE. Across 106
  selected candidates, 50 passed, 55 were NA_ASSET, and 1 was NA_ENGINE;
  coverage grades were 26 full, 18 partial, and 2 none. There were no outer,
  nested, or oracle FAIL, ERROR, or SKIPPED outcomes.
- Concrete NA_ENGINE evidence: the framework decode API exposes only primary
  video track 0, so `decode_multitrack_select_video` cannot select requested
  track 1. The sole whole-row NA_ASSET is rotated-display decoding while its
  committed frame evidence remains unavailable. Other partial rows combine a
  passing committed candidate with generated candidates lacking committed
  evidence; no executable admissible candidate failed.
- Repairs align seek requests to the framework's public packet table, choosing
  the nearest observed PTS (earlier on ties, and keyframe-at-or-before when
  requested). WebM alpha decoding now uses the framework's public color/alpha
  packet seam with the shared WebCodecs decoder, and copies the decoder's
  native alpha luma plane directly so RGBA premultiplication and range
  conversion cannot corrupt exact alpha evidence.
- Focused aibrush-media/decode-seek regressions: 82 pass with 371 assertions.
  Cell boundary: full suite 1129 pass with 14114 assertions across 80 files,
  typecheck clean, `git diff --check` clean, and `git diff --cached --check`
  clean.
- Exhaustive artifact content hash:
  `6162b018d95d723ce6f20e4c1fc6a34e6a0d65f6d8ceb927fcd59eaf9fc6e223`;
  file SHA-256:
  `7ebee8d5d82303afb3c40ef25a30070877c048239cb590fe4e223fce29329510`.
- Suggested commit message: `cell(decode-seek × aibrush-media): complete exhaustive decode evidence`

### trim × mediabunny

- Quick diagnostic:
  `results/raw/chromium-2026-07-24T16-25-25-527Z.json`, a forced-fresh
  Chromium run with 5 PASS, 12 NA_ENGINE, 1 NA_ASSET, 13 FAIL, and 12 ERROR.
  It was not replayed after repair because the exhaustive diagnostic and
  focused adverse proofs supersede it.
- Authoritative exhaustive diagnostic:
  `results/raw/chromium-2026-07-24T17-15-47-106Z.json`, seed
  `8924abde-4c83-4761-8cc8-5402aa684155`. It exercised all 43 scenarios and
  121 selected candidates: 23 scenario PASS, 7 NA_ENGINE, and 13 FAIL; at the
  candidate level, 75 PASS, 24 FAIL, 19 NA_ENGINE, and 3 NA_ASSET. Every
  adverse supported member was then repaired and rerun in a forced-fresh,
  targeted proof rather than replaying the entire matrix.
- Final grouped adverse proof:
  `results/raw/chromium-2026-07-24T17-34-09-556Z.json`. All ten selected
  scenario aggregates passed: fragmented MP4, H.264/VP8/MKV/MOV keyframe
  copy, start-zero copy, large lazy-read copy, VFR frame-accurate trim, and
  VP9 full-range idempotence. The rotated golden candidate passes exact
  timeline, property-preservation, and playback checks; its three generated
  variants are honest NA_ASSET because their sources contain no non-identity
  orientation evidence.
- The preceding grouped proof
  `results/raw/chromium-2026-07-24T17-30-28-198Z.json` establishes all three
  large frame-accurate throughput candidates PASS and all three MP3 exact
  copy candidates NA_ENGINE. Mediabunny cannot author the MP3 delay/padding
  metadata required to preserve the requested decoded presentation window.
- Standalone terminal proofs: VP8 alpha side data, 2/2 PASS in
  `results/raw/chromium-2026-07-24T16-59-47-907Z.json`; exact Ogg Opus,
  240000 decoded samples with matching endpoint PCM digests in
  `results/raw/chromium-2026-07-24T17-07-07-330Z.json`; both past-EOF
  robustness cases PASS in
  `results/raw/chromium-2026-07-24T17-08-12-988Z.json`; and the exact 1.1 GB
  massive-file case PASS with 4613 retained samples plus playback in
  `results/raw/chromium-2026-07-24T17-14-31-677Z.json`.
- Remaining unexecutable inputs terminate with concrete evidence: undeclared
  FLAC seek-table behavior, unsupported auxiliary-track selection, missing TS
  decoder/mux configuration, undeclared concat/WAV/AIFF/ADTS surfaces, exact
  MP3 presentation timing, or missing committed orientation evidence. No
  executable admissible candidate remains failed.
- Repairs preserve alpha and cardinal rotation metadata, enforce exact
  packet-copy interval/timeline evidence without browser-seek instability,
  preserve Opus pre-skip/end-trim semantics, handle very large ISO structures
  without argument-stack overflow, reject malformed/past-EOF ranges, and
  bound frame-accurate visual and final-frame duration tolerances to observed
  source evidence.
- Cell boundary: focused trim/runner/adapter regressions 64 pass with 282
  assertions, additional support/selection/contract/conformance checks green,
  full suite 1140 pass with 14150 assertions across 80 files, and typecheck
  clean.
- Quick artifact content hash:
  `3c39cb8b872d80fce5360ef946d87b91edc650d0fbd54edbf259e7e4c00bab5a`;
  file SHA-256:
  `1409342359a81f980694f441edb8ddb3cb658abf9f530b2989dc7efe4071e77f`.
- Exhaustive diagnostic content hash:
  `4e05d8fde84bc3fc8662b8c2c6d472de755718e1e1aeae3bc85de479aa0391ec`;
  file SHA-256:
  `54bd031edfebd52b017b99583ac2150bc63ae1b50a963c710d5ae329fa5ba1ee`.
- Final grouped proof content hash:
  `207e76aea157341fbee9687461d954b0710c1fff248ac27b3fb3d342c2179e3d`;
  file SHA-256:
  `f2e680dbc8d4a68a6bed06b0b1d46c87484fd7761d1dfb40438d12cbeedacf50`.
- Suggested commit message: `cell(trim × mediabunny): complete exhaustive trim evidence`

### trim × ffmpeg-wasm

- Quick diagnostic:
  `results/raw/chromium-2026-07-24T17-40-54-428Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `b1cef4a0-4647-42a1-b09e-c6ab470c888b`. It exercised all 43 scenarios and
  isolated 8 PASS, 4 NA_ENGINE, 22 FAIL, and 9 ERROR rows. It was not replayed
  after repair because exhaustive and focused evidence superseded it.
- Authoritative exhaustive diagnostic:
  `results/raw/chromium-2026-07-24T18-18-59-151Z.json`, seed
  `75dd56a5-23c4-490b-838c-633df89417ac`. It covered all 43 scenarios and 118
  candidate records: 75 PASS, 27 NA_ENGINE, 2 NA_ASSET, 11 FAIL, and 3 ERROR;
  coverage grades were 22 full, 8 partial, and 13 none. This single exhaustive
  run became the immutable baseline; the full matrix was not replayed.
- Final grouped adverse proof:
  `results/raw/chromium-2026-07-24T18-36-52-509Z.json`, seed
  `e6a46b50-9d8d-4525-8ae0-81510825f886`. All nine affected scenario
  aggregates passed. Across 35 exhaustive candidate records, 15 passed, 15
  were concrete NA_ENGINE, and 5 were NA_ASSET; coverage grades were 7 full
  and 2 partial, with no nested FAIL, ERROR, or SKIPPED outcome. The baked CMAF
  source preserves all 60 selected coded samples and their relative timeline.
- The final proof closes every adverse member from the exhaustive baseline:
  generated TS sources without a complete independent range timeline are
  typed NA_ASSET while the committed TS source passes; exact generated H.264
  B-frame intervals that FFmpeg 5.1 cannot close without substituting later
  decode-order packets are candidate-scoped NA_ENGINE; supported sibling
  candidates remain PASS. Existing concrete NA_ENGINE rows also retain their
  exact evidence for audio presentation timing, long MOV edit preroll,
  fragmented B-frame boundaries, unavailable codecs/containers, composition,
  and stable single-thread suite budgets.
- Repairs add typed malformed/range rejection, literal full-range no-op
  identity, bounded metadata probing, exact ISO presentation-window selection,
  packet-authoritative copy evidence, measured reorder-tail clipping,
  frame-accurate H.264/VP8/VP9 output, progressive/fragmented MP4 selection,
  FLAC/TS evidence routing, and a single tiny cross-track timestamp probe. For
  fragmented MP4 the measured leading AAC/video skew is applied to the whole
  video packet timeline, preventing FFmpeg from stretching only the first
  sample while retaining byte-exact coded payloads.
- Focused FFmpeg support/trim/runner regressions: 40 pass with 277 assertions.
  Cell boundary: full suite 1141 pass with 14177 assertions across 80 files,
  typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Quick artifact content hash:
  `d416cb40a96162fb19c0a7f84c5864cc7152eae95417865e6ee83d765d9eb253`;
  file SHA-256:
  `536b3e324287d957c37ed0beb460eccb3eefd9437a93f0d78cd008829716d9b8`.
- Exhaustive diagnostic content hash:
  `b31faf07dbda77224d67a9aa3e16fa7c9b08f7785200ce59f00400c4799cbc3f`;
  file SHA-256:
  `67e7bfe81339601f1cc6862f4b8cd0cf2059c9bc376a72d65908fffb97a75b9c`.
- Final grouped proof content hash:
  `d52312a0b1c5eecfb082185794ea1e711c6ac830f9d1df2e39edc92f5d31348c`;
  file SHA-256:
  `e4a01a6a50d50b60ddf76950ec3419f2be77c5eab1701f29939bb804fbeea558`.
- Suggested commit message: `cell(trim × ffmpeg-wasm): complete exhaustive trim evidence`

### trim × mp4box

- Quick:
  `results/raw/chromium-2026-07-24T18-41-45-049Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `a054813e-53af-4a41-8b64-92d8f5e1f71e`.
- Exhaustive:
  `results/raw/chromium-2026-07-24T18-41-55-493Z.json`, seed
  `14cee7c6-bf52-465c-86d6-cf60774cfd7a`.
- Both runs terminate all 43 scenario aggregates as concrete NA_ENGINE. The
  exhaustive artifact retains all 118 selected candidate records as
  NA_ENGINE, with 43 `none` coverage grades and no PASS, FAIL, ERROR,
  NA_ASSET, or SKIPPED candidate.
- Every candidate has the same exact boundary evidence: `engine does not
  declare operation 'trim'`. MP4Box remains an ISO parser/extractor and
  fragmented remux/mux authoring adapter; it exposes no trim operation. No
  adapter operation, correctness oracle, warmup, or measurement replay ran.
- Quick and exhaustive each completed in 2.9 seconds. No executable source
  changed for this cell. Focused MP4Box/trim/runner regressions: 71 pass with
  5157 assertions. The immediately preceding boundary remains applicable to
  the identical executable source: full suite 1141 pass with 14177 assertions
  across 80 files and typecheck clean. `git diff --check` and
  `git diff --cached --check` are clean.
- Quick artifact content hash:
  `9592c146885702f2eb702fbd51487c946a6d6397f2144df2c6c8fb3b87dd405b`;
  file SHA-256:
  `9ec5ef02b712b3d64ef17490a8372d35424c46d03fc220502b2d1188ea58736b`.
- Exhaustive artifact content hash:
  `750ad1ba79519de381601beec37354e4dbed2055c88bafe4ebac505bbf56341b`;
  file SHA-256:
  `aab5b67311487ed1fd86290b4836eb68e6777b9afe7754a2d6747cedf3d5d1e7`.
- Suggested commit message: `cell(trim × mp4box): record undeclared trim boundary`

### trim × remotion

- Quick:
  `results/raw/chromium-2026-07-24T18-43-39-040Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `ef78c84d-753f-42b5-85d2-e1ee1a6434d0`.
- Exhaustive:
  `results/raw/chromium-2026-07-24T18-43-48-601Z.json`, seed
  `7edbcde4-899a-4328-a9fa-ccdf41b19c6e`.
- Both runs terminate all 43 scenario aggregates as concrete NA_ENGINE. The
  exhaustive artifact retains all 118 selected candidates as NA_ENGINE, with
  43 `none` coverage grades and no PASS, FAIL, ERROR, NA_ASSET, or SKIPPED
  candidate.
- Every candidate records `engine does not declare operation 'trim'`.
  Remotion's scored adapter declares probe, demux, remux, transcode,
  frame-decode, and seek, but it exposes no standalone trim operation. No
  adapter operation, correctness oracle, warmup, or measurement replay ran.
- Quick and exhaustive each completed in 2.8 seconds. No executable source
  changed for this cell. Remotion adapter/support regressions: 38 pass with
  276 assertions; trim/runner behavior was already green on the identical
  source in the immediately preceding focused gate. The same boundary remains
  applicable: full suite 1141 pass with 14177 assertions across 80 files,
  typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Quick artifact content hash:
  `e823c907e9950cf823e757dcabccd464b708fede8bbbc895527593b0c123e51a`;
  file SHA-256:
  `bd4aa3507ce091d0450a0740b4ec9a31e5ab4d1d60bd17bb8ca04fe0980c38bd`.
- Exhaustive artifact content hash:
  `11c1d71503541822b82a5b03cc734691aba269d940063f4b06c2c15bddbf5e24`;
  file SHA-256:
  `9211a047dc686a1769ded3df8d5330bdddede1cd891bd569bce5be0d9f356d00`.
- Suggested commit message: `cell(trim × remotion): record undeclared trim boundary`

### trim × web-demuxer@4.0.0

- Quick:
  `results/raw/chromium-2026-07-24T18-44-54-505Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `594d1201-2886-46f5-a902-8b09ca6cc969`.
- Exhaustive:
  `results/raw/chromium-2026-07-24T18-45-04-513Z.json`, seed
  `140fb5e5-5272-4d60-bb77-b36117fd90fa`.
- Both runs terminate all 43 scenario aggregates as concrete NA_ENGINE. The
  exhaustive artifact retains all 118 selected candidates as NA_ENGINE, with
  43 `none` coverage grades and no PASS, FAIL, ERROR, NA_ASSET, or SKIPPED
  candidate.
- Every candidate records `engine does not declare operation 'trim'`.
  web-demuxer 4.0.0 exposes probe/demux parser surfaces and bounded decode/seek
  bridges, but no trim authoring operation. No adapter operation, correctness
  oracle, warmup, or measurement replay ran.
- The canonical scored selector is `web-demuxer@4.0.0`; one rejected shorthand
  launcher request produced no run artifact and is not campaign evidence.
  Quick and exhaustive each completed in about 2.9 seconds. No executable
  source changed for this cell. Focused support regressions: 8 pass with 35
  assertions; trim/runner behavior was already green on the identical source.
  The same boundary remains applicable: full suite 1141 pass with 14177
  assertions across 80 files, typecheck clean, `git diff --check` clean, and
  `git diff --cached --check` clean.
- Quick artifact content hash:
  `d0a43e3e6177b9cb309869e54a4b31c68256519bf8d544972142fb83f49fcd43`;
  file SHA-256:
  `141ce6ae8c9b977666b4b5fb4df9a4c8ea418876c450595b63d132405a6a1f24`.
- Exhaustive artifact content hash:
  `70d98d12fce5b420e444e88f3b54c5f5a4559c893113e2ff3c06426343c46080`;
  file SHA-256:
  `d1d18730d28cae0e8aa5645d8d9bf7a21cde919817a44f16099dc8eeb3b61061`.
- Suggested commit message: `cell(trim × web-demuxer): record undeclared trim boundary`

### trim × aibrush-media

- Quick diagnostic:
  `results/raw/chromium-2026-07-24T18-45-53-581Z.json`, a forced-fresh
  Chromium run from `http://127.0.0.1:5151` with seed
  `fb222e31-0620-45e2-9c2d-1147e1450e3e`. It exercised all 43 scenarios and
  isolated 14 PASS, 1 NA_ENGINE, 7 NA_BROWSER, 16 FAIL, and 5 ERROR rows. It
  was not replayed after repair because the exhaustive baseline and targeted
  adverse proofs supersede it.
- Authoritative exhaustive diagnostic:
  `results/raw/chromium-2026-07-24T19-11-40-324Z.json`, using the same seed.
  It covered all 43 scenarios and 118 candidate records: 73 PASS, 10
  NA_ENGINE, 25 NA_BROWSER, 3 NA_ASSET, 6 FAIL, and 1 ERROR. This was the one
  complete exhaustive run; the full trim matrix was not replayed.
- Final affected-candidate proof chain is forced-fresh and closes every
  adverse member from that exhaustive baseline. In
  `results/raw/chromium-2026-07-24T19-20-16-148Z.json`, AIFF PCM is 1/1 PASS,
  MOV is 4/4 PASS, WAV is 3/3 PASS, the executable large frame-accurate member
  is PASS with two exact browser-config NAs, and three of four MKV members
  pass (including the formerly failing `02.mkv`). In
  `results/raw/chromium-2026-07-24T19-24-20-580Z.json`, the bit-flipped input
  passes its robustness contract as a typed clean rejection. Finally,
  `results/raw/chromium-2026-07-24T19-27-42-093Z.json` selects the exact
  remaining `03.mkv` identity
  `15ac6672aed3905b6fff8dd3ca12c463d03a57f174dc8ca5a75229ef92a22b26`
  and passes coded-content/timeline evidence. Together these targeted proofs
  supersede all six FAIL candidates and the one ERROR candidate without a
  second exhaustive run.
- Terminal candidate accounting is therefore 80 PASS, 10 concrete
  NA_ENGINE, 25 NA_BROWSER, and 3 NA_ASSET across the 118-member exhaustive
  set; no executable admissible candidate remains failed. The four
  NA_ENGINE scenario rows are exact presentation-timing limits for lossy
  AAC/MP3/Opus packet-copy trims plus the framework's unexposed fragmented
  trim shape. The six whole-row NA_BROWSER results retain the exact rejected
  WebCodecs encoder configurations.
- Repairs provide exact half-open packet selection for MP4/MOV,
  WebM/Matroska, and MPEG-TS; preserve Matroska attachment bundles and
  physical video decode order; retain ISO rotation, alpha, codec config, and
  precise timestamp clocks; align frame-accurate requests to neutral
  presentation samples; derive PCM and coded-audio interval duration from
  native evidence; and cleanly reject intentional malformed robustness input
  before post-output decode validation. Candidate-scoped support now declares
  only the lossy audio presentation windows the public trim surface cannot
  author exactly.
- Cell boundary: focused trim/runner/aibrush-media regressions 53 pass with
  213 assertions, final support/remux regressions 28 pass with 81 assertions,
  full suite 1143 pass with 14184 assertions across 80 files, typecheck clean,
  `git diff --check` clean, and `git diff --cached --check` clean.
- Quick artifact content hash:
  `54525b9fa107704e81884d7750fe18495e37f92f0f98209e198166f602901a48`;
  file SHA-256:
  `ad9c560d7381b6202386454a49b57ebbdda22469a573d8611a75383dc57fa17a`.
- Exhaustive diagnostic content hash:
  `7c187370b3b9bd961fbd2f403ea59bff0b58dad3b05a39b11b8c558e06029705`;
  file SHA-256:
  `1f6b26393e507d4bbbd9387be38cbff6b3cbee63a9f8b93b577504c6e5c80371`.
- Affected-group content hashes / file SHA-256 values are respectively
  `67547fa7ed6dbbe6136da5316aba341abe3b7e983901869953ab724803e33865` /
  `26d60bb28f8cfca253c1c24497014f7df5c8850355bf895f3a7b0c8ce4ab23b6`,
  `d4a87797f34647012f22b24efa15b1734fc6992b05d75d7c07a4f78c9e504cde` /
  `521eee88b11ef6b88ba7a98173410a433ae85345b1dabe8ee0bc2503ecc9e1aa`,
  and
  `e24ce03b5c73b35ba54b576e2d34931717fec43bdf5c2d9487663d6ae435fd82` /
  `28ac0b0a48b119642b752d16e1999bb705a73c807b97e306652735412b095c4b`.
- Suggested commit message: `cell(trim × aibrush-media): complete exhaustive trim evidence`

### mux × mediabunny

- Quick diagnostic:
  `results/raw/chromium-2026-07-24T19-32-59-866Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `mux-mediabunny-20260724-v1`. It exercised all 53 scenarios and isolated 22
  PASS, 7 NA_ENGINE, 3 NA_ASSET, 7 FAIL, and 14 ERROR rows. It was not
  replayed after repair because the exhaustive baseline plus targeted adverse
  proofs supersede it.
- Authoritative exhaustive diagnostic:
  `results/raw/chromium-2026-07-24T19-34-17-417Z.json`, using the same seed.
  This was the one complete exhaustive run: all 53 scenarios and 176 candidate
  records, comprising 70 PASS, 20 NA_ENGINE, 12 NA_ASSET, 27 FAIL, and 47
  ERROR candidates before repair. The full mux matrix was not replayed.
- The forced-fresh targeted chain closes every adverse baseline scenario.
  `results/raw/chromium-2026-07-24T20-00-19-757Z.json` reruns the 25 affected
  scenarios together and proves typed illegal-tuple rejection, safe integer
  timebases, exact multitrack membership, TS/WAV/MP3/AAC target semantics,
  concrete full-timeline NAs, and rotation-policy handling.
  `results/raw/chromium-2026-07-24T20-06-48-152Z.json` then proves ordinary
  positioned MP4 streaming 4/4 PASS and the rotated MOV's structural and
  presentation-normalized layer with 12/12 paired frames. Finally,
  `results/raw/chromium-2026-07-24T20-10-31-602Z.json` proves reserve
  fast-start 4/4 PASS, and
  `results/raw/chromium-2026-07-24T20-13-44-785Z.json` replaces the false
  Vorbis track-count skip with four concrete
  `MEDIABUNNY_TIMESTAMP_MODE_UNSUPPORTED` results.
- Latest-evidence reduction across the 53 exhaustive scenarios is 40 PASS,
  12 concrete NA_ENGINE, and 1 NA_ASSET, with zero FAIL or ERROR rows.
  Candidate accounting is 119 PASS, 44 NA_ENGINE, and 13 NA_ASSET across all
  176 members. The sole NA_ASSET aggregate is the rotation row: generated
  members lack authoritative rotation evidence, while the baked rotated source
  independently passes `MUX_ROTATION_STRUCTURE_AND_PRESENTATION_MATCH` with
  its 90-degree matrix retained.
- Repairs make mux support selector-aware, retain executable negative rows for
  typed rejection, and declare only concrete timestamp/rotation gaps as
  NA_ENGINE. The packet-copy path now normalizes unsafe source timebases,
  returns tight owned buffers, replays positioned patches latest-write-wins,
  derives exact reserve packet bounds, and interleaves track heads so
  Mediabunny measures reserve tables only after every track configuration is
  known. Neutral mux readers also prove dynamic multitrack membership, AAC
  representation equivalence, target duration, and display-matrix
  presentation.
- Cell boundary: the single full-suite run executed 1152 tests across 80 files
  in 122.30 seconds; 1151 passed and its sole failure was a stale assertion
  that still required an explicit reserve bound. After updating that assertion
  to distinguish an omitted derived bound from an invalid explicit zero, the
  final affected gate is 172 pass with 675 assertions across six files. Direct
  reserve reproductions pass all three formerly asserting generated assets;
  typecheck, `git diff --check`, and `git diff --cached --check` are clean. Per
  the no-repeat rule, the full suite was not run a second time.
- Quick artifact content hash:
  `4f258f004f80cc77890b435e8422e1e6109da33a0bec3e63de7b58d880fc20f5`;
  file SHA-256:
  `e03a35f2188c3150a66bc99d9257ba781d6611a8ee3c81611a717b4aacfc8472`.
- Exhaustive diagnostic content hash:
  `a9c1f172c217ced0c1e9b1de19b33cba9acc8c9745ae6dc306d1fdaa75640764`;
  file SHA-256:
  `965d071046782e18751c9dbaee180ea6baf3914ebe9bcc56a681274c887fe2ce`.
- Targeted-chain content hashes / file SHA-256 values are respectively
  `4b29071e50d32a4f987448d48825ac26e3d784c6a3ff32935d597a281c216be8` /
  `18418c689bd8cc37769306b01529b87384c0f41ea07c3e101f1ae19b98610d90`,
  `d961276d3d950141ba43b3e46aceabcc134f1ac159e68af7416de80de3348f69` /
  `6cefdf30c696f78a2cab3a4174b812333eded1840a78be8c3c93672476b35a54`,
  `86c570b0033637e004a794a276e66a648f97353f2b5e70a95ac8191e5ad297de` /
  `2575a1d3287347028a4dd2b0eac1c90a608c54fca9641ba1117ea87c9d574456`,
  and
  `fc36f296241c6812840c547dec63f7c250ac0a01aa6bd71d02211b88f067051c` /
  `4c4f09fea9967b37ea823ca36c89b1f81881101ae1894cd602c8436b48edfb48`.
- Suggested commit message: `cell(mux × mediabunny): complete exhaustive mux evidence`

### mux × ffmpeg-wasm

- Authoritative exhaustive diagnostic:
  `results/raw/chromium-2026-07-24T20-19-36-711Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `mux-ffmpeg-wasm-20260724-v1`. This was the one complete matrix run and
  exercised all 53 scenarios and all 176 candidates. It was not repeated
  after repair.
- Forced-fresh targeted closure artifacts are
  `results/raw/chromium-2026-07-24T21-06-09-695Z.json`,
  `results/raw/chromium-2026-07-24T21-12-10-579Z.json`,
  `results/raw/chromium-2026-07-24T21-24-18-104Z.json`,
  `results/raw/chromium-2026-07-24T21-27-51-123Z.json`,
  `results/raw/chromium-2026-07-24T21-30-01-322Z.json`, and
  `results/raw/chromium-2026-07-24T21-31-05-112Z.json`. They cover only
  adverse baseline rows and directly affected siblings: raw PCM/WAV,
  selector and duration behavior, VFR/B-frame MP4 and Matroska boundaries,
  MPEG-TS, QuickTime MOV rotation, and sibling mux regressions.
- Latest-evidence reduction across the 53 exhaustive scenarios is 32 PASS and
  21 concrete NA_ENGINE, with zero FAIL or ERROR rows. Candidate accounting
  is 98 PASS, 66 NA_ENGINE, and 12 NA_ASSET across all 176 members, again with
  zero FAIL or ERROR candidates.
- The implementation now derives packet timing and exact source timebases from
  neutral container evidence, uses prepared Annex-B evidence only for coded
  byte boundaries, stages exact MP4/MOV VFR and B-frame timelines with edit
  lists, preserves QuickTime branding and display rotation, and supplies
  explicit raw PCM demux parameters. Support is selector-aware and restricts
  NA_ENGINE to concrete unsupported Matroska exact-timeline, MP3 gapless,
  baked long-form TS duration, and rotation tuples. Shared mux source reading
  accepts only frame-complete byte-capped terminal WAV packets.
- Cell boundary: focused FFmpeg timed-mux, evidence, support, and shared mux
  regressions are 66 pass with 417 assertions. The single full-suite gate is
  1159 pass with 14231 assertions across 80 files in 124.40 seconds.
  Typecheck and `git diff --check` are clean.
- Exhaustive content hash / file SHA-256:
  `4666930178b3ff3552fc95fab724313125f1dbd2c6d1800a03c97aea50e7a28b` /
  `3d44f97b9a76adad4dc66539fcf65c7dd21b7be7ac42c2768224243d0ba837d1`.
- Targeted closure content hashes / file SHA-256 values are respectively
  `76bc1ec3875c29a9001612f52aa9b9f621b4ac55244e1219599b59b273969816` /
  `bb81cf6d6b2e28d2b5d1e6c10eab601aeae27c27eec2051a913d670c4ce37440`,
  `90fd5f3174f7e70fb7c15fcd868ea94ca105bf3d0674158d12b512c0655a8158` /
  `83d9c029cedc27a076828dbc6bdbf5d0ce3871f7d9b2f2cde1e2304aed221eae`,
  `3512502a23e97b827bf714b6a39405be993b80043993f66916778a41cac8805c` /
  `9349472351c1014ecb5db47bde6890bd4ecd09ffdef50704dd844f10b4fce7a9`,
  `e00c5dea3147e94fa88435c5c5532871dd53900442fc4b5457733c5b92d84896` /
  `d65e0b298e1ebb5267064e1cb1acfbc826ebb0574a40bc03a8f8dd2c5563f0f7`,
  `b87b27143d038d1387b2d2beb4db932436ab7a2d8d53bce7647936057a1e7cb2` /
  `385f3b30b646bfdf0450eec41b51658dcc7804933f002acec55f28880d7cdc06`,
  and `e3846db263b6be98702cbb18f6cb8666a8f27010b4a0559680a91005ed59649c` /
  `278811d2acffa49e496a1f1e6648ca0e3e1509f3e312685d838a42aad82742ab`.
- Suggested commit message: `cell(mux × ffmpeg-wasm): complete exhaustive mux evidence`

### mux × mp4box

- The initial forced-fresh exhaustive run used
  `http://127.0.0.1:5151`, `--no-reuse`, and seed
  `mux-mp4box-20260724-v1`. It was deliberately interrupted after three
  completed scenario rows when an unbounded browser-memory sampler made a
  roughly 3 ms micro mux take about 110 seconds. Its retained evidence is
  `results/raw/.partial/chromium-2026-07-24T21-36-22-966Z.partial.json`.
- After bounding MP4Box benchmark sampling, the exact remaining 50 scenarios
  ran once in
  `results/raw/chromium-2026-07-24T21-45-25-161Z.json`; none of the three
  completed rows was replayed. The remainder completed in 3 minutes 13
  seconds. The nine supported rows affected by the subsequent timing repair
  were then rerun exactly once in
  `results/raw/chromium-2026-07-24T21-54-13-583Z.json`.
- Latest-evidence reduction across all 53 scenarios is 9 PASS and 44 concrete
  NA_ENGINE. Candidate accounting is 30 PASS and 146 NA_ENGINE across all 176
  members. Coverage grades are 9 full and 44 none, with zero FAIL, ERROR,
  NA_ASSET, NA_BROWSER, or SKIPPED outcomes at either result layer.
- The adapter now reads authoritative classic `stts` duration runs so MP4Box's
  extraction-time terminal-sample rewrite cannot shorten neutral VFR/AAC
  timing. The neutral fragmented-MP4 reader also treats a valid edit-list
  presentation duration as decisive instead of replacing it with the raw
  fragment end. Focused tests cover both behavior and the bounded benchmark
  contract.
- Cell boundary: focused MP4Box, mux, oracle, and runner regressions are 157
  pass with 5658 assertions. The single full-suite gate is 1160 pass with
  14236 assertions across 80 files in 127.54 seconds. Typecheck and
  `git diff --check` are clean.
- Interrupted-fragment content hash / file SHA-256:
  `1882176ddcbed513f4ad012c69109cd470c0c3a201ddf98b10a7e107d645217a` /
  `47a971f7f1af3bddc3c77a26129183eefd972ca7b1a72c11e2914835f062de86`.
- Remaining-50 content hash / file SHA-256:
  `49eb9e0edc3cdbc7a38757e629d4a815499fbd18c63704439300ce8d228e7946` /
  `b14ed3de5ae4da14bb8711c2a1c66d260de51d0dffe12d9703070fa10f81b865`.
- Targeted-closure content hash / file SHA-256:
  `e8c7429eed8b9f60ecc6814c62869929ebcc903a2c9064bf31427a793dcd35db` /
  `929e47ef1af45e974b68698dca800034548289cbff39caf0ee378b86ebd77ee2`.
- Suggested commit message: `cell(mux × mp4box): complete exhaustive mux evidence`

### mux × remotion

- Authoritative exhaustive evidence:
  `results/raw/chromium-2026-07-24T22-02-59-114Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `mux-remotion-20260724-v1`. At the operator's request to eliminate redundant
  waiting, this single exhaustive run replaced a separate quick pass.
- All 53 scenarios are exact NA_ENGINE with `none` coverage. All 176 candidate
  identities were executed, and all 176 record the same concrete reason:
  `engine does not declare operation 'mux'`. There is no aggregate, candidate,
  or oracle FAIL, ERROR, NA_ASSET, NA_BROWSER, or SKIPPED outcome.
- This is an honest product boundary. The unified Remotion 4.0.479 adapter
  exposes media-parser reads plus WebCodecs decode, seek, remux, and transcode;
  neither package exposes the external encoded-track assembly operation the
  mux scenarios require. No implementation change was warranted.
- Focused Remotion/mux/oracle/runner regressions are 148 pass with 904
  assertions. The immediately preceding identical-executable-source boundary
  remains applicable: full suite 1160 pass with 14236 assertions across 80
  files in 127.54 seconds, with typecheck and `git diff --check` clean.
- Exhaustive content hash / file SHA-256:
  `9115318b3e241a2113af8c0447c788afdbc53de91ec10797fab594560961e0f3` /
  `291f6eecfbe123ee02c30aaa147e7a62ed94c6f5cbb61e15e503e02b3451a395`.
- Suggested commit message: `cell(mux × remotion): verify operation-wide NA evidence`

### mux × web-demuxer@4.0.0

- Authoritative exhaustive evidence:
  `results/raw/chromium-2026-07-24T22-04-38-569Z.json`, a completed
  forced-fresh Chromium run from `http://127.0.0.1:5151` with seed
  `mux-web-demuxer-20260724-v1`. This single exhaustive run replaced a
  redundant quick pass.
- All 53 scenarios are exact NA_ENGINE with `none` coverage. All 176 candidate
  identities were executed, and all 176 record the concrete reason
  `engine does not declare operation 'mux'`. There is no aggregate, candidate,
  or oracle FAIL, ERROR, NA_ASSET, NA_BROWSER, or SKIPPED outcome.
- This is an honest engine boundary: web-demuxer@4.0.0 exposes parser-backed
  probe, demux, decode, and seek operations, but has no encoder or output
  container API and does not declare mux. No implementation change was
  warranted.
- Focused web-demuxer/mux/oracle/runner regressions are 161 pass with 889
  assertions. The immediately preceding identical-executable-source boundary
  remains applicable: full suite 1160 pass with 14236 assertions across 80
  files in 127.54 seconds, with typecheck and `git diff --check` clean.
- Exhaustive content hash / file SHA-256:
  `4d855db983ba971d46728e251c7015556c2f12e96de4182eb7b94fea7c0e263a` /
  `bf3111795dd3451eba40bcea2b161f9d4d29a8417c2669154568b5e7fb249a71`.
- Suggested commit message: `cell(mux × web-demuxer): verify operation-wide NA evidence`

### mux × aibrush-media

- The authoritative forced-fresh exhaustive Chromium baseline used
  `http://127.0.0.1:5151`, `--no-reuse`, and seed
  `mux-aibrush-media-20260724-v1` in
  `results/raw/chromium-2026-07-24T22-05-46-924Z.json`. It exercised all 53
  scenarios and all 176 candidates once, isolating 49 ERROR rows, 3 concrete
  NA_ENGINE rows, and 1 PASS row before repair. No redundant quick or second
  exhaustive pass was run.
- Repairs were closed only with affected-scenario runs. Latest-evidence
  reduction across the baseline plus the six retained closure artifacts is
  46 PASS, 5 concrete NA_ENGINE, and 2 NA_ASSET scenarios. Candidate
  accounting is 142 PASS, 17 NA_ENGINE, and 17 NA_ASSET across all 176
  identities, with zero FAIL, ERROR, NA_BROWSER, or SKIPPED outcomes at either
  result layer.
- The mux boundary now supplies explicit/tightly-owned coded representation,
  WAVE_FORMAT_EXTENSIBLE float PCM, source-qualified selector identity,
  cardinal rotation propagation, genuine callback-write telemetry, native VFR
  MP4 copy, HEVC sample-entry preservation, and fail-closed Ogg continuation
  repair. Focused tests bind each repair to its production path.
- Two Matroska full-timeline rows are exact NA_ENGINE with
  `AIBRUSH_MATROSKA_FULL_TIMELINE_UNSUPPORTED`: the SimpleBlock writer cannot
  serialize the required independent numeric DTS axis and exposes no VFR
  BlockDuration. The remaining three NA_ENGINE rows are the pre-existing
  concrete Vorbis/Ogg source-shape, reserved-fast-start, and sparse-co64
  boundaries.
- Both rotation scenarios are evidence-limited NA_ASSET only because their
  generated candidates lack the declared property golden. The decisive baked
  references pass display-space re-import; the Matroska reference preserves
  90-degree rotation and matches all 12 sampled frames.
- Cell boundary: focused regressions are 171 pass with 703 assertions. The one
  full-suite run is 1165 pass with 14249 assertions across 80 files in 119.32
  seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `58733d8e4a40f1cafacc560eab187c129432c71e30456cd1c464006d032117f5` /
  `37c8f651699cfacf4a6bb9fa53ad991f49a87c94f73a1c32d9c1db5756c71aee`.
- Broad repair closure
  (`results/raw/chromium-2026-07-24T22-12-00-119Z.json`) content hash / file
  SHA-256:
  `4d2b3caba510f6c7c99e3543c10e2363447a7b85841664bee9099627d47c0a45` /
  `9d6a5d56317421228ec0ec3fc30eb8b7552d79812401892191f98191dc6355a9`.
- Selector/streaming/rotation closures
  (`results/raw/chromium-2026-07-24T22-22-52-885Z.json` and
  `results/raw/chromium-2026-07-24T22-26-59-819Z.json`) content hashes / file
  SHA-256s:
  `bfdcefb73fd45c90dc82a2af2462f17fd161022f3bf3d2b5fbde1323986a1148` /
  `539f9a2d74459d5867a2d6b9c8bb72c21d21993c3b9a6b07b8ef48f2ba7cbde9`,
  and `befa9c66a207fd0918c2797e58ef8c7cfa32ac968844280c738e360703f62e77` /
  `f1439c9c0920d1df5bdc4bec0602e7d23ffabb0793e2e0514ef83f5244f88d92`.
- Final rotation closure
  (`results/raw/chromium-2026-07-24T22-32-55-682Z.json`) content hash / file
  SHA-256:
  `6f218fca6a876613d427ceb62e6c15cb96f5a488771c55169b74944e552befaa` /
  `f7174d3d8874cdd3a7a700a3b483511602d1852b8eee228519a5b6a4940f7fdd`.
- VFR/Matroska/Ogg closure
  (`results/raw/chromium-2026-07-24T22-36-13-830Z.json`) content hash / file
  SHA-256:
  `e35a3603712a70cca32e9ba98aabbd7979348902b042a0e60439412ac273f1ed` /
  `3da99e167a0d579cfee2d19d49f90d1787fe54df0b6ef9f56b660d67309bbfdf`.
- Final HEVC closure
  (`results/raw/chromium-2026-07-24T22-37-54-626Z.json`) content hash / file
  SHA-256:
  `6cb5b1a30c9dd58a650bfb9faf920e3db1a2bdc248038b2bb2bf49d17eab504c` /
  `f7d24b822314baefdb445df3fa5b83e7a7009e5217bb58fe34579f03c8cd524f`.
- Suggested commit message: `cell(mux × aibrush-media): complete exhaustive mux evidence`

### encryption × mediabunny

- The one authoritative forced-fresh exhaustive Chromium baseline used
  `http://127.0.0.1:5151`, `--no-reuse`, and seed
  `encryption-mediabunny-20260724-v1` in
  `results/raw/chromium-2026-07-24T22-44-38-032Z.json`. It exercised all 24
  scenarios and 26 selected candidates in 8 seconds, recording 18 NA_ENGINE,
  5 ERROR, and 1 NA_ASSET rows before repair. No separate quick or second
  exhaustive run was performed.
- The five error rows were rerun together exactly once in
  `results/raw/chromium-2026-07-24T22-48-29-130Z.json`. Latest-evidence
  reduction is 3 full PASS, 20 concrete NA_ENGINE, and 1 NA_ASSET scenarios;
  candidate accounting is 3 PASS and 23 NA_ENGINE, with zero FAIL, ERROR,
  NA_BROWSER, or SKIPPED outcomes.
- Missing-key, wrong-IV, and AES-128-versus-SAMPLE-AES negative requests now
  use the typed malformed-input channel and pass their clean-rejection
  contracts. ClearKey raw decrypt remains exact NA_ENGINE because
  `org.w3.clearkey` is an EME key system rather than Mediabunny's raw decrypt
  surface.
- HLS key rotation now leaves two independently verified key URIs distinct
  instead of applying the first caller key to both. It reaches the same exact
  NA_ENGINE boundary as the other AES-128 HLS positives: the read path does
  not expose the length-prefixed H.264 configuration required to author the
  clear MP4. Other NA_ENGINE evidence covers the guarded Mediabunny 1.48.0
  CENC-CTR parser, unexposed CBCS key resolution, and unsupported protection
  schemes; none is inferred from failure prose.
- `encryption/cenc_cens_decrypt` is the sole NA_ASSET row:
  `CORPUS_NO_VERIFIED_CANDIDATE`. Its CENS artifacts are not published in the
  current selected-assets fixture generation, so the engine is never invoked
  and the cell does not relabel missing corpus evidence as engine support.
- Cell boundary: focused regressions are 127 pass with 582 assertions. The one
  full-suite run is 1166 pass with 14257 assertions across 80 files in 120.32
  seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `edb792f5180eb0351601b64a2f8528147030a5873006012131f4d7deb26d0434` /
  `048119ba1bfab65061a9cd818cbe2649b51b9347d98fc284e9a2838720d4b621`.
- Targeted closure content hash / file SHA-256:
  `c692f6fa3986ac7f5842c7b4c87ea710cf66b000737b84e58124bc7abd5b338c` /
  `db35ff7eaefe907792f863c0bd1d19112e4ee9a0783b6dec776ad092582c2d95`.
- Suggested commit message: `cell(encryption × mediabunny): complete exhaustive encryption evidence`

### encryption × ffmpeg-wasm

- The one authoritative forced-fresh exhaustive Chromium baseline used
  `http://127.0.0.1:5151`, `--no-reuse`, and seed
  `encryption-ffmpeg-wasm-20260724-v1` in
  `results/raw/chromium-2026-07-24T22-51-59-251Z.json`. It exercised all 24
  scenarios and 26 selected candidates. Before repair it recorded 6 PASS, 10
  NA_ENGINE, 2 NA_ASSET, 5 FAIL, and 1 ERROR scenario; no separate quick or
  repeated whole-cell run was performed.
- The six adverse rows were rerun together exactly once, exhaustively, in
  `results/raw/chromium-2026-07-24T23-04-18-749Z.json`. That 18-second closure
  contains 7 PASS and 2 concrete NA_ENGINE candidate results. Latest-evidence
  reduction across baseline and closure is 10 PASS, 12 NA_ENGINE, and 2
  NA_ASSET scenarios; candidate accounting is 13 PASS, 12 NA_ENGINE, and 1
  NA_ASSET, with zero FAIL, ERROR, NA_BROWSER, or SKIPPED outcomes.
- Clear ISO-BMFF decrypt is now a literal byte no-op rather than an FFmpeg
  rewrap, so all four exhaustive clear candidates pass exact byte identity.
  Truncated protection syntax is converted to the typed malformed-input
  channel and passes the negative clean-rejection contract.
- The shared platform reference demux now joins a hybrid MP4's progressive
  sample-table prefix with addressable `moof`/`traf`/`trun` continuation
  samples. Independent `ffprobe` packet evidence and the repaired reader both
  establish 150 clear-reference video packets; the positive decrypt and
  throughput rows now pass all 150 presentation-ordered frame digests with
  zero timestamp residual instead of comparing a truncated 60-frame prefix.
- `encryption/cenc_ctr_protection_zeroed_graceful` and
  `encryption/cenc_ctr_senc_bitflip_graceful` are exact NA_ENGINE with
  `FFMPEG_CENC_INTEGRITY_UNOBSERVABLE`: AES-CTR has no authentication tag, so
  these syntactically valid mutations cannot be distinguished from legitimate
  ciphertext without improperly using the suite's private clear reference as
  the adapter's oracle.
- The two retained NA_ASSET scenarios remain evidence-layer boundaries, not
  engine failures: CENS has no verified selected candidate, and the
  cleartext-equivalence row's applied evidence set is insufficient. All ten
  other pre-existing NA_ENGINE scenarios retain their concrete unsupported
  scheme/API evidence.
- Shared-layer cross-check:
  `results/raw/chromium-2026-07-24T23-05-12-735Z.json` (aibrush-media,
  `encryption/cenc_ctr_decrypt`, exhaustive 1/1 PASS in 6.6 seconds).
- Cell boundary: focused regressions are 118 pass with 599 assertions. The one
  full-suite run is 1168 pass with 14265 assertions across 80 files in 125.28
  seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `4188c143489ad842b08a4583bf4b798af7d4ab329e1669f68516658104ed535e` /
  `32b63994fd9985b10dae52944887f6dcac512fc5f380363949decb604a75c163`.
- Targeted closure content hash / file SHA-256:
  `831cea7db2044b1a14c1ce4d279f6bf8a23ae5796808ebcf983340aaf2cb014a` /
  `927aee29fa3615d785c470634149d44ab71f79d8c177a68faf755e7a09339421`.
- Cross-check content hash / file SHA-256:
  `531620b756c98be6cca450a9bf6ebf0b0a3ed539db3b7328d4d1c611f4343a76` /
  `a726b21008a953dc22f3dcbe6d8f73475cadfa48b21d8347a33a66dbef598805`.
- Suggested commit message: `cell(encryption × ffmpeg-wasm): complete exhaustive encryption evidence`

### encryption × mp4box

- The single authoritative forced-fresh exhaustive Chromium run used
  `http://127.0.0.1:5151`, `--no-reuse`, and seed
  `encryption-mp4box-20260724-v1` in
  `results/raw/chromium-2026-07-24T23-09-25-088Z.json`. It completed all 24
  scenarios in 3.2 seconds. No quick run or closure rerun was needed.
- Terminal rows are 23 concrete NA_ENGINE and 1 NA_ASSET. All 26 executable
  exhaustive candidate records are NA_ENGINE with `none` coverage and zero
  PASS, FAIL, ERROR, NA_BROWSER, or SKIPPED outcomes.
- The operation-wide NA_ENGINE boundary is factual: MP4Box 2.3.0 parses ISO
  BMFF/CENC signaling but exposes no AES/decrypt operation. The adapter's
  `CapabilitySet` declares only probe, demux, remux, and mux, and declares an
  empty encryption surface; the runner therefore stops every decrypt request
  before engine lifecycle rather than manufacturing per-scheme failures.
- `encryption/cenc_cens_decrypt` is the sole NA_ASSET row because the active
  selected-assets generation has no verified candidate. It is not relabeled
  as an engine limitation.
- This cell required no source change. Its boundary reuses the immediately
  preceding current-source regression gate: 1168 tests pass with 14265
  assertions across 80 files in 125.28 seconds, including MP4Box capability
  and conformance coverage; typecheck and `git diff --check` are clean.
- Exhaustive artifact content hash / file SHA-256:
  `523c999729e91b16a6e4627733cbe49fdfce07055ddf9cbf2e1be1b1fa4a5e62` /
  `7a8bf3d13f4aa3915d813b4e17d41311f2dc73cea4487707040ecd1c39337d20`.
- Suggested commit message: `cell(encryption × mp4box): verify operation-wide decrypt unavailability`

### encryption × remotion

- The single authoritative forced-fresh exhaustive Chromium run used
  `http://127.0.0.1:5151`, `--no-reuse`, and seed
  `encryption-remotion-20260724-v1` in
  `results/raw/chromium-2026-07-24T23-10-41-225Z.json`. It completed all 24
  scenarios in 2.6 seconds. No quick run or closure rerun was needed.
- Terminal rows are 23 concrete NA_ENGINE and 1 NA_ASSET. All 26 executable
  exhaustive candidate records are NA_ENGINE with `none` coverage and zero
  PASS, FAIL, ERROR, NA_BROWSER, or SKIPPED outcomes.
- The operation-wide boundary is explicit in Remotion media-parser 4.0.479:
  its adapter is a read-only probe/demux parser, declares no decrypt operation
  and an empty encryption surface, and states that encrypted samples only pass
  through. The runner therefore negotiates NA_ENGINE before lifecycle for
  every decrypt request.
- `encryption/cenc_cens_decrypt` remains the sole NA_ASSET row because the
  active selected-assets generation has no verified candidate; it is not
  counted as an engine limitation.
- This cell required no source change and reuses the immediately preceding
  current-source regression gate: 1168 tests pass with 14265 assertions across
  80 files in 125.28 seconds, including Remotion capability and conformance
  coverage; typecheck and `git diff --check` are clean.
- Exhaustive artifact content hash / file SHA-256:
  `b39ce33d54e3f49c3df10d85616abd61dd1efc8a93b0311ceee6fe4a5b7e3f6d` /
  `7fafa8b983f9c9ece4551eb73f60e3d9e687d781bdf19b68099aecb68d375e6c`.
- Suggested commit message: `cell(encryption × remotion): verify read-only parser decrypt boundary`

### encryption × web-demuxer@4.0.0

- The single authoritative forced-fresh exhaustive Chromium run used
  `http://127.0.0.1:5151`, `--no-reuse`, and seed
  `encryption-web-demuxer-20260724-v1` in
  `results/raw/chromium-2026-07-24T23-11-24-178Z.json`. It completed all 24
  scenarios in 2.6 seconds. No quick run or closure rerun was needed.
- Terminal rows are 23 concrete NA_ENGINE and 1 NA_ASSET. All 26 executable
  exhaustive candidate records are NA_ENGINE with `none` coverage and zero
  PASS, FAIL, ERROR, NA_BROWSER, or SKIPPED outcomes.
- web-demuxer 4.0.0 exposes parser, packet, decode, and seek surfaces but no
  decrypt API. Its adapter declares probe/demux/decodeFrames/seek only and an
  empty encryption surface; protected-track metadata parsing is explicitly
  distinct from decryption. Every request therefore stops at the factual
  operation-wide NA_ENGINE boundary before lifecycle.
- `encryption/cenc_cens_decrypt` remains the sole NA_ASSET row because the
  active selected-assets generation has no verified candidate; it is not
  counted as an engine limitation.
- This cell required no source change and reuses the immediately preceding
  current-source regression gate: 1168 tests pass with 14265 assertions across
  80 files in 125.28 seconds, including web-demuxer support and conformance
  coverage; typecheck and `git diff --check` are clean.
- Exhaustive artifact content hash / file SHA-256:
  `14de51e6e36063f6b9bfefb2aea676c97a27d36e6c6360c22935e6c98a5eddc5` /
  `92e525d2b1d704290523754c40c27df34d5999787b8b67e52d7853810aca4b1e`.
- Suggested commit message: `cell(encryption × web-demuxer): verify parser-only decrypt boundary`

### encryption × aibrush-media

- The one authoritative forced-fresh exhaustive Chromium baseline used
  `http://127.0.0.1:5151`, `--no-reuse`, and seed
  `encryption-aibrush-media-20260724-v1` in
  `results/raw/chromium-2026-07-24T23-12-04-782Z.json`. It exercised all 24
  scenarios and 26 selected candidates in 47 seconds. Before repair it
  recorded 10 PASS, 4 NA_ENGINE, 2 NA_ASSET, 7 ERROR, and 1 FAIL scenario; no
  separate quick or repeated whole-cell run was performed.
- The seven error rows were repaired together and rerun once in
  `results/raw/chromium-2026-07-24T23-19-55-621Z.json`; that 12-second closure
  made all seven full PASS. The sole remaining CBCS row was then rerun alone
  in `results/raw/chromium-2026-07-24T23-23-30-037Z.json` and closed as
  evidence-backed NA_ASSET. Latest-evidence reduction is 17 PASS, 4 concrete
  NA_ENGINE, and 3 NA_ASSET scenarios. Candidate accounting is 20 PASS, 4
  NA_ENGINE, and 2 NA_ASSET, with zero FAIL, ERROR, NA_BROWSER, or SKIPPED
  outcomes.
- All six intentional CENC adverse requests now convert framework validation
  faults into typed malformed-input rejections only under their explicit
  negative robustness contracts. Truncation, protection zeroing, `senc`
  mutation, missing/wrong key, and requested-scheme mismatch therefore pass
  clean-rejection evidence instead of surfacing generic harness errors.
- HLS AES-128 rotation now preserves independently verified per-URI key
  resources. A single caller key is overridden only for a single-key
  playlist; the two-key fixture decrypts all 300 frames exactly with zero
  timestamp residual.
- `encryption/cenc_cbcs_decrypt` is NA_ASSET with
  `DECRYPT_CLEAR_REFERENCE_PRESENTATION_MISMATCH`, not an engine failure. The
  clear output reimports and plays, all 150 frame digests match, and its
  timeline exactly matches the digest-verified protected source. The declared
  clear twin alone differs by a 21,355 microsecond edit-list/priming offset.
  The other two NA_ASSET rows retain their prior evidence boundaries: CENS has
  no verified selected candidate and the CTR clear-equivalence row has no
  sufficient applied evidence set.
- The four NA_ENGINE rows retain concrete tuple evidence for an unresolved
  requested KID and the exact HLS/CENC method or IV mismatch boundaries; none
  is inferred from diagnostic prose.
- Cell boundary: focused regressions are 123 pass with 511 assertions. The
  one full-suite run is 1170 pass with 14267 assertions across 80 files in
  119.85 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `da803380292e16eef75d15335ca6c8947adc7a6cc18d11db9106df6d39c6cfc2` /
  `823713249c2cac7ad339c4d3c44888480dcf20f12ea961e3c804aba2671065dc`.
- Seven-row closure content hash / file SHA-256:
  `60a9b40040ab804a102b841b7118ff9bdedf3429d1d0cd3320b30d3c1c53ca5d` /
  `9870ab97b8308fefe3789dbc76620dd29f6849b453f0e71757ee480a8ab5cb84`.
- CBCS closure content hash / file SHA-256:
  `a54859496c33778c81d40fdde93c17a7d7545171c1d07e76fd63c74389464228` /
  `017d9cf4eae28f556206b9be5495780a20da51fa6c39b9c536ab91df600ba36f`.
- Suggested commit message: `cell(encryption × aibrush-media): complete exhaustive encryption evidence`

### metadata × mediabunny

- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `metadata-mediabunny-20260724-v1`:
  `results/raw/chromium-2026-07-24T23-27-53-446Z.json`. It exercised all 25
  scenarios and 94 candidates once in about 53 seconds. The initial result
  was 17 PASS, 3 NA_ENGINE, and 5 partial scenarios; no quick run or repeated
  whole-feature baseline was performed.
- Only the five partial rows were grouped in
  `results/raw/chromium-2026-07-24T23-34-35-048Z.json`. After that diagnostic
  closure, the single MP4-tag row was verified in
  `results/raw/chromium-2026-07-25T11-58-24-580Z.json`, and the remaining
  three remux rows were closed together in
  `results/raw/chromium-2026-07-25T11-58-44-344Z.json`. Latest-evidence
  reduction is 22 PASS and 3 NA_ENGINE scenarios; candidate accounting is 75
  PASS and 19 NA_ENGINE with zero FAIL, ERROR, NA_ASSET, NA_BROWSER, or
  SKIPPED outcomes. Every supported aggregate has full exhaustive coverage.
- The three fully unsupported scenarios retain exact evidence: AIFF is outside
  the declared input-container surface, display-matrix decode is undeclared,
  and Ogg packet-copy cannot preserve the requested explicit timing. Mixed
  candidate NA_ENGINE outcomes additionally retain exact auxiliary-track,
  rotation-copy, codec/container, and timestamp-mode tuple reasons.
- Repairs are evidence-producing: probe preflight now rejects resolved
  auxiliary track inventories that `Input.getTracks()` cannot expose; an MKV
  normalized comment edit removes conflicting DESCRIPTION/COMMENT carrier
  aliases; and metadata remux pixel equality compares sequential same-run
  source/output WebCodecs prefixes. The latter removes boundary-seek false
  mismatches while the independent neutral reader still proves exact track,
  access-unit, parameter-set, and timeline preservation. Direct diagnostics
  confirmed all six initially failing remux outputs retained every coded
  video/audio access unit.
- Cell boundary: focused regressions are 163 pass with 534 assertions. The one
  post-repair full-suite run is 1172 pass with 14273 assertions across 80
  files in 128.58 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `4a4656acabe3db9022a6a76d49dcd52e1b174d255c7b6de947a9633b9f8332ed` /
  `4fdc10fc7421f3942d26559b425d69990bf679c16c568815f8c0b9f4f02dd5b2`.
- Five-row diagnostic closure content hash / file SHA-256:
  `048b75e406e32aa27e07bfb3b7c9b188d59dc6b07848b52aacc8b671987d12c6` /
  `06e0de4f8b5eb76268f180aad9054bc717b4020f6f0f296cbd649a258848acc0`.
- MP4-tag closure content hash / file SHA-256:
  `4d4fa266ca47d048368746dc9b6e3a1ca9e652bdb4c05ea8ba0f351e1c77838c` /
  `7a638b1d46b56989ad62e286b03e00ce0dd6853085be4b4a8133cb8e11359a4e`.
- Final three-row closure content hash / file SHA-256:
  `563e02a517f557d19c470acff3de8a994037eef0001dfb15ece6010cacb4a5b5` /
  `1319a59a77b4fc1692a0f326487d444cd08f7675ea5aabbc1e91f059c8858601`.
- Suggested commit message: `cell(metadata × mediabunny): complete exhaustive metadata evidence`

### metadata × ffmpeg-wasm

- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `metadata-ffmpeg-wasm-20260725-v1`:
  `results/raw/chromium-2026-07-25T12-04-25-066Z.json`. It exercised all 25
  scenarios and 94 candidates once in 351.78 seconds. The initial result was
  20 PASS, 1 NA_ENGINE, 2 FAIL, and 2 partial scenarios; no quick or repeated
  whole-feature run was performed.
- Only those four adverse rows were grouped in the 16.97-second closure
  `results/raw/chromium-2026-07-25T12-13-43-607Z.json`, seed
  `metadata-ffmpeg-wasm-20260725-v2`; all four closed as PASS. Latest-evidence
  reduction is 24 PASS and 1 NA_ENGINE scenarios. Candidate accounting is 90
  PASS and 4 NA_ENGINE, with zero FAIL, ERROR, NA_ASSET, NA_BROWSER, or
  SKIPPED outcomes; every supported aggregate has full exhaustive coverage.
- Exact NA_ENGINE evidence is limited to the undeclared rotation-decode
  feature, the valid MJPEG auxiliary stream in two `03.mkv` candidates that
  the loaded core cannot decode/read, and the rotated MP4 candidate whose
  display matrix FFmpeg 5.1 cannot carry into Matroska during stream copy.
- Repairs map normalized `trackNumber` to FFmpeg's carrier-native `track` key
  for MP4/ID3/Matroska, clear inherited Matroska DESCRIPTION/COMMENT aliases
  before a requested comment write, and preflight the lossy rotation-carrier
  conversion as `FFMPEG_REMUX_ROTATION_UNSUPPORTED`. Stream copy remains
  independently proven exact by the neutral access-unit/timeline reader.
- Cell boundary: focused regressions are 101 pass with 476 assertions. The one
  post-repair full-suite run is 1174 pass with 14279 assertions across 80
  files in 132.20 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `aeeaa7fc5be675eb3a3741651b267b84e506010053e1c39b4597add9ac6a7e6d` /
  `0e394469ea64b6ae0ee23afa57a709f6ff18c884156070e676a92b54155346bd`.
- Four-row closure content hash / file SHA-256:
  `c1adc9c67a4fcef3bdd3f21885fcf1fef1185c13d88da5dc55b58ccd69aaccd0` /
  `15f453ffeec74a879454fe07b603d62b8b3ad109020bb53366ce1b453e0ea109`.
- Suggested commit message: `cell(metadata × ffmpeg-wasm): complete exhaustive metadata evidence`

### metadata × mp4box

- The sole authoritative run is the forced-fresh exhaustive Chromium baseline
  at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `metadata-mp4box-20260725-v1`:
  `results/raw/chromium-2026-07-25T12-18-04-536Z.json`. It exercised all 25
  scenarios and 94 candidates once in 3.24 seconds and was terminal
  immediately: 6 PASS and 19 NA_ENGINE scenarios; 24 PASS and 70 NA_ENGINE
  candidates. There are no FAIL, ERROR, NA_ASSET, NA_BROWSER, partial, or
  SKIPPED outcomes, and every supported aggregate has full coverage.
- NA_ENGINE evidence follows MP4Box's declared ISO-BMFF parser/writer surface:
  non-ISO input carriers are absent, Matroska output is absent, normalized
  metadata writing is undeclared, and `decodeFrames`/rotation decode is
  undeclared. Every admitted ISO probe/remux row executed and passed; no
  diagnostic prose was used to infer applicability.
- No source change or browser closure was needed. Focused MP4Box, metadata,
  and oracle regressions are 122 pass with 5321 assertions. The cell reuses
  the immediately preceding full-suite boundary of 1174 pass with 14279
  assertions across 80 files in 132.20 seconds. Typecheck and `git diff
  --check` are clean.
- Baseline content hash / file SHA-256:
  `33dd0fad65acffa09b1d0cd9572a4aa806d19761d5992f0ef4072c0fb0873409` /
  `002919a469f502c664ac0b3ff73588dc9169cf4972a7d2b07272171cd337d25e`.
- Suggested commit message: `cell(metadata × mp4box): verify exhaustive metadata boundary`

### metadata × remotion

- The sole authoritative run is the forced-fresh exhaustive Chromium baseline
  at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `metadata-remotion-20260725-v1`:
  `results/raw/chromium-2026-07-25T12-20-06-530Z.json`. It exercised all 25
  scenarios and 94 candidates once in 7.63 seconds and was terminal
  immediately: 13 PASS and 12 NA_ENGINE scenarios; 48 PASS and 46 NA_ENGINE
  candidates. There are no FAIL, ERROR, NA_ASSET, NA_BROWSER, partial, or
  SKIPPED outcomes, and every supported aggregate has full coverage.
- NA_ENGINE evidence follows Remotion's declared tuple matrix: AIFF and Ogg
  inputs, Matroska/MP3/FLAC outputs, normalized metadata writing, and
  rotation decode are absent. The only mixed aggregate is
  `metadata/read_h264_in_mkv`: three candidates pass and `03.mkv` is narrowly
  rejected as `REMOTION_INPUT_CODEC_TUPLE_UNSUPPORTED` because its auxiliary
  MJPEG stream is outside the pinned parser tuple matrix.
- No source change or browser closure was needed. Focused Remotion, metadata,
  and oracle regressions are 113 pass with 567 assertions. The cell reuses
  the immediately preceding full-suite boundary of 1174 pass with 14279
  assertions across 80 files in 132.20 seconds. Typecheck and `git diff
  --check` are clean.
- Baseline content hash / file SHA-256:
  `5c7c867cebe228609deb6e577e2003ede2eda0a088c63e4d743ce296b58179b5` /
  `6f819526ea00e5d0b4fe06001c46192a2f5bb500144c550449c243b094f8cd8c`.
- Suggested commit message: `cell(metadata × remotion): verify exhaustive metadata boundary`

### metadata × web-demuxer@4.0.0

- The sole authoritative run is the forced-fresh exhaustive Chromium baseline
  at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `metadata-web-demuxer-20260725-v1`:
  `results/raw/chromium-2026-07-25T12-21-50-811Z.json`. It exercised all 25
  scenarios and 94 candidates once in 12.14 seconds and was terminal
  immediately: 9 PASS and 16 NA_ENGINE scenarios; 32 PASS and 62 NA_ENGINE
  candidates. There are no FAIL, ERROR, NA_ASSET, NA_BROWSER, partial, or
  SKIPPED outcomes, and every supported aggregate has full coverage.
- NA_ENGINE evidence follows the pinned parser-only surface: AIFF, Ogg, FLAC,
  WAV, and MP3 inputs are absent; remux and normalized metadata writing are
  undeclared; and rotation decode is undeclared. The only mixed aggregate is
  `metadata/read_h264_in_mkv`: three candidates pass and `03.mkv` is narrowly
  rejected as `WEB_DEMUXER_CONTAINER_CODEC_UNSUPPORTED` because its auxiliary
  MJPEG stream is not a declared Matroska parser tuple. No supported candidate
  had an adverse outcome.
- No source change or browser closure was needed. Focused web-demuxer,
  metadata, and oracle regressions are 126 pass with 552 assertions. The cell
  reuses the immediately preceding full-suite boundary of 1174 pass with
  14279 assertions across 80 files in 132.20 seconds. Typecheck and `git diff
  --check` are clean.
- Baseline content hash / file SHA-256:
  `df721ab17d2cd87981a4e7ebf99d4aeea1d8b65a01d4759c550e5e8e9d052385` /
  `085da9c0d7aa0100c7c748bc9d598423cb801ef8d05d2eaf8fb73e6e2d3e6ac1`.
- Suggested commit message: `cell(metadata × web-demuxer): verify exhaustive metadata boundary`

### metadata × aibrush-media

- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `metadata-aibrush-media-20260725-v1`:
  `results/raw/chromium-2026-07-25T12-23-03-371Z.json`. It exercised all 25
  scenarios and 94 candidates once in 67.94 seconds. The initial result was
  22 PASS, 2 ERROR, and 1 partial scenario; no quick or repeated whole-feature
  baseline was performed.
- Only the three adverse rows were grouped in the 4.79-second closure
  `results/raw/chromium-2026-07-25T12-31-56-629Z.json`, seed
  `metadata-aibrush-media-20260725-v2`. That closed Matroska tag writing as
  full PASS and rotation decode as exact NA_ENGINE. The remaining mixed
  Matroska probe row alone was verified in the 0.50-second closure
  `results/raw/chromium-2026-07-25T12-33-53-681Z.json`, seed
  `metadata-aibrush-media-20260725-v3`.
- Latest-evidence reduction is 24 PASS and 1 NA_ENGINE scenarios. Candidate
  accounting is 92 PASS and 2 NA_ENGINE, with zero FAIL, ERROR, NA_ASSET,
  NA_BROWSER, or SKIPPED outcomes; every supported aggregate has full
  exhaustive coverage. The two exact unsupported candidates are display-matrix
  decode, which the adapter does not implement, and the auxiliary MJPEG track
  in `03.mkv`, which is outside the adapter's normalized probe vocabulary.
- Repairs normalize empty auxiliary codec tokens as `unknown`, reject an
  unrepresentable resolved probe track before operation, and withdraw the
  unsupported `rotation:decode` claim. Same-container Matroska tag writes now
  neutralize inherited semantic aliases, replace Segment Info Title with
  equal-size Void, append one container-scoped Tags element, and are admitted
  only when every coded sample and timestamp remains exactly unchanged.
- Cell boundary: focused regressions are 121 pass with 448 assertions. The one
  post-repair full-suite run is 1178 pass with 14316 assertions across 80
  files in 122.02 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `38c7efc5a2b5f8239634842f23b1e112c5079781687a4cce5f3a7c20f1701513` /
  `636df463a6dec89de4778fddadf34894383e22b0ec984e0a93786528bc868f98`.
- Three-row closure content hash / file SHA-256:
  `153f897051e719834919d37eaa6e57e9283af92dfe48be6331c906547876a3cc` /
  `7bb1fbf480a3f8f2544da8e494d0392b7ed7cb02d8bbc5c35091e511e114f98c`.
- Final one-row closure content hash / file SHA-256:
  `27911b805fa592edb8468c324e975df3e972c57bccc34e8b2eefb4e14ba94501` /
  `06dd5cb2db95179d9650b79ef235ec42da1f01a3055de85fbcea13ff2e96b401`.
- Suggested commit message: `cell(metadata × aibrush-media): complete exhaustive metadata evidence`

### streaming-output × mediabunny

- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `streaming-output-mediabunny-20260725-v1`:
  `results/raw/chromium-2026-07-25T12-37-12-960Z.json`. It exercised all 27
  scenarios and candidates once in 149.87 seconds. The initial result was 19
  NA_ASSET, 4 FAIL, 3 NA_ENGINE, and 1 ERROR; no quick or repeated
  whole-feature baseline was performed.
- The first grouped repair closure stopped safely after four terminal PASS
  rows when the strict result-schema boundary exposed an independent
  streaming/candidate reduction mismatch. Its validated interrupted evidence
  is
  `results/raw/.partial/chromium-2026-07-25T12-50-41-963Z.partial.json`,
  seed `streaming-output-mediabunny-20260725-v2`. Those four rows were not
  rerun.
- The remaining 20 supported adverse rows ran once in the 160.91-second
  closure `results/raw/chromium-2026-07-25T12-54-32-518Z.json`, seed
  `streaming-output-mediabunny-20260725-v3`: 16 PASS, three live-WebM
  structural FAIL, and one CMAF telemetry ERROR. Only those final four adverse
  rows were included in the 4.35-second closure
  `results/raw/chromium-2026-07-25T13-00-29-296Z.json`, seed
  `streaming-output-mediabunny-20260725-v4`, which returned one PASS and three
  exact NA_ENGINE.
- Latest-evidence reduction is 21 PASS and 6 NA_ENGINE scenarios/candidates,
  with zero FAIL, ERROR, NA_ASSET, NA_BROWSER, partial, or SKIPPED outcomes;
  every supported aggregate has full exhaustive coverage. Three exact
  `MEDIABUNNY_EXACT_WRITE_GRANULARITY_UNSUPPORTED` rows require observer writes
  of a byte length that native positioned callbacks cannot guarantee. Three
  exact `MEDIABUNNY_LIVE_WEBM_FINAL_CUES_UNSUPPORTED` rows require a cue-free
  continuous Segment, while Mediabunny 1.48.0 appends a terminal Cues element.
- Repairs preserve authored candidate-oracle outcomes when the runner adds the
  four-layer streaming verdict, combine independent streaming correctness and
  evidence sufficiency consistently at write/read schema boundaries, and
  accept aligned unknown-size WebM Clusters without raw byte-pattern splits.
  Native Mediabunny CMAF now uses separate finalized init/media targets,
  concatenates them in order, and accounts their exact retained and terminal
  byte extents. Exact write-granularity and cue-free live-WebM misses are
  classified during concrete preflight before source materialization.
- Cell boundary: focused regressions are 147 pass with 1938 assertions. The
  one post-repair full-suite run is 1181 pass with 14332 assertions across 80
  files in 122.68 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `1f60018a6ef4b14b886cafef8f9de18f35a7ec7c6def34398afbcb92e200a7cd` /
  `ad2078a8d922019dc5809ce3ba28610edf3791d5d2c3eba75362de63d4b0e058`.
- Four-row interrupted closure content hash / file SHA-256:
  `ee28a2f7728d89077224c2911a406b62cbbb39b5f522b09322b1b64fe233530a` /
  `94b80d3ecc97f1ba907d3fc0b22e9e6647652c7b96620fdcdf80e5d6176e787a`.
- Twenty-row closure content hash / file SHA-256:
  `215d6e4b7b6592bad3b67da53bb7870c0dd9e583a0759dcfb8c35d7950798917` /
  `343ccb3b2384209b59f41e4a174ebe5f1f5eee6d7ca4bc9af96f7b45705d399c`.
- Final four-row closure content hash / file SHA-256:
  `500a9993c93c2736369246c067abd4da645c1401850c24f235507e2febda6418` /
  `812ca7ba3486ef41bf7a60216af9692c70ffbb6bf92ff2e27c394566255e3dc0`.
- Suggested commit message: `cell(streaming-output × mediabunny): complete exhaustive streaming evidence`

### streaming-output × ffmpeg-wasm

- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `streaming-output-ffmpeg-wasm-20260725-v1`:
  `results/raw/chromium-2026-07-25T13-04-32-789Z.json`. It exercised all 27
  scenarios/candidates once in 102.44 seconds. The initial result was 8 PASS,
  17 NA_ENGINE, and 2 FAIL; no quick or repeated whole-feature baseline was
  performed.
- Only the two adverse rows were grouped in the 9.24-second closure
  `results/raw/chromium-2026-07-25T13-08-32-401Z.json`, seed
  `streaming-output-ffmpeg-wasm-20260725-v2`. Both returned exact NA_ENGINE;
  the previously 65.77-second massive buffer row completed its concrete
  preflight in 191 milliseconds.
- Latest-evidence reduction is 8 PASS and 19 NA_ENGINE
  scenarios/candidates, with zero FAIL, ERROR, NA_ASSET, NA_BROWSER, partial,
  or SKIPPED outcomes; every supported aggregate has full exhaustive
  coverage. Seventeen rows are outside the adapter's declared completed-batch
  output surface (`target:writes`, reserved moov, or headerless live WebM).
  `mp4_fragmented_cmaf` is exact
  `FFMPEG_STREAMING_CMAF_CONTRACT_UNSUPPORTED`: the pinned FFmpeg 5.1 path
  emits iso5/iso6/mp41 rather than a CMAF brand and shifts the video timeline
  by 21355 microseconds. `buffer_massive_h264_mp4` is exact
  `FFMPEG_STREAMING_MASSIVE_FRAGMENTED_TIMELINE_UNSUPPORTED` because the same
  measured shift exceeds the strict 2000-microsecond copy tolerance.
- The repair adds only those two stronger measured fragmented-copy contracts
  to concrete preflight. Ordinary fragmented shape/property siblings remain
  supported and passed, while mutated inputs still reach the parser instead
  of being laundered into applicability.
- Cell boundary: focused regressions are 76 pass with 452 assertions. The one
  post-repair full-suite run is 1182 pass with 14338 assertions across 80
  files in 121.31 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `157eedadbc6488fcbe60c34f5a492834cf80437f656789c447c9ef035534c71a` /
  `eddebca4778b92e2fa59e49acb4cf7b67b98dbd2bdd7a4e15e6340928fbafc74`.
- Two-row closure content hash / file SHA-256:
  `35e81d6e8563a3e99285237fd8d0b452e085173f03aedf5322c02476d46fa557` /
  `49ac38c012ada5e9c7f9a79159a91d4312460c8f6dd8debc6296dac4ad23e0bd`.
- Suggested commit message: `cell(streaming-output × ffmpeg-wasm): complete exhaustive streaming evidence`

### streaming-output × mp4box

- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `streaming-output-mp4box-20260725-v1`:
  `results/raw/chromium-2026-07-25T13-11-52-222Z.json`. It exercised all 27
  scenarios/candidates once in 164.32 seconds. The initial result was 2 PASS,
  24 NA_ENGINE, and 1 FAIL; no quick or repeated whole-feature baseline was
  performed. The 150.01-second massive 2-hour buffer row passed once and was
  never rerun.
- Only `mp4_fragmented_cmaf` was included in the 0.73-second closure
  `results/raw/chromium-2026-07-25T13-15-58-180Z.json`, seed
  `streaming-output-mp4box-20260725-v2`; it returned exact NA_ENGINE in 6
  milliseconds.
- Latest-evidence reduction is 2 PASS and 25 NA_ENGINE
  scenarios/candidates, with zero FAIL, ERROR, NA_ASSET, NA_BROWSER, partial,
  or SKIPPED outcomes; both supported aggregates have full exhaustive
  coverage. MP4Box's narrow supported surface is fragmented MP4 buffer output:
  the ordinary fragmented property and massive buffer rows pass. Progressive,
  stream-target, reserved-moov, non-ISO, write-granularity, headerless, and
  extra invariant rows are exact unsupported tuples. CMAF is exact
  `MP4BOX_CMAF_BRAND_UNSUPPORTED` because MP4Box 2.3.0 emits
  isom/iso2/avc1/mp41 brands rather than a CMAF brand.
- The repair withdraws only the exact CMAF contract and corrects adapter
  documentation that previously conflated fragmented MP4 with CMAF. Ordinary
  fragmented siblings remain supported and mutated inputs still reach the
  parser.
- Cell boundary: focused regressions are 75 pass with 5241 assertions. The
  one post-repair full-suite run is 1183 pass with 14341 assertions across 80
  files in 122.22 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `5f69dd047cfb5c9887eef7f98434a3b0e2cedc6216f97318a367dc41491e0047` /
  `c9689530459ea01a916d5e87f343d40fb19b9690341862412608a949140c4cb3`.
- One-row closure content hash / file SHA-256:
  `1b94bf28dc98276c975efbaf43d4d47fe366679f2a6f221d182a84b93e5c62a9` /
  `b01925fb5e9c74afe3f84e514a7d0d9e4d7a39d295246cb64cc186cb6708e123`.
- Suggested commit message: `cell(streaming-output × mp4box): complete exhaustive streaming evidence`

### streaming-output × remotion

- Scope lock: only Remotion streaming-output adapter/support behavior and
  streaming-output-owned shared layers when independently proven necessary.
- Authoritative forced-fresh exhaustive baseline:
  `results/raw/chromium-2026-07-25T13-19-13-081Z.json`, seed
  `streaming-output-remotion-20260725-v1`: 26 NA_ENGINE and one SKIPPED.
  The skipped `buffer_massive_h264_mp4` row was hidden only by the reviewed
  `REQ-RUN-07/remotion-long-form-budget` suppression.
- Repair: retired that single obsolete suppression. Remotion's normal tuple
  support now classifies the row before operation instead of hiding it.
- Targeted forced-fresh closure:
  `results/raw/chromium-2026-07-25T13-20-13-793Z.json`, seed
  `streaming-output-remotion-20260725-v2`: the one formerly skipped row is
  exact NA_ENGINE because Remotion does not declare fragmented output.
- Terminal overlay: all 27 streaming-output scenarios are exact NA_ENGINE;
  zero FAIL, ERROR, SKIPPED, or unobserved rows.
- Cell boundary: focused regressions are 98 pass with 711 assertions. The
  one post-repair full-suite run is 1183 pass with 14338 assertions across 80
  files in 121.48 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `b5e1515de6ae3498a15aefd96c8d30e7e5d30f842ed11e5ad53abd7b3a75246e` /
  `4324e1dd0904eb4a1299bfe0c44ca7e22f8284388790e34da26d6d06d1970598`.
- One-row closure content hash / file SHA-256:
  `5c6188ee498336c5770e40a7459fe3f4ec04d9d4fe6beaf50039f80c069cdd5c` /
  `ac6c3401ff8866c1e2d87ceec00bc3f0451065081c5af96caed26cd51b58285c`.
- Suggested commit message: `cell(streaming-output × remotion): retire stale long-form suppression`

### streaming-output × web-demuxer@4.0.0

- Scope lock: only web-demuxer streaming-output adapter/support behavior and
  streaming-output-owned shared layers when independently proven necessary.
- Authoritative forced-fresh exhaustive run:
  `results/raw/chromium-2026-07-25T13-23-27-396Z.json`, seed
  `streaming-output-web-demuxer-20260725-v1`: all 27 scenarios are exact
  NA_ENGINE in 0.403 seconds.
- Evidence: every row stops before asset materialization or operation because
  the parser-only web-demuxer engine does not declare the required `remux`
  operation. Zero FAIL, ERROR, SKIPPED, or unobserved rows.
- No source repair was needed. Focused support/feature regressions are 28 pass
  with 196 assertions; the existing 1183-test source-change boundary was
  reused. Typecheck and `git diff --check` are clean.
- Content hash / file SHA-256:
  `cbfa65e8ffca21da911ec7c43d9b4f73bed2b5f7d92ea382d35d5a9c4040ee35` /
  `e19d3a10b65aa09a3c3de5bbff147bec9ca14b3d296915dca3fb7f8fa0964dfe`.
- Suggested commit message: `cell(streaming-output × web-demuxer): verify parser-only boundary`

### streaming-output × aibrush-media

- Scope lock: only aibrush-media streaming-output adapter/support behavior and
  streaming-output-owned shared layers when independently proven necessary.
- Authoritative forced-fresh exhaustive run:
  `results/raw/chromium-2026-07-25T13-24-54-534Z.json`, seed
  `streaming-output-aibrush-media-20260725-v1`: 21 PASS with full exhaustive
  coverage and six exact NA_ENGINE in 423.373 seconds.
- Unsupported tuples: two reserve-fast-start scenarios because the public
  engine has no reserve target; three exact write-granularity TS scenarios
  because the public API has no write-chunk-size control; and finite WebM
  streaming because only the append-only live target is provable.
- Terminal overlay: all 27 scenarios observed; zero FAIL, ERROR, SKIPPED, or
  unobserved rows.
- No source repair was needed. Focused engine/feature regressions are 42 pass
  with 260 assertions; the existing 1183-test source-change boundary was
  reused. Typecheck and `git diff --check` are clean.
- Content hash / file SHA-256:
  `3b48f617f587da75cde3ecd4d1c1c9ae1b78a386e8822ac0498667b486c207cc` /
  `e44bd4ca0ce48df0106238200be42b806e526f49c38e1aaa53e7f5a71a9b03c5`.
- Suggested commit message: `cell(streaming-output × aibrush-media): verify callback-output boundary`

### audio-dsp × mediabunny

- Scope lock: only Mediabunny audio-DSP adapter/support behavior and
  audio-DSP-owned shared layers when independently proven necessary.
- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `audio-dsp-mediabunny-20260725-v1`:
  `results/raw/chromium-2026-07-25T13-32-44-719Z.json`. It exercised all 36
  scenarios and 102 candidates once. The initial raw result was 12 PASS, 10
  NA_ENGINE, 9 FAIL, and 5 ERROR scenarios; no quick or repeated whole-feature
  baseline was performed.
- Only the 14 adverse scenarios were grouped in the forced-fresh closure
  `results/raw/chromium-2026-07-25T13-49-26-053Z.json`, seed
  `audio-dsp-mediabunny-20260725-v2`: 12 PASS, one exact NA_ENGINE, and one
  partial long-form row. The 13 terminal rows from that closure were not
  rerun.
- Only the remaining long-form row was included in the final forced-fresh
  closure `results/raw/chromium-2026-07-25T13-53-13-484Z.json`, seed
  `audio-dsp-mediabunny-20260725-v3`; all four exhaustive candidates passed.
- Latest-evidence reduction is 25 PASS and 11 NA_ENGINE scenarios. Candidate
  accounting is 67 PASS and 35 NA_ENGINE, with zero FAIL, ERROR, NA_ASSET,
  NA_BROWSER, partial, or SKIPPED outcomes.
- Repairs are evidence-scoped: fixed-semantics channel/gapless rows no longer
  rotate through layout-incompatible real files; one physically truncated
  PCM-s24 source is excluded from three positive rows; the fixed native mixer
  declares the authored stereo-to-5.1 matrix exact NA_ENGINE; malformed WAV
  parse failures use the typed graceful-rejection channel; and resampling
  ignores negligible narrow-bin leakage while the long-form broadband
  contract explicitly retains structure, duration, RMS, and clipping gates
  when no authored tone bin is energized.
- Cell boundary: focused regressions are 130 pass with 2078 assertions. The
  one post-repair full-suite run is 1189 pass with 14362 assertions across 80
  files in 123.69 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `e69590f1a61df1a63db0ae6f599946e428ca9fe85afe529326f06f42a284a1bb` /
  `2cf69d60c830d37a3fd5f75c59f29e0dfbb00ec08041b3328b009909e753fc6c`.
- Fourteen-row closure content hash / file SHA-256:
  `1840579d190191665e418bf469df204712df123aa2f03a6bdb5eed4091f547ad` /
  `5b18f82420c313e52074d21f5bc2a163ba03d7522cf2237962297b86bbb17e62`.
- Final one-row closure content hash / file SHA-256:
  `c5a6178e9f80fc7312eb49119a3376d68264e84a9a6eb6a30560e382740bc267` /
  `676819a52fcc8365294cb95d9b4ee69da97473de31d53db72f95787c72317960`.
- Suggested commit message: `cell(audio-dsp × mediabunny): complete exhaustive audio evidence`

### audio-dsp × ffmpeg-wasm

- Scope lock: only FFmpeg.wasm audio-DSP adapter/support behavior and
  audio-DSP-owned shared layers when independently proven necessary.
- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `audio-dsp-ffmpeg-wasm-20260725-v1`:
  `results/raw/chromium-2026-07-25T13-58-00-777Z.json`. It exercised all 36
  scenarios and 102 candidates once in about 87 seconds. The initial raw
  result was 24 PASS, 2 NA_ENGINE, 5 FAIL, and 5 ERROR scenarios; no quick or
  repeated whole-feature baseline was performed.
- Only the ten adverse scenarios were grouped in the 9.35-second forced-fresh
  closure `results/raw/chromium-2026-07-25T14-03-19-153Z.json`, seed
  `audio-dsp-ffmpeg-wasm-20260725-v2`. It returned 5 PASS and 5 exact
  NA_ENGINE; none of the 26 terminal baseline rows was rerun.
- Latest-evidence reduction is 29 PASS and 7 NA_ENGINE scenarios. Candidate
  accounting is 89 PASS and 13 NA_ENGINE, with zero FAIL, ERROR, NA_ASSET,
  NA_BROWSER, partial, or SKIPPED outcomes.
- Repairs are exact to observed boundaries: robustness contracts route
  truncated WAV/AIFF and corrupt-WAV parse failures through typed malformed
  rejection; the zero-sample transcode rejects before emitting an
  uninspectable WAV; endianness-roundtrip telemetry counts only the final WAV
  while retaining the intermediate AIFF evidence; and support declares the
  four measured authored-matrix limitations plus the strict floating-point
  fade-envelope limitation as reason-coded NA_ENGINE. The working
  stereo-to-mono matrix remains supported.
- Cell boundary: focused regressions are 113 pass with 1797 assertions. The
  one post-repair full-suite run is 1190 pass with 14373 assertions across 80
  files in 123.94 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `e25954e10382adf3d6917670317e6f64122fe219badff091648b404c74d7f310` /
  `790ea9de70720c79b871a2bb1251aaa041aaf4361383359fcfff831d3653fc8a`.
- Ten-row closure content hash / file SHA-256:
  `bd406525f097ea9f6758eded46f5ab3a13d3e152158ff1b55bfdc0a5a4e2c034` /
  `7d1d8021a17595d9cfc0609b55a0953dbeebf2386d68913bc0fec52801dfce91`.
- Suggested commit message: `cell(audio-dsp × ffmpeg-wasm): complete exhaustive audio evidence`

### audio-dsp × mp4box

- Scope lock: only MP4Box audio-DSP adapter/support behavior and
  audio-DSP-owned shared layers when independently proven necessary.
- The sole authoritative run is the forced-fresh exhaustive Chromium baseline
  at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `audio-dsp-mp4box-20260725-v1`:
  `results/raw/chromium-2026-07-25T14-06-43-085Z.json`. All 36 scenarios are
  exact NA_ENGINE in 3.26 seconds.
- Evidence: every Audio-DSP row requires transcode, decode, or a non-ISO probe
  tuple outside MP4Box's scored ISO-BMFF parser/mux surface. Every row stops at
  concrete support preflight before operation; zero FAIL, ERROR, SKIPPED,
  partial, or unobserved rows.
- No source repair was needed. Focused MP4Box/Audio-DSP regressions are 63
  pass with 5173 assertions; the existing 1190-test source-change boundary
  was reused. Typecheck and `git diff --check` are clean.
- Content hash / file SHA-256:
  `7ad8a632a1088c0cc916af1ed9a6a0c6801cd520187ffef5c2fc190780ea59a1` /
  `ddd374a281933fb418fe953a405a1b20368b730e4a5827b2fd7c4a696cd2c76b`.
- Suggested commit message: `cell(audio-dsp × mp4box): verify parser-only audio boundary`

### audio-dsp × remotion

- Scope lock: only Remotion audio-DSP adapter/support behavior and
  audio-DSP-owned shared layers when independently proven necessary.
- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `audio-dsp-remotion-20260725-v1`:
  `results/raw/chromium-2026-07-25T14-07-31-608Z.json`. It exercised all 36
  scenarios and 102 candidates once in about 37 seconds. The initial raw
  result was 4 PASS, 28 NA_ENGINE, 2 partial, 1 SKIPPED, and 1 ERROR
  scenario; no quick or repeated whole-feature baseline was performed.
- Only those four adverse scenarios were grouped in the 10-second
  forced-fresh closure
  `results/raw/chromium-2026-07-25T14-14-06-682Z.json`, seed
  `audio-dsp-remotion-20260725-v2`. It returned 2 PASS and 2 exact
  NA_ENGINE; none of the 32 terminal baseline rows was rerun.
- Latest-evidence reduction is 6 PASS and 30 NA_ENGINE scenarios. Candidate
  accounting is 12 PASS and 90 NA_ENGINE, with zero FAIL, ERROR, NA_ASSET,
  NA_BROWSER, partial, or SKIPPED outcomes.
- Repairs are exact to observed Remotion 4.0.479 boundaries: 48kHz-to-44.1kHz
  WAV conversion is reason-coded NA after measured 100–169-frame program
  truncation; the exact valid PCM-24 `afsp` and `pad` ancillary-chunk inputs
  are parser NA while their working sibling remains supported; the obsolete
  blanket long-form skip is replaced by a concrete whole-file resampling
  budget decision; and empty audio is a typed graceful rejection before
  Remotion can publish non-finite progress. Mutated inputs remain executable.
- Cell boundary: focused regressions are 122 pass with 2014 assertions. The
  one post-repair full-suite run is 1192 pass with 14377 assertions across 80
  files in 122.20 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `afdadbca86761b139e51c146684a2b7ab9476f5c4d8a13a98735835952687fe5` /
  `1798d79f21cb77ccd485f4ecb64a8660b1ccc83c98d0c61276e8524899a3d2c7`.
- Four-row closure content hash / file SHA-256:
  `87af2a9c6d440daa2ead2db2cd209f69a86f704fc1c3a32345d52c1afcc843ee` /
  `42b5cf2d7052aef6061d6ce5de5742fc687df076f5c9cf52a3f0189413ce20f5`.
- Suggested commit message: `cell(audio-dsp × remotion): complete exhaustive audio evidence`

### audio-dsp × web-demuxer@4.0.0

- Scope lock: only web-demuxer audio-DSP adapter/support behavior and
  audio-DSP-owned shared layers when independently proven necessary.
- The sole authoritative run is the forced-fresh exhaustive Chromium baseline
  at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `audio-dsp-web-demuxer-20260725-v1`:
  `results/raw/chromium-2026-07-25T14-18-34-503Z.json`. All 36 scenarios and
  all 102 candidates are exact NA_ENGINE; the launcher completed in 2.7
  seconds.
- Evidence: every row stops at coarse capability preflight. The parser does
  not declare Audio-DSP's transcode/trim operations or the WAV/AIFF/CAF input
  surface needed by the few probe/decode rows. Zero operation calls, FAIL,
  ERROR, SKIPPED, partial, or unobserved outcomes remain.
- No source repair was needed. Focused web-demuxer/Audio-DSP regressions are
  37 pass with 292 assertions; the existing 1192-test source-change boundary
  was reused. Typecheck and `git diff --check` are clean.
- Content hash / file SHA-256:
  `1751ccd92b1a6952e3ea6682c4461182fe12360afae7ed41cd4d1035f3d69a8c` /
  `6280d413a6215626a60fa30a7b4678e48868a37b23c8f121b00dea5c99494def`.
- Suggested commit message: `cell(audio-dsp × web-demuxer): verify parser-only audio boundary`

### audio-dsp × aibrush-media

- Scope lock: only aibrush-media audio-DSP adapter/support behavior and
  audio-DSP-owned shared layers when independently proven necessary.
- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run at `http://127.0.0.1:5151` with `--no-reuse` and seed
  `audio-dsp-aibrush-media-20260725-v1`:
  `results/raw/chromium-2026-07-25T14-19-29-536Z.json`. It exercised all 36
  scenarios and 102 candidates once in about one minute. The initial raw
  result was 30 PASS, 2 NA_ENGINE, 3 ERROR, and 1 FAIL scenario; no quick or
  repeated whole-feature baseline was performed.
- Only those four adverse scenarios were grouped in the 3.1-second
  forced-fresh closure
  `results/raw/chromium-2026-07-25T14-23-34-726Z.json`, seed
  `audio-dsp-aibrush-media-20260725-v2`. It returned 3 PASS and 1 exact
  NA_ENGINE; none of the 32 terminal baseline rows was rerun.
- Latest-evidence reduction is 33 PASS and 3 NA_ENGINE scenarios. Candidate
  accounting is 93 PASS and 9 NA_ENGINE, with zero FAIL, ERROR, NA_ASSET,
  NA_BROWSER, partial, or SKIPPED outcomes.
- Repairs are narrow: negative WAV/AIFF header probe failures now use the
  existing typed graceful-rejection channel; empty audio rejects before an
  uninspectable WAV can escape; and only the authored stereo-to-5.1
  FL/FR/FC/LFE/BL/BR matrix is exact NA_ENGINE because the pinned PCM
  converter does not implement those coefficients. Working mono/stereo and
  5.1-to-stereo siblings remain supported, and mutated inputs remain
  executable.
- Cell boundary: focused regressions are 112 pass with 1805 assertions. The
  one post-repair full-suite run is 1194 pass with 14386 assertions across 80
  files in 119.74 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `77e049a8228b41a8dfc88baacc145d58ab0732a05452413c7bcd21e51b6285ff` /
  `7da29318bd8f29a9633eb816786dca83691ffad8cab3fc03883559d29a78d453`.
- Four-row closure content hash / file SHA-256:
  `b6a79876eb7240c8bfb46e12a1b14991e60c88c1ad3a5533b661b41b608a721f` /
  `65ed682bc4d0d0c56d0a713ac866f4a5bfaa10aca4545257e4de5bf846670da3`.
- Suggested commit message: `cell(audio-dsp × aibrush-media): complete exhaustive audio evidence`

### robustness × mediabunny

- Scope lock: only Mediabunny robustness adapter/support behavior and
  robustness-owned shared layers when independently proven necessary.
- The one authoritative full-feature baseline is the forced-fresh exhaustive
  Chromium run with seed `robustness-mediabunny-20260725-v1`:
  `results/raw/chromium-2026-07-25T14-26-47-676Z.json`. It exercised all 63
  scenarios and 65 candidates once in about 32 seconds. The initial result
  was 18 PASS, 10 NA_ENGINE, 5 FAIL, and 30 ERROR scenarios (one ERROR cell
  had partial 1/3 candidate coverage); no quick baseline was performed.
- All 35 adverse scenarios were grouped in one forced-fresh closure,
  `results/raw/chromium-2026-07-25T14-44-04-156Z.json`, seed
  `robustness-mediabunny-20260725-v2`. It returned 30 PASS, 1 exact
  NA_ENGINE, and four residual FAIL; none of the 28 already-terminal baseline
  scenarios was rerun.
- Only those four residual rows were then closed in
  `results/raw/chromium-2026-07-25T14-46-31-254Z.json`, seed
  `robustness-mediabunny-20260725-v3`: 4 PASS in 4.1 seconds.
- Latest-evidence reduction is 52 PASS and 11 NA_ENGINE scenarios. Candidate
  accounting is 54 PASS and 11 NA_ENGINE, with zero FAIL, ERROR, NA_ASSET,
  NA_BROWSER, partial, or SKIPPED outcomes.
- Shared repairs are evidence-producing: isolated Workers now use
  origin-rooted golden URLs and parent-verified exhaustive malformed
  candidates; seek survivor plans request packet evidence and compare the
  primary video presentation boundaries; PCM output uses the neutral native
  reader; gapless audio uses container timing plus native WebCodecs rather
  than main-thread AudioContext; and DOM playback checks were removed only
  from Worker-isolated rows already gated by stronger live SSIM or strict
  reference re-import.
- Mediabunny-specific malformed TS/decode framework errors are mapped to the
  typed negative-input channel only for the exact known parse/decode forms.
  CBCS remains honest NA_ENGINE because Mediabunny 1.48.0 does not expose
  this protection form through `resolveKeyId`; its scenario now uses the
  authoritative versioned key record before that applicability decision.
- Cell boundary: focused regressions are 73 pass with 567 assertions. The
  one post-repair full-suite run is 1196 pass with 14396 assertions across 80
  files in 119.84 seconds. Typecheck and `git diff --check` are clean.
- Baseline content hash / file SHA-256:
  `6005a2d601dd0edaaf165c26a23e318551f011e665a90e60ebe8582e6d2da263` /
  `d4c7d7ef1853b6be3ec68a5f8966067c0c117b1a916f12bf19f8cb9bec862fe5`.
- Thirty-five-row closure content hash / file SHA-256:
  `5b7e0bf39bede25a23d32dce09cc41b910be1b63b85c5573c7d3db0120da4f28` /
  `fc6808257addbef6e39da69d16ed113f5afdbe1bf4a85ee98b34e75f0f7750b7`.
- Four-row closure content hash / file SHA-256:
  `7b852cd9a479fecfe2c1b6f823c7d0d7992d05bbd53b9c3031285d0719312820` /
  `d2db324d6cdfa8901185dad0c5ff851823c71ef7114df1e0f9b99e56f00e2f50`.
- Suggested commit message: `cell(robustness × mediabunny): complete isolated robustness evidence`

### robustness × ffmpeg-wasm, mp4box, remotion, web-demuxer, aibrush-media

- The sole five-engine full-feature baseline is the forced-fresh exhaustive
  Chromium batch `results/raw/chromium-2026-07-25T14-50-43-570Z.json`, seed
  `robustness-remaining-20260725-v1`. It exercised 315 scenario rows and 325
  candidates once. The baseline left only 12 adverse engine-scenario rows;
  the other 303 rows were never rerun.
- Adverse rows were closed in engine-scoped batches so selector cross-products
  could not repeat terminal evidence:
  `results/raw/chromium-2026-07-25T15-12-15-713Z.json` (Aibrush discovery),
  `results/raw/chromium-2026-07-25T15-14-59-170Z.json` (FFmpeg),
  `results/raw/chromium-2026-07-25T15-15-07-548Z.json` (MP4Box discovery),
  `results/raw/chromium-2026-07-25T15-15-49-584Z.json` (Remotion +
  web-demuxer), `results/raw/chromium-2026-07-25T15-18-47-827Z.json`
  (three-row Aibrush final), and
  `results/raw/chromium-2026-07-25T15-18-59-971Z.json` (one-row MP4Box final).
- Latest-evidence scenario/candidate reductions are:
  FFmpeg 47/49 PASS and 16/16 NA_ENGINE; MP4Box 18/20 PASS and 45/45
  NA_ENGINE; Remotion 39/41 PASS and 24/24 NA_ENGINE; web-demuxer 26/28 PASS
  and 37/37 NA_ENGINE; Aibrush 56/58 PASS and 7/7 NA_ENGINE. All five cells
  have 63/63 scenarios and 65/65 candidates terminal, with zero FAIL, ERROR,
  NA_ASSET, NA_BROWSER, partial, or SKIPPED outcomes.
- Repairs are exact to measured boundaries. Negative damaged-payload decode
  and malformed-parser signatures use typed clean rejection without
  relabeling lifecycle failures. FFmpeg's strict fragmented-copy row and
  MP4Box's long AAC mux-roundtrip row are exact NA_ENGINE. Aibrush probes a
  dimension-valid H.264 Level 4.0 configuration at 1080p; its two measured
  trim-composition boundary misses are exact NA_ENGINE. The CBCS row composes
  the protected source's exact presentation timeline with independently
  decoded clear-reference frame identity, avoiding a corpus change. Remotion
  and web-demuxer preserve their ordinary partial-decode errors while typing
  the same damaged-input failures only under the negative robustness
  contract.
- Focused regressions and typecheck are clean; the final post-change full
  suite is deferred until the performance cells reach their final source
  boundary.
- Artifact file SHA-256 values, in the order listed above:
  `49c3e298bacf60d8b34d65e61587dcfed0cbdd3a724426ec145122d3a3e41f46`,
  `035db81c236067b70967dc41ae12dd158f11b6da6344c02b9d8804bc0128ea67`,
  `3ee519deb8341b01eb893d514714c77a2c0ac6708db2aa8d55b534789be1a5e4`,
  `40ba0314a1f72f699278c88bd57829a01ca29033ff0935118dc05435d08909c3`,
  `3c96064cf171cbe188d6938a3a859039dd31ce9bd4ab0d0916a41e06b7812c02`,
  `e520e30b800e4688ac6ace7dd87b8ddf0f86141b628d9d13eab762f963bd900c`,
  and `dee86d0da54cf0c991c14b4e24e0c4d5ce3d9679e3e49d0849758808c07da53a`.
- Suggested commit message: `cell(robustness): complete remaining exhaustive engine evidence`
