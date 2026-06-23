# robustness/edge_video_only_probe

- family: robustness
- fixture asset: `fixtures/media/h264_video_only.mp4` (1.7 MB, real H.264 video-only MP4, no audio track)
- primaryMetric: none declared in shard (entries carry only `durationMs`; no `bench{}`/`primaryMetric` block present)
- passCount: 7 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — all 7 engines PASS the same single oracle).
- Decisive factor: PERFORMANCE. Correctness is a dead heat — every engine satisfies the one gating oracle
  `golden-metadata` identically (`durationDeltaSec=0`, 1 track matched). The tiebreak is wall-time
  (`durationMs`): mediabunny is fastest at **11 ms**.
- Margin over runner-up: mediabunny 11 ms vs remotion-webcodecs 14 ms = **1.27x faster** wall. vs the
  pure-JS box parsers (mp4box / remotion-media-parser, 22 ms) ~2.0x; vs ffmpeg.wasm (166 ms) ~15x.
- Evidence strength caveat: every result is `cached:true` and there is **one** measured `durationMs`
  sample per engine (no `bench{}` median/p95/mad/n). A single cached timing is weak evidence; the gaps
  among the four fastest engines (11–15 ms) are within plausible run-to-run noise for a metadata-only probe.

## Per-engine results

All engines pass exactly one oracle: `golden-metadata`. No `bench` block exists in the shard, so
throughputRealtime / peakMemory / longtasks are not reported (shown as n/a); the only timing is `durationMs`.

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 11 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 14 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 15 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 22 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 22 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 113 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 166 | n/a | n/a | n/a | cached previous PASS result |

## Why the winner wins (deep technical)

The operation is `op: 'probe'` (src/scenarios/robustness/index.ts:651-659): open an MP4 that contains a
single H.264 video track and **no** audio track, then enumerate tracks and report container + duration +
per-track codec/dims/fps. The golden truth (fixtures/golden/h264_video_only.mp4.meta.json) is:
`container=mp4`, `durationSec=5`, exactly one track `{video, h264, 1280x720, fps 30}`. The gate
`golden-metadata` (src/core/oracles.ts:595-657) compares track count positionally and the duration
within the strict MP4 per-frame band — here `durationToleranceSec=0.041666…` (= 1/24 s) and the measured
`durationDeltaSec=0` for every engine. So correctness cannot separate the field: all seven read the
`mvhd`/`tkhd`/`stsd` boxes correctly, found one video track, and assumed/synthesized no phantom audio
track. That is the whole point of this robustness row (notes §A.16 video-only): a probe must not invent
a second track.

Given a correctness tie, the winner is decided by wall time. mediabunny's probe path
(src/engines/mediabunny/adapter.ts:1134-1141 → `metadataFromInput`, adapter.ts:417-453) is mechanistically
the cheapest possible for this container shape:

- Duration is taken via the **cheap metadata path first**: `input.getDurationFromMetadata()`
  (adapter.ts:428-433), which reads the container's declared `mvhd` duration directly without scanning
  samples. Only if that returns null/non-finite does it fall back to `computeDuration()`
  (adapter.ts:434-441). For a faststart, non-fragmented MP4 with a valid `mvhd` (duration=5s declared),
  the cheap path resolves immediately — no `moof` walk, no `stts`/`stsz` sample-table traversal.
- Track enumeration is a single `input.getTracks()` (adapter.ts:443) over already-parsed box state, with
  per-track normalization reading `InputVideoTrack` getters only.
- The backend is WebCodecs-oriented but for a pure metadata probe **no decoder is instantiated** — the
  reported `configUsed.backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `coopCoep:"not-required"`,
  `sharedArrayBuffer:false` describe the engine's decode config, not work done here. The probe only
  touches the demuxer/box parser, so mediabunny pays no WASM-module or decoder warm-up cost on this path.

The result is 11 ms, the lowest of the field. remotion-webcodecs (14 ms) and the Chrome platform path
(15 ms) are close behind — both also avoid heavy work for a metadata probe — but neither beats
mediabunny's metadata-first short-circuit. The pure-JS box parsers mp4box (configUsed
`backend:"pure-js"`, `pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"`) and remotion-media-parser
(`backend:"cpu-js"`, `fieldsTier:"metadata-only"`) land at 22 ms — they append/parse the whole-file
buffer in JS rather than range-reading just the moov, roughly 2x mediabunny. The two heavyweight demux
stacks pay container init overhead: web-demuxer (113 ms) spins up its WASM FFmpeg-based demuxer, and
ffmpeg.wasm (166 ms) pays full module instantiation plus an ffprobe-style invocation — ~10x and ~15x
mediabunny respectively, even though all of them ultimately report the identical correct metadata.

## What each other framework did wrong

Note: none of these "did wrong" in correctness terms — all PASS the gate. The losses are purely the
performance tiebreak on `durationMs`.

- **remotion-webcodecs@4.0.479** — PASS, golden-metadata correct (Δdur 0). Lost on wall: 14 ms vs 11 ms
  (1.27x slower). Closest runner-up.
- **platform@chrome-149** — PASS, correct. 15 ms vs 11 ms (1.36x slower). Browser-native demux is fast but
  not the fastest here.
- **mp4box@2.3.0** — PASS, correct. 22 ms vs 11 ms (2.0x slower). `pure-js` whole-file-append parse
  (`MP4BoxBuffer+fileStart`, no range reads) costs more than mediabunny's metadata-first short-circuit.
- **remotion-media-parser@4.0.479** — PASS, correct. 22 ms vs 11 ms (2.0x slower). `cpu-js` streaming
  metadata-only parse; same ~2x JS-parser tier as mp4box.
- **web-demuxer@4.0.0** — PASS, correct. 113 ms vs 11 ms (~10.3x slower). WASM demuxer init dominates a
  metadata-only probe.
- **ffmpeg.wasm@0.12.15** — PASS, correct. 166 ms vs 11 ms (~15.1x slower). Full WASM FFmpeg module
  instantiation + ffprobe-style metadata read; heaviest path in the field for a trivial probe.

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:651-659 — `id:'edge_video_only_probe'`,
  `op:'probe'`, `asset:'h264_video_only.mp4'`, `videoCodecs:['h264']`, `oracles:['golden-metadata']`.
  Notes: "§A.16 video-only (normal length): MP4 with a video track and no audio track. Golden-metadata
  gates track enumeration." Gating rationale is sound — the risk it guards is a demuxer fabricating a
  phantom audio track or miscounting tracks.
- Fixture exists and is REAL: `fixtures/media/h264_video_only.mp4`, 1.7 MB on disk (stat confirmed). Not
  synthetic/empty/mock. Golden meta `fixtures/golden/h264_video_only.mp4.meta.json` encodes the truth
  (1 video track, h264, 1280x720, 30 fps, 5 s, container mp4) and is physically plausible for a 5 s
  720p30 H.264 clip (declared bitrate 2.78 Mbps → ~1.74 MB, matching the 1.7 MB file size).
- Oracle: src/core/oracles.ts:595-657 (`goldenMetadata`). Real comparison — checks container string
  (line 606), duration within a strict per-frame tolerance (lines 614-637; here tol = 1/24 s, Δ = 0),
  positional track count (lines 645-647), and per-track type/codec/width/height/fps (compareTrack,
  lines 659-682). Not trivially satisfiable: a fabricated audio track would trip the track-count diff;
  a wrong codec/dimension would diff. This is a structural/metadata-exact gate, not a smoke or
  ssim-with-exactFrames==0 proxy.
- Winner adapter: src/engines/mediabunny/adapter.ts:1134-1141 (`probe`) → adapter.ts:417-453
  (`metadataFromInput`). Genuinely calls the library: `getFormat()`, `getDurationFromMetadata()` with
  `computeDuration()` fallback, `getTracks()` + `normalizeTrack`. No canned output, no golden
  short-circuit, no input→output copy, no swallowed-error-reported-as-success (errors set duration null,
  not a fake pass).
- cached note: ALL seven entries are `cached:true` ("cached previous PASS result"). The PASS verdicts and
  the durationMs values were reused, not re-run in this report pass — staleness/noise risk applies to the
  performance tiebreak in particular.

Verdict: **WEAK-GATE**. The implementation, fixture, and oracle are all real (no cheat), but the single
gating oracle is a metadata-equality check that every engine passes identically — it is a meaningful but
relatively loose gate (no bit-exact decode, no packet-level golden). The winner is therefore decided
entirely by a performance tiebreak, and that tiebreak rests on a single cached `durationMs` sample per
engine with no `bench{}` spread. The PASS is real; the "best" ranking is low-strength.

## Confidence & caveats

- Correctness confidence: HIGH — all engines pass a real metadata oracle with Δduration=0 and exact
  track match against a real fixture/golden.
- Ranking confidence: LOW — the win rests on `durationMs` only (no median/p95/mad/n), all values cached,
  and the top four engines (11/14/15 ms) sit inside likely measurement noise. The large gaps
  (web-demuxer 113 ms, ffmpeg.wasm 166 ms) are robust enough to be real ordering, but the 11-vs-14 ms
  top placement is not strongly defended.
- No `bench{}` or `primaryMetric` present in the shard for this scenario, so peakMemory / throughput /
  longtasks could not be used as tiebreakers; reported as n/a above.
