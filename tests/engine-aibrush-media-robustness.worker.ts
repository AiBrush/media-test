/// <reference lib="webworker" />

import type { LifecycleContext } from '../src/core/engine.ts';
import type { CodecSupport } from '../src/core/feature-detect.ts';
import { runOne } from '../src/core/runner.ts';
import type { ScenarioResult } from '../src/core/scenario.ts';
import { AibrushMediaEngine } from '../src/engines/aibrush-media/adapter.ts';
import { robustnessScenarios } from '../src/scenarios/robustness/index.ts';

interface WorkerRequest {
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

type WorkerResponse =
  | { readonly state: 'RESULT'; readonly result: ScenarioResult; readonly disposeCalls: number }
  | { readonly state: 'ERROR'; readonly message: string };

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  void execute(event.data).then(
    (response) => workerScope.postMessage(response),
    (error) => workerScope.postMessage({
      state: 'ERROR',
      message: error instanceof Error ? error.stack ?? error.message : String(error),
    } satisfies WorkerResponse),
  );
};

async function execute(request: WorkerRequest): Promise<WorkerResponse> {
  const base = robustnessScenarios.find((scenario) =>
    scenario.id === 'robustness/prop_demux_mux_roundtrip_eq');
  if (base === undefined) throw new Error('missing demux→mux robustness scenario');

  // The tiny workhorse has the same H.264/AAC MP4 tuple as the canonical 30-second row and committed
  // packet evidence, while keeping this Worker lifecycle regression focused and deterministic.
  const inputId = 'tiny_h264_360p_2s.mp4';
  const scenario = { ...base, input: inputId };
  const engine = new AibrushMediaEngine();
  const dispose = engine.dispose.bind(engine);
  let disposeCalls = 0;
  Object.defineProperty(engine, 'dispose', {
    configurable: true,
    value: async (context?: LifecycleContext): Promise<void> => {
      disposeCalls += 1;
      await dispose(context);
    },
  });

  const support: CodecSupport = {
    webcodecs: false,
    videoDecode: {},
    videoEncode: {},
    audioDecode: {},
    audioEncode: {},
    alpha: false,
    strictRgbaPixels: false,
    strictGoldenRgba: false,
    strictSourceRgba: false,
    webgpu: false,
    measureMemory: false,
  };
  const bytes = request.bytes.slice();
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: async (resource: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const href = resource instanceof Request ? resource.url : String(resource);
      const url = new URL(href, 'http://localhost/');
      if (url.pathname.startsWith('/fixtures/golden/')) {
        const file = Bun.file(url.pathname.replace(/^\/+/, ''));
        return await file.exists()
          ? new Response(await file.arrayBuffer(), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response(null, { status: 404 });
      }
      return originalFetch(resource, init);
    },
  });
  try {
    const result = await runOne(engine, scenario, 'chromium', support, {
      browser: 'chromium',
      pillar: 'robustness',
      env: {
        suiteVersion: 'aibrush-robustness-worker-regression',
        engineId: 'aibrush-media@worker-regression',
        browser: 'chromium',
      },
      resolvedInputs: [{
        id: inputId,
        urlAssetPath: inputId,
        sha256: request.sha256,
        sizeBytes: bytes.byteLength,
        integrity: 'VERIFIED',
      }],
      verifiedContents: [{
        state: 'VERIFIED',
        identity: { logicalPath: inputId, sha256: request.sha256, sizeBytes: bytes.byteLength },
        bytes,
        actualSha256: request.sha256,
        actualSizeBytes: bytes.byteLength,
      }],
      pixelBehavior: {
        state: 'UNSUPPORTED',
        reasonCode: 'PIXEL_API_UNAVAILABLE',
        detail: 'packet roundtrip does not require pixel behavior',
      },
    });
    return { state: 'RESULT', result, disposeCalls };
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  }
}
