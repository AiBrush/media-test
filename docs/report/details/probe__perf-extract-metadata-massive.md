# probe/perf-extract-metadata-massive

- **Family:** probe
- **Fixture asset:** `fixtures/media/massive_h264_1080p_2h.mp4` (real, ~1.1 GB, H.264 1080p30 + AAC 48 kHz mono, 2 h / 7200 s, MP4/isom, ~1.2 Mbit/s low-bitrate, many-thousand-sample stbl)
- **Golden:** `fixtures/golden/massive_h264_1080p_2h.mp4.meta.json`
- **primaryMetric:** opsPerSec (probes/sec; secondary = wall ms)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — all 7 engines PASS the same `golden-metadata` oracle (identical 2-track match, durationDeltaSec = 0 for 6/7, 0.0213 s for platform; all well inside the ±0.0417 s = 1-frame band).
- **Decisive factor:** PERFORMANCE. Correctness is a tie (one and the same structural/metadata-exact oracle, same result for everyone), so the primaryMetric `opsPerSec` decides. Mediabunny is fastest at **22.70 ops/s** (wall median 44.06 ms).
- **Margin over runner-up:** runner-up is `remotion-media-parser@4.0.479` at 14.19 ops/s / 70.49 ms wall. Mediabunny is **~1.60x more probes/sec** and **~1.60x lower wall** (44.06 ms vs 70.49 ms). Evidence is weak in the statistical sense: n = 1, mad = 0, p95 = median for every engine (single sample), so the ranking is a single-shot measurement, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | opsPerSec | reason |
|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 44.06 | 22.70 | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 70.49 | 14.19 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 75.09 | 13.32 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 440.31 | 2.27 | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:true | 2060.70 | 0.49 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 4925.19 | 0.20 | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 8999.84 | 0.11 | cached previous PASS result |

(No throughputRealtime / peakMemory / longtasks metrics are emitted for this probe scenario — bench carries only `opsPerSec` and `wall`.)

## Why the winner wins (deep technical)

This scenario is explicitly designed (scenario notes, `src/scenarios/probe/index.ts:403-406`) so that a correct probe must be **O(header), not O(samples)**: the 2 h MP4 has a many-thousand-entry sample table (`stsz`/`stco`/`stts`/`ctts`), and any engine that resolves duration or track facts by *walking the sample table* both slows down and risks OOM. The winner is the engine whose probe touches only the front-of-file `moov`/`mvhd`.

**Mechanism in mediabunny.** The adapter's probe path is `metadataFromInput` (`src/engines/mediabunny/adapter.ts:417-453`). Duration is resolved by the cheap metadata path FIRST: `input.getDurationFromMetadata()` (`adapter.ts:429`) reads the container's declared duration straight from `mvhd`/`mdhd` without scanning samples; only if that returns null/non-finite does it fall back to `input.computeDuration()` (`adapter.ts:436`), which would walk fragments. For this faststart MP4 the cheap path returns 7200 s immediately, so `computeDuration()` is never invoked — that is exactly what keeps wall at 44 ms on a 1.1 GB file. Track facts come from `input.getTracks()` + `normalizeTrack` (`adapter.ts:443-447`, `:297`), reading the `stsd`/`avcC`/`esds` boxes, not packets. Crucially the input is opened with `UrlSource` (`openInput`, `adapter.ts:245-275`, lines 250/268), so mediabunny issues HTTP Range reads for just the header region rather than buffering the whole gigabyte. The combination — range-read header + metadata-first duration — is why it lands at 22.70 ops/s, the top of the field.

**Oracle measurements (real, from the shard).** `golden-metadata` passed with `detail: "metadata matches golden (2 track(s))"`, `durationDeltaSec = 0`, `durationToleranceSec = 0.0416666…` (the strict per-frame band at 30 fps). The oracle (`src/core/oracles.ts:595-657`) does a genuine field-by-field compare: container (`mp4` vs golden `mp4`), duration within the ±1-frame band, and positional per-track codec/width/height/fps/sampleRate/channels via `compareTrack` (`oracles.ts:659-682`). The golden (`massive_h264_1080p_2h.mp4.meta.json`) asserts video h264 1920x1080@30 and audio aac 48000/1ch over 7200 s — physically consistent with a 2 h low-bitrate 1080p clip. mediabunny matched all of it with zero duration error, so the PASS reflects correctly-read header metadata, not a loose tolerance.

Correctness is identical across all 7 engines (same oracle, same zero/near-zero delta), so this scenario is decided on speed, and mediabunny's header-only range-read path is the fastest header reader in the set.

## What each other framework did wrong

- **remotion-media-parser@4.0.479 (PASS, runner-up):** correct (golden-metadata, durationDelta 0) but slower — 14.19 ops/s vs 22.70 (**0.625x the throughput**, +26.4 ms wall). It uses `cpu-js` `webReader` streaming with a `metadata-only` fields tier (env.configUsed); a fetch/`webReader` stream pull is heavier per probe than mediabunny's targeted Range header read. Pure speed gap, no correctness deficit.
- **remotion-webcodecs@4.0.479 (PASS):** correct but 13.32 ops/s (**0.587x**, 75.09 ms). Its `streaming-backpressure` WebCodecs convert path with `bufferWriter` carries more setup than a bare header probe; the declared `mp4-sample-table:http-range` fast path narrows the gap to RMP but still trails mediabunny.
- **web-demuxer@4.0.0 (PASS):** correct but 2.27 ops/s (**0.10x**, 440 ms). It is a libav/wasm demuxer; even a metadata probe pays wasm module/context overhead per op, ~10x slower than mediabunny.
- **mp4box@2.3.0 (PASS):** correct but 0.49 ops/s (**0.021x**, 2060 ms). env.configUsed = `whole-file-append(MP4BoxBuffer+fileStart)`, `rangeReads:false` — it appends the *entire* file to the parser before reporting metadata. On a 1.1 GB file that whole-file buffering is the dominant cost; it discards mdat data for the probe (`discardMdatDataProbe:true`) but still streams the full byte range in, hence ~2 s per probe.
- **ffmpeg.wasm@0.12.15 (PASS):** correct but 0.20 ops/s (**0.009x**, 4925 ms). `ffprobe`-equivalent in wasm must mount/read the file into the wasm FS and spin the libav demuxer; per-probe wasm + FS cost dominates on a gigabyte input.
- **platform@chrome-149 (PASS):** correct (golden-metadata, durationDelta 0.0213 s, inside the ±0.0417 s band) but slowest at 0.11 ops/s (**0.005x**, 8999 ms). The platform path uses an `<video>`/HTMLMediaElement-style load to surface duration+track info; the element effectively loads/seeks across the 2 h file before metadata stabilizes, ~200x slower than mediabunny. Its non-zero (but in-band) duration delta also hints it derives duration less precisely than the boxes-read engines.

No engine FAILed and none are NA — `probe` on H.264/AAC MP4 is a core declared capability for all 7 (requires: operations:['probe'], containersIn:['mp4'], videoCodecs:['h264'], audioCodecs:['aac'] in the scenario), so the full field competed honestly.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/probe/index.ts:398-407` (case `perf-extract-metadata-massive`), generated into a Scenario at `index.ts:412-428` (oracles:['golden-metadata'], metrics:[opsPerSec, wall], primaryMetric opsPerSec).
- **Fixture exists & is real:** `fixtures/media/massive_h264_1080p_2h.mp4`, ~1.1 GB on disk (stat confirmed). Not synthetic/empty/mock — a genuine 2 h 1080p H.264/AAC MP4.
- **Golden exists & is plausible:** `fixtures/golden/massive_h264_1080p_2h.mp4.meta.json` (h264 1920x1080@30, aac 48000/1ch, 7200 s) — physically consistent with the asset.
- **Oracle:** `goldenMetadata` at `src/core/oracles.ts:595-657` (track compare `compareTrack` at `:659-682`). Real comparison of container + duration (strict ±1-frame band, here 0.0417 s) + per-track codec/dims/fps/sampleRate/channels. NOT a smoke gate, NOT a wide-open tolerance: the measured `durationDeltaSec = 0` against a 0.0417 s band is a tight, real pass.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:417-453` (probe) — calls the real mediabunny library (`input.getDurationFromMetadata`, `input.getTracks`, `UrlSource` range reads at `:245-275`). No canned output, no copy-input-to-output, no short-circuit to golden, no error-swallow-then-report-success. The metadata-first/`computeDuration` fallback is a genuine cheap-path optimization, not a cheat.
- **Verdict: REAL.** Real gigabyte fixture + real library probe + a meaningful metadata-exact oracle with a strict (1-frame) duration tolerance that the measurement comfortably satisfies.
- **Cached note:** ALL 7 entries have `cached:true` ("cached previous PASS result"). The PASS verdicts and the opsPerSec ranking are reused from a prior run, not freshly re-executed. Per the launcher-seeding caveat, cached results carry staleness risk — the correctness conclusion is robust (golden is deterministic), but the precise opsPerSec margins are from an earlier run and were not re-timed here.

## Confidence & caveats

- **Confidence: medium.** Winner correctness is unambiguous and the implementation is verified real. The performance ranking direction (mediabunny fastest, header-only range read) is mechanistically sound and consistent with the engines' architectures.
- **Caveats:** (1) Every metric is n = 1, mad = 0, p95 = median — single-shot timings, so the 1.60x margin over RMP is suggestive, not statistically tight. (2) All entries are `cached:true`; numbers are reused, not re-run. (3) This probe scenario emits only `opsPerSec`/`wall` — no peakMemory/longtasks/throughputRealtime to corroborate the O(header) claim quantitatively (the memory advantage is inferred from the adapter code paths, not a measured peakMemory). (4) The ~1.60x lead is real but modest vs RMP/remotion-webcodecs (both also header-tier readers); mediabunny's edge is the UrlSource Range read + metadata-first duration, not a fundamentally different algorithm.
