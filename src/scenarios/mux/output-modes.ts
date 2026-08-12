/**
 * src/scenarios/mux/output-modes.ts — mux→mp4 WRITE sub-modes: fastStart / fragmented / streaming (§A.3, §A.10).
 *
 * §A.3 calls out mp4 explicitly as "progressive · fastStart(moov-first) · in-place reserve ·
 * fragmented MP4 · streaming write target". The legacy mux family emitted exactly ONE mp4 case
 * (h264_aac_to_mp4) with no write-shape options. The streaming-output family covers these sub-modes —
 * but ONLY for the REMUX op. mux (packing already-encoded EncodedTracks) has its OWN moov / reserve /
 * fragment write path: it authors the sample table from supplied chunks rather than copying an existing
 * one, so the moov-placement / fragment-boundary logic is exercised differently. This file adds the
 * mux-side sub-modes, mirroring streaming-output's option/feature/metric shape but on op:'mux'.
 *
 *   - progressive (baseline): moov after mdat, whole-blob target — the comparison baseline.
 *   - streaming target: emitted incrementally (targetWrites should be many small writes, not one).
 *   - fastStart:reserve: reserve a forward moov and patch it (the runner/target provokes a large
 *     forward seek). feature 'fastStart:reserve'.
 *   - generic fragmented MP4: moof/mdat fragments, MSE-appendable. feature 'fragmented'.
 *
 * METRICS: MUX_STREAM_METRICS adds targetWrites + bytesOut (the output-shape signal), matching
 * streaming-output. PRIMARY METRIC: targetWrites — the per-case number that distinguishes a true
 * incremental writer from a buffer-then-flush one (the whole point of the streaming sub-mode); set on
 * the streaming/fragmented/reserve cases. The progressive baseline ranks on wall.
 *
 * ORACLES: these are mp4 targets of an ISO-BMFF source → reference-reimport is FAITHFUL (the fragmented
 * variant re-imports as a valid fMP4; the reserve variant as a moov-first mp4), so defaultOracles
 * attaches reference-reimport + probe-duration. The shared mux builder also adds mp4-box-layout for
 * fastStart/fragmented options, so a muxer cannot pass a shape row by writing a valid plain MP4.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildMux, MUX_STREAM_METRICS, type MuxCase } from './_shared.ts';

const OUTPUT_MODE_CASES: MuxCase[] = [
  {
    id: 'mp4_progressive_buffer',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    extraOptions: { fastStart: false, target: 'buffer' },
    metrics: MUX_STREAM_METRICS,
    notes:
      'MUX WRITE SUB-MODE mp4 progressive (§A.3): pack EncodedTracks into a whole-blob mp4 (moov after ' +
      'mdat). Baseline for the mux streaming comparison; reference-reimport + duration gates are faithful.',
  },
  {
    id: 'mp4_streaming_target',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    extraOptions: { target: 'stream' },
    metrics: MUX_STREAM_METRICS,
    primaryMetric: 'targetWrites',
    notes:
      'MUX WRITE SUB-MODE mp4 streaming target (§A.10): author the mp4 incrementally; targetWrites ' +
      'should be many small writes, not one buffer-then-flush. Distinct from the REMUX streaming case ' +
      '(this authors the sample table from supplied chunks).',
  },
  {
    id: 'mp4_faststart_reserve',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['fastStart:reserve'],
    extraOptions: { fastStart: 'reserve', maximumPacketCount: 4096, target: 'stream' },
    metrics: MUX_STREAM_METRICS,
    primaryMetric: 'targetWrites',
    notes:
      'MUX WRITE SUB-MODE mp4 fastStart:reserve (§A.3 in-place reserve): reserve a forward moov and ' +
      'patch it after authoring the sample table; the target provokes a large forward seek. The mux ' +
      'moov-reserve path (sizes the moov before the sample table is finalized).',
  },
  {
    id: 'mp4_fragmented',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['fragmented'],
    extraOptions: { fragmented: true },
    metrics: MUX_STREAM_METRICS,
    notes:
      'MUX WRITE SUB-MODE generic fragmented MP4 (§A.3): author moof/mdat fragments from EncodedTracks ' +
      '(MSE-appendable). re-import must see segments; the mux fragment-boundary logic differs from a ' +
      'remux that copies an existing fragmentation. True streaming target writes are gated separately ' +
      'by target:writes and are not implied by returning valid fragmented bytes. This row makes no ' +
      'profile-conformance claim.',
  },
];

export const muxOutputModeScenarios: Scenario[] = OUTPUT_MODE_CASES.map((c) => buildMux(c));

export default muxOutputModeScenarios;
