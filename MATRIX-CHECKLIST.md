# Media-test feature × engine campaign

Last updated: 2026-07-24

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
| mux | V | A | P | P | P | P |
| encryption | P | P | P | P | P | P |
| metadata | P | P | P | P | P | P |
| streaming-output | P | P | P | P | P | P |
| audio-dsp | P | P | P | P | P | P |
| robustness | P | P | P | P | P | P |
| performance | P | P | P | P | P | P |

Totals: 37 verified, 1 active, 40 pending.

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
  `dd6d35bd381547227b869b957626f56991a5db18c275904fe352026efe59cdec`
- Oracle definition digest:
  `a14ccf367013463ac463a6f4323a48affb03d9c8ac458de4293197d368edcc24`
- Current regression gate (2026-07-24): focused trim/runner/aibrush-media
  regressions 53 pass with 213 assertions, followed by a final aibrush-media
  support/remux gate of 28 pass with 81 assertions; full suite 1143 pass with
  14184 assertions across 80 files on the same executable source; typecheck,
  `git diff --check`, and `git diff --cached --check` clean.

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

## Active cell

### mux × ffmpeg-wasm

- Scope lock: only ffmpeg-wasm mux adapter/support behavior and mux-owned
  shared layers when independently proven necessary.
- Quick: pending.
- Exhaustive: pending.
- Boundary gates: pending.
- Suggested commit message: pending.
