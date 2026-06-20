/**
 * src/scenarios/mux/multi-source.ts — multi-source assembly mux (spec §A.7, §A.3).
 *
 * The legacy family had ONE list-input case (video_plus_audio_to_mp4 = H.264 video + AAC audio → mp4).
 * §A.7 lists "replace / swap audio track" as a core op adjacent to mux, and the WRITE matrix needs
 * multi-source assembly into NON-mp4 targets, 3-track assembly, and a track-DROP (mux a subset of the
 * demuxed tracks). This file adds those, sourcing real corpus assets (manifest.json):
 *
 *   - video-from-A + audio-from-B → NON-mp4 (mkv, webm): the legacy multi-source case only ever wrote
 *     mp4. Assemble the H.264 video track from one asset with an audio track from another into mkv;
 *     and a VP9 video + Opus audio (both from WebM sources) into webm.
 *   - 3-track assembly: H.264 video + two distinct audio tracks into one container (mkv). Tests that
 *     the muxer lays out and indexes three tracks (one video, two audio) correctly.
 *   - track DROP / subset: from a multitrack source, mux only a subset (drop one audio track). The
 *     output must contain exactly the selected tracks.
 *   - audio SWAP / replace (§A.7): take a video's own track set but replace its audio with a DIFFERENT
 *     source's audio (video from h264_1080p_30s.mp4, audio from opus.ogg) into mkv (Opus is legal in
 *     Matroska, not in mp4-as-strict alongside this combo — mkv is the honest target).
 *
 * The runner assembles EncodedTracks from ALL named inputs (it demuxes each and the engine packs them).
 * The track-selection / swap intent is carried in options (trackSelect / swapAudioFrom) for a runner
 * that honours it; correctness is gated by probe-duration (materialized duration of the assembled
 * output).
 *
 * ORACLE NOTE on multi-source + reference-reimport (the dossier's "multi-source half-unchecked" gap):
 * for a list input, the runner loads golden = loadGolden(input[0]) — the FIRST asset only. A
 * reference-reimport packet-count check would compare the COMBINED multi-track output against a
 * single-source golden and FALSE-FAIL (the second track inflates the count). So multi-source cases do
 * NOT attach reference-reimport; they gate on probe-duration (container-agnostic). A true per-track
 * count check needs a demux(mux(x)) oracle that does not yet exist in oracles.ts.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildMuxAll, type MuxCase } from './_shared.ts';

const MULTI_SOURCE_CASES: MuxCase[] = [
  // ── video-from-A + audio-from-B → NON-mp4 targets (legacy only wrote mp4) ──
  {
    id: 'video_a_plus_audio_b_to_mkv',
    input: ['h264_1080p_30s.mp4', 'aac_adts.aac'],
    containersIn: ['mp4', 'adts'],
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    // probe-duration only; reference-reimport is correctly omitted (multi-source golden).
    notes:
      'MULTI-SOURCE → NON-mp4: H.264 video (asset A) + AAC audio (asset B, raw ADTS) assembled into ' +
      'MKV. Legacy multi-source only ever wrote mp4. probe-duration gate; no source-keyed ' +
      'packet count (two sources, single-asset golden).',
  },
  {
    id: 'vp9_video_plus_opus_audio_to_webm',
    input: ['vp9_1080p_10s.webm', 'opus.ogg'],
    containersIn: ['webm', 'ogg'],
    to: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes:
      'MULTI-SOURCE → WebM: VP9 video (from a WebM) + Opus audio (from an OGG) assembled into one WebM. ' +
      'Both codecs are native WebM payloads; exercises cross-source A/V interleave into Matroska/WebM.',
  },

  // ── 3-track assembly: one video + two audio into a single container ──
  {
    id: 'three_track_assembly_to_mkv',
    input: ['h264_1080p_30s.mp4', 'aac_adts.aac', 'mp3_xing.mp3'],
    containersIn: ['mp4', 'adts', 'mp3'],
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac', 'mp3'],
    notes:
      '3-TRACK ASSEMBLY: H.264 video + AAC audio + MP3 audio from three sources muxed into one MKV ' +
      '(MKV holds AAC and MP3 audio tracks). Tests three-track layout + per-track index authoring.',
  },

  // ── track DROP / subset: from the multitrack source, mux only a subset of demuxed tracks ──
  {
    id: 'drop_audio_track_subset_to_mp4',
    input: 'h264_multitrack.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    // h264_multitrack.mp4 = 1 video + 2 audio. Select video + first audio only (drop the second).
    extraOptions: { trackSelect: ['video:0', 'audio:0'] },
    notes:
      'TRACK DROP / SUBSET: source has 1 video + 2 audio; mux only {video, audio#0} into mp4 (drop ' +
      'audio#1). Output must contain exactly the selected tracks. options.trackSelect carries the ' +
      'subset; probe-duration gates the result (reference-reimport omitted: subset ≠ source ' +
      'golden packet count).',
  },

  // ── audio SWAP / replace (§A.7): keep a video, replace its audio with another source's audio ──
  {
    id: 'swap_audio_video_with_opus_to_mkv',
    input: ['h264_1080p_30s.mp4', 'opus.ogg'],
    containersIn: ['mp4', 'ogg'],
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['opus'],
    // Use the video track from input[0] and the audio track from input[1] (swap out the original AAC).
    extraOptions: { swapAudioFrom: 'opus.ogg', trackSelect: ['video:0@0', 'audio:0@1'] },
    notes:
      'AUDIO SWAP / REPLACE (§A.7): take the H.264 video track and replace the audio with Opus from a ' +
      'different source, mux into MKV (Opus is legal in Matroska). The canonical replace-audio op the ' +
      'legacy family never exercised. options.swapAudioFrom/trackSelect carry the intent.',
  },
];

export const muxMultiSourceScenarios: Scenario[] = buildMuxAll(MULTI_SOURCE_CASES);

export default muxMultiSourceScenarios;
