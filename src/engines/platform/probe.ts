/**
 * src/engines/platform/probe.ts — best-effort NormalizedMetadata from raw platform APIs.
 *
 * Raw platform probing is limited: an HTMLVideoElement exposes duration + intrinsic dimensions but
 * NOT the codec fourcc, fps, channel layout, or bitrate. To fill codec/dims (and the AUDIO track
 * codec/sampleRate/channels) we use the inline demuxers (MP4/WebM) which read the sample-description
 * boxes directly and enumerate EVERY track in container order — so a multi-track golden's track list
 * (video + audio[…]) is matched. For containers neither demuxer parses, we degrade to a <video>-only
 * probe (duration + a single video track with unknown codec). This is declared honestly in
 * capabilities() and reflected in the returned metadata.
 *
 * SOURCES (dossier research/dossiers/platform.md §2 probe / §A.11 metadata-read, researched 2026-06-17):
 *   - WebCodecs API: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
 *   - MediaCapabilities.decodingInfo: https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo
 */

import type { MediaInput, NormalizedMetadata, NormalizedTrack } from '../../core/engine.ts';
import { demuxMp4Tracks, looksLikeMp4, probeMp4Metadata, UnsupportedMp4Error } from './demux-mp4.ts';
import { demuxWebmTracks, looksLikeWebm, UnsupportedWebmError } from './demux-webm.ts';
import { looksLikeWav, probeWavMetadata, UnsupportedWavError } from './demux-wav.ts';

function isStillImageInput(input: MediaInput): boolean {
  const mime = input.mime.toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
  return /\.(?:jpe?g|png|webp|gif|bmp|avif)$/.test(name);
}

/** Map a MIME / asset id hint to a canonical container token. */
function containerFromMime(mime: string, bytes: Uint8Array): string {
  const m = mime.toLowerCase();
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('quicktime') || m.includes('mov')) return 'mov';
  if (m.includes('webm')) return 'webm';
  if (m.includes('matroska') || m.includes('mkv')) return 'mkv';
  if (m.includes('mpegts') || m.includes('mp2t') || m.includes('/ts')) return 'ts';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') && m.includes('audio')) return 'mp3';
  // Fall back to a sniff.
  if (looksLikeMp4(bytes)) return 'mp4';
  if (looksLikeWebm(bytes)) return 'webm';
  if (looksLikeWav(bytes)) return 'wav';
  return 'unknown';
}

/**
 * Read duration + intrinsic dimensions from a <video> element (page main thread only). Resolves
 * null fields if the element cannot load (e.g. browser can't play the container).
 */
async function probeViaVideoElement(
  blob: Blob,
  timeoutMs: number,
): Promise<{ durationSec: number | null; width?: number; height?: number }> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return { durationSec: null };
  }
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'metadata';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const ok = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve();
      };
      const err = () => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('<video> error before metadata'));
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('metadata timeout'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', ok);
        video.removeEventListener('error', err);
      };
      video.addEventListener('loadedmetadata', ok, { once: true });
      video.addEventListener('error', err, { once: true });
    });
    const durationSec = Number.isFinite(video.duration) ? video.duration : null;
    const out: { durationSec: number | null; width?: number; height?: number } = { durationSec };
    if (video.videoWidth > 0) out.width = video.videoWidth;
    if (video.videoHeight > 0) out.height = video.videoHeight;
    return out;
  } catch {
    return { durationSec: null };
  } finally {
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  }
}

/** Estimate fps from demuxed samples as average sample rate; fall back to observed PTS intervals. */
function fpsFromSamples(samples: Array<{ ptsUs: number; durationUs?: number }>): number | undefined {
  if (samples.length === 0) return undefined;
  if (samples.length === 1) {
    const durationUs = samples[0]?.durationUs;
    return durationUs && durationUs > 0 ? Math.round((1_000_000 / durationUs) * 1000) / 1000 : undefined;
  }

  const hasDurations = samples.some((s) => (s.durationUs ?? 0) > 0);
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const s of samples) {
    minStart = Math.min(minStart, s.ptsUs);
    maxEnd = Math.max(maxEnd, s.ptsUs + (s.durationUs || 0));
  }
  const spanUs = maxEnd - minStart;
  if (hasDurations && Number.isFinite(spanUs) && spanUs > 0) {
    return Math.round(((samples.length * 1_000_000) / spanUs) * 1000) / 1000;
  }

  const sorted = samples.map((s) => s.ptsUs).sort((a, b) => a - b);
  const ptsSpanUs = sorted[sorted.length - 1]! - sorted[0]!;
  // WebM SimpleBlock packets usually omit per-frame durations. In that case last PTS - first PTS
  // spans N-1 frame intervals; counting N frames over that span overstates 30fps as ~30.1fps.
  if (Number.isFinite(ptsSpanUs) && ptsSpanUs > 0) {
    return Math.round((((sorted.length - 1) * 1_000_000) / ptsSpanUs) * 1000) / 1000;
  }

  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i]! - sorted[i - 1]!;
    if (d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return undefined;
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)]!;
  return median > 0 ? Math.round((1_000_000 / median) * 1000) / 1000 : undefined;
}

/** Duration in seconds from demuxed samples (last pts + its duration, or pts span). */
function durationFromSamples(samples: Array<{ ptsUs: number; durationUs: number }>): number | null {
  if (samples.length === 0) return null;
  let maxEnd = 0;
  for (const s of samples) maxEnd = Math.max(maxEnd, s.ptsUs + (s.durationUs || 0));
  return maxEnd > 0 ? maxEnd / 1_000_000 : null;
}

function fpsFromSampleCount(sampleCount: number, durationUs: number | null): number | undefined {
  if (sampleCount <= 0 || durationUs === null || durationUs <= 0) return undefined;
  return Math.round(((sampleCount * 1_000_000) / durationUs) * 1000) / 1000;
}

/**
 * Probe an input to NormalizedMetadata. Uses inline demux (MP4/WebM) for codec/dims/fps when it can,
 * supplemented by a <video> element for an authoritative duration; otherwise a <video>-only probe.
 */
export async function probeInput(input: MediaInput, opts?: { timeoutMs?: number }): Promise<NormalizedMetadata> {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  if (isStillImageInput(input)) {
    throw new Error('raw platform probe rejected still-image input; this suite probes media containers only');
  }
  const ab = await input.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const container = containerFromMime(input.mime, bytes);

  const tracks: NormalizedTrack[] = [];
  let durationSec: number | null = null;

  // Inline demux for the FULL track list (video codec/dims/fps + audio codec/sampleRate/channels) in
  // container order, when the container is parseable.
  let demuxDuration: number | null = null;
  try {
    if (container === 'mp4' || container === 'mov' || looksLikeMp4(bytes)) {
      let maxDuration: number | null = null;
      for (const t of demuxMp4Tracks(bytes)) {
        if (t.kind === 'video') {
          const track: NormalizedTrack = {
            type: 'video',
            codec: t.config.codec,
            width: t.config.codedWidth,
            height: t.config.codedHeight,
            bitrate: null,
            language: null,
          };
          const fps = fpsFromSamples(t.samples);
          if (fps !== undefined) track.fps = fps;
          tracks.push(track);
        } else {
          tracks.push({
            type: 'audio',
            codec: t.config.codec,
            sampleRate: t.config.sampleRate,
            channels: t.config.channels,
            bitrate: null,
            language: null,
          });
        }
        const d = durationFromSamples(t.samples);
        if (d !== null) maxDuration = Math.max(maxDuration ?? 0, d);
      }
      demuxDuration = maxDuration;
    } else if (container === 'webm' || container === 'mkv' || looksLikeWebm(bytes)) {
      let maxDuration: number | null = null;
      for (const t of demuxWebmTracks(bytes)) {
        if (t.kind === 'video') {
          const track: NormalizedTrack = {
            type: 'video',
            codec: t.config.codec,
            width: t.config.codedWidth,
            height: t.config.codedHeight,
            bitrate: null,
            language: null,
          };
          const fps = fpsFromSamples(t.samples);
          if (fps !== undefined) track.fps = fps;
          tracks.push(track);
        } else {
          tracks.push({
            type: 'audio',
            codec: t.config.codec,
            sampleRate: t.config.sampleRate,
            channels: t.config.channels,
            bitrate: null,
            language: null,
          });
        }
        const d = durationFromSamples(t.samples);
        if (d !== null) maxDuration = Math.max(maxDuration ?? 0, d);
      }
      demuxDuration = maxDuration;
    } else if (container === 'wav' || looksLikeWav(bytes)) {
      const wav = probeWavMetadata(bytes);
      tracks.push(...wav.tracks);
      demuxDuration = wav.durationSec;
    }
  } catch (e) {
    // Unsupported variants fall through to cheaper metadata-only probes or, finally, <video>.
    if (!(e instanceof UnsupportedMp4Error) && !(e instanceof UnsupportedWebmError)) throw e;
    if (e instanceof UnsupportedMp4Error && (container === 'mp4' || container === 'mov' || looksLikeMp4(bytes))) {
      try {
        const meta = probeMp4Metadata(bytes);
        for (const t of meta.tracks) {
          if (t.kind === 'video') {
            const track: NormalizedTrack = {
              type: 'video',
              codec: t.config.codec,
              width: t.config.codedWidth,
              height: t.config.codedHeight,
              bitrate: null,
              language: null,
            };
            const fps = fpsFromSampleCount(t.sampleCount, t.durationUs);
            if (fps !== undefined) track.fps = fps;
            tracks.push(track);
          } else {
            tracks.push({
              type: 'audio',
              codec: t.config.codec,
              sampleRate: t.config.sampleRate,
              channels: t.config.channels,
              bitrate: null,
              language: null,
            });
          }
        }
        demuxDuration = meta.durationSec;
      } catch (fallbackErr) {
        if (!(fallbackErr instanceof UnsupportedMp4Error)) throw fallbackErr;
      }
    }
    if (e instanceof UnsupportedWavError && (container === 'wav' || looksLikeWav(bytes))) {
      throw e;
    }
  }

  // <video> probe for an authoritative duration + dims (page only). Audio-only containers and
  // containers the demuxer skipped still get a duration here.
  const blob = new Blob([bytes.slice().buffer], { type: input.mime || 'application/octet-stream' });
  const ve = await probeViaVideoElement(blob, timeoutMs);
  durationSec = ve.durationSec ?? demuxDuration;
  if (durationSec === null) durationSec = demuxDuration;

  if (tracks.length === 0) {
    // Demuxer didn't recognize the container. If <video> loaded with intrinsic dims, declare a
    // single video track with UNKNOWN codec (honest: we couldn't identify it without demux).
    if (ve.width && ve.height) {
      tracks.push({ type: 'video', codec: 'unknown', width: ve.width, height: ve.height, bitrate: null, language: null });
    } else if (durationSec !== null) {
      // Likely audio-only or a container <video> played without video — declare an unknown track.
      tracks.push({ type: 'other', codec: 'unknown', bitrate: null, language: null });
    }
  } else if (tracks[0] && tracks[0].type === 'video' && (!tracks[0].width || !tracks[0].height) && ve.width && ve.height) {
    // Fill the VIDEO track's dims from <video> if the demuxer didn't have them.
    tracks[0].width = ve.width;
    tracks[0].height = ve.height;
  }

  const meta: NormalizedMetadata = { container, durationSec, tracks };
  return meta;
}
