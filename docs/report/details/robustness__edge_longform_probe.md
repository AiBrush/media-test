# robustness/edge_longform_probe

- family: robustness
- fixture asset: `longform_1h_audio.m4a` (MP4/M4A container, AAC-LC audio, 48 kHz mono, ~64 kbps, 3600 s)
- op: `probe`
- primaryMetric: wall (only `durationMs` recorded per engine; no `bench{}` block present in shard)
- passCount: 7 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (all 7 engines PASS).
- **Decisive factor: performance (wall).** Correctness is a perfect tie — every engine passes the single gating oracle `golden-metadata` with the identical measurement `durationDeltaSec = 0` against `durationToleranceSec = 0.041666…` (the strict ±1-frame band). With correctness indistinguishable, the ranking falls to wall time, where mediabunny is fastest at **100 ms**.
- **Margin over runner-up:** mediabunny 100 ms vs remotion-webcodecs 119 ms = **1.19× faster** than the runner-up; vs the slowest passing engine (platform 398 ms) = **3.98× faster**. Caveat: every result is `cached==true` and there is no `bench{}` block, so this is a single recorded `durationMs` sample (n effectively 1) — weak performance evidence (see Confidence).

## Per-engine results

All 7 engines PASS the same oracle (`golden-metadata:pass`, durationDeltaSec=0, tol 0.041666s). No `bench{}` block exists in this shard, so throughputRealtime / peakMemory / longtasks were not recorded; the only timing field is `durationMs`, shown as "wall".

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 100 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 119 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 190 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 306 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 329 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 354 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 398 ms | n/a | n/a | n/a | cached previous PASS result |

## Why the winner wins (deep technical)

This scenario is a **cheap metadata probe of a multi-hour file**. The notes are explicit: "Multi-hour file: probe must report ~1h cheaply, not by scanning every sample (no OOM)." The fixture is a 30 MB M4A: an MP4/QuickTime container holding a single AAC-LC track at 48 kHz mono. The container carries a precise global duration in its `mvhd`/`mdhd` boxes (movie/media header), so a correct demuxer can report 3600 s by reading the header alone — it does **not** need to walk the ~169k AAC sample entries in the `stsz`/`stts`/`stco` tables, and certainly must not decode them. The oracle confirms every engine got it bit-on: `durationDeltaSec = 0` against the strict ±1-frame tolerance (0.041666 s = 1/24 s). Because M4A→MP4 is a precise-duration container, the oracle applies the STRICT band (not the loose ts/adts/hls band) — `resolveContainer` maps `.m4a`→`mp4` and `durationToleranceFor` returns the per-frame tolerance, so this is a genuinely tight gate, not a widened estimate band.

The reason mediabunny edges out the field is its probe code path. In `src/engines/mediabunny/adapter.ts:417` (`metadataFromInput`) the duration is taken via the **cheap metadata path first**: lines 428–433 call `input.getDurationFromMetadata()`, which reads the container's declared duration (the `mvhd` movie duration / `mdhd` media duration) **without scanning samples**. Only if that returns null/non-finite does it fall back to `input.computeDuration()` (adapter.ts:434–441), the precise scan that — per the in-code comment at lines 421–426 — would "walk every moof to find the last packet → wall-time + peak-memory inflation." For this `mvhd`-bearing M4A the cheap path returns 3600 s immediately, so mediabunny never touches the sample tables.

The source backing also matters. `openInput` (adapter.ts:245) wraps an unmutated file in `mb.UrlSource` (adapter.ts:266–271) — a **streaming, HTTP-range-capable** source — rather than buffering the whole 30 MB into memory. Combined with `getDurationFromMetadata`, the probe only fetches/parses the box hierarchy near the `moov` atom and the track headers, never the 30 MB `mdat`. mediabunny's `env.configUsed` confirms a pure-TS-ESM core, `coopCoep: "not-required"`, `sharedArrayBuffer: false` — no WASM init or cross-origin-isolation overhead on the critical path. That lean header-only parse is why it lands at 100 ms.

The runner-up, **remotion-webcodecs (119 ms, fieldsTier streaming, http-range fast paths)**, is essentially as good — only **19 ms / 1.19×** behind. It also avoids a full scan (its config advertises `mp4-sample-table:http-range` fast paths). The gap is small enough that, with single-sample cached timings, the two are near-indistinguishable; mediabunny's slightly leaner header-only path and lack of the MOV→MP4 ftyp-rewrite machinery give it the nose.

## What each other framework did wrong

All non-winners are CORRECT (each passes `golden-metadata` with durationDeltaSec=0); they simply lost on wall time. No FAIL, no NA — so each bullet is a performance gap, not a correctness defect:

- **remotion-webcodecs@4.0.479** — PASS, 119 ms. 1.19× slower than mediabunny (19 ms gap). Carries extra adapter machinery (MOV→MP4 ftyp rewrite, sample-table range fast paths) not needed for a header-only AAC probe.
- **web-demuxer@4.0.0** — PASS, 190 ms. 1.90× slower. WASM (libav-based) demuxer; pays module/instance overhead even for a metadata-only probe.
- **ffmpeg.wasm@0.12.15** — PASS, 306 ms. 3.06× slower. Single-thread ffmpeg.wasm: spinning up the WASM ffmpeg core and running its probe (ffprobe-equivalent) dominates the wall time for a trivial header read.
- **mp4box@2.3.0** — PASS, 329 ms. 3.29× slower. `env.configUsed.pipeline = "whole-file-append(MP4BoxBuffer+fileStart)"`, `rangeReads:false` — it appends the whole file to the MP4Box buffer rather than streaming/range-reading, the opposite of the cheap-probe strategy, though it still extracts duration from `moov` without decoding samples.
- **remotion-media-parser@4.0.479** — PASS, 354 ms. 3.54× slower. `backend: "cpu-js"`, `fieldsTier: "metadata-only"`, webReader streaming — correct and metadata-only, but the pure-JS box parser is slower than mediabunny's path here.
- **platform@chrome-149** — PASS, 398 ms. 3.98× slower (slowest). Uses the browser WebCodecs/`<video>` platform path; for a pure metadata probe the platform demux setup is the heaviest, with no advantage since no decode is required.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:180-188` — `id: 'edge_longform_probe'`, `op: 'probe'`, `asset: 'longform_1h_audio.m4a'`, `oracles: ['golden-metadata']`, notes require cheap (no-OOM, no-full-scan) duration on a multi-hour file. Edge battery is timeout-guarded (`timeoutMs: FUZZ_TIMEOUT_MS`), so a hang/full-scan would be caught.
- **Fixture exists & is real:** `fixtures/media/longform_1h_audio.m4a` is present, **30 MB**, and independently verified real media — `ffprobe` reports `format_name=mov,mp4,m4a,...`, `duration=3600.000000`. Not synthetic/empty/mock.
- **Golden is real & specific:** `fixtures/golden/longform_1h_audio.m4a.meta.json` declares `container:"mp4"`, `durationSec:3600`, one AAC track (48000 Hz, 1 ch, bitrate 64407, language und), `major_brand:isom` — physically plausible for a 1-hour mono AAC clip (64407 bps × 3600 s ≈ 29 MB, matching the 30 MB file).
- **Oracle is a real comparison, not trivially satisfiable:** `src/core/oracles.ts:595` (`goldenMetadata`) compares measured container, duration (within tolerance), and per-track codec/sampleRate/channels against the golden. For this asset the STRICT ±1-frame duration band applies (`resolveContainer` maps `.m4a`→`mp4` at oracles.ts:271; `durationToleranceFor` at oracles.ts:240 returns strict because `mp4` is not in `LOOSE_DURATION_CONTAINERS`). Measured tolerance in the shard is 0.041666 s — strict, not a wide catch-all. Every engine hit Δ=0 exactly, which is the expected result when reading a precise `mvhd` (not a fluke of loose tolerance).
- **Winner implementation is genuine:** `src/engines/mediabunny/adapter.ts:1133-1141` (`probe`) opens the real library Input and calls `metadataFromInput` (adapter.ts:417), which calls the real `input.getDurationFromMetadata()` (adapter.ts:429) with a fallback to `input.computeDuration()`. No hardcoded duration, no short-circuit to the golden file, no copied output. The `mvhd`-read returning 3600 s is the library doing real work.
- **Cached note:** ALL seven results carry `cached==true` ("cached previous PASS result"). The correctness verdict is robust (deterministic header read), but the timing values are reused single samples, not freshly re-run — staleness/precision risk on the ranking margin (see launcher seeding caveat).
- **Verdict: REAL.** Real 30 MB AAC/M4A fixture, real golden, a genuinely strict duration oracle (Δ=0 vs ±1-frame), and a genuine header-only library probe path. The only weakness is timing provenance (cached, n≈1), which affects the strength of the *performance* ranking, not the validity of the PASS.

## Confidence & caveats

- **Confidence: medium.** The PASS/correctness conclusion is high-confidence (verified fixture, golden, oracle, and adapter code). The *winner ranking* is medium because (a) all results are cached, (b) there is no `bench{}` block, so each wall figure is a single `durationMs` sample with no median/p95/mad/n to gauge variance, and (c) the top two (100 ms vs 119 ms, 1.19×) are within plausible run-to-run noise for a sub-200 ms operation.
- Correctness cannot separate the engines at all — it is a 7-way tie on the single oracle — so the verdict rests entirely on a thin, cached timing margin. If re-run fresh, remotion-webcodecs could plausibly overtake mediabunny.
- No throughputRealtime / peakMemory / longtasks data was recorded, so the scenario's stated "no OOM / no full scan" intent cannot be directly confirmed from metrics; it is inferred from the adapters' code paths (mediabunny's `getDurationFromMetadata` cheap path; mp4box's whole-file-append being the riskiest but still passing).
