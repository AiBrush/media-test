# performance/size-ladder-extract-metadata-tiny

**family:** performance · **fixture asset:** `tiny_h264_360p_2s.mp4` (H.264 video + AAC audio in MP4, faststart, ~173 KB) · **primaryMetric:** opsPerSec · **passCount:** 7 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (all 7 engines PASS the same single oracle).
- **Decisive factor:** Pure performance. Correctness is a tie (every engine passes the *one* gate `golden-metadata` with identical measurements `durationDeltaSec=0`, 2 tracks matched), so the ranking falls to the primaryMetric `opsPerSec`. Mediabunny is the clear leader.
- **Margin over runner-up:** Mediabunny 223.71 ops/s vs ffmpeg.wasm 127.15 ops/s = **1.76x more ops/s**; by wall median 4.47 ms vs 7.865 ms = **1.76x faster wall**. Caveat: all benches are **n=1, warmup=1, mad=0** — single-shot timings, so the margin is suggestive rather than statistically firm.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | opsPerSec | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 4.47 | 223.71 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 7.865 | 127.15 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 8.42 | 118.76 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 10.125 | 98.77 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 10.64 | 93.98 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 11.04 | 90.58 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 23.04 | 43.40 | n/a | n/a | n/a | cached previous PASS result |

(This scenario only declares metrics `opsPerSec` + `wall`; throughputRealtime/peakMemory/longtasks are not produced for an extract-metadata probe, hence n/a.)

## Why the winner wins (deep technical)

This rung is the *tiny* end of the §5.3 size axis (size-ladder.ts:49, `LADDER.tiny`). The operation is `op: 'probe'` (size-ladder.ts:72-74): read container + per-track metadata from a 173 KB faststart MP4 and emit nothing else. At ~173 KB with the `moov` near the front, the file body never dominates — what is measured is **per-call overhead**: how cheaply each engine opens the container, parses `moov` (`mvhd` duration, two `trak`/`stsd` boxes for `avc1`/`mp4a`), and tears down. The notes explicitly frame the tiny rung as "per-call overhead at small sizes" (size-ladder.ts:68).

Mediabunny's probe path is minimal and avoids the two expensive things a metadata probe can accidentally do (full-sample scan, wasm boot):

- `probe()` (adapter.ts:1134) opens a single `mb.Input` over a `UrlSource` (adapter.ts:267-270 — the unmutated, non-blob fast path: no `arrayBuffer()`/blob round-trip) and calls `metadataFromInput`.
- `metadataFromInput` (adapter.ts:417) reads duration via the **cheap** `getDurationFromMetadata()` FIRST (adapter.ts:429), which reads the declared `mvhd`/segment duration **without scanning samples**, and only falls back to the costly `computeDuration()` full walk if metadata yields null (adapter.ts:434-441). For this faststart MP4 the cheap path resolves `durationSec=2` immediately, so no `moof`/sample walk is paid.
- Tracks come from `getTracks()` + `normalizeTrack` (adapter.ts:443-447); tags via best-effort `getMetadataTags()` (adapter.ts:457). All pure-TS ESM, `coreBuild: pure-ts-esm`, no wasm, no SharedArrayBuffer, `coopCoep: not-required` (env.configUsed). That is why it lands at **4.47 ms / 223.71 ops/s**.

The oracle is `golden-metadata` (oracles.ts:595). It does a real structural comparison: container token (oracles.ts:606), duration within a strict ±1-frame band (oracles.ts:614-637; tolerance reported as `durationToleranceSec≈0.04167s`), and positional per-track codec/dims/fps/sampleRate/channels (oracles.ts:643-653) against the baked golden `tiny_h264_360p_2s.mp4.meta.json` (container `mp4`, durationSec 2, video h264 640x360@30, audio aac 48000/2ch). Mediabunny's measurement is `durationDeltaSec=0` — an exact duration match, not a slack pass. Every other engine reports the identical `durationDeltaSec=0` and "2 track(s)" match, so correctness is genuinely tied; the differentiator is mechanical open/parse cost.

Against the field, mediabunny's pure-TS reader beats every alternative model for this micro-probe: it has **no wasm instantiation tax** (unlike ffmpeg.wasm / web-demuxer), **no per-probe codec/WebCodecs spin-up on the timed path** (unlike the WebCodecs-streaming adapters platform and remotion-webcodecs), and **no whole-file append** (unlike mp4box's `whole-file-append(MP4BoxBuffer+fileStart)`, env.configUsed). The result is the lowest open→parse→dispose overhead in the set.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, runner-up): correct (`durationDeltaSec=0`) but **1.76x slower** — 7.865 ms / 127.15 ops/s. Even amortized, the wasm `avformat` open + FS shim adds per-call overhead a pure-TS reader does not pay, which dominates on a 173 KB file.
- **mp4box@2.3.0** (PASS): correct but **1.88x slower** — 8.42 ms / 118.76 ops/s. Its pipeline is `whole-file-append(MP4BoxBuffer+fileStart)` (env.configUsed): it appends the entire file before surfacing `moov`, paying buffering it doesn't need for a metadata-only read.
- **remotion-media-parser@4.0.479** (PASS): correct but **2.21x slower** — 10.125 ms / 98.77 ops/s. `cpu-js` streaming reader (`fieldsTier: metadata-only`) is leaner than mp4box but still trails the mediabunny open/parse path.
- **platform@chrome-149** (PASS): correct but **2.38x slower** — 10.64 ms / 93.98 ops/s. The WebCodecs streaming adapter carries demux+decoder-pipeline setup overhead that a metadata-only probe cannot amortize.
- **web-demuxer@4.0.0** (PASS): correct but **2.47x slower** — 11.04 ms / 90.58 ops/s. wasm (libav)-backed demuxer; same wasm/FS open tax as ffmpeg.wasm, slightly worse here.
- **remotion-webcodecs@4.0.479** (PASS, slowest): correct but **5.15x slower** — 23.04 ms / 43.40 ops/s. Heaviest open path (`streaming-backpressure`, bufferWriter, prefer-hardware WebCodecs init with software fallback, env.configUsed); all of that setup is pure overhead for a tiny metadata read.

No engine FAILed and none returned NA — the op (probe of H.264/AAC-in-MP4) is universally supported, so this is a pure-performance race among 7 correct results.

## Anti-cheat validation

- **Scenario:** src/scenarios/performance/size-ladder.ts:69-83 (generated by `extractLadder.map`); rung `tiny` at size-ladder.ts:49; asset token `LADDER.tiny = 'tiny_h264_360p_2s.mp4'` (_shared.ts:76). `op: 'probe'`, `oracles: ['golden-metadata']`, primary `opsPerSec`.
- **Fixture exists (real):** `fixtures/media/tiny_h264_360p_2s.mp4` — present, ~173 KB real H.264/AAC MP4 (not synthetic/empty/mock).
- **Golden exists (real):** `fixtures/golden/tiny_h264_360p_2s.mp4.meta.json` — real baked metadata (mp4, 2s, h264 640x360@30, aac 48000/2). The `baked: true` rung claim is verified on disk.
- **Oracle:** src/core/oracles.ts:595 `goldenMetadata` — does a genuine container + ±1-frame-duration + positional per-track comparison; not trivially satisfiable. Mediabunny's `durationDeltaSec=0` is an exact match, well inside the 0.04167s band. Measurements are physically plausible.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1134 `probe()` → :417 `metadataFromInput()` → real mediabunny `Input.getFormat()/getDurationFromMetadata()/getTracks()/getMetadataTags()`. No canned output, no copy-input-to-output, no golden short-circuit, no error-swallow-as-success (the `try/finally` only disposes the input; errors propagate).
- **Cached note:** Every engine result has `cached: true` ("cached previous PASS result"). The PASS verdicts and oracle measurements are reused, not freshly re-run — staleness risk applies to all 7 equally, so the *relative* ranking is stable but the absolute n=1 timings are from a prior run.
- **Verdict:** **REAL** — real fixture + real golden + genuine library implementation + meaningful structural oracle. The only soft spot is bench statistics (n=1, mad=0), not correctness.

## Confidence & caveats

- **Confidence: medium.** Implementation, fixture, golden, and oracle are all verified genuine, so REAL is solid. The performance *ranking* (mediabunny > ffmpeg.wasm > mp4box > ...) is internally consistent (pure-TS open beats wasm-boot and WebCodecs-pipeline setups for a tiny probe), but every bench is **n=1 / warmup=1 / mad=0**, so the 1.76x margin is single-shot evidence rather than a distribution.
- All results are **cached** — not re-executed this run; a fresh run could shift the absolute ms numbers (though the ordering by architecture class is expected to hold).
- The gate is a **single** oracle (`golden-metadata`); there is no second correctness gate to separate engines, which is appropriate for a metadata-extract op but means correctness cannot break the tie — performance must, and it does cleanly.
