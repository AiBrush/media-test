# probe/realworld_mdn_flower_mp4

family: probe | fixture asset: `realworld_mdn_flower.mp4` (1.1 MB, real MDN CC0 flower) | primaryMetric: wall | passCount: 7/7

## Verdict

Best framework: **mp4box@2.3.0** (CONTESTED — all 7 engines PASS the single gating oracle `golden-metadata`).

Decisive factor: **performance only**. Correctness is a 7-way tie at the *same* oracle and the *same* strictness ladder rung (structural/metadata-exact). Every engine matched the golden 2-track layout; mp4box and the two remotion engines and web-demuxer reported `durationDeltaSec=0` exactly, the rest within ≤0.005s (tolerance 0.0417s = 1 frame @29.97fps). With correctness comparable, ranking falls to the primaryMetric `wall`: mp4box has the lowest median at **3.975ms**, edging mediabunny (4.44ms) by **1.12x**. Margin over runner-up is razor-thin and rests on n==1 single-sample timing (mad==0, no spread data) — see Confidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | golden-metadata:pass | **3.975** | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 4.44 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 8.605 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 10.08 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 28.84 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 428.48 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 6000.52 | n/a | n/a | n/a | cached previous PASS result |

Bench captured only `wall` (metrics: ['wall']); throughputRealtime/peakMemory/longtasks were not emitted for this probe scenario.

## Why the winner wins (deep technical)

The operation is the cheapest in the suite: open an ISO-BMFF (MP4, `major_brand=mp42`) faststart file and report normalized metadata — container, per-track codec/dims/fps and audio sampleRate/channels — against an independent ffprobe-derived golden (`fixtures/golden/realworld_mdn_flower.mp4.meta.json`: 5.055s, H.264 960×540 @29.97, AAC 48000/2ch). Because the only gate is `golden-metadata` (src/core/oracles.ts:595), correctness collapses to "does your normalized `moov` read match golden", which every parser here does. The container is a progressive faststart MP4, so a correct probe is a pure front-of-file `moov` read — no sample-table walk, no decode.

mp4box wins on the metric. Its adapter (src/engines/mp4box/adapter.ts) runs a `backend:"pure-js"` whole-file append pipeline (`whole-file-append(MP4BoxBuffer+fileStart)`, env.configUsed) with `discardMdatDataProbe:true` (src/engines/mp4box/adapter.ts:99) — for probe it drops `mdat` bytes and parses boxes to the `moov` only, the memory-optimal and fastest path. The metadata is built straight from `getInfo()`'s `Movie` (src/engines/mp4box/adapter.ts:408+), reading duration from `mvhd` and, for fragmented inputs, the {num,den} fragment ratio (src/engines/mp4box/adapter.ts:414+). For this small (1.1 MB) faststart file the entire `moov` is at the head, so mp4box's pure-JS box scan finishes in 3.975ms with `durationDeltaSec=0` (exact match to golden 5.055s) — no WebCodecs, no wasm, no worker, no COOP/COEP requirement.

mediabunny (runner-up, 4.44ms) is mechanistically identical in outcome: its `metadataFromInput` (src/engines/mediabunny/adapter.ts:417) takes the cheap path first — `getDurationFromMetadata()` reads the declared `mvhd`/segment duration WITHOUT scanning samples (src/engines/mediabunny/adapter.ts:429), only falling back to `computeDuration()` on null. It does pay a small extra cost: per-video-track FPS is estimated via `computePacketStats(120)` over a 120-packet prefix (src/engines/mediabunny/adapter.ts:312), which is a real sample-index read that mp4box's `getInfo()` fps derivation avoids. That tiny extra read is consistent with mediabunny's 0.001s durationDelta (vs mp4box's 0) and its 1.12x-slower wall. Both are pure-TS/JS, COOP/COEP-not-required (mediabunny `coopCoep:"not-required"`), and structurally equivalent winners — mp4box only edges it by header-parse simplicity.

The rest are correct but pay structural overhead for a job that needs only a header read: ffmpeg.wasm spins up a wasm demuxer (28.84ms), web-demuxer pays wasm + worker bridging (428.48ms), and platform@chrome-149 is catastrophically slow (6000.52ms) because its probe path drives `<video>`/MediaSource element loading rather than a direct box parse — appropriate for playback, ruinous for a metadata probe.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost by 1.12x wall (4.44ms vs 3.975ms). Extra cost is the `computePacketStats(120)` 120-packet FPS-estimation prefix read (src/engines/mediabunny/adapter.ts:312) on top of the cheap mvhd duration; correctness identical (durationDelta 0.001s).
- **remotion-media-parser@4.0.479** — PASS, lost by 2.16x (8.605ms). `cpu-js` streaming `webReader` at `fieldsTier:"metadata-only"`; correct (durationDelta 0) but slower JS streaming parse than mp4box's whole-file box scan for a 1.1 MB file.
- **remotion-webcodecs@4.0.479** — PASS, lost by 2.54x (10.08ms). WebCodecs-oriented adapter; for a pure metadata probe the WebCodecs scaffolding adds overhead over a header-only box read (durationDelta 0).
- **ffmpeg.wasm@0.12.15** — PASS, lost by 7.26x (28.84ms). wasm demuxer init + parse; correct (durationDelta 0.005s) but heavy single-thread wasm for header reading.
- **web-demuxer@4.0.0** — PASS, lost by 107.8x (428.48ms). wasm + worker demux bridge; correct (durationDelta 0) but the worker/wasm round-trip dominates a sub-5ms native parse job.
- **platform@chrome-149** — PASS, lost by 1509x (6000.52ms). `<video>→canvas→MediaRecorder` style media-element pipeline (env.configUsed); element load/decode setup makes a metadata-only probe absurdly expensive though it does match golden (durationDelta 0.001s).

## Anti-cheat validation

- Scenario: src/scenarios/probe/index.ts:55-64 defines `id: 'realworld_mdn_flower_mp4'`, asset `realworld_mdn_flower.mp4`, container mp4, oracles `['golden-metadata']`, metrics `['wall']`. notes: "Real-world fetched corpus smoke: MDN CC0 flower.mp4 ... Prevents the MP4 probe axis from relying only on ffmpeg-generated test patterns."
- Fixture: `fixtures/media/realworld_mdn_flower.mp4` EXISTS, 1.1 MB — a genuine real-world MP4, not synthetic/empty/mock.
- Golden: `fixtures/golden/realworld_mdn_flower.mp4.meta.json` EXISTS (independent ffprobe values: 5.055s, H.264 960×540@29.97, AAC 48000/2ch, major_brand mp42); plausible for real media.
- Oracle: src/core/oracles.ts:595 `goldenMetadata` performs a REAL field-by-field comparison — container (line 606), duration within ±1-frame tolerance (line 614-637), and positional per-track codec/width/height/fps/sampleRate/channels via `compareTrack` (line 659). Not trivially satisfiable: a wrong codec/dim/duration FAILs. measurements durationDeltaSec (0 / 0.001 / 0.005) and toleranceSec (0.0417) are physically plausible.
- Winner adapter: src/engines/mp4box/adapter.ts:408+ builds metadata from mp4box `getInfo()`'s real `Movie`/`moov` parse; `discardMdatDataProbe:true` (line 99) keeps it header-only. No canned output, no input→output copy, no golden short-circuit, no swallowed errors reported as success (line 632-638 documents the honest box-parse contract).
- Verdict: **REAL** — real fixture + real moov-parse implementation + meaningful field-exact oracle.
- Cached note: ALL 7 engine results have `cached:true` ("cached previous PASS result"). The PASS verdicts and wall numbers were reused, not re-run this session — staleness risk applies to the exact millisecond timings (and thus to the thin 1.12x mp4box-vs-mediabunny margin), though not to the correctness conclusion.

## Confidence & caveats

Confidence: medium. Correctness conclusion (all 7 PASS, REAL gate) is solid. The *winner pick* is fragile: mp4box beats mediabunny by only 1.12x on a single sample (n==1, warmup==1, mad==0, no p95 spread), and every result is `cached:true`, so the timing could flip on a fresh run. mp4box and mediabunny are genuinely co-leaders for this header-only probe; mp4box is named winner strictly because it holds the lowest cached wall median. No throughputRealtime/peakMemory/longtasks were captured to break the tie on a second axis. The bottom four (ffmpeg.wasm, web-demuxer, platform) are unambiguously slower and not contenders for the win.
