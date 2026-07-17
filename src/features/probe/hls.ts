import { assessDeclaredMetadataFields, defineProbeMetadataFieldPolicy } from './metadata-fields.ts';
import { contractError, unavailable, verdict, type ProbeContractAssessment, type ProbeMetadataObservation } from './types.ts';
import type { ProbeResourceAccessEvidence } from '../../core/engine.ts';

export const HLS_PLAYLIST_ONLY_PROBE_SCHEMA = 'media-test/hls-playlist-only-probe@1' as const;
export const HLS_PROTECTED_SEGMENT_PROBE_SCHEMA = 'media-test/hls-protected-segment-probe@1' as const;

export interface HlsPlaylistOnlyProbeContract {
  schema: typeof HLS_PLAYLIST_ONLY_PROBE_SCHEMA;
  durationToleranceSec: number;
  expectedMethod: 'AES-128';
  allowedResourceRoles: readonly ['playlist'];
}

export interface HlsProtectedSegmentProbeContract {
  schema: typeof HLS_PROTECTED_SEGMENT_PROBE_SCHEMA;
  requiredResourceRoles: readonly ['playlist', 'segment', 'key'];
}

export type HlsProbeContract = HlsPlaylistOnlyProbeContract | HlsProtectedSegmentProbeContract;

export interface HlsPlaylistProbeEvidence {
  schema: typeof HLS_PLAYLIST_ONLY_PROBE_SCHEMA;
  durationSec: number;
  segmentCount: number;
  methods: readonly string[];
  encrypted: boolean;
  keyUris: readonly string[];
}

export type HlsPlaylistReadResult =
  | { state: 'OK'; value: HlsPlaylistProbeEvidence }
  | { state: 'MALFORMED'; reasonCode: string; detail: string };

export type HlsProbeResourceAccess = ProbeResourceAccessEvidence;

export const HLS_PLAYLIST_ONLY_CONTRACT: HlsPlaylistOnlyProbeContract = Object.freeze({
  schema: HLS_PLAYLIST_ONLY_PROBE_SCHEMA,
  durationToleranceSec: 0.05,
  expectedMethod: 'AES-128',
  allowedResourceRoles: Object.freeze(['playlist'] as const),
});

export const HLS_PROTECTED_SEGMENT_CONTRACT: HlsProtectedSegmentProbeContract = Object.freeze({
  schema: HLS_PROTECTED_SEGMENT_PROBE_SCHEMA,
  requiredResourceRoles: Object.freeze(['playlist', 'segment', 'key'] as const),
});

export function readHlsPlaylistProbeEvidence(text: string): HlsPlaylistReadResult {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== '#EXTM3U') {
    return { state: 'MALFORMED', reasonCode: 'HLS_EXTM3U_MISSING', detail: 'playlist does not start with #EXTM3U' };
  }
  let durationSec = 0;
  let segmentCount = 0;
  const methods: string[] = [];
  const keyUris: string[] = [];
  let pendingDuration = false;
  for (const line of lines.slice(1)) {
    if (line.startsWith('#EXTINF:')) {
      const token = line.slice('#EXTINF:'.length).split(',', 1)[0]?.trim() ?? '';
      const duration = Number(token);
      if (!Number.isFinite(duration) || duration < 0) {
        return { state: 'MALFORMED', reasonCode: 'HLS_EXTINF_INVALID', detail: `invalid EXTINF duration '${token}'` };
      }
      durationSec += duration;
      pendingDuration = true;
      continue;
    }
    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributeList(line.slice('#EXT-X-KEY:'.length));
      const method = attrs.METHOD?.toUpperCase();
      if (!method) {
        return { state: 'MALFORMED', reasonCode: 'HLS_KEY_METHOD_MISSING', detail: 'EXT-X-KEY has no METHOD' };
      }
      methods.push(method);
      if (method !== 'NONE') {
        const uri = attrs.URI;
        if (!uri) {
          return { state: 'MALFORMED', reasonCode: 'HLS_KEY_URI_MISSING', detail: `${method} EXT-X-KEY has no URI` };
        }
        keyUris.push(uri);
      }
      continue;
    }
    if (!line.startsWith('#')) {
      if (pendingDuration) segmentCount++;
      pendingDuration = false;
    }
  }
  if (segmentCount === 0) {
    return { state: 'MALFORMED', reasonCode: 'HLS_MEDIA_SEGMENTS_MISSING', detail: 'playlist has no EXTINF/media URI pairs' };
  }
  return {
    state: 'OK',
    value: {
      schema: HLS_PLAYLIST_ONLY_PROBE_SCHEMA,
      durationSec,
      segmentCount,
      methods,
      encrypted: methods.some((method) => method !== 'NONE'),
      keyUris: [...new Set(keyUris)],
    },
  };
}

/** Compare only facts RFC 8216 makes available from this media playlist itself. */
export function assessHlsPlaylistOnlyProbe(
  measured: ProbeMetadataObservation,
  playlistText: string,
  contract: HlsPlaylistOnlyProbeContract = HLS_PLAYLIST_ONLY_CONTRACT,
): ProbeContractAssessment {
  if (
    contract.schema !== HLS_PLAYLIST_ONLY_PROBE_SCHEMA ||
    !Number.isFinite(contract.durationToleranceSec) ||
    contract.durationToleranceSec < 0
  ) {
    return contractError('HLS_PLAYLIST_PROBE_CONTRACT_INVALID', 'playlist-only probe contract is malformed');
  }
  const read = readHlsPlaylistProbeEvidence(playlistText);
  if (read.state !== 'OK') return contractError(read.reasonCode, read.detail);
  const evidence = read.value;
  if (!evidence.methods.includes(contract.expectedMethod)) {
    return contractError(
      'HLS_PLAYLIST_METHOD_FIXTURE_MISMATCH',
      `playlist signals ${evidence.methods.join(', ') || 'no method'} instead of ${contract.expectedMethod}`,
    );
  }

  const failures: string[] = [];
  if (measured.container.trim().toLowerCase() !== 'hls') {
    failures.push(`container '${measured.container}' vs playlist contract 'hls'`);
  }
  if (measured.durationSec == null || !Number.isFinite(measured.durationSec)) {
    failures.push('measured duration is not finite');
  } else if (Math.abs(measured.durationSec - evidence.durationSec) > contract.durationToleranceSec) {
    failures.push(
      `duration ${measured.durationSec}s vs EXTINF sum ${evidence.durationSec}s ` +
        `(Δ ${Math.abs(measured.durationSec - evidence.durationSec)}s > ${contract.durationToleranceSec}s)`,
    );
  }

  const protectionPolicy = defineProbeMetadataFieldPolicy({
    fields: ['protection.scheme'],
    protectionSchemes: ['hls-aes128'],
  });
  const protection = assessDeclaredMetadataFields(measured, measured, protectionPolicy, []);
  if (protection.state !== 'VERDICT' || protection.verdict === 'FAIL') {
    failures.push(protection.detail);
  }
  const measurements = {
    playlistDurationSec: evidence.durationSec,
    segmentCount: evidence.segmentCount,
    ...(typeof measured.durationSec === 'number' && Number.isFinite(measured.durationSec)
      ? { measuredDurationSec: measured.durationSec }
      : {}),
  };
  if (failures.length) {
    return verdict('FAIL', 'HLS_PLAYLIST_ONLY_PROBE_MISMATCH', failures.join('; '), measurements, { playlist: evidence });
  }
  return verdict(
    'PASS',
    'HLS_PLAYLIST_ONLY_PROBE_MATCH',
    `playlist-derived duration and ${contract.expectedMethod} protection signaling match; track details were not asserted`,
    measurements,
    { playlist: evidence, assertedFields: ['container', 'duration', 'protection.scheme'] },
  );
}

/** A playlist-only implementation must not quietly parse/decrypt media to satisfy undeclared fields. */
export function assessHlsPlaylistOnlyResourceAccess(
  accesses: readonly HlsProbeResourceAccess[],
): ProbeContractAssessment {
  const playlist = accesses.find((entry) => entry.role === 'playlist');
  if (!playlist || playlist.disposition !== 'read') {
    if (playlist?.disposition === 'missing' || playlist?.disposition === 'denied') {
      return unavailable(
        'NA_ASSET',
        'HLS_PLAYLIST_RESOURCE_UNAVAILABLE',
        `playlist resource was ${playlist.disposition}`,
        { accesses: accesses.map((entry) => ({ ...entry })) },
      );
    }
    return contractError(
      playlist?.disposition === 'error' ? 'HLS_PLAYLIST_RESOURCE_READ_ERROR' : 'HLS_PLAYLIST_RESOURCE_TRACE_MISSING',
      playlist?.disposition === 'error' ? `playlist read failed: ${playlist.uri}` : 'no successful playlist read was observed',
      { accesses: accesses.map((entry) => ({ ...entry })) },
    );
  }
  const overreads = accesses.filter((entry) => entry.disposition === 'read' && entry.role !== 'playlist');
  if (overreads.length) {
    return verdict(
      'FAIL',
      'HLS_PLAYLIST_ONLY_RESOURCE_OVERREAD',
      `playlist-only probe read ${overreads.map((entry) => `${entry.role}:${entry.uri}`).join(', ')}`,
      { resourceReads: accesses.filter((entry) => entry.disposition === 'read').length },
      { accesses: accesses.map((entry) => ({ ...entry })) },
    );
  }
  return verdict(
    'PASS',
    'HLS_PLAYLIST_ONLY_KEY_FREE',
    'only the playlist resource was read; segment and key access were unnecessary',
    { resourceReads: accesses.filter((entry) => entry.disposition === 'read').length },
    { accesses: accesses.map((entry) => ({ ...entry })) },
  );
}

/** A full track-detail probe is a separate contract and cannot turn a denied/missing key into FAIL. */
export function assessHlsProtectedSegmentResourceAccess(
  accesses: readonly HlsProbeResourceAccess[],
): ProbeContractAssessment {
  const playlist = accesses.find((entry) => entry.role === 'playlist');
  if (!playlist || playlist.disposition !== 'read') {
    if (playlist?.disposition === 'missing' || playlist?.disposition === 'denied') {
      return unavailable(
        'NA_ASSET',
        'HLS_PROTECTED_SEGMENT_PLAYLIST_UNAVAILABLE',
        `protected-segment playlist was ${playlist.disposition}`,
        { accesses: accesses.map((entry) => ({ ...entry })) },
      );
    }
    return contractError(
      playlist?.disposition === 'error'
        ? 'HLS_PROTECTED_SEGMENT_PLAYLIST_READ_ERROR'
        : 'HLS_PROTECTED_SEGMENT_PLAYLIST_TRACE_MISSING',
      playlist?.disposition === 'error'
        ? `playlist resource read failed: ${playlist.uri}`
        : 'protected-segment probe did not observe a successful playlist read',
      { accesses: accesses.map((entry) => ({ ...entry })) },
    );
  }
  const key = accesses.find((entry) => entry.role === 'key');
  if (!key || key.disposition === 'missing' || key.disposition === 'denied') {
    return unavailable(
      'NA_ASSET',
      key?.disposition === 'denied' ? 'HLS_PROTECTED_SEGMENT_KEY_DENIED' : 'HLS_PROTECTED_SEGMENT_KEY_MISSING',
      'protected-segment track probing requires the declared AES-128 key resource',
      { accesses: accesses.map((entry) => ({ ...entry })) },
    );
  }
  if (key.disposition === 'error') {
    return contractError('HLS_PROTECTED_SEGMENT_KEY_READ_ERROR', `key resource read failed: ${key.uri}`, {
      accesses: accesses.map((entry) => ({ ...entry })),
    });
  }
  const segment = accesses.find((entry) => entry.role === 'segment' && entry.disposition === 'read');
  if (!segment) {
    return contractError('HLS_PROTECTED_SEGMENT_NOT_READ', 'key was read but no protected media segment was observed');
  }
  return verdict(
    'PASS',
    'HLS_PROTECTED_SEGMENT_RESOURCES_PRESENT',
    'protected media segment and AES-128 key were both read for the track-detail contract',
    { resourceReads: accesses.filter((entry) => entry.disposition === 'read').length },
    { accesses: accesses.map((entry) => ({ ...entry })) },
  );
}

export function hlsProbeContractFromOptions(options: unknown): HlsProbeContract | undefined {
  if (!isRecord(options)) return undefined;
  const direct = options.probeContract;
  const robustness = isRecord(options.robustness) ? options.robustness : undefined;
  const probe = isRecord(robustness?.probe) ? robustness.probe : undefined;
  const candidate = direct ?? probe?.probeContract;
  if (!isRecord(candidate)) return undefined;
  if (candidate.schema === HLS_PLAYLIST_ONLY_PROBE_SCHEMA) {
    return typeof candidate.durationToleranceSec === 'number' && candidate.expectedMethod === 'AES-128'
      ? {
          schema: HLS_PLAYLIST_ONLY_PROBE_SCHEMA,
          durationToleranceSec: candidate.durationToleranceSec,
          expectedMethod: 'AES-128',
          allowedResourceRoles: ['playlist'],
        }
      : undefined;
  }
  if (candidate.schema === HLS_PROTECTED_SEGMENT_PROBE_SCHEMA) return HLS_PROTECTED_SEGMENT_CONTRACT;
  return undefined;
}

function parseAttributeList(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  let at = 0;
  while (at < value.length) {
    while (value[at] === ',' || /\s/.test(value[at] ?? '')) at++;
    const equals = value.indexOf('=', at);
    if (equals < 0) break;
    const key = value.slice(at, equals).trim().toUpperCase();
    at = equals + 1;
    let parsed = '';
    if (value[at] === '"') {
      at++;
      while (at < value.length && value[at] !== '"') parsed += value[at++]!;
      if (value[at] === '"') at++;
    } else {
      const comma = value.indexOf(',', at);
      const end = comma < 0 ? value.length : comma;
      parsed = value.slice(at, end).trim();
      at = end;
    }
    if (key) out[key] = parsed;
    while (at < value.length && value[at] !== ',') at++;
    if (value[at] === ',') at++;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
