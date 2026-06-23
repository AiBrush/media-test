# probe/vp8_720p_10s

- **family:** probe
- **fixture asset:** `fixtures/media/vp8_720p_10s.webm` (1.3 MB, real on disk) — VP8 video + Vorbis audio in WebM/Matroska
- **golden:** `fixtures/golden/vp8_720p_10s.webm.meta.json` (container webm, 10.003 s, 2 tracks: vp8 1280x720@30 + vorbis 48000/2ch)
- **primaryMetric:** wall (this is the single-asset, `metrics: ['wall']` probe case — not the `opsPerSec` perf-headline variant)
- **passCount:** 6 / 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES — 6 of 7 engines PASS, all on the identical `golden-metadata` oracle with effectively the same correctness result.
- **Decisive factor:** performance on `wall` (the declared primaryMetric), since correctness is a tie. ffmpeg.wasm posts a **5.205 ms** wall median, the lowest of the field.
- **Margin over runner-up:** runner-up is `mediabunny@1.48.0` at **6.36 ms** → ffmpeg.wasm is **1.22x faster wall**. Note this is a weak-evidence margin: every engine reports `n=1`, `mad=0` (single sample, no spread), and all six results are `cached==true`. The absolute gap (≈1.15 ms) is within one-sample noise, so the "win" is essentially a tie among the four sub-15 ms parsers.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 5.205 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 6.360 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 12.385 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 14.850 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 20.000 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 5999.605 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'webm' |

Per-engine `golden-metadata` duration deltas (all well under the strict ±1-frame band `durationToleranceSec=0.041666…s`):
- ffmpeg.wasm: durationDeltaSec 0.0030
- mediabunny: durationDeltaSec 0.0030
- web-demuxer: durationDeltaSec 0
- remotion-media-parser: durationDeltaSec 0
- remotion-webcodecs: durationDeltaSec 0
- platform: durationDeltaSec 0.0040

No bench engine reported throughputRealtime / peakMemory / longtasks for this case (the single-asset probe declares `metrics: ['wall']` only), so those columns are n/a across the board.

## Why the winner wins (deep technical)

The operation here is the cheapest in the suite: parse the WebM/Matroska header of a VP8+Vorbis file and emit normalized metadata (container, duration, per-track codec/dims/fps/sampleRate/channels). The gate is `src/core/oracles.ts:595` `goldenMetadata`, a metadata-exact oracle that compares container string, duration within a ±1-frame band (`src/core/oracles.ts:614-637`), and each track positionally (`compareTrack`, `src/core/oracles.ts:659-686`). All six non-mp4box engines satisfy it identically — the golden expects exactly the WebM EBML/Segment header values (1280x720, 30 fps, vp8, vorbis 48 kHz stereo, 10.003 s), which any correct Matroska parser reads straight out of the Tracks/Info elements without decoding a single frame. So correctness cannot separate the field; only `wall` (the declared primaryMetric) can.

ffmpeg.wasm wins on `wall` with 5.205 ms. Mechanistically this is a header-only parse, not a transcode. Its `probe()` (`src/engines/ffmpeg-wasm/adapter.ts:1892`) writes the input to the wasm FS and calls `runInfo()` (`adapter.ts:1912`), which executes `ffmpeg -hide_banner -i <in>` (`adapter.ts:1918`). FFmpeg's libavformat opens the Matroska demuxer, reads the Segment/Info (duration via the WebM timecode scale) and the Tracks element (one V_VP8 entry → 1280x720@30, one A_VORBIS entry → 48000/2ch), prints the Input block to the log, then aborts with "At least one output file must be specified". That non-zero exit is expected (`adapter.ts:1906-1910` comment); the metadata is harvested from the captured `logTail`. The Duration line is parsed by `parseDurationSecFromLog` (`adapter.ts:312`) and the streams by `parseTracksFromLog` (`adapter.ts:346-409`), which canonicalizes the codec token (`canonicalCodecFromLog`, `adapter.ts:320`) to `vp8`/`vorbis` and the layout token to 2 channels (`channelsFromLayout`, `adapter.ts:327`). The 0.0030 s duration delta is exactly libavformat's WebM duration vs the golden's 10.003 s — a real, plausible header value, not a hardcoded match. The heavy wasm core + capability probe + warm-up is loaded ONCE in `init()` (it pre-runs the demuxer), so the measured 5.205 ms is the demux-the-header-and-regex-the-log cost alone, which is why a native-C demuxer compiled to wasm edges out the JS parsers on this micro-op.

The runner-up, mediabunny (6.36 ms, `backend: webcodecs`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`), is only 1.15 ms behind doing the same header read in pure TypeScript — a genuinely strong showing for a no-COOP/COEP, no-SharedArrayBuffer parser. The gap is inside single-sample noise (both `n=1`, `mad=0`), so the technical reality is a near-tie; ffmpeg.wasm's edge is the optimized C Matroska demuxer, not an algorithmic advantage.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (golden-metadata, duration delta 0.0030 s). Lost only on wall: 6.36 ms vs 5.205 ms = **1.22x slower**, a sub-millisecond gap within `n=1`/`mad=0` noise. Effectively a co-winner.
- **web-demuxer@4.0.0** — PASSed (duration delta 0). Lost on wall: 12.385 ms = **2.38x slower** than ffmpeg.wasm. It is itself a libav-in-wasm demuxer but carries more per-call overhead on this header-only path.
- **remotion-media-parser@4.0.479** — PASSed (duration delta 0, `backend: cpu-js`, `fieldsTier: metadata-only`). Lost on wall: 14.85 ms = **2.85x slower**. Pure-JS streaming parser; correct but slower per call.
- **remotion-webcodecs@4.0.479** — PASSed (duration delta 0, `backend: webcodecs`). Lost on wall: 20.0 ms = **3.84x slower** (and the value is a suspiciously round 20.000, suggesting coarse timer quantization rather than a real measurement).
- **platform@chrome-149** — PASSed (duration delta 0.0040) but at **5999.605 ms** wall = **~1153x slower**. The platform adapter has no header-only probe primitive: its config drives metadata via a full `<video>` element load/seek pipeline (`encode: <video>→canvas→MediaRecorder`), so a "probe" pays a multi-second media-element setup cost. Correct, but pathologically slow for this op.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". This NA is **honest**: MP4Box.js is an ISO-BMFF (MP4/MOV) box parser and genuinely cannot read the EBML/Matroska container of a WebM file. The capability negotiation in `src/core/runner.ts`/`registry.ts` correctly excludes it rather than letting it FAIL.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/probe/index.ts:112` — `{ asset: 'vp8_720p_10s.webm', container: 'webm', videoCodecs: ['vp8'], audioCodecs: ['vorbis'] }`. Single-asset probe, `metrics: ['wall']` (the `opsPerSec` headline is a separate large/huge case). Notes (file header, lines 1-31) document golden-gated probe-per-container coverage.
- **Fixture:** `fixtures/media/vp8_720p_10s.webm` EXISTS, 1.3 MB — a real WebM file, not synthetic/empty/mock.
- **Golden:** `fixtures/golden/vp8_720p_10s.webm.meta.json` EXISTS and holds physically plausible values (10.003 s, vp8 1280x720@30, vorbis 48000/2ch, encoder "Lavf").
- **Oracle:** `goldenMetadata` at `src/core/oracles.ts:595-657`. It performs a REAL comparison: container string equality, duration within strict ±1/24 s band (`durationToleranceSec` resolved at line 619-625), and positional per-track codec/dims/fps/sampleRate/channels diff (`compareTrack`, line 659). Not trivially satisfiable — a wrong codec, wrong dims, wrong track count, or >41.7 ms duration error FAILs. Measured deltas (0–0.0040 s) are real header readings, not tolerance-gaming.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:1892` (`probe`) → `:1912` (`runInfo`, runs real `ffmpeg -i`) → `:312`/`:346` (real log parse). Calls the genuine vendored FFmpeg wasm core; does NOT return canned output, copy input→output, short-circuit to the golden, or swallow errors (it explicitly throws when no `Input #` block is logged, `adapter.ts:1924`).
- **Cached note:** the winner's result is `cached==true` ("cached previous PASS result"); all six PASS rows are cached and `n=1`. The PASS is real but the timing was reused, not re-run — staleness/measurement-noise risk on the wall margin is real.
- **Verdict:** **REAL** — real fixture + real FFmpeg-wasm implementation + meaningful metadata-exact oracle. The only caveat is that the performance ranking among the four sub-15 ms parsers rests on single cached samples.

## Confidence & caveats

- Correctness is a genuine 6-way tie on a real metadata-exact oracle; the winner is decided purely by `wall`, and ffmpeg.wasm's 1.22x edge over mediabunny is within single-sample (`n=1`, `mad=0`) noise — treat ffmpeg.wasm and mediabunny as co-winners.
- All results are `cached==true`; numbers were reused, not freshly measured. The remotion-webcodecs 20.000 ms looks timer-quantized.
- The mp4box NA is honest (no Matroska support), not an under-declared capability.
- The platform engine's ~6 s "probe" via a `<video>` pipeline is the one clearly distinguishing, real performance signal in the field.
- **Confidence: medium** (clear correctness tie + clear last-place platform/ NA mp4box, but the head-of-field ranking is noise-limited and cached).
