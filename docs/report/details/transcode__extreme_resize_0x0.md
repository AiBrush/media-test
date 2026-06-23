# transcode/extreme_resize_0x0

family: transcode | fixture asset: fixtures/media/h264_1080p_30s.mp4 (31 MB, real H.264/AAC 1080p 30s MP4) | primaryMetric: wall (durationMs only; no bench block emitted) | passCount: 3 / 7

This is a **degenerate-input robustness gate**, not a real encode. The scenario asks the engine to transcode `h264_1080p_30s.mp4` with `video: { codec: 'h264', width: 0, height: 0 }`. The only oracle is `graceful-failure`, whose contract for a 0×0 target is: a clean throw/reject = PASS; any returned output = FAIL ("output for 0×0 input is suspicious", scenario notes, index.ts:1500-1502). No frame is ever decoded or encoded by the passing engines — the win is decided entirely by *whether the adapter rejects the impossible target cleanly and at what cost*.

## Verdict

- **Best framework: mediabunny@1.48.0** (PASS).
- **Contested: YES** — 3 engines PASS (mediabunny, remotion-webcodecs, ffmpeg.wasm), all passing the identical single oracle `graceful-failure`. Correctness strength is therefore a three-way tie (same oracle, same strictness — a robustness "clean throw" gate).
- **Decisive factor: performance (wall), with an early-validation / no-COOP-COEP tiebreaker.** mediabunny rejects in **7 ms**, tied with remotion-webcodecs (7 ms) and **~20.1× faster than ffmpeg.wasm (141 ms)**. mediabunny is chosen over remotion-webcodecs (the 7 ms co-leader) on tiebreaker (c): its dimension guard is the *first statement* of `transcode()` (adapter.ts:1275, before any `openInput`/codec probe), it runs on a pure-TS ESM build that requires no COOP/COEP and no SharedArrayBuffer (`coopCoep: "not-required"`, `sharedArrayBuffer: false`), whereas remotion-webcodecs reaches its guard only after audio-channel and WAV early-return branches (adapter.ts:2214-2225).
- **Margin over runner-up:** tie on wall vs remotion-webcodecs (1.0×, both n=1 cached); 20.1× lower wall than ffmpeg.wasm.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 7 | n/a | n/a | n/a | cached: graceful: mediabunny transcode rejected invalid video dimensions |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 7 | n/a | n/a | n/a | cached: graceful: Remotion WebCodecs transcode rejected invalid video dimensions |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 141 | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15 transcode rejected degenerate video dimensions |
| platform@chrome-149 | NA_ENGINE | — | 2 | n/a | n/a | n/a | transcode NA — source carries audio; MediaRecorder canvas-capture path cannot preserve/copy audio |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |

No engine emitted a `bench{}` block for this scenario (the op throws before any measured encode), so `durationMs` is the only timing signal; all three PASS rows are `cached:true`.

## Why the winner wins (deep technical)

The target `width:0, height:0` is physically un-encodable: H.264 macroblock geometry requires positive luma dimensions, and WebCodecs `VideoEncoder.configure` / a libavcodec encoder context both reject a 0-pixel frame. There is nothing to decode-resample-encode; the only correct behavior is a fast, clean rejection. So this scenario rewards a *cheap, early guard* over a deep pipeline that discovers the impossibility late.

mediabunny implements exactly that. Its `transcode()` collects `videoSpecs` and, as the **very first loop in the method**, throws on any non-positive dimension:

```
src/engines/mediabunny/adapter.ts:1275-1282
for (const spec of videoSpecs) {
  if ((spec.width !== undefined && spec.width <= 0) ||
      (spec.height !== undefined && spec.height <= 0)) {
    throw new Error('mediabunny transcode rejected invalid video dimensions');
  }
}
```

This fires *before* `openInput()` (1287), before constructing the `Output`/`Conversion`, and before any WebCodecs `isConfigSupported` probe — so the 31 MB MP4 is never demuxed and the WebCodecs hardware encoder (`backend: webcodecs`, `hwAccel: prefer-hardware`, per env.configUsed) is never touched. That is why the measured wall is **7 ms**: it is pure JS argument validation plus the harness round-trip. The runner catches the throw, leaves `ctx.output`/`ctx.metadata`/`ctx.demux`/`ctx.frames` all undefined, and `gracefulFailure()` takes the "no output for a graceful-failure scenario → PASS" branch (oracles.ts:2607-2610), producing the recorded detail "operation produced no output and did not crash/hang → handled gracefully". The measurement is physically plausible: a synchronous guard on a 1080p source, no encode, sub-10 ms.

remotion-webcodecs ties on wall (7 ms) with the same kind of guard (`videoSpec.width <= 0 || videoSpec.height <= 0 → throw`, adapter.ts:2219-2225), but it sits later in the validation chain — after the audio-channel NA check (2214) and the WAV early-return (2217). For this all-video, MP4-target case those branches are no-ops, so the *result* is identical, but mediabunny's guard is structurally earliest (entry of the method) and its runtime is the lighter one: pure-TS ESM, no COOP/COEP, no SharedArrayBuffer, no wasm threads to spin up. That is the tiebreaker (decision rule 4c).

ffmpeg.wasm also PASSes correctly and also short-circuits before wasm — its guard is `(opts.video.width <= 1 || opts.video.height <= 1) → throw 'transcode rejected degenerate video dimensions'` (adapter.ts:2188-2190), which catches 0×0 (and 1×1) before any `ff.exec`. But its measured wall is **141 ms** vs 7 ms. The gap is the ffmpeg.wasm engine's heavier per-call overhead (single-thread wasm core init / module readiness, classic-worker wrapping noted in the adapter header comment, ffmpeg FS plumbing) even on a path that never reaches `ffmpeg -i`. Same correctness, 20.1× the cost — so it loses the performance tiebreaker.

Net: with correctness tied at the weakest rung of the ladder (a robustness throw-gate, no bit-exact/structural/perceptual comparison possible), the contest collapses to "who rejects fastest and cheapest," and mediabunny's first-statement guard on the lightest runtime takes it.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 — PASS, lost on tiebreaker.** Correct clean reject (adapter.ts:2219-2225), tied wall (7 ms). Loses only because its guard is positioned after audio/WAV branches and its runtime is heavier than mediabunny's pure-TS ESM; no metric gap (1.0× wall).
- **ffmpeg.wasm@0.12.15 — PASS, lost on performance.** Correct clean reject before wasm (adapter.ts:2188-2190), but 141 ms vs 7 ms = **20.1× slower wall**. The cost is wasm/worker plumbing overhead, not encode work (it never reaches `ffmpeg -i`).
- **platform@chrome-149 — NA_ENGINE (honest).** Reason: the source carries an AAC audio track and the platform transcode path is `<video>→canvas→MediaRecorder`, which cannot preserve/copy audio. This is an honest capability NA: MediaRecorder canvas-capture genuinely has no audio-passthrough route. (Note: it NAs for an *audio* reason rather than ever evaluating the 0×0 dimension, so it never reaches the degenerate-dimension question — still a defensible NA, not under-declared.)
- **remotion-media-parser@4.0.479 — NA_ENGINE (honest).** Does not declare the `transcode` operation. remotion-media-parser is a demux/parse library with no encoder; honest under-the-contract NA, not an under-declared capability.
- **web-demuxer@4.0.0 — NA_ENGINE (honest).** Does not declare `transcode`. It is a demuxer only (libav demux to packets); no encode path exists. Honest NA.
- **mp4box@2.3.0 — NA_ENGINE (honest).** Does not declare `transcode`. mp4box.js is an ISO-BMFF box mux/demux tool with no video encoder; honest NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:1484-1503` — `id: 'transcode/extreme_resize_0x0'`, `op: 'transcode'`, `input: 'h264_1080p_30s.mp4'`, `options: { container:'mp4', video:{ codec:'h264', width:0, height:0 } }`, `oracles: ['graceful-failure']`. Notes (1500-1502) explicitly state output for 0×0 is suspicious → FAIL, so the gate is *meaningfully directional* (a faked copy-through would FAIL, not PASS).
- **Fixture exists / real:** `fixtures/media/h264_1080p_30s.mp4`, 31 MB real H.264/AAC 1080p 30s clip (stat confirmed). Not synthetic/empty/mock.
- **Winner adapter genuinely implements the path:** `src/engines/mediabunny/adapter.ts:1271-1282` — the guard is a real `<= 0` numeric check at method entry that throws a real `Error`; it does **not** return canned output, copy input→output, short-circuit to a golden, or swallow an error and report success. The throw is the success signal here. (Co-leaders likewise genuine: remotion-webcodecs adapter.ts:2219-2225; ffmpeg.wasm adapter.ts:2188-2190.)
- **Oracle is real / not trivially satisfiable:** `src/core/oracles.ts:2586-2623` `gracefulFailure()` — PASS only when the op produced NO output (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`, line 2608) for a graceful-failure scenario; an engine that emitted a 0×0 blob would hit the FAIL branch (2614-2617). It is not a smoke gate and not width-tolerant; it directly inverts the normal "threw = fail" semantics for exactly this robustness class.
- **Cached note:** all three PASS results are `cached:true` (mediabunny startedAt 14:01:57Z, ffmpeg.wasm 14:03:23Z, remotion-webcodecs 16:49:42Z). The verdict reuses cached evidence; the guards are deterministic synchronous checks with no media I/O, so staleness risk is low — but the 7 ms figures were not freshly re-measured this run.
- **Verdict: REAL.** Real 31 MB fixture, three genuine early-reject implementations, a directional oracle that fails on emitted output. The only softness is that the winning oracle is the *weakest rung* (robustness throw-gate, no correctness comparison is even possible for a 0×0 target) — that is inherent to the scenario, not a gaming artifact, so it does not drop to WEAK-GATE.

## Confidence & caveats

- **Confidence: medium.** The PASS/NA classifications and the 20.1× ffmpeg gap are unambiguous from the shard and code. The mediabunny-vs-remotion-webcodecs call is a genuine tie on the only numeric signal (7 ms each, n=1, cached); the winner is decided on a structural tiebreaker (earliest guard, lightest runtime, no COOP/COEP), which is defensible but not metric-decisive.
- **Caveats:** (1) No `bench{}` block — only single-sample `durationMs`; spread/p95/mad unknown, so timing evidence is weak (n=1). (2) All PASS rows are cached, not re-run this session. (3) This is a robustness throw-gate; "best" means "rejects the impossible target most cheaply," not "best transcoder" — do not generalize this winner to real-encode transcode scenarios. (4) platform's NA is keyed on audio passthrough and never reaches the dimension check, so it is untested against 0×0 specifically.
