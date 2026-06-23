# remux/aac_adts_adts_to_mp4

family: remux | fixture asset: `aac_adts.aac` (fixtures/media/aac_adts.aac, 164 KB, real ADTS-framed AAC) | primaryMetric: wall (default for remux, src/scenarios/remux/_shared.ts:42) | passCount: 3 / 7

## Verdict

Best framework: **mediabunny@1.48.0** (CONTESTED — 3 engines PASS: mediabunny, ffmpeg.wasm, remotion-webcodecs).

Decisive factor: **main-thread responsiveness (longtasks)**. All three PASS engines clear the single gating oracle (`reference-reimport`) at equal correctness strength, so the decision falls to performance. On the default primary metric (wall) ffmpeg.wasm is nominally fastest (7.77 ms vs mediabunny 8.955 ms = 1.15x), but that gap is statistically meaningless: n=1, mad=0, ~1.2 ms apart, well inside run-to-run noise. The honest separator is longtasks, where mediabunny blocks the main thread for **142 ms vs ffmpeg.wasm's 1901 ms — a 13.4x advantage**. mediabunny also needs no COOP/COEP and no SharedArrayBuffer (`coopCoep: "not-required"`, `sharedArrayBuffer: false`, `coreBuild: "pure-ts-esm"`), whereas ffmpeg.wasm is a single-thread wasm blob whose load+exec stalls the event loop.

Margin over runner-up (ffmpeg.wasm): 0.075x longtasks (13.4x less main-thread blocking), 1.15x slower wall (within noise, n=1), 0.87x throughputRealtime (1120.16x vs 1290.99x realtime). Both mediabunny and ffmpeg re-import to exactly 470 packets / 1 track with durationDelta 0.0043 s; remotion-webcodecs re-imports 473 packets with a larger durationDelta 0.038 s (still within the 0.1 s tolerance) and is 18.6x slower on wall (167 ms).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 8.955 ms | 1120.16x | 0 (not sampled) | 142 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 7.77 ms | 1290.99x | 0 (not sampled) | 1901 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | reference-reimport:true | 167.065 ms | 60.04x | 0 (not sampled) | 1901 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

(peakMemory has n=0 samples for every engine — not measured for this scenario; not a tiebreaker here.)

## Why the winner wins (deep technical)

The operation is a lossless audio re-wrap: strip the per-frame 7-byte ADTS headers off raw AAC-LC access units and box them into an MP4/M4A `mdat` with an `stsd`/`esds` (AudioSpecificConfig) describing 48 kHz / 2-channel AAC, then write the `moov`. No decode, no re-encode — the AAC payload bytes are copied verbatim (scenario notes: "strip ADTS headers, wrap raw AAC — lossless", src/scenarios/remux/index.ts:118). The golden has 470 AAC frames over 10.031 s (fixtures/golden/aac_adts.aac.meta.json), so a correct remux must surface exactly one audio track whose re-imported frame count and duration match.

mediabunny runs this through its real `Conversion` pipeline, not a byte copy: `remux()` opens a real `Input` from the asset, builds an `Output` with `makeOutputFormat('mp4')` over an instrumented `BufferTarget`, and drives `Conversion.init(...).execute()` (src/engines/mediabunny/adapter.ts:1244-1260; `runConversion` at adapter.ts:842-868 also guards `conversion.isValid` and rejects when there are no usable output tracks). Because the source and target audio codec are both AAC, the Conversion's read→mux path stream-copies the encoded AAC packets (no WebCodecs decode/encode for the audio), which is why the wall time is single-digit milliseconds and longtasks is only 142 ms. The eligibility itself comes from honest capability declaration: mediabunny declares `containersIn: [...'adts']` and `remux: true` (adapter.ts:1025, 1036), which is exactly the pair the four NA engines lack.

The `reference-reimport` oracle (src/core/oracles.ts:1279-1376) re-opens mediabunny's MP4 output with the reference demuxer and compares it to the golden: media-track count and per-type layout (oracles.ts:1289-1298), duration within a container-aware band floored at 0.1 s (oracles.ts:1311-1324), and a video-keyframe sanity check that is inert for audio-only output (oracles.ts:1361-1365). mediabunny's measured outcome — `reimportPackets: 470, reimportMediaTracks: 1, goldenMediaTracks: 1, durationDeltaSec: 0.00433 (tol 0.1)` — is an exact frame-count match to the golden and a 23x margin inside the duration tolerance. That is a genuine structural/metadata-exact pass, not a smoke gate.

ffmpeg.wasm produces an equally correct result (470/470 packets, durationDelta 0.00433) via a real `-c copy -movflags +faststart` stream copy (src/engines/ffmpeg-wasm/adapter.ts:2031-2069, with `assertRemuxContainerCompatible` rejecting illegal codec/container pairs first). Its nominal wall is even lower (7.77 ms). But it pays a 1901 ms longtask — the single-thread wasm core monopolizes the main thread during module instantiation/exec — versus mediabunny's 142 ms. For an in-browser remux where UI responsiveness is the product, a 13.4x lower main-thread block at correctness parity is the right tiebreaker (decision rule B/tiebreaker hardware-vs-wasm + no COOP/COEP: mediabunny `coopCoep: "not-required"`, ffmpeg single-thread wasm). The wall "win" for ffmpeg is n=1/mad=0 and within noise, so it does not override the order-of-magnitude longtask gap.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on responsiveness. Correctness-equal (reimportPackets 470, durationDelta 0.00433) and 1.15x faster on a noise-level wall (7.77 vs 8.955 ms, n=1), but blocks the main thread 1901 ms vs mediabunny's 142 ms (13.4x worse) as a single-thread wasm core; mediabunny needs no COOP/COEP/SAB.
- **remotion-webcodecs@4.0.479** — PASS, lost on both correctness margin and speed. Re-import returned 473 packets (vs golden 470 — 3 extra frames, likely encoder/muxer priming or padding framing) and a 9x larger durationDelta (0.038 s vs 0.00433 s); still inside the 0.1 s tolerance so it passes, but it is the least exact of the three. It is also 18.6x slower on wall (167.065 ms vs 8.955 ms) and 18.6x lower throughput (60.04x vs 1120.16x realtime), with the same 1901 ms longtask.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare input container 'adts'". Honest NA: MP4Box.js is an ISOBMFF-only parser/segmenter and cannot ingest raw ADTS elementary streams, so it has no source path for this input.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'remux'". Honest NA: it is a parser/probe library with no muxing/output path.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'remux'". Honest NA: a demux-only wasm wrapper; it can read but not write a container.
- **platform@chrome-149** — NA_ENGINE, "engine does not declare operation 'remux'". Honest NA: the bare WebCodecs/DOM platform engine exposes no container muxer, so file-level remux is out of scope.

## Anti-cheat validation

- Scenario definition: src/scenarios/remux/index.ts:113-119 (REMUX_CASES entry `asset: 'aac_adts.aac', from: 'adts', to: 'mp4'`), expanded by `buildRemuxAll` at index.ts:144. Gating-rationale notes at index.ts:108-118 explicitly record the oracle fix (decoded-frames-bitexact and golden-metadata are inapplicable to an audio remux; the honest gate is reference-reimport + playback-smoke).
- Fixture: `fixtures/media/aac_adts.aac` exists, 164 KB — a real ADTS AAC elementary stream, not synthetic/empty. Golden `fixtures/golden/aac_adts.aac.packets.json` is a real 470-element packet list; `aac_adts.aac.meta.json` describes 1 AAC audio track, 48 kHz/2ch, 10.031 s.
- Oracle: `reference-reimport` at src/core/oracles.ts:1279-1376. Performs a real re-demux of the engine output and compares track count, per-type layout, and duration (tolerance floored at 0.1 s, oracles.ts:1318) against the golden. mediabunny's measurements (470 packets, 1 vs 1 tracks, durationDelta 0.00433 s) are physically plausible and exactly match the 470-frame golden — not trivially satisfiable.
- Winner adapter: src/engines/mediabunny/adapter.ts:1244-1260 (`remux()` → `makeOutputFormat` + `Output`/`BufferTarget` + `runConversion`) and adapter.ts:842-868 (`runConversion` asserts `conversion.isValid` and executes a real Conversion). No canned output, no input→output passthrough, no short-circuit to the golden, no swallowed errors (invalid conversion throws).
- Cached note: mediabunny's result has `cached: true` ("cached previous PASS result", startedAtIso 2026-06-22T13:52:41Z). The runner-up ffmpeg.wasm and remotion-webcodecs are also cached (2026-06-22T16:44Z). Staleness risk is low (same-day run, deterministic remux), but the bench numbers were reused, not re-measured this run.
- Verdict: **REAL** — real fixture, real `Conversion`-API implementation, meaningful structural/metadata-exact oracle with an exact 470-packet match.

## Confidence & caveats

Confidence: medium. The winner-vs-NA decision is unambiguous (capability declarations). The winner-vs-runner-up decision is sound but rests on a single performance dimension: wall is a statistical tie (n=1, mad=0), and the verdict leans on the 13.4x longtasks gap plus the no-COOP/COEP / pure-TS tiebreaker rather than raw throughput (where ffmpeg is actually 1.15x faster on wall and 1.15x higher realtime throughput). All three PASS results are cached, so none was freshly re-benched this run. peakMemory was not sampled (n=0) for any engine, removing one tiebreaker. If wall is treated as the sole arbiter, ffmpeg.wasm would edge ahead within noise; the longtasks/responsiveness lens is what makes mediabunny the defensible pick for an in-browser remux.
