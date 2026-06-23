# mux/three_track_assembly_to_mkv

family: mux | fixtures: h264_1080p_30s.mp4 + aac_adts.aac + mp3_xing.mp3 | primaryMetric: wall (default) | passCount: 2

## Verdict

Best framework: **mediabunny@1.48.0** (CONTESTED — 2 of 7 engines PASS).

Decisive factor: correctness is a tie (both passing engines clear the *same* single oracle, `property-invariant:probe-duration`, with the same band), so the decision falls to performance. mediabunny is the clear perf winner: **2.27x faster wall** (121.75 ms vs 276.36 ms) and **2.27x higher throughput** (246.42x-realtime vs 108.56x-realtime). It also produced a tighter correctness measurement: duration delta **0.0000s** vs ffmpeg.wasm's **0.0500s** (both inside the 0.125s tolerance). Both results are n=1 and cached, so the margin is directional rather than statistically hardened.

Margin over runner-up (ffmpeg.wasm): wall 0.44x (i.e. 2.27x faster), throughput 2.27x, duration delta 0.0000s vs 0.0500s.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true (Δ0.0000s) | 121.745 ms | 246.417x | 0 (n=0) | 1192 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (Δ0.0500s) | 276.355 ms | 108.556x | 0 (n=0) | 403 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

Note: peakMemory and targetWrites have n==0 samples for both passing engines (not measured for this cell), so they cannot break the tie. longtasks is reported but is a secondary main-thread-blocking proxy, not the primary metric.

## Why the winner wins (deep technical)

This is a three-track cross-source assembly into Matroska: the runner first demuxes three independent sources — an H.264 elementary video track lifted from `h264_1080p_30s.mp4` (ISO-BMFF, length-prefixed AVCC NAL framing, avcC config), an AAC audio track from raw `aac_adts.aac` (ADTS-framed, AudioSpecificConfig recovered from the ADTS headers), and an MPEG-1 Layer III audio track from `mp3_xing.mp3` (a Xing/Info-headed CBR stream) — then hands all three as `EncodedTracks` to `engine.mux(tracks, {container:'mkv'})`. The muxer must author one Matroska Segment with three TrackEntries (1 video + 2 audio), lace each track's coded samples into SimpleBlocks/BlockGroups with correct per-track timestamps, and serialize codec-private data per track (avcC -> V_MPEG4/ISO/AVC, ASC -> A_AAC, MP3 -> A_MPEG/L3). MKV's SimpleBlock lacing and EBML element model are a complete reframing of the source MP4 sample table and ADTS framing, which is exactly why the scenario gates on the container-agnostic `property-invariant:probe-duration` rather than `reference-reimport` — a source-keyed packet-count gate would false-fail because the second/third audio tracks inflate the count against a single-source golden (see `_shared.ts:25-40` and `multi-source.ts:25-30`).

mediabunny ran on its native WebCodecs/pure-TS path: `env.configUsed.backend == "webcodecs"`, `coreBuild == "pure-ts-esm"`, `wasmThreads == 0`, `sharedArrayBuffer == false`, `coopCoep == "not-required"`. Its mux is a genuine container-author: `src/engines/mediabunny/adapter.ts:1508` builds a real `Output` with an `MkvOutputFormat` (`makeOutputFormat(opts.container)`, line 1509) and a `BufferTarget`, creates an `EncodedVideoPacketSource`/`EncodedAudioPacketSource` per track (lines 1528, 1539), `addVideoTrack`/`addInVideoTrack`/`addAudioTrack` with `maximumPacketCount` (lines 1529, 1540), then streams every source chunk as a real `mb.EncodedPacket(c.data, key|delta, ptsUs/1e6, durationUs/1e6, i)` (line 1562) — the *coded bytes are copied verbatim*, only the EBML/SimpleBlock structure is authored. The first packet of each track carries a `decoderConfig` with the track `description` (lines 1571-1590) so the muxer emits the correct CodecPrivate for AVC/AAC/MP3. It finishes with `output.start()` / per-track `source.close()` / `output.finalize()` (lines 1553, 1594, 1598). Because there is no WASM module to instantiate, no worker boot, and no MEMFS round-trip, the whole assembly is a single in-process streaming pass — hence the 121.75 ms wall and 246.42x-realtime throughput, and a duration delta of exactly **0.0000s** (mediabunny re-emits Segment/track durations directly from the per-packet PTS it was given, so the reference-probed output duration is bit-identical to the 30.000s golden).

ffmpeg.wasm also genuinely muxes and also PASSes, but pays a structural tax that shows up in the numbers. Its `mux` (`src/engines/ffmpeg-wasm/adapter.ts:2899`) cannot consume WebCodecs-style chunk objects directly; it must *reconstruct each track as a demuxable elementary stream in MEMFS* (`buildElementaryStream`, lines 2916-2922 — H.264 chunks are converted from AVCC to Annex-B, AAC access units are re-wrapped in 7-byte ADTS headers via `adtsWrap` at adapter.ts:649), write three temp files into the virtual filesystem, then shell out `ffmpeg -i t0 -i t1 -i t2 -map 0 -map 1 -map 2 -c copy -avoid_negative_ts make_zero out.mkv` (lines 2925-2941). The elementary-stream rebuild plus the wasm `-c copy` remux is what produces the 276.36 ms wall (2.27x slower) and 108.56x-realtime throughput. Its duration delta is **0.0500s** (still well inside 0.125s): `-avoid_negative_ts make_zero` and the re-derivation of timestamps from rebuilt elementary streams introduce ~one audio/video packet of cross-source mux rounding — precisely the rounding the scenario's loosened 0.125s band was set to tolerate (`multi-source.ts:72-76`). So ffmpeg.wasm is correct, just looser and slower on every measured axis except longtasks (403 ms vs mediabunny's 1192 ms — mediabunny does its work in fewer, longer main-thread tasks, an artifact of the pure-TS single-pass author, but longtasks is not the primary metric and does not flip a 2.27x wall win).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost on perf): correct mux but 2.27x slower wall (276.36 ms vs 121.75 ms) and 2.27x lower throughput (108.56x vs 246.42x). Root cause: it must rebuild each track as an elementary stream in MEMFS and run a wasm `-c copy` remux (`adapter.ts:2899-2943`), versus mediabunny's in-process streaming packet-source author. Also a looser duration result (Δ0.0500s vs 0.0000s).
- **mp4box@2.3.0** (NA_ENGINE): honest NA. It declares `mux: true` but `containersIn: ['mp4','mov']` only (`src/engines/mp4box/adapter.ts:645`); it cannot demux the raw `aac_adts.aac` ADTS source, so the runner correctly reports "engine does not declare input container 'adts'". (It also could not write MKV — it only authors MP4 — so the NA is doubly honest.)
- **platform@chrome-149** (NA_ENGINE): honest NA — WebCodecs is a codec layer with no container muxer, so the platform engine does not declare the `mux` operation.
- **web-demuxer@4.0.0** (NA_ENGINE): honest NA — it is a demux-only library (its name is its scope); it does not declare `mux`.
- **remotion-media-parser@4.0.479** (NA_ENGINE): honest NA — a read/parse-only library; does not declare `mux`.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): honest NA — a decode/encode wrapper, not a container author; does not declare `mux`.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/multi-source.ts:66-77` (id `three_track_assembly_to_mkv`), built via `buildMuxAll` -> `buildMux` in `src/scenarios/mux/_shared.ts:204-229`. op is `mux`, target container `mkv`, default oracle set resolves to `['property-invariant']` (single-source check is false because input is a 3-element list, and mkv is not a FAITHFUL_REIMPORT_TARGET, so reference-reimport is correctly NOT attached — `_shared.ts:183-195`).
- Fixtures exist and are real media: `fixtures/media/h264_1080p_30s.mp4` (31 MB), `fixtures/media/aac_adts.aac` (164 KB), `fixtures/media/mp3_xing.mp3` (64 KB). All three present on disk; none synthetic/empty/mock.
- Winner adapter is a genuine implementation: `src/engines/mediabunny/adapter.ts:1508-1600` — real `Output`/`MkvOutputFormat`/`BufferTarget`, real per-track `Encoded{Video,Audio}PacketSource`, real `EncodedPacket` per source chunk with verbatim `c.data`, real `output.finalize()`. No canned output, no input->output copy, no golden short-circuit, no error swallowing.
- Oracle is real: `propertyInvariant` -> probe-duration branch at `src/core/oracles.ts:2709-2759`. It re-imports the authored output through the reference engine (`ctx.referenceEngine.probe(...)`, line 2721), reads the actual decoded `durationSec`, and compares to the golden source duration with an explicit ±0.125s band. Measurements are physically plausible: `outDurationSec` 30.000 (mediabunny) / 30.050 (ffmpeg) vs `goldenDurationSec` 30.000 for a 30s 1080p clip. Not trivially satisfiable — a wrong duration (truncated/empty mux) would exceed 0.125s and fail.
- Caveat — this is a single-oracle duration gate (no decode-bitexact, no packet-count). It confirms the three-track output is a structurally valid MKV of the right length, but does NOT independently verify all three tracks decode to correct pixels/PCM or that track indexing is exact. That makes the PASS real but not the strongest possible gate (the scenario notes explain a true per-track demux(mux(x)) count oracle does not yet exist — `multi-source.ts:25-30`).
- Cached note: BOTH passing engines have `cached: true` ("cached previous PASS result"). Evidence is reused, not freshly re-run this session; per the launcher-seeding caveat, treat the exact numbers as last-known-good rather than this-run measurements.

Verdict: **WEAK-GATE**. Real fixtures + real implementations on both passing engines, but the only gating oracle is a single container-agnostic duration-probe (a property proxy, not bit-exact or structural-exact), and both results are cached n=1. The PASS is genuine; the gate is loose.

## Confidence & caveats

Confidence: medium. The winner pick (mediabunny) is robust on the decision procedure — correctness is a true tie so perf decides, and 2.27x is a large, unambiguous margin that a single warm/cold run is unlikely to invert. Caveats: (1) both samples are n=1 with mad=0 (single measurement, no spread), so the magnitude is directional; (2) both results are cached, so they were not re-run this session; (3) peakMemory/targetWrites were not measured (n=0) and could not contribute to ranking; (4) the correctness gate is duration-only — neither engine's three-track layout was verified frame/PCM-exact or by per-track packet count, so "correct mux" here means "valid MKV of the right duration", not "every track byte/pixel verified".
