# audio-dsp/fuzz_wav_fmt_corrupt_transcode

**Family:** audio-dsp · **Fixture asset:** `fixtures/media/wav_fmt_corrupt.wav` (960 KB, real RIFF/WAVE with a zeroed `fmt ` descriptor) · **Primary metric:** wall (metrics declared: `wall`, `peakMemory`) · **Pass count:** 2 of 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` (CONTESTED — 2 engines PASS).
- **Decisive factor:** Correctness is a tie — both winners satisfy the single gating oracle `graceful-failure` by cleanly rejecting the corrupt WAV with a real library-level error (no crash/hang/OOM). The tiebreak is latency and runtime footprint: mediabunny rejects the malformed `fmt ` chunk in **18 ms** versus ffmpeg.wasm's **134 ms** — a **~7.4x faster** rejection — and does so as pure-TS ESM with **no SharedArrayBuffer / no COOP-COEP** requirement (`coopCoep: not-required`, `sharedArrayBuffer: false`), whereas ffmpeg.wasm must spin its wasm core to even probe the input.
- **Margin over runner-up:** 134 ms ÷ 18 ms ≈ **7.4x** wall (durationMs proxy; both `cached:true`, n=1 each — weak statistical evidence, see caveats). No `peakMemory` bench was emitted because both ops short-circuited on the read error before any encode/mux work.

## Per-engine results

| Engine | Status | Oracles passed (name:pass) | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | graceful-failure:true | 18 ms (durationMs) | n/a | n/a | n/a | graceful: `Tried reading [20, 22), but slice is [20, 20)` (reader hit corrupt fmt) — cached |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 134 ms (durationMs) | n/a | n/a | n/a | graceful: `[wav] wav header size < 14 is not implemented` → `Invalid data found when processing input` → `Aborted()` — cached |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | transcode: adapter cannot remap audio channel count (downmix/upmix) |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |

No `bench{}` block was present for either PASS engine; wall figures above are the recorded `durationMs` (the op aborted at the read/probe stage, so no per-metric timing series was collected).

## Why the winner wins (deep technical)

The operation is a **mono downmix transcode** (`opts: { container: 'wav', audio: { codec: 'pcm-s16', channels: 1 } }`) of a deliberately **bit-flipped RIFF `fmt ` header**. A hexdump of the fixture shows a valid `RIFF....WAVE` magic and a `fmt ` chunk tag at offset 0x0C, but the entire 20-byte fmt descriptor region (offsets 0x10–0x23) is **zeroed**: the declared fmt chunk size is `00 00 00 00`, the audio-format tag, channel count, sample rate, byte rate, block align and bits-per-sample fields are all null. The `data` chunk tag survives at 0x24 with a plausible size, and ~960 KB of real PCM-looking samples follow. This is the classic "structurally-recognizable container, semantically destroyed descriptor" fuzz case (scenario notes A.16): the parser must commit far enough to read the fmt chunk, discover it is unusable, and reject **without** trusting the zero fields (which would otherwise imply 0 channels / 0 Hz and could trigger a divide-by-zero, an unbounded allocation, or an out-of-bounds read).

**mediabunny** opens the asset through its real `Input` + format singletons path (`src/engines/mediabunny/adapter.ts:245` `openInput`, building `new mb.Input({ source: BlobSource, formats: [WAVE] })`), then drives the Conversion API (read→decode→encode→mux, `streaming-lockstep` per `configUsed.pipeline`). When the WAVE reader walks the chunk table it requests the next slice of the fmt descriptor and finds the backing range exhausted exactly at the corruption boundary — the propagated error `Tried reading [20, 22), but slice is [20, 20)` is mediabunny's own range-checked reader refusing to read past the end of a chunk whose declared size (0) does not cover the bytes the WAVE format demands. That string is **not** hardcoded anywhere in `src/engines/mediabunny/` (grep returns nothing), so it is a genuine library throw, caught by the runner, which left `ctx.output`/`ctx.demux`/`ctx.frames` undefined. The oracle (`src/core/oracles.ts:2608`) then returns PASS: "operation produced no output and did not crash/hang → handled gracefully." Crucially mediabunny does this at **18 ms** with `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required` (`configUsed`) — it never needs to instantiate a heavy wasm core to discover the header is junk, because the bounds violation surfaces during the first chunk-table walk.

**ffmpeg.wasm** is also genuinely correct but slower. Its adapter (`src/engines/ffmpeg-wasm/adapter.ts`) routes the malformed input through a real FFmpeg `exec`; the libavformat WAV demuxer emits `[wav @ ...] wav header size < 14 is not implemented` — i.e. libav read the zeroed fmt chunk size (effectively < 14, the minimum PCM `WAVEFORMAT`), refused to guess, raised `Invalid data found when processing input`, and the wasm runtime issued `Aborted()`. The adapter's untrusted-read guard (`exec(args, timeoutMs)`, documented at `adapter.ts:283`) ensures this abort is surfaced as a clean failure rather than a wedged instance. That error string is likewise not hardcoded in `src/engines/ffmpeg-wasm/` (grep empty), confirming a real demuxer rejection. But the path pays the wasm-core probe cost: **134 ms**, ~7.4x mediabunny's latency, and the broader ffmpeg.wasm engine requires SAB/threaded-core machinery that mediabunny avoids entirely.

Because both winners pass the **same** oracle at the **same** strictness (a smoke-grade robustness gate — there is no golden to bit-match here; the only correct behavior is "reject cleanly"), correctness cannot separate them. The decision falls to performance + footprint, where mediabunny dominates on every available axis: lower wall, no wasm instantiation, no cross-origin isolation requirement, pure-ESM bundle.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (graceful) but **lost on latency**: 134 ms vs 18 ms (~7.4x slower), and structurally heavier (wasm core + threaded-build provisioning) than mediabunny's pure-TS reader. Its rejection is real (`wav header size < 14 is not implemented` → `Aborted()`), just costlier to obtain.
- **mp4box@2.3.0** — `NA_ENGINE`: does not declare operation `transcode`. Honest — mp4box is an ISO-BMFF box parser/segmenter with no encode/transcode path, and never claims WAV PCM transcode.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: does not declare `transcode`. Honest — it is a read-only parser; transcoding is the sibling `remotion-webcodecs` package's job.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "adapter cannot remap audio channel count (downmix/upmix)." Honest and specific — the scenario asks for a stereo→`channels:1` downmix, and the adapter declines because it has no channel-remap stage. This NA is on the *operation capability*, not on the corruption, so it never even reached the bad header. (It would arguably be a stronger test if it had attempted and rejected, but declining a downmix it genuinely can't do is a correct NA.)
- **web-demuxer@4.0.0** — `NA_ENGINE`: does not declare `transcode`. Honest — it is a demux-only WASM wrapper, no encoder/muxer.
- **platform@chrome-149** — `NA_ENGINE`: does not declare output container `wav`. Honest — WebCodecs has no WAV muxer; the platform cannot produce a `wav` output container, so it cannot run this WAV→WAV transcode.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/audio-dsp/index.ts:606-617` (`id: 'fuzz_wav_fmt_corrupt_transcode'`), assembled via `robustnessAudioScenarios` at `index.ts:641`. `op: 'transcode'`, `asset: 'wav_fmt_corrupt.wav'`, `outContainer: 'wav'`, single oracle `graceful-failure`. Notes: "bit-flipped/fuzzed RIFF fmt header (sample-rate/format zeroed): a downmix transcode must fail gracefully on the bad descriptor."
- **Fixture exists & is real:** `fixtures/media/wav_fmt_corrupt.wav`, **960 KB**, hexdump confirms a real `RIFF/WAVE` with a genuinely zeroed `fmt ` descriptor (offsets 0x10–0x23 all `00`) and ~960 KB of trailing PCM — a real-media corruption, not synthetic/empty/mock.
- **Gating oracle:** `gracefulFailure` at `src/core/oracles.ts:2586`; the PASS branch is `oracles.ts:2608-2609` ("no output … → handled gracefully"). This is intentionally a *robustness* gate: PASS requires the op to reject (no `output`/`metadata`/`demux`/`frames`) and not crash/hang. It is **not** trivially satisfiable in the cheating sense — an engine that *produced* output from this malformed input would FAIL (`oracles.ts:2614-2617`), and an engine that hung/OOM'd would not register a clean no-output state. It is, however, a *weak/smoke-grade* gate by design: there is no bit-exact or structural comparison, only "did it fail cleanly?"
- **Winner adapter (mediabunny):** real library path — `openInput` at `src/engines/mediabunny/adapter.ts:245` (`new mb.Input` over `BlobSource` + WAVE format), Conversion-driven transcode. The failure string `Tried reading [20, 22), but slice is [20, 20)` is **not** present anywhere under `src/engines/mediabunny/` (grep empty) → genuine runtime throw, not canned output, no copy-input-to-output, no golden short-circuit.
- **Runner-up adapter (ffmpeg.wasm):** real `exec` path with untrusted-read timeout guard (`src/engines/ffmpeg-wasm/adapter.ts:283`); error strings `wav header size < 14 is not implemented` / `Invalid data found` not hardcoded in `src/engines/ffmpeg-wasm/` (grep empty) → genuine libavformat rejection.
- **Verdict:** **WEAK-GATE.** The fixture is a real corrupted WAV, both winners run real libraries and propagate authentic library errors (no mock/copy/golden cheat), and the oracle does perform the correct robustness check. But the gate is smoke-grade (a single "fail cleanly" boolean with no golden/structural comparison), so the PASS is real yet not strong correctness evidence — appropriate for a fuzz scenario, but it cannot distinguish *quality* of rejection.
- **Cached note:** **Both PASS results are `cached:true`** (mediabunny `durationMs:18`, ffmpeg.wasm `durationMs:134`). They were reused, not re-run this session; the 7.4x latency margin rests on cached n=1 timings and carries staleness risk.

## Confidence & caveats

- **Confidence: medium.** Direction of the winner is robust (mediabunny is faster *and* lighter on every axis, and both share the identical oracle outcome), but the evidence base is thin: a single boolean oracle, no `bench{}` series, `durationMs` n=1 as the only timing, and **both winners cached**. The 7.4x margin should be read as a footprint/latency indicator, not a precise benchmark.
- The win is on **performance/footprint**, not correctness — correctness is a genuine tie at smoke strength. If the suite later adds a stricter robustness assertion (e.g. require a specific error category or bounded memory), re-evaluate.
- All four NA engines look **honest**: three lack a transcode op entirely, platform lacks a WAV muxer, and remotion-webcodecs explicitly lacks channel remapping — none is an under-declared capability hiding a real ability.
