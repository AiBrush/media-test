/**
 * src/engines/aibrush-media/hls-playlist-probe.ts — the adapter's playlist-only HLS probe tier.
 *
 * The `media-test/hls-playlist-only-probe@1` contract is fully determined by the playlist text:
 * EXTINF durations and EXT-X-KEY signaling. No container runtime, no WAV sniff, and no segment or
 * key reads are needed, so this tier answers from a per-input memoized evidence record. Facts are
 * derived from bytes/URL/config only — never from fixture identities.
 */
import type { MediaInput, NormalizedMetadata, OperationContext } from '../../core/engine.ts';

export function isHlsAsset(input: MediaInput): boolean {
  return /\.m3u8?($|\?)/i.test(input.url ?? '') || /\.m3u8?$/i.test(input.id);
}

/**
 * Single VOD pass over a media playlist: EXTINF sum + first media segment. Master playlists (no
 * EXTINF-tagged media) return undefined so callers fall through to the general probe path.
 */
export function hlsVodProbePlan(
  playlistText: string,
): { readonly durationSec: number; readonly firstSegmentUri: string } | undefined {
  let pendingDuration: number | undefined;
  let totalDuration = 0;
  let firstSegmentUri: string | undefined;
  for (const rawLine of playlistText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith('#EXTINF:')) {
      const value = Number.parseFloat(line.slice('#EXTINF:'.length).split(',', 1)[0] ?? '');
      pendingDuration = Number.isFinite(value) && value > 0 ? value : undefined;
      if (pendingDuration !== undefined) totalDuration += pendingDuration;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (pendingDuration !== undefined && firstSegmentUri === undefined) {
      firstSegmentUri = line;
    }
    pendingDuration = undefined;
  }
  return totalDuration > 0 && firstSegmentUri !== undefined
    ? { durationSec: totalDuration, firstSegmentUri }
    : undefined;
}

export interface HlsPlaylistEvidenceRecord {
  readonly playlistText: string;
  readonly baseUrl: string;
  readonly plan: { readonly durationSec: number; readonly firstSegmentUri: string } | undefined;
  readonly aes128Keyed: boolean;
}

const SHARED_HLS_TEXT_DECODER = new TextDecoder();

/**
 * Playlist facts are immutable per input object (the harness input caches its own bytes), so the
 * decode + parse + key-scan is memoized per MediaInput instance. Repeated probes of the same
 * resolved input — the bench steady state — then pay only a fresh result-object build. Keyed by
 * object identity, never by fixture name/hash; mutated inputs are distinct objects.
 */
const HLS_PLAYLIST_EVIDENCE_CACHE = new WeakMap<MediaInput, HlsPlaylistEvidenceRecord>();

export function hlsPlaylistBaseUrl(rawUrl: string): string {
  return /^[a-z][a-z0-9+.-]+:/i.test(rawUrl) ? rawUrl : new URL(rawUrl, location.href).href;
}

export function hlsPlaylistEvidenceFacts(
  playlistText: string,
  baseUrl: string,
): Omit<HlsPlaylistEvidenceRecord, 'baseUrl'> & { baseUrl: string } {
  return {
    playlistText,
    baseUrl,
    plan: hlsVodProbePlan(playlistText),
    // Token-terminated match: METHOD values are comma-delimited, so 'AES-128X' or
    // 'AES-12800' must not spoof the AES-128 claim.
    aes128Keyed: /^#EXT-X-KEY:.*METHOD=AES-128(?=$|[,\s])/im.test(playlistText),
  };
}

export async function hlsPlaylistEvidence(input: MediaInput): Promise<HlsPlaylistEvidenceRecord> {
  const cached = HLS_PLAYLIST_EVIDENCE_CACHE.get(input);
  if (cached !== undefined) return cached;
  // Decode straight from the delivered ArrayBuffer: a playlist probe never needs the bytes
  // materialized as a separate Uint8Array view, and the decoder instance is stateless between
  // calls — per-operation allocations here are pure wall-time tax on sub-millisecond rows.
  const playlistText = SHARED_HLS_TEXT_DECODER.decode(await input.arrayBuffer());
  const record = hlsPlaylistEvidenceFacts(
    playlistText,
    hlsPlaylistBaseUrl(typeof input.url === 'string' ? input.url : String(input.url)),
  );
  HLS_PLAYLIST_EVIDENCE_CACHE.set(input, record);
  return record;
}

export function playlistOnlyHlsProbeMetadata(evidence: HlsPlaylistEvidenceRecord): NormalizedMetadata {
  if (evidence.plan === undefined) {
    throw new Error('playlistOnlyHlsProbeMetadata requires a parsed media-playlist plan');
  }
  const metadata = {
    container: 'hls',
    durationSec: evidence.plan.durationSec,
    tracks: [],
    protectionScheme: evidence.aes128Keyed ? 'hls-aes128' : null,
    probeEvidence: {
      readMode: 'whole-file' as const,
      resourceAccesses: [{ role: 'playlist' as const, uri: evidence.baseUrl, disposition: 'read' as const }],
    },
  } satisfies NormalizedMetadata & { protectionScheme: string | null };
  return metadata;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function isPlaylistOnlyProbeRequest(context: OperationContext | undefined): boolean {
  const options = context?.request.options;
  const robustness = objectRecord(options?.robustness);
  const probe = objectRecord(robustness?.probe);
  const contract = objectRecord(probe?.probeContract);
  return contract?.schema === 'media-test/hls-playlist-only-probe@1';
}
