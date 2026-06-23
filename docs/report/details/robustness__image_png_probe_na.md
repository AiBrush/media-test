# robustness/image_png_probe_na

- **family:** robustness
- **fixture asset:** `fixtures/media/image.png` (real file, 34 KB, `PNG image data, 640 x 480, 8-bit/color RGB, non-interlaced`)
- **operation:** `probe`
- **oracle:** `graceful-failure` (single, binary)
- **primaryMetric:** `wall` (metrics declared: `['wall']`); NOTE: shard carries no `bench{}` block, only `durationMs`
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `remotion-webcodecs@4.0.479` (uncontested-on-correctness, decided on a weak timing margin).
- **Contested:** YES — all 7 engines PASS the identical single `graceful-failure` oracle, so correctness is a 7-way tie.
- **Decisive factor:** This is a *negative* (NA) probe. A PNG still image is fed to seven media-container probes; the correct behaviour is to reject it cleanly (clean throw/reject, no output, no hang). Every engine does exactly that, so the `graceful-failure` ladder rung (smoke-grade) cannot separate them. Per the decision procedure correctness is comparable, so PERFORMANCE breaks the tie. The only timing signal present is `durationMs` (no `bench`): `remotion-webcodecs` has the lowest at **8 ms**.
- **Margin over runner-up:** vs `platform` (9 ms) → **1.13x faster** wall-proxy; vs `mp4box` (11 ms) → 1.38x; vs the slowest `ffmpeg.wasm` (125 ms) → 15.6x. This margin is **very weak evidence**: it is a single warm-cached sample (n=1, no median/p95/mad), measuring how fast each lib *throws*, not how fast it does useful work. The "winner" here is essentially a formality of the tiebreak rule.

## Per-engine results

All seven PASS. There is no `bench{}` in this shard, so throughputRealtime / peakMemory / longtasks are not measured (n/a); the only timing is `durationMs`.

| engine | status | oracles passed | durationMs (wall proxy) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 8 | n/a | n/a | n/a | graceful: Image files are not supported |
| platform@chrome-149 | PASS | graceful-failure:pass | 9 | n/a | n/a | n/a | graceful: raw platform probe rejected still-image input; suite probes media containers only |
| mp4box@2.3.0 | PASS | graceful-failure:pass | 11 | n/a | n/a | n/a | graceful: mp4box parse error: Invalid data found while parsing box of type '\r\n\n' at position 0 |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:pass | 12 | n/a | n/a | n/a | graceful: Image files are not supported |
| web-demuxer@4.0.0 | PASS | graceful-failure:pass | 37 | n/a | n/a | n/a | graceful: get_media_info failed: undefined |
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 40 | n/a | n/a | n/a | graceful: Input has an unsupported or unrecognizable format |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 125 | n/a | n/a | n/a | graceful: ffmpeg.wasm@0.12.15: probe rejected still-image input; suite probes media containers only |

## Why the winner wins (deep technical)

**What the test actually exercises.** The input is a real PNG (8-byte signature `89 50 4E 47 0D 0A 1A 0A` then an `IHDR` chunk; the `\r\n\n` MP4Box error string is literally bytes 4–7 of that PNG signature being mis-read as an ISO-BMFF box type). PNG is a still-image format, not a media container, and `probe` is a container/track-enumeration operation. There is therefore **no** valid `ftyp`/`moov` (MP4/MOV), no EBML header (WebM/MKV), and no track table. The single correct outcome is a clean rejection. The `graceful-failure` oracle (`src/core/oracles.ts:2586`) encodes this: for a `robustness` scenario with no explicit `signal:` marker in the notes, it passes iff the op produced no output (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`) and did not crash/hang (`src/core/oracles.ts:2602-2610`). The scenario notes deliberately omit the good-token set (`src/scenarios/robustness/index.ts:509-513`), so the verdict rests on the runner's output-absence inference, not on prose.

**Why remotion-webcodecs "wins."** Its `probe()` (`src/engines/remotion-webcodecs/adapter.ts:332-377`) delegates to `@remotion/media-parser`'s `mp.parseMedia(...)` with `fields: { container, durationInSeconds, tracks, metadata }`. media-parser sniffs the leading bytes, recognises a PNG/still-image signature, and throws **`Image files are not supported`** before attempting any track/decode work. That early, header-only bail is why it records the lowest `durationMs` (8 ms): it never enters the WebCodecs path (`backend: webcodecs`, `hwAccel: prefer-hardware(+software fallback)`), never spins a worker, never allocates a decode queue — the rejection happens at the parser's format-dispatch step. The runner catches the throw and routes it to `graceful-failure`, which passes on output-absence. The reason string `graceful: Image files are not supported` in the shard is the verbatim library error, confirming a real code path, not a canned token.

**Why the margin is meaningless for a real workload.** All seven engines do the same correct thing; the spread in `durationMs` (8 ms → 125 ms) reflects only fixed per-engine startup-to-first-error cost: `ffmpeg.wasm` (125 ms) pays wasm module/FS overhead even just to reject; mediabunny (40 ms) and web-demuxer (40/37 ms) carry their own init cost; the pure-JS / streaming-parser engines (remotion-webcodecs 8, platform 9, mp4box 11, remotion-media-parser 12) reject almost immediately. None of this measures codec/container throughput because there is no codec or container to process. Each value is a single sample (no `bench` median/p95/mad), and **every** engine's result is `cached: true`, so these are reused timings, not a fresh head-to-head. The tiebreak therefore yields a nominal winner only.

## What each other framework did wrong

These engines did **nothing wrong** — every one PASSED by rejecting the still image cleanly. The "loss" is purely the timing tiebreak on `durationMs`:

- **platform@chrome-149** — PASS; lost by 1 ms (9 vs 8 ms, 1.13x). Its raw WebCodecs probe (`src/engines/platform/probe.ts`) explicitly rejects still-image input ("raw platform probe rejected still-image input; this suite probes media containers only"). Honest, fastest-but-one.
- **mp4box@2.3.0** — PASS; 11 ms (1.38x). MP4Box.js tried to parse the PNG as ISO-BMFF and aborted: "Invalid data found while parsing box of type '\r\n\n' at position 0" — that box type is the PNG signature bytes. Clean abort, no output.
- **remotion-media-parser@4.0.479** — PASS; 12 ms (1.5x). Same `@remotion/media-parser` core as the winner, throws the same "Image files are not supported"; slightly slower in this cached sample.
- **web-demuxer@4.0.0** — PASS; 37 ms (4.6x). `get_media_info failed: undefined` — its wasm probe entry returned a failure for the unrecognised format. Clean failure, no output.
- **mediabunny@1.48.0** — PASS; 40 ms (5.0x). "Input has an unsupported or unrecognizable format." — mediabunny's format detector rejected the PNG cleanly.
- **ffmpeg.wasm@0.12.15** — PASS; 125 ms (15.6x), slowest. "probe rejected still-image input; this suite probes media containers only." Correct rejection; the high time is fixed wasm init overhead, not slower logic.

No engine returned spurious metadata/tracks for the PNG (which would have FAILed `graceful-failure` via `src/core/oracles.ts:2614-2617`), and none hung/crashed. There are no NA_ENGINE / NA_BROWSER entries — all seven declare `probe` and ran.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:494` (`{ id: 'image_png_probe_na', asset: 'image.png', format: 'PNG' }`), built by `imageNegativeScenarios` at `src/scenarios/robustness/index.ts:498-515` (op `probe`, oracle `graceful-failure`, metric `wall`). Notes (`:509-513`) intentionally avoid the `signal:` good-token markers so the runner's output-absence inference owns the verdict.
- **Fixture exists & is REAL:** `fixtures/media/image.png` — `stat` shows 34 KB; `file` reports `PNG image data, 640 x 480, 8-bit/color RGB, non-interlaced`. A genuine still image, not synthetic/empty/mock. This is the *intended* negative input: a non-container fed to a container probe.
- **Oracle is REAL but SMOKE-GRADE:** `gracefulFailure` at `src/core/oracles.ts:2586-2623`. It performs a real check (passes only on output-absence + no crash/hang; FAILs if output is produced from malformed input), so it is not trivially satisfiable by any value. BUT it is a binary smoke/robustness gate — the weakest rung of the correctness ladder, with no golden comparison and no measured tolerance. That is correct for an NA negative test (there is nothing to compare against), yet it means the PASS is real but weak, and it cannot rank engines on correctness.
- **Winner adapter is REAL:** `src/engines/remotion-webcodecs/adapter.ts:332-377` calls `@remotion/media-parser` `parseMedia` for real; the "Image files are not supported" error is the library's own, surfaced verbatim in the shard reason. No canned output, no golden short-circuit, no copy-input-to-output, no swallowed error reported as success — the throw is propagated and the runner classifies it.
- **Measurements plausibility:** No track/packet/duration numbers are claimed (correct for a rejection). `durationMs` values (8–125 ms) are physically plausible per-engine init-to-error costs. The error strings match each library's real format-detection failure.
- **Cached note:** **ALL seven results are `cached: true`** (started 2026-06-22, run reused). The evidence is reused, not freshly re-run; per the launcher seeding caveat, stale cached PASS reuse is a known risk. For a deterministic negative probe the PASS verdicts are robust, but the *timing* tiebreak (8 vs 9 ms) is not trustworthy from cached single samples.
- **Verdict:** **WEAK-GATE.** Real fixture + real adapter implementations + a real-but-smoke-only oracle. The PASS is genuine for all engines; it simply is not a strong correctness signal, and the winner is decided by a fragile cached 1 ms timing margin.

## Confidence & caveats

- **Confidence: medium.** The PASS verdicts are unambiguous and correct (all engines reject a still image cleanly). The fixture, scenario, oracle, and winner adapter were all inspected and are genuine.
- The "best framework" label is essentially nominal: correctness is a 7-way tie on a binary smoke oracle, and the tiebreak rests on `durationMs` (no `bench` median/p95/mad, n=1, all cached). The 8 ms vs 9 ms gap between remotion-webcodecs and platform is within noise; on a fresh re-run the ordering of the fast cluster (8/9/11/12 ms) could easily flip.
- This is a *negative* capability test: there is no codec/container to process, so no decode/throughput/memory metric is meaningful and none is recorded.
- All evidence is from cached results; a fresh run (clear raw + .browser-cache per the launcher caveat) would be needed to trust the timing ranking.
