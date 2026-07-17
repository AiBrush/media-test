/**
 * src/scenarios/performance/size-ladder.ts — the §5.3 SIZE axis for the headline throughput ops, plus
 * the §A.16 memory-pressure / OOM-resistance deep-edge.
 *
 * §5.3 makes size a first-class benchmark axis: the winner at 100 KB can differ from the winner at
 * 500 MB–multi-GB (per-call overhead vs sustained throughput vs peak-memory vs lazy-read behavior all
 * diverge at scale). The headline battery runs ONE rung (the 31 MB medium asset). This file sweeps
 * extract-metadata and iterate-packets across tiny → medium → large(4K) → large → huge → massive, and
 * adds peak-memory-ranked variants on the heavy rungs so "throughput/memory at scale" is actually
 * measured (the manifest defines the large/huge/massive assets explicitly FOR this and no case consumed
 * them).
 *
 * CORRECTNESS GATES (same oracle truth as the headlines): probe → golden-metadata (ctx.metadata vs
 * golden meta); demux → golden-packets (ctx.demux vs golden packets). A fast-but-wrong op FAILs.
 *
 * AVAILABILITY is intentionally not declared here. The selected asset must have a resolved manifest
 * digest+size and the typed golden loader must return OK for the row's required evidence. Missing
 * evidence is NA_ASSET; invalid committed evidence is ERROR. This makes newly committed long-form
 * evidence available without changing scenario source or stale hand-maintained flags.
 *
 * PEAK-MEMORY VARIANTS (§A.14 'peak memory bytes ↓', §8.3 measureUserAgentSpecificMemory): demux on
 * the large/huge rung ranked by peakMemory (lower-better) asserts an engine STREAMS rather than
 * buffering the whole file. peakMemory is produced only where the UA-specific memory API exists
 * (cross-origin-isolated Chromium); elsewhere the sample is null → that cell is honestly NA, not zero.
 * Still gated by golden-packets so a wrong demux can't win on memory.
 *
 * TIMEOUTS bound a pathological lazy-reader / OOM hang at GB scale so it surfaces as a timeout FAIL
 * (catching exactly the failure mode the size axis exists to expose) instead of stalling the Worker.
 */

import { LADDER, mp4H264In, perfCase, T_FAST, T_HUGE, T_LARGE } from './_shared.ts';
import type { Requires, Scenario } from '../../core/scenario.ts';

interface Rung {
  key: string;
  asset: string;
  timeoutMs: number;
}

// Ordered small→large. Runtime manifest/golden evidence is the sole availability authority.
const RUNGS: Rung[] = [
  { key: 'tiny', asset: LADDER.tiny, timeoutMs: T_FAST },
  { key: 'medium', asset: LADDER.medium, timeoutMs: T_FAST },
  { key: 'large4k', asset: LADDER.large4k, timeoutMs: T_LARGE },
  { key: 'large', asset: LADDER.large, timeoutMs: T_LARGE },
  { key: 'huge', asset: LADDER.huge, timeoutMs: T_HUGE },
  { key: 'massive', asset: LADDER.massive, timeoutMs: T_HUGE },
];

function availabilityNote(r: Rung): string {
  return `availability for ${r.asset} is derived from its verified manifest identity and typed golden evidence`;
}

function h264AacRequiresForRung(r: Rung, op: Requires['operations'][number]): Requires {
  if (!r.asset.toLowerCase().endsWith('.mov')) return mp4H264In(op);
  return { operations: [op], containersIn: ['mov'], videoCodecs: ['h264'], audioCodecs: ['aac'] };
}

// extract-metadata across the ladder → ops/sec (per-call overhead at small sizes, real cost at large).
const extractLadder: Scenario[] = RUNGS.map((r) =>
  perfCase({
    id: `performance/size-ladder-extract-metadata-${r.key}`,
    op: 'probe',
    input: r.asset,
    requires: h264AacRequiresForRung(r, 'probe'),
    oracles: ['golden-metadata'],
    metrics: ['opsPerSec', 'wall'],
    primary: 'opsPerSec',
    timeoutMs: r.timeoutMs,
    notes:
      `§5.3 size axis (${r.key}): extract-metadata on ${r.asset}, rank by ops/sec. Gated by ` +
      `golden-metadata; ${availabilityNote(r)}.`,
  }),
);

// iterate-video-packets across the ladder → packets/sec (streaming/lazy demux + sample-table parsing).
const iterateLadder: Scenario[] = RUNGS.map((r) =>
  perfCase({
    id: `performance/size-ladder-iterate-packets-${r.key}`,
    op: 'demux',
    input: r.asset,
    requires: h264AacRequiresForRung(r, 'demux'),
    oracles: ['golden-packets'],
    metrics: ['packetsPerSec', 'throughputRealtime', 'wall'],
    primary: 'packetsPerSec',
    timeoutMs: r.timeoutMs,
    notes:
      `§5.3 size axis (${r.key}): iterate every video packet of ${r.asset}, rank by packets/sec ` +
      `(stresses streaming/lazy demux + sample-table parsing at scale). Gated by golden-packets; ${availabilityNote(r)}.`,
  }),
);

// Memory-pressure deep-edge (§A.16): demux the large/huge/massive rung ranked by peakMemory — does the
// engine STREAM or buffer the whole file? peakMemory only materializes under cross-origin-isolated
// Chromium; elsewhere it is honestly NA. Still golden-packets-gated.
const MEMORY_RUNGS = RUNGS.filter((r) => r.key === 'large4k' || r.key === 'large' || r.key === 'huge');

const memoryPressure: Scenario[] = MEMORY_RUNGS.map((r) =>
  perfCase({
    id: `performance/size-ladder-demux-peak-memory-${r.key}`,
    op: 'demux',
    input: r.asset,
    requires: h264AacRequiresForRung(r, 'demux'),
    oracles: ['golden-packets'],
    metrics: ['peakMemory', 'packetsPerSec', 'wall'],
    primary: 'peakMemory',
    timeoutMs: r.timeoutMs,
    notes:
      `§A.16 memory-pressure (${r.key}): demux ${r.asset} ranked by peakMemory↓ — asserts the engine ` +
      `streams rather than buffering the whole file (OOM-resistance). The protocol records a baseline, ` +
      `in-operation samples, end sample, settle window, UA memory API, maximum and delta; unsupported ` +
      `browser instrumentation is NA_BROWSER. Gated by golden-packets; ${availabilityNote(r)}.`,
  }),
);

export const sizeLadderScenarios: Scenario[] = [...extractLadder, ...iterateLadder, ...memoryPressure];
