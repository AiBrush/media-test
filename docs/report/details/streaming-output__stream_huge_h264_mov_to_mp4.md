# streaming-output/stream_huge_h264_mov_to_mp4

**Family:** streaming-output | **Fixture asset:** `huge_h264_1080p_600s.mov` (448 MB on disk) | **Primary metric:** `peakMemory` | **passCount:** 1 of 7

## Verdict

**Best framework: `mediabunny@1.48.0` — UNCONTESTED (only PASS).**

Decisive factor: it is the only engine that declares BOTH the `remux` operation AND the `target:writes` (native `StreamTarget`) feature this STREAM-shaped case requires, and it satisfied the gating `reference-reimport` oracle on a 448 MB H.264 .mov → MP4 stream-remux. All six other engines were ruled NA before any oracle ran (3 lack the `remux` op, 3 lack the `target:writes` feature). No runner-up — margin is undefined (1 PASS, 6 NA, 0 FAIL).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 6459.97 ms | 92.88 x-realtime | 0 (null/omitted) | 185 ms | — (also: targetWrites=2375, bytesOut=449,293,953) |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Note: `peakMemory` is the primary metric but reports 0/null for mediabunny — `bench.peakMemory` has `n:0, samples:[]`. Per the scenario header (size-ladder.ts:15-18), cross-engine-correct peak memory needs `measureUserAgentSpecificMemory` under cross-origin isolation; with `coopCoep:"not-required"` / `sharedArrayBuffer:false` in this run, the measurement was unavailable and honestly omitted rather than faked. The win is therefore decided on eligibility + correctness, not on the (absent) memory number.

## Why the winner wins (deep technical)

This case is a container REMUX (no re-encode) of a self-contained 1080p H.264 + AAC `.mov` (QuickTime) into MP4, run through a STREAM target (`shape.target = 'stream'`, size-ladder.ts:80). The point of the size-ladder family is to exercise lazy/partial reading and bounded peak memory at the ~500 MB rung rather than buffering the whole file.

Mechanistically, mediabunny is the only engine wired for both halves of this contract:

1. **Operation = remux, implemented losslessly.** `MediabunnyAdapter.remux` (src/engines/mediabunny/adapter.ts:1244) builds an `Output` with the MP4 `OutputFormat` and runs `mb.Conversion.init({input, output})` with NO video/audio codec options — Conversion with no transforms copies the encoded H.264/AAC samples through, changing only the container (QuickTime atoms → ISO-BMFF boxes). There is no decode/re-encode, so it is a true sample-copy remux.

2. **Feature = target:writes via native StreamTarget.** Because `opts.target === 'stream'`, `instrumentedOutputTarget` (adapter.ts:776-816) constructs a `WritableStream<StreamTargetChunk>` and wraps it in `mb.StreamTarget(writable)` (adapter.ts:801), counting each `write()` call (`markWrite`, adapter.ts:771-774). The shard confirms this fired for real: `targetWrites = 2375` discrete chunk writes and `bytesOut = 449,293,953` (~449 MB) flowing through the streaming writable — i.e. the muxer emitted ~2375 incremental moof/mdat-style writes instead of one buffer. This is exactly the `target:writes` capability declared in the engine manifest (adapter.ts:1080: "Output can write through native StreamTarget and reports target write telemetry").

3. **Correctness gate actually passed on real data.** The gating oracle `reference-reimport` (src/core/oracles.ts:1225, remux branch at oracles.ts:1243-1247 → `semanticRemuxReimport` oracles.ts:1273) re-demuxes the produced MP4 with the reference engine and compares semantics against the golden. Measured: `reimportPackets = 46128`, `reimportKeyframes = 28428`, `reimportMediaTracks = 2` vs `goldenMediaTracks = 2` (track layout matched), and `durationDeltaSec = 0.064 s` against `durationToleranceSec = 0.1 s` (oracles.ts:1318 floors the band at 0.1 s). 46128 packets over ~600 s is physically consistent with 1080p video + AAC audio tracks at this duration, and the sub-frame 64 ms duration drift is the expected audio-frame/edit-list tail rounding from a QuickTime→MP4 container change. This is a structural/metadata-exact check (track count + layout + duration), not a smoke test — it would catch a fast-but-wrong stream.

Backend (env.configUsed): `backend: webcodecs`, `hwAccel: prefer-hardware` on Apple M1 Max, `coreBuild: pure-ts-esm`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer: false`. Note that for a pure sample-copy remux WebCodecs/HW is not strictly exercised on the codec path; the relevant property is that mediabunny needs no COOP/COEP and no SharedArrayBuffer threading to stream a 449 MB output, completing in 6459.97 ms wall (~92.9x realtime for the ~600 s source) with only 185 ms of long-task time.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — NA_ENGINE: "engine does not declare feature 'target:writes'."** Its remux runs through the MEMFS/emscripten filesystem and returns a whole-file buffer; it has no native incremental StreamTarget, so it cannot satisfy the stream-shaped contract this case requires. NA looks honest: ffmpeg.wasm genuinely materializes output in the wasm heap rather than streaming chunked writes.
- **mp4box@2.3.0 — NA_ENGINE: "engine does not declare feature 'target:writes'."** MP4Box.js can segment/fragment but the adapter does not expose a chunked StreamTarget write-telemetry path here; honest NA for the streaming feature gate.
- **remotion-webcodecs@4.0.479 — NA_ENGINE: "engine does not declare feature 'target:writes'."** Same streaming-feature gap; the engine is not registered as supporting `target:writes`. Honest NA.
- **web-demuxer@4.0.0 — NA_ENGINE: "engine does not declare operation 'remux'."** web-demuxer is a demux-only library (no muxer), so it cannot produce an MP4 at all. Honest NA — it has no write side.
- **platform@chrome-149 — NA_ENGINE: "engine does not declare operation 'remux'."** The bare-browser baseline has no general container remux API; honest NA.
- **remotion-media-parser@4.0.479 — NA_ENGINE: "engine does not declare operation 'remux'."** A parser, not a muxer — cannot remux. Honest NA.

None of the NAs look under-declared: three are parse/demux-only tools that genuinely cannot mux, and three lack the incremental StreamTarget write path that the `target:writes` feature gate (and the stream shape) demands.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/streaming-output/size-ladder.ts:74-88 (case `stream_huge_h264_mov_to_mp4`), built via `buildStream` (src/scenarios/streaming-output/_shared.ts).
- **Fixture:** `asset: 'huge_h264_1080p_600s.mov'` → fixtures/media/huge_h264_1080p_600s.mov, exists at 448 MB. Real, large, self-contained H.264 .mov — not synthetic/mock/empty. The ~449 MB of streamed output (`bytesOut` 449,293,953) is consistent with a true full-file remux of a 448 MB source.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1244 (`remux`) → src/engines/mediabunny/adapter.ts:776-816 (`instrumentedOutputTarget` StreamTarget path) → adapter.ts:801 (`new mb.StreamTarget`). Real library calls (`mb.Conversion.init`, `mb.Output`, `mb.StreamTarget`); no canned output, no input→output copy, no golden short-circuit, no swallowed errors. `targetWrites=2375` proves incremental streaming actually happened.
- **Oracle:** src/core/oracles.ts:1225 (`referenceReimport`) / oracles.ts:1273 (`semanticRemuxReimport`). Performs a real re-demux of the produced bytes and compares track count, per-type track layout, and duration (Δ0.064 s vs 0.1 s tol) against the golden. Not trivially satisfiable: empty-packet output FAILs (oracles.ts:1244-1245), track-layout mismatch FAILs (oracles.ts:1289-1298), duration drift beyond tol FAILs (oracles.ts:1321-1323). Measurements (46128 packets, 28428 keyframes, 2 tracks, 0.064 s drift) are physically plausible for 600 s of 1080p H.264+AAC.
- **Cached:** the mediabunny entry has no `cached:true` flag and carries a fresh `startedAtIso` of 2026-06-22T17:33:46Z with `durationMs:28812` — this was re-run, not reused. No staleness risk.

**validationVerdict: REAL** — real 448 MB fixture, genuine streaming sample-copy remux through mediabunny's native StreamTarget, and a structural/metadata re-import oracle that does a true comparison against golden and can fail.

## Confidence & caveats

Confidence: **high** on the verdict (single eligible PASS, real fixture, real implementation, meaningful structural oracle with plausible numbers). Caveats: (1) the primary metric `peakMemory` is null/omitted for the winner (no cross-origin-isolated memory measurement available this run), so the headline "lower peak memory" claim of the size-ladder family is not directly evidenced here — the win rests on eligibility + correctness + the 2375-write streaming proxy, not a measured memory number. (2) Correctness rests on a single oracle (`reference-reimport`) at `n=1` bench samples (`mad=0`, no spread), and the scenario deliberately omits decode/SSIM gates at GB scale, so this is structural/metadata-exact rather than bit-exact frame verification. (3) Six NA verdicts mean the field is uncontested by construction (capability gating), not by head-to-head performance.
