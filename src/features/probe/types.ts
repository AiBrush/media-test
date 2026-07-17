import type { NormalizedMetadata, NormalizedTrack } from '../../core/engine.ts';

export type ProbeContractVerdict = 'PASS' | 'DIFF' | 'FAIL';

export type ProbeContractAssessment =
  | {
      state: 'VERDICT';
      verdict: ProbeContractVerdict;
      reasonCode: string;
      detail: string;
      measurements?: Record<string, number>;
      evidence?: Record<string, unknown>;
    }
  | {
      state: 'UNAVAILABLE';
      status: 'NA_ASSET' | 'NA_BROWSER';
      reasonCode: string;
      detail: string;
      evidence?: Record<string, unknown>;
    }
  | {
      state: 'ERROR';
      reasonCode: string;
      detail: string;
      evidence?: Record<string, unknown>;
    };

export interface ProbeProtectionEvidence {
  encrypted: boolean;
  scheme: string | null;
  source?: 'playlist' | 'container' | 'track';
}

/**
 * Probe-local extension accepted at the feature boundary until every adapter exposes protection
 * through the normalized metadata schema. The extractor deliberately accepts the two historical
 * spellings so migration never weakens a declared protection assertion.
 */
export type ProbeMetadataObservation = NormalizedMetadata & {
  protection?: ProbeProtectionEvidence | readonly ProbeProtectionEvidence[];
  protectionScheme?: string | null;
};

export type ProbeTrackObservation = NormalizedTrack & {
  protection?: ProbeProtectionEvidence;
  protectionScheme?: string | null;
};

export function verdict(
  value: ProbeContractVerdict,
  reasonCode: string,
  detail: string,
  measurements?: Record<string, number>,
  evidence?: Record<string, unknown>,
): ProbeContractAssessment {
  return {
    state: 'VERDICT',
    verdict: value,
    reasonCode,
    detail,
    ...(measurements ? { measurements } : {}),
    ...(evidence ? { evidence } : {}),
  };
}

export function unavailable(
  status: 'NA_ASSET' | 'NA_BROWSER',
  reasonCode: string,
  detail: string,
  evidence?: Record<string, unknown>,
): ProbeContractAssessment {
  return {
    state: 'UNAVAILABLE',
    status,
    reasonCode,
    detail,
    ...(evidence ? { evidence } : {}),
  };
}

export function contractError(
  reasonCode: string,
  detail: string,
  evidence?: Record<string, unknown>,
): ProbeContractAssessment {
  return {
    state: 'ERROR',
    reasonCode,
    detail,
    ...(evidence ? { evidence } : {}),
  };
}
