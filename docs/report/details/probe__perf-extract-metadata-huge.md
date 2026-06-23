# probe/perf-extract-metadata-huge

- **family:** probe
- **fixture asset:** `huge_h264_1080p_600s.mov` (real file, 448 MB, H.264 1080p30 + AAC 48 kHz stereo, QuickTime `qt  ` brand, 600 s)
- **primaryMetric:** opsPerSec (probes/sec); secondary `wall` (ms)
- **passCount:** 7 / 7 (all engines PASS)

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (all 7 engines PASS the same oracle).
- **Decisive factor:** PERFORMANCE on `opsPerSec`. Correctness is a dead-even tie — every engine satisfies `golden-metadata` exactly (2 tracks, `durationDeltaSec` ≈ 0 against a 0.0417 s tolerance), so the ladder collapses to throughput. mediabunny posts the highest `opsPerSec` and the lowest `wall`.
- **Margin over runner-up:** mediabunny **141.94 ops/s** (wall 7.045 ms) vs runner-up remotion-media-parser **96.99 ops/s** (wall 10.31 ms) → **1.46x more probes/sec, 1.46x lower wall**. Against the rest the gap is enormous: 2.42x over remotion-webcodecs, 12.2x over web-demuxer, 130x over ffmpeg.wasm, 325x over mp4box, 993x over platform.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | opsPerSec | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 7.045 | 141.94 | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 10.31 | 96.99 | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 17.055 | 58.63 | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 86.18 | 11.60 | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 915.85 | 1.092 | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 2287.45 | 0.437 | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 7000.20 | 0.143 | n/a | n/a | cached previous PASS result |

(No `peakMemory`/`throughputRealtime`/`longtasks` series were emitted in this shard; bench carries only `opsPerSec` and `wall`, each n=1, warmup=1, mad=0.)

## Why the winner wins (deep technical)

This is the §8.1 headline probe at HUGE scale: repeatedly read container metadata from a self-contained ~448 MB QuickTime `.mov` carrying H.264/AVC1 video and AAC audio. The fixture is faststart (moov ahead of mdat — note the golden tag `major_brand: "qt  "` and the scenario note "Faststart moov keeps a correct probe a cheap front-of-file read even at huge size"). The correct, fast strategy is to parse the `moov`/`mvhd`/`stsd`/`trak` atoms at the front of the file and **never** touch the ~448 MB `mdat`. The scenario explicitly wants this to stay O(header), not O(samples).

The correctness gate is identical for everyone. `goldenMetadata` (src/core/oracles.ts:595) compares container, duration (±tolerance), and per-track codec/dims/fps/sampleRate/channels against `fixtures/golden/huge_h264_1080p_600s.mov.meta.json`. The shard shows all 7 engines reporting `durationDeltaSec` 0 (platform 0.0213) against `durationToleranceSec` 0.041666… (the strict ±1-frame band at 30 fps → 1/24 s ≈ 0.04167) and "metadata matches golden (2 track(s))". So `golden-metadata` cannot separate them — the contest is decided entirely on `opsPerSec`.

mediabunny wins because of its metadata-first duration path. Its `probe()` (src/engines/mediabunny/adapter.ts:1134) opens an `Input` and calls `metadataFromInput()` (adapter.ts:417), which reads duration via the **cheap** `input.getDurationFromMetadata()` (adapter.ts:429) — pulling the container's declared duration straight from `mvhd`/track headers **without scanning samples** — and only falls back to `computeDuration()` (which would walk fragments/sample tables) when metadata yields null (adapter.ts:434-441). It then reads tracks via `getTracks()` getters (adapter.ts:443). With a faststart moov, mediabunny's streaming reader touches only the front-of-file atoms, so the whole probe is a sub-10 ms header read: **7.045 ms wall → 141.94 ops/s**. It runs pure-TS ESM with no COOP/COEP requirement and no whole-file buffering (`pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false` from env.configUsed).

The runner-up, remotion-media-parser, uses the same conceptual approach (`backend: cpu-js`, `fieldsTier: metadata-only`, `reader: webReader`) and lands at 10.31 ms / 96.99 ops/s — a respectable header-only parse, but ~1.46x slower than mediabunny's tighter reader. remotion-webcodecs (17.06 ms, 58.63 ops/s) is its WebCodecs-oriented sibling with more setup overhead per probe. These three all stay O(header).

The losers all pay O(file) ingestion cost. mp4box's `parseToInfo()` (src/engines/mp4box/adapter.ts:712) drives an `ISOFile` by `appendBuffer(makeBuffer(bytes, 0))` then `flush()` (adapter.ts:731-732) — `pipeline: whole-file-append(MP4BoxBuffer+fileStart)`. Even with `discardMdatDataProbe:true` (which discards mdat *contents*) mp4box must still feed the entire 448 MB byte stream through its append/parse state machine, so it cannot beat the front-of-file shortcut: **2287 ms → 0.437 ops/s (325x slower than mediabunny)**. ffmpeg.wasm runs a full ffprobe-style demux inside single-thread wasm (915 ms, 1.09 ops/s, 130x slower). platform (`<video>`/MediaSource element route, env.configUsed.decode `VideoDecoder`, encode `<video>→canvas→MediaRecorder`) has to load the asset into the media element pipeline: **7000 ms → 0.143 ops/s (993x slower)** — by far the worst, exactly the O(file) penalty the scenario was designed to expose.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on speed. Header-only metadata parse (cpu-js, metadata-only tier) but 10.31 ms vs 7.045 ms → **1.46x slower wall, 0.68x the throughput**. No correctness gap; pure margin loss.
- **remotion-webcodecs@4.0.479** — PASS, lost on speed. 17.06 ms / 58.63 ops/s → **2.42x slower** than mediabunny. WebCodecs-oriented setup adds per-probe overhead beyond what a metadata read needs.
- **web-demuxer@4.0.0** — PASS, lost on speed. 86.18 ms / 11.60 ops/s → **12.2x slower**. Heavier demux init (wasm) per probe.
- **ffmpeg.wasm@0.12.15** — PASS, lost on speed. 915.85 ms / 1.09 ops/s → **130x slower**. Full ffprobe-style parse in single-thread wasm; pays codec/demux machinery cost a metadata read does not need.
- **mp4box@2.3.0** — PASS, lost on speed. 2287.45 ms / 0.437 ops/s → **325x slower**. `whole-file-append` forces ingesting all 448 MB through the parser even though only the faststart moov is needed (src/engines/mp4box/adapter.ts:731).
- **platform@chrome-149** — PASS, lost on speed. 7000.20 ms / 0.143 ops/s → **993x slower**, worst of all. The `<video>`/MediaSource element route loads the whole asset; this is precisely the O(file) anti-pattern the scenario stresses.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/probe/index.ts:387 (`id: 'perf-extract-metadata-huge'`), built into a Scenario at index.ts:412 with `op: 'probe'`, `oracles: ['golden-metadata']`, `metrics: [opsPerSec, wall]`, `primaryMetric: opsPerSec`. Notes (index.ts:392-396) document the gating rationale: score = probes/sec, correctness gated by golden-metadata, faststart moov keeps the probe a cheap front-of-file read.
- **Fixture:** `fixtures/media/huge_h264_1080p_600s.mov` exists, **448 MB real media** (verified via stat). Not synthetic/empty/mock. Golden `fixtures/golden/huge_h264_1080p_600s.mov.meta.json` present (container mov, 600 s, h264 1920x1080@30 + aac 48000/2).
- **Oracle:** `goldenMetadata` at src/core/oracles.ts:595-657 performs a real field-by-field comparison (container, duration ±strict band, per-track codec/dims/fps/sampleRate/channels via `compareTrack` at oracles.ts:659). Duration tolerance is the strict ±1-frame band (0.04167 s), not a wide catch-all. Measurements (`durationDeltaSec` 0 for all, platform 0.0213; 2 tracks) are physically plausible for this asset.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1134 `probe()` → metadataFromInput (adapter.ts:417) genuinely calls the mediabunny `Input` API (`getDurationFromMetadata`, `getTracks`, `getMetadataTags`). No canned output, no golden short-circuit, no error-swallow-as-success.
- **Cached note:** every engine result has `cached:true` ("cached previous PASS result"). Numbers are reused from prior runs, not re-measured here; per the launcher seeding caveat, stale-PASS reuse is a staleness risk. The relative ordering (header-parsers ≫ whole-file ingesters) is mechanistically sound and consistent across the LARGE/MASSIVE siblings, so the verdict is robust even though absolute ms could drift on a fresh run.
- **Verdict:** **REAL** — real 448 MB fixture, real library calls in the winning adapter, and a meaningful strict metadata oracle. (Caveat: all-cached evidence; not freshly re-run.)

## Confidence & caveats

- **Confidence: high** on the ranking direction. The win mechanism (front-of-file faststart moov read vs whole-file ingestion) is structural and matches the env.configUsed pipelines exactly (mediabunny streaming-lockstep / no COOP-COEP vs mp4box whole-file-append vs platform `<video>` element).
- **Caveats:** (1) bench n=1, warmup=1, mad=0 — single measured sample, so the 1.46x margin over remotion-media-parser is real but thin-evidence; the 12x–993x gaps over the rest are large enough to be decisive regardless. (2) All results `cached:true` — reused, not re-run (staleness risk). (3) No peakMemory/throughputRealtime/longtasks series emitted, so the perf comparison rests on opsPerSec + wall only. (4) Correctness is a true tie (identical exact golden-metadata pass), so this is a pure performance verdict, not a correctness verdict.
