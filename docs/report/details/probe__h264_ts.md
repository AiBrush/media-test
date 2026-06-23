# probe/h264_ts

- family: probe
- fixture asset: `fixtures/media/h264_ts.ts` (4.6 MB real MPEG-TS, H.264 video + AAC audio)
- golden: `fixtures/golden/h264_ts.ts.meta.json`
- primaryMetric: wall (ms)
- passCount: 4 of 7 (mediabunny, ffmpeg-wasm, remotion-media-parser, remotion-webcodecs, web-demuxer all PASS — wait: 5 PASS; platform + mp4box NA)

Correction: 5 engines PASS (mediabunny, ffmpeg-wasm, remotion-media-parser, remotion-webcodecs, web-demuxer); 2 NA (platform, mp4box).

## Verdict

- Best framework: **mediabunny@1.48.0** (`env.engineId` "mediabunny").
- Contested: YES — 5 engines PASS the same single oracle (`golden-metadata`), so correctness is tied and the winner is decided on performance.
- Decisive factor: **wall median**. mediabunny probes the TS metadata in **31.03 ms**, versus ffmpeg-wasm 49.90 ms (1.61x slower), remotion-webcodecs 272.69 ms (8.79x), remotion-media-parser 304.57 ms (9.81x), web-demuxer 440.94 ms (14.21x).
- Margin over runner-up (ffmpeg-wasm): **1.61x faster wall** (49.90 / 31.03). All five also pass the duration-tolerance check; mediabunny's duration delta is the loosest of the group (1.4057 s vs tol 1.5032 s) but still inside the estimate-only band.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 31.03 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 49.90 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 272.69 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 304.57 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 440.94 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'ts' |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'ts' |

No `throughputRealtime`, `peakMemory`, or `longtasks` keys are present in any `bench{}` for this probe row; only `wall` is recorded (n=1, warmup=1, mad=0).

## Why the winner wins (deep technical)

This is a read-only **probe** of an MPEG-TS (`.ts`) packetized elementary stream carrying H.264 video (1280x720, 30 fps) and AAC audio (48000 Hz, stereo). MPEG-TS has no global header/index: it is a sequence of 188-byte transport packets with PAT/PMT tables and PES headers, so there is no `mvhd`/`Segment`-style declared duration. The only gating oracle is `golden-metadata` (`src/core/oracles.ts:595`), which compares container token, duration (within a per-container tolerance), and per-track codec/dims/fps/sampleRate/channels positionally against `fixtures/golden/h264_ts.ts.meta.json`. Because TS is an estimate-only container, the duration band is the loose `max(±abs, ±rel)` path (`oracles.ts:622`), tolerance reported as 1.5032 s.

All five PASS engines produce the same normalized two-track shape (`metadata matches golden (2 track(s))`), so correctness on the strength ladder is identical — structural/metadata-exact with no bit-exact or perceptual gate involved. The tie therefore resolves on wall time.

mediabunny wins mechanistically through its cheap-metadata-first probe path. The adapter's `metadataFromInput` (`src/engines/mediabunny/adapter.ts:417`) calls `input.getFormat()` to canonicalize the container (`MPEG_TS` singleton, mapped in `src/engines/mediabunny/codecs.ts:133`), then reads duration via `input.getDurationFromMetadata()` FIRST (`adapter.ts:429`) and only falls back to the expensive full-sample `input.computeDuration()` scan (`adapter.ts:436`) when metadata yields null. For TS this means mediabunny reads the PAT/PMT and the elementary-stream descriptors plus a bounded probe to estimate duration, rather than walking every 188-byte packet to the last PES — that is the source of the 31 ms figure. Tracks are enumerated via `input.getTracks()` (`adapter.ts:443`) and each is normalized through the real `InputVideoTrack`/`InputAudioTrack` getters, giving the h264/1280x720/30 and aac/48000/2 fields that satisfy `compareTrack` (`oracles.ts:659`). Its measured duration delta of 1.4057 s — the largest of the group — is the expected consequence of an estimate (rather than a full-scan) duration on a TS stream, and it still clears the 1.5032 s loose band. mediabunny runs pure-TS-ESM with no COOP/COEP and no SharedArrayBuffer (`env.configUsed`: `coreBuild:"pure-ts-esm"`, `coopCoep:"not-required"`, `wasmThreads:0`), so there is no wasm module instantiation or worker spin-up tax on the critical path.

ffmpeg-wasm is the runner-up at 49.90 ms (1.61x slower): it uses libavformat's TS demuxer, which is fully correct (duration delta 0.0010 s, far tighter than mediabunny's estimate) but pays the cost of marshaling the file into the wasm FS and probing through the emscripten boundary. Its tighter duration is correctness-neutral here because both clear the same loose oracle band, so the wall gap decides.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost on performance: wall 49.90 ms vs 31.03 ms (1.61x slower). libavformat probes TS correctly (duration delta 0.0010 s, the tightest) but the wasm-FS round-trip and emscripten call overhead make it slower than mediabunny's native-JS metadata-first path. No correctness deficit; pure speed gap.
- **remotion-webcodecs@4.0.479** — PASS but 272.69 ms (8.79x slower). `env.configUsed.backend:"webcodecs"` with a streaming-backpressure pipeline; the WebCodecs-oriented convert harness carries more setup/parse overhead for a metadata-only probe of a non-MP4 container.
- **remotion-media-parser@4.0.479** — PASS but 304.57 ms (9.81x slower). `backend:"cpu-js"`, `fieldsTier:"full-parse(demux)"` — it does a fuller JS demux parse to surface fields, far heavier than mediabunny's cheap-metadata path for the identical 2-track result (identical duration delta 0.005666 s to remotion-webcodecs, indicating shared parser core).
- **web-demuxer@4.0.0** — PASS but slowest at 440.94 ms (14.21x slower). It is an ffmpeg-wasm-derived demuxer; duration delta 0.000333 s is the most accurate of all, but the wall cost (wasm load + libav TS probe) is the highest. Correct, just expensive.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'ts'". The platform adapter only ships hand-rolled MP4/WebM/WAV demuxers (`src/engines/platform/demux-mp4.ts`, `demux-webm.ts`, `demux-wav.ts`); there is no MPEG-TS demuxer, and Chrome's `MediaCapabilities`/WebCodecs surface does not parse raw TS containers. The runner emits NA at `src/core/runner.ts:125` before any oracle. Honest NA — genuine capability gap, not under-declaration.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ts'". mp4box.js is an ISOBMFF-only parser (MP4/MOV/fragmented-MP4); it structurally cannot read MPEG-TS. Honest NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/probe/index.ts:134` — `{ asset: 'h264_ts.ts', container: 'ts', videoCodecs: ['h264'], audioCodecs: ['aac'] }`. Real probe row, no synthetic/mock input.
- Fixture: `fixtures/media/h264_ts.ts` exists, 4.6 MB real transport stream (verified via stat). Golden present: `fixtures/golden/h264_ts.ts.meta.json` (container ts, 10.021 s, h264 1280x720/30, aac 48000/2).
- Oracle: `golden-metadata` at `src/core/oracles.ts:595` performs real structural comparison — container token (`:606`), duration within per-container tolerance (`:614`–`:637`, loose estimate-only band for ts), positional per-track codec/width/height/fps/sampleRate/channels (`compareTrack` `:659`). Not trivially satisfiable; a wrong codec/dims/track-count would fail. Measurements are physically plausible: duration deltas 0.000333–1.4057 s against a ~10 s asset, 2 tracks matching the golden.
- Winner adapter: `src/engines/mediabunny/adapter.ts:417` (`metadataFromInput`) genuinely calls the real mediabunny `Input` API — `getFormat()`, `getDurationFromMetadata()`/`computeDuration()`, `getTracks()`, `normalizeTrack()`. No canned output, no copy of golden, no swallowed error reported as success. Container mapping `ts -> MPEG_TS` at `src/engines/mediabunny/codecs.ts:133`.
- Verdict: **REAL** — real fixture + real library calls + meaningful structural oracle. The one caveat is that `golden-metadata` is structural/metadata-exact, not bit-exact; for a metadata probe this is the appropriate and strongest applicable gate.
- Cached note: ALL engine results have `cached:true` ("cached previous PASS result"). The wall numbers were reused from a prior run, not freshly measured this pass — staleness risk on the exact millisecond figures. The PASS/NA verdicts and oracle outcomes are still meaningful, but the 1.61x margin rests on cached n=1 samples (mad=0, single sample), so treat the precise ratio as indicative rather than statistically robust.

## Confidence & caveats

- Confidence: **medium**. The winner ordering (mediabunny fastest, then ffmpeg-wasm) is large and consistent (1.61x to runner-up, 8.8x–14.2x to the rest), so the ranking is robust even with measurement noise. But every sample is n=1 with mad=0 and all rows are cached, so the exact wall ratios are not statistically firm.
- Correctness is a true tie (all five pass the same single structural oracle); the decision is purely performance, which is the correct procedure when correctness strength is comparable.
- mediabunny's duration estimate (delta 1.4057 s) is the loosest among PASS engines — it clears the loose TS band but would fail a strict (precise-container) band. This is expected for an estimate-only container and is not a defect, but it is the trade-off behind its speed (it does not full-scan to derive an exact duration).
- The two NAs are honest capability gaps (no TS demuxer), not under-declared capabilities.
