# probe/cenc_ctr

**family:** probe | **fixture asset:** `cenc_ctr.mp4` (CENC `cenc-ctr` encrypted MP4, H.264 + AAC, 2.2 MB real file) | **primaryMetric:** wall (ms) | **passCount:** 6 of 7 (1 SKIPPED)

## Verdict

**Best framework: `remotion-webcodecs@4.0.479`** — CONTESTED win (6 engines PASS the single gating oracle, so correctness is tied and the decision falls to performance).

- **Decisive factor:** wall-clock median. All 6 passers satisfy the identical `golden-metadata` oracle (the only oracle on this scenario) with physically-equivalent duration deltas, so none has a correctness edge. `remotion-webcodecs` posts the lowest wall median at **9.185 ms**.
- **Margin over runner-up:** runner-up `remotion-media-parser@4.0.479` = 9.505 ms → **1.035x faster wall** (a 0.32 ms gap). Over the platform/WebCodecs engine (5999.98 ms) the margin is **653x**. Both leaders share the same `@remotion/media-parser` read core, so the gap to the runner-up is within noise (see caveats: n=1, cached).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 9.185 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 9.505 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 13.900 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:true | 14.860 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 20.785 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 5999.985 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | SKIPPED | (none) | n/a | n/a | n/a | n/a | WASM-aborts ("Assertion failed.") parsing CENC-CTR fixture; tracked engine limitation |

(No throughputRealtime / peakMemory / longtasks were recorded in this shard — the per-container probe scenario declares `metrics: ['wall']` only, so wall is the lone ranking metric.)

## Why the winner wins (deep technical)

**The operation.** `probe/cenc_ctr` is a metadata-only read of a CENC `cenc-ctr` (AES-128-CTR) encrypted MP4. No decryption key is supplied or needed: the container/track structure is in the clear, and the gate (`golden-metadata`, src/core/oracles.ts:595) only asserts container=`mp4`, duration≈5.021 s (±1 frame @ 24 fps = ±0.0417 s), and the two tracks' codec/dims/fps/sampleRate/channels against `fixtures/golden/cenc_ctr.mp4.meta.json` (video h264 1280x720 ~29.872 fps; audio aac 48000 Hz stereo).

**The hard part of CENC for a probe.** In a CENC MP4 the sample-entry FourCC is rewritten to `encv` (video) / `enca` (audio), and the true codec FourCC (`avc1`/`mp4a`) plus its configuration (`avcC`/`esds`) are hidden inside an `sinf`→`frma`/`schi` protection box. A naive parser sees the track type as opaque/"other" and cannot report `h264`/`aac`, which would FAIL the per-track codec comparison in `compareTrack` (src/core/oracles.ts:659-686).

**Why the Remotion engines clear it.** `@remotion/media-parser` exposes the encrypted tracks as `type: 'other'`, and the adapter recovers the real metadata via a dedicated CENC fallback. In the winner, `probe()` requests only the metadata-tier fields (`container/durationInSeconds/tracks/metadata`) via `parseMedia` (src/engines/remotion-webcodecs/adapter.ts:346-355), then routes the result through `withProtectedMp4MetadataFallback` (adapter.ts:358-362, defined at adapter.ts:1493). That fallback fires only when `container==='mp4'` and a track is protected — `isProtectedParserTrack` (adapter.ts:1596-1600) inspects the `trakBox` and matches sample format `encv`/`enca`. It then reads the raw bytes (`input.arrayBuffer()`, adapter.ts:1504), walks the `sinf`/`schi` boxes (`box.type === 'sinf' || box.type === 'schi'`, adapter.ts:1732) to extract the original sample entry, and reconstructs codec/width/height/sampleRate/channels plus a derived fps from fragment/progressive sample timing (adapter.ts:1520-1540). This is why the oracle detail reads "metadata matches golden (2 track(s))" rather than collapsing to 0 usable tracks. The probe stays on the `streaming` media-parser read path with no decode and no WebCodecs invocation for this metadata-only op, which is why it finishes in single-digit milliseconds despite the engine's `backend: webcodecs` label.

**Why it beats the others numerically.** Wall median 9.185 ms vs runner-up 9.505 ms (1.035x) — both Remotion engines share the identical `parseMedia` + protected-track fallback core, so the win is marginal and structural-noise-bounded. Against ffmpeg.wasm (13.900 ms, 1.51x) and mp4box (14.860 ms, 1.62x) the lead is real per-this-run: ffmpeg.wasm pays single-thread WASM init/parse overhead, and mp4box (`backend: pure-js`, `whole-file-append(MP4BoxBuffer+fileStart)`, `discardMdatDataProbe:true`) appends the whole 2.2 MB file before emitting `moov` metadata. web-demuxer (20.785 ms, 2.26x) carries its own WASM/ffmpeg demux overhead. The platform/WebCodecs engine is 5999.985 ms (653x slower) because its `pipeline: streaming` probe path with `decode: VideoDecoder` and `<video>→canvas→MediaRecorder` plumbing is enormously heavier than a header-only metadata read for this op — a structural mismatch, not a codec issue.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on perf only: 9.505 ms vs 9.185 ms = 0.32 ms / 1.035x slower wall. Same `parseMedia` read core and same CENC fallback; the gap is within n=1 noise.
- **ffmpeg.wasm@0.12.15** — PASS but slower: 13.900 ms (1.51x). Single-thread WASM `ffprobe`-style parse overhead on top of module residency; correctness identical (durationDelta 0.0010 s ≪ 0.0417 s tol).
- **mp4box@2.3.0** — PASS but slower: 14.860 ms (1.62x). `pure-js`, no hwAccel, `whole-file-append` pipeline buffers the entire file before the `moov` is parseable; `discardMdatDataProbe:true` helps but still trails the Remotion header read.
- **web-demuxer@4.0.0** — PASS but slowest of the correct readers: 20.785 ms (2.26x). WASM/ffmpeg-backed demux init cost for a metadata-only op; durationDelta 0.000354 s.
- **platform@chrome-149** — PASS but 653x slower: 5999.985 ms. `webcodecs` backend with a `VideoDecoder`/MediaRecorder pipeline applied to a metadata probe — heavy, mismatched path; correctness fine (durationDelta 0.000354 s ≪ tol).
- **mediabunny@1.48.0** — SKIPPED (not eligible to win). Reason: the engine "WASM-aborts (\"Assertion failed.\") while parsing this CENC-CTR fixture (cenc_ctr.mp4)". The shard's own note documents that mediabunny probes `cenc_cbcs.mp4` and the rest of the corpus fine and that ffmpeg.wasm reads `cenc_ctr.mp4` correctly, so this is a genuine, tracked engine limitation on the cenc-ctr container, NOT an under-declared capability or a fixture defect. The honest outcome here is SKIPPED rather than a false PASS.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/probe/index.ts:156-166 declares the case `{ asset: 'cenc_ctr.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], features: ['metadata:protected-tracks'] }`; the scenario id is built at src/scenarios/probe/index.ts:337 as `probe/${asset-without-ext}` → `probe/cenc_ctr`. `op: 'probe'`, `oracles: ['golden-metadata']`, `metrics: ['wall']` (index.ts:338-349). Notes confirm probe reports protected-track metadata WITHOUT decrypting.
- **Fixture exists & is real:** `fixtures/media/cenc_ctr.mp4` is present, 2.2 MB — a real encrypted clip, not synthetic/empty/mock. Ground-truth goldens also exist: `cenc_ctr.mp4.meta.json` (duration 5.021 s, h264 1280x720, aac 48000/2), `cenc_ctr.mp4.packets.json` (real packet table: video kf size 24654 B at pts 0, aac frames at 21333/42667 µs), and `cenc_ctr.mp4.keys.json` (`scheme: cenc-ctr`, keyHex/kid baked offline). Plausible, physically-consistent values.
- **Oracle is meaningful:** `golden-metadata` (src/core/oracles.ts:595-657) performs real field-by-field comparison — container string, duration within a strict ±1-frame band (durationToleranceFor, oracles.ts:619-625), and positional per-track codec/dims/fps/sampleRate/channels (compareTrack, oracles.ts:659-686). It is NOT smoke and NOT trivially satisfiable: an engine that reported the CENC tracks as opaque or with wrong dims would fail the codec/dims diff. Measured durationDeltaSec values (0.001 / 0.000354 s) sit well inside the 0.0417 s tolerance — tight, not loose. (Note: this is a metadata gate only; it does not assert the encryption scheme or do bit-exact decrypt — see caveats.)
- **Winner adapter genuine:** src/engines/remotion-webcodecs/adapter.ts:332-377 calls the real `@remotion/media-parser` `parseMedia` and recovers CENC track metadata via `withProtectedMp4MetadataFallback` (adapter.ts:1493-1543) which actually parses `sinf`/`schi`/`encv`/`enca` boxes from the raw bytes (adapter.ts:1596-1732). No canned output, no golden short-circuit, no input→output copy, no swallowed-error-as-success.
- **Verdict: REAL** — real encrypted fixture + genuine sinf-parsing implementation + a meaningful field-exact metadata oracle inside a tight tolerance.
- **Cached note:** the winner's result has `cached: true` ("cached previous PASS result"), as do all 6 passers. The PASS and the 9.185 ms figure were reused, not freshly re-run in this report pass — staleness/seeding risk per the launcher caveat. The ranking conclusion is robust to this (correctness is structural and the perf order is consistent), but the 0.32 ms margin over the runner-up is not.

## Confidence & caveats

- **Confidence: medium.** The REAL validation and the correctness tie are solid. The winner over the runner-up is decided by a 0.32 ms / 1.035x wall gap on **n=1** samples (`mad: 0` only because there is a single sample), with both leaders running the identical media-parser core — so "remotion-webcodecs vs remotion-media-parser" is effectively a coin-flip; the meaningful, durable result is that the two Remotion engines lead the field. All results are `cached: true`, so figures may be stale.
- **Gate strength:** this scenario gates metadata only. It does NOT assert the `cenc-ctr` scheme/KID nor perform bit-exact decrypt (those live in separate decrypt-family scenarios using `cenc_ctr.mp4.keys.json`/`.frames.json`). So PASS here means "correctly probed the protected container," not "correctly decrypted." That keeps it short of a crypto-strength gate but it is still a real, tight structural oracle.
- **mediabunny SKIPPED** is treated as honest per the shard note and corroborated by ffmpeg.wasm succeeding on the same file; not counted against eligibility.
