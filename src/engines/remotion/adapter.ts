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
  CapabilitySet,
  DemuxResult,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  RemuxOptions,
  TranscodeOptions,
} from '../../core/engine.ts';
import { registerEngine } from '../../core/registry.ts';
import {
  RemotionMediaParserEngine,
  type RemotionMediaParserConfig,
} from '../remotion-media-parser/adapter.ts';
import {
  CONFIG_USED as WEBCODECS_CONFIG,
  RemotionWebcodecsEngine,
} from '../remotion-webcodecs/adapter.ts';

export const REMOTION_ENGINE_ID = 'remotion@4.0.479';

type OperationBackend = 'media-parser' | 'webcodecs' | 'none';

export interface RemotionConfigUsed {
  framework: 'remotion';
  version: '4.0.479';
  packages: readonly ['@remotion/media-parser', '@remotion/webcodecs'];
  operationBackend: OperationBackend;
  mediaParser: RemotionMediaParserConfig;
  webcodecs: typeof WEBCODECS_CONFIG;
}

export class RemotionEngine implements MediaEngine {
  readonly id = REMOTION_ENGINE_ID;

  private readonly parser = new RemotionMediaParserEngine();
  private readonly webcodecs = new RemotionWebcodecsEngine();
  private operationBackend: OperationBackend = 'none';

  /** Records the actual layer selected for the most recent benchmark operation. */
  get configUsed(): RemotionConfigUsed {
    return {
      framework: 'remotion',
      version: '4.0.479',
      packages: ['@remotion/media-parser', '@remotion/webcodecs'],
      operationBackend: this.operationBackend,
      mediaParser: this.parser.configUsed,
      webcodecs: WEBCODECS_CONFIG,
    };
  }

  capabilities(): CapabilitySet {
    const parser = this.parser.capabilities();
    const webcodecs = this.webcodecs.capabilities();

    return {
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
      features: union(parser.features, webcodecs.features).filter(
        // Neither package exposes public decrypt/protected-track normalization. Do not advertise an
        // adapter-side MP4 fallback as framework support.
        (feature) => feature !== 'metadata:protected-tracks',
      ),
    };
  }

  async init(): Promise<void> {
    // Package imports are module-cached, so initializing both intended layers does not load duplicate
    // library copies. It does warm both the parser worker path and the native WebCodecs path untimed.
    await Promise.all([this.parser.init(), this.webcodecs.init()]);
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([this.parser.dispose(), this.webcodecs.dispose()]);
    // Keep operationBackend intact: runOne() disposes before the matrix snapshots configUsed.
  }

  async probe(input: MediaInput): Promise<NormalizedMetadata> {
    this.operationBackend = 'media-parser';
    return this.parser.probe(input);
  }

  async demux(input: MediaInput): Promise<DemuxResult> {
    this.operationBackend = 'media-parser';
    return this.parser.demux(input);
  }

  async remux(input: MediaInput, opts: RemuxOptions): Promise<MediaBytes> {
    this.operationBackend = 'webcodecs';
    return this.webcodecs.remux(input, opts);
  }

  async transcode(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes> {
    this.operationBackend = 'webcodecs';
    return this.webcodecs.transcode(input, opts);
  }

  async decodeFrames(input: MediaInput, opts?: { maxFrames?: number }): Promise<FrameSink> {
    this.operationBackend = 'webcodecs';
    return this.webcodecs.decodeFrames(input, opts);
  }

  async seek(
    input: MediaInput,
    tUs: number,
  ): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    this.operationBackend = 'webcodecs';
    return this.webcodecs.seek(input, tUs);
  }

  async trim(
    input: MediaInput,
    range: { startUs: number; endUs: number },
    opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    // Kept only to satisfy MediaEngine's required method surface. Because trim is not declared, the
    // runner negotiates NA_ENGINE and never calls this method in a valid benchmark cell.
    this.operationBackend = 'webcodecs';
    return this.webcodecs.trim(input, range, opts);
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
