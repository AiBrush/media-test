/**
 * Conforming minimal MediaEngine scaffold. `scripts/add-engine.sh <id>` stamps this file into a new
 * adapter directory. The clean scaffold declares no operations and therefore passes only the
 * all-undeclared conformance baseline.
 *
 * To declare an operation:
 *   1. add only its canonical discovery tokens to `capabilities()`;
 *   2. replace that operation's `undeclared()` call with framework work driven by OperationContext;
 *   3. return evidence through `validateAdapterResult()` (or validate mux input with
 *      `validateEncodedTracks()`);
 *   4. add positive, negative-tuple, lifecycle, normalized-result, and cancellation conformance
 *      fixtures. Legal packetization/framing is evidence, never an applicability error.
 *
 * Every native frame/sample/codec/worker/stream acquired by an implementation belongs in
 * `resources`. Copy or digest returned media before releasing native objects, and close every owned
 * object exactly once on success, throw, applicability, abort, and partial-output paths.
 */

import {
  AdapterLifecycleController,
  CONCRETE_OPERATION_PROTOCOL,
  ResourceOwnershipTracker,
  captureConfigUsedSnapshot,
  createNotApplicableError,
  validateAdapterResult,
  validateCapabilitySet,
  validateEncodedTracks,
  validateSupportDecision,
  type CapabilitySet,
  type AdapterOperationResultMap,
  type ConcreteOperationRequest,
  type DecodeOptions,
  type DecryptKey,
  type DemuxResult,
  type EncodedTracks,
  type EncryptionScheme,
  type FrameDigest,
  type FrameSink,
  type LifecycleContext,
  type MediaBytes,
  type MediaEngine,
  type MediaInput,
  type NormalizedMetadata,
  type Operation,
  type OperationContext,
  type RemuxOptions,
  type SupportDecision,
  type TranscodeOptions,
} from '../../core/engine.ts';
import { registerEngine } from '../../core/registry.ts';

/** Replace with the framework's stable, versioned package identity. */
const ENGINE_ID = 'template@0.0.0';

const CONFIG_USED = captureConfigUsedSnapshot(
  ENGINE_ID,
  {
    framework: ENGINE_ID.split('@')[0]!,
    packageVersions: { [ENGINE_ID.split('@')[0]!]: ENGINE_ID.split('@')[1]! },
    backend: 'not-selected',
    hardwareAcceleration: 'not-applicable',
    workerCount: 0,
    threadCount: 0,
    readerMode: 'not-selected',
    writerMode: 'not-selected',
    targetMode: 'not-selected',
    codecConfigs: [],
    encoderNondeterministic: false,
  },
  { requireProfile: true },
);

export class TemplateEngine implements MediaEngine {
  readonly id = ENGINE_ID;
  readonly configUsed = CONFIG_USED;
  private readonly lifecycle = new AdapterLifecycleController(ENGINE_ID);
  private readonly resources = new ResourceOwnershipTracker(ENGINE_ID);
  private readonly fallbackSignal = new AbortController().signal;

  capabilities(): CapabilitySet {
    const capabilities: CapabilitySet = {
      operations: {},
      containersIn: [],
      containersOut: [],
      videoCodecs: [],
      audioCodecs: [],
      encryption: [],
      features: [],
    };
    return validateCapabilitySet(this, capabilities);
  }

  /**
   * The clean baseline supports no concrete tuple. Replace this with official framework probes when
   * the first operation is implemented; exact WebCodecs configs belong in `browserConfigs`.
   */
  supports(request: ConcreteOperationRequest): SupportDecision {
    return validateSupportDecision(ENGINE_ID, {
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'TEMPLATE_OPERATION_UNDECLARED',
      reason: `template declares no implementation for ${request.operation}`,
    });
  }

  async init(context?: LifecycleContext): Promise<void> {
    const call = context ?? fallbackLifecycleContext(this.fallbackSignal);
    await this.lifecycle.init(call, async () => {
      this.resources.bindAbort(call.signal);
      // Dynamically import and initialize the heavy framework here. Register every acquired native
      // worker/codec/stream with this.resources immediately after construction.
    });
  }

  async dispose(context?: LifecycleContext): Promise<void> {
    const call = context ?? fallbackLifecycleContext(this.fallbackSignal, 'cleanup');
    await this.lifecycle.dispose(call, () => this.resources.disposeAll());
  }

  async probe(_input: MediaInput, context?: OperationContext): Promise<NormalizedMetadata> {
    return this.undeclared('probe', context);
  }

  async demux(_input: MediaInput, context?: OperationContext): Promise<DemuxResult> {
    return this.undeclared('demux', context);
  }

  async remux(_input: MediaInput, _opts: RemuxOptions, context?: OperationContext): Promise<MediaBytes> {
    return this.undeclared('remux', context);
  }

  async transcode(_input: MediaInput, _opts: TranscodeOptions, context?: OperationContext): Promise<MediaBytes> {
    return this.undeclared('transcode', context);
  }

  async decodeFrames(
    _input: MediaInput,
    _opts?: DecodeOptions,
    context?: OperationContext,
  ): Promise<FrameSink> {
    return this.undeclared('decodeFrames', context);
  }

  async seek(
    _input: MediaInput,
    _tUs: number,
    context?: OperationContext,
  ): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    return this.undeclared('seek', context);
  }

  async trim(
    _input: MediaInput,
    _range: { startUs: number; endUs: number },
    _opts: { container: string; frameAccurate: boolean },
    context?: OperationContext,
  ): Promise<MediaBytes> {
    return this.undeclared('trim', context);
  }

  async mux(
    tracks: EncodedTracks,
    _opts: { container: string },
    context?: OperationContext,
  ): Promise<MediaBytes> {
    // This line is intentionally retained as the model for a future implementation: validate the
    // explicit framing/description ownership before authoring any output.
    validateEncodedTracks(ENGINE_ID, tracks);
    return this.undeclared('mux', context);
  }

  async decrypt(
    _input: MediaInput,
    _key: DecryptKey,
    _opts: { scheme: EncryptionScheme },
    context?: OperationContext,
  ): Promise<MediaBytes> {
    return this.undeclared('decrypt', context);
  }

  /** Example boundary for implemented methods: validate evidence, never decide PASS/DIFF/FAIL. */
  protected validated<O extends Operation>(
    operation: O,
    value: unknown,
  ): AdapterOperationResultMap[O] {
    return validateAdapterResult(ENGINE_ID, operation, value);
  }

  private undeclared(operation: Operation, context?: OperationContext): never {
    const request = context?.request ?? fallbackRequest(operation);
    throw createNotApplicableError(
      ENGINE_ID,
      operation,
      `template operation '${operation}' is undeclared`,
      {
        inputContainers: request.inputs.map((input) => input.container),
        inputCodecs: request.inputs.flatMap((input) => input.tracks.map((track) => track.codec)),
        outputContainer: request.output?.container,
        outputCodecs: [request.output?.videoCodec, request.output?.audioCodec].filter(
          (codec): codec is string => codec !== undefined,
        ),
      },
      'TEMPLATE_OPERATION_UNDECLARED',
    );
  }
}

function fallbackLifecycleContext(
  signal: AbortSignal,
  phase: LifecycleContext['phase'] = 'functional',
): LifecycleContext {
  return { signal, emit: () => undefined, phase };
}

function fallbackRequest(operation: Operation): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: 'template/conformance',
    operation,
    inputs: [],
    options: {},
  };
}

/**
 * Registration example. `add-engine.sh` uncomments this block after replacing Template names.
 */
// export function registerTemplate(): void {
//   registerEngine(ENGINE_ID, () => new TemplateEngine());
// }

// Keeps the registration import live until the scaffold is stamped.
void registerEngine;
