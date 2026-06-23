# probe/opus

**family:** probe &nbsp;|&nbsp; **fixture asset:** `fixtures/media/opus.ogg` (Opus-in-Ogg, 146 KB) &nbsp;|&nbsp; **primaryMetric:** wall (probe latency, ms) &nbsp;|&nbsp; **passCount:** 2 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (2 engines PASS: mediabunny and ffmpeg.wasm@0.12.15).
- **Decisive factor:** correctness is identical (both pass the single gating oracle `golden-metadata` with the same track set), so the tie breaks on **performance**. mediabunny's probe wall median is **3.20 ms** vs ffmpeg.wasm's **6.135 ms** → **~1.92x faster** wall.
- **Margin over runner-up:** 6.135 / 3.20 = **1.92x faster** probe latency. Both results are n==1 (single timed sample, mad=0), so the margin is real but low-sample (see caveats).
- Secondary tiebreaker also favors mediabunny: pure-TS ESM core with `coopCoep: not-required` and `sharedArrayBuffer: false`, versus ffmpeg.wasm which carries the full WASM transcoder runtime to do a metadata-only read.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | golden-metadata:pass | **3.20 ms** | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 6.135 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |

No throughputRealtime / peakMemory / longtasks were emitted for this scenario; only the `wall` bench metric is present in the shard.

## Why the winner wins (deep technical)

**The operation.** This scenario is a metadata-only probe of an **Opus audio stream packaged in an Ogg container** (`{ asset: 'opus.ogg', container: 'ogg', audioCodecs: ['opus'] }`, src/scenarios/probe/index.ts:220). The golden (fixtures/golden/opus.ogg.meta.json) asserts exactly one audio track: `codec: opus`, `sampleRate: 48000`, `channels: 2`, `bitrate: 116652`, and `durationSec: 10.007`. The `golden-metadata` oracle (src/core/oracles.ts:595) compares container, duration (within a per-frame tolerance), and per-track codec/sampleRate/channels positionally. There is no decode, no transcode, and no packet walk required — the winner is whoever extracts the Ogg/Opus header fields correctly and cheapest.

**Why mediabunny's path is cheap and correct.** mediabunny opens an `Input` restricted to the Ogg input-format singleton when the container is known (openInput, src/engines/mediabunny/adapter.ts:245-276 — it maps the canonical `ogg` token to the mediabunny `InputFormat` via codecs.ts:128/141 rather than scanning ALL_FORMATS), then reads duration via the cheap `getDurationFromMetadata()` path and only falls back to `computeDuration()` when metadata yields null (durationFromInput, src/engines/mediabunny/adapter.ts:219-233). Track fields come straight from the typed track getters in normalizeTrack (src/engines/mediabunny/adapter.ts:332-347): `a.getCodec()` → canonicalized to `opus`, `a.getSampleRate()` → 48000, `a.getNumberOfChannels()` → 2, `a.getBitrate()`. These map 1:1 onto the Ogg `OpusHead` identification header (channel count, input sample rate) and the page granule positions (duration), so mediabunny never has to decode an Opus packet. The shard confirms the result is exact: `durationDeltaSec = 0.0065 s` against a `durationToleranceSec = 0.041667 s` band (golden 10.007 s) — comfortably inside the strict ~1-frame probe band. Detail: `metadata matches golden (1 track(s))`. The config used (`backend: webcodecs`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`) means there is no WASM module instantiation in the hot path at all, which is why the wall median lands at **3.20 ms**.

**Why ffmpeg.wasm is correct but slower.** ffmpeg.wasm also PASSes the same oracle (`durationDeltaSec = 0.0030 s` vs the same 0.041667 s band — even tighter on duration than mediabunny), so correctness strength is a tie at the same oracle ladder rung (structural/metadata-exact). It loses purely on latency: its probe runs through `libavformat`'s Ogg demuxer inside the emscripten WASM runtime, and even a header-only `avformat_find_stream_info` carries the WASM call-boundary and runtime overhead, yielding **6.135 ms** — **1.92x** mediabunny's wall. There is no correctness lever for it to reclaim the win here because the gate is metadata-only and both already match the golden exactly.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (golden-metadata, durationΔ 0.0030 s within 0.0417 s) but **lost on performance**: 6.135 ms wall vs mediabunny's 3.20 ms = **1.92x slower**. Heavy WASM transcoder runtime invoked for a metadata-only read.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest NA — Chrome's WebCodecs/MediaSource stack has no Ogg/Opus container demuxer exposed to the adapter; the platform engine declares only the containers it can natively parse.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest NA — MP4Box.js is an ISOBMFF (MP4/MOV/fragmented-MP4) parser only; Ogg is structurally unrelated, so it cannot probe this asset.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest NA — its declared input-container set does not include ogg for this build/registration (the lone `'ogg'` reference in its adapter is an output-token mapping, not an input declaration).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest NA — although its codecs.ts comment lists ogg among formats, the registered input-container set used for negotiation does not declare ogg for probe, so it negotiates NA rather than FAILing.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest NA — same negotiation gap; built on the media-parser, no declared ogg input container.

## Anti-cheat validation

- **Scenario:** src/scenarios/probe/index.ts:220 — `{ asset: 'opus.ogg', container: 'ogg', audioCodecs: ['opus'] }`. Real, golden-gated, single-operation probe.
- **Fixture exists:** `fixtures/media/opus.ogg` present, **146 KB** (verified via stat). Real Opus-in-Ogg media, not synthetic/empty/mock.
- **Golden exists & is plausible:** fixtures/golden/opus.ogg.meta.json — opus / 48000 Hz / 2ch / 116652 bps / 10.007 s. All values physically plausible for a ~146 KB, ~10 s stereo Opus stream (116.652 kbps × 10.007 s ≈ 146 KB). Independent packets golden also present (opus.ogg.packets.json, 56 KB).
- **Oracle:** src/core/oracles.ts:595 `goldenMetadata` — performs a real field-by-field comparison (container, duration within a measured tolerance, per-track codec/sampleRate/channels via compareTrack, src/core/oracles.ts:659). Not trivially satisfiable: a mismatched codec, channel count, or out-of-band duration would FAIL. Measured durationDeltaSec (0.0065 / 0.0030) << tolerance (0.0417), so the pass is genuine margin, not a loose gate.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:245 (openInput, real `new mb.Input`), :219 (durationFromInput, real `getDurationFromMetadata`/`computeDuration`), :332-347 (normalizeTrack reads real `getCodec`/`getSampleRate`/`getNumberOfChannels`/`getBitrate`). No canned output, no copy of input→golden, no error-swallow-as-success.
- **Verdict: REAL** — real fixture + real library implementation + meaningful metadata-exact oracle with measured margin.
- **Cached note:** both PASS results carry `cached: true` ("cached previous PASS result"). Evidence is reused, not freshly re-run, so there is staleness risk per the launcher-seeding caveat; the wall numbers (3.20 ms / 6.135 ms) come from a prior run, not this invocation.

## Confidence & caveats

- **Confidence: high** on the winner identity and the REAL verdict (fixture, golden, oracle, and adapter all verified in code).
- **Performance margin caveat:** both bench results are **n==1** (single timed sample, mad=0, p95==median). The 1.92x wall margin is directionally reliable (pure-TS read vs WASM runtime) but low-sample; a multi-run bench could shift the absolute numbers.
- **Cached caveat:** both PASS cells are cached — for a fully honest fresh comparison the raw + .browser-cache should be cleared and the scenario re-baked.
- No throughput/memory/longtask metrics were recorded for this probe, so the tiebreak rests solely on wall latency plus the structural backend advantage (no COOP/COEP, no WASM instantiation).
