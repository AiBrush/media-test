# Mediabunny engine adapter

> Scope: The `mediabunny@1.48.0` integration—registration, declared and effective support, source/target lifecycles, operation semantics, WebCodecs boundary, telemetry, and adapter-specific verdict routing.
>
> Phase-2 owner: p2_engine_mediabunny.

## Purpose

The Mediabunny [`engine`](../glossary.md#engine) is the benchmark's pure-TypeScript [`adapter`](../glossary.md#adapter) for container parsing and writing, with Mediabunny's conversion layer driving browser [WebCodecs](../glossary.md#webcodecs) where encoded media must be decoded or encoded. It is intended to exercise native browser codecs without making container work itself browser-native, and to expose packet, decoded-frame, audio-sample, output-write, and metadata results in the benchmark's normalized contracts.

This page specifies the exact installed adapter, not Mediabunny in the abstract. A broad codec list does not establish that a particular operation × input container × input codec/configuration × transform × output container × output codec × track-count tuple works. The benchmark must distinguish that [`combinatorial support`](../glossary.md#combinatorial-support) question from malformed media, incorrect output, a browser missing an exact WebCodecs configuration, and a valid output whose representation differs from the ffmpeg-baked golden.

## As-built

### Identity, registration, version, and lifecycle

The application dynamically imports the engine registration and invokes it under the registry key `mediabunny` ([src/app/register.ts:32](../../src/app/register.ts#L32), [src/engines/mediabunny/register.ts:18](../../src/engines/mediabunny/register.ts#L18)). The factory constructs `MediabunnyEngine`; the instance identifies itself as `mediabunny@1.48.0`, including when the bare registry alias is used ([src/engines/mediabunny/register.ts:20](../../src/engines/mediabunny/register.ts#L20), [src/engines/mediabunny/adapter.ts:1017](../../src/engines/mediabunny/adapter.ts#L1017)). The generic registry retains a factory and scores/filter candidates from declared capabilities; it does not retain one shared adapter instance ([src/core/registry.ts:32](../../src/core/registry.ts#L32), [src/core/registry.ts:63](../../src/core/registry.ts#L63)).

Both manifest and lock data pin the same release:

| Evidence | Exact value |
|---|---|
| Application dependency | `"mediabunny": "1.48.0"` ([package.json:36](../../package.json#L36)) |
| Root lock dependency | `mediabunny: "1.48.0"` ([bun.lock:15](../../bun.lock#L15)) |
| Resolved package tuple | `mediabunny@1.48.0` ([bun.lock:356](../../bun.lock#L356)) |

The package identity also has a corresponding upstream [Mediabunny v1.48.0 release](https://github.com/Vanilagy/mediabunny/releases/tag/v1.48.0). All exact format-matrix claims below are based on that tag, not on an unpinned latest release.

`init()` dynamically imports Mediabunny and best-effort warms broad video/audio encode and decode probes; failures of the warmup probes are deliberately swallowed by `Promise.allSettled` ([src/engines/mediabunny/adapter.ts:1121](../../src/engines/mediabunny/adapter.ts#L1121)). Operations fail loudly if `init()` was not awaited ([src/engines/mediabunny/adapter.ts:1021](../../src/engines/mediabunny/adapter.ts#L1021)). `dispose()` only clears the namespace reference; each operation is responsible for disposing every `Input` it opens ([src/engines/mediabunny/adapter.ts:1136](../../src/engines/mediabunny/adapter.ts#L1136)). The static `configUsed` record says `webcodecs`, `streaming-lockstep`, automatic queue depth, no WASM threads, and a four-canvas pool ([src/engines/mediabunny/adapter.ts:146](../../src/engines/mediabunny/adapter.ts#L146)); only some of those labels correspond to observable machinery in this adapter.

### Declared capability surface

The adapter declares all nine `MediaEngine` operations: probe, demux, remux, transcode, decode, seek, trim, mux, and decrypt ([src/engines/mediabunny/adapter.ts:1029](../../src/engines/mediabunny/adapter.ts#L1029)). Its flat sets are:

| Dimension | Declared values | Evidence |
|---|---|---|
| Input containers | MP4, MOV, MKV, WebM, MPEG-TS, HLS, WAV, MP3, FLAC, Ogg, ADTS | [src/engines/mediabunny/adapter.ts:1042](../../src/engines/mediabunny/adapter.ts#L1042) |
| Output containers | The same except HLS | [src/engines/mediabunny/adapter.ts:1046](../../src/engines/mediabunny/adapter.ts#L1046) |
| Video codecs | H.264, HEVC, VP8, VP9, AV1 | [src/engines/mediabunny/adapter.ts:1049](../../src/engines/mediabunny/adapter.ts#L1049) |
| Audio codecs | AAC, Opus, MP3, FLAC, Vorbis, signed 16-/24-bit PCM, float PCM, big-endian signed 16-bit PCM | [src/engines/mediabunny/adapter.ts:1050](../../src/engines/mediabunny/adapter.ts#L1050) |
| Encryption | CENC-CTR, CENC-CBCS, HLS AES-128 | [src/engines/mediabunny/adapter.ts:1051](../../src/engines/mediabunny/adapter.ts#L1051) |

Feature tokens claim the following additional behavior:

- MP4 fragmentation and `reserve`, `in-memory`, and `none` fast-start modes; frame-accurate HEVC trim and massive lazy-read trim ([src/engines/mediabunny/adapter.ts:1055](../../src/engines/mediabunny/adapter.ts#L1055)).
- Metadata write/protected-track access; resize, FPS change, rotation, crop, pad, alpha preservation/transcode, resample, downmix, upmix, gain, and fade ([src/engines/mediabunny/adapter.ts:1063](../../src/engines/mediabunny/adapter.ts#L1063)).
- Golden-RGBA decode, gapless priming, HLS AES-128, three named remux tuples, composed remux, VFR mux timestamps, browser-decode equality, mux round-trip comparison, and streaming decode equality ([src/engines/mediabunny/adapter.ts:1077](../../src/engines/mediabunny/adapter.ts#L1077)).
- Native target writes, headerless WebM/Matroska, fanout, native PCM encode/decode, and decoded-audio PCM ([src/engines/mediabunny/adapter.ts:1088](../../src/engines/mediabunny/adapter.ts#L1088), [src/engines/mediabunny/adapter.ts:1106](../../src/engines/mediabunny/adapter.ts#L1106)).

The adapter intentionally omits `webcrypto:cenc-ctr-clear-output`: its source comments record a Mediabunny 1.48.0 assertion abort on the CENC-CTR fixture ([src/engines/mediabunny/adapter.ts:1098](../../src/engines/mediabunny/adapter.ts#L1098)). The corresponding probe cell is still hand-disabled and becomes `SKIPPED`, rather than being decided by the adapter at runtime ([src/core/disabled-cells.ts:209](../../src/core/disabled-cells.ts#L209), [src/core/runner.ts:1928](../../src/core/runner.ts#L1928)).

One declaration is not backed by an execution path: `metadata:write` is present, but the only tag code reads selected tags into normalized metadata; no operation calls `Output.setMetadataTags` or forwards scenario `tags` ([src/engines/mediabunny/adapter.ts:464](../../src/engines/mediabunny/adapter.ts#L464), [src/engines/mediabunny/adapter.ts:1063](../../src/engines/mediabunny/adapter.ts#L1063), [src/engines/mediabunny/adapter.ts:850](../../src/engines/mediabunny/adapter.ts#L850)).

### Effective container × codec × track support

The local codec mapper translates canonical H.264 to Mediabunny `avc`, retains HEVC/VPx/AV1, maps AAC/Opus/MP3/FLAC/Vorbis and the declared PCM variants, and recognizes a wider set on read than it advertises on write ([src/engines/mediabunny/codecs.ts:44](../../src/engines/mediabunny/codecs.ts#L44), [src/engines/mediabunny/codecs.ts:73](../../src/engines/mediabunny/codecs.ts#L73)). Input hints cover ten file formats; HLS is handled separately by `HLS_FORMATS` ([src/engines/mediabunny/codecs.ts:127](../../src/engines/mediabunny/codecs.ts#L127), [src/engines/mediabunny/adapter.ts:245](../../src/engines/mediabunny/adapter.ts#L245)). The output factory constructs the ten output formats, applying fast-start only to MP4/MOV and append-only only to MKV/WebM ([src/engines/mediabunny/codecs.ts:145](../../src/engines/mediabunny/codecs.ts#L145)).

The exact v1.48.0 `OutputFormat` implementations make the real write matrix narrower than the independent declared sets. The table intersects the adapter's declared codecs with [the tagged v1.48.0 format source](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/output-format.ts#L287-L625) and its [audio-only/TS formats](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/output-format.ts#L653-L1157):

| Output | Legal declared video codecs | Legal declared audio codecs | Material track constraint |
|---|---|---|---|
| MP4 | H.264, HEVC, VP8, VP9, AV1 | All declared audio codecs | At least one total track; effectively unbounded media-track counts |
| MOV | H.264, HEVC, VP8, VP9, AV1 | All declared audio codecs | At least one total track; effectively unbounded media-track counts |
| MKV | H.264, HEVC, VP8, VP9, AV1 | All declared audio codecs | At least one, at most 127 total tracks |
| WebM | VP8, VP9, AV1 | Opus, Vorbis | At least one, at most 127 total tracks |
| MPEG-TS | H.264, HEVC | AAC, MP3 | At least one; at most 16 video plus 32 audio tracks |
| WAV | — | PCM S16, PCM S24, PCM F32 | Exactly one audio track; no timestamped media data |
| MP3 | — | MP3 | Exactly one audio track; no timestamped media data |
| FLAC | — | FLAC | Exactly one audio track; no timestamped media data |
| Ogg | — | Opus, Vorbis | Audio only, one or more tracks; no timestamped media data |
| ADTS | — | AAC | Exactly one audio track; no timestamped media data |

Mediabunny's own support guide says codec availability supplied by WebCodecs is browser-dependent, recommends `canEncodeVideo`/`canEncodeAudio` with concrete settings, recommends `InputTrack.canDecode()` for the actual decoder configuration, and demonstrates intersecting encodability with an output format's containable codecs ([Mediabunny supported formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs)). The adapter does the exact video-encode probe in one transcode path, but the declared capability object and runner preflight do not encode this matrix or the configuration.

The shared [`capability gate`](../glossary.md#capability-gate) checks operation, input/output container, each input/output codec, encryption token, and feature tokens independently ([src/core/runner.ts:112](../../src/core/runner.ts#L112)). `CapabilitySet` has no operation-specific direction or tuple predicate ([src/core/engine.ts:115](../../src/core/engine.ts#L115)). Therefore `videoCodecs: ['h264', 'vp9']` plus `containersOut: ['webm', 'ts']` admits both legal and illegal cross-products; track count, bit depth/profile, dimensions, alpha, transform, framing, and encryption shape are absent too.

### Input sources, parsing, and normalized metadata

`openInput()` is deliberate about source lifecycle:

- HLS always uses `UrlSource` plus `HLS_FORMATS` so relative segment and key paths resolve ([src/engines/mediabunny/adapter.ts:245](../../src/engines/mediabunny/adapter.ts#L245)). Because that branch runs first, an HLS input marked `mutated` is still read from its URL rather than from the mutated byte supplier.
- Blob URLs are materialized once into a `BufferSource`; ordinary corpus URLs remain range-readable `UrlSource`; mutated non-HLS assets become `BlobSource` ([src/engines/mediabunny/adapter.ts:259](../../src/engines/mediabunny/adapter.ts#L259)).
- A known container narrows format detection to one format singleton; absent a hint, `ALL_FORMATS` is used ([src/engines/mediabunny/adapter.ts:254](../../src/engines/mediabunny/adapter.ts#L254)).

Container names are canonicalized, with source MIME/extension used to disambiguate the shared ISO BMFF and Matroska/WebM readers ([src/engines/mediabunny/adapter.ts:279](../../src/engines/mediabunny/adapter.ts#L279), [src/engines/mediabunny/adapter.ts:287](../../src/engines/mediabunny/adapter.ts#L287)). Video metadata uses display dimensions, rotation, codec, language, bitrate, and a frame-rate estimate from at most 120 packets; audio uses codec, sample rate, channel count, bitrate, and language ([src/engines/mediabunny/adapter.ts:305](../../src/engines/mediabunny/adapter.ts#L305)). Duration prefers cheap container metadata and falls back to a complete duration computation; tags are a best-effort selected string subset ([src/engines/mediabunny/adapter.ts:425](../../src/engines/mediabunny/adapter.ts#L425), [src/engines/mediabunny/adapter.ts:464](../../src/engines/mediabunny/adapter.ts#L464)). Subtitle and other tracks survive probe as type plus `unknown` codec, but are not supported by later mux preparation ([src/engines/mediabunny/adapter.ts:358](../../src/engines/mediabunny/adapter.ts#L358)).

### Operation inventory

| Operation | Current route | Concrete boundary |
|---|---|---|
| Probe | Opens an input, normalizes format/duration/tracks/tags, and always disposes the input ([src/engines/mediabunny/adapter.ts:1142](../../src/engines/mediabunny/adapter.ts#L1142)). | Protected CENC-CTR can abort below JavaScript and is manually disabled rather than preflighted ([src/core/disabled-cells.ts:209](../../src/core/disabled-cells.ts#L209)). |
| Demux | Creates one `EncodedPacketSink` per input track, asks Mediabunny to verify key packets, and emits size, PTS, track index, and keyframe state ([src/engines/mediabunny/adapter.ts:1152](../../src/engines/mediabunny/adapter.ts#L1152)). | Mediabunny exposes presentation time and decode-order iteration but not DTS here; the adapter deliberately reports `dtsUs = ptsUs`, so B-frame decode time is not preserved ([src/engines/mediabunny/adapter.ts:1154](../../src/engines/mediabunny/adapter.ts#L1154), [src/engines/mediabunny/adapter.ts:1180](../../src/engines/mediabunny/adapter.ts#L1180)). |
| Prepare mux tracks | Copies every selected audio/video packet plus decoder configuration, origin-rebases timestamps, and applies explicit selectors or multi-input defaults ([src/engines/mediabunny/adapter.ts:1194](../../src/engines/mediabunny/adapter.ts#L1194), [src/engines/mediabunny/adapter.ts:386](../../src/engines/mediabunny/adapter.ts#L386)). | `dtsUs` is set to presentation time; subtitle/other tracks never become prepared tracks. |
| Remux | The reserve route goes through explicit packet preparation/mux; all other routes invoke an unconfigured `Conversion` ([src/engines/mediabunny/adapter.ts:1251](../../src/engines/mediabunny/adapter.ts#L1251)). | Upstream Conversion copies where possible, otherwise transcodes, and drops output-incompatible tracks unless the caller inspects them ([Mediabunny conversion guide](https://mediabunny.dev/guide/converting-media-files)). The adapter checks `isValid` only when no usable output exists and otherwise ignores `discardedTracks` ([src/engines/mediabunny/adapter.ts:850](../../src/engines/mediabunny/adapter.ts#L850)). Thus a method named `remux` can transcode or partially drop media. |
| Transcode | Builds video/audio conversion options, runs requested variants sequentially with a fresh input/output for each, and returns the first plus `variants` ([src/engines/mediabunny/adapter.ts:1271](../../src/engines/mediabunny/adapter.ts#L1271)). | A video codec request probes exact dimensions, bitrate, frame rate, alpha, and acceleration modes; failure throws ordinary `Error` ([src/engines/mediabunny/adapter.ts:625](../../src/engines/mediabunny/adapter.ts#L625)). Audio configuration has no corresponding `canEncodeAudio` preflight ([src/engines/mediabunny/adapter.ts:681](../../src/engines/mediabunny/adapter.ts#L681)). Fanout repeats the decode/conversion rather than sharing one decode. |
| Decode frames/audio | Video checks the actual track decoder config, then uses `VideoSampleSink`, RGBA copies/canvas fallback, hashes, and cached pixels; audio-only input uses `AudioSampleSink` and hashes interleaved float samples ([src/engines/mediabunny/adapter.ts:897](../../src/engines/mediabunny/adapter.ts#L897), [src/engines/mediabunny/adapter.ts:1333](../../src/engines/mediabunny/adapter.ts#L1333)). | An unavailable video decoder throws ordinary `Error` whose text says `NA(browser)`; the runner keys on error identity, not prose, so this becomes `ERROR` ([src/engines/mediabunny/adapter.ts:915](../../src/engines/mediabunny/adapter.ts#L915), [src/core/runner.ts:686](../../src/core/runner.ts#L686)). No analogous exact audio decoder preflight exists. |
| Seek | Uses `VideoSampleSink.getSample(timestamp)` and returns the decoded sample's observed timestamp and digest ([src/engines/mediabunny/adapter.ts:1421](../../src/engines/mediabunny/adapter.ts#L1421)). | It requires a primary video track; an audio-only or browser-undecodable request reaches a generic error path. |
| Trim | Negative/inverted ranges are rejected; exact full-range same-container trim returns the original bytes; non-frame-accurate audio may use a packet-copy path; the general path is Conversion, with `forceTranscode` for frame accuracy ([src/engines/mediabunny/adapter.ts:1454](../../src/engines/mediabunny/adapter.ts#L1454)). | Invalid requested ranges, unsupported output containers, boundary encoder absence, and malformed input are not typed separately. A supposedly copy trim can use Conversion's fallback behavior. |
| Mux | Builds an `Output` plus encoded video/audio packet sources, attaches decoder config to each first packet, finalizes, and collects target bytes ([src/engines/mediabunny/adapter.ts:1511](../../src/engines/mediabunny/adapter.ts#L1511)). | Unsupported codecs throw generic errors; subtitle/other tracks are silently skipped; `dtsUs` is ignored; codec strings fall back to hard-coded profiles when a description is missing ([src/engines/mediabunny/adapter.ts:1533](../../src/engines/mediabunny/adapter.ts#L1533), [src/engines/mediabunny/adapter.ts:1564](../../src/engines/mediabunny/adapter.ts#L1564), [src/engines/mediabunny/adapter.ts:1673](../../src/engines/mediabunny/adapter.ts#L1673)). Output-level containability/track-count errors are allowed to escape as generic errors. |
| Decrypt | HLS uses its pathed reader and converts to MP4; CENC creates a full-buffer input whose `resolveKeyId` returns the supplied key, then converts plaintext samples to MP4 ([src/engines/mediabunny/adapter.ts:1611](../../src/engines/mediabunny/adapter.ts#L1611)). | The HLS method ignores the supplied benchmark key because playlist key retrieval is delegated. CENC accepts only the two declared scheme tokens but returns the same key for every KID, ignoring `key.kid` and the provided IV; unsupported schemes use generic errors ([src/engines/mediabunny/adapter.ts:1622](../../src/engines/mediabunny/adapter.ts#L1622), [src/engines/mediabunny/adapter.ts:1634](../../src/engines/mediabunny/adapter.ts#L1634)). |

Mediabunny's exact conversion implementation makes copy/transcode selection per track; the relevant v1.48.0 video and audio decision paths are visible in the tagged [video conversion source](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/conversion.ts#L1184-L1280) and [audio conversion source](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/conversion.ts#L1435-L1560). This behavior is useful for `transcode`; it is too permissive for a strict copy/remux contract unless the adapter constrains it.

### Packet framing, digests, and oracle consequences

The demux result is representation-level metadata, not packet bytes: packet `size` is the Mediabunny encoded packet size and `keyframe` comes from verified packet type ([src/engines/mediabunny/adapter.ts:1171](../../src/engines/mediabunny/adapter.ts#L1171)). Prepared mux tracks, by contrast, copy the packet bytes and first decoder description so the output muxer can rebuild codec-private data ([src/engines/mediabunny/adapter.ts:1210](../../src/engines/mediabunny/adapter.ts#L1210)). The generic mux path sends each chunk as one Mediabunny `EncodedPacket` and uses that description in first-packet decoder metadata ([src/engines/mediabunny/adapter.ts:1564](../../src/engines/mediabunny/adapter.ts#L1564)).

The current [`golden packets`](../glossary.md#golden-packets) comparator groups by track but then requires exact packet count, packet size, and keyframe flags, plus timestamp agreement after one per-track origin offset ([src/core/oracles.ts:835](../../src/core/oracles.ts#L835), [src/core/oracles.ts:891](../../src/core/oracles.ts#L891)). Any mismatch becomes boolean oracle failure ([src/core/oracles.ts:972](../../src/core/oracles.ts#L972)). That is not a fair universal contract for H.264/HEVC carriage:

- In [AVCC](../glossary.md#avcc), NAL units are length-prefixed and parameter sets can live in an out-of-band decoder configuration record.
- In [Annex B](../glossary.md#annex-b), start codes replace length prefixes and parameter sets are carried in-band. The WebCodecs AVC registration explicitly selects these forms according to whether `VideoDecoderConfig.description` is present and requires parameter sets in key chunks for Annex B ([W3C WebCodecs AVC codec registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/)).
- A muxer/demuxer may therefore change packet sizes through start-code versus length-prefix overhead, repeat or remove in-band SPS/PPS/VPS relative to codec-private configuration, and choose a different legal NAL/access-unit grouping without changing decoded media.

Mediabunny's mux route is particularly exposed because the benchmark hands it chunk data plus an optional decoder description, and the output container determines the required packet carriage. A byte-shape mismatch against one ffmpeg-baked representation can be evidence of a valid conversion, not corruption.

Decoded video uses tight top-left RGBA SHA-256 digests, with a canvas fallback when a direct untransformed RGBA copy is unavailable ([src/engines/mediabunny/digest.ts:31](../../src/engines/mediabunny/digest.ts#L31), [src/engines/mediabunny/adapter.ts:1720](../../src/engines/mediabunny/adapter.ts#L1720)). The SSIM/PSNR reference for scenarios without baked pixels is fairly engine-neutral: the runner decodes the original source in-browser and downscales it to the candidate dimensions ([src/core/oracles.ts:1905](../../src/core/oracles.ts#L1905)). Its current pairing is nevertheless index-based, so a valid FPS or frame-count change can pair different presentation times; inability of the platform decoder to decode either candidate or source is also returned as failure ([src/core/oracles.ts:1933](../../src/core/oracles.ts#L1933), [src/core/oracles.ts:1953](../../src/core/oracles.ts#L1953)).

The current result type has no [`DIFF`](../glossary.md#diff); oracle outcomes carry only `pass: boolean`, and result status is `PASS`, `FAIL`, NA variants, `ERROR`, or `SKIPPED` ([src/core/scenario.ts:206](../../src/core/scenario.ts#L206)). The runner stops after a false oracle outcome and assigns `FAIL` ([src/core/runner.ts:1411](../../src/core/runner.ts#L1411)). Consequently Mediabunny currently cannot report “valid but represented differently.”

### Output targets, telemetry, starvation, cancellation, and cleanup

`target: 'stream'` really constructs a Mediabunny `StreamTarget` over a `WritableStream`, counts writes, records time to the first write, and honors each chunk's absolute `position` ([src/engines/mediabunny/adapter.ts:776](../../src/engines/mediabunny/adapter.ts#L776)). This positional handling is required: upstream warns that `StreamTarget` regions can be overwritten and simple concatenation is valid only for append-only formats ([Mediabunny StreamTarget API](https://mediabunny.dev/api/StreamTarget)). However, the adapter copies every written chunk into an array, waits for close, allocates the final extent, and replays every chunk into one `Uint8Array` before returning ([src/engines/mediabunny/adapter.ts:785](../../src/engines/mediabunny/adapter.ts#L785)). It therefore proves native incremental target writes, but not bounded-memory delivery, backpressure to a consumer, or a stream-valued engine result.

The buffer route listens for target writes but records `firstByteMs` only when the completed buffer is retrieved ([src/engines/mediabunny/adapter.ts:828](../../src/engines/mediabunny/adapter.ts#L828)). Its reported buffer “first byte” is completion/readback latency, not first write latency. The runner copies `targetWrites` and `firstByteMs` into measurement fields when present ([src/core/runner.ts:1651](../../src/core/runner.ts#L1651)).

An encoder-starvation sampler exists only as an opt-in annex. It samples encode/decode queue sizes, defines a starvation interval as both queues being zero, and explicitly says it is not wired into cross-engine matrix runs ([src/engines/mediabunny/internal/encoder-starvation.ts:2](../../src/engines/mediabunny/internal/encoder-starvation.ts#L2), [src/engines/mediabunny/internal/encoder-starvation.ts:38](../../src/engines/mediabunny/internal/encoder-starvation.ts#L38), [src/engines/mediabunny/internal/encoder-starvation.ts:71](../../src/engines/mediabunny/internal/encoder-starvation.ts#L71)). Nothing in the adapter imports it. The `queueDepth: 'auto'` config label is therefore provenance text, not measured starvation/queue telemetry.

Normal per-operation input cleanup is strong: probe, demux, remux, each transcode variant, decode, seek, trim, and decrypt dispose their `Input` in `finally` blocks ([src/engines/mediabunny/adapter.ts:1142](../../src/engines/mediabunny/adapter.ts#L1142), [src/engines/mediabunny/adapter.ts:1251](../../src/engines/mediabunny/adapter.ts#L1251), [src/engines/mediabunny/adapter.ts:1271](../../src/engines/mediabunny/adapter.ts#L1271), [src/engines/mediabunny/adapter.ts:1333](../../src/engines/mediabunny/adapter.ts#L1333)). Sample loops also close each video/audio sample after digesting it ([src/engines/mediabunny/adapter.ts:1367](../../src/engines/mediabunny/adapter.ts#L1367)).

Cancellation is not end-to-end. The runner checks its abort signal between cells, and its timeout wrapper is a `Promise.race`; it does not pass a signal or call `Conversion.cancel()` on the losing operation ([src/core/runner.ts:387](../../src/core/runner.ts#L387), [src/core/runner.ts:655](../../src/core/runner.ts#L655), [src/core/runner.ts:1836](../../src/core/runner.ts#L1836)). Mediabunny documents explicit cancellation as freeing resources ([Mediabunny Conversion API](https://mediabunny.dev/api/Conversion)); the adapter never retains the active conversion to cancel it. A timed-out conversion may therefore continue behind a terminal benchmark result until its own pipeline settles.

### Runtime rejection and verdict route

The runner recognizes an error whose name is exactly `NotApplicableError` and maps it to [`NA_ENGINE`](../glossary.md#na-engine) across the main, outer, and robustness execution paths ([src/core/runner.ts:686](../../src/core/runner.ts#L686), [src/core/runner.ts:1382](../../src/core/runner.ts#L1382), [src/core/runner.ts:1464](../../src/core/runner.ts#L1464), [src/core/runner.ts:1552](../../src/core/runner.ts#L1552)). The Mediabunny adapter does not define or throw that error anywhere.

Its concrete generic-error sites include, among others:

- unknown output containers; unsupported canonical codec mappings; invalid dimensions/ranges; absent required tracks; unavailable fade-out duration; no usable Conversion tracks; and output buffer absence ([src/engines/mediabunny/adapter.ts:551](../../src/engines/mediabunny/adapter.ts#L551), [src/engines/mediabunny/adapter.ts:681](../../src/engines/mediabunny/adapter.ts#L681), [src/engines/mediabunny/adapter.ts:850](../../src/engines/mediabunny/adapter.ts#L850), [src/engines/mediabunny/adapter.ts:1454](../../src/engines/mediabunny/adapter.ts#L1454));
- exact browser video decode/encode configurations unavailable through WebCodecs ([src/engines/mediabunny/adapter.ts:625](../../src/engines/mediabunny/adapter.ts#L625), [src/engines/mediabunny/adapter.ts:897](../../src/engines/mediabunny/adapter.ts#L897));
- output-format codec/track-count rejection raised later by Mediabunny `Output`, including illegal WebM/TS/audio-only cross-products ([src/engines/mediabunny/adapter.ts:1517](../../src/engines/mediabunny/adapter.ts#L1517)); and
- unsupported encryption schemes or a valid protected form that the installed parser cannot handle ([src/engines/mediabunny/adapter.ts:1634](../../src/engines/mediabunny/adapter.ts#L1634), [src/core/disabled-cells.ts:209](../../src/core/disabled-cells.ts#L209)).

The first group mixes invalid requests and unsupported engine tuples. The second is browser applicability, not engine support. The third and fourth can be valid-but-unsupported tuples. With ordinary `Error`, all can leak into `ERROR` or, if output exists but violates an oracle, `FAIL`; the text `NA(browser)` has no status effect.

## Contracts and invariants

- **Exact identity.** Results from this page's implementation identify `mediabunny@1.48.0`; an upgrade requires re-auditing the tagged output/conversion matrix and updating both manifest and lock evidence ([src/engines/mediabunny/adapter.ts:1017](../../src/engines/mediabunny/adapter.ts#L1017), [package.json:36](../../package.json#L36)).
- **Source truth.** Ordinary URL assets remain range-readable; in-memory mutations must reach Mediabunny as the actual mutated bytes; HLS must remain pathed so segments and keys resolve ([src/engines/mediabunny/adapter.ts:234](../../src/engines/mediabunny/adapter.ts#L234)). The current mutated-HLS exception is a known breach.
- **No fabricated decode time.** The demux adapter may report missing DTS explicitly, but must not imply that PTS is observed DTS. Current `dtsUs = ptsUs` is a lossy schema accommodation and must not be used to prove B-frame decode-timeline equality ([src/engines/mediabunny/adapter.ts:1154](../../src/engines/mediabunny/adapter.ts#L1154)).
- **Strict remux means no decode/encode and no silent track loss.** A route that lets Conversion transcode or discard tracks does not meet a copy/remux scenario merely because it emitted a valid container ([src/engines/mediabunny/adapter.ts:1251](../../src/engines/mediabunny/adapter.ts#L1251)).
- **Mux preserves the public track contract.** Every selected supported track, byte payload, PTS, DTS/decode order, duration, keyframe semantic, codec description, and relevant track metadata must be accounted for. Silent subtitle/other dropping and ignoring `dtsUs` violate a general mux claim ([src/engines/mediabunny/adapter.ts:1511](../../src/engines/mediabunny/adapter.ts#L1511)).
- **Output writes are positional.** Stream chunks may overwrite earlier regions, so assembly must use `position`; `target:writes` establishes only that native writes occurred, not bounded memory, consumer streaming, or append-only order ([src/engines/mediabunny/adapter.ts:795](../../src/engines/mediabunny/adapter.ts#L795)).
- **Every owned resource settles once.** Inputs and samples must close on success, unsupported tuple, malformed input, timeout, cancellation, and target failure. Conversion cancellation and stream abort are currently incomplete parts of that invariant.
- **Applicability is typed.** An intrinsically unsupported Mediabunny/adapter tuple is `NotApplicableError` → `NA_ENGINE`; an unavailable exact browser codec/API configuration is [`NA_BROWSER`](../glossary.md#na-browser); malformed media, violated invariants, and genuine runtime faults remain `FAIL`/`ERROR` according to the scenario contract ([src/core/scenario.ts:208](../../src/core/scenario.ts#L208), [src/core/runner.ts:686](../../src/core/runner.ts#L686)).
- **Verdict semantics are three-way.** [`PASS`](../glossary.md#pass) means the required semantics hold; `DIFF` means valid semantics with a permitted representational difference from the golden; [`FAIL`](../glossary.md#fail) means truly wrong. A legal AVCC/Annex B or parameter-set placement difference cannot be laundered into `PASS`, but it also cannot be called `FAIL`.

## Target design and known gaps

### Target design

#### 1. Add an adapter-owned tuple decision before work starts

Retain the shared token gate as a cheap coarse filter, then require a Mediabunny support decision over this complete key:

`operation × input format × actual tracks(codec, decoder config, protection) × selection × transform/trim mode × output format/options × output codecs/configs × track counts × target mode`.

The decision must perform, as applicable:

1. parse/probe enough of the real input to identify actual tracks and protection without decoding the whole asset;
2. intersect each output track with `OutputFormat.getSupportedVideoCodecs()`, `getSupportedAudioCodecs()`, `getSupportedTrackCounts()`, timestamp support, rotation/alpha/layout options, and target constraints;
3. call `InputTrack.canDecode()` or the exact `canDecodeVideo`/`canDecodeAudio` configuration before decode-dependent work;
4. call exact `canEncodeVideo` **and** `canEncodeAudio` settings, including dimensions, frame rate, alpha, channels, sample rate, bitrate, and acceleration policy, before encode-dependent work; and
5. for Conversion, inspect `isValid` and every `discardedTrack` before execution. Mediabunny explicitly recommends this inspection because its default is copy when possible, otherwise transcode, with unsupported tracks dropped ([Mediabunny conversion guide](https://mediabunny.dev/guide/converting-media-files)).

Use reason-coded `NotApplicableError` for a structurally valid tuple the installed Mediabunny adapter cannot perform: `container-codec`, `track-count`, `track-type`, `copy-required`, `protection-form`, `transform-format`, `metadata-write-format`, or similar. The runner already maps that name to `NA_ENGINE`; this shrinks the hand-kept disabled-cell list and prevents legal unsupported combinations from becoming `FAIL`/`ERROR` ([src/core/runner.ts:686](../../src/core/runner.ts#L686)). Move the CENC-CTR parser abort behind a safe preflight/exception boundary and remove its disabled entry only after the equivalent scenario returns reason-coded `NA_ENGINE` or succeeds.

Do not misclassify dynamic browser codec availability as `NA_ENGINE`. WebCodecs configuration support is best-effort and can change with hardware and runtime state ([W3C WebCodecs](https://www.w3.org/TR/webcodecs/)). The runner/adapter boundary needs a separate typed browser-applicability signal that maps exact `isConfigSupported=false`, unavailable WebCodecs APIs, or platform reference decode absence to `NA_BROWSER`. Malformed codec configuration and a decoder crash after a positive support decision remain real failures.

#### 2. Make each operation's semantics explicit

- **Remux/copy.** Implement strict remux through encoded packet sinks/sources, or an upstream copy-only mode that can prove every selected media track was copied. Reject any tuple requiring decode/encode as `NA_ENGINE`. Require an empty discard set, the same selected track multiset, codec essence preservation, and no unrequested metadata/track loss. Timeline-origin changes and legal container framing may be `DIFF`; transcoding or dropped media is `FAIL`.
- **Transcode.** Add exact audio encode/decode preflight, make fanout truth explicit (shared-decode or repeated conversions), validate every variant independently, and return per-variant support/provenance. An unsupported variant must not erase supported siblings or silently substitute a codec.
- **Trim.** Separate byte identity, packet-copy/keyframe trim, boundary-GOP transcode, and full transcode. A non-frame-accurate copy request must not fall through to accidental transcode. Report observed first/last presentation times and whether priming/edit-list material changed.
- **Mux.** Preflight containability and track counts; reject zero supported tracks; never silently drop subtitle/other tracks; preserve decode order/DTS separately from PTS; require codec-private description when the codec/container needs it; and validate provided profile strings rather than inventing a default that may not match the packets. Mediabunny `Output` already validates format and track constraints at add/start time ([tagged v1.48.0 Output source](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/output.ts#L672-L750)); the adapter must translate predictable rejections before generic execution.
- **Metadata.** Either implement `metadata:write` by forwarding normalized scenario tags through Mediabunny output metadata APIs and verifying re-import, or remove the token. Preserve unknown/unselected metadata according to an explicit scenario policy.
- **Decrypt.** Validate scheme, container/protection shape, KID-to-key mapping, and IV/subsample/pattern requirements. Use the requested key only for the matching KID; reject a valid unsupported protection form as `NA_ENGINE`; retain wrong-key/corrupt-ciphertext as `FAIL`. HLS should declare whether playlist key resolution, a caller override key, or both are under test.

#### 3. Replace representation-blind packet verdicts

Adopt the benchmark-wide three-way oracle contract:

- `PASS`: the semantic packet contract and required normalized representation both match;
- `DIFF`: the output/demux is valid and semantically equivalent, but its legal representation differs from the ffmpeg-baked golden; and
- `FAIL`: invalid/corrupt/undecodable output, lost or altered media essence, wrong timing beyond the scenario tolerance, missing required tracks, or a false key-access boundary.

For Mediabunny, the packet oracle must record and normalize at least codec configuration, AVCC versus Annex B framing, NAL length size, in-band versus out-of-band SPS/PPS/VPS, access-unit/NAL grouping, packet decode order, PTS, optional DTS, duration, and independently verified random-access semantics. Exact packet byte size and a one-to-one packet grouping are valid strict assertions only when a scenario explicitly promises representation identity. Otherwise a framing or grouping-only difference is `DIFF`, while decode/probe/content/timeline invariants decide whether it is valid.

The same model applies to remux output: legal ISO BMFF table layout, interleave, edit-list expression, codec-tag alias, or parameter-set placement may be `DIFF`; hidden Conversion transcode or track loss is `FAIL`. [ISO/IEC 14496-12](https://www.iso.org/standard/85596.html) defines the ISO base media file structure and timing model, while the WebCodecs codec registrations define the encoded-chunk configuration boundary; neither makes one ffmpeg packetization the only valid representation.

#### 4. Normalize metadata semantically at the shared oracle

Mediabunny already maps its local codec vocabulary to canonical H.264/HEVC/AAC tokens before returning metadata ([src/engines/mediabunny/adapter.ts:328](../../src/engines/mediabunny/adapter.ts#L328)). The shared `golden-metadata` oracle must finish the job consistently for every adapter: canonicalize `avc1`/`avc3`/`V_MPEG4/ISO/AVC` to H.264, `hev1`/`hvc1` to HEVC, and `mp4a` to AAC; match tracks by media type and stable attributes instead of raw index; band NTSC and VFR rates; and allow duration deltas caused by edit lists, codec priming, and timebase quantization. HE-AAC/SBR core-rate versus rendered 2× sample rate and Parametric Stereo one-channel core versus two-channel render are equivalent reports, not incorrect media. The current positional/raw comparison does none of that ([src/core/oracles.ts:768](../../src/core/oracles.ts#L768)).

The adapter should additionally return how FPS was derived (sample count, observed interval, nominal/average status) rather than presenting a 120-packet estimate as an exact track property. Missing DTS should remain missing in the normalized schema, not be substituted with PTS.

#### 5. Keep the visual reference fair and make pairing temporal

Retain the source's neutral in-browser WebCodecs decode as the SSIM/PSNR reference; that is fair by design because no contestant engine produces the reference ([src/core/oracles.ts:1905](../../src/core/oracles.ts#L1905)). Replace index pairing with presentation-time pairing after the declared transform/FPS policy, with a documented maximum temporal delta and coverage accounting. A candidate with changed FPS/frame count must be compared to the source image at the corresponding time, not source frame `i`.

Separate output validity from platform reference applicability. If Mediabunny emits valid media outside the browser's platform decoder configuration, first validate it with format/parser/track invariants, then return `NA_BROWSER` for the visual oracle (or `DIFF` only when another semantic oracle proves validity and the status model explicitly permits that composition). Do not call it content `FAIL` merely because the neutral decoder cannot open it. Conversely, if the scenario requires browser playback, an undecodable output after a positive supported configuration remains `FAIL`.

#### 6. Make streaming, cancellation, cleanup, and telemetry truthful

Preserve positioned writes, but stream them to a bounded spool or consumer with backpressure; do not retain every chunk plus a full reassembled copy for large-output scenarios. Report separate facts: target kind, append-only versus repositioning, first native write, first consumer-visible byte, write count/bytes, maximum position/overwrite count, peak queued bytes, completion/finalization, and final readback. Buffer targets must either timestamp the actual `write` event or leave TTFB absent; completion time is not first-byte time.

Thread cancellation through input reads, sinks, output writes, and Conversion. Retain the active Conversion long enough to call `cancel()` on abort/timeout, await settlement, abort the stream target once, and dispose every input/sample in a final cleanup barrier. Upstream documents `Input.dispose()` as canceling active reads/sinks and Conversion cancellation as freeing resources ([Mediabunny reading guide](https://mediabunny.dev/guide/reading-media-files), [Mediabunny Conversion API](https://mediabunny.dev/api/Conversion)). The runner must not publish a terminal result until adapter cleanup has settled or a cleanup failure is recorded.

Wire starvation sampling only as explicit telemetry, not a verdict by itself. Measure actual WebCodecs encode/decode queue depths around the transcode pipeline, reset state per operation, and distinguish source starvation, transform slowness, encoder backpressure, and output backpressure. Remove or qualify the static `streaming-lockstep`, `queueDepth: auto`, and canvas-pool claims unless observable state proves them.

#### 7. Conformance suite at the adapter boundary

Before deleting disabled cells or trusting broad capabilities, add tests that cover:

1. exact package/lock/instance identity and re-audit on any Mediabunny version change;
2. every row of the output tuple table: positive codec/container cases, illegal cross-products, zero/excess track counts, subtitle/other handling, and timestamped versus non-timestamped formats;
3. exact browser video **and audio** encode/decode configurations across acceleration modes, with intrinsic unsupported tuples → `NA_ENGINE` and dynamic browser absence → `NA_BROWSER`;
4. strict remux cases in which Conversion would otherwise transcode or discard, proving no payload transcode and no unrequested track loss;
5. metadata write/read round trips or removal of the unsupported token;
6. AVCC ↔ Annex B, in-band/out-of-band SPS/PPS/VPS, alternate NAL grouping, B-frame decode order, and absent-DTS fixtures, expecting representation-only differences to become `DIFF`;
7. SSIM temporal pairing under 30→15, 15→30, VFR→CFR, duplicated/dropped frames, and an otherwise valid output unavailable to the platform decoder;
8. HLS path resolution and mutated-HLS byte truth; CENC multi-KID, wrong KID/key, CTR/CBCS/pattern/subsample variants, malformed protection metadata, and the current assertion fixture;
9. positioned StreamTarget overwrite, append-only output, backpressure, target abort, truthful TTFB, bounded peak memory, and final-byte equality against BufferTarget;
10. abort/timeout during init, input read, decode, encode, output write, and finalize, with no post-result writes or unhandled rejection;
11. queue/starvation telemetry with a deliberately slow source and slow target; and
12. config/telemetry persistence for `PASS`, `DIFF`, `FAIL`, `NA_ENGINE`, `NA_BROWSER`, `ERROR`, cancellation, and timeout.

### Known gaps

#### Flat capability tokens admit unsupported cross-products

**Current.** The adapter advertises independent operation/container/codec/feature sets; the gate checks them independently, and the adapter throws no `NotApplicableError` ([src/engines/mediabunny/adapter.ts:1029](../../src/engines/mediabunny/adapter.ts#L1029), [src/core/runner.ts:112](../../src/core/runner.ts#L112)).

**Consequence.** Illegal container-codec-track and transform-config tuples reach Mediabunny or WebCodecs and become `ERROR`/`FAIL`; one known CENC crash is hidden as `SKIPPED` in a hand-maintained list.

**Target and verification.** Implement the complete tuple decision and reason-coded applicability boundary above. Delete a disabled entry only when its exact cell has a regression test proving successful execution or runtime `NA_ENGINE`, and exhaustively test the declared cross-product against the exact v1.48.0 matrix.

#### Remux is not guaranteed to copy or preserve all tracks

**Current.** Most remuxes use permissive Conversion; valid conversions can transcode and can retain only the supported subset because nonempty `discardedTracks` is ignored ([src/engines/mediabunny/adapter.ts:850](../../src/engines/mediabunny/adapter.ts#L850), [src/engines/mediabunny/adapter.ts:1251](../../src/engines/mediabunny/adapter.ts#L1251)).

**Consequence.** A cell can be labeled a lossless remux while spending encode work, changing codec essence, or dropping tracks; downstream decode may still look plausible.

**Target and verification.** Use a proven copy-only route, require complete selected-track accounting, and compare pre/post codec essence plus decoded content. A tuple requiring transcode is `NA_ENGINE` for strict remux; any unexpected transcode/drop is `FAIL`.

#### Golden packet equality is representation-blind

**Current.** Exact count/size/keyframe comparisons turn AVCC/Annex B overhead, in-band parameter sets, and legal NAL grouping into boolean failure ([src/core/oracles.ts:891](../../src/core/oracles.ts#L891)). Mediabunny can legitimately move configuration across the chunk-description boundary during mux.

**Consequence.** A valid and decodable Mediabunny representation can be scored exactly like corruption.

**Target and verification.** Normalize framing/configuration and introduce `PASS`/`DIFF`/`FAIL`. Golden fixtures must contain equivalent AVCC/Annex B and parameter-set/grouping variants; all must avoid `FAIL` unless content, timing, random access, or validity is wrong.

#### Metadata write is advertised but absent

**Current.** `metadata:write` is declared, but code only reads a subset of tags and never applies requested output tags ([src/engines/mediabunny/adapter.ts:464](../../src/engines/mediabunny/adapter.ts#L464), [src/engines/mediabunny/adapter.ts:1063](../../src/engines/mediabunny/adapter.ts#L1063)).

**Consequence.** Metadata-write cells can execute on a false premise and fail late, or pass an oracle that never verified the requested edit.

**Target and verification.** Implement per-format write mapping and re-import verification, including preservation policy for unrelated tags, or remove the token and return `NA_ENGINE` until implemented.

#### Browser applicability is encoded as error prose

**Current.** Video decode checks the exact track config but throws ordinary `Error` ending in `NA(browser)`; exact audio decode/encode checks are missing ([src/engines/mediabunny/adapter.ts:897](../../src/engines/mediabunny/adapter.ts#L897), [src/engines/mediabunny/adapter.ts:681](../../src/engines/mediabunny/adapter.ts#L681)).

**Consequence.** The same valid scenario can become `ERROR` on one browser and execute on another without a correct `NA_BROWSER` record; broad warmup success does not prove the concrete configuration.

**Target and verification.** Add a typed browser-applicability route, exact audio/video support checks, and browser-matrix tests where codec, profile, dimensions/rate/channels, alpha, and acceleration availability vary.

#### Mux loses DTS and silently ignores unsupported track types

**Current.** Prepared and public mux paths substitute PTS for DTS or ignore `dtsUs`; subtitle/other tracks are skipped; fallback codec profiles can be unrelated to payloads ([src/engines/mediabunny/adapter.ts:1194](../../src/engines/mediabunny/adapter.ts#L1194), [src/engines/mediabunny/adapter.ts:1533](../../src/engines/mediabunny/adapter.ts#L1533), [src/engines/mediabunny/adapter.ts:1673](../../src/engines/mediabunny/adapter.ts#L1673)).

**Consequence.** B-frame ordering and track completeness are route-dependent; a plausible output may carry wrong timing/configuration or omit requested media.

**Target and verification.** Extend the prepared-track contract to retain decode order/DTS and explicit unsupported-track decisions. Round-trip B-frame/VFR/multitrack fixtures and assert track multiset, presentation cadence, decode order, codec config, and content.

#### SSIM/PSNR pairs frames by index

**Current.** The neutral reference is sound, but source and candidate frame `i` are compared directly and reference decoder absence is a failure ([src/core/oracles.ts:1905](../../src/core/oracles.ts#L1905), [src/core/oracles.ts:1933](../../src/core/oracles.ts#L1933)).

**Consequence.** Correct frame-rate conversion can compare different moments and false-fail; a valid but platform-undecodable output can be mistaken for wrong pixels.

**Target and verification.** Pair by transformed presentation time, report coverage/maximum delta, and separate format validity from `NA_BROWSER` reference applicability. Verify with FPS/VFR changes and codec configurations deliberately unavailable to the browser reference decoder.

#### Native writes are real, but the result is still fully buffered

**Current.** The stream route consumes positioned writes then stores and reassembles all chunks; buffer-target `firstByteMs` is assigned only at completed-buffer readback ([src/engines/mediabunny/adapter.ts:785](../../src/engines/mediabunny/adapter.ts#L785), [src/engines/mediabunny/adapter.ts:828](../../src/engines/mediabunny/adapter.ts#L828)).

**Consequence.** `target:writes` can be read as end-to-end streaming and buffer TTFB can be read as first output, overstating latency and memory behavior.

**Target and verification.** Split native-write capability from bounded consumer streaming, timestamp actual writes, expose overwrite/backpressure/peak-queue metrics, and test large outputs without an all-chunk-plus-full-buffer memory peak.

#### Timeout does not cancel active conversion

**Current.** The runner races a timer but does not call Mediabunny cancellation; the adapter holds no active-operation handle for abort ([src/core/runner.ts:655](../../src/core/runner.ts#L655), [src/engines/mediabunny/adapter.ts:850](../../src/engines/mediabunny/adapter.ts#L850)).

**Consequence.** Work and output writes may continue after a terminal result, skewing later cells and retaining resources.

**Target and verification.** Propagate a signal, call `Conversion.cancel()`, await cleanup, and assert no post-terminal writes/unhandled rejections for timeout at every pipeline phase.

#### Starvation and configuration labels are not measured facts

**Current.** The sampler is explicitly annex-only and unwired, while `configUsed` claims automatic queue depth, streaming lockstep, and a canvas-pool size ([src/engines/mediabunny/internal/encoder-starvation.ts:2](../../src/engines/mediabunny/internal/encoder-starvation.ts#L2), [src/engines/mediabunny/adapter.ts:146](../../src/engines/mediabunny/adapter.ts#L146)).

**Consequence.** Reports can imply a scheduling/backpressure implementation without evidence, and cannot explain whether low throughput came from source, codec, transform, or target starvation.

**Target and verification.** Report observed queue/backpressure data with per-operation provenance or remove/qualify the labels. Slow-source/slow-target tests must distinguish starvation causes and reset all sampler state on every exit path.

#### Decryption key and protected-form handling is underspecified

**Current.** HLS ignores the supplied key, CENC resolves every KID to one key and ignores caller KID/IV, unsupported schemes are generic errors, and the known CTR parse abort is manually skipped ([src/engines/mediabunny/adapter.ts:1622](../../src/engines/mediabunny/adapter.ts#L1622), [src/engines/mediabunny/adapter.ts:1634](../../src/engines/mediabunny/adapter.ts#L1634), [src/core/disabled-cells.ts:209](../../src/core/disabled-cells.ts#L209)).

**Consequence.** Tests do not establish correct key selection; valid unsupported protection can look like a crash, while wrong-key behavior is not cleanly separated from parser support.

**Target and verification.** Specify override versus manifest key ownership, enforce KID mapping, preflight protection forms, and test correct/wrong/missing/multi-key cases. Valid unsupported forms become `NA_ENGINE`; wrong plaintext, corruption, or a crash after a supported decision remains `FAIL`/`ERROR`.

#### Mutated HLS does not reach the in-memory mutation path

**Current.** HLS is detected before the `mutated` branch and always constructs `UrlSource` ([src/engines/mediabunny/adapter.ts:245](../../src/engines/mediabunny/adapter.ts#L245)).

**Consequence.** A robustness scenario can claim it tested corrupted playlist bytes while Mediabunny rereads the pristine URL.

**Target and verification.** Provide a pathed in-memory source whose playlist bytes are the mutation and whose sidecars resolve deterministically. Assert a mutation-specific digest/read trace so a pristine reread cannot pass.

## Sources

### Repository evidence

- [package.json:36](../../package.json#L36) and [bun.lock:15](../../bun.lock#L15) — exact direct dependency pin; [bun.lock:356](../../bun.lock#L356) — exact resolved Mediabunny package.
- [src/app/register.ts:32](../../src/app/register.ts#L32), [src/engines/mediabunny/register.ts:18](../../src/engines/mediabunny/register.ts#L18), and [src/core/registry.ts:32](../../src/core/registry.ts#L32) — app wiring, factory registration, and registry behavior.
- [src/engines/mediabunny/adapter.ts:146](../../src/engines/mediabunny/adapter.ts#L146), [src/engines/mediabunny/adapter.ts:1008](../../src/engines/mediabunny/adapter.ts#L1008), and [src/engines/mediabunny/adapter.ts:1114](../../src/engines/mediabunny/adapter.ts#L1114) — configuration record, identity, initialization, warmup, and disposal.
- [src/engines/mediabunny/adapter.ts:1029](../../src/engines/mediabunny/adapter.ts#L1029) — operations, containers, codecs, encryption, and feature declarations.
- [src/engines/mediabunny/codecs.ts:44](../../src/engines/mediabunny/codecs.ts#L44), [src/engines/mediabunny/codecs.ts:73](../../src/engines/mediabunny/codecs.ts#L73), [src/engines/mediabunny/codecs.ts:127](../../src/engines/mediabunny/codecs.ts#L127), and [src/engines/mediabunny/codecs.ts:145](../../src/engines/mediabunny/codecs.ts#L145) — canonical codec mapping and input/output format factories.
- [src/engines/mediabunny/adapter.ts:234](../../src/engines/mediabunny/adapter.ts#L234), [src/engines/mediabunny/adapter.ts:287](../../src/engines/mediabunny/adapter.ts#L287), and [src/engines/mediabunny/adapter.ts:305](../../src/engines/mediabunny/adapter.ts#L305) — source choice and metadata normalization.
- [src/engines/mediabunny/adapter.ts:425](../../src/engines/mediabunny/adapter.ts#L425) — duration, track, and metadata-tag extraction.
- [src/engines/mediabunny/adapter.ts:551](../../src/engines/mediabunny/adapter.ts#L551), [src/engines/mediabunny/adapter.ts:681](../../src/engines/mediabunny/adapter.ts#L681), and [src/engines/mediabunny/adapter.ts:850](../../src/engines/mediabunny/adapter.ts#L850) — video/audio Conversion options, support checks, and execution.
- [src/engines/mediabunny/adapter.ts:776](../../src/engines/mediabunny/adapter.ts#L776) — BufferTarget/StreamTarget instrumentation and output assembly.
- [src/engines/mediabunny/adapter.ts:897](../../src/engines/mediabunny/adapter.ts#L897) — exact video decoder support probe and generic browser error.
- [src/engines/mediabunny/adapter.ts:1142](../../src/engines/mediabunny/adapter.ts#L1142), [src/engines/mediabunny/adapter.ts:1152](../../src/engines/mediabunny/adapter.ts#L1152), and [src/engines/mediabunny/adapter.ts:1194](../../src/engines/mediabunny/adapter.ts#L1194) — probe, demux, and prepared mux tracks.
- [src/engines/mediabunny/adapter.ts:1251](../../src/engines/mediabunny/adapter.ts#L1251), [src/engines/mediabunny/adapter.ts:1271](../../src/engines/mediabunny/adapter.ts#L1271), [src/engines/mediabunny/adapter.ts:1333](../../src/engines/mediabunny/adapter.ts#L1333), and [src/engines/mediabunny/adapter.ts:1421](../../src/engines/mediabunny/adapter.ts#L1421) — remux, transcode/fanout, decode, and seek.
- [src/engines/mediabunny/adapter.ts:1454](../../src/engines/mediabunny/adapter.ts#L1454), [src/engines/mediabunny/adapter.ts:1511](../../src/engines/mediabunny/adapter.ts#L1511), and [src/engines/mediabunny/adapter.ts:1611](../../src/engines/mediabunny/adapter.ts#L1611) — trim, mux, and decrypt.
- [src/engines/mediabunny/adapter.ts:1673](../../src/engines/mediabunny/adapter.ts#L1673), [src/engines/mediabunny/adapter.ts:1720](../../src/engines/mediabunny/adapter.ts#L1720), and [src/engines/mediabunny/digest.ts:31](../../src/engines/mediabunny/digest.ts#L31) — fallback codec parameters, pixel extraction, and digests.
- [src/engines/mediabunny/internal/encoder-starvation.ts:2](../../src/engines/mediabunny/internal/encoder-starvation.ts#L2) — opt-in, unwired starvation sampler and its heuristic.
- [src/core/engine.ts:115](../../src/core/engine.ts#L115), [src/core/runner.ts:112](../../src/core/runner.ts#L112), and [src/core/runner.ts:686](../../src/core/runner.ts#L686) — flat capability schema, gate, and `NotApplicableError` recognition.
- [src/core/runner.ts:1382](../../src/core/runner.ts#L1382), [src/core/runner.ts:1464](../../src/core/runner.ts#L1464), and [src/core/runner.ts:1552](../../src/core/runner.ts#L1552) — runtime error-to-status routes.
- [src/core/runner.ts:655](../../src/core/runner.ts#L655), [src/core/runner.ts:1651](../../src/core/runner.ts#L1651), and [src/core/runner.ts:1836](../../src/core/runner.ts#L1836) — timeout, output telemetry, and cell-boundary abort handling.
- [src/core/disabled-cells.ts:209](../../src/core/disabled-cells.ts#L209) and [src/core/runner.ts:1928](../../src/core/runner.ts#L1928) — Mediabunny CENC-CTR disabled cell and `SKIPPED` construction.
- [src/core/scenario.ts:206](../../src/core/scenario.ts#L206) and [src/core/runner.ts:1411](../../src/core/runner.ts#L1411) — current status/oracle result model and binary failure route.
- [src/core/oracles.ts:721](../../src/core/oracles.ts#L721), [src/core/oracles.ts:835](../../src/core/oracles.ts#L835), and [src/core/oracles.ts:972](../../src/core/oracles.ts#L972) — current metadata and packet-golden comparators.
- [src/core/oracles.ts:1905](../../src/core/oracles.ts#L1905) — source-decoded SSIM/PSNR reference and index pairing.

### External authorities

- [Mediabunny v1.48.0 release](https://github.com/Vanilagy/mediabunny/releases/tag/v1.48.0) — exact upstream release corresponding to the installed dependency. Accessed 2026-07-16.
- Mediabunny v1.48.0 `output-format.ts`: [containability/track-count interface](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/output-format.ts#L65-L112), [ISO BMFF/Matroska/WebM classes](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/output-format.ts#L287-L625), and [audio-only/MPEG-TS classes](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/output-format.ts#L653-L1157) — exact container × codec × track matrix. Accessed 2026-07-16.
- [Mediabunny v1.48.0 `output.ts`](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/output.ts#L672-L750) — track-addition validation against format codec and cardinality constraints. Accessed 2026-07-16.
- [Mediabunny v1.48.0 `conversion.ts`, video](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/conversion.ts#L1184-L1280) and [audio](https://github.com/Vanilagy/mediabunny/blob/v1.48.0/src/conversion.ts#L1435-L1560) — exact copy/transcode decisions and per-track conversion behavior. Accessed 2026-07-16.
- [Mediabunny: Supported formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs) — format/codec matrix, browser-dependent WebCodecs support, exact encodability/decodability queries, and output-containability intersection. Accessed 2026-07-16.
- [Mediabunny: Input formats](https://mediabunny.dev/guide/input-formats) — input format detection and format coverage. Accessed 2026-07-16.
- [Mediabunny: Output formats](https://mediabunny.dev/guide/output-formats) — output-format capabilities and format-specific options. Accessed 2026-07-16.
- [Mediabunny: Reading media files](https://mediabunny.dev/guide/reading-media-files) — source/input lifecycle, track access, and disposal behavior. Accessed 2026-07-16.
- [Mediabunny: Writing media files](https://mediabunny.dev/guide/writing-media-files) — Output, target, track, metadata, start, and finalize contract. Accessed 2026-07-16.
- [Mediabunny: Packets and samples](https://mediabunny.dev/guide/packets-and-samples) — packet/sample timestamps, ordering, sinks, and codec-configuration boundary. Accessed 2026-07-16.
- [Mediabunny: Converting media files](https://mediabunny.dev/guide/converting-media-files) — default copy/transcode/drop behavior, validity, discarded tracks, progress, and conversion control. Accessed 2026-07-16.
- [Mediabunny `Conversion` API](https://mediabunny.dev/api/Conversion) — conversion state, execution, progress, and cancellation. Accessed 2026-07-16.
- [Mediabunny `OutputFormat` API](https://mediabunny.dev/api/OutputFormat) — supported codecs, track limits, and timestamp/rotation properties. Accessed 2026-07-16.
- [Mediabunny `StreamTarget` API](https://mediabunny.dev/api/StreamTarget) — positioned stream chunks, overwrite behavior, and append-only implications. Accessed 2026-07-16.
- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/) — codec configuration support, encoded chunks, timestamps, lifecycle, and dynamic hardware/software codec availability. Accessed 2026-07-16.
- [W3C WebCodecs AVC codec registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/) — AVC/AVCC versus Annex B chunk format, decoder-description boundary, and in-band parameter-set requirements. Accessed 2026-07-16.
- [W3C WebCodecs HEVC codec registration](https://www.w3.org/TR/webcodecs-hevc-codec-registration/) — HEVC length-prefixed/Annex B configuration and VPS/SPS/PPS carriage. Accessed 2026-07-16.
- [ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html) — ISO base media file structure, timing, tracks, samples, and edit-list context. Accessed 2026-07-16.
- [ETSI TS 102 005, Annex A](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf) — HE-AAC SBR output-rate and Parametric Stereo core/output interpretation used by semantic metadata equivalence. Accessed 2026-07-16.
