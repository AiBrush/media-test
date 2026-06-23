# mux/edge_bframes_decode_mux_mkv

**family:** mux · **fixture asset:** `fixtures/media/h264_bframes_1080p.mp4` (11 MB, real) · **primaryMetric:** wall · **passCount:** 2 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` (env.engineId `mediabunny`).
- **Contested:** YES — two engines PASS the same gating oracle with identical correctness.
- **Decisive factor:** PERFORMANCE. Correctness is a tie (both engines pass `property-invariant` `decode(mux(x))==decode(x)` with 12/12 frames bit-exact, 0 mismatches). mediabunny wins on wall time: **43.24 ms vs 154.595 ms = 3.57x faster** wall median, and **6188 ms vs 19963 ms longtasks** (mediabunny actually has *higher* longtasks). See caveat below — both samples are n=1 and `cached==true`.
- **Margin over runner-up (ffmpeg.wasm@0.12.15):** 3.57x faster wall (43.24 ms vs 154.595 ms). Peak memory is not directly comparable: mediabunny reports 68,544,043 bytes (n=1); ffmpeg-wasm reports 0 bytes with n=0 samples (no memory sample captured).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 43.24 | n/a (not benched) | 68,544,043 (n=1) | 19,963 (n=1) | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 154.595 | n/a (not benched) | 0 (n=0, no sample) | 6,188 (n=1) | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

Note: `throughputRealtime` is not present in either PASS engine's `bench` for this scenario; only `wall`, `peakMemory`, `longtasks` were recorded.

## Why the winner wins (deep technical)

**The operation.** This scenario takes already-encoded H.264 packets from `h264_bframes_1080p.mp4` (a 1080p clip authored with B-frame reorder, so PTS != DTS) and **muxes them into a Matroska (`.mkv`) container** — no re-encode. The author-side hazard the scenario isolates (scenario notes, `src/scenarios/mux/codec-edges.ts:66-69`): the muxer must re-lace the same coded samples as Matroska `SimpleBlock`s and **preserve the B-frame reorder via block timestamps**. A muxer that assumes `pts==dts` corrupts the presentation order. Because mkv reframes the bitstream (no source-keyed packet count survives), the only gate is the metamorphic invariant `decode(mux(x))==decode(x)`: decode the muxed output in a real browser and digest every RGBA frame, then compare sha256 against the platform-baked golden of decoding the *source*.

**Why mediabunny is faithful here.** mediabunny's `mux()` (`src/engines/mediabunny/adapter.ts:1508-1600`) builds a real `mb.Output` over `MkvOutputFormat` (`src/engines/mediabunny/codecs.ts:169`) and an `EncodedVideoPacketSource` (`adapter.ts:1528`). For every source chunk it constructs an `mb.EncodedPacket` carrying that packet's **own** presentation timestamp and duration — `c.ptsUs / 1e6`, `c.durationUs / 1e6` (`adapter.ts:1562-1569`) — so the per-packet PTS spread that encodes the B-frame reorder is handed verbatim to the Matroska writer, which derives each SimpleBlock's timestamp from it. The first packet also carries `decoderConfig.description` (the H.264 `avcC` / SPS-PPS, `adapter.ts:1557, 1579`) so the Matroska writer emits the correct CodecPrivate. This is exactly the `mux:vfr-timestamps` capability the adapter declares (`adapter.ts:1076`). Result: the platform decode of the `.mkv` reproduces all **12 frames bit-exact** (oracle measurement `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0`).

**Backend.** mediabunny ran `env.configUsed.backend="webcodecs"`, `hwAccel="prefer-hardware"`, `pipeline="streaming-lockstep"`, `coreBuild="pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`. The mux itself is a pure packet copy (no decode/encode), so the WebCodecs/HW path matters only for the oracle's *verification* decode; the muxing is native-TS Matroska authoring with no wasm and no COOP/COEP requirement.

**Why it beat ffmpeg.wasm on cost.** ffmpeg.wasm@0.12.15 also passes the identical oracle (12/12 bit-exact) — it is fully correct here — but it pays the wasm tax: a `.mkv` remux through the libavformat Matroska muxer running single-thread in wasm took **154.595 ms** wall vs mediabunny's **43.24 ms** (3.57x). mediabunny's native-TS `EncodedVideoPacketSource` → Matroska writer avoids the wasm module instantiation and the libav demux/remux marshalling. Correctness is a true tie, so this 3.57x wall margin is decisive.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but the runner-up: identical correctness (property-invariant 12/12 bit-exact) yet 3.57x slower wall (154.595 ms vs 43.24 ms). Lost purely on performance. (Note its longtasks is *lower*, 6188 ms vs 19963 ms, but `wall` is the primaryMetric and the decisive axis; both n=1.)
- **mp4box@2.3.0** — NA_ENGINE, honest: "engine does not declare output container 'mkv'". MP4Box.js is an ISO-BMFF library; it genuinely cannot author a Matroska container. Correct, non-cheating NA.
- **web-demuxer@4.0.0** — NA_ENGINE, honest: "engine does not declare operation 'mux'". It is a demux-only library; no muxer exists. Correct NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, honest: "engine does not declare operation 'mux'". Its surface is decode/transcode via WebCodecs, not encoded-packet muxing. Correct NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest: "engine does not declare operation 'mux'". Parser/probe only; no write path. Correct NA.
- **platform@chrome-149** — NA_ENGINE, honest: "engine does not declare operation 'mux'". The raw-platform reference engine exposes decode/probe primitives, not a standalone container muxer. Correct NA.

All five NAs are genuine capability gaps, not under-declared cheats: none of these libraries exposes an encoded-packet → Matroska write path.

## Anti-cheat validation

- **Scenario:** `src/scenarios/mux/codec-edges.ts:57-70` (`id: 'edge_bframes_decode_mux_mkv'`), built via `buildMuxProperty` with `invariant: DECODE_MUX`, `input: 'h264_bframes_1080p.mp4'`, `to: 'mkv'`.
- **Fixture:** `fixtures/media/h264_bframes_1080p.mp4` exists, **11 MB**, real H.264/B-frame media — not synthetic/empty/mock.
- **Golden:** `fixtures/golden/h264_bframes_1080p.mp4.frames.json` exists (3.2 KB), `"pending": false`, with 12 real per-frame sha256 RGBA digests at 1920x1080, `bakedBy: "frame-bake (platform engine) ... Chrome/149"`, `bakedAtIso: 2026-06-18`. The file's leading `$todo` text is **stale** (it warns the bake is pending), but `pending:false` + populated `frames[].sha256` confirm the bake actually completed — so the scenario's source comment about `$todo` placeholders FAILing is out of date for this asset.
- **Oracle:** `property-invariant` → decode-remux branch in `src/core/oracles.ts:2686-2707`. It refuses to pass with empty goldens (`oracles.ts:2691-2694` returns FAIL "no golden frames ... frame-bake pending"), decodes the candidate's actual output with the platform decoder (`oracles.ts:2697`), and runs `compareDigests` (sha256 equality, not a loose tolerance). This is a strict bit-exact pixel comparison, not a smoke/SSIM proxy — it cannot be satisfied by copying input→output (mkv differs byte-wise from the mp4 source; only a correct re-lace decodes to identical pixels).
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1508-1600` (`mux`). Genuinely calls `mb.Output` + `EncodedVideoPacketSource.add()` with per-packet PTS/duration (`:1562-1569`) and `output.start()/finalize()` (`:1553, :1598`). No canned output, no golden short-circuit, no input→output copy, no swallowed errors (it throws on unsupported codec/container, `:1510, :1527`).
- **Cached note:** Both PASS results have `cached==true` ("cached previous PASS result"); the bench numbers (wall 43.24 / 154.595 ms, n=1) were **reused, not re-run** this pass. Per the launcher seeding caveat, cached evidence carries staleness risk — the correctness verdict is robust (golden + oracle are real) but the exact timing margin should be confirmed on a fresh re-run.
- **Verdict:** **REAL** — real 11 MB fixture, real baked golden, strict bit-exact oracle, genuine mediabunny encoded-packet Matroska mux.

## Confidence & caveats

- **Confidence: medium.** Correctness is solid: real fixture, real baked golden, strict sha256-per-frame oracle, genuine adapter implementation. The two PASS engines are a true correctness tie (both 12/12 bit-exact).
- The win rests entirely on a performance margin measured at **n=1** for both engines with `mad=0`/`p95==median` (single sample), and both results are `cached==true`. A 3.57x wall gap is large enough to be very unlikely to flip, but the precise ratio is not statistically robust on one sample.
- `throughputRealtime` and a comparable `peakMemory` for ffmpeg-wasm (n=0, 0 bytes) are missing, so the only cross-engine performance axis is wall time.
- The golden's leading `$todo` placeholder text is stale/misleading relative to `pending:false`; no functional impact, but worth a cleanup.
