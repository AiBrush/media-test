# Aibrush Media Trim ledger

This is the feature-by-feature working ledger for the 43 `trim/*` cells on
`aibrush-media@dev`. Correctness and coverage take precedence over elapsed time.

Baseline evidence:

- Current Aibrush family-wide quick:
  `results/raw/chromium-2026-07-29T00-02-46-364Z.json`
- Current Aibrush family-wide exhaustive:
  `results/raw/chromium-2026-07-28T23-58-25-693Z.json`
- Aibrush exhaustive baseline:
  `results/raw/chromium-2026-07-28T21-19-03-931Z.json`
- Cross-engine exhaustive baseline (same 43 definition hashes):
  `results/raw/chromium-2026-07-27T15-49-22-173Z.json`
- Current fragmented-boundary comparison:
  `results/raw/chromium-2026-07-28T21-48-53-996Z.json`
- Current VP9 no-op comparison:
  `results/raw/chromium-2026-07-28T22-06-06-551Z.json`
- Current Ogg Opus comparison:
  `results/raw/chromium-2026-07-28T22-35-34-793Z.json`
- Current AAC ADTS comparison:
  `results/raw/chromium-2026-07-28T22-48-47-857Z.json`
- Current MP3 comparison:
  `results/raw/chromium-2026-07-28T23-17-52-819Z.json`
- Current rotated-H.264 comparison:
  `results/raw/chromium-2026-07-28T23-33-19-031Z.json`

`ms` is aggregate functional cell wall time, not a comparable benchmark metric.
`PASS n/t` reports passed files over the full exhaustive pool; `PARTIAL` records
incomplete evidence coverage. The public operation route is `framework.trim`.
The final column records the adapter's internal route; large inputs can fall
back when the bounded 128 MiB prepared-copy path is ineligible.

Current family-wide completion audit
(`chromium-2026-07-28T23-58-25-693Z.json`):

- 43/43 registered Trim definitions executed with fresh Chromium state.
- 40 cells are full PASS; AAC/ADTS and MP3 are the two concrete `NA_ENGINE`
  cells; rotated H.264 is the sole partial.
- Across all 118 candidate executions: 110 PASS, 5 `NA_ENGINE`, and 3
  `NA_ASSET`; there are zero FAIL, ERROR, `NA_BROWSER`, SKIPPED, or oracle-error
  outcomes.
- Final regression gates after the last product change: focused product tests
  13/13; product full tests 4,520/4,520; product typecheck and production build
  PASS; all Aibrush-owned suite tests 84/84; full suite 1,225/1,225; suite
  typecheck and production build PASS.

| Scenario | Aibrush | ms | Mediabunny | FFmpeg WASM | Remotion | MP4Box | Internal route |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `trim/audio_aac_adts_copy` | NA_ENGINE 0/2 | 5 | NA_ENGINE 0/2 | NA_ENGINE 0/2 | NA_ENGINE 0/2 | NA_ENGINE 0/2 | preflight NA_ENGINE |
| `trim/audio_aiff_pcm_be_copy` | PASS 1/1 | 15 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim(keyframe) |
| `trim/audio_flac_noseektable_copy` | PASS 1/1 | 202 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim(keyframe) |
| `trim/audio_flac_seektable_copy` | PASS 1/1 | 66 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim(keyframe) |
| `trim/audio_mp3_copy` | NA_ENGINE 0/3 | 6 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | preflight NA_ENGINE |
| `trim/audio_opus_ogg_copy` | PASS 1/1 | 114 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim → exact Ogg Opus pre-skip/EOS granule |
| `trim/audio_wav_pcm_copy` | PASS 3/3 | 22 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | direct WAV range trim |
| `trim/av1_keyframe_aligned` | PASS 3/3 | 1,746 | PASS 3/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | strict prepared copy trim |
| `trim/fmp4_fragment_boundary_copy` | PASS 4/4 | 2,262 | PASS 4/4 | PASS 1/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared ISO → fragmented mux |
| `trim/h264_adjacent_concat_equivalence` | PASS 1/1 | 7,109 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | three trim legs + prepared concat |
| `trim/h264_bframes_frame_accurate` | PASS 4/4 | 7,712 | FAIL 3/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/h264_frame_accurate` | PASS 4/4 | 11,335 | FAIL 0/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/h264_keyframe_aligned` | PASS 4/4 | 2,363 | PASS 4/4 | PASS 3/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/h264_keyframe_aligned_short` | PASS 3/3 | 1,694 | PASS 3/3 | PASS 3/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | strict prepared copy trim |
| `trim/h264_multitrack_keyframe_aligned` | PASS 4/4 | 2,256 | PASS 4/4 | PASS 3/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/h264_noop_full_range_idempotent` | PASS 1/1 | 1,173 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim(keyframe) |
| `trim/h264_open_gop_frame_accurate` | PASS 4/4 | 26,118 | FAIL 2/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/h264_rotated_keyframe_aligned` | PARTIAL 1/4 | 2,328 | PARTIAL 1/4 | PARTIAL 1/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/h264_single_gop_frame_accurate` | PASS 4/4 | 2,125 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/h264_start_zero_copy` | PASS 4/4 | 2,390 | PASS 4/4 | PASS 1/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/h264_subframe_range_frame_accurate` | PASS 4/4 | 2,368 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/h264_to_eof_copy` | PASS 1/1 | 611 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | strict prepared copy trim |
| `trim/h264_vfr_frame_accurate` | PASS 4/4 | 3,378 | FAIL 3/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/hevc_frame_accurate` | PASS 1/1 | 2,114 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim(accurate) |
| `trim/hevc_keyframe_aligned` | PASS 1/1 | 598 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | strict prepared copy trim |
| `trim/huge_h264_mov_copy_peakmem` | PASS 4/4 | 3,814 | PASS 1/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | prepared ≤128 MiB; framework fallback |
| `trim/large_h264_copy_lazyread` | PASS 3/3 | 1,765 | PASS 3/3 | PASS 2/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | prepared ≤128 MiB; framework fallback |
| `trim/large_h264_frame_accurate_throughput` | PASS 3/3 | 4,013 | PASS 3/3 | PASS 3/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | framework.trim(accurate) |
| `trim/massive_h264_copy_sustained` | PASS 4/4 | 50,427 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | prepared ≤128 MiB; framework fallback |
| `trim/mkv_keyframe_aligned` | PASS 4/4 | 69 | PASS 3/4 | PASS 1/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/mov_keyframe_aligned` | PASS 4/4 | 2,235 | PASS 4/4 | PASS 2/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/robust_bitflipped_source` | PASS 1/1 | 39 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | graceful rejection |
| `trim/robust_end_far_past_eof` | PASS 1/1 | 42 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | graceful rejection |
| `trim/robust_inverted_range` | PASS 4/4 | 128 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | pre-read range rejection |
| `trim/robust_negative_start` | PASS 4/4 | 121 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | pre-read range rejection |
| `trim/robust_start_past_eof` | PASS 1/1 | 38 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | graceful rejection |
| `trim/robust_truncated_source` | PASS 1/1 | 34 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | graceful rejection |
| `trim/robust_zero_length_range` | PASS 4/4 | 111 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | pre-read range rejection |
| `trim/ts_keyframe_aligned` | PASS 4/4 | 276 | NA_ENGINE 0/4 | PASS 1/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/vp8_keyframe_aligned` | PASS 3/3 | 1,707 | PASS 3/3 | PASS 3/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | strict prepared copy trim |
| `trim/vp9_alpha_keyframe_aligned` | PASS 1/1 | 636 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | strict prepared copy trim |
| `trim/vp9_keyframe_aligned` | PASS 4/4 | 2,694 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/vp9_noop_full_range_idempotent` | PASS 1/1 | 966 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim → exact-source WebM stream |

## Completed cells

### `trim/fmp4_fragment_boundary_copy`

- Before: `NA_ENGINE 0/4`; the adapter rejected `fragmented: true` even though
  the installed product exposes and implements the public Trim option.
- Generic cause: progressive H.264 sources with reordered PTS need a half-open
  presentation-time selection at the end boundary. The native DTS-contiguous
  path retained the wrong terminal access units for the three rotated inputs.
- Solution: admit the legal tuple, forward the public `fragmented` option, and
  extend the existing bounded strict prepared-copy path to author fragmented
  MP4. Selection is content-agnostic and based on presentation time; no
  scenario id, fixture name, digest, or expected value is used.
- Public/internal route: `framework.trim` / strict prepared ISO packet mux with
  `fragmented: true`.
- Post-gate quick:
  `chromium-2026-07-28T21-48-23-851Z.json` — PASS.
- Post-gate exhaustive:
  `chromium-2026-07-28T21-48-34-604Z.json` — full PASS 4/4 in 2,492 ms.
  Strict selected/output coded-sample counts are 101/101, 121/121, 60/60, and
  242/242; playback passes for every input.
- Current comparison:
  `chromium-2026-07-28T21-48-53-996Z.json` — Aibrush full 4/4 in 2,310 ms;
  Mediabunny full 4/4 in 6,657 ms; FFmpeg WASM 1/4 with three concrete
  B-frame-boundary `NA_ENGINE` results; Remotion and MP4Box do not declare Trim.
- Regression gates: focused fragmented tests 2/2; all Aibrush-owned tests 81/81;
  full suite 1,222/1,222; typecheck PASS; production build PASS.

### `trim/h264_start_zero_copy`

- Quick: `chromium-2026-07-28T21-53-21-942Z.json` — PASS.
- Aibrush exhaustive: `chromium-2026-07-28T21-53-36-281Z.json` — full PASS
  4/4 in 2,512 ms.
- Current comparison:
  `chromium-2026-07-28T21-53-53-970Z.json` — Aibrush full 4/4 in 2,586 ms;
  Mediabunny full 4/4 in 7,029 ms; FFmpeg WASM passes only 1/4 in 844 ms;
  Remotion and MP4Box do not declare Trim.
- Route: `framework.trim` / strict prepared MP4 copy trim.
- Decision: no implementation change. The older apparent loss compared Aibrush's
  full four-file execution with FFmpeg's one admissible file, so it was not a
  correctness- or work-comparable performance loss.

### `trim/h264_noop_full_range_idempotent`

- Quick: `chromium-2026-07-28T21-55-26-956Z.json` — PASS.
- Aibrush exhaustive: `chromium-2026-07-28T21-55-43-209Z.json` — full PASS
  1/1.
- Current comparison:
  `chromium-2026-07-28T21-55-53-701Z.json` — Aibrush 1,182 ms,
  Mediabunny 1,198 ms, and FFmpeg WASM 1,123 ms, all full 1/1.
- Route: `framework.trim(keyframe)`; the no-op semantic invariant intentionally
  bypasses the representation-changing prepared-copy repair path.
- Decision: no implementation change. The current full-coverage spread is
  approximately 5% and does not establish genuine Aibrush overhead.

### `trim/vp9_noop_full_range_idempotent`

- Before:
  `chromium-2026-07-28T21-57-05-597Z.json` — Aibrush 1,202 ms,
  Mediabunny 941 ms, and FFmpeg WASM 1,135 ms, all full PASS 1/1.
- Generic cause: a non-fragmented, same-document-type WebM keyframe trim whose
  normalized range covered the complete source still demuxed every block and
  authored a replacement WebM. That work could not change the requested
  presentation and also defeated literal representation identity.
- Solution: after bounded WebM metadata parsing, the product recognizes a
  zero-origin normalized full range with an unchanged document type and returns
  the exact source bytes as a stream. Fragmented output, container changes,
  subranges, unknown duration, and malformed input retain the normal
  demux/remux path. No scenario id, fixture name, digest, timing, or expected
  value participates in routing.
- Public/internal route: `framework.trim(keyframe)` / exact-source WebM stream.
- Product regression:
  `src/drivers/webm/webm-stream-copy.test.ts` asserts byte length and SHA-256
  identity, then independently reimports the output and checks its complete
  golden packet table.
- Initial post-change quick:
  `chromium-2026-07-28T22-05-25-623Z.json` — PASS.
- Initial post-change exhaustive:
  `chromium-2026-07-28T22-05-36-951Z.json` — full PASS 1/1 in 1,207 ms.
- Current comparison:
  `chromium-2026-07-28T22-06-06-551Z.json` — Aibrush 979 ms,
  Mediabunny 1,017 ms, and FFmpeg WASM 1,286 ms, all full PASS 1/1;
  Remotion and MP4Box do not declare Trim.
- Final post-gate quick:
  `chromium-2026-07-28T22-14-44-044Z.json` — PASS.
- Final post-gate exhaustive:
  `chromium-2026-07-28T22-14-54-588Z.json` — full PASS 1/1 in
  1,227 ms. Property identity, strict trim boundaries, playback, and reference
  reimport all pass; selected/output video samples are 300/300 and required
  coded samples are 801/801 with zero representation differences.
- Regression gates: product WebM tests 12/12; product full tests 4,519/4,519;
  product typecheck and build PASS; all Aibrush-owned suite tests 81/81; full
  suite 1,222/1,222; suite typecheck and production build PASS.

### `trim/audio_opus_ogg_copy`

- Before:
  `chromium-2026-07-28T22-17-06-619Z.json` — exhaustive
  `NA_ENGINE 0/1`; Aibrush rejected all lossy packet-copy audio trims even
  though Ogg has exact start/end presentation controls.
- Generic cause: selecting only packets overlapping 2s..7s lost Opus decoder
  history and left the source pre-skip/end granule unchanged, producing 239,688
  presentation frames instead of the requested 240,000.
- Solution: the Ogg driver now derives every packet duration from its Opus TOC,
  retains the earliest decoder-history packet representable by the unsigned
  16-bit OpusHead pre-skip, rewrites that pre-skip, and authors the EOS granule
  for the exact half-open presentation interval. Payload bytes remain unchanged.
  A related generic Ogg page-lacing repair avoids setting `HT_CONTINUED` when a
  complete packet ends exactly at a 255-segment page boundary.
- Public/internal route: `framework.trim` / exact Ogg Opus packet copy with
  authored pre-skip and EOS end trim.
- Current comparison:
  `chromium-2026-07-28T22-35-34-793Z.json` — Aibrush full PASS 1/1 in
  126 ms; Mediabunny full PASS 1/1 in 1,174 ms; FFmpeg WASM is
  `NA_ENGINE` with `FFMPEG_AUDIO_PRESENTATION_TIMING_UNSUPPORTED`; Remotion
  and MP4Box do not declare Trim.
- Final post-gate quick:
  `chromium-2026-07-28T22-46-19-254Z.json` — PASS in 267 ms.
- Final post-gate exhaustive:
  `chromium-2026-07-28T22-46-28-096Z.json` — full PASS 1/1 in 244 ms.
  Both oracles observe exactly 240,000 decoded/container presentation frames,
  source boundaries 96,000..336,000 with zero tolerance, 305,280 coded frames,
  64,632 pre-skip frames, and 648 terminal trim frames.
- Regression gates: product Ogg tests 64/64; product full tests 4,519/4,519;
  product typecheck and build PASS; focused Aibrush support tests 42/42; all
  Aibrush-owned suite tests 82/82; full suite 1,223/1,223; suite typecheck and
  production build PASS.

### `trim/audio_aac_adts_copy`

- Terminal state: honest `NA_ENGINE`
  (`AIBRUSH_AUDIO_PRESENTATION_TIMING_UNSUPPORTED`) for both exhaustive files.
- Concrete API gap: public `TrimOptions` exposes start/end/mode but no decoded
  start-discard or end-discard controls. The ADTS muxer can emit only whole AAC
  access units in 7-byte headers (object type, sample rate, channels, frame
  length); ADTS exposes no equivalent of Ogg Opus pre-skip/EOS granule timing.
- Direct framework proof: bypassing suite preflight on the real 48 kHz fixture
  routes through `framework.trim` and returns 236 whole AAC frames, or 241,664
  decoded/container samples, with zero priming and zero terminal trim. The
  requested 2s..7s presentation is exactly 240,000 samples, so the carrier
  cannot express it without re-encoding plus external discard metadata.
- Cross-engine exhaustive:
  `chromium-2026-07-28T22-48-47-857Z.json` — all six scored engines are
  `NA_ENGINE` for both files. Mediabunny reports that ADTS cannot preserve
  explicit timing; FFmpeg WASM reports that its stream-copy path cannot author
  codec delay/end padding; Remotion, MP4Box, and web-demuxer do not declare
  Trim.
- Final post-gate quick:
  `chromium-2026-07-28T22-55-58-687Z.json` — `NA_ENGINE` in 29 ms.
- Final post-gate exhaustive:
  `chromium-2026-07-28T22-56-02-822Z.json` — both eligible files
  `NA_ENGINE` in 28 ms with the same concrete reason code.
- Regression gates: focused Aibrush support tests 43/43; all Aibrush-owned
  suite tests 83/83; full suite 1,224/1,224; suite typecheck and production
  build PASS. No product behavior changed for this terminal capability result.

### `trim/audio_mp3_copy`

- Terminal state: honest `NA_ENGINE` (`AIBRUSH_MP3_EXACT_TRIM_UNSUPPORTED`)
  for all three exhaustive files.
- The three sources do carry exact Xing/LAME timing: 576 priming samples,
  1,152 samples per MPEG-1 Layer III frame, and valid terminal padding. For the
  requested 5s boundary, the delay field can retain at most two earlier frames;
  a third requires 4,500 samples on the 44.1 kHz inputs or 4,416 samples on the
  48 kHz input, exceeding the format's 12-bit 4,095-sample maximum.
- The generic packet-copy prototype preserved every selected compressed frame
  and authored exactly five seconds in Xing/LAME metadata, but exhaustive
  Chromium evidence
  (`chromium-2026-07-28T23-10-14-300Z.json`) rejected every file. The native
  48 kHz input decoded to exactly 240,000 frames and matched container timing,
  yet both PCM boundary digests differed from the requested source interval.
  The two 44.1 kHz inputs additionally decode through the neutral browser at
  48 kHz, which cannot agree with their unchanged MP3 header rate.
- Because Layer III's bit reservoir and synthesis state are decoder-stateful,
  rewriting delay/padding cannot make this byte-preserving cut PCM-identical,
  and the product has no MP3 encoder with which to create a fresh independent
  stream. The failing prototype was removed; no known-wrong product behavior
  remains.
- Cross-engine exhaustive:
  `chromium-2026-07-28T23-17-52-819Z.json` — all six scored engines are
  `NA_ENGINE` for all three files. Mediabunny cannot author exact MP3
  delay/padding; FFmpeg WASM cannot author the required presentation timing;
  Remotion, MP4Box, and web-demuxer do not declare Trim.
- Final post-gate quick:
  `chromium-2026-07-28T23-17-30-121Z.json` — `NA_ENGINE`.
- Final post-gate exhaustive:
  `chromium-2026-07-28T23-17-39-977Z.json` — all three eligible files
  `NA_ENGINE` with the same concrete reason code.
- Regression gates: focused Aibrush support tests 44/44; all Aibrush-owned
  suite tests 84/84; full suite 1,225/1,225; suite typecheck and production
  build PASS. No product behavior changed for this terminal capability result.

### Intrinsically invalid Trim ranges

Cells:

- `trim/robust_negative_start`
- `trim/robust_inverted_range`
- `trim/robust_zero_length_range`

Generic cause: the product's `runTrim` contract had the correct
duration-independent range predicate, but invoked it only after source
normalization, container routing, and—in stream-copy paths—driver entry. Invalid
numeric requests therefore performed avoidable source/container work before
returning the same typed `InputError`.

Solution: execute the existing range predicate with unknown duration at the
operation boundary. This rejects non-finite, negative, inverted, and zero-length
ranges before touching the source; the later duration-aware check remains for
start/end-past-EOF validation. No scenario identity, fixture fact, or test
constant participates.

Product regression:
`src/api/trim-robustness.test.ts` supplies a source whose `range` and `stream`
paths fail if touched, then proves all four intrinsic invalid-range forms reject
as `InputError` with zero source access. The test failed through MP4 routing
before the product change and passes afterward.

- Negative start: final quick
  `chromium-2026-07-28T23-57-02-669Z.json`; exhaustive
  `chromium-2026-07-28T23-57-12-997Z.json` is full PASS 4/4 in 125 ms; comparison
  `chromium-2026-07-28T23-47-43-950Z.json` is Aibrush 117 ms, Mediabunny 83 ms,
  and FFmpeg WASM 366 ms.
- Inverted range: final quick
  `chromium-2026-07-28T23-57-31-883Z.json`; exhaustive
  `chromium-2026-07-28T23-57-40-300Z.json` is full PASS 4/4 in 122 ms; comparison
  `chromium-2026-07-28T23-48-44-065Z.json` is Aibrush 117 ms, Mediabunny 84 ms,
  and FFmpeg WASM 327 ms.
- Zero-length range: final quick
  `chromium-2026-07-28T23-57-56-782Z.json`; exhaustive
  `chromium-2026-07-28T23-58-06-448Z.json` is full PASS 4/4 in 124 ms; comparison
  `chromium-2026-07-28T23-49-34-889Z.json` is Aibrush 104 ms, Mediabunny 82 ms,
  and FFmpeg WASM 329 ms.

- Regression gates: focused product tests 13/13; product full tests
  4,520/4,520; product typecheck and production build PASS; all Aibrush-owned
  suite tests 84/84; full suite 1,225/1,225; suite typecheck and production
  build PASS.

## Audited shared-evidence blocker

### `trim/h264_rotated_keyframe_aligned`

- Final post-gate quick:
  `chromium-2026-07-28T23-32-52-818Z.json` — `NA_ASSET`; the selected
  external input has no non-identity orientation evidence.
- Final post-gate Aibrush exhaustive:
  `chromium-2026-07-28T23-58-25-693Z.json` — `PARTIAL 1/4` in 2,328 ms.
  `h264_rotated90.mp4` is full PASS: all 150 selected coded samples and
  relative timestamps match, the 90-degree display property is preserved, and
  neutral playback passes. `01.mp4`, `02.mp4`, and `03.mp4` also preserve all
  150 selected packets and play successfully, but the property oracle correctly
  returns `TRIM_DISPLAY_REFERENCE_UNVERIFIED`.
- Independent container evidence: `ffprobe` reports no `rotate` tag or display
  side data for `01.mp4`, `02.mp4`, or `03.mp4`; it reports `rotation: 90` for
  `h264_rotated90.mp4`. The three external files therefore do not satisfy the
  scenario's declared rotated-source feature.
- Cross-engine exhaustive:
  `chromium-2026-07-28T23-33-19-031Z.json` — Aibrush is `PARTIAL 1/4` in
  2,346 ms, Mediabunny is the same `PARTIAL 1/4` in 3,685 ms, and FFmpeg WASM
  is the same `PARTIAL 1/4` in 2,253 ms. Every contesting engine passes the
  genuinely rotated baked input and encounters the same missing source
  evidence on the external pool.
- Product/API conclusion: Aibrush already preserves the source MP4 `tkhd`
  display transform on its strict prepared-copy route. Public `TrimOptions`
  supplies a range and mode but no requested rotation angle; inventing a
  transform for an identity source would change its presentation and would not
  repair the oracle's missing source reference. Declaring `NA_ENGINE` would
  also be false because the genuine rotated input proves the capability.
- This cell cannot honestly reach exhaustive full PASS while shared fixtures,
  scenario catalogs, and oracles are immutable. Completion requires replacing
  or removing the three non-rotated external candidates in the shared eligible
  catalog, or supplying independently verified rotated variants.
- Regression gates: focused product rotation/edit tests 27/27; product full
  tests 4,520/4,520; product typecheck and production build PASS; all
  Aibrush-owned suite tests 84/84; full suite 1,225/1,225; suite typecheck and
  production build PASS.

## Open correctness priorities

1. `trim/h264_rotated_keyframe_aligned` — shared evidence blocker documented
   above; there is no remaining Aibrush implementation defect.
