/**
 * src/scenarios/streaming-output/index.ts — Pillar 1, family "streaming-output".
 *
 * Exercises HOW bytes leave the engine (the output SHAPE), independent of the codec work: buffer vs
 * streaming target, fragmented/CMAF (moof/mdat), fastStart (moov-first / reserve / none), MPEG-TS tiny
 * writes, headerless/live WebM, and the bounded-peak-memory promise of a stream target at GB scale.
 * Every case is a lossless `remux` (coded samples copied), so the SHAPE — not the codec — is what
 * differs. See ./_shared.ts for the oracle rationale, forwarded shape options, and remaining
 * observability caveats.
 *
 * This index holds the BASE six output-shape cases and concatenates the sibling sub-batteries:
 *   - ./base.ts                 — the original six shapes (stable ids), with the honest oracle fix
 *                                 (reference-reimport, not brittle plain-<video> smoke).
 *   - ./ttfb.ts                 — time-to-first-byte (§A.10) buffer vs stream, ranked on timeToFirstByte.
 *   - ./fragmented-faststart.ts — fastStart progressive (moov-first) + fastStart:false control + the
 *                                 fragmented lossless-copy premise; checks top-level MP4 box layout
 *                                 and documents deeper MSE / reserve overflow gaps rather than faking them.
 *   - ./ts-webm-live.ts         — MPEG-TS continuity across tiny writes + headerless/"live" WebM.
 *   - ./size-ladder.ts          — buffer-vs-stream PEAK-MEMORY contrast at large/huge/massive scale
 *                                 (§A.10 reason-to-exist + §5.3), ranked on peakMemory.
 *   - ./metamorphic.ts          — decode(remux_shape(x))==decode(x) and probe(remux_shape(x)).dur≈
 *                                 probe(x).dur across buffer/stream/fragmented shapes (§A.16).
 *
 * All sub-batteries emit identical scenario shapes via ./_shared.ts and stay one exported
 * `streamingOutputScenarios` (imported by ../index.ts). Do NOT edit ../index.ts.
 */

import type { Scenario } from '../../core/scenario.ts';

import { streamingBaseScenarios } from './base.ts';
import { streamingTtfbScenarios } from './ttfb.ts';
import { streamingFragmentedFastStartScenarios } from './fragmented-faststart.ts';
import { streamingTsWebmLiveScenarios } from './ts-webm-live.ts';
import { streamingSizeLadderScenarios } from './size-ladder.ts';
import { streamingMetamorphicScenarios } from './metamorphic.ts';

/** The whole streaming-output family: base shapes + ttfb + fragmented/faststart + ts/webm-live +
 *  size-ladder + metamorphic invariants. */
export const streamingOutputScenarios: Scenario[] = [
  ...streamingBaseScenarios,
  ...streamingTtfbScenarios,
  ...streamingFragmentedFastStartScenarios,
  ...streamingTsWebmLiveScenarios,
  ...streamingSizeLadderScenarios,
  ...streamingMetamorphicScenarios,
];

export default streamingOutputScenarios;
