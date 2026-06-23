# metadata/read_vp9_1080p_10s

- Family: `metadata` | Fixture: `fixtures/media/vp9_1080p_10s.webm` (9.3 MB, exists) | primaryMetric: `wall` (median ms) | passCount: 5 / 7

## Verdict

- Best framework: **remotion-webcodecs@4.0.479** (uncontested on correctness, decided on performance).
- Status: **CONTESTED** — 5 engines PASS, all satisfying the *identical* oracle (`golden-metadata`) at the *identical* strictness, so the decision falls to performance.
- Decisive factor: **wall-clock median**. remotion-webcodecs probed in **24.75 ms**, narrowly beating remotion-media-parser at **25.79 ms** (**1.04x faster**) and decisively beating the mediabunny / web-demuxer / ffmpeg.wasm cluster (~40.8–43.7 ms, ~1.65–1.77x slower) and platform/Chrome (6000.10 ms, ~242x slower).
- Margin over runner-up: **1.04x** wall (24.75 vs 25.795 ms) — a *thin* margin on `n=1` cached samples; see Confidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 24.75 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 25.795 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 40.775 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 40.87 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 43.69 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 6000.105 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

Note: this scenario declares only `metrics: ['wall']` (`src/scenarios/metadata/_shared.ts:93`), so throughputRealtime / peakMemory / longtasks are not collected — every cell is n/a by design, not missing data.

## Why the winner wins (deep technical)

This is a **structural-metadata READ** (`op: 'probe'`) over a real **VP9 video + Opus audio** elementary stream in a **WebM (EBML/Matroska) container** (`src/scenarios/metadata/index.ts:90-94`). The gate is `golden-metadata`, which compares container token, `durationSec` within a per-frame tolerance, and per-track `{type, codec, width, height, fps, sampleRate, channels}` positionally (`src/core/oracles.ts:595-686`). The golden (`fixtures/golden/vp9_1080p_10s.webm.meta.json`) asserts `container=webm`, `durationSec=10.008`, track[0] `vp9 1920x1080@30`, track[1] `opus 48000Hz/2ch`. Crucially the oracle does **not** read VP9 frames, packets, or tags — so no engine can win on bit-exact decoding here; correctness is "did you parse the EBML header structure correctly," and all five PASSing engines did, with `durationDeltaSec` of 0 (remotion-webcodecs, remotion-media-parser, mediabunny, web-demuxer) or 0.002 s / 0.007 s (ffmpeg.wasm / platform) against a tolerance of 0.0417 s (one 24 fps frame). With correctness tied, the win is purely the cost of getting that header.

remotion-webcodecs probes via `@remotion/media-parser`'s `parseMedia` requesting only `fields: {container, durationInSeconds, tracks, metadata}` (`src/engines/remotion-webcodecs/adapter.ts:346-355`). This is a streaming, fields-gated EBML walk: media-parser reads through the WebM `Segment → Info` (TimestampScale/Duration) and `Tracks` (TrackEntry/Video/Audio) elements and **stops** once the requested fields are satisfied, never decoding a single VP9 frame. It runs on `backend: webcodecs / streaming-backpressure` (from `env.configUsed`) but for a metadata-only read the WebCodecs decoder is never instantiated — the cost is just the byte-range read plus EBML parse, which is why it lands at 24.75 ms. Note the dedicated header-only WebM fast path (`webmHeaderMetadata` / `shouldUseHeaderOnlyWebmProbe`, `adapter.ts:1220-1237`, `1294-1309`) is **gated to durationSec >= 600 s** and therefore does **not** fire for this 10.008 s asset — the 24.75 ms came from the genuine full `parseMedia` path, not a shortcut. Container canonicalization re-reads a 256-byte prefix to disambiguate webm vs mkv via EBML DocType (`adapter.ts:1087-1096`), confirming `container=webm` matches golden.

The runner-up, remotion-media-parser, is the **same upstream `parseMedia` engine** without the WebCodecs convert layer (`env.configUsed.backend=cpu-js`, `fieldsTier=metadata-only`). It executes essentially the identical EBML field-gated parse, which is exactly why its 25.795 ms is statistically indistinguishable from the winner's 24.75 ms — the 1.04x gap is within `n=1` noise. The winner edges it only because the WebCodecs adapter's probe path shares the same parse but happened to measure marginally faster on this single sample. Mechanistically these two are co-equal on this read; remotion-webcodecs is named winner strictly by the recorded median.

The ~40 ms cluster (mediabunny 40.775, web-demuxer 40.87) and ffmpeg.wasm (43.69) all parse correctly but pay more: ffmpeg.wasm runs libavformat inside a wasm module (module/FS overhead even for a header probe); web-demuxer drives an ffmpeg-derived wasm demuxer; mediabunny does a pure-TS EBML parse but is ~1.65x slower than the media-parser path here. platform/Chrome at 6000.105 ms is an outlier: probing via the platform `<video>`/MediaSource path forces the browser to load and buffer enough of the resource to populate `duration`/track metadata, which for a 9.3 MB WebM costs ~6 s — ~242x the winner — making it correct but performance-disqualified.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on performance only. 25.795 ms vs 24.75 ms = 1.04x slower; identical `golden-metadata` pass (`durationDeltaSec=0`). Same upstream parseMedia engine; gap is within `n=1` noise, not a real capability difference.
- **mediabunny@1.48.0** — PASS but 40.775 ms (1.65x slower than winner). Same single golden-metadata pass (`durationDeltaSec=0`); pure-TS EBML parse is heavier on this read than the media-parser field-gated walk.
- **web-demuxer@4.0.0** — PASS but 40.87 ms (1.65x slower). golden-metadata `durationDeltaSec=0`. ffmpeg-derived wasm demuxer overhead for a header-only probe.
- **ffmpeg.wasm@0.12.15** — PASS but 43.69 ms (1.77x slower, slowest of the wasm/TS cluster). golden-metadata `durationDeltaSec=0.002 s` (well inside 0.0417 s tol). libavformat-in-wasm module + FS overhead even for a probe.
- **platform@chrome-149** — PASS but 6000.105 ms (~242x slower). golden-metadata `durationDeltaSec=0.007 s` (inside tol). The `<video>`/MediaSource probe path must buffer the resource to surface duration/tracks, a structural cost of the platform approach, not a bug.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'." **Honest NA.** MP4Box.js is an ISO-BMFF (MP4/MOV) parser and cannot read Matroska/WebM EBML; the adapter declares only `containersIn: ['mp4','mov']` (`src/engines/mp4box/adapter.ts:645`). Not an under-declared capability.

## Anti-cheat validation

- **Scenario**: `src/scenarios/metadata/index.ts:89-95` (built by `buildRead`, `src/scenarios/metadata/_shared.ts:81-96`). `op:'probe'`, `input:'vp9_1080p_10s.webm'`, `oracles:['golden-metadata']`, `metrics:['wall']`. Notes: "WebM Tags element — structural gate" (tag CONTENT is intentionally NOT gated; see HONEST SCOPE, index.ts:21-24).
- **Fixture**: `fixtures/media/vp9_1080p_10s.webm` exists, 9.3 MB — a real VP9/Opus WebM, not synthetic/empty/mock. Golden `fixtures/golden/vp9_1080p_10s.webm.meta.json` present with physically plausible values (1920x1080@30 vp9, 48 kHz/2ch opus, 10.008 s).
- **Oracle**: `goldenMetadata` `src/core/oracles.ts:595-686` performs a real field-by-field comparison (container, duration±tol, positional per-track codec/dims/fps/sr/ch). Not trivially satisfiable: any wrong container/codec/dimension/track-count or a duration delta > 0.0417 s fails. It is a metadata-EXACT (structural) gate, one rung below bit-exact on the correctness ladder — appropriate for a READ probe; no decoded-frame oracle is expected here.
- **Winner adapter**: `src/engines/remotion-webcodecs/adapter.ts:332-371`. `probe()` calls real `@remotion/media-parser` `parseMedia` (`adapter.ts:346`) with field gating, then `normalizeMetadata`/`normalizeTrack` (`adapter.ts:357-360, 1057-1085`). No canned output, no copy of golden, no swallowed errors. The header-only WebM shortcut is gated to >=600 s and does not apply to this 10 s asset.
- **Verdict**: **REAL** — real 9.3 MB fixture + genuine parseMedia implementation + a meaningful structural-metadata oracle with exact (`durationDeltaSec=0`) measurements.
- **Cached note**: ALL seven entries have `cached:true` ("cached previous PASS result"). The wall medians were reused, not re-run this session, and every bench is `n=1`. The PASS/correctness verdict is trustworthy (deterministic structural compare), but the 1.04x performance margin over remotion-media-parser is staleness- and noise-sensitive.

## Confidence & caveats

- Confidence: **medium**. Correctness verdict (5 PASS, mp4box honest NA) is high-confidence and verified against code/fixtures. The *winner* designation is low-confidence on its own: remotion-webcodecs and remotion-media-parser are the same upstream parseMedia engine and differ by only 1.04 ms (1.04x), on `n=1`, all cached. A re-run could flip the top two.
- The two clear, robust performance tiers ARE reliable: both remotion engines (~25 ms) clearly beat the wasm/TS cluster (~41–44 ms), which clearly beats platform/Chrome (6000 ms, ~242x).
- This gate cannot detect a VP9-decode or packet-level bug — it is metadata-structural only. A wrong-but-plausible track field would be caught; a frame-level demux defect would not.
