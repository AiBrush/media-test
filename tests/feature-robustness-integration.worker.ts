import {
  ROBUSTNESS_WORKER_PROTOCOL,
  type RobustnessWorkerRequest,
  type RobustnessWorkerResponse,
} from '../src/core/robustness-worker-protocol.ts';
import type { OracleOutcome, ResultStatus, ScenarioOperationEvidence } from '../src/core/scenario.ts';

const FULL = 'robustness-full-engine@1.0.0';
const PARTIAL = 'robustness-partial-engine@1.0.0';
const MIXED_NA = 'robustness-mixed-na-engine@1.0.0';

self.onmessage = (event: MessageEvent<RobustnessWorkerRequest>) => {
  const request = event.data;
  const file = request.selectedFile ?? request.options.selection?.file ?? '';
  const status = statusFor(request.engineRegistryId, file);
  const oracleOutcomes: OracleOutcome[] = status === 'PASS'
    ? [{ state: 'VERDICT', oracle: 'golden-metadata', verdict: 'PASS', detail: `${file} metadata matches` }]
    : status === 'FAIL'
      ? [{
          state: 'VERDICT',
          oracle: 'golden-metadata',
          verdict: 'FAIL',
          reasonCode: 'METADATA_DURATION_MISMATCH',
          detail: `${file} duration differs from the source golden`,
        }]
      : [];
  const operationEvidence: ScenarioOperationEvidence = {
    schema: 'media-test/robustness-operation@1',
    disposition: status === 'NA_ENGINE' ? 'not-applicable' : 'returned-validatable-output',
    stage: status === 'NA_ENGINE' ? 'preflight' : 'survivor-oracle',
    resource: { kind: 'wall-time', observed: 1, limit: 120_000, unit: 'ms' },
  };
  const response: RobustnessWorkerResponse = {
    schema: ROBUSTNESS_WORKER_PROTOCOL,
    state: 'RESULT',
    result: {
      engineId: request.engineRegistryId,
      browser: request.browser,
      scenarioId: request.scenarioId,
      family: 'robustness',
      status,
      oracleOutcomes,
      operationEvidence,
      measurement: { state: 'NOT_REQUESTED' },
      env: request.options.env,
      ...(request.options.selection ? { selection: request.options.selection } : {}),
      ...(status === 'FAIL'
        ? { reason: `${file} duration mismatch` }
        : status === 'NA_ENGINE'
          ? { reason: '[ROBUSTNESS_CONCRETE_TUPLE_UNSUPPORTED] concrete parser tuple is unsupported' }
          : {}),
    },
  };
  self.postMessage(response);
};

function statusFor(engineId: string, file: string): ResultStatus {
  if (engineId === FULL) return 'PASS';
  if (engineId === PARTIAL) return file === 'robustness-three-file-pass.mp4' ? 'PASS' : 'FAIL';
  if (engineId === MIXED_NA) {
    if (file === 'robustness-three-file-pass.mp4') return 'PASS';
    return file === '02-unsupported.mp4' ? 'NA_ENGINE' : 'FAIL';
  }
  return 'ERROR';
}
