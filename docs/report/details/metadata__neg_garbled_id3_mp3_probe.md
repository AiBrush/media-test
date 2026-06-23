# metadata/neg_garbled_id3_mp3_probe

- **Family:** metadata
- **Fixture asset:** `fixtures/media/metadata_garbled_id3_mp3.mp3` (real, 64 KB; ID3v2.4 header with garbled extended-header/flag bytes, followed by an `fffb` MPEG-1 Layer III sync frame and a `Xing` VBR header)
- **Operation / primaryMetric:** `probe` / `wall` (scenario metrics: `wall`, `peakMemory`)
- **Oracle gate:** `graceful-failure` (with `gracefulAllowOutput: true`)
- **passCount:** 4 of 7

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — 4 engines PASS (mediabunny, remotion-webcodecs, remotion-media-parser, ffmpeg.wasm), all satisfying the identical single oracle `graceful-failure`.
- **Decisive factor:** Correctness strength is a TIE — every passing engine cleared exactly the same lone oracle (`graceful-failure`), which is a robustness/smoke gate, not a correctness gate. The win therefore falls to performance on the primaryMetric `wall`. mediabunny posts the lowest probe time at `durationMs=9` (no `bench{}` block was emitted for this scenario — all four results are `cached`, so only `durationMs` is available as the wall proxy).
- **Margin over runner-up:** mediabunny 9 ms vs remotion-webcodecs 10 ms → **1.11x faster** wall (effectively a wash). Versus remotion-media-parser 15 ms → **1.67x**; versus ffmpeg.wasm 145 ms → **16.1x**. Margin caveat: these are single cached `durationMs` values (n effectively 1, no `mad`/`p95`/`samples`), so the 9-vs-10 ms gap is within noise and the win is weak evidence.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 9 ms | n/a (no bench) | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 10 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:pass | 15 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 145 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |

No `bench{}` object is present in any engine entry for this scenario; `throughputRealtime`/`peakMemory`/`longtasks` were not recorded (only `durationMs`). All values above are taken verbatim from the shard.

## Why the winner wins (deep technical)

This is a NEGATIVE/fuzz scenario: the input is a real MP3 whose leading tag region (ID3v2.4 header + flags) has been deliberately corrupted, while the actual MPEG audio payload — the `fffb 5000` MPEG-1 Layer III frame sync and the `Xing` VBR table at offset 0x38 — remains valid. The required behavior (`notes` in `src/scenarios/metadata/write-roundtrip.ts:228-231`) is GRACEFUL handling: probe may either reject cleanly OR recover by ignoring the corrupt tag region and returning safe structural metadata. `gracefulAllowOutput: true` (`src/scenarios/metadata/write-roundtrip.ts:226`) makes "returned safe structural metadata without crash/hang" a PASS as well as a clean throw.

The oracle `graceful-failure` (`src/core/oracles.ts:2586-2623`) does NOT compare against a golden. For this scenario it routes through the `hasGracefulSignal` branch (the scenario lists `graceful-failure` in its oracles, line 2606), then `gracefulAllowsReturnedOutput(ctx)` returns true because `options.gracefulAllowOutput === true` (`src/core/oracles.ts:2625-2628`), so the engine PASSes by "operation returned partial/safe output and did not crash/hang" (line 2612) — which is exactly the `detail` string recorded for all four passing engines. Correctness strength is therefore identical across the four: one smoke/robustness oracle, no measurements, no structural assertions.

Because correctness is a four-way tie, the ranking is decided purely on performance (decision step 4b). mediabunny's probe path is genuine and lightweight: `probe()` (`src/engines/mediabunny/adapter.ts:1134-1141`) opens the input via `openInput` and calls `metadataFromInput`, then disposes — a header/metadata-tier read with no full packet walk. mediabunny's `ALL_FORMATS` includes the MP3 input format and `probe()` opens with no container hint (`src/engines/mediabunny/adapter.ts:19,1034`), so it auto-detects the MPEG sync and reads structural metadata while tolerating the garbled ID3 head. That metadata-first design yields the lowest wall time (`durationMs=9`). remotion-webcodecs is statistically indistinguishable at 10 ms (1.11x). remotion-media-parser's read-only CPU-JS `parseMedia` metadata-only tier (`src/engines/remotion-media-parser/adapter.ts:188-197`, `configUsed.fieldsTier: "metadata-only"`, `backend: "cpu-js"`) is slightly slower at 15 ms. ffmpeg.wasm is far slower at 145 ms — the single-thread wasm module (`wasmThreads:0`) must instantiate/feed its full libavformat MP3 demuxer in-VM to probe, a ~16x wall penalty for an equivalent verdict.

Tiebreaker notes (decision 4c) reinforce mediabunny: its config requires no COOP/COEP and no SharedArrayBuffer (`configUsed.coopCoep: "not-required"`, `sharedArrayBuffer: false`), uses a pure-TS ESM core (`coreBuild: "pure-ts-esm"`), and streams (`pipeline: "streaming-lockstep"`) — a smaller, dependency-light deployment than the ffmpeg.wasm runtime, and a pure-JS parse rather than a wasm VM round-trip.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASSed (graceful-failure), but lost on wall: `durationMs=10` vs 9 (1.11x slower, within measurement noise; effectively a tie it narrowly lost). No correctness deficit.
- **remotion-media-parser@4.0.479** — PASSed (graceful-failure), lost on wall: `durationMs=15` (1.67x slower). CPU-JS metadata-only path is correct but slower than mediabunny's open+metadata read.
- **ffmpeg.wasm@0.12.15** — PASSed (graceful-failure), lost decisively on wall: `durationMs=145` (16.1x slower). Single-thread wasm libavformat probe pays a large fixed VM/demuxer cost for the same verdict.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'mp3'". HONEST — `src/engines/platform/adapter.ts:240` declares `containersIn: ['mp4','mov','webm','mkv','wav']`; no `mp3`. WebCodecs/MediaSource has no first-class raw-MP3 demux surface, so the non-declaration is legitimate.
- **mp4box@2.3.0** — NA_ENGINE: same reason. HONEST — `src/engines/mp4box/adapter.ts:645` declares `containersIn: ['mp4','mov']` only; MP4Box.js is an ISO-BMFF parser and genuinely cannot parse a raw MP3 elementary stream.
- **web-demuxer@4.0.0** — NA_ENGINE: same reason. HONEST — `src/engines/web-demuxer/adapter.ts:639` declares `containersIn: ['mp4','mov','mkv','webm','ts']`; no `mp3`. Not an under-declaration for this fixture.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/metadata/write-roundtrip.ts:220-232` (`META_NEGATIVE_CASES[0]`, `id: 'neg_garbled_id3_mp3_probe'`), built via `buildNegative` at `src/scenarios/metadata/_shared.ts:264-281` → op `probe`, oracle `graceful-failure`, `options.gracefulAllowOutput: true`.
- **Fixture exists & is real:** `fixtures/media/metadata_garbled_id3_mp3.mp3`, 64 KB. Header bytes confirm a genuine MP3: `4944 33` (`ID3`) v2.4 with garbled flag/size bytes, then `fffb 5000` (MPEG-1 Layer III frame sync) and a `Xing` VBR header at 0x38 — a plausible real-media corrupt-tag fixture, not synthetic/empty/mock.
- **Winner implementation genuine:** `src/engines/mediabunny/adapter.ts:1134-1141` — `probe()` calls real `openInput(this.lib, input)` + `metadataFromInput(mbInput)` and disposes; it does not return canned output, copy input, short-circuit to a golden, or swallow errors. The real library auto-detects format from `ALL_FORMATS`.
- **Oracle:** `src/core/oracles.ts:2586-2628`. This is a robustness/smoke gate, NOT a golden comparison. It PASSes on "did not crash/hang" plus the `gracefulAllowOutput` allowance — there is no SSIM/PCM/packet-count assertion and no measurements were emitted. For a negative/fuzz case this is the appropriate gate, but it is inherently loose: any engine that opens the file without throwing passes.
- **Cached:** ALL four passing results have `cached:true` ("cached previous PASS result"); the win rests on reused single `durationMs` values (9/10/15/145), not a fresh re-run. Per the launcher seeding caveat this carries staleness risk — a fresh run could reorder the 9-vs-10 ms near-tie.
- **Verdict:** **WEAK-GATE.** Real fixture + real implementation, but the only oracle is a graceful-failure smoke/robustness gate (no correctness comparison, no measurements), and the performance tiebreak is decided on cached single-sample `durationMs` within noise of the runner-up. The PASS is real; the gate and the margin are weak.

## Confidence & caveats

- **Confidence: medium.** Fixture and adapter paths verified in code; all NA declarations confirmed honest in each adapter's `containersIn`.
- The oracle is robustness-only (no golden, no measurements), so this scenario cannot rank engines by correctness — all four are equivalent.
- No `bench{}` was recorded; `wall` is approximated by `durationMs`, and `peakMemory` (a declared metric) is absent. The 9-vs-10 ms top-two gap is within measurement noise.
- All four passing results are cached; a fresh re-run could flip the near-tied mediabunny/remotion-webcodecs ordering.
