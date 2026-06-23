# probe/vp9_1080p_10s

- family: probe
- fixture asset: `fixtures/media/vp9_1080p_10s.webm` (real WebM, 9.3 MB, VP9 video + Opus audio)
- golden: `fixtures/golden/vp9_1080p_10s.webm.meta.json`
- primaryMetric: wall (no `opsPerSec` declared for this golden-metadata case; ranked on wall median)
- passCount: 6 of 7

## Verdict

- Best framework: **remotion-webcodecs@4.0.479**
- Contested: **YES** — 6 engines PASS the same single gating oracle (`golden-metadata`), so correctness strength is identical and the decision falls to performance.
- Decisive factor: **wall-clock latency**. All 6 passing engines satisfy the exact same oracle (one `golden-metadata` pass, 2 tracks) with no stricter/looser variant, so the correctness ladder cannot separate them. On the perf tie-breaker remotion-webcodecs has the lowest wall median: **16.505 ms**.
- Margin over runner-up: vs mediabunny (27.78 ms) = **1.68x faster wall**. vs the third tier (web-demuxer 41.83 ms / ffmpeg.wasm 41.94 ms / remotion-media-parser 42.04 ms) ≈ **2.53x–2.55x faster**. The platform (Chrome) engine is **364x slower** (6000.51 ms). All measurements are n=1 (single sample, mad=0, p95==median) — see caveats; the win is real but on thin statistical evidence.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass (Δdur 0.0000s) | 16.505 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass (Δdur 0.0000s) | 27.780 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass (Δdur 0.0000s) | 41.830 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass (Δdur 0.0020s) | 41.940 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass (Δdur 0.0000s) | 42.040 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass (Δdur 0.0070s) | 6000.510 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

(throughputRealtime / peakMemory / longtasks are not present in this shard's `bench{}` — only `wall` was measured for this golden-metadata probe case.)

## Why the winner wins (deep technical)

This is a **probe** of VP9 video + Opus audio inside a **Matroska/WebM (EBML)** container. The op only needs the container metadata: top-level `Segment > Info` (TimestampScale + Duration) and `Segment > Tracks` (per-`TrackEntry` CodecID/PixelWidth/PixelHeight/SamplingFrequency/Channels). It does NOT require decoding a single VP9 frame, walking the Opus packet stream, or building a sample/cue index. The golden (`vp9_1080p_10s.webm.meta.json`) asserts container=`webm`, durationSec=10.008, a VP9 1920x1080@30 video track and an Opus 48000Hz/2ch audio track — all of which live in the EBML header, near the front of the file.

The `golden-metadata` oracle (`src/core/oracles.ts:595`) compares container string, duration (within a ±1/24 s ≈ 0.0417 s band — `durationToleranceSec` 0.041666... in every engine's measurements), and per-track codec/dims/fps/sampleRate/channels positionally (`compareTrack`, `src/core/oracles.ts:659`). remotion-webcodecs reports the metadata with `durationDeltaSec: 0` — an exact duration match — and passes with "metadata matches golden (2 track(s))".

Mechanistically, remotion-webcodecs wins on latency because its probe path (`src/engines/remotion-webcodecs/adapter.ts:332`) is a **streaming, header-only EBML read** via @remotion/media-parser. It requests only `fields: { container, durationInSeconds, tracks, metadata }` (`adapter.ts:346-355`), which media-parser satisfies by parsing the front-of-file Segment/Info/Tracks elements and stopping — it never attaches sample callbacks (those, per the adapter's own demux comment at `adapter.ts:380`, are what force a full parse). The adapter ALSO has a hand-rolled EBML header parser (`webmHeaderMetadataFromPrefix`, `adapter.ts:1294`) that walks `EBML_ID.Segment/Info/Tracks/TrackEntry` directly off a file prefix; for this 10 s clip the dedicated header-only shortcut (`shouldUseHeaderOnlyWebmProbe`, `adapter.ts:1231`) does NOT fire — it gates on `durationSec >= 600` (`adapter.ts:1236`), so it is reserved for the huge/massive VP9 buckets. Here the EBML parser is used only to recover `headerFps` (`adapter.ts:344`) and the authoritative metadata comes from media-parser's own streaming parse. Either way the work is O(header), not O(samples), which is why 16.5 ms is achievable on a 9.3 MB file with `backend: cpu-js`, `pipeline: streaming`, `reader: webReader`, `fieldsTier: metadata-only`.

mediabunny (27.78 ms, runner-up) is also a pure-TS streaming reader (`backend: webcodecs`, `coopCoep: not-required`, `coreBuild: pure-ts-esm`) and likewise probes from the header with `durationDeltaSec: 0` — it is correct and fast, just 1.68x slower wall on this read, plausibly its EBML/Matroska element walk plus WebCodecs config setup carrying slightly more constant overhead. The 41–42 ms tier (web-demuxer, ffmpeg.wasm, remotion-media-parser) is roughly 2.5x slower: ffmpeg.wasm and web-demuxer pay WASM module/FS init and a libav(format) open even for a header read (ffmpeg.wasm's Δdur of 0.0020 s reflects libavformat's own duration estimate vs the golden, still well inside the 0.0417 s band), and remotion-media-parser at 42.04 ms is the metadata-only variant of the same media-parser core but without the webcodecs adapter's fast wiring. The platform/Chrome engine is in a different regime entirely (6000.51 ms): its probe is built on the `<video>` element / WebCodecs demux stack (`encode: <video>→canvas→MediaRecorder`), so even a metadata read drags in element load/seek-to-ready latency — 364x the winner — although it still lands a correct probe (Δdur 0.0070 s).

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed correctly (golden-metadata, Δdur 0.0000s) but lost the perf tie-break: wall 27.78 ms vs winner 16.505 ms = **1.68x slower** on the same header-only read. No correctness deficit; pure latency gap.
- **web-demuxer@4.0.0** — PASSed correctly (Δdur 0.0000s) but wall 41.83 ms = **2.53x slower** than the winner; pays WASM/libav init overhead for what is fundamentally a header parse.
- **ffmpeg.wasm@0.12.15** — PASSed (Δdur 0.0020s, within the 0.0417 s band) but wall 41.94 ms = **2.54x slower**; libavformat open + WASM startup dominate a metadata-only op.
- **remotion-media-parser@4.0.479** — PASSed correctly (Δdur 0.0000s) but wall 42.04 ms = **2.55x slower** than its sibling webcodecs adapter; same media-parser core, metadata-only tier, lacking the webcodecs adapter's faster path/constants.
- **platform@chrome-149** — PASSed (Δdur 0.0070s) but wall 6000.51 ms = **364x slower**; the `<video>`/WebCodecs-element probe pipeline incurs media-element readiness latency that swamps the actual header read.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". This is an **HONEST** NA, not an under-declared capability: mp4box is an ISOBMFF (MP4/MOV) box parser and cannot parse EBML/Matroska. Its adapter declares `containersIn: ['mp4', 'mov']` (`src/engines/mp4box/adapter.ts:645`) and explicitly notes non-mp4 targets are impossible (`adapter.ts:911`). Correctly negotiated NA rather than a fabricated pass or a crash.

## Anti-cheat validation

- Scenario definition: `src/scenarios/probe/index.ts:101` — `{ asset: 'vp9_1080p_10s.webm', container: 'webm', videoCodecs: ['vp9'], audioCodecs: ['opus'] }`, built into a scenario at `src/scenarios/probe/index.ts:335` with `op: 'probe'`, `oracles: ['golden-metadata']`, `metrics: ['wall']`. Gating rationale (file header comment, lines 36-50): one correctness-gated probe per corpus container; codecs declared so an engine that cannot parse the bitstream negotiates NA honestly rather than FAILing.
- Fixture exists and is real: `fixtures/media/vp9_1080p_10s.webm` — 9.3 MB, `file` reports `WebM`. Not synthetic/empty/mock. Golden `fixtures/golden/vp9_1080p_10s.webm.meta.json` is physically plausible (durationSec 10.008; VP9 1920x1080@30; Opus 48000/2ch; bitrate 7428992; encoder tag "Lavf").
- Oracle: `golden-metadata` at `src/core/oracles.ts:595`. It performs a REAL field-by-field comparison — container string (`:606`), duration within ±1/24 s (`:614-637`), and positional per-track codec/dims/fps/sampleRate/channels via `compareTrack` (`:659`). Not trivially satisfiable: the duration band is a tight ±0.0417 s (not loose for `webm`), and a wrong codec/dimension/track-count FAILs. The winner's measurements (durationDeltaSec 0.0000, 2 tracks matched) are consistent with a genuine header parse of this exact file.
- Winner adapter: `src/engines/remotion-webcodecs/adapter.ts:332` (`probe`) calls the real @remotion/media-parser `mp.parseMedia` (`:346`) requesting only header fields, plus a real EBML walker `webmHeaderMetadataFromPrefix` (`:1294`). No canned output, no copy-input-to-output, no short-circuit to the golden file, no error-swallowing. The op is genuinely implemented against the library.
- Verdict: **REAL** — real fixture + real implementation + meaningful, tight oracle. The only weakening factor is statistical, not validity: every metric is n=1.
- Cached note: the winner's result has **cached==true** ("cached previous PASS result"). It was reused, not re-run for this report; combined with n=1, the 16.5 ms figure carries staleness/variance risk, though the PASS itself is genuine.

## Confidence & caveats

- Confidence: **medium**. The PASS and the implementation are real (REAL verdict), but the ranking rests entirely on a perf tie-break where every engine's wall is a single cached sample (n=1, mad=0, p95==median). A 1.68x gap over mediabunny on n=1 is suggestive but not statistically robust; a re-run with more samples could narrow or reorder the top two.
- All 6 passing engines clear the identical single oracle, so there is no correctness-strength separation — the leaderboard order here is a pure latency ranking and should be read as such.
- The dramatic platform/Chrome result (6000 ms) and the mp4box NA are both well-explained and not anomalous.
- The header-only WebM fast path (`shouldUseHeaderOnlyWebmProbe`, gated at duration >= 600 s) does NOT apply to this 10 s clip, so the win comes from media-parser's ordinary streaming header read, not a special-cased shortcut.
