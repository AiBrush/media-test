# demux/opus

family: demux | fixture asset: `opus.ogg` (Opus-in-Ogg, audio-only, 48kHz stereo, 10.007s, ~146 KB) | primaryMetric: wall | passCount: 2/7

## Verdict

- Best framework: **mediabunny@1.48.0** (status PASS).
- **CONTESTED**: two engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Correctness is identical (both pass `golden-packets` with the exact same measurements: 501/501 packets, comparedTracks=1, maxPtsDriftUs=0), so the decision falls to **performance**.
- Decisive factor: wall-clock. mediabunny demuxes in **5.455 ms** median vs ffmpeg.wasm **15.73 ms** median — a **2.88x** wall-time advantage. Both bench runs are n=1 (mad=0, p95==median), so the margin is single-sample evidence, but it is large and consistent with the architectural gap (pure-TS streaming reader vs wasm transcode-engine bootstrap + virtual-FS round trip).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:pass | 5.455 ms | n/a (not measured) | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass | 15.73 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |

The shard carries only the `wall` bench metric for the two PASS engines; throughputRealtime / peakMemory / longtasks were not recorded for this scenario, so the ranking rests on wall median alone.

## Why the winner wins (deep technical)

This scenario is a pure **container-demux / packet-enumeration** test on **Opus packets carried in an Ogg bitstream** (magic `OggS`, first page `OpusHead`, confirmed via the fixture hexdump). There is no decode, no transcode, no pixel work — the job is to walk Ogg pages, segment them into Opus packets, and emit a packet table (trackIndex, byte size, pts/dts in µs, keyframe flag). For a CBR-ish Opus stream every packet is a keyframe and PTS advances 20 ms per packet, so the gating evidence is: count (501), per-packet byte sizes, and timestamp monotonicity.

**Mediabunny's path.** `MediabunnyAdapter.demux()` (`src/engines/mediabunny/adapter.ts:1152`) opens the input once, gets tracks, and for the single audio track instantiates `EncodedPacketSink` and iterates `sink.packets(undefined, undefined, { verifyKeyPackets: true })` (`adapter.ts:1165`). Each `EncodedPacket` yields `byteLength`, `microsecondTimestamp`, and a bitstream-verified `type` → `keyframe = pkt.type === 'key'` (`adapter.ts:1174`). Mediabunny abstracts DTS away, so the adapter honestly reports `dtsUs === ptsUs` (`adapter.ts:1173`) rather than fabricating a decode timeline — correct for Opus where dts==pts anyway. The container is resolved to mediabunny's `OGG` Input-format singleton (`src/engines/mediabunny/codecs.ts:137`). The whole path is a **pure-TS ESM streaming reader** over a `BlobSource` — `env.configUsed` shows `coreBuild: "pure-ts-esm"`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`. There is essentially no engine bootstrap and no copy of the 146 KB file into a virtual filesystem; mediabunny parses Ogg pages directly. That is why wall is 5.455 ms.

**Why mediabunny matches the golden despite the Opus pre-skip convention.** ffprobe (the golden generator) reports the first Opus packet at a NEGATIVE pts (`ptsUs: -6500` in `fixtures/golden/opus.ogg.packets.json`, reflecting raw codec pre-skip / priming), whereas mediabunny normalizes the stream to start at 0. The `golden-packets` oracle (`src/core/oracles.ts:703`) handles exactly this: `usesOpusPreskipLoosePacket()` (`oracles.ts:869`) detects `container === 'ogg' && codec === 'opus'`, anchors the per-track constant pts/dts offset on **packet index 1** instead of 0 (`oracles.ts:770-772`), and skips the timestamp residual on packet 0 (`oracles.ts:779`). Sizes, count, and keyframe flags are still compared **exactly** on every packet including packet 0. The reported `maxPtsDriftUs: 0` proves that from packet 1 onward mediabunny's 20 ms cadence is bit-aligned with ffprobe's — the only difference is the priming convention on the very first packet, which is a legitimate demuxer-convention difference, not an error.

**Why ffmpeg.wasm is correct but slower.** `FfmpegWasmAdapter.demux()` (`src/engines/ffmpeg-wasm/adapter.ts:1961`) runs a single `-map 0 -c copy -f framecrc` pass (`adapter.ts:1980-1994`): stream-copy with the framecrc muxer enumerates the real container packets (row count + sizes + keyframe flags), and the same run's Input-block log builds metadata. This is a genuine, faithful enumeration and yields the same 501/501, maxPtsDriftUs=0 result. But it pays for: loading/initializing the ffmpeg wasm core, writing the 146 KB input into the emscripten virtual FS (`writeInput`), exec'ing the CLI pipeline, then reading the framecrc text file back out and parsing it (`adapter.ts:486`). That fixed overhead is why its wall median is 15.73 ms — 2.88x mediabunny — for an operation that is intrinsically a few-millisecond page walk.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed correctly (golden-packets, 501/501, maxPtsDriftUs=0) but lost on performance: 15.73 ms wall vs 5.455 ms (2.88x slower). Cause is architectural: wasm core + virtual-FS write + CLI exec + framecrc text parse vs mediabunny's in-process pure-TS Ogg page walk. No correctness deficit.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest NA; remotion-media-parser's declared input containers do not include Ogg, so the runner skips it rather than failing it.
- **platform@chrome-149** — NA_ENGINE: same reason. Honest — the WebCodecs/platform demux path has no Ogg container demuxer (Chrome exposes no script-accessible Ogg demuxer; MediaSource doesn't take audio/ogg). Not an under-declaration.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare input container 'ogg'". Plausibly honest for this build's declared capability set, though web-demuxer wraps ffmpeg and could in principle read Ogg; it is simply not declared, so it is correctly excluded rather than awarded a free pass.
- **mp4box@2.3.0** — NA_ENGINE: mp4box is an ISO-BMFF (MP4/MOV) parser only; it structurally cannot parse an Ogg bitstream. Honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: same as remotion-media-parser; no declared Ogg input container. Honest NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:137` — `{ asset: 'opus.ogg', container: 'ogg', audioCodecs: ['opus'], notes: 'OGG page → Opus packet boundaries.' }`. The note states the gating rationale (Ogg page → Opus packet boundaries).
- Fixture: `fixtures/media/opus.ogg` **exists** (~146 KB) and is a real Ogg/Opus file (hexdump shows `OggS` page magic and `OpusHead` identification header). Not synthetic/empty/mock.
- Golden: `fixtures/golden/opus.ogg.packets.json` contains 501 real packet entries (verified `grep -c '"trackIndex"'` = 501), with physically plausible Opus values (first packet 439 B at -6500µs pre-skip, then ~20000µs cadence, all keyframe:true) and `fixtures/golden/opus.ogg.meta.json` (container ogg, opus, 48000 Hz, 2ch, 116652 bps, 10.007 s).
- Oracle: `golden-packets` at `src/core/oracles.ts:703`. Performs a real per-track, order-independent comparison of count, trackIndex layout, exact byte sizes, exact keyframe flags, and timestamp residuals (±1ms tol) after a single constant per-track origin offset. The Opus pre-skip relaxation (`oracles.ts:769-779`) only exempts packet-0's timestamp; counts/sizes/keyframes remain exact on all 501 packets. Not trivially satisfiable.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1152-1183`. Genuinely calls `EncodedPacketSink.packets()` with `verifyKeyPackets`; no canned output, no input→output copy, no short-circuit to golden, no error swallowing (errors propagate; `dispose()` in finally).
- Verdict: **REAL**. Real Ogg/Opus fixture, real library packet enumeration on both PASS engines, meaningful exact-size/exact-count oracle with a justified single-packet timestamp exemption, and plausible measurements (501 packets, maxPtsDriftUs=0).
- Cached note: BOTH PASS results have `cached: true` ("cached previous PASS result"). The reported numbers were reused from a prior run, not re-executed in this batch — staleness risk applies to the 5.455 ms / 15.73 ms wall figures, though the correctness outcome (501/501) is structurally stable for a fixed fixture+golden.

## Confidence & caveats

- Confidence: **high** on the winner pick and REAL verdict — correctness is tied and exact, and the 2.88x wall margin is large and mechanistically explained.
- Caveats: (1) both wall benches are **n=1** (mad=0, p95==median), so the absolute timings are single-sample; the ratio is directionally reliable but not statistically robust. (2) Both results are **cached** — figures were not re-run this batch. (3) Only `wall` was captured; throughputRealtime/peakMemory/longtasks are unavailable, so the performance ranking rests solely on wall median. (4) The 5 NA_ENGINE engines all look like honest container non-declarations (mp4box/platform structurally cannot; web-demuxer could theoretically read Ogg via ffmpeg but does not declare it — a mild under-declaration candidate, but it would not have beaten mediabunny on wall regardless).
