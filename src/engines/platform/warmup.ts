/**
 * src/engines/platform/warmup.ts — UNTIMED init() helpers for the platform (raw-WebCodecs) engine.
 *
 * Per the dossier's documented BEST-performance path (Chrome WebCodecs best-practices guide,
 * <https://developer.chrome.com/docs/web-platform/best-practices/webcodecs>) and §0.7 (load/init is
 * UNTIMED), all hardware probing and codec warmup belongs in init(), not in the measured op. There is
 * NO library/WASM to load for the platform engine (§7 "nothing to vendor"), so the only meaningful
 * init work is:
 *   1. probing per-codec hardware support via *Decoder/*Encoder.isConfigSupported(..,'prefer-hardware')
 *      — "the only honest check" (§5); a codec that probes false on the live browser is NA(browser);
 *   2. warming ONE decoder (configure + a single keyframe decode + flush) so the first MEASURED decode
 *      runs against an already-spun-up hardware pipeline instead of paying configure latency.
 *
 * Everything here is defensive: any failure degrades to "not warmed / unknown support" and is never
 * fatal — the adapter still works, it just may pay configure cost on the first timed op. Realm-aware:
 * VideoDecoder/VideoEncoder exist in Workers too, so warmup runs on whichever thread init() is on.
 */

import { CANONICAL_VIDEO_CODECS } from '../../core/engine.ts';

/** Probed hardware support per canonical video codec token (true = decodable on this device). */
export type CodecProbe = Partial<Record<string, boolean>>;

/** Result of init() warmup, surfaced to the adapter for configUsed / capability narrowing. */
export interface WarmupResult {
  /** whether VideoDecoder (the core decode primitive) exists in this realm */
  webcodecs: boolean;
  /** whether a hardware-preferred decode config was confirmed supported for at least one codec */
  hwAccel: boolean;
  /** per-codec hardware decode support (canonical token -> supported), best-effort */
  decodeProbe: CodecProbe;
  /** true once a decoder was configured+fed+flushed at least once (pipeline primed) */
  warmed: boolean;
}

/** Minimal, valid full codec strings to PROBE each canonical codec (mirrors §5 Codec-selection). */
const PROBE_CODEC_STRINGS: Record<string, string[]> = {
  // baseline → high; the first that probes supported wins for that token.
  h264: ['avc1.42001f', 'avc1.640028'],
  hevc: ['hev1.1.6.L93.B0', 'hvc1.1.6.L93.B0'],
  vp8: ['vp8'],
  vp9: ['vp09.00.10.08'],
  av1: ['av01.0.04M.08'],
};

function hasVideoDecoder(): boolean {
  const g = globalThis as Record<string, unknown>;
  return typeof g.VideoDecoder === 'function' && typeof g.EncodedVideoChunk === 'function';
}

/**
 * Probe per-codec HARDWARE decode support. Tries 'prefer-hardware' first (the fast path), then
 * 'no-preference' as a fallback signal of decodability at all. Returns the per-codec map plus a flag
 * indicating any hardware-preferred config was accepted. TypeError (invalid config) is swallowed as
 * "unsupported" — distinct from a thrown error elsewhere; isConfigSupported itself never NA's us.
 */
async function probeDecodeSupport(): Promise<{ decodeProbe: CodecProbe; hwAccel: boolean }> {
  const decodeProbe: CodecProbe = {};
  let hwAccel = false;
  if (!hasVideoDecoder()) return { decodeProbe, hwAccel };

  for (const token of CANONICAL_VIDEO_CODECS) {
    const candidates = PROBE_CODEC_STRINGS[token] ?? [];
    let supported = false;
    for (const codec of candidates) {
      // Hardware first (records hwAccel), then no-preference (records decodability).
      try {
        const hw = await VideoDecoder.isConfigSupported({
          codec,
          hardwareAcceleration: 'prefer-hardware',
        });
        if (hw?.supported === true) {
          supported = true;
          hwAccel = true;
          break;
        }
      } catch {
        /* TypeError on invalid string for this browser → treat as unsupported candidate */
      }
      try {
        const any = await VideoDecoder.isConfigSupported({ codec });
        if (any?.supported === true) {
          supported = true;
          break;
        }
      } catch {
        /* unsupported candidate */
      }
    }
    decodeProbe[token] = supported;
  }
  return { decodeProbe, hwAccel };
}

/**
 * Warm a single VideoDecoder so the first measured decode skips configure latency. We synthesize the
 * smallest possible work: configure with a supported config and flush. We do NOT feed a fabricated
 * chunk (a bogus bitstream would surface a decode error); configuring + flushing already instantiates
 * the underlying (hardware) decoder pipeline, which is the expensive part the guide warns about.
 * Best-effort: any failure leaves warmed=false.
 */
async function warmDecoder(decodeProbe: CodecProbe): Promise<boolean> {
  if (!hasVideoDecoder()) return false;
  // Prefer a codec we just confirmed supported; fall back to H.264 baseline (near-universal).
  const token = (Object.keys(decodeProbe) as string[]).find((k) => decodeProbe[k]) ?? 'h264';
  const codec = (PROBE_CODEC_STRINGS[token] ?? ['avc1.42001f'])[0] ?? 'avc1.42001f';
  const config: VideoDecoderConfig = { codec, hardwareAcceleration: 'prefer-hardware' };

  try {
    const support = await VideoDecoder.isConfigSupported(config).catch(() => null);
    const useConfig: VideoDecoderConfig =
      support?.supported === true ? support.config ?? config : { codec };
    const probe = await VideoDecoder.isConfigSupported(useConfig).catch(() => null);
    if (!probe || probe.supported !== true) return false;

    let errored = false;
    const decoder = new VideoDecoder({
      output: (f) => f.close(),
      error: () => {
        errored = true;
      },
    });
    try {
      decoder.configure(useConfig);
      await decoder.flush().catch(() => {
        /* nothing fed → flush may resolve or reject; either way the pipeline is instantiated */
      });
      return !errored;
    } finally {
      try {
        decoder.close();
      } catch {
        /* already closed */
      }
    }
  } catch {
    return false;
  }
}

/**
 * Run the full UNTIMED init warmup: probe hardware decode support for every canonical video codec and
 * prime one decoder. Never throws — returns a WarmupResult describing what was confirmed.
 */
export async function warmupPlatform(): Promise<WarmupResult> {
  const webcodecs = hasVideoDecoder();
  if (!webcodecs) {
    return { webcodecs: false, hwAccel: false, decodeProbe: {}, warmed: false };
  }
  const { decodeProbe, hwAccel } = await probeDecodeSupport();
  const warmed = await warmDecoder(decodeProbe);
  return { webcodecs, hwAccel, decodeProbe, warmed };
}
