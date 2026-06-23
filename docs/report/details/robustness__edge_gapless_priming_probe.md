# robustness/edge_gapless_priming_probe

- **Family:** robustness
- **Fixture asset:** `fixtures/media/gapless_aac.m4a` (14 KB, real file present on disk)
- **Golden:** `fixtures/golden/gapless_aac.m4a.meta.json` (container=mp4, durationSec=1.013, 1 AAC track @ 44100 Hz / 2ch)
- **Operation:** `probe` (metadata read; no decode)
- **Primary / gating oracle:** `golden-metadata` (single oracle for this scenario)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479` (CONTESTED — near-tie with mp4box).
- **Contested:** YES. All 7 engines PASS the single gating oracle (`golden-metadata`) with identical correctness strength.
- **Decisive factor:** Correctness is a dead heat (one structural/metadata oracle, every engine inside the strict ±1-frame band; the two leaders have an exact `durationDeltaSec == 0`). The tiebreaker is therefore (4b/4c): wall time and pipeline shape. `remotion-media-parser` and `mp4box` are the two fastest at **8 ms** (vs 14 ms / 16 ms / 16 ms / 51 ms / 308 ms for the rest). Between the two 8 ms leaders the tiebreaker (4c, streaming vs whole-file buffering) favors `remotion-media-parser`: it ran a **streaming, metadata-only-tier** probe (`fieldsTier: metadata-only`, `pipeline: streaming`, `reader: webReader`) that reads the fewest bytes, whereas `mp4box` did a **whole-file append** (`whole-file-append(MP4BoxBuffer+fileStart)`). Both are pure-JS with no COOP/COEP requirement.
- **Margin over runner-up:** 0 ms wall vs mp4box (exact tie on the only available metric; win is on pipeline-shape tiebreak, not measured time — weak-evidence margin). 1.75x faster than remotion-webcodecs (14 ms), 2.0x faster than platform/mediabunny (16 ms), 6.4x faster than web-demuxer (51 ms), 38.5x faster than ffmpeg.wasm (308 ms).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true (Δdur=0.0000s, tol=0.0417s) | 8 | n/a (not in shard) | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:true (Δdur=0.0000s, tol=0.0417s) | 8 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true (Δdur=0.0000s, tol=0.0417s) | 14 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true (Δdur=0.0000070s, tol=0.0417s) | 16 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true (Δdur=0.0000068s, tol=0.0417s) | 16 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true (Δdur=0.0000070s, tol=0.0417s) | 51 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true (Δdur=0.0030s, tol=0.0417s) | 308 | n/a | n/a | n/a | cached previous PASS result |

Note: the shard carries no `bench{}` block and no explicit `primaryMetric` for these entries — only `durationMs` and the oracle `measurements`. throughputRealtime / peakMemory / longtasks were not recorded for this scenario, so wall (`durationMs`) is the only comparable performance axis.

## Why the winner wins (deep technical)

**The codec/container situation.** The fixture is AAC-LC in an MP4/`m4a` wrapper with encoder delay (priming, the ~2112-sample AAC-LC look-ahead) and trailing padding. A naive demuxer that sums `stts` sample durations (or counts AAC frames × 1024 / 44100) reports the *untrimmed* media duration, which is longer than the audible/gapless duration by the priming + padding. A priming-aware demuxer reports the *trimmed* duration carried by the movie header / edit list. The golden encodes the trimmed value, **`durationSec = 1.013`**. The whole point of this scenario (see `src/scenarios/robustness/index.ts:765-776` and the design note at `:759-764`) is: does the engine report the gapless duration rather than the raw sample-table total?

**Why remotion-media-parser is correct and fast.** Its probe (`src/engines/remotion-media-parser/adapter.ts:348-417`) requests a *metadata-only* field set — `{ durationInSeconds, container, tracks, metadata, rotation }` (`:374-381`) — and runs the parser in the `'metadata-only'` tier (`:383`). For an ISO-BMFF input the parser's `durationInSeconds` comes from the movie header (`mvhd` / edit-list), i.e. the trimmed/gapless value, so the engine returns it without a full sample-table walk. The shard records the result as an **exact match: `durationDeltaSec == 0`** against golden 1.013s, well inside the strict ±1-frame tolerance `durationToleranceSec = 0.0417s` (`src/core/oracles.ts:159`). Because the tier reads only header fields over a streaming `webReader` (`env.configUsed: pipeline=streaming, fieldsTier=metadata-only, reader=webReader, backend=cpu-js`), it finishes in **8 ms** — the joint-fastest, and on the smallest read footprint.

**Why the oracle this satisfies is meaningful.** `goldenMetadata` (`src/core/oracles.ts:595-657`) is a real field-by-field comparison: container token (`:606`), duration within the per-container band (`:614-637`), and per-track codec/sampleRate/channels (`:642-686`). For an MP4 the container is *not* in the loose set (`LOOSE_DURATION_CONTAINERS = {ts, adts, hls}`, `:211`; m4a→mp4 via `resolveContainer` `:271`), so the **strict ±1-frame band applies** — the loose-band escape hatch is explicitly *not* engaged here. A delta of exactly 0 against the gapless golden is the strongest possible evidence on this oracle.

**Why mp4box ties on correctness.** `mp4box`'s probe (`src/engines/mp4box/adapter.ts:749-756`) parses only `moov` (`discardMdatDataProbe: true`) and `toNormalizedMetadata` derives `durationSec = info.duration / info.timescale` straight from `mvhd` (`src/engines/mp4box/adapter.ts:412-417`). That mvhd value is the trimmed movie duration, so mp4box also lands `durationDeltaSec == 0` at **8 ms**. It is a genuine co-winner on correctness and wall time; the only separation is the pipeline-shape tiebreaker (whole-file `MP4BoxBuffer` append vs the streaming metadata-only read), which is a marginal call.

## What each other framework did wrong

- **mp4box@2.3.0 (PASS, lost on tiebreak only):** Equal correctness (`durationDeltaSec=0`) and equal 8 ms wall. Lost solely on tiebreaker 4c: `pipeline=whole-file-append(MP4BoxBuffer+fileStart)` buffers the entire file vs the winner's streaming metadata-only read. This is a near-tie, not a defect.
- **remotion-webcodecs@4.0.479 (PASS):** Correct (`durationDeltaSec=0`) but **14 ms** — 1.75x slower than the leaders. It spins up the WebCodecs-oriented streaming-backpressure pipeline (`backend=webcodecs`, `pipeline=streaming-backpressure`) which is heavier than a pure header read for a probe-only op.
- **platform@chrome-149 (PASS):** Correct but with a tiny rounding delta `durationDeltaSec=0.0000070s` (still ≪ tol), at **16 ms** (2.0x slower). The platform path provisions a VideoDecoder/WebCodecs stack (`backend=webcodecs, hwAccel=true`) that is overkill for an AAC metadata probe.
- **mediabunny@1.48.0 (PASS):** Correct, delta `0.0000068s`, **16 ms** (2.0x slower). `streaming-lockstep` WebCodecs setup; same overprovisioning for a header-only read.
- **web-demuxer@4.0.0 (PASS):** Correct, delta `0.0000070s`, but **51 ms** (6.4x slower) — the WASM demuxer carries module/instantiation cost a pure-JS header read avoids.
- **ffmpeg.wasm@0.12.15 (PASS):** Correct but with the largest (still passing) delta `durationDeltaSec=0.0030s`, and by far the slowest at **308 ms** (38.5x slower) — full ffmpeg.wasm module load + ffprobe-style parse dominates wall time for a trivial probe.

No engine FAILed and no engine was NA — every adapter declares `probe` for the MP4/AAC family, which is honest (all seven legitimately parse ISO-BMFF metadata).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:765-776` — `id: 'edge_gapless_priming_probe'`, `op: 'probe'`, `asset: 'gapless_aac.m4a'`, `oracles: ['golden-metadata']`. The notes (`:773-775`) document the gating rationale: a priming-aware demuxer must report the trimmed gapless duration that the golden encodes; the stricter decoded-sample-count check is intentionally deferred to an honest-FAIL property-invariant (no audio-sample oracle exists yet). This is a candid, non-inflated gate.
- **Fixture is real:** `fixtures/media/gapless_aac.m4a` exists (14 KB on disk) — a genuine AAC/MP4 file, not synthetic/empty/mock. Golden `fixtures/golden/gapless_aac.m4a.meta.json` is a real metadata record (durationSec 1.013, AAC 44100/2ch, bitrate 96767) and is physically plausible for a ~1 s 96 kbps stereo AAC clip.
- **Oracle is real:** `golden-metadata` at `src/core/oracles.ts:595-657` performs an actual field comparison (container, duration with a strict ±0.0417s = 1-frame band for non-loose mp4 — `:159`, `:211`, `:240-254`, `:614-637`; plus codec/sampleRate/channels `:659-686`). It is NOT trivially satisfiable: the loose wide-band path is gated to ts/adts/hls/headerless-webm/no-TOC-mp3 and explicitly does not apply to this mp4 asset.
- **Winner adapter is genuine:** `src/engines/remotion-media-parser/adapter.ts:348-417` calls the real `@remotion/media-parser` parse with a metadata-only field set; it does not return canned output, copy input→output, or short-circuit to the golden. Duration comes from the parsed `durationInSeconds` (mvhd/edit-list). Co-leader mp4box (`src/engines/mp4box/adapter.ts:412-417`, `:749-756`) likewise derives duration from real parsed `mvhd` boxes.
- **Verdict:** **REAL** — real fixture + real (real-library) implementation + a meaningful structural/metadata oracle on the strict band, with the two leaders matching the gapless golden to `durationDeltaSec == 0`.
- **Cached note:** Every engine entry has `cached:true` ("cached previous PASS result"). The numbers were reused, not re-run in this pass, so the exact wall figures (and the 8 ms tie) carry staleness risk; the per-stat memory profile (`work-nonstop` launcher seeding caveat) was not regenerated. Correctness provenance (delta=0 vs golden) is robust regardless of caching.

## Confidence & caveats

- **Confidence: medium.** The PASS/correctness conclusion is solid (real fixture, real oracle, exact deltas, verified adapter code paths). The *winner pick* is low-confidence by nature: it is a genuine tie at 8 ms with mp4box on the only recorded metric, decided by a pipeline-shape tiebreaker rather than a measured margin.
- All entries are `cached:true` (n effectively 1 per engine, no mad/p95 spread in the shard) — a single-sample comparison; the 8 ms tie could flip on a fresh run.
- The shard lacks `bench{}`, `primaryMetric`, throughputRealtime, peakMemory, and longtasks for this scenario, so secondary performance axes could not corroborate the wall ranking.
- This scenario gates only the *reported duration* (gapless awareness at the metadata level); it does NOT verify priming-removed decoded sample counts (that stricter property is the deferred honest-FAIL property-invariant noted in the scenario). A WEAK-vs-REAL distinction would tighten if an audio-sample oracle existed; as written, the metadata gate is real but not the strongest conceivable test of gapless handling.
