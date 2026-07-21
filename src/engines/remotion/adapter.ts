/**
 * Unified Remotion adapter.
 *
 * Remotion publishes the two packages as complementary layers: @remotion/media-parser owns
 * container inspection/sample extraction, while @remotion/webcodecs consumes those samples for
 * decode, encode, and conversion. Benchmarking them as separate frameworks double-counts one stack
 * and prevents either column from representing the supported product surface.
 *
 * This adapter deliberately routes each operation to the package's public, intended API:
 *   - probe/demux -> @remotion/media-parser
 *   - decode/seek/remux/transcode -> @remotion/webcodecs (which itself uses media-parser)
 *
 * Capabilities are the honest union. Operations neither package officially supports in this shape
 * (trim, external-track mux, concat, decrypt) remain undeclared and therefore score as NA_ENGINE.
 */

import type {
  AdapterConfigProfile,
  CapabilitySet,
  ConcreteOperationRequest,
  DecodeOptions,
  DemuxResult,
  FrameDigest,
  FrameSink,
  LifecycleContext,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  OperationContext,
  RemuxOptions,
  SupportDecision,
  TranscodeOptions,
} from '../../core/engine.ts';
import {
  AdapterLifecycleController,
  CONCRETE_OPERATION_PROTOCOL,
  SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  captureConfigUsedSnapshot,
  validateCapabilitySet,
  validateSupportDecision,
} from '../../core/engine.ts';
import { registerEngine } from '../../core/registry.ts';
import {
  RemotionMediaParserEngine,
  type RemotionMediaParserConfig,
} from '../remotion-media-parser/adapter.ts';
import {
  RemotionWebcodecsEngine,
  type RemotionWebcodecsConfig,
} from '../remotion-webcodecs/adapter.ts';

export const REMOTION_ENGINE_ID = 'remotion@4.0.479';

type OperationBackend = 'media-parser' | 'webcodecs' | 'none';

export interface RemotionConfigUsed extends AdapterConfigProfile {
  framework: 'remotion';
  packageVersions: {
    '@remotion/media-parser': '4.0.479';
    '@remotion/webcodecs': '4.0.479';
  };
  backend: OperationBackend;
  hardwareAcceleration: 'prefer-hardware-with-software-fallback';
  workerCount: number;
  threadCount: 0;
  readerMode: string;
  writerMode: 'bufferWriter';
  targetMode: string;
  codecConfigs: RemotionWebcodecsConfig['codecConfigs'];
  encoderNondeterministic: true;
  version: '4.0.479';
  packages: readonly ['@remotion/media-parser', '@remotion/webcodecs'];
  operationBackend: OperationBackend;
  mediaParser: RemotionMediaParserConfig;
  webcodecs: RemotionWebcodecsConfig;
}

export class RemotionEngine implements MediaEngine {
  readonly id = REMOTION_ENGINE_ID;

  private readonly parser = new RemotionMediaParserEngine();
  private readonly webcodecs = new RemotionWebcodecsEngine();
  private readonly lifecycle = new AdapterLifecycleController(REMOTION_ENGINE_ID);
  private readonly fallbackAbort = new AbortController();
  private operationBackend: OperationBackend = 'none';

  /** Records the actual layer selected for the most recent benchmark operation. */
  get configUsed(): RemotionConfigUsed {
    const parser = this.parser.configUsed;
    const webcodecs = this.webcodecs.configUsed;
    return captureConfigUsedSnapshot(REMOTION_ENGINE_ID, {
      framework: 'remotion',
      packageVersions: {
        '@remotion/media-parser': '4.0.479',
        '@remotion/webcodecs': '4.0.479',
      },
      backend: this.operationBackend,
      hardwareAcceleration: 'prefer-hardware-with-software-fallback',
      workerCount: parser.workerCount,
      threadCount: 0,
      readerMode: this.operationBackend === 'media-parser' ? parser.readerMode : webcodecs.readerMode,
      writerMode: 'bufferWriter',
      targetMode: this.operationBackend === 'media-parser'
        ? 'metadata-or-packet-callbacks'
        : 'in-memory-complete-output',
      codecConfigs: webcodecs.codecConfigs,
      encoderNondeterministic: true,
      version: '4.0.479',
      packages: ['@remotion/media-parser', '@remotion/webcodecs'],
      operationBackend: this.operationBackend,
      mediaParser: parser,
      webcodecs,
    }, { requireProfile: true }) as unknown as RemotionConfigUsed;
  }

  capabilities(): CapabilitySet {
    const parser = this.parser.capabilities();
    const webcodecs = this.webcodecs.capabilities();

    const capabilities: CapabilitySet = {
      operations: { ...parser.operations, ...webcodecs.operations },
      containersIn: union(parser.containersIn, webcodecs.containersIn),
      containersOut: [...webcodecs.containersOut],
      videoCodecs: union(parser.videoCodecs, webcodecs.videoCodecs),
      audioCodecs: union(parser.audioCodecs, webcodecs.audioCodecs),
      videoCodecsIn: unionOptional(parser.videoCodecsIn, webcodecs.videoCodecsIn),
      audioCodecsIn: unionOptional(parser.audioCodecsIn, webcodecs.audioCodecsIn),
      videoCodecsOut: webcodecs.videoCodecsOut ? [...webcodecs.videoCodecsOut] : undefined,
      audioCodecsOut: webcodecs.audioCodecsOut ? [...webcodecs.audioCodecsOut] : undefined,
      encryption: [],
      probeReadModes: parser.probeReadModes ? [...parser.probeReadModes] : undefined,
      features: union(parser.features, webcodecs.features).filter(
        // Neither package exposes public decrypt/protected-track normalization. Do not advertise an
        // adapter-side MP4 fallback as framework support. media-parser's `decodingTimestamp` also
        // proves non-authoritative across MP3, TS/HLS, Matroska, and PCM packet groupings, so the
        // unified read column must not inherit the WebCodecs child's flat DTS capability token.
        (feature) => feature !== 'metadata:protected-tracks' && feature !== 'packets:dts',
      ),
    };
    return validateCapabilitySet(this, capabilities);
  }

  supports(request: ConcreteOperationRequest): SupportDecision {
    const decision = request.operation === 'probe' || request.operation === 'demux'
      ? this.parser.supports(request)
      : this.webcodecs.supports(request);
    return validateSupportDecision(REMOTION_ENGINE_ID, decision);
  }

  async init(context?: LifecycleContext): Promise<void> {
    const call = context ?? fallbackLifecycleContext(this.fallbackAbort.signal, 'support');
    // Package imports are module-cached, so initializing both intended layers does not load duplicate
    // library copies. It does warm both the parser worker path and the native WebCodecs path untimed.
    await this.lifecycle.init(call, () => Promise.all([
      this.parser.init(call),
      this.webcodecs.init(call),
    ]).then(() => undefined));
  }

  async dispose(context?: LifecycleContext): Promise<void> {
    const call = context ?? fallbackLifecycleContext(this.fallbackAbort.signal, 'cleanup');
    await this.lifecycle.dispose(call, async () => {
      await Promise.all([this.parser.dispose(call), this.webcodecs.dispose(call)]);
      // Keep operationBackend intact: runOne() disposes before the matrix snapshots configUsed.
    });
  }

  async probe(input: MediaInput, context?: OperationContext): Promise<NormalizedMetadata> {
    const call = context ?? fallbackOperationContext('probe', this.fallbackAbort.signal);
    return this.lifecycle.operation('probe', call, () => {
      this.operationBackend = 'media-parser';
      return this.parser.probe(input, call);
    });
  }

  async demux(input: MediaInput, context?: OperationContext): Promise<DemuxResult> {
    const call = context ?? fallbackOperationContext('demux', this.fallbackAbort.signal);
    return this.lifecycle.operation('demux', call, () => {
      this.operationBackend = 'media-parser';
      return this.parser.demux(input, call);
    });
  }

  async remux(input: MediaInput, opts: RemuxOptions, context?: OperationContext): Promise<MediaBytes> {
    const call = context ?? fallbackOperationContext('remux', this.fallbackAbort.signal);
    return this.lifecycle.operation('remux', call, () => {
      this.operationBackend = 'webcodecs';
      return this.webcodecs.remux(input, opts, call);
    });
  }

  async transcode(input: MediaInput, opts: TranscodeOptions, context?: OperationContext): Promise<MediaBytes> {
    const call = context ?? fallbackOperationContext('transcode', this.fallbackAbort.signal);
    return this.lifecycle.operation('transcode', call, () => {
      this.operationBackend = 'webcodecs';
      return this.webcodecs.transcode(input, opts, call);
    });
  }

  async decodeFrames(
    input: MediaInput,
    opts?: DecodeOptions,
    context?: OperationContext,
  ): Promise<FrameSink> {
    const call = context ?? fallbackOperationContext('decodeFrames', this.fallbackAbort.signal);
    return this.lifecycle.operation('decodeFrames', call, () => {
      this.operationBackend = 'webcodecs';
      return this.webcodecs.decodeFrames(input, opts, call);
    });
  }

  async seek(
    input: MediaInput,
    tUs: number,
    context?: OperationContext,
  ): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    const call = context ?? fallbackOperationContext('seek', this.fallbackAbort.signal);
    return this.lifecycle.operation('seek', call, () => {
      this.operationBackend = 'webcodecs';
      return this.webcodecs.seek(input, tUs, call);
    });
  }

  async trim(
    input: MediaInput,
    range: { startUs: number; endUs: number },
    opts: { container: string; frameAccurate: boolean },
    context?: OperationContext,
  ): Promise<MediaBytes> {
    // Kept only to satisfy MediaEngine's required method surface. Because trim is not declared, the
    // runner negotiates NA_ENGINE and never calls this method in a valid benchmark cell.
    const call = context ?? fallbackOperationContext('trim', this.fallbackAbort.signal);
    return this.lifecycle.operation('trim', call, () => {
      this.operationBackend = 'webcodecs';
      return this.webcodecs.trim(input, range, opts, call);
    });
  }
}

export function registerRemotion(): void {
  registerEngine('remotion', () => new RemotionEngine());
}

function union<T>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])];
}

function unionOptional<T>(a?: readonly T[], b?: readonly T[]): T[] | undefined {
  if (!a && !b) return undefined;
  return union(a ?? [], b ?? []);
}

function fallbackLifecycleContext(
  signal: AbortSignal,
  phase: LifecycleContext['phase'] = 'functional',
): LifecycleContext {
  return { signal, emit: () => undefined, phase };
}

function fallbackOperationContext(
  operation: ConcreteOperationRequest['operation'],
  signal: AbortSignal,
): OperationContext {
  return {
    ...fallbackLifecycleContext(signal),
    checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
    request: {
      protocol: CONCRETE_OPERATION_PROTOCOL,
      scenarioId: 'remotion/direct',
      operation,
      inputs: [],
      options: {},
    },
  };
}
