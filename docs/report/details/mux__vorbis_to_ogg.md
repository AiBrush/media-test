# mux/vorbis_to_ogg

family: mux | fixture asset: `vp8_720p_10s.webm` (Vorbis audio track) | primaryMetric: wall | passCount: 2

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** (CONTESTED — 2 PASS: ffmpeg.wasm and mediabunny).

Decisive factor: **main-thread responsiveness**. Both engines pass the *same single* oracle
(`property-invariant` / probe-duration) with comparable correctness, so the decision falls to
performance. The two engines are a statistical dead heat on wall (23.495 ms vs 23.825 ms, a mere
1.01x edge) and throughput (425.75x vs 419.85x realtime, 1.01x), but ffmpeg.wasm blocks the main
thread for only **315 ms of longtasks vs mediabunny's 3045 ms — a 9.67x gap** (mediabunny is 9.67x
worse). That is the one metric with a real margin, and it is the user-visible one (UI jank). ffmpeg
also reports a concrete `peakMemory` of ~77 MB while mediabunny emitted no peakMemory sample (n=0),
so memory cannot be compared. Margin summary: ffmpeg ≈1.01x faster wall, ≈1.01x higher throughput,
and **9.67x lower main-thread blocking**.

Caveat: this is a *thin* win. Both results are `cached==true` (reused, not freshly run), every bench
metric has n==1 (mad==0, no spread), and mediabunny actually has the slightly tighter duration delta
(Δ0.0143s vs Δ0.0173s). The win rests on longtasks, which is the only metric showing daylight.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 23.495 | 425.75 | 76998941 | 315 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 23.825 | 419.85 | 0 (n=0) | 3045 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is: demux the **Vorbis** audio elementary track out of a Matroska/**WebM** container
(`vp8_720p_10s.webm`, `extraOptions.trackSelect: ['audio:0']`, dropping the VP8 video) and re-author
it into an **OGG** container — re-emitting Ogg pages with correct granulepos/segment-table framing
around the Vorbis identification/comment/setup headers and audio packets. This is a pure container
re-wrap (no re-encode): the Vorbis bitstream is stream-copied, and the muxer's only job is to lay
down legal Ogg page boundaries and a granulepos timeline that probes back to the source duration.

Both PASS engines satisfy the gating oracle `property-invariant` (probe-duration variant,
src/core/oracles.ts:2709-2759): the runner re-probes the authored OGG with the reference engine and
compares its duration to the golden source duration (10.003 s). ffmpeg's OGG measured
`outDurationSec=10.0203`, Δ=0.0173 s; mediabunny measured `outDurationSec=10.0173`, Δ=0.0143 s. Both
are inside the container tolerance band `durationToleranceSec=0.04167` (the ~±1-frame band the oracle
computes for OGG). So both engines wrote a structurally valid OGG whose granulepos timeline rebuilds
the right duration — correctness is genuinely comparable, with mediabunny marginally tighter
(0.0143 < 0.0173) but both an order of magnitude inside tolerance.

ffmpeg.wasm wins on execution mechanics. Its mux path (src/engines/ffmpeg-wasm/adapter.ts) does not
hand opaque WebCodecs chunks to a JS muxer; it reconstructs each track as a demuxable elementary
stream in MEMFS and then runs the real wasm `ffmpeg -c copy` mux (header comment at
adapter.ts:491-495; the `mux:true` capability and the `-c copy` file path are declared at
adapter.ts:1463 and 1509-1510). The OGG write is the libavformat ogg muxer running inside the wasm
worker, with `isOgg`/container detection at adapter.ts:714-715 and 803. Because the heavy lifting
(page authoring, granulepos accounting) happens in compiled C inside the worker, the *main thread*
only marshals buffers — hence longtasks of just **315 ms**. ffmpeg also surfaces a real
`peakMemory=76998941` (~77 MB), consistent with the wasm linear-memory heap holding the ~1.3 MB
WebM plus libav muxer state.

mediabunny's mux (src/engines/mediabunny/adapter.ts:1508-1600) is a *pure-TS ESM* core
(`env.configUsed.coreBuild="pure-ts-esm"`, `wasmThreads:0`, `sharedArrayBuffer:false`,
`coopCoep:"not-required"`). It builds an `Output` with the OGG `OutputFormat`, adds an
`EncodedAudioPacketSource('vorbis')` (adapter.ts:1539-1540), and feeds each Vorbis packet as an
`mb.EncodedPacket` with the first packet carrying the decoder config so the muxer can emit Vorbis
codec-private/setup data (adapter.ts:1562-1591). This is a faithful native-OGG authoring path, and it
produces the *tighter* duration — but every Ogg page is assembled in JavaScript on the main thread,
which is why its longtasks balloon to **3045 ms (9.67x ffmpeg's)**. The pipeline is
`streaming-lockstep` over WebCodecs, but for a stream-copy mux there is no decode/encode work to
offload, so the JS page-authoring loop dominates the main thread. mediabunny also reported no
peakMemory sample (n=0), so its memory footprint is unknown.

Net: identical oracle, near-identical wall/throughput, but ffmpeg keeps the page-building work off
the main thread (compiled wasm in a worker) and mediabunny does not. For a browser muxer, 315 ms vs
3045 ms of blocking is the difference between a responsive UI and a 3-second freeze.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed but lost on performance: 9.67x more main-thread blocking
  (longtasks 3045 ms vs 315 ms), marginally slower wall (23.825 vs 23.495 ms, 0.99x) and lower
  throughput (419.85x vs 425.75x). Its pure-TS Ogg page-authoring runs on the main thread; it also
  emitted no peakMemory sample. Its *correctness* edge (Δ0.0143s vs Δ0.0173s) was too small to
  overturn the responsiveness gap.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest: Chrome's
  WebCodecs exposes encode/decode but no container muxer, so there is no OGG-writing API to declare.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". Honest: MP4Box is
  an ISO-BMFF (MP4/MOV) library; it cannot read the source WebM/Matroska to extract the Vorbis track,
  and OGG is not an ISO-BMFF target anyway.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest: web-demuxer
  is a read-only demuxer/probe wrapper; it has no muxing/write path.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest: it
  targets transcode/convert pipelines, not raw container muxing of pre-encoded packets.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest:
  a parser/reader by design; no write path.

All five NAs are genuine capability gaps (no muxer, wrong container family, or read-only), not
under-declared capabilities.

## Anti-cheat validation

- Scenario definition: src/scenarios/mux/write-targets.ts:63-73 (`id: 'vorbis_to_ogg'`,
  `input: 'vp8_720p_10s.webm'`, `to: 'ogg'`, `audioCodecs: ['vorbis']`,
  `extraOptions.trackSelect: ['audio:0']`). Notes confirm the intent: demux the Vorbis track from a
  WebM and mux it into OGG (native OGG payload). Gating rationale at the file header
  (write-targets.ts:24-33): reframing targets like ogg are gated by probe-duration, not a
  source-keyed packet count.
- Fixture: `fixtures/media/vp8_720p_10s.webm` EXISTS (1.3 MB real WebM, not synthetic/empty). It is a
  genuine VP8+Vorbis WebM.
- Oracle: src/core/oracles.ts:2709-2759 (`property-invariant`, probe-duration branch). It performs a
  REAL comparison: re-probes the authored OGG via the reference engine and compares duration to the
  golden, with a container-derived tolerance (~0.04167 s here). Not trivially satisfiable — a broken
  mux that wrote the wrong granulepos/duration would exceed the band and FAIL. Measurements are
  physically plausible: ~10.02 s out vs 10.003 s golden for a 10 s clip.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts — `mux:true` declared at 1463; real wasm
  `-c copy` mux path documented at 491-495 and 1509-1510; OGG container detection at 714-715, 803.
  Genuinely calls the vendored ffmpeg wasm; does not return canned output, copy input verbatim, or
  short-circuit to a golden.
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the oracle is a real
  comparison, but the *only* gate on this scenario is a single probe-duration invariant — a
  structural/metadata-exact proxy that confirms the right output duration but does NOT verify
  packet-level fidelity of the Vorbis bitstream or page framing (no golden-packets / decoded-audio-pcm
  check). A mux that subtly corrupted Vorbis setup headers but preserved duration could still pass.
  The PASS is real but not strong.
- Cached note: BOTH winning results have `cached==true` ("cached previous PASS result") — reused from
  a prior run, not freshly executed. Staleness risk applies to the exact bench numbers.

## Confidence & caveats

Confidence: **medium**. The winner selection is sound on the available data (only longtasks shows a
real margin, and it strongly favors ffmpeg), but several factors weaken it: (1) both results are
cached, not freshly run; (2) every bench metric is n==1 with mad==0, so there is no spread/variance
evidence — a single-sample longtasks reading of 3045 ms could be noisy; (3) wall and throughput are
within ~1% (a tie); (4) mediabunny has the marginally tighter duration delta, so on pure correctness
it is at least even; (5) the gate is a single duration-only invariant (WEAK-GATE), so neither PASS
proves byte/packet fidelity of the OGG. If a fresh run narrowed the longtasks gap, the two engines
would be effectively tied with mediabunny's tighter delta breaking it the other way.
