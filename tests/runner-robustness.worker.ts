import {
  ROBUSTNESS_WORKER_PROTOCOL,
  type RobustnessWorkerRequest,
  type RobustnessWorkerResponse,
} from '../src/core/robustness-worker-protocol.ts';

self.onmessage = (event: MessageEvent<RobustnessWorkerRequest>) => {
  const request = event.data;
  if (request.scenarioId.endsWith('timeout')) {
    for (;;) Math.random();
  }
  if (request.scenarioId.endsWith('crash')) {
    throw new Error('injected isolated crash');
  }
  const resourceLimit = request.scenarioId.endsWith('resource');
  const response: RobustnessWorkerResponse = {
    schema: ROBUSTNESS_WORKER_PROTOCOL,
    state: 'RESULT',
    result: {
      engineId: 'isolated-fake@1',
      browser: request.browser,
      scenarioId: request.scenarioId,
      family: 'robustness',
      status: resourceLimit ? 'FAIL' : 'PASS',
      oracleOutcomes: [{
        state: 'VERDICT',
        oracle: 'graceful-failure',
        verdict: resourceLimit ? 'FAIL' : 'PASS',
        detail: resourceLimit ? 'memory ceiling exceeded' : 'isolated survivor accepted',
      }],
      operationEvidence: {
        schema: 'media-test/robustness-operation@1',
        disposition: resourceLimit ? 'resource-limit' : 'returned-validatable-output',
        stage: 'operation',
        resource: resourceLimit
          ? { kind: 'memory', observed: 65, limit: 64, unit: 'bytes' }
          : { kind: 'wall-time', observed: 1, limit: 1_000, unit: 'ms' },
      },
    },
  };
  self.postMessage(response);
};
