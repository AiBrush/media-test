# metadata/read_flac_seektable

- **Family:** metadata
- **Fixture asset:** `fixtures/media/flac_seektable.flac` (real FLAC bitstream, 142,933 bytes; 16-bit stereo, 48 kHz, 480,000 samples = 10.0 s)
- **Operation:** `probe` (read structural metadata of a native FLAC stream carrying a SEEKTABLE + VORBIS_COMMENT block)
- **Primary metric:** wall (ms)
- **passCount:** 4 of 7 (3 NA_ENGINE)

## Verdict

- **Best framework:** `remotion-webcodecs@4.0.479` (env.engineId `remotion-webcodecs`).
- **Contested:** YES — 4 engines PASS the only gating oracle (`golden-metadata`) with identical correctness (durationDeltaSec = 0). The decision falls to performance.
- **Decisive factor:** lowest wall-clock probe time. remotion-webcodecs median wall = **4.835 ms**, beating the runner-up mediabunny (7.055 ms) by **1.46x**, ffmpeg.wasm (8.200 ms) by **1.70x**, and remotion-media-parser (9.385 ms) by **1.94x**.
- **Margin over runner-up:** 1.46x faster wall vs mediabunny@1.48.0. Caveat: n = 1 sample per engine (warmup 1, mad 0), so the spread is unmeasured and the margin is single-shot evidence — see Confidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 4.835 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 7.055 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 8.200 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 9.385 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |

Only `wall` is collected for this scenario (`metrics: ['wall']` in `buildRead`, src/scenarios/metadata/_shared.ts:93); throughputRealtime/peakMemory/longtasks are not measured, hence n/a.

## Why the winner wins (deep technical)

This scenario is a **pure header read** of a native FLAC stream. There is no MP4/MOV box tree, no Matroska EBML, no fragmented-vs-faststart distinction: a FLAC file is the 4-byte `fLaC` marker followed by metadata blocks, the first of which is the mandatory STREAMINFO block. STREAMINFO carries, in fixed bit-packed fields, the sample rate (20 bits), channel count (3 bits), bits-per-sample (5 bits) and total inter-channel sample count (36 bits). To satisfy the gating oracle an engine only needs to (a) recognize the container as `flac`, (b) parse STREAMINFO into `{sampleRate:48000, channels:2}`, and (c) derive `durationSec = totalSamples / sampleRate = 480000 / 48000 = 10`. The fixture's SEEKTABLE and VORBIS_COMMENT blocks are *not* required for any gated field (golden-metadata never reads `tags`; see ORACLE TRUTH §1, src/scenarios/metadata/_shared.ts:13-21) — they exist to exercise the parser's metadata-block skip loop, which must walk past SEEKTABLE to find STREAMINFO/duration correctly.

**The gating oracle measurements.** `golden-metadata` (src/core/oracles.ts:595) compares container, durationSec (±tolerance) and per-track `{type,codec,sampleRate,channels}` positionally (compareTrack, src/core/oracles.ts:659). For all four PASS engines the recorded measurement is `durationDeltaSec: 0` against `durationToleranceSec: 0.041666...` (the strict ±1-frame-at-24fps band, src/core/oracles.ts:159). A delta of exactly 0 means every engine read STREAMINFO's total-samples field and divided by the sample rate to land on precisely 10.000 s — the strongest possible result on this gate, and identical across all four. Because correctness is a four-way tie at the top of the ladder this gate can reach (structural/metadata-exact; there is no bit-exact or PCM gate attached to a read-probe), the ranking is decided by performance (task §A.4.b).

**The winning code path.** remotion-webcodecs's `probe()` (src/engines/remotion-webcodecs/adapter.ts:332) calls `@remotion/media-parser`'s `parseMedia` requesting only the header fields `{container, durationInSeconds, tracks, metadata}` (adapter.ts:346-355). media-parser is a streaming, header-first JS parser: for FLAC it reads the `fLaC` magic + STREAMINFO and stops — it does not pull the audio frames or the SEEKTABLE payload to answer a duration/track query (the dossier note at adapter.ts:327-330 confirms `tracks` "does not force a full decode pass; duration comes from the header where present"). `flac` is declared in CONTAINERS_IN (src/engines/remotion-webcodecs/codecs.ts:43) and the audio-codec read set lists `flac` (adapter.ts:265), so the runner admits it (no NA). The result is normalized via `normalizeMetadata(container, durationInSeconds, tracks, metadata)` (adapter.ts:360). This thin header-only read over a 143 KB file is why wall is 4.835 ms.

**Why it beat the others mechanically.** remotion-media-parser@4.0.479 uses the *same* underlying parser (`backend: cpu-js`, `fieldsTier: metadata-only`, per its env.configUsed) and is correct, but its adapter ran at 9.385 ms — 1.94x slower — most plausibly reflecting a heavier per-call setup / reader-construction path (`reader: webReader`) versus remotion-webcodecs's already-warm convert-pipeline lib handle. mediabunny@1.48.0 (7.055 ms) is a pure-TS ESM reader (`coreBuild: pure-ts-esm`, `coopCoep: not-required`); it parses STREAMINFO correctly but its general-purpose Input/Source abstraction costs ~2.2 ms more on this tiny file. ffmpeg.wasm@0.12.15 (8.200 ms) carries the heaviest fixed cost: even a probe routes through the WASM module / virtual FS to run an avformat open on the FLAC demuxer, so its single-thread WASM overhead dominates a sub-10ms header read. None of the four needed COOP/COEP or SharedArrayBuffer for this read; the tiebreakers (hardware vs WASM, streaming vs whole-file) reinforce rather than overturn the wall-time ordering — remotion-webcodecs is a streaming header reader with no WASM round-trip.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, correct (golden-metadata durationDeltaSec=0), but lost on performance: wall 7.055 ms vs 4.835 ms = **1.46x slower** than the winner. No correctness deficiency; pure-TS reader overhead on a 143 KB file.
- **ffmpeg.wasm@0.12.15** — PASS, correct (durationDeltaSec=0), but slowest-but-one: wall 8.200 ms = **1.70x slower**. Fixed WASM/virtual-FS cost to open the FLAC demuxer dominates a tiny header read.
- **remotion-media-parser@4.0.479** — PASS, correct (durationDeltaSec=0), but slowest: wall 9.385 ms = **1.94x slower**. Same parser family as the winner; heavier per-call reader setup (`webReader`, `cpu-js`) with no warm convert handle.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'flac'". HONEST — MP4Box.js is an ISO-BMFF (MP4/MOV) box parser and genuinely cannot parse a raw FLAC bitstream; its codecs.ts declares no `flac` container. Correct under-declaration, not a missed capability.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'flac'". HONEST — its declared container set excludes raw `flac`; the NA is a clean Pass-1 declaration miss (runner.ts:123-125), not a runtime failure.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'flac'". HONEST — the WebCodecs/MediaSource platform path has no demuxer entry for raw `.flac` containers; it declares none, so the runner returns NA before any browser call.

## Anti-cheat validation

- **Scenario definition:** built by `buildRead` (src/scenarios/metadata/_shared.ts:81-96), driven by the FLAC entry in TAG_READ_CASES (src/scenarios/metadata/index.ts:110-115). id derives to `metadata/read_flac_seektable`; op `probe`; oracle `['golden-metadata']`. Notes: "FLAC VORBIS_COMMENT block (TITLE/ARTIST/...) container — structural gate." The HONEST-SCOPE comment (index.ts:21-25, _shared.ts:13-21) explicitly states tag CONTENT is NOT gated — the case is an honest structural read, not an over-claim.
- **Fixture exists & is real:** `fixtures/media/flac_seektable.flac` — `stat` = 142,933 bytes; `file` = "FLAC audio bitstream data, 16 bit, stereo, 48 kHz, 480000 samples". 480000/48000 = 10.0 s, exactly matching golden `fixtures/golden/flac_seektable.flac.meta.json` (durationSec 10, sampleRate 48000, channels 2, codec flac). Not synthetic/empty/mock.
- **Winner adapter genuinely implements probe:** src/engines/remotion-webcodecs/adapter.ts:332-377 calls real `mp.parseMedia({fields:{container,durationInSeconds,tracks,metadata}})` from @remotion/media-parser and normalizes the result — no canned output, no copy-of-input, no short-circuit to the golden file, no error swallowing. `flac` is genuinely declared (codecs.ts:43, adapter.ts:265).
- **Oracle is meaningful:** `golden-metadata` (src/core/oracles.ts:595-657) performs a real field-by-field comparison vs the golden meta JSON with a STRICT ±0.0417 s duration band; it can fail (container mismatch, duration delta > tol, track count/codec/sampleRate/channels mismatch). It is not trivially satisfiable. The measured durationDeltaSec=0 for all PASS engines is physically plausible (FLAC STREAMINFO carries an exact total-sample count, so a correct parser hits 10.000 s exactly).
- **Verdict:** **WEAK-GATE.** Implementation and fixture and oracle are all REAL, but the only gate is structural metadata-exact, and critically it does NOT verify the SEEKTABLE or VORBIS_COMMENT content that the scenario *name* ("read_flac_seektable") implies. The PASS is genuine for container/duration/track structure, but the seektable itself is never asserted (golden-metadata ignores tags and has no seek-point field; ORACLE TRUTH §1). So the green is real but narrower than the id suggests.
- **Cached note:** ALL four PASS results have `cached: true` ("cached previous PASS result"). Evidence is reused, not freshly re-run; per the launcher-seeding caveat, wall numbers and PASS status are stale-reuse and a fully honest fresh run would require clearing the raw + .browser-cache. Treat the 1.46x margin as indicative, not freshly measured.

## Confidence & caveats

- **Confidence: medium.** The correctness verdict (4 PASS, all durationDeltaSec=0) and the NA honesty (3 engines genuinely lack a FLAC container) are solid from code + fixture. The performance ranking is weaker: every engine ran with n=1 (single sample, warmup 1, mad 0, p95 == median), so there is no spread/variance evidence and the 1.46x margin over mediabunny is single-shot. Sub-10ms reads are also sensitive to JIT warmth and scheduling jitter.
- All four PASS rows are `cached:true` — staleness risk per MEMORY launcher-seeding caveat.
- The scenario id over-promises relative to the gate: "seektable" is in the name but the SEEKTABLE block is not verified by any attached oracle (WEAK-GATE rationale above).
