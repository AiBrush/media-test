# probe/flac_noseektable

- family: probe
- fixture asset: `flac_noseektable.flac` (fixtures/media/flac_noseektable.flac, 143 KB, real `fLaC`-magic native FLAC, no SEEKTABLE block)
- primaryMetric: wall (ms)
- passCount: 4 of 7

## Verdict

- Best framework: **remotion-media-parser@4.0.479** (engineId `remotion-media-parser`).
- CONTESTED: 4 engines PASS (remotion-media-parser, mediabunny, remotion-webcodecs, ffmpeg-wasm). All four pass the single gating oracle `golden-metadata` with an *identical* correctness result — `durationDeltaSec: 0` against a tolerance of `0.041666…s` (one 1/24s video frame), 1 audio track matched. Correctness is therefore a perfect tie; the decision falls to performance.
- Decisive factor: wall-clock median. remotion-media-parser is fastest at **2.14 ms** median.
- Margin over runner-up (mediabunny @ 2.55 ms): **1.19x faster wall** (2.55/2.14). Over remotion-webcodecs (2.685 ms): 1.25x. Over ffmpeg-wasm (3.46 ms): 1.62x.
- Evidence strength caveat: every wall sample is **n==1** and **cached==true** for all four PASS engines, so the 0.41 ms gap to mediabunny is a single-shot, sub-millisecond margin with zero spread (mad=0, p95==median) and is weak evidence. The win is real but the order between the top two could plausibly flip on a fresh re-run.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 2.14 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 2.55 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 2.685 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 3.46 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |
| web-demuxer@4.0.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |

Note: the `bench` block for all PASS engines contains only the `wall` metric; throughputRealtime / peakMemory / longtasks were not recorded for this micro-probe scenario.

## Why the winner wins (deep technical)

This is a pure container-probe of a **native raw FLAC stream** (`.flac`, not FLAC-in-MP4 or FLAC-in-Ogg). The defining edge of `flac_noseektable.flac` is named in the scenario notes (src/scenarios/probe/index.ts:217): there is **no SEEKTABLE metadata block**, so the duration cannot be read from a seek-point index. The only authoritative duration source is the **STREAMINFO block** at the head of the file: `total samples ÷ sample rate`. The fixture's first bytes confirm this exactly — `66 4c 61 43` (`fLaC`), then a metadata-block header `00 00 00 22` (block type 0 = STREAMINFO, length 0x22 = 34 bytes) carrying sample rate, channel count and the 36-bit total-sample field. Golden (fixtures/golden/flac_noseektable.flac.meta.json): `durationSec: 10`, codec `flac`, `sampleRate: 48000`, `channels: 2`, `bitrate: 114346`. 143 KB × 8 / 10 s ≈ 114 kbps — internally consistent.

Because the answer lives entirely in the file header, the winning strategy is *header-only* parsing: read the first metadata block, compute `totalSamples/sampleRate`, and stop — never scan frames or build a sample index. remotion-media-parser's adapter does exactly this. Its `probe()` (src/engines/remotion-media-parser/adapter.ts:348) calls the real `parseMedia` from `@remotion/media-parser` with a deliberately minimal `fields` set — `durationInSeconds`, `container`, `tracks`, `metadata`, `rotation` (adapter.ts:374-381) — at the `'metadata-only'` tier. media-parser reads only as far as it must to satisfy those fields, so for a headerless-seektable FLAC it stops right after STREAMINFO. `env.configUsed` corroborates the cheapest possible path: `backend: 'cpu-js'`, `pipeline: 'streaming'`, `reader: 'webReader'`, `fieldsTier: 'metadata-only'`, `coreBuild: 'n/a'` — no wasm core loaded, no WebCodecs spun up, no worker. That minimal cold-path is why its wall median (2.14 ms) edges the WebCodecs/wasm-capable engines, all of which carry heavier per-op plumbing even when they too short-circuit to a header read.

The runner-up **mediabunny** (2.55 ms) is also a pure-TS parser (`coreBuild: 'pure-ts-esm'`, `coopCoep: 'not-required'`) and likewise reads STREAMINFO; it passes with the same `durationDeltaSec: 0`. It is simply ~0.41 ms slower on this one cached sample — plausibly its `backend: 'webcodecs'` negotiation overhead (it reports `hwAccel: 'prefer-hardware'`, `canvasPoolSize: 4`) that is set up even for a metadata probe. **remotion-webcodecs** (2.685 ms) similarly stands up a WebCodecs/streaming-backpressure pipeline. **ffmpeg-wasm** (3.46 ms) is the slowest of the four: even a header probe pays the cost of the single-thread wasm core path. None of these correctness-differs — the gap is purely fixed per-op overhead, and the lean cpu-js streaming reader of media-parser has the least of it.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on performance only. Identical correctness (`golden-metadata` pass, `durationDeltaSec: 0`). Wall 2.55 ms vs 2.14 ms = **1.19x slower** (margin 0.41 ms, n=1, cached). No oracle deficiency.
- **remotion-webcodecs@4.0.479** — PASS, lost on performance. `golden-metadata` pass, `durationDeltaSec: 0`. Wall 2.685 ms = **1.25x slower**. Heavier streaming-backpressure/WebCodecs pipeline for what is a header-only read.
- **ffmpeg.wasm@0.12.15** — PASS, lost on performance. `golden-metadata` pass, `durationDeltaSec: 0`. Wall 3.46 ms = **1.62x slower**; single-thread wasm core overhead dominates a trivial header probe.
- **platform@chrome-149** — NA_ENGINE, reason "engine does not declare input container 'flac'". Honest: its `containersIn` is `['mp4','mov','webm','mkv','wav']` (src/engines/platform/adapter.ts:240). The WebCodecs platform exposes an `AudioDecoder` for the `flac` *codec* but no demuxer for the raw `.flac` *container*, so declaring NA (not FAIL) is correct.
- **mp4box@2.3.0** — NA_ENGINE, same reason. Honest: mp4box.js is an ISO-BMFF (MP4/MOV) parser; `containersIn` is `['mp4','mov']` (src/engines/mp4box/adapter.ts:645). It cannot parse a native FLAC container at all.
- **web-demuxer@4.0.0** — NA_ENGINE, same reason. Honest: `containersIn` is `['mp4','mov','mkv','webm','ts']` (src/engines/web-demuxer/adapter.ts:639); it has a flac *codec* mapping but does not declare the raw `.flac` container as an input.

## Anti-cheat validation

- Scenario: src/scenarios/probe/index.ts:213-218 — `{ asset: 'flac_noseektable.flac', container: 'flac', audioCodecs: ['flac'], notes: 'No SEEKTABLE — duration from STREAMINFO total samples.' }`. operations: `['probe']` (family header, lines 1-31).
- Fixture: `fixtures/media/flac_noseektable.flac` EXISTS (143 KB). First bytes `66 4c 61 43 00 00 00 22 …` = genuine `fLaC` magic + 34-byte STREAMINFO block. Real media, not synthetic/empty/mock.
- Oracle: `goldenMetadata` at src/core/oracles.ts:595-657. Performs a REAL field-by-field comparison of measured probe metadata vs committed golden (fixtures/golden/flac_noseektable.flac.meta.json): container string, duration within tolerance, and positional per-track codec/sampleRate/channels (compareTrack, lines 659-682). Not trivially satisfiable: a wrong codec, sample rate, channel count, or a duration off by more than ±0.0417 s FAILs. Measurement `durationDeltaSec: 0` is physically plausible (golden = 10 s exactly from STREAMINFO; a correct STREAMINFO read reproduces it bit-for-bit).
- Winner adapter: src/engines/remotion-media-parser/adapter.ts:348 (`probe`) → `runParse` (adapter.ts:335 calls real `parseMedia`) with `fields: { durationInSeconds, container, tracks, metadata, rotation }` (lines 374-381). Genuine library call, metadata-only; no canned output, no copy-input-to-output, no short-circuit to the golden file, no error swallowing (corrupted-input cases are explicitly fed through to throw, per the adapter docs at lines 31, 344).
- Verdict: **REAL** — real fixture + real parseMedia implementation + a meaningful structural/metadata-exact oracle that compares against an independent golden and can fail.
- Cached note: the winner's result has **cached==true** (reason "cached previous PASS result"), as do all four PASS engines. Staleness risk: the 2.14 ms median was reused, not freshly re-run; the sub-millisecond ordering versus mediabunny is not robust to a fresh bake. Correctness (the gate) is unaffected — golden-metadata is deterministic.

## Confidence & caveats

- Confidence: **medium**. The verdict (correctness tie → fastest wall) is sound and the validation is REAL, but the winning margin is a single cached n==1 sample with mad=0 and the gap to mediabunny is only 0.41 ms. The top-two order could flip on a fresh, uncached run.
- `golden-metadata` is a structural/metadata-exact oracle (mid-ladder), not bit-exact decode — appropriate for a probe family, but it does not exercise frame decoding or packet-table accuracy (those are gated separately under the demux family per the family header).
- All four winners reach the identical correct answer; this scenario primarily differentiates per-op overhead, not codec capability.
