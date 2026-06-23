# robustness/edge_dims_1x1_probe

- family: robustness
- fixture asset: `video_1x1.webm` (VP9 video in WebM, 1×1, 2s, 30fps) — exists at `fixtures/media/video_1x1.webm` (1.8k)
- primaryMetric: none recorded in shard (only `durationMs`; no `bench{}` block present)
- passCount: 5 of 7 (mp4box NA_ENGINE; one NA only — all other engines PASS)

## Verdict

- best framework: **remotion-media-parser@4.0.479** (CONTESTED — 5 engines PASS the same single oracle)
- decisive factor: With correctness identical across all 5 winners (every PASS engine satisfies the
  one gating oracle `golden-metadata` with `durationDeltaSec=0`, well inside the strict
  `durationToleranceSec=0.0417s` ±1-frame band), the race collapses to **wall time** (`durationMs`,
  the only quantitative field in this shard — no `bench{}` was emitted). remotion-media-parser ties
  platform at the fastest 11ms and wins the tiebreak on mechanism: a **streaming, metadata-only
  header parse** (`fieldsTier: metadata-only`, `pipeline: streaming`, `reader: webReader`,
  `worker: true`-capable) that stops reading after the WebM `Info`/`Tracks` headers, versus platform's
  full-buffer inline demux plus a `<video>`-element DOM round-trip.
- margin over runner-up: tied 11ms with platform (1.00x); 2.6x faster than mediabunny (29ms),
  3.1x faster than remotion-webcodecs (34ms), 6.0x faster than web-demuxer (66ms), 14.6x faster
  than ffmpeg.wasm (161ms). Caveat: all numbers are `n==1` single `durationMs` samples (cached),
  so the 11ms tie is weak evidence and ordering among the leaders is not statistically separable.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 11 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 11 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 29 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 34 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 66 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 161 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'webm' |

(No `bench{}` block exists in this shard, so throughputRealtime / peakMemory / longtasks are
unavailable; `durationMs` is the sole performance number.)

## Why the winner wins (deep technical)

This is a **probe** op (`op: 'probe'`, `src/scenarios/robustness/index.ts:674-682`) on a degenerate
1×1 VP9-in-WebM clip whose whole purpose (per the scenario `notes`) is to confirm width/height
report exactly 1×1 against the golden and to guard the SSIM/luma divide-by-zero path that the sibling
`edge_dims_1x1_decode` exercises. Probe touches no pixels: success is purely correct **track
enumeration + dimensions + duration** matching `fixtures/golden/video_1x1.webm.meta.json`
(`container: webm`, one video track `vp9`, `width:1`, `height:1`, `fps:30`, `durationSec:2`).

The gating oracle `golden-metadata` (`src/core/oracles.ts:595-657`) is a real structural-exact
comparator: it diffs container string, per-track type/codec/width/height/fps/sampleRate/channels
positionally against the golden, and enforces duration within a per-container tolerance. For WebM
the precise ±1-frame band applies, giving `durationToleranceSec = 0.0417s` (= 1/24 floor); every
winner reported `durationDeltaSec = 0`, i.e. exact duration agreement, plus exact 1×1 dims and the
correct `vp9` codec (otherwise `compareTrack` at `oracles.ts:659-686` would have produced a diff and
failed). So **all 5 PASS engines are correctness-equivalent** on the only oracle present — there is
no bit-exact/structural ladder to separate them, and no perceptual/smoke weakness to penalize. The
decision therefore moves to performance, where the only metric is wall time.

remotion-media-parser's adapter (`src/engines/remotion-media-parser/adapter.ts`) drives the real
`@remotion/media-parser` `parseMedia` (imported at `adapter.ts:69-70`, `webReader` at `:84`,
invoked at `:335`). Its capabilities declare ONLY `probe`+`demux` (`adapter.ts:188-191`) — it is a
pure read-only parser, and for probe it requests the **fewest, fastest metadata-tier fields**
(`adapter.ts:338-340` onward), reflected in the shard's `configUsed.fieldsTier:"metadata-only"`,
`pipeline:"streaming"`, `reader:"webReader"`. Because media-parser is a streaming demuxer, it reads
the EBML header and the WebM `Segment > Info` (duration/timecode-scale) + `Tracks` (codec id `V_VP9`,
PixelWidth=1, PixelHeight=1) elements and resolves the probe **without buffering the rest of the
file** — ideal for a header-only metadata read. That is why it lands at the joint-fastest 11ms with
no GPU/WebCodecs involvement at all (`backend: cpu-js`, `hwAccel:false`).

platform ties at 11ms but via a heavier path: `probeInput` (`src/engines/platform/probe.ts:166-309`)
reads the whole buffer (`input.arrayBuffer()`, `:171`), runs the inline WebM demuxer over it
(`demuxWebmTracks`, `probe.ts:211-239`) to recover `vp9`/1×1/fps, AND constructs an HTMLVideoElement
to await `loadedmetadata` for an authoritative duration (`probeViaVideoElement`, `probe.ts:51-108`,
called at `:288`). That is a full-file parse plus a DOM/media-pipeline round-trip — more machinery
for the same answer. With equal measured wall time, the streaming, worker-capable, DOM-free,
COOP/COEP-free parser is the better-engineered fit for this op, so remotion-media-parser takes the
tiebreak (tiebreaker rules: streaming vs whole-file buffering; no runtime/DOM dependency).

## What each other framework did wrong

- **platform@chrome-149** — PASS, tied at 11ms (1.00x). Lost the tiebreak on mechanism only: it
  buffers the entire file and spins up a `<video>` element (`probe.ts:288`, `:51-108`) plus inline
  demux, where the winner streams header-only. Identical correctness (`golden-metadata:true`,
  `durationDeltaSec=0`).
- **mediabunny@1.48.0** — PASS but 2.6x slower (29ms vs 11ms). Correct (`golden-metadata:true`).
  Its `configUsed` shows a WebCodecs/`prefer-hardware` streaming-lockstep pipeline geared for decode;
  that orientation adds overhead for a pure header probe. `n==1`, so the gap is suggestive not proven.
- **remotion-webcodecs@4.0.479** — PASS but 3.1x slower (34ms vs 11ms). Correct
  (`golden-metadata:true`). Heavier WebCodecs/offscreencanvas convert pipeline
  (`backend: webcodecs`, `pixelBackend: offscreencanvas-2d`) than needed to read metadata.
- **web-demuxer@4.0.0** — PASS but 6.0x slower (66ms vs 11ms). Correct (`golden-metadata:true`).
  web-demuxer wraps an ffmpeg-derived wasm demuxer; wasm init/instantiation dominates a tiny probe.
- **ffmpeg.wasm@0.12.15** — PASS but 14.6x slower (161ms vs 11ms), the slowest PASS. Correct
  (`golden-metadata:true`), but the single-thread wasm core + ffprobe-style invocation pays the full
  module/FS bootstrap cost for a 1.8k file.
- **mp4box@2.3.0** — NA_ENGINE: `engine does not declare input container 'webm'`. This NA is
  **honest**: MP4Box.js is an ISO-BMFF (MP4/MOV/fragmented-MP4) parser and genuinely cannot read the
  EBML/Matroska container of a WebM file; declining `webm` is correct capability gating, not an
  under-declaration.

## Anti-cheat validation

- scenario definition: `src/scenarios/robustness/index.ts:674-682` — `id: 'edge_dims_1x1_probe'`,
  `op: 'probe'`, `asset: 'video_1x1.webm'`, `containersIn: ['webm']`, `videoCodecs: ['vp9']`,
  `oracles: ['golden-metadata']`. notes confirm intent: probe a minimum-dimension VP9/WebM clip;
  width/height must report 1×1 from golden.
- fixture: `fixtures/media/video_1x1.webm` EXISTS (1.8k) — a real, non-empty, non-mock WebM file (a
  genuine tiny VP9 clip, not synthetic/zero-byte). Golden present:
  `fixtures/golden/video_1x1.webm.meta.json` (container webm, 1 vp9 track, 1×1, 30fps, 2s).
- oracle: `golden-metadata` at `src/core/oracles.ts:595-657` performs a REAL field-by-field diff vs
  the golden (`compareTrack` `:659-686`) including exact width/height equality and a strict duration
  tolerance; it is NOT trivially satisfiable (any wrong dim/codec/track-count/duration fails).
  Measurements are physically plausible: `durationDeltaSec=0` against a golden 2.0s duration, and the
  ±0.0417s band is the strict ±1-frame WebM band, not a wide catch-all.
- winner adapter: `src/engines/remotion-media-parser/adapter.ts` calls the real `parseMedia`
  (import `:69-70`, `:84`; invoke `:335`); probe requests metadata-tier fields only. No canned
  output, no copy-input-to-output, no golden short-circuit, no error-swallow-then-report-success.
  The runner-up (platform, `probe.ts`) likewise genuinely demuxes + `<video>`-probes.
- verdict: **REAL** — real on-disk fixture, real streaming parser implementation, and a meaningful
  structural-exact oracle that checks the exact thing the scenario is about (1×1 dims, vp9, duration).
- cached note: ALL 7 results have `cached:true` ("cached previous PASS result"). The PASS/NA verdicts
  are reused from a prior run, not freshly re-executed; staleness risk applies to the timing
  (`durationMs`) numbers in particular. The correctness conclusion is robust regardless of caching;
  the 11ms tie and the perf ordering are the part most exposed to cache staleness.

## Confidence & caveats

- Confidence: **medium**. Correctness and the winner-set are unambiguous (one strict oracle, all 5
  pass exactly). But the winner-vs-runner-up call rests on a **tied** single-sample (`n==1`)
  `durationMs` with NO `bench{}` (no median/p95/mad, no memory/longtask data), and all rows are
  cached. The choice between remotion-media-parser and platform is a mechanism-based tiebreak at
  equal measured time, not a measured separation.
- Caveat: a re-run with real bench sampling could reorder the 11ms tie; if platform's full-buffer
  + `<video>` path actually measured faster on warm runs it would be the legitimate winner. For a
  header-only probe, the streaming parser remains the architecturally sounder pick.
- mp4box's NA is correct and should not be read as a failure of the engine.
