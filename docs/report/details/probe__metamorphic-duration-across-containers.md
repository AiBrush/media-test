# probe/metamorphic-duration-across-containers

family: probe | fixtures: h264_1080p_30s.mp4 (31 MB, H.264/AAC in MP4), h264_in_mkv.mkv (4.4 MB, H.264/AAC in Matroska) | primaryMetric: wall | passCount: 6 of 7

## Verdict

CONTESTED. 6 of 7 engines PASS; only mp4box is NA. Every passing engine satisfies the exact same single oracle (`property-invariant`, probe-duration branch) and four of the six report a perfect Δ=0 on BOTH containers, so correctness strength is effectively tied at the top. The decisive factor is therefore PERFORMANCE (wall median).

Winner: remotion-media-parser@4.0.479 — fastest wall median at 25.425 ms.
Runner-up: mediabunny@1.48.0 at 27.795 ms.
Margin: 1.09x faster wall than mediabunny (2.37 ms), 5.5x faster than platform (138.755 ms), 8.5x faster than ffmpeg.wasm (171.61 ms). The margin over mediabunny is razor-thin and measured at n==1 (no spread), so the top-of-table ordering between remotion-media-parser and mediabunny is weak evidence; they are a statistical tie. The performance separation against the heavy backends (platform/ffmpeg.wasm/web-demuxer) is large and decisive.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | property-invariant:true (Δ0=0, Δ1=0) | 25.425 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true (Δ0=0, Δ1=0) | 27.795 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true (Δ0=0, Δ1=0) | 32.170 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | property-invariant:true (Δ0=0, Δ1=0) | 138.755 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (Δ0=0, Δ1=0.001) | 171.610 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | property-invariant:true (Δ0=0, Δ1=1.78e-15) | 214.030 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mkv' |

Only the `wall` metric is collected for this scenario (`metrics: ['wall']` at src/scenarios/probe/index.ts:460); throughputRealtime/peakMemory/longtasks are not measured here.

## Why the winner wins (deep technical)

The operation under test is a pure metadata read: probe two wrappers of H.264/AAC content (a 30 s 1080p MP4 and a 10.021 s 720p Matroska twin) and confirm each probed `durationSec` equals its own golden duration within the per-container band. The golden durations are 30 s for the MP4 (mvhd-declared) and 10.021 s for the MKV (Segment-Duration-declared); see fixtures/golden/h264_1080p_30s.mp4.meta.json and fixtures/golden/h264_in_mkv.mkv.meta.json. The oracle tolerance reported in the shard is 0.0416666... s (one frame at 24 fps band), and the top four engines hit Δ=0 on both containers — meaning they read the container-declared duration field directly rather than estimating from sample scans.

Because this is a read-only header probe, the differentiator is how cheaply each engine extracts the declared duration without walking the whole file. remotion-media-parser's adapter does exactly the minimal thing: its `probe()` (src/engines/remotion-media-parser/adapter.ts:348) calls the real `parseMedia` with a tight field set — `{ durationInSeconds: true, container: true, tracks: true, metadata: true, rotation: true }` at the `'metadata-only'` tier (src/engines/remotion-media-parser/adapter.ts:374-384). env.configUsed confirms `backend: "cpu-js"`, `fieldsTier: "metadata-only"`, `reader: "webReader"`, `pipeline: "streaming"`. parseMedia streams only enough of the box/EBML header to satisfy `durationInSeconds`, so it never decodes a frame and never walks the moof/cluster index. For an MP4 the duration is one read of mvhd near the front; for Matroska it is the Segment Info `Duration` element. That header-only streaming parse on a JS backend is why it lands at 25.425 ms — fastest in the field — while reading the EXACT declared durations (Δ=0,0).

mediabunny (the runner-up) takes the same philosophically-cheap path and is essentially tied: its `probe()` (src/engines/mediabunny/adapter.ts:1133) calls `metadataFromInput`, which deliberately tries the CHEAP `getDurationFromMetadata()` first (reads mvhd / Segment-duration WITHOUT scanning samples) and only falls back to the expensive `computeDuration()` sample walk when metadata yields null (src/engines/mediabunny/adapter.ts:421-441). Both declared durations are present, so mediabunny never pays the fallback, reads Δ=0,0 like remotion, and lands at 27.795 ms. The 2.37 ms gap (1.09x) is within noise for an n==1 measurement with mad=0 — these two are a genuine dead heat on a cached run, and the winner is decided only by the raw number.

The mechanistic reason the OTHER passers lost is backend weight, not correctness: ffmpeg.wasm (171.61 ms) and web-demuxer (214.03 ms) are single-thread wasm demuxers that must instantiate a wasm module and run a C demuxer to surface the format context — orders of magnitude more setup than a header read; platform (138.755 ms, WebCodecs path with `<video>`/MediaRecorder plumbing in env.configUsed) spins up far heavier machinery than a header probe needs. remotion-webcodecs (32.17 ms) is close to the leaders because it shares the lightweight parse philosophy but carries a slightly heavier WebCodecs-oriented adapter. All six nonetheless read the correct declared durations, so this scenario rewards the lightest metadata path — which remotion-media-parser delivers.

## What each other framework did wrong

- mediabunny@1.48.0 — PASS, correctness-tied (Δ=0,0). Lost only on wall: 27.795 ms vs 25.425 ms, a 1.09x gap that is within n==1 noise. Effectively a tie for first.
- remotion-webcodecs@4.0.479 — PASS, correctness-tied (Δ=0,0). 32.17 ms wall = 1.27x slower than winner; heavier WebCodecs-oriented adapter for what is a header-only read.
- platform@chrome-149 — PASS, correctness-tied (Δ=0,0). 138.755 ms = 5.46x slower; the WebCodecs/`<video>`+MediaRecorder pipeline (env.configUsed) is gross overkill for a metadata probe.
- ffmpeg.wasm@0.12.15 — PASS but weaker correctness AND slow. 171.61 ms = 6.75x slower (wasm instantiation + C demuxer). Also the only top non-zero delta on MKV: Δ1=0.001 s (vs Δ=0 for the leaders) — within the 0.0417 s band so it passes, but it is approximating rather than reading the exact Segment-Duration.
- web-demuxer@4.0.0 — PASS, slowest at 214.03 ms = 8.42x slower (single-thread wasm demux). Its MKV delta of 1.78e-15 s is float round-off (effectively exact), so correctness is fine; pure performance loss.
- mp4box@2.3.0 — NA_ENGINE: "engine does not declare input container 'mkv'". HONEST NA, not an under-declared capability. MP4Box.js is an ISO-BMFF (MP4/MOV) parser and cannot parse Matroska/EBML; the adapter correctly declares only `containersIn: ['mp4', 'mov']` (src/engines/mp4box/adapter.ts:645) and its mux path explicitly notes non-mp4 targets are impossible (adapter.ts:911). Because the scenario requires `containersIn: ['mp4', 'mkv']`, mp4box is legitimately gated out by the runner's capability check.

## Anti-cheat validation

- Scenario definition: src/scenarios/probe/index.ts:447-464 (id at line 448). op=probe, `input: ['h264_1080p_30s.mp4', 'h264_in_mkv.mkv']`, oracle `property-invariant` with `options.property: 'probe-duration'`, `metrics: ['wall']`. The notes (lines 440-445, 461-463) explicitly explain the trio caveat: the .mov twin is a different length, so the invariant is declared only over the mp4+mkv pair and each probed duration is compared to ITS OWN golden — guarding against a false cross-length mismatch. Sound gating rationale.
- Fixtures exist and are real media: h264_1080p_30s.mp4 = 31 MB, h264_in_mkv.mkv = 4.4 MB in fixtures/media/. Goldens present: fixtures/golden/h264_1080p_30s.mp4.meta.json (durationSec 30) and fixtures/golden/h264_in_mkv.mkv.meta.json (durationSec 10.021). Not synthetic/empty/mock.
- Oracle: src/core/oracles.ts:2709-2712 routes the probe-op probe-duration branch to `probeDurationInvariant` (src/core/oracles.ts:3823-3880). It iterates real probe metadatas, reads `golden.meta.durationSec` per input, computes `delta = |measured - golden|`, picks a per-container band via `durationToleranceFor`, and FAILS if delta exceeds it. This is a real numeric comparison against per-asset goldens, not trivially satisfiable: a wrong/null duration fails (lines 3846-3853, 3863-3871). The reported band 0.0417 s is a tight one-frame band (NOT a loose estimate band), and four engines hitting Δ=0 confirms they read the genuine declared durations.
- Winner adapter: src/engines/remotion-media-parser/adapter.ts:348 (`probe`) → real `parseMedia` call with `durationInSeconds` field at metadata-only tier (lines 363-384). No canned output, no golden short-circuit, no copy-through, no error-swallow-as-success. Genuine library call.
- Measurements physically plausible: durations 30 s and 10.021 s match real fixtures; deltas of 0 / 0.001 s / 1.78e-15 s are exactly what reading vs float-handling declared durations produces.
- Cached note: ALL seven entries have cached==true (reason "cached previous PASS result"). Evidence is reused, not freshly re-run, so wall medians (all n==1, mad=0) carry staleness risk and the 2.37 ms winner-vs-runner-up gap should not be over-read.

Verdict: REAL. Real fixtures, real library probe implementations on both leaders, and a meaningful per-asset duration oracle with a tight one-frame band. The only caveat is freshness (cached) and the n==1 razor-thin top-two margin — neither undermines that the PASSes are genuine.

## Confidence & caveats

Confidence: medium. Correctness verdict (six genuine PASS, one honest NA) is high-confidence: the oracle is real, fixtures are real, and the two fastest adapters demonstrably read declared durations. The ranking of remotion-media-parser over mediabunny for FIRST place is low-confidence — a 2.37 ms (1.09x) gap at n==1 with mad=0 on a cached run is within noise; they are best treated as co-leaders. The separation of the leaders from platform/ffmpeg.wasm/web-demuxer (5.5x–8.5x) is robust and decisive. mp4box's NA is verified honest against its adapter container declaration.
