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

/** These tokens describe completed batch-file layout only; no incremental target is claimed. */
export const FFMPEG_BATCH_LAYOUT_FEATURES = Object.freeze([
  'fragmented',
  'fastStart:in-memory',
  'fastStart:none',
] as const);
