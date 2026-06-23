# robustness/fuzz_webm_header_truncated_demux

family: robustness | fixture asset: `fuzz_webm_header_truncated.webm` (9.3 MB, real) | primaryMetric: durationMs (wall) | passCount: 5 / 7

## Verdict

- **Best framework: `mediabunny@1.48.0`** (CONTESTED — 5 of 7 engines PASS the single gating oracle).
- **Decisive factor:** all five passing engines satisfy the *same* smoke-grade `graceful-failure` oracle identically (each rejected the destroyed-header WebM with a clean throw and produced no demux output). Correctness is therefore a tie. The tiebreaker is performance, where mediabunny rejects the input in **6 ms** wall — the fastest of all engines.
- **Margin over runner-up:** runner-up is `remotion-media-parser` at **14 ms**, so mediabunny is **~2.3x faster** (6 ms vs 14 ms). Versus the rest: remotion-webcodecs 21 ms (~3.5x), web-demuxer 63 ms (~10.5x), ffmpeg.wasm 303 ms (~50x). Note: the shard carries no `bench{}` block for this scenario — only per-run `durationMs` (n==1, cached) — so the timing margin is single-sample evidence and should be read as directional, not a tight statistical win.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 6 ms | n/a | n/a | n/a | cached: graceful: Input has an unsupported or unrecognizable format. |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | 14 ms | n/a | n/a | n/a | cached: graceful: Unknown file format |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 21 ms | n/a | n/a | n/a | cached: graceful: Unknown file format |
| web-demuxer@4.0.0 | PASS | graceful-failure:true | 63 ms | n/a | n/a | n/a | cached: graceful: get_media_info failed: undefined |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 303 ms | n/a | n/a | n/a | cached: graceful: demux failed to open input (framecrc exit 1) — "Invalid data found when processing input \| Aborted()" |
| platform@chrome-149 | NA_ENGINE | — | 5698 ms | n/a | n/a | n/a | platform engine: demux is NA — raw platform demux only supports progressive MP4/MOV and WebM/MKV |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

(The shard reports no `bench{}` per-metric medians for this scenario; throughputRealtime / peakMemory / longtasks are not measured for a reject-only op. Wall is the raw per-run `durationMs`.)

## Why the winner wins (deep technical)

This is a negative/robustness test, not a throughput test. The fixture is a 9.3 MB WebM whose **EBML header has been destroyed** — the first 0x50 bytes are zeroed (confirmed by hexdump: bytes `0x00..0x4F` are all `00`), so the leading `1A 45 DF A3` EBML magic and the `Segment` ID that a Matroska parser keys on are gone. The interior of the file is otherwise intact real media (libavformat muxer strings `LavfWA`/`LavfD` and a `SeekHead`/`Cluster` element ID `0x114D9B74`/`0x1654AE6B` appear at offset 0x60–0x70), so this is a true "interrupted/corrupt head, valid body" fuzz case carrying a VP9 video track (per scenario `videoCodecs: ['vp9']`).

The scenario (`src/scenarios/robustness/index.ts:293-300`) declares `op: 'demux'`, `containersIn: ['webm']`, and crucially has **no `gracefulAllowOutput` option**. The gating oracle `gracefulFailure` (`src/core/oracles.ts:2586-2623`) therefore demands the strict form: because `ctx.scenario.family === 'robustness'` sets `hasGracefulSignal`, a PASS requires that the op produced **no** `output/metadata/demux/frames` (`oracles.ts:2607-2610`). Any engine that emitted a partial packet table from this mangled container would `fail` at `oracles.ts:2614-2617`. So the bar is: detect the destroyed header and throw/reject *before* yielding any packets.

mediabunny's demux path (`src/engines/mediabunny/adapter.ts:1152-1183`) is a genuine library call: it constructs `new mb.Input({ formats: ALL_FORMATS, source: BlobSource })` via `openInput` (`adapter.ts:245-276`), then calls `mbInput.getTracks()` and iterates `new EncodedPacketSink(track).packets(..., { verifyKeyPackets: true })`. With `ALL_FORMATS` and no container hint, mediabunny's format sniffer probes the leading bytes; finding no valid EBML/Matroska magic (nor any other recognizable signature, since the head is zeroed) it raises **"Input has an unsupported or unrecognizable format."** at the `getTracks`/open stage — *before* the packet loop runs — so zero packets are emitted. The runner catches that throw and routes to the graceful PASS. Mechanistically mediabunny is fastest (6 ms) because its TS-native sniffer fails fast on the first probe read: it never spins up a wasm core (its config here is `backend: webcodecs`, `coreBuild: pure-ts-esm`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required`) and never has to read/seek through 9.3 MB to discover there is no parseable structure. It rejects on the header sniff alone.

By contrast the other passers reach the same correct outcome via heavier machinery: ffmpeg.wasm (303 ms, ~50x slower) must instantiate its Emscripten wasm core, mount `op1.in`, and let libavformat's probe fail with "Invalid data found when processing input" / `Aborted()` (framecrc exit 1) — orders of magnitude more startup cost for an identical reject. web-demuxer (63 ms) routes through its own wasm `get_media_info` which returns `undefined`. The two remotion engines fail their JS parser with "Unknown file format" (14 ms / 21 ms). Correctness is identical across all five; mediabunny simply pays the least to arrive there.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on speed only. Its `cpu-js` streaming parser ("Unknown file format") takes 14 ms, ~2.3x mediabunny's 6 ms. No correctness deficit.
- **remotion-webcodecs@4.0.479** — PASS, lost on speed. 21 ms ("Unknown file format"), ~3.5x slower; same single graceful oracle.
- **web-demuxer@4.0.0** — PASS, lost on speed. 63 ms; its wasm `get_media_info` returns `undefined` and the runner treats that as a clean reject. ~10.5x slower.
- **ffmpeg.wasm@0.12.15** — PASS, lost on speed. 303 ms; libavformat correctly rejects ("Invalid data found…", framecrc exit 1, `Aborted()`) but the wasm core startup makes it ~50x slower.
- **platform@chrome-149** — NA_ENGINE (honest). Reason: "raw platform demux only supports progressive MP4/MOV and WebM/MKV" — the platform path has no standalone packet-level demux API to exercise; the NA is a genuine capability gap, not under-declaration. (Its 5698 ms is NA bookkeeping, not a measured demux.)
- **mp4box@2.3.0** — NA_ENGINE (honest). "engine does not declare input container 'webm'" — MP4Box.js is an ISO-BMFF (MP4) parser and legitimately does not handle the Matroska/WebM container, so it cannot contest a WebM demux.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:293-300` — `id: 'fuzz_webm_header_truncated_demux'`, `asset: 'fuzz_webm_header_truncated.webm'`, `op: 'demux'`, `containersIn: ['webm']`, `videoCodecs: ['vp9']`, notes "EBML header destroyed; demux must reject cleanly." No `gracefulAllowOutput`, so the strict no-output branch of the oracle is in force.
- **Fixture exists & is real:** `fixtures/media/fuzz_webm_header_truncated.webm`, 9.3 MB. Hexdump confirms the mutation is genuine — first 0x50 bytes zeroed (EBML magic destroyed) while the body retains real libavformat muxer strings and a valid `SeekHead`/`Cluster` element structure. Not synthetic, not empty, not a mock.
- **Oracle:** `gracefulFailure` at `src/core/oracles.ts:2586-2623`. It performs a real check: for a robustness scenario without `gracefulAllowOutput` it PASSes only when `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` (line 2607-2610) and FAILs if any output was produced (line 2614-2617). It is a smoke/robustness gate (no golden comparison), but it is not trivially satisfiable for this scenario: an engine that emitted a partial packet table would fail.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1152-1183`. Genuine `new mb.Input(ALL_FORMATS)` → `getTracks()` → `EncodedPacketSink.packets()`. No canned output, no input→output copy, no golden short-circuit; the throw originates inside the real mediabunny open/sniff path ("Input has an unsupported or unrecognizable format"). Output is empty by virtue of failing before the packet loop, exactly as the oracle requires.
- **Cached note:** all five PASS results have `cached: true` (mediabunny startedAt 14:13, ffmpeg 16:46, etc.). Evidence is reused, not freshly re-run this session; per the launcher seeding caveat, stale PASS reuse is a known risk — the timing numbers in particular are single-sample and cached, so the 6 ms figure is directional. The PASS verdict itself is robust (a reject is deterministic for a zeroed header).
- **Verdict: WEAK-GATE.** The fixture is real and the winner's implementation is a genuine library call, but the only gating oracle is the smoke-grade `graceful-failure` (reject-or-not), not a correctness gate. The PASS is real but not strong, and the contest is decided purely on a cached, single-sample wall-time margin.

## Confidence & caveats

- Confidence: **medium**. The winner selection rests on a real fixture + real adapter code path + a meaningful (but smoke-grade) oracle, so the PASS is trustworthy. But: (1) the oracle is reject-only, giving no correctness separation among the 5 passers; (2) the deciding metric is `durationMs` with n==1 and `cached:true` for every engine — no `bench{}` median/p95/mad spread is available, so the ~2.3x margin over remotion-media-parser is weak statistical evidence; (3) for a negative/robustness test, "fastest reject" is a reasonable but minor differentiator — any of the 5 passers is functionally acceptable.
- The two NA verdicts (platform, mp4box) are both honest capability gaps for the WebM container / standalone demux, not under-declared capabilities.
