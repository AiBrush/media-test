# Aibrush Media Trim ledger

This is the feature-by-feature working ledger for the 43 `trim/*` cells on
`aibrush-media@dev`. Correctness and coverage take precedence over elapsed time.

Baseline evidence:

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

`ms` is aggregate functional cell wall time, not a comparable benchmark metric.
`PASS n/t` reports passed files over the full exhaustive pool; `PARTIAL` records
incomplete evidence coverage. The public operation route is `framework.trim`.
The final column records the adapter's internal route; large inputs can fall
back when the bounded 128 MiB prepared-copy path is ineligible.

| Scenario | Aibrush | ms | Mediabunny | FFmpeg WASM | Remotion | MP4Box | Internal route |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `trim/audio_aac_adts_copy` | NA_ENGINE 0/2 | 5 | NA_ENGINE 0/2 | NA_ENGINE 0/2 | NA_ENGINE 0/2 | NA_ENGINE 0/2 | preflight NA_ENGINE |
| `trim/audio_aiff_pcm_be_copy` | PASS 1/1 | 9 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim(keyframe) |
| `trim/audio_flac_noseektable_copy` | PASS 1/1 | 61 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim(keyframe) |
| `trim/audio_flac_seektable_copy` | PASS 1/1 | 82 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim(keyframe) |
| `trim/audio_mp3_copy` | NA_ENGINE 0/3 | 12 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | preflight NA_ENGINE |
| `trim/audio_opus_ogg_copy` | PASS 1/1 | 126 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim → exact Ogg Opus pre-skip/EOS granule |
| `trim/audio_wav_pcm_copy` | PASS 3/3 | 18 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | direct WAV range trim |
| `trim/av1_keyframe_aligned` | PASS 3/3 | 1,832 | PASS 3/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | strict prepared copy trim |
| `trim/fmp4_fragment_boundary_copy` | PASS 4/4 | 2,310 | PASS 4/4 | PASS 1/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared ISO → fragmented mux |
| `trim/h264_adjacent_concat_equivalence` | PASS 1/1 | 7,109 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | three trim legs + prepared concat |
| `trim/h264_bframes_frame_accurate` | PASS 4/4 | 7,490 | FAIL 3/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/h264_frame_accurate` | PASS 4/4 | 11,228 | FAIL 0/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/h264_keyframe_aligned` | PASS 4/4 | 2,373 | PASS 4/4 | PASS 3/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/h264_keyframe_aligned_short` | PASS 3/3 | 1,734 | PASS 3/3 | PASS 3/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | strict prepared copy trim |
| `trim/h264_multitrack_keyframe_aligned` | PASS 4/4 | 2,285 | PASS 4/4 | PASS 3/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/h264_noop_full_range_idempotent` | PASS 1/1 | 1,182 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim(keyframe) |
| `trim/h264_open_gop_frame_accurate` | PASS 4/4 | 25,915 | FAIL 2/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/h264_rotated_keyframe_aligned` | PARTIAL 1/4 | 2,340 | PARTIAL 1/4 | PARTIAL 1/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/h264_single_gop_frame_accurate` | PASS 4/4 | 2,103 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/h264_start_zero_copy` | PASS 4/4 | 2,586 | PASS 4/4 | PASS 1/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/h264_subframe_range_frame_accurate` | PASS 4/4 | 2,380 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/h264_to_eof_copy` | PASS 1/1 | 588 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | strict prepared copy trim |
| `trim/h264_vfr_frame_accurate` | PASS 4/4 | 3,406 | FAIL 3/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | framework.trim(accurate) |
| `trim/hevc_frame_accurate` | PASS 1/1 | 2,040 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim(accurate) |
| `trim/hevc_keyframe_aligned` | PASS 1/1 | 573 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | strict prepared copy trim |
| `trim/huge_h264_mov_copy_peakmem` | PASS 4/4 | 3,440 | PASS 1/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | prepared ≤128 MiB; framework fallback |
| `trim/large_h264_copy_lazyread` | PASS 3/3 | 1,764 | PASS 3/3 | PASS 2/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | prepared ≤128 MiB; framework fallback |
| `trim/large_h264_frame_accurate_throughput` | PASS 3/3 | 3,957 | PASS 3/3 | PASS 3/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | framework.trim(accurate) |
| `trim/massive_h264_copy_sustained` | PASS 4/4 | 49,939 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | prepared ≤128 MiB; framework fallback |
| `trim/mkv_keyframe_aligned` | PASS 4/4 | 76 | PASS 3/4 | PASS 1/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/mov_keyframe_aligned` | PASS 4/4 | 2,243 | PASS 4/4 | PASS 2/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/robust_bitflipped_source` | PASS 1/1 | 35 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | graceful rejection |
| `trim/robust_end_far_past_eof` | PASS 1/1 | 34 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | graceful rejection |
| `trim/robust_inverted_range` | PASS 4/4 | 171 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | graceful rejection |
| `trim/robust_negative_start` | PASS 4/4 | 144 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | graceful rejection |
| `trim/robust_start_past_eof` | PASS 1/1 | 37 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | graceful rejection |
| `trim/robust_truncated_source` | PASS 1/1 | 27 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | graceful rejection |
| `trim/robust_zero_length_range` | PASS 4/4 | 117 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | graceful rejection |
| `trim/ts_keyframe_aligned` | PASS 4/4 | 262 | NA_ENGINE 0/4 | PASS 1/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/vp8_keyframe_aligned` | PASS 3/3 | 1,840 | PASS 3/3 | PASS 3/3 | NA_ENGINE 0/3 | NA_ENGINE 0/3 | strict prepared copy trim |
| `trim/vp9_alpha_keyframe_aligned` | PASS 1/1 | 650 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | strict prepared copy trim |
| `trim/vp9_keyframe_aligned` | PASS 4/4 | 2,545 | PASS 4/4 | PASS 4/4 | NA_ENGINE 0/4 | NA_ENGINE 0/4 | strict prepared copy trim |
| `trim/vp9_noop_full_range_idempotent` | PASS 1/1 | 979 | PASS 1/1 | PASS 1/1 | NA_ENGINE 0/1 | NA_ENGINE 0/1 | framework.trim → exact-source WebM stream |

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

## Open correctness priorities

1. `trim/audio_aac_adts_copy` and `trim/audio_mp3_copy` — all scored engines
   currently report `NA_ENGINE`; keep the declaration honest until exact
   decoded presentation-window authoring is implemented.
2. `trim/h264_rotated_keyframe_aligned` — Aibrush, Mediabunny, and FFmpeg WASM
   all have the same 1/4 partial coverage. The three external candidates lack
   independently verifiable non-identity rotation evidence, so this is a
   shared asset/evidence limitation rather than an Aibrush implementation miss.
