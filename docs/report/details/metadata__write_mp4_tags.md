# metadata/write_mp4_tags

- **family:** metadata
- **fixture asset(s):** `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 1080p30 video + AAC 48 kHz stereo, 30.0 s, ilst major_brand=isom)
- **primaryMetric:** wall (ms)
- **passCount:** 2 of 7 (ffmpeg.wasm, mediabunny)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` (engineId `ffmpeg-wasm`).
- **Contested:** YES — two engines PASS (ffmpeg.wasm and mediabunny) with **identical correctness** (both pass `reference-reimport` and `property-invariant`).
- **Decisive factor:** PERFORMANCE. Correctness is a tie (same two oracles, same strictness, both with 12/12 bit-exact frames and a 2-track exact layout match), so the tiebreaker falls to wall time. ffmpeg.wasm completed the tag-bearing remux in **127.97 ms** vs mediabunny's **348.73 ms**.
- **Margin over runner-up:** **2.73x faster wall** (127.97 ms vs 348.73 ms). Both samples are `n=1`, `mad=0`, and `cached=true`, so the spread is unmeasured — this is single-shot evidence (see caveats). ffmpeg also shows a marginally tighter re-import: `durationDeltaSec=0` (exact) vs mediabunny `0.08 s` (within the 0.1 s tolerance band), a secondary point in ffmpeg's favor.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true, property-invariant:true | 127.97 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true, property-invariant:true | 348.73 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'metadata:write' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'metadata:write' |

Note: this scenario records only `wall` and `targetWrites` (the latter is `n=0`, unpopulated). No throughputRealtime/peakMemory/longtasks were collected for the metadata write op.

## Why the winner wins (deep technical)

The operation is `op:'remux'` (built by `buildWrite`, `src/scenarios/metadata/_shared.ts:133`) carrying `options.tags = UNICODE_TAGS` (emoji+CJK title, non-ASCII artist, a ~324-byte comment crossing the 255-byte ID3 text-frame edge). The required feature is `metadata:write` and the gating oracles are `reference-reimport` + `property-invariant` with invariant token `decode(remux(x))==decode(x)` (`_shared.ts:147`, `DECODE_REMUX` at `_shared.ts:67`). The container is MP4 with H.264 video + AAC audio; tags live in the `udta/meta/ilst` atom. The honest scope (file header) is explicit: this case proves "a tag-bearing rewrite produces a valid container that did NOT corrupt the media" — it does **not** read the written tag map back (no oracle re-probes ilst content).

**ffmpeg.wasm's path.** Its `remux()` (`src/engines/ffmpeg-wasm/adapter.ts:2031`) issues a genuine FFmpeg invocation: `-map 0 -c copy` (stream-copy, no re-encode of either track) plus `-movflags +faststart` for the MP4 target, then one `-metadata key=value` per tag (`adapter.ts:2056-2061`). Because the coded H.264 NAL units and AAC AUs are byte-copied verbatim and only the `ilst` atom is authored, the decoded pixels are necessarily identical to the source. The shard confirms this mechanistically:
- `property-invariant` measured `measuredFrames=12, comparedFrames=12, mismatchedFrames=0` — the platform WebCodecs decode of ffmpeg's output produced 12 frame digests bit-exact against the golden `decode(x)` digests (`fixtures/golden/h264_1080p_30s.mp4.frames.json`). Stream-copy + tag-only authoring leaves the video bitstream untouched, so the invariant holds exactly.
- `reference-reimport` measured `reimportPackets=2308, reimportKeyframes=1423, reimportMediaTracks=2, goldenMediaTracks=2, durationDeltaSec=0` (tol 0.1 s). The reference engine re-demuxed ffmpeg's output into a parseable MP4 with the exact 2-track (video+audio) layout the golden declares (`fixtures/golden/h264_1080p_30s.mp4.meta.json`: video h264 1920x1080@30 + audio aac 48k/2ch, 30 s), with **zero** duration drift.

This is the single-threaded wasm build (no SharedArrayBuffer / COOP-COEP needed for a `-c copy` job), and the win comes from doing essentially no decode/encode work — it is a buffer copy + atom authoring in native C compiled to wasm.

**Why ffmpeg beat mediabunny.** mediabunny also genuinely remuxes (`src/engines/mediabunny/adapter.ts:1244`) under the `webcodecs` backend (`env.configUsed.backend=webcodecs`, `pipeline=streaming-lockstep`, `hwAccel=prefer-hardware`) and passes the **same two oracles** with the same `mismatchedFrames=0` over 12 frames — so correctness is a dead tie. The difference is pure throughput on a tag-only rewrite: mediabunny's streaming-lockstep pipeline walks packets through its own demux/mux state machine, whereas ffmpeg's `-c copy` is a tighter native bulk copy. Wall: 127.97 ms vs 348.73 ms = **2.73x**. mediabunny's re-import also shows `reimportPackets=2310 / reimportKeyframes=1425` (2 more packets/keyframes than ffmpeg's 2308/1423) and `durationDeltaSec=0.08 s` (vs ffmpeg's exact 0) — both well inside tolerance and not correctness-affecting, but ffmpeg's output is the cleaner round-trip.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed; lost on speed only. Same correctness (reference-reimport + property-invariant, 12/12 bit-exact frames), but 348.73 ms wall = 2.73x slower than ffmpeg, and a slightly looser re-import (durationDelta 0.08 s vs 0; 2310/1425 packets/kf vs 2308/1423). Honest loser, not a failure.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — web-demuxer is a demux-only WASM binding (FFmpeg demuxer surface), it has no muxer/output path, so it genuinely cannot author an MP4 with new ilst tags.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — media-parser is a read/parse-only library; no mux/remux capability exists to write tags.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — the raw WebCodecs/platform surface has decoders/encoders but no container muxer, so a tag-writing remux is genuinely out of scope (would require pairing with mp4box/mediabunny muxing, which this adapter does not declare for remux).
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare feature 'metadata:write'". Plausible-but-narrow NA: mp4box.js can parse/segment MP4 and could in principle author udta, but the adapter does not declare `metadata:write`, so the runner excludes it. The NA is an under-declared-capability candidate rather than a hard inability, but it is recorded honestly (no false PASS).
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'metadata:write'". Honest NA — remotion-webcodecs is a transcode/convert layer over WebCodecs; it does not declare a tag-authoring (metadata:write) capability for the remux op.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/metadata/write-roundtrip.ts:50-63` (`id: 'write_mp4_tags'`), built via `buildWrite` at `src/scenarios/metadata/_shared.ts:133` (`op:'remux'`, `features:['metadata:write']`, `oracles:['reference-reimport','property-invariant']`, `_shared.ts:147`).
- **Fixture:** `asset: 'h264_1080p_30s.mp4'` → `fixtures/media/h264_1080p_30s.mp4` **exists** (31 MB, real H.264+AAC MP4). Not synthetic/empty/mock. Golden present: `fixtures/golden/h264_1080p_30s.mp4.meta.json` and `.frames.json`.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — real FFmpeg `-map 0 -c copy ... -metadata k=v ... +faststart` invocation; reads back actual output bytes (`readBinary`). No canned output, no input→output copy faking a transcode, no short-circuit to a golden file, no error swallowing (errors propagate from `this.run`). Capability declared at `adapter.ts:1506` (`'metadata:write'`).
- **Oracles:** `reference-reimport` at `src/core/oracles.ts:1225` (+`semanticRemuxReimport` at :1273) re-demuxes the engine output with an independent reference engine and asserts non-empty packets + exact media-track layout + duration within tolerance — a real structural comparison. `property-invariant` at `src/core/oracles.ts:2645` (decode-remux branch :2686-2707) decodes the actual output via WebCodecs and compares frame digests against golden `decode(x)` digests with `mismatchedFrames` strict equality. Measurements are physically plausible for this asset: 2308 packets / 1423 keyframes / 2 tracks / 30 s duration match the 1080p30+AAC golden; 12/12 frames bit-exact.
- **Cached note:** the winner's result is `cached==true` ("cached previous PASS result") — it was reused, not re-run in this batch. Staleness risk exists; the 127.97 ms wall and oracle measurements come from a prior run. mediabunny is also cached. This weakens timing evidence but not the structural/correctness evidence (digests + track layout are deterministic for this fixture).
- **Verdict:** **REAL** — real fixture, genuine `-c copy + -metadata` implementation, and two meaningful oracles (one structural re-import, one decode-pixel-exact invariant) with plausible measurements. Caveat: the scenario by design does NOT verify the written tag CONTENT (no ilst readback oracle — documented in the scenario header and index.ts oracleGaps), so "tags were correctly written" is asserted only as "container valid + media uncorrupted," not "tags ⊇ T."

## Confidence & caveats

- **Confidence: medium-high.** Winner selection is unambiguous on the recorded data: identical correctness, 2.73x wall advantage, exact duration round-trip. The implementation and oracles are genuine.
- **Caveat 1 (timing):** both PASS results are `n=1, mad=0, cached=true`. A 2.73x gap is large and very unlikely to invert, but single-shot cached numbers carry no variance estimate.
- **Caveat 2 (gate scope):** the oracle proves "valid MP4 + media not corrupted," NOT that the emoji/CJK/long-comment UTF-8 tags were actually written into ilst. A future tag-readback oracle could differentiate the two PASS engines on tag fidelity; today they are tied on the observable gate.
- **Caveat 3 (mp4box NA):** mp4box's NA is the only NA that looks like a possible under-declaration (the library can author udta), but it is recorded honestly as NA_ENGINE, not a false PASS.
