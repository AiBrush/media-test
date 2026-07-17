import {
  createNotApplicableError,
  type ApplicabilityTupleSummary,
  type ConcreteWebCodecsConfig,
} from '../../core/engine.ts';
import type { TrimContract } from './contracts.ts';
import { trimError, trimUnavailable, trimVerdict, type TrimDecision } from './types.ts';

export interface TrimTupleTrack {
  readonly identity: string;
  readonly type: 'video' | 'audio';
  readonly codec: string;
  readonly decoderConfig?: ConcreteWebCodecsConfig;
  readonly encoderConfig?: ConcreteWebCodecsConfig;
}

export interface TrimTupleRequest {
  readonly engineId: string;
  readonly inputContainer: string;
  readonly outputContainer: string;
  readonly contract: TrimContract;
  readonly tracks: readonly TrimTupleTrack[];
  /** Packet parser/copy path means browser codecs are irrelevant in copy mode. */
  readonly copyPath: 'packet-copy' | 'browser-codec' | 'engine-native';
  /**
   * Roles returned by the adapter for runner-side probing. When omitted, the standalone contract
   * requires decoder configs for every track and encoder configs in frame-accurate mode.
   */
  readonly requiredBrowserRoles?: readonly ConcreteWebCodecsConfig['role'][];
}

export interface TrimBrowserProbe {
  readonly trackIdentity?: string;
  readonly role: ConcreteWebCodecsConfig['role'];
  readonly state: 'SUPPORTED' | 'UNSUPPORTED' | 'INVALID_CONFIG' | 'ERROR';
  readonly reasonCode?: string;
  readonly detail?: string;
}

export interface TrimEngineSupport {
  readonly supported: boolean;
  readonly status?: 'NA_ENGINE' | 'NA_BROWSER';
  readonly reasonCode?: string;
  readonly reason?: string;
}

export interface TrimPreflightResult {
  readonly decision: TrimDecision;
  readonly exactConfigs: readonly ConcreteWebCodecsConfig[];
  readonly requiredRoles: readonly ConcreteWebCodecsConfig['role'][];
}

/**
 * Engine ownership stays NA_ENGINE via the shared throwable; exact browser config ownership is
 * NA_BROWSER. Copy-only packet paths request no decoder/encoder probes.
 */
export function preflightTrimTuple(
  request: TrimTupleRequest,
  engineSupport: TrimEngineSupport,
  probes: readonly TrimBrowserProbe[],
): TrimPreflightResult {
  if (!engineSupport.supported) {
    if (engineSupport.status === 'NA_BROWSER') {
      return Object.freeze({
        decision: trimUnavailable(
          'NA_BROWSER',
          engineSupport.reasonCode ?? 'TRIM_BROWSER_TUPLE_UNSUPPORTED',
          engineSupport.reason ?? 'browser does not support the concrete trim tuple',
        ),
        exactConfigs: Object.freeze([]),
        requiredRoles: Object.freeze([]),
      });
    }
    throw createNotApplicableError(
      request.engineId,
      'trim',
      engineSupport.reason ?? 'engine does not support the concrete trim tuple',
      tupleSummary(request),
      engineSupport.reasonCode ?? 'TRIM_ENGINE_TUPLE_UNSUPPORTED',
    );
  }
  if (request.copyPath === 'browser-codec') {
    const required = new Set(request.requiredBrowserRoles ?? defaultRequiredRoles(request));
    const missing = request.tracks.find((track) =>
      (required.has(`${track.type}-decoder` as ConcreteWebCodecsConfig['role']) && !track.decoderConfig) ||
      (required.has(`${track.type}-encoder` as ConcreteWebCodecsConfig['role']) && !track.encoderConfig));
    if (missing) {
      const missingRole = required.has(`${missing.type}-decoder` as ConcreteWebCodecsConfig['role']) &&
          !missing.decoderConfig
        ? `${missing.type}-decoder`
        : `${missing.type}-encoder`;
      return Object.freeze({
        decision: trimError(
          'TRIM_EXACT_CONFIG_NOT_DECLARED',
          `adapter did not declare the exact ${missingRole} config for track '${missing.identity}'`,
        ),
        exactConfigs: Object.freeze([]),
        requiredRoles: Object.freeze([]),
      });
    }
  }
  const exactConfigs = requiredConfigs(request);
  const requiredRoles = exactConfigs.map((config) => config.role);
  for (const track of request.tracks) {
    for (const config of configsForTrack(request, track)) {
      const probe = probes.find((entry) =>
        entry.role === config.role &&
        (entry.trackIdentity === undefined || entry.trackIdentity === track.identity));
      if (!probe) {
        return Object.freeze({
          decision: trimError(
            'TRIM_EXACT_CONFIG_PROBE_MISSING',
            `no ${config.role} result was recorded for track '${track.identity}'`,
          ),
          exactConfigs: Object.freeze(exactConfigs),
          requiredRoles: Object.freeze(requiredRoles),
        });
      }
      if (probe.state === 'UNSUPPORTED') {
        return Object.freeze({
          decision: trimUnavailable(
            'NA_BROWSER',
            probe.reasonCode ?? 'TRIM_BROWSER_CONFIG_UNSUPPORTED',
            probe.detail ?? `${config.role} configuration is unsupported for track '${track.identity}'`,
          ),
          exactConfigs: Object.freeze(exactConfigs),
          requiredRoles: Object.freeze(requiredRoles),
        });
      }
      if (probe.state === 'INVALID_CONFIG' || probe.state === 'ERROR') {
        return Object.freeze({
          decision: trimError(
            probe.reasonCode ?? (probe.state === 'INVALID_CONFIG'
              ? 'TRIM_RUNNER_CONFIG_INVALID'
              : 'TRIM_BROWSER_PROBE_ERROR'),
            probe.detail ?? `${config.role} probe failed for track '${track.identity}'`,
          ),
          exactConfigs: Object.freeze(exactConfigs),
          requiredRoles: Object.freeze(requiredRoles),
        });
      }
    }
  }
  const noBrowserProbeReason = request.copyPath === 'packet-copy'
    ? {
        code: 'TRIM_COPY_CODEC_PROBE_NOT_REQUIRED',
        detail: 'copy trim uses a packet parser/copy path and is not browser-codec gated',
      }
    : {
        code: 'TRIM_ENGINE_NATIVE_CODEC_PROBE_NOT_REQUIRED',
        detail: 'trim decode/encode is owned by the engine rather than browser WebCodecs',
      };
  return Object.freeze({
    decision: trimVerdict(
      'PASS',
      exactConfigs.length === 0 ? noBrowserProbeReason.code : 'TRIM_EXACT_CONFIGS_SUPPORTED',
      exactConfigs.length === 0
        ? noBrowserProbeReason.detail
        : `${exactConfigs.length} exact decoder/encoder configuration(s) are supported`,
      { exactConfigProbes: exactConfigs.length },
    ),
    exactConfigs: Object.freeze(exactConfigs),
    requiredRoles: Object.freeze(requiredRoles),
  });
}

function requiredConfigs(request: TrimTupleRequest): ConcreteWebCodecsConfig[] {
  return request.tracks.flatMap((track) => configsForTrack(request, track));
}

function configsForTrack(request: TrimTupleRequest, track: TrimTupleTrack): ConcreteWebCodecsConfig[] {
  if (request.copyPath !== 'browser-codec') return [];
  const required = new Set(request.requiredBrowserRoles ?? defaultRequiredRoles(request));
  const configs: ConcreteWebCodecsConfig[] = [];
  if (track.decoderConfig && required.has(track.decoderConfig.role)) configs.push(track.decoderConfig);
  if (track.encoderConfig && required.has(track.encoderConfig.role)) configs.push(track.encoderConfig);
  return configs;
}

function defaultRequiredRoles(request: TrimTupleRequest): ConcreteWebCodecsConfig['role'][] {
  const roles: ConcreteWebCodecsConfig['role'][] = [];
  for (const track of request.tracks) {
    roles.push(`${track.type}-decoder` as ConcreteWebCodecsConfig['role']);
    if (request.contract.mode === 'frame-accurate') {
      roles.push(`${track.type}-encoder` as ConcreteWebCodecsConfig['role']);
    }
  }
  return roles;
}

function tupleSummary(request: TrimTupleRequest): Partial<ApplicabilityTupleSummary> {
  return {
    inputContainers: [request.inputContainer],
    inputCodecs: request.tracks.map((track) => track.codec),
    outputContainer: request.outputContainer,
    outputCodecs: request.tracks.map((track) => track.codec),
    timingMode: request.contract.mode,
    options: {
      frameAccurate: request.contract.mode === 'frame-accurate',
      fragmented: request.contract.fragmentedOutput,
      startUs: request.contract.range.startUs,
      endUs: request.contract.range.endUs,
      copyPath: request.copyPath,
    },
  };
}
