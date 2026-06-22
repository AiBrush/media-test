# Browser Media-Engine Benchmark Report

Reference engine: `mediabunny` · Suite 0.1.0 · Generated 2026-06-22T00:11:00.235Z

Engines: `aibrush-media@dev`, `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `mp4box@2.3.0`, `platform@chrome-149`, `remotion-media-parser@4.0.479`, `remotion-webcodecs@4.0.479`, `web-demuxer@4.0.0` · Browsers: chromium · Scenarios: 557

All deltas are **within a single browser, vs the reference engine, on the same corpus.** Numbers are never compared across browsers (see Caveats).

> **Reading the matrix:** every completed cell shows **Pass (<execution time>)** when the operation ran correctly, or **N/A** when the engine or browser/runtime cannot support that case. Machine-readable `report.json` keeps the internal status distinction.

## 🏆 Leaderboard

| # | Engine | Wins | Conf % | Robust % | Bundle | Breadth | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ffmpeg.wasm@0.12.15` | 78 (73 unc.) | 100% | 86.8% | — | 13 | 78 wins (5 contested, 73 uncontested) · perf 0.85× vs winners · 100% conformant · 86.8% robust |
| 2 | `mediabunny@1.48.0` | 70 (63 unc.) | 100% | 88.9% | — | 13 | 70 wins (7 contested, 63 uncontested) · perf 0.91× vs winners · 100% conformant · 88.9% robust |
| 3 | `remotion-webcodecs@4.0.479` | 32 (28 unc.) | 100% | 63.4% | 94 kB | 9 | 32 wins (4 contested, 28 uncontested) · perf 0.74× vs winners · 100% conformant · 63.4% robust · 94 kB bundle |
| 4 | `remotion-media-parser@4.0.479` | 14 (8 unc.) | 100% | 60% | 72.6 kB | 6 | 14 wins (6 contested, 8 uncontested) · perf 0.89× vs winners · 100% conformant · 60% robust · 72.6 kB bundle |
| 5 | `mp4box@2.3.0` | 12 (7 unc.) | 100% | 40.5% | 41.3 kB | 8 | 12 wins (5 contested, 7 uncontested) · perf 0.94× vs winners · 100% conformant · 40.5% robust · 41.3 kB bundle |
| 6 | `web-demuxer@4.0.0` | 12 (9 unc.) | 100% | 46.7% | 43.2 kB | 6 | 12 wins (3 contested, 9 uncontested) · perf 0.53× vs winners · 100% conformant · 46.7% robust · 43.2 kB bundle |
| 7 | `platform@chrome-149` | 7 (4 unc.) | 100% | 43.8% | — | 8 | 7 wins (3 contested, 4 uncontested) · perf 0.56× vs winners · 100% conformant · 43.8% robust |
| 8 | `aibrush-media@dev` | 0 | 0% | 0% | — | 0 | 0 wins · 0% conformant · 0% robust |

_Wins = cases where the engine was the fastest CORRECT engine; co-winners of a tie both count, "unc." = uncontested (the only eligible engine). Win COUNTS are aggregated across browsers (counts are safe to sum; raw timing numbers are not — see Caveats). Ranked by wins, then conformance._

## Conformance summary (context)

| Engine | chromium conf % |
| --- | --- |
| `aibrush-media@dev` | 0% |
| `ffmpeg.wasm@0.12.15` | 100% |
| `mediabunny@1.48.0` | 100% |
| `mp4box@2.3.0` | 100% |
| `platform@chrome-149` | 100% |
| `remotion-media-parser@4.0.479` | 100% |
| `remotion-webcodecs@4.0.479` | 100% |
| `web-demuxer@4.0.0` | 100% |

## Browser: chromium

### 1. Result matrix — display value per engine × case

_Each completed cell is formatted as `Pass (<execution time>)` or `N/A`. Indicative for this browser only — never compared across browsers (see Caveats)._

| Case | Primary metric | aibrush-media@dev | ffmpeg.wasm@0.12.15 | mediabunny@1.48.0 | mp4box@2.3.0 | platform@chrome-149 | remotion-media-parser@4.0.479 | remotion-webcodecs@4.0.479 | web-demuxer@4.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | N/A | Pass (308 ms) | Pass (988 ms) | — | N/A | — | N/A | N/A |
| `audio-dsp/gain_half_f32` | — | N/A | Pass (189 ms) | Pass (55 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_backward_then_forward` | — | N/A | Pass (311 ms) | Pass (71 ms) | — | Pass (128 ms) | N/A | Pass (2.52 s) | Pass (197 ms) |
| `streaming-output/prop_decode_equals_stream_shape` | wall (ms) | N/A | Pass (555 ms) | Pass (326 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vfr_timing` | — | N/A | Pass (884 ms) | Pass (694 ms) | N/A | — | N/A | Pass (523 ms) | Pass (732 ms) |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | N/A | N/A | — | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_frame_accurate` | — | N/A | Pass (17.43 s) | — | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | N/A | Pass (220 ms) | Pass (323 ms) | N/A | N/A | — | N/A | N/A |
| `transcode/h264_resize_4k_to_1080p` | — | — | Pass (38.78 s) | Pass (2.15 s) | N/A | N/A | N/A | Pass (2.68 s) | N/A |
| `performance/bundle-size` | bundleSize (kB) | N/A | — | — | Pass (2.22 s) | — | Pass (19 ms) | Pass (20 ms) | Pass (85 ms) |
| `performance/convert-longtasks` | — | N/A | N/A | Pass (3.04 s) | N/A | N/A | N/A | Pass (7.75 s) | — |
| `audio-dsp/upmix_mono_to_stereo` | — | N/A | Pass (182 ms) | Pass (97 ms) | N/A | — | N/A | N/A | N/A |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | N/A | — | N/A | N/A | N/A | N/A |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | Pass (20.43 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_rotated90` | wall (ms) | N/A | Pass (156 ms) | Pass (2.64 ms) | Pass (39 ms) | Pass (37 ms) | Pass (13 ms) | Pass (6.59 ms) | Pass (86 ms) |
| `audio-dsp/downmix_stereo_to_mono` | — | N/A | Pass (184 ms) | Pass (57 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_aes128` | — | N/A | Pass (273 ms) | Pass (179 ms) | — | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | N/A | Pass (281 ms) | Pass (51 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | N/A | Pass (181 s) | Pass (15.86 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_cbr_notoc` | wall (ms) | N/A | — | Pass (24 ms) | N/A | — | Pass (10.09 ms) | Pass (13 ms) | N/A |
| `transcode/multitrack_select_default_audio` | — | N/A | Pass (12.8 s) | Pass (2.26 s) | N/A | — | N/A | Pass (1.11 s) | N/A |
| `mux/edge_bframes_decode_mux_mkv` | — | N/A | — | Pass (345 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/selfcheck_h264_resize_720p_tie` | — | N/A | Pass (57.25 s) | Pass (2.33 s) | N/A | N/A | N/A | — | N/A |
| `transcode/flac_to_aac_mp4` | — | N/A | Pass (976 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/huge_h264_mov_copy_peakmem` | throughputRealtime (x-realtime) | N/A | Pass (5.08 s) | Pass (666 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | N/A | Pass (247 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_copy_lazyread` | — | N/A | Pass (4.45 s) | Pass (5.04 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_noseektable` | — | N/A | Pass (254 ms) | Pass (4 ms) | N/A | N/A | Pass (29 ms) | Pass (24 ms) | — |
| `remux/micro_audio_short_mp4_to_adts` | — | N/A | Pass (157 ms) | Pass (45 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vp8` | decodeFps (fps) | N/A | Pass (609 ms) | Pass (421 ms) | — | Pass (379 ms) | N/A | Pass (619 ms) | Pass (252 ms) |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | N/A | Pass (569 ms) | Pass (334 ms) | N/A | — | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_44k1` | — | N/A | Pass (207 ms) | Pass (54 ms) | N/A | N/A | N/A | Pass (50 ms) | — |
| `demux/realworld_mdn_trex_mp3` | — | N/A | — | Pass (16 ms) | N/A | — | Pass (20 ms) | Pass (18 ms) | N/A |
| `performance/metamorphic-vfr-probe-duration` | opsPerSec (ops/s) | — | Pass (156 ms) | Pass (16 ms) | Pass (7.57 ms) | Pass (13.94 ms) | Pass (3.97 ms) | Pass (15.71 ms) | Pass (75 ms) |
| `probe/h264_4k_10s` | — | N/A | — | — | Pass (59 ms) | Pass (86 ms) | Pass (37 ms) | Pass (33 ms) | Pass (114 ms) |
| `mux/video_plus_audio_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (408 ms) | Pass (50.36 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_10bit_to_h264_8bit` | decodeFps (fps) | — | Pass (11.61 s) | N/A | N/A | N/A | N/A | N/A | — |
| `transcode/hevc_to_av1_webm` | — | N/A | N/A | Pass (3.3 s) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_minus6db_s16` | — | N/A | Pass (152 ms) | — | N/A | N/A | — | N/A | N/A |
| `performance/size-ladder-iterate-packets-medium` | — | N/A | Pass (280 ms) | Pass (52 ms) | Pass (69 ms) | Pass (93 ms) | Pass (32 ms) | Pass (3.81 s) | Pass (29 ms) |
| `probe/wav_s16` | — | N/A | Pass (182 ms) | Pass (14 ms) | N/A | Pass (36 ms) | Pass (27 ms) | Pass (32 ms) | — |
| `transcode/h264_vfr_to_cfr_30` | — | N/A | Pass (10.17 s) | Pass (2.11 s) | — | — | N/A | N/A | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | N/A | Pass (272 ms) | Pass (55 ms) | N/A | — | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_s16` | — | N/A | Pass (143 ms) | Pass (42 ms) | N/A | N/A | N/A | Pass (57 ms) | N/A |
| `transcode/ladder_tiny_h264_360p_resize_180p` | framesPerSec (fps) | N/A | Pass (544 ms) | Pass (228 ms) | N/A | N/A | N/A | Pass (232 ms) | N/A |
| `probe/perf-extract-metadata-huge` | opsPerSec (ops/s) | — | — | Pass (43 ms) | Pass (644 ms) | — | Pass (36 ms) | Pass (8.84 ms) | Pass (134 ms) |
| `transcode/h264_rotate_180` | — | N/A | Pass (71.18 s) | Pass (3.28 s) | N/A | N/A | N/A | Pass (5.55 s) | N/A |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | N/A | Pass (372 ms) | Pass (405 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s24_to_wav` | — | N/A | Pass (255 ms) | Pass (23 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp4_tags` | wall (ms) | N/A | Pass (125 ms) | Pass (994 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_flip_vertical` | — | N/A | Pass (75.07 s) | N/A | N/A | N/A | — | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | Pass (499 ms) | Pass (477 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_seektable_copy` | — | N/A | Pass (135 ms) | N/A | N/A | N/A | N/A | — | N/A |
| `remux/av1_720p_5s_webm_to_mkv` | throughputRealtime (x-realtime) | N/A | N/A | Pass (8.71 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/vp8_720p_10s` | wall (ms) | N/A | Pass (191 ms) | Pass (21 ms) | N/A | Pass (24 ms) | Pass (15.64 ms) | Pass (32 ms) | Pass (55 ms) |
| `demux/h264_in_mkv` | — | N/A | Pass (205 ms) | Pass (42 ms) | N/A | Pass (41 ms) | Pass (147 ms) | Pass (115 ms) | Pass (467 ms) |
| `demux/wav_s16` | — | N/A | Pass (151 ms) | Pass (8 ms) | N/A | Pass (18 ms) | Pass (32 ms) | Pass (22 ms) | N/A |
| `metadata/tracks_packet_attribution_multitrack` | packetsPerSec (packets/s) | N/A | Pass (283 ms) | Pass (31 ms) | Pass (34 ms) | Pass (36 ms) | Pass (247 ms) | Pass (114 ms) | Pass (467 ms) |
| `probe/recorder_headerless` | wall (ms) | N/A | Pass (136 ms) | — | N/A | — | Pass (9.42 ms) | Pass (61 ms) | — |
| `encryption/cenc_cbcs_decrypt` | — | N/A | N/A | Pass (770 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | N/A | Pass (434 ms) | Pass (85 ms) | N/A | — | N/A | Pass (347 ms) | Pass (237 ms) |
| `remux/av1_720p_5s_webm_to_mp4` | — | N/A | N/A | Pass (24 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_wav_pcm_copy` | — | N/A | Pass (171 ms) | Pass (30 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_seektable` | wall (ms) | N/A | Pass (151 ms) | Pass (3.52 ms) | N/A | N/A | Pass (22 ms) | Pass (20 ms) | N/A |
| `metadata/write_ogg_vorbiscomment` | wall (ms) | N/A | Pass (185 ms) | Pass (7.78 ms) | — | N/A | N/A | N/A | — |
| `probe/large_h264_1080p_120s` | — | N/A | Pass (431 ms) | — | Pass (168 ms) | Pass (189 ms) | Pass (33 ms) | Pass (40 ms) | Pass (110 ms) |
| `mux/mp4_faststart_reserve` | — | N/A | Pass (399 ms) | Pass (133 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_mp3_copy` | — | N/A | Pass (167 ms) | Pass (30 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_5_1_to_stereo` | throughputRealtime (x-realtime) | N/A | Pass (45.55 ms) | Pass (45.14 ms) | N/A | N/A | N/A | N/A | — |
| `demux/size_micro_micro_h264_1frame` | — | N/A | Pass (147 ms) | Pass (20 ms) | Pass (34 ms) | Pass (17 ms) | Pass (30 ms) | Pass (19 ms) | Pass (74 ms) |
| `mux/vorbis_to_ogg` | throughputRealtime (x-realtime) | N/A | Pass (16.31 ms) | Pass (34 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_webm` | throughputRealtime (x-realtime) | N/A | Pass (7.2 ms) | Pass (15 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_large_vp9_webm` | — | N/A | Pass (661 ms) | Pass (375 ms) | N/A | N/A | N/A | — | N/A |
| `probe/realworld_mdn_flower_webm` | — | N/A | — | Pass (15 ms) | N/A | Pass (43 ms) | Pass (34 ms) | Pass (22 ms) | Pass (60 ms) |
| `transcode/h264_resize_720p` | — | N/A | Pass (49.44 s) | Pass (6.19 s) | N/A | N/A | N/A | Pass (4.5 s) | N/A |
| `decode-seek/meta_seek_vs_linear_decode` | — | N/A | Pass (265 ms) | Pass (91 ms) | N/A | Pass (105 ms) | N/A | Pass (5.56 s) | Pass (185 ms) |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | N/A | Pass (207 ms) | N/A | — | N/A | N/A | N/A | N/A |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | N/A | N/A | Pass (1.4 s) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | wall (ms) | N/A | Pass (712 ms) | Pass (41.96 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/swap_audio_video_with_opus_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (223 ms) | Pass (117 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_xing` | wall (ms) | N/A | Pass (128 ms) | Pass (24 ms) | N/A | — | Pass (2.58 ms) | Pass (8 ms) | N/A |
| `probe/vp9_1080p_10s` | — | N/A | Pass (225 ms) | Pass (44 ms) | N/A | Pass (63 ms) | Pass (31 ms) | Pass (47 ms) | Pass (91 ms) |
| `streaming-output/ts_tiny_writes` | — | N/A | Pass (417 ms) | Pass (641 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/opus` | — | — | Pass (179 ms) | Pass (29 ms) | — | N/A | N/A | — | N/A |
| `probe/aac_adts` | — | — | Pass (178 ms) | Pass (15 ms) | N/A | N/A | Pass (18 ms) | Pass (33 ms) | N/A |
| `transcode/roundtrip_leg2_vp9_to_h264` | decodeFps (fps) | N/A | Pass (26.33 s) | Pass (2.32 s) | N/A | N/A | N/A | Pass (903 ms) | N/A |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | N/A | — | Pass (709 ms) | — | N/A | N/A | N/A | N/A |
| `trim/vp9_noop_full_range_idempotent` | — | N/A | Pass (6.54 s) | Pass (7.18 s) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_negative` | seekMs (ms) | N/A | Pass (276 ms) | Pass (50 ms) | N/A | Pass (134 ms) | — | Pass (1.93 s) | Pass (257 ms) |
| `remux/av1_720p_5s_webm_to_webm` | — | N/A | N/A | — | N/A | N/A | — | N/A | N/A |
| `decode-seek/decode_vp9` | — | N/A | Pass (1.11 s) | Pass (696 ms) | N/A | Pass (703 ms) | N/A | Pass (561 ms) | Pass (793 ms) |
| `demux/hls_vod` | — | N/A | Pass (218 ms) | Pass (74 ms) | N/A | N/A | Pass (412 ms) | — | N/A |
| `transcode/av1_to_h264_mp4` | — | N/A | N/A | Pass (1.26 s) | N/A | — | N/A | Pass (1.37 s) | N/A |
| `remux/h264_1080p_5s_mov_to_mkv` | — | N/A | Pass (196 ms) | Pass (77 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_44k1_to_48k` | — | N/A | Pass (183 ms) | Pass (80 ms) | N/A | N/A | N/A | Pass (71 ms) | N/A |
| `streaming-output/webm_headerless_live_stream` | — | N/A | N/A | Pass (26 ms) | N/A | — | N/A | N/A | N/A |
| `probe/h264_bframes_1080p` | wall (ms) | N/A | Pass (177 ms) | Pass (16 ms) | Pass (21.54 ms) | Pass (50 ms) | Pass (24 ms) | Pass (24 ms) | Pass (96 ms) |
| `trim/fmp4_fragment_boundary_copy` | — | N/A | Pass (4.52 s) | Pass (4.68 s) | N/A | N/A | N/A | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | N/A | Pass (327 ms) | — | Pass (126 ms) | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_5s` | wall (ms) | N/A | — | Pass (18 ms) | Pass (67 ms) | — | Pass (35 ms) | Pass (6.95 ms) | Pass (115 ms) |
| `remux/h264_in_mkv_mkv_to_ts` | — | N/A | Pass (267 ms) | Pass (110 ms) | — | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mov` | — | N/A | Pass (374 ms) | Pass (196 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_multitrack_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | Pass (2.16 s) | Pass (369 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_tiny_tiny_vp9_360p_2s` | wall (ms) | N/A | Pass (251 ms) | Pass (2.86 ms) | N/A | — | Pass (52 ms) | Pass (31 ms) | — |
| `transcode/gapless_pcm_to_opus_priming` | wall (ms) | N/A | N/A | Pass (600 ms) | N/A | N/A | N/A | Pass (56.27 ms) | N/A |
| `metadata/tagedit_no_corrupt_audio_flac` | — | N/A | Pass (138 ms) | Pass (24 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_in_mkv` | wall (ms) | N/A | Pass (42.45 ms) | Pass (26 ms) | — | Pass (39 ms) | Pass (41 ms) | Pass (27 ms) | Pass (133 ms) |
| `streaming-output/mp4_streaming_target` | — | N/A | Pass (348 ms) | Pass (914 ms) | Pass (117 ms) | — | N/A | N/A | N/A |
| `mux/opus_to_ogg` | — | N/A | Pass (158 ms) | Pass (23 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_rotate_90_dimswap` | — | N/A | Pass (71.85 s) | Pass (6.17 s) | N/A | N/A | N/A | N/A | — |
| `transcode/h264_fps_15_to_30` | — | — | Pass (8.71 s) | Pass (1.57 s) | N/A | — | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-huge` | — | N/A | Pass (1.48 s) | Pass (1 s) | Pass (1.02 s) | Pass (1 s) | — | Pass (72 ms) | Pass (51 ms) |
| `probe/massive_h264_1080p_2h` | wall (ms) | N/A | Pass (2.55 s) | Pass (303 ms) | Pass (1.77 s) | Pass (2.29 s) | Pass (270 ms) | Pass (340 ms) | Pass (322 ms) |
| `demux/metamorphic_flac_seektable_invariance` | — | N/A | Pass (166 ms) | Pass (23 ms) | N/A | N/A | — | Pass (36 ms) | N/A |
| `performance/size-ladder-demux-peak-memory-large` | — | N/A | Pass (362 ms) | Pass (362 ms) | Pass (245 ms) | Pass (224 ms) | Pass (20.06 s) | Pass (9.1 s) | Pass (6.81 s) |
| `transcode/h264_rotate_normalize` | — | N/A | Pass (14.6 s) | Pass (1.56 s) | N/A | N/A | N/A | Pass (1.02 s) | N/A |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | N/A | Pass (151 ms) | Pass (22 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/buffer_massive_h264_mp4` | — | N/A | Pass (7.34 s) | Pass (71.46 s) | — | N/A | N/A | N/A | N/A |
| `mux/aac_to_adts` | — | N/A | Pass (176 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_no_tags_wav` | wall (ms) | N/A | Pass (156 ms) | Pass (2.14 ms) | N/A | Pass (30 ms) | Pass (8.05 ms) | Pass (28 ms) | N/A |
| `transcode/h264_to_hevc_mp4` | decodeFps (fps) | N/A | N/A | Pass (2.86 s) | N/A | N/A | N/A | Pass (4.79 s) | N/A |
| `trim/vp8_keyframe_aligned` | — | N/A | Pass (2.24 s) | Pass (2.21 s) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | N/A | Pass (246 ms) | Pass (174 ms) | N/A | — | N/A | N/A | N/A |
| `transcode/hevc_to_vp9_webm` | decodeFps (fps) | N/A | N/A | Pass (2.38 s) | N/A | N/A | N/A | Pass (1.8 s) | N/A |
| `audio-dsp/throughput_encode_s24` | — | — | Pass (156 ms) | Pass (49 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/metamorphic_resize_same_1080p_idempotent` | — | N/A | Pass (70.4 s) | Pass (3.76 s) | N/A | N/A | N/A | Pass (2.88 s) | N/A |
| `streaming-output/mp4_fragmented_cmaf` | — | N/A | Pass (304 ms) | Pass (837 ms) | Pass (126 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16be_to_s16le` | — | N/A | Pass (174 ms) | N/A | N/A | N/A | — | N/A | N/A |
| `mux/opus_to_webm_audio` | throughputRealtime (x-realtime) | N/A | Pass (202 ms) | Pass (7.95 ms) | N/A | N/A | — | N/A | N/A |
| `transcode/wav_to_mp3_mp4` | — | N/A | Pass (733 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_ts` | — | N/A | Pass (261 ms) | — | N/A | N/A | N/A | — | N/A |
| `transcode/h264_to_vp8_webm` | — | N/A | Pass (2.35 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_tiny_dims_2x2_h264` | — | N/A | Pass (164 ms) | Pass (33 ms) | N/A | Pass (34 ms) | N/A | — | Pass (72 ms) |
| `transcode/h264_two_pass_bitrate` | decodeFps (fps) | N/A | Pass (80.82 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_hevc` | — | N/A | Pass (1.22 s) | Pass (683 ms) | N/A | Pass (654 ms) | N/A | Pass (1.51 s) | Pass (721 ms) |
| `probe/huge_vp9_1080p_240s` | wall (ms) | N/A | Pass (445 ms) | Pass (42 ms) | N/A | Pass (629 ms) | Pass (423 ms) | Pass (216 ms) | Pass (107 ms) |
| `mux/pcm_f32_to_wav` | — | N/A | Pass (264 ms) | Pass (25 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-probe` | opsPerSec (ops/s) | N/A | Pass (269 ms) | Pass (18 ms) | Pass (103 ms) | Pass (62 ms) | Pass (3.69 ms) | Pass (4.47 ms) | Pass (29.42 ms) |
| `decode-seek/seek_mkv_h264_keyframe` | seekMs (ms) | N/A | Pass (259 ms) | Pass (52 ms) | N/A | Pass (101 ms) | N/A | Pass (438 ms) | Pass (178 ms) |
| `streaming-output/webm_streaming_target` | — | N/A | Pass (246 ms) | Pass (76 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_bitrate_2mbps` | — | — | Pass (70.24 s) | Pass (5.27 s) | — | N/A | N/A | Pass (4.26 s) | — |
| `transcode/vp8_to_vp9_webm` | — | N/A | N/A | Pass (720 ms) | N/A | N/A | N/A | Pass (669 ms) | N/A |
| `performance/convert-webm-resize-320x180` | — | N/A | N/A | Pass (6.09 s) | N/A | N/A | N/A | Pass (3.9 s) | N/A |
| `performance/encode-fps` | framesPerSec (fps) | N/A | N/A | Pass (5.5 s) | N/A | N/A | N/A | Pass (5.28 s) | N/A |
| `probe/wav_s24` | — | — | Pass (225 ms) | Pass (16 ms) | N/A | Pass (15 ms) | Pass (24 ms) | Pass (5 ms) | N/A |
| `encryption/hls_aes128_decrypt` | — | N/A | Pass (993 ms) | Pass (879 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s16be` | — | N/A | Pass (186 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hevc_1080p_10s` | wall (ms) | N/A | Pass (233 ms) | Pass (53 ms) | Pass (34.14 ms) | Pass (34.67 ms) | Pass (1.54 s) | Pass (563 ms) | Pass (898 ms) |
| `mux/audio_only_aac_to_mp4` | — | N/A | Pass (160 ms) | Pass (26 ms) | N/A | N/A | N/A | N/A | — |
| `trim/audio_opus_ogg_copy` | throughputRealtime (x-realtime) | N/A | Pass (189 ms) | Pass (5.73 ms) | N/A | N/A | — | N/A | N/A |
| `trim/h264_open_gop_frame_accurate` | — | N/A | — | Pass (3.11 s) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_progressive_buffer` | — | N/A | Pass (573 ms) | Pass (116 ms) | Pass (235 ms) | N/A | N/A | — | N/A |
| `trim/h264_single_gop_frame_accurate` | throughputRealtime (x-realtime) | N/A | — | Pass (186 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_attribution_multitrack` | wall (ms) | — | Pass (24.61 ms) | Pass (39 ms) | Pass (57 ms) | Pass (29 ms) | Pass (56 ms) | — | Pass (22.01 ms) |
| `probe/wav_f32` | — | N/A | Pass (155 ms) | — | N/A | — | N/A | N/A | N/A |
| `transcode/av_downmix_stereo_to_mono` | — | N/A | Pass (70.29 s) | Pass (3.97 s) | — | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_5s` | — | — | Pass (183 ms) | Pass (43 ms) | Pass (55 ms) | — | Pass (98 ms) | — | Pass (378 ms) |
| `performance/decode-fps` | framesPerSec (fps) | — | N/A | Pass (262 ms) | N/A | Pass (313 ms) | N/A | Pass (1.75 s) | Pass (357 ms) |
| `remux/aac_adts_adts_to_mp4` | — | N/A | Pass (187 ms) | Pass (36 ms) | N/A | N/A | N/A | Pass (178 ms) | — |
| `metadata/read_h264_1080p_30s` | wall (ms) | N/A | Pass (199 ms) | Pass (18 ms) | Pass (65 ms) | Pass (161 ms) | Pass (22 ms) | Pass (31 ms) | Pass (30.9 ms) |
| `decode-seek/decode_mov_h264` | decodeFps (fps) | N/A | Pass (1.88 s) | — | N/A | Pass (1.13 s) | N/A | Pass (993 ms) | Pass (1.23 s) |
| `metadata/write_mp3_id3` | — | N/A | Pass (163 ms) | Pass (26 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_flower_mp4` | — | N/A | Pass (186 ms) | N/A | Pass (42 ms) | Pass (27 ms) | Pass (34 ms) | Pass (46 ms) | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | N/A | Pass (224 ms) | Pass (225 ms) | Pass (41 ms) | N/A | N/A | Pass (223 ms) | N/A |
| `metadata/meta_consistent_mp4_to_mkv` | — | N/A | Pass (372 ms) | Pass (554 ms) | N/A | N/A | — | N/A | N/A |
| `transcode/h264_fps_30_to_15` | — | N/A | Pass (46.51 s) | — | N/A | N/A | N/A | N/A | N/A |
| `demux/size_massive_massive_h264_1080p_2h` | — | N/A | Pass (4.73 s) | Pass (9.34 s) | Pass (3.1 s) | Pass (3.32 s) | Pass (467 ms) | Pass (403 ms) | Pass (428 ms) |
| `decode-seek/seek_h264_keyframe` | seekMs (ms) | N/A | Pass (318 ms) | Pass (46 ms) | N/A | Pass (189 ms) | — | Pass (2.86 s) | Pass (187 ms) |
| `mux/mp4_fragmented_cmaf` | — | N/A | Pass (410 ms) | — | Pass (285 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/fade_in_out_f32` | — | N/A | Pass (192 ms) | Pass (51 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/video_a_plus_audio_b_to_mkv` | — | N/A | Pass (450 ms) | Pass (104 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_xing` | — | N/A | Pass (223 ms) | Pass (25 ms) | N/A | N/A | Pass (41 ms) | — | N/A |
| `audio-dsp/pcm_s24_to_f32` | — | — | Pass (247 ms) | Pass (50 ms) | — | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mkv` | — | N/A | Pass (832 ms) | Pass (338 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mkv` | — | N/A | Pass (415 ms) | Pass (99 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/drop_audio_track_subset_to_mp4` | — | N/A | Pass (218 ms) | — | — | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mov` | — | N/A | Pass (279 ms) | Pass (72 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_fragmented_shape` | wall (ms) | N/A | Pass (116 ms) | Pass (614 ms) | Pass (86.78 ms) | N/A | N/A | N/A | N/A |
| `streaming-output/stream_massive_h264_mp4` | — | N/A | Pass (7.8 s) | Pass (55.46 s) | Pass (10.41 s) | N/A | N/A | N/A | N/A |
| `probe/micro_h264_1frame` | — | N/A | Pass (136 ms) | Pass (17 ms) | Pass (13 ms) | Pass (28 ms) | Pass (24 ms) | Pass (18 ms) | Pass (63 ms) |
| `probe/perf-extract-metadata-large` | opsPerSec (ops/s) | N/A | Pass (127 ms) | Pass (24 ms) | Pass (341 ms) | Pass (173 ms) | Pass (38 ms) | Pass (41 ms) | Pass (33.39 ms) |
| `performance/size-ladder-iterate-packets-large` | packetsPerSec (packets/s) | N/A | Pass (550 ms) | Pass (306 ms) | Pass (146 ms) | Pass (356 ms) | Pass (24.83 s) | Pass (46.99 s) | Pass (6.13 s) |
| `remux/mp3_xing_mp3_to_mkv` | — | N/A | Pass (199 ms) | Pass (24 ms) | N/A | N/A | — | N/A | N/A |
| `transcode/h264_flip_horizontal` | — | N/A | Pass (73.5 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_ts_to_mp4_duration_materialized` | wall (ms) | — | Pass (253 ms) | Pass (101 ms) | N/A | N/A | N/A | Pass (716 ms) | N/A |
| `encryption/unencrypted_left_untouched_noop` | — | N/A | Pass (1.2 s) | Pass (1.27 s) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mkv_tags` | — | N/A | Pass (400 ms) | Pass (214 ms) | — | N/A | N/A | — | N/A |
| `streaming-output/prop_ts_stream_duration_materialized` | wall (ms) | N/A | Pass (125 ms) | Pass (354 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_av1_keyframe` | seekMs (ms) | N/A | N/A | Pass (22.35 ms) | N/A | — | N/A | Pass (201 ms) | Pass (96 ms) |
| `performance/convert-peak-memory` | framesPerSec (fps) | N/A | N/A | Pass (5.28 s) | N/A | N/A | N/A | Pass (3.47 s) | N/A |
| `trim/vp9_keyframe_aligned` | — | — | Pass (3.94 s) | Pass (3.52 s) | N/A | N/A | — | N/A | N/A |
| `streaming-output/mp4_buffer_target` | — | N/A | Pass (329 ms) | Pass (431 ms) | Pass (147 ms) | — | N/A | N/A | N/A |
| `trim/massive_h264_copy_sustained` | — | N/A | — | Pass (112 s) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_variable_channel_count_downmix` | — | N/A | Pass (210 ms) | Pass (86 ms) | N/A | N/A | — | N/A | N/A |
| `probe/tiny_h264_360p_2s` | — | N/A | Pass (206 ms) | Pass (5 ms) | Pass (36 ms) | Pass (31 ms) | Pass (24 ms) | Pass (12 ms) | Pass (111 ms) |
| `trim/av1_keyframe_aligned` | — | N/A | N/A | Pass (1.8 s) | N/A | N/A | N/A | — | N/A |
| `remux/aac_adts_adts_to_ts` | — | N/A | Pass (187 ms) | Pass (30 ms) | — | N/A | N/A | N/A | — |
| `performance/op-sweep-demux` | — | N/A | Pass (300 ms) | Pass (140 ms) | Pass (102 ms) | — | Pass (55 ms) | Pass (1.99 s) | Pass (25 ms) |
| `performance/seek-ms` | — | N/A | Pass (278 ms) | Pass (55 ms) | N/A | Pass (115 ms) | N/A | Pass (9.4 s) | — |
| `remux/mp3_xing_mp3_to_mp4` | — | N/A | Pass (134 ms) | Pass (34 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_flac_vorbiscomment` | — | N/A | Pass (140 ms) | Pass (31 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_mux_duration_webm_to_webm` | wall (ms) | N/A | Pass (107 ms) | Pass (52 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/bframe_reorder_h264_to_vp9` | — | N/A | N/A | Pass (2.49 s) | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | N/A | — | — | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_audio_short` | — | N/A | Pass (159 ms) | Pass (19 ms) | Pass (29 ms) | — | Pass (35 ms) | Pass (29 ms) | Pass (70 ms) |
| `trim/h264_to_eof_copy` | — | N/A | Pass (3.07 s) | Pass (3.01 s) | — | N/A | N/A | N/A | N/A |
| `remux/h264_rotated90_mp4_to_mov` | — | N/A | Pass (243 ms) | Pass (280 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | N/A | Pass (246 ms) | Pass (273 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | N/A | Pass (1.76 s) | Pass (8.03 s) | Pass (1.72 s) | — | N/A | Pass (1.27 s) | N/A |
| `metadata/rotation_survives_mp4_mkv` | — | N/A | — | Pass (308 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_vfr` | — | N/A | Pass (182 ms) | N/A | Pass (43 ms) | Pass (31 ms) | Pass (18 ms) | Pass (28 ms) | N/A |
| `probe/h264_1080p_5s` | — | N/A | Pass (160 ms) | Pass (32 ms) | Pass (30 ms) | Pass (35 ms) | Pass (23 ms) | Pass (59 ms) | Pass (105 ms) |
| `probe/hevc_1080p_10s` | wall (ms) | N/A | Pass (179 ms) | Pass (7 ms) | Pass (49 ms) | Pass (32 ms) | Pass (44 ms) | Pass (32 ms) | Pass (9.7 ms) |
| `decode-seek/decode_multitrack_select_video` | decodeFps (fps) | N/A | Pass (632 ms) | — | N/A | Pass (353 ms) | N/A | Pass (340 ms) | Pass (365 ms) |
| `metadata/rotation_decode_read_h264_rotated90` | wall (ms) | N/A | N/A | N/A | N/A | Pass (107 ms) | N/A | — | N/A |
| `transcode/opus_to_aac_mp4` | — | N/A | Pass (960 ms) | Pass (687 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_rotated90` | wall (ms) | N/A | — | Pass (22 ms) | Pass (49 ms) | Pass (98 ms) | Pass (303 ms) | Pass (120 ms) | Pass (301 ms) |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | N/A | Pass (239 ms) | Pass (23 ms) | Pass (46 ms) | N/A | N/A | N/A | N/A |
| `transcode/mp3_to_aac_mp4` | — | N/A | Pass (916 ms) | Pass (672 ms) | N/A | N/A | N/A | Pass (662 ms) | N/A |
| `decode-seek/decode_h264_first_frames` | — | N/A | Pass (2.08 s) | Pass (1.44 s) | — | Pass (1.2 s) | — | Pass (3.9 s) | Pass (1.36 s) |
| `performance/metamorphic-vfr-iterate-packets` | packetsPerSec (packets/s) | N/A | Pass (188 ms) | N/A | Pass (8.37 ms) | Pass (70 ms) | Pass (25 ms) | Pass (17 ms) | N/A |
| `probe/h264_vfr` | — | N/A | Pass (192 ms) | Pass (23 ms) | Pass (27 ms) | Pass (32 ms) | Pass (26 ms) | Pass (12 ms) | Pass (99 ms) |
| `remux/h264_in_mkv_mkv_to_mov` | — | N/A | Pass (212 ms) | Pass (27 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/fanout_h264_abr_ladder` | — | N/A | N/A | Pass (13.3 s) | N/A | — | N/A | N/A | N/A |
| `performance/metamorphic-decode-remux` | — | N/A | Pass (623 ms) | Pass (878 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_past_eof` | seekMs (ms) | N/A | Pass (447 ms) | Pass (144 ms) | N/A | — | N/A | Pass (14.43 s) | Pass (215 ms) |
| `streaming-output/mp4_faststart_in_memory` | — | N/A | Pass (279 ms) | Pass (456 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_alpha_keyframe_aligned` | — | N/A | N/A | Pass (1.76 s) | N/A | N/A | — | N/A | N/A |
| `decode-seek/decode_tiny_dims_1x1` | — | N/A | Pass (164 ms) | Pass (24 ms) | N/A | — | N/A | Pass (27 ms) | Pass (185 ms) |
| `demux/size_huge_huge_h264_1080p_600s` | — | N/A | Pass (1.41 s) | Pass (905 ms) | Pass (805 ms) | Pass (1.13 s) | SKIPPED | Pass (45 ms) | Pass (73 ms) |
| `demux/flac_seektable` | — | N/A | Pass (167 ms) | Pass (23 ms) | N/A | N/A | Pass (26 ms) | Pass (37 ms) | N/A |
| `decode-seek/decode_bframes_reorder` | decodeFps (fps) | N/A | Pass (1.63 s) | Pass (1.23 s) | N/A | Pass (1.2 s) | N/A | Pass (1.39 s) | Pass (1.43 s) |
| `demux/size_tiny_tiny_h264_360p_2s` | wall (ms) | N/A | Pass (8.01 ms) | Pass (11 ms) | Pass (3.77 ms) | Pass (32 ms) | Pass (46 ms) | Pass (37 ms) | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | N/A | — | Pass (124 ms) | — | N/A | N/A | N/A | N/A |
| `transcode/h264_to_vp9_webm` | — | N/A | N/A | Pass (5.67 s) | N/A | N/A | N/A | — | N/A |
| `decode-seek/decode_size_tiny_h264_360p` | — | N/A | Pass (281 ms) | Pass (131 ms) | N/A | Pass (150 ms) | N/A | Pass (130 ms) | Pass (183 ms) |
| `mux/edge_multitrack_keep_all_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (307 ms) | Pass (48 ms) | Pass (33.06 ms) | N/A | N/A | — | N/A |
| `transcode/h264_to_ts` | — | N/A | N/A | — | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_cbr_notoc` | wall (ms) | N/A | Pass (8.5 ms) | Pass (42 ms) | N/A | N/A | Pass (2.04 ms) | Pass (22 ms) | N/A |
| `transcode/h264_crop_center` | — | — | Pass (53.86 s) | Pass (4 s) | N/A | — | N/A | N/A | — |
| `decode-seek/seek_vp8_keyframe` | seekMs (ms) | N/A | Pass (296 ms) | Pass (31 ms) | N/A | Pass (40 ms) | N/A | Pass (71.85 ms) | Pass (93 ms) |
| `trim/h264_keyframe_aligned` | — | — | Pass (4.64 s) | Pass (4.69 s) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_noseektable_copy` | — | N/A | Pass (239 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-massive` | packetsPerSec (packets/s) | N/A | Pass (4.85 s) | — | Pass (2.82 s) | Pass (3.08 s) | Pass (87.47 ms) | Pass (384 ms) | Pass (358 ms) |
| `probe/opus` | — | N/A | — | Pass (8 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_keyframe_aligned` | — | N/A | Pass (3.46 s) | Pass (3.22 s) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_hevc_keyframe` | seekMs (ms) | N/A | Pass (240 ms) | Pass (56 ms) | — | Pass (95 ms) | N/A | Pass (1.97 s) | Pass (69.51 ms) |
| `streaming-output/prop_decode_equals_buffer_shape` | wall (ms) | — | Pass (524 ms) | Pass (317 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | N/A | Pass (281 ms) | Pass (39 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_frame_accurate` | — | N/A | N/A | Pass (3.47 s) | N/A | N/A | N/A | N/A | — |
| `transcode/aac_to_pcm_wav_extract` | throughputRealtime (x-realtime) | N/A | Pass (163 ms) | Pass (49.11 ms) | N/A | N/A | N/A | Pass (98.98 ms) | N/A |
| `mux/three_track_assembly_to_mkv` | — | N/A | Pass (606 ms) | Pass (152 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_av1` | — | N/A | N/A | Pass (365 ms) | — | Pass (257 ms) | N/A | — | Pass (301 ms) |
| `performance/size-ladder-iterate-packets-huge` | — | N/A | Pass (1.23 s) | Pass (1.58 s) | Pass (802 ms) | Pass (1.4 s) | Pass (85.8 s) | — | Pass (57 ms) |
| `trim/h264_start_zero_copy` | — | N/A | Pass (4.06 s) | Pass (3.5 s) | N/A | N/A | N/A | — | N/A |
| `transcode/hdr10_to_sdr_tonemap` | — | N/A | Pass (862 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `probe/cenc_cbcs` | — | N/A | Pass (190 ms) | Pass (18 ms) | — | Pass (36 ms) | Pass (25 ms) | Pass (37 ms) | Pass (92 ms) |
| `decode-seek/decode_size_tiny_vp9_360p` | decodeFps (fps) | N/A | Pass (318 ms) | Pass (106 ms) | N/A | Pass (159 ms) | N/A | Pass (145 ms) | Pass (178 ms) |
| `decode-seek/seek_repeated_same_target` | — | N/A | — | Pass (49 ms) | N/A | Pass (122 ms) | N/A | Pass (4.8 s) | Pass (179 ms) |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | N/A | Pass (9.33 s) | Pass (63.93 s) | N/A | N/A | — | N/A | N/A |
| `transcode/mp3_to_opus_webm` | — | N/A | N/A | Pass (842 ms) | N/A | N/A | N/A | Pass (716 ms) | N/A |
| `probe/metamorphic-recorder-headerless-sane-duration` | wall (ms) | N/A | Pass (141 ms) | Pass (26 ms) | N/A | Pass (60 ms) | Pass (16.55 ms) | Pass (25 ms) | Pass (94 ms) |
| `audio-dsp/throughput_decode_s24` | — | N/A | Pass (189 ms) | Pass (77 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (6.16 ms) | Pass (34 ms) | — | N/A | — | N/A | N/A |
| `trim/h264_bframes_frame_accurate` | throughputRealtime (x-realtime) | N/A | Pass (6.63 s) | Pass (2.98 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/big_buck_bunny_1080p_h264` | wall (ms) | N/A | Pass (1.71 s) | Pass (44 ms) | Pass (1.27 s) | Pass (1.54 s) | Pass (7.39 ms) | Pass (9.28 ms) | Pass (135 ms) |
| `trim/large_h264_frame_accurate_throughput` | — | N/A | Pass (26.06 s) | — | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_vorbis_ogg` | — | N/A | Pass (198 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_multitrack_survives_mp4_mkv` | — | N/A | Pass (374 ms) | Pass (258 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_zero` | seekMs (ms) | N/A | Pass (308 ms) | Pass (42 ms) | N/A | Pass (83.13 ms) | N/A | Pass (3.45 s) | — |
| `performance/size-ladder-iterate-packets-tiny` | — | N/A | — | Pass (24 ms) | Pass (34 ms) | Pass (39 ms) | Pass (26 ms) | Pass (62 ms) | Pass (90 ms) |
| `decode-seek/decode_h264_10bit` | decodeFps (fps) | N/A | Pass (1.36 s) | Pass (781 ms) | N/A | — | N/A | Pass (582 ms) | Pass (687 ms) |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | N/A | Pass (618 ms) | Pass (4.15 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_flower_webm` | — | N/A | Pass (161 ms) | — | N/A | Pass (22 ms) | Pass (162 ms) | Pass (98 ms) | Pass (151 ms) |
| `mux/h264_aac_to_mov` | — | N/A | Pass (489 ms) | Pass (166 ms) | — | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (256 ms) | Pass (60 ms) | N/A | N/A | N/A | Pass (705 ms) | N/A |
| `performance/op-sweep-transcode-webm` | — | N/A | N/A | Pass (3.35 s) | N/A | N/A | — | Pass (4.09 s) | N/A |
| `remux/flac_seektable_flac_to_ogg` | — | N/A | Pass (136 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-huge` | — | — | Pass (934 ms) | Pass (59 ms) | — | — | Pass (51 ms) | — | Pass (128 ms) |
| `transcode/h264_rotate_270_dimswap` | — | N/A | Pass (11.44 s) | Pass (1.49 s) | N/A | N/A | N/A | — | N/A |
| `trim/ts_keyframe_aligned` | — | N/A | Pass (301 ms) | Pass (742 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_gapless_aac_decode` | — | N/A | N/A | Pass (31 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-large4k` | packetsPerSec (packets/s) | N/A | Pass (238 ms) | — | Pass (57 ms) | Pass (45.26 ms) | Pass (922 ms) | Pass (854 ms) | Pass (1.46 s) |
| `performance/metamorphic-transcode-idempotent-source-res` | — | N/A | N/A | — | — | N/A | N/A | Pass (8.76 s) | N/A |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | N/A | Pass (872 ms) | Pass (357 ms) | N/A | N/A | — | N/A | N/A |
| `mux/h264_aac_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (190 ms) | Pass (129 ms) | Pass (179 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | N/A | Pass (203 ms) | Pass (60 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/mkv_keyframe_aligned` | — | N/A | Pass (1.73 s) | Pass (1.94 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_vp9_1080p_120s` | — | — | Pass (542 ms) | Pass (252 ms) | N/A | Pass (283 ms) | Pass (692 ms) | — | Pass (6.83 s) |
| `audio-dsp/edge_longform_audio_resample_16k` | wall (ms) | N/A | Pass (4.26 s) | Pass (4.51 s) | N/A | N/A | N/A | Pass (15.02 s) | N/A |
| `decode-seek/decode_size_large_vp9_120s` | decodeFps (fps) | N/A | Pass (2.19 s) | Pass (1.19 s) | N/A | Pass (1.61 s) | N/A | Pass (1.38 s) | Pass (1.18 s) |
| `decode-seek/seek_h264_nonkeyframe` | — | N/A | Pass (524 ms) | Pass (120 ms) | N/A | — | N/A | Pass (7 s) | Pass (224 ms) |
| `transcode/hevc_to_h264_mp4` | — | N/A | Pass (26.68 s) | Pass (2.07 s) | N/A | N/A | N/A | Pass (2.15 s) | N/A |
| `probe/longform_1h_audio` | — | N/A | Pass (349 ms) | — | Pass (188 ms) | Pass (230 ms) | — | Pass (93 ms) | Pass (132 ms) |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | N/A | Pass (74.13 s) | Pass (4 s) | — | N/A | N/A | N/A | N/A |
| `demux/size_large_large_h264_1080p_120s` | wall (ms) | N/A | Pass (372 ms) | Pass (265 ms) | Pass (227 ms) | Pass (174 ms) | Pass (10.5 s) | Pass (19.21 s) | Pass (5.44 s) |
| `remux/h264_multitrack_mp4_to_mkv` | throughputRealtime (x-realtime) | — | Pass (41.55 ms) | Pass (144 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s16be` | — | N/A | Pass (192 ms) | N/A | N/A | — | — | N/A | N/A |
| `remux/prop_recorder_headerless_duration_materialized` | — | N/A | Pass (210 ms) | Pass (31 ms) | N/A | — | N/A | N/A | N/A |
| `probe/tiny_vp9_360p_2s` | — | N/A | Pass (182 ms) | Pass (37 ms) | N/A | Pass (22 ms) | Pass (18 ms) | Pass (32 ms) | Pass (65 ms) |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | N/A | Pass (361 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_fps_240` | — | N/A | N/A | Pass (29.52 s) | — | N/A | N/A | N/A | N/A |
| `decode-seek/decode_h264_4k` | decodeFps (fps) | N/A | Pass (4.13 s) | Pass (2.13 s) | N/A | Pass (2.12 s) | N/A | Pass (3.02 s) | Pass (2.4 s) |
| `demux/h264_ts` | wall (ms) | N/A | Pass (48.7 ms) | Pass (38.7 ms) | N/A | N/A | — | Pass (172 ms) | N/A |
| `probe/realworld_mdn_flower_mp4` | — | N/A | Pass (155 ms) | Pass (28 ms) | Pass (29 ms) | Pass (29 ms) | Pass (28 ms) | Pass (25 ms) | Pass (106 ms) |
| `performance/size-ladder-extract-metadata-tiny` | — | N/A | — | Pass (56 ms) | — | Pass (21 ms) | Pass (23 ms) | Pass (24 ms) | Pass (78 ms) |
| `probe/av1_720p_5s` | — | N/A | N/A | Pass (19 ms) | N/A | Pass (44 ms) | Pass (24 ms) | Pass (40 ms) | Pass (66 ms) |
| `demux/wav_s24` | wall (ms) | N/A | Pass (146 ms) | Pass (25 ms) | N/A | Pass (45 ms) | Pass (28 ms) | Pass (5.07 ms) | N/A |
| `performance/metamorphic-probe-duration-cross-container` | — | N/A | N/A | Pass (4.08 s) | N/A | N/A | N/A | Pass (8.76 s) | N/A |
| `decode-seek/decode_extreme_fps_1` | decodeFps (fps) | N/A | — | Pass (110 ms) | N/A | Pass (86 ms) | N/A | Pass (26.12 ms) | Pass (96 ms) |
| `metadata/read_no_tags_recorder_webm` | wall (ms) | N/A | — | Pass (17 ms) | N/A | Pass (38 ms) | Pass (13.36 ms) | Pass (39 ms) | Pass (87 ms) |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | Pass (492 ms) | Pass (562 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/empty_audio_zero_packets` | wall (ms) | N/A | — | Pass (2.05 ms) | N/A | Pass (22 ms) | Pass (16 ms) | — | N/A |
| `transcode/vp9_to_vp8_webm` | decodeFps (fps) | N/A | Pass (42.53 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_reserve` | — | N/A | Pass (327 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | wall (ms) | N/A | Pass (118 ms) | Pass (330 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/aac_to_opus_webm` | — | N/A | N/A | Pass (751 ms) | N/A | N/A | N/A | Pass (664 ms) | N/A |
| `performance/op-sweep-remux-mp4-to-mkv` | — | N/A | Pass (968 ms) | Pass (1.06 s) | N/A | N/A | N/A | — | N/A |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | N/A | Pass (26 ms) | — | N/A | N/A | N/A | N/A |
| `decode-seek/meta_pts_monotonic_after_reorder` | wall (ms) | N/A | Pass (1.7 s) | Pass (1.18 s) | N/A | Pass (1.22 s) | N/A | Pass (2.09 s) | — |
| `streaming-output/ts_continuity_many_writes` | — | N/A | — | Pass (816 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vp9_keyframe` | — | N/A | Pass (859 ms) | Pass (57 ms) | N/A | Pass (146 ms) | N/A | Pass (797 ms) | Pass (231 ms) |
| `metadata/read_flac_seektable` | — | N/A | Pass (171 ms) | Pass (8 ms) | N/A | N/A | — | Pass (21 ms) | N/A |
| `probe/metamorphic-duration-across-containers` | wall (ms) | N/A | Pass (307 ms) | Pass (59 ms) | N/A | Pass (74.46 ms) | — | Pass (20.97 ms) | Pass (158 ms) |
| `mux/av1_opus_to_mp4` | — | N/A | N/A | Pass (35 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_rotated_keyframe_aligned` | — | N/A | Pass (2.17 s) | Pass (2.08 s) | N/A | N/A | N/A | N/A | N/A |
| `mux/flac_to_mkv_audio` | — | N/A | Pass (150 ms) | Pass (19 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_audio_short` | wall (ms) | N/A | Pass (6.97 ms) | Pass (16 ms) | Pass (38 ms) | Pass (6.58 ms) | Pass (8 ms) | Pass (42 ms) | Pass (64 ms) |
| `transcode/vp9_to_h264_mp4` | decodeFps (fps) | N/A | Pass (26.27 s) | Pass (1.96 s) | N/A | N/A | N/A | Pass (893 ms) | N/A |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | framesPerSec (fps) | — | Pass (738 ms) | Pass (188 ms) | N/A | N/A | — | Pass (285 ms) | N/A |
| `decode-seek/decode_vp9_alpha` | — | N/A | N/A | Pass (300 ms) | — | Pass (286 ms) | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-medium` | opsPerSec (ops/s) | — | Pass (206 ms) | Pass (7 ms) | Pass (73 ms) | Pass (76 ms) | Pass (3.66 ms) | Pass (20 ms) | Pass (30.83 ms) |
| `audio-dsp/upmix_stereo_to_5_1` | — | N/A | — | Pass (102 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24be_to_s16le` | — | N/A | Pass (159 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_opus_ogg` | — | N/A | N/A | Pass (127 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_f32` | — | N/A | Pass (180 ms) | Pass (9 ms) | N/A | Pass (23 ms) | N/A | N/A | N/A |
| `remux/prop_rotation_survives_mp4_mov` | — | — | Pass (393 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `probe/empty-audio-wav` | wall (ms) | — | Pass (125 ms) | Pass (4.11 ms) | N/A | Pass (29 ms) | Pass (1.84 ms) | Pass (21 ms) | N/A |
| `transcode/bframe_reorder_h264_to_h264` | — | N/A | Pass (24.44 s) | Pass (2.41 s) | N/A | N/A | N/A | — | N/A |
| `demux/aac_adts` | — | N/A | — | Pass (21 ms) | N/A | N/A | Pass (32 ms) | Pass (49 ms) | N/A |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | wall (ms) | N/A | Pass (566 ms) | Pass (342 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_longform_audio_probe` | wall (ms) | N/A | Pass (417 ms) | Pass (37 ms) | N/A | Pass (677 ms) | — | Pass (50 ms) | N/A |
| `decode-seek/decode_size_micro_h264_1frame` | decodeFps (fps) | N/A | Pass (182 ms) | Pass (33 ms) | N/A | Pass (31 ms) | N/A | Pass (4.52 ms) | Pass (59 ms) |
| `mux/size_micro_1frame_to_mp4` | — | N/A | — | — | Pass (28 ms) | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mkv` | — | N/A | Pass (327 ms) | — | N/A | N/A | — | N/A | N/A |
| `metadata/read_h264_in_mkv` | wall (ms) | N/A | Pass (209 ms) | Pass (30 ms) | N/A | Pass (98 ms) | Pass (17.25 ms) | Pass (45 ms) | Pass (128 ms) |
| `performance/extract-metadata` | — | N/A | Pass (262 ms) | Pass (23 ms) | — | Pass (117 ms) | Pass (28 ms) | Pass (42 ms) | Pass (76 ms) |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | Pass (512 ms) | Pass (876 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | Pass (1.82 s) | Pass (8.06 s) | Pass (1.53 s) | N/A | N/A | N/A | N/A |
| `metadata/read_h264_multitrack` | — | N/A | Pass (166 ms) | Pass (16 ms) | Pass (42 ms) | Pass (70 ms) | Pass (22 ms) | Pass (25 ms) | Pass (71 ms) |
| `performance/size-ladder-extract-metadata-massive` | — | N/A | Pass (2.42 s) | Pass (296 ms) | Pass (2.22 s) | Pass (3.08 s) | Pass (295 ms) | Pass (406 ms) | Pass (606 ms) |
| `mux/edge_hevc_decode_mux_mkv` | — | N/A | Pass (584 ms) | Pass (303 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_av1_mp4` | — | N/A | N/A | Pass (7.84 s) | — | N/A | N/A | — | N/A |
| `demux/pcm_s16be` | — | N/A | Pass (183 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_30s` | wall (ms) | N/A | Pass (210 ms) | Pass (28 ms) | Pass (38.77 ms) | Pass (147 ms) | Pass (48 ms) | Pass (26 ms) | Pass (83 ms) |
| `probe/cenc_ctr` | — | N/A | Pass (179 ms) | SKIPPED | Pass (34 ms) | Pass (51 ms) | Pass (40 ms) | Pass (23 ms) | — |
| `probe/h264_ts` | wall (ms) | N/A | Pass (47.72 ms) | — | N/A | N/A | Pass (318 ms) | Pass (275 ms) | Pass (380 ms) |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | N/A | Pass (916 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mp4` | — | N/A | Pass (291 ms) | Pass (49 ms) | N/A | N/A | N/A | — | N/A |
| `transcode/flac_to_opus_webm` | — | N/A | N/A | — | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mkv` | — | N/A | Pass (280 ms) | Pass (67 ms) | N/A | N/A | N/A | — | N/A |
| `demux/h264_multitrack` | — | N/A | Pass (209 ms) | Pass (48 ms) | Pass (95 ms) | Pass (84 ms) | — | Pass (303 ms) | Pass (609 ms) |
| `transcode/h264_fps_30_to_60` | decodeFps (fps) | N/A | Pass (99.23 s) | Pass (5.02 s) | N/A | — | N/A | N/A | N/A |
| `trim/mov_keyframe_aligned` | — | N/A | Pass (3.07 s) | Pass (3.04 s) | N/A | N/A | N/A | N/A | N/A |
| `remux/vp8_720p_10s_webm_to_mkv` | — | N/A | Pass (155 ms) | Pass (42 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_30s` | wall (ms) | N/A | Pass (82.55 ms) | Pass (111 ms) | Pass (58.36 ms) | Pass (135 ms) | Pass (27 ms) | Pass (2.35 s) | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | N/A | Pass (167 ms) | N/A | N/A | — | — | N/A | N/A |
| `demux/vp9_alpha` | — | N/A | — | Pass (22 ms) | N/A | Pass (29 ms) | — | — | Pass (153 ms) |
| `streaming-output/mp4_ttfb_buffer_target` | — | N/A | Pass (351 ms) | Pass (437 ms) | Pass (163 ms) | N/A | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | N/A | — | — | — | Pass (346 ms) | — | Pass (459 ms) | N/A |
| `probe/perf-extract-metadata-massive` | opsPerSec (ops/s) | N/A | Pass (1.97 s) | Pass (328 ms) | Pass (2.41 s) | Pass (3.47 s) | — | Pass (367 ms) | Pass (318 ms) |
| `mux/mp3_to_mp4_audio` | — | N/A | Pass (144 ms) | Pass (20 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp3` | — | N/A | Pass (212 ms) | Pass (22 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_streaming_target` | — | N/A | Pass (388 ms) | Pass (128 ms) | Pass (227 ms) | N/A | N/A | — | N/A |
| `mux/h264_aac_to_ts` | — | N/A | Pass (409 ms) | Pass (228 ms) | N/A | N/A | N/A | N/A | — |
| `transcode/h264_colorspace_709_to_2020` | — | N/A | Pass (89.18 s) | — | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | Pass (548 ms) | Pass (1.21 s) | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_vp8_webm` | — | N/A | — | N/A | N/A | N/A | — | N/A | — |
| `mux/size_micro_1frame_to_mkv` | — | N/A | Pass (159 ms) | Pass (21 ms) | — | N/A | N/A | — | N/A |
| `transcode/wav_to_flac` | — | — | Pass (230 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/large_vp9_1080p_120s` | wall (ms) | N/A | Pass (309 ms) | — | N/A | Pass (175 ms) | Pass (180 ms) | Pass (270 ms) | Pass (120 ms) |
| `probe/hls_aes128` | — | N/A | Pass (231 ms) | Pass (88 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mov` | — | N/A | Pass (409 ms) | Pass (907 ms) | N/A | — | — | N/A | N/A |
| `mux/size_longform_audio_to_mp4` | — | N/A | Pass (5.58 s) | Pass (5.47 s) | Pass (3.48 s) | N/A | N/A | — | N/A |
| `decode-seek/decode_size_huge_h264_600s` | decodeFps (fps) | N/A | N/A | Pass (1.22 s) | N/A | Pass (1.78 s) | N/A | SKIPPED | Pass (1.16 s) |
| `audio-dsp/resample_48k_to_16k` | — | N/A | Pass (175 ms) | Pass (68 ms) | N/A | N/A | N/A | Pass (48 ms) | — |
| `remux/opus_ogg_to_mkv` | — | N/A | Pass (148 ms) | Pass (26 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | N/A | Pass (408 ms) | N/A | N/A | N/A | — | N/A | N/A |
| `mux/pcm_s16_to_wav` | — | N/A | Pass (256 ms) | Pass (20 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_opus` | wall (ms) | N/A | Pass (200 ms) | Pass (2.44 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large` | — | N/A | Pass (384 ms) | Pass (31 ms) | Pass (182 ms) | — | Pass (40 ms) | — | — |
| `decode-seek/decode_mkv_h264` | — | N/A | Pass (1.05 s) | Pass (625 ms) | — | Pass (678 ms) | N/A | Pass (568 ms) | Pass (760 ms) |
| `demux/vp8_720p_10s` | — | N/A | Pass (181 ms) | Pass (41 ms) | N/A | Pass (48 ms) | Pass (238 ms) | Pass (205 ms) | Pass (182 ms) |
| `trim/audio_aac_adts_copy` | — | — | — | Pass (63 ms) | N/A | N/A | N/A | — | N/A |
| `mux/size_large_1080p_to_mp4` | — | N/A | Pass (901 ms) | Pass (373 ms) | Pass (589 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_f32_to_s16` | throughputRealtime (x-realtime) | N/A | Pass (148 ms) | Pass (23.15 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/size_tiny_360p_to_mp4` | — | N/A | Pass (225 ms) | Pass (24 ms) | Pass (60 ms) | N/A | N/A | N/A | N/A |
| `decode-seek/decode_extreme_fps_240` | decodeFps (fps) | N/A | Pass (487 ms) | Pass (485 ms) | N/A | Pass (154 ms) | N/A | Pass (335 ms) | Pass (219 ms) |
| `transcode/h264_crf_quality_mode` | — | — | Pass (63.84 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt` | — | N/A | Pass (1.04 s) | N/A | N/A | N/A | N/A | — | N/A |
| `audio-dsp/pcm_s16_to_f32` | — | N/A | Pass (214 ms) | Pass (51 ms) | N/A | N/A | N/A | — | — |
| `transcode/h264_to_mov` | — | N/A | Pass (70.19 s) | Pass (4.67 s) | — | N/A | — | N/A | N/A |
| `metadata/read_vp9_1080p_10s` | — | N/A | Pass (188 ms) | Pass (124 ms) | N/A | Pass (69 ms) | Pass (36 ms) | Pass (41 ms) | Pass (103 ms) |
| `probe/huge_h264_1080p_600s` | — | N/A | Pass (739 ms) | Pass (58 ms) | Pass (573 ms) | Pass (753 ms) | Pass (52 ms) | Pass (65 ms) | Pass (139 ms) |
| `mux/edge_hevc_decode_mux_mp4` | — | N/A | Pass (555 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/aiff_container_probe` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_aac_mp4` | — | N/A | Pass (886 ms) | Pass (610 ms) | N/A | N/A | N/A | Pass (783 ms) | N/A |
| `demux/flac_noseektable` | — | N/A | Pass (140 ms) | — | N/A | N/A | Pass (37 ms) | Pass (44 ms) | N/A |
| `probe/realworld_mdn_trex_mp3` | — | N/A | Pass (142 ms) | Pass (4 ms) | — | N/A | Pass (28 ms) | Pass (38 ms) | N/A |
| `transcode/h264_to_fragmented_mp4` | — | N/A | Pass (72.05 s) | Pass (5.12 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_multitrack` | wall (ms) | N/A | Pass (183 ms) | Pass (2.18 ms) | Pass (31 ms) | Pass (20.13 ms) | Pass (20 ms) | Pass (30 ms) | Pass (113 ms) |
| `performance/size-ladder-iterate-packets-large4k` | packetsPerSec (packets/s) | N/A | Pass (72.91 ms) | — | Pass (71 ms) | Pass (101 ms) | Pass (1.23 s) | Pass (620 ms) | Pass (1.68 s) |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | N/A | Pass (490 ms) | Pass (540 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_buffer_shape` | wall (ms) | N/A | Pass (122 ms) | Pass (910 ms) | Pass (159 ms) | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | N/A | Pass (978 ms) | Pass (896 ms) | N/A | N/A | N/A | — | N/A |
| `trim/h264_keyframe_aligned_short` | — | N/A | — | Pass (2.12 s) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | N/A | Pass (316 ms) | Pass (95 ms) | N/A | — | N/A | N/A | N/A |
| `decode-seek/seek_vfr_arbitrary` | — | N/A | Pass (423 ms) | Pass (79 ms) | N/A | — | — | — | Pass (207 ms) |
| `transcode/aac_to_mp3_mp4` | — | N/A | Pass (805 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_bframes_midgop` | seekMs (ms) | N/A | Pass (820 ms) | Pass (198 ms) | — | Pass (154 ms) | N/A | Pass (2.3 s) | Pass (299 ms) |
| `remux/vp9_1080p_10s_webm_to_webm` | — | N/A | Pass (265 ms) | Pass (75 ms) | — | N/A | N/A | Pass (283 ms) | N/A |
| `demux/h264_4k_10s` | — | — | — | Pass (71 ms) | Pass (80 ms) | Pass (79 ms) | Pass (2.61 s) | Pass (1.76 s) | Pass (1.47 s) |
| `probe/hls_vod` | wall (ms) | N/A | — | — | N/A | N/A | Pass (405 ms) | Pass (321 ms) | N/A |
| `metadata/read_pcm_s16be` | — | N/A | Pass (168 ms) | N/A | N/A | N/A | N/A | — | N/A |
| `audio-dsp/caf_container_probe` | — | N/A | Pass (174 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `probe/pcm_s16be` | — | N/A | Pass (190 ms) | N/A | N/A | N/A | — | N/A | — |
| `demux/h264_bframes_1080p` | — | N/A | Pass (230 ms) | N/A | Pass (76 ms) | Pass (65 ms) | Pass (1.65 s) | Pass (1.12 s) | N/A |
| `mux/vp9_opus_to_webm` | — | N/A | Pass (336 ms) | Pass (67 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_to_av1_webm` | decodeFps (fps) | N/A | N/A | Pass (2.27 s) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large4k` | opsPerSec (ops/s) | N/A | — | Pass (41 ms) | — | Pass (80 ms) | Pass (31 ms) | Pass (7.01 ms) | Pass (121 ms) |
| `transcode/extreme_fps_1` | — | N/A | Pass (9.58 s) | Pass (1.34 s) | — | N/A | N/A | N/A | N/A |
| `performance/iterate-video-packets` | — | N/A | Pass (295 ms) | Pass (58 ms) | Pass (109 ms) | Pass (161 ms) | Pass (55 ms) | — | Pass (26 ms) |
| `trim/h264_vfr_frame_accurate` | — | — | Pass (3.56 s) | Pass (1.06 s) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_open_gop_first_frame` | — | N/A | Pass (906 ms) | Pass (358 ms) | N/A | Pass (360 ms) | — | Pass (433 ms) | Pass (415 ms) |
| `remux/prop_adts_to_mp4_duration_invariant` | — | N/A | — | — | — | N/A | N/A | Pass (192 ms) | N/A |
| `transcode/av1_to_vp9_webm` | — | N/A | N/A | Pass (1.28 s) | N/A | N/A | — | Pass (1.47 s) | N/A |
| `transcode/h264_to_mkv` | decodeFps (fps) | N/A | — | Pass (2.56 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/massive_vp9_1080p_2h` | — | N/A | Pass (1.85 s) | Pass (462 ms) | N/A | — | Pass (393 ms) | Pass (263 ms) | Pass (424 ms) |
| `metadata/read_mp3_xing` | — | — | Pass (135 ms) | — | N/A | — | Pass (23 ms) | Pass (5 ms) | N/A |
| `demux/vp9_1080p_10s` | — | N/A | Pass (221 ms) | Pass (50 ms) | N/A | Pass (104 ms) | Pass (102 ms) | Pass (81 ms) | Pass (795 ms) |
| `trim/h264_noop_full_range_idempotent` | — | — | — | Pass (18.6 s) | N/A | — | — | N/A | N/A |
| `mux/edge_bframes_decode_mux_mp4` | — | N/A | Pass (519 ms) | Pass (340 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | N/A | N/A | Pass (4.3 s) | N/A | N/A | — | Pass (6.1 s) | N/A |
| `probe/vp9_alpha` | — | N/A | — | Pass (38 ms) | N/A | Pass (45 ms) | Pass (40 ms) | Pass (37 ms) | — |
| `streaming-output/stream_large_h264_mp4` | — | N/A | Pass (592 ms) | — | Pass (333 ms) | — | N/A | N/A | N/A |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | N/A | N/A | Pass (5.21 s) | N/A | N/A | N/A | Pass (8.59 s) | N/A |
| `trim/h264_subframe_range_frame_accurate` | — | — | Pass (1.58 s) | Pass (239 ms) | N/A | N/A | — | N/A | N/A |
| `demux/av1_720p_5s` | — | N/A | N/A | Pass (71 ms) | — | Pass (25 ms) | Pass (78 ms) | — | Pass (234 ms) |
| `streaming-output/prop_probe_dur_stream_shape` | — | N/A | Pass (378 ms) | Pass (791 ms) | Pass (159 ms) | N/A | N/A | N/A | N/A |
| `transcode/vp8_to_h264_mp4` | — | — | Pass (12.82 s) | N/A | N/A | N/A | — | — | N/A |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | N/A | Pass (360 ms) | Pass (103 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_large_h264_120s` | — | N/A | Pass (1.9 s) | Pass (1.22 s) | N/A | — | — | Pass (24.08 s) | — |
| `transcode/gapless_pcm_to_aac_priming` | — | N/A | Pass (938 ms) | Pass (658 ms) | N/A | — | — | — | N/A |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | N/A | Pass (475 ms) | Pass (289 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_no_media_tracks_probe` | — | N/A | Pass (116 ms) | — | N/A | Pass (16 ms) | Pass (15 ms) | Pass (14 ms) | N/A |
| `trim/robust_start_past_eof` | — | — | Pass (191 ms) | Pass (100 ms) | — | N/A | — | — | N/A |
| `robustness/prop_trim_additivity_compose` | — | — | — | N/A | N/A | — | N/A | N/A | — |
| `robustness/edge_pcm_s16be_probe` | — | N/A | Pass (117 ms) | N/A | N/A | N/A | — | N/A | — |
| `encryption/cenc_ctr_truncated_mdat_graceful` | — | N/A | Pass (115 ms) | — | N/A | N/A | — | N/A | — |
| `robustness/fuzz_mp3_header_truncated_probe` | — | N/A | Pass (132 ms) | Pass (12 ms) | N/A | — | — | Pass (11 ms) | N/A |
| `trim/robust_bitflipped_source` | — | N/A | — | Pass (149 ms) | N/A | — | N/A | — | — |
| `robustness/edge_audio_only_probe` | — | N/A | — | Pass (5 ms) | Pass (13 ms) | Pass (22 ms) | Pass (25 ms) | — | Pass (41 ms) |
| `robustness/prop_remux_duration_preserved` | — | N/A | — | — | — | N/A | N/A | N/A | N/A |
| `robustness/edge_seek_past_eof` | — | N/A | Pass (629 ms) | — | N/A | — | N/A | Pass (11.53 s) | Pass (187 ms) |
| `probe/truncated-header-graceful` | — | — | — | Pass (14 ms) | Pass (4 ms) | Pass (14 ms) | Pass (12 ms) | — | — |
| `robustness/edge_audio_only_micro_probe` | — | — | Pass (121 ms) | Pass (5 ms) | Pass (12 ms) | Pass (16 ms) | Pass (10 ms) | Pass (5 ms) | — |
| `robustness/prop_duration_consistent_across_containers` | — | N/A | Pass (254 ms) | — | N/A | Pass (106 ms) | Pass (37 ms) | Pass (41 ms) | Pass (163 ms) |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | — | Pass (112 ms) | Pass (26 ms) | N/A | N/A | N/A | — | N/A |
| `robustness/fuzz_webm_header_truncated_demux` | — | — | Pass (204 ms) | — | N/A | N/A | — | — | — |
| `demux/graceful_zero_length` | — | N/A | — | — | Pass (3 ms) | N/A | Pass (5 ms) | — | — |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | N/A | Pass (189 ms) | Pass (19 ms) | N/A | N/A | Pass (68 ms) | Pass (61 ms) | N/A |
| `demux/graceful_webm_header_destroyed` | — | N/A | Pass (199 ms) | — | N/A | N/A | — | Pass (6 ms) | Pass (138 ms) |
| `robustness/fuzz_mux_target_corrupt_remux` | — | — | Pass (254 ms) | Pass (52 ms) | Pass (98 ms) | N/A | N/A | Pass (2.05 s) | N/A |
| `robustness/edge_faststart_reserve_remux` | — | — | Pass (983 ms) | — | — | — | N/A | — | — |
| `robustness/edge_dims_1x1_probe` | — | N/A | Pass (123 ms) | — | N/A | — | Pass (15 ms) | Pass (16 ms) | — |
| `robustness/fuzz_truncated_h264_asset_demux` | — | N/A | Pass (123 ms) | — | Pass (4 ms) | N/A | Pass (14 ms) | Pass (13 ms) | — |
| `trim/robust_end_far_past_eof` | — | N/A | Pass (189 ms) | Pass (118 ms) | N/A | N/A | — | — | — |
| `robustness/edge_flac_without_seektable_probe` | — | N/A | Pass (119 ms) | — | — | — | — | Pass (17 ms) | — |
| `demux/graceful_truncated_h264` | — | N/A | — | Pass (4 ms) | — | N/A | Pass (13 ms) | — | Pass (27 ms) |
| `remux/neg_headerless_webm_to_mkv` | — | N/A | — | Pass (13 ms) | — | N/A | — | N/A | — |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | N/A | Pass (118 ms) | Pass (6 ms) | — | — | N/A | N/A | N/A |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | — | Pass (52 ms) | Pass (67 ms) | Pass (13 ms) | Pass (30 ms) | Pass (91 ms) |
| `robustness/fuzz_mp4_bitflip_probe` | — | — | Pass (174 ms) | Pass (14 ms) | — | Pass (75 ms) | Pass (14 ms) | Pass (15 ms) | — |
| `robustness/image_png_probe_na` | — | — | — | Pass (5 ms) | Pass (4 ms) | Pass (10 ms) | Pass (14 ms) | Pass (14 ms) | Pass (34 ms) |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | — | N/A | — | Pass (13 ms) | — | — | — | N/A | N/A |
| `encryption/cenc_cens_decrypt_na` | — | N/A | Pass (108 ms) | — | N/A | N/A | — | N/A | N/A |
| `transcode/mismatch_mislabeled_container_transcode` | — | N/A | Pass (11.62 s) | Pass (737 ms) | N/A | N/A | N/A | Pass (808 ms) | — |
| `robustness/edge_headerless_recorder_probe` | — | — | — | Pass (15 ms) | — | — | Pass (19 ms) | — | — |
| `robustness/edge_multitrack_demux` | — | N/A | — | Pass (19 ms) | — | — | Pass (167 ms) | — | — |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | N/A | Pass (207 ms) | — | Pass (55 ms) | N/A | Pass (929 ms) | — | Pass (1.1 s) |
| `robustness/edge_video_only_micro_probe` | — | N/A | — | Pass (11 ms) | — | Pass (15 ms) | Pass (14 ms) | Pass (15 ms) | — |
| `transcode/negative_png_to_video` | — | N/A | Pass (114 ms) | Pass (6 ms) | N/A | Pass (21 ms) | N/A | — | — |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | N/A | Pass (1.76 s) | Pass (121 ms) | — | Pass (131 ms) | N/A | — | Pass (85 ms) |
| `transcode/malformed_truncated_h264_transcode` | — | N/A | Pass (117 ms) | — | N/A | N/A | N/A | Pass (1.07 s) | N/A |
| `robustness/edge_dims_1x1_decode` | — | — | — | — | — | — | N/A | — | Pass (68 ms) |
| `audio-dsp/edge_empty_audio_transcode` | — | N/A | Pass (125 ms) | Pass (20 ms) | — | — | — | — | N/A |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | — | Pass (22 ms) | — | Pass (18 ms) | — | — | N/A |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | N/A | Pass (203 ms) | Pass (15 ms) | N/A | — | — | N/A | N/A |
| `encryption/hls_sample_aes_decrypt_na` | — | — | Pass (129 ms) | Pass (4 ms) | N/A | N/A | — | N/A | N/A |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | Pass (111 ms) | Pass (11 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | — | N/A | — | N/A | — | N/A |
| `robustness/edge_ts_pts_wraparound_demux` | — | N/A | Pass (138 ms) | Pass (19 ms) | N/A | — | Pass (47 ms) | Pass (48 ms) | SKIPPED |
| `robustness/prop_gapless_sample_count_priming` | — | N/A | N/A | Pass (189 ms) | N/A | — | — | N/A | — |
| `robustness/edge_open_gop_bframes_decode` | — | N/A | N/A | Pass (1.71 s) | N/A | — | N/A | — | Pass (1.75 s) |
| `robustness/fuzz_adts_aac_bitflip_probe` | — | N/A | — | — | — | N/A | — | Pass (16 ms) | N/A |
| `robustness/edge_5_1_channels_probe` | — | N/A | — | Pass (13 ms) | N/A | — | Pass (5 ms) | Pass (16 ms) | N/A |
| `robustness/edge_zero_length_probe` | — | N/A | — | Pass (4 ms) | Pass (16 ms) | — | Pass (12 ms) | Pass (11 ms) | — |
| `transcode/negative_webp_to_video` | — | N/A | — | — | N/A | Pass (13 ms) | — | Pass (13 ms) | — |
| `robustness/edge_flac_with_seektable_probe` | — | N/A | Pass (117 ms) | Pass (14 ms) | — | N/A | Pass (11 ms) | — | N/A |
| `mux/neg_h264_into_ogg_illegal` | — | N/A | Pass (262 ms) | Pass (49 ms) | — | N/A | N/A | N/A | — |
| `robustness/edge_rotated_remux` | — | N/A | Pass (715 ms) | Pass (679 ms) | N/A | — | — | N/A | N/A |
| `robustness/edge_cbcs_boundary_decrypt` | — | N/A | N/A | — | — | — | N/A | N/A | — |
| `metadata/neg_garbled_id3_mp3_probe` | — | — | — | — | N/A | N/A | — | Pass (12 ms) | N/A |
| `transcode/mismatch_audio_only_to_video_target` | — | — | Pass (137 ms) | Pass (15 ms) | N/A | — | N/A | Pass (6 ms) | N/A |
| `robustness/prop_demux_mux_roundtrip_eq` | — | — | N/A | — | Pass (188 ms) | — | N/A | N/A | N/A |
| `transcode/mismatch_video_only_to_audio_target` | — | — | Pass (136 ms) | Pass (11 ms) | N/A | N/A | N/A | Pass (13 ms) | N/A |
| `robustness/prop_double_remux_stable` | — | N/A | N/A | Pass (406 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/clearkey_decrypt_na` | — | — | Pass (105 ms) | Pass (3 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | — | N/A | Pass (611 ms) | — | N/A | — | — | — | — |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | — | N/A | — | N/A | N/A |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | N/A | Pass (123 ms) | Pass (22 ms) | — | N/A | N/A | — | N/A |
| `remux/neg_zeroed_mp4_to_mkv` | — | — | Pass (212 ms) | Pass (12 ms) | — | N/A | N/A | — | N/A |
| `robustness/prop_trim_concatenation` | — | — | Pass (56.85 s) | N/A | — | N/A | N/A | — | — |
| `robustness/prop_flac_seek_seektable_equiv` | — | N/A | — | N/A | N/A | — | N/A | N/A | — |
| `trim/robust_negative_start` | — | N/A | Pass (132 ms) | — | N/A | N/A | — | — | N/A |
| `robustness/edge_mislabeled_container_probe` | — | N/A | Pass (132 ms) | Pass (10 ms) | N/A | — | Pass (15 ms) | Pass (17 ms) | — |
| `robustness/image_jpeg_probe_na` | — | — | Pass (108 ms) | — | — | Pass (13 ms) | — | — | Pass (33 ms) |
| `robustness/fuzz_mp4_header_truncated_demux` | — | N/A | Pass (174 ms) | — | Pass (57 ms) | — | Pass (18 ms) | Pass (4 ms) | — |
| `demux/graceful_mp4_header_destroyed` | — | N/A | Pass (172 ms) | — | Pass (55 ms) | — | Pass (17 ms) | — | Pass (28 ms) |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | N/A | N/A | — | N/A | — |
| `robustness/edge_vfr_probe` | — | — | — | Pass (5 ms) | — | Pass (22 ms) | Pass (13 ms) | Pass (9 ms) | Pass (67 ms) |
| `trim/robust_zero_length_range` | — | N/A | Pass (122 ms) | — | — | — | — | — | — |
| `transcode/extreme_resize_1x1` | — | — | Pass (113 ms) | Pass (19 ms) | N/A | — | N/A | Pass (21 ms) | N/A |
| `robustness/edge_extreme_fps_240_probe` | — | N/A | — | Pass (4 ms) | Pass (4 ms) | — | — | Pass (14 ms) | Pass (45 ms) |
| `robustness/edge_headerless_recorder_remux` | — | N/A | — | Pass (563 ms) | N/A | — | N/A | — | — |
| `transcode/negative_jpeg_to_video` | — | N/A | Pass (108 ms) | — | — | Pass (17 ms) | N/A | Pass (12 ms) | — |
| `trim/robust_inverted_range` | — | — | Pass (114 ms) | — | N/A | N/A | N/A | — | N/A |
| `robustness/edge_gapless_priming_probe` | — | — | — | Pass (12 ms) | Pass (14 ms) | Pass (14 ms) | Pass (4 ms) | — | — |
| `transcode/malformed_zero_length_transcode` | — | N/A | Pass (118 ms) | — | — | Pass (13 ms) | N/A | — | — |
| `trim/robust_truncated_source` | — | — | Pass (104 ms) | — | — | N/A | N/A | — | — |
| `robustness/fuzz_remux_zeroed_spans` | — | — | Pass (285 ms) | Pass (274 ms) | — | N/A | — | N/A | — |
| `remux/neg_truncated_mp4_to_mkv` | — | N/A | — | Pass (171 ms) | — | — | N/A | — | — |
| `robustness/image_webp_probe_na` | — | N/A | Pass (117 ms) | Pass (11 ms) | Pass (5 ms) | — | — | Pass (11 ms) | — |
| `robustness/fuzz_flac_bitflip_probe` | — | — | Pass (116 ms) | — | N/A | N/A | Pass (11 ms) | Pass (4 ms) | N/A |
| `robustness/edge_video_only_probe` | — | N/A | Pass (144 ms) | Pass (13 ms) | Pass (17 ms) | Pass (21 ms) | Pass (13 ms) | Pass (14 ms) | Pass (58 ms) |
| `robustness/fuzz_webm_bitflip_probe` | — | — | Pass (160 ms) | — | N/A | Pass (40 ms) | Pass (21 ms) | — | — |
| `robustness/edge_longform_probe` | — | — | — | Pass (85 ms) | Pass (140 ms) | — | — | Pass (91 ms) | — |
| `robustness/edge_dims_2x2_h264_probe` | — | N/A | — | — | Pass (7 ms) | — | — | — | Pass (45 ms) |
| `robustness/edge_fragmented_remux` | — | N/A | Pass (883 ms) | — | Pass (674 ms) | N/A | — | N/A | — |
| `robustness/edge_pcm_s24_decode` | — | — | — | Pass (31 ms) | — | N/A | — | N/A | — |
| `transcode/extreme_resize_0x0` | — | — | Pass (121 ms) | Pass (13 ms) | N/A | N/A | N/A | — | N/A |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | — | N/A | — | — | — | N/A | — | N/A | — |
| `robustness/edge_extreme_fps_1_probe` | — | N/A | — | Pass (12 ms) | Pass (15 ms) | Pass (20 ms) | — | Pass (13 ms) | Pass (45 ms) |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | N/A | — | — | N/A | — | Pass (4 ms) | Pass (13 ms) | N/A |
| `robustness/prop_transcode_idempotent_dims_h264` | — | N/A | — | — | N/A | N/A | — | — | — |
| `robustness/edge_seek_negative` | — | N/A | Pass (233 ms) | — | N/A | — | N/A | — | — |

### 2. Winners — one per case (🏆 = fastest correct engine)

| Case | Winner | Value | Runner-up | Margin | Eligible | Flag |
| --- | --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | 2 | no winner |
| `audio-dsp/gain_half_f32` | — | — | — | — | 2 | no winner |
| `decode-seek/seek_backward_then_forward` | — | — | — | — | 5 | no winner |
| `streaming-output/prop_decode_equals_stream_shape` | `mediabunny@1.48.0` (uncontested) | 326.4 ms | — | — | 2 | uncontested |
| `decode-seek/decode_vfr_timing` | — | — | — | — | 4 | no winner |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | 0 | no winner |
| `trim/h264_frame_accurate` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | 2 | no winner |
| `transcode/h264_resize_4k_to_1080p` | — | — | — | — | 3 | no winner |
| `performance/bundle-size` | 🏆 `mp4box@2.3.0` | 41.3 kB | `web-demuxer@4.0.0` | +4.4% | 4 | contested |
| `performance/convert-longtasks` | — | — | — | — | 2 | no winner |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | 2 | no winner |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | 0 | no winner |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `probe/h264_rotated90` | 🏆 `mediabunny@1.48.0` | 2.64 ms | `remotion-webcodecs@4.0.479` | +59.97% | 7 | contested |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | 2 | no winner |
| `demux/hls_aes128` | — | — | — | — | 2 | no winner |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | 2 | no winner |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | — | — | — | 2 | no winner |
| `demux/mp3_cbr_notoc` | `remotion-media-parser@4.0.479` (uncontested) | 10.09 ms | — | — | 3 | uncontested |
| `transcode/multitrack_select_default_audio` | — | — | — | — | 3 | no winner |
| `mux/edge_bframes_decode_mux_mkv` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/selfcheck_h264_resize_720p_tie` | — | — | — | — | 2 | no winner |
| `transcode/flac_to_aac_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `trim/huge_h264_mov_copy_peakmem` | `mediabunny@1.48.0` (uncontested) | 900.65 x-realtime | — | — | 2 | uncontested |
| `audio-dsp/meta_roundtrip_endianness_s16` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `trim/large_h264_copy_lazyread` | — | — | — | — | 2 | no winner |
| `probe/flac_noseektable` | — | — | — | — | 4 | no winner |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | 2 | no winner |
| `decode-seek/decode_vp8` | `web-demuxer@4.0.0` (uncontested) | 118.93 fps | — | — | 5 | uncontested |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | 2 | no winner |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | 3 | no winner |
| `demux/realworld_mdn_trex_mp3` | — | — | — | — | 3 | no winner |
| `performance/metamorphic-vfr-probe-duration` | 🏆 `remotion-media-parser@4.0.479` | 252.21 ops/s | `mp4box@2.3.0` | +90.92% | 7 | contested |
| `probe/h264_4k_10s` | — | — | — | — | 5 | no winner |
| `mux/video_plus_audio_to_mp4` | `mediabunny@1.48.0` (uncontested) | 595.65 x-realtime | — | — | 2 | uncontested |
| `transcode/h264_10bit_to_h264_8bit` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `transcode/hevc_to_av1_webm` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `audio-dsp/gain_minus6db_s16` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | 7 | no winner |
| `probe/wav_s16` | — | — | — | — | 5 | no winner |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | 2 | no winner |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | 2 | no winner |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | 3 | no winner |
| `transcode/ladder_tiny_h264_360p_resize_180p` | `remotion-webcodecs@4.0.479` (uncontested) | 258.47 fps | — | — | 3 | uncontested |
| `probe/perf-extract-metadata-huge` | `remotion-webcodecs@4.0.479` (uncontested) | 113.12 ops/s | — | — | 5 | uncontested |
| `transcode/h264_rotate_180` | — | — | — | — | 3 | no winner |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | 2 | no winner |
| `mux/pcm_s24_to_wav` | — | — | — | — | 2 | no winner |
| `metadata/write_mp4_tags` | `ffmpeg.wasm@0.12.15` (uncontested) | 124.88 ms | — | — | 2 | uncontested |
| `transcode/h264_flip_vertical` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | 2 | no winner |
| `trim/audio_flac_seektable_copy` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `remux/av1_720p_5s_webm_to_mkv` | `mediabunny@1.48.0` (uncontested) | 574.64 x-realtime | — | — | 1 | uncontested |
| `probe/vp8_720p_10s` | `remotion-media-parser@4.0.479` (uncontested) | 15.64 ms | — | — | 6 | uncontested |
| `demux/h264_in_mkv` | — | — | — | — | 6 | no winner |
| `demux/wav_s16` | — | — | — | — | 5 | no winner |
| `metadata/tracks_packet_attribution_multitrack` | 🏆 `remotion-webcodecs@4.0.479` | 10844.85 packets/s | `web-demuxer@4.0.0` | +308.75% | 7 | contested |
| `probe/recorder_headerless` | `remotion-media-parser@4.0.479` (uncontested) | 9.42 ms | — | — | 3 | uncontested |
| `encryption/cenc_cbcs_decrypt` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | — | — | — | 4 | no winner |
| `remux/av1_720p_5s_webm_to_mp4` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `trim/audio_wav_pcm_copy` | — | — | — | — | 2 | no winner |
| `probe/flac_seektable` | `mediabunny@1.48.0` (uncontested) | 3.52 ms | — | — | 4 | uncontested |
| `metadata/write_ogg_vorbiscomment` | `mediabunny@1.48.0` (uncontested) | 7.78 ms | — | — | 2 | uncontested |
| `probe/large_h264_1080p_120s` | — | — | — | — | 6 | no winner |
| `mux/mp4_faststart_reserve` | — | — | — | — | 2 | no winner |
| `trim/audio_mp3_copy` | — | — | — | — | 2 | no winner |
| `audio-dsp/downmix_5_1_to_stereo` | 🤝 `mediabunny@1.48.0`, `ffmpeg.wasm@0.12.15` | 221.51 x-realtime | `ffmpeg.wasm@0.12.15` | +0.9% | 2 | tie |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | 7 | no winner |
| `mux/vorbis_to_ogg` | `ffmpeg.wasm@0.12.15` (uncontested) | 613.12 x-realtime | — | — | 2 | uncontested |
| `remux/opus_ogg_to_webm` | `ffmpeg.wasm@0.12.15` (uncontested) | 1388.9 x-realtime | — | — | 2 | uncontested |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | 2 | no winner |
| `probe/realworld_mdn_flower_webm` | — | — | — | — | 5 | no winner |
| `transcode/h264_resize_720p` | — | — | — | — | 3 | no winner |
| `decode-seek/meta_seek_vs_linear_decode` | — | — | — | — | 5 | no winner |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/vp9_alpha_to_vp9_keepalpha` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | `mediabunny@1.48.0` (uncontested) | 41.96 ms | — | — | 2 | uncontested |
| `mux/swap_audio_video_with_opus_to_mkv` | `ffmpeg.wasm@0.12.15` (uncontested) | 134.62 x-realtime | — | — | 2 | uncontested |
| `probe/mp3_xing` | `remotion-media-parser@4.0.479` (uncontested) | 2.58 ms | — | — | 4 | uncontested |
| `probe/vp9_1080p_10s` | — | — | — | — | 6 | no winner |
| `streaming-output/ts_tiny_writes` | — | — | — | — | 2 | no winner |
| `demux/opus` | — | — | — | — | 2 | no winner |
| `probe/aac_adts` | — | — | — | — | 4 | no winner |
| `transcode/roundtrip_leg2_vp9_to_h264` | `remotion-webcodecs@4.0.479` (uncontested) | 0 fps | — | — | 3 | uncontested |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | 2 | no winner |
| `decode-seek/seek_negative` | `remotion-webcodecs@4.0.479` (uncontested) | 1929.94 ms | — | — | 5 | uncontested |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | 0 | no winner |
| `decode-seek/decode_vp9` | — | — | — | — | 5 | no winner |
| `demux/hls_vod` | — | — | — | — | 3 | no winner |
| `transcode/av1_to_h264_mp4` | — | — | — | — | 2 | no winner |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | 2 | no winner |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | 3 | no winner |
| `streaming-output/webm_headerless_live_stream` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `probe/h264_bframes_1080p` | `mp4box@2.3.0` (uncontested) | 21.54 ms | — | — | 7 | uncontested |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | 2 | no winner |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | 2 | no winner |
| `metadata/read_h264_1080p_5s` | `remotion-webcodecs@4.0.479` (uncontested) | 6.95 ms | — | — | 5 | uncontested |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | 2 | no winner |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | 2 | no winner |
| `trim/h264_multitrack_keyframe_aligned` | `mediabunny@1.48.0` (uncontested) | 27.12 x-realtime | — | — | 2 | uncontested |
| `demux/size_tiny_tiny_vp9_360p_2s` | `mediabunny@1.48.0` (uncontested) | 2.86 ms | — | — | 4 | uncontested |
| `transcode/gapless_pcm_to_opus_priming` | `remotion-webcodecs@4.0.479` (uncontested) | 56.27 ms | — | — | 2 | uncontested |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | 2 | no winner |
| `probe/h264_in_mkv` | `ffmpeg.wasm@0.12.15` (uncontested) | 42.45 ms | — | — | 6 | uncontested |
| `streaming-output/mp4_streaming_target` | — | — | — | — | 3 | no winner |
| `mux/opus_to_ogg` | — | — | — | — | 2 | no winner |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | 2 | no winner |
| `transcode/h264_fps_15_to_30` | — | — | — | — | 2 | no winner |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | 6 | no winner |
| `probe/massive_h264_1080p_2h` | 🏆 `web-demuxer@4.0.0` | 322.4 ms | `platform@chrome-149` | +85.94% | 7 | contested |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | 3 | no winner |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | 7 | no winner |
| `transcode/h264_rotate_normalize` | — | — | — | — | 3 | no winner |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | 2 | no winner |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | 2 | no winner |
| `mux/aac_to_adts` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `metadata/read_no_tags_wav` | 🏆 `mediabunny@1.48.0` | 2.14 ms | `remotion-media-parser@4.0.479` | +73.35% | 5 | contested |
| `transcode/h264_to_hevc_mp4` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 2 | uncontested |
| `trim/vp8_keyframe_aligned` | — | — | — | — | 2 | no winner |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | 2 | no winner |
| `transcode/hevc_to_vp9_webm` | `remotion-webcodecs@4.0.479` (uncontested) | 0 fps | — | — | 2 | uncontested |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | 2 | no winner |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | 0 | no winner |
| `transcode/metamorphic_resize_same_1080p_idempotent` | — | — | — | — | 3 | no winner |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | 3 | no winner |
| `audio-dsp/pcm_s16be_to_s16le` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `mux/opus_to_webm_audio` | `mediabunny@1.48.0` (uncontested) | 1258.74 x-realtime | — | — | 2 | uncontested |
| `transcode/wav_to_mp3_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `remux/h264_1080p_5s_mov_to_ts` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/h264_to_vp8_webm` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `decode-seek/decode_tiny_dims_2x2_h264` | — | — | — | — | 4 | no winner |
| `transcode/h264_two_pass_bitrate` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `decode-seek/decode_hevc` | — | — | — | — | 5 | no winner |
| `probe/huge_vp9_1080p_240s` | `remotion-webcodecs@4.0.479` (uncontested) | 215.93 ms | — | — | 6 | uncontested |
| `mux/pcm_f32_to_wav` | — | — | — | — | 2 | no winner |
| `performance/op-sweep-probe` | 🏆 `remotion-media-parser@4.0.479` | 271 ops/s | `remotion-webcodecs@4.0.479` | +21.14% | 7 | contested |
| `decode-seek/seek_mkv_h264_keyframe` | `ffmpeg.wasm@0.12.15` (uncontested) | 259.42 ms | — | — | 5 | uncontested |
| `streaming-output/webm_streaming_target` | — | — | — | — | 2 | no winner |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | 3 | no winner |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | 2 | no winner |
| `performance/convert-webm-resize-320x180` | — | — | — | — | 2 | no winner |
| `performance/encode-fps` | `remotion-webcodecs@4.0.479` (uncontested) | 170.3 fps | — | — | 2 | uncontested |
| `probe/wav_s24` | — | — | — | — | 5 | no winner |
| `encryption/hls_aes128_decrypt` | — | — | — | — | 2 | no winner |
| `audio-dsp/throughput_decode_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `demux/hevc_1080p_10s` | 🤝 `mp4box@2.3.0`, `platform@chrome-149` | 34.14 ms | `platform@chrome-149` | +1.51% | 7 | tie |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | 2 | no winner |
| `trim/audio_opus_ogg_copy` | `mediabunny@1.48.0` (uncontested) | 1746.42 x-realtime | — | — | 2 | uncontested |
| `trim/h264_open_gop_frame_accurate` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `mux/mp4_progressive_buffer` | — | — | — | — | 3 | no winner |
| `trim/h264_single_gop_frame_accurate` | `mediabunny@1.48.0` (uncontested) | 161.18 x-realtime | — | — | 1 | uncontested |
| `metadata/tracks_attribution_multitrack` | 🏆 `web-demuxer@4.0.0` | 22.01 ms | `ffmpeg.wasm@0.12.15` | +10.55% | 6 | contested |
| `probe/wav_f32` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | 2 | no winner |
| `demux/h264_1080p_5s` | — | — | — | — | 5 | no winner |
| `performance/decode-fps` | `remotion-webcodecs@4.0.479` (uncontested) | 6.85 fps | — | — | 4 | uncontested |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | 3 | no winner |
| `metadata/read_h264_1080p_30s` | `web-demuxer@4.0.0` (uncontested) | 30.9 ms | — | — | 7 | uncontested |
| `decode-seek/decode_mov_h264` | 🏆 `remotion-webcodecs@4.0.479` | 60.43 fps | `platform@chrome-149` | +13.33% | 4 | contested |
| `metadata/write_mp3_id3` | — | — | — | — | 2 | no winner |
| `demux/realworld_mdn_flower_mp4` | — | — | — | — | 5 | no winner |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | 4 | no winner |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | 2 | no winner |
| `transcode/h264_fps_30_to_15` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | 7 | no winner |
| `decode-seek/seek_h264_keyframe` | `remotion-webcodecs@4.0.479` (uncontested) | 2860.24 ms | — | — | 5 | uncontested |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | 2 | no winner |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | 2 | no winner |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | 2 | no winner |
| `demux/mp3_xing` | — | — | — | — | 3 | no winner |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | 2 | no winner |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | 2 | no winner |
| `mux/h264_aac_to_mkv` | — | — | — | — | 2 | no winner |
| `mux/drop_audio_track_subset_to_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | 2 | no winner |
| `streaming-output/prop_probe_dur_fragmented_shape` | 🏆 `mp4box@2.3.0` | 86.78 ms | `ffmpeg.wasm@0.12.15` | +25.37% | 3 | contested |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | 3 | no winner |
| `probe/micro_h264_1frame` | — | — | — | — | 7 | no winner |
| `probe/perf-extract-metadata-large` | 🏆 `web-demuxer@4.0.0` | 29.95 ops/s | `ffmpeg.wasm@0.12.15` | +281.31% | 7 | contested |
| `performance/size-ladder-iterate-packets-large` | `mp4box@2.3.0` (uncontested) | 63137.72 packets/s | — | — | 7 | uncontested |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | 2 | no winner |
| `transcode/h264_flip_horizontal` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `remux/prop_ts_to_mp4_duration_materialized` | `remotion-webcodecs@4.0.479` (uncontested) | 715.75 ms | — | — | 3 | uncontested |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | 2 | no winner |
| `metadata/write_mkv_tags` | — | — | — | — | 2 | no winner |
| `streaming-output/prop_ts_stream_duration_materialized` | 🏆 `ffmpeg.wasm@0.12.15` | 125.18 ms | `mediabunny@1.48.0` | +64.6% | 2 | contested |
| `decode-seek/seek_av1_keyframe` | 🏆 `mediabunny@1.48.0` | 22.35 ms | `remotion-webcodecs@4.0.479` | +88.88% | 3 | contested |
| `performance/convert-peak-memory` | `remotion-webcodecs@4.0.479` (uncontested) | 258.99 fps | — | — | 2 | uncontested |
| `trim/vp9_keyframe_aligned` | — | — | — | — | 2 | no winner |
| `streaming-output/mp4_buffer_target` | — | — | — | — | 3 | no winner |
| `trim/massive_h264_copy_sustained` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | 2 | no winner |
| `probe/tiny_h264_360p_2s` | — | — | — | — | 7 | no winner |
| `trim/av1_keyframe_aligned` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | 2 | no winner |
| `performance/op-sweep-demux` | — | — | — | — | 6 | no winner |
| `performance/seek-ms` | — | — | — | — | 4 | no winner |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | 2 | no winner |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | 2 | no winner |
| `mux/prop_vp9_mux_duration_webm_to_webm` | `ffmpeg.wasm@0.12.15` (uncontested) | 106.67 ms | — | — | 2 | uncontested |
| `transcode/bframe_reorder_h264_to_vp9` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | 0 | no winner |
| `demux/size_micro_micro_audio_short` | — | — | — | — | 6 | no winner |
| `trim/h264_to_eof_copy` | — | — | — | — | 2 | no winner |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | 2 | no winner |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | 2 | no winner |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | 4 | no winner |
| `metadata/rotation_survives_mp4_mkv` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `demux/h264_vfr` | — | — | — | — | 5 | no winner |
| `probe/h264_1080p_5s` | — | — | — | — | 7 | no winner |
| `probe/hevc_1080p_10s` | `web-demuxer@4.0.0` (uncontested) | 9.7 ms | — | — | 7 | uncontested |
| `decode-seek/decode_multitrack_select_video` | `remotion-webcodecs@4.0.479` (uncontested) | 88.22 fps | — | — | 4 | uncontested |
| `metadata/rotation_decode_read_h264_rotated90` | `platform@chrome-149` (uncontested) | 107.5 ms | — | — | 1 | uncontested |
| `transcode/opus_to_aac_mp4` | — | — | — | — | 2 | no winner |
| `demux/h264_rotated90` | `web-demuxer@4.0.0` (uncontested) | 301.21 ms | — | — | 6 | uncontested |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | 3 | no winner |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | 3 | no winner |
| `decode-seek/decode_h264_first_frames` | — | — | — | — | 5 | no winner |
| `performance/metamorphic-vfr-iterate-packets` | `mp4box@2.3.0` (uncontested) | 69414.58 packets/s | — | — | 5 | uncontested |
| `probe/h264_vfr` | — | — | — | — | 7 | no winner |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | 2 | no winner |
| `transcode/fanout_h264_abr_ladder` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `performance/metamorphic-decode-remux` | — | — | — | — | 2 | no winner |
| `decode-seek/seek_past_eof` | `ffmpeg.wasm@0.12.15` (uncontested) | 447.42 ms | — | — | 4 | uncontested |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | 2 | no winner |
| `trim/vp9_alpha_keyframe_aligned` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `decode-seek/decode_tiny_dims_1x1` | — | — | — | — | 4 | no winner |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | 6 | no winner |
| `demux/flac_seektable` | — | — | — | — | 4 | no winner |
| `decode-seek/decode_bframes_reorder` | 🏆 `remotion-webcodecs@4.0.479` | 43.03 fps | `ffmpeg.wasm@0.12.15` | +16.83% | 5 | contested |
| `demux/size_tiny_tiny_h264_360p_2s` | 🏆 `mp4box@2.3.0` | 3.77 ms | `ffmpeg.wasm@0.12.15` | +52.93% | 6 | contested |
| `mux/prop_h264_mux_duration_mp4_to_ts` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/h264_to_vp9_webm` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `decode-seek/decode_size_tiny_h264_360p` | — | — | — | — | 5 | no winner |
| `mux/edge_multitrack_keep_all_to_mp4` | `mp4box@2.3.0` (uncontested) | 302.43 x-realtime | — | — | 3 | uncontested |
| `transcode/h264_to_ts` | — | — | — | — | 0 | no winner |
| `probe/mp3_cbr_notoc` | 🏆 `remotion-media-parser@4.0.479` | 2.04 ms | `ffmpeg.wasm@0.12.15` | +76% | 4 | contested |
| `transcode/h264_crop_center` | — | — | — | — | 2 | no winner |
| `decode-seek/seek_vp8_keyframe` | `remotion-webcodecs@4.0.479` (uncontested) | 71.85 ms | — | — | 5 | uncontested |
| `trim/h264_keyframe_aligned` | — | — | — | — | 2 | no winner |
| `trim/audio_flac_noseektable_copy` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `performance/size-ladder-iterate-packets-massive` | `remotion-media-parser@4.0.479` (uncontested) | 6327895.28 packets/s | — | — | 6 | uncontested |
| `probe/opus` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `trim/hevc_keyframe_aligned` | — | — | — | — | 2 | no winner |
| `decode-seek/seek_hevc_keyframe` | `web-demuxer@4.0.0` (uncontested) | 69.51 ms | — | — | 5 | uncontested |
| `streaming-output/prop_decode_equals_buffer_shape` | `mediabunny@1.48.0` (uncontested) | 317.19 ms | — | — | 2 | uncontested |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | 2 | no winner |
| `trim/hevc_frame_accurate` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/aac_to_pcm_wav_extract` | 🏆 `mediabunny@1.48.0` | 204.26 x-realtime | `remotion-webcodecs@4.0.479` | +101.56% | 3 | contested |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | 2 | no winner |
| `decode-seek/decode_av1` | — | — | — | — | 3 | no winner |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | 6 | no winner |
| `trim/h264_start_zero_copy` | — | — | — | — | 2 | no winner |
| `transcode/hdr10_to_sdr_tonemap` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `probe/cenc_cbcs` | — | — | — | — | 6 | no winner |
| `decode-seek/decode_size_tiny_vp9_360p` | `mediabunny@1.48.0` (uncontested) | 284.12 fps | — | — | 5 | uncontested |
| `decode-seek/seek_repeated_same_target` | — | — | — | — | 4 | no winner |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | 2 | no winner |
| `transcode/mp3_to_opus_webm` | — | — | — | — | 2 | no winner |
| `probe/metamorphic-recorder-headerless-sane-duration` | `remotion-media-parser@4.0.479` (uncontested) | 16.55 ms | — | — | 6 | uncontested |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | 2 | no winner |
| `remux/flac_seektable_flac_to_mkv` | `ffmpeg.wasm@0.12.15` (uncontested) | 1623.38 x-realtime | — | — | 2 | uncontested |
| `trim/h264_bframes_frame_accurate` | `ffmpeg.wasm@0.12.15` (uncontested) | 1.51 x-realtime | — | — | 2 | uncontested |
| `probe/big_buck_bunny_1080p_h264` | 🏆 `remotion-media-parser@4.0.479` | 7.39 ms | `remotion-webcodecs@4.0.479` | +20.38% | 7 | contested |
| `trim/large_h264_frame_accurate_throughput` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/wav_to_vorbis_ogg` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | 2 | no winner |
| `decode-seek/seek_zero` | `platform@chrome-149` (uncontested) | 83.13 ms | — | — | 4 | uncontested |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | 6 | no winner |
| `decode-seek/decode_h264_10bit` | `remotion-webcodecs@4.0.479` (uncontested) | 51.58 fps | — | — | 4 | uncontested |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | 2 | no winner |
| `demux/realworld_mdn_flower_webm` | — | — | — | — | 5 | no winner |
| `mux/h264_aac_to_mov` | — | — | — | — | 2 | no winner |
| `remux/h264_ts_ts_to_mp4` | `remotion-webcodecs@4.0.479` (uncontested) | 14.21 x-realtime | — | — | 3 | uncontested |
| `performance/op-sweep-transcode-webm` | — | — | — | — | 2 | no winner |
| `remux/flac_seektable_flac_to_ogg` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | 4 | no winner |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | 2 | no winner |
| `trim/ts_keyframe_aligned` | — | — | — | — | 2 | no winner |
| `audio-dsp/edge_gapless_aac_decode` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `performance/size-ladder-demux-peak-memory-large4k` | `platform@chrome-149` (uncontested) | 17012.81 packets/s | — | — | 6 | uncontested |
| `performance/metamorphic-transcode-idempotent-source-res` | `remotion-webcodecs@4.0.479` (uncontested) | — | — | — | 1 | uncontested |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | 2 | no winner |
| `mux/h264_aac_to_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | 158.17 x-realtime | — | — | 3 | uncontested |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | 2 | no winner |
| `trim/mkv_keyframe_aligned` | — | — | — | — | 2 | no winner |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | 5 | no winner |
| `audio-dsp/edge_longform_audio_resample_16k` | `remotion-webcodecs@4.0.479` (uncontested) | 15021.41 ms | — | — | 3 | uncontested |
| `decode-seek/decode_size_large_vp9_120s` | `web-demuxer@4.0.0` (uncontested) | 50.77 fps | — | — | 5 | uncontested |
| `decode-seek/seek_h264_nonkeyframe` | — | — | — | — | 4 | no winner |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | 3 | no winner |
| `probe/longform_1h_audio` | — | — | — | — | 5 | no winner |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | 2 | no winner |
| `demux/size_large_large_h264_1080p_120s` | 🏆 `platform@chrome-149` | 173.68 ms | `web-demuxer@4.0.0` | +96.81% | 7 | contested |
| `remux/h264_multitrack_mp4_to_mkv` | `ffmpeg.wasm@0.12.15` (uncontested) | 240.7 x-realtime | — | — | 2 | uncontested |
| `audio-dsp/throughput_encode_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | 2 | no winner |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | 6 | no winner |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/extreme_fps_240` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `decode-seek/decode_h264_4k` | `mediabunny@1.48.0` (uncontested) | 14.1 fps | — | — | 5 | uncontested |
| `demux/h264_ts` | 🏆 `mediabunny@1.48.0` | 38.7 ms | `ffmpeg.wasm@0.12.15` | +20.54% | 3 | contested |
| `probe/realworld_mdn_flower_mp4` | — | — | — | — | 7 | no winner |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | 5 | no winner |
| `probe/av1_720p_5s` | — | — | — | — | 5 | no winner |
| `demux/wav_s24` | `remotion-webcodecs@4.0.479` (uncontested) | 5.07 ms | — | — | 5 | uncontested |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | 2 | no winner |
| `decode-seek/decode_extreme_fps_1` | `remotion-webcodecs@4.0.479` (uncontested) | 1148.55 fps | — | — | 4 | uncontested |
| `metadata/read_no_tags_recorder_webm` | `remotion-media-parser@4.0.479` (uncontested) | 13.36 ms | — | — | 5 | uncontested |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | 2 | no winner |
| `demux/empty_audio_zero_packets` | `mediabunny@1.48.0` (uncontested) | 2.05 ms | — | — | 3 | uncontested |
| `transcode/vp9_to_vp8_webm` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `streaming-output/mp4_faststart_reserve` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | 🏆 `ffmpeg.wasm@0.12.15` | 117.57 ms | `mediabunny@1.48.0` | +64.34% | 2 | contested |
| `transcode/aac_to_opus_webm` | — | — | — | — | 2 | no winner |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | 2 | no winner |
| `streaming-output/prop_webm_headerless_duration_materialized` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `decode-seek/meta_pts_monotonic_after_reorder` | `ffmpeg.wasm@0.12.15` (uncontested) | 1698.36 ms | — | — | 4 | uncontested |
| `streaming-output/ts_continuity_many_writes` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `decode-seek/seek_vp9_keyframe` | — | — | — | — | 5 | no winner |
| `metadata/read_flac_seektable` | — | — | — | — | 3 | no winner |
| `probe/metamorphic-duration-across-containers` | 🏆 `remotion-webcodecs@4.0.479` | 20.97 ms | `platform@chrome-149` | +71.84% | 5 | contested |
| `mux/av1_opus_to_mp4` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | 2 | no winner |
| `mux/flac_to_mkv_audio` | — | — | — | — | 2 | no winner |
| `probe/micro_audio_short` | 🏆 `platform@chrome-149` | 6.58 ms | `ffmpeg.wasm@0.12.15` | +5.6% | 7 | contested |
| `transcode/vp9_to_h264_mp4` | `remotion-webcodecs@4.0.479` (uncontested) | 0 fps | — | — | 3 | uncontested |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | `mediabunny@1.48.0` (uncontested) | 319.86 fps | — | — | 3 | uncontested |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | 2 | no winner |
| `performance/size-ladder-extract-metadata-medium` | 🏆 `remotion-media-parser@4.0.479` | 273.22 ops/s | `web-demuxer@4.0.0` | +742.49% | 7 | contested |
| `audio-dsp/upmix_stereo_to_5_1` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `audio-dsp/pcm_s24be_to_s16le` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/wav_to_opus_ogg` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `demux/wav_f32` | — | — | — | — | 3 | no winner |
| `remux/prop_rotation_survives_mp4_mov` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `probe/empty-audio-wav` | 🏆 `remotion-media-parser@4.0.479` | 1.84 ms | `mediabunny@1.48.0` | +55.11% | 5 | contested |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | 2 | no winner |
| `demux/aac_adts` | — | — | — | — | 3 | no winner |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | `mediabunny@1.48.0` (uncontested) | 341.57 ms | — | — | 2 | uncontested |
| `audio-dsp/edge_longform_audio_probe` | `ffmpeg.wasm@0.12.15` (uncontested) | 417.38 ms | — | — | 4 | uncontested |
| `decode-seek/decode_size_micro_h264_1frame` | `remotion-webcodecs@4.0.479` (uncontested) | 221.48 fps | — | — | 5 | uncontested |
| `mux/size_micro_1frame_to_mp4` | `mp4box@2.3.0` (uncontested) | — | — | — | 1 | uncontested |
| `mux/edge_rotation_decode_mux_mkv` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `metadata/read_h264_in_mkv` | `remotion-media-parser@4.0.479` (uncontested) | 17.25 ms | — | — | 6 | uncontested |
| `performance/extract-metadata` | — | — | — | — | 6 | no winner |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | 2 | no winner |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | 3 | no winner |
| `metadata/read_h264_multitrack` | — | — | — | — | 7 | no winner |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | 7 | no winner |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | 2 | no winner |
| `transcode/h264_to_av1_mp4` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `demux/pcm_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `probe/h264_1080p_30s` | `mp4box@2.3.0` (uncontested) | 38.77 ms | — | — | 7 | uncontested |
| `probe/cenc_ctr` | — | — | — | — | 5 | no winner |
| `probe/h264_ts` | 🏆 `ffmpeg.wasm@0.12.15` | 47.72 ms | `web-demuxer@4.0.0` | +87.43% | 4 | contested |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | 2 | no winner |
| `transcode/flac_to_opus_webm` | — | — | — | — | 0 | no winner |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | 2 | no winner |
| `demux/h264_multitrack` | — | — | — | — | 6 | no winner |
| `transcode/h264_fps_30_to_60` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 2 | uncontested |
| `trim/mov_keyframe_aligned` | — | — | — | — | 2 | no winner |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | 2 | no winner |
| `demux/h264_1080p_30s` | 🏆 `mp4box@2.3.0` | 58.36 ms | `ffmpeg.wasm@0.12.15` | +29.3% | 6 | contested |
| `audio-dsp/pcm_s16le_to_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `demux/vp9_alpha` | — | — | — | — | 3 | no winner |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | 3 | no winner |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | 2 | no winner |
| `probe/perf-extract-metadata-massive` | `web-demuxer@4.0.0` (uncontested) | 3.15 ops/s | — | — | 6 | uncontested |
| `mux/mp3_to_mp4_audio` | — | — | — | — | 2 | no winner |
| `mux/mp3_to_mp3` | — | — | — | — | 2 | no winner |
| `mux/mp4_streaming_target` | — | — | — | — | 3 | no winner |
| `mux/h264_aac_to_ts` | — | — | — | — | 2 | no winner |
| `transcode/h264_colorspace_709_to_2020` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | 2 | no winner |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | 0 | no winner |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | 2 | no winner |
| `transcode/wav_to_flac` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `probe/large_vp9_1080p_120s` | `platform@chrome-149` (uncontested) | 175.06 ms | — | — | 5 | uncontested |
| `probe/hls_aes128` | — | — | — | — | 2 | no winner |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | 2 | no winner |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | 3 | no winner |
| `decode-seek/decode_size_huge_h264_600s` | `web-demuxer@4.0.0` (uncontested) | 51.71 fps | — | — | 3 | uncontested |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | 3 | no winner |
| `remux/opus_ogg_to_mkv` | — | — | — | — | 2 | no winner |
| `encryption/perf_cenc_ctr_decrypt_throughput` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `mux/pcm_s16_to_wav` | — | — | — | — | 2 | no winner |
| `metadata/read_opus` | `mediabunny@1.48.0` (uncontested) | 2.44 ms | — | — | 2 | uncontested |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | 4 | no winner |
| `decode-seek/decode_mkv_h264` | — | — | — | — | 5 | no winner |
| `demux/vp8_720p_10s` | — | — | — | — | 6 | no winner |
| `trim/audio_aac_adts_copy` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | 3 | no winner |
| `audio-dsp/pcm_f32_to_s16` | `mediabunny@1.48.0` (uncontested) | 215.98 x-realtime | — | — | 2 | uncontested |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | 3 | no winner |
| `decode-seek/decode_extreme_fps_240` | `mediabunny@1.48.0` (uncontested) | 495.21 fps | — | — | 5 | uncontested |
| `transcode/h264_crf_quality_mode` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `encryption/cenc_ctr_decrypt` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | 2 | no winner |
| `transcode/h264_to_mov` | — | — | — | — | 2 | no winner |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | 6 | no winner |
| `probe/huge_h264_1080p_600s` | — | — | — | — | 7 | no winner |
| `mux/edge_hevc_decode_mux_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `audio-dsp/aiff_container_probe` | — | — | — | — | 0 | no winner |
| `transcode/wav_to_aac_mp4` | — | — | — | — | 3 | no winner |
| `demux/flac_noseektable` | — | — | — | — | 3 | no winner |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | 4 | no winner |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | 2 | no winner |
| `probe/h264_multitrack` | 🏆 `mediabunny@1.48.0` | 2.18 ms | `platform@chrome-149` | +89.19% | 7 | contested |
| `performance/size-ladder-iterate-packets-large4k` | 🏆 `ffmpeg.wasm@0.12.15` | 10560.24 packets/s | `remotion-webcodecs@4.0.479` | +750.28% | 6 | contested |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | 2 | no winner |
| `streaming-output/prop_probe_dur_buffer_shape` | `ffmpeg.wasm@0.12.15` (uncontested) | 122.05 ms | — | — | 3 | uncontested |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | 2 | no winner |
| `trim/h264_keyframe_aligned_short` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | 2 | no winner |
| `decode-seek/seek_vfr_arbitrary` | — | — | — | — | 3 | no winner |
| `transcode/aac_to_mp3_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `decode-seek/seek_bframes_midgop` | `ffmpeg.wasm@0.12.15` (uncontested) | 819.55 ms | — | — | 5 | uncontested |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | 3 | no winner |
| `demux/h264_4k_10s` | — | — | — | — | 6 | no winner |
| `probe/hls_vod` | `remotion-webcodecs@4.0.479` (uncontested) | 320.97 ms | — | — | 2 | uncontested |
| `metadata/read_pcm_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `audio-dsp/caf_container_probe` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `probe/pcm_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `demux/h264_bframes_1080p` | — | — | — | — | 5 | no winner |
| `mux/vp9_opus_to_webm` | — | — | — | — | 2 | no winner |
| `transcode/vp9_to_av1_webm` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `performance/size-ladder-extract-metadata-large4k` | `remotion-webcodecs@4.0.479` (uncontested) | 142.65 ops/s | — | — | 5 | uncontested |
| `transcode/extreme_fps_1` | — | — | — | — | 2 | no winner |
| `performance/iterate-video-packets` | — | — | — | — | 6 | no winner |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | 2 | no winner |
| `decode-seek/decode_open_gop_first_frame` | — | — | — | — | 5 | no winner |
| `remux/prop_adts_to_mp4_duration_invariant` | `remotion-webcodecs@4.0.479` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/av1_to_vp9_webm` | — | — | — | — | 2 | no winner |
| `transcode/h264_to_mkv` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `probe/massive_vp9_1080p_2h` | — | — | — | — | 5 | no winner |
| `metadata/read_mp3_xing` | — | — | — | — | 3 | no winner |
| `demux/vp9_1080p_10s` | — | — | — | — | 6 | no winner |
| `trim/h264_noop_full_range_idempotent` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | 2 | no winner |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | 2 | no winner |
| `probe/vp9_alpha` | — | — | — | — | 4 | no winner |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | 2 | no winner |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | 2 | no winner |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | 2 | no winner |
| `demux/av1_720p_5s` | — | — | — | — | 4 | no winner |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | 3 | no winner |
| `transcode/vp8_to_h264_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | 2 | no winner |
| `decode-seek/decode_size_large_h264_120s` | — | — | — | — | 3 | no winner |
| `transcode/gapless_pcm_to_aac_priming` | — | — | — | — | 2 | no winner |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | — | — | — | 2 | no winner |
| `robustness/edge_no_media_tracks_probe` | — | — | — | — | 4 | no winner |
| `trim/robust_start_past_eof` | — | — | — | — | 2 | no winner |
| `robustness/prop_trim_additivity_compose` | — | — | — | — | 0 | no winner |
| `robustness/edge_pcm_s16be_probe` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `encryption/cenc_ctr_truncated_mdat_graceful` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/fuzz_mp3_header_truncated_probe` | — | — | — | — | 3 | no winner |
| `trim/robust_bitflipped_source` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/edge_audio_only_probe` | — | — | — | — | 5 | no winner |
| `robustness/prop_remux_duration_preserved` | — | — | — | — | 0 | no winner |
| `robustness/edge_seek_past_eof` | — | — | — | — | 3 | no winner |
| `probe/truncated-header-graceful` | — | — | — | — | 4 | no winner |
| `robustness/edge_audio_only_micro_probe` | — | — | — | — | 6 | no winner |
| `robustness/prop_duration_consistent_across_containers` | — | — | — | — | 5 | no winner |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | — | — | — | 2 | no winner |
| `robustness/fuzz_webm_header_truncated_demux` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `demux/graceful_zero_length` | — | — | — | — | 2 | no winner |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | — | — | — | 4 | no winner |
| `demux/graceful_webm_header_destroyed` | — | — | — | — | 3 | no winner |
| `robustness/fuzz_mux_target_corrupt_remux` | — | — | — | — | 4 | no winner |
| `robustness/edge_faststart_reserve_remux` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/edge_dims_1x1_probe` | — | — | — | — | 3 | no winner |
| `robustness/fuzz_truncated_h264_asset_demux` | — | — | — | — | 4 | no winner |
| `trim/robust_end_far_past_eof` | — | — | — | — | 2 | no winner |
| `robustness/edge_flac_without_seektable_probe` | — | — | — | — | 2 | no winner |
| `demux/graceful_truncated_h264` | — | — | — | — | 3 | no winner |
| `remux/neg_headerless_webm_to_mkv` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | — | — | — | 2 | no winner |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | — | 5 | no winner |
| `robustness/fuzz_mp4_bitflip_probe` | — | — | — | — | 5 | no winner |
| `robustness/image_png_probe_na` | — | — | — | — | 6 | no winner |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `encryption/cenc_cens_decrypt_na` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/mismatch_mislabeled_container_transcode` | — | — | — | — | 3 | no winner |
| `robustness/edge_headerless_recorder_probe` | — | — | — | — | 2 | no winner |
| `robustness/edge_multitrack_demux` | — | — | — | — | 2 | no winner |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | — | — | — | 4 | no winner |
| `robustness/edge_video_only_micro_probe` | — | — | — | — | 4 | no winner |
| `transcode/negative_png_to_video` | — | — | — | — | 3 | no winner |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | — | — | — | 4 | no winner |
| `transcode/malformed_truncated_h264_transcode` | — | — | — | — | 2 | no winner |
| `robustness/edge_dims_1x1_decode` | `web-demuxer@4.0.0` (uncontested) | — | — | — | 1 | uncontested |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | 2 | no winner |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | — | — | 2 | no winner |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | — | — | — | 2 | no winner |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | 2 | no winner |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | 2 | no winner |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | — | 0 | no winner |
| `robustness/edge_ts_pts_wraparound_demux` | — | — | — | — | 4 | no winner |
| `robustness/prop_gapless_sample_count_priming` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/edge_open_gop_bframes_decode` | — | — | — | — | 2 | no winner |
| `robustness/fuzz_adts_aac_bitflip_probe` | `remotion-webcodecs@4.0.479` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/edge_5_1_channels_probe` | — | — | — | — | 3 | no winner |
| `robustness/edge_zero_length_probe` | — | — | — | — | 4 | no winner |
| `transcode/negative_webp_to_video` | — | — | — | — | 2 | no winner |
| `robustness/edge_flac_with_seektable_probe` | — | — | — | — | 3 | no winner |
| `mux/neg_h264_into_ogg_illegal` | — | — | — | — | 2 | no winner |
| `robustness/edge_rotated_remux` | — | — | — | — | 2 | no winner |
| `robustness/edge_cbcs_boundary_decrypt` | — | — | — | — | 0 | no winner |
| `metadata/neg_garbled_id3_mp3_probe` | `remotion-webcodecs@4.0.479` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/mismatch_audio_only_to_video_target` | — | — | — | — | 3 | no winner |
| `robustness/prop_demux_mux_roundtrip_eq` | `mp4box@2.3.0` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/mismatch_video_only_to_audio_target` | — | — | — | — | 3 | no winner |
| `robustness/prop_double_remux_stable` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `encryption/clearkey_decrypt_na` | — | — | — | — | 2 | no winner |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | 0 | no winner |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | — | — | — | 2 | no winner |
| `remux/neg_zeroed_mp4_to_mkv` | — | — | — | — | 2 | no winner |
| `robustness/prop_trim_concatenation` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/prop_flac_seek_seektable_equiv` | — | — | — | — | 0 | no winner |
| `trim/robust_negative_start` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/edge_mislabeled_container_probe` | — | — | — | — | 4 | no winner |
| `robustness/image_jpeg_probe_na` | — | — | — | — | 3 | no winner |
| `robustness/fuzz_mp4_header_truncated_demux` | — | — | — | — | 4 | no winner |
| `demux/graceful_mp4_header_destroyed` | — | — | — | — | 4 | no winner |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | 0 | no winner |
| `robustness/edge_vfr_probe` | — | — | — | — | 5 | no winner |
| `trim/robust_zero_length_range` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/extreme_resize_1x1` | — | — | — | — | 3 | no winner |
| `robustness/edge_extreme_fps_240_probe` | — | — | — | — | 4 | no winner |
| `robustness/edge_headerless_recorder_remux` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/negative_jpeg_to_video` | — | — | — | — | 3 | no winner |
| `trim/robust_inverted_range` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/edge_gapless_priming_probe` | — | — | — | — | 4 | no winner |
| `transcode/malformed_zero_length_transcode` | — | — | — | — | 2 | no winner |
| `trim/robust_truncated_source` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/fuzz_remux_zeroed_spans` | — | — | — | — | 2 | no winner |
| `remux/neg_truncated_mp4_to_mkv` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/image_webp_probe_na` | — | — | — | — | 4 | no winner |
| `robustness/fuzz_flac_bitflip_probe` | — | — | — | — | 3 | no winner |
| `robustness/edge_video_only_probe` | — | — | — | — | 7 | no winner |
| `robustness/fuzz_webm_bitflip_probe` | — | — | — | — | 3 | no winner |
| `robustness/edge_longform_probe` | — | — | — | — | 3 | no winner |
| `robustness/edge_dims_2x2_h264_probe` | — | — | — | — | 2 | no winner |
| `robustness/edge_fragmented_remux` | — | — | — | — | 2 | no winner |
| `robustness/edge_pcm_s24_decode` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `transcode/extreme_resize_0x0` | — | — | — | — | 2 | no winner |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | — | — | — | — | 0 | no winner |
| `robustness/edge_extreme_fps_1_probe` | — | — | — | — | 5 | no winner |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | — | — | — | 2 | no winner |
| `robustness/prop_transcode_idempotent_dims_h264` | — | — | — | — | 0 | no winner |
| `robustness/edge_seek_negative` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |

### 3. Conformance matrix (same display rule, grouped by correctness)

| Scenario | aibrush-media@dev | ffmpeg.wasm@0.12.15 | mediabunny@1.48.0 | mp4box@2.3.0 | platform@chrome-149 | remotion-media-parser@4.0.479 | remotion-webcodecs@4.0.479 | web-demuxer@4.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | N/A | Pass (308 ms) | Pass (988 ms) | — | N/A | — | N/A | N/A |
| `audio-dsp/gain_half_f32` | N/A | Pass (189 ms) | Pass (55 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_backward_then_forward` | N/A | Pass (311 ms) | Pass (71 ms) | — | Pass (128 ms) | N/A | Pass (2.52 s) | Pass (197 ms) |
| `streaming-output/prop_decode_equals_stream_shape` | N/A | Pass (555 ms) | Pass (326 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vfr_timing` | N/A | Pass (884 ms) | Pass (694 ms) | N/A | — | N/A | Pass (523 ms) | Pass (732 ms) |
| `mux/prop_av1_mux_duration_webm_to_mp4` | N/A | N/A | — | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_frame_accurate` | N/A | Pass (17.43 s) | — | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mov` | N/A | Pass (220 ms) | Pass (323 ms) | N/A | N/A | — | N/A | N/A |
| `transcode/h264_resize_4k_to_1080p` | — | Pass (38.78 s) | Pass (2.15 s) | N/A | N/A | N/A | Pass (2.68 s) | N/A |
| `performance/bundle-size` | N/A | — | — | Pass (2.22 s) | — | Pass (19 ms) | Pass (20 ms) | Pass (85 ms) |
| `performance/convert-longtasks` | N/A | N/A | Pass (3.04 s) | N/A | N/A | N/A | Pass (7.75 s) | — |
| `audio-dsp/upmix_mono_to_stereo` | N/A | Pass (182 ms) | Pass (97 ms) | N/A | — | N/A | N/A | N/A |
| `trim/audio_aiff_pcm_be_copy` | — | — | N/A | — | N/A | N/A | N/A | N/A |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | Pass (20.43 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_rotated90` | N/A | Pass (156 ms) | Pass (2.64 ms) | Pass (39 ms) | Pass (37 ms) | Pass (13 ms) | Pass (6.59 ms) | Pass (86 ms) |
| `audio-dsp/downmix_stereo_to_mono` | N/A | Pass (184 ms) | Pass (57 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_aes128` | N/A | Pass (273 ms) | Pass (179 ms) | — | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mkv` | N/A | Pass (281 ms) | Pass (51 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | N/A | Pass (181 s) | Pass (15.86 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_cbr_notoc` | N/A | — | Pass (24 ms) | N/A | — | Pass (10.09 ms) | Pass (13 ms) | N/A |
| `transcode/multitrack_select_default_audio` | N/A | Pass (12.8 s) | Pass (2.26 s) | N/A | — | N/A | Pass (1.11 s) | N/A |
| `mux/edge_bframes_decode_mux_mkv` | N/A | — | Pass (345 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/selfcheck_h264_resize_720p_tie` | N/A | Pass (57.25 s) | Pass (2.33 s) | N/A | N/A | N/A | — | N/A |
| `transcode/flac_to_aac_mp4` | N/A | Pass (976 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/huge_h264_mov_copy_peakmem` | N/A | Pass (5.08 s) | Pass (666 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_roundtrip_endianness_s16` | N/A | Pass (247 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_copy_lazyread` | N/A | Pass (4.45 s) | Pass (5.04 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_noseektable` | N/A | Pass (254 ms) | Pass (4 ms) | N/A | N/A | Pass (29 ms) | Pass (24 ms) | — |
| `remux/micro_audio_short_mp4_to_adts` | N/A | Pass (157 ms) | Pass (45 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vp8` | N/A | Pass (609 ms) | Pass (421 ms) | — | Pass (379 ms) | N/A | Pass (619 ms) | Pass (252 ms) |
| `mux/prop_vp9_decode_mux_webm_to_webm` | N/A | Pass (569 ms) | Pass (334 ms) | N/A | — | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_44k1` | N/A | Pass (207 ms) | Pass (54 ms) | N/A | N/A | N/A | Pass (50 ms) | — |
| `demux/realworld_mdn_trex_mp3` | N/A | — | Pass (16 ms) | N/A | — | Pass (20 ms) | Pass (18 ms) | N/A |
| `performance/metamorphic-vfr-probe-duration` | — | Pass (156 ms) | Pass (16 ms) | Pass (7.57 ms) | Pass (13.94 ms) | Pass (3.97 ms) | Pass (15.71 ms) | Pass (75 ms) |
| `probe/h264_4k_10s` | N/A | — | — | Pass (59 ms) | Pass (86 ms) | Pass (37 ms) | Pass (33 ms) | Pass (114 ms) |
| `mux/video_plus_audio_to_mp4` | N/A | Pass (408 ms) | Pass (50.36 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_10bit_to_h264_8bit` | — | Pass (11.61 s) | N/A | N/A | N/A | N/A | N/A | — |
| `transcode/hevc_to_av1_webm` | N/A | N/A | Pass (3.3 s) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_minus6db_s16` | N/A | Pass (152 ms) | — | N/A | N/A | — | N/A | N/A |
| `performance/size-ladder-iterate-packets-medium` | N/A | Pass (280 ms) | Pass (52 ms) | Pass (69 ms) | Pass (93 ms) | Pass (32 ms) | Pass (3.81 s) | Pass (29 ms) |
| `probe/wav_s16` | N/A | Pass (182 ms) | Pass (14 ms) | N/A | Pass (36 ms) | Pass (27 ms) | Pass (32 ms) | — |
| `transcode/h264_vfr_to_cfr_30` | N/A | Pass (10.17 s) | Pass (2.11 s) | — | — | N/A | N/A | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | N/A | Pass (272 ms) | Pass (55 ms) | N/A | — | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_s16` | N/A | Pass (143 ms) | Pass (42 ms) | N/A | N/A | N/A | Pass (57 ms) | N/A |
| `transcode/ladder_tiny_h264_360p_resize_180p` | N/A | Pass (544 ms) | Pass (228 ms) | N/A | N/A | N/A | Pass (232 ms) | N/A |
| `probe/perf-extract-metadata-huge` | — | — | Pass (43 ms) | Pass (644 ms) | — | Pass (36 ms) | Pass (8.84 ms) | Pass (134 ms) |
| `transcode/h264_rotate_180` | N/A | Pass (71.18 s) | Pass (3.28 s) | N/A | N/A | N/A | Pass (5.55 s) | N/A |
| `remux/h264_1080p_30s_mp4_to_mkv` | N/A | Pass (372 ms) | Pass (405 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s24_to_wav` | N/A | Pass (255 ms) | Pass (23 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp4_tags` | N/A | Pass (125 ms) | Pass (994 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_flip_vertical` | N/A | Pass (75.07 s) | N/A | N/A | N/A | — | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | Pass (499 ms) | Pass (477 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_seektable_copy` | N/A | Pass (135 ms) | N/A | N/A | N/A | N/A | — | N/A |
| `remux/av1_720p_5s_webm_to_mkv` | N/A | N/A | Pass (8.71 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/vp8_720p_10s` | N/A | Pass (191 ms) | Pass (21 ms) | N/A | Pass (24 ms) | Pass (15.64 ms) | Pass (32 ms) | Pass (55 ms) |
| `demux/h264_in_mkv` | N/A | Pass (205 ms) | Pass (42 ms) | N/A | Pass (41 ms) | Pass (147 ms) | Pass (115 ms) | Pass (467 ms) |
| `demux/wav_s16` | N/A | Pass (151 ms) | Pass (8 ms) | N/A | Pass (18 ms) | Pass (32 ms) | Pass (22 ms) | N/A |
| `metadata/tracks_packet_attribution_multitrack` | N/A | Pass (283 ms) | Pass (31 ms) | Pass (34 ms) | Pass (36 ms) | Pass (247 ms) | Pass (114 ms) | Pass (467 ms) |
| `probe/recorder_headerless` | N/A | Pass (136 ms) | — | N/A | — | Pass (9.42 ms) | Pass (61 ms) | — |
| `encryption/cenc_cbcs_decrypt` | N/A | N/A | Pass (770 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | N/A | Pass (434 ms) | Pass (85 ms) | N/A | — | N/A | Pass (347 ms) | Pass (237 ms) |
| `remux/av1_720p_5s_webm_to_mp4` | N/A | N/A | Pass (24 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_wav_pcm_copy` | N/A | Pass (171 ms) | Pass (30 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_seektable` | N/A | Pass (151 ms) | Pass (3.52 ms) | N/A | N/A | Pass (22 ms) | Pass (20 ms) | N/A |
| `metadata/write_ogg_vorbiscomment` | N/A | Pass (185 ms) | Pass (7.78 ms) | — | N/A | N/A | N/A | — |
| `probe/large_h264_1080p_120s` | N/A | Pass (431 ms) | — | Pass (168 ms) | Pass (189 ms) | Pass (33 ms) | Pass (40 ms) | Pass (110 ms) |
| `mux/mp4_faststart_reserve` | N/A | Pass (399 ms) | Pass (133 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_mp3_copy` | N/A | Pass (167 ms) | Pass (30 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_5_1_to_stereo` | N/A | Pass (45.55 ms) | Pass (45.14 ms) | N/A | N/A | N/A | N/A | — |
| `demux/size_micro_micro_h264_1frame` | N/A | Pass (147 ms) | Pass (20 ms) | Pass (34 ms) | Pass (17 ms) | Pass (30 ms) | Pass (19 ms) | Pass (74 ms) |
| `mux/vorbis_to_ogg` | N/A | Pass (16.31 ms) | Pass (34 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_webm` | N/A | Pass (7.2 ms) | Pass (15 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_large_vp9_webm` | N/A | Pass (661 ms) | Pass (375 ms) | N/A | N/A | N/A | — | N/A |
| `probe/realworld_mdn_flower_webm` | N/A | — | Pass (15 ms) | N/A | Pass (43 ms) | Pass (34 ms) | Pass (22 ms) | Pass (60 ms) |
| `transcode/h264_resize_720p` | N/A | Pass (49.44 s) | Pass (6.19 s) | N/A | N/A | N/A | Pass (4.5 s) | N/A |
| `decode-seek/meta_seek_vs_linear_decode` | N/A | Pass (265 ms) | Pass (91 ms) | N/A | Pass (105 ms) | N/A | Pass (5.56 s) | Pass (185 ms) |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | N/A | Pass (207 ms) | N/A | — | N/A | N/A | N/A | N/A |
| `transcode/vp9_alpha_to_vp9_keepalpha` | N/A | N/A | Pass (1.4 s) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | N/A | Pass (712 ms) | Pass (41.96 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/swap_audio_video_with_opus_to_mkv` | N/A | Pass (223 ms) | Pass (117 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_xing` | N/A | Pass (128 ms) | Pass (24 ms) | N/A | — | Pass (2.58 ms) | Pass (8 ms) | N/A |
| `probe/vp9_1080p_10s` | N/A | Pass (225 ms) | Pass (44 ms) | N/A | Pass (63 ms) | Pass (31 ms) | Pass (47 ms) | Pass (91 ms) |
| `streaming-output/ts_tiny_writes` | N/A | Pass (417 ms) | Pass (641 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/opus` | — | Pass (179 ms) | Pass (29 ms) | — | N/A | N/A | — | N/A |
| `probe/aac_adts` | — | Pass (178 ms) | Pass (15 ms) | N/A | N/A | Pass (18 ms) | Pass (33 ms) | N/A |
| `transcode/roundtrip_leg2_vp9_to_h264` | N/A | Pass (26.33 s) | Pass (2.32 s) | N/A | N/A | N/A | Pass (903 ms) | N/A |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | N/A | — | Pass (709 ms) | — | N/A | N/A | N/A | N/A |
| `trim/vp9_noop_full_range_idempotent` | N/A | Pass (6.54 s) | Pass (7.18 s) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_negative` | N/A | Pass (276 ms) | Pass (50 ms) | N/A | Pass (134 ms) | — | Pass (1.93 s) | Pass (257 ms) |
| `remux/av1_720p_5s_webm_to_webm` | N/A | N/A | — | N/A | N/A | — | N/A | N/A |
| `decode-seek/decode_vp9` | N/A | Pass (1.11 s) | Pass (696 ms) | N/A | Pass (703 ms) | N/A | Pass (561 ms) | Pass (793 ms) |
| `demux/hls_vod` | N/A | Pass (218 ms) | Pass (74 ms) | N/A | N/A | Pass (412 ms) | — | N/A |
| `transcode/av1_to_h264_mp4` | N/A | N/A | Pass (1.26 s) | N/A | — | N/A | Pass (1.37 s) | N/A |
| `remux/h264_1080p_5s_mov_to_mkv` | N/A | Pass (196 ms) | Pass (77 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_44k1_to_48k` | N/A | Pass (183 ms) | Pass (80 ms) | N/A | N/A | N/A | Pass (71 ms) | N/A |
| `streaming-output/webm_headerless_live_stream` | N/A | N/A | Pass (26 ms) | N/A | — | N/A | N/A | N/A |
| `probe/h264_bframes_1080p` | N/A | Pass (177 ms) | Pass (16 ms) | Pass (21.54 ms) | Pass (50 ms) | Pass (24 ms) | Pass (24 ms) | Pass (96 ms) |
| `trim/fmp4_fragment_boundary_copy` | N/A | Pass (4.52 s) | Pass (4.68 s) | N/A | N/A | N/A | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | N/A | Pass (327 ms) | — | Pass (126 ms) | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_5s` | N/A | — | Pass (18 ms) | Pass (67 ms) | — | Pass (35 ms) | Pass (6.95 ms) | Pass (115 ms) |
| `remux/h264_in_mkv_mkv_to_ts` | N/A | Pass (267 ms) | Pass (110 ms) | — | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mov` | N/A | Pass (374 ms) | Pass (196 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_multitrack_keyframe_aligned` | N/A | Pass (2.16 s) | Pass (369 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_tiny_tiny_vp9_360p_2s` | N/A | Pass (251 ms) | Pass (2.86 ms) | N/A | — | Pass (52 ms) | Pass (31 ms) | — |
| `transcode/gapless_pcm_to_opus_priming` | N/A | N/A | Pass (600 ms) | N/A | N/A | N/A | Pass (56.27 ms) | N/A |
| `metadata/tagedit_no_corrupt_audio_flac` | N/A | Pass (138 ms) | Pass (24 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_in_mkv` | N/A | Pass (42.45 ms) | Pass (26 ms) | — | Pass (39 ms) | Pass (41 ms) | Pass (27 ms) | Pass (133 ms) |
| `streaming-output/mp4_streaming_target` | N/A | Pass (348 ms) | Pass (914 ms) | Pass (117 ms) | — | N/A | N/A | N/A |
| `mux/opus_to_ogg` | N/A | Pass (158 ms) | Pass (23 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_rotate_90_dimswap` | N/A | Pass (71.85 s) | Pass (6.17 s) | N/A | N/A | N/A | N/A | — |
| `transcode/h264_fps_15_to_30` | — | Pass (8.71 s) | Pass (1.57 s) | N/A | — | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-huge` | N/A | Pass (1.48 s) | Pass (1 s) | Pass (1.02 s) | Pass (1 s) | — | Pass (72 ms) | Pass (51 ms) |
| `probe/massive_h264_1080p_2h` | N/A | Pass (2.55 s) | Pass (303 ms) | Pass (1.77 s) | Pass (2.29 s) | Pass (270 ms) | Pass (340 ms) | Pass (322 ms) |
| `demux/metamorphic_flac_seektable_invariance` | N/A | Pass (166 ms) | Pass (23 ms) | N/A | N/A | — | Pass (36 ms) | N/A |
| `performance/size-ladder-demux-peak-memory-large` | N/A | Pass (362 ms) | Pass (362 ms) | Pass (245 ms) | Pass (224 ms) | Pass (20.06 s) | Pass (9.1 s) | Pass (6.81 s) |
| `transcode/h264_rotate_normalize` | N/A | Pass (14.6 s) | Pass (1.56 s) | N/A | N/A | N/A | Pass (1.02 s) | N/A |
| `remux/prop_mp3_to_mp4_duration_invariant` | N/A | Pass (151 ms) | Pass (22 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/buffer_massive_h264_mp4` | N/A | Pass (7.34 s) | Pass (71.46 s) | — | N/A | N/A | N/A | N/A |
| `mux/aac_to_adts` | N/A | Pass (176 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_no_tags_wav` | N/A | Pass (156 ms) | Pass (2.14 ms) | N/A | Pass (30 ms) | Pass (8.05 ms) | Pass (28 ms) | N/A |
| `transcode/h264_to_hevc_mp4` | N/A | N/A | Pass (2.86 s) | N/A | N/A | N/A | Pass (4.79 s) | N/A |
| `trim/vp8_keyframe_aligned` | N/A | Pass (2.24 s) | Pass (2.21 s) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_bframes_1080p_mp4_to_mkv` | N/A | Pass (246 ms) | Pass (174 ms) | N/A | — | N/A | N/A | N/A |
| `transcode/hevc_to_vp9_webm` | N/A | N/A | Pass (2.38 s) | N/A | N/A | N/A | Pass (1.8 s) | N/A |
| `audio-dsp/throughput_encode_s24` | — | Pass (156 ms) | Pass (49 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_8bit_to_hevc_10bit` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/metamorphic_resize_same_1080p_idempotent` | N/A | Pass (70.4 s) | Pass (3.76 s) | N/A | N/A | N/A | Pass (2.88 s) | N/A |
| `streaming-output/mp4_fragmented_cmaf` | N/A | Pass (304 ms) | Pass (837 ms) | Pass (126 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16be_to_s16le` | N/A | Pass (174 ms) | N/A | N/A | N/A | — | N/A | N/A |
| `mux/opus_to_webm_audio` | N/A | Pass (202 ms) | Pass (7.95 ms) | N/A | N/A | — | N/A | N/A |
| `transcode/wav_to_mp3_mp4` | N/A | Pass (733 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_ts` | N/A | Pass (261 ms) | — | N/A | N/A | N/A | — | N/A |
| `transcode/h264_to_vp8_webm` | N/A | Pass (2.35 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_tiny_dims_2x2_h264` | N/A | Pass (164 ms) | Pass (33 ms) | N/A | Pass (34 ms) | N/A | — | Pass (72 ms) |
| `transcode/h264_two_pass_bitrate` | N/A | Pass (80.82 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_hevc` | N/A | Pass (1.22 s) | Pass (683 ms) | N/A | Pass (654 ms) | N/A | Pass (1.51 s) | Pass (721 ms) |
| `probe/huge_vp9_1080p_240s` | N/A | Pass (445 ms) | Pass (42 ms) | N/A | Pass (629 ms) | Pass (423 ms) | Pass (216 ms) | Pass (107 ms) |
| `mux/pcm_f32_to_wav` | N/A | Pass (264 ms) | Pass (25 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-probe` | N/A | Pass (269 ms) | Pass (18 ms) | Pass (103 ms) | Pass (62 ms) | Pass (3.69 ms) | Pass (4.47 ms) | Pass (29.42 ms) |
| `decode-seek/seek_mkv_h264_keyframe` | N/A | Pass (259 ms) | Pass (52 ms) | N/A | Pass (101 ms) | N/A | Pass (438 ms) | Pass (178 ms) |
| `streaming-output/webm_streaming_target` | N/A | Pass (246 ms) | Pass (76 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_bitrate_2mbps` | — | Pass (70.24 s) | Pass (5.27 s) | — | N/A | N/A | Pass (4.26 s) | — |
| `transcode/vp8_to_vp9_webm` | N/A | N/A | Pass (720 ms) | N/A | N/A | N/A | Pass (669 ms) | N/A |
| `performance/convert-webm-resize-320x180` | N/A | N/A | Pass (6.09 s) | N/A | N/A | N/A | Pass (3.9 s) | N/A |
| `performance/encode-fps` | N/A | N/A | Pass (5.5 s) | N/A | N/A | N/A | Pass (5.28 s) | N/A |
| `probe/wav_s24` | — | Pass (225 ms) | Pass (16 ms) | N/A | Pass (15 ms) | Pass (24 ms) | Pass (5 ms) | N/A |
| `encryption/hls_aes128_decrypt` | N/A | Pass (993 ms) | Pass (879 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s16be` | N/A | Pass (186 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hevc_1080p_10s` | N/A | Pass (233 ms) | Pass (53 ms) | Pass (34.14 ms) | Pass (34.67 ms) | Pass (1.54 s) | Pass (563 ms) | Pass (898 ms) |
| `mux/audio_only_aac_to_mp4` | N/A | Pass (160 ms) | Pass (26 ms) | N/A | N/A | N/A | N/A | — |
| `trim/audio_opus_ogg_copy` | N/A | Pass (189 ms) | Pass (5.73 ms) | N/A | N/A | — | N/A | N/A |
| `trim/h264_open_gop_frame_accurate` | N/A | — | Pass (3.11 s) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_progressive_buffer` | N/A | Pass (573 ms) | Pass (116 ms) | Pass (235 ms) | N/A | N/A | — | N/A |
| `trim/h264_single_gop_frame_accurate` | N/A | — | Pass (186 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_attribution_multitrack` | — | Pass (24.61 ms) | Pass (39 ms) | Pass (57 ms) | Pass (29 ms) | Pass (56 ms) | — | Pass (22.01 ms) |
| `probe/wav_f32` | N/A | Pass (155 ms) | — | N/A | — | N/A | N/A | N/A |
| `transcode/av_downmix_stereo_to_mono` | N/A | Pass (70.29 s) | Pass (3.97 s) | — | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_5s` | — | Pass (183 ms) | Pass (43 ms) | Pass (55 ms) | — | Pass (98 ms) | — | Pass (378 ms) |
| `performance/decode-fps` | — | N/A | Pass (262 ms) | N/A | Pass (313 ms) | N/A | Pass (1.75 s) | Pass (357 ms) |
| `remux/aac_adts_adts_to_mp4` | N/A | Pass (187 ms) | Pass (36 ms) | N/A | N/A | N/A | Pass (178 ms) | — |
| `metadata/read_h264_1080p_30s` | N/A | Pass (199 ms) | Pass (18 ms) | Pass (65 ms) | Pass (161 ms) | Pass (22 ms) | Pass (31 ms) | Pass (30.9 ms) |
| `decode-seek/decode_mov_h264` | N/A | Pass (1.88 s) | — | N/A | Pass (1.13 s) | N/A | Pass (993 ms) | Pass (1.23 s) |
| `metadata/write_mp3_id3` | N/A | Pass (163 ms) | Pass (26 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_flower_mp4` | N/A | Pass (186 ms) | N/A | Pass (42 ms) | Pass (27 ms) | Pass (34 ms) | Pass (46 ms) | — |
| `remux/h264_1080p_5s_mov_to_mp4` | N/A | Pass (224 ms) | Pass (225 ms) | Pass (41 ms) | N/A | N/A | Pass (223 ms) | N/A |
| `metadata/meta_consistent_mp4_to_mkv` | N/A | Pass (372 ms) | Pass (554 ms) | N/A | N/A | — | N/A | N/A |
| `transcode/h264_fps_30_to_15` | N/A | Pass (46.51 s) | — | N/A | N/A | N/A | N/A | N/A |
| `demux/size_massive_massive_h264_1080p_2h` | N/A | Pass (4.73 s) | Pass (9.34 s) | Pass (3.1 s) | Pass (3.32 s) | Pass (467 ms) | Pass (403 ms) | Pass (428 ms) |
| `decode-seek/seek_h264_keyframe` | N/A | Pass (318 ms) | Pass (46 ms) | N/A | Pass (189 ms) | — | Pass (2.86 s) | Pass (187 ms) |
| `mux/mp4_fragmented_cmaf` | N/A | Pass (410 ms) | — | Pass (285 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/fade_in_out_f32` | N/A | Pass (192 ms) | Pass (51 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/video_a_plus_audio_b_to_mkv` | N/A | Pass (450 ms) | Pass (104 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_xing` | N/A | Pass (223 ms) | Pass (25 ms) | N/A | N/A | Pass (41 ms) | — | N/A |
| `audio-dsp/pcm_s24_to_f32` | — | Pass (247 ms) | Pass (50 ms) | — | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mkv` | N/A | Pass (832 ms) | Pass (338 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mkv` | N/A | Pass (415 ms) | Pass (99 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/drop_audio_track_subset_to_mp4` | N/A | Pass (218 ms) | — | — | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mov` | N/A | Pass (279 ms) | Pass (72 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_fragmented_shape` | N/A | Pass (116 ms) | Pass (614 ms) | Pass (86.78 ms) | N/A | N/A | N/A | N/A |
| `streaming-output/stream_massive_h264_mp4` | N/A | Pass (7.8 s) | Pass (55.46 s) | Pass (10.41 s) | N/A | N/A | N/A | N/A |
| `probe/micro_h264_1frame` | N/A | Pass (136 ms) | Pass (17 ms) | Pass (13 ms) | Pass (28 ms) | Pass (24 ms) | Pass (18 ms) | Pass (63 ms) |
| `probe/perf-extract-metadata-large` | N/A | Pass (127 ms) | Pass (24 ms) | Pass (341 ms) | Pass (173 ms) | Pass (38 ms) | Pass (41 ms) | Pass (33.39 ms) |
| `performance/size-ladder-iterate-packets-large` | N/A | Pass (550 ms) | Pass (306 ms) | Pass (146 ms) | Pass (356 ms) | Pass (24.83 s) | Pass (46.99 s) | Pass (6.13 s) |
| `remux/mp3_xing_mp3_to_mkv` | N/A | Pass (199 ms) | Pass (24 ms) | N/A | N/A | — | N/A | N/A |
| `transcode/h264_flip_horizontal` | N/A | Pass (73.5 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_ts_to_mp4_duration_materialized` | — | Pass (253 ms) | Pass (101 ms) | N/A | N/A | N/A | Pass (716 ms) | N/A |
| `encryption/unencrypted_left_untouched_noop` | N/A | Pass (1.2 s) | Pass (1.27 s) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mkv_tags` | N/A | Pass (400 ms) | Pass (214 ms) | — | N/A | N/A | — | N/A |
| `streaming-output/prop_ts_stream_duration_materialized` | N/A | Pass (125 ms) | Pass (354 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_av1_keyframe` | N/A | N/A | Pass (22.35 ms) | N/A | — | N/A | Pass (201 ms) | Pass (96 ms) |
| `performance/convert-peak-memory` | N/A | N/A | Pass (5.28 s) | N/A | N/A | N/A | Pass (3.47 s) | N/A |
| `trim/vp9_keyframe_aligned` | — | Pass (3.94 s) | Pass (3.52 s) | N/A | N/A | — | N/A | N/A |
| `streaming-output/mp4_buffer_target` | N/A | Pass (329 ms) | Pass (431 ms) | Pass (147 ms) | — | N/A | N/A | N/A |
| `trim/massive_h264_copy_sustained` | N/A | — | Pass (112 s) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_variable_channel_count_downmix` | N/A | Pass (210 ms) | Pass (86 ms) | N/A | N/A | — | N/A | N/A |
| `probe/tiny_h264_360p_2s` | N/A | Pass (206 ms) | Pass (5 ms) | Pass (36 ms) | Pass (31 ms) | Pass (24 ms) | Pass (12 ms) | Pass (111 ms) |
| `trim/av1_keyframe_aligned` | N/A | N/A | Pass (1.8 s) | N/A | N/A | N/A | — | N/A |
| `remux/aac_adts_adts_to_ts` | N/A | Pass (187 ms) | Pass (30 ms) | — | N/A | N/A | N/A | — |
| `performance/op-sweep-demux` | N/A | Pass (300 ms) | Pass (140 ms) | Pass (102 ms) | — | Pass (55 ms) | Pass (1.99 s) | Pass (25 ms) |
| `performance/seek-ms` | N/A | Pass (278 ms) | Pass (55 ms) | N/A | Pass (115 ms) | N/A | Pass (9.4 s) | — |
| `remux/mp3_xing_mp3_to_mp4` | N/A | Pass (134 ms) | Pass (34 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_flac_vorbiscomment` | N/A | Pass (140 ms) | Pass (31 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_mux_duration_webm_to_webm` | N/A | Pass (107 ms) | Pass (52 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/bframe_reorder_h264_to_vp9` | N/A | N/A | Pass (2.49 s) | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_alpha_to_vp8_keepalpha` | N/A | — | — | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_audio_short` | N/A | Pass (159 ms) | Pass (19 ms) | Pass (29 ms) | — | Pass (35 ms) | Pass (29 ms) | Pass (70 ms) |
| `trim/h264_to_eof_copy` | N/A | Pass (3.07 s) | Pass (3.01 s) | — | N/A | N/A | N/A | N/A |
| `remux/h264_rotated90_mp4_to_mov` | N/A | Pass (243 ms) | Pass (280 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mkv` | N/A | Pass (246 ms) | Pass (273 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | N/A | Pass (1.76 s) | Pass (8.03 s) | Pass (1.72 s) | — | N/A | Pass (1.27 s) | N/A |
| `metadata/rotation_survives_mp4_mkv` | N/A | — | Pass (308 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_vfr` | N/A | Pass (182 ms) | N/A | Pass (43 ms) | Pass (31 ms) | Pass (18 ms) | Pass (28 ms) | N/A |
| `probe/h264_1080p_5s` | N/A | Pass (160 ms) | Pass (32 ms) | Pass (30 ms) | Pass (35 ms) | Pass (23 ms) | Pass (59 ms) | Pass (105 ms) |
| `probe/hevc_1080p_10s` | N/A | Pass (179 ms) | Pass (7 ms) | Pass (49 ms) | Pass (32 ms) | Pass (44 ms) | Pass (32 ms) | Pass (9.7 ms) |
| `decode-seek/decode_multitrack_select_video` | N/A | Pass (632 ms) | — | N/A | Pass (353 ms) | N/A | Pass (340 ms) | Pass (365 ms) |
| `metadata/rotation_decode_read_h264_rotated90` | N/A | N/A | N/A | N/A | Pass (107 ms) | N/A | — | N/A |
| `transcode/opus_to_aac_mp4` | N/A | Pass (960 ms) | Pass (687 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_rotated90` | N/A | — | Pass (22 ms) | Pass (49 ms) | Pass (98 ms) | Pass (303 ms) | Pass (120 ms) | Pass (301 ms) |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | N/A | Pass (239 ms) | Pass (23 ms) | Pass (46 ms) | N/A | N/A | N/A | N/A |
| `transcode/mp3_to_aac_mp4` | N/A | Pass (916 ms) | Pass (672 ms) | N/A | N/A | N/A | Pass (662 ms) | N/A |
| `decode-seek/decode_h264_first_frames` | N/A | Pass (2.08 s) | Pass (1.44 s) | — | Pass (1.2 s) | — | Pass (3.9 s) | Pass (1.36 s) |
| `performance/metamorphic-vfr-iterate-packets` | N/A | Pass (188 ms) | N/A | Pass (8.37 ms) | Pass (70 ms) | Pass (25 ms) | Pass (17 ms) | N/A |
| `probe/h264_vfr` | N/A | Pass (192 ms) | Pass (23 ms) | Pass (27 ms) | Pass (32 ms) | Pass (26 ms) | Pass (12 ms) | Pass (99 ms) |
| `remux/h264_in_mkv_mkv_to_mov` | N/A | Pass (212 ms) | Pass (27 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/fanout_h264_abr_ladder` | N/A | N/A | Pass (13.3 s) | N/A | — | N/A | N/A | N/A |
| `performance/metamorphic-decode-remux` | N/A | Pass (623 ms) | Pass (878 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_past_eof` | N/A | Pass (447 ms) | Pass (144 ms) | N/A | — | N/A | Pass (14.43 s) | Pass (215 ms) |
| `streaming-output/mp4_faststart_in_memory` | N/A | Pass (279 ms) | Pass (456 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_alpha_keyframe_aligned` | N/A | N/A | Pass (1.76 s) | N/A | N/A | — | N/A | N/A |
| `decode-seek/decode_tiny_dims_1x1` | N/A | Pass (164 ms) | Pass (24 ms) | N/A | — | N/A | Pass (27 ms) | Pass (185 ms) |
| `demux/size_huge_huge_h264_1080p_600s` | N/A | Pass (1.41 s) | Pass (905 ms) | Pass (805 ms) | Pass (1.13 s) | SKIPPED | Pass (45 ms) | Pass (73 ms) |
| `demux/flac_seektable` | N/A | Pass (167 ms) | Pass (23 ms) | N/A | N/A | Pass (26 ms) | Pass (37 ms) | N/A |
| `decode-seek/decode_bframes_reorder` | N/A | Pass (1.63 s) | Pass (1.23 s) | N/A | Pass (1.2 s) | N/A | Pass (1.39 s) | Pass (1.43 s) |
| `demux/size_tiny_tiny_h264_360p_2s` | N/A | Pass (8.01 ms) | Pass (11 ms) | Pass (3.77 ms) | Pass (32 ms) | Pass (46 ms) | Pass (37 ms) | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | N/A | — | Pass (124 ms) | — | N/A | N/A | N/A | N/A |
| `transcode/h264_to_vp9_webm` | N/A | N/A | Pass (5.67 s) | N/A | N/A | N/A | — | N/A |
| `decode-seek/decode_size_tiny_h264_360p` | N/A | Pass (281 ms) | Pass (131 ms) | N/A | Pass (150 ms) | N/A | Pass (130 ms) | Pass (183 ms) |
| `mux/edge_multitrack_keep_all_to_mp4` | N/A | Pass (307 ms) | Pass (48 ms) | Pass (33.06 ms) | N/A | N/A | — | N/A |
| `transcode/h264_to_ts` | N/A | N/A | — | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_cbr_notoc` | N/A | Pass (8.5 ms) | Pass (42 ms) | N/A | N/A | Pass (2.04 ms) | Pass (22 ms) | N/A |
| `transcode/h264_crop_center` | — | Pass (53.86 s) | Pass (4 s) | N/A | — | N/A | N/A | — |
| `decode-seek/seek_vp8_keyframe` | N/A | Pass (296 ms) | Pass (31 ms) | N/A | Pass (40 ms) | N/A | Pass (71.85 ms) | Pass (93 ms) |
| `trim/h264_keyframe_aligned` | — | Pass (4.64 s) | Pass (4.69 s) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_noseektable_copy` | N/A | Pass (239 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-massive` | N/A | Pass (4.85 s) | — | Pass (2.82 s) | Pass (3.08 s) | Pass (87.47 ms) | Pass (384 ms) | Pass (358 ms) |
| `probe/opus` | N/A | — | Pass (8 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_keyframe_aligned` | N/A | Pass (3.46 s) | Pass (3.22 s) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_hevc_keyframe` | N/A | Pass (240 ms) | Pass (56 ms) | — | Pass (95 ms) | N/A | Pass (1.97 s) | Pass (69.51 ms) |
| `streaming-output/prop_decode_equals_buffer_shape` | — | Pass (524 ms) | Pass (317 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | N/A | Pass (281 ms) | Pass (39 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_frame_accurate` | N/A | N/A | Pass (3.47 s) | N/A | N/A | N/A | N/A | — |
| `transcode/aac_to_pcm_wav_extract` | N/A | Pass (163 ms) | Pass (49.11 ms) | N/A | N/A | N/A | Pass (98.98 ms) | N/A |
| `mux/three_track_assembly_to_mkv` | N/A | Pass (606 ms) | Pass (152 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_av1` | N/A | N/A | Pass (365 ms) | — | Pass (257 ms) | N/A | — | Pass (301 ms) |
| `performance/size-ladder-iterate-packets-huge` | N/A | Pass (1.23 s) | Pass (1.58 s) | Pass (802 ms) | Pass (1.4 s) | Pass (85.8 s) | — | Pass (57 ms) |
| `trim/h264_start_zero_copy` | N/A | Pass (4.06 s) | Pass (3.5 s) | N/A | N/A | N/A | — | N/A |
| `transcode/hdr10_to_sdr_tonemap` | N/A | Pass (862 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `probe/cenc_cbcs` | N/A | Pass (190 ms) | Pass (18 ms) | — | Pass (36 ms) | Pass (25 ms) | Pass (37 ms) | Pass (92 ms) |
| `decode-seek/decode_size_tiny_vp9_360p` | N/A | Pass (318 ms) | Pass (106 ms) | N/A | Pass (159 ms) | N/A | Pass (145 ms) | Pass (178 ms) |
| `decode-seek/seek_repeated_same_target` | N/A | — | Pass (49 ms) | N/A | Pass (122 ms) | N/A | Pass (4.8 s) | Pass (179 ms) |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | N/A | Pass (9.33 s) | Pass (63.93 s) | N/A | N/A | — | N/A | N/A |
| `transcode/mp3_to_opus_webm` | N/A | N/A | Pass (842 ms) | N/A | N/A | N/A | Pass (716 ms) | N/A |
| `probe/metamorphic-recorder-headerless-sane-duration` | N/A | Pass (141 ms) | Pass (26 ms) | N/A | Pass (60 ms) | Pass (16.55 ms) | Pass (25 ms) | Pass (94 ms) |
| `audio-dsp/throughput_decode_s24` | N/A | Pass (189 ms) | Pass (77 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_mkv` | N/A | Pass (6.16 ms) | Pass (34 ms) | — | N/A | — | N/A | N/A |
| `trim/h264_bframes_frame_accurate` | N/A | Pass (6.63 s) | Pass (2.98 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/big_buck_bunny_1080p_h264` | N/A | Pass (1.71 s) | Pass (44 ms) | Pass (1.27 s) | Pass (1.54 s) | Pass (7.39 ms) | Pass (9.28 ms) | Pass (135 ms) |
| `trim/large_h264_frame_accurate_throughput` | N/A | Pass (26.06 s) | — | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_vorbis_ogg` | N/A | Pass (198 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_multitrack_survives_mp4_mkv` | N/A | Pass (374 ms) | Pass (258 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_zero` | N/A | Pass (308 ms) | Pass (42 ms) | N/A | Pass (83.13 ms) | N/A | Pass (3.45 s) | — |
| `performance/size-ladder-iterate-packets-tiny` | N/A | — | Pass (24 ms) | Pass (34 ms) | Pass (39 ms) | Pass (26 ms) | Pass (62 ms) | Pass (90 ms) |
| `decode-seek/decode_h264_10bit` | N/A | Pass (1.36 s) | Pass (781 ms) | N/A | — | N/A | Pass (582 ms) | Pass (687 ms) |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | N/A | Pass (618 ms) | Pass (4.15 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_flower_webm` | N/A | Pass (161 ms) | — | N/A | Pass (22 ms) | Pass (162 ms) | Pass (98 ms) | Pass (151 ms) |
| `mux/h264_aac_to_mov` | N/A | Pass (489 ms) | Pass (166 ms) | — | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mp4` | N/A | Pass (256 ms) | Pass (60 ms) | N/A | N/A | N/A | Pass (705 ms) | N/A |
| `performance/op-sweep-transcode-webm` | N/A | N/A | Pass (3.35 s) | N/A | N/A | — | Pass (4.09 s) | N/A |
| `remux/flac_seektable_flac_to_ogg` | N/A | Pass (136 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-huge` | — | Pass (934 ms) | Pass (59 ms) | — | — | Pass (51 ms) | — | Pass (128 ms) |
| `transcode/h264_rotate_270_dimswap` | N/A | Pass (11.44 s) | Pass (1.49 s) | N/A | N/A | N/A | — | N/A |
| `trim/ts_keyframe_aligned` | N/A | Pass (301 ms) | Pass (742 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_gapless_aac_decode` | N/A | N/A | Pass (31 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-large4k` | N/A | Pass (238 ms) | — | Pass (57 ms) | Pass (45.26 ms) | Pass (922 ms) | Pass (854 ms) | Pass (1.46 s) |
| `performance/metamorphic-transcode-idempotent-source-res` | N/A | N/A | — | — | N/A | N/A | Pass (8.76 s) | N/A |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | N/A | Pass (872 ms) | Pass (357 ms) | N/A | N/A | — | N/A | N/A |
| `mux/h264_aac_to_mp4` | N/A | Pass (190 ms) | Pass (129 ms) | Pass (179 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_idempotent_resample_same_rate` | N/A | Pass (203 ms) | Pass (60 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/mkv_keyframe_aligned` | N/A | Pass (1.73 s) | Pass (1.94 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_vp9_1080p_120s` | — | Pass (542 ms) | Pass (252 ms) | N/A | Pass (283 ms) | Pass (692 ms) | — | Pass (6.83 s) |
| `audio-dsp/edge_longform_audio_resample_16k` | N/A | Pass (4.26 s) | Pass (4.51 s) | N/A | N/A | N/A | Pass (15.02 s) | N/A |
| `decode-seek/decode_size_large_vp9_120s` | N/A | Pass (2.19 s) | Pass (1.19 s) | N/A | Pass (1.61 s) | N/A | Pass (1.38 s) | Pass (1.18 s) |
| `decode-seek/seek_h264_nonkeyframe` | N/A | Pass (524 ms) | Pass (120 ms) | N/A | — | N/A | Pass (7 s) | Pass (224 ms) |
| `transcode/hevc_to_h264_mp4` | N/A | Pass (26.68 s) | Pass (2.07 s) | N/A | N/A | N/A | Pass (2.15 s) | N/A |
| `probe/longform_1h_audio` | N/A | Pass (349 ms) | — | Pass (188 ms) | Pass (230 ms) | — | Pass (93 ms) | Pass (132 ms) |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | N/A | Pass (74.13 s) | Pass (4 s) | — | N/A | N/A | N/A | N/A |
| `demux/size_large_large_h264_1080p_120s` | N/A | Pass (372 ms) | Pass (265 ms) | Pass (227 ms) | Pass (174 ms) | Pass (10.5 s) | Pass (19.21 s) | Pass (5.44 s) |
| `remux/h264_multitrack_mp4_to_mkv` | — | Pass (41.55 ms) | Pass (144 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s16be` | N/A | Pass (192 ms) | N/A | N/A | — | — | N/A | N/A |
| `remux/prop_recorder_headerless_duration_materialized` | N/A | Pass (210 ms) | Pass (31 ms) | N/A | — | N/A | N/A | N/A |
| `probe/tiny_vp9_360p_2s` | N/A | Pass (182 ms) | Pass (37 ms) | N/A | Pass (22 ms) | Pass (18 ms) | Pass (32 ms) | Pass (65 ms) |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | N/A | Pass (361 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_fps_240` | N/A | N/A | Pass (29.52 s) | — | N/A | N/A | N/A | N/A |
| `decode-seek/decode_h264_4k` | N/A | Pass (4.13 s) | Pass (2.13 s) | N/A | Pass (2.12 s) | N/A | Pass (3.02 s) | Pass (2.4 s) |
| `demux/h264_ts` | N/A | Pass (48.7 ms) | Pass (38.7 ms) | N/A | N/A | — | Pass (172 ms) | N/A |
| `probe/realworld_mdn_flower_mp4` | N/A | Pass (155 ms) | Pass (28 ms) | Pass (29 ms) | Pass (29 ms) | Pass (28 ms) | Pass (25 ms) | Pass (106 ms) |
| `performance/size-ladder-extract-metadata-tiny` | N/A | — | Pass (56 ms) | — | Pass (21 ms) | Pass (23 ms) | Pass (24 ms) | Pass (78 ms) |
| `probe/av1_720p_5s` | N/A | N/A | Pass (19 ms) | N/A | Pass (44 ms) | Pass (24 ms) | Pass (40 ms) | Pass (66 ms) |
| `demux/wav_s24` | N/A | Pass (146 ms) | Pass (25 ms) | N/A | Pass (45 ms) | Pass (28 ms) | Pass (5.07 ms) | N/A |
| `performance/metamorphic-probe-duration-cross-container` | N/A | N/A | Pass (4.08 s) | N/A | N/A | N/A | Pass (8.76 s) | N/A |
| `decode-seek/decode_extreme_fps_1` | N/A | — | Pass (110 ms) | N/A | Pass (86 ms) | N/A | Pass (26.12 ms) | Pass (96 ms) |
| `metadata/read_no_tags_recorder_webm` | N/A | — | Pass (17 ms) | N/A | Pass (38 ms) | Pass (13.36 ms) | Pass (39 ms) | Pass (87 ms) |
| `remux/h264_1080p_30s_mp4_to_ts` | — | Pass (492 ms) | Pass (562 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/empty_audio_zero_packets` | N/A | — | Pass (2.05 ms) | N/A | Pass (22 ms) | Pass (16 ms) | — | N/A |
| `transcode/vp9_to_vp8_webm` | N/A | Pass (42.53 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_reserve` | N/A | Pass (327 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | N/A | Pass (118 ms) | Pass (330 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/aac_to_opus_webm` | N/A | N/A | Pass (751 ms) | N/A | N/A | N/A | Pass (664 ms) | N/A |
| `performance/op-sweep-remux-mp4-to-mkv` | N/A | Pass (968 ms) | Pass (1.06 s) | N/A | N/A | N/A | — | N/A |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | N/A | Pass (26 ms) | — | N/A | N/A | N/A | N/A |
| `decode-seek/meta_pts_monotonic_after_reorder` | N/A | Pass (1.7 s) | Pass (1.18 s) | N/A | Pass (1.22 s) | N/A | Pass (2.09 s) | — |
| `streaming-output/ts_continuity_many_writes` | N/A | — | Pass (816 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vp9_keyframe` | N/A | Pass (859 ms) | Pass (57 ms) | N/A | Pass (146 ms) | N/A | Pass (797 ms) | Pass (231 ms) |
| `metadata/read_flac_seektable` | N/A | Pass (171 ms) | Pass (8 ms) | N/A | N/A | — | Pass (21 ms) | N/A |
| `probe/metamorphic-duration-across-containers` | N/A | Pass (307 ms) | Pass (59 ms) | N/A | Pass (74.46 ms) | — | Pass (20.97 ms) | Pass (158 ms) |
| `mux/av1_opus_to_mp4` | N/A | N/A | Pass (35 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_rotated_keyframe_aligned` | N/A | Pass (2.17 s) | Pass (2.08 s) | N/A | N/A | N/A | N/A | N/A |
| `mux/flac_to_mkv_audio` | N/A | Pass (150 ms) | Pass (19 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_audio_short` | N/A | Pass (6.97 ms) | Pass (16 ms) | Pass (38 ms) | Pass (6.58 ms) | Pass (8 ms) | Pass (42 ms) | Pass (64 ms) |
| `transcode/vp9_to_h264_mp4` | N/A | Pass (26.27 s) | Pass (1.96 s) | N/A | N/A | N/A | Pass (893 ms) | N/A |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | Pass (738 ms) | Pass (188 ms) | N/A | N/A | — | Pass (285 ms) | N/A |
| `decode-seek/decode_vp9_alpha` | N/A | N/A | Pass (300 ms) | — | Pass (286 ms) | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-medium` | — | Pass (206 ms) | Pass (7 ms) | Pass (73 ms) | Pass (76 ms) | Pass (3.66 ms) | Pass (20 ms) | Pass (30.83 ms) |
| `audio-dsp/upmix_stereo_to_5_1` | N/A | — | Pass (102 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24be_to_s16le` | N/A | Pass (159 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_opus_ogg` | N/A | N/A | Pass (127 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_f32` | N/A | Pass (180 ms) | Pass (9 ms) | N/A | Pass (23 ms) | N/A | N/A | N/A |
| `remux/prop_rotation_survives_mp4_mov` | — | Pass (393 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `probe/empty-audio-wav` | — | Pass (125 ms) | Pass (4.11 ms) | N/A | Pass (29 ms) | Pass (1.84 ms) | Pass (21 ms) | N/A |
| `transcode/bframe_reorder_h264_to_h264` | N/A | Pass (24.44 s) | Pass (2.41 s) | N/A | N/A | N/A | — | N/A |
| `demux/aac_adts` | N/A | — | Pass (21 ms) | N/A | N/A | Pass (32 ms) | Pass (49 ms) | N/A |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | N/A | Pass (566 ms) | Pass (342 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_longform_audio_probe` | N/A | Pass (417 ms) | Pass (37 ms) | N/A | Pass (677 ms) | — | Pass (50 ms) | N/A |
| `decode-seek/decode_size_micro_h264_1frame` | N/A | Pass (182 ms) | Pass (33 ms) | N/A | Pass (31 ms) | N/A | Pass (4.52 ms) | Pass (59 ms) |
| `mux/size_micro_1frame_to_mp4` | N/A | — | — | Pass (28 ms) | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mkv` | N/A | Pass (327 ms) | — | N/A | N/A | — | N/A | N/A |
| `metadata/read_h264_in_mkv` | N/A | Pass (209 ms) | Pass (30 ms) | N/A | Pass (98 ms) | Pass (17.25 ms) | Pass (45 ms) | Pass (128 ms) |
| `performance/extract-metadata` | N/A | Pass (262 ms) | Pass (23 ms) | — | Pass (117 ms) | Pass (28 ms) | Pass (42 ms) | Pass (76 ms) |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | Pass (512 ms) | Pass (876 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | Pass (1.82 s) | Pass (8.06 s) | Pass (1.53 s) | N/A | N/A | N/A | N/A |
| `metadata/read_h264_multitrack` | N/A | Pass (166 ms) | Pass (16 ms) | Pass (42 ms) | Pass (70 ms) | Pass (22 ms) | Pass (25 ms) | Pass (71 ms) |
| `performance/size-ladder-extract-metadata-massive` | N/A | Pass (2.42 s) | Pass (296 ms) | Pass (2.22 s) | Pass (3.08 s) | Pass (295 ms) | Pass (406 ms) | Pass (606 ms) |
| `mux/edge_hevc_decode_mux_mkv` | N/A | Pass (584 ms) | Pass (303 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_av1_mp4` | N/A | N/A | Pass (7.84 s) | — | N/A | N/A | — | N/A |
| `demux/pcm_s16be` | N/A | Pass (183 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_30s` | N/A | Pass (210 ms) | Pass (28 ms) | Pass (38.77 ms) | Pass (147 ms) | Pass (48 ms) | Pass (26 ms) | Pass (83 ms) |
| `probe/cenc_ctr` | N/A | Pass (179 ms) | SKIPPED | Pass (34 ms) | Pass (51 ms) | Pass (40 ms) | Pass (23 ms) | — |
| `probe/h264_ts` | N/A | Pass (47.72 ms) | — | N/A | N/A | Pass (318 ms) | Pass (275 ms) | Pass (380 ms) |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | N/A | Pass (916 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mp4` | N/A | Pass (291 ms) | Pass (49 ms) | N/A | N/A | N/A | — | N/A |
| `transcode/flac_to_opus_webm` | N/A | N/A | — | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mkv` | N/A | Pass (280 ms) | Pass (67 ms) | N/A | N/A | N/A | — | N/A |
| `demux/h264_multitrack` | N/A | Pass (209 ms) | Pass (48 ms) | Pass (95 ms) | Pass (84 ms) | — | Pass (303 ms) | Pass (609 ms) |
| `transcode/h264_fps_30_to_60` | N/A | Pass (99.23 s) | Pass (5.02 s) | N/A | — | N/A | N/A | N/A |
| `trim/mov_keyframe_aligned` | N/A | Pass (3.07 s) | Pass (3.04 s) | N/A | N/A | N/A | N/A | N/A |
| `remux/vp8_720p_10s_webm_to_mkv` | N/A | Pass (155 ms) | Pass (42 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_30s` | N/A | Pass (82.55 ms) | Pass (111 ms) | Pass (58.36 ms) | Pass (135 ms) | Pass (27 ms) | Pass (2.35 s) | — |
| `audio-dsp/pcm_s16le_to_s16be` | N/A | Pass (167 ms) | N/A | N/A | — | — | N/A | N/A |
| `demux/vp9_alpha` | N/A | — | Pass (22 ms) | N/A | Pass (29 ms) | — | — | Pass (153 ms) |
| `streaming-output/mp4_ttfb_buffer_target` | N/A | Pass (351 ms) | Pass (437 ms) | Pass (163 ms) | N/A | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | N/A | — | — | — | Pass (346 ms) | — | Pass (459 ms) | N/A |
| `probe/perf-extract-metadata-massive` | N/A | Pass (1.97 s) | Pass (328 ms) | Pass (2.41 s) | Pass (3.47 s) | — | Pass (367 ms) | Pass (318 ms) |
| `mux/mp3_to_mp4_audio` | N/A | Pass (144 ms) | Pass (20 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp3` | N/A | Pass (212 ms) | Pass (22 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_streaming_target` | N/A | Pass (388 ms) | Pass (128 ms) | Pass (227 ms) | N/A | N/A | — | N/A |
| `mux/h264_aac_to_ts` | N/A | Pass (409 ms) | Pass (228 ms) | N/A | N/A | N/A | N/A | — |
| `transcode/h264_colorspace_709_to_2020` | N/A | Pass (89.18 s) | — | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | Pass (548 ms) | Pass (1.21 s) | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_vp8_webm` | N/A | — | N/A | N/A | N/A | — | N/A | — |
| `mux/size_micro_1frame_to_mkv` | N/A | Pass (159 ms) | Pass (21 ms) | — | N/A | N/A | — | N/A |
| `transcode/wav_to_flac` | — | Pass (230 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/large_vp9_1080p_120s` | N/A | Pass (309 ms) | — | N/A | Pass (175 ms) | Pass (180 ms) | Pass (270 ms) | Pass (120 ms) |
| `probe/hls_aes128` | N/A | Pass (231 ms) | Pass (88 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mov` | N/A | Pass (409 ms) | Pass (907 ms) | N/A | — | — | N/A | N/A |
| `mux/size_longform_audio_to_mp4` | N/A | Pass (5.58 s) | Pass (5.47 s) | Pass (3.48 s) | N/A | N/A | — | N/A |
| `decode-seek/decode_size_huge_h264_600s` | N/A | N/A | Pass (1.22 s) | N/A | Pass (1.78 s) | N/A | SKIPPED | Pass (1.16 s) |
| `audio-dsp/resample_48k_to_16k` | N/A | Pass (175 ms) | Pass (68 ms) | N/A | N/A | N/A | Pass (48 ms) | — |
| `remux/opus_ogg_to_mkv` | N/A | Pass (148 ms) | Pass (26 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/perf_cenc_ctr_decrypt_throughput` | N/A | Pass (408 ms) | N/A | N/A | N/A | — | N/A | N/A |
| `mux/pcm_s16_to_wav` | N/A | Pass (256 ms) | Pass (20 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_opus` | N/A | Pass (200 ms) | Pass (2.44 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large` | N/A | Pass (384 ms) | Pass (31 ms) | Pass (182 ms) | — | Pass (40 ms) | — | — |
| `decode-seek/decode_mkv_h264` | N/A | Pass (1.05 s) | Pass (625 ms) | — | Pass (678 ms) | N/A | Pass (568 ms) | Pass (760 ms) |
| `demux/vp8_720p_10s` | N/A | Pass (181 ms) | Pass (41 ms) | N/A | Pass (48 ms) | Pass (238 ms) | Pass (205 ms) | Pass (182 ms) |
| `trim/audio_aac_adts_copy` | — | — | Pass (63 ms) | N/A | N/A | N/A | — | N/A |
| `mux/size_large_1080p_to_mp4` | N/A | Pass (901 ms) | Pass (373 ms) | Pass (589 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_f32_to_s16` | N/A | Pass (148 ms) | Pass (23.15 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/size_tiny_360p_to_mp4` | N/A | Pass (225 ms) | Pass (24 ms) | Pass (60 ms) | N/A | N/A | N/A | N/A |
| `decode-seek/decode_extreme_fps_240` | N/A | Pass (487 ms) | Pass (485 ms) | N/A | Pass (154 ms) | N/A | Pass (335 ms) | Pass (219 ms) |
| `transcode/h264_crf_quality_mode` | — | Pass (63.84 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt` | N/A | Pass (1.04 s) | N/A | N/A | N/A | N/A | — | N/A |
| `audio-dsp/pcm_s16_to_f32` | N/A | Pass (214 ms) | Pass (51 ms) | N/A | N/A | N/A | — | — |
| `transcode/h264_to_mov` | N/A | Pass (70.19 s) | Pass (4.67 s) | — | N/A | — | N/A | N/A |
| `metadata/read_vp9_1080p_10s` | N/A | Pass (188 ms) | Pass (124 ms) | N/A | Pass (69 ms) | Pass (36 ms) | Pass (41 ms) | Pass (103 ms) |
| `probe/huge_h264_1080p_600s` | N/A | Pass (739 ms) | Pass (58 ms) | Pass (573 ms) | Pass (753 ms) | Pass (52 ms) | Pass (65 ms) | Pass (139 ms) |
| `mux/edge_hevc_decode_mux_mp4` | N/A | Pass (555 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/aiff_container_probe` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_aac_mp4` | N/A | Pass (886 ms) | Pass (610 ms) | N/A | N/A | N/A | Pass (783 ms) | N/A |
| `demux/flac_noseektable` | N/A | Pass (140 ms) | — | N/A | N/A | Pass (37 ms) | Pass (44 ms) | N/A |
| `probe/realworld_mdn_trex_mp3` | N/A | Pass (142 ms) | Pass (4 ms) | — | N/A | Pass (28 ms) | Pass (38 ms) | N/A |
| `transcode/h264_to_fragmented_mp4` | N/A | Pass (72.05 s) | Pass (5.12 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_multitrack` | N/A | Pass (183 ms) | Pass (2.18 ms) | Pass (31 ms) | Pass (20.13 ms) | Pass (20 ms) | Pass (30 ms) | Pass (113 ms) |
| `performance/size-ladder-iterate-packets-large4k` | N/A | Pass (72.91 ms) | — | Pass (71 ms) | Pass (101 ms) | Pass (1.23 s) | Pass (620 ms) | Pass (1.68 s) |
| `remux/prop_bframes_decode_remux_mp4_mkv` | N/A | Pass (490 ms) | Pass (540 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_buffer_shape` | N/A | Pass (122 ms) | Pass (910 ms) | Pass (159 ms) | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt_eq_cleartext` | N/A | Pass (978 ms) | Pass (896 ms) | N/A | N/A | N/A | — | N/A |
| `trim/h264_keyframe_aligned_short` | N/A | — | Pass (2.12 s) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_reserve_duration_invariant` | N/A | Pass (316 ms) | Pass (95 ms) | N/A | — | N/A | N/A | N/A |
| `decode-seek/seek_vfr_arbitrary` | N/A | Pass (423 ms) | Pass (79 ms) | N/A | — | — | — | Pass (207 ms) |
| `transcode/aac_to_mp3_mp4` | N/A | Pass (805 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_bframes_midgop` | N/A | Pass (820 ms) | Pass (198 ms) | — | Pass (154 ms) | N/A | Pass (2.3 s) | Pass (299 ms) |
| `remux/vp9_1080p_10s_webm_to_webm` | N/A | Pass (265 ms) | Pass (75 ms) | — | N/A | N/A | Pass (283 ms) | N/A |
| `demux/h264_4k_10s` | — | — | Pass (71 ms) | Pass (80 ms) | Pass (79 ms) | Pass (2.61 s) | Pass (1.76 s) | Pass (1.47 s) |
| `probe/hls_vod` | N/A | — | — | N/A | N/A | Pass (405 ms) | Pass (321 ms) | N/A |
| `metadata/read_pcm_s16be` | N/A | Pass (168 ms) | N/A | N/A | N/A | N/A | — | N/A |
| `audio-dsp/caf_container_probe` | N/A | Pass (174 ms) | — | N/A | N/A | N/A | N/A | N/A |
| `probe/pcm_s16be` | N/A | Pass (190 ms) | N/A | N/A | N/A | — | N/A | — |
| `demux/h264_bframes_1080p` | N/A | Pass (230 ms) | N/A | Pass (76 ms) | Pass (65 ms) | Pass (1.65 s) | Pass (1.12 s) | N/A |
| `mux/vp9_opus_to_webm` | N/A | Pass (336 ms) | Pass (67 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_to_av1_webm` | N/A | N/A | Pass (2.27 s) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large4k` | N/A | — | Pass (41 ms) | — | Pass (80 ms) | Pass (31 ms) | Pass (7.01 ms) | Pass (121 ms) |
| `transcode/extreme_fps_1` | N/A | Pass (9.58 s) | Pass (1.34 s) | — | N/A | N/A | N/A | N/A |
| `performance/iterate-video-packets` | N/A | Pass (295 ms) | Pass (58 ms) | Pass (109 ms) | Pass (161 ms) | Pass (55 ms) | — | Pass (26 ms) |
| `trim/h264_vfr_frame_accurate` | — | Pass (3.56 s) | Pass (1.06 s) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_open_gop_first_frame` | N/A | Pass (906 ms) | Pass (358 ms) | N/A | Pass (360 ms) | — | Pass (433 ms) | Pass (415 ms) |
| `remux/prop_adts_to_mp4_duration_invariant` | N/A | — | — | — | N/A | N/A | Pass (192 ms) | N/A |
| `transcode/av1_to_vp9_webm` | N/A | N/A | Pass (1.28 s) | N/A | N/A | — | Pass (1.47 s) | N/A |
| `transcode/h264_to_mkv` | N/A | — | Pass (2.56 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/massive_vp9_1080p_2h` | N/A | Pass (1.85 s) | Pass (462 ms) | N/A | — | Pass (393 ms) | Pass (263 ms) | Pass (424 ms) |
| `metadata/read_mp3_xing` | — | Pass (135 ms) | — | N/A | — | Pass (23 ms) | Pass (5 ms) | N/A |
| `demux/vp9_1080p_10s` | N/A | Pass (221 ms) | Pass (50 ms) | N/A | Pass (104 ms) | Pass (102 ms) | Pass (81 ms) | Pass (795 ms) |
| `trim/h264_noop_full_range_idempotent` | — | — | Pass (18.6 s) | N/A | — | — | N/A | N/A |
| `mux/edge_bframes_decode_mux_mp4` | N/A | Pass (519 ms) | Pass (340 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | N/A | N/A | Pass (4.3 s) | N/A | N/A | — | Pass (6.1 s) | N/A |
| `probe/vp9_alpha` | N/A | — | Pass (38 ms) | N/A | Pass (45 ms) | Pass (40 ms) | Pass (37 ms) | — |
| `streaming-output/stream_large_h264_mp4` | N/A | Pass (592 ms) | — | Pass (333 ms) | — | N/A | N/A | N/A |
| `transcode/roundtrip_leg1_h264_to_vp9` | N/A | N/A | Pass (5.21 s) | N/A | N/A | N/A | Pass (8.59 s) | N/A |
| `trim/h264_subframe_range_frame_accurate` | — | Pass (1.58 s) | Pass (239 ms) | N/A | N/A | — | N/A | N/A |
| `demux/av1_720p_5s` | N/A | N/A | Pass (71 ms) | — | Pass (25 ms) | Pass (78 ms) | — | Pass (234 ms) |
| `streaming-output/prop_probe_dur_stream_shape` | N/A | Pass (378 ms) | Pass (791 ms) | Pass (159 ms) | N/A | N/A | N/A | N/A |
| `transcode/vp8_to_h264_mp4` | — | Pass (12.82 s) | N/A | N/A | N/A | — | — | N/A |
| `mux/vp9_video_plus_opus_audio_to_webm` | N/A | Pass (360 ms) | Pass (103 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_large_h264_120s` | N/A | Pass (1.9 s) | Pass (1.22 s) | N/A | — | — | Pass (24.08 s) | — |
| `transcode/gapless_pcm_to_aac_priming` | N/A | Pass (938 ms) | Pass (658 ms) | N/A | — | — | — | N/A |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | N/A | Pass (475 ms) | Pass (289 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_no_media_tracks_probe` | N/A | Pass (116 ms) | — | N/A | Pass (16 ms) | Pass (15 ms) | Pass (14 ms) | N/A |
| `trim/robust_start_past_eof` | — | Pass (191 ms) | Pass (100 ms) | — | N/A | — | — | N/A |
| `robustness/prop_trim_additivity_compose` | — | — | N/A | N/A | — | N/A | N/A | — |
| `robustness/edge_pcm_s16be_probe` | N/A | Pass (117 ms) | N/A | N/A | N/A | — | N/A | — |
| `encryption/cenc_ctr_truncated_mdat_graceful` | N/A | Pass (115 ms) | — | N/A | N/A | — | N/A | — |
| `robustness/fuzz_mp3_header_truncated_probe` | N/A | Pass (132 ms) | Pass (12 ms) | N/A | — | — | Pass (11 ms) | N/A |
| `trim/robust_bitflipped_source` | N/A | — | Pass (149 ms) | N/A | — | N/A | — | — |
| `robustness/edge_audio_only_probe` | N/A | — | Pass (5 ms) | Pass (13 ms) | Pass (22 ms) | Pass (25 ms) | — | Pass (41 ms) |
| `robustness/prop_remux_duration_preserved` | N/A | — | — | — | N/A | N/A | N/A | N/A |
| `robustness/edge_seek_past_eof` | N/A | Pass (629 ms) | — | N/A | — | N/A | Pass (11.53 s) | Pass (187 ms) |
| `probe/truncated-header-graceful` | — | — | Pass (14 ms) | Pass (4 ms) | Pass (14 ms) | Pass (12 ms) | — | — |
| `robustness/edge_audio_only_micro_probe` | — | Pass (121 ms) | Pass (5 ms) | Pass (12 ms) | Pass (16 ms) | Pass (10 ms) | Pass (5 ms) | — |
| `robustness/prop_duration_consistent_across_containers` | N/A | Pass (254 ms) | — | N/A | Pass (106 ms) | Pass (37 ms) | Pass (41 ms) | Pass (163 ms) |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | Pass (112 ms) | Pass (26 ms) | N/A | N/A | N/A | — | N/A |
| `robustness/fuzz_webm_header_truncated_demux` | — | Pass (204 ms) | — | N/A | N/A | — | — | — |
| `demux/graceful_zero_length` | N/A | — | — | Pass (3 ms) | N/A | Pass (5 ms) | — | — |
| `robustness/fuzz_ts_zeroed_spans_demux` | N/A | Pass (189 ms) | Pass (19 ms) | N/A | N/A | Pass (68 ms) | Pass (61 ms) | N/A |
| `demux/graceful_webm_header_destroyed` | N/A | Pass (199 ms) | — | N/A | N/A | — | Pass (6 ms) | Pass (138 ms) |
| `robustness/fuzz_mux_target_corrupt_remux` | — | Pass (254 ms) | Pass (52 ms) | Pass (98 ms) | N/A | N/A | Pass (2.05 s) | N/A |
| `robustness/edge_faststart_reserve_remux` | — | Pass (983 ms) | — | — | — | N/A | — | — |
| `robustness/edge_dims_1x1_probe` | N/A | Pass (123 ms) | — | N/A | — | Pass (15 ms) | Pass (16 ms) | — |
| `robustness/fuzz_truncated_h264_asset_demux` | N/A | Pass (123 ms) | — | Pass (4 ms) | N/A | Pass (14 ms) | Pass (13 ms) | — |
| `trim/robust_end_far_past_eof` | N/A | Pass (189 ms) | Pass (118 ms) | N/A | N/A | — | — | — |
| `robustness/edge_flac_without_seektable_probe` | N/A | Pass (119 ms) | — | — | — | — | Pass (17 ms) | — |
| `demux/graceful_truncated_h264` | N/A | — | Pass (4 ms) | — | N/A | Pass (13 ms) | — | Pass (27 ms) |
| `remux/neg_headerless_webm_to_mkv` | N/A | — | Pass (13 ms) | — | N/A | — | N/A | — |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | N/A | Pass (118 ms) | Pass (6 ms) | — | — | N/A | N/A | N/A |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | Pass (52 ms) | Pass (67 ms) | Pass (13 ms) | Pass (30 ms) | Pass (91 ms) |
| `robustness/fuzz_mp4_bitflip_probe` | — | Pass (174 ms) | Pass (14 ms) | — | Pass (75 ms) | Pass (14 ms) | Pass (15 ms) | — |
| `robustness/image_png_probe_na` | — | — | Pass (5 ms) | Pass (4 ms) | Pass (10 ms) | Pass (14 ms) | Pass (14 ms) | Pass (34 ms) |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | N/A | — | Pass (13 ms) | — | — | — | N/A | N/A |
| `encryption/cenc_cens_decrypt_na` | N/A | Pass (108 ms) | — | N/A | N/A | — | N/A | N/A |
| `transcode/mismatch_mislabeled_container_transcode` | N/A | Pass (11.62 s) | Pass (737 ms) | N/A | N/A | N/A | Pass (808 ms) | — |
| `robustness/edge_headerless_recorder_probe` | — | — | Pass (15 ms) | — | — | Pass (19 ms) | — | — |
| `robustness/edge_multitrack_demux` | N/A | — | Pass (19 ms) | — | — | Pass (167 ms) | — | — |
| `robustness/fuzz_mp4_tail_truncated_demux` | N/A | Pass (207 ms) | — | Pass (55 ms) | N/A | Pass (929 ms) | — | Pass (1.1 s) |
| `robustness/edge_video_only_micro_probe` | N/A | — | Pass (11 ms) | — | Pass (15 ms) | Pass (14 ms) | Pass (15 ms) | — |
| `transcode/negative_png_to_video` | N/A | Pass (114 ms) | Pass (6 ms) | N/A | Pass (21 ms) | N/A | — | — |
| `robustness/fuzz_mp4_zeroed_spans_decode` | N/A | Pass (1.76 s) | Pass (121 ms) | — | Pass (131 ms) | N/A | — | Pass (85 ms) |
| `transcode/malformed_truncated_h264_transcode` | N/A | Pass (117 ms) | — | N/A | N/A | N/A | Pass (1.07 s) | N/A |
| `robustness/edge_dims_1x1_decode` | — | — | — | — | — | N/A | — | Pass (68 ms) |
| `audio-dsp/edge_empty_audio_transcode` | N/A | Pass (125 ms) | Pass (20 ms) | — | — | — | — | N/A |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | Pass (22 ms) | — | Pass (18 ms) | — | — | N/A |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | N/A | Pass (203 ms) | Pass (15 ms) | N/A | — | — | N/A | N/A |
| `encryption/hls_sample_aes_decrypt_na` | — | Pass (129 ms) | Pass (4 ms) | N/A | N/A | — | N/A | N/A |
| `audio-dsp/negative_image_into_audio_transcode` | — | Pass (111 ms) | Pass (11 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | N/A | — | N/A | — | N/A |
| `robustness/edge_ts_pts_wraparound_demux` | N/A | Pass (138 ms) | Pass (19 ms) | N/A | — | Pass (47 ms) | Pass (48 ms) | SKIPPED |
| `robustness/prop_gapless_sample_count_priming` | N/A | N/A | Pass (189 ms) | N/A | — | — | N/A | — |
| `robustness/edge_open_gop_bframes_decode` | N/A | N/A | Pass (1.71 s) | N/A | — | N/A | — | Pass (1.75 s) |
| `robustness/fuzz_adts_aac_bitflip_probe` | N/A | — | — | — | N/A | — | Pass (16 ms) | N/A |
| `robustness/edge_5_1_channels_probe` | N/A | — | Pass (13 ms) | N/A | — | Pass (5 ms) | Pass (16 ms) | N/A |
| `robustness/edge_zero_length_probe` | N/A | — | Pass (4 ms) | Pass (16 ms) | — | Pass (12 ms) | Pass (11 ms) | — |
| `transcode/negative_webp_to_video` | N/A | — | — | N/A | Pass (13 ms) | — | Pass (13 ms) | — |
| `robustness/edge_flac_with_seektable_probe` | N/A | Pass (117 ms) | Pass (14 ms) | — | N/A | Pass (11 ms) | — | N/A |
| `mux/neg_h264_into_ogg_illegal` | N/A | Pass (262 ms) | Pass (49 ms) | — | N/A | N/A | N/A | — |
| `robustness/edge_rotated_remux` | N/A | Pass (715 ms) | Pass (679 ms) | N/A | — | — | N/A | N/A |
| `robustness/edge_cbcs_boundary_decrypt` | N/A | N/A | — | — | — | N/A | N/A | — |
| `metadata/neg_garbled_id3_mp3_probe` | — | — | — | N/A | N/A | — | Pass (12 ms) | N/A |
| `transcode/mismatch_audio_only_to_video_target` | — | Pass (137 ms) | Pass (15 ms) | N/A | — | N/A | Pass (6 ms) | N/A |
| `robustness/prop_demux_mux_roundtrip_eq` | — | N/A | — | Pass (188 ms) | — | N/A | N/A | N/A |
| `transcode/mismatch_video_only_to_audio_target` | — | Pass (136 ms) | Pass (11 ms) | N/A | N/A | N/A | Pass (13 ms) | N/A |
| `robustness/prop_double_remux_stable` | N/A | N/A | Pass (406 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/clearkey_decrypt_na` | — | Pass (105 ms) | Pass (3 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | N/A | Pass (611 ms) | — | N/A | — | — | — | — |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | N/A | — | N/A | N/A |
| `encryption/cenc_ctr_protection_zeroed_graceful` | N/A | Pass (123 ms) | Pass (22 ms) | — | N/A | N/A | — | N/A |
| `remux/neg_zeroed_mp4_to_mkv` | — | Pass (212 ms) | Pass (12 ms) | — | N/A | N/A | — | N/A |
| `robustness/prop_trim_concatenation` | — | Pass (56.85 s) | N/A | — | N/A | N/A | — | — |
| `robustness/prop_flac_seek_seektable_equiv` | N/A | — | N/A | N/A | — | N/A | N/A | — |
| `trim/robust_negative_start` | N/A | Pass (132 ms) | — | N/A | N/A | — | — | N/A |
| `robustness/edge_mislabeled_container_probe` | N/A | Pass (132 ms) | Pass (10 ms) | N/A | — | Pass (15 ms) | Pass (17 ms) | — |
| `robustness/image_jpeg_probe_na` | — | Pass (108 ms) | — | — | Pass (13 ms) | — | — | Pass (33 ms) |
| `robustness/fuzz_mp4_header_truncated_demux` | N/A | Pass (174 ms) | — | Pass (57 ms) | — | Pass (18 ms) | Pass (4 ms) | — |
| `demux/graceful_mp4_header_destroyed` | N/A | Pass (172 ms) | — | Pass (55 ms) | — | Pass (17 ms) | — | Pass (28 ms) |
| `mux/neg_h264_into_wav_illegal` | — | — | — | N/A | N/A | — | N/A | — |
| `robustness/edge_vfr_probe` | — | — | Pass (5 ms) | — | Pass (22 ms) | Pass (13 ms) | Pass (9 ms) | Pass (67 ms) |
| `trim/robust_zero_length_range` | N/A | Pass (122 ms) | — | — | — | — | — | — |
| `transcode/extreme_resize_1x1` | — | Pass (113 ms) | Pass (19 ms) | N/A | — | N/A | Pass (21 ms) | N/A |
| `robustness/edge_extreme_fps_240_probe` | N/A | — | Pass (4 ms) | Pass (4 ms) | — | — | Pass (14 ms) | Pass (45 ms) |
| `robustness/edge_headerless_recorder_remux` | N/A | — | Pass (563 ms) | N/A | — | N/A | — | — |
| `transcode/negative_jpeg_to_video` | N/A | Pass (108 ms) | — | — | Pass (17 ms) | N/A | Pass (12 ms) | — |
| `trim/robust_inverted_range` | — | Pass (114 ms) | — | N/A | N/A | N/A | — | N/A |
| `robustness/edge_gapless_priming_probe` | — | — | Pass (12 ms) | Pass (14 ms) | Pass (14 ms) | Pass (4 ms) | — | — |
| `transcode/malformed_zero_length_transcode` | N/A | Pass (118 ms) | — | — | Pass (13 ms) | N/A | — | — |
| `trim/robust_truncated_source` | — | Pass (104 ms) | — | — | N/A | N/A | — | — |
| `robustness/fuzz_remux_zeroed_spans` | — | Pass (285 ms) | Pass (274 ms) | — | N/A | — | N/A | — |
| `remux/neg_truncated_mp4_to_mkv` | N/A | — | Pass (171 ms) | — | — | N/A | — | — |
| `robustness/image_webp_probe_na` | N/A | Pass (117 ms) | Pass (11 ms) | Pass (5 ms) | — | — | Pass (11 ms) | — |
| `robustness/fuzz_flac_bitflip_probe` | — | Pass (116 ms) | — | N/A | N/A | Pass (11 ms) | Pass (4 ms) | N/A |
| `robustness/edge_video_only_probe` | N/A | Pass (144 ms) | Pass (13 ms) | Pass (17 ms) | Pass (21 ms) | Pass (13 ms) | Pass (14 ms) | Pass (58 ms) |
| `robustness/fuzz_webm_bitflip_probe` | — | Pass (160 ms) | — | N/A | Pass (40 ms) | Pass (21 ms) | — | — |
| `robustness/edge_longform_probe` | — | — | Pass (85 ms) | Pass (140 ms) | — | — | Pass (91 ms) | — |
| `robustness/edge_dims_2x2_h264_probe` | N/A | — | — | Pass (7 ms) | — | — | — | Pass (45 ms) |
| `robustness/edge_fragmented_remux` | N/A | Pass (883 ms) | — | Pass (674 ms) | N/A | — | N/A | — |
| `robustness/edge_pcm_s24_decode` | — | — | Pass (31 ms) | — | N/A | — | N/A | — |
| `transcode/extreme_resize_0x0` | — | Pass (121 ms) | Pass (13 ms) | N/A | N/A | N/A | — | N/A |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | N/A | — | — | — | N/A | — | N/A | — |
| `robustness/edge_extreme_fps_1_probe` | N/A | — | Pass (12 ms) | Pass (15 ms) | Pass (20 ms) | — | Pass (13 ms) | Pass (45 ms) |
| `audio-dsp/fuzz_wav_header_truncated_probe` | N/A | — | — | N/A | — | Pass (4 ms) | Pass (13 ms) | N/A |
| `robustness/prop_transcode_idempotent_dims_h264` | N/A | — | — | N/A | N/A | — | — | — |
| `robustness/edge_seek_negative` | N/A | Pass (233 ms) | — | N/A | — | N/A | — | — |

<details><summary>Cell details</summary>

- `aibrush-media@dev` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/seek_backward_then_forward` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/decode_vfr_timing` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `performance/bundle-size` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/convert-longtasks` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/h264_rotated90` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/hls_aes128` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/ladder_large_h264_1080p_120s_resize_720p` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/mp3_cbr_notoc` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/multitrack_select_default_audio` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/selfcheck_h264_resize_720p_tie` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/flac_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `probe/flac_noseektable` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/decode_vp8` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/realworld_mdn_trex_mp3` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/h264_4k_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/hevc_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-medium` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/wav_s16` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/h264_vfr_to_cfr_30` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/ladder_tiny_h264_360p_resize_180p` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/h264_rotate_180` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `metadata/write_mp4_tags` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/h264_flip_vertical` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `probe/vp8_720p_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `demux/h264_in_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/wav_s16` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `metadata/tracks_packet_attribution_multitrack` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/recorder_headerless` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `decode-seek/meta_vfr_seek_lands_on_true_pts` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `probe/flac_seektable` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `probe/large_h264_1080p_120s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/size_micro_micro_h264_1frame` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `probe/realworld_mdn_flower_webm` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/h264_resize_720p` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/meta_seek_vs_linear_decode` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/vp9_alpha_to_vp9_keepalpha` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/mp3_xing` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/vp9_1080p_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/roundtrip_leg2_vp9_to_h264` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/meta_decode_remux_eq_decode_anchored` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `decode-seek/seek_negative` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/decode_vp9` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `demux/hls_vod` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/av1_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `probe/h264_bframes_1080p` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/read_h264_1080p_5s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `demux/size_tiny_tiny_vp9_360p_2s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/gapless_pcm_to_opus_priming` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `probe/h264_in_mkv` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/h264_rotate_90_dimswap` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/size-ladder-demux-peak-memory-huge` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/massive_h264_1080p_2h` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/size-ladder-demux-peak-memory-large` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/h264_rotate_normalize` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/buffer_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `metadata/read_no_tags_wav` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/h264_to_hevc_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/hevc_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/metamorphic_resize_same_1080p_idempotent` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/wav_to_mp3_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/h264_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/decode_tiny_dims_2x2_h264` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `transcode/h264_two_pass_bitrate` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/decode_hevc` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `probe/huge_vp9_1080p_240s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/op-sweep-probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `decode-seek/seek_mkv_h264_keyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/vp8_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `demux/hevc_1080p_10s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `probe/wav_f32` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/av_downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/aac_adts_adts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/read_h264_1080p_30s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `decode-seek/decode_mov_h264` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `metadata/write_mp3_id3` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `demux/realworld_mdn_flower_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/h264_1080p_5s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/h264_fps_30_to_15` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/size_massive_massive_h264_1080p_2h` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `decode-seek/seek_h264_keyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/mp3_xing` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_probe_dur_fragmented_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `probe/micro_h264_1frame` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/perf-extract-metadata-large` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-large` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `metadata/write_mkv_tags` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/seek_av1_keyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/tiny_h264_360p_2s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `performance/op-sweep-demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/seek-ms` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/bframe_reorder_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/vp9_alpha_to_vp8_keepalpha` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/size_micro_micro_audio_short` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `demux/h264_vfr` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/h264_1080p_5s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/hevc_1080p_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `decode-seek/decode_multitrack_select_video` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `transcode/opus_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/h264_rotated90` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/mp3_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/decode_h264_first_frames` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `performance/metamorphic-vfr-iterate-packets` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/h264_vfr` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/fanout_h264_abr_ladder` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `decode-seek/decode_tiny_dims_1x1` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `demux/size_huge_huge_h264_1080p_600s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/flac_seektable` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `decode-seek/decode_bframes_reorder` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `demux/size_tiny_tiny_h264_360p_2s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/h264_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/decode_size_tiny_h264_360p` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/h264_to_ts` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/mp3_cbr_notoc` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `decode-seek/seek_vp8_keyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-massive` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/opus` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `decode-seek/seek_hevc_keyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `transcode/aac_to_pcm_wav_extract` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `decode-seek/decode_av1` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-huge` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `transcode/hdr10_to_sdr_tonemap` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/cenc_cbcs` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `decode-seek/decode_size_tiny_vp9_360p` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `decode-seek/seek_repeated_same_target` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/mp3_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/metamorphic-recorder-headerless-sane-duration` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `probe/big_buck_bunny_1080p_h264` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `transcode/wav_to_vorbis_ogg` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/seek_zero` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-tiny` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `decode-seek/decode_h264_10bit` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `demux/realworld_mdn_flower_webm` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `performance/op-sweep-transcode-webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/h264_rotate_270_dimswap` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `performance/size-ladder-demux-peak-memory-large4k` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/decode_size_large_vp9_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `decode-seek/seek_h264_nonkeyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `transcode/hevc_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/longform_1h_audio` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/h264_pad_letterbox_4x3_to_16x9` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/size_large_large_h264_1080p_120s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `probe/tiny_vp9_360p_2s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/extreme_fps_240` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/decode_h264_4k` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `demux/h264_ts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/realworld_mdn_flower_mp4` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-tiny` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/av1_720p_5s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `demux/wav_s24` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/decode_extreme_fps_1` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `metadata/read_no_tags_recorder_webm` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `demux/empty_audio_zero_packets` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/vp9_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/aac_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/meta_pts_monotonic_after_reorder` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/seek_vp9_keyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `metadata/read_flac_seektable` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/metamorphic-duration-across-containers` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/micro_audio_short` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/vp9_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/decode_vp9_alpha` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/wav_to_opus_ogg` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/wav_f32` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/bframe_reorder_h264_to_h264` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/aac_adts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/edge_longform_audio_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `decode-seek/decode_size_micro_h264_1frame` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `metadata/read_h264_in_mkv` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/extract-metadata` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_h264_multitrack` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-massive` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/h264_to_av1_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/pcm_s16be` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/h264_1080p_30s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/cenc_ctr` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_ts` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `remux/h264_in_mkv_mkv_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/flac_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `demux/h264_multitrack` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/h264_fps_30_to_60` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `demux/h264_1080p_30s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/vp9_alpha` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/decode_rotated_display_matrix` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `probe/perf-extract-metadata-massive` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/hevc_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/large_vp9_1080p_120s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/hls_aes128` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `decode-seek/decode_size_huge_h264_600s` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `metadata/read_opus` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-large` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `decode-seek/decode_mkv_h264` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `demux/vp8_720p_10s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `decode-seek/decode_extreme_fps_240` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/h264_to_mov` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `metadata/read_vp9_1080p_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/huge_h264_1080p_600s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/wav_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/flac_noseektable` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/realworld_mdn_trex_mp3` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/h264_to_fragmented_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/h264_multitrack` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-large4k` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/seek_vfr_arbitrary` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `transcode/aac_to_mp3_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/seek_bframes_midgop` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `probe/hls_vod` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/pcm_s16be` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `demux/h264_bframes_1080p` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/vp9_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-large4k` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/extreme_fps_1` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/iterate-video-packets` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `decode-seek/decode_open_gop_first_frame` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/av1_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/h264_to_mkv` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/massive_vp9_1080p_2h` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `demux/vp9_1080p_10s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/metamorphic_duration_preserved_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/vp9_alpha` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/av1_720p_5s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `decode-seek/decode_size_large_h264_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `transcode/gapless_pcm_to_aac_priming` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/edge_no_media_tracks_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `encryption/cenc_ctr_truncated_mdat_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `robustness/fuzz_mp3_header_truncated_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `trim/robust_bitflipped_source` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/edge_audio_only_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/edge_seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `robustness/prop_duration_consistent_across_containers` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `demux/graceful_zero_length` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `robustness/fuzz_ts_zeroed_spans_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/graceful_webm_header_destroyed` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `robustness/edge_dims_1x1_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/fuzz_truncated_h264_asset_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/robust_end_far_past_eof` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/edge_flac_without_seektable_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `demux/graceful_truncated_h264` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/neg_headerless_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/fuzz_wav_fmt_corrupt_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/neg_zero_tracks_empty_audio_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `transcode/mismatch_mislabeled_container_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/edge_multitrack_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `robustness/fuzz_mp4_tail_truncated_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `robustness/edge_video_only_micro_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/negative_png_to_video` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/fuzz_mp4_zeroed_spans_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `transcode/malformed_truncated_h264_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/fuzz_encrypted_mp4_ciphertext_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `robustness/edge_ts_pts_wraparound_demux` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/prop_gapless_sample_count_priming` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/edge_open_gop_bframes_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `robustness/fuzz_adts_aac_bitflip_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_5_1_channels_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_zero_length_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/negative_webp_to_video` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/edge_flac_with_seektable_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/neg_h264_into_ogg_illegal` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `robustness/edge_rotated_remux` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/edge_cbcs_boundary_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/prop_decode_remux_eq_decode_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `encryption/cenc_ctr_protection_zeroed_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `trim/robust_negative_start` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/edge_mislabeled_container_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/fuzz_mp4_header_truncated_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/graceful_mp4_header_destroyed` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/robust_zero_length_range` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/edge_extreme_fps_240_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_headerless_recorder_remux` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/negative_jpeg_to_video` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/malformed_zero_length_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/neg_truncated_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/image_webp_probe_na` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_video_only_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_dims_2x2_h264_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_fragmented_remux` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/fuzz_aiff_header_truncated_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_extreme_fps_1_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `audio-dsp/fuzz_wav_header_truncated_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/prop_transcode_idempotent_dims_h264` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/edge_seek_negative` — **N/A**: engine does not declare operation 'seek'
- `ffmpeg.wasm@0.12.15` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `performance/convert-longtasks` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `transcode/hevc_to_av1_webm` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare encryption scheme 'cenc-cbcs'
- `ffmpeg.wasm@0.12.15` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/vp9_alpha_to_vp9_keepalpha` — **N/A**: engine does not declare feature 'alpha'
- `ffmpeg.wasm@0.12.15` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/av1_to_h264_mp4` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare feature 'headerless'
- `ffmpeg.wasm@0.12.15` · `transcode/gapless_pcm_to_opus_priming` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `transcode/h264_to_hevc_mp4` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: H.264 to HEVC/MP4 re-encode exceeds the browser-wasm suite budget
- `ffmpeg.wasm@0.12.15` · `transcode/hevc_to_vp9_webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare feature 'depth:10bit-output'
- `ffmpeg.wasm@0.12.15` · `transcode/vp8_to_vp9_webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `performance/convert-webm-resize-320x180` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `performance/encode-fps` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `performance/decode-fps` — **N/A**: engine does not declare feature 'decode:golden-rgba'
- `ffmpeg.wasm@0.12.15` · `decode-seek/seek_av1_keyframe` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `performance/convert-peak-memory` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/bframe_reorder_h264_to_vp9` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare feature 'rotation:decode'
- `ffmpeg.wasm@0.12.15` · `transcode/fanout_h264_abr_ladder` — **N/A**: engine does not declare feature 'fanout'
- `ffmpeg.wasm@0.12.15` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare feature 'alpha'
- `ffmpeg.wasm@0.12.15` · `transcode/h264_to_vp9_webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `transcode/h264_to_ts` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: H.264 transcode to TS exceeds the browser-wasm suite budget
- `ffmpeg.wasm@0.12.15` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare feature 'trim:frame-accurate-hevc'
- `ffmpeg.wasm@0.12.15` · `decode-seek/decode_av1` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/mp3_to_opus_webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `performance/op-sweep-transcode-webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare feature 'audio-samples:gapless-priming'
- `ffmpeg.wasm@0.12.15` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `transcode/extreme_fps_240` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: fps=240 is too large for this wasm encode path
- `ffmpeg.wasm@0.12.15` · `probe/av1_720p_5s` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: ffmpeg.wasm@0.12.15: remux not applicable: WebM cannot stream-copy track codecs [h264, aac]
- `ffmpeg.wasm@0.12.15` · `transcode/aac_to_opus_webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare feature 'headerless'
- `ffmpeg.wasm@0.12.15` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `decode-seek/decode_vp9_alpha` — **N/A**: engine does not declare feature 'alpha'
- `ffmpeg.wasm@0.12.15` · `transcode/wav_to_opus_ogg` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `transcode/h264_to_av1_mp4` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/flac_to_opus_webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `decode-seek/decode_size_huge_h264_600s` — **N/A**: ffmpeg.wasm@0.12.15: decodeFrames not applicable: huge 600s MOV decode requires a whole-file browser-wasm decode path that exceeds the suite budget
- `ffmpeg.wasm@0.12.15` · `transcode/vp9_to_av1_webm` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/av1_to_vp9_webm` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/metamorphic_duration_preserved_h264_to_vp9` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `demux/av1_720p_5s` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `robustness/prop_gapless_sample_count_priming` — **N/A**: engine does not declare feature 'audio-samples:gapless-priming'
- `ffmpeg.wasm@0.12.15` · `robustness/edge_open_gop_bframes_decode` — **N/A**: engine does not declare feature 'decode:golden-rgba'
- `ffmpeg.wasm@0.12.15` · `robustness/edge_cbcs_boundary_decrypt` — **N/A**: engine does not declare encryption scheme 'cenc-cbcs'
- `ffmpeg.wasm@0.12.15` · `robustness/prop_demux_mux_roundtrip_eq` — **N/A**: engine does not declare feature 'mux:roundtrip-compare'
- `ffmpeg.wasm@0.12.15` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare feature 'remux:compose'
- `mediabunny@1.48.0` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `transcode/flac_to_aac_mp4` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/h264_10bit_to_h264_8bit` — **N/A**: engine does not declare feature 'depth:10bit-to-8bit'
- `mediabunny@1.48.0` · `transcode/h264_flip_vertical` — **N/A**: engine does not declare feature 'flip'
- `mediabunny@1.48.0` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare feature 'trim:flac-seektable-copy'
- `mediabunny@1.48.0` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare feature 'depth:10bit-output'
- `mediabunny@1.48.0` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `transcode/wav_to_mp3_mp4` — **N/A**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/h264_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/h264_two_pass_bitrate` — **N/A**: engine does not declare feature 'two-pass'
- `mediabunny@1.48.0` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `demux/realworld_mdn_flower_mp4` — **N/A**: engine does not declare feature 'packets:dts'
- `mediabunny@1.48.0` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare feature 'flip'
- `mediabunny@1.48.0` · `demux/h264_vfr` — **N/A**: engine does not declare feature 'packets:dts'
- `mediabunny@1.48.0` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare feature 'rotation:decode'
- `mediabunny@1.48.0` · `performance/metamorphic-vfr-iterate-packets` — **N/A**: engine does not declare feature 'packets:dts'
- `mediabunny@1.48.0` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare feature 'trim:flac-no-seektable-frame-scan'
- `mediabunny@1.48.0` · `transcode/wav_to_vorbis_ogg` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare feature 'remux:flac-in-ogg'
- `mediabunny@1.48.0` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare output container 'aiff'
- `mediabunny@1.48.0` · `transcode/vp9_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `probe/cenc_ctr` — **SKIPPED**: mediabunny@1.48.0 WASM-aborts ("Assertion failed.") while parsing this CENC-CTR fixture (cenc_ctr.mp4); it probes cenc_cbcs.mp4 and every other corpus file fine, and ffmpeg.wasm reads/decrypts cenc_ctr.mp4 correctly, so the fixture is valid — this is a tracked engine limitation on the cenc-ctr container, not a suite/fixture defect.
- `mediabunny@1.48.0` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare feature 'encryption:cenc-ctr-clear-output'
- `mediabunny@1.48.0` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare output container 'aiff'
- `mediabunny@1.48.0` · `transcode/hevc_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/wav_to_flac` — **N/A**: browser cannot encode audio codec 'flac' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare feature 'encryption:cenc-ctr-clear-output'
- `mediabunny@1.48.0` · `transcode/h264_crf_quality_mode` — **N/A**: engine does not declare feature 'crf'
- `mediabunny@1.48.0` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare feature 'encryption:cenc-ctr-clear-output'
- `mediabunny@1.48.0` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `demux/h264_bframes_1080p` — **N/A**: engine does not declare feature 'packets:dts'
- `mediabunny@1.48.0` · `transcode/vp8_to_h264_mp4` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare feature 'trim:compose'
- `mediabunny@1.48.0` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `robustness/prop_trim_concatenation` — **N/A**: engine does not declare feature 'trim:compose'
- `mediabunny@1.48.0` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare feature 'flac:seektable-seek-equivalence'
- `mp4box@2.3.0` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare feature 'streaming:decode-equality'
- `mp4box@2.3.0` · `decode-seek/decode_vfr_timing` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `transcode/h264_resize_4k_to_1080p` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/convert-longtasks` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/ladder_large_h264_1080p_120s_resize_720p` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `transcode/multitrack_select_default_audio` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `transcode/selfcheck_h264_resize_720p_tie` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/flac_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `probe/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare output container 'adts'
- `mp4box@2.3.0` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/realworld_mdn_trex_mp3` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `transcode/h264_10bit_to_h264_8bit` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/hevc_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/ladder_tiny_h264_360p_resize_180p` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/h264_rotate_180` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `metadata/write_mp4_tags` — **N/A**: engine does not declare feature 'metadata:write'
- `mp4box@2.3.0` · `transcode/h264_flip_vertical` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/vp8_720p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `demux/h264_in_mkv` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `demux/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `probe/recorder_headerless` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `decode-seek/meta_vfr_seek_lands_on_true_pts` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `probe/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `mp4box@2.3.0` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/realworld_mdn_flower_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/h264_resize_720p` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/meta_seek_vs_linear_decode` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `transcode/vp9_alpha_to_vp9_keepalpha` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare feature 'mux:browser-decode-equality'
- `mp4box@2.3.0` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `probe/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `probe/vp9_1080p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `probe/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `transcode/roundtrip_leg2_vp9_to_h264` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `decode-seek/seek_negative` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `decode-seek/decode_vp9` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `demux/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `mp4box@2.3.0` · `transcode/av1_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `demux/size_tiny_tiny_vp9_360p_2s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/gapless_pcm_to_opus_priming` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `mux/opus_to_ogg` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `transcode/h264_rotate_90_dimswap` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/h264_fps_15_to_30` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `transcode/h264_rotate_normalize` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `mux/aac_to_adts` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `metadata/read_no_tags_wav` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `transcode/h264_to_hevc_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `transcode/hevc_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/metamorphic_resize_same_1080p_idempotent` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `transcode/wav_to_mp3_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `transcode/h264_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/decode_tiny_dims_2x2_h264` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/h264_two_pass_bitrate` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/decode_hevc` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `probe/huge_vp9_1080p_240s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `decode-seek/seek_mkv_h264_keyframe` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/vp8_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `probe/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `performance/decode-fps` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `remux/aac_adts_adts_to_mp4` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `decode-seek/decode_mov_h264` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `metadata/write_mp3_id3` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `transcode/h264_fps_30_to_15` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/seek_h264_keyframe` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `demux/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `decode-seek/seek_av1_keyframe` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `performance/seek-ms` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/bframe_reorder_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/vp9_alpha_to_vp8_keepalpha` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `decode-seek/decode_multitrack_select_video` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/opus_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/mp3_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `transcode/fanout_h264_abr_ladder` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `decode-seek/seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `mp4box@2.3.0` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `decode-seek/decode_tiny_dims_1x1` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `demux/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `decode-seek/decode_bframes_reorder` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/h264_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/decode_size_tiny_h264_360p` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/h264_to_ts` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `transcode/h264_crop_center` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/seek_vp8_keyframe` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare feature 'streaming:decode-equality'
- `mp4box@2.3.0` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `transcode/aac_to_pcm_wav_extract` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `transcode/hdr10_to_sdr_tonemap` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/decode_size_tiny_vp9_360p` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `decode-seek/seek_repeated_same_target` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `transcode/mp3_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/metamorphic-recorder-headerless-sane-duration` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `transcode/wav_to_vorbis_ogg` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `decode-seek/seek_zero` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `decode-seek/decode_h264_10bit` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `demux/realworld_mdn_flower_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `performance/op-sweep-transcode-webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `transcode/h264_rotate_270_dimswap` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `demux/size_large_large_vp9_1080p_120s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/decode_size_large_vp9_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `decode-seek/seek_h264_nonkeyframe` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `transcode/hevc_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/tiny_vp9_360p_2s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `decode-seek/decode_h264_4k` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `demux/h264_ts` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `probe/av1_720p_5s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `demux/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: engine does not declare output container 'webm'
- `mp4box@2.3.0` · `decode-seek/decode_extreme_fps_1` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `metadata/read_no_tags_recorder_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `demux/empty_audio_zero_packets` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `transcode/vp9_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `mp4box@2.3.0` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `mp4box@2.3.0` · `transcode/aac_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `decode-seek/meta_pts_monotonic_after_reorder` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `decode-seek/seek_vp9_keyframe` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `metadata/read_flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `probe/metamorphic-duration-across-containers` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `transcode/vp9_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/ladder_tiny_vp9_360p_to_h264_180p` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/wav_to_opus_ogg` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `probe/empty-audio-wav` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `transcode/bframe_reorder_h264_to_h264` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `audio-dsp/edge_longform_audio_probe` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `decode-seek/decode_size_micro_h264_1frame` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `metadata/read_h264_in_mkv` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare feature 'streaming:decode-equality'
- `mp4box@2.3.0` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `probe/h264_ts` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `remux/h264_in_mkv_mkv_to_mp4` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `transcode/flac_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `transcode/h264_fps_30_to_60` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/vp9_alpha` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `mux/mp3_to_mp3` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `transcode/hevc_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/wav_to_flac` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/large_vp9_1080p_120s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `mp4box@2.3.0` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `decode-seek/decode_size_huge_h264_600s` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `demux/vp8_720p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/decode_extreme_fps_240` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/h264_crf_quality_mode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `metadata/read_vp9_1080p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare feature 'mux:browser-decode-equality'
- `mp4box@2.3.0` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `transcode/wav_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `transcode/h264_to_fragmented_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `mp4box@2.3.0` · `decode-seek/seek_vfr_arbitrary` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `transcode/aac_to_mp3_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `mp4box@2.3.0` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `mp4box@2.3.0` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/vp9_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `decode-seek/decode_open_gop_first_frame` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/av1_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/h264_to_mkv` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/massive_vp9_1080p_2h` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `metadata/read_mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `demux/vp9_1080p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare feature 'mux:browser-decode-equality'
- `mp4box@2.3.0` · `transcode/metamorphic_duration_preserved_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/vp9_alpha` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `transcode/vp8_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `decode-seek/decode_size_large_h264_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/gapless_pcm_to_aac_priming` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `robustness/edge_no_media_tracks_probe` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `encryption/cenc_ctr_truncated_mdat_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `robustness/fuzz_mp3_header_truncated_probe` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `trim/robust_bitflipped_source` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/edge_seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `robustness/prop_duration_consistent_across_containers` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `encryption/cenc_ctr_senc_bitflip_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `robustness/fuzz_webm_header_truncated_demux` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `robustness/fuzz_ts_zeroed_spans_demux` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `demux/graceful_webm_header_destroyed` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `robustness/edge_dims_1x1_probe` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/robust_end_far_past_eof` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `transcode/mismatch_mislabeled_container_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/negative_png_to_video` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/malformed_truncated_h264_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/fuzz_encrypted_mp4_ciphertext_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/neg_vp9_into_adts_illegal` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `robustness/edge_ts_pts_wraparound_demux` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `robustness/prop_gapless_sample_count_priming` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/edge_open_gop_bframes_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `robustness/edge_5_1_channels_probe` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `transcode/negative_webp_to_video` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/edge_rotated_remux` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `metadata/neg_garbled_id3_mp3_probe` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `transcode/mismatch_audio_only_to_video_target` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/mismatch_video_only_to_audio_target` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare feature 'remux:compose'
- `mp4box@2.3.0` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `robustness/prop_decode_remux_eq_decode_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `trim/robust_negative_start` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/edge_mislabeled_container_probe` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `mux/neg_h264_into_wav_illegal` — **N/A**: engine does not declare output container 'wav'
- `mp4box@2.3.0` · `transcode/extreme_resize_1x1` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/edge_headerless_recorder_remux` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/robust_inverted_range` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/fuzz_flac_bitflip_probe` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `robustness/fuzz_webm_bitflip_probe` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/extreme_resize_0x0` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/fuzz_wav_header_truncated_probe` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `robustness/prop_transcode_idempotent_dims_h264` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/edge_seek_negative` — **N/A**: engine does not declare operation 'seek'
- `platform@chrome-149` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/h264_resize_4k_to_1080p` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `performance/convert-longtasks` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `demux/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `platform@chrome-149` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/ladder_large_h264_1080p_120s_resize_720p` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/selfcheck_h264_resize_720p_tie` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `transcode/flac_to_aac_mp4` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `probe/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_10bit_to_h264_8bit` — **N/A**: engine does not declare feature 'depth:10bit-to-8bit'
- `platform@chrome-149` · `transcode/hevc_to_av1_webm` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `transcode/ladder_tiny_h264_360p_resize_180p` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `transcode/h264_rotate_180` — **N/A**: platform engine: transcode is NA — MediaRecorder canvas capture does not apply rotation transforms
- `platform@chrome-149` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `metadata/write_mp4_tags` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/h264_flip_vertical` — **N/A**: engine does not declare feature 'flip'
- `platform@chrome-149` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `probe/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/h264_resize_720p` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `transcode/vp9_alpha_to_vp9_keepalpha` — **N/A**: engine does not declare feature 'alpha:transcode'
- `platform@chrome-149` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `probe/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `platform@chrome-149` · `transcode/roundtrip_leg2_vp9_to_h264` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `decode-seek/meta_decode_remux_eq_decode_anchored` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `demux/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `platform@chrome-149` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/gapless_pcm_to_opus_priming` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_rotate_90_dimswap` — **N/A**: platform engine: transcode is NA — MediaRecorder canvas capture does not apply rotation transforms
- `platform@chrome-149` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `transcode/h264_rotate_normalize` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/buffer_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_to_hevc_mp4` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/hevc_to_vp9_webm` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare feature 'depth:10bit-output'
- `platform@chrome-149` · `transcode/metamorphic_resize_same_1080p_idempotent` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/wav_to_mp3_mp4` — **N/A**: engine does not declare audio codec 'mp3'
- `platform@chrome-149` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/h264_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `platform@chrome-149` · `transcode/h264_two_pass_bitrate` — **N/A**: engine does not declare feature 'two-pass'
- `platform@chrome-149` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/h264_bitrate_2mbps` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `transcode/vp8_to_vp9_webm` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `performance/convert-webm-resize-320x180` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `performance/encode-fps` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/av_downmix_stereo_to_mono` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `remux/aac_adts_adts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/write_mp3_id3` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_5s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/h264_fps_30_to_15` — **N/A**: engine does not declare feature 'fps'
- `platform@chrome-149` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `demux/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_probe_dur_fragmented_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare feature 'flip'
- `platform@chrome-149` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `metadata/write_mkv_tags` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `performance/convert-peak-memory` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/bframe_reorder_h264_to_vp9` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `transcode/vp9_alpha_to_vp8_keepalpha` — **N/A**: engine does not declare feature 'alpha:transcode'
- `platform@chrome-149` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/opus_to_aac_mp4` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/mp3_to_aac_mp4` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `demux/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_to_vp9_webm` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_to_ts` — **N/A**: engine does not declare output container 'ts'
- `platform@chrome-149` · `probe/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/aac_to_pcm_wav_extract` — **N/A**: engine does not declare input container 'adts'
- `platform@chrome-149` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/hdr10_to_sdr_tonemap` — **N/A**: engine does not declare feature 'tonemap'
- `platform@chrome-149` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/mp3_to_opus_webm` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare feature 'decode:audio-pcm'
- `platform@chrome-149` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/wav_to_vorbis_ogg` — **N/A**: engine does not declare output container 'ogg'
- `platform@chrome-149` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `performance/op-sweep-transcode-webm` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/h264_rotate_270_dimswap` — **N/A**: platform engine: transcode is NA — MediaRecorder canvas capture does not apply rotation transforms
- `platform@chrome-149` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `transcode/hevc_to_h264_mp4` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `transcode/h264_pad_letterbox_4x3_to_16x9` — **N/A**: engine does not declare feature 'pad'
- `platform@chrome-149` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/extreme_fps_240` — **N/A**: engine does not declare feature 'fps'
- `platform@chrome-149` · `demux/h264_ts` — **N/A**: engine does not declare input container 'ts'
- `platform@chrome-149` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/vp9_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `platform@chrome-149` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/aac_to_opus_webm` — **N/A**: engine does not declare input container 'adts'
- `platform@chrome-149` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/read_flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/vp9_to_h264_mp4` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `transcode/ladder_tiny_vp9_360p_to_h264_180p` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `transcode/wav_to_opus_ogg` — **N/A**: engine does not declare output container 'ogg'
- `platform@chrome-149` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/bframe_reorder_h264_to_h264` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `demux/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `platform@chrome-149` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_to_av1_mp4` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `probe/h264_ts` — **N/A**: engine does not declare input container 'ts'
- `platform@chrome-149` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `remux/h264_in_mkv_mkv_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/flac_to_opus_webm` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare feature 'colorspace'
- `platform@chrome-149` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/hevc_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `platform@chrome-149` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/wav_to_flac` — **N/A**: engine does not declare output container 'flac'
- `platform@chrome-149` · `probe/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `platform@chrome-149` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_crf_quality_mode` — **N/A**: engine does not declare feature 'crf'
- `platform@chrome-149` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `transcode/h264_to_mov` — **N/A**: engine does not declare output container 'mov'
- `platform@chrome-149` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `transcode/wav_to_aac_mp4` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `demux/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `probe/realworld_mdn_trex_mp3` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `transcode/h264_to_fragmented_mp4` — **N/A**: engine does not declare feature 'fragmented'
- `platform@chrome-149` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/aac_to_mp3_mp4` — **N/A**: engine does not declare input container 'adts'
- `platform@chrome-149` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `probe/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `platform@chrome-149` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `platform@chrome-149` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/vp9_to_av1_webm` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `transcode/extreme_fps_1` — **N/A**: engine does not declare feature 'fps'
- `platform@chrome-149` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/av1_to_vp9_webm` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `transcode/h264_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `platform@chrome-149` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/metamorphic_duration_preserved_h264_to_vp9` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/vp8_to_h264_mp4` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `platform@chrome-149` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/robust_start_past_eof` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `encryption/cenc_ctr_truncated_mdat_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `encryption/cenc_ctr_senc_bitflip_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `robustness/fuzz_webm_header_truncated_demux` — **N/A**: platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV
- `platform@chrome-149` · `demux/graceful_zero_length` — **N/A**: platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV
- `platform@chrome-149` · `robustness/fuzz_ts_zeroed_spans_demux` — **N/A**: engine does not declare input container 'ts'
- `platform@chrome-149` · `demux/graceful_webm_header_destroyed` — **N/A**: platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV
- `platform@chrome-149` · `robustness/fuzz_mux_target_corrupt_remux` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/fuzz_truncated_h264_asset_demux` — **N/A**: platform engine: demux is NA — no moov box (not a progressive MP4 or truncated)
- `platform@chrome-149` · `trim/robust_end_far_past_eof` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `demux/graceful_truncated_h264` — **N/A**: platform engine: demux is NA — no moov box (not a progressive MP4 or truncated)
- `platform@chrome-149` · `remux/neg_headerless_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `transcode/mismatch_mislabeled_container_transcode` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `robustness/fuzz_mp4_tail_truncated_demux` — **N/A**: platform engine: demux is NA — sample extends past end of file (truncated)
- `platform@chrome-149` · `transcode/malformed_truncated_h264_transcode` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `robustness/fuzz_adts_aac_bitflip_probe` — **N/A**: engine does not declare input container 'adts'
- `platform@chrome-149` · `robustness/edge_flac_with_seektable_probe` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `mux/neg_h264_into_ogg_illegal` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `metadata/neg_garbled_id3_mp3_probe` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `transcode/mismatch_video_only_to_audio_target` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `robustness/fuzz_ogg_opus_header_truncated_probe` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `encryption/cenc_ctr_protection_zeroed_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `remux/neg_zeroed_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/prop_trim_concatenation` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/robust_negative_start` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `mux/neg_h264_into_wav_illegal` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/robust_inverted_range` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/robust_truncated_source` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `robustness/fuzz_remux_zeroed_spans` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/fuzz_flac_bitflip_probe` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `robustness/edge_fragmented_remux` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/edge_pcm_s24_decode` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `transcode/extreme_resize_0x0` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `audio-dsp/fuzz_aiff_header_truncated_probe` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `robustness/prop_transcode_idempotent_dims_h264` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `remotion-media-parser@4.0.479` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_backward_then_forward` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_vfr_timing` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `transcode/h264_resize_4k_to_1080p` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/convert-longtasks` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `demux/hls_aes128` — **N/A**: engine does not declare encryption scheme 'hls-aes128'
- `remotion-media-parser@4.0.479` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/ladder_large_h264_1080p_120s_resize_720p` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/multitrack_select_default_audio` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/selfcheck_h264_resize_720p_tie` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/flac_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_vp8` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/h264_10bit_to_h264_8bit` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/hevc_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_vfr_to_cfr_30` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/ladder_tiny_h264_360p_resize_180p` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_rotate_180` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `metadata/write_mp4_tags` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `decode-seek/meta_vfr_seek_lands_on_true_pts` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_resize_720p` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/meta_seek_vs_linear_decode` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `transcode/vp9_alpha_to_vp9_keepalpha` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-media-parser@4.0.479` · `transcode/roundtrip_leg2_vp9_to_h264` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/meta_decode_remux_eq_decode_anchored` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_vp9` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `transcode/av1_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `transcode/gapless_pcm_to_opus_priming` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/h264_rotate_90_dimswap` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_fps_15_to_30` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_rotate_normalize` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/buffer_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/h264_to_hevc_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/hevc_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/metamorphic_resize_same_1080p_idempotent` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/wav_to_mp3_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_tiny_dims_2x2_h264` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `transcode/h264_two_pass_bitrate` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_hevc` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_mkv_h264_keyframe` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_bitrate_2mbps` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/vp8_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `probe/wav_f32` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-media-parser@4.0.479` · `transcode/av_downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/decode-fps` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `remux/aac_adts_adts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_mov_h264` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `metadata/write_mp3_id3` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_5s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_fps_30_to_15` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_probe_dur_fragmented_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `metadata/write_mkv_tags` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_av1_keyframe` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `performance/seek-ms` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/bframe_reorder_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/vp9_alpha_to_vp8_keepalpha` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_multitrack_select_video` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `transcode/opus_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/mp3_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/fanout_h264_abr_ladder` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_tiny_dims_1x1` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `demux/size_huge_huge_h264_1080p_600s` — **SKIPPED**: disabled: it takes so much time
- `remotion-media-parser@4.0.479` · `decode-seek/decode_bframes_reorder` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/h264_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_size_tiny_h264_360p` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/h264_to_ts` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_crop_center` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_vp8_keyframe` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-media-parser@4.0.479` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_hevc_keyframe` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `transcode/aac_to_pcm_wav_extract` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_av1` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `transcode/hdr10_to_sdr_tonemap` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_size_tiny_vp9_360p` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_repeated_same_target` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `transcode/mp3_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `transcode/wav_to_vorbis_ogg` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_zero` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_h264_10bit` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_rotate_270_dimswap` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_size_large_vp9_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_h264_nonkeyframe` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `transcode/hevc_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_pad_letterbox_4x3_to_16x9` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/extreme_fps_240` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_h264_4k` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_extreme_fps_1` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/vp9_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/aac_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/meta_pts_monotonic_after_reorder` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_vp9_keyframe` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/vp9_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_vp9_alpha` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/wav_to_opus_ogg` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `demux/wav_f32` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-media-parser@4.0.479` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/bframe_reorder_h264_to_h264` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_size_micro_h264_1frame` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/h264_to_av1_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `remux/h264_in_mkv_mkv_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/flac_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_fps_30_to_60` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/wav_to_flac` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `probe/hls_aes128` — **N/A**: engine does not declare feature 'hls:aes128'
- `remotion-media-parser@4.0.479` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_size_huge_h264_600s` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_mkv_h264` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_extreme_fps_240` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `transcode/h264_crf_quality_mode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `transcode/wav_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_to_fragmented_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/aac_to_mp3_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_bframes_midgop` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `remotion-media-parser@4.0.479` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/vp9_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/extreme_fps_1` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_to_mkv` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/robust_bitflipped_source` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/edge_seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `encryption/cenc_ctr_senc_bitflip_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `robustness/fuzz_mux_target_corrupt_remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/edge_faststart_reserve_remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `audio-dsp/fuzz_wav_fmt_corrupt_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/mismatch_mislabeled_container_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/negative_png_to_video` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/fuzz_mp4_zeroed_spans_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `transcode/malformed_truncated_h264_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/edge_dims_1x1_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/neg_vp9_into_adts_illegal` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `robustness/edge_open_gop_bframes_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `mux/neg_h264_into_ogg_illegal` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `robustness/edge_cbcs_boundary_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `transcode/mismatch_audio_only_to_video_target` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/prop_demux_mux_roundtrip_eq` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/mismatch_video_only_to_audio_target` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `encryption/cenc_ctr_protection_zeroed_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `remux/neg_zeroed_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/prop_trim_concatenation` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/extreme_resize_1x1` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/edge_headerless_recorder_remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/negative_jpeg_to_video` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/robust_inverted_range` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `transcode/malformed_zero_length_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/robust_truncated_source` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `remux/neg_truncated_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/extreme_resize_0x0` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/edge_seek_negative` — **N/A**: engine does not declare operation 'seek'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare feature 'streaming:decode-equality'
- `remotion-webcodecs@4.0.479` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare feature 'upmix'
- `remotion-webcodecs@4.0.479` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` — **N/A**: remotion-webcodecs@4.0.479 transcode: large fixture transcodes are not reliable through the in-memory bufferWriter output path
- `remotion-webcodecs@4.0.479` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare feature 'downmix'
- `remotion-webcodecs@4.0.479` · `demux/hls_aes128` — **N/A**: engine does not declare encryption scheme 'hls-aes128'
- `remotion-webcodecs@4.0.479` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `transcode/ladder_large_h264_1080p_120s_resize_720p` — **N/A**: remotion-webcodecs@4.0.479 transcode: large fixture transcodes are not reliable through the in-memory bufferWriter output path
- `remotion-webcodecs@4.0.479` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/flac_to_aac_mp4` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare audio codec 'pcm-s16be'
- `remotion-webcodecs@4.0.479` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare output container 'adts'
- `remotion-webcodecs@4.0.479` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/h264_10bit_to_h264_8bit` — **N/A**: engine does not declare feature 'depth:10bit-to-8bit'
- `remotion-webcodecs@4.0.479` · `transcode/hevc_to_av1_webm` — **N/A**: remotion-webcodecs@4.0.479 transcode: Remotion WebCodecs 4.0.479 exposes no AV1 encoder
- `remotion-webcodecs@4.0.479` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare feature 'gain'
- `remotion-webcodecs@4.0.479` · `transcode/h264_vfr_to_cfr_30` — **N/A**: engine does not declare feature 'fps'
- `remotion-webcodecs@4.0.479` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare feature 'remux:vp9-opus-in-mp4'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `metadata/write_mp4_tags` — **N/A**: engine does not declare feature 'metadata:write'
- `remotion-webcodecs@4.0.479` · `transcode/h264_flip_vertical` — **N/A**: engine does not declare feature 'flip'
- `remotion-webcodecs@4.0.479` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare feature 'remux:av1-opus-in-mp4'
- `remotion-webcodecs@4.0.479` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare feature 'downmix'
- `remotion-webcodecs@4.0.479` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `transcode/vp9_alpha_to_vp9_keepalpha` — **N/A**: engine does not declare feature 'alpha'
- `remotion-webcodecs@4.0.479` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `decode-seek/meta_decode_remux_eq_decode_anchored` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare feature 'remux:av1-opus-in-webm'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare feature 'headerless'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare output container 'flac'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/h264_rotate_90_dimswap` — **N/A**: remotion-webcodecs@4.0.479 transcode: rotated MP4 outputs are not playback-smoke-safe in this package
- `remotion-webcodecs@4.0.479` · `transcode/h264_fps_15_to_30` — **N/A**: engine does not declare feature 'fps'
- `remotion-webcodecs@4.0.479` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare feature 'remux:mp3-in-mp4'
- `remotion-webcodecs@4.0.479` · `streaming-output/buffer_massive_h264_mp4` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-webcodecs@4.0.479` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare feature 'depth:10bit-output'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/wav_to_mp3_mp4` — **N/A**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `transcode/h264_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `transcode/h264_two_pass_bitrate` — **N/A**: engine does not declare feature 'two-pass'
- `remotion-webcodecs@4.0.479` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `probe/wav_f32` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-webcodecs@4.0.479` · `transcode/av_downmix_stereo_to_mono` — **N/A**: remotion-webcodecs@4.0.479 transcode: the adapter cannot remap audio channel count (downmix/upmix)
- `remotion-webcodecs@4.0.479` · `metadata/write_mp3_id3` — **N/A**: engine does not declare output container 'mp3'
- `remotion-webcodecs@4.0.479` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `transcode/h264_fps_30_to_15` — **N/A**: engine does not declare feature 'fps'
- `remotion-webcodecs@4.0.479` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-webcodecs@4.0.479` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-webcodecs@4.0.479` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_probe_dur_fragmented_shape` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare feature 'flip'
- `remotion-webcodecs@4.0.479` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: remotion-webcodecs@4.0.479 transcode: the adapter cannot remap audio channel count (downmix/upmix)
- `remotion-webcodecs@4.0.479` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare feature 'remux:mp3-in-mp4'
- `remotion-webcodecs@4.0.479` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare output container 'flac'
- `remotion-webcodecs@4.0.479` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/bframe_reorder_h264_to_vp9` — **N/A**: remotion-webcodecs@4.0.479 transcode: B-frame reorder sources are not reliably re-encoded by this package
- `remotion-webcodecs@4.0.479` · `transcode/vp9_alpha_to_vp8_keepalpha` — **N/A**: engine does not declare feature 'alpha'
- `remotion-webcodecs@4.0.479` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `transcode/opus_to_aac_mp4` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `transcode/fanout_h264_abr_ladder` — **N/A**: engine does not declare feature 'fanout'
- `remotion-webcodecs@4.0.479` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `remotion-webcodecs@4.0.479` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/h264_to_ts` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `transcode/h264_crop_center` — **N/A**: engine does not declare feature 'crop'
- `remotion-webcodecs@4.0.479` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare feature 'streaming:decode-equality'
- `remotion-webcodecs@4.0.479` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/hdr10_to_sdr_tonemap` — **N/A**: engine does not declare feature 'tonemap'
- `remotion-webcodecs@4.0.479` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare feature 'decode:audio-pcm'
- `remotion-webcodecs@4.0.479` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `transcode/wav_to_vorbis_ogg` — **N/A**: engine does not declare output container 'ogg'
- `remotion-webcodecs@4.0.479` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare output container 'ogg'
- `remotion-webcodecs@4.0.479` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: remotion-webcodecs@4.0.479 transcode: the adapter cannot remap audio channel count (downmix/upmix)
- `remotion-webcodecs@4.0.479` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `transcode/h264_pad_letterbox_4x3_to_16x9` — **N/A**: engine does not declare feature 'pad'
- `remotion-webcodecs@4.0.479` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare output container 'aiff'
- `remotion-webcodecs@4.0.479` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/extreme_fps_240` — **N/A**: engine does not declare feature 'fps'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `transcode/vp9_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare feature 'headerless'
- `remotion-webcodecs@4.0.479` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `decode-seek/decode_vp9_alpha` — **N/A**: engine does not declare feature 'alpha'
- `remotion-webcodecs@4.0.479` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare feature 'upmix'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `transcode/wav_to_opus_ogg` — **N/A**: engine does not declare output container 'ogg'
- `remotion-webcodecs@4.0.479` · `demux/wav_f32` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-webcodecs@4.0.479` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare feature 'streaming:decode-equality'
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `transcode/flac_to_opus_webm` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `transcode/h264_fps_30_to_60` — **N/A**: engine does not declare feature 'fps'
- `remotion-webcodecs@4.0.479` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare output container 'aiff'
- `remotion-webcodecs@4.0.479` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare feature 'colorspace'
- `remotion-webcodecs@4.0.479` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `transcode/hevc_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `transcode/wav_to_flac` — **N/A**: engine does not declare output container 'flac'
- `remotion-webcodecs@4.0.479` · `probe/hls_aes128` — **N/A**: engine does not declare feature 'hls:aes128'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `decode-seek/decode_size_huge_h264_600s` — **SKIPPED**: decode of the 600s huge h264 fixture exceeds the 120s op budget: remotion-webcodecs parses via @remotion/media-parser, whose full-file scan on this 600s asset is the same slowness already tracked as disabled for remotion-media-parser demux/size_huge_huge_h264_1080p_600s. platform and mediabunny decode it within budget; ffmpeg.wasm honestly NAs it — this is a per-engine scale limit.
- `remotion-webcodecs@4.0.479` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-webcodecs@4.0.479` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/h264_crf_quality_mode` — **N/A**: engine does not declare feature 'crf'
- `remotion-webcodecs@4.0.479` · `transcode/h264_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `transcode/h264_to_fragmented_mp4` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `remotion-webcodecs@4.0.479` · `transcode/aac_to_mp3_mp4` — **N/A**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `remotion-webcodecs@4.0.479` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/vp9_to_av1_webm` — **N/A**: remotion-webcodecs@4.0.479 transcode: Remotion WebCodecs 4.0.479 exposes no AV1 encoder
- `remotion-webcodecs@4.0.479` · `transcode/extreme_fps_1` — **N/A**: engine does not declare feature 'fps'
- `remotion-webcodecs@4.0.479` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `transcode/h264_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_ctr_truncated_mdat_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `remux/neg_headerless_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `audio-dsp/fuzz_wav_fmt_corrupt_transcode` — **N/A**: remotion-webcodecs@4.0.479 transcode: the adapter cannot remap audio channel count (downmix/upmix)
- `remotion-webcodecs@4.0.479` · `mux/neg_zero_tracks_empty_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `robustness/fuzz_encrypted_mp4_ciphertext_decode` — **N/A**: engine does not declare encryption scheme 'cenc-ctr'
- `remotion-webcodecs@4.0.479` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: remotion-webcodecs@4.0.479 transcode: the adapter cannot remap audio channel count (downmix/upmix)
- `remotion-webcodecs@4.0.479` · `robustness/prop_gapless_sample_count_priming` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/neg_h264_into_ogg_illegal` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `robustness/edge_rotated_remux` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `robustness/edge_cbcs_boundary_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `robustness/prop_demux_mux_roundtrip_eq` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare feature 'remux:compose'
- `remotion-webcodecs@4.0.479` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `robustness/fuzz_ogg_opus_header_truncated_probe` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare output container 'flac'
- `remotion-webcodecs@4.0.479` · `mux/neg_h264_into_wav_illegal` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `robustness/fuzz_remux_zeroed_spans` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `robustness/edge_fragmented_remux` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `robustness/edge_pcm_s24_decode` — **N/A**: browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/fuzz_aiff_header_truncated_probe` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/h264_resize_4k_to_1080p` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `demux/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `web-demuxer@4.0.0` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/ladder_large_h264_1080p_120s_resize_720p` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `demux/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `transcode/multitrack_select_default_audio` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/selfcheck_h264_resize_720p_tie` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/flac_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `demux/realworld_mdn_trex_mp3` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/hevc_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/ladder_tiny_h264_360p_resize_180p` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/h264_rotate_180` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `metadata/write_mp4_tags` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/h264_flip_vertical` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `demux/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `probe/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/h264_resize_720p` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `transcode/vp9_alpha_to_vp9_keepalpha` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `probe/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `web-demuxer@4.0.0` · `probe/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `web-demuxer@4.0.0` · `transcode/roundtrip_leg2_vp9_to_h264` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `decode-seek/meta_decode_remux_eq_decode_anchored` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `demux/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `web-demuxer@4.0.0` · `transcode/av1_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `transcode/gapless_pcm_to_opus_priming` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/h264_fps_15_to_30` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `transcode/h264_rotate_normalize` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/buffer_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `metadata/read_no_tags_wav` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `transcode/h264_to_hevc_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/hevc_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/metamorphic_resize_same_1080p_idempotent` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/wav_to_mp3_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/h264_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/h264_two_pass_bitrate` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/vp8_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `probe/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `probe/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `transcode/av_downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `metadata/write_mp3_id3` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_1080p_5s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/h264_fps_30_to_15` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `demux/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_probe_dur_fragmented_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `metadata/write_mkv_tags` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/bframe_reorder_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/vp9_alpha_to_vp8_keepalpha` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `demux/h264_vfr` — **N/A**: engine does not declare feature 'packets:dts'
- `web-demuxer@4.0.0` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare feature 'rotation:decode'
- `web-demuxer@4.0.0` · `transcode/opus_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/mp3_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/metamorphic-vfr-iterate-packets` — **N/A**: engine does not declare feature 'packets:dts'
- `web-demuxer@4.0.0` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/fanout_h264_abr_ladder` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `demux/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/h264_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/h264_to_ts` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `probe/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `web-demuxer@4.0.0` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/aac_to_pcm_wav_extract` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `transcode/hdr10_to_sdr_tonemap` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/mp3_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `transcode/wav_to_vorbis_ogg` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `performance/op-sweep-transcode-webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/h264_rotate_270_dimswap` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/hevc_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/h264_pad_letterbox_4x3_to_16x9` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/extreme_fps_240` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `demux/h264_ts` — **N/A**: web-demuxer@4.0.0: demux not applicable: web-demuxer v4.0.0 cannot construct an AVPacketReader for MPEG-TS packet streams
- `web-demuxer@4.0.0` · `demux/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `demux/empty_audio_zero_packets` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `transcode/vp9_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/aac_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/read_flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/vp9_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/ladder_tiny_vp9_360p_to_h264_180p` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `decode-seek/decode_vp9_alpha` — **N/A**: engine does not declare feature 'alpha'
- `web-demuxer@4.0.0` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/wav_to_opus_ogg` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `demux/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `probe/empty-audio-wav` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `transcode/bframe_reorder_h264_to_h264` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `demux/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `web-demuxer@4.0.0` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `audio-dsp/edge_longform_audio_probe` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/h264_to_av1_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `remux/h264_in_mkv_mkv_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/flac_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/h264_fps_30_to_60` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `decode-seek/decode_rotated_display_matrix` — **N/A**: engine does not declare feature 'rotate'
- `web-demuxer@4.0.0` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/wav_to_flac` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `probe/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `web-demuxer@4.0.0` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `web-demuxer@4.0.0` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/h264_crf_quality_mode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `transcode/h264_to_mov` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `transcode/wav_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `demux/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `probe/realworld_mdn_trex_mp3` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `transcode/h264_to_fragmented_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/aac_to_mp3_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `probe/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `web-demuxer@4.0.0` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `web-demuxer@4.0.0` · `demux/h264_bframes_1080p` — **N/A**: engine does not declare feature 'packets:dts'
- `web-demuxer@4.0.0` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/vp9_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/extreme_fps_1` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/av1_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/h264_to_mkv` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `metadata/read_mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/metamorphic_duration_preserved_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/vp8_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/gapless_pcm_to_aac_priming` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `robustness/edge_no_media_tracks_probe` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `trim/robust_start_past_eof` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `robustness/fuzz_mp3_header_truncated_probe` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `encryption/cenc_ctr_senc_bitflip_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `robustness/fuzz_ts_zeroed_spans_demux` — **N/A**: web-demuxer@4.0.0: demux not applicable: web-demuxer v4.0.0 cannot construct an AVPacketReader for MPEG-TS packet streams
- `web-demuxer@4.0.0` · `robustness/fuzz_mux_target_corrupt_remux` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `audio-dsp/fuzz_wav_fmt_corrupt_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/neg_zero_tracks_empty_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `transcode/malformed_truncated_h264_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/fuzz_wav_bitflip_decode` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `robustness/fuzz_encrypted_mp4_ciphertext_decode` — **N/A**: engine does not declare encryption scheme 'cenc-ctr'
- `web-demuxer@4.0.0` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/neg_vp9_into_adts_illegal` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `robustness/edge_ts_pts_wraparound_demux` — **SKIPPED**: web-demuxer probes normal MPEG-TS correctly (probe/h264_ts PASSes) but mis-derives the video frame rate (reports 240 fps vs the golden 30) on this PTS-WRAPAROUND TS fixture: the 33-bit PTS rollover corrupts its inter-frame-interval fps estimate. The container is supported; the wraparound edge fps derivation is a tracked engine limitation, so this one cell is skipped.
- `web-demuxer@4.0.0` · `robustness/fuzz_adts_aac_bitflip_probe` — **N/A**: engine does not declare input container 'adts'
- `web-demuxer@4.0.0` · `robustness/edge_5_1_channels_probe` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `robustness/edge_flac_with_seektable_probe` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `robustness/edge_rotated_remux` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/neg_garbled_id3_mp3_probe` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `transcode/mismatch_audio_only_to_video_target` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `robustness/prop_demux_mux_roundtrip_eq` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/mismatch_video_only_to_audio_target` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `robustness/fuzz_ogg_opus_header_truncated_probe` — **N/A**: engine does not declare input container 'ogg'
- `web-demuxer@4.0.0` · `encryption/cenc_ctr_protection_zeroed_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `remux/neg_zeroed_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `trim/robust_negative_start` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `transcode/extreme_resize_1x1` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/robust_inverted_range` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `robustness/fuzz_flac_bitflip_probe` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `transcode/extreme_resize_0x0` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/fuzz_wav_header_truncated_probe` — **N/A**: engine does not declare input container 'wav'

</details>

### 4. Benchmark matrix (full per-engine timing detail)

_Indicative for this browser only. Cells without a green conformance gate are blank (—)._

**`aibrush-media@dev`**

_No admissible benchmarks (no green conformance gate)._

**`ffmpeg.wasm@0.12.15`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `decode-seek/seek_backward_then_forward` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `transcode/h264_resize_4k_to_1080p` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/multitrack_select_default_audio` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `transcode/selfcheck_h264_resize_720p_tie` | — | — | — | — | — |
| `transcode/flac_to_aac_mp4` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `decode-seek/decode_vp8` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `demux/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | 11607.1 | 11607.1 | 0.43× | 0 B | 2056 |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_180` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | 124.9 | 124.9 | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | 45.5 | 45.5 | 219.54× | 0 B | 339 |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | 16.3 | 16.3 | 613.12× | 0 B | 339 |
| `remux/opus_ogg_to_webm` | 7.2 | 7.2 | 1388.9× | 0 B | 339 |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | — | — | — | — | — |
| `transcode/h264_resize_720p` | — | — | — | — | — |
| `decode-seek/meta_seek_vs_linear_decode` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | 222.8 | 222.8 | 134.62× | 0 B | 3433 |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | — | — | — | — | — |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | 42.5 | 42.5 | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `transcode/h264_rotate_normalize` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `transcode/h264_to_hevc_mp4` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `transcode/hevc_to_vp9_webm` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `transcode/wav_to_mp3_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp8_webm` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_2x2_h264` | — | — | — | — | — |
| `transcode/h264_two_pass_bitrate` | 80817.4 | 80817.4 | 0.37× | 0 B | 9567 |
| `decode-seek/decode_hevc` | — | — | — | — | — |
| `probe/huge_vp9_1080p_240s` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | 259.4 | 259.4 | — | — | 339 |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | 24.6 | 24.6 | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `decode-seek/decode_mov_h264` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `decode-seek/seek_h264_keyframe` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | 116.3 | 116.3 | — | 246.57 MiB | 1643 |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | 127.3 | 127.3 | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | 125.2 | 125.2 | — | 318.1 MiB | 339 |
| `decode-seek/seek_av1_keyframe` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | 106.7 | 106.7 | — | 0 B | 3433 |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `decode-seek/decode_multitrack_select_video` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | 447.4 | 447.4 | — | — | 339 |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `decode-seek/decode_bframes_reorder` | 1629.1 | 1629.1 | — | 2.86 GiB | 3433 |
| `demux/size_tiny_tiny_h264_360p_2s` | 8 | 8 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | 8.5 | 8.5 | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | — | — | — | — | — |
| `decode-seek/seek_repeated_same_target` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | 6.2 | 6.2 | 1623.38× | 0 B | 3433 |
| `trim/h264_bframes_frame_accurate` | 6629.1 | 6629.1 | 1.51× | 0 B | 3433 |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `decode-seek/decode_h264_10bit` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | 189.7 | 189.7 | 158.17× | 0 B | 339 |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `decode-seek/decode_size_large_vp9_120s` | — | — | — | — | — |
| `decode-seek/seek_h264_nonkeyframe` | — | — | — | — | — |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | 41.5 | 41.5 | 240.7× | 0 B | 339 |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | — | — | — | — | — |
| `demux/h264_ts` | 48.7 | 48.7 | — | — | — |
| `probe/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `transcode/vp9_to_vp8_webm` | 42531.7 | 42531.7 | 0.24× | 0 B | 2056 |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | 117.6 | 117.6 | — | 0 B | 3433 |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | 1698.4 | 1698.4 | — | 2.86 GiB | 1643 |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | 7 | 7 | — | — | — |
| `transcode/vp9_to_h264_mp4` | — | — | — | — | — |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | — | — | — | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | 417.4 | 417.4 | — | 0 B | 1643 |
| `decode-seek/decode_size_micro_h264_1frame` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/h264_ts` | 47.7 | 47.7 | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | 82.5 | 82.5 | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `decode-seek/decode_mkv_h264` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | — | — | — | — | — |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | 72.9 | 72.9 | 137.15× | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | 122 | 122 | — | 0 B | 2056 |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | — | — | — | — | — |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | 819.5 | 819.5 | — | — | 339 |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `decode-seek/decode_size_large_h264_120s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_aac_priming` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | — | — | — | — |
| `robustness/edge_no_media_tracks_probe` | — | — | — | — | — |
| `trim/robust_start_past_eof` | — | — | — | — | — |
| `robustness/prop_trim_additivity_compose` | — | — | — | — | — |
| `robustness/edge_pcm_s16be_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_truncated_mdat_graceful` | — | — | — | — | — |
| `robustness/fuzz_mp3_header_truncated_probe` | — | — | — | — | — |
| `trim/robust_bitflipped_source` | — | — | — | — | — |
| `robustness/edge_audio_only_probe` | — | — | — | — | — |
| `robustness/prop_remux_duration_preserved` | — | — | — | — | — |
| `robustness/edge_seek_past_eof` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `robustness/edge_audio_only_micro_probe` | — | — | — | — | — |
| `robustness/prop_duration_consistent_across_containers` | — | — | — | — | — |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | — | — | — | — |
| `robustness/fuzz_webm_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_zero_length` | — | — | — | — | — |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | — | — | — | — |
| `demux/graceful_webm_header_destroyed` | — | — | — | — | — |
| `robustness/fuzz_mux_target_corrupt_remux` | — | — | — | — | — |
| `robustness/edge_faststart_reserve_remux` | — | — | — | — | — |
| `robustness/edge_dims_1x1_probe` | — | — | — | — | — |
| `robustness/fuzz_truncated_h264_asset_demux` | — | — | — | — | — |
| `trim/robust_end_far_past_eof` | — | — | — | — | — |
| `robustness/edge_flac_without_seektable_probe` | — | — | — | — | — |
| `demux/graceful_truncated_h264` | — | — | — | — | — |
| `remux/neg_headerless_webm_to_mkv` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | — | — | — | — |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | — | — |
| `robustness/fuzz_mp4_bitflip_probe` | — | — | — | — | — |
| `robustness/image_png_probe_na` | — | — | — | — | — |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `transcode/mismatch_mislabeled_container_transcode` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_probe` | — | — | — | — | — |
| `robustness/edge_multitrack_demux` | — | — | — | — | — |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | — | — | — | — |
| `robustness/edge_video_only_micro_probe` | — | — | — | — | — |
| `transcode/negative_png_to_video` | — | — | — | — | — |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | — | — | — | — |
| `transcode/malformed_truncated_h264_transcode` | — | — | — | — | — |
| `robustness/edge_dims_1x1_decode` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | — | — | — |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | — | — |
| `robustness/edge_ts_pts_wraparound_demux` | — | — | — | — | — |
| `robustness/prop_gapless_sample_count_priming` | — | — | — | — | — |
| `robustness/edge_open_gop_bframes_decode` | — | — | — | — | — |
| `robustness/fuzz_adts_aac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_5_1_channels_probe` | — | — | — | — | — |
| `robustness/edge_zero_length_probe` | — | — | — | — | — |
| `transcode/negative_webp_to_video` | — | — | — | — | — |
| `robustness/edge_flac_with_seektable_probe` | — | — | — | — | — |
| `mux/neg_h264_into_ogg_illegal` | — | — | — | — | — |
| `robustness/edge_rotated_remux` | — | — | — | — | — |
| `robustness/edge_cbcs_boundary_decrypt` | — | — | — | — | — |
| `metadata/neg_garbled_id3_mp3_probe` | — | — | — | — | — |
| `transcode/mismatch_audio_only_to_video_target` | — | — | — | — | — |
| `robustness/prop_demux_mux_roundtrip_eq` | — | — | — | — | — |
| `transcode/mismatch_video_only_to_audio_target` | — | — | — | — | — |
| `robustness/prop_double_remux_stable` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | — | — | — | — | — |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | — | — | — | — |
| `remux/neg_zeroed_mp4_to_mkv` | — | — | — | — | — |
| `robustness/prop_trim_concatenation` | — | — | — | — | — |
| `robustness/prop_flac_seek_seektable_equiv` | — | — | — | — | — |
| `trim/robust_negative_start` | — | — | — | — | — |
| `robustness/edge_mislabeled_container_probe` | — | — | — | — | — |
| `robustness/image_jpeg_probe_na` | — | — | — | — | — |
| `robustness/fuzz_mp4_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_mp4_header_destroyed` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `robustness/edge_vfr_probe` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `transcode/extreme_resize_1x1` | — | — | — | — | — |
| `robustness/edge_extreme_fps_240_probe` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_remux` | — | — | — | — | — |
| `transcode/negative_jpeg_to_video` | — | — | — | — | — |
| `trim/robust_inverted_range` | — | — | — | — | — |
| `robustness/edge_gapless_priming_probe` | — | — | — | — | — |
| `transcode/malformed_zero_length_transcode` | — | — | — | — | — |
| `trim/robust_truncated_source` | — | — | — | — | — |
| `robustness/fuzz_remux_zeroed_spans` | — | — | — | — | — |
| `remux/neg_truncated_mp4_to_mkv` | — | — | — | — | — |
| `robustness/image_webp_probe_na` | — | — | — | — | — |
| `robustness/fuzz_flac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_video_only_probe` | — | — | — | — | — |
| `robustness/fuzz_webm_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_longform_probe` | — | — | — | — | — |
| `robustness/edge_dims_2x2_h264_probe` | — | — | — | — | — |
| `robustness/edge_fragmented_remux` | — | — | — | — | — |
| `robustness/edge_pcm_s24_decode` | — | — | — | — | — |
| `transcode/extreme_resize_0x0` | — | — | — | — | — |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | — | — | — | — | — |
| `robustness/edge_extreme_fps_1_probe` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | — | — | — | — |
| `robustness/prop_transcode_idempotent_dims_h264` | — | — | — | — | — |
| `robustness/edge_seek_negative` | — | — | — | — | — |

**`mediabunny@1.48.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `decode-seek/seek_backward_then_forward` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | 326.4 | 326.4 | — | 58.01 MiB | 339 |
| `decode-seek/decode_vfr_timing` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `transcode/h264_resize_4k_to_1080p` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | 2.6 | 2.6 | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/multitrack_select_default_audio` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `transcode/selfcheck_h264_resize_720p_tie` | — | — | — | — | — |
| `transcode/flac_to_aac_mp4` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | 666.2 | 666.2 | 900.65× | 0 B | 3433 |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `decode-seek/decode_vp8` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `demux/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | 50.4 | 50.4 | 595.65× | 152.9 MiB | 3433 |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_180` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | 8.7 | 8.7 | 574.64× | 0 B | 339 |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | 3.5 | 3.5 | — | — | — |
| `metadata/write_ogg_vorbiscomment` | 7.8 | 7.8 | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | 45.1 | 45.1 | 221.51× | 0 B | 339 |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | — | — | — | — | — |
| `transcode/h264_resize_720p` | — | — | — | — | — |
| `decode-seek/meta_seek_vs_linear_decode` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | 42 | 42 | — | 255.03 MiB | 339 |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | — | — | — | — | — |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | 368.7 | 368.7 | 27.12× | 33.71 MiB | 339 |
| `demux/size_tiny_tiny_vp9_360p_2s` | 2.9 | 2.9 | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `transcode/h264_rotate_normalize` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | 2.1 | 2.1 | — | — | — |
| `transcode/h264_to_hevc_mp4` | 2858.3 | 2858.3 | 10.5× | 0 B | 3433 |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `transcode/hevc_to_vp9_webm` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | 8 | 8 | 1258.74× | 0 B | 339 |
| `transcode/wav_to_mp3_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp8_webm` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_2x2_h264` | — | — | — | — | — |
| `transcode/h264_two_pass_bitrate` | — | — | — | — | — |
| `decode-seek/decode_hevc` | — | — | — | — | — |
| `probe/huge_vp9_1080p_240s` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | 5.7 | 5.7 | 1746.42× | 32.11 MiB | 339 |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | 186.1 | 186.1 | 161.18× | 0 B | 3433 |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `decode-seek/decode_mov_h264` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `decode-seek/seek_h264_keyframe` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | 353.7 | 353.7 | — | 0 B | 3433 |
| `decode-seek/seek_av1_keyframe` | 22.4 | 22.4 | — | — | 339 |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `decode-seek/decode_multitrack_select_video` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `decode-seek/decode_bframes_reorder` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | 317.2 | 317.2 | — | 0 B | 339 |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | 49.1 | 49.1 | 204.26× | 0 B | 3433 |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | 105.6 | 105.6 | — | 121.98 MiB | 339 |
| `decode-seek/seek_repeated_same_target` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `decode-seek/decode_h264_10bit` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `decode-seek/decode_size_large_vp9_120s` | — | — | — | — | — |
| `decode-seek/seek_h264_nonkeyframe` | — | — | — | — | — |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | 2127.6 | 2127.6 | — | 0 B | 9567 |
| `demux/h264_ts` | 38.7 | 38.7 | — | — | — |
| `probe/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | 2 | 2 | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | 329.7 | 329.7 | — | 0 B | 339 |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `transcode/vp9_to_h264_mp4` | — | — | — | — | — |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | 187.6 | 187.6 | — | 0 B | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `probe/empty-audio-wav` | 4.1 | 4.1 | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | 341.6 | 341.6 | — | 0 B | 339 |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `decode-seek/decode_size_micro_h264_1frame` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `transcode/h264_fps_30_to_60` | 5023 | 5023 | 5.97× | 65.69 MiB | 9567 |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | 2.4 | 2.4 | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `decode-seek/decode_mkv_h264` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | 23.2 | 23.2 | 215.98× | 141.05 MiB | 339 |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | 484.6 | 484.6 | — | 108.9 MiB | 339 |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | 2.2 | 2.2 | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | — | — | — | — | — |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | 2270.9 | 2270.9 | 4.41× | 38.17 MiB | 339 |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | 2564.8 | 2564.8 | 11.7× | 0 B | 1643 |
| `probe/massive_vp9_1080p_2h` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `decode-seek/decode_size_large_h264_120s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_aac_priming` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | — | — | — | — |
| `robustness/edge_no_media_tracks_probe` | — | — | — | — | — |
| `trim/robust_start_past_eof` | — | — | — | — | — |
| `robustness/prop_trim_additivity_compose` | — | — | — | — | — |
| `robustness/edge_pcm_s16be_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_truncated_mdat_graceful` | — | — | — | — | — |
| `robustness/fuzz_mp3_header_truncated_probe` | — | — | — | — | — |
| `trim/robust_bitflipped_source` | — | — | — | — | — |
| `robustness/edge_audio_only_probe` | — | — | — | — | — |
| `robustness/prop_remux_duration_preserved` | — | — | — | — | — |
| `robustness/edge_seek_past_eof` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `robustness/edge_audio_only_micro_probe` | — | — | — | — | — |
| `robustness/prop_duration_consistent_across_containers` | — | — | — | — | — |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | — | — | — | — |
| `robustness/fuzz_webm_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_zero_length` | — | — | — | — | — |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | — | — | — | — |
| `demux/graceful_webm_header_destroyed` | — | — | — | — | — |
| `robustness/fuzz_mux_target_corrupt_remux` | — | — | — | — | — |
| `robustness/edge_faststart_reserve_remux` | — | — | — | — | — |
| `robustness/edge_dims_1x1_probe` | — | — | — | — | — |
| `robustness/fuzz_truncated_h264_asset_demux` | — | — | — | — | — |
| `trim/robust_end_far_past_eof` | — | — | — | — | — |
| `robustness/edge_flac_without_seektable_probe` | — | — | — | — | — |
| `demux/graceful_truncated_h264` | — | — | — | — | — |
| `remux/neg_headerless_webm_to_mkv` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | — | — | — | — |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | — | — |
| `robustness/fuzz_mp4_bitflip_probe` | — | — | — | — | — |
| `robustness/image_png_probe_na` | — | — | — | — | — |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `transcode/mismatch_mislabeled_container_transcode` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_probe` | — | — | — | — | — |
| `robustness/edge_multitrack_demux` | — | — | — | — | — |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | — | — | — | — |
| `robustness/edge_video_only_micro_probe` | — | — | — | — | — |
| `transcode/negative_png_to_video` | — | — | — | — | — |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | — | — | — | — |
| `transcode/malformed_truncated_h264_transcode` | — | — | — | — | — |
| `robustness/edge_dims_1x1_decode` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | — | — | — |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | — | — |
| `robustness/edge_ts_pts_wraparound_demux` | — | — | — | — | — |
| `robustness/prop_gapless_sample_count_priming` | — | — | — | — | — |
| `robustness/edge_open_gop_bframes_decode` | — | — | — | — | — |
| `robustness/fuzz_adts_aac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_5_1_channels_probe` | — | — | — | — | — |
| `robustness/edge_zero_length_probe` | — | — | — | — | — |
| `transcode/negative_webp_to_video` | — | — | — | — | — |
| `robustness/edge_flac_with_seektable_probe` | — | — | — | — | — |
| `mux/neg_h264_into_ogg_illegal` | — | — | — | — | — |
| `robustness/edge_rotated_remux` | — | — | — | — | — |
| `robustness/edge_cbcs_boundary_decrypt` | — | — | — | — | — |
| `metadata/neg_garbled_id3_mp3_probe` | — | — | — | — | — |
| `transcode/mismatch_audio_only_to_video_target` | — | — | — | — | — |
| `robustness/prop_demux_mux_roundtrip_eq` | — | — | — | — | — |
| `transcode/mismatch_video_only_to_audio_target` | — | — | — | — | — |
| `robustness/prop_double_remux_stable` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | — | — | — | — | — |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | — | — | — | — |
| `remux/neg_zeroed_mp4_to_mkv` | — | — | — | — | — |
| `robustness/prop_trim_concatenation` | — | — | — | — | — |
| `robustness/prop_flac_seek_seektable_equiv` | — | — | — | — | — |
| `trim/robust_negative_start` | — | — | — | — | — |
| `robustness/edge_mislabeled_container_probe` | — | — | — | — | — |
| `robustness/image_jpeg_probe_na` | — | — | — | — | — |
| `robustness/fuzz_mp4_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_mp4_header_destroyed` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `robustness/edge_vfr_probe` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `transcode/extreme_resize_1x1` | — | — | — | — | — |
| `robustness/edge_extreme_fps_240_probe` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_remux` | — | — | — | — | — |
| `transcode/negative_jpeg_to_video` | — | — | — | — | — |
| `trim/robust_inverted_range` | — | — | — | — | — |
| `robustness/edge_gapless_priming_probe` | — | — | — | — | — |
| `transcode/malformed_zero_length_transcode` | — | — | — | — | — |
| `trim/robust_truncated_source` | — | — | — | — | — |
| `robustness/fuzz_remux_zeroed_spans` | — | — | — | — | — |
| `remux/neg_truncated_mp4_to_mkv` | — | — | — | — | — |
| `robustness/image_webp_probe_na` | — | — | — | — | — |
| `robustness/fuzz_flac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_video_only_probe` | — | — | — | — | — |
| `robustness/fuzz_webm_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_longform_probe` | — | — | — | — | — |
| `robustness/edge_dims_2x2_h264_probe` | — | — | — | — | — |
| `robustness/edge_fragmented_remux` | — | — | — | — | — |
| `robustness/edge_pcm_s24_decode` | — | — | — | — | — |
| `transcode/extreme_resize_0x0` | — | — | — | — | — |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | — | — | — | — | — |
| `robustness/edge_extreme_fps_1_probe` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | — | — | — | — |
| `robustness/prop_transcode_idempotent_dims_h264` | — | — | — | — | — |
| `robustness/edge_seek_negative` | — | — | — | — | — |

**`mp4box@2.3.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `decode-seek/seek_backward_then_forward` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `transcode/h264_resize_4k_to_1080p` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/multitrack_select_default_audio` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `transcode/selfcheck_h264_resize_720p_tie` | — | — | — | — | — |
| `transcode/flac_to_aac_mp4` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `decode-seek/decode_vp8` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `demux/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | 7.6 | 7.6 | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_180` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | — | — | — | — | — |
| `transcode/h264_resize_720p` | — | — | — | — | — |
| `decode-seek/meta_seek_vs_linear_decode` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | — | — | — | — | — |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | 21.5 | 21.5 | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `transcode/h264_rotate_normalize` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `transcode/h264_to_hevc_mp4` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `transcode/hevc_to_vp9_webm` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `transcode/wav_to_mp3_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp8_webm` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_2x2_h264` | — | — | — | — | — |
| `transcode/h264_two_pass_bitrate` | — | — | — | — | — |
| `decode-seek/decode_hevc` | — | — | — | — | — |
| `probe/huge_vp9_1080p_240s` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | 34.1 | 34.1 | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `decode-seek/decode_mov_h264` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `decode-seek/seek_h264_keyframe` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | 86.8 | 86.8 | — | 373.71 MiB | 339 |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | 146.1 | 146.1 | 821.21× | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `decode-seek/seek_av1_keyframe` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `decode-seek/decode_multitrack_select_video` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | 8.4 | 8.4 | 1497.37× | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `decode-seek/decode_bframes_reorder` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | 3.8 | 3.8 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | 33.1 | 33.1 | 302.43× | 0 B | 339 |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | — | — | — | — | — |
| `decode-seek/seek_repeated_same_target` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `decode-seek/decode_h264_10bit` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `decode-seek/decode_size_large_vp9_120s` | — | — | — | — | — |
| `decode-seek/seek_h264_nonkeyframe` | — | — | — | — | — |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `probe/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `transcode/vp9_to_h264_mp4` | — | — | — | — | — |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | — | — | — | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `decode-seek/decode_size_micro_h264_1frame` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | 38.8 | 38.8 | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | 58.4 | 58.4 | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `decode-seek/decode_mkv_h264` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | — | — | — | — | — |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | — | — | — | — | — |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `decode-seek/decode_size_large_h264_120s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_aac_priming` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | — | — | — | — |
| `robustness/edge_no_media_tracks_probe` | — | — | — | — | — |
| `trim/robust_start_past_eof` | — | — | — | — | — |
| `robustness/prop_trim_additivity_compose` | — | — | — | — | — |
| `robustness/edge_pcm_s16be_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_truncated_mdat_graceful` | — | — | — | — | — |
| `robustness/fuzz_mp3_header_truncated_probe` | — | — | — | — | — |
| `trim/robust_bitflipped_source` | — | — | — | — | — |
| `robustness/edge_audio_only_probe` | — | — | — | — | — |
| `robustness/prop_remux_duration_preserved` | — | — | — | — | — |
| `robustness/edge_seek_past_eof` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `robustness/edge_audio_only_micro_probe` | — | — | — | — | — |
| `robustness/prop_duration_consistent_across_containers` | — | — | — | — | — |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | — | — | — | — |
| `robustness/fuzz_webm_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_zero_length` | — | — | — | — | — |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | — | — | — | — |
| `demux/graceful_webm_header_destroyed` | — | — | — | — | — |
| `robustness/fuzz_mux_target_corrupt_remux` | — | — | — | — | — |
| `robustness/edge_faststart_reserve_remux` | — | — | — | — | — |
| `robustness/edge_dims_1x1_probe` | — | — | — | — | — |
| `robustness/fuzz_truncated_h264_asset_demux` | — | — | — | — | — |
| `trim/robust_end_far_past_eof` | — | — | — | — | — |
| `robustness/edge_flac_without_seektable_probe` | — | — | — | — | — |
| `demux/graceful_truncated_h264` | — | — | — | — | — |
| `remux/neg_headerless_webm_to_mkv` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | — | — | — | — |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | — | — |
| `robustness/fuzz_mp4_bitflip_probe` | — | — | — | — | — |
| `robustness/image_png_probe_na` | — | — | — | — | — |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `transcode/mismatch_mislabeled_container_transcode` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_probe` | — | — | — | — | — |
| `robustness/edge_multitrack_demux` | — | — | — | — | — |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | — | — | — | — |
| `robustness/edge_video_only_micro_probe` | — | — | — | — | — |
| `transcode/negative_png_to_video` | — | — | — | — | — |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | — | — | — | — |
| `transcode/malformed_truncated_h264_transcode` | — | — | — | — | — |
| `robustness/edge_dims_1x1_decode` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | — | — | — |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | — | — |
| `robustness/edge_ts_pts_wraparound_demux` | — | — | — | — | — |
| `robustness/prop_gapless_sample_count_priming` | — | — | — | — | — |
| `robustness/edge_open_gop_bframes_decode` | — | — | — | — | — |
| `robustness/fuzz_adts_aac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_5_1_channels_probe` | — | — | — | — | — |
| `robustness/edge_zero_length_probe` | — | — | — | — | — |
| `transcode/negative_webp_to_video` | — | — | — | — | — |
| `robustness/edge_flac_with_seektable_probe` | — | — | — | — | — |
| `mux/neg_h264_into_ogg_illegal` | — | — | — | — | — |
| `robustness/edge_rotated_remux` | — | — | — | — | — |
| `robustness/edge_cbcs_boundary_decrypt` | — | — | — | — | — |
| `metadata/neg_garbled_id3_mp3_probe` | — | — | — | — | — |
| `transcode/mismatch_audio_only_to_video_target` | — | — | — | — | — |
| `robustness/prop_demux_mux_roundtrip_eq` | — | — | — | — | — |
| `transcode/mismatch_video_only_to_audio_target` | — | — | — | — | — |
| `robustness/prop_double_remux_stable` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | — | — | — | — | — |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | — | — | — | — |
| `remux/neg_zeroed_mp4_to_mkv` | — | — | — | — | — |
| `robustness/prop_trim_concatenation` | — | — | — | — | — |
| `robustness/prop_flac_seek_seektable_equiv` | — | — | — | — | — |
| `trim/robust_negative_start` | — | — | — | — | — |
| `robustness/edge_mislabeled_container_probe` | — | — | — | — | — |
| `robustness/image_jpeg_probe_na` | — | — | — | — | — |
| `robustness/fuzz_mp4_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_mp4_header_destroyed` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `robustness/edge_vfr_probe` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `transcode/extreme_resize_1x1` | — | — | — | — | — |
| `robustness/edge_extreme_fps_240_probe` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_remux` | — | — | — | — | — |
| `transcode/negative_jpeg_to_video` | — | — | — | — | — |
| `trim/robust_inverted_range` | — | — | — | — | — |
| `robustness/edge_gapless_priming_probe` | — | — | — | — | — |
| `transcode/malformed_zero_length_transcode` | — | — | — | — | — |
| `trim/robust_truncated_source` | — | — | — | — | — |
| `robustness/fuzz_remux_zeroed_spans` | — | — | — | — | — |
| `remux/neg_truncated_mp4_to_mkv` | — | — | — | — | — |
| `robustness/image_webp_probe_na` | — | — | — | — | — |
| `robustness/fuzz_flac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_video_only_probe` | — | — | — | — | — |
| `robustness/fuzz_webm_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_longform_probe` | — | — | — | — | — |
| `robustness/edge_dims_2x2_h264_probe` | — | — | — | — | — |
| `robustness/edge_fragmented_remux` | — | — | — | — | — |
| `robustness/edge_pcm_s24_decode` | — | — | — | — | — |
| `transcode/extreme_resize_0x0` | — | — | — | — | — |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | — | — | — | — | — |
| `robustness/edge_extreme_fps_1_probe` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | — | — | — | — |
| `robustness/prop_transcode_idempotent_dims_h264` | — | — | — | — | — |
| `robustness/edge_seek_negative` | — | — | — | — | — |

**`platform@chrome-149`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `decode-seek/seek_backward_then_forward` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `transcode/h264_resize_4k_to_1080p` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/multitrack_select_default_audio` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `transcode/selfcheck_h264_resize_720p_tie` | — | — | — | — | — |
| `transcode/flac_to_aac_mp4` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `decode-seek/decode_vp8` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `demux/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | 13.9 | 13.9 | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_180` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | — | — | — | — | — |
| `transcode/h264_resize_720p` | — | — | — | — | — |
| `decode-seek/meta_seek_vs_linear_decode` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | — | — | — | — | — |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | 2293.2 | 2293.2 | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `transcode/h264_rotate_normalize` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `transcode/h264_to_hevc_mp4` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `transcode/hevc_to_vp9_webm` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `transcode/wav_to_mp3_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp8_webm` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_2x2_h264` | — | — | — | — | — |
| `transcode/h264_two_pass_bitrate` | — | — | — | — | — |
| `decode-seek/decode_hevc` | — | — | — | — | — |
| `probe/huge_vp9_1080p_240s` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | 34.7 | 34.7 | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `decode-seek/decode_mov_h264` | 1125.2 | 1125.2 | — | 1.3 GiB | 339 |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `decode-seek/seek_h264_keyframe` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `decode-seek/seek_av1_keyframe` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `decode-seek/decode_multitrack_select_video` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | 107.5 | 107.5 | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `decode-seek/decode_bframes_reorder` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | — | — | — | — | — |
| `decode-seek/seek_repeated_same_target` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | 83.1 | 83.1 | — | — | 339 |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `decode-seek/decode_h264_10bit` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | 45.3 | 45.3 | — | 57.01 MiB | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `decode-seek/decode_size_large_vp9_120s` | — | — | — | — | — |
| `decode-seek/seek_h264_nonkeyframe` | — | — | — | — | — |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | 173.7 | 173.7 | — | 118.28 MiB | 3433 |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `probe/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | 74.5 | 74.5 | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | 6.6 | 6.6 | — | — | — |
| `transcode/vp9_to_h264_mp4` | — | — | — | — | — |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | — | — | — | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `decode-seek/decode_size_micro_h264_1frame` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | 175.1 | 175.1 | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `decode-seek/decode_mkv_h264` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | — | — | — | — | — |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | 20.1 | 20.1 | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | — | — | — | — | — |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `decode-seek/decode_size_large_h264_120s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_aac_priming` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | — | — | — | — |
| `robustness/edge_no_media_tracks_probe` | — | — | — | — | — |
| `trim/robust_start_past_eof` | — | — | — | — | — |
| `robustness/prop_trim_additivity_compose` | — | — | — | — | — |
| `robustness/edge_pcm_s16be_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_truncated_mdat_graceful` | — | — | — | — | — |
| `robustness/fuzz_mp3_header_truncated_probe` | — | — | — | — | — |
| `trim/robust_bitflipped_source` | — | — | — | — | — |
| `robustness/edge_audio_only_probe` | — | — | — | — | — |
| `robustness/prop_remux_duration_preserved` | — | — | — | — | — |
| `robustness/edge_seek_past_eof` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `robustness/edge_audio_only_micro_probe` | — | — | — | — | — |
| `robustness/prop_duration_consistent_across_containers` | — | — | — | — | — |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | — | — | — | — |
| `robustness/fuzz_webm_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_zero_length` | — | — | — | — | — |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | — | — | — | — |
| `demux/graceful_webm_header_destroyed` | — | — | — | — | — |
| `robustness/fuzz_mux_target_corrupt_remux` | — | — | — | — | — |
| `robustness/edge_faststart_reserve_remux` | — | — | — | — | — |
| `robustness/edge_dims_1x1_probe` | — | — | — | — | — |
| `robustness/fuzz_truncated_h264_asset_demux` | — | — | — | — | — |
| `trim/robust_end_far_past_eof` | — | — | — | — | — |
| `robustness/edge_flac_without_seektable_probe` | — | — | — | — | — |
| `demux/graceful_truncated_h264` | — | — | — | — | — |
| `remux/neg_headerless_webm_to_mkv` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | — | — | — | — |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | — | — |
| `robustness/fuzz_mp4_bitflip_probe` | — | — | — | — | — |
| `robustness/image_png_probe_na` | — | — | — | — | — |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `transcode/mismatch_mislabeled_container_transcode` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_probe` | — | — | — | — | — |
| `robustness/edge_multitrack_demux` | — | — | — | — | — |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | — | — | — | — |
| `robustness/edge_video_only_micro_probe` | — | — | — | — | — |
| `transcode/negative_png_to_video` | — | — | — | — | — |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | — | — | — | — |
| `transcode/malformed_truncated_h264_transcode` | — | — | — | — | — |
| `robustness/edge_dims_1x1_decode` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | — | — | — |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | — | — |
| `robustness/edge_ts_pts_wraparound_demux` | — | — | — | — | — |
| `robustness/prop_gapless_sample_count_priming` | — | — | — | — | — |
| `robustness/edge_open_gop_bframes_decode` | — | — | — | — | — |
| `robustness/fuzz_adts_aac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_5_1_channels_probe` | — | — | — | — | — |
| `robustness/edge_zero_length_probe` | — | — | — | — | — |
| `transcode/negative_webp_to_video` | — | — | — | — | — |
| `robustness/edge_flac_with_seektable_probe` | — | — | — | — | — |
| `mux/neg_h264_into_ogg_illegal` | — | — | — | — | — |
| `robustness/edge_rotated_remux` | — | — | — | — | — |
| `robustness/edge_cbcs_boundary_decrypt` | — | — | — | — | — |
| `metadata/neg_garbled_id3_mp3_probe` | — | — | — | — | — |
| `transcode/mismatch_audio_only_to_video_target` | — | — | — | — | — |
| `robustness/prop_demux_mux_roundtrip_eq` | — | — | — | — | — |
| `transcode/mismatch_video_only_to_audio_target` | — | — | — | — | — |
| `robustness/prop_double_remux_stable` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | — | — | — | — | — |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | — | — | — | — |
| `remux/neg_zeroed_mp4_to_mkv` | — | — | — | — | — |
| `robustness/prop_trim_concatenation` | — | — | — | — | — |
| `robustness/prop_flac_seek_seektable_equiv` | — | — | — | — | — |
| `trim/robust_negative_start` | — | — | — | — | — |
| `robustness/edge_mislabeled_container_probe` | — | — | — | — | — |
| `robustness/image_jpeg_probe_na` | — | — | — | — | — |
| `robustness/fuzz_mp4_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_mp4_header_destroyed` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `robustness/edge_vfr_probe` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `transcode/extreme_resize_1x1` | — | — | — | — | — |
| `robustness/edge_extreme_fps_240_probe` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_remux` | — | — | — | — | — |
| `transcode/negative_jpeg_to_video` | — | — | — | — | — |
| `trim/robust_inverted_range` | — | — | — | — | — |
| `robustness/edge_gapless_priming_probe` | — | — | — | — | — |
| `transcode/malformed_zero_length_transcode` | — | — | — | — | — |
| `trim/robust_truncated_source` | — | — | — | — | — |
| `robustness/fuzz_remux_zeroed_spans` | — | — | — | — | — |
| `remux/neg_truncated_mp4_to_mkv` | — | — | — | — | — |
| `robustness/image_webp_probe_na` | — | — | — | — | — |
| `robustness/fuzz_flac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_video_only_probe` | — | — | — | — | — |
| `robustness/fuzz_webm_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_longform_probe` | — | — | — | — | — |
| `robustness/edge_dims_2x2_h264_probe` | — | — | — | — | — |
| `robustness/edge_fragmented_remux` | — | — | — | — | — |
| `robustness/edge_pcm_s24_decode` | — | — | — | — | — |
| `transcode/extreme_resize_0x0` | — | — | — | — | — |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | — | — | — | — | — |
| `robustness/edge_extreme_fps_1_probe` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | — | — | — | — |
| `robustness/prop_transcode_idempotent_dims_h264` | — | — | — | — | — |
| `robustness/edge_seek_negative` | — | — | — | — | — |

**`remotion-media-parser@4.0.479`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `decode-seek/seek_backward_then_forward` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `transcode/h264_resize_4k_to_1080p` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | 10.1 | 10.1 | — | — | — |
| `transcode/multitrack_select_default_audio` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `transcode/selfcheck_h264_resize_720p_tie` | — | — | — | — | — |
| `transcode/flac_to_aac_mp4` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `decode-seek/decode_vp8` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `demux/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | 4 | 4 | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_180` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `probe/vp8_720p_10s` | 15.6 | 15.6 | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `probe/recorder_headerless` | 9.4 | 9.4 | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | — | — | — | — | — |
| `transcode/h264_resize_720p` | — | — | — | — | — |
| `decode-seek/meta_seek_vs_linear_decode` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `probe/mp3_xing` | 2.6 | 2.6 | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | — | — | — | — | — |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `transcode/h264_rotate_normalize` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | 8 | 8 | — | — | — |
| `transcode/h264_to_hevc_mp4` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `transcode/hevc_to_vp9_webm` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `transcode/wav_to_mp3_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp8_webm` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_2x2_h264` | — | — | — | — | — |
| `transcode/h264_two_pass_bitrate` | — | — | — | — | — |
| `decode-seek/decode_hevc` | — | — | — | — | — |
| `probe/huge_vp9_1080p_240s` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | 3.7 | 3.7 | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `decode-seek/decode_mov_h264` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `decode-seek/seek_h264_keyframe` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `decode-seek/seek_av1_keyframe` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `decode-seek/decode_multitrack_select_video` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `decode-seek/decode_bframes_reorder` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | 2 | 2 | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | 87.5 | 87.5 | 82313.94× | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | — | — | — | — | — |
| `decode-seek/seek_repeated_same_target` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | 16.6 | 16.6 | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | 7.4 | 7.4 | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `decode-seek/decode_h264_10bit` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `decode-seek/decode_size_large_vp9_120s` | — | — | — | — | — |
| `decode-seek/seek_h264_nonkeyframe` | — | — | — | — | — |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `probe/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | 13.4 | 13.4 | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `transcode/vp9_to_h264_mp4` | — | — | — | — | — |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | — | — | — | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | 3.7 | 3.7 | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `probe/empty-audio-wav` | 1.8 | 1.8 | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `decode-seek/decode_size_micro_h264_1frame` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | 17.3 | 17.3 | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `decode-seek/decode_mkv_h264` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | — | — | — | — | — |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | — | — | — | — | — |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `decode-seek/decode_size_large_h264_120s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_aac_priming` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | — | — | — | — |
| `robustness/edge_no_media_tracks_probe` | — | — | — | — | — |
| `trim/robust_start_past_eof` | — | — | — | — | — |
| `robustness/prop_trim_additivity_compose` | — | — | — | — | — |
| `robustness/edge_pcm_s16be_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_truncated_mdat_graceful` | — | — | — | — | — |
| `robustness/fuzz_mp3_header_truncated_probe` | — | — | — | — | — |
| `trim/robust_bitflipped_source` | — | — | — | — | — |
| `robustness/edge_audio_only_probe` | — | — | — | — | — |
| `robustness/prop_remux_duration_preserved` | — | — | — | — | — |
| `robustness/edge_seek_past_eof` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `robustness/edge_audio_only_micro_probe` | — | — | — | — | — |
| `robustness/prop_duration_consistent_across_containers` | — | — | — | — | — |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | — | — | — | — |
| `robustness/fuzz_webm_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_zero_length` | — | — | — | — | — |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | — | — | — | — |
| `demux/graceful_webm_header_destroyed` | — | — | — | — | — |
| `robustness/fuzz_mux_target_corrupt_remux` | — | — | — | — | — |
| `robustness/edge_faststart_reserve_remux` | — | — | — | — | — |
| `robustness/edge_dims_1x1_probe` | — | — | — | — | — |
| `robustness/fuzz_truncated_h264_asset_demux` | — | — | — | — | — |
| `trim/robust_end_far_past_eof` | — | — | — | — | — |
| `robustness/edge_flac_without_seektable_probe` | — | — | — | — | — |
| `demux/graceful_truncated_h264` | — | — | — | — | — |
| `remux/neg_headerless_webm_to_mkv` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | — | — | — | — |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | — | — |
| `robustness/fuzz_mp4_bitflip_probe` | — | — | — | — | — |
| `robustness/image_png_probe_na` | — | — | — | — | — |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `transcode/mismatch_mislabeled_container_transcode` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_probe` | — | — | — | — | — |
| `robustness/edge_multitrack_demux` | — | — | — | — | — |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | — | — | — | — |
| `robustness/edge_video_only_micro_probe` | — | — | — | — | — |
| `transcode/negative_png_to_video` | — | — | — | — | — |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | — | — | — | — |
| `transcode/malformed_truncated_h264_transcode` | — | — | — | — | — |
| `robustness/edge_dims_1x1_decode` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | — | — | — |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | — | — |
| `robustness/edge_ts_pts_wraparound_demux` | — | — | — | — | — |
| `robustness/prop_gapless_sample_count_priming` | — | — | — | — | — |
| `robustness/edge_open_gop_bframes_decode` | — | — | — | — | — |
| `robustness/fuzz_adts_aac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_5_1_channels_probe` | — | — | — | — | — |
| `robustness/edge_zero_length_probe` | — | — | — | — | — |
| `transcode/negative_webp_to_video` | — | — | — | — | — |
| `robustness/edge_flac_with_seektable_probe` | — | — | — | — | — |
| `mux/neg_h264_into_ogg_illegal` | — | — | — | — | — |
| `robustness/edge_rotated_remux` | — | — | — | — | — |
| `robustness/edge_cbcs_boundary_decrypt` | — | — | — | — | — |
| `metadata/neg_garbled_id3_mp3_probe` | — | — | — | — | — |
| `transcode/mismatch_audio_only_to_video_target` | — | — | — | — | — |
| `robustness/prop_demux_mux_roundtrip_eq` | — | — | — | — | — |
| `transcode/mismatch_video_only_to_audio_target` | — | — | — | — | — |
| `robustness/prop_double_remux_stable` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | — | — | — | — | — |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | — | — | — | — |
| `remux/neg_zeroed_mp4_to_mkv` | — | — | — | — | — |
| `robustness/prop_trim_concatenation` | — | — | — | — | — |
| `robustness/prop_flac_seek_seektable_equiv` | — | — | — | — | — |
| `trim/robust_negative_start` | — | — | — | — | — |
| `robustness/edge_mislabeled_container_probe` | — | — | — | — | — |
| `robustness/image_jpeg_probe_na` | — | — | — | — | — |
| `robustness/fuzz_mp4_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_mp4_header_destroyed` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `robustness/edge_vfr_probe` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `transcode/extreme_resize_1x1` | — | — | — | — | — |
| `robustness/edge_extreme_fps_240_probe` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_remux` | — | — | — | — | — |
| `transcode/negative_jpeg_to_video` | — | — | — | — | — |
| `trim/robust_inverted_range` | — | — | — | — | — |
| `robustness/edge_gapless_priming_probe` | — | — | — | — | — |
| `transcode/malformed_zero_length_transcode` | — | — | — | — | — |
| `trim/robust_truncated_source` | — | — | — | — | — |
| `robustness/fuzz_remux_zeroed_spans` | — | — | — | — | — |
| `remux/neg_truncated_mp4_to_mkv` | — | — | — | — | — |
| `robustness/image_webp_probe_na` | — | — | — | — | — |
| `robustness/fuzz_flac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_video_only_probe` | — | — | — | — | — |
| `robustness/fuzz_webm_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_longform_probe` | — | — | — | — | — |
| `robustness/edge_dims_2x2_h264_probe` | — | — | — | — | — |
| `robustness/edge_fragmented_remux` | — | — | — | — | — |
| `robustness/edge_pcm_s24_decode` | — | — | — | — | — |
| `transcode/extreme_resize_0x0` | — | — | — | — | — |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | — | — | — | — | — |
| `robustness/edge_extreme_fps_1_probe` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | — | — | — | — |
| `robustness/prop_transcode_idempotent_dims_h264` | — | — | — | — | — |
| `robustness/edge_seek_negative` | — | — | — | — | — |

**`remotion-webcodecs@4.0.479`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `decode-seek/seek_backward_then_forward` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `transcode/h264_resize_4k_to_1080p` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | 6.6 | 6.6 | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/multitrack_select_default_audio` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `transcode/selfcheck_h264_resize_720p_tie` | — | — | — | — | — |
| `transcode/flac_to_aac_mp4` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `decode-seek/decode_vp8` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `demux/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | 15.7 | 15.7 | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | 232.1 | 232.1 | — | 0 B | — |
| `probe/perf-extract-metadata-huge` | 8.8 | 8.8 | — | — | — |
| `transcode/h264_rotate_180` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | 114.3 | 114.3 | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | — | — | — | — | — |
| `transcode/h264_resize_720p` | — | — | — | — | — |
| `decode-seek/meta_seek_vs_linear_decode` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | 903 | 903 | 11.08× | 0 B | 3433 |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | 1929.9 | 1929.9 | — | — | 3433 |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | 7 | 7 | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | 56.3 | 56.3 | — | 31.96 MiB | 339 |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `transcode/h264_rotate_normalize` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `transcode/h264_to_hevc_mp4` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `transcode/hevc_to_vp9_webm` | 1800.9 | 1800.9 | 5.55× | 51.78 MiB | 339 |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `transcode/wav_to_mp3_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp8_webm` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_2x2_h264` | — | — | — | — | — |
| `transcode/h264_two_pass_bitrate` | — | — | — | — | — |
| `decode-seek/decode_hevc` | — | — | — | — | — |
| `probe/huge_vp9_1080p_240s` | 215.9 | 215.9 | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | 4.5 | 4.5 | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | 5284.7 | 5284.7 | 5.68× | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `performance/decode-fps` | 1751.1 | 1751.1 | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `decode-seek/decode_mov_h264` | 992.9 | 992.9 | — | 506.47 MiB | 3433 |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `decode-seek/seek_h264_keyframe` | 2860.2 | 2860.2 | — | — | 339 |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | 715.8 | 715.8 | — | 0 B | 339 |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `decode-seek/seek_av1_keyframe` | 201 | 201 | — | — | 339 |
| `performance/convert-peak-memory` | 3475 | 3475 | — | 0 B | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `decode-seek/decode_multitrack_select_video` | 340.1 | 340.1 | — | 0 B | 339 |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `decode-seek/decode_bframes_reorder` | 1394.4 | 1394.4 | — | 0 B | 1643 |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | 71.8 | 71.8 | — | — | 1643 |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | 99 | 99 | 101.34× | 0 B | 339 |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | — | — | — | — | — |
| `decode-seek/seek_repeated_same_target` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | 9.3 | 9.3 | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `decode-seek/decode_h264_10bit` | 581.6 | 581.6 | — | 0 B | 339 |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | 705.3 | 705.3 | 14.21× | 32.35 MiB | 339 |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | 15021.4 | 15021.4 | — | 0 B | 339 |
| `decode-seek/decode_size_large_vp9_120s` | — | — | — | — | — |
| `decode-seek/seek_h264_nonkeyframe` | — | — | — | — | — |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | — | — | — | — | — |
| `demux/h264_ts` | 171.8 | 171.8 | — | — | — |
| `probe/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `demux/wav_s24` | 5.1 | 5.1 | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | 26.1 | 26.1 | — | 0 B | 2056 |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | 21 | 21 | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `transcode/vp9_to_h264_mp4` | 892.8 | 892.8 | 11.21× | 0 B | 339 |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | — | — | — | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `decode-seek/decode_size_micro_h264_1frame` | 4.5 | 4.5 | — | 0 B | 339 |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `decode-seek/decode_mkv_h264` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | — | — | — | — | — |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | 620 | 620 | 16.13× | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | — | — | — | — | — |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `probe/hls_vod` | 321 | 321 | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | 7 | 7 | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `decode-seek/decode_size_large_h264_120s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_aac_priming` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | — | — | — | — |
| `robustness/edge_no_media_tracks_probe` | — | — | — | — | — |
| `trim/robust_start_past_eof` | — | — | — | — | — |
| `robustness/prop_trim_additivity_compose` | — | — | — | — | — |
| `robustness/edge_pcm_s16be_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_truncated_mdat_graceful` | — | — | — | — | — |
| `robustness/fuzz_mp3_header_truncated_probe` | — | — | — | — | — |
| `trim/robust_bitflipped_source` | — | — | — | — | — |
| `robustness/edge_audio_only_probe` | — | — | — | — | — |
| `robustness/prop_remux_duration_preserved` | — | — | — | — | — |
| `robustness/edge_seek_past_eof` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `robustness/edge_audio_only_micro_probe` | — | — | — | — | — |
| `robustness/prop_duration_consistent_across_containers` | — | — | — | — | — |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | — | — | — | — |
| `robustness/fuzz_webm_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_zero_length` | — | — | — | — | — |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | — | — | — | — |
| `demux/graceful_webm_header_destroyed` | — | — | — | — | — |
| `robustness/fuzz_mux_target_corrupt_remux` | — | — | — | — | — |
| `robustness/edge_faststart_reserve_remux` | — | — | — | — | — |
| `robustness/edge_dims_1x1_probe` | — | — | — | — | — |
| `robustness/fuzz_truncated_h264_asset_demux` | — | — | — | — | — |
| `trim/robust_end_far_past_eof` | — | — | — | — | — |
| `robustness/edge_flac_without_seektable_probe` | — | — | — | — | — |
| `demux/graceful_truncated_h264` | — | — | — | — | — |
| `remux/neg_headerless_webm_to_mkv` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | — | — | — | — |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | — | — |
| `robustness/fuzz_mp4_bitflip_probe` | — | — | — | — | — |
| `robustness/image_png_probe_na` | — | — | — | — | — |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `transcode/mismatch_mislabeled_container_transcode` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_probe` | — | — | — | — | — |
| `robustness/edge_multitrack_demux` | — | — | — | — | — |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | — | — | — | — |
| `robustness/edge_video_only_micro_probe` | — | — | — | — | — |
| `transcode/negative_png_to_video` | — | — | — | — | — |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | — | — | — | — |
| `transcode/malformed_truncated_h264_transcode` | — | — | — | — | — |
| `robustness/edge_dims_1x1_decode` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | — | — | — |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | — | — |
| `robustness/edge_ts_pts_wraparound_demux` | — | — | — | — | — |
| `robustness/prop_gapless_sample_count_priming` | — | — | — | — | — |
| `robustness/edge_open_gop_bframes_decode` | — | — | — | — | — |
| `robustness/fuzz_adts_aac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_5_1_channels_probe` | — | — | — | — | — |
| `robustness/edge_zero_length_probe` | — | — | — | — | — |
| `transcode/negative_webp_to_video` | — | — | — | — | — |
| `robustness/edge_flac_with_seektable_probe` | — | — | — | — | — |
| `mux/neg_h264_into_ogg_illegal` | — | — | — | — | — |
| `robustness/edge_rotated_remux` | — | — | — | — | — |
| `robustness/edge_cbcs_boundary_decrypt` | — | — | — | — | — |
| `metadata/neg_garbled_id3_mp3_probe` | — | — | — | — | — |
| `transcode/mismatch_audio_only_to_video_target` | — | — | — | — | — |
| `robustness/prop_demux_mux_roundtrip_eq` | — | — | — | — | — |
| `transcode/mismatch_video_only_to_audio_target` | — | — | — | — | — |
| `robustness/prop_double_remux_stable` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | — | — | — | — | — |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | — | — | — | — |
| `remux/neg_zeroed_mp4_to_mkv` | — | — | — | — | — |
| `robustness/prop_trim_concatenation` | — | — | — | — | — |
| `robustness/prop_flac_seek_seektable_equiv` | — | — | — | — | — |
| `trim/robust_negative_start` | — | — | — | — | — |
| `robustness/edge_mislabeled_container_probe` | — | — | — | — | — |
| `robustness/image_jpeg_probe_na` | — | — | — | — | — |
| `robustness/fuzz_mp4_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_mp4_header_destroyed` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `robustness/edge_vfr_probe` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `transcode/extreme_resize_1x1` | — | — | — | — | — |
| `robustness/edge_extreme_fps_240_probe` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_remux` | — | — | — | — | — |
| `transcode/negative_jpeg_to_video` | — | — | — | — | — |
| `trim/robust_inverted_range` | — | — | — | — | — |
| `robustness/edge_gapless_priming_probe` | — | — | — | — | — |
| `transcode/malformed_zero_length_transcode` | — | — | — | — | — |
| `trim/robust_truncated_source` | — | — | — | — | — |
| `robustness/fuzz_remux_zeroed_spans` | — | — | — | — | — |
| `remux/neg_truncated_mp4_to_mkv` | — | — | — | — | — |
| `robustness/image_webp_probe_na` | — | — | — | — | — |
| `robustness/fuzz_flac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_video_only_probe` | — | — | — | — | — |
| `robustness/fuzz_webm_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_longform_probe` | — | — | — | — | — |
| `robustness/edge_dims_2x2_h264_probe` | — | — | — | — | — |
| `robustness/edge_fragmented_remux` | — | — | — | — | — |
| `robustness/edge_pcm_s24_decode` | — | — | — | — | — |
| `transcode/extreme_resize_0x0` | — | — | — | — | — |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | — | — | — | — | — |
| `robustness/edge_extreme_fps_1_probe` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | — | — | — | — |
| `robustness/prop_transcode_idempotent_dims_h264` | — | — | — | — | — |
| `robustness/edge_seek_negative` | — | — | — | — | — |

**`web-demuxer@4.0.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `decode-seek/seek_backward_then_forward` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `transcode/h264_resize_4k_to_1080p` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/multitrack_select_default_audio` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `transcode/selfcheck_h264_resize_720p_tie` | — | — | — | — | — |
| `transcode/flac_to_aac_mp4` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `decode-seek/decode_vp8` | 252.2 | 252.2 | — | 0 B | 339 |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `demux/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_180` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | 467.4 | 467.4 | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | — | — | — | — | — |
| `transcode/h264_resize_720p` | — | — | — | — | — |
| `decode-seek/meta_seek_vs_linear_decode` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | — | — | — | — | — |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | 322.4 | 322.4 | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `transcode/h264_rotate_normalize` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `transcode/h264_to_hevc_mp4` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `transcode/hevc_to_vp9_webm` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `transcode/wav_to_mp3_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp8_webm` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_2x2_h264` | — | — | — | — | — |
| `transcode/h264_two_pass_bitrate` | — | — | — | — | — |
| `decode-seek/decode_hevc` | — | — | — | — | — |
| `probe/huge_vp9_1080p_240s` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | 29.4 | 29.4 | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | 22 | 22 | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | 30.9 | 30.9 | — | — | — |
| `decode-seek/decode_mov_h264` | 1227.4 | 1227.4 | — | 0 B | 339 |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `decode-seek/seek_h264_keyframe` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | 33.4 | 33.4 | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `decode-seek/seek_av1_keyframe` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | 9.7 | 9.7 | — | — | — |
| `decode-seek/decode_multitrack_select_video` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | 301.2 | 301.2 | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `decode-seek/decode_bframes_reorder` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | 69.5 | 69.5 | — | — | 339 |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | — | — | — | — | — |
| `decode-seek/seek_repeated_same_target` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `decode-seek/decode_h264_10bit` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `decode-seek/decode_size_large_vp9_120s` | 1181.7 | 1181.7 | — | 0 B | 339 |
| `decode-seek/seek_h264_nonkeyframe` | — | — | — | — | — |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | 5442.7 | 5442.7 | — | 0 B | 339 |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `probe/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `transcode/vp9_to_h264_mp4` | — | — | — | — | — |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | — | — | — | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | 30.8 | 30.8 | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `decode-seek/decode_size_micro_h264_1frame` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/h264_ts` | 379.8 | 379.8 | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | 317.8 | 317.8 | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | 1160.3 | 1160.3 | — | 0 B | 0 |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `decode-seek/decode_mkv_h264` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | — | — | — | — | — |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | — | — | — | — | — |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `decode-seek/decode_size_large_h264_120s` | — | — | — | — | — |
| `transcode/gapless_pcm_to_aac_priming` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | — | — | — | — |
| `robustness/edge_no_media_tracks_probe` | — | — | — | — | — |
| `trim/robust_start_past_eof` | — | — | — | — | — |
| `robustness/prop_trim_additivity_compose` | — | — | — | — | — |
| `robustness/edge_pcm_s16be_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_truncated_mdat_graceful` | — | — | — | — | — |
| `robustness/fuzz_mp3_header_truncated_probe` | — | — | — | — | — |
| `trim/robust_bitflipped_source` | — | — | — | — | — |
| `robustness/edge_audio_only_probe` | — | — | — | — | — |
| `robustness/prop_remux_duration_preserved` | — | — | — | — | — |
| `robustness/edge_seek_past_eof` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `robustness/edge_audio_only_micro_probe` | — | — | — | — | — |
| `robustness/prop_duration_consistent_across_containers` | — | — | — | — | — |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | — | — | — | — |
| `robustness/fuzz_webm_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_zero_length` | — | — | — | — | — |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | — | — | — | — |
| `demux/graceful_webm_header_destroyed` | — | — | — | — | — |
| `robustness/fuzz_mux_target_corrupt_remux` | — | — | — | — | — |
| `robustness/edge_faststart_reserve_remux` | — | — | — | — | — |
| `robustness/edge_dims_1x1_probe` | — | — | — | — | — |
| `robustness/fuzz_truncated_h264_asset_demux` | — | — | — | — | — |
| `trim/robust_end_far_past_eof` | — | — | — | — | — |
| `robustness/edge_flac_without_seektable_probe` | — | — | — | — | — |
| `demux/graceful_truncated_h264` | — | — | — | — | — |
| `remux/neg_headerless_webm_to_mkv` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | — | — | — | — |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | — | — |
| `robustness/fuzz_mp4_bitflip_probe` | — | — | — | — | — |
| `robustness/image_png_probe_na` | — | — | — | — | — |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `transcode/mismatch_mislabeled_container_transcode` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_probe` | — | — | — | — | — |
| `robustness/edge_multitrack_demux` | — | — | — | — | — |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | — | — | — | — |
| `robustness/edge_video_only_micro_probe` | — | — | — | — | — |
| `transcode/negative_png_to_video` | — | — | — | — | — |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | — | — | — | — |
| `transcode/malformed_truncated_h264_transcode` | — | — | — | — | — |
| `robustness/edge_dims_1x1_decode` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | — | — | — |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | — | — |
| `robustness/edge_ts_pts_wraparound_demux` | — | — | — | — | — |
| `robustness/prop_gapless_sample_count_priming` | — | — | — | — | — |
| `robustness/edge_open_gop_bframes_decode` | — | — | — | — | — |
| `robustness/fuzz_adts_aac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_5_1_channels_probe` | — | — | — | — | — |
| `robustness/edge_zero_length_probe` | — | — | — | — | — |
| `transcode/negative_webp_to_video` | — | — | — | — | — |
| `robustness/edge_flac_with_seektable_probe` | — | — | — | — | — |
| `mux/neg_h264_into_ogg_illegal` | — | — | — | — | — |
| `robustness/edge_rotated_remux` | — | — | — | — | — |
| `robustness/edge_cbcs_boundary_decrypt` | — | — | — | — | — |
| `metadata/neg_garbled_id3_mp3_probe` | — | — | — | — | — |
| `transcode/mismatch_audio_only_to_video_target` | — | — | — | — | — |
| `robustness/prop_demux_mux_roundtrip_eq` | — | — | — | — | — |
| `transcode/mismatch_video_only_to_audio_target` | — | — | — | — | — |
| `robustness/prop_double_remux_stable` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | — | — | — | — | — |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | — |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | — | — | — | — |
| `remux/neg_zeroed_mp4_to_mkv` | — | — | — | — | — |
| `robustness/prop_trim_concatenation` | — | — | — | — | — |
| `robustness/prop_flac_seek_seektable_equiv` | — | — | — | — | — |
| `trim/robust_negative_start` | — | — | — | — | — |
| `robustness/edge_mislabeled_container_probe` | — | — | — | — | — |
| `robustness/image_jpeg_probe_na` | — | — | — | — | — |
| `robustness/fuzz_mp4_header_truncated_demux` | — | — | — | — | — |
| `demux/graceful_mp4_header_destroyed` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `robustness/edge_vfr_probe` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `transcode/extreme_resize_1x1` | — | — | — | — | — |
| `robustness/edge_extreme_fps_240_probe` | — | — | — | — | — |
| `robustness/edge_headerless_recorder_remux` | — | — | — | — | — |
| `transcode/negative_jpeg_to_video` | — | — | — | — | — |
| `trim/robust_inverted_range` | — | — | — | — | — |
| `robustness/edge_gapless_priming_probe` | — | — | — | — | — |
| `transcode/malformed_zero_length_transcode` | — | — | — | — | — |
| `trim/robust_truncated_source` | — | — | — | — | — |
| `robustness/fuzz_remux_zeroed_spans` | — | — | — | — | — |
| `remux/neg_truncated_mp4_to_mkv` | — | — | — | — | — |
| `robustness/image_webp_probe_na` | — | — | — | — | — |
| `robustness/fuzz_flac_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_video_only_probe` | — | — | — | — | — |
| `robustness/fuzz_webm_bitflip_probe` | — | — | — | — | — |
| `robustness/edge_longform_probe` | — | — | — | — | — |
| `robustness/edge_dims_2x2_h264_probe` | — | — | — | — | — |
| `robustness/edge_fragmented_remux` | — | — | — | — | — |
| `robustness/edge_pcm_s24_decode` | — | — | — | — | — |
| `transcode/extreme_resize_0x0` | — | — | — | — | — |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | — | — | — | — | — |
| `robustness/edge_extreme_fps_1_probe` | — | — | — | — | — |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | — | — | — | — |
| `robustness/prop_transcode_idempotent_dims_h264` | — | — | — | — | — |
| `robustness/edge_seek_negative` | — | — | — | — | — |


### 5. Δ vs reference (`mediabunny`)

| Scenario | aibrush-media@dev perf | aibrush-media@dev conf | ffmpeg.wasm@0.12.15 perf | ffmpeg.wasm@0.12.15 conf | mediabunny@1.48.0 perf | mediabunny@1.48.0 conf | mp4box@2.3.0 perf | mp4box@2.3.0 conf | platform@chrome-149 perf | platform@chrome-149 conf | remotion-media-parser@4.0.479 perf | remotion-media-parser@4.0.479 conf | remotion-webcodecs@4.0.479 perf | remotion-webcodecs@4.0.479 conf | web-demuxer@4.0.0 perf | web-demuxer@4.0.0 conf |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_half_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_backward_then_forward` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_decode_equals_stream_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vfr_timing` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_av1_mux_duration_webm_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_resize_4k_to_1080p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/bundle-size` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/convert-longtasks` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/upmix_mono_to_stereo` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_aiff_pcm_be_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_rotated90` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_stereo_to_mono` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_aes128` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_cbr_notoc` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/multitrack_select_default_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/selfcheck_h264_resize_720p_tie` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/flac_to_aac_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/huge_h264_mov_copy_peakmem` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_roundtrip_endianness_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_copy_lazyread` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_noseektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/micro_audio_short_mp4_to_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vp8` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_decode_mux_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_44k1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_trex_mp3` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-vfr-probe-duration` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_4k_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/video_plus_audio_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_10bit_to_h264_8bit` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_av1_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_minus6db_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-medium` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/wav_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_vfr_to_cfr_30` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/ladder_tiny_h264_360p_resize_180p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_rotate_180` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s24_to_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp4_tags` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_flip_vertical` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_seektable_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/vp8_720p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_in_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_packet_attribution_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/recorder_headerless` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_cbcs_decrypt` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_wav_pcm_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_seektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_ogg_vorbiscomment` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/large_h264_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_faststart_reserve` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_mp3_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_5_1_to_stereo` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_h264_1frame` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vorbis_to_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_large_vp9_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/realworld_mdn_flower_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_resize_720p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/meta_seek_vs_linear_decode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_alpha_to_vp9_keepalpha` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/swap_audio_video_with_opus_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_xing` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/vp9_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/ts_tiny_writes` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/opus` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/aac_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/roundtrip_leg2_vp9_to_h264` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_noop_full_range_idempotent` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_negative` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vp9` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_vod` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/av1_to_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_44k1_to_48k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/webm_headerless_live_stream` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_bframes_1080p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/fmp4_fragment_boundary_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_ttfb_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_multitrack_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_tiny_tiny_vp9_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/gapless_pcm_to_opus_priming` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tagedit_no_corrupt_audio_flac` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_in_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_rotate_90_dimswap` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_fps_15_to_30` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/massive_h264_1080p_2h` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/metamorphic_flac_seektable_invariance` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_rotate_normalize` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_mp3_to_mp4_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/buffer_massive_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/aac_to_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_no_tags_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_hevc_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp8_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_bframes_1080p_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_vp9_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_8bit_to_hevc_10bit` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/metamorphic_resize_same_1080p_idempotent` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_fragmented_cmaf` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16be_to_s16le` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_webm_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_mp3_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_vp8_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_tiny_dims_2x2_h264` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_two_pass_bitrate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_hevc` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/huge_vp9_1080p_240s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_f32_to_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_mkv_h264_keyframe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/webm_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_bitrate_2mbps` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp8_to_vp9_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/convert-webm-resize-320x180` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/encode-fps` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/wav_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hevc_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/audio_only_aac_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_opus_ogg_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_open_gop_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_progressive_buffer` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_single_gop_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_attribution_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/wav_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/av_downmix_stereo_to_mono` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/decode-fps` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/aac_adts_adts_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_30s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_mov_h264` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp3_id3` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_flower_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/meta_consistent_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_fps_30_to_15` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_massive_massive_h264_1080p_2h` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_h264_keyframe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_fragmented_cmaf` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fade_in_out_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/video_a_plus_audio_b_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_xing` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/drop_audio_track_subset_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_fragmented_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_massive_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_h264_1frame` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/mp3_xing_mp3_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_flip_horizontal` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_ts_to_mp4_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/unencrypted_left_untouched_noop` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mkv_tags` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_ts_stream_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_av1_keyframe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/convert-peak-memory` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_buffer_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/massive_h264_copy_sustained` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_variable_channel_count_downmix` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/tiny_h264_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/av1_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/aac_adts_adts_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-demux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/seek-ms` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/mp3_xing_mp3_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_flac_vorbiscomment` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_mux_duration_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/bframe_reorder_h264_to_vp9` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_alpha_to_vp8_keepalpha` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_audio_short` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_to_eof_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_rotated90_mp4_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/rotation_survives_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_vfr` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/hevc_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_multitrack_select_video` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/rotation_decode_read_h264_rotated90` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/opus_to_aac_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_rotated90` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/mp3_to_aac_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_h264_first_frames` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-vfr-iterate-packets` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_vfr` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/fanout_h264_abr_ladder` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-decode-remux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_past_eof` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_in_memory` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_alpha_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_tiny_dims_1x1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_huge_huge_h264_1080p_600s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/flac_seektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_bframes_reorder` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_tiny_tiny_h264_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_mux_duration_mp4_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_vp9_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_tiny_h264_360p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_multitrack_keep_all_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_cbr_notoc` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_crop_center` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vp8_keyframe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_noseektable_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-massive` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/opus` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_hevc_keyframe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_decode_equals_buffer_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/aac_to_pcm_wav_extract` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/three_track_assembly_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_av1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_start_zero_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/hdr10_to_sdr_tonemap` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/cenc_cbcs` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_tiny_vp9_360p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_repeated_same_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/mp3_to_opus_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/metamorphic-recorder-headerless-sane-duration` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_bframes_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/big_buck_bunny_1080p_h264` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_frame_accurate_throughput` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_vorbis_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_multitrack_survives_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_zero` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-tiny` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_h264_10bit` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_flower_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-transcode-webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_rotate_270_dimswap` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/ts_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_gapless_aac_decode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-large4k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-transcode-idempotent-source-res` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_idempotent_resample_same_rate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/mkv_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_vp9_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_longform_audio_resample_16k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_large_vp9_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_h264_nonkeyframe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/longform_1h_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_h264_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_multitrack_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_recorder_headerless_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/tiny_vp9_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_fps_240` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_h264_4k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/realworld_mdn_flower_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-tiny` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/av1_720p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-probe-duration-cross-container` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_extreme_fps_1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_no_tags_recorder_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/empty_audio_zero_packets` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_to_vp8_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_reserve` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/aac_to_opus_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-remux-mp4-to-mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_webm_headerless_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/meta_pts_monotonic_after_reorder` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/ts_continuity_many_writes` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vp9_keyframe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_flac_seektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/metamorphic-duration-across-containers` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/av1_opus_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_rotated_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/flac_to_mkv_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_audio_short` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_to_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vp9_alpha` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-medium` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/upmix_stereo_to_5_1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24be_to_s16le` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_opus_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_rotation_survives_mp4_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/empty-audio-wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/bframe_reorder_h264_to_h264` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/aac_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_longform_audio_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_micro_h264_1frame` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_in_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/extract-metadata` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_huge_h264_mov_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-massive` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_hevc_decode_mux_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_av1_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/pcm_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_30s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/cenc_ctr` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/flac_to_opus_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_fps_30_to_60` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/mov_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp8_720p_10s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_30s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16le_to_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp9_alpha` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_ttfb_buffer_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_rotated_display_matrix` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-massive` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp4_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp3` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_colorspace_709_to_2020` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_roundtrip_mp4_mkv_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_vp8_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_flac` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/large_vp9_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/hls_aes128` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_longform_audio_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_huge_h264_600s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_16k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/perf_cenc_ctr_decrypt_throughput` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s16_to_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_opus` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_mkv_h264` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp8_720p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_aac_adts_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_f32_to_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_tiny_360p_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_extreme_fps_240` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_crf_quality_mode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16_to_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_vp9_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/huge_h264_1080p_600s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_hevc_decode_mux_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/aiff_container_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_aac_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/flac_noseektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/realworld_mdn_trex_mp3` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_fragmented_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-large4k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_buffer_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt_eq_cleartext` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned_short` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_reserve_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vfr_arbitrary` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/aac_to_mp3_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_bframes_midgop` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_4k_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/hls_vod` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_pcm_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/caf_container_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/pcm_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_bframes_1080p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_opus_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_to_av1_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large4k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_fps_1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/iterate-video-packets` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_vfr_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_open_gop_first_frame` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_adts_to_mp4_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/av1_to_vp9_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/massive_vp9_1080p_2h` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_mp3_xing` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp9_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_noop_full_range_idempotent` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/vp9_alpha` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_large_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/roundtrip_leg1_h264_to_vp9` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_subframe_range_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/av1_720p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_stream_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp8_to_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_video_plus_opus_audio_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_large_h264_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/gapless_pcm_to_aac_priming` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_no_media_tracks_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_start_past_eof` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_trim_additivity_compose` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_pcm_s16be_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_truncated_mdat_graceful` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_mp3_header_truncated_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_bitflipped_source` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_audio_only_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_remux_duration_preserved` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_seek_past_eof` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/truncated-header-graceful` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_audio_only_micro_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_duration_consistent_across_containers` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_senc_bitflip_graceful` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_webm_header_truncated_demux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/graceful_zero_length` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_ts_zeroed_spans_demux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/graceful_webm_header_destroyed` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_mux_target_corrupt_remux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_faststart_reserve_remux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_dims_1x1_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_truncated_h264_asset_demux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_end_far_past_eof` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_flac_without_seektable_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/graceful_truncated_h264` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/neg_headerless_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/neg_garbled_ilst_mp4_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_mp4_bitflip_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/image_png_probe_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_cens_decrypt_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/mismatch_mislabeled_container_transcode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_headerless_recorder_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_multitrack_demux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_mp4_tail_truncated_demux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_video_only_micro_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/negative_png_to_video` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_mp4_zeroed_spans_decode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/malformed_truncated_h264_transcode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_dims_1x1_decode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_empty_audio_transcode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fuzz_wav_bitflip_decode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_sample_aes_decrypt_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/negative_image_into_audio_transcode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_vp9_into_adts_illegal` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_ts_pts_wraparound_demux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_gapless_sample_count_priming` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_open_gop_bframes_decode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_adts_aac_bitflip_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_5_1_channels_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_zero_length_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/negative_webp_to_video` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_flac_with_seektable_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_h264_into_ogg_illegal` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_rotated_remux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_cbcs_boundary_decrypt` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/neg_garbled_id3_mp3_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/mismatch_audio_only_to_video_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_demux_mux_roundtrip_eq` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/mismatch_video_only_to_audio_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_double_remux_stable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/clearkey_decrypt_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_protection_zeroed_graceful` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/neg_zeroed_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_trim_concatenation` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_flac_seek_seektable_equiv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_negative_start` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_mislabeled_container_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/image_jpeg_probe_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_mp4_header_truncated_demux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/graceful_mp4_header_destroyed` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_h264_into_wav_illegal` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_vfr_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_zero_length_range` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_resize_1x1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_extreme_fps_240_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_headerless_recorder_remux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/negative_jpeg_to_video` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_inverted_range` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_gapless_priming_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/malformed_zero_length_transcode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_truncated_source` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_remux_zeroed_spans` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/neg_truncated_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/image_webp_probe_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_flac_bitflip_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_video_only_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_webm_bitflip_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_longform_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_dims_2x2_h264_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_fragmented_remux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_pcm_s24_decode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_resize_0x0` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_extreme_fps_1_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fuzz_wav_header_truncated_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_transcode_idempotent_dims_h264` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_seek_negative` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

## 5. Per-engine scorecard

| Engine | Conformance % | Pass / applicable | Perf idx (chromium) | Capability breadth | Robustness % |
| --- | --- | --- | --- | --- | --- |
| `aibrush-media@dev` | 0% | 0 / 0 | — | 0 (—) | 0% (0/40) |
| `ffmpeg.wasm@0.12.15` | 100% | 424 / 424 | — | 13 (audio-dsp, decode-seek, demux, encryption, metadata, mux, performance, probe, remux, robustness, streaming-output, transcode, trim) | 86.8% (33/38) |
| `mediabunny@1.48.0` | 100% | 427 / 427 | — | 13 (audio-dsp, decode-seek, demux, encryption, metadata, mux, performance, probe, remux, robustness, streaming-output, transcode, trim) | 88.9% (32/36) |
| `mp4box@2.3.0` | 100% | 103 / 103 | — | 8 (demux, metadata, mux, performance, probe, remux, robustness, streaming-output) | 40.5% (17/42) |
| `platform@chrome-149` | 100% | 143 / 143 | — | 8 (audio-dsp, decode-seek, demux, metadata, performance, probe, robustness, transcode) | 43.8% (14/32) |
| `remotion-media-parser@4.0.479` | 100% | 134 / 134 | — | 6 (audio-dsp, demux, metadata, performance, probe, robustness) | 60% (24/40) |
| `remotion-webcodecs@4.0.479` | 100% | 223 / 223 | — | 9 (audio-dsp, decode-seek, demux, metadata, performance, probe, remux, robustness, transcode) | 63.4% (26/41) |
| `web-demuxer@4.0.0` | 100% | 134 / 134 | — | 6 (decode-seek, demux, metadata, performance, probe, robustness) | 46.7% (14/30) |

_Perf index = geometric mean of throughput ratios vs reference, per browser, over co-passing scenarios. >1.00× = faster than reference on average; null/— = no co-passing scenario to compare._

## Caveats (read before quoting any number)

- Browser numbers are INDICATIVE only. They depend on GPU, OS, drivers, and thermal state; a measurement made on one machine does not transfer to another.
- NEVER compare a raw number across browsers or across machines. Every delta in this report is "vs the reference engine, on the SAME browser, on the same corpus." Cross-browser comparison is invalid by construction — that is why the report is grouped by browser.
- Hardware codec sessions are the real parallelism ceiling, not navigator.hardwareConcurrency. Contention for a limited number of hardware decode/encode sessions can dominate timing for codec-bound workloads.
- No measurement -> no claim. No green correctness oracle -> no admissible benchmark: a perf number is reported only after the engine produced correct output for that engine x browser x scenario. A speedup with wrong output is a regression, not a win.
- N/A = not supported by the framework, browser/runtime, or currently available corpus assets. The machine-readable report.json keeps the internal not-applicable statuses distinct; the human-facing table intentionally folds them into one marker.
- Runs assume AC power and a quiesced machine. Differences within the noise band are reported as within-noise and are NOT claimed as improvements or regressions.
