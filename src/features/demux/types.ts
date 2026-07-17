import type { OracleId, OracleOutcome, OracleVerdict } from '../../core/scenario.ts';

export const DEMUX_DTS_EVIDENCE_SCHEMA = 'media-test/demux-dts-evidence@1' as const;
export const DEMUX_SCALE_CONTRACT_SCHEMA = 'media-test/demux-scale-contract@1' as const;
export const DEMUX_SCALE_OBSERVATION_SCHEMA = 'media-test/demux-scale-observation@1' as const;

export function demuxVerdict(
  verdict: OracleVerdict,
  reasonCode: string,
  detail: string,
  measurements?: Record<string, number>,
  oracle: OracleId = 'golden-packets',
): OracleOutcome {
  return {
    state: 'VERDICT',
    oracle,
    verdict,
    reasonCode,
    detail,
    ...(measurements ? { measurements } : {}),
  };
}

export function demuxError(
  reasonCode: string,
  detail: string,
  oracle: OracleId = 'golden-packets',
): OracleOutcome {
  return { state: 'ERROR', oracle, reasonCode, detail };
}

export function canonicalDemuxCodec(codec: string): string {
  const value = codec.trim().toLowerCase();
  if (value === 'h264' || value === 'avc' || value === 'avc1' || value === 'avc3' ||
      value.startsWith('avc1.') || value.startsWith('avc3.') || value === 'v_mpeg4/iso/avc') {
    return 'h264';
  }
  if (value === 'hevc' || value === 'h265' || value === 'hev1' || value === 'hvc1' ||
      value.startsWith('hev1.') || value.startsWith('hvc1.')) {
    return 'hevc';
  }
  if (value === 'aac' || value === 'mp4a' || value.startsWith('mp4a.')) return 'aac';
  return value;
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
