# robustness/fuzz_mp4_zeroed_spans_decode

family: robustness · fixture asset: `fuzz_mp4_zeroed_spans.mp4` (31 MB, H.264 in MP4) · primaryMetric: none (robustness pass/fail; only `durationMs` recorded) · passCount: 5 of 7

## Verdict

**Best framework: ffmpeg.wasm@0.12.15** — CONTESTED (5 engines PASS, all on the same `graceful-failure` oracle).

Decisive factor: **correctness strength of the graceful path**, not performance. The scenario notes require the decoder to *"error or conceal, bounded in time and memory."* ffmpeg-wasm is the **only** engine that took the *conceal* branch: its oracle detail reads `"operation returned partial/safe output and did not crash/hang"` — i.e. it actually decoded the H.264 stream past the six zeroed payload spans and returned partial frames. The other four passers (web-demuxer, mediabunny, platform, remotion-webcodecs) all took the weaker *error* branch: `"operation produced no output and did not crash/hang → handled gracefully"` — their WebCodecs `VideoDecoder` simply threw a "Decoding error" / closed-codec and emitted zero frames. Both branches PASS the same gate, but concealment (recovering usable frames from corrupt input) is a strictly stronger robustness demonstration than bailing out with no output.

Margin over runner-up: there is no shared numeric metric (no `bench{}`, no `primaryMetric`). The only timing signal is `durationMs`: ffmpeg-wasm spent **2750 ms** actually decoding/concealing, versus 102 ms (web-demuxer), 119 ms (mediabunny), 130 ms (platform), 2239 ms (remotion-webcodecs) for engines that mostly short-circuited on the decoder error. The longer wall time here is *expected work*, not a regression — it is the cost of running the full software H.264 decoder over a 31 MB file and producing output rather than throwing on first error.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true (returned partial/safe output) | n/a (durationMs 2750) | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | graceful-failure:true (no output) | n/a (durationMs 102) | n/a | n/a | n/a | cached: graceful: Failed to execute 'decode' on 'VideoDecoder': Cannot call 'decode' on a closed codec. |
| mediabunny@1.48.0 | PASS | graceful-failure:true (no output) | n/a (durationMs 119) | n/a | n/a | n/a | cached: graceful: Decoding error. |
| platform@chrome-149 | PASS | graceful-failure:true (no output) | n/a (durationMs 130) | n/a | n/a | n/a | cached: graceful: `<video>` error during seek |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true (no output) | n/a (durationMs 2239) | n/a | n/a | n/a | cached: graceful: Decoding error. |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'decodeFrames' |

No engine recorded a `bench{}` block, `primaryMetric`, throughputRealtime, peakMemory, or longtasks for this scenario; all metric cells are n/a and only `durationMs` is available.

## Why the winner wins (deep technical)

The input is a real 31 MB progressive H.264/MP4 with six 2 KB spans of its sample payloads zeroed out (per the scenario notes: *"Six 2KB zeroed payload spans"*). Zeroing 2 KB inside a slice's NAL payload corrupts the entropy-coded macroblock data: a hardware/WebCodecs decoder hitting an invalid CABAC/CAVLC bitstream typically faults the whole codec instance, which is exactly what the four WebCodecs-backed engines did — `VideoDecoder.decode` raised a "Decoding error" and the codec transitioned to *closed*, so any further `decode()` call throws `"Cannot call 'decode' on a closed codec"` (web-demuxer's recorded reason). The runner caught that throw, recorded zero frames, and the oracle inferred graceful failure from output absence (`oracles.ts:2608` → PASS "produced no output").

ffmpeg.wasm instead runs the full libavcodec software H.264 decoder via the WASM CLI. In `src/engines/ffmpeg-wasm/adapter.ts:2649` `decodeFrames` first probes the stream with `runInfo` (`adapter.ts:2658`), takes the video path (`firstVideoTrack`, `adapter.ts:2692`), then invokes the real decoder: it builds the arg list with `-frames:v <maxFrames>` (`adapter.ts:2700`), a tight `rawvideo`/`rgba` output filter (`adapter.ts:2701-2702`), and calls `await this.run(args)` (`adapter.ts:2703`) — this is the genuine ffmpeg.wasm subprocess, not a stub. libavcodec's error-concealment kicks in on the corrupt slices (it interpolates/propagates from neighbouring macroblocks rather than aborting), so the run finishes and writes a non-empty RGBA buffer. The adapter slices that buffer into per-frame digests (`adapter.ts:2705-2722`) and returns a populated `FrameSink`. Because the scenario sets `options.gracefulAllowOutput: true` (`index.ts:281`), the oracle's `gracefulAllowsReturnedOutput` check (`oracles.ts:2611,2625-2628`) lets that partial output PASS as *"returned partial/safe output and did not crash/hang"* (`oracles.ts:2612`) — the conceal branch the scenario explicitly invites.

Mechanistically, the win is a backend property: ffmpeg.wasm uses a single-thread software H.264 decoder with built-in error concealment, so a localized 2 KB corruption degrades a few macroblocks but the decode survives and yields frames. The WebCodecs path (`prefer-hardware`, see mediabunny's `env.configUsed.backend: "webcodecs"`, `hwAccel: "prefer-hardware"`) has no equivalent conceal-and-continue contract — the platform decoder errors the codec, so those engines can only demonstrate the *reject* half of the gate. The 2750 ms wall (vs ~100 ms) is the signature of that extra work: decoding + concealing 60 frames (`maxFrames: 60`, `index.ts:281`) of real video instead of throwing on the first bad slice.

## What each other framework did wrong

- **web-demuxer@4.0.0** — PASS but weaker: took the reject branch. WebCodecs threw `"Cannot call 'decode' on a closed codec"` on the corrupt slice; zero frames returned. Valid graceful failure, but no concealment. (Also fastest at 102 ms precisely because it did the least work.)
- **mediabunny@1.48.0** — PASS but weaker: WebCodecs `VideoDecoder` raised `"Decoding error."`, codec faulted, no output. Reject branch only; 119 ms. `configUsed.backend: webcodecs / hwAccel: prefer-hardware` confirms a hardware decode that cannot conceal.
- **platform@chrome-149** — PASS but weaker: the `<video>`/WebCodecs platform path errored during seek (`"<video> error during seek"`), produced no frames. Reject branch only; 130 ms.
- **remotion-webcodecs@4.0.479** — PASS but weaker: WebCodecs `"Decoding error."`, no output. Reject branch; 2239 ms (notably slow for a no-output reject — likely its backpressure/parse worker churned through the file before the decoder faulted), so it neither concealed nor was fast.
- **mp4box@2.3.0** — NA_ENGINE, honest. It is a pure demuxer/parser with no decoder; `decodeFrames` throws `"decodeFrames not supported (no decoder — pair with WebCodecs)"` (`src/engines/mp4box/adapter.ts:953-954`). Correctly cannot run a decode op.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest. Parser emits encoded samples only; `decodeFrames` throws `"decodeFrames not supported (no decoder; emits encoded samples only)"` (`src/engines/remotion-media-parser/adapter.ts:556-557`).

## Anti-cheat validation

- Scenario definition: `src/scenarios/robustness/index.ts:275-284` (`id: 'fuzz_mp4_zeroed_spans_decode'`, `op: 'decodeFrames'`, `asset: 'fuzz_mp4_zeroed_spans.mp4'`, `videoCodecs: ['h264']`, `options: { maxFrames: 60, gracefulAllowOutput: true }`, `notes: "Six 2KB zeroed payload spans: decoder must error or conceal, bounded in time and memory."`).
- Fixture: `fixtures/media/fuzz_mp4_zeroed_spans.mp4` **exists** (`stat` → 31 MB). Real corrupted H.264/MP4, not synthetic/empty/mock.
- Oracle: `graceful-failure` in `src/core/oracles.ts:2586-2628`. It is a robustness *smoke/safety* gate, not a correctness gate: PASS is granted either for no-output-after-a-caught-throw (`:2608`) or, when `gracefulAllowOutput` is set, for any returned partial output (`:2611-2612`). It does no comparison against a golden, no SSIM, no frame count check. This is appropriate for a fuzz/robustness case (the point is "don't crash/hang/OOM"), but it is inherently loose — almost any non-crashing behaviour passes.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2649-2735` — genuine ffmpeg.wasm decode (`this.run(args)` at `:2703` invokes the real WASM decoder; output is read back and hashed at `:2705-2722`). No canned output, no input→output copy, no golden short-circuit, no error swallowing that fakes success.
- Cached note: ffmpeg-wasm's result has `cached: true` (`reason: "cached previous PASS result"`); all five PASS rows are cached, as are both NA rows by virtue of declaration. The evidence is therefore *reused*, not freshly re-run — staleness risk applies (per the launcher seeding caveat, stale PASS can be reused; a fully honest fresh verdict would require clearing the raw + `.browser-cache`).
- Verdict: **WEAK-GATE.** The fixture is real and ffmpeg-wasm's implementation is real, but the gating oracle is a non-comparative robustness smoke gate that cannot distinguish strong from weak handling — five engines pass it on two qualitatively different behaviours. The PASS is real; it is just not a strong correctness signal, and the winner is chosen on the *quality* of the graceful path (concealment vs bail-out), not on any measured tolerance.

## Confidence & caveats

Confidence: medium. The PASS/NA classifications, the conceal-vs-reject distinction, and the adapter code path are all directly verifiable from the shard and source. Caveats: (1) the winner is decided by oracle-detail wording (conceal vs no-output) rather than a numeric margin, since this scenario carries no `bench{}`/`primaryMetric` — a reasonable reviewer could rank a fast clean *reject* (web-demuxer, 102 ms) above a slow *conceal* if "bounded in time" is weighted heavily; (2) all evidence is cached, so values may be stale; (3) the graceful-failure oracle is loose by design, so "best" here means "best-quality graceful behaviour for a fuzz input," not best decode fidelity.
