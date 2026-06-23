# audio-dsp/negative_image_into_audio_transcode

family: audio-dsp | fixture asset: `fixtures/media/image.jpg` (JPEG, 640x480, baseline, 22 KB) | primaryMetric: wall | passCount: 2/7

This is a **negative-input guard** scenario (A.16/§7), not a capability benchmark. A still JPEG image is fed into an *audio* transcode (`transcode` with `{ container: 'wav', audio: { codec: 'pcm-s16', channels: 1 } }`). The only oracle is `graceful-failure`: an engine PASSES iff it rejects the bogus input cleanly (clean throw / NA / no output) without crashing, hanging, or OOMing. There is **no correct output** to produce — producing any audio blob from a JPEG would be a FAIL.

## Verdict

- **Best framework: mediabunny@1.48.0** (PASS, graceful-failure).
- **Contested**: 2 engines PASS the identical single oracle (mediabunny, ffmpeg.wasm). The other 5 are NA (operation not declared, or runtime cannot honor the request) — none FAILed.
- **Decisive factor**: both rejections are real and equally oracle-strong, so the tie breaks on (a) *quality of rejection* and (b) *latency*. mediabunny's rejection is emitted by the **real mediabunny demuxer** refusing the format ("Input has an unsupported or unrecognizable format."), i.e. genuine library behavior rather than a suite-side pre-check; ffmpeg.wasm rejects via an explicit `isStillImageInput()` extension/MIME guard before touching the wasm core. Both honest, but mediabunny exercises the actual format-detection path.
- **Margin over runner-up (latency)**: mediabunny wall median **8 ms** vs ffmpeg.wasm **122 ms** → **~15.3x faster** (n=1 each, cached). For a reject-fast path lower is strictly better.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 8 ms | n/a | n/a | n/a | cached: graceful: "Input has an unsupported or unrecognizable format." |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 122 ms | n/a | n/a | n/a | cached: graceful: transcode rejected still-image input |
| platform@chrome-149 | NA_ENGINE | — | 7 ms | n/a | n/a | n/a | transcode NA — MediaRecorder canvas-capture path is video-only, drops audio |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | 23 ms | n/a | n/a | n/a | adapter cannot remap audio channel count (downmix/upmix) |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |

(No `bench{}` block is recorded for any engine; the only metric requested is `wall`, captured as `durationMs`. throughputRealtime/peakMemory/longtasks are absent — expected for a reject-fast negative test.)

## Why the winner wins (deep technical)

The input is a **baseline JFIF JPEG**, 640x480, 8-bit, 3 components — a still image with **no container box structure** (`ftyp`/`moov`), no audio track, no sample table. The requested operation asks the engine to produce a **WAV/PCM-s16 mono** audio blob. No defensible audio can be synthesized from pixel data, so the entire scenario is about *failing safely*.

mediabunny's `transcode()` (`src/engines/mediabunny/adapter.ts:1271`) does not special-case images up front; it goes straight into the real pipeline: `openInput(this.lib, input)` then `mbInput.getTracks()` (`adapter.ts:1287`,`:1293`). The vendored mediabunny core attempts format detection on the JPEG bytes, finds no recognizable media container, and throws **"Input has an unsupported or unrecognizable format."** That string is **not present anywhere in the suite's own source** (confirmed by grep — it only appears as a quoted comment in `src/scenarios/performance/index.ts:226`), so it is emitted by the real library, not by a suite-side shim. The runner catches the throw, leaves `ctx.output`/`metadata`/`demux`/`frames` undefined, and `gracefulFailure()` (`src/core/oracles.ts:2607-2609`) infers a clean failure → PASS. Critically, mediabunny also has the *opposite-direction* guards that prove it would not fake success: it would throw "requested audio output but input has no audio track" (`adapter.ts:1297-1299`) had the input been a valid-but-trackless container. The rejection here is the library's genuine demux-failure path, returned in **8 ms** with no wasm/encoder warm-up cost.

ffmpeg.wasm's `transcode()` (`src/engines/ffmpeg-wasm/adapter.ts:2165`) instead short-circuits with an explicit pre-check: `if (isStillImageInput(input)) throw new Error('ffmpeg.wasm@0.12.15: transcode rejected still-image input')` (`:2166-2167`). `isStillImageInput` (`:812`) matches `image/*` MIME and `.jpg/.jpeg` extensions (`:805`). This is also a legitimate, intentional guard (it deliberately avoids feeding a JPEG to libavformat, which would otherwise treat it as a single-frame video and could waste budget), and it satisfies the same oracle. But it costs **122 ms** — the adapter pays its single-thread wasm-core/JIT setup before the throw resolves — and it never reaches the real format detector; it trusts the filename/MIME. Both PASS, but mediabunny's path is faster and validated by the actual demuxer.

Both winners ran on `backend: webcodecs` config, but for this scenario WebCodecs/hardware never engages — there is no decodable media — so the tiebreak rests purely on reject latency and rejection provenance, both favoring mediabunny.

## What each other framework did wrong

(None FAILed — these are all honest NA outcomes, correct for a negative test.)

- **platform@chrome-149** — NA_ENGINE: its transcode is built on `<video>→canvas→MediaRecorder`, a **video-only** capture path that drops audio; it structurally cannot emit the requested mono PCM/WAV audio track. Honest capability NA, not under-declared. (7 ms to decide.)
- **remotion-webcodecs@4.0.479** — NA_ENGINE: the adapter cannot remap audio channel count (the request asks for `channels: 1`); it declines rather than guess. Honest NA. (23 ms.)
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". MP4Box is a demux/box-layout tool with no encode path; correctly never claims transcode. Honest.
- **remotion-media-parser@4.0.479** — NA_ENGINE: parser-only (probe/demux); does not declare transcode. Honest.
- **web-demuxer@4.0.0** — NA_ENGINE: demux-only wasm wrapper; does not declare transcode. Honest.

## Anti-cheat validation

- **Scenario**: `src/scenarios/audio-dsp/index.ts:664-677` (`id: 'audio-dsp/negative_image_into_audio_transcode'`). `input: 'image.jpg'`, `op: 'transcode'`, `oracles: ['graceful-failure']`. Notes (`:675-676`) state the intent: a still image fed to an audio transcode "must fail cleanly (clean NA or graceful error), never crash." The author comment (`:660-663`) explicitly warns against faking a `jpeg` container or claiming image→audio capability — the gate is invalid-input handling only.
- **Fixture exists & is real**: `fixtures/media/image.jpg` — `file` reports "JPEG image data, JFIF standard 1.02 ... baseline ... 640x480, components 3", 22 KB. A genuine still image, exactly the malformed-for-audio input the test intends. Not synthetic/empty/mock.
- **Oracle**: `gracefulFailure()` in `src/core/oracles.ts:2586-2623`. It is **not trivially satisfiable**: it PASSes only when there is NO output (`:2608-2609`) for a graceful-flagged scenario, and explicitly **FAILs** if the op produced output from malformed input (`:2614-2617`). So an engine that faked a WAV blob would FAIL, not PASS. The scenario qualifies via `ctx.scenario.oracles.includes('graceful-failure')` (`:2606`).
- **Winner adapter**: mediabunny `src/engines/mediabunny/adapter.ts:1271` (transcode), reaching the real library at `:1287` (`openInput`) / `:1293` (`getTracks`); the rejection message originates from the vendored mediabunny core (string absent from suite source). Not a hardcoded/canned output, not an input→output copy, not a golden short-circuit, not a swallowed error reported as success — the throw propagates and is routed to graceful PASS.
- **Verdict: REAL** — real JPEG fixture + real library-driven rejection + an oracle that rewards clean failure and punishes fabricated output.
- **Cached note**: mediabunny `cached: true` (run 2026-06-22T17:09Z) and ffmpeg.wasm `cached: true` (run 2026-06-22T16:35Z). Evidence is reused, not freshly re-run. Low staleness risk for a deterministic reject-path negative test, but the 8 ms vs 122 ms latency tiebreak rests on cached single-sample (n=1) timings — treat the *magnitude* of the margin as indicative, not authoritative.

## Confidence & caveats

- **Confidence: high** on the verdict structure (this is a negative test; both PASS outcomes are genuine graceful failures; all NAs are honest). Both passing engines satisfy the identical single oracle, so "best" is a tiebreak rather than a capability gap.
- The win margin is purely latency (15.3x), measured at **n=1, cached** — a weaker basis than a multi-sample bench. If the contest were scored as a pure pass/no-fail negative guard, mediabunny and ffmpeg.wasm are effectively co-winners; mediabunny edges it on faster reject + library-validated provenance.
- No `bench{}` metrics (throughput/memory/longtasks) exist for this scenario, so secondary performance dimensions could not be compared.
