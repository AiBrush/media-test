# metadata/write_mp3_id3

- **Family:** metadata
- **Fixture asset:** `fixtures/media/mp3_xing.mp3` (real ~64 KB MP3 with Xing header; golden `fixtures/golden/mp3_xing.mp3.meta.json` → container mp3, 10.0s, 1 audio track mp3 @ 44100 Hz / 2ch / 51158 bps)
- **Operation:** `op: remux` carrying `options.tags` (ID3v2 write), gated by `reference-reimport` + `property-invariant` (`probe-duration`)
- **primaryMetric:** none explicitly set in shard; effective decision metric = `wall` median (`targetWrites` is 0 for both)
- **passCount:** 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — two engines PASS with identical oracle outcomes.
- **Decisive factor:** PERFORMANCE. Correctness is a tie (both pass `reference-reimport` and `property-invariant` with the same 384-packet / 1-track re-import and a duration delta well inside the 0.1s band). mediabunny wins on wall-clock: **5.335 ms median vs ffmpeg-wasm 7.130 ms = 1.34x faster** wall. Secondary tiebreaker reinforces it: mediabunny runs as a pure-TS ESM core with no COOP/COEP and no SharedArrayBuffer requirement, whereas ffmpeg.wasm carries a multi-MB wasm binary and a heavier per-exec MEMFS write/read + log-parse path.
- **Margin caveat:** both samples are `n==1` and `cached==true`, so the margin is weak evidence (no MAD/p95 spread to confirm stability).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true, property-invariant:true | 5.335 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true, property-invariant:true | 7.130 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mp3' |

Bench note: the shard records only `wall` and `targetWrites` for the two PASS engines; `throughputRealtime`, `peakMemory`, and `longtasks` were not captured for this scenario (shown as n/a). `targetWrites` median is 0 for both, so it is not a discriminator.

## Why the winner wins (deep technical)

This scenario is an **ID3v2-tag write onto an MP3 elementary stream** modeled honestly as a lossless **remux**: the runner forwards `options.tags` (the `UNICODE_TAGS` map — emoji/CJK title, non-ASCII artist, a >255-byte comment that crosses the ID3 text-frame size boundary) to the engine's `remux(input, { container:'mp3', tags })`, and gates the output with two observe-the-output oracles rather than a tag-readback. The container is bare MPEG-1/2 Audio (Layer III) framing with a Xing header on input; there is no moov/ilst or Matroska Tags element — tags live in an ID3v2 region prepended to the stream, and the audio frames themselves must be copied untouched.

**Correctness is genuinely tied.** Both engines satisfy `reference-reimport` (oracles.ts:1225, semantic path at :1273) — the reference engine re-demuxes each engine's output and finds **384 packets / 384 "keyframes" / 1 media track**, matching the golden's single audio track (`goldenMediaTracks:1`). For MP3, every audio frame is independently decodable so all 384 frames register as keyframes; the identical 384 count from both engines confirms neither dropped or re-chunked frames while injecting ID3. Both also satisfy `property-invariant` with `which="probe-duration"` (oracles.ts:2645, audio-no-PCM-oracle branch at :2709/:2754): mediabunny `outDurationSec=10.0571s` (Δ 0.0571s) and ffmpeg-wasm `outDurationSec=10.0310s` (Δ 0.0310s), both ≤ the 0.1s tolerance the scenario sets explicitly (`tolerances.durationToleranceSec: 0.1`, write-roundtrip.ts:83). The sub-frame duration drift (one MP3 frame @ 44.1 kHz ≈ 26 ms) is exactly the "ID3/Xing rewrite materializes one frame of estimation drift without changing the stream" behavior the notes anticipate. Strictness is equal: same oracle ladder rung (structural/metadata + duration proxy), same tolerance, same packet/track equality — no correctness separation.

**So the win is mechanistic/performance.** mediabunny's `remux` (src/engines/mediabunny/adapter.ts:1244-1260) builds a `Mp3OutputFormat` (codecs.ts:176-177) and drives the **Conversion API** (`runConversion`, adapter.ts:1256) with no codec or transform options — mediabunny's documented lossless audio COPY fast-path that streams read→copy-encoded-samples→mux in a single pure-TypeScript ESM pipeline (`configUsed.coreBuild: "pure-ts-esm"`, `pipeline: "streaming-lockstep"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`). For a tiny 64 KB MP3 with no transcode, that path is almost pure I/O: parse frames, prepend the ID3 region, re-emit. ffmpeg.wasm (src/engines/ffmpeg-wasm/adapter.ts:2031-2069) instead has to: (1) `writeInput` the bytes into MEMFS, (2) run a separate `runInfo` `-i` probe and regex-parse the log for `assertRemuxContainerCompatible`, (3) `-map 0 -c copy -metadata k=v` exec through the wasm FFmpeg, then (4) `readBinary` the output back out of MEMFS. That extra probe-exec + MEMFS marshalling + log-parsing overhead is the ~1.8 ms gap (7.130 vs 5.335 ms). Both correctly emit `-metadata`/getMetadataTags-style ID3 frames under stream copy, so the only differentiator at 64 KB is pipeline overhead — and mediabunny's no-WASM, no-MEMFS, no-second-pass path is leaner. The tiebreaker chain (4c) also favors mediabunny: no COOP/COEP requirement and streaming rather than whole-file double-buffering through a wasm filesystem.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** Correct and lossless, but 7.130 ms wall vs mediabunny's 5.335 ms (mediabunny 1.34x faster). The gap is the extra `runInfo` probe-exec, MEMFS write/read marshalling, and log regex-parse around the `-c copy -metadata` exec (adapter.ts:2037-2064). Its duration drift (0.0310s) is actually tighter than mediabunny's (0.0571s), but both clear the 0.1s gate so correctness does not break the tie.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'mp3'". Honest NA — MP4Box.js is an ISOBMFF (MP4/MOV/fragmented-MP4) library and genuinely cannot ingest a raw MPEG audio elementary stream; ID3-on-MP3 is out of its container model.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — the WebCodecs/platform adapter exposes decode/encode primitives, not a container muxer, so it cannot produce a tagged MP3 output container.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — it is a read/parse-only library (parser), no muxing/writing path.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'remux'". Honest — a demux-only wasm wrapper; it reads packets but does not write containers.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare output container 'mp3'". Honest — its WebCodecs-based output path does not target an MP3 muxer, so it cannot author the tagged MP3 stream.

All five NAs are capability-honest (declared-capability gating in runner.ts/registry.ts), not under-declared dodges: none of these libraries has an MP3-container writing path that the suite is hiding.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/metadata/write-roundtrip.ts:77-90` (`id: 'write_mp3_id3'`), built via `buildWrite` (`src/scenarios/metadata/_shared.ts:133-147`, attaches `oracles: ['reference-reimport','property-invariant']`).
- **Fixture exists & is real:** `asset: 'mp3_xing.mp3'` → `fixtures/media/mp3_xing.mp3` present (~64 KB, real MP3 with Xing header), golden meta `fixtures/golden/mp3_xing.mp3.meta.json` and packet table `mp3_xing.mp3.packets.json` (43 KB) both present. Not synthetic/empty/mock.
- **Oracles are real comparisons:** `reference-reimport` (oracles.ts:1225, semantic remux path :1273-1324) re-demuxes the engine output with the reference engine and asserts non-empty packets, matching media-track count/layout vs golden, and duration within band — physically plausible numbers (384 packets, 1 track). `property-invariant`/`probe-duration` (oracles.ts:2645/2709-2758) re-probes the authored output's duration vs golden 10.0s with a 0.1s band. Tolerance is explicit and tight (0.1s ≈ ~3.8 MP3 frames), not a "passes anything" gate; this is a structural+duration proxy, not bit-exact PCM (no PCM oracle exists for MP3, acknowledged in the scenario notes and _shared.ts ORACLE TRUTH §2).
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts:1244-1260` calls the real mediabunny `Output`/Conversion API with a real `Mp3OutputFormat` and `BufferTarget` — no canned bytes, no input→output passthrough copy, no short-circuit to the golden file, no swallowed errors (errors throw). The ffmpeg-wasm runner-up (adapter.ts:2031-2069) is likewise a real `-c copy -metadata` wasm exec.
- **Verdict:** **WEAK-GATE.** The PASS is real (real fixture, real Conversion/wasm implementations, real re-import and duration comparison), but the gate does NOT verify the actual ID3 tag CONTENT was written — the scenario itself documents (write-roundtrip.ts:15-18, notes:84-89) that tag-readback is not yet oracled. So the test confirms "produced a valid, uncorrupted MP3" but not "the ID3v2 frames (UTF-8 title/artist/>255-byte comment) round-trip." The correctness ladder rung here is structural+duration-proxy, not bit-exact; hence WEAK-GATE rather than REAL.
- **Cached note:** winner `cached==true` ("cached previous PASS result", startedAt 2026-06-22T14:06Z); runner-up also cached (16:38Z). Staleness risk: both results were reused, not re-run for this report, and both bench samples are `n==1`, so the 1.34x margin is from a single measurement each — directionally credible but not statistically robust.

## Confidence & caveats

- Confidence: **medium.** The winner selection is unambiguous on the stated decision procedure (only 2 PASS, correctness tied, mediabunny faster on the only discriminating metric), and both adapters are verified genuine. But: (1) the gate is a WEAK-GATE — no ID3 tag-content readback, so neither engine's *tag* fidelity is actually proven; (2) both results are cached with `n==1`, so the performance margin lacks spread/MAD evidence; (3) ffmpeg-wasm's duration drift is actually tighter (0.0310s vs 0.0571s), so if a stricter duration oracle were used the correctness picture could shift, though both remain inside tolerance.
