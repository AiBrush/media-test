/** Stable command provenance without per-cell scratch identifiers or user filesystem paths. */
export function redactFfmpegArg(arg: string): string {
  const scratchRedacted = arg
    .replace(/(?:^|\/)op\d+(?:\.[A-Za-z0-9_.-]+)?/g, '<scratch>')
    .replace(/(?:^|\/)warm\d+(?:\.[A-Za-z0-9_.-]+)?/g, '<warmup>');
  if (/(?:file:\/\/)?\/(?:Users|home)\//.test(scratchRedacted) || /[A-Za-z]:\\/.test(scratchRedacted)) {
    const equals = scratchRedacted.indexOf('=');
    return equals >= 0
      ? `${scratchRedacted.slice(0, equals + 1)}<redacted-path>`
      : '<redacted-path>';
  }
  return scratchRedacted;
}

export function redactFfmpegCommand(args: readonly string[]): string[] {
  return args.map(redactFfmpegArg);
}

export const FFMPEG_FRAGMENT_MOVFLAGS = 'frag_keyframe+empty_moov+default_base_moof';
export const FFMPEG_FASTSTART_MOVFLAGS = '+faststart';

const NORMALIZED_METADATA_KEYS: Readonly<Record<string, string>> = Object.freeze({
  albumArtist: 'album_artist',
  trackNumber: 'track',
  tracksTotal: 'tracktotal',
  discNumber: 'disc',
  discsTotal: 'disctotal',
});

/** Translate suite-normalized metadata names into the keys FFmpeg maps to carrier-native fields. */
export function ffmpegMetadataArguments(
  tags: Readonly<Record<string, string>>,
  outputContainer: string,
): string[] {
  const args: string[] = [];
  const matroska = outputContainer === 'mkv' || outputContainer === 'webm';
  if (matroska && (tags.comment !== undefined || tags.description !== undefined)) {
    // FFmpeg copies source global metadata by default. Clear both Matroska aliases before writing
    // the requested value so an inherited DESCRIPTION cannot conflict with the new COMMENT.
    args.push('-metadata', 'comment=', '-metadata', 'description=');
  }

  for (const [normalizedKey, originalValue] of Object.entries(tags)) {
    if (!normalizedKey) continue;
    if (normalizedKey === 'tracksTotal' && tags.trackNumber !== undefined) continue;
    if (normalizedKey === 'discsTotal' && tags.discNumber !== undefined) continue;
    const key = NORMALIZED_METADATA_KEYS[normalizedKey] ?? normalizedKey;
    const value = normalizedKey === 'trackNumber' && tags.tracksTotal !== undefined
      ? `${originalValue}/${tags.tracksTotal}`
      : normalizedKey === 'discNumber' && tags.discsTotal !== undefined
        ? `${originalValue}/${tags.discsTotal}`
        : originalValue;
    args.push('-metadata', `${key}=${value ?? ''}`);
  }
  return args;
}

/** These tokens describe completed batch-file layout only; no incremental target is claimed. */
export const FFMPEG_BATCH_LAYOUT_FEATURES = Object.freeze([
  'fragmented',
  'fastStart:in-memory',
  'fastStart:none',
] as const);
