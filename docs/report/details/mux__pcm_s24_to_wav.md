# mux/pcm_s24_to_wav

- **Family:** mux
- **Fixture asset(s):** `fixtures/media/wav_s24.wav` (1.4 MB; 24-bit PCM, 48 kHz, 2 ch, 5 s) → golden `fixtures/golden/wav_s24.wav.meta.json`
- **Primary metric:** wall (no explicit `primaryMetric`; defaults to first of `MUX_METRICS`)
- **Pass count:** 2 of 7 (5 NA_ENGINE)

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (mediabunny and ffmpeg.wasm both PASS).
- **Decisive factor:** PERFORMANCE. Both engines pass the identical single gating oracle (`property-invariant` probe-duration, Δ 0.0000 s, exact). Correctness is therefore tied, so ranking falls to wall time and main-thread responsiveness.
- **Margin over runner-up (ffmpeg.wasm):**
  - wall median: 27.995 ms vs 29.395 ms → **1.05x faster** (small).
  - throughputRealtime: 178.60x vs 170.10x → **1.05x higher**.
  - longtasks: 234 ms vs 3675 ms → **15.7x less main-thread blocking** (the dominant, decisive gap).
  - All samples are **n=1** (single timed run after one warmup), so timing evidence is weak; the longtasks gap is large enough to survive that caveat.

## Per-engine results

| Engine | Status | Oracles passed | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | property-invariant:pass | 27.995 ms | 178.60x | n/a (n=0) | 234 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | **PASS** | property-invariant:pass | 29.395 ms | 170.10x | 102,530,408 B | 3675 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

This scenario is a **PCM write-target authoring test**: demux 24-bit signed-integer little-endian PCM out of a RIFF/WAVE source and re-mux it into a fresh WAV. The interesting part is not transcoding (PCM is uncompressed) but **RIFF header authoring**: the `fmt ` chunk must carry the correct `wBitsPerSample = 24` and a correct `nBlockAlign = channels * 3 = 6` bytes, and the `data` chunk must enumerate exactly 5 s × 48000 × 6 = 1,440,000 sample bytes. The scenario note (`src/scenarios/mux/write-targets.ts:87-95`) calls this out explicitly: "Exercises non-16-bit sample-size authoring in the RIFF fmt chunk (bits-per-sample / block-align must be written correctly)."

The gating oracle is `property-invariant` in PROBE_DUR mode (`src/scenarios/mux/_shared.ts:200`, token `PROBE_DUR` at `_shared.ts:77`). Its implementation (`src/core/oracles.ts:2709-2758`) re-imports the authored output through the **reference engine's** `probe()` and compares the probed output duration to the golden source duration. Both engines produced an output whose probed duration is **exactly 5.0000 s** against the golden 5.0000 s: `measurements = {outDurationSec:5, goldenDurationSec:5, deltaSec:0, durationToleranceSec:0.041666…}` (≈ ±1 frame at 24 fps). A Δ of literally 0 means both engines wrote a structurally valid WAV whose `data`-chunk byte count divides cleanly by `nBlockAlign` to recover the exact sample count — i.e. both got the 24-bit block-align math right. Correctness is a genuine tie.

The win is therefore mechanical/runtime, and it is rooted in **how each engine does the work**:

- **mediabunny** runs entirely in-process with its pure-TS ESM core (`env.configUsed.coreBuild = "pure-ts-esm"`, `backend = "webcodecs"`, `wasmThreads = 0`, `sharedArrayBuffer = false`, `coopCoep = "not-required"`). Its mux path is the Conversion/Output API (`src/engines/mediabunny/adapter.ts:1285-1307`): it opens the WAV source, builds a `WavOutputFormat` via `makeOutputFormat(opts.container, …)`, and for PCM it never needs WebCodecs encode at all (the adapter declares `audio:pcm-native` at `adapter.ts:1088` so the runner skips the browser encode/decode gate for `pcm-*`). The work is essentially a streaming byte copy of PCM samples into a freshly authored RIFF container — small, synchronous, JS-only. That is why its **longtasks total is only 234 ms**.

- **ffmpeg.wasm** also implements the operation honestly: its WAV mux validates the track set (`src/engines/ffmpeg-wasm/adapter.ts:3051-3054` — rejects video, requires exactly one PCM audio codec) and stream-copies via the prepared-sources mux path with `-c copy` (`adapter.ts:3022`, `muxPreparedSources` at `adapter.ts:2981-3037`). But it pays the wasm tax: it must `writeFile` the source into the MEMFS virtual filesystem, spin the ffmpeg wasm command processor, and read the output back. That serialized, single-threaded wasm execution shows up as a **3675 ms longtasks** figure and a **102.5 MB peakMemory** footprint — versus mediabunny's lightweight JS path. Even though wall medians are nearly equal (27.995 vs 29.395 ms — both heavily warmup-amortized for a 5 s clip → 170-179x realtime), the **15.7x longtasks gap** is the decisive runtime differentiator: mediabunny keeps the main thread responsive while ffmpeg.wasm stalls it.

Tiebreakers also favor mediabunny: no COOP/COEP requirement (`coopCoep:"not-required"`), no SharedArrayBuffer, single-thread-but-native-JS rather than monolithic wasm, and a streaming pipeline (`pipeline:"streaming-lockstep"`).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (correct, exact Δ 0 duration) but lost on performance: **15.7x more main-thread blocking** (3675 ms vs 234 ms longtasks), 1.05x slower wall (29.395 vs 27.995 ms), 1.05x lower realtime throughput, and a 102.5 MB resident footprint vs mediabunny's (uncaptured) PCM-copy path. The wasm MEMFS round-trip + single-thread command processor is the cost.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'." Honest NA. The Chrome platform path has no general muxing surface (WebCodecs encodes/decodes but does not author RIFF/WAVE containers), so declining mux is correct, not under-declared.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'wav'." Honest NA. MP4Box.js is an ISO-BMFF (MP4/MOV) tool; it cannot read a RIFF/WAVE source, so it cannot demux the PCM track to re-mux.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'." Honest NA — web-demuxer is read-only (demux/probe), with no write/author surface.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'." Honest NA — it is a parser (read side), not a muxer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'." Honest NA for this PCM/WAV write target; its surface is WebCodecs convert/transcode, not RIFF container authoring.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/mux/write-targets.ts:86-95` (id `pcm_s24_to_wav`, input `wav_s24.wav`, containersIn `['wav']`, to `wav`, audioCodecs `['pcm-s24']`). Built into a real `mux` Scenario by `buildMux`/`buildMuxAll` (`src/scenarios/mux/_shared.ts:204-233`).
- **Fixture exists:** `fixtures/media/wav_s24.wav` is a real 1.4 MB file (24-bit PCM, 48 kHz, stereo, 5 s); golden `fixtures/golden/wav_s24.wav.meta.json` confirms `container:"wav"`, `codec:"pcm-s24"`, `sampleRate:48000`, `channels:2`, `bitrate:2304000` (= 48000×6×8 — internally consistent with 24-bit stereo), `durationSec:5`. Not synthetic/empty/mock.
- **Oracle:** `property-invariant` PROBE_DUR branch, `src/core/oracles.ts:2709-2758`. It re-probes `ctx.output` through the reference engine and compares to the golden duration with a ±0.0417 s (≈1-frame) band — a real cross-container measurement, not a trivially-true gate. Measured Δ = 0.0000 s (exact), `outDurationSec:5`, `goldenDurationSec:5` — physically plausible for a faithful 5 s PCM re-mux.
- **Winner adapter:** mediabunny mux/conversion path `src/engines/mediabunny/adapter.ts:1285-1307` (real `Output` + `WavOutputFormat` via `makeOutputFormat`, real `runConversion`); PCM-native declaration at `adapter.ts:1088`; container support `containersOut` includes `wav` (`adapter.ts:1039`) and `pcm-s24` (`adapter.ts:1041`). No canned output, no input→output copy fake, no golden short-circuit, no error swallowing — it genuinely authors a new RIFF/WAVE.
- **Verdict: WEAK-GATE.** Implementation and fixture are real, but the *only* gate that fires is `property-invariant:probe-duration`. That gate verifies duration (and therefore sample-count integrity), but it does **not** verify the bit-depth/block-align bytes per se, and does not compare decoded PCM bit-exactly against the golden (no `decoded-audio-pcm` or `golden-packets` oracle is attached for this WAV-sourced cell — `defaultOracles` only adds `reference-reimport` for ISO-BMFF sources, `_shared.ts:184-190`). So the PASS is real but proxied through duration, not a strong correctness gate for the 24-bit authoring claim. No evidence of cheating.
- **Cached note:** BOTH PASS results have `cached==true` ("cached previous PASS result"; mediabunny startedAt 2026-06-22T13:55Z, ffmpeg 2026-06-22T16:49Z). Results were reused, not re-run this session — staleness risk per the launcher-seeding caveat. Timing samples are n=1, so treat margins as indicative only.

## Confidence & caveats

- Correctness tie is solid (both Δ 0.0000 s, exact). The winner call rests on the **15.7x longtasks** gap, which is robust to the n=1 timing noise; the wall/throughput margins (~1.05x) alone would be too thin to decide.
- Both PASS entries are cached and n=1; a fresh re-run is advisable for honest timing.
- The gate is a duration proxy (WEAK-GATE): it does not bit-exactly validate the 24-bit `fmt ` chunk authoring that the scenario nominally targets. A `decoded-audio-pcm` oracle would strengthen this cell.
- mediabunny's peakMemory was not captured (n=0), so the memory comparison is one-sided (ffmpeg 102.5 MB known; mediabunny unknown but expected lower given the JS PCM-copy path).
- Confidence: **medium**.
