# Media-test feature × engine campaign

Last updated: 2026-07-21

This is the persistent checklist for the 78-cell Chromium campaign. Cells are
processed feature-row first, then engine-column, using the exact order below.

Legend: `V` = verified terminal, `A` = active scope lock, `P` = pending.

| Feature | mediabunny | ffmpeg-wasm | mp4box | remotion | web-demuxer@4.0.0 | aibrush-media |
|---|---:|---:|---:|---:|---:|---:|
| probe | V | V | V | V | V | V |
| demux | V | V | V | V | V | V |
| remux | V | A | P | P | P | P |
| transcode | P | P | P | P | P | P |
| decode-seek | P | P | P | P | P | P |
| trim | P | P | P | P | P | P |
| mux | P | P | P | P | P | P |
| encryption | P | P | P | P | P | P |
| metadata | P | P | P | P | P | P |
| streaming-output | P | P | P | P | P | P |
| audio-dsp | P | P | P | P | P | P |
| robustness | P | P | P | P | P | P |
| performance | P | P | P | P | P | P |

Totals: 13 verified, 1 active, 64 pending.

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
  and remux regressions pass; full suite 1068 pass, 13850 assertions across 78 files,
  typecheck clean,
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

## Active cell

### remux × ffmpeg-wasm

- Scope lock: only FFmpeg.wasm remux adapter/support behavior and remux-owned
  shared layers when independently proven necessary.
- Quick: pending.
- Exhaustive: pending.
- Boundary gates: pending.
- Suggested commit message: pending.
