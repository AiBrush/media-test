# mux/prop_vp9_decode_mux_webm_to_webm

family: mux · fixture asset: `vp9_1080p_10s.webm` (9.3 MB, VP9 1080p30 + Opus 48kHz stereo) · primaryMetric: wall · passCount: 2/7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (2 engines PASS: mediabunny, ffmpeg.wasm).
- **Decisive factor: performance.** Correctness is a tie — both engines pass the single gating oracle `property-invariant` (decode(remux(x))==decode(x)) with **12/12 frame digests bit-exact, 0 mismatches**. The tiebreaker is wall time.
- **Margin over runner-up (ffmpeg.wasm):** mediabunny **56.42 ms vs 162.73 ms wall median = ~2.88x faster**; longtasks 1012 ms vs 1227 ms = ~1.21x lower main-thread blocking. Both n=1 (single timed sample, mad=0), so the speed margin is real but low-confidence on spread.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass (12/12 bit-exact) | 56.42 ms | n/a (not measured) | 0 (not measured) | 1012 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass (12/12 bit-exact) | 162.73 ms | n/a (not measured) | 0 (not measured) | 1227 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |

Note: `throughputRealtime` and `peakMemory` are absent for both PASS engines in this shard (bench n=0 / not collected for this mux row); only `wall` and `longtasks` carry timed samples.

## Why the winner wins (deep technical)

**Operation under test.** This is an identity mux: VP9 + Opus packets are demuxed from a real Matroska/WebM source and re-authored into a fresh WebM (Matroska) container, with no re-encoding. The mux is a coded-packet COPY — the decoded pixels must be byte-for-byte identical after a WebM-writer round-trip (the scenario's `notes`, src/scenarios/mux/metamorphic.ts:113-115, and the runner's mux note at src/core/runner.ts:199 confirm mux is a packet copy, not a transcode). Because VP9 in WebM is reframed by the muxer (no source-keyed packet count), the gate is decoded-pixel identity, not packet count.

**Correctness is a genuine tie.** The gating oracle `property-invariant` resolves to the `decode-remux` branch (src/core/oracles.ts:2686-2707): it decodes the engine's WebM output with the platform WebCodecs decoder (`ctx.decodeWithPlatform`, capped at golden length) and runs `compareDigests` (src/core/oracles.ts:1166-1207), which does strict sha256 equality per frame with **zero tolerance** — any single differing RGBA digest fails. The golden `fixtures/golden/vp9_1080p_10s.webm.frames.json` is non-pending with **12 populated, all-distinct sha256 digests** at PTS 0…367000 µs. Both mediabunny and ffmpeg.wasm report `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` — a full bit-exact pass. Neither engine has a correctness edge.

**Why mediabunny is faster.** mediabunny ran on `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false` (shard env.configUsed). Its mux path (src/engines/mediabunny/adapter.ts:1508-1600) constructs a native `mb.Output` over a `BufferTarget`, attaches an `EncodedVideoPacketSource(vp9)` and `EncodedAudioPacketSource(opus)` (adapter.ts:1528, 1539), then streams each already-encoded packet straight into the Matroska writer via `source.add(EncodedPacket(...))` (adapter.ts:1562-1591) and finalizes with `output.finalize()` (adapter.ts:1598). Only the first packet of each track carries the `decoderConfig` so the muxer emits the VP9/Opus codec-private elements (adapter.ts:1571-1590). This is a pure-JS/TS packet-copy with no decode/encode and no wasm boundary — it touches only the coded bitstream and the container writer, which is why wall is 56 ms. ffmpeg.wasm performs the same logical copy but through the Emscripten wasm runtime (single-thread, no SharedArrayBuffer here), incurring wasm call overhead, an in-memory FS round-trip, and ffmpeg's heavier libavformat Matroska muxer — landing at 162.73 ms (~2.88x slower) and 1227 ms longtasks (~1.21x more main-thread blocking).

**Tiebreaker chain (per procedure 4c):** mediabunny uses a native browser/JS path with no COOP/COEP requirement (`coopCoep: not-required`), whereas the wasm engine carries the Emscripten toolchain weight. Both factors reinforce the wall-time win.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** Correctness identical (12/12 bit-exact). Lost purely on speed — 162.73 ms vs 56.42 ms wall (~2.88x slower) and 1227 ms vs 1012 ms longtasks. Mechanism: wasm-boundary + libavformat overhead for a packet copy that mediabunny does natively.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest NA — the raw WebCodecs platform shim has no container muxer; it can decode/encode but not author WebM.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest NA — this adapter is a transcode/decode wrapper, not a muxer.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest NA — media-parser is read/demux/probe only, no writer.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'mux'". Honest NA — name confirms it is a demuxer, no mux capability.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'webm'". Honest NA — mp4box.js is ISO-BMFF (MP4) only and cannot ingest a Matroska/WebM source; correctly capability-gated rather than failing at runtime.

All five NAs look honest, not under-declared: none of these libraries has a WebM-writing mux path, and mp4box genuinely cannot read WebM.

## Anti-cheat validation

- **Scenario:** src/scenarios/mux/metamorphic.ts:105-116 — id `prop_vp9_decode_mux_webm_to_webm`, invariant `DECODE_MUX`, input `vp9_1080p_10s.webm`, containersIn `['webm']`, to `'webm'`, codecs vp9/opus.
- **Fixture exists & is real:** `fixtures/media/vp9_1080p_10s.webm` = 9.3 MB; golden meta (`fixtures/golden/vp9_1080p_10s.webm.meta.json`) confirms a real VP9 1920x1080@30 + Opus 48k/2ch, 10.008 s clip. Not synthetic/empty/mock.
- **Golden:** `fixtures/golden/vp9_1080p_10s.webm.frames.json` — `pending:false`, 12 frames, 0 null sha256, 12 distinct digests. Browser-baked decode(x); ffmpeg cannot forge these RGBA digests.
- **Oracle:** src/core/oracles.ts:2686-2707 (decode-remux branch) → src/core/oracles.ts:1166-1207 (`compareDigests`, strict per-frame sha256, zero tolerance, requires all overlapping frames to match). Not a smoke/SSIM proxy; this is the strongest pixel-identity gate. Measurements (12/12, 0 mismatch) are physically plausible for an identity packet copy.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1508-1600. Genuine implementation: real `mb.Output`/`EncodedVideoPacketSource`/`EncodedAudioPacketSource`, streams real coded packets, `output.finalize()` returns BufferTarget bytes. Input tracks come from `engine.prepareMuxTracks(inputs)` demuxing the real fixture (src/core/runner.ts:724-733) — no copy-input-to-output shortcut, no short-circuit to the golden, no swallowed errors (unsupported codecs throw).
- **Cached:** Both PASS engines have `cached:true` ("cached previous PASS result"). Evidence was reused, not freshly re-run — staleness risk noted. Numbers are internally consistent and plausible, so the verdict stands, but a fresh re-run would harden the perf margin (n=1).
- **Verdict: REAL.** Real 9.3 MB fixture, real populated golden, real bit-exact zero-tolerance oracle, and a genuine packet-copy mux implementation. No mock/faked-output/un-failable-gate evidence.

## Confidence & caveats

- Confidence: **high** on the winner and REAL verdict; the only soft spot is benchmark robustness.
- Caveats: (1) both PASS results are `cached:true` — perf margin not re-validated this run. (2) `wall` n=1 (mad=0, single sample) for both — the 2.88x margin is directionally solid but lacks variance evidence. (3) `throughputRealtime` and `peakMemory` were not collected for this mux row, so the tiebreak rests on wall + longtasks only. (4) Correctness is a genuine tie; if perf were excluded, this row would be a co-win.
