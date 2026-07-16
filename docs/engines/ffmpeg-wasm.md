# ffmpeg.wasm engine adapter

> Scope: The browser integration of `@ffmpeg/ffmpeg`, including registration, loading, virtual files, capability reporting, codec/container mappings, operation dispatch, and adapter-specific failure behavior; runner policy and oracle algorithms are described only where they constrain this adapter.
>
> Phase-2 owner: p2_engine_ffmpeg_wasm.

## Purpose

The ffmpeg.wasm [`engine`](../glossary.md#engine) is the benchmark's WebAssembly-backed [`adapter`](../glossary.md#adapter) to FFmpeg. It offers a broad, non-native baseline for probing, packet inspection, remuxing, transcoding, trimming, decoding, seeking, muxing, concatenation, and a limited set of decryption paths. Its value is coverage: one worker-hosted FFmpeg core can exercise most media families without relying on the browser's platform codec selection.

This page specifies what that integration does today and what it must become before benchmark verdicts can be treated as a precise compatibility statement. “FFmpeg can perform an operation” is not itself the contract. The contract is the exact shipped WebAssembly build, the adapter's mappings and restrictions, its resource and lifecycle behavior, and how outcomes reach [`PASS`](../glossary.md#pass), [`DIFF`](../glossary.md#diff), or [`FAIL`](../glossary.md#fail).

## As-built

### Registration, package versions, and runtime assets

The engine factory is registered as `ffmpeg-wasm` and constructs a new `FfmpegWasmAdapter`; the app loads that registration through a dedicated dynamic-import branch ([src/engines/ffmpeg-wasm/register.ts:14](../../src/engines/ffmpeg-wasm/register.ts#L14), [src/app/register.ts:53](../../src/app/register.ts#L53)). The generic registry caches factories, not adapter instances, and the runner creates a fresh engine for each benchmark [`cell`](../glossary.md#cell) ([src/core/registry.ts:32](../../src/core/registry.ts#L32), [src/core/runner.ts:1865](../../src/core/runner.ts#L1865)).

The dependency lock is exact at the application boundary:

| Component | Installed version | Repository evidence |
|---|---:|---|
| `@ffmpeg/ffmpeg` | `0.12.15` | [package.json:32](../../package.json#L32), [bun.lock:116](../../bun.lock#L116) |
| `@ffmpeg/core` | `0.12.10` | [package.json:30](../../package.json#L30), [bun.lock:112](../../bun.lock#L112) |
| `@ffmpeg/core-mt` | `0.12.10` | [package.json:31](../../package.json#L31), [bun.lock:114](../../bun.lock#L114) |
| `@ffmpeg/util` | `0.12.2` | [package.json:33](../../package.json#L33), [bun.lock:120](../../bun.lock#L120) |

Those versions match the upstream v0.12.15 release pairing of the JavaScript package with the 0.12.10 single- and multithreaded cores. The upstream API also exposes `CORE_VERSION` as 0.12.10 ([ffmpeg.wasm v0.12.15 release](https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15), [ffmpeg.wasm API](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/)).

Vite exposes the ESM worker and core artifacts from `node_modules`, then copies the same files into the production bundle; source maps are excluded ([vite.config.mjs:164](../../vite.config.mjs#L164), [vite.config.mjs:217](../../vite.config.mjs#L217)). Development responses set Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers ([vite.config.mjs:252](../../vite.config.mjs#L252)). That is the browser prerequisite for `crossOriginIsolated` and `SharedArrayBuffer` when the multithreaded core is used ([MDN, COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy)).

At runtime, `init()` dynamically imports the wrapper, subscribes to its `log` event, resolves local absolute URLs, and loads the single-threaded core under a 90-second timeout ([src/engines/ffmpeg-wasm/adapter.ts:1525](../../src/engines/ffmpeg-wasm/adapter.ts#L1525), [src/engines/ffmpeg-wasm/adapter.ts:1548](../../src/engines/ffmpeg-wasm/adapter.ts#L1548), [src/engines/ffmpeg-wasm/adapter.ts:1596](../../src/engines/ffmpeg-wasm/adapter.ts#L1596), [src/engines/ffmpeg-wasm/adapter.ts:1623](../../src/engines/ffmpeg-wasm/adapter.ts#L1623)). Although multithreaded asset URLs and a 30-second-then-single-thread fallback branch exist, `useMtCore` is hard-coded to `false`, so that branch is not currently selectable ([src/engines/ffmpeg-wasm/adapter.ts:1551](../../src/engines/ffmpeg-wasm/adapter.ts#L1551), [src/engines/ffmpeg-wasm/adapter.ts:1623](../../src/engines/ffmpeg-wasm/adapter.ts#L1623)). Upstream defines `load()` as worker/WASM initialization and `terminate()` as cancellation of all pending calls followed by a required reload ([ffmpeg.wasm `FFmpeg` API](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/)).

### Lifecycle, virtual filesystem, and observability

The adapter holds one wrapper instance, a filename sequence, a rolling log tail, probed capabilities, and a configuration record ([src/engines/ffmpeg-wasm/adapter.ts:1414](../../src/engines/ffmpeg-wasm/adapter.ts#L1414)). `init()` is idempotent after `this.ff` is assigned, but it has no shared in-flight promise or operation mutex; two callers arriving during initial load can each construct a worker ([src/engines/ffmpeg-wasm/adapter.ts:1525](../../src/engines/ffmpeg-wasm/adapter.ts#L1525)). The runner ordinarily avoids that race by creating and initializing one adapter per cell and disposing it in `finally` ([src/core/runner.ts:1358](../../src/core/runner.ts#L1358), [src/core/runner.ts:1464](../../src/core/runner.ts#L1464)).

Every input is copied into the core filesystem with `writeFile`, and every output is copied back with `readFile`; deletion is best-effort ([src/engines/ffmpeg-wasm/adapter.ts:1835](../../src/engines/ffmpeg-wasm/adapter.ts#L1835), [src/engines/ffmpeg-wasm/adapter.ts:1847](../../src/engines/ffmpeg-wasm/adapter.ts#L1847)). HLS is likewise batch-materialized: the adapter rewrites a playlist, fetches every referenced segment or key using `cache: "no-store"`, and writes each object before invoking FFmpeg ([src/engines/ffmpeg-wasm/adapter.ts:1854](../../src/engines/ffmpeg-wasm/adapter.ts#L1854), [src/engines/ffmpeg-wasm/adapter.ts:929](../../src/engines/ffmpeg-wasm/adapter.ts#L929)). The recorded filesystem label mentions both MEMFS and WORKERFS, but the code never mounts WORKERFS ([src/engines/ffmpeg-wasm/adapter.ts:1571](../../src/engines/ffmpeg-wasm/adapter.ts#L1571)). Emscripten documents MEMFS as the in-memory default and WORKERFS as an explicitly mounted, read-only view of `File`/`Blob` objects ([Emscripten File System API](https://emscripten.org/docs/api_reference/Filesystem-API.html)).

`run()` passes an optional timeout to `FFmpeg.exec()` and turns a nonzero return code into an exception containing the command and the rolling log tail ([src/engines/ffmpeg-wasm/adapter.ts:1817](../../src/engines/ffmpeg-wasm/adapter.ts#L1817)). The adapter listens to logs only; it does not subscribe to the wrapper's experimental progress event ([src/engines/ffmpeg-wasm/adapter.ts:1536](../../src/engines/ffmpeg-wasm/adapter.ts#L1536)). The only benchmark progress callback occurs after a cell has completed ([src/core/runner.ts:2116](../../src/core/runner.ts#L2116)). Upstream cautions that progress is accurate only when input and output durations match ([ffmpeg.wasm usage guide](https://ffmpegwasm.netlify.app/docs/getting-started/usage/)).

`dispose()` terminates the worker and clears the logs, capabilities, and recorded configuration ([src/engines/ffmpeg-wasm/adapter.ts:1787](../../src/engines/ffmpeg-wasm/adapter.ts#L1787)). The runner disposes before its later attempt to read `configUsed`, so ordinary fresh-engine runs cannot persist the very configuration the adapter assembled ([src/core/runner.ts:1464](../../src/core/runner.ts#L1464), [src/core/runner.ts:2107](../../src/core/runner.ts#L2107)).

### Capability inventory and negotiation

The static capability declaration says all nine operations are available: probe, demux, remux, transcode, decode, seek, trim, mux, and decrypt ([src/engines/ffmpeg-wasm/adapter.ts:1452](../../src/engines/ffmpeg-wasm/adapter.ts#L1452)). It advertises these fallback sets:

| Dimension | Declared values | Evidence |
|---|---|---|
| Input containers | MP4, MOV, MKV, WebM, MPEG-TS, HLS, WAV, MP3, FLAC, Ogg, ADTS, AIFF, CAF | [src/engines/ffmpeg-wasm/adapter.ts:161](../../src/engines/ffmpeg-wasm/adapter.ts#L161) |
| Output containers | The same set except HLS | [src/engines/ffmpeg-wasm/adapter.ts:176](../../src/engines/ffmpeg-wasm/adapter.ts#L176) |
| Video input codecs | H.264, HEVC, VP8, VP9, AV1 | [src/engines/ffmpeg-wasm/adapter.ts:147](../../src/engines/ffmpeg-wasm/adapter.ts#L147) |
| Video output codecs | H.264, HEVC, VP8, VP9 | [src/engines/ffmpeg-wasm/adapter.ts:147](../../src/engines/ffmpeg-wasm/adapter.ts#L147) |
| Audio codecs | AAC, Opus, MP3, FLAC, Vorbis, signed 16-/24-bit PCM, float PCM, big-endian 16-/24-bit PCM | [src/engines/ffmpeg-wasm/adapter.ts:149](../../src/engines/ffmpeg-wasm/adapter.ts#L149) |

After loading, the adapter executes `-encoders`, `-decoders`, and `-formats`, parses the log text, and derives runtime codec/container intersections; empty or failed probes fall back to the static declaration ([src/engines/ffmpeg-wasm/adapter.ts:1679](../../src/engines/ffmpeg-wasm/adapter.ts#L1679), [src/engines/ffmpeg-wasm/codecs.ts:269](../../src/engines/ffmpeg-wasm/codecs.ts#L269)). H.264 maps to `libx264`, HEVC to `libx265`, VP8 to `libvpx`, and VP9 to `libvpx-vp9`; AV1 is decoder-only in this mapping ([src/engines/ffmpeg-wasm/codecs.ts:23](../../src/engines/ffmpeg-wasm/codecs.ts#L23), [src/engines/ffmpeg-wasm/codecs.ts:47](../../src/engines/ffmpeg-wasm/codecs.ts#L47)). Codec, muxer/demuxer, extension, and MIME aliases are centralized in the mapping module ([src/engines/ffmpeg-wasm/codecs.ts:70](../../src/engines/ffmpeg-wasm/codecs.ts#L70), [src/engines/ffmpeg-wasm/codecs.ts:103](../../src/engines/ffmpeg-wasm/codecs.ts#L103), [src/engines/ffmpeg-wasm/codecs.ts:168](../../src/engines/ffmpeg-wasm/codecs.ts#L168)). However, matrix preflight calls `capabilities()` before `runOne()` initializes the engine, and there is no second negotiation after the runtime probe ([src/core/runner.ts:2013](../../src/core/runner.ts#L2013), [src/core/runner.ts:1358](../../src/core/runner.ts#L1358)). For this adapter, the coarse static set therefore decides admission; runtime checks and FFmpeg execution still have to reject unsupported tuples.

The adapter also publishes feature tokens for video filters and quality modes; audio resampling, mixing, gain, and fades; frame-accurate/copy trims; fragmented MP4; three fast-start modes; metadata writes; CENC-CTR clear output; HLS AES-128; DTS packet reporting; selected remux pairs; and mux/decode-equality checks ([src/engines/ffmpeg-wasm/adapter.ts:1480](../../src/engines/ffmpeg-wasm/adapter.ts#L1480)). It does **not** advertise `target:writes`; the implementation returns one final `MediaBytes` object only. Streaming scenarios explicitly require that token for write-count/TTFB assertions ([src/scenarios/streaming-output/_shared.ts:20](../../src/scenarios/streaming-output/_shared.ts#L20), [src/scenarios/streaming-output/_shared.ts:131](../../src/scenarios/streaming-output/_shared.ts#L131)).

The runner's preflight gate tests each operation, container, codec, and feature token independently ([src/core/runner.ts:124](../../src/core/runner.ts#L124)). It cannot represent a tuple such as “decoder exists, encoder exists, and this codec/container/filter combination is supported.” Consequently, the adapter repeats tuple checks at execution time. Several transcode cases throw [`NotApplicableError`](../glossary.md#notapplicableerror) for known budget, encoder, alpha, HEVC 10-bit, or two-pass limitations ([src/engines/ffmpeg-wasm/adapter.ts:2165](../../src/engines/ffmpeg-wasm/adapter.ts#L2165), [src/engines/ffmpeg-wasm/adapter.ts:2261](../../src/engines/ffmpeg-wasm/adapter.ts#L2261)); four ffmpeg.wasm cells remain manually disabled ([src/core/disabled-cells.ts:36](../../src/core/disabled-cells.ts#L36)).

### Operation inventory

| Operation | Current implementation | Important boundary |
|---|---|---|
| Probe | Runs `ffmpeg -i` without an output, accepts the expected nonzero result when an `Input` block exists, and parses human-readable logs into rounded metadata ([src/engines/ffmpeg-wasm/adapter.ts:1892](../../src/engines/ffmpeg-wasm/adapter.ts#L1892), [src/engines/ffmpeg-wasm/adapter.ts:1906](../../src/engines/ffmpeg-wasm/adapter.ts#L1906), [src/engines/ffmpeg-wasm/adapter.ts:1945](../../src/engines/ffmpeg-wasm/adapter.ts#L1945)). | Track order follows log order; duration and FPS are rounded rather than retained as rationals ([src/engines/ffmpeg-wasm/adapter.ts:311](../../src/engines/ffmpeg-wasm/adapter.ts#L311)). |
| Demux | Maps all streams to FFmpeg's `framecrc` muxer, parses packet time bases/PTS/DTS/size/keyframe state, then sorts packets ([src/engines/ffmpeg-wasm/adapter.ts:1961](../../src/engines/ffmpeg-wasm/adapter.ts#L1961), [src/engines/ffmpeg-wasm/adapter.ts:438](../../src/engines/ffmpeg-wasm/adapter.ts#L438)). | `framecrc` is a test-oriented packet summary, not access to original packet bytes; FFmpeg defines its fields as stream index, timestamps, duration, size, and CRC ([FFmpeg framecrc](https://ffmpeg.org/ffmpeg-formats.html#framecrc)). |
| Remux | Uses `-map 0 -c copy`; applies fragmented flags or `+faststart` for MP4/MOV and zero mux delay for TS; rejects only explicitly known WebM codec incompatibilities before FFmpeg runs ([src/engines/ffmpeg-wasm/adapter.ts:2031](../../src/engines/ffmpeg-wasm/adapter.ts#L2031), [src/engines/ffmpeg-wasm/adapter.ts:903](../../src/engines/ffmpeg-wasm/adapter.ts#L903)). | FFmpeg streamcopy does not decode or encode, so representation and container framing can lawfully change while media essence remains equivalent ([FFmpeg streamcopy](https://ffmpeg.org/ffmpeg.html#Streamcopy)). |
| Transcode | Builds FFmpeg filter/codec arguments for resize, crop, flip, rotation, FPS, pad, tone-map, color metadata, quality/bitrate, two-pass video, and audio DSP; special paths handle pure audio and tuple budgets ([src/engines/ffmpeg-wasm/adapter.ts:2165](../../src/engines/ffmpeg-wasm/adapter.ts#L2165), [src/engines/ffmpeg-wasm/adapter.ts:2290](../../src/engines/ffmpeg-wasm/adapter.ts#L2290), [src/engines/ffmpeg-wasm/adapter.ts:2391](../../src/engines/ffmpeg-wasm/adapter.ts#L2391), [src/engines/ffmpeg-wasm/adapter.ts:2461](../../src/engines/ffmpeg-wasm/adapter.ts#L2461)). | Several suite-specific size/codec limits are hard-coded adapter policy rather than derived runtime capability ([src/engines/ffmpeg-wasm/adapter.ts:851](../../src/engines/ffmpeg-wasm/adapter.ts#L851)). |
| Trim | Copy mode uses timestamp offsets and `-c copy`; frame-accurate mode re-encodes, with codec-specific exclusions; FLAC output may receive a patched total-sample field ([src/engines/ffmpeg-wasm/adapter.ts:2538](../../src/engines/ffmpeg-wasm/adapter.ts#L2538), [src/engines/ffmpeg-wasm/adapter.ts:2601](../../src/engines/ffmpeg-wasm/adapter.ts#L2601)). | Copy and frame-accurate modes are materially different operations and can have different timestamp origins and priming behavior. |
| Decode and seek | Audio is decoded as interleaved float samples and video as a complete RGBA byte array; frame digests are generated in JavaScript. Seek invokes `-ss` and decodes one RGBA frame ([src/engines/ffmpeg-wasm/adapter.ts:2649](../../src/engines/ffmpeg-wasm/adapter.ts#L2649), [src/engines/ffmpeg-wasm/adapter.ts:2739](../../src/engines/ffmpeg-wasm/adapter.ts#L2739)). | Video PTS is synthesized as `frameIndex / fps`, audio PTS from sample index, and seek reports the requested/clamped target instead of an observed decoded timestamp ([src/engines/ffmpeg-wasm/adapter.ts:2706](../../src/engines/ffmpeg-wasm/adapter.ts#L2706), [src/engines/ffmpeg-wasm/adapter.ts:2763](../../src/engines/ffmpeg-wasm/adapter.ts#L2763)). |
| Mux and concat | Prepared tracks are extracted with streamcopy; original-source metadata enables a source-copy route. Otherwise the adapter reconstructs elementary streams and maps them into FFmpeg. Concatenation uses FFmpeg's concat demuxer ([src/engines/ffmpeg-wasm/adapter.ts:2791](../../src/engines/ffmpeg-wasm/adapter.ts#L2791), [src/engines/ffmpeg-wasm/adapter.ts:2899](../../src/engines/ffmpeg-wasm/adapter.ts#L2899), [src/engines/ffmpeg-wasm/adapter.ts:2949](../../src/engines/ffmpeg-wasm/adapter.ts#L2949)). | Rebuilt prepared tracks currently collapse each selected stream to one chunk at PTS/DTS zero; only the source-copy route preserves the original timing tables ([src/engines/ffmpeg-wasm/adapter.ts:2825](../../src/engines/ffmpeg-wasm/adapter.ts#L2825)). |
| Decrypt | HLS AES-128 is delegated to FFmpeg after playlist materialization. Nonfragmented [ISO BMFF](../glossary.md#iso-bmff) CENC-CTR is parsed and decrypted in JavaScript/WebCrypto, then stream-copied into a clear MP4 ([src/engines/ffmpeg-wasm/adapter.ts:2073](../../src/engines/ffmpeg-wasm/adapter.ts#L2073), [src/engines/ffmpeg-wasm/adapter.ts:2116](../../src/engines/ffmpeg-wasm/adapter.ts#L2116)). | The CENC parser accepts only `cenc`, limited sample-table forms, and 8- or 16-byte IVs; pattern encryption, fragmented files, and several auxiliary-info forms are outside its implementation ([src/engines/ffmpeg-wasm/adapter.ts:1135](../../src/engines/ffmpeg-wasm/adapter.ts#L1135), [src/engines/ffmpeg-wasm/adapter.ts:1237](../../src/engines/ffmpeg-wasm/adapter.ts#L1237), [src/engines/ffmpeg-wasm/adapter.ts:1349](../../src/engines/ffmpeg-wasm/adapter.ts#L1349)). |

The mux reconstruction path explicitly converts AVCC/HVCC length-prefixed NAL units to [Annex B](../glossary.md#annex-b), prepending parameter sets from codec configuration, and wraps AAC AudioSpecificConfig payloads in ADTS ([src/engines/ffmpeg-wasm/adapter.ts:3090](../../src/engines/ffmpeg-wasm/adapter.ts#L3090), [src/engines/ffmpeg-wasm/adapter.ts:511](../../src/engines/ffmpeg-wasm/adapter.ts#L511), [src/engines/ffmpeg-wasm/adapter.ts:626](../../src/engines/ffmpeg-wasm/adapter.ts#L626)). This is an intentional representation conversion. The WebCodecs AVC registration likewise distinguishes length-prefixed `avc` chunks carrying an `AVCDecoderConfigurationRecord` from Annex B chunks in which parameter sets accompany key chunks ([W3C WebCodecs AVC registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/)).

### Error and verdict route

The adapter defines a local class whose `name` is exactly `NotApplicableError` ([src/engines/ffmpeg-wasm/adapter.ts:113](../../src/engines/ffmpeg-wasm/adapter.ts#L113)). The runner deliberately recognizes that name across module boundaries and maps it to [`NA_ENGINE`](../glossary.md#na-engine). A runner `TimeoutError` around the functional operation becomes `FAIL`, while other unrecognized exceptions become [`ERROR`](../glossary.md#error); an `FFmpeg.exec()` timeout that merely returns nonzero is currently raised as the latter ([src/core/runner.ts:686](../../src/core/runner.ts#L686), [src/core/runner.ts:1382](../../src/core/runner.ts#L1382), [src/core/runner.ts:1464](../../src/core/runner.ts#L1464), [src/engines/ffmpeg-wasm/adapter.ts:1817](../../src/engines/ffmpeg-wasm/adapter.ts#L1817)). In the current adapter, known budget and tuple exclusions sometimes use `NotApplicableError`, but invalid media, unsupported decryption schemes, several mux incompatibilities, and some unavailable runtime forms throw ordinary `Error` ([src/engines/ffmpeg-wasm/adapter.ts:2109](../../src/engines/ffmpeg-wasm/adapter.ts#L2109), [src/engines/ffmpeg-wasm/adapter.ts:2165](../../src/engines/ffmpeg-wasm/adapter.ts#L2165), [src/engines/ffmpeg-wasm/adapter.ts:3043](../../src/engines/ffmpeg-wasm/adapter.ts#L3043)). That mixed boundary lets unsupported combinations leak into `ERROR` or an oracle `FAIL`.

The result model is currently binary at the oracle boundary: an oracle returns `pass: boolean`, the runner stops at the first false outcome, and the status type has no `DIFF` member ([src/core/scenario.ts:206](../../src/core/scenario.ts#L206), [src/core/runner.ts:1411](../../src/core/runner.ts#L1411)). This matters acutely for ffmpeg.wasm because streamcopy, FFmpeg bitstream filters, and the adapter's own elementary-stream conversion can change NAL grouping, parameter-set placement, and packet sizes without changing decoded media.

## Contracts and invariants

The following statements are the current adapter contract unless explicitly marked as a target:

- **Identity and isolation.** The factory registry key is `ffmpeg-wasm`, while the adapter's canonical result identity is `ffmpeg.wasm@0.12.15`; normal execution uses a fresh worker per cell ([src/engines/ffmpeg-wasm/register.ts:14](../../src/engines/ffmpeg-wasm/register.ts#L14), [src/engines/ffmpeg-wasm/adapter.ts:113](../../src/engines/ffmpeg-wasm/adapter.ts#L113), [src/core/runner.ts:1865](../../src/core/runner.ts#L1865)). No caller may assume caches, warmed codec state, or files survive between cells.
- **Initialization.** Every operation requires a loaded wrapper. Public operation methods reach the wrapper through `requireFf()`, which throws if initialization has not completed ([src/engines/ffmpeg-wasm/adapter.ts:1801](../../src/engines/ffmpeg-wasm/adapter.ts#L1801)). Concurrent `init()` calls are not currently safe; callers must serialize them until the target single-flight contract is implemented.
- **Filesystem ownership.** Adapter-created filenames are unique within an instance and should be deleted in each operation's `finally` block; `dispose()` is the final containment boundary ([src/engines/ffmpeg-wasm/adapter.ts:1807](../../src/engines/ffmpeg-wasm/adapter.ts#L1807), [src/engines/ffmpeg-wasm/adapter.ts:1847](../../src/engines/ffmpeg-wasm/adapter.ts#L1847)). Inputs and outputs are presently copied through MEMFS, so large-file feasibility includes multiple browser-memory copies.
- **Command success.** Except for the probe-info command's expected nonzero exit, any nonzero FFmpeg exit is an adapter exception carrying a bounded log tail ([src/engines/ffmpeg-wasm/adapter.ts:1817](../../src/engines/ffmpeg-wasm/adapter.ts#L1817), [src/engines/ffmpeg-wasm/adapter.ts:1906](../../src/engines/ffmpeg-wasm/adapter.ts#L1906)).
- **Capability truthfulness.** A declared operation/token means only that preflight may admit the scenario; it does not currently prove combinatorial support. The target invariant is stronger: if a valid requested tuple is unavailable in this build, the adapter must throw `NotApplicableError`, yielding `NA_ENGINE`, before an oracle is asked to judge output.
- **Batch output.** Remux, transcode, trim, mux, concat, and decrypt resolve only after a complete output file has been read into a `Uint8Array` ([src/engines/ffmpeg-wasm/adapter.ts:1839](../../src/engines/ffmpeg-wasm/adapter.ts#L1839)). The engine therefore makes no claim of incremental `target:writes`, backpressure, or time-to-first-byte support.
- **Stream selection.** Remux and the primary transcode path use explicit FFmpeg `-map` arguments; streamcopy is used when the requested operation is intended to preserve encoded essence ([src/engines/ffmpeg-wasm/adapter.ts:2041](../../src/engines/ffmpeg-wasm/adapter.ts#L2041), [src/engines/ffmpeg-wasm/adapter.ts:2237](../../src/engines/ffmpeg-wasm/adapter.ts#L2237)). FFmpeg's mapping rules, not browser track defaults, determine selected streams ([FFmpeg stream selection](https://ffmpeg.org/ffmpeg.html#Stream-selection)).
- **Representation neutrality.** [AVCC](../glossary.md#avcc) versus Annex B, inline versus out-of-band SPS/PPS, access-unit grouping, legal muxer timestamp shifts, and equivalent metadata signaling are not inherently corruption. The target oracle contract classifies such valid differences as `DIFF`; `FAIL` is reserved for semantic invalidity.
- **Timing.** Current decoded frame and seek timestamps are estimates derived from aggregate metadata, not observed decoder timestamps. Consumers must not treat them as evidence of VFR cadence, B-frame reorder, edit-list application, or exact seek landing.
- **Cancellation.** Per-command timeout is passed to the wrapper, and whole-cell cleanup terminates the worker. There is no adapter-level `AbortSignal`, cooperative cancellation, or timeout-class translation today. Upstream termination cancels all pending executions, not one selected command ([ffmpeg.wasm `terminate`](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/#terminate)).
- **Determinism record.** Commands, wrapper/core versions, chosen core kind, asset URLs/build identity, thread count, and relevant environment must be persisted before disposal. The current code assembles only part of that record and clears it too early; this is a known contract violation, not permission to omit provenance.

## Target design and known gaps

### Target design

#### 1. Make support tuple-aware and runtime failures intentional

Keep the shared token gate as a cheap preflight, but add an adapter-owned support decision for the complete tuple: operation, input container/codecs, output container/codecs, filters, bit depth/alpha, encryption scheme, track cardinality, and size/resource class. Base the decision on the parsed runtime build plus explicit adapter limitations, not on a broad static union. WebCodecs itself treats codec support as optional and configuration-dependent; a browser benchmark should be equally explicit about build/configuration support ([W3C WebCodecs](https://www.w3.org/TR/webcodecs/)).

For a structurally valid request that this installed core or adapter route cannot perform, throw `NotApplicableError` with a stable reason code and the rejected tuple. This must become `NA_ENGINE`, not `ERROR`. Preserve ordinary errors for malformed/truncated input, invariant violations, and actual FFmpeg crashes. Replace each hand-maintained ffmpeg.wasm disabled cell with a conformance test that proves either successful execution or runtime `NA_ENGINE`; the disabled-cell entries can then be deleted.

Acceptance criteria:

- Static fallback capability data is marked “unverified,” never silently treated as a successful runtime probe.
- Every advertised codec/container pair has a positive smoke test and at least one negative tuple test.
- H.264-to-HEVC, AV1-to-H.264, resize-budget, alpha, two-pass, mux legality, and decryption-scheme cases produce `NA_ENGINE` when unsupported.
- Invalid bytes for a supported tuple remain `FAIL`/`ERROR` according to the scenario contract and are never laundered into NA.

#### 2. Establish a race-safe lifecycle and bounded memory model

Make initialization single-flight with a shared promise and define one of two enforceable execution models: serialize commands on one worker, or create an isolated worker/FS per concurrent command. A dispose or cancellation request during load must settle every waiter exactly once. After timeout or termination, mark the instance unusable until a fresh successful `load()`; this follows the upstream wrapper's termination contract ([ffmpeg.wasm `FFmpeg` API](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/)).

Thread a benchmark cancellation signal through initialization, fetch/materialization, execution, and output reads. Because upstream termination cancels all pending calls, cancellation must be instance-scoped or command serialization must prevent collateral cancellation. Translate expected resource ceilings and user cancellation to stable non-crash outcomes; preserve a distinct `ERROR` for hung or broken workers.

Large-input policy must account for the wrapper heap, MEMFS input, FFmpeg working buffers, MEMFS output, and JavaScript copies. Upstream documents a hard 2 GB WebAssembly input limit and warns that multithreading uses more memory and CPU even when faster ([ffmpeg.wasm FAQ](https://ffmpegwasm.netlify.app/docs/faq/)). Use mounted WORKERFS (or a future streaming FS route) for eligible browser `File`/`Blob` inputs, cap HLS materialization, and expose measured/estimated peak bytes. A cleanup conformance suite must inspect the FS after success, `NotApplicableError`, FFmpeg failure, timeout, cancellation, and partial HLS fetch.

#### 3. Preserve media time as time, not frame indexes

Probe through a machine-readable interface or a purpose-built parser rather than scraping human log formatting. FFprobe exposes structured format, stream, packet, and frame records with timestamps and time bases ([ffprobe documentation](https://ffmpeg.org/ffprobe.html)). Return rational frame-rate candidates and time bases, distinguish nominal CFR from VFR, keep per-frame observed PTS through decode, and report actual seek landing. Prepared mux tracks must retain every chunk's PTS, DTS, duration, and keyframe state rather than collapsing a stream to one zero-time chunk.

The [`golden metadata`](../glossary.md#golden-metadata) comparator—not the engine—must then apply shared semantic normalization: canonicalize `avc1`/`avc3`/`V_MPEG4/ISO/AVC` to H.264, `hev1`/`hvc1` to HEVC, and `mp4a` to AAC; match tracks by media type and stable attributes rather than index; band [NTSC rates](../glossary.md#ntsc-rate) and [VFR](../glossary.md#vfr); and widen duration tolerance for [edit lists](../glossary.md#edit-list), codec [priming](../glossary.md#priming), and [timebase](../glossary.md#timebase) quantization. Treat [HE-AAC/SBR](../glossary.md#he-aacsbr) core versus rendered sample rate (base versus 2×) and [Parametric Stereo](../glossary.md#parametric-stereo) mono-core versus stereo-output channel reports as semantically equal. ETSI's HE-AAC transport guidance explicitly describes SBR output at twice the AAC core rate and Parametric Stereo converting a mono core to stereo ([ETSI TS 102 005, Annex A](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf)).

#### 4. Separate semantic failure from legal packet representation

Introduce the three-way oracle verdict contract:

- `PASS`: semantically correct and equivalent to the golden under the oracle's declared representation contract.
- `DIFF`: valid and semantically correct, but represented differently from the ffmpeg-baked golden.
- `FAIL`: invalid, corrupt, semantically wrong, or outside an explicit required tolerance.

For [`golden packets`](../glossary.md#golden-packets), stop requiring byte-exact packet count, packet size, and keyframe layout when the operation permits repacketization. AVCC length prefixes versus Annex B start codes, SPS/PPS stored in configuration versus repeated in-band, and different NAL/access-unit grouping are legal representation differences. FFmpeg's `h264_mp4toannexb` and `hevc_mp4toannexb` filters explicitly convert length-prefixed streams to Annex B ([FFmpeg bitstream filters](https://ffmpeg.org/ffmpeg-bitstream-filters.html#h264_005fmp4toannexb)); the WebCodecs AVC registration gives both formats distinct but valid carriage rules ([W3C WebCodecs AVC registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/)). Decode/probe invariants and codec-configuration validity should decide semantic correctness; legal packet-shape divergence should be `DIFF`.

The ffmpeg.wasm adapter should attach representation facts to its output—chosen muxer, bitstream filters, codec tag, extradata form, and command—so the oracle can explain `DIFF` rather than infer it from a size mismatch. This is especially important for the mux reconstruction path, which intentionally converts AVCC/HVCC to Annex B.

Keep `ssim-psnr`'s source reference as the neutral in-browser WebCodecs decode; that is fair by design and independent of ffmpeg.wasm's own decoder ([src/core/oracles.ts:1758](../../src/core/oracles.ts#L1758)). Fix its two known false-fail paths instead: pair transformed frames by timestamp/window rather than index when FPS or frame count changes, and separate “valid output but unavailable to the platform decoder” from a measured quality failure. Today candidate decode failure is immediately false and golden/reference frames are paired by array index ([src/core/oracles.ts:1776](../../src/core/oracles.ts#L1776), [src/core/oracles.ts:1811](../../src/core/oracles.ts#L1811)). A browser-decode-required scenario may still fail its dedicated playback contract; a codec unavailable to the neutral decoder should otherwise be `NA_BROWSER` or `DIFF` according to the scenario's declared interoperability requirement, not a fabricated SSIM defect.

For exhaustive robustness runs over several files, retain every per-file status and aggregate a partial grade such as `passedFiles / attemptedFiles`. “Passes file 01, fails 02 and 03” is a robustness signal, not a cell-wide `ERROR`; only an infrastructure failure that prevents the set from being attempted should be `ERROR`.

#### 5. Tell the truth about streaming and MP4 layout

Keep `target:writes` absent until bytes are actually delivered incrementally through the engine output target with bounded buffering and backpressure. A fragmented output held entirely in MEMFS and returned after process exit is “fragmented batch output,” not streaming output. If an incremental backend is added, report first-write time, write count/size distribution, peak queued bytes, completion, and cancellation behavior.

Split the current MP4 layout tokens into mechanisms that match FFmpeg:

- `fastStart:in-memory` may map to `-movflags +faststart`, which performs a second pass to move `moov` before media.
- `fastStart:reserve` must use and verify `-moov_size <bytes>` (or cease advertising reserve).
- Fragmented output must declare the exact fragment flags and prove independently decodable initialization plus ordered fragments.

FFmpeg documents `faststart` as a second-pass relocation, `moov_size` as reserved header space, and fragmentation as a way to reduce writer memory and leave partial files decodable if writing is interrupted ([FFmpeg MOV/MP4 muxer](https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv)). The current `fastStart:reserve` token and `+faststart` command are therefore not equivalent.

#### 6. Record a reproducible execution envelope

Persist configuration before disposal and include: npm package versions; core asset hashes/URLs; single- versus multithreaded core; the actual FFmpeg banner/build configuration; runtime encoder/decoder/muxer/demuxer probe digest; every command argument; worker timeout; input/output byte sizes; cross-origin isolation; user agent; hardware concurrency; and adapter policy/budget reason codes. Redact only user-originated path material. Do not rely on the mutable log tail as the sole command record.

Progress must be honest telemetry, not a synthetic percentage. Subscribe to upstream progress only for same-duration jobs where its documented assumption holds; otherwise emit phase transitions (`materialize`, `execute`, `read`, `cleanup`) and observed byte/frame counters. Cancellation and timeout events must include the phase and whether worker termination was required.

#### 7. Conformance suite for the adapter boundary

Add adapter-level tests independent of family oracles:

1. exact dependency/core identity and production asset reachability;
2. single-flight initialization, concurrent operation policy, failed-load retry, and dispose-during-load;
3. runtime capability parsing, static-fallback marking, and tuple rejection to `NA_ENGINE`;
4. FS cleanup and bounded-copy behavior across every exit path;
5. command snapshot tests for probe, streamcopy, each encoder family, trim modes, MP4 layout modes, mux reconstruction, and decrypt routes;
6. AVCC/Annex B round trips with in-band/out-of-band parameter sets and alternate NAL grouping, expecting `PASS` or `DIFF`, never representation-only `FAIL`;
7. HE-AAC/SBR and Parametric Stereo metadata equivalence, VFR/NTSC rate bands, edit-list/priming/timebase duration bands, and type-based multitrack matching;
8. timestamp-aligned `ssim-psnr`, valid-but-platform-undecodable output classification, and partial multi-file robustness grades;
9. observed B-frame/VFR decode PTS and actual seek landing;
10. incremental-output tests that remain skipped/`NA_ENGINE` until `target:writes` is genuinely implemented; and
11. deterministic config capture on success, `DIFF`, `FAIL`, `NA_ENGINE`, timeout, cancellation, and FFmpeg error.

### Known gaps

#### Capability declarations are coarse

**Current.** The gate checks tokens independently, runtime probes reduce only broad codec/container sets, and tuple-specific limitations are scattered through operations and a disabled-cell list ([src/core/runner.ts:124](../../src/core/runner.ts#L124), [src/engines/ffmpeg-wasm/adapter.ts:1679](../../src/engines/ffmpeg-wasm/adapter.ts#L1679), [src/core/disabled-cells.ts:36](../../src/core/disabled-cells.ts#L36)).

**Consequence.** A combinatorially unsupported cell can enter execution and become `ERROR`/`FAIL`, overstating an engine defect; manual skips can also outlive the limitation they describe.

**Target and verification.** Centralize tuple support, use reason-coded `NotApplicableError`, and delete a disabled cell only after a test demonstrates the equivalent runtime `NA_ENGINE` or successful path.

#### Packet and metadata oracles conflate representation with correctness

**Current.** `golden-metadata` compares tracks positionally and raw codec/sample-rate/channel fields; `golden-packets` requires exact packet count, size, and keyframe values ([src/core/oracles.ts:721](../../src/core/oracles.ts#L721), [src/core/oracles.ts:835](../../src/core/oracles.ts#L835)). The reference re-import path already has broader codec canonicalization, showing the inconsistency ([src/core/oracles.ts:341](../../src/core/oracles.ts#L341)).

**Consequence.** ffmpeg.wasm can produce valid ISO BMFF, Annex B, AAC, or timestamp representations yet receive `FAIL` merely because they differ from one baked FFmpeg representation.

**Target and verification.** Implement the canonicalization/equivalence bands above and three-way `PASS`/`DIFF`/`FAIL`; fixtures covering alternate codec tags, HE-AAC signaling, track order, NTSC/VFR, edit lists, priming, AVCC/Annex B, parameter sets, and NAL grouping must exercise every branch.

#### Decode and seek discard real timing

**Current.** Raw video/audio output loses container timestamps; JavaScript synthesizes them from frame/sample indexes, and seek echoes the clamped request ([src/engines/ffmpeg-wasm/adapter.ts:2706](../../src/engines/ffmpeg-wasm/adapter.ts#L2706), [src/engines/ffmpeg-wasm/adapter.ts:2763](../../src/engines/ffmpeg-wasm/adapter.ts#L2763)).

**Consequence.** VFR cadence, reorder, edit-list effects, discontinuities, and keyframe seek landing can appear correct when they are not.

**Target and verification.** Capture observed timestamps through a structured side channel and assert VFR, B-frame, negative-origin/edit-list, and between-keyframe seek cases against decoded content plus actual PTS.

#### Initialization and cancellation are not concurrency-safe

**Current.** `init()` has only a post-load instance guard, operations share one worker/FS, and timeout/cancel ultimately depend on whole-worker termination ([src/engines/ffmpeg-wasm/adapter.ts:1525](../../src/engines/ffmpeg-wasm/adapter.ts#L1525), [src/engines/ffmpeg-wasm/adapter.ts:1787](../../src/engines/ffmpeg-wasm/adapter.ts#L1787)).

**Consequence.** Direct concurrent use can double-load or interleave state; cancellation can affect unrelated work; a timed-out instance may have ambiguous reuse state.

**Target and verification.** Add a shared init promise plus explicit command serialization/isolation, signal propagation, and terminal-state tests for every race ordering.

#### Memory and cleanup claims are stronger than the implementation

**Current.** Inputs, HLS sidecars, raw decoded frames, and outputs are materialized in MEMFS and often copied again into JavaScript; WORKERFS is named but never mounted ([src/engines/ffmpeg-wasm/adapter.ts:1854](../../src/engines/ffmpeg-wasm/adapter.ts#L1854), [src/engines/ffmpeg-wasm/adapter.ts:2649](../../src/engines/ffmpeg-wasm/adapter.ts#L2649)). Deletion failures are swallowed.

**Consequence.** Peak memory can greatly exceed asset size, and failed cleanup is invisible until the worker is terminated.

**Target and verification.** Report the real FS backend, adopt a zero-/lower-copy input route where feasible, enforce materialization ceilings, and test FS emptiness plus peak memory after each success/failure phase.

#### Streaming and reserve-fast-start feature names overstate behavior

**Current.** Every media-producing operation waits for a completed file; `fastStart:reserve` is advertised, but MP4 paths use `-movflags +faststart` rather than `-moov_size` ([src/engines/ffmpeg-wasm/adapter.ts:1503](../../src/engines/ffmpeg-wasm/adapter.ts#L1503), [src/engines/ffmpeg-wasm/adapter.ts:2045](../../src/engines/ffmpeg-wasm/adapter.ts#L2045), [src/engines/ffmpeg-wasm/adapter.ts:2517](../../src/engines/ffmpeg-wasm/adapter.ts#L2517), [src/engines/ffmpeg-wasm/adapter.ts:2930](../../src/engines/ffmpeg-wasm/adapter.ts#L2930)).

**Consequence.** Fragment structure or front-loaded `moov` can be mistaken for incremental output or pre-reserved-header behavior.

**Target and verification.** Rename capabilities to describe actual batch layout, implement real reserved space if claimed, and require observable writes/backpressure before enabling `target:writes`.

#### Configuration and progress evidence is lost or incomplete

**Current.** The adapter clears `configUsed` during disposal before the runner records it, logs are bounded and mutable, and progress is cell-completion only ([src/engines/ffmpeg-wasm/adapter.ts:1787](../../src/engines/ffmpeg-wasm/adapter.ts#L1787), [src/core/runner.ts:2107](../../src/core/runner.ts#L2107)).

**Consequence.** Results cannot reliably prove the core/build/command that generated them, and the UI cannot distinguish downloading/materializing, executing, reading, or cleanup.

**Target and verification.** Snapshot immutable provenance into the operation result before disposal and emit phase telemetry; compare snapshots across repeated runs and ensure every terminal status retains one.

#### Mux timing is route-dependent

**Current.** The source-copy path can preserve input timing tables, while generic prepared tracks are flattened to one extracted blob with zero timestamps before reconstruction ([src/engines/ffmpeg-wasm/adapter.ts:2791](../../src/engines/ffmpeg-wasm/adapter.ts#L2791), [src/engines/ffmpeg-wasm/adapter.ts:2899](../../src/engines/ffmpeg-wasm/adapter.ts#L2899)).

**Consequence.** The same logical mux request can preserve VFR/reorder timing only when private source metadata happens to be present.

**Target and verification.** Make prepared tracks fully timestamped and route-independent; run equivalent source-copy and public-track assembly tests and compare duration, cadence, DTS order, decode, and `PASS`/`DIFF` classification.

#### CENC support and error translation are narrow

**Current.** Clear-output decryption supports a deliberately limited nonfragmented CENC-CTR shape, while other schemes and table forms often throw ordinary errors ([src/engines/ffmpeg-wasm/adapter.ts:2116](../../src/engines/ffmpeg-wasm/adapter.ts#L2116), [src/engines/ffmpeg-wasm/adapter.ts:1283](../../src/engines/ffmpeg-wasm/adapter.ts#L1283)).

**Consequence.** A valid but unsupported protected file can be reported like corrupted media or a broken engine.

**Target and verification.** Probe protection metadata first; return reason-coded `NA_ENGINE` for valid unsupported schemes/forms, and reserve `FAIL`/`ERROR` for wrong keys, damaged boxes, invalid sample ranges, or crypto/runtime defects. Cover fragmented CENC, CBCS/pattern encryption, override parameters, auxiliary-info variants, wrong-key output, and truncated ciphertext separately.

## Sources

### Repository evidence

- [package.json:30](../../package.json#L30), [package.json:32](../../package.json#L32), [bun.lock:112](../../bun.lock#L112), and [bun.lock:116](../../bun.lock#L116) — exact ffmpeg.wasm package/core versions.
- [vite.config.mjs:164](../../vite.config.mjs#L164) and [vite.config.mjs:217](../../vite.config.mjs#L217) — development serving and production copying of worker/core assets.
- [vite.config.mjs:252](../../vite.config.mjs#L252) — cross-origin isolation headers.
- [src/engines/ffmpeg-wasm/register.ts:14](../../src/engines/ffmpeg-wasm/register.ts#L14) and [src/app/register.ts:53](../../src/app/register.ts#L53) — registration and app loading.
- [src/engines/ffmpeg-wasm/codecs.ts:23](../../src/engines/ffmpeg-wasm/codecs.ts#L23), [src/engines/ffmpeg-wasm/codecs.ts:70](../../src/engines/ffmpeg-wasm/codecs.ts#L70), and [src/engines/ffmpeg-wasm/codecs.ts:269](../../src/engines/ffmpeg-wasm/codecs.ts#L269) — codec/container aliases and runtime capability derivation.
- [src/engines/ffmpeg-wasm/adapter.ts:1414](../../src/engines/ffmpeg-wasm/adapter.ts#L1414), [src/engines/ffmpeg-wasm/adapter.ts:1452](../../src/engines/ffmpeg-wasm/adapter.ts#L1452), and [src/engines/ffmpeg-wasm/adapter.ts:1480](../../src/engines/ffmpeg-wasm/adapter.ts#L1480) — state, declared operations, and feature tokens.
- [src/engines/ffmpeg-wasm/adapter.ts:1525](../../src/engines/ffmpeg-wasm/adapter.ts#L1525), [src/engines/ffmpeg-wasm/adapter.ts:1679](../../src/engines/ffmpeg-wasm/adapter.ts#L1679), and [src/engines/ffmpeg-wasm/adapter.ts:1787](../../src/engines/ffmpeg-wasm/adapter.ts#L1787) — initialization, runtime probes, warmup, and disposal.
- [src/engines/ffmpeg-wasm/adapter.ts:1817](../../src/engines/ffmpeg-wasm/adapter.ts#L1817), [src/engines/ffmpeg-wasm/adapter.ts:1835](../../src/engines/ffmpeg-wasm/adapter.ts#L1835), and [src/engines/ffmpeg-wasm/adapter.ts:1854](../../src/engines/ffmpeg-wasm/adapter.ts#L1854) — command execution and virtual-file materialization.
- [src/engines/ffmpeg-wasm/adapter.ts:1892](../../src/engines/ffmpeg-wasm/adapter.ts#L1892), [src/engines/ffmpeg-wasm/adapter.ts:1961](../../src/engines/ffmpeg-wasm/adapter.ts#L1961), and [src/engines/ffmpeg-wasm/adapter.ts:2031](../../src/engines/ffmpeg-wasm/adapter.ts#L2031) — probe, demux, and remux.
- [src/engines/ffmpeg-wasm/adapter.ts:2073](../../src/engines/ffmpeg-wasm/adapter.ts#L2073), [src/engines/ffmpeg-wasm/adapter.ts:2116](../../src/engines/ffmpeg-wasm/adapter.ts#L2116), and [src/engines/ffmpeg-wasm/adapter.ts:2165](../../src/engines/ffmpeg-wasm/adapter.ts#L2165) — decrypt and transcode routes.
- [src/engines/ffmpeg-wasm/adapter.ts:2538](../../src/engines/ffmpeg-wasm/adapter.ts#L2538), [src/engines/ffmpeg-wasm/adapter.ts:2649](../../src/engines/ffmpeg-wasm/adapter.ts#L2649), and [src/engines/ffmpeg-wasm/adapter.ts:2739](../../src/engines/ffmpeg-wasm/adapter.ts#L2739) — trim, decode, and seek.
- [src/engines/ffmpeg-wasm/adapter.ts:2791](../../src/engines/ffmpeg-wasm/adapter.ts#L2791), [src/engines/ffmpeg-wasm/adapter.ts:2899](../../src/engines/ffmpeg-wasm/adapter.ts#L2899), and [src/engines/ffmpeg-wasm/adapter.ts:2949](../../src/engines/ffmpeg-wasm/adapter.ts#L2949) — mux preparation, mux routes, and concat.
- [src/engines/ffmpeg-wasm/adapter.ts:3090](../../src/engines/ffmpeg-wasm/adapter.ts#L3090), [src/engines/ffmpeg-wasm/adapter.ts:511](../../src/engines/ffmpeg-wasm/adapter.ts#L511), and [src/engines/ffmpeg-wasm/adapter.ts:626](../../src/engines/ffmpeg-wasm/adapter.ts#L626) — elementary-stream reconstruction and AVC/HEVC/AAC conversion.
- [src/core/runner.ts:124](../../src/core/runner.ts#L124), [src/core/runner.ts:686](../../src/core/runner.ts#L686), [src/core/runner.ts:1358](../../src/core/runner.ts#L1358), and [src/core/runner.ts:1411](../../src/core/runner.ts#L1411) — capability gate, `NotApplicableError`, lifecycle, and verdict collapse.
- [src/core/scenario.ts:206](../../src/core/scenario.ts#L206), [src/core/oracles.ts:721](../../src/core/oracles.ts#L721), and [src/core/oracles.ts:835](../../src/core/oracles.ts#L835) — binary result/oracle schema and current metadata/packet comparison.
- [src/core/disabled-cells.ts:36](../../src/core/disabled-cells.ts#L36) — ffmpeg.wasm hand-maintained exclusions.
- [src/scenarios/streaming-output/_shared.ts:20](../../src/scenarios/streaming-output/_shared.ts#L20) — real write-target capability prerequisite.

### External authorities

- [ffmpeg.wasm v0.12.15 release](https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15) — wrapper/core version pairing. Accessed 2026-07-16.
- [ffmpeg.wasm API: module](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/) and [`FFmpeg` class](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/) — load, exec, filesystem, events, and terminate lifecycle. Accessed 2026-07-16.
- [ffmpeg.wasm overview](https://ffmpegwasm.netlify.app/docs/overview/) — worker/core architecture and virtual filesystem flow. Accessed 2026-07-16.
- [ffmpeg.wasm usage guide](https://ffmpegwasm.netlify.app/docs/getting-started/usage/) — core loading and progress limitation. Accessed 2026-07-16.
- [ffmpeg.wasm FAQ](https://ffmpegwasm.netlify.app/docs/faq/) — WebAssembly input ceiling and multithread memory/CPU trade-offs. Accessed 2026-07-16.
- [Emscripten File System API](https://emscripten.org/docs/api_reference/Filesystem-API.html) — MEMFS default and WORKERFS mount semantics. Accessed 2026-07-16.
- [MDN: Cross-Origin-Opener-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy) — COOP/COEP and cross-origin isolation requirements. Accessed 2026-07-16.
- [FFmpeg command-line documentation](https://ffmpeg.org/ffmpeg.html) — stream selection, streamcopy, timestamps, and command behavior. Accessed 2026-07-16.
- [ffprobe documentation](https://ffmpeg.org/ffprobe.html) — structured format/stream/packet/frame inspection. Accessed 2026-07-16.
- [FFmpeg formats: framecrc](https://ffmpeg.org/ffmpeg-formats.html#framecrc), [MOV/MP4](https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv), and [concat](https://ffmpeg.org/ffmpeg-formats.html#concat-1) — packet summaries, MP4 layout controls, and concat demuxing. Accessed 2026-07-16.
- [FFmpeg bitstream filters](https://ffmpeg.org/ffmpeg-bitstream-filters.html#h264_005fmp4toannexb) — H.264/HEVC conversion from length-prefixed carriage to Annex B. Accessed 2026-07-16.
- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/) and [AVC codec registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/) — configuration-dependent support and AVCC/Annex B chunk formats. Accessed 2026-07-16.
- [ISO/IEC 14496-12:2026 catalogue entry](https://www.iso.org/standard/85596.html) — ISO Base Media File Format timing, structure, and media-information scope. Accessed 2026-07-16.
- [ETSI TS 102 005, Annex A](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf) — HE-AAC/SBR sample-rate and Parametric Stereo relationships. Accessed 2026-07-16.
