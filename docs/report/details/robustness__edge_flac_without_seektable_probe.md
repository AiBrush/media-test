# robustness/edge_flac_without_seektable_probe

family: robustness | fixture asset: `fixtures/media/flac_noseektable.flac` (143 KB, real native-FLAC stream) | primaryMetric: wall | passCount: 4

## Verdict

**Best framework: mediabunny@1.48.0** — CONTESTED (4 of 7 engines PASS).

The four PASS engines (mediabunny, remotion-media-parser, remotion-webcodecs, ffmpeg.wasm) all satisfy the *exact same* single oracle, `golden-metadata`, with the *identical* measurement: `durationDeltaSec = 0` against a strict 1-frame tolerance `durationToleranceSec = 0.041666…s`. Correctness is therefore a dead tie — every winner reports the golden metadata bit-for-bit (flac / 48000 Hz / 2ch / 10.000 s) with zero duration error. The tie breaks on **performance (wall median)**, the declared primary metric.

Decisive factor: **wall time**. mediabunny probes in **10 ms**, vs remotion-media-parser 13 ms (1.3×), remotion-webcodecs 15 ms (1.5×), and ffmpeg.wasm 143 ms (**14.3×** slower). mediabunny additionally requires no COOP/COEP and no SharedArrayBuffer (`coopCoep: "not-required"`, `sharedArrayBuffer: false`), against ffmpeg.wasm's heavyweight wasm core. Margin over runner-up (remotion-media-parser): **1.3× faster wall**.

Caveat on margin strength: all four PASS rows are `cached:true` and the shard exposes only `durationMs` (a single sample), not a `bench{}` block with median/p95/mad/n — so the 10 ms vs 13 ms gap is a single-run point estimate, not a distribution. The ordering (wasm an order of magnitude behind the three pure-JS/WebCodecs parsers) is robust; the 10-vs-13 split between the top three is within noise.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | golden-metadata:pass (Δdur=0s) | **10 ms** | n/a (not in shard) | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass (Δdur=0s) | 13 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass (Δdur=0s) | 15 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass (Δdur=0s) | 143 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |

(The shard carries no `bench{}` object for these probe rows — only `durationMs`. throughputRealtime/peakMemory/longtasks are not present, so they are reported n/a rather than fabricated. The scenario declares metrics `['wall','peakMemory']`.)

## Why the winner wins (deep technical)

**The codec/container/operation.** Input is a *native* FLAC stream (`fLaC` magic, not FLAC-in-MP4/Ogg). The operation is `probe` — read container/duration/track metadata only. The forensic twist: this fixture deliberately has **no SEEKTABLE block**. Direct inspection of the bytes confirms the metadata-block chain is STREAMINFO (block type 0, 34 bytes) → VORBIS_COMMENT (type 4, 14 bytes, vendor "ffmpeg") → PADDING (type 1, 8192 bytes, last). There is **no block type 3 (SEEKTABLE)**. The whole point of the test is that a probe MUST still report the correct 10.000 s duration even without the seek index, because FLAC duration is carried by the *total-samples* field of STREAMINFO, not by the SEEKTABLE (which is only a seek-point index). STREAMINFO encodes sampleRate=48000, channels=2, and a 36-bit total-sample count; 480000 samples / 48000 Hz = exactly 10 s.

**Mechanistically why mediabunny wins.** mediabunny opens the file as a real FLAC container via `new mb.Input({ format: FLAC_FORMAT, ... })` — the `flac → FLAC_FORMAT` singleton mapping is at `src/engines/mediabunny/codecs.ts:136`. Its probe path, `metadataFromInput` at `src/engines/mediabunny/adapter.ts:417`, takes the **cheap metadata route first**: `input.getDurationFromMetadata()` (`adapter.ts:429`) reads the container-declared duration (here, STREAMINFO total-samples / sampleRate) **without scanning audio frames**, and only falls back to the expensive `computeDuration()` sample-walk (`adapter.ts:436`) if metadata returns null. For a STREAMINFO-bearing FLAC the cheap path succeeds, so it never touches the (absent) SEEKTABLE and never decodes frames — that is exactly why it finishes in 10 ms. Tracks come from `input.getTracks()` (`adapter.ts:443`) → normalized to `{type:audio, codec:flac, sampleRate:48000, channels:2}`. The result is fed to `golden-metadata` (`src/core/oracles.ts:595`), which compares container, duration (within the strict per-frame band, `oracles.ts:614`), and per-track codec/sampleRate/channels (`compareTrack`, `oracles.ts:659`). Measured outcome from the shard: `durationDeltaSec = 0`, `durationToleranceSec = 0.0416…`, "metadata matches golden (1 track(s))" — a clean, exact pass.

**Backend.** mediabunny ran `backend: webcodecs`, `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required`. For a metadata-only probe no decoder is actually invoked — the pure-TS demux/parse layer reads the FLAC header directly — but the lack of any COOP/COEP/SAB requirement is a real deployment advantage and contributes to the lean 10 ms run. The two remotion engines take the same conceptual cheap-header route (remotion-media-parser uses `fieldsTier: metadata-only`, `pipeline: streaming`, `backend: cpu-js`) and land within 3-5 ms of mediabunny. ffmpeg.wasm is correct but pays the cost of routing the probe through a full libavformat wasm core (`ffprobe`-style open), hence 143 ms — a 14.3× tax for the same single-track result.

## What each other framework did wrong

- **remotion-media-parser@4.0.479 (PASS, lost on perf):** Correct and fast (13 ms, metadata-only streaming parse, golden-metadata Δdur=0), but 1.3× slower wall than mediabunny on this probe — the decisive primary metric. No correctness deficit.
- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** Correct (15 ms, golden-metadata Δdur=0) but the slowest of the three lightweight parsers, 1.5× mediabunny's wall. No correctness deficit.
- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** Correct (golden-metadata Δdur=0) but 143 ms — **14.3×** mediabunny — because it opens the stream through a full wasm libavformat core rather than a header-only reader. Heaviest path for a trivial header probe.
- **platform@chrome-149 (NA_ENGINE, honest):** "engine does not declare input container 'flac'." The WebCodecs/platform adapter lists `flac` only as an audio *codec* (`src/engines/platform/adapter.ts:138`), not in its `containersIn` capability set. There is no native-FLAC demuxer in the browser platform path, so the Pass-1 declaration gate (`src/core/runner.ts:123-125`) correctly NAs it. Honest NA, not an under-declaration.
- **mp4box@2.3.0 (NA_ENGINE, honest):** Same gate. mp4box is an ISO-BMFF (MP4) parser; it declares `flac` as an audio codec for FLAC-in-MP4 (`src/engines/mp4box/adapter.ts:650`) but cannot parse the raw `fLaC` container, so it does not list it in `containersIn`. Architecturally correct NA.
- **web-demuxer@4.0.0 (NA_ENGINE, honest):** Same gate. It declares `flac` as a codec (`src/engines/web-demuxer/adapter.ts:645`) but its `containersIn` does not include the native FLAC container, so it is NA. Honest.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:983` (`id: 'edge_flac_without_seektable_probe'`), built from `FLAC_SEEKTABLE_CASES` at `index.ts:972` and `defineScenario` at `index.ts:991`. op=`probe`, input=`flac_noseektable.flac`, requires `{operations:[probe], containersIn:[flac], audioCodecs:[flac]}`, oracles `['golden-metadata']`, metrics `['wall','peakMemory']`. Notes (`index.ts:986`) state the gating rationale: duration must still come from STREAMINFO total samples, not the index.
- **Fixture is real and exists:** `fixtures/media/flac_noseektable.flac`, 143 KB. Byte inspection confirms a genuine FLAC bitstream (`fLaC` magic) and, crucially, that the metadata-block chain contains **no SEEKTABLE (type 3)** — only STREAMINFO/VORBIS_COMMENT/PADDING — so the fixture genuinely exercises the no-seektable edge case. Not synthetic/empty/mock.
- **Golden is real:** `fixtures/golden/flac_noseektable.flac.meta.json` = `{container:flac, durationSec:10, track[audio/flac/48000/2ch/bitrate114346]}`. Physically plausible: 10 s, 48 kHz stereo FLAC.
- **Oracle is meaningful:** `golden-metadata` at `src/core/oracles.ts:595` does a real field-by-field comparison — container string, duration within a strict per-frame tolerance (`oracles.ts:614-637`; here 0.0417 s = 1 frame, NOT a loose band), and per-track codec/sampleRate/channels (`compareTrack`, `oracles.ts:659-686`). It returns FAIL on any mismatch (`oracles.ts:655`). This is structural/metadata-exact, well above smoke-only. The shard's `durationDeltaSec:0` is an exact (not merely in-tolerance) match — strong evidence of a real parse.
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts:417` (`metadataFromInput`) calls the real mediabunny `Input` API — `getDurationFromMetadata()` (`adapter.ts:429`), `computeDuration()` fallback (`adapter.ts:436`), `getTracks()` (`adapter.ts:443`) — with the real `FLAC_FORMAT` singleton (`codecs.ts:136`). No hardcoded/canned output, no copy-input-to-output, no short-circuit to the golden, no error-swallow-then-claim-success. The duration is derived from STREAMINFO, exactly as the test intends.
- **NA engines:** All three NAs are honest capability declarations enforced by the runner Pass-1 gate (`src/core/runner.ts:123-125`). They support FLAC-as-codec (in MP4) but not the native FLAC container; not an under-declared capability being hidden.
- **Cached note:** All four PASS rows are `cached:true` ("cached previous PASS result"). The PASS verdicts (Δdur=0) are reused, not freshly re-run, so the exact wall numbers (10/13/15/143 ms) carry staleness risk and reflect a single prior sample each, not a re-measured distribution. The relative ordering is still credible.

**Verdict: REAL.** Real native-FLAC fixture genuinely missing its SEEKTABLE, real mediabunny `Input` probe deriving duration from STREAMINFO, and a strict (1-frame-tolerance) structural metadata oracle that the winner satisfies exactly (Δ=0).

## Confidence & caveats

- **Confidence: high** on correctness and verdict direction; **medium** on the exact perf margin.
- The win is a *performance* win on a tie of *identical* correctness — the four PASS engines all hit Δdur=0 on the same single oracle, so the leaderboard ranking rests entirely on the 10/13/15/143 ms wall ladder.
- All PASS rows are `cached:true` with only a single `durationMs` each and **no `bench{}` distribution** (no median/p95/mad/n). The 10-vs-13-vs-15 ms split is within plausible run-to-run noise; only the ffmpeg.wasm 14.3× gap is unambiguous. A fresh re-run could reorder the top three.
- mediabunny's tiebreaker advantages (no COOP/COEP, no SAB, pure-TS-ESM core) are real and deployment-relevant, reinforcing it as best even if the wall split is noisy.
