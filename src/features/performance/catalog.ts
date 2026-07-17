/** Stable performance questions, alias policy, and data-driven scale availability. */

import { available, unavailable, type PerformanceEvidence } from './contracts.ts';

export interface PerformanceQuestion {
  scenarioId: string;
  question: string;
  protocolId: string;
  aggregatePolicy: 'INCLUDE' | 'ALIAS_EXCLUDED';
  aliasOf?: string;
}

const questions: PerformanceQuestion[] = [
  q('performance/extract-metadata', 'How many full metadata probes per second complete on the canonical 30-second input?', 'adaptive-probe-v1'),
  q('performance/iterate-video-packets', 'How many observed demux packets per second are iterated on the canonical 30-second input?', 'adaptive-demux-v1'),
  q('performance/convert-webm-resize-320x180', 'How many neutral-reader-counted output video presentation units per second are produced by the 320×180 WebM conversion?', 'adaptive-output-units-v1'),
  q('performance/bundle-size', 'What complete pre-report transfer cost ships for JavaScript, WASM, workers, and codec/core payloads?', 'offline-complete-transfer-v1'),
  alias('performance/op-sweep-probe', 'Where does the canonical metadata probe sit in the randomized operation-sweep view?', 'performance/extract-metadata'),
  alias('performance/op-sweep-demux', 'Where does the canonical packet iteration sit in the randomized operation-sweep view?', 'performance/iterate-video-packets'),
  q('performance/op-sweep-remux-mp4-to-mkv', 'How many source presentation seconds per wall second does MP4-to-Matroska remux preserve?', 'adaptive-remux-presentation-v1'),
  q('performance/op-sweep-transcode-webm', 'How many actual encoded output frames per second does the 320×180 WebM transcode produce?', 'adaptive-encode-units-v1'),
  q('performance/decode-fps', 'How many actually returned decoded frames per second are produced for the bounded prefix?', 'adaptive-decode-units-v1'),
  q('performance/encode-fps', 'How many actual encoded presentation units per second are produced by source-resolution VP9 encoding?', 'adaptive-encode-source-resolution-v1'),
  q('performance/seek-ms', 'What warm-cache keyframe-target seek latency is observed from operation entry to the landed frame?', 'adaptive-warm-keyframe-seek-v1'),
  ...ladderQuestions('extract-metadata', 'probe', 'metadata probes per second', 'adaptive-scale-probe-v1'),
  ...ladderQuestions('iterate-packets', 'demux', 'observed packets per second', 'adaptive-scale-demux-v1'),
  q('performance/size-ladder-demux-peak-memory-large4k', 'What user-agent-specific peak and delta does demuxing the committed 4K rung retain?', 'ua-memory-window-large4k-v1'),
  q('performance/size-ladder-demux-peak-memory-large', 'What user-agent-specific peak and delta does demuxing the committed 120-second rung retain?', 'ua-memory-window-large-v1'),
  q('performance/size-ladder-demux-peak-memory-huge', 'What user-agent-specific peak and delta does demuxing the committed 600-second rung retain?', 'ua-memory-window-huge-v1'),
  q('performance/convert-peak-memory', 'What user-agent-specific peak and baseline delta occurs during the 320×180 conversion window?', 'ua-memory-window-convert-v1'),
  q('performance/convert-longtasks', 'How many in-window milliseconds of observed main-thread long tasks occur during conversion?', 'longtask-window-convert-v1'),
  q('performance/metamorphic-transcode-idempotent-source-res', 'How many actual output frames per second retain visual identity at source resolution?', 'adaptive-metamorphic-source-res-v1'),
  q('performance/metamorphic-probe-duration-cross-container', 'How quickly is source presentation duration preserved across MP4-to-WebM remux?', 'adaptive-metamorphic-duration-v1'),
  q('performance/metamorphic-decode-remux', 'How quickly does MP4-to-Matroska remux preserve decode-equivalent presentation?', 'adaptive-metamorphic-decode-remux-v1'),
  q('performance/metamorphic-vfr-iterate-packets', 'How many observed irregular-timeline VFR packets per second are iterated?', 'adaptive-metamorphic-vfr-demux-v1'),
  q('performance/metamorphic-vfr-probe-duration', 'How many VFR presentation-duration probes per second complete without nominal-rate inference?', 'adaptive-metamorphic-vfr-probe-v1'),
];

export const PERFORMANCE_QUESTIONS: readonly PerformanceQuestion[] = Object.freeze(
  questions.map((entry) => Object.freeze({ ...entry })),
);

export function performanceQuestion(scenarioId: string): PerformanceQuestion | undefined {
  return PERFORMANCE_QUESTIONS.find((entry) => entry.scenarioId === scenarioId);
}

/** Scenario ids admitted to aggregate scoring; aliases remain visible but cannot double-weight wins. */
export function aggregatePerformanceQuestionIds(
  scenarioIds: readonly string[] = PERFORMANCE_QUESTIONS.map((entry) => entry.scenarioId),
): string[] {
  const selected = new Set(scenarioIds);
  return PERFORMANCE_QUESTIONS
    .filter((entry) => selected.has(entry.scenarioId) && entry.aggregatePolicy === 'INCLUDE')
    .map((entry) => entry.scenarioId);
}

export function validatePerformanceQuestionCatalog(registeredIds: readonly string[]): string[] {
  const diagnostics: string[] = [];
  const registered = new Set(registeredIds);
  const catalogIds = new Set<string>();
  const questionText = new Set<string>();
  const protocols = new Set<string>();
  for (const entry of PERFORMANCE_QUESTIONS) {
    if (catalogIds.has(entry.scenarioId)) diagnostics.push(`duplicate catalog id: ${entry.scenarioId}`);
    catalogIds.add(entry.scenarioId);
    if (questionText.has(entry.question)) diagnostics.push(`duplicate question: ${entry.question}`);
    questionText.add(entry.question);
    if (entry.aggregatePolicy === 'INCLUDE') {
      if (protocols.has(entry.protocolId)) diagnostics.push(`duplicate included protocol: ${entry.protocolId}`);
      protocols.add(entry.protocolId);
    }
    if (entry.aggregatePolicy === 'ALIAS_EXCLUDED') {
      if (!entry.aliasOf || entry.aliasOf === entry.scenarioId) diagnostics.push(`invalid alias: ${entry.scenarioId}`);
    }
  }
  for (const id of registered) if (!catalogIds.has(id)) diagnostics.push(`registered id missing question: ${id}`);
  for (const id of catalogIds) if (!registered.has(id)) diagnostics.push(`catalog question is not registered: ${id}`);
  for (const entry of PERFORMANCE_QUESTIONS) {
    if (entry.aliasOf && !catalogIds.has(entry.aliasOf)) diagnostics.push(`alias target missing: ${entry.scenarioId} -> ${entry.aliasOf}`);
  }
  return diagnostics.sort();
}

export interface ScaleAvailabilityInput {
  assetId: string;
  manifest?: { sha256?: string | null; sizeBytes?: number | null };
  requiredGoldenKinds: readonly string[];
  goldenEvidence: Readonly<Record<string, { state: string; reasonCode?: string } | undefined>>;
}

export interface ScaleAvailability {
  assetId: string;
  sha256: string;
  sizeBytes: number;
  requiredGoldenKinds: string[];
}

/** Runtime scale availability is derived from content identity and typed golden reader states. */
export function resolveScaleAvailability(
  input: ScaleAvailabilityInput,
): PerformanceEvidence<ScaleAvailability> {
  const sha256 = input.manifest?.sha256;
  const sizeBytes = input.manifest?.sizeBytes;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256) ||
      !Number.isSafeInteger(sizeBytes) || (sizeBytes as number) < 0) {
    return unavailable('NA_ASSET', 'SCALE_ASSET_UNRESOLVED', `${input.assetId} lacks a resolved digest and size`);
  }
  const required = [...new Set(input.requiredGoldenKinds)].sort();
  for (const kind of required) {
    const evidence = input.goldenEvidence[kind];
    if (!evidence || evidence.state === 'MISSING' || evidence.state === 'PENDING') {
      return unavailable('NA_ASSET', 'SCALE_GOLDEN_UNAVAILABLE', `${input.assetId} ${kind} golden is unavailable`);
    }
    if (evidence.state !== 'OK') {
      return unavailable('ERROR', evidence.reasonCode ?? 'SCALE_GOLDEN_INVALID', `${input.assetId} ${kind} golden is ${evidence.state}`);
    }
  }
  return available({
    assetId: input.assetId,
    sha256,
    sizeBytes: sizeBytes as number,
    requiredGoldenKinds: required,
  });
}

function q(scenarioId: string, question: string, protocolId: string): PerformanceQuestion {
  return { scenarioId, question, protocolId, aggregatePolicy: 'INCLUDE' };
}

function alias(scenarioId: string, question: string, aliasOf: string): PerformanceQuestion {
  return {
    scenarioId,
    question,
    protocolId: `alias-of:${aliasOf}`,
    aggregatePolicy: 'ALIAS_EXCLUDED',
    aliasOf,
  };
}

function ladderQuestions(
  idStem: 'extract-metadata' | 'iterate-packets',
  operation: string,
  metric: string,
  protocolStem: string,
): PerformanceQuestion[] {
  const labels: Record<string, string> = {
    tiny: 'committed 2-second tiny',
    medium: 'committed 30-second medium',
    large4k: 'committed 4K',
    large: 'committed 120-second large',
    huge: 'committed 600-second huge',
    massive: 'committed two-hour massive',
  };
  return Object.entries(labels).map(([key, label]) => q(
    `performance/size-ladder-${idStem}-${key}`,
    `How many ${metric} does ${operation} sustain on the ${label} rung?`,
    `${protocolStem}:${key}`,
  ));
}
