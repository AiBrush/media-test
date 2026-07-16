# Engine adapter contract

> Scope: The shared scored-engine boundary from registration through capability declaration, lifecycle, normalized observations, telemetry, cleanup, and applicability/error translation; engine-specific implementation details and runner/oracle policy remain on their owning pages.
> Phase-2 owner: p2_subsystem_engine_adapter_contract.

## Purpose

An [adapter](../glossary.md#adapter) makes one media framework look like an [engine](../glossary.md#engine) to the rest of the benchmark. This page answers the implementer's question: what must that boundary declare, execute, normalize, measure, release, and reject so that an engine can be compared without exposing framework-native objects or silently changing the meaning of a [cell](../glossary.md#cell)? It is the implementation contract used by engine authors, runner maintainers, and later cleanup agents.

The page owns the shared boundary, not any engine's feature inventory. See the six pages under `docs/engines/` for implementation-specific support, [runner and capability negotiation](../subsystems/runner-capability-negotiation.md) for matrix policy, [scenario DSL and registry](../subsystems/scenario-dsl-registry.md) for the engine-independent request model, and [oracle system](../subsystems/oracle-system.md) for correctness semantics.

## As-built

### Interface and normalized observations

`MediaEngine` has a stable instance `id`, a synchronous `capabilities()` declaration, an optional reportable `configUsed` object, optional `init()`/`dispose()`, and methods for the benchmark's operations. Probe, demux, remux, transcode, decode, seek, and trim are required by the TypeScript interface even when an engine does not declare them; mux preparation, mux, concatenation, and decrypt are optional hooks. [src/core/engine.ts:197-237](../../src/core/engine.ts#L197-L237)

The runner dispatches exactly one method from `scenario.op`. It supplies defaulted and narrowed options, requires `mux()` when the mux operation was declared, obtains mux-ready tracks from either `options.tracks` or `prepareMuxTracks()`, and requires `decrypt()` for decrypt. `concat()` is not an `Operation` dispatch branch; a trim-composition oracle invokes it directly after making three additional `trim()` calls. [src/core/runner.ts:789-845](../../src/core/runner.ts#L789-L845) [src/core/oracles.ts:3498-3521](../../src/core/oracles.ts#L3498-L3521)

The normalized carrier types are:

| Carrier | Observable contract in the declaration |
| --- | --- |
| `MediaInput` | Logical id, served URL, MIME type, optional known size, a mutation flag, and lazy `blob()`/`arrayBuffer()` access. [src/core/engine.ts:13-26](../../src/core/engine.ts#L13-L26) |
| `MediaBytes` | Owned `Uint8Array` output plus MIME/container, optional output-target write count and first-byte latency, and optional rendition variants. [src/core/engine.ts:28-39](../../src/core/engine.ts#L28-L39) |
| `NormalizedMetadata` | Container, nullable seconds duration, optional string tags, and tracks with canonical type plus codec and media properties. [src/core/engine.ts:41-61](../../src/core/engine.ts#L41-L61) |
| `DemuxResult` | Normalized metadata plus packets carrying track index, byte size, PTS/DTS in microseconds, and keyframe flag. [src/core/engine.ts:63-74](../../src/core/engine.ts#L63-L74) |
| `FrameSink` | Presentation evidence as indexed, microsecond-timestamped SHA-256 frame digests, with optional lazy `ImageData` access. The declaration says digests are over normalized tight RGBA. [src/core/engine.ts:76-94](../../src/core/engine.ts#L76-L94) |
| `EncodedTracks` | Mux input tracks with codec, timescale, optional codec-private `description`, and owned chunks whose PTS, DTS, and duration are in microseconds. [src/core/engine.ts:163-179](../../src/core/engine.ts#L163-L179) |

The core exposes canonical container, video-codec, and audio-codec vocabularies, but the result declarations themselves still use unconstrained `string` fields. [src/core/engine.ts:242-276](../../src/core/engine.ts#L242-L276) The runner passes an adapter's returned object directly into the oracle context and does not perform a runtime shape, finiteness, token, track-index, or ownership validation step. [src/core/runner.ts:1480-1519](../../src/core/runner.ts#L1480-L1519)

`MediaInput` fetches lazily and memoizes one `ArrayBuffer` per input object. Mutations receive a copy and return a tight buffer; `blob()` is then built from `arrayBuffer()`. [src/core/runner.ts:580-628](../../src/core/runner.ts#L580-L628) A benchmark iteration creates new input objects, but all warmups and measured iterations execute on the same initialized engine instance. [src/core/runner.ts:1637-1701](../../src/core/runner.ts#L1637-L1701)

### Capability declaration and registration

`CapabilitySet` is a collection of independent [capability tokens](../glossary.md#capability-token): operation booleans; input/output container arrays; flat codec arrays with optional read/write-specific codec arrays; encryption schemes; and free-form features. It has no container-codec table, option constraints, input-track predicate, asynchronous probe, or operation-tuple rule. [src/core/engine.ts:115-137](../../src/core/engine.ts#L115-L137)

The [capability gate](../glossary.md#capability-gate) tests each required token independently. It first returns `NA_ENGINE` for an undeclared operation/container/codec/encryption/feature, then applies browser checks; it never asks whether the complete operation × input × output × codec × options tuple is supported. [src/core/runner.ts:113-189](../../src/core/runner.ts#L113-L189) Browser codec support is likewise cached per canonical codec using representative 1920×1080 video and 48 kHz stereo audio configurations, not the concrete source track's full decoder configuration. [src/core/feature-detect.ts:315-378](../../src/core/feature-detect.ts#L315-L378)

The registry stores a unique registration id and factory and can mark an entry `instrumentOnly`; scored enumeration excludes instrument-only entries while direct lookup retains them. [src/core/registry.ts:18-40](../../src/core/registry.ts#L18-L40) [src/core/registry.ts:54-70](../../src/core/registry.ts#L54-L70) App wiring dynamically imports each adapter's registration function and records an individual failure rather than aborting all registration. [src/app/register.ts:26-92](../../src/app/register.ts#L26-L92) [src/app/register.ts:149-180](../../src/app/register.ts#L149-L180)

The registration key and instance id are not required to match. For example, the composite Remotion instance reports `remotion@4.0.479` but registers under `remotion`; the runner constructs a fresh instance for a cell and stamps results with `engine.id`. [src/engines/remotion/adapter.ts:39-53](../../src/engines/remotion/adapter.ts#L39-L53) [src/engines/remotion/adapter.ts:150-152](../../src/engines/remotion/adapter.ts#L150-L152) [src/core/runner.ts:1865-1886](../../src/core/runner.ts#L1865-L1886)

### Lifecycle and execution

The runner negotiates before initialization. If applicable, it invokes optional `init()` under a 120-second promise-race timeout, builds the inputs, executes the functional operation, runs oracles, and only then benchmarks a passing result. [src/core/runner.ts:1331-1385](../../src/core/runner.ts#L1331-L1385) The same instance is used for the functional call, any adapter calls made by oracles, benchmark warmups, and benchmark iterations, then `dispose()` is awaited once in `finally`; disposal errors are swallowed so they cannot replace the cell verdict. [src/core/runner.ts:1396-1475](../../src/core/runner.ts#L1396-L1475) [src/core/runner.ts:1637-1701](../../src/core/runner.ts#L1637-L1701)

`configUsed` is read by the matrix only after `runOne()` has returned and therefore after its `finally` disposal. [src/core/runner.ts:2107-2120](../../src/core/runner.ts#L2107-L2120) The composite Remotion adapter explicitly preserves its most recent backend across disposal to accommodate that order. [src/engines/remotion/adapter.ts:59-68](../../src/engines/remotion/adapter.ts#L59-L68) [src/engines/remotion/adapter.ts:94-103](../../src/engines/remotion/adapter.ts#L94-L103)

The matrix-level abort signal is inspected between cells only. Operation and lifecycle method signatures receive no shared signal or execution context, and `withTimeout()` rejects a `Promise.race` without cancelling the losing operation. [src/core/runner.ts:387-420](../../src/core/runner.ts#L387-L420) [src/core/runner.ts:655-694](../../src/core/runner.ts#L655-L694) Individual adapters can implement private cancellation; it is not part of `MediaEngine`.

### Applicability and error translation

The runtime [NotApplicableError](../glossary.md#notapplicableerror) contract is nominal only by `Error.name`. The runner recognizes any `Error` whose name is exactly `NotApplicableError` and maps it to [NA_ENGINE](../glossary.md#na_engine) around functional execution, robustness execution, benchmarking, and the outer cell catch. [src/core/runner.ts:686-694](../../src/core/runner.ts#L686-L694) [src/core/runner.ts:1382-1394](../../src/core/runner.ts#L1382-L1394) [src/core/runner.ts:1453-1468](../../src/core/runner.ts#L1453-L1468)

There is no exported shared error class. ffmpeg.wasm, MP4Box, Remotion WebCodecs, web-demuxer, aibrush-media, and the platform adapter each define a private class with the magic name; Mediabunny and Remotion Media Parser define none. [src/engines/ffmpeg-wasm/adapter.ts:113-123](../../src/engines/ffmpeg-wasm/adapter.ts#L113-L123) [src/engines/remotion-webcodecs/adapter.ts:136-142](../../src/engines/remotion-webcodecs/adapter.ts#L136-L142) Mediabunny does inspect `Conversion.isValid`, but it turns an impossible conversion and its discarded-track reasons into an ordinary `Error`, which reaches [ERROR](../glossary.md#error) outside robustness rather than `NA_ENGINE`. [src/engines/mediabunny/adapter.ts:850-877](../../src/engines/mediabunny/adapter.ts#L850-L877) It also throws ordinary errors for an unconstructable output format and missing requested source tracks. [src/engines/mediabunny/adapter.ts:1253-1268](../../src/engines/mediabunny/adapter.ts#L1253-L1268) [src/engines/mediabunny/adapter.ts:1293-1319](../../src/engines/mediabunny/adapter.ts#L1293-L1319)

Remotion WebCodecs has concrete request checks for channel remapping, AV1 encoding, large in-memory outputs, output-fps conversion, non-WAV resampling, rotated MP4, and B-frame inputs, and converts those misses to `NotApplicableError`. [src/engines/remotion-webcodecs/adapter.ts:2138-2195](../../src/engines/remotion-webcodecs/adapter.ts#L2138-L2195) By contrast, Remotion Media Parser declares broad read tokens and forwards genuine parser errors unchanged except for worker-infrastructure fallback, leaving no shared translation point that distinguishes a valid-but-unsupported concrete input from malformed media or a parser defect. [src/engines/remotion-media-parser/adapter.ts:179-215](../../src/engines/remotion-media-parser/adapter.ts#L179-L215) [src/engines/remotion-media-parser/adapter.ts:302-327](../../src/engines/remotion-media-parser/adapter.ts#L302-L327)

aibrush-media illustrates a third translation style: it recognizes a vendor capability code/name but also maintains a message regular expression, while deliberately preserving malformed-input rejection as a different error. [src/engines/aibrush-media/adapter.ts:92-124](../../src/engines/aibrush-media/adapter.ts#L92-L124) [src/engines/aibrush-media/adapter.ts:148-159](../../src/engines/aibrush-media/adapter.ts#L148-L159) This distinction matters because the robustness path treats a normal rejection as evidence of graceful handling but maps `NotApplicableError` to `NA_ENGINE`. [src/core/runner.ts:1522-1569](../../src/core/runner.ts#L1522-L1569)

NotApplicable handling does not cover adapter calls made inside an oracle. The trim-composition oracle catches `trim()`/`concat()` exceptions itself and returns a failed boolean oracle outcome; a `NotApplicableError` thrown there is therefore represented as a `FAIL`, not `NA_ENGINE`. [src/core/oracles.ts:3498-3521](../../src/core/oracles.ts#L3498-L3521)

The suite also has a hand-maintained exact disabled-cell table. The matrix consults it after construction and before negotiation, disposes the engine, and emits `SKIPPED`; entries currently include engine-specific transcode and scale limits. [src/core/disabled-cells.ts:36-71](../../src/core/disabled-cells.ts#L36-L71) [src/core/runner.ts:1928-1957](../../src/core/runner.ts#L1928-L1957)

### Telemetry and resource ownership

At the shared adapter boundary, operation telemetry is limited to `MediaBytes.targetWrites`, `MediaBytes.firstByteMs`, and rendition outputs. `MeasureContext` has additional slots such as source reads and first-frame time, but the benchmark bridge populates output bytes/write/first-byte values, packet/frame counts, and estimated encoded frames only from the returned normalized result. [src/core/engine.ts:28-39](../../src/core/engine.ts#L28-L39) [src/core/measure.ts:13-28](../../src/core/measure.ts#L13-L28) [src/core/runner.ts:1651-1689](../../src/core/runner.ts#L1651-L1689) `RunOptions.onProgress` reports completed cells; adapters have no shared operation-progress callback. [src/core/runner.ts:387-417](../../src/core/runner.ts#L387-L417) [src/core/runner.ts:2116-2120](../../src/core/runner.ts#L2116-L2120)

Resource ownership is convention rather than an interface-level obligation. The template tells frame adapters to return normalized RGBA digests but does not specify who closes framework frames, decoders, readers, workers, or partial outputs. [src/engines/_template/adapter.ts:16-21](../../src/engines/_template/adapter.ts#L16-L21) Representative implementations do release them: Remotion closes each `VideoFrame` after copying pixels and closes the decoder, while Mediabunny closes samples and disposes the input in `finally`. [src/engines/remotion-webcodecs/adapter.ts:615-683](../../src/engines/remotion-webcodecs/adapter.ts#L615-L683) [src/engines/mediabunny/adapter.ts:1394-1418](../../src/engines/mediabunny/adapter.ts#L1394-L1418)

### Scaffolding a new adapter

The template starts with every operation undeclared and every method throwing. It instructs an author to add only implemented tokens, dynamically import in `init()`, release in `dispose()`, normalize RGBA frame digests, and register a factory. [src/engines/_template/adapter.ts:47-98](../../src/engines/_template/adapter.ts#L47-L98) [src/engines/_template/adapter.ts:100-179](../../src/engines/_template/adapter.ts#L100-L179) It does not include the runtime applicability error contract, cancellation, operation progress, normalized-result validation, or conformance tests.

`scripts/add-engine.sh` validates a lowercase directory-safe id, copies and rewrites the template, optionally overwrites with `--force`, and uncomments its registration helper. [scripts/add-engine.sh:29-80](../../scripts/add-engine.sh#L29-L80) It prints manual wiring and run/compare steps but does not modify app wiring or run type, lifecycle, capability, or normalization checks. [scripts/add-engine.sh:82-94](../../scripts/add-engine.sh#L82-L94)

### Verdict boundary

Adapters return observations, not verdicts. The current `OracleOutcome` is a boolean `pass`, and `ResultStatus` has `PASS` and `FAIL` but no [DIFF](../glossary.md#diff). [src/core/scenario.ts:206-221](../../src/core/scenario.ts#L206-L221) The runner reduces the oracle array to the first real false outcome, emits `FAIL`, and benches only when the result becomes [PASS](../glossary.md#pass). [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463) The adapter contract therefore currently has no representation channel beyond the normalized metadata, packet, byte, and frame carriers described above.

## Contracts and invariants

The following are the observable invariants enforced today, including the limits of that enforcement.

- **Factory identity.** A registry id is unique, registration stores a factory rather than an instance, and scored listing excludes `instrumentOnly` entries. Instance ids may differ from registry aliases, and result identity uses the instance id. [src/core/registry.ts:18-40](../../src/core/registry.ts#L18-L40) [src/core/registry.ts:54-70](../../src/core/registry.ts#L54-L70) [src/core/runner.ts:1865-1886](../../src/core/runner.ts#L1865-L1886)
- **Declaration precedes execution.** The runner must observe every required operation/container/codec/encryption/feature token before calling `init()` or an operation. This is enforced per token, not as [combinatorial support](../glossary.md#combinatorial-support). [src/core/runner.ts:113-189](../../src/core/runner.ts#L113-L189) [src/core/runner.ts:1331-1367](../../src/core/runner.ts#L1331-L1367)
- **Declared optional hooks must exist.** `operations.mux` or `operations.decrypt` can pass negotiation while the corresponding optional method is absent, but dispatch then raises a harness error. Mux without explicit tracks or `prepareMuxTracks()` becomes `NotApplicableError`. [src/core/runner.ts:820-838](../../src/core/runner.ts#L820-L838)
- **Initialization is outside operation timing.** `init()` runs before the functional operation and the benchmark meter begins only inside benchmark samples. The engine then services multiple serial calls before one disposal. [src/core/runner.ts:1358-1385](../../src/core/runner.ts#L1358-L1385) [src/core/runner.ts:1637-1701](../../src/core/runner.ts#L1637-L1701)
- **Disposal is best effort.** `dispose()` runs for every `runOne()` exit once initialization was reached, but a disposal rejection is deliberately discarded and is not reportable. [src/core/runner.ts:1464-1476](../../src/core/runner.ts#L1464-L1476)
- **Runtime applicability is name-based.** An `Error` named `NotApplicableError` becomes `NA_ENGINE`; an undeclared capability also becomes `NA_ENGINE`; a browser preflight miss becomes [NA_BROWSER](../glossary.md#na_browser); an unrecognized adapter exception becomes `ERROR` except in the graceful-failure path. [src/core/runner.ts:686-694](../../src/core/runner.ts#L686-L694) [src/core/runner.ts:1331-1394](../../src/core/runner.ts#L1331-L1394) [src/core/runner.ts:1522-1569](../../src/core/runner.ts#L1522-L1569)
- **Correctness gates measurement.** Normalized observations go to engine-independent oracles; performance samples are produced only after current boolean oracle success. [src/core/runner.ts:1396-1463](../../src/core/runner.ts#L1396-L1463)
- **Time units are explicit but unchecked.** Normalized packet and frame timestamps are declared in microseconds, output duration is seconds, and telemetry latency is milliseconds. TypeScript documents those units; the runtime boundary does not validate them. [src/core/engine.ts:28-39](../../src/core/engine.ts#L28-L39) [src/core/engine.ts:56-94](../../src/core/engine.ts#L56-L94)
- **Frame evidence is detached from native frame handles.** `FrameSink` exposes digests and optional `ImageData`, never `VideoFrame` or `AudioData`. Actual close/copy behavior is adapter-local, as shown by Remotion and Mediabunny. [src/core/engine.ts:76-94](../../src/core/engine.ts#L76-L94) [src/engines/remotion-webcodecs/adapter.ts:615-683](../../src/engines/remotion-webcodecs/adapter.ts#L615-L683)
- **Output telemetry is optional.** Missing `targetWrites` or `firstByteMs` remains missing rather than being fabricated; present values feed the corresponding metric samples. [src/core/runner.ts:1661-1674](../../src/core/runner.ts#L1661-L1674) [src/core/measure.ts:79-101](../../src/core/measure.ts#L79-L101)
- **Adapters do not own oracle status.** Current adapters cannot emit `PASS`, `DIFF`, or `FAIL`; they return evidence or throw. The boolean oracle and status reduction live outside the interface. [src/core/scenario.ts:206-221](../../src/core/scenario.ts#L206-L221) [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463)

## Target design and known gaps

### Target design

#### One shared execution protocol

Retain a cheap static `CapabilitySet` for matrix discovery, but add one shared, versioned adapter protocol used by every operation and by oracle-triggered secondary calls:

```ts
type SupportDecision =
  | { applicable: true }
  | { applicable: false; status: 'NA_ENGINE' | 'NA_BROWSER'; reasonCode: string; detail: string };

interface ConcreteOperationRequest {
  operation: Operation | 'concat';
  inputs: Array<{ container: string; tracks: NormalizedTrack[] }>;
  output?: { container: string; videoCodec?: string; audioCodec?: string };
  options: Readonly<Record<string, unknown>>;
  browserConfigs?: { decode?: object[]; encode?: object[] };
}

interface OperationContext {
  signal: AbortSignal;
  emit: (event: OperationTelemetry) => void;
  request: ConcreteOperationRequest;
}
```

The exact names may change, but these semantics are required:

1. Static tokens reject obvious misses without initialization. After enough source information is available, `supports(request)` evaluates the concrete tuple. WebCodecs support must be checked with the exact profile/level/constraints, dimensions, sample rate, channels, and description that the operation will configure, because the [WebCodecs configuration-support algorithm](https://w3c.github.io/webcodecs/#config-support) is defined over the full configuration and support can vary with available resources.
2. A library or adapter that cannot execute a valid concrete tuple returns an engine-applicability decision or throws the shared exported `NotApplicableError`; the runner maps it to `NA_ENGINE` from functional calls, benchmark calls, and adapter calls made inside oracles. A browser/API/config miss uses a distinct structured `BrowserNotSupportedError` (or a support decision with `NA_BROWSER`), never `NotApplicableError`.
3. Every error carries a stable `reasonCode`, operation, engine id, tuple summary, and optional `cause`. Message text is diagnostic only; no adapter or runner classifies by regular expression.
4. An invalid or corrupted input that the engine is expected to attempt is not an applicability miss. It remains a normal domain rejection for the robustness oracle. A bug, crash, unexpected framework rejection after the adapter said `applicable: true`, or contract-validation failure remains `ERROR`; a returned but semantically wrong observation remains oracle `FAIL`.

This split is implementable with official framework probes rather than guesses. Mediabunny exposes output-format codec compatibility, concrete track `canDecode()`, encodability queries, and `Conversion.isValid`/discarded-track reasons. [Its official compatibility and codec-probing guide](https://mediabunny.dev/guide/supported-formats-and-codecs) and [conversion quick start](https://mediabunny.dev/guide/quick-start#convert-files) provide the checks the adapter should translate. Remotion exposes tuple-aware `canCopyVideoTrack()` and `canCopyAudioTrack()` inputs that include source/target container, codec, rotation, and resize, which should precede copy/remux decisions. [Remotion `canCopyVideoTrack()`](https://www.remotion.dev/docs/webcodecs/can-copy-video-track) [Remotion `canCopyAudioTrack()`](https://www.remotion.dev/docs/webcodecs/can-copy-audio-track)

Expected adapter-specific corrections are:

- **Mediabunny:** intersect each target format's supported codecs with actual track codec/configuration and encodability; inspect `Conversion.isValid` before execution; translate compatibility/discard reasons to `NotApplicableError`, while keeping empty/corrupted/mismatched negative-test input as a normal rejection. The official output-format API exposes supported-codec and track-count queries for this purpose. [Mediabunny output formats](https://mediabunny.dev/guide/output-formats#output-format-properties)
- **Remotion composite and Remotion WebCodecs:** preserve the existing concrete checks, add copy/re-encode checks for every source-track × output-container × transform tuple, and translate the remaining `cannot write/encode` branches to the shared error. Official `convertMedia()` limits output containers and exposes controller, cleanup, and progress surfaces. [Remotion `convertMedia()`](https://www.remotion.dev/docs/webcodecs/convert-media)
- **Remotion Media Parser:** translate an official unsupported-file-type result to `NotApplicableError` only when the bytes are valid and the adapter's declared read set was too broad; malformed bytes and parser faults must remain ordinary rejection/error. Pass a controller and progress callback through the shared context; the official parser API exposes both. [Remotion `parseMedia()`](https://www.remotion.dev/docs/media-parser/parse-media)
- **All adapters:** check option support before doing irreversible or expensive work, repeat dynamic checks if framework support changes after initialization, and release any partial output before returning an applicability decision.

The acceptance criterion is a generated tuple matrix for each adapter. For every declared operation, it exercises allowed and forbidden container/codec/direction/option combinations plus at least one input-specific miss. Every forbidden valid tuple must end as `NA_ENGINE`, every exact browser configuration miss as `NA_BROWSER`, and no such row may be `FAIL`, `ERROR`, or `SKIPPED`. The disabled-cell list may retain explicit practicality policy or non-preemptible defect quarantines; it must contain no row whose only reason is an expressible adapter inability.

#### Validated normalized results and explicit representation

Introduce runtime validators immediately after each adapter call and before any oracle sees the value. Validation must reject non-canonical container/codec tokens, detached or aliased output buffers, non-finite times/dimensions/rates, negative packet sizes, invalid `trackIndex`, inconsistent frame indices, invalid rendition recursion, and a declared successful byte-producing operation with empty bytes unless the scenario explicitly permits empty output. A validation failure identifies the adapter and field path and becomes `ERROR`, not `NA_ENGINE`.

Extend `EncodedTrack`/`DemuxResult` only where needed to stop guessing about representation:

- add packet ordering (`decode` or `presentation`) and, when the framework exposes it, the original rational timebase;
- add an explicit coded-chunk framing value (`annexb`, `avc`, `hevc`, or codec-specific equivalent), access-unit grouping, and parameter-set location;
- require `description` to be copied, owned data and state what record it contains;
- preserve native codec tag separately from the canonical semantic codec when it matters diagnostically.

This is required for correct handoff between demux and mux adapters. The W3C AVC registration says a chunk is one access unit, `description` present means an AVCDecoderConfigurationRecord with length-prefixed `avc` format, and no `description` means [Annex B](../glossary.md#annex-b); the HEVC registration defines the analogous HEVCDecoderConfigurationRecord and `hevc`/Annex B split. [AVC `EncodedVideoChunk` and decoder description](https://w3c.github.io/webcodecs/avc_codec_registration.html) [HEVC `EncodedVideoChunk` and decoder description](https://w3c.github.io/webcodecs/hevc_codec_registration.html) The target must never infer [AVCC](../glossary.md#avcc) merely from `codec: 'h264'` or infer parameter-set placement from packet size.

Acceptance tests round-trip every normalized carrier through its validator; fuzz each numeric, token, index, buffer, and recursion boundary; and feed H.264/H.265 fixtures in both Annex B and length-prefixed forms through `prepareMuxTracks()`/`mux()`. The adapter must either preserve the declared representation, explicitly convert it, or return `NA_ENGINE` before authoring output.

#### Lifecycle, cancellation, and ownership

Make the state machine normative: `constructed → initialized → zero or more serial operations → disposed`. `init()` and `dispose()` must be idempotent; an operation before successful initialization is a contract error; an operation after disposal is a contract error; disposal must close workers, codecs, streams, readers, object URLs, temporary virtual files, and partial targets. The runner must snapshot a deeply JSON-serializable `configUsed` before disposal, after the operation has selected any fallback/backend, rather than requiring adapters to retain disposed state.

Every lifecycle and operation call receives the same `AbortSignal`. On user cancellation or timeout, the runner aborts first, the adapter forwards cancellation to framework controllers/fetch/readers, closes WebCodecs objects, awaits bounded cleanup, and only then finalizes the cell. `Promise.race` remains a watchdog, not the cancellation mechanism. This follows the web platform's standard model for [aborting ongoing activities](https://dom.spec.whatwg.org/#aborting-ongoing-activities). Remotion already exposes abortable parser/conversion controllers, including `webcodecsController().abort()`, so its adapters should bridge the shared signal rather than rely on an uncancelled race. [Remotion WebCodecs controller](https://www.remotion.dev/docs/webcodecs/webcodecs-controller)

Native raw-frame ownership is transfer-like: an adapter must copy/digest what it returns and close every `VideoFrame`/`AudioData` exactly once after its last use; retained asynchronous consumers must clone explicitly. Decoders and encoders are flushed as required and closed on every exit. The [WebCodecs raw-media memory model](https://w3c.github.io/webcodecs/#raw-media-memory-model) recommends closing frames immediately because references retain large media resources, and its codec close algorithms release system resources.

Acceptance tests use fake resources with close counters and controllable promises. They cover init rejection, support rejection, operation success, `PASS`/`DIFF`/`FAIL` oracle paths, ordinary exception, timeout, external abort, oracle-triggered sub-operations, and disposal rejection. Every path must settle within the cleanup grace period, close each owned resource once, avoid work after abort, and leave no active worker/codec/stream. Disposal failure is recorded as cleanup diagnostics without replacing the already determined semantic verdict.

#### Telemetry, configuration, and repeatability

`OperationTelemetry` is an additive stream with a monotonic operation-relative timestamp and typed events for progress, bytes read/written, write count, first byte, decoded/encoded frame count, first frame, and framework fallback. Progress is monotonic in `[0,1]` when a denominator exists and explicitly indeterminate otherwise. Final normalized counters are returned alongside the result so report generation does not depend on callback delivery. Remotion's official conversion API already reports decoded/encoded frame counts, bytes and milliseconds written, expected duration, and overall progress; Mediabunny exposes `Conversion.onProgress`. [Remotion conversion progress](https://www.remotion.dev/docs/webcodecs/convert-media#onprogress) [Mediabunny conversion progress](https://mediabunny.dev/guide/quick-start#convert-files)

`configUsed` becomes a validated immutable snapshot containing at minimum framework/package versions, selected backend, hardware/software preference, worker/thread count, reader/writer/target mode, actual codec configs, and any fallback with reason. It is captured for functional and measured phases separately when they differ. A serializer conformance test rejects functions, promises, DOM/native objects, cycles, non-finite numbers, and values that mutate after capture.

Repeatability applies to normalized observations and ordering, not necessarily encoded bytes. Given identical input bytes, scenario options, browser support, and `configUsed`, two fresh instances must emit the same canonical metadata, stable packet/frame ordering, applicability reason code, and telemetry field meanings. If a framework encoder is nondeterministic, that fact is declared in `configUsed`; semantic oracles still judge the result.

#### Conformance gate and add-engine workflow

Replace the throw-everything template with a compiling minimal adapter that imports the shared applicability errors and validators, accepts `OperationContext`, demonstrates idempotent lifecycle/cleanup, and declares no capabilities. Keep undeclared operation stubs only if the interface remains structurally required; otherwise make operation methods optional and validate that every declared operation has a callable method.

`add-engine.sh` must still stamp only an adapter directory, but its printed workflow must end with an adapter conformance command before app wiring. The conformance suite must verify:

| Area | Required proof |
| --- | --- |
| Identity/registration | Versioned instance id; unique registry alias; factory returns a fresh instance; `configUsed` is serializable. |
| Capabilities | Canonical, duplicate-free tokens; directionality; method/token agreement; concrete positive and negative tuples. |
| Errors | Structured `NA_ENGINE`/`NA_BROWSER`; no message parsing; malformed-input rejection preserved; unexpected faults remain `ERROR`. |
| Results | Runtime validation of metadata, packets, bytes, frames, mux tracks, variants, units, ownership, and framing. |
| Lifecycle | Serial repeated calls, init/dispose idempotence, cleanup on all exits, and pre/post-state misuse rejection. |
| Cancellation | User abort and timeout reach native controllers and settle inside the cleanup grace period. |
| Telemetry | Monotonic progress and timestamps; exact write/count markers; no fabricated unavailable values. |
| Oracle boundary | Adapter returns evidence only; `NotApplicableError` from oracle-triggered calls escapes to applicability routing. |

The acceptance criterion for onboarding is one new adapter generated into a temporary directory, typechecked, run through this suite with a fake framework, registered in an isolated registry, and deleted without changing scenarios or disabled cells.

#### Three-way verdict propagation (corroboration)

The target oracle model is [PASS](../glossary.md#pass) / `DIFF` / [FAIL](../glossary.md#fail), with `DIFF` reserved for valid but representationally different evidence. The adapter remains verdict-neutral: it must preserve canonical semantic values plus representation diagnostics and must never rewrite output to resemble a [golden](../glossary.md#golden), compare itself with a golden, or throw `NotApplicableError` because its legal packetization differs. The oracle owns the three-way decision; the runner and result model propagate it without collapsing `DIFF` to `FAIL`. See the normative target in [oracle system](../subsystems/oracle-system.md) and the result-shape target in [scenario DSL and registry](../subsystems/scenario-dsl-registry.md).

Acceptance uses a fake adapter that returns three fixtures: semantically identical/canonically identical, semantically identical/representationally different, and invalid. The adapter output validator accepts all structurally valid observations; the oracle produces `PASS`, `DIFF`, and `FAIL` respectively; only applicability errors become `NA_ENGINE`; and performance admission follows the policy owned by runner/reporting rather than being guessed in the adapter.

### Known gaps

1. **Flat capability declarations leak unsupported tuples.** **Current:** `CapabilitySet` is per token and negotiation intersects tokens independently. [src/core/engine.ts:115-137](../../src/core/engine.ts#L115-L137) [src/core/runner.ts:113-189](../../src/core/runner.ts#L113-L189) **Consequence:** a framework may declare every atom but reject their combination after execution begins, producing `FAIL`/`ERROR` or requiring a hand-authored skip. **Target:** add exact tuple support and retain runtime `NotApplicableError`; this matches WebCodecs' full-config support model and framework compatibility queries. [WebCodecs configuration support](https://w3c.github.io/webcodecs/#config-support) [Mediabunny compatibility/probes](https://mediabunny.dev/guide/supported-formats-and-codecs) **Verification:** the generated negative-tuple matrix yields only `NA_ENGINE`/`NA_BROWSER`, and capability-only disabled cells are removed.

2. **Applicability is a duplicated magic-name convention.** **Current:** the runner matches only `err.name`, while adapters define private lookalike classes or no class. [src/core/runner.ts:686-694](../../src/core/runner.ts#L686-L694) [src/engines/ffmpeg-wasm/adapter.ts:113-123](../../src/engines/ffmpeg-wasm/adapter.ts#L113-L123) **Consequence:** structured operation/tuple/reason data is lost, message-regex translation appears, and secondary adapter calls can bypass mapping. **Target:** export one structured error protocol and preserve it through direct, benchmark, and oracle-triggered calls. **Verification:** cross-adapter tests compare stable reason codes, prohibit message matching, and prove `trim()`/`concat()` applicability becomes `NA_ENGINE` rather than oracle `FAIL`.

3. **Browser configuration and engine inability are not separated at the concrete-input boundary.** **Current:** browser support is probed with representative codec configs, while adapters may discover actual profile, description, dimensions, channel layout, or resource failure later. [src/core/feature-detect.ts:315-378](../../src/core/feature-detect.ts#L315-L378) **Consequence:** a runtime browser `NotSupportedError` can be reported as engine `ERROR`, or an adapter can incorrectly hide an engine gap as `NA_BROWSER`. **Target:** check exact runtime configurations and use a distinct browser-support decision; WebCodecs explicitly evaluates exact profile/level/constraint configuration. [WebCodecs §7.1](https://w3c.github.io/webcodecs/#config-support) **Verification:** mocked exact-config failures route to `NA_BROWSER`, while framework tuple failures with the same codec route to `NA_ENGINE`.

4. **Timeout is not cancellation.** **Current:** the shared signal is inspected only between cells and `withTimeout()` races without aborting; operation signatures accept no signal. [src/core/runner.ts:387-420](../../src/core/runner.ts#L387-L420) [src/core/runner.ts:655-683](../../src/core/runner.ts#L655-L683) **Consequence:** timed-out work can continue using CPU, workers, codecs, or output targets while disposal or the next cell starts. **Target:** pass `AbortSignal` through every call, abort on timeout, forward to native controllers, then await bounded cleanup as defined by the web platform abort model and supported by Remotion controllers. [WHATWG DOM aborting activities](https://dom.spec.whatwg.org/#aborting-ongoing-activities) [Remotion WebCodecs controller](https://www.remotion.dev/docs/webcodecs/webcodecs-controller) **Verification:** a never-resolving fake operation observes abort, closes resources, and stops telemetry before the cleanup deadline.

5. **Lifecycle reality differs from the scaffold's simple mental model.** **Current:** one engine instance handles functional execution, oracle sub-operations, warmups, and iterations; `configUsed` is read after disposal. [src/core/runner.ts:1396-1475](../../src/core/runner.ts#L1396-L1475) [src/core/runner.ts:1637-1701](../../src/core/runner.ts#L1637-L1701) [src/core/runner.ts:2107-2120](../../src/core/runner.ts#L2107-L2120) **Consequence:** adapters that assume one call per instance can leak state, and cleanup can erase the effective configuration before reporting. **Target:** codify the serial state machine, reset per-operation state, snapshot configuration before disposal, and test repeated calls. **Verification:** stateful fake and real-adapter smoke tests produce identical normalized observations across warmup/iteration counts and retain the effective config after cleanup.

6. **Normalized output is compile-time-only and framing is ambiguous.** **Current:** string and numeric carriers are passed directly to oracles; `EncodedTrack.description` exists but chunk framing and parameter-set location do not. [src/core/engine.ts:43-74](../../src/core/engine.ts#L43-L74) [src/core/engine.ts:163-175](../../src/core/engine.ts#L163-L175) [src/core/runner.ts:1480-1519](../../src/core/runner.ts#L1480-L1519) **Consequence:** malformed adapter values fail far downstream, and mux adapters may guess Annex B versus length-prefixed AVC/HEVC. **Target:** validate every carrier and state coded representation explicitly according to the AVC/HEVC WebCodecs registrations. [W3C AVC registration](https://w3c.github.io/webcodecs/avc_codec_registration.html) [W3C HEVC registration](https://w3c.github.io/webcodecs/hevc_codec_registration.html) **Verification:** validator fuzzing identifies the exact field, and Annex B/length-prefixed conformance fixtures never rely on codec-name inference.

7. **Telemetry is narrower than framework surfaces.** **Current:** adapters can return only write count and first-byte latency; cell progress is emitted outside operations, and source-read/first-frame slots have no shared producer. [src/core/engine.ts:28-39](../../src/core/engine.ts#L28-L39) [src/core/runner.ts:1651-1689](../../src/core/runner.ts#L1651-L1689) **Consequence:** progress, backpressure, reads, frame latency, and fallback behavior are inconsistently observable, even when a framework exposes them. **Target:** bridge typed operation telemetry; Remotion and Mediabunny already expose suitable progress/counter surfaces. [Remotion conversion progress](https://www.remotion.dev/docs/webcodecs/convert-media#onprogress) [Mediabunny conversion progress](https://mediabunny.dev/guide/quick-start#convert-files) **Verification:** fake and real streaming operations emit monotonic events whose final counters equal the normalized result and benchmark sample.

8. **Resource ownership is documented by examples, not enforced.** **Current:** adapters manually close frames/samples and decoders, but `MediaEngine` has no ownership or close-on-error clauses. [src/engines/remotion-webcodecs/adapter.ts:615-683](../../src/engines/remotion-webcodecs/adapter.ts#L615-L683) [src/engines/mediabunny/adapter.ts:1394-1418](../../src/engines/mediabunny/adapter.ts#L1394-L1418) **Consequence:** a new adapter can pass typecheck while leaking large WebCodecs resources. **Target:** require copy/clone/close behavior and instrument it; WebCodecs recommends prompt frame close and releases codec resources on close. [WebCodecs raw-media memory model](https://w3c.github.io/webcodecs/#raw-media-memory-model) **Verification:** close-count tests cover success, throw, `NA_ENGINE`, `NA_BROWSER`, timeout, abort, and partial-output paths.

9. **Scaffolding does not prove conformance.** **Current:** the template omits applicability/cancellation/validation and the add script only prints manual wiring/run steps. [src/engines/_template/adapter.ts:47-98](../../src/engines/_template/adapter.ts#L47-L98) [scripts/add-engine.sh:82-94](../../scripts/add-engine.sh#L82-L94) **Consequence:** a generated adapter can compile while over-declaring support, leaking resources, or returning invalid observations. **Target:** make shared protocol helpers part of the template and require the conformance suite before wiring. **Verification:** clean scaffold passes only the all-undeclared baseline; each newly declared operation requires positive, negative-tuple, lifecycle, normalized-result, and cancellation tests.

10. **The current boolean verdict boundary cannot preserve representation diagnostics.** **Current:** `OracleOutcome.pass` and `ResultStatus` contain no `DIFF`, and runner reduction maps any real false outcome to `FAIL`. [src/core/scenario.ts:206-221](../../src/core/scenario.ts#L206-L221) [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463) **Consequence:** an adapter cannot preserve a valid representation difference through scoring except as detail on a pass/fail result. **Target:** adapters return richer representation evidence while the oracle/result owners implement `PASS`/`DIFF`/`FAIL`; legal framing or packet grouping never becomes `NotApplicableError`. **Verification:** the three-fixture propagation test yields all three verdicts without adapter-side golden logic.

## Sources

### Repository evidence

- [src/core/engine.ts:13-26](../../src/core/engine.ts#L13-L26) — lazy input contract.
- [src/core/engine.ts:28-39](../../src/core/engine.ts#L28-L39) — byte output and write/first-byte/rendition telemetry.
- [src/core/engine.ts:41-94](../../src/core/engine.ts#L41-L94) — normalized metadata, packets, and frame evidence.
- [src/core/engine.ts:115-137](../../src/core/engine.ts#L115-L137) — flat capability declaration.
- [src/core/engine.ts:163-179](../../src/core/engine.ts#L163-L179) — mux-ready track/chunk representation.
- [src/core/engine.ts:197-237](../../src/core/engine.ts#L197-L237) — `MediaEngine` identity, lifecycle, operations, and optional hooks.
- [src/core/engine.ts:242-276](../../src/core/engine.ts#L242-L276) — canonical token vocabularies.
- [src/core/registry.ts:18-40](../../src/core/registry.ts#L18-L40) — unique ids, factories, and registration.
- [src/core/registry.ts:54-70](../../src/core/registry.ts#L54-L70) — scored versus instrument-only enumeration.
- [src/app/register.ts:26-92](../../src/app/register.ts#L26-L92) — lazy concrete engine wiring.
- [src/app/register.ts:149-180](../../src/app/register.ts#L149-L180) — isolated registration failures and report.
- [src/core/feature-detect.ts:315-378](../../src/core/feature-detect.ts#L315-L378) — representative WebCodecs configurations used for browser support.
- [src/core/runner.ts:113-189](../../src/core/runner.ts#L113-L189) — per-token engine negotiation.
- [src/core/runner.ts:387-420](../../src/core/runner.ts#L387-L420) — matrix callbacks and between-cell abort signal.
- [src/core/runner.ts:580-628](../../src/core/runner.ts#L580-L628) — cached input fetch and mutation behavior.
- [src/core/runner.ts:655-694](../../src/core/runner.ts#L655-L694) — promise-race timeout and name-based applicability helpers.
- [src/core/runner.ts:789-845](../../src/core/runner.ts#L789-L845) — operation dispatch and mux/decrypt hook checks.
- [src/core/runner.ts:1331-1476](../../src/core/runner.ts#L1331-L1476) — negotiate/init/execute/oracle/bench/dispose lifecycle and status mapping.
- [src/core/runner.ts:1480-1519](../../src/core/runner.ts#L1480-L1519) — unvalidated normalized values entering oracle context.
- [src/core/runner.ts:1522-1569](../../src/core/runner.ts#L1522-L1569) — graceful rejection versus runtime applicability.
- [src/core/runner.ts:1637-1701](../../src/core/runner.ts#L1637-L1701) — repeated benchmark calls on one instance and metric bridge.
- [src/core/runner.ts:1865-1886](../../src/core/runner.ts#L1865-L1886) — fresh instance construction per cell.
- [src/core/runner.ts:1928-1957](../../src/core/runner.ts#L1928-L1957) — disabled-cell `SKIPPED` path.
- [src/core/runner.ts:2107-2120](../../src/core/runner.ts#L2107-L2120) — post-disposal configuration snapshot and cell progress.
- [src/core/oracles.ts:3498-3521](../../src/core/oracles.ts#L3498-L3521) — oracle-triggered trim/concat calls and exception collapse.
- [src/core/scenario.ts:206-221](../../src/core/scenario.ts#L206-L221) — current statuses and boolean oracle outcome.
- [src/core/measure.ts:13-28](../../src/core/measure.ts#L13-L28) — available measurement context fields.
- [src/core/measure.ts:79-101](../../src/core/measure.ts#L79-L101) — telemetry-to-sample mapping.
- [src/core/disabled-cells.ts:36-71](../../src/core/disabled-cells.ts#L36-L71) — representative hand-maintained cells.
- [src/engines/_template/adapter.ts:16-21](../../src/engines/_template/adapter.ts#L16-L21) — frame normalization guidance.
- [src/engines/_template/adapter.ts:47-98](../../src/engines/_template/adapter.ts#L47-L98) — empty capability scaffold.
- [src/engines/_template/adapter.ts:100-179](../../src/engines/_template/adapter.ts#L100-L179) — lifecycle/operation stubs and registration example.
- [scripts/add-engine.sh:29-80](../../scripts/add-engine.sh#L29-L80) — id validation and template stamping.
- [scripts/add-engine.sh:82-94](../../scripts/add-engine.sh#L82-L94) — manual post-generation workflow.
- [src/engines/ffmpeg-wasm/adapter.ts:113-123](../../src/engines/ffmpeg-wasm/adapter.ts#L113-L123) — one private applicability class.
- [src/engines/mediabunny/adapter.ts:850-877](../../src/engines/mediabunny/adapter.ts#L850-L877) — conversion validity translated to ordinary error.
- [src/engines/mediabunny/adapter.ts:1253-1319](../../src/engines/mediabunny/adapter.ts#L1253-L1319) — untyped runtime container/track rejection.
- [src/engines/mediabunny/adapter.ts:1394-1418](../../src/engines/mediabunny/adapter.ts#L1394-L1418) — sample and input cleanup.
- [src/engines/remotion/adapter.ts:39-68](../../src/engines/remotion/adapter.ts#L39-L68) — versioned instance id and effective config.
- [src/engines/remotion/adapter.ts:71-103](../../src/engines/remotion/adapter.ts#L71-L103) — composite capability union and lifecycle.
- [src/engines/remotion/adapter.ts:150-152](../../src/engines/remotion/adapter.ts#L150-L152) — bare registry alias.
- [src/engines/remotion-media-parser/adapter.ts:179-215](../../src/engines/remotion-media-parser/adapter.ts#L179-L215) — broad read declarations.
- [src/engines/remotion-media-parser/adapter.ts:302-327](../../src/engines/remotion-media-parser/adapter.ts#L302-L327) — parser error passthrough and worker fallback.
- [src/engines/remotion-webcodecs/adapter.ts:136-142](../../src/engines/remotion-webcodecs/adapter.ts#L136-L142) — another private applicability class.
- [src/engines/remotion-webcodecs/adapter.ts:615-683](../../src/engines/remotion-webcodecs/adapter.ts#L615-L683) — frame/decoder lifetime handling.
- [src/engines/remotion-webcodecs/adapter.ts:2138-2195](../../src/engines/remotion-webcodecs/adapter.ts#L2138-L2195) — concrete request checks already mapped to runtime applicability.
- [src/engines/aibrush-media/adapter.ts:92-124](../../src/engines/aibrush-media/adapter.ts#L92-L124) — capability/malformed distinction and message heuristic.
- [src/engines/aibrush-media/adapter.ts:148-159](../../src/engines/aibrush-media/adapter.ts#L148-L159) — vendor error translation.

### External authorities

- W3C Media Working Group, *WebCodecs*, §7.1 “Check Configuration Support,” [editor's draft](https://w3c.github.io/webcodecs/#config-support), accessed 2026-07-16 — support is evaluated against the full codec configuration and may vary with resources.
- W3C Media Working Group, *WebCodecs*, §9.1 “Memory Model,” [editor's draft](https://w3c.github.io/webcodecs/#raw-media-memory-model), accessed 2026-07-16 — raw frames are reference-counted resources that should be closed promptly.
- W3C Media Working Group, *AVC (H.264) WebCodecs Registration*, §§2-3 “EncodedVideoChunk data” and “VideoDecoderConfig description,” [editor's draft](https://w3c.github.io/webcodecs/avc_codec_registration.html), accessed 2026-07-16 — defines access-unit grouping and AVC-record versus Annex B framing.
- W3C Media Working Group, *HEVC (H.265) WebCodecs Registration*, §§2-3 “EncodedVideoChunk data” and “VideoDecoderConfig description,” [editor's draft](https://w3c.github.io/webcodecs/hevc_codec_registration.html), accessed 2026-07-16 — defines the analogous HEVC-record versus Annex B framing.
- WHATWG, *DOM Standard*, §3 “Aborting ongoing activities,” [living standard](https://dom.spec.whatwg.org/#aborting-ongoing-activities), accessed 2026-07-16 — defines `AbortController`/`AbortSignal` integration for cancellable APIs.
- Mediabunny, *Supported formats & codecs*, [official guide](https://mediabunny.dev/guide/supported-formats-and-codecs), accessed 2026-07-16 — provides container-codec compatibility and exact encode/decode support queries.
- Mediabunny, *Output formats*, “Output format properties,” [official guide](https://mediabunny.dev/guide/output-formats#output-format-properties), accessed 2026-07-16 — exposes supported-codec and track-count queries at the target-format boundary.
- Mediabunny, *Quick start*, “Convert files,” [official guide](https://mediabunny.dev/guide/quick-start#convert-files), accessed 2026-07-16 — documents `Conversion.isValid`, discarded tracks, progress, and conversion execution.
- Remotion, *parseMedia()*, [official API documentation](https://www.remotion.dev/docs/media-parser/parse-media), accessed 2026-07-16 — documents parser controllers, track callbacks, and parse progress.
- Remotion, *convertMedia()*, [official API documentation](https://www.remotion.dev/docs/webcodecs/convert-media), accessed 2026-07-16 — documents supported outputs, cleanup, controller, progress, and frame ownership.
- Remotion, *canCopyVideoTrack()*, [official API documentation](https://www.remotion.dev/docs/webcodecs/can-copy-video-track), accessed 2026-07-16 — demonstrates tuple-aware video copy checks across input/output container, codec, rotation, and resize.
- Remotion, *canCopyAudioTrack()*, [official API documentation](https://www.remotion.dev/docs/webcodecs/can-copy-audio-track), accessed 2026-07-16 — demonstrates tuple-aware audio copy checks across input/output container and codec.
- Remotion, *webcodecsController()*, [official API documentation](https://www.remotion.dev/docs/webcodecs/webcodecs-controller), accessed 2026-07-16 — exposes pause, resume, and abort for conversion.
