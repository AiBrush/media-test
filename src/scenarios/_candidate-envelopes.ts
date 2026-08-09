import type { CandidateInputEnvelope } from '../core/scenario.ts';

export const MICRO_320X240_1S_CANDIDATE_ENVELOPE = {
  minWidth: 320,
  maxWidth: 320,
  minHeight: 240,
  maxHeight: 240,
  minDurationSec: 0.9,
  maxDurationSec: 1.1,
} satisfies CandidateInputEnvelope;

export const TINY_640X360_2S_CANDIDATE_ENVELOPE = {
  minWidth: 640,
  maxWidth: 640,
  minHeight: 360,
  maxHeight: 360,
  minDurationSec: 1.8,
  maxDurationSec: 2.2,
} satisfies CandidateInputEnvelope;

export const HD_1280X720_10S_CANDIDATE_ENVELOPE = {
  minWidth: 1280,
  maxWidth: 1280,
  minHeight: 720,
  maxHeight: 720,
  minDurationSec: 9,
  maxDurationSec: 11,
} satisfies CandidateInputEnvelope;

/** Canonical four-second 720p workload used by the fragmented ISO-BMFF fixture. */
export const HD_1280X720_4S_CANDIDATE_ENVELOPE = {
  minWidth: 1280,
  maxWidth: 1280,
  minHeight: 720,
  maxHeight: 720,
  minDurationSec: 3.8,
  maxDurationSec: 4.2,
} satisfies CandidateInputEnvelope;

export const FULL_HD_10S_CANDIDATE_ENVELOPE = {
  minWidth: 1920,
  maxWidth: 1920,
  minHeight: 1080,
  maxHeight: 1080,
  minDurationSec: 9,
  maxDurationSec: 11,
} satisfies CandidateInputEnvelope;

/** Canonical medium performance workload: exact 1080p geometry and a ±10% 30-second duration band. */
export const MEDIUM_1080P_30S_CANDIDATE_ENVELOPE = {
  minWidth: 1920,
  maxWidth: 1920,
  minHeight: 1080,
  maxHeight: 1080,
  minDurationSec: 27,
  maxDurationSec: 33,
} satisfies CandidateInputEnvelope;

/** Canonical large-rung workload shared by demux and transcode selection contracts. */
export const LARGE_1080P_120S_CANDIDATE_ENVELOPE = {
  minWidth: 1920,
  maxWidth: 1920,
  minHeight: 1080,
  maxHeight: 1080,
  minDurationSec: 108,
  maxDurationSec: 132,
} satisfies CandidateInputEnvelope;

export const HUGE_1080P_10MIN_CANDIDATE_ENVELOPE = {
  minWidth: 1920,
  maxWidth: 1920,
  minHeight: 1080,
  maxHeight: 1080,
  minDurationSec: 540,
  maxDurationSec: 660,
} satisfies CandidateInputEnvelope;

/** Canonical massive-rung workload: exact 1080p geometry and a ±10% two-hour duration band. */
export const MASSIVE_1080P_2H_CANDIDATE_ENVELOPE = {
  minWidth: 1920,
  maxWidth: 1920,
  minHeight: 1080,
  maxHeight: 1080,
  minDurationSec: 6480,
  maxDurationSec: 7920,
} satisfies CandidateInputEnvelope;

export const UHD_3840X2160_CANDIDATE_ENVELOPE = {
  minWidth: 3840,
  maxWidth: 3840,
  minHeight: 2160,
  maxHeight: 2160,
} satisfies CandidateInputEnvelope;

/** Canonical 4K performance workload: exact UHD geometry and a ±10% ten-second duration band. */
export const UHD_3840X2160_10S_CANDIDATE_ENVELOPE = {
  ...UHD_3840X2160_CANDIDATE_ENVELOPE,
  minDurationSec: 9,
  maxDurationSec: 11,
} satisfies CandidateInputEnvelope;
