# Streaming output

> Scope: The streaming-output feature family: output-target behavior, fragmented and progressive ISO BMFF, fast-start modes, MPEG-TS write granularity, live WebM, first-byte latency, backpressure, and scale-dependent memory behavior.
> Phase-2 owner: p2_feature_streaming_output.

## Purpose

This family asks a narrower question than ordinary remuxing: not only whether an engine can produce a valid file, but how and when the bytes leave it. A correct implementation must preserve the coded media while honoring the requested sink contract, container layout, append/position semantics, and resource profile. A full-buffer implementation that eventually returns a playable file is not equivalent to a stream target that exposes usable bytes before finalization and remains bounded at gigabyte scale.

The family is therefore both a conformance surface and a benchmark surface. Conformance covers byte layout, media semantics, write trace, and runtime applicability. Benchmarking covers time to first byte, wall time, write count, output size, long tasks, and memory. Performance results are meaningful only after correctness passes, and only when the compared engines executed equivalent output modes.

This page records the executable behavior as it exists today and specifies the target behavior for later cleanup. Where comments in scenario files describe older machinery, the implementation in the runner, adapters, and oracle system is authoritative.

## As-built

### Family construction and registration

The family exports one array assembled from six sub-batteries: base, TTFB, fragmented/fast-start, TS/WebM live, size ladder, and metamorphic properties. The resulting 27 scenarios are registered under the streaming-output family in the global scenario map and are also lazy-loaded by the application registry. Every scenario uses the remux operation; the family changes the output shape while intending to preserve encoded samples. Family assembly [src/scenarios/streaming-output/index.ts:30-46](../../src/scenarios/streaming-output/index.ts#L30-L46), global registration [src/scenarios/index.ts:28-50](../../src/scenarios/index.ts#L28-L50), application registration [src/app/register.ts:123-126](../../src/app/register.ts#L123-L126).

The shared output-shape vocabulary is:

- container;
- target: buffer or stream;
- fragmented;
- fastStart: false, in-memory, or reserve;
- writeChunkBytes;
- maximumPacketCount;
- appendOnly.

The builder copies every defined knob into the remux options bag. It derives [capability tokens](../glossary.md#capability-token) for target writes, fragmented output, each fast-start mode, and headerless output, then declares the input/output containers and codecs required by the cell. The runner later forwards that complete option bag to the adapter. Shape and option forwarding [src/scenarios/streaming-output/_shared.ts:79-100](../../src/scenarios/streaming-output/_shared.ts#L79-L100), feature derivation [src/scenarios/streaming-output/_shared.ts:159-192](../../src/scenarios/streaming-output/_shared.ts#L159-L192), scenario construction [src/scenarios/streaming-output/_shared.ts:199-222](../../src/scenarios/streaming-output/_shared.ts#L199-L222), runner remux forwarding [src/core/runner.ts:721-730](../../src/core/runner.ts#L721-L730), operation dispatch [src/core/runner.ts:794-810](../../src/core/runner.ts#L794-L810).

Ordinary shape cases request wall time, real-time throughput, peak memory, target writes, output bytes, and long-task time. Their default oracle is reference-reimport. The builder additionally attaches mp4-box-layout to fragmented or explicit fast-start MP4/MOV and webm-live-layout to append-only WebM/MKV. Property cases instead use property-invariant by default and request only wall, peak memory, and long tasks. Metrics and default oracle [src/scenarios/streaming-output/_shared.ts:63-77](../../src/scenarios/streaming-output/_shared.ts#L63-L77), layout-oracle selection [src/scenarios/streaming-output/_shared.ts:128-152](../../src/scenarios/streaming-output/_shared.ts#L128-L152), property construction [src/scenarios/streaming-output/_shared.ts:251-282](../../src/scenarios/streaming-output/_shared.ts#L251-L282).

### Exported scenario inventory

Every exported scenario is listed below. “Current check” describes the executable oracle set, not aspirational comments.

| Scenario | Requested shape or property | Current check and ranking |
|---|---|---|
| streaming-output/mp4_buffer_target [src/scenarios/streaming-output/base.ts:23-32](../../src/scenarios/streaming-output/base.ts#L23-L32) | H.264/AAC MP4, explicit buffer, fastStart false | reference-reimport plus moov-after-mdat layout; default metric order |
| streaming-output/mp4_streaming_target [src/scenarios/streaming-output/base.ts:35-44](../../src/scenarios/streaming-output/base.ts#L35-L44) | H.264/AAC MP4, stream target | reference-reimport; requires target:writes |
| streaming-output/mp4_fragmented_cmaf [src/scenarios/streaming-output/base.ts:47-61](../../src/scenarios/streaming-output/base.ts#L47-L61) | H.264/AAC fragmented MP4 | reference-reimport plus top-level MP4 layout; requires fragmented |
| streaming-output/mp4_faststart_reserve [src/scenarios/streaming-output/base.ts:64-75](../../src/scenarios/streaming-output/base.ts#L64-L75) | MP4 reserve fast-start with maximumPacketCount 4096 | reference-reimport plus moov-before-mdat layout; requires fastStart:reserve |
| streaming-output/ts_tiny_writes [src/scenarios/streaming-output/base.ts:78-90](../../src/scenarios/streaming-output/base.ts#L78-L90) | MP4 to TS stream, requested 188-byte writes | reference-reimport; requires target:writes |
| streaming-output/webm_streaming_target [src/scenarios/streaming-output/base.ts:93-102](../../src/scenarios/streaming-output/base.ts#L93-L102) | VP9/Opus WebM stream target | reference-reimport; requires target:writes |
| streaming-output/mp4_ttfb_buffer_target [src/scenarios/streaming-output/ttfb.ts:35-48](../../src/scenarios/streaming-output/ttfb.ts#L35-L48) | MP4 buffer control | reference-reimport and explicit timeToFirstByte primary; unusually requires target:writes so buffer telemetry must exist |
| streaming-output/mp4_ttfb_streaming_target [src/scenarios/streaming-output/ttfb.ts:51-63](../../src/scenarios/streaming-output/ttfb.ts#L51-L63) | MP4 stream target | reference-reimport and explicit timeToFirstByte primary; requires target:writes through the shared builder |
| streaming-output/mp4_faststart_in_memory [src/scenarios/streaming-output/fragmented-faststart.ts:51-63](../../src/scenarios/streaming-output/fragmented-faststart.ts#L51-L63) | MP4 in-memory fast-start buffer | reference-reimport plus moov-before-mdat layout |
| streaming-output/mp4_faststart_none_control [src/scenarios/streaming-output/fragmented-faststart.ts:66-77](../../src/scenarios/streaming-output/fragmented-faststart.ts#L66-L77) | MP4 fastStart false control | reference-reimport plus mdat-before-moov layout |
| streaming-output/prop_frag_premise_decode_equality_mp4 [src/scenarios/streaming-output/fragmented-faststart.ts:88-102](../../src/scenarios/streaming-output/fragmented-faststart.ts#L88-L102) | Progressive MP4 buffer used as a premise for fragmented losslessness | platform-decode output frames versus baked source frames; it does not decode the fragmented output |
| streaming-output/prop_faststart_in_memory_duration_invariant [src/scenarios/streaming-output/fragmented-faststart.ts:105-118](../../src/scenarios/streaming-output/fragmented-faststart.ts#L105-L118) | In-memory fast-start duration | output duration versus golden, tolerance 0.125 s, plus MP4 layout |
| streaming-output/prop_faststart_reserve_duration_invariant [src/scenarios/streaming-output/fragmented-faststart.ts:121-135](../../src/scenarios/streaming-output/fragmented-faststart.ts#L121-L135) | Reserve fast-start duration | output duration versus golden, tolerance 0.125 s, plus MP4 layout |
| streaming-output/ts_continuity_many_writes [src/scenarios/streaming-output/ts-webm-live.ts:47-60](../../src/scenarios/streaming-output/ts-webm-live.ts#L47-L60) | TS stream with requested 188-byte writes | reference-reimport only; despite the name, no TS continuity oracle runs |
| streaming-output/webm_headerless_live_stream [src/scenarios/streaming-output/ts-webm-live.ts:63-77](../../src/scenarios/streaming-output/ts-webm-live.ts#L63-L77) | VP8/Opus append-only WebM | reference-reimport plus WebM live-layout oracle |
| streaming-output/prop_ts_stream_duration_materialized [src/scenarios/streaming-output/ts-webm-live.ts:83-95](../../src/scenarios/streaming-output/ts-webm-live.ts#L83-L95) | TS stream duration | property-invariant duration, tolerance 0.125 s |
| streaming-output/prop_webm_headerless_duration_materialized [src/scenarios/streaming-output/ts-webm-live.ts:98-110](../../src/scenarios/streaming-output/ts-webm-live.ts#L98-L110) | Headerless/live WebM duration | property-invariant duration plus WebM live layout |
| streaming-output/stream_large_h264_mp4 [src/scenarios/streaming-output/size-ladder.ts:44-56](../../src/scenarios/streaming-output/size-ladder.ts#L44-L56) | Large H.264/AAC MP4 stream | reference-reimport; peakMemory primary; 300 s timeout |
| streaming-output/stream_large_vp9_webm [src/scenarios/streaming-output/size-ladder.ts:60-70](../../src/scenarios/streaming-output/size-ladder.ts#L60-L70) | Large VP9/Opus WebM stream | reference-reimport; peakMemory primary; 300 s timeout |
| streaming-output/stream_huge_h264_mov_to_mp4 [src/scenarios/streaming-output/size-ladder.ts:74-87](../../src/scenarios/streaming-output/size-ladder.ts#L74-L87) | Huge MOV to MP4 stream | reference-reimport; peakMemory primary; 300 s timeout |
| streaming-output/stream_massive_h264_mp4 [src/scenarios/streaming-output/size-ladder.ts:91-104](../../src/scenarios/streaming-output/size-ladder.ts#L91-L104) | Massive MP4 stream | reference-reimport; peakMemory primary; 300 s timeout |
| streaming-output/buffer_massive_h264_mp4 [src/scenarios/streaming-output/size-ladder.ts:110-123](../../src/scenarios/streaming-output/size-ladder.ts#L110-L123) | Massive MP4 buffer contrast | reference-reimport; peakMemory primary; 300 s timeout |
| streaming-output/prop_decode_equals_buffer_shape [src/scenarios/streaming-output/metamorphic.ts:34-45](../../src/scenarios/streaming-output/metamorphic.ts#L34-L45) | Progressive buffer remux decode equality | platform-decode output frames versus baked source frames |
| streaming-output/prop_decode_equals_stream_shape [src/scenarios/streaming-output/metamorphic.ts:48-61](../../src/scenarios/streaming-output/metamorphic.ts#L48-L61) | Progressive stream remux decode equality | platform-decode output frames versus baked source frames; requires target:writes and streaming:decode-equality |
| streaming-output/prop_probe_dur_buffer_shape [src/scenarios/streaming-output/metamorphic.ts:66-75](../../src/scenarios/streaming-output/metamorphic.ts#L66-L75) | Buffer remux duration | output duration versus golden, tolerance 0.125 s, plus MP4 layout because fastStart is false |
| streaming-output/prop_probe_dur_stream_shape [src/scenarios/streaming-output/metamorphic.ts:78-89](../../src/scenarios/streaming-output/metamorphic.ts#L78-L89) | Stream remux duration | output duration versus golden, tolerance 0.125 s |
| streaming-output/prop_probe_dur_fragmented_shape [src/scenarios/streaming-output/metamorphic.ts:92-106](../../src/scenarios/streaming-output/metamorphic.ts#L92-L106) | Fragmented MP4 duration | output duration versus golden, tolerance 0.125 s, plus top-level MP4 layout |

### Current output and measurement path

An adapter must still return a complete MediaBytes object containing a contiguous Uint8Array. It may optionally attach targetWrites and firstByteMs. The runner performs a fresh remux for every benchmark sample, copies output byte length and optional telemetry into MeasureContext, and Meter maps those values to the targetWrites and timeToFirstByte metrics. MediaBytes contract [src/core/engine.ts:28-39](../../src/core/engine.ts#L28-L39), benchmark sample wiring [src/core/runner.ts:1651-1692](../../src/core/runner.ts#L1651-L1692), metric mapping [src/core/bench.ts:30-49](../../src/core/bench.ts#L30-L49), Meter derivation [src/core/measure.ts:59-103](../../src/core/measure.ts#L59-L103).

The telemetry path is therefore implemented, contrary to older scenario comments. It is not uniformly implemented by adapters, however, and the relative clock is created inside each adapter rather than at the runner’s Meter.begin boundary.

- Mediabunny starts its telemetry clock when it creates the output target. For a stream it records each positioned chunk, then allocates and reconstructs the complete output after close; for a buffer it assigns firstByteMs only when retrieving the final buffer. Mediabunny target instrumentation [src/engines/mediabunny/adapter.ts:765-847](../../src/engines/mediabunny/adapter.ts#L765-L847). The remux opens its input before creating that target, so its reported first-byte interval excludes at least the input-open work. Mediabunny remux ordering [src/engines/mediabunny/adapter.ts:1251-1268](../../src/engines/mediabunny/adapter.ts#L1251-L1268).
- aibrush-media creates an append-only callback sink, rejects non-contiguous positions, stores every chunk, and concatenates the full result. Its explicit buffer telemetry reports one write and assigns first-byte time only after conversion. aibrush target instrumentation [src/engines/aibrush-media/adapter.ts:1741-1795](../../src/engines/aibrush-media/adapter.ts#L1741-L1795). The sink is created before the engine source and remux call, so its clock covers a different interval from Mediabunny. aibrush remux ordering [src/engines/aibrush-media/adapter.ts:4094-4110](../../src/engines/aibrush-media/adapter.ts#L4094-L4110).
- FFmpeg.wasm, MP4Box, and Remotion return complete bytes without write or first-byte telemetry. FFmpeg writes and reads MEMFS, MP4Box accumulates init/media fragments and concatenates them, and Remotion explicitly uses its in-memory buffer writer and Blob conversion. FFmpeg.wasm remux [src/engines/ffmpeg-wasm/adapter.ts:2031-2068](../../src/engines/ffmpeg-wasm/adapter.ts#L2031-L2068), MP4Box fragment accumulation [src/engines/mp4box/adapter.ts:905-943](../../src/engines/mp4box/adapter.ts#L905-L943), Remotion buffer writer [src/engines/remotion-webcodecs/adapter.ts:543-602](../../src/engines/remotion-webcodecs/adapter.ts#L543-L602).

The metric named peakMemory is a best-effort memory snapshot taken after the operation’s wall-clock interval ends. It tries measureUserAgentSpecificMemory, falls back to the Chromium-only performance.memory.usedJSHeapSize, and otherwise returns null; it does not sample throughout the operation or calculate a high-water mark. Meter end ordering [src/core/measure.ts:59-73](../../src/core/measure.ts#L59-L73), memory probe [src/core/measure.ts:169-200](../../src/core/measure.ts#L169-L200), bounded probe [src/core/measure.ts:202-233](../../src/core/measure.ts#L202-L233).

Missing numeric metrics are dropped from the sample set, but the benchmark still creates a summary with n=0 and zero-valued statistics. timeToFirstByte and targetWrites are lower-is-better metrics because only throughput and rate metrics are classified as higher-is-better. Finite-value filtering [src/core/bench.ts:91-124](../../src/core/bench.ts#L91-L124), empty summary behavior [src/core/bench.ts:127-150](../../src/core/bench.ts#L127-L150), metric direction [src/core/bench.ts:71-89](../../src/core/bench.ts#L71-L89).

### Current oracle behavior

The public result type has [PASS](../glossary.md#pass), [FAIL](../glossary.md#fail), [NA_ENGINE](../glossary.md#na-engine), [NA_BROWSER](../glossary.md#na-browser), [NA_ASSET](../glossary.md#na-asset), [ERROR](../glossary.md#error), and [SKIPPED](../glossary.md#skipped). There is no [DIFF](../glossary.md#diff), and each oracle outcome exposes only a boolean pass field. Result and oracle types [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221). The runner returns FAIL on any real false oracle outcome, PASS when at least one oracle passed and the rest are recognized asset gaps, and NA_ASSET when every outcome is unavailable. It benchmarks only PASS cells. Verdict reduction [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447), bench gating [src/core/runner.ts:1445-1463](../../src/core/runner.ts#L1445-L1463).

For a remux, reference-reimport does not currently call Mediabunny or another scored engine. It uses a dependency-free byte reader for MP4/WebM, compares media-track type counts, conditionally compares canonicalized codec tokens, and compares duration with a widened minimum tolerance. If none of those checks can run, it returns an unavailable outcome. Remux reference-reimport [src/core/oracles.ts:1299-1348](../../src/core/oracles.ts#L1299-L1348), semantic comparison [src/core/oracles.ts:1350-1442](../../src/core/oracles.ts#L1350-L1442). The byte reader handles only MP4/MOV-family and WebM/MKV-family structures; it does not structurally read TS. Byte-reader dispatch [src/core/box-readers.ts:1006-1031](../../src/core/box-readers.ts#L1006-L1031). Consequently, the two TS shape scenarios whose only oracle is reference-reimport have no TS structural or continuity verdict; their oracle becomes unavailable rather than proving the claim in their names.

The basic codec normalizer already maps avc1/avc3 to h264, hev1/hvc1 to hevc, mp4a to aac, and Matroska V_MPEG4/ISO/AVC to h264. Track counts are compared by type, but multiple tracks of the same type are still compared by ordinal within that type. Codec canonicalization [src/core/box-readers.ts:46-117](../../src/core/box-readers.ts#L46-L117), track comparison [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375).

The MP4 layout oracle parses only top-level boxes. Fragmented output passes when it has moov, a later moof, and an mdat after that moof. Fast-start modes pass solely on moov/mdat order. It does not inspect ftyp/styp brands, mvex, traf, tfdt, trun sample coverage, relative addressing, parameter-set availability, edit lists, or actual MSE appendability. MP4 layout checks [src/core/oracles.ts:491-551](../../src/core/oracles.ts#L491-L551), top-level parser [src/core/oracles.ts:554-580](../../src/core/oracles.ts#L554-L580).

The WebM live-layout oracle requires an unknown-size Segment, no SeekHead, no Segment Duration, and at least one Cluster. It counts Cues but does not reject them, and it does not prove incremental parser or MSE consumption. WebM live checks [src/core/oracles.ts:611-660](../../src/core/oracles.ts#L611-L660).

The property-invariant decode branch decodes the authored output with the platform path and compares its frame digests with baked source frames. The duration branch reads MP4/WebM structure, then falls back to a platform-decoded frame span or a simple PCM parser; it returns unavailable if none works. Property decode branch [src/core/oracles.ts:2774-2795](../../src/core/oracles.ts#L2774-L2795), property duration branch [src/core/oracles.ts:2797-2847](../../src/core/oracles.ts#L2797-L2847). That makes progressive MP4 coverage useful but does not prove fragmented MP4, TS, or live WebM appendability across browsers.

The shared golden packet comparator is not attached directly to these remux rows, but it is relevant to any future packet-preservation oracle. It requires exact packet count, track-index layout, packet size, and keyframe flags, with only timestamp origin/tolerance normalization. Packet comparator [src/core/oracles.ts:835-926](../../src/core/oracles.ts#L835-L926), golden-packets dispatch [src/core/oracles.ts:972-984](../../src/core/oracles.ts#L972-L984). Its built-in packet reader deliberately returns unavailable for fragmented MP4, unknown-size WebM clusters, lacing, B-frame reorder, and containers outside MP4/WebM. MP4 packet-reader limit [src/core/box-readers.ts:798-824](../../src/core/box-readers.ts#L798-L824), WebM packet-reader limit [src/core/box-readers.ts:882-935](../../src/core/box-readers.ts#L882-L935), packet dispatch contract [src/core/box-readers.ts:1033-1058](../../src/core/box-readers.ts#L1033-L1058).

### Adapter reach for this family

The repository pins Mediabunny 1.48.0, FFmpeg.wasm 0.12.15 with core 0.12.10, Remotion 4.0.479, MP4Box 2.3.0, web-demuxer 4.0.0, and the local aibrush-media package. Dependency versions [package.json:28-38](../../package.json#L28-L38).

| Engine | Declared reach relevant here | Executed behavior and limitation |
|---|---|---|
| Mediabunny | remux; MP4/MOV/WebM/MKV/TS output; fragmented, all three fast-start tokens, target:writes, headerless, streaming decode equality | Maps fragmented and fast-start options to its output format and uses StreamTarget or BufferTarget telemetry. Stream output is nevertheless retained and reconstructed in memory. Reserve remux first prepares tracks and goes through mux; the scenario’s maximumPacketCount 4096 is not passed through, because each track instead receives its actual chunk count. Unsupported output/codec cases throw ordinary Error rather than a family-wide NotApplicableError contract. Capabilities [src/engines/mediabunny/adapter.ts:1029-1090](../../src/engines/mediabunny/adapter.ts#L1029-L1090), format mapping [src/engines/mediabunny/adapter.ts:180-198](../../src/engines/mediabunny/adapter.ts#L180-L198), reserve remux [src/engines/mediabunny/adapter.ts:1251-1268](../../src/engines/mediabunny/adapter.ts#L1251-L1268), track reservation [src/engines/mediabunny/adapter.ts:1517-1549](../../src/engines/mediabunny/adapter.ts#L1517-L1549) |
| aibrush-media | remux; the family’s containers and feature tokens; typed runtime NA support | Uses typed NotApplicableError for known target/scale misses and instrumented sinks. It silently resolves reserve and in-memory fast-start to the same boolean moov-first mode, automatically fragments most ISO BMFF stream targets, and does not consume writeChunkBytes. Stream telemetry still concatenates the output. NA mapping [src/engines/aibrush-media/adapter.ts:92-159](../../src/engines/aibrush-media/adapter.ts#L92-L159), shape mapping [src/engines/aibrush-media/adapter.ts:3030-3072](../../src/engines/aibrush-media/adapter.ts#L3030-L3072), declared features [src/engines/aibrush-media/adapter.ts:3752-3861](../../src/engines/aibrush-media/adapter.ts#L3752-L3861), remux mode selection [src/engines/aibrush-media/adapter.ts:4064-4113](../../src/engines/aibrush-media/adapter.ts#L4064-L4113) |
| FFmpeg.wasm | remux; fragmented, streaming decode equality, and the three fast-start tokens; no target:writes or headerless | Runs a whole-file MEMFS remux. Fragmented uses movflags, while both reserve and in-memory collapse to +faststart; reserve is therefore only a final moov-first approximation. Target, writeChunkBytes, and maximumPacketCount are ignored, and stream/TTFB rows are rejected by the feature gate. Feature list [src/engines/ffmpeg-wasm/adapter.ts:1480-1518](../../src/engines/ffmpeg-wasm/adapter.ts#L1480-L1518), remux flags and returned bytes [src/engines/ffmpeg-wasm/adapter.ts:2031-2068](../../src/engines/ffmpeg-wasm/adapter.ts#L2031-L2068) |
| Remotion | Composite parser plus WebCodecs writer; remux output supports MP4/WebM/WAV but none of this family’s streaming tokens | The composite delegates remux to remotion-webcodecs. That adapter accepts only the container at its public remux boundary, ignores extra shape knobs structurally, uses bufferWriter, saves a Blob, and returns complete bytes. The separately exposed remotion-media-parser is read-only and declares no output operation. Composite delegation [src/engines/remotion/adapter.ts:71-118](../../src/engines/remotion/adapter.ts#L71-L118), writer capabilities [src/engines/remotion-webcodecs/adapter.ts:223-262](../../src/engines/remotion-webcodecs/adapter.ts#L223-L262), remux boundary [src/engines/remotion-webcodecs/adapter.ts:462-474](../../src/engines/remotion-webcodecs/adapter.ts#L462-L474), buffer conversion [src/engines/remotion-webcodecs/adapter.ts:543-602](../../src/engines/remotion-webcodecs/adapter.ts#L543-L602), parser read-only declaration [src/engines/remotion-media-parser/adapter.ts:179-214](../../src/engines/remotion-media-parser/adapter.ts#L179-L214) |
| MP4Box | MP4/MOV input to fragmented MP4 output; fragmented token only | Exactly two family cells can negotiate on declared shape: the fragmented shape and fragmented duration property. The adapter uses setSegmentOptions, initializeSegmentation, onSegment, then concatenates init and all media fragments into one output buffer; it exposes no target telemetry. Capabilities [src/engines/mp4box/adapter.ts:630-680](../../src/engines/mp4box/adapter.ts#L630-L680), fragmenter [src/engines/mp4box/adapter.ts:905-943](../../src/engines/mp4box/adapter.ts#L905-L943) |
| web-demuxer | No output container and no remux operation | Every streaming-output cell is NA_ENGINE at the operation or output-container gate. Read-only capabilities [src/engines/web-demuxer/adapter.ts:618-665](../../src/engines/web-demuxer/adapter.ts#L618-L665) |

The [capability gate](../glossary.md#capability-gate) checks each declared operation, container, codec, encryption token, and feature independently. It does not prove the requested tuple as a combination. Per-token negotiation [src/core/runner.ts:113-190](../../src/core/runner.ts#L113-L190). Once an operation starts, an error named NotApplicableError becomes NA_ENGINE; timeouts become FAIL; other adapter errors become ERROR. Runtime error mapping [src/core/runner.ts:686-693](../../src/core/runner.ts#L686-L693), operation verdicts [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393), outer error mapping [src/core/runner.ts:1464-1468](../../src/core/runner.ts#L1464-L1468).

### Fixture and scale state

The workhorse H.264/AAC MP4 is 31,258,790 bytes, and the VP9/Opus WebM is 9,293,670 bytes. The captured recorder-style WebM is also present with checksum and byte length. Baseline MP4 [fixtures/manifest.json:6-18](../../fixtures/manifest.json#L6-L18), baseline WebM [fixtures/manifest.json:158-170](../../fixtures/manifest.json#L158-L170), live WebM [fixtures/manifest.json:512-525](../../fixtures/manifest.json#L512-L525).

All four long-form assets used by the size ladder are manifest-populated, despite stale comments that describe them as pending: large MP4 89,573,913 bytes, large WebM 102,363,592 bytes, huge MOV 447,748,594 bytes, and massive MP4 1,144,401,376 bytes. Large assets [fixtures/manifest.json:600-627](../../fixtures/manifest.json#L600-L627), huge MOV [fixtures/manifest.json:630-642](../../fixtures/manifest.json#L630-L642), massive MP4 [fixtures/manifest.json:692-704](../../fixtures/manifest.json#L692-L704).

The only disabled cell specific to this family is Remotion’s massive buffer row, recorded as a tracked timeout. Its paired massive stream row already negotiates NA_ENGINE because Remotion does not declare target:writes. Disabled cell [src/core/disabled-cells.ts:113-119](../../src/core/disabled-cells.ts#L113-L119).

## Contracts and invariants

The following are the present executable contracts unless explicitly marked “target.”

1. **Stable identity.** Every cell is namespaced as streaming-output/name, derives family from that prefix, declares at least one required operation and one oracle, and participates in the global duplicate-ID guard. Scenario validation [src/core/scenario.ts:183-204](../../src/core/scenario.ts#L183-L204), registry uniqueness [src/scenarios/index.ts:49-60](../../src/scenarios/index.ts#L49-L60).

2. **Lossless operation intent.** Every family cell dispatches to engine.remux with the full options object. No cell asks this family to transcode. This is an intent expressed by the scenario operation; current oracles do not yet prove coded-sample identity for every container shape. Builders [src/scenarios/streaming-output/_shared.ts:199-222](../../src/scenarios/streaming-output/_shared.ts#L199-L222), dispatch [src/core/runner.ts:794-810](../../src/core/runner.ts#L794-L810).

3. **Preflight applicability.** A missing operation, container, codec, or feature token produces NA_ENGINE before initialization or execution. Browser codec gating is skipped for remux-copy operations. This preflight is per token, not per combination. Negotiation order [src/core/runner.ts:124-190](../../src/core/runner.ts#L124-L190), remux browser-gate exception [src/core/runner.ts:209-218](../../src/core/runner.ts#L209-L218).

4. **Shape request.** The runner must not strip container, target, fragmented, fastStart, writeChunkBytes, maximumPacketCount, appendOnly, or invariant from a remux request. The builder and runner currently uphold this forwarding contract. Adapters are not yet required to acknowledge or reject every field. Option assembly [src/scenarios/streaming-output/_shared.ts:159-168](../../src/scenarios/streaming-output/_shared.ts#L159-L168), runner option accessor [src/core/runner.ts:721-730](../../src/core/runner.ts#L721-L730).

5. **Target observability.** A stream target or explicit write granularity requires target:writes. The TTFB buffer control also explicitly requires target:writes. A declared engine is therefore promising that the requested output path exposes write telemetry, although the type currently carries only count and first-byte delay. Feature derivation [src/scenarios/streaming-output/_shared.ts:171-192](../../src/scenarios/streaming-output/_shared.ts#L171-L192), TTFB cases [src/scenarios/streaming-output/ttfb.ts:33-64](../../src/scenarios/streaming-output/ttfb.ts#L33-L64).

6. **MP4 final layout.** Explicit in-memory/reserve fast-start requires moov before mdat; false requires mdat before moov. Fragmented requires moov before a moof and an mdat after that moof. These are final-byte checks only; they do not distinguish the write algorithms that produced the bytes. Layout oracle [src/core/oracles.ts:491-551](../../src/core/oracles.ts#L491-L551).

7. **WebM live final layout.** appendOnly requires an unknown-size Segment, no SeekHead, no Segment Duration, and at least one Cluster. Current code does not make absence of Cues an invariant. Live-layout oracle [src/core/oracles.ts:611-660](../../src/core/oracles.ts#L611-L660).

8. **Duration properties.** The five explicit MP4/TS duration cases that supply a tolerance use 0.125 seconds. The live-WebM property relies on the oracle’s derived band. The oracle may obtain duration from a structural reader, decoded-frame span, or simple audio parser. Fast-start tolerances [src/scenarios/streaming-output/fragmented-faststart.ts:105-135](../../src/scenarios/streaming-output/fragmented-faststart.ts#L105-L135), TS tolerance [src/scenarios/streaming-output/ts-webm-live.ts:83-95](../../src/scenarios/streaming-output/ts-webm-live.ts#L83-L95), shape tolerances [src/scenarios/streaming-output/metamorphic.ts:64-106](../../src/scenarios/streaming-output/metamorphic.ts#L64-L106), duration implementation [src/core/oracles.ts:2797-2847](../../src/core/oracles.ts#L2797-L2847).

9. **Correctness before performance.** Only a PASS cell is benchmarked. A correctness timeout is FAIL; a benchmark timeout preserves PASS but omits the number. Metrics absent from every measured sample produce n=0 and must not be interpreted as a measured zero. Runner gating [src/core/runner.ts:1382-1463](../../src/core/runner.ts#L1382-L1463), empty summary [src/core/bench.ts:127-150](../../src/core/bench.ts#L127-L150).

10. **Current complete-byte return.** Even a stream-target adapter must return the materialized complete output in MediaBytes.bytes so the current oracle interface can inspect it. This makes the present streaming path unsuitable as proof of bounded output memory. MediaBytes [src/core/engine.ts:28-39](../../src/core/engine.ts#L28-L39), oracle context use [src/core/oracles.ts:491-501](../../src/core/oracles.ts#L491-L501).

11. **Runtime unsupported mapping.** An adapter that discovers a supported-token but unsupported tuple must throw an Error whose name is NotApplicableError to obtain NA_ENGINE. Ordinary Error means ERROR, not NA_ENGINE. aibrush follows this for many output-shape and scale cases; the other write adapters do so inconsistently. Runner recognition [src/core/runner.ts:686-693](../../src/core/runner.ts#L686-L693), aibrush implementation [src/engines/aibrush-media/adapter.ts:92-159](../../src/engines/aibrush-media/adapter.ts#L92-L159).

12. **Target verdict invariant.** The future oracle algebra must be three-way: PASS for a correct result meeting the scenario’s semantic and behavioral contract, DIFF for a valid result whose legal representation differs from the FFmpeg-baked golden, and FAIL for a truly wrong result. A mandatory sink behavior such as reserve-mode positioned writes is part of correctness: producing a valid moov-first file through a different algorithm is not merely a representation DIFF for a reserve-specific scenario.

## Target design and known gaps

### Target design

#### Three-way oracle algebra

Replace OracleOutcome.pass with an explicit oracle verdict: PASS, DIFF, or FAIL, while retaining the existing NA categories at the cell level.

- **PASS** means the output is valid, preserves the intended media, and satisfies every behavior explicitly requested by the scenario.
- **DIFF** means the output is valid and semantically equivalent but uses a legal representation different from the FFmpeg-baked golden: for example Annex B versus length-prefixed AVC, in-band versus out-of-band parameter sets, or a different legal NAL/access-unit grouping.
- **FAIL** means the media, container, timestamps, required output mode, or sink behavior is wrong.

Reducer precedence should be FAIL over DIFF over PASS. A DIFF cell is correctness-eligible but must be visually and machine-readably distinct, and representation-sensitive performance comparisons should group only like modes. Do not turn an unsupported combination into DIFF: it is NA_ENGINE. Do not turn a required behavioral-mode miss into DIFF: it is FAIL.

#### Split correctness into four independent layers

Every streaming-output cell should produce four structured outcomes:

1. **Applicability:** the complete operation × input container/codecs × output container × mode/options tuple is either accepted or NA_ENGINE.
2. **Sink trace:** ordered write events with absolute timestamp, position, length, cumulative unique bytes, outstanding write promises, and finalize/close timestamps.
3. **Container validity:** a format-specific parser checks the requested layout and standards constraints.
4. **Media semantics:** tracks, coded timing, duration, and decode equivalence are checked independently of incidental packet representation.

The runner should retain only a bounded validation prefix, rolling hash, structural events, and optional sampled fragments during scale benchmarks. A separate correctness run may materialize the complete output where necessary; the measured streaming run must be allowed to use a discard, file, or hash sink so measurement does not defeat streaming.

#### Canonical semantic comparison

Any metadata comparison used by this family should share one canonicalizer:

- avc1 and avc3 map to h264;
- hev1 and hvc1 map to hevc;
- V_MPEG4/ISO/AVC maps to h264;
- mp4a maps to aac;
- tracks match by media type and stable semantic identity, not global or within-type index;
- HE-AAC/SBR base-rate versus doubled output-rate descriptions compare equal;
- Parametric Stereo one-channel versus two-channel descriptions compare equal;
- VFR and NTSC frame rates use explicit bands rather than exact decimals;
- duration tolerances account for edit lists, codec priming/padding, and timebase rounding.

The current reference re-import already provides the first codec mappings and media-type counts, so this target extends rather than replaces that work. The [W3C ISO BMFF byte-stream note](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments) explicitly requires user agents to honor edit lists in initialization segments, which is why edit-list duration/origin differences must be normalized before declaring failure.

#### Fragmented MP4 and CMAF

A fragmented-MP4 target should produce and validate an initialization segment and a sequence of independently bounded media segments. Required checks should include:

- ftyp compatibility and a moov containing mvex in the initialization segment;
- optional styp followed by one moof and one or more mdat boxes per media segment;
- at least one traf per moof;
- tfdt on every traf;
- movie-fragment-relative addressing;
- complete trun-to-mdat sample coverage with bounds checks;
- parameter sets available either in the last initialization segment or in-band where permitted;
- monotonic decode timeline per track, edit-list application, and random-access signaling;
- actual append through MediaSource/SourceBuffer when the browser exposes the relevant MIME/codec combination.

These are the concrete append requirements in the [W3C ISO BMFF Byte Stream Format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#media-segments). A row named CMAF should additionally verify brands and constraints from [ISO/IEC 23000-19:2024](https://www.iso.org/standard/85623.html), not equate any file containing moof with CMAF.

MP4Box’s segmentation API is a suitable source of real init/media segment boundaries; its official documentation exposes setSegmentOptions, initializeSegmentation, and onSegment rather than requiring concatenation first. [MP4Box segmentation API](https://github.com/gpac/mp4box.js/#segmentation).

#### Progressive and fast-start modes

Keep three distinct MP4 contracts:

- **fastStart false:** mdat precedes moov; append-only production is allowed only if the format/mode truly supports it.
- **fastStart in-memory:** moov precedes mdat, with bulk emission at or after finalization acceptable; memory cost is part of the measured mode.
- **fastStart reserve:** the sink trace must show a forward reservation followed by one or more positioned patches, and every track’s requested maximumPacketCount must be honored. Add exact-fit, under-fill, and overflow cases; overflow must be a bounded, classified failure rather than silent fallback.

Final moov placement alone cannot identify these algorithms. Mediabunny’s documented modes explicitly distinguish in-memory buffering from reserved space and require per-track maximumPacketCount for reserve. [Mediabunny MP4 output modes](https://mediabunny.dev/guide/output-formats#mp4). FFmpeg likewise distinguishes +faststart’s second pass from moov_size reservation, with insufficient reservation defined to fail. [FFmpeg MOV/MP4 options](https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv).

When a generic stream target permits either progressive or fragmented MP4, record the resolved representation. Either split the scenarios by representation or report a legal alternate as DIFF; do not rank progressive and fragmented implementations as if they performed the same packaging work.

#### MPEG-TS write and continuity contract

Separate transport validity from sink write granularity:

- The byte stream must consist of complete 188-byte TS packets with valid sync bytes.
- Validate PAT and PMT, a single program, complete PSI/PES sections, PTS presence, PCR before media payload, and transport_error_indicator.
- Validate continuity_counter independently per PID, including wrap, adaptation-only packets, duplicate-packet rules, null PID, and discontinuity_indicator exceptions.
- Add a PTS/DTS 33-bit rollover fixture and continuity check.
- Independently assert the requested write trace. For writeChunkBytes 188, every non-final sink write must contain exactly one TS packet and the final write must also be a complete packet. A valid TS stream written in larger chunks is a format PASS but a behavioral FAIL for this explicit scenario.

The 188-byte and segment requirements are specified by the [W3C MPEG-2 TS Byte Stream Format](https://www.w3.org/TR/mse-byte-stream-format-mp2t/), while continuity-counter exceptions come from [ITU-T H.222.0](https://www.itu.int/rec/T-REC-H.222.0/en). For HLS-oriented segment checks, [RFC 8216 section 3.2](https://datatracker.ietf.org/doc/html/rfc8216#section-3.2) requires PAT/PMT in each TS segment unless an initialization map applies.

#### Live WebM contract

For a continuous live Matroska/WebM stream, require an unknown-size Segment, prohibit SeekHead and Cues, omit a finalized Segment Duration, preserve ordered Clusters, and prove incremental consumption. [RFC 9559 section 23.2](https://www.rfc-editor.org/rfc/rfc9559.html#section-23.2) defines the unknown-size live Segment and forbids SeekHead/Cues for continuous segments. The [W3C WebM byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-webm/) defines an initialization segment followed by Cluster media segments.

The oracle should feed the initialization bytes and each Cluster to MSE when supported, and should also run a dependency-free incremental parser so NA_BROWSER does not erase structural coverage. It must verify that the append-only sink positions are exactly cumulative. Cues in a continuous live stream are a FAIL, not an ignored measurement.

#### TTFB measurement contract

Define time to first byte as:

> timestamp of the first non-empty sink write accepted by the observer minus the runner’s measured operation start.

The runner must own the shared monotonic origin. Adapters should emit absolute write events or invoke a runner-supplied observer; they should not start independent relative clocks. The contract must state whether input opening is included. For this suite it should be included, because executeOp begins after Meter.begin and an end user cannot receive output before source setup.

For a stream target, first-byte time must precede finalize completion and be based on a real sink event. For a buffer target, use the first externally observable finalized buffer, not an internal muxer write. Require non-empty output, n greater than zero, and a recorded first-write event before ranking. Report n=0 as unavailable, never zero milliseconds.

TTFB comparisons should be paired within the same engine, browser, fixture, output representation, warmup policy, and run. Report both absolute time and first-byte/wall ratio. Cross-engine winners remain secondary because engines may include different source-open and fragment policies.

#### Bounded memory and backpressure

A real streaming benchmark must not retain or reconstruct the whole output. Use a slow asynchronous WritableStream sink with a small high-water mark, rolling hash, byte count, and bounded structural window. Record maximum queued bytes, maximum in-flight writes, and whether each returned write promise was awaited. The [WHATWG Streams Standard](https://streams.spec.whatwg.org/#ws-model) defines write algorithms as promise-returning and supplies backpressure through queue state; a sink that ignores those promises is not conformant to this benchmark.

Sample memory throughout the operation and report a delta/high-water distribution, not a single post-operation snapshot. Separate source cache, engine working set, output queue, and validation materialization where possible. At minimum report:

- baseline before source open;
- periodic current-memory samples;
- high-water sample and timestamp;
- memory after finalize and after adapter disposal;
- queued-but-not-written bytes;
- output bytes retained by the harness.

The massive stream row should demonstrate output-memory growth bounded by configured queue/fragment size rather than by total file size. The massive buffer row should remain the explicit full-materialization contrast. Mediabunny’s own guide describes BufferTarget as inappropriate for large files and StreamTarget as small positioned chunks with backpressure, which is the behavioral distinction this suite should measure. [Mediabunny output targets](https://mediabunny.dev/guide/writing-media-files#streamtarget).

#### Tuple-aware applicability

Keep the coarse declaration gate as a cheap preflight, but require an adapter-side runtime check of the full tuple:

> operation × source container × source track codecs × target container × target mode × fragmented/fast-start/append-only options × scale limit.

When that tuple is unsupported, the adapter must throw NotApplicableError and the runner must record NA_ENGINE. This is especially important for Mediabunny, Remotion, remotion-media-parser, and option combinations that their flat declarations cannot express. Ignoring writeChunkBytes, maximumPacketCount, target, or appendOnly is forbidden: either honor the option or return NA_ENGINE before producing output.

Use typed NotApplicableError rather than message matching, preserve malformed-input errors as real failures, and include a stable reason code such as unsupported-output-mode, unsupported-container-codec-tuple, unsupported-target-observer, or verified-scale-cap. As this runtime contract matures, delete disabled cells that merely encode unsupported tuples; retain a disabled cell only for an intentionally excluded but otherwise applicable workload, with evidence.

### Known gaps

#### 1. Boolean verdicts conflate representation differences with corruption

- **Current:** OracleOutcome has only pass true/false, and any non-gap false becomes cell FAIL.
- **Consequence:** A legal output representation can be reported identically to dropped samples, invalid timestamps, or malformed bytes.
- **Target:** Introduce PASS/DIFF/FAIL and the reducer described above. Representation-specific diagnostics must preserve DIFF through JSON and UI.
- **Verification:** Run paired fixtures whose elementary media is identical but whose AVC carriage is Annex B versus length-prefixed with out-of-band configuration; both must decode and preserve timing, one may be DIFF, neither may be FAIL solely for size/grouping. The [AVC WebCodecs registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/) describes these two legal chunk/configuration forms.

#### 2. Reference re-import does not cover the family’s advertised formats

- **Current:** Remux reference-reimport structurally reads MP4/WebM only. TS shape rows with no other oracle receive no TS verdict; fragmented and live forms receive only what the limited structure readers can recover.
- **Consequence:** A scenario named TS continuity can finish as unavailable without checking a continuity counter, PAT, PMT, PCR, or PES boundary.
- **Target:** Add independent TS, fragmented-ISO BMFF, and incremental-WebM readers, each producing structured semantic facts. Keep engine implementations out of the scoring oracle.
- **Verification:** Corrupt one fact at a time—TS continuity, missing PMT, trun beyond mdat, missing tfdt, live WebM Cues—and prove deterministic FAIL while legal alternate representations remain PASS or DIFF.

#### 3. Fragmented MP4 validation is top-level only

- **Current:** moov + later moof + later mdat passes.
- **Consequence:** Invalid brands, absent traf/tfdt, bad data offsets, missing parameter sets, incomplete sample coverage, or non-appendable fragments can pass.
- **Target:** Implement the ISO BMFF/CMAF checks and MSE append probe above.
- **Verification:** Maintain a mutation suite for every W3C append-error condition and one conforming CMAF fixture per supported codec combination.

#### 4. Golden packet exactness is not representation-fair

- **Current:** The shared comparator requires exact packet counts, sizes, keyframe flags, and track-index layout. The streaming family does not attach golden-packets directly today, but any reuse would inherit those rules.
- **Consequence:** Annex B versus AVCC, inline SPS/PPS, legal parameter-set relocation, and different NAL/access-unit grouping can appear wrong even when decoded media and timing are valid.
- **Target:** Treat exact packet bytes/counts/sizes as diagnostics. Normalize AVC/HEVC carriage and compare access-unit timing, decoded content, random-access semantics, and parameter-set availability. Legal noncanonical grouping becomes DIFF; missing media or invalid decode remains FAIL.
- **Verification:** Repackage one H.264 source through both Annex B and AVCC paths with in-band and out-of-band SPS/PPS variants; assert equal decoded frames/timeline and non-FAIL verdicts.

#### 5. Final moov order cannot prove reserve or in-memory behavior

- **Current:** Both fast-start modes pass on moov-before-mdat. FFmpeg maps both to +faststart; aibrush maps both to one boolean faststart; Mediabunny replaces the scenario’s packet ceiling with actual track chunk counts.
- **Consequence:** Engines can claim reserve support without reserving, patching, respecting the bound, or exercising overflow.
- **Target:** Make the write trace and requested maximumPacketCount part of the oracle. Separate final-layout conformance from algorithm conformance.
- **Verification:** Assert positioned reserve/patch events, exact bound propagation, successful under-fill, and bounded overflow failure for every adapter declaring fastStart:reserve.

#### 6. writeChunkBytes is forwarded but not honored

- **Current:** The builder and runner preserve writeChunkBytes, yet no adapter consumes it. Mediabunny exposes an onPacket callback capable of observing 188-byte TS packets in the upstream API, but the adapter uses only generic StreamTarget writes.
- **Consequence:** ts_tiny_writes and ts_continuity_many_writes can execute with arbitrary sink chunking while their names imply one-packet writes.
- **Target:** Add write-length events to the observer, implement or explicitly reject requested chunking, and keep transport packet validation separate from sink chunking.
- **Verification:** For a 188-byte request, every write must be exactly 188 bytes and begin with a valid TS sync byte; an adapter that cannot guarantee it must return NA_ENGINE.

#### 7. Live WebM accepts Cues and is not incrementally consumed

- **Current:** The oracle measures Cues but does not fail when present, and it inspects only the materialized final buffer.
- **Consequence:** A non-live indexed file can partially satisfy the live shape, and broken cluster-by-cluster delivery is invisible.
- **Target:** Enforce the RFC live constraints and consume the actual initialization/Cluster event sequence incrementally.
- **Verification:** A continuous stream containing Cues must FAIL; the same media as finite WebM may PASS its non-live row. A slow incremental parser/MSE consumer must accept every emitted Cluster without waiting for finalization.

#### 8. TTFB clocks and empty metrics are incomparable

- **Current:** Mediabunny starts after opening input; aibrush starts before source creation; buffer targets assign first-byte time at final retrieval; missing values become n=0 zero summaries.
- **Consequence:** The leaderboard can compare different intervals or display a synthetic zero as if it were an excellent latency.
- **Target:** One runner-owned origin, absolute write events, non-empty-write semantics, finalized-buffer semantics for controls, and rank exclusion for n=0.
- **Verification:** A trace must satisfy start ≤ firstWrite < finalize for stream and start ≤ finalize = firstObservableBuffer for buffer, within clock resolution. Deliberately omit telemetry and assert “unavailable,” never zero or winner.

#### 9. Current streaming adapters materialize the entire result

- **Current:** Mediabunny and aibrush store every chunk and allocate a contiguous copy; FFmpeg, MP4Box, and Remotion are also full-buffer paths. MediaBytes requires complete bytes.
- **Consequence:** peak-memory results measure harness reconstruction as well as engine output and cannot establish bounded streaming.
- **Target:** Introduce an observer/hash/file sink result for measured runs, decouple correctness artifact retention from benchmarking, and sample memory throughout.
- **Verification:** On the 1.144 GB fixture, retained output bytes and queued bytes must remain under a declared bound for stream mode; buffer mode must visibly scale with output size or cleanly report a verified runtime limit.

#### 10. “Peak” memory is a post-operation snapshot

- **Current:** Meter captures wall end, then calls one memory probe.
- **Consequence:** A mid-operation spike can be missed, while retained final bytes can dominate; the metric name overstates the measurement.
- **Target:** Periodic samples plus explicit baseline/high-water/delta fields. Rename the old field to endMemory if retained.
- **Verification:** Inject a controlled temporary allocation that is released before finalize; high-water must capture it while endMemory does not.

#### 11. Per-token capability declarations leak unsupported combinations

- **Current:** The gate proves individual tokens only. Some adapters ignore options or throw ordinary Error for runtime misses. aibrush already maps many capability misses to NotApplicableError, but coverage is not uniform.
- **Consequence:** Unsupported combinations become FAIL/ERROR or silently execute a different mode, and the hand-maintained disabled-cell list grows.
- **Target:** Require tuple-aware preflight/runtime NotApplicableError across adapters, especially Mediabunny and Remotion’s composite/webcodecs/parser layers; map it to NA_ENGINE with stable reason codes.
- **Verification:** Generate the Cartesian set of declared containers, codecs, and output modes. Every cell must be PASS/DIFF/FAIL only if attempted as requested, otherwise NA_ENGINE; no ignored option and no generic ERROR is acceptable for a capability miss.

#### 12. Scale comparisons do not yet isolate equivalent work

- **Current:** aibrush implicitly fragments most ISO BMFF stream targets, while other engines may use progressive output; validation and full-byte reconstruction differ by adapter. The massive Remotion buffer cell is skipped manually.
- **Consequence:** memory and TTFB rankings can compare different packaging work, source-open intervals, and output-retention strategies.
- **Target:** Split progressive-stream, fragmented-stream, and buffer modes; record resolved mode and observer policy in result metadata; pair within engine before cross-engine ranking; convert known unsupported scale tuples to runtime NA_ENGINE.
- **Verification:** Reports must refuse a winner comparison when resolved representation, retained-output policy, fixture, browser, or measurement contract differs.

## Sources

### Repository evidence

- Streaming-output shared builders [src/scenarios/streaming-output/_shared.ts:63-282](../../src/scenarios/streaming-output/_shared.ts#L63-L282) — output-shape vocabulary, features, oracles, metrics, and scenario construction.
- Streaming-output family index [src/scenarios/streaming-output/index.ts:30-46](../../src/scenarios/streaming-output/index.ts#L30-L46) — the six exported sub-batteries.
- Base scenarios [src/scenarios/streaming-output/base.ts:21-106](../../src/scenarios/streaming-output/base.ts#L21-L106), TTFB scenarios [src/scenarios/streaming-output/ttfb.ts:33-69](../../src/scenarios/streaming-output/ttfb.ts#L33-L69), fragmented/fast-start scenarios [src/scenarios/streaming-output/fragmented-faststart.ts:48-144](../../src/scenarios/streaming-output/fragmented-faststart.ts#L48-L144), TS/WebM live scenarios [src/scenarios/streaming-output/ts-webm-live.ts:45-119](../../src/scenarios/streaming-output/ts-webm-live.ts#L45-L119), size ladder [src/scenarios/streaming-output/size-ladder.ts:39-129](../../src/scenarios/streaming-output/size-ladder.ts#L39-L129), and metamorphic scenarios [src/scenarios/streaming-output/metamorphic.ts:25-112](../../src/scenarios/streaming-output/metamorphic.ts#L25-L112) — complete 27-scenario inventory.
- Scenario/result model [src/core/scenario.ts:145-221](../../src/core/scenario.ts#L145-L221) and MediaBytes [src/core/engine.ts:28-39](../../src/core/engine.ts#L28-L39) — current contracts and boolean oracle outcome.
- Runner negotiation [src/core/runner.ts:113-225](../../src/core/runner.ts#L113-L225), operation dispatch [src/core/runner.ts:721-830](../../src/core/runner.ts#L721-L830), verdict reduction [src/core/runner.ts:1331-1468](../../src/core/runner.ts#L1331-L1468), and benchmark samples [src/core/runner.ts:1640-1711](../../src/core/runner.ts#L1640-L1711) — applicability, error mapping, correctness gating, and measurement wiring.
- Metric protocol [src/core/bench.ts:30-150](../../src/core/bench.ts#L30-L150), Meter [src/core/measure.ts:13-103](../../src/core/measure.ts#L13-L103), and memory/I/O helpers [src/core/measure.ts:160-306](../../src/core/measure.ts#L160-L306) — metric fields, empty summaries, post-operation memory probe, and counting target.
- MP4/WebM layout oracles [src/core/oracles.ts:483-670](../../src/core/oracles.ts#L483-L670), packet comparison [src/core/oracles.ts:827-984](../../src/core/oracles.ts#L827-L984), reference re-import [src/core/oracles.ts:1299-1442](../../src/core/oracles.ts#L1299-L1442), and property invariants [src/core/oracles.ts:2708-2857](../../src/core/oracles.ts#L2708-L2857) — current correctness reach and gaps.
- Dependency-free output readers [src/core/box-readers.ts:1-121](../../src/core/box-readers.ts#L1-L121), packet-reader limits [src/core/box-readers.ts:798-950](../../src/core/box-readers.ts#L798-L950), and reader dispatch [src/core/box-readers.ts:1006-1058](../../src/core/box-readers.ts#L1006-L1058) — codec canonicalization and MP4/WebM-only coverage.
- Mediabunny adapter [src/engines/mediabunny/adapter.ts:765-847](../../src/engines/mediabunny/adapter.ts#L765-L847), aibrush-media adapter [src/engines/aibrush-media/adapter.ts:1649-1795](../../src/engines/aibrush-media/adapter.ts#L1649-L1795), FFmpeg.wasm adapter [src/engines/ffmpeg-wasm/adapter.ts:2031-2068](../../src/engines/ffmpeg-wasm/adapter.ts#L2031-L2068), MP4Box adapter [src/engines/mp4box/adapter.ts:905-943](../../src/engines/mp4box/adapter.ts#L905-L943), Remotion composite [src/engines/remotion/adapter.ts:71-118](../../src/engines/remotion/adapter.ts#L71-L118), Remotion WebCodecs writer [src/engines/remotion-webcodecs/adapter.ts:462-602](../../src/engines/remotion-webcodecs/adapter.ts#L462-L602), and web-demuxer capabilities [src/engines/web-demuxer/adapter.ts:618-665](../../src/engines/web-demuxer/adapter.ts#L618-L665) — engine-specific output behavior.
- Fixture manifest [fixtures/manifest.json:6-18](../../fixtures/manifest.json#L6-L18) and scale fixtures [fixtures/manifest.json:600-704](../../fixtures/manifest.json#L600-L704) — actual asset availability and sizes.
- Disabled cells [src/core/disabled-cells.ts:113-119](../../src/core/disabled-cells.ts#L113-L119) — the one family-specific manual skip.

### External authorities

- [ISO/IEC 14496-12:2026, ISO base media file format](https://www.iso.org/standard/85596.html) — current ISO BMFF structure and timing standard. Accessed 2026-07-16.
- [ISO/IEC 23000-19:2024, Common media application format](https://www.iso.org/standard/85623.html) — CMAF tracks, segmented media objects, profiles, and brands. Accessed 2026-07-16.
- [W3C ISO BMFF Byte Stream Format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/) — initialization/media segment and append-error requirements for MSE. Accessed 2026-07-16.
- [W3C MPEG-2 TS Byte Stream Format](https://www.w3.org/TR/mse-byte-stream-format-mp2t/) — complete TS packets/PES/sections, PAT/PMT, PCR/PTS, and rollover requirements. Accessed 2026-07-16.
- [W3C WebM Byte Stream Format](https://www.w3.org/TR/mse-byte-stream-format-webm/) — WebM initialization segment and Cluster media-segment model. Accessed 2026-07-16.
- [ITU-T H.222.0](https://www.itu.int/rec/T-REC-H.222.0/en) — MPEG-2 Systems transport packet and continuity-counter semantics. Accessed 2026-07-16.
- [RFC 8216, HTTP Live Streaming, section 3.2](https://datatracker.ietf.org/doc/html/rfc8216#section-3.2) — PAT/PMT and program constraints for TS segments. Accessed 2026-07-16.
- [RFC 9559, Matroska, section 23.2](https://www.rfc-editor.org/rfc/rfc9559.html#section-23.2) — continuous live Segment, unknown size, and prohibited seek/index elements. Accessed 2026-07-16.
- [WHATWG Streams Standard](https://streams.spec.whatwg.org/) — WritableStream promises, queues, and backpressure. Accessed 2026-07-16.
- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/) and [AVC WebCodecs Registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/) — encoded-chunk semantics and legal AVC Annex B/AVC configuration representations. Accessed 2026-07-16.
- [FFmpeg Formats Documentation](https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv) — MP4 fragmentation, +faststart, moov_size reservation, and CMAF movflags. Accessed 2026-07-16.
- [Mediabunny output formats](https://mediabunny.dev/guide/output-formats) and [writing media files](https://mediabunny.dev/guide/writing-media-files) — fast-start modes, append-only formats, StreamTarget positioned writes, chunking, and backpressure. These are current upstream docs; repository code and the pinned 1.48.0 package remain authoritative for this benchmark. Accessed 2026-07-16.
- [MP4Box.js segmentation documentation](https://github.com/gpac/mp4box.js/#segmentation) — setSegmentOptions, initialization segments, and emitted media fragments. Accessed 2026-07-16.
- [Remotion convertMedia](https://www.remotion.dev/docs/webcodecs/convert-media) — current upstream buffer/web-filesystem writer interface and deprecation/experimental status. The repository is pinned to 4.0.479. Accessed 2026-07-16.
