# robustness/fuzz_mp3_header_truncated_probe

family: robustness | fixture asset: `fuzz_mp3_header_truncated.mp3` (fixtures/media/, 64 KB, real) | primaryMetric: wall (declared metrics: wall, peakMemory) | passCount: 4 / 7

## Verdict

- Best framework: **remotion-media-parser@4.0.479** (CONTESTED — 4 of 7 engines PASS).
- Decisive factor: All four passing engines satisfy the *same single* oracle (`graceful-failure`), which is a binary did-not-crash/hang robustness gate with no correctness ladder to separate them. Correctness strength is therefore identical across the four. The tiebreak falls to **performance (wall time)**. The shard carries no `bench{}` block for any engine, so the only timing signal is `durationMs`. remotion-media-parser completes in **8 ms**, the fastest of the four.
- Margin over runner-up: 8 ms vs remotion-webcodecs 9 ms = **1.13x faster wall**; vs mediabunny 13 ms = **1.63x**; vs ffmpeg.wasm 176 ms = **22x**. This is a very thin lead over the runner-up (1 ms, n is effectively 1 per engine — no MAD/p95 spread available), so the "win" is low-confidence and is really a four-way tie on the only gate that matters here.

Note on character of the PASS: mediabunny and ffmpeg.wasm pass by *returning partial/safe output* (a bounded frame scan that recovered something from the headerless stream); remotion-media-parser and remotion-webcodecs pass by *cleanly rejecting* with "Unknown file format" (no output). The scenario notes explicitly allow either path ("falls back to a bounded frame scan **or** rejects — never loops"), and `options.gracefulAllowOutput: true` makes both acceptable.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | graceful-failure:pass | n/a (durationMs 8) | n/a | n/a | n/a | cached: graceful: Unknown file format (no output) |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | n/a (durationMs 9) | n/a | n/a | n/a | cached: graceful: Unknown file format (no output) |
| mediabunny@1.48.0 | PASS | graceful-failure:pass | n/a (durationMs 13) | n/a | n/a | n/a | cached previous PASS; returned partial/safe output |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | n/a (durationMs 176) | n/a | n/a | n/a | cached previous PASS; returned partial/safe output |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |

(No `bench{}` object is present in the shard for any engine; throughputRealtime / peakMemory / longtasks were not recorded for this robustness probe. wall is shown as the engine `durationMs`.)

## Why the winner wins (deep technical)

The input is a raw MPEG-1 Layer III elementary stream whose **ID3v2 tag and Xing/Info VBR header have been dropped** (notes: "Drop ID3/Xing head"). The hexdump confirms it: the file begins `00 00 01 80 00 00 fa 92 ...` — there is no `ID3` magic and no `FF Fx` MP3 frame-sync nibble at offset 0; the canonical sync/seek-table that a probe would normally key off has been truncated away. A correct probe must therefore either (a) bounded-scan forward for a plausible `FFE` sync word and decode the first valid frame header to recover sample-rate/bitrate/channel-mode, or (b) reject the buffer as unrecognized — and in **neither** case spin in an unbounded resync loop. That is exactly what the `graceful-failure` oracle enforces (src/core/oracles.ts:2586-2623): with `family === 'robustness'`, if the op produced no output it PASSes (line 2608-2609), and if it produced output AND `options.gracefulAllowOutput === true` it also PASSes (line 2611-2612, gate at line 2625-2628). The only way to FAIL is to crash/hang (caught upstream by the runner) or to emit output when output is disallowed — neither applies here.

remotion-media-parser took path (b): `reason: "cached: graceful: Unknown file format"`. Its `env.configUsed` shows `backend: "cpu-js"`, `pipeline: "streaming"`, `reader: "webReader"`, `fieldsTier: "metadata-only"`, `worker: false`. The streaming web reader pulls bytes lazily and the parser dispatches on container magic; finding neither a valid ID3 header nor an MP3 frame sync at the stream head, it throws `Unknown file format` immediately rather than buffering the 64 KB and brute-forcing a resync. Because nothing is buffered and no sample scan is attempted, it returns control in **8 ms** — the cheapest possible graceful outcome. That early-exit-on-unrecognized-magic plus metadata-only field tier (it was never going to decode audio) is precisely why it edges out the others on wall time.

The runner-up, remotion-webcodecs (9 ms), took the same reject path (`"Unknown file format"`, `backend: "webcodecs"`, `pipeline: "streaming-backpressure"`) — functionally identical behavior, 1 ms slower, within noise. mediabunny (13 ms) took the *recovery* path: its probe opens the input through the real mediabunny `Input` API and reads metadata via the cheap, bounded `getDurationFromMetadata()` first, only falling back to a scan if needed (src/engines/mediabunny/adapter.ts:417-473, duration logic at 427-441; every track/codec read is wrapped in `.catch()` at lines 298-340 so a malformed track degrades to `null` instead of throwing). For a headerless MP3 this bounded read returns a partial/safe result — a genuinely *more useful* robustness behavior than outright rejection — and the oracle credits it via the `gracefulAllowOutput` branch. It pays ~5 ms more than the pure-reject engines for that recovery work. ffmpeg.wasm also recovers partial output but at **176 ms / 22x** the winner: the libavformat probe runs inside single-thread wasm, and even a bounded `av_probe_input_format` + frame scan carries the wasm module/marshalling overhead, making it the slowest passer by an order of magnitude.

So the winner does not win on correctness (the gate is identical for all four) — it wins because, for a *reject-is-acceptable* robustness probe, the cheapest correct action is to recognize "no valid header" and bail without buffering, and remotion-media-parser's streaming metadata-only reader does exactly that fastest.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASSed identically (rejected with "Unknown file format", no output) but 1 ms slower (9 ms vs 8 ms = 1.13x). Effectively a tie; lost only on a sub-noise wall margin with n≈1.
- **mediabunny@1.48.0** — PASSed via the partial-output recovery path (13 ms = 1.63x slower). Not "wrong" at all — arguably the more useful behavior — but it pays for the bounded metadata read it performs while the winner exits on magic mismatch.
- **ffmpeg.wasm@0.12.15** — PASSed via partial-output recovery but at 176 ms (22x slower). The libavformat probe + frame scan running in single-thread wasm dominates wall time; correct, just expensive.
- **platform@chrome-149** — NA_ENGINE: `containersIn: ['mp4','mov','webm','mkv','wav']` (src/engines/platform/adapter.ts:240) does not include `mp3`. Honest NA — the WebCodecs/MediaSource platform path has no raw-MP3 elementary-stream demuxer declared.
- **mp4box@2.3.0** — NA_ENGINE: `containersIn: ['mp4','mov']` (src/engines/mp4box/adapter.ts:645). Honest NA — MP4Box.js is an ISO-BMFF parser; it treats `mp3` only as an audio *codec* token (adapter.ts:144), never as an input container, so the registry correctly gates it out.
- **web-demuxer@4.0.0** — NA_ENGINE: `containersIn: ['mp4','mov','mkv','webm','ts']` (src/engines/web-demuxer/adapter.ts:639). It lists `mp3` among its audio *codecs* (adapter.ts:645) but not as an input container, so a raw-MP3 container input is honestly out of scope.

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:319-327 (`id: 'fuzz_mp3_header_truncated_probe'`, `asset: 'fuzz_mp3_header_truncated.mp3'`, `op: 'probe'`, `containersIn: ['mp3']`, `audioCodecs: ['mp3']`, `options.gracefulAllowOutput: true`, oracle `graceful-failure` wired at index.ts:355). Notes (line 326): "Drop ID3/Xing head; probe falls back to a bounded frame scan or rejects — never loops."
- Fixture: `fixtures/media/fuzz_mp3_header_truncated.mp3` **exists** (64 KB). Hexdump head `00 00 01 80 00 00 fa 92 ...` confirms a real, deliberately header-truncated MP3 (no `ID3` magic, no `FFEx` sync at offset 0) — a genuine corrupted-media fixture, not synthetic/empty/mock.
- Oracle: src/core/oracles.ts:2586-2628. It is a real branch-checked robustness gate, NOT trivially-always-pass: it FAILs if a `signal:crash|hang|timeout|oom` marker is present (line 2592-2594) or if output is produced when `gracefulAllowOutput` is not set (line 2614-2617). For this scenario it is satisfiable by no-output (line 2609) or by allowed partial output (line 2612). This is a **smoke-level / robustness gate**, not a bit-exact or structural correctness oracle — the PASS is real but weak.
- Winner adapter: remotion-media-parser reject path produces the recorded `reason: "graceful: Unknown file format"`; the comparison engine (mediabunny) probe path is genuine library use — src/engines/mediabunny/adapter.ts:417-473 calls the real mediabunny `Input` API (`getDurationFromMetadata`, `getTracks`, per-track `getCodec/getSampleRate/...` each `.catch()`-guarded at 298-340). No canned output, no copy-input-to-output, no short-circuit to a golden, no swallow-and-report-success: the catches degrade fields to null, they do not fabricate a PASS.
- Cached note: **all four PASS results have `cached: true`** (mediabunny "cached previous PASS result"; ffmpeg.wasm "cached previous PASS"; remotion-media-parser/remotion-webcodecs "cached: graceful: ..."). Evidence is reused, not freshly re-run, so the 1 ms winner margin is staleness-exposed. Per the launcher seeding caveat this should be confirmed against a fresh run before treating the ranking as load-bearing.
- Verdict: **WEAK-GATE.** Real fixture + real implementations + a meaningful-but-loose oracle. The gate only proves "did not crash/hang and respected the output policy" — it cannot distinguish the recovery-quality of the four passers, and the winner is chosen purely on a sub-2x, cached, n≈1 wall margin.

## Confidence & caveats

- Confidence: **low.** Four-way correctness tie on a single smoke-level oracle; winner selected on an 8 ms vs 9 ms wall gap with no `bench{}`, no MAD/p95, and `cached: true` on every entry.
- The "winner" rejects the input while two other passers actually recover partial metadata — by a usefulness standard mediabunny/ffmpeg.wasm arguably did *more*, but the suite's oracle and the perf tiebreak reward the cheapest graceful exit.
- All three NA_ENGINE verdicts are honest container-scope gates (none declares `mp3` as an input container), verified against each adapter's `containersIn`.
- If a fresh (non-cached) run is available, re-rank: a 1 ms lead is well within run-to-run jitter and could flip between remotion-media-parser and remotion-webcodecs.
