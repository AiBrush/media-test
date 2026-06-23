# robustness/edge_faststart_reserve_remux

**Family:** robustness | **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio, MP4, ~31 MB) | **Primary metric:** (none reported in shard — correctness-only) | **Pass count:** 2 / 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` (CONTESTED — 2 engines PASS: ffmpeg-wasm and mediabunny).
- **Decisive factor:** Both engines pass the *identical* oracle set (`reference-reimport` + `playback-smoke`) with the *same* structural measurements (2308 re-imported packets, 1423 keyframes, 2 media tracks vs 2 golden tracks). The only measured difference is the semantic re-import **duration delta**: ffmpeg-wasm reproduces the source length **exactly** (`durationDeltaSec = 0.0`) while mediabunny drifts by `0.021333 s`. Under the correctness ladder this is a structural/metadata-exact tiebreak in ffmpeg's favor; both are far inside the 0.1 s tolerance.
- **Margin over runner-up:** Correctness margin is razor-thin: duration drift 0.0 s (ffmpeg) vs 0.0213 s (mediabunny) — both PASS. No `bench{}` block exists for either engine in the shard, so there is no reliable performance margin; the only timings are cached `durationMs` (ffmpeg 938 ms vs mediabunny 692 ms) which are wall-clock of a *cached* result and not load-bearing. The win is a soft correctness edge, not a decisive one.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true; playback-smoke:true | n/a (no bench; durationMs=938, cached) | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true; playback-smoke:true | n/a (no bench; durationMs=692, cached) | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:reserve' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:reserve' |

## Why the winner wins (deep technical)

The operation is a **lossless container remux** of H.264 + AAC inside MP4 back to MP4 with `fastStart: 'reserve'`. Faststart-reserve means the muxer must place the `moov` box *before* `mdat` (so the file is progressively playable / web-streamable) by reserving space for `moov` up front. The scenario note (`src/scenarios/robustness/index.ts:165`) calls out the real hazard: "fastStart:reserve provokes a large forward seek in the target buffer" — the muxer writes a placeholder `moov`, streams `mdat`, then seeks back to backfill the box. The test exists to catch muxers whose write target mishandles that backward/forward seek.

**ffmpeg.wasm path (winner).** `remux()` (`src/engines/ffmpeg-wasm/adapter.ts:2031`) probes the input (`runInfo`), asserts container compatibility (`assertRemuxContainerCompatible`), then builds `[-i in -map 0 -c copy]` and, for MP4 with `fastStart !== false`, appends `-movflags +faststart` (`adapter.ts:2048-2049`). The `-map 0` is the load-bearing detail — it forces every input stream (both the H.264 video and AAC audio track) into the output, which is exactly why the re-import sees `reimportMediaTracks = 2` matching `goldenMediaTracks = 2`. `-c copy` stream-copies the already-encoded samples, so no re-encode occurs; the H.264 NAL/AAC frame bitstream is preserved and the moov is rewritten to the front by FFmpeg's native two-pass faststart relocation. Because the bytes are copied verbatim and the timescale/edit-list is carried through unchanged, the re-imported duration matches the source to the sample (`durationDeltaSec = 0.0`, `durationToleranceSec = 0.1`). The capability `fastStart:reserve` is honestly declared at `adapter.ts:1503` ("`-movflags +faststart` (moov-first; reserve approximated)") — note it candidly states the FFmpeg muxer approximates `reserve` semantics with its standard faststart relocation rather than a literal pre-reserved box, but the *observable contract* (moov-first, playable, identical media) is satisfied.

The gating oracle `reference-reimport` (`src/core/oracles.ts:1225`) feeds the engine's output bytes back through the **reference engine's** demuxer and, for `op === 'remux'`, runs `semanticRemuxReimport` (`oracles.ts:1273`): it compares media-track count + per-type track layout against the golden, and checks the re-imported duration against `golden.meta.durationSec` within `max(band, 0.1) s`. ffmpeg's output produced 2308 packets / 1423 keyframes, 2/2 tracks, Δdur 0.0 s — a real structural round-trip on a 30 s 1080p clip (2308 packets ≈ 30 s of ~30 fps video plus AAC frames is physically plausible). `playback-smoke` (`oracles.ts:1574`) then loaded the output into a `<video>` element and advanced frames, confirming the faststart layout is actually browser-playable.

**Why ffmpeg edges mediabunny.** mediabunny's `remux()` (`src/engines/mediabunny/adapter.ts:1244`) special-cases `fastStart === 'reserve'` by routing through `prepareMuxTracks([input], opts)` then `mux(tracks, opts)` (`adapter.ts:1245-1248`) rather than the plain `runConversion` copy path — a genuine remux through its TS muxer that re-derives track timing. It passes the same oracle set with the same 2308/1423/2 structural numbers, but its re-imported duration drifts `0.021333 s` from golden (still 5x inside the 0.1 s tolerance). Per the ladder, an exact structural/metadata match (Δ 0.0) outranks a small-but-nonzero drift, so ffmpeg takes the tiebreak. This is a soft, structural-level distinction — not a bit-exact or perceptual one.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on the correctness tiebreak only: identical oracles/structural numbers but `durationDeltaSec = 0.021333 s` vs ffmpeg's `0.0`. Both well within tolerance; the implementation (`adapter.ts:1244-1248`, real `prepareMuxTracks`+`mux` reserve path) is genuine. A legitimate, very close runner-up.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — the WebCodecs/native platform shim exposes decode/encode primitives, not a container remux operation, so it cannot perform a lossless rewrap.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — web-demuxer is a demux-only library; it has no muxing/output path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — it is a parser/reader, not a muxer.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare feature 'fastStart:reserve'". mp4box.js *can* remux MP4 and emit moov-first output, so this NA is borderline; declining specifically the `fastStart:reserve` feature token is plausibly conservative (it may not model a reserved-box pre-allocation), but this looks like a candidate under-declaration rather than a true capability gap. Not disqualifying for the verdict since it did not run.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'fastStart:reserve'". Honest NA at the feature level — its conversion path does not advertise reserve-mode faststart layout control.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:154-166` — `id: 'edge_faststart_reserve_remux'`, `op: 'remux'`, `asset: 'h264_1080p_30s.mp4'`, `options: { container: 'mp4', fastStart: 'reserve' }`, `oracles: ['reference-reimport', 'playback-smoke']`.
- **Fixture exists:** `fixtures/media/h264_1080p_30s.mp4` is present and is a real ~31 MB file (verified via stat). Not synthetic/empty/mock.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — real `this.run([... -map 0 -c copy -movflags +faststart out])` against the bundled FFmpeg wasm core. No canned output, no input→output copy faking a transcode, no short-circuit to a golden file, no error swallowing (errors propagate through `await this.run`). Capability honestly declared at `adapter.ts:1503` with an explicit "reserve approximated" note.
- **Oracle:** `src/core/oracles.ts:1225` (`referenceReimport`) → `oracles.ts:1273` (`semanticRemuxReimport`). It re-demuxes the engine's actual output bytes through the reference engine and compares track count, per-type track layout, and duration vs golden within tolerance — a real structural comparison, not trivially satisfiable. Measurements are physically plausible for a 30 s 1080p H.264+AAC clip (2308 packets, 1423 keyframes, 2 tracks, Δdur 0.0–0.021 s).
- **Strength caveat:** This is a **structural/metadata-level + smoke** gate, not bit-exact. `reference-reimport` does not hash decoded frames; `playback-smoke` only confirms a few frames play. So the PASS is real but not the strongest tier — a remux that subtly corrupted sample order while preserving track count/duration could in principle slip through. For an `-c copy` stream copy this risk is low.
- **Cached note:** Both PASS results have `cached: true` ("cached previous PASS result"). Evidence is reused, not freshly re-run; per the launcher seeding caveat, stale PASS reuse means the timings (durationMs) and even the pass state reflect a prior run. Staleness risk is moderate — re-run from cleared cache to confirm.
- **Verdict:** **WEAK-GATE** — real fixture + real implementations on both PASS engines, but the gating oracles are structural-reimport + playback-smoke (no bit-exact/decoded-frame check), so the PASS is genuine yet not the strongest tier. Compounded by both results being cached.

## Confidence & caveats

- **Confidence: medium.** Both winners are genuinely implemented and the fixture/oracle are real, but: (1) the correctness margin is a 0.021 s duration tiebreak well inside tolerance — essentially a coin-flip on strength; (2) there is **no `bench{}` performance data** for either engine, so the performance dimension cannot break the tie (cached `durationMs` is not trustworthy); (3) both PASS results are **cached**, raising staleness risk.
- If a fresh, uncached run with full bench instrumentation were available, the winner could flip to mediabunny on wall-clock/memory grounds (its `durationMs` 692 ms is lower than ffmpeg's 938 ms, consistent with pure-TS streaming vs single-thread wasm with MEMFS I/O, env.configUsed: ffmpeg has no SAB/threads here, mediabunny `pipeline: streaming-lockstep`, `coopCoep: not-required`). The current pick rests purely on the exact-duration correctness edge.
