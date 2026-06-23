# robustness/edge_audio_only_micro_probe

- **Family:** robustness
- **Fixture asset:** `fixtures/media/micro_audio_short.m4a` (real 1.4 KB audio-only M4A; AAC, 1 audio track, no video)
- **Golden:** `fixtures/golden/micro_audio_short.m4a.meta.json` (container `mp4`, duration 0.1s, 1 audio track: aac/44100/1ch)
- **Op:** `probe` (metadata-only track enumeration)
- **primaryMetric:** wall-time (durationMs) — no per-metric `bench{}` block emitted for this micro probe; durationMs is the only timing signal
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (all 7 engines PASS).
- **Decisive factor:** correctness is a dead heat (every engine passes the single `golden-metadata` gate, all with duration deltas far inside the strict ±0.0417s / ±1-frame band), so the tiebreaker is **wall-time**. mediabunny is the fastest at **8 ms**.
- **Margin over runner-up:** mp4box is the runner-up at 9 ms → mediabunny is **1.13x faster** (8 ms vs 9 ms). Both are an order of magnitude faster than the wasm engines (ffmpeg-wasm 178 ms, web-demuxer 213 ms) and ~746x faster than the `platform` baseline (5966 ms). NOTE: the timing margin over mp4box is 1 ms on a single cached sample (n=1, cached==true) — extremely weak evidence; mediabunny and mp4box are effectively tied.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true (Δdur 1.39e-17s, tol 0.0417s) | 8 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:true (Δdur 0s, tol 0.0417s) | 9 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true (Δdur 0s, tol 0.0417s) | 13 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true (Δdur 0s, tol 0.0417s) | 14 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true (Δdur 0s, tol 0.0417s) | 178 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true (Δdur 1.39e-17s, tol 0.0417s) | 213 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true (Δdur 0.0232s, tol 0.0417s) | 5966 ms | n/a | n/a | n/a | cached previous PASS result |

(No `throughputRealtime` / `peakMemory` / `longtasks` were recorded in the shard for this metadata-only probe — those columns are n/a for all engines.)

## Why the winner wins (deep technical)

This scenario (`src/scenarios/robustness/index.ts:617-627`, §A.16) is a **track-enumeration robustness probe**: a real audio-only `.m4a` (an MP4/`isom` container carrying exactly one AAC track and *no* video track). The robustness hazard is that a naive demuxer assumes a video track exists (synthesizing a phantom `track[0]`, reading width/height off a non-existent `tkhd`, or crashing on a null video sample table). The `golden-metadata` oracle (`src/core/oracles.ts:595-657`) gates on this: it compares `container`, `durationSec` (within tolerance), and positionally-matched tracks — codec, sampleRate, channels — against the golden, which encodes the truth of "exactly one audio track, no video."

Because the payload is tiny (0.1s of AAC, 1.4 KB) and the op is metadata-only, the demux/decode workloads collapse to nearly nothing; the entire contest reduces to **container-parse overhead and engine startup latency**. All seven engines correctly enumerate one AAC track and report the `isom`/mp4 container, so the `golden-metadata` gate passes for all. The only differentiators are (1) duration-delta tightness and (2) wall-time.

On **correctness tightness**: every engine lands inside the strict ±0.04167s (≈1 frame at 24fps) band that `durationToleranceFor` (`oracles.ts:240-254`) applies to precise containers — mp4 is NOT in the loose set (`LOOSE_DURATION_CONTAINERS` = ts/adts/hls), so the strict band is enforced. mediabunny, remotion-media-parser, remotion-webcodecs, mp4box, ffmpeg-wasm all report Δdur ≈ 0 (mediabunny 1.39e-17s is floating-point zero; mp4box/ffmpeg/remotion exactly 0); web-demuxer 1.39e-17s. The lone outlier is `platform` at Δdur **0.0232s** — 56% of the way to the tolerance ceiling — because the platform path derives duration through Chrome's media element (`<video>`/WebCodecs) rather than reading the `mvhd` movie duration directly, picking up sample-rounding drift. It still passes, but it is the *least* exact and by far the slowest.

On **wall-time**: mediabunny's `probe()` (`src/engines/mediabunny/adapter.ts:1134-1141`) is a thin, allocation-light path — `openInput()` then `metadataFromInput()`, with `mbInput.dispose()` in a `finally`. mediabunny is a pure-TS ESM core (`env.configUsed.coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`) that parses the MP4 box tree in-process without spinning up a wasm runtime, so for a 1.4 KB file it reads the `moov`/`mvhd`/`trak` boxes and returns in **8 ms**. mp4box (pure-js box parser, `whole-file-append`) is essentially the same class of work at 9 ms. The two wasm engines pay their module-instantiation / FS-mount tax: ffmpeg.wasm 178 ms (single-thread, `ffprobe`-style invocation) and web-demuxer 213 ms (libav wasm). The `platform` engine is catastrophically slow here (5966 ms) because routing an audio-only probe through the browser media stack (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`) incurs full media-element load/seek latency for a job that needs only header parsing — a structural mismatch for metadata-only probing.

The decisive factor is therefore **wall-time on identical correctness**, and mediabunny edges mp4box 8 ms vs 9 ms (1.13x), with both crushing the wasm and platform paths.

## What each other framework did wrong

- **mp4box@2.3.0 (PASS, runner-up):** correct and nearly as fast (9 ms, Δdur 0s, *tighter* duration than mediabunny's 1.39e-17), but 1 ms slower wall on the tiebreaker. The gap is 1 ms on n=1 cached — effectively a tie, mediabunny wins only on the literal number.
- **remotion-media-parser@4.0.479 (PASS):** correct, Δdur 0s, but 13 ms (1.63x slower than mediabunny). cpu-js, `fieldsTier: "metadata-only"` — fine, just not the fastest box reader.
- **remotion-webcodecs@4.0.479 (PASS):** correct, Δdur 0s, 14 ms (1.75x slower). WebCodecs backend overhead is unnecessary for a header-only probe.
- **ffmpeg.wasm@0.12.15 (PASS):** correct, Δdur 0s, but 178 ms (22x slower than mediabunny) — wasm module/FS overhead dominates a 1.4 KB probe.
- **web-demuxer@4.0.0 (PASS):** correct, Δdur 1.39e-17s, but 213 ms (27x slower) — libav-wasm instantiation cost.
- **platform@chrome-149 (PASS):** correct but the *weakest* on both axes — Δdur 0.0232s (largest, 56% of tolerance) and 5966 ms (746x slower) because the audio-only probe is routed through the browser media element / VideoDecoder stack instead of a direct header parse.

## Anti-cheat validation

- **Scenario:** `src/scenarios/robustness/index.ts:617-627` — id `edge_audio_only_micro_probe`, op `probe`, asset `micro_audio_short.m4a`, container mp4, audio codec aac, oracle `golden-metadata`. Notes (§A.16) explicitly state the gate is track enumeration: "report exactly the audio track and NOT assume/synthesize a video track; golden has the truth."
- **Fixture exists and is real:** `fixtures/media/micro_audio_short.m4a` present, 1.4 KB — a genuine (tiny) AAC M4A, not empty/synthetic/mock. The golden `fixtures/golden/micro_audio_short.m4a.meta.json` encodes the physically-plausible truth (mp4, 0.1s, 1 audio aac/44100/1ch/36033bps/und). A matching `.packets.json` golden also exists.
- **Oracle:** `src/core/oracles.ts:595-657` (`goldenMetadata`). Performs a REAL field-by-field comparison: container string, duration within a strict per-container band (`durationToleranceFor`, lines 240-254 — mp4 is NOT loose, so the strict ±0.0417s gate applies), and positional per-track codec/sampleRate/channels (`compareTrack`, lines 659+). It fails on track-count mismatch — so a phantom video track WOULD fail it. Not trivially satisfiable. The measured `durationDeltaSec` values (≈0 for six engines, 0.0232 for platform) are physically plausible for a 0.1s clip.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1134-1141` — `probe()` calls the real library: `openInput(this.lib, input)` → `metadataFromInput(mbInput)` → `dispose()`. No canned output, no copy-to-fake, no short-circuit to the golden, no error swallowing. Genuine mediabunny box parse.
- **Cached note:** ALL seven engines have `cached==true` (`reason: "cached previous PASS result"`). The PASS verdicts and Δdur measurements are real but were REUSED, not re-run in this batch — so the 8 ms vs 9 ms timing is single-sample, cached evidence. The correctness conclusion (all 7 pass) is solid; the *ranking* between mediabunny and mp4box is fragile (1 ms, n=1, stale timing).
- **Verdict: REAL** — real fixture + real mediabunny implementation + a meaningful, non-trivial metadata oracle that would catch the very robustness failure (phantom video track) the scenario targets. The only caveat is the loose/weak *tiebreaker* (timing on cached n=1), not the gate itself.

## Confidence & caveats

- **Confidence: medium.** The PASS/correctness picture is high-confidence (real oracle, real fixture, real adapter, all deltas inside a strict band). The *winner selection* is low-confidence: mediabunny beats mp4box by 1 ms on a single cached measurement with no `bench{}` spread (no n, mad, or p95). If re-run, mp4box (9 ms, and a tighter Δdur of exactly 0) could plausibly take the lead — they are functionally tied.
- This is a metadata-only micro probe, so there is no decode/bit-exact oracle to separate engines on correctness strength; `golden-metadata` is the strongest gate available for a probe op (structural/metadata-exact tier), so this is NOT a weak-gate concern — it is the appropriate gate.
- `platform` is a legitimate PASS but a clear architectural outlier (746x slower, largest duration drift) — useful as the "browser-native baseline" reference, not a contender here.
- All timings are cached; treat absolute ms as historical, not freshly measured.
