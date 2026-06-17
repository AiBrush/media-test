/**
 * src/scenarios/audio-dsp/index.ts — Pillar 1, family "audio-dsp".
 *
 * Audio signal-processing conversions, all expressed as transcode ops with audio options:
 *  - resample (up + down): 48k↔44.1k↔16k.
 *  - channel mix: stereo→mono (downmix) and mono→stereo (upmix).
 *  - PCM format conversions: s16/s24/f32 and the awkward ones — big-endian s16be and 24-bit s24.
 *
 * SSIM/PSNR are video-only, so audio fidelity is judged on the DECODED PCM:
 *  - `decoded-frames-bitexact` over decoded-PCM digests where the conversion is exactly defined
 *    (PCM format/endianness changes, integer downmix) so the result is reproducible bit-for-bit
 *    against an offline golden;
 *  - `golden-metadata` to assert the output format (sample rate / channels / sample format) is what
 *    was requested. Resampling is not bit-reproducible across resamplers, so those scenarios lean on
 *    `golden-metadata` for format and use the PCM-digest oracle only as a smoke check on sample count.
 */

import type { TranscodeOptions } from '../../core/engine.ts';
import type { OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

interface AudioDspCase {
  id: string;
  asset: string;
  container: string;
  /** input + output audio codec tokens needed for negotiation */
  audioCodecs: string[];
  outContainer: string;
  opts: TranscodeOptions;
  /**
   * true when the conversion is exactly defined (PCM reformat, integer downmix) and therefore
   * bit-reproducible against golden; false for resampling (format-only assertion).
   */
  bitReproducible: boolean;
  notes?: string;
}

const AUDIO_DSP_CASES: AudioDspCase[] = [
  // ── Resample (not bit-reproducible across resamplers → format assertion) ──
  {
    id: 'resample_48k_to_44k1',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 44100 } },
    bitReproducible: false,
    notes: 'Downsample 48k→44.1k; assert output sample rate + plausible sample count.',
  },
  {
    id: 'resample_44k1_to_48k',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 48000 } },
    bitReproducible: false,
    notes: 'Upsample to 48k (source is 48k → may be a no-op or 44.1k depending on bake).',
  },
  {
    id: 'resample_48k_to_16k',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 16000 } },
    bitReproducible: false,
    notes: 'Aggressive downsample to 16k (speech rate); format assertion only.',
  },

  // ── Channel mix ──
  {
    id: 'downmix_stereo_to_mono',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16', channels: 1 } },
    bitReproducible: true,
    notes: 'Stereo→mono downmix (defined L/R average); PCM digest reproducible vs golden.',
  },
  {
    id: 'upmix_mono_to_stereo',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16', channels: 2 } },
    bitReproducible: true,
    notes: 'Mono→stereo upmix (duplicate channel); reproducible. NA if source is already stereo.',
  },

  // ── PCM format / endianness conversions (all exactly defined → bit-reproducible) ──
  {
    id: 'pcm_s16_to_f32',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16', 'pcm-f32'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-f32' } },
    bitReproducible: true,
    notes: 's16 → f32 (sample/32768 normalization); exact, reproducible.',
  },
  {
    id: 'pcm_f32_to_s16',
    asset: 'wav_f32.wav',
    container: 'wav',
    audioCodecs: ['pcm-f32', 'pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16' } },
    bitReproducible: true,
    notes: 'f32 → s16 (clamp + round-half-to-even); golden encodes the exact quantization.',
  },
  {
    id: 'pcm_s24_to_s16',
    asset: 'wav_s24.wav',
    container: 'wav',
    audioCodecs: ['pcm-s24', 'pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16' } },
    bitReproducible: true,
    notes: '24-bit → 16-bit truncation/dither-off; exact reproducible reduction.',
  },
  {
    id: 'pcm_s24_to_f32',
    asset: 'wav_s24.wav',
    container: 'wav',
    audioCodecs: ['pcm-s24', 'pcm-f32'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-f32' } },
    bitReproducible: true,
    notes: '24-bit → f32 normalization; tests full-range 24-bit sample handling.',
  },
  {
    id: 'pcm_s16be_to_s16le',
    asset: 'wav_s16be.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16be', 'pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16' } },
    bitReproducible: true,
    notes: 'Big-endian → little-endian byte-swap; exact. Guards against silent endianness bugs.',
  },
];

export const audioDspScenarios: Scenario[] = AUDIO_DSP_CASES.map((c) => {
  // Bit-reproducible conversions get the strong PCM-digest oracle first; resampling leans on format.
  const oracles: OracleId[] = c.bitReproducible
    ? ['decoded-frames-bitexact', 'golden-metadata']
    : ['golden-metadata', 'decoded-frames-bitexact'];
  return defineScenario({
    id: `audio-dsp/${c.id}`,
    op: 'transcode',
    input: c.asset,
    options: c.opts,
    requires: {
      operations: ['transcode'],
      containersIn: [c.container],
      containersOut: [c.outContainer],
      audioCodecs: [...new Set(c.audioCodecs)],
    },
    oracles,
    metrics: ['wall', 'throughputRealtime', 'peakMemory', 'longtasks'],
    notes: c.notes,
  });
});

export default audioDspScenarios;
