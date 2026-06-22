# Browser Media-Engine Benchmark Report

Reference engine: `mediabunny` · Suite 0.1.0 · Generated 2026-06-22T11:07:34.091Z

Engines: `aibrush-media@dev`, `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `mp4box@2.3.0`, `platform@chrome-149`, `remotion-media-parser@4.0.479`, `remotion-webcodecs@4.0.479`, `web-demuxer@4.0.0` · Browsers: chromium · Scenarios: 558

All deltas are **within a single browser, vs the reference engine, on the same corpus.** Numbers are never compared across browsers (see Caveats).

> **Reading the matrix:** every completed cell shows **Pass (<execution time>)** when the operation ran correctly, or **N/A** when the engine or browser/runtime cannot support that case. Machine-readable `report.json` keeps the internal status distinction.

## 🏆 Leaderboard

| # | Engine | Wins | Conf % | Robust % | Bundle | Breadth | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `mediabunny@1.48.0` | 272 (25 unc.) | 100% | 93.3% | 165.2 kB | 13 | 272 wins (247 contested, 25 uncontested) · perf 0.7× vs winners · 100% conformant · 93.3% robust · 165.2 kB bundle |
| 2 | `ffmpeg.wasm@0.12.15` | 135 (39 unc.) | 100% | 91.7% | 1.4 kB | 13 | 135 wins (96 contested, 39 uncontested) · perf 0.35× vs winners · 100% conformant · 91.7% robust · 1.4 kB bundle |
| 3 | `remotion-webcodecs@4.0.479` | 45 | 100% | 70% | 94 kB | 9 | 45 wins · perf 0.26× vs winners · 100% conformant · 70% robust · 94 kB bundle |
| 4 | `remotion-media-parser@4.0.479` | 23 | 100% | 56.7% | 72.6 kB | 6 | 23 wins · perf 0.34× vs winners · 100% conformant · 56.7% robust · 72.6 kB bundle |
| 5 | `platform@chrome-149` | 17 (2 unc.) | 100% | 46.7% | 0 kB | 8 | 17 wins (15 contested, 2 uncontested) · perf 0.24× vs winners · 100% conformant · 46.7% robust · 0 kB bundle |
| 6 | `web-demuxer@4.0.0` | 11 | 100% | 50% | 43.2 kB | 6 | 11 wins · perf 0.2× vs winners · 100% conformant · 50% robust · 43.2 kB bundle |
| 7 | `mp4box@2.3.0` | 10 | 100% | 36.7% | 41.3 kB | 8 | 10 wins · perf 0.16× vs winners · 100% conformant · 36.7% robust · 41.3 kB bundle |
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
| `streaming-output/mp4_faststart_none_control` | throughputRealtime (x-realtime) | N/A | Pass (98.69 ms) | Pass (282 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_half_f32` | throughputRealtime (x-realtime) | N/A | Pass (14.15 ms) | Pass (24.47 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_backward_then_forward` | seekMs (ms) | N/A | Pass (97.58 ms) | Pass (27.67 ms) | N/A | Pass (77.38 ms) | N/A | Pass (1.57 s) | Pass (95.28 ms) |
| `streaming-output/prop_decode_equals_stream_shape` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vfr_timing` | decodeFps (fps) | N/A | Pass (634 ms) | Pass (535 ms) | N/A | Pass (536 ms) | N/A | Pass (483 ms) | Pass (675 ms) |
| `mux/prop_av1_mux_duration_webm_to_mp4` | wall (ms) | N/A | N/A | Pass (16.4 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_frame_accurate` | throughputRealtime (x-realtime) | N/A | Pass (12.81 s) | Pass (649 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mov` | throughputRealtime (x-realtime) | N/A | Pass (43.47 ms) | Pass (95.72 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_resize_4k_to_1080p` | decodeFps (fps) | N/A | Pass (37.41 s) | Pass (984 ms) | N/A | N/A | N/A | Pass (1.53 s) | N/A |
| `performance/bundle-size` | bundleSize (kB) | N/A | Pass (1.64 s) | Pass (1.53 s) | Pass (1.51 s) | Pass (1.53 s) | Pass (1.52 s) | Pass (1.52 s) | Pass (1.59 s) |
| `performance/convert-longtasks` | longtasks (ms) | N/A | N/A | Pass (3.48 s) | N/A | N/A | N/A | Pass (5.89 s) | N/A |
| `audio-dsp/upmix_mono_to_stereo` | throughputRealtime (x-realtime) | N/A | Pass (29.66 ms) | Pass (52.03 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_aiff_pcm_be_copy` | throughputRealtime (x-realtime) | N/A | Pass (6.16 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | framesPerSec (fps) | N/A | N/A | Pass (7.92 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_rotated90` | wall (ms) | N/A | Pass (15.63 ms) | Pass (1.57 ms) | Pass (37.06 ms) | Pass (16.81 ms) | Pass (1.54 ms) | Pass (5.33 ms) | Pass (19.55 ms) |
| `audio-dsp/downmix_stereo_to_mono` | throughputRealtime (x-realtime) | N/A | Pass (25.49 ms) | Pass (32.61 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_aes128` | wall (ms) | N/A | Pass (135 ms) | Pass (111 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (78.46 ms) | Pass (19.5 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | framesPerSec (fps) | N/A | Pass (180 s) | Pass (13.68 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_cbr_notoc` | wall (ms) | N/A | Pass (23.81 ms) | Pass (4.76 ms) | N/A | N/A | Pass (7.5 ms) | Pass (6.17 ms) | N/A |
| `transcode/multitrack_select_default_audio` | decodeFps (fps) | N/A | Pass (11.79 s) | Pass (675 ms) | N/A | N/A | N/A | Pass (105 ms) | N/A |
| `mux/edge_bframes_decode_mux_mkv` | wall (ms) | N/A | Pass (121 ms) | Pass (20.54 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/selfcheck_h264_resize_720p_tie` | framesPerSec (fps) | N/A | Pass (47.64 s) | Pass (2.87 s) | N/A | N/A | N/A | Pass (2.61 s) | N/A |
| `transcode/flac_to_aac_mp4` | throughputRealtime (x-realtime) | N/A | Pass (255 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/huge_h264_mov_copy_peakmem` | peakMemory (bytes) | N/A | Pass (611 ms) | Pass (655 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_roundtrip_endianness_s16` | wall (ms) | N/A | Pass (24.5 ms) | Pass (4.69 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_copy_lazyread` | sourceReads (count) | N/A | Pass (152 ms) | Pass (674 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_noseektable` | wall (ms) | N/A | Pass (2.29 ms) | Pass (1.54 ms) | N/A | N/A | Pass (1.32 ms) | Pass (2.03 ms) | N/A |
| `remux/micro_audio_short_mp4_to_adts` | throughputRealtime (x-realtime) | N/A | Pass (3.97 ms) | Pass (5.31 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vp8` | decodeFps (fps) | N/A | Pass (319 ms) | Pass (303 ms) | N/A | Pass (231 ms) | N/A | Pass (322 ms) | Pass (257 ms) |
| `mux/prop_vp9_decode_mux_webm_to_webm` | wall (ms) | N/A | Pass (98.97 ms) | Pass (22.72 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_44k1` | throughputRealtime (x-realtime) | N/A | Pass (29.96 ms) | Pass (36.15 ms) | N/A | N/A | N/A | Pass (35.29 ms) | N/A |
| `demux/realworld_mdn_trex_mp3` | wall (ms) | N/A | Pass (10.54 ms) | Pass (1.94 ms) | N/A | N/A | Pass (4.02 ms) | Pass (1.97 ms) | N/A |
| `performance/metamorphic-vfr-probe-duration` | opsPerSec (ops/s) | N/A | Pass (12.89 ms) | Pass (1.82 ms) | Pass (7.52 ms) | Pass (13.44 ms) | Pass (3.62 ms) | Pass (14.32 ms) | Pass (21.73 ms) |
| `probe/h264_4k_10s` | wall (ms) | N/A | Pass (64.56 ms) | Pass (2.28 ms) | Pass (34.75 ms) | Pass (44.79 ms) | Pass (2.15 ms) | Pass (3.65 ms) | Pass (56.18 ms) |
| `mux/video_plus_audio_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (182 ms) | Pass (45.89 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_10bit_to_h264_8bit` | decodeFps (fps) | N/A | Pass (11.63 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_av1_webm` | decodeFps (fps) | N/A | N/A | Pass (2.29 s) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_minus6db_s16` | throughputRealtime (x-realtime) | N/A | Pass (20.59 ms) | Pass (30 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-medium` | packetsPerSec (packets/s) | N/A | Pass (74.46 ms) | Pass (29.69 ms) | Pass (50.53 ms) | Pass (56.28 ms) | Pass (4.96 ms) | Pass (1.2 s) | Pass (4.6 ms) |
| `probe/wav_s16` | wall (ms) | N/A | Pass (10.8 ms) | Pass (18.69 ms) | N/A | Pass (9.07 ms) | Pass (2.51 ms) | Pass (2.08 ms) | N/A |
| `transcode/h264_vfr_to_cfr_30` | decodeFps (fps) | N/A | Pass (7.91 s) | Pass (739 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (65.08 ms) | Pass (16.96 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_s16` | throughputRealtime (x-realtime) | N/A | Pass (12.54 ms) | Pass (20.61 ms) | N/A | N/A | N/A | Pass (32.99 ms) | N/A |
| `transcode/ladder_tiny_h264_360p_resize_180p` | framesPerSec (fps) | N/A | Pass (308 ms) | Pass (204 ms) | N/A | N/A | N/A | Pass (204 ms) | N/A |
| `probe/perf-extract-metadata-huge` | opsPerSec (ops/s) | N/A | Pass (644 ms) | Pass (9.9 ms) | Pass (672 ms) | Pass (689 ms) | Pass (7.9 ms) | Pass (7.3 ms) | Pass (54.82 ms) |
| `transcode/h264_rotate_180` | decodeFps (fps) | N/A | Pass (70.98 s) | Pass (2.67 s) | N/A | N/A | N/A | Pass (4.07 s) | N/A |
| `remux/h264_1080p_30s_mp4_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (163 ms) | Pass (361 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s24_to_wav` | throughputRealtime (x-realtime) | N/A | Pass (14.16 ms) | Pass (6.67 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp4_tags` | wall (ms) | N/A | Pass (112 ms) | Pass (317 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_flip_vertical` | decodeFps (fps) | N/A | Pass (71.94 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mov` | wall (ms) | N/A | Pass (188 ms) | Pass (92.03 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_seektable_copy` | throughputRealtime (x-realtime) | N/A | Pass (8.66 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (22.08 ms) | Pass (8.01 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/vp8_720p_10s` | wall (ms) | N/A | Pass (7.68 ms) | Pass (5.87 ms) | N/A | Pass (8.17 ms) | Pass (9.85 ms) | Pass (12.87 ms) | Pass (7.56 ms) |
| `demux/h264_in_mkv` | wall (ms) | N/A | Pass (41.43 ms) | Pass (9.13 ms) | N/A | Pass (15.91 ms) | Pass (77.7 ms) | Pass (62.57 ms) | Pass (425 ms) |
| `demux/wav_s16` | wall (ms) | N/A | Pass (19.02 ms) | Pass (6.45 ms) | N/A | Pass (6.34 ms) | Pass (3.03 ms) | Pass (6.16 ms) | N/A |
| `metadata/tracks_packet_attribution_multitrack` | packetsPerSec (packets/s) | N/A | Pass (33.01 ms) | Pass (10.38 ms) | Pass (25.03 ms) | Pass (17.29 ms) | Pass (95.41 ms) | Pass (68.91 ms) | Pass (526 ms) |
| `probe/recorder_headerless` | wall (ms) | N/A | Pass (2.79 ms) | Pass (1.92 ms) | N/A | Pass (4.21 ms) | Pass (12.31 ms) | Pass (11.01 ms) | Pass (8.19 ms) |
| `encryption/cenc_cbcs_decrypt` | throughputRealtime (x-realtime) | N/A | N/A | Pass (51.38 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | wall (ms) | N/A | Pass (248 ms) | Pass (34.18 ms) | N/A | Pass (47.25 ms) | N/A | Pass (282 ms) | Pass (109 ms) |
| `remux/av1_720p_5s_webm_to_mp4` | throughputRealtime (x-realtime) | N/A | N/A | Pass (6.96 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_wav_pcm_copy` | throughputRealtime (x-realtime) | N/A | Pass (32.4 ms) | Pass (3.35 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_seektable` | wall (ms) | N/A | Pass (2.44 ms) | Pass (1.2 ms) | N/A | N/A | Pass (3.86 ms) | Pass (3.39 ms) | N/A |
| `metadata/write_ogg_vorbiscomment` | wall (ms) | N/A | Pass (7.15 ms) | Pass (5.41 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/large_h264_1080p_120s` | wall (ms) | N/A | Pass (125 ms) | Pass (2.47 ms) | Pass (160 ms) | Pass (166 ms) | Pass (6.31 ms) | Pass (7.56 ms) | Pass (27.51 ms) |
| `mux/mp4_faststart_reserve` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_mp3_copy` | throughputRealtime (x-realtime) | N/A | Pass (4.45 ms) | Pass (2.55 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_5_1_to_stereo` | throughputRealtime (x-realtime) | N/A | Pass (52.36 ms) | Pass (115 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_h264_1frame` | wall (ms) | N/A | Pass (5.79 ms) | Pass (9.61 ms) | Pass (3.39 ms) | Pass (2.81 ms) | Pass (3.21 ms) | Pass (6.05 ms) | Pass (12.25 ms) |
| `mux/vorbis_to_ogg` | throughputRealtime (x-realtime) | N/A | Pass (31.96 ms) | Pass (6.87 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_webm` | throughputRealtime (x-realtime) | N/A | Pass (5.85 ms) | Pass (10.06 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_large_vp9_webm` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/realworld_mdn_flower_webm` | wall (ms) | N/A | Pass (3.53 ms) | Pass (2.48 ms) | N/A | Pass (5.34 ms) | Pass (9.15 ms) | Pass (4.88 ms) | Pass (8.09 ms) |
| `transcode/h264_resize_720p` | decodeFps (fps) | N/A | Pass (47.94 s) | Pass (2.17 s) | N/A | N/A | N/A | Pass (3.73 s) | N/A |
| `decode-seek/meta_seek_vs_linear_decode` | wall (ms) | N/A | Pass (90.63 ms) | Pass (24.48 ms) | N/A | Pass (65.07 ms) | N/A | Pass (3.48 s) | Pass (88.86 ms) |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | wall (ms) | N/A | Pass (26.32 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_alpha_to_vp9_keepalpha` | decodeFps (fps) | N/A | N/A | Pass (596 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | wall (ms) | N/A | Pass (180 ms) | Pass (49.1 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/swap_audio_video_with_opus_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (359 ms) | Pass (59.59 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_xing` | wall (ms) | N/A | Pass (2.64 ms) | Pass (2 ms) | N/A | N/A | Pass (3.66 ms) | Pass (2.38 ms) | N/A |
| `probe/vp9_1080p_10s` | wall (ms) | N/A | Pass (32.91 ms) | Pass (12.22 ms) | N/A | Pass (33.33 ms) | Pass (14.31 ms) | Pass (13.33 ms) | Pass (36.78 ms) |
| `streaming-output/ts_tiny_writes` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/opus` | wall (ms) | N/A | Pass (6.88 ms) | Pass (4.64 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/aac_adts` | wall (ms) | N/A | Pass (3.78 ms) | Pass (2.13 ms) | N/A | N/A | Pass (12 ms) | Pass (20.7 ms) | N/A |
| `transcode/roundtrip_leg2_vp9_to_h264` | decodeFps (fps) | N/A | Pass (24.39 s) | Pass (970 ms) | N/A | N/A | N/A | Pass (936 ms) | N/A |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | wall (ms) | N/A | Pass (131 ms) | Pass (560 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_noop_full_range_idempotent` | throughputRealtime (x-realtime) | N/A | Pass (68.22 ms) | Pass (22.55 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_negative` | seekMs (ms) | N/A | Pass (84.13 ms) | Pass (25.17 ms) | N/A | Pass (76.08 ms) | N/A | Pass (1.09 s) | Pass (77.72 ms) |
| `remux/av1_720p_5s_webm_to_webm` | throughputRealtime (x-realtime) | N/A | N/A | Pass (7.66 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vp9` | decodeFps (fps) | N/A | Pass (791 ms) | Pass (561 ms) | N/A | Pass (631 ms) | N/A | Pass (483 ms) | Pass (644 ms) |
| `demux/hls_vod` | wall (ms) | N/A | Pass (49.49 ms) | Pass (49.37 ms) | N/A | N/A | Pass (280 ms) | Pass (313 ms) | N/A |
| `transcode/av1_to_h264_mp4` | decodeFps (fps) | N/A | N/A | Pass (367 ms) | N/A | N/A | N/A | Pass (308 ms) | N/A |
| `remux/h264_1080p_5s_mov_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (43.35 ms) | Pass (38.27 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_44k1_to_48k` | throughputRealtime (x-realtime) | N/A | Pass (43.81 ms) | Pass (56.78 ms) | N/A | N/A | N/A | Pass (86.14 ms) | N/A |
| `streaming-output/webm_headerless_live_stream` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_bframes_1080p` | wall (ms) | N/A | Pass (33.07 ms) | Pass (1.92 ms) | Pass (25.68 ms) | Pass (45.97 ms) | Pass (10 ms) | Pass (5.36 ms) | Pass (25.75 ms) |
| `trim/fmp4_fragment_boundary_copy` | throughputRealtime (x-realtime) | N/A | Pass (71.88 ms) | Pass (670 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_ttfb_streaming_target` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_5s` | wall (ms) | N/A | Pass (20.56 ms) | Pass (2.82 ms) | Pass (18.09 ms) | Pass (13.95 ms) | Pass (4.95 ms) | Pass (6.37 ms) | Pass (26.37 ms) |
| `remux/h264_in_mkv_mkv_to_ts` | throughputRealtime (x-realtime) | N/A | Pass (65.16 ms) | Pass (25.03 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mov` | wall (ms) | N/A | Pass (50.46 ms) | Pass (18.04 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_multitrack_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | Pass (72.23 ms) | Pass (375 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_tiny_tiny_vp9_360p_2s` | wall (ms) | N/A | Pass (7.08 ms) | Pass (2.91 ms) | N/A | Pass (4.93 ms) | Pass (10.16 ms) | Pass (9.66 ms) | Pass (35.13 ms) |
| `transcode/gapless_pcm_to_opus_priming` | wall (ms) | N/A | N/A | Pass (41.07 ms) | N/A | N/A | N/A | Pass (70.66 ms) | N/A |
| `metadata/tagedit_no_corrupt_audio_flac` | wall (ms) | N/A | Pass (5.38 ms) | Pass (2.53 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_in_mkv` | wall (ms) | N/A | Pass (34.07 ms) | Pass (7.27 ms) | N/A | Pass (15.29 ms) | Pass (10.75 ms) | Pass (18.25 ms) | Pass (55.22 ms) |
| `streaming-output/mp4_streaming_target` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_ogg` | throughputRealtime (x-realtime) | N/A | Pass (11.65 ms) | Pass (7.18 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_rotate_90_dimswap` | decodeFps (fps) | N/A | Pass (71.29 s) | Pass (2.63 s) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_fps_15_to_30` | decodeFps (fps) | N/A | Pass (7.9 s) | Pass (763 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-huge` | peakMemory (bytes) | N/A | Pass (1.02 s) | Pass (883 ms) | Pass (803 ms) | Pass (807 ms) | Pass (71.61 s) | Pass (5.81 ms) | Pass (8.01 ms) |
| `probe/massive_h264_1080p_2h` | wall (ms) | N/A | Pass (2.41 s) | Pass (24.8 ms) | Pass (1.62 s) | Pass (2.54 s) | Pass (45.6 ms) | Pass (46.44 ms) | Pass (296 ms) |
| `demux/metamorphic_flac_seektable_invariance` | wall (ms) | N/A | Pass (6.7 ms) | Pass (2.55 ms) | N/A | N/A | Pass (9.38 ms) | Pass (8.64 ms) | N/A |
| `performance/size-ladder-demux-peak-memory-large` | peakMemory (bytes) | N/A | Pass (278 ms) | Pass (163 ms) | Pass (211 ms) | Pass (188 ms) | Pass (5.98 s) | Pass (5.45 s) | Pass (6.24 s) |
| `transcode/h264_rotate_normalize` | decodeFps (fps) | N/A | Pass (11.36 s) | Pass (630 ms) | N/A | N/A | N/A | Pass (79.2 ms) | N/A |
| `remux/prop_mp3_to_mp4_duration_invariant` | wall (ms) | N/A | Pass (15.2 ms) | Pass (3.74 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/buffer_massive_h264_mp4` | peakMemory (bytes) | N/A | Pass (6.48 s) | Pass (23.82 s) | Pass (5.65 s) | N/A | N/A | SKIPPED | N/A |
| `mux/aac_to_adts` | throughputRealtime (x-realtime) | N/A | Pass (14.46 ms) | Pass (2.93 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_no_tags_wav` | wall (ms) | N/A | Pass (9.85 ms) | Pass (5.45 ms) | N/A | Pass (4.47 ms) | Pass (2.84 ms) | Pass (2.12 ms) | N/A |
| `transcode/h264_to_hevc_mp4` | decodeFps (fps) | N/A | N/A | Pass (2.84 s) | N/A | N/A | N/A | Pass (6.27 s) | N/A |
| `trim/vp8_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | Pass (12.89 ms) | Pass (361 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_bframes_1080p_mp4_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (73.08 ms) | Pass (113 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_vp9_webm` | decodeFps (fps) | N/A | N/A | Pass (1.33 s) | N/A | N/A | N/A | Pass (1.74 s) | N/A |
| `audio-dsp/throughput_encode_s24` | framesPerSec (fps) | N/A | Pass (23.31 ms) | Pass (20.32 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_8bit_to_hevc_10bit` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/metamorphic_resize_same_1080p_idempotent` | decodeFps (fps) | N/A | Pass (69.39 s) | Pass (2.85 s) | N/A | N/A | N/A | Pass (1.18 s) | N/A |
| `streaming-output/mp4_fragmented_cmaf` | throughputRealtime (x-realtime) | N/A | Pass (113 ms) | Pass (588 ms) | Pass (114 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16be_to_s16le` | throughputRealtime (x-realtime) | N/A | Pass (12.81 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_webm_audio` | throughputRealtime (x-realtime) | N/A | Pass (10.84 ms) | Pass (5.94 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_mp3_mp4` | throughputRealtime (x-realtime) | N/A | Pass (65.06 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_ts` | throughputRealtime (x-realtime) | N/A | Pass (39.29 ms) | Pass (51.13 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_vp8_webm` | decodeFps (fps) | N/A | Pass (1.33 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_tiny_dims_2x2_h264` | decodeFps (fps) | N/A | Pass (5.35 ms) | Pass (2.51 ms) | N/A | Pass (3.31 ms) | N/A | Pass (4.19 ms) | Pass (8.19 ms) |
| `transcode/h264_two_pass_bitrate` | decodeFps (fps) | N/A | Pass (80.68 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_hevc` | decodeFps (fps) | N/A | Pass (1.02 s) | Pass (560 ms) | N/A | Pass (571 ms) | N/A | Pass (736 ms) | Pass (633 ms) |
| `probe/huge_vp9_1080p_240s` | wall (ms) | N/A | Pass (298 ms) | Pass (12.72 ms) | N/A | Pass (427 ms) | Pass (284 ms) | Pass (230 ms) | Pass (39.67 ms) |
| `mux/pcm_f32_to_wav` | throughputRealtime (x-realtime) | N/A | Pass (14.29 ms) | Pass (4.41 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-probe` | opsPerSec (ops/s) | N/A | Pass (49.91 ms) | Pass (2.12 ms) | Pass (57.09 ms) | Pass (58.57 ms) | Pass (2.53 ms) | Pass (3.59 ms) | Pass (23.17 ms) |
| `decode-seek/seek_mkv_h264_keyframe` | seekMs (ms) | N/A | Pass (258 ms) | Pass (18.26 ms) | N/A | Pass (46.66 ms) | N/A | Pass (314 ms) | Pass (119 ms) |
| `streaming-output/webm_streaming_target` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_bitrate_2mbps` | decodeFps (fps) | N/A | Pass (58.1 s) | Pass (2.73 s) | N/A | N/A | N/A | Pass (5 s) | N/A |
| `transcode/vp8_to_vp9_webm` | decodeFps (fps) | N/A | N/A | Pass (84.06 ms) | N/A | N/A | N/A | Pass (90.53 ms) | N/A |
| `performance/convert-webm-resize-320x180` | framesPerSec (fps) | N/A | N/A | Pass (2.15 s) | N/A | N/A | N/A | Pass (4.31 s) | N/A |
| `performance/encode-fps` | encodeFps (fps) | N/A | N/A | Pass (4.36 s) | N/A | N/A | N/A | Pass (5.14 s) | N/A |
| `probe/wav_s24` | wall (ms) | N/A | Pass (4.82 ms) | Pass (7.37 ms) | N/A | Pass (6.2 ms) | Pass (1.84 ms) | Pass (3.6 ms) | N/A |
| `encryption/hls_aes128_decrypt` | throughputRealtime (x-realtime) | N/A | Pass (111 ms) | Pass (97.18 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s16be` | framesPerSec (fps) | N/A | Pass (29.7 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hevc_1080p_10s` | wall (ms) | N/A | Pass (43.16 ms) | Pass (12.47 ms) | Pass (23.72 ms) | Pass (33.32 ms) | Pass (340 ms) | Pass (296 ms) | Pass (716 ms) |
| `mux/audio_only_aac_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (7.74 ms) | Pass (8.44 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_opus_ogg_copy` | throughputRealtime (x-realtime) | N/A | Pass (5.59 ms) | Pass (3.68 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_open_gop_frame_accurate` | throughputRealtime (x-realtime) | N/A | Pass (8.57 s) | Pass (479 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_progressive_buffer` | throughputRealtime (x-realtime) | N/A | Pass (167 ms) | Pass (50.29 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_single_gop_frame_accurate` | throughputRealtime (x-realtime) | N/A | Pass (1.27 s) | Pass (166 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_attribution_multitrack` | wall (ms) | N/A | Pass (17.88 ms) | Pass (2.69 ms) | Pass (12.1 ms) | Pass (15.54 ms) | Pass (3.57 ms) | Pass (3.44 ms) | Pass (16.57 ms) |
| `probe/wav_f32` | wall (ms) | N/A | Pass (6.53 ms) | Pass (1.64 ms) | N/A | Pass (44.66 ms) | N/A | N/A | N/A |
| `transcode/av_downmix_stereo_to_mono` | decodeFps (fps) | N/A | Pass (81.68 s) | Pass (2.56 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_5s` | wall (ms) | N/A | Pass (29.76 ms) | Pass (8.67 ms) | Pass (14.51 ms) | Pass (19.57 ms) | Pass (45.53 ms) | Pass (71.13 ms) | Pass (383 ms) |
| `performance/decode-fps` | decodeFps (fps) | N/A | N/A | Pass (333 ms) | N/A | Pass (266 ms) | N/A | Pass (1.2 s) | Pass (329 ms) |
| `remux/aac_adts_adts_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (6.6 ms) | Pass (4.69 ms) | N/A | N/A | N/A | Pass (116 ms) | N/A |
| `metadata/read_h264_1080p_30s` | wall (ms) | N/A | Pass (51.46 ms) | Pass (3.28 ms) | Pass (39.95 ms) | Pass (76.67 ms) | Pass (3.34 ms) | Pass (5.06 ms) | Pass (24.73 ms) |
| `decode-seek/decode_mov_h264` | decodeFps (fps) | N/A | Pass (1.48 s) | Pass (1.09 s) | N/A | Pass (1.19 s) | N/A | Pass (941 ms) | Pass (1.18 s) |
| `metadata/write_mp3_id3` | wall (ms) | N/A | Pass (4.82 ms) | Pass (5.34 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_flower_mp4` | wall (ms) | N/A | Pass (17.03 ms) | N/A | Pass (4.44 ms) | Pass (8.48 ms) | Pass (13.25 ms) | Pass (19.31 ms) | N/A |
| `remux/h264_1080p_5s_mov_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (41.53 ms) | Pass (48.09 ms) | Pass (15.07 ms) | N/A | N/A | Pass (54.13 ms) | N/A |
| `metadata/meta_consistent_mp4_to_mkv` | wall (ms) | N/A | Pass (136 ms) | Pass (315 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_fps_30_to_15` | decodeFps (fps) | N/A | Pass (38.76 s) | Pass (1.49 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_massive_massive_h264_1080p_2h` | wall (ms) | N/A | Pass (4.81 s) | Pass (12.07 s) | Pass (2.55 s) | Pass (2.93 s) | Pass (87.94 ms) | Pass (54.16 ms) | Pass (46.38 ms) |
| `decode-seek/seek_h264_keyframe` | seekMs (ms) | N/A | Pass (86.6 ms) | Pass (26.28 ms) | N/A | Pass (77.82 ms) | N/A | Pass (2.1 s) | Pass (138 ms) |
| `mux/mp4_fragmented_cmaf` | throughputRealtime (x-realtime) | N/A | Pass (179 ms) | Pass (50.34 ms) | Pass (153 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/fade_in_out_f32` | throughputRealtime (x-realtime) | N/A | Pass (12.01 ms) | Pass (23.69 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/video_a_plus_audio_b_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (218 ms) | Pass (61.97 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_xing` | wall (ms) | N/A | Pass (4.66 ms) | Pass (3.01 ms) | N/A | N/A | Pass (8.62 ms) | Pass (5.64 ms) | N/A |
| `audio-dsp/pcm_s24_to_f32` | throughputRealtime (x-realtime) | N/A | Pass (13.96 ms) | Pass (19.51 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (633 ms) | Pass (222 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (211 ms) | Pass (48.56 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/drop_audio_track_subset_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (74.31 ms) | Pass (14.08 ms) | Pass (35.71 ms) | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mov` | throughputRealtime (x-realtime) | N/A | Pass (79.02 ms) | Pass (61.84 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_fragmented_shape` | wall (ms) | N/A | Pass (107 ms) | Pass (326 ms) | Pass (82.26 ms) | N/A | N/A | N/A | N/A |
| `streaming-output/stream_massive_h264_mp4` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_h264_1frame` | wall (ms) | N/A | Pass (3.72 ms) | Pass (5.35 ms) | Pass (3.35 ms) | Pass (2.28 ms) | Pass (1.93 ms) | Pass (3.06 ms) | Pass (6.68 ms) |
| `probe/perf-extract-metadata-large` | opsPerSec (ops/s) | N/A | Pass (120 ms) | Pass (2.66 ms) | Pass (109 ms) | Pass (139 ms) | Pass (5.94 ms) | Pass (5.43 ms) | Pass (29.72 ms) |
| `performance/size-ladder-iterate-packets-large` | packetsPerSec (packets/s) | N/A | Pass (191 ms) | Pass (175 ms) | Pass (154 ms) | Pass (184 ms) | Pass (6.05 s) | Pass (7.79 s) | Pass (6.27 s) |
| `remux/mp3_xing_mp3_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (5.69 ms) | Pass (5.06 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_flip_horizontal` | decodeFps (fps) | N/A | Pass (71.65 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_ts_to_mp4_duration_materialized` | wall (ms) | N/A | Pass (79.69 ms) | Pass (38.17 ms) | N/A | N/A | N/A | Pass (676 ms) | N/A |
| `encryption/unencrypted_left_untouched_noop` | wall (ms) | N/A | Pass (105 ms) | Pass (314 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mkv_tags` | wall (ms) | N/A | Pass (73.14 ms) | Pass (17.51 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_ts_stream_duration_materialized` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_av1_keyframe` | seekMs (ms) | N/A | N/A | Pass (15.42 ms) | N/A | Pass (78.66 ms) | N/A | Pass (254 ms) | Pass (49.08 ms) |
| `performance/convert-peak-memory` | peakMemory (bytes) | N/A | N/A | Pass (2.12 s) | N/A | N/A | N/A | Pass (3.75 s) | N/A |
| `trim/vp9_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | Pass (66.22 ms) | Pass (597 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_buffer_target` | throughputRealtime (x-realtime) | N/A | Pass (106 ms) | Pass (340 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/massive_h264_copy_sustained` | sourceReads (count) | N/A | N/A | Pass (5.04 s) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_variable_channel_count_downmix` | wall (ms) | N/A | Pass (50.65 ms) | Pass (52.64 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/tiny_h264_360p_2s` | wall (ms) | N/A | Pass (6.05 ms) | Pass (1.86 ms) | Pass (2.15 ms) | Pass (3.44 ms) | Pass (1.61 ms) | Pass (3.02 ms) | Pass (10.54 ms) |
| `trim/av1_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | N/A | Pass (286 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/aac_adts_adts_to_ts` | throughputRealtime (x-realtime) | N/A | Pass (7.56 ms) | Pass (8.06 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-demux` | packetsPerSec (packets/s) | N/A | Pass (70.22 ms) | Pass (33.19 ms) | Pass (56.41 ms) | Pass (68.85 ms) | Pass (4.66 ms) | Pass (1.05 s) | Pass (6.49 ms) |
| `performance/seek-ms` | seekMs (ms) | N/A | Pass (85.17 ms) | Pass (26.16 ms) | N/A | Pass (112 ms) | N/A | Pass (9.46 s) | Pass (99.39 ms) |
| `remux/mp3_xing_mp3_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (4.99 ms) | Pass (4.4 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_flac_vorbiscomment` | wall (ms) | N/A | Pass (20.14 ms) | Pass (5.83 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_mux_duration_webm_to_webm` | wall (ms) | N/A | Pass (107 ms) | Pass (40.34 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/bframe_reorder_h264_to_vp9` | decodeFps (fps) | N/A | N/A | Pass (1.4 s) | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_alpha_to_vp8_keepalpha` | decodeFps (fps) | N/A | N/A | Pass (474 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_audio_short` | wall (ms) | N/A | Pass (2.97 ms) | Pass (1.36 ms) | Pass (5.07 ms) | Pass (8.08 ms) | Pass (9.92 ms) | Pass (5.47 ms) | Pass (7.44 ms) |
| `trim/h264_to_eof_copy` | throughputRealtime (x-realtime) | N/A | Pass (64.11 ms) | Pass (438 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_rotated90_mp4_to_mov` | throughputRealtime (x-realtime) | N/A | Pass (31.41 ms) | Pass (97.61 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (55.19 ms) | Pass (89.28 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (1.17 s) | Pass (5.9 s) | Pass (1.22 s) | N/A | N/A | Pass (477 ms) | N/A |
| `metadata/rotation_survives_mp4_mkv` | wall (ms) | N/A | Pass (77.69 ms) | Pass (202 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_vfr` | wall (ms) | N/A | Pass (23.77 ms) | N/A | Pass (8.61 ms) | Pass (25.29 ms) | Pass (12.75 ms) | Pass (3.15 ms) | N/A |
| `probe/h264_1080p_5s` | wall (ms) | N/A | Pass (20.48 ms) | Pass (5.27 ms) | Pass (13.18 ms) | Pass (12.42 ms) | Pass (2.86 ms) | Pass (7.06 ms) | Pass (28.99 ms) |
| `probe/hevc_1080p_10s` | wall (ms) | N/A | Pass (23.37 ms) | Pass (2.39 ms) | Pass (26.35 ms) | Pass (25.91 ms) | Pass (2.72 ms) | Pass (4.63 ms) | Pass (8.66 ms) |
| `decode-seek/decode_multitrack_select_video` | decodeFps (fps) | N/A | Pass (353 ms) | Pass (275 ms) | N/A | Pass (286 ms) | N/A | Pass (479 ms) | Pass (311 ms) |
| `metadata/rotation_decode_read_h264_rotated90` | wall (ms) | N/A | N/A | N/A | N/A | Pass (140 ms) | N/A | N/A | N/A |
| `transcode/opus_to_aac_mp4` | throughputRealtime (x-realtime) | N/A | Pass (229 ms) | Pass (81.74 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_rotated90` | wall (ms) | N/A | Pass (32.45 ms) | Pass (8.39 ms) | Pass (11.12 ms) | Pass (15.93 ms) | Pass (74.32 ms) | Pass (191 ms) | Pass (319 ms) |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | wall (ms) | N/A | Pass (37.86 ms) | Pass (9.15 ms) | Pass (30.88 ms) | N/A | N/A | N/A | N/A |
| `transcode/mp3_to_aac_mp4` | throughputRealtime (x-realtime) | N/A | Pass (258 ms) | Pass (84.16 ms) | N/A | N/A | N/A | Pass (86.87 ms) | N/A |
| `decode-seek/decode_h264_first_frames` | decodeFps (fps) | N/A | Pass (1.6 s) | Pass (1.1 s) | N/A | Pass (1.23 s) | N/A | Pass (1.89 s) | Pass (1.23 s) |
| `performance/metamorphic-vfr-iterate-packets` | packetsPerSec (packets/s) | N/A | Pass (21 ms) | N/A | Pass (8.1 ms) | Pass (10.56 ms) | Pass (4.47 ms) | Pass (4.47 ms) | N/A |
| `probe/h264_vfr` | wall (ms) | N/A | Pass (17.09 ms) | Pass (2.09 ms) | Pass (5.66 ms) | Pass (9.63 ms) | Pass (5.4 ms) | Pass (3.16 ms) | Pass (21.15 ms) |
| `remux/h264_in_mkv_mkv_to_mov` | throughputRealtime (x-realtime) | N/A | Pass (69.87 ms) | Pass (12.72 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/fanout_h264_abr_ladder` | decodeFps (fps) | N/A | N/A | Pass (8.98 s) | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-decode-remux` | throughputRealtime (x-realtime) | N/A | Pass (136 ms) | Pass (279 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_past_eof` | seekMs (ms) | N/A | Pass (478 ms) | Pass (72.3 ms) | N/A | Pass (117 ms) | N/A | Pass (10.04 s) | Pass (132 ms) |
| `streaming-output/mp4_faststart_in_memory` | throughputRealtime (x-realtime) | N/A | Pass (104 ms) | Pass (295 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_alpha_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | N/A | Pass (463 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_tiny_dims_1x1` | decodeFps (fps) | N/A | Pass (3.79 ms) | Pass (2.66 ms) | N/A | Pass (2 ms) | N/A | Pass (5.29 ms) | Pass (15.88 ms) |
| `demux/size_huge_huge_h264_1080p_600s` | wall (ms) | N/A | Pass (952 ms) | Pass (911 ms) | Pass (750 ms) | Pass (771 ms) | SKIPPED | Pass (38.66 ms) | Pass (16.64 ms) |
| `demux/flac_seektable` | wall (ms) | N/A | Pass (3.04 ms) | Pass (3.13 ms) | N/A | N/A | Pass (7.21 ms) | Pass (9.45 ms) | N/A |
| `decode-seek/decode_bframes_reorder` | decodeFps (fps) | N/A | Pass (1.63 s) | Pass (1.08 s) | N/A | Pass (1.24 s) | N/A | Pass (1.32 s) | Pass (1.2 s) |
| `demux/size_tiny_tiny_h264_360p_2s` | wall (ms) | N/A | Pass (7.45 ms) | Pass (2.24 ms) | Pass (2.32 ms) | Pass (4.66 ms) | Pass (8.67 ms) | Pass (8.47 ms) | Pass (34.94 ms) |
| `mux/prop_h264_mux_duration_mp4_to_ts` | wall (ms) | N/A | Pass (177 ms) | Pass (80.21 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_vp9_webm` | decodeFps (fps) | N/A | N/A | Pass (3.8 s) | N/A | N/A | N/A | Pass (5.16 s) | N/A |
| `decode-seek/decode_size_tiny_h264_360p` | decodeFps (fps) | N/A | Pass (85.25 ms) | Pass (101 ms) | N/A | Pass (108 ms) | N/A | Pass (208 ms) | Pass (110 ms) |
| `mux/edge_multitrack_keep_all_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (87.56 ms) | Pass (13.32 ms) | Pass (56.22 ms) | N/A | N/A | N/A | N/A |
| `transcode/h264_to_ts` | decodeFps (fps) | N/A | N/A | Pass (2.74 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_cbr_notoc` | wall (ms) | N/A | Pass (2.57 ms) | Pass (2.65 ms) | N/A | N/A | Pass (4.51 ms) | Pass (1.6 ms) | N/A |
| `transcode/h264_crop_center` | decodeFps (fps) | N/A | Pass (52.28 s) | Pass (7.49 s) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vp8_keyframe` | seekMs (ms) | N/A | Pass (24.11 ms) | Pass (15.03 ms) | N/A | Pass (34.71 ms) | N/A | Pass (62.84 ms) | Pass (48.44 ms) |
| `trim/h264_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | Pass (88.62 ms) | Pass (947 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_noseektable_copy` | throughputRealtime (x-realtime) | N/A | Pass (7.5 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-massive` | packetsPerSec (packets/s) | N/A | Pass (5.13 s) | Pass (4.89 s) | Pass (3.67 s) | Pass (2.72 s) | Pass (86.62 ms) | Pass (41.81 ms) | Pass (59.78 ms) |
| `probe/opus` | wall (ms) | N/A | Pass (2.6 ms) | Pass (1.65 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | Pass (46.03 ms) | Pass (499 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_hevc_keyframe` | seekMs (ms) | N/A | Pass (62.97 ms) | Pass (24.63 ms) | N/A | Pass (55.41 ms) | N/A | Pass (1.86 s) | Pass (68.41 ms) |
| `streaming-output/prop_decode_equals_buffer_shape` | wall (ms) | N/A | Pass (94.17 ms) | Pass (531 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | wall (ms) | N/A | Pass (47.54 ms) | Pass (10.34 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_frame_accurate` | throughputRealtime (x-realtime) | N/A | N/A | Pass (526 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/aac_to_pcm_wav_extract` | throughputRealtime (x-realtime) | N/A | Pass (20.02 ms) | Pass (42.85 ms) | N/A | N/A | N/A | Pass (75.49 ms) | N/A |
| `mux/three_track_assembly_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (215 ms) | Pass (51.77 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_av1` | decodeFps (fps) | N/A | N/A | Pass (213 ms) | N/A | Pass (243 ms) | N/A | Pass (433 ms) | Pass (277 ms) |
| `performance/size-ladder-iterate-packets-huge` | packetsPerSec (packets/s) | N/A | Pass (958 ms) | Pass (1.2 s) | Pass (809 ms) | Pass (824 ms) | Pass (46.58 s) | Pass (4.63 ms) | Pass (5.88 ms) |
| `trim/h264_start_zero_copy` | throughputRealtime (x-realtime) | N/A | Pass (79.92 ms) | Pass (55.49 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/hdr10_to_sdr_tonemap` | decodeFps (fps) | N/A | Pass (38.09 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/cenc_cbcs` | wall (ms) | N/A | Pass (11.77 ms) | Pass (2.16 ms) | Pass (7.33 ms) | Pass (10.05 ms) | Pass (10.2 ms) | Pass (9.44 ms) | Pass (15.03 ms) |
| `decode-seek/decode_size_tiny_vp9_360p` | decodeFps (fps) | N/A | Pass (96.17 ms) | Pass (95.44 ms) | N/A | Pass (100 ms) | N/A | Pass (86.97 ms) | Pass (124 ms) |
| `decode-seek/seek_repeated_same_target` | seekMs (ms) | N/A | Pass (82.77 ms) | Pass (33.84 ms) | N/A | Pass (76.13 ms) | N/A | Pass (3.77 s) | Pass (101 ms) |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (5.16 s) | Pass (28.41 s) | N/A | N/A | N/A | N/A | N/A |
| `transcode/mp3_to_opus_webm` | throughputRealtime (x-realtime) | N/A | N/A | Pass (123 ms) | N/A | N/A | N/A | Pass (167 ms) | N/A |
| `probe/metamorphic-recorder-headerless-sane-duration` | wall (ms) | N/A | Pass (2.91 ms) | Pass (1.72 ms) | N/A | Pass (6.08 ms) | Pass (8.34 ms) | Pass (11.83 ms) | Pass (10.34 ms) |
| `audio-dsp/throughput_decode_s24` | framesPerSec (fps) | N/A | Pass (38.27 ms) | Pass (28.82 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (5.5 ms) | Pass (4.67 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_bframes_frame_accurate` | throughputRealtime (x-realtime) | N/A | Pass (6.79 s) | Pass (423 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/big_buck_bunny_1080p_h264` | wall (ms) | N/A | Pass (925 ms) | Pass (6.22 ms) | Pass (968 ms) | Pass (2.28 s) | Pass (18.5 ms) | Pass (11.47 ms) | Pass (42.51 ms) |
| `trim/large_h264_frame_accurate_throughput` | throughputRealtime (x-realtime) | N/A | Pass (20.2 s) | Pass (643 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_vorbis_ogg` | throughputRealtime (x-realtime) | N/A | Pass (56.5 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_multitrack_survives_mp4_mkv` | wall (ms) | N/A | Pass (113 ms) | Pass (90 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_zero` | seekMs (ms) | N/A | Pass (82.96 ms) | Pass (26.46 ms) | N/A | Pass (77.32 ms) | N/A | Pass (3.09 s) | Pass (95.09 ms) |
| `performance/size-ladder-iterate-packets-tiny` | packetsPerSec (packets/s) | N/A | Pass (16.5 ms) | Pass (3.68 ms) | Pass (2.06 ms) | Pass (5.46 ms) | Pass (8.27 ms) | Pass (9.02 ms) | Pass (34.84 ms) |
| `decode-seek/decode_h264_10bit` | decodeFps (fps) | N/A | Pass (1.05 s) | Pass (480 ms) | N/A | Pass (432 ms) | N/A | Pass (479 ms) | Pass (465 ms) |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (369 ms) | Pass (1.15 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_flower_webm` | wall (ms) | N/A | Pass (6.24 ms) | Pass (3.9 ms) | N/A | Pass (4.85 ms) | Pass (100 ms) | Pass (71.95 ms) | Pass (69.72 ms) |
| `mux/h264_aac_to_mov` | throughputRealtime (x-realtime) | N/A | Pass (198 ms) | Pass (66.76 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (81.48 ms) | Pass (48.2 ms) | N/A | N/A | N/A | Pass (673 ms) | N/A |
| `performance/op-sweep-transcode-webm` | encodeFps (fps) | N/A | N/A | Pass (2.16 s) | N/A | N/A | N/A | Pass (4.25 s) | N/A |
| `remux/flac_seektable_flac_to_ogg` | throughputRealtime (x-realtime) | N/A | Pass (5.26 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-huge` | opsPerSec (ops/s) | N/A | Pass (869 ms) | Pass (7.34 ms) | Pass (560 ms) | Pass (711 ms) | Pass (6.94 ms) | Pass (12.67 ms) | Pass (48.59 ms) |
| `transcode/h264_rotate_270_dimswap` | decodeFps (fps) | N/A | Pass (10.71 s) | Pass (809 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/ts_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | Pass (76.65 ms) | Pass (456 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_gapless_aac_decode` | wall (ms) | N/A | N/A | Pass (3.35 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-large4k` | peakMemory (bytes) | N/A | Pass (80.66 ms) | Pass (22.69 ms) | Pass (37.35 ms) | Pass (96.84 ms) | Pass (438 ms) | Pass (400 ms) | Pass (1.53 s) |
| `performance/metamorphic-transcode-idempotent-source-res` | framesPerSec (fps) | N/A | N/A | Pass (4.34 s) | N/A | N/A | N/A | Pass (5.13 s) | N/A |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (477 ms) | Pass (133 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (173 ms) | Pass (48.75 ms) | Pass (133 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_idempotent_resample_same_rate` | wall (ms) | N/A | Pass (24.66 ms) | Pass (4.24 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/mkv_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | Pass (72.09 ms) | Pass (611 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_vp9_1080p_120s` | wall (ms) | N/A | Pass (273 ms) | Pass (211 ms) | N/A | Pass (197 ms) | Pass (586 ms) | Pass (393 ms) | Pass (6.95 s) |
| `audio-dsp/edge_longform_audio_resample_16k` | wall (ms) | N/A | Pass (3.85 s) | Pass (6.2 s) | N/A | N/A | N/A | Pass (14.68 s) | N/A |
| `decode-seek/decode_size_large_vp9_120s` | decodeFps (fps) | N/A | Pass (1.76 s) | Pass (1.08 s) | N/A | Pass (1.33 s) | N/A | Pass (1.23 s) | Pass (1.22 s) |
| `decode-seek/seek_h264_nonkeyframe` | seekMs (ms) | N/A | Pass (431 ms) | Pass (60.82 ms) | N/A | Pass (91.68 ms) | N/A | Pass (4.22 s) | Pass (147 ms) |
| `transcode/hevc_to_h264_mp4` | decodeFps (fps) | N/A | Pass (24.97 s) | Pass (1.2 s) | N/A | N/A | N/A | Pass (1.02 s) | N/A |
| `probe/longform_1h_audio` | wall (ms) | N/A | Pass (49.94 ms) | Pass (12.93 ms) | Pass (86.19 ms) | Pass (111 ms) | Pass (5.64 ms) | Pass (13.63 ms) | Pass (34.08 ms) |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | decodeFps (fps) | N/A | Pass (72.23 s) | Pass (2.56 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_h264_1080p_120s` | wall (ms) | N/A | Pass (218 ms) | Pass (180 ms) | Pass (173 ms) | Pass (167 ms) | Pass (8.08 s) | Pass (17.55 s) | Pass (6.42 s) |
| `remux/h264_multitrack_mp4_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (35.83 ms) | Pass (87.59 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s16be` | framesPerSec (fps) | N/A | Pass (19.44 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_recorder_headerless_duration_materialized` | wall (ms) | N/A | Pass (16.49 ms) | Pass (6.04 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/tiny_vp9_360p_2s` | wall (ms) | N/A | Pass (5.39 ms) | Pass (1.2 ms) | N/A | Pass (14.22 ms) | Pass (3.51 ms) | Pass (5.79 ms) | Pass (10.72 ms) |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | wall (ms) | N/A | Pass (202 ms) | Pass (50.35 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_fps_240` | decodeFps (fps) | N/A | N/A | Pass (14.28 s) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_h264_4k` | decodeFps (fps) | N/A | Pass (3.41 s) | Pass (2.47 s) | N/A | Pass (2.1 s) | N/A | Pass (3.03 s) | Pass (2.16 s) |
| `demux/h264_ts` | wall (ms) | N/A | Pass (49.13 ms) | Pass (42.22 ms) | N/A | N/A | Pass (194 ms) | Pass (183 ms) | N/A |
| `probe/realworld_mdn_flower_mp4` | wall (ms) | N/A | Pass (17.21 ms) | Pass (1.54 ms) | Pass (4.35 ms) | Pass (7.69 ms) | Pass (2.16 ms) | Pass (5.56 ms) | Pass (41.14 ms) |
| `performance/size-ladder-extract-metadata-tiny` | opsPerSec (ops/s) | N/A | Pass (5.39 ms) | Pass (7.64 ms) | Pass (2.82 ms) | Pass (4.32 ms) | Pass (3.93 ms) | Pass (24.18 ms) | Pass (9.79 ms) |
| `probe/av1_720p_5s` | wall (ms) | N/A | Pass (10.18 ms) | Pass (13.43 ms) | N/A | Pass (8.28 ms) | Pass (7.76 ms) | Pass (11.22 ms) | Pass (5.82 ms) |
| `demux/wav_s24` | wall (ms) | N/A | Pass (17.5 ms) | Pass (5.56 ms) | N/A | Pass (7.82 ms) | Pass (10.38 ms) | Pass (4.45 ms) | N/A |
| `performance/metamorphic-probe-duration-cross-container` | throughputRealtime (x-realtime) | N/A | N/A | Pass (3.47 s) | N/A | N/A | N/A | Pass (4.36 s) | N/A |
| `decode-seek/decode_extreme_fps_1` | decodeFps (fps) | N/A | Pass (77.7 ms) | Pass (114 ms) | N/A | Pass (30.47 ms) | N/A | Pass (22.46 ms) | Pass (33.72 ms) |
| `metadata/read_no_tags_recorder_webm` | wall (ms) | N/A | Pass (5.5 ms) | Pass (2.21 ms) | N/A | Pass (7.73 ms) | Pass (8.23 ms) | Pass (16.72 ms) | Pass (10.05 ms) |
| `remux/h264_1080p_30s_mp4_to_ts` | throughputRealtime (x-realtime) | N/A | Pass (119 ms) | Pass (299 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/empty_audio_zero_packets` | wall (ms) | N/A | Pass (1.78 ms) | Pass (1.09 ms) | N/A | Pass (2.14 ms) | Pass (2.35 ms) | Pass (2.49 ms) | N/A |
| `transcode/vp9_to_vp8_webm` | decodeFps (fps) | N/A | Pass (42.71 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_reserve` | throughputRealtime (x-realtime) | N/A | Pass (105 ms) | Pass (66.25 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | wall (ms) | N/A | Pass (104 ms) | Pass (283 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/aac_to_opus_webm` | throughputRealtime (x-realtime) | N/A | N/A | Pass (91.61 ms) | N/A | N/A | N/A | Pass (110 ms) | N/A |
| `performance/op-sweep-remux-mp4-to-mkv` | throughputRealtime (x-realtime) | N/A | Pass (146 ms) | Pass (292 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/meta_pts_monotonic_after_reorder` | wall (ms) | N/A | Pass (2.1 s) | Pass (1.07 s) | N/A | Pass (1.17 s) | N/A | Pass (1.16 s) | Pass (1.21 s) |
| `streaming-output/ts_continuity_many_writes` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vp9_keyframe` | seekMs (ms) | N/A | Pass (582 ms) | Pass (42.14 ms) | N/A | Pass (117 ms) | N/A | Pass (565 ms) | Pass (106 ms) |
| `metadata/read_flac_seektable` | wall (ms) | N/A | Pass (2.09 ms) | Pass (1.39 ms) | N/A | N/A | Pass (1.78 ms) | Pass (5.08 ms) | N/A |
| `probe/metamorphic-duration-across-containers` | wall (ms) | N/A | Pass (83.91 ms) | Pass (10.19 ms) | N/A | Pass (65.38 ms) | Pass (14.63 ms) | Pass (12.03 ms) | Pass (86.2 ms) |
| `mux/av1_opus_to_mp4` | throughputRealtime (x-realtime) | N/A | N/A | Pass (8.19 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_rotated_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | Pass (39.99 ms) | Pass (358 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/flac_to_mkv_audio` | throughputRealtime (x-realtime) | N/A | Pass (21.04 ms) | Pass (5.89 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_audio_short` | wall (ms) | N/A | Pass (2.27 ms) | Pass (1.48 ms) | Pass (1.9 ms) | Pass (2.88 ms) | Pass (3.19 ms) | Pass (3.76 ms) | Pass (14.95 ms) |
| `transcode/vp9_to_h264_mp4` | decodeFps (fps) | N/A | Pass (24.43 s) | Pass (991 ms) | N/A | N/A | N/A | Pass (1.29 s) | N/A |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | framesPerSec (fps) | N/A | Pass (376 ms) | Pass (209 ms) | N/A | N/A | N/A | Pass (218 ms) | N/A |
| `decode-seek/decode_vp9_alpha` | decodeFps (fps) | N/A | N/A | Pass (241 ms) | N/A | Pass (355 ms) | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-medium` | opsPerSec (ops/s) | N/A | Pass (50.75 ms) | Pass (7.94 ms) | Pass (42.94 ms) | Pass (60.9 ms) | Pass (2.86 ms) | Pass (7.22 ms) | Pass (21.76 ms) |
| `audio-dsp/upmix_stereo_to_5_1` | throughputRealtime (x-realtime) | N/A | Pass (27.46 ms) | Pass (72.96 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24be_to_s16le` | throughputRealtime (x-realtime) | N/A | Pass (10.19 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_opus_ogg` | throughputRealtime (x-realtime) | N/A | N/A | Pass (37.54 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_f32` | wall (ms) | N/A | Pass (8.5 ms) | Pass (7.28 ms) | N/A | Pass (16.5 ms) | N/A | N/A | N/A |
| `remux/prop_rotation_survives_mp4_mov` | wall (ms) | N/A | Pass (36.84 ms) | Pass (237 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/empty-audio-wav` | wall (ms) | N/A | Pass (2.76 ms) | Pass (3.13 ms) | N/A | Pass (3.52 ms) | Pass (1.51 ms) | Pass (1.1 ms) | N/A |
| `transcode/bframe_reorder_h264_to_h264` | decodeFps (fps) | N/A | Pass (23.41 s) | Pass (959 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/aac_adts` | wall (ms) | N/A | Pass (6.6 ms) | Pass (3.82 ms) | N/A | N/A | Pass (7.09 ms) | Pass (6.39 ms) | N/A |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | wall (ms) | N/A | Pass (156 ms) | Pass (559 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_longform_audio_probe` | wall (ms) | N/A | Pass (436 ms) | Pass (2.07 ms) | N/A | Pass (466 ms) | Pass (2.24 ms) | Pass (3.26 ms) | N/A |
| `decode-seek/decode_size_micro_h264_1frame` | decodeFps (fps) | N/A | Pass (14.2 ms) | Pass (12.8 ms) | N/A | Pass (4.75 ms) | N/A | Pass (3.85 ms) | Pass (11.35 ms) |
| `mux/size_micro_1frame_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (7.91 ms) | Pass (3 ms) | Pass (3.77 ms) | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mkv` | wall (ms) | N/A | Pass (52.37 ms) | Pass (38.18 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_in_mkv` | wall (ms) | N/A | Pass (35.31 ms) | Pass (6.94 ms) | N/A | Pass (16.11 ms) | Pass (9.8 ms) | Pass (11.13 ms) | Pass (60.4 ms) |
| `performance/extract-metadata` | opsPerSec (ops/s) | N/A | Pass (47.08 ms) | Pass (1.66 ms) | Pass (40.49 ms) | Pass (49.28 ms) | Pass (2.2 ms) | Pass (3.73 ms) | Pass (23.59 ms) |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | wall (ms) | N/A | Pass (105 ms) | Pass (284 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_multitrack` | wall (ms) | N/A | Pass (22.25 ms) | Pass (3.78 ms) | Pass (10.08 ms) | Pass (14.9 ms) | Pass (5.28 ms) | Pass (4.35 ms) | Pass (19.62 ms) |
| `performance/size-ladder-extract-metadata-massive` | opsPerSec (ops/s) | N/A | Pass (1.49 s) | Pass (26.42 ms) | Pass (1.55 s) | Pass (2.54 s) | Pass (59.11 ms) | Pass (55.88 ms) | Pass (309 ms) |
| `mux/edge_hevc_decode_mux_mkv` | wall (ms) | N/A | Pass (89.03 ms) | Pass (22.52 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_av1_mp4` | decodeFps (fps) | N/A | N/A | Pass (6.4 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/pcm_s16be` | wall (ms) | N/A | Pass (6.82 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_30s` | wall (ms) | N/A | Pass (58.19 ms) | Pass (8.21 ms) | Pass (38.64 ms) | Pass (64.07 ms) | Pass (2.32 ms) | Pass (4 ms) | Pass (21.56 ms) |
| `probe/cenc_ctr` | wall (ms) | N/A | Pass (9.86 ms) | SKIPPED | Pass (6.31 ms) | Pass (10.4 ms) | Pass (7.53 ms) | Pass (8 ms) | Pass (22.5 ms) |
| `probe/h264_ts` | wall (ms) | N/A | Pass (43.67 ms) | Pass (23.31 ms) | N/A | N/A | Pass (232 ms) | Pass (189 ms) | Pass (482 ms) |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | wall (ms) | N/A | Pass (43.59 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (85.9 ms) | Pass (15.24 ms) | N/A | N/A | N/A | Pass (721 ms) | N/A |
| `transcode/flac_to_opus_webm` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (81.19 ms) | Pass (54.63 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_multitrack` | wall (ms) | N/A | Pass (32.31 ms) | Pass (9.6 ms) | Pass (14.73 ms) | Pass (18.1 ms) | Pass (281 ms) | Pass (71.36 ms) | Pass (552 ms) |
| `transcode/h264_fps_30_to_60` | decodeFps (fps) | N/A | Pass (98.44 s) | Pass (5.21 s) | N/A | N/A | N/A | N/A | N/A |
| `trim/mov_keyframe_aligned` | throughputRealtime (x-realtime) | N/A | Pass (44.8 ms) | Pass (448 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/vp8_720p_10s_webm_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (12.19 ms) | Pass (6.24 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_30s` | wall (ms) | N/A | Pass (73.32 ms) | Pass (53.29 ms) | Pass (58.99 ms) | Pass (61.09 ms) | Pass (7.67 ms) | Pass (1.18 s) | Pass (3.35 ms) |
| `audio-dsp/pcm_s16le_to_s16be` | throughputRealtime (x-realtime) | N/A | Pass (20.44 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp9_alpha` | wall (ms) | N/A | Pass (16.6 ms) | Pass (3.9 ms) | N/A | Pass (6.44 ms) | Pass (12.54 ms) | Pass (11.66 ms) | Pass (52.85 ms) |
| `streaming-output/mp4_ttfb_buffer_target` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_rotated_display_matrix` | decodeFps (fps) | N/A | Pass (359 ms) | Pass (267 ms) | N/A | Pass (315 ms) | N/A | Pass (340 ms) | N/A |
| `probe/perf-extract-metadata-massive` | opsPerSec (ops/s) | N/A | Pass (2.72 s) | Pass (81.04 ms) | Pass (3.07 s) | Pass (3.06 s) | Pass (61.17 ms) | Pass (102 ms) | Pass (305 ms) |
| `mux/mp3_to_mp4_audio` | throughputRealtime (x-realtime) | N/A | Pass (7.34 ms) | Pass (6.91 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp3` | throughputRealtime (x-realtime) | N/A | Pass (18.74 ms) | Pass (3.78 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_streaming_target` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_ts` | throughputRealtime (x-realtime) | N/A | Pass (227 ms) | Pass (90.71 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_colorspace_709_to_2020` | decodeFps (fps) | N/A | Pass (88.04 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_roundtrip_mp4_mkv_mp4` | wall (ms) | N/A | Pass (145 ms) | Pass (282 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_vp8_webm` | decodeFps (fps) | N/A | Pass (48.19 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (8.57 ms) | Pass (4.1 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_flac` | throughputRealtime (x-realtime) | N/A | Pass (25.79 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/large_vp9_1080p_120s` | wall (ms) | N/A | Pass (155 ms) | Pass (10.15 ms) | N/A | Pass (157 ms) | Pass (91.98 ms) | Pass (96.7 ms) | Pass (40.25 ms) |
| `probe/hls_aes128` | wall (ms) | N/A | Pass (43.52 ms) | Pass (31.9 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mov` | throughputRealtime (x-realtime) | N/A | Pass (175 ms) | Pass (285 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/size_longform_audio_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (494 ms) | Pass (5.03 s) | Pass (2.83 s) | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_huge_h264_600s` | decodeFps (fps) | N/A | N/A | Pass (1.18 s) | N/A | Pass (1.68 s) | N/A | SKIPPED | Pass (1.16 s) |
| `audio-dsp/resample_48k_to_16k` | throughputRealtime (x-realtime) | N/A | Pass (28.49 ms) | Pass (22.44 ms) | N/A | N/A | N/A | Pass (16.9 ms) | N/A |
| `remux/opus_ogg_to_mkv` | throughputRealtime (x-realtime) | N/A | Pass (6.14 ms) | Pass (5.53 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/perf_cenc_ctr_decrypt_throughput` | throughputRealtime (x-realtime) | N/A | Pass (24.53 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s16_to_wav` | throughputRealtime (x-realtime) | N/A | Pass (28.79 ms) | Pass (4.25 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_opus` | wall (ms) | N/A | Pass (2.56 ms) | Pass (1.85 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large` | opsPerSec (ops/s) | N/A | Pass (135 ms) | Pass (3.77 ms) | Pass (107 ms) | Pass (200 ms) | Pass (2.79 ms) | Pass (5.59 ms) | Pass (27.2 ms) |
| `decode-seek/decode_mkv_h264` | decodeFps (fps) | N/A | Pass (727 ms) | Pass (651 ms) | N/A | Pass (576 ms) | N/A | Pass (476 ms) | Pass (774 ms) |
| `demux/vp8_720p_10s` | wall (ms) | N/A | Pass (9.69 ms) | Pass (4.76 ms) | N/A | Pass (6.77 ms) | Pass (211 ms) | Pass (154 ms) | Pass (115 ms) |
| `trim/audio_aac_adts_copy` | throughputRealtime (x-realtime) | N/A | Pass (6.16 ms) | Pass (5.28 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (462 ms) | Pass (219 ms) | Pass (435 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_f32_to_s16` | throughputRealtime (x-realtime) | N/A | Pass (15.28 ms) | Pass (18.45 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/size_tiny_360p_to_mp4` | throughputRealtime (x-realtime) | N/A | Pass (15.25 ms) | Pass (3.99 ms) | Pass (7.1 ms) | N/A | N/A | N/A | N/A |
| `decode-seek/decode_extreme_fps_240` | decodeFps (fps) | N/A | Pass (210 ms) | Pass (397 ms) | N/A | Pass (174 ms) | N/A | Pass (143 ms) | Pass (136 ms) |
| `transcode/h264_crf_quality_mode` | decodeFps (fps) | N/A | Pass (62.72 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt` | throughputRealtime (x-realtime) | N/A | Pass (43.94 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16_to_f32` | throughputRealtime (x-realtime) | N/A | Pass (40.09 ms) | Pass (10.84 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_mov` | decodeFps (fps) | N/A | Pass (69.56 s) | Pass (2.58 s) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_vp9_1080p_10s` | wall (ms) | N/A | Pass (35.79 ms) | Pass (7.75 ms) | N/A | Pass (22.7 ms) | Pass (12.36 ms) | Pass (14.51 ms) | Pass (37.07 ms) |
| `probe/huge_h264_1080p_600s` | wall (ms) | N/A | Pass (577 ms) | Pass (6.11 ms) | Pass (647 ms) | Pass (722 ms) | Pass (5.49 ms) | Pass (6.81 ms) | Pass (58.02 ms) |
| `mux/edge_hevc_decode_mux_mp4` | wall (ms) | N/A | Pass (61.89 ms) | Pass (35.44 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/aiff_container_probe` | opsPerSec (ops/s) | N/A | Pass (3.54 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_aac_mp4` | throughputRealtime (x-realtime) | N/A | Pass (175 ms) | Pass (34.63 ms) | N/A | N/A | N/A | Pass (52.41 ms) | N/A |
| `demux/flac_noseektable` | wall (ms) | N/A | Pass (3.16 ms) | Pass (3.61 ms) | N/A | N/A | Pass (8.74 ms) | Pass (7.24 ms) | N/A |
| `probe/realworld_mdn_trex_mp3` | wall (ms) | N/A | Pass (2.48 ms) | Pass (4.09 ms) | N/A | N/A | Pass (2.6 ms) | Pass (2.28 ms) | N/A |
| `transcode/h264_to_fragmented_mp4` | decodeFps (fps) | N/A | Pass (69.34 s) | Pass (2.56 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_multitrack` | wall (ms) | N/A | Pass (15.66 ms) | Pass (2.69 ms) | Pass (12.8 ms) | Pass (13.71 ms) | Pass (3.06 ms) | Pass (3.22 ms) | Pass (17.96 ms) |
| `performance/size-ladder-iterate-packets-large4k` | packetsPerSec (packets/s) | N/A | Pass (75.31 ms) | Pass (25.49 ms) | Pass (50.62 ms) | Pass (43.92 ms) | Pass (1.68 s) | Pass (380 ms) | Pass (1.81 s) |
| `remux/prop_bframes_decode_remux_mp4_mkv` | wall (ms) | N/A | Pass (141 ms) | Pass (89.65 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_buffer_shape` | wall (ms) | N/A | Pass (192 ms) | Pass (326 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt_eq_cleartext` | wall (ms) | N/A | Pass (101 ms) | Pass (83.94 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned_short` | throughputRealtime (x-realtime) | N/A | Pass (66.19 ms) | Pass (340 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_reserve_duration_invariant` | wall (ms) | N/A | Pass (121 ms) | Pass (49.28 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vfr_arbitrary` | seekMs (ms) | N/A | Pass (249 ms) | Pass (49.49 ms) | N/A | Pass (43.35 ms) | N/A | Pass (336 ms) | Pass (105 ms) |
| `transcode/aac_to_mp3_mp4` | throughputRealtime (x-realtime) | N/A | Pass (109 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_bframes_midgop` | seekMs (ms) | N/A | Pass (843 ms) | Pass (96.47 ms) | N/A | Pass (96.72 ms) | N/A | Pass (2.46 s) | Pass (237 ms) |
| `remux/vp9_1080p_10s_webm_to_webm` | throughputRealtime (x-realtime) | N/A | Pass (61.78 ms) | Pass (19.66 ms) | N/A | N/A | N/A | Pass (125 ms) | N/A |
| `demux/h264_4k_10s` | wall (ms) | N/A | Pass (72.59 ms) | Pass (24.39 ms) | Pass (49.37 ms) | Pass (52.45 ms) | Pass (667 ms) | Pass (688 ms) | Pass (1.57 s) |
| `probe/hls_vod` | wall (ms) | N/A | Pass (47.05 ms) | Pass (19.47 ms) | N/A | N/A | Pass (297 ms) | Pass (312 ms) | N/A |
| `metadata/read_pcm_s16be` | wall (ms) | N/A | Pass (4.96 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/caf_container_probe` | opsPerSec (ops/s) | N/A | Pass (14.31 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/pcm_s16be` | wall (ms) | N/A | Pass (3.41 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_bframes_1080p` | wall (ms) | N/A | Pass (43.01 ms) | N/A | Pass (23.2 ms) | Pass (39.7 ms) | Pass (463 ms) | Pass (972 ms) | N/A |
| `mux/vp9_opus_to_webm` | throughputRealtime (x-realtime) | N/A | Pass (100 ms) | Pass (23.49 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_to_av1_webm` | decodeFps (fps) | N/A | N/A | Pass (2.6 s) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large4k` | opsPerSec (ops/s) | N/A | Pass (133 ms) | Pass (1.86 ms) | Pass (32.83 ms) | Pass (48.25 ms) | Pass (3.3 ms) | Pass (3.78 ms) | Pass (55.43 ms) |
| `transcode/extreme_fps_1` | decodeFps (fps) | N/A | Pass (8.77 s) | Pass (508 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/iterate-video-packets` | packetsPerSec (packets/s) | N/A | Pass (78.59 ms) | Pass (37.05 ms) | Pass (60.19 ms) | Pass (66.78 ms) | Pass (21.84 ms) | Pass (1.05 s) | Pass (4.11 ms) |
| `trim/h264_vfr_frame_accurate` | throughputRealtime (x-realtime) | N/A | Pass (2.19 s) | Pass (193 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_open_gop_first_frame` | decodeFps (fps) | N/A | Pass (451 ms) | Pass (368 ms) | N/A | Pass (335 ms) | N/A | Pass (325 ms) | Pass (410 ms) |
| `remux/prop_adts_to_mp4_duration_invariant` | wall (ms) | N/A | Pass (5.52 ms) | Pass (3.91 ms) | N/A | N/A | N/A | Pass (81.9 ms) | N/A |
| `transcode/av1_to_vp9_webm` | decodeFps (fps) | N/A | N/A | Pass (487 ms) | N/A | N/A | N/A | Pass (720 ms) | N/A |
| `transcode/h264_to_mkv` | decodeFps (fps) | N/A | N/A | Pass (2.55 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/massive_vp9_1080p_2h` | wall (ms) | N/A | Pass (1.05 s) | Pass (10.43 ms) | N/A | Pass (1.81 s) | Pass (4.43 ms) | Pass (52.29 ms) | Pass (31.74 ms) |
| `metadata/read_mp3_xing` | wall (ms) | N/A | Pass (2.19 ms) | Pass (1.71 ms) | N/A | N/A | Pass (1.5 ms) | Pass (2.01 ms) | N/A |
| `demux/vp9_1080p_10s` | wall (ms) | N/A | Pass (43.46 ms) | Pass (13 ms) | N/A | Pass (23.77 ms) | Pass (42.89 ms) | Pass (60.35 ms) | Pass (713 ms) |
| `trim/h264_noop_full_range_idempotent` | throughputRealtime (x-realtime) | N/A | Pass (123 ms) | Pass (43.48 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mp4` | wall (ms) | N/A | Pass (164 ms) | Pass (17.26 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | decodeFps (fps) | N/A | N/A | Pass (3.76 s) | N/A | N/A | N/A | Pass (5.1 s) | N/A |
| `probe/vp9_alpha` | wall (ms) | N/A | Pass (7.01 ms) | Pass (10.91 ms) | N/A | Pass (5.52 ms) | Pass (8.76 ms) | Pass (5.44 ms) | Pass (15.99 ms) |
| `streaming-output/stream_large_h264_mp4` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/roundtrip_leg1_h264_to_vp9` | decodeFps (fps) | N/A | N/A | Pass (5.05 s) | N/A | N/A | N/A | Pass (7.63 s) | N/A |
| `trim/h264_subframe_range_frame_accurate` | throughputRealtime (x-realtime) | N/A | Pass (1.35 s) | Pass (157 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/av1_720p_5s` | wall (ms) | N/A | Pass (11.81 ms) | Pass (6.29 ms) | N/A | Pass (7.92 ms) | Pass (59.79 ms) | Pass (28.52 ms) | Pass (141 ms) |
| `streaming-output/prop_probe_dur_stream_shape` | — | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp8_to_h264_mp4` | decodeFps (fps) | N/A | Pass (11.55 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_video_plus_opus_audio_to_webm` | throughputRealtime (x-realtime) | N/A | Pass (112 ms) | Pass (33.51 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_large_h264_120s` | decodeFps (fps) | N/A | Pass (1.65 s) | Pass (1.06 s) | N/A | Pass (1.22 s) | N/A | Pass (11.26 s) | Pass (1.17 s) |
| `transcode/gapless_pcm_to_aac_priming` | wall (ms) | N/A | Pass (173 ms) | Pass (45.5 ms) | N/A | N/A | N/A | Pass (65.24 ms) | N/A |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | N/A | Pass (475 ms) | Pass (304 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_no_media_tracks_probe` | — | N/A | Pass (135 ms) | Pass (23 ms) | N/A | Pass (11 ms) | Pass (4 ms) | Pass (24 ms) | N/A |
| `trim/robust_start_past_eof` | — | N/A | Pass (194 ms) | Pass (87 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_trim_additivity_compose` | — | N/A | Pass (56.91 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_pcm_s16be_probe` | — | N/A | Pass (139 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_truncated_mdat_graceful` | — | N/A | Pass (123 ms) | Pass (30 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_mp3_header_truncated_probe` | — | N/A | Pass (117 ms) | Pass (8 ms) | N/A | N/A | Pass (29 ms) | Pass (18 ms) | N/A |
| `trim/robust_bitflipped_source` | — | N/A | Pass (115 ms) | Pass (149 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_audio_only_probe` | — | N/A | Pass (134 ms) | Pass (25 ms) | Pass (11 ms) | Pass (33 ms) | Pass (26 ms) | Pass (9 ms) | Pass (41 ms) |
| `robustness/prop_remux_duration_preserved` | — | N/A | Pass (557 ms) | Pass (555 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_seek_past_eof` | — | N/A | Pass (694 ms) | Pass (81 ms) | N/A | Pass (124 ms) | N/A | Pass (10.04 s) | Pass (211 ms) |
| `probe/truncated-header-graceful` | — | N/A | Pass (130 ms) | Pass (17 ms) | Pass (38 ms) | Pass (13 ms) | Pass (32 ms) | Pass (4 ms) | Pass (36 ms) |
| `robustness/edge_audio_only_micro_probe` | — | N/A | Pass (137 ms) | Pass (21 ms) | Pass (15 ms) | Pass (10 ms) | Pass (4 ms) | Pass (16 ms) | Pass (54 ms) |
| `robustness/prop_duration_consistent_across_containers` | — | N/A | Pass (296 ms) | Pass (26 ms) | N/A | Pass (96 ms) | Pass (35 ms) | Pass (65 ms) | Pass (169 ms) |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | N/A | Pass (116 ms) | Pass (35 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_webm_header_truncated_demux` | — | N/A | Pass (199 ms) | Pass (22 ms) | N/A | N/A | Pass (13 ms) | Pass (17 ms) | Pass (51 ms) |
| `demux/graceful_zero_length` | — | N/A | Pass (125 ms) | Pass (8 ms) | Pass (37 ms) | N/A | Pass (33 ms) | Pass (17 ms) | Pass (53 ms) |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | N/A | Pass (184 ms) | Pass (44 ms) | N/A | N/A | Pass (67 ms) | Pass (58 ms) | N/A |
| `demux/graceful_webm_header_destroyed` | — | N/A | Pass (221 ms) | Pass (12 ms) | N/A | N/A | Pass (12 ms) | Pass (9 ms) | Pass (44 ms) |
| `robustness/fuzz_mux_target_corrupt_remux` | — | N/A | Pass (245 ms) | Pass (61 ms) | Pass (113 ms) | N/A | N/A | Pass (1.2 s) | N/A |
| `robustness/edge_faststart_reserve_remux` | — | N/A | Pass (825 ms) | Pass (610 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_dims_1x1_probe` | — | N/A | Pass (193 ms) | Pass (23 ms) | N/A | Pass (28 ms) | Pass (27 ms) | Pass (17 ms) | Pass (52 ms) |
| `robustness/fuzz_truncated_h264_asset_demux` | — | N/A | Pass (121 ms) | Pass (15 ms) | Pass (27 ms) | N/A | Pass (12 ms) | Pass (32 ms) | Pass (32 ms) |
| `trim/robust_end_far_past_eof` | — | N/A | Pass (207 ms) | Pass (113 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_flac_without_seektable_probe` | — | N/A | Pass (125 ms) | Pass (22 ms) | N/A | N/A | Pass (12 ms) | Pass (19 ms) | N/A |
| `demux/graceful_truncated_h264` | — | N/A | Pass (112 ms) | Pass (15 ms) | Pass (24 ms) | N/A | Pass (57 ms) | Pass (39 ms) | Pass (39 ms) |
| `remux/neg_headerless_webm_to_mkv` | — | N/A | Pass (285 ms) | Pass (8 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | N/A | Pass (190 ms) | Pass (30 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/neg_garbled_ilst_mp4_probe` | — | N/A | Pass (194 ms) | Pass (7 ms) | Pass (84 ms) | Pass (62 ms) | Pass (8 ms) | Pass (16 ms) | Pass (117 ms) |
| `robustness/fuzz_mp4_bitflip_probe` | — | N/A | Pass (204 ms) | Pass (19 ms) | Pass (53 ms) | Pass (65 ms) | Pass (54 ms) | Pass (18 ms) | Pass (95 ms) |
| `robustness/image_png_probe_na` | — | N/A | Pass (122 ms) | Pass (28 ms) | Pass (10 ms) | Pass (20 ms) | Pass (14 ms) | Pass (12 ms) | Pass (47 ms) |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | — | N/A | Pass (126 ms) | Pass (25 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_cens_decrypt_na` | — | N/A | Pass (131 ms) | Pass (4 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/mismatch_mislabeled_container_transcode` | — | N/A | Pass (11.62 s) | Pass (657 ms) | N/A | N/A | N/A | Pass (695 ms) | N/A |
| `robustness/edge_headerless_recorder_probe` | — | N/A | Pass (161 ms) | Pass (25 ms) | N/A | Pass (25 ms) | Pass (37 ms) | Pass (19 ms) | Pass (59 ms) |
| `robustness/edge_multitrack_demux` | — | N/A | Pass (176 ms) | Pass (27 ms) | Pass (41 ms) | Pass (59 ms) | Pass (144 ms) | Pass (88 ms) | Pass (594 ms) |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | N/A | Pass (199 ms) | Pass (40 ms) | Pass (56 ms) | N/A | Pass (718 ms) | Pass (1.08 s) | Pass (1.32 s) |
| `robustness/edge_video_only_micro_probe` | — | N/A | Pass (160 ms) | Pass (11 ms) | Pass (31 ms) | Pass (25 ms) | Pass (16 ms) | Pass (5 ms) | Pass (49 ms) |
| `transcode/negative_png_to_video` | — | N/A | Pass (122 ms) | Pass (19 ms) | N/A | Pass (27 ms) | N/A | Pass (27 ms) | N/A |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | N/A | Pass (1.91 s) | Pass (168 ms) | N/A | Pass (125 ms) | N/A | Pass (2.4 s) | Pass (135 ms) |
| `transcode/malformed_truncated_h264_transcode` | — | N/A | Pass (129 ms) | Pass (1.62 s) | N/A | N/A | N/A | Pass (653 ms) | N/A |
| `robustness/edge_dims_1x1_decode` | — | N/A | Pass (147 ms) | Pass (13 ms) | N/A | Pass (12 ms) | N/A | Pass (33 ms) | Pass (65 ms) |
| `audio-dsp/edge_empty_audio_transcode` | — | N/A | Pass (129 ms) | Pass (23 ms) | N/A | N/A | N/A | Pass (41 ms) | N/A |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | N/A | Pass (136 ms) | Pass (33 ms) | N/A | Pass (18 ms) | N/A | Pass (19 ms) | N/A |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | N/A | Pass (212 ms) | Pass (26 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_sample_aes_decrypt_na` | — | N/A | Pass (106 ms) | Pass (18 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/negative_image_into_audio_transcode` | — | N/A | Pass (122 ms) | Pass (23 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_vp9_into_adts_illegal` | — | N/A | Pass (257 ms) | Pass (131 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_ts_pts_wraparound_demux` | — | N/A | Pass (142 ms) | Pass (27 ms) | N/A | N/A | Pass (64 ms) | Pass (54 ms) | SKIPPED |
| `robustness/prop_gapless_sample_count_priming` | — | N/A | N/A | Pass (26 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_open_gop_bframes_decode` | — | N/A | N/A | Pass (1.62 s) | N/A | Pass (1.92 s) | N/A | Pass (1.59 s) | Pass (1.86 s) |
| `robustness/fuzz_adts_aac_bitflip_probe` | — | N/A | Pass (125 ms) | Pass (26 ms) | N/A | N/A | Pass (26 ms) | Pass (33 ms) | N/A |
| `robustness/edge_5_1_channels_probe` | — | N/A | Pass (216 ms) | Pass (40 ms) | N/A | Pass (42 ms) | Pass (9 ms) | Pass (7 ms) | N/A |
| `robustness/edge_zero_length_probe` | — | N/A | Pass (121 ms) | Pass (7 ms) | Pass (15 ms) | Pass (15 ms) | Pass (9 ms) | Pass (15 ms) | Pass (30 ms) |
| `transcode/negative_webp_to_video` | — | N/A | Pass (105 ms) | Pass (32 ms) | N/A | Pass (27 ms) | N/A | Pass (20 ms) | N/A |
| `robustness/edge_flac_with_seektable_probe` | — | N/A | Pass (131 ms) | Pass (26 ms) | N/A | N/A | Pass (6 ms) | Pass (15 ms) | N/A |
| `mux/neg_h264_into_ogg_illegal` | — | N/A | Pass (650 ms) | Pass (39 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_rotated_remux` | — | N/A | Pass (720 ms) | Pass (650 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_cbcs_boundary_decrypt` | — | N/A | N/A | Pass (175 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/neg_garbled_id3_mp3_probe` | — | N/A | Pass (139 ms) | Pass (22 ms) | N/A | N/A | Pass (12 ms) | Pass (29 ms) | N/A |
| `transcode/mismatch_audio_only_to_video_target` | — | N/A | Pass (176 ms) | Pass (24 ms) | N/A | N/A | N/A | Pass (17 ms) | N/A |
| `robustness/prop_demux_mux_roundtrip_eq` | — | N/A | N/A | Pass (81 ms) | Pass (194 ms) | N/A | N/A | N/A | N/A |
| `transcode/mismatch_video_only_to_audio_target` | — | N/A | Pass (153 ms) | Pass (12 ms) | N/A | N/A | N/A | Pass (10 ms) | N/A |
| `robustness/prop_double_remux_stable` | — | N/A | N/A | Pass (370 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/clearkey_decrypt_na` | — | N/A | Pass (151 ms) | Pass (33 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | — | N/A | Pass (523 ms) | Pass (521 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | N/A | Pass (133 ms) | Pass (17 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | N/A | Pass (125 ms) | Pass (41 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/neg_zeroed_mp4_to_mkv` | — | N/A | Pass (216 ms) | Pass (9 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_trim_concatenation` | — | N/A | Pass (65.47 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_flac_seek_seektable_equiv` | — | N/A | Pass (158 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_negative_start` | — | N/A | Pass (118 ms) | Pass (4 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_mislabeled_container_probe` | — | N/A | Pass (145 ms) | Pass (17 ms) | N/A | Pass (21 ms) | Pass (34 ms) | Pass (24 ms) | Pass (49 ms) |
| `robustness/image_jpeg_probe_na` | — | N/A | Pass (115 ms) | Pass (7 ms) | Pass (14 ms) | Pass (7 ms) | Pass (13 ms) | Pass (7 ms) | Pass (44 ms) |
| `robustness/fuzz_mp4_header_truncated_demux` | — | N/A | Pass (158 ms) | Pass (16 ms) | Pass (54 ms) | N/A | Pass (29 ms) | Pass (16 ms) | Pass (98 ms) |
| `demux/graceful_mp4_header_destroyed` | — | N/A | Pass (162 ms) | Pass (40 ms) | Pass (53 ms) | N/A | Pass (23 ms) | Pass (17 ms) | Pass (45 ms) |
| `mux/neg_h264_into_wav_illegal` | — | N/A | Pass (281 ms) | Pass (40 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_vfr_probe` | — | N/A | Pass (158 ms) | Pass (8 ms) | Pass (12 ms) | Pass (31 ms) | Pass (21 ms) | Pass (21 ms) | Pass (83 ms) |
| `trim/robust_zero_length_range` | — | N/A | Pass (117 ms) | Pass (24 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_resize_1x1` | — | N/A | Pass (124 ms) | Pass (33 ms) | N/A | N/A | N/A | Pass (29 ms) | N/A |
| `robustness/edge_extreme_fps_240_probe` | — | N/A | Pass (197 ms) | Pass (5 ms) | Pass (40 ms) | Pass (42 ms) | Pass (34 ms) | Pass (35 ms) | Pass (63 ms) |
| `robustness/edge_headerless_recorder_remux` | — | N/A | Pass (658 ms) | Pass (575 ms) | N/A | N/A | N/A | Pass (555 ms) | N/A |
| `transcode/negative_jpeg_to_video` | — | N/A | Pass (128 ms) | Pass (28 ms) | N/A | Pass (16 ms) | N/A | Pass (40 ms) | N/A |
| `trim/robust_inverted_range` | — | N/A | Pass (124 ms) | Pass (13 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_gapless_priming_probe` | — | N/A | Pass (112 ms) | Pass (4 ms) | Pass (26 ms) | Pass (15 ms) | Pass (24 ms) | Pass (8 ms) | Pass (66 ms) |
| `transcode/malformed_zero_length_transcode` | — | N/A | Pass (127 ms) | Pass (15 ms) | N/A | Pass (14 ms) | N/A | Pass (14 ms) | N/A |
| `trim/robust_truncated_source` | — | N/A | Pass (123 ms) | Pass (944 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_remux_zeroed_spans` | — | N/A | Pass (307 ms) | Pass (406 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/neg_truncated_mp4_to_mkv` | — | N/A | Pass (235 ms) | Pass (199 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/image_webp_probe_na` | — | N/A | Pass (129 ms) | Pass (31 ms) | Pass (21 ms) | Pass (20 ms) | Pass (21 ms) | Pass (9 ms) | Pass (48 ms) |
| `robustness/fuzz_flac_bitflip_probe` | — | N/A | Pass (116 ms) | Pass (25 ms) | N/A | N/A | Pass (33 ms) | Pass (7 ms) | N/A |
| `robustness/edge_video_only_probe` | — | N/A | Pass (163 ms) | Pass (27 ms) | Pass (22 ms) | Pass (32 ms) | Pass (19 ms) | Pass (49 ms) | Pass (76 ms) |
| `robustness/fuzz_webm_bitflip_probe` | — | N/A | Pass (252 ms) | Pass (39 ms) | N/A | Pass (35 ms) | Pass (34 ms) | Pass (32 ms) | Pass (104 ms) |
| `robustness/edge_longform_probe` | — | N/A | Pass (246 ms) | Pass (79 ms) | Pass (141 ms) | Pass (291 ms) | Pass (103 ms) | Pass (91 ms) | Pass (136 ms) |
| `robustness/edge_dims_2x2_h264_probe` | — | N/A | Pass (123 ms) | Pass (18 ms) | Pass (40 ms) | Pass (26 ms) | Pass (17 ms) | Pass (21 ms) | Pass (64 ms) |
| `robustness/edge_fragmented_remux` | — | N/A | Pass (803 ms) | Pass (912 ms) | Pass (944 ms) | N/A | N/A | N/A | N/A |
| `robustness/edge_pcm_s24_decode` | — | N/A | Pass (146 ms) | Pass (28 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_resize_0x0` | — | N/A | Pass (115 ms) | Pass (20 ms) | N/A | N/A | N/A | Pass (14 ms) | N/A |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | — | N/A | Pass (125 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_extreme_fps_1_probe` | — | N/A | Pass (141 ms) | Pass (9 ms) | Pass (21 ms) | Pass (19 ms) | Pass (26 ms) | Pass (14 ms) | Pass (75 ms) |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | N/A | Pass (126 ms) | Pass (17 ms) | N/A | Pass (13 ms) | Pass (11 ms) | Pass (5 ms) | N/A |
| `robustness/prop_transcode_idempotent_dims_h264` | — | N/A | Pass (70.59 s) | Pass (3.78 s) | N/A | N/A | N/A | Pass (13.28 s) | N/A |
| `robustness/edge_seek_negative` | — | N/A | Pass (212 ms) | Pass (42 ms) | N/A | Pass (102 ms) | N/A | Pass (2.12 s) | Pass (142 ms) |
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | decodeFps (fps) | N/A | N/A | N/A | N/A | Pass (5.03 s) | N/A | N/A | N/A |

### 2. Winners — one per case (🏆 = fastest correct engine)

| Case | Winner | Value | Runner-up | Margin | Eligible | Flag |
| --- | --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | 🏆 `ffmpeg.wasm@0.12.15` | 304 x-realtime | `mediabunny@1.48.0` | +185.77% | 2 | contested |
| `audio-dsp/gain_half_f32` | 🏆 `ffmpeg.wasm@0.12.15` | 353.48 x-realtime | `mediabunny@1.48.0` | +72.99% | 2 | contested |
| `decode-seek/seek_backward_then_forward` | 🏆 `mediabunny@1.48.0` | 27.67 ms | `platform@chrome-149` | +64.24% | 5 | contested |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | 0 | no winner |
| `decode-seek/decode_vfr_timing` | 🏆 `remotion-webcodecs@4.0.479` | 124.12 fps | `mediabunny@1.48.0` | +10.74% | 5 | contested |
| `mux/prop_av1_mux_duration_webm_to_mp4` | `mediabunny@1.48.0` (uncontested) | 16.4 ms | — | — | 1 | uncontested |
| `trim/h264_frame_accurate` | 🏆 `mediabunny@1.48.0` | 46.24 x-realtime | `ffmpeg.wasm@0.12.15` | +1874.05% | 2 | contested |
| `remux/hevc_1080p_10s_mp4_to_mov` | 🏆 `ffmpeg.wasm@0.12.15` | 230.02 x-realtime | `mediabunny@1.48.0` | +120.18% | 2 | contested |
| `transcode/h264_resize_4k_to_1080p` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `mediabunny@1.48.0` | +0% | 3 | tie |
| `performance/bundle-size` | 🏆 `platform@chrome-149` | 0 kB | `ffmpeg.wasm@0.12.15` | +100% | 7 | contested |
| `performance/convert-longtasks` | 🏆 `mediabunny@1.48.0` | 1259 ms | `remotion-webcodecs@4.0.479` | +89.07% | 2 | contested |
| `audio-dsp/upmix_mono_to_stereo` | 🏆 `ffmpeg.wasm@0.12.15` | 337.15 x-realtime | `mediabunny@1.48.0` | +75.42% | 2 | contested |
| `trim/audio_aiff_pcm_be_copy` | `ffmpeg.wasm@0.12.15` (uncontested) | 811.69 x-realtime | — | — | 1 | uncontested |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | `mediabunny@1.48.0` (uncontested) | 454.34 fps | — | — | 1 | uncontested |
| `probe/h264_rotated90` | 🤝 `remotion-media-parser@4.0.479`, `mediabunny@1.48.0` | 1.54 ms | `mediabunny@1.48.0` | +1.59% | 7 | tie |
| `audio-dsp/downmix_stereo_to_mono` | 🏆 `ffmpeg.wasm@0.12.15` | 196.19 x-realtime | `mediabunny@1.48.0` | +27.96% | 2 | contested |
| `demux/hls_aes128` | 🏆 `mediabunny@1.48.0` | 111.31 ms | `ffmpeg.wasm@0.12.15` | +17.8% | 2 | contested |
| `remux/vp9_1080p_10s_webm_to_mkv` | 🏆 `mediabunny@1.48.0` | 513.1 x-realtime | `ffmpeg.wasm@0.12.15` | +302.26% | 2 | contested |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | 🏆 `mediabunny@1.48.0` | 263.21 fps | `ffmpeg.wasm@0.12.15` | +1217.36% | 2 | contested |
| `demux/mp3_cbr_notoc` | 🏆 `mediabunny@1.48.0` | 4.76 ms | `remotion-webcodecs@4.0.479` | +22.85% | 4 | contested |
| `transcode/multitrack_select_default_audio` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `mediabunny@1.48.0` | +0% | 3 | tie |
| `mux/edge_bframes_decode_mux_mkv` | 🏆 `mediabunny@1.48.0` | 20.54 ms | `ffmpeg.wasm@0.12.15` | +83.03% | 2 | contested |
| `transcode/selfcheck_h264_resize_720p_tie` | 🏆 `remotion-webcodecs@4.0.479` | 344.81 fps | `mediabunny@1.48.0` | +10.01% | 3 | contested |
| `transcode/flac_to_aac_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | 39.16 x-realtime | — | — | 1 | uncontested |
| `trim/huge_h264_mov_copy_peakmem` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 B | `mediabunny@1.48.0` | +0% | 2 | tie |
| `audio-dsp/meta_roundtrip_endianness_s16` | 🏆 `mediabunny@1.48.0` | 4.69 ms | `ffmpeg.wasm@0.12.15` | +80.85% | 2 | contested |
| `trim/large_h264_copy_lazyread` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 count | `mediabunny@1.48.0` | +0% | 2 | tie |
| `probe/flac_noseektable` | 🏆 `remotion-media-parser@4.0.479` | 1.32 ms | `mediabunny@1.48.0` | +13.96% | 4 | contested |
| `remux/micro_audio_short_mp4_to_adts` | 🏆 `ffmpeg.wasm@0.12.15` | 25.22 x-realtime | `mediabunny@1.48.0` | +33.92% | 2 | contested |
| `decode-seek/decode_vp8` | 🏆 `platform@chrome-149` | 129.71 fps | `web-demuxer@4.0.0` | +11.14% | 5 | contested |
| `mux/prop_vp9_decode_mux_webm_to_webm` | 🏆 `mediabunny@1.48.0` | 22.72 ms | `ffmpeg.wasm@0.12.15` | +77.04% | 2 | contested |
| `audio-dsp/resample_48k_to_44k1` | 🏆 `ffmpeg.wasm@0.12.15` | 166.89 x-realtime | `remotion-webcodecs@4.0.479` | +17.79% | 3 | contested |
| `demux/realworld_mdn_trex_mp3` | 🤝 `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 1.94 ms | `remotion-webcodecs@4.0.479` | +1.02% | 4 | tie |
| `performance/metamorphic-vfr-probe-duration` | 🏆 `mediabunny@1.48.0` | 549.45 ops/s | `remotion-media-parser@4.0.479` | +98.9% | 7 | contested |
| `probe/h264_4k_10s` | 🏆 `remotion-media-parser@4.0.479` | 2.15 ms | `mediabunny@1.48.0` | +5.49% | 7 | contested |
| `mux/video_plus_audio_to_mp4` | 🏆 `mediabunny@1.48.0` | 653.81 x-realtime | `ffmpeg.wasm@0.12.15` | +296.07% | 2 | contested |
| `transcode/h264_10bit_to_h264_8bit` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `transcode/hevc_to_av1_webm` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `audio-dsp/gain_minus6db_s16` | 🏆 `ffmpeg.wasm@0.12.15` | 242.78 x-realtime | `mediabunny@1.48.0` | +45.64% | 2 | contested |
| `performance/size-ladder-iterate-packets-medium` | 🏆 `web-demuxer@4.0.0` | 501739.13 packets/s | `remotion-media-parser@4.0.479` | +7.83% | 7 | contested |
| `probe/wav_s16` | 🏆 `remotion-webcodecs@4.0.479` | 2.08 ms | `remotion-media-parser@4.0.479` | +17.3% | 5 | contested |
| `transcode/h264_vfr_to_cfr_30` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `remux/vp9_1080p_10s_webm_to_mp4` | 🏆 `mediabunny@1.48.0` | 590.27 x-realtime | `ffmpeg.wasm@0.12.15` | +283.81% | 2 | contested |
| `audio-dsp/pcm_s24_to_s16` | 🏆 `ffmpeg.wasm@0.12.15` | 398.72 x-realtime | `mediabunny@1.48.0` | +64.35% | 3 | contested |
| `transcode/ladder_tiny_h264_360p_resize_180p` | 🤝 `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 294.22 fps | `remotion-webcodecs@4.0.479` | +0.11% | 3 | tie |
| `probe/perf-extract-metadata-huge` | 🏆 `remotion-webcodecs@4.0.479` | 136.99 ops/s | `remotion-media-parser@4.0.479` | +8.22% | 7 | contested |
| `transcode/h264_rotate_180` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `mediabunny@1.48.0` | +0% | 3 | tie |
| `remux/h264_1080p_30s_mp4_to_mkv` | 🏆 `ffmpeg.wasm@0.12.15` | 184.51 x-realtime | `mediabunny@1.48.0` | +122.09% | 2 | contested |
| `mux/pcm_s24_to_wav` | 🏆 `mediabunny@1.48.0` | 750.19 x-realtime | `ffmpeg.wasm@0.12.15` | +112.38% | 2 | contested |
| `metadata/write_mp4_tags` | 🏆 `ffmpeg.wasm@0.12.15` | 111.73 ms | `mediabunny@1.48.0` | +64.77% | 2 | contested |
| `transcode/h264_flip_vertical` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `remux/prop_bframes_decode_remux_mp4_mov` | 🏆 `mediabunny@1.48.0` | 92.03 ms | `ffmpeg.wasm@0.12.15` | +51.17% | 2 | contested |
| `trim/audio_flac_seektable_copy` | `ffmpeg.wasm@0.12.15` (uncontested) | 1155.4 x-realtime | — | — | 1 | uncontested |
| `remux/av1_720p_5s_webm_to_mkv` | 🏆 `mediabunny@1.48.0` | 625.61 x-realtime | `ffmpeg.wasm@0.12.15` | +175.83% | 2 | contested |
| `probe/vp8_720p_10s` | 🏆 `mediabunny@1.48.0` | 5.87 ms | `web-demuxer@4.0.0` | +22.3% | 6 | contested |
| `demux/h264_in_mkv` | 🏆 `mediabunny@1.48.0` | 9.13 ms | `platform@chrome-149` | +42.6% | 6 | contested |
| `demux/wav_s16` | 🏆 `remotion-media-parser@4.0.479` | 3.03 ms | `remotion-webcodecs@4.0.479` | +50.77% | 5 | contested |
| `metadata/tracks_packet_attribution_multitrack` | 🏆 `mediabunny@1.48.0` | 119518.07 packets/s | `platform@chrome-149` | +66.65% | 7 | contested |
| `probe/recorder_headerless` | 🏆 `mediabunny@1.48.0` | 1.92 ms | `ffmpeg.wasm@0.12.15` | +31.06% | 6 | contested |
| `encryption/cenc_cbcs_decrypt` | `mediabunny@1.48.0` (uncontested) | 97.3 x-realtime | — | — | 1 | uncontested |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | 🏆 `mediabunny@1.48.0` | 34.18 ms | `platform@chrome-149` | +27.68% | 5 | contested |
| `remux/av1_720p_5s_webm_to_mp4` | `mediabunny@1.48.0` (uncontested) | 719.54 x-realtime | — | — | 1 | uncontested |
| `trim/audio_wav_pcm_copy` | 🏆 `mediabunny@1.48.0` | 1490.31 x-realtime | `ffmpeg.wasm@0.12.15` | +865.57% | 2 | contested |
| `probe/flac_seektable` | 🏆 `mediabunny@1.48.0` | 1.2 ms | `ffmpeg.wasm@0.12.15` | +50.92% | 4 | contested |
| `metadata/write_ogg_vorbiscomment` | 🏆 `mediabunny@1.48.0` | 5.41 ms | `ffmpeg.wasm@0.12.15` | +24.34% | 2 | contested |
| `probe/large_h264_1080p_120s` | 🏆 `mediabunny@1.48.0` | 2.47 ms | `remotion-media-parser@4.0.479` | +60.89% | 7 | contested |
| `mux/mp4_faststart_reserve` | — | — | — | — | 0 | no winner |
| `trim/audio_mp3_copy` | 🏆 `mediabunny@1.48.0` | 3929.27 x-realtime | `ffmpeg.wasm@0.12.15` | +74.85% | 2 | contested |
| `audio-dsp/downmix_5_1_to_stereo` | 🏆 `ffmpeg.wasm@0.12.15` | 190.99 x-realtime | `mediabunny@1.48.0` | +119.85% | 2 | contested |
| `demux/size_micro_micro_h264_1frame` | 🏆 `platform@chrome-149` | 2.81 ms | `remotion-media-parser@4.0.479` | +12.17% | 7 | contested |
| `mux/vorbis_to_ogg` | 🏆 `mediabunny@1.48.0` | 1456.04 x-realtime | `ffmpeg.wasm@0.12.15` | +365.14% | 2 | contested |
| `remux/opus_ogg_to_webm` | 🏆 `ffmpeg.wasm@0.12.15` | 1710.6 x-realtime | `mediabunny@1.48.0` | +71.97% | 2 | contested |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | 0 | no winner |
| `probe/realworld_mdn_flower_webm` | 🏆 `mediabunny@1.48.0` | 2.48 ms | `ffmpeg.wasm@0.12.15` | +29.89% | 6 | contested |
| `transcode/h264_resize_720p` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `mediabunny@1.48.0` | +0% | 3 | tie |
| `decode-seek/meta_seek_vs_linear_decode` | 🏆 `mediabunny@1.48.0` | 24.48 ms | `platform@chrome-149` | +62.38% | 5 | contested |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | `ffmpeg.wasm@0.12.15` (uncontested) | 26.32 ms | — | — | 1 | uncontested |
| `transcode/vp9_alpha_to_vp9_keepalpha` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | 🏆 `mediabunny@1.48.0` | 49.1 ms | `ffmpeg.wasm@0.12.15` | +72.77% | 2 | contested |
| `mux/swap_audio_video_with_opus_to_mkv` | 🏆 `mediabunny@1.48.0` | 503.48 x-realtime | `ffmpeg.wasm@0.12.15` | +503.31% | 2 | contested |
| `probe/mp3_xing` | 🏆 `mediabunny@1.48.0` | 2 ms | `remotion-webcodecs@4.0.479` | +15.76% | 4 | contested |
| `probe/vp9_1080p_10s` | 🏆 `mediabunny@1.48.0` | 12.22 ms | `remotion-webcodecs@4.0.479` | +8.32% | 6 | contested |
| `streaming-output/ts_tiny_writes` | — | — | — | — | 0 | no winner |
| `demux/opus` | 🏆 `mediabunny@1.48.0` | 4.64 ms | `ffmpeg.wasm@0.12.15` | +32.68% | 2 | contested |
| `probe/aac_adts` | 🏆 `mediabunny@1.48.0` | 2.13 ms | `ffmpeg.wasm@0.12.15` | +43.58% | 4 | contested |
| `transcode/roundtrip_leg2_vp9_to_h264` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `mediabunny@1.48.0` | +0% | 3 | tie |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | 🏆 `ffmpeg.wasm@0.12.15` | 131.46 ms | `mediabunny@1.48.0` | +76.54% | 2 | contested |
| `trim/vp9_noop_full_range_idempotent` | 🏆 `mediabunny@1.48.0` | 443.81 x-realtime | `ffmpeg.wasm@0.12.15` | +202.53% | 2 | contested |
| `decode-seek/seek_negative` | 🏆 `mediabunny@1.48.0` | 25.17 ms | `platform@chrome-149` | +66.92% | 5 | contested |
| `remux/av1_720p_5s_webm_to_webm` | `mediabunny@1.48.0` (uncontested) | 653.79 x-realtime | — | — | 1 | uncontested |
| `decode-seek/decode_vp9` | 🏆 `remotion-webcodecs@4.0.479` | 62.14 fps | `mediabunny@1.48.0` | +16.15% | 5 | contested |
| `demux/hls_vod` | 🤝 `mediabunny@1.48.0`, `ffmpeg.wasm@0.12.15` | 49.37 ms | `ffmpeg.wasm@0.12.15` | +0.24% | 4 | tie |
| `transcode/av1_to_h264_mp4` | 🤝 `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `remotion-webcodecs@4.0.479` | +0% | 2 | tie |
| `remux/h264_1080p_5s_mov_to_mkv` | 🏆 `mediabunny@1.48.0` | 130.67 x-realtime | `ffmpeg.wasm@0.12.15` | +13.3% | 2 | contested |
| `audio-dsp/resample_44k1_to_48k` | 🏆 `ffmpeg.wasm@0.12.15` | 228.28 x-realtime | `mediabunny@1.48.0` | +29.63% | 3 | contested |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | 0 | no winner |
| `probe/h264_bframes_1080p` | 🏆 `mediabunny@1.48.0` | 1.92 ms | `remotion-webcodecs@4.0.479` | +64.18% | 7 | contested |
| `trim/fmp4_fragment_boundary_copy` | 🏆 `ffmpeg.wasm@0.12.15` | 417.39 x-realtime | `mediabunny@1.48.0` | +832.1% | 2 | contested |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | 0 | no winner |
| `metadata/read_h264_1080p_5s` | 🏆 `mediabunny@1.48.0` | 2.82 ms | `remotion-media-parser@4.0.479` | +42.93% | 7 | contested |
| `remux/h264_in_mkv_mkv_to_ts` | 🏆 `mediabunny@1.48.0` | 400.36 x-realtime | `ffmpeg.wasm@0.12.15` | +160.35% | 2 | contested |
| `mux/edge_rotation_decode_mux_mov` | 🏆 `mediabunny@1.48.0` | 18.04 ms | `ffmpeg.wasm@0.12.15` | +64.25% | 2 | contested |
| `trim/h264_multitrack_keyframe_aligned` | 🏆 `ffmpeg.wasm@0.12.15` | 138.44 x-realtime | `mediabunny@1.48.0` | +419.3% | 2 | contested |
| `demux/size_tiny_tiny_vp9_360p_2s` | 🏆 `mediabunny@1.48.0` | 2.91 ms | `platform@chrome-149` | +40.97% | 6 | contested |
| `transcode/gapless_pcm_to_opus_priming` | 🏆 `mediabunny@1.48.0` | 41.07 ms | `remotion-webcodecs@4.0.479` | +41.88% | 2 | contested |
| `metadata/tagedit_no_corrupt_audio_flac` | 🏆 `mediabunny@1.48.0` | 2.53 ms | `ffmpeg.wasm@0.12.15` | +52.84% | 2 | contested |
| `probe/h264_in_mkv` | 🏆 `mediabunny@1.48.0` | 7.27 ms | `remotion-media-parser@4.0.479` | +32.45% | 6 | contested |
| `streaming-output/mp4_streaming_target` | — | — | — | — | 0 | no winner |
| `mux/opus_to_ogg` | 🏆 `mediabunny@1.48.0` | 1394.7 x-realtime | `ffmpeg.wasm@0.12.15` | +62.37% | 2 | contested |
| `transcode/h264_rotate_90_dimswap` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `transcode/h264_fps_15_to_30` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `performance/size-ladder-demux-peak-memory-huge` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `mp4box@2.3.0`, `remotion-media-parser@4.0.479`, `remotion-webcodecs@4.0.479`, `web-demuxer@4.0.0` | 0 B | `mediabunny@1.48.0` | +0% | 7 | tie |
| `probe/massive_h264_1080p_2h` | 🏆 `mediabunny@1.48.0` | 24.8 ms | `remotion-media-parser@4.0.479` | +45.62% | 7 | contested |
| `demux/metamorphic_flac_seektable_invariance` | 🏆 `mediabunny@1.48.0` | 2.55 ms | `ffmpeg.wasm@0.12.15` | +61.94% | 4 | contested |
| `performance/size-ladder-demux-peak-memory-large` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `platform@chrome-149`, `remotion-media-parser@4.0.479`, `web-demuxer@4.0.0` | 0 B | `mediabunny@1.48.0` | +0% | 7 | tie |
| `transcode/h264_rotate_normalize` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `mediabunny@1.48.0` | +0% | 3 | tie |
| `remux/prop_mp3_to_mp4_duration_invariant` | 🏆 `mediabunny@1.48.0` | 3.74 ms | `ffmpeg.wasm@0.12.15` | +75.39% | 2 | contested |
| `streaming-output/buffer_massive_h264_mp4` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 B | `mediabunny@1.48.0` | +0% | 3 | tie |
| `mux/aac_to_adts` | 🏆 `mediabunny@1.48.0` | 3423.55 x-realtime | `ffmpeg.wasm@0.12.15` | +393.52% | 2 | contested |
| `metadata/read_no_tags_wav` | 🏆 `remotion-webcodecs@4.0.479` | 2.12 ms | `remotion-media-parser@4.0.479` | +25.53% | 5 | contested |
| `transcode/h264_to_hevc_mp4` | 🤝 `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `remotion-webcodecs@4.0.479` | +0% | 2 | tie |
| `trim/vp8_keyframe_aligned` | 🏆 `ffmpeg.wasm@0.12.15` | 776.03 x-realtime | `mediabunny@1.48.0` | +2702.33% | 2 | contested |
| `remux/h264_bframes_1080p_mp4_to_mkv` | 🏆 `ffmpeg.wasm@0.12.15` | 136.83 x-realtime | `mediabunny@1.48.0` | +55.23% | 2 | contested |
| `transcode/hevc_to_vp9_webm` | 🤝 `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `remotion-webcodecs@4.0.479` | +0% | 2 | tie |
| `audio-dsp/throughput_encode_s24` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | 0 | no winner |
| `transcode/metamorphic_resize_same_1080p_idempotent` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `mediabunny@1.48.0` | +0% | 3 | tie |
| `streaming-output/mp4_fragmented_cmaf` | 🤝 `ffmpeg.wasm@0.12.15`, `mp4box@2.3.0` | 266.37 x-realtime | `mp4box@2.3.0` | +1.65% | 3 | tie |
| `audio-dsp/pcm_s16be_to_s16le` | `ffmpeg.wasm@0.12.15` (uncontested) | 390.47 x-realtime | — | — | 1 | uncontested |
| `mux/opus_to_webm_audio` | 🏆 `mediabunny@1.48.0` | 1684.68 x-realtime | `ffmpeg.wasm@0.12.15` | +82.49% | 2 | contested |
| `transcode/wav_to_mp3_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | 76.85 x-realtime | — | — | 1 | uncontested |
| `remux/h264_1080p_5s_mov_to_ts` | 🏆 `ffmpeg.wasm@0.12.15` | 127.26 x-realtime | `mediabunny@1.48.0` | +30.15% | 2 | contested |
| `transcode/h264_to_vp8_webm` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `decode-seek/decode_tiny_dims_2x2_h264` | 🏆 `mediabunny@1.48.0` | 3187.25 fps | `platform@chrome-149` | +31.87% | 5 | contested |
| `transcode/h264_two_pass_bitrate` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `decode-seek/decode_hevc` | 🤝 `mediabunny@1.48.0`, `platform@chrome-149` | 53.53 fps | `platform@chrome-149` | +1.89% | 5 | tie |
| `probe/huge_vp9_1080p_240s` | 🏆 `mediabunny@1.48.0` | 12.72 ms | `web-demuxer@4.0.0` | +67.94% | 6 | contested |
| `mux/pcm_f32_to_wav` | 🏆 `mediabunny@1.48.0` | 1132.5 x-realtime | `ffmpeg.wasm@0.12.15` | +223.67% | 2 | contested |
| `performance/op-sweep-probe` | 🏆 `mediabunny@1.48.0` | 472.81 ops/s | `remotion-media-parser@4.0.479` | +19.86% | 7 | contested |
| `decode-seek/seek_mkv_h264_keyframe` | 🏆 `mediabunny@1.48.0` | 18.26 ms | `platform@chrome-149` | +60.86% | 5 | contested |
| `streaming-output/webm_streaming_target` | — | — | — | — | 0 | no winner |
| `transcode/h264_bitrate_2mbps` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `mediabunny@1.48.0` | +0% | 3 | tie |
| `transcode/vp8_to_vp9_webm` | 🤝 `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `remotion-webcodecs@4.0.479` | +0% | 2 | tie |
| `performance/convert-webm-resize-320x180` | 🏆 `mediabunny@1.48.0` | 419.24 fps | `remotion-webcodecs@4.0.479` | +100.81% | 2 | contested |
| `performance/encode-fps` | 🏆 `mediabunny@1.48.0` | 206.26 fps | `remotion-webcodecs@4.0.479` | +17.71% | 2 | contested |
| `probe/wav_s24` | 🏆 `remotion-media-parser@4.0.479` | 1.84 ms | `remotion-webcodecs@4.0.479` | +49.03% | 5 | contested |
| `encryption/hls_aes128_decrypt` | 🏆 `mediabunny@1.48.0` | 102.91 x-realtime | `ffmpeg.wasm@0.12.15` | +14.53% | 2 | contested |
| `audio-dsp/throughput_decode_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | 137889.24 fps | — | — | 1 | uncontested |
| `demux/hevc_1080p_10s` | 🏆 `mediabunny@1.48.0` | 12.47 ms | `mp4box@2.3.0` | +47.42% | 7 | contested |
| `mux/audio_only_aac_to_mp4` | 🏆 `ffmpeg.wasm@0.12.15` | 1295.99 x-realtime | `mediabunny@1.48.0` | +9.04% | 2 | contested |
| `trim/audio_opus_ogg_copy` | 🏆 `mediabunny@1.48.0` | 2719.29 x-realtime | `ffmpeg.wasm@0.12.15` | +51.9% | 2 | contested |
| `trim/h264_open_gop_frame_accurate` | 🏆 `mediabunny@1.48.0` | 20.86 x-realtime | `ffmpeg.wasm@0.12.15` | +1686.9% | 2 | contested |
| `mux/mp4_progressive_buffer` | 🏆 `mediabunny@1.48.0` | 596.54 x-realtime | `ffmpeg.wasm@0.12.15` | +233.02% | 2 | contested |
| `trim/h264_single_gop_frame_accurate` | 🏆 `mediabunny@1.48.0` | 180.97 x-realtime | `ffmpeg.wasm@0.12.15` | +669% | 2 | contested |
| `metadata/tracks_attribution_multitrack` | 🏆 `mediabunny@1.48.0` | 2.69 ms | `remotion-webcodecs@4.0.479` | +21.95% | 7 | contested |
| `probe/wav_f32` | 🏆 `mediabunny@1.48.0` | 1.64 ms | `ffmpeg.wasm@0.12.15` | +74.87% | 3 | contested |
| `transcode/av_downmix_stereo_to_mono` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `demux/h264_1080p_5s` | 🏆 `mediabunny@1.48.0` | 8.67 ms | `mp4box@2.3.0` | +40.25% | 7 | contested |
| `performance/decode-fps` | 🏆 `platform@chrome-149` | 45.1 fps | `web-demuxer@4.0.0` | +23.61% | 4 | contested |
| `remux/aac_adts_adts_to_mp4` | 🏆 `mediabunny@1.48.0` | 2138.81 x-realtime | `ffmpeg.wasm@0.12.15` | +40.72% | 3 | contested |
| `metadata/read_h264_1080p_30s` | 🤝 `mediabunny@1.48.0`, `remotion-media-parser@4.0.479` | 3.28 ms | `remotion-media-parser@4.0.479` | +1.8% | 7 | tie |
| `decode-seek/decode_mov_h264` | 🏆 `remotion-webcodecs@4.0.479` | 63.75 fps | `mediabunny@1.48.0` | +15.88% | 5 | contested |
| `metadata/write_mp3_id3` | 🏆 `ffmpeg.wasm@0.12.15` | 4.82 ms | `mediabunny@1.48.0` | +9.64% | 2 | contested |
| `demux/realworld_mdn_flower_mp4` | 🏆 `mp4box@2.3.0` | 4.44 ms | `platform@chrome-149` | +47.64% | 5 | contested |
| `remux/h264_1080p_5s_mov_to_mp4` | 🏆 `mp4box@2.3.0` | 331.79 x-realtime | `ffmpeg.wasm@0.12.15` | +175.61% | 4 | contested |
| `metadata/meta_consistent_mp4_to_mkv` | 🏆 `ffmpeg.wasm@0.12.15` | 135.82 ms | `mediabunny@1.48.0` | +56.86% | 2 | contested |
| `transcode/h264_fps_30_to_15` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `demux/size_massive_massive_h264_1080p_2h` | 🏆 `web-demuxer@4.0.0` | 46.38 ms | `remotion-webcodecs@4.0.479` | +14.37% | 7 | contested |
| `decode-seek/seek_h264_keyframe` | 🏆 `mediabunny@1.48.0` | 26.28 ms | `platform@chrome-149` | +66.23% | 5 | contested |
| `mux/mp4_fragmented_cmaf` | 🏆 `mediabunny@1.48.0` | 595.95 x-realtime | `mp4box@2.3.0` | +204.08% | 3 | contested |
| `audio-dsp/fade_in_out_f32` | 🏆 `ffmpeg.wasm@0.12.15` | 416.32 x-realtime | `mediabunny@1.48.0` | +97.29% | 2 | contested |
| `mux/video_a_plus_audio_b_to_mkv` | 🏆 `mediabunny@1.48.0` | 484.11 x-realtime | `ffmpeg.wasm@0.12.15` | +252.47% | 2 | contested |
| `demux/mp3_xing` | 🏆 `mediabunny@1.48.0` | 3.01 ms | `ffmpeg.wasm@0.12.15` | +35.48% | 4 | contested |
| `audio-dsp/pcm_s24_to_f32` | 🏆 `ffmpeg.wasm@0.12.15` | 358.17 x-realtime | `mediabunny@1.48.0` | +39.76% | 2 | contested |
| `mux/size_large_1080p_to_mkv` | 🏆 `mediabunny@1.48.0` | 541.65 x-realtime | `ffmpeg.wasm@0.12.15` | +185.57% | 2 | contested |
| `mux/h264_aac_to_mkv` | 🏆 `mediabunny@1.48.0` | 617.73 x-realtime | `ffmpeg.wasm@0.12.15` | +333.59% | 2 | contested |
| `mux/drop_audio_track_subset_to_mp4` | 🏆 `mediabunny@1.48.0` | 710.23 x-realtime | `mp4box@2.3.0` | +153.66% | 3 | contested |
| `remux/h264_ts_ts_to_mov` | 🏆 `mediabunny@1.48.0` | 162.03 x-realtime | `ffmpeg.wasm@0.12.15` | +27.78% | 2 | contested |
| `streaming-output/prop_probe_dur_fragmented_shape` | 🏆 `mp4box@2.3.0` | 82.26 ms | `ffmpeg.wasm@0.12.15` | +23.47% | 3 | contested |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | 0 | no winner |
| `probe/micro_h264_1frame` | 🏆 `remotion-media-parser@4.0.479` | 1.93 ms | `platform@chrome-149` | +15.16% | 7 | contested |
| `probe/perf-extract-metadata-large` | 🏆 `mediabunny@1.48.0` | 376.65 ops/s | `remotion-webcodecs@4.0.479` | +104.33% | 7 | contested |
| `performance/size-ladder-iterate-packets-large` | 🏆 `mp4box@2.3.0` | 60078.79 packets/s | `mediabunny@1.48.0` | +14.11% | 7 | contested |
| `remux/mp3_xing_mp3_to_mkv` | 🏆 `mediabunny@1.48.0` | 1974.33 x-realtime | `ffmpeg.wasm@0.12.15` | +12.34% | 2 | contested |
| `transcode/h264_flip_horizontal` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `remux/prop_ts_to_mp4_duration_materialized` | 🏆 `mediabunny@1.48.0` | 38.17 ms | `ffmpeg.wasm@0.12.15` | +52.1% | 3 | contested |
| `encryption/unencrypted_left_untouched_noop` | 🏆 `ffmpeg.wasm@0.12.15` | 104.73 ms | `mediabunny@1.48.0` | +66.64% | 2 | contested |
| `metadata/write_mkv_tags` | 🏆 `mediabunny@1.48.0` | 17.51 ms | `ffmpeg.wasm@0.12.15` | +76.05% | 2 | contested |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | 0 | no winner |
| `decode-seek/seek_av1_keyframe` | 🏆 `mediabunny@1.48.0` | 15.42 ms | `web-demuxer@4.0.0` | +68.57% | 4 | contested |
| `performance/convert-peak-memory` | 🏆 `mediabunny@1.48.0` | 0 B | `remotion-webcodecs@4.0.479` | +100% | 2 | contested |
| `trim/vp9_keyframe_aligned` | 🏆 `ffmpeg.wasm@0.12.15` | 151.14 x-realtime | `mediabunny@1.48.0` | +801.75% | 2 | contested |
| `streaming-output/mp4_buffer_target` | 🏆 `ffmpeg.wasm@0.12.15` | 281.72 x-realtime | `mediabunny@1.48.0` | +219.2% | 2 | contested |
| `trim/massive_h264_copy_sustained` | `mediabunny@1.48.0` (uncontested) | 0 count | — | — | 1 | uncontested |
| `audio-dsp/edge_variable_channel_count_downmix` | 🏆 `ffmpeg.wasm@0.12.15` | 50.65 ms | `mediabunny@1.48.0` | +3.78% | 2 | contested |
| `probe/tiny_h264_360p_2s` | 🏆 `remotion-media-parser@4.0.479` | 1.61 ms | `mediabunny@1.48.0` | +13.71% | 7 | contested |
| `trim/av1_keyframe_aligned` | `mediabunny@1.48.0` (uncontested) | 17.48 x-realtime | — | — | 1 | uncontested |
| `remux/aac_adts_adts_to_ts` | 🏆 `ffmpeg.wasm@0.12.15` | 1326.85 x-realtime | `mediabunny@1.48.0` | +6.55% | 2 | contested |
| `performance/op-sweep-demux` | 🏆 `remotion-media-parser@4.0.479` | 494748.13 packets/s | `web-demuxer@4.0.0` | +39.12% | 7 | contested |
| `performance/seek-ms` | 🏆 `mediabunny@1.48.0` | 26.16 ms | `ffmpeg.wasm@0.12.15` | +69.29% | 5 | contested |
| `remux/mp3_xing_mp3_to_mp4` | 🏆 `mediabunny@1.48.0` | 2272.73 x-realtime | `ffmpeg.wasm@0.12.15` | +13.52% | 2 | contested |
| `metadata/write_flac_vorbiscomment` | 🏆 `mediabunny@1.48.0` | 5.83 ms | `ffmpeg.wasm@0.12.15` | +71.06% | 2 | contested |
| `mux/prop_vp9_mux_duration_webm_to_webm` | 🏆 `mediabunny@1.48.0` | 40.34 ms | `ffmpeg.wasm@0.12.15` | +62.14% | 2 | contested |
| `transcode/bframe_reorder_h264_to_vp9` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `transcode/vp9_alpha_to_vp8_keepalpha` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `demux/size_micro_micro_audio_short` | 🏆 `mediabunny@1.48.0` | 1.36 ms | `ffmpeg.wasm@0.12.15` | +54.04% | 7 | contested |
| `trim/h264_to_eof_copy` | 🏆 `ffmpeg.wasm@0.12.15` | 467.95 x-realtime | `mediabunny@1.48.0` | +583.34% | 2 | contested |
| `remux/h264_rotated90_mp4_to_mov` | 🏆 `ffmpeg.wasm@0.12.15` | 318.32 x-realtime | `mediabunny@1.48.0` | +210.7% | 2 | contested |
| `remux/hevc_1080p_10s_mp4_to_mkv` | 🏆 `ffmpeg.wasm@0.12.15` | 181.19 x-realtime | `mediabunny@1.48.0` | +61.77% | 2 | contested |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | 🏆 `remotion-webcodecs@4.0.479` | 1257.44 x-realtime | `ffmpeg.wasm@0.12.15` | +144.84% | 4 | contested |
| `metadata/rotation_survives_mp4_mkv` | 🏆 `ffmpeg.wasm@0.12.15` | 77.69 ms | `mediabunny@1.48.0` | +61.51% | 2 | contested |
| `demux/h264_vfr` | 🏆 `remotion-webcodecs@4.0.479` | 3.15 ms | `mp4box@2.3.0` | +63.41% | 5 | contested |
| `probe/h264_1080p_5s` | 🏆 `remotion-media-parser@4.0.479` | 2.86 ms | `mediabunny@1.48.0` | +45.77% | 7 | contested |
| `probe/hevc_1080p_10s` | 🏆 `mediabunny@1.48.0` | 2.39 ms | `remotion-media-parser@4.0.479` | +12.13% | 7 | contested |
| `decode-seek/decode_multitrack_select_video` | 🏆 `mediabunny@1.48.0` | 108.96 fps | `platform@chrome-149` | +3.98% | 5 | contested |
| `metadata/rotation_decode_read_h264_rotated90` | `platform@chrome-149` (uncontested) | 140 ms | — | — | 1 | uncontested |
| `transcode/opus_to_aac_mp4` | 🏆 `mediabunny@1.48.0` | 122.42 x-realtime | `ffmpeg.wasm@0.12.15` | +179.95% | 2 | contested |
| `demux/h264_rotated90` | 🏆 `mediabunny@1.48.0` | 8.39 ms | `mp4box@2.3.0` | +24.52% | 7 | contested |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | 🏆 `mediabunny@1.48.0` | 9.15 ms | `mp4box@2.3.0` | +70.37% | 3 | contested |
| `transcode/mp3_to_aac_mp4` | 🏆 `mediabunny@1.48.0` | 118.82 x-realtime | `remotion-webcodecs@4.0.479` | +3.21% | 3 | contested |
| `decode-seek/decode_h264_first_frames` | 🏆 `mediabunny@1.48.0` | 54.34 fps | `platform@chrome-149` | +11.2% | 5 | contested |
| `performance/metamorphic-vfr-iterate-packets` | 🤝 `remotion-webcodecs@4.0.479`, `remotion-media-parser@4.0.479` | 129977.63 packets/s | `remotion-media-parser@4.0.479` | +0.11% | 5 | tie |
| `probe/h264_vfr` | 🏆 `mediabunny@1.48.0` | 2.09 ms | `remotion-webcodecs@4.0.479` | +33.91% | 7 | contested |
| `remux/h264_in_mkv_mkv_to_mov` | 🏆 `mediabunny@1.48.0` | 787.81 x-realtime | `ffmpeg.wasm@0.12.15` | +449.25% | 2 | contested |
| `transcode/fanout_h264_abr_ladder` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `performance/metamorphic-decode-remux` | 🏆 `ffmpeg.wasm@0.12.15` | 220.63 x-realtime | `mediabunny@1.48.0` | +105.35% | 2 | contested |
| `decode-seek/seek_past_eof` | 🏆 `mediabunny@1.48.0` | 72.3 ms | `platform@chrome-149` | +38.22% | 5 | contested |
| `streaming-output/mp4_faststart_in_memory` | 🏆 `ffmpeg.wasm@0.12.15` | 288.77 x-realtime | `mediabunny@1.48.0` | +183.57% | 2 | contested |
| `trim/vp9_alpha_keyframe_aligned` | `mediabunny@1.48.0` (uncontested) | 10.8 x-realtime | — | — | 1 | uncontested |
| `decode-seek/decode_tiny_dims_1x1` | 🏆 `platform@chrome-149` | 4010.03 fps | `mediabunny@1.48.0` | +33.58% | 5 | contested |
| `demux/size_huge_huge_h264_1080p_600s` | 🏆 `web-demuxer@4.0.0` | 16.64 ms | `remotion-webcodecs@4.0.479` | +56.96% | 6 | contested |
| `demux/flac_seektable` | 🏆 `ffmpeg.wasm@0.12.15` | 3.04 ms | `mediabunny@1.48.0` | +3.03% | 4 | contested |
| `decode-seek/decode_bframes_reorder` | 🏆 `mediabunny@1.48.0` | 55.81 fps | `web-demuxer@4.0.0` | +11.67% | 5 | contested |
| `demux/size_tiny_tiny_h264_360p_2s` | 🏆 `mediabunny@1.48.0` | 2.24 ms | `mp4box@2.3.0` | +3.66% | 7 | contested |
| `mux/prop_h264_mux_duration_mp4_to_ts` | 🏆 `mediabunny@1.48.0` | 80.21 ms | `ffmpeg.wasm@0.12.15` | +54.72% | 2 | contested |
| `transcode/h264_to_vp9_webm` | 🤝 `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `remotion-webcodecs@4.0.479` | +0% | 2 | tie |
| `decode-seek/decode_size_tiny_h264_360p` | 🏆 `ffmpeg.wasm@0.12.15` | 351.89 fps | `mediabunny@1.48.0` | +18.04% | 5 | contested |
| `mux/edge_multitrack_keep_all_to_mp4` | 🏆 `mediabunny@1.48.0` | 750.47 x-realtime | `mp4box@2.3.0` | +321.88% | 3 | contested |
| `transcode/h264_to_ts` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `probe/mp3_cbr_notoc` | 🏆 `remotion-webcodecs@4.0.479` | 1.6 ms | `ffmpeg.wasm@0.12.15` | +37.74% | 4 | contested |
| `transcode/h264_crop_center` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `decode-seek/seek_vp8_keyframe` | 🏆 `mediabunny@1.48.0` | 15.03 ms | `ffmpeg.wasm@0.12.15` | +37.64% | 5 | contested |
| `trim/h264_keyframe_aligned` | 🏆 `ffmpeg.wasm@0.12.15` | 338.54 x-realtime | `mediabunny@1.48.0` | +968.95% | 2 | contested |
| `trim/audio_flac_noseektable_copy` | `ffmpeg.wasm@0.12.15` (uncontested) | 1332.45 x-realtime | — | — | 1 | uncontested |
| `performance/size-ladder-iterate-packets-massive` | 🏆 `remotion-webcodecs@4.0.479` | 13238483.62 packets/s | `web-demuxer@4.0.0` | +42.97% | 7 | contested |
| `probe/opus` | 🏆 `mediabunny@1.48.0` | 1.65 ms | `ffmpeg.wasm@0.12.15` | +36.73% | 2 | contested |
| `trim/hevc_keyframe_aligned` | 🏆 `ffmpeg.wasm@0.12.15` | 217.25 x-realtime | `mediabunny@1.48.0` | +985.07% | 2 | contested |
| `decode-seek/seek_hevc_keyframe` | 🏆 `mediabunny@1.48.0` | 24.63 ms | `platform@chrome-149` | +55.54% | 5 | contested |
| `streaming-output/prop_decode_equals_buffer_shape` | 🏆 `ffmpeg.wasm@0.12.15` | 94.17 ms | `mediabunny@1.48.0` | +82.25% | 2 | contested |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | 🏆 `mediabunny@1.48.0` | 10.34 ms | `ffmpeg.wasm@0.12.15` | +78.25% | 2 | contested |
| `trim/hevc_frame_accurate` | `mediabunny@1.48.0` (uncontested) | 19.02 x-realtime | — | — | 1 | uncontested |
| `transcode/aac_to_pcm_wav_extract` | 🏆 `ffmpeg.wasm@0.12.15` | 501.05 x-realtime | `mediabunny@1.48.0` | +114.06% | 3 | contested |
| `mux/three_track_assembly_to_mkv` | 🏆 `mediabunny@1.48.0` | 579.54 x-realtime | `ffmpeg.wasm@0.12.15` | +314.59% | 2 | contested |
| `decode-seek/decode_av1` | 🏆 `mediabunny@1.48.0` | 140.54 fps | `platform@chrome-149` | +13.98% | 4 | contested |
| `performance/size-ladder-iterate-packets-huge` | 🏆 `remotion-webcodecs@4.0.479` | 9962418.95 packets/s | `web-demuxer@4.0.0` | +26.89% | 7 | contested |
| `trim/h264_start_zero_copy` | 🏆 `mediabunny@1.48.0` | 540.64 x-realtime | `ffmpeg.wasm@0.12.15` | +44.03% | 2 | contested |
| `transcode/hdr10_to_sdr_tonemap` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `probe/cenc_cbcs` | 🏆 `mediabunny@1.48.0` | 2.16 ms | `mp4box@2.3.0` | +70.53% | 7 | contested |
| `decode-seek/decode_size_tiny_vp9_360p` | 🏆 `remotion-webcodecs@4.0.479` | 344.93 fps | `mediabunny@1.48.0` | +9.74% | 5 | contested |
| `decode-seek/seek_repeated_same_target` | 🏆 `mediabunny@1.48.0` | 33.84 ms | `platform@chrome-149` | +55.55% | 5 | contested |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | 🏆 `ffmpeg.wasm@0.12.15` | 1395.34 x-realtime | `mediabunny@1.48.0` | +450.52% | 2 | contested |
| `transcode/mp3_to_opus_webm` | 🏆 `mediabunny@1.48.0` | 81.58 x-realtime | `remotion-webcodecs@4.0.479` | +36.54% | 2 | contested |
| `probe/metamorphic-recorder-headerless-sane-duration` | 🏆 `mediabunny@1.48.0` | 1.72 ms | `ffmpeg.wasm@0.12.15` | +40.72% | 6 | contested |
| `audio-dsp/throughput_decode_s24` | 🏆 `mediabunny@1.48.0` | 142098.87 fps | `ffmpeg.wasm@0.12.15` | +32.77% | 2 | contested |
| `remux/flac_seektable_flac_to_mkv` | 🏆 `mediabunny@1.48.0` | 2141.33 x-realtime | `ffmpeg.wasm@0.12.15` | +17.77% | 2 | contested |
| `trim/h264_bframes_frame_accurate` | 🏆 `mediabunny@1.48.0` | 23.65 x-realtime | `ffmpeg.wasm@0.12.15` | +1506.38% | 2 | contested |
| `probe/big_buck_bunny_1080p_h264` | 🏆 `mediabunny@1.48.0` | 6.22 ms | `remotion-webcodecs@4.0.479` | +45.82% | 7 | contested |
| `trim/large_h264_frame_accurate_throughput` | 🏆 `mediabunny@1.48.0` | 186.74 x-realtime | `ffmpeg.wasm@0.12.15` | +3042.7% | 2 | contested |
| `transcode/wav_to_vorbis_ogg` | `ffmpeg.wasm@0.12.15` (uncontested) | 88.5 x-realtime | — | — | 1 | uncontested |
| `remux/prop_multitrack_survives_mp4_mkv` | 🏆 `mediabunny@1.48.0` | 90 ms | `ffmpeg.wasm@0.12.15` | +20.19% | 2 | contested |
| `decode-seek/seek_zero` | 🏆 `mediabunny@1.48.0` | 26.46 ms | `platform@chrome-149` | +65.78% | 5 | contested |
| `performance/size-ladder-iterate-packets-tiny` | 🏆 `mp4box@2.3.0` | 75060.53 packets/s | `mediabunny@1.48.0` | +77.97% | 7 | contested |
| `decode-seek/decode_h264_10bit` | 🏆 `platform@chrome-149` | 69.5 fps | `web-demuxer@4.0.0` | +7.72% | 5 | contested |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | 🏆 `ffmpeg.wasm@0.12.15` | 325.26 x-realtime | `mediabunny@1.48.0` | +212.15% | 2 | contested |
| `demux/realworld_mdn_flower_webm` | 🏆 `mediabunny@1.48.0` | 3.9 ms | `platform@chrome-149` | +19.59% | 6 | contested |
| `mux/h264_aac_to_mov` | 🏆 `mediabunny@1.48.0` | 449.37 x-realtime | `ffmpeg.wasm@0.12.15` | +196.89% | 2 | contested |
| `remux/h264_ts_ts_to_mp4` | 🏆 `mediabunny@1.48.0` | 207.9 x-realtime | `ffmpeg.wasm@0.12.15` | +69.05% | 3 | contested |
| `performance/op-sweep-transcode-webm` | 🏆 `mediabunny@1.48.0` | 416.29 fps | `remotion-webcodecs@4.0.479` | +96.55% | 2 | contested |
| `remux/flac_seektable_flac_to_ogg` | `ffmpeg.wasm@0.12.15` (uncontested) | 1901.14 x-realtime | — | — | 1 | uncontested |
| `performance/size-ladder-extract-metadata-huge` | 🏆 `remotion-media-parser@4.0.479` | 144.09 ops/s | `mediabunny@1.48.0` | +5.76% | 7 | contested |
| `transcode/h264_rotate_270_dimswap` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `trim/ts_keyframe_aligned` | 🏆 `ffmpeg.wasm@0.12.15` | 130.74 x-realtime | `mediabunny@1.48.0` | +494.66% | 2 | contested |
| `audio-dsp/edge_gapless_aac_decode` | `mediabunny@1.48.0` (uncontested) | 3.35 ms | — | — | 1 | uncontested |
| `performance/size-ladder-demux-peak-memory-large4k` | 🤝 `ffmpeg.wasm@0.12.15`, `platform@chrome-149`, `remotion-media-parser@4.0.479`, `remotion-webcodecs@4.0.479`, `web-demuxer@4.0.0` | 0 B | `platform@chrome-149` | +0% | 7 | tie |
| `performance/metamorphic-transcode-idempotent-source-res` | 🏆 `mediabunny@1.48.0` | 207.48 fps | `remotion-webcodecs@4.0.479` | +18.24% | 2 | contested |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | 🏆 `mediabunny@1.48.0` | 900.56 x-realtime | `ffmpeg.wasm@0.12.15` | +257.59% | 2 | contested |
| `mux/h264_aac_to_mp4` | 🏆 `mediabunny@1.48.0` | 615.38 x-realtime | `mp4box@2.3.0` | +173.81% | 3 | contested |
| `audio-dsp/meta_idempotent_resample_same_rate` | 🏆 `mediabunny@1.48.0` | 4.24 ms | `ffmpeg.wasm@0.12.15` | +82.8% | 2 | contested |
| `trim/mkv_keyframe_aligned` | 🏆 `ffmpeg.wasm@0.12.15` | 139 x-realtime | `mediabunny@1.48.0` | +747.74% | 2 | contested |
| `demux/size_large_large_vp9_1080p_120s` | 🏆 `platform@chrome-149` | 197.04 ms | `mediabunny@1.48.0` | +6.44% | 6 | contested |
| `audio-dsp/edge_longform_audio_resample_16k` | 🏆 `ffmpeg.wasm@0.12.15` | 3850.39 ms | `mediabunny@1.48.0` | +37.88% | 3 | contested |
| `decode-seek/decode_size_large_vp9_120s` | 🏆 `mediabunny@1.48.0` | 55.37 fps | `web-demuxer@4.0.0` | +12.46% | 5 | contested |
| `decode-seek/seek_h264_nonkeyframe` | 🏆 `mediabunny@1.48.0` | 60.82 ms | `platform@chrome-149` | +33.66% | 5 | contested |
| `transcode/hevc_to_h264_mp4` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `mediabunny@1.48.0` | +0% | 3 | tie |
| `probe/longform_1h_audio` | 🏆 `remotion-media-parser@4.0.479` | 5.64 ms | `mediabunny@1.48.0` | +56.36% | 7 | contested |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `demux/size_large_large_h264_1080p_120s` | 🏆 `platform@chrome-149` | 166.64 ms | `mp4box@2.3.0` | +3.65% | 7 | contested |
| `remux/h264_multitrack_mp4_to_mkv` | 🏆 `ffmpeg.wasm@0.12.15` | 279.1 x-realtime | `mediabunny@1.48.0` | +144.46% | 2 | contested |
| `audio-dsp/throughput_encode_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `remux/prop_recorder_headerless_duration_materialized` | 🏆 `mediabunny@1.48.0` | 6.04 ms | `ffmpeg.wasm@0.12.15` | +63.33% | 2 | contested |
| `probe/tiny_vp9_360p_2s` | 🏆 `mediabunny@1.48.0` | 1.2 ms | `remotion-media-parser@4.0.479` | +65.95% | 6 | contested |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | 🏆 `mediabunny@1.48.0` | 50.35 ms | `ffmpeg.wasm@0.12.15` | +75.03% | 2 | contested |
| `transcode/extreme_fps_240` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `decode-seek/decode_h264_4k` | 🏆 `platform@chrome-149` | 14.31 fps | `web-demuxer@4.0.0` | +3.17% | 5 | contested |
| `demux/h264_ts` | 🏆 `mediabunny@1.48.0` | 42.22 ms | `ffmpeg.wasm@0.12.15` | +14.06% | 4 | contested |
| `probe/realworld_mdn_flower_mp4` | 🏆 `mediabunny@1.48.0` | 1.54 ms | `remotion-media-parser@4.0.479` | +28.31% | 7 | contested |
| `performance/size-ladder-extract-metadata-tiny` | 🏆 `mp4box@2.3.0` | 354.61 ops/s | `remotion-media-parser@4.0.479` | +39.36% | 7 | contested |
| `probe/av1_720p_5s` | 🏆 `web-demuxer@4.0.0` | 5.82 ms | `remotion-media-parser@4.0.479` | +25% | 6 | contested |
| `demux/wav_s24` | 🏆 `remotion-webcodecs@4.0.479` | 4.45 ms | `mediabunny@1.48.0` | +19.89% | 5 | contested |
| `performance/metamorphic-probe-duration-cross-container` | 🏆 `mediabunny@1.48.0` | 8.64 x-realtime | `remotion-webcodecs@4.0.479` | +25.68% | 2 | contested |
| `decode-seek/decode_extreme_fps_1` | 🏆 `remotion-webcodecs@4.0.479` | 1336.01 fps | `platform@chrome-149` | +35.69% | 5 | contested |
| `metadata/read_no_tags_recorder_webm` | 🏆 `mediabunny@1.48.0` | 2.21 ms | `ffmpeg.wasm@0.12.15` | +59.85% | 6 | contested |
| `remux/h264_1080p_30s_mp4_to_ts` | 🏆 `ffmpeg.wasm@0.12.15` | 252.84 x-realtime | `mediabunny@1.48.0` | +152.09% | 2 | contested |
| `demux/empty_audio_zero_packets` | 🏆 `mediabunny@1.48.0` | 1.09 ms | `ffmpeg.wasm@0.12.15` | +38.31% | 5 | contested |
| `transcode/vp9_to_vp8_webm` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `streaming-output/mp4_faststart_reserve` | 🏆 `mediabunny@1.48.0` | 452.86 x-realtime | `ffmpeg.wasm@0.12.15` | +59.07% | 2 | contested |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | 🏆 `ffmpeg.wasm@0.12.15` | 103.84 ms | `mediabunny@1.48.0` | +63.25% | 2 | contested |
| `transcode/aac_to_opus_webm` | 🏆 `mediabunny@1.48.0` | 109.5 x-realtime | `remotion-webcodecs@4.0.479` | +19.71% | 2 | contested |
| `performance/op-sweep-remux-mp4-to-mkv` | 🏆 `ffmpeg.wasm@0.12.15` | 204.97 x-realtime | `mediabunny@1.48.0` | +99.76% | 2 | contested |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | 0 | no winner |
| `decode-seek/meta_pts_monotonic_after_reorder` | 🏆 `mediabunny@1.48.0` | 1066.12 ms | `remotion-webcodecs@4.0.479` | +7.99% | 5 | contested |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | 0 | no winner |
| `decode-seek/seek_vp9_keyframe` | 🏆 `mediabunny@1.48.0` | 42.14 ms | `web-demuxer@4.0.0` | +60.2% | 5 | contested |
| `metadata/read_flac_seektable` | 🏆 `mediabunny@1.48.0` | 1.39 ms | `remotion-media-parser@4.0.479` | +22.41% | 4 | contested |
| `probe/metamorphic-duration-across-containers` | 🏆 `mediabunny@1.48.0` | 10.19 ms | `remotion-webcodecs@4.0.479` | +15.34% | 6 | contested |
| `mux/av1_opus_to_mp4` | `mediabunny@1.48.0` (uncontested) | 611.85 x-realtime | — | — | 1 | uncontested |
| `trim/h264_rotated_keyframe_aligned` | 🏆 `ffmpeg.wasm@0.12.15` | 250.06 x-realtime | `mediabunny@1.48.0` | +795.4% | 2 | contested |
| `mux/flac_to_mkv_audio` | 🏆 `mediabunny@1.48.0` | 1696.35 x-realtime | `ffmpeg.wasm@0.12.15` | +257% | 2 | contested |
| `probe/micro_audio_short` | 🏆 `mediabunny@1.48.0` | 1.48 ms | `mp4box@2.3.0` | +22.11% | 7 | contested |
| `transcode/vp9_to_h264_mp4` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `mediabunny@1.48.0` | +0% | 3 | tie |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | 🏆 `mediabunny@1.48.0` | 286.98 fps | `remotion-webcodecs@4.0.479` | +4.21% | 3 | contested |
| `decode-seek/decode_vp9_alpha` | 🏆 `mediabunny@1.48.0` | 124.46 fps | `platform@chrome-149` | +47.11% | 2 | contested |
| `performance/size-ladder-extract-metadata-medium` | 🏆 `remotion-media-parser@4.0.479` | 349.65 ops/s | `remotion-webcodecs@4.0.479` | +152.62% | 7 | contested |
| `audio-dsp/upmix_stereo_to_5_1` | 🏆 `ffmpeg.wasm@0.12.15` | 182.08 x-realtime | `mediabunny@1.48.0` | +165.7% | 2 | contested |
| `audio-dsp/pcm_s24be_to_s16le` | `ffmpeg.wasm@0.12.15` (uncontested) | 490.92 x-realtime | — | — | 1 | uncontested |
| `transcode/wav_to_opus_ogg` | `mediabunny@1.48.0` (uncontested) | 133.17 x-realtime | — | — | 1 | uncontested |
| `demux/wav_f32` | 🏆 `mediabunny@1.48.0` | 7.28 ms | `ffmpeg.wasm@0.12.15` | +14.35% | 3 | contested |
| `remux/prop_rotation_survives_mp4_mov` | 🏆 `ffmpeg.wasm@0.12.15` | 36.84 ms | `mediabunny@1.48.0` | +84.44% | 2 | contested |
| `probe/empty-audio-wav` | 🏆 `remotion-webcodecs@4.0.479` | 1.1 ms | `remotion-media-parser@4.0.479` | +27.15% | 5 | contested |
| `transcode/bframe_reorder_h264_to_h264` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `demux/aac_adts` | 🏆 `mediabunny@1.48.0` | 3.82 ms | `remotion-webcodecs@4.0.479` | +40.27% | 4 | contested |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | 🏆 `ffmpeg.wasm@0.12.15` | 156.47 ms | `mediabunny@1.48.0` | +72.03% | 2 | contested |
| `audio-dsp/edge_longform_audio_probe` | 🏆 `mediabunny@1.48.0` | 2.07 ms | `remotion-media-parser@4.0.479` | +7.59% | 5 | contested |
| `decode-seek/decode_size_micro_h264_1frame` | 🏆 `remotion-webcodecs@4.0.479` | 259.4 fps | `platform@chrome-149` | +23.22% | 5 | contested |
| `mux/size_micro_1frame_to_mp4` | 🏆 `mediabunny@1.48.0` | 333.89 x-realtime | `mp4box@2.3.0` | +25.88% | 3 | contested |
| `mux/edge_rotation_decode_mux_mkv` | 🏆 `mediabunny@1.48.0` | 38.18 ms | `ffmpeg.wasm@0.12.15` | +27.09% | 2 | contested |
| `metadata/read_h264_in_mkv` | 🏆 `mediabunny@1.48.0` | 6.94 ms | `remotion-media-parser@4.0.479` | +29.18% | 6 | contested |
| `performance/extract-metadata` | 🏆 `mediabunny@1.48.0` | 602.41 ops/s | `remotion-media-parser@4.0.479` | +32.83% | 7 | contested |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | 🏆 `ffmpeg.wasm@0.12.15` | 105.44 ms | `mediabunny@1.48.0` | +62.91% | 2 | contested |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | 0 | no winner |
| `metadata/read_h264_multitrack` | 🏆 `mediabunny@1.48.0` | 3.78 ms | `remotion-webcodecs@4.0.479` | +13.09% | 7 | contested |
| `performance/size-ladder-extract-metadata-massive` | 🏆 `mediabunny@1.48.0` | 37.85 ops/s | `remotion-webcodecs@4.0.479` | +111.51% | 7 | contested |
| `mux/edge_hevc_decode_mux_mkv` | 🏆 `mediabunny@1.48.0` | 22.52 ms | `ffmpeg.wasm@0.12.15` | +74.7% | 2 | contested |
| `transcode/h264_to_av1_mp4` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `demux/pcm_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | 6.82 ms | — | — | 1 | uncontested |
| `probe/h264_1080p_30s` | 🏆 `remotion-media-parser@4.0.479` | 2.32 ms | `remotion-webcodecs@4.0.479` | +41.8% | 7 | contested |
| `probe/cenc_ctr` | 🏆 `mp4box@2.3.0` | 6.31 ms | `remotion-media-parser@4.0.479` | +16.19% | 6 | contested |
| `probe/h264_ts` | 🏆 `mediabunny@1.48.0` | 23.31 ms | `ffmpeg.wasm@0.12.15` | +46.62% | 5 | contested |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | `ffmpeg.wasm@0.12.15` (uncontested) | 43.59 ms | — | — | 1 | uncontested |
| `remux/h264_in_mkv_mkv_to_mp4` | 🏆 `mediabunny@1.48.0` | 657.55 x-realtime | `ffmpeg.wasm@0.12.15` | +463.65% | 3 | contested |
| `transcode/flac_to_opus_webm` | — | — | — | — | 0 | no winner |
| `remux/h264_ts_ts_to_mkv` | 🏆 `mediabunny@1.48.0` | 183.43 x-realtime | `ffmpeg.wasm@0.12.15` | +48.61% | 2 | contested |
| `demux/h264_multitrack` | 🏆 `mediabunny@1.48.0` | 9.6 ms | `mp4box@2.3.0` | +34.85% | 7 | contested |
| `transcode/h264_fps_30_to_60` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `trim/mov_keyframe_aligned` | 🏆 `ffmpeg.wasm@0.12.15` | 111.61 x-realtime | `mediabunny@1.48.0` | +900.39% | 2 | contested |
| `remux/vp8_720p_10s_webm_to_mkv` | 🏆 `mediabunny@1.48.0` | 1604.33 x-realtime | `ffmpeg.wasm@0.12.15` | +95.51% | 2 | contested |
| `demux/h264_1080p_30s` | 🏆 `web-demuxer@4.0.0` | 3.35 ms | `remotion-media-parser@4.0.479` | +56.32% | 7 | contested |
| `audio-dsp/pcm_s16le_to_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | 244.56 x-realtime | — | — | 1 | uncontested |
| `demux/vp9_alpha` | 🏆 `mediabunny@1.48.0` | 3.9 ms | `platform@chrome-149` | +39.49% | 6 | contested |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | 0 | no winner |
| `decode-seek/decode_rotated_display_matrix` | 🏆 `mediabunny@1.48.0` | 112.38 fps | `platform@chrome-149` | +17.87% | 4 | contested |
| `probe/perf-extract-metadata-massive` | 🏆 `remotion-media-parser@4.0.479` | 16.35 ops/s | `mediabunny@1.48.0` | +32.47% | 7 | contested |
| `mux/mp3_to_mp4_audio` | 🏆 `mediabunny@1.48.0` | 1447.18 x-realtime | `ffmpeg.wasm@0.12.15` | +6.15% | 2 | contested |
| `mux/mp3_to_mp3` | 🏆 `mediabunny@1.48.0` | 2649.01 x-realtime | `ffmpeg.wasm@0.12.15` | +396.29% | 2 | contested |
| `mux/mp4_streaming_target` | — | — | — | — | 0 | no winner |
| `mux/h264_aac_to_ts` | 🏆 `mediabunny@1.48.0` | 330.72 x-realtime | `ffmpeg.wasm@0.12.15` | +150.47% | 2 | contested |
| `transcode/h264_colorspace_709_to_2020` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `remux/prop_roundtrip_mp4_mkv_mp4` | 🏆 `ffmpeg.wasm@0.12.15` | 145.4 ms | `mediabunny@1.48.0` | +48.42% | 2 | contested |
| `transcode/hevc_to_vp8_webm` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `mux/size_micro_1frame_to_mkv` | 🏆 `mediabunny@1.48.0` | 243.9 x-realtime | `ffmpeg.wasm@0.12.15` | +109.02% | 2 | contested |
| `transcode/wav_to_flac` | `ffmpeg.wasm@0.12.15` (uncontested) | 193.87 x-realtime | — | — | 1 | uncontested |
| `probe/large_vp9_1080p_120s` | 🏆 `mediabunny@1.48.0` | 10.15 ms | `web-demuxer@4.0.0` | +74.78% | 6 | contested |
| `probe/hls_aes128` | 🏆 `mediabunny@1.48.0` | 31.9 ms | `ffmpeg.wasm@0.12.15` | +26.7% | 2 | contested |
| `remux/h264_1080p_30s_mp4_to_mov` | 🏆 `ffmpeg.wasm@0.12.15` | 171.29 x-realtime | `mediabunny@1.48.0` | +62.47% | 2 | contested |
| `mux/size_longform_audio_to_mp4` | 🏆 `ffmpeg.wasm@0.12.15` | 7282.36 x-realtime | `mp4box@2.3.0` | +472.84% | 3 | contested |
| `decode-seek/decode_size_huge_h264_600s` | 🤝 `web-demuxer@4.0.0`, `mediabunny@1.48.0` | 51.76 fps | `mediabunny@1.48.0` | +1.78% | 3 | tie |
| `audio-dsp/resample_48k_to_16k` | 🏆 `remotion-webcodecs@4.0.479` | 295.95 x-realtime | `mediabunny@1.48.0` | +32.85% | 3 | contested |
| `remux/opus_ogg_to_mkv` | 🏆 `mediabunny@1.48.0` | 1809.58 x-realtime | `ffmpeg.wasm@0.12.15` | +10.94% | 2 | contested |
| `encryption/perf_cenc_ctr_decrypt_throughput` | `ffmpeg.wasm@0.12.15` (uncontested) | 204.73 x-realtime | — | — | 1 | uncontested |
| `mux/pcm_s16_to_wav` | 🏆 `mediabunny@1.48.0` | 1176.47 x-realtime | `ffmpeg.wasm@0.12.15` | +577.53% | 2 | contested |
| `metadata/read_opus` | 🏆 `mediabunny@1.48.0` | 1.85 ms | `ffmpeg.wasm@0.12.15` | +27.4% | 2 | contested |
| `performance/size-ladder-extract-metadata-large` | 🏆 `remotion-media-parser@4.0.479` | 357.78 ops/s | `mediabunny@1.48.0` | +35.06% | 7 | contested |
| `decode-seek/decode_mkv_h264` | 🏆 `remotion-webcodecs@4.0.479` | 126.17 fps | `platform@chrome-149` | +21.05% | 5 | contested |
| `demux/vp8_720p_10s` | 🏆 `mediabunny@1.48.0` | 4.76 ms | `platform@chrome-149` | +29.69% | 6 | contested |
| `trim/audio_aac_adts_copy` | 🏆 `mediabunny@1.48.0` | 1901.61 x-realtime | `ffmpeg.wasm@0.12.15` | +16.68% | 2 | contested |
| `mux/size_large_1080p_to_mp4` | 🏆 `mediabunny@1.48.0` | 549.11 x-realtime | `mp4box@2.3.0` | +99.03% | 3 | contested |
| `audio-dsp/pcm_f32_to_s16` | 🏆 `ffmpeg.wasm@0.12.15` | 327.12 x-realtime | `mediabunny@1.48.0` | +20.67% | 2 | contested |
| `mux/size_tiny_360p_to_mp4` | 🏆 `mediabunny@1.48.0` | 501.25 x-realtime | `mp4box@2.3.0` | +77.94% | 3 | contested |
| `decode-seek/decode_extreme_fps_240` | 🏆 `web-demuxer@4.0.0` | 1765.74 fps | `remotion-webcodecs@4.0.479` | +5.24% | 5 | contested |
| `transcode/h264_crf_quality_mode` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `encryption/cenc_ctr_decrypt` | `ffmpeg.wasm@0.12.15` (uncontested) | 114.28 x-realtime | — | — | 1 | uncontested |
| `audio-dsp/pcm_s16_to_f32` | 🏆 `mediabunny@1.48.0` | 461.04 x-realtime | `ffmpeg.wasm@0.12.15` | +269.66% | 2 | contested |
| `transcode/h264_to_mov` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `metadata/read_vp9_1080p_10s` | 🏆 `mediabunny@1.48.0` | 7.75 ms | `remotion-media-parser@4.0.479` | +37.34% | 6 | contested |
| `probe/huge_h264_1080p_600s` | 🏆 `remotion-media-parser@4.0.479` | 5.49 ms | `mediabunny@1.48.0` | +10.15% | 7 | contested |
| `mux/edge_hevc_decode_mux_mp4` | 🏆 `mediabunny@1.48.0` | 35.44 ms | `ffmpeg.wasm@0.12.15` | +42.75% | 2 | contested |
| `audio-dsp/aiff_container_probe` | `ffmpeg.wasm@0.12.15` (uncontested) | 282.09 ops/s | — | — | 1 | uncontested |
| `transcode/wav_to_aac_mp4` | 🏆 `mediabunny@1.48.0` | 144.4 x-realtime | `remotion-webcodecs@4.0.479` | +51.35% | 3 | contested |
| `demux/flac_noseektable` | 🏆 `ffmpeg.wasm@0.12.15` | 3.16 ms | `mediabunny@1.48.0` | +12.47% | 4 | contested |
| `probe/realworld_mdn_trex_mp3` | 🏆 `remotion-webcodecs@4.0.479` | 2.28 ms | `ffmpeg.wasm@0.12.15` | +8.06% | 4 | contested |
| `transcode/h264_to_fragmented_mp4` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `probe/h264_multitrack` | 🏆 `mediabunny@1.48.0` | 2.69 ms | `remotion-media-parser@4.0.479` | +11.78% | 7 | contested |
| `performance/size-ladder-iterate-packets-large4k` | 🏆 `mediabunny@1.48.0` | 30207.92 packets/s | `platform@chrome-149` | +72.28% | 7 | contested |
| `remux/prop_bframes_decode_remux_mp4_mkv` | 🏆 `mediabunny@1.48.0` | 89.65 ms | `ffmpeg.wasm@0.12.15` | +36.63% | 2 | contested |
| `streaming-output/prop_probe_dur_buffer_shape` | 🏆 `ffmpeg.wasm@0.12.15` | 191.7 ms | `mediabunny@1.48.0` | +41.22% | 2 | contested |
| `encryption/hls_aes128_decrypt_eq_cleartext` | 🏆 `mediabunny@1.48.0` | 83.94 ms | `ffmpeg.wasm@0.12.15` | +16.77% | 2 | contested |
| `trim/h264_keyframe_aligned_short` | 🏆 `ffmpeg.wasm@0.12.15` | 453.27 x-realtime | `mediabunny@1.48.0` | +414.2% | 2 | contested |
| `streaming-output/prop_faststart_reserve_duration_invariant` | 🏆 `mediabunny@1.48.0` | 49.28 ms | `ffmpeg.wasm@0.12.15` | +59.23% | 2 | contested |
| `decode-seek/seek_vfr_arbitrary` | 🏆 `platform@chrome-149` | 43.35 ms | `mediabunny@1.48.0` | +12.42% | 5 | contested |
| `transcode/aac_to_mp3_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | 92.22 x-realtime | — | — | 1 | uncontested |
| `decode-seek/seek_bframes_midgop` | 🤝 `mediabunny@1.48.0`, `platform@chrome-149` | 96.47 ms | `platform@chrome-149` | +0.25% | 5 | tie |
| `remux/vp9_1080p_10s_webm_to_webm` | 🏆 `mediabunny@1.48.0` | 509.05 x-realtime | `ffmpeg.wasm@0.12.15` | +214.24% | 3 | contested |
| `demux/h264_4k_10s` | 🏆 `mediabunny@1.48.0` | 24.39 ms | `mp4box@2.3.0` | +50.6% | 7 | contested |
| `probe/hls_vod` | 🏆 `mediabunny@1.48.0` | 19.47 ms | `ffmpeg.wasm@0.12.15` | +58.62% | 4 | contested |
| `metadata/read_pcm_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | 4.96 ms | — | — | 1 | uncontested |
| `audio-dsp/caf_container_probe` | `ffmpeg.wasm@0.12.15` (uncontested) | 69.86 ops/s | — | — | 1 | uncontested |
| `probe/pcm_s16be` | `ffmpeg.wasm@0.12.15` (uncontested) | 3.41 ms | — | — | 1 | uncontested |
| `demux/h264_bframes_1080p` | 🏆 `mp4box@2.3.0` | 23.2 ms | `platform@chrome-149` | +41.56% | 5 | contested |
| `mux/vp9_opus_to_webm` | 🏆 `mediabunny@1.48.0` | 426.05 x-realtime | `ffmpeg.wasm@0.12.15` | +327.52% | 2 | contested |
| `transcode/vp9_to_av1_webm` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `performance/size-ladder-extract-metadata-large4k` | 🏆 `mediabunny@1.48.0` | 536.19 ops/s | `remotion-media-parser@4.0.479` | +76.68% | 7 | contested |
| `transcode/extreme_fps_1` | 🤝 `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0` | 0 fps | `mediabunny@1.48.0` | +0% | 2 | tie |
| `performance/iterate-video-packets` | 🏆 `web-demuxer@4.0.0` | 561557.18 packets/s | `remotion-media-parser@4.0.479` | +431.27% | 7 | contested |
| `trim/h264_vfr_frame_accurate` | 🏆 `mediabunny@1.48.0` | 64.85 x-realtime | `ffmpeg.wasm@0.12.15` | +1035.04% | 2 | contested |
| `decode-seek/decode_open_gop_first_frame` | 🏆 `remotion-webcodecs@4.0.479` | 49.24 fps | `platform@chrome-149` | +3.04% | 5 | contested |
| `remux/prop_adts_to_mp4_duration_invariant` | 🏆 `mediabunny@1.48.0` | 3.91 ms | `ffmpeg.wasm@0.12.15` | +29.01% | 3 | contested |
| `transcode/av1_to_vp9_webm` | 🤝 `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `remotion-webcodecs@4.0.479` | +0% | 2 | tie |
| `transcode/h264_to_mkv` | `mediabunny@1.48.0` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `probe/massive_vp9_1080p_2h` | 🏆 `remotion-media-parser@4.0.479` | 4.43 ms | `mediabunny@1.48.0` | +57.55% | 6 | contested |
| `metadata/read_mp3_xing` | 🏆 `remotion-media-parser@4.0.479` | 1.5 ms | `mediabunny@1.48.0` | +11.99% | 4 | contested |
| `demux/vp9_1080p_10s` | 🏆 `mediabunny@1.48.0` | 13 ms | `platform@chrome-149` | +45.31% | 6 | contested |
| `trim/h264_noop_full_range_idempotent` | 🏆 `mediabunny@1.48.0` | 689.89 x-realtime | `ffmpeg.wasm@0.12.15` | +182.51% | 2 | contested |
| `mux/edge_bframes_decode_mux_mp4` | 🏆 `mediabunny@1.48.0` | 17.26 ms | `ffmpeg.wasm@0.12.15` | +89.47% | 2 | contested |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | 🤝 `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `remotion-webcodecs@4.0.479` | +0% | 2 | tie |
| `probe/vp9_alpha` | 🤝 `remotion-webcodecs@4.0.479`, `platform@chrome-149` | 5.44 ms | `platform@chrome-149` | +1.54% | 6 | tie |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | 0 | no winner |
| `transcode/roundtrip_leg1_h264_to_vp9` | 🤝 `mediabunny@1.48.0`, `remotion-webcodecs@4.0.479` | 0 fps | `remotion-webcodecs@4.0.479` | +0% | 2 | tie |
| `trim/h264_subframe_range_frame_accurate` | 🏆 `mediabunny@1.48.0` | 190.99 x-realtime | `ffmpeg.wasm@0.12.15` | +758.69% | 2 | contested |
| `demux/av1_720p_5s` | 🏆 `mediabunny@1.48.0` | 6.29 ms | `platform@chrome-149` | +20.47% | 6 | contested |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | 0 | no winner |
| `transcode/vp8_to_h264_mp4` | `ffmpeg.wasm@0.12.15` (uncontested) | 0 fps | — | — | 1 | uncontested |
| `mux/vp9_video_plus_opus_audio_to_webm` | 🏆 `mediabunny@1.48.0` | 298.66 x-realtime | `ffmpeg.wasm@0.12.15` | +232.93% | 2 | contested |
| `decode-seek/decode_size_large_h264_120s` | 🏆 `mediabunny@1.48.0` | 56.78 fps | `web-demuxer@4.0.0` | +10.6% | 5 | contested |
| `transcode/gapless_pcm_to_aac_priming` | 🏆 `mediabunny@1.48.0` | 45.5 ms | `remotion-webcodecs@4.0.479` | +30.26% | 3 | contested |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | — | — | — | — | 2 | no winner |
| `robustness/edge_no_media_tracks_probe` | — | — | — | — | 5 | no winner |
| `trim/robust_start_past_eof` | — | — | — | — | 2 | no winner |
| `robustness/prop_trim_additivity_compose` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/edge_pcm_s16be_probe` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `encryption/cenc_ctr_truncated_mdat_graceful` | — | — | — | — | 2 | no winner |
| `robustness/fuzz_mp3_header_truncated_probe` | — | — | — | — | 4 | no winner |
| `trim/robust_bitflipped_source` | — | — | — | — | 2 | no winner |
| `robustness/edge_audio_only_probe` | — | — | — | — | 7 | no winner |
| `robustness/prop_remux_duration_preserved` | — | — | — | — | 2 | no winner |
| `robustness/edge_seek_past_eof` | — | — | — | — | 5 | no winner |
| `probe/truncated-header-graceful` | — | — | — | — | 7 | no winner |
| `robustness/edge_audio_only_micro_probe` | — | — | — | — | 7 | no winner |
| `robustness/prop_duration_consistent_across_containers` | — | — | — | — | 6 | no winner |
| `encryption/cenc_ctr_senc_bitflip_graceful` | — | — | — | — | 2 | no winner |
| `robustness/fuzz_webm_header_truncated_demux` | — | — | — | — | 5 | no winner |
| `demux/graceful_zero_length` | — | — | — | — | 6 | no winner |
| `robustness/fuzz_ts_zeroed_spans_demux` | — | — | — | — | 4 | no winner |
| `demux/graceful_webm_header_destroyed` | — | — | — | — | 5 | no winner |
| `robustness/fuzz_mux_target_corrupt_remux` | — | — | — | — | 4 | no winner |
| `robustness/edge_faststart_reserve_remux` | — | — | — | — | 2 | no winner |
| `robustness/edge_dims_1x1_probe` | — | — | — | — | 6 | no winner |
| `robustness/fuzz_truncated_h264_asset_demux` | — | — | — | — | 6 | no winner |
| `trim/robust_end_far_past_eof` | — | — | — | — | 2 | no winner |
| `robustness/edge_flac_without_seektable_probe` | — | — | — | — | 4 | no winner |
| `demux/graceful_truncated_h264` | — | — | — | — | 6 | no winner |
| `remux/neg_headerless_webm_to_mkv` | — | — | — | — | 2 | no winner |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | — | — | — | — | 2 | no winner |
| `metadata/neg_garbled_ilst_mp4_probe` | — | — | — | — | 7 | no winner |
| `robustness/fuzz_mp4_bitflip_probe` | — | — | — | — | 7 | no winner |
| `robustness/image_png_probe_na` | — | — | — | — | 7 | no winner |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | — | — | — | — | 2 | no winner |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | 2 | no winner |
| `transcode/mismatch_mislabeled_container_transcode` | — | — | — | — | 3 | no winner |
| `robustness/edge_headerless_recorder_probe` | — | — | — | — | 6 | no winner |
| `robustness/edge_multitrack_demux` | — | — | — | — | 7 | no winner |
| `robustness/fuzz_mp4_tail_truncated_demux` | — | — | — | — | 6 | no winner |
| `robustness/edge_video_only_micro_probe` | — | — | — | — | 7 | no winner |
| `transcode/negative_png_to_video` | — | — | — | — | 4 | no winner |
| `robustness/fuzz_mp4_zeroed_spans_decode` | — | — | — | — | 5 | no winner |
| `transcode/malformed_truncated_h264_transcode` | — | — | — | — | 3 | no winner |
| `robustness/edge_dims_1x1_decode` | — | — | — | — | 5 | no winner |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | 3 | no winner |
| `audio-dsp/fuzz_wav_bitflip_decode` | — | — | — | — | 4 | no winner |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | — | — | — | — | 2 | no winner |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | 2 | no winner |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | 2 | no winner |
| `mux/neg_vp9_into_adts_illegal` | — | — | — | — | 2 | no winner |
| `robustness/edge_ts_pts_wraparound_demux` | — | — | — | — | 4 | no winner |
| `robustness/prop_gapless_sample_count_priming` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/edge_open_gop_bframes_decode` | — | — | — | — | 4 | no winner |
| `robustness/fuzz_adts_aac_bitflip_probe` | — | — | — | — | 4 | no winner |
| `robustness/edge_5_1_channels_probe` | — | — | — | — | 5 | no winner |
| `robustness/edge_zero_length_probe` | — | — | — | — | 7 | no winner |
| `transcode/negative_webp_to_video` | — | — | — | — | 4 | no winner |
| `robustness/edge_flac_with_seektable_probe` | — | — | — | — | 4 | no winner |
| `mux/neg_h264_into_ogg_illegal` | — | — | — | — | 2 | no winner |
| `robustness/edge_rotated_remux` | — | — | — | — | 2 | no winner |
| `robustness/edge_cbcs_boundary_decrypt` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `metadata/neg_garbled_id3_mp3_probe` | — | — | — | — | 4 | no winner |
| `transcode/mismatch_audio_only_to_video_target` | — | — | — | — | 3 | no winner |
| `robustness/prop_demux_mux_roundtrip_eq` | — | — | — | — | 2 | no winner |
| `transcode/mismatch_video_only_to_audio_target` | — | — | — | — | 3 | no winner |
| `robustness/prop_double_remux_stable` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `encryption/clearkey_decrypt_na` | — | — | — | — | 2 | no winner |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | — | — | — | — | 2 | no winner |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | — | — | — | — | 2 | no winner |
| `encryption/cenc_ctr_protection_zeroed_graceful` | — | — | — | — | 2 | no winner |
| `remux/neg_zeroed_mp4_to_mkv` | — | — | — | — | 2 | no winner |
| `robustness/prop_trim_concatenation` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/prop_flac_seek_seektable_equiv` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `trim/robust_negative_start` | — | — | — | — | 2 | no winner |
| `robustness/edge_mislabeled_container_probe` | — | — | — | — | 6 | no winner |
| `robustness/image_jpeg_probe_na` | — | — | — | — | 7 | no winner |
| `robustness/fuzz_mp4_header_truncated_demux` | — | — | — | — | 6 | no winner |
| `demux/graceful_mp4_header_destroyed` | — | — | — | — | 6 | no winner |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | 2 | no winner |
| `robustness/edge_vfr_probe` | — | — | — | — | 7 | no winner |
| `trim/robust_zero_length_range` | — | — | — | — | 2 | no winner |
| `transcode/extreme_resize_1x1` | — | — | — | — | 3 | no winner |
| `robustness/edge_extreme_fps_240_probe` | — | — | — | — | 7 | no winner |
| `robustness/edge_headerless_recorder_remux` | — | — | — | — | 3 | no winner |
| `transcode/negative_jpeg_to_video` | — | — | — | — | 4 | no winner |
| `trim/robust_inverted_range` | — | — | — | — | 2 | no winner |
| `robustness/edge_gapless_priming_probe` | — | — | — | — | 7 | no winner |
| `transcode/malformed_zero_length_transcode` | — | — | — | — | 4 | no winner |
| `trim/robust_truncated_source` | — | — | — | — | 2 | no winner |
| `robustness/fuzz_remux_zeroed_spans` | — | — | — | — | 2 | no winner |
| `remux/neg_truncated_mp4_to_mkv` | — | — | — | — | 2 | no winner |
| `robustness/image_webp_probe_na` | — | — | — | — | 7 | no winner |
| `robustness/fuzz_flac_bitflip_probe` | — | — | — | — | 4 | no winner |
| `robustness/edge_video_only_probe` | — | — | — | — | 7 | no winner |
| `robustness/fuzz_webm_bitflip_probe` | — | — | — | — | 6 | no winner |
| `robustness/edge_longform_probe` | — | — | — | — | 7 | no winner |
| `robustness/edge_dims_2x2_h264_probe` | — | — | — | — | 7 | no winner |
| `robustness/edge_fragmented_remux` | — | — | — | — | 3 | no winner |
| `robustness/edge_pcm_s24_decode` | — | — | — | — | 2 | no winner |
| `transcode/extreme_resize_0x0` | — | — | — | — | 3 | no winner |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | `ffmpeg.wasm@0.12.15` (uncontested) | — | — | — | 1 | uncontested |
| `robustness/edge_extreme_fps_1_probe` | — | — | — | — | 7 | no winner |
| `audio-dsp/fuzz_wav_header_truncated_probe` | — | — | — | — | 5 | no winner |
| `robustness/prop_transcode_idempotent_dims_h264` | — | — | — | — | 3 | no winner |
| `robustness/edge_seek_negative` | — | — | — | — | 5 | no winner |
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | `platform@chrome-149` (uncontested) | 0 fps | — | — | 1 | uncontested |

### 3. Conformance matrix (same display rule, grouped by correctness)

| Scenario | aibrush-media@dev | ffmpeg.wasm@0.12.15 | mediabunny@1.48.0 | mp4box@2.3.0 | platform@chrome-149 | remotion-media-parser@4.0.479 | remotion-webcodecs@4.0.479 | web-demuxer@4.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | N/A | Pass (98.69 ms) | Pass (282 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_half_f32` | N/A | Pass (14.15 ms) | Pass (24.47 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_backward_then_forward` | N/A | Pass (97.58 ms) | Pass (27.67 ms) | N/A | Pass (77.38 ms) | N/A | Pass (1.57 s) | Pass (95.28 ms) |
| `streaming-output/prop_decode_equals_stream_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vfr_timing` | N/A | Pass (634 ms) | Pass (535 ms) | N/A | Pass (536 ms) | N/A | Pass (483 ms) | Pass (675 ms) |
| `mux/prop_av1_mux_duration_webm_to_mp4` | N/A | N/A | Pass (16.4 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_frame_accurate` | N/A | Pass (12.81 s) | Pass (649 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mov` | N/A | Pass (43.47 ms) | Pass (95.72 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_resize_4k_to_1080p` | N/A | Pass (37.41 s) | Pass (984 ms) | N/A | N/A | N/A | Pass (1.53 s) | N/A |
| `performance/bundle-size` | N/A | Pass (1.64 s) | Pass (1.53 s) | Pass (1.51 s) | Pass (1.53 s) | Pass (1.52 s) | Pass (1.52 s) | Pass (1.59 s) |
| `performance/convert-longtasks` | N/A | N/A | Pass (3.48 s) | N/A | N/A | N/A | Pass (5.89 s) | N/A |
| `audio-dsp/upmix_mono_to_stereo` | N/A | Pass (29.66 ms) | Pass (52.03 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_aiff_pcm_be_copy` | N/A | Pass (6.16 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | N/A | N/A | Pass (7.92 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_rotated90` | N/A | Pass (15.63 ms) | Pass (1.57 ms) | Pass (37.06 ms) | Pass (16.81 ms) | Pass (1.54 ms) | Pass (5.33 ms) | Pass (19.55 ms) |
| `audio-dsp/downmix_stereo_to_mono` | N/A | Pass (25.49 ms) | Pass (32.61 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_aes128` | N/A | Pass (135 ms) | Pass (111 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mkv` | N/A | Pass (78.46 ms) | Pass (19.5 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | N/A | Pass (180 s) | Pass (13.68 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_cbr_notoc` | N/A | Pass (23.81 ms) | Pass (4.76 ms) | N/A | N/A | Pass (7.5 ms) | Pass (6.17 ms) | N/A |
| `transcode/multitrack_select_default_audio` | N/A | Pass (11.79 s) | Pass (675 ms) | N/A | N/A | N/A | Pass (105 ms) | N/A |
| `mux/edge_bframes_decode_mux_mkv` | N/A | Pass (121 ms) | Pass (20.54 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/selfcheck_h264_resize_720p_tie` | N/A | Pass (47.64 s) | Pass (2.87 s) | N/A | N/A | N/A | Pass (2.61 s) | N/A |
| `transcode/flac_to_aac_mp4` | N/A | Pass (255 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/huge_h264_mov_copy_peakmem` | N/A | Pass (611 ms) | Pass (655 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_roundtrip_endianness_s16` | N/A | Pass (24.5 ms) | Pass (4.69 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_copy_lazyread` | N/A | Pass (152 ms) | Pass (674 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_noseektable` | N/A | Pass (2.29 ms) | Pass (1.54 ms) | N/A | N/A | Pass (1.32 ms) | Pass (2.03 ms) | N/A |
| `remux/micro_audio_short_mp4_to_adts` | N/A | Pass (3.97 ms) | Pass (5.31 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vp8` | N/A | Pass (319 ms) | Pass (303 ms) | N/A | Pass (231 ms) | N/A | Pass (322 ms) | Pass (257 ms) |
| `mux/prop_vp9_decode_mux_webm_to_webm` | N/A | Pass (98.97 ms) | Pass (22.72 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_44k1` | N/A | Pass (29.96 ms) | Pass (36.15 ms) | N/A | N/A | N/A | Pass (35.29 ms) | N/A |
| `demux/realworld_mdn_trex_mp3` | N/A | Pass (10.54 ms) | Pass (1.94 ms) | N/A | N/A | Pass (4.02 ms) | Pass (1.97 ms) | N/A |
| `performance/metamorphic-vfr-probe-duration` | N/A | Pass (12.89 ms) | Pass (1.82 ms) | Pass (7.52 ms) | Pass (13.44 ms) | Pass (3.62 ms) | Pass (14.32 ms) | Pass (21.73 ms) |
| `probe/h264_4k_10s` | N/A | Pass (64.56 ms) | Pass (2.28 ms) | Pass (34.75 ms) | Pass (44.79 ms) | Pass (2.15 ms) | Pass (3.65 ms) | Pass (56.18 ms) |
| `mux/video_plus_audio_to_mp4` | N/A | Pass (182 ms) | Pass (45.89 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_10bit_to_h264_8bit` | N/A | Pass (11.63 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_av1_webm` | N/A | N/A | Pass (2.29 s) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_minus6db_s16` | N/A | Pass (20.59 ms) | Pass (30 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-medium` | N/A | Pass (74.46 ms) | Pass (29.69 ms) | Pass (50.53 ms) | Pass (56.28 ms) | Pass (4.96 ms) | Pass (1.2 s) | Pass (4.6 ms) |
| `probe/wav_s16` | N/A | Pass (10.8 ms) | Pass (18.69 ms) | N/A | Pass (9.07 ms) | Pass (2.51 ms) | Pass (2.08 ms) | N/A |
| `transcode/h264_vfr_to_cfr_30` | N/A | Pass (7.91 s) | Pass (739 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mp4` | N/A | Pass (65.08 ms) | Pass (16.96 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_s16` | N/A | Pass (12.54 ms) | Pass (20.61 ms) | N/A | N/A | N/A | Pass (32.99 ms) | N/A |
| `transcode/ladder_tiny_h264_360p_resize_180p` | N/A | Pass (308 ms) | Pass (204 ms) | N/A | N/A | N/A | Pass (204 ms) | N/A |
| `probe/perf-extract-metadata-huge` | N/A | Pass (644 ms) | Pass (9.9 ms) | Pass (672 ms) | Pass (689 ms) | Pass (7.9 ms) | Pass (7.3 ms) | Pass (54.82 ms) |
| `transcode/h264_rotate_180` | N/A | Pass (70.98 s) | Pass (2.67 s) | N/A | N/A | N/A | Pass (4.07 s) | N/A |
| `remux/h264_1080p_30s_mp4_to_mkv` | N/A | Pass (163 ms) | Pass (361 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s24_to_wav` | N/A | Pass (14.16 ms) | Pass (6.67 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp4_tags` | N/A | Pass (112 ms) | Pass (317 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_flip_vertical` | N/A | Pass (71.94 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mov` | N/A | Pass (188 ms) | Pass (92.03 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_seektable_copy` | N/A | Pass (8.66 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mkv` | N/A | Pass (22.08 ms) | Pass (8.01 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/vp8_720p_10s` | N/A | Pass (7.68 ms) | Pass (5.87 ms) | N/A | Pass (8.17 ms) | Pass (9.85 ms) | Pass (12.87 ms) | Pass (7.56 ms) |
| `demux/h264_in_mkv` | N/A | Pass (41.43 ms) | Pass (9.13 ms) | N/A | Pass (15.91 ms) | Pass (77.7 ms) | Pass (62.57 ms) | Pass (425 ms) |
| `demux/wav_s16` | N/A | Pass (19.02 ms) | Pass (6.45 ms) | N/A | Pass (6.34 ms) | Pass (3.03 ms) | Pass (6.16 ms) | N/A |
| `metadata/tracks_packet_attribution_multitrack` | N/A | Pass (33.01 ms) | Pass (10.38 ms) | Pass (25.03 ms) | Pass (17.29 ms) | Pass (95.41 ms) | Pass (68.91 ms) | Pass (526 ms) |
| `probe/recorder_headerless` | N/A | Pass (2.79 ms) | Pass (1.92 ms) | N/A | Pass (4.21 ms) | Pass (12.31 ms) | Pass (11.01 ms) | Pass (8.19 ms) |
| `encryption/cenc_cbcs_decrypt` | N/A | N/A | Pass (51.38 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | N/A | Pass (248 ms) | Pass (34.18 ms) | N/A | Pass (47.25 ms) | N/A | Pass (282 ms) | Pass (109 ms) |
| `remux/av1_720p_5s_webm_to_mp4` | N/A | N/A | Pass (6.96 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_wav_pcm_copy` | N/A | Pass (32.4 ms) | Pass (3.35 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_seektable` | N/A | Pass (2.44 ms) | Pass (1.2 ms) | N/A | N/A | Pass (3.86 ms) | Pass (3.39 ms) | N/A |
| `metadata/write_ogg_vorbiscomment` | N/A | Pass (7.15 ms) | Pass (5.41 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/large_h264_1080p_120s` | N/A | Pass (125 ms) | Pass (2.47 ms) | Pass (160 ms) | Pass (166 ms) | Pass (6.31 ms) | Pass (7.56 ms) | Pass (27.51 ms) |
| `mux/mp4_faststart_reserve` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_mp3_copy` | N/A | Pass (4.45 ms) | Pass (2.55 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_5_1_to_stereo` | N/A | Pass (52.36 ms) | Pass (115 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_h264_1frame` | N/A | Pass (5.79 ms) | Pass (9.61 ms) | Pass (3.39 ms) | Pass (2.81 ms) | Pass (3.21 ms) | Pass (6.05 ms) | Pass (12.25 ms) |
| `mux/vorbis_to_ogg` | N/A | Pass (31.96 ms) | Pass (6.87 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_webm` | N/A | Pass (5.85 ms) | Pass (10.06 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_large_vp9_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/realworld_mdn_flower_webm` | N/A | Pass (3.53 ms) | Pass (2.48 ms) | N/A | Pass (5.34 ms) | Pass (9.15 ms) | Pass (4.88 ms) | Pass (8.09 ms) |
| `transcode/h264_resize_720p` | N/A | Pass (47.94 s) | Pass (2.17 s) | N/A | N/A | N/A | Pass (3.73 s) | N/A |
| `decode-seek/meta_seek_vs_linear_decode` | N/A | Pass (90.63 ms) | Pass (24.48 ms) | N/A | Pass (65.07 ms) | N/A | Pass (3.48 s) | Pass (88.86 ms) |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | N/A | Pass (26.32 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_alpha_to_vp9_keepalpha` | N/A | N/A | Pass (596 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | N/A | Pass (180 ms) | Pass (49.1 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/swap_audio_video_with_opus_to_mkv` | N/A | Pass (359 ms) | Pass (59.59 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_xing` | N/A | Pass (2.64 ms) | Pass (2 ms) | N/A | N/A | Pass (3.66 ms) | Pass (2.38 ms) | N/A |
| `probe/vp9_1080p_10s` | N/A | Pass (32.91 ms) | Pass (12.22 ms) | N/A | Pass (33.33 ms) | Pass (14.31 ms) | Pass (13.33 ms) | Pass (36.78 ms) |
| `streaming-output/ts_tiny_writes` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/opus` | N/A | Pass (6.88 ms) | Pass (4.64 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/aac_adts` | N/A | Pass (3.78 ms) | Pass (2.13 ms) | N/A | N/A | Pass (12 ms) | Pass (20.7 ms) | N/A |
| `transcode/roundtrip_leg2_vp9_to_h264` | N/A | Pass (24.39 s) | Pass (970 ms) | N/A | N/A | N/A | Pass (936 ms) | N/A |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | N/A | Pass (131 ms) | Pass (560 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_noop_full_range_idempotent` | N/A | Pass (68.22 ms) | Pass (22.55 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_negative` | N/A | Pass (84.13 ms) | Pass (25.17 ms) | N/A | Pass (76.08 ms) | N/A | Pass (1.09 s) | Pass (77.72 ms) |
| `remux/av1_720p_5s_webm_to_webm` | N/A | N/A | Pass (7.66 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_vp9` | N/A | Pass (791 ms) | Pass (561 ms) | N/A | Pass (631 ms) | N/A | Pass (483 ms) | Pass (644 ms) |
| `demux/hls_vod` | N/A | Pass (49.49 ms) | Pass (49.37 ms) | N/A | N/A | Pass (280 ms) | Pass (313 ms) | N/A |
| `transcode/av1_to_h264_mp4` | N/A | N/A | Pass (367 ms) | N/A | N/A | N/A | Pass (308 ms) | N/A |
| `remux/h264_1080p_5s_mov_to_mkv` | N/A | Pass (43.35 ms) | Pass (38.27 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_44k1_to_48k` | N/A | Pass (43.81 ms) | Pass (56.78 ms) | N/A | N/A | N/A | Pass (86.14 ms) | N/A |
| `streaming-output/webm_headerless_live_stream` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_bframes_1080p` | N/A | Pass (33.07 ms) | Pass (1.92 ms) | Pass (25.68 ms) | Pass (45.97 ms) | Pass (10 ms) | Pass (5.36 ms) | Pass (25.75 ms) |
| `trim/fmp4_fragment_boundary_copy` | N/A | Pass (71.88 ms) | Pass (670 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_ttfb_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_5s` | N/A | Pass (20.56 ms) | Pass (2.82 ms) | Pass (18.09 ms) | Pass (13.95 ms) | Pass (4.95 ms) | Pass (6.37 ms) | Pass (26.37 ms) |
| `remux/h264_in_mkv_mkv_to_ts` | N/A | Pass (65.16 ms) | Pass (25.03 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mov` | N/A | Pass (50.46 ms) | Pass (18.04 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_multitrack_keyframe_aligned` | N/A | Pass (72.23 ms) | Pass (375 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_tiny_tiny_vp9_360p_2s` | N/A | Pass (7.08 ms) | Pass (2.91 ms) | N/A | Pass (4.93 ms) | Pass (10.16 ms) | Pass (9.66 ms) | Pass (35.13 ms) |
| `transcode/gapless_pcm_to_opus_priming` | N/A | N/A | Pass (41.07 ms) | N/A | N/A | N/A | Pass (70.66 ms) | N/A |
| `metadata/tagedit_no_corrupt_audio_flac` | N/A | Pass (5.38 ms) | Pass (2.53 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_in_mkv` | N/A | Pass (34.07 ms) | Pass (7.27 ms) | N/A | Pass (15.29 ms) | Pass (10.75 ms) | Pass (18.25 ms) | Pass (55.22 ms) |
| `streaming-output/mp4_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_ogg` | N/A | Pass (11.65 ms) | Pass (7.18 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_rotate_90_dimswap` | N/A | Pass (71.29 s) | Pass (2.63 s) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_fps_15_to_30` | N/A | Pass (7.9 s) | Pass (763 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-huge` | N/A | Pass (1.02 s) | Pass (883 ms) | Pass (803 ms) | Pass (807 ms) | Pass (71.61 s) | Pass (5.81 ms) | Pass (8.01 ms) |
| `probe/massive_h264_1080p_2h` | N/A | Pass (2.41 s) | Pass (24.8 ms) | Pass (1.62 s) | Pass (2.54 s) | Pass (45.6 ms) | Pass (46.44 ms) | Pass (296 ms) |
| `demux/metamorphic_flac_seektable_invariance` | N/A | Pass (6.7 ms) | Pass (2.55 ms) | N/A | N/A | Pass (9.38 ms) | Pass (8.64 ms) | N/A |
| `performance/size-ladder-demux-peak-memory-large` | N/A | Pass (278 ms) | Pass (163 ms) | Pass (211 ms) | Pass (188 ms) | Pass (5.98 s) | Pass (5.45 s) | Pass (6.24 s) |
| `transcode/h264_rotate_normalize` | N/A | Pass (11.36 s) | Pass (630 ms) | N/A | N/A | N/A | Pass (79.2 ms) | N/A |
| `remux/prop_mp3_to_mp4_duration_invariant` | N/A | Pass (15.2 ms) | Pass (3.74 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/buffer_massive_h264_mp4` | N/A | Pass (6.48 s) | Pass (23.82 s) | Pass (5.65 s) | N/A | N/A | SKIPPED | N/A |
| `mux/aac_to_adts` | N/A | Pass (14.46 ms) | Pass (2.93 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_no_tags_wav` | N/A | Pass (9.85 ms) | Pass (5.45 ms) | N/A | Pass (4.47 ms) | Pass (2.84 ms) | Pass (2.12 ms) | N/A |
| `transcode/h264_to_hevc_mp4` | N/A | N/A | Pass (2.84 s) | N/A | N/A | N/A | Pass (6.27 s) | N/A |
| `trim/vp8_keyframe_aligned` | N/A | Pass (12.89 ms) | Pass (361 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_bframes_1080p_mp4_to_mkv` | N/A | Pass (73.08 ms) | Pass (113 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_vp9_webm` | N/A | N/A | Pass (1.33 s) | N/A | N/A | N/A | Pass (1.74 s) | N/A |
| `audio-dsp/throughput_encode_s24` | N/A | Pass (23.31 ms) | Pass (20.32 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_8bit_to_hevc_10bit` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/metamorphic_resize_same_1080p_idempotent` | N/A | Pass (69.39 s) | Pass (2.85 s) | N/A | N/A | N/A | Pass (1.18 s) | N/A |
| `streaming-output/mp4_fragmented_cmaf` | N/A | Pass (113 ms) | Pass (588 ms) | Pass (114 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16be_to_s16le` | N/A | Pass (12.81 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_webm_audio` | N/A | Pass (10.84 ms) | Pass (5.94 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_mp3_mp4` | N/A | Pass (65.06 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_ts` | N/A | Pass (39.29 ms) | Pass (51.13 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_vp8_webm` | N/A | Pass (1.33 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_tiny_dims_2x2_h264` | N/A | Pass (5.35 ms) | Pass (2.51 ms) | N/A | Pass (3.31 ms) | N/A | Pass (4.19 ms) | Pass (8.19 ms) |
| `transcode/h264_two_pass_bitrate` | N/A | Pass (80.68 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_hevc` | N/A | Pass (1.02 s) | Pass (560 ms) | N/A | Pass (571 ms) | N/A | Pass (736 ms) | Pass (633 ms) |
| `probe/huge_vp9_1080p_240s` | N/A | Pass (298 ms) | Pass (12.72 ms) | N/A | Pass (427 ms) | Pass (284 ms) | Pass (230 ms) | Pass (39.67 ms) |
| `mux/pcm_f32_to_wav` | N/A | Pass (14.29 ms) | Pass (4.41 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-probe` | N/A | Pass (49.91 ms) | Pass (2.12 ms) | Pass (57.09 ms) | Pass (58.57 ms) | Pass (2.53 ms) | Pass (3.59 ms) | Pass (23.17 ms) |
| `decode-seek/seek_mkv_h264_keyframe` | N/A | Pass (258 ms) | Pass (18.26 ms) | N/A | Pass (46.66 ms) | N/A | Pass (314 ms) | Pass (119 ms) |
| `streaming-output/webm_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_bitrate_2mbps` | N/A | Pass (58.1 s) | Pass (2.73 s) | N/A | N/A | N/A | Pass (5 s) | N/A |
| `transcode/vp8_to_vp9_webm` | N/A | N/A | Pass (84.06 ms) | N/A | N/A | N/A | Pass (90.53 ms) | N/A |
| `performance/convert-webm-resize-320x180` | N/A | N/A | Pass (2.15 s) | N/A | N/A | N/A | Pass (4.31 s) | N/A |
| `performance/encode-fps` | N/A | N/A | Pass (4.36 s) | N/A | N/A | N/A | Pass (5.14 s) | N/A |
| `probe/wav_s24` | N/A | Pass (4.82 ms) | Pass (7.37 ms) | N/A | Pass (6.2 ms) | Pass (1.84 ms) | Pass (3.6 ms) | N/A |
| `encryption/hls_aes128_decrypt` | N/A | Pass (111 ms) | Pass (97.18 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s16be` | N/A | Pass (29.7 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hevc_1080p_10s` | N/A | Pass (43.16 ms) | Pass (12.47 ms) | Pass (23.72 ms) | Pass (33.32 ms) | Pass (340 ms) | Pass (296 ms) | Pass (716 ms) |
| `mux/audio_only_aac_to_mp4` | N/A | Pass (7.74 ms) | Pass (8.44 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_opus_ogg_copy` | N/A | Pass (5.59 ms) | Pass (3.68 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_open_gop_frame_accurate` | N/A | Pass (8.57 s) | Pass (479 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_progressive_buffer` | N/A | Pass (167 ms) | Pass (50.29 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_single_gop_frame_accurate` | N/A | Pass (1.27 s) | Pass (166 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_attribution_multitrack` | N/A | Pass (17.88 ms) | Pass (2.69 ms) | Pass (12.1 ms) | Pass (15.54 ms) | Pass (3.57 ms) | Pass (3.44 ms) | Pass (16.57 ms) |
| `probe/wav_f32` | N/A | Pass (6.53 ms) | Pass (1.64 ms) | N/A | Pass (44.66 ms) | N/A | N/A | N/A |
| `transcode/av_downmix_stereo_to_mono` | N/A | Pass (81.68 s) | Pass (2.56 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_5s` | N/A | Pass (29.76 ms) | Pass (8.67 ms) | Pass (14.51 ms) | Pass (19.57 ms) | Pass (45.53 ms) | Pass (71.13 ms) | Pass (383 ms) |
| `performance/decode-fps` | N/A | N/A | Pass (333 ms) | N/A | Pass (266 ms) | N/A | Pass (1.2 s) | Pass (329 ms) |
| `remux/aac_adts_adts_to_mp4` | N/A | Pass (6.6 ms) | Pass (4.69 ms) | N/A | N/A | N/A | Pass (116 ms) | N/A |
| `metadata/read_h264_1080p_30s` | N/A | Pass (51.46 ms) | Pass (3.28 ms) | Pass (39.95 ms) | Pass (76.67 ms) | Pass (3.34 ms) | Pass (5.06 ms) | Pass (24.73 ms) |
| `decode-seek/decode_mov_h264` | N/A | Pass (1.48 s) | Pass (1.09 s) | N/A | Pass (1.19 s) | N/A | Pass (941 ms) | Pass (1.18 s) |
| `metadata/write_mp3_id3` | N/A | Pass (4.82 ms) | Pass (5.34 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_flower_mp4` | N/A | Pass (17.03 ms) | N/A | Pass (4.44 ms) | Pass (8.48 ms) | Pass (13.25 ms) | Pass (19.31 ms) | N/A |
| `remux/h264_1080p_5s_mov_to_mp4` | N/A | Pass (41.53 ms) | Pass (48.09 ms) | Pass (15.07 ms) | N/A | N/A | Pass (54.13 ms) | N/A |
| `metadata/meta_consistent_mp4_to_mkv` | N/A | Pass (136 ms) | Pass (315 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_fps_30_to_15` | N/A | Pass (38.76 s) | Pass (1.49 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_massive_massive_h264_1080p_2h` | N/A | Pass (4.81 s) | Pass (12.07 s) | Pass (2.55 s) | Pass (2.93 s) | Pass (87.94 ms) | Pass (54.16 ms) | Pass (46.38 ms) |
| `decode-seek/seek_h264_keyframe` | N/A | Pass (86.6 ms) | Pass (26.28 ms) | N/A | Pass (77.82 ms) | N/A | Pass (2.1 s) | Pass (138 ms) |
| `mux/mp4_fragmented_cmaf` | N/A | Pass (179 ms) | Pass (50.34 ms) | Pass (153 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/fade_in_out_f32` | N/A | Pass (12.01 ms) | Pass (23.69 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/video_a_plus_audio_b_to_mkv` | N/A | Pass (218 ms) | Pass (61.97 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_xing` | N/A | Pass (4.66 ms) | Pass (3.01 ms) | N/A | N/A | Pass (8.62 ms) | Pass (5.64 ms) | N/A |
| `audio-dsp/pcm_s24_to_f32` | N/A | Pass (13.96 ms) | Pass (19.51 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mkv` | N/A | Pass (633 ms) | Pass (222 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mkv` | N/A | Pass (211 ms) | Pass (48.56 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/drop_audio_track_subset_to_mp4` | N/A | Pass (74.31 ms) | Pass (14.08 ms) | Pass (35.71 ms) | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mov` | N/A | Pass (79.02 ms) | Pass (61.84 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_fragmented_shape` | N/A | Pass (107 ms) | Pass (326 ms) | Pass (82.26 ms) | N/A | N/A | N/A | N/A |
| `streaming-output/stream_massive_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_h264_1frame` | N/A | Pass (3.72 ms) | Pass (5.35 ms) | Pass (3.35 ms) | Pass (2.28 ms) | Pass (1.93 ms) | Pass (3.06 ms) | Pass (6.68 ms) |
| `probe/perf-extract-metadata-large` | N/A | Pass (120 ms) | Pass (2.66 ms) | Pass (109 ms) | Pass (139 ms) | Pass (5.94 ms) | Pass (5.43 ms) | Pass (29.72 ms) |
| `performance/size-ladder-iterate-packets-large` | N/A | Pass (191 ms) | Pass (175 ms) | Pass (154 ms) | Pass (184 ms) | Pass (6.05 s) | Pass (7.79 s) | Pass (6.27 s) |
| `remux/mp3_xing_mp3_to_mkv` | N/A | Pass (5.69 ms) | Pass (5.06 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_flip_horizontal` | N/A | Pass (71.65 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_ts_to_mp4_duration_materialized` | N/A | Pass (79.69 ms) | Pass (38.17 ms) | N/A | N/A | N/A | Pass (676 ms) | N/A |
| `encryption/unencrypted_left_untouched_noop` | N/A | Pass (105 ms) | Pass (314 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mkv_tags` | N/A | Pass (73.14 ms) | Pass (17.51 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_ts_stream_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_av1_keyframe` | N/A | N/A | Pass (15.42 ms) | N/A | Pass (78.66 ms) | N/A | Pass (254 ms) | Pass (49.08 ms) |
| `performance/convert-peak-memory` | N/A | N/A | Pass (2.12 s) | N/A | N/A | N/A | Pass (3.75 s) | N/A |
| `trim/vp9_keyframe_aligned` | N/A | Pass (66.22 ms) | Pass (597 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_buffer_target` | N/A | Pass (106 ms) | Pass (340 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/massive_h264_copy_sustained` | N/A | N/A | Pass (5.04 s) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_variable_channel_count_downmix` | N/A | Pass (50.65 ms) | Pass (52.64 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/tiny_h264_360p_2s` | N/A | Pass (6.05 ms) | Pass (1.86 ms) | Pass (2.15 ms) | Pass (3.44 ms) | Pass (1.61 ms) | Pass (3.02 ms) | Pass (10.54 ms) |
| `trim/av1_keyframe_aligned` | N/A | N/A | Pass (286 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/aac_adts_adts_to_ts` | N/A | Pass (7.56 ms) | Pass (8.06 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-demux` | N/A | Pass (70.22 ms) | Pass (33.19 ms) | Pass (56.41 ms) | Pass (68.85 ms) | Pass (4.66 ms) | Pass (1.05 s) | Pass (6.49 ms) |
| `performance/seek-ms` | N/A | Pass (85.17 ms) | Pass (26.16 ms) | N/A | Pass (112 ms) | N/A | Pass (9.46 s) | Pass (99.39 ms) |
| `remux/mp3_xing_mp3_to_mp4` | N/A | Pass (4.99 ms) | Pass (4.4 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_flac_vorbiscomment` | N/A | Pass (20.14 ms) | Pass (5.83 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_mux_duration_webm_to_webm` | N/A | Pass (107 ms) | Pass (40.34 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/bframe_reorder_h264_to_vp9` | N/A | N/A | Pass (1.4 s) | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_alpha_to_vp8_keepalpha` | N/A | N/A | Pass (474 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_audio_short` | N/A | Pass (2.97 ms) | Pass (1.36 ms) | Pass (5.07 ms) | Pass (8.08 ms) | Pass (9.92 ms) | Pass (5.47 ms) | Pass (7.44 ms) |
| `trim/h264_to_eof_copy` | N/A | Pass (64.11 ms) | Pass (438 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_rotated90_mp4_to_mov` | N/A | Pass (31.41 ms) | Pass (97.61 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mkv` | N/A | Pass (55.19 ms) | Pass (89.28 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | N/A | Pass (1.17 s) | Pass (5.9 s) | Pass (1.22 s) | N/A | N/A | Pass (477 ms) | N/A |
| `metadata/rotation_survives_mp4_mkv` | N/A | Pass (77.69 ms) | Pass (202 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_vfr` | N/A | Pass (23.77 ms) | N/A | Pass (8.61 ms) | Pass (25.29 ms) | Pass (12.75 ms) | Pass (3.15 ms) | N/A |
| `probe/h264_1080p_5s` | N/A | Pass (20.48 ms) | Pass (5.27 ms) | Pass (13.18 ms) | Pass (12.42 ms) | Pass (2.86 ms) | Pass (7.06 ms) | Pass (28.99 ms) |
| `probe/hevc_1080p_10s` | N/A | Pass (23.37 ms) | Pass (2.39 ms) | Pass (26.35 ms) | Pass (25.91 ms) | Pass (2.72 ms) | Pass (4.63 ms) | Pass (8.66 ms) |
| `decode-seek/decode_multitrack_select_video` | N/A | Pass (353 ms) | Pass (275 ms) | N/A | Pass (286 ms) | N/A | Pass (479 ms) | Pass (311 ms) |
| `metadata/rotation_decode_read_h264_rotated90` | N/A | N/A | N/A | N/A | Pass (140 ms) | N/A | N/A | N/A |
| `transcode/opus_to_aac_mp4` | N/A | Pass (229 ms) | Pass (81.74 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_rotated90` | N/A | Pass (32.45 ms) | Pass (8.39 ms) | Pass (11.12 ms) | Pass (15.93 ms) | Pass (74.32 ms) | Pass (191 ms) | Pass (319 ms) |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | N/A | Pass (37.86 ms) | Pass (9.15 ms) | Pass (30.88 ms) | N/A | N/A | N/A | N/A |
| `transcode/mp3_to_aac_mp4` | N/A | Pass (258 ms) | Pass (84.16 ms) | N/A | N/A | N/A | Pass (86.87 ms) | N/A |
| `decode-seek/decode_h264_first_frames` | N/A | Pass (1.6 s) | Pass (1.1 s) | N/A | Pass (1.23 s) | N/A | Pass (1.89 s) | Pass (1.23 s) |
| `performance/metamorphic-vfr-iterate-packets` | N/A | Pass (21 ms) | N/A | Pass (8.1 ms) | Pass (10.56 ms) | Pass (4.47 ms) | Pass (4.47 ms) | N/A |
| `probe/h264_vfr` | N/A | Pass (17.09 ms) | Pass (2.09 ms) | Pass (5.66 ms) | Pass (9.63 ms) | Pass (5.4 ms) | Pass (3.16 ms) | Pass (21.15 ms) |
| `remux/h264_in_mkv_mkv_to_mov` | N/A | Pass (69.87 ms) | Pass (12.72 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/fanout_h264_abr_ladder` | N/A | N/A | Pass (8.98 s) | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-decode-remux` | N/A | Pass (136 ms) | Pass (279 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_past_eof` | N/A | Pass (478 ms) | Pass (72.3 ms) | N/A | Pass (117 ms) | N/A | Pass (10.04 s) | Pass (132 ms) |
| `streaming-output/mp4_faststart_in_memory` | N/A | Pass (104 ms) | Pass (295 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_alpha_keyframe_aligned` | N/A | N/A | Pass (463 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_tiny_dims_1x1` | N/A | Pass (3.79 ms) | Pass (2.66 ms) | N/A | Pass (2 ms) | N/A | Pass (5.29 ms) | Pass (15.88 ms) |
| `demux/size_huge_huge_h264_1080p_600s` | N/A | Pass (952 ms) | Pass (911 ms) | Pass (750 ms) | Pass (771 ms) | SKIPPED | Pass (38.66 ms) | Pass (16.64 ms) |
| `demux/flac_seektable` | N/A | Pass (3.04 ms) | Pass (3.13 ms) | N/A | N/A | Pass (7.21 ms) | Pass (9.45 ms) | N/A |
| `decode-seek/decode_bframes_reorder` | N/A | Pass (1.63 s) | Pass (1.08 s) | N/A | Pass (1.24 s) | N/A | Pass (1.32 s) | Pass (1.2 s) |
| `demux/size_tiny_tiny_h264_360p_2s` | N/A | Pass (7.45 ms) | Pass (2.24 ms) | Pass (2.32 ms) | Pass (4.66 ms) | Pass (8.67 ms) | Pass (8.47 ms) | Pass (34.94 ms) |
| `mux/prop_h264_mux_duration_mp4_to_ts` | N/A | Pass (177 ms) | Pass (80.21 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_vp9_webm` | N/A | N/A | Pass (3.8 s) | N/A | N/A | N/A | Pass (5.16 s) | N/A |
| `decode-seek/decode_size_tiny_h264_360p` | N/A | Pass (85.25 ms) | Pass (101 ms) | N/A | Pass (108 ms) | N/A | Pass (208 ms) | Pass (110 ms) |
| `mux/edge_multitrack_keep_all_to_mp4` | N/A | Pass (87.56 ms) | Pass (13.32 ms) | Pass (56.22 ms) | N/A | N/A | N/A | N/A |
| `transcode/h264_to_ts` | N/A | N/A | Pass (2.74 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_cbr_notoc` | N/A | Pass (2.57 ms) | Pass (2.65 ms) | N/A | N/A | Pass (4.51 ms) | Pass (1.6 ms) | N/A |
| `transcode/h264_crop_center` | N/A | Pass (52.28 s) | Pass (7.49 s) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vp8_keyframe` | N/A | Pass (24.11 ms) | Pass (15.03 ms) | N/A | Pass (34.71 ms) | N/A | Pass (62.84 ms) | Pass (48.44 ms) |
| `trim/h264_keyframe_aligned` | N/A | Pass (88.62 ms) | Pass (947 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_noseektable_copy` | N/A | Pass (7.5 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-massive` | N/A | Pass (5.13 s) | Pass (4.89 s) | Pass (3.67 s) | Pass (2.72 s) | Pass (86.62 ms) | Pass (41.81 ms) | Pass (59.78 ms) |
| `probe/opus` | N/A | Pass (2.6 ms) | Pass (1.65 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_keyframe_aligned` | N/A | Pass (46.03 ms) | Pass (499 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_hevc_keyframe` | N/A | Pass (62.97 ms) | Pass (24.63 ms) | N/A | Pass (55.41 ms) | N/A | Pass (1.86 s) | Pass (68.41 ms) |
| `streaming-output/prop_decode_equals_buffer_shape` | N/A | Pass (94.17 ms) | Pass (531 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | N/A | Pass (47.54 ms) | Pass (10.34 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_frame_accurate` | N/A | N/A | Pass (526 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/aac_to_pcm_wav_extract` | N/A | Pass (20.02 ms) | Pass (42.85 ms) | N/A | N/A | N/A | Pass (75.49 ms) | N/A |
| `mux/three_track_assembly_to_mkv` | N/A | Pass (215 ms) | Pass (51.77 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_av1` | N/A | N/A | Pass (213 ms) | N/A | Pass (243 ms) | N/A | Pass (433 ms) | Pass (277 ms) |
| `performance/size-ladder-iterate-packets-huge` | N/A | Pass (958 ms) | Pass (1.2 s) | Pass (809 ms) | Pass (824 ms) | Pass (46.58 s) | Pass (4.63 ms) | Pass (5.88 ms) |
| `trim/h264_start_zero_copy` | N/A | Pass (79.92 ms) | Pass (55.49 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/hdr10_to_sdr_tonemap` | N/A | Pass (38.09 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/cenc_cbcs` | N/A | Pass (11.77 ms) | Pass (2.16 ms) | Pass (7.33 ms) | Pass (10.05 ms) | Pass (10.2 ms) | Pass (9.44 ms) | Pass (15.03 ms) |
| `decode-seek/decode_size_tiny_vp9_360p` | N/A | Pass (96.17 ms) | Pass (95.44 ms) | N/A | Pass (100 ms) | N/A | Pass (86.97 ms) | Pass (124 ms) |
| `decode-seek/seek_repeated_same_target` | N/A | Pass (82.77 ms) | Pass (33.84 ms) | N/A | Pass (76.13 ms) | N/A | Pass (3.77 s) | Pass (101 ms) |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | N/A | Pass (5.16 s) | Pass (28.41 s) | N/A | N/A | N/A | N/A | N/A |
| `transcode/mp3_to_opus_webm` | N/A | N/A | Pass (123 ms) | N/A | N/A | N/A | Pass (167 ms) | N/A |
| `probe/metamorphic-recorder-headerless-sane-duration` | N/A | Pass (2.91 ms) | Pass (1.72 ms) | N/A | Pass (6.08 ms) | Pass (8.34 ms) | Pass (11.83 ms) | Pass (10.34 ms) |
| `audio-dsp/throughput_decode_s24` | N/A | Pass (38.27 ms) | Pass (28.82 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_mkv` | N/A | Pass (5.5 ms) | Pass (4.67 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_bframes_frame_accurate` | N/A | Pass (6.79 s) | Pass (423 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/big_buck_bunny_1080p_h264` | N/A | Pass (925 ms) | Pass (6.22 ms) | Pass (968 ms) | Pass (2.28 s) | Pass (18.5 ms) | Pass (11.47 ms) | Pass (42.51 ms) |
| `trim/large_h264_frame_accurate_throughput` | N/A | Pass (20.2 s) | Pass (643 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_vorbis_ogg` | N/A | Pass (56.5 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_multitrack_survives_mp4_mkv` | N/A | Pass (113 ms) | Pass (90 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_zero` | N/A | Pass (82.96 ms) | Pass (26.46 ms) | N/A | Pass (77.32 ms) | N/A | Pass (3.09 s) | Pass (95.09 ms) |
| `performance/size-ladder-iterate-packets-tiny` | N/A | Pass (16.5 ms) | Pass (3.68 ms) | Pass (2.06 ms) | Pass (5.46 ms) | Pass (8.27 ms) | Pass (9.02 ms) | Pass (34.84 ms) |
| `decode-seek/decode_h264_10bit` | N/A | Pass (1.05 s) | Pass (480 ms) | N/A | Pass (432 ms) | N/A | Pass (479 ms) | Pass (465 ms) |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | N/A | Pass (369 ms) | Pass (1.15 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/realworld_mdn_flower_webm` | N/A | Pass (6.24 ms) | Pass (3.9 ms) | N/A | Pass (4.85 ms) | Pass (100 ms) | Pass (71.95 ms) | Pass (69.72 ms) |
| `mux/h264_aac_to_mov` | N/A | Pass (198 ms) | Pass (66.76 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mp4` | N/A | Pass (81.48 ms) | Pass (48.2 ms) | N/A | N/A | N/A | Pass (673 ms) | N/A |
| `performance/op-sweep-transcode-webm` | N/A | N/A | Pass (2.16 s) | N/A | N/A | N/A | Pass (4.25 s) | N/A |
| `remux/flac_seektable_flac_to_ogg` | N/A | Pass (5.26 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-huge` | N/A | Pass (869 ms) | Pass (7.34 ms) | Pass (560 ms) | Pass (711 ms) | Pass (6.94 ms) | Pass (12.67 ms) | Pass (48.59 ms) |
| `transcode/h264_rotate_270_dimswap` | N/A | Pass (10.71 s) | Pass (809 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/ts_keyframe_aligned` | N/A | Pass (76.65 ms) | Pass (456 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_gapless_aac_decode` | N/A | N/A | Pass (3.35 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-large4k` | N/A | Pass (80.66 ms) | Pass (22.69 ms) | Pass (37.35 ms) | Pass (96.84 ms) | Pass (438 ms) | Pass (400 ms) | Pass (1.53 s) |
| `performance/metamorphic-transcode-idempotent-source-res` | N/A | N/A | Pass (4.34 s) | N/A | N/A | N/A | Pass (5.13 s) | N/A |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | N/A | Pass (477 ms) | Pass (133 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mp4` | N/A | Pass (173 ms) | Pass (48.75 ms) | Pass (133 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_idempotent_resample_same_rate` | N/A | Pass (24.66 ms) | Pass (4.24 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/mkv_keyframe_aligned` | N/A | Pass (72.09 ms) | Pass (611 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_vp9_1080p_120s` | N/A | Pass (273 ms) | Pass (211 ms) | N/A | Pass (197 ms) | Pass (586 ms) | Pass (393 ms) | Pass (6.95 s) |
| `audio-dsp/edge_longform_audio_resample_16k` | N/A | Pass (3.85 s) | Pass (6.2 s) | N/A | N/A | N/A | Pass (14.68 s) | N/A |
| `decode-seek/decode_size_large_vp9_120s` | N/A | Pass (1.76 s) | Pass (1.08 s) | N/A | Pass (1.33 s) | N/A | Pass (1.23 s) | Pass (1.22 s) |
| `decode-seek/seek_h264_nonkeyframe` | N/A | Pass (431 ms) | Pass (60.82 ms) | N/A | Pass (91.68 ms) | N/A | Pass (4.22 s) | Pass (147 ms) |
| `transcode/hevc_to_h264_mp4` | N/A | Pass (24.97 s) | Pass (1.2 s) | N/A | N/A | N/A | Pass (1.02 s) | N/A |
| `probe/longform_1h_audio` | N/A | Pass (49.94 ms) | Pass (12.93 ms) | Pass (86.19 ms) | Pass (111 ms) | Pass (5.64 ms) | Pass (13.63 ms) | Pass (34.08 ms) |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | N/A | Pass (72.23 s) | Pass (2.56 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_h264_1080p_120s` | N/A | Pass (218 ms) | Pass (180 ms) | Pass (173 ms) | Pass (167 ms) | Pass (8.08 s) | Pass (17.55 s) | Pass (6.42 s) |
| `remux/h264_multitrack_mp4_to_mkv` | N/A | Pass (35.83 ms) | Pass (87.59 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s16be` | N/A | Pass (19.44 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_recorder_headerless_duration_materialized` | N/A | Pass (16.49 ms) | Pass (6.04 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/tiny_vp9_360p_2s` | N/A | Pass (5.39 ms) | Pass (1.2 ms) | N/A | Pass (14.22 ms) | Pass (3.51 ms) | Pass (5.79 ms) | Pass (10.72 ms) |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | N/A | Pass (202 ms) | Pass (50.35 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_fps_240` | N/A | N/A | Pass (14.28 s) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_h264_4k` | N/A | Pass (3.41 s) | Pass (2.47 s) | N/A | Pass (2.1 s) | N/A | Pass (3.03 s) | Pass (2.16 s) |
| `demux/h264_ts` | N/A | Pass (49.13 ms) | Pass (42.22 ms) | N/A | N/A | Pass (194 ms) | Pass (183 ms) | N/A |
| `probe/realworld_mdn_flower_mp4` | N/A | Pass (17.21 ms) | Pass (1.54 ms) | Pass (4.35 ms) | Pass (7.69 ms) | Pass (2.16 ms) | Pass (5.56 ms) | Pass (41.14 ms) |
| `performance/size-ladder-extract-metadata-tiny` | N/A | Pass (5.39 ms) | Pass (7.64 ms) | Pass (2.82 ms) | Pass (4.32 ms) | Pass (3.93 ms) | Pass (24.18 ms) | Pass (9.79 ms) |
| `probe/av1_720p_5s` | N/A | Pass (10.18 ms) | Pass (13.43 ms) | N/A | Pass (8.28 ms) | Pass (7.76 ms) | Pass (11.22 ms) | Pass (5.82 ms) |
| `demux/wav_s24` | N/A | Pass (17.5 ms) | Pass (5.56 ms) | N/A | Pass (7.82 ms) | Pass (10.38 ms) | Pass (4.45 ms) | N/A |
| `performance/metamorphic-probe-duration-cross-container` | N/A | N/A | Pass (3.47 s) | N/A | N/A | N/A | Pass (4.36 s) | N/A |
| `decode-seek/decode_extreme_fps_1` | N/A | Pass (77.7 ms) | Pass (114 ms) | N/A | Pass (30.47 ms) | N/A | Pass (22.46 ms) | Pass (33.72 ms) |
| `metadata/read_no_tags_recorder_webm` | N/A | Pass (5.5 ms) | Pass (2.21 ms) | N/A | Pass (7.73 ms) | Pass (8.23 ms) | Pass (16.72 ms) | Pass (10.05 ms) |
| `remux/h264_1080p_30s_mp4_to_ts` | N/A | Pass (119 ms) | Pass (299 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/empty_audio_zero_packets` | N/A | Pass (1.78 ms) | Pass (1.09 ms) | N/A | Pass (2.14 ms) | Pass (2.35 ms) | Pass (2.49 ms) | N/A |
| `transcode/vp9_to_vp8_webm` | N/A | Pass (42.71 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_reserve` | N/A | Pass (105 ms) | Pass (66.25 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | N/A | Pass (104 ms) | Pass (283 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/aac_to_opus_webm` | N/A | N/A | Pass (91.61 ms) | N/A | N/A | N/A | Pass (110 ms) | N/A |
| `performance/op-sweep-remux-mp4-to-mkv` | N/A | Pass (146 ms) | Pass (292 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_webm_headerless_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/meta_pts_monotonic_after_reorder` | N/A | Pass (2.1 s) | Pass (1.07 s) | N/A | Pass (1.17 s) | N/A | Pass (1.16 s) | Pass (1.21 s) |
| `streaming-output/ts_continuity_many_writes` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vp9_keyframe` | N/A | Pass (582 ms) | Pass (42.14 ms) | N/A | Pass (117 ms) | N/A | Pass (565 ms) | Pass (106 ms) |
| `metadata/read_flac_seektable` | N/A | Pass (2.09 ms) | Pass (1.39 ms) | N/A | N/A | Pass (1.78 ms) | Pass (5.08 ms) | N/A |
| `probe/metamorphic-duration-across-containers` | N/A | Pass (83.91 ms) | Pass (10.19 ms) | N/A | Pass (65.38 ms) | Pass (14.63 ms) | Pass (12.03 ms) | Pass (86.2 ms) |
| `mux/av1_opus_to_mp4` | N/A | N/A | Pass (8.19 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_rotated_keyframe_aligned` | N/A | Pass (39.99 ms) | Pass (358 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/flac_to_mkv_audio` | N/A | Pass (21.04 ms) | Pass (5.89 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_audio_short` | N/A | Pass (2.27 ms) | Pass (1.48 ms) | Pass (1.9 ms) | Pass (2.88 ms) | Pass (3.19 ms) | Pass (3.76 ms) | Pass (14.95 ms) |
| `transcode/vp9_to_h264_mp4` | N/A | Pass (24.43 s) | Pass (991 ms) | N/A | N/A | N/A | Pass (1.29 s) | N/A |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | N/A | Pass (376 ms) | Pass (209 ms) | N/A | N/A | N/A | Pass (218 ms) | N/A |
| `decode-seek/decode_vp9_alpha` | N/A | N/A | Pass (241 ms) | N/A | Pass (355 ms) | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-medium` | N/A | Pass (50.75 ms) | Pass (7.94 ms) | Pass (42.94 ms) | Pass (60.9 ms) | Pass (2.86 ms) | Pass (7.22 ms) | Pass (21.76 ms) |
| `audio-dsp/upmix_stereo_to_5_1` | N/A | Pass (27.46 ms) | Pass (72.96 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24be_to_s16le` | N/A | Pass (10.19 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_opus_ogg` | N/A | N/A | Pass (37.54 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_f32` | N/A | Pass (8.5 ms) | Pass (7.28 ms) | N/A | Pass (16.5 ms) | N/A | N/A | N/A |
| `remux/prop_rotation_survives_mp4_mov` | N/A | Pass (36.84 ms) | Pass (237 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/empty-audio-wav` | N/A | Pass (2.76 ms) | Pass (3.13 ms) | N/A | Pass (3.52 ms) | Pass (1.51 ms) | Pass (1.1 ms) | N/A |
| `transcode/bframe_reorder_h264_to_h264` | N/A | Pass (23.41 s) | Pass (959 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/aac_adts` | N/A | Pass (6.6 ms) | Pass (3.82 ms) | N/A | N/A | Pass (7.09 ms) | Pass (6.39 ms) | N/A |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | N/A | Pass (156 ms) | Pass (559 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_longform_audio_probe` | N/A | Pass (436 ms) | Pass (2.07 ms) | N/A | Pass (466 ms) | Pass (2.24 ms) | Pass (3.26 ms) | N/A |
| `decode-seek/decode_size_micro_h264_1frame` | N/A | Pass (14.2 ms) | Pass (12.8 ms) | N/A | Pass (4.75 ms) | N/A | Pass (3.85 ms) | Pass (11.35 ms) |
| `mux/size_micro_1frame_to_mp4` | N/A | Pass (7.91 ms) | Pass (3 ms) | Pass (3.77 ms) | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mkv` | N/A | Pass (52.37 ms) | Pass (38.18 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_in_mkv` | N/A | Pass (35.31 ms) | Pass (6.94 ms) | N/A | Pass (16.11 ms) | Pass (9.8 ms) | Pass (11.13 ms) | Pass (60.4 ms) |
| `performance/extract-metadata` | N/A | Pass (47.08 ms) | Pass (1.66 ms) | Pass (40.49 ms) | Pass (49.28 ms) | Pass (2.2 ms) | Pass (3.73 ms) | Pass (23.59 ms) |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | N/A | Pass (105 ms) | Pass (284 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_huge_h264_mov_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_multitrack` | N/A | Pass (22.25 ms) | Pass (3.78 ms) | Pass (10.08 ms) | Pass (14.9 ms) | Pass (5.28 ms) | Pass (4.35 ms) | Pass (19.62 ms) |
| `performance/size-ladder-extract-metadata-massive` | N/A | Pass (1.49 s) | Pass (26.42 ms) | Pass (1.55 s) | Pass (2.54 s) | Pass (59.11 ms) | Pass (55.88 ms) | Pass (309 ms) |
| `mux/edge_hevc_decode_mux_mkv` | N/A | Pass (89.03 ms) | Pass (22.52 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_av1_mp4` | N/A | N/A | Pass (6.4 s) | N/A | N/A | N/A | N/A | N/A |
| `demux/pcm_s16be` | N/A | Pass (6.82 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_30s` | N/A | Pass (58.19 ms) | Pass (8.21 ms) | Pass (38.64 ms) | Pass (64.07 ms) | Pass (2.32 ms) | Pass (4 ms) | Pass (21.56 ms) |
| `probe/cenc_ctr` | N/A | Pass (9.86 ms) | SKIPPED | Pass (6.31 ms) | Pass (10.4 ms) | Pass (7.53 ms) | Pass (8 ms) | Pass (22.5 ms) |
| `probe/h264_ts` | N/A | Pass (43.67 ms) | Pass (23.31 ms) | N/A | N/A | Pass (232 ms) | Pass (189 ms) | Pass (482 ms) |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | N/A | Pass (43.59 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mp4` | N/A | Pass (85.9 ms) | Pass (15.24 ms) | N/A | N/A | N/A | Pass (721 ms) | N/A |
| `transcode/flac_to_opus_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mkv` | N/A | Pass (81.19 ms) | Pass (54.63 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_multitrack` | N/A | Pass (32.31 ms) | Pass (9.6 ms) | Pass (14.73 ms) | Pass (18.1 ms) | Pass (281 ms) | Pass (71.36 ms) | Pass (552 ms) |
| `transcode/h264_fps_30_to_60` | N/A | Pass (98.44 s) | Pass (5.21 s) | N/A | N/A | N/A | N/A | N/A |
| `trim/mov_keyframe_aligned` | N/A | Pass (44.8 ms) | Pass (448 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/vp8_720p_10s_webm_to_mkv` | N/A | Pass (12.19 ms) | Pass (6.24 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_30s` | N/A | Pass (73.32 ms) | Pass (53.29 ms) | Pass (58.99 ms) | Pass (61.09 ms) | Pass (7.67 ms) | Pass (1.18 s) | Pass (3.35 ms) |
| `audio-dsp/pcm_s16le_to_s16be` | N/A | Pass (20.44 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp9_alpha` | N/A | Pass (16.6 ms) | Pass (3.9 ms) | N/A | Pass (6.44 ms) | Pass (12.54 ms) | Pass (11.66 ms) | Pass (52.85 ms) |
| `streaming-output/mp4_ttfb_buffer_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_rotated_display_matrix` | N/A | Pass (359 ms) | Pass (267 ms) | N/A | Pass (315 ms) | N/A | Pass (340 ms) | N/A |
| `probe/perf-extract-metadata-massive` | N/A | Pass (2.72 s) | Pass (81.04 ms) | Pass (3.07 s) | Pass (3.06 s) | Pass (61.17 ms) | Pass (102 ms) | Pass (305 ms) |
| `mux/mp3_to_mp4_audio` | N/A | Pass (7.34 ms) | Pass (6.91 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp3` | N/A | Pass (18.74 ms) | Pass (3.78 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_ts` | N/A | Pass (227 ms) | Pass (90.71 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_colorspace_709_to_2020` | N/A | Pass (88.04 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_roundtrip_mp4_mkv_mp4` | N/A | Pass (145 ms) | Pass (282 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/hevc_to_vp8_webm` | N/A | Pass (48.19 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mkv` | N/A | Pass (8.57 ms) | Pass (4.1 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_flac` | N/A | Pass (25.79 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/large_vp9_1080p_120s` | N/A | Pass (155 ms) | Pass (10.15 ms) | N/A | Pass (157 ms) | Pass (91.98 ms) | Pass (96.7 ms) | Pass (40.25 ms) |
| `probe/hls_aes128` | N/A | Pass (43.52 ms) | Pass (31.9 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mov` | N/A | Pass (175 ms) | Pass (285 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/size_longform_audio_to_mp4` | N/A | Pass (494 ms) | Pass (5.03 s) | Pass (2.83 s) | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_huge_h264_600s` | N/A | N/A | Pass (1.18 s) | N/A | Pass (1.68 s) | N/A | SKIPPED | Pass (1.16 s) |
| `audio-dsp/resample_48k_to_16k` | N/A | Pass (28.49 ms) | Pass (22.44 ms) | N/A | N/A | N/A | Pass (16.9 ms) | N/A |
| `remux/opus_ogg_to_mkv` | N/A | Pass (6.14 ms) | Pass (5.53 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/perf_cenc_ctr_decrypt_throughput` | N/A | Pass (24.53 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s16_to_wav` | N/A | Pass (28.79 ms) | Pass (4.25 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_opus` | N/A | Pass (2.56 ms) | Pass (1.85 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large` | N/A | Pass (135 ms) | Pass (3.77 ms) | Pass (107 ms) | Pass (200 ms) | Pass (2.79 ms) | Pass (5.59 ms) | Pass (27.2 ms) |
| `decode-seek/decode_mkv_h264` | N/A | Pass (727 ms) | Pass (651 ms) | N/A | Pass (576 ms) | N/A | Pass (476 ms) | Pass (774 ms) |
| `demux/vp8_720p_10s` | N/A | Pass (9.69 ms) | Pass (4.76 ms) | N/A | Pass (6.77 ms) | Pass (211 ms) | Pass (154 ms) | Pass (115 ms) |
| `trim/audio_aac_adts_copy` | N/A | Pass (6.16 ms) | Pass (5.28 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mp4` | N/A | Pass (462 ms) | Pass (219 ms) | Pass (435 ms) | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_f32_to_s16` | N/A | Pass (15.28 ms) | Pass (18.45 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/size_tiny_360p_to_mp4` | N/A | Pass (15.25 ms) | Pass (3.99 ms) | Pass (7.1 ms) | N/A | N/A | N/A | N/A |
| `decode-seek/decode_extreme_fps_240` | N/A | Pass (210 ms) | Pass (397 ms) | N/A | Pass (174 ms) | N/A | Pass (143 ms) | Pass (136 ms) |
| `transcode/h264_crf_quality_mode` | N/A | Pass (62.72 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt` | N/A | Pass (43.94 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16_to_f32` | N/A | Pass (40.09 ms) | Pass (10.84 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/h264_to_mov` | N/A | Pass (69.56 s) | Pass (2.58 s) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_vp9_1080p_10s` | N/A | Pass (35.79 ms) | Pass (7.75 ms) | N/A | Pass (22.7 ms) | Pass (12.36 ms) | Pass (14.51 ms) | Pass (37.07 ms) |
| `probe/huge_h264_1080p_600s` | N/A | Pass (577 ms) | Pass (6.11 ms) | Pass (647 ms) | Pass (722 ms) | Pass (5.49 ms) | Pass (6.81 ms) | Pass (58.02 ms) |
| `mux/edge_hevc_decode_mux_mp4` | N/A | Pass (61.89 ms) | Pass (35.44 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/aiff_container_probe` | N/A | Pass (3.54 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/wav_to_aac_mp4` | N/A | Pass (175 ms) | Pass (34.63 ms) | N/A | N/A | N/A | Pass (52.41 ms) | N/A |
| `demux/flac_noseektable` | N/A | Pass (3.16 ms) | Pass (3.61 ms) | N/A | N/A | Pass (8.74 ms) | Pass (7.24 ms) | N/A |
| `probe/realworld_mdn_trex_mp3` | N/A | Pass (2.48 ms) | Pass (4.09 ms) | N/A | N/A | Pass (2.6 ms) | Pass (2.28 ms) | N/A |
| `transcode/h264_to_fragmented_mp4` | N/A | Pass (69.34 s) | Pass (2.56 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_multitrack` | N/A | Pass (15.66 ms) | Pass (2.69 ms) | Pass (12.8 ms) | Pass (13.71 ms) | Pass (3.06 ms) | Pass (3.22 ms) | Pass (17.96 ms) |
| `performance/size-ladder-iterate-packets-large4k` | N/A | Pass (75.31 ms) | Pass (25.49 ms) | Pass (50.62 ms) | Pass (43.92 ms) | Pass (1.68 s) | Pass (380 ms) | Pass (1.81 s) |
| `remux/prop_bframes_decode_remux_mp4_mkv` | N/A | Pass (141 ms) | Pass (89.65 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_buffer_shape` | N/A | Pass (192 ms) | Pass (326 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt_eq_cleartext` | N/A | Pass (101 ms) | Pass (83.94 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned_short` | N/A | Pass (66.19 ms) | Pass (340 ms) | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_reserve_duration_invariant` | N/A | Pass (121 ms) | Pass (49.28 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_vfr_arbitrary` | N/A | Pass (249 ms) | Pass (49.49 ms) | N/A | Pass (43.35 ms) | N/A | Pass (336 ms) | Pass (105 ms) |
| `transcode/aac_to_mp3_mp4` | N/A | Pass (109 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/seek_bframes_midgop` | N/A | Pass (843 ms) | Pass (96.47 ms) | N/A | Pass (96.72 ms) | N/A | Pass (2.46 s) | Pass (237 ms) |
| `remux/vp9_1080p_10s_webm_to_webm` | N/A | Pass (61.78 ms) | Pass (19.66 ms) | N/A | N/A | N/A | Pass (125 ms) | N/A |
| `demux/h264_4k_10s` | N/A | Pass (72.59 ms) | Pass (24.39 ms) | Pass (49.37 ms) | Pass (52.45 ms) | Pass (667 ms) | Pass (688 ms) | Pass (1.57 s) |
| `probe/hls_vod` | N/A | Pass (47.05 ms) | Pass (19.47 ms) | N/A | N/A | Pass (297 ms) | Pass (312 ms) | N/A |
| `metadata/read_pcm_s16be` | N/A | Pass (4.96 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/caf_container_probe` | N/A | Pass (14.31 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/pcm_s16be` | N/A | Pass (3.41 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_bframes_1080p` | N/A | Pass (43.01 ms) | N/A | Pass (23.2 ms) | Pass (39.7 ms) | Pass (463 ms) | Pass (972 ms) | N/A |
| `mux/vp9_opus_to_webm` | N/A | Pass (100 ms) | Pass (23.49 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp9_to_av1_webm` | N/A | N/A | Pass (2.6 s) | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large4k` | N/A | Pass (133 ms) | Pass (1.86 ms) | Pass (32.83 ms) | Pass (48.25 ms) | Pass (3.3 ms) | Pass (3.78 ms) | Pass (55.43 ms) |
| `transcode/extreme_fps_1` | N/A | Pass (8.77 s) | Pass (508 ms) | N/A | N/A | N/A | N/A | N/A |
| `performance/iterate-video-packets` | N/A | Pass (78.59 ms) | Pass (37.05 ms) | Pass (60.19 ms) | Pass (66.78 ms) | Pass (21.84 ms) | Pass (1.05 s) | Pass (4.11 ms) |
| `trim/h264_vfr_frame_accurate` | N/A | Pass (2.19 s) | Pass (193 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_open_gop_first_frame` | N/A | Pass (451 ms) | Pass (368 ms) | N/A | Pass (335 ms) | N/A | Pass (325 ms) | Pass (410 ms) |
| `remux/prop_adts_to_mp4_duration_invariant` | N/A | Pass (5.52 ms) | Pass (3.91 ms) | N/A | N/A | N/A | Pass (81.9 ms) | N/A |
| `transcode/av1_to_vp9_webm` | N/A | N/A | Pass (487 ms) | N/A | N/A | N/A | Pass (720 ms) | N/A |
| `transcode/h264_to_mkv` | N/A | N/A | Pass (2.55 s) | N/A | N/A | N/A | N/A | N/A |
| `probe/massive_vp9_1080p_2h` | N/A | Pass (1.05 s) | Pass (10.43 ms) | N/A | Pass (1.81 s) | Pass (4.43 ms) | Pass (52.29 ms) | Pass (31.74 ms) |
| `metadata/read_mp3_xing` | N/A | Pass (2.19 ms) | Pass (1.71 ms) | N/A | N/A | Pass (1.5 ms) | Pass (2.01 ms) | N/A |
| `demux/vp9_1080p_10s` | N/A | Pass (43.46 ms) | Pass (13 ms) | N/A | Pass (23.77 ms) | Pass (42.89 ms) | Pass (60.35 ms) | Pass (713 ms) |
| `trim/h264_noop_full_range_idempotent` | N/A | Pass (123 ms) | Pass (43.48 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mp4` | N/A | Pass (164 ms) | Pass (17.26 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | N/A | N/A | Pass (3.76 s) | N/A | N/A | N/A | Pass (5.1 s) | N/A |
| `probe/vp9_alpha` | N/A | Pass (7.01 ms) | Pass (10.91 ms) | N/A | Pass (5.52 ms) | Pass (8.76 ms) | Pass (5.44 ms) | Pass (15.99 ms) |
| `streaming-output/stream_large_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/roundtrip_leg1_h264_to_vp9` | N/A | N/A | Pass (5.05 s) | N/A | N/A | N/A | Pass (7.63 s) | N/A |
| `trim/h264_subframe_range_frame_accurate` | N/A | Pass (1.35 s) | Pass (157 ms) | N/A | N/A | N/A | N/A | N/A |
| `demux/av1_720p_5s` | N/A | Pass (11.81 ms) | Pass (6.29 ms) | N/A | Pass (7.92 ms) | Pass (59.79 ms) | Pass (28.52 ms) | Pass (141 ms) |
| `streaming-output/prop_probe_dur_stream_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `transcode/vp8_to_h264_mp4` | N/A | Pass (11.55 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_video_plus_opus_audio_to_webm` | N/A | Pass (112 ms) | Pass (33.51 ms) | N/A | N/A | N/A | N/A | N/A |
| `decode-seek/decode_size_large_h264_120s` | N/A | Pass (1.65 s) | Pass (1.06 s) | N/A | Pass (1.22 s) | N/A | Pass (11.26 s) | Pass (1.17 s) |
| `transcode/gapless_pcm_to_aac_priming` | N/A | Pass (173 ms) | Pass (45.5 ms) | N/A | N/A | N/A | Pass (65.24 ms) | N/A |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | N/A | Pass (475 ms) | Pass (304 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_no_media_tracks_probe` | N/A | Pass (135 ms) | Pass (23 ms) | N/A | Pass (11 ms) | Pass (4 ms) | Pass (24 ms) | N/A |
| `trim/robust_start_past_eof` | N/A | Pass (194 ms) | Pass (87 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_trim_additivity_compose` | N/A | Pass (56.91 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_pcm_s16be_probe` | N/A | Pass (139 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_truncated_mdat_graceful` | N/A | Pass (123 ms) | Pass (30 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_mp3_header_truncated_probe` | N/A | Pass (117 ms) | Pass (8 ms) | N/A | N/A | Pass (29 ms) | Pass (18 ms) | N/A |
| `trim/robust_bitflipped_source` | N/A | Pass (115 ms) | Pass (149 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_audio_only_probe` | N/A | Pass (134 ms) | Pass (25 ms) | Pass (11 ms) | Pass (33 ms) | Pass (26 ms) | Pass (9 ms) | Pass (41 ms) |
| `robustness/prop_remux_duration_preserved` | N/A | Pass (557 ms) | Pass (555 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_seek_past_eof` | N/A | Pass (694 ms) | Pass (81 ms) | N/A | Pass (124 ms) | N/A | Pass (10.04 s) | Pass (211 ms) |
| `probe/truncated-header-graceful` | N/A | Pass (130 ms) | Pass (17 ms) | Pass (38 ms) | Pass (13 ms) | Pass (32 ms) | Pass (4 ms) | Pass (36 ms) |
| `robustness/edge_audio_only_micro_probe` | N/A | Pass (137 ms) | Pass (21 ms) | Pass (15 ms) | Pass (10 ms) | Pass (4 ms) | Pass (16 ms) | Pass (54 ms) |
| `robustness/prop_duration_consistent_across_containers` | N/A | Pass (296 ms) | Pass (26 ms) | N/A | Pass (96 ms) | Pass (35 ms) | Pass (65 ms) | Pass (169 ms) |
| `encryption/cenc_ctr_senc_bitflip_graceful` | N/A | Pass (116 ms) | Pass (35 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_webm_header_truncated_demux` | N/A | Pass (199 ms) | Pass (22 ms) | N/A | N/A | Pass (13 ms) | Pass (17 ms) | Pass (51 ms) |
| `demux/graceful_zero_length` | N/A | Pass (125 ms) | Pass (8 ms) | Pass (37 ms) | N/A | Pass (33 ms) | Pass (17 ms) | Pass (53 ms) |
| `robustness/fuzz_ts_zeroed_spans_demux` | N/A | Pass (184 ms) | Pass (44 ms) | N/A | N/A | Pass (67 ms) | Pass (58 ms) | N/A |
| `demux/graceful_webm_header_destroyed` | N/A | Pass (221 ms) | Pass (12 ms) | N/A | N/A | Pass (12 ms) | Pass (9 ms) | Pass (44 ms) |
| `robustness/fuzz_mux_target_corrupt_remux` | N/A | Pass (245 ms) | Pass (61 ms) | Pass (113 ms) | N/A | N/A | Pass (1.2 s) | N/A |
| `robustness/edge_faststart_reserve_remux` | N/A | Pass (825 ms) | Pass (610 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_dims_1x1_probe` | N/A | Pass (193 ms) | Pass (23 ms) | N/A | Pass (28 ms) | Pass (27 ms) | Pass (17 ms) | Pass (52 ms) |
| `robustness/fuzz_truncated_h264_asset_demux` | N/A | Pass (121 ms) | Pass (15 ms) | Pass (27 ms) | N/A | Pass (12 ms) | Pass (32 ms) | Pass (32 ms) |
| `trim/robust_end_far_past_eof` | N/A | Pass (207 ms) | Pass (113 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_flac_without_seektable_probe` | N/A | Pass (125 ms) | Pass (22 ms) | N/A | N/A | Pass (12 ms) | Pass (19 ms) | N/A |
| `demux/graceful_truncated_h264` | N/A | Pass (112 ms) | Pass (15 ms) | Pass (24 ms) | N/A | Pass (57 ms) | Pass (39 ms) | Pass (39 ms) |
| `remux/neg_headerless_webm_to_mkv` | N/A | Pass (285 ms) | Pass (8 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fuzz_wav_fmt_corrupt_transcode` | N/A | Pass (190 ms) | Pass (30 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/neg_garbled_ilst_mp4_probe` | N/A | Pass (194 ms) | Pass (7 ms) | Pass (84 ms) | Pass (62 ms) | Pass (8 ms) | Pass (16 ms) | Pass (117 ms) |
| `robustness/fuzz_mp4_bitflip_probe` | N/A | Pass (204 ms) | Pass (19 ms) | Pass (53 ms) | Pass (65 ms) | Pass (54 ms) | Pass (18 ms) | Pass (95 ms) |
| `robustness/image_png_probe_na` | N/A | Pass (122 ms) | Pass (28 ms) | Pass (10 ms) | Pass (20 ms) | Pass (14 ms) | Pass (12 ms) | Pass (47 ms) |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | N/A | Pass (126 ms) | Pass (25 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_cens_decrypt_na` | N/A | Pass (131 ms) | Pass (4 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/mismatch_mislabeled_container_transcode` | N/A | Pass (11.62 s) | Pass (657 ms) | N/A | N/A | N/A | Pass (695 ms) | N/A |
| `robustness/edge_headerless_recorder_probe` | N/A | Pass (161 ms) | Pass (25 ms) | N/A | Pass (25 ms) | Pass (37 ms) | Pass (19 ms) | Pass (59 ms) |
| `robustness/edge_multitrack_demux` | N/A | Pass (176 ms) | Pass (27 ms) | Pass (41 ms) | Pass (59 ms) | Pass (144 ms) | Pass (88 ms) | Pass (594 ms) |
| `robustness/fuzz_mp4_tail_truncated_demux` | N/A | Pass (199 ms) | Pass (40 ms) | Pass (56 ms) | N/A | Pass (718 ms) | Pass (1.08 s) | Pass (1.32 s) |
| `robustness/edge_video_only_micro_probe` | N/A | Pass (160 ms) | Pass (11 ms) | Pass (31 ms) | Pass (25 ms) | Pass (16 ms) | Pass (5 ms) | Pass (49 ms) |
| `transcode/negative_png_to_video` | N/A | Pass (122 ms) | Pass (19 ms) | N/A | Pass (27 ms) | N/A | Pass (27 ms) | N/A |
| `robustness/fuzz_mp4_zeroed_spans_decode` | N/A | Pass (1.91 s) | Pass (168 ms) | N/A | Pass (125 ms) | N/A | Pass (2.4 s) | Pass (135 ms) |
| `transcode/malformed_truncated_h264_transcode` | N/A | Pass (129 ms) | Pass (1.62 s) | N/A | N/A | N/A | Pass (653 ms) | N/A |
| `robustness/edge_dims_1x1_decode` | N/A | Pass (147 ms) | Pass (13 ms) | N/A | Pass (12 ms) | N/A | Pass (33 ms) | Pass (65 ms) |
| `audio-dsp/edge_empty_audio_transcode` | N/A | Pass (129 ms) | Pass (23 ms) | N/A | N/A | N/A | Pass (41 ms) | N/A |
| `audio-dsp/fuzz_wav_bitflip_decode` | N/A | Pass (136 ms) | Pass (33 ms) | N/A | Pass (18 ms) | N/A | Pass (19 ms) | N/A |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | N/A | Pass (212 ms) | Pass (26 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_sample_aes_decrypt_na` | N/A | Pass (106 ms) | Pass (18 ms) | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/negative_image_into_audio_transcode` | N/A | Pass (122 ms) | Pass (23 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_vp9_into_adts_illegal` | N/A | Pass (257 ms) | Pass (131 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_ts_pts_wraparound_demux` | N/A | Pass (142 ms) | Pass (27 ms) | N/A | N/A | Pass (64 ms) | Pass (54 ms) | SKIPPED |
| `robustness/prop_gapless_sample_count_priming` | N/A | N/A | Pass (26 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_open_gop_bframes_decode` | N/A | N/A | Pass (1.62 s) | N/A | Pass (1.92 s) | N/A | Pass (1.59 s) | Pass (1.86 s) |
| `robustness/fuzz_adts_aac_bitflip_probe` | N/A | Pass (125 ms) | Pass (26 ms) | N/A | N/A | Pass (26 ms) | Pass (33 ms) | N/A |
| `robustness/edge_5_1_channels_probe` | N/A | Pass (216 ms) | Pass (40 ms) | N/A | Pass (42 ms) | Pass (9 ms) | Pass (7 ms) | N/A |
| `robustness/edge_zero_length_probe` | N/A | Pass (121 ms) | Pass (7 ms) | Pass (15 ms) | Pass (15 ms) | Pass (9 ms) | Pass (15 ms) | Pass (30 ms) |
| `transcode/negative_webp_to_video` | N/A | Pass (105 ms) | Pass (32 ms) | N/A | Pass (27 ms) | N/A | Pass (20 ms) | N/A |
| `robustness/edge_flac_with_seektable_probe` | N/A | Pass (131 ms) | Pass (26 ms) | N/A | N/A | Pass (6 ms) | Pass (15 ms) | N/A |
| `mux/neg_h264_into_ogg_illegal` | N/A | Pass (650 ms) | Pass (39 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_rotated_remux` | N/A | Pass (720 ms) | Pass (650 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_cbcs_boundary_decrypt` | N/A | N/A | Pass (175 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/neg_garbled_id3_mp3_probe` | N/A | Pass (139 ms) | Pass (22 ms) | N/A | N/A | Pass (12 ms) | Pass (29 ms) | N/A |
| `transcode/mismatch_audio_only_to_video_target` | N/A | Pass (176 ms) | Pass (24 ms) | N/A | N/A | N/A | Pass (17 ms) | N/A |
| `robustness/prop_demux_mux_roundtrip_eq` | N/A | N/A | Pass (81 ms) | Pass (194 ms) | N/A | N/A | N/A | N/A |
| `transcode/mismatch_video_only_to_audio_target` | N/A | Pass (153 ms) | Pass (12 ms) | N/A | N/A | N/A | Pass (10 ms) | N/A |
| `robustness/prop_double_remux_stable` | N/A | N/A | Pass (370 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/clearkey_decrypt_na` | N/A | Pass (151 ms) | Pass (33 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv` | N/A | Pass (523 ms) | Pass (521 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | N/A | Pass (133 ms) | Pass (17 ms) | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_protection_zeroed_graceful` | N/A | Pass (125 ms) | Pass (41 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/neg_zeroed_mp4_to_mkv` | N/A | Pass (216 ms) | Pass (9 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_trim_concatenation` | N/A | Pass (65.47 s) | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/prop_flac_seek_seektable_equiv` | N/A | Pass (158 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_negative_start` | N/A | Pass (118 ms) | Pass (4 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_mislabeled_container_probe` | N/A | Pass (145 ms) | Pass (17 ms) | N/A | Pass (21 ms) | Pass (34 ms) | Pass (24 ms) | Pass (49 ms) |
| `robustness/image_jpeg_probe_na` | N/A | Pass (115 ms) | Pass (7 ms) | Pass (14 ms) | Pass (7 ms) | Pass (13 ms) | Pass (7 ms) | Pass (44 ms) |
| `robustness/fuzz_mp4_header_truncated_demux` | N/A | Pass (158 ms) | Pass (16 ms) | Pass (54 ms) | N/A | Pass (29 ms) | Pass (16 ms) | Pass (98 ms) |
| `demux/graceful_mp4_header_destroyed` | N/A | Pass (162 ms) | Pass (40 ms) | Pass (53 ms) | N/A | Pass (23 ms) | Pass (17 ms) | Pass (45 ms) |
| `mux/neg_h264_into_wav_illegal` | N/A | Pass (281 ms) | Pass (40 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_vfr_probe` | N/A | Pass (158 ms) | Pass (8 ms) | Pass (12 ms) | Pass (31 ms) | Pass (21 ms) | Pass (21 ms) | Pass (83 ms) |
| `trim/robust_zero_length_range` | N/A | Pass (117 ms) | Pass (24 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_resize_1x1` | N/A | Pass (124 ms) | Pass (33 ms) | N/A | N/A | N/A | Pass (29 ms) | N/A |
| `robustness/edge_extreme_fps_240_probe` | N/A | Pass (197 ms) | Pass (5 ms) | Pass (40 ms) | Pass (42 ms) | Pass (34 ms) | Pass (35 ms) | Pass (63 ms) |
| `robustness/edge_headerless_recorder_remux` | N/A | Pass (658 ms) | Pass (575 ms) | N/A | N/A | N/A | Pass (555 ms) | N/A |
| `transcode/negative_jpeg_to_video` | N/A | Pass (128 ms) | Pass (28 ms) | N/A | Pass (16 ms) | N/A | Pass (40 ms) | N/A |
| `trim/robust_inverted_range` | N/A | Pass (124 ms) | Pass (13 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_gapless_priming_probe` | N/A | Pass (112 ms) | Pass (4 ms) | Pass (26 ms) | Pass (15 ms) | Pass (24 ms) | Pass (8 ms) | Pass (66 ms) |
| `transcode/malformed_zero_length_transcode` | N/A | Pass (127 ms) | Pass (15 ms) | N/A | Pass (14 ms) | N/A | Pass (14 ms) | N/A |
| `trim/robust_truncated_source` | N/A | Pass (123 ms) | Pass (944 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/fuzz_remux_zeroed_spans` | N/A | Pass (307 ms) | Pass (406 ms) | N/A | N/A | N/A | N/A | N/A |
| `remux/neg_truncated_mp4_to_mkv` | N/A | Pass (235 ms) | Pass (199 ms) | N/A | N/A | N/A | N/A | N/A |
| `robustness/image_webp_probe_na` | N/A | Pass (129 ms) | Pass (31 ms) | Pass (21 ms) | Pass (20 ms) | Pass (21 ms) | Pass (9 ms) | Pass (48 ms) |
| `robustness/fuzz_flac_bitflip_probe` | N/A | Pass (116 ms) | Pass (25 ms) | N/A | N/A | Pass (33 ms) | Pass (7 ms) | N/A |
| `robustness/edge_video_only_probe` | N/A | Pass (163 ms) | Pass (27 ms) | Pass (22 ms) | Pass (32 ms) | Pass (19 ms) | Pass (49 ms) | Pass (76 ms) |
| `robustness/fuzz_webm_bitflip_probe` | N/A | Pass (252 ms) | Pass (39 ms) | N/A | Pass (35 ms) | Pass (34 ms) | Pass (32 ms) | Pass (104 ms) |
| `robustness/edge_longform_probe` | N/A | Pass (246 ms) | Pass (79 ms) | Pass (141 ms) | Pass (291 ms) | Pass (103 ms) | Pass (91 ms) | Pass (136 ms) |
| `robustness/edge_dims_2x2_h264_probe` | N/A | Pass (123 ms) | Pass (18 ms) | Pass (40 ms) | Pass (26 ms) | Pass (17 ms) | Pass (21 ms) | Pass (64 ms) |
| `robustness/edge_fragmented_remux` | N/A | Pass (803 ms) | Pass (912 ms) | Pass (944 ms) | N/A | N/A | N/A | N/A |
| `robustness/edge_pcm_s24_decode` | N/A | Pass (146 ms) | Pass (28 ms) | N/A | N/A | N/A | N/A | N/A |
| `transcode/extreme_resize_0x0` | N/A | Pass (115 ms) | Pass (20 ms) | N/A | N/A | N/A | Pass (14 ms) | N/A |
| `audio-dsp/fuzz_aiff_header_truncated_probe` | N/A | Pass (125 ms) | N/A | N/A | N/A | N/A | N/A | N/A |
| `robustness/edge_extreme_fps_1_probe` | N/A | Pass (141 ms) | Pass (9 ms) | Pass (21 ms) | Pass (19 ms) | Pass (26 ms) | Pass (14 ms) | Pass (75 ms) |
| `audio-dsp/fuzz_wav_header_truncated_probe` | N/A | Pass (126 ms) | Pass (17 ms) | N/A | Pass (13 ms) | Pass (11 ms) | Pass (5 ms) | N/A |
| `robustness/prop_transcode_idempotent_dims_h264` | N/A | Pass (70.59 s) | Pass (3.78 s) | N/A | N/A | N/A | Pass (13.28 s) | N/A |
| `robustness/edge_seek_negative` | N/A | Pass (212 ms) | Pass (42 ms) | N/A | Pass (102 ms) | N/A | Pass (2.12 s) | Pass (142 ms) |
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | N/A | N/A | N/A | N/A | Pass (5.03 s) | N/A | N/A | N/A |

<details><summary>Cell details</summary>

- `aibrush-media@dev` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/seek_backward_then_forward` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/decode_vfr_timing` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/h264_resize_4k_to_1080p` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/bundle-size` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/convert-longtasks` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` — **N/A**: engine does not declare operation 'transcode'
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
- `aibrush-media@dev` · `performance/metamorphic-vfr-probe-duration` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_4k_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/h264_10bit_to_h264_8bit` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/hevc_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-medium` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/wav_s16` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/h264_vfr_to_cfr_30` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/ladder_tiny_h264_360p_resize_180p` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/perf-extract-metadata-huge` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/h264_rotate_180` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `metadata/write_mp4_tags` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/h264_flip_vertical` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare operation 'remux'
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
- `aibrush-media@dev` · `demux/opus` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/aac_adts` — **N/A**: engine does not declare operation 'probe'
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
- `aibrush-media@dev` · `transcode/h264_fps_15_to_30` — **N/A**: engine does not declare operation 'transcode'
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
- `aibrush-media@dev` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare operation 'transcode'
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
- `aibrush-media@dev` · `transcode/h264_bitrate_2mbps` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/vp8_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/wav_s24` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `demux/hevc_1080p_10s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `metadata/tracks_attribution_multitrack` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/wav_f32` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/av_downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/h264_1080p_5s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/decode-fps` — **N/A**: engine does not declare operation 'decodeFrames'
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
- `aibrush-media@dev` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare operation 'transcode'
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
- `aibrush-media@dev` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `metadata/write_mkv_tags` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `decode-seek/seek_av1_keyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
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
- `aibrush-media@dev` · `transcode/h264_crop_center` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/seek_vp8_keyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-massive` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/opus` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `decode-seek/seek_hevc_keyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare operation 'remux'
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
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-huge` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/h264_rotate_270_dimswap` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `performance/size-ladder-demux-peak-memory-large4k` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `demux/size_large_large_vp9_1080p_120s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/decode_size_large_vp9_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `decode-seek/seek_h264_nonkeyframe` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `transcode/hevc_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/longform_1h_audio` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/h264_pad_letterbox_4x3_to_16x9` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/size_large_large_h264_1080p_120s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
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
- `aibrush-media@dev` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `demux/empty_audio_zero_packets` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/vp9_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/aac_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
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
- `aibrush-media@dev` · `transcode/ladder_tiny_vp9_360p_to_h264_180p` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `decode-seek/decode_vp9_alpha` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-medium` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/wav_to_opus_ogg` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/wav_f32` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `probe/empty-audio-wav` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/bframe_reorder_h264_to_h264` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/aac_adts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/edge_longform_audio_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `decode-seek/decode_size_micro_h264_1frame` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `metadata/read_h264_in_mkv` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/extract-metadata` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
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
- `aibrush-media@dev` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/hevc_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/wav_to_flac` — **N/A**: engine does not declare operation 'transcode'
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
- `aibrush-media@dev` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `decode-seek/decode_extreme_fps_240` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `transcode/h264_crf_quality_mode` — **N/A**: engine does not declare operation 'transcode'
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
- `aibrush-media@dev` · `demux/h264_4k_10s` — **N/A**: engine does not declare operation 'demux'
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
- `aibrush-media@dev` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `decode-seek/decode_open_gop_first_frame` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/av1_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/h264_to_mkv` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/massive_vp9_1080p_2h` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_mp3_xing` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `demux/vp9_1080p_10s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `transcode/metamorphic_duration_preserved_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `probe/vp9_alpha` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `demux/av1_720p_5s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/vp8_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `decode-seek/decode_size_large_h264_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `transcode/gapless_pcm_to_aac_priming` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/edge_no_media_tracks_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `trim/robust_start_past_eof` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `encryption/cenc_ctr_truncated_mdat_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `robustness/fuzz_mp3_header_truncated_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `trim/robust_bitflipped_source` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/edge_audio_only_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/edge_seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `probe/truncated-header-graceful` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_audio_only_micro_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/prop_duration_consistent_across_containers` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `encryption/cenc_ctr_senc_bitflip_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `robustness/fuzz_webm_header_truncated_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/graceful_zero_length` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `robustness/fuzz_ts_zeroed_spans_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/graceful_webm_header_destroyed` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `robustness/fuzz_mux_target_corrupt_remux` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/edge_faststart_reserve_remux` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/edge_dims_1x1_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/fuzz_truncated_h264_asset_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `trim/robust_end_far_past_eof` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/edge_flac_without_seektable_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `demux/graceful_truncated_h264` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `remux/neg_headerless_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `audio-dsp/fuzz_wav_fmt_corrupt_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `metadata/neg_garbled_ilst_mp4_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/fuzz_mp4_bitflip_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/image_png_probe_na` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `mux/neg_zero_tracks_empty_audio_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `transcode/mismatch_mislabeled_container_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/edge_headerless_recorder_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_multitrack_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `robustness/fuzz_mp4_tail_truncated_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `robustness/edge_video_only_micro_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/negative_png_to_video` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/fuzz_mp4_zeroed_spans_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `transcode/malformed_truncated_h264_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/edge_dims_1x1_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/fuzz_wav_bitflip_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `robustness/fuzz_encrypted_mp4_ciphertext_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `mux/neg_vp9_into_adts_illegal` — **N/A**: engine does not declare operation 'demux'
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
- `aibrush-media@dev` · `metadata/neg_garbled_id3_mp3_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/mismatch_audio_only_to_video_target` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/prop_demux_mux_roundtrip_eq` — **N/A**: engine does not declare operation 'mux'
- `aibrush-media@dev` · `transcode/mismatch_video_only_to_audio_target` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `robustness/prop_decode_remux_eq_decode_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/fuzz_ogg_opus_header_truncated_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `encryption/cenc_ctr_protection_zeroed_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `remux/neg_zeroed_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/prop_trim_concatenation` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `trim/robust_negative_start` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/edge_mislabeled_container_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/image_jpeg_probe_na` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/fuzz_mp4_header_truncated_demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/graceful_mp4_header_destroyed` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/neg_h264_into_wav_illegal` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `robustness/edge_vfr_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `trim/robust_zero_length_range` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `transcode/extreme_resize_1x1` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/edge_extreme_fps_240_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_headerless_recorder_remux` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `transcode/negative_jpeg_to_video` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/robust_inverted_range` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/edge_gapless_priming_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `transcode/malformed_zero_length_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `trim/robust_truncated_source` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `robustness/fuzz_remux_zeroed_spans` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/neg_truncated_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/image_webp_probe_na` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/fuzz_flac_bitflip_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_video_only_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/fuzz_webm_bitflip_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_longform_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_dims_2x2_h264_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_fragmented_remux` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `robustness/edge_pcm_s24_decode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `transcode/extreme_resize_0x0` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/fuzz_aiff_header_truncated_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/edge_extreme_fps_1_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `audio-dsp/fuzz_wav_header_truncated_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `robustness/prop_transcode_idempotent_dims_h264` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `robustness/edge_seek_negative` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `transcode/video_only_h264_resize_360p_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `ffmpeg.wasm@0.12.15` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `performance/convert-longtasks` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: large VP9→H.264/AAC 720p re-encode exceeds the browser-wasm suite budget
- `ffmpeg.wasm@0.12.15` · `transcode/hevc_to_av1_webm` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare encryption scheme 'cenc-cbcs'
- `ffmpeg.wasm@0.12.15` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare feature 'remux:av1-opus-in-mp4'
- `ffmpeg.wasm@0.12.15` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `transcode/vp9_alpha_to_vp9_keepalpha` — **N/A**: engine does not declare feature 'alpha'
- `ffmpeg.wasm@0.12.15` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare feature 'remux:av1-opus-in-webm'
- `ffmpeg.wasm@0.12.15` · `transcode/av1_to_h264_mp4` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare feature 'headerless'
- `ffmpeg.wasm@0.12.15` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `transcode/gapless_pcm_to_opus_priming` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `transcode/h264_to_hevc_mp4` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: H.264 to HEVC/MP4 re-encode exceeds the browser-wasm suite budget
- `ffmpeg.wasm@0.12.15` · `transcode/hevc_to_vp9_webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare feature 'depth:10bit-output'
- `ffmpeg.wasm@0.12.15` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `transcode/vp8_to_vp9_webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `performance/convert-webm-resize-320x180` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `performance/encode-fps` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `performance/decode-fps` — **N/A**: engine does not declare feature 'decode:golden-rgba'
- `ffmpeg.wasm@0.12.15` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `decode-seek/seek_av1_keyframe` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `performance/convert-peak-memory` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare feature 'trim:massive-lazy-read'
- `ffmpeg.wasm@0.12.15` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/bframe_reorder_h264_to_vp9` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `transcode/vp9_alpha_to_vp8_keepalpha` — **N/A**: engine does not declare feature 'alpha'
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
- `ffmpeg.wasm@0.12.15` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: ffmpeg.wasm@0.12.15: remux not applicable: WebM cannot stream-copy track codecs [h264, aac]
- `ffmpeg.wasm@0.12.15` · `transcode/aac_to_opus_webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare feature 'headerless'
- `ffmpeg.wasm@0.12.15` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `decode-seek/decode_vp9_alpha` — **N/A**: engine does not declare feature 'alpha'
- `ffmpeg.wasm@0.12.15` · `transcode/wav_to_opus_ogg` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `transcode/h264_to_av1_mp4` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/flac_to_opus_webm` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `mux/mp4_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `decode-seek/decode_size_huge_h264_600s` — **N/A**: ffmpeg.wasm@0.12.15: decodeFrames not applicable: huge 600s MOV decode requires a whole-file browser-wasm decode path that exceeds the suite budget
- `ffmpeg.wasm@0.12.15` · `transcode/vp9_to_av1_webm` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/av1_to_vp9_webm` — **N/A**: engine does not declare video codec 'av1'
- `ffmpeg.wasm@0.12.15` · `transcode/h264_to_mkv` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: H.264 transcode to MKV exceeds the browser-wasm suite budget
- `ffmpeg.wasm@0.12.15` · `transcode/metamorphic_duration_preserved_h264_to_vp9` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: ffmpeg.wasm@0.12.15: transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path
- `ffmpeg.wasm@0.12.15` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare feature 'target:writes'
- `ffmpeg.wasm@0.12.15` · `robustness/prop_gapless_sample_count_priming` — **N/A**: engine does not declare feature 'audio-samples:gapless-priming'
- `ffmpeg.wasm@0.12.15` · `robustness/edge_open_gop_bframes_decode` — **N/A**: engine does not declare feature 'decode:golden-rgba'
- `ffmpeg.wasm@0.12.15` · `robustness/edge_cbcs_boundary_decrypt` — **N/A**: engine does not declare encryption scheme 'cenc-cbcs'
- `ffmpeg.wasm@0.12.15` · `robustness/prop_demux_mux_roundtrip_eq` — **N/A**: engine does not declare feature 'mux:roundtrip-compare'
- `ffmpeg.wasm@0.12.15` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare feature 'remux:compose'
- `ffmpeg.wasm@0.12.15` · `transcode/video_only_h264_resize_360p_to_vp9_webm` — **N/A**: engine does not declare feature 'mediarecorder:video-only'
- `mediabunny@1.48.0` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `transcode/flac_to_aac_mp4` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/h264_10bit_to_h264_8bit` — **N/A**: engine does not declare feature 'depth:10bit-to-8bit'
- `mediabunny@1.48.0` · `transcode/h264_flip_vertical` — **N/A**: engine does not declare feature 'flip'
- `mediabunny@1.48.0` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare feature 'trim:flac-seektable-copy'
- `mediabunny@1.48.0` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare feature 'depth:10bit-output'
- `mediabunny@1.48.0` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `transcode/wav_to_mp3_mp4` — **N/A**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/h264_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/h264_two_pass_bitrate` — **N/A**: engine does not declare feature 'two-pass'
- `mediabunny@1.48.0` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `demux/realworld_mdn_flower_mp4` — **N/A**: engine does not declare feature 'packets:dts'
- `mediabunny@1.48.0` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare feature 'flip'
- `mediabunny@1.48.0` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `demux/h264_vfr` — **N/A**: engine does not declare feature 'packets:dts'
- `mediabunny@1.48.0` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare feature 'rotation:decode'
- `mediabunny@1.48.0` · `performance/metamorphic-vfr-iterate-packets` — **N/A**: engine does not declare feature 'packets:dts'
- `mediabunny@1.48.0` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare feature 'trim:flac-no-seektable-frame-scan'
- `mediabunny@1.48.0` · `transcode/hdr10_to_sdr_tonemap` — **N/A**: engine does not declare feature 'tonemap'
- `mediabunny@1.48.0` · `transcode/wav_to_vorbis_ogg` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare feature 'remux:flac-in-ogg'
- `mediabunny@1.48.0` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare output container 'aiff'
- `mediabunny@1.48.0` · `transcode/vp9_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `probe/cenc_ctr` — **SKIPPED**: mediabunny@1.48.0 WASM-aborts ("Assertion failed.") while parsing this CENC-CTR fixture (cenc_ctr.mp4); it probes cenc_cbcs.mp4 and every other corpus file fine, and ffmpeg.wasm reads/decrypts cenc_ctr.mp4 correctly, so the fixture is valid — this is a tracked engine limitation on the cenc-ctr container, not a suite/fixture defect.
- `mediabunny@1.48.0` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare feature 'webcrypto:cenc-ctr-clear-output'
- `mediabunny@1.48.0` · `transcode/flac_to_opus_webm` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare output container 'aiff'
- `mediabunny@1.48.0` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `mux/mp4_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare feature 'colorspace'
- `mediabunny@1.48.0` · `transcode/hevc_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/wav_to_flac` — **N/A**: browser cannot encode audio codec 'flac' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare feature 'webcrypto:cenc-ctr-clear-output'
- `mediabunny@1.48.0` · `transcode/h264_crf_quality_mode` — **N/A**: engine does not declare feature 'crf'
- `mediabunny@1.48.0` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare feature 'webcrypto:cenc-ctr-clear-output'
- `mediabunny@1.48.0` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `transcode/aac_to_mp3_mp4` — **N/A**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `mediabunny@1.48.0` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `demux/h264_bframes_1080p` — **N/A**: engine does not declare feature 'packets:dts'
- `mediabunny@1.48.0` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare feature 'target:writes'
- `mediabunny@1.48.0` · `transcode/vp8_to_h264_mp4` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare feature 'trim:compose'
- `mediabunny@1.48.0` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `robustness/prop_trim_concatenation` — **N/A**: engine does not declare feature 'trim:compose'
- `mediabunny@1.48.0` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare feature 'flac:seektable-seek-equivalence'
- `mediabunny@1.48.0` · `audio-dsp/fuzz_aiff_header_truncated_probe` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `transcode/video_only_h264_resize_360p_to_vp9_webm` — **N/A**: engine does not declare feature 'mediarecorder:video-only'
- `mp4box@2.3.0` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare feature 'fastStart:none'
- `mp4box@2.3.0` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/seek_backward_then_forward` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare feature 'streaming:decode-equality'
- `mp4box@2.3.0` · `decode-seek/decode_vfr_timing` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `transcode/h264_resize_4k_to_1080p` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/convert-longtasks` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/hls_aes128` — **N/A**: engine does not declare input container 'hls'
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
- `mp4box@2.3.0` · `decode-seek/decode_vp8` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/realworld_mdn_trex_mp3` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `transcode/h264_10bit_to_h264_8bit` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/hevc_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `transcode/h264_vfr_to_cfr_30` — **N/A**: engine does not declare operation 'transcode'
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
- `mp4box@2.3.0` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `mp4box@2.3.0` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/realworld_mdn_flower_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/h264_resize_720p` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/meta_seek_vs_linear_decode` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `transcode/vp9_alpha_to_vp9_keepalpha` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare feature 'mux:browser-decode-equality'
- `mp4box@2.3.0` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `probe/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `probe/vp9_1080p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `probe/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `transcode/roundtrip_leg2_vp9_to_h264` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/meta_decode_remux_eq_decode_anchored` — **N/A**: engine does not declare output container 'mkv'
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
- `mp4box@2.3.0` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `mp4box@2.3.0` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `demux/size_tiny_tiny_vp9_360p_2s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/gapless_pcm_to_opus_priming` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `probe/h264_in_mkv` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
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
- `mp4box@2.3.0` · `transcode/h264_bitrate_2mbps` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/vp8_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare feature 'fastStart:none'
- `mp4box@2.3.0` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `probe/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `transcode/av_downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
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
- `mp4box@2.3.0` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `mp4box@2.3.0` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `metadata/write_mkv_tags` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `decode-seek/seek_av1_keyframe` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare feature 'fastStart:none'
- `mp4box@2.3.0` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `performance/seek-ms` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/bframe_reorder_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/vp9_alpha_to_vp8_keepalpha` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `decode-seek/decode_multitrack_select_video` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/opus_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/mp3_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/decode_h264_first_frames` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `transcode/fanout_h264_abr_ladder` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `decode-seek/seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `mp4box@2.3.0` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `decode-seek/decode_tiny_dims_1x1` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `demux/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `decode-seek/decode_bframes_reorder` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare output container 'ts'
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
- `mp4box@2.3.0` · `decode-seek/seek_hevc_keyframe` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare feature 'streaming:decode-equality'
- `mp4box@2.3.0` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `transcode/aac_to_pcm_wav_extract` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `decode-seek/decode_av1` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `transcode/hdr10_to_sdr_tonemap` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/decode_size_tiny_vp9_360p` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `decode-seek/seek_repeated_same_target` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `transcode/mp3_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/metamorphic-recorder-headerless-sane-duration` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `transcode/wav_to_vorbis_ogg` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `decode-seek/seek_zero` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `decode-seek/decode_h264_10bit` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `demux/realworld_mdn_flower_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `performance/op-sweep-transcode-webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `transcode/h264_rotate_270_dimswap` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `demux/size_large_large_vp9_1080p_120s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/decode_size_large_vp9_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `decode-seek/seek_h264_nonkeyframe` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `transcode/hevc_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/h264_pad_letterbox_4x3_to_16x9` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/tiny_vp9_360p_2s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `transcode/extreme_fps_240` — **N/A**: engine does not declare operation 'transcode'
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
- `mp4box@2.3.0` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare input container 'webm'
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
- `mp4box@2.3.0` · `decode-seek/decode_vp9_alpha` — **N/A**: engine does not declare operation 'decodeFrames'
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
- `mp4box@2.3.0` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `mp4box@2.3.0` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `transcode/h264_to_av1_mp4` — **N/A**: engine does not declare operation 'transcode'
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
- `mp4box@2.3.0` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare feature 'target:writes'
- `mp4box@2.3.0` · `decode-seek/decode_rotated_display_matrix` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `mux/mp3_to_mp3` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `mux/mp4_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `mp4box@2.3.0` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `transcode/hevc_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare output container 'mkv'
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
- `mp4box@2.3.0` · `decode-seek/decode_mkv_h264` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `demux/vp8_720p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/decode_extreme_fps_240` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/h264_crf_quality_mode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/h264_to_mov` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `metadata/read_vp9_1080p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare feature 'mux:browser-decode-equality'
- `mp4box@2.3.0` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `transcode/wav_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `probe/realworld_mdn_trex_mp3` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `transcode/h264_to_fragmented_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare feature 'fastStart:none'
- `mp4box@2.3.0` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `mp4box@2.3.0` · `decode-seek/seek_vfr_arbitrary` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `transcode/aac_to_mp3_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `decode-seek/seek_bframes_midgop` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `mp4box@2.3.0` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `mp4box@2.3.0` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/vp9_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/extreme_fps_1` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `decode-seek/decode_open_gop_first_frame` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `transcode/av1_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/h264_to_mkv` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/massive_vp9_1080p_2h` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `metadata/read_mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `demux/vp9_1080p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare feature 'mux:browser-decode-equality'
- `mp4box@2.3.0` · `transcode/metamorphic_duration_preserved_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `probe/vp9_alpha` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `mp4box@2.3.0` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `demux/av1_720p_5s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare feature 'target:writes'
- `mp4box@2.3.0` · `transcode/vp8_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `decode-seek/decode_size_large_h264_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/gapless_pcm_to_aac_priming` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `robustness/edge_no_media_tracks_probe` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `trim/robust_start_past_eof` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `encryption/cenc_ctr_truncated_mdat_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `robustness/fuzz_mp3_header_truncated_probe` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `trim/robust_bitflipped_source` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `robustness/edge_seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `robustness/prop_duration_consistent_across_containers` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `encryption/cenc_ctr_senc_bitflip_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `robustness/fuzz_webm_header_truncated_demux` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `robustness/fuzz_ts_zeroed_spans_demux` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `demux/graceful_webm_header_destroyed` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `robustness/edge_faststart_reserve_remux` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `mp4box@2.3.0` · `robustness/edge_dims_1x1_probe` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/robust_end_far_past_eof` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/edge_flac_without_seektable_probe` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `remux/neg_headerless_webm_to_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `audio-dsp/fuzz_wav_fmt_corrupt_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/neg_zero_tracks_empty_audio_to_mp4` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `transcode/mismatch_mislabeled_container_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/edge_headerless_recorder_probe` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/negative_png_to_video` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/fuzz_mp4_zeroed_spans_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `transcode/malformed_truncated_h264_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/edge_dims_1x1_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/fuzz_wav_bitflip_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `robustness/fuzz_encrypted_mp4_ciphertext_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `mux/neg_vp9_into_adts_illegal` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `robustness/edge_ts_pts_wraparound_demux` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `robustness/prop_gapless_sample_count_priming` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/edge_open_gop_bframes_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `robustness/fuzz_adts_aac_bitflip_probe` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `robustness/edge_5_1_channels_probe` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `transcode/negative_webp_to_video` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/edge_flac_with_seektable_probe` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `mux/neg_h264_into_ogg_illegal` — **N/A**: engine does not declare output container 'ogg'
- `mp4box@2.3.0` · `robustness/edge_rotated_remux` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `robustness/edge_cbcs_boundary_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `metadata/neg_garbled_id3_mp3_probe` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `transcode/mismatch_audio_only_to_video_target` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/mismatch_video_only_to_audio_target` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare feature 'remux:compose'
- `mp4box@2.3.0` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `robustness/prop_decode_remux_eq_decode_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `robustness/fuzz_ogg_opus_header_truncated_probe` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `encryption/cenc_ctr_protection_zeroed_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `remux/neg_zeroed_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `robustness/prop_trim_concatenation` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `trim/robust_negative_start` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/edge_mislabeled_container_probe` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `mux/neg_h264_into_wav_illegal` — **N/A**: engine does not declare output container 'wav'
- `mp4box@2.3.0` · `trim/robust_zero_length_range` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `transcode/extreme_resize_1x1` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/edge_headerless_recorder_remux` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `transcode/negative_jpeg_to_video` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/robust_inverted_range` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `transcode/malformed_zero_length_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `trim/robust_truncated_source` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `robustness/fuzz_remux_zeroed_spans` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/neg_truncated_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `robustness/fuzz_flac_bitflip_probe` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `robustness/fuzz_webm_bitflip_probe` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `robustness/edge_pcm_s24_decode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `transcode/extreme_resize_0x0` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/fuzz_aiff_header_truncated_probe` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `audio-dsp/fuzz_wav_header_truncated_probe` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `robustness/prop_transcode_idempotent_dims_h264` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `robustness/edge_seek_negative` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `transcode/video_only_h264_resize_360p_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `platform@chrome-149` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/h264_resize_4k_to_1080p` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `performance/convert-longtasks` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `demux/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `platform@chrome-149` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/ladder_large_h264_1080p_120s_resize_720p` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `demux/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `transcode/multitrack_select_default_audio` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/selfcheck_h264_resize_720p_tie` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `transcode/flac_to_aac_mp4` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `probe/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `demux/realworld_mdn_trex_mp3` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_10bit_to_h264_8bit` — **N/A**: engine does not declare feature 'depth:10bit-to-8bit'
- `platform@chrome-149` · `transcode/hevc_to_av1_webm` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `transcode/h264_vfr_to_cfr_30` — **N/A**: engine does not declare feature 'fps'
- `platform@chrome-149` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
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
- `platform@chrome-149` · `probe/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `probe/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `platform@chrome-149` · `transcode/roundtrip_leg2_vp9_to_h264` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `decode-seek/meta_decode_remux_eq_decode_anchored` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `demux/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `platform@chrome-149` · `transcode/av1_to_h264_mp4` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/gapless_pcm_to_opus_priming` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_rotate_90_dimswap` — **N/A**: platform engine: transcode is NA — MediaRecorder canvas capture does not apply rotation transforms
- `platform@chrome-149` · `transcode/h264_fps_15_to_30` — **N/A**: engine does not declare feature 'fps'
- `platform@chrome-149` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `transcode/h264_rotate_normalize` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/buffer_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_to_hevc_mp4` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
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
- `platform@chrome-149` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare operation 'remux'
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
- `platform@chrome-149` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/opus_to_aac_mp4` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/mp3_to_aac_mp4` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/fanout_h264_abr_ladder` — **N/A**: engine does not declare feature 'fanout'
- `platform@chrome-149` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `demux/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_to_vp9_webm` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/h264_to_ts` — **N/A**: engine does not declare output container 'ts'
- `platform@chrome-149` · `probe/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `transcode/h264_crop_center` — **N/A**: engine does not declare feature 'crop'
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
- `platform@chrome-149` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare output container 'aiff'
- `platform@chrome-149` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
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
- `platform@chrome-149` · `transcode/h264_fps_30_to_60` — **N/A**: engine does not declare feature 'fps'
- `platform@chrome-149` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare output container 'aiff'
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
- `platform@chrome-149` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
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
- `platform@chrome-149` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare operation 'remux'
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
- `platform@chrome-149` · `metadata/read_mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/metamorphic_duration_preserved_h264_to_vp9` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/vp8_to_h264_mp4` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `platform@chrome-149` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/gapless_pcm_to_aac_priming` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/robust_start_past_eof` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `encryption/cenc_ctr_truncated_mdat_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `robustness/fuzz_mp3_header_truncated_probe` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `trim/robust_bitflipped_source` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `encryption/cenc_ctr_senc_bitflip_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `robustness/fuzz_webm_header_truncated_demux` — **N/A**: platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV
- `platform@chrome-149` · `demux/graceful_zero_length` — **N/A**: platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV
- `platform@chrome-149` · `robustness/fuzz_ts_zeroed_spans_demux` — **N/A**: engine does not declare input container 'ts'
- `platform@chrome-149` · `demux/graceful_webm_header_destroyed` — **N/A**: platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV
- `platform@chrome-149` · `robustness/fuzz_mux_target_corrupt_remux` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/edge_faststart_reserve_remux` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/fuzz_truncated_h264_asset_demux` — **N/A**: platform engine: demux is NA — no moov box (not a progressive MP4 or truncated)
- `platform@chrome-149` · `trim/robust_end_far_past_eof` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `robustness/edge_flac_without_seektable_probe` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `demux/graceful_truncated_h264` — **N/A**: platform engine: demux is NA — no moov box (not a progressive MP4 or truncated)
- `platform@chrome-149` · `remux/neg_headerless_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `audio-dsp/fuzz_wav_fmt_corrupt_transcode` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `mux/neg_zero_tracks_empty_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `transcode/mismatch_mislabeled_container_transcode` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `robustness/fuzz_mp4_tail_truncated_demux` — **N/A**: platform engine: demux is NA — sample extends past end of file (truncated)
- `platform@chrome-149` · `transcode/malformed_truncated_h264_transcode` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `robustness/fuzz_encrypted_mp4_ciphertext_decode` — **N/A**: engine does not declare encryption scheme 'cenc-ctr'
- `platform@chrome-149` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `mux/neg_vp9_into_adts_illegal` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `robustness/edge_ts_pts_wraparound_demux` — **N/A**: engine does not declare input container 'ts'
- `platform@chrome-149` · `robustness/prop_gapless_sample_count_priming` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `robustness/fuzz_adts_aac_bitflip_probe` — **N/A**: engine does not declare input container 'adts'
- `platform@chrome-149` · `robustness/edge_flac_with_seektable_probe` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `mux/neg_h264_into_ogg_illegal` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `robustness/edge_rotated_remux` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/edge_cbcs_boundary_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `metadata/neg_garbled_id3_mp3_probe` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `transcode/mismatch_audio_only_to_video_target` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `robustness/prop_demux_mux_roundtrip_eq` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `transcode/mismatch_video_only_to_audio_target` — **N/A**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `robustness/prop_decode_remux_eq_decode_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/fuzz_ogg_opus_header_truncated_probe` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `encryption/cenc_ctr_protection_zeroed_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `remux/neg_zeroed_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/prop_trim_concatenation` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/robust_negative_start` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `robustness/fuzz_mp4_header_truncated_demux` — **N/A**: platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV
- `platform@chrome-149` · `demux/graceful_mp4_header_destroyed` — **N/A**: platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV
- `platform@chrome-149` · `mux/neg_h264_into_wav_illegal` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `trim/robust_zero_length_range` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `transcode/extreme_resize_1x1` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `robustness/edge_headerless_recorder_remux` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/robust_inverted_range` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/robust_truncated_source` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `robustness/fuzz_remux_zeroed_spans` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/neg_truncated_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/fuzz_flac_bitflip_probe` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `robustness/edge_fragmented_remux` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `robustness/edge_pcm_s24_decode` — **N/A**: engine does not declare output container 'wav'
- `platform@chrome-149` · `transcode/extreme_resize_0x0` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `platform@chrome-149` · `audio-dsp/fuzz_aiff_header_truncated_probe` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `robustness/prop_transcode_idempotent_dims_h264` — **N/A**: platform engine: transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_backward_then_forward` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_vfr_timing` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
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
- `remotion-media-parser@4.0.479` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_vfr_to_cfr_30` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/ladder_tiny_h264_360p_resize_180p` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_rotate_180` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `metadata/write_mp4_tags` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_flip_vertical` — **N/A**: engine does not declare operation 'transcode'
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
- `remotion-media-parser@4.0.479` · `decode-seek/seek_negative` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
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
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'mux'
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
- `remotion-media-parser@4.0.479` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
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
- `remotion-media-parser@4.0.479` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_fps_30_to_15` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_h264_keyframe` — **N/A**: engine does not declare operation 'seek'
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
- `remotion-media-parser@4.0.479` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `metadata/write_mkv_tags` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_av1_keyframe` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare operation 'transcode'
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
- `remotion-media-parser@4.0.479` · `decode-seek/decode_h264_first_frames` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/fanout_h264_abr_ladder` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
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
- `remotion-media-parser@4.0.479` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/mp3_to_opus_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `transcode/wav_to_vorbis_ogg` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_zero` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_h264_10bit` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `performance/op-sweep-transcode-webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/h264_rotate_270_dimswap` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_size_large_vp9_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_h264_nonkeyframe` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `transcode/hevc_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_pad_letterbox_4x3_to_16x9` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare operation 'transcode'
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
- `remotion-media-parser@4.0.479` · `transcode/ladder_tiny_vp9_360p_to_h264_180p` — **N/A**: engine does not declare operation 'transcode'
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
- `remotion-media-parser@4.0.479` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
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
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_rotated_display_matrix` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/hevc_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/wav_to_flac` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `probe/hls_aes128` — **N/A**: engine does not declare feature 'hls:aes128'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_size_huge_h264_600s` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
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
- `remotion-media-parser@4.0.479` · `transcode/h264_to_mov` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `transcode/wav_to_aac_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_to_fragmented_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_vfr_arbitrary` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `transcode/aac_to_mp3_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `decode-seek/seek_bframes_midgop` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `remotion-media-parser@4.0.479` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/vp9_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/extreme_fps_1` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_open_gop_first_frame` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/av1_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/h264_to_mkv` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/metamorphic_duration_preserved_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/roundtrip_leg1_h264_to_vp9` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/vp8_to_h264_mp4` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `decode-seek/decode_size_large_h264_120s` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `transcode/gapless_pcm_to_aac_priming` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/robust_start_past_eof` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `encryption/cenc_ctr_truncated_mdat_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `trim/robust_bitflipped_source` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/edge_seek_past_eof` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `encryption/cenc_ctr_senc_bitflip_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `robustness/fuzz_mux_target_corrupt_remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/edge_faststart_reserve_remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/robust_end_far_past_eof` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `remux/neg_headerless_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `audio-dsp/fuzz_wav_fmt_corrupt_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/neg_zero_tracks_empty_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `transcode/mismatch_mislabeled_container_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/negative_png_to_video` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/fuzz_mp4_zeroed_spans_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `transcode/malformed_truncated_h264_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/edge_dims_1x1_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/fuzz_wav_bitflip_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `robustness/fuzz_encrypted_mp4_ciphertext_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/neg_vp9_into_adts_illegal` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `robustness/prop_gapless_sample_count_priming` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `robustness/edge_open_gop_bframes_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `transcode/negative_webp_to_video` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `mux/neg_h264_into_ogg_illegal` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `robustness/edge_rotated_remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/edge_cbcs_boundary_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `transcode/mismatch_audio_only_to_video_target` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/prop_demux_mux_roundtrip_eq` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `transcode/mismatch_video_only_to_audio_target` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `robustness/prop_decode_remux_eq_decode_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/fuzz_ogg_opus_header_truncated_probe` — **N/A**: engine does not declare input container 'ogg'
- `remotion-media-parser@4.0.479` · `encryption/cenc_ctr_protection_zeroed_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `remux/neg_zeroed_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/prop_trim_concatenation` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/robust_negative_start` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `mux/neg_h264_into_wav_illegal` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `trim/robust_zero_length_range` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `transcode/extreme_resize_1x1` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/edge_headerless_recorder_remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `transcode/negative_jpeg_to_video` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/robust_inverted_range` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `transcode/malformed_zero_length_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `trim/robust_truncated_source` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `robustness/fuzz_remux_zeroed_spans` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/neg_truncated_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/edge_fragmented_remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `robustness/edge_pcm_s24_decode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `transcode/extreme_resize_0x0` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/fuzz_aiff_header_truncated_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `robustness/prop_transcode_idempotent_dims_h264` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `robustness/edge_seek_negative` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `transcode/video_only_h264_resize_360p_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare feature 'fastStart:none'
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
- `remotion-webcodecs@4.0.479` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
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
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare feature 'target:writes'
- `remotion-webcodecs@4.0.479` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `transcode/vp9_alpha_to_vp9_keepalpha` — **N/A**: engine does not declare feature 'alpha'
- `remotion-webcodecs@4.0.479` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `decode-seek/meta_decode_remux_eq_decode_anchored` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare feature 'remux:av1-opus-in-webm'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare feature 'headerless'
- `remotion-webcodecs@4.0.479` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `remotion-webcodecs@4.0.479` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare output container 'flac'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `remotion-webcodecs@4.0.479` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/h264_rotate_90_dimswap` — **N/A**: remotion-webcodecs@4.0.479 transcode: rotated MP4 outputs are not playback-smoke-safe in this package
- `remotion-webcodecs@4.0.479` · `transcode/h264_fps_15_to_30` — **N/A**: engine does not declare feature 'fps'
- `remotion-webcodecs@4.0.479` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare feature 'remux:mp3-in-mp4'
- `remotion-webcodecs@4.0.479` · `streaming-output/buffer_massive_h264_mp4` — **SKIPPED**: real Chromium no-reuse run on 2026-06-22 timed out after the 120s op budget while buffering the 2h massive H.264 MP4 fixture through remotion-webcodecs bufferWriter. The paired massive stream row is already NA because this adapter does not declare target:writes, so this exact buffer rung is a tracked per-engine scale limit rather than a conformance path to rerun in every full matrix.
- `remotion-webcodecs@4.0.479` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-webcodecs@4.0.479` · `transcode/h264_8bit_to_hevc_10bit` — **N/A**: engine does not declare feature 'depth:10bit-output'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/wav_to_mp3_mp4` — **N/A**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `transcode/h264_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `transcode/h264_two_pass_bitrate` — **N/A**: engine does not declare feature 'two-pass'
- `remotion-webcodecs@4.0.479` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare feature 'target:writes'
- `remotion-webcodecs@4.0.479` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'mux'
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
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `remotion-webcodecs@4.0.479` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `transcode/h264_flip_horizontal` — **N/A**: engine does not declare feature 'flip'
- `remotion-webcodecs@4.0.479` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `metadata/write_mkv_tags` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare feature 'fastStart:none'
- `remotion-webcodecs@4.0.479` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: remotion-webcodecs@4.0.479 transcode: the adapter cannot remap audio channel count (downmix/upmix)
- `remotion-webcodecs@4.0.479` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
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
- `remotion-webcodecs@4.0.479` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare feature 'rotation:decode'
- `remotion-webcodecs@4.0.479` · `transcode/opus_to_aac_mp4` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `transcode/fanout_h264_abr_ladder` — **N/A**: engine does not declare feature 'fanout'
- `remotion-webcodecs@4.0.479` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `remotion-webcodecs@4.0.479` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'mux'
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
- `remotion-webcodecs@4.0.479` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
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
- `remotion-webcodecs@4.0.479` · `transcode/h264_rotate_270_dimswap` — **N/A**: remotion-webcodecs@4.0.479 transcode: rotated MP4 outputs are not playback-smoke-safe in this package
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
- `remotion-webcodecs@4.0.479` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare output container 'mkv'
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
- `remotion-webcodecs@4.0.479` · `transcode/bframe_reorder_h264_to_h264` — **N/A**: remotion-webcodecs@4.0.479 transcode: B-frame reorder sources are not reliably re-encoded by this package
- `remotion-webcodecs@4.0.479` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare feature 'streaming:decode-equality'
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `remotion-webcodecs@4.0.479` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/h264_to_av1_mp4` — **N/A**: remotion-webcodecs@4.0.479 transcode: Remotion WebCodecs 4.0.479 exposes no AV1 encoder
- `remotion-webcodecs@4.0.479` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `transcode/flac_to_opus_webm` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `transcode/h264_fps_30_to_60` — **N/A**: engine does not declare feature 'fps'
- `remotion-webcodecs@4.0.479` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare output container 'aiff'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare feature 'target:writes'
- `remotion-webcodecs@4.0.479` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare feature 'colorspace'
- `remotion-webcodecs@4.0.479` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `transcode/hevc_to_vp8_webm` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/wav_to_flac` — **N/A**: engine does not declare output container 'flac'
- `remotion-webcodecs@4.0.479` · `probe/hls_aes128` — **N/A**: engine does not declare feature 'hls:aes128'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `decode-seek/decode_size_huge_h264_600s` — **SKIPPED**: decode of the 600s huge h264 fixture exceeds the 120s op budget: remotion-webcodecs parses via @remotion/media-parser, whose full-file scan on this 600s asset is the same slowness already tracked as disabled for remotion-media-parser demux/size_huge_huge_h264_1080p_600s. platform and mediabunny decode it within budget; ffmpeg.wasm honestly NAs it — this is a per-engine scale limit.
- `remotion-webcodecs@4.0.479` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-webcodecs@4.0.479` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/h264_crf_quality_mode` — **N/A**: engine does not declare feature 'crf'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare audio codec 'pcm-f32'
- `remotion-webcodecs@4.0.479` · `transcode/h264_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `transcode/h264_to_fragmented_mp4` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare feature 'fastStart:none'
- `remotion-webcodecs@4.0.479` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `remotion-webcodecs@4.0.479` · `transcode/aac_to_mp3_mp4` — **N/A**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `remotion-webcodecs@4.0.479` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `transcode/vp9_to_av1_webm` — **N/A**: remotion-webcodecs@4.0.479 transcode: Remotion WebCodecs 4.0.479 exposes no AV1 encoder
- `remotion-webcodecs@4.0.479` · `transcode/extreme_fps_1` — **N/A**: engine does not declare feature 'fps'
- `remotion-webcodecs@4.0.479` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `transcode/h264_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare feature 'target:writes'
- `remotion-webcodecs@4.0.479` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare feature 'target:writes'
- `remotion-webcodecs@4.0.479` · `transcode/vp8_to_h264_mp4` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `robustness/prop_decode_remux_eq_decode_webm_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `trim/robust_start_past_eof` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_ctr_truncated_mdat_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `trim/robust_bitflipped_source` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_ctr_senc_bitflip_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `robustness/edge_faststart_reserve_remux` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `remotion-webcodecs@4.0.479` · `trim/robust_end_far_past_eof` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `remux/neg_headerless_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `audio-dsp/fuzz_wav_fmt_corrupt_transcode` — **N/A**: remotion-webcodecs@4.0.479 transcode: the adapter cannot remap audio channel count (downmix/upmix)
- `remotion-webcodecs@4.0.479` · `mux/neg_zero_tracks_empty_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `robustness/fuzz_encrypted_mp4_ciphertext_decode` — **N/A**: engine does not declare encryption scheme 'cenc-ctr'
- `remotion-webcodecs@4.0.479` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: remotion-webcodecs@4.0.479 transcode: the adapter cannot remap audio channel count (downmix/upmix)
- `remotion-webcodecs@4.0.479` · `mux/neg_vp9_into_adts_illegal` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `robustness/prop_gapless_sample_count_priming` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/neg_h264_into_ogg_illegal` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `robustness/edge_rotated_remux` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `robustness/edge_cbcs_boundary_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `robustness/prop_demux_mux_roundtrip_eq` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare feature 'remux:compose'
- `remotion-webcodecs@4.0.479` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `robustness/prop_decode_remux_eq_decode_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `robustness/fuzz_ogg_opus_header_truncated_probe` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_ctr_protection_zeroed_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `remux/neg_zeroed_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `robustness/prop_trim_concatenation` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare output container 'flac'
- `remotion-webcodecs@4.0.479` · `trim/robust_negative_start` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `mux/neg_h264_into_wav_illegal` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `trim/robust_zero_length_range` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/robust_inverted_range` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/robust_truncated_source` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `robustness/fuzz_remux_zeroed_spans` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/neg_truncated_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `robustness/edge_fragmented_remux` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `robustness/edge_pcm_s24_decode` — **N/A**: browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/fuzz_aiff_header_truncated_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `transcode/video_only_h264_resize_360p_to_vp9_webm` — **N/A**: engine does not declare feature 'mediarecorder:video-only'
- `web-demuxer@4.0.0` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/h264_resize_4k_to_1080p` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/convert-longtasks` — **N/A**: engine does not declare operation 'transcode'
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
- `web-demuxer@4.0.0` · `probe/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `demux/realworld_mdn_trex_mp3` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/h264_10bit_to_h264_8bit` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/hevc_to_av1_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `probe/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `transcode/h264_vfr_to_cfr_30` — **N/A**: engine does not declare operation 'transcode'
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
- `web-demuxer@4.0.0` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare operation 'transcode'
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
- `web-demuxer@4.0.0` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `transcode/gapless_pcm_to_opus_priming` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/h264_rotate_90_dimswap` — **N/A**: engine does not declare operation 'transcode'
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
- `web-demuxer@4.0.0` · `transcode/h264_bitrate_2mbps` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/vp8_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `probe/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `probe/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `transcode/av_downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/aac_adts_adts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/write_mp3_id3` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `demux/realworld_mdn_flower_mp4` — **N/A**: engine does not declare feature 'packets:dts'
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
- `web-demuxer@4.0.0` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare operation 'remux'
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
- `web-demuxer@4.0.0` · `transcode/h264_crop_center` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `web-demuxer@4.0.0` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
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
- `web-demuxer@4.0.0` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `decode-seek/decode_rotated_display_matrix` — **N/A**: engine does not declare feature 'rotate'
- `web-demuxer@4.0.0` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/h264_colorspace_709_to_2020` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/hevc_to_vp8_webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/wav_to_flac` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `probe/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `web-demuxer@4.0.0` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare operation 'transcode'
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
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare operation 'transcode'
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
- `web-demuxer@4.0.0` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
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
- `web-demuxer@4.0.0` · `robustness/prop_trim_additivity_compose` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `robustness/edge_pcm_s16be_probe` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `encryption/cenc_ctr_truncated_mdat_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `robustness/fuzz_mp3_header_truncated_probe` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `trim/robust_bitflipped_source` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `robustness/prop_remux_duration_preserved` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `encryption/cenc_ctr_senc_bitflip_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `robustness/fuzz_ts_zeroed_spans_demux` — **N/A**: web-demuxer@4.0.0: demux not applicable: web-demuxer v4.0.0 cannot construct an AVPacketReader for MPEG-TS packet streams
- `web-demuxer@4.0.0` · `robustness/fuzz_mux_target_corrupt_remux` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `robustness/edge_faststart_reserve_remux` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `trim/robust_end_far_past_eof` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `robustness/edge_flac_without_seektable_probe` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `remux/neg_headerless_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `audio-dsp/fuzz_wav_fmt_corrupt_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/neg_zero_tracks_empty_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `transcode/mismatch_mislabeled_container_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/negative_png_to_video` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/malformed_truncated_h264_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/fuzz_wav_bitflip_decode` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `robustness/fuzz_encrypted_mp4_ciphertext_decode` — **N/A**: engine does not declare encryption scheme 'cenc-ctr'
- `web-demuxer@4.0.0` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `mux/neg_vp9_into_adts_illegal` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `robustness/edge_ts_pts_wraparound_demux` — **SKIPPED**: web-demuxer probes normal MPEG-TS correctly (probe/h264_ts PASSes) but mis-derives the video frame rate (reports 240 fps vs the golden 30) on this PTS-WRAPAROUND TS fixture: the 33-bit PTS rollover corrupts its inter-frame-interval fps estimate. The container is supported; the wraparound edge fps derivation is a tracked engine limitation, so this one cell is skipped.
- `web-demuxer@4.0.0` · `robustness/prop_gapless_sample_count_priming` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `robustness/fuzz_adts_aac_bitflip_probe` — **N/A**: engine does not declare input container 'adts'
- `web-demuxer@4.0.0` · `robustness/edge_5_1_channels_probe` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `transcode/negative_webp_to_video` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `robustness/edge_flac_with_seektable_probe` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `mux/neg_h264_into_ogg_illegal` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `robustness/edge_rotated_remux` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `robustness/edge_cbcs_boundary_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `metadata/neg_garbled_id3_mp3_probe` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `transcode/mismatch_audio_only_to_video_target` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `robustness/prop_demux_mux_roundtrip_eq` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `transcode/mismatch_video_only_to_audio_target` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `robustness/prop_double_remux_stable` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `robustness/prop_decode_remux_eq_decode_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `robustness/fuzz_ogg_opus_header_truncated_probe` — **N/A**: engine does not declare input container 'ogg'
- `web-demuxer@4.0.0` · `encryption/cenc_ctr_protection_zeroed_graceful` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `remux/neg_zeroed_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `robustness/prop_trim_concatenation` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `robustness/prop_flac_seek_seektable_equiv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `trim/robust_negative_start` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `mux/neg_h264_into_wav_illegal` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `trim/robust_zero_length_range` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `transcode/extreme_resize_1x1` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `robustness/edge_headerless_recorder_remux` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `transcode/negative_jpeg_to_video` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/robust_inverted_range` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `transcode/malformed_zero_length_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `trim/robust_truncated_source` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `robustness/fuzz_remux_zeroed_spans` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/neg_truncated_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `robustness/fuzz_flac_bitflip_probe` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `robustness/edge_fragmented_remux` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `robustness/edge_pcm_s24_decode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/extreme_resize_0x0` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/fuzz_aiff_header_truncated_probe` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `audio-dsp/fuzz_wav_header_truncated_probe` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `robustness/prop_transcode_idempotent_dims_h264` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `transcode/video_only_h264_resize_360p_to_vp9_webm` — **N/A**: engine does not declare operation 'transcode'

</details>

### 4. Benchmark matrix (full per-engine timing detail)

_Indicative for this browser only. Cells without a green conformance gate are blank (—)._

**`aibrush-media@dev`**

_No admissible benchmarks (no green conformance gate)._

**`ffmpeg.wasm@0.12.15`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | 98.7 | 98.7 | 304× | 0 B | 0 |
| `audio-dsp/gain_half_f32` | 14.1 | 14.1 | 353.48× | 0 B | 0 |
| `decode-seek/seek_backward_then_forward` | 97.6 | 97.6 | — | — | 8658 |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | 634.2 | 634.2 | — | 0 B | 408 |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | 12806.3 | 12806.3 | 2.34× | 0 B | 328 |
| `remux/hevc_1080p_10s_mp4_to_mov` | 43.5 | 43.5 | 230.02× | 0 B | 3601 |
| `transcode/h264_resize_4k_to_1080p` | 37409.9 | 37409.9 | 0.27× | 0 B | 4168 |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | 29.7 | 29.7 | 337.15× | 0 B | 10677 |
| `trim/audio_aiff_pcm_be_copy` | 6.2 | 6.2 | 811.69× | 0 B | 4168 |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | 15.6 | 15.6 | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | 25.5 | 25.5 | 196.19× | 0 B | 0 |
| `demux/hls_aes128` | 135.4 | 135.4 | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | 78.5 | 78.5 | 127.56× | 0 B | 0 |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | 180181.9 | 180181.9 | — | 0 B | — |
| `demux/mp3_cbr_notoc` | 23.8 | 23.8 | — | — | — |
| `transcode/multitrack_select_default_audio` | 11787.3 | 11787.3 | 0.85× | 0 B | 937 |
| `mux/edge_bframes_decode_mux_mkv` | 121.1 | 121.1 | — | 0 B | 3833 |
| `transcode/selfcheck_h264_resize_720p_tie` | 47635.5 | 47635.5 | — | — | — |
| `transcode/flac_to_aac_mp4` | 255.4 | 255.4 | 39.16× | 0 B | 10815 |
| `trim/huge_h264_mov_copy_peakmem` | 611 | 611 | 981.93× | 0 B | 552 |
| `audio-dsp/meta_roundtrip_endianness_s16` | 24.5 | 24.5 | — | 0 B | — |
| `trim/large_h264_copy_lazyread` | 151.8 | 151.8 | 790.75× | 0 B | 4168 |
| `probe/flac_noseektable` | 2.3 | 2.3 | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | 4 | 4 | 25.22× | 0 B | 2228 |
| `decode-seek/decode_vp8` | 319.1 | 319.1 | — | 0 B | 4340 |
| `mux/prop_vp9_decode_mux_webm_to_webm` | 99 | 99 | — | 0 B | 552 |
| `audio-dsp/resample_48k_to_44k1` | 30 | 30 | 166.89× | 0 B | 4453 |
| `demux/realworld_mdn_trex_mp3` | 10.5 | 10.5 | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | 12.9 | 12.9 | — | — | — |
| `probe/h264_4k_10s` | 64.6 | 64.6 | — | — | — |
| `mux/video_plus_audio_to_mp4` | 181.7 | 181.7 | 165.08× | 0 B | 0 |
| `transcode/h264_10bit_to_h264_8bit` | 11629 | 11629 | 0.43× | 0 B | 2228 |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | 20.6 | 20.6 | 242.78× | 0 B | 3601 |
| `performance/size-ladder-iterate-packets-medium` | 74.5 | 74.5 | 402.87× | — | — |
| `probe/wav_s16` | 10.8 | 10.8 | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | 7905.9 | 7905.9 | 1.59× | 0 B | 0 |
| `remux/vp9_1080p_10s_webm_to_mp4` | 65.1 | 65.1 | 153.79× | 0 B | 8658 |
| `audio-dsp/pcm_s24_to_s16` | 12.5 | 12.5 | 398.72× | 21.77 MiB | 0 |
| `transcode/ladder_tiny_h264_360p_resize_180p` | 308.2 | 308.2 | — | 0 B | — |
| `probe/perf-extract-metadata-huge` | 644.5 | 644.5 | — | — | — |
| `transcode/h264_rotate_180` | 70976.4 | 70976.4 | 0.42× | 0 B | 3833 |
| `remux/h264_1080p_30s_mp4_to_mkv` | 162.6 | 162.6 | 184.51× | 0 B | 10677 |
| `mux/pcm_s24_to_wav` | 14.2 | 14.2 | 353.23× | 0 B | 552 |
| `metadata/write_mp4_tags` | 111.7 | 111.7 | — | — | — |
| `transcode/h264_flip_vertical` | 71935.3 | 71935.3 | 0.42× | 0 B | 0 |
| `remux/prop_bframes_decode_remux_mp4_mov` | 188.5 | 188.5 | — | 0 B | 11948 |
| `trim/audio_flac_seektable_copy` | 8.7 | 8.7 | 1155.4× | 0 B | 4168 |
| `remux/av1_720p_5s_webm_to_mkv` | 22.1 | 22.1 | 226.81× | 0 B | 11948 |
| `probe/vp8_720p_10s` | 7.7 | 7.7 | — | — | — |
| `demux/h264_in_mkv` | 41.4 | 41.4 | — | — | — |
| `demux/wav_s16` | 19 | 19 | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | 33 | 33 | — | — | — |
| `probe/recorder_headerless` | 2.8 | 2.8 | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | 248.3 | 248.3 | — | 0 B | 1259 |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | 32.4 | 32.4 | 154.34× | 0 B | 11948 |
| `probe/flac_seektable` | 2.4 | 2.4 | — | — | — |
| `metadata/write_ogg_vorbiscomment` | 7.2 | 7.2 | — | — | — |
| `probe/large_h264_1080p_120s` | 125.4 | 125.4 | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | 4.4 | 4.4 | 2247.19× | 0 B | 0 |
| `audio-dsp/downmix_5_1_to_stereo` | 52.4 | 52.4 | 190.99× | 0 B | 8658 |
| `demux/size_micro_micro_h264_1frame` | 5.8 | 5.8 | — | — | — |
| `mux/vorbis_to_ogg` | 32 | 32 | 313.03× | 0 B | 11948 |
| `remux/opus_ogg_to_webm` | 5.9 | 5.9 | 1710.6× | 0 B | 0 |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | 3.5 | 3.5 | — | — | — |
| `transcode/h264_resize_720p` | 47941.8 | 47941.8 | 0.63× | 0 B | 0 |
| `decode-seek/meta_seek_vs_linear_decode` | 90.6 | 90.6 | — | 65.94 MiB | 3833 |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | 26.3 | 26.3 | — | 0 B | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | 180.3 | 180.3 | — | 0 B | 1103 |
| `mux/swap_audio_video_with_opus_to_mkv` | 359.5 | 359.5 | 83.45× | 0 B | 10815 |
| `probe/mp3_xing` | 2.6 | 2.6 | — | — | — |
| `probe/vp9_1080p_10s` | 32.9 | 32.9 | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | 6.9 | 6.9 | — | — | — |
| `probe/aac_adts` | 3.8 | 3.8 | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | 24386.3 | 24386.3 | 0.41× | 0 B | 0 |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | 131.5 | 131.5 | — | 0 B | 5497 |
| `trim/vp9_noop_full_range_idempotent` | 68.2 | 68.2 | 146.7× | 0 B | 4453 |
| `decode-seek/seek_negative` | 84.1 | 84.1 | — | — | 3601 |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | 791.3 | 791.3 | — | 0 B | 9154 |
| `demux/hls_vod` | 49.5 | 49.5 | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | 43.4 | 43.4 | 115.33× | 0 B | 3601 |
| `audio-dsp/resample_44k1_to_48k` | 43.8 | 43.8 | 228.28× | 27.45 MiB | 0 |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | 33.1 | 33.1 | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | 71.9 | 71.9 | 417.39× | 0 B | 1259 |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | 20.6 | 20.6 | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | 65.2 | 65.2 | 153.78× | 0 B | 6073 |
| `mux/edge_rotation_decode_mux_mov` | 50.5 | 50.5 | — | 45.8 MiB | 328 |
| `trim/h264_multitrack_keyframe_aligned` | 72.2 | 72.2 | 138.44× | 0 B | 12973 |
| `demux/size_tiny_tiny_vp9_360p_2s` | 7.1 | 7.1 | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | 5.4 | 5.4 | — | 0 B | 3601 |
| `probe/h264_in_mkv` | 34.1 | 34.1 | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | 11.7 | 11.7 | 858.97× | 0 B | 1259 |
| `transcode/h264_rotate_90_dimswap` | 71292.1 | 71292.1 | 0.42× | 0 B | 2228 |
| `transcode/h264_fps_15_to_30` | 7895.4 | 7895.4 | 1.59× | 0 B | 328 |
| `performance/size-ladder-demux-peak-memory-huge` | 1024.7 | 1024.7 | — | 0 B | — |
| `probe/massive_h264_1080p_2h` | 2414.6 | 2414.6 | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | 6.7 | 6.7 | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | 278.4 | 278.4 | — | 0 B | — |
| `transcode/h264_rotate_normalize` | 11358.5 | 11358.5 | 0.88× | 0 B | 4168 |
| `remux/prop_mp3_to_mp4_duration_invariant` | 15.2 | 15.2 | — | 0 B | 11948 |
| `streaming-output/buffer_massive_h264_mp4` | 6482.2 | 6482.2 | 1110.73× | 0 B | 330 |
| `mux/aac_to_adts` | 14.5 | 14.5 | 693.71× | 0 B | 9154 |
| `metadata/read_no_tags_wav` | 9.9 | 9.9 | — | — | — |
| `transcode/h264_to_hevc_mp4` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | 12.9 | 12.9 | 776.03× | 0 B | 2228 |
| `remux/h264_bframes_1080p_mp4_to_mkv` | 73.1 | 73.1 | 136.83× | 0 B | 3833 |
| `transcode/hevc_to_vp9_webm` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | 23.3 | 23.3 | — | 0 B | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | 69394.2 | 69394.2 | 0.43× | 0 B | 552 |
| `streaming-output/mp4_fragmented_cmaf` | 112.6 | 112.6 | 266.37× | 0 B | 3601 |
| `audio-dsp/pcm_s16be_to_s16le` | 12.8 | 12.8 | 390.47× | 25.07 MiB | 4587 |
| `mux/opus_to_webm_audio` | 10.8 | 10.8 | 923.15× | 0 B | 552 |
| `transcode/wav_to_mp3_mp4` | 65.1 | 65.1 | 76.85× | 0 B | 3601 |
| `remux/h264_1080p_5s_mov_to_ts` | 39.3 | 39.3 | 127.26× | 0 B | 5497 |
| `transcode/h264_to_vp8_webm` | 1333.2 | 1333.2 | 1.5× | 0 B | 2703 |
| `decode-seek/decode_tiny_dims_2x2_h264` | 5.4 | 5.4 | — | 19.61 MiB | 0 |
| `transcode/h264_two_pass_bitrate` | 80676 | 80676 | 0.37× | 0 B | 4340 |
| `decode-seek/decode_hevc` | 1019.6 | 1019.6 | — | 0 B | 10677 |
| `probe/huge_vp9_1080p_240s` | 298.5 | 298.5 | — | — | — |
| `mux/pcm_f32_to_wav` | 14.3 | 14.3 | 349.9× | 0 B | 0 |
| `performance/op-sweep-probe` | 49.9 | 49.9 | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | 257.6 | 257.6 | — | — | 1103 |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | 58104 | 58104 | 0.52× | 0 B | 937 |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | 4.8 | 4.8 | — | — | — |
| `encryption/hls_aes128_decrypt` | 111.3 | 111.3 | 89.85× | 0 B | 0 |
| `audio-dsp/throughput_decode_s16be` | 29.7 | 29.7 | — | 0 B | — |
| `demux/hevc_1080p_10s` | 43.2 | 43.2 | — | — | — |
| `mux/audio_only_aac_to_mp4` | 7.7 | 7.7 | 1295.99× | 0 B | 3601 |
| `trim/audio_opus_ogg_copy` | 5.6 | 5.6 | 1790.16× | 20.83 MiB | 0 |
| `trim/h264_open_gop_frame_accurate` | 8566 | 8566 | 1.17× | 0 B | 10677 |
| `mux/mp4_progressive_buffer` | 167.5 | 167.5 | 179.13× | 0 B | 5497 |
| `trim/h264_single_gop_frame_accurate` | 1274.8 | 1274.8 | 23.53× | 0 B | 5497 |
| `metadata/tracks_attribution_multitrack` | 17.9 | 17.9 | — | — | — |
| `probe/wav_f32` | 6.5 | 6.5 | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | 81680.4 | 81680.4 | 0.37× | 0 B | 11514 |
| `demux/h264_1080p_5s` | 29.8 | 29.8 | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | 6.6 | 6.6 | 1519.85× | 0 B | 3601 |
| `metadata/read_h264_1080p_30s` | 51.5 | 51.5 | — | — | — |
| `decode-seek/decode_mov_h264` | 1475.7 | 1475.7 | — | 0 B | 3833 |
| `metadata/write_mp3_id3` | 4.8 | 4.8 | — | — | — |
| `demux/realworld_mdn_flower_mp4` | 17 | 17 | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | 41.5 | 41.5 | 120.38× | 41.53 MiB | 11514 |
| `metadata/meta_consistent_mp4_to_mkv` | 135.8 | 135.8 | — | 0 B | 4587 |
| `transcode/h264_fps_30_to_15` | 38756.8 | 38756.8 | 0.77× | 0 B | 3601 |
| `demux/size_massive_massive_h264_1080p_2h` | 4808.6 | 4808.6 | — | 0 B | 6073 |
| `decode-seek/seek_h264_keyframe` | 86.6 | 86.6 | — | — | 328 |
| `mux/mp4_fragmented_cmaf` | 178.7 | 178.7 | 167.93× | 0 B | 4168 |
| `audio-dsp/fade_in_out_f32` | 12 | 12 | 416.32× | 25.05 MiB | 4453 |
| `mux/video_a_plus_audio_b_to_mkv` | 218.4 | 218.4 | 137.35× | 0 B | 3601 |
| `demux/mp3_xing` | 4.7 | 4.7 | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | 14 | 14 | 358.17× | 0 B | 5497 |
| `mux/size_large_1080p_to_mkv` | 632.7 | 632.7 | 189.68× | 0 B | 11948 |
| `mux/h264_aac_to_mkv` | 210.6 | 210.6 | 142.47× | 0 B | 3601 |
| `mux/drop_audio_track_subset_to_mp4` | 74.3 | 74.3 | 134.57× | 0 B | 11948 |
| `remux/h264_ts_ts_to_mov` | 79 | 79 | 126.81× | 41.51 MiB | 0 |
| `streaming-output/prop_probe_dur_fragmented_shape` | 107.5 | 107.5 | — | 0 B | 2921 |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | 3.7 | 3.7 | — | — | — |
| `probe/perf-extract-metadata-large` | 120.3 | 120.3 | — | — | — |
| `performance/size-ladder-iterate-packets-large` | 191.4 | 191.4 | 626.98× | — | — |
| `remux/mp3_xing_mp3_to_mkv` | 5.7 | 5.7 | 1757.47× | 19.31 MiB | 0 |
| `transcode/h264_flip_horizontal` | 71649 | 71649 | 0.42× | 0 B | 1259 |
| `remux/prop_ts_to_mp4_duration_materialized` | 79.7 | 79.7 | — | 0 B | 937 |
| `encryption/unencrypted_left_untouched_noop` | 104.7 | 104.7 | — | 0 B | 1103 |
| `metadata/write_mkv_tags` | 73.1 | 73.1 | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `decode-seek/seek_av1_keyframe` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | 66.2 | 66.2 | 151.14× | 0 B | 0 |
| `streaming-output/mp4_buffer_target` | 106.5 | 106.5 | 281.72× | 0 B | 8658 |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | 50.7 | 50.7 | — | 0 B | 11514 |
| `probe/tiny_h264_360p_2s` | 6.1 | 6.1 | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | 7.6 | 7.6 | 1326.85× | 0 B | 552 |
| `performance/op-sweep-demux` | 70.2 | 70.2 | 427.26× | — | — |
| `performance/seek-ms` | 85.2 | 85.2 | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | 5 | 5 | 2002× | 0 B | 552 |
| `metadata/write_flac_vorbiscomment` | 20.1 | 20.1 | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | 106.6 | 106.6 | — | 0 B | 4340 |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | 3 | 3 | — | — | — |
| `trim/h264_to_eof_copy` | 64.1 | 64.1 | 467.95× | 0 B | 4168 |
| `remux/h264_rotated90_mp4_to_mov` | 31.4 | 31.4 | 318.32× | 0 B | 2228 |
| `remux/hevc_1080p_10s_mp4_to_mkv` | 55.2 | 55.2 | 181.19× | 0 B | 3601 |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | 1168.3 | 1168.3 | 513.57× | 0 B | 0 |
| `metadata/rotation_survives_mp4_mkv` | 77.7 | 77.7 | — | 0 B | 10815 |
| `demux/h264_vfr` | 23.8 | 23.8 | — | — | — |
| `probe/h264_1080p_5s` | 20.5 | 20.5 | — | — | — |
| `probe/hevc_1080p_10s` | 23.4 | 23.4 | — | — | — |
| `decode-seek/decode_multitrack_select_video` | 352.7 | 352.7 | — | 0 B | 552 |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | 228.8 | 228.8 | 43.73× | 0 B | 3833 |
| `demux/h264_rotated90` | 32.4 | 32.4 | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | 37.9 | 37.9 | — | 0 B | 0 |
| `transcode/mp3_to_aac_mp4` | 258.2 | 258.2 | 38.73× | 0 B | 1259 |
| `decode-seek/decode_h264_first_frames` | 1595.2 | 1595.2 | — | 0 B | 5497 |
| `performance/metamorphic-vfr-iterate-packets` | 21 | 21 | 596.67× | — | — |
| `probe/h264_vfr` | 17.1 | 17.1 | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | 69.9 | 69.9 | 143.43× | 0 B | 0 |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | 136 | 136 | 220.63× | — | — |
| `decode-seek/seek_past_eof` | 478.5 | 478.5 | — | — | 4453 |
| `streaming-output/mp4_faststart_in_memory` | 103.9 | 103.9 | 288.77× | 0 B | 0 |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | 3.8 | 3.8 | — | 0 B | 0 |
| `demux/size_huge_huge_h264_1080p_600s` | 952.4 | 952.4 | — | 0 B | 0 |
| `demux/flac_seektable` | 3 | 3 | — | — | — |
| `decode-seek/decode_bframes_reorder` | 1626.4 | 1626.4 | — | 0 B | 2228 |
| `demux/size_tiny_tiny_h264_360p_2s` | 7.4 | 7.4 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | 177.1 | 177.1 | — | 0 B | 5497 |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | 85.3 | 85.3 | — | 0 B | 0 |
| `mux/edge_multitrack_keep_all_to_mp4` | 87.6 | 87.6 | 114.21× | 0 B | 10815 |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | 2.6 | 2.6 | — | — | — |
| `transcode/h264_crop_center` | 52281.7 | 52281.7 | 0.57× | 0 B | 0 |
| `decode-seek/seek_vp8_keyframe` | 24.1 | 24.1 | — | — | 8531 |
| `trim/h264_keyframe_aligned` | 88.6 | 88.6 | 338.54× | 0 B | 328 |
| `trim/audio_flac_noseektable_copy` | 7.5 | 7.5 | 1332.45× | 36.77 MiB | 8658 |
| `performance/size-ladder-iterate-packets-massive` | 5133.2 | 5133.2 | 1402.64× | — | — |
| `probe/opus` | 2.6 | 2.6 | — | — | — |
| `trim/hevc_keyframe_aligned` | 46 | 46 | 217.25× | 0 B | 5497 |
| `decode-seek/seek_hevc_keyframe` | 63 | 63 | — | — | 937 |
| `streaming-output/prop_decode_equals_buffer_shape` | 94.2 | 94.2 | — | 0 B | 5497 |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | 47.5 | 47.5 | — | 0 B | 9154 |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | 20 | 20 | 501.05× | 31.16 MiB | 408 |
| `mux/three_track_assembly_to_mkv` | 214.6 | 214.6 | 139.79× | 0 B | 3601 |
| `decode-seek/decode_av1` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | 957.7 | 957.7 | 626.51× | — | — |
| `trim/h264_start_zero_copy` | 79.9 | 79.9 | 375.35× | 0 B | 2703 |
| `transcode/hdr10_to_sdr_tonemap` | 38.1 | 38.1 | 52.51× | 0 B | 0 |
| `probe/cenc_cbcs` | 11.8 | 11.8 | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | 96.2 | 96.2 | — | 0 B | 3601 |
| `decode-seek/seek_repeated_same_target` | 82.8 | 82.8 | — | — | 5497 |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | 5160 | 5160 | 1395.34× | 0 B | 2921 |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | 2.9 | 2.9 | — | — | — |
| `audio-dsp/throughput_decode_s24` | 38.3 | 38.3 | — | 0 B | — |
| `remux/flac_seektable_flac_to_mkv` | 5.5 | 5.5 | 1818.18× | 0 B | 0 |
| `trim/h264_bframes_frame_accurate` | 6792.5 | 6792.5 | 1.47× | 0 B | 9154 |
| `probe/big_buck_bunny_1080p_h264` | 924.6 | 924.6 | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | 20195.1 | 20195.1 | 5.94× | 0 B | 4168 |
| `transcode/wav_to_vorbis_ogg` | 56.5 | 56.5 | 88.5× | 23.3 MiB | 5497 |
| `remux/prop_multitrack_survives_mp4_mkv` | 112.8 | 112.8 | — | 0 B | 12973 |
| `decode-seek/seek_zero` | 83 | 83 | — | — | 6073 |
| `performance/size-ladder-iterate-packets-tiny` | 16.5 | 16.5 | 121.18× | — | — |
| `decode-seek/decode_h264_10bit` | 1053.5 | 1053.5 | — | 0 B | 937 |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | 368.9 | 368.9 | 325.26× | 0 B | 3601 |
| `demux/realworld_mdn_flower_webm` | 6.2 | 6.2 | — | — | — |
| `mux/h264_aac_to_mov` | 198.2 | 198.2 | 151.36× | 0 B | 937 |
| `remux/h264_ts_ts_to_mp4` | 81.5 | 81.5 | 122.99× | 0 B | 0 |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | 5.3 | 5.3 | 1901.14× | 0 B | 5497 |
| `performance/size-ladder-extract-metadata-huge` | 868.7 | 868.7 | — | — | — |
| `transcode/h264_rotate_270_dimswap` | 10708.6 | 10708.6 | 0.93× | 0 B | 328 |
| `trim/ts_keyframe_aligned` | 76.6 | 76.6 | 130.74× | 0 B | 3833 |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | 80.7 | 80.7 | — | 0 B | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | 476.5 | 476.5 | 251.84× | 0 B | 0 |
| `mux/h264_aac_to_mp4` | 173.3 | 173.3 | 173.09× | 0 B | 0 |
| `audio-dsp/meta_idempotent_resample_same_rate` | 24.7 | 24.7 | — | 0 B | — |
| `trim/mkv_keyframe_aligned` | 72.1 | 72.1 | 139× | 0 B | 4168 |
| `demux/size_large_large_vp9_1080p_120s` | 272.6 | 272.6 | — | 0 B | 11948 |
| `audio-dsp/edge_longform_audio_resample_16k` | 3850.4 | 3850.4 | — | 0 B | 1259 |
| `decode-seek/decode_size_large_vp9_120s` | 1755.3 | 1755.3 | — | 0 B | 3601 |
| `decode-seek/seek_h264_nonkeyframe` | 431.2 | 431.2 | — | — | 10815 |
| `transcode/hevc_to_h264_mp4` | 24967.2 | 24967.2 | 0.4× | 0 B | 1259 |
| `probe/longform_1h_audio` | 49.9 | 49.9 | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | 72234.2 | 72234.2 | 0.42× | 0 B | 2703 |
| `demux/size_large_large_h264_1080p_120s` | 217.9 | 217.9 | — | 0 B | 8531 |
| `remux/h264_multitrack_mp4_to_mkv` | 35.8 | 35.8 | 279.1× | 0 B | 937 |
| `audio-dsp/throughput_encode_s16be` | 19.4 | 19.4 | — | 0 B | — |
| `remux/prop_recorder_headerless_duration_materialized` | 16.5 | 16.5 | — | 0 B | 11514 |
| `probe/tiny_vp9_360p_2s` | 5.4 | 5.4 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | 201.6 | 201.6 | — | 0 B | 0 |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | 3408.4 | 3408.4 | — | 0 B | 2703 |
| `demux/h264_ts` | 49.1 | 49.1 | — | — | — |
| `probe/realworld_mdn_flower_mp4` | 17.2 | 17.2 | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | 5.4 | 5.4 | — | — | — |
| `probe/av1_720p_5s` | 10.2 | 10.2 | — | — | — |
| `demux/wav_s24` | 17.5 | 17.5 | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | 77.7 | 77.7 | — | 0 B | 11514 |
| `metadata/read_no_tags_recorder_webm` | 5.5 | 5.5 | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | 118.7 | 118.7 | 252.84× | 0 B | 4168 |
| `demux/empty_audio_zero_packets` | 1.8 | 1.8 | — | — | — |
| `transcode/vp9_to_vp8_webm` | 42710.4 | 42710.4 | 0.23× | 0 B | 3833 |
| `streaming-output/mp4_faststart_reserve` | 105.4 | 105.4 | 284.7× | 0 B | 0 |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | 103.8 | 103.8 | — | 0 B | 4168 |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | 146.4 | 146.4 | 204.97× | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | 2102.8 | 2102.8 | — | 0 B | 12973 |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | 582.2 | 582.2 | — | — | 2703 |
| `metadata/read_flac_seektable` | 2.1 | 2.1 | — | — | — |
| `probe/metamorphic-duration-across-containers` | 83.9 | 83.9 | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | 40 | 40 | 250.06× | 0 B | 3836 |
| `mux/flac_to_mkv_audio` | 21 | 21 | 475.17× | 0 B | 11514 |
| `probe/micro_audio_short` | 2.3 | 2.3 | — | — | — |
| `transcode/vp9_to_h264_mp4` | 24430.8 | 24430.8 | 0.41× | 0 B | 552 |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | 375.6 | 375.6 | — | 0 B | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | 50.8 | 50.8 | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | 27.5 | 27.5 | 182.08× | 0 B | 9154 |
| `audio-dsp/pcm_s24be_to_s16le` | 10.2 | 10.2 | 490.92× | 0 B | 2703 |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | 8.5 | 8.5 | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | 36.8 | 36.8 | — | 0 B | 4587 |
| `probe/empty-audio-wav` | 2.8 | 2.8 | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | 23409.7 | 23409.7 | 0.43× | 0 B | 3833 |
| `demux/aac_adts` | 6.6 | 6.6 | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | 156.5 | 156.5 | — | 0 B | 3833 |
| `audio-dsp/edge_longform_audio_probe` | 436.2 | 436.2 | — | 0 B | 3833 |
| `decode-seek/decode_size_micro_h264_1frame` | 14.2 | 14.2 | — | 0 B | 8658 |
| `mux/size_micro_1frame_to_mp4` | 7.9 | 7.9 | 126.5× | 0 B | 0 |
| `mux/edge_rotation_decode_mux_mkv` | 52.4 | 52.4 | — | 29.8 MiB | 5497 |
| `metadata/read_h264_in_mkv` | 35.3 | 35.3 | — | — | — |
| `performance/extract-metadata` | 47.1 | 47.1 | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | 105.4 | 105.4 | — | 0 B | 0 |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | 22.3 | 22.3 | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | 1486.6 | 1486.6 | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | 89 | 89 | — | 0 B | 2703 |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | 6.8 | 6.8 | — | — | — |
| `probe/h264_1080p_30s` | 58.2 | 58.2 | — | — | — |
| `probe/cenc_ctr` | 9.9 | 9.9 | — | — | — |
| `probe/h264_ts` | 43.7 | 43.7 | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | 43.6 | 43.6 | — | 0 B | 0 |
| `remux/h264_in_mkv_mkv_to_mp4` | 85.9 | 85.9 | 116.66× | 0 B | 11514 |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | 81.2 | 81.2 | 123.43× | 0 B | 3601 |
| `demux/h264_multitrack` | 32.3 | 32.3 | — | — | — |
| `transcode/h264_fps_30_to_60` | 98440.4 | 98440.4 | 0.3× | 0 B | 9154 |
| `trim/mov_keyframe_aligned` | 44.8 | 44.8 | 111.61× | 0 B | 9154 |
| `remux/vp8_720p_10s_webm_to_mkv` | 12.2 | 12.2 | 820.59× | 0 B | 408 |
| `demux/h264_1080p_30s` | 73.3 | 73.3 | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | 20.4 | 20.4 | 244.56× | 21.77 MiB | 0 |
| `demux/vp9_alpha` | 16.6 | 16.6 | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | 359.1 | 359.1 | — | 0 B | 3836 |
| `probe/perf-extract-metadata-massive` | 2716.7 | 2716.7 | — | — | — |
| `mux/mp3_to_mp4_audio` | 7.3 | 7.3 | 1363.33× | 21.47 MiB | 4453 |
| `mux/mp3_to_mp3` | 18.7 | 18.7 | 533.76× | 0 B | 0 |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | 227.2 | 227.2 | 132.04× | 0 B | 2228 |
| `transcode/h264_colorspace_709_to_2020` | 88044.9 | 88044.9 | 0.34× | 0 B | 937 |
| `remux/prop_roundtrip_mp4_mkv_mp4` | 145.4 | 145.4 | — | 0 B | 552 |
| `transcode/hevc_to_vp8_webm` | 48190.4 | 48190.4 | 0.21× | 0 B | 11948 |
| `mux/size_micro_1frame_to_mkv` | 8.6 | 8.6 | 116.69× | 0 B | 5497 |
| `transcode/wav_to_flac` | 25.8 | 25.8 | 193.87× | 0 B | 937 |
| `probe/large_vp9_1080p_120s` | 154.7 | 154.7 | — | — | — |
| `probe/hls_aes128` | 43.5 | 43.5 | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | 175.1 | 175.1 | 171.29× | 0 B | 11948 |
| `mux/size_longform_audio_to_mp4` | 494.3 | 494.3 | 7282.36× | 0 B | 8531 |
| `decode-seek/decode_size_huge_h264_600s` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | 28.5 | 28.5 | 175.5× | 0 B | 552 |
| `remux/opus_ogg_to_mkv` | 6.1 | 6.1 | 1631.13× | 0 B | 552 |
| `encryption/perf_cenc_ctr_decrypt_throughput` | 24.5 | 24.5 | 204.73× | 0 B | 0 |
| `mux/pcm_s16_to_wav` | 28.8 | 28.8 | 173.64× | 0 B | 3601 |
| `metadata/read_opus` | 2.6 | 2.6 | — | — | — |
| `performance/size-ladder-extract-metadata-large` | 134.6 | 134.6 | — | — | — |
| `decode-seek/decode_mkv_h264` | 726.7 | 726.7 | — | 0 B | 4168 |
| `demux/vp8_720p_10s` | 9.7 | 9.7 | — | — | — |
| `trim/audio_aac_adts_copy` | 6.2 | 6.2 | 1629.73× | 0 B | 6073 |
| `mux/size_large_1080p_to_mp4` | 462.1 | 462.1 | 259.66× | 0 B | 0 |
| `audio-dsp/pcm_f32_to_s16` | 15.3 | 15.3 | 327.12× | 0 B | 3601 |
| `mux/size_tiny_360p_to_mp4` | 15.3 | 15.3 | 131.1× | 0 B | 0 |
| `decode-seek/decode_extreme_fps_240` | 209.5 | 209.5 | — | 0 B | 4453 |
| `transcode/h264_crf_quality_mode` | 62718.5 | 62718.5 | 0.48× | 0 B | 4453 |
| `encryption/cenc_ctr_decrypt` | 43.9 | 43.9 | 114.28× | 0 B | 0 |
| `audio-dsp/pcm_s16_to_f32` | 40.1 | 40.1 | 124.72× | 0 B | 11514 |
| `transcode/h264_to_mov` | 69557.5 | 69557.5 | 0.43× | 0 B | 3833 |
| `metadata/read_vp9_1080p_10s` | 35.8 | 35.8 | — | — | — |
| `probe/huge_h264_1080p_600s` | 577 | 577 | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | 61.9 | 61.9 | — | 0 B | 4168 |
| `audio-dsp/aiff_container_probe` | 3.5 | 3.5 | — | — | — |
| `transcode/wav_to_aac_mp4` | 175.1 | 175.1 | 28.56× | 0 B | 11948 |
| `demux/flac_noseektable` | 3.2 | 3.2 | — | — | — |
| `probe/realworld_mdn_trex_mp3` | 2.5 | 2.5 | — | — | — |
| `transcode/h264_to_fragmented_mp4` | 69337.4 | 69337.4 | 0.43× | 0 B | 4587 |
| `probe/h264_multitrack` | 15.7 | 15.7 | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | 75.3 | 75.3 | 132.79× | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | 141.5 | 141.5 | — | 0 B | 11948 |
| `streaming-output/prop_probe_dur_buffer_shape` | 191.7 | 191.7 | — | 0 B | 11948 |
| `encryption/hls_aes128_decrypt_eq_cleartext` | 100.8 | 100.8 | — | 0 B | 3833 |
| `trim/h264_keyframe_aligned_short` | 66.2 | 66.2 | 453.27× | 0 B | 11514 |
| `streaming-output/prop_faststart_reserve_duration_invariant` | 120.8 | 120.8 | — | 185.86 MiB | 9154 |
| `decode-seek/seek_vfr_arbitrary` | 248.9 | 248.9 | — | — | 0 |
| `transcode/aac_to_mp3_mp4` | 108.8 | 108.8 | 92.22× | 0 B | 4587 |
| `decode-seek/seek_bframes_midgop` | 843 | 843 | — | — | 9154 |
| `remux/vp9_1080p_10s_webm_to_webm` | 61.8 | 61.8 | 161.99× | 0 B | 552 |
| `demux/h264_4k_10s` | 72.6 | 72.6 | — | — | — |
| `probe/hls_vod` | 47 | 47 | — | — | — |
| `metadata/read_pcm_s16be` | 5 | 5 | — | — | — |
| `audio-dsp/caf_container_probe` | 14.3 | 14.3 | — | — | — |
| `probe/pcm_s16be` | 3.4 | 3.4 | — | — | — |
| `demux/h264_bframes_1080p` | 43 | 43 | — | — | — |
| `mux/vp9_opus_to_webm` | 100.4 | 100.4 | 99.66× | 0 B | 3601 |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | 133.5 | 133.5 | — | — | — |
| `transcode/extreme_fps_1` | 8772 | 8772 | 3.42× | 0 B | 552 |
| `performance/iterate-video-packets` | 78.6 | 78.6 | — | — | — |
| `trim/h264_vfr_frame_accurate` | 2193.5 | 2193.5 | 5.71× | 0 B | 12973 |
| `decode-seek/decode_open_gop_first_frame` | 451 | 451 | — | 0 B | 328 |
| `remux/prop_adts_to_mp4_duration_invariant` | 5.5 | 5.5 | — | 0 B | 0 |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | 1048.4 | 1048.4 | — | — | — |
| `metadata/read_mp3_xing` | 2.2 | 2.2 | — | — | — |
| `demux/vp9_1080p_10s` | 43.5 | 43.5 | — | — | — |
| `trim/h264_noop_full_range_idempotent` | 122.8 | 122.8 | 244.2× | 0 B | 0 |
| `mux/edge_bframes_decode_mux_mp4` | 163.9 | 163.9 | — | 0 B | 5497 |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | 7 | 7 | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | 1348.8 | 1348.8 | 22.24× | 0 B | 0 |
| `demux/av1_720p_5s` | 11.8 | 11.8 | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | 11545 | 11545 | 0.87× | 0 B | 408 |
| `mux/vp9_video_plus_opus_audio_to_webm` | 111.6 | 111.6 | 89.71× | 0 B | 3833 |
| `decode-seek/decode_size_large_h264_120s` | 1649.2 | 1649.2 | — | 0 B | 10107 |
| `transcode/gapless_pcm_to_aac_priming` | 173.2 | 173.2 | — | 21.99 MiB | 552 |
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
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | — | — | — | — | — |

**`mediabunny@1.48.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | 282 | 282 | 106.38× | 0 B | 379 |
| `audio-dsp/gain_half_f32` | 24.5 | 24.5 | 204.33× | 0 B | 624 |
| `decode-seek/seek_backward_then_forward` | 27.7 | 27.7 | — | — | 511 |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | 535.3 | 535.3 | — | 0 B | 379 |
| `mux/prop_av1_mux_duration_webm_to_mp4` | 16.4 | 16.4 | — | 39.56 MiB | 0 |
| `trim/h264_frame_accurate` | 648.7 | 648.7 | 46.24× | 0 B | 379 |
| `remux/hevc_1080p_10s_mp4_to_mov` | 95.7 | 95.7 | 104.47× | 0 B | 511 |
| `transcode/h264_resize_4k_to_1080p` | 983.8 | 983.8 | 10.17× | 0 B | 511 |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | 3481.2 | 3481.2 | — | — | 1259 |
| `audio-dsp/upmix_mono_to_stereo` | 52 | 52 | 192.2× | 25.59 MiB | 0 |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | 7923.6 | 7923.6 | — | 0 B | — |
| `probe/h264_rotated90` | 1.6 | 1.6 | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | 32.6 | 32.6 | 153.33× | 0 B | 11514 |
| `demux/hls_aes128` | 111.3 | 111.3 | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | 19.5 | 19.5 | 513.1× | 46.82 MiB | 1259 |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | 13677.5 | 13677.5 | — | 0 B | — |
| `demux/mp3_cbr_notoc` | 4.8 | 4.8 | — | — | — |
| `transcode/multitrack_select_default_audio` | 674.8 | 674.8 | 14.82× | 0 B | 937 |
| `mux/edge_bframes_decode_mux_mkv` | 20.5 | 20.5 | — | 0 B | 624 |
| `transcode/selfcheck_h264_resize_720p_tie` | 2871.3 | 2871.3 | — | — | — |
| `transcode/flac_to_aac_mp4` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | 654.9 | 654.9 | 916.18× | 0 B | 0 |
| `audio-dsp/meta_roundtrip_endianness_s16` | 4.7 | 4.7 | — | 0 B | — |
| `trim/large_h264_copy_lazyread` | 674.2 | 674.2 | 178× | 0 B | 2228 |
| `probe/flac_noseektable` | 1.5 | 1.5 | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | 5.3 | 5.3 | 18.83× | 0 B | 624 |
| `decode-seek/decode_vp8` | 302.5 | 302.5 | — | 0 B | 8531 |
| `mux/prop_vp9_decode_mux_webm_to_webm` | 22.7 | 22.7 | — | 0 B | 379 |
| `audio-dsp/resample_48k_to_44k1` | 36.2 | 36.2 | 138.31× | 0 B | 511 |
| `demux/realworld_mdn_trex_mp3` | 1.9 | 1.9 | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | 1.8 | 1.8 | — | — | — |
| `probe/h264_4k_10s` | 2.3 | 2.3 | — | — | — |
| `mux/video_plus_audio_to_mp4` | 45.9 | 45.9 | 653.81× | 55.64 MiB | 0 |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | 2293.1 | 2293.1 | 4.36× | 0 B | 10107 |
| `audio-dsp/gain_minus6db_s16` | 30 | 30 | 166.69× | 0 B | 379 |
| `performance/size-ladder-iterate-packets-medium` | 29.7 | 29.7 | 1010.61× | — | — |
| `probe/wav_s16` | 18.7 | 18.7 | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | 739 | 739 | 16.96× | 44.09 MiB | 511 |
| `remux/vp9_1080p_10s_webm_to_mp4` | 17 | 17 | 590.27× | 0 B | 624 |
| `audio-dsp/pcm_s24_to_s16` | 20.6 | 20.6 | 242.6× | 0 B | 0 |
| `transcode/ladder_tiny_h264_360p_resize_180p` | 203.9 | 203.9 | — | 0 B | — |
| `probe/perf-extract-metadata-huge` | 9.9 | 9.9 | — | — | — |
| `transcode/h264_rotate_180` | 2667.5 | 2667.5 | 11.25× | 0 B | 624 |
| `remux/h264_1080p_30s_mp4_to_mkv` | 361.1 | 361.1 | 83.08× | 0 B | 3833 |
| `mux/pcm_s24_to_wav` | 6.7 | 6.7 | 750.19× | 0 B | 2921 |
| `metadata/write_mp4_tags` | 317.2 | 317.2 | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | 92 | 92 | — | 0 B | 511 |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | 8 | 8 | 625.61× | 0 B | 511 |
| `probe/vp8_720p_10s` | 5.9 | 5.9 | — | — | — |
| `demux/h264_in_mkv` | 9.1 | 9.1 | — | — | — |
| `demux/wav_s16` | 6.4 | 6.4 | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | 10.4 | 10.4 | — | — | — |
| `probe/recorder_headerless` | 1.9 | 1.9 | — | — | — |
| `encryption/cenc_cbcs_decrypt` | 51.4 | 51.4 | 97.3× | 0 B | 3833 |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | 34.2 | 34.2 | — | 0 B | 379 |
| `remux/av1_720p_5s_webm_to_mp4` | 7 | 7 | 719.54× | 0 B | 1103 |
| `trim/audio_wav_pcm_copy` | 3.4 | 3.4 | 1490.31× | 0 B | 511 |
| `probe/flac_seektable` | 1.2 | 1.2 | — | — | — |
| `metadata/write_ogg_vorbiscomment` | 5.4 | 5.4 | — | — | — |
| `probe/large_h264_1080p_120s` | 2.5 | 2.5 | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | 2.5 | 2.5 | 3929.27× | 0 B | 511 |
| `audio-dsp/downmix_5_1_to_stereo` | 115.1 | 115.1 | 86.87× | 0 B | 379 |
| `demux/size_micro_micro_h264_1frame` | 9.6 | 9.6 | — | — | — |
| `mux/vorbis_to_ogg` | 6.9 | 6.9 | 1456.04× | 0 B | 624 |
| `remux/opus_ogg_to_webm` | 10.1 | 10.1 | 994.73× | 0 B | 10815 |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | 2.5 | 2.5 | — | — | — |
| `transcode/h264_resize_720p` | 2166.6 | 2166.6 | 13.85× | 0 B | 624 |
| `decode-seek/meta_seek_vs_linear_decode` | 24.5 | 24.5 | — | 35.69 MiB | 511 |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | 596.4 | 596.4 | 8.38× | 0 B | 328 |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | 49.1 | 49.1 | — | 0 B | 511 |
| `mux/swap_audio_video_with_opus_to_mkv` | 59.6 | 59.6 | 503.48× | 0 B | 3833 |
| `probe/mp3_xing` | 2 | 2 | — | — | — |
| `probe/vp9_1080p_10s` | 12.2 | 12.2 | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | 4.6 | 4.6 | — | — | — |
| `probe/aac_adts` | 2.1 | 2.1 | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | 970.3 | 970.3 | 10.31× | 0 B | 511 |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | 560.5 | 560.5 | — | 0 B | 11948 |
| `trim/vp9_noop_full_range_idempotent` | 22.6 | 22.6 | 443.81× | 0 B | 511 |
| `decode-seek/seek_negative` | 25.2 | 25.2 | — | — | 379 |
| `remux/av1_720p_5s_webm_to_webm` | 7.7 | 7.7 | 653.79× | 45.52 MiB | 1259 |
| `decode-seek/decode_vp9` | 560.8 | 560.8 | — | 0 B | 511 |
| `demux/hls_vod` | 49.4 | 49.4 | — | — | — |
| `transcode/av1_to_h264_mp4` | 367.3 | 367.3 | 13.63× | 41.33 MiB | 3833 |
| `remux/h264_1080p_5s_mov_to_mkv` | 38.3 | 38.3 | 130.67× | 0 B | 328 |
| `audio-dsp/resample_44k1_to_48k` | 56.8 | 56.8 | 176.1× | 33.03 MiB | 2228 |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | 1.9 | 1.9 | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | 669.9 | 669.9 | 44.78× | 0 B | 511 |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | 2.8 | 2.8 | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | 25 | 25 | 400.36× | 0 B | 937 |
| `mux/edge_rotation_decode_mux_mov` | 18 | 18 | — | 0 B | 11948 |
| `trim/h264_multitrack_keyframe_aligned` | 375.1 | 375.1 | 26.66× | 0 B | 0 |
| `demux/size_tiny_tiny_vp9_360p_2s` | 2.9 | 2.9 | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | 41.1 | 41.1 | — | 0 B | 511 |
| `metadata/tagedit_no_corrupt_audio_flac` | 2.5 | 2.5 | — | 0 B | 511 |
| `probe/h264_in_mkv` | 7.3 | 7.3 | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | 7.2 | 7.2 | 1394.7× | 26.34 MiB | 0 |
| `transcode/h264_rotate_90_dimswap` | 2628.6 | 2628.6 | 11.41× | 73.64 MiB | 511 |
| `transcode/h264_fps_15_to_30` | 762.7 | 762.7 | 16.43× | 0 B | 937 |
| `performance/size-ladder-demux-peak-memory-huge` | 883.4 | 883.4 | — | 0 B | — |
| `probe/massive_h264_1080p_2h` | 24.8 | 24.8 | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | 2.5 | 2.5 | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | 163.5 | 163.5 | — | 0 B | — |
| `transcode/h264_rotate_normalize` | 629.7 | 629.7 | 15.88× | 0 B | 511 |
| `remux/prop_mp3_to_mp4_duration_invariant` | 3.7 | 3.7 | — | 0 B | 511 |
| `streaming-output/buffer_massive_h264_mp4` | 23823.1 | 23823.1 | 302.23× | 0 B | 0 |
| `mux/aac_to_adts` | 2.9 | 2.9 | 3423.55× | 0 B | 0 |
| `metadata/read_no_tags_wav` | 5.5 | 5.5 | — | — | — |
| `transcode/h264_to_hevc_mp4` | 2843.3 | 2843.3 | 10.55× | 0 B | 511 |
| `trim/vp8_keyframe_aligned` | 361.2 | 361.2 | 27.69× | 0 B | 511 |
| `remux/h264_bframes_1080p_mp4_to_mkv` | 113.4 | 113.4 | 88.14× | 0 B | 3833 |
| `transcode/hevc_to_vp9_webm` | 1330.4 | 1330.4 | 7.52× | 0 B | 511 |
| `audio-dsp/throughput_encode_s24` | 20.3 | 20.3 | — | 0 B | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | 2849.3 | 2849.3 | 10.53× | 0 B | 511 |
| `streaming-output/mp4_fragmented_cmaf` | 588.2 | 588.2 | 51× | 0 B | 11948 |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | 5.9 | 5.9 | 1684.68× | 0 B | 511 |
| `transcode/wav_to_mp3_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | 51.1 | 51.1 | 97.78× | 0 B | 2228 |
| `transcode/h264_to_vp8_webm` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_2x2_h264` | 2.5 | 2.5 | — | 0 B | 9154 |
| `transcode/h264_two_pass_bitrate` | — | — | — | — | — |
| `decode-seek/decode_hevc` | 560.4 | 560.4 | — | 0 B | 511 |
| `probe/huge_vp9_1080p_240s` | 12.7 | 12.7 | — | — | — |
| `mux/pcm_f32_to_wav` | 4.4 | 4.4 | 1132.5× | 0 B | 379 |
| `performance/op-sweep-probe` | 2.1 | 2.1 | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | 18.3 | 18.3 | — | — | 511 |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | 2725.5 | 2725.5 | 11.01× | 44.52 MiB | 8658 |
| `transcode/vp8_to_vp9_webm` | 84.1 | 84.1 | 36.69× | 0 B | 1259 |
| `performance/convert-webm-resize-320x180` | 2146.8 | 2146.8 | — | — | — |
| `performance/encode-fps` | 4363.3 | 4363.3 | 6.88× | — | — |
| `probe/wav_s24` | 7.4 | 7.4 | — | — | — |
| `encryption/hls_aes128_decrypt` | 97.2 | 97.2 | 102.91× | 40.42 MiB | 3833 |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | 12.5 | 12.5 | — | — | — |
| `mux/audio_only_aac_to_mp4` | 8.4 | 8.4 | 1188.51× | 0 B | 3833 |
| `trim/audio_opus_ogg_copy` | 3.7 | 3.7 | 2719.29× | 0 B | 8658 |
| `trim/h264_open_gop_frame_accurate` | 479.4 | 479.4 | 20.86× | 0 B | 379 |
| `mux/mp4_progressive_buffer` | 50.3 | 50.3 | 596.54× | 0 B | 624 |
| `trim/h264_single_gop_frame_accurate` | 165.8 | 165.8 | 180.97× | 0 B | 328 |
| `metadata/tracks_attribution_multitrack` | 2.7 | 2.7 | — | — | — |
| `probe/wav_f32` | 1.6 | 1.6 | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | 2562.7 | 2562.7 | 11.71× | 0 B | 511 |
| `demux/h264_1080p_5s` | 8.7 | 8.7 | — | — | — |
| `performance/decode-fps` | 333.2 | 333.2 | — | — | — |
| `remux/aac_adts_adts_to_mp4` | 4.7 | 4.7 | 2138.81× | 0 B | 511 |
| `metadata/read_h264_1080p_30s` | 3.3 | 3.3 | — | — | — |
| `decode-seek/decode_mov_h264` | 1090.6 | 1090.6 | — | 0 B | 624 |
| `metadata/write_mp3_id3` | 5.3 | 5.3 | — | — | — |
| `demux/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | 48.1 | 48.1 | 103.97× | 0 B | 511 |
| `metadata/meta_consistent_mp4_to_mkv` | 314.9 | 314.9 | — | 0 B | 0 |
| `transcode/h264_fps_30_to_15` | 1490.3 | 1490.3 | 20.13× | 0 B | 379 |
| `demux/size_massive_massive_h264_1080p_2h` | 12067.7 | 12067.7 | — | 0 B | 2228 |
| `decode-seek/seek_h264_keyframe` | 26.3 | 26.3 | — | — | 0 |
| `mux/mp4_fragmented_cmaf` | 50.3 | 50.3 | 595.95× | 0 B | 624 |
| `audio-dsp/fade_in_out_f32` | 23.7 | 23.7 | 211.01× | 35.41 MiB | 624 |
| `mux/video_a_plus_audio_b_to_mkv` | 62 | 62 | 484.11× | 0 B | 3833 |
| `demux/mp3_xing` | 3 | 3 | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | 19.5 | 19.5 | 256.28× | 0 B | 511 |
| `mux/size_large_1080p_to_mkv` | 221.5 | 221.5 | 541.65× | 0 B | 0 |
| `mux/h264_aac_to_mkv` | 48.6 | 48.6 | 617.73× | 0 B | 511 |
| `mux/drop_audio_track_subset_to_mp4` | 14.1 | 14.1 | 710.23× | 41.63 MiB | 1103 |
| `remux/h264_ts_ts_to_mov` | 61.8 | 61.8 | 162.03× | 59.36 MiB | 379 |
| `streaming-output/prop_probe_dur_fragmented_shape` | 326.2 | 326.2 | — | 0 B | 408 |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | 5.3 | 5.3 | — | — | — |
| `probe/perf-extract-metadata-large` | 2.7 | 2.7 | — | — | — |
| `performance/size-ladder-iterate-packets-large` | 175.2 | 175.2 | 684.81× | — | — |
| `remux/mp3_xing_mp3_to_mkv` | 5.1 | 5.1 | 1974.33× | 0 B | 511 |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | 38.2 | 38.2 | — | 0 B | 0 |
| `encryption/unencrypted_left_untouched_noop` | 314 | 314 | — | 86.38 MiB | 379 |
| `metadata/write_mkv_tags` | 17.5 | 17.5 | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `decode-seek/seek_av1_keyframe` | 15.4 | 15.4 | — | — | 624 |
| `performance/convert-peak-memory` | 2120 | 2120 | — | 0 B | — |
| `trim/vp9_keyframe_aligned` | 597.1 | 597.1 | 16.76× | 0 B | 937 |
| `streaming-output/mp4_buffer_target` | 339.9 | 339.9 | 88.26× | 0 B | 937 |
| `trim/massive_h264_copy_sustained` | 5040.9 | 5040.9 | 1428.3× | 0 B | 328 |
| `audio-dsp/edge_variable_channel_count_downmix` | 52.6 | 52.6 | — | 0 B | 0 |
| `probe/tiny_h264_360p_2s` | 1.9 | 1.9 | — | — | — |
| `trim/av1_keyframe_aligned` | 286.4 | 286.4 | 17.48× | 0 B | 0 |
| `remux/aac_adts_adts_to_ts` | 8.1 | 8.1 | 1245.31× | 36.73 MiB | 8658 |
| `performance/op-sweep-demux` | 33.2 | 33.2 | 904.02× | — | — |
| `performance/seek-ms` | 26.2 | 26.2 | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | 4.4 | 4.4 | 2272.73× | 26.26 MiB | 379 |
| `metadata/write_flac_vorbiscomment` | 5.8 | 5.8 | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | 40.3 | 40.3 | — | 0 B | 3833 |
| `transcode/bframe_reorder_h264_to_vp9` | 1400.2 | 1400.2 | 7.14× | 0 B | 511 |
| `transcode/vp9_alpha_to_vp8_keepalpha` | 474.3 | 474.3 | 10.54× | 0 B | 379 |
| `demux/size_micro_micro_audio_short` | 1.4 | 1.4 | — | — | — |
| `trim/h264_to_eof_copy` | 438.1 | 438.1 | 68.48× | 0 B | 0 |
| `remux/h264_rotated90_mp4_to_mov` | 97.6 | 97.6 | 102.45× | 42.26 MiB | 1259 |
| `remux/hevc_1080p_10s_mp4_to_mkv` | 89.3 | 89.3 | 112.01× | 0 B | 511 |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | 5903 | 5903 | 101.64× | 0 B | 511 |
| `metadata/rotation_survives_mp4_mkv` | 201.8 | 201.8 | — | 38.45 MiB | 11948 |
| `demux/h264_vfr` | — | — | — | — | — |
| `probe/h264_1080p_5s` | 5.3 | 5.3 | — | — | — |
| `probe/hevc_1080p_10s` | 2.4 | 2.4 | — | — | — |
| `decode-seek/decode_multitrack_select_video` | 275.3 | 275.3 | — | 0 B | 511 |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | 81.7 | 81.7 | 122.42× | 0 B | 379 |
| `demux/h264_rotated90` | 8.4 | 8.4 | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | 9.2 | 9.2 | — | 0 B | 3833 |
| `transcode/mp3_to_aac_mp4` | 84.2 | 84.2 | 118.82× | 0 B | 2228 |
| `decode-seek/decode_h264_first_frames` | 1104.1 | 1104.1 | — | 0 B | 511 |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `probe/h264_vfr` | 2.1 | 2.1 | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | 12.7 | 12.7 | 787.81× | 30.01 MiB | 0 |
| `transcode/fanout_h264_abr_ladder` | 8979 | 8979 | 3.34× | 0 B | 511 |
| `performance/metamorphic-decode-remux` | 279.2 | 279.2 | 107.44× | — | — |
| `decode-seek/seek_past_eof` | 72.3 | 72.3 | — | — | 1259 |
| `streaming-output/mp4_faststart_in_memory` | 294.6 | 294.6 | 101.83× | 0 B | 624 |
| `trim/vp9_alpha_keyframe_aligned` | 462.8 | 462.8 | 10.8× | 0 B | 511 |
| `decode-seek/decode_tiny_dims_1x1` | 2.7 | 2.7 | — | 0 B | 511 |
| `demux/size_huge_huge_h264_1080p_600s` | 910.9 | 910.9 | — | 0 B | 511 |
| `demux/flac_seektable` | 3.1 | 3.1 | — | — | — |
| `decode-seek/decode_bframes_reorder` | 1075 | 1075 | — | 0 B | 624 |
| `demux/size_tiny_tiny_h264_360p_2s` | 2.2 | 2.2 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | 80.2 | 80.2 | — | 0 B | 624 |
| `transcode/h264_to_vp9_webm` | 3804.3 | 3804.3 | 7.89× | 0 B | 1259 |
| `decode-seek/decode_size_tiny_h264_360p` | 100.6 | 100.6 | — | 56.81 MiB | 511 |
| `mux/edge_multitrack_keep_all_to_mp4` | 13.3 | 13.3 | 750.47× | 29.08 MiB | 0 |
| `transcode/h264_to_ts` | 2744.5 | 2744.5 | 10.93× | 0 B | 3833 |
| `probe/mp3_cbr_notoc` | 2.7 | 2.7 | — | — | — |
| `transcode/h264_crop_center` | 7485.3 | 7485.3 | 4.01× | 273.39 MiB | 12973 |
| `decode-seek/seek_vp8_keyframe` | 15 | 15 | — | — | 0 |
| `trim/h264_keyframe_aligned` | 947.3 | 947.3 | 31.67× | 0 B | 9154 |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | 4891.8 | 4891.8 | 1471.85× | — | — |
| `probe/opus` | 1.6 | 1.6 | — | — | — |
| `trim/hevc_keyframe_aligned` | 499.5 | 499.5 | 20.02× | 0 B | 0 |
| `decode-seek/seek_hevc_keyframe` | 24.6 | 24.6 | — | — | 511 |
| `streaming-output/prop_decode_equals_buffer_shape` | 530.6 | 530.6 | — | 37.33 MiB | 11514 |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | 10.3 | 10.3 | — | 0 B | 379 |
| `trim/hevc_frame_accurate` | 525.7 | 525.7 | 19.02× | 37.3 MiB | 11514 |
| `transcode/aac_to_pcm_wav_extract` | 42.9 | 42.9 | 234.07× | 0 B | 624 |
| `mux/three_track_assembly_to_mkv` | 51.8 | 51.8 | 579.54× | 0 B | 511 |
| `decode-seek/decode_av1` | 213.5 | 213.5 | — | 131.65 MiB | 379 |
| `performance/size-ladder-iterate-packets-huge` | 1195.3 | 1195.3 | 501.96× | — | — |
| `trim/h264_start_zero_copy` | 55.5 | 55.5 | 540.64× | 0 B | 624 |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | 2.2 | 2.2 | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | 95.4 | 95.4 | — | 52.63 MiB | 328 |
| `decode-seek/seek_repeated_same_target` | 33.8 | 33.8 | — | — | 511 |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | 28407.2 | 28407.2 | 253.46× | 0 B | 937 |
| `transcode/mp3_to_opus_webm` | 122.6 | 122.6 | 81.58× | 0 B | 624 |
| `probe/metamorphic-recorder-headerless-sane-duration` | 1.7 | 1.7 | — | — | — |
| `audio-dsp/throughput_decode_s24` | 28.8 | 28.8 | — | 82.49 MiB | — |
| `remux/flac_seektable_flac_to_mkv` | 4.7 | 4.7 | 2141.33× | 0 B | 511 |
| `trim/h264_bframes_frame_accurate` | 422.8 | 422.8 | 23.65× | 0 B | 511 |
| `probe/big_buck_bunny_1080p_h264` | 6.2 | 6.2 | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | 642.6 | 642.6 | 186.74× | 0 B | 511 |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | 90 | 90 | — | 0 B | 379 |
| `decode-seek/seek_zero` | 26.5 | 26.5 | — | — | 511 |
| `performance/size-ladder-iterate-packets-tiny` | 3.7 | 3.7 | 544.22× | — | — |
| `decode-seek/decode_h264_10bit` | 480.1 | 480.1 | — | 0 B | 624 |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | 1151.6 | 1151.6 | 104.2× | 0 B | 511 |
| `demux/realworld_mdn_flower_webm` | 3.9 | 3.9 | — | — | — |
| `mux/h264_aac_to_mov` | 66.8 | 66.8 | 449.37× | 0 B | 624 |
| `remux/h264_ts_ts_to_mp4` | 48.2 | 48.2 | 207.9× | 39.1 MiB | 2921 |
| `performance/op-sweep-transcode-webm` | 2162 | 2162 | 13.88× | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | 7.3 | 7.3 | — | — | — |
| `transcode/h264_rotate_270_dimswap` | 809.1 | 809.1 | 12.36× | 0 B | 511 |
| `trim/ts_keyframe_aligned` | 455.8 | 455.8 | 21.99× | 0 B | 3833 |
| `audio-dsp/edge_gapless_aac_decode` | 3.4 | 3.4 | — | 0 B | 511 |
| `performance/size-ladder-demux-peak-memory-large4k` | 22.7 | 22.7 | — | 21.77 MiB | — |
| `performance/metamorphic-transcode-idempotent-source-res` | 4337.7 | 4337.7 | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | 133.3 | 133.3 | 900.56× | 0 B | 0 |
| `mux/h264_aac_to_mp4` | 48.8 | 48.8 | 615.38× | 0 B | 511 |
| `audio-dsp/meta_idempotent_resample_same_rate` | 4.2 | 4.2 | — | 0 B | — |
| `trim/mkv_keyframe_aligned` | 611.2 | 611.2 | 16.4× | 0 B | 11514 |
| `demux/size_large_large_vp9_1080p_120s` | 210.6 | 210.6 | — | 0 B | 0 |
| `audio-dsp/edge_longform_audio_resample_16k` | 6198.3 | 6198.3 | — | 0 B | 3833 |
| `decode-seek/decode_size_large_vp9_120s` | 1083.7 | 1083.7 | — | 0 B | 511 |
| `decode-seek/seek_h264_nonkeyframe` | 60.8 | 60.8 | — | — | 10815 |
| `transcode/hevc_to_h264_mp4` | 1199.7 | 1199.7 | 8.34× | 0 B | 10815 |
| `probe/longform_1h_audio` | 12.9 | 12.9 | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | 2562.7 | 2562.7 | 11.71× | 0 B | 511 |
| `demux/size_large_large_h264_1080p_120s` | 180.4 | 180.4 | — | 0 B | 0 |
| `remux/h264_multitrack_mp4_to_mkv` | 87.6 | 87.6 | 114.17× | 0 B | 624 |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | 6 | 6 | — | 23.92 MiB | 0 |
| `probe/tiny_vp9_360p_2s` | 1.2 | 1.2 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | 50.3 | 50.3 | — | 0 B | 379 |
| `transcode/extreme_fps_240` | 14275.6 | 14275.6 | 2.1× | 0 B | 0 |
| `decode-seek/decode_h264_4k` | 2467.6 | 2467.6 | — | 985.28 MiB | 8531 |
| `demux/h264_ts` | 42.2 | 42.2 | — | — | — |
| `probe/realworld_mdn_flower_mp4` | 1.5 | 1.5 | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | 7.6 | 7.6 | — | — | — |
| `probe/av1_720p_5s` | 13.4 | 13.4 | — | — | — |
| `demux/wav_s24` | 5.6 | 5.6 | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | 3472.2 | 3472.2 | 8.64× | — | — |
| `decode-seek/decode_extreme_fps_1` | 114.3 | 114.3 | — | 0 B | 12973 |
| `metadata/read_no_tags_recorder_webm` | 2.2 | 2.2 | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | 299.1 | 299.1 | 100.3× | 67.24 MiB | 624 |
| `demux/empty_audio_zero_packets` | 1.1 | 1.1 | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | 66.2 | 66.2 | 452.86× | 126.88 MiB | 8531 |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | 282.5 | 282.5 | — | 55.85 MiB | 328 |
| `transcode/aac_to_opus_webm` | 91.6 | 91.6 | 109.5× | 0 B | 511 |
| `performance/op-sweep-remux-mp4-to-mkv` | 292.4 | 292.4 | 102.61× | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | 1066.1 | 1066.1 | — | 0 B | 624 |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | 42.1 | 42.1 | — | — | 937 |
| `metadata/read_flac_seektable` | 1.4 | 1.4 | — | — | — |
| `probe/metamorphic-duration-across-containers` | 10.2 | 10.2 | — | — | — |
| `mux/av1_opus_to_mp4` | 8.2 | 8.2 | 611.85× | 0 B | 9154 |
| `trim/h264_rotated_keyframe_aligned` | 358.1 | 358.1 | 27.93× | 36.66 MiB | 511 |
| `mux/flac_to_mkv_audio` | 5.9 | 5.9 | 1696.35× | 26.88 MiB | 379 |
| `probe/micro_audio_short` | 1.5 | 1.5 | — | — | — |
| `transcode/vp9_to_h264_mp4` | 990.8 | 990.8 | 10.1× | 0 B | 3833 |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | 209.1 | 209.1 | — | 0 B | — |
| `decode-seek/decode_vp9_alpha` | 241 | 241 | — | 0 B | 3833 |
| `performance/size-ladder-extract-metadata-medium` | 7.9 | 7.9 | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | 73 | 73 | 68.53× | 0 B | 0 |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | 37.5 | 37.5 | 133.17× | 28.63 MiB | 937 |
| `demux/wav_f32` | 7.3 | 7.3 | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | 236.7 | 236.7 | — | 0 B | 11948 |
| `probe/empty-audio-wav` | 3.1 | 3.1 | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | 958.7 | 958.7 | 10.43× | 0 B | 0 |
| `demux/aac_adts` | 3.8 | 3.8 | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | 559.4 | 559.4 | — | 0 B | 11948 |
| `audio-dsp/edge_longform_audio_probe` | 2.1 | 2.1 | — | 0 B | 511 |
| `decode-seek/decode_size_micro_h264_1frame` | 12.8 | 12.8 | — | 0 B | 0 |
| `mux/size_micro_1frame_to_mp4` | 3 | 3 | 333.89× | 0 B | 328 |
| `mux/edge_rotation_decode_mux_mkv` | 38.2 | 38.2 | — | 133.61 MiB | 11948 |
| `metadata/read_h264_in_mkv` | 6.9 | 6.9 | — | — | — |
| `performance/extract-metadata` | 1.7 | 1.7 | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | 284.3 | 284.3 | — | 0 B | 379 |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | 3.8 | 3.8 | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | 26.4 | 26.4 | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | 22.5 | 22.5 | — | 0 B | 624 |
| `transcode/h264_to_av1_mp4` | 6403 | 6403 | 4.69× | 0 B | 624 |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | 8.2 | 8.2 | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/h264_ts` | 23.3 | 23.3 | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | 15.2 | 15.2 | 657.55× | 35.03 MiB | 2228 |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | 54.6 | 54.6 | 183.43× | 0 B | 11948 |
| `demux/h264_multitrack` | 9.6 | 9.6 | — | — | — |
| `transcode/h264_fps_30_to_60` | 5213.1 | 5213.1 | 5.75× | 0 B | 3833 |
| `trim/mov_keyframe_aligned` | 448.2 | 448.2 | 11.16× | 0 B | 8658 |
| `remux/vp8_720p_10s_webm_to_mkv` | 6.2 | 6.2 | 1604.33× | 0 B | 379 |
| `demux/h264_1080p_30s` | 53.3 | 53.3 | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | 3.9 | 3.9 | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | 266.9 | 266.9 | — | 141.03 MiB | 511 |
| `probe/perf-extract-metadata-massive` | 81 | 81 | — | — | — |
| `mux/mp3_to_mp4_audio` | 6.9 | 6.9 | 1447.18× | 0 B | 624 |
| `mux/mp3_to_mp3` | 3.8 | 3.8 | 2649.01× | 0 B | 0 |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | 90.7 | 90.7 | 330.72× | 0 B | 511 |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | 281.9 | 281.9 | — | 0 B | 511 |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | 4.1 | 4.1 | 243.9× | 36.29 MiB | 8531 |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | 10.1 | 10.1 | — | — | — |
| `probe/hls_aes128` | 31.9 | 31.9 | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | 284.5 | 284.5 | 105.43× | 56.04 MiB | 328 |
| `mux/size_longform_audio_to_mp4` | 5033.3 | 5033.3 | 715.24× | 0 B | 511 |
| `decode-seek/decode_size_huge_h264_600s` | 1179.7 | 1179.7 | — | 513.43 MiB | 3833 |
| `audio-dsp/resample_48k_to_16k` | 22.4 | 22.4 | 222.77× | 0 B | 624 |
| `remux/opus_ogg_to_mkv` | 5.5 | 5.5 | 1809.58× | 0 B | 511 |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | 4.3 | 4.3 | 1176.47× | 0 B | 379 |
| `metadata/read_opus` | 1.9 | 1.9 | — | — | — |
| `performance/size-ladder-extract-metadata-large` | 3.8 | 3.8 | — | — | — |
| `decode-seek/decode_mkv_h264` | 650.8 | 650.8 | — | 38.42 MiB | 11948 |
| `demux/vp8_720p_10s` | 4.8 | 4.8 | — | — | — |
| `trim/audio_aac_adts_copy` | 5.3 | 5.3 | 1901.61× | 0 B | 379 |
| `mux/size_large_1080p_to_mp4` | 218.5 | 218.5 | 549.11× | 123.51 MiB | 937 |
| `audio-dsp/pcm_f32_to_s16` | 18.4 | 18.4 | 271.08× | 0 B | 0 |
| `mux/size_tiny_360p_to_mp4` | 4 | 4 | 501.25× | 0 B | 511 |
| `decode-seek/decode_extreme_fps_240` | 397.5 | 397.5 | — | 0 B | 379 |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | 10.8 | 10.8 | 461.04× | 0 B | 937 |
| `transcode/h264_to_mov` | 2577.2 | 2577.2 | 11.64× | 0 B | 511 |
| `metadata/read_vp9_1080p_10s` | 7.7 | 7.7 | — | — | — |
| `probe/huge_h264_1080p_600s` | 6.1 | 6.1 | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | 35.4 | 35.4 | — | 0 B | 9154 |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | 34.6 | 34.6 | 144.4× | 0 B | 624 |
| `demux/flac_noseektable` | 3.6 | 3.6 | — | — | — |
| `probe/realworld_mdn_trex_mp3` | 4.1 | 4.1 | — | — | — |
| `transcode/h264_to_fragmented_mp4` | 2558.2 | 2558.2 | 11.73× | 0 B | 511 |
| `probe/h264_multitrack` | 2.7 | 2.7 | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | 25.5 | 25.5 | 392.31× | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | 89.7 | 89.7 | — | 0 B | 624 |
| `streaming-output/prop_probe_dur_buffer_shape` | 326.1 | 326.1 | — | 0 B | 937 |
| `encryption/hls_aes128_decrypt_eq_cleartext` | 83.9 | 83.9 | — | 44.38 MiB | 511 |
| `trim/h264_keyframe_aligned_short` | 340.3 | 340.3 | 88.15× | 0 B | 624 |
| `streaming-output/prop_faststart_reserve_duration_invariant` | 49.3 | 49.3 | — | 0 B | 8658 |
| `decode-seek/seek_vfr_arbitrary` | 49.5 | 49.5 | — | — | 9154 |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | 96.5 | 96.5 | — | — | 3833 |
| `remux/vp9_1080p_10s_webm_to_webm` | 19.7 | 19.7 | 509.05× | 0 B | 511 |
| `demux/h264_4k_10s` | 24.4 | 24.4 | — | — | — |
| `probe/hls_vod` | 19.5 | 19.5 | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | 23.5 | 23.5 | 426.05× | 44.2 MiB | 511 |
| `transcode/vp9_to_av1_webm` | 2599.1 | 2599.1 | 3.85× | 0 B | 11948 |
| `performance/size-ladder-extract-metadata-large4k` | 1.9 | 1.9 | — | — | — |
| `transcode/extreme_fps_1` | 507.8 | 507.8 | 59.08× | 0 B | 511 |
| `performance/iterate-video-packets` | 37.1 | 37.1 | — | — | — |
| `trim/h264_vfr_frame_accurate` | 193.3 | 193.3 | 64.85× | 0 B | 937 |
| `decode-seek/decode_open_gop_first_frame` | 367.9 | 367.9 | — | 0 B | 10815 |
| `remux/prop_adts_to_mp4_duration_invariant` | 3.9 | 3.9 | — | 0 B | 511 |
| `transcode/av1_to_vp9_webm` | 487.1 | 487.1 | 10.28× | 0 B | 624 |
| `transcode/h264_to_mkv` | 2547.8 | 2547.8 | 11.78× | 0 B | 328 |
| `probe/massive_vp9_1080p_2h` | 10.4 | 10.4 | — | — | — |
| `metadata/read_mp3_xing` | 1.7 | 1.7 | — | — | — |
| `demux/vp9_1080p_10s` | 13 | 13 | — | — | — |
| `trim/h264_noop_full_range_idempotent` | 43.5 | 43.5 | 689.89× | 0 B | 511 |
| `mux/edge_bframes_decode_mux_mp4` | 17.3 | 17.3 | — | 0 B | 511 |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | 3757.2 | 3757.2 | 7.98× | 0 B | 0 |
| `probe/vp9_alpha` | 10.9 | 10.9 | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | 5050.8 | 5050.8 | 5.94× | 0 B | 11514 |
| `trim/h264_subframe_range_frame_accurate` | 157.1 | 157.1 | 190.99× | 0 B | 511 |
| `demux/av1_720p_5s` | 6.3 | 6.3 | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | 33.5 | 33.5 | 298.66× | 0 B | 511 |
| `decode-seek/decode_size_large_h264_120s` | 1056.7 | 1056.7 | — | 0 B | 624 |
| `transcode/gapless_pcm_to_aac_priming` | 45.5 | 45.5 | — | 0 B | 0 |
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
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | — | — | — | — | — |

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
| `probe/h264_rotated90` | 37.1 | 37.1 | — | — | — |
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
| `performance/metamorphic-vfr-probe-duration` | 7.5 | 7.5 | — | — | — |
| `probe/h264_4k_10s` | 34.8 | 34.8 | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | 50.5 | 50.5 | 593.65× | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | 671.9 | 671.9 | — | — | — |
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
| `metadata/tracks_packet_attribution_multitrack` | 25 | 25 | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | 160.3 | 160.3 | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | 3.4 | 3.4 | — | — | — |
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
| `probe/h264_bframes_1080p` | 25.7 | 25.7 | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | 18.1 | 18.1 | — | — | — |
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
| `performance/size-ladder-demux-peak-memory-huge` | 802.6 | 802.6 | — | 0 B | — |
| `probe/massive_h264_1080p_2h` | 1622.9 | 1622.9 | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | 211.3 | 211.3 | — | 124.76 MiB | — |
| `transcode/h264_rotate_normalize` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | 5645.7 | 5645.7 | 1275.3× | 2.19 GiB | 0 |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `transcode/h264_to_hevc_mp4` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `transcode/hevc_to_vp9_webm` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | 114.5 | 114.5 | 262.04× | 0 B | 11948 |
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
| `performance/op-sweep-probe` | 57.1 | 57.1 | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | 23.7 | 23.7 | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | 12.1 | 12.1 | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | 14.5 | 14.5 | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | 40 | 40 | — | — | — |
| `decode-seek/decode_mov_h264` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | 4.4 | 4.4 | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | 15.1 | 15.1 | 331.79× | 61.91 MiB | 0 |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | 2546.4 | 2546.4 | — | 0 B | 0 |
| `decode-seek/seek_h264_keyframe` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | 153.1 | 153.1 | 195.98× | 0 B | 10815 |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | 35.7 | 35.7 | 279.99× | 0 B | 0 |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | 82.3 | 82.3 | — | 0 B | 0 |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | 3.3 | 3.3 | — | — | — |
| `probe/perf-extract-metadata-large` | 109 | 109 | — | — | — |
| `performance/size-ladder-iterate-packets-large` | 153.6 | 153.6 | 781.43× | — | — |
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
| `probe/tiny_h264_360p_2s` | 2.1 | 2.1 | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | 56.4 | 56.4 | 531.77× | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | 5.1 | 5.1 | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | 1220.7 | 1220.7 | 491.52× | 0 B | 0 |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | 8.6 | 8.6 | — | — | — |
| `probe/h264_1080p_5s` | 13.2 | 13.2 | — | — | — |
| `probe/hevc_1080p_10s` | 26.3 | 26.3 | — | — | — |
| `decode-seek/decode_multitrack_select_video` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | 11.1 | 11.1 | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | 30.9 | 30.9 | — | 87.97 MiB | 0 |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | 8.1 | 8.1 | 1546.33× | — | — |
| `probe/h264_vfr` | 5.7 | 5.7 | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | 749.9 | 749.9 | — | 0 B | 0 |
| `demux/flac_seektable` | — | — | — | — | — |
| `decode-seek/decode_bframes_reorder` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | 2.3 | 2.3 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | 56.2 | 56.2 | 177.89× | 62.31 MiB | 0 |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | 3670.7 | 3670.7 | 1961.48× | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | 809.2 | 809.2 | 741.5× | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | 7.3 | 7.3 | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | — | — | — | — | — |
| `decode-seek/seek_repeated_same_target` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | 968.2 | 968.2 | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | 2.1 | 2.1 | 968.52× | — | — |
| `decode-seek/decode_h264_10bit` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | 559.8 | 559.8 | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | 37.4 | 37.4 | — | 78.51 MiB | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | 133.5 | 133.5 | 224.75× | 0 B | 3833 |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `decode-seek/decode_size_large_vp9_120s` | — | — | — | — | — |
| `decode-seek/seek_h264_nonkeyframe` | — | — | — | — | — |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | 86.2 | 86.2 | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | 172.9 | 172.9 | — | 0 B | 0 |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `probe/realworld_mdn_flower_mp4` | 4.3 | 4.3 | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | 2.8 | 2.8 | — | — | — |
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
| `probe/micro_audio_short` | 1.9 | 1.9 | — | — | — |
| `transcode/vp9_to_h264_mp4` | — | — | — | — | — |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | — | — | — | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | 42.9 | 42.9 | — | — | — |
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
| `mux/size_micro_1frame_to_mp4` | 3.8 | 3.8 | 265.25× | 53.3 MiB | 0 |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `performance/extract-metadata` | 40.5 | 40.5 | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | 10.1 | 10.1 | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | 1554 | 1554 | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | 38.6 | 38.6 | — | — | — |
| `probe/cenc_ctr` | 6.3 | 6.3 | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | 14.7 | 14.7 | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | 59 | 59 | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | 3071.3 | 3071.3 | — | — | — |
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
| `mux/size_longform_audio_to_mp4` | 2831.8 | 2831.8 | 1271.28× | 0 B | 0 |
| `decode-seek/decode_size_huge_h264_600s` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | 107.2 | 107.2 | — | — | — |
| `decode-seek/decode_mkv_h264` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | 435 | 435 | 275.89× | 0 B | 11514 |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | 7.1 | 7.1 | 281.69× | 0 B | 937 |
| `decode-seek/decode_extreme_fps_240` | — | — | — | — | — |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | 646.9 | 646.9 | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | 12.8 | 12.8 | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | 50.6 | 50.6 | 197.57× | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | — | — | — | — | — |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | 49.4 | 49.4 | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | 23.2 | 23.2 | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | 32.8 | 32.8 | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | 60.2 | 60.2 | — | — | — |
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
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | — | — | — | — | — |

**`platform@chrome-149`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `decode-seek/seek_backward_then_forward` | 77.4 | 77.4 | — | — | 1182 |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | 535.6 | 535.6 | — | 0 B | 2532 |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `transcode/h264_resize_4k_to_1080p` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | 16.8 | 16.8 | — | — | — |
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
| `decode-seek/decode_vp8` | 231.3 | 231.3 | — | 0 B | 2532 |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `demux/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | 13.4 | 13.4 | — | — | — |
| `probe/h264_4k_10s` | 44.8 | 44.8 | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | 56.3 | 56.3 | 533× | — | — |
| `probe/wav_s16` | 9.1 | 9.1 | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | 689.1 | 689.1 | — | — | — |
| `transcode/h264_rotate_180` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `probe/vp8_720p_10s` | 8.2 | 8.2 | — | — | — |
| `demux/h264_in_mkv` | 15.9 | 15.9 | — | — | — |
| `demux/wav_s16` | 6.3 | 6.3 | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | 17.3 | 17.3 | — | — | — |
| `probe/recorder_headerless` | 4.2 | 4.2 | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | 47.3 | 47.3 | — | 0 B | 1182 |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | 166.1 | 166.1 | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | 2.8 | 2.8 | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | 5.3 | 5.3 | — | — | — |
| `transcode/h264_resize_720p` | — | — | — | — | — |
| `decode-seek/meta_seek_vs_linear_decode` | 65.1 | 65.1 | — | 49.63 MiB | 2532 |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | 33.3 | 33.3 | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | — | — | — | — | — |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | 76.1 | 76.1 | — | — | 1182 |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | 631.2 | 631.2 | — | 265.53 MiB | 1182 |
| `demux/hls_vod` | — | — | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | 46 | 46 | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | 14 | 14 | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | 4.9 | 4.9 | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | 15.3 | 15.3 | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | 807.1 | 807.1 | — | 451.89 MiB | — |
| `probe/massive_h264_1080p_2h` | 2543.9 | 2543.9 | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | 187.6 | 187.6 | — | 0 B | — |
| `transcode/h264_rotate_normalize` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | 4.5 | 4.5 | — | — | — |
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
| `decode-seek/decode_tiny_dims_2x2_h264` | 3.3 | 3.3 | — | 0 B | 1182 |
| `transcode/h264_two_pass_bitrate` | — | — | — | — | — |
| `decode-seek/decode_hevc` | 571 | 571 | — | 0 B | 2532 |
| `probe/huge_vp9_1080p_240s` | 427 | 427 | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | 58.6 | 58.6 | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | 46.7 | 46.7 | — | — | 2680 |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | 6.2 | 6.2 | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | 33.3 | 33.3 | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | 15.5 | 15.5 | — | — | — |
| `probe/wav_f32` | 44.7 | 44.7 | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | 19.6 | 19.6 | — | — | — |
| `performance/decode-fps` | 266.1 | 266.1 | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | 76.7 | 76.7 | — | — | — |
| `decode-seek/decode_mov_h264` | 1186.8 | 1186.8 | — | 0 B | 8531 |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | 8.5 | 8.5 | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | 2931.7 | 2931.7 | — | 0 B | 1941 |
| `decode-seek/seek_h264_keyframe` | 77.8 | 77.8 | — | — | 1182 |
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
| `probe/micro_h264_1frame` | 2.3 | 2.3 | — | — | — |
| `probe/perf-extract-metadata-large` | 138.8 | 138.8 | — | — | — |
| `performance/size-ladder-iterate-packets-large` | 184.1 | 184.1 | 651.82× | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `decode-seek/seek_av1_keyframe` | 78.7 | 78.7 | — | — | 2532 |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | 3.4 | 3.4 | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | 68.8 | 68.8 | 435.73× | — | — |
| `performance/seek-ms` | 111.8 | 111.8 | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | 8.1 | 8.1 | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | 25.3 | 25.3 | — | — | — |
| `probe/h264_1080p_5s` | 12.4 | 12.4 | — | — | — |
| `probe/hevc_1080p_10s` | 25.9 | 25.9 | — | — | — |
| `decode-seek/decode_multitrack_select_video` | 286.3 | 286.3 | — | 0 B | 2532 |
| `metadata/rotation_decode_read_h264_rotated90` | 140 | 140 | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | 15.9 | 15.9 | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | 1227.7 | 1227.7 | — | 0 B | 1182 |
| `performance/metamorphic-vfr-iterate-packets` | 10.6 | 10.6 | 1186.28× | — | — |
| `probe/h264_vfr` | 9.6 | 9.6 | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | 117 | 117 | — | — | 8531 |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | 2 | 2 | — | 0 B | 2921 |
| `demux/size_huge_huge_h264_1080p_600s` | 771.3 | 771.3 | — | 0 B | 2608 |
| `demux/flac_seektable` | — | — | — | — | — |
| `decode-seek/decode_bframes_reorder` | 1237.4 | 1237.4 | — | 0 B | 11514 |
| `demux/size_tiny_tiny_h264_360p_2s` | 4.7 | 4.7 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | 108.3 | 108.3 | — | 0 B | 2680 |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | 34.7 | 34.7 | — | — | 11514 |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | 2721.6 | 2721.6 | 2645.46× | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | 55.4 | 55.4 | — | — | 2680 |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | 243.3 | 243.3 | — | 0 B | 1259 |
| `performance/size-ladder-iterate-packets-huge` | 823.9 | 823.9 | 728.2× | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | 10 | 10 | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | 100.2 | 100.2 | — | 141.32 MiB | 2680 |
| `decode-seek/seek_repeated_same_target` | 76.1 | 76.1 | — | — | 2228 |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | 6.1 | 6.1 | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | 2281.9 | 2281.9 | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | 77.3 | 77.3 | — | — | 2532 |
| `performance/size-ladder-iterate-packets-tiny` | 5.5 | 5.5 | 366.3× | — | — |
| `decode-seek/decode_h264_10bit` | 431.7 | 431.7 | — | 0 B | 2532 |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | 4.8 | 4.8 | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | 711 | 711 | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | 96.8 | 96.8 | — | 0 B | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | 197 | 197 | — | 118.12 MiB | 1182 |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `decode-seek/decode_size_large_vp9_120s` | 1328.7 | 1328.7 | — | 0 B | 1182 |
| `decode-seek/seek_h264_nonkeyframe` | 91.7 | 91.7 | — | — | 1182 |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | 110.6 | 110.6 | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | 166.6 | 166.6 | — | 0 B | 0 |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | 14.2 | 14.2 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | 2095.7 | 2095.7 | — | 0 B | 2680 |
| `demux/h264_ts` | — | — | — | — | — |
| `probe/realworld_mdn_flower_mp4` | 7.7 | 7.7 | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | 4.3 | 4.3 | — | — | — |
| `probe/av1_720p_5s` | 8.3 | 8.3 | — | — | — |
| `demux/wav_s24` | 7.8 | 7.8 | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | 30.5 | 30.5 | — | 72.05 MiB | 937 |
| `metadata/read_no_tags_recorder_webm` | 7.7 | 7.7 | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | 2.1 | 2.1 | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | 1168.6 | 1168.6 | — | 521.31 MiB | 8658 |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | 117.4 | 117.4 | — | — | 1182 |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | 65.4 | 65.4 | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | 2.9 | 2.9 | — | — | — |
| `transcode/vp9_to_h264_mp4` | — | — | — | — | — |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | — | — | — | — |
| `decode-seek/decode_vp9_alpha` | 354.6 | 354.6 | — | 0 B | 11948 |
| `performance/size-ladder-extract-metadata-medium` | 60.9 | 60.9 | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | 16.5 | 16.5 | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `probe/empty-audio-wav` | 3.5 | 3.5 | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | 466.2 | 466.2 | — | 0 B | 2532 |
| `decode-seek/decode_size_micro_h264_1frame` | 4.8 | 4.8 | — | 0 B | 2532 |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | 16.1 | 16.1 | — | — | — |
| `performance/extract-metadata` | 49.3 | 49.3 | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | 14.9 | 14.9 | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | 2536.2 | 2536.2 | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | 64.1 | 64.1 | — | — | — |
| `probe/cenc_ctr` | 10.4 | 10.4 | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | 18.1 | 18.1 | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | 61.1 | 61.1 | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | 6.4 | 6.4 | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | 314.7 | 314.7 | — | 0 B | 9154 |
| `probe/perf-extract-metadata-massive` | 3062.9 | 3062.9 | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | 156.7 | 156.7 | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | 1678.6 | 1678.6 | — | 0 B | 3833 |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | 200.3 | 200.3 | — | — | — |
| `decode-seek/decode_mkv_h264` | 575.6 | 575.6 | — | 0 B | 1259 |
| `demux/vp8_720p_10s` | 6.8 | 6.8 | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | 174.5 | 174.5 | — | 0 B | 10677 |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | 22.7 | 22.7 | — | — | — |
| `probe/huge_h264_1080p_600s` | 721.6 | 721.6 | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | 13.7 | 13.7 | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | 43.9 | 43.9 | 227.71× | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | 43.3 | 43.3 | — | — | 2680 |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | 96.7 | 96.7 | — | — | 2532 |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | 52.5 | 52.5 | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | 39.7 | 39.7 | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | 48.3 | 48.3 | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | 66.8 | 66.8 | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | 334.8 | 334.8 | — | 0 B | 8531 |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | 1813.8 | 1813.8 | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | 23.8 | 23.8 | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | 5.5 | 5.5 | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | 7.9 | 7.9 | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `decode-seek/decode_size_large_h264_120s` | 1221.1 | 1221.1 | — | 0 B | 2532 |
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
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | 5028.3 | 5028.3 | 0.99× | 0 B | 0 |

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
| `probe/h264_rotated90` | 1.5 | 1.5 | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | 7.5 | 7.5 | — | — | — |
| `transcode/multitrack_select_default_audio` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `transcode/selfcheck_h264_resize_720p_tie` | — | — | — | — | — |
| `transcode/flac_to_aac_mp4` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `probe/flac_noseektable` | 1.3 | 1.3 | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `decode-seek/decode_vp8` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `demux/realworld_mdn_trex_mp3` | 4 | 4 | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | 3.6 | 3.6 | — | — | — |
| `probe/h264_4k_10s` | 2.2 | 2.2 | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | 5 | 5 | 6048.39× | — | — |
| `probe/wav_s16` | 2.5 | 2.5 | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | 7.9 | 7.9 | — | — | — |
| `transcode/h264_rotate_180` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `probe/vp8_720p_10s` | 9.9 | 9.9 | — | — | — |
| `demux/h264_in_mkv` | 77.7 | 77.7 | — | — | — |
| `demux/wav_s16` | 3 | 3 | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | 95.4 | 95.4 | — | — | — |
| `probe/recorder_headerless` | 12.3 | 12.3 | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | 3.9 | 3.9 | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | 6.3 | 6.3 | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | 3.2 | 3.2 | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | 9.2 | 9.2 | — | — | — |
| `transcode/h264_resize_720p` | — | — | — | — | — |
| `decode-seek/meta_seek_vs_linear_decode` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `probe/mp3_xing` | 3.7 | 3.7 | — | — | — |
| `probe/vp9_1080p_10s` | 14.3 | 14.3 | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | 12 | 12 | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | — | — | — | — | — |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | — | — | — | — | — |
| `demux/hls_vod` | 279.9 | 279.9 | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | 10 | 10 | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | 4.9 | 4.9 | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | 10.2 | 10.2 | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | 10.8 | 10.8 | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | 71614.8 | 71614.8 | — | 0 B | — |
| `probe/massive_h264_1080p_2h` | 45.6 | 45.6 | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | 9.4 | 9.4 | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | 5983.4 | 5983.4 | — | 0 B | — |
| `transcode/h264_rotate_normalize` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | 2.8 | 2.8 | — | — | — |
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
| `probe/huge_vp9_1080p_240s` | 283.9 | 283.9 | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | 2.5 | 2.5 | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | 1.8 | 1.8 | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | 340.1 | 340.1 | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | 3.6 | 3.6 | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | 45.5 | 45.5 | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | 3.3 | 3.3 | — | — | — |
| `decode-seek/decode_mov_h264` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | 13.3 | 13.3 | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | 87.9 | 87.9 | — | 0 B | 2228 |
| `decode-seek/seek_h264_keyframe` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `demux/mp3_xing` | 8.6 | 8.6 | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | 1.9 | 1.9 | — | — | — |
| `probe/perf-extract-metadata-large` | 5.9 | 5.9 | — | — | — |
| `performance/size-ladder-iterate-packets-large` | 6050.1 | 6050.1 | 19.83× | — | — |
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
| `probe/tiny_h264_360p_2s` | 1.6 | 1.6 | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | 4.7 | 4.7 | 6430.87× | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | 9.9 | 9.9 | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | 12.8 | 12.8 | — | — | — |
| `probe/h264_1080p_5s` | 2.9 | 2.9 | — | — | — |
| `probe/hevc_1080p_10s` | 2.7 | 2.7 | — | — | — |
| `decode-seek/decode_multitrack_select_video` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | 74.3 | 74.3 | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | 4.5 | 4.5 | 2800.67× | — | — |
| `probe/h264_vfr` | 5.4 | 5.4 | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/flac_seektable` | 7.2 | 7.2 | — | — | — |
| `decode-seek/decode_bframes_reorder` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | 8.7 | 8.7 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | 4.5 | 4.5 | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | 86.6 | 86.6 | 83121.68× | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | 46581.5 | 46581.5 | 12.88× | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | 10.2 | 10.2 | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | — | — | — | — | — |
| `decode-seek/seek_repeated_same_target` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | 8.3 | 8.3 | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | 18.5 | 18.5 | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | 8.3 | 8.3 | 241.98× | — | — |
| `decode-seek/decode_h264_10bit` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | 100.1 | 100.1 | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | 6.9 | 6.9 | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | 437.6 | 437.6 | — | 0 B | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | 585.8 | 585.8 | — | 37.56 MiB | 10677 |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `decode-seek/decode_size_large_vp9_120s` | — | — | — | — | — |
| `decode-seek/seek_h264_nonkeyframe` | — | — | — | — | — |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | 5.6 | 5.6 | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | 8078.7 | 8078.7 | — | 0 B | 937 |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | 3.5 | 3.5 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | — | — | — | — | — |
| `demux/h264_ts` | 193.7 | 193.7 | — | — | — |
| `probe/realworld_mdn_flower_mp4` | 2.2 | 2.2 | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | 3.9 | 3.9 | — | — | — |
| `probe/av1_720p_5s` | 7.8 | 7.8 | — | — | — |
| `demux/wav_s24` | 10.4 | 10.4 | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | 8.2 | 8.2 | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | 2.4 | 2.4 | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | — | — | — | — | — |
| `metadata/read_flac_seektable` | 1.8 | 1.8 | — | — | — |
| `probe/metamorphic-duration-across-containers` | 14.6 | 14.6 | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | 3.2 | 3.2 | — | — | — |
| `transcode/vp9_to_h264_mp4` | — | — | — | — | — |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | — | — | — | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | 2.9 | 2.9 | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `probe/empty-audio-wav` | 1.5 | 1.5 | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | — |
| `demux/aac_adts` | 7.1 | 7.1 | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | 2.2 | 2.2 | — | 23.7 MiB | 0 |
| `decode-seek/decode_size_micro_h264_1frame` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | 9.8 | 9.8 | — | — | — |
| `performance/extract-metadata` | 2.2 | 2.2 | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | 5.3 | 5.3 | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | 59.1 | 59.1 | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | 2.3 | 2.3 | — | — | — |
| `probe/cenc_ctr` | 7.5 | 7.5 | — | — | — |
| `probe/h264_ts` | 231.5 | 231.5 | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | 280.8 | 280.8 | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | 7.7 | 7.7 | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | 12.5 | 12.5 | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | 61.2 | 61.2 | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | 92 | 92 | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | 2.8 | 2.8 | — | — | — |
| `decode-seek/decode_mkv_h264` | — | — | — | — | — |
| `demux/vp8_720p_10s` | 211.5 | 211.5 | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | — | — | — | — | — |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | 12.4 | 12.4 | — | — | — |
| `probe/huge_h264_1080p_600s` | 5.5 | 5.5 | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | 8.7 | 8.7 | — | — | — |
| `probe/realworld_mdn_trex_mp3` | 2.6 | 2.6 | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | 3.1 | 3.1 | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | 1679 | 1679 | 5.96× | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | — | — | — | — | — |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | 666.7 | 666.7 | — | — | — |
| `probe/hls_vod` | 297.5 | 297.5 | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | 463.1 | 463.1 | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | 3.3 | 3.3 | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | 21.8 | 21.8 | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | 4.4 | 4.4 | — | — | — |
| `metadata/read_mp3_xing` | 1.5 | 1.5 | — | — | — |
| `demux/vp9_1080p_10s` | 42.9 | 42.9 | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | 8.8 | 8.8 | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | 59.8 | 59.8 | — | — | — |
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
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | — | — | — | — | — |

**`remotion-webcodecs@4.0.479`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `decode-seek/seek_backward_then_forward` | 1573.6 | 1573.6 | — | — | 0 |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | 483.4 | 483.4 | — | 0 B | 937 |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `transcode/h264_resize_4k_to_1080p` | 1529 | 1529 | 6.54× | 0 B | 3833 |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | 5885.8 | 5885.8 | — | — | 11514 |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | 5.3 | 5.3 | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `transcode/ladder_large_h264_1080p_120s_resize_720p` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | 6.2 | 6.2 | — | — | — |
| `transcode/multitrack_select_default_audio` | 104.7 | 104.7 | 95.52× | 0 B | 0 |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `transcode/selfcheck_h264_resize_720p_tie` | 2610.1 | 2610.1 | — | — | — |
| `transcode/flac_to_aac_mp4` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `probe/flac_noseektable` | 2 | 2 | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `decode-seek/decode_vp8` | 321.7 | 321.7 | — | 143.38 MiB | 1259 |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | 35.3 | 35.3 | 141.68× | 0 B | 10677 |
| `demux/realworld_mdn_trex_mp3` | 2 | 2 | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | 14.3 | 14.3 | — | — | — |
| `probe/h264_4k_10s` | 3.6 | 3.6 | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | 1204 | 1204 | 24.92× | — | — |
| `probe/wav_s16` | 2.1 | 2.1 | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | 33 | 33 | 151.56× | 0 B | 0 |
| `transcode/ladder_tiny_h264_360p_resize_180p` | 204.2 | 204.2 | — | 0 B | — |
| `probe/perf-extract-metadata-huge` | 7.3 | 7.3 | — | — | — |
| `transcode/h264_rotate_180` | 4069.9 | 4069.9 | 7.37× | 0 B | 2228 |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `probe/vp8_720p_10s` | 12.9 | 12.9 | — | — | — |
| `demux/h264_in_mkv` | 62.6 | 62.6 | — | — | — |
| `demux/wav_s16` | 6.2 | 6.2 | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | 68.9 | 68.9 | — | — | — |
| `probe/recorder_headerless` | 11 | 11 | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | 281.9 | 281.9 | — | 0 B | 0 |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | 3.4 | 3.4 | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | 7.6 | 7.6 | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | 6 | 6 | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | 4.9 | 4.9 | — | — | — |
| `transcode/h264_resize_720p` | 3731.9 | 3731.9 | 8.04× | 0 B | 2921 |
| `decode-seek/meta_seek_vs_linear_decode` | 3480.4 | 3480.4 | — | 0 B | 8658 |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `probe/mp3_xing` | 2.4 | 2.4 | — | — | — |
| `probe/vp9_1080p_10s` | 13.3 | 13.3 | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | 20.7 | 20.7 | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | 936.3 | 936.3 | 10.69× | 0 B | 3833 |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | 1085.7 | 1085.7 | — | — | 0 |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | 482.8 | 482.8 | — | 0 B | 0 |
| `demux/hls_vod` | 313.2 | 313.2 | — | — | — |
| `transcode/av1_to_h264_mp4` | 308.1 | 308.1 | 16.26× | 39.26 MiB | 1259 |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | 86.1 | 86.1 | 116.08× | 0 B | 12973 |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | 5.4 | 5.4 | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | 6.4 | 6.4 | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | 9.7 | 9.7 | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | 70.7 | 70.7 | — | 0 B | 0 |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | 18.2 | 18.2 | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | 5.8 | 5.8 | — | 0 B | — |
| `probe/massive_h264_1080p_2h` | 46.4 | 46.4 | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | 8.6 | 8.6 | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | 5450.3 | 5450.3 | — | 21.67 MiB | — |
| `transcode/h264_rotate_normalize` | 79.2 | 79.2 | 126.25× | 0 B | 0 |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | 2.1 | 2.1 | — | — | — |
| `transcode/h264_to_hevc_mp4` | 6265.4 | 6265.4 | 4.79× | 0 B | 11948 |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `transcode/hevc_to_vp9_webm` | 1743.9 | 1743.9 | 5.73× | 44.41 MiB | 0 |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `transcode/h264_8bit_to_hevc_10bit` | — | — | — | — | — |
| `transcode/metamorphic_resize_same_1080p_idempotent` | 1182.5 | 1182.5 | 25.37× | 0 B | 0 |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `transcode/wav_to_mp3_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp8_webm` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_2x2_h264` | 4.2 | 4.2 | — | 0 B | 0 |
| `transcode/h264_two_pass_bitrate` | — | — | — | — | — |
| `decode-seek/decode_hevc` | 736 | 736 | — | 261.02 MiB | 0 |
| `probe/huge_vp9_1080p_240s` | 230.2 | 230.2 | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | 3.6 | 3.6 | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | 314.5 | 314.5 | — | — | 0 |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | 5001.9 | 5001.9 | 6× | 37.51 MiB | 11514 |
| `transcode/vp8_to_vp9_webm` | 90.5 | 90.5 | 34.07× | 0 B | 0 |
| `performance/convert-webm-resize-320x180` | 4311 | 4311 | — | — | — |
| `performance/encode-fps` | 5136.1 | 5136.1 | 5.84× | — | — |
| `probe/wav_s24` | 3.6 | 3.6 | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | 295.8 | 295.8 | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | 3.4 | 3.4 | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | 71.1 | 71.1 | — | — | — |
| `performance/decode-fps` | 1203.5 | 1203.5 | — | — | — |
| `remux/aac_adts_adts_to_mp4` | 115.7 | 115.7 | 86.71× | 0 B | 8658 |
| `metadata/read_h264_1080p_30s` | 5.1 | 5.1 | — | — | — |
| `decode-seek/decode_mov_h264` | 941.2 | 941.2 | — | 0 B | 0 |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | 19.3 | 19.3 | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | 54.1 | 54.1 | 92.37× | 0 B | 0 |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | 54.2 | 54.2 | — | 0 B | 0 |
| `decode-seek/seek_h264_keyframe` | 2103.2 | 2103.2 | — | — | 0 |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `demux/mp3_xing` | 5.6 | 5.6 | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `probe/micro_h264_1frame` | 3.1 | 3.1 | — | — | — |
| `probe/perf-extract-metadata-large` | 5.4 | 5.4 | — | — | — |
| `performance/size-ladder-iterate-packets-large` | 7793.1 | 7793.1 | 15.4× | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | 676.3 | 676.3 | — | 0 B | 0 |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `decode-seek/seek_av1_keyframe` | 254 | 254 | — | — | 8531 |
| `performance/convert-peak-memory` | 3750.4 | 3750.4 | — | 38.47 MiB | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | 3 | 3 | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | 1050.6 | 1050.6 | 28.55× | — | — |
| `performance/seek-ms` | 9460 | 9460 | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | 5.5 | 5.5 | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | 477.2 | 477.2 | 1257.44× | 0 B | 0 |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | 3.2 | 3.2 | — | — | — |
| `probe/h264_1080p_5s` | 7.1 | 7.1 | — | — | — |
| `probe/hevc_1080p_10s` | 4.6 | 4.6 | — | — | — |
| `decode-seek/decode_multitrack_select_video` | 478.5 | 478.5 | — | 37.26 MiB | 11514 |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | 191.2 | 191.2 | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | 86.9 | 86.9 | 115.12× | 28.81 MiB | 937 |
| `decode-seek/decode_h264_first_frames` | 1887.8 | 1887.8 | — | 0 B | 0 |
| `performance/metamorphic-vfr-iterate-packets` | 4.5 | 4.5 | 2803.8× | — | — |
| `probe/h264_vfr` | 3.2 | 3.2 | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | 10042.3 | 10042.3 | — | — | 0 |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | 5.3 | 5.3 | — | 0 B | 0 |
| `demux/size_huge_huge_h264_1080p_600s` | 38.7 | 38.7 | — | 47.89 MiB | 11514 |
| `demux/flac_seektable` | 9.4 | 9.4 | — | — | — |
| `decode-seek/decode_bframes_reorder` | 1324.1 | 1324.1 | — | 502.03 MiB | 937 |
| `demux/size_tiny_tiny_h264_360p_2s` | 8.5 | 8.5 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | 5159.1 | 5159.1 | 5.81× | 0 B | 0 |
| `decode-seek/decode_size_tiny_h264_360p` | 208 | 208 | — | 0 B | 12973 |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | 1.6 | 1.6 | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | 62.8 | 62.8 | — | — | 0 |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | 41.8 | 41.8 | 172207.61× | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | 1861.7 | 1861.7 | — | — | 3833 |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | 75.5 | 75.5 | 132.88× | 0 B | 0 |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | 433.3 | 433.3 | — | 308.08 MiB | 12973 |
| `performance/size-ladder-iterate-packets-huge` | 4.6 | 4.6 | 129589.63× | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | 9.4 | 9.4 | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | 87 | 87 | — | 0 B | 0 |
| `decode-seek/seek_repeated_same_target` | 3767.6 | 3767.6 | — | — | 8658 |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | 167.4 | 167.4 | 59.75× | 0 B | 10107 |
| `probe/metamorphic-recorder-headerless-sane-duration` | 11.8 | 11.8 | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | 11.5 | 11.5 | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | 3085.8 | 3085.8 | — | — | 3833 |
| `performance/size-ladder-iterate-packets-tiny` | 9 | 9 | 221.73× | — | — |
| `decode-seek/decode_h264_10bit` | 479.2 | 479.2 | — | 0 B | 0 |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | 72 | 72 | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | 672.5 | 672.5 | 14.9× | 27.99 MiB | 0 |
| `performance/op-sweep-transcode-webm` | 4249.3 | 4249.3 | 7.06× | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | 12.7 | 12.7 | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | 399.7 | 399.7 | — | 0 B | — |
| `performance/metamorphic-transcode-idempotent-source-res` | 5129.1 | 5129.1 | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | 392.8 | 392.8 | — | 0 B | 0 |
| `audio-dsp/edge_longform_audio_resample_16k` | 14685 | 14685 | — | 0 B | 0 |
| `decode-seek/decode_size_large_vp9_120s` | 1230.7 | 1230.7 | — | 498.3 MiB | 0 |
| `decode-seek/seek_h264_nonkeyframe` | 4218.3 | 4218.3 | — | — | 1259 |
| `transcode/hevc_to_h264_mp4` | 1024.4 | 1024.4 | 9.76× | 40.27 MiB | 2228 |
| `probe/longform_1h_audio` | 13.6 | 13.6 | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | 17548.9 | 17548.9 | — | 0 B | 11514 |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | 5.8 | 5.8 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | 3031.6 | 3031.6 | — | 985.73 MiB | 8531 |
| `demux/h264_ts` | 183.5 | 183.5 | — | — | — |
| `probe/realworld_mdn_flower_mp4` | 5.6 | 5.6 | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | 24.2 | 24.2 | — | — | — |
| `probe/av1_720p_5s` | 11.2 | 11.2 | — | — | — |
| `demux/wav_s24` | 4.4 | 4.4 | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | 4364 | 4364 | 6.87× | — | — |
| `decode-seek/decode_extreme_fps_1` | 22.5 | 22.5 | — | 0 B | 0 |
| `metadata/read_no_tags_recorder_webm` | 16.7 | 16.7 | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | 2.5 | 2.5 | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `transcode/aac_to_opus_webm` | 109.7 | 109.7 | 91.47× | 0 B | 0 |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | 1158.6 | 1158.6 | — | 498.87 MiB | 0 |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | 565.1 | 565.1 | — | — | 0 |
| `metadata/read_flac_seektable` | 5.1 | 5.1 | — | — | — |
| `probe/metamorphic-duration-across-containers` | 12 | 12 | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | 3.8 | 3.8 | — | — | — |
| `transcode/vp9_to_h264_mp4` | 1292 | 1292 | 7.75× | 41.14 MiB | 3833 |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | 217.9 | 217.9 | — | 0 B | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | 7.2 | 7.2 | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `transcode/wav_to_opus_ogg` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `probe/empty-audio-wav` | 1.1 | 1.1 | — | — | — |
| `transcode/bframe_reorder_h264_to_h264` | — | — | — | — | — |
| `demux/aac_adts` | 6.4 | 6.4 | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | 3.3 | 3.3 | — | 26.14 MiB | 0 |
| `decode-seek/decode_size_micro_h264_1frame` | 3.9 | 3.9 | — | 0 B | 0 |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | 11.1 | 11.1 | — | — | — |
| `performance/extract-metadata` | 3.7 | 3.7 | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | 4.4 | 4.4 | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | 55.9 | 55.9 | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | 4 | 4 | — | — | — |
| `probe/cenc_ctr` | 8 | 8 | — | — | — |
| `probe/h264_ts` | 188.7 | 188.7 | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | 721 | 721 | 13.9× | 0 B | 3833 |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | 71.4 | 71.4 | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | 1176.7 | 1176.7 | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | 11.7 | 11.7 | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | 340.4 | 340.4 | — | 0 B | 0 |
| `probe/perf-extract-metadata-massive` | 101.8 | 101.8 | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | 96.7 | 96.7 | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | 16.9 | 16.9 | 295.95× | 24.49 MiB | 0 |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | 5.6 | 5.6 | — | — | — |
| `decode-seek/decode_mkv_h264` | 475.5 | 475.5 | — | 0 B | 0 |
| `demux/vp8_720p_10s` | 154.3 | 154.3 | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | 143 | 143 | — | 107.96 MiB | 937 |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | 14.5 | 14.5 | — | — | — |
| `probe/huge_h264_1080p_600s` | 6.8 | 6.8 | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | 52.4 | 52.4 | 95.41× | 0 B | 0 |
| `demux/flac_noseektable` | 7.2 | 7.2 | — | — | — |
| `probe/realworld_mdn_trex_mp3` | 2.3 | 2.3 | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | 3.2 | 3.2 | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | 379.7 | 379.7 | 26.34× | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | 335.8 | 335.8 | — | — | 2228 |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | 2462.4 | 2462.4 | — | — | 11514 |
| `remux/vp9_1080p_10s_webm_to_webm` | 125.2 | 125.2 | 79.95× | 0 B | 3833 |
| `demux/h264_4k_10s` | 688.1 | 688.1 | — | — | — |
| `probe/hls_vod` | 311.7 | 311.7 | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | 972 | 972 | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | 3.8 | 3.8 | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | 1046.3 | 1046.3 | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | 324.9 | 324.9 | — | 0 B | 0 |
| `remux/prop_adts_to_mp4_duration_invariant` | 81.9 | 81.9 | — | 0 B | 0 |
| `transcode/av1_to_vp9_webm` | 720.2 | 720.2 | 6.95× | 38.43 MiB | 12973 |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | 52.3 | 52.3 | — | — | — |
| `metadata/read_mp3_xing` | 2 | 2 | — | — | — |
| `demux/vp9_1080p_10s` | 60.4 | 60.4 | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | 5095.8 | 5095.8 | 5.89× | 0 B | 0 |
| `probe/vp9_alpha` | 5.4 | 5.4 | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | 7632.9 | 7632.9 | 3.93× | 0 B | 10815 |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | 28.5 | 28.5 | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `decode-seek/decode_size_large_h264_120s` | 11261.9 | 11261.9 | — | 0 B | 8658 |
| `transcode/gapless_pcm_to_aac_priming` | 65.2 | 65.2 | — | 0 B | 0 |
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
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | — | — | — | — | — |

**`web-demuxer@4.0.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `decode-seek/seek_backward_then_forward` | 95.3 | 95.3 | — | — | 0 |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `decode-seek/decode_vfr_timing` | 675.2 | 675.2 | — | 0 B | 11514 |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `transcode/h264_resize_4k_to_1080p` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `transcode/ladder_large_vp9_1080p_120s_to_h264_720p` | — | — | — | — | — |
| `probe/h264_rotated90` | 19.6 | 19.6 | — | — | — |
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
| `decode-seek/decode_vp8` | 257 | 257 | — | 0 B | 0 |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `demux/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | 21.7 | 21.7 | — | — | — |
| `probe/h264_4k_10s` | 56.2 | 56.2 | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `transcode/h264_10bit_to_h264_8bit` | — | — | — | — | — |
| `transcode/hevc_to_av1_webm` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | 4.6 | 4.6 | 6521.74× | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `transcode/h264_vfr_to_cfr_30` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `transcode/ladder_tiny_h264_360p_resize_180p` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | 54.8 | 54.8 | — | — | — |
| `transcode/h264_rotate_180` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `transcode/h264_flip_vertical` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `probe/vp8_720p_10s` | 7.6 | 7.6 | — | — | — |
| `demux/h264_in_mkv` | 425.4 | 425.4 | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | 526.5 | 526.5 | — | — | — |
| `probe/recorder_headerless` | 8.2 | 8.2 | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `decode-seek/meta_vfr_seek_lands_on_true_pts` | 109.2 | 109.2 | — | 0 B | 10107 |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | 27.5 | 27.5 | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | 12.2 | 12.2 | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `probe/realworld_mdn_flower_webm` | 8.1 | 8.1 | — | — | — |
| `transcode/h264_resize_720p` | — | — | — | — | — |
| `decode-seek/meta_seek_vs_linear_decode` | 88.9 | 88.9 | — | 0 B | 0 |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp9_keepalpha` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | 36.8 | 36.8 | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `transcode/roundtrip_leg2_vp9_to_h264` | — | — | — | — | — |
| `decode-seek/meta_decode_remux_eq_decode_anchored` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |
| `decode-seek/seek_negative` | 77.7 | 77.7 | — | — | 2921 |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `decode-seek/decode_vp9` | 644.2 | 644.2 | — | 0 B | 0 |
| `demux/hls_vod` | — | — | — | — | — |
| `transcode/av1_to_h264_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | 25.8 | 25.8 | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | 26.4 | 26.4 | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | 35.1 | 35.1 | — | — | — |
| `transcode/gapless_pcm_to_opus_priming` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `probe/h264_in_mkv` | 55.2 | 55.2 | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `transcode/h264_rotate_90_dimswap` | — | — | — | — | — |
| `transcode/h264_fps_15_to_30` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | 8 | 8 | — | 0 B | — |
| `probe/massive_h264_1080p_2h` | 296.3 | 296.3 | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | 6239.4 | 6239.4 | — | 0 B | — |
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
| `decode-seek/decode_tiny_dims_2x2_h264` | 8.2 | 8.2 | — | 0 B | 0 |
| `transcode/h264_two_pass_bitrate` | — | — | — | — | — |
| `decode-seek/decode_hevc` | 633.3 | 633.3 | — | 0 B | 0 |
| `probe/huge_vp9_1080p_240s` | 39.7 | 39.7 | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `performance/op-sweep-probe` | 23.2 | 23.2 | — | — | — |
| `decode-seek/seek_mkv_h264_keyframe` | 118.6 | 118.6 | — | — | 0 |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `transcode/h264_bitrate_2mbps` | — | — | — | — | — |
| `transcode/vp8_to_vp9_webm` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | 715.9 | 715.9 | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | 16.6 | 16.6 | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `transcode/av_downmix_stereo_to_mono` | — | — | — | — | — |
| `demux/h264_1080p_5s` | 382.7 | 382.7 | — | — | — |
| `performance/decode-fps` | 328.9 | 328.9 | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | 24.7 | 24.7 | — | — | — |
| `decode-seek/decode_mov_h264` | 1180.4 | 1180.4 | — | 0 B | 0 |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `demux/realworld_mdn_flower_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `transcode/h264_fps_30_to_15` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | 46.4 | 46.4 | — | 0 B | 937 |
| `decode-seek/seek_h264_keyframe` | 137.6 | 137.6 | — | — | 11948 |
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
| `probe/micro_h264_1frame` | 6.7 | 6.7 | — | — | — |
| `probe/perf-extract-metadata-large` | 29.7 | 29.7 | — | — | — |
| `performance/size-ladder-iterate-packets-large` | 6266.1 | 6266.1 | 19.15× | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `transcode/h264_flip_horizontal` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `decode-seek/seek_av1_keyframe` | 49.1 | 49.1 | — | — | 0 |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | 10.5 | 10.5 | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `performance/op-sweep-demux` | 6.5 | 6.5 | 4622.5× | — | — |
| `performance/seek-ms` | 99.4 | 99.4 | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `transcode/bframe_reorder_h264_to_vp9` | — | — | — | — | — |
| `transcode/vp9_alpha_to_vp8_keepalpha` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | 7.4 | 7.4 | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `probe/h264_1080p_5s` | 29 | 29 | — | — | — |
| `probe/hevc_1080p_10s` | 8.7 | 8.7 | — | — | — |
| `decode-seek/decode_multitrack_select_video` | 311.2 | 311.2 | — | 142.02 MiB | 8658 |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `transcode/opus_to_aac_mp4` | — | — | — | — | — |
| `demux/h264_rotated90` | 318.6 | 318.6 | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `transcode/mp3_to_aac_mp4` | — | — | — | — | — |
| `decode-seek/decode_h264_first_frames` | 1230.1 | 1230.1 | — | 0 B | 0 |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `probe/h264_vfr` | 21.2 | 21.2 | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `transcode/fanout_h264_abr_ladder` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `decode-seek/seek_past_eof` | 132 | 132 | — | — | 0 |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/decode_tiny_dims_1x1` | 15.9 | 15.9 | — | 0 B | 10107 |
| `demux/size_huge_huge_h264_1080p_600s` | 16.6 | 16.6 | — | 46.35 MiB | 1259 |
| `demux/flac_seektable` | — | — | — | — | — |
| `decode-seek/decode_bframes_reorder` | 1200.5 | 1200.5 | — | 0 B | 1103 |
| `demux/size_tiny_tiny_h264_360p_2s` | 34.9 | 34.9 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `transcode/h264_to_vp9_webm` | — | — | — | — | — |
| `decode-seek/decode_size_tiny_h264_360p` | 109.7 | 109.7 | — | 87.46 MiB | 0 |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `transcode/h264_to_ts` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `transcode/h264_crop_center` | — | — | — | — | — |
| `decode-seek/seek_vp8_keyframe` | 48.4 | 48.4 | — | — | 0 |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | 59.8 | 59.8 | 120451.69× | — | — |
| `probe/opus` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `decode-seek/seek_hevc_keyframe` | 68.4 | 68.4 | — | — | 3833 |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `transcode/aac_to_pcm_wav_extract` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `decode-seek/decode_av1` | 277.4 | 277.4 | — | 0 B | 11514 |
| `performance/size-ladder-iterate-packets-huge` | 5.9 | 5.9 | 102127.66× | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `transcode/hdr10_to_sdr_tonemap` | — | — | — | — | — |
| `probe/cenc_cbcs` | 15 | 15 | — | — | — |
| `decode-seek/decode_size_tiny_vp9_360p` | 123.8 | 123.8 | — | 0 B | 0 |
| `decode-seek/seek_repeated_same_target` | 100.5 | 100.5 | — | — | 10815 |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `transcode/mp3_to_opus_webm` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | 10.3 | 10.3 | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | 42.5 | 42.5 | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `transcode/wav_to_vorbis_ogg` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `decode-seek/seek_zero` | 95.1 | 95.1 | — | — | 11514 |
| `performance/size-ladder-iterate-packets-tiny` | 34.8 | 34.8 | 57.41× | — | — |
| `decode-seek/decode_h264_10bit` | 465 | 465 | — | 0 B | 0 |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `demux/realworld_mdn_flower_webm` | 69.7 | 69.7 | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | 48.6 | 48.6 | — | — | — |
| `transcode/h264_rotate_270_dimswap` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | 1526.5 | 1526.5 | — | 0 B | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | 6952.9 | 6952.9 | — | 0 B | 0 |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `decode-seek/decode_size_large_vp9_120s` | 1218.7 | 1218.7 | — | 0 B | 0 |
| `decode-seek/seek_h264_nonkeyframe` | 146.8 | 146.8 | — | — | 0 |
| `transcode/hevc_to_h264_mp4` | — | — | — | — | — |
| `probe/longform_1h_audio` | 34.1 | 34.1 | — | — | — |
| `transcode/h264_pad_letterbox_4x3_to_16x9` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | 6422 | 6422 | — | 0 B | 0 |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | 10.7 | 10.7 | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `transcode/extreme_fps_240` | — | — | — | — | — |
| `decode-seek/decode_h264_4k` | 2162.3 | 2162.3 | — | 0 B | 0 |
| `demux/h264_ts` | — | — | — | — | — |
| `probe/realworld_mdn_flower_mp4` | 41.1 | 41.1 | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | 9.8 | 9.8 | — | — | — |
| `probe/av1_720p_5s` | 5.8 | 5.8 | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_1` | 33.7 | 33.7 | — | 0 B | 0 |
| `metadata/read_no_tags_recorder_webm` | 10.1 | 10.1 | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `transcode/vp9_to_vp8_webm` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `transcode/aac_to_opus_webm` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `decode-seek/meta_pts_monotonic_after_reorder` | 1211.5 | 1211.5 | — | 0 B | 937 |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `decode-seek/seek_vp9_keyframe` | 105.9 | 105.9 | — | — | 0 |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | 86.2 | 86.2 | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `probe/micro_audio_short` | 14.9 | 14.9 | — | — | — |
| `transcode/vp9_to_h264_mp4` | — | — | — | — | — |
| `transcode/ladder_tiny_vp9_360p_to_h264_180p` | — | — | — | — | — |
| `decode-seek/decode_vp9_alpha` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | 21.8 | 21.8 | — | — | — |
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
| `decode-seek/decode_size_micro_h264_1frame` | 11.3 | 11.3 | — | 0 B | 0 |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | 60.4 | 60.4 | — | — | — |
| `performance/extract-metadata` | 23.6 | 23.6 | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | 19.6 | 19.6 | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | 309 | 309 | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `transcode/h264_to_av1_mp4` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `probe/h264_1080p_30s` | 21.6 | 21.6 | — | — | — |
| `probe/cenc_ctr` | 22.5 | 22.5 | — | — | — |
| `probe/h264_ts` | 481.9 | 481.9 | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `transcode/flac_to_opus_webm` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | 552.4 | 552.4 | — | — | — |
| `transcode/h264_fps_30_to_60` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `demux/h264_1080p_30s` | 3.3 | 3.3 | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `demux/vp9_alpha` | 52.9 | 52.9 | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `decode-seek/decode_rotated_display_matrix` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | 304.6 | 304.6 | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `transcode/h264_colorspace_709_to_2020` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `transcode/hevc_to_vp8_webm` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `transcode/wav_to_flac` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | 40.3 | 40.3 | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_size_huge_h264_600s` | 1159.1 | 1159.1 | — | 0 B | 0 |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | 27.2 | 27.2 | — | — | — |
| `decode-seek/decode_mkv_h264` | 774.4 | 774.4 | — | 0 B | 12973 |
| `demux/vp8_720p_10s` | 115.3 | 115.3 | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `decode-seek/decode_extreme_fps_240` | 135.9 | 135.9 | — | 0 B | 0 |
| `transcode/h264_crf_quality_mode` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `transcode/h264_to_mov` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | 37.1 | 37.1 | — | — | — |
| `probe/huge_h264_1080p_600s` | 58 | 58 | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `transcode/wav_to_aac_mp4` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `probe/realworld_mdn_trex_mp3` | — | — | — | — | — |
| `transcode/h264_to_fragmented_mp4` | — | — | — | — | — |
| `probe/h264_multitrack` | 18 | 18 | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | 1805.8 | 1805.8 | 5.54× | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `decode-seek/seek_vfr_arbitrary` | 104.6 | 104.6 | — | — | 3833 |
| `transcode/aac_to_mp3_mp4` | — | — | — | — | — |
| `decode-seek/seek_bframes_midgop` | 236.8 | 236.8 | — | — | 0 |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `demux/h264_4k_10s` | 1566.2 | 1566.2 | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `transcode/vp9_to_av1_webm` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | 55.4 | 55.4 | — | — | — |
| `transcode/extreme_fps_1` | — | — | — | — | — |
| `performance/iterate-video-packets` | 4.1 | 4.1 | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `decode-seek/decode_open_gop_first_frame` | 409.9 | 409.9 | — | 0 B | 10815 |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `transcode/av1_to_vp9_webm` | — | — | — | — | — |
| `transcode/h264_to_mkv` | — | — | — | — | — |
| `probe/massive_vp9_1080p_2h` | 31.7 | 31.7 | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | 713 | 713 | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `transcode/metamorphic_duration_preserved_h264_to_vp9` | — | — | — | — | — |
| `probe/vp9_alpha` | 16 | 16 | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `transcode/roundtrip_leg1_h264_to_vp9` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `demux/av1_720p_5s` | 141.2 | 141.2 | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `transcode/vp8_to_h264_mp4` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `decode-seek/decode_size_large_h264_120s` | 1168.8 | 1168.8 | — | 0 B | 3833 |
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
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | — | — | — | — | — |


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
| `transcode/video_only_h264_resize_360p_to_vp9_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

## 5. Per-engine scorecard

| Engine | Conformance % | Pass / applicable | Perf idx (chromium) | Capability breadth | Robustness % |
| --- | --- | --- | --- | --- | --- |
| `aibrush-media@dev` | 0% | 0 / 0 | — | 0 (—) | 0% (0/60) |
| `ffmpeg.wasm@0.12.15` | 100% | 487 / 487 | — | 13 (audio-dsp, decode-seek, demux, encryption, metadata, mux, performance, probe, remux, robustness, streaming-output, transcode, trim) | 91.7% (55/60) |
| `mediabunny@1.48.0` | 100% | 493 / 493 | — | 13 (audio-dsp, decode-seek, demux, encryption, metadata, mux, performance, probe, remux, robustness, streaming-output, transcode, trim) | 93.3% (56/60) |
| `mp4box@2.3.0` | 100% | 105 / 105 | — | 8 (demux, metadata, mux, performance, probe, remux, robustness, streaming-output) | 36.7% (22/60) |
| `platform@chrome-149` | 100% | 180 / 180 | — | 8 (audio-dsp, decode-seek, demux, metadata, performance, probe, robustness, transcode) | 46.7% (28/60) |
| `remotion-media-parser@4.0.479` | 100% | 156 / 156 | — | 6 (audio-dsp, demux, metadata, performance, probe, robustness) | 56.7% (34/60) |
| `remotion-webcodecs@4.0.479` | 100% | 267 / 267 | — | 9 (audio-dsp, decode-seek, demux, metadata, performance, probe, remux, robustness, transcode) | 70% (42/60) |
| `web-demuxer@4.0.0` | 100% | 163 / 163 | — | 6 (decode-seek, demux, metadata, performance, probe, robustness) | 50% (30/60) |

_Perf index = geometric mean of throughput ratios vs reference, per browser, over co-passing scenarios. >1.00× = faster than reference on average; null/— = no co-passing scenario to compare._

## Caveats (read before quoting any number)

- Browser numbers are INDICATIVE only. They depend on GPU, OS, drivers, and thermal state; a measurement made on one machine does not transfer to another.
- NEVER compare a raw number across browsers or across machines. Every delta in this report is "vs the reference engine, on the SAME browser, on the same corpus." Cross-browser comparison is invalid by construction — that is why the report is grouped by browser.
- Hardware codec sessions are the real parallelism ceiling, not navigator.hardwareConcurrency. Contention for a limited number of hardware decode/encode sessions can dominate timing for codec-bound workloads.
- No measurement -> no claim. No green correctness oracle -> no admissible benchmark: a perf number is reported only after the engine produced correct output for that engine x browser x scenario. A speedup with wrong output is a regression, not a win.
- N/A = not supported by the framework, browser/runtime, or currently available corpus assets. The machine-readable report.json keeps the internal not-applicable statuses distinct; the human-facing table intentionally folds them into one marker.
- Runs assume AC power and a quiesced machine. Differences within the noise band are reported as within-noise and are NOT claimed as improvements or regressions.
