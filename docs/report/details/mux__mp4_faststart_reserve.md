# mux/mp4_faststart_reserve

**family:** mux · **fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (31 MB real H.264+AAC MP4) · **primaryMetric:** targetWrites · **passCount:** 1 / 7

## Verdict

**Best framework: mediabunny@1.48.0 — UNCONTESTED (only PASS).**

Decisive factor: it is the *only* engine that declares both the `mux` operation and the `fastStart:reserve` write-shape feature, and it satisfies all three gating oracles for the in-place moov-reserve write path. No runner-up exists (every other engine is NA), so there is no performance margin to report — the win is purely on capability + correctness, not speed.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:✓, property-invariant:✓, mp4-box-layout:✓ | 108.85 ms | 275.61 x-rt | 57,283,643 B (~54.6 MB) | 185 ms | — (targetWrites=122, bytesOut=31,316,671) |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:reserve' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The scenario authors an MP4 from already-encoded H.264 video + AAC audio tracks (op `mux`, not remux/transcode) and demands the *in-place reserve* faststart write shape: reserve a forward `moov` of estimated size, write the `mdat` sample data, then seek backward and patch the reserved `moov` once the final sample table is known. This requires (a) a muxer that can author a sample table from supplied EncodedPackets, (b) a `fastStart:'reserve'` mode in the container writer, and (c) a write target that supports **positional/random-access writes** (the patch is a large forward seek). Only mediabunny provides all three.

Capability declaration: `src/engines/mediabunny/adapter.ts:1048` (`'fastStart:reserve'`), `:1080` (`'target:writes'`), and `:1030` (op `mux: true`) — so it is the only engine eligible for this row.

Operation path: `mux/mp4_faststart_reserve` runs op `mux` with `{ fastStart:'reserve', target:'stream' }`. The reserve branch in `remux()` (`adapter.ts:1245-1248`) detects `opts.fastStart === 'reserve'`, demuxes the source into EncodedTracks via `prepareMuxTracks()` (`adapter.ts:1185-1229`) — reading real packets through `EncodedPacketSink` with `verifyKeyPackets:true` and preserving per-packet PTS/DTS/duration/keyframe flags — then re-authors the container via `mux()` (`adapter.ts:1508-1567`). `mux()` builds the OutputFormat with `outputFormatOptionsFrom()` (`adapter.ts:180-199`), which forwards `fastStart:'reserve'` straight into mediabunny's native `OutputFormatOptions`. Packets are pushed through `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (`adapter.ts:1528-1546`) with `maximumPacketCount` hints so the writer can size the reserved `moov` before the sample table is finalized.

The write target matters: with `target:'stream'` the instrumented `StreamTarget` (`adapter.ts:776-816`) honors `chunk.position` on every write (`chunks.push({ position: chunk.position, data })`, reassembled at `bytes.set(chunk.data, chunk.position)`), so the backward patch of the reserved `moov` lands at the correct offset. This is exactly the "large forward seek" the scenario notes describe.

Oracle evidence (real shard numbers):
- **mp4-box-layout** (`oracles.ts:405-413`): parsed top-level layout `ftyp@0, moov@28, free@10906, mdat@85186` — `moovOffset=28 < mdatOffset=85186`, satisfying the `fastStart === 'reserve'` rule (`firstMoov <= firstMdat`). The `free@10906` box is the residual reserve padding between the patched `moov` and the `mdat`, the structural fingerprint of a reserve-then-patch writer rather than a two-pass rewrite. topLevelBoxes=4.
- **reference-reimport** (`oracles.ts:1225-1271`): the reference engine re-demuxed the authored bytes and recovered **2308 packets / 1423 keyframes** — a non-empty, plausible sample table for a 30 s 1080p H.264+AAC clip, proving the moov it patched actually indexes the mdat samples.
- **property-invariant** (probe-duration, `oracles.ts:2733-2756`): output duration 30.0213 s vs golden 30.000 s, Δ 0.0213 s ≤ tolerance 0.0417 s — the reserve/patch did not corrupt timing.

bytesOut=31,316,671 (~31.3 MB) closely tracks the 31 MB input (sample copy, no re-encode), and targetWrites=122 confirms an incremental streamed write rather than one buffer-then-flush. Backend was pure-TS WebCodecs streaming (`env.configUsed`: `backend:webcodecs`, `pipeline:streaming-lockstep`, `coreBuild:pure-ts-esm`, `coopCoep:not-required`, `sharedArrayBuffer:false`) — no COOP/COEP and no wasm threads needed.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "does not declare feature 'target:writes'". Honest NA. ffmpeg's `-movflags +faststart` does a two-pass rewrite to a virtual FS file, not an instrumented positional write target, so it cannot report the streaming write telemetry this row gates on. It does not advertise the reserve/streaming target shape.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare feature 'fastStart:reserve'". Honest NA. mp4box.js can write fragmented and moov-first MP4, but does not expose a *reserve-then-patch* in-place mode; declaring it would be over-claiming.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'mux'". Honest. It is a demux-only (libav-based) reader; it has no muxing path at all.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'mux'". Honest. media-parser is a read/parse library with no container writer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare operation 'mux'". Honest at the granularity used here — it does not register a raw `mux` (pack-encoded-tracks) op for MP4 reserve faststart.
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'mux'". Honest. The browser platform baseline has no built-in MP4 muxer (WebCodecs encodes/decodes; it does not author containers).

## Anti-cheat validation

- **Scenario:** `src/scenarios/mux/output-modes.ts:62-76` (`id: 'mp4_faststart_reserve'`), built via `buildMux()` in `src/scenarios/mux/_shared.ts`. Options `{ fastStart:'reserve', target:'stream' }`, feature `fastStart:reserve`, primaryMetric `targetWrites`.
- **Fixture:** input `h264_1080p_30s.mp4` → `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB real H.264+AAC MP4 (verified via stat). Not synthetic/empty/mock.
- **Oracles:** `mp4-box-layout` `src/core/oracles.ts:405-413` parses real top-level boxes and enforces `moov` before `mdat` for `fastStart:'reserve'` — not trivially satisfiable; a moov-last file would fail at `:409`. `reference-reimport` `src/core/oracles.ts:1225-1271` re-demuxes the bytes with an independent reference engine and fails on an empty packet table (`:1249`). `property-invariant` probe-duration `src/core/oracles.ts:2733-2756` compares against the golden duration with a tight 0.0417 s tolerance.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1245-1248` (reserve dispatch), `:1185-1229` (real packet extraction via EncodedPacketSink), `:1508-1567` (mux authoring), `:180-199` (forwards `fastStart:'reserve'` to the native OutputFormat), `:776-816` (positional StreamTarget honoring `chunk.position`). The output is genuinely authored from re-read encoded packets through real mediabunny APIs — no canned bytes, no input→output copy, no short-circuit to a golden, no swallowed errors (mux throws on unsupported codecs at `:1527`/`:1538`).
- **Measurements plausibility:** layout offsets (moov@28, free@10906, mdat@85186), 2308 packets / 1423 keyframes, 30.0213 s duration, 31.3 MB out are all physically consistent with a 30 s 1080p H.264+AAC reserve-faststart MP4.
- **Cached:** result `cached` flag absent/false in the shard (durationMs=1403, startedAtIso present) — freshly run, no staleness risk.

**Verdict: REAL.** Real 31 MB fixture, genuine mediabunny mux+reserve implementation through native APIs, and three meaningful structural/round-trip/timing oracles with plausible measurements.

## Confidence & caveats

Confidence: **high.** The win is uncontested by construction (6 honest NAs, 1 PASS) and the PASS is backed by a structural box-layout gate plus an independent re-import, not a smoke/proxy gate. Caveats: (1) bench metrics are single-sample (n=1, mad=0, p95=median) so the 108.85 ms wall / 275.61x throughput are point estimates, not distributions — but performance is moot here since there is no runner-up. (2) The other engines' NAs are capability *declarations*; ffmpeg.wasm and mp4box could in principle implement some reserve-like path, but their adapters honestly decline rather than over-claim, which is the correct behavior for this strict in-place-reserve sub-mode.
