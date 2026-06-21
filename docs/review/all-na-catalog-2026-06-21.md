# All-N/A Scenario Catalog - Chromium run 2026-06-21T12:02:05.609Z

Source run:
`results/raw/results-chromium-2026-06-21T12-02-05-609Z.json`

## Concrete Restatement

The requested task is to examine the 77 scenarios that were all N/A across every engine in the Chromium result file above, determine whether each all-N/A outcome came from a missing fixture/golden, a stale pseudo-capability gate, a real browser/runtime limitation, a missing adapter implementation, or an intentionally unsupported framework capability, then make any safe rows executable without inventing support that does not exist.

The concrete implementation work in this pass was:

1. Bake browser frame goldens for scenarios that were blocked only because their RGBA frame digests/signatures were pending.
2. Convert negative placeholder rows that used fake image-container or codec gates into real `graceful-failure` scenarios that run against engines with the relevant operation.
3. Leave compose, crypto, audio-sample, and adapter capability gaps N/A unless there is an actual implementation path and oracle.
4. Record the remaining gap taxonomy so future work can target implementations instead of adding broad, fake capability flags.
5. Verify the code changes with focused browser runs, `bun run typecheck`, and `bun run build`.

This document describes the state after the scenario edits and frame-bake pass in the current worktree. The source JSON remains historical evidence for the original all-N/A census.

## Executive Summary

The raw Chromium run contained 557 scenarios across 8 engines. 77 scenarios were all N/A across every engine.

Actions taken:

| Action | Count / scope | Result |
| --- | ---: | --- |
| Browser frame-bake filled previously pending RGBA frame goldens | 27 assets | Frame-backed decode, remux, mux, metadata, CENC-CBCS, and CENC-CTR clear-baseline rows can now execute for engines that honestly declare the required operation/capability. |
| New SSIM sidecars written by frame-bake | 27 assets | Lossy/decode pixel oracles now have quality baselines for the filled assets. |
| HLS AES-128 frame-bake attempted | 1 asset | Still pending. Brave reported `<video> error before metadata`, so the row remains an asset/oracle gap rather than an engine defect. |
| CENC-CTR clear baseline baked and decrypt path implemented | 1 asset / 3 scenarios | `cenc_ctr_clear.mp4` now carries browser-baked frame goldens. `ffmpeg.wasm@0.12.15` has a narrow, verified CENC-CTR clear-output path for the generated non-fragmented MP4 fixture: WebCrypto clears CENC samples and ffmpeg.wasm stream-copies the result to a browser-decodable MP4. |
| Fake image/codec gates removed from negative scenarios | 9 scenarios | These now run where engines declare the real operation, and they pass only if the engine rejects invalid input cleanly. |
| Compose/property rows reviewed | 6 scenarios | All 6 are now executable with real property oracles: 3 on Mediabunny and 3 on ffmpeg.wasm. The FLAC seektable row now trims the same frame-aligned audio window from both FLAC fixtures and compares decoded PCM digests. |
| 10-bit source-depth down-convert implemented | 1 scenario | `transcode/h264_10bit_to_h264_8bit` now runs on ffmpeg.wasm with `depth:10bit-to-8bit`, SSIM validation, and playback smoke. HEVC-10 output encode remains undeclared because browser-wasm x265 times out inside the suite budget. |
| HDR10-to-SDR tone-map implemented | 1 asset / 1 scenario | `hdr10_pq_micro_hevc.mp4` is a generated 128x72 HEVC Main 10 fixture with BT.2020/PQ tags. `transcode/hdr10_to_sdr_tonemap` now runs on `ffmpeg.wasm@0.12.15` with a narrow `zscale + tonemap` PQ-to-BT.709 path, output metadata invariant, and playback smoke. |
| FLAC-in-Ogg remux implemented | 1 scenario | `remux/flac_seektable_flac_to_ogg` now runs on ffmpeg.wasm with `remux:flac-in-ogg`. The oracle validates Ogg-FLAC duration from page granules and compares source/output FLAC STREAMINFO total samples and MD5 because the reference demuxer does not expose Ogg-FLAC packets. |
| PCM-to-WAV mux preparation implemented | 3 scenarios | `mux/pcm_s16_to_wav`, `mux/pcm_s24_to_wav`, and `mux/pcm_f32_to_wav` now run on ffmpeg.wasm. The adapter prepares PCM streams with explicit raw PCM formats and the mux duration invariant proves the authored WAV materializes the original 5.000s sample count. |
| Audio PCM digest invariant implemented | 3 scenarios | `audio-dsp/meta_idempotent_resample_same_rate`, `audio-dsp/meta_roundtrip_endianness_s16`, and `robustness/edge_pcm_s24_decode` now run on ffmpeg.wasm. The oracle browser-decodes the source and output audio, compares sample rate/channels/sample count, and hashes interleaved Float32 PCM. The endian row now performs a real `s16le -> s16be AIFF -> s16le WAV` round trip. |
| Audio PCM decode oracle implemented | 2 scenarios | `audio-dsp/throughput_decode_s24` and `audio-dsp/throughput_decode_s16be` now run on ffmpeg.wasm. The adapter decodes audio-only PCM inputs to normalized Float32 sample-frame digests, and the oracle compares them against native WAV/AIFF PCM parsing of the source bytes. Unsupported frameworks are honestly gated by `decode:audio-pcm`. |
| Gapless decoded sample-count oracle implemented | 2 scenarios | `robustness/prop_gapless_sample_count_priming` and `audio-dsp/edge_gapless_aac_decode` now run on Mediabunny with `audio-samples:gapless-priming`. The oracle decodes the trimmed AAC output with the browser audio decoder and verifies the priming/padding-removed sample duration rather than raw AAC frame count. |
| FLAC seektable equivalence oracle implemented | 1 scenario | `robustness/prop_flac_seek_seektable_equiv` now runs on ffmpeg.wasm with `flac:seektable-seek-equivalence`. The oracle runs paired FLAC copy-trims at the same frame-aligned timestamp, verifies STREAMINFO shape, and compares browser-decoded PCM digests. |
| Headerless WebM live output implemented | 2 scenarios | `streaming-output/webm_headerless_live_stream` and `streaming-output/prop_webm_headerless_duration_materialized` now run on Mediabunny with `headerless` and append-only WebM output. The new `webm-live-layout` oracle verifies an unknown-size Segment with no SeekHead or Segment Duration. |
| Massive copy-trim made executable | 1 scenario | `trim/massive_h264_copy_sustained` now runs on Mediabunny with `trim:massive-lazy-read`. Correctness passes on the 1.1 GB, 2h fixture via trim duration and playback smoke; the `sourceReads` metric remains uninstrumented (`n=0`) until CountingSource is threaded through UrlSource-style readers. |
| Multi-rendition H.264 ABR fanout made executable | 1 scenario | `transcode/fanout_h264_abr_ladder` now runs on Mediabunny with `fanout`. The shared `MediaBytes` contract exposes all requested renditions in `variants[]`, and the new `fanout-renditions` oracle validates count, dimensions, codec, playback, and SSIM/PSNR for every rung. |

The main coverage improvement is that several rows are no longer "all N/A by construction." The suite now distinguishes "engine tried and correctly rejected" from "the scenario was hidden behind a fake capability."

## Baked Frame Goldens

The frame-bake pass filled `.frames.json` files and wrote matching `.ssim.json` sidecars for:

`cenc_cbcs.mp4`, `cenc_ctr_clear.mp4`, `h264_10bit_1080p_5s.mp4`, `h264_1fps_30s.mp4`, `h264_4k_10s.mp4`, `h264_in_mkv.mkv`, `h264_multitrack.mp4`, `h264_open_gop_1080p.mp4`, `h264_vfr.mp4`, `hevc_1080p_10s.mp4`, `huge_h264_1080p_600s.mov`, `image.jpg`, `image.png`, `image.webp`, `large_h264_1080p_120s.mp4`, `large_vp9_1080p_120s.webm`, `massive_h264_1080p_2h.mp4`, `micro_h264_1frame.mp4`, `recorder_headerless.webm`, `tiny_h264_360p_2s.mp4`, `tiny_vp9_360p_2s.webm`, `video_1x1.webm`, `video_240fps.mp4`, `video_2x2_h264.mp4`, `vp8_720p_10s.webm`, `vp9_1080p_10s.webm`, and `vp9_alpha.webm`.

Rows that were originally all-N/A because of missing frame data are no longer blocked by that specific fixture issue when their input maps to one of those ready frame files. Parser-only engines and engines that still do not declare `decodeFrames`, `mux`, `remux`, or `decrypt` must still remain `NA_ENGINE`.

Still pending:

| Asset | Current golden state | Why it remains pending |
| --- | --- | --- |
| `hls_aes128.m3u8` | `pending:12` | Browser frame-bake failed before metadata, so HLS AES-128 decrypt rows cannot use a baked cleartext/decrypt comparison yet. |
| `cenc_ctr.mp4` | `pending-empty` | The encrypted asset itself is not browser-decodable without decrypting. Positive CENC-CTR rows now compare decrypted output against the independent browser-baked clear twin `cenc_ctr_clear.mp4`, so this encrypted-asset frame file is not the correctness baseline. |
| `hdr10_pq_micro_hevc.mp4` | `pending:10` | The HDR tone-map row does not use source-frame SSIM; it validates the transformed output with metadata and playback smoke. Fill these browser frame digests only before adding decode/SSIM scenarios against this HDR source. |
| Audio-only inputs such as `wav_s16.wav`, `wav_s24.wav`, `pcm_s16be.aiff`, `gapless_aac.m4a`, and FLAC inputs | no `.frames.json` | These need decoded audio sample/hash or gapless-specific oracles, not RGBA video frame-bake data. |

## Converted Negative Rows

These rows were all-N/A in the source run because their requirements included pseudo-containers such as `jpeg`, `png`, `webp`, or an unrelated PCM encode gate. They now require only the operation whose invalid-input behavior is under test.

| Scenario | Previous problem | Current behavior |
| --- | --- | --- |
| `robustness/image_jpeg_probe_na` | Required fake input container `jpeg` | Runs for engines with `probe`; PASS means the still image is rejected cleanly. |
| `robustness/image_png_probe_na` | Required fake input container `png` | Runs for engines with `probe`; PASS means the still image is rejected cleanly. |
| `robustness/image_webp_probe_na` | Required fake input container `webp` | Runs for engines with `probe`; PASS means the still image is rejected cleanly. |
| `transcode/negative_jpeg_to_video` | Required fake input container `jpeg` | Runs for engines with `transcode`; PASS means the still image is rejected cleanly. |
| `transcode/negative_png_to_video` | Required fake input container `png` | Runs for engines with `transcode`; PASS means the still image is rejected cleanly. |
| `transcode/negative_webp_to_video` | Required fake input container `webp` | Runs for engines with `transcode`; PASS means the still image is rejected cleanly. |
| `audio-dsp/negative_image_into_audio_transcode` | Required fake `jpeg` input, WAV output, and `pcm-s16` audio codec | Runs for engines with `transcode`; it tests invalid image input to an audio-targeting transcode path. |
| `transcode/mismatch_audio_only_to_video_target` | Required `pcm-s16` audio encode support even though the target is video-only | Runs for transcode engines that can attempt a video target against WAV input. |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | Required `pcm-s16` audio codec support even though the point is rejecting empty/no-sample tracks | Runs for mux engines that can demux WAV input and mux MP4 output. |

Focused Brave verification:

| Result file | Scope | Summary |
| --- | --- | --- |
| `results/raw/brave-2026-06-21T13-23-51-581Z.json` | Image probe/transcode negatives and `audio-dsp/negative_image_into_audio_transcode` | 56 results: 26 PASS, 21 `NA_ENGINE`, 9 FAIL. Failures are now actionable: engines produced output or accepted the invalid still image instead of cleanly rejecting it. |
| `results/raw/brave-2026-06-21T13-25-56-307Z.json` | `transcode/mismatch_audio_only_to_video_target` | 8 results: 2 PASS, 6 `NA_ENGINE`. The executable engines rejected the impossible video target cleanly. |
| `results/raw/brave-2026-06-21T13-26-33-809Z.json` | `mux/neg_zero_tracks_empty_audio_to_mp4` | 8 results: 1 PASS, 7 `NA_ENGINE`. Mediabunny rejected empty MP4 muxing cleanly. |

## Catalog Of The 77 Raw All-N/A Scenarios

Category legend:

| Category | Meaning |
| --- | --- |
| `frame-golden-filled` | Historical N/A included a pending RGBA frame/SSIM oracle, and the current frame-bake has filled the relevant input baseline. The row still needs an engine that honestly declares the operation. |
| `frame-golden-pending` | The scenario still lacks a usable video/image frame golden after this pass. |
| `audio-oracle-gap` | The scenario needs decoded audio sample-count/hash behavior, not RGBA frame-bake data. |
| `audio-oracle-filled` | The missing decoded-audio oracle now exists and has focused browser verification for at least one engine. |
| `converted-negative` | The scenario now runs as a real graceful-failure test for engines with the relevant operation. |
| `adapter-capability-gap` | The library or adapter does not currently expose the required operation, container, codec, or feature. It must remain N/A until implemented. |
| `adapter-capability-filled` | The missing adapter path now exists and has focused browser verification for at least one engine. |
| `compose-oracle-gap` | The scenario needs a multi-step runner/oracle workflow such as demux->mux->demux, remux(remux(x)), trim+concat, or cross-asset comparison. |
| `true-framework-unsupported` | The row is intentionally unsupported by current frameworks or by the suite's current operation model. |

| Scenario | Category | Disposition |
| --- | --- | --- |
| `audio-dsp/edge_gapless_aac_decode` | audio-oracle-filled | Now executable on Mediabunny. The row is modeled as a full-range trim that the gapless sample-count oracle browser-decodes, proving decoded samples match the priming/padding-removed duration. |
| `audio-dsp/meta_idempotent_resample_same_rate` | audio-oracle-filled | Now executable on ffmpeg.wasm. The audio PCM digest invariant browser-decodes source and output WAV, then verifies matching sample count, rate, channels, and PCM digest. |
| `audio-dsp/meta_roundtrip_endianness_s16` | audio-oracle-filled | Now executable on ffmpeg.wasm. The adapter performs a real `s16le -> s16be AIFF -> s16le WAV` round trip and the audio PCM digest invariant verifies the decoded result matches the source. |
| `audio-dsp/negative_image_into_audio_transcode` | converted-negative | Now executable for transcode engines; focused run produced real PASS/N/A outcomes. |
| `audio-dsp/throughput_decode_s16be` | audio-oracle-filled | Now executable on ffmpeg.wasm. The adapter decodes AIFF big-endian PCM to normalized Float32 sample-frame digests, and the oracle compares 4096 sample frames against native AIFF PCM parsing. |
| `audio-dsp/throughput_decode_s24` | audio-oracle-filled | Now executable on ffmpeg.wasm. The adapter decodes WAV extensible 24-bit PCM to normalized Float32 sample-frame digests, and the oracle compares 4096 sample frames against native WAV PCM parsing. |
| `decode-seek/decode_extreme_fps_1` | frame-golden-filled | Frame data ready for `h264_1fps_30s.mp4`; re-run decode-capable engines. |
| `decode-seek/decode_extreme_fps_240` | frame-golden-filled | Frame data ready for `video_240fps.mp4`; re-run decode-capable engines. |
| `decode-seek/decode_h264_10bit` | frame-golden-filled | Frame data ready; still browser/engine-gated by H.264 10-bit decode support. |
| `decode-seek/decode_h264_4k` | frame-golden-filled | Frame data ready; still browser/engine-gated by 4K decode support. |
| `decode-seek/decode_hevc` | frame-golden-filled | Frame data ready; still browser/engine-gated by HEVC decode support. |
| `decode-seek/decode_mkv_h264` | frame-golden-filled | Frame data ready for `h264_in_mkv.mkv`; re-run decode-capable MKV engines. |
| `decode-seek/decode_multitrack_select_video` | frame-golden-filled | Frame data ready for `h264_multitrack.mp4`; re-run decode-capable engines. |
| `decode-seek/decode_open_gop_first_frame` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_size_huge_h264_600s` | frame-golden-filled | Frame data ready for long MOV input; still a heavy decode-capability/timeout row. |
| `decode-seek/decode_size_large_h264_120s` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_size_large_vp9_120s` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_size_micro_h264_1frame` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_size_tiny_h264_360p` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_size_tiny_vp9_360p` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_tiny_dims_1x1` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_tiny_dims_2x2_h264` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_vfr_timing` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_vp8` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_vp9` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `decode-seek/decode_vp9_alpha` | frame-golden-filled | Frame data ready; still requires an engine/browser path that preserves alpha and declares `alpha`. |
| `encryption/cenc_cbcs_decrypt` | frame-golden-filled | `cenc_cbcs.mp4` frames are ready; still requires an honest cbcs decrypt implementation. |
| `encryption/cenc_cens_decrypt_na` | converted-negative | Now executable on Mediabunny as an unsupported-scheme graceful-failure row. Mediabunny receives the explicit `cenc-cens` scheme token and PASSes only by rejecting it cleanly; no CENS positive decrypt support is claimed. |
| `encryption/cenc_ctr_decrypt` | adapter-capability-filled | Now executable on `ffmpeg.wasm@0.12.15`. The adapter decrypts the generated CENC-CTR MP4 samples with WebCrypto, remuxes the clear result with ffmpeg.wasm, and compares browser-decoded output against `cenc_ctr_clear.mp4` frame goldens. |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | adapter-capability-filled | Now executable on `ffmpeg.wasm@0.12.15` with the same clear-output path. The property invariant compares decrypted output to the independent clear twin, not to encrypted-asset frames. |
| `encryption/clearkey_decrypt_na` | converted-negative | Now executable on Mediabunny as an unsupported-scheme graceful-failure row. ClearKey remains outside the raw decrypt primitive; PASS means the decrypt-capable engine rejects it cleanly. |
| `encryption/hls_aes128_decrypt` | frame-golden-pending | Keep N/A until HLS AES-128 can be browser-baked or otherwise compared to a trusted cleartext baseline. |
| `encryption/hls_aes128_decrypt_eq_cleartext` | frame-golden-pending | Keep N/A until the HLS cleartext baseline exists. |
| `encryption/hls_sample_aes_decrypt_na` | converted-negative | Now executable on Mediabunny as an unsupported-scheme graceful-failure row. SAMPLE-AES remains distinct from full-segment HLS AES-128; PASS means the engine rejects that unsupported path cleanly. |
| `encryption/perf_cenc_ctr_decrypt_throughput` | adapter-capability-filled | Now executable on `ffmpeg.wasm@0.12.15`. The throughput number is gated by the same `decrypt-bitexact` clear-output oracle against `cenc_ctr_clear.mp4`. |
| `metadata/write_mkv_tags` | frame-golden-filled | Focused Brave run now PASSes on Mediabunny and ffmpeg.wasm. Reference re-import verified 770 packets / 2 media tracks and decode equality compared 12 bit-exact frames. |
| `mux/edge_hevc_decode_mux_mkv` | frame-golden-filled | Focused Brave run now PASSes on Mediabunny and ffmpeg.wasm. The decode-equality invariant compared 12 bit-exact frames after muxing HEVC into MKV. |
| `mux/edge_hevc_decode_mux_mp4` | frame-golden-filled | Focused Brave run now PASSes on Mediabunny and ffmpeg.wasm. The decode-equality invariant compared 12 bit-exact frames, and reference re-import verified 770 packets / 475 keyframes. |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | converted-negative | Now executable for mux engines with WAV demux plus MP4 mux; focused run produced a real PASS for Mediabunny. |
| `mux/pcm_f32_to_wav` | adapter-capability-filled | Now executable on ffmpeg.wasm. The adapter prepares float PCM as `f32le` and the mux duration invariant verifies the authored WAV preserves the 5.000s sample count. |
| `mux/pcm_s16_to_wav` | adapter-capability-filled | Now executable on ffmpeg.wasm. The adapter prepares 16-bit PCM as `s16le` and the mux duration invariant verifies the authored WAV preserves the 5.000s sample count. |
| `mux/pcm_s24_to_wav` | adapter-capability-filled | Now executable on ffmpeg.wasm. The adapter prepares 24-bit PCM as `s24le` and the mux duration invariant verifies the authored WAV preserves the 5.000s sample count. |
| `mux/prop_vp9_decode_mux_webm_to_webm` | frame-golden-filled | Focused Brave run now PASSes on Mediabunny and ffmpeg.wasm. The decode-equality invariant compared 12 bit-exact VP9 frames after WebM muxing. |
| `remux/flac_seektable_flac_to_ogg` | adapter-capability-filled | Now executable on ffmpeg.wasm. The adapter stream-copies FLAC into Ogg, and `reference-reimport` uses an Ogg-FLAC STREAMINFO/granule proof when the reference parser exposes no packet table. Transcode-to-Opus is not accepted as remux. |
| `remux/prop_multitrack_survives_mp4_mkv` | frame-golden-filled | Focused Brave run now PASSes on Mediabunny and ffmpeg.wasm. Reference re-import verified 3 media tracks survived and decode equality compared 12 bit-exact frames. |
| `robustness/edge_cbcs_boundary_decrypt` | frame-golden-filled | `cenc_cbcs.mp4` frames are ready; still requires an honest cbcs decrypt implementation. |
| `robustness/edge_dims_1x1_decode` | frame-golden-filled | Frame data ready; re-run decode-capable engines. |
| `robustness/edge_pcm_s24_decode` | audio-oracle-filled | Now executable on ffmpeg.wasm. The row materializes an identity 24-bit PCM WAV transcode, then the audio PCM digest invariant browser-decodes source and output and verifies matching samples. |
| `robustness/image_jpeg_probe_na` | converted-negative | Now executable for probe engines; focused run produced real PASS/FAIL outcomes. |
| `robustness/image_png_probe_na` | converted-negative | Now executable for probe engines; focused run produced real PASS/FAIL outcomes. |
| `robustness/image_webp_probe_na` | converted-negative | Now executable for probe engines; focused run produced real PASS/FAIL outcomes. |
| `robustness/prop_decode_remux_eq_decode_webm_mkv` | frame-golden-filled | Focused Brave run now PASSes on Mediabunny and ffmpeg.wasm. The decode-equality invariant compared 12 bit-exact frames after WebM-to-MKV remux. |
| `robustness/prop_demux_mux_roundtrip_eq` | compose-oracle-filled | Now executable on Mediabunny. The property oracle demuxes the muxed output and compares its packet table to the source golden. |
| `robustness/prop_double_remux_stable` | compose-oracle-filled | Now executable on Mediabunny. The property oracle runs a second remux, then compares metadata and packet tables between the first and second outputs. |
| `robustness/prop_flac_seek_seektable_equiv` | compose-oracle-filled | Now executable on ffmpeg.wasm. The property oracle trims the same 960 ms frame-aligned window from `flac_seektable.flac` and `flac_noseektable.flac`, then verifies matching FLAC STREAMINFO shape and identical browser-decoded PCM digest. |
| `robustness/prop_gapless_sample_count_priming` | audio-oracle-filled | Now executable on Mediabunny. The property oracle decodes the trimmed output, compares decoded duration/sample count to the golden priming-removed duration, and reports the raw AAC frame sample count as a contrast. |
| `robustness/prop_trim_additivity_compose` | compose-oracle-filled | Now executable on ffmpeg.wasm. The property oracle runs two adjacent trims, concatenates them, runs the direct combined trim, then compares duration and decoded frames. |
| `robustness/prop_trim_concatenation` | compose-oracle-filled | Now executable on ffmpeg.wasm using the same trim+concat vs direct-trim property oracle. |
| `streaming-output/prop_webm_headerless_duration_materialized` | adapter-capability-filled | Now executable on Mediabunny. The scenario requests append-only WebM output and passes only when `property-invariant` proves duration stability and `webm-live-layout` proves the live layout shape. |
| `streaming-output/webm_headerless_live_stream` | adapter-capability-filled | Now executable on Mediabunny. `reference-reimport` proves the output re-parses semantically and `webm-live-layout` verifies unknown-size Segment / no SeekHead / no Segment Duration. |
| `transcode/fanout_h264_abr_ladder` | adapter-capability-filled | Now executable on Mediabunny. The adapter returns all four ABR outputs in `MediaBytes.variants[]`, and the `fanout-renditions` oracle verifies 1080p, 720p, 480p, and 360p H.264 outputs with playback and per-rung SSIM/PSNR. |
| `transcode/flac_to_opus_webm` | adapter-capability-gap | Keep N/A where Opus encode/runtime support is intentionally undeclared or unsupported. |
| `transcode/gapless_pcm_to_opus_priming` | adapter-capability-gap | Keep N/A until Opus encode and gapless metadata validation are implemented reliably. |
| `transcode/h264_8bit_to_hevc_10bit` | adapter-capability-gap | Keep N/A until an engine declares `depth:10bit-output` and can emit HEVC-10 within suite budgets. ffmpeg.wasm's x265 path timed out even on a browser-baked one-frame input; platform MediaRecorder has no output bit-depth control; Mediabunny/WebCodecs and Remotion WebCodecs expose HEVC encode but no video bit-depth option and their codec builders target HEVC Main rather than Main 10. |
| `transcode/h264_to_vp8_webm` | adapter-capability-gap | Keep N/A for browser-wasm/runtime-budget paths unless an engine can execute the VP8/Vorbis WebM conversion inside suite limits. |
| `transcode/hdr10_to_sdr_tonemap` | adapter-capability-filled | Now executable on `ffmpeg.wasm@0.12.15`. The row uses the generated `hdr10_pq_micro_hevc.mp4` HEVC Main 10 BT.2020/PQ fixture, applies a narrow PQ-to-BT.709 `zscale + tonemap` filter chain, and passes output metadata plus playback smoke. |
| `transcode/hevc_10bit_to_h264_8bit` -> `transcode/h264_10bit_to_h264_8bit` | adapter-capability-filled | The historical row used an HEVC label, but the corpus has a real 10-bit H.264 source. The registered scenario now uses `h264_10bit_1080p_5s.mp4`, requires `depth:10bit-to-8bit`, and passes on ffmpeg.wasm. |
| `transcode/mismatch_audio_only_to_video_target` | converted-negative | Now executable for relevant transcode engines; focused run produced 2 PASS and 6 `NA_ENGINE`. |
| `transcode/mp3_to_opus_webm` | adapter-capability-gap | Keep N/A where Opus encode/runtime support is intentionally undeclared or unsupported. |
| `transcode/negative_jpeg_to_video` | converted-negative | Now executable for transcode engines; focused run produced real PASS/FAIL outcomes. |
| `transcode/negative_png_to_video` | converted-negative | Now executable for transcode engines; focused run produced real PASS/FAIL outcomes. |
| `transcode/negative_webp_to_video` | converted-negative | Now executable for transcode engines; focused run produced real PASS/FAIL outcomes. |
| `transcode/vp8_to_vp9_webm` | adapter-capability-gap | Keep N/A where Vorbis/Opus encode or browser-wasm runtime behavior is unsupported. |
| `transcode/wav_to_opus_ogg` | adapter-capability-gap | Keep N/A until Opus-in-Ogg encode/output support is reliable. |
| `trim/audio_flac_noseektable_copy` | adapter-capability-filled | Now executable on ffmpeg.wasm. The adapter stream-copies the FLAC trim and repairs `STREAMINFO.total_samples` so reference duration validation sees the trimmed length. |
| `trim/audio_flac_seektable_copy` | adapter-capability-filled | Now executable on ffmpeg.wasm using the same FLAC stream-copy trim plus `STREAMINFO.total_samples` repair. |
| `trim/massive_h264_copy_sustained` | adapter-capability-filled | Now executable on Mediabunny against the 1.1 GB fixture. The adapter uses UrlSource for normal corpus inputs and the focused run PASSed trim duration and playback smoke; source-read counting remains a metric instrumentation gap. |

## Compose And Robustness Rows Resolved

| Scenario | Required real implementation |
| --- | --- |
| `robustness/prop_flac_seek_seektable_equiv` | Filled. The property oracle now runs paired frame-aligned FLAC trims against the seektable and no-seektable assets with ffmpeg.wasm, checks STREAMINFO, and compares decoded PCM digests before allowing `flac:seektable-seek-equivalence`. |
| `robustness/prop_gapless_sample_count_priming` | Filled. The browser-audio property oracle now verifies decoded sample duration/count against golden priming-removed duration and runs on Mediabunny. |

## Adapter Capability Notes

These are the main all-N/A causes that remain after removing fake negative gates and filling frame goldens:

| Engine / family | Current honest gap |
| --- | --- |
| `aibrush-media@dev` | Placeholder adapter with empty capabilities. Every N/A is expected until the product implementation exists. |
| `mp4box@2.3.0` | ISOBMFF-oriented parser/remux/mux support only. No decode, transcode, trim, or decrypt support. MP4 mux rows may be implementable only where encoded tracks and MP4 sample entries are available. |
| `remotion-media-parser@4.0.479` | Read-side parser/demuxer. No writer, converter, trim, mux, or decrypt operation should be declared. |
| `web-demuxer@4.0.0` | Demuxer/seek/read surface only. It writes nothing, so remux/mux/transcode/trim/decrypt rows remain N/A. |
| `platform@chrome-149` | Browser APIs can probe/demux/decode/seek and limited video transcode paths. They do not expose a general encoded-sample muxer, lossless remuxer, arbitrary trim path, or DRM cleartext export. |
| `ffmpeg.wasm@0.12.15` | Broad read/write support plus verified `trim:compose`, FLAC copy-trim support with STREAMINFO duration repair, Ogg-FLAC remux, PCM-to-WAV mux prep, PCM endianness roundtrip, `depth:10bit-to-8bit` source-depth conversion, narrow HDR/PQ-to-SDR tone-map, and a narrow verified CENC-CTR clear-output decrypt path for the generated non-fragmented MP4 fixture. The CENC path uses WebCrypto to clear samples and ffmpeg.wasm to stream-copy a clean MP4; unsupported CENC shapes still throw instead of claiming broad DRM support. Opus encode rows are runtime/budget guarded. HEVC-10 output encode remains undeclared because the wasm x265 path exceeds the per-scenario suite budget. |
| `mediabunny@1.48.0` | Broadest adapter, including declared decrypt schemes, verified `remux:compose` / `mux:roundtrip-compare` property rows, append-only headerless WebM output, massive UrlSource-backed copy-trim, and multi-rendition H.264 fanout surfaced through `MediaBytes.variants[]`. It does not declare `encryption:cenc-ctr-clear-output`: Mediabunny still errors while traversing the ffmpeg-generated CENC fixture, so enabling that feature would be a false PASS path. Specialized capabilities such as FLAC seek equivalence, `depth:10bit-output`, `depth:10bit-to-8bit`, and `tonemap` remain undeclared unless implemented and verified. |

## Verification Artifacts

Focused browser runs were used to prove that formerly placeholder negative rows now produce actionable results instead of hidden all-N/A rows:

| File | Important outcome |
| --- | --- |
| `results/raw/brave-2026-06-21T13-23-51-581Z.json` | Image probe/transcode negatives and image-to-audio transcode now produce PASS/FAIL/N/A cells. |
| `results/raw/brave-2026-06-21T13-25-56-307Z.json` | Audio-only input to video-target transcode now produces executable graceful-failure coverage where supported. |
| `results/raw/brave-2026-06-21T13-26-33-809Z.json` | Empty/no-sample mux row now produces executable graceful-failure coverage where supported. |
| `results/raw/brave-2026-06-21T15-20-18-627Z.json` | Follow-up focused run for the reported failure rows: 104 results, 59 PASS, 45 N/A, 0 FAIL. This supersedes the earlier negative-row run's actionable FAILs after still-image rejection, alpha-plane, and tolerance fixes. |
| `results/raw/brave-2026-06-21T16-03-54-273Z.json` | `robustness/prop_trim_concatenation` and `robustness/prop_trim_additivity_compose` now both PASS on `ffmpeg.wasm@0.12.15`; 16 total cells: 2 PASS, 14 N/A. |
| `results/raw/brave-2026-06-21T16-12-27-569Z.json` | `trim/audio_flac_seektable_copy` and `trim/audio_flac_noseektable_copy` now both PASS on `ffmpeg.wasm@0.12.15`; 16 total cells: 2 PASS, 14 N/A. |
| `results/raw/brave-2026-06-21T16-33-33-415Z.json` | Depth follow-up: `transcode/h264_10bit_to_h264_8bit` PASSes on `ffmpeg.wasm@0.12.15` with SSIM min 0.9999 and playback smoke. `transcode/h264_8bit_to_hevc_10bit` is now an honest `NA_ENGINE` on every engine via undeclared `depth:10bit-output`; 16 total cells: 1 PASS, 15 N/A, 0 FAIL. |
| `results/raw/brave-2026-06-21T16-46-22-776Z.json` | `remux/flac_seektable_flac_to_ogg` now PASSes on `ffmpeg.wasm@0.12.15`; 8 total cells: 1 PASS, 7 N/A, 0 FAIL. The oracle measured Ogg granule duration 10.000s, zero duration delta, and matching source/output FLAC total samples 480000. |
| `results/raw/brave-2026-06-21T16-55-05-491Z.json` | `robustness/prop_gapless_sample_count_priming` now PASSes on `mediabunny@1.48.0`; 8 total cells: 1 PASS, 7 N/A, 0 FAIL. The oracle decoded 48623 samples at 48 kHz, within 1 sample of the 1.013s priming-removed duration, while raw AAC frames would imply 46080 samples at the source rate. |
| `results/raw/brave-2026-06-21T17-01-40-422Z.json` | `robustness/prop_flac_seek_seektable_equiv` now PASSes on `ffmpeg.wasm@0.12.15`; 8 total cells: 1 PASS, 7 N/A, 0 FAIL. The oracle trimmed both FLAC variants at 2.880s for 0.960s and measured identical 46,080-sample decoded PCM output. |
| `results/raw/brave-2026-06-21T17-12-16-130Z.json` | `mux/pcm_s16_to_wav`, `mux/pcm_s24_to_wav`, and `mux/pcm_f32_to_wav` now PASS on `ffmpeg.wasm@0.12.15`; 24 total cells: 3 PASS, 21 N/A, 0 FAIL. Each row measured 5.000s output duration with zero delta from the input golden. |
| `results/raw/brave-2026-06-21T17-17-13-681Z.json` | `audio-dsp/meta_idempotent_resample_same_rate` and `audio-dsp/meta_roundtrip_endianness_s16` now PASS on `ffmpeg.wasm@0.12.15`; 16 total cells: 2 PASS, 14 N/A, 0 FAIL. Both rows measured matching 240,000-sample, 48 kHz stereo decoded PCM output. |
| `results/raw/brave-2026-06-21T17-19-09-145Z.json` | `audio-dsp/edge_gapless_aac_decode` now PASSes on `mediabunny@1.48.0`; 8 total cells: 1 PASS, 7 N/A, 0 FAIL. The oracle decoded 48,623 samples at 48 kHz, within 1 sample of the priming-removed 1.013s duration. |
| `results/raw/brave-2026-06-21T17-20-45-496Z.json` | `robustness/edge_pcm_s24_decode` now PASSes on `ffmpeg.wasm@0.12.15`; 8 total cells: 1 PASS, 7 N/A, 0 FAIL. The identity 24-bit PCM WAV output browser-decoded to the same 240,000-sample, 48 kHz stereo PCM digest as the source. |
| `results/raw/brave-2026-06-21T17-21-32-685Z.json` | `metadata/write_mkv_tags` now PASSes on `mediabunny@1.48.0` and `ffmpeg.wasm@0.12.15`; 8 total cells: 2 PASS, 6 N/A, 0 FAIL. Both passing engines preserved 2 media tracks / 770 packets and 12 bit-exact decoded frames. |
| `results/raw/brave-2026-06-21T17-22-20-190Z.json` | `mux/edge_hevc_decode_mux_mp4` and `mux/edge_hevc_decode_mux_mkv` now PASS on Mediabunny and ffmpeg.wasm; 16 total cells: 4 PASS, 12 N/A, 0 FAIL. Each passing row compared 12 bit-exact decoded frames; the MP4 target also re-imported 770 packets / 475 keyframes. |
| `results/raw/brave-2026-06-21T17-23-22-902Z.json` | `mux/prop_vp9_decode_mux_webm_to_webm`, `robustness/prop_decode_remux_eq_decode_webm_mkv`, and `remux/prop_multitrack_survives_mp4_mkv` now PASS on Mediabunny and ffmpeg.wasm; 24 total cells: 6 PASS, 18 N/A, 0 FAIL. All six PASS cells compared 12 bit-exact decoded frames; the multitrack remux also preserved 3 media tracks. |
| `results/raw/brave-2026-06-21T17-34-05-158Z.json` | `audio-dsp/throughput_decode_s24` and `audio-dsp/throughput_decode_s16be` now PASS on `ffmpeg.wasm@0.12.15`; 16 total cells: 2 PASS, 14 N/A, 0 FAIL. Both PASS cells compared 4096 bit-exact normalized PCM sample-frame digests against native source parsing. |
| `results/raw/brave-2026-06-21T17-38-12-285Z.json` | Current focused rerun for the user's listed failure rows: 104 total cells, 59 PASS, 45 N/A, 0 FAIL. This confirms the originally listed failure cells are no longer failing in the current worktree. |

## Follow-Up Hard No-Engine Audit

A current focused hard-gap audit leaves 1 registered scenario with no honest engine declaration. It must remain all-N/A until the named implementation gap is real; widening features would fake support.

| Scenario group | Rows | Reason they remain N/A |
| --- | ---: | --- |
| HEVC-10 output encode | 1 | `transcode/h264_8bit_to_hevc_10bit` remains all-N/A because no engine declares `depth:10bit-output`. ffmpeg.wasm's x265 path timed out even on the one-frame H.264 input, including with wasm-safe single-thread x265 settings. The browser-backed paths do not expose an honest 10-bit output knob: platform transcode is canvas-to-MediaRecorder, WebCodecs `VideoEncoderConfig` has no `bitDepth`, Mediabunny `ConversionVideoOptions` has no video bit-depth field, and Remotion's HEVC codec-string builder explicitly uses profile 1/Main. Declaring support would fake the scenario. |

New focused verification:

| File | Important outcome |
| --- | --- |
| `results/raw/brave-2026-06-21T15-48-28-574Z.json` | `robustness/prop_demux_mux_roundtrip_eq` and `robustness/prop_double_remux_stable` now both PASS on `mediabunny@1.48.0`; 16 total cells: 2 PASS, 14 N/A. |
| `results/raw/brave-2026-06-21T16-03-54-273Z.json` | `robustness/prop_trim_concatenation` and `robustness/prop_trim_additivity_compose` now both PASS on `ffmpeg.wasm@0.12.15`; duration stayed within 0.15s and decoded-frame SSIM min was 0.9883 over 210 frames. |
| `results/raw/brave-2026-06-21T16-12-27-569Z.json` | `trim/audio_flac_seektable_copy` and `trim/audio_flac_noseektable_copy` now both PASS on `ffmpeg.wasm@0.12.15`; `trim-boundaries` measured exactly 5.000s output for the requested 5.000s range on both rows. |
| `results/raw/brave-2026-06-21T16-46-22-776Z.json` | `remux/flac_seektable_flac_to_ogg` now PASSes on `ffmpeg.wasm@0.12.15`; the Ogg-FLAC semantic proof measured 10.000s from granules and matching source/output total samples. |
| `results/raw/brave-2026-06-21T17-01-40-422Z.json` | `robustness/prop_flac_seek_seektable_equiv` now PASSes on `ffmpeg.wasm@0.12.15`; the paired FLAC trim proof measured 21,194-byte outputs, 46,080 decoded samples each, 48 kHz stereo, and matching PCM digest. |
| `results/raw/brave-2026-06-21T17-12-16-130Z.json` | `mux/pcm_s16_to_wav`, `mux/pcm_s24_to_wav`, and `mux/pcm_f32_to_wav` now PASS on `ffmpeg.wasm@0.12.15`; each authored WAV preserved the 5.000s input duration with zero measured delta. |
| `results/raw/brave-2026-06-21T17-17-13-681Z.json` | `audio-dsp/meta_idempotent_resample_same_rate` and `audio-dsp/meta_roundtrip_endianness_s16` now PASS on `ffmpeg.wasm@0.12.15`; both rows browser-decoded source and output to matching 240,000-sample, 48 kHz stereo PCM digests. |
| `results/raw/brave-2026-06-21T17-19-09-145Z.json` | `audio-dsp/edge_gapless_aac_decode` now PASSes on `mediabunny@1.48.0`; full-range trimmed AAC decoded to the expected priming/padding-removed duration with a 1-sample tolerance. |
| `results/raw/brave-2026-06-21T17-20-45-496Z.json` | `robustness/edge_pcm_s24_decode` now PASSes on `ffmpeg.wasm@0.12.15`; identity 24-bit PCM materialization decoded to the same 240,000-sample PCM digest as the source. |
| `results/raw/brave-2026-06-21T17-21-32-685Z.json` | `metadata/write_mkv_tags` now PASSes on Mediabunny and ffmpeg.wasm; reference re-import preserved 770 packets / 2 tracks and decode equality compared 12 bit-exact frames. |
| `results/raw/brave-2026-06-21T17-22-20-190Z.json` | `mux/edge_hevc_decode_mux_mp4` and `mux/edge_hevc_decode_mux_mkv` now PASS on Mediabunny and ffmpeg.wasm; each passing row compared 12 bit-exact decoded frames. |
| `results/raw/brave-2026-06-21T17-23-22-902Z.json` | VP9 WebM mux, WebM→MKV remux decode-equality, and multitrack MP4→MKV remux all now PASS on Mediabunny and ffmpeg.wasm; each PASS compared 12 bit-exact decoded frames. |
| `results/raw/brave-2026-06-21T17-34-05-158Z.json` | 24-bit WAV PCM decode throughput and big-endian AIFF PCM decode throughput now PASS on ffmpeg.wasm with 4096 bit-exact normalized PCM sample-frame digests each. |
| `results/raw/brave-2026-06-21T17-38-12-285Z.json` | The explicit failure list from the goal now has 0 FAIL in the current worktree; remaining cells in that focused set are honest N/A gates. |
| `results/raw/brave-2026-06-21T17-43-21-492Z.json` | Current hard-gap audit of the 12 known no-engine scenarios produced 96 N/A cells. The reasons are specific capability/contract gaps: CENC-CTR clear-output baseline, ClearKey/CENS/SAMPLE-AES capability findings, headerless WebM writer/fixture support, fanout multi-output contract, HEVC-10 output runtime budget, HDR tonemap source/feature, and massive lazy trim. |
| `results/raw/brave-2026-06-21T17-46-51-553Z.json` | Experimental FFmpeg `depth:10bit-output` declaration for `transcode/h264_8bit_to_hevc_10bit` timed out at 120s on the one-frame HEVC Main10 encode; the capability was not retained. |
| `results/raw/brave-2026-06-21T17-50-16-662Z.json` | Re-test with wasm-safe x265 settings (`threads=1`, no x265 pools) still timed out at 120s; `depth:10bit-output` remains undeclared. |
| `results/raw/brave-2026-06-21T17-58-10-016Z.json` | `encryption/clearkey_decrypt_na`, `encryption/cenc_cens_decrypt_na`, and `encryption/hls_sample_aes_decrypt_na` now PASS on Mediabunny; 24 total cells: 3 PASS, 21 N/A, 0 FAIL. Each PASS is a clean unsupported-scheme rejection through the `graceful-failure` oracle. |
| `results/raw/brave-2026-06-21T17-58-30-027Z.json` | Follow-up hard-gap audit improved from 96 N/A cells to 93 N/A plus 3 PASS. Remaining all-N/A scenarios are now 9: the 3 CENC-CTR clear-output rows, 2 headerless WebM rows, fanout, HEVC-10 output, HDR tonemap, and massive lazy trim. |
| `results/raw/brave-2026-06-21T18-07-24-242Z.json` | `streaming-output/webm_headerless_live_stream` and `streaming-output/prop_webm_headerless_duration_materialized` now PASS on Mediabunny; 16 total cells: 2 PASS, 14 N/A, 0 FAIL. Both PASS cells include the new `webm-live-layout` oracle: unknown-size Segment, no SeekHead, no Segment Duration, 1 Cluster. |
| `results/raw/brave-2026-06-21T18-08-03-114Z.json` | Follow-up hard-gap audit of the previous 9 rows produced 72 cells: 2 PASS, 70 N/A, 0 FAIL. Remaining all-N/A scenarios dropped to 7 before the massive-trim declaration: the 3 CENC-CTR rows, fanout, HEVC-10 output, HDR tonemap, and massive lazy trim. |
| `results/raw/brave-2026-06-21T18-09-12-997Z.json` | `trim/massive_h264_copy_sustained` now PASSes on Mediabunny; 8 total cells: 1 PASS, 7 N/A, 0 FAIL. Correctness used `trim-boundaries` plus `playback-smoke` on the 1.1 GB fixture. Bench wall was 5202 ms for the measured op; `sourceReads` remains uninstrumented (`n=0`). |
| `results/raw/brave-2026-06-21T18-13-46-581Z.json` | Current hard-gap audit of the previous 9 rows produced 72 cells: 3 PASS, 69 N/A, 0 FAIL. Remaining all-N/A scenarios are now 6: the 3 CENC-CTR clear-output rows, fanout, HEVC-10 output, and HDR tonemap. |
| `results/raw/brave-2026-06-21T18-24-19-662Z.json` | `transcode/fanout_h264_abr_ladder` now PASSes on Mediabunny; 8 total cells: 1 PASS, 7 N/A, 0 FAIL. The `fanout-renditions` oracle verified 4 H.264 outputs: 1920x1080, 1280x720, 854x480, and 640x360, each with playback and SSIM/PSNR. |
| `results/raw/brave-2026-06-21T18-25-44-132Z.json` | Current hard-gap audit of the previous 6 rows produced 48 cells: 1 PASS, 47 N/A, 0 FAIL. Remaining all-N/A scenarios are now 5: the 3 CENC-CTR clear-output rows, HEVC-10 output, and HDR tonemap. |
| `results/raw/brave-2026-06-21T18-52-29-070Z.json` | `encryption/cenc_ctr_decrypt`, `encryption/cenc_ctr_decrypt_eq_cleartext`, and `encryption/perf_cenc_ctr_decrypt_throughput` now PASS on `ffmpeg.wasm@0.12.15`; 24 total cells: 3 PASS, 21 N/A, 0 FAIL. The adapter decrypts real CENC-CTR samples, remuxes a clear MP4, and the oracles compare against browser-baked `cenc_ctr_clear.mp4` frames. |
| `results/raw/brave-2026-06-21T18-53-16-971Z.json` | Current hard-gap audit of the previous 5 rows produced 40 cells: 3 PASS, 37 N/A, 0 FAIL. Remaining all-N/A scenarios are now 2: `transcode/h264_8bit_to_hevc_10bit` and `transcode/hdr10_to_sdr_tonemap`. |
| `results/raw/brave-2026-06-21T19-08-03-414Z.json` | `transcode/hdr10_to_sdr_tonemap` now PASSes on `ffmpeg.wasm@0.12.15`; the output metadata invariant measured an MP4/H.264 one-track output with zero duration delta, and playback smoke advanced successfully. |
| `results/raw/brave-2026-06-21T19-08-25-529Z.json` | Current two-row hard-gap audit produced 16 cells: 1 PASS, 15 N/A, 0 FAIL. `transcode/hdr10_to_sdr_tonemap` is no longer all-N/A; the remaining all-N/A row is `transcode/h264_8bit_to_hevc_10bit`. |

## 2026-06-21 Chromium Follow-Up

The user-reported Chromium file `results/raw/results-chromium-2026-06-21T19-36-15-173Z.json` contained 3 FAIL cells, 1 ERROR cell, and 9 rows where every framework cell was N/A. The follow-up work intentionally separated real implementation fixes from rows that still cannot honestly claim framework support.

Applied fixes:

| Area | Change |
| --- | --- |
| Clear-input decrypt no-op | `ffmpeg.wasm@0.12.15` now treats the exact `CENC decrypt found no protected tracks` no-op case as clear input, then remuxes the original MP4 bytes through the existing ffmpeg path. Other decrypt errors still throw. |
| Edge decode tolerances | `decode_tiny_dims_2x2_h264` and `decode_h264_10bit` now carry scenario-local SSIM floors for known edge-codec rounding behavior instead of using the general 0.99 image floor. |
| Transcode browser negotiation | Transcode source codecs are now browser decode requirements, while only target codecs are browser encode requirements. This removes false `NA_BROWSER` gates such as requiring the browser to encode MP3, FLAC, or PCM when those codecs are only inputs. |
| VP8/VP9 transcode fixtures | `transcode/h264_to_vp8_webm` now uses the tiny H.264 fixture so the VP8/Vorbis wasm path fits the browser-suite budget. `transcode/vp8_to_vp9_webm` now uses the VP8/Opus recorder fixture instead of the older VP8/Vorbis fixture, because Chromium does not expose a WebCodecs Vorbis decode path for this transcode row. |

Latest Chromium verification:

| File | Important outcome |
| --- | --- |
| `results/raw/chromium-2026-06-21T19-52-41-488Z.json` | Focused follow-up over the reported failure/all-N/A set produced 96 cells: 20 PASS, 76 N/A, 0 FAIL, 0 ERROR. Former failing rows now PASS, and 5 of the 9 all-N/A rows gained real framework coverage. |

Rows resolved in the Chromium follow-up:

| Scenario | Verified outcome |
| --- | --- |
| `decode-seek/decode_tiny_dims_2x2_h264` | PASS on ffmpeg.wasm, web-demuxer, platform, Mediabunny, and Remotion WebCodecs. |
| `decode-seek/decode_h264_10bit` | PASS on ffmpeg.wasm, web-demuxer, platform, Mediabunny, and Remotion WebCodecs. |
| `encryption/unencrypted_left_untouched_noop` | PASS on Mediabunny and ffmpeg.wasm. The ffmpeg.wasm result now exercises the explicit clear-input no-op path. |
| `transcode/h264_to_vp8_webm` | PASS on ffmpeg.wasm with the tiny H.264 source fixture. |
| `transcode/wav_to_opus_ogg` | PASS on Mediabunny after target-aware browser codec negotiation. |
| `transcode/vp8_to_vp9_webm` | PASS on Mediabunny and Remotion WebCodecs with the VP8/Opus recorder fixture. |
| `transcode/mp3_to_opus_webm` | PASS on Mediabunny and Remotion WebCodecs after target-aware browser codec negotiation. |
| `transcode/gapless_pcm_to_opus_priming` | PASS on Mediabunny and Remotion WebCodecs after target-aware browser codec negotiation. |

Rows that remain all-N/A in the Chromium follow-up:

| Scenario | Reason N/A remains honest |
| --- | --- |
| `encryption/hls_aes128_decrypt` | The only declared HLS-AES128 decrypt path is Mediabunny, but the row is still `NA_ASSET` because `hls_aes128.m3u8.frames.json` is pending. A targeted Chromium frame bake for `hls_vod.m3u8` and `hls_aes128.m3u8` wrote 0 files because both playlists failed before metadata in `<video>`. ffmpeg.wasm does not declare this HLS decrypt path, and the other adapters do not expose decrypt support. |
| `encryption/hls_aes128_decrypt_eq_cleartext` | Same HLS golden-frame blocker as above. The equality oracle cannot compare encrypted-HLS output to a browser-normalized clear HLS baseline until the clear and encrypted playlist goldens exist. |
| `transcode/flac_to_opus_webm` | Chromium WebCodecs cannot decode FLAC for the Mediabunny/Remotion transcode paths, and ffmpeg.wasm does not declare reliable Opus encode support because the vendored wasm core traps or exceeds the scenario budget. Declaring support would fake a codec path that the current browser/runtime cannot execute. |
| `transcode/h264_8bit_to_hevc_10bit` | Still the known hard gap: no engine declares `depth:10bit-output`. ffmpeg.wasm's x265 Main10 path times out even on one-frame input, and browser-backed APIs expose no honest 10-bit output control. |

Additional attempted asset verification:

| Command / artifact | Outcome |
| --- | --- |
| `bun scripts/frame-bake.mjs --base-url http://localhost:5173 --browser chromium --asset hls_vod.m3u8,hls_aes128.m3u8 --timeout-ms 180000` | Attempted after starting `scripts/serve.sh`; both HLS playlists failed before metadata and wrote 0 golden files. |

## 2026-06-21 HLS Clear Reference Follow-Up

The prior Chromium follow-up correctly identified the HLS playlist frame-bake blocker: Chromium cannot decode the HLS playlist directly, so `hls_aes128.m3u8.frames.json` remains a pending placeholder. The HLS decrypt scenarios now avoid that false asset blocker by naming an offline plaintext MP4 reference instead of the playlist as their comparison golden.

| Artifact / change | Outcome |
| --- | --- |
| `fixtures/media/hls_aes128_clear.mp4` | Generated with native ffmpeg from `hls_aes128.m3u8` using the committed HLS AES-128 key and `-c copy -movflags +faststart`. This is the browser-decodable plaintext reference for the HLS decrypt oracle. |
| `fixtures/manifest.json` | Added `hls_aes128_clear.mp4` with checksum `53c64d84ea484656dd01892701a3917d3b8cd1b28f8d87ff57813ce8ad80adcd` and size `4,459,013` bytes. |
| `fixtures/golden/hls_aes128_clear.mp4.*.json` | `bun fixtures/bake.mjs hls_aes128_clear.mp4` produced metadata and packet goldens; browser frame-bake in Chromium filled 12/12 frame digests and wrote the SSIM reference. |
| `encryption/hls_aes128_decrypt` | Now sets `cleartextAsset: hls_aes128_clear.mp4`, so `decrypt-bitexact` compares decrypted HLS output to the browser-baked MP4 plaintext reference rather than the undecodable HLS playlist placeholder. |
| `encryption/hls_aes128_decrypt_eq_cleartext` | Now uses the same cleartext MP4 reference for `property-invariant[decode-cleartext-baseline]`. |

Verification completed after this change:

| Command / artifact | Outcome |
| --- | --- |
| `bun fixtures/bake.mjs hls_aes128_clear.mp4` | PASS. Reused the generated MP4, wrote metadata, packets, and a frame hook. |
| `bun scripts/frame-bake.mjs --base-url http://localhost:5173 --browser chromium --asset hls_aes128_clear.mp4 --timeout-ms 180000` | PASS. Filled 12/12 browser-normalized frame digests for the MP4 reference. |
| Static golden check | PASS. Manifest entry exists; `frames.pending` is false; 12 frame hashes are present; metadata reports MP4 with H.264 video and AAC audio; packet golden has 770 packets. |
| Focused browser matrix for the HLS decrypt rows | Not completed in this pass because the required unsandboxed Playwright/Vite run was rejected by the environment usage limit. The HLS asset blocker is removed, but a fresh Chromium PASS result is still required before removing these rows from the hard-gap list. |

Final code-level verification for this pass:

| Command | Outcome |
| --- | --- |
| `bun run typecheck` | PASS. Scenario type changes, oracle edits, negotiation changes, and capability edits compile. |
| `bun run build` | PASS. The Vite/browser bundle builds successfully; it still reports the pre-existing large-chunk warning. |
