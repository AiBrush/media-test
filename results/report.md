# Browser Media-Engine Comparison Report

Reference engine: `mediabunny` · Suite 0.1.0 · Generated 2026-06-17T18:43:26.685Z

Engines: `mediabunny@1.48.0`, `mp4box.js@0.5.4`, `platform@chrome-149` · Browsers: chromium · Scenarios: 140

All deltas are **within a single browser, vs the reference engine, on the same corpus.** Numbers are never compared across browsers (see Caveats).

## 1. Conformance Summary

| Engine | chromium conf % |
| --- | --- |
| `mediabunny@1.48.0` | 32.1% |
| `mp4box.js@0.5.4` | 78.9% |
| `platform@chrome-149` | 0% |

> **Cell legend:** `PASS` / `FAIL` / `ERROR` / `SKIPPED` are conformance outcomes. `-` = feature not supported by that engine (NA·engine — the feature still lives in the suite, only this cell is skipped). `-ᵇ` = supported by the engine but the browser lacks the codec/API (NA·browser). `—` = not run.

## Browser: chromium

### 2. Conformance matrix

| Scenario | mediabunny@1.48.0 | mp4box.js@0.5.4 | platform@chrome-149 |
| --- | --- | --- | --- |
| `audio-dsp/downmix_stereo_to_mono` | -ᵇ | - | - |
| `audio-dsp/pcm_f32_to_s16` | -ᵇ | - | - |
| `audio-dsp/pcm_s16_to_f32` | -ᵇ | - | - |
| `audio-dsp/pcm_s16be_to_s16le` | -ᵇ | - | - |
| `audio-dsp/pcm_s24_to_f32` | -ᵇ | - | - |
| `audio-dsp/pcm_s24_to_s16` | -ᵇ | - | - |
| `audio-dsp/resample_44k1_to_48k` | -ᵇ | - | - |
| `audio-dsp/resample_48k_to_16k` | -ᵇ | - | - |
| `audio-dsp/resample_48k_to_44k1` | -ᵇ | - | - |
| `audio-dsp/upmix_mono_to_stereo` | -ᵇ | - | - |
| `decode-seek/decode_av1` | FAIL | - | FAIL |
| `decode-seek/decode_bframes_reorder` | FAIL | - | FAIL |
| `decode-seek/decode_h264_first_frames` | FAIL | - | FAIL |
| `decode-seek/decode_hevc` | -ᵇ | - | -ᵇ |
| `decode-seek/decode_vfr_timing` | FAIL | - | FAIL |
| `decode-seek/decode_vp8` | FAIL | - | FAIL |
| `decode-seek/decode_vp9` | FAIL | - | FAIL |
| `decode-seek/decode_vp9_alpha` | FAIL | - | FAIL |
| `decode-seek/seek_bframes_midgop` | FAIL | - | FAIL |
| `decode-seek/seek_h264_keyframe` | FAIL | - | FAIL |
| `decode-seek/seek_h264_nonkeyframe` | FAIL | - | FAIL |
| `decode-seek/seek_vfr_arbitrary` | FAIL | - | FAIL |
| `decode-seek/seek_vp9_keyframe` | FAIL | - | FAIL |
| `demux/aac_adts` | PASS | - | - |
| `demux/av1_720p_5s` | PASS | - | - |
| `demux/flac_seektable` | -ᵇ | - | - |
| `demux/h264_1080p_30s` | PASS | PASS | - |
| `demux/h264_1080p_5s` | PASS | PASS | - |
| `demux/h264_bframes_1080p` | FAIL | PASS | - |
| `demux/h264_in_mkv` | PASS | - | - |
| `demux/h264_multitrack` | PASS | PASS | - |
| `demux/h264_ts` | PASS | - | - |
| `demux/h264_vfr` | FAIL | PASS | - |
| `demux/opus` | FAIL | - | - |
| `demux/vp8_720p_10s` | -ᵇ | - | - |
| `demux/vp9_1080p_10s` | PASS | - | - |
| `encryption/cenc_cbcs_decrypt` | ERROR | - | - |
| `encryption/cenc_ctr_decrypt` | ERROR | - | - |
| `encryption/hls_aes128_decrypt` | - | - | - |
| `encryption/unencrypted_left_untouched` | FAIL | - | - |
| `metadata/read_flac_seektable` | -ᵇ | - | - |
| `metadata/read_h264_1080p_30s` | PASS | PASS | - |
| `metadata/read_h264_in_mkv` | PASS | - | - |
| `metadata/read_h264_multitrack` | PASS | PASS | - |
| `metadata/read_h264_rotated90` | PASS | PASS | - |
| `metadata/read_mp3_xing` | PASS | - | - |
| `metadata/read_opus` | PASS | - | - |
| `metadata/read_vp9_1080p_10s` | PASS | - | - |
| `metadata/write_flac_vorbiscomment` | -ᵇ | - | - |
| `metadata/write_mkv_tags` | FAIL | - | - |
| `metadata/write_mp3_id3` | FAIL | - | - |
| `metadata/write_mp4_tags` | FAIL | - | - |
| `mux/audio_only_aac_to_mp4` | ERROR | - | - |
| `mux/av1_opus_to_mp4` | ERROR | - | - |
| `mux/h264_aac_to_mkv` | ERROR | - | - |
| `mux/h264_aac_to_mp4` | ERROR | - | - |
| `mux/h264_aac_to_ts` | ERROR | - | - |
| `mux/video_plus_audio_to_mp4` | ERROR | - | - |
| `mux/vp9_opus_to_webm` | ERROR | - | - |
| `probe/aac_adts` | PASS | - | - |
| `probe/av1_720p_5s` | PASS | - | - |
| `probe/cenc_cbcs` | ERROR | ERROR | - |
| `probe/cenc_ctr` | PASS | FAIL | - |
| `probe/flac_noseektable` | -ᵇ | - | - |
| `probe/flac_seektable` | -ᵇ | - | - |
| `probe/h264_1080p_30s` | PASS | PASS | - |
| `probe/h264_1080p_5s` | PASS | FAIL | - |
| `probe/h264_4k_10s` | PASS | PASS | - |
| `probe/h264_bframes_1080p` | PASS | PASS | - |
| `probe/h264_in_mkv` | PASS | - | - |
| `probe/h264_multitrack` | PASS | PASS | - |
| `probe/h264_rotated90` | PASS | PASS | - |
| `probe/h264_ts` | PASS | - | - |
| `probe/h264_vfr` | FAIL | PASS | - |
| `probe/hevc_1080p_10s` | -ᵇ | PASS | - |
| `probe/hls_vod` | - | - | - |
| `probe/longform_1h_audio` | ERROR | ERROR | - |
| `probe/mp3_cbr_notoc` | PASS | - | - |
| `probe/mp3_xing` | PASS | - | - |
| `probe/opus` | PASS | - | - |
| `probe/recorder_headerless` | ERROR | - | - |
| `probe/vp8_720p_10s` | -ᵇ | - | - |
| `probe/vp9_1080p_10s` | PASS | - | - |
| `probe/vp9_alpha` | PASS | - | - |
| `probe/wav_f32` | PASS | - | - |
| `probe/wav_s16` | PASS | - | - |
| `probe/wav_s16be` | -ᵇ | - | - |
| `probe/wav_s24` | PASS | - | - |
| `remux/aac_adts_adts_to_mp4` | FAIL | - | - |
| `remux/av1_720p_5s_webm_to_mkv` | FAIL | - | - |
| `remux/av1_720p_5s_webm_to_mp4` | FAIL | - | - |
| `remux/flac_seektable_flac_to_mkv` | -ᵇ | - | - |
| `remux/h264_1080p_30s_mp4_to_mkv` | FAIL | - | - |
| `remux/h264_1080p_30s_mp4_to_mov` | FAIL | - | - |
| `remux/h264_1080p_30s_mp4_to_ts` | FAIL | - | - |
| `remux/h264_1080p_5s_mov_to_mp4` | FAIL | - | - |
| `remux/h264_bframes_1080p_mp4_to_mkv` | FAIL | - | - |
| `remux/h264_in_mkv_mkv_to_mp4` | FAIL | - | - |
| `remux/h264_multitrack_mp4_to_mkv` | FAIL | - | - |
| `remux/h264_rotated90_mp4_to_mov` | FAIL | - | - |
| `remux/h264_ts_ts_to_mp4` | FAIL | - | - |
| `remux/hevc_1080p_10s_mp4_to_mkv` | -ᵇ | - | - |
| `remux/mp3_xing_mp3_to_mp4` | FAIL | - | - |
| `remux/opus_ogg_to_webm` | FAIL | - | - |
| `remux/vp8_720p_10s_webm_to_mkv` | -ᵇ | - | - |
| `remux/vp9_1080p_10s_webm_to_mkv` | FAIL | - | - |
| `streaming-output/mp4_buffer_target` | FAIL | - | - |
| `streaming-output/mp4_faststart_reserve` | FAIL | - | - |
| `streaming-output/mp4_fragmented_cmaf` | FAIL | - | - |
| `streaming-output/mp4_streaming_target` | FAIL | - | - |
| `streaming-output/ts_tiny_writes` | FAIL | - | - |
| `streaming-output/webm_streaming_target` | FAIL | - | - |
| `transcode/aac_to_opus_webm` | FAIL | - | - |
| `transcode/av1_to_h264_mp4` | FAIL | - | - |
| `transcode/fanout_h264_abr_ladder` | ERROR | - | - |
| `transcode/flac_to_aac_mp4` | -ᵇ | - | - |
| `transcode/h264_bitrate_2mbps` | FAIL | - | - |
| `transcode/h264_fps_30_to_15` | FAIL | - | - |
| `transcode/h264_resize_4k_to_1080p` | ERROR | - | - |
| `transcode/h264_resize_720p` | ERROR | - | - |
| `transcode/h264_rotate_normalize` | FAIL | - | - |
| `transcode/h264_to_av1_mp4` | FAIL | - | - |
| `transcode/h264_to_hevc_mp4` | -ᵇ | - | - |
| `transcode/h264_to_vp8_webm` | -ᵇ | - | - |
| `transcode/h264_to_vp9_webm` | FAIL | - | - |
| `transcode/h264_vfr_to_cfr_30` | FAIL | - | - |
| `transcode/hevc_to_h264_mp4` | -ᵇ | - | - |
| `transcode/mp3_to_aac_mp4` | -ᵇ | - | - |
| `transcode/vp8_to_h264_mp4` | -ᵇ | - | - |
| `transcode/vp9_to_h264_mp4` | FAIL | - | - |
| `transcode/wav_to_aac_mp4` | -ᵇ | - | - |
| `transcode/wav_to_flac` | -ᵇ | - | - |
| `transcode/wav_to_opus_ogg` | -ᵇ | - | - |
| `trim/audio_mp3_copy` | ERROR | - | - |
| `trim/h264_bframes_frame_accurate` | ERROR | - | - |
| `trim/h264_frame_accurate` | ERROR | - | - |
| `trim/h264_keyframe_aligned` | ERROR | - | - |
| `trim/h264_keyframe_aligned_short` | ERROR | - | - |
| `trim/h264_vfr_frame_accurate` | ERROR | - | - |
| `trim/vp9_keyframe_aligned` | ERROR | - | - |

<details><summary>Reasons (FAIL / NA / ERROR)</summary>

- `mediabunny@1.48.0` · `audio-dsp/downmix_stereo_to_mono` — **-ᵇ**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_f32_to_s16` — **-ᵇ**: browser cannot encode audio codec 'pcm-f32' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_s16_to_f32` — **-ᵇ**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_s16be_to_s16le` — **-ᵇ**: browser cannot encode audio codec 'pcm-s16be' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_s24_to_f32` — **-ᵇ**: browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/pcm_s24_to_s16` — **-ᵇ**: browser cannot encode audio codec 'pcm-s24' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/resample_44k1_to_48k` — **-ᵇ**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/resample_48k_to_16k` — **-ᵇ**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/resample_48k_to_44k1` — **-ᵇ**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `audio-dsp/upmix_mono_to_stereo` — **-ᵇ**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `decode-seek/decode_av1` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `mediabunny@1.48.0` · `decode-seek/decode_bframes_reorder` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `mediabunny@1.48.0` · `decode-seek/decode_h264_first_frames` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `mediabunny@1.48.0` · `decode-seek/decode_hevc` — **-ᵇ**: browser cannot decode video codec 'hevc' (WebCodecs VideoDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `decode-seek/decode_vfr_timing` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `mediabunny@1.48.0` · `decode-seek/decode_vp8` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `mediabunny@1.48.0` · `decode-seek/decode_vp9` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `mediabunny@1.48.0` · `decode-seek/decode_vp9_alpha` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `mediabunny@1.48.0` · `decode-seek/seek_bframes_midgop` — **FAIL**: oracle 'seek-accuracy' failed: no golden frame matched the landed pts for digest comparison
- `mediabunny@1.48.0` · `decode-seek/seek_h264_keyframe` — **FAIL**: oracle 'seek-accuracy' failed: landed 5000000µs vs expected keyframe 4992000µs (Δ 8000µs > 0µs); no golden frame matched the landed pts for digest comparison
- `mediabunny@1.48.0` · `decode-seek/seek_h264_nonkeyframe` — **FAIL**: oracle 'seek-accuracy' failed: no golden frame matched the landed pts for digest comparison
- `mediabunny@1.48.0` · `decode-seek/seek_vfr_arbitrary` — **FAIL**: oracle 'seek-accuracy' failed: no golden frame matched the landed pts for digest comparison
- `mediabunny@1.48.0` · `decode-seek/seek_vp9_keyframe` — **FAIL**: oracle 'seek-accuracy' failed: no golden frame matched the landed pts for digest comparison
- `mediabunny@1.48.0` · `demux/flac_seektable` — **-ᵇ**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `demux/h264_bframes_1080p` — **FAIL**: oracle 'golden-packets' failed: 256 packets had a size mismatch; 1 packets had a keyframe-flag mismatch; 256 packets pts drift beyond ±1000µs after per-track origin alignment
- `mediabunny@1.48.0` · `demux/h264_vfr` — **FAIL**: oracle 'golden-packets' failed: 95 packets had a size mismatch; 95 packets pts drift beyond ±1000µs after per-track origin alignment; 87 packets dts drift beyond ±1000µs after per-track origin alignment
- `mediabunny@1.48.0` · `demux/opus` — **FAIL**: oracle 'golden-packets' failed: 500 packets pts drift beyond ±1000µs after per-track origin alignment; 500 packets dts drift beyond ±1000µs after per-track origin alignment
- `mediabunny@1.48.0` · `demux/vp8_720p_10s` — **-ᵇ**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `encryption/cenc_cbcs_decrypt` — **ERROR**: failed to fetch corpus asset 'cenc_cbcs.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `encryption/cenc_ctr_decrypt` — **ERROR**: offset is out of bounds
- `mediabunny@1.48.0` · `encryption/hls_aes128_decrypt` — **-**: engine does not declare input container 'hls'
- `mediabunny@1.48.0` · `encryption/unencrypted_left_untouched` — **FAIL**: oracle 'decrypt-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `metadata/read_flac_seektable` — **-ᵇ**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `metadata/write_flac_vorbiscomment` — **-ᵇ**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `metadata/write_mkv_tags` — **FAIL**: oracle 'golden-metadata' failed: no probe metadata on ctx.metadata
- `mediabunny@1.48.0` · `metadata/write_mp3_id3` — **FAIL**: oracle 'golden-metadata' failed: no probe metadata on ctx.metadata
- `mediabunny@1.48.0` · `metadata/write_mp4_tags` — **FAIL**: oracle 'golden-metadata' failed: no probe metadata on ctx.metadata
- `mediabunny@1.48.0` · `mux/audio_only_aac_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/av1_opus_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/h264_aac_to_mkv` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/h264_aac_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/h264_aac_to_ts` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/video_plus_audio_to_mp4` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `mux/vp9_opus_to_webm` — **ERROR**: mux scenario requires options.tracks (EncodedTracks)
- `mediabunny@1.48.0` · `probe/cenc_cbcs` — **ERROR**: failed to fetch corpus asset 'cenc_cbcs.mp4' (404 Not Found)
- `mediabunny@1.48.0` · `probe/flac_noseektable` — **-ᵇ**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `probe/flac_seektable` — **-ᵇ**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `probe/h264_vfr` — **FAIL**: oracle 'golden-metadata' failed: duration: measured 12.6333s vs golden 12.5330s (Δ 0.1003s > tol 0.0417s); track[0].fps: 8.786279683377309 vs 8.856
- `mediabunny@1.48.0` · `probe/hevc_1080p_10s` — **-ᵇ**: browser cannot decode video codec 'hevc' (WebCodecs VideoDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `probe/hls_vod` — **-**: engine does not declare input container 'hls'
- `mediabunny@1.48.0` · `probe/longform_1h_audio` — **ERROR**: failed to fetch corpus asset 'longform_1h_audio.m4a' (404 Not Found)
- `mediabunny@1.48.0` · `probe/recorder_headerless` — **ERROR**: failed to fetch corpus asset 'recorder_headerless.webm' (404 Not Found)
- `mediabunny@1.48.0` · `probe/vp8_720p_10s` — **-ᵇ**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `probe/wav_s16be` — **-ᵇ**: browser cannot decode audio codec 'pcm-s16be' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `remux/aac_adts_adts_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests (fixtures/golden/<id>.frames.json absent/empty)
- `mediabunny@1.48.0` · `remux/av1_720p_5s_webm_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `remux/av1_720p_5s_webm_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `remux/flac_seektable_flac_to_mkv` — **-ᵇ**: browser cannot decode audio codec 'flac' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `remux/h264_1080p_30s_mp4_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `remux/h264_1080p_30s_mp4_to_mov` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `remux/h264_1080p_30s_mp4_to_ts` — **FAIL**: oracle 'decoded-frames-bitexact' failed: <video> error before metadata
- `mediabunny@1.48.0` · `remux/h264_1080p_5s_mov_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `remux/h264_bframes_1080p_mp4_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `remux/h264_in_mkv_mkv_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `remux/h264_multitrack_mp4_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `remux/h264_rotated90_mp4_to_mov` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `remux/h264_ts_ts_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `remux/hevc_1080p_10s_mp4_to_mkv` — **-ᵇ**: browser cannot decode video codec 'hevc' (WebCodecs VideoDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `remux/mp3_xing_mp3_to_mp4` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests (fixtures/golden/<id>.frames.json absent/empty)
- `mediabunny@1.48.0` · `remux/opus_ogg_to_webm` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests (fixtures/golden/<id>.frames.json absent/empty)
- `mediabunny@1.48.0` · `remux/vp8_720p_10s_webm_to_mkv` — **-ᵇ**: browser cannot decode audio codec 'vorbis' (WebCodecs AudioDecoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `remux/vp9_1080p_10s_webm_to_mkv` — **FAIL**: oracle 'decoded-frames-bitexact' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `streaming-output/mp4_buffer_target` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/mp4_faststart_reserve` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/mp4_fragmented_cmaf` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/mp4_streaming_target` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/ts_tiny_writes` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `streaming-output/webm_streaming_target` — **FAIL**: oracle 'reference-reimport' failed: no ctx.referenceEngine injected
- `mediabunny@1.48.0` · `transcode/aac_to_opus_webm` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no golden frame digests (fixtures/golden/<id>.frames.json absent/empty)
- `mediabunny@1.48.0` · `transcode/av1_to_h264_mp4` — **FAIL**: oracle 'ssim-psnr' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `transcode/fanout_h264_abr_ladder` — **ERROR**: When both options.video.width and options.video.height are provided, options.video.fit must also be provided.
- `mediabunny@1.48.0` · `transcode/flac_to_aac_mp4` — **-ᵇ**: browser cannot encode audio codec 'flac' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/h264_bitrate_2mbps` — **FAIL**: oracle 'ssim-psnr' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `transcode/h264_fps_30_to_15` — **FAIL**: oracle 'ssim-psnr' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `transcode/h264_resize_4k_to_1080p` — **ERROR**: When both options.video.width and options.video.height are provided, options.video.fit must also be provided.
- `mediabunny@1.48.0` · `transcode/h264_resize_720p` — **ERROR**: When both options.video.width and options.video.height are provided, options.video.fit must also be provided.
- `mediabunny@1.48.0` · `transcode/h264_rotate_normalize` — **FAIL**: oracle 'ssim-psnr' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `transcode/h264_to_av1_mp4` — **FAIL**: oracle 'ssim-psnr' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `transcode/h264_to_hevc_mp4` — **-ᵇ**: browser cannot encode video codec 'hevc' (WebCodecs VideoEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/h264_to_vp8_webm` — **-ᵇ**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/h264_to_vp9_webm` — **FAIL**: oracle 'ssim-psnr' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `transcode/h264_vfr_to_cfr_30` — **FAIL**: oracle 'ssim-psnr' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `transcode/hevc_to_h264_mp4` — **-ᵇ**: browser cannot encode video codec 'hevc' (WebCodecs VideoEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/mp3_to_aac_mp4` — **-ᵇ**: browser cannot encode audio codec 'mp3' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/vp8_to_h264_mp4` — **-ᵇ**: browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/vp9_to_h264_mp4` — **FAIL**: oracle 'ssim-psnr' failed: Cannot read properties of null (reading 'trim')
- `mediabunny@1.48.0` · `transcode/wav_to_aac_mp4` — **-ᵇ**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/wav_to_flac` — **-ᵇ**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `transcode/wav_to_opus_ogg` — **-ᵇ**: browser cannot encode audio codec 'pcm-s16' (WebCodecs AudioEncoder.isConfigSupported=false)
- `mediabunny@1.48.0` · `trim/audio_mp3_copy` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_bframes_frame_accurate` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_frame_accurate` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_keyframe_aligned_short` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/h264_vfr_frame_accurate` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mediabunny@1.48.0` · `trim/vp9_keyframe_aligned` — **ERROR**: options.trim.start must be less than options.trim.end.
- `mp4box.js@0.5.4` · `audio-dsp/downmix_stereo_to_mono` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `audio-dsp/pcm_f32_to_s16` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `audio-dsp/pcm_s16_to_f32` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `audio-dsp/pcm_s16be_to_s16le` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `audio-dsp/pcm_s24_to_f32` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `audio-dsp/pcm_s24_to_s16` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `audio-dsp/resample_44k1_to_48k` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `audio-dsp/resample_48k_to_16k` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `audio-dsp/resample_48k_to_44k1` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `audio-dsp/upmix_mono_to_stereo` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `decode-seek/decode_av1` — **-**: engine does not declare operation 'decodeFrames'
- `mp4box.js@0.5.4` · `decode-seek/decode_bframes_reorder` — **-**: engine does not declare operation 'decodeFrames'
- `mp4box.js@0.5.4` · `decode-seek/decode_h264_first_frames` — **-**: engine does not declare operation 'decodeFrames'
- `mp4box.js@0.5.4` · `decode-seek/decode_hevc` — **-**: engine does not declare operation 'decodeFrames'
- `mp4box.js@0.5.4` · `decode-seek/decode_vfr_timing` — **-**: engine does not declare operation 'decodeFrames'
- `mp4box.js@0.5.4` · `decode-seek/decode_vp8` — **-**: engine does not declare operation 'decodeFrames'
- `mp4box.js@0.5.4` · `decode-seek/decode_vp9` — **-**: engine does not declare operation 'decodeFrames'
- `mp4box.js@0.5.4` · `decode-seek/decode_vp9_alpha` — **-**: engine does not declare operation 'decodeFrames'
- `mp4box.js@0.5.4` · `decode-seek/seek_bframes_midgop` — **-**: engine does not declare operation 'seek'
- `mp4box.js@0.5.4` · `decode-seek/seek_h264_keyframe` — **-**: engine does not declare operation 'seek'
- `mp4box.js@0.5.4` · `decode-seek/seek_h264_nonkeyframe` — **-**: engine does not declare operation 'seek'
- `mp4box.js@0.5.4` · `decode-seek/seek_vfr_arbitrary` — **-**: engine does not declare operation 'seek'
- `mp4box.js@0.5.4` · `decode-seek/seek_vp9_keyframe` — **-**: engine does not declare operation 'seek'
- `mp4box.js@0.5.4` · `demux/aac_adts` — **-**: engine does not declare input container 'adts'
- `mp4box.js@0.5.4` · `demux/av1_720p_5s` — **-**: engine does not declare input container 'webm'
- `mp4box.js@0.5.4` · `demux/flac_seektable` — **-**: engine does not declare input container 'flac'
- `mp4box.js@0.5.4` · `demux/h264_in_mkv` — **-**: engine does not declare input container 'mkv'
- `mp4box.js@0.5.4` · `demux/h264_ts` — **-**: engine does not declare input container 'ts'
- `mp4box.js@0.5.4` · `demux/opus` — **-**: engine does not declare input container 'ogg'
- `mp4box.js@0.5.4` · `demux/vp8_720p_10s` — **-**: engine does not declare input container 'webm'
- `mp4box.js@0.5.4` · `demux/vp9_1080p_10s` — **-**: engine does not declare input container 'webm'
- `mp4box.js@0.5.4` · `encryption/cenc_cbcs_decrypt` — **-**: engine does not declare operation 'decrypt'
- `mp4box.js@0.5.4` · `encryption/cenc_ctr_decrypt` — **-**: engine does not declare operation 'decrypt'
- `mp4box.js@0.5.4` · `encryption/hls_aes128_decrypt` — **-**: engine does not declare operation 'decrypt'
- `mp4box.js@0.5.4` · `encryption/unencrypted_left_untouched` — **-**: engine does not declare operation 'decrypt'
- `mp4box.js@0.5.4` · `metadata/read_flac_seektable` — **-**: engine does not declare input container 'flac'
- `mp4box.js@0.5.4` · `metadata/read_h264_in_mkv` — **-**: engine does not declare input container 'mkv'
- `mp4box.js@0.5.4` · `metadata/read_mp3_xing` — **-**: engine does not declare input container 'mp3'
- `mp4box.js@0.5.4` · `metadata/read_opus` — **-**: engine does not declare input container 'ogg'
- `mp4box.js@0.5.4` · `metadata/read_vp9_1080p_10s` — **-**: engine does not declare input container 'webm'
- `mp4box.js@0.5.4` · `metadata/write_flac_vorbiscomment` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `metadata/write_mkv_tags` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `metadata/write_mp3_id3` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `metadata/write_mp4_tags` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `mux/audio_only_aac_to_mp4` — **-**: engine does not declare operation 'mux'
- `mp4box.js@0.5.4` · `mux/av1_opus_to_mp4` — **-**: engine does not declare operation 'mux'
- `mp4box.js@0.5.4` · `mux/h264_aac_to_mkv` — **-**: engine does not declare operation 'mux'
- `mp4box.js@0.5.4` · `mux/h264_aac_to_mp4` — **-**: engine does not declare operation 'mux'
- `mp4box.js@0.5.4` · `mux/h264_aac_to_ts` — **-**: engine does not declare operation 'mux'
- `mp4box.js@0.5.4` · `mux/video_plus_audio_to_mp4` — **-**: engine does not declare operation 'mux'
- `mp4box.js@0.5.4` · `mux/vp9_opus_to_webm` — **-**: engine does not declare operation 'mux'
- `mp4box.js@0.5.4` · `probe/aac_adts` — **-**: engine does not declare input container 'adts'
- `mp4box.js@0.5.4` · `probe/av1_720p_5s` — **-**: engine does not declare input container 'webm'
- `mp4box.js@0.5.4` · `probe/cenc_cbcs` — **ERROR**: failed to fetch corpus asset 'cenc_cbcs.mp4' (404 Not Found)
- `mp4box.js@0.5.4` · `probe/cenc_ctr` — **FAIL**: oracle 'golden-metadata' failed: duration: measured null vs golden 5.021s; track[0].codec: 'encv' vs 'h264'; track[0].fps: null vs 29.872; track[1].codec: 'enca' vs 'aac'
- `mp4box.js@0.5.4` · `probe/flac_noseektable` — **-**: engine does not declare input container 'flac'
- `mp4box.js@0.5.4` · `probe/flac_seektable` — **-**: engine does not declare input container 'flac'
- `mp4box.js@0.5.4` · `probe/h264_1080p_5s` — **FAIL**: oracle 'golden-metadata' failed: container: measured 'mp4' vs golden 'mov'; track[1].codec: 'mp4a' vs 'aac'
- `mp4box.js@0.5.4` · `probe/h264_in_mkv` — **-**: engine does not declare input container 'mkv'
- `mp4box.js@0.5.4` · `probe/h264_ts` — **-**: engine does not declare input container 'ts'
- `mp4box.js@0.5.4` · `probe/hls_vod` — **-**: engine does not declare input container 'hls'
- `mp4box.js@0.5.4` · `probe/longform_1h_audio` — **ERROR**: failed to fetch corpus asset 'longform_1h_audio.m4a' (404 Not Found)
- `mp4box.js@0.5.4` · `probe/mp3_cbr_notoc` — **-**: engine does not declare input container 'mp3'
- `mp4box.js@0.5.4` · `probe/mp3_xing` — **-**: engine does not declare input container 'mp3'
- `mp4box.js@0.5.4` · `probe/opus` — **-**: engine does not declare input container 'ogg'
- `mp4box.js@0.5.4` · `probe/recorder_headerless` — **-**: engine does not declare input container 'webm'
- `mp4box.js@0.5.4` · `probe/vp8_720p_10s` — **-**: engine does not declare input container 'webm'
- `mp4box.js@0.5.4` · `probe/vp9_1080p_10s` — **-**: engine does not declare input container 'webm'
- `mp4box.js@0.5.4` · `probe/vp9_alpha` — **-**: engine does not declare input container 'webm'
- `mp4box.js@0.5.4` · `probe/wav_f32` — **-**: engine does not declare input container 'wav'
- `mp4box.js@0.5.4` · `probe/wav_s16` — **-**: engine does not declare input container 'wav'
- `mp4box.js@0.5.4` · `probe/wav_s16be` — **-**: engine does not declare input container 'wav'
- `mp4box.js@0.5.4` · `probe/wav_s24` — **-**: engine does not declare input container 'wav'
- `mp4box.js@0.5.4` · `remux/aac_adts_adts_to_mp4` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/av1_720p_5s_webm_to_mkv` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/av1_720p_5s_webm_to_mp4` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/flac_seektable_flac_to_mkv` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/h264_1080p_30s_mp4_to_mkv` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/h264_1080p_30s_mp4_to_mov` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/h264_1080p_30s_mp4_to_ts` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/h264_1080p_5s_mov_to_mp4` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/h264_bframes_1080p_mp4_to_mkv` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/h264_in_mkv_mkv_to_mp4` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/h264_multitrack_mp4_to_mkv` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/h264_rotated90_mp4_to_mov` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/h264_ts_ts_to_mp4` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/hevc_1080p_10s_mp4_to_mkv` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/mp3_xing_mp3_to_mp4` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/opus_ogg_to_webm` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/vp8_720p_10s_webm_to_mkv` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `remux/vp9_1080p_10s_webm_to_mkv` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `streaming-output/mp4_buffer_target` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `streaming-output/mp4_faststart_reserve` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `streaming-output/mp4_fragmented_cmaf` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `streaming-output/mp4_streaming_target` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `streaming-output/ts_tiny_writes` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `streaming-output/webm_streaming_target` — **-**: engine does not declare operation 'remux'
- `mp4box.js@0.5.4` · `transcode/aac_to_opus_webm` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/av1_to_h264_mp4` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/fanout_h264_abr_ladder` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/flac_to_aac_mp4` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/h264_bitrate_2mbps` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/h264_fps_30_to_15` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/h264_resize_4k_to_1080p` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/h264_resize_720p` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/h264_rotate_normalize` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/h264_to_av1_mp4` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/h264_to_hevc_mp4` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/h264_to_vp8_webm` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/h264_to_vp9_webm` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/h264_vfr_to_cfr_30` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/hevc_to_h264_mp4` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/mp3_to_aac_mp4` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/vp8_to_h264_mp4` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/vp9_to_h264_mp4` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/wav_to_aac_mp4` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/wav_to_flac` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `transcode/wav_to_opus_ogg` — **-**: engine does not declare operation 'transcode'
- `mp4box.js@0.5.4` · `trim/audio_mp3_copy` — **-**: engine does not declare operation 'trim'
- `mp4box.js@0.5.4` · `trim/h264_bframes_frame_accurate` — **-**: engine does not declare operation 'trim'
- `mp4box.js@0.5.4` · `trim/h264_frame_accurate` — **-**: engine does not declare operation 'trim'
- `mp4box.js@0.5.4` · `trim/h264_keyframe_aligned` — **-**: engine does not declare operation 'trim'
- `mp4box.js@0.5.4` · `trim/h264_keyframe_aligned_short` — **-**: engine does not declare operation 'trim'
- `mp4box.js@0.5.4` · `trim/h264_vfr_frame_accurate` — **-**: engine does not declare operation 'trim'
- `mp4box.js@0.5.4` · `trim/vp9_keyframe_aligned` — **-**: engine does not declare operation 'trim'
- `platform@chrome-149` · `audio-dsp/downmix_stereo_to_mono` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_f32_to_s16` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s16_to_f32` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s16be_to_s16le` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s24_to_f32` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/pcm_s24_to_s16` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/resample_44k1_to_48k` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/resample_48k_to_16k` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/resample_48k_to_44k1` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `audio-dsp/upmix_mono_to_stereo` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `decode-seek/decode_av1` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `platform@chrome-149` · `decode-seek/decode_bframes_reorder` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `platform@chrome-149` · `decode-seek/decode_h264_first_frames` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `platform@chrome-149` · `decode-seek/decode_hevc` — **-ᵇ**: browser cannot decode video codec 'hevc' (WebCodecs VideoDecoder.isConfigSupported=false)
- `platform@chrome-149` · `decode-seek/decode_vfr_timing` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `platform@chrome-149` · `decode-seek/decode_vp8` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `platform@chrome-149` · `decode-seek/decode_vp9` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `platform@chrome-149` · `decode-seek/decode_vp9_alpha` — **FAIL**: oracle 'decoded-frames-bitexact' failed: no ctx.output bytes to decode
- `platform@chrome-149` · `decode-seek/seek_bframes_midgop` — **FAIL**: oracle 'seek-accuracy' failed: no golden frame matched the landed pts for digest comparison
- `platform@chrome-149` · `decode-seek/seek_h264_keyframe` — **FAIL**: oracle 'seek-accuracy' failed: landed 5000000µs vs expected keyframe 4992000µs (Δ 8000µs > 0µs); no golden frame matched the landed pts for digest comparison
- `platform@chrome-149` · `decode-seek/seek_h264_nonkeyframe` — **FAIL**: oracle 'seek-accuracy' failed: no golden frame matched the landed pts for digest comparison
- `platform@chrome-149` · `decode-seek/seek_vfr_arbitrary` — **FAIL**: oracle 'seek-accuracy' failed: no golden frame matched the landed pts for digest comparison
- `platform@chrome-149` · `decode-seek/seek_vp9_keyframe` — **FAIL**: oracle 'seek-accuracy' failed: no golden frame matched the landed pts for digest comparison
- `platform@chrome-149` · `demux/aac_adts` — **-**: engine does not declare input container 'adts'
- `platform@chrome-149` · `demux/av1_720p_5s` — **-**: engine does not declare audio codec 'opus'
- `platform@chrome-149` · `demux/flac_seektable` — **-**: engine does not declare input container 'flac'
- `platform@chrome-149` · `demux/h264_1080p_30s` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `demux/h264_1080p_5s` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `demux/h264_bframes_1080p` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `demux/h264_in_mkv` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `demux/h264_multitrack` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `demux/h264_ts` — **-**: engine does not declare input container 'ts'
- `platform@chrome-149` · `demux/h264_vfr` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `demux/opus` — **-**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `demux/vp8_720p_10s` — **-**: engine does not declare audio codec 'vorbis'
- `platform@chrome-149` · `demux/vp9_1080p_10s` — **-**: engine does not declare audio codec 'opus'
- `platform@chrome-149` · `encryption/cenc_cbcs_decrypt` — **-**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/cenc_ctr_decrypt` — **-**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/hls_aes128_decrypt` — **-**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `encryption/unencrypted_left_untouched` — **-**: engine does not declare operation 'decrypt'
- `platform@chrome-149` · `metadata/read_flac_seektable` — **-**: engine does not declare input container 'flac'
- `platform@chrome-149` · `metadata/read_h264_1080p_30s` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `metadata/read_h264_in_mkv` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `metadata/read_h264_multitrack` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `metadata/read_h264_rotated90` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `metadata/read_mp3_xing` — **-**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `metadata/read_opus` — **-**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `metadata/read_vp9_1080p_10s` — **-**: engine does not declare audio codec 'opus'
- `platform@chrome-149` · `metadata/write_flac_vorbiscomment` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/write_mkv_tags` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/write_mp3_id3` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `metadata/write_mp4_tags` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `mux/audio_only_aac_to_mp4` — **-**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/av1_opus_to_mp4` — **-**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/h264_aac_to_mkv` — **-**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/h264_aac_to_mp4` — **-**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/h264_aac_to_ts` — **-**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/video_plus_audio_to_mp4` — **-**: engine does not declare operation 'mux'
- `platform@chrome-149` · `mux/vp9_opus_to_webm` — **-**: engine does not declare operation 'mux'
- `platform@chrome-149` · `probe/aac_adts` — **-**: engine does not declare input container 'adts'
- `platform@chrome-149` · `probe/av1_720p_5s` — **-**: engine does not declare audio codec 'opus'
- `platform@chrome-149` · `probe/cenc_cbcs` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/cenc_ctr` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/flac_noseektable` — **-**: engine does not declare input container 'flac'
- `platform@chrome-149` · `probe/flac_seektable` — **-**: engine does not declare input container 'flac'
- `platform@chrome-149` · `probe/h264_1080p_30s` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/h264_1080p_5s` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/h264_4k_10s` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/h264_bframes_1080p` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/h264_in_mkv` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/h264_multitrack` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/h264_rotated90` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/h264_ts` — **-**: engine does not declare input container 'ts'
- `platform@chrome-149` · `probe/h264_vfr` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/hevc_1080p_10s` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/hls_vod` — **-**: engine does not declare input container 'hls'
- `platform@chrome-149` · `probe/longform_1h_audio` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `probe/mp3_cbr_notoc` — **-**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `probe/mp3_xing` — **-**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `probe/opus` — **-**: engine does not declare input container 'ogg'
- `platform@chrome-149` · `probe/recorder_headerless` — **-**: engine does not declare audio codec 'opus'
- `platform@chrome-149` · `probe/vp8_720p_10s` — **-**: engine does not declare audio codec 'vorbis'
- `platform@chrome-149` · `probe/vp9_1080p_10s` — **-**: engine does not declare audio codec 'opus'
- `platform@chrome-149` · `probe/vp9_alpha` — **-**: engine does not declare audio codec 'opus'
- `platform@chrome-149` · `probe/wav_f32` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `probe/wav_s16` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `probe/wav_s16be` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `probe/wav_s24` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `remux/aac_adts_adts_to_mp4` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/av1_720p_5s_webm_to_mkv` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/av1_720p_5s_webm_to_mp4` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/flac_seektable_flac_to_mkv` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_30s_mp4_to_mkv` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_30s_mp4_to_mov` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_30s_mp4_to_ts` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_1080p_5s_mov_to_mp4` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_bframes_1080p_mp4_to_mkv` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_in_mkv_mkv_to_mp4` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_multitrack_mp4_to_mkv` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_rotated90_mp4_to_mov` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/h264_ts_ts_to_mp4` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/hevc_1080p_10s_mp4_to_mkv` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/mp3_xing_mp3_to_mp4` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/opus_ogg_to_webm` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/vp8_720p_10s_webm_to_mkv` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `remux/vp9_1080p_10s_webm_to_mkv` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_buffer_target` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_faststart_reserve` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_fragmented_cmaf` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/mp4_streaming_target` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/ts_tiny_writes` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `streaming-output/webm_streaming_target` — **-**: engine does not declare operation 'remux'
- `platform@chrome-149` · `transcode/aac_to_opus_webm` — **-**: engine does not declare input container 'adts'
- `platform@chrome-149` · `transcode/av1_to_h264_mp4` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/fanout_h264_abr_ladder` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/flac_to_aac_mp4` — **-**: engine does not declare input container 'flac'
- `platform@chrome-149` · `transcode/h264_bitrate_2mbps` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/h264_fps_30_to_15` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/h264_resize_4k_to_1080p` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/h264_resize_720p` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/h264_rotate_normalize` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/h264_to_av1_mp4` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/h264_to_hevc_mp4` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/h264_to_vp8_webm` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `transcode/h264_to_vp9_webm` — **-**: engine does not declare audio codec 'aac'
- `platform@chrome-149` · `transcode/h264_vfr_to_cfr_30` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/hevc_to_h264_mp4` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/mp3_to_aac_mp4` — **-**: engine does not declare input container 'mp3'
- `platform@chrome-149` · `transcode/vp8_to_h264_mp4` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/vp9_to_h264_mp4` — **-**: engine does not declare output container 'mp4'
- `platform@chrome-149` · `transcode/wav_to_aac_mp4` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `transcode/wav_to_flac` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `transcode/wav_to_opus_ogg` — **-**: engine does not declare input container 'wav'
- `platform@chrome-149` · `trim/audio_mp3_copy` — **-**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_bframes_frame_accurate` — **-**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_frame_accurate` — **-**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_keyframe_aligned` — **-**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_keyframe_aligned_short` — **-**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/h264_vfr_frame_accurate` — **-**: engine does not declare operation 'trim'
- `platform@chrome-149` · `trim/vp9_keyframe_aligned` — **-**: engine does not declare operation 'trim'

</details>

### 3. Benchmark matrix

_Indicative for this browser only. Cells without a green conformance gate are blank (—)._

**`mediabunny@1.48.0`**

_No admissible benchmarks (no green conformance gate)._

**`mp4box.js@0.5.4`**

_No admissible benchmarks (no green conformance gate)._

**`platform@chrome-149`**

_No admissible benchmarks (no green conformance gate)._


### 4. Δ vs reference (`mediabunny`)

| Scenario | mediabunny@1.48.0 perf | mediabunny@1.48.0 conf | mp4box.js@0.5.4 perf | mp4box.js@0.5.4 conf | platform@chrome-149 perf | platform@chrome-149 conf |
| --- | --- | --- | --- | --- | --- | --- |
| `audio-dsp/downmix_stereo_to_mono` | NA | NA | NA | NA | NA | NA |
| `audio-dsp/pcm_f32_to_s16` | NA | NA | NA | NA | NA | NA |
| `audio-dsp/pcm_s16_to_f32` | NA | NA | NA | NA | NA | NA |
| `audio-dsp/pcm_s16be_to_s16le` | NA | NA | NA | NA | NA | NA |
| `audio-dsp/pcm_s24_to_f32` | NA | NA | NA | NA | NA | NA |
| `audio-dsp/pcm_s24_to_s16` | NA | NA | NA | NA | NA | NA |
| `audio-dsp/resample_44k1_to_48k` | NA | NA | NA | NA | NA | NA |
| `audio-dsp/resample_48k_to_16k` | NA | NA | NA | NA | NA | NA |
| `audio-dsp/resample_48k_to_44k1` | NA | NA | NA | NA | NA | NA |
| `audio-dsp/upmix_mono_to_stereo` | NA | NA | NA | NA | NA | NA |
| `decode-seek/decode_av1` | NA | NA | NA | NA | NA | NA |
| `decode-seek/decode_bframes_reorder` | NA | NA | NA | NA | NA | NA |
| `decode-seek/decode_h264_first_frames` | NA | NA | NA | NA | NA | NA |
| `decode-seek/decode_hevc` | NA | NA | NA | NA | NA | NA |
| `decode-seek/decode_vfr_timing` | NA | NA | NA | NA | NA | NA |
| `decode-seek/decode_vp8` | NA | NA | NA | NA | NA | NA |
| `decode-seek/decode_vp9` | NA | NA | NA | NA | NA | NA |
| `decode-seek/decode_vp9_alpha` | NA | NA | NA | NA | NA | NA |
| `decode-seek/seek_bframes_midgop` | NA | NA | NA | NA | NA | NA |
| `decode-seek/seek_h264_keyframe` | NA | NA | NA | NA | NA | NA |
| `decode-seek/seek_h264_nonkeyframe` | NA | NA | NA | NA | NA | NA |
| `decode-seek/seek_vfr_arbitrary` | NA | NA | NA | NA | NA | NA |
| `decode-seek/seek_vp9_keyframe` | NA | NA | NA | NA | NA | NA |
| `demux/aac_adts` | NA | NA | NA | NA | NA | NA |
| `demux/av1_720p_5s` | NA | NA | NA | NA | NA | NA |
| `demux/flac_seektable` | NA | NA | NA | NA | NA | NA |
| `demux/h264_1080p_30s` | NA | NA | NA | NA | NA | NA |
| `demux/h264_1080p_5s` | NA | NA | NA | NA | NA | NA |
| `demux/h264_bframes_1080p` | NA | NA | NA | NA | NA | NA |
| `demux/h264_in_mkv` | NA | NA | NA | NA | NA | NA |
| `demux/h264_multitrack` | NA | NA | NA | NA | NA | NA |
| `demux/h264_ts` | NA | NA | NA | NA | NA | NA |
| `demux/h264_vfr` | NA | NA | NA | NA | NA | NA |
| `demux/opus` | NA | NA | NA | NA | NA | NA |
| `demux/vp8_720p_10s` | NA | NA | NA | NA | NA | NA |
| `demux/vp9_1080p_10s` | NA | NA | NA | NA | NA | NA |
| `encryption/cenc_cbcs_decrypt` | NA | NA | NA | NA | NA | NA |
| `encryption/cenc_ctr_decrypt` | NA | NA | NA | NA | NA | NA |
| `encryption/hls_aes128_decrypt` | NA | NA | NA | NA | NA | NA |
| `encryption/unencrypted_left_untouched` | NA | NA | NA | NA | NA | NA |
| `metadata/read_flac_seektable` | NA | NA | NA | NA | NA | NA |
| `metadata/read_h264_1080p_30s` | NA | NA | NA | NA | NA | NA |
| `metadata/read_h264_in_mkv` | NA | NA | NA | NA | NA | NA |
| `metadata/read_h264_multitrack` | NA | NA | NA | NA | NA | NA |
| `metadata/read_h264_rotated90` | NA | NA | NA | NA | NA | NA |
| `metadata/read_mp3_xing` | NA | NA | NA | NA | NA | NA |
| `metadata/read_opus` | NA | NA | NA | NA | NA | NA |
| `metadata/read_vp9_1080p_10s` | NA | NA | NA | NA | NA | NA |
| `metadata/write_flac_vorbiscomment` | NA | NA | NA | NA | NA | NA |
| `metadata/write_mkv_tags` | NA | NA | NA | NA | NA | NA |
| `metadata/write_mp3_id3` | NA | NA | NA | NA | NA | NA |
| `metadata/write_mp4_tags` | NA | NA | NA | NA | NA | NA |
| `mux/audio_only_aac_to_mp4` | NA | NA | NA | NA | NA | NA |
| `mux/av1_opus_to_mp4` | NA | NA | NA | NA | NA | NA |
| `mux/h264_aac_to_mkv` | NA | NA | NA | NA | NA | NA |
| `mux/h264_aac_to_mp4` | NA | NA | NA | NA | NA | NA |
| `mux/h264_aac_to_ts` | NA | NA | NA | NA | NA | NA |
| `mux/video_plus_audio_to_mp4` | NA | NA | NA | NA | NA | NA |
| `mux/vp9_opus_to_webm` | NA | NA | NA | NA | NA | NA |
| `probe/aac_adts` | NA | NA | NA | NA | NA | NA |
| `probe/av1_720p_5s` | NA | NA | NA | NA | NA | NA |
| `probe/cenc_cbcs` | NA | NA | NA | NA | NA | NA |
| `probe/cenc_ctr` | NA | NA | NA | NA | NA | NA |
| `probe/flac_noseektable` | NA | NA | NA | NA | NA | NA |
| `probe/flac_seektable` | NA | NA | NA | NA | NA | NA |
| `probe/h264_1080p_30s` | NA | NA | NA | NA | NA | NA |
| `probe/h264_1080p_5s` | NA | NA | NA | NA | NA | NA |
| `probe/h264_4k_10s` | NA | NA | NA | NA | NA | NA |
| `probe/h264_bframes_1080p` | NA | NA | NA | NA | NA | NA |
| `probe/h264_in_mkv` | NA | NA | NA | NA | NA | NA |
| `probe/h264_multitrack` | NA | NA | NA | NA | NA | NA |
| `probe/h264_rotated90` | NA | NA | NA | NA | NA | NA |
| `probe/h264_ts` | NA | NA | NA | NA | NA | NA |
| `probe/h264_vfr` | NA | NA | NA | NA | NA | NA |
| `probe/hevc_1080p_10s` | NA | NA | NA | NA | NA | NA |
| `probe/hls_vod` | NA | NA | NA | NA | NA | NA |
| `probe/longform_1h_audio` | NA | NA | NA | NA | NA | NA |
| `probe/mp3_cbr_notoc` | NA | NA | NA | NA | NA | NA |
| `probe/mp3_xing` | NA | NA | NA | NA | NA | NA |
| `probe/opus` | NA | NA | NA | NA | NA | NA |
| `probe/recorder_headerless` | NA | NA | NA | NA | NA | NA |
| `probe/vp8_720p_10s` | NA | NA | NA | NA | NA | NA |
| `probe/vp9_1080p_10s` | NA | NA | NA | NA | NA | NA |
| `probe/vp9_alpha` | NA | NA | NA | NA | NA | NA |
| `probe/wav_f32` | NA | NA | NA | NA | NA | NA |
| `probe/wav_s16` | NA | NA | NA | NA | NA | NA |
| `probe/wav_s16be` | NA | NA | NA | NA | NA | NA |
| `probe/wav_s24` | NA | NA | NA | NA | NA | NA |
| `remux/aac_adts_adts_to_mp4` | NA | NA | NA | NA | NA | NA |
| `remux/av1_720p_5s_webm_to_mkv` | NA | NA | NA | NA | NA | NA |
| `remux/av1_720p_5s_webm_to_mp4` | NA | NA | NA | NA | NA | NA |
| `remux/flac_seektable_flac_to_mkv` | NA | NA | NA | NA | NA | NA |
| `remux/h264_1080p_30s_mp4_to_mkv` | NA | NA | NA | NA | NA | NA |
| `remux/h264_1080p_30s_mp4_to_mov` | NA | NA | NA | NA | NA | NA |
| `remux/h264_1080p_30s_mp4_to_ts` | NA | NA | NA | NA | NA | NA |
| `remux/h264_1080p_5s_mov_to_mp4` | NA | NA | NA | NA | NA | NA |
| `remux/h264_bframes_1080p_mp4_to_mkv` | NA | NA | NA | NA | NA | NA |
| `remux/h264_in_mkv_mkv_to_mp4` | NA | NA | NA | NA | NA | NA |
| `remux/h264_multitrack_mp4_to_mkv` | NA | NA | NA | NA | NA | NA |
| `remux/h264_rotated90_mp4_to_mov` | NA | NA | NA | NA | NA | NA |
| `remux/h264_ts_ts_to_mp4` | NA | NA | NA | NA | NA | NA |
| `remux/hevc_1080p_10s_mp4_to_mkv` | NA | NA | NA | NA | NA | NA |
| `remux/mp3_xing_mp3_to_mp4` | NA | NA | NA | NA | NA | NA |
| `remux/opus_ogg_to_webm` | NA | NA | NA | NA | NA | NA |
| `remux/vp8_720p_10s_webm_to_mkv` | NA | NA | NA | NA | NA | NA |
| `remux/vp9_1080p_10s_webm_to_mkv` | NA | NA | NA | NA | NA | NA |
| `streaming-output/mp4_buffer_target` | NA | NA | NA | NA | NA | NA |
| `streaming-output/mp4_faststart_reserve` | NA | NA | NA | NA | NA | NA |
| `streaming-output/mp4_fragmented_cmaf` | NA | NA | NA | NA | NA | NA |
| `streaming-output/mp4_streaming_target` | NA | NA | NA | NA | NA | NA |
| `streaming-output/ts_tiny_writes` | NA | NA | NA | NA | NA | NA |
| `streaming-output/webm_streaming_target` | NA | NA | NA | NA | NA | NA |
| `transcode/aac_to_opus_webm` | NA | NA | NA | NA | NA | NA |
| `transcode/av1_to_h264_mp4` | NA | NA | NA | NA | NA | NA |
| `transcode/fanout_h264_abr_ladder` | NA | NA | NA | NA | NA | NA |
| `transcode/flac_to_aac_mp4` | NA | NA | NA | NA | NA | NA |
| `transcode/h264_bitrate_2mbps` | NA | NA | NA | NA | NA | NA |
| `transcode/h264_fps_30_to_15` | NA | NA | NA | NA | NA | NA |
| `transcode/h264_resize_4k_to_1080p` | NA | NA | NA | NA | NA | NA |
| `transcode/h264_resize_720p` | NA | NA | NA | NA | NA | NA |
| `transcode/h264_rotate_normalize` | NA | NA | NA | NA | NA | NA |
| `transcode/h264_to_av1_mp4` | NA | NA | NA | NA | NA | NA |
| `transcode/h264_to_hevc_mp4` | NA | NA | NA | NA | NA | NA |
| `transcode/h264_to_vp8_webm` | NA | NA | NA | NA | NA | NA |
| `transcode/h264_to_vp9_webm` | NA | NA | NA | NA | NA | NA |
| `transcode/h264_vfr_to_cfr_30` | NA | NA | NA | NA | NA | NA |
| `transcode/hevc_to_h264_mp4` | NA | NA | NA | NA | NA | NA |
| `transcode/mp3_to_aac_mp4` | NA | NA | NA | NA | NA | NA |
| `transcode/vp8_to_h264_mp4` | NA | NA | NA | NA | NA | NA |
| `transcode/vp9_to_h264_mp4` | NA | NA | NA | NA | NA | NA |
| `transcode/wav_to_aac_mp4` | NA | NA | NA | NA | NA | NA |
| `transcode/wav_to_flac` | NA | NA | NA | NA | NA | NA |
| `transcode/wav_to_opus_ogg` | NA | NA | NA | NA | NA | NA |
| `trim/audio_mp3_copy` | NA | NA | NA | NA | NA | NA |
| `trim/h264_bframes_frame_accurate` | NA | NA | NA | NA | NA | NA |
| `trim/h264_frame_accurate` | NA | NA | NA | NA | NA | NA |
| `trim/h264_keyframe_aligned` | NA | NA | NA | NA | NA | NA |
| `trim/h264_keyframe_aligned_short` | NA | NA | NA | NA | NA | NA |
| `trim/h264_vfr_frame_accurate` | NA | NA | NA | NA | NA | NA |
| `trim/vp9_keyframe_aligned` | NA | NA | NA | NA | NA | NA |

## 5. Per-engine scorecard

| Engine | Conformance % | PASS / admissible | Perf idx (chromium) | Capability breadth | Robustness % |
| --- | --- | --- | --- | --- | --- |
| `mediabunny@1.48.0` | 32.1% | 34 / 106 | — | 3 (demux, metadata, probe) | — |
| `mp4box.js@0.5.4` | 78.9% | 15 / 19 | — | 3 (demux, metadata, probe) | — |
| `platform@chrome-149` | 0% | 0 / 12 | — | 0 (—) | — |

_Perf index = geometric mean of throughput ratios vs reference, per browser, over co-passing scenarios. >1.00× = faster than reference on average; null/— = no co-passing scenario to compare._

## Caveats (read before quoting any number)

- Browser numbers are INDICATIVE only. They depend on GPU, OS, drivers, and thermal state; a measurement made on one machine does not transfer to another.
- NEVER compare a raw number across browsers or across machines. Every delta in this report is "vs the reference engine, on the SAME browser, on the same corpus." Cross-browser comparison is invalid by construction — that is why the report is grouped by browser.
- Hardware codec sessions are the real parallelism ceiling, not navigator.hardwareConcurrency. Contention for a limited number of hardware decode/encode sessions can dominate timing for codec-bound workloads.
- No measurement → no claim. No green correctness oracle → no admissible benchmark: a perf number is reported only behind a PASS for that engine × browser × scenario. A speedup that fails conformance is a regression, not a win.
- NA(engine) (the engine did not declare the capability) and NA(browser) (the browser lacks the WebCodecs codec / API) are kept distinct and are never collapsed.
- Runs assume AC power and a quiesced machine. Differences within the noise band are reported as within-noise and are NOT claimed as improvements or regressions.
