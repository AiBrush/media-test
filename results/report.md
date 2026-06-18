# Browser Media-Engine Benchmark Report

Reference engine: `mediabunny` · Suite 0.1.0 · Generated 2026-06-18T14:01:02.096Z

Engines: `aibrush-media@dev`, `ffmpeg.wasm@0.12.15`, `mediabunny@1.48.0`, `mp4box@2.3.0`, `platform@chrome-149`, `remotion-media-parser@4.0.479`, `remotion-webcodecs@4.0.479`, `web-demuxer@4.0.0` · Browsers: chromium, brave · Scenarios: 338

All deltas are **within a single browser, vs the reference engine, on the same corpus.** Numbers are never compared across browsers (see Caveats).

> **Reading the matrix:** every completed cell shows **Pass (<execution time>)** when the operation ran correctly, or **N/A** when the engine or browser/runtime cannot support that case. Machine-readable `report.json` keeps the internal status distinction.

## 🏆 Leaderboard

| # | Engine | Wins | Conf % | Robust % | Bundle | Breadth | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `mediabunny@1.48.0` | 28 (27 unc.) | 31.1% | — | 165.2 kB | 7 | 28 wins (1 contested, 27 uncontested) · perf 1× vs winners · 31.1% conformant · 165.2 kB bundle |
| 2 | `remotion-webcodecs@4.0.479` | 7 (7 unc.) | 46.5% | — | 94 kB | 6 | 7 wins (0 contested, 7 uncontested) · perf 0.15× vs winners · 46.5% conformant · 94 kB bundle |
| 3 | `mp4box@2.3.0` | 3 (2 unc.) | 63% | — | 41.3 kB | 5 | 3 wins (1 contested, 2 uncontested) · perf 0.25× vs winners · 63% conformant · 41.3 kB bundle |
| 4 | `ffmpeg.wasm@0.12.15` | 2 | 75% | — | 1.4 kB | 1 | 2 wins · perf 0.74× vs winners · 75% conformant · 1.4 kB bundle |
| 5 | `web-demuxer@4.0.0` | 2 (2 unc.) | 37.1% | — | 43.2 kB | 4 | 2 wins (0 contested, 2 uncontested) · perf 0.22× vs winners · 37.1% conformant · 43.2 kB bundle |
| 6 | `remotion-media-parser@4.0.479` | 1 | 53.8% | — | 72.6 kB | 4 | 1 win · perf 0.06× vs winners · 53.8% conformant · 72.6 kB bundle |
| 7 | `platform@chrome-149` | 0 | 47.2% | — | — | 4 | 0 wins · perf 0.9× vs winners · 47.2% conformant |
| 8 | `aibrush-media@dev` | 0 | 0% | — | — | 0 | 0 wins · 0% conformant |

_Wins = cases where the engine was the fastest CORRECT engine; co-winners of a tie both count, "unc." = uncontested (the only eligible engine). Win COUNTS are aggregated across browsers (counts are safe to sum; raw timing numbers are not — see Caveats). Ranked by wins, then conformance._

## Conformance summary (context)

| Engine | chromium conf % | brave conf % |
| --- | --- | --- |
| `aibrush-media@dev` | 0% | 0% |
| `ffmpeg.wasm@0.12.15` | 75% | 0% |
| `mediabunny@1.48.0` | 28.5% | 100% |
| `mp4box@2.3.0` | 63% | 0% |
| `platform@chrome-149` | 46.6% | 100% |
| `remotion-media-parser@4.0.479` | 53.8% | 0% |
| `remotion-webcodecs@4.0.479` | 46.5% | 0% |
| `web-demuxer@4.0.0` | 37.1% | 0% |

## Browser: chromium

### 1. Result matrix — display value per engine × case

_Each completed cell is formatted as `Pass (<execution time>)` or `N/A`. Indicative for this browser only — never compared across browsers (see Caveats)._

| Case | Primary metric | aibrush-media@dev | ffmpeg.wasm@0.12.15 | mediabunny@1.48.0 | mp4box@2.3.0 | platform@chrome-149 | remotion-media-parser@4.0.479 | remotion-webcodecs@4.0.479 | web-demuxer@4.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/caf_container_probe` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_5_1_to_stereo` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_stereo_to_mono` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_empty_audio_transcode` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_gapless_aac_decode` | — | N/A | — | ERROR | N/A | ERROR | N/A | FAIL | ERROR |
| `audio-dsp/edge_longform_audio_probe` | — | N/A | — | ERROR | N/A | N/A | ERROR | ERROR | N/A |
| `audio-dsp/edge_longform_audio_resample_16k` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_variable_channel_count_downmix` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fade_in_out_f32` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_half_f32` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_minus6db_s16` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/negative_image_into_audio_transcode` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_f32_to_s16` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16_to_f32` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16be_to_s16le` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16le_to_s16be` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_f32` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_s16` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24be_to_s16le` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_44k1_to_48k` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_16k` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_44k1` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s16be` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s24` | — | N/A | — | ERROR | N/A | N/A | N/A | FAIL | N/A |
| `audio-dsp/throughput_encode_s16be` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s24` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/upmix_mono_to_stereo` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/upmix_stereo_to_5_1` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/aac_adts` | — | N/A | — | Pass (7 ms) | N/A | N/A | Pass (13 ms) | Pass (10 ms) | N/A |
| `demux/av1_720p_5s` | — | N/A | — | Pass (16 ms) | N/A | Pass (11 ms) | Pass (43 ms) | Pass (35 ms) | ERROR |
| `demux/empty_audio_zero_packets` | — | N/A | — | Pass (3 ms) | N/A | N/A | Pass (3 ms) | Pass (4 ms) | N/A |
| `demux/flac_noseektable` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/flac_seektable` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_30s` | — | N/A | — | Pass (67 ms) | Pass (74 ms) | Pass (74 ms) | Pass (1.15 s) | Pass (6.66 s) | ERROR |
| `demux/h264_1080p_5s` | — | N/A | — | Pass (17 ms) | Pass (17 ms) | Pass (25 ms) | N/A | Pass (166 ms) | ERROR |
| `demux/h264_4k_10s` | — | N/A | — | Pass (53 ms) | Pass (56 ms) | Pass (63 ms) | Pass (478 ms) | Pass (2.07 s) | ERROR |
| `demux/h264_bframes_1080p` | — | N/A | — | FAIL | Pass (33 ms) | Pass (38 ms) | FAIL | FAIL | ERROR |
| `demux/h264_in_mkv` | — | N/A | — | Pass (20 ms) | N/A | Pass (20 ms) | N/A | Pass (82 ms) | ERROR |
| `demux/h264_multitrack` | wall (ms) | N/A | — | Pass (16 ms) | Pass (24 ms) | Pass (24 ms) | Pass (163 ms) | Pass (177 ms) | Pass (145 ms) |
| `demux/h264_rotated90` | — | N/A | — | Pass (14 ms) | Pass (20 ms) | Pass (18 ms) | Pass (110 ms) | Pass (115 ms) | ERROR |
| `demux/h264_ts` | — | N/A | — | Pass (88 ms) | N/A | N/A | FAIL | FAIL | ERROR |
| `demux/h264_vfr` | — | N/A | — | FAIL | Pass (15 ms) | Pass (17 ms) | FAIL | FAIL | ERROR |
| `demux/hevc_1080p_10s` | — | N/A | — | Pass (28 ms) | Pass (44 ms) | Pass (47 ms) | Pass (352 ms) | Pass (1.07 s) | ERROR |
| `demux/hls_aes128` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_vod` | — | N/A | — | ERROR | N/A | N/A | ERROR | ERROR | N/A |
| `demux/metamorphic_flac_seektable_invariance` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_cbr_notoc` | — | N/A | — | Pass (11 ms) | N/A | N/A | Pass (14 ms) | Pass (11 ms) | N/A |
| `demux/mp3_xing` | — | N/A | — | Pass (7 ms) | N/A | N/A | FAIL | FAIL | N/A |
| `demux/opus` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `demux/pcm_s16be` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_huge_huge_h264_1080p_600s` | — | N/A | — | ERROR | ERROR | ERROR | N/A | ERROR | ERROR |
| `demux/size_large_large_h264_1080p_120s` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `demux/size_large_large_vp9_1080p_120s` | — | N/A | — | ERROR | N/A | ERROR | ERROR | ERROR | ERROR |
| `demux/size_massive_massive_h264_1080p_2h` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `demux/size_micro_micro_audio_short` | — | N/A | — | Pass (4 ms) | Pass (3 ms) | Pass (4 ms) | Pass (10 ms) | Pass (4 ms) | Pass (27 ms) |
| `demux/size_micro_micro_h264_1frame` | — | N/A | — | Pass (4 ms) | Pass (7 ms) | Pass (7 ms) | Pass (5 ms) | Pass (4 ms) | Pass (43 ms) |
| `demux/size_tiny_tiny_h264_360p_2s` | — | N/A | — | Pass (4 ms) | Pass (4 ms) | Pass (9 ms) | Pass (16 ms) | Pass (13 ms) | ERROR |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | N/A | — | Pass (4 ms) | N/A | Pass (5 ms) | Pass (12 ms) | Pass (12 ms) | ERROR |
| `demux/vp8_720p_10s` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | ERROR |
| `demux/vp9_1080p_10s` | — | N/A | — | Pass (37 ms) | N/A | Pass (38 ms) | Pass (98 ms) | Pass (63 ms) | ERROR |
| `demux/vp9_alpha` | — | N/A | — | Pass (12 ms) | N/A | Pass (6 ms) | Pass (17 ms) | Pass (16 ms) | Pass (57 ms) |
| `demux/wav_f32` | — | N/A | — | FAIL | N/A | N/A | ERROR | ERROR | N/A |
| `demux/wav_s16` | — | N/A | — | FAIL | N/A | N/A | FAIL | FAIL | N/A |
| `demux/wav_s24` | — | N/A | — | FAIL | N/A | N/A | FAIL | FAIL | N/A |
| `encryption/cenc_cbcs_decrypt` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_cens_decrypt_na` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `encryption/clearkey_decrypt_na` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_sample_aes_decrypt_na` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `encryption/unencrypted_left_untouched_noop` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/meta_consistent_mp4_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_flac_seektable` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_30s` | — | N/A | — | Pass (36 ms) | Pass (53 ms) | Pass (59 ms) | Pass (46 ms) | Pass (11 ms) | Pass (73 ms) |
| `metadata/read_h264_1080p_5s` | — | N/A | — | Pass (8 ms) | Pass (8 ms) | Pass (12 ms) | N/A | FAIL | FAIL |
| `metadata/read_h264_in_mkv` | — | N/A | — | Pass (12 ms) | N/A | FAIL | N/A | FAIL | FAIL |
| `metadata/read_h264_multitrack` | — | N/A | — | Pass (10 ms) | Pass (13 ms) | Pass (19 ms) | Pass (9 ms) | Pass (6 ms) | Pass (47 ms) |
| `metadata/read_mp3_xing` | — | N/A | — | Pass (4 ms) | N/A | N/A | Pass (12 ms) | Pass (4 ms) | N/A |
| `metadata/read_no_tags_recorder_webm` | — | N/A | — | ERROR | N/A | ERROR | ERROR | ERROR | ERROR |
| `metadata/read_no_tags_wav` | — | N/A | — | Pass (9 ms) | N/A | N/A | Pass (11 ms) | Pass (5 ms) | N/A |
| `metadata/read_opus` | — | N/A | — | Pass (7 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_pcm_s16be` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_vp9_1080p_10s` | — | N/A | — | Pass (22 ms) | N/A | FAIL | FAIL | FAIL | Pass (60 ms) |
| `metadata/rotation_decode_read_h264_rotated90` | wall (ms) | N/A | — | Pass (102 ms) | N/A | FAIL | N/A | FAIL | FAIL |
| `metadata/rotation_survives_mp4_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/tagedit_no_corrupt_audio_flac` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_attribution_multitrack` | — | N/A | — | Pass (9 ms) | Pass (11 ms) | Pass (21 ms) | Pass (9 ms) | Pass (7 ms) | Pass (44 ms) |
| `metadata/tracks_packet_attribution_multitrack` | — | N/A | — | Pass (17 ms) | Pass (22 ms) | Pass (30 ms) | Pass (164 ms) | Pass (368 ms) | ERROR |
| `metadata/write_flac_vorbiscomment` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mkv_tags` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp3_id3` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp4_tags` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_ogg_vorbiscomment` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `mux/aac_to_adts` | throughputRealtime (x-realtime) | N/A | — | Pass (12.17 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/audio_only_aac_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/av1_opus_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/drop_audio_track_subset_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_hevc_decode_mux_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_hevc_decode_mux_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_multitrack_keep_all_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mov` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/flac_to_mkv_audio` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mkv` | throughputRealtime (x-realtime) | N/A | — | Pass (105 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mov` | throughputRealtime (x-realtime) | N/A | — | Pass (105 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mp4` | throughputRealtime (x-realtime) | N/A | — | Pass (99.88 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_ts` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp3` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp4_audio` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_faststart_reserve` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_fragmented_cmaf` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_progressive_buffer` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_streaming_target` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — | — | — | — | — |
| `mux/opus_to_ogg` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_webm_audio` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_f32_to_wav` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s16_to_wav` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s24_to_wav` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_longform_audio_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_tiny_360p_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/swap_audio_video_with_opus_to_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/three_track_assembly_to_mkv` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/video_a_plus_audio_b_to_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/video_plus_audio_to_mp4` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/vorbis_to_ogg` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_opus_to_webm` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `performance/bundle-size` | bundleSize (kB) | N/A | Pass (64.02 s) | Pass (8.74 s) | Pass (8.74 s) | FAIL | Pass (8.74 s) | Pass (16.5 s) | Pass (35.14 s) |
| `performance/convert-longtasks` | — | N/A | — | FAIL | N/A | ERROR | N/A | Pass (7.7 s) | N/A |
| `performance/convert-peak-memory` | — | N/A | — | FAIL | N/A | ERROR | N/A | Pass (7.87 s) | N/A |
| `performance/convert-webm-resize-320x180` | framesPerSec (fps) | N/A | ERROR | FAIL | N/A | N/A | N/A | Pass (2.33 s) | N/A |
| `performance/decode-fps` | — | N/A | — | FAIL | N/A | FAIL | N/A | FAIL | FAIL |
| `performance/encode-fps` | — | N/A | — | Pass (5.54 s) | N/A | ERROR | N/A | Pass (9.22 s) | N/A |
| `performance/extract-metadata` | opsPerSec (ops/s) | N/A | Pass (41.19 ms) | Pass (80.48 ms) | Pass (82.12 ms) | N/A | Pass (33.24 ms) | Pass (45.81 ms) | Pass (68.65 ms) |
| `performance/iterate-video-packets` | packetsPerSec (packets/s) | N/A | Pass (98.88 ms) | Pass (103 ms) | Pass (88.79 ms) | N/A | Pass (6.89 s) | Pass (918 ms) | Pass (555 ms) |
| `performance/metamorphic-decode-remux` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-probe-duration-cross-container` | — | N/A | — | FAIL | N/A | N/A | N/A | Pass (7.36 s) | N/A |
| `performance/metamorphic-transcode-idempotent-source-res` | — | N/A | — | FAIL | N/A | ERROR | N/A | Pass (8.67 s) | N/A |
| `performance/metamorphic-vfr-iterate-packets` | — | N/A | — | FAIL | Pass (8 ms) | Pass (11 ms) | FAIL | FAIL | ERROR |
| `performance/metamorphic-vfr-probe-duration` | — | N/A | — | FAIL | Pass (8 ms) | FAIL | Pass (9 ms) | Pass (6 ms) | Pass (46 ms) |
| `performance/op-sweep-demux` | — | N/A | — | Pass (79 ms) | Pass (68 ms) | Pass (70 ms) | Pass (1.11 s) | Pass (6.76 s) | ERROR |
| `performance/op-sweep-probe` | — | N/A | — | Pass (53 ms) | Pass (46 ms) | Pass (57 ms) | Pass (53 ms) | Pass (25 ms) | Pass (75 ms) |
| `performance/op-sweep-remux-mp4-to-mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-transcode-webm` | — | N/A | — | FAIL | N/A | ERROR | N/A | FAIL | N/A |
| `performance/seek-ms` | — | N/A | — | Pass (92 ms) | N/A | Pass (87 ms) | N/A | Pass (11.96 s) | Pass (105 ms) |
| `performance/size-ladder-demux-peak-memory-huge` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-demux-peak-memory-large` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-demux-peak-memory-large4k` | — | N/A | — | Pass (52 ms) | Pass (53 ms) | Pass (60 ms) | Pass (506 ms) | Pass (2.12 s) | ERROR |
| `performance/size-ladder-extract-metadata-huge` | — | N/A | — | ERROR | ERROR | ERROR | N/A | ERROR | ERROR |
| `performance/size-ladder-extract-metadata-large` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-extract-metadata-large4k` | — | N/A | — | Pass (35 ms) | Pass (41 ms) | Pass (46 ms) | Pass (37 ms) | Pass (12 ms) | Pass (83 ms) |
| `performance/size-ladder-extract-metadata-massive` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-extract-metadata-medium` | — | N/A | — | Pass (41 ms) | Pass (53 ms) | Pass (62 ms) | Pass (47 ms) | Pass (10 ms) | Pass (72 ms) |
| `performance/size-ladder-extract-metadata-tiny` | — | N/A | — | Pass (7 ms) | Pass (4 ms) | Pass (7 ms) | Pass (6 ms) | Pass (5 ms) | Pass (39 ms) |
| `performance/size-ladder-iterate-packets-huge` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-iterate-packets-large` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-iterate-packets-large4k` | — | N/A | — | Pass (50 ms) | Pass (65 ms) | Pass (130 ms) | Pass (467 ms) | Pass (2 s) | ERROR |
| `performance/size-ladder-iterate-packets-massive` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-iterate-packets-medium` | — | N/A | — | Pass (79 ms) | Pass (74 ms) | Pass (86 ms) | Pass (1.1 s) | Pass (6.31 s) | ERROR |
| `performance/size-ladder-iterate-packets-tiny` | — | N/A | — | Pass (4 ms) | Pass (4 ms) | Pass (6 ms) | Pass (15 ms) | Pass (9 ms) | ERROR |
| `probe/aac_adts` | — | N/A | — | Pass (6 ms) | N/A | N/A | FAIL | FAIL | N/A |
| `probe/av1_720p_5s` | — | N/A | — | Pass (14 ms) | N/A | FAIL | FAIL | FAIL | Pass (25 ms) |
| `probe/big_buck_bunny_1080p_h264` | — | N/A | — | ERROR | ERROR | ERROR | N/A | ERROR | ERROR |
| `probe/cenc_cbcs` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/cenc_ctr` | — | N/A | — | Pass (9 ms) | Pass (9 ms) | FAIL | FAIL | FAIL | Pass (63 ms) |
| `probe/empty-audio-wav` | — | N/A | — | Pass (4 ms) | N/A | N/A | Pass (7 ms) | Pass (3 ms) | N/A |
| `probe/flac_noseektable` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_seektable` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_30s` | — | N/A | — | Pass (72 ms) | Pass (58 ms) | Pass (64 ms) | Pass (62 ms) | Pass (27 ms) | Pass (83 ms) |
| `probe/h264_1080p_5s` | — | N/A | — | Pass (13 ms) | Pass (17 ms) | Pass (18 ms) | N/A | FAIL | FAIL |
| `probe/h264_4k_10s` | — | N/A | — | Pass (39 ms) | Pass (40 ms) | Pass (52 ms) | Pass (37 ms) | Pass (13 ms) | Pass (80 ms) |
| `probe/h264_bframes_1080p` | — | N/A | — | Pass (19 ms) | Pass (28 ms) | Pass (33 ms) | Pass (21 ms) | Pass (8 ms) | Pass (49 ms) |
| `probe/h264_in_mkv` | — | N/A | — | Pass (12 ms) | N/A | FAIL | N/A | FAIL | FAIL |
| `probe/h264_multitrack` | — | N/A | — | Pass (12 ms) | Pass (15 ms) | Pass (14 ms) | Pass (16 ms) | Pass (6 ms) | Pass (44 ms) |
| `probe/h264_rotated90` | — | N/A | — | Pass (10 ms) | Pass (16 ms) | Pass (19 ms) | Pass (10 ms) | Pass (17 ms) | Pass (50 ms) |
| `probe/h264_ts` | — | N/A | — | Pass (47 ms) | N/A | N/A | FAIL | FAIL | FAIL |
| `probe/h264_vfr` | — | N/A | — | FAIL | Pass (9 ms) | FAIL | Pass (8 ms) | Pass (6 ms) | Pass (47 ms) |
| `probe/hevc_1080p_10s` | — | N/A | — | Pass (22 ms) | Pass (25 ms) | Pass (36 ms) | Pass (23 ms) | Pass (8 ms) | Pass (32 ms) |
| `probe/hls_aes128` | — | N/A | — | ERROR | N/A | N/A | ERROR | ERROR | N/A |
| `probe/hls_vod` | — | N/A | — | ERROR | N/A | N/A | ERROR | ERROR | N/A |
| `probe/huge_h264_1080p_600s` | — | N/A | — | ERROR | ERROR | ERROR | N/A | ERROR | ERROR |
| `probe/large_h264_1080p_120s` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/large_vp9_1080p_120s` | — | N/A | — | ERROR | N/A | ERROR | ERROR | ERROR | ERROR |
| `probe/longform_1h_audio` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/massive_h264_1080p_2h` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/metamorphic-duration-across-containers` | — | N/A | — | FAIL | N/A | FAIL | N/A | FAIL | FAIL |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | N/A | — | ERROR | N/A | ERROR | ERROR | ERROR | ERROR |
| `probe/micro_audio_short` | — | N/A | — | Pass (4 ms) | Pass (4 ms) | Pass (4 ms) | Pass (4 ms) | Pass (3 ms) | Pass (26 ms) |
| `probe/micro_h264_1frame` | — | N/A | — | Pass (3 ms) | Pass (3 ms) | FAIL | Pass (4 ms) | Pass (4 ms) | Pass (36 ms) |
| `probe/mp3_cbr_notoc` | — | N/A | — | Pass (4 ms) | N/A | N/A | Pass (4 ms) | Pass (5 ms) | N/A |
| `probe/mp3_xing` | — | N/A | — | Pass (4 ms) | N/A | N/A | Pass (5 ms) | Pass (11 ms) | N/A |
| `probe/opus` | — | N/A | — | Pass (6 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/pcm_s16be` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-huge` | — | N/A | — | ERROR | ERROR | ERROR | N/A | ERROR | ERROR |
| `probe/perf-extract-metadata-large` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/perf-extract-metadata-massive` | — | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/recorder_headerless` | — | N/A | — | ERROR | N/A | ERROR | ERROR | ERROR | ERROR |
| `probe/tiny_h264_360p_2s` | — | N/A | — | Pass (4 ms) | Pass (6 ms) | Pass (6 ms) | Pass (6 ms) | Pass (4 ms) | Pass (38 ms) |
| `probe/tiny_vp9_360p_2s` | — | N/A | — | Pass (4 ms) | N/A | FAIL | FAIL | FAIL | Pass (42 ms) |
| `probe/truncated-header-graceful` | — | N/A | — | FAIL | ERROR | FAIL | ERROR | ERROR | ERROR |
| `probe/vp8_720p_10s` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | Pass (30 ms) |
| `probe/vp9_1080p_10s` | — | N/A | — | Pass (27 ms) | N/A | FAIL | FAIL | FAIL | Pass (60 ms) |
| `probe/vp9_alpha` | — | N/A | — | Pass (9 ms) | N/A | FAIL | FAIL | FAIL | Pass (41 ms) |
| `probe/wav_f32` | — | N/A | — | Pass (9 ms) | N/A | N/A | ERROR | ERROR | N/A |
| `probe/wav_s16` | — | N/A | — | Pass (4 ms) | N/A | N/A | Pass (7 ms) | Pass (6 ms) | N/A |
| `probe/wav_s24` | — | N/A | — | Pass (5 ms) | N/A | N/A | Pass (11 ms) | Pass (4 ms) | N/A |
| `remux/aac_adts_adts_to_mp4` | throughputRealtime (x-realtime) | N/A | — | Pass (5.44 ms) | N/A | N/A | N/A | FAIL | N/A |
| `remux/aac_adts_adts_to_ts` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mp4` | throughputRealtime (x-realtime) | N/A | — | Pass (23.18 ms) | N/A | N/A | N/A | FAIL | N/A |
| `remux/av1_720p_5s_webm_to_webm` | — | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/flac_seektable_flac_to_mkv` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_ogg` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mov` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_ts` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_mp4` | throughputRealtime (x-realtime) | N/A | — | Pass (55.61 ms) | FAIL | N/A | N/A | FAIL | N/A |
| `remux/h264_1080p_5s_mov_to_ts` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mov` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mp4` | — | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/h264_in_mkv_mkv_to_ts` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_multitrack_mp4_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_rotated90_mp4_to_mov` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mov` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mp4` | — | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | N/A | — | ERROR | ERROR | N/A | N/A | ERROR | N/A |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `remux/micro_audio_short_mp4_to_adts` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/mp3_xing_mp3_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/mp3_xing_mp3_to_mp4` | — | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/opus_ogg_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_webm` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_adts_to_mp4_duration_invariant` | — | N/A | — | FAIL | N/A | N/A | N/A | Pass (95 ms) | N/A |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/prop_multitrack_survives_mp4_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_recorder_headerless_duration_materialized` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_rotation_survives_mp4_mov` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_ts_to_mp4_duration_materialized` | — | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/vp8_720p_10s_webm_to_mkv` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/vp9_1080p_10s_webm_to_webm` | — | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `streaming-output/buffer_massive_h264_mp4` | — | N/A | — | ERROR | ERROR | N/A | N/A | ERROR | N/A |
| `streaming-output/mp4_buffer_target` | — | N/A | — | FAIL | Pass (722 ms) | N/A | N/A | Pass (7.77 s) | N/A |
| `streaming-output/mp4_faststart_in_memory` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_none_control` | — | N/A | — | FAIL | Pass (752 ms) | N/A | N/A | Pass (7.37 s) | N/A |
| `streaming-output/mp4_faststart_reserve` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_fragmented_cmaf` | — | N/A | — | FAIL | Pass (188 ms) | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_streaming_target` | — | N/A | — | FAIL | Pass (763 ms) | N/A | N/A | Pass (7.39 s) | N/A |
| `streaming-output/mp4_ttfb_buffer_target` | — | N/A | — | FAIL | Pass (731 ms) | N/A | N/A | Pass (7.45 s) | N/A |
| `streaming-output/mp4_ttfb_streaming_target` | — | N/A | — | FAIL | Pass (748 ms) | N/A | N/A | Pass (7.44 s) | N/A |
| `streaming-output/prop_decode_equals_buffer_shape` | — | N/A | — | FAIL | FAIL | N/A | N/A | FAIL | N/A |
| `streaming-output/prop_decode_equals_stream_shape` | — | N/A | — | FAIL | FAIL | N/A | N/A | FAIL | N/A |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | N/A | — | FAIL | FAIL | N/A | N/A | FAIL | N/A |
| `streaming-output/prop_probe_dur_buffer_shape` | — | N/A | — | FAIL | Pass (163 ms) | N/A | N/A | Pass (6.9 s) | N/A |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | N/A | — | FAIL | Pass (152 ms) | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_stream_shape` | — | N/A | — | FAIL | Pass (153 ms) | N/A | N/A | Pass (6.86 s) | N/A |
| `streaming-output/prop_ts_stream_duration_materialized` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | N/A | — | ERROR | ERROR | N/A | N/A | ERROR | N/A |
| `streaming-output/stream_large_h264_mp4` | — | N/A | — | ERROR | ERROR | N/A | N/A | ERROR | N/A |
| `streaming-output/stream_large_vp9_webm` | — | N/A | — | ERROR | N/A | N/A | N/A | ERROR | N/A |
| `streaming-output/stream_massive_h264_mp4` | — | N/A | — | ERROR | ERROR | N/A | N/A | ERROR | N/A |
| `streaming-output/ts_continuity_many_writes` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/ts_tiny_writes` | — | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/webm_headerless_live_stream` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/webm_streaming_target` | — | N/A | — | FAIL | N/A | N/A | N/A | Pass (745 ms) | N/A |
| `trim/audio_aac_adts_copy` | throughputRealtime (x-realtime) | N/A | — | Pass (57.55 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_aiff_pcm_be_copy` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_noseektable_copy` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_seektable_copy` | — | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_mp3_copy` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_opus_ogg_copy` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_wav_pcm_copy` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/av1_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/fmp4_fragment_boundary_copy` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_bframes_frame_accurate` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_frame_accurate` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned_short` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_multitrack_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_noop_full_range_idempotent` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_open_gop_frame_accurate` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_rotated_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_single_gop_frame_accurate` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_start_zero_copy` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_subframe_range_frame_accurate` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_to_eof_copy` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_vfr_frame_accurate` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_frame_accurate` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/huge_h264_mov_copy_peakmem` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_copy_lazyread` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_frame_accurate_throughput` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/massive_h264_copy_sustained` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/mkv_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/mov_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_zero_length_range` | — | — | — | — | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/vp8_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_alpha_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_keyframe_aligned` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_noop_full_range_idempotent` | — | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |

### 2. Winners — one per case (🏆 = fastest correct engine)

| Case | Winner | Value | Runner-up | Margin | Eligible | Flag |
| --- | --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | 0 | no winner |
| `audio-dsp/caf_container_probe` | — | — | — | — | 0 | no winner |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | 0 | no winner |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | 0 | no winner |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | 0 | no winner |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | 0 | no winner |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | 0 | no winner |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | 0 | no winner |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | 0 | no winner |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | 0 | no winner |
| `audio-dsp/gain_half_f32` | — | — | — | — | 0 | no winner |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | 0 | no winner |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | 0 | no winner |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | 0 | no winner |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | 0 | no winner |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | 0 | no winner |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | 0 | no winner |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | 0 | no winner |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | 0 | no winner |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | 0 | no winner |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | 0 | no winner |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | 0 | no winner |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | 0 | no winner |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | 0 | no winner |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | 0 | no winner |
| `demux/aac_adts` | — | — | — | — | 3 | no winner |
| `demux/av1_720p_5s` | — | — | — | — | 4 | no winner |
| `demux/empty_audio_zero_packets` | — | — | — | — | 3 | no winner |
| `demux/flac_noseektable` | — | — | — | — | 0 | no winner |
| `demux/flac_seektable` | — | — | — | — | 0 | no winner |
| `demux/h264_1080p_30s` | — | — | — | — | 5 | no winner |
| `demux/h264_1080p_5s` | — | — | — | — | 4 | no winner |
| `demux/h264_4k_10s` | — | — | — | — | 5 | no winner |
| `demux/h264_bframes_1080p` | — | — | — | — | 2 | no winner |
| `demux/h264_in_mkv` | — | — | — | — | 3 | no winner |
| `demux/h264_multitrack` | `web-demuxer@4.0.0` (uncontested) | 144.72 ms | — | — | 6 | uncontested |
| `demux/h264_rotated90` | — | — | — | — | 5 | no winner |
| `demux/h264_ts` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `demux/h264_vfr` | — | — | — | — | 2 | no winner |
| `demux/hevc_1080p_10s` | — | — | — | — | 5 | no winner |
| `demux/hls_aes128` | — | — | — | — | 0 | no winner |
| `demux/hls_vod` | — | — | — | — | 0 | no winner |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | 0 | no winner |
| `demux/mp3_cbr_notoc` | — | — | — | — | 3 | no winner |
| `demux/mp3_xing` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `demux/opus` | — | — | — | — | 0 | no winner |
| `demux/pcm_s16be` | — | — | — | — | 0 | no winner |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | 0 | no winner |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | 0 | no winner |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | 0 | no winner |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | 0 | no winner |
| `demux/size_micro_micro_audio_short` | — | — | — | — | 6 | no winner |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | 6 | no winner |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | 5 | no winner |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | 4 | no winner |
| `demux/vp8_720p_10s` | — | — | — | — | 0 | no winner |
| `demux/vp9_1080p_10s` | — | — | — | — | 4 | no winner |
| `demux/vp9_alpha` | — | — | — | — | 5 | no winner |
| `demux/wav_f32` | — | — | — | — | 0 | no winner |
| `demux/wav_s16` | — | — | — | — | 0 | no winner |
| `demux/wav_s24` | — | — | — | — | 0 | no winner |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | 0 | no winner |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | 0 | no winner |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | 0 | no winner |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | 0 | no winner |
| `encryption/clearkey_decrypt_na` | — | — | — | — | 0 | no winner |
| `encryption/hls_aes128_decrypt` | — | — | — | — | 0 | no winner |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | 0 | no winner |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | 0 | no winner |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | 0 | no winner |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | 0 | no winner |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `metadata/read_flac_seektable` | — | — | — | — | 0 | no winner |
| `metadata/read_h264_1080p_30s` | — | — | — | — | 6 | no winner |
| `metadata/read_h264_1080p_5s` | — | — | — | — | 3 | no winner |
| `metadata/read_h264_in_mkv` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `metadata/read_h264_multitrack` | — | — | — | — | 6 | no winner |
| `metadata/read_mp3_xing` | — | — | — | — | 3 | no winner |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | 0 | no winner |
| `metadata/read_no_tags_wav` | — | — | — | — | 3 | no winner |
| `metadata/read_opus` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `metadata/read_pcm_s16be` | — | — | — | — | 0 | no winner |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | 2 | no winner |
| `metadata/rotation_decode_read_h264_rotated90` | `mediabunny@1.48.0` (uncontested) | 102 ms | — | — | 1 | uncontested |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | 0 | no winner |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | 0 | no winner |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | 0 | no winner |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | 6 | no winner |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | 5 | no winner |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | 0 | no winner |
| `metadata/write_mkv_tags` | — | — | — | — | 0 | no winner |
| `metadata/write_mp3_id3` | — | — | — | — | 0 | no winner |
| `metadata/write_mp4_tags` | — | — | — | — | 0 | no winner |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | 0 | no winner |
| `mux/aac_to_adts` | `mediabunny@1.48.0` (uncontested) | 1453.77 x-realtime | — | — | 1 | uncontested |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/av1_opus_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | 0 | no winner |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | 0 | no winner |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | 0 | no winner |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | 0 | no winner |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | 0 | no winner |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | 0 | no winner |
| `mux/flac_to_mkv_audio` | — | — | — | — | 0 | no winner |
| `mux/h264_aac_to_mkv` | `mediabunny@1.48.0` (uncontested) | 265.39 x-realtime | — | — | 1 | uncontested |
| `mux/h264_aac_to_mov` | `mediabunny@1.48.0` (uncontested) | 323.42 x-realtime | — | — | 1 | uncontested |
| `mux/h264_aac_to_mp4` | `mediabunny@1.48.0` (uncontested) | 307.25 x-realtime | — | — | 1 | uncontested |
| `mux/h264_aac_to_ts` | — | — | — | — | 0 | no winner |
| `mux/mp3_to_mp3` | — | — | — | — | 0 | no winner |
| `mux/mp3_to_mp4_audio` | — | — | — | — | 0 | no winner |
| `mux/mp4_faststart_reserve` | — | — | — | — | 0 | no winner |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | 0 | no winner |
| `mux/mp4_progressive_buffer` | — | — | — | — | 0 | no winner |
| `mux/mp4_streaming_target` | — | — | — | — | 0 | no winner |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | 0 | no winner |
| `mux/opus_to_ogg` | — | — | — | — | 0 | no winner |
| `mux/opus_to_webm_audio` | — | — | — | — | 0 | no winner |
| `mux/pcm_f32_to_wav` | — | — | — | — | 0 | no winner |
| `mux/pcm_s16_to_wav` | — | — | — | — | 0 | no winner |
| `mux/pcm_s24_to_wav` | — | — | — | — | 0 | no winner |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | 0 | no winner |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | 0 | no winner |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | 0 | no winner |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/vorbis_to_ogg` | — | — | — | — | 0 | no winner |
| `mux/vp9_opus_to_webm` | — | — | — | — | 0 | no winner |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | 0 | no winner |
| `performance/bundle-size` | 🏆 `ffmpeg.wasm@0.12.15` | 1.4 kB | `mp4box@2.3.0` | +96.61% | 6 | contested |
| `performance/convert-longtasks` | `remotion-webcodecs@4.0.479` (uncontested) | — | — | — | 1 | uncontested |
| `performance/convert-peak-memory` | `remotion-webcodecs@4.0.479` (uncontested) | — | — | — | 1 | uncontested |
| `performance/convert-webm-resize-320x180` | `remotion-webcodecs@4.0.479` (uncontested) | 385.21 fps | — | — | 1 | uncontested |
| `performance/decode-fps` | — | — | — | — | 0 | no winner |
| `performance/encode-fps` | — | — | — | — | 2 | no winner |
| `performance/extract-metadata` | 🏆 `remotion-media-parser@4.0.479` | 31.78 ops/s | `mediabunny@1.48.0` | +81.27% | 6 | contested |
| `performance/iterate-video-packets` | 🤝 `mp4box@2.3.0`, `ffmpeg.wasm@0.12.15` | 25341.75 packets/s | `ffmpeg.wasm@0.12.15` | +1.07% | 6 | tie |
| `performance/metamorphic-decode-remux` | — | — | — | — | 0 | no winner |
| `performance/metamorphic-probe-duration-cross-container` | `remotion-webcodecs@4.0.479` (uncontested) | — | — | — | 1 | uncontested |
| `performance/metamorphic-transcode-idempotent-source-res` | `remotion-webcodecs@4.0.479` (uncontested) | — | — | — | 1 | uncontested |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | 2 | no winner |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | 4 | no winner |
| `performance/op-sweep-demux` | — | — | — | — | 5 | no winner |
| `performance/op-sweep-probe` | — | — | — | — | 6 | no winner |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | 0 | no winner |
| `performance/op-sweep-transcode-webm` | — | — | — | — | 0 | no winner |
| `performance/seek-ms` | — | — | — | — | 4 | no winner |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | 5 | no winner |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | 6 | no winner |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | 6 | no winner |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | 6 | no winner |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | 5 | no winner |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | 5 | no winner |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | 5 | no winner |
| `probe/aac_adts` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `probe/av1_720p_5s` | — | — | — | — | 2 | no winner |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | 0 | no winner |
| `probe/cenc_cbcs` | — | — | — | — | 0 | no winner |
| `probe/cenc_ctr` | — | — | — | — | 3 | no winner |
| `probe/empty-audio-wav` | — | — | — | — | 3 | no winner |
| `probe/flac_noseektable` | — | — | — | — | 0 | no winner |
| `probe/flac_seektable` | — | — | — | — | 0 | no winner |
| `probe/h264_1080p_30s` | — | — | — | — | 6 | no winner |
| `probe/h264_1080p_5s` | — | — | — | — | 3 | no winner |
| `probe/h264_4k_10s` | — | — | — | — | 6 | no winner |
| `probe/h264_bframes_1080p` | — | — | — | — | 6 | no winner |
| `probe/h264_in_mkv` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `probe/h264_multitrack` | — | — | — | — | 6 | no winner |
| `probe/h264_rotated90` | — | — | — | — | 6 | no winner |
| `probe/h264_ts` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `probe/h264_vfr` | — | — | — | — | 4 | no winner |
| `probe/hevc_1080p_10s` | — | — | — | — | 6 | no winner |
| `probe/hls_aes128` | — | — | — | — | 0 | no winner |
| `probe/hls_vod` | — | — | — | — | 0 | no winner |
| `probe/huge_h264_1080p_600s` | — | — | — | — | 0 | no winner |
| `probe/large_h264_1080p_120s` | — | — | — | — | 0 | no winner |
| `probe/large_vp9_1080p_120s` | — | — | — | — | 0 | no winner |
| `probe/longform_1h_audio` | — | — | — | — | 0 | no winner |
| `probe/massive_h264_1080p_2h` | — | — | — | — | 0 | no winner |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | 0 | no winner |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | 0 | no winner |
| `probe/micro_audio_short` | — | — | — | — | 6 | no winner |
| `probe/micro_h264_1frame` | — | — | — | — | 5 | no winner |
| `probe/mp3_cbr_notoc` | — | — | — | — | 3 | no winner |
| `probe/mp3_xing` | — | — | — | — | 3 | no winner |
| `probe/opus` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `probe/pcm_s16be` | — | — | — | — | 0 | no winner |
| `probe/perf-extract-metadata-huge` | — | — | — | — | 0 | no winner |
| `probe/perf-extract-metadata-large` | — | — | — | — | 0 | no winner |
| `probe/perf-extract-metadata-massive` | — | — | — | — | 0 | no winner |
| `probe/recorder_headerless` | — | — | — | — | 0 | no winner |
| `probe/tiny_h264_360p_2s` | — | — | — | — | 6 | no winner |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | 2 | no winner |
| `probe/truncated-header-graceful` | — | — | — | — | 0 | no winner |
| `probe/vp8_720p_10s` | `web-demuxer@4.0.0` (uncontested) | — | — | — | 1 | uncontested |
| `probe/vp9_1080p_10s` | — | — | — | — | 2 | no winner |
| `probe/vp9_alpha` | — | — | — | — | 2 | no winner |
| `probe/wav_f32` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `probe/wav_s16` | — | — | — | — | 3 | no winner |
| `probe/wav_s24` | — | — | — | — | 3 | no winner |
| `remux/aac_adts_adts_to_mp4` | `mediabunny@1.48.0` (uncontested) | 1964.94 x-realtime | — | — | 1 | uncontested |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | 0 | no winner |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/av1_720p_5s_webm_to_mp4` | `mediabunny@1.48.0` (uncontested) | 537.92 x-realtime | — | — | 1 | uncontested |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | 0 | no winner |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_5s_mov_to_mp4` | `mediabunny@1.48.0` (uncontested) | 86.78 x-realtime | — | — | 1 | uncontested |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | 0 | no winner |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | 0 | no winner |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | 0 | no winner |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | 0 | no winner |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | 0 | no winner |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | 0 | no winner |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | 0 | no winner |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/opus_ogg_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/opus_ogg_to_webm` | — | — | — | — | 0 | no winner |
| `remux/prop_adts_to_mp4_duration_invariant` | `remotion-webcodecs@4.0.479` (uncontested) | — | — | — | 1 | uncontested |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | 0 | no winner |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | 0 | no winner |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | 0 | no winner |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | 0 | no winner |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | 0 | no winner |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | 0 | no winner |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | 0 | no winner |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | 0 | no winner |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | 0 | no winner |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_buffer_target` | — | — | — | — | 2 | no winner |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | 2 | no winner |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_fragmented_cmaf` | `mp4box@2.3.0` (uncontested) | — | — | — | 1 | uncontested |
| `streaming-output/mp4_streaming_target` | — | — | — | — | 2 | no winner |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | 2 | no winner |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | 2 | no winner |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | 2 | no winner |
| `streaming-output/prop_probe_dur_fragmented_shape` | `mp4box@2.3.0` (uncontested) | — | — | — | 1 | uncontested |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | 2 | no winner |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | 0 | no winner |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | 0 | no winner |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | 0 | no winner |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | 0 | no winner |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | 0 | no winner |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | 0 | no winner |
| `streaming-output/ts_tiny_writes` | — | — | — | — | 0 | no winner |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | 0 | no winner |
| `streaming-output/webm_streaming_target` | `remotion-webcodecs@4.0.479` (uncontested) | — | — | — | 1 | uncontested |
| `trim/audio_aac_adts_copy` | `mediabunny@1.48.0` (uncontested) | 164.35 x-realtime | — | — | 1 | uncontested |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_flac_seektable_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_mp3_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_opus_ogg_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_wav_pcm_copy` | — | — | — | — | 0 | no winner |
| `trim/av1_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | 0 | no winner |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/h264_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/h264_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | 0 | no winner |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | 0 | no winner |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/h264_start_zero_copy` | — | — | — | — | 0 | no winner |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/h264_to_eof_copy` | — | — | — | — | 0 | no winner |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/hevc_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/hevc_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | 0 | no winner |
| `trim/large_h264_copy_lazyread` | — | — | — | — | 0 | no winner |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | 0 | no winner |
| `trim/massive_h264_copy_sustained` | — | — | — | — | 0 | no winner |
| `trim/mkv_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/mov_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/robust_zero_length_range` | — | — | — | — | 0 | no winner |
| `trim/ts_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/vp8_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/vp9_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | 0 | no winner |

### 3. Conformance matrix (same display rule, grouped by correctness)

| Scenario | aibrush-media@dev | ffmpeg.wasm@0.12.15 | mediabunny@1.48.0 | mp4box@2.3.0 | platform@chrome-149 | remotion-media-parser@4.0.479 | remotion-webcodecs@4.0.479 | web-demuxer@4.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/caf_container_probe` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_5_1_to_stereo` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_stereo_to_mono` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_empty_audio_transcode` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_gapless_aac_decode` | N/A | — | ERROR | N/A | ERROR | N/A | FAIL | ERROR |
| `audio-dsp/edge_longform_audio_probe` | N/A | — | ERROR | N/A | N/A | ERROR | ERROR | N/A |
| `audio-dsp/edge_longform_audio_resample_16k` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_variable_channel_count_downmix` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fade_in_out_f32` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_half_f32` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_minus6db_s16` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_idempotent_resample_same_rate` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_roundtrip_endianness_s16` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/negative_image_into_audio_transcode` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_f32_to_s16` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16_to_f32` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16be_to_s16le` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16le_to_s16be` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_f32` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_s16` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24be_to_s16le` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_44k1_to_48k` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_16k` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_44k1` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s16be` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s24` | N/A | — | ERROR | N/A | N/A | N/A | FAIL | N/A |
| `audio-dsp/throughput_encode_s16be` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s24` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/upmix_mono_to_stereo` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/upmix_stereo_to_5_1` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/aac_adts` | N/A | — | Pass (7 ms) | N/A | N/A | Pass (13 ms) | Pass (10 ms) | N/A |
| `demux/av1_720p_5s` | N/A | — | Pass (16 ms) | N/A | Pass (11 ms) | Pass (43 ms) | Pass (35 ms) | ERROR |
| `demux/empty_audio_zero_packets` | N/A | — | Pass (3 ms) | N/A | N/A | Pass (3 ms) | Pass (4 ms) | N/A |
| `demux/flac_noseektable` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/flac_seektable` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_30s` | N/A | — | Pass (67 ms) | Pass (74 ms) | Pass (74 ms) | Pass (1.15 s) | Pass (6.66 s) | ERROR |
| `demux/h264_1080p_5s` | N/A | — | Pass (17 ms) | Pass (17 ms) | Pass (25 ms) | N/A | Pass (166 ms) | ERROR |
| `demux/h264_4k_10s` | N/A | — | Pass (53 ms) | Pass (56 ms) | Pass (63 ms) | Pass (478 ms) | Pass (2.07 s) | ERROR |
| `demux/h264_bframes_1080p` | N/A | — | FAIL | Pass (33 ms) | Pass (38 ms) | FAIL | FAIL | ERROR |
| `demux/h264_in_mkv` | N/A | — | Pass (20 ms) | N/A | Pass (20 ms) | N/A | Pass (82 ms) | ERROR |
| `demux/h264_multitrack` | N/A | — | Pass (16 ms) | Pass (24 ms) | Pass (24 ms) | Pass (163 ms) | Pass (177 ms) | Pass (145 ms) |
| `demux/h264_rotated90` | N/A | — | Pass (14 ms) | Pass (20 ms) | Pass (18 ms) | Pass (110 ms) | Pass (115 ms) | ERROR |
| `demux/h264_ts` | N/A | — | Pass (88 ms) | N/A | N/A | FAIL | FAIL | ERROR |
| `demux/h264_vfr` | N/A | — | FAIL | Pass (15 ms) | Pass (17 ms) | FAIL | FAIL | ERROR |
| `demux/hevc_1080p_10s` | N/A | — | Pass (28 ms) | Pass (44 ms) | Pass (47 ms) | Pass (352 ms) | Pass (1.07 s) | ERROR |
| `demux/hls_aes128` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_vod` | N/A | — | ERROR | N/A | N/A | ERROR | ERROR | N/A |
| `demux/metamorphic_flac_seektable_invariance` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_cbr_notoc` | N/A | — | Pass (11 ms) | N/A | N/A | Pass (14 ms) | Pass (11 ms) | N/A |
| `demux/mp3_xing` | N/A | — | Pass (7 ms) | N/A | N/A | FAIL | FAIL | N/A |
| `demux/opus` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `demux/pcm_s16be` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_huge_huge_h264_1080p_600s` | N/A | — | ERROR | ERROR | ERROR | N/A | ERROR | ERROR |
| `demux/size_large_large_h264_1080p_120s` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `demux/size_large_large_vp9_1080p_120s` | N/A | — | ERROR | N/A | ERROR | ERROR | ERROR | ERROR |
| `demux/size_massive_massive_h264_1080p_2h` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `demux/size_micro_micro_audio_short` | N/A | — | Pass (4 ms) | Pass (3 ms) | Pass (4 ms) | Pass (10 ms) | Pass (4 ms) | Pass (27 ms) |
| `demux/size_micro_micro_h264_1frame` | N/A | — | Pass (4 ms) | Pass (7 ms) | Pass (7 ms) | Pass (5 ms) | Pass (4 ms) | Pass (43 ms) |
| `demux/size_tiny_tiny_h264_360p_2s` | N/A | — | Pass (4 ms) | Pass (4 ms) | Pass (9 ms) | Pass (16 ms) | Pass (13 ms) | ERROR |
| `demux/size_tiny_tiny_vp9_360p_2s` | N/A | — | Pass (4 ms) | N/A | Pass (5 ms) | Pass (12 ms) | Pass (12 ms) | ERROR |
| `demux/vp8_720p_10s` | N/A | — | N/A | N/A | N/A | N/A | N/A | ERROR |
| `demux/vp9_1080p_10s` | N/A | — | Pass (37 ms) | N/A | Pass (38 ms) | Pass (98 ms) | Pass (63 ms) | ERROR |
| `demux/vp9_alpha` | N/A | — | Pass (12 ms) | N/A | Pass (6 ms) | Pass (17 ms) | Pass (16 ms) | Pass (57 ms) |
| `demux/wav_f32` | N/A | — | FAIL | N/A | N/A | ERROR | ERROR | N/A |
| `demux/wav_s16` | N/A | — | FAIL | N/A | N/A | FAIL | FAIL | N/A |
| `demux/wav_s24` | N/A | — | FAIL | N/A | N/A | FAIL | FAIL | N/A |
| `encryption/cenc_cbcs_decrypt` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_cens_decrypt_na` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `encryption/clearkey_decrypt_na` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt_eq_cleartext` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_sample_aes_decrypt_na` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/perf_cenc_ctr_decrypt_throughput` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `encryption/unencrypted_left_untouched_noop` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/meta_consistent_mp4_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_flac_seektable` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_30s` | N/A | — | Pass (36 ms) | Pass (53 ms) | Pass (59 ms) | Pass (46 ms) | Pass (11 ms) | Pass (73 ms) |
| `metadata/read_h264_1080p_5s` | N/A | — | Pass (8 ms) | Pass (8 ms) | Pass (12 ms) | N/A | FAIL | FAIL |
| `metadata/read_h264_in_mkv` | N/A | — | Pass (12 ms) | N/A | FAIL | N/A | FAIL | FAIL |
| `metadata/read_h264_multitrack` | N/A | — | Pass (10 ms) | Pass (13 ms) | Pass (19 ms) | Pass (9 ms) | Pass (6 ms) | Pass (47 ms) |
| `metadata/read_mp3_xing` | N/A | — | Pass (4 ms) | N/A | N/A | Pass (12 ms) | Pass (4 ms) | N/A |
| `metadata/read_no_tags_recorder_webm` | N/A | — | ERROR | N/A | ERROR | ERROR | ERROR | ERROR |
| `metadata/read_no_tags_wav` | N/A | — | Pass (9 ms) | N/A | N/A | Pass (11 ms) | Pass (5 ms) | N/A |
| `metadata/read_opus` | N/A | — | Pass (7 ms) | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_pcm_s16be` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_vp9_1080p_10s` | N/A | — | Pass (22 ms) | N/A | FAIL | FAIL | FAIL | Pass (60 ms) |
| `metadata/rotation_decode_read_h264_rotated90` | N/A | — | Pass (102 ms) | N/A | FAIL | N/A | FAIL | FAIL |
| `metadata/rotation_survives_mp4_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/tagedit_no_corrupt_audio_flac` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_attribution_multitrack` | N/A | — | Pass (9 ms) | Pass (11 ms) | Pass (21 ms) | Pass (9 ms) | Pass (7 ms) | Pass (44 ms) |
| `metadata/tracks_packet_attribution_multitrack` | N/A | — | Pass (17 ms) | Pass (22 ms) | Pass (30 ms) | Pass (164 ms) | Pass (368 ms) | ERROR |
| `metadata/write_flac_vorbiscomment` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mkv_tags` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp3_id3` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp4_tags` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_ogg_vorbiscomment` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `mux/aac_to_adts` | N/A | — | Pass (12.17 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/audio_only_aac_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/av1_opus_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/drop_audio_track_subset_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_hevc_decode_mux_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_hevc_decode_mux_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_multitrack_keep_all_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mov` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/flac_to_mkv_audio` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mkv` | N/A | — | Pass (105 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mov` | N/A | — | Pass (105 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mp4` | N/A | — | Pass (99.88 ms) | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_ts` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp3` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp4_audio` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_faststart_reserve` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_fragmented_cmaf` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_progressive_buffer` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_streaming_target` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — | — | — | — |
| `mux/opus_to_ogg` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_webm_audio` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_f32_to_wav` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s16_to_wav` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s24_to_wav` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_av1_mux_duration_webm_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_mux_duration_mp4_to_ts` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_decode_mux_webm_to_webm` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_mux_duration_webm_to_webm` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_longform_audio_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/size_tiny_360p_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/swap_audio_video_with_opus_to_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/three_track_assembly_to_mkv` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/video_a_plus_audio_b_to_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/video_plus_audio_to_mp4` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/vorbis_to_ogg` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_opus_to_webm` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_video_plus_opus_audio_to_webm` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `performance/bundle-size` | N/A | Pass (64.02 s) | Pass (8.74 s) | Pass (8.74 s) | FAIL | Pass (8.74 s) | Pass (16.5 s) | Pass (35.14 s) |
| `performance/convert-longtasks` | N/A | — | FAIL | N/A | ERROR | N/A | Pass (7.7 s) | N/A |
| `performance/convert-peak-memory` | N/A | — | FAIL | N/A | ERROR | N/A | Pass (7.87 s) | N/A |
| `performance/convert-webm-resize-320x180` | N/A | ERROR | FAIL | N/A | N/A | N/A | Pass (2.33 s) | N/A |
| `performance/decode-fps` | N/A | — | FAIL | N/A | FAIL | N/A | FAIL | FAIL |
| `performance/encode-fps` | N/A | — | Pass (5.54 s) | N/A | ERROR | N/A | Pass (9.22 s) | N/A |
| `performance/extract-metadata` | N/A | Pass (41.19 ms) | Pass (80.48 ms) | Pass (82.12 ms) | N/A | Pass (33.24 ms) | Pass (45.81 ms) | Pass (68.65 ms) |
| `performance/iterate-video-packets` | N/A | Pass (98.88 ms) | Pass (103 ms) | Pass (88.79 ms) | N/A | Pass (6.89 s) | Pass (918 ms) | Pass (555 ms) |
| `performance/metamorphic-decode-remux` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-probe-duration-cross-container` | N/A | — | FAIL | N/A | N/A | N/A | Pass (7.36 s) | N/A |
| `performance/metamorphic-transcode-idempotent-source-res` | N/A | — | FAIL | N/A | ERROR | N/A | Pass (8.67 s) | N/A |
| `performance/metamorphic-vfr-iterate-packets` | N/A | — | FAIL | Pass (8 ms) | Pass (11 ms) | FAIL | FAIL | ERROR |
| `performance/metamorphic-vfr-probe-duration` | N/A | — | FAIL | Pass (8 ms) | FAIL | Pass (9 ms) | Pass (6 ms) | Pass (46 ms) |
| `performance/op-sweep-demux` | N/A | — | Pass (79 ms) | Pass (68 ms) | Pass (70 ms) | Pass (1.11 s) | Pass (6.76 s) | ERROR |
| `performance/op-sweep-probe` | N/A | — | Pass (53 ms) | Pass (46 ms) | Pass (57 ms) | Pass (53 ms) | Pass (25 ms) | Pass (75 ms) |
| `performance/op-sweep-remux-mp4-to-mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-transcode-webm` | N/A | — | FAIL | N/A | ERROR | N/A | FAIL | N/A |
| `performance/seek-ms` | N/A | — | Pass (92 ms) | N/A | Pass (87 ms) | N/A | Pass (11.96 s) | Pass (105 ms) |
| `performance/size-ladder-demux-peak-memory-huge` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-demux-peak-memory-large` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-demux-peak-memory-large4k` | N/A | — | Pass (52 ms) | Pass (53 ms) | Pass (60 ms) | Pass (506 ms) | Pass (2.12 s) | ERROR |
| `performance/size-ladder-extract-metadata-huge` | N/A | — | ERROR | ERROR | ERROR | N/A | ERROR | ERROR |
| `performance/size-ladder-extract-metadata-large` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-extract-metadata-large4k` | N/A | — | Pass (35 ms) | Pass (41 ms) | Pass (46 ms) | Pass (37 ms) | Pass (12 ms) | Pass (83 ms) |
| `performance/size-ladder-extract-metadata-massive` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-extract-metadata-medium` | N/A | — | Pass (41 ms) | Pass (53 ms) | Pass (62 ms) | Pass (47 ms) | Pass (10 ms) | Pass (72 ms) |
| `performance/size-ladder-extract-metadata-tiny` | N/A | — | Pass (7 ms) | Pass (4 ms) | Pass (7 ms) | Pass (6 ms) | Pass (5 ms) | Pass (39 ms) |
| `performance/size-ladder-iterate-packets-huge` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-iterate-packets-large` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-iterate-packets-large4k` | N/A | — | Pass (50 ms) | Pass (65 ms) | Pass (130 ms) | Pass (467 ms) | Pass (2 s) | ERROR |
| `performance/size-ladder-iterate-packets-massive` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `performance/size-ladder-iterate-packets-medium` | N/A | — | Pass (79 ms) | Pass (74 ms) | Pass (86 ms) | Pass (1.1 s) | Pass (6.31 s) | ERROR |
| `performance/size-ladder-iterate-packets-tiny` | N/A | — | Pass (4 ms) | Pass (4 ms) | Pass (6 ms) | Pass (15 ms) | Pass (9 ms) | ERROR |
| `probe/aac_adts` | N/A | — | Pass (6 ms) | N/A | N/A | FAIL | FAIL | N/A |
| `probe/av1_720p_5s` | N/A | — | Pass (14 ms) | N/A | FAIL | FAIL | FAIL | Pass (25 ms) |
| `probe/big_buck_bunny_1080p_h264` | N/A | — | ERROR | ERROR | ERROR | N/A | ERROR | ERROR |
| `probe/cenc_cbcs` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/cenc_ctr` | N/A | — | Pass (9 ms) | Pass (9 ms) | FAIL | FAIL | FAIL | Pass (63 ms) |
| `probe/empty-audio-wav` | N/A | — | Pass (4 ms) | N/A | N/A | Pass (7 ms) | Pass (3 ms) | N/A |
| `probe/flac_noseektable` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_seektable` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_30s` | N/A | — | Pass (72 ms) | Pass (58 ms) | Pass (64 ms) | Pass (62 ms) | Pass (27 ms) | Pass (83 ms) |
| `probe/h264_1080p_5s` | N/A | — | Pass (13 ms) | Pass (17 ms) | Pass (18 ms) | N/A | FAIL | FAIL |
| `probe/h264_4k_10s` | N/A | — | Pass (39 ms) | Pass (40 ms) | Pass (52 ms) | Pass (37 ms) | Pass (13 ms) | Pass (80 ms) |
| `probe/h264_bframes_1080p` | N/A | — | Pass (19 ms) | Pass (28 ms) | Pass (33 ms) | Pass (21 ms) | Pass (8 ms) | Pass (49 ms) |
| `probe/h264_in_mkv` | N/A | — | Pass (12 ms) | N/A | FAIL | N/A | FAIL | FAIL |
| `probe/h264_multitrack` | N/A | — | Pass (12 ms) | Pass (15 ms) | Pass (14 ms) | Pass (16 ms) | Pass (6 ms) | Pass (44 ms) |
| `probe/h264_rotated90` | N/A | — | Pass (10 ms) | Pass (16 ms) | Pass (19 ms) | Pass (10 ms) | Pass (17 ms) | Pass (50 ms) |
| `probe/h264_ts` | N/A | — | Pass (47 ms) | N/A | N/A | FAIL | FAIL | FAIL |
| `probe/h264_vfr` | N/A | — | FAIL | Pass (9 ms) | FAIL | Pass (8 ms) | Pass (6 ms) | Pass (47 ms) |
| `probe/hevc_1080p_10s` | N/A | — | Pass (22 ms) | Pass (25 ms) | Pass (36 ms) | Pass (23 ms) | Pass (8 ms) | Pass (32 ms) |
| `probe/hls_aes128` | N/A | — | ERROR | N/A | N/A | ERROR | ERROR | N/A |
| `probe/hls_vod` | N/A | — | ERROR | N/A | N/A | ERROR | ERROR | N/A |
| `probe/huge_h264_1080p_600s` | N/A | — | ERROR | ERROR | ERROR | N/A | ERROR | ERROR |
| `probe/large_h264_1080p_120s` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/large_vp9_1080p_120s` | N/A | — | ERROR | N/A | ERROR | ERROR | ERROR | ERROR |
| `probe/longform_1h_audio` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/massive_h264_1080p_2h` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/metamorphic-duration-across-containers` | N/A | — | FAIL | N/A | FAIL | N/A | FAIL | FAIL |
| `probe/metamorphic-recorder-headerless-sane-duration` | N/A | — | ERROR | N/A | ERROR | ERROR | ERROR | ERROR |
| `probe/micro_audio_short` | N/A | — | Pass (4 ms) | Pass (4 ms) | Pass (4 ms) | Pass (4 ms) | Pass (3 ms) | Pass (26 ms) |
| `probe/micro_h264_1frame` | N/A | — | Pass (3 ms) | Pass (3 ms) | FAIL | Pass (4 ms) | Pass (4 ms) | Pass (36 ms) |
| `probe/mp3_cbr_notoc` | N/A | — | Pass (4 ms) | N/A | N/A | Pass (4 ms) | Pass (5 ms) | N/A |
| `probe/mp3_xing` | N/A | — | Pass (4 ms) | N/A | N/A | Pass (5 ms) | Pass (11 ms) | N/A |
| `probe/opus` | N/A | — | Pass (6 ms) | N/A | N/A | N/A | N/A | N/A |
| `probe/pcm_s16be` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-huge` | N/A | — | ERROR | ERROR | ERROR | N/A | ERROR | ERROR |
| `probe/perf-extract-metadata-large` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/perf-extract-metadata-massive` | N/A | — | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |
| `probe/recorder_headerless` | N/A | — | ERROR | N/A | ERROR | ERROR | ERROR | ERROR |
| `probe/tiny_h264_360p_2s` | N/A | — | Pass (4 ms) | Pass (6 ms) | Pass (6 ms) | Pass (6 ms) | Pass (4 ms) | Pass (38 ms) |
| `probe/tiny_vp9_360p_2s` | N/A | — | Pass (4 ms) | N/A | FAIL | FAIL | FAIL | Pass (42 ms) |
| `probe/truncated-header-graceful` | N/A | — | FAIL | ERROR | FAIL | ERROR | ERROR | ERROR |
| `probe/vp8_720p_10s` | N/A | — | N/A | N/A | N/A | N/A | N/A | Pass (30 ms) |
| `probe/vp9_1080p_10s` | N/A | — | Pass (27 ms) | N/A | FAIL | FAIL | FAIL | Pass (60 ms) |
| `probe/vp9_alpha` | N/A | — | Pass (9 ms) | N/A | FAIL | FAIL | FAIL | Pass (41 ms) |
| `probe/wav_f32` | N/A | — | Pass (9 ms) | N/A | N/A | ERROR | ERROR | N/A |
| `probe/wav_s16` | N/A | — | Pass (4 ms) | N/A | N/A | Pass (7 ms) | Pass (6 ms) | N/A |
| `probe/wav_s24` | N/A | — | Pass (5 ms) | N/A | N/A | Pass (11 ms) | Pass (4 ms) | N/A |
| `remux/aac_adts_adts_to_mp4` | N/A | — | Pass (5.44 ms) | N/A | N/A | N/A | FAIL | N/A |
| `remux/aac_adts_adts_to_ts` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mp4` | N/A | — | Pass (23.18 ms) | N/A | N/A | N/A | FAIL | N/A |
| `remux/av1_720p_5s_webm_to_webm` | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/flac_seektable_flac_to_mkv` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_ogg` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mov` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_ts` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_mp4` | N/A | — | Pass (55.61 ms) | FAIL | N/A | N/A | FAIL | N/A |
| `remux/h264_1080p_5s_mov_to_ts` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_bframes_1080p_mp4_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mov` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mp4` | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/h264_in_mkv_mkv_to_ts` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_multitrack_mp4_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_rotated90_mp4_to_mov` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mov` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mp4` | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/hevc_1080p_10s_mp4_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mov` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | N/A | — | ERROR | ERROR | N/A | N/A | ERROR | N/A |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `remux/micro_audio_short_mp4_to_adts` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/mp3_xing_mp3_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/mp3_xing_mp3_to_mp4` | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/opus_ogg_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_webm` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_adts_to_mp4_duration_invariant` | N/A | — | FAIL | N/A | N/A | N/A | Pass (95 ms) | N/A |
| `remux/prop_bframes_decode_remux_mp4_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mov` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_mp3_to_mp4_duration_invariant` | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/prop_multitrack_survives_mp4_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_recorder_headerless_duration_materialized` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_rotation_survives_mp4_mov` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_roundtrip_mp4_mkv_mp4` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_ts_to_mp4_duration_materialized` | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/vp8_720p_10s_webm_to_mkv` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mkv` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mp4` | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `remux/vp9_1080p_10s_webm_to_webm` | N/A | — | FAIL | N/A | N/A | N/A | FAIL | N/A |
| `streaming-output/buffer_massive_h264_mp4` | N/A | — | ERROR | ERROR | N/A | N/A | ERROR | N/A |
| `streaming-output/mp4_buffer_target` | N/A | — | FAIL | Pass (722 ms) | N/A | N/A | Pass (7.77 s) | N/A |
| `streaming-output/mp4_faststart_in_memory` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_none_control` | N/A | — | FAIL | Pass (752 ms) | N/A | N/A | Pass (7.37 s) | N/A |
| `streaming-output/mp4_faststart_reserve` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_fragmented_cmaf` | N/A | — | FAIL | Pass (188 ms) | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_streaming_target` | N/A | — | FAIL | Pass (763 ms) | N/A | N/A | Pass (7.39 s) | N/A |
| `streaming-output/mp4_ttfb_buffer_target` | N/A | — | FAIL | Pass (731 ms) | N/A | N/A | Pass (7.45 s) | N/A |
| `streaming-output/mp4_ttfb_streaming_target` | N/A | — | FAIL | Pass (748 ms) | N/A | N/A | Pass (7.44 s) | N/A |
| `streaming-output/prop_decode_equals_buffer_shape` | N/A | — | FAIL | FAIL | N/A | N/A | FAIL | N/A |
| `streaming-output/prop_decode_equals_stream_shape` | N/A | — | FAIL | FAIL | N/A | N/A | FAIL | N/A |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_reserve_duration_invariant` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | N/A | — | FAIL | FAIL | N/A | N/A | FAIL | N/A |
| `streaming-output/prop_probe_dur_buffer_shape` | N/A | — | FAIL | Pass (163 ms) | N/A | N/A | Pass (6.9 s) | N/A |
| `streaming-output/prop_probe_dur_fragmented_shape` | N/A | — | FAIL | Pass (152 ms) | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_stream_shape` | N/A | — | FAIL | Pass (153 ms) | N/A | N/A | Pass (6.86 s) | N/A |
| `streaming-output/prop_ts_stream_duration_materialized` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_webm_headerless_duration_materialized` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_huge_h264_mov_to_mp4` | N/A | — | ERROR | ERROR | N/A | N/A | ERROR | N/A |
| `streaming-output/stream_large_h264_mp4` | N/A | — | ERROR | ERROR | N/A | N/A | ERROR | N/A |
| `streaming-output/stream_large_vp9_webm` | N/A | — | ERROR | N/A | N/A | N/A | ERROR | N/A |
| `streaming-output/stream_massive_h264_mp4` | N/A | — | ERROR | ERROR | N/A | N/A | ERROR | N/A |
| `streaming-output/ts_continuity_many_writes` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/ts_tiny_writes` | N/A | — | FAIL | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/webm_headerless_live_stream` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/webm_streaming_target` | N/A | — | FAIL | N/A | N/A | N/A | Pass (745 ms) | N/A |
| `trim/audio_aac_adts_copy` | N/A | — | Pass (57.55 ms) | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_aiff_pcm_be_copy` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_noseektable_copy` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_seektable_copy` | N/A | — | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_mp3_copy` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_opus_ogg_copy` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_wav_pcm_copy` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/av1_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/fmp4_fragment_boundary_copy` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_bframes_frame_accurate` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_frame_accurate` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned_short` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_multitrack_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_noop_full_range_idempotent` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_open_gop_frame_accurate` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_rotated_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_single_gop_frame_accurate` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_start_zero_copy` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_subframe_range_frame_accurate` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_to_eof_copy` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_vfr_frame_accurate` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_frame_accurate` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/huge_h264_mov_copy_peakmem` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_copy_lazyread` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_frame_accurate_throughput` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/massive_h264_copy_sustained` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/mkv_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/mov_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_zero_length_range` | — | — | — | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/vp8_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_alpha_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_keyframe_aligned` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_noop_full_range_idempotent` | N/A | — | ERROR | N/A | N/A | N/A | N/A | N/A |

<details><summary>Cell details</summary>

- `aibrush-media@dev` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `audio-dsp/edge_longform_audio_probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `demux/aac_adts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/av1_720p_5s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/empty_audio_zero_packets` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/flac_noseektable` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/flac_seektable` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/h264_1080p_30s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/h264_1080p_5s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/h264_4k_10s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/h264_bframes_1080p` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/h264_in_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/h264_multitrack` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/h264_rotated90` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/h264_ts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/h264_vfr` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/hevc_1080p_10s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/hls_aes128` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/hls_vod` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/mp3_cbr_notoc` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/mp3_xing` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/opus` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/pcm_s16be` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/size_huge_huge_h264_1080p_600s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/size_large_large_h264_1080p_120s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/size_large_large_vp9_1080p_120s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/size_massive_massive_h264_1080p_2h` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/size_micro_micro_audio_short` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/size_micro_micro_h264_1frame` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/size_tiny_tiny_h264_360p_2s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/size_tiny_tiny_vp9_360p_2s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/vp8_720p_10s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/vp9_1080p_10s` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/vp9_alpha` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/wav_f32` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/wav_s16` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `demux/wav_s24` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `aibrush-media@dev` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/read_flac_seektable` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_h264_1080p_30s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_h264_1080p_5s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_h264_in_mkv` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_h264_multitrack` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_mp3_xing` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_no_tags_recorder_webm` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_no_tags_wav` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_opus` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/read_vp9_1080p_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/tracks_attribution_multitrack` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `metadata/tracks_packet_attribution_multitrack` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/write_mkv_tags` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/write_mp3_id3` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/write_mp4_tags` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/bundle-size` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/convert-longtasks` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/decode-fps` — **N/A**: engine does not declare operation 'decodeFrames'
- `aibrush-media@dev` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/extract-metadata` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/iterate-video-packets` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/metamorphic-vfr-iterate-packets` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/metamorphic-vfr-probe-duration` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/op-sweep-demux` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/op-sweep-probe` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `performance/op-sweep-transcode-webm` — **N/A**: engine does not declare operation 'transcode'
- `aibrush-media@dev` · `performance/seek-ms` — **N/A**: engine does not declare operation 'seek'
- `aibrush-media@dev` · `performance/size-ladder-demux-peak-memory-huge` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/size-ladder-demux-peak-memory-large` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/size-ladder-demux-peak-memory-large4k` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-huge` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-large` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-large4k` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-massive` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-medium` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-extract-metadata-tiny` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-huge` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-large` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-large4k` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-massive` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-medium` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `performance/size-ladder-iterate-packets-tiny` — **N/A**: engine does not declare operation 'demux'
- `aibrush-media@dev` · `probe/aac_adts` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/av1_720p_5s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/big_buck_bunny_1080p_h264` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/cenc_cbcs` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/cenc_ctr` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/empty-audio-wav` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/flac_noseektable` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/flac_seektable` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_1080p_30s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_1080p_5s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_4k_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_bframes_1080p` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_in_mkv` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_multitrack` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_rotated90` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_ts` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/h264_vfr` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/hevc_1080p_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/hls_aes128` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/hls_vod` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/huge_h264_1080p_600s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/large_h264_1080p_120s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/large_vp9_1080p_120s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/longform_1h_audio` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/massive_h264_1080p_2h` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/metamorphic-duration-across-containers` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/metamorphic-recorder-headerless-sane-duration` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/micro_audio_short` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/micro_h264_1frame` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/mp3_cbr_notoc` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/mp3_xing` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/opus` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/pcm_s16be` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/perf-extract-metadata-huge` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/perf-extract-metadata-large` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/perf-extract-metadata-massive` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/recorder_headerless` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/tiny_h264_360p_2s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/tiny_vp9_360p_2s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/truncated-header-graceful` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/vp8_720p_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/vp9_1080p_10s` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/vp9_alpha` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/wav_f32` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/wav_s16` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `probe/wav_s24` — **N/A**: engine does not declare operation 'probe'
- `aibrush-media@dev` · `remux/aac_adts_adts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_1080p_5s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_in_mkv_mkv_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/buffer_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_probe_dur_fragmented_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `aibrush-media@dev` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `aibrush-media@dev` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `ffmpeg.wasm@0.12.15` · `performance/convert-webm-resize-320x180` — **ERROR**: RuntimeError: memory access out of bounds
- `mediabunny@1.48.0` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `mediabunny@1.48.0` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare feature 'downmix'
- `mediabunny@1.48.0` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare feature 'downmix'
- `mediabunny@1.48.0` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/edge_gapless_aac_decode` — **ERROR**: mediabunny decodeFrames: no video track in input
- `mediabunny@1.48.0` · `audio-dsp/edge_longform_audio_probe` — **ERROR**: failed to fetch corpus asset 'longform_1h_audio_pcm.wav' (404 Not Found)
- `mediabunny@1.48.0` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare feature 'fade'
- `mediabunny@1.48.0` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare feature 'gain'
- `mediabunny@1.48.0` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare feature 'gain'
- `mediabunny@1.48.0` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare input container 'jpeg'
- `mediabunny@1.48.0` · `audio-dsp/pcm_f32_to_s16` — **N/A**: browser cannot encode audio codec 'pcm-f32' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_s16_to_f32` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare output container 'aiff'
- `mediabunny@1.48.0` · `audio-dsp/pcm_s24_to_f32` — **N/A**: browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_s24_to_s16` — **N/A**: browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare feature 'resample'
- `mediabunny@1.48.0` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare feature 'resample'
- `mediabunny@1.48.0` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare feature 'resample'
- `mediabunny@1.48.0` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `audio-dsp/throughput_decode_s24` — **ERROR**: mediabunny decodeFrames: no video track in input
- `mediabunny@1.48.0` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare output container 'aiff'
- `mediabunny@1.48.0` · `audio-dsp/throughput_encode_s24` — **N/A**: browser cannot encode audio codec 'pcm-f32' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare feature 'upmix'
- `mediabunny@1.48.0` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare feature 'upmix'
- `mediabunny@1.48.0` · `demux/flac_noseektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `demux/flac_seektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `demux/h264_bframes_1080p` — **FAIL**: oracle 'golden-packets' failed: 256 packets had a size mismatch; 256 packets pts drift beyond ±1000µs after per-track origin alignment
- `mediabunny@1.48.0` · `demux/h264_vfr` — **FAIL**: oracle 'golden-packets' failed: 95 packets had a size mismatch; 95 packets pts drift beyond ±1000µs after per-track origin alignment; 87 packets dts drift beyond ±1000µs after per-track origin alignment
- `mediabunny@1.48.0` · `demux/hls_aes128` — **N/A**: engine does not declare encryption scheme 'hls-aes128'
- `mediabunny@1.48.0` · `demux/hls_vod` — **ERROR**: Input has an unsupported or unrecognizable format.
- `mediabunny@1.48.0` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `demux/opus` — **FAIL**: oracle 'golden-packets' failed: 500 packets pts drift beyond ±1000µs after per-track origin alignment; 500 packets dts drift beyond ±1000µs after per-track origin alignment
- `mediabunny@1.48.0` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `demux/size_huge_huge_h264_1080p_600s` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mediabunny@1.48.0` · `demux/size_large_large_h264_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `demux/size_large_large_vp9_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_vp9_1080p_120s.webm' (404 Not Found)
- `mediabunny@1.48.0` · `demux/size_massive_massive_h264_1080p_2h` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `demux/vp8_720p_10s` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `demux/wav_f32` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 118 vs golden 59; trackIndex layout: measured {"0":118} vs golden {"0":59}; 59 packets had a size mismatch; 58 packets pts drift beyond ±1000µs after per-track origin alignment; 58 packets dts drift beyond ±1000µs after per-track origin alignment
- `mediabunny@1.48.0` · `demux/wav_s16` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 118 vs golden 59; trackIndex layout: measured {"0":118} vs golden {"0":59}; 59 packets had a size mismatch; 58 packets pts drift beyond ±1000µs after per-track origin alignment; 58 packets dts drift beyond ±1000µs after per-track origin alignment
- `mediabunny@1.48.0` · `demux/wav_s24` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 118 vs golden 59; trackIndex layout: measured {"0":118} vs golden {"0":59}; 59 packets had a size mismatch; 58 packets pts drift beyond ±1000µs after per-track origin alignment; 58 packets dts drift beyond ±1000µs after per-track origin alignment
- `mediabunny@1.48.0` · `encryption/cenc_cbcs_decrypt` — **ERROR**: failed to fetch corpus asset 'cenc_cbcs.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare feature 'encryption:cens'
- `mediabunny@1.48.0` · `encryption/cenc_ctr_decrypt` — **ERROR**: offset is out of bounds
- `mediabunny@1.48.0` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **ERROR**: offset is out of bounds
- `mediabunny@1.48.0` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare feature 'encryption:clearkey'
- `mediabunny@1.48.0` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare encryption scheme 'hls-aes128'
- `mediabunny@1.48.0` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare encryption scheme 'hls-aes128'
- `mediabunny@1.48.0` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare feature 'encryption:sample-aes'
- `mediabunny@1.48.0` · `encryption/perf_cenc_ctr_decrypt_throughput` — **ERROR**: offset is out of bounds
- `mediabunny@1.48.0` · `encryption/unencrypted_left_untouched_noop` — **FAIL**: oracle 'property-invariant' failed: [decode-cleartext-baseline] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `metadata/meta_consistent_mp4_to_mkv` — **FAIL**: oracle 'property-invariant' failed: [probe-duration] no reference engine to probe output duration
- `mediabunny@1.48.0` · `metadata/read_flac_seektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `metadata/read_no_tags_recorder_webm` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `mediabunny@1.48.0` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `metadata/rotation_survives_mp4_mkv` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `metadata/write_flac_vorbiscomment` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `metadata/write_mkv_tags` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `metadata/write_mp3_id3` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `metadata/write_mp4_tags` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `metadata/write_ogg_vorbiscomment` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `mux/audio_only_aac_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/av1_opus_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/drop_audio_track_subset_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/edge_bframes_decode_mux_mkv` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/edge_bframes_decode_mux_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/edge_hevc_decode_mux_mkv` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/edge_hevc_decode_mux_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/edge_multitrack_keep_all_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/edge_rotation_decode_mux_mkv` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/edge_rotation_decode_mux_mov` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/flac_to_mkv_audio` — **N/A**: browser cannot encode audio codec 'flac' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `mux/h264_aac_to_ts` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/mp3_to_mp3` — **N/A**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `mux/mp3_to_mp4_audio` — **N/A**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `mux/mp4_faststart_reserve` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/mp4_fragmented_cmaf` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/mp4_progressive_buffer` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/mp4_streaming_target` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/opus_to_ogg` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/opus_to_webm_audio` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/pcm_f32_to_wav` — **N/A**: browser cannot encode audio codec 'pcm-f32' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `mux/pcm_s16_to_wav` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `mux/pcm_s24_to_wav` — **N/A**: browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `mux/prop_av1_mux_duration_webm_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/prop_h264_mux_duration_mp4_to_ts` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/prop_vp9_decode_mux_webm_to_webm` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/prop_vp9_mux_duration_webm_to_webm` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/size_large_1080p_to_mkv` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/size_large_1080p_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/size_longform_audio_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/size_micro_1frame_to_mkv` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/size_micro_1frame_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/size_tiny_360p_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/swap_audio_video_with_opus_to_mkv` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/three_track_assembly_to_mkv` — **N/A**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `mux/video_a_plus_audio_b_to_mkv` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/video_plus_audio_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/vorbis_to_ogg` — **N/A**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `mux/vp9_opus_to_webm` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/vp9_video_plus_opus_audio_to_webm` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `performance/convert-longtasks` — **FAIL**: oracle 'ssim-psnr' failed: vs in-browser reference (source decoded + downscaled to 320x180): SSIM mean 0.9691 (min 0.9659); PSNR mean 23.4 dB (advisory) over 8 frame(s); gate SSIM≥0.97
- `mediabunny@1.48.0` · `performance/convert-peak-memory` — **FAIL**: oracle 'ssim-psnr' failed: vs in-browser reference (source decoded + downscaled to 320x180): SSIM mean 0.9691 (min 0.9659); PSNR mean 23.4 dB (advisory) over 8 frame(s); gate SSIM≥0.97
- `mediabunny@1.48.0` · `performance/convert-webm-resize-320x180` — **FAIL**: oracle 'ssim-psnr' failed: vs in-browser reference (source decoded + downscaled to 320x180): SSIM mean 0.9691 (min 0.9659); PSNR mean 23.4 dB (advisory) over 8 frame(s); gate SSIM≥0.97
- `mediabunny@1.48.0` · `performance/decode-fps` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `performance/metamorphic-decode-remux` — **FAIL**: oracle 'property-invariant' failed: [decode-remux] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `performance/metamorphic-probe-duration-cross-container` — **FAIL**: oracle 'property-invariant' failed: [probe-duration] no reference engine to probe output duration
- `mediabunny@1.48.0` · `performance/metamorphic-transcode-idempotent-source-res` — **FAIL**: oracle 'ssim-psnr' failed: vs in-browser reference (source decoded + downscaled to 1920x1080): SSIM mean 0.9862 (min 0.9751); PSNR mean 39.3 dB (advisory) over 8 frame(s); gate SSIM≥0.99
- `mediabunny@1.48.0` · `performance/metamorphic-vfr-iterate-packets` — **FAIL**: oracle 'golden-packets' failed: 95 packets had a size mismatch; 95 packets pts drift beyond ±1000µs after per-track origin alignment; 87 packets dts drift beyond ±1000µs after per-track origin alignment
- `mediabunny@1.48.0` · `performance/metamorphic-vfr-probe-duration` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 8.786279683377309 vs 8.856
- `mediabunny@1.48.0` · `performance/op-sweep-remux-mp4-to-mkv` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `performance/op-sweep-transcode-webm` — **FAIL**: oracle 'ssim-psnr' failed: vs in-browser reference (source decoded + downscaled to 320x180): SSIM mean 0.9691 (min 0.9659); PSNR mean 23.4 dB (advisory) over 8 frame(s); gate SSIM≥0.97
- `mediabunny@1.48.0` · `performance/size-ladder-demux-peak-memory-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mediabunny@1.48.0` · `performance/size-ladder-demux-peak-memory-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `performance/size-ladder-extract-metadata-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mediabunny@1.48.0` · `performance/size-ladder-extract-metadata-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `performance/size-ladder-extract-metadata-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `performance/size-ladder-iterate-packets-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mediabunny@1.48.0` · `performance/size-ladder-iterate-packets-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `performance/size-ladder-iterate-packets-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `probe/big_buck_bunny_1080p_h264` — **ERROR**: failed to fetch corpus asset 'big_buck_bunny_1080p_h264.mov' (404 Not Found)
- `mediabunny@1.48.0` · `probe/cenc_cbcs` — **ERROR**: failed to fetch corpus asset 'cenc_cbcs.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `probe/flac_noseektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `probe/flac_seektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `probe/h264_vfr` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 8.786279683377309 vs 8.856
- `mediabunny@1.48.0` · `probe/hls_aes128` — **ERROR**: Input has an unsupported or unrecognizable format.
- `mediabunny@1.48.0` · `probe/hls_vod` — **ERROR**: Input has an unsupported or unrecognizable format.
- `mediabunny@1.48.0` · `probe/huge_h264_1080p_600s` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mediabunny@1.48.0` · `probe/large_h264_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `probe/large_vp9_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_vp9_1080p_120s.webm' (404 Not Found)
- `mediabunny@1.48.0` · `probe/longform_1h_audio` — **ERROR**: failed to fetch corpus asset 'longform_1h_audio.m4a' (404 Not Found)
- `mediabunny@1.48.0` · `probe/massive_h264_1080p_2h` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `probe/metamorphic-duration-across-containers` — **FAIL**: oracle 'property-invariant' failed: [probe(x).dur consistent across containers] no ctx.output to probe
- `mediabunny@1.48.0` · `probe/metamorphic-recorder-headerless-sane-duration` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `mediabunny@1.48.0` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `probe/perf-extract-metadata-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mediabunny@1.48.0` · `probe/perf-extract-metadata-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `probe/perf-extract-metadata-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `probe/recorder_headerless` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `mediabunny@1.48.0` · `probe/truncated-header-graceful` — **FAIL**: oracle 'graceful-failure' failed: runner reported 'crash' on malformed input (not graceful)
- `mediabunny@1.48.0` · `probe/vp8_720p_10s` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `remux/aac_adts_adts_to_ts` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `remux/av1_720p_5s_webm_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/av1_720p_5s_webm_to_webm` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/flac_seektable_flac_to_mkv` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `remux/flac_seektable_flac_to_ogg` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `remux/h264_1080p_30s_mp4_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_1080p_30s_mp4_to_mov` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_1080p_30s_mp4_to_ts` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_1080p_5s_mov_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_1080p_5s_mov_to_ts` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_bframes_1080p_mp4_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: 11/12 frame digests differ; frame 1: sha256 c5db9c90…f533 vs golden 1a9d7baf…a62d; frame 2: sha256 6b3c7c08…e567 vs golden df09f706…b048; frame 3: sha256 5a2bc839…aa3d vs golden a0232e68…5876; frame 4: sha256 7a72d007…65fd vs golden e5806581…bf51; frame 5: sha256 00091ea3…7daf vs golden 7f0ee685…91e2; frame 6: sha256 9d86fdb8…a2e6 vs golden dc9efcbf…5d5b
- `mediabunny@1.48.0` · `remux/h264_in_mkv_mkv_to_mov` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_in_mkv_mkv_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_in_mkv_mkv_to_ts` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_multitrack_mp4_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_rotated90_mp4_to_mov` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_ts_ts_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_ts_ts_to_mov` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/h264_ts_ts_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/hevc_1080p_10s_mp4_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/hevc_1080p_10s_mp4_to_mov` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mediabunny@1.48.0` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **ERROR**: failed to fetch corpus asset 'large_vp9_1080p_120s.webm' (404 Not Found)
- `mediabunny@1.48.0` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `remux/micro_audio_short_mp4_to_adts` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `remux/mp3_xing_mp3_to_mkv` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `remux/mp3_xing_mp3_to_mp4` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `remux/opus_ogg_to_mkv` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `remux/opus_ogg_to_webm` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `remux/prop_adts_to_mp4_duration_invariant` — **FAIL**: oracle 'property-invariant' failed: [probe-duration] no reference engine to probe output duration
- `mediabunny@1.48.0` · `remux/prop_bframes_decode_remux_mp4_mkv` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `remux/prop_bframes_decode_remux_mp4_mov` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `remux/prop_mp3_to_mp4_duration_invariant` — **FAIL**: oracle 'property-invariant' failed: [probe-duration] no reference engine to probe output duration
- `mediabunny@1.48.0` · `remux/prop_multitrack_survives_mp4_mkv` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `remux/prop_recorder_headerless_duration_materialized` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `mediabunny@1.48.0` · `remux/prop_rotation_survives_mp4_mov` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `remux/prop_roundtrip_mp4_mkv_mp4` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `remux/prop_ts_to_mp4_duration_materialized` — **FAIL**: oracle 'property-invariant' failed: [probe-duration] no reference engine to probe output duration
- `mediabunny@1.48.0` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `remux/vp9_1080p_10s_webm_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/vp9_1080p_10s_webm_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `remux/vp9_1080p_10s_webm_to_webm` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mediabunny@1.48.0` · `streaming-output/buffer_massive_h264_mp4` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `streaming-output/mp4_buffer_target` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `mediabunny@1.48.0` · `streaming-output/mp4_faststart_none_control` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/mp4_faststart_reserve` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/mp4_fragmented_cmaf` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/mp4_streaming_target` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/mp4_ttfb_buffer_target` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/mp4_ttfb_streaming_target` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/prop_decode_equals_buffer_shape` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `streaming-output/prop_decode_equals_stream_shape` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `mediabunny@1.48.0` · `streaming-output/prop_faststart_reserve_duration_invariant` — **FAIL**: oracle 'property-invariant' failed: [probe-duration] no reference engine to probe output duration
- `mediabunny@1.48.0` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mediabunny@1.48.0` · `streaming-output/prop_probe_dur_buffer_shape` — **FAIL**: oracle 'property-invariant' failed: [probe-duration] no reference engine to probe output duration
- `mediabunny@1.48.0` · `streaming-output/prop_probe_dur_fragmented_shape` — **FAIL**: oracle 'property-invariant' failed: [probe-duration] no reference engine to probe output duration
- `mediabunny@1.48.0` · `streaming-output/prop_probe_dur_stream_shape` — **FAIL**: oracle 'property-invariant' failed: [probe-duration] no reference engine to probe output duration
- `mediabunny@1.48.0` · `streaming-output/prop_ts_stream_duration_materialized` — **FAIL**: oracle 'property-invariant' failed: [probe-duration] no reference engine to probe output duration
- `mediabunny@1.48.0` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare feature 'headerless'
- `mediabunny@1.48.0` · `streaming-output/stream_huge_h264_mov_to_mp4` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mediabunny@1.48.0` · `streaming-output/stream_large_h264_mp4` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `streaming-output/stream_large_vp9_webm` — **ERROR**: failed to fetch corpus asset 'large_vp9_1080p_120s.webm' (404 Not Found)
- `mediabunny@1.48.0` · `streaming-output/stream_massive_h264_mp4` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `streaming-output/ts_continuity_many_writes` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/ts_tiny_writes` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare feature 'headerless'
- `mediabunny@1.48.0` · `streaming-output/webm_streaming_target` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare input container 'aiff'
- `mediabunny@1.48.0` · `trim/audio_flac_noseektable_copy` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `trim/audio_flac_seektable_copy` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `trim/audio_mp3_copy` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/audio_opus_ogg_copy` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/audio_wav_pcm_copy` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/av1_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/fmp4_fragment_boundary_copy` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_bframes_frame_accurate` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_frame_accurate` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_keyframe_aligned_short` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_multitrack_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_noop_full_range_idempotent` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_open_gop_frame_accurate` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_rotated_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_single_gop_frame_accurate` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_start_zero_copy` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_subframe_range_frame_accurate` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_to_eof_copy` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_vfr_frame_accurate` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/hevc_frame_accurate` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/hevc_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/huge_h264_mov_copy_peakmem` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mediabunny@1.48.0` · `trim/large_h264_copy_lazyread` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `trim/large_h264_frame_accurate_throughput` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `trim/massive_h264_copy_sustained` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `trim/mkv_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/mov_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/ts_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/vp8_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/vp9_alpha_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/vp9_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/vp9_noop_full_range_idempotent` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mp4box@2.3.0` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `mp4box@2.3.0` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `audio-dsp/edge_longform_audio_probe` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `demux/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `demux/av1_720p_5s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `demux/empty_audio_zero_packets` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `demux/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `demux/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `demux/h264_in_mkv` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `demux/h264_ts` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `demux/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `mp4box@2.3.0` · `demux/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `mp4box@2.3.0` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `demux/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `demux/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `demux/size_huge_huge_h264_1080p_600s` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mp4box@2.3.0` · `demux/size_large_large_h264_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mp4box@2.3.0` · `demux/size_large_large_vp9_1080p_120s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `demux/size_massive_massive_h264_1080p_2h` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mp4box@2.3.0` · `demux/size_tiny_tiny_vp9_360p_2s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `demux/vp8_720p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `demux/vp9_1080p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `demux/vp9_alpha` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `demux/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `demux/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `demux/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `mp4box@2.3.0` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `metadata/read_flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `metadata/read_h264_in_mkv` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `metadata/read_mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `metadata/read_no_tags_recorder_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `metadata/read_no_tags_wav` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `metadata/read_vp9_1080p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `metadata/write_mkv_tags` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `metadata/write_mp3_id3` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `metadata/write_mp4_tags` — **N/A**: engine does not declare feature 'metadata:write'
- `mp4box@2.3.0` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `performance/convert-longtasks` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/decode-fps` — **N/A**: engine does not declare operation 'decodeFrames'
- `mp4box@2.3.0` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: engine does not declare output container 'webm'
- `mp4box@2.3.0` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `performance/op-sweep-transcode-webm` — **N/A**: engine does not declare operation 'transcode'
- `mp4box@2.3.0` · `performance/seek-ms` — **N/A**: engine does not declare operation 'seek'
- `mp4box@2.3.0` · `performance/size-ladder-demux-peak-memory-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mp4box@2.3.0` · `performance/size-ladder-demux-peak-memory-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mp4box@2.3.0` · `performance/size-ladder-extract-metadata-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mp4box@2.3.0` · `performance/size-ladder-extract-metadata-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mp4box@2.3.0` · `performance/size-ladder-extract-metadata-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mp4box@2.3.0` · `performance/size-ladder-iterate-packets-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mp4box@2.3.0` · `performance/size-ladder-iterate-packets-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mp4box@2.3.0` · `performance/size-ladder-iterate-packets-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mp4box@2.3.0` · `probe/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `probe/av1_720p_5s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/big_buck_bunny_1080p_h264` — **ERROR**: failed to fetch corpus asset 'big_buck_bunny_1080p_h264.mov' (404 Not Found)
- `mp4box@2.3.0` · `probe/cenc_cbcs` — **ERROR**: failed to fetch corpus asset 'cenc_cbcs.mp4' (404 Not Found)
- `mp4box@2.3.0` · `probe/empty-audio-wav` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `probe/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `probe/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `probe/h264_in_mkv` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `probe/h264_ts` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `probe/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `mp4box@2.3.0` · `probe/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `mp4box@2.3.0` · `probe/huge_h264_1080p_600s` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mp4box@2.3.0` · `probe/large_h264_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mp4box@2.3.0` · `probe/large_vp9_1080p_120s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/longform_1h_audio` — **ERROR**: failed to fetch corpus asset 'longform_1h_audio.m4a' (404 Not Found)
- `mp4box@2.3.0` · `probe/massive_h264_1080p_2h` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mp4box@2.3.0` · `probe/metamorphic-duration-across-containers` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `probe/metamorphic-recorder-headerless-sane-duration` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `probe/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `mp4box@2.3.0` · `probe/perf-extract-metadata-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mp4box@2.3.0` · `probe/perf-extract-metadata-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mp4box@2.3.0` · `probe/perf-extract-metadata-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mp4box@2.3.0` · `probe/recorder_headerless` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/tiny_vp9_360p_2s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/truncated-header-graceful` — **ERROR**: mp4box: moov not found (not an ISO-BMFF/MP4 file, or moov truncated)
- `mp4box@2.3.0` · `probe/vp8_720p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/vp9_1080p_10s` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/vp9_alpha` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `probe/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `probe/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `probe/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `mp4box@2.3.0` · `remux/aac_adts_adts_to_mp4` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare input container 'flac'
- `mp4box@2.3.0` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/h264_1080p_5s_mov_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `mp4box@2.3.0` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `remux/h264_in_mkv_mkv_to_mp4` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare input container 'mkv'
- `mp4box@2.3.0` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mp4box@2.3.0` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare output container 'adts'
- `mp4box@2.3.0` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare input container 'ogg'
- `mp4box@2.3.0` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare input container 'adts'
- `mp4box@2.3.0` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare input container 'mp3'
- `mp4box@2.3.0` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare output container 'mov'
- `mp4box@2.3.0` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare output container 'mkv'
- `mp4box@2.3.0` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare input container 'ts'
- `mp4box@2.3.0` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `streaming-output/buffer_massive_h264_mp4` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mp4box@2.3.0` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `mp4box@2.3.0` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `mp4box@2.3.0` · `streaming-output/prop_decode_equals_buffer_shape` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mp4box@2.3.0` · `streaming-output/prop_decode_equals_stream_shape` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mp4box@2.3.0` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `mp4box@2.3.0` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `mp4box@2.3.0` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `mp4box@2.3.0` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `streaming-output/stream_huge_h264_mov_to_mp4` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `mp4box@2.3.0` · `streaming-output/stream_large_h264_mp4` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `mp4box@2.3.0` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `streaming-output/stream_massive_h264_mp4` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `mp4box@2.3.0` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare output container 'ts'
- `mp4box@2.3.0` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare input container 'webm'
- `mp4box@2.3.0` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `platform@chrome-149` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/edge_gapless_aac_decode` — **ERROR**: <video> has zero intrinsic size (not enough data decoded)
- `platform@chrome-149` · `audio-dsp/edge_longform_audio_probe` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare input container 'jpeg'
- `platform@chrome-149` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `demux/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `platform@chrome-149` · `demux/empty_audio_zero_packets` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `demux/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `demux/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `demux/h264_ts` — **N/A**: engine does not declare input container 'ts'
- `platform@chrome-149` · `demux/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `platform@chrome-149` · `demux/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `platform@chrome-149` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `demux/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `demux/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `demux/size_huge_huge_h264_1080p_600s` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `platform@chrome-149` · `demux/size_large_large_h264_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `platform@chrome-149` · `demux/size_large_large_vp9_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_vp9_1080p_120s.webm' (404 Not Found)
- `platform@chrome-149` · `demux/size_massive_massive_h264_1080p_2h` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `platform@chrome-149` · `demux/vp8_720p_10s` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `platform@chrome-149` · `demux/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `demux/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `demux/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/read_flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `metadata/read_h264_in_mkv` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 30.303 vs 30
- `platform@chrome-149` · `metadata/read_mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `metadata/read_no_tags_recorder_webm` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `platform@chrome-149` · `metadata/read_no_tags_wav` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `metadata/read_vp9_1080p_10s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 30.303 vs 30
- `platform@chrome-149` · `metadata/rotation_decode_read_h264_rotated90` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `platform@chrome-149` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/write_mkv_tags` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/write_mp3_id3` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/write_mp4_tags` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `platform@chrome-149` · `performance/bundle-size` — **FAIL**: oracle 'golden-metadata' failed: track count: measured 1 vs golden 2
- `platform@chrome-149` · `performance/convert-longtasks` — **ERROR**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `performance/convert-peak-memory` — **ERROR**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `performance/decode-fps` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `platform@chrome-149` · `performance/encode-fps` — **ERROR**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `performance/extract-metadata` — **N/A**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `performance/iterate-video-packets` — **N/A**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `performance/metamorphic-transcode-idempotent-source-res` — **ERROR**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `performance/metamorphic-vfr-probe-duration` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 10 vs 8.856
- `platform@chrome-149` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `performance/op-sweep-transcode-webm` — **ERROR**: platform engine: transcode is NA — the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track
- `platform@chrome-149` · `performance/size-ladder-demux-peak-memory-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `platform@chrome-149` · `performance/size-ladder-demux-peak-memory-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `platform@chrome-149` · `performance/size-ladder-extract-metadata-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `platform@chrome-149` · `performance/size-ladder-extract-metadata-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `platform@chrome-149` · `performance/size-ladder-extract-metadata-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `platform@chrome-149` · `performance/size-ladder-iterate-packets-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `platform@chrome-149` · `performance/size-ladder-iterate-packets-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `platform@chrome-149` · `performance/size-ladder-iterate-packets-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `platform@chrome-149` · `probe/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `platform@chrome-149` · `probe/av1_720p_5s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 30.303 vs 30
- `platform@chrome-149` · `probe/big_buck_bunny_1080p_h264` — **ERROR**: failed to fetch corpus asset 'big_buck_bunny_1080p_h264.mov' (404 Not Found)
- `platform@chrome-149` · `probe/cenc_cbcs` — **ERROR**: failed to fetch corpus asset 'cenc_cbcs.mp4' (404 Not Found)
- `platform@chrome-149` · `probe/cenc_ctr` — **FAIL**: oracle 'golden-metadata' failed: track count: measured 1 vs golden 2; track[0].codec: 'unknown' vs 'h264'; track[0].fps: null vs 29.872
- `platform@chrome-149` · `probe/empty-audio-wav` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `probe/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `probe/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `platform@chrome-149` · `probe/h264_in_mkv` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 30.303 vs 30
- `platform@chrome-149` · `probe/h264_ts` — **N/A**: engine does not declare input container 'ts'
- `platform@chrome-149` · `probe/h264_vfr` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 10 vs 8.856
- `platform@chrome-149` · `probe/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `platform@chrome-149` · `probe/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `platform@chrome-149` · `probe/huge_h264_1080p_600s` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `platform@chrome-149` · `probe/large_h264_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `platform@chrome-149` · `probe/large_vp9_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_vp9_1080p_120s.webm' (404 Not Found)
- `platform@chrome-149` · `probe/longform_1h_audio` — **ERROR**: failed to fetch corpus asset 'longform_1h_audio.m4a' (404 Not Found)
- `platform@chrome-149` · `probe/massive_h264_1080p_2h` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `platform@chrome-149` · `probe/metamorphic-duration-across-containers` — **FAIL**: oracle 'property-invariant' failed: [probe(x).dur consistent across containers] no ctx.output to probe
- `platform@chrome-149` · `probe/metamorphic-recorder-headerless-sane-duration` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `platform@chrome-149` · `probe/micro_h264_1frame` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 1
- `platform@chrome-149` · `probe/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `probe/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `platform@chrome-149` · `probe/perf-extract-metadata-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `platform@chrome-149` · `probe/perf-extract-metadata-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `platform@chrome-149` · `probe/perf-extract-metadata-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `platform@chrome-149` · `probe/recorder_headerless` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `platform@chrome-149` · `probe/tiny_vp9_360p_2s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 30.303 vs 30
- `platform@chrome-149` · `probe/truncated-header-graceful` — **FAIL**: oracle 'graceful-failure' failed: runner reported 'crash' on malformed input (not graceful)
- `platform@chrome-149` · `probe/vp8_720p_10s` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `platform@chrome-149` · `probe/vp9_1080p_10s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 30.303 vs 30
- `platform@chrome-149` · `probe/vp9_alpha` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: 30.303 vs 30
- `platform@chrome-149` · `probe/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `probe/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `probe/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `platform@chrome-149` · `remux/aac_adts_adts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_5s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_in_mkv_mkv_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/buffer_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_probe_dur_fragmented_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `platform@chrome-149` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `remotion-media-parser@4.0.479` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_gapless_aac_decode` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_longform_audio_probe` — **ERROR**: failed to fetch corpus asset 'longform_1h_audio_pcm.wav' (404 Not Found)
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `demux/flac_noseektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-media-parser@4.0.479` · `demux/flac_seektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-media-parser@4.0.479` · `demux/h264_1080p_5s` — **N/A**: engine does not declare input container 'mov'
- `remotion-media-parser@4.0.479` · `demux/h264_bframes_1080p` — **FAIL**: oracle 'golden-packets' failed: 1 packets had a keyframe-flag mismatch
- `remotion-media-parser@4.0.479` · `demux/h264_in_mkv` — **N/A**: engine does not declare input container 'mkv'
- `remotion-media-parser@4.0.479` · `demux/h264_ts` — **FAIL**: oracle 'golden-packets' failed: 2 packets had a size mismatch; 469 packets pts drift beyond ±1000µs after per-track origin alignment; 469 packets dts drift beyond ±1000µs after per-track origin alignment
- `remotion-media-parser@4.0.479` · `demux/h264_vfr` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 264 vs golden 581; trackIndex layout: measured {"0":111,"1":153} vs golden {"0":111,"1":470}
- `remotion-media-parser@4.0.479` · `demux/hls_aes128` — **N/A**: engine does not declare encryption scheme 'hls-aes128'
- `remotion-media-parser@4.0.479` · `demux/hls_vod` — **ERROR**: Failed to construct 'URL': Invalid base URL
- `remotion-media-parser@4.0.479` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-media-parser@4.0.479` · `demux/mp3_xing` — **FAIL**: oracle 'golden-packets' failed: 369 packets pts drift beyond ±1000µs after per-track origin alignment; 369 packets dts drift beyond ±1000µs after per-track origin alignment
- `remotion-media-parser@4.0.479` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-media-parser@4.0.479` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `demux/size_huge_huge_h264_1080p_600s` — **N/A**: engine does not declare input container 'mov'
- `remotion-media-parser@4.0.479` · `demux/size_large_large_h264_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `demux/size_large_large_vp9_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_vp9_1080p_120s.webm' (404 Not Found)
- `remotion-media-parser@4.0.479` · `demux/size_massive_massive_h264_1080p_2h` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `demux/vp8_720p_10s` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-media-parser@4.0.479` · `demux/wav_f32` — **ERROR**: Only supporting WAVE with PCM audio format, but got 3
- `remotion-media-parser@4.0.479` · `demux/wav_s16` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 125 vs golden 59; trackIndex layout: measured {"0":125} vs golden {"0":59}; 59 packets had a size mismatch; 58 packets pts drift beyond ±1000µs after per-track origin alignment; 58 packets dts drift beyond ±1000µs after per-track origin alignment
- `remotion-media-parser@4.0.479` · `demux/wav_s24` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 125 vs golden 59; trackIndex layout: measured {"0":125} vs golden {"0":59}; 59 packets had a size mismatch; 58 packets pts drift beyond ±1000µs after per-track origin alignment; 58 packets dts drift beyond ±1000µs after per-track origin alignment
- `remotion-media-parser@4.0.479` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-media-parser@4.0.479` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/read_flac_seektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-media-parser@4.0.479` · `metadata/read_h264_1080p_5s` — **N/A**: engine does not declare input container 'mov'
- `remotion-media-parser@4.0.479` · `metadata/read_h264_in_mkv` — **N/A**: engine does not declare input container 'mkv'
- `remotion-media-parser@4.0.479` · `metadata/read_no_tags_recorder_webm` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `remotion-media-parser@4.0.479` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-media-parser@4.0.479` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `metadata/read_vp9_1080p_10s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 30
- `remotion-media-parser@4.0.479` · `metadata/rotation_decode_read_h264_rotated90` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/write_mkv_tags` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/write_mp3_id3` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/write_mp4_tags` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-media-parser@4.0.479` · `performance/convert-longtasks` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/decode-fps` — **N/A**: engine does not declare operation 'decodeFrames'
- `remotion-media-parser@4.0.479` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/metamorphic-vfr-iterate-packets` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 264 vs golden 581; trackIndex layout: measured {"0":111,"1":153} vs golden {"0":111,"1":470}
- `remotion-media-parser@4.0.479` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `performance/op-sweep-transcode-webm` — **N/A**: engine does not declare operation 'transcode'
- `remotion-media-parser@4.0.479` · `performance/seek-ms` — **N/A**: engine does not declare operation 'seek'
- `remotion-media-parser@4.0.479` · `performance/size-ladder-demux-peak-memory-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `remotion-media-parser@4.0.479` · `performance/size-ladder-demux-peak-memory-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `performance/size-ladder-extract-metadata-huge` — **N/A**: engine does not declare input container 'mov'
- `remotion-media-parser@4.0.479` · `performance/size-ladder-extract-metadata-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `performance/size-ladder-extract-metadata-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `performance/size-ladder-iterate-packets-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `remotion-media-parser@4.0.479` · `performance/size-ladder-iterate-packets-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `performance/size-ladder-iterate-packets-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `probe/aac_adts` — **FAIL**: oracle 'golden-metadata' failed: duration: measured null vs golden 10.031s
- `remotion-media-parser@4.0.479` · `probe/av1_720p_5s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 30
- `remotion-media-parser@4.0.479` · `probe/big_buck_bunny_1080p_h264` — **N/A**: engine does not declare input container 'mov'
- `remotion-media-parser@4.0.479` · `probe/cenc_cbcs` — **ERROR**: failed to fetch corpus asset 'cenc_cbcs.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `probe/cenc_ctr` — **FAIL**: oracle 'golden-metadata' failed: duration: measured null vs golden 5.021s; track[0].type: 'other' vs 'video'; track[0].codec: 'unknown' vs 'h264'; track[0].width: undefined vs 1280; track[0].height: undefined vs 720; track[0].fps: null vs 29.872; track[1].type: 'other' vs 'audio'; track[1].codec: 'unknown' vs 'aac'; track[1].sampleRate: undefined vs 48000; track[1].channels: undefined vs 2
- `remotion-media-parser@4.0.479` · `probe/flac_noseektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-media-parser@4.0.479` · `probe/flac_seektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-media-parser@4.0.479` · `probe/h264_1080p_5s` — **N/A**: engine does not declare input container 'mov'
- `remotion-media-parser@4.0.479` · `probe/h264_in_mkv` — **N/A**: engine does not declare input container 'mkv'
- `remotion-media-parser@4.0.479` · `probe/h264_ts` — **FAIL**: oracle 'golden-metadata' failed: duration: measured null vs golden 10.021s; track[0].fps: null vs 30
- `remotion-media-parser@4.0.479` · `probe/hls_aes128` — **ERROR**: Unknown directive #EXT-X-KEY. Value: METHOD=AES-128,URI="hls_aes128.key",IV=0x953e5e232e1585e615d9164ece153cf2
- `remotion-media-parser@4.0.479` · `probe/hls_vod` — **ERROR**: Failed to construct 'URL': Invalid base URL
- `remotion-media-parser@4.0.479` · `probe/huge_h264_1080p_600s` — **N/A**: engine does not declare input container 'mov'
- `remotion-media-parser@4.0.479` · `probe/large_h264_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `probe/large_vp9_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_vp9_1080p_120s.webm' (404 Not Found)
- `remotion-media-parser@4.0.479` · `probe/longform_1h_audio` — **ERROR**: failed to fetch corpus asset 'longform_1h_audio.m4a' (404 Not Found)
- `remotion-media-parser@4.0.479` · `probe/massive_h264_1080p_2h` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `probe/metamorphic-duration-across-containers` — **N/A**: engine does not declare input container 'mkv'
- `remotion-media-parser@4.0.479` · `probe/metamorphic-recorder-headerless-sane-duration` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `remotion-media-parser@4.0.479` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-media-parser@4.0.479` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-media-parser@4.0.479` · `probe/perf-extract-metadata-huge` — **N/A**: engine does not declare input container 'mov'
- `remotion-media-parser@4.0.479` · `probe/perf-extract-metadata-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `probe/perf-extract-metadata-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `remotion-media-parser@4.0.479` · `probe/recorder_headerless` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `remotion-media-parser@4.0.479` · `probe/tiny_vp9_360p_2s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 30
- `remotion-media-parser@4.0.479` · `probe/truncated-header-graceful` — **ERROR**: Error in Media Parser: End of parsing of [object Blob] has been reached, but no tracks have been found
- `remotion-media-parser@4.0.479` · `probe/vp8_720p_10s` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-media-parser@4.0.479` · `probe/vp9_1080p_10s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 30
- `remotion-media-parser@4.0.479` · `probe/vp9_alpha` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 30
- `remotion-media-parser@4.0.479` · `probe/wav_f32` — **ERROR**: Only supporting WAVE with PCM audio format, but got 3
- `remotion-media-parser@4.0.479` · `remux/aac_adts_adts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_5s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_in_mkv_mkv_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/buffer_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_probe_dur_fragmented_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `remotion-media-parser@4.0.479` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-media-parser@4.0.479` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `remotion-webcodecs@4.0.479` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare feature 'downmix'
- `remotion-webcodecs@4.0.479` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare feature 'downmix'
- `remotion-webcodecs@4.0.479` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/edge_gapless_aac_decode` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `audio-dsp/edge_longform_audio_probe` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/longform_1h_audio_pcm.wav and range 0
- `remotion-webcodecs@4.0.479` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare feature 'fade'
- `remotion-webcodecs@4.0.479` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare feature 'gain'
- `remotion-webcodecs@4.0.479` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare feature 'gain'
- `remotion-webcodecs@4.0.479` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare audio codec 'pcm-s16be'
- `remotion-webcodecs@4.0.479` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare input container 'jpeg'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_f32_to_s16` — **N/A**: browser cannot encode audio codec 'pcm-f32' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s16_to_f32` — **N/A**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare output container 'aiff'
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s24_to_f32` — **N/A**: browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s24_to_s16` — **N/A**: browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare feature 'resample'
- `remotion-webcodecs@4.0.479` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare feature 'resample'
- `remotion-webcodecs@4.0.479` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare feature 'resample'
- `remotion-webcodecs@4.0.479` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `audio-dsp/throughput_decode_s24` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare output container 'aiff'
- `remotion-webcodecs@4.0.479` · `audio-dsp/throughput_encode_s24` — **N/A**: browser cannot encode audio codec 'pcm-f32' (WebCodecs AudioEncoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare feature 'upmix'
- `remotion-webcodecs@4.0.479` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare feature 'upmix'
- `remotion-webcodecs@4.0.479` · `demux/flac_noseektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `demux/flac_seektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `demux/h264_bframes_1080p` — **FAIL**: oracle 'golden-packets' failed: 1 packets had a keyframe-flag mismatch
- `remotion-webcodecs@4.0.479` · `demux/h264_ts` — **FAIL**: oracle 'golden-packets' failed: 2 packets had a size mismatch; 469 packets pts drift beyond ±1000µs after per-track origin alignment; 469 packets dts drift beyond ±1000µs after per-track origin alignment
- `remotion-webcodecs@4.0.479` · `demux/h264_vfr` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 264 vs golden 581; trackIndex layout: measured {"0":111,"1":153} vs golden {"0":111,"1":470}
- `remotion-webcodecs@4.0.479` · `demux/hls_aes128` — **N/A**: engine does not declare encryption scheme 'hls-aes128'
- `remotion-webcodecs@4.0.479` · `demux/hls_vod` — **ERROR**: Failed to construct 'URL': Invalid base URL
- `remotion-webcodecs@4.0.479` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `demux/mp3_xing` — **FAIL**: oracle 'golden-packets' failed: 369 packets pts drift beyond ±1000µs after per-track origin alignment; 369 packets dts drift beyond ±1000µs after per-track origin alignment
- `remotion-webcodecs@4.0.479` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `demux/size_huge_huge_h264_1080p_600s` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/huge_h264_1080p_600s.mov and range 0
- `remotion-webcodecs@4.0.479` · `demux/size_large_large_h264_1080p_120s` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/large_h264_1080p_120s.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `demux/size_large_large_vp9_1080p_120s` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/large_vp9_1080p_120s.webm and range 0
- `remotion-webcodecs@4.0.479` · `demux/size_massive_massive_h264_1080p_2h` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/massive_h264_1080p_2h.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `demux/vp8_720p_10s` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `demux/wav_f32` — **ERROR**: Only supporting WAVE with PCM audio format, but got 3
- `remotion-webcodecs@4.0.479` · `demux/wav_s16` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 125 vs golden 59; trackIndex layout: measured {"0":125} vs golden {"0":59}; 59 packets had a size mismatch; 58 packets pts drift beyond ±1000µs after per-track origin alignment; 58 packets dts drift beyond ±1000µs after per-track origin alignment
- `remotion-webcodecs@4.0.479` · `demux/wav_s24` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 125 vs golden 59; trackIndex layout: measured {"0":125} vs golden {"0":59}; 59 packets had a size mismatch; 58 packets pts drift beyond ±1000µs after per-track origin alignment; 58 packets dts drift beyond ±1000µs after per-track origin alignment
- `remotion-webcodecs@4.0.479` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `remotion-webcodecs@4.0.479` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `metadata/read_flac_seektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `metadata/read_h264_1080p_5s` — **FAIL**: oracle 'golden-metadata' failed: container: measured 'mp4' vs golden 'mov'
- `remotion-webcodecs@4.0.479` · `metadata/read_h264_in_mkv` — **FAIL**: oracle 'golden-metadata' failed: container: measured 'webm' vs golden 'mkv'; track[0].fps: null vs 30
- `remotion-webcodecs@4.0.479` · `metadata/read_no_tags_recorder_webm` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/recorder_headerless.webm and range 0
- `remotion-webcodecs@4.0.479` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `metadata/read_vp9_1080p_10s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 30
- `remotion-webcodecs@4.0.479` · `metadata/rotation_decode_read_h264_rotated90` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare output container 'flac'
- `remotion-webcodecs@4.0.479` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare output container 'flac'
- `remotion-webcodecs@4.0.479` · `metadata/write_mkv_tags` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `metadata/write_mp3_id3` — **N/A**: engine does not declare output container 'mp3'
- `remotion-webcodecs@4.0.479` · `metadata/write_mp4_tags` — **N/A**: engine does not declare feature 'metadata:write'
- `remotion-webcodecs@4.0.479` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `remotion-webcodecs@4.0.479` · `performance/decode-fps` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `performance/metamorphic-vfr-iterate-packets` — **FAIL**: oracle 'golden-packets' failed: packet count: measured 264 vs golden 581; trackIndex layout: measured {"0":111,"1":153} vs golden {"0":111,"1":470}
- `remotion-webcodecs@4.0.479` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `performance/op-sweep-transcode-webm` — **FAIL**: oracle 'reference-reimport' failed: packet count: reimport 2403 vs golden 2308; keyframes: reimport 1526 vs golden 1423
- `remotion-webcodecs@4.0.479` · `performance/size-ladder-demux-peak-memory-huge` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/huge_h264_1080p_600s.mov and range 0
- `remotion-webcodecs@4.0.479` · `performance/size-ladder-demux-peak-memory-large` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/large_h264_1080p_120s.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `performance/size-ladder-extract-metadata-huge` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/huge_h264_1080p_600s.mov and range 0
- `remotion-webcodecs@4.0.479` · `performance/size-ladder-extract-metadata-large` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/large_h264_1080p_120s.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `performance/size-ladder-extract-metadata-massive` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/massive_h264_1080p_2h.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `performance/size-ladder-iterate-packets-huge` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/huge_h264_1080p_600s.mov and range 0
- `remotion-webcodecs@4.0.479` · `performance/size-ladder-iterate-packets-large` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/large_h264_1080p_120s.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `performance/size-ladder-iterate-packets-massive` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/massive_h264_1080p_2h.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `probe/aac_adts` — **FAIL**: oracle 'golden-metadata' failed: duration: measured null vs golden 10.031s
- `remotion-webcodecs@4.0.479` · `probe/av1_720p_5s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 30
- `remotion-webcodecs@4.0.479` · `probe/big_buck_bunny_1080p_h264` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/big_buck_bunny_1080p_h264.mov and range 0
- `remotion-webcodecs@4.0.479` · `probe/cenc_cbcs` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/cenc_cbcs.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `probe/cenc_ctr` — **FAIL**: oracle 'golden-metadata' failed: duration: measured null vs golden 5.021s; track[0].type: 'other' vs 'video'; track[0].codec: 'unknown' vs 'h264'; track[0].width: undefined vs 1280; track[0].height: undefined vs 720; track[0].fps: null vs 29.872; track[1].type: 'other' vs 'audio'; track[1].codec: 'unknown' vs 'aac'; track[1].sampleRate: undefined vs 48000; track[1].channels: undefined vs 2
- `remotion-webcodecs@4.0.479` · `probe/flac_noseektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `probe/flac_seektable` — **N/A**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `probe/h264_1080p_5s` — **FAIL**: oracle 'golden-metadata' failed: container: measured 'mp4' vs golden 'mov'
- `remotion-webcodecs@4.0.479` · `probe/h264_in_mkv` — **FAIL**: oracle 'golden-metadata' failed: container: measured 'webm' vs golden 'mkv'; track[0].fps: null vs 30
- `remotion-webcodecs@4.0.479` · `probe/h264_ts` — **FAIL**: oracle 'golden-metadata' failed: duration: measured null vs golden 10.021s; track[0].fps: null vs 30
- `remotion-webcodecs@4.0.479` · `probe/hls_aes128` — **ERROR**: Unknown directive #EXT-X-KEY. Value: METHOD=AES-128,URI="hls_aes128.key",IV=0x953e5e232e1585e615d9164ece153cf2
- `remotion-webcodecs@4.0.479` · `probe/hls_vod` — **ERROR**: Failed to construct 'URL': Invalid base URL
- `remotion-webcodecs@4.0.479` · `probe/huge_h264_1080p_600s` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/huge_h264_1080p_600s.mov and range 0
- `remotion-webcodecs@4.0.479` · `probe/large_h264_1080p_120s` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/large_h264_1080p_120s.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `probe/large_vp9_1080p_120s` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/large_vp9_1080p_120s.webm and range 0
- `remotion-webcodecs@4.0.479` · `probe/longform_1h_audio` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/longform_1h_audio.m4a and range 0
- `remotion-webcodecs@4.0.479` · `probe/massive_h264_1080p_2h` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/massive_h264_1080p_2h.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `probe/metamorphic-duration-across-containers` — **FAIL**: oracle 'property-invariant' failed: [probe(x).dur consistent across containers] no ctx.output to probe
- `remotion-webcodecs@4.0.479` · `probe/metamorphic-recorder-headerless-sane-duration` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/recorder_headerless.webm and range 0
- `remotion-webcodecs@4.0.479` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `remotion-webcodecs@4.0.479` · `probe/perf-extract-metadata-huge` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/huge_h264_1080p_600s.mov and range 0
- `remotion-webcodecs@4.0.479` · `probe/perf-extract-metadata-large` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/large_h264_1080p_120s.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `probe/perf-extract-metadata-massive` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/massive_h264_1080p_2h.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `probe/recorder_headerless` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/recorder_headerless.webm and range 0
- `remotion-webcodecs@4.0.479` · `probe/tiny_vp9_360p_2s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 30
- `remotion-webcodecs@4.0.479` · `probe/truncated-header-graceful` — **ERROR**: Error in Media Parser: End of parsing of /fixtures/media/truncated_h264.mp4 has been reached, but no tracks have been found
- `remotion-webcodecs@4.0.479` · `probe/vp8_720p_10s` — **N/A**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `remotion-webcodecs@4.0.479` · `probe/vp9_1080p_10s` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 30
- `remotion-webcodecs@4.0.479` · `probe/vp9_alpha` — **FAIL**: oracle 'golden-metadata' failed: track[0].fps: null vs 30
- `remotion-webcodecs@4.0.479` · `probe/wav_f32` — **ERROR**: Only supporting WAVE with PCM audio format, but got 3
- `remotion-webcodecs@4.0.479` · `remux/aac_adts_adts_to_mp4` — **FAIL**: oracle 'reference-reimport' failed: keyframes: reimport 473 vs golden 470
- `remotion-webcodecs@4.0.479` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/av1_720p_5s_webm_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `remux/av1_720p_5s_webm_to_webm` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare output container 'ogg'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_5s_mov_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `remux/h264_in_mkv_mkv_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `remux/h264_ts_ts_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/huge_h264_1080p_600s.mov and range 0
- `remotion-webcodecs@4.0.479` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare output container 'adts'
- `remotion-webcodecs@4.0.479` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/mp3_xing_mp3_to_mp4` — **FAIL**: oracle 'reference-reimport' failed: packet count: reimport 435 vs golden 384; keyframes: reimport 435 vs golden 384
- `remotion-webcodecs@4.0.479` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare input container 'ogg'
- `remotion-webcodecs@4.0.479` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `remux/prop_mp3_to_mp4_duration_invariant` — **FAIL**: oracle 'property-invariant' failed: [invariant probe(out).dur≈probe(x).dur] out 10.1010s vs 10.0000s (Δ 0.1010s > 0.0417s)
- `remotion-webcodecs@4.0.479` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare output container 'mov'
- `remotion-webcodecs@4.0.479` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/prop_ts_to_mp4_duration_materialized` — **FAIL**: oracle 'property-invariant' failed: [invariant probe(out).dur≈probe(x).dur] out 10.0910s vs 10.0210s (Δ 0.0700s > 0.0417s)
- `remotion-webcodecs@4.0.479` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare output container 'mkv'
- `remotion-webcodecs@4.0.479` · `remux/vp9_1080p_10s_webm_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `remux/vp9_1080p_10s_webm_to_webm` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `remotion-webcodecs@4.0.479` · `streaming-output/buffer_massive_h264_mp4` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/massive_h264_1080p_2h.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `remotion-webcodecs@4.0.479` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_decode_equals_buffer_shape` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_decode_equals_stream_shape` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:in-memory'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare feature 'fastStart:reserve'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **FAIL**: oracle 'property-invariant' failed: [decode(remux(x))==decode(x)] no golden frames = decode(x) to compare against (frame-bake pending)
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_probe_dur_fragmented_shape` — **N/A**: engine does not declare feature 'fragmented'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare feature 'headerless'
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_huge_h264_mov_to_mp4` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/huge_h264_1080p_600s.mov and range 0
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_large_h264_mp4` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/large_h264_1080p_120s.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_large_vp9_webm` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/large_vp9_1080p_120s.webm and range 0
- `remotion-webcodecs@4.0.479` · `streaming-output/stream_massive_h264_mp4` — **ERROR**: Server returned status code 404 for http://localhost:5173/fixtures/media/massive_h264_1080p_2h.mp4 and range 0
- `remotion-webcodecs@4.0.479` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare output container 'ts'
- `remotion-webcodecs@4.0.479` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare feature 'headerless'
- `remotion-webcodecs@4.0.479` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `remotion-webcodecs@4.0.479` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `audio-dsp/aiff_container_probe` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `audio-dsp/caf_container_probe` — **N/A**: engine does not declare input container 'caf'
- `web-demuxer@4.0.0` · `audio-dsp/downmix_5_1_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/downmix_stereo_to_mono` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/edge_empty_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/edge_gapless_aac_decode` — **ERROR**: get_av_stream failed: undefined
- `web-demuxer@4.0.0` · `audio-dsp/edge_longform_audio_probe` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `audio-dsp/edge_longform_audio_resample_16k` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/edge_variable_channel_count_downmix` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/fade_in_out_f32` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/gain_half_f32` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/gain_minus6db_s16` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/meta_idempotent_resample_same_rate` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/meta_probe_duration_across_wav_aiff` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `audio-dsp/meta_roundtrip_endianness_s16` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/negative_image_into_audio_transcode` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_f32_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s16_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s16be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s16le_to_s16be` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s24_to_f32` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s24_to_s16` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/pcm_s24be_to_s16le` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/resample_44k1_to_48k` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/resample_48k_to_16k` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/resample_48k_to_44k1` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/throughput_decode_s16be` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `audio-dsp/throughput_decode_s24` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `audio-dsp/throughput_encode_s16be` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/throughput_encode_s24` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/upmix_mono_to_stereo` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `audio-dsp/upmix_stereo_to_5_1` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `demux/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `web-demuxer@4.0.0` · `demux/av1_720p_5s` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/empty_audio_zero_packets` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `demux/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `demux/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `demux/h264_1080p_30s` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/h264_1080p_5s` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/h264_4k_10s` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/h264_bframes_1080p` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/h264_in_mkv` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/h264_rotated90` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/h264_ts` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/h264_vfr` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/hevc_1080p_10s` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `web-demuxer@4.0.0` · `demux/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `web-demuxer@4.0.0` · `demux/metamorphic_flac_seektable_invariance` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `demux/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `demux/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `demux/opus` — **N/A**: engine does not declare input container 'ogg'
- `web-demuxer@4.0.0` · `demux/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `demux/size_huge_huge_h264_1080p_600s` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `web-demuxer@4.0.0` · `demux/size_large_large_h264_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `demux/size_large_large_vp9_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_vp9_1080p_120s.webm' (404 Not Found)
- `web-demuxer@4.0.0` · `demux/size_massive_massive_h264_1080p_2h` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `demux/size_tiny_tiny_h264_360p_2s` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/size_tiny_tiny_vp9_360p_2s` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/vp8_720p_10s` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/vp9_1080p_10s` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `demux/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `demux/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `demux/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `encryption/cenc_cbcs_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `encryption/cenc_cens_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `encryption/cenc_ctr_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `encryption/cenc_ctr_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `encryption/clearkey_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `encryption/hls_aes128_decrypt` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `encryption/hls_aes128_decrypt_eq_cleartext` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `encryption/hls_sample_aes_decrypt_na` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `encryption/perf_cenc_ctr_decrypt_throughput` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `encryption/unencrypted_left_untouched_noop` — **N/A**: engine does not declare operation 'decrypt'
- `web-demuxer@4.0.0` · `metadata/meta_consistent_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/read_flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `metadata/read_h264_1080p_5s` — **FAIL**: oracle 'golden-metadata' failed: container: measured 'mp4' vs golden 'mov'
- `web-demuxer@4.0.0` · `metadata/read_h264_in_mkv` — **FAIL**: oracle 'golden-metadata' failed: container: measured 'webm' vs golden 'mkv'
- `web-demuxer@4.0.0` · `metadata/read_mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `metadata/read_no_tags_recorder_webm` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `web-demuxer@4.0.0` · `metadata/read_no_tags_wav` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `metadata/read_opus` — **N/A**: engine does not declare input container 'ogg'
- `web-demuxer@4.0.0` · `metadata/read_pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `metadata/rotation_decode_read_h264_rotated90` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `web-demuxer@4.0.0` · `metadata/rotation_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/tagedit_no_corrupt_audio_flac` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/tagedit_no_corrupt_video_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/tracks_packet_attribution_multitrack` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `metadata/write_flac_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/write_mkv_tags` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/write_mp3_id3` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/write_mp4_tags` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `metadata/write_ogg_vorbiscomment` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `mux/aac_to_adts` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/audio_only_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/av1_opus_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/edge_bframes_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/edge_bframes_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/edge_hevc_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/edge_hevc_decode_mux_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/edge_multitrack_keep_all_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/edge_rotation_decode_mux_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/edge_rotation_decode_mux_mov` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/flac_to_mkv_audio` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/h264_aac_to_mov` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/h264_aac_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/h264_aac_to_ts` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/mp3_to_mp3` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/mp3_to_mp4_audio` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/mp4_progressive_buffer` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/mp4_streaming_target` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/opus_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/opus_to_webm_audio` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/pcm_f32_to_wav` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/pcm_s16_to_wav` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/pcm_s24_to_wav` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/prop_av1_mux_duration_webm_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/prop_h264_decode_mux_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/prop_h264_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/prop_h264_mux_duration_mp4_to_ts` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/prop_vfr_mux_duration_mp4_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/prop_vfr_mux_duration_mp4_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/prop_vp9_decode_mux_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/prop_vp9_mux_duration_webm_to_webm` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/size_large_1080p_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/size_large_1080p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/size_longform_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/size_micro_1frame_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/size_micro_1frame_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/size_tiny_360p_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/swap_audio_video_with_opus_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/three_track_assembly_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/video_a_plus_audio_b_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/vorbis_to_ogg` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/vp9_opus_to_webm` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `mux/vp9_video_plus_opus_audio_to_webm` — **N/A**: engine does not declare operation 'mux'
- `web-demuxer@4.0.0` · `performance/convert-longtasks` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/convert-peak-memory` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/convert-webm-resize-320x180` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/decode-fps` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; frame-bake must run — not an engine defect)
- `web-demuxer@4.0.0` · `performance/encode-fps` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/metamorphic-decode-remux` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `performance/metamorphic-probe-duration-cross-container` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `performance/metamorphic-transcode-idempotent-source-res` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/metamorphic-vfr-iterate-packets` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `performance/op-sweep-demux` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `performance/op-sweep-remux-mp4-to-mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `performance/op-sweep-transcode-webm` — **N/A**: engine does not declare operation 'transcode'
- `web-demuxer@4.0.0` · `performance/size-ladder-demux-peak-memory-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `web-demuxer@4.0.0` · `performance/size-ladder-demux-peak-memory-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `performance/size-ladder-demux-peak-memory-large4k` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `performance/size-ladder-extract-metadata-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `web-demuxer@4.0.0` · `performance/size-ladder-extract-metadata-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `performance/size-ladder-extract-metadata-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `performance/size-ladder-iterate-packets-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `web-demuxer@4.0.0` · `performance/size-ladder-iterate-packets-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `performance/size-ladder-iterate-packets-large4k` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `performance/size-ladder-iterate-packets-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `performance/size-ladder-iterate-packets-medium` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `performance/size-ladder-iterate-packets-tiny` — **ERROR**: readAVPacket pipeline failed: AVPacketReader.create failed (null reader)
- `web-demuxer@4.0.0` · `probe/aac_adts` — **N/A**: engine does not declare input container 'adts'
- `web-demuxer@4.0.0` · `probe/big_buck_bunny_1080p_h264` — **ERROR**: failed to fetch corpus asset 'big_buck_bunny_1080p_h264.mov' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/cenc_cbcs` — **ERROR**: failed to fetch corpus asset 'cenc_cbcs.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/empty-audio-wav` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `probe/flac_noseektable` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `probe/flac_seektable` — **N/A**: engine does not declare input container 'flac'
- `web-demuxer@4.0.0` · `probe/h264_1080p_5s` — **FAIL**: oracle 'golden-metadata' failed: container: measured 'mp4' vs golden 'mov'
- `web-demuxer@4.0.0` · `probe/h264_in_mkv` — **FAIL**: oracle 'golden-metadata' failed: container: measured 'webm' vs golden 'mkv'
- `web-demuxer@4.0.0` · `probe/h264_ts` — **FAIL**: oracle 'golden-metadata' failed: track[1].sampleRate: undefined vs 48000; track[1].channels: undefined vs 2
- `web-demuxer@4.0.0` · `probe/hls_aes128` — **N/A**: engine does not declare input container 'hls'
- `web-demuxer@4.0.0` · `probe/hls_vod` — **N/A**: engine does not declare input container 'hls'
- `web-demuxer@4.0.0` · `probe/huge_h264_1080p_600s` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/large_h264_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/large_vp9_1080p_120s` — **ERROR**: failed to fetch corpus asset 'large_vp9_1080p_120s.webm' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/longform_1h_audio` — **ERROR**: failed to fetch corpus asset 'longform_1h_audio.m4a' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/massive_h264_1080p_2h` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/metamorphic-duration-across-containers` — **FAIL**: oracle 'property-invariant' failed: [probe(x).dur consistent across containers] no ctx.output to probe
- `web-demuxer@4.0.0` · `probe/metamorphic-recorder-headerless-sane-duration` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/mp3_cbr_notoc` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `probe/mp3_xing` — **N/A**: engine does not declare input container 'mp3'
- `web-demuxer@4.0.0` · `probe/opus` — **N/A**: engine does not declare input container 'ogg'
- `web-demuxer@4.0.0` · `probe/pcm_s16be` — **N/A**: engine does not declare input container 'aiff'
- `web-demuxer@4.0.0` · `probe/perf-extract-metadata-huge` — **ERROR**: failed to fetch corpus asset 'huge_h264_1080p_600s.mov' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/perf-extract-metadata-large` — **ERROR**: failed to fetch corpus asset 'large_h264_1080p_120s.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/perf-extract-metadata-massive` — **ERROR**: failed to fetch corpus asset 'massive_h264_1080p_2h.mp4' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/recorder_headerless` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `web-demuxer@4.0.0` · `probe/truncated-header-graceful` — **ERROR**: get_media_info failed: undefined
- `web-demuxer@4.0.0` · `probe/wav_f32` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `probe/wav_s16` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `probe/wav_s24` — **N/A**: engine does not declare input container 'wav'
- `web-demuxer@4.0.0` · `remux/aac_adts_adts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/aac_adts_adts_to_ts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/av1_720p_5s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/av1_720p_5s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/av1_720p_5s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/flac_seektable_flac_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/flac_seektable_flac_to_ogg` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_1080p_30s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_1080p_30s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_1080p_30s_mp4_to_ts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_1080p_5s_mov_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_1080p_5s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_1080p_5s_mov_to_ts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_bframes_1080p_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_in_mkv_mkv_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_in_mkv_mkv_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_in_mkv_mkv_to_ts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_multitrack_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_rotated90_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_ts_ts_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_ts_ts_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/h264_ts_ts_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/hevc_1080p_10s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/hevc_1080p_10s_mp4_to_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/huge_h264_1080p_600s_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/large_h264_1080p_120s_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/large_vp9_1080p_120s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/massive_h264_1080p_2h_mp4_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/micro_audio_short_mp4_to_adts` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/mp3_xing_mp3_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/mp3_xing_mp3_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/opus_ogg_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/opus_ogg_to_webm` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/prop_adts_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/prop_bframes_decode_remux_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/prop_bframes_decode_remux_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/prop_mp3_to_mp4_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/prop_multitrack_survives_mp4_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/prop_recorder_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/prop_rotation_survives_mp4_mov` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/prop_roundtrip_mp4_mkv_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/prop_ts_to_mp4_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/vp8_720p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/vp9_1080p_10s_webm_to_mkv` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/vp9_1080p_10s_webm_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `remux/vp9_1080p_10s_webm_to_webm` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/buffer_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_faststart_in_memory` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_faststart_none_control` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_faststart_reserve` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_fragmented_cmaf` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_ttfb_buffer_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/mp4_ttfb_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_decode_equals_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_decode_equals_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_faststart_in_memory_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_faststart_reserve_duration_invariant` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_frag_premise_decode_equality_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_probe_dur_buffer_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_probe_dur_fragmented_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_probe_dur_stream_shape` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_ts_stream_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/prop_webm_headerless_duration_materialized` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/stream_huge_h264_mov_to_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/stream_large_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/stream_large_vp9_webm` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/stream_massive_h264_mp4` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/ts_continuity_many_writes` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/ts_tiny_writes` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/webm_headerless_live_stream` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `streaming-output/webm_streaming_target` — **N/A**: engine does not declare operation 'remux'
- `web-demuxer@4.0.0` · `trim/audio_aac_adts_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/audio_aiff_pcm_be_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/audio_flac_noseektable_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/audio_flac_seektable_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/audio_mp3_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/audio_opus_ogg_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/audio_wav_pcm_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/av1_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/fmp4_fragment_boundary_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_bframes_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_keyframe_aligned_short` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_multitrack_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_open_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_rotated_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_single_gop_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_start_zero_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_subframe_range_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_to_eof_copy` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/h264_vfr_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/hevc_frame_accurate` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/hevc_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/huge_h264_mov_copy_peakmem` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/large_h264_copy_lazyread` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/large_h264_frame_accurate_throughput` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/massive_h264_copy_sustained` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/mkv_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/mov_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/ts_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/vp8_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/vp9_alpha_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/vp9_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `web-demuxer@4.0.0` · `trim/vp9_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'

</details>

### 4. Benchmark matrix (full per-engine timing detail)

_Indicative for this browser only. Cells without a green conformance gate are blank (—)._

**`aibrush-media@dev`**

_No admissible benchmarks (no green conformance gate)._

**`ffmpeg.wasm@0.12.15`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `performance/extract-metadata` | 41.2 | 41.2 | — | — | — |
| `performance/iterate-video-packets` | 98.9 | 98.9 | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |

**`mediabunny@1.48.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | 102 | 102 | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `mux/aac_to_adts` | 12.2 | 12.2 | 1453.77× | 0 B | 291 |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | 104.7 | 104.7 | 265.39× | 210.11 MiB | 1007 |
| `mux/h264_aac_to_mov` | 105.4 | 105.4 | 323.42× | 209.84 MiB | 0 |
| `mux/h264_aac_to_mp4` | 99.9 | 99.9 | 307.25× | 209.82 MiB | 0 |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `performance/extract-metadata` | 80.5 | 80.5 | — | — | — |
| `performance/iterate-video-packets` | 102.8 | 102.8 | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | 5.4 | 5.4 | 1964.94× | 16.42 MiB | 0 |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | 23.2 | 23.2 | 537.92× | 28.41 MiB | 0 |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | 55.6 | 55.6 | 86.78× | 0 B | 57 |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | 57.6 | 57.6 | 164.35× | 0 B | 0 |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |

**`mp4box@2.3.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `performance/extract-metadata` | 82.1 | 82.1 | — | — | — |
| `performance/iterate-video-packets` | 88.8 | 88.8 | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |

**`platform@chrome-149`**

_No admissible benchmarks (no green conformance gate)._

**`remotion-media-parser@4.0.479`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `performance/extract-metadata` | 33.2 | 33.2 | — | — | — |
| `performance/iterate-video-packets` | 6893.6 | 6893.6 | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |

**`remotion-webcodecs@4.0.479`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | 2325.1 | 2325.1 | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `performance/extract-metadata` | 45.8 | 45.8 | — | — | — |
| `performance/iterate-video-packets` | 917.6 | 917.6 | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |

**`web-demuxer@4.0.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | 144.7 | 144.7 | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/decode-fps` | — | — | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `performance/extract-metadata` | 68.6 | 68.6 | — | — | — |
| `performance/iterate-video-packets` | 555.2 | 555.2 | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |


### 5. Δ vs reference (`mediabunny`)

| Scenario | aibrush-media@dev perf | aibrush-media@dev conf | ffmpeg.wasm@0.12.15 perf | ffmpeg.wasm@0.12.15 conf | mediabunny@1.48.0 perf | mediabunny@1.48.0 conf | mp4box@2.3.0 perf | mp4box@2.3.0 conf | platform@chrome-149 perf | platform@chrome-149 conf | remotion-media-parser@4.0.479 perf | remotion-media-parser@4.0.479 conf | remotion-webcodecs@4.0.479 perf | remotion-webcodecs@4.0.479 conf | web-demuxer@4.0.0 perf | web-demuxer@4.0.0 conf |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/caf_container_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_5_1_to_stereo` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_stereo_to_mono` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_empty_audio_transcode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_gapless_aac_decode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_longform_audio_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_longform_audio_resample_16k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_variable_channel_count_downmix` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fade_in_out_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_half_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_minus6db_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_idempotent_resample_same_rate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_roundtrip_endianness_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/negative_image_into_audio_transcode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_f32_to_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16_to_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16be_to_s16le` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16le_to_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24be_to_s16le` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_44k1_to_48k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_16k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_44k1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/upmix_mono_to_stereo` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/upmix_stereo_to_5_1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/aac_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/av1_720p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/empty_audio_zero_packets` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/flac_noseektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/flac_seektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_30s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_4k_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_bframes_1080p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_in_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_rotated90` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_vfr` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hevc_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_aes128` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_vod` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/metamorphic_flac_seektable_invariance` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_cbr_notoc` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_xing` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/opus` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/pcm_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_huge_huge_h264_1080p_600s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_h264_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_vp9_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_massive_massive_h264_1080p_2h` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_audio_short` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_h264_1frame` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_tiny_tiny_h264_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_tiny_tiny_vp9_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp8_720p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp9_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp9_alpha` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_cbcs_decrypt` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_cens_decrypt_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/clearkey_decrypt_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt_eq_cleartext` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_sample_aes_decrypt_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/perf_cenc_ctr_decrypt_throughput` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/unencrypted_left_untouched_noop` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/meta_consistent_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_flac_seektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_30s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_in_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_mp3_xing` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_no_tags_recorder_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_no_tags_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_opus` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_pcm_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_vp9_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/rotation_decode_read_h264_rotated90` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/rotation_survives_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tagedit_no_corrupt_audio_flac` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_attribution_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_packet_attribution_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_flac_vorbiscomment` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mkv_tags` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp3_id3` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp4_tags` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_ogg_vorbiscomment` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/aac_to_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/audio_only_aac_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/av1_opus_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/drop_audio_track_subset_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_hevc_decode_mux_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_hevc_decode_mux_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_multitrack_keep_all_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/flac_to_mkv_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp3` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp4_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_faststart_reserve` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_fragmented_cmaf` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_progressive_buffer` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_h264_into_wav_illegal` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_webm_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_f32_to_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s16_to_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s24_to_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_av1_mux_duration_webm_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_mux_duration_mp4_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_decode_mux_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_mux_duration_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_longform_audio_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_tiny_360p_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/swap_audio_video_with_opus_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/three_track_assembly_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/video_a_plus_audio_b_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/video_plus_audio_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vorbis_to_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_opus_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_video_plus_opus_audio_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/bundle-size` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/convert-longtasks` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/convert-peak-memory` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/convert-webm-resize-320x180` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/decode-fps` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/encode-fps` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/extract-metadata` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/iterate-video-packets` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-decode-remux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-probe-duration-cross-container` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-transcode-idempotent-source-res` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-vfr-iterate-packets` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-vfr-probe-duration` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-demux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-remux-mp4-to-mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-transcode-webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/seek-ms` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-large4k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large4k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-massive` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-medium` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-tiny` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-large4k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-massive` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-medium` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-tiny` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/aac_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/av1_720p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/big_buck_bunny_1080p_h264` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/cenc_cbcs` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/cenc_ctr` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/empty-audio-wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_noseektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_seektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_30s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_4k_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_bframes_1080p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_in_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_rotated90` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_vfr` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/hevc_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/hls_aes128` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/hls_vod` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/huge_h264_1080p_600s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/large_h264_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/large_vp9_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/longform_1h_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/massive_h264_1080p_2h` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/metamorphic-duration-across-containers` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/metamorphic-recorder-headerless-sane-duration` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_audio_short` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_h264_1frame` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_cbr_notoc` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_xing` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/opus` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/pcm_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-massive` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/recorder_headerless` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/tiny_h264_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/tiny_vp9_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/truncated-header-graceful` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/vp8_720p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/vp9_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/vp9_alpha` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/wav_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/wav_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/wav_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/aac_adts_adts_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/aac_adts_adts_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_bframes_1080p_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_multitrack_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_rotated90_mp4_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/micro_audio_short_mp4_to_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/mp3_xing_mp3_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/mp3_xing_mp3_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_adts_to_mp4_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_mp3_to_mp4_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_multitrack_survives_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_recorder_headerless_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_rotation_survives_mp4_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_roundtrip_mp4_mkv_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_ts_to_mp4_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp8_720p_10s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/buffer_massive_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_buffer_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_in_memory` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_none_control` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_reserve` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_fragmented_cmaf` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_ttfb_buffer_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_ttfb_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_decode_equals_buffer_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_decode_equals_stream_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_reserve_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_buffer_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_fragmented_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_stream_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_ts_stream_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_webm_headerless_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_huge_h264_mov_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_large_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_large_vp9_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_massive_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/ts_continuity_many_writes` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/ts_tiny_writes` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/webm_headerless_live_stream` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/webm_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_aac_adts_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_aiff_pcm_be_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_noseektable_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_seektable_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_mp3_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_opus_ogg_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_wav_pcm_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/av1_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/fmp4_fragment_boundary_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_bframes_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned_short` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_multitrack_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_noop_full_range_idempotent` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_open_gop_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_rotated_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_single_gop_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_start_zero_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_subframe_range_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_to_eof_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_vfr_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/huge_h264_mov_copy_peakmem` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_copy_lazyread` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_frame_accurate_throughput` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/massive_h264_copy_sustained` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/mkv_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/mov_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_zero_length_range` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/ts_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp8_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_alpha_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_noop_full_range_idempotent` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

## Browser: brave

### 1. Result matrix — display value per engine × case

_Each completed cell is formatted as `Pass (<execution time>)` or `N/A`. Indicative for this browser only — never compared across browsers (see Caveats)._

| Case | Primary metric | aibrush-media@dev | ffmpeg.wasm@0.12.15 | mediabunny@1.48.0 | mp4box@2.3.0 | platform@chrome-149 | remotion-media-parser@4.0.479 | remotion-webcodecs@4.0.479 | web-demuxer@4.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | throughputRealtime (x-realtime) | — | — | Pass (28.25 ms) | N/A | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | throughputRealtime (x-realtime) | — | — | Pass (84.06 ms) | N/A | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | throughputRealtime (x-realtime) | — | — | Pass (88.49 ms) | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | Pass (89 ms) | N/A | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | throughputRealtime (x-realtime) | — | — | Pass (89.66 ms) | N/A | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — | — | — | — | — |
| `performance/decode-fps` | decodeFps (fps) | — | — | Pass (5.43 s) | — | Pass (5.71 s) | — | — | — |
| `performance/encode-fps` | — | — | — | — | — | — | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — | — | — | — | — |
| `probe/micro_h264_1frame` | wall (ms) | N/A | — | Pass (3.56 ms) | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | throughputRealtime (x-realtime) | — | — | Pass (723 ms) | N/A | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | throughputRealtime (x-realtime) | — | — | Pass (64.11 ms) | N/A | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | Pass (67 ms) | N/A | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — | — | — | — | — |

### 2. Winners — one per case (🏆 = fastest correct engine)

| Case | Winner | Value | Runner-up | Margin | Eligible | Flag |
| --- | --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | 0 | no winner |
| `audio-dsp/caf_container_probe` | — | — | — | — | 0 | no winner |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | 0 | no winner |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | 0 | no winner |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | 0 | no winner |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | 0 | no winner |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | 0 | no winner |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | 0 | no winner |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | 0 | no winner |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | 0 | no winner |
| `audio-dsp/gain_half_f32` | — | — | — | — | 0 | no winner |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | 0 | no winner |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | 0 | no winner |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | 0 | no winner |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | 0 | no winner |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | 0 | no winner |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | 0 | no winner |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | 0 | no winner |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | 0 | no winner |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | 0 | no winner |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | 0 | no winner |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | 0 | no winner |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | 0 | no winner |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | 0 | no winner |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | 0 | no winner |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | 0 | no winner |
| `demux/aac_adts` | — | — | — | — | 0 | no winner |
| `demux/av1_720p_5s` | — | — | — | — | 0 | no winner |
| `demux/empty_audio_zero_packets` | — | — | — | — | 0 | no winner |
| `demux/flac_noseektable` | — | — | — | — | 0 | no winner |
| `demux/flac_seektable` | — | — | — | — | 0 | no winner |
| `demux/h264_1080p_30s` | — | — | — | — | 0 | no winner |
| `demux/h264_1080p_5s` | — | — | — | — | 0 | no winner |
| `demux/h264_4k_10s` | — | — | — | — | 0 | no winner |
| `demux/h264_bframes_1080p` | — | — | — | — | 0 | no winner |
| `demux/h264_in_mkv` | — | — | — | — | 0 | no winner |
| `demux/h264_multitrack` | — | — | — | — | 0 | no winner |
| `demux/h264_rotated90` | — | — | — | — | 0 | no winner |
| `demux/h264_ts` | — | — | — | — | 0 | no winner |
| `demux/h264_vfr` | — | — | — | — | 0 | no winner |
| `demux/hevc_1080p_10s` | — | — | — | — | 0 | no winner |
| `demux/hls_aes128` | — | — | — | — | 0 | no winner |
| `demux/hls_vod` | — | — | — | — | 0 | no winner |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | 0 | no winner |
| `demux/mp3_cbr_notoc` | — | — | — | — | 0 | no winner |
| `demux/mp3_xing` | — | — | — | — | 0 | no winner |
| `demux/opus` | — | — | — | — | 0 | no winner |
| `demux/pcm_s16be` | — | — | — | — | 0 | no winner |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | 0 | no winner |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | 0 | no winner |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | 0 | no winner |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | 0 | no winner |
| `demux/size_micro_micro_audio_short` | — | — | — | — | 0 | no winner |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | 0 | no winner |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | 0 | no winner |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | 0 | no winner |
| `demux/vp8_720p_10s` | — | — | — | — | 0 | no winner |
| `demux/vp9_1080p_10s` | — | — | — | — | 0 | no winner |
| `demux/vp9_alpha` | — | — | — | — | 0 | no winner |
| `demux/wav_f32` | — | — | — | — | 0 | no winner |
| `demux/wav_s16` | — | — | — | — | 0 | no winner |
| `demux/wav_s24` | — | — | — | — | 0 | no winner |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | 0 | no winner |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | 0 | no winner |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | 0 | no winner |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | 0 | no winner |
| `encryption/clearkey_decrypt_na` | — | — | — | — | 0 | no winner |
| `encryption/hls_aes128_decrypt` | — | — | — | — | 0 | no winner |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | 0 | no winner |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | 0 | no winner |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | 0 | no winner |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | 0 | no winner |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `metadata/read_flac_seektable` | — | — | — | — | 0 | no winner |
| `metadata/read_h264_1080p_30s` | — | — | — | — | 0 | no winner |
| `metadata/read_h264_1080p_5s` | — | — | — | — | 0 | no winner |
| `metadata/read_h264_in_mkv` | — | — | — | — | 0 | no winner |
| `metadata/read_h264_multitrack` | — | — | — | — | 0 | no winner |
| `metadata/read_mp3_xing` | — | — | — | — | 0 | no winner |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | 0 | no winner |
| `metadata/read_no_tags_wav` | — | — | — | — | 0 | no winner |
| `metadata/read_opus` | — | — | — | — | 0 | no winner |
| `metadata/read_pcm_s16be` | — | — | — | — | 0 | no winner |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | 0 | no winner |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | 0 | no winner |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | 0 | no winner |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | 0 | no winner |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | 0 | no winner |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | 0 | no winner |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | 0 | no winner |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | 0 | no winner |
| `metadata/write_mkv_tags` | — | — | — | — | 0 | no winner |
| `metadata/write_mp3_id3` | — | — | — | — | 0 | no winner |
| `metadata/write_mp4_tags` | — | — | — | — | 0 | no winner |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | 0 | no winner |
| `mux/aac_to_adts` | — | — | — | — | 0 | no winner |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/av1_opus_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/drop_audio_track_subset_to_mp4` | `mediabunny@1.48.0` (uncontested) | 508.26 x-realtime | — | — | 1 | uncontested |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | 0 | no winner |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | 0 | no winner |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | 0 | no winner |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | 0 | no winner |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | 0 | no winner |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | 0 | no winner |
| `mux/flac_to_mkv_audio` | — | — | — | — | 0 | no winner |
| `mux/h264_aac_to_mkv` | `mediabunny@1.48.0` (uncontested) | 325.64 x-realtime | — | — | 1 | uncontested |
| `mux/h264_aac_to_mov` | — | — | — | — | 0 | no winner |
| `mux/h264_aac_to_mp4` | `mediabunny@1.48.0` (uncontested) | 380.08 x-realtime | — | — | 1 | uncontested |
| `mux/h264_aac_to_ts` | — | — | — | — | 0 | no winner |
| `mux/mp3_to_mp3` | — | — | — | — | 0 | no winner |
| `mux/mp3_to_mp4_audio` | — | — | — | — | 0 | no winner |
| `mux/mp4_faststart_reserve` | — | — | — | — | 0 | no winner |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | 0 | no winner |
| `mux/mp4_progressive_buffer` | — | — | — | — | 0 | no winner |
| `mux/mp4_streaming_target` | — | — | — | — | 0 | no winner |
| `mux/neg_h264_into_wav_illegal` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `mux/opus_to_ogg` | — | — | — | — | 0 | no winner |
| `mux/opus_to_webm_audio` | — | — | — | — | 0 | no winner |
| `mux/pcm_f32_to_wav` | — | — | — | — | 0 | no winner |
| `mux/pcm_s16_to_wav` | — | — | — | — | 0 | no winner |
| `mux/pcm_s24_to_wav` | — | — | — | — | 0 | no winner |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | 0 | no winner |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | 0 | no winner |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | 0 | no winner |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | 0 | no winner |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | 0 | no winner |
| `mux/video_plus_audio_to_mp4` | `mediabunny@1.48.0` (uncontested) | 373.65 x-realtime | — | — | 1 | uncontested |
| `mux/vorbis_to_ogg` | — | — | — | — | 0 | no winner |
| `mux/vp9_opus_to_webm` | — | — | — | — | 0 | no winner |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | 0 | no winner |
| `performance/bundle-size` | — | — | — | — | 0 | no winner |
| `performance/convert-longtasks` | — | — | — | — | 0 | no winner |
| `performance/convert-peak-memory` | — | — | — | — | 0 | no winner |
| `performance/convert-webm-resize-320x180` | — | — | — | — | 0 | no winner |
| `performance/decode-fps` | 🏆 `mediabunny@1.48.0` | 55.15 fps | `platform@chrome-149` | +11.46% | 2 | contested |
| `performance/encode-fps` | — | — | — | — | 0 | no winner |
| `performance/extract-metadata` | — | — | — | — | 0 | no winner |
| `performance/iterate-video-packets` | — | — | — | — | 0 | no winner |
| `performance/metamorphic-decode-remux` | — | — | — | — | 0 | no winner |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | 0 | no winner |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | 0 | no winner |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | 0 | no winner |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | 0 | no winner |
| `performance/op-sweep-demux` | — | — | — | — | 0 | no winner |
| `performance/op-sweep-probe` | — | — | — | — | 0 | no winner |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | 0 | no winner |
| `performance/op-sweep-transcode-webm` | — | — | — | — | 0 | no winner |
| `performance/seek-ms` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | 0 | no winner |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | 0 | no winner |
| `probe/aac_adts` | — | — | — | — | 0 | no winner |
| `probe/av1_720p_5s` | — | — | — | — | 0 | no winner |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | 0 | no winner |
| `probe/cenc_cbcs` | — | — | — | — | 0 | no winner |
| `probe/cenc_ctr` | — | — | — | — | 0 | no winner |
| `probe/empty-audio-wav` | — | — | — | — | 0 | no winner |
| `probe/flac_noseektable` | — | — | — | — | 0 | no winner |
| `probe/flac_seektable` | — | — | — | — | 0 | no winner |
| `probe/h264_1080p_30s` | — | — | — | — | 0 | no winner |
| `probe/h264_1080p_5s` | — | — | — | — | 0 | no winner |
| `probe/h264_4k_10s` | — | — | — | — | 0 | no winner |
| `probe/h264_bframes_1080p` | — | — | — | — | 0 | no winner |
| `probe/h264_in_mkv` | — | — | — | — | 0 | no winner |
| `probe/h264_multitrack` | — | — | — | — | 0 | no winner |
| `probe/h264_rotated90` | — | — | — | — | 0 | no winner |
| `probe/h264_ts` | — | — | — | — | 0 | no winner |
| `probe/h264_vfr` | — | — | — | — | 0 | no winner |
| `probe/hevc_1080p_10s` | — | — | — | — | 0 | no winner |
| `probe/hls_aes128` | — | — | — | — | 0 | no winner |
| `probe/hls_vod` | — | — | — | — | 0 | no winner |
| `probe/huge_h264_1080p_600s` | — | — | — | — | 0 | no winner |
| `probe/large_h264_1080p_120s` | — | — | — | — | 0 | no winner |
| `probe/large_vp9_1080p_120s` | — | — | — | — | 0 | no winner |
| `probe/longform_1h_audio` | — | — | — | — | 0 | no winner |
| `probe/massive_h264_1080p_2h` | — | — | — | — | 0 | no winner |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | 0 | no winner |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | 0 | no winner |
| `probe/micro_audio_short` | — | — | — | — | 0 | no winner |
| `probe/micro_h264_1frame` | `mediabunny@1.48.0` (uncontested) | 3.56 ms | — | — | 1 | uncontested |
| `probe/mp3_cbr_notoc` | — | — | — | — | 0 | no winner |
| `probe/mp3_xing` | — | — | — | — | 0 | no winner |
| `probe/opus` | — | — | — | — | 0 | no winner |
| `probe/pcm_s16be` | — | — | — | — | 0 | no winner |
| `probe/perf-extract-metadata-huge` | — | — | — | — | 0 | no winner |
| `probe/perf-extract-metadata-large` | — | — | — | — | 0 | no winner |
| `probe/perf-extract-metadata-massive` | — | — | — | — | 0 | no winner |
| `probe/recorder_headerless` | — | — | — | — | 0 | no winner |
| `probe/tiny_h264_360p_2s` | — | — | — | — | 0 | no winner |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | 0 | no winner |
| `probe/truncated-header-graceful` | — | — | — | — | 0 | no winner |
| `probe/vp8_720p_10s` | — | — | — | — | 0 | no winner |
| `probe/vp9_1080p_10s` | — | — | — | — | 0 | no winner |
| `probe/vp9_alpha` | — | — | — | — | 0 | no winner |
| `probe/wav_f32` | — | — | — | — | 0 | no winner |
| `probe/wav_s16` | — | — | — | — | 0 | no winner |
| `probe/wav_s24` | — | — | — | — | 0 | no winner |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | 0 | no winner |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | 0 | no winner |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | 0 | no winner |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | 0 | no winner |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | 0 | no winner |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | 0 | no winner |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | 0 | no winner |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | 0 | no winner |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | 0 | no winner |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/opus_ogg_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/opus_ogg_to_webm` | — | — | — | — | 0 | no winner |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | 0 | no winner |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | 0 | no winner |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | 0 | no winner |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | 0 | no winner |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | 0 | no winner |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | 0 | no winner |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | 0 | no winner |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | 0 | no winner |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | 0 | no winner |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | 0 | no winner |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | 0 | no winner |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | 0 | no winner |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_buffer_target` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_streaming_target` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | 0 | no winner |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | 0 | no winner |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | 0 | no winner |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | 0 | no winner |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | 0 | no winner |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | 0 | no winner |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | 0 | no winner |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | 0 | no winner |
| `streaming-output/ts_tiny_writes` | — | — | — | — | 0 | no winner |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | 0 | no winner |
| `streaming-output/webm_streaming_target` | — | — | — | — | 0 | no winner |
| `trim/audio_aac_adts_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_flac_seektable_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_mp3_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_opus_ogg_copy` | — | — | — | — | 0 | no winner |
| `trim/audio_wav_pcm_copy` | — | — | — | — | 0 | no winner |
| `trim/av1_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | 0 | no winner |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/h264_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/h264_keyframe_aligned` | `mediabunny@1.48.0` (uncontested) | 42.05 x-realtime | — | — | 1 | uncontested |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | 0 | no winner |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/h264_noop_full_range_idempotent` | `mediabunny@1.48.0` (uncontested) | 672.57 x-realtime | — | — | 1 | uncontested |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/h264_start_zero_copy` | — | — | — | — | 0 | no winner |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/h264_to_eof_copy` | — | — | — | — | 0 | no winner |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/hevc_frame_accurate` | — | — | — | — | 0 | no winner |
| `trim/hevc_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | 0 | no winner |
| `trim/large_h264_copy_lazyread` | — | — | — | — | 0 | no winner |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | 0 | no winner |
| `trim/massive_h264_copy_sustained` | — | — | — | — | 0 | no winner |
| `trim/mkv_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/mov_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/robust_zero_length_range` | `mediabunny@1.48.0` (uncontested) | — | — | — | 1 | uncontested |
| `trim/ts_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/vp8_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/vp9_keyframe_aligned` | — | — | — | — | 0 | no winner |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | 0 | no winner |

### 3. Conformance matrix (same display rule, grouped by correctness)

| Scenario | aibrush-media@dev | ffmpeg.wasm@0.12.15 | mediabunny@1.48.0 | mp4box@2.3.0 | platform@chrome-149 | remotion-media-parser@4.0.479 | remotion-webcodecs@4.0.479 | web-demuxer@4.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | Pass (28.25 ms) | N/A | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | Pass (84.06 ms) | N/A | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | Pass (88.49 ms) | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | Pass (89 ms) | N/A | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | Pass (89.66 ms) | N/A | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — | — | — | — |
| `performance/decode-fps` | — | — | Pass (5.43 s) | — | Pass (5.71 s) | — | — | — |
| `performance/encode-fps` | — | — | — | — | — | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — | — | — | — |
| `probe/micro_h264_1frame` | N/A | — | Pass (3.56 ms) | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | Pass (723 ms) | N/A | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | Pass (64.11 ms) | N/A | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | Pass (67 ms) | N/A | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — | — | — | — |

<details><summary>Cell details</summary>

- `aibrush-media@dev` · `probe/micro_h264_1frame` — **N/A**: engine does not declare operation 'probe'
- `mp4box@2.3.0` · `mux/drop_audio_track_subset_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/h264_aac_to_mkv` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/neg_h264_into_wav_illegal` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `mux/video_plus_audio_to_mp4` — **N/A**: engine does not declare operation 'mux'
- `mp4box@2.3.0` · `trim/h264_keyframe_aligned` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/h264_noop_full_range_idempotent` — **N/A**: engine does not declare operation 'trim'
- `mp4box@2.3.0` · `trim/robust_zero_length_range` — **N/A**: engine does not declare operation 'trim'

</details>

### 4. Benchmark matrix (full per-engine timing detail)

_Indicative for this browser only. Cells without a green conformance gate are blank (—)._

**`aibrush-media@dev`**

_No admissible benchmarks (no green conformance gate)._

**`ffmpeg.wasm@0.12.15`**

_No admissible benchmarks (no green conformance gate)._

**`mediabunny@1.48.0`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | 28.3 | 28.3 | 508.26× | 25.25 MiB | 55 |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | 84.1 | 84.1 | 325.64× | 209.83 MiB | 55 |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | 88.5 | 88.5 | 380.08× | 209.57 MiB | 0 |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | 89.7 | 89.7 | 373.65× | 198.46 MiB | 55 |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/decode-fps` | 5427.4 | 5427.4 | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `probe/micro_h264_1frame` | 3.6 | 3.6 | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | 723.3 | 723.3 | 42.05× | 0 B | 0 |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | 64.1 | 64.1 | 672.57× | 0 B | 0 |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |

**`mp4box@2.3.0`**

_No admissible benchmarks (no green conformance gate)._

**`platform@chrome-149`**

| Scenario | wall median (ms) | wall p95 (ms) | ×realtime | peak mem | longtasks (ms) |
| --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | — | — | — | — | — |
| `audio-dsp/caf_container_probe` | — | — | — | — | — |
| `audio-dsp/downmix_5_1_to_stereo` | — | — | — | — | — |
| `audio-dsp/downmix_stereo_to_mono` | — | — | — | — | — |
| `audio-dsp/edge_empty_audio_transcode` | — | — | — | — | — |
| `audio-dsp/edge_gapless_aac_decode` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_probe` | — | — | — | — | — |
| `audio-dsp/edge_longform_audio_resample_16k` | — | — | — | — | — |
| `audio-dsp/edge_variable_channel_count_downmix` | — | — | — | — | — |
| `audio-dsp/fade_in_out_f32` | — | — | — | — | — |
| `audio-dsp/gain_half_f32` | — | — | — | — | — |
| `audio-dsp/gain_minus6db_s16` | — | — | — | — | — |
| `audio-dsp/meta_idempotent_resample_same_rate` | — | — | — | — | — |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | — | — | — | — | — |
| `audio-dsp/meta_roundtrip_endianness_s16` | — | — | — | — | — |
| `audio-dsp/negative_image_into_audio_transcode` | — | — | — | — | — |
| `audio-dsp/pcm_f32_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s16_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s16be_to_s16le` | — | — | — | — | — |
| `audio-dsp/pcm_s16le_to_s16be` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_f32` | — | — | — | — | — |
| `audio-dsp/pcm_s24_to_s16` | — | — | — | — | — |
| `audio-dsp/pcm_s24be_to_s16le` | — | — | — | — | — |
| `audio-dsp/resample_44k1_to_48k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_16k` | — | — | — | — | — |
| `audio-dsp/resample_48k_to_44k1` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_decode_s24` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s16be` | — | — | — | — | — |
| `audio-dsp/throughput_encode_s24` | — | — | — | — | — |
| `audio-dsp/upmix_mono_to_stereo` | — | — | — | — | — |
| `audio-dsp/upmix_stereo_to_5_1` | — | — | — | — | — |
| `demux/aac_adts` | — | — | — | — | — |
| `demux/av1_720p_5s` | — | — | — | — | — |
| `demux/empty_audio_zero_packets` | — | — | — | — | — |
| `demux/flac_noseektable` | — | — | — | — | — |
| `demux/flac_seektable` | — | — | — | — | — |
| `demux/h264_1080p_30s` | — | — | — | — | — |
| `demux/h264_1080p_5s` | — | — | — | — | — |
| `demux/h264_4k_10s` | — | — | — | — | — |
| `demux/h264_bframes_1080p` | — | — | — | — | — |
| `demux/h264_in_mkv` | — | — | — | — | — |
| `demux/h264_multitrack` | — | — | — | — | — |
| `demux/h264_rotated90` | — | — | — | — | — |
| `demux/h264_ts` | — | — | — | — | — |
| `demux/h264_vfr` | — | — | — | — | — |
| `demux/hevc_1080p_10s` | — | — | — | — | — |
| `demux/hls_aes128` | — | — | — | — | — |
| `demux/hls_vod` | — | — | — | — | — |
| `demux/metamorphic_flac_seektable_invariance` | — | — | — | — | — |
| `demux/mp3_cbr_notoc` | — | — | — | — | — |
| `demux/mp3_xing` | — | — | — | — | — |
| `demux/opus` | — | — | — | — | — |
| `demux/pcm_s16be` | — | — | — | — | — |
| `demux/size_huge_huge_h264_1080p_600s` | — | — | — | — | — |
| `demux/size_large_large_h264_1080p_120s` | — | — | — | — | — |
| `demux/size_large_large_vp9_1080p_120s` | — | — | — | — | — |
| `demux/size_massive_massive_h264_1080p_2h` | — | — | — | — | — |
| `demux/size_micro_micro_audio_short` | — | — | — | — | — |
| `demux/size_micro_micro_h264_1frame` | — | — | — | — | — |
| `demux/size_tiny_tiny_h264_360p_2s` | — | — | — | — | — |
| `demux/size_tiny_tiny_vp9_360p_2s` | — | — | — | — | — |
| `demux/vp8_720p_10s` | — | — | — | — | — |
| `demux/vp9_1080p_10s` | — | — | — | — | — |
| `demux/vp9_alpha` | — | — | — | — | — |
| `demux/wav_f32` | — | — | — | — | — |
| `demux/wav_s16` | — | — | — | — | — |
| `demux/wav_s24` | — | — | — | — | — |
| `encryption/cenc_cbcs_decrypt` | — | — | — | — | — |
| `encryption/cenc_cens_decrypt_na` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt` | — | — | — | — | — |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/clearkey_decrypt_na` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt` | — | — | — | — | — |
| `encryption/hls_aes128_decrypt_eq_cleartext` | — | — | — | — | — |
| `encryption/hls_sample_aes_decrypt_na` | — | — | — | — | — |
| `encryption/perf_cenc_ctr_decrypt_throughput` | — | — | — | — | — |
| `encryption/unencrypted_left_untouched_noop` | — | — | — | — | — |
| `metadata/meta_consistent_mp4_to_mkv` | — | — | — | — | — |
| `metadata/read_flac_seektable` | — | — | — | — | — |
| `metadata/read_h264_1080p_30s` | — | — | — | — | — |
| `metadata/read_h264_1080p_5s` | — | — | — | — | — |
| `metadata/read_h264_in_mkv` | — | — | — | — | — |
| `metadata/read_h264_multitrack` | — | — | — | — | — |
| `metadata/read_mp3_xing` | — | — | — | — | — |
| `metadata/read_no_tags_recorder_webm` | — | — | — | — | — |
| `metadata/read_no_tags_wav` | — | — | — | — | — |
| `metadata/read_opus` | — | — | — | — | — |
| `metadata/read_pcm_s16be` | — | — | — | — | — |
| `metadata/read_vp9_1080p_10s` | — | — | — | — | — |
| `metadata/rotation_decode_read_h264_rotated90` | — | — | — | — | — |
| `metadata/rotation_survives_mp4_mkv` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_audio_flac` | — | — | — | — | — |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | — | — | — | — | — |
| `metadata/tracks_attribution_multitrack` | — | — | — | — | — |
| `metadata/tracks_packet_attribution_multitrack` | — | — | — | — | — |
| `metadata/write_flac_vorbiscomment` | — | — | — | — | — |
| `metadata/write_mkv_tags` | — | — | — | — | — |
| `metadata/write_mp3_id3` | — | — | — | — | — |
| `metadata/write_mp4_tags` | — | — | — | — | — |
| `metadata/write_ogg_vorbiscomment` | — | — | — | — | — |
| `mux/aac_to_adts` | — | — | — | — | — |
| `mux/audio_only_aac_to_mp4` | — | — | — | — | — |
| `mux/av1_opus_to_mp4` | — | — | — | — | — |
| `mux/drop_audio_track_subset_to_mp4` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_bframes_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_hevc_decode_mux_mp4` | — | — | — | — | — |
| `mux/edge_multitrack_keep_all_to_mp4` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mkv` | — | — | — | — | — |
| `mux/edge_rotation_decode_mux_mov` | — | — | — | — | — |
| `mux/flac_to_mkv_audio` | — | — | — | — | — |
| `mux/h264_aac_to_mkv` | — | — | — | — | — |
| `mux/h264_aac_to_mov` | — | — | — | — | — |
| `mux/h264_aac_to_mp4` | — | — | — | — | — |
| `mux/h264_aac_to_ts` | — | — | — | — | — |
| `mux/mp3_to_mp3` | — | — | — | — | — |
| `mux/mp3_to_mp4_audio` | — | — | — | — | — |
| `mux/mp4_faststart_reserve` | — | — | — | — | — |
| `mux/mp4_fragmented_cmaf` | — | — | — | — | — |
| `mux/mp4_progressive_buffer` | — | — | — | — | — |
| `mux/mp4_streaming_target` | — | — | — | — | — |
| `mux/neg_h264_into_wav_illegal` | — | — | — | — | — |
| `mux/opus_to_ogg` | — | — | — | — | — |
| `mux/opus_to_webm_audio` | — | — | — | — | — |
| `mux/pcm_f32_to_wav` | — | — | — | — | — |
| `mux/pcm_s16_to_wav` | — | — | — | — | — |
| `mux/pcm_s24_to_wav` | — | — | — | — | — |
| `mux/prop_av1_mux_duration_webm_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_h264_mux_duration_mp4_to_ts` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | — | — | — | — | — |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | — | — | — | — | — |
| `mux/prop_vp9_decode_mux_webm_to_webm` | — | — | — | — | — |
| `mux/prop_vp9_mux_duration_webm_to_webm` | — | — | — | — | — |
| `mux/size_large_1080p_to_mkv` | — | — | — | — | — |
| `mux/size_large_1080p_to_mp4` | — | — | — | — | — |
| `mux/size_longform_audio_to_mp4` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mkv` | — | — | — | — | — |
| `mux/size_micro_1frame_to_mp4` | — | — | — | — | — |
| `mux/size_tiny_360p_to_mp4` | — | — | — | — | — |
| `mux/swap_audio_video_with_opus_to_mkv` | — | — | — | — | — |
| `mux/three_track_assembly_to_mkv` | — | — | — | — | — |
| `mux/video_a_plus_audio_b_to_mkv` | — | — | — | — | — |
| `mux/video_plus_audio_to_mp4` | — | — | — | — | — |
| `mux/vorbis_to_ogg` | — | — | — | — | — |
| `mux/vp9_opus_to_webm` | — | — | — | — | — |
| `mux/vp9_video_plus_opus_audio_to_webm` | — | — | — | — | — |
| `performance/bundle-size` | — | — | — | — | — |
| `performance/convert-longtasks` | — | — | — | — | — |
| `performance/convert-peak-memory` | — | — | — | — | — |
| `performance/convert-webm-resize-320x180` | — | — | — | — | — |
| `performance/decode-fps` | 5711.3 | 5711.3 | — | — | — |
| `performance/encode-fps` | — | — | — | — | — |
| `performance/extract-metadata` | — | — | — | — | — |
| `performance/iterate-video-packets` | — | — | — | — | — |
| `performance/metamorphic-decode-remux` | — | — | — | — | — |
| `performance/metamorphic-probe-duration-cross-container` | — | — | — | — | — |
| `performance/metamorphic-transcode-idempotent-source-res` | — | — | — | — | — |
| `performance/metamorphic-vfr-iterate-packets` | — | — | — | — | — |
| `performance/metamorphic-vfr-probe-duration` | — | — | — | — | — |
| `performance/op-sweep-demux` | — | — | — | — | — |
| `performance/op-sweep-probe` | — | — | — | — | — |
| `performance/op-sweep-remux-mp4-to-mkv` | — | — | — | — | — |
| `performance/op-sweep-transcode-webm` | — | — | — | — | — |
| `performance/seek-ms` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-huge` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large` | — | — | — | — | — |
| `performance/size-ladder-demux-peak-memory-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-huge` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-large4k` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-massive` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-medium` | — | — | — | — | — |
| `performance/size-ladder-extract-metadata-tiny` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-huge` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-large4k` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-massive` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-medium` | — | — | — | — | — |
| `performance/size-ladder-iterate-packets-tiny` | — | — | — | — | — |
| `probe/aac_adts` | — | — | — | — | — |
| `probe/av1_720p_5s` | — | — | — | — | — |
| `probe/big_buck_bunny_1080p_h264` | — | — | — | — | — |
| `probe/cenc_cbcs` | — | — | — | — | — |
| `probe/cenc_ctr` | — | — | — | — | — |
| `probe/empty-audio-wav` | — | — | — | — | — |
| `probe/flac_noseektable` | — | — | — | — | — |
| `probe/flac_seektable` | — | — | — | — | — |
| `probe/h264_1080p_30s` | — | — | — | — | — |
| `probe/h264_1080p_5s` | — | — | — | — | — |
| `probe/h264_4k_10s` | — | — | — | — | — |
| `probe/h264_bframes_1080p` | — | — | — | — | — |
| `probe/h264_in_mkv` | — | — | — | — | — |
| `probe/h264_multitrack` | — | — | — | — | — |
| `probe/h264_rotated90` | — | — | — | — | — |
| `probe/h264_ts` | — | — | — | — | — |
| `probe/h264_vfr` | — | — | — | — | — |
| `probe/hevc_1080p_10s` | — | — | — | — | — |
| `probe/hls_aes128` | — | — | — | — | — |
| `probe/hls_vod` | — | — | — | — | — |
| `probe/huge_h264_1080p_600s` | — | — | — | — | — |
| `probe/large_h264_1080p_120s` | — | — | — | — | — |
| `probe/large_vp9_1080p_120s` | — | — | — | — | — |
| `probe/longform_1h_audio` | — | — | — | — | — |
| `probe/massive_h264_1080p_2h` | — | — | — | — | — |
| `probe/metamorphic-duration-across-containers` | — | — | — | — | — |
| `probe/metamorphic-recorder-headerless-sane-duration` | — | — | — | — | — |
| `probe/micro_audio_short` | — | — | — | — | — |
| `probe/micro_h264_1frame` | — | — | — | — | — |
| `probe/mp3_cbr_notoc` | — | — | — | — | — |
| `probe/mp3_xing` | — | — | — | — | — |
| `probe/opus` | — | — | — | — | — |
| `probe/pcm_s16be` | — | — | — | — | — |
| `probe/perf-extract-metadata-huge` | — | — | — | — | — |
| `probe/perf-extract-metadata-large` | — | — | — | — | — |
| `probe/perf-extract-metadata-massive` | — | — | — | — | — |
| `probe/recorder_headerless` | — | — | — | — | — |
| `probe/tiny_h264_360p_2s` | — | — | — | — | — |
| `probe/tiny_vp9_360p_2s` | — | — | — | — | — |
| `probe/truncated-header-graceful` | — | — | — | — | — |
| `probe/vp8_720p_10s` | — | — | — | — | — |
| `probe/vp9_1080p_10s` | — | — | — | — | — |
| `probe/vp9_alpha` | — | — | — | — | — |
| `probe/wav_f32` | — | — | — | — | — |
| `probe/wav_s16` | — | — | — | — | — |
| `probe/wav_s24` | — | — | — | — | — |
| `remux/aac_adts_adts_to_mp4` | — | — | — | — | — |
| `remux/aac_adts_adts_to_ts` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mkv` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_mp4` | — | — | — | — | — |
| `remux/av1_720p_5s_webm_to_webm` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_mkv` | — | — | — | — | — |
| `remux/flac_seektable_flac_to_ogg` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_1080p_30s_mp4_to_ts` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mkv` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_mp4` | — | — | — | — | — |
| `remux/h264_1080p_5s_mov_to_ts` | — | — | — | — | — |
| `remux/h264_bframes_1080p_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mov` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_mp4` | — | — | — | — | — |
| `remux/h264_in_mkv_mkv_to_ts` | — | — | — | — | — |
| `remux/h264_multitrack_mp4_to_mkv` | — | — | — | — | — |
| `remux/h264_rotated90_mp4_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mkv` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mov` | — | — | — | — | — |
| `remux/h264_ts_ts_to_mp4` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mkv` | — | — | — | — | — |
| `remux/hevc_1080p_10s_mp4_to_mov` | — | — | — | — | — |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | — | — | — | — | — |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | — | — | — | — | — |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | — | — | — | — | — |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | — | — | — | — | — |
| `remux/micro_audio_short_mp4_to_adts` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mkv` | — | — | — | — | — |
| `remux/mp3_xing_mp3_to_mp4` | — | — | — | — | — |
| `remux/opus_ogg_to_mkv` | — | — | — | — | — |
| `remux/opus_ogg_to_webm` | — | — | — | — | — |
| `remux/prop_adts_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mkv` | — | — | — | — | — |
| `remux/prop_bframes_decode_remux_mp4_mov` | — | — | — | — | — |
| `remux/prop_mp3_to_mp4_duration_invariant` | — | — | — | — | — |
| `remux/prop_multitrack_survives_mp4_mkv` | — | — | — | — | — |
| `remux/prop_recorder_headerless_duration_materialized` | — | — | — | — | — |
| `remux/prop_rotation_survives_mp4_mov` | — | — | — | — | — |
| `remux/prop_roundtrip_mp4_mkv_mp4` | — | — | — | — | — |
| `remux/prop_ts_to_mp4_duration_materialized` | — | — | — | — | — |
| `remux/vp8_720p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mkv` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_mp4` | — | — | — | — | — |
| `remux/vp9_1080p_10s_webm_to_webm` | — | — | — | — | — |
| `streaming-output/buffer_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/mp4_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_faststart_in_memory` | — | — | — | — | — |
| `streaming-output/mp4_faststart_none_control` | — | — | — | — | — |
| `streaming-output/mp4_faststart_reserve` | — | — | — | — | — |
| `streaming-output/mp4_fragmented_cmaf` | — | — | — | — | — |
| `streaming-output/mp4_streaming_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_buffer_target` | — | — | — | — | — |
| `streaming-output/mp4_ttfb_streaming_target` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_decode_equals_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_faststart_reserve_duration_invariant` | — | — | — | — | — |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_buffer_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_fragmented_shape` | — | — | — | — | — |
| `streaming-output/prop_probe_dur_stream_shape` | — | — | — | — | — |
| `streaming-output/prop_ts_stream_duration_materialized` | — | — | — | — | — |
| `streaming-output/prop_webm_headerless_duration_materialized` | — | — | — | — | — |
| `streaming-output/stream_huge_h264_mov_to_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_h264_mp4` | — | — | — | — | — |
| `streaming-output/stream_large_vp9_webm` | — | — | — | — | — |
| `streaming-output/stream_massive_h264_mp4` | — | — | — | — | — |
| `streaming-output/ts_continuity_many_writes` | — | — | — | — | — |
| `streaming-output/ts_tiny_writes` | — | — | — | — | — |
| `streaming-output/webm_headerless_live_stream` | — | — | — | — | — |
| `streaming-output/webm_streaming_target` | — | — | — | — | — |
| `trim/audio_aac_adts_copy` | — | — | — | — | — |
| `trim/audio_aiff_pcm_be_copy` | — | — | — | — | — |
| `trim/audio_flac_noseektable_copy` | — | — | — | — | — |
| `trim/audio_flac_seektable_copy` | — | — | — | — | — |
| `trim/audio_mp3_copy` | — | — | — | — | — |
| `trim/audio_opus_ogg_copy` | — | — | — | — | — |
| `trim/audio_wav_pcm_copy` | — | — | — | — | — |
| `trim/av1_keyframe_aligned` | — | — | — | — | — |
| `trim/fmp4_fragment_boundary_copy` | — | — | — | — | — |
| `trim/h264_bframes_frame_accurate` | — | — | — | — | — |
| `trim/h264_frame_accurate` | — | — | — | — | — |
| `trim/h264_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_keyframe_aligned_short` | — | — | — | — | — |
| `trim/h264_multitrack_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_noop_full_range_idempotent` | — | — | — | — | — |
| `trim/h264_open_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_rotated_keyframe_aligned` | — | — | — | — | — |
| `trim/h264_single_gop_frame_accurate` | — | — | — | — | — |
| `trim/h264_start_zero_copy` | — | — | — | — | — |
| `trim/h264_subframe_range_frame_accurate` | — | — | — | — | — |
| `trim/h264_to_eof_copy` | — | — | — | — | — |
| `trim/h264_vfr_frame_accurate` | — | — | — | — | — |
| `trim/hevc_frame_accurate` | — | — | — | — | — |
| `trim/hevc_keyframe_aligned` | — | — | — | — | — |
| `trim/huge_h264_mov_copy_peakmem` | — | — | — | — | — |
| `trim/large_h264_copy_lazyread` | — | — | — | — | — |
| `trim/large_h264_frame_accurate_throughput` | — | — | — | — | — |
| `trim/massive_h264_copy_sustained` | — | — | — | — | — |
| `trim/mkv_keyframe_aligned` | — | — | — | — | — |
| `trim/mov_keyframe_aligned` | — | — | — | — | — |
| `trim/robust_zero_length_range` | — | — | — | — | — |
| `trim/ts_keyframe_aligned` | — | — | — | — | — |
| `trim/vp8_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_alpha_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_keyframe_aligned` | — | — | — | — | — |
| `trim/vp9_noop_full_range_idempotent` | — | — | — | — | — |

**`remotion-media-parser@4.0.479`**

_No admissible benchmarks (no green conformance gate)._

**`remotion-webcodecs@4.0.479`**

_No admissible benchmarks (no green conformance gate)._

**`web-demuxer@4.0.0`**

_No admissible benchmarks (no green conformance gate)._


### 5. Δ vs reference (`mediabunny`)

| Scenario | aibrush-media@dev perf | aibrush-media@dev conf | ffmpeg.wasm@0.12.15 perf | ffmpeg.wasm@0.12.15 conf | mediabunny@1.48.0 perf | mediabunny@1.48.0 conf | mp4box@2.3.0 perf | mp4box@2.3.0 conf | platform@chrome-149 perf | platform@chrome-149 conf | remotion-media-parser@4.0.479 perf | remotion-media-parser@4.0.479 conf | remotion-webcodecs@4.0.479 perf | remotion-webcodecs@4.0.479 conf | web-demuxer@4.0.0 perf | web-demuxer@4.0.0 conf |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `audio-dsp/aiff_container_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/caf_container_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_5_1_to_stereo` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/downmix_stereo_to_mono` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_empty_audio_transcode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_gapless_aac_decode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_longform_audio_probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_longform_audio_resample_16k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/edge_variable_channel_count_downmix` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/fade_in_out_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_half_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/gain_minus6db_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_idempotent_resample_same_rate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_probe_duration_across_wav_aiff` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/meta_roundtrip_endianness_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/negative_image_into_audio_transcode` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_f32_to_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16_to_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16be_to_s16le` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s16le_to_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24_to_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/pcm_s24be_to_s16le` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_44k1_to_48k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_16k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/resample_48k_to_44k1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_decode_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/throughput_encode_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/upmix_mono_to_stereo` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `audio-dsp/upmix_stereo_to_5_1` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/aac_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/av1_720p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/empty_audio_zero_packets` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/flac_noseektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/flac_seektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_30s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_1080p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_4k_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_bframes_1080p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_in_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_rotated90` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/h264_vfr` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hevc_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_aes128` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/hls_vod` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/metamorphic_flac_seektable_invariance` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_cbr_notoc` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/mp3_xing` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/opus` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/pcm_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_huge_huge_h264_1080p_600s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_h264_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_large_large_vp9_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_massive_massive_h264_1080p_2h` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_audio_short` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_micro_micro_h264_1frame` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_tiny_tiny_h264_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/size_tiny_tiny_vp9_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp8_720p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp9_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/vp9_alpha` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `demux/wav_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_cbcs_decrypt` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_cens_decrypt_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/clearkey_decrypt_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_aes128_decrypt_eq_cleartext` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/hls_sample_aes_decrypt_na` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/perf_cenc_ctr_decrypt_throughput` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `encryption/unencrypted_left_untouched_noop` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/meta_consistent_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_flac_seektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_30s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_1080p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_in_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_h264_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_mp3_xing` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_no_tags_recorder_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_no_tags_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_opus` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_pcm_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/read_vp9_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/rotation_decode_read_h264_rotated90` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/rotation_survives_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tagedit_no_corrupt_audio_flac` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_attribution_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/tracks_packet_attribution_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_flac_vorbiscomment` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mkv_tags` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp3_id3` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_mp4_tags` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `metadata/write_ogg_vorbiscomment` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/aac_to_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/audio_only_aac_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/av1_opus_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/drop_audio_track_subset_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_bframes_decode_mux_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_hevc_decode_mux_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_hevc_decode_mux_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_multitrack_keep_all_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/edge_rotation_decode_mux_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/flac_to_mkv_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/h264_aac_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp3` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp3_to_mp4_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_faststart_reserve` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_fragmented_cmaf` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_progressive_buffer` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/mp4_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/neg_h264_into_wav_illegal` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/opus_to_webm_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_f32_to_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s16_to_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/pcm_s24_to_wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_av1_mux_duration_webm_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_mux_duration_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_h264_mux_duration_mp4_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_decode_mux_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/prop_vp9_mux_duration_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_large_1080p_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_longform_audio_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_micro_1frame_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/size_tiny_360p_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/swap_audio_video_with_opus_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/three_track_assembly_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/video_a_plus_audio_b_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/video_plus_audio_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vorbis_to_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_opus_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `mux/vp9_video_plus_opus_audio_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/bundle-size` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/convert-longtasks` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/convert-peak-memory` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/convert-webm-resize-320x180` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/decode-fps` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/encode-fps` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/extract-metadata` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/iterate-video-packets` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-decode-remux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-probe-duration-cross-container` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-transcode-idempotent-source-res` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-vfr-iterate-packets` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/metamorphic-vfr-probe-duration` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-demux` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-probe` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-remux-mp4-to-mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/op-sweep-transcode-webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/seek-ms` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-demux-peak-memory-large4k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-large4k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-massive` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-medium` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-extract-metadata-tiny` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-large4k` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-massive` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-medium` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `performance/size-ladder-iterate-packets-tiny` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/aac_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/av1_720p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/big_buck_bunny_1080p_h264` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/cenc_cbcs` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/cenc_ctr` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/empty-audio-wav` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_noseektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/flac_seektable` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_30s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_1080p_5s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_4k_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_bframes_1080p` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_in_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_multitrack` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_rotated90` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/h264_vfr` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/hevc_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/hls_aes128` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/hls_vod` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/huge_h264_1080p_600s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/large_h264_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/large_vp9_1080p_120s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/longform_1h_audio` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/massive_h264_1080p_2h` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/metamorphic-duration-across-containers` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/metamorphic-recorder-headerless-sane-duration` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_audio_short` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/micro_h264_1frame` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_cbr_notoc` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/mp3_xing` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/opus` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/pcm_s16be` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-huge` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-large` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/perf-extract-metadata-massive` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/recorder_headerless` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/tiny_h264_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/tiny_vp9_360p_2s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/truncated-header-graceful` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/vp8_720p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/vp9_1080p_10s` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/vp9_alpha` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/wav_f32` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/wav_s16` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `probe/wav_s24` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/aac_adts_adts_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/aac_adts_adts_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/av1_720p_5s_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/flac_seektable_flac_to_ogg` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_30s_mp4_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_1080p_5s_mov_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_bframes_1080p_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_in_mkv_mkv_to_ts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_multitrack_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_rotated90_mp4_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/h264_ts_ts_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/hevc_1080p_10s_mp4_to_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/micro_audio_short_mp4_to_adts` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/mp3_xing_mp3_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/mp3_xing_mp3_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/opus_ogg_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_adts_to_mp4_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_bframes_decode_remux_mp4_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_mp3_to_mp4_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_multitrack_survives_mp4_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_recorder_headerless_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_rotation_survives_mp4_mov` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_roundtrip_mp4_mkv_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/prop_ts_to_mp4_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp8_720p_10s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mkv` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `remux/vp9_1080p_10s_webm_to_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/buffer_massive_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_buffer_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_in_memory` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_none_control` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_faststart_reserve` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_fragmented_cmaf` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_ttfb_buffer_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/mp4_ttfb_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_decode_equals_buffer_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_decode_equals_stream_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_in_memory_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_faststart_reserve_duration_invariant` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_frag_premise_decode_equality_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_buffer_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_fragmented_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_probe_dur_stream_shape` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_ts_stream_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/prop_webm_headerless_duration_materialized` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_huge_h264_mov_to_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_large_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_large_vp9_webm` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/stream_massive_h264_mp4` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/ts_continuity_many_writes` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/ts_tiny_writes` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/webm_headerless_live_stream` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `streaming-output/webm_streaming_target` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_aac_adts_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_aiff_pcm_be_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_noseektable_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_flac_seektable_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_mp3_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_opus_ogg_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/audio_wav_pcm_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/av1_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/fmp4_fragment_boundary_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_bframes_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_keyframe_aligned_short` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_multitrack_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_noop_full_range_idempotent` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_open_gop_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_rotated_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_single_gop_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_start_zero_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_subframe_range_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_to_eof_copy` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/h264_vfr_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_frame_accurate` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/hevc_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/huge_h264_mov_copy_peakmem` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_copy_lazyread` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/large_h264_frame_accurate_throughput` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/massive_h264_copy_sustained` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/mkv_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/mov_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/robust_zero_length_range` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/ts_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp8_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_alpha_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_keyframe_aligned` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| `trim/vp9_noop_full_range_idempotent` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

## 5. Per-engine scorecard

| Engine | Conformance % | Pass / applicable | Perf idx (chromium) | Perf idx (brave) | Capability breadth | Robustness % |
| --- | --- | --- | --- | --- | --- | --- |
| `aibrush-media@dev` | 0% | 0 / 0 | — | — | 0 (—) | — |
| `ffmpeg.wasm@0.12.15` | 75% | 3 / 4 | — | — | 1 (performance) | — |
| `mediabunny@1.48.0` | 31.1% | 87 / 280 | — | — | 7 (demux, metadata, mux, performance, probe, remux, trim) | — |
| `mp4box@2.3.0` | 63% | 51 / 81 | — | — | 5 (demux, metadata, performance, probe, streaming-output) | — |
| `platform@chrome-149` | 47.2% | 42 / 89 | — | — | 4 (demux, metadata, performance, probe) | — |
| `remotion-media-parser@4.0.479` | 53.8% | 49 / 91 | — | — | 4 (demux, metadata, performance, probe) | — |
| `remotion-webcodecs@4.0.479` | 46.5% | 67 / 144 | — | — | 6 (demux, metadata, performance, probe, remux, streaming-output) | — |
| `web-demuxer@4.0.0` | 37.1% | 33 / 89 | — | — | 4 (demux, metadata, performance, probe) | — |

_Perf index = geometric mean of throughput ratios vs reference, per browser, over co-passing scenarios. >1.00× = faster than reference on average; null/— = no co-passing scenario to compare._

## Caveats (read before quoting any number)

- Browser numbers are INDICATIVE only. They depend on GPU, OS, drivers, and thermal state; a measurement made on one machine does not transfer to another.
- NEVER compare a raw number across browsers or across machines. Every delta in this report is "vs the reference engine, on the SAME browser, on the same corpus." Cross-browser comparison is invalid by construction — that is why the report is grouped by browser.
- Hardware codec sessions are the real parallelism ceiling, not navigator.hardwareConcurrency. Contention for a limited number of hardware decode/encode sessions can dominate timing for codec-bound workloads.
- No measurement -> no claim. No green correctness oracle -> no admissible benchmark: a perf number is reported only after the engine produced correct output for that engine x browser x scenario. A speedup with wrong output is a regression, not a win.
- N/A = not supported by the framework or by the browser/runtime. The machine-readable report.json keeps the two internal not-applicable statuses distinct; the human-facing table intentionally folds them into one marker.
- Runs assume AC power and a quiesced machine. Differences within the noise band are reported as within-noise and are NOT claimed as improvements or regressions.
