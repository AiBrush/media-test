# mux/mp3_to_mp4_audio

- family: mux
- fixture asset(s): `fixtures/media/mp3_xing.mp3` (64 KB, Xing-headered MP3, golden duration 10.000s)
- primaryMetric: wall (ms)
- passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Status: **CONTESTED** — two engines PASS (mediabunny, ffmpeg-wasm) and they satisfy the *identical*
  oracle with bit-for-bit identical measurements (`deltaSec` 0.03102040816326479, tol 0.041666...s).
- Decisive factor: **performance**, since correctness strength is exactly equal. mediabunny wall median
  6.5 ms vs ffmpeg-wasm 8.275 ms = **1.27x faster wall**; throughputRealtime 1538.46x vs 1208.46x =
  **1.27x higher**. mediabunny also runs as pure-TS ESM with `coopCoep: not-required` /
  `sharedArrayBuffer: false`, whereas ffmpeg-wasm must spin up a wasm core.
- Margin over runner-up (ffmpeg-wasm): 1.27x wall, 1.27x throughput. Caveat: both benches are **n=1**
  (single sample, mad 0), so the margin is directionally credible but statistically thin.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 6.5 ms | 1538.46x | n/a (n=0) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 8.275 ms | 1208.46x | n/a (n=0) | 4410 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |

## Why the winner wins (deep technical)

The operation is an **audio-only remux/write-target**: take encoded MP3 (MPEG-1 Layer III) frames from
an MP3 elementary stream and re-frame them into an ISO-BMFF / MP4 (.m4a) sample table. MP3 is legal in
MP4 — it gets an `.mp3`/`mp4a` sample entry and an `mdat` of the raw MP3 frames indexed by `stsz`/`stco`/
`stts`. No audio re-encoding is required; the work is *container reframing*, so this is a packet-copy mux
rather than a transcode.

mediabunny's adapter performs this through its real packet-source mux path
(`src/engines/mediabunny/adapter.ts:1508` `mux()`): it builds the output format from `opts.container`
(mp4) via `makeOutputFormat` (line 1509), creates an `mb.Output` over an instrumented BufferTarget
(line 1514), and for the audio track maps the canonical codec to a mediabunny `AudioCodec`
(line 1537), instantiating `new mb.EncodedAudioPacketSource(mbCodec)` and `output.addAudioTrack(source,
{ maximumPacketCount })` (lines 1539-1540). Each MP3 frame is wrapped in `new mb.EncodedPacket(...)`
with PTS/duration derived from `ptsUs/1e6` and `durationUs/1e6` (lines 1562-1569). Critically, the
**first packet carries the decoder config** (`sampleRate`, `numberOfChannels`, `description`) at lines
1582-1590, which is what lets the muxer emit the correct codec-private sample-entry boxes. This is the
`Output`+`Encoded*PacketSource`+`BufferTarget` path documented at the top of the adapter (lines 60-66).
The config is `streaming-lockstep` / `coreBuild: pure-ts-esm`, `coopCoep: not-required`,
`sharedArrayBuffer: false` (shard `env.configUsed`) — a single-pass JS reframe with no wasm boot and no
cross-origin isolation requirement, which is why it lands at 6.5 ms wall.

The gating oracle is `property-invariant` in the `probe-duration` branch
(`src/core/oracles.ts:2709-2759`): it probes the authored MP4 output with the reference engine and
compares its duration to the golden source duration. The shard shows `outDurationSec` 10.03102s vs
`goldenDurationSec` 10.0s, `deltaSec` 0.03102s within a `durationToleranceSec` of 0.041666s (= 1 frame
at 24 fps band). The ~0.031s overhang is the expected MP3 reframing artifact: encoder-delay / partial
final-frame rounding when MP3 frames (each 1152 samples) are re-indexed into a sample table — physically
plausible (≈1.4 MP3 frames at 44.1 kHz). mediabunny clears it cleanly.

ffmpeg-wasm produces a *byte-identical-duration* result (same 10.03102s, same 0.03102s delta — see
`src/engines/ffmpeg-wasm/adapter.ts:33` mux via `-c copy`), so correctness is a dead tie. The
differentiator is purely the runtime: mediabunny's pure-TS reframe avoids ffmpeg.wasm's elementary-
stream reconstruction + MEMFS write + `-c copy` mux through the wasm core
(`src/engines/ffmpeg-wasm/adapter.ts:491-495`), giving the 1.27x wall/throughput edge. (Note: longtasks
is *higher* for mediabunny, 19963 ms vs 4410 ms — a measurement-window artifact, not the gated metric;
primaryMetric is wall, where mediabunny wins.)

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but lost on performance: 8.275 ms wall (1.27x slower than 6.5 ms) and
  1208.46x throughput (1.27x lower than 1538.46x). Identical correctness (same property-invariant delta
  0.03102s). Slower because it reconstructs an MP3 elementary stream in MEMFS then `-c copy` muxes
  through the wasm core, vs mediabunny's no-wasm pure-TS reframe.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — web-demuxer
  is a demux/probe-only binding (libavformat read side), it has no muxer surface.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — the raw
  WebCodecs/platform engine exposes decode/encode primitives but no container muxer, and there is no
  built-in MP3-in-MP4 authoring API in the browser.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest; its
  declared surface is transcode/convert orchestration, not a standalone packet-copy muxer for this case.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — a
  parser, read-only by design.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'mp3'". Honest capability gate:
  mp4box.js parses/writes ISO-BMFF only; it cannot ingest a raw MP3 elementary stream as input, so it
  cannot be the source-side of this MP3→MP4 mux.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/write-targets.ts:153` (`id: 'mp3_to_mp4_audio'`,
  `input: 'mp3_xing.mp3'`, `containersIn: ['mp3']`, `to: 'mp4'`, `audioCodecs: ['mp3']`). Notes confirm
  intent: "mux MP3 frames into an ISO-BMFF sample table (mp4a/.mp3 sample entry)... probe-duration gate".
- Fixture: `fixtures/media/mp3_xing.mp3` exists (64 KB, real Xing-headered MP3) — confirmed via stat.
  Not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:2709-2759` (property-invariant → probe-duration branch). It performs a
  REAL reference-engine probe of the authored output and compares duration to the golden (10.0s) with a
  measured delta (0.03102s) inside a 0.04167s band. Measurements are physically plausible for a 10s MP3
  reframed into MP4.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508-1597` — genuine `Output` +
  `EncodedAudioPacketSource` mux; reads real MP3 packets, sets PTS/duration, carries decoder config on
  the first packet, calls `output.start()` and per-packet `add()`. No canned output, no input→output
  copy faking a remux, no golden short-circuit, no error swallowing (invalid conversions throw at
  `runConversion` / format-null throws at line 1510).
- Verdict: **WEAK-GATE**. The implementation, fixture, and oracle are all real, but the single gating
  oracle is a *duration-probe proxy* (property-invariant probe-duration) — it does not decode and PCM-
  compare the audio samples (no `decoded-audio-pcm`), so a muxer that preserved total duration but
  corrupted intra-sample timing/codec-private could still pass. The PASS is real and meaningful for
  container reframing, but it is a metadata/duration gate, not a bit-exact sample gate — hence WEAK-GATE
  rather than REAL.
- Cached note: BOTH PASS engines have `cached: true` ("cached previous PASS result"). Evidence is reused
  from a prior run, not freshly re-executed — staleness risk per the launcher-seeding caveat. The
  identical-to-the-digit measurements across both engines are consistent with deterministic reframing of
  the same fixture, but were not re-verified live in this run.

## Confidence & caveats

- Confidence: **medium**. Winner is the right pick by the decision procedure (equal correctness →
  performance tiebreak, mediabunny 1.27x ahead with the additional no-COOP/COEP/no-wasm advantage), and
  the implementation + fixture + oracle are all genuine.
- Caveats: (1) both benches are n=1 (mad 0), so the 1.27x margin is directional, not statistically
  robust. (2) Both results are cached, so not re-run this pass. (3) The gate is duration-proxy only
  (WEAK-GATE) — no PCM/sample-level correctness check, so neither winner's *audio fidelity* is actually
  proven, only that the authored MP4 reports the right duration. (4) The five NA engines are all
  honestly under-declared for this MP3-source / mux operation, not suspiciously hidden capability.
