# mux/aac_to_adts

family: mux | fixture asset: `fixtures/media/aac_adts.aac` (164 KB, exists) | primaryMetric: `wall` | passCount: 2 / 7

## Verdict

**Best framework: `mediabunny@1.48.0`** — CONTESTED (2 PASS: mediabunny and ffmpeg.wasm).

Both winners pass the **identical** gating oracle (`property-invariant` / probe-duration) with the **same** measurement (Δ 0.0043s ≤ 1.5047s tolerance), so correctness strength is a dead tie. The decision falls to **performance**, where the primary metric is `wall`.

**Decisive factor:** wall-clock median. mediabunny 7.445 ms vs ffmpeg.wasm 9.825 ms → **mediabunny is 1.32x faster wall** and **1.32x higher realtime throughput** (1347.35x vs 1020.97x). Secondary tiebreaker reinforces it: mediabunny runs on the **hardware WebCodecs backend** (`backend: webcodecs`, `hwAccel: prefer-hardware`, `coopCoep: not-required`, `sharedArrayBuffer: false`) whereas ffmpeg.wasm is **single-thread wasm** (`wasmThreads: 0`). The one metric ffmpeg.wasm leads on — longtasks (1017 ms vs mediabunny's 4223 ms) — is a secondary metric and does not override the primary `wall` win.

Caveat: both winning rows are `cached: true`, n==1 (single sample, mad==0), so the margin is real-but-thin evidence.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | property-invariant:pass | 7.445 ms | 1347.35x | n/a (0 samples) | 4223 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 9.825 ms | 1020.97x | n/a (0 samples) | 1017 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

**The operation.** This is a WRITE-target scenario (`src/scenarios/mux/write-targets.ts:108-117`): take a video-less AAC elementary stream (`aac_adts.aac`), demux its AAC access units, and re-mux them into a raw **ADTS** elementary stream — re-emitting one 7-byte ADTS header per AAC frame (ISO 13818-7), no ISO-BMFF/Matroska container. ADTS is exercised here as a *target*, which is why most engines decline (see below) and why no `playback-smoke` oracle applies (a raw `.aac` stream is not `<video>`-playable). The notes call this out explicitly.

**The gate.** The single gating oracle is `property-invariant` resolved to the **probe-duration** branch (`src/core/oracles.ts:2709-2759`). It re-probes the *authored* ADTS output through the reference engine and compares its duration to the golden source duration. Both engines produced `outDurationSec: 10.0267` against `goldenDurationSec: 10.031`, a delta of **0.0043s** — well inside the tolerance of **1.5047s**. The tolerance is loose because ADTS is in `LOOSE_DURATION_CONTAINERS` (`src/core/oracles.ts:211`): a raw elementary stream has no container-level duration box, so its probed duration is a frame-count estimate (±1 AAC frame of encoder delay / partial final frame). The band is `max(LOOSE_DURATION_ABS_SEC=0.5s, LOOSE_DURATION_REL=0.15 × goldenDur=10.031s) = 1.5047s` (`src/core/oracles.ts:212-213, 240-253, 2740-2743`). Note that the actual measured Δ (0.0043s) is ~350x tighter than the band — both engines reframed the AAC AUs essentially losslessly; the looseness reflects the container's inherent imprecision, not a sloppy gate.

**Mechanistically why mediabunny is faster.** mediabunny muxes via the native `Output` + `EncodedAudioPacketSource` API (`src/engines/mediabunny/adapter.ts:1508-1551`): it constructs `EncodedPacket`s directly from the demuxed AAC chunks (data + pts/duration from `ptsUs/durationUs`, `src/engines/mediabunny/adapter.ts:1562-1569`), attaches the AAC decoder config (AudioSpecificConfig) only on the first packet so the muxer can author codec-private state (`adapter.ts:1582-1590`), and writes the ADTS framing in pure-TS. The configured pipeline is `streaming-lockstep` on the WebCodecs backend with `prefer-hardware` and **no COOP/COEP requirement** (`env.configUsed`), so there is no wasm bootstrap, no MEMFS round-trip, and no FFmpeg process spin-up per call. That yields the 7.445 ms wall and 1347.35x realtime.

ffmpeg.wasm reaches the same correctness but pays a structural tax: its mux path **reconstructs a demuxable elementary stream in MEMFS** and then `-c copy` muxes it (`src/engines/ffmpeg-wasm/adapter.ts:491-686`). For AAC it wraps each raw access unit in a hand-built 7-byte ADTS header (`adtsWrap`, `adapter.ts:646-686`) before handing the bytes to the single-thread wasm core (`wasmThreads: 0`). That FS write + exec round-trip is the source of the ~2.4 ms (1.32x) wall gap and the lower 1020.97x throughput. Interestingly ffmpeg.wasm logs far fewer longtasks (1017 ms vs mediabunny's 4223 ms) — mediabunny's WebCodecs/worker hand-offs generate more main-thread long-task accounting — but `wall` is the scenario's primary metric and mediabunny wins it outright.

Both runs report `peakMemory` with **0 samples** (n==0) — memory was not captured for this scenario, so it cannot break the tie; the decision rests on `wall` + `throughputRealtime` + the hardware-vs-wasm backend tiebreaker.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (genuine ADTS reframe via MEMFS + `-c copy`), but lost on the primary `wall` metric: 9.825 ms vs 7.445 ms (**1.32x slower**) and 1020.97x vs 1347.35x throughput (**0.76x**). Single-thread wasm (`wasmThreads: 0`) with an FS round-trip per call vs mediabunny's hardware-WebCodecs streaming pipeline. Its only metric lead (longtasks 1017 ms) is secondary.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — remotion-media-parser is a read/parse-only library, no muxing API. Correct NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — its name and scope are demux-only. Correct NA.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'adts'". Honest — mp4box is ISO-BMFF only; it has no raw-ADTS reader, so it cannot ingest the `.aac` elementary-stream input. Correct NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — it is a transcode/convert wrapper, not a packet muxer for raw ADTS targets. Correct NA.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — there is no native browser API to author a raw ADTS elementary stream (WebCodecs encodes, MediaRecorder targets WebM/MP4, not ADTS). Correct NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/mux/write-targets.ts:108-117` — id `aac_to_adts`, input `aac_adts.aac`, containersIn `['adts']`, to `adts`, audioCodecs `['aac']`. Notes confirm the intended ADTS WRITE path (re-emit per-frame ADTS headers).
- **Fixture:** `fixtures/media/aac_adts.aac` exists, 164 KB — a real AAC ADTS elementary stream, not synthetic/empty/mock. Golden duration 10.031s is physically plausible for a ~164 KB AAC clip.
- **Oracle:** `src/core/oracles.ts:2709-2759` (probe-duration branch of `property-invariant`). It does a REAL comparison: re-probes the authored output via the reference engine and diffs against the golden duration; loose band justified by ADTS being container-duration-less (`oracles.ts:211, 2740-2743`). Measured Δ 0.0043s is ~350x inside the band, so this is not a "anything passes" gate even though the band is wide — both engines reframed near-losslessly.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1508-1600` — genuine `Output`/`EncodedAudioPacketSource` mux building real `EncodedPacket`s from demuxed AAC chunks with first-packet decoder config. No canned output, no input→output copy, no short-circuit to golden, no swallowed errors (unsupported codec throws, `adapter.ts:1538`).
- **Verdict: WEAK-GATE.** The implementation and fixture are fully real (would be REAL on those grounds), but the *single* gating oracle is a loose probe-duration proxy (±1.5s band on a 10s clip) with no bit-exact / golden-packet / decoded-frame check. The PASS is genuine but not a strong correctness proof — duration survival does not verify per-frame ADTS header correctness or sample-accurate framing.
- **Cached note:** both winning rows are `cached: true` ("cached previous PASS result"), n==1, mad==0 — results were reused, not re-run. Per the launcher seeding caveat, the thin single-sample timings carry staleness risk; the winner ordering would hold unless a fresh run materially shifts wall timings.

## Confidence & caveats

- Confidence: **medium.** Adapter code, oracle, fixture, and capability declarations are all verified and consistent; the winner ordering is unambiguous on the primary `wall` metric.
- Correctness is a true tie (identical oracle + identical 0.0043s measurement); the win is purely a 1.32x performance margin plus the hardware-WebCodecs-vs-single-thread-wasm tiebreaker.
- Weakening factors: gate is loose (probe-duration only, WEAK-GATE); both rows cached with n==1 (mad==0, p95==median) so the 1.32x margin is single-sample evidence; peakMemory uncaptured (0 samples) so it could not contribute. ffmpeg.wasm's lower longtasks (1017 vs 4223 ms) is a genuine secondary-metric strength that a different metric priority could elevate.
