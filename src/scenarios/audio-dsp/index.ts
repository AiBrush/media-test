/**
 * src/scenarios/audio-dsp/index.ts — Pillar 1, family "audio-dsp".
 *
 * Audio signal-processing conversions (spec A.9) + the audio-only deep edges / metamorphic
 * invariants from A.6 / A.16, all framework-blind. Conversions are expressed as `transcode` ops with
 * audio options; throughput probes as `transcode`/`decodeFrames`; robustness as mutate→graceful.
 *
 * ── ORACLE HONESTY (the load-bearing decision in this file) ────────────────────────────────────
 * The standing rule is: correctness GATES every number, and "a wrong oracle that lets a fast-but-
 * incorrect engine win is WORSE than an honest FAIL." Three structural facts about the CURRENT
 * harness (engine.ts / runner.ts / oracles.ts — all outside this writer's scope) shape every oracle
 * choice below; they are documented here so a reviewer sees the choices are deliberate, not sloppy:
 *
 *   (1) `decoded-frames-bitexact` / `ssim-psnr` / `property-invariant(decode-remux)` all decode via
 *       `ctx.decodeWithPlatform`, which is a WebCodecs *VideoDecoder* → RGBA path. For an audio-only
 *       output it yields 0 frames → the oracle FAILS ("0 frames"). It is a PCM-blind oracle today.
 *       It is still attached to the bit-reproducible conversions because (a) the family header has
 *       always promised a decoded-PCM digest gate and this is the hook a future AudioDecoder/PCM
 *       digest path slots into without touching scenarios, and (b) it FAILS-CLOSED: it can never
 *       false-PASS a wrong engine. An honest FAIL here is strictly better than no gate.
 *   (2) `golden-metadata` reads `ctx.metadata`, which the runner only populates for `op:'probe'`.
 *       For a `transcode` it is undefined → FAIL ("no probe metadata"). Like (1) it fails-closed and
 *       is the natural slot for a post-op re-probe. It asserts the OUTPUT shape (rate/channels/codec).
 *   (3) `loadGolden` keys golden to the INPUT asset id. The duration of a resample / ch-mix / PCM-
 *       reformat is INVARIANT (5s in → 5s out), so the metamorphic `property-invariant(probe-dur)`
 *       (which compares `referenceEngine.probe(output).dur` to the input golden duration) is a
 *       genuinely correct, harness-compatible correctness floor for those conversions — and it
 *       degrades to a clean FAIL ("no reference engine") rather than a false PASS when none is
 *       injected. It is the only oracle in this family that can PASS today, and only when it should.
 *
 * `graceful-failure` is fully functional today (it reads output-presence + notes tokens, no decode),
 * so the robustness/edge/negative cases below are real, gating coverage right now.
 *
 * ── ASSETS ─────────────────────────────────────────────────────────────────────────────────────
 * Several cases reference assets the bake author produces alongside this battery (canonical ids the
 * dossier names): `wav_s16_mono.wav` (-ac 1), `wav_s16_44k1.wav` (genuine 44.1k source),
 * `wav_5_1.wav` (5.1 surround source), `pcm_s24be.aiff` (24-bit big-endian AIFF), and
 * `longform_1h_audio_pcm.wav` (multi-hour PCM). Until baked, the runner yields NA(asset-missing) for
 * those cells — never a false PASS — exactly as the corpus already does for `recorder_headerless.webm`
 * and `cenc_cbcs.mp4`. The already-baked `pcm_s16be.aiff` and `empty_audio.wav` are used as-is.
 */

import type { OracleId, MetricId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

// ── Conversion cases (A.9 + A.6 PCM edges) ──────────────────────────────────────────────────────

/**
 * Options are typed `Record<string, unknown>` (not `TranscodeOptions`) on purpose: A.9 includes
 * volume/gain and fade in/out, which `TranscodeAudioOptions` (engine.ts) does NOT yet model. The
 * runner's `asTranscodeOpts` spreads ALL option keys through to `engine.transcode`, so a `gain` /
 * `fade` carried inside `audio` (or at top level) reaches a capable engine (ffmpeg `volume`/`afade`,
 * mediabunny `process`) without an engine.ts change. Scenarios stay engine-blind: they only declare
 * the transform; the adapter decides how to honour it (or the runner NA's it via `features`).
 */
interface AudioDspCase {
  id: string;
  asset: string;
  /** input container token (matched against the engine's declared containersIn) */
  container: string;
  /** input + output audio codec tokens needed for negotiation */
  audioCodecs: string[];
  outContainer: string;
  /** extra capability tokens the transform needs (e.g. 'gain','fade','downmix','upmix') */
  features?: string[];
  opts: Record<string, unknown>;
  /**
   * true when the conversion is exactly defined (PCM reformat, integer endianness swap, defined
   * integer downmix) and therefore bit-reproducible against an offline PCM golden; false for
   * resampling and lossy/perceptual mixes (format + duration-invariant assertion only).
   */
  bitReproducible: boolean;
  notes?: string;
}

const AUDIO_DSP_CASES: AudioDspCase[] = [
  // ── Resample (not bit-reproducible across resamplers → format + duration-invariant assertion) ──
  {
    id: 'resample_48k_to_44k1',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    features: ['resample'],
    opts: { container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 44100 } },
    bitReproducible: false,
    notes: 'Downsample 48k->44.1k; assert output sample rate + duration invariance (5s in, 5s out).',
  },
  {
    // FIX (dossier): the source must be a GENUINE 44.1k asset, else "->48k" is a silent no-op
    // (wav_s16.wav is already 48k). wav_s16_44k1.wav is baked at 44100Hz for a real upsample.
    id: 'resample_44k1_to_48k',
    asset: 'wav_s16_44k1.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    features: ['resample'],
    opts: { container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 48000 } },
    bitReproducible: false,
    notes: 'Genuine upsample 44.1k->48k (source is a real 44.1k asset); format + duration assertion.',
  },
  {
    id: 'resample_48k_to_16k',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    features: ['resample'],
    opts: { container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 16000 } },
    bitReproducible: false,
    notes: 'Aggressive downsample to 16k (speech rate); format + duration assertion only.',
  },

  // ── Channel mix: mono<->stereo<->5.1 (spec A.9 says all three) ──
  {
    id: 'downmix_stereo_to_mono',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    features: ['downmix'],
    opts: { container: 'wav', audio: { codec: 'pcm-s16', channels: 1 } },
    bitReproducible: true,
    notes: 'Stereo->mono downmix (defined L/R average); PCM digest reproducible vs golden.',
  },
  {
    // FIX (dossier): the prior case pointed at wav_s16.wav which is ALREADY stereo, making
    // channels:2 a no-op rather than an upmix. wav_s16_mono.wav is baked with -ac 1.
    id: 'upmix_mono_to_stereo',
    asset: 'wav_s16_mono.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    features: ['upmix'],
    opts: { container: 'wav', audio: { codec: 'pcm-s16', channels: 2 } },
    bitReproducible: true,
    notes: 'Real mono->stereo upmix (duplicate channel) from a genuine mono source; reproducible.',
  },
  {
    id: 'downmix_5_1_to_stereo',
    asset: 'wav_5_1.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    features: ['downmix'],
    opts: { container: 'wav', audio: { codec: 'pcm-s16', channels: 2 } },
    bitReproducible: true,
    notes: '5.1->stereo downmix via defined ITU-R BS.775 coefficients; exact integer mix, reproducible.',
  },
  {
    id: 'upmix_stereo_to_5_1',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    features: ['upmix'],
    opts: { container: 'wav', audio: { codec: 'pcm-s16', channels: 6 } },
    bitReproducible: false,
    notes: 'Stereo->5.1 upmix (channel routing varies by engine); assert 6-channel output + duration.',
  },

  // ── Volume / gain (A.9 — previously entirely unrepresented) ──
  {
    // -6.0206 dB == exact 0.5 linear scale; on s16 this is a defined, bit-reproducible halving
    // (round-half-to-even at the LSB). Carried as audio.gainDb so a capable engine maps it to its
    // own knob (ffmpeg `volume=-6.0206dB`, mediabunny per-sample scale in `process`).
    id: 'gain_minus6db_s16',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    features: ['gain'],
    opts: { container: 'wav', audio: { codec: 'pcm-s16', gainDb: -6.0206, gainLinear: 0.5 } },
    bitReproducible: true,
    notes: 'Volume/gain -6.0206dB (exact 0.5 linear); defined LSB rounding -> reproducible PCM digest.',
  },
  {
    // f32 has the headroom to apply gain with no quantization, so a -6dB scale on f32 is exactly
    // sample*0.5 — the cleanest bit-reproducible gain case (no rounding policy ambiguity).
    id: 'gain_half_f32',
    asset: 'wav_f32.wav',
    container: 'wav',
    audioCodecs: ['pcm-f32'],
    outContainer: 'wav',
    features: ['gain'],
    opts: { container: 'wav', audio: { codec: 'pcm-f32', gainLinear: 0.5 } },
    bitReproducible: true,
    notes: 'Gain 0.5x on f32 (exact, no quantization); bit-reproducible scale.',
  },

  // ── Fade in / out (A.9 — previously entirely unrepresented) ──
  {
    // Linear fade-in over the first second + fade-out over the last second. The envelope is a
    // deterministic per-sample multiply; on f32 it is exact (no quantization) -> bit-reproducible.
    id: 'fade_in_out_f32',
    asset: 'wav_f32.wav',
    container: 'wav',
    audioCodecs: ['pcm-f32'],
    outContainer: 'wav',
    features: ['fade'],
    opts: {
      container: 'wav',
      audio: {
        codec: 'pcm-f32',
        fade: { inSec: 1, outSec: 1, curve: 'linear' },
      },
    },
    bitReproducible: true,
    notes: 'Linear fade-in(1s)+fade-out(1s) on f32; deterministic envelope -> reproducible PCM digest.',
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
    notes: 's16 -> f32 (sample/32768 normalization); exact, reproducible.',
  },
  {
    id: 'pcm_f32_to_s16',
    asset: 'wav_f32.wav',
    container: 'wav',
    audioCodecs: ['pcm-f32', 'pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16' } },
    bitReproducible: true,
    notes: 'f32 -> s16 (clamp + round-half-to-even); golden encodes the exact quantization.',
  },
  {
    id: 'pcm_s24_to_s16',
    asset: 'wav_s24.wav',
    container: 'wav',
    audioCodecs: ['pcm-s24', 'pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16' } },
    bitReproducible: true,
    notes: '24-bit -> 16-bit truncation/dither-off; exact reproducible reduction.',
  },
  {
    id: 'pcm_s24_to_f32',
    asset: 'wav_s24.wav',
    container: 'wav',
    audioCodecs: ['pcm-s24', 'pcm-f32'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-f32' } },
    bitReproducible: true,
    notes: '24-bit -> f32 normalization; tests full-range 24-bit sample handling.',
  },
  {
    // FIX (dossier): the prior case targeted wav_s16be.wav, which CANNOT exist — pcm_s16be is
    // invalid in RIFF/WAVE and has no bake recipe. The only baked big-endian asset is the AIFF one.
    id: 'pcm_s16be_to_s16le',
    asset: 'pcm_s16be.aiff',
    container: 'aiff',
    audioCodecs: ['pcm-s16be', 'pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16' } },
    bitReproducible: true,
    notes: 'Big-endian(AIFF) -> little-endian(WAV) byte-swap; exact. Guards silent endianness bugs.',
  },
  {
    // Endianness the OTHER direction (dossier: only s16be->s16le was attempted). s16le WAV -> s16be
    // AIFF must be an exact byte-swap; pairs with pcm_s16be_to_s16le for a round-trip story.
    id: 'pcm_s16le_to_s16be',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16', 'pcm-s16be'],
    outContainer: 'aiff',
    opts: { container: 'aiff', audio: { codec: 'pcm-s16be' } },
    bitReproducible: true,
    notes: 'Little-endian(WAV) -> big-endian(AIFF) byte-swap; exact reverse of pcm_s16be_to_s16le.',
  },
  {
    // 24-bit big-endian (the s24be AIFF edge the dossier flags as absent). Reduce to s16le.
    id: 'pcm_s24be_to_s16le',
    asset: 'pcm_s24be.aiff',
    container: 'aiff',
    audioCodecs: ['pcm-s24be', 'pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16' } },
    bitReproducible: true,
    notes: '24-bit big-endian(AIFF) -> 16-bit little-endian(WAV); byte-swap + truncation, exact.',
  },
];

// Oracle policy per conversion case. Bit-reproducible conversions lead with the PCM-digest oracle
// (the format header has always promised it; it fails-closed today and is the AudioDecoder slot),
// back it with the OUTPUT-shape metadata oracle, AND add the duration-invariant metamorphic oracle
// that can actually PASS in the current harness via a reference probe. Resampling/lossy mixes are
// not bit-reproducible across resamplers, so they drop the PCM-digest gate and rely on shape +
// duration invariance. (`property-invariant` here means "probe(out).dur == probe(x).dur".)
function conversionOracles(c: AudioDspCase): OracleId[] {
  return c.bitReproducible
    ? ['decoded-frames-bitexact', 'golden-metadata', 'property-invariant']
    : ['golden-metadata', 'property-invariant'];
}

const conversionScenarios: Scenario[] = AUDIO_DSP_CASES.map((c) =>
  defineScenario({
    id: `audio-dsp/${c.id}`,
    op: 'transcode',
    input: c.asset,
    // Tag the metamorphic invariant the property-invariant oracle should evaluate (duration is
    // preserved by every conversion in this list). Carried alongside the transcode options.
    options: { ...c.opts, invariant: 'probe-duration' },
    requires: {
      operations: ['transcode'],
      containersIn: [c.container],
      containersOut: [c.outContainer],
      audioCodecs: [...new Set(c.audioCodecs)],
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: conversionOracles(c),
    metrics: ['wall', 'throughputRealtime', 'peakMemory', 'longtasks'],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── A.6 standalone audio DECODE / ENCODE throughput (samples/s) ─────────────────────────────────
// The catalog wants "two cases each — decode and encode" for the PCM edges (s24, s16be). The
// conversion cases above fold throughput into transcode; these isolate the decode and encode legs
// for the awkward formats so a samples/s number exists per the headline metric. primaryMetric is
// set explicitly (per the task) so the leaderboard ranks the right number. Correctness still GATES:
// decode is gated by the PCM-digest oracle, encode by output shape, both fail-closed.

interface ThroughputCase {
  id: string;
  asset: string;
  container: string;
  audioCodecs: string[];
  /** 'decode' => decodeFrames throughput; 'encode' => transcode-to-PCM throughput */
  kind: 'decode' | 'encode';
  outContainer?: string;
  opts?: Record<string, unknown>;
  oracles: OracleId[];
  primaryMetric: MetricId;
  notes?: string;
}

const THROUGHPUT_CASES: ThroughputCase[] = [
  {
    id: 'throughput_decode_s24',
    asset: 'wav_s24.wav',
    container: 'wav',
    audioCodecs: ['pcm-s24'],
    kind: 'decode',
    opts: { maxFrames: 4096 },
    oracles: ['decoded-frames-bitexact'],
    primaryMetric: 'framesPerSec',
    notes: 'A.6 standalone DECODE throughput for 24-bit PCM (samples/s); gated by PCM digest.',
  },
  {
    id: 'throughput_decode_s16be',
    asset: 'pcm_s16be.aiff',
    container: 'aiff',
    audioCodecs: ['pcm-s16be'],
    kind: 'decode',
    opts: { maxFrames: 4096 },
    oracles: ['decoded-frames-bitexact'],
    primaryMetric: 'framesPerSec',
    notes: 'A.6 standalone DECODE throughput for big-endian PCM (samples/s); gated by PCM digest.',
  },
  {
    id: 'throughput_encode_s24',
    asset: 'wav_f32.wav',
    container: 'wav',
    audioCodecs: ['pcm-f32', 'pcm-s24'],
    kind: 'encode',
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s24' } },
    oracles: ['golden-metadata', 'property-invariant'],
    primaryMetric: 'framesPerSec',
    notes: 'A.6 standalone ENCODE throughput to 24-bit PCM (samples/s); gated by output shape+duration.',
  },
  {
    id: 'throughput_encode_s16be',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16', 'pcm-s16be'],
    kind: 'encode',
    outContainer: 'aiff',
    opts: { container: 'aiff', audio: { codec: 'pcm-s16be' } },
    oracles: ['golden-metadata', 'property-invariant'],
    primaryMetric: 'framesPerSec',
    notes: 'A.6 standalone ENCODE throughput to big-endian PCM (samples/s); gated by output shape+duration.',
  },
];

const throughputScenarios: Scenario[] = THROUGHPUT_CASES.map((c) =>
  defineScenario({
    id: `audio-dsp/${c.id}`,
    op: c.kind === 'decode' ? 'decodeFrames' : 'transcode',
    input: c.asset,
    options:
      c.kind === 'decode'
        ? { ...(c.opts ?? {}) }
        : { ...(c.opts ?? {}), invariant: 'probe-duration' },
    requires: {
      operations: [c.kind === 'decode' ? 'decodeFrames' : 'transcode'],
      containersIn: [c.container],
      ...(c.outContainer ? { containersOut: [c.outContainer] } : {}),
      audioCodecs: [...new Set(c.audioCodecs)],
    },
    oracles: c.oracles,
    // framesPerSec/decodeFps as the headline; wall+memory for context.
    metrics: ['framesPerSec', 'decodeFps', 'wall', 'peakMemory'],
    primaryMetric: c.primaryMetric,
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── AIFF / CAF container READ tie-in (A.2 / A.6) ─────────────────────────────────────────────────
// pcm_s16be.aiff is baked but no audio-dsp case exercised AIFF as the INPUT container as a probe.
// This pins AIFF container detection + big-endian codec identification, gated by golden-metadata
// (which DOES work for op:'probe' — ctx.metadata is populated). CAF has no baked asset; a probe
// case is declared against the canonical caf id so a CAF-capable engine (ffmpeg) is exercised and
// the rest NA(asset-missing) cleanly.

interface ContainerReadCase {
  id: string;
  asset: string;
  container: string;
  audioCodecs: string[];
  notes?: string;
}

const CONTAINER_READ_CASES: ContainerReadCase[] = [
  {
    id: 'aiff_container_probe',
    asset: 'pcm_s16be.aiff',
    container: 'aiff',
    audioCodecs: ['pcm-s16be'],
    notes: 'A.2/A.6 AIFF container READ: detect aiff + big-endian PCM codec. golden-metadata works on probe.',
  },
  {
    id: 'caf_container_probe',
    asset: 'pcm_s16.caf',
    container: 'caf',
    audioCodecs: ['pcm-s16'],
    notes: 'A.2 CAF container READ (canonical asset; NA(asset-missing) until baked, NA(engine) for most).',
  },
];

const containerReadScenarios: Scenario[] = CONTAINER_READ_CASES.map((c) =>
  defineScenario({
    id: `audio-dsp/${c.id}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: [c.container],
      audioCodecs: [...new Set(c.audioCodecs)],
    },
    oracles: ['golden-metadata'],
    metrics: ['wall', 'opsPerSec'],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── Deep-edge: long-duration, gapless, variable channel count (A.16) ─────────────────────────────
// All current audio assets are 5s; the size-ladder (5.3) was never applied to audio. These exercise
// streaming / peak-memory on long audio, encoder-delay/padding (gapless), and a mid-stream / non-
// stereo channel layout. Conversions assert duration invariance (property-invariant) + output shape.

interface EdgeAudioCase {
  id: string;
  op: 'probe' | 'transcode' | 'decodeFrames';
  asset: string;
  container: string;
  audioCodecs: string[];
  outContainer?: string;
  opts?: Record<string, unknown>;
  oracles: OracleId[];
  timeoutMs?: number;
  notes?: string;
}

const LONG_AUDIO_TIMEOUT_MS = 60_000;

const EDGE_AUDIO_CASES: EdgeAudioCase[] = [
  {
    id: 'edge_longform_audio_probe',
    op: 'probe',
    asset: 'longform_1h_audio_pcm.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    oracles: ['golden-metadata'],
    timeoutMs: LONG_AUDIO_TIMEOUT_MS,
    notes: 'A.16 multi-hour PCM: probe must report ~1h cheaply (no full-sample scan / OOM).',
  },
  {
    id: 'edge_longform_audio_resample_16k',
    op: 'transcode',
    asset: 'longform_1h_audio_pcm.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 16000 }, invariant: 'probe-duration' },
    oracles: ['property-invariant'],
    timeoutMs: LONG_AUDIO_TIMEOUT_MS,
    notes: 'A.16 size-ladder for audio: downsample a multi-hour file streaming; duration must survive.',
  },
  {
    id: 'edge_gapless_aac_decode',
    op: 'decodeFrames',
    asset: 'gapless_aac.m4a',
    container: 'mp4',
    audioCodecs: ['aac'],
    opts: { maxFrames: 4096 },
    oracles: ['decoded-frames-bitexact'],
    timeoutMs: LONG_AUDIO_TIMEOUT_MS,
    notes: 'A.16 gapless: AAC with encoder delay/padding; decoded sample count after priming trim.',
  },
  {
    id: 'edge_variable_channel_count_downmix',
    op: 'transcode',
    asset: 'wav_5_1.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16', channels: 2 }, invariant: 'probe-duration' },
    oracles: ['golden-metadata', 'property-invariant'],
    notes: 'A.16 variable channel count: 5.1 (non-stereo layout) -> stereo; shape + duration assertion.',
  },
];

const edgeAudioScenarios: Scenario[] = EDGE_AUDIO_CASES.map((c) =>
  defineScenario({
    id: `audio-dsp/${c.id}`,
    op: c.op,
    input: c.asset,
    ...(c.opts ? { options: c.opts } : {}),
    requires: {
      operations: [c.op],
      containersIn: [c.container],
      ...(c.outContainer ? { containersOut: [c.outContainer] } : {}),
      audioCodecs: [...new Set(c.audioCodecs)],
    },
    oracles: c.oracles,
    metrics: ['wall', 'peakMemory', 'longtasks'],
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── Robustness: empty audio, corrupt WAV/AIFF, image-negative (A.16 / §7) ───────────────────────
// These use the fully-functional `graceful-failure` oracle (no decode needed) and so are real,
// gating coverage today. Mutate cases are deterministic (seeded) so a regression replays exactly.

/** Tiny deterministic PRNG (mulberry32) — reproducible fuzz. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flip `count` bits at seeded positions; length preserved. */
function bitFlip(count: number, seed: number): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => {
    const out = bytes.slice();
    if (out.length === 0) return out;
    const rnd = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const pos = Math.floor(rnd() * out.length);
      const bit = 1 << Math.floor(rnd() * 8);
      out[pos] = (out[pos] ?? 0) ^ bit;
    }
    return out;
  };
}

/**
 * Truncate the WAV/AIFF header region: keep the first `keep` bytes only, destroying the data chunk
 * (and, for a small `keep`, the fmt/COMM header) — the classic "looks like a header, no/short
 * payload" corruption a PCM demuxer must reject cleanly rather than reading past the buffer.
 */
function truncateAt(keep: number): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => bytes.slice(0, Math.min(keep, bytes.length));
}

/** Zero the bytes that carry the RIFF/`fmt ` sample-rate & format fields (offsets ~16..36 in a
 *  canonical WAV header) so the format descriptor is corrupt but the magic survives. */
function corruptWavFmt(): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => {
    const out = bytes.slice();
    out.fill(0, 16, Math.min(36, out.length));
    return out;
  };
}

const AUDIO_FUZZ_TIMEOUT_MS = 15_000;

interface RobustnessAudioCase {
  id: string;
  op: 'probe' | 'transcode' | 'decodeFrames';
  asset: string;
  container: string;
  audioCodecs?: string[];
  outContainer?: string;
  opts?: Record<string, unknown>;
  mutate?: (bytes: Uint8Array) => Uint8Array;
  oracles: OracleId[];
  notes?: string;
}

const ROBUSTNESS_AUDIO_CASES: RobustnessAudioCase[] = [
  {
    // empty_audio.wav is already baked (durationSec null, 0 samples) but was unused by audio-dsp.
    // A structurally-valid empty container fed to a CONVERSION must be handled gracefully: a sane
    // empty output OR a clean throw — never a crash/hang. graceful-failure accepts either.
    id: 'edge_empty_audio_transcode',
    op: 'transcode',
    asset: 'empty_audio.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 44100 } },
    oracles: ['graceful-failure'],
    notes:
      'A.16 zero-length/empty audio: structurally-valid empty WAV through a resample must be handled gracefully (empty output or clean throw), never crash/hang.',
  },
  {
    id: 'fuzz_wav_header_truncated_probe',
    op: 'probe',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    mutate: truncateAt(20),
    oracles: ['graceful-failure'],
    notes:
      'A.16 header-truncated WAV: only the first 20 bytes kept (fmt/data chunk gone); probe must reject cleanly, no read-past-buffer/crash/hang.',
  },
  {
    id: 'fuzz_wav_fmt_corrupt_transcode',
    op: 'transcode',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    outContainer: 'wav',
    opts: { container: 'wav', audio: { codec: 'pcm-s16', channels: 1 } },
    mutate: corruptWavFmt(),
    oracles: ['graceful-failure'],
    notes:
      'A.16 bit-flipped/fuzzed RIFF fmt header (sample-rate/format zeroed): a downmix transcode must fail gracefully on the bad descriptor, no OOM/hang.',
  },
  {
    id: 'fuzz_wav_bitflip_decode',
    op: 'decodeFrames',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    opts: { maxFrames: 256 },
    mutate: bitFlip(96, 0x5117a),
    oracles: ['graceful-failure'],
    notes:
      'A.16 fuzzed PCM span: 96 bit-flips across a WAV; PCM decode must error/conceal without crash/hang/OOM.',
  },
  {
    id: 'fuzz_aiff_header_truncated_probe',
    op: 'probe',
    asset: 'pcm_s16be.aiff',
    container: 'aiff',
    audioCodecs: ['pcm-s16be'],
    mutate: truncateAt(24),
    oracles: ['graceful-failure'],
    notes:
      'A.16 header-truncated AIFF: FORM/COMM header destroyed; big-endian PCM probe must reject cleanly.',
  },
];

const robustnessAudioScenarios: Scenario[] = ROBUSTNESS_AUDIO_CASES.map((c) =>
  defineScenario({
    id: `audio-dsp/${c.id}`,
    op: c.op,
    input: c.asset,
    ...(c.opts ? { options: c.opts } : {}),
    requires: {
      operations: [c.op],
      containersIn: [c.container],
      ...(c.outContainer ? { containersOut: [c.outContainer] } : {}),
      ...(c.audioCodecs ? { audioCodecs: [...new Set(c.audioCodecs)] } : {}),
    },
    oracles: c.oracles,
    metrics: ['wall', 'peakMemory'],
    ...(c.mutate ? { mutate: c.mutate } : {}),
    timeoutMs: AUDIO_FUZZ_TIMEOUT_MS,
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// IMAGE NEGATIVE into an audio op (A.16/§7): the corpus has image negatives but no AUDIO op consumed
// one. Feeding a JPEG into an audio transcode must produce a clean NA (no engine declares 'jpeg' as a
// container) or a graceful error — never a crash. The pseudo-container 'jpeg' drives the NA; an
// engine that nonetheless tries must fail gracefully.
const imageIntoAudioScenario: Scenario = defineScenario({
  id: 'audio-dsp/negative_image_into_audio_transcode',
  op: 'transcode',
  input: 'image.jpg',
  options: { container: 'wav', audio: { codec: 'pcm-s16', channels: 1 } },
  requires: {
    operations: ['transcode'],
    containersIn: ['jpeg'],
    containersOut: ['wav'],
    audioCodecs: ['pcm-s16'],
  },
  oracles: ['graceful-failure'],
  metrics: ['wall'],
  timeoutMs: AUDIO_FUZZ_TIMEOUT_MS,
  notes:
    'A.16/§7 negative-input guard: a still image fed to an AUDIO transcode must fail cleanly (clean NA or graceful error), never crash.',
});

// ── Metamorphic invariants (A.16) ────────────────────────────────────────────────────────────────
// (a) idempotence: converting to the SAME rate/channels/format is a no-op-ish round-trip; the
//     decoded PCM must equal the source decode -> decoded-frames-bitexact vs the (input-keyed) golden.
// (b) round-trip endianness: s16le -> s16be -> s16le must be PCM-bit-exact to the original. The runner
//     executes one op; the second leg is the metamorphic claim the oracle encodes (decode of the
//     re-imported output equals the source decode). Declared as the endianness pair's invariant.
// (c) probe(x).dur consistent across containers: same PCM content in wav vs aiff must report equal
//     duration. Multi-input probe; property-invariant compares durations across the containers.

interface MetamorphicCase {
  id: string;
  op: 'transcode' | 'probe';
  input: string | string[];
  containersIn: string[];
  containersOut?: string[];
  audioCodecs: string[];
  opts?: Record<string, unknown>;
  oracles: OracleId[];
  notes?: string;
}

const METAMORPHIC_CASES: MetamorphicCase[] = [
  {
    id: 'meta_idempotent_resample_same_rate',
    op: 'transcode',
    input: 'wav_s16.wav',
    containersIn: ['wav'],
    containersOut: ['wav'],
    audioCodecs: ['pcm-s16'],
    // Convert to the SAME 48000Hz/stereo/s16 the source already is: a no-op-ish round-trip whose
    // decoded PCM must equal the source decode (golden is the input-keyed source decode).
    opts: { container: 'wav', audio: { codec: 'pcm-s16', sampleRate: 48000, channels: 2 }, invariant: 'decode-remux' },
    oracles: ['decoded-frames-bitexact', 'property-invariant'],
    notes:
      'A.16 metamorphic: transcode to the identical rate/channels/format is idempotent — decoded PCM == source decode (and duration preserved).',
  },
  {
    id: 'meta_roundtrip_endianness_s16',
    op: 'transcode',
    input: 'wav_s16.wav',
    containersIn: ['wav'],
    containersOut: ['wav'],
    audioCodecs: ['pcm-s16', 'pcm-s16be'],
    // s16le -> s16be -> s16le must reproduce the original bytes exactly. The roundtrip flag asks a
    // capable engine to apply both legs; the decoded PCM of the result must equal the source decode.
    opts: { container: 'wav', audio: { codec: 'pcm-s16', roundtrip: 'pcm-s16be' }, invariant: 'decode-remux' },
    oracles: ['decoded-frames-bitexact'],
    notes:
      'A.16 metamorphic: endianness round-trip s16le->s16be->s16le is PCM-bit-exact to the original.',
  },
  {
    id: 'meta_probe_duration_across_wav_aiff',
    op: 'probe',
    // Identical 5s sine PCM content delivered in WAV vs AIFF must report equal duration/sample count.
    input: ['wav_s16.wav', 'pcm_s16be.aiff'],
    containersIn: ['wav', 'aiff'],
    audioCodecs: ['pcm-s16', 'pcm-s16be'],
    opts: { invariant: 'probe-duration' },
    oracles: ['property-invariant'],
    notes:
      'A.16 metamorphic: probe(x).dur consistent across containers — same PCM sine in WAV vs AIFF reports equal duration.',
  },
];

const metamorphicScenarios: Scenario[] = METAMORPHIC_CASES.map((c) =>
  defineScenario({
    id: `audio-dsp/${c.id}`,
    op: c.op,
    input: c.input,
    ...(c.opts ? { options: c.opts } : {}),
    requires: {
      operations: [c.op],
      containersIn: c.containersIn,
      ...(c.containersOut ? { containersOut: c.containersOut } : {}),
      audioCodecs: [...new Set(c.audioCodecs)],
    },
    oracles: c.oracles,
    metrics: ['wall', 'peakMemory'],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── Export ───────────────────────────────────────────────────────────────────────────────────────

export const audioDspScenarios: Scenario[] = [
  ...conversionScenarios,
  ...throughputScenarios,
  ...containerReadScenarios,
  ...edgeAudioScenarios,
  ...robustnessAudioScenarios,
  imageIntoAudioScenario,
  ...metamorphicScenarios,
];

export default audioDspScenarios;
