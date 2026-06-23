# mux/edge_hevc_decode_mux_mp4

- family: mux
- fixture asset(s): `fixtures/media/hevc_1080p_10s.mp4` (11 MB, real HEVC 1080p30 + AAC, 10s)
- primaryMetric: wall (ms)
- passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`)
- Contested: **YES** — 2 engines PASS (mediabunny, ffmpeg.wasm) with identical, bit-exact correctness.
- Decisive factor: **performance**. Correctness is a dead tie (both pass the same two oracles bit-for-bit:
  12/12 decoded frame digests, 770 packets / 475 keyframes on re-import). mediabunny wins on wall time.
- Margin over runner-up: **2.37x faster wall** (57.395 ms vs 135.745 ms). It uses the hardware WebCodecs
  backend with no COOP/COEP requirement; ffmpeg.wasm runs single-thread wasm and rebuilds elementary
  streams before muxing. Caveat: both samples are n==1, and mediabunny's measured longtasks (4410 ms) is
  actually *higher* than ffmpeg.wasm's (3045 ms), so the speed win is real but the spread is uncharacterized.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:✓, reference-reimport:✓ | 57.395 ms | n/a | 97,541,102 B | 4410 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:✓, reference-reimport:✓ | 135.745 ms | n/a | n/a (n=0) | 3045 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'mux:browser-decode-equality' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

This scenario is the metamorphic invariant `decode(mux(x))==decode(x)` (`DECODE_MUX`, defined at
`src/scenarios/mux/_shared.ts:75`) applied to HEVC. The candidate demuxes the source HEVC/AAC mp4, then
re-muxes the *encoded* video packets into a fresh mp4. The hard part for HEVC specifically is authoring the
`hvcC` codec-private box (VPS/SPS/PPS parameter sets) into the output `hev1`/`hvc1` sample entry: if the
muxer drops or corrupts the parameter sets, the re-decoded pixels change and the frame-digest comparison
diverges (scenario notes, `src/scenarios/mux/codec-edges.ts:112-115`).

mediabunny's mux path (`src/engines/mediabunny/adapter.ts:1508`) builds an `Output` over an
`EncodedVideoPacketSource` (`adapter.ts:1528`) and, crucially, attaches the source track's `description`
bytes (the raw `hvcC`) to the **first** packet's `decoderConfig` (`adapter.ts:1570-1581`). That is exactly
what the muxer needs to emit the codec-private boxes into the output sample entry. Each source packet is
re-wrapped as a real `EncodedPacket` carrying its original key/delta flag, PTS and duration
(`adapter.ts:1562-1569`), so presentation timing and keyframe structure survive the round trip. The backend
used was `webcodecs` with `hwAccel: prefer-hardware`, `wasmThreads: 0`, `coopCoep: not-required`
(env.configUsed) — the decode side of the invariant runs on the hardware HEVC decoder of the Apple M1 Max,
which is what makes the 57.4 ms wall possible.

The proof it worked is in the oracle measurements (not synthesized): the `property-invariant` oracle
(`src/core/oracles.ts:2686-2707`, comparison in `compareDigests` at `oracles.ts:1166`) decoded the muxed
output with the platform and compared all 12 frame digests against the baked golden `decode(x)` —
`measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0`, i.e. bit-exact SHA-256 match,
the strongest correctness rung. The `reference-reimport` oracle (`oracles.ts:1225`) then had the reference
engine re-demux the output and got `reimportPackets:770, reimportKeyframes:475`, which matches the source
golden packet table exactly (`fixtures/golden/hevc_1080p_10s.mp4.packets.json` = 770 packets, 475
keyframes) — so no packets were dropped, duplicated, or had their keyframe flags mangled.

ffmpeg.wasm passes the *identical* oracle outcomes (same 12/12 bit-exact frames, same 770/475 re-import),
so it is genuinely correct, not a weaker pass. It loses purely on cost. Its mux path
(`src/engines/ffmpeg-wasm/adapter.ts:2899`) cannot just hand packets to a muxer: it reconstructs each track
as a demuxable **elementary stream** in MEMFS (`adapter.ts:2919`, converting length-prefixed HVCC NAL units
to Annex-B per the comment at `adapter.ts:491-495`), writes each to the wasm FS, then runs a real
`-i ... -map ... -c copy -movflags +faststart` mux (`adapter.ts:2924-2939`). That extra
parse/rebuild/FS-write step plus single-thread wasm execution costs ~78 ms more wall (135.745 vs 57.395 ms,
2.37x). Tiebreakers also favor mediabunny: hardware WebCodecs vs single-thread wasm, and no
SharedArrayBuffer / COOP-COEP requirement.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on performance only: wall 135.745 ms vs mediabunny 57.395 ms (2.37x
  slower). Correctness is identical (12/12 bit-exact frames, 770 packets / 475 keyframes). The gap is the
  HVCC→Annex-B elementary-stream rebuild plus single-thread wasm mux. (It did beat mediabunny on longtasks:
  3045 ms vs 4410 ms.)
- **mp4box@2.3.0** — NA_ENGINE: does not declare feature `mux:browser-decode-equality`. Honest: mp4box is a
  box-level (de)muxer and does not own a decode path to satisfy the `decode(mux(x))==decode(x)` invariant,
  so it cannot self-validate this gate.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare operation `mux`. Honest; it is a WebCodecs
  transcode/decode wrapper, not a muxer.
- **platform@chrome-149** — NA_ENGINE: does not declare operation `mux`. Honest; the raw browser surface has
  no first-class container-mux operation in this harness.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare operation `mux`. Honest; its name and scope are
  demux-only.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare operation `mux`. Honest; it is a parser,
  not a writer.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/codec-edges.ts:104` (`id: 'edge_hevc_decode_mux_mp4'`), invariant
  `DECODE_MUX` (`src/scenarios/mux/_shared.ts:75`), built via `buildMuxProperty`
  (`src/scenarios/mux/_shared.ts:261`).
- Fixture: `fixtures/media/hevc_1080p_10s.mp4` exists and is real — 11 MB; golden meta
  (`fixtures/golden/hevc_1080p_10s.mp4.meta.json`) confirms HEVC 1920x1080@30fps (8.7 Mbps) + AAC 48 kHz
  stereo, 10 s. Not synthetic/empty/mock.
- Oracles: `property-invariant` does a real platform decode of the muxed output and SHA-256 frame-digest
  comparison against the baked golden (`src/core/oracles.ts:2686-2707` → `compareDigests` at
  `oracles.ts:1166-1207`); it fails on any mismatch or missing frame. `reference-reimport` re-demuxes the
  output and checks packet/keyframe counts within 2% of golden (`oracles.ts:1252-1265`). Neither is
  trivially satisfiable: this is bit-exact + structural, not smoke or wide-tolerance SSIM.
- Measurements are physically plausible for this asset: 12 baked golden frames, 770 packets / 475 keyframes
  — and the re-import figures match the source golden packet table exactly (`...packets.json`).
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508` (mux), with hvcC carried at `adapter.ts:1570-1581`.
  Genuinely calls the real mediabunny library (`Output` / `EncodedVideoPacketSource`); does NOT return canned
  bytes, copy input→output, short-circuit to golden, or swallow errors.
- Cached note: mediabunny's result has `cached:true` ("cached previous PASS result", run 2026-06-22T16:56Z);
  ffmpeg.wasm is also `cached:true` (run 2026-06-22T13:56Z). Evidence is reused, not freshly re-run — minor
  staleness risk, but the oracle outcomes and measurements are internally consistent with the fixtures.
- Verdict: **REAL** — real fixture + real implementation + meaningful bit-exact correctness gate.

## Confidence & caveats

- Confidence: **high** on the winner pick. Correctness is a true tie at the strongest rung; mediabunny's
  2.37x wall advantage plus hardware-WebCodecs / no-COOP-COEP tiebreakers are decisive.
- Caveats: (1) both engines' bench is **n==1** with mad==0, so the wall margin has no spread estimate — a
  single-sample win is weaker evidence than a multi-run median. (2) mediabunny's longtasks (4410 ms) is
  *higher* than ffmpeg.wasm's (3045 ms), so on main-thread-blocking it is actually worse; the wall win is
  the relevant primaryMetric but this is a genuine mixed signal. (3) ffmpeg.wasm peakMemory has n==0
  (unmeasured), so no memory comparison is possible. (4) Both results are cached, not re-run this session.
