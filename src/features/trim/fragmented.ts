import { inspectFragmentedMp4 } from '../streaming-output/fragmented-mp4.ts';
import { trimVerdict, type TrimDecision } from './types.ts';

export interface FragmentedTrimContract {
  readonly requiredTrackTypes: readonly ('video' | 'audio')[];
  readonly requireCmafBrand?: boolean;
  readonly requireZeroBasedDecodeTime?: boolean;
}

/** Validate init + complete moof/mdat runs + traf/tfdt and the rebased per-track decode timeline. */
export function assessFragmentedTrimOutput(
  bytes: Uint8Array,
  contract: FragmentedTrimContract,
): TrimDecision {
  const read = inspectFragmentedMp4(bytes, {
    cmaf: contract.requireCmafBrand === true,
    requireParameterSets: true,
    requireRandomAccessStart: true,
  });
  if (read.state !== 'OK') return trimVerdict('FAIL', read.reasonCode, read.detail);
  const failures: string[] = [];
  for (const required of [...new Set(contract.requiredTrackTypes)]) {
    if (!read.tracks.some((track) => track.type === required)) failures.push(`required ${required} track is absent`);
  }
  if (contract.requireZeroBasedDecodeTime !== false) {
    for (const track of read.tracks) {
      if (track.firstDecodeTime !== 0) {
        failures.push(`track ${track.trackId} first tfdt is ${track.firstDecodeTime}, expected zero`);
      }
    }
  }
  for (const segment of read.segments) {
    if (segment.sampleCount <= 0 || segment.sampleBytes !== segment.mdatPayloadBytes) {
      failures.push(`fragment sequence ${segment.sequenceNumber} does not exactly cover its mdat`);
    }
  }
  const measurements = {
    fragments: read.segments.length,
    tracks: read.tracks.length,
    samples: read.totalSamples,
    initializationBytes: read.initialization.end - read.initialization.start,
    cmafBrand: read.cmafCompatible ? 1 : 0,
  };
  if (failures.length > 0) {
    return trimVerdict('FAIL', 'TRIM_FRAGMENT_STRUCTURE_INVALID', failures.join('; '), measurements);
  }
  return trimVerdict(
    'PASS',
    'TRIM_FRAGMENT_STRUCTURE_VALID',
    `initialization plus ${read.segments.length} valid media fragment(s), rebased tfdt per track`,
    measurements,
  );
}
