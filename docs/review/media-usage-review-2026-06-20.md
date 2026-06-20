# Media Usage Review - 2026-06-20

## Concrete Restatement

Review the current `media-browser-test` suite and determine whether every registered scenario/test uses real media files from `fixtures/media`, whether any scenario still relies on mocked media files or fabricated byte streams, and what gaps remain before the suite can honestly say every executable case runs against real media.

## Short Answer

All runnable scenario inputs are routed through `fixtures/media/<assetId>`. The runner has one media input constructor, and it materializes every scenario input by checking `fixtures/manifest.json` and fetching `/fixtures/media/<id>`.

I found no active test path that uses a mocked media file instead of a fixture. There are, however, two important caveats:

1. 26 scenario-input references point at canonical asset IDs that are not yet declared in `fixtures/manifest.json` and are absent from `fixtures/media`; these cases become `NA_ASSET` before execution.
2. 51 scenarios define `mutate`; 20 use identity mutation only to enter the robustness path, and 31 fetch a real fixture first, then corrupt/truncate/zero/bit-flip the bytes in memory. These are not mocked files, but they are synthetic malformed derivatives rather than standalone files on disk.

## Evidence

Primary code path:

- `src/core/scenario.ts:148` declares `input` as a corpus asset ID or list of IDs.
- `src/core/runner.ts:78` sets the media base to `/fixtures/media`.
- `src/core/runner.ts:349` checks the input asset against `fixtures/manifest.json`, then verifies that the served media path exists.
- `src/core/runner.ts:388` builds `MediaInput` from `/fixtures/media/<id>`.
- `src/core/runner.ts:403` applies optional `mutate` only after the real fixture bytes have been fetched.
- `src/core/runner.ts:687` refuses scenarios with no input, checks every input for missing assets, and only then builds `MediaInput`s.
- `test-instructions.md:154` explicitly states that `fixtures/media` is the single source of test media.

## Catalog Counts

Registered scenario catalog:

| Item | Count |
| --- | ---: |
| Registered scenarios | 551 |
| Scenario input references | 562 |
| Unique scenario asset IDs | 68 |
| Manifest assets | 55 |
| Files currently in `fixtures/media` | 67 |
| Manifest assets present on disk | 55 / 55 |
| Scenario input references backed by manifest + file | 536 / 562 |
| Scenario input references missing manifest + file | 26 / 562 |
| Scenario input references with manifest entry but missing file | 0 |
| Multi-input scenarios | 9 |
| Scenarios with `mutate` | 51 |

Scenario counts by family:

| Family | Scenarios | Input refs | Unique assets | Mutating scenarios |
| --- | ---: | ---: | ---: | ---: |
| probe | 48 | 49 | 43 | 0 |
| demux | 40 | 40 | 37 | 4 |
| remux | 49 | 49 | 21 | 3 |
| transcode | 83 | 83 | 26 | 7 |
| decode-seek | 43 | 43 | 25 | 0 |
| trim | 42 | 42 | 23 | 7 |
| mux | 52 | 58 | 21 | 4 |
| encryption | 13 | 13 | 4 | 3 |
| metadata | 25 | 25 | 12 | 2 |
| streaming-output | 27 | 27 | 7 | 0 |
| audio-dsp | 36 | 37 | 13 | 4 |
| robustness | 60 | 63 | 38 | 17 |
| performance | 33 | 33 | 7 | 0 |

## Fixture Provenance

`fixtures/manifest.json` currently declares 55 canonical assets:

| Source | Count | Meaning |
| --- | ---: | --- |
| generated | 52 | Deterministically produced by the bake process |
| provided | 2 | Real assets that need explicit user/tool provisioning |
| captured | 1 | Produced by a real browser capture flow |

All 55 manifest assets are currently present in `fixtures/media` with non-null `sha256` and `sizeBytes`.

The 67 files in `fixtures/media` include 12 files that are not manifest asset IDs. Most are HLS sidecars fetched by playlists:

- `hls_aes128.key`
- `hls_aes128_000.ts`
- `hls_aes128_001.ts`
- `hls_aes128_002.ts`
- `hls_aes128_003.ts`
- `hls_aes128_004.ts`
- `hls_vod_000.ts`
- `hls_vod_001.ts`
- `hls_vod_002.ts`
- `hls_vod_003.ts`
- `hls_vod_004.ts`
- `wav_s16be.wav`

The HLS sidecars are real media/key files, but scenarios reference the playlist asset IDs rather than the sidecars directly.

## Missing Asset Gaps

These are the scenario input IDs that are currently neither in the manifest nor on disk. They are not mocks; they are explicit asset gaps that produce `NA_ASSET`.

| Missing input ID | Scenario refs |
| --- | ---: |
| `h264_1fps_30s.mp4` | 2 |
| `h264_240fps_5s.mp4` | 2 |
| `wav_5_1.wav` | 2 |
| `longform_1h_audio_pcm.wav` | 2 |
| `micro_h264_1x1_1s.mp4` | 2 |
| `aac_gapless_priming.m4a` | 2 |
| `h264_10bit_1080p_5s.mp4` | 1 |
| `h264_open_gop_1080p.mp4` | 1 |
| `h264_1x1_1s.mp4` | 1 |
| `h264_0x0_1s.mp4` | 1 |
| `wav_s16_44k1.wav` | 1 |
| `wav_s16_mono.wav` | 1 |
| `pcm_s24be.aiff` | 1 |
| `pcm_s16.caf` | 1 |
| `aac_audio_only.m4a` | 1 |
| `h264_video_only.mp4` | 1 |
| `micro_h264_0x0_1s.mp4` | 1 |
| `h264_es_mislabeled.webm` | 1 |
| `h264_ts_pts_wrap.ts` | 1 |
| `wav_varchannels.wav` | 1 |

Notable naming/coverage drift:

- `video_240fps.mp4` exists but scenarios request `h264_240fps_5s.mp4`.
- `audio_6ch_51.m4a` exists but audio-DSP scenarios request `wav_5_1.wav`.
- `mislabeled_h264.webm` exists but one robustness scenario requests `h264_es_mislabeled.webm`.
- `video_1x1.webm` and `video_2x2_h264.mp4` exist, while some decode/robustness scenarios request other 1x1/0x0 H.264 IDs.

Those should be reviewed before baking new files; some gaps may be scenario-ID drift rather than true missing media.

## Mutation And Mock-Like Cases

I found 51 scenarios with `mutate`:

| Mutation type | Count | Interpretation |
| --- | ---: | --- |
| identity-routing | 20 | Real fixture bytes are unchanged; `mutate` is used only to enter the robustness/graceful-failure path |
| byte-mutating | 31 | Real fixture bytes are fetched first, then deterministically corrupted in memory |

These are the byte-mutating families:

| Family | Byte-mutating scenarios |
| --- | ---: |
| demux | 2 |
| remux | 3 |
| transcode | 1 |
| trim | 2 |
| encryption | 3 |
| metadata | 2 |
| audio-dsp | 4 |
| robustness | 14 |

Examples:

- `demux/graceful_mp4_header_destroyed` fetches `h264_1080p_30s.mp4`, then drops header bytes.
- `remux/neg_zeroed_mp4_to_mkv` fetches `h264_1080p_30s.mp4`, then replaces bytes with zeros.
- `encryption/cenc_ctr_senc_bitflip_graceful` fetches `cenc_ctr.mp4`, then bit-flips protection/sample regions.
- `metadata/neg_garbled_id3_mp3_probe` fetches `mp3_xing.mp3`, then garbles the tag/header region.
- `robustness/fuzz_adts_aac_bitflip_probe` fetches `aac_adts.aac`, then bit-flips ADTS bytes.

These should be considered real-media-derived robustness tests, not mocked-file tests. If the policy becomes "every tested byte stream must exist as a concrete file under `fixtures/media`", then these 31 byte-mutating scenarios need baked malformed fixture files instead of in-memory mutation.

## Unused Baked Manifest Assets

These manifest assets are present and baked but not directly referenced by any registered scenario input:

- `video_1x1.webm`
- `video_2x2_h264.mp4`
- `video_240fps.mp4`
- `fragmented_cmaf.mp4`
- `mislabeled_h264.webm`
- `audio_6ch_51.m4a`
- `ts_discontinuity.ts`

This is worth reconciling with the missing input list before adding new fixtures.

## Mocked File Findings

I searched the scenario, core, fixture, and script code for mock/stub/fake/synthetic media patterns, direct `Blob`/`File` construction, base64/data URLs, and byte-array construction.

Findings:

- No registered scenario bypasses the runner with a mocked file.
- `new Blob(...)` in the runner wraps bytes fetched from `fixtures/media` after optional mutation.
- `new Blob(...)` in frame-bake and capture scripts is tooling for producing or decoding real fixture artifacts, not an active mocked test input.
- The `aibrush-media` stub is an engine stub, not mocked media.
- `fixtures/bake.mjs` intentionally generates many fixtures from synthetic ffmpeg sources, but those outputs are real media files on disk with checksums. That is different from mocked runtime inputs.

## Recommendations

1. Reconcile the 20 missing unique input IDs. First check whether existing assets can be reused or scenario IDs renamed, especially `video_240fps.mp4`, `audio_6ch_51.m4a`, `mislabeled_h264.webm`, and the existing 1x1/2x2 assets.
2. Decide whether in-memory mutation is acceptable for robustness. If the strict goal is "all byte streams under test are files", bake the 31 byte-mutating derivatives into `fixtures/media` and replace `mutate` with explicit asset IDs.
3. Add a catalog guard that fails CI or reports loudly when a scenario input is not declared in `fixtures/manifest.json`, so asset gaps do not quietly accumulate.
4. Add a second guard for unused manifest assets, or deliberately mark support-only sidecars and deferred assets so the unused list is intentional.

## Conclusion

The suite is already architected around real media from `fixtures/media`; there is no evidence of active mocked media inputs. The remaining work is corpus hygiene: fix 26 missing scenario-input references and decide whether the 31 in-memory malformed derivatives should stay as deterministic robustness mutations or be promoted to real checked fixture files.
