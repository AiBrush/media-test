import {
  probeFragmentedMp4Append,
  type FragmentedMp4AppendEnvironment,
  type FragmentedMp4Contract,
} from './fragmented-mp4.ts';
import {
  probeLiveWebmAppend,
  type LiveWebmAppendEnvironment,
} from './live-webm.ts';
import { streamingUnavailable, type StreamingDecision } from './types.ts';
import type { StreamingRepresentation } from './contracts.ts';

export interface BrowserAppendProbeInput {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly representation: StreamingRepresentation;
  readonly cmaf?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * Production MediaSource bridge. Structural readers always run independently; this probe adds a
 * real sequential SourceBuffer append only when the current realm exposes the required browser
 * surface and MIME tuple.
 */
export async function probeStreamingBrowserAppend(input: BrowserAppendProbeInput): Promise<StreamingDecision> {
  if (input.representation !== 'fragmented-mp4' && input.representation !== 'live-webm') {
    throw new TypeError(`browser append is not defined for ${input.representation}`);
  }
  if (typeof MediaSource !== 'function' || typeof MediaSource.isTypeSupported !== 'function') {
    return streamingUnavailable(
      'NA_BROWSER',
      'MEDIA_SOURCE_API_UNAVAILABLE',
      'MediaSource is unavailable in this browser realm',
    );
  }
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return streamingUnavailable(
      'NA_BROWSER',
      'MEDIA_SOURCE_ATTACHMENT_UNAVAILABLE',
      'the realm cannot attach MediaSource to a media element',
    );
  }
  const session = new BrowserMediaSourceSession(input.mime, input.signal);
  try {
    if (input.representation === 'fragmented-mp4') {
      const contract: FragmentedMp4Contract = { cmaf: input.cmaf === true };
      return await probeFragmentedMp4Append(input.bytes, input.mime, session, contract);
    }
    return await probeLiveWebmAppend(input.bytes, input.mime, session);
  } finally {
    await session.dispose();
  }
}

class BrowserMediaSourceSession implements FragmentedMp4AppendEnvironment, LiveWebmAppendEnvironment {
  private readonly mediaSource = new MediaSource();
  private readonly video = document.createElement('video');
  private readonly objectUrl: string;
  private sourceBuffer?: SourceBuffer;
  private opening?: Promise<void>;
  private disposed = false;

  constructor(
    private readonly mime: string,
    private readonly signal?: AbortSignal,
  ) {
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    this.video.muted = true;
    this.video.preload = 'metadata';
  }

  isTypeSupported(mime: string): boolean {
    return mime === this.mime && MediaSource.isTypeSupported(mime);
  }

  appendInitialization(bytes: Uint8Array): Promise<void> {
    return this.append(bytes);
  }

  appendMediaSegment(bytes: Uint8Array, _index: number): Promise<void> {
    return this.append(bytes);
  }

  appendCluster(bytes: Uint8Array, _index: number): Promise<void> {
    return this.append(bytes);
  }

  async finalize(): Promise<void> {
    await this.ensureOpen();
    const sourceBuffer = this.sourceBuffer!;
    if (sourceBuffer.updating) await waitForEvent(sourceBuffer, 'updateend', this.signal);
    if (this.mediaSource.readyState === 'open') this.mediaSource.endOfStream();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      if (this.sourceBuffer?.updating) this.sourceBuffer.abort();
    } catch {
      // Cleanup must not replace the append verdict.
    }
    this.video.removeAttribute('src');
    this.video.load();
    URL.revokeObjectURL(this.objectUrl);
  }

  private async append(bytes: Uint8Array): Promise<void> {
    if (this.disposed) throw new Error('MediaSource append session is disposed');
    if (this.signal?.aborted) throw abortError(this.signal.reason);
    await this.ensureOpen();
    const sourceBuffer = this.sourceBuffer!;
    if (sourceBuffer.updating) await waitForEvent(sourceBuffer, 'updateend', this.signal);
    const completion = waitForEvent(sourceBuffer, 'updateend', this.signal);
    sourceBuffer.appendBuffer(bytes.slice());
    await completion;
  }

  private ensureOpen(): Promise<void> {
    if (this.opening) return this.opening;
    this.opening = (async () => {
      if (this.mediaSource.readyState !== 'open') {
        const opened = waitForEvent(this.mediaSource, 'sourceopen', this.signal);
        this.video.src = this.objectUrl;
        await opened;
      }
      this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mime);
      this.sourceBuffer.mode = 'segments';
    })();
    return this.opening;
  }
}

function waitForEvent(
  target: EventTarget,
  successType: string,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      target.removeEventListener(successType, onSuccess);
      target.removeEventListener('error', onError);
      target.removeEventListener('abort', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onSuccess = (): void => {
      cleanup();
      resolve();
    };
    const onError = (event: Event): void => {
      cleanup();
      reject(new Error(`MediaSource ${event.type} before ${successType}`));
    };
    const onAbort = (): void => {
      cleanup();
      reject(abortError(signal?.reason));
    };
    target.addEventListener(successType, onSuccess, { once: true });
    target.addEventListener('error', onError, { once: true });
    target.addEventListener('abort', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(reason: unknown): DOMException {
  return reason instanceof DOMException && reason.name === 'AbortError'
    ? reason
    : new DOMException(typeof reason === 'string' ? reason : 'operation aborted', 'AbortError');
}
