# robustness/edge_audio_only_probe

- **Family:** robustness
- **Fixture asset:** `fixtures/media/aac_audio_only.m4a` (ISO Media / MP4 Base Media v1, 163 KB) — real audio-only M4A, AAC, no video track
- **Primary metric:** wall time (`durationMs`) — only metric present in shard; no `bench{}` populated
- **passCount:** 7 / 7
- **Oracle:** `golden-metadata` (single gate)

## Verdict

- **Best framework:** `remotion-webcodecs@4.0.479` (nominal fastest)
- **Contested:** YES — all 7 engines PASS the only oracle (`golden-metadata`).
- **Decisive factor:** Correctness is a perfect tie (every engine reports the identical, golden-matching track shape: 1 audio track, AAC, 48000 Hz, 2 ch, duration Δ = 0.0000 s). The decision therefore falls to performance (wall time), where remotion-webcodecs is the lowest at 8 ms.
- **Margin over runner-up:** 8 ms vs 9 ms (mediabunny / mp4box) = 1.13x. This margin is **within measurement noise** (n=1, cached results, 1 ms difference at the timer floor). The win is nominal, not robust.

## Per-engine results

| Engine | Status | Oracles passed | Wall median (durationMs) | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 8 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 9 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 9 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 25 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 46 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 49 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 159 | n/a | n/a | n/a | cached previous PASS result |

All seven `golden-metadata` outcomes carry identical measurements: `durationDeltaSec: 0`, `durationToleranceSec: 0.041666…` (±1 frame at 24 fps band). Detail string for each: "metadata matches golden (1 track(s))".

## Why the winner wins (deep technical)

This scenario is a **metadata-only probe** of an audio-only MP4/M4A. The container holds a single AAC track (`mp4a`, 48 kHz stereo, ~128 kbps, `und` language, `isom` major brand) with **no video track and no `mdat` sample decoding required**. The gate (`golden-metadata`, oracles.ts:595) compares the probed container, duration (within a ±0.0417 s band), and per-track codec/sampleRate/channels positionally against `fixtures/golden/aac_audio_only.m4a.meta.json`. The robustness point (scenario notes, src/scenarios/robustness/index.ts:635-637) is that track enumeration must report **exactly the audio track and not synthesize a phantom video track**. Every engine handled this correctly — the audio-only edge case is the entire test, and none of them tripped on it.

Because correctness is bit-for-bit identical across all 7 engines (durationDeltaSec = 0 for every engine, same single AAC track), the strictness ladder produces no separation: `golden-metadata` is a **structural/metadata-exact** oracle (mid-tier), and all engines satisfy it equally. There is no bit-exact or decoded-frame oracle here to break the tie, so performance is the only remaining axis.

On wall time, **remotion-webcodecs** edges the field at 8 ms. Mechanistically, its probe path (src/engines/remotion-webcodecs/adapter.ts:332-360) calls `@remotion/media-parser` `parseMedia` requesting only the header fields `{container, durationInSeconds, tracks, metadata}` (adapter.ts:349-354). `parseMedia` with `tracks` does **not** force a full sample scan — it reads the `moov`/`stsd`/`mdhd` boxes for codec, sample rate, channel count and the `mvhd`-declared duration, then stops. For a 163 KB audio-only M4A whose `moov` is tiny, that is a few hundred microseconds of box parsing plus harness overhead, hence the 8 ms floor reading.

The two runners-up are essentially tied with it: **mediabunny** (9 ms) uses the same cheap-metadata discipline — `getDurationFromMetadata()` reads the container's declared duration without scanning samples and only falls back to `computeDuration()` if metadata yields null (src/engines/mediabunny/adapter.ts:421-441), then enumerates tracks via `input.getTracks()` (adapter.ts:443). **mp4box** (9 ms) parses the `moov` natively in pure-JS and, per its config (`discardMdatDataProbe: true`), drops `mdat` payload during the probe so it never buffers sample data. The 1 ms gap between 8 and 9 ms is at the resolution of the timer and these are all `cached==true` reuses, so the ordering among the top three is not physically meaningful — any of remotion-webcodecs / mediabunny / mp4box is a defensible "winner". remotion-webcodecs is reported as best strictly because it has the lowest recorded number.

The slower tier is explained by heavier fixed costs, not by the work the probe actually needs: platform (25 ms) routes through the browser's `<video>`/WebCodecs init for what is a header read; remotion-media-parser (46 ms) and web-demuxer (49 ms) carry parser/WASM module setup; ffmpeg.wasm (159 ms) pays the full single-thread WASM `ffprobe`-style invocation (module instantiation + FS write + demuxer open) for a job that needs only a `moov` read — a ~20x wall-time penalty versus the winner for identical correctness.

## What each other framework did wrong

- **mediabunny@1.48.0** — Nothing wrong; PASS with identical correctness. Lost the nominal race by 1 ms (9 vs 8 ms = 1.13x slower). Within noise; co-winner in practice.
- **mp4box@2.3.0** — Nothing wrong; PASS, 9 ms (1.13x slower). Pure-JS `moov` parse with `mdat` discarded on probe. Within noise; co-winner in practice.
- **platform@chrome-149** — PASS but 25 ms (3.1x slower than winner). Browser media-element/WebCodecs init overhead dominates a header-only read.
- **remotion-media-parser@4.0.479** — PASS but 46 ms (5.75x slower). Same `parseMedia` read path as remotion-webcodecs but with higher CPU-JS parser setup cost in this run (`backend: cpu-js`, `worker: false`).
- **web-demuxer@4.0.0** — PASS but 49 ms (6.13x slower). WASM demuxer module/setup cost for a metadata probe.
- **ffmpeg.wasm@0.12.15** — PASS but 159 ms (19.9x slower). Full single-thread WASM ffmpeg invocation (instantiation + virtual-FS write + demuxer open) for a job that only needs `moov` metadata.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/robustness/index.ts:628-638 (`id: 'edge_audio_only_probe'`, `op: 'probe'`, `asset: 'aac_audio_only.m4a'`, `oracles: ['golden-metadata']`).
- **Fixture exists & is real:** `fixtures/media/aac_audio_only.m4a` — `file` reports "ISO Media, MP4 Base Media v1 [ISO 14496-12:2003]", 163 KB. Not synthetic/empty/mock. Golden present: `fixtures/golden/aac_audio_only.m4a.meta.json` (real values: mp4, 10 s, audio/aac/48000/2ch/128143 bps) and `aac_audio_only.m4a.packets.json` (53 KB).
- **Oracle:** src/core/oracles.ts:595-657 (`goldenMetadata`). Performs a real comparison: container string, duration within a per-container tolerance band (here ±0.0417 s, the strict ±1-frame band — NOT a loose estimate band), and positional per-track codec/sampleRate/channels via `compareTrack` (oracles.ts:659-686). Measured `durationDeltaSec: 0` is physically plausible for a clean MP4 with an `mvhd`-declared duration. The track-count check (oracles.ts:645-647) is exactly what guards the audio-only robustness concern.
- **Winner adapter:** src/engines/remotion-webcodecs/adapter.ts:332-360 — genuine `@remotion/media-parser` `parseMedia` call requesting `{container, durationInSeconds, tracks, metadata}`. No canned output, no golden short-circuit, no copy-input-as-output. Returns `normalizeMetadata(...)` from the parser's real results.
- **Cached note:** ALL 7 engines have `cached==true` ("cached previous PASS result"). These are reused, not freshly re-run in this report's run. Per the launcher seeding caveat, stale PASS reuse means the 8/9/9 ms ordering is not a fresh measurement; treat the perf ranking as indicative only.
- **Verdict:** **WEAK-GATE.** The fixture is real, the implementation genuine, and the oracle performs a real golden comparison — but the gate is metadata-only (a single mid-tier structural oracle with no decode/bit-exact check), so a PASS is real yet not a strong correctness discriminator, and all 7 pass it identically. There is no evidence of cheating; it is simply a low-bar gate where every engine succeeds and the "winner" is decided by a 1 ms (within-noise), cached wall-time difference.

## Confidence & caveats

- **Confidence: medium.** Correctness conclusion (perfect 7-way tie, REAL gate, real fixture) is high-confidence. The performance-based winner selection is low-confidence: 8 vs 9 ms is a 1 ms gap at the timer floor, n=1, and every result is cached (not re-run). remotion-webcodecs, mediabunny, and mp4box should be treated as effectively co-winners.
- The shard contains no `bench{}` block — no throughputRealtime / peakMemory / longtasks / p95 / mad were available, so the secondary performance tiebreakers in the decision procedure could not be applied; only `durationMs` was usable.
- If a fresh (non-cached) re-run is performed, the sub-10 ms ordering among the top three could easily flip.
