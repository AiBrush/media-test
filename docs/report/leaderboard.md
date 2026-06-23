# Leaderboard & Validation Roll-up — Best Framework per Feature

Source run: `results/runs/results-chromium-2026-06-22T17-42-49-289Z.json`
Browser: chromium 149 · GPU: Apple M1 Max (ANGLE Metal) · suite 0.1.0
Frameworks compared (7): mediabunny@1.48.0, platform@chrome-149, ffmpeg.wasm@0.12.15, mp4box@2.3.0, remotion-media-parser@4.0.479, web-demuxer@4.0.0, remotion-webcodecs@4.0.479 · `aibrush-media@dev` excluded.

**558 / 558 features analyzed.** Master table: [best-framework-by-feature.md](best-framework-by-feature.md) · per-feature detail: `details/<feature>.md`.

---

## 1. Wins per framework

555 features have a winner (a PASS-eligible engine); 3 have **no winner** (`NONE`). "Uncontested" = exactly 1 engine PASSed (`passCount==1`); "Contested" = ≥2 PASSed and the winner was chosen by the correctness→performance ladder.

| Rank | Framework | Total wins | Win % (of 558) | Uncontested | Contested |
|---|---|---:|---:|---:|---:|
| 1 | **mediabunny@1.48.0** | **313** | 56.1% | 42 | 271 |
| 2 | **ffmpeg.wasm@0.12.15** | **129** | 23.1% | 38 | 91 |
| 3 | remotion-webcodecs@4.0.479 | 38 | 6.8% | 0 | 38 |
| 4 | remotion-media-parser@4.0.479 | 26 | 4.7% | 0 | 26 |
| 5 | platform@chrome-149 | 23 | 4.1% | 2 | 21 |
| 6 | mp4box@2.3.0 | 16 | 2.9% | 0 | 16 |
| 7 | web-demuxer@4.0.0 | 10 | 1.8% | 0 | 10 |
| — | _NONE (no engine passed)_ | 3 | 0.5% | — | — |
| | **Total** | **558** | 100% | **82** | **473** |

**Headline:** mediabunny wins a clear majority (56%), dominating mux, transcode, trim, probe, robustness, streaming-output and (half of) remux/demux. ffmpeg.wasm is the clear #2 (23%), owning audio-dsp and contesting remux. The remaining five engines win only in their niches: WebCodecs-backed decode/perf (platform, remotion-webcodecs, web-demuxer), header-only probing (remotion-media-parser), and container parsing (mp4box). Only **mediabunny, ffmpeg.wasm and platform** ever win *uncontested* — i.e., are the sole engine declaring a capability.

---

## 2. Per-family winner breakdown (who dominates each family)

| Family | Feats | Dominant winner | Distribution |
|---|---:|---|---|
| audio-dsp | 36 | **ffmpeg.wasm (25)** | ffmpeg.wasm 25, mediabunny 9, remotion-webcodecs 2 |
| decode-seek | 43 | **mediabunny (21)** | mediabunny 21, platform 14, web-demuxer 4, remotion-webcodecs 3, ffmpeg.wasm 1 |
| demux | 43 | **mediabunny (19)** | mediabunny 19, ffmpeg.wasm 10, mp4box 5, platform 3, web-demuxer 2, remotion-webcodecs 2, remotion-media-parser 2 |
| encryption | 13 | **mediabunny (7)** | mediabunny 7, ffmpeg.wasm 6 |
| metadata | 25 | **tie mediabunny/ffmpeg.wasm (8)** | mediabunny 8, ffmpeg.wasm 8, remotion-media-parser 4, remotion-webcodecs 3, platform 1, mp4box 1 |
| mux | 52 | **mediabunny (46)** | mediabunny 46, ffmpeg.wasm 5, mp4box 1 |
| performance | 33 | **mediabunny (16)** | mediabunny 16, remotion-webcodecs 5, web-demuxer 4, remotion-media-parser 3, mp4box 3, ffmpeg.wasm 2 |
| probe | 51 | **mediabunny (32)** | mediabunny 32, remotion-webcodecs 8, remotion-media-parser 7, ffmpeg.wasm 3, mp4box 1 |
| remux | 49 | **mediabunny (25)** | mediabunny 25, ffmpeg.wasm 22, remotion-webcodecs 1, mp4box 1 |
| robustness | 60 | **mediabunny (31)** | mediabunny 31, remotion-media-parser 10, ffmpeg.wasm 10, remotion-webcodecs 5, platform 2, mp4box 2 |
| streaming-output | 27 | **mediabunny (18)** | mediabunny 18, ffmpeg.wasm 7, mp4box 2 |
| transcode | 84 | **mediabunny (50)** | mediabunny 50, ffmpeg.wasm 19, remotion-webcodecs 9, platform 3, NONE 3 |
| trim | 42 | **mediabunny (31)** | mediabunny 31, ffmpeg.wasm 11 |

**Reading it:** mediabunny dominates 11 of 13 families. ffmpeg.wasm owns exactly one outright — **audio-dsp** (PCM/format conversion, channel mixing, resampling — where its in-wasm libswresample/libavcodec beats WebCodecs, which has no hardware advantage on raw PCM). **metadata** is a dead heat. The WebCodecs-native trio (platform/remotion-webcodecs/web-demuxer) only surfaces where actual hardware decode/encode throughput is the decisive metric (decode-seek, performance, transcode perceptual ties).

---

## 3. Validation roll-up (anti-cheat)

| Verdict | Count | Meaning |
|---|---:|---|
| **REAL** | 349 | Real fixture + real implementation + meaningful (often bit-exact/structural) oracle. |
| **WEAK-GATE** | 206 | PASS is genuine but rests on a loose/proxy/smoke oracle (duration-only, SSIM with `exactFrames==0`, or graceful-failure smoke). |
| **SUSPECT** | 3 | Something looks off — degenerate metric or a per-asset hardcoded fast path. See §3.1. |
| **CHEAT** | 0 | No concrete evidence of mock data / faked output / an oracle that cannot fail. |
| **INCONCLUSIVE** | 0 | Every feature was decidable from code + fixtures. |

**No outright cheating was found.** No winner returned canned output, short-circuited to a golden, or copied input→output to fake an operation *without that being caught and flagged*. The integrity concerns are concentrated in the 3 SUSPECT findings below and the systemic caveats in §5.

### 3.1 SUSPECT features (the integrity findings to act on)

1. **`performance/size-ladder-demux-peak-memory-large4k`** — winner `mp4box@2.3.0`. The implementations and oracle are real, but the **ranking metric is degenerate**: 6 of 7 engines reported *no* `peakMemory` sample, and `median([]) == 0` is finite and "lower is better", so an engine that measured nothing out-ranks engines that honestly measured GBs. The metric selects the engine that failed to measure, inverting intent. → *Fix the harness to treat an empty `peakMemory` sample as N/A, not 0.*
2. **`performance/size-ladder-iterate-packets-medium`** — winner `web-demuxer@4.0.0`. Real fixture/golden/oracle, no fabrication, but the winning throughput comes from a **per-asset hardcoded JS sample-table path** (`mp4-sample-table.ts:15-19`) that bypasses web-demuxer's WASM for this specific fixture — so the benchmark measures a shortcut, not the library's general demux path. → *The "win" is not representative; exclude or re-run without the fixture-specific path.*
3. **`remux/huge_h264_1080p_600s_mov_to_mp4`** — winner `remotion-webcodecs@4.0.479`. The most cheat-adjacent: the winning fast path is **hardcoded to this asset id** (`compatible-mov-mp4.ts:12`) and merely **flips 8 `ftyp` brand bytes, returning the input essentially unchanged**; the loose oracle cannot distinguish this from a real remux. The output is technically valid, so it is SUSPECT rather than CHEAT, but the result should not be read as "remotion-webcodecs remuxes a 448 MB MOV fastest." → *Tighten the oracle (require structural re-layout / packet equivalence) so a brand-byte swap cannot pass as a remux.*

---

## 4. No-winner features (`bestFramework == NONE`, 3)

All three are in **transcode**, and each is an honest capability ceiling of Chrome-149 + the wasm engines — not a test defect:

- **`transcode/flac_to_opus_webm`** — 0 PASS. Chrome 149 WebCodecs has **no FLAC `AudioDecoder`** (`isConfigSupported=false`), so mediabunny + remotion-webcodecs are `NA_BROWSER`; the lossless FLAC *source* can't be decoded by any usable path even though the Opus/WebM target is fully supported.
- **`transcode/h264_8bit_to_hevc_10bit`** — 0 PASS. Requires **HEVC 10-bit *output*** (`depth:10bit-output`); no engine declares a 10-bit HEVC encoder in this environment — 3 lack a transcode op, 4 declare transcode but not 10-bit HEVC encode. All gated before any oracle ran.
- **`transcode/h264_to_vp8_webm`** — 0 PASS. ffmpeg.wasm did the only real encode (VP8/Vorbis, SSIM mean 0.971) but **FAILED `playback-smoke`** — Chromium `<video>` could not play its output; every other engine was blocked by a missing capability.

---

## 5. Cached-winner / staleness roll-up

**542 of the 555 winners (97.7%) had `cached == true`** — their PASS (and its metrics) were *reused from an earlier run, not freshly executed in this run*. This is systemic: the run was produced by a cache-seeded launcher, so nearly the whole suite is replayed rather than re-measured. **Implication:** correctness verdicts (which oracle passed) are trustworthy and deterministic, but **performance margins decided on cached, single-sample (`n==1`) timings carry staleness risk** and should be re-measured before being quoted as authoritative.

The **only 13 freshly-run (`cached==false`) winners** — all `mediabunny@1.48.0`, all in streaming-output/mux — are therefore the most reliable timing wins:
`streaming-output/mp4_ttfb_buffer_target`, `mp4_ttfb_streaming_target`, `prop_decode_equals_stream_shape`, `prop_probe_dur_stream_shape`, `prop_ts_stream_duration_materialized`, `stream_huge_h264_mov_to_mp4`, `stream_large_h264_mp4`, `stream_large_vp9_webm`, `stream_massive_h264_mp4`, `ts_continuity_many_writes`, `webm_headerless_live_stream`; `mux/mp4_faststart_reserve`, `mux/mp4_streaming_target`. (The 3 NONE features have no winner and are not cached.)

---

## 6. WEAK-GATE features (206) — PASS is real but the gate is loose

These passed on a duration-only / SSIM-proxy (`exactFrames==0`) / graceful-failure-smoke oracle. The winner is genuinely implemented; the *strength of the correctness claim* is limited. Grouped by family:

- **audio-dsp** (24): downmix_5_1_to_stereo, downmix_stereo_to_mono, edge_empty_audio_transcode, edge_variable_channel_count_downmix, fade_in_out_f32, fuzz_wav_bitflip_decode, fuzz_wav_fmt_corrupt_transcode, fuzz_wav_header_truncated_probe, gain_half_f32, gain_minus6db_s16, meta_roundtrip_endianness_s16, pcm_f32_to_s16, pcm_s16_to_f32, pcm_s16be_to_s16le, pcm_s16le_to_s16be, pcm_s24_to_f32, pcm_s24_to_s16, pcm_s24be_to_s16le, resample_48k_to_16k, resample_48k_to_44k1, throughput_encode_s16be, throughput_encode_s24, upmix_mono_to_stereo, upmix_stereo_to_5_1
- **decode-seek** (4): decode_tiny_dims_2x2_h264, decode_vp8, decode_vp9_alpha, meta_pts_monotonic_after_reorder
- **demux** (6): graceful_truncated_h264, graceful_webm_header_destroyed, graceful_zero_length, h264_1080p_30s, size_huge_huge_h264_1080p_600s, wav_s16
- **encryption** (4): cenc_cens_decrypt_na, cenc_ctr_protection_zeroed_graceful, cenc_ctr_senc_bitflip_graceful, hls_sample_aes_decrypt_na
- **metadata** (9): neg_garbled_id3_mp3_probe, neg_garbled_ilst_mp4_probe, read_flac_seektable, read_opus, tagedit_no_corrupt_audio_flac, write_flac_vorbiscomment, write_mkv_tags, write_mp3_id3, write_ogg_vorbiscomment
- **mux** (20): aac_to_adts, audio_only_aac_to_mp4, av1_opus_to_mp4, drop_audio_track_subset_to_mp4, edge_multitrack_keep_all_to_mp4, h264_aac_to_mkv, h264_aac_to_ts, mp3_to_mp3, mp3_to_mp4_audio, neg_vp9_into_adts_illegal, opus_to_webm_audio, pcm_s24_to_wav, size_large_1080p_to_mkv, size_micro_1frame_to_mkv, swap_audio_video_with_opus_to_mkv, three_track_assembly_to_mkv, video_plus_audio_to_mp4, vorbis_to_ogg, vp9_opus_to_webm, vp9_video_plus_opus_audio_to_webm
- **performance** (10): bundle-size, convert-longtasks, convert-peak-memory, iterate-video-packets, metamorphic-transcode-idempotent-source-res, metamorphic-vfr-probe-duration, op-sweep-transcode-webm, size-ladder-demux-peak-memory-huge, size-ladder-iterate-packets-huge, size-ladder-iterate-packets-massive
- **probe** (9): aac_adts, cenc_cbcs, h264_1080p_5s, huge_h264_1080p_600s, massive_vp9_1080p_2h, metamorphic-recorder-headerless-sane-duration, micro_h264_1frame, truncated-header-graceful, wav_s24
- **remux** (12): h264_1080p_5s_mov_to_mp4, h264_rotated90_mp4_to_mov, hevc_1080p_10s_mp4_to_mov, large_h264_1080p_120s_mp4_to_mkv, micro_audio_short_mp4_to_adts, neg_headerless_webm_to_mkv, neg_truncated_mp4_to_mkv, opus_ogg_to_mkv, prop_adts_to_mp4_duration_invariant, prop_recorder_headerless_duration_materialized, vp9_1080p_10s_webm_to_mp4, vp9_1080p_10s_webm_to_webm
- **robustness** (29): edge_audio_only_probe, edge_dims_1x1_decode, edge_dims_2x2_h264_probe, edge_extreme_fps_1_probe, edge_extreme_fps_240_probe, edge_faststart_reserve_remux, edge_headerless_recorder_remux, edge_mislabeled_container_probe, edge_seek_negative, edge_seek_past_eof, edge_vfr_probe, edge_video_only_probe, edge_zero_length_probe, fuzz_adts_aac_bitflip_probe, fuzz_encrypted_mp4_ciphertext_decode, fuzz_flac_bitflip_probe, fuzz_mp3_header_truncated_probe, fuzz_mp4_bitflip_probe, fuzz_mp4_header_truncated_demux, fuzz_mp4_tail_truncated_demux, fuzz_mp4_zeroed_spans_decode, fuzz_mux_target_corrupt_remux, fuzz_remux_zeroed_spans, fuzz_truncated_h264_asset_demux, fuzz_ts_zeroed_spans_demux, fuzz_webm_bitflip_probe, fuzz_webm_header_truncated_demux, image_jpeg_probe_na, image_png_probe_na
- **streaming-output** (1): ts_tiny_writes
- **transcode** (47): aac_to_pcm_wav_extract, av1_to_h264_mp4, av1_to_vp9_webm, av_downmix_stereo_to_mono, bframe_reorder_h264_to_h264, bframe_reorder_h264_to_vp9, extreme_fps_1, extreme_resize_1x1, flac_to_aac_mp4, gapless_pcm_to_aac_priming, gapless_pcm_to_opus_priming, h264_bitrate_2mbps, h264_colorspace_709_to_2020, h264_crf_quality_mode, h264_fps_30_to_15, h264_resize_720p, h264_rotate_180, h264_rotate_90_dimswap, h264_to_av1_mp4, h264_to_mov, h264_to_ts, h264_to_vp9_webm, h264_two_pass_bitrate, hdr10_to_sdr_tonemap, hevc_to_h264_mp4, hevc_to_vp9_webm, ladder_large_h264_1080p_120s_resize_720p, ladder_tiny_h264_360p_resize_180p, ladder_tiny_vp9_360p_to_h264_180p, malformed_truncated_h264_transcode, malformed_zero_length_transcode, mismatch_mislabeled_container_transcode, mp3_to_aac_mp4, mp3_to_opus_webm, negative_jpeg_to_video, negative_png_to_video, opus_to_aac_mp4, roundtrip_leg1_h264_to_vp9, selfcheck_h264_resize_720p_tie, vp9_alpha_to_vp8_keepalpha, vp9_alpha_to_vp9_keepalpha, vp9_to_av1_webm, vp9_to_h264_mp4, wav_to_aac_mp4, wav_to_flac, wav_to_opus_ogg, wav_to_vorbis_ogg
- **trim** (31): audio_flac_noseektable_copy, audio_flac_seektable_copy, audio_mp3_copy, audio_opus_ogg_copy, av1_keyframe_aligned, fmp4_fragment_boundary_copy, h264_bframes_frame_accurate, h264_frame_accurate, h264_keyframe_aligned_short, h264_multitrack_keyframe_aligned, h264_noop_full_range_idempotent, h264_open_gop_frame_accurate, h264_rotated_keyframe_aligned, h264_single_gop_frame_accurate, h264_start_zero_copy, h264_subframe_range_frame_accurate, h264_vfr_frame_accurate, hevc_frame_accurate, huge_h264_mov_copy_peakmem, large_h264_copy_lazyread, large_h264_frame_accurate_throughput, mkv_keyframe_aligned, mov_keyframe_aligned, robust_bitflipped_source, robust_end_far_past_eof, robust_inverted_range, robust_start_past_eof, robust_truncated_source, robust_zero_length_range, vp9_alpha_keyframe_aligned, vp9_keyframe_aligned

**Pattern:** WEAK-GATE clusters in **transcode (47)** and **trim (31)** — re-encode/copy operations gated by perceptual SSIM (`exactFrames==0`) or duration-only checks rather than bit-exact frame digests — and in **robustness (29)**, where graceful-failure smoke gates only prove "did not crash," not correctness. Strengthening these oracles (bit-exact frame digests for transcode; boundary-frame digests for trim; output-content assertions for robustness) is the highest-leverage way to harden the suite.

---

## 7. Confidence roll-up

| Confidence | Count |
|---|---:|
| high | 212 |
| medium | 333 |
| low | 13 |

The **13 low-confidence** features (revisit these first) — mostly perf ties decided on sub-millisecond, cached `n==1` margins, or gates that don't measure the intended property:

- `performance/bundle-size` [mp4box, WEAK-GATE] — primary metric `bundleSize` was blank (`n=0`) for all 7; ranked off an orphan offline file.
- `performance/size-ladder-demux-peak-memory-huge` [remotion-webcodecs, WEAK-GATE]
- `performance/size-ladder-iterate-packets-massive` [web-demuxer, WEAK-GATE]
- `remux/opus_ogg_to_mkv` [ffmpeg.wasm, WEAK-GATE]
- `probe/empty-audio-wav` [remotion-webcodecs, REAL] — ~0.2 ms cached margin, coin-flip.
- `probe/massive_h264_1080p_2h` [remotion-webcodecs, REAL]
- `probe/truncated-header-graceful` [mediabunny, WEAK-GATE]
- `mux/neg_vp9_into_adts_illegal` [mediabunny, WEAK-GATE]
- `robustness/edge_mislabeled_container_probe` [platform, WEAK-GATE]
- `robustness/edge_video_only_probe` [mediabunny, WEAK-GATE]
- `robustness/edge_zero_length_probe` [remotion-webcodecs, WEAK-GATE]
- `robustness/fuzz_mp3_header_truncated_probe` [remotion-media-parser, WEAK-GATE]
- `robustness/image_jpeg_probe_na` [mediabunny, WEAK-GATE]

---

## 8. Sanity checks

- ✅ **558 / 558** rows in the master table; numbering **contiguous 1..558**, no gaps or duplicates.
- ✅ **558 / 558** per-feature detail files exist under `details/`.
- ✅ Every `bestFramework` is one of the 7 in-scope engines or `NONE` (0 out-of-scope; `aibrush-media@dev` never appears as a winner).
- ✅ Win tallies reconcile: 313 + 129 + 38 + 26 + 23 + 16 + 10 = **555 winners** + **3 NONE** = 558.
- ✅ Contested (473) + Uncontested (82) + NONE (3) = 558.
- ✅ Validation verdicts sum to 558 (349 REAL + 206 WEAK-GATE + 3 SUSPECT + 0 CHEAT + 0 INCONCLUSIVE); confidence sums to 558 (212 high + 333 medium + 13 low).
- ⚠️ **Caveat (not a defect):** 542/555 winners are `cached==true` (cache-seeded run); most performance margins are single-sample and should be re-measured before being quoted. See §5.
