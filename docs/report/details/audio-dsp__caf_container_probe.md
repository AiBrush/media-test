# audio-dsp/caf_container_probe

**family:** audio-dsp · **fixture asset:** `pcm_s16.caf` (960 KB, real CAF) · **golden:** `fixtures/golden/pcm_s16.caf.meta.json` (+ `.packets.json`) · **primaryMetric:** wall · **passCount:** 1 / 7

## Verdict

**Best framework: `ffmpeg.wasm@0.12.15` — UNCONTESTED winner.**

It is the only engine that declares the `caf` (Apple Core Audio Format) input container. The other six engines all returned `NA_ENGINE` ("engine does not declare input container 'caf'") during capability pre-negotiation, so they never ran. The decisive factor is **capability coverage**, not performance: CAF is an Apple-specific container that none of the JS/WebCodecs/MP4-family demuxers support, and only ffmpeg's WASM core has a CAF demuxer.

Margin over runner-up: **N/A** — there is no second engine that ran. ffmpeg.wasm passed the `golden-metadata` oracle with a perfect duration match (Δ 0.0000 s vs ±0.0417 s tolerance) on a single timed sample (wall median 5.35 ms, 186.9 ops/s).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | golden-metadata:pass | 5.35 ms | — (opsPerSec 186.9) | — | — | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'caf' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'caf' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'caf' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'caf' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'caf' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'caf' |

No `peakMemory`/`throughputRealtime`/`longtasks` bench keys are emitted for this probe scenario; the shard's `bench{}` contains only `wall` (n=1) and `opsPerSec` (n=1).

## Why the winner wins (deep technical)

The container is **CAF (Apple Core Audio Format)**, confirmed by the fixture's magic bytes `63 61 66 66` (`caff`) followed by the `desc` chunk; the audio data is **LPCM** (`6c 70 63 6d` = `lpcm`) at a sample rate stored as the IEEE-754 float64 `40 e7 70 00 ...` = **48000 Hz**, **2 channels**, 16-bit. The golden asserts exactly this: `container: caf`, one audio track `codec: pcm-s16`, `sampleRate: 48000`, `channels: 2`, `bitrate: 1536000`. CAF is a Core-Audio-only chunked container; it is not handled by ISO-BMFF parsers (mp4box), WebCodecs-fed demuxers (remotion-webcodecs, web-demuxer), or the JS audio parsers (mediabunny, remotion-media-parser), nor by the browser platform path. ffmpeg's WASM core, by contrast, ships the `caf` demuxer, so it is the only engine whose declared `containersIn` includes `caf` — hence the sole PASS.

The operation here is `probe` (metadata read only). The winner's adapter does **not** use ffprobe — it is deliberately disabled because the vendored `@ffmpeg/core(-mt)` 0.12.10 `_ffprobe` entry point reads an uninitialized `Module.ret` and surfaces "ffprobe exited -1" for every call (`src/engines/ffmpeg-wasm/adapter.ts:262-273`). Instead `probe()` runs `ffmpeg -hide_banner -i <in>` purely to print the Input block to the log, then parses metadata from that log:
- `src/engines/ffmpeg-wasm/adapter.ts:1892-1904` — `probe()` writes the input to MEMFS, calls `runInfo()`, and builds metadata via `metadataFromLog()`.
- `src/engines/ffmpeg-wasm/adapter.ts:1912-1930` — `runInfo()` execs `ffmpeg -i` (which exits non-zero after printing the Input block because no output file is given) and asserts `^Input #\d+` is present, otherwise throws "could not read input". This is a genuine demux of the CAF header, not a canned response.
- `src/engines/ffmpeg-wasm/adapter.ts:1946-1957` — `metadataFromLog()` parses `durationSec`, tracks (codec/sampleRate/channels), and tags from the real log; container is resolved by `containerFromInput()` which maps `.caf` → `caf` (`adapter.ts:800`).

The `golden-metadata` oracle (`src/core/oracles.ts:595-657`) then performs a field-by-field comparison: container string equality (`caf` vs `caf`), duration within a per-container tolerance, and positional per-track codec/sampleRate/channels equality (`compareTrack`, `oracles.ts:659-682`). The recorded measurement `durationDeltaSec: 0` against `durationToleranceSec: 0.0417` (≈ one frame at the strict band) shows the parsed duration (5 s) matched the golden exactly, and the pass detail "metadata matches golden (1 track(s))" confirms the single PCM track's codec/rate/channels all matched. This is a real structural/metadata-exact gate, not a smoke test.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE: does not declare `caf` in its `containersIn`. Honest NA — mediabunny's parser set targets MP4/WebM/MP3/WAV/Ogg, not Apple CAF.
- **platform@chrome-149** — NA_ENGINE: the browser media stack (HTMLMediaElement / WebCodecs demux path) has no CAF demuxer. Honest NA.
- **mp4box@2.3.0** — NA_ENGINE: mp4box is an ISO-BMFF (MP4/MOV) box parser; CAF is a different chunked format. Honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: its container matrix excludes CAF. Honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE: although it is also ffmpeg-derived, its declared/build-time enabled demuxer set does not include `caf`. Honest NA (under-declaration is possible but the conservative declaration is correct behavior, not a defect).
- **remotion-webcodecs@4.0.479** — NA_ENGINE: WebCodecs-driven, no CAF container support. Honest NA.

All six NAs are pre-negotiation refusals (`reason: engine does not declare input container 'caf'`) with empty `oracleOutcomes`, i.e. they never touched the bytes — these are honest capability declarations, not silent failures dressed as PASS.

## Anti-cheat validation

- **Scenario:** `src/scenarios/audio-dsp/index.ts:440-445` defines `id: 'caf_container_probe'`, `op: 'probe'`, `input: 'pcm_s16.caf'`, `requires.containersIn: ['caf']`, `requires.audioCodecs: ['pcm-s16']`, oracle `golden-metadata`. The scenario notes (line 444) and the comment block at lines 419-421 explicitly state the case is declared against the canonical CAF id so the CAF-capable engine (ffmpeg) is exercised while others NA cleanly — matching the observed outcome.
- **Fixture exists & is real:** `fixtures/media/pcm_s16.caf` is 960 KB; `xxd` shows the `caff`/`desc`/`lpcm` CAF magic and a float64 sample rate of 48000 Hz. Not synthetic, empty, or mocked.
- **Golden is real:** `fixtures/golden/pcm_s16.caf.meta.json` declares caf/pcm-s16/48000/2ch/5s; `fixtures/golden/pcm_s16.caf.packets.json` (26 KB) enumerates real 4096-byte LPCM packets at 21333 µs spacing — consistent with 2048 samples/packet at 48 kHz × 2ch × 2 bytes.
- **Winner adapter is genuine:** `src/engines/ffmpeg-wasm/adapter.ts:1892-1957` runs the real WASM `ffmpeg -i` demux and parses its log; no hardcoded output, no copy-to-golden short-circuit, no swallowed errors (it throws if the Input block is absent).
- **Oracle is meaningful:** `src/core/oracles.ts:595-657` compares container + duration (±0.0417 s) + per-track codec/sampleRate/channels against the golden; measurement `durationDeltaSec: 0` is physically plausible and exact. Not a wide-open or smoke-only gate.
- **Cached note:** ffmpeg.wasm's result has `cached: true` ("cached previous PASS result"), so the PASS was reused, not re-run in this batch. The underlying evidence (real fixture + real adapter + exact oracle match) is sound, but the timing/measurement is from a prior run — staleness risk is low for a deterministic header probe but is noted.

**validationVerdict: REAL** — real CAF fixture, genuine ffmpeg WASM demux implementation, and a meaningful metadata-exact oracle that matched exactly.

## Confidence & caveats

- **Confidence: high.** The win is structural (only CAF-capable engine) and the oracle is exact-match metadata, verified against a real CAF binary and golden.
- Single-engine PASS means there is no head-to-head performance comparison; the 5.35 ms / 186.9 ops/s figures are n=1 (mad=0, no spread) and cached, so they are indicative only.
- The six NAs are honest capability declarations; web-demuxer (also ffmpeg-based) could in principle support CAF if its demuxer were enabled, but declaring it NA rather than falsely PASS is correct conservative behavior, not a cheat.
